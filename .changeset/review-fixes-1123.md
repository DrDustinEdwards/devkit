---
"@dustinedwards/devkit": patch
---

Code review fixes: the restore drill's files step no longer runs an unpinned d1-dump with the Cloudflare token; the migration scan sees `WITH ... UPDATE` and a trigger body with `CASE ... END`; a release whose tag exists without its release is completed on the next run, and the build runs in a job with no OIDC token; the OSV scan fails closed on a report it cannot read; the trailer check escapes annotations; the copies scan hides private repositories' files and removes its clones; and smaller fixes in the warm loop, `--min`, `.ops-audit.json`, the base install in no-bloat, the dev server and the review check.
