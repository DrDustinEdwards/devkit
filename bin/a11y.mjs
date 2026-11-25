#!/usr/bin/env node
// devkit-a11y: the live accessibility check (area 9). It loads a site's home page, a 404 and up to --max-pages sitemap
// pages of different types in Chromium and measures each: axe-core (WCAG 2.2 A and AA plus best practice) at 1440 and
// 390 px in light and dark, a 40-press Tab walk, reflow at 320 px, WCAG 1.4.12 text spacing, animations under reduced
// motion, Escape on the menus and dialogs the walk reaches, axe and focus again in forced colors, a 720 px proxy for 200%
// zoom, and the page's structure; then the site's /accessibility statement. bin/a11y-judge.mjs turns the measurements
// into findings, each titled with the checklist item it proves (L1 to L4, S2, S3, S6).
//
//   devkit-a11y --origin https://example.com [--from https://preview.example.workers.dev] [--max-pages 8]
//
// --from loads the pages from where the site is served now; the sitemap's URLs on --origin are read there too. Each
// finding is a GitHub annotation; exit 0 with no errors, 1 with errors, 3 when nothing failed but something could not be
// measured (no browser, a page or a view axe could not scan), each such item a `::notice title=<item>::<url> could not
// measure: <reason>` in devkit-live's form, and 2 when the site did not answer. Read-only: it never signs in and never
// submits a form.
//
// It needs `playwright` and `@axe-core/playwright`, which this package does not install (it has no dependencies): they
// are found from the working directory's package first, then beside devkit, then NODE_PATH. Chromium comes from
// `npx playwright install --with-deps chromium`, as live.yml does. When the installed Playwright's own Chromium build is
// missing (a Playwright version other than the one whose browser was installed), it launches the newest Chromium build
// Playwright installed (PLAYWRIGHT_BROWSERS_PATH, else ~/.cache/ms-playwright), or DEVKIT_A11Y_CHROMIUM when set, and
// says which; with none, every item is reported not measured, with the reason.

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { annotation, judgeSite, pickPages } from "./a11y-judge.mjs";
import { locs } from "./warm.mjs";
import { load } from "./a11y/page.mjs";
import { scanPage } from "./a11y/checks.mjs";

/** @typedef {import("./a11y/page.mjs").Page} Page */

async function fetchText(/** @type {string} */ url) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    return { status: response.status, text: response.ok ? await response.text() : "" };
  } catch (error) {
    return { status: 0, text: "", error: /** @type {Error} */ (error).message };
  }
}

/** The sitemap's URLs (a sitemap index followed to its first five children), moved from origin to base. */
async function sitemapUrls(/** @type {string} */ origin, /** @type {string} */ base) {
  // Same origin by the parsed URL, not by prefix: https://example.com.evil.test starts with https://example.com.
  const same = (/** @type {string} */ url) => {
    try {
      return new URL(url).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  };
  const move = (/** @type {string} */ url) => {
    const u = new URL(url);
    return base + u.pathname + u.search;
  };
  const { text } = await fetchText(`${base}/sitemap.xml`);
  if (!/<sitemapindex/i.test(text)) return locs(text).filter(same).map(move);
  const urls = [];
  for (const child of locs(text).filter(same).slice(0, 5))
    urls.push(
      ...locs((await fetchText(move(child))).text)
        .filter(same)
        .map(move),
    );
  return urls;
}

/** The checklist items a run measures, each reported not measured when no page could be scanned at all. */
const ITEMS = ["L1", "L2", "L3", "L4", "S2", "S3", "S6"];

/**
 * Chromium for this Playwright: its own build, else the newest build Playwright installed (a Playwright release other than
 * the one whose browser is installed looks for a build number that is not there), else DEVKIT_A11Y_CHROMIUM. The browser,
 * or why none started.
 */
async function launch(/** @type {any} */ chromium) {
  const paths = [process.env.DEVKIT_A11Y_CHROMIUM, ...installedBuilds()].filter(Boolean);
  let why = "";
  for (const executablePath of [undefined, ...paths]) {
    try {
      const browser = await chromium.launch(executablePath ? { executablePath } : {});
      if (executablePath)
        console.error(
          `devkit-a11y: this Playwright's own Chromium is not installed; using ${executablePath} (${browser.version()})`,
        );
      return browser;
    } catch (error) {
      why ||= String(error).split("\n")[0];
    }
  }
  return why || "no Chromium";
}

/** The Chromium executables Playwright installed, newest build first. */
function installedBuilds() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");
  let names = [];
  try {
    names = readdirSync(root).filter((name) => /^chromium-\d+$/.test(name));
  } catch {
    return [];
  }
  names.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const candidates = names.flatMap((name) =>
    [
      "chrome-linux64/chrome",
      "chrome-linux/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-win/chrome.exe",
    ].map((exe) => join(root, name, exe)),
  );
  return candidates.filter((path) => existsSync(path));
}

