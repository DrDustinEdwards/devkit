import { posix } from "node:path";
import {
  PACKAGES,
  FINGERPRINTS,
  HEADERS_COPY,
  CLAUDE_HOOKS,
  LIBRARIES,
  ALIASES,
  BODY_ALIASES,
  definitionBody,
} from "./data.mjs";
import {
  DISTINCT_SINGLE,
  COMMON_COMPOUND,
  SOURCE,
  NOT_SOURCE,
  readManifest,
  excused,
} from "./config.mjs";
/** @import { Finding, Tree, Config, Catalog } from "./config.mjs" */

/** Export names from one module's source or declaration file. */
export function exportNames(/** @type {string} */ src) {
  const names = new Set();
  for (const m of src.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g,
  ))
    names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop();
      if (name && !/^type\b/.test(part.trim())) names.add(name);
    }
  }
  return [...names];
}

/**
 * Code without its comments, blanked rather than removed so line numbers hold. String and template literals are read as
 * strings and kept whole, so a `//` or `/*` inside one (a URL, a glob such as "src/*") is not a comment. A quote string
 * ends at its line, so a stray apostrophe (in a regular expression or a JSX text) cannot swallow the rest of the file.
 */
export function blankComments(/** @type {string} */ text) {
  const n = text.length;
  const blank = (/** @type {string} */ s) => s.replace(/[^\n]/g, " ");
  let out = "";
  let depth = 0;
  /** @type {number[]} brace depth at each open `${` */
  const holes = [];
  /** Reads template text from `from` to its closing backtick or the next `${`; where it stopped. */
  const template = (/** @type {number} */ from) => {
    let j = from;
    while (j < n) {
      if (text[j] === "\\") j += 2;
      else if (text[j] === "`") {
        j++;
        break;
      } else if (text[j] === "$" && text[j + 1] === "{") {
        holes.push(depth++);
        j += 2;
        break;
      } else j++;
    }
    j = Math.min(j, n);
    out += text.slice(from, j);
    return j;
  };
  for (let i = 0; i < n;) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? n : end;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (c === "/" && /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn)\s*$/.test(out.slice(-12))) {
      // A regular expression literal: its quotes are not strings. No closing slash on the line makes it a division.
      let j = i + 1;
      let inClass = false;
      while (j < n && text[j] !== "\n" && (inClass || text[j] !== "/")) {
        if (text[j] === "\\") j++;
        else if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        j++;
      }
      const stop = text[j] === "/" ? j + 1 : i + 1;
      out += text.slice(i, stop);
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      j = Math.min(j + (text[j] === c ? 1 : 0), n);
      out += text.slice(i, j);
      i = j;
    } else if (c === "`") {
      out += c;
      i = template(i + 1);
    } else {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (holes.length && holes.at(-1) === depth) {
          holes.pop();
          out += c;
          i = template(i + 1);
          continue;
        }
      }
      out += c;
      i++;
    }
  }
  return out;
}

/** Whether a name is distinctive enough to flag a local definition of it. */
export function distinctive(/** @type {string} */ name) {
  if (COMMON_COMPOUND.has(name)) return false;
  return (
    DISTINCT_SINGLE.has(name) ||
    (/^[a-z]/.test(name) && /[a-z][A-Z0-9]/.test(name) && name.length >= 6)
  );
}

/**
 * Local copies: definitions named like a shared export (or a known alias of one), and builder fingerprints.
 * @param {Tree} tree @param {Catalog} catalog @param {Config} config @param {string} [self] the package this repository is, if any
 * @returns {Finding[]}
 */
