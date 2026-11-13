// devkit-css-vars: a var() with no fallback must name a declared property; comments and fallbacks do not count.

import assert from "node:assert/strict";
import test from "node:test";

import { declarations, uses } from "../bin/css-vars.mjs";

test("PLANT: an undeclared var() is found with its line; a fallback or a comment is not", () => {
  const css = [
    ".a { box-shadow: var(--fx-shadow-md); }",
    "/* var(--in-comment) */",
    ".b { color: var(--maybe, red); background: url(https://example.com/x.png); }",
    "// var(--line-comment)",
  ].join("\n");
  assert.deepEqual(uses(css), [{ name: "--fx-shadow-md", line: 1 }]);
});

test("declarations: CSS, a style-object key and setProperty", () => {
  const found = declarations(
    ':root { --shadow-m: 0 1px; }\nconst s = { "--w": 3 };\nel.style.setProperty("--h", "1px");',
  );
  assert.deepEqual([...found].sort(), ["--h", "--shadow-m", "--w"]);
});
