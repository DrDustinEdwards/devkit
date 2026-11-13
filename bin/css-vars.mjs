#!/usr/bin/env node
// The custom-property gate: every `var(--x)` without a fallback names a property something declares. An undeclared one
// resolves to the property's initial value, so a box-shadow or color silently disappears and no other check notices
// (Foxing used `--fx-shadow-md` 14 times and declared it nowhere; second shared-code audit, 2026-11-11).
//
//   npx devkit-css-vars                    check against .css-vars.json
//   npx devkit-css-vars --config <file>    another config
//
// The config:
//
//   { "dirs": ["app"], "declared_in": ["node_modules/capsomer"] }
//
// `dirs` (required) are walked for .css, .ts and .tsx files whose uses are checked; their declarations count too.
// `declared_in` lists files or directories (a package's CSS, say) whose declarations count but whose uses are not
// checked. A declaration is `--x:` in CSS, a `"--x"` key in a style object, or `setProperty("--x", ...)`. A use with a
// fallback, `var(--x, ...)`, never fails. `external` names properties a library sets at run time (Base UI's
// `--available-height`, Shiki's `--shiki-*`): exact, or a prefix ending in `*`. `skip_dirs` (default `node_modules`, `assets`) names directory names the walk
// of `dirs` does not enter.
//
// `classes` (optional) checks the stylesheets the same way: every class with the package's prefix that a .ts or .tsx file
// under `dirs` writes, and that one of the package's stylesheets styles, must be styled by a stylesheet something under
// `dirs` imports (`import "capsomer/layout-stack.css"`, or `@import` in a .css file, followed through the package's own
// imports). A class whose stylesheet nothing loads draws as plain markup and no other check notices (capsid #936 repinned
// the Portal past Capsomer 0.139, which moved .cap-stack and .cap-text out of base.css, and the Portal lost its layout).
//
//   "classes": [{ "package": "dashboard/node_modules/capsomer", "dirs": ["dashboard/src"], "prefix": "cap-" }]
//
// `package` is the installed package's directory; `dirs` (default: the top-level `dirs`) are where its classes are used
// and its stylesheets imported. A stylesheet styles a class when the class is in the first compound of one of its
// top-level selectors (`.cap-stack`, `:is(.cap-stack, .cap-grid)[data-gap="2"]`), not after a combinator or inside
// `:not()` or `:has()`; the stylesheets are the package's `exports` ending in `.css` and the files they import. A class
// built at run time, or written only by the package's own components, is not seen.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { isMain, walkFiles } from "../node/index.mjs";
import { escapeAnnotation, fail } from "./annotate.mjs";
import { readConfig } from "./site-config.mjs";

