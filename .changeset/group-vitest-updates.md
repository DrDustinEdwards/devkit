---
"@dustinedwards/devkit": patch
---

Renovate moves vitest with its @vitest/* plugins, better-auth with its @better-auth/* plugins, and the Tiptap packages as one update each. Their packages pin each other exactly, so a separate PR for each failed `npm ci` with ERESOLVE (site-api, site-runtime, txasm, carrel).
