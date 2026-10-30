import assert from "node:assert/strict";
import test from "node:test";

import { checkCopies, checkFeatures, checkLibraries, checkPins, checkTokens, newest, respell } from "../bin/family.mjs";

const SHA_V2 = "2".repeat(40);
const SHA_RAW = "9".repeat(40);
const tags = () => ({ tags: ["v0.9.0", "v0.10.0", "v0.2.0"], commits: { "v0.9.0": "1".repeat(40), "v0.10.0": SHA_V2, "v0.2.0": "3".repeat(40) } });
/** @param {Record<string, string>} files */
const tree = (files) => ({ files: Object.keys(files), read: (/** @type {string} */ f) => files[f] ?? "" });

test("the newest tag is compared as a version, not as text", () => {
  assert.equal(newest(["v0.9.0", "v0.10.0", "v0.2.0", "latest"]), "v0.10.0");
});

test("a pin behind the newest tag, and a raw commit, are both refused; the newest tag and its commit pass", () => {
  const found = checkPins(
    tree({
      "package.json": JSON.stringify({ dependencies: { a: "github:DrDustinEdwards/prelum#v0.9.0", b: `github:DrDustinEdwards/site-runtime#${SHA_RAW}`, c: "github:DrDustinEdwards/d1-dump#v0.10.0" } }, null, 1),
      ".github/workflows/ci.yml": `uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${SHA_V2} # v0.10.0`,
    }),
    tags,
  );
  assert.deepEqual(
    found.map((f) => f.message),
    ["prelum is at v0.9.0; the newest release is v0.10.0", `site-runtime is pinned to ${SHA_RAW.slice(0, 12)}, which is no release; pin v0.10.0`],
  );
});

test("on a Renovate branch a stale pin is a warning, so one bump never waits on another", () => {
  const found = checkPins(tree({ "package.json": '{"dependencies":{"a":"github:DrDustinEdwards/prelum#v0.9.0"}}' }), tags, true);
  assert.equal(found[0].warn, true);
});

const catalog = { escapeHtml: "site-runtime ./html", slugify: "Prelum ./slug", render: "Prelum ./render", readThemeCookie: "Capsomer ./theme" };

