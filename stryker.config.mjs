// devkit's mutation run: one Stryker run per module, each against its own test file. The whole suite costs about 11
// CPU-seconds a mutant (worker-deploy's polls) and the modules hold over 6,000 mutants, hours on a runner; a module's
// own tests take under 2 s. Each module fails its run below its bar (thresholds.break).
//
//   node stryker.config.mjs                                                every module, as code-map-self.yml runs it
//   MODULE=shared npx --package @stryker-mutator/core@10.1.1 stryker run   one
//
// Not here: scripts/strip-pr-footer.mjs and scripts/inline-rollback-guard.mjs, whose tests hold the workflows' inlined
// copies to the files byte for byte, which an instrumented copy never is, and scripts/code-map.mjs, two of whose coverage
// tests fail on the instrumented copy before any mutant runs.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Each module's bar, in percent: the score it reached, rounded down, so a module only climbs. */
export const BARS = {
  "bin/bootstrap": 47,
  "bin/check-trailers": 70,
  "bin/conformance": 51,
  "bin/shared": 72,
  "bin/live": 26,
  "bin/mutation-report": 84,
  "bin/no-bloat": 86,
  "bin/route-weight": 71,
  "bin/worker-size": 68,
  "scripts/check-callers": 54,
  "scripts/rollback-guard": 70,
};

const module = process.env.MODULE?.includes("/") ? process.env.MODULE : `bin/${process.env.MODULE ?? "shared"}`;
const name = module.split("/")[1];
if (!(module in BARS)) throw new Error(`MODULE=${process.env.MODULE} is none of ${Object.keys(BARS).join(", ")}`);

export default {
  testRunner: "command",
  commandRunner: { command: `node --test test/${name}.test.mjs` },
  mutate: [`${module}.mjs`],
  coverageAnalysis: "off",
  reporters: ["json", "clear-text"],
  jsonReporter: { fileName: `reports/mutation/${name}.json` },
  thresholds: { high: 90, low: BARS[module], break: BARS[module] },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const each of Object.keys(BARS)) {
    const run = spawnSync("npx", ["--yes", "--package", "@stryker-mutator/core@10.1.1", "stryker", "run"], { stdio: "inherit", env: { ...process.env, MODULE: each } });
    if (run.status !== 0) process.exitCode = 1;
  }
}
