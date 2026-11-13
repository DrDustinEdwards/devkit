// The no-bloat bin: counts read from the tools and the files, compared with the repository's baseline, failing only on
// growth. The units run against a fake runner; the end-to-end cases run the bin itself in a scratch git repository, with
// stand-ins for knip, jscpd and the legacy scanner where DEVKIT_NO_BLOAT_TOOLS points, so nothing is downloaded.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkTools,
  checkoutProblems,
  classify,
  compare,
  countFiles,
  hiddenFiles,
  isReason,
  knipCounts,
  legacyCounts,
  lineChanges,
  knipEntries,
  knipPluginFiles,
  lockfileProblems,
  measure,
  narrowed,
  raised,
  render,
  renderLines,
  scan,
  testCases,
  unreadAdded,
  unreadFiles,
  unreasoned,
  workflowInputs,
} from "../bin/no-bloat.mjs";

const BIN = fileURLToPath(new URL("../bin/no-bloat.mjs", import.meta.url));
const YAML_DIR = fileURLToPath(new URL("../node_modules/yaml", import.meta.url));
const { parse: parseYaml } = await import("yaml");

const KNIP = JSON.stringify({
  issues: [
    { file: "src/a.ts", files: [{ name: "src/a.ts" }], exports: [] },
    { file: "src/b.ts", files: [{ name: "src/b.ts" }] },
    { file: "src/c.ts", exports: [{ name: "x" }, { name: "y" }, { name: "z" }] },
  ],
});

/** The legacy scanner's JSON report: three matches over two guides. */
const LEGACY = JSON.stringify({
  totalFindings: 3,
  guides: [
    { guideId: "dialog", count: 2, rules: [] },
    { guideId: "dark-mode", count: 1, rules: [] },
  ],
});

/** A runner that answers knip with `knip` and writes a jscpd report with `clones` into the --output directory. */
const fakeRun = ({ knip = KNIP, clones = 4, percentage = 1.234, sources = 9 } = {}) => {
  /** @type {Array<[string, string[]]>} */
  const calls = [];
  /** @type {import("../bin/no-bloat.mjs").Runner} */
  const run = (name, args) => {
    calls.push([name, args]);
    if (name === "knip") return knip;
    if (name === "modern-web-guidance") return LEGACY;
    const out = args[args.indexOf("--output") + 1];
    writeFileSync(
      join(out, "jscpd-report.json"),
      JSON.stringify({
        statistics: {
          total: { clones, duplicatedLines: 40, percentage, sources },
          formats: {
            javascript: {
              sources: Object.fromEntries(
                Array.from({ length: sources }, (_, i) => [`f${i}.js`, {}]),
              ),
            },
          },
        },
      }),
    );
    return "";
  };
  return { run, calls };
};

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

/**
 * A scratch repository, with stand-in knip and jscpd as an install DEVKIT_NO_BLOAT_TOOLS names (runBin), and in its own
 * node_modules/.bin a knip and a jscpd that would report nothing, which the check must never run.
 */
