#!/usr/bin/env node
// The completeness scoreboard: every area of the shared code (live/areas.json) on every live site (live/sites.json), filled
// only from the live checks and the verifiers' verdicts, never from the thread that built the area.
//
//   devkit-live run --out run.json [--areas 1,2] [--sites foxing]    run each area's checks against every live site
//   devkit-live board --runs <dir> --out board.json --md SCOREBOARD.md  the board, from the runs in <dir> and the verdicts
//   devkit-live lint                                                  the site, area and verdict files are well formed
//
// A CHECK is a bin in a shared package, installed at that package's newest release tag (or the check's "ref"). It is run as
// `<bin> --origin <site origin> [--from <where the site is served now>]` and keeps the contract prelum-audit and every
// devkit check keep: each finding an ::error or ::warning annotation line (`::error title=<check>::<url> <detail>`), and
// exit 0 for no errors, 1 for errors, anything else for could not run. An area adds a check with one entry in areas.json:
//
//   { "name": "prelum-audit", "repo": "prelum", "bin": "prelum-audit", "kinds": ["site", "static"], "ref": "v0.19.0" }
//
// "kinds" are the site kinds it applies to (site, static, worker, app: a signed-in app behind Access, which only the checks
// that name it grade); "args", when given, follow --origin and --from (one bin
// run two ways, once per kind). "site_args" adds arguments for one site only, after "args", keyed by site id: area 8 gives
// each site with a restore drill its repository and drill workflow (`--repo owner/name --drill-workflow restore-drill.yml`).
// An area's "skip" names a site the area does not apply to, and why; its "unchecked" names what its checks cannot reach (a
// signed-in site or page), and why, so the board says so instead of looking finished. A check's bin inherits the run's
// environment, so GITHUB_TOKEN reaches it.
//
// A REPORTED check is one that needs a site's secrets, so it runs where the secrets already live and publishes its result
// on that system's own https origin; GitHub never holds a site key. The run reads the report instead of running a bin:
//
//   { "name": "carrel-conformance", "report": "https://carrel.example.com/reports/conformance.json", "max_age_minutes": 60 }
//
// The report is { "check", "at", "ref", "sites": { "<site origin or from>": { "status": "pass" | "fail" | "error", "findings":
// [{ "severity": "error" | "warning", "check", "detail" }] } } }, findings as a bin's annotations would give them and never
// a secret. TLS on the reporter's own origin is what makes it the reporter's. A report that cannot be read, is older than
// max_age_minutes (default 60), names another check or leaves a site out is "error" for that site, never a pass.
// "site_reports" reads one site's result from another reporter, keyed by site id: each app grades its own signed-in
// pages where its credential lives, so Desk's signed-in-security comes from Carrel and the Portal's from Capsid.
//
// A VERDICT is live/verdicts/area-<n>.json, written by the verifier thread, which must not be the area's builder:
//
//   { "area": 2, "verifier": "Verify security headers and CSP", "date": "2026-11-02",
//     "cells": { "package": { "verdict": "complete", "evidence": ["https://..."] },
//                "foxing": { "verdict": "partial", "evidence": ["https://..."], "note": "no COOP" } } }
//
// A CELL is complete only when its checks pass in the newest run, a verifier who is not the builder said complete with
// evidence, and no run after the verdict failed (a failure after a verdict voids it until a fresh verifier signs again).
// Checks passing with no verdict is partial; no check, a failing check or one that could not run is missing. The package
// column has no live check, so it is the verdict alone. The job is finished when every cell is complete and every site
// cell has passed CLEAN_DAYS daily runs in a row.
//
// Lines added and removed per area are read from GitHub: the merged pull requests labeled completeness-area-<n> in every
// repository the token can read (LIVE_GITHUB_TOKEN, else GITHUB_TOKEN, which sees only public repositories).

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const CLEAN_DAYS = 7;
const OWNER = "DrDustinEdwards";
const KINDS = ["site", "static", "worker", "app"];
const VERDICTS = ["complete", "partial", "missing"];
const MAX_FINDINGS = 100;
const CHECK_TIMEOUT_MS = 20 * 60_000;
const PARALLEL = 4;
const REPORT_MAX_AGE_MINUTES = 60;
const STATUSES = ["pass", "fail", "error"];

