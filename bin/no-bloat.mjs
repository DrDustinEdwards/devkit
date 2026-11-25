#!/usr/bin/env node
// The no-bloat ratchet. Knip for unused files, exports and dependencies, jscpd for duplicated blocks, jscpd again for the
// blocks copied from the shared packages the repository installs ("shared copies", copies.mjs packageCopies, so a copy
// under a new name is caught too), Chrome's legacy scanner for old web platform patterns ("legacy", Modern Web
// Guidance), and a static count of test files and test cases, each compared with the repository's
// own baseline. The baseline is the count exactly: one above it fails the run (exit 1, an ::error:: line per count), and so
// does one below it, until the baseline is lowered in the same change, so the room a removal leaves can never let a new
// copy back in (the ratchet of ESLint's bulk suppressions and Betterer's ci mode). Knip counts each issue (its JSON
// report), not each file. Every count the run measures needs its baseline entry, and no change drops one. Against the
// branch the change goes into (`--lines-from` on a pull request; otherwise the first of origin/HEAD, origin/main and
// origin/master) a change that moves code may not raise a Knip, jscpd or shared-copies count (one new to the baseline
// is raised from 0), change how a count is measured (the no-bloat config outside baseline and tools, a Knip config in
// any format, .jscpd.json, package.json's knip or jscpd), change a workflow that runs this check (moving only its devkit
// pins is a bump, not a change), or move a shared package back; `--write-baseline` refuses what the check would. A change
// of measure comes alone and may not lower a count, so a narrower measure cannot hide what it stops reading; a version
// bump alone (tools, a lockfile, dependency versions forward, a new shared package) may raise or lower. What would hide
// the next change's code is refused even when it hides nothing yet: every new line of a Knip config needs its own reason,
// a narrower jscpd measure fails, jscpd's `unread` counts the source files it skips, a tracked file a
// .gitignore hides from Knip fails, a new file jscpd skips fails, and the tools must be npm's at x.y.z and devkit a
// DrDustinEdwards/devkit tag. No change may drop or turn off the job that runs the check, or change the inputs that
// decide what runs before it (workflowInputs, which reads the workflow with a YAML parser); install scripts, patches and
// a Knip plugin's config files are a change of measure, except a config in code Knip counts no less from at the base and
// now (settledConfigs: its inputs in `knip --debug`, less pages the build writes and the scripts its pages load). In Actions the check counts the commit the run is for
// (checkoutProblems). A real
// exception goes in knip.jsonc with a comment saying why, behind `jscpd:ignore-start` and its reason, or after `@public`,
// `@beta` or `@alias` with who uses it; one added with no reason in words (isReason) fails, and so does any entry added
// to .jscpd.json or the config's jscpd --ignore, which are strict JSON and cannot hold one. Adding a test is a raise:
// `--write-baseline` in the same change, so the diff shows it. `--verify-install <dir>`, run from the workflow's own
// devkit, fails unless the installed devkit is a release no older than it, file for file. The share of source lines that
// are comments is recorded too, and a rise of more than `tolerance` points (with more comment lines than the baseline) is
// a warning, or an error with `"fail": true`. A file over `size` lines (500 source, 800 test; generated files are left out
// as for comments) is listed in the baseline with its line count: a new one over the cap fails, a listed one may not grow,
// and one cut or dropped lowers its entry (`size` sets the caps). A tool that cannot run
// fails the run too (an ::error:: naming its error): a count nobody measured is not a pass, and neither is a baseline entry
// no run measures. The table goes to the job summary.
//
//   npx devkit-no-bloat                      check against .no-bloat.json (no file: one knip run, jscpd on its own config)
//   npx devkit-no-bloat --config <file>      another config
//   npx devkit-no-bloat --write-baseline     measure and record the counts as the config's baseline
//   npx devkit-no-bloat --lines-from <rev>   a pull request against <rev>: the base for the raise check (above), and report the
//                                            lines added and removed since the merge base, as code, tests, comments, docs
//                                            and other (pr.yml and no-bloat.yml pass it on a pull request)
//
// The config, every field optional (globs match paths from the repository root, as git lists them):
//
//   {
//     "knip": [{ "label": "knip (Worker)" }, { "label": "knip (dashboard)", "args": ["--directory", "dashboard"] }],
//     "jscpd": { "args": ["app", "workers", "--min-lines", "8"] },
//     "tests": { "files": ["**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"], "ignore": [] },
//     "comments": { "files": ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}"], "ignore": ["**/*.min.*", "**/worker-configuration.d.ts"],
//                   "tolerance": 1, "fail": false },
//     "tools": { "knip": "knip@6.45.1", "jscpd": "jscpd@4.3.0", "modern-web-guidance": "modern-web-guidance@1.0.0" },
//     "baseline": { "measured_at": "036d615", "knip (Worker)": { "Unused exports": 12 }, "jscpd": { "clones": 23, "lines": 410,
//       "percentage": 0.59 }, "shared copies": { "clones": 0, "lines": 0 }, "legacy": { "dark-mode": 1 }, "tests": { "files": 40, "cases": 312 },
//       "comments": { "lines": 900, "code": 9100, "percentage": 9 } }
//   }
//
// `"jscpd": false`, `"shared": false`, `"legacy": false`, `"tests": false`, `"size": false` or `"comments": false` turns one off. `legacy`
// is Chrome's Modern Web Guidance scanner (`modern-web-guidance legacy-scan`, github.com/GoogleChrome/modern-web-guidance):
// a static match of about 35 legacy patterns (a dialog built by hand, `100vh`, Enter that ignores an IME, `resize:
// none`...), counted per guide, over the repository root unless `legacy.args` names the paths; it skips docs, examples and
// tests itself. A match is a lead, not a verdict: the guide (`npx modern-web-guidance retrieve <guide>`) says when one may
// stay. One kept on purpose carries `legacy-scan:keep <guide> <reason>` on its line or the line above, and is not
// counted when the guide it names is the match's; a marker added with no guide or no reason fails, as a jscpd marker does. jscpd's clones and duplicated
// lines are gated; its percentage is shown, not gated, since deleting code that is not duplicated raises it. The shared
// copies read every shared package (shared.mjs PACKAGES) installed in node_modules, the repository's own excepted; each copy
// is an ::warning:: line with both places. Test cases are counted from the source, never by running a runner: each `test(`
// or `it(` call (node:test, vitest, Playwright), with their modifiers (`.only`, `.skip`, `.each(...)`...), outside comments
// and strings; `describe`, hooks and Playwright's runtime `test.skip(condition)` are not cases. A case made in a loop counts
// once.
//
// knip and jscpd are npm's, at the exact versions in `tools`, installed by the check itself (checkTools), never the

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendSummary, escapeAnnotation, shortHead } from "./annotate.mjs";
import { readConfig } from "./site-config.mjs";
import { isMain } from "../node/index.mjs";
import { DEFAULT_TOOLS } from "./no-bloat/scan.mjs";

