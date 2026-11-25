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

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { escapeAnnotation } from "./annotate.mjs";
import { isMain } from "../node/index.mjs";
import { lintConfig, live, loadConfig, readLiveJson } from "./live/config.mjs";
import { runAll } from "./live/run.mjs";
import { boardMarkdown, buildBoard } from "./live/board.mjs";

/** @typedef {import("./live/config.mjs").Json} Json */

/** The runs in a directory; a file that is not a run is skipped with a warning, never the end of the board. */
function readRuns(/** @type {string} */ dir) {
  /** @type {Json[]} */
  const runs = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    try {
      const run = readLiveJson(join(dir, name));
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

if (isMain(import.meta.url)) {
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
