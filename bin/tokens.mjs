#!/usr/bin/env node
// The design-token gate: no raw hex color outside the token file, no px font size anywhere a rem is possible. Walks the
// directories in `.tokens.json` for .ts, .tsx and .css files and exits 1 with one line per violation.
//
//   npx devkit-tokens                    check against .tokens.json
//   npx devkit-tokens --config <file>    another config
//
// The config:
//
//   { "dirs": ["app"], "hex_exempt": ["app/app.css", "app/lib/email/"], "px_font_exempt": ["app/lib/email/"] }
//
// `dirs` is required; the exempt lists hold repository-relative paths (exact, or a prefix such as a directory ending `/`)
// and are for surfaces that cannot use a custom property or a rem (the token file itself, e-mail markup, Satori and SVG).
// `skip_dirs` (default `node_modules`, `assets`) names directory names the walk does not enter.
//
// A numeric character reference such as &#10003; is markup, not a color: it is removed before the hex scan, while a bare
// `#10003` is still reported. A px length is a violation only in a font-size context (`font-size:`, `fontSize:`, and in
// .tsx a Tailwind `text-[...]`), so `padding: 10px` and `w-[680px]` stay legal; a px inside `clamp()` counts.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { walkFiles } from "../node/index.mjs";
import { escapeAnnotation } from "./annotate.mjs";
import { readConfig } from "./site-config.mjs";

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const NUMERIC_ENTITY_PATTERN = /&#\d+;/g;
const TAILWIND_PX_FONT_SIZE_PATTERN = /\btext-\[[^\]]*?[0-9.]+px[^\]]*\]/g;
const CSS_PX_FONT_SIZE_PATTERN = /font-size:\s*[^;{}\n]*?[0-9.]+px[^;{}\n]*/g;
const INLINE_STYLE_PX_FONT_SIZE_PATTERN = /fontSize:\s*["'`][^"'`]*?[0-9.]+px[^"'`]*["'`]/g;

/**
 * One file's violations. `rel` is the repository-relative path with forward slashes.
 * @param {string} rel
 * @param {string} content
 * @param {{ hex_exempt?: string[], px_font_exempt?: string[] }} [config]
 * @returns {string[]}
 */
export function scanContent(rel, content, config = {}) {
  const exempt = (/** @type {string[] | undefined} */ list) =>
    (list ?? []).some((p) => rel === p || rel.startsWith(p));
  const violations = [];
  if (!exempt(config.hex_exempt)) {
    for (const m of content.replace(NUMERIC_ENTITY_PATTERN, "").matchAll(HEX_PATTERN))
      violations.push(`${rel}: raw hex color "${m[0]}" outside the token file`);
  }
  if (!exempt(config.px_font_exempt)) {
    for (const m of content.matchAll(CSS_PX_FONT_SIZE_PATTERN))
      violations.push(`${rel}: px font size "${m[0]}", use a rem-based value`);
    if (rel.endsWith(".tsx")) {
      for (const m of content.matchAll(TAILWIND_PX_FONT_SIZE_PATTERN))
        violations.push(`${rel}: px font size "${m[0]}", use a rem-based text-* token`);
      for (const m of content.matchAll(INLINE_STYLE_PX_FONT_SIZE_PATTERN))
        violations.push(`${rel}: inline px font size "${m[0]}", use a rem-based value`);
    }
  }
  return violations;
}

function main() {
  const { config, path: configPath } = readConfig(process.argv.slice(2), ".tokens.json", "tokens");
  /** @param {string} m @returns {never} */
  const fail = (m) => {
    console.error(`::error::tokens: ${escapeAnnotation(m)}`);
    process.exit(1);
  };
  if (!Array.isArray(config.dirs) || config.dirs.length === 0)
    fail(`${configPath} needs a non-empty "dirs" list`);
  const root = process.cwd();
  const skip = new Set(config.skip_dirs ?? ["node_modules", "assets"]);
  const violations = [];
  let scanned = 0;
  for (const d of config.dirs) {
    const abs = resolve(root, d);
    if (!existsSync(abs)) fail(`directory ${d} does not exist`);
    for (const f of walkFiles(abs, {
      keep: (name) => /\.(tsx?|css)$/.test(name),
      skipDir: (name) => skip.has(name),
    })) {
      scanned++;
      const rel = f.slice(root.length + 1).replace(/\\/g, "/");
      violations.push(...scanContent(rel, readFileSync(f, "utf8"), config));
    }
  }
  if (scanned === 0)
    fail("no .ts, .tsx or .css file found; a gate that read nothing must not pass");
  if (violations.length > 0) {
    for (const v of violations) console.error(`::error::tokens: ${escapeAnnotation(v)}`);
    console.error(`tokens: ${violations.length} violation(s)`);
    process.exit(1);
  }
  console.log(`tokens: clean (${scanned} files)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
