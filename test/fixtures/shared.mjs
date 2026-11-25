// Fixtures shared by the shared-code check's tests: tags, a file tree, a catalog and a scratch git repository with a stand-in codespell.

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

export const SHA_V2 = "2".repeat(40);
export const SHA_RAW = "9".repeat(40);
export const tags = () => ({
  tags: ["v0.9.0", "v0.10.0", "v0.2.0"],
  commits: { "v0.9.0": "1".repeat(40), "v0.10.0": SHA_V2, "v0.2.0": "3".repeat(40) },
});
/** @param {Record<string, string>} files */
export const tree = (files) => ({
  files: Object.keys(files),
  read: (/** @type {string} */ f) => files[f] ?? "",
});

export const catalog = {
  escapeHtml: "site-runtime ./html",
  slugify: "Prelum ./slug",
  render: "Prelum ./render",
  readThemeCookie: "Capsomer ./theme",
};

/** process.env without the runner's own files, so a spawned bin writes nothing into the run that tests it. */
export function ownEnv(/** @type {Record<string, string>} */ extra = {}) {
  const env = { ...process.env };
  for (const name of ["GITHUB_STEP_SUMMARY", "GITHUB_EVENT_PATH", "GITHUB_OUTPUT"])
    delete env[name];
  return { ...env, ...extra };
}

/**
 * A git repository holding `files`, with a stand-in codespell first on PATH: codespell's output for a few British words.
 * Both directories go when the test `t` ends.
 */
export function repo(
  /** @type {import("node:test").TestContext} */ t,
  /** @type {Record<string, string>} */ files,
) {
  const root = mkdtempSync(join(tmpdir(), "family-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  const bin = mkdtempSync(join(tmpdir(), "codespell-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  });
  writeFileSync(
    join(bin, "codespell"),
    `#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const args = process.argv.slice(2);
if (process.env.CODESPELL_BROKEN) { console.error("broken"); process.exit(2); }
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : "");
const words = { colour: "color", licence: "license", favour: "favor", honour: "honor", cancelled: "canceled" }; // codespell:ignore
const ignore = opt("--ignore-words-list").split(",");
let found = false;
for (const file of args.slice(args.indexOf("--") + 1)) {
  for (const [w] of file.matchAll(new RegExp(opt("--regex"), "g")))
    if (args.includes("--check-filenames") && words[w.toLowerCase()]) console.log(\`\${file}: \${w} ==> \${words[w.toLowerCase()]}\`), (found = true);
  readFileSync(file, "utf8").split("\\n").forEach((line, i) => {
    for (const [w] of line.replace(new RegExp(opt("--ignore-regex"), "g"), "").matchAll(new RegExp(opt("--regex"), "g"))) {
      if (words[w.toLowerCase()] && !ignore.includes(w.toLowerCase())) console.log(\`\${file}:\${i + 1}: \${w} ==> \${words[w.toLowerCase()]}\`), (found = true);
    }
  });
}
process.exit(found ? 65 : 0);
`,
  );
  chmodSync(join(bin, "codespell"), 0o755);
  return { root, PATH: `${bin}${delimiter}${process.env.PATH}` };
}
