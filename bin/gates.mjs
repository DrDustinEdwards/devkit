#!/usr/bin/env node
// The meta-gate: a chain of checks that quietly loses one still exits 0, so this counts the gates a package.json script
// chains and fails when it runs fewer than the minimum. Raising the minimum is deliberate: add a gate and raise the number in
// the same change, and whoever deletes one has to lower it in the open.
//
//   npx devkit-gates --min 6                  count the `check:all` script's gates
//   npx devkit-gates --min 6 --script ci      another script
//
// Gates are the `&&`-separated commands of the script; the command that runs this check (`devkit-gates` or `npm run check-gates`) is not counted. A missing or empty script, or a minimum that is not a positive integer, exits 1.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { escapeAnnotation } from "./annotate.mjs";

/**
 * The gates in a chain, not counting the gate check itself.
 * @param {string} chain
 */
export function countGates(chain) {
  return chain
    .split("&&")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/(^|\s)(devkit-gates|check-gates)(\s|$)/.test(s));
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (/** @type {string} */ n) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  /** @param {string} m @returns {never} */
  const fail = (m) => {
    console.error(`::error::gates: ${escapeAnnotation(m)}`);
    process.exit(1);
  };
  const min = Number(opt("--min"));
  if (!Number.isInteger(min) || min < 1) fail("--min <n> is required, a positive integer");
  const name = opt("--script") ?? "check:all";
  const pkgPath = resolve("package.json");
  if (!existsSync(pkgPath)) fail("no package.json here");
  const chain = JSON.parse(readFileSync(pkgPath, "utf8")).scripts?.[name];
  if (typeof chain !== "string" || chain.trim() === "")
    fail(`package.json has no "${name}" script; refusing to pass`);
  const gates = countGates(chain);
  if (gates.length < min)
    fail(
      `${name} runs ${gates.length} gate(s), minimum is ${min}. A gate was removed without lowering the minimum. Chain: ${gates.join(" | ")}`,
    );
  console.log(`gates: ${gates.length} wired (minimum ${min}): ${gates.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
