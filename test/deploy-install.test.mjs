// Holds bin/deploy-install.mjs to its promise: a dependency the lockfile resolves from git is built from its locked commit,
// with its own prepare, and a registry dependency's script never runs. The build case uses a real local git repository.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { build, gitDeps, lockRoot } from "../bin/deploy-install.mjs";

const SHA = "a".repeat(40);

test("gitDeps lists only the git-resolved packages, with the https URL and the locked commit", () => {
  const deps = gitDeps({
    packages: {
      "": { resolved: undefined },
      "node_modules/@scope/site-api": {
        resolved: `git+ssh://git@github.com/Owner/site-api.git#${SHA}`,
      },
      "node_modules/zod": { resolved: "https://registry.npmjs.org/zod/-/zod-4.0.0.tgz" },
      "node_modules/prelum": { resolved: `git+https://github.com/Owner/prelum.git#${SHA}` },
    },
  });
  assert.deepEqual(deps, [
    { name: "@scope/site-api", url: "https://github.com/Owner/site-api.git", sha: SHA },
    { name: "prelum", url: "https://github.com/Owner/prelum.git", sha: SHA },
  ]);
});

test("gitDeps refuses a nested git dependency and one not locked to a commit", () => {
  assert.throws(
    () =>
      gitDeps({
        packages: {
          "node_modules/a/node_modules/b": { resolved: `git+ssh://git@github.com/O/b.git#${SHA}` },
        },
      }),
    /nested/,
  );
  assert.throws(
    () =>
      gitDeps({
        packages: { "node_modules/b": { resolved: "git+ssh://git@github.com/O/b.git#main" } },
      }),
    /not a commit/,
  );
});

test("build runs the git dependency's prepare and installs its packed files, not its source", () => {
  const root = mkdtempSync(join(tmpdir(), "deploy-install-test-"));
  const cwd = process.cwd();
  try {
    const repo = join(root, "dep");
    mkdirSync(repo);
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({
        name: "dep",
        version: "1.0.0",
        files: ["dist"],
        scripts: {
          prepare:
            "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/index.js','built')\"",
        },
      }),
    );
    writeFileSync(join(repo, "src.txt"), "source");
    const git = (/** @type {string[]} */ ...args) =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "uploadpack.allowAnySHA1InWant", "true");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "dep");
    const sha = git("rev-parse", "HEAD");

    const site = join(root, "site");
    mkdirSync(join(site, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(site, "node_modules", "dep", "stale.txt"), "");
    mkdirSync(join(site, "node_modules", "dep", "node_modules", "inner"), { recursive: true });
    process.chdir(site);
    build({ name: "dep", url: `file://${repo}`, sha });

    assert.equal(
      readFileSync(join(site, "node_modules", "dep", "dist", "index.js"), "utf8"),
      "built",
    );
    assert.ok(!existsSync(join(site, "node_modules", "dep", "src.txt")), "the packed files only");
    assert.ok(
      !existsSync(join(site, "node_modules", "dep", "stale.txt")),
      "the old copy is replaced",
    );
    assert.ok(
      existsSync(join(site, "node_modules", "dep", "node_modules", "inner")),
      "its nested dependencies stay",
    );
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test("lockRoot finds the nearest folder at or above with a package-lock.json", () => {
  const root = mkdtempSync(join(tmpdir(), "deploy-install-lock-"));
  try {
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    mkdirSync(join(root, "mcp"), { recursive: true });
    writeFileSync(join(root, "package-lock.json"), "{}");
    writeFileSync(join(root, "mcp", "package-lock.json"), "{}");
    assert.equal(lockRoot(join(root, "apps", "web")), root);
    assert.equal(lockRoot(root), root);
    assert.equal(lockRoot(join(root, "mcp")), join(root, "mcp"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
