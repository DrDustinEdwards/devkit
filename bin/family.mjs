#!/usr/bin/env node
// The family check: what keeps a repository in step with the shared packages. It fails (exit 1, an ::error:: line each) on
//
//   pins       a dependency on one of the shared packages, or a call to devkit's reusable workflows, that is not at that
//              package's newest release tag (a raw commit counts as behind);
//   copies     a local definition with the name of something a shared package exports, or text only a shared builder should
//              write (a robots.txt "User-agent:", a sitemap "<urlset", an IndexNow POST...);
//   libraries  a direct dependency on a library a shared package wraps (marked, remark, mermaid, sanitize-html...);
//   features   a family feature the repository's kind of app should have and does not import (robots.txt, security.txt,
//              IndexNow, the CSP report endpoint, /health...);
//   tokens     a site setting its own value for one of Capsomer's tokens (--page-max, --measure, --radius-m, --accent...),
//              or loading its own files for the family's faces (Schibsted Grotesk, Martian Mono) instead of
//              capsomer/fonts.css: a value the family shares is set once, in Capsomer, never per site;
//   spelling   British spelling, read by codespell's en-GB to en-US list (American English everywhere, Dustin 2026-10-25).
//
//   npx devkit-family                    the check, against .family.json (no file: one site at the root)
//   npx devkit-family --fix-spelling     rewrite the British spellings in place, then run the check
//   npx devkit-family list               the generated list of every shared package's exports and every family feature
//   --from <dir>                         read the packages from checkouts named by repository (dir/prelum, dir/site-runtime...)
//                                        instead of node_modules
//
// The config, every field optional:
//
//   {
//     "apps": { ".": "site", "mcp": "worker" },          kind per directory: site, static, private, worker or package
//     "waive": { "indexnow": "why", "mcp:health": "why" }, a feature this repository does not need, and why
//     "copies": { "app/lib/og.ts": "why" },               a file allowed to hold a copy, and why
//     "libraries": { "katex": "why" },                    a direct dependency allowed, and why
//     "tokens": { "--measure": "why", "fonts": "why" },   a Capsomer token this repository sets itself (or "fonts", its own
//                                                         files for the family's faces), and why
//     "spelling": { "ignore": ["word"], "contracts": ["regex"], "skip": ["frame/**"] }
//                                                         words never checked; text a regex matches (a stored value, a
//                                                         column) left as it is, while the same word in prose is fixed;
//                                                         paths not checked
//   }
//
// On a Renovate branch (GITHUB_HEAD_REF renovate/...) the pin findings are warnings: a bump of one package must not fail
// because another is also behind. A line ending in a codespell:ignore comment is a contract the spelling check leaves.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { pathToFileURL } from "node:url";

/** The shared packages: npm name, repository, and what a session should know them as. */
export const PACKAGES = [
  { name: "@drdustinedwards/site-helpers", repo: "prelum", label: "Prelum" },
  { name: "@dustinedwards/site-runtime", repo: "site-runtime", label: "site-runtime" },
  { name: "@dustinedwards/site-api", repo: "site-api", label: "site-api" },
  { name: "@dustinedwards/d1-dump", repo: "d1-dump", label: "d1-dump" },
  { name: "@dustinedwards/devkit", repo: "devkit", label: "devkit" },
  { name: "capsomer", repo: "capsomer", label: "Capsomer" },
  { name: "enarratio", repo: "enarratio", label: "Enarratio" },
];

const SITE = ["site", "static"];
const PUBLIC_OR_PRIVATE = ["site", "static", "private"];