test("a local definition of a shared export, or of a known alias, is a copy; a wrapper that imports it is not", () => {
  const found = checkCopies(
    tree({
      "app/a.ts": "export function escapeHtml(s) {}\nconst slugify = (s) => s;\nfunction render() {}\n",
      "app/b.ts": "export const themeFromRequest = (r) => null;\n",
      "app/c.ts": 'import { escapeHtml as esc } from "@dustinedwards/site-runtime/html";\nexport function escapeHtml(s) { return esc(s); }\n',
      "app/a.test.ts": "function escapeHtml() {}\n",
    }),
    catalog,
    {},
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line}`),
    ["app/a.ts:1", "app/a.ts:2", "app/b.ts:1"],
  );
  assert.match(found[2].message, /themeFromRequest is a local copy of Capsomer \.\/theme readThemeCookie/);
});

test("builder text counts in code, not in a comment, and a waived file is skipped", () => {
  const found = checkCopies(
    tree({
      "app/robots.ts": '// writes "User-agent:" lines like Prelum\nexport const body = `User-agent: *`;\n',
      "app/sitemap.ts": "/* one <urlset> */\nexport {};\n",
      "app/og.ts": 'const t = "<urlset>";\n',
      "app/head.tsx": '<script type="speculationrules">{rules}</script>\n',
      "app/img.ts": "const out = await images\n  .input(object.body)\n  .transform({ width: 400 });\n",
      "app/loader.ts": "const els = document.querySelectorAll('[data-island]');\nimport(/* @vite-ignore */ `/islands/${n}.js`);\n",
      "app/root.tsx": 'export const links = () => [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter" }];\n',
      // Using the shared ones, and a stream's own .transform, are not copies.
      "app/uses.ts": 'import { speculationRules } from "@dustinedwards/site-runtime/prefetch";\nconst r = speculationRules();\nstream.input.transform(r);\n',
      "app/card.ts": "const css = await fetch(`https://fonts.googleapis.com/css2?family=${name}`);\n",
    }),
    {},
    { copies: { "app/og.ts": "satori shows entities literally" } },
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line} ${f.message.split(" ")[3]}`),
    ["app/robots.ts:2 Prelum", "app/head.tsx:1 site-runtime", "app/img.ts:2 site-runtime", "app/loader.ts:1 devkit", "app/root.tsx:1 self-hosted"],
  );
});

test("a wrapped library in a site's manifest is refused unless waived with a reason", () => {
  const files = { "package.json": '{"dependencies":{"marked":"1","katex":"1","zod":"1"}}' };
  assert.deepEqual(checkLibraries(tree(files), { libraries: { katex: "the generated stylesheet" } }).map((f) => f.message.split(" ")[0]), ["marked"]);
  // A peer the site's shared package asks it to install is that package's job being done, not duplicated.
  const prelum = { "package.json": '{"dependencies":{"@drdustinedwards/site-helpers":"x","remark-gfm":"1","marked":"1"}}' };
  assert.deepEqual(checkLibraries(tree(prelum), {}, { "@drdustinedwards/site-helpers": ["remark-gfm"] }).map((f) => f.message.split(" ")[0]), ["marked"]);
});

test("each app is checked for its kind's features, files belong to the deepest app, and a D1 database needs the dump", () => {
  const found = checkFeatures(
    tree({
      "app/robots.ts": 'import { robotsDocument } from "@drdustinedwards/site-helpers/robots";',
      "wrangler.jsonc.example": '{ "d1_databases": [] }',
      "mcp/src/index.ts": 'import { buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";',
    }),
    { apps: { ".": "site", mcp: "worker" }, waive: { aiTxt: "x", tdm: "x", sitemap: "x", llms: "x", head: "x", schema: "x", indexnow: "x", securityTxt: "x", csp: "x", cspReport: "x", health: "x", capsomer: "x", a11y: "x" } },
  );
  assert.deepEqual(found.map((f) => f.message), ["site has no headers: site-runtime ./headers buildSecurityHeaders", ". has a D1 database and no nightly dump: d1-dump runCheckedBackup and backupHealth"]);
});

test("PLANT: a React Router app without a year on its hashed files fails, and passes once _headers gives them one", () => {
  const app = { "react-router.config.ts": "export default {};", "app/site.ts": 'import { startIslands } from "@dustinedwards/devkit/islands";' };
  const cache = (/** @type {Record<string, string>} */ files) =>
    checkFeatures(tree({ ...app, ...files }), { apps: { ".": "worker" } }).filter((f) => /assets layer/.test(f.message)).map((f) => f.message.split(" ")[2]);
  assert.deepEqual(cache({}), ["/assets/*", "/islands/*"]);
  assert.deepEqual(cache({ "public/_headers": "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/islands/*\n  X-Robots-Tag: noindex\n" }), ["/islands/*"]);
  assert.deepEqual(cache({ "public/_headers": "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/islands/*\n  Cache-Control: public, max-age=31536000, immutable\n" }), []);
});

test("PLANT: security.txt's fixed Expires fails the check a month before it lapses", () => {
  const files = { "app/security-txt.ts": 'export const SECURITY_TXT_EXPIRES = "2027-09-28T00:00:00Z";' };
  const expiry = (/** @type {number} */ now) => checkFeatures(tree(files), { apps: { ".": "worker" } }, now).filter((f) => /security\.txt/.test(f.message));
  assert.equal(expiry(Date.parse("2027-08-01")).length, 0);
  assert.equal(expiry(Date.parse("2027-09-01")).length, 1);
});

test("the spelling fix rewrites a word inside a name and keeps its case, but never a contract", () => {
  const none = /$^/g;
  assert.equal(respell("math.katexColour === colour", "colour", "color", none, true), "math.katexColor === color"); // codespell:ignore
  assert.equal(respell("HOSTED_WITHOUT_LICENCE", "licence", "license", none, true), "HOSTED_WITHOUT_LICENSE"); // codespell:ignore
  assert.equal(respell("normaliseTags(x)", "normalise", "normalize", none, true), "normalizeTags(x)"); // codespell:ignore
  // A shared package's export keeps its name; the prose beside it is fixed.
  assert.equal(respell("normaliseTags normalise", "normalise", "normalize", none, false), "normaliseTags normalize"); // codespell:ignore
  // PLANT: the stored value stays, the word in the sentence does not.
  assert.equal(respell('status === "cancelled" was cancelled', "cancelled", "canceled", /"cancelled"/g, true), 'status === "cancelled" was canceled'); // codespell:ignore
});

test("a site's own value for a Capsomer token, or its own files for the family's faces, fails; using them, setting one for one part of the page, or a waiver passes", () => {
  const tokens = new Set(["--page-max", "--radius-m", "--text"]);
  const found = checkTokens(
    tree({
      "app/app.css": ":root {\n  --page-max: 1180px;\n  --mine: 1px;\n}\n.panel { --text: white; max-width: var(--page-max); }\n/* --radius-m: 0 */\n",
      "app/site.ts": "const CSS = `:root { --radius-m: 0; }`;\n",
      "app/theme.css": "@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n    --text: #fff;\n  }\n}\n",
      "app/a.test.ts": "const t = `:root { --text: red }`;\n",
      "app/build.mjs": 'const FONTS = [\n  "@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-600-normal.woff2",\n];\n',
      "app/fonts.css": '@font-face {\n  font-family: "Martian Mono";\n  src: url(m.woff2);\n}\n.code { font-family: "Martian Mono", monospace; }\n',
    }),
    tokens,
    { tokens: { "--text": "dark text until the colors move" } },
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line}`),
    ["app/app.css:2", "app/site.ts:1", "app/build.mjs:2", "app/fonts.css:1"],
  );
  assert.match(found[0].message, /--page-max is Capsomer's/);
  assert.match(found[2].message, /capsomer\/fonts\.css/);
});

