#!/usr/bin/env node
// The no-bloat ratchet. Knip for unused files, exports and dependencies, jscpd for duplicated blocks, jscpd again for the
// blocks copied from the shared packages the repository installs ("shared copies", copies.mjs packageCopies, so a copy
// under a new name is caught too), and a static count of test files and test cases, each compared with the repository's
// own baseline. The baseline is the count exactly: one above it fails the run (exit 1, an ::error:: line per count), and so
// does one below it, until the baseline is lowered in the same change, so the room a removal leaves can never let a new
// copy back in (the ratchet of ESLint's bulk suppressions and Betterer's ci mode). Knip counts each issue (its JSON
// report), not each file. Every count the run measures needs its baseline entry, and no change drops one. Against the
// branch the change goes into (`--lines-from` on a pull request; otherwise the first of origin/HEAD, origin/main and
// origin/master) a change that moves code may not raise a Knip, jscpd or shared-copies count (one new to the baseline
// is raised from 0), change how a count is measured (the no-bloat config outside baseline and tools, a Knip config in
// any format, .jscpd.json, package.json's knip or jscpd), change a workflow that runs this check, or move a shared
// package back; `--write-baseline` refuses what the check would. A change of measure comes alone and may not lower a
// count, so a narrower measure cannot hide what it stops reading; a version bump alone (tools, a lockfile, dependency
// versions forward, a new shared package) may raise or lower. A real exception goes in knip.json's ignore list with a
// comment saying why, behind `jscpd:ignore-start` and its reason, or after `@public` with who uses it; one added with no
// reason fails, and so does any entry added to .jscpd.json or the config's jscpd --ignore, which are strict JSON and
// cannot hold one. Adding a test is a raise: `--write-baseline` in the same change,
// so the diff shows it. The share of source lines that are comments is recorded too, and a rise of more than `tolerance`
// points (with more comment lines than the baseline) is a warning, or an error with `"fail": true`. A tool that cannot run
// fails the run too (an ::error:: naming its error): a count nobody measured is not a pass, and neither is a baseline entry
// no run measures. The table goes to the job summary.
//
//   npx devkit-no-bloat                      check against .no-bloat.json (no file: one knip run, jscpd on its own config)
//   npx devkit-no-bloat --config <file>      another config
//   npx devkit-no-bloat --write-baseline     measure and record the counts as the config's baseline
//   npx devkit-no-bloat --lines-from <rev>   a pull request against <rev>: the base for the raise check (above), and report the
//                                            lines added and removed since the merge base, as code, tests, comments, docs
//                                            and other (pr.yml and no-bloat.yml pass it on a pull request)
//
// The config, every field optional (globs match paths from the repository root, as git lists them):
//
//   {
//     "knip": [{ "label": "knip (Worker)" }, { "label": "knip (dashboard)", "args": ["--directory", "dashboard"] }],
//     "jscpd": { "args": ["app", "workers", "--min-lines", "8"] },
//     "tests": { "files": ["**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"], "ignore": [] },
//     "comments": { "files": ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}"], "ignore": ["**/*.min.*", "**/worker-configuration.d.ts"],
//                   "tolerance": 1, "fail": false },
//     "tools": { "knip": "knip@6.45.1", "jscpd": "jscpd@4.3.0" },
//     "baseline": { "measured_at": "036d615", "knip (Worker)": { "Unused exports": 12 }, "jscpd": { "clones": 23, "lines": 410,
//       "percentage": 0.59 }, "shared copies": { "clones": 0, "lines": 0 }, "tests": { "files": 40, "cases": 312 },
//       "comments": { "lines": 900, "code": 9100, "percentage": 9 } }
//   }
//
// `"jscpd": false`, `"shared": false`, `"tests": false` or `"comments": false` turns one off. jscpd's clones and duplicated
// lines are gated; its percentage is shown, not gated, since deleting code that is not duplicated raises it. The shared
// copies read every shared package (shared.mjs PACKAGES) installed in node_modules, the repository's own excepted; each copy
// is an ::warning:: line with both places. Test cases are counted from the source, never by running a runner: each `test(`
// or `it(` call (node:test, vitest, Playwright), with their modifiers (`.only`, `.skip`, `.each(...)`...), outside comments
// and strings; `describe`, hooks and Playwright's runtime `test.skip(condition)` are not cases. A case made in a loop counts
// once.
//
// A tool the repository installs is run from node_modules/.bin; otherwise through npx at the spec in `tools`.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, relative, sep } from "node:path";

import { appendSummary, escapeAnnotation, shortHead } from "./annotate.mjs";
import { packageCopies } from "./copies.mjs";
import { PACKAGES, blankComments } from "./shared.mjs";
import { readConfig } from "./site-config.mjs";
import { isMain } from "../node/index.mjs";
export const DEFAULT_TOOLS = { knip: "knip@6.45.1", jscpd: "jscpd@4.3.0" };
const TESTS = ["**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"];
const SOURCE = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}"];
const GENERATED = ["**/*.min.*", "**/worker-configuration.d.ts"];
const DOCS = ["**/*.{md,mdx,markdown,rst,txt,adoc}", "docs/**"];
const BUFFER = 64 * 1024 * 1024;

/**
 * @typedef {{ label: string, args?: string[] }} KnipRun
 * @typedef {{ files?: string[], ignore?: string[] }} Files
 * @typedef {{ knip?: KnipRun[], jscpd?: { args?: string[] } | false, shared?: false, tests?: Files | false,
 *   comments?: Files & { tolerance?: number, fail?: boolean } | false, tools?: { knip?: string, jscpd?: string },
 *   baseline?: Record<string, unknown> & { measured_at?: string } }} Config
 * @typedef {(name: "knip" | "jscpd", args: string[]) => string} Runner
 * @typedef {{ list: () => string[], read: (path: string) => string }} Source
 * @typedef {Record<string, Record<string, number>>} Counts
 */

/**
 * Knip's JSON report as counts per issue type, e.g. { exports: 12 }: each unused export, dependency or file is one, so a
 * second unused export in a file that has one already counts. (The compact report's heading counts files, and one per
 * package.json for its dependencies.) Types with no issue are left out; a clean run is {}.
 */
