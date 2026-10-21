// Holds the shared deploy, verify and rollback workflow to capsid's pipeline, which it ports, and to the names capsid's
// watcher reads (src/deploy-outcomes.ts in capsid): the job "live gate", the step "Roll back the deploy this run shipped" and
// the three ::error:: sentences. A rename here blinds the watcher, so each is asserted byte for byte.
//
// Two kinds of case. Text cases read the workflow as the runner reads it. Run cases take the bash of
// the live gate's steps out of the file and run it, with curl, npx and sleep replaced by stubs on PATH, so a planted failing
// verify is seen to roll back, a rerun is seen to decline, and a rollback that never moves the sha is seen to fail.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { callerProblems } from "../scripts/check-callers.mjs";
import { inlined } from "../scripts/inline-rollback-guard.mjs";

const text = readFileSync(new URL("../.github/workflows/worker-deploy.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");

/** One job's text, from its key to the next job or the end. @param {string} key */
const job = (key) => {
  const start = text.indexOf(`\n  ${key}:\n`);
  assert.ok(start > -1, `a job ${key}`);
  const next = text.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
};

/** One step's text, from its `- name:` or `- uses:` to the next step. @param {string} name */
const step = (name) => {
  const start = text.indexOf(`      - name: ${name}\n`);
  assert.ok(start > -1, `a step named "${name}"`);
  const next = text.slice(start + 1).search(/\n {6}- |\n {2}[\w-]+:\n/);
  return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
};

/** A step's `run: |` block, dedented, as bash receives it. @param {string} name */
const script = (name) => {
  const s = step(name);
  const lines = s.slice(s.indexOf("run: |\n") + "run: |\n".length).split("\n");
  // The block ends at the first line indented less than its own ten spaces (a comment before the next step).
  const end = lines.findIndex((line) => line !== "" && !line.startsWith(" ".repeat(10)));
  return `${(end === -1 ? lines : lines.slice(0, end))
    .map((line) => line.slice(10))
    .join("\n")
    .trimEnd()}\n`;
};

const LIVE_GATE = "live gate";
const ROLLBACK = "Roll back the deploy this run shipped";
const ROLLED_BACK = `echo "::error::rolled back: was \${ROLLBACK_FROM} (this run's commit \${GITHUB_SHA}), now \${ROLLBACK_TO}. master still points at the bad commit; land a fix or revert it."`;
const NOT_ROLLING = `echo "::error::not rolling back. master and production may disagree; a human decides."`;
const NO_EFFECT = `echo "::error::the rollback did not take effect: /health still reports \${ROLLBACK_TO} after 20 reads (this run's commit \${GITHUB_SHA}). Production may still be serving the refused deploy; a human decides."`;

// capsid's watcher, src/deploy-outcomes.ts: the regexes outcomeFrom reads the annotations with.
const WATCHER = {
  rolledBack: /rolled back: was (\S+) \(this run's commit \S+\), now ([^.\s]+)/,
  declined: /not rolling back/,
  noEffect: /the rollback did not take effect: \/health still reports (\S+)/,
  rollbackStep: /^Roll back/i,
};

test("it is only callable, with a read-only token", () => {
  const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
  assert.match(on, /workflow_call:/);
  assert.doesNotMatch(on, /workflow_dispatch|pull_request:|push:|schedule:/);
  assert.match(text, /\npermissions:\n {2}contents: read\n/);
  assert.doesNotMatch(code, /: write\b/);
});

test("the inputs and the two secrets the job names", () => {
  for (const input of ["worker-name", "health-url", "verify-command", "node-version-file", "working-directory", "pre-deploy"]) {
    assert.match(text, new RegExp(`\\n {6}${input}:\\n`), input);
  }
  for (const secret of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    assert.match(text, new RegExp(`\\n {6}${secret}:\\n {8}required: true\\n`), secret);
  }
});

test("THE NAMES CAPSID'S WATCHER READS: the job, the step and the three annotations, byte for byte", () => {
  assert.match(job("live"), /\n {4}name: live gate\n/, `the job is no longer named "${LIVE_GATE}"`);
  assert.match(text, new RegExp(`\\n {6}- name: ${ROLLBACK}\\n`), `the step is no longer named "${ROLLBACK}"`);
  assert.match(ROLLBACK, WATCHER.rollbackStep);
  const rollback = step(ROLLBACK);
  for (const sentence of [ROLLED_BACK, NOT_ROLLING, NO_EFFECT]) assert.ok(rollback.includes(sentence), `the annotation changed: ${sentence}`);
  assert.ok(rollback.includes(`echo "rollback_from=\${ROLLBACK_FROM} rollback_to=\${ROLLBACK_TO}" >> "$GITHUB_STEP_SUMMARY"`), "the step summary lost rollback_from= and rollback_to=");
});

test("every action is pinned to a full commit sha, and no checkout keeps credentials", () => {
  const uses = [...code.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 4);
  for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, ref);
  const checkouts = code.split("\n").filter((line) => line.includes("actions/checkout@")).length;
  assert.equal([...code.matchAll(/persist-credentials: false/g)].length, checkouts);
});

test("wrangler is pinned to one exact version, and the deploy and the rollback both use it", () => {
  const pinned = /\nenv:\n {2}WRANGLER_VERSION: "(\d+\.\d+\.\d+)"\n/.exec(text);
  assert.ok(pinned, "WRANGLER_VERSION is not an exact version");
  assert.match(step("Deploy"), /npx --yes "wrangler@\$\{WRANGLER_VERSION\}" "\$\{args\[@\]\}"/);
  assert.match(step(ROLLBACK), /npx --yes "wrangler@\$\{WRANGLER_VERSION\}" rollback --name "\$WORKER"/);
  // No other wrangler, floating or pinned elsewhere.
  assert.deepEqual([...code.matchAll(/wrangler@(\S+)/g)].map((m) => m[1]), ['${WRANGLER_VERSION}"', '${WRANGLER_VERSION}"']);
});

test("caller input reaches a shell only through the environment, never spliced into the script", () => {
  for (const name of ["Install", "Pre-deploy guard", "Deploy", "Write the rollback guard", "verify:live", ROLLBACK]) {
    const s = step(name);
    assert.doesNotMatch(s.slice(s.indexOf("run:")), /\$\{\{/, name);
  }
});

test("the Cloudflare secrets reach only the pre-deploy guard, the deploy and the rollback", () => {
  const holders = [...text.matchAll(/\n {6}- name: (.+)\n[\s\S]*?(?=\n {6}- |\n {2}[\w-]+:\n|$)/g)]
    .filter((m) => m[0].includes("secrets.CLOUDFLARE_API_TOKEN"))
    .map((m) => m[1]);
  assert.deepEqual(holders, ["Pre-deploy guard", "Deploy", ROLLBACK]);
  assert.doesNotMatch(step("verify:live"), /secrets\./);
});

test("the deploy job publishes the attempt it shipped in, and never deploys a pull request", () => {
  const deploy = job("deploy");
  assert.match(deploy, /\n {4}outputs:\n {6}attempt: \$\{\{ github\.run_attempt \}\}\n/, "the deploy job does not publish its attempt");
  assert.match(deploy, /\n {4}if: github\.event_name != 'pull_request' && github\.event_name != 'pull_request_target'\n/);
  assert.match(job("live"), /\n {4}if: github\.event_name != 'pull_request' && github\.event_name != 'pull_request_target' && !failure\(\) && !cancelled\(\)\n/);
  assert.ok(step("Pre-deploy guard").length && deploy.indexOf("- name: Pre-deploy guard") < deploy.indexOf("- name: Deploy"), "the guard runs after the deploy");
});

test("the rollback runs on a refusal only, calls the guard before wrangler, reads /health without -f, and checks the sha moved", () => {
  const body = step(ROLLBACK);
  assert.match(body, /if: failure\(\) && needs\.deploy\.result == 'success' && steps\.verify\.outputs\.exit_code == '1'\n/);
  assert.match(text, /- name: verify:live\n\s+id: verify\n/, "the verify step has no id, so its exit code cannot be read");
  assert.match(step("verify:live"), /echo "exit_code=\$\{code\}" >> "\$GITHUB_OUTPUT"/);
  const guardAt = body.indexOf('node "$GUARD" "${ROLLBACK_FROM}"');
  const rollbackAt = body.indexOf("rollback --name");
  assert.ok(guardAt > -1 && rollbackAt > -1 && guardAt < rollbackAt, "the guard does not run before the rollback");
  assert.doesNotMatch(body, /curl -f/);
  assert.match(body, /"\$\{DEPLOY_ATTEMPT\}" "\$\{GITHUB_RUN_ATTEMPT\}"/, "the guard is not told which attempt deployed");
  assert.match(body, /DEPLOY_ATTEMPT: \$\{\{ needs\.deploy\.outputs\.attempt \}\}/);
  assert.match(body, /"\$GUARD" --after/);
  assert.match(body, /did not take effect[\s\S]*exit 1/);
});

test("the guard the workflow runs is scripts/rollback-guard.mjs byte for byte (regenerate: node scripts/inline-rollback-guard.mjs)", () => {
  const guard = readFileSync(new URL("../scripts/rollback-guard.mjs", import.meta.url), "utf8");
  assert.equal(inlined(text), guard);
});

test("a gate: nothing continues on error", () => {
  assert.doesNotMatch(code, /continue-on-error/);
});

test("the example caller passes the pin check and names its secrets", () => {
  const caller = readFileSync(new URL("../examples/worker-deploy-caller.yml", import.meta.url), "utf8");
  assert.deepEqual(callerProblems(caller), []);
  assert.match(caller, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(caller, /cancel-in-progress: false/, "a caller must never cancel a deploy in flight");
});

// Run cases.

const THIS_RUN = "4df127439ed3aa19aef8e350ab6311957b8f8611";
const PREVIOUS = "376eecb3bc27c6d744de35453cfad7a08bdc1d5f";
const health = (/** @type {string} */ sha) => JSON.stringify({ ok: true, sha });

/**
 * Runs one live-gate step's bash as the runner would (bash -e -o pipefail), with stubs for curl (answering the queued /health
 * bodies in order, then the last one; NOANSWER is a refused connection), npx (recorded, never run) and sleep.
 * @param {string} name
 * @param {{ health: string[], env?: Record<string, string>, dir?: string }} opts
 */
function runStep(name, opts) {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), "worker-deploy-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(dir, "health"), `${opts.health.join("\n")}\n`);
  writeFileSync(join(dir, "reads"), "0");
  const stub = (/** @type {string} */ file, /** @type {string} */ body) => {
    writeFileSync(join(bin, file), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, file), 0o755);
  };
  stub(
    "curl",
    [
      `n=$(( $(cat "${dir}/reads") + 1 )); echo "$n" > "${dir}/reads"`,
      `line=$(sed -n "\${n}p" "${dir}/health"); [ -n "$line" ] || line=$(tail -n 1 "${dir}/health")`,
      `if [ "$line" = NOANSWER ]; then echo "curl: (7) Failed to connect" >&2; exit 7; fi`,
      `printf '%s' "$line"`,
    ].join("\n"),
  );
  stub("npx", `echo "$*" >> "${dir}/npx.log"`);
  stub("sleep", "exit 0");
  for (const file of ["output", "summary"]) writeFileSync(join(dir, file), "");
  writeFileSync(join(dir, "step.sh"), script(name));
  const result = spawnSync("bash", ["-e", "-o", "pipefail", join(dir, "step.sh")], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: join(dir, "output"),
      GITHUB_STEP_SUMMARY: join(dir, "summary"),
      GITHUB_SHA: THIS_RUN,
      GITHUB_RUN_ATTEMPT: "1",
      WRANGLER_VERSION: /WRANGLER_VERSION: "(.+)"/.exec(text)?.[1] ?? "",
      HEALTH_URL: "https://sample.example.com/health",
      WORKER: "sample",
      ...opts.env,
    },
  });
  const read = (/** @type {string} */ file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : "");
  return { dir, status: result.status, stdout: result.stdout, stderr: result.stderr, output: read("output"), summary: read("summary"), npx: read("npx.log") };
}

