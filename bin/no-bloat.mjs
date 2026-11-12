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
// any format, .jscpd.json, package.json's knip or jscpd), change a workflow that runs this check (moving only its devkit
// pins is a bump, not a change), or move a shared package back; `--write-baseline` refuses what the check would. A change
// of measure comes alone and may not lower a count, so a narrower measure cannot hide what it stops reading; a version
// bump alone (tools, a lockfile, dependency versions forward, a new shared package) may raise or lower. What would hide
// the next change's code is refused even when it hides nothing yet: every new line of a Knip config needs its own reason,
// a narrower jscpd measure fails, jscpd's `unread` counts the source files it skips, a tracked file a
// .gitignore hides from Knip fails, a new file jscpd skips fails, and the tools must be npm's at x.y.z and devkit a
// DrDustinEdwards/devkit tag. No change may drop or turn off the job that runs the check, or change the inputs that
// decide what runs before it (workflowInputs, which reads the workflow with a YAML parser); install scripts, patches and
// a Knip plugin's config files are a change of measure. In Actions the check counts the commit the run is for
// (checkoutProblems). A real
// exception goes in knip.jsonc with a comment saying why, behind `jscpd:ignore-start` and its reason, or after `@public`,
// `@beta` or `@alias` with who uses it; one added with no reason in words (isReason) fails, and so does any entry added
// to .jscpd.json or the config's jscpd --ignore, which are strict JSON and cannot hold one. Adding a test is a raise:
// `--write-baseline` in the same change, so the diff shows it. `--verify-install <dir>`, run from the workflow's own
// devkit, fails unless the installed devkit is a release no older than it, file for file. The share of source lines that
// are comments is recorded too, and a rise of more than `tolerance` points (with more comment lines than the baseline) is
// a warning, or an error with `"fail": true`. A tool that cannot run
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
// knip and jscpd are npm's, at the exact versions in `tools`, installed by the check itself (checkTools), never the
// repository's own install.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
 * The source files jscpd skips, wherever they are: a path narrowed to today's files or directories, or a pattern, leaves
 * the next file outside it unread, and a copy there is never counted. A file shorter than jscpd's minLines (its lines as
 * jscpd counts them, newline-split) is left out, since it can hold no copy and jscpd skips it by design (one under its
 * minTokens is left out by measure, which asks jscpd); one longer than maxLines or larger than maxSize is not, since a
 * copy in it is never seen. Test files are left out (tests rise by design).
 * @param {Config} config @param {string[]} paths
 * @param {string[]} scanned the files jscpd read, from its report (measure)
 * @param {string} root
 * @param {(path: string) => string} [read] each file, to tell a short one
 * @param {number} [minLines] jscpd's minLines (jscpdOptions)
 * @returns {string[]}
 */
