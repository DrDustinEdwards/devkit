import type { Plugin } from "vite";

/**
 * Bundles `entry` (default `app/site.ts`; false for none) into one minified classic script at /site.js, and each file
 * in `islands` (default `app/islands/`) into an ES module: served whole per request at /islands/<name>.js by
 * `vite dev`; in a build, all islands in one pass, named by their content (/islands/<name>-<hash>.js), with code they
 * share in chunks under /islands/chunks/. The built /site.js carries the URL of each, which `startIslands` reads.
 * `virtual:islands` exports `ISLAND_URLS` (name to URL) and `ISLAND_GZIP_BYTES` (name to the gzip -9 bytes of the
 * island and the chunks it imports) for a server-rendered app. In `vite dev`, /site.js also loads the dev toolbar
 * unless `toolbar` is false.
 */
export function siteScript(options?: { entry?: string | false; islands?: string; toolbar?: boolean }): Plugin;