function scratch({ knip = KNIP, clones = 4, jscpdFails = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "no-bloat-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\nsummary.md\n");
  const bin = join(dir, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["knip", "jscpd", "modern-web-guidance"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\necho '{\"issues\":[]}'\nexit 9\n");
    chmodSync(join(bin, name), 0o755);
    mkdirSync(join(dir, "node_modules", ".tools", "node_modules", name), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", ".tools", "node_modules", name, "package.json"),
      JSON.stringify({ name, type: "module", bin: { [name]: "bin.mjs" } }),
    );
  }
  // The real YAML parser, and a Knip plugin list of one: Mocha's config files.
  symlinkSync(YAML_DIR, join(dir, "node_modules", ".tools", "node_modules", "yaml"), "dir");
  const plugins = join(dir, "node_modules", ".tools", "node_modules", "knip", "dist", "plugins");
  mkdirSync(plugins, { recursive: true });
  writeFileSync(
    join(plugins, "index.js"),
    'export const Plugins = { mocha: { config: [".mocharc.{js,cjs,mjs,json}", "package.json"] } };\n',
  );
  writeFileSync(
    tool(dir, "knip"),
    `if (process.argv.includes("--fail")) { console.error("knip: boom"); process.exit(2); }\nprocess.stdout.write(${JSON.stringify(knip)});\n`,
  );
  writeFileSync(
    tool(dir, "modern-web-guidance"),
    `process.stdout.write(${JSON.stringify(LEGACY)});\n`,
  );
  writeFileSync(
    tool(dir, "jscpd"),
    jscpdFails
      ? 'console.error("jscpd: boom");\nprocess.exit(3);\n'
      : // It reads every file git lists, so none is unread.
        `import { execFileSync } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nconst out = process.argv[process.argv.indexOf("--output") + 1];\nconst sources = Object.fromEntries(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\\n").filter(Boolean).map((p) => [p, {}]));\nwriteFileSync(out + "/jscpd-report.json", JSON.stringify({ statistics: { total: { clones: ${clones}, duplicatedLines: 30, percentage: 2.5, sources: Object.keys(sources).length }, formats: { javascript: { sources } } } }));\n`,
  );
  return dir;
}

/** A stand-in tool's script in a scratch repository. */
const tool = (/** @type {string} */ dir, /** @type {string} */ name) =>
  join(dir, "node_modules", ".tools", "node_modules", name, "bin.mjs");

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
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: "",
      GITHUB_ACTIONS: "true",
      // A scratch repository is counted as its working tree, not as the commit of the run these tests run in.
      GITHUB_SHA: "",
      DEVKIT_NO_BLOAT_TOOLS: join(cwd, "node_modules", ".tools"),
      ...env,
    },
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
      assert.deepEqual(config.baseline["knip (root)"], { files: 2, exports: 3 });
      assert.deepEqual(config.baseline.jscpd, { clones: 4, lines: 30, percentage: 2.5, unread: 0 });
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
      assert.match(r.stdout, /\| knip \| files \| none \| 2 \|/);

      writeFileSync(
        join(dir, "bloat.json"),
        JSON.stringify({
          knip: [{ label: "knip" }, { label: "knip (broken)", args: ["--fail"] }],
          baseline: { knip: { files: 1 } },
        }),
      );
      const failed = runBin(dir, ["--config", "bloat.json", "--lines-from", "no-such-rev"]);
      assert.equal(failed.status, 1, failed.stdout);
      assert.match(
        failed.stdout,
        /::error::knip \(broken\) could not run: knip exited 2: knip: boom/,
      );
      assert.match(failed.stdout, /::error::jscpd could not run/);
      assert.match(failed.stdout, /::error::knip: files went from 1 to 2/);
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
      const grown = tool(dir, "jscpd");
      writeFileSync(grown, readFileSync(grown, "utf8").replace("clones: 4", "clones: 5"));
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
      // Setting GITHUB_ACTIONS does not skip a default branch that resolves.
      assert.equal(runBin(dir).status, 1);
      // Nor does pointing --lines-from at the change itself.
      const self = runBin(dir, ["--lines-from", "HEAD"]);
      assert.equal(self.status, 1, self.stdout);
      assert.match(self.stdout, /HEAD is the change itself/);

      // The same raise with no code moved (a tool bump: config, lockfile, versions) passes; a new library does not.
      git(dir, "rm", "-q", "copy.mjs");
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", devDependencies: { a: "2.0.0" } }),
      );
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
      config.baseline.knip = { files: 2, exports: 3 };
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      writeFileSync(
        join(dir, "knip.json"),
        '{\n  // Generated by the build, read by nothing here.\n  "ignore": ["old/**", "gen/**"],\n  "ignoreDependencies": [\n    "a",\n    "b" // used by the deploy script\n  ]\n}\n',
      );
      writeFileSync(join(dir, ".jscpd.json"), '{ "ignore": ["**/node_modules/**", "copy/**"] }\n');
      writeFileSync(
        join(dir, "b.mjs"),
        "// jscpd:ignore-start\nexport const b = 1;\n// jscpd:ignore-end\n// jscpd:ignore-start the fixture mirrors the API reply\n/** @public */\nexport const c = 1;\n/** @public read by the docs build */\n",
      );
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Change");
      const r = runBin(dir, ["--lines-from", "main"]);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /::error::knip: this change raises the baseline's files from 0 to 2/);
      assert.match(
        r.stdout,
        /::error::knip\.json line 5 \("a",\) is new and says nothing about why/,
      );
      assert.doesNotMatch(r.stdout, /knip\.json line [346] /);
      assert.match(r.stdout, /::error::\.jscpd\.json: the ignore entry "copy\/\*\*" is new/);
      assert.match(
        r.stdout,
        /::error::b\.mjs: a new `jscpd:ignore-start` gives no reason \(\/\/ jscpd:ignore-start\)/,
      );
      assert.equal(r.stdout.match(/::error::b\.mjs: a new `jscpd:ignore-start`/g)?.length, 1);
      assert.equal(r.stdout.match(/::error::b\.mjs: a new `@public` gives no reason/g)?.length, 1);
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