export function unreadFiles(config, paths, scanned, root, read = () => "", minLines = 0) {
  const { isTest, isSource } = globs(config);
  const norm = (/** @type {string} */ p) =>
    posix.normalize((isAbsolute(p) ? relative(root, p) : p).split(sep).join("/"));
  const seen = new Set(scanned.map(norm));
  return paths.filter(
    (p) => isSource(p) && !isTest(p) && !seen.has(p) && read(p).split("\n").length >= minLines,
  );
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
 * @returns {{ counts: Counts, warnings: string[], copies: ReturnType<typeof packageCopies>, unread: string[] }}
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
  /** @type {string[]} */
  let unread = [];

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
    // jscpd 4 lists the files it read under each format; jscpd 5 lists none there, only in its summary, by absolute path.
    const major = Number(/@(\d+)\./.exec(config.tools?.jscpd ?? DEFAULT_TOOLS.jscpd)?.[1] ?? 0);
    const listed = major >= 5 ? ["--summary", "--summary-top", "1000000000"] : [];
    try {
      run("jscpd", [
        ...own,
        ...paths,
        ...listed,
        "--absolute",
        "--reporters",
        "json",
        "--output",
        out,
        "--silent",
      ]);
      const report = JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8"));
      const total = report.statistics.total;
      if (!total.sources) throw new Error("it read no files; check its paths, format and ignore");
      /** @type {string[]} */
      const scanned =
        major >= 5
          ? (report.summary?.files ?? []).map((/** @type {{ path: string }} */ f) => f.path)
          : Object.values(report.statistics.formats ?? {}).flatMap(
              (/** @type {{ sources?: object }} */ f) => Object.keys(f.sources ?? {}),
            );
      if (scanned.length !== total.sources)
        throw new Error(
          `its report lists ${scanned.length} files it read, not the ${total.sources} it counted, so the files it skips cannot be told`,
        );
      const options = jscpdOptions(jscpdFile(source), config);
      unread = unreadFiles(
        config,
        source.list(),
        scanned,
        shared.root,
        source.read,
        Number(options.minLines),
      );
      // A file under jscpd's minTokens can hold no copy either. jscpd itself says which: it reads the files it skipped,
      // with only its thresholds and mode (an empty config of its own), and what it still skips is too small.
      if (unread.length) {
        const probe = join(out, "probe");
        writeFileSync(join(out, "empty.json"), "{}");
        run("jscpd", [
          ...unread.map((p) => join(shared.root, p)),
          ...listed,
          "--config",
          join(out, "empty.json"),
          "--min-lines",
          String(options.minLines),
          "--min-tokens",
          String(options.minTokens),
          "--mode",
          String(options.mode),
          "--absolute",
          "--reporters",
          "json",
          "--output",
          probe,
          "--silent",
        ]);
        let read = /** @type {string[]} */ ([]);
        try {
          const r = JSON.parse(readFileSync(join(probe, "jscpd-report.json"), "utf8"));
          read =
            major >= 5
              ? (r.summary?.files ?? []).map((/** @type {{ path: string }} */ f) => f.path)
              : Object.values(r.statistics.formats ?? {}).flatMap(
                  (/** @type {{ sources?: object }} */ f) => Object.keys(f.sources ?? {}),
                );
        } catch {
          // No report: it read none of them, so every one is too small to hold a copy.
        }
        const big = new Set(
          read.map((p) => posix.normalize(relative(shared.root, p).split(sep).join("/"))),
        );
        unread = unread.filter((p) => big.has(p));
      }
      counts.jscpd = {
        clones: total.clones,
        lines: total.duplicatedLines,
        percentage: Number(Number(total.percentage).toFixed(2)),
        unread: unread.length,
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

  return { counts, warnings, copies, unread };
}

/** The repository's .jscpd.json, parsed, or null. */
function jscpdFile(/** @type {Source} */ source) {
  try {
    return JSON.parse(source.read(JSCPD_CONFIG));
  } catch {
    return null;
  }
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
    if ("unread" in counts.jscpd)
      gate(
        "jscpd",
        "unread",
        "source files it skips",
        "A source file jscpd does not read can hold a copy nobody counts: widen jscpd's path in a change of its own, or move the file where it reads.",
        true,
      );
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
 * Environment variables that load code into a node, npm or git process, or point one somewhere else. In Actions, where an
 * earlier step's GITHUB_ENV line (an install script's, the prepare's) sets them, the proxy and certificate ones too, so a
 * proxy that step started cannot serve another knip; a local run keeps them, for a network behind a proxy.
 */
const INJECTING =
  /^(?:NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_\w+|npm_config_\w+|GIT_\w+|DEVKIT_NO_BLOAT_TOOLS)$/i;
const IN_ACTIONS =
  /^(?:HTTPS?_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|SSL_CERT_FILE|SSL_CERT_DIR)$/i;

/** The environment with nothing that injects code (INJECTING), for the tools. Pure. */
export function cleanEnv(/** @type {NodeJS.ProcessEnv} */ env) {
  const actions = env.GITHUB_ACTIONS === "true";
  return Object.fromEntries(
    Object.entries(env).filter(([k]) => !INJECTING.test(k) && !(actions && IN_ACTIONS.test(k))),
  );
}

/** The YAML parser the workflows are read with: the version devkit's own lockfile installs and its tests run. */
const YAML = `yaml@${JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).devDependencies.yaml}`;

/**
 * knip, jscpd and the YAML parser from an install this check makes for itself, never the repository's: a fresh directory
 * and npm cache in the system temp, npm's registry named outright, no user, global or project npmrc, and no install
 * scripts, at exact versions. So nothing the repository installs, patches, links or locks (a postinstall rewriting
 * node_modules/knip, a pnpm patch, a shrinkwrap or second lockfile, a hand-made node_modules) is the program that counts
 * or reads a workflow. Each tool runs on this node, with cleanEnv. Nothing is installed until a tool is first used.
 * `DEVKIT_NO_BLOAT_TOOLS` names an install to use instead, for this bin's own tests; the workflows strip it.
 * @param {string} root @param {Partial<Record<"knip" | "jscpd", string>>} tools the config's `tools`, with the defaults
 * @param {string} [given] an install whose node_modules holds them
 * @returns {{ run: Runner, parseYaml: (text: string) => unknown, knipConfigs: () => string[], dir: () => string }}
 */
export function checkTools(root, tools, given = process.env.DEVKIT_NO_BLOAT_TOOLS) {
  /** @type {string | undefined} */
  let at = given || undefined;
  const install = () => {
    const specs = [...Object.entries(tools), ["yaml", YAML]];
    const problems = specs
      .filter(([name, spec]) => !new RegExp(`^${name}@\\d+\\.\\d+\\.\\d+$`).test(spec ?? ""))
      .map(
        ([name, spec]) =>
          `tools.${name} is "${spec}", and the check runs only npm's ${name} at an exact version, "${name}@x.y.z"`,
      );
    if (problems.length) throw new Error(problems.join("; "));
    const made = mkdtempSync(join(tmpdir(), "no-bloat-tools-"));
    // npm refuses one file as both, so each gets its own empty one.
    const [user, global] = [join(made, "userconfig"), join(made, "globalconfig")];
    writeFileSync(user, "");
    writeFileSync(global, "");
    // npm beside this node, as setup-node and every installer lay it out; PATH's only when there is none.
    const cli = join(
      dirname(process.execPath),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const [cmd, pre] = existsSync(cli)
      ? [process.execPath, [cli]]
      : process.platform === "win32"
        ? ["cmd.exe", ["/c", "npm"]]
        : ["npm", []];
    const r = spawnSync(
      cmd,
      [
        ...pre,
        "install",
        "--prefix",
        join(made, "tools"),
        "--no-save",
        "--no-package-lock",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--registry",
        "https://registry.npmjs.org/",
        "--userconfig",
        user,
        "--globalconfig",
        global,
        "--cache",
        join(made, "cache"),
        ...specs.map(([, spec]) => /** @type {string} */ (spec)),
      ],
      { cwd: made, encoding: "utf8", env: cleanEnv(process.env), maxBuffer: BUFFER },
    );
    if (r.error || r.status !== 0)
      throw new Error(
        `npm could not install ${specs.map(([, s]) => s).join(" ")}: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-400)}`,
      );
    return join(made, "tools");
  };
  const dir = () => (at ??= install());
  /** @type {((text: string) => unknown) | undefined} */
  let parse;
  return {
    dir,
    run: (name, args) => {
      const pkg = join(dir(), "node_modules", name);
      const { bin } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
      const file = join(pkg, typeof bin === "string" ? bin : bin[name]);
      const r = spawnSync(process.execPath, [file, ...args], {
        cwd: root,
        encoding: "utf8",
        env: cleanEnv(process.env),
        maxBuffer: BUFFER,
      });
      if (r.error) throw r.error;
      if (r.status !== 0)
        throw new Error(
          `${name} exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 400)}`,
        );
      return r.stdout;
    },
    // Knip's plugins at this version, each with the config files it reads (knip.dev, "Plugins"), read by a node of its own.
    knipConfigs: () => {
      const index = pathToFileURL(
        join(dir(), "node_modules", "knip", "dist", "plugins", "index.js"),
      );
      const r = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const { Plugins } = await import(${JSON.stringify(index.href)}); process.stdout.write(JSON.stringify(Object.values(Plugins).flatMap((p) => (Array.isArray(p.config) ? p.config : []).filter((c) => typeof c === "string"))));`,
        ],
        { encoding: "utf8", env: cleanEnv(process.env), maxBuffer: BUFFER },
      );
      if (r.status !== 0)
        throw new Error(`Knip's plugin list could not be read: ${r.stderr.trim().slice(0, 300)}`);
      return /** @type {string[]} */ (JSON.parse(r.stdout));
    },
    // YAML 1.2, as GitHub reads a workflow (`on` is a key, not true); a key written twice fails rather than one winning.
    parseYaml: (text) => {
      parse ??= (t) =>
        createRequire(join(dir(), "node_modules", "_.js"))("yaml").parse(t, { uniqueKeys: true });
      return parse(text);
    },
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

/**
 * Makes every git call of this run read the repository as committed, whatever an earlier step's GITHUB_ENV line set: no
 * GIT_DIR, GIT_INDEX_FILE or GIT_CONFIG_* of its own, no replace refs, and no fsmonitor hook answering for the files.
 * In Actions only: a local run inside a git hook needs its GIT_ variables.
 */
function hardenGit(/** @type {NodeJS.ProcessEnv} */ env) {
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k)) delete env[k];
  Object.assign(env, {
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "core.untrackedCache",
    GIT_CONFIG_VALUE_1: "false",
  });
}

/**
 * In Actions, what keeps the check from counting the commit the run is for (GITHUB_SHA, which no step can change): HEAD
 * moved, a tracked file marked so git does not look at it, or a tracked file that differs from the commit. The install
 * and the prepare step run the repository's code before the check, and a script that resets the tree to the base would
 * otherwise have the base counted. Untracked files are counted as part of the change, so making one hides nothing.
 * Empty outside Actions, where a local run counts the working tree on purpose.
 * @param {string} root
 * @param {string} [sha]
 */
export function checkoutProblems(
  root,
  sha = process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_SHA : undefined,
) {
  if (!sha) return [];
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const fix =
    "Nothing that runs before the check (an install script, the prepare step) may change the checkout: generate into ignored files.";
  const head = git(["rev-parse", "HEAD"]).trim();
  if (head !== sha)
    return [
      `HEAD is ${head.slice(0, 7)}, not ${sha.slice(0, 7)}, the commit this run is for, so the check would count another commit. ${fix}`,
    ];
  const list = (/** @type {string[]} */ paths) =>
    `${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ` and ${paths.length - 3} more` : ""}`;
  /** @type {string[]} */
  const out = [];
  // `git ls-files -v`: a lower-case tag is assume-unchanged, S is skip-worktree; git status skips both.
  const hidden = git(["ls-files", "-v", "-z"])
    .split("\0")
    .filter((l) => /^(?:[a-z]|S) /.test(l))
    .map((l) => l.slice(2));
  if (hidden.length)
    out.push(
      `${list(hidden)} ${hidden.length === 1 ? "is" : "are"} marked assume-unchanged or skip-worktree, so git does not show a change to them. ${fix}`,
    );
  const changed = git(["status", "--porcelain=v1", "-z", "--untracked-files=no"])
    .split("\0")
    .filter((l) => /^.. /.test(l))
    .map((l) => l.slice(3));
  if (changed.length)
    out.push(
      `${list(changed)} ${changed.length === 1 ? "differs" : "differ"} from ${sha.slice(0, 7)}, the commit this run is for, after the install and the prepare step. ${fix}`,
    );
  return out;
}

/** The default branch a run is checked against when `--lines-from` is not given, the first that resolves. */
const UPSTREAMS = ["origin/HEAD", "origin/main", "origin/master"];

/** A Knip config whose comments can hold a reason (Knip reads them as JSONC), and one in code, which can compute what it skips. */
const KNIP_DATA = /^\.?knip(?:\.config)?\.jsonc?$/;
const KNIP_CODE = /^\.?knip(?:\.config)?\.(?:js|cjs|mjs|ts|cts|mts)$/;
const JSCPD_CONFIG = ".jscpd.json";
/** Every file that says how Knip or jscpd counts, in any format Knip reads (knip.dev, "Configuration"). */
const DEFINITIONS =
  /^(?:\.?knip(?:\.config)?\.(?:json|jsonc|js|cjs|mjs|ts|cts|mts)|\.jscpd\.json)$/;
/**
 * Files that change what the install puts in node_modules or runs while it does: npm's and pnpm's settings, pnpm's hook
 * file, its workspace settings and the patches it applies. A change to one is a change of measure, so it comes alone.
 */
const INSTALL_FILES = /^(?:\.npmrc|\.pnpmfile\.c?js|\.pnpmfile\.mjs|pnpm-workspace\.yaml)$/;
/** The package.json scripts an install runs (npm's and pnpm's lifecycle), and so the code that runs before this check. */
const INSTALL_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
  "dependencies",
];
const LOCKFILES = /^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml)$/;
/** package.json keys that configure a tool instead of the package: a change to one is a change to how it counts. */
const TOOL_KEYS = ["knip", "jscpd"];
/** A use of a devkit workflow or action at a commit, with the `# vX.Y.Z` note Renovate keeps beside it. */
const DEVKIT_USES =
  /(DrDustinEdwards\/devkit\/\.github\/(?:workflows|actions)\/[\w./-]+)@[0-9a-f]{40}(?:[ \t]*#[^\n]*)?/gi;
/**
 * A workflow that runs this check: a job that calls devkit's pr.yml or no-bloat.yml (or its own, in devkit), or a step
 * that runs the bin. A workflow that only names them (devkit's own pr.yml, in a comment) is not one.
 */
const RUNS_CHECK =
  /uses:\s*["']?(?:DrDustinEdwards\/devkit\/|\.\/)\.github\/workflows\/(?:pr|no-bloat)\.yml|devkit-no-bloat|@dustinedwards\/devkit\/bin\/no-bloat\.mjs/i;
const DEVKIT = "@dustinedwards/devkit";
/** How devkit is installed: from its own repository at a release tag, so the check that runs is one that was released. */
const DEVKIT_PIN =
  /^(?:github:|git\+https:\/\/github\.com\/|git\+ssh:\/\/git@github\.com\/)DrDustinEdwards\/devkit(?:\.git)?#v\d+\.\d+\.\d+$/i;
/** package.json keys that can swap what an installed package is. */
const OVERRIDE_KEYS = ["overrides", "resolutions", "pnpm"];

/** -1, 0 or 1 for two x.y.z versions. */
function compareVersions(/** @type {string} */ a, /** @type {string} */ b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  const d = x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  return Math.sign(d);
}

/**
 * Whether a comment says why: three words or more of two letters or more that are not a placeholder ("todo", "reason",
 * "x"), fifteen letters in all. It cannot tell a true reason from a false one; it stops the empty one ("// x").
 */
export function isReason(/** @type {string} */ text) {
  const words = (text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1 && !PLACEHOLDERS.has(w));
  return new Set(words).size >= 3 && words.join("").length >= 15;
}
const PLACEHOLDERS = new Set([
  "todo",
  "tbd",
  "fixme",
  "xxx",
  "wip",
  "reason",
  "why",
  "because",
  "ignore",
  "ignored",
  "jscpd",
  "start",
  "end",
  "public",
  "beta",
  "alias",
  "temp",
  "hack",
  "later",
  "na",
]);

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
  /** @type {Config} */ current = {},
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
  const config = /** @type {Config | null} */ (old === null ? null : JSON.parse(old));
  const changed = [
    ...git(["diff", "--name-only", "-z", base]).split("\0").filter(Boolean),
    ...untracked,
  ];
  const created = [
    ...git(["diff", "--name-only", "--diff-filter=A", "-z", base]).split("\0").filter(Boolean),
    ...untracked,
  ];
  // Every line the change adds, with its file, as `git diff -U0` prints it, untracked files whole.
  /** @type {Array<{ path: string, text: string }>} */
  const added = [];
  let path = "";
  for (const l of git(["diff", "-U0", "--no-color", "--no-ext-diff", base]).split("\n")) {
    if (l.startsWith("+++ ")) {
      const p = l.slice(4).replace(/\t$/, "");
      path = (p.startsWith('"') ? JSON.parse(p) : p).replace(/^b\//, "");
    } else if (l.startsWith("+")) added.push({ path, text: l.slice(1) });
  }
  for (const p of untracked)
    if (lstatSync(join(root, p)).isFile())
      for (const text of (now(p) ?? "").split("\n")) added.push({ path: p, text });
  // Tracked files a .gitignore hides, with the line that hides each: Knip skips them though git keeps them.
  const hiddenPaths = git(["ls-files", "-z", "-ci", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);
  /** @type {Array<{ source: string, line: string, pattern: string, path: string }>} */
  const ignored = [];
  if (hiddenPaths.length) {
    const r = spawnSync("git", ["check-ignore", "-v", "-z", "--no-index", "--stdin"], {
      cwd: root,
      input: hiddenPaths.join("\0"),
      encoding: "utf8",
      maxBuffer: BUFFER,
    });
    const f = r.stdout.split("\0");
    for (let i = 0; i + 3 < f.length; i += 4)
      ignored.push({ source: f[i], line: f[i + 1], pattern: f[i + 2], path: f[i + 3] });
  }
  return {
    config,
    configPath,
    changed,
    created,
    added,
    ignored,
    // A Knip config a run names with --config, at the base or now, is a definition like knip.json.
    definitions: [
      ...new Set(
        [config, current].flatMap((c) =>
          flagValues(
            (c?.knip ?? []).flatMap((r) => r.args ?? []),
            ["--config", "-c"],
          ).map((p) => posix.normalize(p)),
        ),
      ),
    ],
    before,
    now,
  };
}

/**
 * The tracked files a change leaves hidden from Knip by a .gitignore line (Knip reads none of them): one the change adds
 * or edits, and any a line new in the change hides. Pure.
 * @param {Array<{ source: string, line: string, pattern: string, path: string }>} ignored
 * @param {string[]} changed @param {(path: string) => string | null} before
 */
export function hiddenFiles(ignored, changed, before) {
  const touched = new Set(changed);
  return ignored
    .filter(
      ({ source, pattern, path }) =>
        touched.has(path) ||
        (touched.has(source) &&
          !(before(source) ?? "").split("\n").some((l) => l.trim() === pattern.trim())),
    )
    .map(
      ({ source, line, pattern, path }) =>
        `${path} is tracked, but ${source} line ${line} (${pattern}) hides it from Knip, so nothing in it is counted. Remove the file, or the ignore line.`,
    );
}

/**
 * The files a change creates that jscpd skips (unreadFiles): a copy there is never counted. The
 * count alone misses one when another file starts being read in the same change. Pure.
 * @param {string[]} unread @param {string[]} created
 */
export function unreadAdded(unread, created) {
  const fresh = new Set(created);
  return unread
    .filter((p) => fresh.has(p))
    .map(
      (p) =>
        `${p} is new, and jscpd does not read it, so a copy in it is never counted. Widen jscpd's path in a change of its own, or move the file where jscpd reads.`,
    );
}

/**
 * A directory with more than one lockfile: npm reads npm-shrinkwrap.json before package-lock.json, and pnpm its own, so
 * which one installs depends on the tool, and the other is a stale record of what is installed. Pure.
 * @param {string[]} paths every file in the repository
 */
export function lockfileProblems(paths) {
  /** @type {Map<string, string[]>} */
  const byDir = new Map();
  for (const p of paths)
    if (LOCKFILES.test(posix.basename(p)))
      byDir.set(posix.dirname(p), [...(byDir.get(posix.dirname(p)) ?? []), posix.basename(p)]);
  return [...byDir]
    .filter(([, names]) => names.length > 1)
    .map(
      ([dir, names]) =>
        `${dir === "." ? "the root" : dir} has ${names.join(" and ")}. Keep the one lockfile its package manager installs from, and delete the other.`,
    );
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
 * format, a Knip config a run names with --config, a Knip plugin's config and what it imports (`plugins`,
 * knipPluginFiles), package.json's `knip` or `jscpd`, the no-bloat config outside `baseline` and `tools`). `workflow`: the workflows it changes that run the check, other than moving their devkit pins
 * (a workflow is no file the counts read, so it is never code). `back`: the shared packages it moves to an older release.
 * `refused`: what no change may do to the tools that measure: a `tools` entry that is not `<tool>@x.y.z` or is older than
 * the base's, and a devkit dependency that is not a DrDustinEdwards/devkit release tag or is overridden. Pure.
 * @param {{ changed: string[], configPath: string, definitions?: string[], plugins?: string[], before: (path: string) => string | null, now: (path: string) => string | null }} change
 * @param {(text: string) => unknown} [parseYaml] for the workflows (checkTools)
 */
export function classify(change, parseYaml = noYaml) {
  const { changed, configPath } = change;
  /** @type {string[]} */
  const definition = [];
  /** @type {string[]} */
  const back = [];
  let code = false;
  /** @type {string[]} */
  const workflow = [];
  /** @type {string[]} */
  const refused = [];
  const json = (/** @type {string | null} */ text) => {
    try {
      return text === null ? null : JSON.parse(text);
    } catch {
      return null;
    }
  };
  const without = (/** @type {any} */ o, /** @type {string[]} */ keys) =>
    JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k))));
  // What an install runs or patches, apart from the rest of the manifest.
  const hooks = (/** @type {any} */ m) =>
    JSON.stringify([
      INSTALL_SCRIPTS.map((k) => m?.scripts?.[k] ?? null),
      m?.pnpm?.patchedDependencies ?? null,
    ]);
  const rest = (/** @type {any} */ m) => ({
    ...m,
    scripts: Object.fromEntries(
      Object.entries(m?.scripts ?? {}).filter(([k]) => !INSTALL_SCRIPTS.includes(k)),
    ),
    pnpm: m?.pnpm && without(m.pnpm, ["patchedDependencies"]),
  });
  for (const p of changed) {
    // A workspace has a manifest and a lockfile per package, so each is read by its name in any directory.
    const name = posix.basename(p);
    if (LOCKFILES.test(name)) continue;
    if (
      DEFINITIONS.test(name) ||
      INSTALL_FILES.test(name) ||
      /(?:^|\/)patches\//.test(p) ||
      change.definitions?.includes(p) ||
      change.plugins?.includes(p)
    ) {
      definition.push(p);
      continue;
    }
    if (p === configPath) {
      const [a, b] = [json(change.before(p)), json(change.now(p))];
      if (without(a, ["baseline", "tools"]) !== without(b, ["baseline", "tools"]))
        definition.push(`${p} (outside baseline and tools)`);
      refused.push(...toolSpecs(a?.tools, b?.tools));
      continue;
    }
    if (name === "package.json") {
      const [a, b] = [json(change.before(p)), json(change.now(p))];
      if (!a || !b) {
        code = true;
        continue;
      }
      for (const key of TOOL_KEYS)
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))
          definition.push(`package.json "${key}"`);
      // An install script or a patch runs before the check, so it changes what is measured, not what is counted.
      if (hooks(a) !== hooks(b)) definition.push(`${p} install scripts or patches`);
      if (
        without(rest(a), [...DEPENDENCY_FIELDS, ...TOOL_KEYS]) !==
        without(rest(b), [...DEPENDENCY_FIELDS, ...TOOL_KEYS])
      )
        code = true;
      // An override swaps the package that is installed under devkit's name, whatever the dependency says.
      for (const key of OVERRIDE_KEYS)
        if (
          JSON.stringify(a[key]) !== JSON.stringify(b[key]) &&
          JSON.stringify(b[key] ?? "").includes(DEVKIT)
        )
          refused.push(
            `${p} "${key}" names ${DEVKIT}, which replaces the devkit whose check runs. Install devkit only through its dependency, at a release tag.`,
          );
      const shared = new Set(PACKAGES.map((x) => x.name));
      for (const field of DEPENDENCY_FIELDS) {
        const [was, is] = [a[field] ?? {}, b[field] ?? {}];
        // The check that runs is the installed devkit's bin: another repository, a path or a range would run another one.
        if (DEVKIT in is && is[DEVKIT] !== was[DEVKIT] && !DEVKIT_PIN.test(is[DEVKIT]))
          refused.push(
            `${p} ${field} has ${DEVKIT} at "${is[DEVKIT]}". Pin devkit to a release tag of its own repository, "github:DrDustinEdwards/devkit#vX.Y.Z", so the check that runs is the one released.`,
          );
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
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) {
      // Moving only the devkit pins is the bump Renovate and the rollout open; anything else in a workflow that runs the
      // check (a prepare step, the config input) can change what it measures.
      const [was, is] = [change.before(p) ?? "", change.now(p) ?? ""];
      const pinless = (/** @type {string} */ t) => t.replace(DEVKIT_USES, "$1@<pin>");
      if (pinless(was) !== pinless(is) && RUNS_CHECK.test(`${was}\n${is}`)) workflow.push(p);
      refused.push(...workflowInputs(p, was, is, parseYaml));
      continue;
    }
    code = true;
  }
  return { code, definition, workflow, back, refused };
}

