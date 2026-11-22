# Shared-code completeness

Newest run 2026-11-22 02:14 UTC. Filled only from the live checks and the verifiers' verdicts.

**Not finished.** Finished means every cell complete and clean for 7 daily runs.

✅ complete · 🟡 partial · ❌ missing · ❔ could not measure · `·` does not apply

| Area | Package | dustinedwards.info | Germomics | julieedwards.info | TXASM | BSW | Foxhound | Foxing | Carrel | Enarratio | Capsomer | Prelum specimen | Capsid explorer | Capsid MCP | Foxhound admin MCP | Dustin Edwards admin MCP | Carrel MCP | Foxing admin MCP | Capsid Portal | Carrel Desk | Lines added | Lines removed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|
| 1. Search, sharing and AI answers | ✅ | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | · | · | +18963 | −960 |
| 2. Security headers and CSP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | +52000 | −8463 |
| 3. Sign-in and access | ✅ | ✅ | ✅ | · | 🟡 | · | 🟡 | ✅ | · | · | · | · | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | +67457 | −2968 |
| 4. Writing and rendering | ✅ | ✅ | 🟡 | 🟡 | ❌ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | 🟡 | ✅ | · | · | · | · | · | · | · | +6996 | −3129 |
| 5. Carrel editing contract | 🟡 | ❌ | ❌ | 🟡 | 🟡 | · | ❌ | ❌ | · | · | · | · | · | · | · | · | · | · | · | · | +38995 | −8146 |
| 6. Images and media | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · | · | · | · | +30007 | −3470 |
| 7. Speed and caching | 🟡 | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | · | · | · | · | · | · | · | +6536 | −3234 |
| 8. Running and recovery | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | · | · | +28958 | −2924 |
| 9. Accessibility and components | 🟡 | ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 | 🟡 | ✅ | 🟡 | · | · | · | · | · | · | · | +7063 | −801 |
| 10. Charts | ❌ | 🟡 | 🟡 | · | · | · | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | 🟡 | 🟡 | +33215 | −9539 |
| 11. AI and MCP | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | · | · | +52017 | −7048 |
| 12. Checks and tooling | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | +3950 | −382 |

## Why a cell is not complete

### 1. Search, sharing and AI answers

Builder: Share SEO and other key site code. Verifier: Fresh verifier: re-sign of areas 1, 4 and 9.