test("classify: what counts as code, a change of measure, a workflow that runs the check, and a shared package moved back", () => {
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    ".no-bloat.json": [
      '{"jscpd":{"args":["src"]},"baseline":{}}',
      '{"jscpd":{"args":["src","--ignore=**/x.js"]},"baseline":{"a":1}}',
    ],
    "knip.ts": ["export default {}", "export default { entry: ['src/**'] }"],
    "package.json": [
      JSON.stringify({
        name: "x",
        knip: {},
        devDependencies: { "@dustinedwards/devkit": "github:DrDustinEdwards/devkit#v0.38.0" },
      }),
      JSON.stringify({
        name: "x",
        knip: { rules: { exports: "off" } },
        devDependencies: { "@dustinedwards/devkit": "github:DrDustinEdwards/devkit#v0.37.1" },
      }),
    ],
    ".github/workflows/checks.yml": [
      "uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@abc",
      "uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@abc\n  with: { no-bloat-prepare: rm src/copy.ts }",
    ],
    ".github/workflows/deploy.yml": ["on: push", "on: [push]"],
  });
  const classifyYaml = (/** @type {Parameters<typeof classify>[0]} */ c) => classify(c, parseYaml);
  const change = (/** @type {string[]} */ changed) => ({
    changed,
    configPath: ".no-bloat.json",
    before: (/** @type {string} */ p) => files[p]?.[0] ?? null,
    now: (/** @type {string} */ p) => files[p]?.[1] ?? null,
  });
  assert.deepEqual(classifyYaml(change(Object.keys(files))), {
    code: true,
    definition: [".no-bloat.json (outside baseline and tools)", "knip.ts", 'package.json "knip"'],
    workflow: [".github/workflows/checks.yml"],
    back: [
      "@dustinedwards/devkit github:DrDustinEdwards/devkit#v0.38.0 to github:DrDustinEdwards/devkit#v0.37.1",
    ],
    refused: [],
    removed: [],
  });
  // A baseline and lockfile change alone moves nothing the counts read; a tool must be npm's at x.y.z, never older.
  files[".no-bloat.json"] = [
    '{"baseline":{},"tools":{"jscpd":"jscpd@5.4.0"}}',
    '{"baseline":{"a":1},"tools":{"knip":"knip@7.0.0","jscpd":"jscpd@5.4.0"}}',
  ];
  // A workspace package's manifest and lockfile are read like the root's.
  files["mcp/package.json"] = [
    JSON.stringify({ name: "m", dependencies: { a: "1.0.0" } }),
    JSON.stringify({ name: "m", dependencies: { a: "1.1.0" } }),
  ];
  assert.deepEqual(
    classifyYaml(
      change([".no-bloat.json", "package-lock.json", "mcp/package.json", "mcp/package-lock.json"]),
    ),
    { code: false, definition: [], workflow: [], back: [], refused: [], removed: [] },
  );
  // Removing a build plugin and its library is one change of measure, which may not leave an import unlisted; removing a
  // library alone, or beside code, is code.
  files["vite.config.ts"] = ["export default { plugins: [tw()] }", "export default {}"];
  files["package.json"] = [
    JSON.stringify({ name: "x", devDependencies: { "@tailwindcss/vite": "4.3.3", vite: "8.0.0" } }),
    JSON.stringify({ name: "x", devDependencies: { vite: "8.0.0" } }),
  ];
  const drop = classifyYaml({
    ...change(["vite.config.ts", "package.json"]),
    plugins: ["vite.config.ts"],
  });
  assert.deepEqual(
    [drop.code, drop.definition],
    [false, ["vite.config.ts", "package.json devDependencies removes @tailwindcss/vite"]],
  );
  const knip = (/** @type {number} */ unlisted) => ({ baseline: { knip: { unlisted } } });
  assert.deepEqual(raised(knip(0), knip(0), drop), []);
  assert.match(raised(knip(1), knip(0), drop).join(), /raises unlisted from 0 to 1/);
  const alone = classifyYaml(change(["package.json"]));
  assert.deepEqual([alone.code, alone.removed], [true, []]);
  files[".no-bloat.json"][1] =
    '{"baseline":{},"tools":{"knip":"file:./fake","jscpd":"jscpd@4.3.0"}}';
  assert.deepEqual(classifyYaml(change([".no-bloat.json"])).refused, [
    'tools.knip is "file:./fake". The check runs knip from npm at an exact version, "knip@x.y.z".',
    "tools.jscpd moves from jscpd@5.4.0 to jscpd@4.3.0, an older release. Keep each tool at its version or newer.",
  ]);

  // Moving only the devkit pin of a workflow that runs the check (the rollout's and Renovate's bump) is no code and no
  // change of measure; a workflow that does not run the check is never code.
  const sha = (/** @type {string} */ c) => c.repeat(40);
  files[".github/workflows/checks.yml"] = [
    `uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${sha("a")} # v0.40.0`,
    `uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${sha("b")} # v0.41.0`,
  ];
  assert.deepEqual(
    classifyYaml(change([".github/workflows/checks.yml", ".github/workflows/deploy.yml"])),
    { code: false, definition: [], workflow: [], back: [], refused: [], removed: [] },
  );

  // devkit installed from anywhere but its own release tag, or overridden, runs another check.
  for (const pin of [
    "github:evil/devkit#v0.41.0",
    "file:./vendor/devkit",
    "^0.40.0",
    "github:DrDustinEdwards/devkit#main",
  ]) {
    files["mcp/package.json"] = [
      JSON.stringify({
        devDependencies: { "@dustinedwards/devkit": "github:DrDustinEdwards/devkit#v0.40.0" },
      }),
      JSON.stringify({ devDependencies: { "@dustinedwards/devkit": pin } }),
    ];
    assert.match(
      classifyYaml(change(["mcp/package.json"])).refused.join("\n"),
      /mcp\/package\.json devDependencies has @dustinedwards\/devkit at ".+"\. Pin devkit to a release tag/,
      pin,
    );
  }
  files["package.json"] = [
    JSON.stringify({ name: "x" }),
    JSON.stringify({ name: "x", overrides: { "@dustinedwards/devkit": "file:./vendor/devkit" } }),
  ];
  assert.match(
    classifyYaml(change(["package.json"])).refused[0],
    /package\.json "overrides" names @dustinedwards\/devkit/,
  );
});

