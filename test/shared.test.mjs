import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { WORKFLOWS, checkCopies, checkFakes, checkFeatures, checkLibraries, checkPins, checkSpelling, checkTokens, checkWorkflows, isWarning, newest, respell, staleExceptions } from "../bin/shared.mjs";

const SHA_V2 = "2".repeat(40);
const SHA_RAW = "9".repeat(40);
const tags = () => ({ tags: ["v0.9.0", "v0.10.0", "v0.2.0"], commits: { "v0.9.0": "1".repeat(40), "v0.10.0": SHA_V2, "v0.2.0": "3".repeat(40) } });
/** @param {Record<string, string>} files */
const tree = (files) => ({ files: Object.keys(files), read: (/** @type {string} */ f) => files[f] ?? "" });

test("the newest tag is compared as a version, not as text", () => {
  assert.equal(newest(["v0.9.0", "v0.10.0", "v0.2.0", "latest"]), "v0.10.0");
});

test("a raw commit is refused, a pin behind the newest tag is a warning, and a site-runtime pin behind a minor out three days fails", () => {
  const found = checkPins(
    tree({
      "package.json": JSON.stringify({ dependencies: { a: "github:DrDustinEdwards/prelum#v0.9.0", b: `github:DrDustinEdwards/site-runtime#${SHA_RAW}`, c: "github:DrDustinEdwards/d1-dump#v0.10.0", d: "git+https://github.com/DrDustinEdwards/capsomer.git#v0.9.0", enarratio: "^0.9.0" } }, null, 1),
      "app/package.json": '{"dependencies":{"enarratio":"0.10.0"}}',
      ".github/workflows/ci.yml": `uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${SHA_V2} # v0.10.0\nuses: DrDustinEdwards/devkit/.github/workflows/shared.yml@${"1".repeat(40)} # v0.9.0`,
      // The tag ai-author.yml runs its bin from.
      ".github/workflows/ai-author.yml": "    with:\n      devkit: DrDustinEdwards/devkit#v0.9.0\n",
      ".github/workflows/other.yml": "      devkit: DrDustinEdwards/devkit#v0.10.0\n",
    }),
    tags,
  );
  assert.deepEqual(
    found.map((f) => f.message),
    [
      "prelum is at v0.9.0; the newest release is v0.10.0",
      `site-runtime is pinned to ${SHA_RAW.slice(0, 12)}, which is no release; pin v0.10.0`,
      "capsomer is at v0.9.0; the newest release is v0.10.0",
      "enarratio is at v0.9.0; the newest release is v0.10.0",
      "devkit is at v0.9.0; the newest release is v0.10.0",
      "ai-author's devkit: input is at v0.9.0; the newest release is v0.10.0",
    ],
  );
  assert.deepEqual([found[4].line, found[5].line], [2, 2]);
  assert.deepEqual(found.map((f) => isWarning(f)), [true, false, true, true, true, true]);
  // A FRESH package: behind a minor out three days fails, behind a younger one warns, unread dates warn.
  const now = Date.parse("2026-11-10T00:00:00Z");
  const dates = { "site-runtime": { "v0.9.0": "2026-11-01T00:00:00Z", "v0.10.0": "2026-11-09T00:00:00Z" }, prelum: new Error("GitHub answered 403") };
  const pins = (ref) => checkPins(tree({ "package.json": `{"dependencies":{"s":"github:DrDustinEdwards/site-runtime#${ref}"}}` }), tags, dates, now);
  const behind = pins("v0.2.0");
  assert.equal(behind[0].message, "site-runtime is at v0.2.0, behind v0.9, a minor out more than 3 days; bump to v0.10.0");
  assert.equal(isWarning(behind[0]), false);
  const fresh = pins("v0.9.0");
  assert.equal(fresh[0].message, "site-runtime is at v0.9.0; the newest release is v0.10.0");
  assert.equal(isWarning(fresh[0]), true);
  assert.equal(isWarning(fresh[1]), true);
  assert.match(fresh[1].message, /prelum's release dates could not be read/);
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

test("builder text counts in code, not in a comment, a waived file is skipped, and a shared package's own builder text is its own", () => {
  const files = {
    "app/robots.ts": '// writes "User-agent:" lines like Prelum\nexport const body = `User-agent: *`;\n',
    "app/sitemap.ts": "/* one <urlset> */\nexport {};\n",
    "app/og.ts": 'const t = "<urlset>";\n',
    "app/sitemap.xml.ts": 'export const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;\n',
    "app/feed.ts": 'export const rss = `<rss version="2.0">`;\n',
    "app/ping.ts": 'await fetch("https://api.indexnow.org/indexnow", { method: "POST" });\n',
    "app/security.ts": 'export const txt = "Contact: mailto:security@example.com";\n',
    "app/meta.tsx": '<meta property="og:title" content={title} />\n',
    "app/hsts.ts": 'headers.set("Strict-Transport-Security", "max-age=63072000");\n',
    "app/head.tsx": '<script type="speculationrules">{rules}</script>\n',
    "app/img.ts": "const out = await images\n  .input(object.body)\n  .transform({ width: 400 });\n",
    "app/loader.ts": "const els = document.querySelectorAll('[data-island]');\nimport(/* @vite-ignore */ `/islands/${n}.js`);\n",
    "app/root.tsx": 'export const links = () => [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter" }];\n',
    // The same, written another way.
    "app/resize.ts": "const out = await env.IMAGES . input ( stream ).transform({ width: 400 });\n",
    "app/font.tsx": '<link href = { "https://fonts.googleapis.com/css2?family=Inter" } />\n',
    "app/font.ts": 'const css = `@import url( "https://fonts.googleapis.com/css2?family=Inter");`;\n',
    "app/island.ts": 'await import( "/islands/chart.js");\n',
    // Using the shared ones, and a stream's own .transform, are not copies.
    "app/uses.ts": 'import { speculationRules } from "@dustinedwards/site-runtime/prefetch";\nconst r = speculationRules();\nstream.input.transform(r);\n',
    "app/card.ts": "const css = await fetch(`https://fonts.googleapis.com/css2?family=${name}`);\n",
  };
  const copies = (/** @type {string | undefined} */ self) => checkCopies(tree(files), {}, { copies: { "app/og.ts": "satori shows entities literally" } }, self).map((f) => `${f.file}:${f.line} ${f.message.split(" ")[3]}`);
  assert.deepEqual(copies(), [
    "app/robots.ts:2 Prelum",
    "app/sitemap.xml.ts:1 Prelum",
    "app/feed.ts:1 Prelum",
    "app/ping.ts:1 Prelum",
    "app/security.ts:1 site-runtime",
    "app/meta.tsx:1 Prelum",
    "app/hsts.ts:1 site-runtime",
    "app/head.tsx:1 site-runtime",
    "app/img.ts:2 site-runtime",
    "app/loader.ts:1 devkit",
    "app/root.tsx:1 self-hosted",
    "app/resize.ts:1 site-runtime",
    "app/font.tsx:1 self-hosted",
    "app/font.ts:1 self-hosted",
    "app/island.ts:1 devkit",
  ]);
  assert.deepEqual(copies("site-runtime"), ["app/robots.ts:2 Prelum", "app/sitemap.xml.ts:1 Prelum", "app/feed.ts:1 Prelum", "app/ping.ts:1 Prelum", "app/meta.tsx:1 Prelum", "app/loader.ts:1 devkit", "app/root.tsx:1 self-hosted", "app/font.tsx:1 self-hosted", "app/font.ts:1 self-hosted", "app/island.ts:1 devkit"]);
});

test("a wrapped library in a site's manifest is refused unless waived with a reason", () => {
  const files = { "package.json": '{"dependencies":{"marked":"1","katex":"1","zod":"1"}}' };
  assert.deepEqual(checkLibraries(tree(files), { libraries: { katex: "the generated stylesheet" } }).map((f) => f.message.split(" ")[0]), ["marked"]);
  // A peer the site's shared package asks it to install is that package's job being done, not duplicated.
  const prelum = { "package.json": '{"dependencies":{"@drdustinedwards/site-helpers":"x","remark-gfm":"1","marked":"1"}}' };
  assert.deepEqual(checkLibraries(tree(prelum), {}, { "@drdustinedwards/site-helpers": ["remark-gfm"] }).map((f) => f.message.split(" ")[0]), ["marked"]);
  // Only the library itself: a name that starts or ends with one is another package, and a shared package is its own.
  const lookalikes = ["@types/marked", "marked-highlight", "vite-plugin-mermaid", "mermaid-isomorphic", "markdown-it-katex", "katex-fonts", "@shikijs/shiki", "shiki-twoslash", "react-rss", "rss-parser", "@types/dompurify", "dompurify-html", "node-jose", "jose-browser"];
  const others = { "package.json": JSON.stringify({ dependencies: Object.fromEntries(lookalikes.map((d) => [d, "1"])) }), "packages/prelum/package.json": '{"name":"@drdustinedwards/site-helpers","dependencies":{"marked":"1"}}' };
  assert.deepEqual(checkLibraries(tree(others), {}), []);
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

/** A git repository holding `files`, with a stand-in codespell first on PATH: codespell's output for a few British words. */
function repo(/** @type {Record<string, string>} */ files) {
  const root = mkdtempSync(join(tmpdir(), "family-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  const bin = mkdtempSync(join(tmpdir(), "codespell-"));
  writeFileSync(
    join(bin, "codespell"),
    `#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const args = process.argv.slice(2);
if (process.env.CODESPELL_BROKEN) { console.error("broken"); process.exit(2); }
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : "");
const words = { colour: "color", licence: "license", favour: "favor", honour: "honor", cancelled: "canceled" }; // codespell:ignore
const ignore = opt("--ignore-words-list").split(",");
let found = false;
for (const file of args.slice(args.indexOf("--") + 1)) {
  readFileSync(file, "utf8").split("\\n").forEach((line, i) => {
    for (const [w] of line.replace(new RegExp(opt("--ignore-regex"), "g"), "").matchAll(new RegExp(opt("--regex"), "g"))) {
      if (words[w.toLowerCase()] && !ignore.includes(w.toLowerCase())) console.log(\`\${file}:\${i + 1}: \${w} ==> \${words[w.toLowerCase()]}\`), (found = true);
    }
  });
}
process.exit(found ? 65 : 0);
`,
  );
  chmodSync(join(bin, "codespell"), 0o755);
  return { root, PATH: `${bin}${delimiter}${process.env.PATH}` };
}

test("PLANT: a British word fails at its line; a skipped path, an ignored word, a contract and a name another tool owns pass; --fix-spelling rewrites it; an ignore or contract that excused nothing is named", { skip: process.platform === "win32" }, () => {
  const { root, PATH } = repo({
    "app/a.ts": 'export const colour = "red";\nconst Licence = 1;\n', // codespell:ignore
    "app/b.ts": 'if (status === "cancelled" && job.cancelled()) favour();\n', // codespell:ignore
    "frame/notes.md": "colour\n", // codespell:ignore
    "package-lock.json": '{ "colour": 1 }\n', // codespell:ignore
    "logo.png": "colour", // codespell:ignore
  });
  const path = process.env.PATH;
  process.env.PATH = PATH;
  try {
    const config = () => ({ spelling: { skip: ["frame/**"], ignore: ["favour", "honour"], contracts: ['"cancelled"', '"gone"'] } }); // codespell:ignore
    const kept = config();
    assert.deepEqual(
      checkSpelling(root, kept).map((f) => `${f.file}:${f.line} ${f.message.split(";")[0]}`),
      ["app/a.ts:1 colour is British", "app/a.ts:2 Licence is British"], // codespell:ignore
    );
    assert.deepEqual(
      staleExceptions(kept).map((f) => f.message.split(" excuses")[0]),
      ['"spelling" "ignore" "honour"', '"spelling" "contracts" ""gone""'], // codespell:ignore
    );
    assert.deepEqual(checkSpelling(root, config(), true), []);
    assert.equal(readFileSync(join(root, "app/a.ts"), "utf8"), 'export const color = "red";\nconst License = 1;\n');
    assert.equal(readFileSync(join(root, "app/b.ts"), "utf8"), 'if (status === "cancelled" && job.cancelled()) favour();\n'); // codespell:ignore
    process.env.CODESPELL_BROKEN = "1";
    assert.throws(() => checkSpelling(root, {}), /codespell failed: broken/);
  } finally {
    process.env.PATH = path;
    delete process.env.CODESPELL_BROKEN;
  }
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

test("PLANT: the fingerprints new in 0.18.0 warn on a copy below 0.21.0 and fail from it, and their look-alikes pass", () => {
  const files = tree({
    "app/ld.tsx": '<script\n  type="application/ld+json"\n  dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}\n/>\n',
    "app/meta.ts": 'export const meta = () => [{ tagName: "link", rel: "canonical", href }];\n',
    "app/card.tsx": '<meta name="twitter:card" content="summary" />\n',
    "app/token.ts": "const b = crypto.getRandomValues(new Uint8Array(8));\nexport const t = Array.from(b, (x) => x.toString(16).padStart(2, \"0\")).join(\"\");\n",
    "app/b64.ts": 'export const enc = (s) => btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_");\n',
    "app/cmp.ts": "for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);\n",
    "app/cmp2.ts": "for (const i of r) out |= a[i] ^ b[i];\n",
    "app/cmp3.ts": "d|=s.charCodeAt(i)^t;\n",
    "app/ld2.ts": 'const node = { "@context": "https://schema.org/", "@type": "Person" };\n',
    "app/human.ts": 'await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });\n',
    "app/access.ts": "if (env.ACCESS_DEV_BYPASS === \"1\") return next();\n",
    "app/theme.ts": 'export const script = `const t = localStorage.getItem("theme"); document.documentElement.setAttribute("data-theme", t);`;\n',
    "app/root.tsx": 'export function ErrorBoundary() {\n  let message = "Oops!";\n}\n',
    // A Link header's canonical, a color's three channels and a string hash are not copies.
    "app/twin.ts": "export const link = `<${origin}${path}>; rel=\"canonical\"`;\n",
    "app/color.mjs": 'export const css = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;\n',
    "app/hash.ts": "for (let i = 0; i < s.length; i++) h ^= s.charCodeAt(i);\n",
    "public/_headers": "# Strict-Transport-Security: is set by the Worker\n/*\n  Strict-Transport-Security: max-age=63072000\n",
  });
  assert.deepEqual(
    checkCopies(files, {}, {}).map((f) => `${f.file}:${f.line} ${isWarning(f, "0.18.0")} ${isWarning(f, "0.21.0")}`),
    [
      "app/ld.tsx:2 true false",
      "app/meta.ts:1 true false",
      "app/card.tsx:1 true false",
      "app/token.ts:2 true false",
      "app/b64.ts:1 true false",
      "app/cmp.ts:1 true false",
      "app/cmp2.ts:1 true false",
      "app/cmp3.ts:1 true false",
      "app/ld2.ts:1 true false",
      "app/human.ts:1 true false",
      "app/access.ts:1 true false",
      "app/theme.ts:1 true false",
      "app/root.tsx:2 true false",
      "public/_headers:3 true false",
    ],
  );
  // site-runtime writes its own encoders, Turnstile, Access and security headers.
  assert.deepEqual(checkCopies(files, {}, {}, "site-runtime").map((f) => f.file), ["app/ld.tsx", "app/meta.ts", "app/card.tsx", "app/ld2.ts", "app/theme.ts", "app/root.tsx"]);
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
  assert.deepEqual(found.map((f) => `${f.file}:${f.line} ${isWarning(f, "0.18.0")}`), ["app/html.ts:2 true", "app/key.ts:1 true"]);
});

test("an admin or login route warns without noindex in a file that names it, a site warns with no accessibility test or a feed with no alternate link, and a Carrel site needs indexNowHook", () => {
  const indexnow = 'import { submitIndexNow } from "@drdustinedwards/site-helpers/indexnow";\n';
  const files = {
    "app/routes/admin.tsx": "export default function Admin() {}",
    "app/routes/auth/login.tsx": "export default function Login() {}",
    "public/_headers": "/admin/*\n  X-Robots-Tag: noindex\n",
    "app/carrel.ts": `${indexnow}createSiteApi({ onPageChange: (p) => submitIndexNow(p) });`,
    // Each done right: an axe test, the hook, a feed with its link, and a Worker with no D1 database.
    "blog/test/a11y.test.ts": 'import { expectNoAxeViolations } from "capsomer/testing";',
    "blog/app/carrel.ts": `${indexnow}createSiteApi({ hooks: [indexNowHook({ submit: submitIndexNow })] });`,
    "blog/app/feed.ts": "export const loader = () => jsonFeedDocument(posts);",
    "blog/app/root.tsx": 'import "capsomer/base.css";\n<link type="application/feed+json" rel="alternate" href="/feed.json" />',
    "blog/wrangler.jsonc": '{ "kv_namespaces": [] }',
    "news/e2e/pages.spec.ts": 'import AxeBuilder from "@axe-core/playwright";',
    "news/src/carrel.ts": `${indexnow}createSiteApi({});`,
    "news/src/feed.ts": "export const loader = () => rssDocument(posts);",
    "news/build.mjs": 'const dir = dirname(require.resolve("capsomer/package.json"));\ncopyFileSync(join(dir, "css/base.css"), out);',
    "docs/test/a11y.test.ts": 'import AxeBuilder from "@axe-core/playwright";',
    "docs/src/feed.ts": 'return new Response(xml, { headers: { "Content-Type": "application/atom+xml" } });\n// <link rel="alternate" type="application/atom+xml">',
    "docs/src/root.ts": 'import "capsomer/base.css";',
  };
  const found = checkFeatures(tree(files), { apps: { ".": "site", blog: "site", news: "static", docs: "static" } }).filter((f) => /noindex|createSiteApi|accessibility|feed|D1|no capsomer/.test(f.message));
  assert.deepEqual(
    found.map((f) => `${f.warn ?? false} ${f.message.split(":")[0]}`),
    [
      "false site has no capsomer",
      "false site calls createSiteApi with its own onPageChange submission",
      "true site has no accessibility test",
      "true site has /login without noindex",
      "false static news calls createSiteApi without IndexNow, so a publish from Carrel reaches no search engine",
      "true static news has a feed and no alternate link to it",
      "true static docs has a feed and no alternate link to it",
    ],
  );
});

test("PLANT: a repository missing the devkit workflows its kinds need is told which; calling them, running the bin, or a waiver passes", () => {
  const files = { "mcp/wrangler.jsonc": "{}", "mcp/src/index.ts": "export default {};" };
  const missing = (/** @type {Record<string, string>} */ more, config = {}) =>
    checkWorkflows(tree({ ...files, ...more }), { apps: { ".": "static", mcp: "worker" }, ...config }, { self: "prelum", private: false }).map((f) => f.message.split("devkit's ")[1].split(".yml")[0]);
  assert.deepEqual(missing({}), WORKFLOWS.map((w) => w.name));
  const calls = WORKFLOWS.filter((w) => !["shared", "no-bloat", "worker-deploy"].includes(w.name)).map((w) => `      uses: DrDustinEdwards/devkit/.github/workflows/${w.name}.yml@${SHA_V2}`);
  const ci = {
    // A comment naming a workflow is no call.
    ".github/workflows/ci.yml": `jobs:\n  a:\n${calls.join("\n")}\n  # uses: DrDustinEdwards/devkit/.github/workflows/worker-deploy.yml@${SHA_V2}\n  b:\n    steps:\n      - run: npm run check\n      - run: npx devkit-shared\n`,
    "package.json": JSON.stringify({ scripts: { check: "npm run check:bloat && tsc", "check:bloat": "devkit-no-bloat" } }),
  };
  assert.deepEqual(missing(ci), ["worker-deploy"]);
  assert.deepEqual(missing(ci, { waive: { "workflow:worker-deploy": "Workers Builds deploys it" } }), []);
  // devkit calls its own by path, and a reusable workflow it ships for others is no call; locally no-bloat only warns.
  const devkit = checkWorkflows(
    tree({
      ".github/workflows/ci.yml": "jobs:\n  a:\n    uses: ./.github/workflows/shared.yml\n",
      ".github/workflows/pr-footer.yml": `on:\n  workflow_call:\njobs:\n  a:\n    uses: DrDustinEdwards/devkit/.github/workflows/pr-footer.yml@${SHA_V2}\n`,
      "wrangler.jsonc": "{}",
      "test/fixtures/site/wrangler.jsonc": "{}",
      "src/a.ts": "",
    }),
    { apps: { ".": "worker", "test/fixtures/site": "site" } },
    { self: "devkit" },
  );
  assert.deepEqual(
    devkit.map((f) => `${f.message.split(" calls")[0]} ${f.message.split("devkit's ")[1].split(".yml")[0]} ${isWarning(f, "0.21.0")}`),
    [
      "every repository ai-author false",
      "every repository pr-footer false",
      "every repository workflow-audit false",
      "every repository dependencies false",
      "a repository with a Worker (the root) worker-size false",
      "a repository with a Worker (the root) worker-deploy true",
      "a public repository with JavaScript or TypeScript no-bloat true",
      "a shared package other repositories pin bump-consumers false",
    ],
  );
  assert.match(devkit[6].message, /\(a warning here: only Actions says whether this repository is public\)$/);
});

test("PLANT: a test with a fake devkit ships warns, naming the helper; using devkit's, or a stub for one case, passes", () => {
  const found = checkFakes(
    tree({
      "test/github.test.ts": 'globalThis.fetch = async (url) => {\n  if (url.endsWith("/repos/o/r/contents/a.md")) return Response.json({ sha });\n};\n',
      "test/access.test.ts": 'const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048 }, true, ["sign"]);\nconst certs = { keys: [jwk] };\n',
      "test/setup.ts": "beforeEach(() => {\n  vi.stubGlobal(\"fetch\", async (input) => {\n    throw new Error(`no network in tests: ${input}`);\n  });\n});\n",
      "test/db.test.ts": 'await env.DB.batch([\n  env.DB.prepare("DELETE FROM posts"),\n  env.DB.prepare("DELETE FROM tags"),\n  env.DB.prepare("DELETE FROM media"),\n]);\n',
      "test/loop.test.ts": 'for (const t of ["posts", "tags"]) await env.DB.prepare(`DELETE FROM ${t}`).run();\n',
      "test/trees.test.ts": 'vi.stubGlobal("fetch", async (url) => (String(url).includes("/repos/o/r/git/trees/") ? tree : ok));\n',
      "test/rsa.test.ts": 'const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });\nserve("/cdn-cgi/access/certs", keys);\n',
      "test/rsa2.test.ts": 'const k = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5"}, true, ["sign"]);\nconst set = { keys: [{ ...publicJwk }] };\n',
      // devkit's own helpers, a failure stubbed for one case, and a delete of some rows are not fakes.
      "test/uses.test.ts": 'import { refuseNetwork } from "@dustinedwards/devkit/network";\nimport { resetDb } from "@dustinedwards/devkit/d1";\nvi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));\nawait db.prepare("DELETE FROM posts WHERE id = ?").run();\n',
      "app/db.ts": 'db.prepare("DELETE FROM a");\ndb.prepare("DELETE FROM b");\ndb.prepare("DELETE FROM c");\n',
    }),
    {},
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line} ${f.message.split("use devkit ")[1].split(",")[0]} ${isWarning(f)}`),
    ["test/github.test.ts:2 ./github stubGitHub true", "test/access.test.ts:1 ./access stubAccess true", "test/setup.ts:2 ./network refuseNetwork true", "test/db.test.ts:2 ./d1 resetDb true", "test/loop.test.ts:1 ./d1 resetDb true", "test/trees.test.ts:1 ./github stubGitHub true", "test/rsa.test.ts:1 ./access stubAccess true", "test/rsa2.test.ts:1 ./access stubAccess true"],
  );
  assert.equal(found.filter((f) => isWarning(f, "0.21.0")).length, 0);
});

test("PLANT: an exception that excused nothing in the run is named; one that did is not", () => {
  const config = { copies: { "app/a.ts": "kept", "app/gone.ts": "moved" }, libraries: { marked: "kept", jose: "removed" }, waive: { "mcp:health": "no mcp app" } };
  const files = { "app/a.ts": "export function escapeHtml(s) {}\n", "package.json": '{"dependencies":{"marked":"1"}}' };
  assert.deepEqual([...checkCopies(tree(files), catalog, config), ...checkLibraries(tree(files), config), ...checkFeatures(tree(files), { ...config, apps: { ".": "package" } })], []);
  assert.deepEqual(
    staleExceptions(config).map((f) => f.message.split(" excuses")[0]),
    ['"copies" "app/gone.ts"', '"waive" "mcp:health"', '"libraries" "jose"'],
  );
});

test("a library's package.json with exports and no kind is judged as a site, and the finding says to declare a package", () => {
  const [first] = checkFeatures(tree({ "package.json": '{"exports":"./index.mjs"}' }), {});
  assert.match(first.message, /"apps": \{ "\.": "package" \}/);
});

test("PLANT: a .shared.json with an unknown key or kind, or a --from missing a package, stops the check (exit 2) naming what is valid", () => {
  const root = mkdtempSync(join(tmpdir(), "family-"));
  spawnSync("git", ["init", "-q"], { cwd: root });
  const run = (/** @type {object} */ config, /** @type {string[]} */ args = []) => {
    writeFileSync(join(root, ".shared.json"), JSON.stringify(config));
    const out = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/shared.mjs", import.meta.url)), ...args], { cwd: root, encoding: "utf8" });
    return `${out.status} ${out.stdout.trim()}`;
  };
  assert.match(run({ wave: {} }), /^2 .*"wave" is no key; the valid ones are apps, waive, copies, libraries, tokens, spelling$/);
  assert.match(run({ apps: { ".": "sitee" } }), /^2 .*"sitee", which is no kind; the valid ones are site, static, private, worker, package$/);
  mkdirSync(join(root, "packages", "prelum"), { recursive: true });
  writeFileSync(join(root, "packages", "prelum", "package.json"), "{}");
  assert.match(run({ apps: { ".": "site" } }, ["--from", join(root, "packages")]), /^2 .*has no checkout of site-runtime, site-api, d1-dump, devkit, capsomer, enarratio$/);
});

test("PLANT: the bin reads every package's exports from --from checkouts, lists them, fails a copy of one, and passes a package's own; without them it says what it did not check", { skip: process.platform === "win32" }, () => {
  const pkg = (/** @type {string} */ name, /** @type {object} */ more = {}) => JSON.stringify({ name, version: "1.0.0", ...more });
  const from = repo({
    "prelum/package.json": pkg("@drdustinedwards/site-helpers", { exports: { "./slug": { types: "./dist/slug.d.ts", default: "./dist/slug.js" }, "./package.json": "./package.json", "./base.css": "./base.css" }, bin: { "prelum-indexnow": "./bin/indexnow.mjs" } }),
    "prelum/dist/slug.d.ts": "export declare function slugify(s: string): string;\nexport { type Slug, slugOf as slugPath };\n",
    "site-runtime/package.json": pkg("@dustinedwards/site-runtime", { exports: { "./html": "./src/html.mjs" } }),
    "site-runtime/src/html.mjs": 'export * from "./escape.mjs";\nexport * from "./attr.js";\nexport * from "./more.mjs";\nexport * from "./types.js";\n',
    "site-runtime/src/escape.mjs": "export function escapeHtml(s) {}\n",
    "site-runtime/src/attr.ts": "export function attrValue(s) {}\n",
    "site-runtime/src/more.d.mts": "export declare function moreHtml(): string;\n",
    "site-runtime/src/types.d.ts": "export declare const typesHtml: string;\n",
    // A subpath's names come from its declaration twin, or the source a dist file is built from.
    "site-api/package.json": pkg("@dustinedwards/site-api", { exports: { "./x": "./dist/x.js", "./w": { types: "./dist/w.d.ts" } } }),
    "site-api/src/x.ts": "export function apiX() {}\n",
    "site-api/src/w.ts": "export function apiW() {}\n",
    "d1-dump/package.json": pkg("@dustinedwards/d1-dump", { exports: { "./y": { import: "./y.mjs" }, "./v": "./v.js", "./u": { types: "./dist/u.d.ts" } } }),
    "d1-dump/y.d.mts": "export declare function dumpY(): void;\n",
    "d1-dump/v.d.ts": "export declare function dumpV(): void;\n",
    "d1-dump/u.ts": "export function dumpU() {}\n",
    "devkit/package.json": pkg("@dustinedwards/devkit", { exports: { "./github": "./testing/github.mjs" } }),
    "devkit/testing/github.mjs": "export function stubGitHub() {}\n",
    "capsomer/package.json": pkg("capsomer", { exports: { "./behavior/*": "./components/*/behavior.mjs", "./react/*": "./components/*/react.mjs" } }),
    "capsomer/components/time/behavior.mjs": "export const relative = () => {};\n",
    "capsomer/tokens/scale.css": ":root {\n  --page-max: 1180px;\n}\n",
    "enarratio/package.json": pkg("enarratio", { exports: "./index.mjs" }),
    "enarratio/index.mjs": "export class ChartView {}\n",
  }).root;
  const { root, PATH } = repo({
    ".shared.json": JSON.stringify({ apps: { ".": "worker" }, copies: { "src/gone.ts": "moved" } }),
    "src/index.ts": 'import { buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";\nexport function slugify(s) {}\nexport function stubGitHub() {}\n',
    "src/app.css": ":root {\n  --page-max: 1px;\n}\n",
  });
  const summary = join(root, "summary.md");
  const run = (/** @type {string[]} */ args) => {
    const out = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/shared.mjs", import.meta.url)), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, PATH, GITHUB_STEP_SUMMARY: summary, GITHUB_HEAD_REF: "" } });
    return { status: out.status, lines: out.stdout.trim().split("\n") };
  };

  const list = run(["list", "--from", from]);
  assert.equal(list.status, 0);
  for (const line of ["| a11y (a warning) | site, static, private | capsomer/testing expectNoAxeViolations (or @axe-core) in a browser test |", "## Prelum 1.0.0 (DrDustinEdwards/prelum)", "- `./slug`: `slugify`, `slugPath`", "- bins: `prelum-indexnow`", "- `./html`: `escapeHtml`, `attrValue`, `moreHtml`, `typesHtml`", "- `./x`: `apiX`", "- `./w`: `apiW`", "- `./y`: `dumpY`", "- `./v`: `dumpV`", "- `./u`: `dumpU`", "- `./behavior/time`: `relative`", "- `./react/*`: `react/time`", "- `./github`: `stubGitHub`", "- `.`: `ChartView`", "## site-api 1.0.0 (DrDustinEdwards/site-api)"]) {
    assert.ok(list.lines.includes(line), line);
  }

  const site = run(["--from", from]);
  assert.equal(site.status, 1);
  assert.deepEqual(site.lines.filter((l) => l.startsWith("::error")), [
    `::error file=src/app.css,line=2::[tokens] --page-max is Capsomer's: set it there (its site layer for this site's own look), or say why in .shared.json "tokens"`,
  ]);
  assert.ok(site.lines.includes("::warning file=src/index.ts,line=2::[copies] slugify is a local copy of Prelum ./slug slugify: import it"));
  assert.ok(site.lines.includes('::warning file=.shared.json::[config] "copies" "src/gone.ts" excuses nothing in this run: remove it'));
  assert.match(site.lines.at(-1) ?? "", /^devkit-shared: 1 to fix \(pins 0, copies 1, libraries 0, features 0, tokens 1, spelling 0, workflows \d+, fakes 0, config 1\)/);
  assert.match(readFileSync(summary, "utf8"), /^### Shared-code check\n\npins 0, copies 1,/);

  // Prelum checking itself: its own export is its API, not a copy.
  writeFileSync(join(root, "package.json"), pkg("@drdustinedwards/site-helpers", { exports: { "./slug": "./src/index.ts" } }));
  execFileSync("git", ["add", "-A"], { cwd: root });
  assert.ok(!run(["--from", from]).lines.some((l) => l.includes("[copies] slugify")));

  const local = run([]);
  assert.ok(local.lines.includes("::warning::[config] not installed here: site-runtime, site-api, d1-dump, devkit, capsomer, enarratio, so copies of their exports and Capsomer's tokens were not checked and no exception was judged stale; npm install, or --from <dir> of checkouts (CI reads them all)"));
});
