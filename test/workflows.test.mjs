// What every shared workflow keeps, so any repository can call it safely: it runs only when called, every action is
// pinned to a full commit sha (or is one of devkit's own composite actions, read at the caller's pin), every file it
// downloads is checked against its sha256, and no checkout keeps its credentials. The composite actions in
// .github/actions/ are held to the same. Text based; each workflow's own test holds the rest.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const dir = new URL("../.github/workflows/", import.meta.url);
const shared = readdirSync(dir)
  .filter((name) => name.endsWith(".yml"))
  .map((name) => ({ name, text: readFileSync(new URL(name, dir), "utf8").replace(/\r\n/g, "\n") }))
  .filter(({ text }) => /\non:\n {2}workflow_call:/.test(text));
const actionsDir = new URL("../.github/actions/", import.meta.url);
const actions = readdirSync(actionsDir).map((name) => ({
  name: `${name}/action.yml`,
  text: readFileSync(new URL(`${name}/action.yml`, actionsDir), "utf8").replace(/\r\n/g, "\n"),
}));

test("the shared workflows are the ones every repository calls", () => {
  assert.deepEqual(shared.map((w) => w.name).sort(), [
    "access-drift.yml",
    "bump-consumers.yml",
    "checks.yml",
    "code-map.yml",
    "conformance.yml",
    "dependencies.yml",
    "no-bloat.yml",
    "pr.yml",
    "release.yml",
    "restore-drill.yml",
    "review.yml",
    "scorecard.yml",
    "worker-deploy.yml",
    "worker-size.yml",
    "workflow-audit.yml",
  ]);
});

/** @param {string} text */
const codeOf = (text) =>
  text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

test("each runs only when called", () => {
  for (const { name, text } of shared) {
    const on = text.slice(text.indexOf("\non:\n") + 1).split(/\n(?=\S)/)[0];
    assert.doesNotMatch(on, /workflow_dispatch|pull_request|push:|schedule:/, name);
  }
});

test("each pins every action to a full commit sha, and no checkout keeps credentials", () => {
  for (const { name, text } of [...shared, ...actions]) {
    const uses = [...codeOf(text).matchAll(/^\s*(?:- )?uses: (\S+)/gm)]
      .map((m) => m[1])
      .filter((ref) => !ref.startsWith("./.devkit/.github/actions/"));
    for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, `${name}: ${ref}`);
    const checkouts = uses.filter((ref) => ref.startsWith("actions/checkout@")).length;
    assert.equal([...codeOf(text).matchAll(/persist-credentials: false/g)].length, checkouts, name);
  }
});

test("each checks every file it downloads against its sha256", () => {
  for (const { name, text } of [...shared, ...actions]) {
    for (const [, file] of codeOf(text).matchAll(/curl -\w*o (\S+) https:/g)) {
      assert.match(
        text,
        new RegExp(`^\\s*(?:echo ")?[0-9a-f]{64}  ${file.replace(/\./g, "\\.")}\\b`, "m"),
        `${name}: ${file}`,
      );
    }
  }
});

test("checks.yml writes only pull requests, only on the repository's own, checks the code on every event that adds commits, and counts as the checks workflow", async () => {
  const { checkWorkflows } = await import("../bin/shared.mjs");
  const { callerProblems } = await import("../scripts/check-callers.mjs");
  const code = codeOf(readFileSync(new URL("checks.yml", dir), "utf8"));
  assert.deepEqual(
    [...code.matchAll(/(\S+): write\b/g)].map((m) => m[1]),
    ["pull-requests"],
  );
  assert.doesNotMatch(code, /secrets|continue-on-error/);
  assert.match(
    code,
    /FOOTER: .*github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
  assert.match(
    code,
    /CODE: \$\{\{ github\.event_name == 'push' \|\| github\.event_name == 'merge_group' \|\| \(github\.event_name == 'pull_request' && github\.event\.action != 'edited'\) \}\}/,
  );
  for (const action of ["footer", "trailers", "shared"])
    assert.ok(code.includes(`uses: ./.devkit/.github/actions/${action}\n`), action);
  const runs = actions.map((a) => a.text).join("\n");
  for (const run of [
    'bin/check-trailers.mjs"',
    'bin/shared.mjs" --from',
    'scripts/strip-pr-footer.mjs"',
  ])
    assert.ok(runs.includes(`node "$GITHUB_ACTION_PATH/../../../${run}`), run);
  const caller = readFileSync(new URL("../examples/checks-caller.yml", import.meta.url), "utf8");
  assert.deepEqual(callerProblems(caller), []);
  assert.match(caller, /permissions:\n {6}contents: read\n {6}pull-requests: write\n/);
  const files = { ".github/workflows/checks.yml": caller.replace(/0{40}/, "a".repeat(40)) };
  const missing = checkWorkflows(
    { files: Object.keys(files), read: (f) => files[f] },
    { apps: { ".": "package" } },
    { self: "prelum", private: false },
  ).map((f) => f.message);
  assert.ok(!missing.some((m) => m.includes("devkit's checks.yml")));
});

test("pr.yml runs each check from the composite action its standalone workflow runs, after any other check failed, and fails at the end if one did", () => {
  const pr = codeOf(readFileSync(new URL("pr.yml", dir), "utf8"));
  const others = shared
    .filter((w) => w.name !== "pr.yml")
    .map((w) => codeOf(w.text))
    .join("\n");
  const steps = pr
    .split(/\n(?= {6}- )/)
    .filter((step) => step.includes("uses: ./.devkit/.github/actions/"));
  const ids = [];
  for (const step of steps) {
    const action = /uses: \.\/\.devkit\/\.github\/actions\/([\w-]+)/.exec(step)?.[1];
    assert.ok(
      others.includes(`uses: ./.devkit/.github/actions/${action}\n`),
      `${action}: no standalone workflow runs it`,
    );
    const id = /\n {8}id: ([\w-]+)/.exec(step)?.[1];
    if (action === "review") continue;
    assert.match(
      step,
      /if: \$\{\{ !cancelled\(\) && /,
      `${action} runs whatever another check did`,
    );
    if (id) ids.push(id);
  }
  const result = pr.slice(pr.indexOf("- name: Result"));
  assert.match(result, /if: \$\{\{ !cancelled\(\) \}\}/);
  for (const id of ids) assert.ok(result.includes(`steps.${id}.outcome`), `the result reads ${id}`);
  assert.match(result, /exit 1/);
  const caller = readFileSync(new URL("../examples/pr-caller.yml", import.meta.url), "utf8");
  assert.match(
    caller,
    /\njobs:\n {2}checks:\n/,
    "the job id keeps the required check's name, checks / Repo checks",
  );
  assert.match(caller, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});
