#!/usr/bin/env node
// THE FAST CHECKS A PUSH WOULD FAIL, RUN BEFORE THE PUSH.
//
// About three in ten pushes from a thread failed a check that needs only the working tree: an AI trailer or Claude author on a
// commit, formatting, the no-bloat counts, the shared-code check, the Worker size budget. This runs those on the commits the
// push adds, so the fix comes before the push, not after a CI run.
//
//   npx devkit-pre-push                 run the checks against the default branch (origin/HEAD, origin/main, origin/master)
//   node bin/pre-push.mjs --hook        as a Claude Code PreToolUse hook on Bash: the payload on stdin; only a `git push`
//                                       command runs the checks (claude/hooks/pre-push.sh is the wrapper)
//
// Exit 0: every check passed, or nothing needed one. Exit 1 (2 as a hook, which is what blocks the call): a check found a
// problem the push would fail on. A check that could not run (a missing tool, no network, a timeout, no base branch) is
// printed as skipped and does not block: CI still runs it, and a hook that stalls every push on a flaky tool costs more than
// it saves. The checks are devkit's own bins, the ones CI runs, so a pass here is a pass there. Each runs only where the
// repository has it: format:check as a package script, .no-bloat.json, .worker-size.json. A prepare step the caller workflow
// gives on one line (`no-bloat-prepare:`, `worker-size-prepare:`) runs first; several Workers (`worker-size-workers:` /
// `workers:`) are left to CI.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isMain } from "../node/index.mjs";

const BIN = fileURLToPath(new URL(".", import.meta.url));
/** The version devkit-shared's spelling check pins (bin/shared/spelling.mjs). */
const CODESPELL = "codespell==2.4.3";
const MINUTE = 60_000;

/** True for a command that pushes commits: not a delete, and not a push of tags alone. */
export function pushesCommits(/** @type {string} */ command) {
  const m = /\bgit\s+(?:-[Cc]\s+\S+\s+|--\S+\s+)*push\b([^;&|\n]*)/.exec(command);
  if (!m) return false;
  const args = m[1].split(/\s+/).filter(Boolean);
  if (args.some((a) => a === "--delete" || a === "-d" || /^:\S/.test(a))) return false;
  return !(args.includes("--tags") && !args.some((a) => a.startsWith("HEAD") || a.includes("/")));
}

/**
 * The one-line value a caller workflow gives an input, or null when none does or it spans lines.
 * @param {string} root
 * @param {string} name
 * @returns {string | null | undefined} undefined: the workflows do not name the input; null: named, but not on one line
 */
