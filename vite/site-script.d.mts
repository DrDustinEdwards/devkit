import type { Plugin } from "vite";

/**
 * Bundles `entry` (default `app/site.ts`; false for none) into one minified classic script at /site.js, and each file
 * in `islands` (default `app/islands/`) into an ES module: served whole per request at /islands/<name>.js by
 * `vite dev`; in a build, all islands in one pass, named by their content (/islands/<name>-<hash>.js), with code they
 * share in chunks under /islands/chunks/. The built /site.js carries the URL of each, which `startIslands` reads.
 * The built /site.js is named by its content (/site-<hash>.js), and `startIslands` preloads each island it imports
 * with its sha384 integrity, so Integrity-Policy accepts them. `virtual:islands` exports `SITE_SCRIPT` (the script
 * tag's `src`, `integrity` and `crossOrigin`; `/site.js` alone in `vite dev`; null with no entry), `ISLAND_URLS` (name to URL) and `ISLAND_GZIP_BYTES` (name to the gzip -9 bytes of the
 * island and the chunks it imports) for a server-rendered app. In `vite dev`, /site.js also loads the dev toolbar
 * unless `toolbar` is false.
 */
export function siteScript(options?: {
  entry?: string | false;
  islands?: string;
  toolbar?: boolean;
}): Plugin;
