# Shared-code completeness

Newest run 2026-11-01 00:10 UTC. Filled only from the live checks and the verifiers' verdicts.

**Not finished.** Finished means every cell complete and clean for 7 daily runs.

✅ complete · 🟡 partial · ❌ missing · `·` does not apply

| Area | Package | dustinedwards.info | Germomics | julieedwards.info | TXASM | BSW | Foxhound | Foxing | Carrel | Enarratio | Capsomer | Prelum specimen | Capsid explorer | Capsid MCP | Foxhound admin MCP | Dustin Edwards admin MCP | Carrel MCP | Foxing admin MCP | Capsid Portal | Carrel Desk | Lines added | Lines removed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|
| 1. Search, sharing and AI answers | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | · | · | · | · | · | · | · | +15923 | −606 |
| 2. Security headers and CSP | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | +52000 | −8463 |
| 3. Sign-in and access | 🟡 | 🟡 | 🟡 | · | ❌ | · | 🟡 | 🟡 | · | · | · | · | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | +67457 | −2968 |
| 4. Writing and rendering | ❌ | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | · | · | · | · | · | +6639 | −3038 |
| 5. Carrel editing contract | 🟡 | ❌ | 🟡 | 🟡 | ❌ | · | 🟡 | 🟡 | · | · | · | · | · | · | · | · | · | · | · | · | +38995 | −8146 |
| 6. Images and media | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | · | · | · | ❌ | · | +29940 | −3447 |
| 7. Speed and caching | 🟡 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ❌ | · | · | · | · | · | · | · | +6469 | −3193 |
| 8. Running and recovery | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | 🟡 | · | · | · | · | · | 🟡 | ❌ | 🟡 | 🟡 | ❌ | · | · | +27951 | −2785 |
| 9. Accessibility and components | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | · | · | ❌ | ❌ | ❌ | · | · | +7063 | −801 |
| 10. Charts | ❌ | ❌ | ❌ | · | · | · | ❌ | 🟡 | 🟡 | ❌ | ❌ | 🟡 | ❌ | · | · | · | · | · | · | · | +19667 | −6020 |
| 11. AI and MCP | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | · | · | +33257 | −5861 |
| 12. Checks and tooling | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | +3950 | −382 |

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
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/grant-proposal-support the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/manuscript-editing the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/visual-design the sitemap lists a noindex page
  - sitemap-noindex: https://bsw.dustin-edwards.workers.dev/language-support the sitemap lists a noindex page
- 🟡 Foxhound: checks pass; no verifier yet
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- ❌ Enarratio: prelum-audit: 1 errors
  - icon-missing: https://enarratio.dustinedwards.info/favicon.ico answers 404 text/html; charset=utf-8
- ❌ Capsomer: prelum-audit: 8 errors
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/chips/chips.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/link/link.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/catalog/ links to https://capsomer.dustinedwards.info/components/empty/empty.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/empty/ links to https://capsomer.dustinedwards.info/components/skeleton/skeleton.md, which answers 404
  - link-broken: https://capsomer.dustinedwards.info/components/empty/ links to https://capsomer.dustinedwards.info/components/error-page/error-page.md, which answers 404
- ❌ Prelum specimen: prelum-audit: 2 errors
  - link-broken: https://prelum.dustinedwards.info/ links to https://prelum.dustinedwards.info/writing/other, which answers 404
  - link-broken: https://prelum.dustinedwards.info/ links to https://prelum.dustinedwards.info/writing/next, which answers 404
- 🟡 Capsid explorer: checks pass; no verifier yet

### 2. Security headers and CSP

Builder: Complete shared security headers and CSP. Verifier: Verify security headers across sites.

- 🟡 Package: opt-in-only grading of C3/C7/C9/S2/I3; report sink drops integrity and coep reports; no COEP report-to; applyHeaderSet has no 101 guard; Portal and Desk not on the board; no signed-in crawl; Access 4xx not treated as the gate; zone CAA/DNSSEC/preload open
- ❌ dustinedwards.info: site-runtime-security: 8 errors
  - I3: https://dustinedwards.info/ (200) Cross-Origin-Embedder-Policy-Report-Only is present: ABSENT
  - C16: https://dustinedwards.info/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - I3: https://dustinedwards.info/about (200) Cross-Origin-Embedder-Policy-Report-Only is present: ABSENT
  - C16: https://dustinedwards.info/about (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - I3: https://dustinedwards.info/site-runtime-security-ad028f46-194a-408d-b11b-951fcb0fb3a6 (404) Cross-Origin-Embedder-Policy-Report-Only is present: ABSENT
- ❌ Germomics: site-runtime-security: 4 errors
  - C16: https://germomics.com/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://germomics.com/episodes (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://germomics.com/site-runtime-security-d1c94400-6264-424d-a0a4-03255781e930 (404) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://germomics.com/ (405) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
- 🟡 julieedwards.info: local Referrer-Policy literal (workers/app.ts:94); no requireJson; v0.54.0; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 TXASM: A6 declared while bsw in the same situation sends noindex; txasm.org alias now a suspended page; v0.57.0; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 BSW: pinned v0.50.1; registry 0.57.1 opt-ins are not in its code; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- ❌ Foxhound: site-runtime-security: 4 errors
  - C16: https://foxhoundapp.com/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://foxhoundapp.com/pricing (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://foxhoundapp.com/site-runtime-security-38fdcb2a-6d95-44b6-beef-7183680984f8 (404) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://foxhoundapp.com/ (405) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
