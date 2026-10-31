# Shared-code completeness

Newest run 2026-10-31 10:10 UTC. Filled only from the live checks and the verifiers' verdicts.

**Not finished.** Finished means every cell complete and clean for 7 daily runs.

✅ complete · 🟡 partial · ❌ missing · `·` does not apply

| Area | Package | dustinedwards.info | Germomics | julieedwards.info | TXASM | BSW | Foxhound | Foxing | Carrel | Enarratio | Capsomer | Prelum specimen | Capsid explorer | Capsid MCP | Foxhound admin MCP | Dustin Edwards admin MCP | Carrel MCP | Foxing admin MCP | Lines added | Lines removed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|
| 1. Search, sharing and AI answers | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | · | · | · | · | · | +6153 | −562 |
| 2. Security headers and CSP | ❌ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | +47674 | −5489 |
| 3. Sign-in and access | 🟡 | 🟡 | 🟡 | · | ❌ | · | ❌ | ❌ | · | · | · | · | 🟡 | ✅ | ✅ | ✅ | ✅ | ❌ | +3718 | −1025 |
| 4. Writing and rendering | ❌ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | +5013 | −2583 |
| 5. Carrel editing contract | ❌ | ❌ | 🟡 | 🟡 | ❌ | · | 🟡 | ❌ | · | · | · | · | · | · | · | · | · | · | +37767 | −7178 |
| 6. Images and media | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | · | · | · | · | · | +16870 | −1140 |
| 7. Speed and caching | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | · | · | · | +2528 | −1566 |
| 8. Running and recovery | ❌ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | +12828 | −749 |
| 9. Accessibility and components | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | +0 | −0 |
| 10. Charts | ❌ | ❌ | 🟡 | · | · | · | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ | · | · | · | · | · | +15608 | −4921 |
| 11. AI and MCP | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | +5125 | −5022 |
| 12. Checks and tooling | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | +3950 | −382 |

Lines count public repositories only until the LIVE_GITHUB_TOKEN secret is set.

## Why a cell is not complete

### 1. Search, sharing and AI answers

Builder: Share SEO and other key site code. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: checks pass; no verifier yet
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 julieedwards.info: checks pass; no verifier yet
- ❌ TXASM: prelum-audit: 40 errors
  - link-broken: https://txasm.org/ links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/meetings links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/awardees links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/award-nominations links to https://txasm.org/register, which answers 404
  - link-broken: https://txasm.org/branch-officers links to https://txasm.org/register, which answers 404
- ❌ BSW: prelum-audit: 19 errors
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/ the sitemap lists a noindex page
  - sitemap-redirect: https://bsw.dustin-edwards.workers.dev/grant-proposal-support/ the sitemap lists a URL that redirects
  - sitemap-redirect: https://bsw.dustin-edwards.workers.dev/manuscript-editing/ the sitemap lists a URL that redirects
  - sitemap-redirect: https://bsw.dustin-edwards.workers.dev/visual-design/ the sitemap lists a URL that redirects
  - sitemap-redirect: https://bsw.dustin-edwards.workers.dev/language-support/ the sitemap lists a URL that redirects
- ❌ Foxhound: prelum-audit: 1 errors
  - icon-missing: https://foxhoundapp.com/favicon.ico answers 404 text/html; charset=utf-8
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- ❌ Enarratio: prelum-audit: 1 errors
  - icon-missing: https://enarratio.dustinedwards.info/favicon.ico answers 404 text/html; charset=utf-8
- ❌ Capsomer: prelum-audit: 7 errors
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/chips/chips.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/empty/empty.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/empty/ links to https://capsomer.dustinedwards.info/components/skeleton/skeleton.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/empty/ links to https://capsomer.dustinedwards.info/components/error-page/error-page.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/error-page/ links to https://capsomer.dustinedwards.info/components/empty/empty.md, which answers 404
- ❌ Prelum specimen: prelum-audit: 2 errors
  - canonical-missing: https://prelum.dustinedwards.info/ no canonical link
  - link-broken: https://prelum.dustinedwards.info/ links to https://prelum.dustinedwards.info/writing/other, which answers 404
