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

test("passes within the budget, fails over it on raw or gzip, and fails closed with no budget, a bad budget, a failed dry run or no Total Upload line", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "worker-size-"));
  try {
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    const wrangler = join(dir, "node_modules", ".bin", "wrangler");
    // Prints its arguments and $OUT (a Total Upload line by default), and exits $EXIT.
    writeFileSync(wrangler, "#!/bin/sh\necho \"args: $*\"\necho \"${OUT-Total Upload: 1596.12 KiB / gzip: 301.50 KiB}\"\nexit ${EXIT:-0}\n");
    chmodSync(wrangler, 0o755);
    const run = (/** @type {object | string | null} */ budget, env = {}, args = /** @type {string[]} */ ([])) => {
      if (budget !== null) writeFileSync(join(dir, ".worker-size.json"), typeof budget === "string" ? budget : JSON.stringify(budget));
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "", ...env } });
      return `${r.status} ${r.stdout}`;
    };

    assert.match(run(null), /^1 ::error::devkit-worker-size: no budget file at /);

    const ok = run({ raw_kib: 1700, gzip_kib: 350 });
    assert.match(ok, /^0 /);
    assert.match(ok, /\| raw \| 1596\.12 KiB \| 1700 KiB \|\n\| gzip \| 301\.50 KiB \| 350 KiB \|\n\nWithin budget\./);

    assert.match(run({ raw_kib: 1700, gzip_kib: 300 }), /^1 [^]*Over budget\. Cut the bundle[^]*raise \.worker-size\.json[^]*::error::devkit-worker-size: gzip 301\.50 KiB is over the budget of 300 KiB\n$/);
    assert.match(run({ raw_kib: 1596, gzip_kib: 350 }), /::error::devkit-worker-size: raw 1596\.12 KiB is over the budget of 1596 KiB\n$/);
    // MiB is read as 1024 KiB, and a budget equal to the size passes.
    assert.match(run({ raw_kib: 1536, gzip_kib: 296.96 }, { OUT: "Total Upload: 1.5 MiB / gzip: 0.29 MiB" }), /^0 [^]*\| raw \| 1536\.00 KiB \| 1536 KiB \|/);

    // `args` reach the dry run.
    assert.match(run({ raw_kib: 1, gzip_kib: 1, args: ["--env", "staging"] }, { EXIT: "1" }), /^1 ::error::devkit-worker-size: wrangler deploy --dry-run failed \(exit 1\):\nargs: deploy --dry-run --outdir \S+ --env staging\n/);
    assert.match(run({ raw_kib: 1, gzip_kib: 1 }, { OUT: "Upload: 1 KiB" }), /^1 ::error::devkit-worker-size: wrangler printed no "Total Upload" line:\nargs: /);
    assert.match(run("{ raw_kib: 1 }"), /^1 ::error::devkit-worker-size: \S+\.worker-size\.json is not JSON: /);
    assert.match(run({ raw_kib: "1700", gzip_kib: 350 }), /^1 ::error::devkit-worker-size: \S+ needs numbers raw_kib and gzip_kib\./);
    writeFileSync(join(dir, "budget.json"), JSON.stringify({ raw_kib: 1700, gzip_kib: 300 }));
    assert.match(run({ raw_kib: 1700, gzip_kib: 350 }, {}, ["--config", "budget.json"]), /raise budget\.json in a reviewed change/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
