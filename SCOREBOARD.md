# Shared-code completeness

Newest run 2026-11-06 00:24 UTC. Filled only from the live checks and the verifiers' verdicts.

**Not finished.** Finished means every cell complete and clean for 7 daily runs.

✅ complete · 🟡 partial · ❌ missing · ❔ could not measure · `·` does not apply

| Area | Package | dustinedwards.info | Germomics | julieedwards.info | TXASM | BSW | Foxhound | Foxing | Carrel | Enarratio | Capsomer | Prelum specimen | Capsid explorer | Capsid MCP | Foxhound admin MCP | Dustin Edwards admin MCP | Carrel MCP | Foxing admin MCP | Capsid Portal | Carrel Desk | Lines added | Lines removed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|
| 1. Search, sharing and AI answers | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 | · | · | · | · | · | · | · | +18963 | −960 |
| 2. Security headers and CSP | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ❌ | +52000 | −8463 |
| 3. Sign-in and access | 🟡 | 🟡 | 🟡 | · | ❌ | · | 🟡 | 🟡 | · | · | · | · | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 | +67457 | −2968 |
| 4. Writing and rendering | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | · | · | · | · | · | · | · | +6996 | −3129 |
| 5. Carrel editing contract | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | · | ❌ | ❌ | · | · | · | · | · | · | · | · | · | · | · | · | +38995 | −8146 |
| 6. Images and media | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | · | · | · | · | · | ❌ | · | +30007 | −3470 |
| 7. Speed and caching | 🟡 | ❔ | ❌ | ❔ | ❌ | ❌ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | · | · | · | · | · | · | · | +6536 | −3234 |
| 8. Running and recovery | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | · | · | · | · | · | ❌ | ❌ | ✅ | ❌ | ❌ | · | · | +28958 | −2924 |
| 9. Accessibility and components | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | · | · | · | · | · | +7063 | −801 |
| 10. Charts | ❌ | ✅ | ✅ | · | · | · | ✅ | ❌ | 🟡 | ✅ | ❌ | ✅ | 🟡 | · | · | · | · | · | ✅ | 🟡 | +33215 | −9539 |
| 11. AI and MCP | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ❌ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | +52017 | −7048 |
| 12. Checks and tooling | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | +3950 | −382 |

Lines count public repositories only until the LIVE_GITHUB_TOKEN secret is set.

## Why a cell is not complete

### 1. Search, sharing and AI answers

Builder: Share SEO and other key site code. Verifier: Verify scoreboard cells awaiting sign-off.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: llms.txt says every page has a .md twin, but /about.md and /writing.md are 404 and Accept: text/markdown returns HTML; 1 internal link goes through a redirect; 3 titles over 60 characters
- 🟡 Germomics: no Markdown twin: /<page>.md is 404 and Accept: text/markdown returns HTML (checked 5 Nov); 15 of 25 sitemap URLs have no lastmod
- 🟡 julieedwards.info: no Markdown twin: no .md route and Accept: text/markdown returns HTML (checked 5 Nov); llms-full.txt is 404
- ❌ TXASM: prelum-audit: 41 errors
  - link-broken: https://txasm.org/ links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/meetings links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/awardees links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/award-nominations links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/branch-officers links to https://txasm.org/register, which answers 404
- ❌ BSW: prelum-audit: 20 errors
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/ the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/grant-proposal-support the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/manuscript-editing the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/visual-design the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/language-support the sitemap lists a noindex page
- 🟡 Foxhound: no Markdown twin: /<page>.md is 404 and Accept: text/markdown returns HTML (checked 5 Nov); 69 of 112 sitemap URLs have no lastmod; 12 internal links go through redirects
- 🟡 Foxing: no Markdown twin: /<page>.md is 404 and Accept: text/markdown returns HTML (checked 5 Nov); about 700 of 2,200 sitemap URLs have no lastmod; llms-full.txt is 404
- 🟡 Carrel: no Markdown twin (Accept: text/markdown returns HTML); no lastmod on either sitemap URL; llms-full.txt is 404
- ❌ Enarratio: prelum-audit: 1 errors
  - icon-missing: https://enarratio.dustinedwards.info/favicon.ico answers 404 text/html; charset=utf-8
