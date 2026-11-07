// Holds the shared deploy, verify and rollback workflow to capsid's pipeline, which it ports, and to the names capsid's
// watcher reads (src/deploy-outcomes.ts in capsid): the job "live gate", the step "Roll back the deploy this run shipped" and
// the three ::error:: sentences. A rename here blinds the watcher, so each is asserted byte for byte.
//
// Two kinds of case. Text cases read the workflow as the runner reads it. Run cases take the bash of
// the live gate's steps out of the file and run it, with curl, npx and sleep replaced by stubs on PATH, so a planted failing
// verify is seen to roll back, a rerun is seen to decline, and a rollback that never moves the sha is seen to fail.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inlined } from "../scripts/inline-rollback-guard.mjs";

const text = readFileSync(
  new URL("../.github/workflows/worker-deploy.yml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const code = text
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

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
const BOOKMARK = "Record the D1 Time Travel bookmark";
const PROMOTE = "Promote the gradual rollout";
const ERRORS = "Compare the error rates";
const PREVIEW = "Upload the preview version";
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

test("no job asks for a write", () => {
  assert.doesNotMatch(code, /: write\b/);
});

test("the inputs and the two secrets the job names", () => {
  for (const input of [
    "worker-name",
    "health-url",
    "verify-command",
    "node-version-file",
    "working-directory",
    "pre-deploy",
    "generated-secrets",
  ]) {
    assert.match(text, new RegExp(`\\n {6}${input}:\\n`), input);
  }
  for (const secret of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    assert.match(text, new RegExp(`\\n {6}${secret}:\\n {8}required: true\\n`), secret);
  }
});

test("THE NAMES CAPSID'S WATCHER READS: the job, the step and the three annotations, byte for byte", () => {
  assert.match(job("live"), /\n {4}name: live gate\n/, `the job is no longer named "${LIVE_GATE}"`);
  assert.match(
    text,
    new RegExp(`\\n {6}- name: ${ROLLBACK}\\n`),
    `the step is no longer named "${ROLLBACK}"`,
  );
  assert.match(ROLLBACK, WATCHER.rollbackStep);
  const rollback = step(ROLLBACK);
  for (const sentence of [ROLLED_BACK, NOT_ROLLING, NO_EFFECT])
    assert.ok(rollback.includes(sentence), `the annotation changed: ${sentence}`);
  assert.ok(
    rollback.includes(
      `echo "rollback_from=\${ROLLBACK_FROM} rollback_to=\${ROLLBACK_TO}" >> "$GITHUB_STEP_SUMMARY"`,
    ),
    "the step summary lost rollback_from= and rollback_to=",
  );
});

test("wrangler is pinned to one exact version, and every wrangler the workflow runs is that one", () => {
  const pinned = /\nenv:\n {2}WRANGLER_VERSION: "(\d+\.\d+\.\d+)"\n/.exec(text);
  assert.ok(pinned, "WRANGLER_VERSION is not an exact version");
  // No other wrangler, floating or pinned elsewhere. The RUN cases see the rollback call it.
  const uses = [...code.matchAll(/wrangler@(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 3);
  assert.deepEqual(new Set(uses), new Set(['${WRANGLER_VERSION}"']));
  // Generated secrets go up with the code, deploy and gradual upload alike, and only names the Worker lacks.
  const deploy = step("Deploy");
  assert.match(deploy, /args=\(deploy --name "\$WORKER" "\$\{secret_args\[@\]\}"\)/);
  assert.match(deploy, /args=\(versions upload [^\n]*"\$\{secret_args\[@\]\}"\)/);
  // The minting script itself, run as the step runs it, over what `wrangler secret list` prints (a warning line first).
  const script =
    /HAVE="\$have" node -e '\n([\s\S]*?)\n\s*' "\$secrets_file" "\$RUNNER_TEMP\/generated-names"/.exec(
      deploy,
    )?.[1];
  assert.ok(script, "the minting script moved");
  const dir = mkdtempSync(join(tmpdir(), "generated-secrets-"));
  try {
    const mint = (have, names) => {
      const run = spawnSync(process.execPath, ["-e", script, join(dir, "s.json"), join(dir, "n")], {
        encoding: "utf8",
        env: { ...process.env, HAVE: have, GENERATED_SECRETS: names },
      });
      return {
        status: run.status,
        out: run.stdout,
        secrets: JSON.parse(readFileSync(join(dir, "s.json"), "utf8")),
        names: readFileSync(join(dir, "n"), "utf8"),
      };
    };
    const held = `▲ [WARNING] proxy\n[{"name":"HELD","type":"secret_text"}]`;
    const first = mint(held, "HELD NEW_ONE");
    assert.deepEqual(
      Object.keys(first.secrets),
      ["NEW_ONE"],
      "a secret the Worker holds would be replaced",
    );
    assert.match(first.secrets.NEW_ONE, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(first.names, "NEW_ONE");
    assert.ok(
      first.out.includes(`::add-mask::${first.secrets.NEW_ONE}`),
      "the value is not masked",
    );
    assert.equal(mint("[]", "HELD").names, "HELD", "a first deploy (no secrets yet) mints");
    assert.equal(mint(held, "HELD").names, "", "nothing to mint still uploads a file");
    assert.notEqual(mint(held, "bad-name").status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("caller input reaches a shell only through the environment, never spliced into the script", () => {
  for (const name of [
    "Install",
    BOOKMARK,
    "Pre-deploy guard",
    "Deploy",
    "Write the rollback guard",
    "verify:live",
    PROMOTE,
    ROLLBACK,
    "Preview build",
    PREVIEW,
  ]) {
    const s = step(name);
    assert.doesNotMatch(s.slice(s.indexOf("run:")), /\$\{\{/, name);
  }
});

test("the Cloudflare secrets reach only the bookmark, the pre-deploy guard, the deploy and the rollback", () => {
  const holders = [...text.matchAll(/\n {6}- name: (.+)\n[\s\S]*?(?=\n {6}- |\n {2}[\w-]+:\n|$)/g)]
    .filter((m) => m[0].includes("secrets.CLOUDFLARE_API_TOKEN"))
    .map((m) => m[1]);
  assert.deepEqual(holders, [
    BOOKMARK,
    "Pre-deploy guard",
    "Deploy",
    ERRORS,
    PROMOTE,
    ROLLBACK,
    "Preview build",
    PREVIEW,
  ]);
  assert.doesNotMatch(step("verify:live"), /secrets\./);
});

test("the deploy job publishes the attempt it shipped in, and never deploys a pull request", () => {
  const deploy = job("deploy");
  assert.match(
    deploy,
    /\n {4}outputs:\n {6}attempt: \$\{\{ github\.run_attempt \}\}\n/,
    "the deploy job does not publish its attempt",
  );
  for (const [key, body] of [
    ["deploy", deploy],
    ["live", job("live")],
  ]) {
    const when = /\n {4}if: (.+)\n/.exec(body)?.[1] ?? "";
    for (const part of [
      "github.event_name != 'pull_request'",
      "github.event_name != 'pull_request_target'",
      "github.event.repository.default_branch",
    ])
      assert.ok(when.includes(part), `${key} can run without ${part}`);
  }
  const guardAt = deploy.indexOf("- name: Pre-deploy guard");
  assert.ok(
    guardAt > -1 && guardAt < deploy.indexOf("- name: Deploy"),
    "the guard does not run before the deploy",
  );
  assert.ok(
    deploy.indexOf(`- name: ${BOOKMARK}`) < deploy.indexOf("- name: Pre-deploy guard"),
    "the D1 bookmark is read after the guard that runs migrations",
  );
  // The preview is the one job a pull request runs: same repository only, and never the guard, which may migrate.
  const preview = job("preview");
  const previewWhen = /\n {4}if: (.+)\n/.exec(preview)?.[1] ?? "";
  assert.ok(
    previewWhen.includes("github.event.pull_request.head.repo.full_name == github.repository"),
    "a fork's pull request can run the preview",
  );
  assert.doesNotMatch(preview, /PRE_DEPLOY|rollback|versions deploy/);
});

test("the rollback runs on a refusal only, calls the guard before wrangler, reads /health without -f, and checks the sha moved", () => {
  const body = step(ROLLBACK);
  const when = /\n {8}if: (.+)\n/.exec(body)?.[1] ?? "";
  for (const part of [
    "failure()",
    "needs.deploy.result == 'success'",
    "steps.verify.outputs.exit_code == '1'",
    "steps.errors.outputs.exit_code == '1'",
  ])
    assert.ok(when.includes(part), `the rollback's if: lost ${part}`);
  assert.match(
    text,
    /- name: verify:live\n\s+id: verify\n/,
    "the verify step has no id, so its exit code cannot be read",
  );
  assert.match(step("verify:live"), /echo "exit_code=\$\{code\}" >> "\$GITHUB_OUTPUT"/);
  const guardAt = body.indexOf('node "$GUARD" "${ROLLBACK_FROM}"');
  const rollbackAt = body.indexOf("rollback --name");
  assert.ok(
    guardAt > -1 && rollbackAt > -1 && guardAt < rollbackAt,
    "the guard does not run before the rollback",
  );
  assert.doesNotMatch(body, /curl -f/);
  assert.match(
    body,
    /"\$\{DEPLOY_ATTEMPT\}" "\$\{GITHUB_RUN_ATTEMPT\}"/,
    "the guard is not told which attempt deployed",
  );
  assert.match(body, /DEPLOY_ATTEMPT: \$\{\{ needs\.deploy\.outputs\.attempt \}\}/);
  assert.match(body, /"\$GUARD" --after/);
  assert.match(body, /did not take effect[\s\S]*exit 1/);
});

test("the guard the workflow runs is scripts/rollback-guard.mjs byte for byte (regenerate: node scripts/inline-rollback-guard.mjs)", () => {
  const guard = readFileSync(new URL("../scripts/rollback-guard.mjs", import.meta.url), "utf8");
  assert.equal(inlined(text), guard);
});

test("a gate: nothing continues on error, except the live gate of a drill (inputs.drill), whose refusal is the expected result", () => {
  assert.deepEqual(
    [...code.matchAll(/continue-on-error: (.+)/g)].map((m) => m[1]),
    ["${{ inputs.drill }}"],
  );
  assert.match(
    code,
    /drill:\n {8}description:[^\n]*\n {8}required: false\n {8}type: boolean\n {8}default: false/,
  );
});

test("the example caller names its secrets and never cancels a deploy in flight", () => {
  const caller = readFileSync(
    new URL("../examples/worker-deploy-caller.yml", import.meta.url),
    "utf8",
  );
  assert.match(caller, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(
    caller,
    /cancel-in-progress: false/,
    "a caller must never cancel a deploy in flight",
  );
});

// Run cases.

// The run cases need bash, as the runner has.
const BASH = { skip: process.platform === "win32" };
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
  const read = (/** @type {string} */ file) =>
    existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : "";
  return {
    dir,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: read("output"),
    summary: read("summary"),
    npx: read("npx.log"),
  };
}

/** A live gate with the guard written, as the job's first own step does. */
function gate() {
  const dir = mkdtempSync(join(tmpdir(), "worker-deploy-"));
  const wrote = runStep("Write the rollback guard", { health: [], dir });
  assert.equal(wrote.status, 0, wrote.stderr);
  return dir;
}

const verify = (
  /** @type {string} */ dir,
  /** @type {string[]} */ answers,
  /** @type {string} */ command,
) =>
  runStep("verify:live", {
    dir,
    health: answers,
    env: { EXPECT_SHA: THIS_RUN, VERIFY: command, VERIFY_POLL_ATTEMPTS: "40" },
  });
const rollback = (
  /** @type {string} */ dir,
  /** @type {string[]} */ answers,
  attempts = { deploy: "1", run: "1" },
) =>
  runStep(ROLLBACK, {
    dir,
    health: answers,
    env: { DEPLOY_ATTEMPT: attempts.deploy, GITHUB_RUN_ATTEMPT: attempts.run },
  });

test(
  "RUN: the guard step writes the guard, and a passing verify passes after /health catches up",
  BASH,
  () => {
    const dir = gate();
    try {
      assert.equal(
        readFileSync(join(dir, "rollback-guard.mjs"), "utf8"),
        readFileSync(new URL("../scripts/rollback-guard.mjs", import.meta.url), "utf8"),
      );
      const ok = verify(
        dir,
        [health(PREVIOUS), "NOANSWER", health(THIS_RUN)],
        'test "$EXPECT_SHA" = "$GITHUB_SHA" && test -n "$HEALTH_URL"',
      );
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
      assert.match(ok.output, /^exit_code=0$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "RUN: a site in maintenance skips the page checks once /health reports this commit",
  BASH,
  () => {
    const dir = gate();
    try {
      const skipped = verify(dir, [health(THIS_RUN), "503 3600"], "echo ran >&2; exit 1");
      assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
      assert.match(skipped.output, /^exit_code=0$/m);
      assert.match(skipped.stdout, /maintenance page/);
      assert.doesNotMatch(skipped.stderr, /ran/);
      const plain503 = verify(dir, [health(THIS_RUN), "503 "], "echo ran >&2; exit 1");
      assert.equal(plain503.status, 1, "a 503 with no Retry-After is not maintenance");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "RUN PLANT: a failing verify refuses (exit 1), and the rollback rolls back what this run shipped",
  BASH,
  () => {
    const dir = gate();
    try {
      const refused = verify(dir, [health(THIS_RUN)], "echo 'gate 3 refused' >&2; exit 1");
      assert.equal(refused.status, 1);
      assert.match(
        refused.output,
        /^exit_code=1$/m,
        "the refusal is not recorded, so the rollback's if: would not run",
      );
      const back = rollback(dir, [health(THIS_RUN), health(THIS_RUN), health(PREVIOUS)]);
      assert.equal(back.status, 0, back.stdout + back.stderr);
      assert.match(
        back.npx,
        new RegExp(
          `^--yes wrangler@\\d+\\.\\d+\\.\\d+ rollback --name sample --message live gate failed for ${THIS_RUN} --yes$`,
          "m",
        ),
      );
      const said = WATCHER.rolledBack.exec(back.stdout);
      assert.ok(said, `capsid's watcher cannot read: ${back.stdout}`);
      assert.deepEqual([said[1], said[2]], [THIS_RUN, PREVIOUS]);
      assert.match(back.stdout, /^::error::rolled back: was /m);
      assert.equal(back.summary, `rollback_from=${THIS_RUN} rollback_to=${PREVIOUS}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "RUN: a deploy that broke /health is rolled back when it shipped in this attempt",
  BASH,
  () => {
    const dir = gate();
    try {
      const back = rollback(dir, ["<html>502 Bad Gateway</html>", health(PREVIOUS)]);
      assert.equal(back.status, 0, back.stdout + back.stderr);
      assert.match(back.npx, / rollback --name sample /);
      assert.deepEqual(WATCHER.rolledBack.exec(back.stdout)?.slice(1), ["unreadable", PREVIOUS]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("RUN: THE RERUN CASE declines, rolls nothing back, and leaves the step green", BASH, () => {
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

test(
  "RUN: a rollback that never moves the sha fails the step and says what is still live",
  BASH,
  () => {
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
  },
);

test(
  "RUN: a /health that never answers is exit 3, could not run, and is not a refusal",
  BASH,
  () => {
    const dir = gate();
    try {
      const silent = verify(dir, ["NOANSWER"], "exit 0");
      assert.equal(silent.status, 3);
      assert.match(silent.output, /^exit_code=3$/m);
      assert.match(silent.stdout, /could not run/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "RUN: a /health that answers with another commit until the polls run out is a refusal",
  BASH,
  () => {
    const dir = gate();
    try {
      const stale = verify(dir, [health(PREVIOUS)], "exit 0");
      assert.equal(stale.status, 1);
      assert.match(stale.output, /^exit_code=1$/m);
      assert.match(stale.stdout, new RegExp(`/health reports ${PREVIOUS}, not this run's commit`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "RUN: a verify command that could not run (exit 3) is recorded as such, so nothing rolls back",
  BASH,
  () => {
    const dir = gate();
    try {
      const could = verify(dir, [health(THIS_RUN)], "exit 3");
      assert.equal(could.status, 3);
      assert.match(could.output, /^exit_code=3$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "RUN: a refused gradual rollout reads the new version through its override and rolls back to the version it shared with",
  BASH,
  () => {
    const dir = gate();
    try {
      const env = {
        DEPLOY_ATTEMPT: "1",
        GITHUB_RUN_ATTEMPT: "1",
        VERSION_ID: "new-version",
        PREVIOUS_VERSION_ID: "old-version",
      };
      const back = runStep(ROLLBACK, { dir, health: [health(THIS_RUN), health(PREVIOUS)], env });
      assert.equal(back.status, 0, back.stdout + back.stderr);
      assert.match(
        back.npx,
        / rollback --name sample --message live gate failed for \S+ --yes old-version$/m,
      );
      assert.deepEqual(WATCHER.rolledBack.exec(back.stdout)?.slice(1), [THIS_RUN, PREVIOUS]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "RUN PLANT: a gradual version with a worse error rate is refused (exit 1); too few requests promotes with a warning",
  BASH,
  () => {
    const rows = (fresh, old) =>
      JSON.stringify({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [
                  { sum: fresh, dimensions: { scriptVersion: "new-version" } },
                  { sum: old, dimensions: { scriptVersion: "old-version" } },
                ],
              },
            ],
          },
        },
      });
    const env = {
      VERSION_ID: "new-version",
      PREVIOUS_VERSION_ID: "old-version",
      SPLIT_AT: "2026-10-31T00:00:00Z",
      MIN_REQUESTS: "20",
      MIN_ERRORS: "3",
      CLOUDFLARE_ACCOUNT_ID: "x",
      CLOUDFLARE_API_TOKEN: "x",
    };
    const dir = mkdtempSync(join(tmpdir(), "worker-deploy-"));
    try {
      const worse = runStep(ERRORS, {
        dir,
        health: [rows({ requests: 100, errors: 9 }, { requests: 900, errors: 9 })],
        env,
      });
      assert.equal(worse.status, 1, worse.stdout + worse.stderr);
      assert.match(
        worse.output,
        /^exit_code=1$/m,
        "the refusal is not recorded, so the rollback's if: would not run",
      );
      const fine = runStep(ERRORS, {
        dir,
        health: [rows({ requests: 100, errors: 1 }, { requests: 900, errors: 9 })],
        env,
      });
      assert.equal(fine.status, 0, fine.stdout + fine.stderr);
      const few = runStep(ERRORS, {
        dir,
        health: [rows({ requests: 5, errors: 5 }, { requests: 900, errors: 0 })],
        env,
      });
      assert.equal(few.status, 0, few.stdout + few.stderr);
      assert.match(few.stdout, /::warning::.*too few to compare/);
      const unread = runStep(ERRORS, {
        dir,
        health: [JSON.stringify({ data: null, errors: [{ message: "not authorized" }] })],
        env,
      });
      assert.equal(unread.status, 3);
      assert.match(unread.summary, /versions deploy new-version@100%/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
