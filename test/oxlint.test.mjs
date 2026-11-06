// The shared Oxlint config (lint/oxlint.mjs), tested once where it lives. The fixture's config extends `base`
// and `react` by the package's own name, so the run proves the `./oxlint` export loads in Oxlint, and its two files
// prove the rules fire: bad.ts must be flagged for exactly a dropped promise (type-aware, through oxlint-tsgolint), a
// hook called conditionally and a restricted import; good.ts, with handled promises, must not be. The fixture's config
// is not named oxlint.config.ts, so devkit's own `npm run lint` does not find it as a nested config and fail on bad.ts.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..");

test("the shared config loads and its key rules fire on the fixture, and only there", () => {
  const run = spawnSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "oxlint", "bin", "oxlint"),
      "--type-aware",
      "-c",
      "fixture.config.ts",
      "-f",
      "unix",
    ],
    {
      cwd: join(ROOT, "test", "fixtures", "oxlint"),
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 1, `expected the fixture to fail:\n${output}`);
  const findings = output.match(/^\S+:\d+:\d+: .*$/gm) ?? [];
  const rules = findings
    .map((line) => `${line.split(":")[0]} ${line.match(/\(([\w-]+)\)\]$/)?.[1]}`)
    .sort();
  assert.deepEqual(
    rules,
    ["bad.ts no-floating-promises", "bad.ts no-restricted-imports", "bad.ts rules-of-hooks"],
    output,
  );
});
