// The constants a build writes into the code it bundles, for the type check only (tsconfig.json); never shipped.

/** Each island's content-hashed URL, which siteScript writes into a built /site.js (vite/site-script.mjs, vite/islands.mjs). */
declare const __DEVKIT_ISLANDS__: Record<string, string> | undefined;
