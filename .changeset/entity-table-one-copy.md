---
"@dustinedwards/devkit": patch
---

`nativeBuiltins()` answers `decode-named-character-reference` with the `entities` that htmlparser2 imports, not the project's top-level one. When the two versions differ, the top-level copy added a second HTML entity table to the Worker instead of sharing htmlparser2's. About 16 KiB raw and 9 KiB gzip off dustinedwards.info's Worker.
