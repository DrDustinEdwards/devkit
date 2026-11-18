---
"@dustinedwards/devkit": patch
---

Renovate moves vitest and its @vitest/* plugins as one update. They pin each other exactly, so a separate PR for each failed `npm ci` with ERESOLVE (site-api's vitest 5 and coverage-v8 5 PRs).
