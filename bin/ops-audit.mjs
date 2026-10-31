#!/usr/bin/env node
// The running and recovery check of a live site: its /health, its 404, and (given its repository) that the deployed commit is
// the branch head and the weekly restore drill passed. The scoreboard (live/areas.json, area 8) runs it against every site.
//
//   devkit-ops-audit --origin https://example.com [--from https://preview.example.workers.dev] [--health-path /health]
//                    [--repo owner/name] [--branch main] [--drill-workflow restore-drill.yml]
//
// --from reads the site from another host. --health-path names a health route other than /health; there is no silent
// fallback. --repo compares /health's `sha` with the branch head (--branch, else the repository's default branch) and, with
// --drill-workflow, reads that workflow's newest completed run. GitHub is read without a token, or with GITHUB_TOKEN when set.
//
// Each finding is an annotation, `::error title=<item>::<proof URL> <detail>` (or ::warning), the item one of area 8's
// checklist ids: H1-H4 health, B1 backup, C2 cron, N1/N6 the 404, R1 the drill. One plain line per check says what it read,
// so a clean run never means nothing was read. Exit 0 with no errors, 1 with any, 2 when nothing could be read at all.

import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const TIMEOUT_MS = 15_000;
const STATUSES = ["pass", "warn", "fail"];
const BACKUP_MAX_HOURS = 26;
const DEPLOY_GRACE_MINUTES = 30;
const DRILL_MAX_DAYS = 8;
// A gateway's answer when the Worker is not answering at all (Cloudflare's 52x pages among them): nothing was read.
const OUTAGE = new Set([502, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

/** @typedef {{ severity: "error" | "warning", item: string, url: string, detail: string }} Finding */

const finding = (/** @type {Finding["severity"]} */ severity, /** @type {string} */ item, /** @type {string} */ url, /** @type {string} */ detail) => ({ severity, item, url, detail });

/**
 * H1-H4, B1 and C2 from one read of the health route. `sha` is checked for its form here; against the branch in shaFindings.
 * @param {{ url: string, status: number, contentType: string, cacheControl: string, robots: string, body: string }} read
 * @returns {{ findings: Finding[], health: any }}
 */
export function healthFindings({ url, status, contentType, cacheControl, robots, body }) {
  /** @type {Finding[]} */
  const findings = [];
  const h1 = [];
  if (!(status >= 200 && status < 300) && status !== 503) h1.push(`answers ${status}, not 2xx or 503`);
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type !== "application/health+json" && type !== "application/json") h1.push(`Content-Type is '${contentType || "none"}', not application/health+json or application/json`);
  if (!/(^|,)\s*no-store\s*(,|$)/i.test(cacheControl)) h1.push(`Cache-Control is '${cacheControl || "none"}', without no-store`);
  if (!/\bnoindex\b/i.test(robots)) h1.push(`X-Robots-Tag is '${robots || "none"}', without noindex`);
  let health = null;
  try {
    health = JSON.parse(body);
  } catch {
    h1.push("the body is not JSON");
  }
  if (h1.length) findings.push(finding("error", "H1", url, h1.join("; ")));
  if (!health || typeof health !== "object" || Array.isArray(health)) return { findings, health: null };

  const missing = [];
  if (!STATUSES.includes(health.status)) missing.push(health.status === undefined ? "status" : `status (is '${health.status}', not pass, warn or fail)`);
  if (typeof health.ok !== "boolean") missing.push("ok");
  if (typeof health.time !== "string" || Number.isNaN(Date.parse(health.time))) missing.push("time");
  if (!Array.isArray(health.checks)) missing.push("checks");
  else if (!health.checks.every((c) => typeof c?.name === "string" && STATUSES.includes(c.status))) missing.push("a name and a pass, warn or fail status on every checks entry");
  if (missing.length) {
    const old = health.status === undefined ? " (the old shape: site-runtime's health gives { status, ok, time, checks: [{ name, status }] })" : "";
    findings.push(finding("error", "H2", url, `the body does not carry ${missing.join(", ")}${old}`));
  }

  if (status === 503 && STATUSES.includes(health.status) && health.status !== "fail") findings.push(finding("error", "H3", url, `answers 503 with status ${health.status}; 503 is for fail only`));
  if (status >= 200 && status < 300 && health.status === "fail") findings.push(finding("error", "H3", url, `answers ${status} with status fail; fail answers 503`));

  if (health.sha === undefined) findings.push(finding("error", "H4", url, "no sha, so the deployed commit cannot be read"));
  else if (!/^[0-9a-f]{7,40}$/i.test(String(health.sha))) findings.push(finding("error", "H4", url, `sha '${health.sha}' is not 7 to 40 hex characters`));

  if (health.backup !== undefined) {
    const age = health.backup?.age_hours;
    if (typeof age !== "number" || age >= BACKUP_MAX_HOURS) findings.push(finding("error", "B1", url, `the newest complete backup is ${typeof age === "number" ? `${age} hours old` : "unknown (no age_hours)"}, not under ${BACKUP_MAX_HOURS}`));
    else if (health.backup.warning) findings.push(finding("warning", "B1", url, `backup warning: ${health.backup.warning}`));
  }

  const cron = Array.isArray(health.checks) ? health.checks.find((c) => c?.name === "cron") : undefined;
  if (cron && cron.status !== "pass") findings.push(finding("warning", "C2", url, `the cron check is ${cron.status}${cron.detail ? `: ${cron.detail}` : ""}`));
  return { findings, health };
}

/**
 * N1 and N6 from one read of a path that does not exist.
 * @param {{ url: string, status: number, contentType: string, location: string }} read
 * @returns {Finding[]}
 */
export function notFoundFindings({ url, status, contentType, location }) {
  if (status >= 300 && status < 400) return [finding("error", "N1", url, `a missing page redirects (${status}) to ${location || "nowhere named"} instead of answering 404`)];
  if (status !== 404) return [finding("error", "N1", url, `a missing page answers ${status}, not 404`)];
  if (!/^text\/html\b/i.test(contentType)) return [finding("error", "N6", url, `the 404 is '${contentType || "no Content-Type"}', not an HTML page`)];
  return [];
}

/**
 * H4 against the branch: the live sha must be the head. A head younger than the grace may still be deploying.
 * @param {{ url: string, liveSha: string, head: { sha: string, date: string, url: string }, now?: number }} read
 * @returns {Finding[]}
 */
export function shaFindings({ url, liveSha, head, now = Date.now() }) {
  const live = String(liveSha).toLowerCase();
  const sha = head.sha.toLowerCase();
  if (sha.startsWith(live) || live.startsWith(sha)) return [];
  const minutes = Math.round((now - Date.parse(head.date)) / 60_000);
  const severity = minutes > DEPLOY_GRACE_MINUTES ? "error" : "warning";
  return [finding(severity, "H4", url, `serves ${live}, not the branch head ${sha} (${head.url}), committed ${minutes} minutes ago`)];
}

/**
 * R1 from the drill workflow's newest completed run on the branch, or none.
 * @param {{ url: string, run: { conclusion: string, created_at: string, html_url: string } | undefined, now?: number }} read
 * @returns {Finding[]}
 */
export function drillFindings({ url, run, now = Date.now() }) {
  if (!run) return [finding("error", "R1", url, "the restore drill has no completed run on the branch")];
  const days = (now - Date.parse(run.created_at)) / 86_400_000;
  if (run.conclusion !== "success") return [finding("error", "R1", run.html_url, `the newest restore drill ended ${run.conclusion}`)];
  if (days >= DRILL_MAX_DAYS) return [finding("error", "R1", run.html_url, `the newest restore drill passed ${days.toFixed(1)} days ago, not within ${DRILL_MAX_DAYS}`)];
  return [];
}

/** A read with a timeout and no redirect followed; the error instead of a throw. @param {string} url */
async function read(url, accept = "*/*") {
  try {
    const response = await fetch(url, { redirect: "manual", headers: { accept, "user-agent": "devkit-ops-audit" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await response.text();
    const header = (/** @type {string} */ name) => response.headers.get(name) ?? "";
    return { url, status: response.status, contentType: header("content-type"), cacheControl: header("cache-control"), robots: header("x-robots-tag"), location: header("location"), body };
  } catch (error) {
    return { url, error: error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error) };
  }
}

/** One GitHub REST read; the parsed body, or the reason it could not be read. @param {string} path */
async function github(path) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "devkit-ops-audit", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  try {
    const response = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return { status: response.status, error: `GitHub answered ${response.status} for ${path}` };
    return { status: response.status, body: await response.json() };
  } catch (error) {
    return { status: 0, error: `GitHub did not answer for ${path}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const isRead = (/** @type {any} */ r) => !r.error && !(OUTAGE.has(r.status) && !/json/i.test(r.contentType));

async function main() {
  const { values } = parseArgs({
    options: {
      origin: { type: "string" },
      from: { type: "string" },
      "health-path": { type: "string", default: "/health" },
      repo: { type: "string" },
      branch: { type: "string" },
      "drill-workflow": { type: "string" },
    },
  });
  if (!values.origin || (values["drill-workflow"] && !values.repo) || (values.repo && !/^[\w.-]+\/[\w.-]+$/.test(values.repo))) {
    console.error("usage: devkit-ops-audit --origin https://example.com [--from https://preview.example] [--health-path /health] [--repo owner/name [--branch main] [--drill-workflow restore-drill.yml]]");
    process.exit(2);
  }
  const base = (values.from ?? values.origin).replace(/\/$/, "");
  const healthPath = values["health-path"].startsWith("/") ? values["health-path"] : `/${values["health-path"]}`;
  /** @type {Finding[]} */
  const findings = [];
  const say = (/** @type {string} */ line) => console.log(`devkit-ops-audit: ${line}`);

  const [health, missing] = await Promise.all([read(`${base}${healthPath}`, "application/health+json, application/json"), read(`${base}/${randomUUID()}`, "text/html")]);
  if (!isRead(health) && !isRead(missing)) {
    console.error(`devkit-ops-audit: ${base} did not answer: ${health.error ?? health.status}, ${missing.error ?? missing.status}`);
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
    say(`health: ${health.url} answered ${health.status} ${health.contentType || "(no Content-Type)"}, Cache-Control '${health.cacheControl}', X-Robots-Tag '${health.robots}'`);
    say(body ? `health body: status ${body.status}, ok ${body.ok}, sha ${body.sha ?? "none"}, ${Array.isArray(body.checks) ? `${body.checks.length} checks` : "no checks"}` : "health body: not JSON");
    say(body?.backup ? `backup: age_hours ${body.backup.age_hours}, last_ok ${body.backup.last_ok}${body.backup.warning ? ", with a warning" : ""}` : "backup: not reported");
    const cron = Array.isArray(body?.checks) ? body.checks.find((/** @type {any} */ c) => c?.name === "cron") : undefined;
    say(cron ? `cron: ${cron.status}` : "cron: not reported");
  }

  if (missing.error) {
    findings.push(finding("error", "N1", missing.url, `no answer: ${missing.error}`));
    say(`404: ${missing.url} did not answer (${missing.error})`);
  } else {
    findings.push(...notFoundFindings(/** @type {any} */ (missing)));
    say(`404: ${missing.url} answered ${missing.status} ${missing.contentType || "(no Content-Type)"}`);
  }

  if (values.repo) {
    const repo = await github(`/repos/${values.repo}`);
    if (repo.error) {
      findings.push(finding("warning", "H4", `https://github.com/${values.repo}`, repo.status === 404 ? `${repo.error}; a private repository needs GITHUB_TOKEN` : repo.error));
      say(`github: ${repo.error}`);
    } else {
      const branch = values.branch ?? repo.body.default_branch;
      const head = await github(`/repos/${values.repo}/commits/${encodeURIComponent(branch)}`);
      if (head.error) {
        findings.push(finding("warning", "H4", `https://github.com/${values.repo}/tree/${branch}`, head.error));
        say(`branch head: ${head.error}`);
      } else {
        const date = head.body.commit.committer?.date ?? head.body.commit.author?.date;
        say(`branch head: ${values.repo}@${branch} is ${head.body.sha}, committed ${date}`);
        if (body && /^[0-9a-f]{7,40}$/i.test(String(body.sha ?? ""))) findings.push(...shaFindings({ url: health.url, liveSha: body.sha, head: { sha: head.body.sha, date, url: head.body.html_url } }));
      }
      if (values["drill-workflow"]) {
        const file = values["drill-workflow"];
        const page = `https://github.com/${values.repo}/actions/workflows/${file}`;
        const runs = await github(`/repos/${values.repo}/actions/workflows/${encodeURIComponent(file)}/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=1`);
        if (runs.status === 404) {
          findings.push(finding("error", "R1", page, `${values.repo} has no workflow ${file}`));
          say(`drill: ${values.repo} has no workflow ${file}`);
        } else if (runs.error) {
          findings.push(finding("warning", "R1", page, runs.error));
          say(`drill: ${runs.error}`);
        } else {
          const run = runs.body.workflow_runs[0];
          say(run ? `drill: newest completed run of ${file} on ${branch} ${run.conclusion}, ${run.created_at} (${run.html_url})` : `drill: ${file} has no completed run on ${branch}`);
          findings.push(...drillFindings({ url: page, run }));
        }
      }
    }
  }

  for (const f of findings) console.log(`::${f.severity} title=${f.item}::${f.url} ${f.detail}`);
  const errors = findings.filter((f) => f.severity === "error").length;
  say(`${errors} errors, ${findings.length - errors} warnings on ${base}.`);
  process.exit(errors ? 1 : 0);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
