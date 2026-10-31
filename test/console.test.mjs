// devkit-console's count: a call in code counts, one in a comment, string or template text does not.

import assert from "node:assert/strict";
import test from "node:test";

import { compare, consoleCalls } from "../bin/console.mjs";

test("counts console calls in code only", () => {
  const source = [
    'console.log("a"); console . error(x);',
    "// console.log(1)",
    "/* console.warn(2) */",
    "const s = 'console.log(3)';",
    "const t = `console.info(${console.debug(4)})`;",
    "logger.console.log(5); myconsole.log(6);",
  ].join("\n");
  assert.equal(consoleCalls(source), 3);
});

test("a rise fails naming the file that grew; a fall asks to lower the baseline", () => {
  const baseline = { calls: 2, files: { "a.ts": 2 } };
  const up = compare(baseline, { calls: 3, files: { "a.ts": 2, "b.ts": 1 } });
  assert.equal(up.errors.length, 1);
  assert.match(up.errors[0], /b\.ts 0 → 1/);
  assert.doesNotMatch(up.errors[0], /a\.ts/);
  assert.equal(compare(baseline, { calls: 1, files: { "a.ts": 1 } }).warnings.length, 1);
});
