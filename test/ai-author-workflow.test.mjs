// Holds the shared trailer check's workflow to what makes it a gate every repository can call: only callable, read-only, no
// secrets, every action pinned, the full history fetched, and no step allowed to fail quietly. Text based.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { callerProblems } from "../scripts/check-callers.mjs";

const text = readFileSync(new URL("../.github/workflows/ai-author.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");

test("the token is read-only and no secret is taken or read", () => {
  assert.match(text, /\npermissions:\n {2}contents: read\n/);
  assert.doesNotMatch(code, /: write\b/);
  assert.doesNotMatch(code, /secrets/);
});

test("it reads the whole history, so every commit in the range is there", () => {
  assert.match(code, /fetch-depth: 0/);
});

test("a gate: nothing continues on error", () => {
  assert.doesNotMatch(code, /continue-on-error/);
});

test("the event reaches the check only through the environment, and a missing package fails the run", () => {
  const run = code.slice(code.lastIndexOf("run: |"));
  assert.doesNotMatch(run, /\$\{\{/);
  for (const name of ["EVENT", "PR_BASE", "PR_HEAD", "PUSH_BEFORE", "PUSH_AFTER"]) assert.match(code, new RegExp(`\\n {10}${name}: \\$\\{\\{ github\\.`));
  assert.match(run, /exit 2/);
  assert.match(run, /npx --yes --package "\$spec" devkit-check-trailers/);
});

test("the package ships the bin", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.bin["devkit-check-trailers"], "./bin/check-trailers.mjs");
});

test("the example caller passes the pin check", () => {
  assert.deepEqual(callerProblems(readFileSync(new URL("../examples/ai-author-caller.yml", import.meta.url), "utf8")), []);
});