const live = new URL("../live/", import.meta.url);
const readJson = (/** @type {string | URL} */ path) => JSON.parse(readFileSync(path, "utf8"));

/** The site list, area list and verdicts in a directory laid out as live/ is. */
export function loadConfig(dir = live) {
  const base = typeof dir === "string" ? pathToFileURL(dir.endsWith("/") ? dir : `${dir}/`) : dir;
  const { sites } = readJson(new URL("sites.json", base));
  const { areas } = readJson(new URL("areas.json", base));
  const verdictDir = new URL("verdicts/", base);
  const verdicts = existsSync(verdictDir)
    ? readdirSync(verdictDir).filter((name) => /^area-\d+\.json$/.test(name)).map((name) => readJson(new URL(name, verdictDir)))
    : [];
  return { sites, areas, verdicts };
}

/** Every problem with the config, as sentences; empty when it is sound. */
export function lintConfig({ sites, areas, verdicts }) {
  const problems = [];
  const siteIds = new Set();
  for (const site of sites) {
    if (siteIds.has(site.id)) problems.push(`site ${site.id} is listed twice`);
    siteIds.add(site.id);
    if (!KINDS.includes(site.kind)) problems.push(`site ${site.id} has kind ${site.kind}, not one of ${KINDS.join(", ")}`);
    for (const key of ["origin", "from"]) {
      if (site[key] !== undefined && !/^https:\/\/[a-z0-9.-]+$/.test(site[key])) problems.push(`site ${site.id} ${key} ${site[key]} is not a bare https origin`);
    }
  }
  const byArea = new Map(areas.map((area) => [area.id, area]));
  for (const area of areas) {
    if (!area.builder) problems.push(`area ${area.id} names no builder`);
    for (const check of area.checks) {
      if (check.report !== undefined) {
        if (!check.name || check.repo || check.bin || !/^https:\/\/[a-z0-9.-]+\//.test(check.report)) problems.push(`area ${area.id} check ${check.name} needs a name and an https report URL, and no repo or bin`);
      } else if (!check.name || !check.repo || !check.bin) problems.push(`area ${area.id} has a check without a name, repo and bin`);
      for (const kind of check.kinds ?? []) if (!KINDS.includes(kind)) problems.push(`area ${area.id} check ${check.name} names kind ${kind}`);
      if (check.args !== undefined && !isStrings(check.args)) problems.push(`area ${area.id} check ${check.name} has args that are not a list of strings`);
      for (const [id, url] of Object.entries(check.site_reports ?? {})) {
        if (!siteIds.has(id)) problems.push(`area ${area.id} check ${check.name} has a site_reports entry for unknown site ${id}`);
        if (check.report === undefined || !/^https:\/\/[a-z0-9.-]+\//.test(url)) problems.push(`area ${area.id} check ${check.name} site_reports ${id} needs a reported check and an https URL`);
      }
      for (const [id, args] of Object.entries(check.site_args ?? {})) {
        if (!siteIds.has(id)) problems.push(`area ${area.id} check ${check.name} has site_args for unknown site ${id}`);
        if (!isStrings(args)) problems.push(`area ${area.id} check ${check.name} has site_args for ${id} that are not a list of strings`);
      }
    }
    for (const id of Object.keys(area.skip ?? {})) if (!siteIds.has(id)) problems.push(`area ${area.id} skips unknown site ${id}`);
    for (const [what, why] of Object.entries(area.unchecked ?? {})) if (typeof why !== "string" || !why) problems.push(`area ${area.id} leaves ${what} unchecked without a reason`);
  }
  for (const verdict of verdicts) {
    const area = byArea.get(verdict.area);
    if (!area) {
      problems.push(`a verdict names area ${verdict.area}, which does not exist`);
      continue;
    }
    if (!verdict.verifier) problems.push(`the area ${verdict.area} verdict names no verifier`);
    if (same(verdict.verifier, area.builder)) problems.push(`the area ${verdict.area} verdict is signed by its builder, ${area.builder}; only a fresh verifier may sign it`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verdict.date ?? "")) problems.push(`the area ${verdict.area} verdict has no date (YYYY-MM-DD)`);
    for (const [cell, entry] of Object.entries(verdict.cells ?? {})) {
      if (cell !== "package" && !siteIds.has(cell)) problems.push(`the area ${verdict.area} verdict names unknown site ${cell}`);
      if (!VERDICTS.includes(entry.verdict)) problems.push(`the area ${verdict.area} verdict for ${cell} is ${entry.verdict}, not one of ${VERDICTS.join(", ")}`);
      if (entry.verdict === "complete" && !(entry.evidence ?? []).some((url) => /^https:\/\//.test(url))) {
        problems.push(`the area ${verdict.area} verdict marks ${cell} complete with no evidence link`);
      }
    }
  }
  return problems;
}

const isStrings = (/** @type {unknown} */ list) => Array.isArray(list) && list.every((item) => typeof item === "string");

const same = (/** @type {string} */ a, /** @type {string} */ b) => Boolean(a) && a.trim().toLowerCase() === b?.trim().toLowerCase();

/** The checks of an area that apply to a site. */
const checksFor = (area, site) =>
  area.checks
    .filter((check) => (check.kinds ?? ["site", "static"]).includes(site.kind))
    .map((check) => (check.site_reports?.[site.id] ? { ...check, report: check.site_reports[site.id] } : check));

/** The annotation lines of a check's output, as findings. */
export function parseFindings(/** @type {string} */ output) {
  const findings = [];
  for (const line of output.split("\n")) {
    const match = /^::(error|warning)(?: ([^:]*))?::(.*)$/.exec(line.trim());
    if (!match) continue;
    const title = /(?:^|,)title=([^,]*)/.exec(match[2] ?? "")?.[1] ?? "";
    findings.push({ severity: match[1], check: title, detail: match[3] });
  }
  return findings;
}

/** One check's result on one site, from its exit code and output. */
export function resultOf({ code, output, seconds }) {
  const findings = parseFindings(output);
  const errors = findings.filter((f) => f.severity === "error").length;
  const status = code === 0 ? "pass" : code === 1 ? "fail" : "error";
  const tail = status === "error" ? output.trim().split("\n").slice(-3).join(" ").slice(0, 300) : undefined;
  return { status, errors, warnings: findings.length - errors, findings: findings.slice(0, MAX_FINDINGS), seconds, ...(tail ? { detail: tail } : {}) };
}

/** One site's result from a reported check's report (null when it could not be read), checked for name and age. Pure. */
export function reportedResult(report, check, site, now = new Date()) {
  const error = (detail) => ({ status: "error", errors: 0, warnings: 0, findings: [], detail });
  if (!report || typeof report !== "object") return error(`could not read ${check.report}`);
  if (report.check !== check.name) return error(`${check.report} reports ${report.check}, not ${check.name}`);
  const age = (now.getTime() - Date.parse(report.at)) / 60_000;
  const maxAge = check.max_age_minutes ?? REPORT_MAX_AGE_MINUTES;
  if (!(age >= -5 && age <= maxAge)) return error(`${check.report} is from ${report.at}, more than ${maxAge} minutes ago`);
  const entry = report.sites?.[site.origin] ?? (site.from ? report.sites?.[site.from] : undefined);
  if (!entry || !STATUSES.includes(entry.status)) return error(`${check.report} has no result for ${site.origin}`);
  const findings = (Array.isArray(entry.findings) ? entry.findings : [])
    .filter((f) => ["error", "warning"].includes(f?.severity))
    .map((f) => ({ severity: f.severity, check: String(f.check ?? "").slice(0, 200), detail: String(f.detail ?? "").slice(0, 600) }));
  const errors = findings.filter((f) => f.severity === "error").length;
  // A pass with an error finding is not a pass.
  const status = entry.status === "pass" && errors ? "fail" : entry.status;
  return { status, errors, warnings: findings.length - errors, findings: findings.slice(0, MAX_FINDINGS), seconds: 0 };
}

async function fetchReport(/** @type {string} */ url) {
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

/** The newest vX.Y.Z tag of one of the family's repositories. */
function newestTag(/** @type {string} */ repo) {
  const out = execFileSync("git", ["ls-remote", "--tags", "--refs", `https://github.com/${OWNER}/${repo}`], { encoding: "utf8" });
  const tags = [...out.matchAll(/refs\/tags\/(v\d+\.\d+\.\d+)$/gm)].map((m) => m[1]);
  tags.sort((a, b) => a.slice(1).split(".").map(Number).reduce((d, n, i) => d || n - Number(b.slice(1).split(".")[i]), 0));
  return tags.at(-1);
}

/** Installs a check's package once per repo and ref; returns the bin's path or the reason it cannot run. */
function install(check, cache, root) {
  let ref = check.ref;
  try {
    ref ??= newestTag(check.repo);
  } catch {
    return { ref: null, error: `could not read the tags of ${check.repo}` };
  }
  if (!ref) return { ref: null, error: `${check.repo} has no release tag` };
  const key = `${check.repo}#${ref}`;
  if (!cache.has(key)) {
    const dir = join(root, key.replace(/[^A-Za-z0-9.-]/g, "_"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), "{}");
    try {
      execFileSync("npm", ["install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", `github:${OWNER}/${check.repo}#${ref}`], { cwd: dir, stdio: "pipe" });
      cache.set(key, { dir, ref });
    } catch (error) {
      cache.set(key, { ref, error: `npm could not install ${key}: ${String(error.stderr ?? error.message).trim().split("\n").at(-1)}` });
    }
  }
  const got = cache.get(key);
  if (got.error) return { ref, error: got.error };
  const bin = join(got.dir, "node_modules", ".bin", check.bin);
  return existsSync(bin) ? { ref, bin } : { ref, error: `${check.repo} ${ref} has no ${check.bin} bin yet` };
}

function runBin(/** @type {string} */ bin, /** @type {string[]} */ args) {
  return new Promise((resolve) => {
    const started = Date.now();
    let output = "";
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], timeout: CHECK_TIMEOUT_MS });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => (output += `\n${error.message}`));
    child.on("close", (code) => resolve({ code: code ?? 3, output, seconds: Math.round((Date.now() - started) / 1000) }));
  });
}

