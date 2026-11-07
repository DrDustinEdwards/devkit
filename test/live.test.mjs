// The scoreboard's rules: a cell is complete only on a verifier's evidence with its checks green, never on the builder's
// word, and a failure after the verdict voids it.

import assert from "node:assert/strict";
import test from "node:test";

import {
  boardMarkdown,
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

test("a check's bin gets a minimal environment: tokens, keys and MCP grants only where it declares them", () => {
  const env = {
    PATH: "/bin",
    HOME: "/h",
    NODE_OPTIONS: "--require /tmp/x.js",
    NODE_AUTH_TOKEN: "n",
    NODE_EXTRA_CA_CERTS: "/ca.pem",
    HTTPS_PROXY: "http://user:secret@proxy.example.com:8080",
    LC_ALL: "C",
    GITHUB_TOKEN: "t",
    LIVE_GITHUB_TOKEN: "l",
    PSI_API_KEY: "p",
    MCP_TEST_GRANT_MCP_EXAMPLE_COM: "k",
    MCP_TEST_GRANT_OTHER_EXAMPLE_COM: "o",
  };
  const base = {
    PATH: "/bin",
    HOME: "/h",
    NODE_EXTRA_CA_CERTS: "/ca.pem",
    HTTPS_PROXY: "http://proxy.example.com:8080/",
    LC_ALL: "C",
  };
  assert.deepEqual(checkEnv(env, { name: "audit" }), base);
  assert.deepEqual(checkEnv(env, { name: "speed", env: ["PSI_API_KEY"] }), {
    ...base,
    PSI_API_KEY: "p",
  });
  // Only the grant for the host being probed, never another server's.
  assert.deepEqual(
    checkEnv(env, { name: "ai", grants: true }, { origin: "https://mcp.example.com" }),
    {
      ...base,
      MCP_TEST_GRANT_MCP_EXAMPLE_COM: "k",
    },
  );
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
  // An ::error line on exit 0 is no pass; exit 1 with none is a crash; a timeout is unmeasured and says so.
  assert.equal(resultOf({ code: 0, output, seconds: 1 }).status, "fail");
  const crash = resultOf({ code: 1, output: "TypeError: x is undefined", seconds: 1 });
  assert.deepEqual(
    [crash.status, crash.detail],
    ["unmeasured", "could not run: exit 1 with no ::error line: TypeError: x is undefined"],
  );
  assert.match(
    resultOf({ code: null, output: "", seconds: 1, killed: "timed out after 20 minutes" }).detail,
    /^could not run: timed out after 20 minutes$/,
  );
  // bin/annotate.mjs's escapes are undone, so a finding reads as the check wrote it.
  assert.deepEqual(
    resultOf({ code: 1, output: "::error title=a%3Ab%2Cc::50%25 of%0Atwo lines", seconds: 1 })
      .findings[0],
    { severity: "error", check: "a:b,c", detail: "50% of\ntwo lines" },
  );
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

test("lint names a malformed config instead of throwing, and refuses a bin, repo or ref that is not a plain name", () => {
  const problems = lintConfig({
    sites: [{ id: "b", name: "B", kind: "site" }],
    areas: [
      { id: 2, name: "X", builder: "b" },
      {
        id: 3,
        name: "Y",
        builder: "b",
        checks: [{ name: "c", repo: "../x", bin: "../../bin/sh", ref: "main" }],
      },
    ],
    verdicts: [{ area: 3, verifier: 7, date: day(1), cells: { b: null } }],
    problems: ["areas.json cannot be read: Unexpected token"],
  }).join("\n");
  for (const want of [
    /areas.json cannot be read/,
    /site b has no origin/,
    /area 2 has no list of checks/,
    /bin \.\.\/\.\.\/bin\/sh is not a plain name/,
    /repo \.\.\/x is not a repository name/,
    /ref main is not a vX.Y.Z tag/,
    /area 3 verdict names no verifier/,
    /verdict for b is not an object/,
  ])
    assert.match(problems, want);
});

test("SCOREBOARD.md text from a check, a site or a verdict cannot break a line, a table or into HTML", () => {
  const md = boardMarkdown(
    buildBoard(
      {
        sites: [{ ...sites[0], name: "A|<b>" }],
        areas: [{ ...areas[0], name: "Search\n# Owned" }],
        verdicts: [],
      },
      [
        {
          at: `${day(1)}T06:00:00Z`,
          results: [
            {
              ...run(1, "fail").results[0],
              errors: 1,
              findings: [
                { severity: "error", check: "x`y", detail: "<img src=x onerror=a()> & |" },
              ],
            },
          ],
        },
      ],
    ),
  );
  assert.match(md, /\| A\\\|&lt;b&gt; \|/);
  assert.match(md, /### 1\. Search # Owned/);
  assert.match(md, /- x&#96;y: &lt;img src=x onerror=a\(\)&gt; &amp; \\\|/);
  assert.doesNotMatch(md, /<img|^# Owned/m);
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
  // An area with no live check (area 12) is the verdict alone, with no clean days to wait for.
  const tooling = [...areas, { id: 2, name: "Tooling", builder: "Build tooling", checks: [] }];
  const signed = [...verdicts, { ...verdict("Verify tooling"), area: 2 }];
  assert.equal(
    buildBoard({ sites, areas: tooling, verdicts }, days).areas[1].cells.a.status,
    "missing",
  );
  const done = buildBoard({ sites, areas: tooling, verdicts: signed }, days);
  assert.deepEqual([done.areas[1].cells.a.status, done.finished], ["complete", true]);
});
