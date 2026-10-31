#!/usr/bin/env node
// The route weight report. Reads a React Router client build's route manifest (build/client/assets/manifest-*.js) and
// reports, per route that renders a page, the gzip bytes of the JS and CSS a first visit downloads: the client entry and
// its imports, then every route from root down to this one with its module, imports and stylesheets, each file counted
// once and gzipped at level 9. Chunks loaded later through import() are not in the manifest and are not counted; nor are
// fonts and images. A route over the budget, or grown past the baseline, is a ::warning:: line and the run passes, unless
// the config sets `enforce`: then each is an ::error:: and the run fails (exit 1), and a config with no `budget_bytes`
// fails too, since an enforced report with no budget would pass anything. A missing build, a manifest naming a file the build lacks, or a config that is not JSON fails (exit 1): a report
// that read nothing must not look like a clean one. The table goes to the job summary.
//
// A site that hydrates only the routes that ask (`export const handle = { hydrate: true }`, with devkit's siteScript
// serving /site.js to every other page) is read as such when the build has a /site.js: a route whose chain declares
// `hydrate: true` weighs as above, and any other route weighs /site.js and its chain's stylesheets, which is what its
// page downloads. Islands load through import() and are not counted.
//
//   npx devkit-route-weight                     report against .route-weight.json (no file: the report alone)
//   npx devkit-route-weight --client <dir>      another client build (default build/client)
//   npx devkit-route-weight --config <file>     another config
//   npx devkit-route-weight --write-baseline    measure and record each route's total as the config's baseline
//
// The config, every field optional:
//
//   {
//     "linked_css": true,
//     "enforce": true,
//     "budget_bytes": 160000,
//     "growth": { "ratio": 0.05, "bytes": 1024 },
//     "baseline": { "measured_at": "abc1234", "routes": { "routes/home": 118230 } }
//   }
//
// `linked_css` also counts a stylesheet the counted JS names by URL (a root that links app.css through `?url`). A route
// grown past its baseline warns when it grew by more than `growth.ratio` of the baseline and more than `growth.bytes`
// (defaults 0.05 and 1024).

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * @typedef {{ id: string, parentId?: string, path?: string, module?: string, imports?: string[], css?: string[],
 *   hasDefaultExport?: boolean }} ManifestRoute
 * @typedef {{ entry: { module: string, imports?: string[], css?: string[] }, routes: Record<string, ManifestRoute> }} Manifest
 * @typedef {{ id: string, path: string, js: number, css: number, total: number }} Row
 * @typedef {{ linked_css?: boolean, enforce?: boolean, budget_bytes?: number, growth?: { ratio?: number, bytes?: number },
 *   baseline?: { measured_at?: string, routes?: Record<string, number> } }} Config
 */

/** A route module's `handle = { hydrate: true }`, as the build writes it (`{hydrate:!0}`) or as written. */
const HYDRATE = /[{,]\s*hydrate\s*:\s*(?:!0|true)\s*[,}]/;

