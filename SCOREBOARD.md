# Shared-code completeness

Newest run 2026-10-31 13:06 UTC. Filled only from the live checks and the verifiers' verdicts.

**Not finished.** Finished means every cell complete and clean for 7 daily runs.

✅ complete · 🟡 partial · ❌ missing · `·` does not apply

| Area | Package | dustinedwards.info | Germomics | julieedwards.info | TXASM | BSW | Foxhound | Foxing | Carrel | Enarratio | Capsomer | Prelum specimen | Capsid explorer | Capsid MCP | Foxhound admin MCP | Dustin Edwards admin MCP | Carrel MCP | Foxing admin MCP | Lines added | Lines removed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|
| 1. Search, sharing and AI answers | ❌ | ❌ | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | · | · | · | · | · | +15923 | −606 |
| 2. Security headers and CSP | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | +48020 | −6230 |
| 3. Sign-in and access | 🟡 | 🟡 | 🟡 | · | ❌ | · | 🟡 | ❌ | · | · | · | · | 🟡 | ✅ | ✅ | ✅ | ✅ | ❌ | +5556 | −1273 |
| 4. Writing and rendering | ❌ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | +6126 | −2805 |
| 5. Carrel editing contract | ❌ | ❌ | 🟡 | 🟡 | ❌ | · | 🟡 | 🟡 | · | · | · | · | · | · | · | · | · | · | +37767 | −7178 |
| 6. Images and media | ❌ | ❌ | 🟡 | ❌ | 🟡 | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | · | · | · | · | · | +23097 | −2090 |
| 7. Speed and caching | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | · | · | · | +6435 | −3179 |
| 8. Running and recovery | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | ❌ | ❌ | ❌ | ❌ | ❌ | +24854 | −1688 |
| 9. Accessibility and components | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | +0 | −0 |
| 10. Charts | ❌ | ❌ | 🟡 | · | · | · | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | · | · | · | · | · | +15662 | −4962 |
| 11. AI and MCP | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | +15354 | −5124 |
| 12. Checks and tooling | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | +3950 | −382 |

Lines count public repositories only until the LIVE_GITHUB_TOKEN secret is set.

## Why a cell is not complete

### 1. Search, sharing and AI answers

Builder: Share SEO and other key site code. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: prelum-audit: 1 errors
  - link-broken: https://dustinedwards.info/colophon links to https://dustinedwards.info/api/health, which answers 503
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
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/grant-proposal-support the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/manuscript-editing the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/visual-design the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/language-support the sitemap lists a noindex page
- 🟡 Foxhound: checks pass; no verifier yet
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
- ❌ Prelum specimen: prelum-audit: 1 errors
  - link-broken: https://prelum.dustinedwards.info/ links to https://prelum.dustinedwards.info/writing/other, which answers 404
- 🟡 Capsid explorer: checks pass; no verifier yet

### 2. Security headers and CSP

Builder: Complete shared security headers and CSP. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: checks pass; no verifier yet
- ❌ Germomics: site-runtime-security: 1 errors
  - C6: https://germomics.com/ 34 element(s) carry a nonce the header does not name
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
  - C14: https://capsid.dustinedwards.info/site-runtime-security-39a2dc02-0aa6-4e26-9d08-aa83df09acf0 (404) violations are reported to both sinks (report-uri and report-to): no report-to: the browsers that read only the other one report nowhere
  - C14: https://capsid.dustinedwards.info/ (405) violations are reported to both sinks (report-uri and report-to): no report-to: the browsers that read only the other one report nowhere
- 🟡 Capsid MCP: checks pass; no verifier yet
- 🟡 Foxhound admin MCP: checks pass; no verifier yet
- 🟡 Dustin Edwards admin MCP: checks pass; no verifier yet
- 🟡 Carrel MCP: checks pass; no verifier yet
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
- 🟡 Foxhound: merchant MCP has no CIMD (fails H4 live), thin consent page, local call log; package gaps
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
  - K4: https://txasm.org/api/carrel/v1/site-api-live-07d3287f4fdd an unknown route answered 302 without the key, expected 401
  - E2: https://txasm.org/preview/qyUUIopudurFdz6RRZA9AKz-sediXAqe5cNjqqnjIAE an unknown preview link answered 302, expected 404
- 🟡 Foxhound: checks pass; no verifier yet
- 🟡 Foxing: checks pass; no verifier yet

### 6. Images and media

Builder: Complete shared images and media. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: site-runtime-images: 59 errors
  - C3: https://dustinedwards.info/ no twitter:image:alt
  - C3: https://dustinedwards.info/ no og:image:width, og:image:height, og:image:alt
  - C3: https://dustinedwards.info/about no twitter:image:alt
  - C3: https://dustinedwards.info/about no og:image:width, og:image:height, og:image:alt
  - C3: https://dustinedwards.info/writing no twitter:image:alt
