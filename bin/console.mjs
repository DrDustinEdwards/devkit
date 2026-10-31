#!/usr/bin/env node
// The console ratchet. Counts the raw console.* calls in a repository's server code, outside comments and strings, and
// compares the count with the baseline in its .console.json. A total above the baseline fails (exit 1, an ::error:: line
// naming each file above its own count); at or below passes, and a total that went down is named so the baseline can be
// lowered to lock the gain in. The structured logger is how server code logs; this keeps the raw calls from coming back.
//
//   npx devkit-console                      report against .console.json (no file: count, and fail on any call)
//   npx devkit-console --config <file>      another config
//   npx devkit-console --write-baseline     measure and record the counts as the config's baseline
//
// The config, every field optional (globs match paths from the repository root, as git lists them):
//
//   {
//     "files": ["app/**/*.server.ts", "workers/**/*.ts"],
//     "ignore": ["app/lib/log.server.ts"],
//     "baseline": { "measured_at": "036d615", "calls": 12, "files": { "workers/app.ts": 3 } }
//   }
//
// "files" defaults to every JS and TS file; "ignore" (default: tests, scripts, bin, type declarations, minified and built
// files) always applies, so the logger that wraps console is named there. A call is `console.<method>(`, read from the
// code with comments and the insides of strings, templates and regular expressions blanked.

import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { scan } from "./no-bloat.mjs";

const FILES = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"];
const IGNORE = ["**/*.{test,spec}.*", "**/test/**", "**/tests/**", "**/e2e/**", "scripts/**", "bin/**", "**/*.d.{ts,mts,cts}", "**/*.min.*", "**/build/**", "**/dist/**", "**/node_modules/**"];

/** The raw console calls in one file's text. */
export function consoleCalls(/** @type {string} */ text) {
  return [...scan(text).code.matchAll(/(?<![\w$.#])console\s*\.\s*[A-Za-z]+\s*\(/g)].length;
}

/**
 * The calls per file and in all over the files the config names, and how many files were read.
 * @param {{ files?: string[], ignore?: string[] }} config
 * @param {string[]} paths
 * @param {(path: string) => string} read
 */
export function measure(config, paths, read) {
  const matches = (/** @type {string} */ p, /** @type {string[]} */ globs) => globs.some((g) => posix.matchesGlob(p, g));
  /** @type {Record<string, number>} */
  const files = {};
  let calls = 0;
  let scanned = 0;
  for (const path of [...paths].sort()) {
    if (!matches(path, config.files ?? FILES) || matches(path, config.ignore ?? IGNORE)) continue;
    scanned++;
    const n = consoleCalls(read(path));
    if (n) files[path] = n;
    calls += n;
  }
  return { counts: { calls, files }, scanned };
}

/**
 * Errors when the total rose, naming each file above its own baseline; a warning when it fell.
 * @param {{ calls?: number, files?: Record<string, number> } | undefined} baseline
 * @param {{ calls: number, files: Record<string, number> }} counts
 */
export function compare(baseline, counts) {
  const base = baseline?.calls ?? 0;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  if (counts.calls > base) {
    const grown = Object.entries(counts.files).filter(([path, n]) => n > (baseline?.files?.[path] ?? 0)).map(([path, n]) => `${path} ${baseline?.files?.[path] ?? 0} → ${n}`);
    errors.push(`${counts.calls} raw console calls in server code, above the baseline of ${base}${grown.length ? `: ${grown.slice(0, 20).join(", ")}${grown.length > 20 ? ` and ${grown.length - 20} more` : ""}` : ""}. Log through the structured logger; a deliberate raise is \`npx devkit-console --write-baseline\` in the same change.`);
  } else if (counts.calls < base) {
    warnings.push(`${counts.calls} raw console calls, below the baseline of ${base}. Lower it to lock this in: run \`npx devkit-console --write-baseline\` and commit the config.`);
  }
  return { errors, warnings };
}

function main() {
  const { values } = parseArgs({ options: { config: { type: "string", default: ".console.json" }, "write-baseline": { type: "boolean" } } });
  const root = process.cwd();
  /** @type {{ files?: string[], ignore?: string[], baseline?: { measured_at?: string, calls?: number, files?: Record<string, number> } }} */
  let config = {};
  if (existsSync(join(root, values.config))) {
    try {
      config = JSON.parse(readFileSync(join(root, values.config), "utf8"));
    } catch (error) {
      console.log(`::error::${values.config} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  }
  const git = (/** @type {string[]} */ args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const paths = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter((p) => p && existsSync(join(root, p)));
  const { counts, scanned } = measure(config, paths, (p) => readFileSync(join(root, p), "utf8"));
  if (!scanned) {
    console.log("::error::devkit-console read no files: nothing matches `files`. A count over nothing is not a pass.");
    process.exit(2);
  }
  if (values["write-baseline"]) {
    const measured_at = git(["rev-parse", "--short", "HEAD"]).trim();
    writeFileSync(join(root, values.config), `${JSON.stringify({ ...config, baseline: { measured_at, ...counts } }, null, 2)}\n`);
    console.log(`devkit-console: wrote a baseline of ${counts.calls} calls to ${values.config}.`);
    return;
  }
  const { errors, warnings } = compare(config.baseline, counts);
  const table = ["| File | Raw console calls | Baseline |", "|---|---:|---:|"];
  for (const [path, n] of Object.entries(counts.files)) table.push(`| ${path} | ${n} | ${config.baseline?.files?.[path] ?? 0} |`);
  table.push(`| **All** | **${counts.calls}** | **${config.baseline?.calls ?? 0}** |`);
  console.log(table.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Raw console calls\n\n${table.join("\n")}\n`);
  for (const e of errors) console.log(`::error title=devkit-console::${e}`);
  for (const w of warnings) console.log(`::warning title=devkit-console::${w}`);
  if (errors.length) process.exit(1);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