- 🟡 dustinedwards.info: prelum-audit v0.63.7 (run by hand, 21 Nov 2026): 0 errors; text/markdown answers to Accept and .md on 6 random sitemap URLs; llms.txt and llms-full.txt 200; canonical and Open Graph present (563 pages). Gap: 27 of 204 sitemap URLs have no lastmod (contact, colophon, features and every /systems page).
- 🟡 TXASM: Fixed since the last verdict (txasm #441): every public page has a Markdown copy at /path.md and for Accept: text/markdown, llms-full.txt is 200, and private paths (/admin.md, /login.md) are 404. prelum-audit v0.63.7 on 22 Nov 2026 still reports 4 errors: the PDF routes /documents/&lt;slug&gt;/inline and /download answer 500 about two requests in three (Sentry TXASM-4, R2 error 10001 from bucket.get, first seen 22 Nov 00:14 UTC; none in the 30 days before; Cloudflare status showed no R2 incident). Also 8 of 464 sitemap URLs have no lastmod; txasm #449 dates them from a daily 03:00 UTC job, so check again after it runs.
- 🟡 BSW: prelum-audit v0.63.7 (run by hand, 21 Nov 2026): 0 errors; text/markdown answers to Accept and .md on 6 random sitemap URLs; llms.txt and llms-full.txt 200; canonical and Open Graph present (20 pages). Gap: none of the 20 sitemap URLs has a lastmod. The site is a mockup on a workers.dev address.
- 🟡 Enarratio: prelum-audit v0.63.7 (run by hand, 21 Nov 2026): 0 errors; text/markdown answers to Accept and .md on 6 random sitemap URLs; llms.txt and llms-full.txt 200; canonical and Open Graph present (140 pages) and all 8 sitemap URLs carry lastmod. Gap: 140 of 140 pages have no &lt;meta name="text-scale" content="scale"&gt; (a prelum-audit warning).
- 🟡 Capsomer: prelum-audit v0.63.7 (run by hand, 21 Nov 2026): 0 errors; text/markdown answers to Accept and .md on 6 random sitemap URLs; llms.txt and llms-full.txt 200; canonical and Open Graph present (210 pages) and all 209 sitemap URLs carry lastmod. Gap: the title "Icons · Capsomer" is on two pages (/components/icons/ and /icons/), a prelum-audit warning.
- 🟡 Prelum specimen: prelum-audit v0.63.7 (run by hand, 21 Nov 2026): 0 errors; text/markdown answers to Accept and .md on 6 random sitemap URLs; llms.txt and llms-full.txt 200; canonical and Open Graph present (7 pages). Gap, minor: /accessibility is in the sitemap with no lastmod (1 of 2 URLs).
- 🟡 Capsid explorer: prelum-audit v0.63.7 (run by hand, 21 Nov 2026): 0 errors; text/markdown answers to Accept and .md on 6 random sitemap URLs; llms.txt and llms-full.txt 200; canonical and Open Graph present (117 pages) and all 116 sitemap URLs carry lastmod. Gap: 116 of 117 pages have no &lt;meta name="text-scale" content="scale"&gt; (a prelum-audit warning).

### 2. Security headers and CSP

Builder: Complete shared security headers and CSP. Verifier: Verify security headers.

- ❌ Carrel Desk: site-runtime-security: 1 errors
  - D1: https://desk.dustinedwards.info/.well-known/security.txt is behind Cloudflare Access; it must be public (RFC 9116)

### 3. Sign-in and access

Builder: Complete shared sign-in and access. Verifier: Re-sign partial devkit areas.

- 🟡 TXASM: Code gaps are closed: change email, delete account, second-passkey nudge, security notices, history and spike check exist. Still open, both pre-cutover and not changeable now: the passkey rpId is the workers.dev host until txasm.org moves, and mail (sign-in link and security notices) is dormant until cutover. Live check: 0 errors, 2 warnings (A1 rpId, G1 admin uses sign-in not Access).
- 🟡 Foxhound: Merchant MCP now advertises CIMD live and passes H4; consent page uses the shared ConsentScreen with client name, publisher host and an Allow changes box; health has authSpikeCheck. Still open and unverified: whether the merchant MCP call log is shared or local (the repo tree could not be listed from here), and Foxhound's own sign-in wiring for the package features could not be read.

### 4. Writing and rendering

Builder: Complete shared writing and rendering. Verifier: Fresh verifier: re-sign of areas 1, 4 and 9.

- 🟡 Germomics: prelum-content v0.63.7 (run by hand, 21 Nov 2026): 34 pages, 0 errors, 4 warnings. Two Carrel conformance-probe posts (/carrel-conformance-7e19650b-renamed and /carrel-conformance-30b8b1fe-renamed) are published and listed on /writing, each with an image (/conformance-probe.png) that has no width and height. Test content left on a live site; unpublish them.
- 🟡 julieedwards.info: prelum-content v0.63.7 (run by hand, 21 Nov 2026): 2 pages, 0 errors, 0 warnings. The repository is not readable from this session; an earlier note says the site has its own section grammar rather than Prelum, and nothing here refutes it.
- ❌ TXASM: prelum-content: 2 errors
  - writing-render-version: https://txasm.org/ stored HTML from render version 26; the pipeline is at 27
  - writing-render-version: https://txasm.org/award-nominations stored HTML from render version 26; the pipeline is at 27
- 🟡 Enarratio: prelum-content v0.63.7 (run by hand, 21 Nov 2026): 140 pages, 0 errors, 0 warnings. The repository is not readable from this session, so use of Prelum and the absence of a second renderer are not proven.
- ❌ Capsomer: prelum-content: 179 errors
  - writing-render-version: https://capsomer.dustinedwards.info/components/not-found-report/ stored HTML from render version 26; the pipeline is at 27
  - writing-render-version: https://capsomer.dustinedwards.info/components/admin-shell/ stored HTML from render version 26; the pipeline is at 27
  - writing-render-version: https://capsomer.dustinedwards.info/components/ai-engine-settings/ stored HTML from render version 26; the pipeline is at 27
  - writing-render-version: https://capsomer.dustinedwards.info/components/ai-job-buttons/ stored HTML from render version 26; the pipeline is at 27
  - writing-render-version: https://capsomer.dustinedwards.info/components/ai-sample/ stored HTML from render version 26; the pipeline is at 27
- 🟡 Prelum specimen: prelum-content v0.63.7 (run by hand, 21 Nov 2026): 2 pages, 0 errors, 1 warning: the specimen renders writing with no data-render-version on its wrapper, so an upgrade cannot be seen.

### 5. Carrel editing contract

Builder: Complete Carrel editing contract. Verifier: Re-sign partial devkit areas.

- 🟡 Package: Closed since 2026-10-31: schedule and unschedule events (path null for an unpublished post), unknown fields now 400 unknown-field, site-api-live honors --from, one DNS-resolving outbound guard, shared purge hook (schedulePurgeHook), feature image, excerpt, authors and series boxes in Carrel, merge panel for a diverged copy, backlinks warning on trash and delete, sort is a select so aria-sort does not apply. Open: the post-life probe (301, 410, trash, preview-link life, hooks, field round-trips) is off by default and Carrel's live run does not turn it on (health.server.ts runConformance has no probePosts), so no live site is checked for those. Open: Carrel has no way to list or revoke a preview link (site-api client has it, no Carrel screen uses it). Open: no width preview in the editor (PreviewPane is one iframe). Open: no hand a11y pass, and whether Carrel's README is now right, could not be proven by a script.
- ❌ dustinedwards.info: carrel-conformance: 4 errors
  - M1: https://dustinedwards.info/api/carrel/v1 probe post: each declared hook recorded a run for the publish failed: failed: indexnow, webmention
  - M1: https://dustinedwards.info/api/carrel/v1 probe post: a rename answers 301 from the old path failed: The operation was aborted due to timeout
  - M1: https://dustinedwards.info/api/carrel/v1 probe post: trash and restore failed: trash: 404 not-found
  - M1: https://dustinedwards.info/api/carrel/v1 probe post: a delete answers 410 on the old path failed: read: 404 not-found
- ❌ Germomics: carrel-conformance: 1 errors
  - M1: https://germomics.com/api/carrel/v1 probe post: each declared hook recorded a run for the publish failed: failed: webmention
- 🟡 julieedwards.info: Read main cf8ff79. Closed: site-api v0.46.1 pin; the webmention hook is wired (handler.server.ts) and sends the page itself on publish only; a save lands in a draft and never changes the live text; schedules and scheduled update; the unpublish, trash, rename and delete refusals are documented for a fixed set of sections. Still open: (1) a live section with a saved draft reads as status draft, not published with hasDraft (sections.server.ts:54-55); (2) revisions are capped at 50 and carry the literal author julieedwards, not the actor (sections.server.ts:234, 243); (3) no unpublish or delete by design (sections.server.ts:220-225), still wants a ruling recorded; (4) the preview is main plus HomeSections with no site header or footer (adapter.server.tsx:84-86).
- 🟡 TXASM: Closed: site-api-live honors --from and passes against the workers.dev copy, IndexNow uses publicOrigin so Carrel publishes are sent, preview renders through the site's own route, revisions are not pruned and old ones open, media shrink exists. Open: no delete or unpublish (every page is a live route; needs Dustin's ruling, none found in Capsid). Open: revision author is hard-coded 'Dustin Edwards' instead of the actor. Pre-cutover limit: txasm.org is still WordPress, so the site is served from workers.dev and passkey rpId follows the host; that cannot change now.
- ❌ Foxhound: carrel-conformance: 2 errors
  - M1: https://foxhoundapp.com/api/carrel/v1 probe post: each declared hook recorded a run for the publish failed: failed: indexnow
  - M1: https://foxhoundapp.com/api/carrel/v1 probe post: a rename answers 301 from the old path failed: old path /blog/carrel-conformance-84dcf2b8: expected 301, got 200
