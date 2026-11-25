import {
  MAX_FINDINGS,
  REPORT_MAX_AGE_MINUTES,
  STATUSES,
  MAX_REPORT,
  UNMEASURED_PREFIX,
  EXIT_UNMEASURED,
} from "./config.mjs";
/** @import { Json } from "./config.mjs" */

/** Undoes bin/annotate.mjs's escapes (`%25`, `%0D`, `%0A`, and in a property `%3A`, `%2C`), in one pass. */
const unescapeAnnotation = (/** @type {string} */ text) =>
  text.replace(/%(25|0D|0A|3A|2C)/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

/** The annotation lines of a check's output, as findings; a ::notice is a finding only when it says what was not measured. */
function parseFindings(/** @type {string} */ output) {
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
export const unmeasuredResult = (/** @type {string} */ detail) => ({
  status: "unmeasured",
  errors: 0,
  warnings: 0,
  unmeasured: 0,
  findings: [],
  detail,
});

/** A reported check's report, or why it could not be read (the HTTP status, a body over MAX_REPORT, bad JSON). */
export async function fetchReport(/** @type {string} */ url) {
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
