// Runs the `find` script of release-batch.yml as actions/github-script runs it, against a stub of the GitHub API: a package is
// released only when a changeset names a package, because an empty changeset bumps no version.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = readFileSync(
  new URL("../.github/workflows/release-batch.yml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

/** The first `script: |` block, dedented, as github-script receives it. */
const script = (() => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^\s+script: \|$/.test(line));
  assert.ok(start > 0, "a script: | block");
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !line.startsWith("            ")) break;
    body.push(line.slice(12));
  }
  return body.join("\n");
})();

const EMPTY = "---\n---\n";
const PATCH = '---\n"@dustinedwards/pkg": patch\n---\n\nA fix.\n';

/** Runs the script over repositories ({ name: { changesets: { file: content } } }) and returns the repositories it outputs. */
async function find(/** @type {Record<string, Record<string, string>>} */ repos, only = "") {
  let output = "[]";
  const github = {
    paginate: async () => Object.keys(repos).map((name) => ({ name, archived: false })),
    rest: {
      repos: {
        listForUser: Symbol("repos"),
        getContent: async ({ repo, path }) => {
          const files = repos[repo];
          if (path === ".changeset") {
            return {
              data: [
                { name: "config.json", path: ".changeset/config.json" },
                { name: "README.md", path: ".changeset/README.md" },
                ...Object.keys(files).map((name) => ({ name, path: `.changeset/${name}` })),
              ],
            };
          }
          const name = path.replace(".changeset/", "");
          return { data: { content: Buffer.from(files[name]).toString("base64") } };
        },
      },
    },
  };
  const core = {
    info() {},
    warning() {},
    setOutput: (/** @type {string} */ _, /** @type {string} */ value) => (output = value),
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  await new AsyncFunction("github", "context", "core", "process", script)(
    github,
    { repo: { owner: "o" } },
    core,
    { env: { ONLY: only } },
  );
  return JSON.parse(output);
}

test("a package with a changeset that names a package is released", async () => {
  assert.deepEqual(await find({ pkg: { "a.md": PATCH } }), ["pkg"]);
});

test("a package whose only changesets are empty is not released", async () => {
  assert.deepEqual(await find({ pkg: { "a.md": EMPTY, "b.md": EMPTY } }), []);
});

test("one real changeset among empty ones releases the package", async () => {
  assert.deepEqual(await find({ pkg: { "a.md": EMPTY, "b.md": PATCH } }), ["pkg"]);
});
