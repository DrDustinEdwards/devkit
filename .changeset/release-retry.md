---
"@dustinedwards/devkit": patch
---

The release workflow tries `gh release create` four times: a 503 from GitHub's API right after the tag push failed the job and skipped the consumer bumps for Prelum 0.67.1. A release an earlier try made counts as done.
