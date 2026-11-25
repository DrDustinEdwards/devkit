---
"@dustinedwards/devkit": minor
---

The default deploy install runs from the nearest folder at or above the working directory that holds a package-lock.json, so a Worker inside a workspace package no longer needs an `install:` override, and `check-callers.mjs` refuses an `install:` on a worker-deploy call that neither includes `--ignore-scripts` nor runs `deploy-install.mjs`.
