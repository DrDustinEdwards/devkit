import { posix } from "node:path";
import { PACKAGES } from "../shared/copies.mjs";
import { LOCKFILES, TOOL_KEYS, compareVersions } from "./base.mjs";
import { addedEntries, onlyDropsEntries } from "./knip-config.mjs";
import { DEFAULT_TOOLS } from "./scan.mjs";
import { workflowInputs } from "./workflow.mjs";

/** @typedef {import("./scan.mjs").Config} Config */

/** A Knip config whose comments can hold a reason (Knip reads them as JSONC), and one in code, which can compute what it skips. */
export const KNIP_DATA = /^\.?knip(?:\.config)?\.jsonc?$/;

/** Every file that says how Knip or jscpd counts, in any format Knip reads (knip.dev, "Configuration"). */
const DEFINITIONS =
  /^(?:\.?knip(?:\.config)?\.(?:json|jsonc|js|cjs|mjs|ts|cts|mts)|\.jscpd\.json)$/;

/**
 * Files that change what the install puts in node_modules or runs while it does: npm's and pnpm's settings, pnpm's hook
 * file, its workspace settings and the patches it applies. A change to one is a change of measure, so it comes alone.
 */
const INSTALL_FILES = /^(?:\.npmrc|\.pnpmfile\.c?js|\.pnpmfile\.mjs|pnpm-workspace\.yaml)$/;

/** The package.json scripts an install runs (npm's and pnpm's lifecycle), and so the code that runs before this check. */
const INSTALL_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
  "dependencies",
];

