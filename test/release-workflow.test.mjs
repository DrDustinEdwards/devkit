// Runs the release steps of release.yml in bash, as the runner does, in a throwaway git repository, with `gh` replaced by a
// stub that records its calls: every untagged version bump since the newest tag is released on its own commit, oldest
// first, with its own CHANGELOG section, only on the default branch, and a tag that exists is never touched.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const GIT = ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"];

/**
 * Builds a repository from `commits` ({ version, changelog?, tag? } in order), runs the check step and, when it found
 * something to release, the publish step. Returns the plan (tag and short commit subject), the gh calls and the outputs.
 */
function run({ commits, ref = "refs/heads/main" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  const temp = join(dir, "tmp");
  const repo = join(dir, "repo");
  mkdirSync(temp);
  mkdirSync(repo);
  try {
    const git = (/** @type {string[]} */ ...args) =>
      spawnSync("git", [...GIT, ...args], { cwd: repo, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    const shas = [];
    for (const [n, c] of commits.entries()) {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ version: c.version }));
      if (c.changelog) writeFileSync(join(repo, "CHANGELOG.md"), c.changelog);
      writeFileSync(join(repo, "other.txt"), String(n));
      git("add", "-A");
      git("commit", "-q", "-m", `c${n}`);
      shas.push(git("rev-parse", "HEAD").stdout.trim());
      if (c.tag) git("tag", c.tag);
    }
    writeFileSync(
      join(dir, "gh"),
      `#!/bin/sh\necho "$*" >> "${dir}/calls"\nfor a in "$@"; do [ "$prev" = --notes-file ] && cat "$a" > "${dir}/notes-$(basename "$a")"; prev="$a"; done\n`,
    );
    chmodSync(join(dir, "gh"), 0o755);
    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GITHUB_REF: ref,
      DEFAULT_BRANCH: "main",
      GITHUB_REPOSITORY: "o/r",
      GITHUB_OUTPUT: join(dir, "out"),
      RUNNER_TEMP: temp,
    };
    const sh = (/** @type {string} */ script) =>
      spawnSync("bash", ["-e", "-c", script], { cwd: repo, encoding: "utf8", env });
    let result = sh(checkScript);
    const read = (/** @type {string} */ f) => {
      try {
        return readFileSync(f, "utf8");
      } catch {
        return "";
      }
    };
    const out = () => read(join(dir, "out"));
    // The publish step runs only when the check found something, as its `if` says.
    if (result.status === 0 && out().includes("new=true"))
      result = sh(publishScript.replace("$BUILD", "false"));
    const plan = read(join(temp, "releases.tsv"))
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [tag, sha] = line.split("\t");
        return { tag, commit: shas.indexOf(sha) };
      });
    return {
      status: result.status,
      plan,
      calls: read(join(dir, "calls")),
      out: out(),
      notes: Object.fromEntries(
        plan.map(({ tag }) => [tag, read(join(temp, "notes", `${tag}.md`))]),
      ),
      shas,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The steps are bash, as the runner has.
const BASH = { skip: process.platform === "win32" };

const CHANGELOG =
  "# Changelog\n\n## 0.3.0 (2026-10-31)\n\n- Three.\n\n## 0.2.0 (2026-10-30)\n\n- Two.\n";

test(
  "every untagged bump since the newest tag is released on its own commit, oldest first",
  BASH,
  () => {
    // 0.2.0 and 0.3.0 merged while a run was going: only 0.3.0 had a run, and 0.2.0 has no tag.
    const r = run({
      commits: [
        { version: "0.1.0", tag: "v0.1.0" },
        { version: "0.2.0" },
        { version: "0.3.0", changelog: CHANGELOG },
      ],
    });
    assert.equal(r.status, 0);
    assert.deepEqual(r.plan, [
      { tag: "v0.2.0", commit: 1 },
      { tag: "v0.3.0", commit: 2 },
    ]);
    assert.ok(
      r.calls.indexOf("ref=refs/tags/v0.2.0") < r.calls.indexOf("ref=refs/tags/v0.3.0"),
      r.calls,
    );
    assert.match(r.calls, new RegExp(`ref=refs/tags/v0\\.2\\.0 -f sha=${r.shas[1]}`));
    assert.match(r.calls, new RegExp(`ref=refs/tags/v0\\.3\\.0 -f sha=${r.shas[2]}`));
    assert.match(
      r.calls,
      /release create v0\.3\.0 --latest --verify-tag --title v0\.3\.0 --notes-file/,
    );
    assert.match(
      r.calls,
      /release create v0\.2\.0 --latest --verify-tag --title v0\.2\.0 --generate-notes/,
    );
    assert.equal(r.notes["v0.3.0"].trim(), "- Three.");
    assert.match(r.out, /tag=v0\.3\.0/);
    assert.match(r.out, /created=true/);
  },
);

test("a bump skipped between two tags is backfilled and is not the latest release", BASH, () => {
  const r = run({
    commits: [
      { version: "0.1.0", tag: "v0.1.0" },
      { version: "0.2.0" },
      { version: "0.3.0", tag: "v0.3.0" },
    ],
  });
  assert.deepEqual(r.plan, [{ tag: "v0.2.0", commit: 1 }]);
  assert.match(r.calls, /release create v0\.2\.0 --latest=false --verify-tag/);
  assert.match(r.out, /tag=v0\.3\.0/);
});

test("a version bumped twice is released once, on its first commit", BASH, () => {
  const r = run({
    commits: [{ version: "0.1.0", tag: "v0.1.0" }, { version: "0.2.0" }, { version: "0.2.0" }],
  });
  assert.deepEqual(r.plan, [{ tag: "v0.2.0", commit: 1 }]);
});

test(
  "with no tag yet only package.json's version is released, with a bracketed heading found",
  BASH,
  () => {
    const r = run({
      commits: [
        { version: "0.0.1" },
        { version: "0.1.0", changelog: "## [0.1.0] - 2026-10-31\n\n- Bracketed.\n\n## [0.0.1]\n" },
      ],
    });
    assert.deepEqual(r.plan, [{ tag: "v0.1.0", commit: 1 }]);
    assert.equal(r.notes["v0.1.0"].trim(), "- Bracketed.");
  },
);

test("an existing tag releases nothing and moves nothing", BASH, () => {
  const r = run({
    commits: [{ version: "0.1.0" }, { version: "0.2.0", tag: "v0.2.0" }],
  });
  assert.equal(r.status, 0);
  assert.deepEqual(r.plan, []);
  assert.equal(r.calls, "");
  assert.match(r.out, /created=false/);
});

test("another branch or a version that is not X.Y.Z fails before anything is made", BASH, () => {
  for (const r of [
    run({ commits: [{ version: "0.1.0" }], ref: "refs/heads/feature" }),
    run({ commits: [{ version: "1.0" }] }),
  ]) {
    assert.equal(r.status, 1);
    assert.equal(r.calls, "");
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