export function knipCounts(/** @type {string} */ text) {
  /** @type {{ issues?: Array<Record<string, unknown>> }} */
  let report;
  try {
    // A Knip plugin can print a warning on stdout before the report (Astro's "[WARN] Missing pages directory"), and the
    // report is one line, so it is the last line that is a JSON object.
    const line = text
      .split("\n")
      .map((l) => l.trim())
      .findLast((l) => l.startsWith("{"));
    report = JSON.parse(line ?? text);
  } catch {
    // Output this cannot read is a format that changed, not a clean run.
    throw new Error(`knip printed no report this reads: ${text.trim().slice(0, 200)}`);
  }
  if (!Array.isArray(report?.issues))
    throw new Error(`knip printed no report this reads: ${text.trim().slice(0, 200)}`);
  /** @type {Record<string, number>} */
  const counts = {};
  for (const issue of report.issues)
    for (const [type, found] of Object.entries(issue)) {
      if (type === "file" || !found || typeof found !== "object") continue;
      const n = Array.isArray(found) ? found.length : Object.keys(found).length;
      if (n) counts[type] = (counts[type] ?? 0) + n;
    }
  return counts;
}

const KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
  "instanceof",
]);

/**
 * Each line of a JS, TS or CSS file as "code", "comment" or "blank", and the text with comments and the insides of strings,
 * templates and regular expressions blanked. A line with code and a comment is code. A quote or a regular expression ends
 * at its line, so one misread (an apostrophe in JSX text) stays on its line.
 */
export function scan(/** @type {string} */ text, css = false) {
  /** @type {string[]} */
  const out = [];
  /** @type {Array<"code" | "comment" | "blank">} */
  const kinds = [];
  let code = false;
  let comment = false;
  const put = (/** @type {string} */ ch, /** @type {"code" | "comment" | "string"} */ kind) => {
    if (ch === "\n") {
      out.push(ch);
      kinds.push(code ? "code" : comment ? "comment" : "blank");
      code = comment = false;
      return;
    }
    out.push(kind === "code" ? ch : " ");
    if (ch.trim()) {
      if (kind === "comment") comment = true;
      else code = true;
    }
  };
  const regexHere = () => {
    let j = out.length - 1;
    while (j >= 0 && !out[j].trim()) j--;
    if (j < 0) return true;
    if (!/[\w$]/.test(out[j])) return !")]\"'`".includes(out[j]);
    let k = j;
    while (k >= 0 && /[\w$]/.test(out[k])) k--;
    return KEYWORDS.has(out.slice(k + 1, j + 1).join(""));
  };
  // Open template literals, each with the depth of braces inside its current ${ }.
  /** @type {number[]} */
  const templates = [];
  let inTemplate = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const d = text[i + 1];
    if (inTemplate) {
      if (c === "\\") {
        put(c, "string");
        if (i + 1 < text.length) put(text[i + 1], "string");
        i += 2;
      } else if (c === "`") {
        put(c, "code");
        templates.pop();
        inTemplate = false;
        i++;
      } else if (c === "$" && d === "{") {
        put(c, "code");
        put(d, "code");
        templates[templates.length - 1] = 0;
        inTemplate = false;
        i += 2;
      } else put(text[i++], "string");
    } else if (!css && c === "/" && d === "/") {
      while (i < text.length && text[i] !== "\n") put(text[i++], "comment");
    } else if (c === "/" && d === "*") {
      const close = text.indexOf("*/", i + 2);
      const stop = close < 0 ? text.length : close + 2;
      while (i < stop) put(text[i++], "comment");
    } else if (c === '"' || c === "'" || (!css && c === "/" && regexHere())) {
      put(c, "code");
      i++;
      let inClass = false;
      while (i < text.length && text[i] !== "\n" && (text[i] !== c || inClass)) {
        if (c === "/" && text[i] === "[") inClass = true;
        else if (c === "/" && text[i] === "]") inClass = false;
        if (text[i] === "\\" && text[i + 1] !== undefined) put(text[i++], "string");
        put(text[i++], "string");
      }
      if (text[i] === c) put(text[i++], "code");
    } else if (!css && c === "`") {
      put(c, "code");
      templates.push(0);
      inTemplate = true;
      i++;
    } else {
      if (templates.length && c === "{") templates[templates.length - 1]++;
      if (templates.length && c === "}" && templates[templates.length - 1]-- === 0)
        inTemplate = true;
      put(text[i++], "code");
    }
  }
  if (out.length && out[out.length - 1] !== "\n") put("\n", "code");
  return { kinds, code: out.join("") };
}

const MODIFIERS = new Set([
  "only",
  "skip",
  "todo",
  "concurrent",
  "sequential",
  "fails",
  "fixme",
  "fail",
  "slow",
  "each",
  "for",
  "skipIf",
  "runIf",
]);
const TAKES_DATA = new Set(["each", "for", "skipIf", "runIf"]);
const AT_RUNTIME = new Set(["skip", "fixme", "fail", "slow"]);

