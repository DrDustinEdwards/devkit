import { posix } from "node:path";
import { blankComments } from "../shared.mjs";
import { TOOL_KEYS, flagValues } from "./base.mjs";
import { isReason, legacyKeep } from "./scan.mjs";
import { KNIP_DATA } from "./classify.mjs";
import { JSCPD_CONFIG } from "./count.mjs";

/** @typedef {import("./scan.mjs").Config} Config */

const KNIP_CODE = /^\.?knip(?:\.config)?\.(?:js|cjs|mjs|ts|cts|mts)$/;

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
    const keep = legacyKeep(said);
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
    else if (keep && !keep.reasoned)
      out.push(
        `${path}: a new \`legacy-scan:keep\` names no guide or gives no reason (${text.trim()}). Write after it the id of the guide whose rubric drops the match, then why it stays (\`legacy-scan:keep ime-safe-enter-submit isImeEnter checks isComposing\`), or apply the guide's fix.`,
      );
  }
  return out;
}
