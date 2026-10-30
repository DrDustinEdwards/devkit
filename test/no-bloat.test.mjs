// The no-bloat bin: counts read from the tools and the files, compared with the repository's baseline, failing only on
// growth. The units run against a fake runner; the end-to-end cases run the bin itself in a scratch git repository whose
// node_modules/.bin holds stand-ins for knip and jscpd, so nothing is downloaded.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compare, countFiles, knipCounts, measure, npxArgs, scan, testCases } from "../bin/no-bloat.mjs";

const BIN = fileURLToPath(new URL("../bin/no-bloat.mjs", import.meta.url));

const KNIP = "Unused files (2)\nsrc/a.ts\nsrc/b.ts\nUnused exports (3)\nsrc/c.ts: x, y, z\n";

/** A runner that answers knip with `knip` and writes a jscpd report with `clones` into the --output directory. */
const fakeRun = ({ knip = KNIP, clones = 4, percentage = 1.234, sources = 9 } = {}) => {
  /** @type {Array<[string, string[]]>} */
  const calls = [];
  /** @type {import("../bin/no-bloat.mjs").Runner} */
  const run = (name, args) => {
    calls.push([name, args]);
    if (name === "knip") return knip;
    const out = args[args.indexOf("--output") + 1];
    writeFileSync(join(out, "jscpd-report.json"), JSON.stringify({ statistics: { total: { clones, duplicatedLines: 40, percentage, sources } } }));
    return "";
  };
  return { run, calls };
};

test("a tool that is not installed is named to npx with --package, so an inherited npm_config_package cannot replace it", () => {
  assert.deepEqual(npxArgs("knip", "knip@6", ["--no-progress"]), ["--yes", "--package", "knip@6", "--", "knip", "--no-progress"]);
});

test("knipCounts reads the compact report's headings, and refuses output it cannot read rather than pass it as clean", () => {
  assert.deepEqual(knipCounts(KNIP), { "Unused files": 2, "Unused exports": 3 });
  assert.deepEqual(knipCounts(""), {});
  assert.deepEqual(knipCounts("✂️  Excellent, Knip found no issues.\n"), {});
  assert.throws(() => knipCounts("src/a.ts: unused file\n"), /knip printed no report this reads/);
});

test("with no config: one knip run, jscpd on the root unless the repository has its own .jscpd.json", () => {
  const bare = fakeRun();
  assert.deepEqual(measure({}, bare.run, false).counts, {
    knip: { "Unused files": 2, "Unused exports": 3 },
    jscpd: { clones: 4, lines: 40, percentage: 1.23 },
    tests: { files: 0, cases: 0 },
    comments: { lines: 0, code: 0, percentage: 0 },
  });
  assert.deepEqual(bare.calls[0], ["knip", ["--no-exit-code", "--no-progress", "--reporter", "compact"]]);
  assert.equal(bare.calls[1][1][0], ".");

  const configured = fakeRun();
  measure({}, configured.run, true);
  assert.equal(configured.calls[1][1][0], "--reporters");
});

test("each knip run is labeled and passes its own arguments; jscpd's arguments come before the report flags", () => {
  const { run, calls } = fakeRun();
  const { counts } = measure(
    { knip: [{ label: "knip (Worker)" }, { label: "knip (dashboard)", args: ["--directory", "dashboard"] }], jscpd: { args: ["app", "--min-lines", "8"] } },
    run,
  );
  assert.deepEqual(Object.keys(counts), ["knip (Worker)", "knip (dashboard)", "jscpd", "tests", "comments"]);
  assert.deepEqual(calls[1][1].slice(0, 2), ["--directory", "dashboard"]);
  assert.deepEqual(calls[2][1].slice(0, 3), ["app", "--min-lines", "8"]);
});

test("jscpd, tests and comments each turn off with false; jscpd that read no files could not run", () => {
  const { run, calls } = fakeRun();
  assert.deepEqual(Object.keys(measure({ jscpd: false, tests: false, comments: false }, run).counts), ["knip"]);
  assert.equal(calls.length, 1);
  assert.match(measure({}, fakeRun({ sources: 0 }).run).warnings[0], /jscpd could not run: it read no files/);
});

test("what grew is an error; what shrank is a note to lower the baseline; a finding new to a known tool counts from zero", () => {
  const { rows, errors, lowered } = compare(
    { measured_at: "abc1234", "knip (dashboard)": { "Unused exports": 5, "Unused files": 1 }, jscpd: { clones: 4, lines: 50, percentage: 1.5 } },
    { "knip (dashboard)": { "Unused exports": 6, "Unused types": 1 }, jscpd: { clones: 3, lines: 51, percentage: 1.2 } },
    { knip: [{ label: "knip (dashboard)", args: ["--directory", "dashboard"] }], tests: false, comments: false },
  );
  assert.deepEqual(rows, [
    ["knip (dashboard)", "Unused exports", 5, 6],
    ["knip (dashboard)", "Unused files", 1, 0],
    ["knip (dashboard)", "Unused types", 0, 1],
    ["jscpd", "clones", 4, 3],
    ["jscpd", "duplicated lines", 50, 51],
    ["jscpd", "duplicated lines % (not gated)", 1.5, 1.2],
  ]);
  assert.deepEqual(errors, [
    "knip (dashboard): Unused exports went from 5 to 6. Run `npx knip --directory dashboard` to see which.",
    "knip (dashboard): Unused types went from 0 to 1. Run `npx knip --directory dashboard` to see which.",
    "jscpd: duplicated lines went from 50 to 51. Run `npx jscpd` to see them.",
  ]);
  assert.deepEqual(lowered, ["knip (dashboard): Unused files 1 to 0", "jscpd: clones 4 to 3"]);
});