test(
  "end to end: dropping a count, switching a measure off, or changing a measure with code fails; a measure changed alone may not lower a count",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ shared: false }));
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      writeFileSync(join(dir, "a.mjs"), "export const a = 1;\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "update-ref", "refs/remotes/origin/main", "main");
      git(dir, "checkout", "-qb", "change");
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));

      // jscpd switched off and its count dropped, with code beside it.
      writeFileSync(join(dir, "b.mjs"), "export const b = 1;\n");
      const off = { ...config, jscpd: false, baseline: { ...config.baseline } };
      delete off.baseline.jscpd;
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(off));
      const r = runBin(dir, [], { GITHUB_ACTIONS: "" });
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /::error::jscpd: this change drops its count from the baseline/);
      assert.match(
        r.stdout,
        /::error::this change moves code and also how it is counted \(\.no-bloat\.json/,
      );

      // The same switch alone still drops the count; a narrower knip config alone may not lower one.
      rmSync(join(dir, "b.mjs"));
      assert.match(
        runBin(dir, [], { GITHUB_ACTIONS: "" }).stdout,
        /::error::jscpd: this change drops its count/,
      );
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      writeFileSync(join(dir, "knip.ts"), "export default { entry: ['**'] };\n");
      writeFileSync(tool(dir, "knip"), "process.stdout.write('{\"issues\":[]}');\n");
      const lowered = { ...config, baseline: { ...config.baseline, knip: {} } };
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(lowered));
      const n = runBin(dir, [], { GITHUB_ACTIONS: "" });
      assert.equal(n.status, 1, n.stdout);
      assert.match(
        n.stdout,
        /::error::knip: this change of how it is counted \(knip\.ts\) lowers files from 2 to 0/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("a Knip config line, a skip tag, a jscpd marker or a legacy-scan keep needs a reason of its own, in words; a comment it would inherit is not one", () => {
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    "knip.jsonc": [
      '{\n  // Generated by the build, read by nothing in this repository.\n  "ignore": [\n    "gen/**"\n  ]\n}\n',
      '{\n  // Generated by the build, read by nothing in this repository.\n  "ignore": [\n    "gen/**",\n    "src/hidden/**"\n  ],\n  "rules": { "types": "off", "unlisted": "off" },\n  // x\n  "ignoreDependencies": ["a"],\n  "ignoreBinaries": ["b"] // the deploy script runs it from the shell\n}\n',
    ],
    "dashboard/knip.ts": [null, "export default {};\n"],
  });
  const change = {
    changed: Object.keys(files),
    before: (/** @type {string} */ p) => files[p]?.[0] ?? null,
    now: (/** @type {string} */ p) => files[p]?.[1] ?? null,
    added: [
      { path: "src/a.ts", text: "/** @beta */" },
      { path: "src/a.ts", text: "/** @alias the old name the CLI still imports */" },
      { path: "src/a.ts", text: "// jscpd:ignore-start x" },
      { path: "src/a.ts", text: "/** @public */ export const keep = 1;" },
      { path: "README.md", text: "`@beta` hides an export." },
      { path: "src/b.ts", text: "// legacy-scan:keep" },
      {
        path: "src/b.ts",
        text: "// legacy-scan:keep isImeEnter guards it, in Capsomer's shortcuts",
      },
      {
        path: "src/b.ts",
        text: "// legacy-scan:keep ime-safe-enter-submit isImeEnter guards it, in Capsomer's shortcuts",
      },
    ],
  };
  const out = unreasoned(change, {}, {});
  assert.deepEqual(
    out.map((m) => m.slice(0, m.indexOf(" is new") > 0 ? m.indexOf(" is new") : m.indexOf(":"))),
    [
      'knip.jsonc line 5 ("src/hidden/**")',
      'knip.jsonc line 7 ("rules": { "types": "off", "unlisted": "off" },)',
      'knip.jsonc line 9 ("ignoreDependencies": ["a"],)',
      "dashboard/knip.ts",
      "src/a.ts",
      "src/a.ts",
      "src/a.ts",
      "src/b.ts",
      "src/b.ts",
    ],
  );
  assert.match(out[7], /a new `legacy-scan:keep` names no guide or gives no reason/);
  assert.match(out[4], /a new `@beta` gives no reason/);
  assert.match(out[5], /a new `jscpd:ignore-start` gives no reason/);
  assert.match(out[6], /a new `@public` gives no reason/);
  // jscpd splits --ignore on commas: dropping one glob widens the measure, adding one is new.
  const jscpd = (/** @type {string} */ ignore) => ({
    jscpd: { args: ["app", "--ignore", ignore] },
  });
  const none = { changed: [], before: () => null, now: () => null, added: [] };
  assert.deepEqual(
    unreasoned(none, jscpd("**/*.md,**/*.json"), jscpd("**/*.md,**/*.d.ts,**/*.json")),
    [],
  );
  assert.match(
    unreasoned(none, jscpd("**/*.md,**/x/**"), jscpd("**/*.md")).join("\n"),
    /gain --ignore "\*\*\/x\/\*\*"/,
  );
  assert.equal(isReason("x"), false);
  assert.equal(isReason("TODO: reason"), false);
  assert.equal(isReason("the fixture mirrors the API reply"), true);
});