/** A use of a devkit workflow or action at a commit, with the `# vX.Y.Z` note Renovate keeps beside it. */
const DEVKIT_USES =
  /(DrDustinEdwards\/devkit\/\.github\/(?:workflows|actions)\/[\w./-]+)@[0-9a-f]{40}(?:[ \t]*#[^\n]*)?/gi;

/**
 * A workflow that runs this check: a job that calls devkit's pr.yml or no-bloat.yml (or its own, in devkit), or a step
 * that runs the bin. A workflow that only names them (devkit's own pr.yml, in a comment) is not one.
 */
const RUNS_CHECK =
  /uses:\s*["']?(?:DrDustinEdwards\/devkit\/|\.\/)\.github\/workflows\/(?:pr|no-bloat)\.yml|devkit-no-bloat|@dustinedwards\/devkit\/bin\/no-bloat\.mjs/i;

const DEVKIT = "@dustinedwards/devkit";

/** How devkit is installed: from its own repository at a release tag, so the check that runs is one that was released. */
const DEVKIT_PIN =
  /^(?:github:|git\+https:\/\/github\.com\/|git\+ssh:\/\/git@github\.com\/)DrDustinEdwards\/devkit(?:\.git)?#v\d+\.\d+\.\d+$/i;

/** package.json keys that can swap what an installed package is. */
const OVERRIDE_KEYS = ["overrides", "resolutions", "pnpm"];

/** A dependency pin's version: `1.2.3`, `^1.2.3`, or a git pin's `#v1.2.3`; null when it names none. */
function pinVersion(/** @type {unknown} */ pin) {
  const m =
    typeof pin === "string" ? /(\d+)\.(\d+)\.(\d+)/.exec(pin.split("#").at(-1) ?? "") : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * What a change does to the counts, from the files it touches. `code`: it changes something the counts read (anything
 * but the config's `baseline` and `tools`, a lockfile, a definition, and in package.json dependency versions moved
 * forward or a new shared package). `definition`: what it changes in how Knip or jscpd counts (their config files in any
 * format, a Knip config a run names with --config, a Knip plugin's config and what it imports (`plugins`,
 * knipPluginFiles), package.json's `knip` or `jscpd`, the no-bloat config; a Knip config in data that only drops entries
 * is code, onlyDropsEntries; a workflow is never code). `back`: the shared packages it moves to an older release.
 * `entries`: per Knip config in data whose only change adds `entry` globs, the globs it adds (addedEntries). `refused`: what no change may do to the tools that measure: a `tools` entry that is not `<tool>@x.y.z` or is older than
 * the base's, and a devkit dependency that is not a DrDustinEdwards/devkit release tag or is overridden. Pure.
 * @param {{ changed: string[], configPath: string, definitions?: string[], plugins?: string[], before: (path: string) => string | null, now: (path: string) => string | null }} change
 * @param {(text: string) => unknown} [parseYaml] for the workflows (checkTools)
 */
export function classify(change, parseYaml = noYaml) {
  const { changed, configPath } = change;
  /** @type {string[]} */
  const definition = [];
  /** @type {string[]} */
  const back = [];
  let code = false;
  /** @type {string[]} */
  const workflow = [];
  /** @type {string[]} */
  const refused = [];
  /** @type {string[]} */
  const removed = [];
  /** @type {Record<string, string[]>} */
  const entries = {};
  const json = (/** @type {string | null} */ text) => {
    try {
      return text === null ? null : JSON.parse(text);
    } catch {
      return null;
    }
  };
  const without = (/** @type {any} */ o, /** @type {string[]} */ keys) =>
    JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k))));
  // What an install runs or patches, apart from the rest of the manifest.
  const hooks = (/** @type {any} */ m) =>
    JSON.stringify([
      INSTALL_SCRIPTS.map((k) => m?.scripts?.[k] ?? null),
      m?.pnpm?.patchedDependencies ?? null,
    ]);
  const rest = (/** @type {any} */ m) => ({
    ...m,
    scripts: Object.fromEntries(
      Object.entries(m?.scripts ?? {}).filter(([k]) => !INSTALL_SCRIPTS.includes(k)),
    ),
    pnpm: m?.pnpm && without(m.pnpm, ["patchedDependencies"]),
  });
  for (const p of changed) {
    // A workspace has a manifest and a lockfile per package, so each is read by its name in any directory.
    const name = posix.basename(p);
    if (LOCKFILES.test(name)) continue;
    // A changeset is release metadata, not code and not a change of measure.
    if (/^\.changeset\/(?:[^/]+\.md|config\.json)$/.test(p)) continue;
    // Dropping an entry only makes Knip count more, so it is judged as code: a raise it causes is refused.
    if (KNIP_DATA.test(name) && onlyDropsEntries(change.before(p), change.now(p))) {
      code = true;
      continue;
    }
    // Adding entries is a change of measure, and the only one that may lower Knip's unused files: by the files it names.
    if (KNIP_DATA.test(name) && addedEntries(change.before(p), change.now(p)).length)
      entries[p] = addedEntries(change.before(p), change.now(p));
    if (
      DEFINITIONS.test(name) ||
      INSTALL_FILES.test(name) ||
      /(?:^|\/)patches\//.test(p) ||
      change.definitions?.includes(p) ||
      change.plugins?.includes(p)
    ) {
      definition.push(p);
      continue;
    }
    if (p === configPath) {
      const [a, b] = [json(change.before(p)), json(change.now(p))];
      if (without(a, ["baseline", "tools"]) !== without(b, ["baseline", "tools"]))
        definition.push(`${p} (outside baseline and tools)`);
      refused.push(...toolSpecs(a?.tools, b?.tools));
      continue;
    }
    if (name === "package.json") {
      const [a, b] = [json(change.before(p)), json(change.now(p))];
      if (!a || !b) {
        code = true;
        continue;
      }
      for (const key of TOOL_KEYS)
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))
          definition.push(`package.json "${key}"`);
      // An install script or a patch runs before the check, so it changes what is measured, not what is counted.
      if (hooks(a) !== hooks(b)) definition.push(`${p} install scripts or patches`);
      if (
        without(rest(a), [...DEPENDENCY_FIELDS, ...TOOL_KEYS]) !==
        without(rest(b), [...DEPENDENCY_FIELDS, ...TOOL_KEYS])
      )
        code = true;
      // An override swaps the package that is installed under devkit's name, whatever the dependency says.
      for (const key of OVERRIDE_KEYS)
        if (
          JSON.stringify(a[key]) !== JSON.stringify(b[key]) &&
          JSON.stringify(b[key] ?? "").includes(DEVKIT)
        )
          refused.push(
            `${p} "${key}" names ${DEVKIT}, which replaces the devkit whose check runs. Install devkit only through its dependency, at a release tag.`,
          );
      const shared = new Set(PACKAGES.map((x) => x.name));
      for (const field of DEPENDENCY_FIELDS) {
        const [was, is] = [a[field] ?? {}, b[field] ?? {}];
        // The check that runs is the installed devkit's bin: another repository, a path or a range would run another one.
        if (DEVKIT in is && is[DEVKIT] !== was[DEVKIT] && !DEVKIT_PIN.test(is[DEVKIT]))
          refused.push(
            `${p} ${field} has ${DEVKIT} at "${is[DEVKIT]}". Pin devkit to a release tag of its own repository, "github:DrDustinEdwards/devkit#vX.Y.Z", so the check that runs is the one released.`,
          );
        // An added library can be unused. A removed one turns off the Knip plugins its name enabled, so it changes how
        // Knip counts, and it can leave an import unlisted, which Knip's unlisted and unresolved counts read (raised).
        const gone = Object.keys(was).filter((n) => !(n in is));
        if (gone.length) removed.push(`${p} ${field} removes ${gone.join(", ")}`);
        if (!Object.keys(is).every((n) => n in was || shared.has(n))) code = true;
        for (const name of Object.keys(is)) {
          const [x, y] = [pinVersion(was[name]), pinVersion(is[name])];
          if (x && y && (y[0] - x[0] || y[1] - x[1] || y[2] - x[2]) < 0) {
            code = true;
            if (shared.has(name)) back.push(`${name} ${was[name]} to ${is[name]}`);
          }
        }
      }
      continue;
    }
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) {
      // Moving only the devkit pins is the bump Renovate and the rollout open; anything else in a workflow that runs the
      // check (a prepare step, the config input) can change what it measures.
      const [was, is] = [change.before(p) ?? "", change.now(p) ?? ""];
      const pinless = (/** @type {string} */ t) => t.replace(DEVKIT_USES, "$1@<pin>");
      if (pinless(was) !== pinless(is) && RUNS_CHECK.test(`${was}\n${is}`)) workflow.push(p);
      refused.push(...workflowInputs(p, was, is, parseYaml));
      continue;
    }
    code = true;
  }
  // A removed dependency beside a change of measure (the plugin's config it no longer needs) is that change of measure.
  // Beside code, or alone, it is code: removing a library may lower a count, as deleting the code that used it does.
  if (removed.length && !code && definition.length) definition.push(...removed);
  else if (removed.length) {
    code = true;
    removed.length = 0;
  }
  return { code, definition, workflow, back, refused, removed, entries };
}