- 🟡 Capsid explorer: checks pass; no verifier yet

### 2. Security headers and CSP

Builder: Complete shared security headers and CSP. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: site-runtime-security: 1 errors
  - T2: https://dustinedwards.info/about/ (301) Strict-Transport-Security is present: ABSENT
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 julieedwards.info: checks pass; no verifier yet
- 🟡 TXASM: checks pass; no verifier yet
- 🟡 BSW: checks pass; no verifier yet
- 🟡 Foxhound: checks pass; no verifier yet
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- 🟡 Enarratio: checks pass; no verifier yet
- 🟡 Capsomer: checks pass; no verifier yet
- 🟡 Prelum specimen: checks pass; no verifier yet
- ❌ Capsid explorer: site-runtime-security: 4 errors
  - C14: https://capsid.dustinedwards.info/ (200) violations are reported to both sinks (report-uri and report-to): no report-to: the browsers that read only the other one report nowhere
  - C14: https://capsid.dustinedwards.info/systems/ (200) violations are reported to both sinks (report-uri and report-to): no report-to: the browsers that read only the other one report nowhere
  - C14: https://capsid.dustinedwards.info/site-runtime-security-6efd7d09-8f97-446b-bec1-76a64c040a05 (404) violations are reported to both sinks (report-uri and report-to): no report-to: the browsers that read only the other one report nowhere
  - C14: https://capsid.dustinedwards.info/ (405) violations are reported to both sinks (report-uri and report-to): no report-to: the browsers that read only the other one report nowhere
- 🟡 Capsid MCP: checks pass; no verifier yet
- ❌ Foxhound admin MCP: site-runtime-security: 25 errors
  - I2: https://admin-mcp.foxhoundapp.com/ (404) Cross-Origin-Resource-Policy is present: ABSENT
  - H5: https://admin-mcp.foxhoundapp.com/ (404) Permissions-Policy is present: ABSENT
  - T2: https://admin-mcp.foxhoundapp.com/ (404) Strict-Transport-Security is present: ABSENT
  - H8: https://admin-mcp.foxhoundapp.com/ (404) X-DNS-Prefetch-Control is present: ABSENT
  - H3: https://admin-mcp.foxhoundapp.com/ (404) X-Frame-Options is present: ABSENT
- ❌ Dustin Edwards admin MCP: site-runtime-security: 1 errors
  - D1: https://admin-mcp.dustinedwards.info/.well-known/security.txt (404) security.txt is served: answers 404
- ❌ Carrel MCP: site-runtime-security: 1 errors
  - D1: https://carrel-mcp.dustinedwards.info/.well-known/security.txt (404) security.txt is served: answers 404
- ❌ Foxing admin MCP: site-runtime-security: 74 errors
  - I1: https://admin-mcp.foxing.app/ (404) Cross-Origin-Opener-Policy is present: ABSENT
  - I2: https://admin-mcp.foxing.app/ (404) Cross-Origin-Resource-Policy is present: ABSENT
  - H5: https://admin-mcp.foxing.app/ (404) Permissions-Policy is present: ABSENT
  - H4: https://admin-mcp.foxing.app/ (404) Referrer-Policy is present: ABSENT
  - T2: https://admin-mcp.foxing.app/ (404) Strict-Transport-Security covers subdomains: got "max-age=63072000"

### 3. Sign-in and access

Builder: Complete shared sign-in and access. Verifier: Verify shared sign-in and access.

- 🟡 Package: passkey delete and email change need no fresh sign-in; a new link resets the three tries; Turnstile off when a key is missing; no new-device or recovery notice, no security history, no spike alert
- 🟡 dustinedwards.info: /lab has no Access app in front (unsigned GET answers 503) and is outside the idle sign-out; admin refusals not logged
- 🟡 Germomics: admin items pass; the admin 403 is not logged and nothing alerts on spikes (F2, F3)
- ❌ TXASM: site-runtime-sign-in: 1 errors
  - A1: https://txasm.dustin-edwards.workers.dev/api/auth/passkey/generate-authenticate-options the passkey's rpId is txasm.dustin-edwards.workers.dev, not txasm.org: a passkey made here will not work on the site
