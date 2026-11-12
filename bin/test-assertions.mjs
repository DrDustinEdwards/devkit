#!/usr/bin/env node
// A test that asserts nothing cannot fail, so it proves nothing and still counts as coverage. This reads the test files under
// the directories in `.test-assertions.json` and fails on a `test(...)` or `it(...)` whose body calls no assertion.
//
//   npx devkit-test-assertions                    check against .test-assertions.json
//   npx devkit-test-assertions --config <file>
//
// The config:
//
//   { "dirs": ["test"], "floor": 1772, "enforce": true }
//
// `dirs` is required. `floor` (optional) is the number of test calls the scan must read; fewer fails, so a scanner or a
// directory that went blind is not a clean pass. Measure it and move it with the suite: slack is the defect. `enforce: false`
// turns each finding into a `::warning::` and the run passes (the floor still fails). Files: `*.test.{js,mjs,cjs,ts,mts,tsx,jsx}`.
//
// The scan is lexical (strings, template literals, comments and regex literals are skipped when matching brackets), so it
// needs no TypeScript. A body counts as asserting when it calls something named like an assertion (assert, expect, check,
// verify, ensure, validate, must, fail, should), the invariants harness's `done`, awaits a `rejects` or `resolves`, calls a
// method on `t` (node:test's context, `t.assert`), or calls a function declared in the same file whose own body asserts.
// A helper from another file with another name that throws on failure is invisible here: name it for what it does, or put
// the assertion in the test.

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { isMain, walkFiles } from "../node/index.mjs";
import { escapeAnnotation, fail } from "./annotate.mjs";
import { readConfig } from "./site-config.mjs";

const ASSERTING =
  /\b(?:assert|expect|check|verify|ensure|validate|must|fail|should|done)\w*\s*[.(]|\.(?:rejects|resolves)\b|\bt\.assert\b/i;
const CALL = /(?<![\w.$])(?:test|it)\s*\(/g;
const REGEX_CAN_START_AFTER =
  /[(,=:!&|?{};[+\-*%<>~^]$|(?:^|[^\w$.])(?:return|typeof|case|void|delete|in|of|await|yield)$/;

/**
 * The index just past the bracket that closes the one at `open`.
 *
 * @param {string} source
 * @param {number} open index of "(" or "{"
 * @returns {number}
 */
function closeOf(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      i = source.indexOf("\n", i);
      if (i < 0) return source.length;
    } else if (ch === "/" && next === "*") {
      i = source.indexOf("*/", i + 2) + 1;
      if (i === 0) return source.length;
    } else if (ch === '"' || ch === "'") {
      for (i += 1; i < source.length && source[i] !== ch; i += 1) if (source[i] === "\\") i += 1;
    } else if (ch === "`") {
      i = endOfTemplate(source, i);
    } else if (
      ch === "/" &&
      REGEX_CAN_START_AFTER.test(source.slice(Math.max(0, i - 12), i).trimEnd())
    ) {
      let inClass = false;
      for (i += 1; i < source.length; i += 1) {
        if (source[i] === "\\") i += 1;
        else if (source[i] === "[") inClass = true;
        else if (source[i] === "]") inClass = false;
        else if (source[i] === "/" && !inClass) break;
        else if (source[i] === "\n") break;
      }
    } else if (ch === "(" || ch === "{" || ch === "[") {
      depth += 1;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}

/** @param {string} source @param {number} start index of the opening backtick @returns {number} index of the closing one */
function endOfTemplate(source, start) {
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === "\\") i += 1;
    else if (source[i] === "`") return i;
    else if (source[i] === "$" && source[i + 1] === "{") i = closeOf(source, i + 1) - 1;
  }
  return source.length;
}

/**
 * Functions this file declares whose bodies assert, so a test that calls one is asserting.
 *
 * @param {string} source
 * @returns {string[]}
 */
function assertingHelpers(source) {
  /** @type {string[]} */
  const names = [];
  const declaration =
    /(?:^|\n)\s*(?:async\s+)?function\s+(\w+)\s*\(|(?:^|\n)\s*const\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g;
  for (const match of source.matchAll(declaration)) {
    const name = match[1] ?? match[2];
    const open = source.indexOf("{", (match.index ?? 0) + match[0].length);
    if (open < 0 || !name) continue;
    if (ASSERTING.test(source.slice(open, closeOf(source, open)))) names.push(name);
  }
  return names;
}

/**
 * @param {string} source a test file's text
 * @returns {Array<{ line: number, name: string }>} the tests that assert nothing, by the line of the call
 */
export function testsWithoutAssertions(source) {
  const helpers = assertingHelpers(source);
  /** @type {Array<{ line: number, name: string }>} */
  const found = [];
  for (const match of source.matchAll(CALL)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const end = closeOf(source, open);
    const call = source.slice(open, end);
    // `test.skip`, `test.todo` and `test.each` are not matched by CALL; a call with no function in it is not a test.
    if (!/=>|\bfunction\b/.test(call)) continue;
    if (
      ASSERTING.test(call) ||
      helpers.some((helper) => new RegExp(`(?<![\\w.$])${helper}\\s*\\(`).test(call))
    )
      continue;
    const name = /^\(\s*(["'`])([^]*?)\1/.exec(call)?.[2] ?? "(unnamed)";
    found.push({ line: source.slice(0, open).split("\n").length, name });
  }
  return found;
}

function main() {
  const { config, path } = readConfig(
    process.argv.slice(2),
    ".test-assertions.json",
    "test-assertions",
  );
  if (!Array.isArray(config.dirs) || config.dirs.length === 0)
    fail("test-assertions", `${path} needs a non-empty "dirs" list`);
  const enforce = config.enforce !== false;
  const root = process.cwd();
  let scanned = 0;
  let files = 0;
  /** @type {string[]} */
  const problems = [];
  for (const d of config.dirs) {
    if (!existsSync(join(root, d))) fail("test-assertions", `directory ${d} does not exist`);
    for (const file of walkFiles(join(root, d), {
      keep: (name) => /\.test\.(?:[cm]?[jt]sx?)$/.test(name),
      skipDir: (name) => name === "node_modules",
    })) {
      files++;
      const source = readFileSync(file, "utf8");
      scanned += (source.match(/(?<![\w.$])(?:test|it)\s*\(/g) ?? []).length;
      for (const f of testsWithoutAssertions(source))
        problems.push(
          `${relative(root, file).replaceAll("\\", "/")}:${f.line} "${f.name}" calls no assertion, so it cannot fail`,
        );
    }
  }
  if (typeof config.floor === "number" && scanned < config.floor)
    fail(
      "test-assertions",
      `${scanned} test calls scanned, under the floor of ${config.floor}: the scan read less than it should`,
    );
  if (scanned === 0)
    fail("test-assertions", "no test call found; a gate that read nothing must not pass");
  const level = enforce ? "error" : "warning";
  for (const p of problems) console.error(`::${level}::test-assertions: ${escapeAnnotation(p)}`);
  if (problems.length > 0 && enforce) {
    console.error(`test-assertions: ${problems.length} test(s) assert nothing`);
    process.exit(1);
  }
  console.log(
    `test-assertions: ${scanned} test calls in ${files} files, ${problems.length} without an assertion${enforce ? "" : " (warn only)"}.`,
  );
}

if (isMain(import.meta.url)) main();
