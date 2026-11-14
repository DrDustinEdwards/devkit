---
"@dustinedwards/devkit": minor
---

`nativeBuiltins()` (`@dustinedwards/devkit/vite/native-builtins`), a Vite plugin that swaps a polyfill for the platform function it fills in. `@ungap/structured-clone`, which mdast-util-to-hast imports in every site that renders Markdown through Prelum, becomes the global `structuredClone`: Workers and every supported browser have it, and a bundler cannot drop the polyfill's serialize and deserialize on its own. On Foxing's web Worker this takes 2.96 KiB raw and 0.87 KiB gzip off. Put it first in `plugins`. `@ungap`'s `json` and `lossy` options are not supported.
