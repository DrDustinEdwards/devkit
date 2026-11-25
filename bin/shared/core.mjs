import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Whether `text` calls `fn({ ... })` with `key` among the object's own keys. The object is read character by character
 * to its closing brace, past strings, comments and nested brackets, so a key in a nested object or in code after the call
 * is not the call's, and the read is linear whatever the text.
 */
export function callWithKey(
  /** @type {string} */ text,
  /** @type {string} */ fn,
  /** @type {string} */ key,
) {
  const named = new RegExp(String.raw`(?<![\w$.])${key}\s*:`, "y");
  for (const m of text.matchAll(new RegExp(String.raw`\b${fn}\(\{`, "g")))
    for (let i = m.index + m[0].length, depth = 1; i < text.length && depth > 0; i++) {
      const c = text[i];
      if (c === '"' || c === "'" || c === "`") {
        while (++i < text.length && text[i] !== c) if (text[i] === "\\") i++;
      } else if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) {
        const close = text[i + 1] === "/" ? "\n" : "*/";
        const end = text.indexOf(close, i + 2);
        i = end < 0 ? text.length : end + close.length - 1;
      } else if ("({[".includes(c)) depth++;
      else if (")}]".includes(c)) depth--;
      else if (depth === 1 && ((named.lastIndex = i), named.test(text))) return true;
    }
  return false;
}

export const SITE = ["site", "static"];

export const PUBLIC_OR_PRIVATE = ["site", "static", "private"];

export const SOURCE = /\.(m?[jt]sx?|mts|cts)$/;

export const NOT_SOURCE =
  /(^|\/)(node_modules|dist|build|coverage|test|tests|e2e|__tests__|fixtures)\/|\.(test|spec)\.[mc]?[jt]sx?$|\.d\.m?ts$|worker-configuration\.d\.ts$/;

/**
 * @typedef {"site" | "static" | "private" | "worker" | "package"} Kind
 * @typedef {{ apps?: Record<string, Kind>, waive?: Record<string, string>, copies?: Record<string, string>,
 *   libraries?: Record<string, string>, tokens?: Record<string, string>,
 *   spelling?: { ignore?: string[], contracts?: string[], skip?: string[] } }} Config
 * @typedef {{ check: string, file?: string, line?: number, message: string, warn?: boolean, failsFrom?: string }} Finding
 * @typedef {{ files: string[], read: (file: string) => string }} Tree
 * @typedef {Record<string, string>} Catalog   export name -> "package subpath"
 * @typedef {(repo: string) => { tags: string[], commits: Record<string, string> }} TagReader
 */

/** "v1.2.3" -> [1, 2, 3]; anything else -> null. */
export function semver(/** @type {string} */ tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** @param {string} a @param {string} b */
export function compare(a, b) {
  const [x, y] = [semver(a), semver(b)];
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** This devkit's own version, which each rule's failsFrom is compared with. */
const VERSION = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;

/** Whether a finding is a warning: one always, or a rule's that fails only from a later devkit release. */
export function isWarning(/** @type {Finding} */ f, version = VERSION) {
  return f.warn === true || (f.failsFrom !== undefined && compare(version, f.failsFrom) < 0);
}

/**
 * A package.json (or any JSON file) of the tree, parsed. One that is not valid JSON is a warning on that file and the
 * fallback, so a single broken manifest does not stop the check for every other file.
 * @param {Tree} tree @param {string} file @param {Finding[]} found @param {string} check @param {any} [fallback]
 * @returns {any}
 */
export function readManifest(tree, file, found, check, fallback = {}) {
  try {
    return JSON.parse(tree.read(file) || "{}");
  } catch (error) {
    found.push({
      check,
      file,
      warn: true,
      message: `${file} is not valid JSON, so the check skipped it (${error instanceof Error ? error.message : String(error)})`,
    });
    return fallback;
  }
}

/** The exceptions each config excused something with, so the ones that excused nothing can be named. */
export const EXCUSED = new WeakMap();

/** Whether .shared.json excuses `key` in `section` ("copies", "waive", "libraries", "tokens"), remembered when it does. */
export function excused(
  /** @type {Config} */ config,
  /** @type {string} */ section,
  /** @type {string} */ key,
) {
  if (!(/** @type {Record<string, any>} */ (config)[section]?.[key])) return false;
  used(config, section, key);
  return true;
}

export function used(
  /** @type {Config} */ config,
  /** @type {string} */ section,
  /** @type {string} */ key,
) {
  if (!EXCUSED.has(config)) EXCUSED.set(config, new Set());
  EXCUSED.get(config).add(`${section}\0${key}`);
}

/** A source file that serves MCP through the shared door. */
const MCP_SERVER = /["']@dustinedwards\/site-runtime\/mcp-(?:server|login)["']/;

/** The directories of the package.json files whose code serves MCP: each server file belongs to its nearest manifest. */
export function mcpServerDirs(/** @type {Tree} */ tree) {
  const manifests = tree.files
    .filter((f) => posix.basename(f) === "package.json" && !NOT_SOURCE.test(f))
    .map((f) => posix.dirname(f));
  const dirs = new Set();
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file) || !MCP_SERVER.test(tree.read(file))) continue;
    const owner = manifests
      .filter((d) => d === "." || file.startsWith(`${d}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (owner) dirs.add(owner);
  }
  return dirs;
}

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

/** Which app a file belongs to: the deepest app directory that holds it. @param {[string, string][]} apps */
export function appOwner(apps) {
  return (/** @type {string} */ file) =>
    apps
      .map(([dir]) => dir)
      .filter((dir) => dir === "." || file === dir || file.startsWith(`${dir}/`))
      .sort((a, b) => b.length - a.length)[0];
}

/** Every tracked file, read from disk. */
export function gitTree(/** @type {string} */ root) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  /** @type {Record<string, string>} */
  const cache = {};
  return {
    files: files.filter((f) => !f.includes("node_modules/")),
    read: (/** @type {string} */ f) =>
      (cache[f] ??=
        existsSync(join(root, f)) && statSync(join(root, f)).isFile()
          ? readFileSync(join(root, f), "utf8")
          : ""),
  };
}
