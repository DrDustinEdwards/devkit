import assert from "node:assert/strict";
import test from "node:test";

import { isWarning } from "../bin/shared/config.mjs";
import { FEATURES } from "../bin/shared/data.mjs";
import { checkFeatures } from "../bin/shared/features.mjs";
import { FORMAT_CHECK_SCRIPT, LINT_SCRIPT, checkLint } from "../bin/shared/lint.mjs";
import { checkTokens } from "../bin/shared/tokens.mjs";
import { WORKFLOWS, checkWorkflows } from "../bin/shared/workflows.mjs";

const SHA_V2 = "2".repeat(40);
/** @param {Record<string, string>} files */
const tree = (files) => ({
  files: Object.keys(files),
  read: (/** @type {string} */ f) => files[f] ?? "",
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

test("a site's own value for a Capsomer token, or its own files for the family's faces, fails; using them, setting one for one part of the page, or a waiver passes", () => {
  const tokens = new Set(["--page-max", "--radius-m", "--text"]);
  const found = checkTokens(
    tree({
      "app/app.css":
        ":root {\n  --page-max: 1180px;\n  --mine: 1px;\n}\n.panel { --text: white; max-width: var(--page-max); }\n/* --radius-m: 0 */\n",
      "app/site.ts": "const CSS = `:root { --radius-m: 0; }`;\n",
      "app/theme.css":
        "@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n    --text: #fff;\n  }\n}\n",
      "app/a.test.ts": "const t = `:root { --text: red }`;\n",
      "app/build.mjs":
        'const FONTS = [\n  "@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-600-normal.woff2",\n];\n',
      "app/fonts.css":
        '@font-face {\n  font-family: "Martian Mono";\n  src: url(m.woff2);\n}\n.code { font-family: "Martian Mono", monospace; }\n',
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
    "blog/app/root.tsx":
      'import "capsomer/base.css";\n<link type="application/feed+json" rel="alternate" href="/feed.json" />',
    "blog/wrangler.jsonc": '{ "kv_namespaces": [] }',
    "news/e2e/pages.spec.ts": 'import AxeBuilder from "@axe-core/playwright";',
    "news/src/carrel.ts": `${indexnow}createSiteApi({});`,
    "news/src/feed.ts": "export const loader = () => rssDocument(posts);",
    "news/build.mjs":
      'const dir = dirname(require.resolve("capsomer/package.json"));\ncopyFileSync(join(dir, "css/base.css"), out);',
    "docs/test/a11y.test.ts": 'import AxeBuilder from "@axe-core/playwright";',
    "docs/src/feed.ts":
      'return new Response(xml, { headers: { "Content-Type": "application/atom+xml" } });\n// <link rel="alternate" type="application/atom+xml">',
    "docs/src/root.ts": 'import "capsomer/base.css";',
    "specimen/build.mjs":
      'import { capsomerStylesheet } from "capsomer/build";\nwriteFileSync(out, capsomerStylesheet({ family: "teal" }));',
    "specimen/test/a11y.test.ts": 'import AxeBuilder from "@axe-core/playwright";',
  };
  const found = checkFeatures(tree(files), {
    apps: { ".": "site", blog: "site", news: "static", docs: "static", specimen: "static" },
  }).filter((f) => /noindex|createSiteApi|accessibility|feed|D1|no capsomer/.test(f.message));
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
  const files = {
    "mcp/package.json": "{}",
    "mcp/wrangler.jsonc": "{}",
    "mcp/src/index.ts": 'import { routeMcpEra } from "@dustinedwards/site-runtime/mcp-server";',
  };
  const missing = (/** @type {Record<string, string>} */ more, config = {}) =>
    checkWorkflows(
      tree({ ...files, ...more }),
      { apps: { ".": "static", mcp: "worker" }, ...config },
      { self: "prelum", private: false },
    ).map((f) => f.message.split("devkit's ")[1].split(".yml")[0]);
  assert.deepEqual(
    missing({}),
    WORKFLOWS.map((w) => w.name),
  );
  const calls = WORKFLOWS.filter((w) => !["no-bloat", "worker-deploy"].includes(w.name)).map(
    (w) => `      uses: DrDustinEdwards/devkit/.github/workflows/${w.name}.yml@${SHA_V2}`,
  );
  const ci = {
    // A comment naming a workflow is no call.
    ".github/workflows/ci.yml": `jobs:\n  a:\n${calls.join("\n")}\n  # uses: DrDustinEdwards/devkit/.github/workflows/worker-deploy.yml@${SHA_V2}\n  b:\n    steps:\n      - run: npm run check\n`,
    "package.json": JSON.stringify({
      scripts: { check: "npm run check:bloat && tsc", "check:bloat": "devkit-no-bloat" },
    }),
  };
  assert.deepEqual(missing(ci), ["worker-deploy"]);
  // PLANT: a no-bloat step that cannot fail its job is a report, and a report lets a new copy merge.
  const report = {
    ...ci,
    ".github/workflows/ci.yml": ci[".github/workflows/ci.yml"].replace(
      "      - run: npm run check\n",
      "      - name: Bloat\n        continue-on-error: true\n        run: npm run check\n      - run: npm test\n",
    ),
  };
  assert.deepEqual(missing(report), ["worker-deploy", "no-bloat"]);
  assert.deepEqual(
    missing(ci, { waive: { "workflow:worker-deploy": "Workers Builds deploys it" } }),
    [],
  );
  // devkit calls its own by path, and a reusable workflow it ships for others is no call; locally no-bloat only warns.
  const devkit = checkWorkflows(
    tree({
      ".github/workflows/ci.yml": "jobs:\n  a:\n    uses: ./.github/workflows/checks.yml\n",
      ".github/workflows/workflow-audit.yml": `on:\n  workflow_call:\njobs:\n  a:\n    uses: DrDustinEdwards/devkit/.github/workflows/workflow-audit.yml@${SHA_V2}\n`,
      "wrangler.jsonc": "{}",
      "test/fixtures/site/wrangler.jsonc": "{}",
      "src/a.ts": "",
    }),
    { apps: { ".": "worker", "test/fixtures/site": "site" } },
    { self: "devkit" },
  );
  assert.deepEqual(
    devkit.map(
      (f) =>
        `${f.message.split(" calls")[0]} ${f.message.split("devkit's ")[1].split(".yml")[0]} ${isWarning(f, "0.21.0")}`,
    ),
    [
      "every repository workflow-audit false",
      "every repository dependencies false",
      "every repository review true",
      "a repository with a Worker (the root) worker-size false",
      "a repository with a Worker (the root) worker-deploy true",
      "a public repository with JavaScript or TypeScript no-bloat true",
      "a shared package other repositories pin bump-consumers false",
    ],
  );
  assert.match(
    devkit[5].message,
    /\(a warning here: only Actions says whether this repository is public\)$/,
  );
});

test("PLANT: a pr.yml call counts as each pull request check its inputs leave on, and a separate caller still on pull requests beside it is told to go", () => {
  const files = { "wrangler.jsonc": "{}", "src/a.ts": "" };
  const pr = (/** @type {string} */ inputs) =>
    `on:\n  pull_request:\njobs:\n  checks:\n    uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${SHA_V2}\n    with:\n${inputs}`;
  const run = (/** @type {Record<string, string>} */ more) =>
    checkWorkflows(tree({ ...files, ...more }), { apps: { ".": "site" } }, { private: false });
  // Only the pull request checks; scorecard and worker-deploy are other callers'.
  const names = (/** @type {ReturnType<typeof run>} */ found) =>
    found
      .map((f) => f.message.split("devkit's ")[1].split(".yml")[0])
      .filter((name) => !["scorecard", "worker-deploy"].includes(name));
  assert.deepEqual(
    names(run({ ".github/workflows/checks.yml": pr("      no-bloat-prepare: npm run build\n") })),
    [],
  );
  // A comment is no input; `worker-size: false` and `node: false` turn checks off.
  assert.deepEqual(
    names(
      run({
        ".github/workflows/checks.yml": pr("      # no-bloat: false\n      worker-size: false\n"),
      }),
    ),
    ["worker-size"],
  );
  assert.deepEqual(names(run({ ".github/workflows/checks.yml": pr("      node: false\n") })), [
    "worker-size",
    "no-bloat",
  ]);
  const twice = run({
    ".github/workflows/checks.yml": pr("      review: true\n"),
    ".github/workflows/no-bloat.yml": `on:\n  pull_request:\njobs:\n  a:\n    uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${SHA_V2}\n`,
    // Only a schedule: dependencies' daily scan stays.
    ".github/workflows/dependencies.yml": `on:\n  schedule:\n    - cron: "1 2 * * *"\njobs:\n  a:\n    uses: DrDustinEdwards/devkit/.github/workflows/dependencies.yml@${SHA_V2}\n`,
  }).filter((f) => f.file !== ".github/workflows");
  assert.deepEqual(
    twice.map((f) => `${f.file} ${isWarning(f, "0.26.0")} ${isWarning(f, "0.27.0")}`),
    [".github/workflows/no-bloat.yml true false"],
  );
});

test("PLANT: a repository with stylesheets needs a .css-vars.json and pr.yml's css-vars left on", () => {
  const pr = (/** @type {string} */ inputs) =>
    `on:\n  pull_request:\njobs:\n  checks:\n    uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${SHA_V2}\n    with:\n${inputs}`;
  const css = (/** @type {Record<string, string>} */ files, config = {}) =>
    checkWorkflows(tree({ "app/app.css": "a { color: red }", ...files }), {
      apps: { ".": "site" },
      ...config,
    })
      .filter((f) => f.message.includes("css-vars"))
      .map((f) => `${f.file} ${isWarning(f, "0.33.0")} ${isWarning(f, "0.34.0")}`);
  const on = { ".github/workflows/checks.yml": pr("      review: true\n") };
  assert.deepEqual(css(on), [".css-vars.json true false"]);
  assert.deepEqual(css({ ...on, ".css-vars.json": "{}" }), []);
  assert.deepEqual(
    css({ ".github/workflows/checks.yml": pr("      css-vars: false\n"), ".css-vars.json": "{}" }),
    [".github/workflows true false"],
  );
  assert.deepEqual(css(on, { waive: { "workflow:css-vars": "no custom properties" } }), []);
  // A stylesheet under a test fixture is no stylesheet of the repository's.
  assert.deepEqual(
    checkWorkflows(tree({ "test/fixtures/a.css": "" }), { apps: { ".": "site" } }).filter((f) =>
      f.message.includes("css-vars"),
    ),
    [],
  );
});

test("PLANT: a repository off the shared Oxlint or Oxfmt config is told each missing piece, as a warning until 0.25.0; the shared setup passes", () => {
  const good = {
    "app/root.tsx": "export default function App() {}",
    "oxlint.config.ts": 'import { base, react } from "@dustinedwards/devkit/oxlint";',
    "oxfmt.config.ts": 'import { format } from "@dustinedwards/devkit/oxfmt";',
    "package.json": JSON.stringify({
      scripts: { lint: LINT_SCRIPT, "format:check": FORMAT_CHECK_SCRIPT },
    }),
    ".github/workflows/ci.yml": "steps:\n  - run: npm run lint\n  - run: npm run format:check\n",
  };
  assert.deepEqual(checkLint(tree(good), {}), []);
  const bad = checkLint(
    tree({
      "app/root.tsx": good["app/root.tsx"],
      "oxlint.config.ts": 'import { defineConfig } from "oxlint";',
      "biome.json": "{}",
      "apps/mobile/eslint.config.js": "",
      ".prettierrc": "{}",
      "oxfmt.config.ts": good["oxfmt.config.ts"],
      "package.json": JSON.stringify({
        scripts: { lint: "biome check .", "format:check": FORMAT_CHECK_SCRIPT },
      }),
      ".github/workflows/ci.yml": "steps:\n  - run: npm run lint:cf # npm run lint\n",
    }),
    {},
  );
  assert.deepEqual(
    bad.map((f) => f.file),
    [
      "oxlint.config.ts",
      "package.json",
      ".github/workflows",
      ".github/workflows",
      "biome.json",
      "apps/mobile/eslint.config.js",
      ".prettierrc",
    ],
  );
  assert.ok(bad.every((f) => isWarning(f, "0.24.0") && !isWarning(f, "0.25.0")));
  assert.deepEqual(
    checkLint(tree({ "README.md": "" }), {}),
    [],
    "no JavaScript or TypeScript, nothing to lint",
  );
});
