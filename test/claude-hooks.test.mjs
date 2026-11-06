// The .claude/settings.json block in README ("The shared Claude Code hooks"), which every repository copies, run as Claude
// Code runs a hook command: through sh, the payload on stdin, $CLAUDE_PROJECT_DIR set. It must fail closed: without devkit
// installed it blocks every call but a bare Bash `npm ci` or `npm install`, and once installed it runs the real hook.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const block = /## The shared Claude Code hooks[\s\S]*?```json\n([\s\S]*?)\n```/.exec(
  readFileSync(join(ROOT, "README.md"), "utf8"),
);
const [emDash, scopedAdd] = JSON.parse(block?.[1] ?? "{}").hooks.PreToolUse.map(
  (/** @type {any} */ e) => e.hooks[0].command,
);

const run = (
  /** @type {string} */ command,
  /** @type {string} */ project,
  /** @type {object} */ payload,
) =>
  spawnSync("sh", ["-c", command], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: "utf8",
  }).status;
const bash = (/** @type {string} */ command) => ({
  tool_name: "Bash",
  tool_input: { command, description: "x" },
});

test("the README's settings block fails closed before npm ci and runs devkit's hook after", (t) => {
  const project = mkdtempSync(join(tmpdir(), "claude-hooks-"));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  for (const command of [emDash, scopedAdd]) {
    assert.equal(run(command, project, bash("npm ci")), 0);
    assert.equal(run(command, project, bash("npm install --no-audit")), 0);
    assert.equal(run(command, project, bash("npm ci && git add -A")), 2);
    assert.equal(run(command, project, bash("echo hi")), 2);
    // A Write whose content quotes the allowed command is escaped JSON, so it cannot pass as one.
    assert.equal(
      run(command, project, {
        tool_name: "Write",
        tool_input: { file_path: "a", content: '"command": "npm ci"' },
      }),
      2,
    );
  }
  const hooks = join(project, "node_modules/@dustinedwards/devkit/claude/hooks");
  mkdirSync(hooks, { recursive: true });
  cpSync(join(ROOT, "claude/hooks"), hooks, { recursive: true });
  assert.equal(run(emDash, project, bash("echo hi")), 0);
  assert.equal(
    run(emDash, project, { tool_name: "Write", tool_input: { file_path: "a", content: "a — b" } }),
    2,
  );
  assert.equal(run(scopedAdd, project, bash("git add -A")), 2);
  assert.equal(run(scopedAdd, project, bash("git add README.md")), 0);
});
