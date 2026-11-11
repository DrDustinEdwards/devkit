#!/usr/bin/env node
// The live gate's verify command for worker-deploy.yml (`verify-command`), run once /health reports this run's commit. It
// decides one thing: whether the new version is broken enough to roll back. Exit 0 passes, 1 refuses (worker-deploy rolls
// the Worker back), 3 could not decide (the job fails and production is left as it is).
//
//   devkit-verify-deploy https://example.com
//   devkit-verify-deploy https://example.com --page /colophon --health /health --assets
//
//   <origin>          required, https only (http://localhost is allowed for tests)
//   --page <path>     a page that must answer 200 (repeatable; default "/")
//   --health <path>   a JSON /health whose `status` must not be "fail" (a warn is not a reason to roll back)
//   --assets          every content-hashed /assets/*.js and *.css the first page names must answer 200. A rollout takes
//                     minutes to reach every colo, and a colo still on the previous version names that version's assets;
//                     that is a rollout that has not converged, not a bad build, so it ends in exit 3, never a rollback.
//   --attempts <n>    reads before giving up (default 1; 30 with --assets), --wait-ms <n> between them (default 10000)
//
// A refusal is a page that answers anything but 200 (a redirect counts, since no verify read follows one) or a /health
// whose status is `fail` or missing. A read that could not be made at all (no answer, a timeout) is exit 3. Every read
// carries a cache-busting query and `cache-control: no-cache`, so no edge copy answers for the Worker; EXPECT_SHA, when set,
// makes the query unique per run.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** @typedef {{ status: number, text: string, error: string }} Read */

/**
 * @param {string} origin
 * @param {string} path
 * @param {string} tag
 * @returns {Promise<Read>}
 */
async function read(origin, path, tag) {
  try {
    const res = await fetch(`${origin}${path}${path.includes("?") ? "&" : "?"}verify=${tag}`, {
      headers: { "user-agent": "deploy-verify", "cache-control": "no-cache" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, text: res.status === 200 ? await res.text() : "", error: "" };
  } catch (e) {
    return { status: 0, text: "", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The verdict from what was read: 0 passes, 1 refuses, 3 could not decide.
 * @param {{ pages: (Read & { path: string })[], health: (Read & { path: string }) | null, assetProblems: string[] | null }} got
 * @returns {{ code: 0 | 1 | 3, lines: string[] }}
 */
export function verdict(got) {
  const reads = [...got.pages, ...(got.health ? [got.health] : [])];
  const unreachable = reads.filter((r) => r.error);
  if (unreachable.length > 0)
    return { code: 3, lines: unreachable.map((r) => `${r.path} could not be read: ${r.error}`) };
  const lines = [];
  let code = /** @type {0 | 1 | 3} */ (0);
  for (const p of got.pages) {
    lines.push(`${p.path} answered ${p.status}`);
    if (p.status !== 200) code = 1;
  }
  if (got.health) {
    let status = "";
    try {
      status = String(JSON.parse(got.health.text)?.status ?? "");
    } catch {
      status = "";
    }
    lines.push(
      `${got.health.path} answered ${got.health.status} with status ${status || "(none)"}`,
    );
    if (status === "fail" || !status) code = 1;
  }
  if (code === 0 && got.assetProblems) {
    if (got.assetProblems.length > 0) {
      lines.push(`assets not answering 200: ${got.assetProblems.join(", ")}`);
      code = 3;
    } else lines.push("every hashed asset the first page names answers 200");
  }
  return { code, lines };
}

/** @param {string[]} argv */
function parse(argv) {
  /** @type {{ origin: string, pages: string[], health: string, assets: boolean, attempts: number | null, waitMs: number }} */
  const o = { origin: "", pages: [], health: "", assets: false, attempts: null, waitMs: 10_000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--page") o.pages.push(argv[++i] ?? "");
    else if (a === "--health") o.health = argv[++i] ?? "";
    else if (a === "--assets") o.assets = true;
    else if (a === "--attempts") o.attempts = Number(argv[++i]);
    else if (a === "--wait-ms") o.waitMs = Number(argv[++i]);
    else if (!a.startsWith("-") && !o.origin) o.origin = a.replace(/\/+$/, "");
    else return { error: `unknown argument ${a}` };
  }
  if (
    !/^https:\/\/[^/]+$/.test(o.origin) &&
    !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(o.origin)
  )
    return {
      error:
        "usage: devkit-verify-deploy <https://origin> [--page /p]... [--health /health] [--assets]",
    };
  if (o.pages.length === 0) o.pages.push("/");
  if (o.pages.some((p) => !p.startsWith("/")) || (o.health && !o.health.startsWith("/")))
    return { error: "a path starts with /" };
  const attempts = o.attempts ?? (o.assets ? 30 : 1);
  if (!Number.isInteger(attempts) || attempts < 1 || !Number.isFinite(o.waitMs) || o.waitMs < 0)
    return { error: "--attempts is a positive integer and --wait-ms is not negative" };
  return { ...o, attempts };
}

async function main() {
  const o = parse(process.argv.slice(2));
  if ("error" in o) {
    console.error(o.error);
    process.exit(2);
  }
  const sha = (process.env.EXPECT_SHA ?? "").slice(0, 12) || String(Date.now());
  /** @type {{ code: 0 | 1 | 3, lines: string[] }} */
  let result = { code: 3, lines: ["no attempt ran"] };
  for (let n = 1; n <= o.attempts; n++) {
    const tag = `${sha}-${n}`;
    const pages = await Promise.all(
      o.pages.map(async (path) => ({ path, ...(await read(o.origin, path, tag)) })),
    );
    const health = o.health ? { path: o.health, ...(await read(o.origin, o.health, tag)) } : null;
    /** @type {string[] | null} */
    let assetProblems = null;
    if (o.assets && pages[0].status === 200) {
      const refs = [
        ...new Set(pages[0].text.match(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g) ?? []),
      ];
      assetProblems = refs.length === 0 ? ["the first page names no hashed assets"] : [];
      for (const ref of refs) {
        const r = await read(o.origin, ref, tag);
        if (r.status !== 200) assetProblems.push(`${ref} (${r.status || "no answer"})`);
      }
    }
    result = verdict({ pages, health, assetProblems });
    if (o.attempts > 1) console.log(`attempt ${n}: ${result.lines.join("; ")}`);
    if (result.code === 0) break;
    if (n < o.attempts) await new Promise((r) => setTimeout(r, o.waitMs));
  }
  for (const line of result.lines) console.log(line);
  if (result.code === 1) console.log("REFUSED: the new version does not serve the site.");
  if (result.code === 3)
    console.log("COULD NOT DECIDE: nothing was rolled back, and production is left as it is.");
  process.exit(result.code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  await main();