test("a tool with no baseline is reported and never an error", () => {
  const { rows, errors } = compare({}, { knip: { "Unused files": 9 }, jscpd: { clones: 50, lines: 600, percentage: 3 } });
  assert.deepEqual(rows, [
    ["knip", "Unused files", null, 9],
    ["jscpd", "clones", null, 50],
    ["jscpd", "duplicated lines", null, 600],
    ["jscpd", "duplicated lines % (not gated)", null, 3],
  ]);
  assert.deepEqual(errors, []);
});

test("a clean knip run is still a row", () => {
  assert.deepEqual(compare({ knip: {} }, { knip: {} }).rows, [["knip", "findings", 0, 0]]);
  assert.deepEqual(compare({}, { knip: {} }).rows, [["knip", "findings", null, 0]]);
});

test("scan tells comment lines from code past URLs, regular expressions and templates; testCases counts declared cases only", () => {
  const source = [
    'const u = "http://x/*y"; // a trailing comment is a code line',
    "/* a block",
    "   over two lines */",
    "const r = /\\/\\*[/]/.test(u) ? a / b : `${'//'} /* text */`;",
    "",
    'test("one", () => {});',
    'it.each([1, 2])("two %s", () => {});',
    'test.skip("three", () => {});',
    'test.skip(isMobile, "a runtime skip");',
    'test.describe("group", () => { test.beforeEach(() => {}); test.step("a step", () => {}); });',
    '// test("commented out")',
    'const s = "it(in a string)"; /re/.test(s);',
  ].join("\n");
  const { kinds, code } = scan(source);
  assert.deepEqual(kinds, ["code", "comment", "comment", "code", "blank", "code", "code", "code", "code", "code", "comment", "code"]);
  assert.equal(testCases(code), 3);
  assert.deepEqual(scan("a { color: red } /* note */\n/* only */\n", true).kinds, ["code", "comment"]);
});

test("countFiles counts test files by the globs, and the comment share of the source", () => {
  const files = { "src/a.ts": "// one\nexport const a = 1;\n", "test/a.test.ts": 'test("a", () => {});\n', "e2e/b.spec.ts": 'test("b", () => {});\n', "README.md": "# x\n" };
  const read = (/** @type {string} */ p) => files[/** @type {keyof typeof files} */ (p)];
  assert.deepEqual(countFiles({}, Object.keys(files), read), { tests: { files: 2, cases: 2 }, comments: { lines: 1, code: 3, percentage: 25 } });
  assert.deepEqual(countFiles({ tests: { ignore: ["e2e/**"] }, comments: false }, Object.keys(files), read), { tests: { files: 1, cases: 1 } });
});

test("a test added without a raise fails; the comment share warns past its tolerance, fails with fail: true, and passes when only code went", () => {
  const baseline = { tests: { files: 2, cases: 10 }, comments: { lines: 100, code: 900, percentage: 10 } };
  const grown = compare(baseline, { tests: { files: 2, cases: 11 }, comments: { lines: 130, code: 900, percentage: 12.62 } });
  assert.deepEqual(grown.errors, ["tests: test cases went from 10 to 11. A new test needs a reviewed raise of the baseline."]);
  assert.match(grown.warnings[0], /comments: the share of source lines that are comments went from 10% to 12.62% \(tolerance 1 points\)/);
  assert.match(compare(baseline, { comments: { lines: 130, code: 900, percentage: 12.62 } }, { comments: { fail: true } }).errors[0], /^comments: /);
  const deleted = compare(baseline, { tests: { files: 2, cases: 10 }, comments: { lines: 100, code: 500, percentage: 16.67 } });
  assert.deepEqual([deleted.errors, deleted.warnings], [[], []]);
  assert.deepEqual(compare(baseline, { tests: { files: 2, cases: 10 }, comments: { lines: 100, code: 900, percentage: 10.9 } }).warnings, []);
});

test("a baseline entry that no run in the config measures is stale, never skipped", () => {
  const { stale } = compare({ measured_at: "abc1234", "knip (old)": { "Unused files": 1 }, jscpd: { clones: 1 } }, {}, { jscpd: false });
  assert.equal(stale.length, 2);
  assert.match(stale[0], /the baseline has "knip \(old\)", which no run in the config measures/);
  assert.match(stale[1], /"jscpd"/);
});

