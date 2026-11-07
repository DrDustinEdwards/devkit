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
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { escapeAnnotation, escapeProperty } from "./annotate.mjs";
const TIMEOUT_MS = 15_000;
const STATUSES = ["pass", "warn", "fail"];
const BACKUP_MAX_HOURS = 26;
const DEPLOY_GRACE_MINUTES = 30;
const DRILL_MAX_DAYS = 8;
// A gateway's answer when the Worker is not answering at all (Cloudflare's 52x pages among them): nothing was read.
const OUTAGE = new Set([502, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

/** The class Capsomer's ErrorPage puts on its region (components/error-page): the shared error page's marker. */
export const ERROR_PAGE_MARKER = "cap-error-page";
/** The root wrangler configs read when --wrangler is not given, in order. */
const WRANGLER_FILES = [
  "wrangler.jsonc",
  "wrangler.json",
  "wrangler.jsonc.example",
  "wrangler.json.example",
];

/** @typedef {{ severity: "error" | "warning", item: string, url: string, detail: string }} Finding */
/** @typedef {{ item: string, url: string, reason: string }} Unread */

/** @typedef {{ name?: unknown, status?: string, detail?: string }} HealthCheck One entry of /health's `checks`, as read. */

const finding = (
  /** @type {Finding["severity"]} */ severity,
  /** @type {string} */ item,
  /** @type {string} */ url,
  /** @type {string} */ detail,
) => ({ severity, item, url, detail });

/**
 * H1-H4, B1 and C2 from one read of the health route. `sha` is checked for its form here; against the branch in shaFindings.
 * @param {{ url: string, status: number, contentType: string, cacheControl: string, robots: string, body: string }} read
 * @returns {{ findings: Finding[], health: any }}
 */
export function healthFindings({ url, status, contentType, cacheControl, robots, body }) {
  /** @type {Finding[]} */
  const findings = [];
  const h1 = [];
  if (!(status >= 200 && status < 300) && status !== 503)
    h1.push(`answers ${status}, not 2xx or 503`);
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type !== "application/health+json" && type !== "application/json")
    h1.push(
      `Content-Type is '${contentType || "none"}', not application/health+json or application/json`,
    );
  if (!/(^|,)\s*no-store\s*(,|$)/i.test(cacheControl))
    h1.push(`Cache-Control is '${cacheControl || "none"}', without no-store`);
  if (!/\bnoindex\b/i.test(robots))
    h1.push(`X-Robots-Tag is '${robots || "none"}', without noindex`);
  let health = null;
  try {
    health = JSON.parse(body);
  } catch {
    h1.push("the body is not JSON");
  }
  if (h1.length) findings.push(finding("error", "H1", url, h1.join("; ")));
  if (!health || typeof health !== "object" || Array.isArray(health))
    return { findings, health: null };

  const missing = [];
  if (!STATUSES.includes(health.status))
    missing.push(
      health.status === undefined
        ? "status"
        : `status (is '${health.status}', not pass, warn or fail)`,
    );
  if (typeof health.ok !== "boolean") missing.push("ok");
  if (typeof health.time !== "string" || Number.isNaN(Date.parse(health.time)))
    missing.push("time");
  if (!Array.isArray(health.checks)) missing.push("checks");
  else if (
    !health.checks.every(
      (/** @type {HealthCheck | null} */ c) =>
        typeof c?.name === "string" && typeof c.status === "string" && STATUSES.includes(c.status),
    )
  )
    missing.push("a name and a pass, warn or fail status on every checks entry");
  if (missing.length) {
    const old =
      health.status === undefined
        ? " (the old shape: site-runtime's health gives { status, ok, time, checks: [{ name, status }] })"
        : "";
    findings.push(
      finding("error", "H2", url, `the body does not carry ${missing.join(", ")}${old}`),
    );
  }

  if (status === 503 && STATUSES.includes(health.status) && health.status !== "fail")
    findings.push(
      finding("error", "H3", url, `answers 503 with status ${health.status}; 503 is for fail only`),
    );
  if (status >= 200 && status < 300 && health.status === "fail")
    findings.push(
      finding("error", "H3", url, `answers ${status} with status fail; fail answers 503`),
    );

  if (health.sha === undefined)
    findings.push(finding("error", "H4", url, "no sha, so the deployed commit cannot be read"));
  else if (!/^[0-9a-f]{7,40}$/i.test(String(health.sha)))
    findings.push(finding("error", "H4", url, `sha '${health.sha}' is not 7 to 40 hex characters`));

  if (health.backup !== undefined) {
    const age = health.backup?.age_hours;
    if (typeof age !== "number" || age >= BACKUP_MAX_HOURS)
      findings.push(
        finding(
          "error",
          "B1",
          url,
          `the newest complete backup is ${typeof age === "number" ? `${age} hours old` : "unknown (no age_hours)"}, not under ${BACKUP_MAX_HOURS}`,
        ),
      );
    else if (health.backup.warning)
      findings.push(finding("warning", "B1", url, `backup warning: ${health.backup.warning}`));
  }

  const cron = Array.isArray(health.checks)
    ? health.checks.find((/** @type {HealthCheck | null} */ c) => c?.name === "cron")
    : undefined;
  if (cron && cron.status !== "pass")
    findings.push(
      finding(
        "warning",
        "C2",
        url,
        `the cron check is ${cron.status}${cron.detail ? `: ${cron.detail}` : ""}`,
      ),
    );
  return { findings, health };
}

/**
 * N1 and N6 from one read of a path that does not exist. N6 holds only where the home page is HTML: an API or MCP Worker
 * that serves no pages answers its 404 in its own type. The page must be the shared error page: a `<title>` with words in
 * it and an element whose class list holds ERROR_PAGE_MARKER, which Capsomer's ErrorPage renders.
 * @param {{ url: string, status: number, contentType: string, location: string, body?: string, pages?: boolean }} read
 * @returns {Finding[]}
 */
export function notFoundFindings({ url, status, contentType, location, body = "", pages = true }) {
  if (status >= 300 && status < 400)
    return [
      finding(
        "error",
        "N1",
        url,
        `a missing page redirects (${status}) to ${location || "nowhere named"} instead of answering 404`,
      ),
    ];
  if (status !== 404)
    return [finding("error", "N1", url, `a missing page answers ${status}, not 404`)];
  if (!pages) return [];
  if (!/^text\/html\b/i.test(contentType))
    return [
      finding(
        "error",
        "N6",
        url,
        `the 404 is '${contentType || "no Content-Type"}', not an HTML page`,
      ),
    ];
  const lacks = [];
  if (!/<title(?:\s[^>]*)?>[^<]*\S[^<]*<\/title>/i.test(body))
    lacks.push("a <title> with words in it");
  if (
    !new RegExp(
      `\\sclass\\s*=\\s*["']?(?:[^"'>]*\\s)?${ERROR_PAGE_MARKER}(?:[\\s"'>]|$)`,
      "i",
    ).test(body)
  )
    lacks.push(`the shared error page (Capsomer's ErrorPage, class ${ERROR_PAGE_MARKER})`);
  return lacks.length
    ? [finding("error", "N6", url, `the 404 page lacks ${lacks.join(" and ")}`)]
    : [];
}

/**
 * N2: the path /404 itself answers an error, not 200. A static site once served its own /404 page with a 200, which a crawler
 * reads as a real page; any 2xx is a finding, a redirect or a refusal (a site behind sign-in) is not.
 * @param {{ url: string, status: number }} read
 * @returns {Finding[]}
 */
export function explicit404Findings({ url, status }) {
  return status >= 200 && status < 300
    ? [finding("error", "N2", url, `the /404 path answers ${status}, not 404`)]
    : [];
}

/**
 * M1: the home page answers 503 with Retry-After, which is the shared maintenance page (site-runtime `./maintenance`). The
 * MAINTENANCE variable is meant to be on for a short time, so a site found in it is a warning, not a failure.
 * @param {{ url: string, status: number, retryAfter?: string }} read
 * @returns {Finding[]}
 */
export function maintenanceFindings({ url, status, retryAfter = "" }) {
  return status === 503 && retryAfter
    ? [
        finding(
          "warning",
          "M1",
          url,
          "the home page answers the maintenance page (503 with Retry-After): MAINTENANCE is on",
        ),
      ]
    : [];
}

/**
 * A wrangler config's JSON with its comments and trailing commas taken out, strings left alone.
 * @param {string} text
 * @returns {any}
 */
export function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * The bindings a wrangler config declares that /health can probe, at its top level (an `env` block is another Worker's).
 * Variables, secrets, static assets, version metadata and rate limits are not probed and not listed.
 * @param {any} config
 * @returns {{ name: string, kind: string }[]}
 */
export function configBindings(config) {
  /** @type {{ name: string, kind: string }[]} */
  const out = [];
  const list = (
    /** @type {unknown} */ value,
    /** @type {string} */ kind,
    /** @type {string} */ key = "binding",
  ) => {
    if (Array.isArray(value))
      for (const entry of value)
        if (typeof entry?.[key] === "string") out.push({ name: entry[key], kind });
  };
  list(config.d1_databases, "d1");
  list(config.r2_buckets, "r2");
  list(config.kv_namespaces, "kv");
  list(config.durable_objects?.bindings, "durable_object", "name");
  list(config.queues?.producers, "queue");
  list(config.services, "service");
  list(config.send_email, "send_email", "name");
  list(config.vectorize, "vectorize");
  list(config.hyperdrive, "hyperdrive");
  list(config.analytics_engine_datasets, "analytics_engine");
  list(config.workflows, "workflow");
  list(config.dispatch_namespaces, "dispatch_namespace");
  for (const kind of ["ai", "images", "browser"])
    if (typeof config[kind]?.binding === "string") out.push({ name: config[kind].binding, kind });
  return out;
}

/** A check named for its kind (`db`, `kv`, `email`) covers the one binding of that kind. */
const KIND_CHECKS = /** @type {Record<string, string[]>} */ ({
  d1: ["db", "d1", "database"],
  kv: ["kv"],
  r2: ["r2"],
  queue: ["queue"],
  send_email: ["email"],
});

const plain = (/** @type {string} */ name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * H5: every probe-able binding the config declares has a check on /health, or an entry in the repository's exceptions.
 * One finding names every binding without one. An exception with no reason, or for a binding the config does not
 * declare, is an error too, so the list stays true.
 * @param {{ url: string, configUrl: string, bindings: { name: string, kind: string }[], checks: { name: string }[], exempt?: { unprobed?: Record<string, string>, checks?: Record<string, string> } }} read
 * @returns {Finding[]}
 */
export function bindingFindings({ url, configUrl, bindings, checks, exempt = {} }) {
  /** @type {Finding[]} */
  const findings = [];
  const unprobed = exempt.unprobed ?? {};
  const named = exempt.checks ?? {};
  const names = checks.map((c) => c.name);
  const covered = (/** @type {{ name: string, kind: string }} */ b) => {
    if (Object.hasOwn(named, b.name)) return names.includes(named[b.name]);
    const want = plain(b.name);
    const lone = bindings.filter((other) => other.kind === b.kind).length === 1;
    if (lone && (KIND_CHECKS[b.kind] ?? []).some((n) => names.includes(n))) return true;
    return names.some((n) => {
      const have = plain(n);
      const [short, long] = have.length < want.length ? [have, want] : [want, have];
      return have === want || (short.length >= 3 && long.includes(short));
    });
  };
  const missing = bindings.filter((b) => !Object.hasOwn(unprobed, b.name) && !covered(b));
  if (missing.length)
    findings.push(
      finding(
        "error",
        "H5",
        url,
        `no check on /health probes ${missing.map((b) => `${b.name} (${b.kind})`).join(", ")}, declared in ${configUrl}; probe each, or name it in .ops-audit.json's unprobed with the reason`,
      ),
    );
  const declared = new Set(bindings.map((b) => b.name));
  for (const [name, reason] of Object.entries(unprobed)) {
    if (typeof reason !== "string" || !reason.trim())
      findings.push(
        finding(
          "error",
          "H5",
          configUrl,
          `.ops-audit.json leaves ${name} unprobed without a reason`,
        ),
      );
    else if (!declared.has(name))
      findings.push(
        finding(
          "warning",
          "H5",
          configUrl,
          `.ops-audit.json leaves ${name} unprobed, but the config declares no such binding`,
        ),
      );
  }
  for (const [name, check] of Object.entries(named))
    if (declared.has(name) && !names.includes(check))
      findings.push(
        finding(
          "error",
          "H5",
          url,
          `.ops-audit.json says the check ${check} covers ${name}, and /health has no such check`,
        ),
      );
  return findings;
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
  return [
    finding(
      severity,
      "H4",
      url,
      `serves ${live}, not the branch head ${sha} (${head.url}), committed ${minutes} minutes ago`,
    ),
  ];
}

/**
 * R1 from the drill workflow's newest completed run on the branch, or none.
 * @param {{ url: string, run: { conclusion: string, created_at: string, html_url: string } | undefined, now?: number }} read
 * @returns {Finding[]}
 */
export function drillFindings({ url, run, now = Date.now() }) {
  if (!run)
    return [finding("error", "R1", url, "the restore drill has no completed run on the branch")];
  const days = (now - Date.parse(run.created_at)) / 86_400_000;
  if (run.conclusion !== "success")
    return [
      finding("error", "R1", run.html_url, `the newest restore drill ended ${run.conclusion}`),
    ];
  // A date that does not parse is NaN, and NaN is below every limit: it must not read as a recent drill.
  if (!Number.isFinite(days))
    return [
      finding(
        "error",
        "R1",
        run.html_url,
        `the newest restore drill has no readable date (created_at ${run.created_at})`,
      ),
    ];
  if (days >= DRILL_MAX_DAYS)
    return [
      finding(
        "error",
        "R1",
        run.html_url,
        `the newest restore drill passed ${days.toFixed(1)} days ago, not within ${DRILL_MAX_DAYS}`,
      ),
    ];
  return [];
}

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
        if (body && /^[0-9a-f]{7,40}$/i.test(String(body.sha ?? "")))
          findings.push(
            ...shaFindings({
              url: health.url,
              liveSha: body.sha,
              head: { sha: head.body.sha, date, url: head.body.html_url },
            }),
          );
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
      exempt = JSON.parse(extra.text);
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
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  await main();
