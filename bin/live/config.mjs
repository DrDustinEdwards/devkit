import { existsSync, readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { GRANT_ENV } from "./runner.mjs";

/** @typedef {Record<string, any>} Json A site, area, check, verdict, run or cell: JSON the config and the runs hold. */

export const CLEAN_DAYS = 7;
export const OWNER = "DrDustinEdwards";
const KINDS = ["site", "static", "worker", "app"];
const VERDICTS = ["complete", "partial", "missing"];
export const MAX_FINDINGS = 100;
export const CHECK_TIMEOUT_MS = 20 * 60_000;
export const PARALLEL = 4;
export const REPORT_MAX_AGE_MINUTES = 60;
export const STATUSES = ["pass", "fail", "unmeasured"];
export const MAX_OUTPUT = 5 * 1024 * 1024;
export const MAX_REPORT = 2 * 1024 * 1024;
/** The longest a rate-limited GitHub read waits before it gives up and the area's lines are unmeasured. */
export const MAX_RATE_WAIT_MS = 60_000;
/** The detail an unmeasured item's ::notice line starts with. */
export const UNMEASURED_PREFIX = "could not measure: ";
/** A check's exit when nothing failed but something could not be measured (Monitoring Plugins' UNKNOWN). */
export const EXIT_UNMEASURED = 3;

export const live = new URL("../../live/", import.meta.url);
export const readJsonFile = (/** @type {string | URL} */ path) =>
  JSON.parse(readFileSync(path, "utf8"));

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

export const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Boolean(a.trim()) &&
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The checks of an area that apply to a site. */
export const checksFor = (/** @type {Json} */ area, /** @type {Json} */ site) =>
  area.checks
    .filter((/** @type {Json} */ check) => (check.kinds ?? ["site", "static"]).includes(site.kind))
    .map((/** @type {Json} */ check) =>
      check.site_reports?.[site.id] ? { ...check, report: check.site_reports[site.id] } : check,
    );
