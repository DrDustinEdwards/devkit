// The install step: it copies a missing example and never overwrites a real config, and it cannot wait on input. A stub
// stands in for wrangler and blocks until its stdin ends, as wrangler does when it asks a question; the bin is started
// with an open stdin nobody writes to, like a terminal nobody is watching, and must still exit.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/bootstrap.mjs", import.meta.url));

test("copies a missing example once, passes the arguments to wrangler types, and never waits on stdin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bootstrap-"));
  try {
    const stub = join(dir, "stub.js");
    writeFileSync(stub, 'require("fs").writeFileSync("args.json", JSON.stringify(process.argv.slice(2)));\nprocess.stdin.on("end", () => process.exit(0));\nprocess.stdin.resume();\n');
    writeFileSync(join(dir, "wrangler.jsonc.example"), "example");
    writeFileSync(join(dir, "wrangler.watchdog.jsonc.example"), "example");
    writeFileSync(join(dir, "wrangler.watchdog.jsonc"), "real");
    const child = spawn(process.execPath, [BIN, "--", "--strict-vars=false"], { cwd: dir, env: { ...process.env, WRANGLER_ENTRY: stub }, stdio: ["pipe", "ignore", "inherit"] });
    const code = await new Promise((done) => {
      const timer = setTimeout(() => (child.kill("SIGKILL"), done("waited on stdin")), 10_000);
      child.on("exit", (c) => (clearTimeout(timer), done(c)));
    });
    assert.equal(code, 0);
    assert.equal(readFileSync(join(dir, "wrangler.jsonc"), "utf8"), "example");
    assert.equal(readFileSync(join(dir, "wrangler.watchdog.jsonc"), "utf8"), "real");
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "args.json"), "utf8")), ["types", "--strict-vars=false"]);

    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { typecheck: "wrangler types && tsc", postinstall: "devkit-bootstrap" } }));
    const check = spawnSync(process.execPath, [BIN, "--check"], { cwd: dir, encoding: "utf8" });
    assert.equal(check.status, 1);
    assert.match(check.stderr, /typecheck runs a bare `wrangler types`/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
