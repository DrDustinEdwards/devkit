// devkit-secrets and devkit-destructive, run on planted repositories.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { BUILT_IN_SHAPES, shapesIn } from "../bin/secrets.mjs";

const bin = (/** @type {string} */ name) =>
  fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url));

/** Runs a bin in a scratch git repository holding `files`. */
function run(/** @type {string} */ name, /** @type {Record<string, string>} */ files) {
  const dir = mkdtempSync(join(tmpdir(), "node-gates-"));
  try {
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    const git = (/** @type {string[]} */ args) => spawnSync("git", args, { cwd: dir });
    git(["init", "-q"]);
    git(["add", "-A"]);
    const r = spawnSync(process.execPath, [bin(name)], { cwd: dir, encoding: "utf8" });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("secrets: the built-in shapes catch live keys and pass placeholders", () => {
  const fake = (/** @type {string} */ prefix, /** @type {number} */ n) => prefix + "a1B2".repeat(n);
  assert.deepEqual(shapesIn(`key=${fake("sk-ant-api03-", 10)}`, BUILT_IN_SHAPES), [
    "an Anthropic API key",
  ]);
  assert.deepEqual(shapesIn(`STRIPE=${fake("rk_live_", 8)}`, BUILT_IN_SHAPES), [
    "a Stripe live secret or restricted key",
  ]);
  assert.deepEqual(shapesIn(`t=${fake("ghp_", 9)}`, BUILT_IN_SHAPES), ["a GitHub token"]);
  assert.deepEqual(
    shapesIn("ANTHROPIC_API_KEY=sk-ant-... and sk_test_abc and rk_live_xxx", BUILT_IN_SHAPES),
    [],
  );
});

const secretsRepo = {
  ".gitignore": ".dev.vars\n",
  ".secrets.json": JSON.stringify({
    secrets: ["API_KEY"],
    env_types: "app/env.d.ts",
    env_exact: true,
    roots: { app: 1 },
    minimum_checks: 5,
  }),
  "app/env.d.ts": "interface Env { API_KEY: string }\n",
  "app/a.server.ts": "export const k = (env: Env) => env.API_KEY;\n",
};

test("secrets: passes a server-only read, fails a client read and an undeclared Env member", () => {
  assert.equal(run("secrets", secretsRepo).status, 0);
  const client = run("secrets", {
    ...secretsRepo,
    "app/b.tsx": "export const k = ({ API_KEY }: Env) => API_KEY;\n",
  });
  assert.equal(client.status, 1);
  assert.match(client.out, /app\/b\.tsx:1 reads API_KEY/);
  const extra = run("secrets", {
    ...secretsRepo,
    "app/env.d.ts": "interface Env { API_KEY: string; OTHER: string }\n",
  });
  assert.equal(extra.status, 1);
  assert.match(extra.out, /OTHER is a named secret/);
});

test("destructive: a binding rule fails a stray delete and an unread callee", () => {
  const repo = (/** @type {string} */ code) => ({
    ".destructive.json": JSON.stringify({
      bindings: [
        { binding: "BACKUPS", rule: "d1-dump" },
        { binding: "KEEP", rule: "no-delete", passed_to: { "app/a.ts:r2Check": "reads one key" } },
      ],
      sources: ["app"],
      minimum_checks: 10,
    }),
    "app/a.ts": `await runCheckedBackup(env.BACKUPS); await r2Check(env.KEEP);\n${code}`,
  });
  assert.equal(run("destructive", repo("")).status, 0);
  const del = run("destructive", repo("const b = env.BACKUPS; await b.delete(k);"));
  assert.equal(del.status, 1);
  assert.match(del.out, /b\.delete\(k\)/);
  const handed = run("destructive", repo("await wipe(env.KEEP);"));
  assert.equal(handed.status, 1);
  assert.match(handed.out, /handed to wipe/);
});

test("destructive: a destructive intent must call the predicate inside the action", () => {
  const route = (/** @type {string} */ body) => ({
    ".destructive.json": JSON.stringify({
      intents: {
        routes: "app/routes",
        destructive: ["x.tsx:wipe"],
        reversible: { "x.tsx:save": "an edit" },
      },
      minimum_checks: 5,
    }),
    "app/routes/x.tsx": `export async function action({ request }) {
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "save") return save();
  if (intent === "wipe") { ${body} return wipe(); }
}\n`,
  });
  assert.equal(
    run("destructive", route("if (!confirmationSatisfied(form)) return null;")).status,
    0,
  );
  const bare = run("destructive", route("// confirmationSatisfied() checked in onClick"));
  assert.equal(bare.status, 1);
  assert.match(bare.out, /x\.tsx:wipe: the confirmation is checked in the ACTION/);
});