- ❌ Foxhound: site-runtime-sign-in: 1 errors
  - H4: https://foxhoundapp.com/.well-known/oauth-authorization-server client_id_metadata_document_supported is not true: no Client ID Metadata Documents
- ❌ Foxing: site-runtime-sign-in: 1 errors
  - H1: https://admin-mcp.foxing.app/mcp the MCP server answered 403 to a request with no token, not 401
- 🟡 Capsid explorer: Portal session is a 12-hour cookie with no 1-hour idle sign-out and no server-side revoke; Portal sign-ins not logged
- ❌ Foxing admin MCP: site-runtime-sign-in: 1 errors
  - D10: https://admin-mcp.foxing.app/admin an admin response (403) has no noindex

### 4. Writing and rendering

Builder: Complete shared writing and rendering. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: prelum-content: 8 errors
  - writing-fragment: https://dustinedwards.info/research/publications a link to #papers-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/phages a link to #phages-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/protocols a link to #protocols-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/lab a link to #lab-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/lab/primers a link to #primers-results lands on nothing
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 julieedwards.info: checks pass; no verifier yet
- 🟡 TXASM: checks pass; no verifier yet
- 🟡 BSW: checks pass; no verifier yet
- 🟡 Foxhound: checks pass; no verifier yet
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- 🟡 Enarratio: checks pass; no verifier yet
- 🟡 Capsomer: checks pass; no verifier yet
- 🟡 Prelum specimen: checks pass; no verifier yet
- 🟡 Capsid explorer: checks pass; no verifier yet

### 5. Carrel editing contract

Builder: Complete Carrel editing contract. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: carrel-conformance: 9 errors; site-api-live: 4 errors
  - M1: https://dustinedwards.info/api/carrel/v1 meta: answers with this contract's schema hash failed
  - M1: https://dustinedwards.info/api/carrel/v1 errors: problem details with type, title and status failed
  - M1: https://dustinedwards.info/api/carrel/v1 preview: a tiny source answers HTML that is never indexed failed
  - M1: https://dustinedwards.info/api/carrel/v1 publish with a future publishedAt: refused, or not implemented where the site cannot set the date failed
  - M1: https://dustinedwards.info/api/carrel/v1 content rename of an unknown id: refused, or not implemented where the site lacks it failed
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 julieedwards.info: checks pass; no verifier yet
- ❌ TXASM: site-api-live: 3 errors
  - K4: https://txasm.org/api/carrel/v1/meta meta answered 302 without the key, expected 401
  - K4: https://txasm.org/api/carrel/v1/site-api-live-874cbdb66d6f an unknown route answered 302 without the key, expected 401
  - E2: https://txasm.org/preview/Zvu2ljYZ8MzVxVwaOGor-JoOgz-3WNnXzJMJg9X_2-c an unknown preview link answered 302, expected 404
- 🟡 Foxhound: checks pass; no verifier yet
- ❌ Foxing: carrel-conformance: 1 errors
  - M1: https://foxing.app/api/carrel/v1 preview: a tiny source answers HTML that is never indexed failed

### 6. Images and media

Builder: Complete shared images and media. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: site-runtime-images: 59 errors
  - C3: https://dustinedwards.info/ no twitter:image:alt
  - C3: https://dustinedwards.info/ no og:image:width, og:image:height, og:image:alt
  - C3: https://dustinedwards.info/about no twitter:image:alt
  - C3: https://dustinedwards.info/about no og:image:width, og:image:height, og:image:alt
  - C3: https://dustinedwards.info/writing no twitter:image:alt
