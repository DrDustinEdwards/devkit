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

/**
 * Whether `text` calls `fn({ ... })` with `key` among the object's own keys. The object is read character by character
 * to its closing brace, past strings, comments and nested brackets, so a key in a nested object or in code after the call
 * is not the call's, and the read is linear whatever the text.
 */
function callWithKey(
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

/** Every shared feature: which kinds of app need it, how its use is found, and what provides it. */
export const FEATURES = {
  robots: {
    kinds: SITE,
    find: /site-helpers\/robots["']/,
    use: "Prelum ./robots robotsDocument (/robots.txt)",
  },
  aiTxt: {
    kinds: SITE,
    // standardFiles serves ai.txt when it is given `ai`.
    find: {
      test: (/** @type {string} */ text) =>
        /\baiTxt(Response)?\b/.test(text) || callWithKey(text, "standardFiles", "ai"),
    },
    use: "Prelum ./robots aiTxt or aiTxtResponse (/ai.txt), or ./files standardFiles with `ai`",
  },
  tdm: {
    kinds: SITE,
    find: /\bTDM_RESERVATION_HEADERS\b/,
    use: "Prelum ./robots TDM_RESERVATION_HEADERS",
  },
  sitemap: {
    kinds: SITE,
    find: /site-helpers\/sitemap["']/,
    use: "Prelum ./sitemap sitemapDocument (/sitemap.xml)",
  },
  llms: {
    kinds: SITE,
    find: /site-helpers\/llms["']/,
    use: "Prelum ./llms llmsDocument (/llms.txt)",
  },
  head: {
    kinds: SITE,
    find: /site-helpers\/head["']/,
    use: "Prelum ./head headTags (canonical, Open Graph, Twitter)",
  },
  schema: { kinds: SITE, find: /site-helpers\/schema["']/, use: "Prelum ./schema (JSON-LD)" },
  indexnow: {
    kinds: SITE,
    // site-api's standardSiteApi sends IndexNow when it is given `indexNow`.
    find: {
      test: (/** @type {string} */ text) =>
        /site-helpers\/indexnow["']|prelum-indexnow/.test(text) ||
        callWithKey(text, "standardSiteApi", "indexNow"),
    },
    use: "Prelum ./indexnow submitIndexNow (site-api indexNowHook on a Carrel site; prelum-indexnow after a static deploy)",
  },
  securityTxt: {
    kinds: SITE,
    // site-runtime ./worker's gateway answers /.well-known/security.txt on every site.
    find: /site-runtime\/(security-txt|worker)["']/,
    use: "site-runtime ./security-txt (/.well-known/security.txt), or ./worker's gateway",
  },
  // A registry entry (./sites) counts for both: staticSite({ site }) and site-runtime-headers build a static site's set
  // and page policy from it with buildSecurityHeaders and buildContentSecurityPolicy.
  headers: {
    kinds: [...PUBLIC_OR_PRIVATE, "worker"],
    find: /site-runtime\/(headers|sites)["']|\bwithMcpHeaders\b/,
    use: "site-runtime ./headers buildSecurityHeaders (or a ./sites entry given to ./static-site staticSite)",
  },
  csp: {
    kinds: PUBLIC_OR_PRIVATE,
    find: /site-runtime\/(csp|sites)["']/,
    use: "site-runtime ./csp buildContentSecurityPolicy (or a ./sites entry given to ./static-site staticSite)",
  },
  cspReport: {
    kinds: PUBLIC_OR_PRIVATE,
    find: /site-runtime\/(csp-report|static-site|worker)["']/,
    use: "site-runtime ./csp-report receiveCspReport (./worker's gateway and ./static-site staticSite receive them)",
  },
  health: {
    kinds: ["site", "private"],
    find: /site-runtime\/health["']/,
    use: "site-runtime ./health healthResponse (/health)",
  },
  // base.css, not just a token file: the element styles every page in the network shares. A build that copies it out of the
  // package (require.resolve("capsomer/package.json"), then "css/base.css") counts, and so does Capsomer's own build
  // helper, whose capsomerStylesheet always writes base.css (Carrel's www, Prelum's specimen, Capsid's explorer).
  capsomer: {
    kinds: PUBLIC_OR_PRIVATE,
    find: /["']capsomer\/base\.css["']|["']capsomer\/package\.json["'][^]{0,400}?["']css\/base\.css["']|\bimport\s*\{[^{}]*\bcapsomerStylesheet\b[^{}]*\}\s*from\s*["']capsomer\/build["']/,
    use: "Capsomer's capsomer/base.css (tokens, element styles, the site layer), then its components",
  },
};
/**
 * A React Router app on Workers Assets serves its built files from the assets layer, which sends them with
 * `max-age=0, must-revalidate` unless the app's `_headers` says otherwise, so every page load revalidates every file.
 * Vite and siteScript name each one by its content, so a year, immutable, is safe for the hashed directories.
 */
export const HASHED_DIRS = [
  { dir: "/assets/*", needed: () => true },
  { dir: "/islands/*", needed: (/** @type {string} */ text) => /devkit\/islands["']/.test(text) },
];
export const ASSET_CACHE = {
  use: "public/_headers: Cache-Control: public, max-age=31536000, immutable",
};

/** Whether a `_headers` text gives `dir` a Cache-Control with immutable. */
export function cachesHashed(/** @type {string} */ headers, /** @type {string} */ dir) {
  const blocks = headers.split(/\r?\n(?=\S)/);
  return blocks.some(
    (b) => b.split(/\r?\n/)[0].trim() === dir && /^\s+Cache-Control:[^\n]*\bimmutable\b/im.test(b),
  );
}

/** A D1 database needs the nightly dump, whatever the kind. */
export const BACKUP = {
  find: /@dustinedwards\/d1-dump["']/,
  use: "d1-dump runCheckedBackup and backupHealth",
};
export const EMAIL = {
  find: /@dustinedwards\/site-runtime\/email["']/,
  use: "site-runtime ./email sendEmail",
};

/** Text only a shared builder should write. */
export const FINGERPRINTS = [
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
export const HEADERS_COPY = {
  find: /^[ \t]+(?:Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options|Cross-Origin-Opener-Policy)\s*:/m,
  use: "site-runtime ./headers buildSecurityHeaders",
};

/** The Claude Code hooks in devkit's claude/hooks, one copy for every repository. */
export const CLAUDE_HOOKS = ["no-em-dash.sh", "scoped-git-add.sh"];

/** Libraries a shared package wraps, so a site that lists one is doing that package's job. */
export const LIBRARIES = [
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
 * @type {Record<string, { target: string, body: RegExp }>}
 */
export const BODY_ALIASES = {
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
export function definitionBody(/** @type {string} */ text, /** @type {number} */ start) {
  const lines = text.slice(start, start + 2000).split("\n");
  const indent = /^[ \t]*/.exec(lines[0])?.[0].length ?? 0;
  const end = lines.findIndex(
    (l, i) => i > 0 && l.trim() !== "" && (/^[ \t]*/.exec(l)?.[0].length ?? 0) <= indent,
  );
  return lines.slice(0, end < 0 ? undefined : end).join("\n");
}