- ❌ Capsomer: prelum-audit: 8 errors
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/chips/chips.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/link/link.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/empty/empty.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/empty/ links to https://capsomer.dustinedwards.info/components/skeleton/skeleton.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/empty/ links to https://capsomer.dustinedwards.info/components/error-page/error-page.md, which answers 404
- 🟡 Capsid explorer: no Markdown twin: /<page>.md is 404 and Accept: text/markdown returns HTML (checked 5 Nov); llms-full.txt is 404

### 2. Security headers and CSP

Builder: Complete shared security headers and CSP. Verifier: Verify security headers.

- 🟡 dustinedwards.info: Fails the newest check (v0.66.0, which the board runs) on C16: frame-src does not yet let in the post players the entry declares (embeds) and on I3: COEP is still enforced where an embedding site must keep it Report-Only. It passes v0.65.0 with 0 errors. Pin is v0.65.0 in package.json and mcp/package.json; a bump to v0.66.0 with the site's embeds change and a deploy fixes it. Re-check then.
- 🟡 Germomics: failed on 2026-11-02, after Verify security headers signed; needs a fresh verifier
- 🟡 Foxhound: Fails the newest check (v0.66.0, which the board runs) on C16: frame-src does not yet let in the post players the entry declares (embeds). It passes v0.65.0 with 0 errors. foxhound #432 (v0.66.0) is open; re-check after it deploys.
- ❌ Capsomer: site-runtime-security: 4 errors
  - C16: https://capsomer.dustinedwards.info/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://capsomer.dustinedwards.info/make/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://capsomer.dustinedwards.info/site-runtime-security-1bdc342a-776a-4a08-ac38-823b48ea0e00 (404) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://capsomer.dustinedwards.info/ (405) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
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
- ❌ Germomics: prelum-content: 17 errors
  - writing-render-version: https://germomics.com/about stored HTML from render version 17; the pipeline is at 18
  - writing-render-version: https://germomics.com/about stored HTML from render version 17; the pipeline is at 18
  - writing-render-version: https://germomics.com/about/dustin-edwards stored HTML from render version 17; the pipeline is at 18
  - writing-render-version: https://germomics.com/privacy stored HTML from render version 17; the pipeline is at 18
  - writing-render-version: https://germomics.com/terms stored HTML from render version 17; the pipeline is at 18
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
- ❌ dustinedwards.info: carrel-conformance: 1 errors
  - M1: https://dustinedwards.info/api/carrel/v1 meta: answers with this contract's schema hash failed
- 🟡 Germomics: author filter 501 though show.author is the byline; deleted post 404 not 410; preview is a hand-written shell; no series; no setTags; revisions author 'germomics', pages no history; admin.content.$key still writes pages outside Carrel
- 🟡 julieedwards.info: pins v0.17.0 so webmentions can read the stale edge copy, sent on publish only; live section with a draft reads as draft; revisions capped at 50; no delete or unpublish (needs ruling); preview without page chrome
- 🟡 TXASM: failed on 2026-11-01, after Verify area 5 Carrel editing contract signed; needs a fresh verifier
- ❌ Foxhound: carrel-conformance: 1 errors
  - M1: https://foxhoundapp.com/api/carrel/v1 meta: answers with this contract's schema hash failed
- ❌ Foxing: carrel-conformance: 1 errors
  - M1: https://foxing.app/api/carrel/v1 meta: answers with this contract's schema hash failed

### 6. Images and media

Builder: Complete shared images and media. Verifier: Verify area 6 images and media.

- 🟡 Package: uploads built (HEIC, GPS strip, placeholder); a replace keeps the immutable size URL; pictureProps carries no placeholder; Prelum picture drops source media (GIF never moves) and counts priority per render; unsized diagram img; credit/license never reach the renderer; no 1.91:1 cover crop, no 16:9/4:3/1:1 set, no og:video; respond sets no CORP; AVIF not stripped; images check skips A6 and C9 and never runs on the Portal
- 🟡 dustinedwards.info: failed on 2026-11-01, after Verify area 6 images and media signed; needs a fresh verifier
- 🟡 Germomics: episodes share the wordmark card, not their own picture; fetchpriority=high image eager and below the fold; card labeled image/jpeg but served WebP; card CORP same-origin; no placeholder, ImageObject or image sitemap; local reencode wrapper
- 🟡 julieedwards.info: profile photo 884 KB, 2048 px, unsized, no srcset, 3.1x at 670 px, cached 4 h, other host without preconnect; must go into the library; fallback img unsized
- 🟡 TXASM: og:image only works on workers.dev (txasm.org still WordPress); brand-image upload has no byte check or GPS strip; card CORP same-origin; no placeholder, credit, ImageObject or image sitemap
- 🟡 BSW: failed on 2026-11-03, after Verify area 6 images and media signed; needs a fresh verifier
- 🟡 Foxhound: cover picture is its own code, not pictureProps; a cover outside the library is unsized; no placeholder, credit, ImageObject or image sitemap; footer SVG has no loading/decoding
- ❌ Foxing: site-runtime-images: 1 errors
  - A6: https://foxing.app/books /media/covers/a-connecticut-yankee-in-king-arthurs-court-twain.jpg.webp?w=240 is loading="lazy" above the fold (y≈1524 at 390, y≈566 at 1440), so it waits for layout
