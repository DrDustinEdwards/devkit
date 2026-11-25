import assert from "node:assert/strict";
import test from "node:test";

import { isWarning, staleExceptions } from "../bin/shared/config.mjs";
import { checkFeatures } from "../bin/shared/features.mjs";
import { checkCopies, blankComments, checkLibraries } from "../bin/shared/copies.mjs";

/** @param {Record<string, string>} files */
const tree = (files) => ({
  files: Object.keys(files),
  read: (/** @type {string} */ f) => files[f] ?? "",
});

const catalog = {
  escapeHtml: "site-runtime ./html",
  slugify: "Prelum ./slug",
  render: "Prelum ./render",
  readThemeCookie: "Capsomer ./theme",
};

test("a local definition of a shared export, or of a known alias, is a copy; a wrapper that imports it is not", () => {
  const found = checkCopies(
    tree({
      "app/a.ts":
        "export function escapeHtml(s) {}\nconst slugify = (s) => s;\nfunction render() {}\n",
      "app/b.ts": "export const themeFromRequest = (r) => null;\n",
      "app/c.ts":
        'import { escapeHtml as esc } from "@dustinedwards/site-runtime/html";\nexport function escapeHtml(s) { return esc(s); }\n',
      "app/a.test.ts": "function escapeHtml() {}\n",
    }),
    catalog,
    {},
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line}`),
    ["app/a.ts:1", "app/a.ts:2", "app/b.ts:1"],
  );
  assert.match(
    found[2].message,
    /themeFromRequest is a local copy of Capsomer \.\/theme readThemeCookie/,
  );
});

test("builder text counts in code, not in a comment, a waived file is skipped, and a shared package's own builder text is its own", () => {
  const files = {
    "app/robots.ts":
      '// writes "User-agent:" lines like Prelum\nexport const body = `User-agent: *`;\n',
    "app/sitemap.ts": "/* one <urlset> */\nexport {};\n",
    "app/og.ts": 'const t = "<urlset>";\n',
    "app/sitemap.xml.ts":
      'export const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;\n',
    "app/feed.ts": 'export const rss = `<rss version="2.0">`;\n',
    "app/ping.ts": 'await fetch("https://api.indexnow.org/indexnow", { method: "POST" });\n',
    "app/security.ts": 'export const txt = "Contact: mailto:security@example.com";\n',
    "app/meta.tsx": '<meta property="og:title" content={title} />\n',
    "app/hsts.ts": 'headers.set("Strict-Transport-Security", "max-age=63072000");\n',
    "app/head.tsx": '<script type="speculationrules">{rules}</script>\n',
    "app/img.ts":
      "const out = await images\n  .input(object.body)\n  .transform({ width: 400 });\n",
    "app/loader.ts":
      "const els = document.querySelectorAll('[data-island]');\nimport(/* @vite-ignore */ `/islands/${n}.js`);\n",
    "app/root.tsx":
      'export const links = () => [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter" }];\n',
    // The same, written another way.
    "app/resize.ts": "const out = await env.IMAGES . input ( stream ).transform({ width: 400 });\n",
    "app/font.tsx": '<link href = { "https://fonts.googleapis.com/css2?family=Inter" } />\n',
    "app/font.ts":
      'const css = `@import url( "https://fonts.googleapis.com/css2?family=Inter");`;\n',
    "app/island.ts": 'await import( "/islands/chart.js");\n',
    // Using the shared ones, and a stream's own .transform, are not copies.
    "app/uses.ts":
      'import { speculationRules } from "@dustinedwards/site-runtime/prefetch";\nconst r = speculationRules();\nstream.input.transform(r);\n',
    "app/card.ts": "const css = await fetch(`https://fonts.googleapis.com/css2?family=${name}`);\n",
  };
  const copies = (/** @type {string | undefined} */ self) =>
    checkCopies(
      tree(files),
      {},
      { copies: { "app/og.ts": "satori shows entities literally" } },
      self,
    ).map((f) => `${f.file}:${f.line} ${f.message.split(" ")[3]}`);
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
  assert.deepEqual(copies("site-runtime"), [
    "app/robots.ts:2 Prelum",
    "app/sitemap.xml.ts:1 Prelum",
    "app/feed.ts:1 Prelum",
    "app/ping.ts:1 Prelum",
    "app/meta.tsx:1 Prelum",
    "app/loader.ts:1 devkit",
    "app/root.tsx:1 self-hosted",
    "app/font.tsx:1 self-hosted",
    "app/font.ts:1 self-hosted",
    "app/island.ts:1 devkit",
  ]);
});

