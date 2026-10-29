# Changelog

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
