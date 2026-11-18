// The bins sites used to keep as local scripts: size-budget, tokens, gates, db-migrate and fetch-fonts.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { plan } from "../bin/db-migrate.mjs";
import { parseFaces } from "../bin/fetch-fonts.mjs";
import { countGates } from "../bin/gates.mjs";
import { testsWithoutAssertions } from "../bin/test-assertions.mjs";
import { scanContent } from "../bin/tokens.mjs";

const bin = (/** @type {string} */ name) =>
  fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url));

/** Runs a bin in a scratch directory holding `files`. */
function run(
  /** @type {string} */ name,
  /** @type {string[]} */ args,
  /** @type {Record<string, string>} */ files,
) {
  const dir = mkdtempSync(join(tmpdir(), "site-scripts-"));
  try {
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    const r = spawnSync(process.execPath, [bin(name), ...args], { cwd: dir, encoding: "utf8" });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("tokens: catches planted hex and px font sizes, passes look-alikes and exempt paths", () => {
  const TSX = "app/x.tsx";
  assert.deepEqual(scanContent(TSX, "<span>&#10003; &#123;</span>"), []);
  assert.equal(scanContent(TSX, "const c = #10003;").length, 1);
  assert.equal(scanContent("app/x.css", "a{color:#abc}").length, 1);
  assert.equal(scanContent(TSX, '<p className="text-[clamp(28px,5vw,44px)]">').length, 1);
  assert.equal(scanContent("app/x.css", "a{font-size:13px}").length, 1);
  assert.equal(scanContent(TSX, '<p style={{ fontSize: "13px" }}>').length, 1);
  assert.deepEqual(
    scanContent(TSX, '<p className="mt-[7px] w-[680px]" style={{padding:"10px"}}>'),
    [],
  );
  const cfg = { hex_exempt: ["app/app.css", "app/email/"], px_font_exempt: ["app/email/"] };
  assert.deepEqual(scanContent("app/app.css", "--b:#f0b429;", cfg), []);
  assert.deepEqual(scanContent("app/email/t.ts", 'x="#111"; font-size:12px', cfg), []);
  assert.equal(scanContent("app/app.css", "a{font-size:12px}", cfg).length, 1);
});

test("tokens: bin fails on a violation, passes clean, and fails closed on no config, no dirs or no files", () => {
  const cfg = JSON.stringify({ dirs: ["app"] });
  assert.equal(
    run("tokens", [], { ".tokens.json": cfg, "app/a.css": "a{color:var(--x)}" }).status,
    0,
  );
  const bad = run("tokens", [], { ".tokens.json": cfg, "app/a.css": "a{color:#fff}" });
  assert.equal(bad.status, 1);
  assert.match(bad.out, /raw hex color "#fff"/);
  assert.equal(run("tokens", [], { "app/a.css": "" }).status, 1);
  assert.equal(run("tokens", [], { ".tokens.json": "{}", "app/a.css": "" }).status, 1);
  assert.equal(run("tokens", [], { ".tokens.json": cfg, "app/readme.md": "" }).status, 1);
});

test("gates: counts invocations, not the gate check, and fails below the minimum or with no script", () => {
  assert.deepEqual(countGates("npm run a && npm run b && npm run check-gates"), [
    "npm run a",
    "npm run b",
  ]);
  const pkg = (/** @type {string | undefined} */ chain) =>
    JSON.stringify({ scripts: chain ? { "check:all": chain } : {} });
  assert.equal(
    run("gates", ["--min", "2"], {
      "package.json": pkg("npm run a && npm run b && devkit-gates --min 2"),
    }).status,
    0,
  );
  assert.equal(
    run("gates", ["--min", "3"], { "package.json": pkg("npm run a && npm run b") }).status,
    1,
  );
  assert.equal(run("gates", ["--min", "1"], { "package.json": pkg(undefined) }).status, 1);
  assert.equal(run("gates", [], { "package.json": pkg("npm run a") }).status, 1);
});

test("db-migrate: local by default, remote only with --remote-confirm, a bare --remote refused", () => {
  const local = plan(["foxhound"]);
  assert.ok(!("error" in local) && !local.remote);
  assert.ok(
    !("error" in local) &&
      local.wranglerArgs.includes("--local") &&
      local.wranglerArgs.includes("--no-install"),
  );
  const remote = plan(["foxhound", "--remote-confirm", "--x"]);
  assert.ok(!("error" in remote) && remote.remote);
  assert.ok(!("error" in remote) && remote.wranglerArgs.slice(-2).join(" ") === "--remote --x");
  assert.ok("error" in plan(["foxhound", "--remote"]));
  assert.ok("error" in plan([]));
});

test("fetch-fonts: keeps the subsets asked, reads each face, and refuses a face missing a field", () => {
  const face = (/** @type {string} */ subset) =>
    `/* ${subset} */\n@font-face {\n  font-family: 'Fraunces';\n  font-style: normal;\n  font-weight: 400 600;\n  src: url(https://fonts.gstatic.com/a-${subset}.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}\n`;
  const css = `${face("cyrillic")}${face("latin")}${face("latin-ext")}`;
  const faces = parseFaces(css, new Set(["latin", "latin-ext"]));
  assert.deepEqual(
    faces.map((f) => f.subset),
    ["latin", "latin-ext"],
  );
  assert.equal(faces[0].url, "https://fonts.gstatic.com/a-latin.woff2");
  assert.throws(
    () => parseFaces("/* latin */\n@font-face { font-family: 'X'; }", new Set(["latin"])),
    /no font-weight|no font-style/,
  );
});

test("size-budget: passes within the limits and fails over one, on a missing build or on a manifest naming a missing file", () => {
  const build = (/** @type {number} */ jsBytes) => {
    const noise = randomBytes(jsBytes).toString("base64");
    const manifest = {
      url: "/assets/manifest.js",
      entry: { module: "/assets/entry.js", imports: [], css: [] },
      routes: {
        root: { id: "root", module: "/assets/root.js", imports: [], css: ["/assets/app.css"] },
        "routes/home": {
          id: "routes/home",
          parentId: "root",
          module: "/assets/home.js",
          imports: [],
        },
      },
    };
    return {
      "build/server/index.mjs": `export const assets = ${JSON.stringify(manifest)};`,
      "build/client/assets/manifest.js": "m",
      "build/client/assets/entry.js": noise,
      "build/client/assets/root.js": "r",
      "build/client/assets/home.js": "h",
      "build/client/assets/app.css": "a{}",
      "build/client/assets/lazy.js": "l",
    };
  };
  const cfg = (/** @type {number} */ js, /** @type {number=} */ total) =>
    JSON.stringify({
      initial_js_kb: js,
      lazy_chunk_kb: 1,
      css_kb: 1,
      lazy_css_kb: 1,
      total_js_kb: total,
      server: "build/server/index.mjs",
    });
  const ok = run("size-budget", [], { ".size-budget.json": cfg(5), ...build(2000) });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /size-budget: pass/);
  const over = run("size-budget", [], { ".size-budget.json": cfg(1), ...build(20000) });
  assert.equal(over.status, 1);
  assert.match(over.out, /initial JS of routes\/home/);
  // Every page and chunk together, when the budget sets it.
  const total = run("size-budget", [], { ".size-budget.json": cfg(5, 1), ...build(2000) });
  assert.equal(total.status, 1);
  assert.match(total.out, /all JS is .* over 1\.0 KB/);
  assert.equal(run("size-budget", [], { ".size-budget.json": cfg(5) }).status, 1);
  assert.equal(run("size-budget", [], build(10)).status, 1);
  const { "build/client/assets/home.js": _gone, ...missing } = build(10);
  assert.equal(run("size-budget", [], { ".size-budget.json": cfg(5), ...missing }).status, 1);
});

test("test-assertions: flags a test that asserts nothing, accepts every assertion shape, holds the floor", () => {
  const names = (/** @type {string} */ s) => testsWithoutAssertions(s).map((f) => f.name);
  assert.deepEqual(names(`test("bare", () => { run(1); });`), ["bare"]);
  assert.deepEqual(names(`test("a", () => { assert.equal(run(1), 2); });`), []);
  assert.deepEqual(names(`it("a", async () => { expect(await run(1)).toBe(2); });`), []);
  assert.deepEqual(names(`test("a", async () => { await assert.rejects(run(1)); });`), []);
  assert.deepEqual(
    names(`function same(a) { assert.equal(a, 1); }\ntest("a", () => { same(run(1)); });`),
    [],
  );
  assert.deepEqual(names(`function noop(a) { return a; }\ntest("a", () => { noop(run(1)); });`), [
    "a",
  ]);
  assert.deepEqual(names(`test("a", () => { const x = "\\")"; const r = /[")]/; run(r, x); });`), [
    "a",
  ]);
  assert.deepEqual(names('test("a", () => { const s = `${ {a: 1}.a }`; assert.ok(s); });'), []);
  const files = (/** @type {string} */ body) => ({ "t/a.test.mjs": body });
  const cfg = (/** @type {object} */ o) => JSON.stringify({ dirs: ["t"], ...o });
  const bare = `test("x", () => { run(); });`;
  assert.equal(
    run("test-assertions", [], { ".test-assertions.json": cfg({}), ...files(bare) }).status,
    1,
  );
  assert.equal(
    run("test-assertions", [], { ".test-assertions.json": cfg({ enforce: false }), ...files(bare) })
      .status,
    0,
  );
  assert.equal(
    run("test-assertions", [], {
      ".test-assertions.json": cfg({ floor: 2 }),
      ...files(`test("x", () => { assert.ok(1); });`),
    }).status,
    1,
  );
  assert.equal(
    run("test-assertions", [], { ".test-assertions.json": cfg({}), "t/readme.md": "" }).status,
    1,
  );
});

test("verify-deploy: 0 on a served site, 1 on a refusal, 3 when it could not decide", async () => {
  const server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    const routes = /** @type {Record<string, [number, string]>} */ ({
      "/": [200, '<link href="/assets/app-1.css"><script src="/assets/app-1.js">'],
      "/assets/app-1.css": [200, "a{}"],
      "/assets/app-1.js": [200, ""],
      "/broken": [500, "x"],
      "/health-ok": [200, '{"status":"warn"}'],
      "/health-fail": [200, '{"status":"fail"}'],
      "/bare": [200, "<p>no assets</p>"],
    });
    const [code, body] = routes[path] ?? [404, ""];
    res.writeHead(code).end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
  const origin = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`;
  const verify = (/** @type {string[]} */ args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [bin("verify-deploy"), ...args], { stdio: "ignore" });
      child.on("exit", (code) => resolve(code));
    });
  try {
    assert.equal(await verify([origin]), 0);
    assert.equal(await verify([origin, "--page", "/", "--health", "/health-ok", "--assets"]), 0);
    assert.equal(await verify([origin, "--page", "/broken"]), 1);
    assert.equal(await verify([origin, "--health", "/health-fail"]), 1);
    assert.equal(await verify([origin, "--page", "/bare", "--assets", "--attempts", "1"]), 3);
    assert.equal(await verify(["not-an-origin"]), 2);
  } finally {
    server.closeAllConnections();
    server.close();
  }
  assert.equal(await verify(["http://127.0.0.1:1"]), 3);
});
