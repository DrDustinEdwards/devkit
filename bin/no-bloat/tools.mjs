import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PACKAGES } from "../shared/data.mjs";

/** @typedef {import("./scan.mjs").Runner} Runner */

export const BUFFER = 64 * 1024 * 1024;

/**
 * Environment variables that load code into a node, npm or git process, or point one somewhere else. In Actions, where an
 * earlier step's GITHUB_ENV line (an install script's, the prepare's) sets them, the proxy and certificate ones too, so a
 * proxy that step started cannot serve another knip; a local run keeps them, for a network behind a proxy.
 */
const INJECTING =
  /^(?:NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_\w+|npm_config_\w+|GIT_\w+|DEVKIT_NO_BLOAT_TOOLS)$/i;

const IN_ACTIONS =
  /^(?:HTTPS?_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|SSL_CERT_FILE|SSL_CERT_DIR)$/i;

/** The environment with nothing that injects code (INJECTING) and no user npmrc, for the tools. Pure. */
export function cleanEnv(/** @type {NodeJS.ProcessEnv} */ env) {
  const actions = env.GITHUB_ACTIONS === "true";
  const kept = Object.entries(env).filter(
    ([k]) => !INJECTING.test(k) && !(actions && IN_ACTIONS.test(k)),
  );
  return { ...Object.fromEntries(kept), npm_config_userconfig: devNull };
}

/** The YAML parser the workflows are read with: the version devkit's own lockfile installs and its tests run. */
const YAML = `yaml@${JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).devDependencies.yaml}`;

/**
 * knip, jscpd and the YAML parser from an install this check makes for itself, never the repository's: a fresh directory
 * and npm cache in the system temp, npm's registry named outright, no user, global or project npmrc, and no install
 * scripts, at exact versions. So nothing the repository installs, patches, links or locks (a postinstall rewriting
 * node_modules/knip, a pnpm patch, a shrinkwrap or second lockfile, a hand-made node_modules) is the program that counts
 * or reads a workflow. Each tool runs on this node, with cleanEnv. Nothing is installed until a tool is first used.
 * `DEVKIT_NO_BLOAT_TOOLS` names an install to use instead, for this bin's own tests; the workflows strip it.
 * @param {string} root @param {Partial<Record<"knip" | "jscpd" | "modern-web-guidance", string>>} tools the config's `tools`, with the defaults
 * @param {string} [given] an install whose node_modules holds them
 * @returns {{ run: Runner, parseYaml: (text: string) => unknown, knipConfigs: () => string[], dir: () => string }}
 */
