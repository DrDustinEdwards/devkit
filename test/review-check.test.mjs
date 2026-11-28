import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOutput } from "../scripts/review-check.mjs";

const reviewed = (verdict) => ({
  status: "reviewed",
  verdict,
  summary: "s",
  findings: [{ kind: "bug", file: "a.ts", line: 3, note: "n" }],
  model: "m",
  head_sha: "0123456789",
});

test("a BLOCK verdict fails the check, so a required check holds the merge", () => {
  assert.equal(checkOutput(reviewed("BLOCK")).conclusion, "failure");
});

test("APPROVE and CHANGES are neutral and do not hold the merge", () => {
  assert.equal(checkOutput(reviewed("APPROVE")).conclusion, "neutral");
  assert.equal(checkOutput(reviewed("CHANGES")).conclusion, "neutral");
});

test("a skipped pull request is skipped, and a reviewer that could not run blocks nothing", () => {
  assert.equal(
    checkOutput({ status: "skipped", reasons: ["a Renovate pull request"] }).conclusion,
    "skipped",
  );
  const down = checkOutput({ status: "error", error: "Capsid answered 502" });
  assert.equal(down.conclusion, "neutral");
  assert.match(down.summary, /blocks nothing/);
});