- 🟡 Germomics: checks pass; no verifier yet
- ❌ julieedwards.info: site-runtime-images: 2 errors
  - A4: https://julieedwards.info/ https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg has no width attribute, so the page shifts as it loads
  - A2: https://julieedwards.info/ https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg is 2048 px wide (the file) with no srcset and sizes, so every screen downloads the whole of it
- 🟡 TXASM: checks pass; no verifier yet
- ❌ BSW: site-runtime-images: 1 errors
  - A2: https://bsw.dustin-edwards.workers.dev/ /services/grant-review.webp is 512 px wide with no srcset and sizes, so every screen downloads the whole of it
- 🟡 Foxhound: checks pass; no verifier yet
- ❌ Foxing: site-runtime-images: 9 errors
  - C3: https://foxing.app/ no og:image:type
  - C3: https://foxing.app/books no og:image:type
  - C3: https://foxing.app/awards no og:image:type
  - C3: https://foxing.app/picks no og:image:type
  - C3: https://foxing.app/book-of-the-month no og:image:type
- 🟡 Carrel: checks pass; no verifier yet
- 🟡 Enarratio: checks pass; no verifier yet
- 🟡 Capsomer: checks pass; no verifier yet
- ❌ Prelum specimen: site-runtime-images: 3 errors
  - A4: https://prelum.dustinedwards.info/ /diagrams/prelum-03318765-light.svg has no width attribute, so the page shifts as it loads
  - A4: https://prelum.dustinedwards.info/ /diagrams/prelum-03318765-dark.svg has no width attribute, so the page shifts as it loads
  - A5: https://prelum.dustinedwards.info/ 3 images are fetchpriority="high"; more than two competes with the one that is the largest paint
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
- ❌ TXASM: site-runtime-speed: 2 errors
  - C1: https://txasm.dustin-edwards.workers.dev/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - D1: https://txasm.dustin-edwards.workers.dev/ no 103 Early Hints before the page: workers.dev never sends Early Hints; the site needs its own domain
- ❌ BSW: site-runtime-speed: 6 errors
  - C1: https://bsw.dustin-edwards.workers.dev/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - C1: https://bsw.dustin-edwards.workers.dev/logos/institutions/logo-mayo-clinic.svg a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - C1: https://bsw.dustin-edwards.workers.dev/logos/institutions/logo-md-anderson.svg a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - C1: https://bsw.dustin-edwards.workers.dev/logos/institutions/logo-memorial-sloan-kettering.svg a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - C1: https://bsw.dustin-edwards.workers.dev/logos/institutions/logo-baylor-college-of-medicine.svg a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
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
- ❌ Enarratio: site-runtime-speed-static: 2 errors
  - B4: https://enarratio.dustinedwards.info/speedcheck-missing a 404 was stored and served from the edge
  - D1: https://enarratio.dustinedwards.info/ no 103 Early Hints before the page
- ❌ Capsomer: site-runtime-speed-static: 3 errors
  - B4: https://capsomer.dustinedwards.info/speedcheck-missing a 404 was stored and served from the edge
  - C1: https://capsomer.dustinedwards.info/apple-touch-icon.png a hashed file sent cache-control public, max-age=0, must-revalidate, not a year immutable
  - D1: https://capsomer.dustinedwards.info/ no 103 Early Hints before the page
- ❌ Prelum specimen: site-runtime-speed-static: 7 errors
  - B4: https://prelum.dustinedwards.info/speedcheck-missing a 404 was stored and served from the edge
  - C1: https://prelum.dustinedwards.info/apple-touch-icon.png a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
  - C1: https://prelum.dustinedwards.info/images/sample-light-640x360.svg a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
  - C1: https://prelum.dustinedwards.info/images/sample-dark-640x360.svg a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
  - C1: https://prelum.dustinedwards.info/diagrams/prelum-03318765-light.svg a hashed file sent cache-control public, max-age=300, must-revalidate, not a year immutable
- ❌ Capsid explorer: site-runtime-speed: 92 errors
  - F3: https://capsid.dustinedwards.info/ no Server-Timing header
  - D1: https://capsid.dustinedwards.info/ no Link preload header for Early Hints
  - F3: https://capsid.dustinedwards.info/systems/ no Server-Timing header
  - D1: https://capsid.dustinedwards.info/systems/ no Link preload header for Early Hints
  - F3: https://capsid.dustinedwards.info/flows/ no Server-Timing header

### 8. Running and recovery

Builder: Complete shared running and recovery. Verifier: Verify running and recovery across sites.

