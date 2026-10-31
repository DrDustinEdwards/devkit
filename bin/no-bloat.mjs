#!/usr/bin/env node
// The no-bloat ratchet. Knip for unused files, exports and dependencies, jscpd for duplicated blocks, and a static count of
// test files and test cases, each compared with the repository's own baseline. A count above its baseline fails the run
// (exit 1, an ::error:: line per count); a count at or below it passes, and one that went down is named so the baseline can
// be lowered to lock the gain in. Adding a test is a raise: `--write-baseline` in the same change, so the diff shows it. The
// share of source lines that are comments is recorded too, and a rise of more than `tolerance` points (with more comment
// lines than the baseline) is a warning, or an error with `"fail": true`. A tool that cannot run fails the run too (an
// ::error:: naming its error): a count nobody measured is not a pass, and neither is a baseline entry no run measures. The
// table goes to the job summary.
//
//   npx devkit-no-bloat                      report against .no-bloat.json (no file: one knip run, jscpd on its own config)
//   npx devkit-no-bloat --config <file>      another config
//   npx devkit-no-bloat --write-baseline     measure and record the counts as the config's baseline
//   npx devkit-no-bloat --warn-only          the same report, every error a warning, exit 0: a report, never a gate
//   npx devkit-no-bloat --lines-from <rev>   also report the lines added and removed since the merge base with <rev>, as
//                                            code, tests, comments, docs and other (no-bloat.yml passes it on a pull request)
//
// The config, every field optional (globs match paths from the repository root, as git lists them):
//
//   {
//     "knip": [{ "label": "knip (Worker)" }, { "label": "knip (dashboard)", "args": ["--directory", "dashboard"] }],
//     "jscpd": { "args": ["app", "workers", "--min-lines", "8"] },
//     "tests": { "files": ["**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"], "ignore": [] },
//     "comments": { "files": ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}"], "ignore": ["**/*.min.*", "**/worker-configuration.d.ts"],
//                   "tolerance": 1, "fail": false },
//     "tools": { "knip": "knip@6", "jscpd": "jscpd@4" },
//     "baseline": { "measured_at": "036d615", "knip (Worker)": { "Unused exports": 12 }, "jscpd": { "clones": 23, "lines": 410,
//       "percentage": 0.59 }, "tests": { "files": 40, "cases": 312 }, "comments": { "lines": 900, "code": 9100, "percentage": 9 } }
//   }
//
// `"jscpd": false`, `"tests": false` or `"comments": false` turns one off. jscpd's clones and duplicated lines are gated; its
// percentage is shown, not gated, since deleting code that is not duplicated raises it. Test cases are counted from the
// source, never by running a runner: each `test(` or `it(` call (node:test, vitest, Playwright), with their modifiers
// (`.only`, `.skip`, `.each(...)`...), outside comments and strings; `describe`, hooks and Playwright's runtime
// `test.skip(condition)` are not cases. A case made in a loop counts once.
//
// A tool the repository installs is run from node_modules/.bin; otherwise through npx at the spec in `tools`.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_TOOLS = { knip: "knip@6", jscpd: "jscpd@4" };
const TESTS = ["**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"];
const SOURCE = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}"];
const GENERATED = ["**/*.min.*", "**/worker-configuration.d.ts"];
const DOCS = ["**/*.{md,mdx,markdown,rst,txt,adoc}", "docs/**"];
const BUFFER = 64 * 1024 * 1024;

/**
 * @typedef {{ label: string, args?: string[] }} KnipRun
 * @typedef {{ files?: string[], ignore?: string[] }} Files
 * @typedef {{ knip?: KnipRun[], jscpd?: { args?: string[] } | false, tests?: Files | false,
 *   comments?: Files & { tolerance?: number, fail?: boolean } | false, tools?: { knip?: string, jscpd?: string },
 *   baseline?: Record<string, unknown> & { measured_at?: string } }} Config
 * @typedef {(name: "knip" | "jscpd", args: string[]) => string} Runner
 * @typedef {{ list: () => string[], read: (path: string) => string }} Source
 * @typedef {Record<string, Record<string, number>>} Counts
 */

/** Knip's compact report as counts per heading, e.g. { "Unused exports": 12 }. A clean run prints nothing. */
export function knipCounts(/** @type {string} */ text) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const m of text.matchAll(/^([A-Z][A-Za-z ]+) \((\d+)\)$/gm)) counts[m[1]] = Number(m[2]);
  // Output with no heading this reads is a format that changed, not a clean run.
  if (Object.keys(counts).length === 0 && text.trim() && !/Knip found no issues/.test(text)) {
    throw new Error(`knip printed no report this reads: ${text.trim().slice(0, 200)}`);
  }
  return counts;
}

const KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"]);

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
    if (ch.trim()) kind === "comment" ? (comment = true) : (code = true);
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
      if (templates.length && c === "}" && templates[templates.length - 1]-- === 0) inTemplate = true;
      put(text[i++], "code");
    }
  }
  if (out.length && out[out.length - 1] !== "\n") put("\n", "code");
  return { kinds, code: out.join("") };
}

const MODIFIERS = new Set(["only", "skip", "todo", "concurrent", "sequential", "fails", "fixme", "fail", "slow", "each", "for", "skipIf", "runIf"]);
const TAKES_DATA = new Set(["each", "for", "skipIf", "runIf"]);
const AT_RUNTIME = new Set(["skip", "fixme", "fail", "slow"]);

/** The test cases a test file declares, read from scan()'s blanked text. */
export function testCases(/** @type {string} */ code) {
  let n = 0;
  for (const m of code.matchAll(/(?<![\w$.#])(?:test|it)((?:\s*\.\s*[A-Za-z]+)*)\s*\(\s*(\S)?/g)) {
    const members = m[1].split(".").map((x) => x.trim()).filter(Boolean);
    if (!members.every((x) => MODIFIERS.has(x)) || m[2] === ")" || m[2] === undefined) continue;
    if (/\bfunction\s*\*?\s*$/.test(code.slice(Math.max(0, m.index - 16), m.index))) continue;
    // Playwright's test.skip(condition) and test.slow() inside a test change it; with a title first they declare one.
    if (members.some((x) => AT_RUNTIME.has(x)) && !members.some((x) => TAKES_DATA.has(x)) && !"\"'`".includes(m[2])) continue;
    n++;
  }
  return n;
}

const matches = (/** @type {string} */ path, /** @type {string[]} */ globs) => globs.some((g) => posix.matchesGlob(path, g));

/** @param {Config} config */
function globs(config) {
  const tests = config.tests || {};
  const comments = config.comments || {};
  return {
    isTest: (/** @type {string} */ p) => matches(p, tests.files ?? TESTS) && !matches(p, tests.ignore ?? []),
    isSource: (/** @type {string} */ p) => matches(p, comments.files ?? SOURCE) && !matches(p, comments.ignore ?? GENERATED),
  };
}

const percent = (/** @type {number} */ part, /** @type {number} */ whole) => (whole ? Number(((100 * part) / whole).toFixed(2)) : 0);

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
      for (const kind of scanned.kinds) kind === "code" ? code++ : kind === "comment" && lines++;
    }
  }
  /** @type {Counts} */
  const counts = {};
  if (config.tests !== false) counts.tests = tests;
  if (config.comments !== false) counts.comments = { lines, code, percentage: percent(lines, lines + code) };
  return counts;
}

/**
 * Runs every tool the config names, counts the tests and comments, and returns the counts, keyed as the baseline is, and a
 * warning for each that could not run.
 * @param {Config} config
 * @param {Runner} run
 * @param {boolean} [jscpdConfigured] whether the repository has its own .jscpd.json, which then names the paths
 * @param {Source} [source] the repository's files
 * @returns {{ counts: Counts, warnings: string[] }}
 */
