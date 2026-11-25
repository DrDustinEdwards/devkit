#!/usr/bin/env node
// The install a deploy job runs, and a pull request runs too so no PR is green while its deploy would fail
// (worker-deploy.yml's "Install", pr.yml's "Deploy install").
//
//   INSTALL='<command>' node deploy-install.mjs     run the caller's command as written, nothing more
//   node deploy-install.mjs                         the default, in three parts:
//     1. `npm ci --ignore-scripts`: no dependency's install script runs in a job that holds the deploy token.
//     2. each dependency the lockfile resolves from git is built from its locked commit: cloned, its own dependencies
//        installed without scripts, packed (which runs its `prepare`, the build a package such as site-api or d1-dump
//        ships no dist/ without) and unpacked over node_modules. npm skips that prepare under --ignore-scripts, and
//        `npm rebuild` does not run it (npm 11 and 12 alike), so this does not lean on npm for it. Only the git
//        dependency's own prepare runs, never a script of a registry dependency.
//     3. the repository's own `postinstall` and `prepare`, which are its reviewed code and may need the packages above.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isMain } from "../node/index.mjs";

const DEFAULT_INSTALL = "npm ci --ignore-scripts";

/**
 * The dependencies a package-lock.json resolves from git: the package's folder in node_modules, the repository to fetch and
 * the locked commit. A git dependency nested under another package is an error, never a skip.
 * @param {{ packages?: Record<string, { resolved?: string }> }} lock
 * @returns {{ name: string, url: string, sha: string }[]}
 */
export function gitDeps(lock) {
  const deps = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path || !entry.resolved?.startsWith("git+")) continue;
    const name = path.slice("node_modules/".length);
    if (!path.startsWith("node_modules/") || name.includes("node_modules/")) {
      throw new Error(
        `${path} is installed from git but nested, so it cannot be rebuilt in place. Hoist it.`,
      );
    }
    const [repo, sha] = entry.resolved.slice("git+".length).split("#");
    if (!/^[0-9a-f]{40}$/.test(sha ?? ""))
      throw new Error(`${path} is locked to ${entry.resolved}, not a commit.`);
    // The lock records the ssh form; a runner has no key for it, and a public repository needs none over https.
    const url = repo.replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
    deps.push({ name, url, sha });
  }
  return deps.sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {string} command @param {string[]} args @param {string} [cwd] */
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { stdio: "inherit", shell: false, cwd });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

/**
 * Build one git dependency at its locked commit and put the packed result in node_modules.
 * @param {{ name: string, url: string, sha: string }} dep
 */
export function build({ name, url, sha }) {
  const work = mkdtempSync(join(tmpdir(), "git-dep-"));
  const src = join(work, "src");
  try {
    mkdirSync(src);
    run("git", ["init", "-q"], src);
    run("git", ["fetch", "-q", "--depth", "1", url, sha], src);
    run("git", ["checkout", "-q", "FETCH_HEAD"], src);
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], src);
    run("npm", ["pack", "--pack-destination", work], src);
    const target = join(process.cwd(), "node_modules", name);
    // npm put the package's own dependencies that it could not hoist inside it; the packed files do not carry them.
    const nested = join(target, "node_modules");
    const kept = join(work, "nested");
    if (existsSync(nested)) renameSync(nested, kept);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    const tarball = readdirSync(work).find((file) => file.endsWith(".tgz"));
    run("tar", ["-xzf", join(work, tarball ?? ""), "--strip-components=1", "-C", target]);
    if (existsSync(kept)) renameSync(kept, nested);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main() {
  const custom = process.env.INSTALL?.trim();
  if (custom) {
    run("bash", ["-euo", "pipefail", "-c", custom]);
    return;
  }
  run("bash", ["-euo", "pipefail", "-c", DEFAULT_INSTALL]);
  for (const dep of gitDeps(JSON.parse(readFileSync("package-lock.json", "utf8")))) {
    console.log(`Building ${dep.name} at ${dep.sha} from git`);
    build(dep);
  }
  run("bash", [
    "-euo",
    "pipefail",
    "-c",
    "npm run --if-present postinstall && npm run --if-present prepare",
  ]);
}

if (isMain(import.meta.url)) main();
