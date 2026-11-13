// devkit-css-vars: a var() with no fallback must name a declared property; comments and fallbacks do not count; a
// package class must be styled by a stylesheet the site imports.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { declarations, unloadedClasses, uses } from "../bin/css-vars.mjs";

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

test("PLANT: a class whose stylesheet nothing imports is found; one an imported sheet loads through @import is not", () => {
  const pkgDir = mkdtempSync(join(tmpdir(), "css-classes-"));
  mkdirSync(join(pkgDir, "css"));
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({
      name: "kit",
      exports: { "./all.css": "./css/all.css", "./*.css": "./css/*.css" },
    }),
  );
  writeFileSync(join(pkgDir, "css", "all.css"), '@import "./stack.css";\n@import "./grid.css";');
  writeFileSync(
    join(pkgDir, "css", "stack.css"),
    "@layer u { .cap-stack { display: flex; } }\n.cap-panes > .cap-x {}",
  );
  writeFileSync(join(pkgDir, "css", "grid.css"), ".cap-grid { display: grid; }");
  writeFileSync(join(pkgDir, "css", "text.css"), ".cap-text, :is(.cap-title)[data-size] {}");
  const files = [
    { rel: "src/root.tsx", content: 'import "kit/all.css";\nimport "kit/text.css";' },
    {
      rel: "src/a.tsx",
      content: '<div className="cap-stack">\n<p className="cap-panes cap-x" data-cap-part="y">',
    },
  ];
  assert.deepEqual(unloadedClasses({ pkgDir, prefix: "cap-", files }), []);
  files[0].content = 'import "kit/stack.css";';
  files[1].content += '\n<b className="cap-grid">';
  assert.deepEqual(unloadedClasses({ pkgDir, prefix: "cap-", files }), [
    "src/a.tsx:3: .cap-grid is styled in kit/grid.css, which nothing here imports",
  ]);
});
