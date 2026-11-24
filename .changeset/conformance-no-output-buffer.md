---
"@dustinedwards/devkit": patch
---

The conformance check no longer buffers wrangler's migration output, so a repository with many migrations does not fail with ENOBUFS.
