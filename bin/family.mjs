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
//     "spelling": { "ignore": ["word"], "skip": ["frame/**"] }      words that are data contracts; paths not checked
//   }
//
// On a Renovate branch (GITHUB_HEAD_REF renovate/...) the pin findings are warnings: a bump of one package must not fail
// because another is also behind. A line ending in a codespell:ignore comment is a contract the spelling check leaves.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
};

// Single words too common to flag on name alone; compound names (escapeHtml, jsonLd) are distinctive, except these.
const DISTINCT_SINGLE = new Set(["slugify"]);
const COMMON_COMPOUND = new Set(["accessToken"]);
const SOURCE = /\.(m?[jt]sx?|mts|cts)$/;
const NOT_SOURCE = /(^|\/)(node_modules|dist|build|coverage|test|tests|e2e|__tests__|fixtures)\/|\.(test|spec)\.[mc]?[jt]sx?$|\.d\.m?ts$|worker-configuration\.d\.ts$/;

/**
 * @typedef {"site" | "static" | "private" | "worker" | "package"} Kind
 * @typedef {{ apps?: Record<string, Kind>, waive?: Record<string, string>, copies?: Record<string, string>,
 *   libraries?: Record<string, string>, spelling?: { ignore?: string[], skip?: string[] } }} Config
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
 * Direct dependencies on libraries a shared package wraps.
 * @param {Tree} tree @param {Config} config
 * @returns {Finding[]}
 */
export function checkLibraries(tree, config) {
  /** @type {Finding[]} */
  const found = [];
  for (const file of tree.files.filter((f) => posix.basename(f) === "package.json")) {
    const manifest = JSON.parse(tree.read(file));
    if (PACKAGES.some((p) => p.name === manifest.name)) continue;
    for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      const lib = LIBRARIES.find((l) => l.find.test(dep));
      if (lib && !config.libraries?.[dep]) found.push({ check: "libraries", file, message: `${dep} is ${lib.use}'s job: use it, or say why in .family.json "libraries"` });
    }
  }
  return found;
}

/**
 * Family features each app is missing for its kind.
 * @param {Tree} tree @param {Config} config
 * @returns {Finding[]}
 */
export function checkFeatures(tree, config) {
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
    const d1 = mine.some((f) => /(^|\/)wrangler[^/]*\.jsonc?(\.example)?$/.test(f) && /"d1_databases"/.test(tree.read(f)));
    if (d1 && kind !== "package" && !config.waive?.[`${prefix}backup`] && !BACKUP.find.test(text)) {
      found.push({ check: "features", file: dir, message: `${dir} has a D1 database and no nightly dump: ${BACKUP.use}` });
    }
  }
  return found;
}

/**
 * British spellings, from codespell's en-GB to en-US list.
 * @param {string} root @param {Config} config @param {boolean} fix
 * @returns {Finding[]}
 */
export function checkSpelling(root, config, fix = false) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const skip = [...(config.spelling?.skip ?? []), "*.lock", "package-lock.json", "pnpm-lock.yaml", ".family.json"];
  const targets = files.filter((f) => !skip.some((s) => posix.matchesGlob?.(f, s) ?? f === s) && !/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|gz|wasm)$/i.test(f));
  // Names other tools own: GitHub Actions' cancelled() and Renovate's minimumReleaseAgeBehaviour. codespell:ignore
  const args = ["--builtin", "en-GB_to_en-US", "--quiet-level", "3", "--check-filenames", "--ignore-regex", String.raw`\bcancelled\\?\(|\bminimumReleaseAgeBehaviour\b`]; // codespell:ignore
  if (config.spelling?.ignore?.length) args.push("--ignore-words-list", config.spelling.ignore.join(","));
  // The check reads each part of a camelCase or CONSTANT_CASE name as a word, since a British name is spelling too. The
  // fix rewrites whole words only: renaming an export breaks every site that imports it, so a name is renamed by hand,
  // keeping the old one as an alias.
  args.push(...(fix ? ["--write-changes"] : ["--regex", "[A-Z]?[a-z]+|[A-Z]+(?![a-z])"]));
  /** @type {Finding[]} */
  const found = [];
  for (let i = 0; i < targets.length; i += 400) {
    const run = codespell([...args, "--", ...targets.slice(i, i + 400)], root);
    for (const line of run.split("\n")) {
      const m = /^(.+?):(\d+): (\S+) ==> (\S+)/.exec(line);
      if (m) found.push({ check: "spelling", file: m[1], line: Number(m[2]), message: `${m[3]} is British; write ${m[4]} (or end the line with a codespell:ignore comment if it is a data contract)` });
    }
  }
  return found;
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
    ...checkLibraries(tree, config),
    ...checkFeatures(tree, config),
    ...checkSpelling(root, config, argv.includes("--fix-spelling")),
  ];
  const errors = findings.filter((f) => !f.warn);
  for (const f of findings) {
    const where = f.file ? ` file=${f.file}${f.line ? `,line=${f.line}` : ""}` : "";
    console.log(`::${f.warn ? "warning" : "error"}${where}::[${f.check}] ${f.message}`);
  }
  const counts = ["pins", "copies", "libraries", "features", "spelling"].map((c) => `${c} ${findings.filter((f) => f.check === c).length}`).join(", ");
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
