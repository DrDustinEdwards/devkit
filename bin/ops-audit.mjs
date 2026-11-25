#!/usr/bin/env node
// The running and recovery check of a live site: its /health, its 404, and (given its repository) that the deployed commit is
// the branch head and the weekly restore drill passed. The scoreboard (live/areas.json, area 8) runs it against every site.
//
//   devkit-ops-audit --origin https://example.com [--from https://preview.example.workers.dev] [--health-path /health]
//                    [--repo owner/name] [--branch main] [--path mcp] [--drill-workflow restore-drill.yml] [--wrangler mcp/wrangler.jsonc]
//
// --from reads the site from another host. --health-path names a health route other than /health; there is no silent
// fallback. --repo compares /health's `sha` with the branch head (--branch, else the repository's default branch; with --path,
// the newest commit that touched that path, for a Worker that deploys only when its own directory changes, such as an admin
// MCP in mcp/, so a commit elsewhere in the repository is not read as a missed deploy), compares
// /health's `checks` with the bindings the repository's wrangler config declares (H5; --wrangler names the file, else the
// first of wrangler.jsonc, wrangler.json, wrangler.jsonc.example, wrangler.json.example at the root), and with
// --drill-workflow reads that workflow's newest completed run. GitHub is read without a token, or with GITHUB_TOKEN when
// set. A GitHub read that fails (401, 403, 429, a 5xx, no answer), or no --repo at all, leaves the items it would have
// proved (H4's sha, H5, R1) not measured: each is a `::notice title=<item>::<url> could not measure: <reason>`, never a
// silent pass, and the exit is 3 when nothing failed (devkit-live's contract).
//
// H5's exceptions live in the repository, in `.ops-audit.json` beside the wrangler config:
//   { "unprobed": { "EMAIL": "why it is not probed" }, "checks": { "BLOG_IMAGES": "images" } }
// `unprobed` names a binding /health does not probe, each with its reason; `checks` names the check that covers a binding
// whose check has another name. Without an entry, a check covers a binding when their names match ignoring case and
// punctuation, or one holds the other (three letters or more), and a check named for its kind (`db`, `kv`, `r2`, `queue`,
// `email`) covers the one binding of that kind.
//
// Each finding is an annotation, `::error title=<item>::<proof URL> <detail>` (or ::warning), the item one of area 8's
// checklist ids: H1-H5 health, B1 backup, C2 cron, N1/N6 the 404, N2 the /404 path, M1 maintenance left on, R1 the drill. One plain line per check says what it read,
// so a clean run never means nothing was read. Exit 0 with no errors, 1 with any, 3 with none but an item not measured,
// 2 when it could not run at all: the site answered nothing. N6 asks for the shared error page: the 404 is HTML with a
// <title> and Capsomer's ErrorPage region (class `cap-error-page`, ERROR_PAGE_MARKER).

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { escapeAnnotation, escapeProperty } from "./annotate.mjs";
import { isMain } from "../node/index.mjs";
import {
  TIMEOUT_MS,
  OUTAGE,
  WRANGLER_FILES,
  finding,
  healthFindings,
  notFoundFindings,
  explicit404Findings,
  maintenanceFindings,
  parseJsonc,
  configBindings,
  bindingFindings,
  shaFindings,
  drillFindings,
} from "./ops-audit/findings.mjs";
/** @import { Finding, Unread } from "./ops-audit/findings.mjs" */

/** A read with a timeout and no redirect followed; the error instead of a throw. @param {string} url */
async function read(url, accept = "*/*") {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { accept, "user-agent": "devkit-ops-audit" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    const header = (/** @type {string} */ name) => response.headers.get(name) ?? "";
    return {
      url,
      status: response.status,
      contentType: header("content-type"),
      cacheControl: header("cache-control"),
      robots: header("x-robots-tag"),
      location: header("location"),
      retryAfter: header("retry-after"),
      body,
    };
  } catch (error) {
    return {
      url,
      error:
        error instanceof Error
          ? error.cause instanceof Error
            ? error.cause.message
            : error.message
          : String(error),
    };
  }
}