- ❌ Germomics: site-runtime-images: 48 errors
  - C3: https://germomics.com/ no twitter:image:alt
  - C3: https://germomics.com/ no og:image:width, og:image:height, og:image:alt
  - C3: https://germomics.com/episodes no twitter:image:alt
  - C1: https://images.germomics.com/cover.jpg the og:image of https://germomics.com/episodes answers 404
  - C3: https://germomics.com/writing no twitter:image:alt
- ❌ julieedwards.info: site-runtime-images: 2 errors
  - A4: https://julieedwards.info/ https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg has no width attribute, so the page shifts as it loads
  - A2: https://julieedwards.info/ https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg is 2048 px wide (the file) with no srcset and sizes, so every screen downloads the whole of it
- 🟡 TXASM: checks pass; no verifier yet
- ❌ BSW: site-runtime-images: 1 errors
  - A2: https://bsw.dustin-edwards.workers.dev/ /services/grant-review.webp is 512 px wide with no srcset and sizes, so every screen downloads the whole of it
- 🟡 Foxhound: checks pass; no verifier yet
- ❌ Foxing: site-runtime-images: 154 errors
  - A2: https://foxing.app/ https://covers.foxing.app/813-leblanc.jpg is 400 px wide with no srcset and sizes, so every screen downloads the whole of it
  - A2: https://foxing.app/ https://covers.foxing.app/a-bid-for-fortune-boothby.jpg is 400 px wide with no srcset and sizes, so every screen downloads the whole of it
  - A2: https://foxing.app/ https://covers.foxing.app/a-bride-of-a-summers-day-pirkis.jpg is 400 px wide with no srcset and sizes, so every screen downloads the whole of it
  - A2: https://foxing.app/ https://covers.foxing.app/a-christmas-carol-dickens.jpg is 400 px wide with no srcset and sizes, so every screen downloads the whole of it
  - A2: https://foxing.app/ https://covers.foxing.app/a-confession-tolstoy.jpg is 400 px wide with no srcset and sizes, so every screen downloads the whole of it
- 🟡 Carrel: checks pass; no verifier yet
- 🟡 Enarratio: checks pass; no verifier yet
- 🟡 Capsomer: checks pass; no verifier yet
- ❌ Prelum specimen: site-runtime-images: 6 errors
  - A4: https://prelum.dustinedwards.info/ /diagrams/prelum-03318765-light.svg has no width attribute, so the page shifts as it loads
  - A4: https://prelum.dustinedwards.info/ /diagrams/prelum-03318765-dark.svg has no width attribute, so the page shifts as it loads
  - A5: https://prelum.dustinedwards.info/ 3 images are fetchpriority="high"; more than two competes with the one that is the largest paint
  - C3: https://prelum.dustinedwards.info/ no twitter:card; summary_large_image shows the card full width
  - C3: https://prelum.dustinedwards.info/ no twitter:image:alt
- 🟡 Capsid explorer: checks pass; no verifier yet

### 7. Speed and caching

Builder: Complete shared speed and caching. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: site-runtime-speed: 2 errors
  - C1: https://dustinedwards.info/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - D1: https://dustinedwards.info/ no 103 Early Hints before the page
- ❌ Germomics: site-runtime-speed: 3 errors
  - C1: https://germomics.com/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - C1: https://germomics.com/fonts/space-grotesk-600-latin.woff2 a hashed file sent cache-control public, max-age=86400, not a year immutable
  - D1: https://germomics.com/ no 103 Early Hints before the page
- ❌ julieedwards.info: site-runtime-speed: 2 errors
  - C1: https://julieedwards.info/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - D1: https://julieedwards.info/ no 103 Early Hints before the page
