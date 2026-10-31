// The route weight walk: a route weighs the entry, then root down to itself, each file once. Sizes are the files' lengths,
// so each expected total is the sum of the files it names.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { check, routeWeights } from "../bin/route-weight.mjs";

const FILES = {
  "/assets/entry.js": 1,
  "/assets/shared.js": 10,
  "/assets/root.js": "x".repeat(100 - "/assets/app.css".length) + "/assets/app.css",
  "/assets/root.css": 1000,
  "/assets/admin.js": 10000,
  "/assets/admin.users.js": 100000,
  "/assets/app.css": 1000000,
};

/** @type {import("../bin/route-weight.mjs").Manifest} */
const MANIFEST = {
  entry: { module: "/assets/entry.js", imports: ["/assets/shared.js"] },
  routes: {
    root: { id: "root", module: "/assets/root.js", imports: ["/assets/shared.js"], css: ["/assets/root.css"], hasDefaultExport: true },
    "routes/admin": { id: "routes/admin", parentId: "root", path: "admin", module: "/assets/admin.js", imports: ["/assets/shared.js"], css: ["/assets/root.css"], hasDefaultExport: true },
    "routes/admin.users": { id: "routes/admin.users", parentId: "routes/admin", path: "users", module: "/assets/admin.users.js", hasDefaultExport: true },
    "routes/feed": { id: "routes/feed", parentId: "root", path: "feed.xml", module: "/assets/admin.js", hasDefaultExport: false },
  },
};

const read = (/** @type {string} */ url) => {
  const file = FILES[/** @type {keyof typeof FILES} */ (url)];
  return Buffer.from(typeof file === "string" ? file : "x".repeat(file));
};
const size = (/** @type {Buffer} */ bytes) => bytes.length;

test("each route weighs the entry and its chain from root, each file once; root and resource routes have no row", () => {
  assert.deepEqual(routeWeights(MANIFEST, read, size), [
    { id: "routes/admin.users", path: "/admin/users", js: 110111, css: 1000, total: 111111 },
    { id: "routes/admin", path: "/admin", js: 10111, css: 1000, total: 11111 },
  ]);
});

test("with linkedCss, a stylesheet the counted JS names by URL is counted, once", () => {
  assert.deepEqual(
    routeWeights(MANIFEST, read, size, true).map((r) => r.css),
    [1001000, 1001000],
  );
});

test("a route over the budget warns, and so does one grown past both the ratio and the bytes; at either limit it passes", () => {
  const row = (/** @type {string} */ id, /** @type {number} */ total) => ({ id, path: `/${id}`, js: total, css: 0, total });
  const rows = [row("over", 3001), row("at-budget", 3000), row("grown", 2201), row("at-ratio", 2200), row("at-bytes", 500)];
  const { warnings, baselineOf } = check(rows, { budget_bytes: 3000, growth: { ratio: 0.1, bytes: 100 }, baseline: { routes: { grown: 2000, "at-ratio": 2000, "at-bytes": 400 } } });
  assert.deepEqual(warnings, ["over (/over) loads 3001 B gzip, over the budget of 3000 B.", "grown (/grown) loads 2201 B gzip, up 201 B from the baseline 2000 B."]);
  assert.deepEqual([baselineOf("grown"), baselineOf("over")], [2000, null]);
  // The defaults, 5% and 1024 B: the bytes bind on a small route, the ratio on a large one.
  const defaults = check([row("small", 11025), row("small-at", 11024), row("large-at", 31500)], { baseline: { routes: { small: 10000, "small-at": 10000, "large-at": 30000 } } });
  assert.deepEqual(defaults.warnings, ["small (/small) loads 11025 B gzip, up 1025 B from the baseline 10000 B."]);
});

test("PLANT: the bin fails with no build, a manifest naming a missing file, or a config that is not JSON; --write-baseline records each route, and growth past it warns", () => {
  const dir = mkdtempSync(join(tmpdir(), "route-weight-"));
  const run = (/** @type {string[]} */ args = []) => {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/route-weight.mjs", import.meta.url)), ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
    return `${r.status} ${r.stdout}`;
  };
  try {
    assert.match(run(), /^1 ::error::devkit-route-weight: no manifest-\*\.js in \S+ Build the app first\./);
    const assets = join(dir, "web", "assets");
    mkdirSync(assets, { recursive: true });
    for (const [url, text] of Object.entries(FILES)) writeFileSync(join(dir, "web", url), typeof text === "string" ? text : "x".repeat(text));
    writeFileSync(join(assets, "manifest-abc123.js"), `window.__reactRouterManifest=${JSON.stringify(MANIFEST)};`);
    writeFileSync(join(dir, "weight.json"), JSON.stringify({ budget_bytes: 2000 }));
    assert.match(run(["--client", "web", "--config", "weight.json", "--write-baseline"]), /^0 devkit-route-weight: wrote the baseline/);
    const config = JSON.parse(readFileSync(join(dir, "weight.json"), "utf8"));
    assert.equal(config.budget_bytes, 2000);
    assert.equal(typeof config.baseline.measured_at, "string");
    const users = config.baseline.routes["routes/admin.users"];
    assert.deepEqual(Object.keys(config.baseline.routes), ["routes/admin.users", "routes/admin"]);

    writeFileSync(join(dir, "web", "assets", "admin.users.js"), randomBytes(4000));
    const grown = run(["--client", "web", "--config", "weight.json"]);
    assert.match(grown, /^0 ### Route weight \(gzip bytes, first visit, budget 2000 B, baseline /);
    assert.match(grown, /\| routes\/admin \| \/admin \| \d+ \| \d+ \| \d+ \| \d+ \|/);
    assert.match(grown, new RegExp(`::warning title=Route weight::routes/admin.users \\(/admin/users\\) loads \\d+ B gzip, up \\d+ B from the baseline ${users} B\\.`));
    assert.match(grown, /::warning title=Route weight::routes\/admin\.users \(\/admin\/users\) loads \d+ B gzip, over the budget of 2000 B\./);
    assert.doesNotMatch(grown, /::warning title=Route weight::routes\/admin \(/);

    rmSync(join(dir, "web", "assets", "admin.js"));
    assert.match(run(["--client", "web", "--config", "weight.json"]), /^1 ::error::devkit-route-weight: the manifest names \/assets\/admin\.js, which is not in /);
    writeFileSync(join(dir, "weight.json"), "{ budget");
    assert.match(run(["--client", "web", "--config", "weight.json"]), /^1 ::error::devkit-route-weight: \S+weight\.json is not JSON: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
