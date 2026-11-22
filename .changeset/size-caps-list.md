---
"@dustinedwards/devkit": minor
---

`devkit-no-bloat` holds file size: a source file over 500 lines (a test over 800) is listed in the baseline's `size` with its line count; a new file over the cap fails, a listed one may not grow, and the list only shrinks. A repository's first `--write-baseline` after this release records its current long files, which is no raise. `live/copies.json` is lowered to 6 copies and 73 names.
