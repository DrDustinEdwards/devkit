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

import {
  compare,
  countFiles,
  knipCounts,
  lineChanges,
  measure,
  npxArgs,
  render,
  renderLines,
  scan,
  testCases,
} from "../bin/no-bloat.mjs";

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
    writeFileSync(
      join(out, "jscpd-report.json"),
      JSON.stringify({
        statistics: { total: { clones, duplicatedLines: 40, percentage, sources } },
      }),
    );
    return "";
  };
  return { run, calls };
};

test("a tool that is not installed is named to npx with --package, so an inherited npm_config_package cannot replace it", () => {
  assert.deepEqual(npxArgs("knip", "knip@6", ["--no-progress"]), [
    "--yes",
    "--package",
    "knip@6",
    "--",
    "knip",
    "--no-progress",
  ]);
});

test("knipCounts reads the compact report's headings, and refuses output it cannot read rather than pass it as clean", () => {
  assert.deepEqual(knipCounts(KNIP), { "Unused files": 2, "Unused exports": 3 });
  assert.deepEqual(knipCounts(""), {});
  assert.deepEqual(knipCounts("✂️  Excellent, Knip found no issues.\n"), {});
  assert.deepEqual(knipCounts("\n"), {});
  // Only a heading line counts: not a file line that ends in a count.
  assert.deepEqual(knipCounts("Unused exports (12)\nsrc/c.ts: Thing (4)\n"), {
    "Unused exports": 12,
  });
  assert.throws(
    () => knipCounts("src/a.ts: unused file\n"),
    /knip printed no report this reads: src\/a\.ts: unused file$/,
  );
});

test("with no config: one knip run, jscpd on the root unless the repository has its own .jscpd.json", () => {
  const bare = fakeRun();
  assert.deepEqual(measure({}, bare.run, false).counts, {
    knip: { "Unused files": 2, "Unused exports": 3 },
    jscpd: { clones: 4, lines: 40, percentage: 1.23 },
    "shared copies": { clones: 0, lines: 0 },
    tests: { files: 0, cases: 0 },
    comments: { lines: 0, code: 0, percentage: 0 },
  });
  assert.deepEqual(bare.calls[0], [
    "knip",
    ["--no-exit-code", "--no-progress", "--reporter", "compact"],
  ]);
  assert.deepEqual(
    bare.calls[1][1].filter((a) => !a.includes("jscpd-")),
    [".", "--reporters", "json", "--output", "--silent"],
  );

  const configured = fakeRun();
  measure({}, configured.run);
  assert.equal(configured.calls[1][1][0], "--reporters");
});

test("each knip run is labeled and passes its own arguments; jscpd's arguments come before the report flags", () => {
  const { run, calls } = fakeRun();
  const { counts } = measure(
    {
      knip: [
        { label: "knip (Worker)" },
        { label: "knip (dashboard)", args: ["--directory", "dashboard"] },
      ],
      jscpd: { args: ["app", "--min-lines", "8"] },
    },
    run,
  );
  assert.deepEqual(Object.keys(counts), [
    "knip (Worker)",
    "knip (dashboard)",
    "jscpd",
    "shared copies",
    "tests",
    "comments",
  ]);
  assert.deepEqual(calls[1][1].slice(0, 2), ["--directory", "dashboard"]);
  assert.deepEqual(calls[2][1].slice(0, 3), ["app", "--min-lines", "8"]);
});

test("jscpd, the shared copies, tests and comments each turn off with false; jscpd that read no files could not run", () => {
  const { run, calls } = fakeRun();
  assert.deepEqual(
    Object.keys(
      measure({ jscpd: false, shared: false, tests: false, comments: false }, run).counts,
    ),
    ["knip"],
  );
  assert.equal(calls.length, 1);
  assert.match(
    measure({}, fakeRun({ sources: 0 }).run).warnings[0],
    /jscpd could not run: it read no files/,
  );
  const unreadable = {
    list: () => ["a.test.ts"],
    read: () => {
      throw new Error("gone");
    },
  };
  assert.deepEqual(
    measure({ jscpd: false, shared: false }, fakeRun().run, true, unreadable).warnings,
    ["tests and comments could not be counted: gone"],
  );
});

