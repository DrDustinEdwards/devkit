---
"@dustinedwards/devkit": minor
---

`devkit-declarations` fails a package whose exported function returns a type defined outside its entry points (TS2883 in a project with a composite tsconfig). It found 2 such types in Prelum 0.68.0, 24 in site-runtime 0.182.0 and 2 in site-api 0.49.1.
