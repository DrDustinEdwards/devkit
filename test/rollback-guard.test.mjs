// The rollback guard: roll back only when the deploy this run shipped is what is live. Ported from capsid's
// test/rollback-guard.test.ts with the guard it drives (scripts/rollback-guard.mjs, byte for byte capsid's).
//
// Rerunning only the failed live gate preserves `needs.deploy.result`, so the rollback step's `if:` still holds, and
// `wrangler rollback` with no version id means "the previous version". A second rollback therefore puts back the very commit
// the first one removed. The workflow wiring is held in worker-deploy-workflow.test.mjs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { rollbackTookEffect, shouldRollBack } from "../scripts/rollback-guard.mjs";

const LIVE_SHA = "4df127439ed3aa19aef8e350ab6311957b8f8611";
const PREVIOUS_SHA = "376eecb3bc27c6d744de35453cfad7a08bdc1d5f";
const GUARD = fileURLToPath(new URL("../scripts/rollback-guard.mjs", import.meta.url));

test("the deploy this run shipped IS live: roll it back", () => {
  const verdict = shouldRollBack(LIVE_SHA, LIVE_SHA);
  assert.equal(verdict.roll, true, verdict.reason);
  assert.match(verdict.reason, /this run's own commit/);
});

test("THE RERUN CASE: what is live is not this run's deploy, so nothing is rolled back", () => {
  // Attempt 2: this run's commit is LIVE_SHA, but attempt 1's rollback already put PREVIOUS_SHA live. Rolling back here
  // would put the refused commit back.
  const verdict = shouldRollBack(PREVIOUS_SHA, LIVE_SHA);
  assert.equal(verdict.roll, false, "the second rollback would run again");
  assert.match(verdict.reason, /already gone/);
});

test("an abbreviated sha on either side still compares equal", () => {
  // The comparison must not depend on /health serving the full sha.
  assert.equal(shouldRollBack(LIVE_SHA.slice(0, 8), LIVE_SHA).roll, true);
  assert.equal(shouldRollBack(LIVE_SHA, LIVE_SHA.slice(0, 8)).roll, true);
  assert.equal(shouldRollBack(PREVIOUS_SHA.slice(0, 8), LIVE_SHA).roll, false);
});

test("an unreadable /health REFUSES rather than rolling back blind", () => {
  // The step's reader writes these words when /health does not answer or does not parse. A rollback is a production change
  // and must not be made without knowing what is live.
  for (const value of ["unknown", "unreadable", "", "   "]) {
    const verdict = shouldRollBack(value, LIVE_SHA);
    assert.equal(verdict.roll, false, `'${value}' was treated as permission to roll back`);
  }
  assert.match(shouldRollBack("unreadable", LIVE_SHA).reason, /cannot be established/);
});

test("a missing run sha refuses, rather than comparing against nothing", () => {
  assert.equal(shouldRollBack(LIVE_SHA, "").roll, false);
});

// When /health is down. A deploy that breaks /health reads as "unreadable", and refusing then would leave the most broken
// deploys live. The rerun case is told apart by run_attempt: the deploy job's outputs survive a rerun of the live gate alone,
// so its attempt number is the earlier one.
test("unreadable /health rolls back when the deploy ran in this same attempt", () => {
  const verdict = shouldRollBack("unreadable", LIVE_SHA, { deployAttempt: "1", runAttempt: "1" });
  assert.equal(verdict.roll, true, verdict.reason);
});

test("unreadable /health in a RERUN still refuses", () => {
  const verdict = shouldRollBack("unreadable", LIVE_SHA, { deployAttempt: "1", runAttempt: "2" });
  assert.equal(verdict.roll, false, verdict.reason);
  assert.match(verdict.reason, /cannot be established/);
});

test("a sha shorter than 7 hex characters is not a sha", () => {
  // "4d" prefixes this run's sha and must not approve the rollback.
  assert.equal(shouldRollBack("4d", LIVE_SHA).roll, false);
  assert.equal(shouldRollBack("4df127", LIVE_SHA).roll, false);
  assert.equal(shouldRollBack("4df1274", LIVE_SHA).roll, true);
  assert.equal(shouldRollBack("not-a-sha", LIVE_SHA).roll, false);
});

test("the rollback took effect only when a readable, different sha is live", () => {
  assert.equal(rollbackTookEffect(PREVIOUS_SHA, LIVE_SHA).moved, true);
  // The sha never moved, so the rollback did not take effect.
  const same = rollbackTookEffect(LIVE_SHA, LIVE_SHA);
  assert.equal(same.moved, false);
  assert.match(same.reason, /did not take effect/);
  assert.equal(rollbackTookEffect("unreadable", LIVE_SHA).moved, false);
  assert.equal(rollbackTookEffect("", LIVE_SHA).moved, false);
});

// The workflow calls the guard as a command, so its exits are the contract: 0 roll back, 1 do not.
test("run as a command, the guard's exit code is its verdict", () => {
  const run = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [GUARD, ...args], { encoding: "utf8" }).status;
  assert.equal(run(LIVE_SHA, LIVE_SHA, "1", "1"), 0);
  assert.equal(run(PREVIOUS_SHA, LIVE_SHA, "1", "2"), 1);
  assert.equal(run("unreadable", LIVE_SHA, "1", "2"), 1);
  assert.equal(run("unreadable", LIVE_SHA, "2", "2"), 0);
  assert.equal(run("--after", PREVIOUS_SHA, LIVE_SHA), 0);
  assert.equal(run("--after", LIVE_SHA, LIVE_SHA), 1);
  assert.equal(run("--after", "unreadable", LIVE_SHA), 1);
});