export function checkCopies(tree, catalog, config, self) {
  /** @type {Finding[]} */
  const found = [];
  const names = Object.keys(catalog).filter(distinctive);
  const aliases = Object.keys(ALIASES).filter((a) => catalog[ALIASES[a]]);
  const bodyAliases = Object.keys(BODY_ALIASES).filter((a) => catalog[BODY_ALIASES[a].target]);
  const all = [...names, ...aliases, ...bodyAliases];
  const shared = new RegExp(
    `from\\s+["'](${PACKAGES.map((p) => p.name.replace(/[/.]/g, "\\$&")).join("|")})(/[^"']*)?["']`,
  );
  const define = all.length
    ? new RegExp(
        `^[ \\t]*(?:export\\s+)?(?:async\\s+)?(?:function\\*?\\s+|(?:const|let|var)\\s+)(${all.join("|")})\\b\\s*[=(<:]`,
        "gm",
      )
    : null;
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file)) continue;
    const text = tree.read(file);
    const lineOf = (/** @type {number} */ index) => text.slice(0, index).split("\n").length;
    /** @type {Finding[]} */
    const mine = [];
    // A wrapper that imports the shared export it is named after is a use, not a copy.
    const imported = new Set();
    for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
      if (!shared.test(m[0])) continue;
      for (const part of m[1].split(",")) imported.add(part.trim().split(/\s+as\s+/)[0]);
    }
    if (define) {
      for (const m of text.matchAll(define)) {
        const guarded = BODY_ALIASES[m[1]];
        const target = guarded?.target ?? ALIASES[m[1]] ?? m[1];
        if (imported.has(target)) continue;
        if (guarded && !guarded.body.test(definitionBody(text, m.index))) continue;
        mine.push({
          check: "copies",
          file,
          line: lineOf(m.index),
          message: `${m[1]} is a local copy of ${catalog[target]} ${target}: import it`,
        });
      }
    }
    // Comments may name what a builder writes; only code counts.
    const code = blankComments(text);
    for (const { find, also, use, say } of FINGERPRINTS) {
      if (self && use.startsWith(`${self} `)) continue;
      const m = find.exec(code);
      if (m && also && !also.test(code)) continue;
      // One finding a line: a named copy already reported there (germomics' one-line hex) says it.
      if (m && !mine.some((f) => f.line === lineOf(m.index)))
        mine.push({
          check: "copies",
          file,
          line: lineOf(m.index),
          message: say ?? `this builds what ${use} builds: use it`,
        });
    }
    if (mine.length && !excused(config, "copies", file)) found.push(...mine);
  }
  // The Claude Code hooks devkit ships (claude/hooks): a repository runs them from node_modules, never a copy of its own.
  if (self !== "devkit") {
    for (const file of tree.files.filter(
      (f) => CLAUDE_HOOKS.includes(posix.basename(f)) && posix.dirname(f).endsWith(".claude/hooks"),
    )) {
      if (!excused(config, "copies", file))
        found.push({
          check: "copies",
          file,
          line: 1,
          message: `a copy of devkit's Claude Code hook: run node_modules/@dustinedwards/devkit/claude/hooks/${posix.basename(file)} from .claude/settings.json (devkit README, "The shared Claude Code hooks") and delete this file`,
        });
    }
  }
  if (self !== "site-runtime") {
    for (const file of tree.files.filter(
      (f) => posix.basename(f) === "_headers" && !NOT_SOURCE.test(f),
    )) {
      const text = tree.read(file);
      // A comment line starts with #, so only a header line, indented under its path, matches.
      const m = HEADERS_COPY.find.exec(text);
      if (m && !excused(config, "copies", file)) {
        const line = text.slice(0, m.index).split("\n").length;
        found.push({
          check: "copies",
          file,
          line,
          message: `a security header set written by hand for the static files: ${HEADERS_COPY.use} is the set; generate this block from it, or say why in .shared.json "copies"`,
        });
      }
    }
  }
  return found;
}

/**
 * Direct dependencies on libraries a shared package wraps. A library that a shared package the manifest depends on
 * lists as a peer (Prelum's render packs) is that package's install, not a second job, and passes.
 * @param {Tree} tree @param {Config} config @param {Record<string, string[]>} [peers] package name -> its peer dependencies
 * @returns {Finding[]}
 */
export function checkLibraries(tree, config, peers = {}) {
  /** @type {Finding[]} */
  const found = [];
  for (const file of tree.files.filter((f) => posix.basename(f) === "package.json")) {
    const manifest = readManifest(tree, file, found, "libraries");
    if (PACKAGES.some((p) => p.name === manifest.name)) continue;
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };
    const asked = new Set(Object.keys(deps).flatMap((d) => peers[d] ?? []));
    for (const dep of Object.keys(deps)) {
      const lib = LIBRARIES.find((l) => l.find.test(dep));
      if (lib && !asked.has(dep) && !excused(config, "libraries", dep))
        found.push({
          check: "libraries",
          file,
          message: `${dep} is ${lib.use}'s job: use it, or say why in .shared.json "libraries"`,
        });
    }
  }
  return found;
}