test("what grew is an error; what shrank is a note to lower the baseline; a finding new to a known tool counts from zero", () => {
  const { rows, errors, lowered } = compare(
    {
      measured_at: "abc1234",
      "knip (dashboard)": { "Unused exports": 5, "Unused files": 1 },
      jscpd: { clones: 4, lines: 50, percentage: 1.5 },
    },
    {
      "knip (dashboard)": { "Unused exports": 6, "Unused types": 1 },
      jscpd: { clones: 3, lines: 51, percentage: 1.2 },
    },
    {
      knip: [{ label: "knip (dashboard)", args: ["--directory", "dashboard"] }],
      tests: false,
      comments: false,
    },
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
  // A knip label the config does not name is run with no arguments.
  assert.deepEqual(
    compare({ "knip (x)": { "Unused files": 1 } }, { "knip (x)": { "Unused files": 2 } }).errors,
    ["knip (x): Unused files went from 1 to 2. Run `npx knip` to see which."],
  );
});

test("a tool with no baseline is reported and never an error", () => {
  const { rows, errors } = compare(
    { jscpd: { clones: 50 } },
    { knip: { "Unused files": 9 }, jscpd: { clones: 50, lines: 600, percentage: 3 } },
  );
  assert.deepEqual(rows, [
    ["knip", "Unused files", null, 9],
    ["jscpd", "clones", 50, 50],
    ["jscpd", "duplicated lines", null, 600],
    ["jscpd", "duplicated lines % (not gated)", null, 3],
  ]);
  assert.deepEqual(errors, []);
  assert.equal(
    render([...rows, ["jscpd", "lines", 4, 3], ["tests", "cases", 3, 4]], [], "abc1234"),
    [
      "### No-bloat ratchet (baseline abc1234)",
      "",
      "| Tool | Finding | Baseline | Now |",
      "|---|---|---|---|",
      "| knip | Unused files | none | 9 |",
      "| jscpd | clones | 50 | 50 |",
      "| jscpd | duplicated lines | none | 600 |",
      "| jscpd | duplicated lines % (not gated) | none | 3 |",
      "| jscpd | lines | 4 | 3 |",
      "| tests | cases | 3 | 4 (up) |",
      "",
      "Nothing grew past the baseline.",
    ].join("\n"),
  );
  assert.match(
    render([], ["one", "two"], undefined),
    /\(no baseline yet: run `npx devkit-no-bloat --write-baseline`\)\n\n\| Tool \| Finding \| Baseline \| Now \|\n\|---\|---\|---\|---\|\n\n- one\n- two$/,
  );
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
  assert.deepEqual(kinds, [
    "code",
    "comment",
    "comment",
    "code",
    "blank",
    "code",
    "code",
    "code",
    "code",
    "code",
    "comment",
    "code",
  ]);
  assert.equal(testCases(code), 3);
  // Every modifier declares a case; one that takes data or a condition first is a case too, and a runtime one is not.
  const modifiers = [
    'test.only("a", f); test.todo("b"); test.concurrent("c", f); test.sequential("d", f); test.fails("e", f); test.fixme("f", f);',
    'test.fail("g", f); test.slow("h", f); test.for([1])("i", f); test.skipIf(x)("j", f); test.runIf(x)("k", f);',
    'test.skip.each([1])("l", f); test.fixme.for([1])("m", f); test.fail.skipIf(x)("n", f); test.slow.runIf(x)("o", f);',
    "test.fixme(isMobile); test.fail(isMobile); test.slow(isMobile); test.slow(); function* test() {} function test(a) {}",
  ];
  assert.equal(testCases(scan(modifiers.join("\n")).code), 15);
  // node:test subtests and mocha's specify are cases; a RegExp's test() is not.
  assert.equal(
    testCases(
      scan('it("a", f); specify("b", f); await t.test("c", f); await t.it("d", f); re.test("x");')
        .code,
    ),
    4,
  );
  assert.deepEqual(scan("a { color: red } /* note */\n/* only */\n", true).kinds, [
    "code",
    "comment",
  ]);
  // What is blanked: a regex where an operand can start (file start, after an operator, a keyword or a parenthesis that
  // is not a call's), never a division; strings with escapes; a template's text, not its ${ }, nested; an unclosed comment.
  const tricky = [
    "/x/.test(a) && b / c / d;",
    'const s = "a\\"b" + \'c\\\'d\' + `e${ { f: "g" }.f + `h${i}` }j\\`k`;',
    "if (x) return /[/]\\/y/g; else (z) / 2; typeof /q/; a[0] / b;",
    "case /q/: do /q/; in /q/; of /q/; new /q/; delete /q/; void /q/; throw /q/; yield /q/; await /q/; instanceof /q/; x / q / y;",
    "const r = /[x/]+/; } /* open",
    "  still a comment",
  ].join("\n");
  assert.equal(
    scan(tricky).code,
    [
      "/ /.test(a) && b / c / d;",
      'const s = "    " + \'    \' + ` ${ { f: " " }.f + ` ${i}` }    `;',
      "if (x) return /      /g; else (z) / 2; typeof / /; a[0] / b;",
      "case / /: do / /; in / /; of / /; new / /; delete / /; void / /; throw / /; yield / /; await / /; instanceof / /; x / q / y;",
      "const r = /     /; }        ",
      "                 ",
      "",
    ].join("\n"),
  );
  // In CSS, // is no comment.
  assert.deepEqual(scan('a { background: url(//x.png) } /* c */\n"s // t"', true), {
    kinds: ["code", "code"],
    code: 'a { background: url(//x.png) }        \n"      "\n',
  });
});

test("countFiles counts test files by the globs, and the comment share of the source", () => {
  // In CSS, // starts no comment.
  const files = {
    "src/a.ts": "// one\n// two\nexport const a = 1;\n",
    "src/b.css": "//x\n",
    "test/a.test.ts": 'test("a", () => {});\n',
    "e2e/b.spec.ts": 'test("b", () => {});\n',
    "README.md": "# x\n",
  };
  const read = (/** @type {string} */ p) => files[/** @type {keyof typeof files} */ (p)];
  assert.deepEqual(countFiles({}, Object.keys(files), read), {
    tests: { files: 2, cases: 2 },
    comments: { lines: 2, code: 4, percentage: 33.33 },
  });
  assert.deepEqual(
    countFiles({ tests: { ignore: ["e2e/**"] }, comments: false }, Object.keys(files), read),
    { tests: { files: 1, cases: 1 } },
  );
  assert.deepEqual(
    countFiles({ tests: false, comments: { files: ["src/**"] } }, Object.keys(files), read),
    { comments: { lines: 2, code: 2, percentage: 50 } },
  );
});

test("a test added without a raise fails; the comment share warns past its tolerance, fails with fail: true, and passes when only code went", () => {
  const baseline = {
    tests: { files: 2, cases: 10 },
    comments: { lines: 100, code: 900, percentage: 10 },
  };
  const grown = compare(baseline, {
    tests: { files: 2, cases: 11 },
    comments: { lines: 130, code: 900, percentage: 12.62 },
  });
  assert.deepEqual(grown.errors, [
    "tests: test cases went from 10 to 11. A new test is recorded with `npx devkit-no-bloat --write-baseline` in the same change.",
  ]);
  assert.deepEqual(grown.rows.slice(2), [
    ["comments", "comment lines", 100, 130],
    ["comments", "share of lines % (tolerance 1)", 10, 12.62],
  ]);
  assert.deepEqual(compare(baseline, { tests: { files: 3, cases: 10 } }).errors, [
    "tests: test files went from 2 to 3. A new test file is recorded with `npx devkit-no-bloat --write-baseline` in the same change.",
  ]);
  assert.match(
    grown.warnings[0],
    /comments: the share of source lines that are comments went from 10% to 12.62% \(tolerance 1 points\)/,
  );
  assert.match(
    compare(
      baseline,
      { comments: { lines: 130, code: 900, percentage: 12.62 } },
      { comments: { fail: true } },
    ).errors[0],
    /^comments: /,
  );
  const deleted = compare(baseline, {
    tests: { files: 2, cases: 10 },
    comments: { lines: 100, code: 500, percentage: 16.67 },
  });
  assert.deepEqual([deleted.errors, deleted.warnings], [[], []]);
  assert.deepEqual(
    compare(baseline, {
      tests: { files: 2, cases: 10 },
      comments: { lines: 100, code: 900, percentage: 10.9 },
    }).warnings,
    [],
  );
  // A rise of exactly the tolerance passes; a fall of it is named.
  assert.deepEqual(
    compare(baseline, { comments: { lines: 130, code: 900, percentage: 11 } }).warnings,
    [],
  );
  assert.match(
    compare(baseline, { comments: { lines: 90, code: 900, percentage: 9 } }).warnings[0],
    /^comments: the share fell from 10% to 9%\. Lower the baseline/,
  );
  assert.deepEqual(
    compare(baseline, { comments: { lines: 90, code: 900, percentage: 9.01 } }).warnings,
    [],
  );
});

test("a baseline entry that no run in the config measures is stale, never skipped", () => {
  const { stale } = compare(
    { measured_at: "abc1234", "knip (old)": { "Unused files": 1 }, jscpd: { clones: 1 } },
    {},
    { jscpd: false },
  );
  assert.equal(stale.length, 2);
  assert.match(stale[0], /the baseline has "knip \(old\)", which no run in the config measures/);
  assert.match(stale[1], /"jscpd"/);
});

test("lineChanges sorts a diff's lines into code, tests, comments, docs and other, reading a renamed file at its old path", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -2 +2,2 @@",
    "-old code",
    "+// new comment",
    "+new code",
    "diff --git a/test/a.test.ts b/test/a.test.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/test/a.test.ts",
    "@@ -0,0 +1,2 @@",
    '+test("a", () => {});',
    "+",
    "diff --git a/docs/x.md b/docs/x.md",
    "--- a/docs/x.md",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    "-# Title",
    "-",
    'diff --git "a/notes \\"q\\".json" "b/notes \\"q\\".json"',
    '--- "a/notes \\"q\\".json"\t',
    '+++ "b/notes \\"q\\".json"\t',
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "diff --git a/src/old.ts b/src/new.ts",
    "rename from src/old.ts",
    "--- a/src/old.ts",
    "+++ b/src/new.ts",
    "@@ -3 +3 @@",
    "-x",
    "+y",
  ].join("\n");
  /** @type {string[]} */
  const asked = [];
  const kinds = /** @type {Record<string, Array<"code" | "comment" | "blank">>} */ ({
    "old src/a.ts": ["code", "code"],
    "new src/a.ts": ["code", "comment", "code"],
  });
  const totals = lineChanges(
    {},
    diff,
    (side, path) => (asked.push(`${side} ${path}`), kinds[`${side} ${path}`] ?? null),
  );
  assert.deepEqual(asked, [
    "old src/a.ts",
    "new src/a.ts",
    "new test/a.test.ts",
    "old src/old.ts",
    "new src/new.ts",
  ]);
  assert.equal(
    renderLines(totals, "abcdef1234"),
    [
      "### Lines added and removed (against abcdef1, blank lines not counted)",
      "",
      "| Lines | Added | Removed | Net |",
      "|---|---|---|---|",
      "| code | 2 | 2 | 0 |",
      "| tests | 1 | 0 | +1 |",
      "| comments | 1 | 0 | +1 |",
      "| docs | 0 | 1 | -1 |",
      "| other | 1 | 1 | 0 |",
    ].join("\n"),
  );
});

