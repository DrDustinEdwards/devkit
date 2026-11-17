---
"@dustinedwards/devkit": patch
---

The no-bloat check lets a change that only adds `entry` globs to a Knip config in data lower Knip's unused `files` by as many tracked files as the new globs name, and nothing else. Before, naming siteScript's `app/site.ts` and `app/islands/*.ts` as entries was refused as a narrower measure, though Knip then reads those files and what they import. A drop past the files named, a drop in any other count, a negation or any other change beside it is still refused.
