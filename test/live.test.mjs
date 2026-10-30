// The scoreboard's rules: a cell is complete only on a verifier's evidence with its checks green, never on the builder's
// word, and a failure after the verdict voids it.

import assert from "node:assert/strict";
import test from "node:test";

import { buildBoard, CLEAN_DAYS, lintConfig, loadConfig, resultOf } from "../bin/live.mjs";

const sites = [{ id: "a", name: "A", kind: "site", origin: "https://a.example.com" }];
const areas = [{ id: 1, name: "Search", builder: "Build search", checks: [{ name: "audit", repo: "prelum", bin: "prelum-audit" }] }];
const day = (n) => `2026-11-${String(n).padStart(2, "0")}`;
const run = (n, status) => ({ at: `${day(n)}T06:00:00Z`, results: [{ area: 1, site: "a", check: "audit", status, findings: [] }] });
const verdict = (verifier, date = day(1)) => ({
  area: 1,
  verifier,
  date,
  cells: { package: { verdict: "complete", evidence: ["https://example.com/pr/1"] }, a: { verdict: "complete", evidence: ["https://example.com/run/1"] } },
});
const cell = (board) => board.areas[0].cells.a;

test("the repository's own site, area and verdict files are sound", () => {
  assert.deepEqual(lintConfig(loadConfig()), []);
});

test("a check's exit code decides pass, fail or could not run, and its annotations are the findings", () => {
  const output = "::error title=canonical-missing::https://a.example.com/ no canonical link\n::warning title=og::x\nsummary";
  assert.deepEqual(
    { ...resultOf({ code: 1, output, seconds: 2 }), findings: undefined },
    { status: "fail", errors: 1, warnings: 1, findings: undefined, seconds: 2 }
  );
  assert.equal(resultOf({ code: 0, output: "", seconds: 1 }).status, "pass");
  assert.equal(resultOf({ code: 2, output: "boom", seconds: 1 }).status, "error");
});

test("checks passing without a verdict is partial; a verdict signed by the builder is refused and never complete", () => {
  assert.equal(cell(buildBoard({ sites, areas, verdicts: [] }, [run(1, "pass")])).status, "partial");
  const own = verdict("build search");
  assert.match(lintConfig({ sites, areas, verdicts: [own] }).join(), /signed by its builder/);
  assert.equal(cell(buildBoard({ sites, areas, verdicts: [own] }, [run(1, "pass")])).status, "partial");
});

test("a complete verdict with no evidence is refused", () => {
  const bare = verdict("Verify search");
  bare.cells.a.evidence = [];
  assert.match(lintConfig({ sites, areas, verdicts: [bare] }).join(), /complete with no evidence/);
});

test("a failure after the verdict voids it, even once the check is green again", () => {
  const runs = [run(2, "pass"), run(3, "fail"), run(4, "pass")];
  const board = buildBoard({ sites, areas, verdicts: [verdict("Verify search")] }, runs);
  assert.equal(cell(board).status, "partial");
  assert.match(cell(board).reason, /fresh verifier/);
  assert.equal(cell(buildBoard({ sites, areas, verdicts: [verdict("Verify search")] }, [run(2, "fail")])).status, "missing");
});

test("finished only when every cell is complete and clean for the full run of days", () => {
  const verdicts = [verdict("Verify search")];
  const days = Array.from({ length: CLEAN_DAYS }, (_, i) => run(i + 2, "pass"));
  assert.equal(buildBoard({ sites, areas, verdicts }, days.slice(1)).finished, false);
  const board = buildBoard({ sites, areas, verdicts }, days);
  assert.equal(cell(board).status, "complete");
  assert.equal(board.finished, true);
});
