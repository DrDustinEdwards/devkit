#!/usr/bin/env node
// The Worker bundle size budget. Runs `wrangler deploy --dry-run`, reads the "Total Upload: <raw> / gzip: <gzip>" line
// wrangler prints (the size Cloudflare counts, every module included), and fails when either is over the budget the
// repository commits in .worker-size.json. Cloudflare's own upload limits are far higher; the budget is about startup, which
// must finish inside 1 s and grows with the bundle. Fails closed: no budget file, a wrangler that fails, or output with no
// Total Upload line exits 1.
//
//   npx devkit-worker-size                   check against .worker-size.json
//   npx devkit-worker-size --config <file>   another budget file
//
// The budget file:
//
//   { "raw_kib": 1700, "gzip_kib": 400, "args": ["--config", "wrangler.jsonc"], "wrangler": "wrangler@4" }
//
// `args` are added to the dry run (default none) and `wrangler` is the npx spec used when the repository does not install
// wrangler itself (default wrangler@4).

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The sizes in KiB from wrangler's Total Upload line, or null when it has none. */
function totalUpload(/** @type {string} */ text) {
  const m = /Total Upload:\s*([\d.]+)\s*(KiB|MiB)\s*\/\s*gzip:\s*([\d.]+)\s*(KiB|MiB)/.exec(text);
  if (!m) return null;
  const kib = (/** @type {string} */ n, /** @type {string} */ unit) => Number(n) * (unit === "MiB" ? 1024 : 1);
  return { raw: kib(m[1], m[2]), gzip: kib(m[3], m[4]) };
}

function fail(/** @type {string} */ message) {
  console.log(`::error::devkit-worker-size: ${message}`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--config");
  const root = process.cwd();
  const file = resolve(root, at >= 0 && argv[at + 1] ? argv[at + 1] : ".worker-size.json");

  if (!existsSync(file)) fail(`no budget file at ${file}. Commit one: { "raw_kib": <KiB>, "gzip_kib": <KiB> }.`);
  /** @type {{ raw_kib?: number, gzip_kib?: number, args?: string[], wrangler?: string }} */
  let budget;
  try {
    budget = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fail(`${file} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof budget.raw_kib !== "number" || typeof budget.gzip_kib !== "number") fail(`${file} needs numbers raw_kib and gzip_kib.`);

  const out = mkdtempSync(join(tmpdir(), "worker-size-"));
  const local = join(root, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  const args = ["deploy", "--dry-run", "--outdir", out, ...(budget.args ?? [])];
  const [bin, argv2] = existsSync(local) ? [local, args] : ["npx", ["--yes", "--package", budget.wrangler ?? "wrangler@4", "--", "wrangler", ...args]];
  // A .cmd shim (and npx itself) on Windows needs cmd.exe; elsewhere the bin runs directly.
  const [cmd, all] = process.platform === "win32" ? ["cmd.exe", ["/c", bin, ...argv2]] : [bin, argv2];
  const r = spawnSync(cmd, all, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  rmSync(out, { recursive: true, force: true });
  const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  if (r.error || r.status !== 0) fail(`wrangler deploy --dry-run failed (${r.error?.message ?? `exit ${r.status}`}):\n${text.trim().slice(-1500)}`);

  const size = totalUpload(text);
  if (!size) fail(`wrangler printed no "Total Upload" line:\n${text.trim().slice(-1500)}`);

  const over = [];
  if (size.raw > budget.raw_kib) over.push(`raw ${size.raw.toFixed(2)} KiB is over the budget of ${budget.raw_kib} KiB`);
  if (size.gzip > budget.gzip_kib) over.push(`gzip ${size.gzip.toFixed(2)} KiB is over the budget of ${budget.gzip_kib} KiB`);

  const table = [
    "### Worker bundle size",
    "",
    "| | Now | Budget |",
    "|---|---|---|",
    `| raw | ${size.raw.toFixed(2)} KiB | ${budget.raw_kib} KiB |`,
    `| gzip | ${size.gzip.toFixed(2)} KiB | ${budget.gzip_kib} KiB |`,
    "",
    over.length
      ? `Over budget. Cut the bundle (a large dependency, or \`"minify": true\` in the wrangler config), or raise ${file.slice(root.length + 1)} in a reviewed change.`
      : "Within budget.",
  ].join("\n");
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
  if (over.length) fail(over.join("; "));
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
