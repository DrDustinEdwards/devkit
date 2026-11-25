// devkit-declarations: a package whose exported function returns a type its entry point leaves out fails, and the same
// package passes once the entry point declares the type (Prelum's SchemaNode and site-runtime's ImagesLike, TS2883).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { fixtureSource, typedEntries } from "../bin/declarations.mjs";

const devkit = dirname(dirname(fileURLToPath(import.meta.url)));

/** A one-entry package named `fake`; `entry` is its index.mjs and `hidden` the module the exports map leaves out. */
function fakePackage(/** @type {string} */ entry) {
  const dir = mkdtempSync(join(tmpdir(), "declarations-fake-"));
  const write = (/** @type {string} */ name, /** @type {string} */ text) =>
    writeFileSync(join(dir, name), text);
  write(
    "package.json",
    JSON.stringify({
      name: "fake",
      version: "1.0.0",
      type: "module",
      files: ["*.mjs", "dist"],
      exports: { ".": { types: "./dist/index.d.mts", default: "./index.mjs" } },
      scripts: { prepare: "tsc -p tsconfig.build.json" },
    }),
  );
  write(
    "tsconfig.build.json",
    JSON.stringify({
      compilerOptions: {
        allowJs: true,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: "dist",
        module: "nodenext",
        moduleResolution: "nodenext",
        strict: true,
        types: [],
      },
      include: ["*.mjs"],
    }),
  );
  write("hidden.mjs", "/** @typedef {Record<string, unknown>} Hidden */\nexport {};\n");
  write("index.mjs", entry);
  mkdirSync(join(dir, "node_modules"));
  symlinkSync(join(devkit, "node_modules", ".bin"), join(dir, "node_modules", ".bin"));
  symlinkSync(join(devkit, "node_modules", "typescript"), join(dir, "node_modules", "typescript"));
  return dir;
}

const run = (/** @type {string} */ cwd) =>
  spawnSync("node", [join(devkit, "bin", "declarations.mjs")], { cwd, encoding: "utf8" });

test("PLANT: a returned type defined outside the entry point fails with TS2883", () => {
  const dir = fakePackage(
    '/** @import { Hidden } from "./hidden.mjs" */\n/** @returns {Hidden} */\nexport function build() { return {}; }\n',
  );
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /TS2883.*Hidden/);
});

test("the same package passes once the entry point declares the type", () => {
  const dir = fakePackage(
    "/** @typedef {Record<string, unknown>} Hidden */\n/** @returns {Hidden} */\nexport function build() { return {}; }\n",
  );
  const result = run(dir);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /1 of 1 entries typecheck/);
});

test("typedEntries keeps the exports with types; fixtureSource calls functions and reads the rest", () => {
  assert.deepEqual(
    typedEntries({
      exports: { ".": { types: "./a.d.mts", default: "./a.mjs" }, "./css": "./x.css" },
    }),
    [{ subpath: ".", types: "./a.d.mts" }],
  );
  const source = fixtureSource("pkg", [
    {
      subpath: "./sub",
      members: [
        { name: "f", isFunction: true },
        { name: "K", isFunction: false },
        { name: "not-an-id", isFunction: false },
      ],
    },
  ]);
  assert.match(source, /import \* as m0 from "pkg\/sub"/);
  assert.match(source, /sub__f_return = .*m0\.f\)\(/);
  assert.match(source, /sub__K = m0\.K;/);
  assert.doesNotMatch(source, /not-an-id/);
});
