// The bins sites used to keep as local scripts: size-budget, tokens, gates, db-migrate and fetch-fonts.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { plan } from "../bin/db-migrate.mjs";
import { parseFaces } from "../bin/fetch-fonts.mjs";
import { countGates } from "../bin/gates.mjs";
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
  const cfg = (/** @type {number} */ js) =>
    JSON.stringify({
      initial_js_kb: js,
      lazy_chunk_kb: 1,
      css_kb: 1,
      lazy_css_kb: 1,
      server: "build/server/index.mjs",
    });
  const ok = run("size-budget", [], { ".size-budget.json": cfg(5), ...build(2000) });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /size-budget: pass/);
  const over = run("size-budget", [], { ".size-budget.json": cfg(1), ...build(20000) });
  assert.equal(over.status, 1);
  assert.match(over.out, /initial JS of routes\/home/);
  assert.equal(run("size-budget", [], { ".size-budget.json": cfg(5) }).status, 1);
  assert.equal(run("size-budget", [], build(10)).status, 1);
  const { "build/client/assets/home.js": _gone, ...missing } = build(10);
  assert.equal(run("size-budget", [], { ".size-budget.json": cfg(5), ...missing }).status, 1);
});
