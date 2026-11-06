#!/usr/bin/env node
// The cross-repo copy ratchet. devkit-shared's copies check matches by name, so a block copied from one repository into
// another under a new name slips past it; this scan reads the code itself. It shallow-clones every public repository of
// the owner (no forks, nothing archived), gathers each one's tracked source (no tests, builds or vendored files, SOURCE
// and SKIP below) into one folder, runs jscpd over all of it at once and counts the copied blocks whose two files sit in
// different repositories. The count may only go down: above the baseline in live/copies.json it fails (exit 1); below it,
// it passes and says to lower the baseline so the gain is kept.
//
//   devkit-copies [--config live/copies.json] [--from <dir>]   the check; --from reads checkouts named by repository
//                                                              (dir/prelum, dir/site-runtime...) instead of cloning
//   devkit-copies --write-baseline                             set the baseline to today's count (a raise is then a
//                                                              reviewed change to the config, never a silent one)
//
// Each copied block is an ::warning line with both places, and the summary lists them all, so a failure says what to move
// into a shared package. A repository that cannot be cloned stops the check (exit 2): a count over fewer repositories
// would pass by reading less. The config:
//
//   { "baseline": 44, "measured_at": "2026-11-06", "tool": "jscpd@5.4.0", "args": ["--min-lines", "10", "--min-tokens", "80"] }

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const OWNER = "DrDustinEdwards";
const BUFFER = 256 * 1024 * 1024;

/** The files that count as source: code and styles, the formats a copy would be moved into a shared package from. */
export const SOURCE = /\.(?:[cm]?[jt]sx?|css|py|sh|sql)$/;

/**
 * What the scan leaves out: tests, builds, generated and vendored code; a site's database migrations, which are its applied
 * history and can never be edited or removed, so a ratchet over them could never go down; and dot-folders (.claude,
 * .github, .vscode), the per-repository agent, CI and editor settings each tool reads from the repository itself.
 */
export const SKIP =
  /(?:^|\/)(?:\.[^/]+|node_modules|vendor|third_party|dist|build|out|coverage|test|tests|__tests__|__mocks__|e2e|fixtures?|generated|drizzle|migrations)\/|\.(?:test|spec)\.[^/]+$|\.min\.[^/]+$|\.d\.[cm]?ts$/;

/** Whether a tracked path is source the scan reads. */
export const isSource = (/** @type {string} */ path) => SOURCE.test(path) && !SKIP.test(path);

/**
 * The copied blocks whose two files sit in different repositories, from jscpd's JSON report over a folder laid out as
 * <repo>/<path>. Pure.
 * @param {{ duplicates: { firstFile: { name: string, start: number, end: number }, secondFile: { name: string, start: number, end: number }, lines: number }[] }} report
 */
export function crossRepo(report) {
  const place = (/** @type {{ name: string, start: number, end: number }} */ f) => {
    const name = f.name.replace(/\\/g, "/").replace(/^\.\//, "");
    const slash = name.indexOf("/");
    return { repo: name.slice(0, slash), path: name.slice(slash + 1), start: f.start, end: f.end };
  };
  return report.duplicates
    .map((d) => ({ a: place(d.firstFile), b: place(d.secondFile), lines: d.lines }))
    .filter(({ a, b }) => a.repo !== b.repo)
    .map(({ a, b, lines }) => (`${a.repo}/${a.path}` <= `${b.repo}/${b.path}` ? { a, b, lines } : { a: b, b: a, lines }))
    .sort((x, y) => `${x.a.repo}/${x.a.path}:${x.a.start}`.localeCompare(`${y.a.repo}/${y.a.path}:${y.a.start}`));
}

/** The owner's public repositories that are neither forks nor archived, by name. */
async function publicRepos(/** @type {string | undefined} */ token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "devkit-copies", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const names = [];
  for (let page = 1; ; page++) {
    const resp = await fetch(`https://api.github.com/users/${OWNER}/repos?type=owner&per_page=100&page=${page}`, { headers });
    if (!resp.ok) throw new Error(`GitHub answered ${resp.status} for the repository list`);
    const list = await resp.json();
    for (const repo of list) if (!repo.private && !repo.fork && !repo.archived) names.push(repo.name);
    if (list.length < 100) return names.sort();
  }
}

/** Copies one checkout's tracked source into dest/<repo>. */
function gather(/** @type {string} */ checkout, /** @type {string} */ repo, /** @type {string} */ dest) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: checkout, encoding: "utf8", maxBuffer: BUFFER }).split("\0").filter(isSource);
  for (const file of files) {
    const from = join(checkout, file);
    if (!existsSync(from)) continue;
    const to = join(dest, repo, file);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  return files.length;
}

