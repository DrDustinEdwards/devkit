// bin/pre-push.mjs: which commands count as a push, the caller-workflow inputs it reads, and, in a scratch repository with a
// bare origin, that a Claude trailer blocks the push as a hook (exit 2) while a clean commit, a non-push command and a
// check that cannot run do not.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { callerInput, pushesCommits, withCodespell } from "../bin/pre-push.mjs";

const BIN = fileURLToPath(new URL("../bin/pre-push.mjs", import.meta.url));

test("a git push of commits counts; a delete, a tags-only push and other commands do not", () => {
  for (const c of [
    "git push",
    "git push -u origin claude/x",
    "git -C repo push origin HEAD",
    "cd a && git push --force-with-lease origin main",
  ])
    assert.equal(pushesCommits(c), true, c);
  for (const c of [
    "git push origin --delete old",
    "git push origin :old",
    "git push --tags",
    "git pull",
    "echo git pushy",
    "npm test",
  ])
    assert.equal(pushesCommits(c), false, c);
});

test("callerInput reads a one-line value, null for a block, undefined when no workflow names it", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-push-caller-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "checks.yml"),
      [
        "jobs:",
        "  checks:",
        "    with:",
        "      no-bloat-prepare: npm run build # why",
        "      worker-size-prepare: |",
        "        npm ci",
        '      node-version-file: ".nvmrc"',
      ].join("\n"),
    );
    assert.equal(callerInput(dir, "no-bloat-prepare"), "npm run build");
    assert.equal(callerInput(dir, "worker-size-prepare"), null);
    assert.equal(callerInput(dir, "node-version-file"), ".nvmrc");
    assert.equal(callerInput(dir, "workers"), undefined);
    assert.equal(callerInput(join(dir, "none"), "workers"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "as a hook it blocks a push whose commit carries an AI trailer and lets a clean one and a non-push through",
  { skip: process.platform === "win32" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "pre-push-repo-"));
    try {
      const sh = (/** @type {string[]} */ args, cwd = join(dir, "work")) =>
        execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
      mkdirSync(join(dir, "work"));
      sh(["init", "-q", "--bare", join(dir, "origin.git")], dir);
      sh(["init", "-q", "-b", "main"]);
      sh(["config", "user.name", "Dustin Edwards"]);
      sh(["config", "user.email", "d@example.com"]);
      sh(["remote", "add", "origin", join(dir, "origin.git")]);
      writeFileSync(join(dir, "work", "a.txt"), "a\n");
      sh(["add", "a.txt"]);
      sh(["commit", "-q", "-m", "first"]);
      sh(["push", "-q", "origin", "main"]);
      sh(["fetch", "-q", "origin"]);
      sh(["remote", "set-head", "origin", "main"]);

      const hook = (/** @type {string} */ command) =>
        spawnSync(process.execPath, [BIN, "--hook"], {
          cwd: join(dir, "work"),
          input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
          encoding: "utf8",
        });

      writeFileSync(join(dir, "work", "b.txt"), "b\n");
      sh(["add", "b.txt"]);
      sh(["commit", "-q", "-m", "clean"]);
      const clean = hook("git push -u origin work");
      assert.equal(clean.status, 0, clean.stderr);
      assert.match(clean.stderr, /ok {3}trailers/);

      writeFileSync(join(dir, "work", "c.txt"), "c\n");
      sh(["add", "c.txt"]);
      sh(["commit", "-q", "-m", "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"]);
      const bad = hook("git push -u origin work");
      assert.equal(bad.status, 2);
      assert.match(bad.stderr, /Blocked: this push would fail checks CI runs/);
      assert.match(bad.stderr, /FAIL trailers/);
      assert.equal(hook("npm test").status, 0);
      assert.equal(hook("git push origin --delete old").status, 0);

      // The same commit as a plain run exits 1; a payload that is not JSON never blocks.
      assert.equal(
        spawnSync(process.execPath, [BIN], { cwd: join(dir, "work"), encoding: "utf8" }).status,
        1,
      );
      assert.equal(
        spawnSync(process.execPath, [BIN, "--hook"], {
          cwd: join(dir, "work"),
          input: "not json",
        }).status,
        0,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "withCodespell leaves the environment alone when codespell is already on PATH",
  { skip: process.platform === "win32" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "pre-push-codespell-"));
    const path = process.env.PATH;
    try {
      writeFileSync(join(dir, "codespell"), "#!/bin/sh\nexit 0\n");
      chmodSync(join(dir, "codespell"), 0o755);
      process.env.PATH = `${dir}:${path}`;
      assert.equal(withCodespell(), process.env);
    } finally {
      process.env.PATH = path;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
