#!/usr/bin/env node
// The cross-repo copy ratchet. devkit-shared's copies check matches by name, so a block copied from one repository into
// another under a new name slips past it; this scan reads the code itself. It shallow-clones every repository of the owner
// it can read (no forks, nothing archived), gathers each one's tracked source (no tests, builds or vendored files, SOURCE
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
// would pass by reading less.
//
// LIVE_GITHUB_TOKEN, the live checks' fine-grained token, reads the private repositories: with Contents read on all of
// the owner's repositories it lists and clones every one, private included. Without it only the public ones are read, and
// a warning says so, since a repository that went private would then drop out of the count without any copy removed. The
// token goes to git in its environment, never on a command line, and is never printed. The config:
//
//   { "baseline": 44, "names": 12, "measured_at": "2026-11-06", "tool": "jscpd@4.3.0", "args": ["--min-lines", "10", "--min-tokens", "80"] }
//
// Two more passes count beside jscpd's blocks. A .claude file jscpd does not read (an agent, a skill, a command) with the
// same bytes in another repository is a copy too, counted in "baseline". And "names" ratchets the distinctive exported
// names (devkit-shared's rule) two or more repositories each define, none a shared package: the same job written twice
// under one name, which jscpd misses whenever the code differs.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { PACKAGES, distinctive, exportNames } from "./shared.mjs";

const OWNER = "DrDustinEdwards";
const BUFFER = 256 * 1024 * 1024;

/** The files that count as source: code and styles, the formats a copy would be moved into a shared package from. */
export const SOURCE = /\.(?:[cm]?[jt]sx?|css|py|sh|sql)$/;

/**
 * What the scan leaves out: tests, builds, generated and vendored code; a site's database migrations, which are its applied
 * history and can never be edited or removed, so a ratchet over them could never go down; and the dot-folders other than
 * .claude and .github (.vscode, .wrangler...), editor and tool state. .claude and .github are read: their hooks and
 * scripts are code, and ten byte-identical .claude/hooks copies went unseen while every dot-folder was skipped.
 */
export const SKIP =
  /(?:^|\/)(?:\.(?!(?:claude|github)\/)[^/]+|node_modules|vendor|third_party|dist|build|out|coverage|test|tests|__tests__|__mocks__|e2e|fixtures?|generated|drizzle|migrations)\/|\.(?:test|spec)\.[^/]+$|\.min\.[^/]+$|\.d\.[cm]?ts$/;

/** Whether a tracked path is source the scan reads. */
export const isSource = (/** @type {string} */ path) => SOURCE.test(path) && !SKIP.test(path);

/**
 * The .claude files jscpd does not read (agents, skills, commands, rules: Markdown and the like), compared whole instead.
 * The settings files are left out: .claude/settings.json is each repository's own permissions plus the hook block devkit's
 * README has every repository paste, so the same bytes there are the shared way, not a copy.
 */
export const isWholeFile = (/** @type {string} */ path) =>
  /(?:^|\/)\.claude\//.test(path) && !SOURCE.test(path) && !SKIP.test(path) && !/(?:^|\/)settings(?:\.local)?\.json$/.test(path);

/**
 * Files with the same bytes in more than one repository: each group of places that hold one content. Pure.
 * @param {{ repo: string, path: string, hash: string }[]} files
 */
export function sameFiles(files) {
  /** @type {Map<string, { repo: string, path: string }[]>} */
  const byHash = new Map();
  for (const { repo, path, hash } of files) byHash.set(hash, [...(byHash.get(hash) ?? []), { repo, path }]);
  return [...byHash.values()]
    .filter((places) => new Set(places.map((p) => p.repo)).size > 1)
    .map((places) => places.sort((a, b) => `${a.repo}/${a.path}`.localeCompare(`${b.repo}/${b.path}`)))
    .sort((a, b) => `${a[0].repo}/${a[0].path}`.localeCompare(`${b[0].repo}/${b[0].path}`));
}

/** The shared packages' repositories: a name one of them exports is devkit-shared's copies check to judge, by its catalog. */
const PACKAGE_REPOS = new Set(PACKAGES.map((p) => p.repo));

