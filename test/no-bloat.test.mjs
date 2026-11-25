// The no-bloat bin's units: counts read from the tools and the files, compared with the baseline, failing only on growth. They run
// against a fake runner or the bin in a scratch git repository, with stand-in tools where DEVKIT_NO_BLOAT_TOOLS points, so nothing is downloaded.

import assert from "node:assert/strict";
import test from "node:test";

import { raised } from "../bin/no-bloat/classify.mjs";
import { compare, lineChanges, render, renderLines } from "../bin/no-bloat/compare.mjs";
import { countFiles, measure } from "../bin/no-bloat/count.mjs";
import { knipCounts, legacyCounts, scan, testCases } from "../bin/no-bloat/scan.mjs";
import { KNIP, fakeRun } from "./fixtures/no-bloat.mjs";

test("knipCounts counts each issue in Knip's JSON report, not each file, and refuses output it cannot read rather than pass it as clean", () => {
  // Three unused exports in one file are three, and two unused dependencies in one package.json are two.
  assert.deepEqual(knipCounts(KNIP), { files: 2, exports: 3 });
  assert.deepEqual(
    knipCounts(
      JSON.stringify({
        issues: [{ file: "package.json", dependencies: [{ name: "a" }, { name: "b" }] }],
      }),
    ),
    { dependencies: 2 },
  );
  assert.deepEqual(knipCounts('{"issues":[]}'), {});
  // A plugin's warning on stdout before the report is not the report.
  assert.deepEqual(knipCounts(`[WARN] Missing pages directory: src/pages\n${KNIP}\n`), {
    files: 2,
    exports: 3,
  });
  for (const text of ["", "Unused files (2)\nsrc/a.ts\n", "{}"])
    assert.throws(() => knipCounts(text), /knip printed no report this reads/);
});

test("with no config: one knip run, jscpd on the root unless the repository has its own .jscpd.json", () => {
  const bare = fakeRun();
  assert.deepEqual(measure({}, bare.run, false).counts, {
    knip: { files: 2, exports: 3 },
    jscpd: { clones: 4, lines: 40, percentage: 1.23, unread: 0 },
    "shared copies": { clones: 0, lines: 0 },
    legacy: { dialog: 2, "dark-mode": 1 },
    size: {},
    tests: { files: 0, cases: 0 },
    comments: { lines: 0, code: 0, percentage: 0 },
  });
  assert.deepEqual(bare.calls.at(-1), ["modern-web-guidance", ["legacy-scan", ".", "--json"]]);
  assert.deepEqual(bare.calls[0], [
    "knip",
    ["--no-exit-code", "--no-progress", "--reporter", "json"],
  ]);
  assert.deepEqual(
    bare.calls[1][1].filter((a) => !a.includes("jscpd-")),
    [".", "--absolute", "--reporters", "json", "--output", "--silent"],
  );

  const configured = fakeRun();
  measure({}, configured.run);
  assert.equal(configured.calls[1][1][0], "--absolute");
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
    "legacy",
    "size",
    "tests",
    "comments",
  ]);
  assert.deepEqual(calls[1][1].slice(0, 2), ["--directory", "dashboard"]);
  assert.deepEqual(calls[2][1].slice(0, 3), ["app", "--min-lines", "8"]);
});