const CSS_DECLARATION = /(--[\w-]+)\s*:/g;
const STYLE_KEY = /["'`](--[\w-]+)["'`]\s*[:,\]]/g;
const COMMENT = /\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g;
const USE = /var\(\s*(--[\w-]+)\s*([,)])/g;

/**
 * The custom properties a file declares.
 * @param {string} content
 * @returns {Set<string>}
 */
export function declarations(content) {
  const out = new Set();
  for (const m of content.matchAll(CSS_DECLARATION)) out.add(m[1]);
  for (const m of content.matchAll(STYLE_KEY)) out.add(m[1]);
  return out;
}

/**
 * The custom properties a file uses without a fallback, with their line numbers. Comments are left out.
 * @param {string} content
 * @returns {Array<{ name: string, line: number }>}
 */
export function uses(content) {
  const text = blankComments(content);
  const out = [];
  for (const m of text.matchAll(USE))
    if (m[2] === ")") out.push({ name: m[1], line: text.slice(0, m.index).split("\n").length });
  return out;
}

/** The text with each comment blanked to spaces, so line numbers and offsets hold. @param {string} content */
function blankComments(content) {
  return content.replace(
    COMMENT,
    (m, lead = "") => lead + m.slice(lead.length).replace(/[^\n]/g, " "),
  );
}

/** Each top-level part of `text` split at `sep`, outside parentheses. @param {string} text @param {RegExp} sep */
function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (depth === 0 && sep.test(text[i])) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/**
 * The classes with `prefix` a stylesheet styles: those in the first compound of a selector at its top level (inside
 * at-rules, not nested in another rule), leaving out `:not()` and `:has()`.
 * @param {string} css
 * @param {string} prefix
 * @returns {Set<string>}
 */
export function styledClasses(css, prefix) {
  const out = new Set();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  /** @type {boolean[]} true for an at-rule's block */
  const blocks = [];
  let buf = "";
  for (const ch of text) {
    if (ch === "{") {
      const prelude = buf.trim();
      const atRule = prelude.startsWith("@");
      if (!atRule && blocks.every(Boolean))
        for (const sel of splitTop(prelude, /,/)) {
          let compound = splitTop(sel.trim(), /[\s>+~]/)[0];
          // Drop :not(...) and :has(...), their parentheses balanced.
          for (
            let i = compound.search(/:(not|has)\(/);
            i >= 0;
            i = compound.search(/:(not|has)\(/)
          ) {
            let depth = 0;
            let j = compound.indexOf("(", i);
            for (; j < compound.length; j++) {
              if (compound[j] === "(") depth++;
              else if (compound[j] === ")" && --depth === 0) break;
            }
            compound = compound.slice(0, i) + compound.slice(j + 1);
          }
          for (const m of compound.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))
            if (m[1].startsWith(prefix)) out.add(m[1]);
        }
      blocks.push(atRule);
      buf = "";
    } else if (ch === "}") {
      blocks.pop();
      buf = "";
    } else if (ch === ";") buf = "";
    else buf += ch;
  }
  return out;
}

/**
 * The file a package subpath (`./layout.css`) names in its `exports`: an exact key, else a `*` pattern.
 * @param {Record<string, any>} exportsField
 * @param {string} subpath
 * @returns {string | null} the target, relative to the package
 */
function exportTarget(exportsField, subpath) {
  /** @param {any} t */
  const target = (t) => (typeof t === "string" ? t : (t?.default ?? null));
  if (subpath in exportsField) return target(exportsField[subpath]);
  for (const [key, value] of Object.entries(exportsField)) {
    const star = key.indexOf("*");
    if (star < 0) continue;
    const [head, tail] = [key.slice(0, star), key.slice(star + 1)];
    if (subpath.startsWith(head) && subpath.endsWith(tail) && subpath.length >= key.length - 1)
      return (
        target(value)?.replaceAll("*", subpath.slice(head.length, subpath.length - tail.length)) ??
        null
      );
  }
  return null;
}

/**
 * The classes a site writes whose stylesheet nothing it imports loads: one line per class, at its first use.
 * @param {{ pkgDir: string, prefix: string, files: Array<{ rel: string, content: string }> }} options
 *   `files` are the site's own .ts, .tsx and .css files
 * @returns {string[]}
 */
export function unloadedClasses({ pkgDir, prefix, files }) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const exportsField = pkg.exports ?? {};
  /** @param {string} spec a bare specifier `<name>/<subpath>` @returns {string | null} */
  const fromSpecifier = (spec) => {
    if (!spec.startsWith(`${pkg.name}/`)) return null;
    const t = exportTarget(exportsField, `.${spec.slice(pkg.name.length)}`);
    return t ? resolve(pkgDir, t) : null;
  };
  /** @type {Map<string, { styles: Set<string>, imports: string[] }>} */
  const sheets = new Map();
  /** @param {string} file */
  const read = (file) => {
    if (sheets.has(file) || !existsSync(file)) return;
    const css = readFileSync(file, "utf8");
    const imports = [...css.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)]
      .map((m) => (/^[./]/.test(m[1]) ? resolve(dirname(file), m[1]) : fromSpecifier(m[1])))
      .filter((f) => f !== null);
    sheets.set(file, { styles: styledClasses(css, prefix), imports });
    for (const f of imports) read(f);
  };
  // Every stylesheet the package exports: each exact key, and each file a `*` pattern matches.
  /** @type {Map<string, string>} file to the specifier that names it */
  const named = new Map();
  const cssFiles = walkFiles(pkgDir, {
    keep: (n) => n.endsWith(".css"),
    skipDir: (n) => n === "node_modules",
  });
  for (const [key, value] of Object.entries(exportsField)) {
    if (!key.endsWith(".css")) continue;
    const t = typeof value === "string" ? value : value?.default;
    if (typeof t !== "string") continue;
    const pattern = new RegExp(
      `^${resolve(pkgDir, t)
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace("*", "([^/]+)")
        .replaceAll("*", "\\1")}$`,
    );
    for (const f of key.includes("*") ? cssFiles : [resolve(pkgDir, t)]) {
      const m = f.match(pattern);
      if (!m) continue;
      if (!named.has(f)) named.set(f, `${pkg.name}/${key.slice(2).replace("*", m[1] ?? "")}`);
      read(f);
    }
  }
  /** @type {Map<string, Set<string>>} class to the stylesheets that style it */
  const styledIn = new Map();
  for (const [file, { styles }] of sheets)
    for (const c of styles) styledIn.set(c, (styledIn.get(c) ?? new Set()).add(file));
  // What the site loads: every package stylesheet it names, and what those import.
  const loaded = new Set();
  /** @param {string} file */
  const load = (file) => {
    if (loaded.has(file)) return;
    loaded.add(file);
    for (const f of sheets.get(file)?.imports ?? []) load(f);
  };
  const spec = new RegExp(`["'](${pkg.name.replace(/[.\\/]/g, "\\$&")}/[^"'\\s]+\\.css)["']`, "g");
  for (const { content } of files)
    for (const m of blankComments(content).matchAll(spec)) {
      const f = fromSpecifier(m[1]);
      if (f) {
        read(f);
        load(f);
      }
    }
  const use = new RegExp(`(?<![\\w-])${prefix.replace(/[-]/g, "\\-")}[\\w-]*\\w`, "g");
  const out = [];
  const reported = new Set();
  for (const { rel, content } of files) {
    if (rel.endsWith(".css")) continue;
    const text = blankComments(content);
    for (const m of text.matchAll(use)) {
      const where = styledIn.get(m[0]);
      if (!where || reported.has(m[0]) || [...where].some((f) => loaded.has(f))) continue;
      reported.add(m[0]);
      const names = [...where].map((f) => named.get(f) ?? `${pkg.name}'s ${relative(pkgDir, f)}`);
      out.push(
        `${rel}:${text.slice(0, m.index).split("\n").length}: .${m[0]} is styled in ${names.join(" or ")}, which nothing here imports`,
      );
    }
  }
  return out;
}

