#!/usr/bin/env node
// Carry the previous releases' hashed assets into this build, so a page an older release served still finds its
// stylesheet and scripts after a deploy replaces them (Cloudflare Docs, "Version skew and static assets": "Include assets
// needed by older pages"). A Worker version serves only the files in its own upload, and a browser tab left open, a page in
// the back-forward cache or a crawler rendering an HTML copy it fetched hours ago asks for the files its HTML names.
//
//   devkit-keep-assets <asset dir> --origin https://example.com [--days 7]
//
// It reads <origin>/assets/kept-assets.json, the list the live release published: every file under <asset dir>/assets,
// with its sha-256 and the last time a build produced it. Each listed file this build lacks, produced within --days, is
// fetched from the live origin, checked against its sha-256 and written into the build. Then it writes this build's list,
// so the next deploy can do the same. Files are content-hashed, so a carried file never takes the place of a new one.
// Never fails a deploy: a list that cannot be read starts a new one, and a file that cannot be fetched or does not match is
// left out, each with a warning.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";

import { escapeAnnotation } from "./annotate.mjs";
import { isMain, walkFiles } from "../node/index.mjs";

/** The folder under the asset directory that holds the content-hashed files (Vite's `build.assetsDir`). */
export const HASHED_DIR = "assets";
/** The published list, inside the hashed folder so it is served beside the files it names. */
export const LIST_NAME = "kept-assets.json";
const DAY_MS = 86_400_000;
const TIMEOUT_MS = 30_000;
const WORKERS = 8;

/** @typedef {{ sha256: string, built: string }} Entry */

const sha256 = (/** @type {Uint8Array} */ bytes) =>
  createHash("sha256").update(bytes).digest("hex");

/** The list's entries that are a safe path under the hashed folder with a well-formed hash and date; anything else is dropped. */
export function parseList(/** @type {unknown} */ body) {
  /** @type {Record<string, Entry>} */
  const files = {};
  const raw = /** @type {any} */ (body)?.files;
  if (!raw || typeof raw !== "object") return files;
  for (const [path, entry] of Object.entries(raw)) {
    const safe =
      path.startsWith(`${HASHED_DIR}/`) &&
      !path.split("/").some((part) => part === ".." || part === "." || part === "") &&
      posix.basename(path) !== LIST_NAME &&
      /^[\w.\-/@~+]+$/.test(path);
    if (!safe) continue;
    if (typeof entry?.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) continue;
    if (typeof entry?.built !== "string" || Number.isNaN(Date.parse(entry.built))) continue;
    files[path] = { sha256: entry.sha256, built: entry.built };
  }
  return files;
}

/**
 * Which listed files to carry: those this build lacks, built within `days` of `now`.
 * @param {Record<string, Entry>} previous
 * @param {Set<string>} current
 * @param {number} days
 * @param {Date} now
 */
export function toCarry(previous, current, days, now) {
  const since = now.getTime() - days * DAY_MS;
  return Object.entries(previous).filter(
    ([path, e]) => !current.has(path) && Date.parse(e.built) >= since,
  );
}

/** The live list, or an empty one when it does not answer 200 with JSON. */
async function readLive(/** @type {string} */ origin, /** @type {typeof fetch} */ fetchImpl) {
  try {
    const res = await fetchImpl(`${origin}/${HASHED_DIR}/${LIST_NAME}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { files: {}, why: `answered ${res.status}` };
    return { files: parseList(await res.json()), why: "" };
  } catch (e) {
    return { files: {}, why: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Carry the previous releases' files into `assetDir` and write this build's list.
 * @param {{ assetDir: string, origin: string, days: number, now?: Date, fetchImpl?: typeof fetch }} o
 */
export async function keepAssets({ assetDir, origin, days, now = new Date(), fetchImpl = fetch }) {
  const hashed = join(assetDir, HASHED_DIR);
  const listPath = join(hashed, LIST_NAME);
  const built = walkFiles(hashed)
    .map((p) => relative(assetDir, p).split(sep).join(posix.sep))
    .filter((p) => p !== `${HASHED_DIR}/${LIST_NAME}`);
  const current = new Set(built);
  /** @type {Record<string, Entry>} */
  const next = {};
  for (const path of built)
    next[path] = { sha256: sha256(readFileSync(join(assetDir, path))), built: now.toISOString() };

  const live = await readLive(origin, fetchImpl);
  const carry = toCarry(live.files, current, days, now);
  /** @type {string[]} */
  const missed = [];
  const queue = [...carry];
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [path, entry] = item;
        try {
          const res = await fetchImpl(`${origin}/${path}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (!res.ok || sha256(bytes) !== entry.sha256) {
            missed.push(path);
            continue;
          }
          mkdirSync(dirname(join(assetDir, path)), { recursive: true });
          writeFileSync(join(assetDir, path), bytes);
          next[path] = entry;
        } catch {
          missed.push(path);
        }
      }
    }),
  );
  mkdirSync(hashed, { recursive: true });
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(listPath, `${JSON.stringify({ files: sorted })}\n`);
  return {
    built: built.length,
    carried: carry.length - missed.length,
    missed: missed.sort(),
    dropped: Object.keys(live.files).filter((p) => !current.has(p)).length - carry.length,
    why: live.why,
  };
}

async function main(/** @type {string[]} */ argv) {
  const at = (/** @type {string} */ flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const assetDir = argv[0];
  const origin = at("--origin")?.replace(/\/+$/, "");
  const days = Number(at("--days") ?? 7);
  if (
    !assetDir ||
    assetDir.startsWith("--") ||
    !origin ||
    !/^https?:\/\//.test(origin) ||
    !(days >= 0)
  ) {
    console.error("usage: devkit-keep-assets <asset dir> --origin <https://origin> [--days 7]");
    return 1;
  }
  if (!existsSync(join(assetDir, HASHED_DIR))) {
    console.log(
      `::warning::${escapeAnnotation(`devkit-keep-assets: ${assetDir} has no ${HASHED_DIR}/ folder; nothing kept`)}`,
    );
    return 0;
  }
  const r = await keepAssets({ assetDir, origin, days });
  if (r.why)
    console.log(
      `::warning::${escapeAnnotation(`devkit-keep-assets: ${origin}/${HASHED_DIR}/${LIST_NAME} ${r.why}; starting a new list`)}`,
    );
  if (r.missed.length)
    console.log(
      `::warning::${escapeAnnotation(`devkit-keep-assets: left out ${r.missed.length} file(s) the live origin did not serve as listed: ${r.missed.slice(0, 10).join(", ")}`)}`,
    );
  console.log(
    `kept ${r.carried} earlier file(s) beside this build's ${r.built}; ${r.dropped} older than ${days} days left out`,
  );
  return 0;
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to. An error is a warning:
// a deploy goes on without the earlier files rather than not at all.
if (isMain(import.meta.url)) {
  let code = 0;
  try {
    code = await main(process.argv.slice(2));
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    console.log(
      `::warning::${escapeAnnotation(`devkit-keep-assets did not finish, so this deploy keeps no earlier files: ${why}`)}`,
    );
  }
  process.exit(code);
}
