// The conformance gate's verdicts: a recorded count must hold exactly, in both directions, and a scenario with none
// must pass every check. The suite itself runs only against wrangler dev, locally.

import assert from "node:assert/strict";
import test from "node:test";

import { judge, summarize } from "../bin/conformance.mjs";

test("reads both summary forms the suite prints", () => {
  assert.deepEqual(summarize("...\nPassed: 24/28\n"), { passed: 24, total: 28 });
  assert.deepEqual(summarize("Total: 3 passed, 1 failed"), { passed: 3, total: 4 });
  assert.equal(summarize("crashed"), null);
});

test("a baseline fails on regress, improve and recount; no baseline means every check passes", () => {
  const want = { spec: "2026-07-28", scenario: "server-stateless", passed: 24, total: 28, note: "upstream" };
  assert.deepEqual(judge(want, { passed: 24, total: 28 }), { failed: false, line: "  BASELINE   2026-07-28  server-stateless  24/28  (upstream)" });
  assert.match(judge(want, { passed: 23, total: 28 }).line, /REGRESSED/);
  assert.match(judge(want, { passed: 25, total: 28 }).line, /IMPROVED .* tighten it/);
  assert.match(judge(want, { passed: 24, total: 29 }).line, /RECOUNT/);
  assert.equal(judge({ spec: "2025-11-25", scenario: "server-initialize" }, { passed: 2, total: 3 }).failed, true);
  assert.equal(judge({ spec: "2025-11-25", scenario: "server-initialize" }, null).failed, true);
});
