import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OWNER,
  CHECK_TIMEOUT_MS,
  PARALLEL,
  MAX_OUTPUT,
  MAX_RATE_WAIT_MS,
  checksFor,
} from "./config.mjs";
import { resultOf, reportedResult, unmeasuredResult, fetchReport } from "./results.mjs";
/** @import { Json } from "./config.mjs" */

/**
 * What git and npm get from the run's environment: the basics of a process and nothing else, so no token, no key and no
 * MCP grant reaches a ls-remote or an install (the family's packages are public, so neither needs a token).
 */
const toolEnv = () => ({ ...checkEnv(process.env, {}), GIT_TERMINAL_PROMPT: "0" });

/** The newest vX.Y.Z tag of one of the family's repositories. */
function newestTag(/** @type {string} */ repo) {
  const out = execFileSync(
    "git",
    ["ls-remote", "--tags", "--refs", `https://github.com/${OWNER}/${repo}`],
    { encoding: "utf8", timeout: 60_000, env: toolEnv() },
  );
  const tags = [...out.matchAll(/refs\/tags\/(v\d+\.\d+\.\d+)$/gm)].map((m) => m[1]);
  tags.sort((/** @type {string} */ a, /** @type {string} */ b) =>
    a
      .slice(1)
      .split(".")
      .map(Number)
      .reduce((d, n, i) => d || n - Number(b.slice(1).split(".")[i]), 0),
  );
  return tags.at(-1);
}

/**
 * Packages a check's package imports but does not declare (site-runtime is not a peer, since
 * a peer range for a git-only package breaks every network lockfile update), installed in the same npm run at their newest
 * release, as a site installs them.
 */
const BESIDE = /** @type {Record<string, string[]>} */ ({ prelum: ["site-runtime"] });

/**
 * Installs a check's package once per repo and ref; returns the bin's path or the reason it cannot run. The newest tag
 * is read once per repository for the run, so every site's check runs the same release.
 */
function install(
  /** @type {Json} */ check,
  /** @type {Map<string, Json>} */ cache,
  /** @type {string} */ root,
) {
  const tagFor = (/** @type {string} */ repo) => {
    const tagKey = `tags:${repo}`;
    if (!cache.has(tagKey)) {
      try {
        const tag = newestTag(repo);
        cache.set(tagKey, tag ? { ref: tag } : { error: `${repo} has no release tag` });
      } catch {
        cache.set(tagKey, { error: `could not read the tags of ${repo}` });
      }
    }
    return /** @type {Json} */ (cache.get(tagKey));
  };
  const tagged = check.ref === undefined ? tagFor(check.repo) : { ref: check.ref };
  if (tagged.error) return { ref: null, error: tagged.error };
  const { ref } = tagged;
  const beside = /** @type {Json[]} */ (
    (BESIDE[check.repo] ?? []).map((/** @type {string} */ repo) => ({ repo, ...tagFor(repo) }))
  );
  const failed = beside.find((b) => b.error);
  if (failed) return { ref, error: failed.error };
  const key = [`${check.repo}#${ref}`, ...beside.map((b) => `${b.repo}#${b.ref}`)].join("+");
  if (!cache.has(key)) {
    const dir = join(root, key.replace(/[^A-Za-z0-9.-]/g, "_"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), "{}");
      execFileSync(
        "npm",
        [
          "install",
          "--no-save",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          `github:${OWNER}/${check.repo}#${ref}`,
          ...beside.map((b) => `github:${OWNER}/${b.repo}#${b.ref}`),
        ],
        { cwd: dir, stdio: "pipe", timeout: 300_000, env: toolEnv() },
      );
      cache.set(key, { dir, ref });
    } catch (error) {
      cache.set(key, {
        ref,
        error: `could not install ${key}: ${String(
          /** @type {Json} */ (error).stderr ?? /** @type {Json} */ (error).message,
        )
          .trim()
          .split("\n")
          .at(-1)}`,
      });
    }
  }
  const got = /** @type {Json} */ (cache.get(key));
  if (got.error) return { ref, error: got.error };
  const bin = join(got.dir, "node_modules", ".bin", check.bin);
  return existsSync(bin)
    ? { ref, bin }
    : { ref, error: `${check.repo} ${ref} has no ${check.bin} bin yet` };
}

