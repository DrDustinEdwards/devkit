import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCE, NOT_SOURCE, excused } from "./config.mjs";
import { blankComments } from "./copies.mjs";
/** @import { Finding, Tree, Config } from "./config.mjs" */

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
