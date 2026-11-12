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

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { walkFiles } from "../node/index.mjs";
import { escapeAnnotation } from "./annotate.mjs";
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
  const text = content.replace(
    COMMENT,
    (m, lead = "") => lead + m.slice(lead.length).replace(/[^\n]/g, " "),
  );
  const out = [];
  for (const m of text.matchAll(USE))
    if (m[2] === ")") out.push({ name: m[1], line: text.slice(0, m.index).split("\n").length });
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
  /** @param {string} m @returns {never} */
  const fail = (m) => {
    console.error(`::error::css-vars: ${escapeAnnotation(m)}`);
    process.exit(1);
  };
  if (!Array.isArray(config.dirs) || config.dirs.length === 0)
    fail(`${configPath} needs a non-empty "dirs" list`);
  const root = process.cwd();
  const skip = new Set(config.skip_dirs ?? ["node_modules", "assets"]);
  const declared = new Set();
  for (const d of config.declared_in ?? []) {
    const abs = resolve(root, d);
    if (!existsSync(abs)) fail(`declared_in ${d} does not exist (is it installed?)`);
    for (const f of filesAt(abs, new Set(), DECLARING))
      for (const n of declarations(readFileSync(f, "utf8"))) declared.add(n);
  }
  /** @type {Array<{ rel: string, content: string }>} */
  const files = [];
  for (const d of config.dirs) {
    const abs = resolve(root, d);
    if (!existsSync(abs)) fail(`directory ${d} does not exist`);
    for (const f of filesAt(abs, skip, CHECKED)) {
      const content = readFileSync(f, "utf8");
      files.push({ rel: f.slice(root.length + 1).replace(/\\/g, "/"), content });
      for (const n of declarations(content)) declared.add(n);
    }
  }
  if (files.length === 0)
    fail("no .ts, .tsx or .css file found; a gate that read nothing must not pass");
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
  if (violations.length > 0) {
    for (const v of violations) console.error(`::error::css-vars: ${escapeAnnotation(v)}`);
    console.error(`css-vars: ${violations.length} violation(s)`);
    process.exit(1);
  }
  console.log(`css-vars: clean (${files.length} files, ${declared.size} properties declared)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