- 🟡 Package: ok is false on warn; no Images/DO checks; cronCheck waits 2x interval; no per-job timeout; requestFields lacks status; no console ratchet; no shared redirect/410 table; no gradual rollout, preview or expand-only check; no runbook; scoreboard never runs the sha or drill checks
- 🟡 dustinedwards.info: /api/health answers 503 while /health passes, and UptimeRobot and Capsid's watcher read /api/health; no 404 count; own deploy without rollback or bookmark; shared drill never run
- ❌ Germomics: ops-audit: 2 errors
  - H4: https://germomics.com/health no sha, so the deployed commit cannot be read
  - R1: https://github.com/DrDustinEdwards/germomics/actions/runs/41199707154 the newest restore drill ended failure
- ❌ julieedwards.info: ops-audit: 1 errors
  - R1: https://github.com/DrDustinEdwards/julieedwards-info/actions/runs/41199709537 the newest restore drill ended failure
- 🟡 TXASM: files pass not complete; R2 check at fail level; drill never run
- 🟡 BSW: health passes; deploy record, gradual rollout, preview and runbooks missing
- 🟡 Foxhound: migrations without bookmark; 404 rows kept 365 days; local cron ledger records skips as success; oauth hashes dumped; drill never run
- 🟡 Foxing: COVERS not backed up; files pass not complete; drill never run
- ❌ Capsid MCP: ops-audit: 2 errors
  - H1: https://mcp.dustinedwards.info/health Cache-Control is 'none', without no-store; X-Robots-Tag is 'none', without noindex
  - H2: https://mcp.dustinedwards.info/health the body does not carry status (is 'ok', not pass, warn or fail), ok, time, checks
- ❌ Foxhound admin MCP: ops-audit: 1 errors
  - H2: https://admin-mcp.foxhoundapp.com/health the body does not carry status, time, checks (the old shape: site-runtime's health gives { status, ok, time, checks: [{ name, status }] })
- ❌ Dustin Edwards admin MCP: ops-audit: 1 errors
  - H1: https://admin-mcp.dustinedwards.info/health Content-Type is 'text/plain; charset=utf-8', not application/health+json or application/json; the body is not JSON
- ❌ Carrel MCP: ops-audit: 1 errors
  - R1: https://github.com/DrDustinEdwards/carrel/actions/runs/41199714431 the newest restore drill ended failure
- ❌ Foxing admin MCP: ops-audit: 4 errors
  - H1: https://admin-mcp.foxing.app/health answers 403, not 2xx or 503; X-Robots-Tag is 'none', without noindex
  - H2: https://admin-mcp.foxing.app/health the body does not carry status, ok, time, checks (the old shape: site-runtime's health gives { status, ok, time, checks: [{ name, status }] })
  - H4: https://admin-mcp.foxing.app/health no sha, so the deployed commit cannot be read
  - N1: https://admin-mcp.foxing.app/f1d61e80-d94a-4a25-b764-a831dbd5efda a missing page answers 403, not 404

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
- ❌ dustinedwards.info: chart-audit: 6 errors
  - B18: https://dustinedwards.info/cv "Publications" (sparkline): no finding sentence in the HTML
  - B18: https://dustinedwards.info/cv "Publications" (sparkline): no caption
  - B18: https://dustinedwards.info/cv "Grants" (sparkline): no finding sentence in the HTML
  - B18: https://dustinedwards.info/cv "Grants" (sparkline): no caption
  - B18: https://dustinedwards.info/cv "Students mentored" (sparkline): no finding sentence in the HTML
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
- ❌ Capsomer: chart-audit: 31 errors
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Response time, median" (line), light: 2 text under 4.5:1, lowest "example.com" #cc4f0c on #fdfdfe at 4.40:1
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Requests per hour, last 12 hours" (heat-strip), light: 8 marks under 3:1, lowest <rect> #e4dcf8 on #fdfdfe at 1.30:1
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Response time, median" (line), dark: 2 text under 4.5:1, lowest "example.com" #cc4f0c on #fdfdfe at 4.40:1
  - B1: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Requests per hour, last 12 hours" (heat-strip), dark: 8 marks under 3:1, lowest <rect> #e4dcf8 on #fdfdfe at 1.30:1
  - B2: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Builds per day" (bar): drawn only with scripts on, so there is no chart, text or table without them
- ❌ Prelum specimen: chart-audit: 2 errors
  - B1: https://prelum.dustinedwards.info/ "Two series" (line), light: 2 text under 4.5:1, lowest "Beta" #cc4f0c on #fbfeff at 4.42:1
  - B1: https://prelum.dustinedwards.info/ "Two series" (line), dark: 2 text under 4.5:1, lowest "Alpha" #8c5fd2 on #12181c at 3.99:1
- 🟡 Capsid explorer: checks pass; no verifier yet

### 11. AI and MCP

Builder: Complete shared AI and MCP code. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- 🟡 dustinedwards.info: checks pass; no verifier yet
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
