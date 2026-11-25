import { finding } from "./probes.mjs";
import { githubFile } from "./net.mjs";

/** @typedef {import("./probes.mjs").Finding} Finding */
/** @typedef {import("./probes.mjs").Unread} Unread */

/** The root wrangler configs read when --wrangler is not given, in order. */
const WRANGLER_FILES = [
  "wrangler.jsonc",
  "wrangler.json",
  "wrangler.jsonc.example",
  "wrangler.json.example",
];

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
 * H5 against the repository: reads the wrangler config (the named one, else the first root config that exists) and the
 * `.ops-audit.json` beside it, and compares the bindings with /health's checks.
 * @param {{ repo: string, branch: string, path?: string, health: any, healthUrl: string, findings: Finding[], unread: Unread[], say: (line: string) => void }} run
 */
export async function bindingCheck({
  repo,
  branch,
  path,
  health,
  healthUrl,
  findings,
  unread: all,
  say,
}) {
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
      exempt = JSON.parse(extra.text) ?? {};
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