/** The manifest object from the text of manifest-*.js (`window.__reactRouterManifest={...};`). */
export function parseManifest(/** @type {string} */ text) {
  return /** @type {Manifest} */ (JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
}

/**
 * One row per route with a default export (a resource route loads no page; root is in every row), heaviest first.
 * @param {Manifest} manifest
 * @param {(url: string) => Buffer} read the bytes of a file named as the manifest names it ("/assets/x.js")
 * @param {(bytes: Buffer) => number} gzip the compressed size
 * @param {boolean} [linkedCss] also count a stylesheet the counted JS names by URL
 * @param {string} [siteScript] the build's /site.js, when it has one: a route whose chain does not declare
 *   `hydrate: true` loads it in place of React
 * @returns {Row[]}
 */
export function routeWeights(manifest, read, gzip, linkedCss = false, siteScript = undefined) {
  /** @type {Map<string, { bytes: Buffer, gzip: number }>} */
  const files = new Map();
  const file = (/** @type {string} */ url) => {
    if (!files.has(url)) {
      const bytes = read(url);
      files.set(url, { bytes, gzip: gzip(bytes) });
    }
    return /** @type {{ bytes: Buffer, gzip: number }} */ (files.get(url));
  };
  const sum = (/** @type {Set<string>} */ urls) => [...urls].reduce((n, url) => n + file(url).gzip, 0);
  const { entry, routes } = manifest;

  return Object.values(routes)
    .filter((route) => route.hasDefaultExport && route.id !== "root")
    .map((route) => {
      /** @type {ManifestRoute[]} */
      const chain = [];
      for (let at = /** @type {ManifestRoute | undefined} */ (route); at; at = at.parentId ? routes[at.parentId] : undefined) chain.unshift(at);
      const hydrates = !siteScript || chain.some((step) => step.module && HYDRATE.test(file(step.module).bytes.toString("utf8")));
      const js = new Set(hydrates ? [entry.module, ...(entry.imports ?? [])] : [/** @type {string} */ (siteScript)]);
      const css = new Set(entry.css ?? []);
      for (const step of chain) {
        if (hydrates && step.module) js.add(step.module);
        if (hydrates) for (const url of step.imports ?? []) js.add(url);
        for (const url of step.css ?? []) css.add(url);
      }
      if (linkedCss) for (const url of js) for (const m of file(url).bytes.toString("utf8").matchAll(/\/assets\/[\w.-]+\.css/g)) css.add(m[0]);
      const path = `/${chain.map((step) => step.path).filter(Boolean).join("/")}`;
      const [jsBytes, cssBytes] = [sum(js), sum(css)];
      return { id: route.id, path, js: jsBytes, css: cssBytes, total: jsBytes + cssBytes };
    })
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

/**
 * A warning per route over the budget or grown past its baseline, and each row's baseline total (null when it has none).
 * @param {Row[]} rows
 * @param {Config} config
 */
export function check(rows, config) {
  const { ratio = 0.05, bytes = 1024 } = config.growth ?? {};
  const base = config.baseline?.routes ?? {};
  const warnings = [];
  for (const row of rows) {
    if (config.budget_bytes !== undefined && row.total > config.budget_bytes) {
      warnings.push(`${row.id} (${row.path}) loads ${row.total} B gzip, over the budget of ${config.budget_bytes} B.`);
    }
    const was = base[row.id];
    if (was !== undefined && row.total - was > bytes && row.total - was > was * ratio) {
      warnings.push(`${row.id} (${row.path}) loads ${row.total} B gzip, up ${row.total - was} B from the baseline ${was} B.`);
    }
  }
  return { warnings, baselineOf: (/** @type {string} */ id) => (id in base ? base[id] : null) };
}

function fail(/** @type {string} */ message) {
  console.log(`::error::devkit-route-weight: ${message}`);
  process.exit(1);
}

function shortHead(/** @type {string} */ root) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (/** @type {string} */ name, /** @type {string} */ fallback) => (argv.includes(name) && argv[argv.indexOf(name) + 1]) || fallback;
  const root = process.cwd();
  const client = resolve(root, opt("--client", join("build", "client")));
  const file = resolve(root, opt("--config", ".route-weight.json"));

  /** @type {Config} */
  let config = {};
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      fail(`${file} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const assets = join(client, "assets");
  const manifestFile = existsSync(assets) ? readdirSync(assets).find((name) => /^manifest-[\w-]+\.js$/.test(name)) : undefined;
  if (!manifestFile) return fail(`no manifest-*.js in ${assets}. Build the app first.`);
  const read = (/** @type {string} */ url) => {
    const path = join(client, url.replace(/^\//, ""));
    if (!existsSync(path)) fail(`the manifest names ${url}, which is not in ${client}.`);
    return readFileSync(path);
  };
  const gzip = (/** @type {Buffer} */ bytes) => gzipSync(bytes, { level: 9 }).length;
  const siteScript = existsSync(join(client, "site.js")) ? "/site.js" : undefined;
  const rows = routeWeights(parseManifest(readFileSync(join(assets, manifestFile), "utf8")), read, gzip, config.linked_css, siteScript);

  if (argv.includes("--write-baseline")) {
    config.baseline = { measured_at: shortHead(root), routes: Object.fromEntries(rows.map((row) => [row.id, row.total])) };
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`devkit-route-weight: wrote the baseline to ${file}`);
    return;
  }

  const all = (/** @type {string} */ ext) => {
    const names = readdirSync(assets).filter((name) => name.endsWith(ext));
    return `${names.length} ${ext.slice(1).toUpperCase()} files ${names.reduce((n, name) => n + gzip(readFileSync(join(assets, name))), 0)} B`;
  };
  const { warnings, baselineOf } = check(rows, config);
  const measuredAt = config.baseline?.measured_at;
  const table = [
    `### Route weight (gzip bytes, first visit${config.budget_bytes !== undefined ? `, budget ${config.budget_bytes} B` : ""}${measuredAt ? `, baseline ${measuredAt}` : ""})`,
    "",
    `Client build: ${all(".js")}, ${all(".css")} gzip.`,
    "",
    "| Route | Path | JS | CSS | Total | Baseline |",
    "|---|---|--:|--:|--:|--:|",
    ...rows.map((r) => `| ${r.id} | ${r.path} | ${r.js} | ${r.css} | ${r.total} | ${baselineOf(r.id) ?? (measuredAt ? "new" : "")} |`),
    "",
    warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "No route is over its budget or grown past its baseline.",
  ].join("\n");
  console.log(table);
  const level = config.enforce ? "error" : "warning";
  for (const w of warnings) console.log(`::${level} title=Route weight::${w}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
  if (config.enforce && config.budget_bytes === undefined) {
    console.log("::error title=Route weight::the config enforces the report but sets no budget_bytes, so it would pass any weight.");
    process.exit(1);
  }
  if (config.enforce && warnings.length) process.exit(1);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