- 🟡 Carrel: images check passes; share card answers CORP same-origin
- 🟡 Enarratio: failed on 2026-11-01, after Verify area 6 images and media signed; needs a fresh verifier
- ❌ Capsomer: site-runtime-images: 1 errors
  - C11: https://capsomer.dustinedwards.info/og-card.png the share card's Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview on another site may not load it
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
- 🟡 dustinedwards.info: Signed by Verify scoreboard cells awaiting sign-off, 2026-11-05. Fixed since 31 Oct and checked: /health shared shape, sha d3e0303e = main head, 27 checks pass, backup 4 h old, cron passes; /api/health is now a 404; deploy goes through devkit worker-deploy v0.21.2 (ship.mjs gone, devkit-migrations); every binding has a check; console ratchet baseline present; 404 is the shared page. Still open: no 404 count (N1, N4, N7; waits on the privacy wording). Not verified here: the restore drill's newest run (R1), since GitHub reads were refused to this sandbox.
- ❌ Germomics: ops-audit: 1 errors
  - H5: https://germomics.com/health no check on /health probes MEDIA (r2), declared in https://github.com/DrDustinEdwards/germomics/blob/main/wrangler.jsonc; probe each, or name it in .ops-audit.json's unprobed with the reason
- 🟡 julieedwards.info: Health passes at head, drill passed, excludes set; D4/D6 off; d1-dump v0.8.0
- 🟡 TXASM: Health passes on workers.dev at head and drill passed; txasm.org still serves WordPress; D4/D6 off
- 🟡 BSW: site-runtime v0.50.1; 404 is React Router's default page; no console ratchet; no request log wrapper; no --repo in areas.json; D4/D6 off
- ❌ Foxhound: ops-audit: 1 errors
  - H5: https://foxhoundapp.com/health no check on /health probes AUDIT_BUCKET (r2), EMAIL (send_email), declared in https://github.com/DrDustinEdwards/foxhound/blob/main/wrangler.jsonc; probe each, or name it in .ops-audit.json's unprobed with the reason
- ❌ Foxing: ops-audit: 1 errors
  - H5: https://foxing.app/health no check on /health probes COMPANION_CACHE_QUEUE (queue), EMAIL (send_email), declared in https://github.com/DrDustinEdwards/foxing/blob/main/apps/web/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason
- ❌ Capsid MCP: ops-audit: 1 errors
  - H5: https://mcp.dustinedwards.info/health no check on /health probes AUDIT_BUCKET (r2), AI (ai), declared in https://github.com/DrDustinEdwards/capsid/blob/master/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason
- ❌ Foxhound admin MCP: ops-audit: 1 errors
  - H5: https://admin-mcp.foxhoundapp.com/health no check on /health probes AUDIT_BUCKET (r2), OAUTH_KV (kv), MCP_RATE_LIMIT (durable_object), FOXHOUND (service), declared in https://github.com/DrDustinEdwards/foxhound/blob/main/mcp/wrangler.jsonc; probe each, or name it in .ops-audit.json's unprobed with the reason
- ❌ Carrel MCP: ops-audit: 1 errors
  - H5: https://carrel-mcp.dustinedwards.info/health no check on /health probes AUDIT_BUCKET (r2), declared in https://github.com/DrDustinEdwards/carrel/blob/main/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason
- ❌ Foxing admin MCP: ops-audit: 1 errors
  - H5: https://admin-mcp.foxing.app/health no check on /health probes AUDIT_BUCKET (r2), declared in https://github.com/DrDustinEdwards/foxing/blob/main/mcp/wrangler.jsonc.example; probe each, or name it in .ops-audit.json's unprobed with the reason