/** A scratch repository with stand-in knip and jscpd in node_modules/.bin. */
function scratch({ knip = KNIP, clones = 4, jscpdFails = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "no-bloat-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\nsummary.md\n");
  const bin = join(dir, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "knip"), `#!/bin/sh\nprintf '%s' '${knip}'\n`);
  writeFileSync(
    join(bin, "jscpd"),
    jscpdFails
      ? "#!/bin/sh\necho 'jscpd: boom' >&2\nexit 3\n"
      : `#!/bin/sh\nwhile [ "$1" != "--output" ]; do shift; done\nprintf '{"statistics":{"total":{"clones":${clones},"duplicatedLines":30,"percentage":2.5,"sources":3}}}' > "$2/jscpd-report.json"\n`,
  );
  chmodSync(join(bin, "knip"), 0o755);
  chmodSync(join(bin, "jscpd"), 0o755);
  return dir;
}

const git = (/** @type {string} */ cwd, /** @type {string[]} */ ...args) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.com" } });

const runBin = (/** @type {string} */ cwd, /** @type {string[]} */ args = [], env = {}) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "", ...env } });

test("end to end: --write-baseline records the counts, a later run that grew fails, and one that shrank passes", { skip: process.platform === "win32" }, () => {
  const dir = scratch();
  try {
    writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ knip: [{ label: "knip (root)" }] }));
    const written = runBin(dir, ["--write-baseline"]);
    assert.equal(written.status, 0, written.stderr);
    const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));
    assert.deepEqual(config.knip, [{ label: "knip (root)" }]);
    assert.deepEqual(config.baseline["knip (root)"], { "Unused files": 2, "Unused exports": 3 });
    assert.deepEqual(config.baseline.jscpd, { clones: 4, lines: 30, percentage: 2.5 });
    assert.deepEqual(config.baseline.tests, { files: 0, cases: 0 });
    assert.equal(typeof config.baseline.measured_at, "string");

    const summary = join(dir, "summary.md");
    writeFileSync(summary, "");
    const grown = scratch({ clones: 7 });
    writeFileSync(join(grown, ".no-bloat.json"), JSON.stringify(config));
    const r = runBin(grown, [], { GITHUB_STEP_SUMMARY: summary });
    rmSync(grown, { recursive: true, force: true });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error::jscpd: clones went from 4 to 7/);
    assert.doesNotMatch(r.stdout, /::error::knip/);
    assert.match(readFileSync(summary, "utf8"), /### No-bloat ratchet \(baseline /);

    const shrunk = scratch({ clones: 2 });
    writeFileSync(join(shrunk, ".no-bloat.json"), JSON.stringify(config));
    const s = runBin(shrunk);
    rmSync(shrunk, { recursive: true, force: true });
    assert.equal(s.status, 0, s.stdout);
    assert.match(s.stdout, /::warning::Lower the baseline to lock this in \(jscpd: clones 4 to 2\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("end to end: a tool that fails is an error and exit 1, a warning under --warn-only; --write-baseline refuses a partial baseline", { skip: process.platform === "win32" }, () => {
  const dir = scratch({ jscpdFails: true });
  try {
    const r = runBin(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error::jscpd could not run: jscpd exited 3: jscpd: boom/);
    assert.match(r.stdout, /\| knip \| Unused files \| none \| 2 \|/);

    writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ baseline: { knip: { "Unused files": 1 } } }));
    const warned = runBin(dir, ["--warn-only"]);
    assert.equal(warned.status, 0, warned.stdout);
    assert.doesNotMatch(warned.stdout, /::error::/);
    assert.match(warned.stdout, /::warning::jscpd could not run/);
    assert.match(warned.stdout, /::warning::knip: Unused files went from 1 to 2/);

    const w = runBin(dir, ["--write-baseline"]);
    assert.equal(w.status, 1);
    assert.match(w.stderr, /the baseline was not written/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("end to end: a pull request that adds a test fails until its baseline is raised, and the summary has its lines by kind", { skip: process.platform === "win32" }, () => {
  const dir = scratch();
  try {
    writeFileSync(join(dir, "a.test.mjs"), 'test("a", () => {});\n');
    writeFileSync(join(dir, "notes.md"), "-- a line that starts with two dashes\n");
    assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "Base");
    git(dir, "checkout", "-qb", "change");
    writeFileSync(join(dir, "a.test.mjs"), 'test("a", () => {});\n// why b\ntest("b", () => {});\n');
    writeFileSync(join(dir, "notes.md"), "");
    git(dir, "commit", "-qam", "Add a test");

    const summary = join(dir, "summary.md");
    const r = runBin(dir, ["--lines-from", "main"], { GITHUB_STEP_SUMMARY: summary });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /::error::tests: test cases went from 1 to 2/);
    const lines = readFileSync(summary, "utf8");
    assert.match(lines, /\| tests \| 1 \| 0 \| \+1 \|/);
    assert.match(lines, /\| comments \| 1 \| 0 \| \+1 \|/);
    assert.match(lines, /\| docs \| 0 \| 1 \| -1 \|/);

    assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
    assert.equal(runBin(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("end to end: a config that is not JSON fails, rather than passing with no baseline", { skip: process.platform === "win32" }, () => {
  const dir = scratch();
  try {
    writeFileSync(join(dir, ".no-bloat.json"), "{ nope");
    const r = runBin(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /\.no-bloat\.json is not JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