test("a wrapped library in a site's manifest is refused unless waived with a reason", () => {
  const files = { "package.json": '{"dependencies":{"marked":"1","katex":"1","zod":"1"}}' };
  assert.deepEqual(
    checkLibraries(tree(files), { libraries: { katex: "the generated stylesheet" } }).map(
      (f) => f.message.split(" ")[0],
    ),
    ["marked"],
  );
  // A peer the site's shared package asks it to install is that package's job being done, not duplicated.
  const prelum = {
    "package.json":
      '{"dependencies":{"@drdustinedwards/site-helpers":"x","remark-gfm":"1","marked":"1"}}',
  };
  assert.deepEqual(
    checkLibraries(tree(prelum), {}, { "@drdustinedwards/site-helpers": ["remark-gfm"] }).map(
      (f) => f.message.split(" ")[0],
    ),
    ["marked"],
  );
  // Only the library itself: a name that starts or ends with one is another package, and a shared package is its own.
  const lookalikes = [
    "@types/marked",
    "marked-highlight",
    "vite-plugin-mermaid",
    "mermaid-isomorphic",
    "markdown-it-katex",
    "katex-fonts",
    "@shikijs/shiki",
    "shiki-twoslash",
    "react-rss",
    "rss-parser",
    "@types/dompurify",
    "dompurify-html",
    "node-jose",
    "jose-browser",
  ];
  const others = {
    "package.json": JSON.stringify({
      dependencies: Object.fromEntries(lookalikes.map((d) => [d, "1"])),
    }),
    "packages/prelum/package.json":
      '{"name":"@drdustinedwards/site-helpers","dependencies":{"marked":"1"}}',
  };
  assert.deepEqual(checkLibraries(tree(others), {}), []);
  // One manifest that is not JSON is a warning on that file; the others are still checked.
  const broken = {
    "packages/a/package.json": "{ not json",
    "package.json": '{"dependencies":{"marked":"1"}}',
  };
  const found = checkLibraries(tree(broken), {});
  assert.deepEqual(
    found.map((f) => `${f.file} ${f.warn ?? false}`),
    ["packages/a/package.json true", "package.json false"],
  );
});

test("blankComments blanks comments and keeps `//` and `/*` inside strings, templates and regular expressions", () => {
  const code =
    'const u = "http://x/*"; // gone\nimport a from "src/*"; /* c */ const t = `a // ${"//q"} y`; const r = /[\'"]/; // end';
  const out = blankComments(code);
  assert.equal(out.length, code.length);
  assert.equal(
    out.replace(/ +/g, " "),
    'const u = "http://x/*"; \nimport a from "src/*"; const t = `a // ${"//q"} y`; const r = /[\'"]/; ',
  );
});

