#!/usr/bin/env node
// The client bundle budget. Run after the build. Reads React Router's own asset manifest (the server build's `assets`): a
// page loads the entry, the route manifest and, for each route from root down, its module, imports and stylesheets. The
// heaviest page is the one budgeted. Fails closed: a missing build or config, a manifest with no entry or no page, a file
// the manifest names that the build lacks, or any figure over its budget exits 1.
//
//   initial JS (the heaviest page's)              <= initial_js_kb gzip
//   each other chunk (loaded when a part opens)   <= lazy_chunk_kb gzip
//   initial CSS (the heaviest page's)             <= css_kb gzip
//   lazy CSS (every stylesheet no page loads)     <= lazy_css_kb gzip, together
//   fonts                                         reported, not budgeted
//
//   npx devkit-size-budget                     check against .size-budget.json
//   npx devkit-size-budget --config <file>     another budget file
//
// The budget file (all four limits required):
//
//   { "initial_js_kb": 205, "lazy_chunk_kb": 40, "css_kb": 39, "lazy_css_kb": 12,
//     "client": "build/client", "server": "build/server/index.js" }
//
// `client` and `server` are relative to the working directory (defaults above). It differs from devkit-route-weight, which
// reports every route and warns; this gates the heaviest page and the chunks that load later. Raise a limit in a reviewed
// change that says why.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { escapeAnnotation } from "./annotate.mjs";

const KB = 1024;
const LIMITS = ["initial_js_kb", "lazy_chunk_kb", "css_kb", "lazy_css_kb"];

/** @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`::error::size-budget: ${escapeAnnotation(msg)}`);
  process.exit(1);
}

/** @param {number} n */
const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

