#!/usr/bin/env node
// Warm the stored pages after a deploy, for a site that deploys outside the shared deploy (worker-deploy.yml warms its
// own sites in its "Warm the stored pages" step, the same loop). Reads <origin>/sitemap.xml, follows a sitemap index one
// level, and fetches every page on the origin (at most 1000, four at a time), so the first reader of each gets a stored
// page rather than a render. A site with no sitemap warms nothing. Never fails: a warm that cannot finish is a warning.
//
//   npx devkit-warm https://example.com                 warm now
//   npx devkit-warm https://example.com --sha <sha>     first wait (up to 10 minutes) until <origin>/health names <sha>,
//                                                        for a deploy that goes live after the command returns
//                                                        (Workers Builds, or a rollout still reaching every colo)

import { isMain } from "../node/index.mjs";

const MAX_PAGES = 1000;
const WORKERS = 4;
const TIMEOUT_MS = 30_000;

/** The <loc> values of a sitemap's text, with the XML `&amp;` of a query string undone. */
export const locs = (/** @type {string} */ xml) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

/** The <loc> values of the sitemap at `url`, or none when it does not answer 200. */
async function fetchLocs(/** @type {string} */ url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? locs(await res.text()) : [];
  } catch {
    return [];
  }
}

/** Whether a URL is on the origin, by the parsed origin: https://example.com.evil.test only starts with it. */
const onOrigin = (/** @type {string} */ url, /** @type {string} */ origin) => {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
};

/** Every page the sitemap names on this origin, an index followed one level, at most MAX_PAGES. */
export async function sitemapPages(/** @type {string} */ origin) {
  const top = await fetchLocs(`${origin}/sitemap.xml`);
  const pages = top.filter((u) => !/\.xml(\?|$)/.test(u));
  for (const index of top.filter((u) => /\.xml(\?|$)/.test(u) && onOrigin(u, origin)))
    pages.push(...(await fetchLocs(index)));
  return [...new Set(pages)].filter((u) => onOrigin(u, origin)).slice(0, MAX_PAGES);
}

/** Fetch each page once, WORKERS at a time; the count that answered 200. */
export async function warm(/** @type {string[]} */ pages) {
  const queue = [...pages];
  let stored = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (res.ok) stored++;
          await res.arrayBuffer().catch(() => {});
        } catch {
          /* a page that does not answer is not stored */
        }
      }
    }),
  );
  return stored;
}

/** True once <origin>/health reports this sha, polling every 10 s for up to ten minutes. */
async function waitForSha(/** @type {string} */ origin, /** @type {string} */ sha) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(
      () => null,
    );
    const live = res?.ok
      ? await res.json().then(
          (b) => b?.sha,
          () => null,
        )
      : null;
    if (typeof live === "string" && live.startsWith(sha.slice(0, 7))) return true;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return false;
}

async function main(/** @type {string[]} */ argv) {
  const origin = argv.find((a) => /^https?:\/\//.test(a))?.replace(/\/+$/, "");
  const shaAt = argv.indexOf("--sha");
  const sha = shaAt >= 0 ? argv[shaAt + 1] : "";
  if (!origin) {
    console.error("usage: devkit-warm <origin> [--sha <commit>]");
    return 1;
  }
  // A short sha names every commit that starts with it, so the wait would end on the wrong deploy.
  if (shaAt >= 0 && !/^[0-9a-f]{7,40}$/i.test(sha ?? "")) {
    console.error("devkit-warm: --sha needs at least 7 hex characters of the commit");
    return 1;
  }
  if (sha && !(await waitForSha(origin, sha))) {
    console.log(
      `::warning::${origin}/health never named ${sha.slice(0, 12)}; warming what is live`,
    );
  }
  const pages = await sitemapPages(origin);
  const stored = await warm(pages);
  console.log(`warmed ${stored} of ${pages.length} sitemap pages on ${origin}`);
  return 0;
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.log(`::warning::warming the stored pages did not finish: ${error?.message ?? error}`);
      process.exit(0);
    },
  );
}
