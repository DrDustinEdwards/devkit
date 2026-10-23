#!/usr/bin/env node
// The MCP conformance gate. Runs the official suite (@modelcontextprotocol/conformance) against a Worker's real protocol
// layer under `wrangler dev`, per era, and against its authorization server, then pins the two client-identity paths
// the suite treats as optional: CIMD advertised, and a /register that registers only an allowlisted callback.
//
// COUNTS, NOT PASS/FAIL. A scenario with a recorded `passed` must not regress, and a count that improves fails too, so
// the baseline gets tightened; one with none must pass every check. Demanding 100% would be a permanently red gate on
// upstream SDK gaps; asserting nothing would be a gate that cannot notice the protocol breaking. Judged on the parsed
// count, not the exit code: on Windows the suite can abort in teardown after printing its results.
//
// Runs locally, never on Actions (a full sweep takes minutes against wrangler dev).
//
//   npx devkit-conformance                    reads .conformance.json
//   npx devkit-conformance --config <file>
//
// The config (wrangler and @modelcontextprotocol/conformance come from the repository's own node_modules):
//
//   {
//     "mcp": { "entry": "test/conformance/entry.ts", "config": "wrangler.jsonc", "port": 8789,
//              "persist": ".wrangler/state-conformance", "migrate": "DB", "vars": { "NAME": "value" } },
//     "auth": { "config": "wrangler.jsonc", "port": 8791, "persist": ".wrangler/state-conformance-auth",
//               "localUpstream": true, "resourceMetadata": true },
//     "stub": 8790,
//     "scenarios": [{ "spec": "2026-07-28", "scenario": "server-stateless", "passed": 24, "total": 28, "note": "why" }],
//     "registration": { "allowed": "https://example.com/callback" },
//     "after": "scripts/conformance-extra.mjs"
//   }
//
// `entry` is optional (wrangler.jsonc's main otherwise). `migrate` applies that D1 binding's migrations locally first.
// `stub` answers every request with { ok: true } on that port, a stand-in for an API the tools call. `registration.allowed`
// is a callback /register must accept, or { "var": "NAME" } to take the first from that var in the auth config (or its
// .example); left out, only the refusal is checked. `resourceMetadata: false` accepts a 401 from /mcp whose challenge
// lacks resource_metadata (RFC 9728), for a server that does not advertise it yet. `after` is a module whose default export runs last with
// { origin, pass, fail }, for the site's own checks against the auth server.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const AUTH_SCENARIOS = [{ spec: "2026-07-28", scenario: "authorization-server-metadata-endpoint" }];
const OFF_LIST = "http://127.0.0.1:3000/callback";

/**
 * @typedef {{ spec: string, scenario: string, passed?: number | null, total?: number | null, note?: string }} Scenario
 * @typedef {{ entry?: string, config?: string, port?: number, persist?: string, migrate?: string, vars?: Record<string, string>,
 *   localUpstream?: boolean, resourceMetadata?: boolean, scenarios?: Scenario[] }} Server
 */

/** The pass count the suite printed, in either of its two summary forms; null when it printed neither. */
export function summarize(/** @type {string} */ out) {
  const m = out.match(/Passed:\s*(\d+)\/(\d+)/);
  if (m) return { passed: Number(m[1]), total: Number(m[2]) };
  const s = out.match(/Total:\s*(\d+)\s+passed,\s*(\d+)\s+failed/);
  if (s) return { passed: Number(s[1]), total: Number(s[1]) + Number(s[2]) };
  return null;
}

/**
 * One scenario's verdict against its baseline: the line to print and whether it failed the gate.
 * @param {Scenario} want
 * @param {{ passed: number, total: number } | null} got
 */