### 9. Accessibility and components

Builder: Complete accessibility and Capsomer components. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: checks pass; no verifier yet
- ❌ Germomics: devkit-a11y: 28 errors
  - L1: https://germomics.com/ axe color-contrast (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 2 elements, first `.ml-auto`
  - L2: https://germomics.com/ no skip link to main as the first Tab stop (first stop `body > header.sticky.top-0 > div.mx-auto.flex > a.flex.items-center` "germomics")
  - L3: https://germomics.com/ scrolls sideways at 320 px: scrollWidth 350, widest `div.space-y-12 > section:nth-of-type(2) > div.grid.gap-3:nth-of-type(2) > article.flex.items-center:nth-of-type(1)` reaches 350 px
  - L3: https://germomics.com/ text clipped with WCAG 1.4.12 text spacing: `div.grid.gap-3:nth-of-type(2) > article.flex.gap-4:nth-of-type(2) > div.min-w-0.flex-1 > p.mt-1.line-clamp-2` (vertical), `div.grid.gap-3:nth-of-type(2) > article.flex.gap-4:nth-of-type(5) > div.min-w-0.flex-1 > p.mt-1.line-clamp-2` (vertical), `div.grid.gap-3:nth-of-type(2) > article.flex.gap-4:nth-of-type(10) > div.min-w-0.flex-1 > p.mt-1.line-clamp-2` (vertical)
  - L2: https://germomics.com/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `main#main > div.cap-empty > div.cap-empty-content:nth-of-type(2) > a.cap-btn` "Go to the home page")
- ❌ julieedwards.info: devkit-a11y: 6 errors
  - L1: https://julieedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://julieedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://julieedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop `html > body > div.json-formatter-container` "")
  - L2: https://julieedwards.info/site.webmanifest no visible focus on 20 of 20 stops: `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container` and 17 more
  - S2: https://julieedwards.info/site.webmanifest no lang on <html>
- ❌ TXASM: devkit-a11y: 2 errors
  - L2: https://txasm.dustin-edwards.workers.dev/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `main#main > div.cap-empty > div.cap-empty-content:nth-of-type(2) > a.cap-btn` "Go to the home page")
  - L1: https://txasm.dustin-edwards.workers.dev/newsletters/fall-1991-newsletter axe aria-prohibited-attr (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `.pdf-viewer-page`
- ❌ BSW: devkit-a11y: 12 errors
  - L1: https://bsw.dustin-edwards.workers.dev/ axe scrollable-region-focusable (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 2 elements, first `#psms-panel-simple > .psms-scroll-box`
  - L2: https://bsw.dustin-edwards.workers.dev/ no skip link to main as the first Tab stop (first stop `div.flex.min-h-screen > header.sticky.top-0 > div.mx-auto.flex:nth-of-type(1) > a.shrink-0` "BioScience Writers home")
  - L3: https://bsw.dustin-edwards.workers.dev/ scrolls sideways at 320 px: scrollWidth 342, widest `div#psms-track` reaches 342 px
  - L2: https://bsw.dustin-edwards.workers.dev/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `section:nth-of-type(2) > div.page-prose.mx-auto > p.mt-8:nth-of-type(2) > a.btn.btn-blue` "Go to the home page")
  - L2: https://bsw.dustin-edwards.workers.dev/about-us no skip link to main as the first Tab stop (first stop `div.flex.min-h-screen > header.sticky.top-0 > div.mx-auto.flex:nth-of-type(1) > a.shrink-0` "BioScience Writers home")
