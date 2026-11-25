#!/usr/bin/env node
// The shared-code check: what keeps a repository in step with the shared packages. It fails (exit 1, an ::error:: line each) on
//
//   pins       a dependency on one of the shared packages, or a call to devkit's reusable workflows, on a raw commit
//              rather than a release tag (a pin behind the newest release is a warning: Renovate opens that bump, and
//              failing on it turned every repository red each time a package released), and a site-runtime pin behind
//              the newest minor released FRESH_DAYS ago or more (its header registry is what the live check grades, so
//              a site that drifts further builds one set of headers and is graded against another), and a devkit pin
//              behind a minor out two days (its no-bloat check runs from the caller's pin, so an old pin is an old check);
//   copies     a local definition with the name of something a shared package exports (or a known alias), or text only a
//              shared builder should write (a robots.txt "User-agent:", a sitemap "<urlset", an IndexNow POST, speculation
//              rules, a Cloudflare Images resize, an island loader, JSON-LD, a hex or base64url encoder, a pre-paint theme
//              script...), in source or in a static _headers file (a security header set), and a repository's own copy
//              of a Claude Code hook devkit ships (.claude/hooks/no-em-dash.sh, scoped-git-add.sh);
//   libraries  a direct dependency on a library a shared package wraps (marked, remark, mermaid, sanitize-html...);
//   features   a shared feature the repository's kind of app should have and does not import (robots.txt, security.txt,
//              IndexNow, the CSP report endpoint, /health...), and as warnings an accessibility test, noindex on admin and
//              login routes, and a feed's alternate link;
//   tokens     a site setting its own value for one of Capsomer's tokens (--page-max, --measure, --radius-m, --accent...),
//              or loading its own files for the network's faces (Schibsted Grotesk, Martian Mono) instead of
//              capsomer/fonts.css: a value the network shares is set once, in Capsomer, never per site;
//   spelling   British spelling, read by codespell's en-GB to en-US list (American English everywhere);
//   workflows  a devkit workflow the repository's kinds need and no workflow calls: checks,
//              workflow-audit and dependencies everywhere, worker-size and worker-deploy for an app with a wrangler
//              config, no-bloat in a public repository with JavaScript or TypeScript, bump-consumers in a shared package,
//              conformance where an MCP server is (a source file importing site-runtime ./mcp-server or ./mcp-login),
//              scorecard in a public repository, and devkit-css-vars (pr.yml's css-vars, with a .css-vars.json)
//              in a repository with stylesheets;
//   fakes      a test fake of its own where devkit has one: a GitHub API fake, an Access key pair and key set, a fetch
//              that refuses every URL, a list of DELETE FROMs (./github, ./access, ./network, ./d1);
//   ai         a model call or AI prompt that skips the shared pieces (area 11): Anthropic called outside site-runtime
//              ./anthropic (C1, G1), a Workers AI run with no timeout, gateway or max_tokens (C2, G1, C5), an AI Search
//              call or reranker with no timeout (C2, C13), JSON cut out of a model's free text (C6), a prompt's own dash
//              rule instead of WRITING_RULES (W5), a routine fired outside fireOnce (R2); and in pins, an MCP server's
//              site-runtime more than one minor behind the newest release (S7);
//   jobs       an MCP server tool for an agent job another owner holds (JOBS: backups and site checks are Capsid
//              Admin's, media, writing and webmentions Carrel's), found by the tool's name, title and the operator call
//              or API path it makes, so a renamed copy is found too;
//   lint       a repository with JavaScript or TypeScript off the shared Oxlint config: no root oxlint.config.ts that
//              extends @dustinedwards/devkit/oxlint, a linter config of its own (eslint.config.*, .eslintrc*, biome.json,
//              .oxlintrc.json), a root `lint` script other than LINT_SCRIPT, or no workflow running `npm run lint`
//              and the same for the shared Oxfmt config (a root oxfmt.config.ts with @dustinedwards/devkit/oxfmt, no
//              Prettier config, the `format:check` script FORMAT_CHECK_SCRIPT, a workflow running `npm run format:check`);
//   config     .shared.json itself: an unknown key or kind stops the check (exit 2), and an exception that excused
//              nothing in this run is a warning.
//
//   npx devkit-shared                    the check, against .shared.json (no file: one site at the root)
//   npx devkit-shared --fix-spelling     rewrite the British spellings in place, then run the check
//   npx devkit-shared list               the generated list of every shared package's exports and every shared feature
//   --base <sha>                         a pull request: check the base as well, and a failure it already has is a warning
//   --from <dir>                         read the packages from checkouts named by repository (dir/prelum, dir/site-runtime...)
//                                        instead of node_modules; a checkout missing there stops the check (exit 2)
//
// Without --from a package not in node_modules is named in a warning: copies of its exports (and, for Capsomer, its
// tokens) are not checked, and no exception is judged stale, since what it would excuse was not looked for.
//
// The config, every field optional:
//
//   {
//     "apps": { ".": "site", "mcp": "worker" },          kind per directory: site, static, private, worker or package
//     "waive": { "indexnow": "why", "mcp:health": "why", "workflow:worker-deploy": "why" },
//                                                         a feature or devkit workflow this repository does not need, and why
//     "copies": { "app/lib/og.ts": "why" },               a file allowed to hold a copy (or a test, a fake), and why;
//                                                         "mcp/src/tools.ts#site_backup_media" excuses one tool's job
//     "libraries": { "katex": "why" },                    a direct dependency allowed, and why
//     "tokens": { "--measure": "why", "fonts": "why" },   a Capsomer token this repository sets itself (or "fonts", its own
//                                                         files for the network's faces), and why
//     "spelling": { "ignore": ["word"], "contracts": ["regex"], "skip": ["frame/**"] }
//                                                         words never checked; text a regex matches (a stored value, a
//                                                         column) left as it is, while the same word in prose is fixed;
//                                                         paths not checked
//   }
//
// A line ending in a codespell:ignore comment is a contract the spelling check leaves.
//
// Warnings (::warning::, exit 0) are also how a new rule arrives: a rule's `failsFrom` names the devkit release it fails
// from, compared with this devkit's own package.json version, so it warns for one release while the sites move and the
// release itself flips it. A few feature heuristics (an accessibility test, noindex on admin routes, a feed's alternate
// link), worker-deploy and a stale exception stay warnings. Each is silenced the same way as a failure: "copies" for a
// file, "waive" for a feature or workflow.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { appendSummary, escapeAnnotation, escapeProperty } from "./annotate.mjs";
import { isMain } from "../node/index.mjs";
import { EXCUSED, gitTree, isWarning } from "./shared/core.mjs";
import { PACKAGES, checkCopies, checkLibraries } from "./shared/copies.mjs";
import { DAY_MS, FRESH, checkPins, lsRemoteTags, releaseDates } from "./shared/pins.mjs";
import { capsomerTokens, checkFakes, checkTokens } from "./shared/tokens.mjs";
import { checkFeatures } from "./shared/features.mjs";
import { checkLint, checkWorkflows } from "./shared/workflows.mjs";
import { checkAi, checkJobs } from "./shared/jobs.mjs";
import { checkSpelling } from "./shared/spelling.mjs";
import { listMarkdown, peersOf, readCatalog } from "./shared/catalog.mjs";

