// The shared chunked Stryker config: what each chunk mutates and the refusals.

import assert from "node:assert/strict";
import test from "node:test";

import { chunkedStryker } from "../stryker/chunked.mjs";

const options = {
  all: ["src/**/*.ts"],
  chunks: { server: ["src/server/**/*.ts"], admin: ["src/admin.ts", "src/admin/**/*.ts"] },
};

test("PLANT: a whole run mutates everything; a chunk only its globs; rest is everything the chunks do not name", () => {
  const whole = chunkedStryker(options, {});
  assert.deepEqual(whole.mutate, ["src/**/*.ts", "!**/*.d.ts"]);
  assert.equal(whole.jsonReporter.fileName, "reports/mutation/mutation.json");

  const server = chunkedStryker(options, { STRYKER_CHUNK: "server" });
  assert.deepEqual(server.mutate, ["src/server/**/*.ts", "!**/*.d.ts"]);
  assert.equal(server.incrementalFile, "reports/stryker-incremental-server.json");

  const rest = chunkedStryker({ ...options, exclude: ["src/demo/**"] }, { STRYKER_CHUNK: "rest" });
  assert.deepEqual(rest.mutate, [
    "src/**/*.ts",
    "!src/server/**/*.ts",
    "!src/admin.ts",
    "!src/admin/**/*.ts",
    "!src/demo/**",
    "!**/*.d.ts",
  ]);
});

test("it passes a Vitest config through, and refuses an unknown chunk and a chunk named rest", () => {
  assert.deepEqual(chunkedStryker({ ...options, vitestConfig: "v.ts" }, {}).vitest, {
    configFile: "v.ts",
  });
  assert.throws(
    () => chunkedStryker(options, { STRYKER_CHUNK: "nope" }),
    /one of server, admin, rest/,
  );
  assert.throws(
    () => chunkedStryker({ all: [], chunks: { rest: [] } }, {}),
    /adds the chunk `rest`/,
  );
});
