/** @typedef {{ severity: "error" | "warning", item: string, url: string, detail: string }} Finding */
/** @typedef {{ item: string, url: string, reason: string }} Unread */
/** @typedef {{ name?: unknown, status?: string, detail?: string }} HealthCheck One entry of /health's `checks`, as read. */

const STATUSES = ["pass", "warn", "fail"];

const BACKUP_MAX_HOURS = 26;

const DEPLOY_GRACE_MINUTES = 30;

const DRILL_MAX_DAYS = 8;

/** The class Capsomer's ErrorPage puts on its region (components/error-page): the shared error page's marker. */
const ERROR_PAGE_MARKER = "cap-error-page";

export const finding = (
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
 * H4 against the branch: the live sha must be the head, or a later commit that contains it (a Worker that deploys on
 * every push serves the branch's newest sha, past the newest commit touching its own path). A head younger than the
 * grace may still be deploying.
 * @param {{ url: string, liveSha: string, head: { sha: string, date: string, url: string }, liveContainsHead?: boolean, now?: number }} read
 * @returns {Finding[]}
 */
export function shaFindings({ url, liveSha, head, liveContainsHead = false, now = Date.now() }) {
  const live = String(liveSha).toLowerCase();
  const sha = head.sha.toLowerCase();
  if (liveContainsHead || sha.startsWith(live) || live.startsWith(sha)) return [];
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