export function measure(config, run, jscpdConfigured = true, source = { list: () => [], read: () => "" }) {
  /** @type {Counts} */
  const counts = {};
  const warnings = [];

  for (const { label, args = [] } of config.knip ?? [{ label: "knip" }]) {
    try {
      counts[label] = knipCounts(run("knip", [...args, "--no-exit-code", "--no-progress", "--reporter", "compact"]));
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
      const total = JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8")).statistics.total;
      if (!total.sources) throw new Error("it read no files; check its paths, format and ignore");
      counts.jscpd = { clones: total.clones, lines: total.duplicatedLines, percentage: Number(Number(total.percentage).toFixed(2)) };
    } catch (error) {
      warnings.push(`jscpd could not run: ${messageOf(error)}`);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }

  if (config.tests !== false || config.comments !== false) {
    try {
      Object.assign(counts, countFiles(config, source.list(), source.read));
    } catch (error) {
      warnings.push(`tests and comments could not be counted: ${messageOf(error)}`);
    }
  }

  return { counts, warnings };
}

/**
 * One row per finding the baseline or the measurement names, an error for each that grew, a warning for a comment share that
 * rose past its tolerance (an error with `"fail": true`), and a note for each that went down. A finding with no baseline is a
 * row and never an error: there is nothing to have grown from. A baseline entry that no run in the config measures is stale.
 * @param {Record<string, unknown>} baseline
 * @param {Counts} counts
 * @param {Config} [config]
 */
export function compare(baseline, counts, config = {}) {
  /** @type {Array<[string, string, number | null, number]>} */
  const rows = [];
  const errors = [];
  const warnings = [];
  const lowered = [];
  const knipRuns = config.knip ?? [{ label: "knip" }];
  const before = (/** @type {string} */ tool) => /** @type {Record<string, number> | null} */ (tool in baseline ? baseline[tool] : null);
  /** A gated count: a row, an error when it grew, a note when it went down. `zero` counts a key the baseline lacks from 0. */
  const gate = (/** @type {string} */ tool, /** @type {string} */ key, /** @type {string} */ name, /** @type {string} */ hint, zero = false) => {
    const old = before(tool);
    const was = old ? (old[key] ?? (zero ? 0 : null)) : null;
    const now = counts[tool][key] ?? 0;
    rows.push([tool, name, was, now]);
    if (was !== null && now > was) errors.push(`${tool}: ${name} went from ${was} to ${now}. ${hint}`);
    if (was !== null && now < was) lowered.push(`${tool}: ${name} ${was} to ${now}`);
  };

  for (const [tool, now] of Object.entries(counts)) {
    if (tool === "jscpd" || tool === "tests" || tool === "comments") continue;
    const was = before(tool);
    const keys = [...new Set([...Object.keys(was ?? {}), ...Object.keys(now)])];
    // A clean run is a row too, so the table shows the tool ran.
    if (keys.length === 0) rows.push([tool, "findings", was ? 0 : null, 0]);
    const args = knipRuns.find((r) => r.label === tool)?.args ?? [];
    for (const key of keys) gate(tool, key, key, `Run \`npx knip${args.length ? ` ${args.join(" ")}` : ""}\` to see which.`, true);
  }

  if (counts.jscpd) {
    gate("jscpd", "clones", "clones", "Run `npx jscpd` to see them.");
    gate("jscpd", "lines", "duplicated lines", "Run `npx jscpd` to see them.");
    rows.push(["jscpd", "duplicated lines % (not gated)", before("jscpd")?.percentage ?? null, counts.jscpd.percentage]);
  }

  if (counts.tests) {
    gate("tests", "files", "test files", "A new test file needs a reviewed raise of the baseline.");
    gate("tests", "cases", "test cases", "A new test needs a reviewed raise of the baseline.");
  }

  if (counts.comments) {
    const was = before("comments");
    const now = counts.comments;
    const tolerance = (config.comments || {}).tolerance ?? 1;
    rows.push(["comments", "comment lines", was?.lines ?? null, now.lines]);
    rows.push(["comments", `share of lines % (tolerance ${tolerance})`, was?.percentage ?? null, now.percentage]);
    const rise = was ? Math.round((now.percentage - was.percentage) * 100) : 0;
    if (was && rise > tolerance * 100 && now.lines > was.lines) {
      const finding = `comments: the share of source lines that are comments went from ${was.percentage}% to ${now.percentage}% (tolerance ${tolerance} points), comment lines from ${was.lines} to ${now.lines}. Remove comments that restate the code, or raise the baseline in a reviewed change.`;
      ((config.comments || {}).fail ? errors : warnings).push(finding);
    }
    if (was && -rise >= tolerance * 100) lowered.push(`comments: share ${was.percentage}% to ${now.percentage}%`);
  }

  const measured = new Set(["measured_at", ...knipRuns.map((r) => r.label)]);
  for (const tool of ["jscpd", "tests", "comments"]) if (config[/** @type {"jscpd"} */ (tool)] !== false) measured.add(tool);
  const stale = Object.keys(baseline)
    .filter((key) => !measured.has(key))
    .map((key) => `the baseline has "${key}", which no run in the config measures. Restore the run, or drop the entry with \`npx devkit-no-bloat --write-baseline\` in a reviewed change.`);
  return { rows, errors, warnings, lowered, stale };
}

/**
 * The job summary table.
 * @param {Array<[string, string, number | null, number]>} rows
 * @param {string[]} problems the errors, then the warnings
 * @param {string | undefined} measuredAt
 * @param {boolean} [warnOnly]
 */
export function render(rows, problems, measuredAt, warnOnly = false) {
  const show = (/** @type {number | null} */ n) => (n === null ? "none" : String(n));
  return [
    `### No-bloat ${warnOnly ? "report (warn-only, never blocks a merge)" : "ratchet"} (${measuredAt ? `baseline ${measuredAt}` : "no baseline yet: run `npx devkit-no-bloat --write-baseline`"})`,
    "",
    "| Tool | Finding | Baseline | Now |",
    "|---|---|---|---|",
    ...rows.map(([tool, key, a, b]) => `| ${tool} | ${key} | ${show(a)} | ${b}${a !== null && b > a ? " (up)" : ""} |`),
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
      const kind = file.source ? (kinds?.[n - 1] ?? (line.slice(1).trim() ? "code" : "blank")) : line.slice(1).trim() ? "text" : "blank";
      if (kind === "blank") continue;
      const into = kind === "comment" ? "comments" : file.source ? (file.test ? "tests" : "code") : file.docs ? "docs" : "other";
      totals[into][added ? "added" : "removed"]++;
    }
  }
  return totals;
}

