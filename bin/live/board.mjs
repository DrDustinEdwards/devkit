import { CLEAN_DAYS, checksFor, same } from "./config.mjs";

/** @typedef {import("./config.mjs").Json} Json */

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
const mdText = (/** @type {unknown} */ text) =>
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
