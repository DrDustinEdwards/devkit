# Shared-code completeness

Newest run 2026-11-07 13:49 UTC. Filled only from the live checks and the verifiers' verdicts.

**Not finished.** Finished means every cell complete and clean for 7 daily runs.

✅ complete · 🟡 partial · ❌ missing · ❔ could not measure · `·` does not apply

| Area | Package | dustinedwards.info | Germomics | julieedwards.info | TXASM | BSW | Foxhound | Foxing | Carrel | Enarratio | Capsomer | Prelum specimen | Capsid explorer | Capsid MCP | Foxhound admin MCP | Dustin Edwards admin MCP | Carrel MCP | Foxing admin MCP | Capsid Portal | Carrel Desk | Lines added | Lines removed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|
| 1. Search, sharing and AI answers | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | · | · | · | · | · | · | · | +18963 | −960 |
| 2. Security headers and CSP | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ❌ | +52000 | −8463 |
| 3. Sign-in and access | 🟡 | 🟡 | 🟡 | · | ❌ | · | 🟡 | 🟡 | · | · | · | · | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 | +67457 | −2968 |
| 4. Writing and rendering | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | · | · | · | · | · | · | · | +6996 | −3129 |
| 5. Carrel editing contract | 🟡 | ❔ | ❔ | ❔ | ❔ | · | ❔ | ❔ | · | · | · | · | · | · | · | · | · | · | · | · | +38995 | −8146 |
| 6. Images and media | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | ❌ | · | +30007 | −3470 |
| 7. Speed and caching | 🟡 | ❔ | ❌ | ❔ | ❌ | ❌ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | · | · | · | · | · | · | · | +6536 | −3234 |
| 8. Running and recovery | 🟡 | ❌ | 🟡 | ❌ | 🟡 | ❌ | 🟡 | 🟡 | · | · | · | · | · | ❌ | ❌ | ❌ | 🟡 | 🟡 | · | · | +28958 | −2924 |
| 9. Accessibility and components | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | · | · | · | · | · | · | · | +7063 | −801 |
| 10. Charts | ❌ | ✅ | ✅ | · | · | · | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ✅ | 🟡 | · | · | · | · | · | ✅ | 🟡 | +33215 | −9539 |
| 11. AI and MCP | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | +52017 | −7048 |
| 12. Checks and tooling | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | +3950 | −382 |

## Why a cell is not complete

### 1. Search, sharing and AI answers

Builder: Share SEO and other key site code. Verifier: Verify scoreboard cells awaiting sign-off.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: llms.txt says every page has a .md twin, but /about.md and /writing.md are 404 and Accept: text/markdown returns HTML; 1 internal link goes through a redirect; 3 titles over 60 characters
- 🟡 Germomics: no Markdown twin: /&lt;page&gt;.md is 404 and Accept: text/markdown returns HTML (checked 5 Nov); 15 of 25 sitemap URLs have no lastmod
- 🟡 julieedwards.info: no Markdown twin: no .md route and Accept: text/markdown returns HTML (checked 5 Nov); llms-full.txt is 404
- ❌ TXASM: prelum-audit: 165 errors
  - robots-blocks-all: https://txasm.org/robots.txt robots.txt disallows the home page to Googlebot, so no page is crawled
  - sitemap-blocked: https://txasm.org the sitemap lists a URL robots.txt disallows
  - sitemap-blocked: https://txasm.org/meetings the sitemap lists a URL robots.txt disallows
  - sitemap-blocked: https://txasm.org/awardees the sitemap lists a URL robots.txt disallows
  - sitemap-blocked: https://txasm.org/award-nominations the sitemap lists a URL robots.txt disallows
- ❌ BSW: prelum-audit: 20 errors
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/ the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/grant-proposal-support the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/manuscript-editing the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/visual-design the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/language-support the sitemap lists a noindex page
- 🟡 Foxhound: no Markdown twin: /&lt;page&gt;.md is 404 and Accept: text/markdown returns HTML (checked 5 Nov); 69 of 112 sitemap URLs have no lastmod; 12 internal links go through redirects
- ❌ Foxing: prelum-audit: 587 errors
  - link-redirect: https://foxing.app/ links to https://foxing.app/clubs, which redirects to /login?redirect=/clubs
  - link-redirect: https://foxing.app/ links to https://foxing.app/people, which redirects to /login
  - link-redirect: https://foxing.app/books links to https://foxing.app/clubs, which redirects to /login?redirect=/clubs
  - link-redirect: https://foxing.app/books links to https://foxing.app/people, which redirects to /login
  - link-redirect: https://foxing.app/awards links to https://foxing.app/clubs, which redirects to /login?redirect=/clubs