/** @typedef {import("./shared/core.mjs").Config} Config */
/** @typedef {import("./shared/core.mjs").Finding} Finding */

export const KINDS = ["site", "static", "private", "worker", "package"];

const CONFIG_KEYS = {
  apps: 0,
  waive: 0,
  copies: 0,
  libraries: 0,
  tokens: 0,
  spelling: ["ignore", "contracts", "skip"],
};

/** Refuses a .shared.json the check would misread: an unknown key (a typo'd "wave" waives nothing) or kind. */
export function validateConfig(/** @type {Record<string, any>} */ config) {
  const bad = (/** @type {string} */ what, /** @type {string[]} */ valid) => {
    throw new Error(`.shared.json: ${what}; the valid ones are ${valid.join(", ")}`);
  };
  for (const key of Object.keys(config))
    if (!(key in CONFIG_KEYS)) bad(`"${key}" is no key`, Object.keys(CONFIG_KEYS));
  for (const key of Object.keys(config.spelling ?? {}))
    if (!CONFIG_KEYS.spelling.includes(key))
      bad(`"spelling" has no "${key}"`, CONFIG_KEYS.spelling);
  for (const [dir, kind] of Object.entries(config.apps ?? {}))
    if (!KINDS.includes(kind)) bad(`"apps" "${dir}" is "${kind}", which is no kind`, KINDS);
}