- ❌ Foxhound: devkit-a11y: 5 errors
  - L1: https://foxhoundapp.com/ axe color-contrast (serious, WCAG) at 390-light, 390-dark: 1 element, first `li[data-queue-row="0"] > .min-w-0.flex-1 > .block.text-text-subtle[data-queue-meta=""]`
  - L3: https://foxhoundapp.com/ text clipped with WCAG 1.4.12 text spacing: `a.cap-panel.h-full > div.cap-panel-body > div.flex.h-full > h3.m-0.line-clamp-2` (vertical), `a.cap-panel.h-full > div.cap-panel-body > div.flex.h-full > h3.m-0.line-clamp-2` (vertical)
  - L2: https://foxhoundapp.com/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `body.min-h-full > div.fh-cap.fh-error-page > header.fh-error-bar.flex > a.no-underline` "foxhound")
  - L3: https://foxhoundapp.com/blog/archive text clipped with WCAG 1.4.12 text spacing: `div.flex.flex-col:nth-of-type(3) > a.group.-mx-2:nth-of-type(1) > div.min-w-0.flex-1 > p.mt-0\.5.line-clamp-1:nth-of-type(2)` (vertical), `div.flex.flex-col:nth-of-type(3) > a.group.-mx-2:nth-of-type(2) > div.min-w-0.flex-1 > p.mt-0\.5.line-clamp-1:nth-of-type(2)` (vertical), `div.flex.flex-col:nth-of-type(3) > a.group.-mx-2:nth-of-type(3) > div.min-w-0.flex-1 > p.mt-0\.5.line-clamp-1:nth-of-type(2)` (vertical) and 33 more
  - L2: https://foxhoundapp.com/decline-codes/insufficient_funds Escape did not close what `section.mb-10:nth-of-type(4) > ul.m-0.flex > li.overflow-hidden.rounded-lg:nth-of-type(1) > button.flex.w-full` opened
- ❌ Foxing: devkit-a11y: 3 errors
  - L2: https://foxing.app/ no visible focus on 1 of 40 stops: `input#q`
  - L2: https://foxing.app/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `main#main > div.cap-empty > div.cap-empty-content:nth-of-type(2) > a.cap-btn` "Go to the home page")
  - L3: https://foxing.app/books scrolls sideways at 320 px: scrollWidth 406, widest `div.mb-10.fx-books-card:nth-of-type(1) > div:nth-of-type(1) > div.row-2.wrap > a.cap-chip:nth-of-type(16)` reaches 406 px
- ❌ Carrel: devkit-a11y: 6 errors
  - L1: https://carrel.dustinedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://carrel.dustinedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://carrel.dustinedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop `html > body > div.json-formatter-container` "")
  - L2: https://carrel.dustinedwards.info/site.webmanifest no visible focus on 20 of 20 stops: `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container` and 17 more
  - S2: https://carrel.dustinedwards.info/site.webmanifest no lang on <html>
- ❌ Enarratio: devkit-a11y: 2 errors
  - L1: https://enarratio.dustinedwards.info/ axe scrollable-region-focusable (serious, WCAG) at 390-light, 390-dark: 1 element, first `.enarratio-table-chart > table`
  - L1: https://enarratio.dustinedwards.info/capsomer axe scrollable-region-focusable (serious, WCAG) at 390-light, 390-dark: 1 element, first `.enarratio-table-chart > table`
- ❌ Capsomer: devkit-a11y: 3 errors
  - L2: https://capsomer.dustinedwards.info/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `body > main > p > a` "Go to Capsomer's front page")
  - L1: https://capsomer.dustinedwards.info/components/admin-shell/ axe label-content-name-mismatch (serious, WCAG) at 1440-light, 1440-dark: 1 element, first `section[aria-labelledby="ex-tip"] > .comp-ex-box > iframe[data-height="360"] a[aria-describedby="cap-popover-11"]`
  - L2: https://capsomer.dustinedwards.info/make/ no visible focus on 1 of 40 stops: `input#mk-radius`
- ❌ Prelum specimen: devkit-a11y: 6 errors
  - L1: https://prelum.dustinedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://prelum.dustinedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://prelum.dustinedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop `html > body > div.json-formatter-container` "")
  - L2: https://prelum.dustinedwards.info/site.webmanifest no visible focus on 20 of 20 stops: `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container` and 17 more
  - S2: https://prelum.dustinedwards.info/site.webmanifest no lang on <html>
- ❌ Capsid explorer: devkit-a11y: 2 errors
  - L2: https://capsid.dustinedwards.info/systems/ no skip link to main as the first Tab stop (first stop `div#family-hex > svg.cap-system-map-comb > a.cap-system-map-cell:nth-of-type(1)` "Capsid")
  - L2: https://capsid.dustinedwards.info/systems/ no visible focus on 21 of 40 stops: `div#family-hex > svg.cap-system-map-comb > a.cap-system-map-cell:nth-of-type(1)`, `div#family-hex > svg.cap-system-map-comb > a.cap-system-map-cell:nth-of-type(2)`, `div#family-hex > svg.cap-system-map-comb > a.cap-system-map-cell:nth-of-type(3)` and 18 more
