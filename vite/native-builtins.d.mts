import type { Plugin } from "vite";

/**
 * Replaces a polyfill with the platform's own function, in the Worker and the browser build: `@ungap/structured-clone`
 * (imported by mdast-util-to-hast, so by every site that renders Markdown through Prelum) becomes the global
 * `structuredClone`. About 3 KiB raw and 0.9 KiB gzip off a Worker. `@ungap`'s `json` and `lossy` options are not
 * supported.
 */
export function nativeBuiltins(): Plugin;
