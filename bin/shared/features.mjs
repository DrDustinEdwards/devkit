import { posix } from "node:path";
import {
  NOT_SOURCE,
  PUBLIC_OR_PRIVATE,
  SITE,
  SOURCE,
  blankComments,
  callWithKey,
  excused,
  ownerOf,
  readManifest,
} from "./core.mjs";

/** @typedef {import("./core.mjs").Config} Config */
/** @typedef {import("./core.mjs").Finding} Finding */
/** @typedef {import("./core.mjs").Tree} Tree */

/** Every shared feature: which kinds of app need it, how its use is found, and what provides it. */
export const FEATURES = {
  robots: {
    kinds: SITE,
    find: /site-helpers\/robots["']/,
    use: "Prelum ./robots robotsDocument (/robots.txt)",
  },
  aiTxt: {
    kinds: SITE,
    // standardFiles serves ai.txt when it is given `ai`.
    find: {
      test: (/** @type {string} */ text) =>
        /\baiTxt(Response)?\b/.test(text) || callWithKey(text, "standardFiles", "ai"),
    },
    use: "Prelum ./robots aiTxt or aiTxtResponse (/ai.txt), or ./files standardFiles with `ai`",
  },
  tdm: {
    kinds: SITE,
    find: /\bTDM_RESERVATION_HEADERS\b/,
    use: "Prelum ./robots TDM_RESERVATION_HEADERS",
  },
  sitemap: {
    kinds: SITE,
    find: /site-helpers\/sitemap["']/,
    use: "Prelum ./sitemap sitemapDocument (/sitemap.xml)",
  },
  llms: {
    kinds: SITE,
    find: /site-helpers\/llms["']/,
    use: "Prelum ./llms llmsDocument (/llms.txt)",
  },
  head: {
    kinds: SITE,
    find: /site-helpers\/head["']/,
    use: "Prelum ./head headTags (canonical, Open Graph, Twitter)",
  },
  schema: { kinds: SITE, find: /site-helpers\/schema["']/, use: "Prelum ./schema (JSON-LD)" },
  indexnow: {
    kinds: SITE,
    // site-api's standardSiteApi sends IndexNow when it is given `indexNow`.
    find: {
      test: (/** @type {string} */ text) =>
        /site-helpers\/indexnow["']|prelum-indexnow/.test(text) ||
        callWithKey(text, "standardSiteApi", "indexNow"),
    },
    use: "Prelum ./indexnow submitIndexNow (site-api indexNowHook on a Carrel site; prelum-indexnow after a static deploy)",
  },
  securityTxt: {
    kinds: SITE,
    // site-runtime ./worker's gateway answers /.well-known/security.txt on every site.
    find: /site-runtime\/(security-txt|worker)["']/,
    use: "site-runtime ./security-txt (/.well-known/security.txt), or ./worker's gateway",
  },
  // A registry entry (./sites) counts for both: staticSite({ site }) and site-runtime-headers build a static site's set
  // and page policy from it with buildSecurityHeaders and buildContentSecurityPolicy.
  headers: {
    kinds: [...PUBLIC_OR_PRIVATE, "worker"],
    find: /site-runtime\/(headers|sites)["']|\bwithMcpHeaders\b/,
    use: "site-runtime ./headers buildSecurityHeaders (or a ./sites entry given to ./static-site staticSite)",
  },
  csp: {
    kinds: PUBLIC_OR_PRIVATE,
    find: /site-runtime\/(csp|sites)["']/,
    use: "site-runtime ./csp buildContentSecurityPolicy (or a ./sites entry given to ./static-site staticSite)",
  },
  cspReport: {
    kinds: PUBLIC_OR_PRIVATE,
    find: /site-runtime\/(csp-report|static-site|worker)["']/,
    use: "site-runtime ./csp-report receiveCspReport (./worker's gateway and ./static-site staticSite receive them)",
  },
  health: {
    kinds: ["site", "private"],
    find: /site-runtime\/health["']/,
    use: "site-runtime ./health healthResponse (/health)",
  },
  // base.css, not just a token file: the element styles every page in the network shares. A build that copies it out of the
  // package (require.resolve("capsomer/package.json"), then "css/base.css") counts, and so does Capsomer's own build
  // helper, whose capsomerStylesheet always writes base.css (Carrel's www, Prelum's specimen, Capsid's explorer).
  capsomer: {
    kinds: PUBLIC_OR_PRIVATE,
    find: /["']capsomer\/base\.css["']|["']capsomer\/package\.json["'][^]{0,400}?["']css\/base\.css["']|\bimport\s*\{[^{}]*\bcapsomerStylesheet\b[^{}]*\}\s*from\s*["']capsomer\/build["']/,
    use: "Capsomer's capsomer/base.css (tokens, element styles, the site layer), then its components",
  },
};

/**
 * A React Router app on Workers Assets serves its built files from the assets layer, which sends them with
 * `max-age=0, must-revalidate` unless the app's `_headers` says otherwise, so every page load revalidates every file.
 * Vite and siteScript name each one by its content, so a year, immutable, is safe for the hashed directories.
 */
const HASHED_DIRS = [
  { dir: "/assets/*", needed: () => true },
  { dir: "/islands/*", needed: (/** @type {string} */ text) => /devkit\/islands["']/.test(text) },
];

export const ASSET_CACHE = {
  use: "public/_headers: Cache-Control: public, max-age=31536000, immutable",
};

/** Whether a `_headers` text gives `dir` a Cache-Control with immutable. */
function cachesHashed(/** @type {string} */ headers, /** @type {string} */ dir) {
  const blocks = headers.split(/\r?\n(?=\S)/);
  return blocks.some(
    (b) => b.split(/\r?\n/)[0].trim() === dir && /^\s+Cache-Control:[^\n]*\bimmutable\b/im.test(b),
  );
}

/** A D1 database needs the nightly dump, whatever the kind. */
export const BACKUP = {
  find: /@dustinedwards\/d1-dump["']/,
  use: "d1-dump runCheckedBackup and backupHealth",
};

export const EMAIL = {
  find: /@dustinedwards\/site-runtime\/email["']/,
  use: "site-runtime ./email sendEmail",
};

/**
 * Family features found by a heuristic, so they warn instead of failing: each is a function of the app's files that
 * answers what is missing, or null. `.shared.json` "waive" silences one by its name, as it does a feature.
 * @type {Record<string, { kinds: string[], use: string, missing: (app: { files: string[], text: string, read: (f: string) => string }) => string | null }>}
 */
export const ADVISORIES = {
  // An accessibility test of its own pages: Capsomer's axe helpers or axe-core, in a test or a browser check script.
  a11y: {
    kinds: PUBLIC_OR_PRIVATE,
    use: "capsomer/testing expectNoAxeViolations (or @axe-core) in a browser test",
    missing: ({ files, read }) =>
      files.some(
        (f) =>
          SOURCE.test(f) &&
          /["'](?:capsomer\/testing|@axe-core\/[^"']+|axe-core(?:\/[^"']*)?)["']/.test(read(f)),
      )
        ? null
        : "no accessibility test",
  },
  // An admin, login or console page kept out of search: some file that names the route also says noindex (the route,
  // its layout, a Worker rule or a _headers block).
  noindex: {
    kinds: SITE,
    use: "a robots noindex meta or X-Robots-Tag: noindex on each admin, login, signin or console route",
    missing: ({ files, read }) => {
      const names = new Set(
        files.map((f) => ADMIN_ROUTE.exec(f)?.[1]).filter((n) => n !== undefined),
      );
      const sayers = files.filter(
        (f) =>
          ((SOURCE.test(f) && !NOT_SOURCE.test(f)) || posix.basename(f) === "_headers") &&
          /noindex/i.test(read(f)),
      );
      const bare = [...names].filter(
        (n) =>
          !sayers.some(
            (f) =>
              ADMIN_ROUTE.exec(f)?.[1] === n ||
              new RegExp(`(?:^|["'\`])/${n}\\b`, "m").test(read(f)),
          ),
      );
      return bare.length ? `${bare.map((n) => `/${n}`).join(", ")} without noindex` : null;
    },
  },
  // A feed a reader can find from the page: a rel="alternate" link of the feed's type, in code, not a comment.
  feedLink: {
    kinds: SITE,
    use: '`<link rel="alternate" type="application/rss+xml">` (or atom, or feed+json) in the head',
    missing: ({ text }) =>
      /\b(?:rssDocument|atomDocument|jsonFeedDocument)\b|["'`]Content-Type["'`]\s*:\s*["'`]application\/(?:rss|atom)\+xml/.test(
        text,
      ) &&
      !/\brel\s*[=:]\s*["'`]alternate["'`][^>{}]{0,200}?application\/(?:rss\+xml|atom\+xml|feed\+json)|application\/(?:rss\+xml|atom\+xml|feed\+json)["'`][^>{}]{0,200}?\brel\s*[=:]\s*["'`]alternate/.test(
        blankComments(text),
      )
        ? "a feed and no alternate link to it"
        : null,
  },
};

/** A route file for a page search should not list, and which one (admin, login, signin, sign-in or console). */
const ADMIN_ROUTE =
  /(?:^|\/)routes\/(?:[^/]*\/)*(?:[^/]*\.)?(admin|login|signin|sign-in|console)(?=[./_$-])/;

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
