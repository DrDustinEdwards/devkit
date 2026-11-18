---
"@dustinedwards/devkit": minor
---

The restore drill reads the d1-dump release from the caller's package.json (`package-json` input, default `package.json`) instead of a `d1-dump-ref` input, so it cannot drift from the release the nightly dump runs. The files drill uses the same release. Breaking: remove `d1-dump-ref` from each caller's `with:`.