test("jscpd: a narrower measure or path is refused, a new file it skips anywhere fails, and a knip run's args cannot change", () => {
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    ".jscpd.json": [
      '{ "path": ["src"], "minLines": 5 }',
      '{ "path": ["src/a.ts"], "minLines": 20, "gitignore": true }',
    ],
  });
  const change = {
    before: (/** @type {string} */ p) => files[p]?.[0] ?? null,
    now: (/** @type {string} */ p) => files[p]?.[1] ?? null,
  };
  const out = narrowed(
    change,
    {
      knip: [{ label: "knip", args: ["--exclude", "types"] }],
      jscpd: { args: ["--format", "javascript"] },
    },
    { knip: [{ label: "knip" }], jscpd: { args: [] } },
  );
  assert.deepEqual(
    out.map((m) => /\(([^)]*)\)|run "knip"/.exec(m)?.[0]),
    [
      "(minLines from 5 to 20)",
      "(format from every format to javascript)",
      "(gitignore turned on)",
      '(path from ["src"] to ["src/a.ts"], which no longer reads src)',
      'run "knip"',
    ],
  );
  // A wider path, or the same read through its parent, is no narrowing.
  assert.deepEqual(
    narrowed(change, { jscpd: { args: ["."] } }, { jscpd: { args: ["src", "lib/"] } }).filter((m) =>
      m.includes("path from"),
    ),
    [],
  );
  assert.deepEqual(narrowed({ before: () => null, now: () => null }, {}, {}), []);
  // src/a.ts is read; src/b.ts beside it and scripts/x.ts outside its path are not; a file under minLines holds no copy,
  // and tests are never counted.
  const unread = unreadFiles(
    {},
    ["src/a.ts", "src/b.ts", "src/tiny.ts", "src/b.test.ts", "scripts/x.ts"],
    ["/r/src/a.ts"],
    "/r",
    (p) => (p === "src/tiny.ts" ? "export {};\n" : "a\nb\nc\nd\ne\n"),
    5,
  );
  assert.deepEqual(unread, ["src/b.ts", "scripts/x.ts"]);
  // The count can stay level when another file starts being read, so a new skipped file fails by name.
  assert.match(
    unreadAdded(unread, ["src/b.ts"]).join(),
    /src\/b\.ts is new, and jscpd does not read it/,
  );
  assert.deepEqual(unreadAdded(unread, ["src/a.ts"]), []);
});