/** The test cases a test file declares, read from scan()'s blanked text. */
export function testCases(/** @type {string} */ code) {
  let n = 0;
  // A subtest of node:test (`t.test("name", ...)`, also `it`) is a case too; a title in quotes tells it from a RegExp's test().
  n += [
    ...code.matchAll(/(?<![\w$.#])(?:t|tt|ctx|context|subtest)\s*\.\s*(?:test|it)\s*\(\s*["'`]/g),
  ].length;
  for (const m of code.matchAll(
    /(?<![\w$.#])(?:test|it|specify)((?:\s*\.\s*[A-Za-z]+)*)\s*\(\s*(\S)?/g,
  )) {
    const members = m[1]
      .split(".")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!members.every((x) => MODIFIERS.has(x)) || m[2] === ")" || m[2] === undefined) continue;
    if (/\bfunction\s*\*?\s*$/.test(code.slice(Math.max(0, m.index - 16), m.index))) continue;
    // Playwright's test.skip(condition) and test.slow() inside a test change it; with a title first they declare one.
    if (
      members.some((x) => AT_RUNTIME.has(x)) &&
      !members.some((x) => TAKES_DATA.has(x)) &&
      !"\"'`".includes(m[2])
    )
      continue;
    n++;
  }
  return n;
}

const matches = (/** @type {string} */ path, /** @type {string[]} */ globs) =>
  globs.some((g) => posix.matchesGlob(path, g));

/** @param {Config} config */
function globs(config) {
  const tests = config.tests || {};
  const comments = config.comments || {};
  return {
    isTest: (/** @type {string} */ p) =>
      matches(p, tests.files ?? TESTS) && !matches(p, tests.ignore ?? []),
    isSource: (/** @type {string} */ p) =>
      matches(p, comments.files ?? SOURCE) && !matches(p, comments.ignore ?? GENERATED),
  };
}

const percent = (/** @type {number} */ part, /** @type {number} */ whole) =>
  whole ? Number(((100 * part) / whole).toFixed(2)) : 0;

/**
 * The test files and cases, and the comment and code lines of the source, read from the files themselves.
 * @param {Config} config
 * @param {string[]} paths
 * @param {(path: string) => string} read
 */
export function countFiles(config, paths, read) {
  const { isTest, isSource } = globs(config);
  const tests = { files: 0, cases: 0 };
  let lines = 0;
  let code = 0;
  for (const path of paths) {
    const test = config.tests !== false && isTest(path);
    const source = config.comments !== false && isSource(path);
    if (!test && !source) continue;
    const scanned = scan(read(path), path.endsWith(".css"));
    if (test) {
      tests.files++;
      tests.cases += testCases(scanned.code);
    }
    if (source) {
      for (const kind of scanned.kinds) {
        if (kind === "code") code++;
        else if (kind === "comment") lines++;
      }
    }
  }
  /** @type {Counts} */
  const counts = {};
  if (config.tests !== false) counts.tests = tests;
  if (config.comments !== false)
    counts.comments = { lines, code, percentage: percent(lines, lines + code) };
  return counts;
}

/**
 * Runs every tool the config names, counts the tests and comments, and returns the counts, keyed as the baseline is, and a
 * warning for each that could not run.
 * @param {Config} config
 * @param {Runner} run
 * @param {boolean} [jscpdConfigured] whether the repository has its own .jscpd.json, which then names the paths
 * @param {Source} [source] the repository's files
 * @param {{ root: string, packages: { repo: string, dir: string }[], missing: string[] }} [shared] the repository and the
 *   shared packages installed in it; `missing`, those its package.json names and node_modules lacks
 * @returns {{ counts: Counts, warnings: string[], copies: ReturnType<typeof packageCopies> }}
 */
export function measure(
  config,
  run,
  jscpdConfigured = true,
  source = { list: () => [], read: () => "" },
  shared = { root: ".", packages: [], missing: [] },
) {
  /** @type {Counts} */
  const counts = {};
  const warnings = [];
  /** @type {ReturnType<typeof packageCopies>} */
  let copies = [];

  for (const { label, args = [] } of config.knip ?? [{ label: "knip" }]) {
    try {
      counts[label] = knipCounts(
        run("knip", [...args, "--no-exit-code", "--no-progress", "--reporter", "json"]),
      );
    } catch (error) {
      warnings.push(`${label} could not run: ${messageOf(error)}`);
    }
  }

  if (config.jscpd !== false) {
    const own = config.jscpd?.args ?? [];
    // jscpd with no path and no config of its own scans nothing; the repository root is the honest default.
    const paths = own.length === 0 && !jscpdConfigured ? ["."] : [];
    const out = mkdtempSync(join(tmpdir(), "jscpd-"));
    try {
      run("jscpd", [...own, ...paths, "--reporters", "json", "--output", out, "--silent"]);
      const total = JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8")).statistics
        .total;
      if (!total.sources) throw new Error("it read no files; check its paths, format and ignore");
      counts.jscpd = {
        clones: total.clones,
        lines: total.duplicatedLines,
        percentage: Number(Number(total.percentage).toFixed(2)),
      };
    } catch (error) {
      warnings.push(`jscpd could not run: ${messageOf(error)}`);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }

  if (config.shared !== false) {
    try {
      // A package the repository depends on and has not installed would be a count over less than it copies from.
      if (shared.missing.length)
        throw new Error(`${shared.missing.join(", ")} not installed; run the install first`);
      copies = packageCopies(shared.root, source.list(), shared.packages, (args) => {
        run("jscpd", args);
      });
      counts["shared copies"] = {
        clones: copies.length,
        lines: copies.reduce((n, [a]) => n + a.end - a.start + 1, 0),
      };
    } catch (error) {
      warnings.push(`the shared copies could not be counted: ${messageOf(error)}`);
    }
  }

  if (config.tests !== false || config.comments !== false) {
    try {
      Object.assign(counts, countFiles(config, source.list(), source.read));
    } catch (error) {
      warnings.push(`tests and comments could not be counted: ${messageOf(error)}`);
    }
  }

  return { counts, warnings, copies };
}

/**
 * One row per finding the baseline or the measurement names, an error for each that grew, a warning for a comment share that
 * rose past its tolerance (an error with `"fail": true`), and in `lowered` each gated count that went down, which main()
 * fails until the baseline is lowered (the comment share's fall is only a note). A finding with no baseline is a
 * row and never an error: there is nothing to have grown from. A baseline entry that no run in the config measures is stale.
 * @param {Record<string, unknown>} baseline
 * @param {Counts} counts
 * @param {Config} [config]
 */
export function compare(baseline, counts, config = {}) {
  /** @type {Array<[string, string, number | null, number]>} */
  const rows = [];
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const lowered = [];
  /** @type {string[]} */
  const unmeasured = [];
  const knipRuns = config.knip ?? [{ label: "knip" }];
  const before = (/** @type {string} */ tool) =>
    /** @type {Record<string, number> | null} */ (tool in baseline ? baseline[tool] : null);
  /** A gated count: a row, an error when it grew, a note when it went down. `zero` counts a key the baseline lacks from 0. */
  const gate = (
    /** @type {string} */ tool,
    /** @type {string} */ key,
    /** @type {string} */ name,
    /** @type {string} */ hint,
    zero = false,
  ) => {
    const old = before(tool);
    const was = old ? (old[key] ?? (zero ? 0 : null)) : null;
    const now = counts[tool][key] ?? 0;
    rows.push([tool, name, was, now]);
    if (was !== null && now > was)
      errors.push(`${tool}: ${name} went from ${was} to ${now}. ${hint}`);
    if (was !== null && now < was) lowered.push(`${tool}: ${name} ${was} to ${now}`);
  };

  // A count the baseline has no entry for would pass any number, so a measured tool missing from it is an error, not a
  // new row: dropping a tool's entry from the baseline must not turn its gate off.
  for (const tool of Object.keys(counts))
    if (!before(tool))
      unmeasured.push(
        `${tool}: the baseline has no count yet. Run \`npx devkit-no-bloat --write-baseline\` and commit the config.`,
      );

  for (const [tool, now] of Object.entries(counts)) {
    if (["jscpd", "shared copies", "tests", "comments"].includes(tool)) continue;
    const was = before(tool);
    const keys = [...new Set([...Object.keys(was ?? {}), ...Object.keys(now)])];
    // A clean run is a row too, so the table shows the tool ran.
    if (keys.length === 0) rows.push([tool, "findings", was ? 0 : null, 0]);
    const args = knipRuns.find((r) => r.label === tool)?.args ?? [];
    for (const key of keys)
      gate(
        tool,
        key,
        key,
        `Run \`npx knip${args.length ? ` ${args.join(" ")}` : ""}\` to see which.`,
        true,
      );
  }

  if (counts.jscpd) {
    gate("jscpd", "clones", "clones", "Run `npx jscpd` to see them.");
    gate("jscpd", "lines", "duplicated lines", "Run `npx jscpd` to see them.");
    rows.push([
      "jscpd",
      "duplicated lines % (not gated)",
      before("jscpd")?.percentage ?? null,
      counts.jscpd.percentage,
    ]);
  }

  if (counts["shared copies"]) {
    const hint =
      "Each is a warning above with both places: import the shared one, delete the copy (SHARED.md).";
    gate("shared copies", "clones", "clones", hint);
    gate("shared copies", "lines", "copied lines", hint);
  }

  if (counts.tests) {
    gate(
      "tests",
      "files",
      "test files",
      "A new test file is recorded with `npx devkit-no-bloat --write-baseline` in the same change.",
    );
    gate(
      "tests",
      "cases",
      "test cases",
      "A new test is recorded with `npx devkit-no-bloat --write-baseline` in the same change.",
    );
  }

  if (counts.comments) {
    const was = before("comments");
    const now = counts.comments;
    const tolerance = (config.comments || {}).tolerance ?? 1;
    rows.push(["comments", "comment lines", was?.lines ?? null, now.lines]);
    rows.push([
      "comments",
      `share of lines % (tolerance ${tolerance})`,
      was?.percentage ?? null,
      now.percentage,
    ]);
    const rise = was ? Math.round((now.percentage - was.percentage) * 100) : 0;
    if (was && rise > tolerance * 100 && now.lines > was.lines) {
      const finding = `comments: the share of source lines that are comments went from ${was.percentage}% to ${now.percentage}% (tolerance ${tolerance} points), comment lines from ${was.lines} to ${now.lines}. Remove comments that restate the code, or raise the baseline in a reviewed change.`;
      ((config.comments || {}).fail ? errors : warnings).push(finding);
    }
    if (was && -rise >= tolerance * 100)
      warnings.push(
        `comments: the share fell from ${was.percentage}% to ${now.percentage}%. Lower the baseline to keep it: run \`npx devkit-no-bloat --write-baseline\` and commit the config.`,
      );
  }

  const measured = new Set(["measured_at", ...knipRuns.map((r) => r.label)]);
  for (const tool of ["jscpd", "tests", "comments"])
    if (config[/** @type {"jscpd"} */ (tool)] !== false) measured.add(tool);
  if (config.shared !== false) measured.add("shared copies");
  const stale = Object.keys(baseline)
    .filter((key) => !measured.has(key))
    .map(
      (key) =>
        `the baseline has "${key}", which no run in the config measures. Restore the run, or drop the entry with \`npx devkit-no-bloat --write-baseline\` in a reviewed change.`,
    );
  return { rows, errors, warnings, lowered, stale: [...unmeasured, ...stale] };
}

/**
 * The job summary table.
 * @param {Array<[string, string, number | null, number]>} rows
 * @param {string[]} problems the errors, then the warnings
 * @param {string | undefined} measuredAt
 */
export function render(rows, problems, measuredAt) {
  const show = (/** @type {number | null} */ n) => (n === null ? "none" : String(n));
  return [
    `### No-bloat ratchet (${measuredAt ? `baseline ${measuredAt}` : "no baseline yet: run `npx devkit-no-bloat --write-baseline`"})`,
    "",
    "| Tool | Finding | Baseline | Now |",
    "|---|---|---|---|",
    ...rows.map(
      ([tool, key, a, b]) =>
        `| ${tool} | ${key} | ${show(a)} | ${b}${a !== null && b > a ? " (up)" : ""} |`,
    ),
    "",
    problems.length ? problems.map((w) => `- ${w}`).join("\n") : "Nothing grew past the baseline.",
  ].join("\n");
}

const LINE_KINDS = /** @type {const} */ (["code", "tests", "comments", "docs", "other"]);

/**
 * The non-blank lines a `git diff -U0` adds and removes, by kind. A source file's lines are code, tests (in a test file) or
 * comments, as scan() reads the whole file on each side; `kindsAt` gives those, or null when it cannot.
 * @param {Config} config
 * @param {string} diff
 * @param {(side: "old" | "new", path: string) => Array<"code" | "comment" | "blank"> | null} kindsAt
 */
export function lineChanges(config, diff, kindsAt) {
  const totals = Object.fromEntries(LINE_KINDS.map((k) => [k, { added: 0, removed: 0 }]));
  const { isTest, isSource } = globs(config);
  const pathOf = (/** @type {string} */ raw) => {
    const p = raw.replace(/\t$/, "");
    if (p === "/dev/null") return null;
    return (p.startsWith('"') ? JSON.parse(p) : p).replace(/^[ab]\//, "");
  };
  let header = false;
  /** @type {string | null} */
  let oldPath = null;
  /** @type {{ test: boolean, source: boolean, docs: boolean, old: ReturnType<typeof kindsAt>, new: ReturnType<typeof kindsAt> }} */
  let file = { test: false, source: false, docs: false, old: null, new: null };
  let oldLine = 0;
  let newLine = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      header = true;
      oldPath = null;
      file = { test: false, source: false, docs: false, old: null, new: null };
    } else if (header && line.startsWith("--- ")) {
      oldPath = pathOf(line.slice(4));
    } else if (header && line.startsWith("+++ ")) {
      const newPath = pathOf(line.slice(4));
      const path = /** @type {string} */ (newPath ?? oldPath);
      const test = isTest(path);
      const source = test || isSource(path);
      file = { test, source, docs: !source && matches(path, DOCS), old: null, new: null };
      if (source) {
        file.old = oldPath ? kindsAt("old", oldPath) : null;
        file.new = newPath ? kindsAt("new", newPath) : null;
      }
    } else if (line.startsWith("@@")) {
      header = false;
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) [oldLine, newLine] = [Number(m[1]), Number(m[2])];
    } else if (!header && (line[0] === "+" || line[0] === "-")) {
      const added = line[0] === "+";
      const n = added ? newLine++ : oldLine++;
      const kinds = added ? file.new : file.old;
      const kind = file.source
        ? (kinds?.[n - 1] ?? (line.slice(1).trim() ? "code" : "blank"))
        : line.slice(1).trim()
          ? "text"
          : "blank";
      if (kind === "blank") continue;
      const into =
        kind === "comment"
          ? "comments"
          : file.source
            ? file.test
              ? "tests"
              : "code"
            : file.docs
              ? "docs"
              : "other";
      totals[into][added ? "added" : "removed"]++;
    }
  }
  return totals;
}

/** The lines summary for a pull request. */
export function renderLines(
  /** @type {ReturnType<typeof lineChanges>} */ totals,
  /** @type {string} */ base,
) {
  const signed = (/** @type {number} */ n) => (n > 0 ? `+${n}` : String(n));
  return [
    `### Lines added and removed (against ${base.slice(0, 7)}, blank lines not counted)`,
    "",
    "| Lines | Added | Removed | Net |",
    "|---|---|---|---|",
    ...Object.entries(totals).map(
      ([kind, { added, removed }]) =>
        `| ${kind} | ${added} | ${removed} | ${signed(added - removed)} |`,
    ),
  ].join("\n");
}

/** The repository's files as git lists them, tracked and untracked but not ignored. */
function gitSource(/** @type {string} */ root) {
  return {
    list: () =>
      [
        ...new Set(
          execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
            cwd: root,
            encoding: "utf8",
            maxBuffer: BUFFER,
          }).split("\0"),
        ),
      ].filter((p) => p && existsSync(join(root, p)) && lstatSync(join(root, p)).isFile()),
    read: (/** @type {string} */ p) => readFileSync(join(root, p), "utf8"),
  };
}

/** Lines added and removed between the merge base of `from` and HEAD. */
function gitLines(
  /** @type {string} */ root,
  /** @type {Config} */ config,
  /** @type {string} */ from,
) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const base = git(["merge-base", from, "HEAD"]).trim();
  const diff = git([
    "-c",
    "core.quotePath=false",
    "diff",
    "-U0",
    "--no-color",
    "--no-ext-diff",
    "-M",
    base,
    "HEAD",
  ]);
  const totals = lineChanges(config, diff, (side, path) => {
    try {
      return scan(git(["show", `${side === "old" ? base : "HEAD"}:${path}`]), path.endsWith(".css"))
        .kinds;
    } catch {
      return null;
    }
  });
  return renderLines(totals, base);
}