/** A live gate with the guard written, as the job's first own step does. */
function gate() {
  const dir = mkdtempSync(join(tmpdir(), "worker-deploy-"));
  const wrote = runStep("Write the rollback guard", { health: [], dir });
  assert.equal(wrote.status, 0, wrote.stderr);
  return dir;
}

const verify = (/** @type {string} */ dir, /** @type {string[]} */ answers, /** @type {string} */ command) =>
  runStep("verify:live", { dir, health: answers, env: { EXPECT_SHA: THIS_RUN, VERIFY: command, VERIFY_POLL_ATTEMPTS: "40" } });
const rollback = (/** @type {string} */ dir, /** @type {string[]} */ answers, attempts = { deploy: "1", run: "1" }) =>
  runStep(ROLLBACK, { dir, health: answers, env: { DEPLOY_ATTEMPT: attempts.deploy, GITHUB_RUN_ATTEMPT: attempts.run } });

test("RUN: the guard step writes the guard, and a passing verify passes after /health catches up", () => {
  const dir = gate();
  try {
    assert.equal(readFileSync(join(dir, "rollback-guard.mjs"), "utf8"), readFileSync(new URL("../scripts/rollback-guard.mjs", import.meta.url), "utf8"));
    const ok = verify(dir, [health(PREVIOUS), "NOANSWER", health(THIS_RUN)], 'test "$EXPECT_SHA" = "$GITHUB_SHA" && test -n "$HEALTH_URL"');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.output, /^exit_code=0$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RUN PLANT: a failing verify refuses (exit 1), and the rollback rolls back what this run shipped", () => {
  const dir = gate();
  try {
    const refused = verify(dir, [health(THIS_RUN)], "echo 'gate 3 refused' >&2; exit 1");
    assert.equal(refused.status, 1);
    assert.match(refused.output, /^exit_code=1$/m, "the refusal is not recorded, so the rollback's if: would not run");
    const back = rollback(dir, [health(THIS_RUN), health(THIS_RUN), health(PREVIOUS)]);
    assert.equal(back.status, 0, back.stdout + back.stderr);
    assert.match(back.npx, new RegExp(`^--yes wrangler@\\d+\\.\\d+\\.\\d+ rollback --name sample --message live gate failed for ${THIS_RUN} --yes$`, "m"));
    const said = WATCHER.rolledBack.exec(back.stdout);
    assert.ok(said, `capsid's watcher cannot read: ${back.stdout}`);
    assert.deepEqual([said[1], said[2]], [THIS_RUN, PREVIOUS]);
    assert.match(back.stdout, /^::error::rolled back: was /m);
    assert.equal(back.summary, `rollback_from=${THIS_RUN} rollback_to=${PREVIOUS}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RUN: a deploy that broke /health is rolled back when it shipped in this attempt", () => {
  const dir = gate();
  try {
    const back = rollback(dir, ["<html>502 Bad Gateway</html>", health(PREVIOUS)]);
    assert.equal(back.status, 0, back.stdout + back.stderr);
    assert.match(back.npx, / rollback --name sample /);
    assert.deepEqual(WATCHER.rolledBack.exec(back.stdout)?.slice(1), ["unreadable", PREVIOUS]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RUN: THE RERUN CASE declines, rolls nothing back, and leaves the step green", () => {
  const dir = gate();
  try {
    const declined = rollback(dir, [health(PREVIOUS)], { deploy: "1", run: "2" });
    assert.equal(declined.status, 0, declined.stdout + declined.stderr);
    assert.equal(declined.npx, "", "wrangler rollback ran on a rerun");
    assert.match(declined.stdout, /^::error::not rolling back\. /m);
    assert.match(declined.stdout, WATCHER.declined);
    assert.doesNotMatch(declined.stdout, WATCHER.rolledBack);
    assert.equal(declined.summary, `rollback_skipped: live=${PREVIOUS} this_run=${THIS_RUN}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RUN: a rollback that never moves the sha fails the step and says what is still live", () => {
  const dir = gate();
  try {
    const stuck = rollback(dir, [health(THIS_RUN)]);
    assert.equal(stuck.status, 1);
    assert.match(stuck.npx, / rollback /);
    assert.equal(WATCHER.noEffect.exec(stuck.stdout)?.[1], THIS_RUN);
    assert.match(stuck.summary, /^rollback_did_not_take_effect: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RUN: a /health that never answers is exit 3, could not run, and is not a refusal", () => {
  const dir = gate();
  try {
    const silent = verify(dir, ["NOANSWER"], "exit 0");
    assert.equal(silent.status, 3);
    assert.match(silent.output, /^exit_code=3$/m);
    assert.match(silent.stdout, /could not run/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RUN: a /health that answers with another commit until the polls run out is a refusal", () => {
  const dir = gate();
  try {
    const stale = verify(dir, [health(PREVIOUS)], "exit 0");
    assert.equal(stale.status, 1);
    assert.match(stale.output, /^exit_code=1$/m);
    assert.match(stale.stdout, new RegExp(`/health reports ${PREVIOUS}, not this run's commit`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RUN: a verify command that could not run (exit 3) is recorded as such, so nothing rolls back", () => {
  const dir = gate();
  try {
    const could = verify(dir, [health(THIS_RUN)], "exit 3");
    assert.equal(could.status, 3);
    assert.match(could.output, /^exit_code=3$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
