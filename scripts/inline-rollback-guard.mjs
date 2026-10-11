#!/usr/bin/env node
// Writes scripts/rollback-guard.mjs into the "Write the rollback guard" step of the shared deploy workflow, so a caller that
// pins one devkit sha runs the guard of that same commit. Run it after any edit to the guard:
//
//   node scripts/inline-rollback-guard.mjs
//
// It replaces what sits between the heredoc's opening `<<'ROLLBACK_GUARD'` and its closing line, every line indented to the
// run block. test/worker-deploy-workflow.test.mjs fails when the two disagree.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url);
const INDENT = " ".repeat(10);
const OPEN = "<<'ROLLBACK_GUARD'\n";
const CLOSE = `\n${INDENT}ROLLBACK_GUARD\n`;

/** The guard as the workflow carries it, dedented. @param {string} workflow */
export function inlined(workflow) {
  const start = workflow.indexOf(OPEN);
  const end = workflow.indexOf(CLOSE, start);
  if (start === -1 || end === -1) throw new Error("the workflow has no ROLLBACK_GUARD heredoc");
  const block = workflow.slice(start + OPEN.length, end);
  return `${block.split("\n").map((line) => (line.startsWith(INDENT) ? line.slice(INDENT.length) : line)).join("\n")}\n`;
}

/** The workflow with the heredoc's body replaced by the guard. @param {string} workflow @param {string} guard */
export function inline(workflow, guard) {
  const start = workflow.indexOf(OPEN);
  const end = workflow.indexOf(CLOSE, start);
  if (start === -1 || end === -1) throw new Error("the workflow has no ROLLBACK_GUARD heredoc");
  const block = guard.replace(/\n$/, "").split("\n").map((line) => (line === "" ? "" : INDENT + line)).join("\n");
  return workflow.slice(0, start + OPEN.length) + block + workflow.slice(end);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL(".github/workflows/worker-deploy.yml", ROOT);
  writeFileSync(file, inline(readFileSync(file, "utf8"), readFileSync(new URL("scripts/rollback-guard.mjs", ROOT), "utf8")));
}
