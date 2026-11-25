---
"@dustinedwards/devkit": minor
---

worker-deploy.yml's default install now builds the dependencies the lockfile resolves from git (site-api, d1-dump and the like) from their locked commit, running their own `prepare`, so a deploy no longer fails on a missing `dist/` while still running no registry dependency's install script. The `install` input defaults to empty, which runs the new `bin/deploy-install.mjs`; a command set there still replaces it. pr.yml's new `deploy-install` input (on by default with `worker-size`) runs the same install in a clean worktree and then `worker-size-prepare`, so a pull request cannot pass while its deploy would fail. A caller that worked around the bug with `rebuild:` can drop it.