/** One GitHub REST read; the parsed body, or the reason it could not be read. @param {string} path */
async function github(path) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "devkit-ops-audit",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok)
      return { status: response.status, error: `GitHub answered ${response.status} for ${path}` };
    return { status: response.status, body: await response.json() };
  } catch (error) {
    return {
      status: 0,
      error: `GitHub did not answer for ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * One file from a repository at a ref: its text, null when there is no such file, or the reason it could not be read.
 * @param {string} repo @param {string} path @param {string} ref
 * @returns {Promise<{ text: string | null, error?: undefined } | { error: string, text?: undefined }>}
 */
async function githubFile(repo, path, ref) {
  const headers = {
    accept: "application/vnd.github.raw+json",
    "user-agent": "devkit-ops-audit",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
  const where = `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;
  try {
    const response = await fetch(`https://api.github.com${where}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return { text: null };
    if (!response.ok) return { error: `GitHub answered ${response.status} for ${where}` };
    return { text: await response.text() };
  } catch (error) {
    return {
      error: `GitHub did not answer for ${where}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const isRead = (/** @type {any} */ r) =>
  !r.error && !(OUTAGE.has(r.status) && !/json/i.test(r.contentType));

async function main() {
  const { values } = parseArgs({
    options: {
      origin: { type: "string" },
      from: { type: "string" },
      "health-path": { type: "string", default: "/health" },
      repo: { type: "string" },
      branch: { type: "string" },
      "drill-workflow": { type: "string" },
      wrangler: { type: "string" },
      path: { type: "string" },
    },
  });
  if (
    !values.origin ||
    ((values["drill-workflow"] || values.wrangler || values.path) && !values.repo) ||
    (values.repo && !/^[\w.-]+\/[\w.-]+$/.test(values.repo))
  ) {
    console.error(
      "usage: devkit-ops-audit --origin https://example.com [--from https://preview.example] [--health-path /health] [--repo owner/name [--branch main] [--path dir] [--drill-workflow restore-drill.yml] [--wrangler wrangler.jsonc]]",
    );
    process.exit(2);
  }
  const base = (values.from ?? values.origin).replace(/\/$/, "");
  const healthPath = values["health-path"].startsWith("/")
    ? values["health-path"]
    : `/${values["health-path"]}`;
  /** @type {Finding[]} */
  const findings = [];
  const say = (/** @type {string} */ line) => console.log(`devkit-ops-audit: ${line}`);
  /** @type {Unread[]} An item a failed GitHub read left unmeasured: never a pass or a failure. */
  const unread = [];

  const [health, missing, home, explicit] = await Promise.all([
    read(`${base}${healthPath}`, "application/health+json, application/json"),
    read(`${base}/${randomUUID()}`, "text/html"),
    read(`${base}/`, "text/html"),
    read(`${base}/404`, "text/html"),
  ]);
  if (!isRead(health) && !isRead(missing)) {
    console.error(
      `devkit-ops-audit: ${base} did not answer: ${health.error ?? health.status}, ${missing.error ?? missing.status}`,
    );
    process.exit(2);
  }

  /** @type {any} */
  let body = null;
  if (health.error) {
    findings.push(finding("error", "H1", health.url, `no answer: ${health.error}`));
    say(`health: ${health.url} did not answer (${health.error})`);
  } else {
    const result = healthFindings(/** @type {any} */ (health));
    findings.push(...result.findings);
    body = result.health;
    say(
      `health: ${health.url} answered ${health.status} ${health.contentType || "(no Content-Type)"}, Cache-Control '${health.cacheControl}', X-Robots-Tag '${health.robots}'`,
    );
    say(
      body
        ? `health body: status ${body.status}, ok ${body.ok}, sha ${body.sha ?? "none"}, ${Array.isArray(body.checks) ? `${body.checks.length} checks` : "no checks"}`
        : "health body: not JSON",
    );
    say(
      body?.backup
        ? `backup: age_hours ${body.backup.age_hours}, last_ok ${body.backup.last_ok}${body.backup.warning ? ", with a warning" : ""}`
        : "backup: not reported",
    );
    const cron = Array.isArray(body?.checks)
      ? body.checks.find((/** @type {any} */ c) => c?.name === "cron")
      : undefined;
    say(cron ? `cron: ${cron.status}` : "cron: not reported");
  }

  if (missing.error) {
    findings.push(finding("error", "N1", missing.url, `no answer: ${missing.error}`));
    say(`404: ${missing.url} did not answer (${missing.error})`);
  } else {
    const pages = !!home.error || /^text\/html\b/i.test(home.contentType ?? "");
    findings.push(...notFoundFindings({ .../** @type {any} */ (missing), pages }));
    say(
      `404: ${missing.url} answered ${missing.status} ${missing.contentType || "(no Content-Type)"}${pages ? "" : `; the home page is '${home.contentType || "no Content-Type"}', so no HTML 404 is asked`}`,
    );
  }

  if (!explicit.error) {
    findings.push(...explicit404Findings(/** @type {any} */ (explicit)));
    say(`/404: ${explicit.url} answered ${explicit.status}`);
  } else {
    // A /404 that does not answer proves nothing about N2: said as a notice, never a pass.
    unread.push({ item: "N2", url: explicit.url, reason: explicit.error });
    say(`/404: ${explicit.url} did not answer: ${explicit.error}`);
  }
  if (!home.error) {
    findings.push(...maintenanceFindings(/** @type {any} */ (home)));
    say(
      `maintenance: the home page answered ${home.status}${home.retryAfter ? " with Retry-After" : ""}`,
    );
  }

  const repoItems = ["H4", "H5", ...(values["drill-workflow"] ? ["R1"] : [])];
  if (!values.repo) {
    // Without the repository the deployed commit, the bindings and the drill are not measured, and the run says so.
    for (const item of ["H4", "H5", "R1"])
      unread.push({ item, url: health.url, reason: "no --repo, so the repository was not read" });
  } else {
    const repo = await github(`/repos/${values.repo}`);
    if (repo.error) {
      const reason =
        repo.status === 404 ? `${repo.error}; a private repository needs GITHUB_TOKEN` : repo.error;
      for (const item of repoItems)
        unread.push({ item, url: `https://github.com/${values.repo}`, reason });
      say(`github: ${repo.error}`);
    } else {
      const branch = values.branch ?? repo.body.default_branch;
      let head;
      if (values.path) {
        // The newest commit on the branch that touched the path: a Worker that deploys on its own directory's changes is not behind a commit elsewhere.
        const list = await github(
          `/repos/${values.repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(values.path)}&per_page=1`,
        );
        head = list.error
          ? list
          : list.body[0]
            ? { body: list.body[0] }
            : { error: `${values.repo}@${branch} has no commit touching ${values.path}` };
      } else head = await github(`/repos/${values.repo}/commits/${encodeURIComponent(branch)}`);
      if (head.error) {
        unread.push({ item: "H4", url: health.url, reason: head.error });
        say(`branch head: ${head.error}`);
      } else {
        const date = head.body.commit.committer?.date ?? head.body.commit.author?.date;
        say(
          `branch head: ${values.repo}@${branch}${values.path ? ` (${values.path})` : ""} is ${head.body.sha}, committed ${date}`,
        );
        if (body && /^[0-9a-f]{7,40}$/i.test(String(body.sha ?? ""))) {
          const behind = !head.body.sha.toLowerCase().startsWith(String(body.sha).toLowerCase());
          const compare = behind
            ? await github(`/repos/${values.repo}/compare/${head.body.sha}...${body.sha}`)
            : undefined;
          findings.push(
            ...shaFindings({
              url: health.url,
              liveSha: body.sha,
              head: { sha: head.body.sha, date, url: head.body.html_url },
              liveContainsHead: ["ahead", "identical"].includes(compare?.body?.status),
            }),
          );
        }
      }
      if (values["drill-workflow"]) {
        const file = values["drill-workflow"];
        const page = `https://github.com/${values.repo}/actions/workflows/${file}`;
        const runs = await github(
          `/repos/${values.repo}/actions/workflows/${encodeURIComponent(file)}/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=1`,
        );
        if (runs.status === 404) {
          findings.push(finding("error", "R1", page, `${values.repo} has no workflow ${file}`));
          say(`drill: ${values.repo} has no workflow ${file}`);
        } else if (runs.error) {
          unread.push({ item: "R1", url: page, reason: runs.error });
          say(`drill: ${runs.error}`);
        } else {
          const run = runs.body.workflow_runs[0];
          say(
            run
              ? `drill: newest completed run of ${file} on ${branch} ${run.conclusion}, ${run.created_at} (${run.html_url})`
              : `drill: ${file} has no completed run on ${branch}`,
          );
          findings.push(...drillFindings({ url: page, run }));
        }
      }
      await bindingCheck({
        repo: values.repo,
        branch,
        path: values.wrangler,
        health: body,
        healthUrl: health.url,
        findings,
        unread,
        say,
      });
    }
  }

  for (const f of findings)
    console.log(
      `::${f.severity} title=${escapeProperty(f.item)}::${escapeAnnotation(`${f.url} ${f.detail}`)}`,
    );
  // devkit-live's contract: an item that could not be measured is a notice that says so, and exit 3 when nothing failed.
  for (const u of unread)
    console.log(
      `::notice title=${escapeProperty(u.item)}::${escapeAnnotation(`${u.url} could not measure: ${u.reason}`)}`,
    );
  const errors = findings.filter((f) => f.severity === "error").length;
  say(
    `${errors} errors, ${findings.length - errors} warnings, ${unread.length} not measured on ${base}.`,
  );
  process.exit(errors ? 1 : unread.length ? 3 : 0);
}

/**
 * H5 against the repository: reads the wrangler config (the named one, else the first root config that exists) and the
 * `.ops-audit.json` beside it, and compares the bindings with /health's checks.
 * @param {{ repo: string, branch: string, path?: string, health: any, healthUrl: string, findings: Finding[], unread: Unread[], say: (line: string) => void }} run
 */
async function bindingCheck({ repo, branch, path, health, healthUrl, findings, unread: all, say }) {
  const unread = {
    push: (/** @type {string} */ reason) =>
      all.push({ item: "H5", url: `https://github.com/${repo}`, reason }),
  };
  let file = path;
  let text = null;
  for (const candidate of path ? [path] : WRANGLER_FILES) {
    const read = await githubFile(repo, candidate, branch);
    if (read.error !== undefined)
      return (void unread.push(read.error), say(`bindings: ${read.error}`));
    if (read.text !== null) {
      file = candidate;
      text = read.text;
      break;
    }
  }
  const configUrl = `https://github.com/${repo}/blob/${branch}/${file ?? ""}`;
  if (text === null || !file) {
    if (path) unread.push(`${repo} has no ${path} on ${branch}`);
    say(
      path
        ? `bindings: ${repo} has no ${path}`
        : `bindings: no wrangler config at the root of ${repo} (${WRANGLER_FILES.join(", ")}); name it with --wrangler`,
    );
    if (!path) unread.push(`no wrangler config at the root of ${repo}`);
    return;
  }
  let bindings;
  try {
    bindings = configBindings(parseJsonc(text));
  } catch (error) {
    unread.push(
      `${configUrl} is not JSON or JSONC: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
  const extra = await githubFile(repo, `${dir}.ops-audit.json`, branch);
  if (extra.error !== undefined) return void unread.push(extra.error);
  let exempt = {};
  if (extra.text !== null) {
    try {
      exempt = JSON.parse(extra.text) ?? {};
    } catch {
      findings.push(
        finding(
          "error",
          "H5",
          `https://github.com/${repo}/blob/${branch}/${dir}.ops-audit.json`,
          ".ops-audit.json is not JSON",
        ),
      );
    }
  }
  const checks = Array.isArray(health?.checks)
    ? health.checks.filter((/** @type {any} */ c) => typeof c?.name === "string")
    : [];
  say(
    `bindings: ${file} declares ${bindings.length ? bindings.map((b) => b.name).join(", ") : "none /health can probe"}; /health checks ${checks.map((/** @type {any} */ c) => c.name).join(", ") || "nothing"}${extra.text !== null ? `; ${dir}.ops-audit.json read` : ""}`,
  );
  if (!health) return;
  findings.push(...bindingFindings({ url: healthUrl, configUrl, bindings, checks, exempt }));
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (isMain(import.meta.url)) await main();
