---
"@dustinedwards/devkit": minor
---

worker-deploy.yml installs with `npm ci --ignore-scripts` by default, then runs the repository's own `postinstall` and `prepare`, so no dependency's install script runs in a job that holds the deploy token. The new `rebuild` input names dependencies whose script the build needs (`npm rebuild`). A caller that sets `install:` keeps what it wrote; one that installs with scripts can drop to this default on its next repin.
