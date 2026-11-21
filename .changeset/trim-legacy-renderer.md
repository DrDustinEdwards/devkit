---
"@dustinedwards/devkit": minor
---

`nativeBuiltins()` also drops React's legacy string renderer (`renderToString`, `renderToStaticMarkup`) from a production build: about 100 KB raw off every Worker that renders with `renderToReadableStream`. Both functions now throw.