/** Runs jscpd over the gathered folder and returns its JSON report. */
function jscpd(/** @type {string} */ dir, /** @type {string} */ tool, /** @type {string[]} */ args) {
  const out = mkdtempSync(join(tmpdir(), "devkit-copies-report-"));
  const r = spawnSync("npx", ["--yes", "--package", tool, "--", "jscpd", ".", ...args, "--reporters", "json", "--output", out, "--silent"], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: BUFFER,
  });
  if (r.error || r.status !== 0) throw new Error(`jscpd exited ${r.status}: ${(r.error?.message ?? r.stderr ?? r.stdout).trim().slice(0, 400)}`);
  return JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8"));
}

async function main() {
  const { values } = parseArgs({ options: { config: { type: "string" }, from: { type: "string" }, "write-baseline": { type: "boolean" } } });
  const file = resolve(values.config ?? new URL("../live/copies.json", import.meta.url).pathname);
  const config = JSON.parse(readFileSync(file, "utf8"));
  const work = mkdtempSync(join(tmpdir(), "devkit-copies-"));
  const all = join(work, "all");
  mkdirSync(all);

  let repos;
  if (values.from) {
    repos = readdirSync(values.from).filter((name) => existsSync(join(values.from, name, ".git"))).sort();
  } else {
    try {
      repos = await publicRepos(process.env.GITHUB_TOKEN);
    } catch (error) {
      console.log(`::error title=devkit-copies::could not list the repositories: ${error.message}`);
      process.exit(2);
    }
  }
  const counts = [];
  for (const repo of repos) {
    const checkout = values.from ? join(values.from, repo) : join(work, "clones", repo);
    if (!values.from) {
      try {
        execFileSync("git", ["clone", "--quiet", "--depth", "1", `https://github.com/${OWNER}/${repo}`, checkout], { stdio: "pipe" });
      } catch (error) {
        console.log(`::error title=devkit-copies::could not clone ${repo}: ${String(error.stderr ?? error.message).trim().split("\n").at(-1)}`);
        process.exit(2);
      }
    }
    counts.push(`${repo} ${gather(checkout, repo, all)}`);
  }

  const pairs = crossRepo(jscpd(all, config.tool, config.args));
  const count = pairs.length;
  if (values["write-baseline"]) {
    writeFileSync(file, `${JSON.stringify({ ...config, baseline: count, measured_at: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
    console.log(`devkit-copies: wrote the baseline, ${count}, to ${file}`);
    return;
  }

  const lines = [
    `## Copies across repositories: ${count} (baseline ${config.baseline}, measured ${config.measured_at})`,
    "",
    `${repos.length} repositories, source files each: ${counts.join(", ")}.`,
    "",
    ...pairs.map(({ a, b, lines: n }) => `- ${n} lines: ${a.repo}/${a.path}:${a.start}-${a.end} and ${b.repo}/${b.path}:${b.start}-${b.end}`),
  ];
  console.log(lines.join("\n"));
  for (const { a, b, lines: n } of pairs) console.log(`::warning title=devkit-copies::${n} lines copied: ${a.repo}/${a.path}:${a.start} and ${b.repo}/${b.path}:${b.start}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  if (count > config.baseline) {
    console.log(
      `::error title=devkit-copies::${count} blocks are copied between repositories, more than the baseline of ${config.baseline}. Move the new copy into a shared package (https://github.com/${OWNER}/devkit/blob/shared-list/SHARED.md) and import it.`,
    );
    process.exit(1);
  }
  if (count < config.baseline) {
    console.log(`::notice title=devkit-copies::${count} copies, down from ${config.baseline}. Lower the baseline to keep the gain: run \`node bin/copies.mjs --write-baseline\` and commit live/copies.json.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
