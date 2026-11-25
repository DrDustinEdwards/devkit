import { posix } from "node:path";
import { NOT_SOURCE, SOURCE, excused, mcpServerDirs, appOwner, readManifest } from "./core.mjs";

/** @typedef {import("./core.mjs").Config} Config */
/** @typedef {import("./core.mjs").Finding} Finding */
/** @typedef {import("./core.mjs").Tree} Tree */

/** A wrangler config: the app it sits in is a Worker. */
const WRANGLER = /(^|\/)wrangler[^/]*\.(jsonc?|toml)(\.example)?$/;

/**
 * The devkit workflows a repository needs, by what it holds: `needed` says why, or null. `runs` names the bin (or, in
 * devkit, the file) a workflow runs, so CI running that itself, directly or through a package script, counts as the call.
 * @typedef {{ workers: string[], servers: string[], script: boolean, private?: boolean, self?: string }} Holds
 * @type {{ name: string, failsFrom?: string, warn?: boolean, runs?: string[], example?: string, needed: (repo: Holds) => string | null }[]}
 */
export const WORKFLOWS = [
  { name: "checks", needed: () => "every repository" },
  { name: "workflow-audit", needed: () => "every repository" },
  { name: "dependencies", needed: () => "every repository" },
  // The automatic PR reviewer: advisory, so it costs a repository nothing to call it.
  { name: "review", failsFrom: "0.22.0", needed: () => "every repository" },
  {
    name: "worker-size",
    runs: ["devkit-worker-size"],
    needed: ({ workers }) =>
      workers.length ? `a repository with a Worker (${workers.join(", ")})` : null,
  },
  // Many Workers deploy another way today (Workers Builds, a deploy job of their own), so this one stays a warning.
  {
    name: "worker-deploy",
    warn: true,
    needed: ({ workers }) =>
      workers.length ? `a repository with a Worker (${workers.join(", ")})` : null,
  },
  {
    name: "no-bloat",
    runs: ["devkit-no-bloat", "bin/no-bloat.mjs"],
    needed: ({ script, private: closed }) =>
      script && !closed ? "a public repository with JavaScript or TypeScript" : null,
  },
  {
    name: "conformance",
    runs: ["devkit-conformance", "bin/conformance.mjs"],
    needed: ({ servers }) =>
      servers.length ? `a repository with an MCP server (${servers.join(", ")})` : null,
  },
  {
    name: "scorecard",
    failsFrom: "0.22.0",
    needed: ({ private: closed }) => (closed === false ? "a public repository" : null),
  },
  {
    name: "bump-consumers",
    example: ".github/workflows/bump-consumers.yml (the caller in its header)",
    needed: ({ self }) => (self ? "a shared package other repositories pin" : null),
  },
];

/**
 * The devkit workflows the repository's kinds need and no workflow calls. Several apps need the union of their kinds'.
 * @param {Tree} tree @param {Config} config @param {{ self?: string, private?: boolean }} [repo] `private` from the GitHub
 *   event; unknown (a local run), no-bloat is only a warning
 * @returns {Finding[]}
 */