/**
 * The npx arguments for a tool that is not installed. The package is named with --package, never as the command: run
 * under `npx --package <devkit>`, this bin inherits npm_config_package, and a bare `npx knip@6` would then look for a
 * command called "knip@6" in devkit.
 */
export function npxArgs(
  /** @type {string} */ name,
  /** @type {string} */ spec,
  /** @type {string[]} */ args,
) {
  return ["--yes", "--package", spec, "--", name, ...args];
}

/** Runs a tool from the repository's node_modules/.bin when it is installed there, through npx at `spec` otherwise. */
export function runnerIn(
  /** @type {string} */ root,
  /** @type {{ knip: string, jscpd: string }} */ tools,
) {
  /** @type {Runner} */
  return (name, args) => {
    const local = join(
      root,
      "node_modules",
      ".bin",
      process.platform === "win32" ? `${name}.cmd` : name,
    );
    const [file, argv] = existsSync(local)
      ? [local, args]
      : ["npx", npxArgs(name, tools[name], args)];
    // A .cmd shim (and npx itself) on Windows needs cmd.exe; elsewhere the bin runs directly.
    const [cmd, all] =
      process.platform === "win32" ? ["cmd.exe", ["/c", file, ...argv]] : [file, argv];
    const r = spawnSync(cmd, all, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0)
      throw new Error(`${name} exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
    return r.stdout;
  };
}

function messageOf(/** @type {unknown} */ error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The shared packages installed in node_modules (the repository's own left out) for the shared copies, and those the root
 * package.json depends on that are not installed.
 */
function installedPackages(/** @type {string} */ root) {
  /** @type {{ name?: string, dependencies?: object, devDependencies?: object }} */
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    // No package.json, or one that is not JSON: nothing is named, and only what is installed is read.
  }
  const wanted = { ...manifest.dependencies, ...manifest.devDependencies };
  const packages = [];
  const missing = [];
  for (const { name, repo } of PACKAGES) {
    if (name === manifest.name) continue;
    const dir = join(root, "node_modules", name);
    if (existsSync(join(dir, "package.json"))) packages.push({ repo, dir });
    else if (name in wanted) missing.push(name);
  }
  return { root, packages, missing };
}

/** The default branch a run is checked against when `--lines-from` is not given, the first that resolves. */
const UPSTREAMS = ["origin/HEAD", "origin/main", "origin/master"];

/** Where a reason for an exception can be written: Knip's config reads comments (these names, or a run's --config); jscpd's .jscpd.json is strict JSON. */
const KNIP_CONFIGS = ["knip.json", "knip.jsonc", ".knip.json", ".knip.jsonc"];
const JSCPD_CONFIG = ".jscpd.json";
/** Every file that says how Knip or jscpd counts, in any format Knip reads (knip.dev, "Configuration"). */
const DEFINITIONS =
  /^(?:\.?knip(?:\.config)?\.(?:json|jsonc|js|cjs|mjs|ts|cts|mts)|\.jscpd\.json)$/;
const LOCKFILES = /^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml)$/;
/** package.json keys that configure a tool instead of the package: a change to one is a change to how it counts. */
const TOOL_KEYS = ["knip", "jscpd"];

/** The value of `--flag value` or `--flag=value` for each flag in `names`. */
function flagValues(/** @type {string[]} */ args, /** @type {string[]} */ names) {
  return args.flatMap((arg, i) => {
    const eq = names.find((n) => arg.startsWith(`${n}=`));
    if (eq) return [arg.slice(eq.length + 1)];
    return names.includes(args[i - 1] ?? "") ? [arg] : [];
  });
}

/**
 * The change against the merge base of `from` with the working tree (so a local run sees what is not committed yet): the
 * config there (null when the file did not exist), the files it changes, and each file at the base and now.
 */
function atBase(
  /** @type {string} */ root,
  /** @type {string} */ file,
  /** @type {string} */ from,
) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const base = git(["merge-base", from, "HEAD"]).trim();
  const head = git(["rev-parse", "HEAD"]).trim();
  // A base that is HEAD itself compares the change with itself. On a pull request the base is its first parent, so this
  // is a run pointed at its own commit while the default branch says the change is not in it yet.
  if (base === head)
    for (const ref of UPSTREAMS) {
      let tip;
      try {
        tip = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
      } catch {
        continue;
      }
      if (git(["merge-base", tip, head]).trim() !== head)
        throw new Error(
          `${from} is the change itself (its merge base with HEAD is HEAD, which ${ref} does not have). Pass the branch the change goes into.`,
        );
    }
  const before = (/** @type {string} */ path) =>
    git(["ls-tree", "--name-only", base, "--", path]).trim()
      ? git(["show", `${base}:${path}`])
      : null;
  const now = (/** @type {string} */ path) =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
  const configPath = posix.normalize(relative(root, file).split(sep).join("/"));
  const old = before(configPath);
  return {
    config: /** @type {Config | null} */ (old === null ? null : JSON.parse(old)),
    configPath,
    changed: [
      ...git(["diff", "--name-only", "-z", base]).split("\0").filter(Boolean),
      ...untracked,
    ],
    // Every line the change adds, as `git diff -U0` prints it, untracked files whole.
    added: [
      ...git(["diff", "-U0", "--no-color", "--no-ext-diff", base])
        .split("\n")
        .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
        .map((l) => l.slice(1)),
      ...untracked.flatMap((p) =>
        lstatSync(join(root, p)).isFile() ? (now(p) ?? "").split("\n") : [],
      ),
    ],
    before,
    now,
  };
}

/**
 * The base a run checks the baseline against: `--lines-from`, else the default branch. Only a run in Actions with none of
 * them (a shallow checkout of the default branch, or a merge queue whose pull request ran it) has no base; a local run
 * with none fails, and setting GITHUB_ACTIONS does not skip a base that resolves.
 */
function baseRef(/** @type {string} */ root, /** @type {string | undefined} */ from) {
  if (from) return from;
  for (const ref of UPSTREAMS)
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
        cwd: root,
        stdio: "ignore",
      });
      return ref;
    } catch {}
  if (process.env.GITHUB_ACTIONS === "true") return null;
  throw new Error(
    `none of ${UPSTREAMS.join(", ")} resolves, so a raised baseline cannot be told from the count. Pass --lines-from <rev> (the branch the change goes into).`,
  );
}

/** A dependency pin's version: `1.2.3`, `^1.2.3`, or a git pin's `#v1.2.3`; null when it names none. */
function pinVersion(/** @type {unknown} */ pin) {
  const m =
    typeof pin === "string" ? /(\d+)\.(\d+)\.(\d+)/.exec(pin.split("#").at(-1) ?? "") : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * What a change does to the counts, from the files it touches. `code`: it changes something the counts read (anything
 * but the config's `baseline` and `tools`, a lockfile, a definition, and in package.json dependency versions moved
 * forward or a new shared package). `definition`: what it changes in how Knip or jscpd counts (their config files in any
 * format, package.json's `knip` or `jscpd`, the no-bloat config outside `baseline` and `tools`). `workflow`: the
 * workflows it changes that run the check. `back`: the shared packages it moves to an older release. Pure.
 * @param {{ changed: string[], configPath: string, before: (path: string) => string | null, now: (path: string) => string | null }} change
 */
export function classify(change) {
  const { changed, configPath } = change;
  /** @type {string[]} */
  const definition = [];
  /** @type {string[]} */
  const back = [];
  let code = false;
  /** @type {string[]} */
  const workflow = [];
  const json = (/** @type {string | null} */ text) => {
    try {
      return text === null ? null : JSON.parse(text);
    } catch {
      return null;
    }
  };
  const without = (/** @type {any} */ o, /** @type {string[]} */ keys) =>
    JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k))));
  for (const p of changed) {
    if (LOCKFILES.test(p)) continue;
    if (DEFINITIONS.test(p)) {
      definition.push(p);
      continue;
    }
    if (p === configPath) {
      if (
        without(json(change.before(p)), ["baseline", "tools"]) !==
        without(json(change.now(p)), ["baseline", "tools"])
      )
        definition.push(`${p} (outside baseline and tools)`);
      continue;
    }
    if (p === "package.json") {
      const [a, b] = [json(change.before(p)), json(change.now(p))];
      if (!a || !b) {
        code = true;
        continue;
      }
      for (const key of TOOL_KEYS)
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))
          definition.push(`package.json "${key}"`);
      if (
        without(a, [...DEPENDENCY_FIELDS, ...TOOL_KEYS]) !==
        without(b, [...DEPENDENCY_FIELDS, ...TOOL_KEYS])
      )
        code = true;
      const shared = new Set(PACKAGES.map((x) => x.name));
      for (const field of DEPENDENCY_FIELDS) {
        const [was, is] = [a[field] ?? {}, b[field] ?? {}];
        // An added library can be unused, and a removed one can leave an import unlisted.
        if (!Object.keys(was).every((n) => n in is)) code = true;
        if (!Object.keys(is).every((n) => n in was || shared.has(n))) code = true;
        for (const name of Object.keys(is)) {
          const [x, y] = [pinVersion(was[name]), pinVersion(is[name])];
          if (x && y && (y[0] - x[0] || y[1] - x[1] || y[2] - x[2]) < 0) {
            code = true;
            if (shared.has(name)) back.push(`${name} ${was[name]} to ${is[name]}`);
          }
        }
      }
      continue;
    }
    code = true;
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) {
      const text = `${change.before(p) ?? ""}\n${change.now(p) ?? ""}`;
      if (/\.github\/workflows\/(?:pr|no-bloat)\.yml|devkit-no-bloat|no-bloat\.mjs/.test(text))
        workflow.push(p);
    }
  }
  return { code, definition, workflow, back };
}