/** A Knip plugin config in code, which Knip runs in its own process, and the extensions its local imports resolve to. */
const CODE_CONFIG = /\.(?:[cm]?[jt]sx?)$/;
const IMPORT_EXTS = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".json"];

/**
 * The repository's files that a Knip plugin reads as its config (`patterns`, Knip's own list at the tool's version,
 * checkTools knipConfigs), at the root or in a workspace, and the local modules a config in code imports, followed
 * through literal relative specifiers. Knip imports a config in code (.mocharc.cjs, vite.config.ts), so one can print a
 * report of its own or patch Knip; a config in data (tsconfig.json, .mocharc.json) can make any file an entry, whose
 * exports Knip then never reports. Either is a change of how Knip counts. package.json and the workflows are judged on
 * their own (classify). Pure.
 * @param {string[]} paths @param {string[]} patterns @param {(path: string) => string} read
 */
export function knipPluginFiles(paths, patterns, read) {
  const own = patterns.filter((g) => !g.startsWith("package.") && !g.startsWith(".github/"));
  const isConfig = (/** @type {string} */ p) =>
    own.some((g) => posix.matchesGlob(p, g) || posix.matchesGlob(p, `**/${g}`));
  const files = new Set(paths);
  const out = new Set(paths.filter(isConfig));
  const queue = [...out].filter((p) => CODE_CONFIG.test(p));
  while (queue.length) {
    const p = /** @type {string} */ (queue.pop());
    let text = "";
    try {
      text = read(p);
    } catch {
      continue;
    }
    for (const m of text.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`](\.{1,2}\/[^"'`]+)["'`]/g,
    )) {
      const to = posix.normalize(posix.join(posix.dirname(p), m[1]));
      const bare = to.replace(/\.[cm]?jsx?$/, "");
      const hit = [
        to,
        ...IMPORT_EXTS.map((e) => bare + e),
        ...IMPORT_EXTS.map((e) => `${to}/index${e}`),
      ].find((c) => files.has(c));
      if (hit && !out.has(hit)) {
        out.add(hit);
        if (CODE_CONFIG.test(hit)) queue.push(hit);
      }
    }
  }
  return [...out];
}