test("jscpd, the shared copies, the legacy scan, tests and comments each turn off with false; jscpd that read no files could not run, and a legacy report whose guides do not add up is refused", () => {
  const { run, calls } = fakeRun();
  assert.deepEqual(
    Object.keys(
      measure({ jscpd: false, shared: false, legacy: false, tests: false, comments: false }, run)
        .counts,
    ),
    ["knip"],
  );
  assert.equal(calls.length, 1);
  assert.match(
    measure({}, fakeRun({ sources: 0 }).run).warnings[0],
    /jscpd could not run: it read no files/,
  );
  assert.throws(
    () => legacyCounts('{"totalFindings":2,"guides":[{"guideId":"dialog","count":1}]}'),
    /counted 2 findings but its guides add to 1/,
  );
  // A match with `legacy-scan:keep`, its guide and a reason on its line or the line above is not counted; one whose marker
  // names another guide is.
  const scan = JSON.stringify({
    targetDir: "src",
    totalFindings: 3,
    guides: [
      {
        guideId: "ime-safe-enter-submit",
        count: 3,
        rules: [{ findings: [3, 5, 8].map((line) => ({ file: "a.ts", line })) }],
      },
    ],
  });
  const body = [
    "",
    "// legacy-scan:keep ime-safe-enter-submit isImeEnter guards it, from Capsomer's shortcuts",
    'if (e.key === "Enter" && !isImeEnter(e)) go();',
    "",
    'if (e.key === "Enter" && !isImeEnter(e)) go(); // legacy-scan:keep ime-safe-enter-submit the shared helper checks composition',
    "",
    "// legacy-scan:keep dialog the dialog guide's rubric drops this one",
    'if (e.key === "Enter") go();',
  ].join("\n");
  assert.deepEqual(
    legacyCounts(scan, (p) => (p === "src/a.ts" ? body : "")),
    { "ime-safe-enter-submit": 1 },
  );
  const unreadable = {
    list: () => ["a.test.ts"],
    read: () => {
      throw new Error("gone");
    },
  };
  assert.deepEqual(
    measure({ jscpd: false, shared: false, legacy: false }, fakeRun().run, true, unreadable)
      .warnings,
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

test("a tool with no baseline is a row and an error, so dropping its entry cannot turn its gate off", () => {
  const { rows, errors, stale } = compare(
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
  assert.deepEqual(stale, [
    "knip: the baseline has no count yet. Run `npx devkit-no-bloat --write-baseline` and commit the config.",
  ]);
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
    size: {},
    tests: { files: 2, cases: 2 },
    comments: { lines: 2, code: 4, percentage: 33.33 },
  });
  assert.deepEqual(
    countFiles(
      { tests: { ignore: ["e2e/**"] }, comments: false, size: false },
      Object.keys(files),
      read,
    ),
    { tests: { files: 1, cases: 1 } },
  );
  assert.deepEqual(
    countFiles(
      { tests: false, size: false, comments: { files: ["src/**"] } },
      Object.keys(files),
      read,
    ),
    { comments: { lines: 2, code: 2, percentage: 50 } },
  );
});

test("a file over its size cap is listed: a new one fails, a listed one may not grow, and a cut one lowers", () => {
  const long = (/** @type {number} */ n) => "a();\n".repeat(n);
  const files = {
    "src/big.ts": long(501),
    "src/ok.ts": long(500),
    "t/a.test.ts": long(801),
    "t/b.test.ts": long(800),
  };
  const read = (/** @type {string} */ p) => files[/** @type {keyof typeof files} */ (p)];
  const { size } = countFiles({ tests: false, comments: false }, Object.keys(files), read);
  assert.deepEqual(size, { "src/big.ts": 501, "t/a.test.ts": 801 });
  assert.deepEqual(
    countFiles({ tests: false, comments: false, size: { source: 600 } }, ["src/big.ts"], read).size,
    {},
  );
  const base = { size: { "src/big.ts": 501, "src/gone.ts": 600 } };
  const same = compare(base, { size: { "src/big.ts": 501 } });
  assert.deepEqual(same.errors, []);
  assert.deepEqual(same.lowered, ["size: src/gone.ts 600 to 0"]);
  const worse = compare(base, {
    size: { "src/big.ts": 502, "src/new.ts": 510, "src/gone.ts": 600 },
  });
  const code = { code: true, definition: [], workflow: [], back: [] };
  assert.deepEqual(raised({ baseline: base }, { baseline: {} }, code), []);
  assert.match(
    raised(
      { baseline: { size: { "a.ts": 9 } } },
      { baseline: { size: { "a.ts": 8 } } },
      code,
    ).join(),
    /raises the baseline's a.ts from 8 to 9/,
  );
  assert.equal(worse.errors.length, 2);
  assert.match(worse.errors[0], /size: src\/big.ts went from 501 to 502/);
  assert.match(worse.errors[1], /size: src\/new.ts went from 0 to 510/);
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
