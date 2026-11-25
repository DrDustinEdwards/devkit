import { SOURCE, NOT_SOURCE, readManifest, excused } from "./config.mjs";
/** @import { Finding, Tree, Config } from "./config.mjs" */

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
