// Runs the release step of release.yml in bash, as the runner does, with `gh` replaced by a stub that records its calls:
// the tag and the release are made once, only on the default branch, with the version's own CHANGELOG section.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const text = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

/** The `run: |` block of the step whose line contains `marker`, dedented. */
const block = (/** @type {string} */ marker) => {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.includes(marker));
  const start = at + lines.slice(at).findIndex((line) => /^\s+run: \|$/.test(line));
  const indent = lines[start + 1].search(/\S/);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
};
const checkScript = block("- id: release");
const publishScript = block("- id: publish");

function run({
  version = "0.19.0",
  changelog = "",
  tagExists = false,
  ref = "refs/heads/main",
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    if (changelog) writeFileSync(join(dir, "CHANGELOG.md"), changelog);
    writeFileSync(
      join(dir, "gh"),
      `#!/bin/sh\necho "$*" >> "${dir}/calls"\nfor a in "$@"; do [ "$prev" = --notes-file ] && cat "$a" > "${dir}/notes"; prev="$a"; done\ncase "$*" in "api repos/o/r/git/ref/tags/"*) ${tagExists ? "exit 0" : "exit 1"};; esac\n`,
    );
    chmodSync(join(dir, "gh"), 0o755);
    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GITHUB_REF: ref,
      DEFAULT_BRANCH: "main",
      GITHUB_REPOSITORY: "o/r",
      GITHUB_SHA: "abc",
      GITHUB_OUTPUT: join(dir, "out"),
      RUNNER_TEMP: dir,
    };
    let result = spawnSync("bash", ["-e", "-c", checkScript], { cwd: dir, encoding: "utf8", env });
    // The publish step runs only when the check found no tag yet, as its `if` says.
    if (result.status === 0 && readFileSync(join(dir, "out"), "utf8").includes("new=true"))
      result = spawnSync("bash", ["-e", "-c", publishScript], {
        cwd: dir,
        encoding: "utf8",
        env: { ...env, TAG: `v${version}`, BUILD: "false" },
      });
    const read = (/** @type {string} */ f) => {
      try {
        return readFileSync(join(dir, f), "utf8");
      } catch {
        return "";
      }
    };
    return { status: result.status, calls: read("calls"), notes: read("notes"), out: read("out") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The steps are bash, as the runner has.
const BASH = { skip: process.platform === "win32" };

const CHANGELOG =
  "# Changelog\n\n## 0.19.0 (2026-10-31)\n\n- New.\n\n## 0.18.0 (2026-10-30)\n\n- Old.\n";

test("a new version is tagged and released with its own CHANGELOG section", BASH, () => {
  const r = run({ changelog: CHANGELOG });
  assert.equal(r.status, 0);
  assert.match(r.calls, /git\/refs -f ref=refs\/tags\/v0\.19\.0 -f sha=abc/);
  assert.match(r.calls, /release create v0\.19\.0 --verify-tag --title v0\.19\.0 --notes-file/);
  assert.equal(r.notes.trim(), "- New.");
  assert.match(r.out, /created=true/);
});

test("a bracketed heading is found, and no section falls back to generated notes", BASH, () => {
  assert.equal(
    run({ changelog: "## [0.19.0] - 2026-10-31\n\n- Bracketed.\n\n## [0.18.0]\n" }).notes.trim(),
    "- Bracketed.",
  );
  assert.match(run({ changelog: "## 0.18.0\n\n- Old.\n" }).calls, /--generate-notes/);
});

test("an existing tag releases nothing", BASH, () => {
  const r = run({ changelog: CHANGELOG, tagExists: true });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.calls, /release create|git\/refs -f/);
  assert.match(r.out, /created=false/);
});

test("another branch or a version that is not X.Y.Z fails before anything is made", BASH, () => {
  for (const r of [run({ ref: "refs/heads/feature" }), run({ version: "1.0" })]) {
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.calls, /release create|git\/refs -f/);
  }
});

test("the step that builds runs the package's code without the token", () => {
  assert.ok(text.includes("- name: Build the package"), "the build step moved");
  const build = text.slice(
    text.indexOf("- name: Build the package"),
    text.indexOf("- id: publish"),
  );
  assert.doesNotMatch(build, /GH_TOKEN|github\.token|secrets\./);
});