test("PLANT: the fingerprints new in 0.18.0 warn on a copy, and their look-alikes pass", () => {
  const found = checkCopies(
    tree({
      "app/ld.tsx": '<script\n  type="application/ld+json"\n  dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}\n/>\n',
      "app/meta.ts": 'export const meta = () => [{ tagName: "link", rel: "canonical", href }];\n',
      "app/token.ts": "const b = crypto.getRandomValues(new Uint8Array(8));\nexport const t = Array.from(b, (x) => x.toString(16).padStart(2, \"0\")).join(\"\");\n",
      "app/cmp.ts": "for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);\n",
      // A Link header's canonical, a color's three channels and a string hash are not copies.
      "app/twin.ts": "export const link = `<${origin}${path}>; rel=\"canonical\"`;\n",
      "app/color.mjs": 'export const css = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;\n',
      "app/hash.ts": "for (let i = 0; i < s.length; i++) h ^= s.charCodeAt(i);\n",
      "public/_headers": "# Strict-Transport-Security: is set by the Worker\n/*\n  Strict-Transport-Security: max-age=63072000\n",
    }),
    {},
    {},
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line} ${f.warn}`),
    ["app/ld.tsx:2 true", "app/meta.ts:1 true", "app/token.ts:2 true", "app/cmp.ts:1 true", "public/_headers:3 true"],
  );
});

test("an alias that is also an ordinary name counts only when its body does the shared export's job", () => {
  const found = checkCopies(
    tree({
      "app/md.mjs": 'function esc(text) {\n  return text.replace(/([*_])/g, "\\\\$1");\n}\nfunction other() {\n  return "&amp;";\n}\n',
      "app/html.ts": 'export function render() {\n  const esc = (s) => s.replace(/&/g, "&amp;");\n  return esc(x);\n}\n',
      "app/kb.ts": "const slugOf = (t) => `${t.kind}/${t.id}`;\n",
      "app/key.ts": "function slugOf(name) {\n  return name\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, \"-\");\n}\n",
      "app/x.ts": "export function f(trimmed) {\n  const hex = trimmed.slice(1);\n}\n",
    }),
    { escapeHtml: "site-runtime ./html", slugify: "Prelum ./slug", toHex: "site-runtime ./encoding" },
    {},
  );
  assert.deepEqual(found.map((f) => `${f.file}:${f.line} ${f.warn}`), ["app/html.ts:2 true", "app/key.ts:1 true"]);
});

test("an admin or login route warns without noindex in a file that names it, and a Carrel site needs indexNowHook", () => {
  const files = {
    "app/routes/admin.tsx": "export default function Admin() {}",
    "app/routes/auth/login.tsx": "export default function Login() {}",
    "public/_headers": "/admin/*\n  X-Robots-Tag: noindex\n",
    "app/carrel.ts": 'import { submitIndexNow } from "@drdustinedwards/site-helpers/indexnow";\ncreateSiteApi({ onPageChange: (p) => submitIndexNow(p) });',
  };
  const found = checkFeatures(tree(files), { apps: { ".": "site" } }).filter((f) => /noindex|createSiteApi/.test(f.message));
  assert.deepEqual(
    found.map((f) => `${f.warn ?? false} ${f.message.split(":")[0]}`),
    ["false site calls createSiteApi with its own onPageChange submission", "true site has /login without noindex"],
  );
});