/** Each exception in .shared.json that excused nothing in this run: dead config, or a rule that moved past it. */
export function staleExceptions(/** @type {Config} */ config) {
  const seen = EXCUSED.get(config) ?? new Set();
  /** @type {[string, string][]} */
  const all = [
    ...["copies", "waive", "libraries", "tokens"].flatMap((s) =>
      Object.keys(/** @type {Record<string, any>} */ (config)[s] ?? {}).map(
        (k) => /** @type {[string, string]} */ ([s, k]),
      ),
    ),
    ...(config.spelling?.ignore ?? []).map(
      (k) => /** @type {[string, string]} */ (["spelling.ignore", k]),
    ),
    ...(config.spelling?.contracts ?? []).map(
      (k) => /** @type {[string, string]} */ (["spelling.contracts", k]),
    ),
  ];
  return all
    .filter(([s, k]) => !seen.has(`${s}\0${k}`))
    .map(([s, k]) => ({
      check: "config",
      file: ".shared.json",
      warn: true,
      message: `${s
        .split(".")
        .map((p) => `"${p}"`)
        .join(" ")} "${k}" excuses nothing in this run: remove it`,
    }));
}

/**
 * Every finding for the checkout at `root`, with packages read through `locate`. The base of a pull request is checked by
 * the same code, so the two runs differ only in the tree.
 * @param {string} root @param {(name: string, repo: string) => string | null} locate @param {boolean} from @param {boolean} fix
 * @returns {Promise<Finding[]>}
 */