test("a pin-only workflow change passes alone; any other change to the workflow that runs the check may not lower a count", () => {
  const base = { baseline: { knip: { files: 2 } } };
  assert.deepEqual(raised(base, base, { code: false, definition: [], workflow: [], back: [] }), []);
  assert.match(
    raised({ baseline: { knip: { files: 0 } } }, base, {
      code: false,
      definition: [],
      workflow: [".github/workflows/ci.yml"],
      back: [],
    })[0],
    /this change of how it is counted \(\.github\/workflows\/ci\.yml\) lowers files from 2 to 0/,
  );
});

test(
  "end to end: a tracked file a .gitignore hides from Knip fails, whether the file or the hiding line is new; a workflow pin bump alone passes",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ shared: false }));
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
      const caller = (/** @type {string} */ c) =>
        `jobs:\n  checks:\n    uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${c.repeat(40)} # v0.40.0\n`;
      writeFileSync(join(dir, ".github", "workflows", "ci.yml"), caller("a"));
      mkdirSync(join(dir, "src", "old"), { recursive: true });
      writeFileSync(join(dir, "src", "old", "o.mjs"), "export const o = 1;\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");

      writeFileSync(join(dir, ".github", "workflows", "ci.yml"), caller("b"));
      git(dir, "commit", "-qam", "Bump the pin");
      const pin = runBin(dir, ["--lines-from", "main"]);
      assert.equal(pin.status, 0, pin.stdout);

      writeFileSync(join(dir, ".gitignore"), "node_modules/\nsummary.md\nsrc/bloat/\nsrc/old/\n");
      mkdirSync(join(dir, "src", "bloat"));
      writeFileSync(join(dir, "src", "bloat", "b.mjs"), "export const b = 1;\n");
      git(dir, "add", "-A");
      git(dir, "add", "-f", "src/bloat/b.mjs");
      git(dir, "commit", "-qm", "Hide");
      const r = runBin(dir, ["--lines-from", "main"]);
      assert.equal(r.status, 1, r.stdout);
      assert.match(
        r.stdout,
        /::error::src\/bloat\/b\.mjs is tracked, but \.gitignore line 3 \(src\/bloat\/\) hides it from Knip/,
      );
      assert.match(
        r.stdout,
        /::error::src\/old\/o\.mjs is tracked, but \.gitignore line 4 \(src\/old\/\) hides it/,
      );
      assert.deepEqual(
        hiddenFiles(
          [{ source: ".gitignore", line: "1", pattern: "dist/", path: "dist/x.js" }],
          [],
          () => "dist/\n",
        ),
        [],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("the tools are the check's own install at exact versions, and a second lockfile beside one fails", () => {
  // A range or tag would measure with whatever it resolves to, so the check refuses before it installs anything.
  assert.throws(
    () => checkTools(".", { knip: "knip@6", jscpd: "jscpd@4.3.0" }, "").run("knip", []),
    /tools\.knip is "knip@6", and the check runs only npm's knip at an exact version/,
  );
  assert.deepEqual(
    lockfileProblems([
      "package-lock.json",
      "npm-shrinkwrap.json",
      "web/pnpm-lock.yaml",
      "web/a.ts",
    ]),
    [
      "the root has package-lock.json and npm-shrinkwrap.json. Keep the one lockfile its package manager installs from, and delete the other.",
    ],
  );
});

test("a workflow change that turns the check off or changes what runs before it is refused, in any YAML spelling; an install script is a change of measure", () => {
  const pin = (/** @type {string} */ c) =>
    `DrDustinEdwards/devkit/.github/workflows/pr.yml@${c.repeat(40)} # v1.0.0`;
  const base = `on:\n  pull_request:\njobs:\n  checks:\n    uses: ${pin("a")}\n    with:\n      review: false\n      no-bloat-prepare: >-\n        npm run gen\n`;
  const check = (/** @type {string} */ now) =>
    workflowInputs("c.yml", base, now, parseYaml).join("\n");
  // Moving the pin, an input the check does not depend on, or the same data in another spelling is no such change.
  for (const same of [
    base.replace("a".repeat(40), "b".repeat(40)).replace("review: false", "review: true"),
    base.replace(/\n/g, "\r\n"),
    `"on": { pull_request: null }\njobs:\n  checks: { uses: "${pin("b")}", with: { review: true, "no-bloat-prepare": npm run gen } }\n`,
  ])
    assert.equal(check(same), "");
  const add = (/** @type {string} */ lines) =>
    base.replace("      review: false\n", `      review: false\n${lines}`);
  for (const [now, what] of [
    [base.replace("npm run gen", "npm run gen && rm src/copy.ts"), /changes no-bloat-prepare/],
    [add("      no-bloat: false\n"), /changes no-bloat from "\(default\)" to "false"/],
    // Each spelling the line reader missed (devkit 0.42.0): CRLF, a comment or anchor after with:, flow style, a quoted
    // or upper-case key, an expression.
    [add("      no-bloat: false\n").replace(/\n/g, "\r\n"), /changes no-bloat from/],
    [base.replace("with:\n", "with: # inputs\n      no-bloat: false\n"), /changes no-bloat from/],
    [base.replace("with:\n", "with: &inputs\n      no-bloat: false\n"), /changes no-bloat from/],
    [
      base.replace(
        /    with:[^]*$/,
        "    with: { review: false, no-bloat: false, no-bloat-prepare: npm run gen }\n",
      ),
      /changes no-bloat from/,
    ],
    [add('      "no-bloat": false\n'), /changes no-bloat from/],
    [add("      No-Bloat: false\n"), /changes no-bloat from/],
    [
      add("      no-bloat: ${{ false }}\n"),
      /changes no-bloat from "\(default\)" to "\$\{\{ false \}\}"/,
    ],
    [add("      no-bloat: true\n      No-Bloat: false\n"), /names no-bloat twice/],
    [base.replace("    uses:", "    if: false\n    uses:"), /changes the job "checks"'s if/],
    // A job it waits for that is skipped skips it; the triggers decide whether it runs at all.
    [
      base
        .replace(
          "jobs:\n",
          "jobs:\n  gate:\n    if: false\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n",
        )
        .replace("    uses:", "    needs: gate\n    uses:"),
      /changes the job "checks"'s needs[^]*changes the job "gate" that "checks" waits for/,
    ],
    [
      base.replace("  pull_request:\n", "  pull_request:\n    paths-ignore: ['**']\n"),
      /changes its top-level "on"/,
    ],
    [
      base.replace("pr.yml@", "no-bloat.yml@"),
      /moves the job "checks" from pr\.yml to no-bloat\.yml/,
    ],
    ["jobs: {}\n", /drops the job "checks"/],
    [`${base}jobs: {}\n`, /no longer parses as YAML/],
  ])
    assert.match(check(/** @type {string} */ (now)), /** @type {RegExp} */ (what));
  // A job the caller waits for is held as it was, and one it does not is free.
  const gated = base
    .replace(
      "jobs:\n",
      "jobs:\n  gate:\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n  other:\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n",
    )
    .replace("    uses:", "    needs: [gate]\n    uses:");
  const changed = (/** @type {string} */ job) =>
    workflowInputs(
      "c.yml",
      gated,
      gated.replace(
        `  ${job}:\n    runs-on: ubuntu-latest`,
        `  ${job}:\n    if: false\n    runs-on: ubuntu-latest`,
      ),
      parseYaml,
    );
  assert.match(changed("gate").join(), /changes the job "gate" that "checks" waits for/);
  assert.deepEqual(changed("other"), []);
  // A workflow that calls neither, or is new, ran no check at the base.
  assert.deepEqual(
    workflowInputs("c.yml", "jobs:\n  a:\n    runs-on: x\n", "jobs: {}\n", parseYaml),
    [],
  );
  assert.deepEqual(workflowInputs("c.yml", "", base, parseYaml), []);

  const manifest = (/** @type {object} */ scripts) =>
    JSON.stringify({ name: "x", scripts: { test: "node --test", ...scripts } });
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    "package.json": [manifest({}), manifest({ postinstall: "node scripts/pi.mjs" })],
    ".npmrc": [null, "registry=https://example.com/\n"],
    "patches/knip@6.45.1.patch": [null, "--- a\n"],
  });
  const kind = classify({
    changed: Object.keys(files),
    configPath: ".no-bloat.json",
    before: (p) => files[p]?.[0] ?? null,
    now: (p) => files[p]?.[1] ?? null,
  });
  assert.equal(kind.code, false);
  assert.deepEqual(kind.definition, [
    "package.json install scripts or patches",
    ".npmrc",
    "patches/knip@6.45.1.patch",
  ]);
});