/** The lines summary for a pull request. */
export function renderLines(/** @type {ReturnType<typeof lineChanges>} */ totals, /** @type {string} */ base) {
  const signed = (/** @type {number} */ n) => (n > 0 ? `+${n}` : String(n));
  return [
    `### Lines added and removed (against ${base.slice(0, 7)}, blank lines not counted)`,
    "",
    "| Lines | Added | Removed | Net |",
    "|---|---|---|---|",
    ...Object.entries(totals).map(([kind, { added, removed }]) => `| ${kind} | ${added} | ${removed} | ${signed(added - removed)} |`),
  ].join("\n");
}

/** The repository's files as git lists them, tracked and untracked but not ignored. */
function gitSource(/** @type {string} */ root) {
  return {
    list: () =>
      [...new Set(execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: BUFFER }).split("\0"))].filter(
        (p) => p && existsSync(join(root, p)) && lstatSync(join(root, p)).isFile(),
      ),
    read: (/** @type {string} */ p) => readFileSync(join(root, p), "utf8"),
  };
}

/** Lines added and removed between the merge base of `from` and HEAD. */
function gitLines(/** @type {string} */ root, /** @type {Config} */ config, /** @type {string} */ from) {
  const git = (/** @type {string[]} */ args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: BUFFER, stdio: ["ignore", "pipe", "pipe"] });
  const base = git(["merge-base", from, "HEAD"]).trim();
  const diff = git(["-c", "core.quotePath=false", "diff", "-U0", "--no-color", "--no-ext-diff", "-M", base, "HEAD"]);
  const totals = lineChanges(config, diff, (side, path) => {
    try {
      return scan(git(["show", `${side === "old" ? base : "HEAD"}:${path}`]), path.endsWith(".css")).kinds;
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
export function npxArgs(/** @type {string} */ name, /** @type {string} */ spec, /** @type {string[]} */ args) {
  return ["--yes", "--package", spec, "--", name, ...args];
}

/** Runs a tool from the repository's node_modules/.bin when it is installed there, through npx at `spec` otherwise. */
export function runnerIn(/** @type {string} */ root, /** @type {{ knip: string, jscpd: string }} */ tools) {
  /** @type {Runner} */
  return (name, args) => {
    const local = join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
    const [file, argv] = existsSync(local) ? [local, args] : ["npx", npxArgs(name, tools[name], args)];
    // A .cmd shim (and npx itself) on Windows needs cmd.exe; elsewhere the bin runs directly.
    const [cmd, all] = process.platform === "win32" ? ["cmd.exe", ["/c", file, ...argv]] : [file, argv];
    const r = spawnSync(cmd, all, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`${name} exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
    return r.stdout;
  };
}

function messageOf(/** @type {unknown} */ error) {
  return error instanceof Error ? error.message : String(error);
}

function shortHead(/** @type {string} */ root) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--config");
  const root = process.cwd();
  const file = resolve(root, at >= 0 && argv[at + 1] ? argv[at + 1] : ".no-bloat.json");
  const write = argv.includes("--write-baseline");
  const warnOnly = argv.includes("--warn-only");
  const from = argv.includes("--lines-from") ? argv[argv.indexOf("--lines-from") + 1] : undefined;

  /** @type {Config} */
  let config = {};
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      // A broken config would otherwise be no baseline, and so a ratchet that passes everything.
      console.error(`devkit-no-bloat: ${file} is not JSON: ${messageOf(error)}`);
      process.exit(1);
    }
  }

  const measured = measure(config, runnerIn(root, { ...DEFAULT_TOOLS, ...config.tools }), existsSync(join(root, ".jscpd.json")), gitSource(root));

  if (write) {
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

  const { rows, errors, warnings, lowered, stale } = compare(config.baseline ?? {}, measured.counts, config);
  if (errors.length) {
    errors.push("Remove what was added. If it is deliberate, run `npx devkit-no-bloat --write-baseline` and commit the config, so the raise is reviewed.");
  }
  errors.unshift(...measured.warnings, ...stale);
  if (lowered.length) {
    warnings.push(`Lower the baseline to lock this in (${lowered.join(", ")}): run \`npx devkit-no-bloat --write-baseline\` and commit the config.`);
  }
  let table = render(rows, [...errors, ...warnings], config.baseline?.measured_at, warnOnly);
  if (from) {
    try {
      table += `\n\n${gitLines(root, config, from)}`;
    } catch (error) {
      warnings.push(`The lines added and removed since ${from} could not be read: ${messageOf(error)}`);
    }
  }
  console.log(table);
  for (const e of errors) console.log(`::${warnOnly ? "warning" : "error"}::${e}`);
  for (const w of warnings) console.log(`::warning::${w}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
  if (errors.length && !warnOnly) process.exit(1);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