/**
 * What the change is refused for, against the config at its base. A change that moves code may not raise a Knip, jscpd
 * or shared-copies count (a count the base lacked is raised from 0, and every count when the base had no baseline), nor
 * change how a count is measured, nor the workflows that run the check, nor move a shared package back. A change of what
 * is measured comes on its own, and may raise but not lower or drop a count: a narrower measure would hide what it no
 * longer reads. Only a version bump alone may lower one. No change drops a count from the baseline. Tests may rise: a
 * new test is how they do. Pure.
 * @param {Config} config @param {Config | null} base the config at the pull request's base
 * @param {ReturnType<typeof classify>} kind
 */
export function raised(config, base, kind) {
  const was = base?.baseline ?? {};
  const now = config.baseline ?? {};
  /** @type {string[]} */
  const out = [];
  const skip = (/** @type {string} */ tool, /** @type {unknown} */ counts) =>
    tool === "measured_at" || !counts || typeof counts !== "object";
  for (const [tool, counts] of Object.entries(was))
    if (!skip(tool, counts) && !(tool in now))
      out.push(
        `${tool}: this change drops its count from the baseline, which turns its gate off. Put the count back; a measure is never switched off.`,
      );
  if (kind.code) {
    for (const [tool, counts] of Object.entries(now)) {
      if (skip(tool, counts) || ["tests", "comments"].includes(tool)) continue;
      const before = /** @type {Record<string, number>} */ (was[tool] ?? {});
      for (const [key, n] of Object.entries(/** @type {Record<string, number>} */ (counts)))
        if (key !== "percentage" && typeof n === "number" && n > (before[key] ?? 0))
          out.push(
            `${tool}: this change raises the baseline's ${key} from ${before[key] ?? 0} to ${n}. A raise lets the new copy or unused code in: remove it instead, and put a real exception in knip.json's ignore list with a comment saying why. Only a change that moves no code (a tool, devkit or shared package bump alone) may raise it.`,
          );
    }
    if (kind.definition.length)
      out.push(
        `this change moves code and also how it is counted (${kind.definition.join(", ")}). Change the measure in a change of its own.`,
      );
    if (kind.workflow.length)
      out.push(
        `this change moves code and also the workflow that runs this check (${kind.workflow.join(", ")}). Change the workflow in a change of its own.`,
      );
  } else if (kind.definition.length)
    for (const [tool, counts] of Object.entries(was)) {
      if (skip(tool, counts)) continue;
      const after = /** @type {Record<string, number>} */ (now[tool] ?? {});
      for (const [key, n] of Object.entries(/** @type {Record<string, number>} */ (counts)))
        if (key !== "percentage" && typeof n === "number" && (after[key] ?? 0) < n)
          out.push(
            `${tool}: this change of how it is counted (${kind.definition.join(", ")}) lowers ${key} from ${n} to ${after[key] ?? 0}, so the narrower measure hides what it no longer reads. Measure as much as before; an exception goes in knip.json's ignore list with its reason.`,
          );
    }
  for (const b of kind.back)
    out.push(`this change moves ${b}, an older release. Keep the shared package at its newest.`);
  return out;
}

