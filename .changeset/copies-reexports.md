---
"@dustinedwards/devkit": patch
---

The copies scan no longer counts `export { x }` of an imported `x` as a definition, the way a site re-exports a shared package's name.