test("PLANT: the fingerprints fail on a copy, and their look-alikes pass", () => {
  const files = tree({
    "app/ld.tsx":
      '<script\n  type="application/ld+json"\n  dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}\n/>\n',
    "app/meta.ts": 'export const meta = () => [{ tagName: "link", rel: "canonical", href }];\n',
    "app/card.tsx": '<meta name="twitter:card" content="summary" />\n',
    "app/token.ts":
      'const b = crypto.getRandomValues(new Uint8Array(8));\nexport const t = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");\n',
    "app/b64.ts": 'export const enc = (s) => btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_");\n',
    "app/cmp.ts": "for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);\n",
    "app/cmp2.ts": "for (const i of r) out |= a[i] ^ b[i];\n",
    "app/cmp3.ts": "d|=s.charCodeAt(i)^t;\n",
    "app/ld2.ts": 'const node = { "@context": "https://schema.org/", "@type": "Person" };\n',
    "app/human.ts":
      'await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });\n',
    "app/access.ts": 'if (env.ACCESS_DEV_BYPASS === "1") return next();\n',
    "app/theme.ts":
      'export const script = `const t = localStorage.getItem("theme"); document.documentElement.setAttribute("data-theme", t);`;\n',
    "app/root.tsx": 'export function ErrorBoundary() {\n  let message = "Oops!";\n}\n',
    // A Link header's canonical, a color's three channels and a string hash are not copies.
    "app/twin.ts": 'export const link = `<${origin}${path}>; rel="canonical"`;\n',
    "app/color.mjs":
      'export const css = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;\n',
    "app/hash.ts": "for (let i = 0; i < s.length; i++) h ^= s.charCodeAt(i);\n",
    "public/_headers":
      "# Strict-Transport-Security: is set by the Worker\n/*\n  Strict-Transport-Security: max-age=63072000\n",
    // A repository's own copy of a Claude Code hook devkit ships; another hook of its own passes.
    ".claude/hooks/no-em-dash.sh": "#!/usr/bin/env bash\n",
    ".claude/hooks/scoped-git-add.sh": "#!/usr/bin/env bash\n",
    ".claude/hooks/no-direct-deploy.sh": "#!/usr/bin/env bash\n",
  });
  assert.deepEqual(
    checkCopies(files, {}, {}).map((f) => `${f.file}:${f.line} ${isWarning(f)}`),
    [
      "app/ld.tsx:2 false",
      "app/meta.ts:1 false",
      "app/card.tsx:1 false",
      "app/token.ts:2 false",
      "app/b64.ts:1 false",
      "app/cmp.ts:1 false",
      "app/cmp2.ts:1 false",
      "app/cmp3.ts:1 false",
      "app/ld2.ts:1 false",
      "app/human.ts:1 false",
      "app/access.ts:1 false",
      "app/theme.ts:1 false",
      "app/root.tsx:2 false",
      ".claude/hooks/no-em-dash.sh:1 false",
      ".claude/hooks/scoped-git-add.sh:1 false",
      "public/_headers:3 false",
    ],
  );
  // site-runtime writes its own encoders, Turnstile, Access and security headers.
  assert.deepEqual(
    checkCopies(files, {}, {}, "site-runtime").map((f) => f.file),
    [
      "app/ld.tsx",
      "app/meta.ts",
      "app/card.tsx",
      "app/ld2.ts",
      "app/theme.ts",
      "app/root.tsx",
      ".claude/hooks/no-em-dash.sh",
      ".claude/hooks/scoped-git-add.sh",
    ],
  );
});

test("an alias that is also an ordinary name counts only when its body does the shared export's job", () => {
  const found = checkCopies(
    tree({
      "app/md.mjs":
        'function esc(text) {\n  return text.replace(/([*_])/g, "\\\\$1");\n}\nfunction other() {\n  return "&amp;";\n}\n',
      "app/html.ts":
        'export function render() {\n  const esc = (s) => s.replace(/&/g, "&amp;");\n  return esc(x);\n}\n',
      "app/kb.ts": "const slugOf = (t) => `${t.kind}/${t.id}`;\n",
      "app/key.ts":
        'function slugOf(name) {\n  return name\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, "-");\n}\n',
      "app/x.ts": "export function f(trimmed) {\n  const hex = trimmed.slice(1);\n}\n",
    }),
    {
      escapeHtml: "site-runtime ./html",
      slugify: "Prelum ./slug",
      toHex: "site-runtime ./encoding",
    },
    {},
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line} ${isWarning(f)}`),
    ["app/html.ts:2 false", "app/key.ts:1 false"],
  );
});

test("PLANT: an exception that excused nothing in the run is named; one that did is not", () => {
  const config = {
    copies: { "app/a.ts": "kept", "app/gone.ts": "moved" },
    libraries: { marked: "kept", jose: "removed" },
    waive: { "mcp:health": "no mcp app" },
  };
  const files = {
    "app/a.ts": "export function escapeHtml(s) {}\n",
    "package.json": '{"dependencies":{"marked":"1"}}',
  };
  assert.deepEqual(
    [
      ...checkCopies(tree(files), catalog, config),
      ...checkLibraries(tree(files), config),
      ...checkFeatures(tree(files), { ...config, apps: { ".": "package" } }),
    ],
    [],
  );
  assert.deepEqual(
    staleExceptions(config).map((f) => f.message.split(" excuses")[0]),
    ['"copies" "app/gone.ts"', '"waive" "mcp:health"', '"libraries" "jose"'],
  );
});