/** Every string in an ignore list (a key starting "ignore", at any depth), and the keys of an ignore map such as ignoreIssues. */
function ignoreEntries(/** @type {unknown} */ node, inIgnore = false) {
  /** @type {string[]} */
  const out = [];
  if (typeof node === "string") {
    if (inIgnore) out.push(node);
  } else if (Array.isArray(node)) {
    for (const v of node) out.push(...ignoreEntries(v, inIgnore));
  } else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      const ignoring = inIgnore || /^ignore/i.test(k);
      if (ignoring && inIgnore === false && v && typeof v === "object" && !Array.isArray(v))
        out.push(...Object.keys(v));
      out.push(...ignoreEntries(v, ignoring));
    }
  return out;
}

/** JSON with comments and trailing commas, as Knip reads its config. */
function parseJsonc(/** @type {string} */ text) {
  return JSON.parse(blankComments(text).replace(/,(\s*[}\]])/g, "$1"));
}

/** The values of jscpd's `--ignore` and `--ignore-pattern` in a config's jscpd args. */
function jscpdIgnores(/** @type {Config | null} */ config) {
  const args = config?.jscpd && typeof config.jscpd === "object" ? (config.jscpd.args ?? []) : [];
  return flagValues(args, ["--ignore", "--ignore-pattern", "-i"]);
}

