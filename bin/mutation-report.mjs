#!/usr/bin/env node
// Summarises a StrykerJS run. Measurement only: it merges every mutation JSON in the report directory (one per chunk, or
// mutation.json for a single run), prints the score and the pruning candidates, and deletes and decides nothing.
//
//   npx devkit-mutation-report --protected <regex> [--dir reports/mutation] [--table] [--json <file>]
//
// Candidates: zero-kill (kills no mutant) and covered (every mutant it kills is also killed by another test). Per test,
// not joint: two tests that only cover each other both show up, so a pruning step must re-check. `--protected` is the
// repository's keep rule, matched against each test's file and name (case-insensitive); a protected test is never a
// candidate. `--table` prints a per-file markdown table; `--json` writes the kill matrix (per test: file, name, kills,
// unique kills, candidate kind, protected).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const option = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const keep = option("--protected");
if (!keep) {
  console.error("devkit-mutation-report: --protected <regex> is required (the repository's keep rule).");
  process.exit(1);
}
const PROTECTED = new RegExp(keep, "i");
const DIR = resolve(option("--dir") ?? "reports/mutation");
const reports = readdirSync(DIR)
  .filter((n) => n.endsWith(".json") && n !== "kill-matrix.json" && !n.startsWith("incremental"))
  .map((n) => JSON.parse(readFileSync(resolve(DIR, n), "utf8")));
if (reports.length === 0) {
  console.error(`devkit-mutation-report: no mutation JSON in ${DIR}. Run Stryker first.`);
  process.exit(1);
}

// Test ids are per run, so across chunks a test is keyed by file and name.
const tests = new Map();
/** @type {Record<string, number>} */
const counts = {};
const perFile = new Map();
const killers = new Map();
for (const report of reports) {
  const keyOf = new Map();
  for (const [file, entry] of Object.entries(report.testFiles ?? {})) {
    for (const test of entry.tests ?? []) {
      const key = `${file}::${test.name}`;
      keyOf.set(test.id, key);
      if (!tests.has(key)) tests.set(key, { file, name: test.name, kills: new Set() });
    }
  }
  for (const [file, entry] of Object.entries(report.files ?? {})) {
    const f = perFile.get(file) ?? {};
    perFile.set(file, f);
    for (const mutant of entry.mutants ?? []) {
      counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
      f[mutant.status] = (f[mutant.status] ?? 0) + 1;
      const key = `${file}#${mutant.id}`;
      const by = mutant.killedBy ?? [];
      killers.set(key, by.length);
      for (const id of by) tests.get(keyOf.get(id))?.kills.add(key);
    }
  }
}

const killed = (/** @type {Record<string, number>} */ c) => (c.Killed ?? 0) + (c.Timeout ?? 0);
const valid = (/** @type {Record<string, number>} */ c) => killed(c) + (c.Survived ?? 0) + (c.NoCoverage ?? 0);
const pct = (/** @type {number} */ n, /** @type {number} */ d) => (d ? `${((100 * n) / d).toFixed(2)}%` : "n/a");

const rows = [];
for (const t of tests.values()) {
  let unique = 0;
  for (const key of t.kills) if (killers.get(key) === 1) unique += 1;
  const isProtected = PROTECTED.test(t.file) || PROTECTED.test(t.name);
  const kind = t.kills.size === 0 ? "zero-kill" : unique === 0 ? "covered" : "";
  rows.push({ file: t.file, name: t.name, kills: t.kills.size, unique, kind, protected: isProtected });
}
const zero = rows.filter((r) => r.kind === "zero-kill");
const covered = rows.filter((r) => r.kind === "covered");
console.log(`Reports merged: ${reports.length}`);
console.log("Mutant status counts:", counts);
console.log(`Mutation score: ${pct(killed(counts), valid(counts))} (${killed(counts)} of ${valid(counts)})`);
console.log(`Score over covered code: ${pct(killed(counts), killed(counts) + (counts.Survived ?? 0))}`);
console.log(`Tests in the kill matrix: ${rows.length}`);
console.log(`Zero-kill: ${zero.length} (${zero.filter((r) => r.protected).length} protected)`);
console.log(`Covered by others: ${covered.length} (${covered.filter((r) => r.protected).length} protected)`);
console.log(`Unprotected candidates: ${zero.filter((r) => !r.protected).length} zero-kill, ${covered.filter((r) => !r.protected).length} covered`);

if (argv.includes("--table")) {
  console.log("\n| File | Mutants | Killed | Survived | No coverage | Score |\n|---|---|---|---|---|---|");
  for (const [file, c] of [...perFile].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`| ${file} | ${valid(c)} | ${killed(c)} | ${c.Survived ?? 0} | ${c.NoCoverage ?? 0} | ${pct(killed(c), valid(c))} |`);
  }
}
const out = option("--json");
if (out) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify(rows, null, 2));
  console.log(`Wrote ${out}`);
}
