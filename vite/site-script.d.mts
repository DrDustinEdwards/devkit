import type { Plugin } from "vite";

/**
 * Bundles `entry` (default `app/site.ts`) into one minified classic script at /site.js, and each file in `islands`
 * (default `app/islands/`) into an ES module at /islands/<name>.js: served whole per request by `vite dev`; in a
 * build, all islands in one pass, with code they share in chunks under /islands/chunks/. In `vite dev`, /site.js
 * also loads the dev toolbar unless `toolbar` is false.
 */
export function siteScript(options?: { entry?: string; islands?: string; toolbar?: boolean }): Plugin;
