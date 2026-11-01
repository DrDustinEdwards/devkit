#!/usr/bin/env node
// The shared-code check: what keeps a repository in step with the shared packages. It fails (exit 1, an ::error:: line each) on
//
//   pins       a dependency on one of the shared packages, or a call to devkit's reusable workflows, on a raw commit
//              rather than a release tag (a pin behind the newest release is a warning: Renovate opens that bump, and
//              failing on it turned every repository red each time a package released), and a site-runtime pin behind
//              the newest minor released FRESH_DAYS ago or more (its header registry is what the live check grades, so
//              a site that drifts further builds one set of headers and is graded against another);
//   copies     a local definition with the name of something a shared package exports (or a known alias), or text only a
//              shared builder should write (a robots.txt "User-agent:", a sitemap "<urlset", an IndexNow POST, speculation
//              rules, a Cloudflare Images resize, an island loader, JSON-LD, a hex or base64url encoder, a pre-paint theme
//              script...), in source or in a static _headers file (a security header set);
//   libraries  a direct dependency on a library a shared package wraps (marked, remark, mermaid, sanitize-html...);
//   features   a shared feature the repository's kind of app should have and does not import (robots.txt, security.txt,
//              IndexNow, the CSP report endpoint, /health...), and as warnings an accessibility test, noindex on admin and
//              login routes, and a feed's alternate link;
//   tokens     a site setting its own value for one of Capsomer's tokens (--page-max, --measure, --radius-m, --accent...),
//              or loading its own files for the network's faces (Schibsted Grotesk, Martian Mono) instead of
//              capsomer/fonts.css: a value the network shares is set once, in Capsomer, never per site;
//   spelling   British spelling, read by codespell's en-GB to en-US list (American English everywhere, Dustin 2026-10-25);
//   workflows  a devkit workflow the repository's kinds need and no workflow calls: checks,
//              workflow-audit and dependencies everywhere, worker-size and worker-deploy for an app with a wrangler
//              config, no-bloat in a public repository with JavaScript or TypeScript, bump-consumers in a shared package,
//              conformance where an MCP server is (a source file importing site-runtime ./mcp-server or ./mcp-login),
//              scorecard in a public repository;
//   fakes      a test fake of its own where devkit has one: a GitHub API fake, an Access key pair and key set, a fetch
//              that refuses every URL, a list of DELETE FROMs (./github, ./access, ./network, ./d1);
//   ai         a model call or AI prompt that skips the shared pieces (area 11): Anthropic called outside site-runtime
//              ./anthropic (C1, G1), a Workers AI run with no timeout, gateway or max_tokens (C2, G1, C5), an AI Search
//              call or reranker with no timeout (C2, C13), JSON cut out of a model's free text (C6), a prompt's own dash
//              rule instead of WRITING_RULES (W5), a routine fired outside fireOnce (R2); and in pins, an MCP server's
//              site-runtime more than one minor behind the newest release (S7);
//   config     .shared.json itself: an unknown key or kind stops the check (exit 2), and an exception that excused
//              nothing in this run is a warning.
//
//   npx devkit-shared                    the check, against .shared.json (no file: one site at the root)
//   npx devkit-shared --fix-spelling     rewrite the British spellings in place, then run the check
//   npx devkit-shared list               the generated list of every shared package's exports and every shared feature
//   --from <dir>                         read the packages from checkouts named by repository (dir/prelum, dir/site-runtime...)
//                                        instead of node_modules; a checkout missing there stops the check (exit 2)
//
// Without --from a package not in node_modules is named in a warning: copies of its exports (and, for Capsomer, its
// tokens) are not checked, and no exception is judged stale, since what it would excuse was not looked for.
//
// The config, every field optional:
//
//   {
//     "apps": { ".": "site", "mcp": "worker" },          kind per directory: site, static, private, worker or package
//     "waive": { "indexnow": "why", "mcp:health": "why", "workflow:worker-deploy": "why" },
//                                                         a feature or devkit workflow this repository does not need, and why
//     "copies": { "app/lib/og.ts": "why" },               a file allowed to hold a copy (or a test, a fake), and why
//     "libraries": { "katex": "why" },                    a direct dependency allowed, and why
//     "tokens": { "--measure": "why", "fonts": "why" },   a Capsomer token this repository sets itself (or "fonts", its own
//                                                         files for the network's faces), and why
//     "spelling": { "ignore": ["word"], "contracts": ["regex"], "skip": ["frame/**"] }
//                                                         words never checked; text a regex matches (a stored value, a
//                                                         column) left as it is, while the same word in prose is fixed;
//                                                         paths not checked
//   }
//
// A line ending in a codespell:ignore comment is a contract the spelling check leaves.
//
// Warnings (::warning::, exit 0) are also how a new rule arrives: a rule's `failsFrom` names the devkit release it fails
// from, compared with this devkit's own package.json version, so it warns for one release while the sites move and the
// release itself flips it. A few feature heuristics (an accessibility test, noindex on admin routes, a feed's alternate
// link), worker-deploy and a stale exception stay warnings. Each is silenced the same way as a failure: "copies" for a
// file, "waive" for a feature or workflow.

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

