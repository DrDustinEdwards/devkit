---
"@dustinedwards/devkit": patch
---

The gradual deploy retries `wrangler versions deploy` when Cloudflare answers 100146 (the version it just uploaded is not found yet), six times ten seconds apart; any other failure still stops it.
