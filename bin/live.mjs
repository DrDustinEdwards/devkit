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
// exit 0 for no errors, 1 for errors, anything else for could not run. An item the check could not measure (a service
// refused, a proxy hid the answer, a GitHub read failed) is never a pass or a failure: the check prints
// `::notice title=<item>::<url> could not measure: <reason>` (UNMEASURED_PREFIX) and exits 3 when nothing failed, the
// Monitoring Plugins guidelines' UNKNOWN. The result is then "unmeasured" with the reasons, on the board too, so a cell
// never reads as passing on an item nobody measured, nor as failing on a measurement that never happened. An exit that is
// not 0, 1 or 3 (a crash, an outage) is "unmeasured" as well, with its last lines as the reason. An area adds a check with
// one entry in areas.json:
//
//   { "name": "prelum-audit", "repo": "prelum", "bin": "prelum-audit", "kinds": ["site", "static"], "ref": "v0.19.0" }
//
// "kinds" are the site kinds it applies to (site, static, worker, app: a signed-in app behind Access, which only the checks
// that name it grade); "args", when given, follow --origin and --from (one bin
// run two ways, once per kind). "site_args" adds arguments for one site only, after "args", keyed by site id: area 8 gives
// each site with a restore drill its repository and drill workflow (`--repo owner/name --drill-workflow restore-drill.yml`).
// An area's "skip" names a site the area does not apply to, and why; its "unchecked" names what its checks cannot reach (a
// signed-in site or page), and why, so the board says so instead of looking finished. A check's bin gets the basics of a
// process (checkEnv: PATH, HOME, locale, a few NODE_ settings, proxy variables without their credentials) and the
// variables its "env" lists; nothing else, so a token reaches only the check that names it. The MCP test grants: an
// MCP_TEST_GRANT_<HOST> variable (a read-only key for one MCP server, which site-runtime-ai-audit reads for area 11's
// tools/list, conformance and burst probes) reaches only a check marked "grants": true, and only the one for the host of
// the site being probed (grantName), so no check's code ever holds another server's key.
//
// A REPORTED check is one that needs a site's secrets, so it runs where the secrets already live and publishes its result
// on that system's own https origin; GitHub never holds a site key. The run reads the report instead of running a bin:
//
//   { "name": "carrel-conformance", "report": "https://carrel.example.com/reports/conformance.json", "max_age_minutes": 60 }
//
// The report is { "check", "at", "ref", "sites": { "<site origin or from>": { "status": "pass" | "fail" | "unmeasured", "findings":
// [{ "severity": "error" | "warning" | "unmeasured", "check", "detail" }] } } }, findings as a bin's annotations would give
// them and never a secret ("error" is still read as "unmeasured", the status's older name). TLS on the reporter's own origin
// is what makes it the reporter's. A report that cannot be read, is older than max_age_minutes (default 60), names another
// check or leaves a site out is "unmeasured" for that site, with the reason, never a pass.
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
// Checks passing with no verdict is partial; no check or a failing check is missing; a check that could not measure (and
// none failing) is "unmeasured", with why, which is neither, and not complete. The package
// column has no live check, so it is the verdict alone, and so is every cell of an area with no checks at all (area 12,
// the checks and tooling themselves, which no bin grades on a site). The job is finished when every cell is complete and
// every site cell with a live check has passed CLEAN_DAYS daily runs in a row.
//
// Lines added and removed per area are read from GitHub: the merged pull requests labeled completeness-area-<n> in every
// repository the token can read (LIVE_GITHUB_TOKEN, else GITHUB_TOKEN, which sees only public repositories).

import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { escapeAnnotation } from "./annotate.mjs";

/** @typedef {Record<string, any>} Json A site, area, check, verdict, run or cell: JSON the config and the runs hold. */

export const CLEAN_DAYS = 7;
const OWNER = "DrDustinEdwards";
const KINDS = ["site", "static", "worker", "app"];
const VERDICTS = ["complete", "partial", "missing"];
const MAX_FINDINGS = 100;
const CHECK_TIMEOUT_MS = 20 * 60_000;
const PARALLEL = 4;
const REPORT_MAX_AGE_MINUTES = 60;
const STATUSES = ["pass", "fail", "unmeasured"];
const MAX_OUTPUT = 5 * 1024 * 1024;
const MAX_REPORT = 2 * 1024 * 1024;
/** The longest a rate-limited GitHub read waits before it gives up and the area's lines are unmeasured. */
const MAX_RATE_WAIT_MS = 60_000;
/** The detail an unmeasured item's ::notice line starts with. */
export const UNMEASURED_PREFIX = "could not measure: ";
/** A check's exit when nothing failed but something could not be measured (Monitoring Plugins' UNKNOWN). */
export const EXIT_UNMEASURED = 3;