export function judge(want, got) {
  const label = `${want.spec}  ${want.scenario}`;
  if (!got) return { failed: true, line: `  NO RESULT  ${label}  (could not parse a count from the suite output)` };
  const n = `${got.passed}/${got.total}`;
  if (want.passed == null) {
    return got.passed === got.total ? { failed: false, line: `  PASS       ${label}  (${n})` } : { failed: true, line: `  FAIL       ${label}  (${n})` };
  }
  if (got.total !== want.total) return { failed: true, line: `  RECOUNT    ${label}  total moved ${want.total} -> ${got.total}; the suite changed, re-baseline` };
  if (got.passed < want.passed) return { failed: true, line: `  REGRESSED  ${label}  ${n}, baseline ${want.passed}` };
  if (got.passed > want.passed) return { failed: true, line: `  IMPROVED   ${label}  ${n} beats baseline ${want.passed}; tighten it` };
  return { failed: false, line: `  BASELINE   ${label}  ${n}${want.note ? `  (${want.note})` : ""}` };
}

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--config");
  const root = process.cwd();
  const config = JSON.parse(readFileSync(resolve(root, at >= 0 ? argv[at + 1] : ".conformance.json"), "utf8"));
  const wranglerJs = resolve(root, "node_modules/wrangler/bin/wrangler.js");
  const suiteJs = resolve(root, "node_modules/@modelcontextprotocol/conformance/dist/index.js");
  /** @type {Server} */
  const mcp = { port: 8789, config: "wrangler.jsonc", ...config.mcp };
  /** @type {Server} */
  const auth = { port: 8791, config: "wrangler.jsonc", scenarios: AUTH_SCENARIOS, ...config.auth };
  const origin = `http://localhost:${auth.port}`;
  let failures = 0;
  const log = (/** @type {string} */ s) => process.stdout.write(`${s}\n`);
  const pass = (/** @type {string} */ what) => log(`  PASS       ${what}`);
  const fail = (/** @type {string} */ what) => (failures++, log(`  FAIL       ${what}`));

  const wrangler = (/** @type {string[]} */ args) => execFileSync(process.execPath, [wranglerJs, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const dev = (/** @type {Server} */ s) => {
    const args = [wranglerJs, "dev", ...(s.entry ? [s.entry] : []), "-c", String(s.config), "--port", String(s.port)];
    // Each process needs its own inspector port (both default to 9229) and, for a Durable Object, its own state
    // directory: two processes on one die at SQLITE_BUSY.
    args.push("--inspector-port", String(Number(s.port) + 1000));
    if (s.persist) args.push("--persist-to", s.persist);
    // A config routed to a Custom Domain makes wrangler dev rewrite each request to that host, so the issuer would stop
    // matching the URL the suite fetched.
    if (s.localUpstream) args.push("--local-upstream", `localhost:${s.port}`);
    for (const [k, v] of Object.entries(s.vars ?? {})) args.push("--var", `${k}:${v}`);
    const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    return { child, output: () => output.slice(-3000) };
  };
  const suite = (/** @type {string[]} */ args) => {
    try {
      // Per-scenario timeout: one hanging scenario must not hang the gate.
      return { ok: true, out: execFileSync(process.execPath, [suiteJs, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }) };
    } catch (error) {
      const e = /** @type {{ stdout?: string, stderr?: string }} */ (error);
      return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  };
  const runAll = (/** @type {"server" | "authorization"} */ kind, /** @type {string} */ url, /** @type {Scenario[]} */ scenarios) => {
    for (const want of scenarios) {
      const { ok, out } = suite([kind, "--url", url, "--scenario", want.scenario, "--spec-version", want.spec]);
      const verdict = judge(want, summarize(out));
      if (verdict.failed) failures++;
      log(`${verdict.line}${ok ? "" : "  [suite exited non-zero]"}`);
      // The failing checks, printed so a baseline's note stays a measurement rather than a memory.
      for (const l of out.split("\n").filter((x) => /FAIL/.test(x)).slice(0, 8)) log(`               ${l.trim().slice(0, 170)}`);
      if (!summarize(out)) log(out.slice(-1500));
    }
  };
  const waitFor = async (/** @type {string} */ url, /** @type {RequestInit} */ init, ready = (/** @type {Response} */ r) => r.status > 0) => {
    for (const deadline = Date.now() + 120_000; Date.now() < deadline; await sleep(1000)) {
      try {
        if (ready(await fetch(url, init))) return true;
      } catch {
        /* not up yet */
      }
    }
    return false;
  };

  const stub = config.stub
    ? await new Promise((done) => {
        const server = createServer((req, res) => {
          req.resume();
          req.on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, data: { stub: true } })));
        });
        server.listen(config.stub, () => done(server));
      })
    : null;
  if (mcp.migrate) wrangler(["d1", "migrations", "apply", mcp.migrate, "--local", "-c", String(mcp.config), ...(mcp.persist ? ["--persist-to", mcp.persist] : [])]);
  const servers = [dev(mcp), dev(auth)];
  const shutdown = () => {
    for (const { child } of servers) child.kill();
    /** @type {import("node:http").Server | null} */ (stub)?.close();
  };
  process.on("exit", shutdown);

  const initialize = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  if (!(await waitFor(`http://localhost:${mcp.port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: initialize }))) {
    log(`wrangler dev (protocol) did not come up. Output follows:\n${servers[0].output()}`);
    process.exit(2);
  }
  log(`wrangler dev on :${mcp.port} against the real protocol layer\n`);
  runAll("server", `http://localhost:${mcp.port}/mcp`, config.scenarios ?? []);

  if (!(await waitFor(`${origin}/.well-known/oauth-authorization-server`, {}, (r) => r.ok))) {
    fail(`authorization: wrangler dev on the auth entry did not come up. Output follows:\n${servers[1].output()}`);
  } else {
    runAll("authorization", origin, auth.scenarios ?? AUTH_SCENARIOS);
    const meta = await (await fetch(`${origin}/.well-known/oauth-authorization-server`)).json();
    if (meta.client_id_metadata_document_supported === true) pass("metadata advertises CIMD (the path claude.ai and Claude Code take)");
    else fail("metadata does not advertise client_id_metadata_document_supported");
    if (meta.registration_endpoint === `${origin}/register`) pass("metadata advertises the registration endpoint at /register");
    else fail(`metadata advertises registration_endpoint ${meta.registration_endpoint}, not ${origin}/register`);

    const register = (/** @type {string} */ uri) =>
      fetch(`${origin}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: "devkit-conformance", redirect_uris: [uri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
      });
    const allowed = allowedCallback(root, auth, config.registration?.allowed);
    if (!allowed) log("  SKIP       no allowlisted callback configured, so only the refusal is checked");
    else {
      const r = await register(allowed);
      const body = await r.json().catch(() => ({}));
      if (r.status === 201 && typeof body.client_id === "string" && body.client_id && body.access_token === undefined) pass(`POST /register registers ${allowed}, and grants nothing (201, no token)`);
      else fail(`POST /register answered ${r.status} for the allowlisted ${allowed}`);
    }
    const refused = await register(OFF_LIST);
    const refusedBody = await refused.json().catch(() => ({}));
    if (refused.status === 400 && refusedBody.error === "invalid_redirect_uri") pass("POST /register refuses a callback off the allowlist (400 invalid_redirect_uri)");
    else fail(`POST /register answered ${refused.status} ${refusedBody.error ?? ""} for a callback off the allowlist`);
    const unauth = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const challenge = unauth.headers.get("www-authenticate") ?? "";
    if (unauth.status === 401 && (auth.resourceMetadata === false || challenge.includes("resource_metadata="))) {
      pass(`/mcp without a token answers 401${auth.resourceMetadata === false ? " (resource_metadata not required by this config)" : " with a resource_metadata challenge"}`);
    } else fail(`/mcp without a token answered ${unauth.status} (${challenge})`);

    if (config.after) await (await import(pathToFileURL(resolve(root, config.after)).href)).default({ origin, pass, fail });
  }

  log("");
  shutdown();
  if (failures) {
    log(`devkit-conformance: ${failures} check(s) failed.`);
    process.exit(1);
  }
  log("devkit-conformance: no regression against the recorded baseline in any era, and the authorization server serves CIMD and the allowlisted registration only.");
}

/** The callback /register must accept: a literal, or the first entry of a var in the auth server's wrangler config. */
function allowedCallback(/** @type {string} */ root, /** @type {Server} */ auth, /** @type {string | { var: string } | undefined} */ allowed) {
  if (typeof allowed !== "object") return allowed;
  const file = [auth.config, `${auth.config}.example`].map((f) => resolve(root, String(f))).find((f) => existsSync(f));
  const text = file ? readFileSync(file, "utf8") : "";
  const list = new RegExp(`"${allowed.var}":\\s*"([^"]*)"`).exec(text)?.[1] ?? "";
  return list.split(",").map((u) => u.trim()).find(Boolean);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
