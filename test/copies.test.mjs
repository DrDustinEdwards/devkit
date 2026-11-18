import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { packageCopies, sharedNames } from "../bin/copies.mjs";

test("PLANT: a name two sites each define is counted; a re-export, a Drizzle table, a route export and a shared package's own are not", () => {
  const files = [
    {
      repo: "germomics",
      path: "app/lib/email.server.ts",
      text: 'export async function sendEmail(env, m) {}\nexport const mediaUploads = sqliteTable("media", {});\n',
    },
    {
      repo: "txasm",
      path: "app/lib/email.server.ts",
      text: 'export const sendEmail = async () => {};\nexport const mediaUploads = sqliteTable("media", {});\n',
    },
    {
      repo: "foxhound",
      path: "app/lib/mail.ts",
      text: 'export { sendEmail } from "@dustinedwards/site-runtime/email";\nexport async function clientLoader() {}\n',
    },
    { repo: "site-runtime", path: "email.mjs", text: "export async function sendEmail() {}\n" },
    { repo: "carrel", path: "app/routes/a.tsx", text: "export async function clientLoader() {}\n" },
  ];
  assert.deepEqual(sharedNames(files), [
    {
      name: "sendEmail",
      places: [
        { repo: "germomics", path: "app/lib/email.server.ts" },
        { repo: "txasm", path: "app/lib/email.server.ts" },
      ],
    },
  ]);
  const shared = [
    { repo: "site-api", path: "src/frontmatter.ts", text: "export function splitSource() {}\n" },
    { repo: "prelum", path: "frontmatter.mjs", text: "export function splitSource() {}\n" },
    { repo: "germomics", path: "app/lib/a.ts", text: "export function splitSource() {}\n" },
    { repo: "txasm", path: "app/lib/a.ts", text: "export function splitSource() {}\n" },
  ];
  // With packages: only the names two shared packages each export, not the sites' own definitions.
  assert.deepEqual(sharedNames(shared, true), [
    {
      name: "splitSource",
      places: [
        { repo: "prelum", path: "frontmatter.mjs" },
        { repo: "site-api", path: "src/frontmatter.ts" },
      ],
    },
  ]);
  assert.equal(sharedNames(shared).length, 1);
});

test("a config with no numeric baseline fails instead of passing every count", () => {
  const dir = mkdtempSync(join(tmpdir(), "copies-"));
  try {
    const config = join(dir, "copies.json");
    writeFileSync(config, JSON.stringify({ names: 1 }));
    const bin = fileURLToPath(new URL("../bin/copies.mjs", import.meta.url));
    // Without the runner's files, so the bin writes nothing into the run that tests it.
    const env = { ...process.env };
    for (const name of ["GITHUB_STEP_SUMMARY", "GITHUB_EVENT_PATH", "GITHUB_OUTPUT"])
      delete env[name];
    const r = spawnSync(process.execPath, [bin, "--config", config], { encoding: "utf8", env });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /has no numeric "baseline"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a site's .ts copy of a shared package's .mjs is found under a new name; the package's tests and the site's own unique code are not", () => {
  const body = Array.from(
    { length: 14 },
    (_, i) => `  const v${i} = input.slice(${i}, ${i + 3}).toUpperCase() + String(${i} * factor);`,
  ).join("\n");
  const root = mkdtempSync(join(tmpdir(), "package-copies-"));
  try {
    const put = (/** @type {string} */ path, /** @type {string} */ text) => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    put(
      "app/lib/format.ts",
      `export function formatLocal(input, factor) {\n${body}\n  return v0;\n}\n`,
    );
    put("app/lib/own.ts", "export const own = 1;\n");
    const pkg = "node_modules/@dustinedwards/site-runtime";
    put(`${pkg}/package.json`, "{}");
    put(`${pkg}/text.mjs`, `export function format(input, factor) {\n${body}\n  return v0;\n}\n`);
    put(
      `${pkg}/test/text.test.mjs`,
      `export function t(input, factor) {\n${body}\n  return v0;\n}\n`,
    );
    const copies = packageCopies(
      root,
      ["app/lib/format.ts", "app/lib/own.ts"],
      [{ repo: "site-runtime", dir: join(root, pkg) }],
      (args) => {
        const r = spawnSync("npx", ["--yes", "--package", "jscpd@4.3.0", "--", "jscpd", ...args], {
          cwd: root,
          encoding: "utf8",
        });
        assert.equal(r.status, 0, r.stderr);
      },
    );
    assert.deepEqual(
      copies.map(([mine, theirs]) => `${mine.path} ${theirs.repo}/${theirs.path}`),
      ["app/lib/format.ts site-runtime/text.mjs"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