/** A scratch repository with stand-in knip and jscpd in node_modules/.bin. */
function scratch({ knip = KNIP, clones = 4, jscpdFails = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "no-bloat-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\nsummary.md\n");
  const bin = join(dir, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "knip"),
    `#!/bin/sh\nif [ "$1" = "--fail" ]; then echo 'knip: boom' >&2; exit 2; fi\nprintf '%s' '${knip}'\n`,
  );
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
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "T",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "T",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  });

const runBin = (/** @type {string} */ cwd, /** @type {string[]} */ args = [], env = {}) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_ACTIONS: "true", ...env },
  });

test(
  "end to end: --write-baseline records the counts, a later run that grew fails, and so does one that shrank until the baseline is lowered",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(
        join(dir, ".no-bloat.json"),
        JSON.stringify({ knip: [{ label: "knip (root)" }] }),
      );
      const written = runBin(dir, ["--write-baseline"]);
      assert.equal(written.status, 0, written.stderr);
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));
      assert.deepEqual(config.knip, [{ label: "knip (root)" }]);
      assert.deepEqual(config.baseline["knip (root)"], { "Unused files": 2, "Unused exports": 3 });
      assert.deepEqual(config.baseline.jscpd, { clones: 4, lines: 30, percentage: 2.5 });
      assert.deepEqual(config.baseline.tests, { files: 0, cases: 0 });
      // No commit yet: the day.
      assert.match(config.baseline.measured_at, /^\d{4}-\d{2}-\d{2}$/);

      const summary = join(dir, "summary.md");
      writeFileSync(summary, "");
      const grown = scratch({ clones: 7 });
      writeFileSync(join(grown, ".no-bloat.json"), JSON.stringify(config));
      const r = runBin(grown, [], { GITHUB_STEP_SUMMARY: summary });
      rmSync(grown, { recursive: true, force: true });
      assert.equal(r.status, 1);
      assert.match(
        r.stdout,
        /\| jscpd \| clones \| 4 \| 7 \(up\) \|\n\| jscpd \| duplicated lines \| 30 \| 30 \|\n/,
      );
      assert.match(
        r.stdout,
        /::error::jscpd: clones went from 4 to 7. Run `npx jscpd` to see them.\n::error::Remove what was added:/,
      );
      assert.doesNotMatch(r.stdout, /::error::knip/);
      assert.match(readFileSync(summary, "utf8"), /### No-bloat ratchet \(baseline /);

      const shrunk = scratch({ clones: 2 });
      writeFileSync(join(shrunk, ".no-bloat.json"), JSON.stringify(config));
      const s = runBin(shrunk);
      assert.equal(s.status, 1, s.stdout);
      assert.match(
        s.stdout,
        /::error::Lower the baseline to lock this in \(jscpd: clones 4 to 2\)/,
      );
      assert.equal(runBin(shrunk, ["--write-baseline"]).status, 0);
      assert.equal(runBin(shrunk).status, 0);
      rmSync(shrunk, { recursive: true, force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a tool that fails is an error and exit 1, there is no --warn-only, and --write-baseline refuses a partial baseline",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch({ jscpdFails: true });
    try {
      const r = runBin(dir);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /::error::jscpd could not run: jscpd exited 3: jscpd: boom/);
      assert.match(r.stdout, /\| knip \| Unused files \| none \| 2 \|/);

      writeFileSync(
        join(dir, "bloat.json"),
        JSON.stringify({
          knip: [{ label: "knip" }, { label: "knip (broken)", args: ["--fail"] }],
          baseline: { knip: { "Unused files": 1 } },
        }),
      );
      const failed = runBin(dir, ["--config", "bloat.json", "--lines-from", "no-such-rev"]);
      assert.equal(failed.status, 1, failed.stdout);
      assert.match(
        failed.stdout,
        /::error::knip \(broken\) could not run: knip exited 2: knip: boom/,
      );
      assert.match(failed.stdout, /::error::jscpd could not run/);
      assert.match(failed.stdout, /::error::knip: Unused files went from 1 to 2/);
      assert.match(failed.stdout, /::error::The baseline at no-such-rev could not be read: /);
      // A report never stops a copy, so there is no report mode.
      const warnOnly = runBin(dir, ["--warn-only"]);
      assert.equal(warnOnly.status, 2);
      assert.match(warnOnly.stderr, /--warn-only was removed in 0\.37\.0/);

      const w = runBin(dir, ["--write-baseline"]);
      assert.equal(w.status, 1);
      assert.match(
        w.stderr,
        /^devkit-no-bloat: jscpd could not run: [^\n]*\ndevkit-no-bloat: the baseline was not written/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a pull request that adds a test fails until its baseline is raised, and the summary has its lines by kind",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, "a.test.mjs"), '// why a\ntest("a", () => {});\n');
      writeFileSync(join(dir, "notes.md"), "-- a line that starts with two dashes\n");
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");
      writeFileSync(
        join(dir, "a.test.mjs"),
        'test("a", () => {});\n// why b\ntest("b", () => {});\n',
      );
      writeFileSync(join(dir, "notes.md"), "");
      git(dir, "commit", "-qam", "Add a test");

      const summary = join(dir, "summary.md");
      const r = runBin(dir, ["--lines-from", "main"], { GITHUB_STEP_SUMMARY: summary });
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /::error::tests: test cases went from 1 to 2/);
      const lines = readFileSync(summary, "utf8");
      assert.match(lines, /\| tests \| 1 \| 0 \| \+1 \|/);
      // The removed comment is read at the base, where it was a comment.
      assert.match(lines, /\| comments \| 1 \| 1 \| 0 \|/);
      assert.match(lines, /\| docs \| 0 \| 1 \| -1 \|/);

      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      assert.equal(
        JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8")).baseline.measured_at,
        git(dir, "rev-parse", "--short", "HEAD").trim(),
      );
      assert.equal(runBin(dir).status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a raised baseline fails on a pull request and in a local run, a tools change does not excuse it, and only a change that moves no code may raise",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", devDependencies: { a: "1.0.0" } }),
      );
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");
      // A copy and the raise that would let it in, with the tools moved too.
      writeFileSync(join(dir, "copy.mjs"), "export const a = 1;\n");
      const grown = join(dir, "node_modules", ".bin", "jscpd");
      writeFileSync(grown, readFileSync(grown, "utf8").replace('"clones":4', '"clones":5'));
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));
      config.tools = { jscpd: "jscpd@4.4.0" };
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      const refused = runBin(dir, ["--write-baseline"], { GITHUB_ACTIONS: "" });
      // A local run with no remote names what to pass.
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /none of origin\/HEAD, origin\/main, origin\/master resolves/);
      git(dir, "update-ref", "refs/remotes/origin/main", "main");
      const w = runBin(dir, ["--write-baseline"], { GITHUB_ACTIONS: "" });
      assert.equal(w.status, 1, w.stderr);
      assert.match(w.stderr, /jscpd: this change raises the baseline's clones from 4 to 5/);
      assert.match(w.stderr, /the baseline was not written/);
      config.baseline.jscpd.clones = 5;
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Raise");
      const pr = runBin(dir, ["--lines-from", "main"]);
      assert.equal(pr.status, 1, pr.stdout);
      assert.match(
        pr.stdout,
        /::error::jscpd: this change raises the baseline's clones from 4 to 5/,
      );
      const local = runBin(dir, [], { GITHUB_ACTIONS: "" });
      assert.equal(local.status, 1, local.stdout);
      assert.match(local.stdout, /::error::jscpd: this change raises the baseline's clones/);
      // A run on the default branch in Actions has nothing to compare.
      assert.equal(runBin(dir).status, 0);

      // The same raise with no code moved (a tool bump: config, lockfile, versions) passes; a new library does not.
      git(dir, "rm", "-q", "copy.mjs");
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", devDependencies: { a: "2.0.0" } }),
      );
      writeFileSync(join(dir, "package-lock.json"), "{}");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Bump");
      assert.equal(runBin(dir, ["--lines-from", "main"]).status, 0);
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", devDependencies: { a: "2.0.0", unused: "1.0.0" } }),
      );
      git(dir, "commit", "-qam", "Add a library");
      assert.equal(runBin(dir, ["--lines-from", "main"]).status, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a baseline count new in the change is raised from 0, and an exception added without a reason fails",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ shared: false }));
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));
      delete config.baseline.knip;
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      writeFileSync(join(dir, "knip.json"), '{\n  "ignore": ["old/**"]\n}\n');
      writeFileSync(join(dir, ".jscpd.json"), '{ "ignore": ["**/node_modules/**"] }\n');
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");
      writeFileSync(join(dir, "a.mjs"), "export const a = 1;\n");
      assert.equal(runBin(dir, ["--write-baseline"], { GITHUB_ACTIONS: "" }).status, 1);
      config.baseline.knip = { "Unused files": 2, "Unused exports": 3 };
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      writeFileSync(
        join(dir, "knip.json"),
        '{\n  // Generated by the build, read by nothing here.\n  "ignore": ["old/**", "gen/**"],\n  "ignoreDependencies": [\n    "a",\n    "b" // used by the deploy script\n  ]\n}\n',
      );
      writeFileSync(join(dir, ".jscpd.json"), '{ "ignore": ["**/node_modules/**", "copy/**"] }\n');
      writeFileSync(
        join(dir, "b.mjs"),
        "// jscpd:ignore-start\nexport const b = 1;\n// jscpd:ignore-end\n// jscpd:ignore-start the fixture mirrors the API reply\n",
      );
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Change");
      const r = runBin(dir, ["--lines-from", "main"]);
      assert.equal(r.status, 1, r.stdout);
      assert.match(
        r.stdout,
        /::error::knip: this change raises the baseline's Unused files from 0 to 2/,
      );
      assert.match(
        r.stdout,
        /::error::knip\.json: the ignore entry "a" is new and says nothing about why/,
      );
      assert.doesNotMatch(r.stdout, /ignore entry "(?:gen\/\*\*|b|old\/\*\*)"/);
      assert.match(r.stdout, /::error::\.jscpd\.json: the ignore entry "copy\/\*\*" is new/);
      assert.match(
        r.stdout,
        /::error::a new `jscpd:ignore-start` gives no reason \(\/\/ jscpd:ignore-start\)/,
      );
      assert.equal(r.stdout.match(/::error::a new `jscpd:ignore-start`/g)?.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: no config, or one with an empty baseline, fails rather than passing every count",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      const missing = runBin(dir);
      assert.equal(missing.status, 1);
      assert.match(missing.stdout, /\.no-bloat\.json does not exist, so every count would pass/);
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ baseline: {} }));
      const empty = runBin(dir);
      assert.equal(empty.status, 1);
      assert.match(empty.stdout, /\.no-bloat\.json has no baseline/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a config that is not JSON fails, rather than passing with no baseline",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), "{ nope");
      const r = runBin(dir);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /\.no-bloat\.json is not JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