- ❌ TXASM: site-runtime-speed: 42 errors
  - B7: https://txasm.dustin-edwards.workers.dev/ a conditional request with the page's own validator answered 500, not 304
  - B7: https://txasm.dustin-edwards.workers.dev/meetings a conditional request with the page's own validator answered 500, not 304
  - B7: https://txasm.dustin-edwards.workers.dev/awardees a conditional request with the page's own validator answered 500, not 304
  - B7: https://txasm.dustin-edwards.workers.dev/award-nominations a conditional request with the page's own validator answered 500, not 304
  - B7: https://txasm.dustin-edwards.workers.dev/branch-officers a conditional request with the page's own validator answered 500, not 304
- ❌ BSW: site-runtime-speed: 24 errors
  - B1: https://bsw.dustin-edwards.workers.dev/grant-proposal-support/ a sitemap page answered 301
  - B1: https://bsw.dustin-edwards.workers.dev/manuscript-editing/ a sitemap page answered 301
  - B1: https://bsw.dustin-edwards.workers.dev/visual-design/ a sitemap page answered 301
  - B1: https://bsw.dustin-edwards.workers.dev/language-support/ a sitemap page answered 301
  - B1: https://bsw.dustin-edwards.workers.dev/career-development/ a sitemap page answered 301
- ❌ Foxhound: site-runtime-speed: 2 errors
  - C1: https://foxhoundapp.com/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - D1: https://foxhoundapp.com/ no 103 Early Hints before the page
- ❌ Foxing: site-runtime-speed: 2 errors
  - C1: https://foxing.app/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - D1: https://foxing.app/ no 103 Early Hints before the page
- ❌ Carrel: site-runtime-speed-static: 3 errors
  - B4: https://carrel.dustinedwards.info/speedcheck-missing a 404 was stored and served from the edge
  - C1: https://carrel.dustinedwards.info/apple-touch-icon.png a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
  - D1: https://carrel.dustinedwards.info/ no 103 Early Hints before the page
- ❌ Enarratio: site-runtime-speed-static: 7 errors
  - D1: https://enarratio.dustinedwards.info/ no Link preload header for Early Hints
  - D1: https://enarratio.dustinedwards.info/example no Link preload header for Early Hints
  - D1: https://enarratio.dustinedwards.info/capsomer no Link preload header for Early Hints
  - D1: https://enarratio.dustinedwards.info/astro no Link preload header for Early Hints
  - B4: https://enarratio.dustinedwards.info/speedcheck-missing a 404 was stored and served from the edge
- ❌ Capsomer: site-runtime-speed-static: 44 errors
  - D1: https://capsomer.dustinedwards.info/ no Link preload header for Early Hints
  - D1: https://capsomer.dustinedwards.info/make/ no Link preload header for Early Hints
  - D1: https://capsomer.dustinedwards.info/components/admin-shell/ no Link preload header for Early Hints
  - D1: https://capsomer.dustinedwards.info/components/anchor-bar/ no Link preload header for Early Hints
  - D1: https://capsomer.dustinedwards.info/components/approval-sheet/ no Link preload header for Early Hints
- ❌ Prelum specimen: site-runtime-speed-static: 8 errors
  - B4: https://prelum.dustinedwards.info/speedcheck-missing a 404 was stored and served from the edge
  - C1: https://prelum.dustinedwards.info/apple-touch-icon.png a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
  - C1: https://prelum.dustinedwards.info/images/sample-light-640x360.svg a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
  - C1: https://prelum.dustinedwards.info/images/sample-dark-640x360.svg a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
  - C1: https://prelum.dustinedwards.info/diagrams/prelum-03318765-light.svg a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
- ❌ Capsid explorer: site-runtime-speed: 91 errors
  - F3: https://capsid.dustinedwards.info/ no Server-Timing header
  - D1: https://capsid.dustinedwards.info/ no Link preload header for Early Hints
  - F3: https://capsid.dustinedwards.info/systems/ no Server-Timing header
  - D1: https://capsid.dustinedwards.info/systems/ no Link preload header for Early Hints
  - F3: https://capsid.dustinedwards.info/flows/ no Server-Timing header

### 8. Running and recovery

