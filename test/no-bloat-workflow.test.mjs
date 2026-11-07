// Holds the shared no-bloat workflow to what makes it safe to call from every repository: no write, no secret, and no
// caller input spliced into a script. Text based; workflows.test.mjs holds it to being callable only and pinned.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = readFileSync(
  new URL("../.github/workflows/no-bloat.yml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const code = text
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");
const steps = text
  .slice(text.indexOf("    steps:\n") + "    steps:\n".length)
  .split(/\n(?=      - )/)
  .map((step) => step.trimEnd());

test("no job asks for a write and no secret is taken or read", () => {
  assert.doesNotMatch(code, /: write\b/);
  assert.doesNotMatch(code, /secrets/);
});

test("caller input reaches a shell only through the environment, never spliced into the script", () => {
  for (const s of steps.filter((entry) => /\brun:/.test(entry))) {
    const run = s.slice(s.indexOf("run:"));
    assert.doesNotMatch(run, /\$\{\{/, s.split("\n")[0]);
  }
});
