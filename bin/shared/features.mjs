import { posix } from "node:path";
import { FEATURES, HASHED_DIRS, ASSET_CACHE, cachesHashed, BACKUP, EMAIL } from "./data.mjs";
import { ADVISORIES } from "./advisories.mjs";
import { SOURCE, NOT_SOURCE, readManifest, excused } from "./config.mjs";
/** @import { Finding, Tree, Config } from "./config.mjs" */

/** Which app a file belongs to: the deepest app directory that holds it. @param {[string, string][]} apps */
export function ownerOf(apps) {
  return (/** @type {string} */ file) =>
    apps
      .map(([dir]) => dir)
      .filter((dir) => dir === "." || file === dir || file.startsWith(`${dir}/`))
      .sort((a, b) => b.length - a.length)[0];
}

/**
 * Family features each app is missing for its kind.
 * @param {Tree} tree @param {Config} config
 * @returns {Finding[]}
 */
export function checkFeatures(tree, config, now = Date.now()) {
  /** @type {Finding[]} */
  const found = [];
  const apps = Object.entries(config.apps ?? { ".": "site" });
  const owner = ownerOf(apps);
  // A library with no kind is judged as the default site; the finding says how to say otherwise.
  const manifest = readManifest(tree, "package.json", found, "features");
  const library =
    !config.apps && (manifest.exports || manifest.bin)
      ? ` (package.json has ${manifest.exports ? "exports" : "a bin"}: a library says .shared.json "apps": { ".": "package" })`
      : "";
  for (const [dir, kind] of apps) {
    const mine = tree.files.filter((f) => owner(f) === dir && !NOT_SOURCE.test(f));
    const text = mine
      .filter(
        (f) => SOURCE.test(f) || /\.(css|ya?ml)$/.test(f) || posix.basename(f) === "package.json",
      )
      .map(tree.read)
      .join("\n");
    const prefix = dir === "." ? "" : `${dir}:`;
    for (const [feature, { kinds, find, use }] of Object.entries(FEATURES)) {
      if (
        !kinds.includes(kind) ||
        find.test(text) ||
        excused(config, "waive", `${prefix}${feature}`)
      )
        continue;
      found.push({
        check: "features",
        file: dir,
        message: `${kind} ${dir === "." ? "" : `${dir} `}has no ${feature}: ${use}${library}`,
      });
    }
    // security.txt's Expires is a fixed date, so somebody confirms the address still works before it lapses; this is the
    // reminder, a month ahead.
    for (const f of mine.filter((file) => SOURCE.test(file))) {
      const m = /\bSECURITY_TXT_EXPIRES\s*=\s*["'`]([^"'`]+)["'`]/.exec(tree.read(f));
      if (m && Date.parse(m[1]) - now < 30 * 86_400_000) {
        found.push({
          check: "features",
          file: f,
          message: `security.txt expires ${m[1]}: confirm its contact still delivers, then move SECURITY_TXT_EXPIRES on (under a year)`,
        });
      }
    }
    if (kind !== "package" && mine.some((f) => /(^|\/)react-router\.config\.[mc]?[jt]s$/.test(f))) {
      const headers = mine
        .filter((f) => posix.basename(f) === "_headers")
        .map(tree.read)
        .join("\n");
      for (const { dir: hashed, needed } of HASHED_DIRS) {
        if (
          needed(text) &&
          !cachesHashed(headers, hashed) &&
          !excused(config, "waive", `${prefix}assetCache`)
        ) {
          found.push({
            check: "features",
            file: dir,
            message: `${dir} serves ${hashed} with the assets layer's revalidate-every-load default: ${hashed} needs ${ASSET_CACHE.use}`,
          });
        }
      }
    }
    const d1 = mine.some(
      (f) =>
        /(^|\/)wrangler[^/]*\.jsonc?(\.example)?$/.test(f) && /"d1_databases"/.test(tree.read(f)),
    );
    if (
      d1 &&
      kind !== "package" &&
      !BACKUP.find.test(text) &&
      !excused(config, "waive", `${prefix}backup`)
    ) {
      found.push({
        check: "features",
        file: dir,
        message: `${dir} has a D1 database and no nightly dump: ${BACKUP.use}`,
      });
    }
    // Every mail goes through ./email, which refuses an address with a line break and cuts sign-in links out of errors;
    // an app that calls its send_email binding itself has none of that.
    const mail = mine.some(
      (f) =>
        /(^|\/)wrangler[^/]*\.jsonc?(\.example)?$/.test(f) && /"send_email"/.test(tree.read(f)),
    );
    if (
      mail &&
      kind !== "package" &&
      !EMAIL.find.test(text) &&
      !excused(config, "waive", `${prefix}email`)
    ) {
      found.push({
        check: "features",
        file: dir,
        message: `${dir} has a send_email binding and sends without ${EMAIL.use}`,
      });
    }
    // A Carrel site (it calls createSiteApi) tells IndexNow about each publish and schedule through site-api's hook. A
    // createSiteApi without it either tells nobody, or hands its own submitIndexNow to onPageChange.
    const indexnow = FEATURES.indexnow;
    if (
      indexnow.kinds.includes(kind) &&
      indexnow.find.test(text) &&
      /\bcreateSiteApi\s*\(/.test(text) &&
      !/\bindexNowHook\b|prelum-indexnow/.test(text) &&
      !excused(config, "waive", `${prefix}indexnow`)
    ) {
      const how = /\bonPageChange\s*[:(]/.test(text)
        ? "with its own onPageChange submission"
        : "without IndexNow, so a publish from Carrel reaches no search engine";
      found.push({
        check: "features",
        file: dir,
        message: `${kind} ${dir === "." ? "" : `${dir} `}calls createSiteApi ${how}: hooks: [indexNowHook(...)] from site-api`,
      });
    }
    const all = tree.files.filter(
      (f) => owner(f) === dir && !/(^|\/)(node_modules|dist|build|coverage)\//.test(f),
    );
    for (const [name, { kinds, use, missing }] of Object.entries(ADVISORIES)) {
      if (!kinds.includes(kind)) continue;
      const what = missing({ files: all, text, read: tree.read });
      if (what && !excused(config, "waive", `${prefix}${name}`))
        found.push({
          check: "features",
          file: dir,
          warn: true,
          message: `${kind} ${dir === "." ? "" : `${dir} `}has ${what}: ${use}`,
        });
    }
  }
  return found;
}

/** A wrangler config: the app it sits in is a Worker. */
export const WRANGLER = /(^|\/)wrangler[^/]*\.(jsonc?|toml)(\.example)?$/;