Builder: Complete shared running and recovery. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: ops-audit: 1 errors
  - H1: https://dustinedwards.info/health answers 404, not 2xx or 503; Content-Type is 'text/html; charset=utf-8', not application/health+json or application/json; X-Robots-Tag is 'none', without noindex; the body is not JSON
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 julieedwards.info: checks pass; no verifier yet
- 🟡 TXASM: checks pass; no verifier yet
- 🟡 BSW: checks pass; no verifier yet
- 🟡 Foxhound: checks pass; no verifier yet
- 🟡 Foxing: checks pass; no verifier yet
- ❌ Capsid explorer: ops-audit: 1 errors
  - H1: https://capsid.dustinedwards.info/health answers 404, not 2xx or 503; Content-Type is 'text/html; charset=utf-8', not application/health+json or application/json; Cache-Control is 'public, max-age=3600', without no-store; X-Robots-Tag is 'none', without noindex; the body is not JSON
- ❌ Capsid MCP: ops-audit: 2 errors
  - H1: https://mcp.dustinedwards.info/health Cache-Control is 'none', without no-store; X-Robots-Tag is 'none', without noindex
  - H2: https://mcp.dustinedwards.info/health the body does not carry status (is 'ok', not pass, warn or fail), ok, time, checks
- ❌ Foxhound admin MCP: ops-audit: 1 errors
  - H1: https://admin-mcp.foxhoundapp.com/health Content-Type is 'text/plain; charset=utf-8', not application/health+json or application/json; the body is not JSON
- ❌ Dustin Edwards admin MCP: ops-audit: 1 errors
  - H1: https://admin-mcp.dustinedwards.info/health Content-Type is 'text/plain; charset=utf-8', not application/health+json or application/json; the body is not JSON
- 🟡 Carrel MCP: checks pass; no verifier yet
- ❌ Foxing admin MCP: ops-audit: 4 errors
  - H1: https://admin-mcp.foxing.app/health answers 403, not 2xx or 503; X-Robots-Tag is 'none', without noindex
  - H2: https://admin-mcp.foxing.app/health the body does not carry status, ok, time, checks (the old shape: site-runtime's health gives { status, ok, time, checks: [{ name, status }] })
  - H4: https://admin-mcp.foxing.app/health no sha, so the deployed commit cannot be read
  - N1: https://admin-mcp.foxing.app/6278c687-9a0f-48a1-b4ee-e1f52e7022b1 a missing page answers 403, not 404

### 9. Accessibility and components

Builder: Complete accessibility and Capsomer components. Verifier: none yet.

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

### 10. Charts

Builder: Complete shared charts. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: chart-audit: 9 errors
  - B1: https://dustinedwards.info/cv "Output by year" (bar), light: 29 marks under 3:1, lowest <rect in year 2005, Awards: 1> #fdfdfe on #fdfdfe at 1.00:1
  - B1: https://dustinedwards.info/cv "Output by year" (bar), dark: 29 marks under 3:1, lowest <rect in year 2005, Awards: 1> #18161c on #0e0c12 at 1.08:1
  - B18: https://dustinedwards.info/cv "Publications" (sparkline): no finding sentence in the HTML
  - B18: https://dustinedwards.info/cv "Publications" (sparkline): no caption
  - B18: https://dustinedwards.info/cv "Grants" (sparkline): no finding sentence in the HTML
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 Foxhound: checks pass; no verifier yet
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- ❌ Enarratio: chart-audit: 55 errors
  - B1: https://enarratio.dustinedwards.info/ "Weekly positive tests by county" (line), light: 2 text under 4.5:1, lowest "Williamson" #018d87 on #fefdfd at 4.01:1
  - B1: https://enarratio.dustinedwards.info/ "Ct values by virus" (density), light: 2 text under 4.5:1, lowest "PA-X null" #018d87 on #fefdfd at 4.01:1
  - B1: https://enarratio.dustinedwards.info/ "Confidence in vaccine safety" (pie), light: 1 text under 4.5:1, lowest "1,284 replies" #1b1e23 on #084fba at 2.26:1
  - B1: https://enarratio.dustinedwards.info/ "Retention by cohort" (heatmap), light: 9 marks under 3:1, lowest <span> #dbe9f6 on #fefdfd at 1.22:1
  - B1: https://enarratio.dustinedwards.info/ "Co-authorship network" (network), light: 14 marks under 3:1, lowest <path in link> #abaeb3 on #fefdfd at 2.19:1
