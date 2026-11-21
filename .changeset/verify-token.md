---
"@dustinedwards/devkit": minor
---

worker-deploy: an optional `VERIFY_TOKEN` secret reaches the verify command as `$VERIFY_TOKEN` (and no other step), so a verify command can make a real authenticated call; it is never a Cloudflare token. `devkit-verify-deploy` sends `WORKERS_VERSION_OVERRIDE` as `Cloudflare-Workers-Version-Overrides` on every read, so during a gradual rollout it checks the new version, not whichever version the traffic split picks.
