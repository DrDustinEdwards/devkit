import type { Plugin } from "vite";

/**
 * Replaces a polyfill with the platform's own function, in the Worker and the browser build: `@ungap/structured-clone`
 * (imported by mdast-util-to-hast, so by every site that renders Markdown through Prelum) becomes the global
 * `structuredClone`. About 3 KiB raw and 0.9 KiB gzip off a Worker. `@ungap`'s `json` and `lossy` options are not
 * supported. It also stubs React's legacy string renderer (`renderToString`, `renderToStaticMarkup`, about 259 KB of
 * source) in a production build, which a Worker never calls; both then throw. It defines `__SENTRY_DEBUG__` as false, so
 * Sentry's debug logging (used only with its `debug` option) is dropped: about 10 KiB raw and 3.8 KiB gzip of a Worker.
 */
export function nativeBuiltins(): Plugin;
