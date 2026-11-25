#!/usr/bin/env node
// The cross-repo copy ratchet. devkit-shared's copies check matches by name, so a block copied from one repository into
// another under a new name slips past it; this scan reads the code itself. It shallow-clones every repository of the owner
// it can read (no forks, nothing archived), gathers each one's tracked source (no tests, builds or vendored files, SOURCE
// and SKIP below) into one folder, runs jscpd over all of it at once and counts the copied blocks whose two files sit in
// different repositories. The count is held exactly: above the baseline in live/copies.json it fails (exit 1), and so does
// a count below it, until the baseline is lowered so the gain is kept.
//
//   devkit-copies [--config live/copies.json] [--from <dir>]   the check; --from reads checkouts named by repository
//                                                              (dir/prelum, dir/site-runtime...) instead of cloning
//   devkit-copies --write-baseline                             set the baseline to today's count (a raise is then a
//                                                              reviewed change to the config, never a silent one)
//
// Each copied block is an ::warning line with both places, and the summary lists them all, so a failure says what to move
// into a shared package. A repository that cannot be cloned stops the check (exit 2): a count over fewer repositories
// would pass by reading less.
//
// LIVE_GITHUB_TOKEN, the live checks' fine-grained token, reads the private repositories: with Contents read on all of
// the owner's repositories it lists and clones every one, private included. Without it only the public ones are read, and
// a warning says so, since a repository that went private would then drop out of the count without any copy removed. The
// token goes to git in its environment, never on a command line, and is never printed. The config:
//
//   { "baseline": 44, "names": 12, "packages": 12, "measured_at": "2026-11-06", "tool": "jscpd@4.3.0" }
//
// jscpd's thresholds are COPY_ARGS (10 lines, 80 tokens), the ones no-bloat's "shared copies" uses on every pull request;
// "args" in the config overrides them.
//
// Two more passes count beside jscpd's blocks. A .claude file jscpd does not read (an agent, a skill, a command) with the
// same bytes in another repository is a copy too, counted in "baseline". And "names" ratchets the distinctive exported
// names (devkit-shared's rule) two or more repositories each define, none a shared package: the same job written twice
// under one name, which jscpd misses whenever the code differs. "packages" ratchets the names two or more shared packages
// each export, the overlap between the packages themselves.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { appendSummary, escapeAnnotation } from "./annotate.mjs";
import { isMain } from "../node/index.mjs";
import {
  OWNER,
  BUFFER,
  isSource,
  isWholeFile,
  sameFiles,
  sharedNames,
  crossRepo,
  at,
  ownerRepos,
  gitAuthEnv,
  COPY_ARGS,
} from "./copies/names.mjs";

/** The source files that can export a name. */
const CODE = /\.[cm]?[jt]sx?$/;

/**
 * Copies one checkout's tracked source into dest/<repo>, and returns how many files that was, the hashes of its whole
 * .claude files and the text of its code files, for the name pass.
 */
function gather(
  /** @type {string} */ checkout,
  /** @type {string} */ repo,
  /** @type {string} */ dest,
) {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: checkout,
    encoding: "utf8",
    maxBuffer: BUFFER,
  }).split("\0");
  const files = tracked.filter(isSource);
  /** @type {{ repo: string, path: string, text: string }[]} */
  const code = [];
  for (const file of files) {
    const from = join(checkout, file);
    if (!existsSync(from)) continue;
    const to = join(dest, repo, file);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    if (CODE.test(file)) code.push({ repo, path: file, text: readFileSync(from, "utf8") });
  }
  const whole = tracked
    .filter((file) => isWholeFile(file) && existsSync(join(checkout, file)))
    .map((file) => ({
      repo,
      path: file,
      hash: createHash("sha256")
        .update(readFileSync(join(checkout, file)))
        .digest("hex"),
    }));
  return { count: files.length, whole, code };
}

