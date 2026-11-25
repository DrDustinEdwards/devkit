#!/usr/bin/env node
// The no-bloat ratchet: Knip (unused files, exports, dependencies), jscpd (duplicated blocks, and blocks copied from the
// shared packages the repository installs), Chrome's legacy scanner, and a static count of test files and cases, each
// compared with the repository's own baseline in .no-bloat.json. The baseline is the count exactly: above it fails, and so
// does below it until the same change lowers it, so the room a removal leaves never lets a new copy in. Against the branch
// the change goes into, a change may not raise a count, change how one is measured, or turn the job off; a change of
// measure comes alone. A real exception carries a reason in words. Every rule, with its reasons, is README "The shared
// checks"; a tool that cannot run fails the run, and the table goes to the job summary.
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
// `"jscpd": false`, `"shared": false`, `"legacy": false`, `"tests": false`, `"size": false` or `"comments": false` turns one off.
// `legacy` is Chrome's Modern Web Guidance scanner, counted per guide; a match kept on purpose carries
// `legacy-scan:keep <guide> <reason>` on its line or the line above. Test cases are counted from the source, never by running
// a runner: each `test(` or `it(` call outside comments and strings.

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
    // A report never stops a copy from merging. The ratchet always gates.
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
