// What every shared workflow keeps, so any repository can call it safely: it runs only when called, every action is
// pinned to a full commit sha, every file it downloads is checked against its sha256, and no checkout keeps its credentials. Text based; each workflow's own test holds the rest.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const dir = new URL("../.github/workflows/", import.meta.url);
const shared = readdirSync(dir)
  .filter((name) => name.endsWith(".yml"))
  .map((name) => ({ name, text: readFileSync(new URL(name, dir), "utf8").replace(/\r\n/g, "\n") }))
  .filter(({ text }) => /\non:\n {2}workflow_call:/.test(text));

test("the shared workflows are the ones every repository calls", () => {
  assert.deepEqual(shared.map((w) => w.name).sort(), [
    "access-drift.yml",
    "bump-consumers.yml",
    "checks.yml",
    "code-map.yml",
    "conformance.yml",
    "dependencies.yml",
    "no-bloat.yml",
    "release.yml",
    "restore-drill.yml",
    "scorecard.yml",
    "worker-deploy.yml",
    "worker-size.yml",
    "workflow-audit.yml",
  ]);
});

/** @param {string} text */
const codeOf = (text) => text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");

test("each runs only when called", () => {
  for (const { name, text } of shared) {
    const on = text.slice(text.indexOf("\non:\n") + 1).split(/\n(?=\S)/)[0];
    assert.doesNotMatch(on, /workflow_dispatch|pull_request|push:|schedule:/, name);
  }
});

test("each pins every action to a full commit sha, and no checkout keeps credentials", () => {
  for (const { name, text } of shared) {
    const uses = [...codeOf(text).matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map((m) => m[1]);
    for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, `${name}: ${ref}`);
    const checkouts = uses.filter((ref) => ref.startsWith("actions/checkout@")).length;
    assert.equal([...codeOf(text).matchAll(/persist-credentials: false/g)].length, checkouts, name);
  }
});

test("each checks every file it downloads against its sha256", () => {
  for (const { name, text } of shared) {
    for (const [, file] of codeOf(text).matchAll(/curl -\w*o (\S+) https:/g)) {
      assert.match(text, new RegExp(`^\\s*(?:echo ")?[0-9a-f]{64}  ${file.replace(/\./g, "\\.")}\\b`, "m"), `${name}: ${file}`);
    }
  }
});

test("checks.yml writes only pull requests, only on the repository's own, checks the code on every event that adds commits, and counts as the checks workflow", async () => {
  const { checkWorkflows } = await import("../bin/shared.mjs");
  const { callerProblems } = await import("../scripts/check-callers.mjs");
  const code = codeOf(readFileSync(new URL("checks.yml", dir), "utf8"));
  assert.deepEqual([...code.matchAll(/(\S+): write\b/g)].map((m) => m[1]), ["pull-requests"]);
  assert.doesNotMatch(code, /secrets|continue-on-error/);
  assert.match(code, /FOOTER: .*github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(code, /CODE: \$\{\{ github\.event_name == 'push' \|\| github\.event_name == 'merge_group' \|\| \(github\.event_name == 'pull_request' && github\.event\.action != 'edited'\) \}\}/);
  for (const run of ["node ../.devkit/bin/check-trailers.mjs", "node ../.devkit/bin/shared.mjs --from", "node .devkit/scripts/strip-pr-footer.mjs"]) assert.ok(code.includes(`run: ${run}`), run);
  const caller = readFileSync(new URL("../examples/checks-caller.yml", import.meta.url), "utf8");
  assert.deepEqual(callerProblems(caller), []);
  assert.match(caller, /permissions:\n {6}contents: read\n {6}pull-requests: write\n/);
  const files = { ".github/workflows/checks.yml": caller.replace(/0{40}/, "a".repeat(40)) };
  const missing = checkWorkflows({ files: Object.keys(files), read: (f) => files[f] }, { apps: { ".": "package" } }, { self: "prelum", private: false }).map((f) => f.message);
  assert.ok(!missing.some((m) => m.includes("devkit's checks.yml")));
});
