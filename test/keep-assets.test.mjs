// devkit-keep-assets: an older release's hashed files ride along into the next build, checked against the list the live
// release published, for --days after a build last produced them. The live origin is a stub fetch.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { keepAssets, parseList, toCarry } from "../bin/keep-assets.mjs";

const ORIGIN = "https://example.com";
const NOW = new Date("2026-11-26T12:00:00Z");
const sha = (/** @type {string} */ s) => createHash("sha256").update(s).digest("hex");

/** A build folder holding `files` (path under the asset dir -> text). */
function build(/** @type {Record<string, string>} */ files) {
  const dir = mkdtempSync(join(tmpdir(), "keep-assets-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  return dir;
}

/** A live origin serving `files` and the list `list`; every other path 404s. */
function origin(/** @type {Record<string, string>} */ files, /** @type {unknown} */ list) {
  /** @type {typeof fetch} */
  const impl = async (url) => {
    const path = new URL(String(url)).pathname.slice(1);
    if (path === "assets/kept-assets.json")
      return list === undefined ? new Response("nope", { status: 404 }) : Response.json(list);
    return path in files ? new Response(files[path]) : new Response("not found", { status: 404 });
  };
  return impl;
}

const OLD_CSS = "body{color:red}";
const NEW_CSS = "body{color:blue}";

test("without a carry, the new build lacks the old stylesheet an older page names", () => {
  const dir = build({ "assets/root-NEW.css": NEW_CSS });
  try {
    assert.equal(existsSync(join(dir, "assets/root-OLD.css")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("carries the previous release's file and lists both", async () => {
  const dir = build({ "assets/root-NEW.css": NEW_CSS, "index.html": "<html>" });
  try {
    const list = {
      files: { "assets/root-OLD.css": { sha256: sha(OLD_CSS), built: "2026-11-25T12:00:00Z" } },
    };
    const r = await keepAssets({
      assetDir: dir,
      origin: ORIGIN,
      days: 7,
      now: NOW,
      fetchImpl: origin({ "assets/root-OLD.css": OLD_CSS }, list),
    });
    assert.equal(readFileSync(join(dir, "assets/root-OLD.css"), "utf8"), OLD_CSS);
    assert.deepEqual(r, { built: 1, carried: 1, missed: [], dropped: 0, why: "" });
    const written = JSON.parse(readFileSync(join(dir, "assets/kept-assets.json"), "utf8")).files;
    assert.deepEqual(Object.keys(written), ["assets/root-NEW.css", "assets/root-OLD.css"]);
    assert.equal(
      written["assets/root-OLD.css"].built,
      "2026-11-25T12:00:00Z",
      "a carried file keeps the date a build last made it",
    );
    assert.equal(written["assets/root-NEW.css"].built, NOW.toISOString());
    assert.equal(written["assets/root-NEW.css"].sha256, sha(NEW_CSS));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("drops a file older than --days, and never fetches it", async () => {
  const dir = build({ "assets/root-NEW.css": NEW_CSS });
  try {
    const list = {
      files: { "assets/root-OLD.css": { sha256: sha(OLD_CSS), built: "2026-11-18T11:59:59Z" } },
    };
    const r = await keepAssets({
      assetDir: dir,
      origin: ORIGIN,
      days: 7,
      now: NOW,
      fetchImpl: origin({ "assets/root-OLD.css": OLD_CSS }, list),
    });
    assert.equal(existsSync(join(dir, "assets/root-OLD.css")), false);
    assert.equal(r.dropped, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("leaves out a file whose bytes do not match the list, or that the origin does not serve", async () => {
  const dir = build({ "assets/root-NEW.css": NEW_CSS });
  try {
    const list = {
      files: {
        "assets/a-OLD.css": { sha256: sha(OLD_CSS), built: "2026-11-25T00:00:00Z" },
        "assets/b-GONE.js": { sha256: sha("x"), built: "2026-11-25T00:00:00Z" },
      },
    };
    const r = await keepAssets({
      assetDir: dir,
      origin: ORIGIN,
      days: 7,
      now: NOW,
      fetchImpl: origin({ "assets/a-OLD.css": "tampered" }, list),
    });
    assert.deepEqual(r.missed, ["assets/a-OLD.css", "assets/b-GONE.js"]);
    assert.equal(r.carried, 0);
    assert.equal(existsSync(join(dir, "assets/a-OLD.css")), false);
    const written = JSON.parse(readFileSync(join(dir, "assets/kept-assets.json"), "utf8")).files;
    assert.deepEqual(Object.keys(written), ["assets/root-NEW.css"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a file this build also has is the build's, never the carried copy", async () => {
  const dir = build({ "assets/root-SAME.css": NEW_CSS });
  try {
    const list = {
      files: { "assets/root-SAME.css": { sha256: sha(OLD_CSS), built: "2026-11-25T00:00:00Z" } },
    };
    await keepAssets({
      assetDir: dir,
      origin: ORIGIN,
      days: 7,
      now: NOW,
      fetchImpl: origin({ "assets/root-SAME.css": OLD_CSS }, list),
    });
    assert.equal(readFileSync(join(dir, "assets/root-SAME.css"), "utf8"), NEW_CSS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no live list starts a new one", async () => {
  const dir = build({ "assets/root-NEW.css": NEW_CSS });
  try {
    const r = await keepAssets({
      assetDir: dir,
      origin: ORIGIN,
      days: 7,
      now: NOW,
      fetchImpl: origin({}, undefined),
    });
    assert.equal(r.why, "answered 404");
    assert.equal(r.carried, 0);
    assert.ok(existsSync(join(dir, "assets/kept-assets.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the list's paths stay under assets/: traversal, other folders, the list itself and bad entries are dropped", () => {
  const good = { sha256: sha("x"), built: "2026-11-25T00:00:00Z" };
  const files = parseList({
    files: {
      "assets/ok-1.js": good,
      "assets/../index.html": good,
      "assets/./x.js": good,
      "index.html": good,
      "/assets/abs.js": good,
      "assets/kept-assets.json": good,
      "assets/bad-hash.js": { sha256: "zz", built: good.built },
      "assets/bad-date.js": { sha256: good.sha256, built: "soon" },
      "assets/sp ace.js": good,
    },
  });
  assert.deepEqual(Object.keys(files), ["assets/ok-1.js"]);
  assert.deepEqual(parseList(null), {});
  assert.deepEqual(parseList({ files: "x" }), {});
});

test("toCarry keeps the window edge and skips what the build has", () => {
  const e = (/** @type {string} */ built) => ({ sha256: sha("x"), built });
  const got = toCarry(
    {
      "assets/a": e("2026-11-19T12:00:00Z"),
      "assets/b": e("2026-11-19T11:59:59Z"),
      "assets/c": e("2026-11-26T00:00:00Z"),
    },
    new Set(["assets/c"]),
    7,
    NOW,
  ).map(([p]) => p);
  assert.deepEqual(got, ["assets/a"]);
});