- ❌ Foxing: carrel-conformance: 1 errors
  - M1: https://foxing.app/api/carrel/v1 probe post: created as a draft failed: create: 422 refused

### 6. Images and media

Builder: Complete shared images and media. Verifier: Re-sign partial devkit areas.

- 🟡 dustinedwards.info: Open: the cohort photos on /teaching/phage-discovery carry no placeholder (the library picture on /about does). Closed and seen live: size URLs immutable, sitemap image entries, own post cards, Carrel share-image field, diagram sizes wired, transcript link on the home audio. Live site-runtime-images run on 2026-11-21: 0 errors, 0 warnings. No diagram image was live to see.
- 🟡 Germomics: Open: no placeholder on live images (no style background on /a-boy-named-flu); no ImageObject in the page JSON-LD; a credit is stored but not shown. Closed: card is image/jpeg with CORP cross-origin, no fetchpriority issue, image sitemap has 10 entries, episodes use their own artwork when set (this episode has none, so the wordmark card shows), local reencode wrapper gone. Live site-runtime-images run on 2026-11-21: 0 errors, 0 warnings.
- 🟡 julieedwards.info: Photo is now in the library with srcset, sizes, width and height, placeholder, immutable size URLs and a sitemap image entry. Open: the fallback img path in the repo could not be read (the repo is not reachable from this session), so its sizing is unverified. Live site-runtime-images run on 2026-11-21: 0 errors, 0 warnings.
- 🟡 TXASM: Open and cannot change now: og:image only resolves on workers.dev because txasm.org is still WordPress (Apache). Closed: brand-image upload goes through prepareUpload (byte check, GPS strip), card has CORP cross-origin, placeholder is passed from the library row. Unverified: credit and ImageObject (no content pictures on the live pages). Live site-runtime-images run on 2026-11-21: 0 errors, 0 warnings.
- 🟡 BSW: Now serves the logo through /media with srcset and sizes, has Carrel's API (401 without a key), 6 sitemap image entries, and the images check passes. Open: the repo is not reachable from this session, so uploads, the library and placeholder could not be read; the share card is still only the logo card. Live site-runtime-images run on 2026-11-21: 0 errors, 0 warnings.
- 🟡 Foxhound: Closed live: footer SVG has loading and decoding, card has CORP cross-origin and a type. Open: the repo is not reachable from this session, so whether cover-picture.tsx now uses pictureProps could not be checked; no blog post with a cover was live; no image sitemap entries. Live site-runtime-images run on 2026-11-21: 0 errors, 0 warnings.
- 🟡 Foxing: Open: Journal body images get no placeholder (code comment says the site does not load picture.css) and drop GIF reduced-motion stills although Prelum 0.63.7 supports them. Closed: og:image:type present, LCP cover eager and high, covers carry focus and placeholder, body images get srcset and AVIF, 1434 sitemap image entries, share-image field exists in Carrel. Live site-runtime-images run on 2026-11-21: 0 errors, 0 warnings.
- Not checked, Capsid Portal and Carrel Desk pages behind sign-in: a stranger's crawl sees only the redirect to Access, so the images on the signed-in pages (Desk's media library, the Portal's views) are not checked live