/** The MCP test grants' variables: one read-only key per MCP server, for the checks marked "grants": true alone. */
export const GRANT_ENV = /^MCP_TEST_GRANT_/;

/**
 * What every check's bin gets from the run's environment: the basics of a process, never a token or a key. Of the NODE_
 * variables only these three: NODE_OPTIONS can load code (`--require`) and NODE_AUTH_TOKEN is npm's token.
 */
const BASE_ENV =
  /^(?:PATH|HOME|USER|SHELL|TMPDIR|TEMP|TMP|TZ|CI|LANG|LANGUAGE|LC_[A-Z_]+|NODE_EXTRA_CA_CERTS|NODE_NO_WARNINGS|NODE_ENV|SSL_CERT_(?:FILE|DIR)|(?:HTTPS?|NO|ALL)_PROXY|PLAYWRIGHT_BROWSERS_PATH|DEVKIT_A11Y_CHROMIUM|SYSTEMROOT|COMSPEC|PATHEXT)$/i;
const PROXY_ENV = /^(?:HTTPS?|ALL)_PROXY$/i;

/** The MCP test grant's variable for an origin: MCP_TEST_GRANT_ and its host upper-cased, every other character `_`. */
const grantName = (/** @type {string} */ origin) =>
  `MCP_TEST_GRANT_${new URL(origin).hostname.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

/** A proxy URL without its user and password, which are a credential like any other. */
const withoutCredentials = (/** @type {string} */ value) => {
  try {
    const url = new URL(value);
    if (!url.username && !url.password) return value;
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return value.includes("@") ? undefined : value;
  }
};

/**
 * The environment a check's bin runs with: the basics, the variables the check names in its `env` list, and, for a check
 * marked "grants", the one MCP test grant for the site's origin (`site`). Nothing else, so a token or a key reaches only
 * the check that declares it, and a server's grant only that server's probe.
 */
export function checkEnv(
  /** @type {NodeJS.ProcessEnv} */ env,
  /** @type {{ grants?: boolean, env?: string[] }} */ check,
  /** @type {Json} */ site = {},
) {
  const named = new Set(check.env ?? []);
  const grant = check.grants === true && site.origin ? grantName(site.origin) : undefined;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (named.has(name) || name === grant) out[name] = value;
    else if (BASE_ENV.test(name)) {
      const kept = PROXY_ENV.test(name) ? withoutCredentials(value) : value;
      if (kept !== undefined) out[name] = kept;
    }
  }
  return out;
}

/**
 * Runs a check's bin in its own process group, so a timeout kills what it started too (a Chromium holding stdio open),
 * and so does its exit. Output is read as UTF-8 and kept to MAX_OUTPUT.
 */
function runBin(
  /** @type {string} */ bin,
  /** @type {string[]} */ args,
  /** @type {NodeJS.ProcessEnv} */ env,
  timeoutMs = CHECK_TIMEOUT_MS,
) {
  return new Promise(
    (
      /** @type {(r: { code: number | null, output: string, seconds: number, killed?: string }) => void} */ resolve,
    ) => {
      const started = Date.now();
      let output = "";
      let truncated = false;
      /** @type {string | undefined} */
      let killed;
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env, detached: true });
      const killGroup = (/** @type {NodeJS.Signals} */ signal) => {
        try {
          if (child.pid) process.kill(-child.pid, signal);
        } catch {
          // The group is already gone.
        }
      };
      const add = (/** @type {string} */ chunk) => {
        if (truncated) return;
        if (output.length + chunk.length <= MAX_OUTPUT) output += chunk;
        else {
          output += `${chunk.slice(0, MAX_OUTPUT - output.length)}\n[output cut at ${MAX_OUTPUT / 1024 / 1024} MB]`;
          truncated = true;
        }
      };
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", add);
      }
      let hard = /** @type {NodeJS.Timeout | undefined} */ (undefined);
      const timer = setTimeout(() => {
        killed = `timed out after ${Math.round(timeoutMs / 60_000)} minutes`;
        killGroup("SIGTERM");
        hard = setTimeout(() => killGroup("SIGKILL"), 10_000);
      }, timeoutMs);
      let done = false;
      const finish = (/** @type {number | null} */ code, /** @type {string | null} */ signal) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(hard);
        if (signal && !killed) killed = `killed by ${signal}`;
        resolve({
          code: killed ? null : code,
          output,
          seconds: Math.round((Date.now() - started) / 1000),
          ...(killed ? { killed } : {}),
        });
      };
      // What the bin left running would keep its stdio open, and "close" with it; the bin's exit ends the group.
      child.on("exit", () => killGroup("SIGKILL"));
      child.on("close", finish);
      child.on("error", (error) => {
        add(`\n${error.message}`);
        if (!child.pid) finish(null, null);
      });
    },
  );
}

/**
 * A GitHub API read that waits out a rate limit (Retry-After, else x-ratelimit-reset) when the wait is at most
 * MAX_RATE_WAIT_MS, once; a longer one, or a second refusal, is returned for the caller to call unmeasured.
 */
async function githubFetch(
  /** @type {string} */ url,
  /** @type {Record<string, string>} */ headers,
  /** @type {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number }} */ io,
) {
  const { fetch: get = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = io;
  const now = io.now ?? Date.now;
  for (let attempt = 0; ; attempt++) {
    const resp = await get(url, { headers, signal: AbortSignal.timeout(30_000) });
    const limited =
      resp.status === 429 ||
      (resp.status === 403 &&
        (resp.headers.get("retry-after") !== null ||
          resp.headers.get("x-ratelimit-remaining") === "0"));
    if (!limited || attempt) return resp;
    const after = Number(resp.headers.get("retry-after"));
    const reset = Number(resp.headers.get("x-ratelimit-reset"));
    const wait = after > 0 ? after * 1000 : reset > 0 ? reset * 1000 - now() : 1000;
    if (!(wait <= MAX_RATE_WAIT_MS)) return resp;
    await resp.body?.cancel();
    await sleep(Math.max(wait, 0));
  }
}

/**
 * Merged pull requests labeled for an area, with their lines, from every repository the token can read: every page of
 * the search, and an error (the area's lines unmeasured) rather than a short count when GitHub holds any back.
 */
async function linesFor(
  /** @type {number} */ area,
  /** @type {string | undefined} */ token,
  /** @type {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number }} */ io = {},
) {
  if (!token) return { error: "no GitHub token" };
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "devkit-live",
  };
  const q = encodeURIComponent(`user:${OWNER} is:pr is:merged label:completeness-area-${area}`);
  /** @type {Json[]} */
  const items = [];
  for (let page = 1; ; page++) {
    const search = await githubFetch(
      `https://api.github.com/search/issues?q=${q}&per_page=100&page=${page}`,
      headers,
      io,
    );
    if (!search.ok) return { error: `GitHub search answered ${search.status}` };
    const body = await search.json();
    if (!Number.isInteger(body?.total_count) || !Array.isArray(body.items))
      return { error: "GitHub search answered without total_count and items" };
    if (body.incomplete_results) return { error: "GitHub search timed out (incomplete_results)" };
    // The search API serves the first 1,000 results alone.
    if (body.total_count > 1000)
      return { error: `GitHub search found ${body.total_count} pull requests, over its 1,000` };
    items.push(...body.items);
    if (items.length >= body.total_count) break;
    if (!body.items.length)
      return { error: `GitHub search gave ${items.length} of ${body.total_count} pull requests` };
  }
  let added = 0;
  let removed = 0;
  for (const item of items) {
    const url = item?.pull_request?.url;
    if (typeof url !== "string" || !url.startsWith("https://api.github.com/"))
      return { error: `GitHub search gave an item with no pull request URL` };
    const pr = await githubFetch(url, headers, io);
    if (!pr.ok) return { error: `GitHub answered ${pr.status} for ${item.html_url}` };
    const body = await pr.json();
    if (!Number.isInteger(body?.additions) || !Number.isInteger(body?.deletions))
      return { error: `GitHub gave no line counts for ${item.html_url}` };
    added += body.additions;
    removed += body.deletions;
  }
  return { prs: items.length, added, removed };
}