/** A parser for a change that has no workflow to read. */
const noYaml = () => {
  throw new Error("no YAML parser was given");
};

/** The inputs of devkit's pr.yml and no-bloat.yml that say whether the check runs, on what install, and what runs first. */
const CHECK_INPUTS = {
  pr: [
    "node",
    "node-version-file",
    "package-manager",
    "install",
    "no-bloat",
    "no-bloat-prepare",
    "no-bloat-config",
  ],
  "no-bloat": ["node-version-file", "package-manager", "install", "prepare", "config"],
};
/** A job's `uses` that calls devkit's pr.yml or no-bloat.yml, at any pin. */
const CALLS = /^DrDustinEdwards\/devkit\/\.github\/workflows\/(pr|no-bloat)\.yml@/i;

/** A parsed value with its keys sorted, as JSON: two parses compare equal whatever order or style the YAML wrote. */
function canonical(/** @type {unknown} */ value) {
  /** @param {unknown} v @returns {unknown} */
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(/** @type {Record<string, unknown>} */ (v)[k])]),
          )
        : v;
  return JSON.stringify(sort(value)) ?? "undefined";
}

/**
 * The part of a parsed job that decides whether it runs the check: the job, with its `uses` as the workflow it calls (the
 * pin left out) and its `with` cut to the CHECK_INPUTS, each named in lower case, as GitHub reads input names. Null for
 * a job that calls neither workflow.
 * @param {unknown} job
 * @returns {{ job: Record<string, unknown>, workflow: "pr" | "no-bloat", inputs: Record<string, unknown>, twice: string[] } | null}
 */
