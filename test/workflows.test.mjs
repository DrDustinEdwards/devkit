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
    "ai-author.yml",
    "bump-consumers.yml",
    "code-map.yml",
    "dependencies.yml",
    "family.yml",
    "no-bloat.yml",
    "pr-footer.yml",
    "release.yml",
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
