import type { Plugin, ViteDevServer } from "vite";

/** Where `vite dev` serves the toolbar's browser module. */
export const TOOLBAR_PATH: "/@devkit/toolbar.js";
/** Classic script that loads the toolbar module, appended to a dev /site.js. */
export const TOOLBAR_LOADER: string;
/** Serves the toolbar and the site's axe-core under /@devkit/. */
export function serveToolbar(server: ViteDevServer): void;
/** Astro's dev toolbar (Inspect, Audit, Settings), in `vite dev` only. */
export function devToolbar(): Plugin;