/** Every shared feature: which kinds of app need it, how its use is found, and what provides it. */
export const FEATURES = {
  robots: { kinds: SITE, find: /site-helpers\/robots["']/, use: "Prelum ./robots robotsDocument (/robots.txt)" },
  aiTxt: { kinds: SITE, find: /\baiTxt(Response)?\b/, use: "Prelum ./robots aiTxt or aiTxtResponse (/ai.txt)" },
  tdm: { kinds: SITE, find: /\bTDM_RESERVATION_HEADERS\b/, use: "Prelum ./robots TDM_RESERVATION_HEADERS" },
  sitemap: { kinds: SITE, find: /site-helpers\/sitemap["']/, use: "Prelum ./sitemap sitemapDocument (/sitemap.xml)" },
  llms: { kinds: SITE, find: /site-helpers\/llms["']/, use: "Prelum ./llms llmsDocument (/llms.txt)" },
  head: { kinds: SITE, find: /site-helpers\/head["']/, use: "Prelum ./head headTags (canonical, Open Graph, Twitter)" },
  schema: { kinds: SITE, find: /site-helpers\/schema["']/, use: "Prelum ./schema (JSON-LD)" },
  indexnow: { kinds: SITE, find: /site-helpers\/indexnow["']|prelum-indexnow/, use: "Prelum ./indexnow submitIndexNow (site-api indexNowHook on a Carrel site; prelum-indexnow after a static deploy)" },
  securityTxt: { kinds: SITE, find: /site-runtime\/security-txt["']/, use: "site-runtime ./security-txt (/.well-known/security.txt)" },
  // A registry entry (./sites) counts for both: staticSite({ site }) and site-runtime-headers build a static site's set
  // and page policy from it with buildSecurityHeaders and buildContentSecurityPolicy.
  headers: { kinds: [...PUBLIC_OR_PRIVATE, "worker"], find: /site-runtime\/(headers|sites)["']|\bwithMcpHeaders\b/, use: "site-runtime ./headers buildSecurityHeaders (or a ./sites entry given to ./static-site staticSite)" },
  csp: { kinds: PUBLIC_OR_PRIVATE, find: /site-runtime\/(csp|sites)["']/, use: "site-runtime ./csp buildContentSecurityPolicy (or a ./sites entry given to ./static-site staticSite)" },
  cspReport: { kinds: PUBLIC_OR_PRIVATE, find: /site-runtime\/(csp-report|static-site)["']/, use: "site-runtime ./csp-report receiveCspReport (./static-site staticSite receives them for a static site)" },
  health: { kinds: ["site", "private"], find: /site-runtime\/health["']/, use: "site-runtime ./health healthResponse (/health)" },
  // base.css, not just a token file: the element styles every page in the network shares. A build that copies it out of the
  // package (Capsid's explorer: require.resolve("capsomer/package.json"), then "css/base.css") counts.
  capsomer: { kinds: PUBLIC_OR_PRIVATE, find: /["']capsomer\/base\.css["']|["']capsomer\/package\.json["'][^]{0,400}?["']css\/base\.css["']/, use: "Capsomer's capsomer/base.css (tokens, element styles, the site layer), then its components" },
};
/**
 * A React Router app on Workers Assets serves its built files from the assets layer, which sends them with
 * `max-age=0, must-revalidate` unless the app's `_headers` says otherwise, so every page load revalidates every file.
 * Vite and siteScript name each one by its content, so a year, immutable, is safe for the hashed directories.
 */
const HASHED_DIRS = [
  { dir: "/assets/*", needed: () => true },
  { dir: "/islands/*", needed: (/** @type {string} */ text) => /devkit\/islands["']/.test(text) },
];
export const ASSET_CACHE = { use: "public/_headers: Cache-Control: public, max-age=31536000, immutable" };

/** Whether a `_headers` text gives `dir` a Cache-Control with immutable. */
export function cachesHashed(/** @type {string} */ headers, /** @type {string} */ dir) {
  const blocks = headers.split(/\r?\n(?=\S)/);
  return blocks.some((b) => b.split(/\r?\n/)[0].trim() === dir && /^\s+Cache-Control:[^\n]*\bimmutable\b/im.test(b));
}

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
  // An inline rule set (it needs its own CSP allowance) or a site's own rules file or header.
  { find: /speculationrules|["']Speculation-Rules["']/, use: "site-runtime ./prefetch speculationRules" },
  // Cloudflare Images called directly: the binding, or any .input(...).transform( chain.
  { find: /\bIMAGES\s*\.\s*input\s*\(|\.input\((?:[^()]|\([^()]*\))*\)\s*\.transform\s*\(/, use: "site-runtime ./image" },
  // A Google Fonts stylesheet linked from a page: a render-blocking request to a second origin, then the files from a
  // third. A server fetching a face (site-runtime ./share-card googleFont) names no href and passes.
  { find: /href\s*[:=]\s*\{?\s*["'`]https:\/\/fonts\.googleapis\.com\/css|@import\s+url\(\s*["']?https:\/\/fonts\.googleapis\.com/, use: "self-hosted fonts (capsomer/fonts.css for the network's faces, Fontsource for a site's own)" },
  // A loader of its own: finding the marked elements, or importing a module from /islands/.
  { find: /querySelectorAll\(\s*["'`][^"'`]*\[data-island\b|import\(\s*[`"']\/islands\//, use: "devkit ./islands startIslands" },
  // JSON-LD by hand: a script of that type filled by JSON.stringify in the same
  // expression, or a node naming the context itself (Prelum's thing and graph add it).
  { failsFrom: "0.21.0", find: /application\/ld\+json["'`][^;]{0,300}?JSON\.stringify\(|["']@context["']\s*:\s*["']https?:\/\/schema\.org\/?["']/, use: "Prelum ./schema (thing, graph, jsonLd)" },
  // Head tags by hand: a Twitter card, or a canonical link (not a Link header's `>; rel="canonical"`).
  { failsFrom: "0.21.0", find: /\bname\s*[=:]\s*["'`]twitter:|(?<![;>]\s*)\brel\s*[=:]\s*["'`]canonical["'`]/, use: "Prelum ./head headTags" },
  // Bytes to hex: the toString(16).padStart(2, "0") ... join("") loop over bytes (a digest, random bytes), not a color's
  // three channels, so only in a file that holds bytes.
  { failsFrom: "0.21.0", also: /\bUint8Array\b|\bcrypto\.subtle\./, find: /\.toString\(16\)\s*\.padStart\(\s*2\s*,\s*["'`]0["'`]\s*\)[^;]{0,60}?\.join\(\s*(?:""|''|``)\s*\)/, use: "site-runtime ./encoding toHex (sha256Hex for a digest)" },
  // base64url: btoa(...) and then the + to - swap, in one statement.
  { failsFrom: "0.21.0", find: /\bbtoa\([^;]{0,200}?\.replace\(\s*\/\\\+\/g/, use: "site-runtime ./encoding base64url" },
  // A constant-time compare of its own: OR-ing the XOR of two strings' or arrays' items.
  { failsFrom: "0.21.0", find: /\|=\s*[\w$.]+\.charCodeAt\([^)]*\)\s*\^|\|=\s*[\w$.]+\[\w+\]\s*\^\s*[\w$.]+\[\w+\]/, use: "site-runtime ./compare safeEqual" },
  // Server-side Turnstile and the Access localhost bypass: each belongs once, in site-runtime, beside the client and
  // the verifier it goes with.
  { failsFrom: "0.21.0", find: /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/, use: "site-runtime ./turnstile", say: "Turnstile's siteverify call is written here: it belongs in site-runtime ./turnstile, beside mountTurnstile" },
  { failsFrom: "0.21.0", find: /\bACCESS_DEV_BYPASS\b/, use: "site-runtime ./access", say: "ACCESS_DEV_BYPASS is a localhost way past Access written here: it belongs in site-runtime ./access, beside verifyAccessRequest" },
  // The pre-paint theme script: the stored choice read and set on the root before the page paints.
  { failsFrom: "0.21.0", find: /localStorage\.getItem\([^)]{0,80}\)[^`]{0,300}?setAttribute\(\s*\\?["']data-theme/, use: "Capsomer ./theme-server themeScript" },
  // React Router's template error boundary, never replaced.
  { failsFrom: "0.21.0", find: /["'`]Oops!["'`]/, use: "Capsomer", say: "React Router's template ErrorBoundary (\"Oops!\") is still here: give the site its own error page, in Capsomer's empty state" },
];
/** A security header set written into Cloudflare's static `_headers` (bsw's copy). */
export const HEADERS_COPY = { failsFrom: "0.21.0", find: /^[ \t]+(?:Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options|Cross-Origin-Opener-Policy)\s*:/m, use: "site-runtime ./headers buildSecurityHeaders" };

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

/**
 * Aliases that are also ordinary names (a Markdown `esc`, a KB path's `slugOf`, a color's `hex`), so a definition counts
 * only when its body does the shared export's job.
 * @type {Record<string, { target: string, failsFrom: string, body: RegExp }>}
 */
export const BODY_ALIASES = {
  sha256Of: { target: "sha256Hex", failsFrom: "0.21.0", body: /subtle\.digest\(/ },
  hashToken: { target: "sha256Hex", failsFrom: "0.21.0", body: /subtle\.digest\(\s*["'`]SHA-256/ },
  hashMcpToken: { target: "sha256Hex", failsFrom: "0.21.0", body: /subtle\.digest\(\s*["'`]SHA-256/ },
  hashRecipient: { target: "sha256Hex", failsFrom: "0.21.0", body: /subtle\.digest\(\s*["'`]SHA-256/ },
  generateSlug: { target: "slugify", failsFrom: "0.21.0", body: /toLowerCase\(\)[\s\S]*\.replace\(/ },
  slugOf: { target: "slugify", failsFrom: "0.21.0", body: /toLowerCase\(\)[\s\S]*\.replace\(/ },
  esc: { target: "escapeHtml", failsFrom: "0.21.0", body: /&(?:amp|lt|quot);|&#/ },
  attr: { target: "escapeHtml", failsFrom: "0.21.0", body: /&(?:amp|lt|quot);|&#/ },
  hex: { target: "toHex", failsFrom: "0.21.0", body: /toString\(16\)\s*\.padStart\(\s*2\b/ },
  b64: { target: "toBase64", failsFrom: "0.21.0", body: /\bbtoa\(/ },
};

/** A definition's text: its first line and every line after it indented deeper, so a function's body or one arrow. */
export function definitionBody(/** @type {string} */ text, /** @type {number} */ start) {
  const lines = text.slice(start, start + 2000).split("\n");
  const indent = /^[ \t]*/.exec(lines[0])?.[0].length ?? 0;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() !== "" && (/^[ \t]*/.exec(l)?.[0].length ?? 0) <= indent);
  return lines.slice(0, end < 0 ? undefined : end).join("\n");
}

/**
 * Family features found by a heuristic, so they warn instead of failing: each is a function of the app's files that
 * answers what is missing, or null. `.shared.json` "waive" silences one by its name, as it does a feature.
 * @type {Record<string, { kinds: string[], use: string, missing: (app: { files: string[], text: string, read: (f: string) => string }) => string | null }>}
 */
export const ADVISORIES = {
  // An accessibility test of its own pages: Capsomer's axe helpers or axe-core, in a test or a browser check script.
  a11y: {
    kinds: PUBLIC_OR_PRIVATE,
    use: "capsomer/testing expectNoAxeViolations (or @axe-core) in a browser test",
    missing: ({ files, read }) => (files.some((f) => SOURCE.test(f) && /["'](?:capsomer\/testing|@axe-core\/[^"']+|axe-core(?:\/[^"']*)?)["']/.test(read(f))) ? null : "no accessibility test"),
  },
  // An admin, login or console page kept out of search: some file that names the route also says noindex (the route,
  // its layout, a Worker rule or a _headers block).
  noindex: {
    kinds: SITE,
    use: "a robots noindex meta or X-Robots-Tag: noindex on each admin, login, signin or console route",
    missing: ({ files, read }) => {
      const names = new Set(files.map((f) => ADMIN_ROUTE.exec(f)?.[1]).filter((n) => n !== undefined));
      const sayers = files.filter((f) => ((SOURCE.test(f) && !NOT_SOURCE.test(f)) || posix.basename(f) === "_headers") && /noindex/i.test(read(f)));
      const bare = [...names].filter((n) => !sayers.some((f) => ADMIN_ROUTE.exec(f)?.[1] === n || new RegExp(`(?:^|["'\`])/${n}\\b`, "m").test(read(f))));
      return bare.length ? `${bare.map((n) => `/${n}`).join(", ")} without noindex` : null;
    },
  },
  // A feed a reader can find from the page: a rel="alternate" link of the feed's type, in code, not a comment.
  feedLink: {
    kinds: SITE,
    use: '`<link rel="alternate" type="application/rss+xml">` (or atom, or feed+json) in the head',
    missing: ({ text }) =>
      /\b(?:rssDocument|atomDocument|jsonFeedDocument)\b|["'`]Content-Type["'`]\s*:\s*["'`]application\/(?:rss|atom)\+xml/.test(text) &&
      !/\brel\s*[=:]\s*["'`]alternate["'`][^>{}]{0,200}?application\/(?:rss\+xml|atom\+xml|feed\+json)|application\/(?:rss\+xml|atom\+xml|feed\+json)["'`][^>{}]{0,200}?\brel\s*[=:]\s*["'`]alternate/.test(blankComments(text))
        ? "a feed and no alternate link to it"
        : null,
  },
};
/** A route file for a page search should not list, and which one (admin, login, signin, sign-in or console). */
const ADMIN_ROUTE = /(?:^|\/)routes\/(?:[^/]*\/)*(?:[^/]*\.)?(admin|login|signin|sign-in|console)(?=[./_$-])/;

// Single words too common to flag on name alone; compound names (escapeHtml, jsonLd) are distinctive, except these.
const DISTINCT_SINGLE = new Set(["slugify"]);
const COMMON_COMPOUND = new Set(["accessToken", "cacheKey"]);
const SOURCE = /\.(m?[jt]sx?|mts|cts)$/;
const NOT_SOURCE = /(^|\/)(node_modules|dist|build|coverage|test|tests|e2e|__tests__|fixtures)\/|\.(test|spec)\.[mc]?[jt]sx?$|\.d\.m?ts$|worker-configuration\.d\.ts$/;

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
function compare(a, b) {
  const [x, y] = [semver(a), semver(b)];
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** This devkit's own version, which each rule's failsFrom is compared with. */
export const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

/** Whether a finding is a warning: one always, or a rule's that fails only from a later devkit release. */
export function isWarning(/** @type {Finding} */ f, version = VERSION) {
  return f.warn === true || (f.failsFrom !== undefined && compare(version, f.failsFrom) < 0);
}

export const KINDS = ["site", "static", "private", "worker", "package"];
const CONFIG_KEYS = { apps: 0, waive: 0, copies: 0, libraries: 0, tokens: 0, spelling: ["ignore", "contracts", "skip"] };

/** Refuses a .shared.json the check would misread: an unknown key (a typo'd "wave" waives nothing) or kind. */
export function validateConfig(/** @type {Record<string, any>} */ config) {
  const bad = (/** @type {string} */ what, /** @type {string[]} */ valid) => {
    throw new Error(`.shared.json: ${what}; the valid ones are ${valid.join(", ")}`);
  };
  for (const key of Object.keys(config)) if (!(key in CONFIG_KEYS)) bad(`"${key}" is no key`, Object.keys(CONFIG_KEYS));
  for (const key of Object.keys(config.spelling ?? {})) if (!CONFIG_KEYS.spelling.includes(key)) bad(`"spelling" has no "${key}"`, CONFIG_KEYS.spelling);
  for (const [dir, kind] of Object.entries(config.apps ?? {})) if (!KINDS.includes(kind)) bad(`"apps" "${dir}" is "${kind}", which is no kind`, KINDS);
}

/** The exceptions each config excused something with, so the ones that excused nothing can be named. */
const EXCUSED = new WeakMap();

/** Whether .shared.json excuses `key` in `section` ("copies", "waive", "libraries", "tokens"), remembered when it does. */
export function excused(/** @type {Config} */ config, /** @type {string} */ section, /** @type {string} */ key) {
  if (!(/** @type {Record<string, any>} */ (config)[section]?.[key])) return false;
  used(config, section, key);
  return true;
}

function used(/** @type {Config} */ config, /** @type {string} */ section, /** @type {string} */ key) {
  if (!EXCUSED.has(config)) EXCUSED.set(config, new Set());
  EXCUSED.get(config).add(`${section}\0${key}`);
}

/** Each exception in .shared.json that excused nothing in this run: dead config, or a rule that moved past it. */
export function staleExceptions(/** @type {Config} */ config) {
  const seen = EXCUSED.get(config) ?? new Set();
  /** @type {[string, string][]} */
  const all = [
    ...["copies", "waive", "libraries", "tokens"].flatMap((s) => Object.keys(/** @type {Record<string, any>} */ (config)[s] ?? {}).map((k) => /** @type {[string, string]} */ ([s, k]))),
    ...(config.spelling?.ignore ?? []).map((k) => /** @type {[string, string]} */ (["spelling.ignore", k])),
    ...(config.spelling?.contracts ?? []).map((k) => /** @type {[string, string]} */ (["spelling.contracts", k])),
  ];
  return all
    .filter(([s, k]) => !seen.has(`${s}\0${k}`))
    .map(([s, k]) => ({ check: "config", file: ".shared.json", warn: true, message: `${s.split(".").map((p) => `"${p}"`).join(" ")} "${k}" excuses nothing in this run: remove it` }));
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
 * The packages a pin may not stay behind for long, and the days a new minor release gets before a pin behind it fails.
 * site-runtime releases many minors a day, so the window is time, not a count of minors: a pin fails once it is behind
 * a minor that has been out FRESH_DAYS days, and a minor younger than that is the usual warning.
 */
export const FRESH = /** @type {Record<string, number>} */ ({ "site-runtime": 3 });
const DAY_MS = 86_400_000;

/**
 * The newest major.minor among releases published at or before `cutoff`, from { tag: ISO date }; null for none.
 * @param {Record<string, string>} dates @param {number} cutoff
 */
export function settledMinor(dates, cutoff) {
  const settled = Object.entries(dates).filter(([tag, at]) => semver(tag) && Date.parse(at) <= cutoff).map(([tag]) => tag);
  const top = newest(settled);
  return top ? /** @type {number[]} */ (semver(top)).slice(0, 2) : null;
}

/**
 * Release tag -> publish date for one repository, from the GitHub releases API: up to three pages, stopping once a page
 * reaches past the oldest date the rule can need. GITHUB_TOKEN, when set, lifts the anonymous rate limit.
 * @param {string} repo @param {number} since
 */
export async function releaseDates(repo, since) {
  /** @type {Record<string, string>} */
  const dates = {};
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "devkit-shared", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`https://api.github.com/repos/DrDustinEdwards/${repo}/releases?per_page=100&page=${page}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${repo}'s releases`);
    const list = /** @type {{ tag_name: string, published_at: string | null, draft: boolean }[]} */ (await res.json());
    for (const r of list) if (!r.draft && r.published_at) dates[r.tag_name] = r.published_at;
    if (list.length < 100 || list.some((r) => r.published_at && Date.parse(r.published_at) < since)) break;
  }
  return dates;
}

/**
 * Pins on a raw commit (an error), behind the newest tag (a warning), or, for a FRESH package, behind a minor that has
 * been out FRESH days (an error). `dates` holds each FRESH package's release dates, or the reason they could not be read.
 * @param {Tree} tree @param {TagReader} readTags @param {Record<string, Record<string, string> | Error>} [dates]
 * @returns {Finding[]}
 */
export function checkPins(tree, readTags, dates = {}, now = Date.now()) {
  /** @type {Finding[]} */
  const found = [];
  /** @type {Record<string, ReturnType<TagReader>>} */
  const cache = {};
  const tagsOf = (/** @type {string} */ repo) => (cache[repo] ??= readTags(repo));
  const servers = mcpServerDirs(tree);
  /** @param {string} file @param {number} line @param {string} repo @param {string} ref @param {string} [failsFrom] */
  const judge = (file, line, repo, ref, what = repo, failsFrom = undefined) => {
    const { tags, commits } = tagsOf(repo);
    const latest = newest(tags);
    if (!latest) return;
    let at = semver(ref) ? (ref.startsWith("v") ? ref : `v${ref}`) : Object.keys(commits).find((t) => commits[t] === ref && semver(t));
    const server = repo === "site-runtime" && servers.has(posix.dirname(file)) ? (posix.dirname(file) === "." ? "the root" : posix.dirname(file)) : null;
    if (!at) {
      found.push({ check: "pins", file, line, failsFrom, message: `${what} is pinned to ${ref.slice(0, 12)}, which is no release; pin ${latest}` });
    } else if (server && minorsBehind(at, latest) > 1) {
      // S7: every MCP server runs one door, so each stays within a minor of the newest site-runtime, whatever its age.
      found.push({ check: "pins", file, line, failsFrom: MCP_PIN_FAILS_FROM, message: `the MCP server in ${server} runs site-runtime ${at}, more than one minor behind ${latest}: every server keeps the same door (S7); bump it` });
    } else if (compare(at, latest) < 0) {
      const days = FRESH[repo];
      const known = dates[repo];
      const settled = days && known && !(known instanceof Error) ? settledMinor(known, now - days * DAY_MS) : null;
      const [major, minor] = /** @type {number[]} */ (semver(at));
      if (settled && (major < settled[0] || (major === settled[0] && minor < settled[1]))) {
        found.push({ check: "pins", file, line, message: `${what} is at ${at}, behind v${settled.join(".")}, a minor out more than ${days} days; bump to ${latest}` });
      } else {
        found.push({ check: "pins", file, line, warn: true, message: `${what} is at ${at}; the newest release is ${latest}` });
      }
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
  for (const [repo, known] of Object.entries(dates)) {
    if (known instanceof Error) found.push({ check: "pins", warn: true, message: `${repo}'s release dates could not be read (${known.message}), so its ${FRESH[repo]}-day rule was not judged` });
  }
  return found;
}

/** The release an MCP server's site-runtime pin more than one minor behind starts failing (S7); a warning until then. */
const MCP_PIN_FAILS_FROM = "0.21.0";

/** How many minors `at` is behind `latest`; a major behind counts as many. @param {string} at @param {string} latest */
export function minorsBehind(at, latest) {
  const [x, y] = [semver(at), semver(latest)];
  if (!x || !y) return 0;
  return x[0] < y[0] ? Infinity : Math.max(0, y[1] - x[1]);
}

/** A source file that serves MCP through the shared door. */
const MCP_SERVER = /["']@dustinedwards\/site-runtime\/mcp-(?:server|login)["']/;

/** The directories of the package.json files whose code serves MCP: each server file belongs to its nearest manifest. */
export function mcpServerDirs(/** @type {Tree} */ tree) {
  const manifests = tree.files.filter((f) => posix.basename(f) === "package.json" && !NOT_SOURCE.test(f)).map((f) => posix.dirname(f));
  const dirs = new Set();
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file) || !MCP_SERVER.test(tree.read(file))) continue;
    const owner = manifests.filter((d) => d === "." || file.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0];
    if (owner) dirs.add(owner);
  }
  return dirs;
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

/** Code without its comments, blanked rather than removed so line numbers hold. */
function blankComments(/** @type {string} */ text) {
  return text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`])\/\/.*$/gm, (c) => c.replace(/[^\n]/g, " "));
}

/** Whether a name is distinctive enough to flag a local definition of it. */
export function distinctive(/** @type {string} */ name) {
  if (COMMON_COMPOUND.has(name)) return false;
  return DISTINCT_SINGLE.has(name) || (/^[a-z]/.test(name) && /[a-z][A-Z0-9]/.test(name) && name.length >= 6);
}

/**
 * A copy found by name is judged against each package's newest release, so a new shared export would turn every
 * repository with a same-named function red on its next push, before any of them could move. It warns until this release.
 */
const NAMED_COPY_FAILS_FROM = "0.21.0";

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
  const shared = new RegExp(`from\\s+["'](${PACKAGES.map((p) => p.name.replace(/[/.]/g, "\\$&")).join("|")})(/[^"']*)?["']`);
  const define = all.length ? new RegExp(`^[ \\t]*(?:export\\s+)?(?:async\\s+)?(?:function\\*?\\s+|(?:const|let|var)\\s+)(${all.join("|")})\\b\\s*[=(<:]`, "gm") : null;
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
        mine.push({ check: "copies", file, line: lineOf(m.index), failsFrom: guarded?.failsFrom ?? NAMED_COPY_FAILS_FROM, message: `${m[1]} is a local copy of ${catalog[target]} ${target}: import it` });
      }
    }
    // Comments may name what a builder writes; only code counts.
    const code = blankComments(text);
    for (const { find, also, use, say, failsFrom } of FINGERPRINTS) {
      if (self && use.startsWith(`${self} `)) continue;
      const m = find.exec(code);
      if (m && also && !also.test(code)) continue;
      // One finding a line: a named copy already reported there (germomics' one-line hex) says it.
      if (m && !mine.some((f) => f.line === lineOf(m.index))) mine.push({ check: "copies", file, line: lineOf(m.index), failsFrom, message: say ?? `this builds what ${use} builds: use it` });
    }
    if (mine.length && !excused(config, "copies", file)) found.push(...mine);
  }
  if (self !== "site-runtime") {
    for (const file of tree.files.filter((f) => posix.basename(f) === "_headers" && !NOT_SOURCE.test(f))) {
      const text = tree.read(file);
      // A comment line starts with #, so only a header line, indented under its path, matches.
      const m = HEADERS_COPY.find.exec(text);
      if (m && !excused(config, "copies", file)) {
        const line = text.slice(0, m.index).split("\n").length;
        found.push({ check: "copies", file, line, failsFrom: HEADERS_COPY.failsFrom, message: `a security header set written by hand for the static files: ${HEADERS_COPY.use} is the set; generate this block from it, or say why in .shared.json "copies"` });
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
    const manifest = JSON.parse(tree.read(file));
    if (PACKAGES.some((p) => p.name === manifest.name)) continue;
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };
    const asked = new Set(Object.keys(deps).flatMap((d) => peers[d] ?? []));
    for (const dep of Object.keys(deps)) {
      const lib = LIBRARIES.find((l) => l.find.test(dep));
      if (lib && !asked.has(dep) && !excused(config, "libraries", dep)) found.push({ check: "libraries", file, message: `${dep} is ${lib.use}'s job: use it, or say why in .shared.json "libraries"` });
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
    // Comments may name a token; only declarations count.
    const code = blankComments(text);
    for (const m of code.matchAll(/(^|[\s{;"'`])(--[a-z0-9-]+)\s*:(?!:)/g)) {
      const name = m[2];
      if (!tokens.has(name) || !rootRule(code, m.index) || excused(config, "tokens", name)) continue;
      const line = code.slice(0, m.index + m[1].length).split("\n").length;
      found.push({ check: "tokens", file, line, message: `${name} is Capsomer's: set it there (its site layer for this site's own look), or say why in .shared.json "tokens"` });
    }
    // The network's faces come from capsomer/fonts.css, every weight in one file each, so a bold is the same bold on every
    // site (Dustin, 2026-10-28: sites that picked their own weights drew the footer's name differently).
    for (const m of code.matchAll(/@fontsource(?:-variable)?\/(?:schibsted-grotesk|martian-mono)\b|@font-face\s*\{[^}]*font-family:\s*["']?(?:Schibsted Grotesk|Martian Mono)/g)) {
      if (excused(config, "tokens", "fonts")) break;
      const line = code.slice(0, m.index).split("\n").length;
      found.push({ check: "tokens", file, line, message: `the network's faces are Capsomer's: load capsomer/fonts.css instead of your own files, or say why in .shared.json "tokens" "fonts"` });
    }
  }
  return found;
}

/** Which app a file belongs to: the deepest app directory that holds it. @param {[string, string][]} apps */
function ownerOf(apps) {
  return (/** @type {string} */ file) =>
    apps.map(([dir]) => dir).filter((dir) => dir === "." || file === dir || file.startsWith(`${dir}/`)).sort((a, b) => b.length - a.length)[0];
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
  const owner = ownerOf(apps);
  // A library with no kind is judged as the default site; the finding says how to say otherwise.
  const manifest = JSON.parse(tree.read("package.json") || "{}");
  const library = !config.apps && (manifest.exports || manifest.bin) ? ` (package.json has ${manifest.exports ? "exports" : "a bin"}: a library says .shared.json "apps": { ".": "package" })` : "";
  for (const [dir, kind] of apps) {
    const mine = tree.files.filter((f) => owner(f) === dir && !NOT_SOURCE.test(f));
    const text = mine.filter((f) => SOURCE.test(f) || /\.(css|ya?ml)$/.test(f) || posix.basename(f) === "package.json").map(tree.read).join("\n");
    const prefix = dir === "." ? "" : `${dir}:`;
    for (const [feature, { kinds, find, use }] of Object.entries(FEATURES)) {
      if (!kinds.includes(kind) || find.test(text) || excused(config, "waive", `${prefix}${feature}`)) continue;
      found.push({ check: "features", file: dir, message: `${kind} ${dir === "." ? "" : `${dir} `}has no ${feature}: ${use}${library}` });
    }
    // security.txt's Expires is a fixed date, so somebody confirms the address still works before it lapses; this is the
    // reminder, a month ahead.
    for (const f of mine.filter((file) => SOURCE.test(file))) {
      const m = /\bSECURITY_TXT_EXPIRES\s*=\s*["'`]([^"'`]+)["'`]/.exec(tree.read(f));
      if (m && Date.parse(m[1]) - now < 30 * 86_400_000) {
        found.push({ check: "features", file: f, message: `security.txt expires ${m[1]}: confirm its contact still delivers, then move SECURITY_TXT_EXPIRES on (under a year)` });
      }
    }
    if (kind !== "package" && mine.some((f) => /(^|\/)react-router\.config\.[mc]?[jt]s$/.test(f))) {
      const headers = mine.filter((f) => posix.basename(f) === "_headers").map(tree.read).join("\n");
      for (const { dir: hashed, needed } of HASHED_DIRS) {
        if (needed(text) && !cachesHashed(headers, hashed) && !excused(config, "waive", `${prefix}assetCache`)) {
          found.push({ check: "features", file: dir, message: `${dir} serves ${hashed} with the assets layer's revalidate-every-load default: ${hashed} needs ${ASSET_CACHE.use}` });
        }
      }
    }
    const d1 = mine.some((f) => /(^|\/)wrangler[^/]*\.jsonc?(\.example)?$/.test(f) && /"d1_databases"/.test(tree.read(f)));
    if (d1 && kind !== "package" && !BACKUP.find.test(text) && !excused(config, "waive", `${prefix}backup`)) {
      found.push({ check: "features", file: dir, message: `${dir} has a D1 database and no nightly dump: ${BACKUP.use}` });
    }
    // A Carrel site (it calls createSiteApi) tells IndexNow about each publish and schedule through site-api's hook. A
    // createSiteApi without it either tells nobody, or hands its own submitIndexNow to onPageChange (site-api v0.9.0's way).
    const indexnow = FEATURES.indexnow;
    if (indexnow.kinds.includes(kind) && indexnow.find.test(text) && /\bcreateSiteApi\s*\(/.test(text) && !/\bindexNowHook\b|prelum-indexnow/.test(text) && !excused(config, "waive", `${prefix}indexnow`)) {
      const how = /\bonPageChange\s*[:(]/.test(text) ? "with its own onPageChange submission" : "without IndexNow, so a publish from Carrel reaches no search engine";
      found.push({ check: "features", file: dir, message: `${kind} ${dir === "." ? "" : `${dir} `}calls createSiteApi ${how}: hooks: [indexNowHook(...)] from site-api` });
    }
    const all = tree.files.filter((f) => owner(f) === dir && !/(^|\/)(node_modules|dist|build|coverage)\//.test(f));
    for (const [name, { kinds, use, missing }] of Object.entries(ADVISORIES)) {
      if (!kinds.includes(kind)) continue;
      const what = missing({ files: all, text, read: tree.read });
      if (what && !excused(config, "waive", `${prefix}${name}`)) found.push({ check: "features", file: dir, warn: true, message: `${kind} ${dir === "." ? "" : `${dir} `}has ${what}: ${use}` });
    }
  }
  return found;
}

/** A wrangler config: the app it sits in is a Worker. */
const WRANGLER = /(^|\/)wrangler[^/]*\.(jsonc?|toml)(\.example)?$/;

/**
 * The devkit workflows a repository needs, by what it holds: `needed` says why, or null. `runs` names the bin (or, in
 * devkit, the file) a workflow runs, so CI running that itself, directly or through a package script, counts as the call.
 * @typedef {{ workers: string[], servers: string[], script: boolean, private?: boolean, self?: string }} Holds
 * @type {{ name: string, failsFrom?: string, warn?: boolean, runs?: string[], example?: string, needed: (repo: Holds) => string | null }[]}
 */
export const WORKFLOWS = [
  { name: "checks", failsFrom: "0.21.0", needed: () => "every repository" },
  { name: "workflow-audit", failsFrom: "0.21.0", needed: () => "every repository" },
  { name: "dependencies", failsFrom: "0.21.0", needed: () => "every repository" },
  { name: "worker-size", failsFrom: "0.21.0", runs: ["devkit-worker-size"], needed: ({ workers }) => (workers.length ? `a repository with a Worker (${workers.join(", ")})` : null) },
  // Many Workers deploy another way today (Workers Builds, a deploy job of their own), so this one stays a warning.
  { name: "worker-deploy", warn: true, needed: ({ workers }) => (workers.length ? `a repository with a Worker (${workers.join(", ")})` : null) },
  { name: "no-bloat", failsFrom: "0.21.0", runs: ["devkit-no-bloat", "bin/no-bloat.mjs"], needed: ({ script, private: closed }) => (script && !closed ? "a public repository with JavaScript or TypeScript" : null) },
  { name: "conformance", failsFrom: "0.21.0", runs: ["devkit-conformance", "bin/conformance.mjs"], needed: ({ servers }) => (servers.length ? `a repository with an MCP server (${servers.join(", ")})` : null) },
  { name: "scorecard", failsFrom: "0.22.0", needed: ({ private: closed }) => (closed === false ? "a public repository" : null) },
  { name: "bump-consumers", failsFrom: "0.21.0", example: ".github/workflows/bump-consumers.yml (the caller in its header)", needed: ({ self }) => (self ? "a shared package other repositories pin" : null) },
];

/**
 * The devkit workflows the repository's kinds need and no workflow calls. Several apps need the union of their kinds'.
 * @param {Tree} tree @param {Config} config @param {{ self?: string, private?: boolean }} [repo] `private` from the GitHub
 *   event; unknown (a local run), no-bloat is only a warning
 * @returns {Finding[]}
 */
export function checkWorkflows(tree, config, repo = {}) {
  // What the workflows run, without their comments; in devkit, without the reusable workflows it ships for others.
  const text = tree.files
    .filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f))
    .map((f) => tree.read(f).replace(/(^|\s)#.*$/gm, "$1"))
    .filter((t) => repo.self !== "devkit" || !/^\s*workflow_call:/m.test(t))
    .join("\n");
  const called = new Set([...text.matchAll(/DrDustinEdwards\/devkit\/\.github\/workflows\/([\w.-]+?)\.ya?ml@/gi)].map((m) => m[1]));
  // devkit calls its own workflows by path.
  if (repo.self === "devkit") for (const m of text.matchAll(/uses:\s*\.\/\.github\/workflows\/([\w.-]+?)\.ya?ml/g)) called.add(m[1]);
  const scripts = tree.files.filter((f) => posix.basename(f) === "package.json" && !NOT_SOURCE.test(f)).flatMap((f) => Object.entries(JSON.parse(tree.read(f)).scripts ?? {}));
  const invokes = (/** @type {string} */ cmd, /** @type {string} */ name) => new RegExp(`\\b(?:run(?:-script)?|pnpm|yarn|npm)\\s+(?:--?\\S+\\s+)*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:.-])`).test(cmd);
  /** @returns {boolean} */
  const reaches = (/** @type {string} */ cmd, /** @type {string} */ bin, seen = new Set()) =>
    cmd.includes(bin) || scripts.some(([name, body]) => !seen.has(name) && invokes(cmd, name) && reaches(String(body), bin, seen.add(name)));
  const apps = Object.entries(config.apps ?? { ".": "site" });
  const owner = ownerOf(apps);
  const workers = apps
    .filter(([dir, kind]) => ["site", "private", "worker"].includes(kind) && tree.files.some((f) => WRANGLER.test(f) && !NOT_SOURCE.test(f) && owner(f) === dir))
    .map(([dir]) => (dir === "." ? "the root" : dir));
  const script = tree.files.some((f) => SOURCE.test(f) && !NOT_SOURCE.test(f));
  const servers = [...mcpServerDirs(tree)].map((dir) => (dir === "." ? "the root" : dir));
  /** @type {Finding[]} */
  const found = [];
  for (const { name, failsFrom, warn, runs = [], example = `examples/${name}-caller.yml`, needed } of WORKFLOWS) {
    const why = needed({ workers, servers, script, private: repo.private, self: repo.self });
    if (!why || called.has(name) || runs.some((bin) => reaches(text, bin)) || excused(config, "waive", `workflow:${name}`)) continue;
    // Outside Actions the repository's visibility is unknown, so no-bloat can only say what it would need.
    const unsure = name === "no-bloat" && repo.private === undefined;
    found.push({
      check: "workflows",
      file: ".github/workflows",
      warn: warn || unsure || undefined,
      failsFrom,
      message: `${why} calls devkit's ${name}.yml, and no workflow here does: add devkit's ${example}, or say why in .shared.json "waive" "workflow:${name}"${unsure ? " (a warning here: only Actions says whether this repository is public)" : ""}`,
    });
  }
  return found;
}

const TEST = /(^|\/)(test|tests|e2e|__tests__|test-integration)\/|\.(test|spec)\.[mc]?[jt]sx?$/;
const FETCH_SWAP = String.raw`(?:globalThis\.fetch\s*=|stubGlobal\(\s*["'\x60]fetch["'\x60]\s*,|defineProperty\(\s*globalThis\s*,\s*["'\x60]fetch["'\x60]\s*,\s*\{\s*value\s*:|spyOn\(\s*globalThis\s*,\s*["'\x60]fetch["'\x60]\s*\)\s*\.mock\w*\()`;
const DELETE_ALL = String.raw`DELETE FROM\s+["'\x60]?[\w$]+["'\x60]?(?=\s*(?:["'\x60;),]|$))`;

/** Test fakes of a repository's own where devkit has one: every pattern in `find` matches the test file. */
export const FAKES = [
  // GitHub's contents or git data routes answered behind a fetch stub.
  { failsFrom: "0.21.0", find: [/\/repos\/[^\s"'`]*\/(?:git\/(?:refs?|trees|commits|blobs)|contents)\b/, new RegExp(FETCH_SWAP)], use: "devkit ./github stubGitHub", say: "a GitHub API fake of its own" },
  // An RSA key pair made here and a key set served from it: an Access issuer of its own.
  { failsFrom: "0.21.0", find: [/generateKey\(\s*\{\s*name\s*:\s*["'`]RSASSA-PKCS1-v1_5|generateKeyPair(?:Sync)?\(\s*["'`](?:RS256|rsa)["'`]/, /cdn-cgi\/access\/certs|\bjwks\b|["']?keys["']?\s*:\s*\[\s*(?:\{\s*\.\.\.)?\s*\w*[jJ]wk\b/], use: "devkit ./access stubAccess", say: "an Access fake of its own (a key pair it signs with and the key set it serves)" },
  // A fetch whose whole body throws an error naming the URL.
  { failsFrom: "0.21.0", find: [new RegExp(`${FETCH_SWAP}\\s*(?:vi\\.fn\\(\\s*)?(?:async\\s*)?(?:function\\s*)?\\(?[^)]*\\)?\\s*(?::\\s*[\\w<>]+\\s*)?(?:=>)?\\s*\\{?\\s*(?:throw\\s+new\\s+\\w*Error\\(\\s*|(?:return\\s+)?Promise\\.reject\\(\\s*(?:new\\s+\\w*Error\\(\\s*)?)\\x60[^\\x60]*\\$\\{`)], use: "devkit ./network refuseNetwork", say: "a fetch that refuses the network, written here" },
  // Tables cleared by hand: three DELETE FROMs with no WHERE close together, or one in a loop.
  { failsFrom: "0.21.0", find: [new RegExp(`${DELETE_ALL}[^]{0,400}?${DELETE_ALL}[^]{0,400}?${DELETE_ALL}|\\bfor\\s*\\(\\s*(?:const|let)\\s+\\w+\\s+of\\s+[^)]+\\)[^]{0,160}?DELETE FROM\\s+["'\\x60]?\\$\\{|\\]\\s*\\.(?:map|forEach)\\([^]{0,160}?DELETE FROM\\s+["'\\x60]?\\$\\{`, "im")], use: "devkit ./d1 resetDb", say: "a hand list of tables to clear, which drifts the day a migration adds one" },
];

/**
 * Test files holding a fake devkit already ships. Only this check reads tests.
 * @param {Tree} tree @param {Config} config @param {string} [self]
 * @returns {Finding[]}
 */
export function checkFakes(tree, config, self) {
  /** @type {Finding[]} */
  const found = [];
  if (self === "devkit") return found;
  for (const file of tree.files.filter((f) => SOURCE.test(f) && TEST.test(f) && !/(^|\/)(node_modules|dist|build|coverage|fixtures)\//.test(f))) {
    const code = blankComments(tree.read(file));
    for (const { find, use, say, failsFrom } of FAKES) {
      const m = find[0].exec(code);
      if (!m || !find.every((f) => f.test(code)) || excused(config, "copies", file)) continue;
      found.push({ check: "fakes", file, line: code.slice(0, m.index).split("\n").length, failsFrom, message: `${say}: use ${use}, or say why in .shared.json "copies"` });
    }
  }
  return found;
}

/** The release the AI rules start failing; until then each is a warning, so the sites can move first. */
const AI_FAILS_FROM = "0.21.0";

/** A model call in a file: the markers C6 needs before it reads a regex as cutting JSON out of a model's answer. */
const MODEL_CALL = /\bAI\s*\.\s*run\s*\(|\.(?:chatCompletions|aiSearch)\s*\(|["'`]@dustinedwards\/site-runtime\/anthropic["'`]|["'`]@anthropic-ai\/sdk["'`]/;

/** A timeout within reach of a call that cannot take one through the shared caller. */
const TIMEOUT = /AbortSignal\.timeout\(|\bsignal\s*:|\bsetTimeout\(|Promise\.race\(/;

/**
 * The AI rules: each a pattern over a source file's code (comments blanked), what it means, and the checklist item it
 * proves. `test`, when given, judges the match (the call's arguments, the code around it) and returns what is missing, or
 * null when the call is fine. Every rule was run against the network's repositories before it was added; none flags code
 * that already does it the shared way.
 * @type {{ id: string, find: RegExp, self?: string, test?: (code: string, m: RegExpExecArray) => string | null, say: (missing: string) => string }[]}
 */
export const AI_RULES = [
  // Anthropic's Messages API called by hand or through the SDK, not through the shared caller (which adds the gateway,
  // the timeout, the one retry layer and the stop-reason check). The routines URL is the R2 rule's, not this one's.
  {
    id: "C1",
    self: "site-runtime",
    find: /["'`]@anthropic-ai\/sdk["'`]|\bnew\s+Anthropic\s*\(|api\.anthropic\.com\/v1\/messages|["'`]\/v1\/messages["'`]/,
    say: () => "calls Anthropic's Messages API outside site-runtime ./anthropic (C1, G1): use messages, structured or stream, which add the gateway, the timeout and the one retry layer",
  },
  // A Workers AI run: it needs a deadline (`signal`), the site's gateway and a cap on the answer.
  {
    id: "C2",
    find: /\bAI\s*\.\s*run\s*\(/g,
    test: (code, m) => {
      const args = callArguments(code, m.index + m[0].length - 1);
      const missing = [["signal", "a timeout (signal: AbortSignal.timeout(ms), C2)"], ["gateway", "the gateway (gateway: { id, metadata }, G1)"], ["max_tokens", "max_tokens (C5)"]].filter(([key]) => !new RegExp(`\\b${key}\\b`).test(args)).map(([, what]) => what);
      return missing.length ? missing.join(", ") : null;
    },
    say: (missing) => `runs Workers AI without ${missing}: a person waits on it and the gateway is where its cost shows (C13)`,
  },
  // AI Search's model calls, the answer and the reranker: the binding takes no signal, so the deadline is the caller's.
  {
    id: "C13",
    find: /\.(?:chatCompletions|aiSearch)\s*\(|\breranking\s*:\s*\{\s*enabled\s*:\s*true/g,
    test: (code, m) => (TIMEOUT.test(code.slice(Math.max(0, m.index - 1500), m.index + 800)) ? null : "a timeout"),
    say: () => "calls an AI Search model (an answer or the reranker) with no timeout near it (C2, C13): race it against a deadline, as dustinedwards.info's askStream does",
  },
  // JSON cut out of free text with a greedy regex, in a file that calls a model: ask for structured output instead.
  {
    id: "C6",
    find: /\/\\[{[]\[\\s\\S\]\*\??\\[}\]]\//,
    test: (code) => (MODEL_CALL.test(code) ? "" : null),
    say: () => "cuts JSON out of a model's free text with a regex (C6): ask for structured output (site-runtime ./anthropic structured, or Workers AI's response_format) and parse the answer whole",
  },
  // A prompt's own rule about dashes: WRITING_RULES already says it, so a second copy drifts from it.
  {
    id: "W5",
    self: "site-runtime",
    find: /["'`][^"'`\n]*?\b(?:do not use|don['’]t use|never use|avoid|no)\s+(?:any\s+)?(?:em|en|long)(?:\s+or\s+en)?[ -]?dash/i,
    say: () => "writes its own dash rule into a prompt (W5): site-runtime ./prose WRITING_RULES says it; put WRITING_RULES in the prompt instead of local style text",
  },
  // fireRoutine on its own: a retry after an unanswered fire starts a second session.
  {
    id: "R2",
    self: "site-runtime",
    find: /(?:import|export)\s*(?:type\s*)?\{[^}]*\bfireRoutine\b[^}]*\}\s*from\s*["'`]@dustinedwards\/site-runtime\/routine["'`]/,
    say: () => "fires a routine with fireRoutine, outside the duplicate guard (R2): use fireOnce from site-runtime ./routine with an atomic store (D1 or a Durable Object), so a retry never starts a second session",
  },
];

/** The text between a call's parentheses, from the index of its "(" (at most 4,000 characters). */
export function callArguments(/** @type {string} */ code, /** @type {number} */ open) {
  let depth = 0;
  for (let i = open; i < Math.min(code.length, open + 4000); i++) {
    if ("([{".includes(code[i])) depth++;
    else if (")]}".includes(code[i]) && --depth === 0) return code.slice(open + 1, i);
  }
  return code.slice(open + 1, open + 4000);
}

/**
 * Model calls and prompts that skip the shared pieces (AI_RULES), in source outside tests. A file the repository keeps
 * on purpose is excused in .shared.json "copies", with the reason.
 * @param {Tree} tree @param {Config} config @param {string} [self]
 * @returns {Finding[]}
 */
export function checkAi(tree, config, self) {
  /** @type {Finding[]} */
  const found = [];
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file)) continue;
    const text = tree.read(file);
    if (!/\bAI\b|anthropic|chatCompletions|aiSearch|reranking|dash|fireRoutine|\{\[\\s\\S\]|\[\[\\s\\S\]/i.test(text)) continue;
    const code = blankComments(text);
    /** @type {Finding[]} */
    const mine = [];
    for (const rule of AI_RULES) {
      if (rule.self && rule.self === self) continue;
      const find = rule.find.global ? rule.find : new RegExp(rule.find.source, `${rule.find.flags}g`);
      for (const m of code.matchAll(find)) {
        const missing = rule.test ? rule.test(code, m) : "";
        if (missing === null) continue;
        mine.push({ check: "ai", file, line: code.slice(0, m.index).split("\n").length, failsFrom: AI_FAILS_FROM, message: `[${rule.id}] this ${rule.say(missing)}` });
        if (!rule.find.global) break;
      }
    }
    if (mine.length && !excused(config, "copies", file)) found.push(...mine);
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
  const skip = [...(config.spelling?.skip ?? []), "**/*.lock", "**/package-lock.json", "**/pnpm-lock.yaml", ".shared.json"];
  const targets = files.filter((f) => !skip.some((s) => posix.matchesGlob?.(f, s) ?? f === s) && !/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|gz|wasm)$/i.test(f));
  // Names other tools own: GitHub Actions' cancelled(), Renovate's minimumReleaseAgeBehaviour, and ARIA's labelledby as a // codespell:ignore
  // camelCase name (labelledBy, ariaLabelledByElements). codespell:ignore
  const builtIn = String.raw`\bcancelled\\?\(|\bminimumReleaseAgeBehaviour\b|[lL]abelledBy`; // codespell:ignore
  const { ignore = [], contracts = [] } = config.spelling ?? {};
  const ignoreRegex = [builtIn, ...contracts].join("|");
  /** @returns {{ file: string, line: number, from: string, to: string }[]} */
  const read = (/** @type {string} */ regex, /** @type {string[]} */ words) => {
    const args = ["--builtin", "en-GB_to_en-US", "--quiet-level", "3", "--check-filenames", "--ignore-regex", regex];
    if (words.length) args.push("--ignore-words-list", words.join(","));
    // Each part of a camelCase or CONSTANT_CASE name is read as a word, since a British name is spelling too.
    args.push("--regex", "[A-Z]?[a-z]+|[A-Z]+(?![a-z])");
    const out = [];
    for (let i = 0; i < targets.length; i += 400) {
      for (const line of codespell([...args, "--", ...targets.slice(i, i + 400)], root).split("\n")) {
        const m = /^(.+?):(\d+): (\S+) ==> (\S+)/.exec(line);
        if (m) out.push({ file: m[1], line: Number(m[2]), from: m[3], to: m[4] });
      }
    }
    return out;
  };
  const hits = read(ignoreRegex, ignore);
  const found = hits.map(({ file, line, from, to }) => ({ check: "spelling", file, line, message: `${from} is British; write ${to} (or end the line with a codespell:ignore comment if it is a data contract)` }));
  // An ignore or contract is used when a run without the repository's own finds more, in its word or on a line it matches.
  if (!fix && (ignore.length || contracts.length)) {
    const seen = new Set(hits.map((h) => `${h.file}:${h.line}:${h.from}`));
    const more = read(builtIn, []).filter((h) => !seen.has(`${h.file}:${h.line}:${h.from}`));
    for (const word of ignore) if (more.some((h) => h.from.toLowerCase() === word.toLowerCase())) used(config, "spelling.ignore", word);
    for (const contract of contracts) {
      /** @type {RegExp | null} */
      let re = null;
      try {
        re = new RegExp(contract);
      } catch {}
      if (!re || more.some((h) => re.test(readFileSync(join(root, h.file), "utf8").split("\n")[h.line - 1] ?? ""))) used(config, "spelling.contracts", contract);
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
        // Capsomer's behaviors are listed by what each exports (behavior/time's relative, day...), so a site writing its
        // own finds them; the British spelling of the same subpath and the React components stay a list of components.
        if (sub === "./behavior/*") {
          for (const c of comps) {
            const file = moduleFile(dir, JSON.parse(JSON.stringify(target).replaceAll("*", c)));
            if (file) entries.push([`./${base}/${c}`, exportNames(readFileSync(file, "utf8"))]);
          }
          continue;
        }
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
  const candidates = [f, f.replace(/\.m?js$/, ".d.mts"), f.replace(/\.js$/, ".d.ts"), f.replace(/^(.*)\/dist\/(.*)\.d\.ts$/, "$1/src/$2.ts"), f.replace(/^(.*)\/dist\/(.*)\.js$/, "$1/src/$2.ts"), f.replace(/^(.*)\/dist\/(.*)\.d\.ts$/, "$1/$2.ts")];
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
    "Generated by `devkit-shared list`; do not edit by hand. Before writing anything a site might share, look here: if a package exports it, import it. `npx devkit-shared` fails a repository that copies one of these, misses a shared feature, or pins an old release.",
    "",
    "## Family features",
    "",
    "| Feature | Needed by | Provided by |",
    "| --- | --- | --- |",
    ...Object.entries(FEATURES).map(([f, { kinds, use }]) => `| ${f} | ${kinds.join(", ")} | ${use} |`),
    ...Object.entries(ADVISORIES).map(([f, { kinds, use }]) => `| ${f} (a warning) | ${kinds.join(", ")} | ${use} |`),
    `| backup | any app with a D1 database | ${BACKUP.use} |`,
    `| assetCache | any React Router app (/assets/*, and /islands/* with devkit ./islands) | ${ASSET_CACHE.use} |`,
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

async function main(/** @type {string[]} */ argv) {
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
  const configFile = existsSync(join(root, ".shared.json")) ? ".shared.json" : null;
  const config = configFile ? JSON.parse(readFileSync(join(root, configFile), "utf8")) : {};
  validateConfig(config);
  const tree = gitTree(root);
  // A shared package defines its own exports; it is checked against the others, as a package, not a site.
  const name = existsSync(join(root, "package.json")) ? JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name : undefined;
  const self = PACKAGES.find((p) => p.name === name);
  if (self) config.apps ??= { ".": "package" };
  // A package the check cannot read is a check that did not run: in CI (--from) that stops it, locally it is said.
  const missing = PACKAGES.filter((p) => p.repo !== self?.repo && !locate(p.name, p.repo)).map((p) => p.repo);
  if (from && missing.length) throw new Error(`--from ${from} has no checkout of ${missing.join(", ")}`);
  const { catalog } = readCatalog((name, repo) => (repo === self?.repo ? null : locate(name, repo)));
  // A name the package exports itself is its own API, even when another package exports a different thing by that name.
  if (self) for (const name of Object.keys(readCatalog((_, repo) => (repo === self.repo ? root : null)).catalog)) delete catalog[name];
  // Whether the repository is private, from the event Actions hands every run; unknown locally.
  const event = process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  /** @type {Record<string, Record<string, string> | Error>} */
  const dates = {};
  for (const [repo, days] of Object.entries(FRESH)) {
    if (repo === self?.repo || !tree.files.some((f) => posix.basename(f) === "package.json" && tree.read(f).includes(`DrDustinEdwards/${repo}#`))) continue;
    dates[repo] = await releaseDates(repo, Date.now() - days * DAY_MS).catch((error) => (error instanceof Error ? error : new Error(String(error))));
  }
  const findings = [
    ...checkPins(tree, lsRemoteTags, dates),
    ...checkCopies(tree, catalog, config, self?.label),
    ...checkLibraries(tree, config, peersOf(locate)),
    ...checkFeatures(tree, config),
    ...(self?.repo === "capsomer" ? [] : checkTokens(tree, capsomerTokens(locate("capsomer", "capsomer")), config)),
    ...checkSpelling(root, config, argv.includes("--fix-spelling"), !self),
    ...checkWorkflows(tree, config, { self: self?.repo, private: event.repository?.private }),
    ...checkFakes(tree, config, self?.label),
    ...checkAi(tree, config, self?.label),
  ];
  if (missing.length) {
    const tokens = missing.includes("capsomer") && self?.repo !== "capsomer" ? " and Capsomer's tokens" : "";
    findings.push({ check: "config", warn: true, message: `not installed here: ${missing.join(", ")}, so copies of their exports${tokens} were not checked and no exception was judged stale; npm install, or --from <dir> of checkouts (CI reads them all)` });
  } else {
    findings.push(...staleExceptions(config));
  }
  const errors = findings.filter((f) => !isWarning(f));
  for (const f of findings) {
    const where = f.file ? ` file=${f.file}${f.line ? `,line=${f.line}` : ""}` : "";
    console.log(`::${isWarning(f) ? "warning" : "error"}${where}::[${f.check}] ${f.message}`);
  }
  const counts = ["pins", "copies", "libraries", "features", "tokens", "spelling", "workflows", "fakes", "ai", "config"].map((c) => `${c} ${findings.filter((f) => f.check === c).length}`).join(", ");
  console.log(errors.length ? `devkit-shared: ${errors.length} to fix (${counts}). What the packages export: npx devkit-shared list` : `devkit-shared: uses the shared code (${counts}).`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Shared-code check\n\n${counts}\n`);
  return errors.length ? 1 : 0;
}

/** The command line: main's exit code, or 2 when the check could not run. */
export async function cli(/** @type {string[]} */ argv) {
  try {
    return await main(argv);
  } catch (error) {
    console.log(`::error::devkit-shared could not run: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await cli(process.argv.slice(2));
