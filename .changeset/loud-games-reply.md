---
"@dustinedwards/devkit": minor
---

devkit-no-bloat: a change that only adds `entry` globs to a Knip config may now lower any Knip count (files, dependencies, exports, types, unlisted), not only the files the globs name. The entries are reached with everything they import, so those counts fall with them; no other count may.