export function callerInput(root, name) {
  const dir = join(root, ".github", "workflows");
  if (!existsSync(dir)) return undefined;
  const re = new RegExp(`^\\s*${name}:\\s*(.*)$`, "m");
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const m = re.exec(readFileSync(join(dir, f), "utf8"));
    if (!m) continue;
    const v = m[1].replace(/\s+#.*$/, "").trim();
    if (!v || /^[|>][+-]?$/.test(v)) return null;
    return v.replace(/^(["'])(.*)\1$/, "$2");
  }
  return undefined;
}

/** @param {string[]} args @param {string} cwd */
const git = (args, cwd) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
};

/**
 * Makes sure devkit-shared's spelling check can run: codespell or pipx on PATH, else a user install of the pinned codespell
 * (`pip install --user`, then again with --break-system-packages for a Python that refuses it), with ~/.local/bin on PATH
 * for the child. Best effort: when nothing installs, the shared check reports it could not run and is skipped.
 * @returns {NodeJS.ProcessEnv} the environment the shared check runs with
 */
export function withCodespell() {
  const has = (/** @type {string} */ cmd, env = process.env) =>
    !spawnSync(cmd, ["--version"], { env, stdio: "ignore" }).error;
  if (has("codespell") || has("pipx")) return process.env;
  const env = {
    ...process.env,
    PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH ?? ""}`,
  };
  if (has("codespell", env)) return env;
  for (const py of ["python3", "python"])
    for (const extra of [[], ["--break-system-packages"]]) {
      const r = spawnSync(py, ["-m", "pip", "install", "--quiet", "--user", ...extra, CODESPELL], {
        stdio: "ignore",
        timeout: 2 * MINUTE,
      });
      if (r.status === 0 && has("codespell", env)) return env;
    }
  return process.env;
}

/** The default branch's remote ref, or "" when the clone knows none. */
export function baseRef(/** @type {string} */ root) {
  const head = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], root);
  for (const ref of [head, "origin/main", "origin/master"])
    if (ref && git(["rev-parse", "--verify", "--quiet", ref], root)) return ref;
  return "";
}

/**
 * @typedef {{ name: string, status: "pass" | "fail" | "skip", detail: string }} Result
 * @param {string} name
 * @param {string} cwd
 * @param {string} command
 * @param {string[]} args
 * @param {number} timeout
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<{ code: number | null, out: string, error: string }>}
 */
function run(name, cwd, command, args, timeout, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...env, CI: "", GITHUB_STEP_SUMMARY: "", GITHUB_ACTIONS: "" },
    });
    let out = "";
    let error = "";
    const timer = setTimeout(() => {
      error = `${name} took over ${timeout / MINUTE} minutes`;
      child.kill("SIGKILL");
    }, timeout);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, out, error: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, error });
    });
  });
}

const tail = (/** @type {string} */ text) =>
  text
    .replace(/^::(?:error|warning|notice)[^:]*::/gm, "")
    .trim()
    .split("\n")
    .slice(-12)
    .join("\n");

/**
 * Runs every check the repository has; all of them, so one push shows every problem.
 * @param {string} root
 * @returns {Promise<Result[]>}
 */
export async function checks(root) {
  const base = baseRef(root);
  const sha = base ? git(["merge-base", base, "HEAD"], root) : "";
  const pkgFile = join(root, "package.json");
  const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")) : {};
  /** @type {Array<Promise<Result>>} */
  const jobs = [];
  const skip = (/** @type {string} */ name, /** @type {string} */ detail) =>
    Promise.resolve(/** @type {Result} */ ({ name, status: "skip", detail }));
  /**
   * @param {string} name
   * @param {string} command
   * @param {string[]} args
   * @param {number} minutes
   * @param {(r: { code: number | null, out: string }) => boolean} failed whether the exit means a real finding
   * @param {string} [prepare] a one-line command run first, through bash
   * @param {NodeJS.ProcessEnv} [env]
   */
  const job = (name, command, args, minutes, failed, prepare, env) =>
    jobs.push(
      (async () => {
        if (prepare) {
          const p = await run(name, root, "bash", ["-euo", "pipefail", "-c", prepare], 5 * MINUTE);
          if (p.code !== 0)
            return {
              name,
              status: "skip",
              detail: `prepare did not run: ${p.error || tail(p.out)}`,
            };
        }
        const r = await run(name, root, command, args, minutes * MINUTE, env);
        if (r.error) return { name, status: "skip", detail: r.error };
        if (r.code === 0) return { name, status: "pass", detail: "" };
        return failed(r)
          ? { name, status: "fail", detail: tail(r.out) }
          : { name, status: "skip", detail: `could not run (exit ${r.code}): ${tail(r.out)}` };
      })(),
    );
  const node = process.execPath;

  if (!base || !sha) {
    jobs.push(
      skip("commits", "no origin/HEAD, origin/main or origin/master here to compare against"),
    );
  } else {
    job(
      "trailers",
      node,
      [join(BIN, "check-trailers.mjs"), sha, "HEAD", "--authors"],
      1,
      (r) => r.code === 1,
    );
    job(
      "shared code",
      node,
      [join(BIN, "shared.mjs"), "--base", sha],
      3,
      (r) => r.code === 1,
      undefined,
      withCodespell(),
    );
    if (existsSync(join(root, ".no-bloat.json"))) {
      const prepare = callerInput(root, "no-bloat-prepare");
      if (prepare === null) jobs.push(skip("no-bloat", "its prepare step spans lines: left to CI"));
      else
        job(
          "no-bloat",
          node,
          [join(BIN, "no-bloat.mjs"), "--lines-from", base],
          5,
          (r) => r.code === 1,
          prepare,
        );
    }
  }
  if (typeof pkg.scripts?.["format:check"] === "string")
    job("format", "npm", ["run", "--silent", "format:check"], 2, (r) => r.code === 1);
  if (existsSync(join(root, ".worker-size.json"))) {
    const several = callerInput(root, "worker-size-workers") ?? callerInput(root, "workers");
    const prepare = callerInput(root, "worker-size-prepare");
    if (several !== undefined) jobs.push(skip("worker size", "several Workers: left to CI"));
    else if (prepare === null)
      jobs.push(skip("worker size", "its prepare step spans lines: left to CI"));
    else
      job(
        "worker size",
        node,
        [join(BIN, "worker-size.mjs")],
        8,
        (r) => /is over the budget/.test(r.out),
        prepare,
      );
  }
  return Promise.all(jobs);
}

/** The report a push prints, one line per check and the findings under the ones that failed. */
export function report(/** @type {Result[]} */ results) {
  const mark = { pass: "ok  ", fail: "FAIL", skip: "skip" };
  return results
    .map(
      (r) =>
        `${mark[r.status]} ${r.name}${r.detail ? `\n${r.detail.replace(/^/gm, "     ")}` : ""}`,
    )
    .join("\n");
}

async function main() {
  const hook = process.argv.includes("--hook");
  if (hook) {
    let command = "";
    try {
      command = String(JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "");
    } catch {
      return; // not a payload we can read: the other hooks fail closed; this one never blocks on its own failure
    }
    if (!pushesCommits(command)) return;
  }
  const top = git(["rev-parse", "--show-toplevel"], process.cwd());
  if (!top) return;
  const results = await checks(top);
  const failed = results.some((r) => r.status === "fail");
  const text = report(results);
  if (failed) {
    console.error(
      `Blocked: this push would fail checks CI runs. Fix these, then push again.\n${text}`,
    );
    process.exit(hook ? 2 : 1);
  }
  console.error(`pre-push checks\n${text}`);
}

if (isMain(import.meta.url)) await main();