### 7. Speed and caching

Builder: Complete shared speed and caching. Verifier: Verify speed and caching.

- 🟡 Package: Three of the four check bugs are fixed in site-runtime 0.67.1 and proven. D1: the check sends a Chrome agent; on the devkit runner (run 41252992440, 1 Nov 00:10 UTC, check v0.67.1) D1 passes on all ten custom domains and fails only on txasm and bsw (workers.dev, accepted); curl with that agent gets 103 then 200 on all ten. B4: a 404 is judged by its cache-control; passes on Carrel, Capsomer, Enarratio, Prelum and the explorer (no B4 in the run). hashed(): needs a hash-like token; apple-touch-icon.png is no longer hashed (4 unit tests pass). Still wrong: the old path shortcut in hashed() treats every file under /assets/ or /islands/ as hashed, so C1 fails 5 times on the Capsid explorer, whose /assets files (capsomer.css, enarratio.css, explorer.css, theme.js, explorer.js) are deliberately unhashed (explorer/worker.mjs says so) and send public, max-age=3600, which is right for them. Until the check judges those by their names, or the explorer hashes them, the board stays red on that cell. A1/A3 have no data without the CrUX key (Dustin's; the run shows PageSpeed 429). Not caught in round 2 because a cloud session's Node cannot decode zstd, so the home page body was empty and no files were sampled.
- ❔ dustinedwards.info: site-runtime-speed could not measure: A3: https://dustinedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://dustinedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ Germomics: site-runtime-speed could not measure: A3: https://germomics.com/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://germomics.com/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ julieedwards.info: site-runtime-speed could not measure: A3: https://julieedwards.info/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://julieedwards.info/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ TXASM: site-runtime-speed could not measure: A3: https://txasm.dustin-edwards.workers.dev/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://txasm.dustin-edwards.workers.dev/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
- ❔ BSW: site-runtime-speed could not measure: A3: https://bsw.dustin-edwards.workers.dev/ could not measure: mobile: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured; A3: https://bsw.dustin-edwards.workers.dev/ could not measure: desktop: PageSpeed Insights answered 429 after 4 tries (no PSI_API_KEY, so Google's shared keyless quota), so A1, A3, D2, D3, D4 and D6 were not measured
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
- 🟡 dustinedwards.info: failed on 2026-11-07, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Germomics: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 julieedwards.info: failed on 2026-11-07, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 TXASM: Health passes on workers.dev at head and drill passed; txasm.org still serves WordPress; D4/D6 off
- 🟡 BSW: failed on 2026-11-07, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Foxhound: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Foxing: failed on 2026-11-04, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Capsid MCP: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Foxhound admin MCP: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier
- 🟡 Dustin Edwards admin MCP: failed on 2026-11-07, after Verify area 8 round 2 signed; needs a fresh verifier
- ❌ Carrel MCP: ops-audit: 1 errors
  - B1: https://carrel-mcp.dustinedwards.info/health the newest complete backup is 46.6 hours old, not under 26
- 🟡 Foxing admin MCP: failed on 2026-11-05, after Verify area 8 round 2 signed; needs a fresh verifier

### 9. Accessibility and components

Builder: Complete accessibility and Capsomer components. Verifier: Fresh verifier: re-sign of areas 1, 4 and 9.

- 🟡 Package: devkit-a11y finds real issues (it flagged the warnings below), and Capsomer's CI is green on main. Not complete: the shared 404 page has a main but no header, nav or footer (S2 on germomics, txasm, bsw, foxing and capsomer); Enarratio's chart points are covered by another element when focused (L2 on germomics, enarratio and capsid); and two Capsomer showcase pages warn: contact-card (h3 after h1 inside its demo frame, duplicate #main landmark) and not-found-report (duplicate #main).
- 🟡 Germomics: devkit-a11y v0.55.10 (run by hand, 21 Nov 2026): 10 pages, 0 errors, 2 warnings: the 404 page has no header, nav or footer; on /data/cholera-soho-1854 the focused map point is covered by another element on 2 Tab stops.
- 🟡 BSW: devkit-a11y v0.55.10 (run by hand, 21 Nov 2026): 10 pages, 0 errors, 1 warning: the 404 page has no header, nav or footer. A mockup.
- 🟡 Foxing: devkit-a11y v0.55.10 (run by hand, 21 Nov 2026): 10 pages, 0 errors, 1 warning: the 404 page has no header, nav or footer.
- 🟡 Enarratio: devkit-a11y v0.55.10 (run by hand, 21 Nov 2026): 9 pages, 0 errors, 1 warning: on /astro a focused chart point is covered by another element.
- 🟡 Capsomer: devkit-a11y v0.55.10 (run by hand, 21 Nov 2026): 10 pages, 0 errors, 4 warnings: the 404 page has no header, nav or footer; contact-card has an h3 after h1 and a duplicate #main landmark; not-found-report has a duplicate #main landmark.
- 🟡 Capsid explorer: devkit-a11y v0.55.10 (run by hand, 21 Nov 2026): 10 pages, 0 errors, 1 warning: on /numbers/ a focused chart point is covered by another element on 3 Tab stops.
- Not checked, the MCP servers' consent pages: each renders only for a registered OAuth client mid-sign-in, so a stranger's scan cannot reach it

### 10. Charts

Builder: Complete shared charts. Verifier: Verify scoreboard cells awaiting sign-off.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: failed on 2026-11-10, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier
- 🟡 Germomics: failed on 2026-11-10, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier
- 🟡 Foxhound: failed on 2026-11-10, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: failed on 2026-11-12, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier
- 🟡 Enarratio: failed on 2026-11-12, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier
- 🟡 Capsomer: checks pass; no verifier yet
- 🟡 Prelum specimen: failed on 2026-11-12, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier
- 🟡 Capsid explorer: checks pass; no verifier yet
- 🟡 Capsid Portal: failed on 2026-11-10, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier
- 🟡 Carrel Desk: failed on 2026-11-12, after Verify scoreboard cells awaiting sign-off signed; needs a fresh verifier

### 11. AI and MCP

Builder: Complete shared AI and MCP code. Verifier: Re-sign partial devkit areas.

- 🟡 Package: Closed since 2026-10-31: toolsForGrant, icons, cancel on close and toolListHash exist and are used by Carrel, Foxing, Capsid and dustinedwards MCP; fireOnce is used by Carrel; the tool-call log has export, 90 day retention, a health alert and an owner page per server (linked from the Portal Agents view); shared agent keys exist in ./agent-keys; the suggester in site-api 0.46.1 has feature metadata, a timeout, a JSON schema, a prose check and leaves Llama out of the Claude-only prose checks; a reusable conformance workflow exists. Still open: devkit has no static AI rules and no tool-list pin comparison (areas.json passes no --tools-hash, so T12 only warns); the live check lists about 25 item ids but the old 89 item checklist could not be found, so coverage is not proven; the live tools/list, conformance and burst checks run only with a test grant, which this sandbox lacks.
- 🟡 dustinedwards.info: Closed: site-api is pinned at 0.46.1 (current); a cut answer is never cached; gateway tags use {app, feature}; ai-audit live: 0 errors, 0 warnings. Still open: Ask's question is not wrapped in untrusted() (C10; wrapping breaks AI Search retrieval, so this is a known limit, not a pass); that Ask's calls reach the gateway is set on the AI Search instance and cannot be checked from here.
- 🟡 Capsid explorer: Closed: the AI Search call is raced against an 8 s timeout and an upstream error goes to the log only, so the caller gets a fixed sentence. Still open: the gateway is attached only when the AI_GATEWAY_ID dashboard var is set, and whether it is set live cannot be checked from here.
- 🟡 Capsid MCP: Closed: the metadata lists capsid.read and capsid.write; scopes come from site-runtime mcpScopes; the 403 insufficient_scope step-up uses toolScopeChallenge; audienceRefusal and mcpOriginRefusal are the shared ones; a conformance gate runs in CI. Still open: Live tools/list checks (T1 to T4, T7, T9, T12), the conformance server scenarios and the rate-limit burst (S1) were not measured: this sandbox has no test grant for the server. The live run with ai-audit reports 0 errors, 0 warnings, 1 not measured. The OAuth KV name (capsid-oauth, not capsid-mcp-oauth) is in the uncommitted wrangler.jsonc and could not be read.
- 🟡 Dustin Edwards admin MCP: Closed: tools go through registerTools and invokeTool; agent keys are site-runtime ./agent-keys; scopes dei.read and dei.write; /health has a sha and a passing tool-call-log check; conformance runs in CI. Still open: Live tools/list checks (T1 to T4, T7, T9, T12), the conformance server scenarios and the rate-limit burst (S1) were not measured: this sandbox has no test grant for the server. The live run with ai-audit reports 0 errors, 0 warnings, 1 not measured. The server has no test of its own that runs toolListProblems.
- 🟡 Carrel MCP: Closed: scopes are carrel.read and carrel.write; the write box starts ticked only when the client asked for write; the tool list uses toolsForGrant; agent keys use site-runtime agentPrincipal; conformance runs in CI. Still open: Live tools/list checks (T1 to T4, T7, T9, T12), the conformance server scenarios and the rate-limit burst (S1) were not measured: this sandbox has no test grant for the server. The live run with ai-audit reports 0 errors, 0 warnings, 1 not measured. Also /health shows warnings for backup, cron and alerts (area 8, not area 11).
- 🟡 Foxing admin MCP: Closed: site-runtime 0.173.1; errors are read as problem details; paging uses opaque cursors; destructive tools take a preview and confirm token (suspension uses the admin API's own step); registerTools lists only grantable tools; conformance runs in CI. Still open: Live tools/list checks (T1 to T4, T7, T9, T12), the conformance server scenarios and the rate-limit burst (S1) were not measured: this sandbox has no test grant for the server. The live run with ai-audit reports 0 errors, 0 warnings, 1 not measured. The server has no test of its own that runs toolListProblems.

### 12. Checks and tooling

Builder: Complete shared checks and tooling. Verifier: Re-sign partial devkit areas.

- 🟡 Package: Newest checks-self on main (head 2dafea8, 0.55.9) is green; pr.yml, worker-deploy.yml, dependencies.yml, workflow-audit.yml, scorecard.yml, release.yml with build provenance, shared hooks all exist. Open: harden-runner is audit by default (worker-deploy egress-policy default audit); no block mode here (checklist 4.8 open); provenance (4.9) not verified by an attestation check on a release; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified). Main moved to c435e07 after that run; its run was not read.
- 🟡 dustinedwards.info: Calls pr.yml, dependencies.yml, worker-deploy.yml at devkit v0.55.7 (one patch behind 0.55.9, same minor); verify skill and shared CLAUDE.md block present; only repo setting egress-policy block. Open: newest checks run on main (scheduled, 14:33Z, run 44914534469) FAILED at the Shared code step (cause not read); newest CI run is green. secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Germomics: Best of the set: devkit v0.55.9 (current), pr.yml (no-bloat run in ci.yml instead), worker-deploy, dependencies, verify skill, shared CLAUDE.md block; newest checks and CI runs green. Open: main is now a923b38 and its run was not seen (newest run read is 7e58f57); harden-runner is audit by default (worker-deploy egress-policy default audit); no block mode here; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 julieedwards.info: Not verified: the julieedwards repo is not reachable from this session (GitHub access limited to 14 repos), so workflows, pins, skill, CLAUDE.md and the newest main run were not read. Needs a verifier with access.
- 🟡 TXASM: devkit v0.55.7, pr.yml with no-bloat and worker-size, worker-deploy, OSV, verify skill, shared CLAUDE.md; newest checks and CI runs green. Open: harden-runner is audit by default (worker-deploy egress-policy default audit); no block mode here; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 BSW: Not verified: the bsw repo is not reachable from this session (GitHub access limited to 14 repos), so workflows, pins, skill, CLAUDE.md and the newest main run were not read. Needs a verifier with access.
- 🟡 Foxhound: Not verified: the foxhound repo is not reachable from this session (GitHub access limited to 14 repos), so workflows, pins, skill, CLAUDE.md and the newest main run were not read. Needs a verifier with access.
- 🟡 Foxing: devkit v0.55.7, pr.yml with two Workers in worker-size, worker-deploy, OSV, verify skill, shared CLAUDE.md. Open: newest main run (CI cf rebuild, run 44936738703 on cc1f551) is RED: check job passed, deploy/Deploy step failed at 18:44Z (cause not read); earlier runs 44871865959 and 44869053096 also failed; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Carrel: devkit v0.55.7, pr.yml with no-bloat off there but devkit-no-bloat runs in ci.yml, worker-deploy, OSV, verify skill, shared CLAUDE.md. Open: main is now 5f1a8b5 and no completed run for it was seen (newest completed CI is f259f05, green); harden-runner is audit by default (worker-deploy egress-policy default audit); no block mode here; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Enarratio: Not verified: the enarratio repo is not reachable from this session (GitHub access limited to 14 repos), so workflows, pins, skill, CLAUDE.md and the newest main run were not read. Needs a verifier with access.
- 🟡 Capsomer: pr.yml, no-bloat, dependencies, release with changesets, verify skill, shared CLAUDE.md present; newest CI on main (aa5b42f) green. Open: devkit pinned at v0.53.3 in workflows and package.json, two minors behind 0.55.9 (README: a pin behind a minor out two days fails devkit-shared); harden-runner is audit by default (worker-deploy egress-policy default audit); no block mode here; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Prelum specimen: pr.yml (node: false), no-bloat in ci.yml, worker-deploy, OSV, release, shared CLAUDE.md; newest ci on main green. Open: devkit pinned v0.55.1 (eight patches behind, same minor); no .claude/skills/verify in the repo; harden-runner is audit by default (worker-deploy egress-policy default audit); no block mode here; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Capsid explorer: Default branch is master. pr.yml with reviewer, worker-deploy, OSV, conformance, scorecard, verify skill, shared CLAUDE.md; newest CI on master (f762abe) green. Open: devkit v0.55.1 (same minor as current, eight patches behind); harden-runner is audit by default (worker-deploy egress-policy default audit); no block mode here; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Capsid MCP: Same repo as Capsid: the Worker's conformance suite (.conformance.json, ci.yml) and worker-deploy are in place; CI green. Open: v0.55.1 pin; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Foxhound admin MCP: Not verified: the foxhound repo is not reachable from this session (GitHub access limited to 14 repos), so workflows, pins, skill, CLAUDE.md and the newest main run were not read. Needs a verifier with access.
- 🟡 Dustin Edwards admin MCP: Same repo as dustinedwards.info: pr.yml workers list includes the mcp Worker, conformance suite configured (mcp/.conformance.json). Same open gaps: newest scheduled checks run on main failed at Shared code (cause not read); secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Carrel MCP: Same repo as Carrel: .conformance.json and conformance in ci.yml present. Same open gaps as carrel (main head run not seen; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified)).
- 🟡 Foxing admin MCP: Admin MCP in the foxing repo: ci-mcp.yml (conformance, worker-deploy) and mcp/.conformance.json present; pr.yml lists the mcp Worker. Newest main run for the repo is red (CI cf rebuild deploy step, run 44936738703); CI (admin MCP) run 44896531557 was green. secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Capsid Portal: Same repo as Capsid. An app, but no accessibility scan of the Portal was found in CI or package scripts (axe-core appears only in explorer/package.json, the explorer). Open: a11y gate for the Portal; v0.55.1 pin; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified).
- 🟡 Carrel Desk: Same repo as Carrel; an app, so a11y matters: ci.yml runs npm run check:a11y (axe on every Desk screen). Same open gaps as carrel (main head run not seen; secret scanning and push protection settings are not readable from this session (earlier handoff says Dustin enabled them on 19 repos; unverified)).