/** Runs jscpd over the gathered folder and returns its JSON report. */
function jscpd(
  /** @type {string} */ dir,
  /** @type {string} */ tool,
  /** @type {string[]} */ args,
) {
  const out = join(dirname(dir), "report");
  const r = spawnSync(
    "npx",
    [
      "--yes",
      "--package",
      tool,
      "--",
      "jscpd",
      ".",
      ...args,
      "--reporters",
      "json",
      "--output",
      out,
      "--silent",
    ],
    {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: BUFFER,
    },
  );
  if (r.error || r.status !== 0)
    throw new Error(
      `jscpd exited ${r.status}: ${(r.error?.message ?? r.stderr ?? r.stdout).trim().slice(0, 400)}`,
    );
  return JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8"));
}

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      from: { type: "string" },
      "write-baseline": { type: "boolean" },
    },
  });
  const file = resolve(values.config ?? new URL("../live/copies.json", import.meta.url).pathname);
  const config = JSON.parse(readFileSync(file, "utf8"));
  if (!values["write-baseline"] && !Number.isFinite(config.baseline)) {
    console.log(
      `::error title=devkit-copies::${escapeAnnotation(file)} has no numeric "baseline", so every count would pass. Run \`node bin/copies.mjs --write-baseline\` and commit it.`,
    );
    process.exit(1);
  }
  const work = mkdtempSync(join(tmpdir(), "devkit-copies-"));
  process.on("exit", () => rmSync(work, { recursive: true, force: true })); // clones of private repositories
  const all = join(work, "all");
  mkdirSync(all);

  const token = process.env.LIVE_GITHUB_TOKEN || undefined;
  let repos;
  const { from } = values;
  if (from) {
    repos = readdirSync(from)
      .filter((name) => existsSync(join(from, name, ".git")))
      .sort();
  } else {
    try {
      repos = await ownerRepos(token);
    } catch (error) {
      console.log(
        `::error title=devkit-copies::${escapeAnnotation(`could not list the repositories: ${error instanceof Error ? error.message : String(error)}`)}`,
      );
      process.exit(2);
    }
  }
  const counts = [];
  /** @type {{ repo: string, path: string, hash: string }[]} */
  const whole = [];
  /** @type {{ repo: string, path: string, text: string }[]} */
  const code = [];
  for (const repo of repos) {
    const checkout = values.from ? join(values.from, repo) : join(work, "clones", repo);
    if (!values.from) {
      try {
        execFileSync(
          "git",
          ["clone", "--quiet", "--depth", "1", `https://github.com/${OWNER}/${repo}`, checkout],
          { stdio: "pipe", env: gitAuthEnv(token) },
        );
      } catch (error) {
        const failure = /** @type {{ stderr?: Buffer, message?: string }} */ (error);
        const why = String(failure.stderr ?? failure.message)
          .trim()
          .split("\n")
          .at(-1);
        console.log(
          `::error title=devkit-copies::${escapeAnnotation(`could not clone ${repo}: ${why}${token ? " (LIVE_GITHUB_TOKEN needs Contents read on every repository)" : ""}`)}`,
        );
        process.exit(2);
      }
    }
    const got = gather(checkout, repo, all);
    counts.push(`${repo} ${got.count}`);
    whole.push(...got.whole);
    code.push(...got.code);
  }

  if (!values.from && !token)
    console.log(
      "::warning title=devkit-copies::LIVE_GITHUB_TOKEN is not set, so only public repositories were read; a private one is left out of the count.",
    );
  const pairs = crossRepo(jscpd(all, config.tool, config.args ?? COPY_ARGS));
  const same = sameFiles(whole);
  // A file held by n repositories is n - 1 copies of it.
  const count =
    pairs.length + same.reduce((n, places) => n + new Set(places.map((p) => p.repo)).size - 1, 0);
  const names = sharedNames(code);
  const overlap = sharedNames(code, true);
  const namesBaseline = config.names ?? 0;
  if (values["write-baseline"]) {
    writeFileSync(
      file,
      `${JSON.stringify({ ...config, baseline: count, names: names.length, packages: overlap.length, measured_at: new Date().toISOString().slice(0, 10) }, null, 2)}\n`,
    );
    console.log(
      `devkit-copies: wrote the baselines, ${count} copies, ${names.length} names and ${overlap.length} package overlaps, to ${file}`,
    );
    return;
  }

  const lines = [
    `## Copies across repositories: ${count} (baseline ${config.baseline}, measured ${config.measured_at})`,
    "",
    `${repos.length} repositories, source files each: ${counts.join(", ")}.`,
    "",
    ...pairs.map(
      ({ a, b, lines: n }) =>
        `- ${n} lines: ${at(a, `:${a.start}-${a.end}`)} and ${at(b, `:${b.start}-${b.end}`)}`,
    ),
    ...same.map((places) => `- the same file: ${places.map((p) => at(p)).join(", ")}`),
    "",
    `## Names defined in more than one repository: ${names.length} (baseline ${namesBaseline})`,
    "",
    ...names.map(({ name, places }) => `- ${name}: ${places.map((p) => at(p)).join(", ")}`),
    "",
    `## Names exported by more than one shared package: ${overlap.length} (baseline ${config.packages ?? "none yet"})`,
    "",
    ...overlap.map(({ name, places }) => `- ${name}: ${places.map((p) => at(p)).join(", ")}`),
  ];
  console.log(lines.join("\n"));
  for (const { a, b, lines: n } of pairs)
    console.log(
      `::warning title=devkit-copies::${escapeAnnotation(`${n} lines copied: ${at(a, `:${a.start}`)} and ${at(b, `:${b.start}`)}`)}`,
    );
  for (const places of same)
    console.log(
      `::warning title=devkit-copies::${escapeAnnotation(`the same file: ${places.map((p) => at(p)).join(" and ")}`)}`,
    );
  for (const { name, places } of names)
    console.log(
      `::warning title=devkit-copies::${escapeAnnotation(`${name} is defined in ${places.map((p) => at(p)).join(" and ")}`)}`,
    );
  appendSummary(lines.join("\n"));
  for (const { name, places } of overlap)
    console.log(
      `::warning title=devkit-copies::${escapeAnnotation(`${name} is exported by ${places.map((p) => at(p)).join(" and ")}`)}`,
    );
  let failed = false;
  if (count > config.baseline) {
    console.log(
      `::error title=devkit-copies::${count} blocks are copied between repositories, more than the baseline of ${config.baseline}. Move the new copy into a shared package (https://github.com/${OWNER}/devkit/blob/shared-list/SHARED.md) and import it.`,
    );
    failed = true;
  }
  // No names baseline yet is a count never measured over every repository: said, not failed, until --write-baseline sets it.
  if (config.names === undefined) {
    console.log(
      `::warning title=devkit-copies::live/copies.json has no "names" baseline yet: run \`node bin/copies.mjs --write-baseline\` with LIVE_GITHUB_TOKEN set and commit it (${names.length} today).`,
    );
  } else if (names.length > namesBaseline) {
    console.log(
      `::error title=devkit-copies::${names.length} names are defined in more than one repository, more than the baseline of ${namesBaseline}. The same job written twice belongs once, in a shared package or with its one owner (SHARED.md): move it there and import it, or rename one when the two do different jobs.`,
    );
    failed = true;
  }
  if (config.packages === undefined) {
    console.log(
      `::warning title=devkit-copies::live/copies.json has no "packages" baseline yet: run \`node bin/copies.mjs --write-baseline\` and commit it (${overlap.length} today).`,
    );
  } else if (overlap.length > config.packages) {
    console.log(
      `::error title=devkit-copies::${overlap.length} names are exported by more than one shared package, more than the baseline of ${config.packages}. Two packages doing one job is the overlap this check exists to stop: keep it in one and import it from the other, or rename one when they do different jobs.`,
    );
    failed = true;
  }
  // The count is held exactly, as no-bloat holds its own: below the baseline the room a cleanup left would let the next copy
  // in, so it fails until the baseline is lowered.
  const lower = [];
  if (count < config.baseline) lower.push(`${count} copies (baseline ${config.baseline})`);
  if (config.names !== undefined && names.length < namesBaseline)
    lower.push(`${names.length} names (baseline ${namesBaseline})`);
  if (config.packages !== undefined && overlap.length < config.packages)
    lower.push(`${overlap.length} package overlaps (baseline ${config.packages})`);
  if (lower.length) {
    console.log(
      `::error title=devkit-copies::${lower.join(", ")}. The count went down, so lower the baseline to keep the gain: run \`node bin/copies.mjs --write-baseline\` and commit live/copies.json.`,
    );
    failed = true;
  }
  if (failed) process.exit(1);
}

if (isMain(import.meta.url)) await main();
