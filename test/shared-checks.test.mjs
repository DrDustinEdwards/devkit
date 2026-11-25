// The shared-code check's lint, job-owner and base-comparison rules.

import assert from "node:assert/strict";
import test from "node:test";

import { againstBase } from "../bin/shared.mjs";
import { isWarning } from "../bin/shared/core.mjs";
import { checkJobs } from "../bin/shared/jobs.mjs";
import { FORMAT_CHECK_SCRIPT, LINT_SCRIPT, checkLint } from "../bin/shared/workflows.mjs";
import { tree } from "./fixtures/shared.mjs";

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

test("PLANT: on a pull request a failure the base already has is a warning, and one the change adds still fails", () => {
  const old = {
    check: "copies",
    file: "app/a.ts",
    line: 3,
    message: "escapeHtml copies site-runtime ./html",
  };
  const added = {
    check: "copies",
    file: "app/b.ts",
    line: 9,
    message: "escapeHtml copies site-runtime ./html",
  };
  const judged = againstBase([{ ...old, line: 7 }, added], [old]);
  assert.deepEqual(
    judged.map((f) => [f.file, isWarning(f)]),
    [
      ["app/a.ts", true],
      ["app/b.ts", false],
    ],
  );
  assert.match(judged[0].message, /already on the base branch/);
  // A warning on the base excuses nothing: only a failure there is the repository's state.
  assert.equal(isWarning(againstBase([added], [{ ...added, warn: true }])[0]), false);
});
