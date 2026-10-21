// The worker-size bin, run in a scratch repository whose node_modules/.bin/wrangler prints a Total Upload line, so nothing
// is downloaded.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/worker-size.mjs", import.meta.url));

test("passes within the budget, fails over it on raw or gzip, and fails closed with no budget file", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "worker-size-"));
  try {
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    const wrangler = join(dir, "node_modules", ".bin", "wrangler");
    writeFileSync(wrangler, "#!/bin/sh\necho 'Total Upload: 1596.12 KiB / gzip: 301.50 KiB'\necho '--dry-run: exiting now.'\n");
    chmodSync(wrangler, 0o755);
    const run = () => spawnSync(process.execPath, [BIN], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });

    assert.equal(run().status, 1);

    writeFileSync(join(dir, ".worker-size.json"), JSON.stringify({ raw_kib: 1700, gzip_kib: 350 }));
    const ok = run();
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /\| gzip \| 301\.50 KiB \| 350 KiB \|/);

    writeFileSync(join(dir, ".worker-size.json"), JSON.stringify({ raw_kib: 1700, gzip_kib: 300 }));
    const over = run();
    assert.equal(over.status, 1);
    assert.match(over.stdout, /::error::devkit-worker-size: gzip 301\.50 KiB is over the budget of 300 KiB/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