test("a Knip plugin's config, and what a config in code imports, is a change of how Knip counts", () => {
  const files = {
    ".mocharc.cjs": 'const spec = require("./test/spec.cjs");\nmodule.exports = { spec };\n',
    "test/spec.cjs": 'module.exports = require("../tools/list");\n',
    "tools/list.ts": "export default [];\n",
    "apps/web/vite.config.ts":
      'import plugin from "./plugin.js";\nexport default { plugins: [plugin] };\n',
    "apps/web/plugin.ts": "export default {};\n",
    "tsconfig.json": "{}\n",
    "src/a.ts": 'import "./b";\n',
    "src/b.ts": "",
    "package.json": "{}",
    ".github/workflows/ci.yml": "",
  };
  const patterns = [
    ".mocharc.{js,cjs,json}",
    "vite.config.{js,ts}",
    "tsconfig.json",
    "package.json",
    ".github/workflows/*.yml",
  ];
  assert.deepEqual(
    knipPluginFiles(
      Object.keys(files),
      patterns,
      (p) => files[/** @type {keyof typeof files} */ (p)],
    ).sort(),
    [
      ".mocharc.cjs",
      "apps/web/plugin.ts",
      "apps/web/vite.config.ts",
      "test/spec.cjs",
      "tools/list.ts",
      "tsconfig.json",
    ],
  );
  // An import that reaches one of the repository's Knip entries stops there: Knip counts an entry the same whoever
  // imports it (Capsomer's docs site renders pages from its components).
  const site = {
    "site/vite.config.ts":
      'import { render } from "./home.ts";\nexport default { plugins: [render] };\n',
    "site/home.ts":
      'import { open } from "../components/dialog/dialog.ts";\nexport const render = open;\n',
    "components/dialog/dialog.ts": 'import "./dialog-drag.ts";\nexport const open = 1;\n',
    "components/dialog/dialog-drag.ts": "",
    "knip.jsonc": '{\n  // why\n  "entry": ["components/*/*.ts", "!x"],\n}\n',
  };
  const read = (/** @type {string} */ p) => site[/** @type {keyof typeof site} */ (p)] ?? null;
  assert.deepEqual(knipEntries(read), ["components/*/*.ts"]);
  assert.deepEqual(
    knipPluginFiles(Object.keys(site), patterns, (p) => read(p) ?? "", knipEntries(read)).sort(),
    ["site/home.ts", "site/vite.config.ts"],
  );
  // Beside code, the config is refused as a change of measure.
  const kind = classify({
    changed: [".mocharc.cjs", "src/a.ts"],
    configPath: ".no-bloat.json",
    plugins: [".mocharc.cjs"],
    before: () => "",
    now: () => "x",
  });
  assert.deepEqual([kind.code, kind.definition], [true, [".mocharc.cjs"]]);
});

