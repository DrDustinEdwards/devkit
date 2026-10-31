// The conformance gate's verdicts: a recorded count must hold exactly, in both directions, and a scenario with none
// must pass every check. The suite itself runs only against wrangler dev, locally; here stand-ins for wrangler and the
// suite let the gate's own checks run.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { judge, summarize } from "../bin/conformance.mjs";

test("reads both summary forms the suite prints", () => {
  assert.deepEqual(summarize("...\nPassed: 24/28\n"), { passed: 24, total: 28 });
  assert.deepEqual(summarize("Total: 3 passed, 1 failed"), { passed: 3, total: 4 });
  assert.equal(summarize("crashed"), null);
});

test("a baseline fails on regress, improve and recount; no baseline means every check passes", () => {
  const want = { spec: "2026-07-28", scenario: "server-stateless", passed: 24, total: 28, note: "upstream" };
  assert.deepEqual(judge(want, { passed: 24, total: 28 }), { failed: false, line: "  BASELINE   2026-07-28  server-stateless  24/28  (upstream)" });
  assert.match(judge(want, { passed: 23, total: 28 }).line, /REGRESSED/);
  assert.match(judge(want, { passed: 25, total: 28 }).line, /IMPROVED .* tighten it/);
  assert.match(judge(want, { passed: 24, total: 29 }).line, /RECOUNT/);
  assert.equal(judge({ spec: "2025-11-25", scenario: "server-initialize" }, { passed: 2, total: 3 }).failed, true);
  assert.equal(judge({ spec: "2025-11-25", scenario: "server-initialize" }, null).failed, true);
});

test("PLANT: the gate fails an authorization server that hides CIMD or registers a callback off the allowlist, and passes what it gets right", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "conformance-"));
  const file = (/** @type {string} */ path, /** @type {string} */ text) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  // wrangler: `d1` records its arguments; `dev` serves on --port an authorization server with the two planted mistakes.
  file(
    "node_modules/wrangler/bin/wrangler.js",
    `const { createServer } = require("node:http");
const args = process.argv.slice(2);
if (args[0] === "d1") return require("node:fs").writeFileSync("migrated.txt", args.join(" "));
const port = Number(args[args.indexOf("--port") + 1]);
const origin = "http://localhost:" + port;
createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const json = (status, value, headers = {}) => res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(value));
    if (req.url === "/.well-known/oauth-authorization-server") return json(200, { registration_endpoint: origin + "/register" });
    if (req.url === "/register") return json(201, { client_id: "c1" });
    json(401, {}, { "www-authenticate": 'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource"' });
  });
}).listen(port);
`,
  );
  file("node_modules/@modelcontextprotocol/conformance/dist/index.js", 'console.log(process.argv[2] === "server" ? "Passed: 3/3" : "FAIL one check\\nTotal: 1 passed, 1 failed");\n');
  file("auth.jsonc", '{ "vars": { "ALLOWED": "https://example.com/cb, https://example.com/other" } }');
  file("after.mjs", 'export default ({ pass }) => pass("the after hook ran");\n');
  const port = 20000 + Math.floor(Math.random() * 20000);
  file(
    ".conformance.json",
    JSON.stringify({
      mcp: { port, migrate: "DB", persist: "state" },
      auth: { port: port + 1, config: "auth.jsonc" },
      scenarios: [{ spec: "2026-07-28", scenario: "server-stateless", passed: 3, total: 3 }],
      registration: { allowed: { var: "ALLOWED" } },
      after: "after.mjs",
    }),
  );
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/conformance.mjs", import.meta.url))], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    const lines = r.stdout.split("\n");
    assert.equal(r.status, 1, r.stdout);
    for (const line of [
      `wrangler dev on :${port} against the real protocol layer`,
      "  BASELINE   2026-07-28  server-stateless  3/3",
      "  FAIL       2026-07-28  authorization-server-metadata-endpoint  (1/2)",
      "               FAIL one check",
      "  FAIL       metadata does not advertise client_id_metadata_document_supported",
      "  PASS       metadata advertises the registration endpoint at /register",
      "  PASS       POST /register registers https://example.com/cb, and grants nothing (201, no token)",
      "  FAIL       POST /register answered 201  for a callback off the allowlist",
      "  PASS       /mcp without a token answers 401 with a resource_metadata challenge",
      "  PASS       the after hook ran",
      "devkit-conformance: 3 check(s) failed.",
    ]) {
      assert.ok(lines.includes(line), `${line}\n${r.stdout}`);
    }
    assert.equal(readFileSync(join(dir, "migrated.txt"), "utf8"), "d1 migrations apply DB --local -c wrangler.jsonc --persist-to state");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