/** A parser for a change that has no workflow to read. */
const noYaml = () => {
  throw new Error("no YAML parser was given");
};

/**
 * What a change to the config's `tools` may not do: name a tool this check does not run, run one that is not npm's at an
 * exact version (a path, a tag or another package would measure with something else), or move one to an older release.
 * @param {Record<string, string> | undefined} was @param {Record<string, string> | undefined} is
 */
function toolSpecs(was, is) {
  /** @type {string[]} */
  const out = [];
  for (const name of Object.keys(is ?? {}))
    if (!(name in DEFAULT_TOOLS)) out.push(`tools.${name} names no tool this check runs.`);
  for (const [name, fallback] of Object.entries(DEFAULT_TOOLS)) {
    const [old, spec] = [
      was?.[/** @type {"knip"} */ (name)] ?? fallback,
      is?.[/** @type {"knip"} */ (name)] ?? fallback,
    ];
    if (old === spec) continue;
    const exact = new RegExp(`^${name}@(\\d+\\.\\d+\\.\\d+)$`);
    const [o, n] = [exact.exec(old), exact.exec(spec)];
    if (!n)
      out.push(
        `tools.${name} is "${spec}". The check runs ${name} from npm at an exact version, "${name}@x.y.z".`,
      );
    else if (o && compareVersions(n[1], o[1]) < 0)
      out.push(
        `tools.${name} moves from ${old} to ${spec}, an older release. Keep each tool at its version or newer.`,
      );
  }
  return out;
}