export function checkTools(root, tools, given = process.env.DEVKIT_NO_BLOAT_TOOLS) {
  /** @type {string | undefined} */
  let at = given || undefined;
  const install = () => {
    const specs = [...Object.entries(tools), ["yaml", YAML]];
    const problems = specs
      .filter(([name, spec]) => !new RegExp(`^${name}@\\d+\\.\\d+\\.\\d+$`).test(spec ?? ""))
      .map(
        ([name, spec]) =>
          `tools.${name} is "${spec}", and the check runs only npm's ${name} at an exact version, "${name}@x.y.z"`,
      );
    if (problems.length) throw new Error(problems.join("; "));
    const made = mkdtempSync(join(tmpdir(), "no-bloat-tools-"));
    // npm refuses one file as both: cleanEnv's user npmrc is /dev/null, so the global one is its own empty file.
    const global = join(made, "globalconfig");
    writeFileSync(global, "");
    // npm beside this node, as setup-node and every installer lay it out; PATH's only when there is none.
    const cli = join(
      dirname(process.execPath),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const [cmd, pre] = existsSync(cli)
      ? [process.execPath, [cli]]
      : process.platform === "win32"
        ? ["cmd.exe", ["/c", "npm"]]
        : ["npm", []];
    const r = spawnSync(
      cmd,
      [
        ...pre,
        "install",
        "--prefix",
        join(made, "tools"),
        "--no-save",
        "--no-package-lock",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--registry",
        "https://registry.npmjs.org/",
        "--globalconfig",
        global,
        "--cache",
        join(made, "cache"),
        ...specs.map(([, spec]) => /** @type {string} */ (spec)),
      ],
      { cwd: made, encoding: "utf8", env: cleanEnv(process.env), maxBuffer: BUFFER },
    );
    if (r.error || r.status !== 0)
      throw new Error(
        `npm could not install ${specs.map(([, s]) => s).join(" ")}: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-400)}`,
      );
    return join(made, "tools");
  };
  const dir = () => (at ??= install());
  /** @type {((text: string) => unknown) | undefined} */
  let parse;
  return {
    dir,
    run: (name, args, cwd = root) => {
      const pkg = join(dir(), "node_modules", name);
      const { bin } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
      const file = join(pkg, typeof bin === "string" ? bin : bin[name]);
      const r = spawnSync(process.execPath, [file, ...args], {
        cwd,
        encoding: "utf8",
        env: cleanEnv(process.env),
        maxBuffer: BUFFER,
      });
      if (r.error) throw r.error;
      if (r.status !== 0)
        throw new Error(
          `${name} exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 400)}`,
        );
      return r.stdout;
    },
    // Knip's plugins at this version, each with the config files it reads (knip.dev, "Plugins"), read by a node of its own.
    knipConfigs: () => {
      const index = pathToFileURL(
        join(dir(), "node_modules", "knip", "dist", "plugins", "index.js"),
      );
      const r = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const { Plugins } = await import(${JSON.stringify(index.href)}); process.stdout.write(JSON.stringify(Object.values(Plugins).flatMap((p) => (Array.isArray(p.config) ? p.config : []).filter((c) => typeof c === "string"))));`,
        ],
        { encoding: "utf8", env: cleanEnv(process.env), maxBuffer: BUFFER },
      );
      if (r.status !== 0)
        throw new Error(`Knip's plugin list could not be read: ${r.stderr.trim().slice(0, 300)}`);
      return /** @type {string[]} */ (JSON.parse(r.stdout));
    },
    // YAML 1.2, as GitHub reads a workflow (`on` is a key, not true); a key written twice fails rather than one winning.
    parseYaml: (text) => {
      parse ??= (t) =>
        createRequire(join(dir(), "node_modules", "_.js"))("yaml").parse(t, { uniqueKeys: true });
      return parse(text);
    },
  };
}

export function messageOf(/** @type {unknown} */ error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The shared packages installed in node_modules (the repository's own left out) for the shared copies, and those the root
 * package.json depends on that are not installed.
 */
export function installedPackages(/** @type {string} */ root) {
  /** @type {{ name?: string, dependencies?: object, devDependencies?: object }} */
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    // No package.json, or one that is not JSON: nothing is named, and only what is installed is read.
  }
  const wanted = { ...manifest.dependencies, ...manifest.devDependencies };
  const packages = [];
  const missing = [];
  for (const { name, repo } of PACKAGES) {
    if (name === manifest.name) continue;
    const dir = join(root, "node_modules", name);
    if (existsSync(join(dir, "package.json"))) packages.push({ repo, dir });
    else if (name in wanted) missing.push(name);
  }
  return { root, packages, missing };
}

/**
 * Makes every git call of this run read the repository as committed, whatever an earlier step's GITHUB_ENV line set: no
 * GIT_DIR, GIT_INDEX_FILE or GIT_CONFIG_* of its own, no replace refs, and no fsmonitor hook answering for the files.
 * In Actions only: a local run inside a git hook needs its GIT_ variables.
 */
export function hardenGit(/** @type {NodeJS.ProcessEnv} */ env) {
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k)) delete env[k];
  Object.assign(env, {
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "core.untrackedCache",
    GIT_CONFIG_VALUE_1: "false",
  });
}

/**
 * In Actions, what keeps the check from counting the commit the run is for (GITHUB_SHA, which no step can change): HEAD
 * moved, a tracked file marked so git does not look at it, or a tracked file that differs from the commit. The install
 * and the prepare step run the repository's code before the check, and a script that resets the tree to the base would
 * otherwise have the base counted. Untracked files are counted as part of the change, so making one hides nothing.
 * Empty outside Actions, where a local run counts the working tree on purpose.
 * @param {string} root
 * @param {string} [sha]
 */
export function checkoutProblems(
  root,
  sha = process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_SHA : undefined,
) {
  if (!sha) return [];
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const fix =
    "Nothing that runs before the check (an install script, the prepare step) may change the checkout: generate into ignored files.";
  const head = git(["rev-parse", "HEAD"]).trim();
  if (head !== sha)
    return [
      `HEAD is ${head.slice(0, 7)}, not ${sha.slice(0, 7)}, the commit this run is for, so the check would count another commit. ${fix}`,
    ];
  const list = (/** @type {string[]} */ paths) =>
    `${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ` and ${paths.length - 3} more` : ""}`;
  /** @type {string[]} */
  const out = [];
  // `git ls-files -v`: a lower-case tag is assume-unchanged, S is skip-worktree; git status skips both.
  const hidden = git(["ls-files", "-v", "-z"])
    .split("\0")
    .filter((l) => /^(?:[a-z]|S) /.test(l))
    .map((l) => l.slice(2));
  if (hidden.length)
    out.push(
      `${list(hidden)} ${hidden.length === 1 ? "is" : "are"} marked assume-unchanged or skip-worktree, so git does not show a change to them. ${fix}`,
    );
  const changed = git(["status", "--porcelain=v1", "-z", "--untracked-files=no"])
    .split("\0")
    .filter((l) => /^.. /.test(l))
    .map((l) => l.slice(3));
  if (changed.length)
    out.push(
      `${list(changed)} ${changed.length === 1 ? "differs" : "differ"} from ${sha.slice(0, 7)}, the commit this run is for, after the install and the prepare step. ${fix}`,
    );
  return out;
}