function checkPart(job) {
  if (!job || typeof job !== "object") return null;
  const j = /** @type {Record<string, unknown>} */ (job);
  const m = typeof j.uses === "string" ? CALLS.exec(j.uses.trim()) : null;
  if (!m) return null;
  const workflow = /** @type {"pr" | "no-bloat"} */ (m[1].toLowerCase());
  /** @type {Record<string, unknown>} */
  const inputs = {};
  const twice = [];
  const given = j.with;
  if (given && typeof given === "object" && !Array.isArray(given))
    for (const [k, v] of Object.entries(given)) {
      const key = k.toLowerCase();
      if (!CHECK_INPUTS[workflow].includes(key)) continue;
      if (key in inputs) twice.push(key);
      inputs[key] = v;
    }
  // A `with` that is not a map is kept whole: GitHub refuses it, and so does the comparison.
  const rest = { ...j, uses: workflow, with: given && typeof given === "object" ? null : given };
  return { job: rest, workflow, inputs, twice };
}

/** The jobs `id` waits for in `jobs`, directly or through another. */
function needsOf(/** @type {Record<string, any>} */ jobs, /** @type {string} */ id) {
  /** @type {Set<string>} */
  const seen = new Set();
  const walk = (/** @type {string} */ j) => {
    const n = jobs[j]?.needs;
    for (const d of typeof n === "string" ? [n] : Array.isArray(n) ? n : [])
      if (typeof d === "string" && !seen.has(d)) {
        seen.add(d);
        walk(d);
      }
  };
  walk(id);
  return seen;
}

/**
 * What a change to a workflow does to the check itself, which no pull request may do. The workflow is parsed as YAML,
 * as GitHub reads it (a flow map, a quoted or upper-case key, an anchor, CRLF line ends are the same data), and for each
 * job that calls pr.yml or no-bloat.yml at the base it refuses: dropping the job; any change to the job but its pin and
 * the inputs that are not CHECK_INPUTS (its `if`, `needs`, `strategy`, the workflow it calls); a change to an input that
 * turns the check off or decides what runs before it (the install, the prepare step, the config, the Node); any change to
 * a job it waits for (`needs`, which a skipped job skips too); and any change outside `jobs` (`on`, whose filters stop the
 * workflow running at all, `concurrency`, `permissions`). A file that no longer parses is refused too. The run that judges
 * such a change is the change's own, with its inputs, so a check it turns off never runs to refuse it; so it is refused
 * here whenever it does run, pr.yml refuses the rest (`--inputs-from`), and Capsid's nightly watch reports any that
 * merged. Pure, given the parser.
 * @param {string} path @param {string} was @param {string} is @param {(text: string) => unknown} parseYaml
 */