/** Every family feature: which kinds of app need it, how its use is found, and what provides it. */
export const FEATURES = {
  robots: { kinds: SITE, find: /site-helpers\/robots["']/, use: "Prelum ./robots robotsDocument (/robots.txt)" },
  aiTxt: { kinds: SITE, find: /\baiTxt\b/, use: "Prelum ./robots aiTxt (/ai.txt)" },
  tdm: { kinds: SITE, find: /\bTDM_RESERVATION_HEADERS\b/, use: "Prelum ./robots TDM_RESERVATION_HEADERS" },
  sitemap: { kinds: SITE, find: /site-helpers\/sitemap["']/, use: "Prelum ./sitemap sitemapDocument (/sitemap.xml)" },
  llms: { kinds: SITE, find: /site-helpers\/llms["']/, use: "Prelum ./llms llmsDocument (/llms.txt)" },
  head: { kinds: SITE, find: /site-helpers\/head["']/, use: "Prelum ./head headTags (canonical, Open Graph, Twitter)" },
  schema: { kinds: SITE, find: /site-helpers\/schema["']/, use: "Prelum ./schema (JSON-LD)" },
  indexnow: { kinds: SITE, find: /site-helpers\/indexnow["']|prelum-indexnow/, use: "Prelum ./indexnow submitIndexNow (site-api onPageChange on a Carrel site; prelum-indexnow after a static deploy)" },
  securityTxt: { kinds: SITE, find: /site-runtime\/security-txt["']/, use: "site-runtime ./security-txt (/.well-known/security.txt)" },
  headers: { kinds: [...PUBLIC_OR_PRIVATE, "worker"], find: /site-runtime\/headers["']/, use: "site-runtime ./headers buildSecurityHeaders" },
  csp: { kinds: PUBLIC_OR_PRIVATE, find: /site-runtime\/csp["']/, use: "site-runtime ./csp buildContentSecurityPolicy" },
  cspReport: { kinds: PUBLIC_OR_PRIVATE, find: /site-runtime\/csp-report["']/, use: "site-runtime ./csp-report receiveCspReport" },
  health: { kinds: ["site", "private"], find: /site-runtime\/health["']/, use: "site-runtime ./health healthResponse (/health)" },
  capsomer: { kinds: PUBLIC_OR_PRIVATE, find: /["']capsomer(\/[^"']*)?["']/, use: "Capsomer (tokens, components, the site layer)" },
};
/** A D1 database needs the nightly dump, whatever the kind. */
const BACKUP = { find: /@dustinedwards\/d1-dump["']/, use: "d1-dump runCheckedBackup and backupHealth" };

/** Text only a shared builder should write. */
export const FINGERPRINTS = [
  { find: /User-agent:/, use: "Prelum ./robots robotsDocument" },
  { find: /<urlset\b/, use: "Prelum ./sitemap sitemapDocument" },
  { find: /<rss\b|<feed xmlns=/, use: "Prelum ./feeds" },
  { find: /api\.indexnow\.org/, use: "Prelum ./indexnow submitIndexNow" },
  { find: /Contact: mailto:/, use: "site-runtime ./security-txt securityTxt" },
  { find: /property[=:]\s*["']og:/, use: "Prelum ./head headTags" },
  { find: /["']Strict-Transport-Security["']\s*[:,]/, use: "site-runtime ./headers buildSecurityHeaders" },
];

/** Libraries a shared package wraps, so a site that lists one is doing that package's job. */
export const LIBRARIES = [
  { find: /^(marked|markdown-it|micromark.*|remark.*|rehype.*|unified|mdast-util-.*|hast-util-.*)$/, use: "Prelum ./render" },
  { find: /^mermaid$/, use: "Prelum ./render/diagram" },
  { find: /^katex$/, use: "Prelum ./render/math" },
  { find: /^(shiki|highlight\.js|prismjs)$/, use: "Prelum ./render/highlight" },
  { find: /^(feed|rss|sitemap|xmlbuilder2?)$/, use: "Prelum ./feeds and ./sitemap" },
  { find: /^(sanitize-html|dompurify|isomorphic-dompurify)$/, use: "Prelum ./render/safe" },
  { find: /^jose$/, use: "site-runtime ./access and ./access-login" },
];

/** Local names for something a shared package exports under another name. */
export const ALIASES = {
  xmlEscape: "escapeXml",
  escXml: "escapeXml",
  escapeAttr: "escapeHtml",
  bytesToHex: "toHex",
  b64url: "base64url",
  b64urlEncode: "base64url",
  base64UrlEncode: "base64url",
  parseThemeCookie: "readThemeCookie",
  themeFromRequest: "readThemeCookie",
  getThemeCookie: "readThemeCookie",
  serializeThemeCookie: "themeCookie",
  buildSecurityTxt: "securityTxt",
  bytesToBase64: "toBase64",
  base64ToBytes: "fromBase64",
};

// Single words too common to flag on name alone; compound names (escapeHtml, jsonLd) are distinctive, except these.
const DISTINCT_SINGLE = new Set(["slugify"]);
const COMMON_COMPOUND = new Set(["accessToken"]);
const SOURCE = /\.(m?[jt]sx?|mts|cts)$/;
const NOT_SOURCE = /(^|\/)(node_modules|dist|build|coverage|test|tests|e2e|__tests__|fixtures)\/|\.(test|spec)\.[mc]?[jt]sx?$|\.d\.m?ts$|worker-configuration\.d\.ts$/;

/**
 * @typedef {"site" | "static" | "private" | "worker" | "package"} Kind
 * @typedef {{ apps?: Record<string, Kind>, waive?: Record<string, string>, copies?: Record<string, string>,
 *   libraries?: Record<string, string>, spelling?: { ignore?: string[], contracts?: string[], skip?: string[] } }} Config
 * @typedef {{ check: string, file?: string, line?: number, message: string, warn?: boolean }} Finding
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
function compare(a, b) {
  const [x, y] = [semver(a), semver(b)];
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** The newest release tag of a repository. */
export function newest(/** @type {string[]} */ tags) {
  return tags.filter((t) => semver(t)).sort(compare).at(-1) ?? null;
}

/** Tags and the commit each points at, from git ls-remote (peeled for annotated tags). */
export function lsRemoteTags(/** @type {string} */ repo) {
  const out = execFileSync("git", ["ls-remote", "--tags", `https://github.com/DrDustinEdwards/${repo}`], { encoding: "utf8" });
  /** @type {Record<string, string>} */
  const commits = {};
  for (const line of out.split("\n")) {
    const m = /^([0-9a-f]{40})\trefs\/tags\/(.+?)(\^\{\})?$/.exec(line);
    if (m) commits[m[2]] = m[3] || !commits[m[2]] ? m[1] : commits[m[2]];
  }
  return { tags: Object.keys(commits), commits };
}

/**
 * Pins behind the newest tag, or on a raw commit.
 * @param {Tree} tree @param {TagReader} readTags @param {boolean} lenient
 * @returns {Finding[]}
 */
export function checkPins(tree, readTags, lenient = false) {
  /** @type {Finding[]} */
  const found = [];
  /** @type {Record<string, ReturnType<TagReader>>} */
  const cache = {};
  const tagsOf = (/** @type {string} */ repo) => (cache[repo] ??= readTags(repo));
  const judge = (/** @type {string} */ file, /** @type {number} */ line, /** @type {string} */ repo, /** @type {string} */ ref) => {
    const { tags, commits } = tagsOf(repo);
    const latest = newest(tags);
    if (!latest) return;
    let at = semver(ref) ? (ref.startsWith("v") ? ref : `v${ref}`) : Object.keys(commits).find((t) => commits[t] === ref && semver(t));
    if (!at) {
      found.push({ check: "pins", file, line, warn: lenient, message: `${repo} is pinned to ${ref.slice(0, 12)}, which is no release; pin ${latest}` });
    } else if (compare(at, latest) < 0) {
      found.push({ check: "pins", file, line, warn: lenient, message: `${repo} is at ${at}; the newest release is ${latest}` });
    }
  };
  for (const file of tree.files) {
    const text = tree.read(file);
    const lineOf = (/** @type {number} */ index) => text.slice(0, index).split("\n").length;
    if (posix.basename(file) === "package.json") {
      for (const m of text.matchAll(/"([^"]+)":\s*"(?:github:|git\+https:\/\/github\.com\/)DrDustinEdwards\/([\w.-]+?)(?:\.git)?#([^"]+)"/gi)) {
        judge(file, lineOf(m.index), m[2], m[3]);
      }
      for (const m of text.matchAll(/"enarratio":\s*"\^?~?(\d+\.\d+\.\d+)"/g)) judge(file, lineOf(m.index), "enarratio", m[1]);
    } else if (/^\.github\/workflows\/.+\.ya?ml$/.test(file)) {
      for (const m of text.matchAll(/DrDustinEdwards\/devkit\/\.github\/workflows\/[\w.-]+@([0-9a-f]{40})/gi)) judge(file, lineOf(m.index), "devkit", m[1]);
    }
  }
  return found;
}

/** Export names from one module's source or declaration file. */
export function exportNames(/** @type {string} */ src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
      if (name && !/^type\b/.test(part.trim())) names.add(name);
    }
  }
  return [...names];
}

/** Whether a name is distinctive enough to flag a local definition of it. */
export function distinctive(/** @type {string} */ name) {
  if (COMMON_COMPOUND.has(name)) return false;
  return DISTINCT_SINGLE.has(name) || (/^[a-z]/.test(name) && /[a-z][A-Z0-9]/.test(name) && name.length >= 6);
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
  const all = [...names, ...aliases];
  const shared = new RegExp(`from\\s+["'](${PACKAGES.map((p) => p.name.replace(/[/.]/g, "\\$&")).join("|")})(/[^"']*)?["']`);
  const define = all.length ? new RegExp(`^[ \\t]*(?:export\\s+)?(?:async\\s+)?(?:function\\*?\\s+|(?:const|let|var)\\s+)(${all.join("|")})\\b\\s*[=(<:]`, "gm") : null;
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file) || config.copies?.[file]) continue;
    const text = tree.read(file);
    const lineOf = (/** @type {number} */ index) => text.slice(0, index).split("\n").length;
    // A wrapper that imports the shared export it is named after is a use, not a copy.
    const imported = new Set();
    for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
      if (!shared.test(m[0])) continue;
      for (const part of m[1].split(",")) imported.add(part.trim().split(/\s+as\s+/)[0]);
    }
    if (define) {
      for (const m of text.matchAll(define)) {
        const target = ALIASES[m[1]] ?? m[1];
        if (imported.has(target)) continue;
        found.push({ check: "copies", file, line: lineOf(m.index), message: `${m[1]} is a local copy of ${catalog[target]} ${target}: import it` });
      }
    }
    // Comments may name what a builder writes; only code counts. Blanked, not removed, so line numbers hold.
    const code = text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`])\/\/.*$/gm, (c) => c.replace(/[^\n]/g, " "));
    for (const { find, use } of FINGERPRINTS) {
      if (self && use.startsWith(`${self} `)) continue;
      const m = find.exec(code);
      if (m) found.push({ check: "copies", file, line: lineOf(m.index), message: `this builds what ${use} builds: use it` });
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
    const manifest = JSON.parse(tree.read(file));
    if (PACKAGES.some((p) => p.name === manifest.name)) continue;
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };
    const asked = new Set(Object.keys(deps).flatMap((d) => peers[d] ?? []));
    for (const dep of Object.keys(deps)) {
      const lib = LIBRARIES.find((l) => l.find.test(dep));
      if (lib && !asked.has(dep) && !config.libraries?.[dep]) found.push({ check: "libraries", file, message: `${dep} is ${lib.use}'s job: use it, or say why in .family.json "libraries"` });
    }
  }
  return found;
}

/** Capsomer's token names: every custom property its generated token files define (scale, color, themes). */
export function capsomerTokens(/** @type {string | null} */ dir) {
  const names = new Set();
  if (!dir) return names;
  for (const f of ["scale.css", "color.css", "themes.css"]) {
    const file = join(dir, "tokens", f);
    if (existsSync(file)) for (const m of readFileSync(file, "utf8").matchAll(/(?:^|[\s{;])(--[a-z0-9-]+)\s*:/g)) names.add(m[1]);
  }
  return names;
}

/** Whether the declaration at `index` sits in a rule for the whole page (:root, html, body), not one part of it. */
function rootRule(/** @type {string} */ code, /** @type {number} */ index) {
  const open = code.lastIndexOf("{", index);
  if (open < 0) return false;
  const start = Math.max(code.lastIndexOf("}", open), code.lastIndexOf(";", open), code.lastIndexOf("{", open - 1)) + 1;
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
    if (!(/\.css$/.test(file) || SOURCE.test(file)) || NOT_SOURCE.test(file)) continue;
    const text = tree.read(file);
    // Comments may name a token; only declarations count. Blanked, not removed, so line numbers hold.
    const code = text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`])\/\/.*$/gm, (c) => c.replace(/[^\n]/g, " "));
    for (const m of code.matchAll(/(^|[\s{;"'`])(--[a-z0-9-]+)\s*:(?!:)/g)) {
      const name = m[2];
      if (!tokens.has(name) || config.tokens?.[name] || !rootRule(code, m.index)) continue;
      const line = code.slice(0, m.index + m[1].length).split("\n").length;
      found.push({ check: "tokens", file, line, message: `${name} is Capsomer's: set it there (its site layer for this site's own look), or say why in .family.json "tokens"` });
    }
    if (config.tokens?.fonts) continue;
    // The family's faces come from capsomer/fonts.css, every weight in one file each, so a bold is the same bold on every
    // site (Dustin, 2026-10-28: sites that picked their own weights drew the footer's name differently).
    for (const m of code.matchAll(/@fontsource(?:-variable)?\/(?:schibsted-grotesk|martian-mono)\b|@font-face\s*\{[^}]*font-family:\s*["']?(?:Schibsted Grotesk|Martian Mono)/g)) {
      const line = code.slice(0, m.index).split("\n").length;
      found.push({ check: "tokens", file, line, message: `the family's faces are Capsomer's: load capsomer/fonts.css instead of your own files, or say why in .family.json "tokens" "fonts"` });
    }
  }
  return found;
}

/**
 * Family features each app is missing for its kind.
 * @param {Tree} tree @param {Config} config
 * @returns {Finding[]}
 */
export function checkFeatures(tree, config, now = Date.now()) {
  /** @type {Finding[]} */
  const found = [];
  const apps = Object.entries(config.apps ?? { ".": "site" });
  // Each file belongs to the deepest app directory that holds it.
  const owner = (/** @type {string} */ file) =>
    apps.map(([dir]) => dir).filter((dir) => dir === "." || file === dir || file.startsWith(`${dir}/`)).sort((a, b) => b.length - a.length)[0];
  for (const [dir, kind] of apps) {
    const mine = tree.files.filter((f) => owner(f) === dir && !NOT_SOURCE.test(f));
    const text = mine.filter((f) => SOURCE.test(f) || /\.(css|ya?ml)$/.test(f) || posix.basename(f) === "package.json").map(tree.read).join("\n");
    const prefix = dir === "." ? "" : `${dir}:`;
    for (const [feature, { kinds, find, use }] of Object.entries(FEATURES)) {
      if (!kinds.includes(kind) || config.waive?.[`${prefix}${feature}`] || find.test(text)) continue;
      found.push({ check: "features", file: dir, message: `${kind} ${dir === "." ? "" : `${dir} `}has no ${feature}: ${use}` });
    }
    // security.txt's Expires is a fixed date, so somebody confirms the address still works before it lapses; this is the
    // reminder, a month ahead.
    for (const f of mine.filter((file) => SOURCE.test(file))) {
      const m = /\bSECURITY_TXT_EXPIRES\s*=\s*["'`]([^"'`]+)["'`]/.exec(tree.read(f));
      if (m && Date.parse(m[1]) - now < 30 * 86_400_000) {
        found.push({ check: "features", file: f, message: `security.txt expires ${m[1]}: confirm its contact still delivers, then move SECURITY_TXT_EXPIRES on (under a year)` });
      }
    }
    const d1 = mine.some((f) => /(^|\/)wrangler[^/]*\.jsonc?(\.example)?$/.test(f) && /"d1_databases"/.test(tree.read(f)));
    if (d1 && kind !== "package" && !config.waive?.[`${prefix}backup`] && !BACKUP.find.test(text)) {
      found.push({ check: "features", file: dir, message: `${dir} has a D1 database and no nightly dump: ${BACKUP.use}` });
    }
  }
  return found;
}

/**
 * One British word rewritten the American way in a line, keeping its case: inside a camelCase or CONSTANT_CASE name too
 * when `names`, never in text `protect` matches. Case-insensitive by letter, not by flag, since
 * under the i flag [a-z] would match the capital that starts a name's next part: a capital may start a part anywhere, a
 * small letter only after a non-letter.
 * @param {string} text @param {string} from @param {string} to @param {RegExp} protect a global regex @param {boolean} names
 */
export function respell(text, from, to, protect, names) {
  const guarded = [...text.matchAll(protect)].map((g) => [g.index, g.index + g[0].length]);
  const [first, ...rest] = [...from.toLowerCase()];
  const body = rest.map((c) => `[${c}${c.toUpperCase()}]`).join("");
  const start = names ? `(?:(?<![A-Za-z])${first}|${first.toUpperCase()})` : `(?<![A-Za-z0-9_$])[${first}${first.toUpperCase()}]`;
  const tail = names ? "(?![a-z])" : "(?![A-Za-z0-9_$])";
  const cased = to.toLowerCase();
  return text.replace(new RegExp(`${start}${body}${tail}`, "g"), (word, at) => {
    if (guarded.some(([a, b]) => at < b && at + word.length > a)) return word;
    if (word === word.toUpperCase()) return cased.toUpperCase();
    if (word[0] === word[0].toUpperCase()) return cased[0].toUpperCase() + cased.slice(1);
    return cased;
  });
}

/**
 * British spellings, from codespell's en-GB to en-US list.
 * @param {string} root @param {Config} config @param {boolean} fix
 * @returns {Finding[]}
 */
export function checkSpelling(root, config, fix = false, names = true) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const skip = [...(config.spelling?.skip ?? []), "**/*.lock", "**/package-lock.json", "**/pnpm-lock.yaml", ".family.json"];
  const targets = files.filter((f) => !skip.some((s) => posix.matchesGlob?.(f, s) ?? f === s) && !/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|gz|wasm)$/i.test(f));
  // Names other tools own: GitHub Actions' cancelled(), Renovate's minimumReleaseAgeBehaviour, and ARIA's labelledby as a // codespell:ignore
  // camelCase name (labelledBy, ariaLabelledByElements). codespell:ignore
  const ignoreRegex = [String.raw`\bcancelled\\?\(|\bminimumReleaseAgeBehaviour\b|[lL]abelledBy`, ...(config.spelling?.contracts ?? [])].join("|"); // codespell:ignore
  const args = ["--builtin", "en-GB_to_en-US", "--quiet-level", "3", "--check-filenames", "--ignore-regex", ignoreRegex];
  if (config.spelling?.ignore?.length) args.push("--ignore-words-list", config.spelling.ignore.join(","));
  // Each part of a camelCase or CONSTANT_CASE name is read as a word, since a British name is spelling too.
  args.push("--regex", "[A-Z]?[a-z]+|[A-Z]+(?![a-z])");
  /** @type {Finding[]} */
  const found = [];
  /** @type {{ file: string, line: number, from: string, to: string }[]} */
  const hits = [];
  for (let i = 0; i < targets.length; i += 400) {
    const run = codespell([...args, "--", ...targets.slice(i, i + 400)], root);
    for (const line of run.split("\n")) {
      const m = /^(.+?):(\d+): (\S+) ==> (\S+)/.exec(line);
      if (!m) continue;
      hits.push({ file: m[1], line: Number(m[2]), from: m[3], to: m[4] });
      found.push({ check: "spelling", file: m[1], line: Number(m[2]), message: `${m[3]} is British; write ${m[4]} (or end the line with a codespell:ignore comment if it is a data contract)` });
    }
  }
  if (!fix) return found;
  // The fix rewrites what the check found, word by word: inside a name too (serialiseTags), never text a contract or // codespell:ignore
  // an ignore regex covers, and keeping each word's case. In a shared package (names false) a word inside a name is
  // left: renaming an export breaks every site that imports it, so it is renamed by hand with the old name kept.
  const protect = new RegExp(ignoreRegex, "g");
  const byFile = Map.groupBy(hits, (h) => h.file);
  for (const [file, list] of byFile) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    for (const { line, from, to } of list) {
      lines[line - 1] = respell(lines[line - 1], from, to, protect, names);
    }
    writeFileSync(join(root, file), lines.join("\n"));
  }
  return checkSpelling(root, config, false);
}

/** codespell from PATH, else through pipx at a pinned version. Its own exit code says only whether it found something. */
function codespell(/** @type {string[]} */ args, /** @type {string} */ cwd) {
  for (const [cmd, pre] of [["codespell", []], ["pipx", ["run", "codespell==2.4.3"]]]) {
    const run = spawnSync(cmd, [...pre, ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (run.error) continue;
    if (run.status !== 0 && run.status !== 65) throw new Error(`codespell failed: ${run.stderr.trim()}`);
    return run.stdout;
  }
  throw new Error("codespell is not installed and pipx is not either: pip install codespell==2.4.3");
}

/**
 * The export catalog: every installed shared package's subpaths and the names each exports.
 * @param {(name: string, repo: string) => string | null} locate the package's directory
 * @returns {{ catalog: Catalog, packages: { label: string, repo: string, version: string, entries: [string, string[]][], bins: string[] }[] }}
 */
export function readCatalog(locate) {
  /** @type {Catalog} */
  const catalog = {};
  const packages = [];
  for (const { name, repo, label } of PACKAGES) {
    const dir = locate(name, repo);
    if (!dir) continue;
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    /** @type {[string, string[]][]} */
    const entries = [];
    const exp = typeof manifest.exports === "string" ? { ".": manifest.exports } : (manifest.exports ?? {});
    for (const [sub, target] of Object.entries(exp)) {
      if (sub === "./package.json" || /\.css$|\.json$/.test(sub)) continue;
      if (sub.includes("*")) {
        const base = sub.split("/")[1];
        const comps = existsSync(join(dir, "components")) ? readdirSync(join(dir, "components")).filter((c) => statSync(join(dir, "components", c)).isDirectory()) : [];
        entries.push([sub, comps.map((c) => `${base}/${c}`)]);
        continue;
      }
      const file = moduleFile(dir, target);
      const names = file ? exportNames(followReexports(file)) : [];
      entries.push([sub, names]);
      // devkit's exports are test helpers, not site code a site could copy.
      if (repo !== "devkit") for (const n of names) if (!catalog[n] || catalog[n].endsWith(" .")) catalog[n] = `${label} ${sub}`;
    }
    packages.push({ label, repo, version: manifest.version, entries, bins: Object.keys(manifest.bin ?? {}) });
  }
  return { catalog, packages };
}

/** The file that declares a subpath's exports: its types, else its source. */
function moduleFile(/** @type {string} */ dir, /** @type {unknown} */ target) {
  /** @type {any} */
  let t = target;
  while (t && typeof t === "object") t = t.types ?? t.import ?? t.default;
  if (typeof t !== "string") return null;
  const f = join(dir, t);
  const candidates = [f, f.replace(/\.m?js$/, ".d.mts"), f.replace(/\.js$/, ".d.ts"), f.replace(/^(.*)\/dist\/(.*)\.d\.ts$/, "$1/src/$2.ts"), f.replace(/^(.*)\/dist\/(.*)\.js$/, "$1/src/$2.ts")];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/** The module's text with any `export * from` it makes appended. */
function followReexports(/** @type {string} */ file) {
  let src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/export\s+\*\s+from\s+["'](.+?)["']/g)) {
    const r = join(dirname(file), m[1]);
    const hit = [r, r.replace(/\.m?js$/, ".d.mts"), r.replace(/\.js$/, ".ts"), r.replace(/\.js$/, ".d.ts")].find((c) => existsSync(c) && statSync(c).isFile());
    if (hit) src += `\n${readFileSync(hit, "utf8")}`;
  }
  return src;
}

/** The generated list, as markdown. */
export function listMarkdown(/** @type {ReturnType<typeof readCatalog>["packages"]} */ packages) {
  const lines = [
    "# What the shared packages already do",
    "",
    "Generated by `devkit-family list`; do not edit by hand. Before writing anything a site might share, look here: if a package exports it, import it. `npx devkit-family` fails a repository that copies one of these, misses a family feature, or pins an old release.",
    "",
    "## Family features",
    "",
    "| Feature | Needed by | Provided by |",
    "| --- | --- | --- |",
    ...Object.entries(FEATURES).map(([f, { kinds, use }]) => `| ${f} | ${kinds.join(", ")} | ${use} |`),
    `| backup | any app with a D1 database | ${BACKUP.use} |`,
  ];
  for (const p of packages) {
    lines.push("", `## ${p.label} ${p.version} (DrDustinEdwards/${p.repo})`, "");
    for (const [sub, names] of p.entries) lines.push(`- \`${sub}\`: ${names.length ? names.map((n) => `\`${n}\``).join(", ") : "(no named exports)"}`);
    if (p.bins.length) lines.push(`- bins: ${p.bins.map((b) => `\`${b}\``).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Every tracked file, read from disk. */
function gitTree(/** @type {string} */ root) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  /** @type {Record<string, string>} */
  const cache = {};
  return {
    files: files.filter((f) => !f.includes("node_modules/")),
    read: (/** @type {string} */ f) => (cache[f] ??= existsSync(join(root, f)) && statSync(join(root, f)).isFile() ? readFileSync(join(root, f), "utf8") : ""),
  };
}

/** Each located shared package's peer dependencies. @param {(name: string, repo: string) => string | null} locate */
function peersOf(locate) {
  /** @type {Record<string, string[]>} */
  const peers = {};
  for (const p of PACKAGES) {
    const dir = locate(p.name, p.repo);
    if (dir) peers[p.name] = Object.keys(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).peerDependencies ?? {});
  }
  return peers;
}

function main(/** @type {string[]} */ argv) {
  const root = process.cwd();
  const from = argv.includes("--from") ? argv[argv.indexOf("--from") + 1] : null;
  // Installed packages by default; --from reads checkouts named by repository, for a tree with nothing installed.
  const locate = (/** @type {string} */ name, /** @type {string} */ repo) => {
    const dir = from ? join(from, repo) : join(root, "node_modules", name);
    return existsSync(join(dir, "package.json")) ? dir : null;
  };
  if (argv[0] === "list") {
    process.stdout.write(listMarkdown(readCatalog(locate).packages));
    return 0;
  }
  /** @type {Config} */
  const config = existsSync(join(root, ".family.json")) ? JSON.parse(readFileSync(join(root, ".family.json"), "utf8")) : {};
  const tree = gitTree(root);
  // A shared package defines its own exports; it is checked against the others, as a package, not a site.
  const self = PACKAGES.find((p) => p.name === JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name);
  if (self) config.apps ??= { ".": "package" };
  const { catalog } = readCatalog((name, repo) => (repo === self?.repo ? null : locate(name, repo)));
  // A name the package exports itself is its own API, even when another package exports a different thing by that name.
  if (self) for (const name of Object.keys(readCatalog((_, repo) => (repo === self.repo ? root : null)).catalog)) delete catalog[name];
  const lenient = (process.env.GITHUB_HEAD_REF ?? "").startsWith("renovate/");
  const findings = [
    ...checkPins(tree, lsRemoteTags, lenient),
    ...checkCopies(tree, catalog, config, self?.label),
    ...checkLibraries(tree, config, peersOf(locate)),
    ...checkFeatures(tree, config),
    ...(self?.repo === "capsomer" ? [] : checkTokens(tree, capsomerTokens(locate("capsomer", "capsomer")), config)),
    ...checkSpelling(root, config, argv.includes("--fix-spelling"), !self),
  ];
  const errors = findings.filter((f) => !f.warn);
  for (const f of findings) {
    const where = f.file ? ` file=${f.file}${f.line ? `,line=${f.line}` : ""}` : "";
    console.log(`::${f.warn ? "warning" : "error"}${where}::[${f.check}] ${f.message}`);
  }
  const counts = ["pins", "copies", "libraries", "features", "tokens", "spelling"].map((c) => `${c} ${findings.filter((f) => f.check === c).length}`).join(", ");
  console.log(errors.length ? `devkit-family: ${errors.length} to fix (${counts}). What the packages export: npx devkit-family list` : `devkit-family: in step with the family (${counts}).`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Family check\n\n${counts}\n`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.log(`::error::devkit-family could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
