import { readFileSync } from "node:fs";

/** A route file for a page search should not list, and which one (admin, login, signin, sign-in or console). */
export const ADMIN_ROUTE =
  /(?:^|\/)routes\/(?:[^/]*\/)*(?:[^/]*\.)?(admin|login|signin|sign-in|console)(?=[./_$-])/;

// Single words too common to flag on name alone; compound names (escapeHtml, jsonLd) are distinctive, except these.
export const DISTINCT_SINGLE = new Set(["slugify"]);
export const COMMON_COMPOUND = new Set(["accessToken", "cacheKey"]);
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

const KINDS = ["site", "static", "private", "worker", "package"];
const CONFIG_KEYS = {
  apps: 0,
  waive: 0,
  copies: 0,
  libraries: 0,
  tokens: 0,
  spelling: ["ignore", "contracts", "skip"],
};

/** Refuses a .shared.json the check would misread: an unknown key (a typo'd "wave" waives nothing) or kind. */
export function validateConfig(/** @type {Record<string, any>} */ config) {
  const bad = (/** @type {string} */ what, /** @type {string[]} */ valid) => {
    throw new Error(`.shared.json: ${what}; the valid ones are ${valid.join(", ")}`);
  };
  for (const key of Object.keys(config))
    if (!(key in CONFIG_KEYS)) bad(`"${key}" is no key`, Object.keys(CONFIG_KEYS));
  for (const key of Object.keys(config.spelling ?? {}))
    if (!CONFIG_KEYS.spelling.includes(key))
      bad(`"spelling" has no "${key}"`, CONFIG_KEYS.spelling);
  for (const [dir, kind] of Object.entries(config.apps ?? {}))
    if (!KINDS.includes(kind)) bad(`"apps" "${dir}" is "${kind}", which is no kind`, KINDS);
}

/** The exceptions each config excused something with, so the ones that excused nothing can be named. */
const EXCUSED = new WeakMap();

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

/** Each exception in .shared.json that excused nothing in this run: dead config, or a rule that moved past it. */
export function staleExceptions(/** @type {Config} */ config) {
  const seen = EXCUSED.get(config) ?? new Set();
  /** @type {[string, string][]} */
  const all = [
    ...["copies", "waive", "libraries", "tokens"].flatMap((s) =>
      Object.keys(/** @type {Record<string, any>} */ (config)[s] ?? {}).map(
        (k) => /** @type {[string, string]} */ ([s, k]),
      ),
    ),
    ...(config.spelling?.ignore ?? []).map(
      (k) => /** @type {[string, string]} */ (["spelling.ignore", k]),
    ),
    ...(config.spelling?.contracts ?? []).map(
      (k) => /** @type {[string, string]} */ (["spelling.contracts", k]),
    ),
  ];
  return all
    .filter(([s, k]) => !seen.has(`${s}\0${k}`))
    .map(([s, k]) => ({
      check: "config",
      file: ".shared.json",
      warn: true,
      message: `${s
        .split(".")
        .map((p) => `"${p}"`)
        .join(" ")} "${k}" excuses nothing in this run: remove it`,
    }));
}
