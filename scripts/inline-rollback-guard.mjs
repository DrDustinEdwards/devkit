#!/usr/bin/env node
// Writes each script a shared workflow carries into its heredoc, so a caller that pins one devkit sha runs the script of that
// same commit: scripts/rollback-guard.mjs into the "Write the rollback guard" step of worker-deploy.yml, and
// scripts/strip-pr-footer.mjs into pr-footer.yml, and scripts/code-map.mjs into code-map.yml. Run it after any edit to one:
//
//   node scripts/inline-rollback-guard.mjs
//
// It replaces what sits between a heredoc's opening `<<'MARKER'` and its closing line, every line indented to the run
// block. test/worker-deploy-workflow.test.mjs and test/pr-footer-workflow.test.mjs fail when a pair disagrees.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url);
const INDENT = " ".repeat(10);
const PAIRS = [
  { workflow: ".github/workflows/worker-deploy.yml", script: "scripts/rollback-guard.mjs", marker: "ROLLBACK_GUARD" },
  { workflow: ".github/workflows/pr-footer.yml", script: "scripts/strip-pr-footer.mjs", marker: "PR_FOOTER" },
  { workflow: ".github/workflows/code-map.yml", script: "scripts/code-map.mjs", marker: "CODE_MAP" },
];

/** The heredoc's bounds in the workflow. @param {string} workflow @param {string} marker */
function bounds(workflow, marker) {
  const OPEN = `<<'${marker}'\n`;
  const start = workflow.indexOf(OPEN);
  const end = workflow.indexOf(`\n${INDENT}${marker}\n`, start);
  if (start === -1 || end === -1) throw new Error(`the workflow has no ${marker} heredoc`);
  return { from: start + OPEN.length, end };
}

/** The script as the workflow carries it, dedented. @param {string} workflow @param {string} [marker] */
export function inlined(workflow, marker = "ROLLBACK_GUARD") {
  const { from, end } = bounds(workflow, marker);
  const block = workflow.slice(from, end);
  return `${block.split("\n").map((line) => (line.startsWith(INDENT) ? line.slice(INDENT.length) : line)).join("\n")}\n`;
}

/** The workflow with the heredoc's body replaced by the script. @param {string} workflow @param {string} guard @param {string} [marker] */
export function inline(workflow, guard, marker = "ROLLBACK_GUARD") {
  const { from, end } = bounds(workflow, marker);
  const block = guard.replace(/\n$/, "").split("\n").map((line) => (line === "" ? "" : INDENT + line)).join("\n");
  return workflow.slice(0, from) + block + workflow.slice(end);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { workflow, script, marker } of PAIRS) {
    const file = new URL(workflow, ROOT);
    writeFileSync(file, inline(readFileSync(file, "utf8"), readFileSync(new URL(script, ROOT), "utf8"), marker));
  }
}
