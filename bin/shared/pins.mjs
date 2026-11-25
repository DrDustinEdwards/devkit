import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import { SOURCE, NOT_SOURCE, semver, compare } from "./config.mjs";
/** @import { Finding, Tree, TagReader } from "./config.mjs" */

/** The newest release tag of a repository. */
export function newest(/** @type {string[]} */ tags) {
  return (
    tags
      .filter((t) => semver(t))
      .sort(compare)
      .at(-1) ?? null
  );
}

/** Tags and the commit each points at, from git ls-remote (peeled for annotated tags). */
export function lsRemoteTags(/** @type {string} */ repo) {
  const out = execFileSync(
    "git",
    ["ls-remote", "--tags", `https://github.com/DrDustinEdwards/${repo}`],
    { encoding: "utf8", timeout: 60_000 },
  );
  /** @type {Record<string, string>} */
  const commits = {};
  for (const line of out.split("\n")) {
    const m = /^([0-9a-f]{40})\trefs\/tags\/(.+?)(\^\{\})?$/.exec(line);
    if (m) commits[m[2]] = m[3] || !commits[m[2]] ? m[1] : commits[m[2]];
  }
  return { tags: Object.keys(commits), commits };
}

/**
 * The packages a pin may not stay behind for long, and the days a new minor release gets before a pin behind it fails.
 * site-runtime releases many minors a day, so the window is time, not a count of minors: a pin fails once it is behind
 * a minor that has been out FRESH_DAYS days, and a minor younger than that is the usual warning. devkit is here because
 * its no-bloat check runs from the caller's own pins: a pin left behind (or moved back) runs an older check that lets
 * more in, so it fails once a newer minor has been out two days.
 */
export const FRESH = /** @type {Record<string, number>} */ ({ "site-runtime": 3, devkit: 2 });
export const DAY_MS = 86_400_000;

/**
 * The newest major.minor among releases published at or before `cutoff`, from { tag: ISO date }; null for none.
 * @param {Record<string, string>} dates @param {number} cutoff
 */
function settledMinor(dates, cutoff) {
  const settled = Object.entries(dates)
    .filter(([tag, at]) => semver(tag) && Date.parse(at) <= cutoff)
    .map(([tag]) => tag);
  const top = newest(settled);
  return top ? /** @type {number[]} */ (semver(top)).slice(0, 2) : null;
}

/**
 * Release tag -> publish date for one repository, from the GitHub releases API: up to three pages, stopping once a page
 * reaches past the oldest date the rule can need. GITHUB_TOKEN, when set, lifts the anonymous rate limit.
 * @param {string} repo @param {number} since
 */
export async function releaseDates(repo, since) {
  /** @type {Record<string, string>} */
  const dates = {};
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "devkit-shared",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/repos/DrDustinEdwards/${repo}/releases?per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${repo}'s releases`);
    const list =
      /** @type {{ tag_name: string, published_at: string | null, draft: boolean }[]} */ (
        await res.json()
      );
    for (const r of list) if (!r.draft && r.published_at) dates[r.tag_name] = r.published_at;
    if (list.length < 100 || list.some((r) => r.published_at && Date.parse(r.published_at) < since))
      break;
  }
  return dates;
}

/**
 * Pins on a raw commit (an error), behind the newest tag (a warning), or, for a FRESH package, behind a minor that has
 * been out FRESH days (an error). `dates` holds each FRESH package's release dates, or the reason they could not be read.
 * @param {Tree} tree @param {TagReader} readTags @param {Record<string, Record<string, string> | Error>} [dates]
 * @returns {Finding[]}
 */
export function checkPins(tree, readTags, dates = {}, now = Date.now()) {
  /** @type {Finding[]} */
  const found = [];
  /** @type {Record<string, ReturnType<TagReader>>} */
  const cache = {};
  const tagsOf = (/** @type {string} */ repo) => (cache[repo] ??= readTags(repo));
  const servers = mcpServerDirs(tree);
  /** @param {string} file @param {number} line @param {string} repo @param {string} ref */
  const judge = (file, line, repo, ref, what = repo) => {
    const { tags, commits } = tagsOf(repo);
    const latest = newest(tags);
    if (!latest) return;
    const at = semver(ref)
      ? ref.startsWith("v")
        ? ref
        : `v${ref}`
      : Object.keys(commits).find((t) => commits[t] === ref && semver(t));
    const server =
      repo === "site-runtime" && servers.has(posix.dirname(file))
        ? posix.dirname(file) === "."
          ? "the root"
          : posix.dirname(file)
        : null;
    if (!at) {
      found.push({
        check: "pins",
        file,
        line,
        message: `${what} is pinned to ${ref.slice(0, 12)}, which is no release; pin ${latest}`,
      });
    } else if (server && minorsBehind(at, latest) > 1) {
      // S7: every MCP server runs one door, so each stays within a minor of the newest site-runtime, whatever its age.
      found.push({
        check: "pins",
        file,
        line,
        message: `the MCP server in ${server} runs site-runtime ${at}, more than one minor behind ${latest}: every server keeps the same door (S7); bump it`,
      });
    } else if (compare(at, latest) < 0) {
      const days = FRESH[repo];
      const known = dates[repo];
      const settled =
        days && known && !(known instanceof Error)
          ? settledMinor(known, now - days * DAY_MS)
          : null;
      const [major, minor] = /** @type {number[]} */ (semver(at));
      if (settled && (major < settled[0] || (major === settled[0] && minor < settled[1]))) {
        found.push({
          check: "pins",
          file,
          line,
          message: `${what} is at ${at}, behind v${settled.join(".")}, a minor out more than ${days} days; bump to ${latest}`,
        });
      } else {
        found.push({
          check: "pins",
          file,
          line,
          warn: true,
          message: `${what} is at ${at}; the newest release is ${latest}`,
        });
      }
    }
  };
  for (const file of tree.files) {
    const text = tree.read(file);
    const lineOf = (/** @type {number} */ index) => text.slice(0, index).split("\n").length;
    if (posix.basename(file) === "package.json") {
      for (const m of text.matchAll(
        /"([^"]+)":\s*"(?:github:|git\+https:\/\/github\.com\/)DrDustinEdwards\/([\w.-]+?)(?:\.git)?#([^"]+)"/gi,
      )) {
        judge(file, lineOf(m.index), m[2], m[3]);
        found.push(...lockDisagrees(tree, file, lineOf(m.index), m[1], m[2], m[3]));
      }
      for (const m of text.matchAll(/"enarratio":\s*"\^?~?(\d+\.\d+\.\d+)"/g))
        judge(file, lineOf(m.index), "enarratio", m[1]);
    } else if (/^\.github\/workflows\/.+\.ya?ml$/.test(file)) {
      for (const m of text.matchAll(
        /DrDustinEdwards\/devkit\/\.github\/workflows\/[\w.-]+@([0-9a-f]{40})/gi,
      ))
        judge(file, lineOf(m.index), "devkit", m[1]);
    }
  }
  for (const [repo, known] of Object.entries(dates)) {
    if (known instanceof Error)
      found.push({
        check: "pins",
        warn: true,
        message: `${repo}'s release dates could not be read (${known.message}), so its ${FRESH[repo]}-day rule was not judged`,
      });
  }
  return found;
}

