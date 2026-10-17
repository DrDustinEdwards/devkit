// The code map's measurements, on a small fixture repository (test/fixtures/code-map) whose numbers are counted by hand:
// which modules it maps, the imports it resolves, the cycle it finds, each function's complexity, and how coverage and
// mutants land on the innermost function. A number nobody measured must be null, never 0.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import { codeMap, crap, cyclesOf, loadTypeScript } from "../scripts/code-map.mjs";

const ROOT = fileURLToPath(new URL("fixtures/code-map/", import.meta.url));
const ts = loadTypeScript(ROOT);
const base = { ts, root: ROOT, repo: "example-org/sample", sha: "0".repeat(40), date: "2026-10-17" };
const fn = (/** @type {any} */ map, /** @type {string} */ path, /** @type {string} */ name) => {
  const found = map.modules.find((/** @type {any} */ m) => m.path === path)?.functions.find((/** @type {any} */ f) => f.name === name);
  assert.ok(found, `${path} ${name}`);
  return found;
};

test("it maps the included modules only, and resolves their imports to mapped paths", () => {
  const map = codeMap(base);
  assert.deepEqual(map.modules.map((/** @type {any} */ m) => m.path), ["src/a.ts", "src/b-helper.ts", "src/b.ts", "src/branches.ts", "src/types.ts"]);
  const imports = Object.fromEntries(map.modules.map((/** @type {any} */ m) => [m.path, m.imports]));
  assert.deepEqual(imports["src/a.ts"], ["src/b.ts"]);
  assert.deepEqual(imports["src/b-helper.ts"], ["src/a.ts"], "a re-export is an import");
  assert.deepEqual(imports["src/branches.ts"], ["src/a.ts", "src/types.ts"], "a type import and a dynamic import both count");
  assert.equal(map.version, 1);
  assert.equal(map.date, "2026-10-17");
});

test("an import cycle is found and its modules are marked; a module outside it is not", () => {
  const map = codeMap(base);
  assert.deepEqual(map.cycles, [["src/a.ts", "src/b-helper.ts", "src/b.ts"]]);
  const marked = map.modules.filter((/** @type {any} */ m) => m.cycle).map((/** @type {any} */ m) => m.path);
  assert.deepEqual(marked, ["src/a.ts", "src/b-helper.ts", "src/b.ts"]);
});

test("a module that imports itself is a cycle of one; a plain chain is none", () => {
  assert.deepEqual(cyclesOf(new Map([["x", ["x"]], ["y", ["z"]], ["z", []]])), [["x"]]);
  assert.deepEqual(cyclesOf(new Map([["y", ["z"]], ["z", []]])), []);
});

test("complexity counts the function's own branches and none of a nested function's", () => {
  const map = codeMap(base);
  // if, else if, for, ?: in the loop, &&, ??, case "circle" (default adds none), catch, and the return's ?:.
  assert.equal(fn(map, "src/branches.ts", "classify").cc, 10);
  assert.equal(fn(map, "src/branches.ts", "inner").cc, 2);
  assert.equal(fn(map, "src/a.ts", "a").cc, 2);
  assert.equal(fn(map, "src/b.ts", "b").cc, 1, "an arrow function is named by its variable");
  assert.equal(fn(map, "src/branches.ts", "constructor").cc, 1);
  assert.equal(fn(map, "src/branches.ts", "big").cc, 1);
  assert.equal(fn(map, "src/branches.ts", "lazy").cc, 1);
});

test("with no coverage or mutation report, every such number is null, never 0", () => {
  const f = fn(codeMap(base), "src/a.ts", "a");
  assert.deepEqual([f.coverage, f.crap, f.mutants, f.score], [null, null, null, null]);
  assert.deepEqual(codeMap(base).tools.coverage, null);
});

test("coverage lands on the innermost function, and CRAP follows it", () => {
  const file = join(ROOT, "src/branches.ts");
  const statement = (/** @type {number} */ line) => ({ start: { line, column: 0 }, end: { line, column: 1 } });
  const inner = fn(codeMap(base), "src/branches.ts", "inner");
  const coverage = {
    [file]: {
      // Two statements in classify (one run), one inside inner (never run).
      statementMap: { 0: statement(5), 1: statement(6), 2: statement(inner.line) },
      s: { 0: 1, 1: 0, 2: 0 },
    },
  };
  const map = codeMap({ ...base, coverage });
  assert.equal(fn(map, "src/branches.ts", "classify").coverage, 0.5);
  assert.equal(fn(map, "src/branches.ts", "inner").coverage, 0);
  assert.equal(fn(map, "src/branches.ts", "inner").crap, crap(2, 0));
  assert.equal(fn(map, "src/a.ts", "a").coverage, null, "a file the report does not name is unmeasured");
  assert.equal(map.tools.coverage, "istanbul");
});

test("CRAP is CC squared times uncovered cubed, plus CC", () => {
  assert.equal(crap(10, 0), 110);
  assert.equal(crap(10, 1), 10);
  assert.equal(crap(4, 0.5), 6);
  assert.equal(crap(4, null), null);
});

test("mutants land on the innermost function; the score counts only valid mutants", () => {
  const classify = fn(codeMap(base), "src/branches.ts", "classify");
  const at = (/** @type {number} */ line, /** @type {string} */ status) => ({ status, location: { start: { line, column: 1 }, end: { line, column: 2 } } });
  const mutation = {
    files: {
      "src/branches.ts": {
        mutants: [at(classify.line + 1, "Killed"), at(classify.line + 2, "Timeout"), at(classify.line + 3, "Survived"), at(classify.line + 4, "NoCoverage"), at(classify.line + 5, "Ignored"), at(classify.line + 6, "CompileError")],
      },
    },
  };
  const f = fn(codeMap({ ...base, mutation }), "src/branches.ts", "classify");
  assert.equal(f.mutants, 4, "ignored and compile-error mutants are not counted");
  assert.equal(f.score, 50);
  assert.equal(fn(codeMap({ ...base, mutation }), "src/a.ts", "a").mutants, null, "a file with no report entry is unmeasured");
});
