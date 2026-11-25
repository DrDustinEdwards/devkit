import { posix } from "node:path";
import { SITE, PUBLIC_OR_PRIVATE } from "./data.mjs";
import { ADMIN_ROUTE, SOURCE, NOT_SOURCE } from "./config.mjs";
import { blankComments } from "./copies.mjs";

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