/** Runs every check that applies against every site; one record per area, site and check. */
export async function runAll(
  /** @type {{ sites: Json[], areas: Json[] }} */ { sites, areas },
  /** @type {{ onlyAreas?: number[], onlySites?: string[], token?: string, log?: (line: string) => void }} */ {
    onlyAreas,
    onlySites,
    token,
    log = console.error,
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "devkit-live-"));
  try {
    return await runIn(root, { sites, areas }, { onlyAreas, onlySites, token, log });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function runIn(
  /** @type {string} */ root,
  /** @type {{ sites: Json[], areas: Json[] }} */ { sites, areas },
  /** @type {{ onlyAreas?: number[], onlySites?: string[], token?: string, log: (line: string) => void }} */ {
    onlyAreas,
    onlySites,
    token,
    log,
  },
) {
  const cache = new Map();
  const reports = new Map();
  /** @type {(() => Promise<void>)[]} */
  const jobs = [];
  /** @type {Json[]} */
  const results = [];
  for (const area of areas) {
    if (onlyAreas && !onlyAreas.includes(area.id)) continue;
    for (const site of sites) {
      if (onlySites && !onlySites.includes(site.id)) continue;
      if (area.skip?.[site.id]) continue;
      for (const check of checksFor(area, site)) {
        if (check.report) {
          if (!reports.has(check.report)) reports.set(check.report, fetchReport(check.report));
          const { report, error } = await reports.get(check.report);
          const record = {
            area: area.id,
            site: site.id,
            check: check.name,
            ref: typeof report?.ref === "string" ? report.ref.slice(0, 60) : null,
          };
          results.push({
            ...record,
            ...(error
              ? unmeasuredResult(`could not read ${check.report}: ${error}`)
              : reportedResult(report, check, site)),
          });
          continue;
        }
        const { ref, bin, error } = install(check, cache, root);
        const record = { area: area.id, site: site.id, check: check.name, ref };
        if (error) {
          results.push({ ...record, ...unmeasuredResult(`could not run: ${error}`) });
          continue;
        }
        const args = [
          "--origin",
          site.origin,
          ...(site.from ? ["--from", site.from] : []),
          ...(check.args ?? []),
          ...(check.site_args?.[site.id] ?? []),
        ];
        jobs.push(async () => {
          const result = resultOf(
            await runBin(/** @type {string} */ (bin), args, checkEnv(process.env, check, site)),
          );
          log(
            `area ${area.id} ${site.id} ${check.name}: ${result.status} (${result.errors} errors, ${result.warnings} warnings, ${result.seconds}s)`,
          );
          results.push({ ...record, ...result });
        });
      }
    }
  }
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    }),
  );
  /** @type {Json} */
  const lines = {};
  for (const area of areas)
    if (!onlyAreas || onlyAreas.includes(area.id))
      lines[area.id] = await linesFor(area.id, token).catch((error) => ({
        error: `GitHub could not be read: ${error instanceof Error ? error.message : String(error)}`,
      }));
  results.sort(
    (a, b) => a.area - b.area || a.site.localeCompare(b.site) || a.check.localeCompare(b.check),
  );
  return {
    at: new Date().toISOString(),
    public_token: !process.env.LIVE_GITHUB_TOKEN,
    results,
    lines,
  };
}
