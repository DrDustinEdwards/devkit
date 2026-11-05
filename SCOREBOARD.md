# Shared-code completeness

Newest run 2026-11-04 15:26 UTC. Filled only from the live checks and the verifiers' verdicts.

**Not finished.** Finished means every cell complete and clean for 7 daily runs.

✅ complete · 🟡 partial · ❌ missing · `·` does not apply

| Area | Package | dustinedwards.info | Germomics | julieedwards.info | TXASM | BSW | Foxhound | Foxing | Carrel | Enarratio | Capsomer | Prelum specimen | Capsid explorer | Capsid MCP | Foxhound admin MCP | Dustin Edwards admin MCP | Carrel MCP | Foxing admin MCP | Capsid Portal | Carrel Desk | Lines added | Lines removed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|
| 1. Search, sharing and AI answers | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 | · | · | · | · | · | · | · | +18963 | −960 |
| 2. Security headers and CSP | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ❌ | +52000 | −8463 |
| 3. Sign-in and access | 🟡 | ❌ | 🟡 | · | ❌ | · | 🟡 | 🟡 | · | · | · | · | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 | +67457 | −2968 |
| 4. Writing and rendering | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | · | · | · | · | · | · | · | +6996 | −3129 |
| 5. Carrel editing contract | 🟡 | ❌ | 🟡 | 🟡 | ❌ | · | 🟡 | 🟡 | · | · | · | · | · | · | · | · | · | · | · | · | +38995 | −8146 |
| 6. Images and media | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | · | · | · | · | · | ❌ | · | +30007 | −3470 |
| 7. Speed and caching | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | · | · | · | · | · | +6536 | −3234 |
| 8. Running and recovery | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | · | · | · | · | · | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | +27951 | −2785 |
| 9. Accessibility and components | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | ❌ | ❌ | ❌ | · | · | +7063 | −801 |
| 10. Charts | ❌ | ❌ | ✅ | · | · | · | ✅ | ❌ | 🟡 | ✅ | ❌ | ✅ | ❌ | · | · | · | · | · | ✅ | 🟡 | +33215 | −9539 |
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
  - C16: https://capsomer.dustinedwards.info/site-runtime-security-9cea7e04-2c11-40cf-8bff-3cc068e9d316 (404) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://capsomer.dustinedwards.info/ (405) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