/** @typedef {import("./no-bloat/scan.mjs").Config} Config */
import { measure, narrowed } from "./no-bloat/count.mjs";
import { compare, gitLines, gitSource, render } from "./no-bloat/compare.mjs";
import {
  checkTools,
  checkoutProblems,
  hardenGit,
  installedPackages,
  messageOf,
} from "./no-bloat/tools.mjs";
import {
  atBase,
  baseRef,
  devkitBlobs,
  hiddenFiles,
  installedRelease,
  lockfileProblems,
  unreadAdded,
} from "./no-bloat/base.mjs";
import { classify, raised } from "./no-bloat/classify.mjs";
import { workflowInputs } from "./no-bloat/workflow.mjs";
import {
  CODE_CONFIG,
  knipCounted,
  knipPluginFiles,
  settledConfigs,
} from "./no-bloat/knip-config.mjs";
import { unreasoned } from "./no-bloat/reasons.mjs";

function main() {
  const argv = process.argv.slice(2);
  const root = process.cwd();
  if (process.env.GITHUB_ACTIONS === "true") hardenGit(process.env);
  if (argv[0] === "--verify-install") {
    // Run from the workflow's own devkit, never the installed one it judges.
    const problems = installedRelease(
      argv[1],
      fileURLToPath(new URL("..", import.meta.url)),
      devkitBlobs,
    );
    for (const p of problems) console.log(`::error::${escapeAnnotation(p)}`);
    process.exit(problems.length ? 1 : 0);
  }
  if (argv[0] === "--inputs-from") {
    // pr.yml, when the check does not run on a pull request: did the change turn it off? Run from the workflow's devkit.
    const [rev, path] = argv.slice(1);
    let was = "";
    try {
      was = execFileSync("git", ["show", `${rev}:${path}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // A workflow new in the change: the base ran no check from it.
    }
    // The file as committed, not as the install and the prepare step may have left it on disk.
    let now = "";
    try {
      now = execFileSync("git", ["show", `${process.env.GITHUB_SHA || "HEAD"}:${path}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // Dropped in the change: every caller job the base had is gone.
    }
    const problems = [
      ...checkoutProblems(root),
      ...workflowInputs(path, was, now, checkTools(root, {}).parseYaml),
    ];
    for (const p of problems) console.log(`::error::${escapeAnnotation(p)}`);
    if (!problems.length) console.log(`${path} runs the check as its base ${rev.slice(0, 7)} did.`);
    process.exit(problems.length ? 1 : 0);
  }
  const write = argv.includes("--write-baseline");
  if (argv.includes("--warn-only")) {
    // A report never stops a copy from merging (Enarratio, germomics and txasm ran it so). The ratchet always gates.
    console.error(
      "devkit-no-bloat: --warn-only was removed in 0.37.0; the ratchet always gates. Drop the flag (and any continue-on-error on its step).",
    );
    process.exit(2);
  }
  const from = argv.includes("--lines-from") ? argv[argv.indexOf("--lines-from") + 1] : undefined;

  // A broken config would otherwise be no baseline, and so a ratchet that passes everything.
  const { config, path: file } = /** @type {{ config: Config, path: string }} */ (
    readConfig(argv, ".no-bloat.json", "devkit-no-bloat", { optional: true })
  );

  // Before anything reads the checkout: what an install script or the prepare step changed would be counted instead.
  const checkout = checkoutProblems(root);
  const tools = checkTools(root, { ...DEFAULT_TOOLS, ...config.tools });
  const measured = measure(
    config,
    tools.run,
    existsSync(join(root, ".jscpd.json")),
    gitSource(root),
    installedPackages(root),
  );

  // A raised baseline or an exception with no reason, against the branch the change goes into: on a pull request
  // (--lines-from) and in every local run, so neither the check nor --write-baseline can accept one quietly.
  /** @type {string[]} */
  const refused = [...checkout, ...lockfileProblems(gitSource(root).list())];
  let ref = from;
  try {
    ref = baseRef(root, from) ?? undefined;
    if (ref) {
      const base = atBase(root, file, ref, config);
      const files = [...new Set([...gitSource(root).list(), ...base.changed])];
      // The code the Knip config counts both at the base and now, so a change cannot exempt a file by adding it.
      const [countedBefore, countedNow] = [knipCounted(base.before), knipCounted(base.now)];
      const patterns = tools.knipConfigs();
      const read = (/** @type {string} */ p) => base.now(p) ?? base.before(p) ?? "";
      const counted = countedNow.filter((g) => countedBefore.includes(g));
      let plugins = knipPluginFiles(files, patterns, read, counted);
      // A config in code that moved, alone or through what it imports, is judged by the inputs Knip takes from it, not its body.
      if (plugins.some((p) => base.changed.includes(p))) {
        const roots = plugins.filter(
          (p) => CODE_CONFIG.test(p) && knipPluginFiles([p], patterns, () => "").length,
        );
        const settled = settledConfigs(
          root,
          base.base,
          roots,
          files,
          (args, cwd) => tools.run("knip", args, cwd),
          (config.knip ?? [{ label: "knip" }]).map((r) => r.args ?? []),
        );
        if (settled.length) plugins = knipPluginFiles(files, patterns, read, counted, settled);
      }
      const next = write ? { ...config, baseline: { ...measured.counts } } : config;
      refused.push(
        ...raised(next, base.config, classify({ ...base, plugins }, tools.parseYaml)),
        ...unreasoned(base, config, base.config),
        ...narrowed(base, config, base.config),
        ...hiddenFiles(base.ignored, base.changed, base.before),
        ...unreadAdded(measured.unread, base.created),
      );
    }
  } catch (error) {
    refused.push(`The baseline at ${ref ?? "the base"} could not be read: ${messageOf(error)}`);
  }

  if (write) {
    if (refused.length) {
      for (const r of refused) console.error(`devkit-no-bloat: ${r}`);
      console.error("devkit-no-bloat: the baseline was not written.");
      process.exit(1);
    }
    if (measured.warnings.length) {
      for (const w of measured.warnings) console.error(`devkit-no-bloat: ${w}`);
      console.error("devkit-no-bloat: the baseline was not written, because a tool could not run.");
      process.exit(1);
    }
    config.baseline = { measured_at: shortHead(root), ...measured.counts };
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`devkit-no-bloat: wrote the baseline to ${file}`);
    return;
  }

  const { rows, errors, warnings, lowered, stale } = compare(
    config.baseline ?? {},
    measured.counts,
    config,
  );
  if (errors.length) {
    errors.push(
      "Remove what was added: change the code that already does it, or import the shared one, and delete the copy (SHARED.md). A real exception goes in knip.json's ignore list with a comment saying why, or behind `jscpd:ignore-start` and its reason in the source.",
    );
  }
  // The room a removal leaves is where the next copy would go: a count below its baseline fails until it is lowered.
  if (lowered.length)
    errors.push(
      `Lower the baseline to lock this in (${lowered.join(", ")}): run \`npx devkit-no-bloat --write-baseline\` and commit the config in this change.`,
    );
  errors.push(...refused);
  errors.unshift(...measured.warnings, ...stale);
  // No baseline is a ratchet that passes everything: a missing config, or one whose baseline counts nothing, fails.
  const counted = Object.keys(config.baseline ?? {}).filter((key) => key !== "measured_at");
  if (!counted.length)
    errors.unshift(
      `${existsSync(file) ? `${file} has no baseline` : `${file} does not exist`}, so every count would pass. Run \`npx devkit-no-bloat --write-baseline\` and commit the config.`,
    );
  let table = render(rows, [...errors, ...warnings], config.baseline?.measured_at);
  if (from) {
    try {
      table += `\n\n${gitLines(root, config, from)}`;
    } catch (error) {
      warnings.push(
        `The lines added and removed since ${from} could not be read: ${messageOf(error)}`,
      );
    }
  }
  console.log(table);
  for (const [mine, theirs] of measured.copies)
    console.log(
      `::warning file=${escapeAnnotation(mine.path)},line=${mine.start}::${escapeAnnotation(`lines ${mine.start}-${mine.end} copy ${theirs.repo}'s ${theirs.path}:${theirs.start}-${theirs.end}: import it from the package and delete this copy`)}`,
    );
  for (const e of errors) console.log(`::error::${escapeAnnotation(e)}`);
  for (const w of warnings) console.log(`::warning::${escapeAnnotation(w)}`);
  appendSummary(table);
  if (errors.length) process.exit(1);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (isMain(import.meta.url)) main();