const CHECKED = /\.(tsx?|css)$/;
const DECLARING = /\.(tsx?|css|m?js)$/;

/** The files of one kind at a path: the file itself, or every one under the directory. @param {string} path @param {Set<string>} skip @param {RegExp} kinds @returns {string[]} */
function filesAt(path, skip, kinds) {
  if (statSync(path).isFile()) return kinds.test(path) ? [path] : [];
  return walkFiles(path, { keep: (name) => kinds.test(name), skipDir: (name) => skip.has(name) });
}

function main() {
  const { config, path: configPath } = readConfig(
    process.argv.slice(2),
    ".css-vars.json",
    "css-vars",
  );
  if (!Array.isArray(config.dirs) || config.dirs.length === 0)
    fail("css-vars", `${configPath} needs a non-empty "dirs" list`);
  const root = process.cwd();
  const skip = new Set(config.skip_dirs ?? ["node_modules", "assets"]);
  const declared = new Set();
  for (const d of config.declared_in ?? []) {
    const abs = resolve(root, d);
    if (!existsSync(abs)) fail("css-vars", `declared_in ${d} does not exist (is it installed?)`);
    for (const f of filesAt(abs, new Set(), DECLARING))
      for (const n of declarations(readFileSync(f, "utf8"))) declared.add(n);
  }
  /** @type {Array<{ rel: string, content: string }>} */
  const files = [];
  for (const d of config.dirs) {
    const abs = resolve(root, d);
    if (!existsSync(abs)) fail("css-vars", `directory ${d} does not exist`);
    for (const f of filesAt(abs, skip, CHECKED)) {
      const content = readFileSync(f, "utf8");
      files.push({ rel: f.slice(root.length + 1).replace(/\\/g, "/"), content });
      for (const n of declarations(content)) declared.add(n);
    }
  }
  if (files.length === 0)
    fail("css-vars", "no .ts, .tsx or .css file found; a gate that read nothing must not pass");
  /** @type {string[]} */
  const external = config.external ?? [];
  /** @param {string} name */
  const isExternal = (name) =>
    external.some((e) => (e.endsWith("*") ? name.startsWith(e.slice(0, -1)) : name === e));
  const violations = [];
  for (const { rel, content } of files)
    for (const u of uses(content))
      if (!declared.has(u.name) && !isExternal(u.name))
        violations.push(
          `${rel}:${u.line}: var(${u.name}) is declared nowhere, so it resolves to nothing`,
        );
  for (const entry of config.classes ?? []) {
    const pkgDir = resolve(root, entry.package ?? "");
    if (!existsSync(join(pkgDir, "package.json")))
      fail("css-vars", `classes package ${entry.package} is not installed`);
    const dirs = (entry.dirs ?? config.dirs).map(
      (/** @type {string} */ d) => `${d.replace(/\/$/, "")}/`,
    );
    violations.push(
      ...unloadedClasses({
        pkgDir,
        prefix: entry.prefix ?? "cap-",
        files: files.filter((f) => dirs.some((/** @type {string} */ d) => f.rel.startsWith(d))),
      }),
    );
  }
  if (violations.length > 0) {
    for (const v of violations) console.error(`::error::css-vars: ${escapeAnnotation(v)}`);
    console.error(`css-vars: ${violations.length} violation(s)`);
    process.exit(1);
  }
  console.log(`css-vars: clean (${files.length} files, ${declared.size} properties declared)`);
}

if (isMain(import.meta.url)) main();