/**
 * Whether the entry at `line` of a Knip config carries a reason: a comment on its line, or directly above it or above the
 * list it is in (the entries between are the list's own).
 */
function reasoned(/** @type {string[]} */ lines, /** @type {number} */ line) {
  const kinds = scan(lines.join("\n")).kinds;
  const commentOn = (/** @type {number} */ i) => blankComments(lines[i]) !== lines[i];
  if (commentOn(line)) return true;
  let i = line;
  // Up through the list's other entries to its key.
  if (!/"\s*:/.test(lines[i])) {
    i--;
    while (i >= 0 && kinds[i] !== "comment" && /^\s*"/.test(lines[i]) && !/"\s*:/.test(lines[i]))
      i--;
    if (i >= 0 && kinds[i] === "comment") return true;
    if (i < 0) return false;
    if (commentOn(i)) return true;
  }
  return i > 0 && kinds[i - 1] === "comment";
}

/**
 * The exceptions a change adds with no reason: an entry new to a Knip config's ignore lists without a comment saying why,
 * one new to .jscpd.json or to the config's jscpd `--ignore` (strict JSON, so no reason can be written there), and a
 * `jscpd:ignore-start` marker with nothing after it. A reason is what the reviewer reads; an exception without one is a
 * bolt-on let in quietly. Pure.
 * @param {{ before: (path: string) => string | null, now: (path: string) => string | null, added: string[] }} change
 * @param {Config} config @param {Config | null} base
 */