export function workflowInputs(path, was, is, parseYaml) {
  const read = (/** @type {string} */ text) => {
    try {
      const doc = parseYaml(text);
      return /** @type {Record<string, any>} */ (doc && typeof doc === "object" ? doc : {});
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  };
  /** @type {string[]} */
  const out = [];
  const say = (/** @type {string} */ what) =>
    out.push(
      `${path} ${what}, which decides whether the no-bloat check runs and what runs before it. A pull request cannot change how it is itself checked: the owner makes that change past the check.`,
    );
  const a = read(was);
  if (a instanceof Error) {
    // A base that names devkit's workflows and does not parse cannot be compared; one that names neither ran no check.
    if (/DrDustinEdwards\/devkit\/\.github\/workflows\/(?:pr|no-bloat)\.ya?ml/i.test(was))
      say(`could not be read as YAML at the base (${a.message.split("\n")[0]})`);
    return out;
  }
  const jobsA = a.jobs && typeof a.jobs === "object" ? a.jobs : {};
  const callers = Object.keys(jobsA).filter((id) => checkPart(jobsA[id]));
  if (!callers.length) return out;
  const b = read(is);
  if (b instanceof Error) {
    say(`no longer parses as YAML (${b.message.split("\n")[0]})`);
    return out;
  }
  const jobsB = b.jobs && typeof b.jobs === "object" ? b.jobs : {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (key !== "jobs" && canonical(a[key]) !== canonical(b[key]))
      say(`changes its top-level "${key}"`);
  const show = (/** @type {unknown} */ v) =>
    JSON.stringify(v === undefined ? "(default)" : typeof v === "string" ? v : canonical(v));
  for (const id of callers) {
    const [then, now] = [checkPart(jobsA[id]), checkPart(jobsB[id])];
    if (!then) continue;
    if (!(id in jobsB)) say(`drops the job "${id}" that runs it`);
    else if (!now)
      say(`changes the job "${id}" so it no longer calls devkit's ${then.workflow}.yml`);
    else {
      if (now.twice.length) say(`names ${now.twice.join(", ")} twice in the job "${id}"`);
      for (const key of new Set([...Object.keys(then.job), ...Object.keys(now.job)]))
        if (canonical(then.job[key]) !== canonical(now.job[key]))
          say(
            key === "uses"
              ? `moves the job "${id}" from ${then.workflow}.yml to ${now.workflow}.yml`
              : key === "with"
                ? `changes the job "${id}"'s with from a map`
                : `changes the job "${id}"'s ${key} from ${show(then.job[key])} to ${show(now.job[key])}`,
          );
      for (const k of CHECK_INPUTS[then.workflow])
        if (canonical(then.inputs[k]) !== canonical(now.inputs[k]))
          say(`changes ${k} from ${show(then.inputs[k])} to ${show(now.inputs[k])}`);
    }
    for (const dep of new Set([...needsOf(jobsA, id), ...needsOf(jobsB, id)]))
      if (canonical(jobsA[dep]) !== canonical(jobsB[dep]))
        say(`changes the job "${dep}" that "${id}" waits for (needs)`);
  }
  return out;
}

/**
 * What a change to the config's `tools` may not do: name a tool this check does not run, run one that is not npm's at an
 * exact version (a path, a tag or another package would measure with something else), or move one to an older release.
 * @param {Record<string, string> | undefined} was @param {Record<string, string> | undefined} is
 */
function toolSpecs(was, is) {
  /** @type {string[]} */
  const out = [];
  for (const name of Object.keys(is ?? {}))
    if (!(name in DEFAULT_TOOLS)) out.push(`tools.${name} names no tool this check runs.`);
  for (const [name, fallback] of Object.entries(DEFAULT_TOOLS)) {
    const [old, spec] = [
      was?.[/** @type {"knip"} */ (name)] ?? fallback,
      is?.[/** @type {"knip"} */ (name)] ?? fallback,
    ];
    if (old === spec) continue;
    const exact = new RegExp(`^${name}@(\\d+\\.\\d+\\.\\d+)$`);
    const [o, n] = [exact.exec(old), exact.exec(spec)];
    if (!n)
      out.push(
        `tools.${name} is "${spec}". The check runs ${name} from npm at an exact version, "${name}@x.y.z".`,
      );
    else if (o && compareVersions(n[1], o[1]) < 0)
      out.push(
        `tools.${name} moves from ${old} to ${spec}, an older release. Keep each tool at its version or newer.`,
      );
  }
  return out;
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
  } else if (kind.definition.length || kind.workflow.length) {
    const what = [...kind.definition, ...kind.workflow].join(", ");
    for (const [tool, counts] of Object.entries(was)) {
      if (skip(tool, counts)) continue;
      const after = /** @type {Record<string, number>} */ (now[tool] ?? {});
      for (const [key, n] of Object.entries(/** @type {Record<string, number>} */ (counts)))
        if (key !== "percentage" && typeof n === "number" && (after[key] ?? 0) < n)
          out.push(
            `${tool}: this change of how it is counted (${what}) lowers ${key} from ${n} to ${after[key] ?? 0}, so the narrower measure hides what it no longer reads. Measure as much as before; an exception goes in knip.json's ignore list with its reason.`,
          );
    }
  }
  out.push(...(kind.refused ?? []));
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

/**
 * The entries of jscpd's `--ignore` and `--ignore-pattern` in a config's jscpd args. jscpd splits both on commas, so
 * each is its own entry: dropping one from the list is a wider measure, not a new value.
 */
function jscpdIgnores(/** @type {Config | null} */ config) {
  const args = config?.jscpd && typeof config.jscpd === "object" ? (config.jscpd.args ?? []) : [];
  return flagValues(args, ["--ignore", "--ignore-pattern", "-i"])
    .flatMap((v) => v.split(","))
    .filter(Boolean);
}

/** The indexes of the lines of `now` that are not in `was`, by their longest common subsequence. */
function addedLines(/** @type {string} */ was, /** @type {string} */ now) {
  // A list that gains an entry gives the old last one a comma; that line is not new.
  const [a, b] = [was, now].map((t) => t.split("\n").map((l) => l.trim().replace(/,$/, "")));
  const added = new Set();
  // A config past this size is read as all new, which only asks for more reasons.
  if (a.length * b.length > 4_000_000) return new Set(b.keys());
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      rows[i][j] =
        a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  let [i, j] = [0, 0];
  while (j < b.length)
    if (i < a.length && a[i] === b[j]) [i, j] = [i + 1, j + 1];
    else if (i < a.length && rows[i + 1][j] >= rows[i][j + 1]) i++;
    else added.add(j++);
  return added;
}

/**
 * The lines a change adds to a Knip config (JSON with comments) that say nothing about why. Every line Knip reads tells it
 * what not to count or where not to look (an ignore entry, a rule turned off, a narrower project), and one that hides
 * nothing yet hides the next change's code, so each new line needs its reason: a comment on the line, or in the comment
 * block directly above it, new in the change and saying something (isReason). A line that only opens or closes a list or
 * object, or names the schema, needs none. Pure.
 */
function knipLinesWithoutReason(/** @type {string | null} */ was, /** @type {string} */ now) {
  const lines = now.split("\n");
  const blanked = blankComments(now).split("\n");
  const added = addedLines(was ?? "", now);
  const commentOf = (/** @type {number} */ i) =>
    lines[i]
      .split("")
      .map((c, k) => (blanked[i][k] === c ? " " : c))
      .join("");
  const isComment = (/** @type {number} */ i) => !blanked[i].trim() && Boolean(lines[i].trim());
  /** @type {number[]} */
  const out = [];
  for (const i of added) {
    const code = blanked[i].trim();
    if (!code || /^[\s{}[\](),;]*$/.test(code) || /^["']?\$schema["']?\s*:/.test(code)) continue;
    if (/^["']?[\w$@./*-]+["']?\s*:\s*[[{]\s*$/.test(code)) continue;
    if (isReason(commentOf(i))) continue;
    let j = i - 1;
    /** @type {number[]} */
    const block = [];
    while (j >= 0 && isComment(j)) block.unshift(j--);
    if (block.some((k) => added.has(k)) && isReason(block.map(commentOf).join(" "))) continue;
    out.push(i);
  }
  return out;
}

/**
 * The options jscpd counts with, from .jscpd.json and the config's args (which win, as on jscpd's command line), and
 * `path`, the directories and files it reads: the args' positional ones, else the file's, else the root.
 */
function jscpdOptions(/** @type {unknown} */ file, /** @type {Config | null} */ config) {
  const args = config?.jscpd && typeof config.jscpd === "object" ? (config.jscpd.args ?? []) : [];
  /** @type {Record<string, unknown>} */
  const opts = { ...JSCPD_DEFAULTS, ...(file && typeof file === "object" ? file : {}) };
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].includes("=") ? args[i].split(/=(.*)/s) : [args[i], undefined];
    const key = JSCPD_FLAGS[flag];
    if (key) opts[key] = inline ?? args[++i];
    else if (JSCPD_SWITCHES[flag]) opts[JSCPD_SWITCHES[flag]] = true;
    else if (JSCPD_VALUED.has(flag) && inline === undefined) i++;
    else if (!flag.startsWith("-")) positional.push(flag);
  }
  if (positional.length) opts.path = positional;
  const paths = Array.isArray(opts.path) ? opts.path : opts.path ? [opts.path] : ["."];
  opts.path = paths.map((p) => posix.normalize(String(p).split(sep).join("/")).replace(/\/$/, ""));
  return opts;
}
/** jscpd's other flags that take a value, so the value is not read as a path. */
const JSCPD_VALUED = new Set([
  "--ignore",
  "-i",
  "--ignore-pattern",
  "--reporters",
  "-r",
  "--output",
  "-o",
  "--threshold",
  "-t",
  "--store",
  "--exitCode",
]);
const JSCPD_DEFAULTS = {
  minLines: 5,
  minTokens: 50,
  maxLines: 1000,
  maxSize: "100kb",
  mode: "mild",
};
/** @type {Record<string, string>} */
const JSCPD_FLAGS = {
  "--min-lines": "minLines",
  "-l": "minLines",
  "--min-tokens": "minTokens",
  "-k": "minTokens",
  "--max-lines": "maxLines",
  "-x": "maxLines",
  "--max-size": "maxSize",
  "-z": "maxSize",
  "--format": "format",
  "-f": "format",
  "--mode": "mode",
  "-m": "mode",
  "--pattern": "pattern",
  "-p": "pattern",
  "--formats-exts": "formatsExts",
  "--config": "config",
  "-c": "config",
};
/** @type {Record<string, string>} */
const JSCPD_SWITCHES = {
  "--gitignore": "gitignore",
  "-g": "gitignore",
  "--skipLocal": "skipLocal",
  "--noSymlinks": "noSymlinks",
  "-n": "noSymlinks",
};

/** A jscpd size ("100kb", "1mb", 2048) in bytes. */
function bytes(/** @type {unknown} */ size) {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(String(size).trim());
  if (!m) return NaN;
  return Number(m[1]) * 1024 ** ["b", "kb", "mb", "gb"].indexOf((m[2] ?? "b").toLowerCase());
}

/**
 * The ways a change narrows what jscpd counts as a copy, so that nothing it reads now drops but the next change's copy is
 * missed: a larger minimum or a smaller maximum, fewer formats, another mode than strict, a file pattern, an extension map
 * or a config path changed, gitignore, skipLocal or noSymlinks turned on, or a path that no longer covers one it read
 * (a narrowing to today's file list); a new file it then skips is unreadAdded's. And a knip run whose arguments change, since the no-bloat config is strict JSON and cannot say why.
 * Pure.
 * @param {{ before: (path: string) => string | null, now: (path: string) => string | null }} change
 * @param {Config} config @param {Config | null} base
 */
export function narrowed(change, config, base) {
  const json = (/** @type {string | null} */ t) => (t === null ? null : JSON.parse(t));
  const was = jscpdOptions(json(change.before(JSCPD_CONFIG)), base);
  const is = jscpdOptions(json(change.now(JSCPD_CONFIG)), config);
  const formats = (/** @type {unknown} */ f) =>
    f === undefined
      ? null
      : (Array.isArray(f) ? f : String(f).split(",")).map((x) => String(x).trim());
  /** @type {string[]} */
  const why = [];
  const show = (/** @type {unknown} */ v) => JSON.stringify(v ?? null);
  for (const key of ["minLines", "minTokens"])
    if (Number(is[key]) > Number(was[key])) why.push(`${key} from ${was[key]} to ${is[key]}`);
  if (Number(is.maxLines) < Number(was.maxLines))
    why.push(`maxLines from ${was.maxLines} to ${is.maxLines}`);
  if (!(bytes(is.maxSize) >= bytes(was.maxSize)))
    why.push(`maxSize from ${was.maxSize} to ${is.maxSize}`);
  const [f0, f1] = [formats(was.format), formats(is.format)];
  if (f1 && (!f0 || f0.some((f) => !f1.includes(f))))
    why.push(`format from ${f0 ? f0.join(",") : "every format"} to ${f1.join(",")}`);
  if (is.mode !== was.mode && is.mode !== "strict") why.push(`mode from ${was.mode} to ${is.mode}`);
  for (const key of ["pattern", "formatsExts", "config"])
    if (show(is[key]) !== show(was[key]))
      why.push(`${key} from ${show(was[key])} to ${show(is[key])}`);
  for (const key of ["gitignore", "skipLocal", "noSymlinks"])
    if (is[key] === true && was[key] !== true) why.push(`${key} turned on`);
  // A path may widen, never drop what it read: each old one stays, or a directory above it is read.
  const covers = (/** @type {string} */ wide, /** @type {string} */ p) =>
    wide === "." || wide === p || p.startsWith(`${wide}/`);
  const [p0, p1] = [/** @type {string[]} */ (was.path), /** @type {string[]} */ (is.path)];
  const dropped = p0.filter((p) => !p1.some((w) => covers(w, p)));
  if (dropped.length)
    why.push(`path from ${show(p0)} to ${show(p1)}, which no longer reads ${dropped.join(", ")}`);
  const out = why.map(
    (w) =>
      `this change narrows what jscpd counts as a copy (${w}), so a copy it misses from now on is never counted. Leave it as it was; a real exception is marked in the source with \`jscpd:ignore-start\` and its reason.`,
  );
  for (const run of config.knip ?? []) {
    const old = (base?.knip ?? []).find((r) => r.label === run.label);
    if (old && show(old.args ?? []) !== show(run.args ?? []))
      out.push(
        `the knip run "${run.label}" changes its args from ${show(old.args ?? [])} to ${show(run.args ?? [])}, and the no-bloat config is strict JSON, so it cannot say why. Put the change in the Knip config with a comment, or add a run.`,
      );
  }
  return out;
}

/**
 * The comment on one added line, where a marker or a tag means something: the whole line inside a block comment (it starts
 * with `*`) or an HTML comment, the comment part of a line of code (a mention in a string or a regular expression is not
 * one), and in any other file the line itself.
 */
function commentPart(/** @type {string} */ path, /** @type {string} */ text) {
  if (/^\s*(?:\*|<!--)/.test(text) || !/\.(?:[cm]?[jt]sx?|css|vue|svelte|astro)$/.test(path))
    return text;
  const blanked = blankComments(text);
  return text
    .split("")
    .map((c, k) => (blanked[k] === c ? " " : c))
    .join("");
}

/** A tag after which Knip never reports an export (knip's PUBLIC_TAG, BETA_TAG and ALIAS_TAG). */
const SKIP_TAGS = /(?<!`)@(public|beta|alias)\b(?!`)(.*)$/;
/** Files whose comments can tag an export. */
const TAGGED = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;

/**
 * The exceptions a change adds with no reason: a line new to a Knip config without a comment saying why
 * (knipLinesWithoutReason), a Knip config in code or package.json's `knip` or `jscpd` changed (neither can hold a reason
 * this reads), an entry new to .jscpd.json or to the config's jscpd `--ignore` (strict JSON, so no reason can be written
 * there), and a `jscpd:ignore-start` marker or an `@public`, `@beta` or `@alias` tag with no reason after it. A reason is
 * what the reviewer reads; an exception without one is a bolt-on let in quietly. Pure.
 * @param {{ changed?: string[], definitions?: string[], before: (path: string) => string | null, now: (path: string) => string | null, added: Array<{ path: string, text: string }> }} change
 * @param {Config} config @param {Config | null} base
 */
export function unreasoned(change, config, base) {
  /** @type {string[]} */
  const out = [];
  const fresh = (/** @type {string[]} */ was, /** @type {string[]} */ is) =>
    [...new Set(is)].filter((e) => !was.includes(e));
  for (const path of change.changed ?? []) {
    const name = posix.basename(path);
    const now = change.now(path);
    const was = change.before(path);
    if (KNIP_CODE.test(name) && now !== null)
      out.push(
        `${path}: a Knip config in code can compute what it skips, which this check cannot read. Write it as knip.jsonc, where each line can carry its reason.`,
      );
    else if ((KNIP_DATA.test(name) || change.definitions?.includes(path)) && now !== null) {
      const lines = now.split("\n");
      for (const i of knipLinesWithoutReason(was, now))
        out.push(
          `${path} line ${i + 1} (${lines[i].trim()}) is new and says nothing about why. A Knip config says what not to count: put a comment on the line, or directly above it, giving the reason (who uses it, or why Knip must not read it).`,
        );
    } else if (name === "package.json" && now !== null) {
      const [a, b] = [was === null ? {} : JSON.parse(was), JSON.parse(now)];
      for (const key of TOOL_KEYS)
        if (b[key] !== undefined && JSON.stringify(a[key]) !== JSON.stringify(b[key]))
          out.push(
            `${path} "${key}" changes, and package.json is strict JSON, so it cannot say why. Move it to knip.jsonc (or .jscpd.json and \`jscpd:ignore-start\`), where an exception carries its reason.`,
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
  for (const { path, text } of change.added) {
    const said = commentPart(path, text);
    // A mention in backticks is prose about the marker or tag, not one.
    const marker = /(?<!`)jscpd:ignore-start(?!`)(.*)$/.exec(said);
    const tag = TAGGED.test(path) ? SKIP_TAGS.exec(said) : null;
    // The reason is what follows inside the comment, never the code after it closes.
    if (marker && !isReason(marker[1].split(/\*\/|-->/)[0]))
      out.push(
        `${path}: a new \`jscpd:ignore-start\` gives no reason (${text.trim()}). Write why after the marker on the same line, in words a reviewer can check, or remove the copy.`,
      );
    // Knip never reports an export with one of these tags, so a tag is an exception like any other.
    else if (tag && !isReason(tag[2].split("*/")[0]))
      out.push(
        `${path}: a new \`@${tag[1]}\` gives no reason (${text.trim()}). Knip skips the export it tags: write who uses it after the tag, or remove the export.`,
      );
  }
  return out;
}

/**
 * What is wrong with the devkit installed at `dir`, for the workflows to check before they run its bin. `ownDir` is the
 * devkit the workflow runs from, which the caller pinned. The installed version must be an exact x.y.z no older than
 * its own, and every file of the package (the `files` its own package.json lists) must be byte for byte the file at that
 * version: its own file at the same version, else the file at the version's tag (`blobsAt` gives each path's git blob id
 * there). So a fork, a path, a lockfile that resolves elsewhere or an install script that rewrites the bin each fails,
 * whatever version it claims. package.json is not compared: it only names the version the files are judged against.
 * @param {string} dir @param {string} ownDir @param {(tag: string) => Map<string, string>} blobsAt
 */
export function installedRelease(dir, ownDir, blobsAt) {
  const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const own = JSON.parse(readFileSync(join(ownDir, "package.json"), "utf8"));
  const exact = /^\d+\.\d+\.\d+$/;
  if (!exact.test(version) || !exact.test(own.version))
    return [`devkit ${version} is installed, and only a release's x.y.z version can be judged.`];
  if (compareVersions(version, own.version) < 0)
    return [
      `devkit ${version} is installed, older than the ${own.version} this workflow runs. Move devkit forward, never back.`,
    ];
  const blob = (/** @type {Buffer} */ body) =>
    createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
  /** @type {(path: string) => string | undefined} */
  let expected;
  if (version === own.version)
    expected = (path) =>
      existsSync(join(ownDir, path)) ? blob(readFileSync(join(ownDir, path))) : undefined;
  else {
    /** @type {Map<string, string>} */
    let blobs;
    try {
      blobs = blobsAt(`v${version}`);
    } catch (error) {
      return [`devkit's tag v${version} could not be read: ${messageOf(error)}`];
    }
    expected = (path) => blobs.get(path);
  }
  /** @type {string[]} */
  const out = [];
  const check = (/** @type {string} */ path) => {
    const full = join(dir, path);
    if (!existsSync(full)) return;
    if (lstatSync(full).isDirectory()) {
      for (const entry of readdirSync(full)) check(`${path}/${entry}`);
      return;
    }
    const want = expected(path);
    if (want !== blob(readFileSync(full)))
      out.push(
        `${path} in the installed devkit is not the file at ${version}${want ? "" : ", which has no such file"}. Install devkit from its release tag, and let nothing rewrite it.`,
      );
  };
  for (const entry of own.files ?? ["bin"]) check(entry);
  if (!existsSync(join(dir, "bin", "no-bloat.mjs")))
    out.push("the installed devkit has no bin/no-bloat.mjs.");
  return out;
}

/** Each path's blob id at a devkit tag, fetched from GitHub into a scratch repository. */
function devkitBlobs(/** @type {string} */ tag) {
  const dir = mkdtempSync(join(tmpdir(), "devkit-tag-"));
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(["init", "-q", "--bare"]);
    git([
      "fetch",
      "-q",
      "--depth=1",
      "--no-tags",
      "https://github.com/DrDustinEdwards/devkit",
      `refs/tags/${tag}`,
    ]);
    return new Map(
      git(["ls-tree", "-r", "-z", "FETCH_HEAD"])
        .split("\0")
        .filter(Boolean)
        .map((line) => {
          const [meta, path] = line.split("\t");
          return [path, meta.split(" ")[2]];
        }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  const root = process.cwd();
  if (process.env.GITHUB_ACTIONS === "true") hardenGit(process.env);
  if (argv[0] === "--verify-install") {
    // Run from the workflow's own devkit, never the installed one it judges.
    const problems = installedRelease(
      argv[1],
      fileURLToPath(new URL("..", import.meta.url)),
      devkitBlobs,
    );
    for (const p of problems) console.log(`::error::${escapeAnnotation(p)}`);
    process.exit(problems.length ? 1 : 0);
  }
  if (argv[0] === "--inputs-from") {
    // pr.yml, when the check does not run on a pull request: did the change turn it off? Run from the workflow's devkit.
    const [rev, path] = argv.slice(1);
    let was = "";
    try {
      was = execFileSync("git", ["show", `${rev}:${path}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // A workflow new in the change: the base ran no check from it.
    }
    // The file as committed, not as the install and the prepare step may have left it on disk.
    let now = "";
    try {
      now = execFileSync("git", ["show", `${process.env.GITHUB_SHA || "HEAD"}:${path}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // Dropped in the change: every caller job the base had is gone.
    }
    const problems = [
      ...checkoutProblems(root),
      ...workflowInputs(path, was, now, checkTools(root, {}).parseYaml),
    ];
    for (const p of problems) console.log(`::error::${escapeAnnotation(p)}`);
    if (!problems.length) console.log(`${path} runs the check as its base ${rev.slice(0, 7)} did.`);
    process.exit(problems.length ? 1 : 0);
  }
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

  // Before anything reads the checkout: what an install script or the prepare step changed would be counted instead.
  const checkout = checkoutProblems(root);
  const tools = checkTools(root, { ...DEFAULT_TOOLS, ...config.tools });
  const measured = measure(
    config,
    tools.run,
    existsSync(join(root, ".jscpd.json")),
    gitSource(root),
    installedPackages(root),
  );

  // A raised baseline or an exception with no reason, against the branch the change goes into: on a pull request
  // (--lines-from) and in every local run, so neither the check nor --write-baseline can accept one quietly.
  /** @type {string[]} */
  const refused = [...checkout, ...lockfileProblems(gitSource(root).list())];
  let ref = from;
  try {
    ref = baseRef(root, from) ?? undefined;
    if (ref) {
      const base = atBase(root, file, ref, config);
      const files = [...new Set([...gitSource(root).list(), ...base.changed])];
      const plugins = knipPluginFiles(
        files,
        tools.knipConfigs(),
        (p) => base.now(p) ?? base.before(p) ?? "",
      );
      const next = write ? { ...config, baseline: { ...measured.counts } } : config;
      refused.push(
        ...raised(next, base.config, classify({ ...base, plugins }, tools.parseYaml)),
        ...unreasoned(base, config, base.config),
        ...narrowed(base, config, base.config),
        ...hiddenFiles(base.ignored, base.changed, base.before),
        ...unreadAdded(measured.unread, base.created),
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