/**
 * The package-lock.json that governs a manifest: the one beside it, or the nearest above it (an npm workspace keeps one
 * lock at the root for every package under it). Null when there is none.
 * @param {Tree} tree @param {string} file
 */
function governingNpmLock(tree, file) {
  for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
    const lock = posix.join(dir, "package-lock.json");
    if (tree.files.includes(lock)) return lock;
    if (dir === ".") return null;
  }
}

/**
 * A pin of a shared package whose lockfile resolves another release (an error): npm keeps a lock entry for a git
 * dependency when the tag in package.json moves, so a bump that only edits package.json ships the old code (capsid #785
 * pinned site-runtime v0.76.0 over a lock that resolved 0.74.0). npm: the lock's version for the package must equal the
 * tag. A workspace member has no lock of its own: the root lock holds its entry, found the way Node resolves it, at
 * `<member>/node_modules/<name>` and then in each directory above it (foxing's apps/web stayed on capsomer 0.83.1 under a
 * v0.87.0 pin, because only a lock beside the manifest was read). pnpm: the lock must record the same specifier.
 * @param {Tree} tree @param {string} file @param {number} line @param {string} name @param {string} repo @param {string} ref
 * @returns {Finding[]}
 */
export function lockDisagrees(tree, file, line, name, repo, ref) {
  const want = semver(ref) ? ref.replace(/^v/, "") : null;
  if (!want) return [];
  const npmLock = governingNpmLock(tree, file);
  if (npmLock) {
    let lock;
    try {
      lock = JSON.parse(tree.read(npmLock));
    } catch {
      return [{ check: "pins", file: npmLock, message: "package-lock.json is not valid JSON" }];
    }
    const base = posix.relative(posix.dirname(npmLock), posix.dirname(file));
    let got;
    for (let dir = base === "" ? "." : base; ; dir = posix.dirname(dir)) {
      const entry = lock?.packages?.[posix.normalize(posix.join(dir, "node_modules", name))];
      if (entry) {
        got = entry.version;
        break;
      }
      if (dir === ".") break;
    }
    if (got !== want)
      return [
        {
          check: "pins",
          file,
          line,
          message: `${name} is pinned to v${want} but ${npmLock} resolves ${got ?? "nothing"}: regenerate the lock (delete its node_modules/${name} entry, then npm install --package-lock-only)`,
        },
      ];
    return [];
  }
  const pnpmLock = tree.files.find((f) => posix.basename(f) === "pnpm-lock.yaml");
  if (pnpmLock && !tree.read(pnpmLock).includes(`DrDustinEdwards/${repo}#${ref}`)) {
    return [
      {
        check: "pins",
        file,
        line,
        message: `${name} is pinned to ${ref} but ${pnpmLock} does not record that specifier: run pnpm install and commit the lock`,
      },
    ];
  }
  return [];
}

/** How many minors `at` is behind `latest`; a major behind counts as many. @param {string} at @param {string} latest */
function minorsBehind(at, latest) {
  const [x, y] = [semver(at), semver(latest)];
  if (!x || !y) return 0;
  return x[0] < y[0] ? Infinity : Math.max(0, y[1] - x[1]);
}

/** A source file that serves MCP through the shared door. */
const MCP_SERVER = /["']@dustinedwards\/site-runtime\/mcp-(?:server|login)["']/;

/** The directories of the package.json files whose code serves MCP: each server file belongs to its nearest manifest. */
export function mcpServerDirs(/** @type {Tree} */ tree) {
  const manifests = tree.files
    .filter((f) => posix.basename(f) === "package.json" && !NOT_SOURCE.test(f))
    .map((f) => posix.dirname(f));
  const dirs = new Set();
  for (const file of tree.files) {
    if (!SOURCE.test(file) || NOT_SOURCE.test(file) || !MCP_SERVER.test(tree.read(file))) continue;
    const owner = manifests
      .filter((d) => d === "." || file.startsWith(`${d}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (owner) dirs.add(owner);
  }
  return dirs;
}
