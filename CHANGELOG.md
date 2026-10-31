# Changelog

## Unreleased

- `devkit-live`: an area's `unchecked` names what its checks cannot reach; the board lists each one and the job is not finished while any remain. Area 10 runs `prelum-chart-audit --strict-frame`, gives Foxhound its three demo routes through `site_args` (`--start`, `--pages`, from Prelum v0.25.0), and lists the Capsid Portal, Foxing's /stats, /year and /goals and Carrel desk as unchecked (signed-in only).

## 0.20.19 (2026-10-31)

- `access-drift.yml`: the reusable daily Access drift check (area 3, I2), replacing the three hand-written copies on Foxing, Foxhound and txasm. It runs site-runtime's `site-runtime-access-drift` at the caller's `site-runtime-ref` (v0.59.0 or later) against the site's own hashed admin list (`--admins-url`, site-runtime's `adminListResponse`, read with an Access service token), so ADMIN_EMAILS is never copied into GitHub. A missing secret fails the job and names it; it never skips. The caller is `examples/access-drift-caller.yml`.
- Area 3 on the scoreboard checks kind `app` too (`live/areas.json`), so the daily run probes Carrel Desk's and Capsid Portal's Access gates; before, it skipped them.

## 0.20.18 (2026-10-31)

- `devkit-shared` fails a site-runtime pin behind a minor that has been out three days or more (`FRESH` in `bin/shared.mjs`); a pin behind a younger release is the usual warning. site-runtime releases many minors a day, so the grace window is time, not a count of minors, and a fresh release never turns a site red. The release dates come from the GitHub releases API (one to three requests, with the run's token in `shared.yml`); when they cannot be read the rule is a warning that says so, never a silent pass.
- The scoreboard grades Capsid Portal and Carrel Desk (`live/sites.json`, kind `app`: a signed-in app behind Access, which only the checks that name `app` grade). Area 2 runs `site-runtime-security` against both, and reads `signed-in-security`, the signed-in crawl Capsid's Worker runs and publishes at https://mcp.dustinedwards.info/reports/signed-in-security.json, since the Access credential it needs never goes to GitHub.

## 0.20.17 (2026-10-31)

- `devkit-a11y`: the live accessibility check, and area 9's check on the scoreboard (`live/areas.json`; the two MCP endpoints are skipped, having no public pages). It scans a site's home page, a 404 and up to eight sitemap pages of different types in Chromium with axe-core, a Tab walk, Escape on the menus and dialogs it reaches, reflow at 320 px, text spacing, a 720 px proxy for 200% zoom, reduced motion, axe and focus again in forced colors, and the page structure, and checks for an `/accessibility` statement; each finding is titled with the checklist item it proves (L1 to L4, S2, S3, S6), WCAG failures as errors and axe best practice as warnings. Playwright and `@axe-core/playwright` come from where it runs, so the package still installs no dependencies; `live.yml` installs them and Chromium before the checks. The scoreboard runs it from devkit's newest release tag, so area 9 reads "no devkit-a11y bin yet" until the release that carries it.

## 0.20.16 (2026-10-31)

- `devkit-migrations <dir> --apply <database>`: applies a deploy's pending D1 migrations, so no site needs a hand-run step before a merge. Migrations that only add are applied after the D1 Time Travel bookmark is read and its restore command written to the log and the step summary; one that drops, renames, deletes rows or says `-- contract:` is refused with the hand-run command. An unreadable list or bookmark, a failed apply, or a database still behind afterwards exits 1 before the deploy.

## 0.20.15 (2026-10-31)

- `worker-deploy.yml` takes a gradual rollout, opt-in (`gradual-percent`, `gradual-minutes`): it uploads a version, splits traffic with the live one, gates the new version through a version override, and promotes it or rolls back to the old one by id. And a preview per pull request, opt-in (`preview`, `preview-build`): `wrangler versions upload --preview-alias pr-<number>` on a pull request from the same repository, its URL in the summary and the `preview-url` output. Both off by default, so a caller that changes nothing deploys as before.
- `docs/runbook.md`: the one runbook for every site (area 8, R3, I1, I2, B9): site down, database down, bad deploy, stale backup, lost data (D1 Time Travel with the exact commands, a dump restore, files from R2 with d1-dump's `restoreFiles`), each site's RPO and RTO, and the incident record format. Sites link to it.

## 0.20.14 (2026-10-31)

- The scoreboard runs area 8's deployed-commit (H4) and restore-drill (R1) checks daily. A check in `live/areas.json` takes `site_args`, arguments for one site keyed by its id, after `args`; area 8 gives Foxhound, Foxing, germomics, julieedwards.info, TXASM, Carrel's MCP Worker and dustinedwards.info `--repo DrDustinEdwards/<repo> --drill-workflow restore-drill.yml`. `devkit-live lint` refuses site_args for an unknown site or that are not a list of strings.
- `devkit-console` (bin/console.mjs): the console ratchet. It counts the raw `console.*` calls in server code, outside comments and strings, against the baseline in `.console.json`, and fails when the count rises, naming each file above its own count; `--write-baseline` records it.
- `devkit-migrations <dir>` (bin/migrations.mjs): the expand-only migration check, moved from dustinedwards.info's `scripts/check-migrations.mjs` and given the directory as an argument. Each migration's sha256 is recorded in `<dir>/manifest.json` (dustinedwards.info's manifest reads as it is); an edited, unrecorded, renamed or deleted migration fails, and so does a new one that drops or renames a table or column without a `-- contract: <reason>` line. With a local wrangler database it also compares the `d1_migrations` ledger with the files.

## 0.20.13 (2026-10-31)

- `devkit-route-weight` weighs what a page on an opt-in hydration site downloads. When the client build has a /site.js (devkit's siteScript), a route whose chain declares `handle = { hydrate: true }` weighs the client entry and its chain as before. Any other route weighs /site.js and its stylesheets, because it loads no React. Before this, every route counted the full React bundle, so a public page that started loading React again would still pass a budget set for the app pages. txasm's public pages now weigh about 35 KB, where they weighed about 157 KB.
- The network check counts site-runtime's `./static-site` as receiving CSP reports: `staticSite` answers the report path itself, so a static site on it no longer imports `./csp-report`.

## 0.20.12 (2026-10-31)

- The shared-code check's `headers` feature accepts site-runtime's `withMcpHeaders` (./mcp-server), which sets an MCP door's whole header set, so a door that adopted it no longer fails "has no headers".

## 0.20.11 (2026-10-31)

- `code-map.yml` maps a repository on TypeScript 7. The native compiler ships no JavaScript compiler API, so d1-dump's map failed with "ts.getParsedCommandLineOfConfigFile is not a function" after Renovate moved it to 7.0.2. The map job now installs TypeScript 6.0.3 beside the script when the caller's own has no compiler API, and `loadTypeScript` skips a TypeScript without it.

## 0.20.10 (2026-10-31)

- `devkit-warm <origin> [--sha <commit>]` (bin/warm.mjs): warms the stored pages after a deploy for a site that deploys outside `worker-deploy.yml` (dustinedwards.info's `ship`, Workers Builds). It is the shared deploy's "Warm the stored pages" loop: every sitemap page on the origin, an index followed one level, at most 1000, four at a time. `--sha` first waits up to 10 minutes for `/health` to name that commit. It never fails; a warm that cannot finish is a warning.

## 0.20.9 (2026-10-31)

- `bin/family.mjs` is back as a shim that runs the shared-code check. An old `family.yml` (v0.18.0 on a branch Foxhound had open) checks out devkit's default branch and runs that path, and failed with "Cannot find module" once 0.20.8 renamed it. It stays until 0.21.0.

## 0.20.8 (2026-10-31)

- The family check is now the shared-code check: `devkit-shared` (bin/shared.mjs), `shared.yml` (job "Uses the shared code") and `.shared.json`. `devkit-family`, `family.yml` and `.family.json` still work, with a warning to rename, and are removed in 0.21.0.

## 0.20.7 (2026-10-31)

- `devkit-family`: a local copy found by its name (a definition named like a shared export) is a warning until 0.21.0, like the copies found by their text. Names are read from each package's newest release, so a new export such as site-api's `readEmbedded` turned every repository defining one red on its next push, before any of them could move.

## 0.20.6 (2026-10-31)

- `devkit-ops-audit` asks for an HTML 404 (N6) only where the home page is HTML, so an API or MCP Worker that serves no pages (Carrel's AI door) answers its 404 in its own type. The plain line says when N6 was not asked.

## 0.20.5 (2026-10-31)

- `devkit-family`: a pin behind its package's newest release is a warning, on every branch. Renovate opens that bump, and failing on it turned every repository's family check red, and mailed the owner, each time a shared package released. A pin to a raw commit still fails.
- `dependencies.yml` on a push or a schedule lists the known vulnerabilities as warnings and in the job summary, without failing. A pull request still fails on a vulnerability it adds.

## 0.20.4 (2026-10-31)

- `worker-deploy.yml` reads the D1 Time Travel bookmark outside the checkout, so wrangler finds the database by name through the API. In 0.20.1 to 0.20.3 it read the caller's `wrangler.jsonc`, whose id the pre-deploy guard had not written yet, and Carrel's deploy stopped there.

## 0.20.3 (2026-10-31)

- `dependencies.yml` reads OSV-Scanner's exit code under the runner's `bash -e`: in 0.20.2, exit 1 (vulnerabilities found) stopped the step before the base comparison, so a pull request failed on old advisories it did not add (prelum #128).

## 0.20.2 (2026-10-31)

- The tool downloads in `workflow-audit.yml` and `dependencies.yml` retry three times, so one dropped connection (a TLS reset fetching zizmor from PyPI) no longer fails the check.
- `release-self.yml` no longer starts `bump-consumers.yml`: that needed a `RENOVATE_TRIGGER_TOKEN` secret in devkit, and Renovate finds a devkit tag on its regular runs.
- `devkit-live` reported checks: a check that needs a site's secrets runs where they live and publishes its result on its own https origin (`"report"` in `areas.json` in place of `repo` and `bin`); the daily run reads it, and a stale, unreadable or incomplete report is an error, never a pass. No site key goes into GitHub.

## 0.20.1 (2026-10-31)

- Area 6 (images and media) runs site-runtime's `site-runtime-images` (site-runtime 0.43.0) on sites and static sites: srcset, sizes and dimensions, AVIF and WebP, one priority image, oversized files, `/media` caching, alt text, share-card size and tags, image sitemaps, GPS left in published files, and captions on video and audio (A2 to A5, A7, A12, B1, B2, C1 to C3, C8, D2, E1 to E3).
- `devkit-no-bloat` counts the tests and gates them like Knip and jscpd: the test files (`tests.files`, default `**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}`) and the `test(` and `it(` cases in them (node:test, vitest, Playwright), read from the source without running anything. A rise fails, so a pull request that adds a test raises the baseline (`--write-baseline`) in the same reviewed diff. A repository with no `tests` entry in its baseline gets a row and no failure until it records one.
- `devkit-no-bloat` records the share of source lines that are comment lines (`comments`: JS, TS and CSS, minified files and `worker-configuration.d.ts` left out). A rise of more than `comments.tolerance` points (default 1) with more comment lines than the baseline is a warning; `"comments": { "fail": true }` makes it a failure.
- `devkit-no-bloat --lines-from <rev>`: the lines added and removed since the merge base with `<rev>`, as code, tests, comments, docs and other, in the job summary. `no-bloat.yml` passes it on a pull request (its checkout fetches two commits there) and posts nothing.
- `devkit-no-bloat` gates jscpd's duplicated lines (`jscpd.lines` in the baseline) beside its clones. The percentage is shown and not gated, as before; the README said it was. It fails, instead of passing, on Knip output with no heading it reads, a jscpd run that read no files, and a baseline entry that no run in the config measures (a removed `knip` run, or `"jscpd": false` with a jscpd baseline).
- `devkit-check-trailers` checks a `merge_group` event (its base and head from `GITHUB_EVENT_PATH`, authors included) and fails with exit 2 on an event it does not know, where before any event but push and pull_request passed. Schedule, `workflow_dispatch` and `repository_dispatch` still pass.
- `workflow-audit.yml`, a reusable workflow: actionlint (with shellcheck) and zizmor on the caller's workflows, failing on any actionlint finding and on any zizmor finding at `min-severity` (default `medium`) or above, as annotations. actionlint 1.7.12, shellcheck 0.11.0 and zizmor 1.31.1 are release files checked against their sha256. Exceptions live in `.github/actionlint.yaml` and `.github/zizmor.yml`. devkit's CI runs it on devkit (`examples/workflow-audit-caller.yml`).
- `dependencies.yml`, a reusable workflow: OSV-Scanner 2.7.0 over every lockfile. On a pull request or a merge queue entry it fails on a vulnerability the change adds (it scans the base commit too); on a push or a schedule it fails on any known vulnerability. Exceptions go in a root `osv-scanner.toml`. It needs no repository setting, unlike GitHub's dependency review. devkit's CI runs it on devkit (`examples/dependencies-caller.yml`).
- `family.yml` checks devkit out at the commit the caller pinned. It read `github.job_workflow_sha`, which GitHub does not define, so the ref was empty and every caller ran devkit's default branch (a prelum run pinned to 64997ae checked out main at 03c51ee); it now reads `job.workflow_sha` and fails if that is ever empty.
- `no-bloat.yml`, `worker-deploy.yml` and `live.yml` pass shellcheck: a quoted optional `--warn-only`, `_` for the unused loop counters, and `find` for the old runs.
- `release.yml`, a reusable workflow: merging a version bump to the default branch tags `v<version>` and publishes the GitHub release with that version's CHANGELOG section, as site-runtime and Capsomer already did by hand-copied jobs. devkit releases itself with it (`release-self.yml`), so a devkit change no longer waits for a hand-made tag (#62 merged and sat untagged). Package repositories call it with `examples/release-caller.yml`.
- `devkit-family` rules flip by release: each rule names the devkit version it fails from (`failsFrom`), compared with devkit's own `package.json` version, so releasing that version is the flip. The 0.18.0 warnings (the JSON-LD, head tag, hex, base64url, compare, Turnstile, `ACCESS_DEV_BYPASS`, theme script and `"Oops!"` fingerprints, the `_headers` security set and the body-checked aliases) were promised to fail from 0.19.0, but 0.19.0 and 0.20.0 still shipped them as warnings and seven repositories still hold copies, so they fail from 0.21.0, with the rules below.
- `devkit-family` finds a devkit workflow a repository's kinds need and none of its workflows call: `ai-author`, `pr-footer`, `family`, `workflow-audit` and `dependencies` everywhere; `worker-size` (and `worker-deploy`, a lasting warning while Workers deploy other ways) for an app of kind `site`, `private` or `worker` with a wrangler config; `no-bloat` in a public repository with JavaScript or TypeScript (public from the Actions event; locally a warning); `bump-consumers` in a shared package. CI running the bin itself (carrel's `devkit-no-bloat`, devkit's own `node bin/family.mjs`), directly or through a package script, counts. `.family.json` `"waive": { "workflow:<name>": "why" }` waives one. A repository with several apps needs the union of their kinds'.
- `devkit-family` judges the `devkit:` input a repository passes `ai-author.yml` against devkit's newest tag (astro, site-api, d1-dump, site-runtime, prelum and Foxing pass `DrDustinEdwards/devkit#v0.11.0`).
- `devkit-family` reads test files for one rule, `fakes`: a GitHub API fake of contents or git data routes behind a fetch stub, an Access key pair with the key set it serves, a fetch that refuses every URL, or a list of `DELETE FROM`s (three close together, or one in a loop), each naming devkit's `./github`, `./access`, `./network` or `./d1`. Today: Capsid 30 (5 GitHub, 2 Access, 23 table lists), germomics 8, dustinedwards.info 1, Foxing 1, Foxhound none, and d1-dump 1, a test that empties its database on purpose (a `copies` waiver). `.family.json` `"copies"` waives a file.
- `devkit-family` stops (exit 2) on an unknown `.family.json` key (a typo'd `"wave"` waived nothing) or kind (`"sitee"`), naming the valid ones, and on a `--from` directory missing one of the packages. Locally, a package not in `node_modules` is named in a warning instead of silently turning off the copies (and, for Capsomer, the tokens) it would have checked.
- `devkit-family` names each exception in `.family.json` that excused nothing in the run (`copies`, `waive`, `libraries`, `tokens`, `spelling.ignore`, `spelling.contracts`), as a warning, once every package was read: Foxing's and germomics' `cacheKey` copies, Foxhound's `jose`, Carrel's three `kindOf` copies (renamed since), Capsomer's `email.ts` (its own export), dustinedwards.info's `llms`, and a contract each in Capsid and Foxing that the built-in one or another contract already covers.
- `devkit-family` runs in a repository with no root `package.json` (capsid-bench) instead of stopping, and a library with `exports` or a `bin` and no kind in `.family.json` is told to say `"apps": { ".": "package" }`.
- `devkit-family`'s feed-link warning no longer counts an alternate link that is only in a comment.
- devkit mutation-tests its own checks once a week: `code-map-self.yml` runs `node stryker.config.mjs` on a schedule (and on a manual run), which runs Stryker 10.1.1 once per module in `bin/` and `scripts/` against that module's own test file and fails a module below its bar (`thresholds.break`, the score each reached: 72% for `family.mjs`, 86% for `no-bloat.mjs`). The reports feed devkit's own code map. One run of the whole suite per mutant would take hours (worker-deploy's polls), so each module runs alone. `knip.json` names the config as an entry.
- Every claim a check makes now has a planted mistake that fails it and a clean case that passes: the twelve `devkit-family` fingerprints that never fired in a test (`<urlset`, `<rss`, an IndexNow POST, `Contact: mailto:`, `og:`, `Strict-Transport-Security`, a Twitter card, base64url, Turnstile's siteverify, `ACCESS_DEV_BYPASS`, the theme script, `"Oops!"`), a shared package skipping its own, a devkit workflow and a `git+https` or `enarratio` version pin behind the newest tag, library look-alikes (`rss-parser`, `node-jose`), the accessibility and feed-link warnings, `createSiteApi` without IndexNow and with `indexNowHook`, the spelling check through a stand-in codespell (skip, ignore, contracts, `--fix-spelling`, a codespell that fails), the bin's `list`, `--from` and local runs; `devkit-worker-size` over its raw budget, a failed dry run, no Total Upload line, MiB sizes, `args`, `--config` and a budget that is not JSON or not numbers; `devkit-route-weight`'s budget and growth warnings and its three failures; `devkit-mutation-report`, which had no test; `devkit-no-bloat`'s Knip run that fails, `--config`, the line counts of a diff (renames, new and deleted files, quoted paths) and the scanner's regex and template cases; and `devkit-conformance` end to end against stand-ins for wrangler and the suite.
- Test fakes match the real services. `./github`: tree and commit shas are 40 hex digits; a ref update that is not a fast forward answers 422 unless `force`; blob, tree and commit writes answer 201; `GET git/commits/:sha` answers the commit asked for; `base_tree`, `?ref=`, a base64 blob and a `Request`'s method, headers and body are honored; contents base64 is wrapped as GitHub wraps it; `token` makes the repository private (404 without it, 401 with another). A tree without `base_tree`, or a commit without `message` and `tree`, now means what it means on GitHub. `./access`: `token()` carries Cloudflare's application-token claims (`aud` an array, `nbf`, `type`, `identity_nonce`, `sub`, `country`); the JWKS serves two keys with `public_cert` and `public_certs`, kids are 64 hex digits and `rotate()` moves to a new key; the token endpoint checks `grant_type`, `redirect_uri` and the PKCE verifier, and answers `access_token` and `expires_in` too. A test that compared `aud` to a string from `token()`, or relied on the kid `stub-kid`, changes with it.
- `test/testing-contract.test.mjs` and `npm run contract`: the fakes checked against GitHub's OpenAPI description and Cloudflare's documented token and certs.

## 0.20.0 (2026-10-31)

- `devkit-ops-audit`, area 8's scoreboard check (running and recovery), on the scoreboard's contract (`--origin`, `--from`, one annotation per finding titled with its checklist item, exit 0, 1 or 2). It reads a site's `/health` for its headers (H1), site-runtime's new shape `{ status, ok, time, checks, sha?, backup? }` (H2; the old shape, with no `status`, is an error naming what it lacks), a status code that agrees with `status` (H3), a deployed `sha` (H4, and with `--repo` the branch head, a warning for the first 30 minutes), a backup under 26 hours old (B1) and the `cron` check (C2, a warning); a missing page for an HTML 404 (N1, N6); and with `--drill-workflow`, a passing restore drill under 8 days old (R1). dustinedwards.info serves `/api/health` and passes `--health-path /api/health`; there is no silent fallback. On the live sites today: germomics and Foxing lack `status`, `checks` and `sha`; Capsid's MCP Worker sends `status: "ok"`, no `no-store` or `noindex`, a 38-hour-old backup and a plain-text 404.
- `restore-drill.yml`, the weekly restore drill every site with a D1 database calls (`examples/restore-drill-caller.yml`): d1-dump's `drill --bucket` downloads the newest complete dump through the R2 REST API and restores it into SQLite. The caller pins d1-dump with `d1-dump-ref`, which has no default.
- `worker-deploy.yml` takes `d1-database`: before the pre-deploy guard, where callers run migrations, the deploy job reads the database's Time Travel bookmark (`wrangler d1 time-travel info --json`, with the pinned wrangler) and writes it, its time and `npx wrangler d1 time-travel restore <db> --bookmark=<bookmark>` to the step summary and the workflow outputs `d1-bookmark` and `d1-bookmark-time`, so a bad migration is one command to undo. Cloudflare's rollback never undoes one. A bookmark it cannot read stops the deploy before the migration.


## 0.19.0 (2026-10-31)

- `devkit-live` and `live.yml`: the completeness scoreboard. Every day each area's live check (`live/areas.json`) runs against every live site (`live/sites.json`), and the board is rebuilt from the runs and the verifiers' verdicts (`live/verdicts/`) on the `scoreboard` branch: https://github.com/DrDustinEdwards/devkit/blob/scoreboard/SCOREBOARD.md. A cell is complete only when its checks pass, a verifier who is not the builder signed it with evidence, and no run since has failed; `devkit-live lint` in CI refuses a verdict signed by its builder or marked complete without evidence. Area 1 starts with Prelum's `prelum-audit`; each area adds its check with one entry. Lines added and removed per area come from the merged pull requests labeled `completeness-area-<n>`.
- Area 3 (sign-in and access) runs site-runtime's `site-runtime-sign-in` (site-runtime 0.38.0) on sites and Workers; julieedwards-info and bsw are skipped, with no sign-in, admin pages or MCP server.
- Area 7 (speed and caching) runs site-runtime's `site-runtime-speed`, with `--kind static` for static sites through a check's new `args`. `live.yml` passes the `PSI_API_KEY` secret to the checks for PageSpeed Insights.
- `devkit-route-weight`: `"enforce": true` in `.route-weight.json` makes a route over its budget or grown past its baseline an error that fails the run, and requires a `budget_bytes`.
- `worker-deploy.yml`: after the live gate passes, every page in the sitemap at the health route's origin is fetched once, so the first reader after a deploy gets a stored page, not a cold render. Never fails the deploy.

## 0.18.0 (2026-10-30)

- `devkit-family` no longer counts a local named `cacheKey` as a copy of site-runtime 0.33.0's `./edge-cache` `cacheKey`. It is a common variable name (a `new Request(...)`, a KV key), so the name alone said nothing; Foxing had five and germomics one.
- `devkit-family` finds a Google Fonts stylesheet a page links (`href: "https://fonts.googleapis.com/css...` or a CSS `@import url(...)` of one): a render-blocking request to a second origin, then the files from a third. A site self-hosts: `capsomer/fonts.css` for the family's faces, Fontsource for its own (txasm, Foxing and bsw moved, with the same files, pixel for pixel). A server fetching a face, as site-runtime `./share-card` `googleFont` does, passes.
- `devkit-family` fails a React Router app whose `_headers` does not give its hashed build files a year: `/assets/*`, and `/islands/*` when it uses devkit `./islands`, need `Cache-Control: public, max-age=31536000, immutable`. Without the rule Workers Assets sends them with `max-age=0, must-revalidate`, so every page load revalidates every file (dustinedwards.info measured 14 such requests on one load, median 689 ms each); txasm, julieedwards-info, germomics, foxing and Carrel had no rule. `.family.json` `"waive": { "assetCache": "why" }` waives it.
- Renovate preset: third-party updates open any time on Monday (Chicago) instead of only before 6am, and the weekly minor and patch group gets `prPriority` 4. The six-hour window had too few Renovate runs, the family packages took the PR slots in each one, and the weekly group never opened (React 19.3.1 and Vite 8.3.5 waited in every site).
- Renovate preset: React Router opens at any time with `prPriority` 5 instead of waiting for the Monday window. Family package updates, which run at any time with priority 10, held all three PR slots every Monday, so React Router fell behind in every site (txasm on 8.0.0, four sites on 8.3.1). The three-day cooldown still applies. The preset is read from `main`, so this reaches every repo on merge.
- `devkit-family` finds more local copies, as warnings in this release and failures from 0.19.0, so the sites can move first (`::warning::` lines, exit 0; a file that must keep one is waived in `.family.json` `"copies"`): JSON-LD by hand (`application/ld+json` filled by `JSON.stringify`, or a literal `"@context": "https://schema.org"`; Prelum `./schema`), a hand Twitter card or canonical link (Prelum `./head`; a Link header's `rel="canonical"` passes), a bytes-to-hex loop (`toString(16).padStart(2, "0")` ... `join("")` in a file that holds bytes; site-runtime `./encoding` `toHex`, `sha256Hex`), base64url by hand (`btoa(` then `.replace(/\+/g`; `base64url`), an XOR compare loop (`|= a.charCodeAt(i) ^ ...`; `./compare` `safeEqual`), Turnstile's siteverify URL and `ACCESS_DEV_BYPASS` outside site-runtime, a pre-paint theme script (`localStorage.getItem(` then `setAttribute("data-theme"`; Capsomer `themeScript`), React Router's template ErrorBoundary (`"Oops!"`), and a security header set written into a static `_headers` file (bsw's and Foxhound's). New aliases, also warnings: `sha256Of`, `hashToken`, `hashMcpToken`, `hashRecipient` (`sha256Hex`), `generateSlug`, `slugOf` (`slugify`), `esc`, `attr` (`escapeHtml`), `hex` (`toHex`) and `b64` (`toBase64`), each only when its body does that job, so a Markdown `esc` or a path's `slugOf` passes.
- `devkit-family` features: a site that calls `createSiteApi` needs site-api's `indexNowHook` (or `prelum-indexnow`); its own `onPageChange` submission, or none, fails (txasm, julieedwards-info and foxing today). `capsomer` needs `capsomer/base.css`, not just any Capsomer file (Capsid's dashboard today). Three new warnings, each waived by name in `"waive"`: `a11y` (no `capsomer/testing` or axe-core in any test or check script), `noindex` (an admin, login, signin or console route with no noindex in a file that names it) and `feedLink` (a feed with no `rel="alternate"` link to it).
- `devkit-family` counts Prelum 0.18's `aiTxtResponse` as the site's `/ai.txt`; before, only the word `aiTxt` passed, so a site that moved to the helper failed with "site has no aiTxt".
- `devkit-family list` (SHARED.md) lists what each Capsomer behavior exports (`./behavior/time`: `relative`, `day`...), so a site about to write its own finds it.

## 0.17.0 (2026-10-29)

- Islands are named by their content in a build: `/islands/<name>-<hash>.js`, like the chunks beside them, so a site can serve `/islands/*` with `Cache-Control: immutable`. The built `/site.js` carries the name to URL map and `startIslands()`'s default `load` reads it; `vite dev`, and a page bundled without siteScript, still load `/islands/<name>.js`. Breaking for a site whose own `load` reads `/islands/<name>.js` from a build: it imports `ISLAND_URLS` instead.
- `virtual:islands`, for a server-rendered app: `ISLAND_URLS` (name to URL, the plain name in `vite dev`) and `ISLAND_GZIP_BYTES` (the gzip -9 bytes of an island and the chunks it imports, each once: what a page that loads only that island downloads; dustinedwards.info's "N kB gzipped"). The client build and the server build share one islands build, so their URLs agree.
- `siteScript({ entry: false })`: islands only, no `/site.js`, for an app with its own client script (a React Router site).
- `devkit-family` finds three more local copies by their text: speculation rules of a site's own (an inline `type="speculationrules"`, the rules' media type or a `Speculation-Rules` header; site-runtime `./prefetch`), Cloudflare Images called directly (`IMAGES.input(` or an `.input(...).transform(` chain; site-runtime `./image`), and an island loader of its own (`querySelectorAll("[data-island...")` or `import("/islands/...")`; devkit `./islands`). A file that must keep one is waived in `.family.json` `"copies"`, with the reason.

## 0.16.1 (2026-10-29)

- `siteScript` builds every island in one Vite build instead of one per island, so code two islands share is emitted once, as a chunk under `/islands/chunks/` that both import (same-origin, so `script-src 'self'` still covers it), and a production build runs two builds instead of one per island plus one. Each island stays at `/islands/<name>.js` with its default export; `vite dev` still serves each island whole.

## 0.16.0 (2026-10-29)

- Islands, from Astro: `siteScript` bundles each file in `app/islands/` into its own module at `/islands/<name>.js`, and `@dustinedwards/devkit/islands` `startIslands()` loads one only when its element asks (`data-client` load, idle, visible or media), so a page pays only for the scripts it uses. Directives are Astro's, with its MIT notice.
- Astro's dev toolbar, `@dustinedwards/devkit/vite/dev-toolbar`, in `vite dev` only: Inspect (islands), Audit (axe-core accessibility plus Astro's performance rules) and Settings. siteScript adds it to the dev `/site.js`; `toolbar: false` turns it off. Nothing of it reaches a build.

## 0.15.0 (2026-10-28)

- The family check's `tokens` check also fails a site that loads its own files for the family's faces (an `@fontsource` Schibsted Grotesk or Martian Mono file, or an `@font-face` for either) instead of `capsomer/fonts.css` (Dustin, 2026-10-28: sites had each picked their own weights, and the footer's bold name was drawn differently from site to site). `.family.json` `"tokens": { "fonts": "why" }` waives it.

## 0.14.0 (2026-10-28)

- `devkit-family` fails a site that sets its own value for one of Capsomer's tokens for the whole page (`:root`, `html` or `body`), such as `--page-max`, `--radius-m` or `--text`, in CSS or in CSS inside a source file. A value the family shares is set once, in Capsomer, and a site's own look goes in Capsomer's site layer (Dustin, 2026-10-28: every site had kept its own page width, and the letterhead followed each one). Reading a token, and setting one for one part of a page, pass. `.family.json` `"tokens"` names a token a repository sets itself, with the reason.

## 0.13.3 (2026-10-26)

- `no-bloat.yml` takes `package-manager: pnpm`, as `worker-size.yml` does, so a pnpm repository (Foxing) calls it instead of keeping its own workflow.

## 0.13.2 (2026-10-26)

- `family.yml` turns off setup-node's automatic package-manager cache, which failed the check in a pnpm repository (Foxing) because the runner has no pnpm. `ai-author.yml` already did.

## 0.13.1 (2026-10-25)

- `devkit-family` fails a month before security.txt lapses: a fixed `SECURITY_TXT_EXPIRES` is the prompt to confirm the address still delivers and move the date on. It replaces dustinedwards.info's own test of it.
- `--fix-spelling` rewrites what the check finds, inside camelCase and CONSTANT_CASE names too (not in a shared package, whose exports are renamed by hand), keeps each word's case and never touches a contract. It replaces codespell's own write mode, which changed every copy of a word on a line, protected ones included, and missed a word next to a hyphen or an apostrophe.
- Lockfiles in subdirectories (an MCP Worker's own) are skipped by the spelling check, as the root one was.
- `bytesToBase64` and `base64ToBytes` are known local names for site-runtime's `toBase64` and `fromBase64`.
- A shared package's peer dependency (Prelum's render packs) passes the libraries check, `.family.json` `"spelling"."contracts"` keeps a stored value's spelling while the prose around it is fixed, and ARIA's `labelledBy` is not British spelling.

## 0.13.0 (2026-10-25)

- `devkit-family` bin, the family check every site and package runs in CI. It fails on a shared package or devkit workflow pinned behind its newest release tag or to a raw commit; a local definition named like a shared export (or a known alias, such as `themeFromRequest` for Capsomer's `readThemeCookie`); text only a shared builder writes (`User-agent:`, `<urlset`, an IndexNow POST, `Contact: mailto:`); a direct dependency on a library a shared package wraps (marked, remark, mermaid, sanitize-html, jose...); a family feature missing for the app's kind (robots.txt, ai.txt, sitemap, llms.txt, head tags, JSON-LD, the TDM header, IndexNow, security.txt, security headers, CSP and its reports, /health, Capsomer, and the nightly dump for a D1 database); and British spelling (codespell's en-GB to en-US list). Exceptions live in `.family.json`, each with its reason. `devkit-family list` writes the list of every shared export. A repository runs it with the new reusable `family.yml` (`examples/family-caller.yml`), with nothing to install.
- `shared-list.yml`: every hour, SHARED.md from the newest release of each shared package, on the `shared-list` branch.

## 0.12.0 (2026-10-24)

- `@dustinedwards/devkit/vite/site-script`: `siteScript({ entry })`, the Vite plugin that bundles a site's one browser module into /site.js, so the site ships no framework to the browser. It replaces the copies in julieedwards-info's and bsw's `vite.config.ts`.

## 0.11.0 (2026-10-23)

- `devkit-mutation-report` bin: the StrykerJS summary from foxhound's and germomics' `scripts/report-mutation.mjs` (score, kill matrix, pruning candidates, `--table`, `--json <file>`). Each repository's keep rule is its `--protected` regex.

## 0.10.0 (2026-10-23)

- `devkit-no-bloat --warn-only`, and `warn-only` on `no-bloat.yml`: the same report with every error a warning and exit 0. It replaces the warn-only reports in carrel (`scripts/check-bloat.mjs`, `scripts/lib/bloat.mjs`) and txasm's hand-written `no-bloat.yml`.
- `devkit-conformance` bin: the MCP conformance gate from carrel's and dustinedwards-info's `check-conformance.mjs`, with the entries, ports, scenarios and baselines in `.conformance.json`. Where the two differed it takes the stricter check: `registration_endpoint` must be exactly `<origin>/register`, an allowlisted registration must answer 201 with a `client_id` and no token, the refusal must be 400 `invalid_redirect_uri`, and `/mcp` without a token must answer 401 with `resource_metadata` (carrel's check; `auth.resourceMetadata: false` waives it for dustinedwards-info's MCP, whose challenge does not carry it today). An `after` module keeps a site's own checks (dustinedwards-info's security headers).
- `devkit-bootstrap` bin: the postinstall from carrel's and dustinedwards-info's `bootstrap-config.mjs`, dustinedwards-info's `wrangler-types.mjs` and germomics' `run-wrangler-types.mjs`: copy each missing `wrangler*.jsonc.example`, then `wrangler types` with stdin detached. `--check` replaces each repository's `check-postinstall.mjs` scan for a bare `wrangler types`; the stdin proof is tested here once.

## 0.9.0 (2026-10-23)

- `devkit-route-weight` bin: gzip JS and CSS per route for a first visit, from a React Router client build's manifest, each file counted once. Warn-only, with an optional per-route budget and a baseline that warns on growth past a ratio and a byte floor (`.route-weight.json`); a missing build fails. It replaces the route weight scripts in dustinedwards-info, txasm, foxing, foxhound, carrel and germomics.

## 0.8.0 (2026-10-23)

- Renovate preset: `platformAutomerge` is false. The new "Protect main" rulesets require a pull request and no status check, so GitHub's native auto-merge would merge before CI. Renovate's own automerge waits for green checks.
- `worker-size.yml` takes `package-manager: pnpm` (pnpm set up from the caller's packageManager field, its store cached, `pnpm install --frozen-lockfile` by default) and finds the devkit bin in the Worker's own directory before the root.
- `code-map.yml` is two jobs: `map` runs the caller's install, tests and Stryker with `contents: read` and hands the files over as an artifact; `publish` holds the write and runs none of the caller's code. A `code-map` branch that exists but cannot be read now fails the run instead of being overwritten without its `mutation.json`.
- `devkit-no-bloat`: a tool that cannot run fails the run (it was a warning).
- `resetDb` (`./d1`) leaves only real FTS shadow tables to their virtual table; a real table named `<fts>_something` is cleared.
- `stubGitHub` (`./github`) lists a directory's immediate children, a nested folder as `type: "dir"`; `versionOf` rejects a path the stub does not hold.
- `worker-deploy.yml` never deploys on `pull_request_target`, and `devkit-check-trailers` checks that event's commits like a pull request's. Wrangler pin 4.107.0 to 4.149.0.
- `scripts/check-callers.mjs` reads through quotes around `uses:` and `secrets: inherit`.
- `bump-consumers.yml` fails a repository whose file tree came back truncated, and warns on a `package.json` that is not JSON.

## 0.7.0 (2026-10-21)

- `devkit-worker-size` bin and `.github/workflows/worker-size.yml`: the Worker bundle size budget. `wrangler deploy --dry-run`'s Total Upload (raw and gzip) against the caller's `.worker-size.json`; over budget fails. `examples/worker-size-caller.yml` is the shape of a caller.
- `devkit-no-bloat` and `no-bloat.yml` are now a ratchet: a Knip or jscpd count above the baseline fails the run, a count that went down passes and says how to lower the baseline, and a config that is not JSON fails. The workflow no longer continues on error.
- Removed `improve-score.yml`, `examples/improve-score-caller.yml` and their test: the improve loop is gone and no repository calls it.
- `code-map.yml`: a `mutation-artifacts` input for a caller whose Stryker run is a matrix of jobs (capsid, dustinedwards-info). It calls the map as its last job, naming the artifacts that hold the reports; they are downloaded from that run alone, and `mutation-file` names them under `mutation-artifacts/`.
- `.github/workflows/code-map-self.yml`: devkit maps its own `scripts/`, `bin/` and `testing/` after each push to main, with this commit's `code-map.yml`.
- `code-map.yml`: a `.mjs` that ships a hand-written `.d.mts` beside it (prelum) is mapped as the source; the compiler lists only the declaration.
- `code-map.yml`: an `npm-cache` input, false for a repository with no `package-lock.json` (site-runtime, claude-skills), which setup-node otherwise refuses.
- `code-map.yml`: JavaScript repositories. It maps .js and .mjs modules as well as TypeScript, never a `*.test.*` or `*.spec.*` file; reads a repository with no tsconfig as plain modules; takes lcov coverage from `node --test`; and `include` and the new `exclude` take several prefixes, `.` meaning every folder.
- `code-map.yml`: a weekly mutation run (design slice 10). With `mutation-command` set, the run's Stryker reports (`mutation-file` may be a glob) are kept as `mutation.json` on the `code-map` branch; every other run reuses them, carrying a function's numbers forward only while its lines are unchanged and marking the rest `stale: true`, with the run named as `mutated`. The example caller runs it on a Monday schedule.
- `.github/workflows/code-map.yml` and `scripts/code-map.mjs`: the code map for the system explorer (design slice 8). Per module its size, imports and import cycles; per function its complexity, coverage, CRAP and mutation score, read through the caller's own TypeScript and published to the orphan `code-map` branch. The script is inline, so callers pin a sha with no release; `examples/code-map-caller.yml` is the shape of a caller. `typescript` 5.9.3 is a dev dependency for its tests, and CI now runs `npm ci`.
- `.github/workflows/pr-footer.yml`: removes the "Generated by Claude Code" footer from pull request descriptions, on each opened or edited pull request and, by hand, over every past one. Ported from capsid's `pr-footer` job. `scripts/strip-pr-footer.mjs` is carried inline, so callers pin the merge commit's sha with no release; `examples/pr-footer-caller.yml` is the shape of a caller.
- `scripts/inline-rollback-guard.mjs` writes both inline scripts.

## [0.6.0]

- `.github/workflows/worker-deploy.yml`: the shared deploy, verify and rollback workflow for a Cloudflare Worker, ported from capsid's `deploy` and `live gate` jobs (capsid's merge pipeline design, section 6, PR 8). Jobs `deploy` and `live gate`, the step "Roll back the deploy this run shipped", and capsid's three rollback annotations byte for byte, so capsid's watcher records the deploy in `deploy_outcomes`. Wrangler 4.107.0, pinned. Callers pin this release's commit sha.
- `scripts/rollback-guard.mjs`: capsid's rollback guard, byte for byte, inlined into the workflow by `scripts/inline-rollback-guard.mjs`. Its tests are ported and run in CI, with run cases that execute the live gate's steps against stubbed curl and wrangler.
- `examples/worker-deploy-caller.yml`: the shape of a caller.
- README: "The shared deploy", with the inputs, the secrets and the limits of a Cloudflare rollback.
