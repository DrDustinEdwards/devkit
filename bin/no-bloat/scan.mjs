import { posix } from "node:path";

export const DEFAULT_TOOLS = {
  knip: "knip@6.45.1",
  jscpd: "jscpd@4.3.0",
  "modern-web-guidance": "modern-web-guidance@1.0.0",
};

const TESTS = ["**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"];

const SOURCE = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}"];

const GENERATED = ["**/*.min.*", "**/worker-configuration.d.ts"];

export const DOCS = ["**/*.{md,mdx,markdown,rst,txt,adoc}", "docs/**"];

/** Lines a file may have before it is on the size list (`"size": { "source": 500, "test": 800 }` sets them). */
export const SIZE_CAP = { source: 500, test: 800 };

/**
 * @typedef {{ label: string, args?: string[] }} KnipRun
 * @typedef {{ files?: string[], ignore?: string[] }} Files
 * @typedef {{ knip?: KnipRun[], jscpd?: { args?: string[] } | false, shared?: false, legacy?: { args?: string[] } | false,
 *   size?: { source?: number, test?: number } | false, tests?: Files | false, comments?: Files & { tolerance?: number, fail?: boolean } | false,
 *   tools?: { knip?: string, jscpd?: string, "modern-web-guidance"?: string },
 *   baseline?: Record<string, unknown> & { measured_at?: string } }} Config
 * @typedef {(name: "knip" | "jscpd" | "modern-web-guidance", args: string[], cwd?: string) => string} Runner
 * @typedef {{ list: () => string[], read: (path: string) => string }} Source
 * @typedef {Record<string, Record<string, number>>} Counts
 */

/**
 * The legacy scanner's JSON report as counts per guide, e.g. { "dark-mode": 1 }. Its total must match the guides' sum, so
 * a report this reads wrongly fails rather than counting nothing.
 */
export function legacyCounts(
  /** @type {string} */ text,
  /** @type {(path: string) => string} */ read = () => "",
) {
  const report = JSON.parse(text);
  if (!report || typeof report.totalFindings !== "number" || !Array.isArray(report.guides))
    throw new Error(`legacy-scan printed no report this reads: ${text.trim().slice(0, 200)}`);
  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {Map<string, string[]>} */
  const files = new Map();
  const lines = (/** @type {string} */ file) => {
    if (!files.has(file)) {
      let body = "";
      try {
        body = read(file);
      } catch {}
      files.set(file, body.split("\n"));
    }
    return /** @type {string[]} */ (files.get(file));
  };
  let sum = 0;
  for (const guide of report.guides) {
    sum += Number(guide.count);
    /** @type {Array<{ file: string, line: number }>} */
    const findings = (guide.rules ?? []).flatMap(
      (/** @type {{ findings?: Array<{ file: string, line: number }> }} */ r) => r.findings ?? [],
    );
    // A match kept on purpose (the guide's rubric drops it, as for a guard in a shared helper the scanner cannot
    // follow) carries `legacy-scan:keep`, this guide's id and its reason on its line or the line above, and is not
    // counted. A marker for another guide keeps nothing here.
    const kept = findings.filter((f) => {
      // The scanner names each file from the directory it scanned.
      const at = lines(posix.join(String(report.targetDir ?? "."), f.file));
      return [at[f.line - 1], at[f.line - 2]].some((l) => {
        const keep = legacyKeep(l ?? "");
        return keep?.reasoned && keep.guide === String(guide.guideId);
      });
    }).length;
    const left = Number(guide.count) - kept;
    if (left > 0) counts[String(guide.guideId)] = left;
  }
  if (sum !== report.totalFindings)
    throw new Error(
      `legacy-scan counted ${report.totalFindings} findings but its guides add to ${sum}`,
    );
  return counts;
}

/**
 * The marker that keeps a legacy-scan match on purpose, on its line or the line above: `legacy-scan:keep <guide> <reason>`,
 * where `<guide>` is the id of the guide whose rubric drops the match (`ime-safe-enter-submit`), so a marker keeps that
 * guide's match alone, never another pattern on the same line. A mention in backticks is prose about it, not one. Null
 * when the text has no marker; `guide` is "" when the marker names none.
 */
export function legacyKeep(/** @type {string} */ text) {
  const marker = /(?<!`)legacy-scan:keep(?!`)(.*)$/.exec(text);
  if (!marker) return null;
  // The reason is what follows inside the comment, never the code after it closes.
  const [, guide = "", reason = ""] =
    /^\s*([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-])(.*)$/.exec(marker[1].split(/\*\/|-->/)[0]) ?? [];
  return { guide, reasoned: guide !== "" && isReason(reason) };
}

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

export const matches = (/** @type {string} */ path, /** @type {string[]} */ globs) =>
  globs.some((g) => posix.matchesGlob(path, g));

/** @param {Config} config */
export function globs(config) {
  const tests = config.tests || {};
  const comments = config.comments || {};
  return {
    isTest: (/** @type {string} */ p) =>
      matches(p, tests.files ?? TESTS) && !matches(p, tests.ignore ?? []),
    isSource: (/** @type {string} */ p) =>
      matches(p, comments.files ?? SOURCE) && !matches(p, comments.ignore ?? GENERATED),
  };
}

export const percent = (/** @type {number} */ part, /** @type {number} */ whole) =>
  whole ? Number(((100 * part) / whole).toFixed(2)) : 0;

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