- Not checked, the MCP servers' consent pages: each renders only for a registered OAuth client mid-sign-in, so a stranger's scan cannot reach it

### 10. Charts

Builder: Complete shared charts. Verifier: Verify scoreboard cells awaiting sign-off.

- ❌ Package: no verifier has checked the package
- ❌ Foxing: chart-audit: 1 errors
- 🟡 Carrel: no charts on either public page, so the check proves nothing; this cell should be a skip in areas.json
- ❌ Capsomer: chart-audit: 1 errors
  - F: https://capsomer.dustinedwards.info/ an SVG chart drawn outside Enarratio: "One design system for every site and app" (168 rects)
- 🟡 Capsid explorer: checks pass; no verifier yet
- 🟡 Carrel Desk: chart-audit fails D5 on /demos/progress at 320 px, 0.025, div.cap-chart moves 42 px; reproduced on 3 of 3 runs on 5 Nov

### 11. AI and MCP

Builder: Complete shared AI and MCP code. Verifier: Verify area 11 AI and MCP.

- 🟡 Package: live check covers 7 of 89 items; conformance off Actions except Carrel; no static AI rules or pin comparison in devkit; toolsForGrant and fireOnce unused; no tool icons, tool-list pin, cancel on close; log has no export, retention, alert or Portal view; no shared agent keys; suggester metadata and Llama list
- 🟡 dustinedwards.info: Signed by Verify scoreboard cells awaiting sign-off, 2026-11-05. site-runtime-ai-audit: 0 errors, 0 warnings. Fixed and checked in code: a cut answer is never cached (finish_reason read), Ask's gateway tags use site-runtime's {app, feature}, suggester on site-api 0.21.0. Still open: the question is not wrapped in untrusted() (C10; the builder's note says wrapping breaks AI Search retrieval, which is a known limit, not a pass); site-api 0.22.0 is out and dei pins 0.21.0; that Ask's calls reach the gateway is configured on the AI Search instance and was not checked live.
- 🟡 Germomics: local style text instead of WRITING_RULES; suggester gaps from the package
- 🟡 julieedwards.info: suggester on site-api v0.17.0: no timeout, JSON mode or prose check
- 🟡 TXASM: suggester inherits the package gaps (feature metadata, Llama list)
- ❌ Foxhound: site-runtime-ai-audit: 1 errors
  - P3: https://foxhoundapp.com/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
- 🟡 Foxing: Plus chat and recommendation reasons unchecked by prose; companion logs user_id; suggester on site-api v0.17.0
- 🟡 Carrel: routine re-fire guard not atomic; shared fireOnce unused
- 🟡 Capsid explorer: AI Search reranker has no timeout or gateway and returns raw upstream errors
- ❌ Capsid MCP: site-runtime-ai-audit: 12 errors
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_start_session: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_find_docs: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_read_doc: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_lint_namespace: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_read_repo: inputSchema does not set additionalProperties: false
- ❌ Foxhound admin MCP: site-runtime-ai-audit: 1 errors
  - P3: https://admin-mcp.foxhoundapp.com/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
- ❌ Dustin Edwards admin MCP: site-runtime-ai-audit: 1 errors
  - P3: https://admin-mcp.dustinedwards.info/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
- ❌ Carrel MCP: site-runtime-ai-audit: 1 errors
  - P3: https://carrel-mcp.dustinedwards.info/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
- ❌ Foxing admin MCP: site-runtime-ai-audit: 1 errors
  - P3: https://admin-mcp.foxing.app/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)

### 12. Checks and tooling

Builder: Complete shared checks and tooling. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: no live check yet
- ❌ Germomics: no live check yet
- ❌ julieedwards.info: no live check yet
- ❌ TXASM: no live check yet
- ❌ BSW: no live check yet
- ❌ Foxhound: no live check yet
- ❌ Foxing: no live check yet
- ❌ Carrel: no live check yet
- ❌ Enarratio: no live check yet
- ❌ Capsomer: no live check yet
- ❌ Prelum specimen: no live check yet
- ❌ Capsid explorer: no live check yet
- ❌ Capsid MCP: no live check yet
- ❌ Foxhound admin MCP: no live check yet
- ❌ Dustin Edwards admin MCP: no live check yet
- ❌ Carrel MCP: no live check yet
- ❌ Foxing admin MCP: no live check yet
- ❌ Capsid Portal: no live check yet
- ❌ Carrel Desk: no live check yet
