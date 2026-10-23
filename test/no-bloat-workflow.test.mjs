// Holds the shared no-bloat workflow to what makes it safe to call from every repository: only callable, read-only, no
// secrets, and every action pinned. Text based.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { callerProblems } from "../scripts/check-callers.mjs";

const text = readFileSync(new URL("../.github/workflows/no-bloat.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
const steps = text
  .slice(text.indexOf("    steps:\n") + "    steps:\n".length)
  .split(/\n(?=      - )/)
  .map((step) => step.trimEnd());

test("the token is read-only and no secret is taken or read", () => {
  assert.match(text, /\npermissions:\n {2}contents: read\n/);
  assert.doesNotMatch(code, /: write\b/);
  assert.doesNotMatch(code, /secrets/);
});

test("caller input reaches a shell only through the environment, never spliced into the script", () => {
  for (const s of steps.filter((entry) => /\brun:/.test(entry))) {
    const run = s.slice(s.indexOf("run:"));
    assert.doesNotMatch(run, /\$\{\{/, s.split("\n")[0]);
  }
});

test("it runs the package's bin, which the package ships", () => {
  assert.match(text, /node_modules\/@dustinedwards\/devkit\/bin\/no-bloat\.mjs/);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.bin["devkit-no-bloat"], "./bin/no-bloat.mjs");
  assert.ok(pkg.files.includes("bin"));
});

test("the example caller passes the pin check", () => {
  assert.deepEqual(callerProblems(readFileSync(new URL("../examples/no-bloat-caller.yml", import.meta.url), "utf8")), []);
});