export function unreasoned(change, config, base) {
  /** @type {string[]} */
  const out = [];
  const fresh = (/** @type {string[]} */ was, /** @type {string[]} */ is) =>
    [...new Set(is)].filter((e) => !was.includes(e));
  // The default names, and any a knip run in the config names with --config.
  const knipArgs = (config.knip ?? []).flatMap((r) => r.args ?? []);
  const named = flagValues(knipArgs, ["--config", "-c"]);
  for (const path of new Set([...KNIP_CONFIGS, ...named])) {
    const now = change.now(path);
    if (now === null) continue;
    const was = change.before(path);
    const lines = now.split("\n");
    for (const entry of fresh(
      was === null ? [] : ignoreEntries(parseJsonc(was)),
      ignoreEntries(parseJsonc(now)),
    )) {
      const quoted = JSON.stringify(entry);
      const at = lines.flatMap((l, i) => (l.includes(quoted) ? [i] : []));
      if (!at.some((i) => reasoned(lines, i)))
        out.push(
          `${path}: the ignore entry ${quoted} is new and says nothing about why. Remove what it hides, or put a comment on its line or above it giving the reason.`,
        );
    }
  }
  const jscpdNow = change.now(JSCPD_CONFIG);
  if (jscpdNow !== null) {
    const jscpdWas = change.before(JSCPD_CONFIG);
    for (const entry of fresh(
      jscpdWas === null ? [] : ignoreEntries(JSON.parse(jscpdWas)),
      ignoreEntries(JSON.parse(jscpdNow)),
    ))
      out.push(
        `${JSCPD_CONFIG}: the ignore entry ${JSON.stringify(entry)} is new, and the file is strict JSON, so it cannot say why. Remove the copy it hides, or mark the block in its source with \`jscpd:ignore-start\` followed by the reason.`,
      );
  }
  for (const entry of fresh(jscpdIgnores(base), jscpdIgnores(config)))
    out.push(
      `the config's jscpd args gain --ignore ${JSON.stringify(entry)}, which cannot say why. Remove the copy it hides, or mark the block in its source with \`jscpd:ignore-start\` followed by the reason.`,
    );
  for (const line of change.added)
    if (/jscpd:ignore-start(?:\s*(?:\*\/|-->)?\s*)$/.test(line))
      out.push(
        `a new \`jscpd:ignore-start\` gives no reason (${line.trim()}). Write why after the marker on the same line, or remove the copy.`,
      );
    // Knip never reports an export tagged @public, so the tag is an exception like any other.
    else if (/@public(?:\s*(?:\*\/)?\s*)$/.test(line))
      out.push(
        `a new \`@public\` gives no reason (${line.trim()}). Knip skips the export it tags: write who uses it after the tag, or remove the export.`,
      );
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const root = process.cwd();
  const write = argv.includes("--write-baseline");
  if (argv.includes("--warn-only")) {
    // A report never stops a copy from merging (Enarratio, germomics and txasm ran it so). The ratchet always gates.
    console.error(
      "devkit-no-bloat: --warn-only was removed in 0.37.0; the ratchet always gates. Drop the flag (and any continue-on-error on its step).",
    );
    process.exit(2);
  }
  const from = argv.includes("--lines-from") ? argv[argv.indexOf("--lines-from") + 1] : undefined;

  // A broken config would otherwise be no baseline, and so a ratchet that passes everything.
  const { config, path: file } = /** @type {{ config: Config, path: string }} */ (
    readConfig(argv, ".no-bloat.json", "devkit-no-bloat", { optional: true })
  );

  const measured = measure(
    config,
    runnerIn(root, { ...DEFAULT_TOOLS, ...config.tools }),
    existsSync(join(root, ".jscpd.json")),
    gitSource(root),
    installedPackages(root),
  );

  // A raised baseline or an exception with no reason, against the branch the change goes into: on a pull request
  // (--lines-from) and in every local run, so neither the check nor --write-baseline can accept one quietly.
  /** @type {string[]} */
  const refused = [];
  let ref = from;
  try {
    ref = baseRef(root, from) ?? undefined;
    if (ref) {
      const base = atBase(root, file, ref);
      const next = write ? { ...config, baseline: { ...measured.counts } } : config;
      refused.push(
        ...raised(next, base.config, classify(base)),
        ...unreasoned(base, config, base.config),
      );
    }
  } catch (error) {
    refused.push(`The baseline at ${ref ?? "the base"} could not be read: ${messageOf(error)}`);
  }

  if (write) {
    if (refused.length) {
      for (const r of refused) console.error(`devkit-no-bloat: ${r}`);
      console.error("devkit-no-bloat: the baseline was not written.");
      process.exit(1);
    }
    if (measured.warnings.length) {
      for (const w of measured.warnings) console.error(`devkit-no-bloat: ${w}`);
      console.error("devkit-no-bloat: the baseline was not written, because a tool could not run.");
      process.exit(1);
    }
    config.baseline = { measured_at: shortHead(root), ...measured.counts };
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`devkit-no-bloat: wrote the baseline to ${file}`);
    return;
  }

  const { rows, errors, warnings, lowered, stale } = compare(
    config.baseline ?? {},
    measured.counts,
    config,
  );
  if (errors.length) {
    errors.push(
      "Remove what was added: change the code that already does it, or import the shared one, and delete the copy (SHARED.md). A real exception goes in knip.json's ignore list with a comment saying why, or behind `jscpd:ignore-start` and its reason in the source.",
    );
  }
  // The room a removal leaves is where the next copy would go: a count below its baseline fails until it is lowered.
  if (lowered.length)
    errors.push(
      `Lower the baseline to lock this in (${lowered.join(", ")}): run \`npx devkit-no-bloat --write-baseline\` and commit the config in this change.`,
    );
  errors.push(...refused);
  errors.unshift(...measured.warnings, ...stale);
  // No baseline is a ratchet that passes everything: a missing config, or one whose baseline counts nothing, fails.
  const counted = Object.keys(config.baseline ?? {}).filter((key) => key !== "measured_at");
  if (!counted.length)
    errors.unshift(
      `${existsSync(file) ? `${file} has no baseline` : `${file} does not exist`}, so every count would pass. Run \`npx devkit-no-bloat --write-baseline\` and commit the config.`,
    );
  let table = render(rows, [...errors, ...warnings], config.baseline?.measured_at);
  if (from) {
    try {
      table += `\n\n${gitLines(root, config, from)}`;
    } catch (error) {
      warnings.push(
        `The lines added and removed since ${from} could not be read: ${messageOf(error)}`,
      );
    }
  }
  console.log(table);
  for (const [mine, theirs] of measured.copies)
    console.log(
      `::warning file=${escapeAnnotation(mine.path)},line=${mine.start}::${escapeAnnotation(`lines ${mine.start}-${mine.end} copy ${theirs.repo}'s ${theirs.path}:${theirs.start}-${theirs.end}: import it from the package and delete this copy`)}`,
    );
  for (const e of errors) console.log(`::error::${escapeAnnotation(e)}`);
  for (const w of warnings) console.log(`::warning::${escapeAnnotation(w)}`);
  appendSummary(table);
  if (errors.length) process.exit(1);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (isMain(import.meta.url)) main();