export async function main() {
  const { values } = parseArgs({
    options: {
      origin: { type: "string" },
      from: { type: "string" },
      "max-pages": { type: "string", default: "8" },
    },
  });
  if (!values.origin) {
    console.error(
      "usage: devkit-a11y --origin https://example.com [--from https://preview.example] [--max-pages 8]",
    );
    return 2;
  }
  const origin = values.origin.replace(/\/$/, "");
  const base = values.from?.replace(/\/$/, "") ?? origin;
  const playwright = load("playwright");
  const axeModule = load("@axe-core/playwright");
  if (!playwright || !axeModule) {
    console.error(
      "devkit-a11y: needs playwright and @axe-core/playwright installed where it runs (npm i -D playwright @axe-core/playwright)",
    );
    return 2;
  }
  const AxeBuilder = axeModule.default ?? axeModule.AxeBuilder ?? axeModule;
  const home = await fetchText(`${base}/`);
  if (home.status === 0 || home.status >= 500) {
    console.error(`devkit-a11y: ${base} did not answer: ${home.error ?? home.status}`);
    return 2;
  }
  const max = Number(values["max-pages"]);
  let picks = pickPages(base, await sitemapUrls(origin, base), max);
  if (picks.length < 3) {
    // A sitemap of one or two pages: the home page's own links fill it out.
    const links = [...home.text.matchAll(/href="([^"#]+)"/g)].map((m) => m[1]);
    picks = pickPages(base, [...picks.map((p) => p.url), ...links], max);
  }
  const browser = await launch(playwright.chromium);
  if (typeof browser === "string") {
    for (const item of ITEMS)
      console.log(
        annotation({
          severity: "unmeasured",
          item,
          url: `${base}/`,
          detail: `Chromium did not start (npx playwright install --with-deps chromium): ${browser}`,
        }),
      );
    return 3;
  }
  /** @type {Record<string, any>[]} */
  const pages = [];
  try {
    for (const target of [
      { url: `${base}/`, why: "home" },
      { url: `${base}/no-such-page-devkit-a11y`, why: "404" },
      ...picks,
    ]) {
      console.error(`devkit-a11y: ${target.url}`);
      pages.push(await scanPage(browser, AxeBuilder, target));
    }
  } finally {
    await browser.close();
  }
  // A home page that stopped part way is still judged on what it measured; one that measured nothing is not.
  if (pages[0].error && !Object.keys(pages[0].axe ?? {}).length && !pages[0].basics) {
    for (const item of ITEMS)
      console.log(
        annotation({
          severity: "unmeasured",
          item,
          url: pages[0].url,
          detail: `the home page could not be scanned: ${pages[0].error}`,
        }),
      );
    return 3;
  }
  const statement = {
    url: `${base}/accessibility`,
    status: (await fetchText(`${base}/accessibility`)).status,
  };
  const findings = judgeSite({
    statement,
    pages: /** @type {import("./a11y-judge.mjs").PageScan[]} */ (pages),
  });
  for (const finding of findings) console.log(annotation(finding));
  const errors = findings.filter((f) => f.severity === "error").length;
  const unmeasured = findings.filter((f) => f.severity === "unmeasured").length;
  const items = Object.entries(Object.groupBy(findings, (f) => f.item))
    .map(([item, list]) => `${item} ${list?.length}`)
    .join(", ");
  console.log(
    `devkit-a11y: ${pages.length} pages on ${base}; ${errors} errors, ${findings.length - errors - unmeasured} warnings, ${unmeasured} not measured${items ? ` (${items})` : ""}.`,
  );
  return errors > 0 ? 1 : unmeasured > 0 ? 3 : 0;
}

process.exitCode = await main().catch((error) => {
  console.error(`devkit-a11y: ${error?.stack ?? error}`);
  return 2;
});
