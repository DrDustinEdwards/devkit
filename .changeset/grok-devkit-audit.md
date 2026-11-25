---
"@dustinedwards/devkit": patch
---

Audit fixes: the migration reader reads a trigger body when the same file writes rows (so `--apply` hands such a file to a person); `devkit-secrets` has a Cloudflare token shape and names each file it skips for size; `devkit-fetch-fonts` takes font files only from fonts.gstatic.com and refuses redirects; `devkit-db-migrate` and `devkit-migrations --apply` refuse a database name that is not a D1 name; the scoped-git-add hook reads quoted and bundled flags and the `:/` pathspec; the review job's Capsid host is no longer an environment override.