- 🟡 Carrel: no Markdown twin (Accept: text/markdown returns HTML); no lastmod on either sitemap URL; llms-full.txt is 404
- 🟡 Enarratio: checks pass; no verifier yet
- 🟡 Capsomer: checks pass; no verifier yet
- 🟡 Capsid explorer: no Markdown twin: /&lt;page&gt;.md is 404 and Accept: text/markdown returns HTML (checked 5 Nov); llms-full.txt is 404

### 2. Security headers and CSP

Builder: Complete shared security headers and CSP. Verifier: Verify security headers.

- 🟡 dustinedwards.info: Fails the newest check (v0.66.0, which the board runs) on C16: frame-src does not yet let in the post players the entry declares (embeds) and on I3: COEP is still enforced where an embedding site must keep it Report-Only. It passes v0.65.0 with 0 errors. Pin is v0.65.0 in package.json and mcp/package.json; a bump to v0.66.0 with the site's embeds change and a deploy fixes it. Re-check then.
- 🟡 Germomics: failed on 2026-11-02, after Verify security headers signed; needs a fresh verifier
- 🟡 Foxhound: Fails the newest check (v0.66.0, which the board runs) on C16: frame-src does not yet let in the post players the entry declares (embeds). It passes v0.65.0 with 0 errors. foxhound #432 (v0.66.0) is open; re-check after it deploys.
- 🟡 Capsomer: failed on 2026-11-01, after Verify security headers signed; needs a fresh verifier
- 🟡 Prelum specimen: Fails the newest check (v0.66.0, which the board runs) on C16: frame-src does not yet let in the post players the entry declares (embeds) and on I3 (COEP enforced, not Report-Only). prelum #182 (v0.66.0) merged at 22:49Z but the live sha at 23:10Z was still ffbe359, so the deploy had not landed. It passes v0.65.0 with 0 errors. Re-check after the deploy.
- 🟡 Foxing admin MCP: 0 errors, 0 warnings live (on Cloudflare since foxing #165), but mcp/package.json pins site-runtime v0.62.0, four minors behind v0.66.0. devkit's pin check (S7) wants every MCP server within one minor; it is a warning until devkit 0.21.0. Bump to the current release and redeploy.
- ❌ Carrel Desk: site-runtime-security: 1 errors
  - D1: https://desk.dustinedwards.info/.well-known/security.txt is behind Cloudflare Access; it must be public (RFC 9116)

### 3. Sign-in and access

Builder: Complete shared sign-in and access. Verifier: Verify shared sign-in and access.

- 🟡 Package: passkey delete and email change need no fresh sign-in; a new link resets the three tries; Turnstile off when a key is missing; no new-device or recovery notice, no security history, no spike alert
- 🟡 dustinedwards.info: failed on 2026-11-01, after Verify shared sign-in and access signed; needs a fresh verifier
- 🟡 Germomics: admin items pass; the admin 403 is not logged and nothing alerts on spikes (F2, F3)
- ❌ TXASM: site-runtime-sign-in: 1 errors
  - A1: https://txasm.dustin-edwards.workers.dev/api/auth/passkey/generate-authenticate-options the passkey's rpId is txasm.dustin-edwards.workers.dev, not txasm.org: a passkey made here will not work on the site
- 🟡 Foxhound: merchant MCP has no CIMD (fails H4 live), thin consent page, local call log; package gaps
- 🟡 Foxing: idle sign-out skips /api/v1/admin and /api/v1/ops; change-email mail goes to the wrong address; raw send error rethrown; package gaps
- 🟡 Capsid explorer: Portal session is a 12-hour cookie with no 1-hour idle sign-out and no server-side revoke; Portal sign-ins not logged
- 🟡 Foxing admin MCP: parked: the Worker has never been deployed, so the old server fails H4 live
- 🟡 Carrel Desk: Signed-out redirect to Access is correct, but the Carrel repository and a signed-in session were not available to this verifier, so session lifetime, idle sign-out and revoke are unchecked

### 4. Writing and rendering

Builder: Complete shared writing and rendering. Verifier: Verify scoreboard cells awaiting sign-off.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: 53 pages render writing with no data-render-version wrapper, 6 images without width and height, h3 after h1 on /research/publications
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 julieedwards.info: live check clean on 1 page; the repository was not available, and earlier notes say it has its own section grammar rather than Prelum
- 🟡 TXASM: checked on the workers.dev address: 41 pages, 0 errors; /award-nominations has no data-render-version wrapper
- 🟡 BSW: 11 pages with h3 after h1 (heading order)
- 🟡 Foxhound: 6 pages with h3 after h1
- 🟡 Foxing: /books has h3 after h1
- 🟡 Carrel: live check clean on 2 pages; the Carrel repository was not available to this verifier, and earlier notes say Carrel books still use a regex renderer
- 🟡 Enarratio: live check clean on 5 pages; its source was not available to this verifier, so use of Prelum and absence of a second renderer is not proven
- 🟡 Capsomer: the live check is clean, but the showcase still renders Markdown with its own regex renderer (site/markdown.ts, used by home, views and main), so there is more than one renderer
- 🟡 Prelum specimen: specimen renders writing with no data-render-version wrapper

### 5. Carrel editing contract

Builder: Complete Carrel editing contract. Verifier: Verify area 5 Carrel editing contract.

- 🟡 Package: no schedule/unschedule event for an unpublished post; unknown fields stripped with 200 (A8); site-api-live ignores --from; webmention SSRF guard hostname-only, two guards; no shared purge hook; no feature-image post field; conformance blind to 301, 410, trash expiry, preview-link life, hooks, field round-trips; Carrel: conflict discards text, no merge, no excerpt/authors/series/publishedAt boxes, no preview-link revoke, no inbound-link warning, no width preview; PostsList no aria-sort; no hand a11y pass; Carrel README wrong
- ❔ dustinedwards.info: site-api-live could not measure: could not run: npm could not install site-api#v0.31.0: npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-11-07T13_18_35_500Z-debug-0.log
- ❔ Germomics: site-api-live could not measure: could not run: npm could not install site-api#v0.31.0: npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-11-07T13_18_35_500Z-debug-0.log
- ❔ julieedwards.info: site-api-live could not measure: could not run: npm could not install site-api#v0.31.0: npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-11-07T13_18_35_500Z-debug-0.log
- ❔ TXASM: site-api-live could not measure: could not run: npm could not install site-api#v0.31.0: npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-11-07T13_18_35_500Z-debug-0.log
- ❔ Foxhound: site-api-live could not measure: could not run: npm could not install site-api#v0.31.0: npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-11-07T13_18_35_500Z-debug-0.log
- ❔ Foxing: site-api-live could not measure: could not run: npm could not install site-api#v0.31.0: npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-11-07T13_18_35_500Z-debug-0.log

### 6. Images and media

Builder: Complete shared images and media. Verifier: Verify area 6 images and media.

- 🟡 Package: uploads built (HEIC, GPS strip, placeholder); a replace keeps the immutable size URL; pictureProps carries no placeholder; Prelum picture drops source media (GIF never moves) and counts priority per render; unsized diagram img; credit/license never reach the renderer; no 1.91:1 cover crop, no 16:9/4:3/1:1 set, no og:video; respond sets no CORP; AVIF not stripped; images check skips A6 and C9 and never runs on the Portal
- 🟡 dustinedwards.info: failed on 2026-11-01, after Verify area 6 images and media signed; needs a fresh verifier
- 🟡 Germomics: episodes share the wordmark card, not their own picture; fetchpriority=high image eager and below the fold; card labeled image/jpeg but served WebP; card CORP same-origin; no placeholder, ImageObject or image sitemap; local reencode wrapper
- 🟡 julieedwards.info: profile photo 884 KB, 2048 px, unsized, no srcset, 3.1x at 670 px, cached 4 h, other host without preconnect; must go into the library; fallback img unsized
- 🟡 TXASM: og:image only works on workers.dev (txasm.org still WordPress); brand-image upload has no byte check or GPS strip; card CORP same-origin; no placeholder, credit, ImageObject or image sitemap
- ❌ BSW: site-runtime-images: 2 errors
  - A12: https://bsw.dustin-edwards.workers.dev/media/uploads/2026/11/grant-review-6b238865.webp.webp?w=512 Cache-Control is "public, max-age=86400", not immutable
  - A12: https://bsw.dustin-edwards.workers.dev/media/uploads/2026/11/grant-review-6b238865.webp.avif?w=512 Cache-Control is "public, max-age=86400", not immutable
- 🟡 Foxhound: cover picture is its own code, not pictureProps; a cover outside the library is unsized; no placeholder, credit, ImageObject or image sitemap; footer SVG has no loading/decoding
- ❌ Foxing: site-runtime-images: 4 errors
  - A6: https://foxing.app/books /media/covers/a-country-gentleman-and-his-family-oliphant.jpg.webp?w=240 is below the fold (y≈2063 at 390, y≈1161 at 1440) and loading="eager"
  - A6: https://foxing.app/books /media/covers/a-cycle-of-the-west-neihardt.jpg.webp?w=240 is below the fold (y≈2063 at 390, y≈1161 at 1440) and loading="eager"
  - A6: https://foxing.app/books /media/covers/a-damsel-in-distress-wodehouse.jpg.webp?w=240 is below the fold (y≈2558 at 390, y≈1161 at 1440) and loading="eager"
  - A6: https://foxing.app/books /media/covers/a-daughter-of-eve-balzac.jpg.webp?w=240 is below the fold (y≈2558 at 390, y≈1161 at 1440) and loading="eager"
- 🟡 Carrel: images check passes; share card answers CORP same-origin
- 🟡 Enarratio: failed on 2026-11-01, after Verify area 6 images and media signed; needs a fresh verifier
- 🟡 Capsomer: failed on 2026-11-01, after Verify area 6 images and media signed; needs a fresh verifier
- 🟡 Prelum specimen: images check fails: unsized diagram SVGs, 3 fetchpriority=high, 48 px icon shown at 16 px; share card CORP same-origin
- 🟡 Capsid explorer: images check passes; share card answers CORP same-origin
- ❌ Capsid Portal: site-runtime-images: 1 errors
  - C1: https://portal.dustinedwards.info/ sends a stranger to dustinedwards.cloudflareaccess.com before any page, so a shared link shows that host's card, not one of the site's own; nothing else is visible to check
- Not checked, Capsid Portal and Carrel Desk pages behind sign-in: a stranger's crawl sees only the redirect to Access, so the images on the signed-in pages (Desk's media library, the Portal's views) are not checked live

### 7. Speed and caching

Builder: Complete shared speed and caching. Verifier: Verify speed and caching.

- 🟡 Package: Three of the four check bugs are fixed in site-runtime 0.67.1 and proven. D1: the check sends a Chrome agent; on the devkit runner (run 41252992440, 1 Nov 00:10 UTC, check v0.67.1) D1 passes on all ten custom domains and fails only on txasm and bsw (workers.dev, accepted); curl with that agent gets 103 then 200 on all ten. B4: a 404 is judged by its cache-control; passes on Carrel, Capsomer, Enarratio, Prelum and the explorer (no B4 in the run). hashed(): needs a hash-like token; apple-touch-icon.png is no longer hashed (4 unit tests pass). Still wrong: the old path shortcut in hashed() treats every file under /assets/ or /islands/ as hashed, so C1 fails 5 times on the Capsid explorer, whose /assets files (capsomer.css, enarratio.css, explorer.css, theme.js, explorer.js) are deliberately unhashed (explorer/worker.mjs says so) and send public, max-age=3600, which is right for them. Until the check judges those by their names, or the explorer hashes them, the board stays red on that cell. A1/A3 have no data without the CrUX key (Dustin's; the run shows PageSpeed 429). Not caught in round 2 because a cloud session's Node cannot decode zstd, so the home page body was empty and no files were sampled.
- ❔ dustinedwards.info: site-runtime-speed could not measure: A3: https://dustinedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://dustinedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❌ Germomics: site-runtime-speed: 2 errors
  - C2: https://germomics.com/fonts/space-grotesk-latin.woff2 an unhashed file sent cache-control public, max-age=86400: browsers keep it over 300 s without asking, so a deploy reaches returning readers late; hash its name or revalidate
  - C2: https://germomics.com/fonts/fraunces-latin.woff2 an unhashed file sent cache-control public, max-age=86400: browsers keep it over 300 s without asking, so a deploy reaches returning readers late; hash its name or revalidate
- ❔ julieedwards.info: site-runtime-speed could not measure: A3: https://julieedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://julieedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❌ TXASM: site-runtime-speed: 1 errors
  - D1: https://txasm.dustin-edwards.workers.dev/ no 103 Early Hints before the page: workers.dev never sends Early Hints; the site needs its own domain
- ❌ BSW: site-runtime-speed: 1 errors
  - D1: https://bsw.dustin-edwards.workers.dev/ no 103 Early Hints before the page: workers.dev never sends Early Hints; the site needs its own domain
- ❔ Foxhound: site-runtime-speed could not measure: A3: https://foxhoundapp.com/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://foxhoundapp.com/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ Foxing: site-runtime-speed could not measure: A3: https://foxing.app/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://foxing.app/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ Carrel: site-runtime-speed-static could not measure: A3: https://carrel.dustinedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://carrel.dustinedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ Enarratio: site-runtime-speed-static could not measure: A3: https://enarratio.dustinedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://enarratio.dustinedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ Capsomer: site-runtime-speed-static could not measure: A3: https://capsomer.dustinedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://capsomer.dustinedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ Prelum specimen: site-runtime-speed-static could not measure: A3: https://prelum.dustinedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://prelum.dustinedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ Capsid explorer: site-runtime-speed could not measure: A3: https://capsid.dustinedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://capsid.dustinedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured

### 8. Running and recovery

Builder: Complete shared running and recovery. Verifier: Verify area 8 round 2.

- 🟡 Package: Built but off: gradual rollout and previews in worker-deploy (no caller turns them on; D4 never compares error rates); goneResponse/renameRedirect unused; no shared redirect table (N5); no drill restores files; R2/R5 still owed; ops-audit exits 0 when its GitHub reads fail and never tests bindings (H5) or the shared 404 page (N6); probe filter misses .zip, .tar.gz, /web.config, /server-status
- ❌ dustinedwards.info: ops-audit: 1 errors
  - H5: https://dustinedwards.info/health no check on /health probes EMAIL (send_email), declared in https://github.com/DrDustinEdwards/dustinedwards-info/blob/main/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason
- 🟡 Germomics: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier
- ❌ julieedwards.info: ops-audit: 1 errors
  - H5: https://julieedwards.info/health no check on /health probes RATE_LIMITER (durable_object), declared in https://github.com/DrDustinEdwards/julieedwards-info/blob/main/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason
- 🟡 TXASM: Health passes on workers.dev at head and drill passed; txasm.org still serves WordPress; D4/D6 off
- ❌ BSW: ops-audit: 1 errors
  - H5: https://bsw.dustin-edwards.workers.dev/health no check on /health probes RATE_LIMITER (durable_object), declared in https://github.com/DrDustinEdwards/bsw/blob/main/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason
- 🟡 Foxhound: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Foxing: failed on 2026-11-04, after Verify area 8 round 2 signed; needs a fresh verifier
- ❌ Capsid MCP: ops-audit: 1 errors
  - H5: https://mcp.dustinedwards.info/health no check on /health probes EMAIL (send_email), declared in https://github.com/DrDustinEdwards/capsid/blob/master/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason
- ❌ Foxhound admin MCP: ops-audit: 1 errors
  - H4: https://admin-mcp.foxhoundapp.com/health serves 543ec856f79d8c3cac76d2867286a91e7cb05f2c, not the branch head d1b2009e9c89092fd767f2c4a9ef10ae49af0f5d (https://github.com/DrDustinEdwards/foxhound/commit/d1b2009e9c89092fd767f2c4a9ef10ae49af0f5d), committed 708 minutes ago
- ❌ Dustin Edwards admin MCP: ops-audit: 1 errors
  - H4: https://admin-mcp.dustinedwards.info/health serves cdb46887b051136814471abffa706d933e6c6017, not the branch head 9c6a6cde448dcc703ee55cc01861c8a5a5640b20 (https://github.com/DrDustinEdwards/dustinedwards-info/commit/9c6a6cde448dcc703ee55cc01861c8a5a5640b20), committed 257 minutes ago
- 🟡 Carrel MCP: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Foxing admin MCP: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier

### 9. Accessibility and components

Builder: Complete accessibility and Capsomer components. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: checks pass; no verifier yet
- ❌ Germomics: devkit-a11y: 15 errors
  - L2: https://germomics.com/ no skip link to main as the first Tab stop (first stop &#96;body &gt; header.sticky.top-0 &gt; div.mx-auto.flex &gt; a.flex.items-center&#96; "germomics")
  - L3: https://germomics.com/ text clipped with WCAG 1.4.12 text spacing: &#96;div.grid.gap-3:nth-of-type(2) &gt; article.flex.gap-4:nth-of-type(2) &gt; div.min-w-0.flex-1 &gt; p.mt-1.line-clamp-2&#96; (vertical), &#96;div.grid.gap-3:nth-of-type(2) &gt; article.flex.gap-4:nth-of-type(5) &gt; div.min-w-0.flex-1 &gt; p.mt-1.line-clamp-2&#96; (vertical), &#96;div.grid.gap-3:nth-of-type(2) &gt; article.flex.gap-4:nth-of-type(10) &gt; div.min-w-0.flex-1 &gt; p.mt-1.line-clamp-2&#96; (vertical)
  - L2: https://germomics.com/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop &#96;main#main &gt; div.cap-empty &gt; div.cap-empty-content:nth-of-type(2) &gt; a.cap-btn&#96; "Go to the home page")
  - L2: https://germomics.com/about no skip link to main as the first Tab stop (first stop &#96;body &gt; header.sticky.top-0 &gt; div.mx-auto.flex &gt; a.flex.items-center&#96; "germomics")
  - L2: https://germomics.com/contact no skip link to main as the first Tab stop (first stop &#96;body &gt; header.sticky.top-0 &gt; div.mx-auto.flex &gt; a.flex.items-center&#96; "germomics")
- ❌ julieedwards.info: devkit-a11y: 6 errors
  - L1: https://julieedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first &#96;html&#96;
  - L1: https://julieedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first &#96;html&#96;
  - L2: https://julieedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop &#96;html &gt; body &gt; div.json-formatter-container&#96; "")
  - L2: https://julieedwards.info/site.webmanifest no visible focus on 20 of 20 stops: &#96;html &gt; body &gt; div.json-formatter-container&#96;, &#96;html &gt; body &gt; div.json-formatter-container&#96;, &#96;html &gt; body &gt; div.json-formatter-container&#96; and 17 more
  - S2: https://julieedwards.info/site.webmanifest no lang on &lt;html&gt;
- ❌ TXASM: devkit-a11y: 2 errors
  - L2: https://txasm.dustin-edwards.workers.dev/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop &#96;main#main &gt; div.cap-empty &gt; div.cap-empty-content:nth-of-type(2) &gt; a.cap-btn&#96; "Go to the home page")
  - L1: https://txasm.dustin-edwards.workers.dev/newsletters/fall-1991-newsletter axe aria-prohibited-attr (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first &#96;.pdf-viewer-page&#96;
- ❌ BSW: devkit-a11y: 10 errors
  - L2: https://bsw.dustin-edwards.workers.dev/ no skip link to main as the first Tab stop (first stop &#96;div.flex.min-h-screen &gt; header.sticky.top-0 &gt; div.mx-auto.flex:nth-of-type(1) &gt; a.shrink-0&#96; "BioScience Writers home")
  - L2: https://bsw.dustin-edwards.workers.dev/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop &#96;section:nth-of-type(2) &gt; div.page-prose.mx-auto &gt; p.mt-8:nth-of-type(2) &gt; a.btn.btn-blue&#96; "Go to the home page")
  - L2: https://bsw.dustin-edwards.workers.dev/about-us no skip link to main as the first Tab stop (first stop &#96;div.flex.min-h-screen &gt; header.sticky.top-0 &gt; div.mx-auto.flex:nth-of-type(1) &gt; a.shrink-0&#96; "BioScience Writers home")
  - L2: https://bsw.dustin-edwards.workers.dev/contact-us no skip link to main as the first Tab stop (first stop &#96;div.flex.min-h-screen &gt; header.sticky.top-0 &gt; div.mx-auto.flex:nth-of-type(1) &gt; a.shrink-0&#96; "BioScience Writers home")
  - L2: https://bsw.dustin-edwards.workers.dev/grant-proposal-support no skip link to main as the first Tab stop (first stop &#96;div.flex.min-h-screen &gt; header.sticky.top-0 &gt; div.mx-auto.flex:nth-of-type(1) &gt; a.shrink-0&#96; "BioScience Writers home")
- ❌ Foxhound: devkit-a11y: 5 errors
  - L1: https://foxhoundapp.com/ axe color-contrast (serious, WCAG) at 390-light, 390-dark: 1 element, first &#96;li[data-queue-row="0"] &gt; .min-w-0.flex-1 &gt; .block.text-text-subtle[data-queue-meta=""]&#96;
  - L3: https://foxhoundapp.com/ text clipped with WCAG 1.4.12 text spacing: &#96;a.cap-panel.h-full &gt; div.cap-panel-body &gt; div.flex.h-full &gt; h3.m-0.line-clamp-2&#96; (vertical), &#96;a.cap-panel.h-full &gt; div.cap-panel-body &gt; div.flex.h-full &gt; h3.m-0.line-clamp-2&#96; (vertical)
  - L2: https://foxhoundapp.com/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop &#96;body.min-h-full &gt; div.fh-cap.fh-error-page &gt; header.fh-error-bar.flex &gt; a.no-underline&#96; "foxhound")
  - L3: https://foxhoundapp.com/blog/archive text clipped with WCAG 1.4.12 text spacing: &#96;div.flex.flex-col:nth-of-type(3) &gt; a.group.-mx-2:nth-of-type(1) &gt; div.min-w-0.flex-1 &gt; p.mt-0\.5.line-clamp-1:nth-of-type(2)&#96; (vertical), &#96;div.flex.flex-col:nth-of-type(3) &gt; a.group.-mx-2:nth-of-type(2) &gt; div.min-w-0.flex-1 &gt; p.mt-0\.5.line-clamp-1:nth-of-type(2)&#96; (vertical), &#96;div.flex.flex-col:nth-of-type(3) &gt; a.group.-mx-2:nth-of-type(3) &gt; div.min-w-0.flex-1 &gt; p.mt-0\.5.line-clamp-1:nth-of-type(2)&#96; (vertical) and 33 more
  - L2: https://foxhoundapp.com/decline-codes/insufficient_funds Escape did not close what &#96;section.mb-10:nth-of-type(4) &gt; ul.m-0.flex &gt; li.overflow-hidden.rounded-lg:nth-of-type(1) &gt; button.flex.w-full&#96; opened
- ❌ Foxing: devkit-a11y: 2 errors
  - L2: https://foxing.app/ no visible focus on 1 of 40 stops: &#96;input#q&#96;
  - L2: https://foxing.app/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop &#96;main#main &gt; div.cap-empty &gt; div.cap-empty-content:nth-of-type(2) &gt; a.cap-btn&#96; "Go to the home page")
- ❌ Carrel: devkit-a11y: 6 errors
  - L1: https://carrel.dustinedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first &#96;html&#96;
  - L1: https://carrel.dustinedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first &#96;html&#96;
  - L2: https://carrel.dustinedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop &#96;html &gt; body &gt; div.json-formatter-container&#96; "")
  - L2: https://carrel.dustinedwards.info/site.webmanifest no visible focus on 20 of 20 stops: &#96;html &gt; body &gt; div.json-formatter-container&#96;, &#96;html &gt; body &gt; div.json-formatter-container&#96;, &#96;html &gt; body &gt; div.json-formatter-container&#96; and 17 more
  - S2: https://carrel.dustinedwards.info/site.webmanifest no lang on &lt;html&gt;
- 🟡 Enarratio: checks pass; no verifier yet
- ❌ Capsomer: devkit-a11y: 3 errors
  - L2: https://capsomer.dustinedwards.info/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop &#96;body &gt; main &gt; p &gt; a&#96; "Go to Capsomer's front page")
  - L1: https://capsomer.dustinedwards.info/components/admin-shell/ axe label-content-name-mismatch (serious, WCAG) at 1440-light, 1440-dark: 1 element, first &#96;section[aria-labelledby="ex-tip"] &gt; .comp-ex-box &gt; iframe[data-height="360"] a[aria-describedby="cap-popover-11"]&#96;
  - L2: https://capsomer.dustinedwards.info/make/ no visible focus on 1 of 40 stops: &#96;input#mk-radius&#96;
- ❌ Prelum specimen: devkit-a11y: 6 errors
  - L1: https://prelum.dustinedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first &#96;html&#96;
  - L1: https://prelum.dustinedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first &#96;html&#96;
  - L2: https://prelum.dustinedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop &#96;html &gt; body &gt; div.json-formatter-container&#96; "")
  - L2: https://prelum.dustinedwards.info/site.webmanifest no visible focus on 20 of 20 stops: &#96;html &gt; body &gt; div.json-formatter-container&#96;, &#96;html &gt; body &gt; div.json-formatter-container&#96;, &#96;html &gt; body &gt; div.json-formatter-container&#96; and 17 more
  - S2: https://prelum.dustinedwards.info/site.webmanifest no lang on &lt;html&gt;
- ❌ Capsid explorer: devkit-a11y: 1 errors
  - L2: https://capsid.dustinedwards.info/systems/ no visible focus on 21 of 40 stops: &#96;div#family-hex &gt; svg.cap-system-map-comb &gt; a.cap-system-map-cell:nth-of-type(1)&#96;, &#96;div#family-hex &gt; svg.cap-system-map-comb &gt; a.cap-system-map-cell:nth-of-type(2)&#96;, &#96;div#family-hex &gt; svg.cap-system-map-comb &gt; a.cap-system-map-cell:nth-of-type(3)&#96; and 18 more
- Not checked, the MCP servers' consent pages: each renders only for a registered OAuth client mid-sign-in, so a stranger's scan cannot reach it

### 10. Charts

Builder: Complete shared charts. Verifier: Verify scoreboard cells awaiting sign-off.

- ❌ Package: no verifier has checked the package
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: no charts on either public page, so the check proves nothing; this cell should be a skip in areas.json
- 🟡 Capsomer: checks pass; no verifier yet
- 🟡 Capsid explorer: checks pass; no verifier yet
- 🟡 Carrel Desk: chart-audit fails D5 on /demos/progress at 320 px, 0.025, div.cap-chart moves 42 px; reproduced on 3 of 3 runs on 5 Nov

### 11. AI and MCP

Builder: Complete shared AI and MCP code. Verifier: Verify area 11 AI and MCP.

- 🟡 Package: live check covers 7 of 89 items; conformance off Actions except Carrel; no static AI rules or pin comparison in devkit; toolsForGrant and fireOnce unused; no tool icons, tool-list pin, cancel on close; log has no export, retention, alert or Portal view; no shared agent keys; suggester metadata and Llama list
- 🟡 dustinedwards.info: Signed by Verify scoreboard cells awaiting sign-off, 2026-11-05. site-runtime-ai-audit: 0 errors, 0 warnings. Fixed and checked in code: a cut answer is never cached (finish_reason read), Ask's gateway tags use site-runtime's {app, feature}, suggester on site-api 0.21.0. Still open: the question is not wrapped in untrusted() (C10; the builder's note says wrapping breaks AI Search retrieval, which is a known limit, not a pass); site-api 0.22.0 is out and dei pins 0.21.0; that Ask's calls reach the gateway is configured on the AI Search instance and was not checked live.
- 🟡 Germomics: local style text instead of WRITING_RULES; suggester gaps from the package
- 🟡 julieedwards.info: suggester on site-api v0.17.0: no timeout, JSON mode or prose check
- 🟡 TXASM: suggester inherits the package gaps (feature metadata, Llama list)
- 🟡 Foxhound: failed on 2026-11-01, after Verify area 11 AI and MCP signed; needs a fresh verifier
- 🟡 Foxing: Plus chat and recommendation reasons unchecked by prose; companion logs user_id; suggester on site-api v0.17.0
- 🟡 Carrel: routine re-fire guard not atomic; shared fireOnce unused
- 🟡 Capsid explorer: AI Search reranker has no timeout or gateway and returns raw upstream errors
- 🟡 Capsid MCP: failed on 2026-11-01, after Verify area 11 AI and MCP signed; needs a fresh verifier
- 🟡 Foxhound admin MCP: failed on 2026-11-01, after Verify area 11 AI and MCP signed; needs a fresh verifier
- 🟡 Dustin Edwards admin MCP: failed on 2026-11-01, after Verify area 11 AI and MCP signed; needs a fresh verifier
- 🟡 Carrel MCP: failed on 2026-11-01, after Verify area 11 AI and MCP signed; needs a fresh verifier
- 🟡 Foxing admin MCP: failed on 2026-11-01, after Verify area 11 AI and MCP signed; needs a fresh verifier

### 12. Checks and tooling

Builder: Complete shared checks and tooling. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: no live check; no verifier has checked it
- ❌ Germomics: no live check; no verifier has checked it
- ❌ julieedwards.info: no live check; no verifier has checked it
- ❌ TXASM: no live check; no verifier has checked it
- ❌ BSW: no live check; no verifier has checked it
- ❌ Foxhound: no live check; no verifier has checked it
- ❌ Foxing: no live check; no verifier has checked it
- ❌ Carrel: no live check; no verifier has checked it
- ❌ Enarratio: no live check; no verifier has checked it
- ❌ Capsomer: no live check; no verifier has checked it
- ❌ Prelum specimen: no live check; no verifier has checked it
- ❌ Capsid explorer: no live check; no verifier has checked it
- ❌ Capsid MCP: no live check; no verifier has checked it
- ❌ Foxhound admin MCP: no live check; no verifier has checked it
- ❌ Dustin Edwards admin MCP: no live check; no verifier has checked it
- ❌ Carrel MCP: no live check; no verifier has checked it
- ❌ Foxing admin MCP: no live check; no verifier has checked it
- ❌ Capsid Portal: no live check; no verifier has checked it
- ❌ Carrel Desk: no live check; no verifier has checked it
