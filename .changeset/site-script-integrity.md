---
"@dustinedwards/devkit": minor
---

`siteScript` gives every script it builds integrity, which Integrity-Policy needs of each one. The built entry is now named by its content, `/site-<hash>.js` (a page cached from an earlier build keeps a file that matches its hash, which a fixed `/site.js` could not), and `virtual:islands` exports `SITE_SCRIPT`, `{ src, integrity, crossOrigin }`, for the page's `<script>` tag (`{ src: "/site.js" }` in `vite dev`, null with no entry). `startIslands` preloads each island and the chunks it imports with their sha384 before the `import()`, so the browser takes them with their integrity. A site that wrote `<script src="/site.js">` by hand writes `<script {...SITE_SCRIPT} defer>` instead.
