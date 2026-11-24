---
"@dustinedwards/devkit": patch
---

`nativeBuiltins()` answers `decode-named-character-reference` (micromark's entity lookup, with its 33 KB `character-entities` table) with `entities`' `decodeHTMLStrict` in a server build, so a Worker that renders Markdown through Prelum keeps one HTML entity table, the one htmlparser2 already carries. About 12 KiB gzip off Foxing's Worker. A browser build, or a project without `entities`, is unchanged.