test(
  "end to end in Actions: the check counts the commit the run is for, so an install that moves HEAD or resets a file fails",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, "a.mjs"), "export const a = 1;\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      const sha = git(dir, "rev-parse", "HEAD").trim();
      assert.deepEqual(checkoutProblems(dir, sha), []);
      // What a postinstall that puts the base back would leave: a tracked file changed, or hidden from git status.
      writeFileSync(join(dir, "a.mjs"), "");
      assert.match(
        checkoutProblems(dir, sha).join(),
        /a\.mjs differs from [0-9a-f]{7}, the commit this run is for/,
      );
      git(dir, "update-index", "--skip-worktree", "a.mjs");
      assert.match(
        checkoutProblems(dir, sha).join(),
        /a\.mjs is marked assume-unchanged or skip-worktree/,
      );
      git(dir, "update-index", "--no-skip-worktree", "a.mjs");
      git(dir, "checkout", "--", "a.mjs");
      git(dir, "commit", "-q", "--allow-empty", "-m", "Elsewhere");
      assert.match(
        checkoutProblems(dir, sha).join(),
        /HEAD is [0-9a-f]{7}, not [0-9a-f]{7}, the commit this run is for/,
      );
      // The bin fails on it before it counts, and with no commit to hold to (outside Actions) it counts the working tree.
      const r = runBin(dir, ["--lines-from", "main"], { GITHUB_SHA: sha });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /::error::HEAD is/);
      assert.deepEqual(checkoutProblems(dir, ""), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
