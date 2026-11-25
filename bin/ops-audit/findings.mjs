export const TIMEOUT_MS = 15_000;
const STATUSES = ["pass", "warn", "fail"];
const BACKUP_MAX_HOURS = 26;
const DEPLOY_GRACE_MINUTES = 30;
const DRILL_MAX_DAYS = 8;
// A gateway's answer when the Worker is not answering at all (Cloudflare's 52x pages among them): nothing was read.
export const OUTAGE = new Set([502, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

/** The class Capsomer's ErrorPage puts on its region (components/error-page): the shared error page's marker. */
const ERROR_PAGE_MARKER = "cap-error-page";
/** The root wrangler configs read when --wrangler is not given, in order. */
export const WRANGLER_FILES = [
  "wrangler.jsonc",
  "wrangler.json",
  "wrangler.jsonc.example",
  "wrangler.json.example",
];

/** @typedef {{ severity: "error" | "warning", item: string, url: string, detail: string }} Finding */
/** @typedef {{ item: string, url: string, reason: string }} Unread */

/** @typedef {{ name?: unknown, status?: string, detail?: string }} HealthCheck One entry of /health's `checks`, as read. */

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
