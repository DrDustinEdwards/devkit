// Holds the shared code-map workflow to what lets a public repository call it safely: only callable, the script it runs equal
// to scripts/code-map.mjs, every action pinned, and the write token used by one step, which pushes one file to the code-map
// branch and nowhere else. The caller's own code (install, coverage) never sees the token.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { callerProblems } from "../scripts/check-callers.mjs";
import { inlined } from "../scripts/inline-rollback-guard.mjs";

const text = readFileSync(new URL("../.github/workflows/code-map.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
const steps = code
  .slice(code.indexOf("    steps:\n") + "    steps:\n".length)
  .split(/\n(?=      - )/)
  .map((s) => s.trimEnd());

test("it is only callable", () => {
  const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
  assert.match(on, /workflow_call:/);
  assert.doesNotMatch(on, /workflow_dispatch|pull_request|push:|schedule:/);
});

test("it carries scripts/code-map.mjs byte for byte", () => {
  assert.equal(inlined(text, "CODE_MAP"), readFileSync(new URL("../scripts/code-map.mjs", import.meta.url), "utf8"));
});

test("every action is pinned to a full commit sha, and checkout keeps no credential", () => {
  const uses = [...code.matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length >= 2);
  for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, ref);
  assert.match(code, /persist-credentials: false/);
});

test("the token writes contents only, and only the publish step holds it", () => {
  assert.match(text, /\npermissions:\n {2}contents: read\n/);
  assert.deepEqual([...code.matchAll(/(\S+): write\b/g)].map((m) => m[1]), ["contents"]);
  const holders = steps.filter((s) => /github\.token|secrets\./.test(s)).map((s) => /name: (.*)/.exec(s)?.[1]);
  assert.deepEqual(holders, ["Publish to the code-map branch"]);
});

test("the publish step pushes to the code-map branch and no other ref", () => {
  const publish = steps.find((s) => s.includes("name: Publish to the code-map branch")) ?? "";
  const pushes = [...publish.matchAll(/git[^\n]*\bpush\b[^\n\\]*(?:\\\n[^\n\\]*)*/g)].map((m) => m[0]);
  assert.equal(pushes.length, 1);
  assert.match(pushes[0], /code-map:refs\/heads\/code-map\s*$/);
});

test("the example caller pins a full sha and grants the write the workflow needs", () => {
  const caller = readFileSync(new URL("../examples/code-map-caller.yml", import.meta.url), "utf8");
  assert.deepEqual(callerProblems(caller, "examples/code-map-caller.yml"), []);
  assert.match(caller, /contents: write/);
});

test("a matrix caller's reports come from its own run, and then the kept run is not read", () => {
  const download = steps.find((s) => s.includes("name: Download the mutation reports")) ?? "";
  assert.match(download, /if: inputs\.mutation-artifacts != ''/);
  assert.match(download, /pattern: \$\{\{ inputs\.mutation-artifacts \}\}/);
  // No run-id, repository or token: download-artifact then reads only the calling run.
  assert.doesNotMatch(download, /run-id|repository:|github-token|token/);
  const kept = steps.find((s) => s.includes("name: Read the kept mutation run")) ?? "";
  assert.match(kept, /if: inputs\.mutation-command == '' && inputs\.mutation-artifacts == ''/);
});
