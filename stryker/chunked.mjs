// The chunked StrykerJS config every repository's mutation run shares (code-map.yml's Monday run, or by hand). A run is
// never a gate: it measures, and `devkit-mutation-report` merges the reports. It is split into chunks because Stryker saves
// its incremental file only when a run finishes, so one long run that is interrupted loses everything while a chunk loses
// at most itself. With no STRYKER_CHUNK it mutates everything in one run. Each chunk writes reports/mutation/<chunk>.json
// and its own incremental file under reports/.
//
//   // stryker.config.mjs
//   import { chunkedStryker } from "@dustinedwards/devkit/stryker";
//   export default chunkedStryker({ all: ["src/**/*.ts"], chunks: { server: ["src/server/**/*.ts"] } });
//
// `rest` is added to the chunks: everything in `all` that no other chunk names.

import process from "node:process";

/**
 * @param {object} options
 * @param {string[]} options.all every file a whole run mutates
 * @param {Record<string, string[]>} options.chunks the named chunks; do not name one `rest`
 * @param {string[]} [options.exclude] globs no run mutates (a `!` is added), besides `**\/*.d.ts`
 * @param {string} [options.vitestConfig] the Vitest config Stryker runs, when it is not the default one
 * @param {number} [options.timeoutMS] a mutant's test timeout (default 30000)
 * @param {NodeJS.ProcessEnv} [env] where STRYKER_CHUNK is read (tests pass their own)
 * @returns {Record<string, unknown>} Stryker options
 */
export function chunkedStryker(
  { all, chunks, exclude = [], vitestConfig, timeoutMS = 30000 },
  env = process.env,
) {
  if ("rest" in chunks)
    throw new Error("chunkedStryker adds the chunk `rest`; name yours otherwise");
  /** @type {Record<string, string[]>} */
  const named = {
    ...chunks,
    rest: [
      ...all,
      ...Object.values(chunks)
        .flat()
        .map((glob) => `!${glob}`),
    ],
  };
  const chunk = env.STRYKER_CHUNK;
  if (chunk && !named[chunk]) {
    throw new Error(`Unknown STRYKER_CHUNK "${chunk}"; one of ${Object.keys(named).join(", ")}`);
  }
  const name = chunk ?? "mutation";
  return {
    testRunner: "vitest",
    ...(vitestConfig ? { vitest: { configFile: vitestConfig } } : {}),
    coverageAnalysis: "perTest",
    disableBail: true,
    incremental: true,
    incrementalFile: `reports/stryker-incremental-${name}.json`,
    mutate: [...(chunk ? named[chunk] : all), ...exclude.map((glob) => `!${glob}`), "!**/*.d.ts"],
    ignoreStatic: true,
    reporters: ["json", "clear-text", "progress"],
    jsonReporter: { fileName: `reports/mutation/${name}.json` },
    concurrency: 4,
    timeoutMS,
    tempDirName: ".stryker-tmp",
  };
}
