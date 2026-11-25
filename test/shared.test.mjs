// The shared-code check's rules, one pure check at a time.

import assert from "node:assert/strict";
import test from "node:test";

import { checkCopies, checkLibraries } from "../bin/shared/copies.mjs";
import { blankComments, isWarning } from "../bin/shared/core.mjs";
import { FEATURES, checkFeatures } from "../bin/shared/features.mjs";
import { checkPins, lockDisagrees, newest } from "../bin/shared/pins.mjs";
import { respell } from "../bin/shared/spelling.mjs";
import { SHA_V2, SHA_RAW, tags, tree, catalog } from "./fixtures/shared.mjs";

test("the newest tag is compared as a version, not as text", () => {
  assert.equal(newest(["v0.9.0", "v0.10.0", "v0.2.0", "latest"]), "v0.10.0");
});

test("a raw commit is refused, a pin behind the newest tag is a warning, and a site-runtime pin behind a minor out three days fails", () => {
  const found = checkPins(
    tree({
      "package.json": JSON.stringify(
        {
          dependencies: {
            a: "github:DrDustinEdwards/prelum#v0.9.0",
            b: `github:DrDustinEdwards/site-runtime#${SHA_RAW}`,
            c: "github:DrDustinEdwards/d1-dump#v0.10.0",
            d: "git+https://github.com/DrDustinEdwards/capsomer.git#v0.9.0",
            enarratio: "^0.9.0",
          },
        },
        null,
        1,
      ),
      "app/package.json": '{"dependencies":{"enarratio":"0.10.0"}}',
      ".github/workflows/ci.yml": `uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${SHA_V2} # v0.10.0\nuses: DrDustinEdwards/devkit/.github/workflows/shared.yml@${"1".repeat(40)} # v0.9.0`,
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
    ],
  );
  assert.equal(found[4].line, 2);
  assert.deepEqual(
    found.map((f) => isWarning(f)),
    [true, false, true, true, true],
  );
  // A FRESH package: behind a minor out three days fails, behind a younger one warns, unread dates warn.
  const now = Date.parse("2026-11-10T00:00:00Z");
  const dates = {
    "site-runtime": { "v0.9.0": "2026-11-01T00:00:00Z", "v0.10.0": "2026-11-09T00:00:00Z" },
    prelum: new Error("GitHub answered 403"),
  };
  const pins = (ref) =>
    checkPins(
      tree({
        "package.json": `{"dependencies":{"s":"github:DrDustinEdwards/site-runtime#${ref}"}}`,
      }),
      tags,
      dates,
      now,
    );
  const behind = pins("v0.2.0");
  assert.equal(
    behind[0].message,
    "site-runtime is at v0.2.0, behind v0.9, a minor out more than 3 days; bump to v0.10.0",
  );
  assert.equal(isWarning(behind[0]), false);
  const fresh = pins("v0.9.0");
  assert.equal(fresh[0].message, "site-runtime is at v0.9.0; the newest release is v0.10.0");
  assert.equal(isWarning(fresh[0]), true);
  assert.equal(isWarning(fresh[1]), true);
  assert.match(fresh[1].message, /prelum's release dates could not be read/);
  // An MCP server (S7): more than one minor behind the newest fails whatever the release's age; one behind is the usual warning.
  const server = (ref) =>
    checkPins(
      tree({
        "mcp/package.json": `{"dependencies":{"s":"github:DrDustinEdwards/site-runtime#${ref}"}}`,
        "mcp/src/door.ts": 'import { x } from "@dustinedwards/site-runtime/mcp-login";',
      }),
      tags,
      {},
      now,
    )[0];
  assert.match(
    server("v0.2.0").message,
    /^the MCP server in mcp runs site-runtime v0\.2\.0, more than one minor behind v0\.10\.0/,
  );
  assert.equal(isWarning(server("v0.2.0")), false);
  assert.equal(
    server("v0.9.0").message,
    "site-runtime is at v0.9.0; the newest release is v0.10.0",
  ); // A lockfile that resolves another release than the pin names fails (capsid #785), npm and pnpm.
  const pkg =
    '{"dependencies":{"@dustinedwards/site-runtime":"github:DrDustinEdwards/site-runtime#v0.10.0"}}';
  const npm = (v) =>
    tree({
      "package.json": pkg,
      "package-lock.json": JSON.stringify({
        packages: { "node_modules/@dustinedwards/site-runtime": { version: v } },
      }),
    });
  const run = (t) => checkPins(t, tags).filter((f) => f.message.includes("lock"));
  assert.equal(run(npm("0.10.0")).length, 0);
  const stale = run(npm("0.9.0"));
  assert.equal(stale.length, 1);
  assert.equal(isWarning(stale[0]), false);
  assert.match(stale[0].message, /pinned to v0\.10\.0 but package-lock\.json resolves 0\.9\.0/);
  // An npm workspace member has no lock of its own: the root lock holds its entry, nested under the member or hoisted.
  const member = (key, v) =>
    tree({
      "apps/web/package.json": pkg,
      "package-lock.json": JSON.stringify({
        packages: { [key]: { version: v } },
      }),
    });
  const key = "@dustinedwards/site-runtime";
  assert.equal(run(member(`apps/web/node_modules/${key}`, "0.10.0")).length, 0);
  assert.equal(run(member(`node_modules/${key}`, "0.10.0")).length, 0);
  const staleMember = run(member(`apps/web/node_modules/${key}`, "0.9.0"));
  assert.equal(staleMember.length, 1);
  assert.match(
    staleMember[0].message,
    /pinned to v0\.10\.0 but package-lock\.json resolves 0\.9\.0/,
  );
  assert.equal(run(member("apps/web/node_modules/other", "1.0.0")).length, 1); // no entry at all
  assert.equal(
    lockDisagrees(
      tree({
        "package.json": pkg,
        "pnpm-lock.yaml": "specifier: github:DrDustinEdwards/site-runtime#v0.10.0",
      }),
      "package.json",
      1,
      "x",
      "site-runtime",
      "v0.10.0",
    ).length,
    0,
  );
  assert.equal(
    lockDisagrees(
      tree({
        "package.json": pkg,
        "pnpm-lock.yaml": "specifier: github:DrDustinEdwards/site-runtime#v0.9.0",
      }),
      "package.json",
      1,
      "x",
      "site-runtime",
      "v0.10.0",
    ).length,
    1,
  );
});

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

test("each app is checked for its kind's features, files belong to the deepest app, and a D1 database needs the dump", () => {
  const found = checkFeatures(
    tree({
      "app/robots.ts": 'import { robotsDocument } from "@drdustinedwards/site-helpers/robots";',
      "wrangler.jsonc.example": '{ "d1_databases": [], "send_email": [{ "name": "EMAIL" }] }',
      "mcp/src/index.ts":
        'import { buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";',
    }),
    {
      apps: { ".": "site", mcp: "worker" },
      waive: {
        aiTxt: "x",
        tdm: "x",
        sitemap: "x",
        llms: "x",
        head: "x",
        schema: "x",
        indexnow: "x",
        securityTxt: "x",
        csp: "x",
        cspReport: "x",
        health: "x",
        capsomer: "x",
        a11y: "x",
      },
    },
  );
  assert.deepEqual(
    found.map((f) => f.message),
    [
      "site has no headers: site-runtime ./headers buildSecurityHeaders (or a ./sites entry given to ./static-site staticSite)",
      ". has a D1 database and no nightly dump: d1-dump runCheckedBackup and backupHealth",
      ". has a send_email binding and sends without site-runtime ./email sendEmail",
    ],
  );
});

test("a standardFiles or standardSiteApi call counts by its own top-level key, never one nested in it or in code after it", () => {
  const ai = (/** @type {string} */ text) => FEATURES.aiTxt.find.test(text);
  const indexNow = (/** @type {string} */ text) => FEATURES.indexnow.find.test(text);
  assert.equal(ai('standardFiles({ origin, // it\'s ours\n  ai: { name: "A}" } })'), true);
  assert.equal(
    indexNow(
      "standardSiteApi({ adapter: a({ ...(k ? { f: () => g({ h: { i } }) } : {}) }), indexNow: { key } })",
    ),
    true,
  );
  assert.equal(ai("standardFiles({ robots: { ai: 1 } })"), false);
  assert.equal(ai("standardFiles({ origin /* } */ });\nconst policy = { ai: true };"), false);
  assert.equal(indexNow("standardSiteApi({ db });\nlater({ indexNow: 1 });"), false);
});

test("PLANT: a React Router app without a year on its hashed files fails, and passes once _headers gives them one", () => {
  const app = {
    "react-router.config.ts": "export default {};",
    "app/site.ts": 'import { startIslands } from "@dustinedwards/devkit/islands";',
  };
  const cache = (/** @type {Record<string, string>} */ files) =>
    checkFeatures(tree({ ...app, ...files }), { apps: { ".": "worker" } })
      .filter((f) => /assets layer/.test(f.message))
      .map((f) => f.message.split(" ")[2]);
  assert.deepEqual(cache({}), ["/assets/*", "/islands/*"]);
  assert.deepEqual(
    cache({
      "public/_headers":
        "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/islands/*\n  X-Robots-Tag: noindex\n",
    }),
    ["/islands/*"],
  );
  assert.deepEqual(
    cache({
      "public/_headers":
        "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/islands/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    }),
    [],
  );
});

test("PLANT: security.txt's fixed Expires fails the check a month before it lapses", () => {
  const files = {
    "app/security-txt.ts": 'export const SECURITY_TXT_EXPIRES = "2027-09-28T00:00:00Z";',
  };
  const expiry = (/** @type {number} */ now) =>
    checkFeatures(tree(files), { apps: { ".": "worker" } }, now).filter((f) =>
      /security\.txt/.test(f.message),
    );
  assert.equal(expiry(Date.parse("2027-08-01")).length, 0);
  assert.equal(expiry(Date.parse("2027-09-01")).length, 1);
});

test("the spelling fix rewrites a word inside a name and keeps its case, but never a contract", () => {
  const none = /$^/g;
  // oxfmt-ignore
  assert.equal(respell("math.katexColour === colour", "colour", "color", none, true), "math.katexColor === color"); // codespell:ignore
  // oxfmt-ignore
  assert.equal(respell("HOSTED_WITHOUT_LICENCE", "licence", "license", none, true), "HOSTED_WITHOUT_LICENSE"); // codespell:ignore
  // oxfmt-ignore
  assert.equal(respell("normaliseTags(x)", "normalise", "normalize", none, true), "normalizeTags(x)"); // codespell:ignore
  // A shared package's export keeps its name; the prose beside it is fixed.
  // oxfmt-ignore
  assert.equal(respell("normaliseTags normalise", "normalise", "normalize", none, false), "normaliseTags normalize"); // codespell:ignore
  // PLANT: the stored value stays, the word in the sentence does not.
  // oxfmt-ignore
  assert.equal(respell('status === "cancelled" was cancelled', "cancelled", "canceled", /"cancelled"/g, true), 'status === "cancelled" was canceled'); // codespell:ignore
});
