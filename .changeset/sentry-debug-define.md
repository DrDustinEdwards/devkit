---
"@dustinedwards/devkit": patch
---

`nativeBuiltins()` defines `__SENTRY_DEBUG__` as false, so a bundler drops Sentry's debug logging, which runs only with Sentry's `debug` option and no site sets. About 10 KiB raw and 3.8 KiB gzip off Germomics' Worker.
