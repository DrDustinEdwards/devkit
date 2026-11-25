import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOT_SOURCE, SOURCE, blankComments, excused } from "./core.mjs";

/** @typedef {import("./core.mjs").Config} Config */
/** @typedef {import("./core.mjs").Finding} Finding */
/** @typedef {import("./core.mjs").Tree} Tree */

/** Capsomer's token names: every custom property its generated token files define (scale, color, themes). */
export function capsomerTokens(/** @type {string | null} */ dir) {
  const names = new Set();
  if (!dir) return names;
  for (const f of ["scale.css", "color.css", "themes.css"]) {
    const file = join(dir, "tokens", f);
    if (existsSync(file))
      for (const m of readFileSync(file, "utf8").matchAll(/(?:^|[\s{;])(--[a-z0-9-]+)\s*:/g))
        names.add(m[1]);
  }
  return names;
}

/** Whether the declaration at `index` sits in a rule for the whole page (:root, html, body), not one part of it. */
function rootRule(/** @type {string} */ code, /** @type {number} */ index) {
  const open = code.lastIndexOf("{", index);
  if (open < 0) return false;
  const start =
    Math.max(
      code.lastIndexOf("}", open),
      code.lastIndexOf(";", open),
      code.lastIndexOf("{", open - 1),
    ) + 1;
  return /(^|[\s,("'`])(:root|html|body)(?![\w-])/.test(code.slice(start, open));
}

/**
 * A site's own value for a Capsomer token: a declaration of it for the whole page (:root, html, body), in CSS or in CSS
 * inside a source file. Reading one with var() is a use, and setting one for one part of the page (a dark panel's --text)
 * is that part's theme; both pass. Capsomer itself is not checked: it is where the values live.
 * @param {Tree} tree @param {Set<string>} tokens @param {Config} config
 * @returns {Finding[]}
 */
export function checkTokens(tree, tokens, config) {
  /** @type {Finding[]} */
  const found = [];
  if (!tokens.size) return found;
  for (const file of tree.files) {
    if (!(file.endsWith(".css") || SOURCE.test(file)) || NOT_SOURCE.test(file)) continue;
    const text = tree.read(file);
    // Comments may name a token; only declarations count.
    const code = blankComments(text);
    for (const m of code.matchAll(/(^|[\s{;"'`])(--[a-z0-9-]+)\s*:(?!:)/g)) {
      const name = m[2];
      if (!tokens.has(name) || !rootRule(code, m.index) || excused(config, "tokens", name))
        continue;
      const line = code.slice(0, m.index + m[1].length).split("\n").length;
      found.push({
        check: "tokens",
        file,
        line,
        message: `${name} is Capsomer's: set it there (its site layer for this site's own look), or say why in .shared.json "tokens"`,
      });
    }
    // The network's faces come from capsomer/fonts.css, every weight in one file each, so a bold is the same bold on every
    // site (sites that picked their own weights drew the footer's name differently).
    for (const m of code.matchAll(
      /@fontsource(?:-variable)?\/(?:schibsted-grotesk|martian-mono)\b|@font-face\s*\{[^}]*font-family:\s*["']?(?:Schibsted Grotesk|Martian Mono)/g,
    )) {
      if (excused(config, "tokens", "fonts")) break;
      const line = code.slice(0, m.index).split("\n").length;
      found.push({
        check: "tokens",
        file,
        line,
        message: `the network's faces are Capsomer's: load capsomer/fonts.css instead of your own files, or say why in .shared.json "tokens" "fonts"`,
      });
    }
  }
  return found;
}

const TEST = /(^|\/)(test|tests|e2e|__tests__|test-integration)\/|\.(test|spec)\.[mc]?[jt]sx?$/;

const FETCH_SWAP = String.raw`(?:globalThis\.fetch\s*=|stubGlobal\(\s*["'\x60]fetch["'\x60]\s*,|defineProperty\(\s*globalThis\s*,\s*["'\x60]fetch["'\x60]\s*,\s*\{\s*value\s*:|spyOn\(\s*globalThis\s*,\s*["'\x60]fetch["'\x60]\s*\)\s*\.mock\w*\()`;

const DELETE_ALL = String.raw`DELETE FROM\s+["'\x60]?[\w$]+["'\x60]?(?=\s*(?:["'\x60;),]|$))`;

/** Test fakes of a repository's own where devkit has one: every pattern in `find` matches the test file. */
const FAKES = [
  // GitHub's contents or git data routes answered behind a fetch stub.
  {
    find: [
      /\/repos\/[^\s"'`]*\/(?:git\/(?:refs?|trees|commits|blobs)|contents)\b/,
      new RegExp(FETCH_SWAP),
    ],
    use: "devkit ./github stubGitHub",
    say: "a GitHub API fake of its own",
  },
  // An RSA key pair made here and a key set served from it: an Access issuer of its own.
  {
    find: [
      /generateKey\(\s*\{\s*name\s*:\s*["'`]RSASSA-PKCS1-v1_5|generateKeyPair(?:Sync)?\(\s*["'`](?:RS256|rsa)["'`]/,
      /cdn-cgi\/access\/certs|\bjwks\b|["']?keys["']?\s*:\s*\[\s*(?:\{\s*\.\.\.)?\s*\w*[jJ]wk\b/,
    ],
    use: "devkit ./access stubAccess",
    say: "an Access fake of its own (a key pair it signs with and the key set it serves)",
  },
  // A fetch whose whole body throws an error naming the URL.
  {
    find: [
      new RegExp(
        `${FETCH_SWAP}\\s*(?:vi\\.fn\\(\\s*)?(?:async\\s*)?(?:function\\s*)?\\(?[^)]*\\)?\\s*(?::\\s*[\\w<>]+\\s*)?(?:=>)?\\s*\\{?\\s*(?:throw\\s+new\\s+\\w*Error\\(\\s*|(?:return\\s+)?Promise\\.reject\\(\\s*(?:new\\s+\\w*Error\\(\\s*)?)\\x60[^\\x60]*\\$\\{`,
      ),
    ],
    use: "devkit ./network refuseNetwork",
    say: "a fetch that refuses the network, written here",
  },
  // Tables cleared by hand: three DELETE FROMs with no WHERE close together, or one in a loop.
  {
    find: [
      new RegExp(
        `${DELETE_ALL}[^]{0,400}?${DELETE_ALL}[^]{0,400}?${DELETE_ALL}|\\bfor\\s*\\(\\s*(?:const|let)\\s+\\w+\\s+of\\s+[^)]+\\)[^]{0,160}?DELETE FROM\\s+["'\\x60]?\\$\\{|\\]\\s*\\.(?:map|forEach)\\([^]{0,160}?DELETE FROM\\s+["'\\x60]?\\$\\{`,
        "im",
      ),
    ],
    use: "devkit ./d1 resetDb",
    say: "a hand list of tables to clear, which drifts the day a migration adds one",
  },
];

/**
 * Test files holding a fake devkit already ships. Only this check reads tests.
 * @param {Tree} tree @param {Config} config @param {string} [self]
 * @returns {Finding[]}
 */
export function checkFakes(tree, config, self) {
  /** @type {Finding[]} */
  const found = [];
  if (self === "devkit") return found;
  for (const file of tree.files.filter(
    (f) =>
      SOURCE.test(f) &&
      TEST.test(f) &&
      !/(^|\/)(node_modules|dist|build|coverage|fixtures)\//.test(f),
  )) {
    const code = blankComments(tree.read(file));
    for (const { find, use, say } of FAKES) {
      const m = find[0].exec(code);
      if (!m || !find.every((f) => f.test(code)) || excused(config, "copies", file)) continue;
      found.push({
        check: "fakes",
        file,
        line: code.slice(0, m.index).split("\n").length,
        message: `${say}: use ${use}, or say why in .shared.json "copies"`,
      });
    }
  }
  return found;
}