export function checkWorkflows(tree, config, repo = {}) {
  // What the workflows run, without their comments; in devkit, without the reusable workflows it ships for others.
  const workflowFiles = tree.files
    .filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f))
    .map((f) => ({ file: f, text: tree.read(f).replace(/(^|\s)#.*$/gm, "$1") }))
    .filter(({ text: t }) => repo.self !== "devkit" || !/^\s*workflow_call:/m.test(t));
  const text = workflowFiles.map((w) => w.text).join("\n");
  const called = new Set(
    [...text.matchAll(/DrDustinEdwards\/devkit\/\.github\/workflows\/([\w.-]+?)\.ya?ml@/gi)].map(
      (m) => m[1],
    ),
  );
  // devkit calls its own workflows by path.
  if (repo.self === "devkit")
    for (const m of text.matchAll(/uses:\s*\.\/\.github\/workflows\/([\w.-]+?)\.ya?ml/g))
      called.add(m[1]);
  // pr.yml runs the pull request checks in one job: its call counts as each one its inputs leave on.
  const covered = prCovers(workflowFiles, repo.self === "devkit");
  for (const name of covered) called.add(name);
  /** @type {Finding[]} */
  const unreadable = [];
  const scripts = tree.files
    .filter((f) => posix.basename(f) === "package.json" && !NOT_SOURCE.test(f))
    .flatMap((f) => Object.entries(readManifest(tree, f, unreadable, "workflows").scripts ?? {}));
  const invokes = (/** @type {string} */ cmd, /** @type {string} */ name) =>
    new RegExp(
      `\\b(?:run(?:-script)?|pnpm|yarn|npm)\\s+(?:--?\\S+\\s+)*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:.-])`,
    ).test(cmd);
  /** @returns {boolean} */
  const reaches = (/** @type {string} */ cmd, /** @type {string} */ bin, seen = new Set()) =>
    cmd.includes(bin) ||
    scripts.some(
      ([name, body]) =>
        !seen.has(name) && invokes(cmd, name) && reaches(String(body), bin, seen.add(name)),
    );
  const apps = Object.entries(config.apps ?? { ".": "site" });
  const owner = appOwner(apps);
  const workers = apps
    .filter(
      ([dir, kind]) =>
        ["site", "private", "worker"].includes(kind) &&
        tree.files.some((f) => WRANGLER.test(f) && !NOT_SOURCE.test(f) && owner(f) === dir),
    )
    .map(([dir]) => (dir === "." ? "the root" : dir));
  const script = tree.files.some((f) => SOURCE.test(f) && !NOT_SOURCE.test(f));
  const servers = [...mcpServerDirs(tree)].map((dir) => (dir === "." ? "the root" : dir));
  /** @type {Finding[]} */
  const found = [...unreadable];
  for (const {
    name,
    failsFrom,
    warn,
    runs = [],
    example = PR_CHECKS.includes(name)
      ? "examples/pr-caller.yml (pr.yml runs it with the other pull request checks in one job)"
      : `examples/${name}-caller.yml`,
    needed,
  } of WORKFLOWS) {
    const why = needed({ workers, servers, script, private: repo.private, self: repo.self });
    if (
      !why ||
      called.has(name) ||
      runs.some((bin) => reaches(name === "no-bloat" ? gating(text) : text, bin)) ||
      excused(config, "waive", `workflow:${name}`)
    )
      continue;
    // Outside Actions the repository's visibility is unknown, so no-bloat can only say what it would need.
    const unsure = name === "no-bloat" && repo.private === undefined;
    found.push({
      check: "workflows",
      file: ".github/workflows",
      warn: warn || unsure || undefined,
      failsFrom,
      message: `${why} calls devkit's ${name}.yml, and no workflow here does: add devkit's ${example}, or say why in .shared.json "waive" "workflow:${name}"${unsure ? " (a warning here: only Actions says whether this repository is public)" : ""}`,
    });
  }
  // A stylesheet's var(--x) that nothing declares resolves to nothing, and only devkit-css-vars notices. pr.yml runs it when the repository has a .css-vars.json.
  const sheets = tree.files.some((f) => f.endsWith(".css") && !NOT_SOURCE.test(f));
  if (sheets && !excused(config, "waive", "workflow:css-vars")) {
    const runsIt =
      covered.has("css-vars") ||
      reaches(text, "devkit-css-vars") ||
      (repo.self === "devkit" && reaches(text, "bin/css-vars.mjs"));
    const configured = tree.files.includes(".css-vars.json");
    if (!configured || !runsIt)
      found.push({
        check: "workflows",
        file: configured ? ".github/workflows" : ".css-vars.json",
        failsFrom: CSS_VARS_FAILS_FROM,
        message: `a repository with stylesheets runs devkit-css-vars: ${configured ? "turn on pr.yml's css-vars input (it is off here, or no workflow calls pr.yml)" : 'add .css-vars.json ({ "dirs": [...], "declared_in": ["node_modules/capsomer"] }, see bin/css-vars.mjs), which pr.yml reads'}, or say why in .shared.json "waive" "workflow:css-vars"`,
      });
  }
  // A separate caller that still runs on pull requests beside pr.yml runs the same check twice, a runner each time.
  for (const { file, text: body } of workflowFiles) {
    if (!/^\s*(pull_request|merge_group)\s*:/m.test(onBlock(body))) continue;
    const twice = [
      ...body.matchAll(
        /(?:DrDustinEdwards\/devkit|\.)\/\.github\/workflows\/([\w.-]+?)\.ya?ml\b/gi,
      ),
    ]
      .map((m) => m[1])
      .filter((name) => PR_CHECKS.includes(name) && covered.has(name));
    if (!twice.length) continue;
    found.push({
      check: "workflows",
      file,
      failsFrom: "0.27.0",
      message: `${file} runs devkit's ${[...new Set(twice)].join(".yml, ")}.yml on pull requests, which pr.yml already runs: remove it, or drop its pull_request and merge_group triggers and keep only a schedule (dependencies' daily scan, a private repository's weekly no-bloat)`,
    });
  }
  return found;
}

/**
 * A workflow's text without the steps that cannot fail their job (`continue-on-error: true`): no-bloat run that way is a
 * report, and a report lets every new copy merge.
 */
function gating(/** @type {string} */ text) {
  return text
    .split(/\n(?=\s*-\s+(?:name|run|uses|id|if):)/)
    .filter((step) => !/^\s*continue-on-error:\s*["']?true["']?\s*$/m.test(step))
    .join("\n");
}

/** The checks pr.yml runs in its one job; a call of it counts as each one its inputs leave on. */
const PR_CHECKS = [
  "checks",
  "review",
  "dependencies",
  "workflow-audit",
  "no-bloat",
  "worker-size",
  "css-vars",
];

/** The release from which a repository with stylesheets and no css-vars run fails; a warning before it. */
const CSS_VARS_FAILS_FROM = "0.34.0";

/** A workflow's `on:` block, or its whole text when it has none at the top level. @param {string} body */
function onBlock(body) {
  const at = body.search(/^on:/m);
  return at < 0 ? body : body.slice(at + 3).split(/\n(?=\S)/)[0];
}

/**
 * The checks the repository's calls of pr.yml cover, read from each call's `with:` inputs (a boolean input set to false
 * turns its check off; `node: false` turns off no-bloat, worker-size and css-vars, which run from the install).
 * @param {{ file: string, text: string }[]} files @param {boolean} self devkit, which calls it by path
 * @returns {Set<string>}
 */
function prCovers(files, self) {
  const call = self
    ? /uses:\s*\.\/\.github\/workflows\/pr\.ya?ml\b/
    : /DrDustinEdwards\/devkit\/\.github\/workflows\/pr\.ya?ml@/i;
  /** @type {Set<string>} */
  const covered = new Set();
  for (const { text: body } of files) {
    if (!call.test(body)) continue;
    const off = (/** @type {string} */ input) =>
      new RegExp(`^\\s+${input}:\\s*["']?false["']?\\s*$`, "m").test(body);
    for (const name of PR_CHECKS) {
      const input = name === "checks" ? null : name;
      if (input && off(input)) continue;
      if (["no-bloat", "worker-size", "css-vars"].includes(name) && off("node")) continue;
      covered.add(name);
    }
  }
  return covered;
}

/** The one `lint` script every repository runs (README, "The shared lint config"). */
export const LINT_SCRIPT =
  "oxlint --type-aware --deny-warnings --report-unused-disable-directives-severity=error";

/** The one `format:check` script every repository runs. */
export const FORMAT_CHECK_SCRIPT = "oxfmt --check";

/** A linter or formatter config of a repository's own, which the shared ones replace. */
const OWN_LINT_CONFIG =
  /(^|\/)(eslint\.config\.[mc]?[jt]s|\.eslintrc(\.[\w]+)?|biome\.jsonc?|\.oxlintrc\.jsonc?|\.oxfmtrc\.jsonc?|\.prettierrc(\.[\w]+)?|prettier\.config\.[mc]?[jt]s)$/;

const LINT_FAILS_FROM = "0.25.0";

/**
 * A repository with JavaScript or TypeScript runs the shared Oxlint config, the same way everywhere: a root
 * oxlint.config.ts extending @dustinedwards/devkit/oxlint (devkit's own imports ./lint/oxlint.mjs), no linter config of
 * its own, the shared `lint` script, and a workflow that runs it. A nested oxlint.config.ts (foxing's apps/mobile) is a
 * part's own additions and is allowed.
 * @param {Tree} tree @param {Config} config @param {string} [self] the shared package's repository, if it is one
 * @returns {Finding[]}
 */
export function checkLint(tree, config, self) {
  if (
    excused(config, "waive", "lint") ||
    !tree.files.some((f) => SOURCE.test(f) && !NOT_SOURCE.test(f))
  )
    return [];
  /** @type {Finding[]} */
  const found = [];
  const add = (/** @type {string} */ file, /** @type {string} */ message) =>
    found.push({ check: "lint", file, failsFrom: LINT_FAILS_FROM, message });
  const pkg = tree.files.includes("package.json")
    ? readManifest(tree, "package.json", found, "lint")
    : {};
  const workflows = tree.files
    .filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f))
    .map((f) => tree.read(f).replace(/(^|\s)#.*$/gm, "$1"));
  for (const { tool, verb, script, command, step } of [
    {
      tool: "oxlint",
      verb: "extend",
      script: "lint",
      command: LINT_SCRIPT,
      step: "a Lint step to CI after the typecheck",
    },
    {
      tool: "oxfmt",
      verb: "spread",
      script: "format:check",
      command: FORMAT_CHECK_SCRIPT,
      step: "a Format step to CI",
    },
  ]) {
    const root = tree.files.find((f) => new RegExp(`^${tool}\\.config\\.[mc]?ts$`).test(f));
    const shared = new RegExp(
      self === "devkit"
        ? `from\\s+["']\\./lint/${tool}\\.mjs["']`
        : `from\\s+["']@dustinedwards/devkit/${tool}["']`,
    );
    if (!root)
      add(
        `${tool}.config.ts`,
        `no root ${tool}.config.ts: ${verb} @dustinedwards/devkit/${tool} (README, "The shared lint config")`,
      );
    else if (!shared.test(tree.read(root)))
      add(
        root,
        `${root} does not ${verb} @dustinedwards/devkit/${tool}: import its config from there`,
      );
    if (pkg.scripts?.[script] !== command)
      add(
        "package.json",
        `the root "${script}" script is ${pkg.scripts?.[script] === undefined ? "missing" : `"${pkg.scripts[script]}"`}: make it "${command}"`,
      );
    if (!workflows.some((t) => new RegExp(`\\bnpm run ${script}(?![\\w:.-])`).test(t)))
      add(".github/workflows", `no workflow runs \`npm run ${script}\`: add ${step}`);
  }
  for (const file of tree.files.filter((f) => OWN_LINT_CONFIG.test(f) && !NOT_SOURCE.test(f)))
    add(
      file,
      `a linter or formatter config of its own: the shared Oxlint and Oxfmt configs replace it; delete ${file} and move what it needs into oxlint.config.ts or oxfmt.config.ts`,
    );
  return found;
}