/** Merged pull requests labeled for an area, with their lines, from every repository the token can read. */
async function linesFor(/** @type {number} */ area, /** @type {string | undefined} */ token) {
  if (!token) return { error: "no GitHub token" };
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "devkit-live" };
  const q = encodeURIComponent(`user:${OWNER} is:pr is:merged label:completeness-area-${area}`);
  const search = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=100`, { headers });
  if (!search.ok) return { error: `GitHub search answered ${search.status}` };
  const { items } = await search.json();
  let added = 0;
  let removed = 0;
  for (const item of items) {
    const pr = await fetch(item.pull_request.url, { headers });
    if (!pr.ok) return { error: `GitHub answered ${pr.status} for ${item.html_url}` };
    const body = await pr.json();
    added += body.additions;
    removed += body.deletions;
  }
  return { prs: items.length, added, removed };
}

/** Runs every check that applies against every site; one record per area, site and check. */
export async function runAll({ sites, areas }, { onlyAreas, onlySites, token, log = console.error } = {}) {
  const root = mkdtempSync(join(tmpdir(), "devkit-live-"));
  const cache = new Map();
  const reports = new Map();
  const jobs = [];
  const results = [];
  for (const area of areas) {
    if (onlyAreas && !onlyAreas.includes(area.id)) continue;
    for (const site of sites) {
      if (onlySites && !onlySites.includes(site.id)) continue;
      if (area.skip?.[site.id]) continue;
      for (const check of checksFor(area, site)) {
        if (check.report) {
          if (!reports.has(check.report)) reports.set(check.report, fetchReport(check.report));
          const report = await reports.get(check.report);
          const record = { area: area.id, site: site.id, check: check.name, ref: typeof report?.ref === "string" ? report.ref.slice(0, 60) : null };
          results.push({ ...record, ...reportedResult(report, check, site) });
          continue;
        }
        const { ref, bin, error } = install(check, cache, root);
        const record = { area: area.id, site: site.id, check: check.name, ref };
        if (error) {
          results.push({ ...record, status: "error", errors: 0, warnings: 0, findings: [], detail: error });
          continue;
        }
        const args = ["--origin", site.origin, ...(site.from ? ["--from", site.from] : []), ...(check.args ?? []), ...(check.site_args?.[site.id] ?? [])];
        jobs.push(async () => {
          const result = resultOf(await runBin(bin, args));
          log(`area ${area.id} ${site.id} ${check.name}: ${result.status} (${result.errors} errors, ${result.warnings} warnings, ${result.seconds}s)`);
          results.push({ ...record, ...result });
        });
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) await job();
  }));
  const lines = {};
  for (const area of areas) if (!onlyAreas || onlyAreas.includes(area.id)) lines[area.id] = await linesFor(area.id, token);
  results.sort((a, b) => a.area - b.area || a.site.localeCompare(b.site) || a.check.localeCompare(b.check));
  return { at: new Date().toISOString(), public_token: !process.env.LIVE_GITHUB_TOKEN, results, lines };
}

/**
 * The board, from the runs (any order) and the config. Pure.
 * @returns {{ as_of: string | null, finished: boolean, sites: object[], areas: object[] }}
 */
export function buildBoard({ sites, areas, verdicts }, runs) {
  const ordered = [...runs].sort((a, b) => a.at.localeCompare(b.at));
  const newest = ordered.at(-1);
  const cellOf = (run, area, site) => run.results.filter((r) => r.area === area && r.site === site);
  const passed = (records, names) => names.every((name) => records.find((r) => r.check === name)?.status === "pass");
  let finished = Boolean(newest);
  const board = areas.map((area) => {
    const verdict = verdicts.find((v) => v.area === area.id);
    const signedByBuilder = verdict && same(verdict.verifier, area.builder);
    const cells = {};
    const pkg = verdict?.cells?.package;
    cells.package = !pkg
      ? { status: "missing", reason: "no verifier has checked the package" }
      : signedByBuilder
        ? { status: "partial", reason: "signed by its own builder" }
        : { status: pkg.verdict, reason: pkg.note ?? `${verdict.verifier}, ${verdict.date}`, evidence: pkg.evidence };
    for (const site of sites) {
      if (area.skip?.[site.id]) {
        cells[site.id] = { status: "n/a", reason: area.skip[site.id] };
        continue;
      }
      const names = checksFor(area, site).map((check) => check.name);
      if (area.checks.length && !names.length) {
        cells[site.id] = { status: "n/a", reason: `no check for a ${site.kind}` };
        continue;
      }
      cells[site.id] = siteCell({ area, site, names, verdict, signedByBuilder, ordered, newest, cellOf, passed });
    }
    // What the checks cannot reach is not proven, so the job is not finished while an area lists any.
    if (Object.keys(area.unchecked ?? {}).length) finished = false;
    for (const [id, cell] of Object.entries(cells)) {
      if (cell.status === "n/a") continue;
      if (cell.status !== "complete" || (id !== "package" && cell.clean_days < CLEAN_DAYS)) finished = false;
    }
    return { id: area.id, name: area.name, builder: area.builder, verifier: verdict?.verifier ?? null, lines: newest?.lines?.[area.id] ?? null, unchecked: area.unchecked ?? {}, cells };
  });
  return { as_of: newest?.at ?? null, finished, public_token: newest?.public_token ?? true, sites: sites.map(({ id, name, origin }) => ({ id, name, origin })), areas: board };
}

function siteCell({ area, site, names, verdict, signedByBuilder, ordered, newest, cellOf, passed }) {
  if (!names.length) return { status: "missing", reason: "no live check yet" };
  const records = newest ? cellOf(newest, area.id, site.id) : [];
  if (!records.length) return { status: "missing", reason: "not run yet" };
  const broken = records.find((r) => r.status === "error");
  if (broken) return { status: "missing", reason: `${broken.check} could not run: ${broken.detail ?? "no output"}` };
  const failing = records.filter((r) => r.status === "fail");
  if (failing.length) return { status: "missing", reason: failing.map((r) => `${r.check}: ${r.errors} errors`).join("; "), findings: failing.flatMap((r) => r.findings) };
  let clean_days = 0;
  for (let i = ordered.length - 1; i >= 0 && passed(cellOf(ordered[i], area.id, site.id), names); i--) clean_days++;
  const entry = verdict?.cells?.[site.id];
  if (!entry) return { status: "partial", reason: "checks pass; no verifier yet", clean_days };
  if (signedByBuilder) return { status: "partial", reason: "signed by its own builder", clean_days };
  const failedAfter = ordered.find((run) => run.at.slice(0, 10) > verdict.date && !passed(cellOf(run, area.id, site.id), names));
  if (failedAfter) return { status: "partial", reason: `failed on ${failedAfter.at.slice(0, 10)}, after ${verdict.verifier} signed; needs a fresh verifier`, clean_days };
  return { status: entry.verdict, reason: entry.note ?? `${verdict.verifier}, ${verdict.date}`, evidence: entry.evidence, clean_days };
}

const MARK = { complete: "✅", partial: "🟡", missing: "❌", "n/a": "·" };

/** The board as Markdown, for GitHub to show. */
export function boardMarkdown(board) {
  const out = ["# Shared-code completeness", ""];
  out.push(board.as_of ? `Newest run ${board.as_of.slice(0, 16).replace("T", " ")} UTC. Filled only from the live checks and the verifiers' verdicts.` : "No run yet.");
  out.push("", board.finished ? `**Finished:** every cell complete and clean for ${CLEAN_DAYS} daily runs.` : `**Not finished.** Finished means every cell complete and clean for ${CLEAN_DAYS} daily runs.`, "");
  out.push("✅ complete · 🟡 partial · ❌ missing · `·` does not apply", "");
  out.push(`| Area | Package | ${board.sites.map((s) => s.name).join(" | ")} | Lines added | Lines removed |`);
  out.push(`|---|---|${board.sites.map(() => "---").join("|")}|---:|---:|`);
  for (const area of board.areas) {
    const marks = ["package", ...board.sites.map((s) => s.id)].map((id) => MARK[area.cells[id].status]);
    const lines = area.lines && !area.lines.error ? [`+${area.lines.added}`, `−${area.lines.removed}`] : ["?", "?"];
    out.push(`| ${area.id}. ${area.name} | ${marks.join(" | ")} | ${lines.join(" | ")} |`);
  }
  if (board.public_token) out.push("", "Lines count public repositories only until the LIVE_GITHUB_TOKEN secret is set.");
  out.push("", "## Why a cell is not complete", "");
  for (const area of board.areas) {
    const open = Object.entries(area.cells).filter(([, cell]) => cell.status !== "complete" && cell.status !== "n/a");
    const unchecked = Object.entries(area.unchecked ?? {});
    if (!open.length && !unchecked.length) continue;
    out.push(`### ${area.id}. ${area.name}`, "", `Builder: ${area.builder}. Verifier: ${area.verifier ?? "none yet"}.`, "");
    for (const [id, cell] of open) {
      const name = id === "package" ? "Package" : board.sites.find((s) => s.id === id).name;
      out.push(`- ${MARK[cell.status]} ${name}: ${cell.reason.replace(/\|/g, "\\|")}`);
      for (const finding of (cell.findings ?? []).filter((f) => f.severity === "error").slice(0, 5)) out.push(`  - ${finding.check}: ${finding.detail}`);
    }
    for (const [what, why] of unchecked) out.push(`- Not checked, ${what}: ${why.replace(/\|/g, "\\|")}`);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string" }, md: { type: "string" }, runs: { type: "string" }, config: { type: "string" }, areas: { type: "string" }, sites: { type: "string" } },
  });
  const config = loadConfig(values.config ?? live);
  const problems = lintConfig(config);
  for (const problem of problems) console.log(`::error title=devkit-live::${problem}`);
  if (problems.length) process.exit(1);
  const [command] = positionals;
  if (command === "lint") {
    console.log(`devkit-live: ${config.sites.length} sites, ${config.areas.length} areas, ${config.verdicts.length} verdicts.`);
  } else if (command === "run" && values.out) {
    const run = await runAll(config, {
      onlyAreas: values.areas?.split(",").map(Number),
      onlySites: values.sites?.split(","),
      token: process.env.LIVE_GITHUB_TOKEN || process.env.GITHUB_TOKEN,
    });
    writeFileSync(values.out, `${JSON.stringify(run, null, 1)}\n`);
    const counts = Object.groupBy(run.results, (r) => r.status);
    console.log(`devkit-live: ${run.results.length} checks; ${Object.entries(counts).map(([s, list]) => `${s} ${list.length}`).join(", ") || "none to run"}.`);
  } else if (command === "board" && values.runs && values.out) {
    const runs = readdirSync(values.runs).filter((name) => name.endsWith(".json")).map((name) => readJson(join(values.runs, name)));
    const board = buildBoard(config, runs);
    writeFileSync(values.out, `${JSON.stringify(board, null, 1)}\n`);
    if (values.md) writeFileSync(values.md, boardMarkdown(board));
  } else {
    console.error("usage: devkit-live run --out run.json [--areas 1,2] [--sites id] | board --runs <dir> --out board.json [--md SCOREBOARD.md] | lint");
    process.exit(2);
  }
}