const live = new URL("../live/", import.meta.url);
const readJsonFile = (/** @type {string | URL} */ path) => JSON.parse(readFileSync(path, "utf8"));

/**
 * The site list, area list and verdicts in a directory laid out as live/ is. A file that cannot be read or parsed is a
 * problem for lintConfig, never a throw.
 */
export function loadConfig(/** @type {string | URL} */ dir = live) {
  const base = typeof dir === "string" ? pathToFileURL(dir.endsWith("/") ? dir : `${dir}/`) : dir;
  /** @type {string[]} */
  const problems = [];
  const read = (/** @type {URL} */ url, /** @type {string} */ name) => {
    try {
      return readJsonFile(url);
    } catch (error) {
      problems.push(
        `${name} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  };
  const sites = read(new URL("sites.json", base), "sites.json")?.sites ?? [];
  const areas = read(new URL("areas.json", base), "areas.json")?.areas ?? [];
  const verdictDir = new URL("verdicts/", base);
  const verdicts = existsSync(verdictDir)
    ? readdirSync(verdictDir)
        .filter((name) => /^area-\d+\.json$/.test(name))
        .map((name) => read(new URL(name, verdictDir), `verdicts/${name}`))
        .filter((verdict) => verdict !== undefined)
    : [];
  return { sites, areas, verdicts, problems };
}

/** Every problem with the config, as sentences; empty when it is sound. */
export function lintConfig(
  /** @type {{ sites: Json[], areas: Json[], verdicts: Json[], problems?: string[] }} */ config,
) {
  /** @type {string[]} */
  const problems = [...(config.problems ?? [])];
  const list = (/** @type {unknown} */ value, /** @type {string} */ name) => {
    if (Array.isArray(value) && value.every(isObject)) return /** @type {Json[]} */ (value);
    problems.push(`${name} is not a list of objects`);
    return [];
  };
  const sites = list(config.sites, "the site list");
  const areas = list(config.areas, "the area list");
  const verdicts = list(config.verdicts, "the verdicts");
  const siteIds = new Set();
  for (const site of sites) {
    if (typeof site.id !== "string" || !site.id) problems.push(`a site has no string id`);
    if (siteIds.has(site.id)) problems.push(`site ${site.id} is listed twice`);
    siteIds.add(site.id);
    if (!KINDS.includes(site.kind))
      problems.push(`site ${site.id} has kind ${site.kind}, not one of ${KINDS.join(", ")}`);
    if (typeof site.origin !== "string") problems.push(`site ${site.id} has no origin`);
    for (const key of ["origin", "from"]) {
      if (
        site[key] !== undefined &&
        !(typeof site[key] === "string" && /^https:\/\/[a-z0-9.-]+$/.test(site[key]))
      )
        problems.push(`site ${site.id} ${key} ${site[key]} is not a bare https origin`);
    }
  }
  const byArea = new Map(areas.map((area) => [area.id, area]));
  for (const area of areas) {
    if (!Number.isInteger(area.id)) problems.push(`an area has id ${area.id}, not a whole number`);
    if (typeof area.builder !== "string" || !area.builder.trim())
      problems.push(`area ${area.id} names no builder`);
    if (!Array.isArray(area.checks) || !area.checks.every(isObject)) {
      problems.push(`area ${area.id} has no list of checks (an area with none has "checks": [])`);
      continue;
    }
    for (const check of area.checks) {
      if (check.kinds !== undefined && !isStrings(check.kinds))
        problems.push(`area ${area.id} check ${check.name} has kinds that are not a list`);
      if (check.report !== undefined) {
        if (
          !check.name ||
          check.repo ||
          check.bin ||
          typeof check.report !== "string" ||
          !/^https:\/\/[a-z0-9.-]+\//.test(check.report)
        )
          problems.push(
            `area ${area.id} check ${check.name} needs a name and an https report URL, and no repo or bin`,
          );
      } else if (!check.name || !check.repo || !check.bin)
        problems.push(`area ${area.id} has a check without a name, repo and bin`);
      else {
        // The bin is joined onto node_modules/.bin and the repo and ref into an npm spec, so each must be a plain name.
        if (!isName(check.bin))
          problems.push(`area ${area.id} check ${check.name} bin ${check.bin} is not a plain name`);
        if (!isName(check.repo))
          problems.push(
            `area ${area.id} check ${check.name} repo ${check.repo} is not a repository name`,
          );
        if (
          check.ref !== undefined &&
          !(typeof check.ref === "string" && /^(?:v\d+\.\d+\.\d+|[0-9a-f]{40})$/.test(check.ref))
        )
          problems.push(
            `area ${area.id} check ${check.name} ref ${check.ref} is not a vX.Y.Z tag or a full commit sha`,
          );
      }
      for (const kind of check.kinds ?? [])
        if (!KINDS.includes(kind))
          problems.push(`area ${area.id} check ${check.name} names kind ${kind}`);
      if (check.args !== undefined && !isStrings(check.args))
        problems.push(
          `area ${area.id} check ${check.name} has args that are not a list of strings`,
        );
      if (
        check.env !== undefined &&
        !(
          isStrings(check.env) &&
          check.env.every(
            (/** @type {string} */ n) => /^[A-Z][A-Z0-9_]*$/.test(n) && !GRANT_ENV.test(n),
          )
        )
      )
        problems.push(
          `area ${area.id} check ${check.name} has env that is not a list of variable names (grants are named by "grants": true)`,
        );
      if (check.grants !== undefined && (check.grants !== true || check.report !== undefined))
        problems.push(
          `area ${area.id} check ${check.name} has "grants" other than true on a bin check`,
        );
      for (const [id, url] of Object.entries(check.site_reports ?? {})) {
        if (!siteIds.has(id))
          problems.push(
            `area ${area.id} check ${check.name} has a site_reports entry for unknown site ${id}`,
          );
        if (
          check.report === undefined ||
          typeof url !== "string" ||
          !/^https:\/\/[a-z0-9.-]+\//.test(url)
        )
          problems.push(
            `area ${area.id} check ${check.name} site_reports ${id} needs a reported check and an https URL`,
          );
      }
      for (const [id, args] of Object.entries(check.site_args ?? {})) {
        if (!siteIds.has(id))
          problems.push(`area ${area.id} check ${check.name} has site_args for unknown site ${id}`);
        if (!isStrings(args))
          problems.push(
            `area ${area.id} check ${check.name} has site_args for ${id} that are not a list of strings`,
          );
      }
    }
    for (const id of Object.keys(area.skip ?? {}))
      if (!siteIds.has(id)) problems.push(`area ${area.id} skips unknown site ${id}`);
    for (const [what, why] of Object.entries(area.unchecked ?? {}))
      if (typeof why !== "string" || !why)
        problems.push(`area ${area.id} leaves ${what} unchecked without a reason`);
  }
  for (const verdict of verdicts) {
    const area = byArea.get(verdict.area);
    if (!area) {
      problems.push(`a verdict names area ${verdict.area}, which does not exist`);
      continue;
    }
    if (typeof verdict.verifier !== "string" || !verdict.verifier.trim())
      problems.push(`the area ${verdict.area} verdict names no verifier`);
    if (same(verdict.verifier, area.builder))
      problems.push(
        `the area ${verdict.area} verdict is signed by its builder, ${area.builder}; only a fresh verifier may sign it`,
      );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verdict.date ?? ""))
      problems.push(`the area ${verdict.area} verdict has no date (YYYY-MM-DD)`);
    if (!isObject(verdict.cells ?? {}))
      problems.push(`the area ${verdict.area} verdict's cells are not an object`);
    for (const [cell, entry] of Object.entries(verdict.cells ?? {})) {
      if (cell !== "package" && !siteIds.has(cell))
        problems.push(`the area ${verdict.area} verdict names unknown site ${cell}`);
      if (!isObject(entry)) {
        problems.push(`the area ${verdict.area} verdict for ${cell} is not an object`);
        continue;
      }
      if (entry.note !== undefined && typeof entry.note !== "string")
        problems.push(`the area ${verdict.area} verdict for ${cell} has a note that is not text`);
      if (entry.evidence !== undefined && !isStrings(entry.evidence))
        problems.push(
          `the area ${verdict.area} verdict for ${cell} has evidence that is not a list of links`,
        );
      if (!VERDICTS.includes(entry.verdict))
        problems.push(
          `the area ${verdict.area} verdict for ${cell} is ${entry.verdict}, not one of ${VERDICTS.join(", ")}`,
        );
      if (
        entry.verdict === "complete" &&
        !(isStrings(entry.evidence) ? entry.evidence : []).some((/** @type {string} */ url) =>
          url.startsWith("https://"),
        )
      ) {
        problems.push(
          `the area ${verdict.area} verdict marks ${cell} complete with no evidence link`,
        );
      }
    }
  }
  return problems;
}

const isStrings = (/** @type {unknown} */ list) =>
  Array.isArray(list) && list.every((item) => typeof item === "string");

const isObject = (/** @type {unknown} */ value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A repository or bin name: no path separator, no `..`, nothing npm or a path join would read as more. */
const isName = (/** @type {unknown} */ name) =>
  typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes("..");

const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Boolean(a.trim()) &&
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The checks of an area that apply to a site. */
const checksFor = (/** @type {Json} */ area, /** @type {Json} */ site) =>
  area.checks
    .filter((/** @type {Json} */ check) => (check.kinds ?? ["site", "static"]).includes(site.kind))
    .map((/** @type {Json} */ check) =>
      check.site_reports?.[site.id] ? { ...check, report: check.site_reports[site.id] } : check,
    );

/** Undoes bin/annotate.mjs's escapes (`%25`, `%0D`, `%0A`, and in a property `%3A`, `%2C`), in one pass. */
const unescapeAnnotation = (/** @type {string} */ text) =>
  text.replace(/%(25|0D|0A|3A|2C)/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

/** The annotation lines of a check's output, as findings; a ::notice is a finding only when it says what was not measured. */
export function parseFindings(/** @type {string} */ output) {
  const findings = [];
  for (const line of output.split("\n")) {
    const match = /^::(error|warning|notice)(?: ([^:]*))?::(.*)$/.exec(line.trim());
    if (!match) continue;
    const title = unescapeAnnotation(/(?:^|,)title=([^,]*)/.exec(match[2] ?? "")?.[1] ?? "");
    const detail = unescapeAnnotation(match[3]);
    if (match[1] !== "notice") findings.push({ severity: match[1], check: title, detail });
    else if (detail.includes(UNMEASURED_PREFIX))
      findings.push({ severity: "unmeasured", check: title, detail });
  }
  return findings;
}

/** The counts and the reason of a result, from its findings. */
function tally(/** @type {{ severity: string, check: string, detail: string }[]} */ findings) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const unmeasured = findings.filter((f) => f.severity === "unmeasured");
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const reason = unmeasured
    .map((f) => `${f.check}: ${f.detail}`)
    .join("; ")
    .slice(0, 600);
  return { errors, warnings, unmeasured: unmeasured.length, reason };
}

/**
 * One check's result on one site, from its exit code and output. A failure is an ::error line on an exit of 0, 1 or 3,
 * and stands even beside an unmeasured item (what was measured failed); a pass with an unmeasured item is not a pass.
 * Exit 1 with no ::error line is a crash (an uncaught throw exits 1), so it is unmeasured, never a failure; and a
 * timeout or a signal (`code` null, `killed` saying which) is unmeasured too.
 */
export function resultOf(
  /** @type {{ code: number | null, output: string, seconds: number, killed?: string }} */ {
    code,
    output,
    seconds,
    killed,
  },
) {
  const findings = parseFindings(output);
  const { errors, warnings, unmeasured, reason } = tally(findings);
  const ran = code === 0 || code === 1 || code === EXIT_UNMEASURED;
  const status = ran && errors ? "fail" : code === 0 && !unmeasured ? "pass" : "unmeasured";
  const last = output.trim().split("\n").slice(-3).join(" ").slice(0, 300);
  const tail = killed
    ? `could not run: ${killed}${last ? `: ${last}` : ""}`
    : code === 1 && !errors
      ? `could not run: exit 1 with no ::error line${last ? `: ${last}` : ""}`
      : !ran
        ? `could not run: ${last || `exit ${code}`}`
        : undefined;
  const detail =
    status === "unmeasured"
      ? [reason, tail].filter(Boolean).join("; ") || `exit ${code} with nothing said`
      : undefined;
  return {
    status,
    errors,
    warnings,
    unmeasured,
    findings: findings.slice(0, MAX_FINDINGS),
    seconds,
    ...(detail ? { detail } : {}),
  };
}

/** One site's result from a reported check's report (null when it could not be read), checked for name and age. Pure. */
export function reportedResult(
  /** @type {Json | null | undefined} */ report,
  /** @type {Json} */ check,
  /** @type {Json} */ site,
  now = new Date(),
) {
  const error = unmeasuredResult;
  if (!report || typeof report !== "object") return error(`could not read ${check.report}`);
  if (report.check !== check.name)
    return error(`${check.report} reports ${report.check}, not ${check.name}`);
  const age = (now.getTime() - Date.parse(report.at)) / 60_000;
  const maxAge = check.max_age_minutes ?? REPORT_MAX_AGE_MINUTES;
  if (!(age >= -5 && age <= maxAge))
    return error(`${check.report} is from ${report.at}, more than ${maxAge} minutes ago`);
  const entry = report.sites?.[site.origin] ?? (site.from ? report.sites?.[site.from] : undefined);
  const given = entry?.status === "error" ? "unmeasured" : entry?.status;
  if (!entry || !STATUSES.includes(given))
    return error(`${check.report} has no result for ${site.origin}`);
  const findings = (Array.isArray(entry.findings) ? entry.findings : [])
    .filter((/** @type {Json} */ f) => ["error", "warning", "unmeasured"].includes(f?.severity))
    .map((/** @type {Json} */ f) => ({
      severity: f.severity,
      check: String(f.check ?? "").slice(0, 200),
      detail: String(f.detail ?? "").slice(0, 600),
    }));
  const { errors, warnings, unmeasured, reason } = tally(findings);
  // A pass with an error finding is a failure, and one with an unmeasured item is unmeasured.
  const status =
    given === "fail" || errors
      ? "fail"
      : given === "unmeasured" || unmeasured
        ? "unmeasured"
        : "pass";
  const detail =
    status === "unmeasured"
      ? reason || `${check.report} says it could not measure ${site.origin}`
      : undefined;
  return {
    status,
    errors,
    warnings,
    unmeasured,
    findings: findings.slice(0, MAX_FINDINGS),
    seconds: 0,
    ...(detail ? { detail } : {}),
  };
}

/** A result that measured nothing, with why. */
const unmeasuredResult = (/** @type {string} */ detail) => ({
  status: "unmeasured",
  errors: 0,
  warnings: 0,
  unmeasured: 0,
  findings: [],
  detail,
});

/** A reported check's report, or why it could not be read (the HTTP status, a body over MAX_REPORT, bad JSON). */
async function fetchReport(/** @type {string} */ url) {
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      await resp.body?.cancel();
      return { error: `HTTP ${resp.status}` };
    }
    if (Number(resp.headers.get("content-length")) > MAX_REPORT) {
      await resp.body?.cancel();
      return { error: `the report is over ${MAX_REPORT / 1024 / 1024} MB` };
    }
    /** @type {Uint8Array[]} */
    const chunks = [];
    let size = 0;
    const reader = resp.body?.getReader();
    for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
      size += read.value.byteLength;
      if (size > MAX_REPORT) {
        await reader?.cancel();
        return { error: `the report is over ${MAX_REPORT / 1024 / 1024} MB` };
      }
      chunks.push(read.value);
    }
    return { report: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

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
 * Installs a check's package once per repo and ref; returns the bin's path or the reason it cannot run. The newest tag
 * is read once per repository for the run, so every site's check runs the same release.
 */
function install(
  /** @type {Json} */ check,
  /** @type {Map<string, Json>} */ cache,
  /** @type {string} */ root,
) {
  const tagKey = `tags:${check.repo}`;
  if (check.ref === undefined && !cache.has(tagKey)) {
    try {
      const tag = newestTag(check.repo);
      cache.set(tagKey, tag ? { ref: tag } : { error: `${check.repo} has no release tag` });
    } catch {
      cache.set(tagKey, { error: `could not read the tags of ${check.repo}` });
    }
  }
  const tagged = /** @type {Json} */ (
    check.ref === undefined ? cache.get(tagKey) : { ref: check.ref }
  );
  if (tagged.error) return { ref: null, error: tagged.error };
  const { ref } = tagged;
  const key = `${check.repo}#${ref}`;
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
export const grantName = (/** @type {string} */ origin) =>
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
export function runBin(
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
export async function linesFor(
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

/**
 * The board, from the runs (any order) and the config. Pure.
 * @returns {{ as_of: string | null, finished: boolean, sites: object[], areas: object[], public_token: boolean }}
 */
export function buildBoard(
  /** @type {{ sites: Json[], areas: Json[], verdicts: Json[] }} */ { sites, areas, verdicts },
  /** @type {Json[]} */ runs,
) {
  const ordered = [...runs].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const newest = ordered.at(-1);
  const cellOf = (
    /** @type {Json} */ run,
    /** @type {unknown} */ area,
    /** @type {unknown} */ site,
  ) => run.results.filter((/** @type {Json} */ r) => r.area === area && r.site === site);
  const passed = (/** @type {Json[]} */ records, /** @type {string[]} */ names) =>
    names.every((name) => records.find((r) => r.check === name)?.status === "pass");
  let finished = Boolean(newest);
  const board = areas.map((area) => {
    const verdict = verdicts.find((v) => v.area === area.id);
    const signedByBuilder = verdict && same(verdict.verifier, area.builder);
    /** @type {Json} */
    const cells = {};
    // A cell no live check grades (the package, and every cell of an area with no checks) is the verdict alone.
    const verdictOnly = (/** @type {string} */ id, /** @type {string} */ none) => {
      const entry = verdict?.cells?.[id];
      return !entry
        ? { status: "missing", reason: none }
        : signedByBuilder
          ? { status: "partial", reason: "signed by its own builder" }
          : {
              status: entry.verdict,
              reason: entry.note ?? `${verdict.verifier}, ${verdict.date}`,
              evidence: entry.evidence,
            };
    };
    cells.package = verdictOnly("package", "no verifier has checked the package");
    for (const site of sites) {
      if (area.skip?.[site.id]) {
        cells[site.id] = { status: "n/a", reason: area.skip[site.id] };
        continue;
      }
      const names = checksFor(area, site).map((/** @type {Json} */ check) => check.name);
      if (area.checks.length && !names.length) {
        cells[site.id] = { status: "n/a", reason: `no check for a ${site.kind}` };
        continue;
      }
      if (!area.checks.length) {
        cells[site.id] = verdictOnly(site.id, "no live check; no verifier has checked it");
        continue;
      }
      cells[site.id] = siteCell({
        area,
        site,
        names,
        verdict,
        signedByBuilder,
        ordered,
        newest,
        cellOf,
        passed,
      });
    }
    // What the checks cannot reach is not proven, so the job is not finished while an area lists any.
    if (Object.keys(area.unchecked ?? {}).length) finished = false;
    for (const [id, cell] of Object.entries(cells)) {
      if (cell.status === "n/a") continue;
      // Clean days count only where a live check runs; a verdict-only cell has none to count.
      const graded = id !== "package" && area.checks.length;
      if (cell.status !== "complete" || (graded && !(cell.clean_days >= CLEAN_DAYS)))
        finished = false;
    }
    return {
      id: area.id,
      name: area.name,
      builder: area.builder,
      verifier: verdict?.verifier ?? null,
      lines: newest?.lines?.[area.id] ?? null,
      unchecked: area.unchecked ?? {},
      cells,
    };
  });
  return {
    as_of: newest?.at ?? null,
    finished,
    public_token: newest?.public_token ?? true,
    sites: sites.map(({ id, name, origin }) => ({ id, name, origin })),
    areas: board,
  };
}

function siteCell(
  /** @type {Json} */ {
    area,
    site,
    names,
    verdict,
    signedByBuilder,
    ordered,
    newest,
    cellOf,
    passed,
  },
) {
  if (!names.length) return { status: "missing", reason: "no live check yet" };
  /** @type {Json[]} */
  const records = newest ? cellOf(newest, area.id, site.id) : [];
  if (!records.length) return { status: "missing", reason: "not run yet" };
  // A measured failure is the cell's answer even when another check could not measure; with no failure, an unmeasured
  // check makes the cell unmeasured, never missing (nothing was shown to be wrong) nor partial or complete.
  const failing = records.filter((r) => r.status === "fail");
  if (failing.length)
    return {
      status: "missing",
      reason: failing.map((r) => `${r.check}: ${r.errors} errors`).join("; "),
      findings: failing.flatMap((r) => r.findings),
    };
  const unmeasured = records.filter((r) => r.status !== "pass");
  if (unmeasured.length)
    return {
      status: "unmeasured",
      reason: unmeasured
        .map((r) => `${r.check} could not measure: ${r.detail ?? "no reason given"}`)
        .join("; "),
      findings: unmeasured.flatMap((r) => r.findings),
    };
  let clean_days = 0;
  for (
    let i = ordered.length - 1;
    i >= 0 && passed(cellOf(ordered[i], area.id, site.id), names);
    i--
  )
    clean_days++;
  const entry = verdict?.cells?.[site.id];
  if (!entry) return { status: "partial", reason: "checks pass; no verifier yet", clean_days };
  if (signedByBuilder)
    return { status: "partial", reason: "signed by its own builder", clean_days };
  const failedAfter = ordered.find(
    (/** @type {Json} */ run) =>
      run.at.slice(0, 10) > verdict.date && !passed(cellOf(run, area.id, site.id), names),
  );
  if (failedAfter)
    return {
      status: "partial",
      reason: `failed on ${failedAfter.at.slice(0, 10)}, after ${verdict.verifier} signed; needs a fresh verifier`,
      clean_days,
    };
  return {
    status: entry.verdict,
    reason: entry.note ?? `${verdict.verifier}, ${verdict.date}`,
    evidence: entry.evidence,
    clean_days,
  };
}

const MARK = { complete: "✅", partial: "🟡", missing: "❌", unmeasured: "❔", "n/a": "·" };

/**
 * Text from a check, a site, an area or a verdict, safe on one line of SCOREBOARD.md and in a table cell: no newline,
 * no `|`, and no HTML or code span (`<`, `>`, `&`, backtick as entities).
 */
export const mdText = (/** @type {unknown} */ text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`/g, "&#96;")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");

/** The board as Markdown, for GitHub to show. */
export function boardMarkdown(/** @type {Json} */ board) {
  const out = ["# Shared-code completeness", ""];
  out.push(
    board.as_of
      ? `Newest run ${board.as_of.slice(0, 16).replace("T", " ")} UTC. Filled only from the live checks and the verifiers' verdicts.`
      : "No run yet.",
  );
  out.push(
    "",
    board.finished
      ? `**Finished:** every cell complete and clean for ${CLEAN_DAYS} daily runs.`
      : `**Not finished.** Finished means every cell complete and clean for ${CLEAN_DAYS} daily runs.`,
    "",
  );
  out.push("✅ complete · 🟡 partial · ❌ missing · ❔ could not measure · `·` does not apply", "");
  out.push(
    `| Area | Package | ${board.sites.map((/** @type {Json} */ s) => mdText(s.name)).join(" | ")} | Lines added | Lines removed |`,
  );
  out.push(`|---|---|${board.sites.map(() => "---").join("|")}|---:|---:|`);
  for (const area of board.areas) {
    const marks = ["package", ...board.sites.map((/** @type {Json} */ s) => s.id)].map(
      (id) => MARK[/** @type {keyof typeof MARK} */ (area.cells[id].status)],
    );
    const lines =
      area.lines &&
      !area.lines.error &&
      Number.isInteger(area.lines.added) &&
      Number.isInteger(area.lines.removed)
        ? [`+${area.lines.added}`, `−${area.lines.removed}`]
        : ["?", "?"];
    out.push(
      `| ${mdText(area.id)}. ${mdText(area.name)} | ${marks.join(" | ")} | ${lines.join(" | ")} |`,
    );
  }
  if (board.public_token)
    out.push("", "Lines count public repositories only until the LIVE_GITHUB_TOKEN secret is set.");
  out.push("", "## Why a cell is not complete", "");
  for (const area of board.areas) {
    const open = Object.entries(area.cells).filter(
      ([, cell]) => cell.status !== "complete" && cell.status !== "n/a",
    );
    const unchecked = Object.entries(area.unchecked ?? {});
    if (!open.length && !unchecked.length) continue;
    out.push(
      `### ${mdText(area.id)}. ${mdText(area.name)}`,
      "",
      `Builder: ${mdText(area.builder)}. Verifier: ${mdText(area.verifier ?? "none yet")}.`,
      "",
    );
    for (const [id, cell] of open) {
      const name =
        id === "package"
          ? "Package"
          : board.sites.find((/** @type {Json} */ s) => s.id === id).name;
      out.push(
        `- ${MARK[/** @type {keyof typeof MARK} */ (cell.status)] ?? "?"} ${mdText(name)}: ${mdText(cell.reason)}`,
      );
      for (const finding of (cell.findings ?? [])
        .filter((/** @type {Json} */ f) => f.severity === "error")
        .slice(0, 5))
        out.push(`  - ${mdText(finding.check)}: ${mdText(finding.detail)}`);
    }
    for (const [what, why] of unchecked) out.push(`- Not checked, ${mdText(what)}: ${mdText(why)}`);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** The runs in a directory; a file that is not a run is skipped with a warning, never the end of the board. */
function readRuns(/** @type {string} */ dir) {
  /** @type {Json[]} */
  const runs = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    try {
      const run = readJsonFile(join(dir, name));
      if (typeof run?.at !== "string" || !Array.isArray(run.results))
        throw new Error('no "at" time and "results" list');
      runs.push(run);
    } catch (error) {
      console.log(
        `::warning title=devkit-live::${escapeAnnotation(`skipped run ${name}: ${error instanceof Error ? error.message : String(error)}`)}`,
      );
    }
  }
  return runs;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const usage = (/** @type {string} */ why) => {
    console.error(
      `devkit-live: ${why}\nusage: devkit-live run --out run.json [--areas 1,2] [--sites id] | board --runs <dir> --out board.json [--md SCOREBOARD.md] | lint`,
    );
    process.exit(2);
  };
  /** @type {{ positionals: string[], values: Record<string, string | undefined> }} */
  let parsed = { positionals: [], values: {} };
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        out: { type: "string" },
        md: { type: "string" },
        runs: { type: "string" },
        config: { type: "string" },
        areas: { type: "string" },
        sites: { type: "string" },
      },
    });
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
  }
  const { positionals, values } = parsed;
  const [command] = positionals;
  if (command === "run" && !values.out) usage("run needs --out");
  if (command === "board" && !(values.runs && values.out)) usage("board needs --runs and --out");
  if (!["run", "board", "lint"].includes(command))
    usage(command ? `no command ${command}` : "no command");
  const config = loadConfig(values.config ?? live);
  const problems = lintConfig(config);
  for (const problem of problems)
    console.log(`::error title=devkit-live::${escapeAnnotation(problem)}`);
  if (problems.length) process.exit(1);
  /** The ids of a comma list, each one of `known`; anything else is a usage error. */
  const pick = (
    /** @type {string | undefined} */ list,
    /** @type {unknown[]} */ known,
    /** @type {string} */ what,
  ) => {
    if (list === undefined) return undefined;
    const ids = list
      .split(",")
      .map((id) => (what === "area" ? (/^\d+$/.test(id) ? Number(id) : id) : id));
    const unknown = ids.filter((id) => !known.includes(id));
    if (unknown.length) usage(`no ${what} ${unknown.join(", ")} in the config`);
    return ids;
  };
  if (command === "lint") {
    console.log(
      `devkit-live: ${config.sites.length} sites, ${config.areas.length} areas, ${config.verdicts.length} verdicts.`,
    );
  } else if (command === "run" && values.out) {
    const run = await runAll(config, {
      onlyAreas: /** @type {number[] | undefined} */ (
        pick(
          values.areas,
          config.areas.map((/** @type {Json} */ a) => a.id),
          "area",
        )
      ),
      onlySites: /** @type {string[] | undefined} */ (
        pick(
          values.sites,
          config.sites.map((/** @type {Json} */ s) => s.id),
          "site",
        )
      ),
      token: process.env.LIVE_GITHUB_TOKEN || process.env.GITHUB_TOKEN,
    });
    writeFileSync(values.out, `${JSON.stringify(run, null, 1)}\n`);
    const counts = Object.groupBy(run.results, (r) => r.status);
    console.log(
      `devkit-live: ${run.results.length} checks; ${
        Object.entries(counts)
          .map(([s, list]) => `${s} ${list?.length}`)
          .join(", ") || "none to run"
      }.`,
    );
  } else if (command === "board" && values.runs && values.out) {
    if (!existsSync(values.runs)) usage(`no runs directory ${values.runs}`);
    const board = buildBoard(config, readRuns(values.runs));
    writeFileSync(values.out, `${JSON.stringify(board, null, 1)}\n`);
    if (values.md) writeFileSync(values.md, boardMarkdown(board));
  }
}
