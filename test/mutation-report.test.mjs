// The mutation report, run on two small Stryker reports (one per chunk, their ids overlapping as separate runs' do).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/mutation-report.mjs", import.meta.url));

test("PLANT: it merges the chunks into one score and names the zero-kill and covered tests a keep rule does not protect; it fails with no keep rule or no report", () => {
  const dir = mkdtempSync(join(tmpdir(), "mutation-report-"));
  const run = (/** @type {string[]} */ args) => {
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: "utf8" });
    return `${r.status} ${r.stdout}${r.stderr}`;
  };
  try {
    mkdirSync(join(dir, "reports", "mutation"), { recursive: true });
    assert.match(run(["--protected", "x"]), /^1 devkit-mutation-report: no mutation JSON in \S+reports\/mutation\. Run Stryker first\./);
    assert.match(run([]), /^1 devkit-mutation-report: --protected <regex> is required/);

    const report = (/** @type {object} */ testFiles, /** @type {object} */ files) => JSON.stringify({ testFiles, files });
    const tests = (/** @type {string[]} */ ...names) => ({ tests: names.map((name, i) => ({ id: String(i + 1), name })) });
    writeFileSync(
      join(dir, "reports", "mutation", "a.json"),
      report(
        { "test/a.test.mjs": tests("unique", "covered", "zero") },
        {
          "src/a.mjs": {
            mutants: [
              { id: "1", status: "Killed", killedBy: ["1", "2"] },
              { id: "2", status: "Killed", killedBy: ["1"] },
              { id: "3", status: "Survived" },
              { id: "4", status: "NoCoverage" },
              { id: "5", status: "Timeout", killedBy: ["1"] },
              { id: "6", status: "CompileError" },
            ],
          },
        },
      ),
    );
    writeFileSync(
      join(dir, "reports", "mutation", "b.json"),
      report({ "test/b.test.mjs": tests("Keep: the deploy", "keep: zero") }, { "src/b.mjs": { mutants: [{ id: "1", status: "Killed", killedBy: ["1"] }, { id: "2", status: "Survived" }] } }),
    );
    // Its own output and Stryker's incremental file are not reports.
    writeFileSync(join(dir, "reports", "mutation", "kill-matrix.json"), "[]");
    writeFileSync(join(dir, "reports", "mutation", "incremental.json"), "not a report");

    const out = run(["--protected", "^keep", "--table", "--json", "out/kill-matrix.json"]);
    assert.match(out, /^0 Reports merged: 2\n/);
    for (const line of [
      "Mutation score: 57.14% (4 of 7)",
      "Score over covered code: 66.67%",
      "Tests in the kill matrix: 5",
      "Zero-kill: 2 (1 protected)",
      "Covered by others: 1 (0 protected)",
      "Unprotected candidates: 1 zero-kill, 1 covered",
      "| src/a.mjs | 5 | 3 | 1 | 1 | 60.00% |",
      "| src/b.mjs | 2 | 1 | 1 | 0 | 50.00% |",
      "Wrote out/kill-matrix.json",
    ]) {
      assert.ok(out.split("\n").includes(line), line);
    }
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "out", "kill-matrix.json"), "utf8")), [
      { file: "test/a.test.mjs", name: "unique", kills: 3, unique: 2, kind: "", protected: false },
      { file: "test/a.test.mjs", name: "covered", kills: 1, unique: 0, kind: "covered", protected: false },
      { file: "test/a.test.mjs", name: "zero", kills: 0, unique: 0, kind: "zero-kill", protected: false },
      { file: "test/b.test.mjs", name: "Keep: the deploy", kills: 1, unique: 1, kind: "", protected: true },
      { file: "test/b.test.mjs", name: "keep: zero", kills: 0, unique: 0, kind: "zero-kill", protected: true },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