/** The exports React Router reads from a route module by name: every app has them, by design. */
const ROUTE_EXPORTS = new Set(["clientLoader", "clientAction", "shouldRevalidate", "HydrateFallback", "ErrorBoundary"]);

/**
 * What defines nothing of its own: a re-export (`export { x } from "..."`), and a Drizzle table, which mirrors in each
 * app's schema the SQL a shared package ships (site-api's media and store tables), so the same table name in two apps
 * is the shared schema, not a second job.
 */
const NOT_OWN = /export\s*(?:type\s*)?\{[^}]*\}\s*from\s*["'][^"']+["']|export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*(?:sqliteTable|pgTable|mysqlTable)\s*\(/g;

/**
 * Distinctive names (devkit-shared's rule) that two or more repositories each define and export, none of them a shared
 * package: the same job written twice under one name, which jscpd misses when the code differs. Pure.
 * @param {{ repo: string, path: string, text: string }[]} files code files
 */
export function sharedNames(files) {
  /** @type {Map<string, Map<string, string>>} name -> repo -> its first path */
  const defined = new Map();
  for (const { repo, path, text } of files) {
    if (PACKAGE_REPOS.has(repo)) continue;
    for (const name of exportNames(text.replace(NOT_OWN, ""))) {
      if (!distinctive(name) || ROUTE_EXPORTS.has(name)) continue;
      const repos = defined.get(name) ?? new Map();
      if (!repos.has(repo)) repos.set(repo, path);
      defined.set(name, repos);
    }
  }
  return [...defined]
    .filter(([, repos]) => repos.size > 1)
    .map(([name, repos]) => ({ name, places: [...repos].map(([repo, path]) => ({ repo, path })).sort((a, b) => a.repo.localeCompare(b.repo)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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

/**
 * The owner's repositories that are neither forks nor archived, by name: every one the token can read when there is a
 * token for the owner (a fine-grained token lists its repositories at /user/repos), the public ones otherwise.
 */
async function ownerRepos(/** @type {string | undefined} */ token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "devkit-copies", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const list = token ? "https://api.github.com/user/repos?affiliation=owner&visibility=all" : `https://api.github.com/users/${OWNER}/repos?type=owner`;
  const names = [];
  for (let page = 1; ; page++) {
    const resp = await fetch(`${list}&per_page=100&page=${page}`, { headers });
    if (!resp.ok) throw new Error(`GitHub answered ${resp.status} for the repository list`);
    const repos = await resp.json();
    for (const repo of repos) if (repo.owner?.login === OWNER && !repo.fork && !repo.archived) names.push(repo.name);
    if (repos.length < 100) return names.sort();
  }
}

/** The environment that gives git the token as an Authorization header, as actions/checkout does, off the command line. */
function gitAuthEnv(/** @type {string | undefined} */ token) {
  if (!token) return { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
}

/** The source files that can export a name. */
const CODE = /\.[cm]?[jt]sx?$/;

/**
 * Copies one checkout's tracked source into dest/<repo>, and returns how many files that was, the hashes of its whole
 * .claude files and the text of its code files, for the name pass.
 */
function gather(/** @type {string} */ checkout, /** @type {string} */ repo, /** @type {string} */ dest) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: checkout, encoding: "utf8", maxBuffer: BUFFER }).split("\0");
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
    .map((file) => ({ repo, path: file, hash: createHash("sha256").update(readFileSync(join(checkout, file))).digest("hex") }));
  return { count: files.length, whole, code };
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

  const token = process.env.LIVE_GITHUB_TOKEN || undefined;
  let repos;
  const { from } = values;
  if (from) {
    repos = readdirSync(from).filter((name) => existsSync(join(from, name, ".git"))).sort();
  } else {
    try {
      repos = await ownerRepos(token);
    } catch (error) {
      console.log(`::error title=devkit-copies::could not list the repositories: ${error instanceof Error ? error.message : String(error)}`);
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
        execFileSync("git", ["clone", "--quiet", "--depth", "1", `https://github.com/${OWNER}/${repo}`, checkout], { stdio: "pipe", env: gitAuthEnv(token) });
      } catch (error) {
        const failure = /** @type {{ stderr?: Buffer, message?: string }} */ (error);
        const why = String(failure.stderr ?? failure.message).trim().split("\n").at(-1);
        console.log(`::error title=devkit-copies::could not clone ${repo}: ${why}${token ? " (LIVE_GITHUB_TOKEN needs Contents read on every repository)" : ""}`);
        process.exit(2);
      }
    }
    const got = gather(checkout, repo, all);
    counts.push(`${repo} ${got.count}`);
    whole.push(...got.whole);
    code.push(...got.code);
  }

  if (!values.from && !token) {
    console.log("::warning title=devkit-copies::LIVE_GITHUB_TOKEN is not set, so only public repositories were read; a private one is left out of the count.");
  }
  const pairs = crossRepo(jscpd(all, config.tool, config.args));
  const same = sameFiles(whole);
  // A file held by n repositories is n - 1 copies of it.
  const count = pairs.length + same.reduce((n, places) => n + new Set(places.map((p) => p.repo)).size - 1, 0);
  const names = sharedNames(code);
  const namesBaseline = config.names ?? 0;
  if (values["write-baseline"]) {
    writeFileSync(file, `${JSON.stringify({ ...config, baseline: count, names: names.length, measured_at: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
    console.log(`devkit-copies: wrote the baselines, ${count} copies and ${names.length} names, to ${file}`);
    return;
  }

  const lines = [
    `## Copies across repositories: ${count} (baseline ${config.baseline}, measured ${config.measured_at})`,
    "",
    `${repos.length} repositories, source files each: ${counts.join(", ")}.`,
    "",
    ...pairs.map(({ a, b, lines: n }) => `- ${n} lines: ${a.repo}/${a.path}:${a.start}-${a.end} and ${b.repo}/${b.path}:${b.start}-${b.end}`),
    ...same.map((places) => `- the same file: ${places.map((p) => `${p.repo}/${p.path}`).join(", ")}`),
    "",
    `## Names defined in more than one repository: ${names.length} (baseline ${namesBaseline})`,
    "",
    ...names.map(({ name, places }) => `- ${name}: ${places.map((p) => `${p.repo}/${p.path}`).join(", ")}`),
  ];
  console.log(lines.join("\n"));
  for (const { a, b, lines: n } of pairs) console.log(`::warning title=devkit-copies::${n} lines copied: ${a.repo}/${a.path}:${a.start} and ${b.repo}/${b.path}:${b.start}`);
  for (const places of same) console.log(`::warning title=devkit-copies::the same file: ${places.map((p) => `${p.repo}/${p.path}`).join(" and ")}`);
  for (const { name, places } of names) console.log(`::warning title=devkit-copies::${name} is defined in ${places.map((p) => `${p.repo}/${p.path}`).join(" and ")}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  let failed = false;
  if (count > config.baseline) {
    console.log(
      `::error title=devkit-copies::${count} blocks are copied between repositories, more than the baseline of ${config.baseline}. Move the new copy into a shared package (https://github.com/${OWNER}/devkit/blob/shared-list/SHARED.md) and import it.`,
    );
    failed = true;
  }
  // No names baseline yet is a count never measured over every repository: said, not failed, until --write-baseline sets it.
  if (config.names === undefined) {
    console.log(`::warning title=devkit-copies::live/copies.json has no "names" baseline yet: run \`node bin/copies.mjs --write-baseline\` with LIVE_GITHUB_TOKEN set and commit it (${names.length} today).`);
  } else if (names.length > namesBaseline) {
    console.log(
      `::error title=devkit-copies::${names.length} names are defined in more than one repository, more than the baseline of ${namesBaseline}. The same job written twice belongs once, in a shared package or with its one owner (SHARED.md): move it there and import it, or rename one when the two do different jobs.`,
    );
    failed = true;
  }
  if (failed) process.exit(1);
  if (count < config.baseline || (config.names !== undefined && names.length < namesBaseline)) {
    console.log(
      `::notice title=devkit-copies::${count} copies (baseline ${config.baseline}) and ${names.length} names (baseline ${namesBaseline}). Lower the baselines to keep the gain: run \`node bin/copies.mjs --write-baseline\` and commit live/copies.json.`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
