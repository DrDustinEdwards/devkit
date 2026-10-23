// The route weight walk: a route weighs the entry, then root down to itself, each file once. Sizes are the files' lengths,
// so each expected total is the sum of the files it names.

import assert from "node:assert/strict";
import test from "node:test";

import { routeWeights } from "../bin/route-weight.mjs";

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
