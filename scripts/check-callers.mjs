#!/usr/bin/env node
// The check a caller of this repository's reusable workflows runs on its own workflow files:
//
//   node check-callers.mjs .github/workflows/no-bloat.yml [more files]
//
// Every `uses:` that names this repository's reusable workflows must end in `@` and a full 40-character commit sha: a branch
// or a tag moves under a caller without a reviewed change to the caller. `secrets: inherit` is refused too, so a reader can
// see exactly which secrets the shared file receives. A worker-deploy call that sets `install:` must keep it script-free
// (`--ignore-scripts`, or devkit's own deploy-install.mjs): the deploy job holds the deploy token, so a plain `npm ci`
// would run every dependency's install script with it.
//
// Exit 0 when every call is pinned, 1 when any is not, 2 when a file is unreadable or names no call at all.

import { readFileSync } from "node:fs";
import { isMain } from "../node/index.mjs";

// A quoted value is the same value to YAML, so a quote around it is read through.
const SHARED =
  /^\s*uses:\s*["']?(?<repo>[\w.-]+)\/devkit\/\.github\/workflows\/(?<file>[\w.-]+)@(?<ref>[^\s"']+)/;

const DEPLOY = /\/worker-deploy\.yml@/;
const SCRIPT_FREE = /--ignore-scripts|deploy-install\.mjs/;

/**
 * The line of each `install:` input on a worker-deploy call that does not stay script-free.
 * @param {string[]} lines
 * @returns {number[]}
 */
function scriptingInstalls(lines) {
  const indent = (/** @type {string} */ l) => l.length - l.trimStart().length;
  /** @type {number[]} */
  const found = [];
  lines.forEach((raw, i) => {
    if (!DEPLOY.test(raw) || !/^\s*uses:/.test(raw)) return;
    const base = indent(raw);
    for (let j = i + 1; j < lines.length; j++) {
      const text = lines[j].replace(/\s+#.*$/, "");
      if (text.trim() && indent(text) < base) break;
      const key = /^(\s*)install:\s*(.*)$/.exec(text);
      if (!key) continue;
      let value = key[2];
      for (
        let k = j + 1;
        k < lines.length && (!lines[k].trim() || indent(lines[k]) > indent(text));
        k++
      )
        value += ` ${lines[k]}`;
      if (!SCRIPT_FREE.test(value)) found.push(j + 1);
    }
  });
  return found;
}

/**
 * @param {string} text
 * @returns {{ line: number, problem: string }[]}
 */
export function callerProblems(text) {
  /** @type {{ line: number, problem: string }[]} */
  const problems = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let calls = 0;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+#.*$/, "");
    const call = SHARED.exec(line);
    if (call?.groups) {
      calls += 1;
      if (!/^[0-9a-f]{40}$/.test(call.groups.ref)) {
        problems.push({
          line: index + 1,
          problem: `pinned to "${call.groups.ref}", not a full 40-character commit sha`,
        });
      }
    }
    if (/^\s*secrets:\s*(["']?)inherit\1\s*$/.test(line)) {
      problems.push({
        line: index + 1,
        problem:
          "secrets: inherit hides what the shared workflow receives; pass each secret by name",
      });
    }
  });
  for (const line of scriptingInstalls(lines))
    problems.push({
      line,
      problem:
        "install: on a worker-deploy call must include --ignore-scripts (or run deploy-install.mjs); leave it unset for the default",
    });
  if (calls === 0) problems.push({ line: 0, problem: "no call to a devkit reusable workflow" });
  return problems;
}

if (isMain(import.meta.url)) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: check-callers.mjs <workflow file>...");
    process.exit(2);
  }
  let status = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      console.error(`${file}: cannot read: ${error instanceof Error ? error.message : error}`);
      process.exit(2);
    }
    const problems = callerProblems(text);
    for (const { line, problem } of problems)
      console.error(`${file}${line ? `:${line}` : ""}: ${problem}`);
    if (problems.some((p) => p.line === 0)) status = Math.max(status, 2);
    else if (problems.length > 0) status = Math.max(status, 1);
    else console.log(`${file}: ok`);
  }
  process.exit(status);
}
