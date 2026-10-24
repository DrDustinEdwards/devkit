import type { Plugin } from "vite";

/**
 * Bundles `entry` (default `app/site.ts`) into one minified classic script at /site.js: served per request by
 * `vite dev`, emitted into the client build otherwise.
 */
export function siteScript(options?: { entry?: string }): Plugin;