- 🟡 Foxing: own 101 guard instead of shared; pinned header test; v0.54.0; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 Carrel: local preview XFO and policy; pinned csp tests; own 101 guard; Desk security.txt behind Access; v0.54.0; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 Enarratio: /assets/* skips the Worker; not_found_handling none unlike capsomer/prelum; v0.52.0; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- ❌ Capsomer: site-runtime-security: 4 errors
  - C16: https://capsomer.dustinedwards.info/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://capsomer.dustinedwards.info/make/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://capsomer.dustinedwards.info/site-runtime-security-2a1b52f2-5714-4d5e-9f8e-17247d6d8f34 (404) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - C16: https://capsomer.dustinedwards.info/ (405) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
- ❌ Prelum specimen: site-runtime-security: 6 errors
  - I3: https://prelum.dustinedwards.info/ (200) Cross-Origin-Embedder-Policy-Report-Only is present: ABSENT
  - C16: https://prelum.dustinedwards.info/ (200) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - I3: https://prelum.dustinedwards.info/site-runtime-security-e01c129c-ba50-4a0a-9cb4-c52dfb625a0e (404) Cross-Origin-Embedder-Policy-Report-Only is present: ABSENT
  - C16: https://prelum.dustinedwards.info/site-runtime-security-e01c129c-ba50-4a0a-9cb4-c52dfb625a0e (404) frame-src lets in every post player (declared: embeds): refuses https://www.youtube-nocookie.com https://www.tiktok.com https://open.spotify.com https://w.soundcloud.com https://embed.podcasts.apple.com https://music.amazon.com https://music.amazon.ca https://music.amazon.com.mx https://music.amazon.com.br https://music.amazon.co.uk https://music.amazon.de https://music.amazon.fr https://music.amazon.es https://music.amazon.it https://music.amazon.in https://music.amazon.co.jp https://music.amazon.com.au https://www.google.com https://platform.twitter.com https://embed.bsky.app https://www.instagram.com (EMBED_FRAME_SOURCES, ./embeds)
  - I3: https://prelum.dustinedwards.info/ (405) Cross-Origin-Embedder-Policy-Report-Only is present: ABSENT
- 🟡 Capsid explorer: no S2 or I3 met or declared; Portal cookies hand-built without __Host- (no hostCookie); Portal not on the board; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 Capsid MCP: no S2 or I3 met or declared; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 Foxhound admin MCP: no S2 or I3 met or declared; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 Dustin Edwards admin MCP: no S2 or I3 met or declared; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- 🟡 Carrel MCP: no S2 or I3 met or declared; S2 deviation rests on false facts (React Router 8.5.1 subResourceIntegrity exists; the injected beacon carries integrity); C3/C7/C9/S2/I3 graded only when opted in; pinned behind v0.57.1
- ❌ Foxing admin MCP: 73 errors live: still Vercel; the foxing-admin-mcp Worker is deployed nowhere (workers.dev answers 1042)
- ❌ Capsid Portal: signed-in-security: 3 errors
  - H2: https://portal.dustinedwards.info/ (200) a text or XML Content-Type names its charset: got "text/html"
  - H2: https://portal.dustinedwards.info/signed-in-crawl-404 (200) a text or XML Content-Type names its charset: got "text/html"
  - H2: https://portal.dustinedwards.info/portal/assets/index-BgNNVtMO.js (200) a text or XML Content-Type names its charset: got "text/javascript"
- ❌ Carrel Desk: site-runtime-security: 1 errors
  - D1: https://desk.dustinedwards.info/.well-known/security.txt is behind Cloudflare Access; it must be public (RFC 9116)

### 3. Sign-in and access

Builder: Complete shared sign-in and access. Verifier: Verify shared sign-in and access.

- 🟡 Package: passkey delete and email change need no fresh sign-in; a new link resets the three tries; Turnstile off when a key is missing; no new-device or recovery notice, no security history, no spike alert
- 🟡 dustinedwards.info: /lab has no Access app in front (unsigned GET answers 503) and is outside the idle sign-out; admin refusals not logged
- 🟡 Germomics: admin items pass; the admin 403 is not logged and nothing alerts on spikes (F2, F3)
- ❌ TXASM: site-runtime-sign-in: 1 errors
  - A1: https://txasm.dustin-edwards.workers.dev/api/auth/passkey/generate-authenticate-options the passkey's rpId is txasm.dustin-edwards.workers.dev, not txasm.org: a passkey made here will not work on the site
- 🟡 Foxhound: merchant MCP has no CIMD (fails H4 live), thin consent page, local call log; package gaps
- 🟡 Foxing: idle sign-out skips /api/v1/admin and /api/v1/ops; change-email mail goes to the wrong address; raw send error rethrown; package gaps
- 🟡 Capsid explorer: Portal session is a 12-hour cookie with no 1-hour idle sign-out and no server-side revoke; Portal sign-ins not logged
- 🟡 Foxing admin MCP: parked: the Worker has never been deployed, so the old server fails H4 live
- 🟡 Capsid Portal: checks pass; no verifier yet
- 🟡 Carrel Desk: checks pass; no verifier yet

### 4. Writing and rendering

Builder: Complete shared writing and rendering. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: prelum-content: 8 errors
  - writing-fragment: https://dustinedwards.info/research/publications a link to #papers-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/phages a link to #phages-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/protocols a link to #protocols-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/lab a link to #lab-results lands on nothing
  - writing-fragment: https://dustinedwards.info/research/lab/primers a link to #primers-results lands on nothing
- ❌ Germomics: prelum-content: 17 errors
  - writing-render-version: https://germomics.com/about stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://germomics.com/about stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://germomics.com/about/dustin-edwards stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://germomics.com/privacy stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://germomics.com/terms stored HTML from render version 9; the pipeline is at 12
- 🟡 julieedwards.info: checks pass; no verifier yet
- 🟡 TXASM: checks pass; no verifier yet
- 🟡 BSW: checks pass; no verifier yet
- ❌ Foxhound: prelum-content: 43 errors
  - writing-render-version: https://foxhoundapp.com/blog/stripe-billing-descriptor stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://foxhoundapp.com/blog/foxhound-vs-stripe-smart-retries stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://foxhoundapp.com/blog/best-dunning-software-2026 stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://foxhoundapp.com/blog/foxhound-vs-churn-buster stored HTML from render version 9; the pipeline is at 12
  - writing-render-version: https://foxhoundapp.com/blog/foxhound-vs-churnkey stored HTML from render version 9; the pipeline is at 12
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- 🟡 Enarratio: checks pass; no verifier yet
- 🟡 Capsomer: checks pass; no verifier yet
- 🟡 Prelum specimen: checks pass; no verifier yet
- 🟡 Capsid explorer: checks pass; no verifier yet

### 5. Carrel editing contract

Builder: Complete Carrel editing contract. Verifier: Verify area 5 Carrel editing contract.

- 🟡 Package: no schedule/unschedule event for an unpublished post; unknown fields stripped with 200 (A8); site-api-live ignores --from; webmention SSRF guard hostname-only, two guards; no shared purge hook; no feature-image post field; conformance blind to 301, 410, trash expiry, preview-link life, hooks, field round-trips; Carrel: conflict discards text, no merge, no excerpt/authors/series/publishedAt boxes, no preview-link revoke, no inbound-link warning, no width preview; PostsList no aria-sort; no hand a11y pass; Carrel README wrong
- ❌ dustinedwards.info: site-api-live: 2 errors
  - K4: https://dustinedwards.info/api/carrel/v1/meta meta has cache-control private, no-store, expected no-store
  - K4: https://dustinedwards.info/api/carrel/v1/site-api-live-36b018701e7f an unknown route has cache-control private, no-store, expected no-store
- 🟡 Germomics: author filter 501 though show.author is the byline; deleted post 404 not 410; preview is a hand-written shell; no series; no setTags; revisions author 'germomics', pages no history; admin.content.$key still writes pages outside Carrel
- 🟡 julieedwards.info: pins v0.17.0 so webmentions can read the stale edge copy, sent on publish only; live section with a draft reads as draft; revisions capped at 50; no delete or unpublish (needs ruling); preview without page chrome
- ❌ TXASM: site-api-live: 3 errors
  - K4: https://txasm.org/api/carrel/v1/meta meta answered 404 without the key, expected 401
  - K4: https://txasm.org/api/carrel/v1/site-api-live-5d34709297d2 an unknown route answered 404 without the key, expected 401
  - K4: https://txasm.org/api/carrel/v1/site-api-live-5d34709297d2 answers differently from a known route without the key, so it tells which routes exist
- 🟡 Foxhound: a draft save on a live post goes live at once (B3); deleted post 404 not 410; preview hand-written shell; own author key not authors, no cover image, no series; revisions partial and named by change id; delete drops post links silently
- 🟡 Foxing: author filter 501 though author_id exists and JSON-LD credits Foxing; pins v0.17.0 so webmentions can read the stale edge copy; deleted post 404 not 410; preview hand-written shell; no series; redirects not removed on delete (301 to 404); revision author raw id

### 6. Images and media

Builder: Complete shared images and media. Verifier: Verify area 6 images and media.

- 🟡 Package: uploads built (HEIC, GPS strip, placeholder); a replace keeps the immutable size URL; pictureProps carries no placeholder; Prelum picture drops source media (GIF never moves) and counts priority per render; unsized diagram img; credit/license never reach the renderer; no 1.91:1 cover crop, no 16:9/4:3/1:1 set, no og:video; respond sets no CORP; AVIF not stripped; images check skips A6 and C9 and never runs on the Portal
- ❌ dustinedwards.info: site-runtime-images: 9 errors
  - E3: https://dustinedwards.info/ https://op3.dev/e/media.germomics.com/Podcast_010_Antitoxin_Togo_Please.mp3 has no transcript link on the page
  - C8: https://dustinedwards.info/about 1 content image on this page, and its sitemap entry has no image:image
  - A12: https://dustinedwards.info/media/phage-hunters/dustin-edwards-2025.webp.webp?w=704 Cache-Control is "public, max-age=31536000", not immutable
  - A12: https://dustinedwards.info/media/phage-hunters/dustin-edwards-2025.webp.webp?w=640 Cache-Control is "public, max-age=31536000", not immutable
  - A12: https://dustinedwards.info/media/phage-hunters/dustin-edwards-2025.webp.webp?w=1024 Cache-Control is "public, max-age=31536000", not immutable
- ❌ Germomics: site-runtime-images: 66 errors
  - C11: https://germomics.com/brand/germomics-card.jpg the share card's Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview on another site may not load it
  - E3: https://germomics.com/ an <audio> has preload="metadata"
  - E3: https://germomics.com/episodes an <audio> has preload="metadata"
  - E3: https://germomics.com/writing an <audio> has preload="metadata"
  - E3: https://germomics.com/archive an <audio> has preload="metadata"
- ❌ julieedwards.info: site-runtime-images: 5 errors
  - C11: https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg Cross-Origin-Resource-Policy is "unset", not cross-origin, so a preview elsewhere may not load it
  - A4: https://julieedwards.info/ https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg has no width attribute, so the page shifts as it loads
  - A2: https://julieedwards.info/ https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg is 2048 px wide (the file) with no srcset and sizes, so every screen downloads the whole of it
  - A7: https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg is 2048 px wide for https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg shown about 358 px wide at 390 (DPR 3) on https://julieedwards.info/: 1.9 times what the screen needs
  - A7: https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg is 2048 px wide for https://content.julieedwards.info/julie-edwards-bluff-dale-profile.jpg shown about 1200 px wide at 1440 (DPR 1) on https://julieedwards.info/: 1.7 times what the screen needs
- ❌ TXASM: site-runtime-images: 1 errors
  - C11: https://txasm.dustin-edwards.workers.dev/og-card.png the share card's Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview on another site may not load it
- ❌ BSW: no image pipeline, /media, uploads or library; not a Carrel site; static files with a hand srcset; images check fails A2; logo 2.2x; only the logo card
- ❌ Foxhound: site-runtime-images: 51 errors
  - A6: https://foxhoundapp.com/ /favicon.svg is below the fold (y≈30135 at 390, y≈30790 at 1440) and not lazy (no loading attribute), no decoding="async"
  - A6: https://foxhoundapp.com/ preloads https://foxhoundapp.com/favicon.svg, an image below the fold (y≈30135 at 390, y≈30790 at 1440), ahead of what the screen shows
  - A6: https://foxhoundapp.com/pricing /favicon.svg is below the fold (y≈14851 at 390, y≈15311 at 1440) and not lazy (no loading attribute), no decoding="async"
  - A6: https://foxhoundapp.com/pricing preloads https://foxhoundapp.com/favicon.svg, an image below the fold (y≈14851 at 390, y≈15311 at 1440), ahead of what the screen shows
  - A6: https://foxhoundapp.com/products /favicon.svg is below the fold (y≈2233 at 390, y≈2399 at 1440) and not lazy (no loading attribute), no decoding="async"
- ❌ Foxing: site-runtime-images: 37 errors
  - C3: https://foxing.app/ no og:image:type
  - C8: https://foxing.app/ 10 content images on this page, and its sitemap entry has no image:image
  - A6: https://foxing.app/books /media/covers/813-leblanc.jpg.webp?w=240 is loading="lazy" above the fold (y≈667 at 390, y≈566 at 1440), so it waits for layout
  - A6: https://foxing.app/books /media/covers/a-bid-for-fortune-boothby.jpg.webp?w=240 is loading="lazy" above the fold (y≈667 at 390, y≈566 at 1440), so it waits for layout
  - A6: https://foxing.app/books /media/covers/a-bride-of-a-summers-day-pirkis.jpg.webp?w=240 is loading="lazy" above the fold (y≈1083 at 390, y≈566 at 1440), so it waits for layout
- ❌ Carrel: site-runtime-images: 1 errors
  - C11: https://carrel.dustinedwards.info/og-card.png the share card's Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview on another site may not load it
- ❌ Enarratio: site-runtime-images: 1 errors
  - C11: https://enarratio.dustinedwards.info/og-card.png the share card's Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview on another site may not load it
- ❌ Capsomer: site-runtime-images: 1 errors
  - C11: https://capsomer.dustinedwards.info/og-card.png the share card's Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview on another site may not load it
- ❌ Prelum specimen: site-runtime-images: 12 errors
  - C11: https://prelum.dustinedwards.info/images/loop-320x180.gif Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview elsewhere may not load it
  - C11: https://prelum.dustinedwards.info/images/loop-still-320x180.png Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview elsewhere may not load it
  - C11: https://prelum.dustinedwards.info/images/poster-640x360.png Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview elsewhere may not load it
  - C11: https://prelum.dustinedwards.info/link-icons/developer.mozilla.org.png Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview elsewhere may not load it
  - A6: https://prelum.dustinedwards.info/ /link-icons/developer.mozilla.org.png is below the fold (y≈35252 at 390, y≈37035 at 1440) and not lazy (no loading attribute), no decoding="async"
- ❌ Capsid explorer: site-runtime-images: 1 errors
  - C11: https://capsid.dustinedwards.info/assets/og-card.png the share card's Cross-Origin-Resource-Policy is "same-origin", not cross-origin, so a preview on another site may not load it
- ❌ Capsid Portal: site-runtime-images: 1 errors
  - C1: https://portal.dustinedwards.info/ sends a stranger to dustinedwards.cloudflareaccess.com before any page, so a shared link shows that host's card, not one of the site's own; nothing else is visible to check
- Not checked, Capsid Portal and Carrel Desk pages behind sign-in: a stranger's crawl sees only the redirect to Access, so the images on the signed-in pages (Desk's media library, the Portal's views) are not checked live

### 7. Speed and caching

Builder: Complete shared speed and caching. Verifier: Verify speed and caching.

- 🟡 Package: Built and live: route budgets enforced in CI on every React app, warming after every deploy (dei's deploy.yml, germomics and the rest through worker-deploy.yml), the static sites on staticSite. Still wrong in site-runtime-speed 0.65.0, so the board stays red whatever the sites do: (1) its user agent 'Mozilla/5.0 (compatible; site-runtime-speed)' gets no 103 from Cloudflare (curl with that agent: HTTP/2 200 only; with a browser agent: 103 then 200), so D1 fails on every custom domain; (2) B4 reads cf-cache-status HIT on a 404 as stored, but static assets report HIT on a 404 sent private, no-store (repeat fetches show no age), so B4 fails on Carrel, Capsomer, Enarratio, Prelum and the Capsid explorer; (3) hashed() still treats any name with 8 letters after a hyphen as hashed. A1 and G2 have no data without the CrUX key (Dustin's).
- ❌ TXASM: site-runtime-speed: 1 errors
  - D1: https://txasm.dustin-edwards.workers.dev/ no 103 Early Hints before the page: workers.dev never sends Early Hints; the site needs its own domain
- ❌ BSW: site-runtime-speed: 1 errors
  - D1: https://bsw.dustin-edwards.workers.dev/ no 103 Early Hints before the page: workers.dev never sends Early Hints; the site needs its own domain
- 🟡 Enarratio: A3: Lighthouse phone on the home page scored 75, 94 and 97 (median 94; the builder's own median is 92), under the bar of 95; desktop 99, 100, 100. The long tasks are still enhance.js and style/layout work (TBT 1,173 ms on the worst run). Fixed and verified: 103 and Link preload, Server-Timing, its own speculation rules, a private, no-store 404. Only the home page was measured; the other 3 sitemap pages were not.
- ❌ Capsid explorer: site-runtime-speed: 5 errors
  - C1: https://capsid.dustinedwards.info/assets/capsomer.css a hashed file sent cache-control public, max-age=3600, not a year immutable
  - C1: https://capsid.dustinedwards.info/assets/enarratio.css a hashed file sent cache-control public, max-age=3600, not a year immutable
  - C1: https://capsid.dustinedwards.info/assets/explorer.css a hashed file sent cache-control public, max-age=3600, not a year immutable
  - C1: https://capsid.dustinedwards.info/assets/theme.js a hashed file sent cache-control public, max-age=3600, not a year immutable
  - C1: https://capsid.dustinedwards.info/assets/explorer.js a hashed file sent cache-control public, max-age=3600, not a year immutable

### 8. Running and recovery

Builder: Complete shared running and recovery. Verifier: Verify area 8 round 2.

- 🟡 Package: Built but off: gradual rollout and previews in worker-deploy (no caller turns them on; D4 never compares error rates); goneResponse/renameRedirect unused; no shared redirect table (N5); no drill restores files; R2/R5 still owed; ops-audit exits 0 when its GitHub reads fail and never tests bindings (H5) or the shared 404 page (N6); probe filter misses .zip, .tar.gz, /web.config, /server-status
- 🟡 dustinedwards.info: No 404 count (privacy page fix is one PR, a fixable blocker); public /api/health still routed with no noindex; cron check 'backup never ran' pending tonight's 05:00 run; own deploy (ship.mjs) and own check-migrations.mjs; d1-dump v0.8.0; drill passed 12:33
- 🟡 Germomics: Deploys from GitHub at head f86a616 and drill passed; 404 is React Router's default page, not the shared error page; first audio/images files pass pending (03:17 cron, may take several nights); counted tables only
- 🟡 julieedwards.info: Health passes at head, drill passed, excludes set; D4/D6 off; d1-dump v0.8.0
- 🟡 TXASM: Health passes on workers.dev at head and drill passed; txasm.org still serves WordPress; D4/D6 off
- ❌ BSW: ops-audit: 1 errors
  - B1: https://bsw.dustin-edwards.workers.dev/health the newest complete backup is unknown (no age_hours), not under 26
- 🟡 Foxhound: Health and drill pass; TOOL_CALL_LOG and EMAIL unprobed; runCronJob wrapper and own cron-health job remain; 140 raw console calls; first media files pass pending (03:00 cron)
- 🟡 Foxing: Health and drill pass; EMAIL unprobed; first media and covers files pass pending (03:17 cron); d1-dump v0.8.0
- 🟡 Capsid MCP: Shared health; cron warn 'skills-refresh failing, site-repair failing' at 16:34 (fix deployed, unproven until runs); 528-line backup wrapper; own runTask ledger; own deploy (ci.yml); watcher's analytics read could-not-run on all 16 sites, so 5xx alerts cannot fire; U1 inside Cloudflare only; TLS at 14 days not 21; rehearsal passed 12:24 but not in areas.json
- ❌ Foxhound admin MCP: ops-audit: 1 errors
  - H2: https://admin-mcp.foxhoundapp.com/health the body does not carry status, time, checks (the old shape: site-runtime's health gives { status, ok, time, checks: [{ name, status }] })
- 🟡 Dustin Edwards admin MCP: Shared shape but no sha and checks [] (ops-audit H4 error); deployed by ship:mcp, not worker-deploy
- 🟡 Carrel MCP: Health passes, all bindings probed; drill passed; head 9189bb3 deploy in flight at 16:38 (673402c live)
- ❌ Foxing admin MCP: ops-audit: 1 errors
  - H2: https://admin-mcp.foxing.app/health the body does not carry status, time, checks (the old shape: site-runtime's health gives { status, ok, time, checks: [{ name, status }] })

### 9. Accessibility and components

Builder: Complete accessibility and Capsomer components. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: devkit-a11y: 7 errors
  - L3: https://dustinedwards.info/ text clipped with WCAG 1.4.12 text spacing: `ol.home-rows > li.home-row.h-entry:nth-of-type(1) > span.home-row-body:nth-of-type(2) > span.home-row-summary.home-row-clamp:nth-of-type(2)` (vertical), `ol.home-rows > li.home-row.h-entry:nth-of-type(2) > span.home-row-body:nth-of-type(2) > span.home-row-summary.home-row-clamp:nth-of-type(2)` (vertical), `ol.home-rows > li.home-row.h-entry:nth-of-type(3) > span.home-row-body:nth-of-type(2) > span.home-row-summary.home-row-clamp:nth-of-type(2)` (vertical)
  - L1: https://dustinedwards.info/no-such-page-devkit-a11y axe color-contrast (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `.cap-btn`
  - L3: https://dustinedwards.info/no-such-page-devkit-a11y scrolls sideways at 320 px: scrollWidth 328, widest `main#main > form.search-form > div.search-input-row > button.search-submit` reaches 328 px
  - L3: https://dustinedwards.info/research/publications scrolls sideways at 320 px: scrollWidth 1718, widest `main#main > header.list-head > p.list-dek:nth-of-type(1)` reaches 1718 px
  - L3: https://dustinedwards.info/research/publications 200%25 zoom proxy (a 720 px viewport, not browser zoom): scrolls sideways, scrollWidth 1718
- ❌ Germomics: devkit-a11y: 31 errors
  - L1: https://germomics.com/ axe color-contrast (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 2 elements, first `.ml-auto`
  - L2: https://germomics.com/ no skip link to main as the first Tab stop (first stop `body > header.sticky.top-0 > div.mx-auto.flex > a.flex.items-center` "germomics")
  - L3: https://germomics.com/ scrolls sideways at 320 px: scrollWidth 350, widest `div.space-y-12 > section:nth-of-type(2) > div.grid.gap-3:nth-of-type(2) > article.flex.items-center:nth-of-type(1)` reaches 350 px
  - L3: https://germomics.com/ text clipped with WCAG 1.4.12 text spacing: `div.grid.gap-3:nth-of-type(2) > article.flex.gap-4:nth-of-type(2) > div.min-w-0.flex-1 > p.mt-1.line-clamp-2` (vertical), `div.grid.gap-3:nth-of-type(2) > article.flex.gap-4:nth-of-type(5) > div.min-w-0.flex-1 > p.mt-1.line-clamp-2` (vertical), `div.grid.gap-3:nth-of-type(2) > article.flex.gap-4:nth-of-type(10) > div.min-w-0.flex-1 > p.mt-1.line-clamp-2` (vertical)
  - L1: https://germomics.com/no-such-page-devkit-a11y axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
- ❌ julieedwards.info: devkit-a11y: 7 errors
  - L1: https://julieedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://julieedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://julieedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop `html > body > div.json-formatter-container` "")
  - L2: https://julieedwards.info/site.webmanifest no visible focus on 20 of 20 stops: `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container` and 17 more
  - S2: https://julieedwards.info/site.webmanifest no lang on <html>
- ❌ TXASM: devkit-a11y: 3 errors
  - L2: https://txasm.dustin-edwards.workers.dev/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `main#main > div.cap-empty > div.cap-empty-content:nth-of-type(2) > a.cap-btn` "Go to the home page")
  - L1: https://txasm.dustin-edwards.workers.dev/newsletters/fall-1991-newsletter axe aria-prohibited-attr (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `.pdf-viewer-page`
  - S6: https://txasm.dustin-edwards.workers.dev/accessibility no accessibility statement: it answers 404
- ❌ BSW: devkit-a11y: 15 errors
  - L1: https://bsw.dustin-edwards.workers.dev/ axe scrollable-region-focusable (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 2 elements, first `#psms-panel-simple > .psms-scroll-box`
  - L2: https://bsw.dustin-edwards.workers.dev/ no skip link to main as the first Tab stop (first stop `div.flex.min-h-screen > header.sticky.top-0 > div.mx-auto.flex:nth-of-type(1) > a.shrink-0` "BioScience Writers home")
  - L3: https://bsw.dustin-edwards.workers.dev/ scrolls sideways at 320 px: scrollWidth 342, widest `div#psms-track` reaches 342 px
  - L1: https://bsw.dustin-edwards.workers.dev/no-such-page-devkit-a11y axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://bsw.dustin-edwards.workers.dev/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop none: nothing takes focus)
- ❌ Foxhound: devkit-a11y: 6 errors
  - L1: https://foxhoundapp.com/ axe color-contrast (serious, WCAG) at 390-dark: 1 element, first `li[data-queue-row="0"] > .min-w-0.flex-1 > .block.text-text-subtle[data-queue-meta=""]`
  - L3: https://foxhoundapp.com/ text clipped with WCAG 1.4.12 text spacing: `a.cap-panel.h-full > div.cap-panel-body > div.flex.h-full > h3.m-0.line-clamp-2` (vertical), `a.cap-panel.h-full > div.cap-panel-body > div.flex.h-full > h3.m-0.line-clamp-2` (vertical)
  - L2: https://foxhoundapp.com/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `body.min-h-full > div.fh-cap.fh-error-page > header.fh-error-bar.flex > a.no-underline` "foxhound")
  - L3: https://foxhoundapp.com/blog/archive text clipped with WCAG 1.4.12 text spacing: `div.flex.flex-col:nth-of-type(2) > a.group.-mx-2:nth-of-type(1) > div.min-w-0.flex-1 > p.mt-0\.5.line-clamp-1:nth-of-type(2)` (vertical), `div.flex.flex-col:nth-of-type(2) > a.group.-mx-2:nth-of-type(2) > div.min-w-0.flex-1 > p.mt-0\.5.line-clamp-1:nth-of-type(2)` (vertical), `div.flex.flex-col:nth-of-type(2) > a.group.-mx-2:nth-of-type(3) > div.min-w-0.flex-1 > p.mt-0\.5.line-clamp-1:nth-of-type(2)` (vertical) and 33 more
  - L2: https://foxhoundapp.com/decline-codes/insufficient_funds Escape did not close what `section.mb-10:nth-of-type(4) > ul.m-0.flex > li.overflow-hidden.rounded-lg:nth-of-type(1) > button.flex.w-full` opened
- ❌ Foxing: devkit-a11y: 16 errors
  - L2: https://foxing.app/ no visible focus on 1 of 40 stops: `input#q`
  - L3: https://foxing.app/ text clipped with WCAG 1.4.12 text spacing: `html > body > header.cap-site-header > a.cap-site-header-logo:nth-of-type(2)` (vertical)
  - L2: https://foxing.app/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `main#main > div.cap-empty > div.cap-empty-content:nth-of-type(2) > a.cap-btn` "Go to the home page")
  - L1: https://foxing.app/about axe link-in-text-block (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `.link`
  - L3: https://foxing.app/about text clipped with WCAG 1.4.12 text spacing: `html > body > header.cap-site-header > a.cap-site-header-logo:nth-of-type(2)` (vertical)
- ❌ Carrel: devkit-a11y: 7 errors
  - L1: https://carrel.dustinedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://carrel.dustinedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://carrel.dustinedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop `html > body > div.json-formatter-container` "")
  - L2: https://carrel.dustinedwards.info/site.webmanifest no visible focus on 20 of 20 stops: `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container`, `html > body > div.json-formatter-container` and 17 more
  - S2: https://carrel.dustinedwards.info/site.webmanifest no lang on <html>
- ❌ Enarratio: devkit-a11y: 2 errors
  - L3: https://enarratio.dustinedwards.info/no-such-page-devkit-a11y scrolls sideways at 320 px: scrollWidth 333, widest `main#main > header.gallery-head > p.gallery-intro` reaches 333 px
  - S6: https://enarratio.dustinedwards.info/accessibility no accessibility statement: it answers 404
- ❌ Capsomer: devkit-a11y: 12 errors
  - L1: https://capsomer.dustinedwards.info/ axe scrollable-region-focusable (serious, WCAG) at 390-light, 390-dark: 1 element, first `#home-install`
  - L2: https://capsomer.dustinedwards.info/no-such-page-devkit-a11y no skip link to main as the first Tab stop (first stop `body > main > p > a` "Go to Capsomer's front page")
  - L1: https://capsomer.dustinedwards.info/components/admin-shell/ axe label-content-name-mismatch (serious, WCAG) at 1440-light, 1440-dark: 1 element, first `section[aria-labelledby="ex-tip"] > .comp-ex-box > iframe[data-height="360"] a[aria-describedby="cap-popover-11"]`
  - L1: https://capsomer.dustinedwards.info/components/admin-shell/ axe scrollable-region-focusable (serious, WCAG) at 390-light, 390-dark: 1 element, first `#inst-p-html > .comp-ex-code[data-open=""] > pre[aria-label="Install"]`
  - L2: https://capsomer.dustinedwards.info/make/ no visible focus on 1 of 40 stops: `input#mk-radius`
- ❌ Prelum specimen: devkit-a11y: 9 errors
  - L3: https://prelum.dustinedwards.info/ scrolls sideways at 320 px: scrollWidth 333, widest `li#user-content-fn-source > p > a:nth-of-type(1) > span.cap-sr-only` reaches 365 px
  - L3: https://prelum.dustinedwards.info/ text clipped with WCAG 1.4.12 text spacing: `div.pair:nth-of-type(1) > div:nth-of-type(2) > div.output.prose > span.katex-display` (vertical)
  - L1: https://prelum.dustinedwards.info/site.webmanifest axe document-title (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L1: https://prelum.dustinedwards.info/site.webmanifest axe html-has-lang (serious, WCAG) at 1440-light, 1440-dark, 390-light, 390-dark: 1 element, first `html`
  - L2: https://prelum.dustinedwards.info/site.webmanifest no skip link to main as the first Tab stop (first stop `html > body > div.json-formatter-container` "")
- ❌ Capsid explorer: devkit-a11y: 4 errors
  - L3: https://capsid.dustinedwards.info/s/capsid/ scrolls sideways at 320 px: scrollWidth 344, widest `figure#family > div.cap-system-map-stage:nth-of-type(1)` reaches 384 px
  - L2: https://capsid.dustinedwards.info/systems/ no visible focus on 1 of 40 stops: `figure#family > div.cap-system-map-stage:nth-of-type(1) > svg.cap-system-map-layer:nth-of-type(2) > g.cap-system-map-tile`
  - L3: https://capsid.dustinedwards.info/flows/job-life/ scrolls sideways at 320 px: scrollWidth 344, widest `figure#flow-map > div.cap-system-map-stage:nth-of-type(1)` reaches 384 px
  - S6: https://capsid.dustinedwards.info/accessibility no accessibility statement: it answers 404
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

Builder: Complete shared charts. Verifier: none yet.

- ❌ Package: no verifier has checked the package
- ❌ dustinedwards.info: chart-audit: 4 errors
  - C12: https://dustinedwards.info/writing/ai-answer-mode-on-site-search "Requests refused by the built-in rate-limiting binding, limi" (bar), 320 px: the drawing is 480 px wide in a 273 px frame, so it scrolls sideways
  - C12: https://dustinedwards.info/writing/observable-plot-inside-a-worker "Worker bundle size by charting configuration" (bar), 320 px: the drawing is 480 px wide in a 273 px frame, so it scrolls sideways
  - C12: https://dustinedwards.info/writing/posts-in-git-served-from-d1 "Worker bundle size by highlighter configuration" (bar), 320 px: the drawing is 480 px wide in a 273 px frame, so it scrolls sideways
  - C12: https://dustinedwards.info/writing/site-search-on-d1 "RRF contribution by rank position, k = 60" (line), 320 px: the drawing is 480 px wide in a 273 px frame, so it scrolls sideways
- ❌ Germomics: chart-audit: 4 errors
  - C12: https://germomics.com/data/cholera-soho-1854 #cholera-soho-1854-timeline (line), 320 px: the drawing is 480 px wide in a 262 px frame, so it scrolls sideways
  - F: https://germomics.com/data/cholera-soho-1854 #cholera-soho-1854-timeline (line): not in Capsomer's chart frame (.cap-chart)
  - C12: https://germomics.com/data/influenza-1918 #influenza-1918-timeline (line), 320 px: the drawing is 480 px wide in a 262 px frame, so it scrolls sideways
  - F: https://germomics.com/data/influenza-1918 #influenza-1918-timeline (line): not in Capsomer's chart frame (.cap-chart)
- ❌ Foxhound: chart-audit: 6 errors
  - C12: https://foxhoundapp.com/intelligence/dashboard "MRR trend" (area), 320 px: the drawing is 480 px wide in a 246 px frame, so it scrolls sideways
  - C12: https://foxhoundapp.com/intelligence/dashboard "Net Revenue Retention" (line), 320 px: the drawing is 480 px wide in a 246 px frame, so it scrolls sideways
  - C12: https://foxhoundapp.com/intelligence/dashboard "MRR movement by week" (bar), 320 px: the drawing is 480 px wide in a 246 px frame, so it scrolls sideways
  - C12: https://foxhoundapp.com/intelligence/dashboard "MRR by plan" (bar), 320 px: the drawing is 480 px wide in a 246 px frame, so it scrolls sideways
  - C12: https://foxhoundapp.com/intelligence/dashboard "Customer health distribution" (bar), 320 px: the drawing is 480 px wide in a 246 px frame, so it scrolls sideways
- 🟡 Foxing: checks pass; no verifier yet
- 🟡 Carrel: checks pass; no verifier yet
- ❌ Enarratio: chart-audit: 118 errors
  - B1: https://enarratio.dustinedwards.info/ "Confidence in vaccine safety" (pie), light: 1 marks under 3:1, lowest <circle> #ffffff on #fefdfd at 1.02:1
  - B1: https://enarratio.dustinedwards.info/ "Retention by cohort" (heatmap), light: 3 marks under 3:1, lowest <span> #dbe9f6 on #fefdfd at 1.22:1
  - B1: https://enarratio.dustinedwards.info/ "Confidence in vaccine safety" (pie), dark: 1 marks under 3:1, lowest <circle> #16181d on #1c1517 at 1.01:1
  - B1: https://enarratio.dustinedwards.info/ "Retention by cohort" (heatmap), dark: 2 marks under 3:1, lowest <span> #1d2d42 on #1c1517 at 1.29:1
  - C12: https://enarratio.dustinedwards.info/ "Entries per year" (bar), 320 px: the drawing is 480 px wide in a 231 px frame, so it scrolls sideways
- ❌ Capsomer: chart-audit: 12 errors
  - C12: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Jobs run per day" (bar), 320 px: the drawing is 480 px wide in a 254 px frame, so it scrolls sideways
  - C12: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Jobs run per day" (bar), 320 px: 14 text under 12 px, smallest "0" at 10.6 px
  - C12: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Eight series in the purple family" (bar), 320 px: 11 text under 12 px, smallest "0" at 9.5 px
  - C12: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Eight series in the fox family" (bar), 320 px: 11 text under 12 px, smallest "0" at 9.5 px
  - C12: https://capsomer.dustinedwards.info/components/chart-frame/states?theme=light "Eight series in the teal family" (bar), 320 px: 11 text under 12 px, smallest "0" at 9.5 px
- 🟡 Prelum specimen: checks pass; no verifier yet
- ❌ Capsid explorer: chart-audit: 3 errors
  - C12: https://capsid.dustinedwards.info/numbers/ "Jobs finished per week" (bar), 320 px: 20 text under 12 px, smallest "0" at 11.4 px
  - C12: https://capsid.dustinedwards.info/numbers/ "Claims matching GitHub, per week" (line), 320 px: 20 text under 12 px, smallest "0" at 11.4 px
  - C12: https://capsid.dustinedwards.info/numbers/ "Approval waits per week" (area), 320 px: 19 text under 12 px, smallest "0" at 11.4 px
- Not checked, Capsid Portal (portal.dustinedwards.info): signed-in only; charts covered by Capsid's own browser tests until a public demo route exists
- Not checked, Foxing /stats, /year and /goals: signed-in only; no live check sees these charts until a public demo route exists
- Not checked, Carrel desk (desk.dustinedwards.info): signed-in only, behind Access; no live check sees this chart until a public demo route exists

### 11. AI and MCP

Builder: Complete shared AI and MCP code. Verifier: Verify area 11 AI and MCP.

- 🟡 Package: live check covers 7 of 89 items; conformance off Actions except Carrel; no static AI rules or pin comparison in devkit; toolsForGrant and fireOnce unused; no tool icons, tool-list pin, cancel on close; log has no export, retention, alert or Portal view; no shared agent keys; suggester metadata and Llama list
- 🟡 dustinedwards.info: Ask caches answers cut at max_tokens; Ask bypasses the gateway and untrusted(); suggester pins site-api v0.14.0
- 🟡 Germomics: local style text instead of WRITING_RULES; suggester gaps from the package
- 🟡 julieedwards.info: suggester on site-api v0.17.0: no timeout, JSON mode or prose check
- 🟡 TXASM: suggester inherits the package gaps (feature metadata, Llama list)
- 🟡 Foxhound: merchant MCP off the shared door: rate limit fails open, log after the call and fails open, open registration, own OAuth and era code, destructive tools unconfirmed, no outputSchema; local dash lines
- 🟡 Foxing: Plus chat and recommendation reasons unchecked by prose; companion logs user_id; suggester on site-api v0.17.0
- 🟡 Carrel: routine re-fire guard not atomic; shared fireOnce unused
- 🟡 Capsid explorer: AI Search reranker has no timeout or gateway and returns raw upstream errors
- 🟡 Capsid MCP: no insufficient_scope step-up; no shared audience check; own scope.ts; PRM lists read only; own routine guard; no conformance; KV capsid-oauth not capsid-mcp-oauth
- 🟡 Foxhound admin MCP: own scope names; no Host check; no conformance; read grant sees write tools
- 🟡 Dustin Edwards admin MCP: PRM lists read only; no shared audience check; raw error text; no rate-limit row; site-runtime v0.54.0; /health has no sha; conformance not in CI; KV titled OAUTH_KV
- 🟡 Carrel MCP: own scope names; write ticked by default; own agent keys; read grant sees write tools
- 🟡 Foxing admin MCP: site-runtime v0.50.1; raw error text; three destructive tools unconfirmed; offset paging; no conformance

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