- 🟡 Prelum specimen: Fails the newest check (v0.66.0, which the board runs) on C16: frame-src does not yet let in the post players the entry declares (embeds) and on I3 (COEP enforced, not Report-Only). prelum #182 (v0.66.0) merged at 22:49Z but the live sha at 23:10Z was still ffbe359, so the deploy had not landed. It passes v0.65.0 with 0 errors. Re-check after the deploy.
- 🟡 Foxing admin MCP: 0 errors, 0 warnings live (on Cloudflare since foxing #165), but mcp/package.json pins site-runtime v0.62.0, four minors behind v0.66.0. devkit's pin check (S7) wants every MCP server within one minor; it is a warning until devkit 0.21.0. Bump to the current release and redeploy.
- ❌ Carrel Desk: site-runtime-security: 1 errors
  - D1: https://desk.dustinedwards.info/.well-known/security.txt is behind Cloudflare Access; it must be public (RFC 9116)

### 3. Sign-in and access

Builder: Complete shared sign-in and access. Verifier: Verify shared sign-in and access.

- 🟡 Package: passkey delete and email change need no fresh sign-in; a new link resets the three tries; Turnstile off when a key is missing; no new-device or recovery notice, no security history, no spike alert
- ❌ dustinedwards.info: site-runtime-sign-in: 1 errors
  - G1: https://dustinedwards.info/lab a declared admin page answered 404, not a redirect to Access or a 401/403
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
- ❌ dustinedwards.info: site-api-live: 2 errors
  - K4: https://dustinedwards.info/api/carrel/v1/meta meta has cache-control private, no-store, expected no-store
  - K4: https://dustinedwards.info/api/carrel/v1/site-api-live-544fe4bd3950 an unknown route has cache-control private, no-store, expected no-store
- 🟡 Germomics: author filter 501 though show.author is the byline; deleted post 404 not 410; preview is a hand-written shell; no series; no setTags; revisions author 'germomics', pages no history; admin.content.$key still writes pages outside Carrel
- 🟡 julieedwards.info: pins v0.17.0 so webmentions can read the stale edge copy, sent on publish only; live section with a draft reads as draft; revisions capped at 50; no delete or unpublish (needs ruling); preview without page chrome
- ❌ TXASM: site-api-live: 3 errors
  - K4: https://txasm.org/api/carrel/v1/meta meta answered 404 without the key, expected 401
  - K4: https://txasm.org/api/carrel/v1/site-api-live-d6d02ce4315c an unknown route answered 404 without the key, expected 401
  - K4: https://txasm.org/api/carrel/v1/site-api-live-d6d02ce4315c answers differently from a known route without the key, so it tells which routes exist
- 🟡 Foxhound: a draft save on a live post goes live at once (B3); deleted post 404 not 410; preview hand-written shell; own author key not authors, no cover image, no series; revisions partial and named by change id; delete drops post links silently
- 🟡 Foxing: author filter 501 though author_id exists and JSON-LD credits Foxing; pins v0.17.0 so webmentions can read the stale edge copy; deleted post 404 not 410; preview hand-written shell; no series; redirects not removed on delete (301 to 404); revision author raw id

### 6. Images and media

Builder: Complete shared images and media. Verifier: Verify area 6 images and media.

- 🟡 Package: uploads built (HEIC, GPS strip, placeholder); a replace keeps the immutable size URL; pictureProps carries no placeholder; Prelum picture drops source media (GIF never moves) and counts priority per render; unsized diagram img; credit/license never reach the renderer; no 1.91:1 cover crop, no 16:9/4:3/1:1 set, no og:video; respond sets no CORP; AVIF not stripped; images check skips A6 and C9 and never runs on the Portal
- ❌ dustinedwards.info: site-runtime-images: 1 errors
  - E3: https://dustinedwards.info/ https://op3.dev/e/media.germomics.com/Podcast_010_Antitoxin_Togo_Please.mp3 has no transcript link on the page
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
- ❌ dustinedwards.info: site-runtime-speed: 3 errors
  - C5: http://dustinedwards.info/about/ http page, other slash: 2 redirects (301 http://dustinedwards.info/about/ > 301 https://dustinedwards.info/about/ > 200 https://dustinedwards.info/about)
  - C5: http://www.dustinedwards.info/ http www: 2 redirects (301 http://www.dustinedwards.info/ > 301 https://www.dustinedwards.info/ > 200 https://dustinedwards.info/)
  - C5: http://www.dustinedwards.info/about/ http www page, other slash: 2 redirects (301 http://www.dustinedwards.info/about/ > 301 https://www.dustinedwards.info/about/ > 200 https://dustinedwards.info/about)
- ❌ Germomics: site-runtime-speed: 5 errors
  - C2: https://germomics.com/fonts/space-grotesk-latin.woff2 an unhashed file sent cache-control public, max-age=86400: browsers keep it over 300 s without asking, so a deploy reaches returning readers late; hash its name or revalidate
  - C2: https://germomics.com/fonts/fraunces-latin.woff2 an unhashed file sent cache-control public, max-age=86400: browsers keep it over 300 s without asking, so a deploy reaches returning readers late; hash its name or revalidate
  - C5: http://germomics.com/episodes/ http page, other slash: 2 redirects (301 http://germomics.com/episodes/ > 301 https://germomics.com/episodes/ > 200 https://germomics.com/episodes)
  - C5: http://www.germomics.com/ http www: 2 redirects (301 http://www.germomics.com/ > 301 https://www.germomics.com/ > 200 https://germomics.com/)
  - C5: http://www.germomics.com/episodes/ http www page, other slash: 2 redirects (301 http://www.germomics.com/episodes/ > 301 https://www.germomics.com/episodes/ > 200 https://germomics.com/episodes)
- ❌ julieedwards.info: site-runtime-speed: 1 errors
  - C5: http://www.julieedwards.info/ http www: 2 redirects (301 http://www.julieedwards.info/ > 301 https://www.julieedwards.info/ > 200 https://julieedwards.info/)
- ❌ TXASM: site-runtime-speed: 1 errors
  - D1: https://txasm.dustin-edwards.workers.dev/ no 103 Early Hints before the page: workers.dev never sends Early Hints; the site needs its own domain
- ❌ BSW: site-runtime-speed: 1 errors
  - D1: https://bsw.dustin-edwards.workers.dev/ no 103 Early Hints before the page: workers.dev never sends Early Hints; the site needs its own domain
- ❌ Foxhound: site-runtime-speed: 3 errors
  - C5: http://foxhoundapp.com/pricing/ http page, other slash: 2 redirects (301 http://foxhoundapp.com/pricing/ > 301 https://foxhoundapp.com/pricing/ > 200 https://foxhoundapp.com/pricing)
  - C5: http://www.foxhoundapp.com/ http www: 2 redirects (301 http://www.foxhoundapp.com/ > 301 https://www.foxhoundapp.com/ > 200 https://foxhoundapp.com/)
  - C5: http://www.foxhoundapp.com/pricing/ http www page, other slash: 2 redirects (301 http://www.foxhoundapp.com/pricing/ > 301 https://www.foxhoundapp.com/pricing/ > 200 https://foxhoundapp.com/pricing)
- ❌ Foxing: site-runtime-speed: 1 errors
  - C5: http://foxing.app/books/ http page, other slash: 2 redirects (301 http://foxing.app/books/ > 301 https://foxing.app/books/ > 200 https://foxing.app/books)
- ❌ Carrel: site-runtime-speed-static: 1 errors
  - C5: http://carrel.dustinedwards.info/accessibility/ http page, other slash: 2 redirects (301 http://carrel.dustinedwards.info/accessibility/ > 301 https://carrel.dustinedwards.info/accessibility/ > 200 https://carrel.dustinedwards.info/accessibility)
- ❌ Enarratio: site-runtime-speed-static: 1 errors
  - C5: http://enarratio.dustinedwards.info/example/ http page, other slash: 2 redirects (301 http://enarratio.dustinedwards.info/example/ > 301 https://enarratio.dustinedwards.info/example/ > 200 https://enarratio.dustinedwards.info/example)
- ❌ Capsomer: site-runtime-speed-static: 1 errors
  - C5: http://capsomer.dustinedwards.info/make http page, other slash: 2 redirects (301 http://capsomer.dustinedwards.info/make > 307 https://capsomer.dustinedwards.info/make > 200 https://capsomer.dustinedwards.info/make/)
- ❌ Prelum specimen: site-runtime-speed-static: 1 errors
  - C5: http://prelum.dustinedwards.info/accessibility/ http page, other slash: 2 redirects (301 http://prelum.dustinedwards.info/accessibility/ > 301 https://prelum.dustinedwards.info/accessibility/ > 200 https://prelum.dustinedwards.info/accessibility)
- ❌ Capsid explorer: site-runtime-speed: 1 errors
  - C5: http://capsid.dustinedwards.info/systems http page, other slash: 2 redirects (301 http://capsid.dustinedwards.info/systems > 307 https://capsid.dustinedwards.info/systems > 200 https://capsid.dustinedwards.info/systems/)

### 8. Running and recovery

Builder: Complete shared running and recovery. Verifier: Verify area 8 round 2.

- 🟡 Package: Built but off: gradual rollout and previews in worker-deploy (no caller turns them on; D4 never compares error rates); goneResponse/renameRedirect unused; no shared redirect table (N5); no drill restores files; R2/R5 still owed; ops-audit exits 0 when its GitHub reads fail and never tests bindings (H5) or the shared 404 page (N6); probe filter misses .zip, .tar.gz, /web.config, /server-status
- 🟡 dustinedwards.info: No 404 count (privacy page fix is one PR, a fixable blocker); public /api/health still routed with no noindex; cron check 'backup never ran' pending tonight's 05:00 run; own deploy (ship.mjs) and own check-migrations.mjs; d1-dump v0.8.0; drill passed 12:33
- 🟡 Germomics: Deploys from GitHub at head f86a616 and drill passed; 404 is React Router's default page, not the shared error page; first audio/images files pass pending (03:17 cron, may take several nights); counted tables only
- 🟡 julieedwards.info: Health passes at head, drill passed, excludes set; D4/D6 off; d1-dump v0.8.0
- 🟡 TXASM: Health passes on workers.dev at head and drill passed; txasm.org still serves WordPress; D4/D6 off
- 🟡 BSW: site-runtime v0.50.1; 404 is React Router's default page; no console ratchet; no request log wrapper; no --repo in areas.json; D4/D6 off
- 🟡 Foxhound: Health and drill pass; TOOL_CALL_LOG and EMAIL unprobed; runCronJob wrapper and own cron-health job remain; 140 raw console calls; first media files pass pending (03:00 cron)
- ❌ Foxing: ops-audit: 1 errors
  - H4: https://foxing.app/health serves d124624ec0ca5ab1cdf564cc8b76e1139b789e2e, not the branch head 72fe235be6bcf4ebcf93cfb4ac58bb3f9da1850c (https://github.com/DrDustinEdwards/foxing/commit/72fe235be6bcf4ebcf93cfb4ac58bb3f9da1850c), committed 446 minutes ago
- 🟡 Capsid MCP: Shared health; cron warn 'skills-refresh failing, site-repair failing' at 16:34 (fix deployed, unproven until runs); 528-line backup wrapper; own runTask ledger; own deploy (ci.yml); watcher's analytics read could-not-run on all 16 sites, so 5xx alerts cannot fire; U1 inside Cloudflare only; TLS at 14 days not 21; rehearsal passed 12:24 but not in areas.json
- 🟡 Foxhound admin MCP: Old shape {ok, sha} from local door.ts:60 (ops-audit H2 error); no binding probed; no sampling rate
- 🟡 Dustin Edwards admin MCP: Shared shape but no sha and checks [] (ops-audit H4 error); deployed by ship:mcp, not worker-deploy
- 🟡 Carrel MCP: Health passes, all bindings probed; drill passed; head 9189bb3 deploy in flight at 16:38 (673402c live)
- 🟡 Foxing admin MCP: Old shape {ok, sha} from local login-handler.ts:33 (ops-audit H2 error); site-runtime v0.50.1; worker-deploy v0.20.8; no binding probed

### 9. Accessibility and components

Builder: Complete accessibility and Capsomer components. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: devkit-a11y: 1 errors
  - L3: https://dustinedwards.info/ text clipped with WCAG 1.4.12 text spacing: `ol.home-rows > li.home-row.h-entry:nth-of-type(1) > span.home-row-body:nth-of-type(2) > span.home-row-summary.home-row-clamp:nth-of-type(2)` (vertical), `ol.home-rows > li.home-row.h-entry:nth-of-type(2) > span.home-row-body:nth-of-type(2) > span.home-row-summary.home-row-clamp:nth-of-type(2)` (vertical), `ol.home-rows > li.home-row.h-entry:nth-of-type(3) > span.home-row-body:nth-of-type(2) > span.home-row-summary.home-row-clamp:nth-of-type(2)` (vertical)
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
  - L1: https://foxhoundapp.com/ axe color-contrast (serious, WCAG) at 390-dark: 1 element, first `li[data-queue-row="0"] > .min-w-0.flex-1 > .block.text-text-subtle[data-queue-meta=""]`
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
  - L2: https://capsid.dustinedwards.info/systems/ no visible focus on 22 of 40 stops: `div#family-hex > svg.cap-system-map-comb > a.cap-system-map-cell:nth-of-type(1)`, `div#family-hex > svg.cap-system-map-comb > a.cap-system-map-cell:nth-of-type(2)`, `div#family-hex > svg.cap-system-map-comb > a.cap-system-map-cell:nth-of-type(3)` and 19 more
- ❌ Dustin Edwards admin MCP: devkit-a11y: 11 errors
  - L1: https://admin-mcp.dustinedwards.info/ axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://admin-mcp.dustinedwards.info/ axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://admin-mcp.dustinedwards.info/ no skip link to main as the first Tab stop (first stop none: nothing takes focus)
  - S2: https://admin-mcp.dustinedwards.info/ no lang on <html>
  - S2: https://admin-mcp.dustinedwards.info/ no <title>
- ❌ Carrel MCP: devkit-a11y: 11 errors
  - L1: https://carrel-mcp.dustinedwards.info/ axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://carrel-mcp.dustinedwards.info/ axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://carrel-mcp.dustinedwards.info/ no skip link to main as the first Tab stop (first stop none: nothing takes focus)
  - S2: https://carrel-mcp.dustinedwards.info/ no lang on <html>
  - S2: https://carrel-mcp.dustinedwards.info/ no <title>
- ❌ Foxing admin MCP: devkit-a11y: 11 errors
  - L1: https://admin-mcp.foxing.app/ axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://admin-mcp.foxing.app/ axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://admin-mcp.foxing.app/ no skip link to main as the first Tab stop (first stop none: nothing takes focus)
  - S2: https://admin-mcp.foxing.app/ no lang on <html>
  - S2: https://admin-mcp.foxing.app/ no <title>

### 10. Charts

Builder: Complete shared charts. Verifier: Verify scoreboard cells awaiting sign-off.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: chart-audit: 20 errors
  - F: https://dustinedwards.info/systems/capsid an SVG chart drawn outside Enarratio: "How Capsid connects" (56 dots)
  - F: https://dustinedwards.info/systems/capsid-backups an SVG chart drawn outside Enarratio: "How Capsid backups connects" (6 dots)
  - F: https://dustinedwards.info/systems/capsid-bench an SVG chart drawn outside Enarratio: "How capsid-bench connects" (10 dots)
  - F: https://dustinedwards.info/systems/capsomer an SVG chart drawn outside Enarratio: "How Capsomer connects" (26 dots)
  - F: https://dustinedwards.info/systems/carrel an SVG chart drawn outside Enarratio: "How Carrel connects" (62 dots)
- ❌ Foxing: chart-audit: 2 errors
- 🟡 Carrel: no charts on either public page, so the check proves nothing; this cell should be a skip in areas.json
- ❌ Capsomer: chart-audit: 4 errors
  - F: https://capsomer.dustinedwards.info/ an SVG chart drawn outside Enarratio: "One design system for every site and app" (168 rects)
  - F: https://capsomer.dustinedwards.info/components/system-map/states?theme=light an SVG chart drawn outside Enarratio: "The network, Carrel lit" (36 dots)
  - F: https://capsomer.dustinedwards.info/components/system-map/states?theme=light an SVG chart drawn outside Enarratio: "Capsid" (30 dots)
  - F: https://capsomer.dustinedwards.info/components/system-map/states?theme=light an SVG chart drawn outside Enarratio: "Capsid: a job's life" (16 dots)
- ❌ Capsid explorer: chart-audit: 24 errors
  - F: https://capsid.dustinedwards.info/flows/carrel-publish/ an SVG chart drawn outside Enarratio: "Publishing a post, over the parts of Carrel" (30 dots)
  - F: https://capsid.dustinedwards.info/flows/doc-search/ an SVG chart drawn outside Enarratio: "A search, over the parts of Capsid" (24 dots)
  - F: https://capsid.dustinedwards.info/flows/job-life/ an SVG chart drawn outside Enarratio: "A job's life, over the parts of Capsid" (24 dots)
  - F: https://capsid.dustinedwards.info/flows/nightly-backup/ an SVG chart drawn outside Enarratio: "The nightly backup, over the parts of Capsid" (24 dots)
  - F: https://capsid.dustinedwards.info/flows/session-start/ an SVG chart drawn outside Enarratio: "A session starts, over the parts of Capsid" (24 dots)
- 🟡 Carrel Desk: chart-audit fails D5 on /demos/progress at 320 px, 0.025, div.cap-chart moves 42 px; reproduced on 3 of 3 runs on 5 Nov

### 11. AI and MCP

Builder: Complete shared AI and MCP code. Verifier: Verify area 11 AI and MCP.

- 🟡 Package: live check covers 7 of 89 items; conformance off Actions except Carrel; no static AI rules or pin comparison in devkit; toolsForGrant and fireOnce unused; no tool icons, tool-list pin, cancel on close; log has no export, retention, alert or Portal view; no shared agent keys; suggester metadata and Llama list
- 🟡 dustinedwards.info: Ask caches answers cut at max_tokens; Ask bypasses the gateway and untrusted(); suggester pins site-api v0.14.0
- 🟡 Germomics: local style text instead of WRITING_RULES; suggester gaps from the package
- 🟡 julieedwards.info: suggester on site-api v0.17.0: no timeout, JSON mode or prose check
- 🟡 TXASM: suggester inherits the package gaps (feature metadata, Llama list)
- ❌ Foxhound: site-runtime-ai-audit: 2 errors
  - P3: https://foxhoundapp.com/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
  - audit: https://foxhoundapp.com the audit stopped before it finished: Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client |     at ServerResponse.writeHead (node:_http_server:422:11) |     at Server.<anonymous> (file:///tmp/devkit-live-suIL14/site-runtime_v0.73.0/node_modules/@dustinedwards/site-runtime/bin/ai-audit.mjs:459:11)
- 🟡 Foxing: Plus chat and recommendation reasons unchecked by prose; companion logs user_id; suggester on site-api v0.17.0
- 🟡 Carrel: routine re-fire guard not atomic; shared fireOnce unused
- 🟡 Capsid explorer: AI Search reranker has no timeout or gateway and returns raw upstream errors
- ❌ Capsid MCP: site-runtime-ai-audit: 13 errors
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_start_session: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_find_docs: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_read_doc: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_lint_namespace: inputSchema does not set additionalProperties: false
  - T4: https://mcp.dustinedwards.info/ops/mcp capsid_read_repo: inputSchema does not set additionalProperties: false
- ❌ Foxhound admin MCP: site-runtime-ai-audit: 2 errors
  - P3: https://admin-mcp.foxhoundapp.com/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
  - audit: https://admin-mcp.foxhoundapp.com the audit stopped before it finished: Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client |     at ServerResponse.writeHead (node:_http_server:422:11) |     at Server.<anonymous> (file:///tmp/devkit-live-suIL14/site-runtime_v0.73.0/node_modules/@dustinedwards/site-runtime/bin/ai-audit.mjs:459:11)
- ❌ Dustin Edwards admin MCP: site-runtime-ai-audit: 2 errors
  - P3: https://admin-mcp.dustinedwards.info/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
  - audit: https://admin-mcp.dustinedwards.info the audit stopped before it finished: Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client |     at ServerResponse.writeHead (node:_http_server:422:11) |     at Server.<anonymous> (file:///tmp/devkit-live-suIL14/site-runtime_v0.73.0/node_modules/@dustinedwards/site-runtime/bin/ai-audit.mjs:459:11)
- ❌ Carrel MCP: site-runtime-ai-audit: 2 errors
  - P3: https://carrel-mcp.dustinedwards.info/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
  - audit: https://carrel-mcp.dustinedwards.info the audit stopped before it finished: Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client |     at ServerResponse.writeHead (node:_http_server:422:11) |     at Server.<anonymous> (file:///tmp/devkit-live-suIL14/site-runtime_v0.73.0/node_modules/@dustinedwards/site-runtime/bin/ai-audit.mjs:459:11)
- ❌ Foxing admin MCP: site-runtime-ai-audit: 2 errors
  - P3: https://admin-mcp.foxing.app/mcp conformance server-stateless passed 22/24 (failing: sep-2575-server-sends-subscription-ack, sep-2575-server-tags-subscription-id)
  - audit: https://admin-mcp.foxing.app the audit stopped before it finished: Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client |     at ServerResponse.writeHead (node:_http_server:422:11) |     at Server.<anonymous> (file:///tmp/devkit-live-suIL14/site-runtime_v0.73.0/node_modules/@dustinedwards/site-runtime/bin/ai-audit.mjs:459:11)

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
