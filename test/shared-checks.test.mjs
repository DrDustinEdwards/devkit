import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkAi } from "../bin/shared/ai.mjs";
import { isWarning, staleExceptions } from "../bin/shared/config.mjs";
import { checkFakes } from "../bin/shared/fakes.mjs";
import { checkJobs } from "../bin/shared/jobs.mjs";
import { checkSpelling, respell } from "../bin/shared/spelling.mjs";

/** @param {Record<string, string>} files */
const tree = (files) => ({
  files: Object.keys(files),
  read: (/** @type {string} */ f) => files[f] ?? "",
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

/** process.env without the runner's own files, so a spawned bin writes nothing into the run that tests it. */
function ownEnv(/** @type {Record<string, string>} */ extra = {}) {
  const env = { ...process.env };
  for (const name of ["GITHUB_STEP_SUMMARY", "GITHUB_EVENT_PATH", "GITHUB_OUTPUT"])
    delete env[name];
  return { ...env, ...extra };
}

/**
 * A git repository holding `files`, with a stand-in codespell first on PATH: codespell's output for a few British words.
 * Both directories go when the test `t` ends.
 */
function repo(
  /** @type {import("node:test").TestContext} */ t,
  /** @type {Record<string, string>} */ files,
) {
  const root = mkdtempSync(join(tmpdir(), "family-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  const bin = mkdtempSync(join(tmpdir(), "codespell-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  });
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
  for (const [w] of file.matchAll(new RegExp(opt("--regex"), "g")))
    if (args.includes("--check-filenames") && words[w.toLowerCase()]) console.log(\`\${file}: \${w} ==> \${words[w.toLowerCase()]}\`), (found = true);
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

test(
  "PLANT: a British word fails at its line; a skipped path, an ignored word, a contract and a name another tool owns pass; --fix-spelling rewrites it; an ignore or contract that excused nothing is named",
  { skip: process.platform === "win32" },
  (t) => {
    const { root, PATH } = repo(t, {
      "app/a.ts": 'export const colour = "red";\nconst Licence = 1;\n', // codespell:ignore
      "app/b.ts": 'if (status === "cancelled" && job.cancelled()) favour();\n', // codespell:ignore
      "app/colour-theme.ts": "export {};\n", // codespell:ignore
      "frame/notes.md": "colour\n", // codespell:ignore
      "package-lock.json": '{ "colour": 1 }\n', // codespell:ignore
      "logo.png": "colour", // codespell:ignore
    });
    const path = process.env.PATH;
    process.env.PATH = PATH;
    try {
      const config = () => ({
        spelling: {
          skip: ["frame/**"],
          ignore: ["favour", "honour"], // codespell:ignore
          contracts: ['"cancelled"', '"gone"'], // codespell:ignore
        },
      });
      const kept = config();
      assert.deepEqual(
        checkSpelling(root, kept).map((f) => `${f.file}:${f.line} ${f.message.split(";")[0]}`),
        [
          "app/a.ts:1 colour is British", // codespell:ignore
          "app/a.ts:2 Licence is British", // codespell:ignore
          "app/colour-theme.ts:0 colour in the file name is British", // codespell:ignore
        ],
      );
      assert.deepEqual(
        staleExceptions(kept).map((f) => f.message.split(" excuses")[0]),
        ['"spelling" "ignore" "honour"', '"spelling" "contracts" ""gone""'], // codespell:ignore
      );
      // --fix-spelling rewrites text, never a file name: that one stays reported.
      assert.deepEqual(
        checkSpelling(root, config(), true).map((f) => f.file),
        ["app/colour-theme.ts"], // codespell:ignore
      );
      assert.equal(
        readFileSync(join(root, "app/a.ts"), "utf8"),
        'export const color = "red";\nconst License = 1;\n',
      );
      // oxfmt-ignore
      assert.equal(readFileSync(join(root, "app/b.ts"), "utf8"), 'if (status === "cancelled" && job.cancelled()) favour();\n'); // codespell:ignore
      process.env.CODESPELL_BROKEN = "1";
      assert.throws(() => checkSpelling(root, {}), /codespell failed: broken/);
    } finally {
      process.env.PATH = path;
      delete process.env.CODESPELL_BROKEN;
    }
  },
);

test("PLANT: a model call or prompt that skips the shared pieces is flagged with its checklist item; the shared way passes", () => {
  const bad = {
    "app/sdk.ts":
      'import Anthropic from "@anthropic-ai/sdk";\nconst client = new Anthropic({ apiKey });',
    "app/run.ts": "const a = await env.AI.run(MODEL, { messages, max_tokens: 300 });",
    "app/ask.ts": "export const ask = (env) => env.AI_SEARCH.chatCompletions({ messages });",
    "app/parse.ts":
      'import { messages } from "@dustinedwards/site-runtime/anthropic";\nconst json = /\\{[\\s\\S]*\\}/.exec(text);',
    "app/prompt.ts": 'const rules = ["Never use em dashes or en dashes."];',
    "app/fire.ts": 'import { fireRoutine } from "@dustinedwards/site-runtime/routine";',
  };
  const good = {
    "app/run.ts":
      "const a = await env.AI.run(MODEL, { messages, max_tokens: 300 }, { gateway, signal: AbortSignal.timeout(30_000) });",
    "app/ask.ts":
      "const late = new Promise((_, no) => setTimeout(no, 5000));\nexport const ask = (env) => Promise.race([env.AI_SEARCH.chatCompletions({ messages }), late]);",
    // site-runtime's withTimeout counts as the deadline.
    "app/ask-late.ts":
      'import { withTimeout } from "@dustinedwards/site-runtime/time";\nexport const ask = (env) => withTimeout(env.AI_SEARCH.chatCompletions({ messages }), 5000);',
    // A regex over a tool's output, in a file with no model call, and a comment naming the dash rule.
    "scripts/read.mjs": "const rows = JSON.parse(out.match(/\\[[\\s\\S]*\\]/)[0]);",
    "app/prompt.ts":
      'import { WRITING_RULES } from "@dustinedwards/site-runtime/prose";\n// Do not use em dashes: WRITING_RULES says so.\nconst system = WRITING_RULES;',
    "app/fire.ts": 'import { fireOnce } from "@dustinedwards/site-runtime/routine";',
  };
  const found = checkAi(tree(bad), {});
  assert.deepEqual(
    found.map(
      (f) =>
        `${f.file}:${f.line} ${/^\[(\w+)\]/.exec(f.message.slice(f.message.indexOf("[")))?.[1]}`,
    ),
    [
      "app/sdk.ts:1 C1",
      "app/run.ts:1 C2",
      "app/ask.ts:1 C13",
      "app/parse.ts:2 C6",
      "app/prompt.ts:1 W5",
      "app/fire.ts:1 R2",
    ],
  );
  // The Workers AI run names what it lacks: here the timeout and the gateway, not max_tokens.
  assert.match(
    found[1].message,
    /without a timeout \(signal: AbortSignal\.timeout\(ms\), C2\), the gateway \(gateway: \{ id, metadata \}, G1\): /,
  );
  assert.ok(found.every((f) => !isWarning(f)));
  assert.deepEqual(checkAi(tree(good), {}), []);
  assert.deepEqual(
    checkAi(tree({ "app/fire.ts": bad["app/fire.ts"] }), {
      copies: { "app/fire.ts": "its own guard, moving in R3" },
    }),
    [],
  );
});

test("PLANT: a test with a fake devkit ships warns, naming the helper; using devkit's, or a stub for one case, passes", () => {
  const found = checkFakes(
    tree({
      "test/github.test.ts":
        'globalThis.fetch = async (url) => {\n  if (url.endsWith("/repos/o/r/contents/a.md")) return Response.json({ sha });\n};\n',
      "test/access.test.ts":
        'const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048 }, true, ["sign"]);\nconst certs = { keys: [jwk] };\n',
      "test/setup.ts":
        'beforeEach(() => {\n  vi.stubGlobal("fetch", async (input) => {\n    throw new Error(`no network in tests: ${input}`);\n  });\n});\n',
      "test/db.test.ts":
        'await env.DB.batch([\n  env.DB.prepare("DELETE FROM posts"),\n  env.DB.prepare("DELETE FROM tags"),\n  env.DB.prepare("DELETE FROM media"),\n]);\n',
      "test/loop.test.ts":
        'for (const t of ["posts", "tags"]) await env.DB.prepare(`DELETE FROM ${t}`).run();\n',
      "test/trees.test.ts":
        'vi.stubGlobal("fetch", async (url) => (String(url).includes("/repos/o/r/git/trees/") ? tree : ok));\n',
      "test/rsa.test.ts":
        'const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });\nserve("/cdn-cgi/access/certs", keys);\n',
      "test/rsa2.test.ts":
        'const k = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5"}, true, ["sign"]);\nconst set = { keys: [{ ...publicJwk }] };\n',
      // devkit's own helpers, a failure stubbed for one case, and a delete of some rows are not fakes.
      "test/uses.test.ts":
        'import { refuseNetwork } from "@dustinedwards/devkit/network";\nimport { resetDb } from "@dustinedwards/devkit/d1";\nvi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));\nawait db.prepare("DELETE FROM posts WHERE id = ?").run();\n',
      "app/db.ts":
        'db.prepare("DELETE FROM a");\ndb.prepare("DELETE FROM b");\ndb.prepare("DELETE FROM c");\n',
    }),
    {},
  );
  assert.deepEqual(
    found.map(
      (f) =>
        `${f.file}:${f.line} ${f.message.split("use devkit ")[1].split(",")[0]} ${isWarning(f)}`,
    ),
    [
      "test/github.test.ts:2 ./github stubGitHub false",
      "test/access.test.ts:1 ./access stubAccess false",
      "test/setup.ts:2 ./network refuseNetwork false",
      "test/db.test.ts:2 ./d1 resetDb false",
      "test/loop.test.ts:1 ./d1 resetDb false",
      "test/trees.test.ts:1 ./github stubGitHub false",
      "test/rsa.test.ts:1 ./access stubAccess false",
      "test/rsa2.test.ts:1 ./access stubAccess false",
    ],
  );
});

test("PLANT: a .shared.json with an unknown key or kind, or a --from missing a package, stops the check (exit 2) naming what is valid", (t) => {
  const root = mkdtempSync(join(tmpdir(), "family-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  spawnSync("git", ["init", "-q"], { cwd: root });
  const run = (/** @type {object} */ config, /** @type {string[]} */ args = []) => {
    writeFileSync(join(root, ".shared.json"), JSON.stringify(config));
    const out = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../bin/shared.mjs", import.meta.url)), ...args],
      { cwd: root, encoding: "utf8", env: ownEnv() },
    );
    return `${out.status} ${out.stdout.trim()}`;
  };
  assert.match(
    run({ wave: {} }),
    /^2 .*"wave" is no key; the valid ones are apps, waive, copies, libraries, tokens, spelling$/,
  );
  assert.match(
    run({ apps: { ".": "sitee" } }),
    /^2 .*"sitee", which is no kind; the valid ones are site, static, private, worker, package$/,
  );
  mkdirSync(join(root, "packages", "prelum"), { recursive: true });
  writeFileSync(join(root, "packages", "prelum", "package.json"), "{}");
  assert.match(
    run({ apps: { ".": "site" } }, ["--from", join(root, "packages")]),
    /^2 .*has no checkout of site-runtime, site-api, d1-dump, devkit, capsomer, enarratio$/,
  );
});

test(
  "PLANT: the bin reads every package's exports from --from checkouts, lists them, fails a copy of one, and passes a package's own; without them it says what it did not check",
  { skip: process.platform === "win32" },
  (t) => {
    const pkg = (/** @type {string} */ name, /** @type {object} */ more = {}) =>
      JSON.stringify({ name, version: "1.0.0", ...more });
    const from = repo(t, {
      "prelum/package.json": pkg("@drdustinedwards/site-helpers", {
        exports: {
          "./slug": { types: "./dist/slug.d.ts", default: "./dist/slug.js" },
          "./package.json": "./package.json",
          "./base.css": "./base.css",
        },
        bin: { "prelum-indexnow": "./bin/indexnow.mjs" },
      }),
      "prelum/dist/slug.d.ts":
        "export declare function slugify(s: string): string;\nexport { type Slug, slugOf as slugPath };\n",
      "site-runtime/package.json": pkg("@dustinedwards/site-runtime", {
        exports: { "./html": "./src/html.mjs" },
      }),
      "site-runtime/src/html.mjs":
        'export * from "./escape.mjs";\nexport * from "./attr.js";\nexport * from "./more.mjs";\nexport * from "./types.js";\n',
      "site-runtime/src/escape.mjs": "export function escapeHtml(s) {}\n",
      "site-runtime/src/attr.ts": "export function attrValue(s) {}\n",
      "site-runtime/src/more.d.mts": "export declare function moreHtml(): string;\n",
      "site-runtime/src/types.d.ts": "export declare const typesHtml: string;\n",
      // A subpath's names come from its declaration twin, or the source a dist file is built from.
      "site-api/package.json": pkg("@dustinedwards/site-api", {
        exports: { "./x": "./dist/x.js", "./w": { types: "./dist/w.d.ts" } },
      }),
      "site-api/src/x.ts": "export function apiX() {}\n",
      "site-api/src/w.ts": "export function apiW() {}\n",
      "d1-dump/package.json": pkg("@dustinedwards/d1-dump", {
        exports: {
          "./y": { import: "./y.mjs" },
          "./v": "./v.js",
          "./u": { types: "./dist/u.d.ts" },
        },
      }),
      "d1-dump/y.d.mts": "export declare function dumpY(): void;\n",
      "d1-dump/v.d.ts": "export declare function dumpV(): void;\n",
      "d1-dump/u.ts": "export function dumpU() {}\n",
      "devkit/package.json": pkg("@dustinedwards/devkit", {
        exports: { "./github": "./testing/github.mjs" },
      }),
      "devkit/testing/github.mjs": "export function stubGitHub() {}\n",
      "capsomer/package.json": pkg("capsomer", {
        exports: {
          "./behavior/*": "./components/*/behavior.mjs",
          "./react/*": "./components/*/react.mjs",
        },
      }),
      "capsomer/components/time/behavior.mjs": "export const relative = () => {};\n",
      "capsomer/tokens/scale.css": ":root {\n  --page-max: 1180px;\n}\n",
      "enarratio/package.json": pkg("enarratio", { exports: "./index.mjs" }),
      "enarratio/index.mjs": "export class ChartView {}\n",
    }).root;
    const { root, PATH } = repo(t, {
      ".shared.json": JSON.stringify({
        apps: { ".": "worker" },
        copies: { "src/gone.ts": "moved" },
      }),
      "src/index.ts":
        'import { buildSecurityHeaders } from "@dustinedwards/site-runtime/headers";\nexport function slugify(s) {}\nexport function stubGitHub() {}\n',
      "src/app.css": ":root {\n  --page-max: 1px;\n}\n",
    });
    const summary = join(root, "summary.md");
    const run = (/** @type {string[]} */ args) => {
      const out = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../bin/shared.mjs", import.meta.url)), ...args],
        {
          cwd: root,
          encoding: "utf8",
          env: ownEnv({ PATH, GITHUB_STEP_SUMMARY: summary, GITHUB_HEAD_REF: "" }),
        },
      );
      return { status: out.status, lines: out.stdout.trim().split("\n") };
    };

    const list = run(["list", "--from", from]);
    assert.equal(list.status, 0);
    for (const line of [
      "| a11y (a warning) | site, static, private | capsomer/testing expectNoAxeViolations (or @axe-core) in a browser test |",
      "## Prelum 1.0.0 (DrDustinEdwards/prelum)",
      "- `./slug`: `slugify`, `slugPath`",
      "- bins: `prelum-indexnow`",
      "- `./html`: `escapeHtml`, `attrValue`, `moreHtml`, `typesHtml`",
      "- `./x`: `apiX`",
      "- `./w`: `apiW`",
      "- `./y`: `dumpY`",
      "- `./v`: `dumpV`",
      "- `./u`: `dumpU`",
      "- `./behavior/time`: `relative`",
      "- `./react/*`: `react/time`",
      "- `./github`: `stubGitHub`",
      "- `.`: `ChartView`",
      "## site-api 1.0.0 (DrDustinEdwards/site-api)",
    ]) {
      assert.ok(list.lines.includes(line), line);
    }

    const site = run(["--from", from]);
    assert.equal(site.status, 1);
    const errors = site.lines.filter((l) => l.startsWith("::error"));
    assert.ok(
      errors.includes(
        `::error file=src/app.css,line=2::[tokens] --page-max is Capsomer's: set it there (its site layer for this site's own look), or say why in .shared.json "tokens"`,
      ),
    );
    assert.ok(
      errors.includes(
        "::error file=src/index.ts,line=2::[copies] slugify is a local copy of Prelum ./slug slugify: import it",
      ),
    );
    assert.ok(
      site.lines.includes(
        '::warning file=.shared.json::[config] "copies" "src/gone.ts" excuses nothing in this run: remove it',
      ),
    );
    assert.match(
      site.lines.at(-1) ?? "",
      /^devkit-shared: \d+ to fix \(pins 0, copies 1, libraries 0, features 0, tokens 1, spelling 0, workflows \d+, fakes 0, ai 0, lint \d+, jobs 0, config 1\)/,
    );
    assert.match(readFileSync(summary, "utf8"), /^### Shared-code check\n\npins 0, copies 1,/);

    // Prelum checking itself: its own export is its API, not a copy.
    writeFileSync(
      join(root, "package.json"),
      pkg("@drdustinedwards/site-helpers", { exports: { "./slug": "./src/index.ts" } }),
    );
    execFileSync("git", ["add", "-A"], { cwd: root });
    assert.ok(!run(["--from", from]).lines.some((l) => l.includes("[copies] slugify")));

    const local = run([]);
    assert.ok(
      local.lines.includes(
        "::warning::[config] not installed here: site-runtime, site-api, d1-dump, devkit, capsomer, enarratio, so copies of their exports and Capsomer's tokens were not checked and no exception was judged stale; npm install, or --from <dir> of checkouts (CI reads them all)",
      ),
    );
  },
);

test("PLANT: an MCP tool for a job another owner holds fails, renamed or not; the owner's own, a site's own job and an excused tool pass", () => {
  const tools = [
    'import { adminMcpWorker } from "@dustinedwards/site-runtime/admin-mcp";',
    "export const TOOLS = [",
    '  { name: "site_backup_media", config: { title: "Back up now" }, handler: (env) => operate(env, "backup_media") },',
    '  { name: "site_sync_files", config: { title: "Copy the files now" }, handler: (env) => api(env, { path: "/backup/media" }) },',
    '  { name: "site_save_post", config: { title: "Save a post" }, handler: (env) => api(env, { path: "/posts" }) },',
    '  { name: "site_get_health", config: { title: "Read the platform snapshot" }, handler: (env) => api(env, { path: "/health" }) },',
    '  { name: "site_publish_club_pick", config: { title: "Publish a club pick" }, handler: (env) => api(env, { path: "/clubs/picks" }) },',
    "];",
  ].join("\n");
  const files = { "package.json": "{}", "mcp/package.json": "{}", "mcp/src/tools.ts": tools };
  assert.deepEqual(
    checkJobs(tree(files), {}, "site").map(
      (f) =>
        `${f.file}:${f.line} ${f.message.split(",")[0]} ${isWarning(f, "0.27.0")} ${isWarning(f, "0.28.0")}`,
    ),
    [
      "mcp/src/tools.ts:3 site_backup_media serves backups true false",
      "mcp/src/tools.ts:4 site_sync_files serves backups true false",
      "mcp/src/tools.ts:5 site_save_post serves writing false false",
    ],
  );
  assert.deepEqual(
    checkJobs(tree(files), {}, "carrel").map((f) => f.message.split(",")[0]),
    ["site_backup_media serves backups", "site_sync_files serves backups"],
  );
  assert.deepEqual(
    checkJobs(tree(files), { copies: { "mcp/src/tools.ts#site_save_post": "why" } }, "site").length,
    2,
  );
});
