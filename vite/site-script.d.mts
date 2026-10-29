import type { Plugin } from "vite";

/**
 * Bundles `entry` (default `app/site.ts`) into one minified classic script at /site.js, and each file in `islands`
 * (default `app/islands/`) into its own ES module at /islands/<name>.js: served per request by `vite dev`, emitted
 * into the client build otherwise. In `vite dev`, /site.js also loads the dev toolbar unless `toolbar` is false.
 */
export function siteScript(options?: { entry?: string; islands?: string; toolbar?: boolean }): Plugin;
