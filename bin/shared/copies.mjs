import { posix } from "node:path";
import { NOT_SOURCE, SOURCE, blankComments, excused, readManifest } from "./core.mjs";

/** @typedef {import("./core.mjs").Config} Config */
/** @typedef {import("./core.mjs").Finding} Finding */
/** @typedef {import("./core.mjs").Tree} Tree */
/** @typedef {import("./core.mjs").Catalog} Catalog */

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

/** Text only a shared builder should write. */
const FINGERPRINTS = [
  { find: /User-agent:/, use: "Prelum ./robots robotsDocument" },
  { find: /<urlset\b/, use: "Prelum ./sitemap sitemapDocument" },
  { find: /<rss\b|<feed xmlns=/, use: "Prelum ./feeds" },
  { find: /api\.indexnow\.org/, use: "Prelum ./indexnow submitIndexNow" },
  { find: /Contact: mailto:/, use: "site-runtime ./security-txt securityTxt" },
  { find: /property[=:]\s*["']og:/, use: "Prelum ./head headTags" },
  {
    find: /["']Strict-Transport-Security["']\s*[:,]/,
    use: "site-runtime ./headers buildSecurityHeaders",
  },
  // An inline rule set (it needs its own CSP allowance) or a site's own rules file or header.
  {
    find: /speculationrules|["']Speculation-Rules["']/,
    use: "site-runtime ./prefetch speculationRules",
  },
  // Cloudflare Images called directly: the binding, or any .input(...).transform( chain.
  {
    find: /\bIMAGES\s*\.\s*input\s*\(|\.input\((?:[^()]|\([^()]*\))*\)\s*\.transform\s*\(/,
    use: "site-runtime ./image",
  },
  // A Google Fonts stylesheet linked from a page: a render-blocking request to a second origin, then the files from a
  // third. A server fetching a face (site-runtime ./share-card googleFont) names no href and passes.
  {
    find: /href\s*[:=]\s*\{?\s*["'`]https:\/\/fonts\.googleapis\.com\/css|@import\s+url\(\s*["']?https:\/\/fonts\.googleapis\.com/,
    use: "self-hosted fonts (capsomer/fonts.css for the network's faces, Fontsource for a site's own)",
  },
  // A loader of its own: finding the marked elements, or importing a module from /islands/.
  {
    find: /querySelectorAll\(\s*["'`][^"'`]*\[data-island\b|import\(\s*[`"']\/islands\//,
    use: "devkit ./islands startIslands",
  },
  // JSON-LD by hand: a script of that type filled by JSON.stringify in the same
  // expression, or a node naming the context itself (Prelum's thing and graph add it).
  {
    find: /application\/ld\+json["'`][^;]{0,300}?JSON\.stringify\(|["']@context["']\s*:\s*["']https?:\/\/schema\.org\/?["']/,
    use: "Prelum ./schema (thing, graph, jsonLd)",
  },
  // Head tags by hand: a Twitter card, or a canonical link (not a Link header's `>; rel="canonical"`).
  {
    find: /\bname\s*[=:]\s*["'`]twitter:|(?<![;>]\s*)\brel\s*[=:]\s*["'`]canonical["'`]/,
    use: "Prelum ./head headTags",
  },
  // Bytes to hex: the toString(16).padStart(2, "0") ... join("") loop over bytes (a digest, random bytes), not a color's
  // three channels, so only in a file that holds bytes.
  {
    also: /\bUint8Array\b|\bcrypto\.subtle\./,
    find: /\.toString\(16\)\s*\.padStart\(\s*2\s*,\s*["'`]0["'`]\s*\)[^;]{0,60}?\.join\(\s*(?:""|''|``)\s*\)/,
    use: "site-runtime ./encoding toHex (sha256Hex for a digest)",
  },
  // base64url: btoa(...) and then the + to - swap, in one statement.
  { find: /\bbtoa\([^;]{0,200}?\.replace\(\s*\/\\\+\/g/, use: "site-runtime ./encoding base64url" },
  // A constant-time compare of its own: OR-ing the XOR of two strings' or arrays' items.
  {
    find: /\|=\s*[\w$.]+\.charCodeAt\([^)]*\)\s*\^|\|=\s*[\w$.]+\[\w+\]\s*\^\s*[\w$.]+\[\w+\]/,
    use: "site-runtime ./compare safeEqual",
  },
  // Server-side Turnstile and the Access localhost bypass: each belongs once, in site-runtime, beside the client and
  // the verifier it goes with.
  {
    find: /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/,
    use: "site-runtime ./turnstile",
    say: "Turnstile's siteverify call is written here: it belongs in site-runtime ./turnstile, beside mountTurnstile",
  },
  {
    find: /\bACCESS_DEV_BYPASS\b/,
    use: "site-runtime ./access",
    say: "ACCESS_DEV_BYPASS is a localhost way past Access written here: it belongs in site-runtime ./access, beside verifyAccessRequest",
  },
  // The pre-paint theme script: the stored choice read and set on the root before the page paints.
  {
    find: /localStorage\.getItem\([^)]{0,80}\)[^`]{0,300}?setAttribute\(\s*\\?["']data-theme/,
    use: "Capsomer ./theme-server themeScript",
  },
  // React Router's template error boundary, never replaced.
  {
    find: /["'`]Oops!["'`]/,
    use: "Capsomer",
    say: "React Router's template ErrorBoundary (\"Oops!\") is still here: give the site its own error page, in Capsomer's empty state",
  },
];

/** A security header set written into Cloudflare's static `_headers` (bsw's copy). */
const HEADERS_COPY = {
  find: /^[ \t]+(?:Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options|Cross-Origin-Opener-Policy)\s*:/m,
  use: "site-runtime ./headers buildSecurityHeaders",
};

/** The Claude Code hooks in devkit's claude/hooks, one copy for every repository. */
export const CLAUDE_HOOKS = ["no-em-dash.sh", "scoped-git-add.sh", "pre-push.sh"];

/** Libraries a shared package wraps, so a site that lists one is doing that package's job. */
const LIBRARIES = [
  {
    find: /^(marked|markdown-it|micromark.*|remark.*|rehype.*|unified|mdast-util-.*|hast-util-.*)$/,
    use: "Prelum ./render",
  },
  { find: /^mermaid$/, use: "Prelum ./render/diagram" },
  { find: /^katex$/, use: "Prelum ./render/math" },
  { find: /^(shiki|highlight\.js|prismjs)$/, use: "Prelum ./render/highlight" },
  { find: /^(feed|rss|sitemap|xmlbuilder2?)$/, use: "Prelum ./feeds and ./sitemap" },
  { find: /^(sanitize-html|dompurify|isomorphic-dompurify)$/, use: "Prelum ./render/safe" },
  { find: /^jose$/, use: "site-runtime ./access and ./access-login" },
];

/**
 * Local names for something a shared package exports under another name.
 * @type {Readonly<Record<string, string>>}
 */
const ALIASES = {
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

/**
 * Aliases that are also ordinary names (a Markdown `esc`, a KB path's `slugOf`, a color's `hex`), so a definition counts
 * only when its body does the shared export's job.
 * @type {Record<string, { target: string, body: RegExp }>}
 */
const BODY_ALIASES = {
  sha256Of: { target: "sha256Hex", body: /subtle\.digest\(/ },
  hashToken: { target: "sha256Hex", body: /subtle\.digest\(\s*["'`]SHA-256/ },
  hashMcpToken: { target: "sha256Hex", body: /subtle\.digest\(\s*["'`]SHA-256/ },
  hashRecipient: { target: "sha256Hex", body: /subtle\.digest\(\s*["'`]SHA-256/ },
  generateSlug: { target: "slugify", body: /toLowerCase\(\)[\s\S]*\.replace\(/ },
  slugOf: { target: "slugify", body: /toLowerCase\(\)[\s\S]*\.replace\(/ },
  esc: { target: "escapeHtml", body: /&(?:amp|lt|quot);|&#/ },
  attr: { target: "escapeHtml", body: /&(?:amp|lt|quot);|&#/ },
  hex: { target: "toHex", body: /toString\(16\)\s*\.padStart\(\s*2\b/ },
  b64: { target: "toBase64", body: /\bbtoa\(/ },
};

/** A definition's text: its first line and every line after it indented deeper, so a function's body or one arrow. */
function definitionBody(/** @type {string} */ text, /** @type {number} */ start) {
  const lines = text.slice(start, start + 2000).split("\n");
  const indent = /^[ \t]*/.exec(lines[0])?.[0].length ?? 0;
  const end = lines.findIndex(
    (l, i) => i > 0 && l.trim() !== "" && (/^[ \t]*/.exec(l)?.[0].length ?? 0) <= indent,
  );
  return lines.slice(0, end < 0 ? undefined : end).join("\n");
}

// Single words too common to flag on name alone; compound names (escapeHtml, jsonLd) are distinctive, except these.
const DISTINCT_SINGLE = new Set(["slugify"]);

const COMMON_COMPOUND = new Set(["accessToken", "cacheKey"]);

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