async function findingsAt(root, locate, from, fix) {
  const configFile = existsSync(join(root, ".shared.json")) ? ".shared.json" : null;
  /** @type {Config} */
  const config = configFile ? JSON.parse(readFileSync(join(root, configFile), "utf8")) : {};
  validateConfig(config);
  const tree = gitTree(root);
  // A shared package defines its own exports; it is checked against the others, as a package, not a site.
  const name = existsSync(join(root, "package.json"))
    ? (() => {
        try {
          return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name;
        } catch {
          return undefined; // checkLibraries says it is not valid JSON
        }
      })()
    : undefined;
  const self = PACKAGES.find((p) => p.name === name);
  if (self) config.apps ??= { ".": "package" };
  // A package the check cannot read is a check that did not run: in CI (--from) that stops it, locally it is said.
  const missing = PACKAGES.filter((p) => p.repo !== self?.repo && !locate(p.name, p.repo)).map(
    (p) => p.repo,
  );
  if (from && missing.length) throw new Error(`--from has no checkout of ${missing.join(", ")}`);
  const { catalog } = readCatalog((name, repo) =>
    repo === self?.repo ? null : locate(name, repo),
  );
  // A name the package exports itself is its own API, even when another package exports a different thing by that name.
  if (self)
    for (const name of Object.keys(
      readCatalog((_, repo) => (repo === self.repo ? root : null)).catalog,
    ))
      delete catalog[name];
  // Whether the repository is private, from the event Actions hands every run; unknown locally.
  const event =
    process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH)
      ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
      : {};
  /** @type {Record<string, Record<string, string> | Error>} */
  const dates = {};
  for (const [repo, days] of Object.entries(FRESH)) {
    if (
      repo === self?.repo ||
      !tree.files.some(
        (f) =>
          posix.basename(f) === "package.json" && tree.read(f).includes(`DrDustinEdwards/${repo}#`),
      )
    )
      continue;
    dates[repo] = await releaseDates(repo, Date.now() - days * DAY_MS).catch((error) =>
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  const findings = [
    ...checkPins(tree, lsRemoteTags, dates),
    ...checkCopies(tree, catalog, config, self?.label),
    ...checkLibraries(tree, config, peersOf(locate)),
    ...checkFeatures(tree, config),
    ...(self?.repo === "capsomer"
      ? []
      : checkTokens(tree, capsomerTokens(locate("capsomer", "capsomer")), config)),
    ...checkSpelling(root, config, fix, !self),
    ...checkWorkflows(tree, config, { self: self?.repo, private: event.repository?.private }),
    ...checkFakes(tree, config, self?.label),
    ...checkAi(tree, config, self?.label),
    ...checkJobs(tree, config, name),
    ...checkLint(tree, config, self?.repo),
  ];
  if (missing.length) {
    const tokens =
      missing.includes("capsomer") && self?.repo !== "capsomer" ? " and Capsomer's tokens" : "";
    findings.push({
      check: "config",
      warn: true,
      message: `not installed here: ${missing.join(", ")}, so copies of their exports${tokens} were not checked and no exception was judged stale; npm install, or --from <dir> of checkouts (CI reads them all)`,
    });
  } else {
    findings.push(...staleExceptions(config));
  }
  return findings;
}

/** What makes two findings the same one, on two trees: a line number moves with any edit above it. @param {Finding} f */
const findingKey = (f) => `${f.check}\u0000${f.file ?? ""}\u0000${f.message}`;

/**
 * A pull request's findings, judged against its base: a failure the base already has is the repository's state, not the
 * change's, so it is a warning here and the daily run on the default branch reports it (README, "The shared checks").
 * @param {Finding[]} head @param {Finding[]} base @returns {Finding[]}
 */
export function againstBase(head, base) {
  const before = new Set(base.filter((f) => !isWarning(f)).map(findingKey));
  return head.map((f) =>
    !isWarning(f) && before.has(findingKey(f))
      ? { ...f, warn: true, message: `${f.message} (already on the base branch)` }
      : f,
  );
}

async function main(/** @type {string[]} */ argv) {
  const root = process.cwd();
  const from = argv.includes("--from") ? argv[argv.indexOf("--from") + 1] : null;
  const base = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : null;
  // Installed packages by default; --from reads checkouts named by repository, for a tree with nothing installed.
  const locate = (/** @type {string} */ name, /** @type {string} */ repo) => {
    const dir = from ? join(from, repo) : join(root, "node_modules", name);
    return existsSync(join(dir, "package.json")) ? dir : null;
  };
  if (argv[0] === "list") {
    process.stdout.write(listMarkdown(readCatalog(locate).packages));
    return 0;
  }
  let findings = await findingsAt(root, locate, !!from, argv.includes("--fix-spelling"));
  if (base) {
    // The base as its own checkout, read by the same packages, so only the change differs.
    const dir = mkdtempSync(join(tmpdir(), "devkit-shared-base-"));
    execFileSync("git", ["worktree", "add", "--detach", "--quiet", dir, base], { cwd: root });
    try {
      findings = againstBase(findings, await findingsAt(dir, locate, !!from, false));
    } finally {
      execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: root });
    }
  }
  const errors = findings.filter((f) => !isWarning(f));
  for (const f of findings) {
    const where = f.file
      ? ` file=${escapeProperty(f.file)}${f.line ? `,line=${Number(f.line)}` : ""}`
      : "";
    console.log(
      `::${isWarning(f) ? "warning" : "error"}${where}::${escapeAnnotation(`[${f.check}] ${f.message}`)}`,
    );
  }
  const counts = [
    "pins",
    "copies",
    "libraries",
    "features",
    "tokens",
    "spelling",
    "workflows",
    "fakes",
    "ai",
    "lint",
    "jobs",
    "config",
  ]
    .map((c) => `${c} ${findings.filter((f) => f.check === c).length}`)
    .join(", ");
  console.log(
    errors.length
      ? `devkit-shared: ${errors.length} to fix (${counts}). What the packages export: npx devkit-shared list`
      : `devkit-shared: uses the shared code (${counts}).`,
  );
  appendSummary(`### Shared-code check\n\n${counts}`);
  return errors.length ? 1 : 0;
}

/** The command line: main's exit code, or 2 when the check could not run. */
export async function cli(/** @type {string[]} */ argv) {
  try {
    return await main(argv);
  } catch (error) {
    console.log(
      `::error::${escapeAnnotation(`devkit-shared could not run: ${error instanceof Error ? error.message : String(error)}`)}`,
    );
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await cli(process.argv.slice(2));
