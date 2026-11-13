---
"@dustinedwards/devkit": minor
---

`devkit-css-vars` takes an optional `classes` list in `.css-vars.json`: `[{ "package": "dashboard/node_modules/capsomer", "dirs": ["dashboard/src"], "prefix": "cap-" }]`. It fails on a class with the prefix that a `.ts` or `.tsx` file under `dirs` writes, when one of the package's stylesheets (its `exports` ending in `.css` and the files they `@import`) styles the class and nothing under `dirs` imports that stylesheet. A stylesheet styles a class when the class is in the first compound of one of its top-level selectors. New exports from `bin/css-vars.mjs`: `styledClasses(css, prefix)` and `unloadedClasses({ pkgDir, prefix, files })`. Without `classes` nothing changes.
