// The scoreboard's rules: a cell is complete only on a verifier's evidence with its checks green, never on the builder's
// word, and a failure after the verdict voids it.

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBoard,
  checkEnv,
  CLEAN_DAYS,
  lintConfig,
  loadConfig,
  reportedResult,
  resultOf,
} from "../bin/live.mjs";

const sites = [{ id: "a", name: "A", kind: "site", origin: "https://a.example.com" }];
const areas = [
  {
    id: 1,
    name: "Search",
    builder: "Build search",
    checks: [{ name: "audit", repo: "prelum", bin: "prelum-audit" }],
  },
];
const day = (n) => `2026-11-${String(n).padStart(2, "0")}`;
const run = (n, status) => ({
  at: `${day(n)}T06:00:00Z`,
  results: [{ area: 1, site: "a", check: "audit", status, findings: [] }],
});
const verdict = (verifier, date = day(1)) => ({
  area: 1,
  verifier,
  date,
  cells: {
    package: { verdict: "complete", evidence: ["https://example.com/pr/1"] },
    a: { verdict: "complete", evidence: ["https://example.com/run/1"] },
  },
});
const cell = (board) => board.areas[0].cells.a;

test("the repository's own site, area and verdict files are sound", () => {
  assert.deepEqual(lintConfig(loadConfig()), []);
});

test("an MCP test grant reaches only a check marked grants, never any other check's code", () => {
  const env = { PATH: "/bin", GITHUB_TOKEN: "t", MCP_TEST_GRANT_MCP_EXAMPLE_COM: "k" };
  assert.deepEqual(checkEnv(env, { name: "audit" }), { PATH: "/bin", GITHUB_TOKEN: "t" });
  assert.deepEqual(checkEnv(env, { name: "ai", grants: true }), env);
  const bad = {
    id: 1,
    name: "AI",
    builder: "b",
    checks: [{ name: "ai", repo: "site-runtime", bin: "x", grants: "yes" }],
  };
  assert.match(
    lintConfig({ sites, areas: [bad], verdicts: [] }).join("\n"),
    /"grants" other than true/,
  );
});

