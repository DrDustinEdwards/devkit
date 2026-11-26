---
"@dustinedwards/devkit": minor
---

worker-deploy.yml's new `keep-assets` input (the built asset directory, such as `build/client`) keeps the earlier releases' hashed files in each upload, so a page an older release served, still open in a tab or rendered later by a crawler, finds its stylesheet and scripts after a deploy replaces them (Cloudflare Docs, "Version skew and static assets"). The new `devkit-keep-assets` reads the list the live release publishes at `/assets/kept-assets.json`, fetches each listed file this build lacks that a build produced within `keep-assets-days` (default 7), checks its sha-256 and adds it, then writes this build's list. It never fails a deploy.
