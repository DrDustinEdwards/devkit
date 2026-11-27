// THE GRADUAL ROLLOUT'S ERROR RATES (D4), read by the live gate in worker-deploy.yml.
//
// The two versions' requests and errors since the split come from the GraphQL Analytics API (workersInvocationsAdaptive,
// the dataset behind the dashboard's per-version metrics, grouped by scriptVersion; Cloudflare Docs, "Querying Workers
// metrics with GraphQL" and "Gradual deployments", Observability). Errors are Cloudflare's: an exception, exceeded
// resources or an internal error. The workflow sends the request with curl and pipes the answer here.
//
//   node scripts/error-rates.mjs body     prints the request body (env CLOUDFLARE_ACCOUNT_ID, WORKER, SPLIT_AT)
//   node scripts/error-rates.mjs served   reads an answer on stdin, prints the new version's requests (0 if unreadable)
//   node scripts/error-rates.mjs judge    reads an answer on stdin and judges it (env VERSION_ID, PREVIOUS_VERSION_ID,
//                                         MIN_REQUESTS, MIN_ERRORS): exit 0 promote, 1 refuse, 3 could not read
//
// Fewer than MIN_REQUESTS on the new version is too little to judge, a warning, and it promotes on the gate alone. The new
// version is worse, a refusal, when it has at least MIN_ERRORS errors and its rate is above twice the old one's and above
// it by more than a point.

import { pathToFileURL } from "node:url";

const QUERY =
  "query($account: string!, $script: string!, $since: Time!, $until: Time!) { viewer { accounts(filter: { accountTag: $account }) { workersInvocationsAdaptive(limit: 100, filter: { scriptName: $script, datetime_geq: $since, datetime_leq: $until }) { sum { requests errors } dimensions { scriptVersion } } } } }";

/**
 * @param {{ account: string, script: string, since: string, until: string }} vars
 */
function requestBody(vars) {
  return JSON.stringify({ query: QUERY, variables: vars });
}

/**
 * The rows of an answer, or an Error saying why there are none.
 * @param {string} answer
 * @returns {Row[] | Error}
 */
function rowsOf(answer) {
  try {
    const j = JSON.parse(answer);
    if (j.errors?.length)
      throw new Error(j.errors.map((/** @type {{ message: string }} */ e) => e.message).join("; "));
    const rows = j.data.viewer.accounts[0].workersInvocationsAdaptive;
    if (!Array.isArray(rows)) throw new Error("no workersInvocationsAdaptive rows");
    return rows;
  } catch (error) {
    return error instanceof Error && error.message ? error : new Error("no answer");
  }
}

/** @typedef {{ sum: { requests: number, errors: number }, dimensions?: { scriptVersion?: string } }} Row */

/**
 * @param {Row[]} rows
 * @param {string} id
 * @returns {{ requests: number, errors: number }}
 */
function totals(rows, id) {
  return rows
    .filter((r) => r.dimensions?.scriptVersion === id)
    .reduce(
      (t, r) => ({ requests: t.requests + r.sum.requests, errors: t.errors + r.sum.errors }),
      {
        requests: 0,
        errors: 0,
      },
    );
}

/**
 * @param {{ requests: number, errors: number }} fresh
 * @param {{ requests: number, errors: number }} old
 * @param {{ minRequests: number, minErrors: number }} limits
 * @returns {"few" | "worse" | "fine"}
 */
export function verdict(fresh, old, { minRequests, minErrors }) {
  const rate = (/** @type {{ requests: number, errors: number }} */ v) =>
    v.requests ? v.errors / v.requests : 0;
  if (fresh.requests < minRequests) return "few";
  if (fresh.errors >= minErrors && rate(fresh) > 2 * rate(old) && rate(fresh) > rate(old) + 0.01)
    return "worse";
  return "fine";
}

/** @param {{ requests: number, errors: number }} v */
const pct = (v) =>
  `${v.errors} errors in ${v.requests} requests (${((v.requests ? v.errors / v.requests : 0) * 100).toFixed(2)}%)`;

async function stdin() {
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

async function main() {
  const env = process.env;
  const mode = process.argv[2];
  if (mode === "body") {
    process.stdout.write(
      requestBody({
        account: env.CLOUDFLARE_ACCOUNT_ID ?? "",
        script: env.WORKER ?? "",
        since: env.SPLIT_AT ?? "",
        until: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      }),
    );
    return 0;
  }
  const rows = rowsOf(await stdin());
  if (mode === "served") {
    process.stdout.write(
      String(rows instanceof Error ? 0 : totals(rows, env.VERSION_ID ?? "").requests),
    );
    return 0;
  }
  if (mode !== "judge") {
    console.error("usage: error-rates.mjs body | served | judge");
    return 2;
  }
  if (rows instanceof Error) {
    console.log(
      `::error::could not read the error rates (${rows.message}); the token needs Account Analytics Read. Nothing was promoted or rolled back.`,
    );
    return 3;
  }
  const fresh = env.VERSION_ID ?? "";
  const old = env.PREVIOUS_VERSION_ID ?? "";
  const n = totals(rows, fresh);
  const o = totals(rows, old);
  const minRequests = Number(env.MIN_REQUESTS);
  console.log(`new ${fresh}: ${pct(n)}; old ${old}: ${pct(o)}`);
  const v = verdict(n, o, { minRequests, minErrors: Number(env.MIN_ERRORS) });
  if (v === "few") {
    console.log(
      `::warning::version ${fresh} served ${n.requests} requests since the split, under ${minRequests}, too few to compare error rates; promoting on the live gate alone.`,
    );
  }
  if (v === "worse") {
    console.log(`::error::version ${fresh} is worse than ${old}: ${pct(n)} against ${pct(o)}.`);
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main();