test("a check's exit code, or its fresh report, decides pass, fail or could not measure, on the run and the board, and its annotations are the findings", () => {
  const output =
    "::error title=canonical-missing::https://a.example.com/ no canonical link\n::warning title=og::x\nsummary";
  assert.deepEqual(
    { ...resultOf({ code: 1, output, seconds: 2 }), findings: undefined },
    { status: "fail", errors: 1, warnings: 1, unmeasured: 0, findings: undefined, seconds: 2 },
  );
  assert.equal(resultOf({ code: 0, output: "", seconds: 1 }).status, "pass");
  // What could not be measured is never a pass or a failure, and says why: a crash, exit 3, or a notice on a clean exit.
  assert.deepEqual(
    [
      resultOf({ code: 2, output: "boom", seconds: 1 }).status,
      resultOf({ code: 2, output: "boom", seconds: 1 }).detail,
    ],
    ["unmeasured", "could not run: boom"],
  );
  const notice =
    "::notice title=D1::https://a.example.com/ could not measure: a proxy hid the HTTP/2 answer\n::notice title=x::an ordinary note";
  assert.deepEqual(
    [
      resultOf({ code: 3, output: notice, seconds: 1 }).status,
      resultOf({ code: 3, output: notice, seconds: 1 }).unmeasured,
    ],
    ["unmeasured", 1],
  );
  assert.match(resultOf({ code: 0, output: notice, seconds: 1 }).detail, /^D1: .*proxy hid/);
  assert.equal(resultOf({ code: 1, output: `${notice}\n${output}`, seconds: 1 }).status, "fail");
  // A reported check passes only on a fresh report that names the site and has no error finding.
  const check = { name: "conformance", report: "https://reporter.example.com/report.json" };
  const now = new Date("2026-11-01T12:00:00Z");
  const report = (at, entry) => ({
    check: "conformance",
    at,
    sites: { "https://a.example.com": entry },
  });
  const status = (r) => reportedResult(r, check, sites[0], now).status;
  assert.equal(status(report("2026-11-01T11:50:00Z", { status: "pass", findings: [] })), "pass");
  assert.equal(
    status(report("2026-11-01T10:00:00Z", { status: "pass", findings: [] })),
    "unmeasured",
  );
  assert.equal(status({ ...report("2026-11-01T11:50:00Z", {}), sites: {} }), "unmeasured");
  assert.equal(status(null), "unmeasured");
  assert.equal(
    status(report("2026-11-01T11:50:00Z", { status: "error", findings: [] })),
    "unmeasured",
  );
  assert.equal(
    status(
      report("2026-11-01T11:50:00Z", {
        status: "pass",
        findings: [{ severity: "unmeasured", check: "C2", detail: "no grant" }],
      }),
    ),
    "unmeasured",
  );
  const served = { ...sites[0], from: "https://a.workers.example.com" };
  const viaFrom = {
    check: "conformance",
    at: "2026-11-01T11:50:00Z",
    sites: { [served.from]: { status: "pass", findings: [] } },
  };
  assert.equal(reportedResult(viaFrom, check, served, now).status, "pass");
  assert.equal(
    status(
      report("2026-11-01T11:50:00Z", {
        status: "pass",
        findings: [{ severity: "error", check: "C1", detail: "x" }],
      }),
    ),
    "fail",
  );
  // On the board, an unmeasured cell says so and why; a measured failure beside it still makes the cell missing.
  const unmeasured = {
    ...run(2, "unmeasured"),
    results: [{ ...run(2, "unmeasured").results[0], detail: "PSI: answered 429" }],
  };
  const got = cell(
    buildBoard({ sites, areas, verdicts: [verdict("Verify search")] }, [
      run(1, "pass"),
      unmeasured,
    ]),
  );
  assert.deepEqual(
    [got.status, got.reason],
    ["unmeasured", "audit could not measure: PSI: answered 429"],
  );
  const two = [
    { name: "audit", repo: "prelum", bin: "prelum-audit" },
    { name: "speed", repo: "site-runtime", bin: "speed" },
  ];
  const both = {
    at: `${day(3)}T06:00:00Z`,
    results: [
      unmeasured.results[0],
      { area: 1, site: "a", check: "speed", status: "fail", errors: 1, findings: [] },
    ],
  };
  assert.equal(
    cell(buildBoard({ sites, areas: [{ ...areas[0], checks: two }], verdicts: [] }, [both])).status,
    "missing",
  );
});

test("checks passing without a verdict is partial; a verdict signed by the builder is refused and never complete", () => {
  assert.equal(
    cell(buildBoard({ sites, areas, verdicts: [] }, [run(1, "pass")])).status,
    "partial",
  );
  const own = verdict("build search");
  assert.match(lintConfig({ sites, areas, verdicts: [own] }).join(), /signed by its builder/);
  assert.equal(
    cell(buildBoard({ sites, areas, verdicts: [own] }, [run(1, "pass")])).status,
    "partial",
  );
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
  assert.equal(
    cell(buildBoard({ sites, areas, verdicts: [verdict("Verify search")] }, [run(2, "fail")]))
      .status,
    "missing",
  );
});

test("finished only when every cell is complete and clean for the full run of days", () => {
  const verdicts = [verdict("Verify search")];
  const days = Array.from({ length: CLEAN_DAYS }, (_, i) => run(i + 2, "pass"));
  assert.equal(buildBoard({ sites, areas, verdicts }, days.slice(1)).finished, false);
  const board = buildBoard({ sites, areas, verdicts }, days);
  assert.equal(cell(board).status, "complete");
  assert.equal(board.finished, true);
  // A page the checks cannot reach is not proven, so it keeps the job open.
  const unreached = [{ ...areas[0], unchecked: { "a /stats": "signed-in only" } }];
  assert.equal(buildBoard({ sites, areas: unreached, verdicts }, days).finished, false);
});