/**
 * What the change is refused for, against the config at its base. A change that moves code may not raise a Knip, jscpd
 * or shared-copies count (a count the base lacked is raised from 0), change how a count is measured, change the
 * workflows that run the check, or move a shared package back. A change of measure comes on its own and may raise but not
 * lower or drop a count. Only a version bump alone may lower one, and a change whose only change of measure adds `entry`
 * globs or `ignoreDependencies` names to a Knip config (kind.entries) may lower any Knip count and nothing else. No change
 * drops a count from the baseline. Tests may rise: a new test is how they do. Pure.
 * @param {Config} config @param {Config | null} base the config at the pull request's base
 * @param {ReturnType<typeof classify>} kind
 */
export function raised(config, base, kind) {
  const was = base?.baseline ?? {};
  const now = config.baseline ?? {};
  /** @type {string[]} */
  const out = [];
  const skip = (/** @type {string} */ tool, /** @type {unknown} */ counts) =>
    tool === "measured_at" || !counts || typeof counts !== "object";
  for (const [tool, counts] of Object.entries(was))
    if (!skip(tool, counts) && !(tool in now))
      out.push(
        `${tool}: this change drops its count from the baseline, which turns its gate off. Put the count back; a measure is never switched off.`,
      );
  if (kind.code) {
    for (const [tool, counts] of Object.entries(now)) {
      if (skip(tool, counts) || ["tests", "comments"].includes(tool)) continue;
      // The size list starts as today's files when a baseline first has it; after that a file joining or growing is a raise.
      if (tool === "size" && !(tool in was)) continue;
      const before = /** @type {Record<string, number>} */ (was[tool] ?? {});
      for (const [key, n] of Object.entries(/** @type {Record<string, number>} */ (counts)))
        if (key !== "percentage" && typeof n === "number" && n > (before[key] ?? 0))
          out.push(
            `${tool}: this change raises the baseline's ${key} from ${before[key] ?? 0} to ${n}. A raise lets the new copy or unused code in: remove it instead, and put a real exception in knip.json's ignore list with a comment saying why. Only a change that moves no code (a tool, devkit or shared package bump alone) may raise it.`,
          );
    }
    if (kind.definition.length)
      out.push(
        `this change moves code and also how it is counted (${kind.definition.join(", ")}). Change the measure in a change of its own.`,
      );
    if (kind.workflow.length)
      out.push(
        `this change moves code and also the workflow that runs this check (${kind.workflow.join(", ")}). Change the workflow in a change of its own.`,
      );
  } else if (kind.definition.length || kind.workflow.length) {
    const what = [...kind.definition, ...kind.workflow].join(", ");
    // A removed dependency may not leave an import behind it.
    if (kind.removed?.length) {
      const [before, after] = [was.knip ?? {}, now.knip ?? {}].map(
        (c) => /** @type {Record<string, number>} */ (c),
      );
      for (const key of ["unlisted", "unresolved"])
        if ((after[key] ?? 0) > (before[key] ?? 0))
          out.push(
            `knip: this change removes a dependency (${kind.removed.join("; ")}) and raises ${key} from ${before[key] ?? 0} to ${after[key]}. Remove the import that still needs it, or keep the dependency.`,
          );
    }
    // Entries only add reach: Knip reads each as an entry and follows its imports, so the files, dependencies, exports and
    // types that only they used stop being counted. Every Knip count may fall; nothing else may.
    const entriesOnly =
      kind.entries &&
      Object.keys(kind.entries).length &&
      !kind.workflow.length &&
      kind.definition.every((d) => d in kind.entries);
    for (const [tool, counts] of Object.entries(was)) {
      if (skip(tool, counts) || tool === "comments") continue;
      const after = /** @type {Record<string, number>} */ (now[tool] ?? {});
      const knip = tool === "knip" || tool.startsWith("knip ");
      for (const [key, n] of Object.entries(/** @type {Record<string, number>} */ (counts)))
        if (knip && entriesOnly) continue;
        else if (key !== "percentage" && typeof n === "number" && (after[key] ?? 0) < n)
          out.push(
            `${tool}: this change of how it is counted (${what}) lowers ${key} from ${n} to ${after[key] ?? 0}, so the narrower measure hides what it no longer reads. Measure as much as before; an exception goes in knip.json's ignore list with its reason.`,
          );
    }
  }
  out.push(...(kind.refused ?? []));
  for (const b of kind.back)
    out.push(`this change moves ${b}, an older release. Keep the shared package at its newest.`);
  return out;
}