async function main() {
  const argv = process.argv.slice(2);
  const ci = argv.indexOf("--config");
  const configPath = resolve(ci >= 0 ? (argv[ci + 1] ?? "") : ".size-budget.json");
  if (!existsSync(configPath)) fail(`no budget file at ${configPath}`);
  /** @type {Record<string, any>} */
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    return fail(`${configPath} is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const k of LIMITS)
    if (typeof config[k] !== "number" || !(config[k] > 0))
      fail(`${configPath} needs a positive number for ${k}`);
  const budget = {
    initialJs: config.initial_js_kb * KB,
    lazyChunk: config.lazy_chunk_kb * KB,
    css: config.css_kb * KB,
    lazyCss: config.lazy_css_kb * KB,
  };
  const client = resolve(config.client ?? "build/client");
  const server = resolve(config.server ?? "build/server/index.js");
  if (!existsSync(client) || !existsSync(server)) fail("no build; run the build first");

  /** @type {{ entry?: { module: string, imports?: string[], css?: string[] }, url: string, routes: Record<string, { id: string, parentId?: string, module?: string, imports?: string[], css?: string[], clientLoaderModule?: string }> }} */
  let assets;
  try {
    ({ assets } = await import(pathToFileURL(server).href));
  } catch (e) {
    return fail(`the server build is unreadable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!assets?.entry?.module) fail("the manifest names no entry");
  const entry = assets.entry;

  const file = (/** @type {string} */ url) => url.replace(/^\//, "").replace(/#$/, "");
  const sizeOf = (/** @type {string} */ rel) => {
    const p = join(client, rel);
    if (!existsSync(p)) fail(`the manifest names ${rel}, which is not in the client build`);
    const buf = readFileSync(p);
    return { raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
  };

  const routes = Object.values(assets.routes);
  /** @type {(r: (typeof routes)[number] | undefined) => typeof routes} */
  const chain = (r) => (r ? [...chain(assets.routes[r.parentId ?? ""]), r] : []);
  const leaves = routes.filter((r) => r.parentId && !routes.some((c) => c.parentId === r.id));
  if (leaves.length === 0) fail("the manifest names no page");

  const pages = leaves.map((leaf) => {
    const js = new Set([file(assets.url), file(entry.module), ...(entry.imports ?? []).map(file)]);
    const css = new Set((entry.css ?? []).map(file));
    for (const r of chain(leaf)) {
      for (const u of [r.module, ...(r.imports ?? []), r.clientLoaderModule].filter(Boolean))
        js.add(file(/** @type {string} */ (u)));
      for (const u of r.css ?? []) css.add(file(u));
    }
    return { id: leaf.id, js, css };
  });
  const gz = (/** @type {Set<string>} */ set) => [...set].reduce((n, f) => n + sizeOf(f).gz, 0);
  const heaviest = pages.reduce((a, b) => (gz(b.js) > gz(a.js) ? b : a));
  const heaviestCss = pages.reduce((a, b) => (gz(b.css) > gz(a.css) ? b : a));
  const anyPage = new Set(pages.flatMap((p) => [...p.js, ...p.css]));

  const files = readdirSync(join(client, "assets")).map((f) => `assets/${f}`);
  const fonts = files.filter((f) => /\.(woff2?|ttf|otf)$/.test(f));

  /** @type {(string | number | null)[][]} */
  const rows = [];
  const problems = [];
  for (const f of heaviest.js) {
    const s = sizeOf(f);
    rows.push(["initial js", f, s.raw, s.gz, ""]);
  }
  const initialGz = gz(heaviest.js);
  rows.push([
    "initial js",
    `TOTAL (${heaviest.id})`,
    null,
    initialGz,
    `<= ${fmt(budget.initialJs)}`,
  ]);
  if (initialGz > budget.initialJs)
    problems.push(
      `initial JS of ${heaviest.id} is ${fmt(initialGz)} gzip, over ${fmt(budget.initialJs)}`,
    );

  for (const f of files.filter((f) => f.endsWith(".js") && !heaviest.js.has(f))) {
    const s = sizeOf(f);
    rows.push(["lazy js", f, s.raw, s.gz, `<= ${fmt(budget.lazyChunk)}`]);
    if (s.gz > budget.lazyChunk)
      problems.push(`chunk ${f} is ${fmt(s.gz)} gzip, over ${fmt(budget.lazyChunk)}`);
  }

  const cssGz = gz(heaviestCss.css);
  let lazyCssGz = 0;
  for (const f of files.filter((f) => f.endsWith(".css"))) {
    const s = sizeOf(f);
    if (!anyPage.has(f)) lazyCssGz += s.gz;
    rows.push([heaviestCss.css.has(f) ? "css" : "lazy css", f, s.raw, s.gz, ""]);
  }
  if (cssGz === 0) fail("no initial CSS found through the manifest");
  rows.push(["css", `TOTAL (${heaviestCss.id})`, null, cssGz, `<= ${fmt(budget.css)}`]);
  rows.push(["lazy css", "TOTAL", null, lazyCssGz, `<= ${fmt(budget.lazyCss)}`]);
  if (cssGz > budget.css)
    problems.push(`initial CSS is ${fmt(cssGz)} gzip, over ${fmt(budget.css)}`);
  if (lazyCssGz > budget.lazyCss)
    problems.push(`lazy CSS is ${fmt(lazyCssGz)} gzip, over ${fmt(budget.lazyCss)}`);

  let fontRaw = 0;
  for (const f of fonts) fontRaw += sizeOf(f).raw;
  rows.push(["fonts", `${fonts.length} files (not budgeted)`, fontRaw, null, "reported"]);

  const w = [10, Math.max(4, ...rows.map((r) => String(r[1]).length)), 10, 10, 12];
  const line = (/** @type {string[]} */ c) =>
    [
      c[0].padEnd(w[0]),
      c[1].padEnd(w[1]),
      c[2].padStart(w[2]),
      c[3].padStart(w[3]),
      c[4].padEnd(w[4]),
    ].join("  ");
  console.log(line(["kind", "file", "raw", "gzip", "budget"]));
  console.log(line(w.map((n) => "-".repeat(n))));
  for (const r of rows)
    console.log(
      line([
        String(r[0]),
        String(r[1]),
        r[2] == null ? "" : fmt(Number(r[2])),
        r[3] == null ? "" : fmt(Number(r[3])),
        String(r[4]),
      ]),
    );

  if (problems.length) {
    for (const p of problems) console.error(`::error::size-budget: ${escapeAnnotation(p)}`);
    process.exit(1);
  }
  console.log("size-budget: pass");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  await main();