- ❌ Capsomer: chart-audit: 53 errors
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Jobs run per day" (bar), light: 14 marks under 3:1, lowest <rect in bar> #fdfdfe on #fdfdfe at 1.00:1
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Response time, median" (line), light: 2 text under 4.5:1, lowest "foxhound.app" #cc4f0c on #fdfdfe at 4.40:1
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Requests per hour, last 12 hours" (heat-strip), light: 8 marks under 3:1, lowest <rect> #e4dcf8 on #fdfdfe at 1.30:1
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Eight series in the purple family" (bar), light: 21 marks under 3:1, lowest <rect in bar> #fdfdfe on #fdfdfe at 1.00:1
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Eight series in the fox family" (bar), light: 21 marks under 3:1, lowest <rect in bar> #fdfdfe on #fdfdfe at 1.00:1
- ❌ Prelum specimen: chart-audit: 2 errors
  - B1: https://prelum.dustinedwards.info/ "Two series" (line), light: 2 text under 4.5:1, lowest "Beta" #cc4f0c on #fbfeff at 4.42:1
  - B1: https://prelum.dustinedwards.info/ "Two series" (line), dark: 2 text under 4.5:1, lowest "Alpha" #8c5fd2 on #12181c at 3.99:1
- ❌ Capsid explorer: chart-audit: 2 errors
  - B1: https://capsid.dustinedwards.info/numbers/ "Jobs finished per week" (bar), light: 8 marks under 3:1, lowest <rect in bar> #fdfdfe on #f1fdfd at 1.02:1
  - B1: https://capsid.dustinedwards.info/numbers/ "Jobs finished per week" (bar), dark: 8 marks under 3:1, lowest <rect in bar> #18161c on #070f0f at 1.08:1

### 11. AI and MCP

Builder: Complete shared AI and MCP code. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: checks pass; no verifier yet
- 🟡 Germomics: checks pass; no verifier yet
- 🟡 julieedwards.info: checks pass; no verifier yet
- 🟡 TXASM: checks pass; no verifier yet
- 🟡 BSW: checks pass; no verifier yet
- ❌ Foxhound: site-runtime-ai-audit: 4 errors
  - A1: https://foxhoundapp.com/.well-known/oauth-protected-resource/mcp scopes_supported (merchant) lists no read scope
  - A1: https://foxhoundapp.com/.well-known/oauth-protected-resource scopes_supported (merchant) lists no read scope
  - A4: https://foxhoundapp.com/.well-known/oauth-authorization-server client_id_metadata_document_supported is not true
  - A4: https://foxhoundapp.com/.well-known/oauth-authorization-server authorization_response_iss_parameter_supported is not true
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- 🟡 Enarratio: checks pass; no verifier yet
- 🟡 Capsomer: checks pass; no verifier yet
- 🟡 Prelum specimen: checks pass; no verifier yet
- 🟡 Capsid explorer: checks pass; no verifier yet
- 🟡 Capsid MCP: checks pass; no verifier yet
- 🟡 Foxhound admin MCP: checks pass; no verifier yet
- 🟡 Dustin Edwards admin MCP: checks pass; no verifier yet
- 🟡 Carrel MCP: checks pass; no verifier yet
- ❌ Foxing admin MCP: site-runtime-ai-audit: 2 errors
  - A1: https://admin-mcp.foxing.app/.well-known/oauth-protected-resource/mcp answered 403 application/json, neither 404 nor a JSON object
  - A1: https://admin-mcp.foxing.app/.well-known/oauth-protected-resource answered 403 application/json, neither 404 nor a JSON object

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
