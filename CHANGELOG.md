# Changelog

## 0.45.1 (2026-11-13)

- `devkit-shared`: a static build that writes its stylesheet with Capsomer's `capsomerStylesheet` (`capsomer/build`, Capsomer 0.123.0) counts as using Capsomer, since that helper always writes base.css. Before, Capsid's explorer, moved onto it from its own inlineCss and minifyCss, failed with "static explorer has no capsomer".

## 0.45.0 (2026-11-13)

- `devkit-no-bloat`: a legacy-scan match kept on purpose carries `legacy-scan:keep` and its reason in a comment on its line or the line above, and is not counted, so a baseline can be zero when every match left is one the guide's own rubric drops. The scanner sees only a literal `isComposing` or `keyCode === 229`, so each Enter handler guarded by Capsomer's shared `isImeEnter` is such a match (7 across Capsomer, dustinedwards.info and Carrel). A guide with no count left is left out of the counts. A marker added with no reason fails (`unreasoned`), as a `jscpd:ignore-start` does.

## 0.44.0 (2026-11-13)

- `devkit-no-bloat` runs Chrome's legacy scanner (`modern-web-guidance legacy-scan --json`, Modern Web Guidance 1.0.0, github.com/GoogleChrome/modern-web-guidance) and gates its matches per guide, as it gates Knip's issue types: `"legacy"` in the baseline, `"legacy": false` to turn it off, `legacy.args` for the paths (default the repository root; the scanner skips docs, examples and tests). The check installs it like knip and jscpd (`tools["modern-web-guidance"]`, exact version, its own install). Item 22 of the Modern Web Guidance review. **Breaking** for every caller: like any measured count, `legacy` needs its baseline entry, so the devkit bump runs `npx devkit-no-bloat --write-baseline` and commits `.no-bloat.json` (a bump alone may raise a count). After that a code change that adds a match fails.

## 0.43.1 (2026-11-13)

- `devkit-no-bloat`: a dependency removed beside a change of measure, such as a Vite plugin taken out of `vite.config.ts` with the library it loads, is part of that change of measure, not code, so the pair passes in one change. Before, the plugin alone left its library unused, and the library alone or with the plugin counted as code beside a definition, so no change could remove both. Such a change may not raise Knip's `unlisted` or `unresolved`, so an import left behind still fails. A dependency removed alone or beside code is still code.

## 0.43.0 (2026-11-12)

Closes the ways around the no-bloat ratchet that the 0.42.0 verifier found (capsid handoff/no-bloat-gaps-verify-0.42.md: J1, L, M and B2a). **Breaking**: jscpd's `unread` now counts every source file jscpd skips, not only those beside files it reads, and on jscpd 5 it counted nothing before (its report lists no files), so a repository's bump PR widens jscpd's path in a change of its own first, or re-writes its baseline; a change to a file a Knip plugin reads as its config (`vite.config.ts`, `tsconfig.json`, `.mocharc.cjs`) now comes in a change of its own, without code; and a caller workflow can change nothing but its pin and the inputs the check does not depend on.

- J1: the caller workflow is read with a YAML parser (`yaml` 2.9.1, a devDependency here and installed by the check beside knip and jscpd, never the repository's), not line by line. CRLF line ends, `with: # comment`, `with: &anchor`, a flow map, a quoted or mixed-case input name and `${{ false }}` are read as GitHub reads them. A change is refused when it touches anything in a caller job but its pin and the inputs outside the watched ones (`if`, `needs`, the workflow it calls), a job the caller waits for (`needs` on a job that is skipped), anything outside `jobs` (`on` with `paths-ignore`, `branches` or `types`, `concurrency`, `permissions`), names a watched input twice, or no longer parses. `callerJobs` is deleted. `--inputs-from` reads the caller from the commit, not the disk.
- L: in Actions the check counts the commit the run is for (`GITHUB_SHA`): HEAD moved, a tracked file that differs from it, or one marked assume-unchanged or skip-worktree fails before anything is counted (`checkoutProblems`), so an install script or prepare step that puts the base back is caught. git runs with no `GIT_*` variable of an earlier step, no replace refs and no fsmonitor, and the tools without the proxy and certificate variables, which an earlier step's GITHUB_ENV line could set.
- M: a file a Knip plugin reads as its config, from Knip's own plugin list at the tool's version, and the local modules a config in code imports, is a change of measure (`knipPluginFiles`). Knip imports such a config, so one could print a report of its own.
- B2a: `unread` counts a source file jscpd skips anywhere, so a copy in a directory outside jscpd's path is counted and a new one fails by name. A file with fewer tokens than jscpd's `minTokens` is left out, like one under `minLines`. On jscpd 5 the files it read come from `--summary`, and a report whose list does not match its count fails.
- `toolRunner` is `checkTools` (`run`, `parseYaml`, `knipConfigs`). node/syntax.mjs's `objectConst` and `stringArrayConst` share one reader of a const's initializer, and `stringArrayConst` unwraps `satisfies` too.

## 0.42.1 (2026-11-12)

- `devkit-no-bloat`: jscpd's `--ignore` and `--ignore-pattern` in the config's jscpd args are read glob by glob, split on commas as jscpd splits them. Before, the whole value was one entry, so dropping a glob from the list (a wider measure) was refused as a new ignore.

## 0.42.0 (2026-11-12)

Closes the ways around the no-bloat ratchet that the 0.41.1 verifier found (capsid handoff/no-bloat-gaps-verify-0.41.md: H, I, J, K, B2 and knip with no lockfile). **Breaking**: jscpd's `unread` no longer counts a file shorter than jscpd's `minLines`, so a repository's count can fall and its bump PR runs `npx devkit-no-bloat --write-baseline` as before; and a pull request can no longer change the inputs of the job that runs the check.

- H, I, K, no lockfile: knip and jscpd are never the repository's own. The check installs them itself (`toolRunner`), at the exact `tools` versions, into a fresh directory and npm cache, from registry.npmjs.org named outright, with no user, global or project npmrc and no install scripts, and runs them on its own node with no variable that loads code (`NODE_OPTIONS`, `LD_PRELOAD`, `npm_config_*`). A postinstall or a pnpm patch that rewrites node_modules/knip, an npm-shrinkwrap.json or a second lockfile, and a hand-made node_modules with no lockfile no longer change what counts, and a `tools` entry that is not `<tool>@x.y.z` cannot run. The lockfile provenance check (`installedFromNpm`, `pnpmProblem`) and the npx path (`runnerIn`, `npxArgs`) are gone. The no-bloat action runs the bin without `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD` and `LD_LIBRARY_PATH`.
- H: what an install runs or patches is a change of measure, so it comes in a change of its own: package.json's install scripts (`preinstall`, `install`, `postinstall`, `prepare` and the rest) and `pnpm.patchedDependencies`, `.npmrc`, `.pnpmfile.cjs`, `pnpm-workspace.yaml` and `patches/`.
- I: a directory with two lockfiles fails.
- J: no change may drop the job that calls `pr.yml` or `no-bloat.yml`, give it an `if`, or change an input that turns the check off or decides what runs before it (`node`, `node-version-file`, `package-manager`, `install`, `no-bloat`, `no-bloat-prepare`, `no-bloat-config`; no-bloat.yml's `prepare` and `config`). A pull request that turns no-bloat off never runs it, so pr.yml's new "No-bloat stays on" step runs `--inputs-from <base> <caller>` from its own devkit whenever no-bloat does not run on a pull request. Such a change is the owner's, made past the check. A workflow counts as one that runs the check only when a job calls the workflow or a step runs the bin, not when it names them (devkit's own pr.yml).
- B2: a jscpd path may widen but never stop covering one it read (`["src"]` to the current file list fails), and a file the change creates that jscpd skips beside files it reads fails by name, so the count no longer misses one when another file starts being read in the same change.

## 0.41.2 (2026-11-12)

- `devkit-secrets`: an Env interface that extends a shared type (`interface Env extends SiteSecrets {}`, site-runtime 0.144.0's standard secrets) carries that type's members, read with TypeScript's checker from the file and the packages it imports, so a site that moves onto `SiteSecrets` still passes "is declared". `env_exact` still checks only what the file itself declares. `interfaceMembers` (./node/syntax) returns `own` beside `members`.

## 0.41.1 (2026-11-12)

- `devkit-no-bloat`: the check that an installed knip or jscpd is npm's own reads `pnpm-lock.yaml` too, when there is no `package-lock.json`. The root importer must list the tool at a bare version (an alias, a git or tarball source, a link or a path fails), and its package must resolve by `integrity` alone. Before, a pnpm repository's lockfile was not read, so it could install another program as knip.

## 0.41.0 (2026-11-12)

Closes the ways around the no-bloat ratchet that the 0.40.0 verifier found (capsid handoff/no-bloat-gaps-verify-0.40.md, gaps A to G). **Breaking**: jscpd's baseline gains `unread`, so each repository's bump PR runs `npx devkit-no-bloat --write-baseline` as before; a Knip config in code (`knip.ts`, `knip.config.js`) can no longer change (write it as `knip.jsonc`); and a devkit pin behind a minor out two days now fails `devkit-shared`.

- A: a change that moves only the devkit pins of a workflow (`pr.yml@<sha> # vX.Y.Z`, the rollout's and Renovate's bump) is no code and no change of measure, so it passes alone. A workflow is never code; any other edit to one that runs the check is a change of measure, refused beside code and unable to lower a count alone.
- B: what would hide the next change's code is refused even when it hides nothing yet. Every line a change adds to a Knip config needs its own reason, on the line or in a new comment block directly above it, so a rule turned off, a narrower `project` or an entry appended under an old comment fails. jscpd may not be narrowed (larger minimums, smaller maximums, fewer formats, a mode other than strict, a changed pattern, extension map or config path, `gitignore`, `skipLocal` or `noSymlinks` on). jscpd's new `unread` count, gated, is the source files it skips beside files it reads, so a path narrowed to today's file list catches the next file. A knip run's args in `.no-bloat.json` cannot change.
- C: `@beta` and `@alias` need a reason after them, like `@public`: Knip skips the exports all three tag.
- D: `tools` must be `knip@x.y.z` and `jscpd@x.y.z`, never older than the base's. An installed knip or jscpd must resolve from the npm registry in `package-lock.json`, or it cannot run. devkit must be pinned to `github:DrDustinEdwards/devkit#vX.Y.Z` in every package.json, with no `overrides` or `resolutions` naming it. `--verify-install <dir>`, which the no-bloat action now runs from the workflow's own devkit before the caller's bin, fails unless the installed devkit is an exact x.y.z no older than the workflow's and every file is byte for byte the file at that release's tag (a fork, a `file:` path, a lockfile resolving elsewhere, an install script rewriting the bin). It replaces the action's version guard, which passed `0.40.0+x` and `0.40`.
- E: a tracked file a `.gitignore` hides from Knip fails, when the file is in the change or the line hiding it is new.
- F: `devkit-shared` fails a devkit pin, in package.json or a workflow, behind a minor out two days (`FRESH`), so a pin left behind or moved back stops being a warning. A pull request that rolls both pins back to 0.40.x or older still runs only that old code: closing that needs base-side enforcement, which a personal account's rulesets cannot require.
- G: a reason must be words (`isReason`): three or more, fifteen letters in all, not a placeholder. `// x` and `jscpd:ignore-start x` fail. A marker or tag counts only in a comment, never in a string or regular expression that mentions it.

## 0.40.1 (2026-11-12)

- `devkit-no-bloat`: Knip's report is read from its last JSON line, so a plugin warning printed on stdout before it (Astro's `[WARN] Missing pages directory`) no longer stops the run with "knip printed no report this reads".
- `devkit-no-bloat`: a workspace package's `package.json` and lockfile (`mcp/package.json`, `apps/web/package-lock.json`) count as a version bump the way the root's do, and a Knip config or `.jscpd.json` in a package directory as a change of measure. Before, a pin bump across a workspace was read as code, so its Knip re-key was refused as a raise.

## 0.40.0 (2026-11-12)

Closes the eight ways around the no-bloat ratchet that the 0.38.0 verifier found (capsid handoff/no-bloat-gaps-verify.md). **Breaking**: every Knip baseline is re-keyed, so each repository's bump PR runs `npx devkit-no-bloat --write-baseline`, as a change of its own (the bump alone may raise or lower). A repository that drops `--warn-only` from its workflow does that in a PR before the bump, since a workflow that runs the check no longer goes in a change with anything but itself.

- Knip is read from `--reporter json`, one count per issue. Before, the compact report's heading counted files (and one per package.json), so a second unused export in a file with one, or a second unused dependency, passed. The baseline keys are Knip's issue types (`files`, `exports`, `dependencies`, `types`...) instead of its headings.
- Every count the run measures needs its baseline entry, and a change that drops one fails. Before, deleting `baseline.knip` turned Knip's gate off.
- A change that moves code may not also change how a count is measured: the no-bloat config outside `baseline` and `tools` (`"jscpd": false`, `"knip": []`, run arguments), a Knip config in any format (`knip.json`, `.jsonc`, `.ts`, `knip.config.*`), `.jscpd.json` (any key, not only `ignore`), or `package.json`'s `knip` or `jscpd`. A change of measure on its own may raise a count but not lower one, so narrowing what is read cannot hide code. Only a version bump alone may lower counts.
- A new `@public` tag needs its reason after it: Knip never reports the export it tags.
- `pr.yml` and `no-bloat.yml` fail when the installed devkit is older than the devkit the workflow runs from, and the bin refuses a change that moves a shared package to an older release.
- `GITHUB_ACTIONS=true` no longer skips the base: the default branch is used whenever it resolves, and a `--lines-from` whose merge base is HEAD itself, while the default branch lacks HEAD, fails.
- Workflows no longer count as "measurement only". A change to a workflow that runs the check (calls `pr.yml` or `no-bloat.yml`, or runs the bin) beside other code fails: a prepare step or a `config:` input could otherwise hide the change it ships with.
- `--ignore=<glob>` and `--config=<file>` are read like their two-argument forms.

## 0.39.0 (2026-11-12)

The copies inside devkit are one each, the bolt-on sweep's rows for this repository. New exports below; no breaking change to a config.

- New export `isMain(import.meta.url)` in `./node`: the entry guard (`realpath` plus `pathToFileURL`) that each bin, and two scripts, kept their own copy of. `bin/shared.mjs`, `live.mjs` and `copies.mjs` used a looser form without `realpath`; they now match through a symlink like the rest.
- `bin/annotate.mjs` gains `fail(prefix, message)` (the `::error::` line and exit 1), `shortHead(root)` (the short commit id or today's date, from no-bloat and route-weight) and `appendSummary(text)` (the step-summary append, from console, copies, migrations, no-bloat, route-weight, shared and worker-size). `size-budget`, `worker-size`, `route-weight`, `css-vars`, `tokens`, `test-assertions`, `gates`, `destructive`, `secrets` and `readConfig` print their fatal error through `fail`. The text is the same with its `devkit-` or bin prefix; it is now on stdout, where `size-budget`, `css-vars`, `tokens`, `test-assertions`, `gates`, `destructive`, `secrets` and `readConfig` printed it on stderr.
- `readConfig` takes `{ optional: true }` (a missing file is an empty config) and `devkit-no-bloat` and `devkit-route-weight` read their config through it. `devkit-destructive` and `devkit-secrets` read theirs through it too, so a config that is not JSON, or not an object, fails with the `::error::` line where it threw before; their missing-file message now names the path. `minimumChecks` in `bin/site-config.mjs` is their shared `minimum_checks` check.
- `devkit-warm` reads sitemap `<loc>` values with `locs`, which `devkit-a11y` now imports from it instead of keeping its own: a URL with `&amp;` in its query string is fetched as `&`, as a11y already did.
- `scripts/code-map.mjs` and `scripts/rollback-guard.mjs` keep their own entry guard and file walk: they are written into workflows that run without devkit checked out.

## 0.38.0 (2026-11-12)

Closes five ways around the no-bloat ratchet that the 0.37.1 verifier found. **Breaking** for a local run with no `origin/HEAD`, `origin/main` or `origin/master` (pass `--lines-from <rev>`), and for a devkit bump that also changes code (split it: the bump alone may raise a baseline).

- A change to `tools` no longer excuses a raised baseline. Only a change that moves no code may raise one: it touches only the config, a lockfile, `.github/workflows/`, and in `package.json` only dependency versions or a new shared package. This replaces both 0.37's `tools` exemption and its shared-package bump exemption for the shared copies.
- A local run checks the raise too, against the default branch (`origin/HEAD`, then `origin/main`, then `origin/master`), and `--write-baseline` refuses to record a raise the check would refuse. Before, only a pull request run with `--lines-from` gated it. A run in Actions without `--lines-from` (the default branch, a merge queue) has no base, as before.
- The error for a new copy no longer names `--write-baseline`. The command is named only for a new test, the one count it raises.
- A baseline count the base did not have (a new knip run label, a key dropped and put back) is raised from 0, and so is every count when the base had no baseline. Before, it skipped the raise check.
- An exception needs its reason. An entry added to a Knip config's ignore lists (`knip.json`, `knip.jsonc`, `.knip.json`, `.knip.jsonc` or a run's `--config`; every key starting `ignore`) fails without a comment on its line, directly above it, or above its list. An entry added to `.jscpd.json`'s ignore or to the config's jscpd `--ignore` fails outright, since strict JSON cannot hold a reason: mark the block with `jscpd:ignore-start` and the reason after it. A `jscpd:ignore-start` added with nothing after it fails.

## 0.37.2 (2026-11-12)

- `devkit-tokens`, `devkit-css-vars` and `devkit-test-assertions` list files with `walkFiles` from `./node` instead of each keeping its own recursive walk. The files they scan and what they report are unchanged.

## 0.37.1 (2026-11-12)

- `devkit-no-bloat`: a baseline with no `"shared copies"` yet is reported like a stale entry, without the "Remove what was added" line, which only applies to a count that grew.

## 0.37.0 (2026-11-12)

How the network stops bolt-on code (a parallel helper, wrapper or stylesheet beside code that already does the job, Dustin 2026-11-12). **Breaking** for every caller: each needs `"shared copies"` in its `.no-bloat.json` baseline (`npx devkit-no-bloat --write-baseline`), and a caller of pr.yml or no-bloat.yml that passes `no-bloat-warn-only` or `warn-only` must drop it.

- `devkit-no-bloat` holds the count exactly. A count below its baseline now fails until the change lowers the baseline, so the room a cleanup leaves cannot let the next copy in (the ratchet of ESLint's bulk suppressions, which fail on a suppression no longer needed, and Betterer's `ci` mode). Before, it was a warning and the room stayed.
- On a pull request (`--lines-from`, which pr.yml and no-bloat.yml pass) a raised baseline for Knip, jscpd or the shared copies fails. Before, the error for a new copy told the author to run `--write-baseline` and commit, which raised the limit and passed the copy. The way out now is to remove it, or to put a real exception in `knip.json`'s or `.jscpd.json`'s ignore list with its reason. A change that moves `tools` may raise them, and one that bumps a shared package may raise the shared copies. Tests rise as before.
- New gated count `shared copies`: jscpd over the repository's source and every shared package installed in `node_modules` (`packageCopies` in bin/copies.mjs), counting the blocks in both. A copy under a new name is caught on its pull request; devkit-shared's `copies` check matches only names, and the network scan in live.yml runs a day later. Each copy is a warning with both places. `"shared": false` turns it off.
- jscpd reads JavaScript as TypeScript (`COPY_ARGS`, `--formats-exts`), in the shared copies and in the network scan: jscpd compares files of one format only, so a site's `.ts` copy of site-runtime's or Prelum's `.mjs` was never counted (checked with jscpd 4.3.0 and 5.4.0). The network scan's baseline is re-measured with it (live/copies.json, from this change's run over every repository): 65 copied blocks, 126 names, 7 package overlaps. Most of the rise is copies nobody removed, not the mapping (Carrel still holds its own copy of Capsomer's collaborative and rich editors, about 1,900 lines); the new baseline is today's debt, for the cleanup threads to lower.
- `--warn-only` is removed from `devkit-no-bloat`, `no-bloat.yml` and pr.yml (`no-bloat-warn-only`): a report never stops a copy from merging, and Enarratio, germomics and txasm ran it so. The bin refuses the flag (exit 2). `devkit-shared` no longer counts a no-bloat step with `continue-on-error: true` as the check.

## 0.36.0 (2026-11-11)

- New export `./migration-scan` (`handOnly`, `contractions`, `statements`): the reader `devkit-migrations` uses, moved out of bin/migrations.mjs into a module with no node imports so a Worker can import it. `devkit-migrations` behaves as before. Capsid's gate policy now classifies a migration through `handOnly` and `statements` instead of its own copy, so the deploy check and the pre-approval cannot disagree about one file.

## 0.35.2 (2026-11-11)

- `devkit-no-bloat`: the npx fallback runs `knip@6.45.1`, not 6.44.0, which reported `cloudflare:workers` imports as an unlisted dependency `cloudflare` (site-runtime's baseline of 0 became 3). A repository with the same count can drop a `tools.knip` override.

## 0.35.1 (2026-11-11)

- `devkit-route-weight`: a manifest stylesheet named with React Router's trailing `#` (`/assets/x.css#`, a stylesheet a dynamic import also reaches) is the same file, counted once; before, the gate stopped with "the manifest names … which is not in build/client" (found moving Carrel onto Capsomer 0.93.0).

## 0.35.0 (2026-11-11)

- `release.yml`: a run releases every untagged version bump since the tenth newest tag, oldest first, each tagged on its own commit with its own CHANGELOG section and tarball (with `build: true`, each built on its own commit). Before, it tagged only the commit it started on. A caller's concurrency group keeps one waiting run and cancels an older pending one when a newer arrives (GitHub's concurrency docs, whatever `cancel-in-progress` says), so two bumps that merged close together left one without a tag: site-runtime's v0.121.0 and v0.122.0 were never tagged on their own commits. A tag that exists is never moved or replaced. **Behavior change:** the first run after this one backfills any bump that is newer than the newest tag and untagged.

## 0.34.0 (2026-11-11)

- `pr.yml` runs `devkit-css-vars` after the install in every repository with a `.css-vars.json` (devkit's own file at the caller's pin, so no devDependency bump is needed); `css-vars: false` or `node: false` turns it off, and the Result table lists it as CSS-variables.
- `devkit-shared` workflows: a repository with `.css` files outside tests needs a `.css-vars.json` and `pr.yml`'s `css-vars` left on (or CI running `devkit-css-vars` itself), waived as `workflow:css-vars`. **New failure** from this release: add `.css-vars.json` when bumping to it.

## 0.33.0 (2026-11-11)

- `./node` and `./node/syntax`: the helpers dustinedwards.info's gates kept in `scripts/lib/` (`createTally`, `assertFloor`, `walkFiles`, `readDevVar`; the syntax-tree readers of `syntax.mjs` and `destructive-scan.mjs`), so a site's own gate imports them instead of keeping a copy (item 51 of the 2026-11-11 shared-code audit). `typescript` is an optional peer for `./node/syntax`.
- `devkit-secrets` (from dustinedwards.info's `check:secrets`): the Env declaration, the server-boundary read scan, the git-ignore proof and the tracked-file credential scan, from `.secrets.json`. New: built-in shapes for Anthropic, Stripe live and webhook, GitHub, AWS and Sentry keys and private keys, on every site that runs it.
- `devkit-destructive` (from dustinedwards.info's `check:destructive`): route intents, machine-API tools and storage bindings, from `.destructive.json`. The backups bucket rule (`d1-dump`) names d1-dump's functions once, for every site.

## 0.32.0 (2026-11-11)

- New bin `devkit-css-vars`: fails on a `var(--x)` without a fallback that nothing declares (config `.css-vars.json`: `dirs`, `declared_in`, `external`). Foxing used `--fx-shadow-md` 14 times and declared it nowhere, so those shadows never drew; no check could see it (second shared-code audit, 2026-11-11).

## 0.31.0 (2026-11-11)

- `devkit-shared` features: site-runtime `./worker` counts for security.txt and the CSP report receiver (its gateway answers both on every site), Prelum `standardFiles({ ai })` for ai.txt and site-api `standardSiteApi({ indexNow })` for IndexNow, so a site on the one Worker passes.

## 0.30.0 (2026-11-11)

- `worker-deploy.yml`: the live gate checks devkit out at the caller's pin (`job.workflow_sha`) and sets `$DEVKIT_DIR` for the verify command, so a caller runs `node "$DEVKIT_DIR/bin/verify-deploy.mjs" <origin> ...` with no install (the gate installs nothing on purpose). Callers replace their inline `curl` home-page checks and local verify scripts with it.

## 0.29.0 (2026-11-11)

- `devkit-test-assertions` (from dustinedwards.info's `check:test-assertions` and foxhound's `report:assertions`) and `devkit-verify-deploy` (from dustinedwards.info's `verify-deploy.mjs`, foxhound's `verify-live.mjs` and the `curl` home-page check six workflows wrote inline). Both read their options from the command line or a small JSON config; a site deletes its copy and calls the bin.

## 0.28.0 (2026-11-11)

- `docs/browser-support.md`: the network's browser support policy in Baseline terms (Widely available freely; Newly available with a graceful degrade or a small fallback; Limited availability only feature-detected, never for content or a core task; no polyfills).
- New bins that sites ran from local `scripts/` copies (item 51 of the 2026-11-11 shared-code audit): `devkit-size-budget` (capsid's client bundle budget), `devkit-tokens` and `devkit-gates` (foxhound's token gate and gate-count floor), `devkit-db-migrate` (foxhound's guarded migration wrapper) and `devkit-fetch-fonts` (germomics's font self-hosting). Each reads a small JSON config in the repository; a site deletes its copy and calls the bin.
- `devkit-shared` pins: a lock check now follows an npm workspace member to the root lock. Before, it read only a `package-lock.json` beside the manifest, so a pin in `apps/web/package.json` was never compared with the root lock's `apps/web/node_modules/<name>` (or hoisted `node_modules/<name>`) entry, and foxing shipped capsomer 0.83.1 under a v0.87.0 pin. **New failure** for a workspace whose lock is stale.
- `pr.yml`: the automatic reviewer runs in its own job (`Reviewer`), the only job with `id-token: write` and `checks: write`. Before, `Repo checks` held both while it installed and built the caller's code, so a dependency lifecycle script could mint an OIDC token (GitHub's OIDC hardening guide and zizmor's excessive-permissions audit say to grant it to the one job that needs it). The check name `checks / Repo checks` is unchanged. Cost: one more runner per same-repository pull request that is not a draft or Renovate's. The `review` action's `start` and `wait` modes are gone.
- Renovate: a third-party GitHub Actions major, minor or patch release waits seven days (`minimumReleaseAge`, `matchManagers: ["github-actions"]`), as npm waits three. Network packages still arrive at once.

- License: MIT. Added the LICENSE file and set `license` in package.json (it was UNLICENSED, which the other public repositories do not share).

Fixes from a review of the checks and workflows. Behavior changes a repository may meet are marked **new failure**.

- `devkit-migrations`: `--write` refuses, without `--force`, when a recorded migration is gone from disk or renamed. A migration after `expand_only_after` that updates, replaces (`INSERT OR REPLACE`, `REPLACE INTO`) or deletes rows, drops an index, view or trigger, or sets `PRAGMA writable_schema` needs a `-- contract:` line (**new failure**), and `--apply` hands such a migration to a person. An apostrophe inside a `"quoted"`, backtick or `[bracket]` identifier no longer starts a string, a `-- contract:` inside a `/* */` block does not count, and a pending file whose name is not `NNNN_name.sql` is a hand-only item rather than skipped.
- `devkit-live`: a check's bin gets a minimal environment (the basics of a process, `NODE_*`, locale, proxy variables) plus the variables its entry in `live/areas.json` lists under `env` (`PSI_API_KEY` for the speed checks, `GITHUB_TOKEN` for ops-audit) and, for a `grants` check, the MCP grants; no `LIVE_GITHUB_TOKEN` or `GITHUB_TOKEN` otherwise. `live.yml` runs the checks in a read-only job with no credential left in `.git` and hands the run to a second job, the only one with `contents: write`, that pushes the scoreboard. `git ls-remote`, `npm install` and the GitHub fetches have timeouts.
- `devkit-live`, from a second review:
  - A check's bin no longer gets every `NODE_*` variable: only `NODE_EXTRA_CA_CERTS`, `NODE_NO_WARNINGS` and `NODE_ENV` (so no `NODE_OPTIONS` or `NODE_AUTH_TOKEN`), and a proxy variable loses its user and password. `git ls-remote` and `npm install` get the same basics and nothing else. A `"grants": true` check gets only the `MCP_TEST_GRANT_<HOST>` of the site it is probing, not every server's.
  - `devkit-live lint` reports, instead of throwing on, a file that is not valid JSON, an area with no `checks` list, a verdict cell that is not an object and a verifier that is not text, and refuses (**new failure**) a check `bin` or `repo` that is not a plain name (a `/` or `..`), a `ref` that is not `vX.Y.Z` or a full commit sha, and a site with no `origin`.
  - A check's result: an `::error` line on exit 0 is a failure, not a pass (**new failure**), as a report's is; exit 1 with no `::error` line is a crash and `unmeasured`, not a failure; a check killed at its timeout says it timed out instead of "exit 3", and the kill takes its whole process group, so a Chromium it started cannot hold the run open. Output is read as UTF-8 and kept to 5 MB, and annotation escapes (`%0A`, `%25`, `%3A`, `%2C`) are decoded when the findings are read. A reported check that cannot be read names its HTTP status, and a report over 2 MB is refused.
  - The newest tag of each package repository is read once per run, so every site runs the same release. A failed install directory (a full disk, a permission) makes that check `unmeasured` instead of ending the run, and the run's temporary directory is removed.
  - Lines per area read every page of GitHub's search, wait out a rate limit of up to a minute, and are `?` (with why) rather than a short count when GitHub holds results back or a pull request has no line counts.
  - An area with no live check (area 12, checks and tooling) takes each cell from its verdict alone, as the package column does, and needs no clean days, so the board can finish; before, its cells could never be complete.
  - SCOREBOARD.md escapes newlines, `|`, `<`, `>`, `&` and backticks in text from checks, sites and verdicts, and `devkit-live lint`'s `::error` lines go through `bin/annotate.mjs`.
  - `--areas` and `--sites` must name areas and sites in the config, and a bad option or a `board` without `--runs` is a usage error (exit 2). `board` skips a run file that is not a run with a warning instead of failing.
- `release.yml`: the `npm ci` and build step holds no token (`npm ci --ignore-scripts`, then the package's own `npm run prepare`); the tag, push and release step alone gets `GH_TOKEN`.
- `worker-deploy.yml`: the deploy and the live gate run only on the default branch, as `release.yml` does. A caller that deploys on a push to its default branch is unchanged; a manual run from another branch now deploys nothing.
- `scorecard.yml`: only HTTP 404 means the repository never published; any other answer fails the job instead of passing the gate.
- `bump-consumers.yml`: a manifest that cannot be read or parsed fails the run, naming the repository, instead of being skipped with a warning. A `package.json` over 1 MB is read through the blob API.
- `devkit-no-bloat`, `devkit-copies`, `devkit-conformance`: a missing `.no-bloat.json` or an empty baseline, a `live/copies.json` with no numeric `baseline`, and a conformance config with no `scenarios` (unless `"allow_no_scenarios": true`) now fail instead of passing every count (**new failure**).
- Every `::error`, `::warning` and `::notice` line that prints a file name, a remote `/health` value, a tool's stderr or a baseline key escapes `%`, CR and LF through one helper, `bin/annotate.mjs`.
- `devkit-shared`: `blankComments` reads string, template and regular-expression literals, so a `//` or `/*` inside one is not a comment; an invalid `package.json` is a warning on that file and the check continues; a British word in a file name (codespell's `file: word ==> fix`, no line) is reported.
- `devkit-a11y`: a malformed `%` escape in a skip-link `href` no longer throws; a page whose scan stopped keeps the axe, keyboard and reflow findings already collected beside its "could not be scanned" notice; sitemap index children must be on the same origin by parsed URL, not by prefix.
- `devkit-no-bloat` counts `t.test(` / `t.it(` subtests and `specify(`; `devkit-console` also counts `console?.log(`, `console["log"](`, `globalThis.console.log(`, `self.console.error(` and `const { log } = console` (**new failure** where a baseline missed them).
- Timeouts of 30 s on the fetches in `devkit-copies`, `devkit-a11y`, `devkit-warm`, `devkit-conformance` and `devkit-live`. `devkit-warm` keeps its promise never to fail a warm, follows only same-origin sitemap children, and refuses a `--sha` shorter than 7 hex characters.
- Pinned: `devkit-no-bloat`'s npx fallback (`knip@6.44.0`, `jscpd@4.3.0`) and `devkit-worker-size`'s (`wrangler@4.149.0`). `access-drift.yml` and `restore-drill.yml` accept only a release tag or a full commit sha as the package ref, and `access-drift.yml` installs with `--ignore-scripts`.
- `devkit-ops-audit`: a drill run with an unreadable `created_at` fails R1 instead of passing; a `/404` that does not answer is a "could not measure" notice for N2.
- `scripts/strip-pr-footer.mjs` reads the description line by line (a 100,000-space body took 12 s under the old pattern).
- `shared-list.yml` and the `shared` action both accept a tag with or without the leading `v`.

- `default.json` (Renovate): `@types/node` major updates are off; the types move with the runtime's Node major, by hand, with `.nvmrc` (bsw #159 offered 26 on Node 24).
- `default.json` (Renovate): `allow-git=all`, so Renovate's npm 12 can regenerate lockfiles that reach a git dependency of a git dependency (EALLOWGIT left them stale on every network packages PR). Peer ranges are never rewritten. The shared `rangeStrategy: pin` turned enarratio's and react-router's peer ranges into exact versions (capsomer #287, #288), which locks consumers out of every other version. Prelum carried this rule alone; it now applies to every repository.
- Tests only, no behavior change: the sha256 check over the shared workflows' downloads now matches how they call curl (it matched none) and fails if it finds no download; every example caller's pin check, and the top-level `permissions`, are each checked once in `workflows.test.mjs`. Removed tests that pinned workflow text a run case already proves, repeated another file's coverage, or could not fail (206 cases to 199). The ReDoS case counts pattern calls instead of timing them, the conformance case takes free ports from the system, the bash cases skip on Windows, temp directories are removed, and spawned bins get no `GITHUB_STEP_SUMMARY`, `GITHUB_OUTPUT` or `GITHUB_EVENT_PATH` of the run.

## 0.27.0 (2026-11-07)

- `./stryker`: `chunkedStryker`, the chunked Stryker config that d1-dump, site-api, Germomics and Foxhound each carried a copy of (the same options, the same `STRYKER_CHUNK` rule and the same `rest` chunk). A repository's `stryker.config.mjs` is now its file list.
- Every file is type-checked. `bin/live.mjs`, `bin/a11y.mjs`, `bin/a11y-judge.mjs`, `scripts/fakes-contract.mjs` and `vite/dev-toolbar-client.mjs` were left out of `tsconfig.json` (231 errors); none is now, and the exclude list is gone. The dev toolbar now reports accessibility as not checked when `/@devkit/axe.js` loads without defining `axe`, where it threw.
- `devkit-copies`: a third ratchet, `"packages"`, counts the names two or more shared packages each export, the overlap between the packages that no check over the sites could see. `live/copies.json` gains `packages: 6` (the CI run's count over every repository: `enhanceCharts`, `escapeHtml` in three packages, `goneResponse`, `kindOf`, `runConformance`, `toDate`), `names` drops to 148, and `baseline` rises from 24 to 28 for this release only: `stryker/chunked.mjs` is, until the four repositories import it, a fifth copy of their config, and the follow-up pull requests lower it again.

## 0.26.4 (2026-11-07)

- `live`: the Germomics admin MCP server (`admin-mcp.germomics.com`) is off the board: its site entry, its `MCP_TEST_GRANT_ADMIN_MCP_GERMOMICS_COM` secret and its area 9 and area 3 rows. The server is gone.

## 0.26.3 (2026-11-07)

- `worker-deploy.yml` (live gate): a site deliberately in maintenance (its home page answers the shared 503 with Retry-After, site-runtime `./maintenance`) no longer has its deploy rolled back by the caller's page checks. Once `/health` reports this run's commit, the gate sees the maintenance page, skips `verify-command` with a warning, and passes. A 503 without Retry-After still runs the checks.
- `devkit-ops-audit`: N2 fails a site whose `/404` path answers 2xx, and M1 warns when the home page answers the maintenance page, so MAINTENANCE left on is seen.

## 0.26.2 (2026-11-06)

- `./oxlint` (`react`): `jsx-a11y/no-noninteractive-tabindex` also allows `role="region"` (a scrollable region a keyboard must reach), and `jsx-a11y/no-redundant-roles` allows `role="list"` on `ul` and `ol` (Safari drops list semantics from a list with `list-style: none` without it). Both are options the rules already have; the fixture's `good.tsx` fails without them. A repository drops the `oxlint-disable` comments it wrote for these two.
- README, "The shared lint config": Oxfmt is not idempotent (run it until `--check` passes), the reformat moves suppression and `codespell:ignore` comments, exact-text checks can break, and a formatting-only pull request merges with a merge commit.

## 0.26.1 (2026-11-06)

- `devkit-shared` (jobs): the backups, media, webmentions and site-check rules fail from 0.28.0, not 0.26.0. 0.26.0 shipped before the Germomics and Foxhound backup tools and dustinedwards-info's mention tools were removed, so releasing it would have failed those repositories' checks. The rule is unchanged; only the date it fails moved.

## 0.26.0 (2026-11-06)

CI was slow because of the runner queue, not slow steps (measured 2026-11-06 over 18 repositories and 2,454 jobs: the account's 20 runners full with 30 to 98 jobs queued, queue p90 6.5 minutes, 74% of jobs under a minute). Three changes cut the jobs.

- `pr.yml`: every pull request check in one job, with one checkout and one install: the footer strip, the trailer check, the shared-code check, OSV-Scanner in pull request mode, actionlint and zizmor when the change touches `.github/`, no-bloat, the Worker bundle size (`workers` for several) and the reviewer, which starts in the background first and is collected last. Every check runs and reports even when another failed, each with its own annotations and summary section, and the last step fails the job if any failed. Inputs turn parts off (`node`, `no-bloat`, `worker-size`, `dependencies`, `workflow-audit`, `review`). The caller is `examples/pr-caller.yml`: `pull_request` and `merge_group`, concurrency on the pull request with `cancel-in-progress`, job id `checks`, so the check is `checks / Repo checks`, the name every ruleset already requires; a description edit runs every check again under that name, since GitHub judges a required check by the newest run on the commit. The rulesets also require the standalone names it covers (`no-bloat / No-bloat ratchet`, `worker-size / Worker bundle size` and the per-Worker ones, devkit's `dependencies / OSV-Scanner` and `workflow-audit / *`): a repository that moves removes them from its ruleset in the same change (README, "One job per pull request"). The reviewer in it needs Capsid to admit `pr.yml`'s token (capsid `src/review.ts` admits only `review.yml` today); until then a repository keeps its `review.yml` caller and passes `review: false`, as devkit's `checks-self.yml` does beside `review-self.yml`.
- `.github/actions/`: the steps of `checks.yml`, `review.yml`, `no-bloat.yml`, `worker-size.yml`, `dependencies.yml` and `workflow-audit.yml` as composite actions, the one copy `pr.yml` runs too, read from devkit at the caller's pin. Callers of the standalone workflows change nothing; `no-bloat.yml`, `worker-size.yml` and `workflow-audit.yml` now check the caller out in `repo/` beside `.devkit`, and the Worker summary's per-Worker headings are one level down.
- `devkit-shared` (workflows): a call of `pr.yml` counts as each of `checks`, `review`, `dependencies`, `workflow-audit`, `no-bloat` and `worker-size` its inputs leave on. A separate caller of one of those still running on `pull_request` or `merge_group` beside it is a warning, failing from 0.26.0: remove it, or keep only its schedule.
- No second run on main: the example callers of `checks`, `no-bloat`, `worker-size`, `workflow-audit`, `dependencies` and `conformance` drop `push: branches: [main]` (`dependencies` keeps its daily schedule); `code-map` and `scorecard` run nightly with a dispatch in place of every push, code-map mutation-testing on its Monday cron line. Nothing reads a devkit check on main: dustinedwards-info's deploy reads its own CI workflow's conclusion, and every other deploy runs from its own CI job (README, "No second run on main"). devkit's `ci.yml`, `checks-self.yml`, `code-map-self.yml` and `scorecard-self.yml` do the same, and `checks-self.yml` runs `pr.yml`.
- `default.json`: Dustin's own packages bump as one group per repository, `network packages` (renovate/network-packages), devkit's workflow pin and npm package included, with `enarratio-astro` and `enarratio-emdash` added to the npm names. No cooldown, any-time schedule and the minor, patch and pin automerge are unchanged; a major keeps its own branch and a digest move leaves the group. `bump-consumers.yml` gets no debounce: a release moves the one open branch, and the pull request concurrency cancels its older run.

## 0.25.0 (2026-11-06)

- `devkit-shared` (jobs): every agent job has one owner, and an MCP server that serves a tool for a job another owner holds fails. `JOBS` in `bin/shared.mjs` is the list, and `devkit-shared list` prints it as SHARED.md's "Agent jobs" table: backups (Capsid Admin, `capsid_admin_run_controls` control `site_backup`), site checks and drift repair (Capsid Admin, control `site_repair`), media, writing and webmentions (Carrel), with email (site-runtime `./email`), the Claude Code hooks (devkit `claude/hooks`) and the nightly dump (d1-dump) beside them, each named with the check that holds it. The name-only copy check missed these: each site wrote its own backup, media, drift and mention tools under its own names, in code jscpd could not match. A tool is read by its name less the site prefix, its title and the operator tool or API path its handler calls, so `site_sync_files` titled "Back up the files now" calling `backup_media` fails too. Run over every repository on 2026-11-06 it finds exactly the tools the move is taking out: dei's check_site, repair_drift, review_mentions, decide_mention, upload_media and backup_media, and the backup tools of Germomics, Foxing and Foxhound; Foxing's and Foxhound's own tools (health, users, catalog, clubs, merchants, staged changes, their emails) pass. Writing fails now (no site serves a writing tool); backups, media, webmentions and drift warn until 0.28.0, while capsid #811, dustinedwards-info #728 and the webmentions move land.
- `devkit-copies` reads the code in `.claude` and `.github` (it skipped every dot-folder, which is how ten byte-identical hook copies went unseen), counts a `.claude` file jscpd cannot read (a skill, a rule, an agent) with the same bytes in another repository as a copy (not `settings.json`, which is each repository's own), and adds a second ratchet, `"names"` in `live/copies.json`: distinctive exported names two or more non-package repositories each define, the same job written twice under one name, which jscpd misses when the code differs (`backupStatus` in five repositories, `sendEmail` in three, `withSecurityHeaders` in five). Measured over all 24 repositories on 2026-11-06 (the `copies` run on this pull request): copies 24, up from 23 only because capsomer's own `.claude/hooks` copies of the devkit hooks are now seen (devkit-shared already fails them by name), and names 153, among them `backupStatus` in five repositories, `runBackup` in six, `suggestFor` in seven, `withSecurityHeaders` in five, `sendEmail` in three and the Foxhound and Recova pairs that go when Recova is deleted.

## 0.24.1 (2026-11-06)

- `devkit-shared`: an app with a `send_email` binding in its wrangler config must send through site-runtime's `./email` (`sendEmail`), the `email` row of SHARED.md's feature table. Each site had wrapped the binding itself, with its own share of the guards `./email` holds for all (an address with a line break refused, sign-in links and recipients cut out of a logged error); the name-based copy check could not see a wrapper written fresh. Every site already sends through `./email`. Waive with `waive: { email: "..." }`.

## 0.24.0 (2026-11-06)

- `devkit-shared` (lint, new): a repository with JavaScript or TypeScript runs the shared Oxlint config the same way everywhere: a root `oxlint.config.ts` extending `@dustinedwards/devkit/oxlint`, no `eslint.config.*`, `.eslintrc*`, `biome.json` or `.oxlintrc.json` of its own, the root `lint` script `oxlint --type-aware --deny-warnings --report-unused-disable-directives-severity=error`, and a workflow running `npm run lint`. Each missing piece is a warning in this release and fails from 0.25.0, while the repositories move (one PR each). `devkit-shared list` has a `lint` row. A nested config for one part is allowed; `.shared.json` "waive" "lint" exempts a repository.
- `@dustinedwards/devkit/oxfmt`: the shared Oxfmt config, the formatter for every repository (Dustin, 2026-11-06). `format` is Oxfmt's defaults with build output, generated types and lockfiles ignored; README, "The shared lint config". `oxfmt` 0.77.0 is an optional peer dependency. `devkit-shared`'s lint check also wants a root `oxfmt.config.ts` with it, a `format:check` script `oxfmt --check`, `npm run format:check` in CI, and no Prettier or `.oxfmtrc.json` config (a warning until 0.25.0).
- devkit formats itself with it (`oxfmt.config.ts`, `npm run format:check` in CI). The reformat is its own commit, listed in `.git-blame-ignore-revs`.
- `./oxlint`, from the first repositories on it: `ignorePatterns` is its own export, which a repository's config sets itself, because Oxlint 1.92 does not carry `ignorePatterns` through `extends` (`base`'s list did nothing; capsid's tracked `worker-configuration.d.ts` was linted). `typescript/no-non-null-assertion` is off (typescript-eslint keeps it in `strict`; 1,600 findings in capsid and site-api, mostly tests, none a bug) and `react/only-export-components` is off (Fast Refresh only). `react` keeps jsx-a11y's correctness rules less `prefer-tag-over-role`, `control-has-associated-label` and `media-has-caption`, which flagged correct markup on dustinedwards-info (reasons in the file). README notes that an override setting a plugin's rules lists that plugin.
- `default.json`: `oxlint`, `oxlint-tsgolint` and `oxfmt` move as one "Oxc" update, since every repository pins oxlint and tsgolint together at devkit's peer versions.
- A test runs the README's `.claude/settings.json` block as Claude Code does: it blocks every call but `npm ci` or `npm install` until devkit is installed, then runs the shared hook.

## 0.23.1 (2026-11-06)

- `bump-consumers.yml`: a consumer Renovate cannot reach (no Dependency Dashboard, or one with no manual-run checkbox) fails the run, naming the repository, instead of a warning on a green run. The other consumers are still ticked first. Capsomer depends on site-runtime but has no dashboard, so every site-runtime release since its history began on 2026-10-31 warned and passed, and it stayed on 0.77.1 while the network moved to 0.82.0.

## 0.23.0 (2026-11-06)

- `claude/hooks/`: the network's Claude Code hooks, `no-em-dash.sh` and `scoped-git-add.sh`, in the package, one copy for every repository. Ten repositories (capsid, capsomer, dustinedwards-info, enarratio, foxhound, foxing, germomics, julieedwards-info, txasm, bsw) each kept a byte-identical copy in `.claude/hooks/`, which the copy scan never read because jscpd skips dot-folders. A repository runs them from `node_modules/@dustinedwards/devkit/claude/hooks` through `.claude/settings.json`; the settings block, which also fails closed before `npm ci`, is in README, "The shared Claude Code hooks". The hooks are unchanged apart from a header note.
- `devkit-shared` (copies): a `.claude/hooks/no-em-dash.sh` or `.claude/hooks/scoped-git-add.sh` of a repository's own fails, naming the devkit path to run instead. `devkit-shared list` names the hooks under devkit.
- `devkit-ops-audit --path <dir>`: H4 compares `/health`'s `sha` with the newest commit on the branch that touched the directory, not the branch head. An admin MCP Worker in `mcp/` deploys only when `mcp/` changes, so a web-only commit (Foxing #252, fonts) made H4 fail on `foxing-mcp` for good. `live/areas.json` passes `--path mcp` for `foxhound-mcp`, `foxing-mcp`, `germomics-mcp` and `dustinedwards-mcp`.

- `@dustinedwards/devkit/oxlint`: the shared Oxlint config (step 1 of the lint unification: Oxlint everywhere, type-aware through oxlint-tsgolint). `base`, `react` and `node`, plain config objects a repository's `oxlint.config.ts` extends, the way Oxlint's docs give for sharing a config from a package; README, "The shared lint config". `oxlint` 1.92.0 and `oxlint-tsgolint` 7.0.2006 are optional peer dependencies. The four type-aware rules dustinedwards-info turned off locally that stay off for everyone, and the four that come back on, are decided in `lint/oxlint.mjs` with the counts behind them. `test/oxlint.test.mjs` proves the export loads and that a dropped promise, a conditional hook and a restricted import are flagged.
- devkit lints itself with it (`oxlint.config.ts`, `npm run lint`, a CI step after the typecheck). What it found is fixed in place, behavior unchanged: four promises handed where a void callback is expected (the islands' directive, the two `vite dev` middlewares, the toolbar's audit) are passed through `void`; three regexes that test a prefix or suffix are `startsWith`/`endsWith`; two ternaries used as statements are `if`s; a `let` is a `const`; a string spread is `Array.from`; two `= undefined` defaults are optional parameters; `./d1`'s `D1Like.batch` takes `unknown[]`, not `any[]`.

## 0.22.0 (2026-11-06)

- `live`: the Germomics admin MCP server (`admin-mcp.germomics.com`) is on the board with its `MCP_TEST_GRANT_ADMIN_MCP_GERMOMICS_COM`, as the Foxing, Foxhound and dustinedwards.info admin servers are.
- `worker-deploy.yml`: `generated-secrets` input. Names of secrets nobody needs to know (site-runtime's `ADMIN_IDLE_SECRET` first): a name the Worker lacks is minted (32 random bytes, base64url, masked) and uploaded with the deploy or gradual upload through `--secrets-file`, which keeps every other secret; a name it holds is never read or changed. So no site needs a hand-run `wrangler secret put` for a value no person uses. Empty, the default, changes nothing.
- CI typechecks the package, the bins and the scripts (`tsconfig.json`, `npm run typecheck`: strict, `checkJs`, `tsc --noEmit`), with `@types/node` and `vite` (for its types) as dev dependencies. What it found is typed in place, behavior unchanged: `siteScript`, `devToolbar`, `serveToolbar` and the islands typed against their `.d.mts`; `devkit-shared`'s `Config` annotation sat on the file name, not the config; `devkit-worker-size`'s `fail` returns `never`; `devkit-ops-audit` reads a GitHub file's error by its presence. `test/`, `bin/live.mjs`, `bin/a11y.mjs`, `bin/a11y-judge.mjs`, `vite/dev-toolbar-client.mjs` and `scripts/fakes-contract.mjs` are not checked yet.

## 0.21.5 (2026-11-06)

- `worker-deploy.yml`: `warm` input (default `true`, unchanged). "Warm the stored pages" runs inside the live gate, and every job that needs the deploy waits for it: 59 to 102 s on Foxing, 17 to 24 s on dustinedwards.info, which warms again in its converge job. `warm: false` ends the gate as soon as it passes, so e2e or a second Worker's deploy starts sooner and the gate's runner stops sooner; the caller warms with `npx devkit-warm <origin>` in a job nothing waits on, or not at all. Its first reads are then renders, so a caller whose e2e counts on stored pages keeps the default. Not a separate job: a caller's `needs:` waits for every job of the called workflow, so that would add a runner and save no time.
- `worker-size.yml`: `workers` input, several Workers in one job. A JSON array of `{ "name", "working-directory", "config", "prepare" }`; the job checks out and installs once, then runs each Worker's prepare and check in turn, each in its own log group and summary section, its annotations titled with its name, and fails if any Worker is over budget or could not be measured. Today dustinedwards.info runs three jobs and Foxing two, each with its own setup and `npm ci` (17 to 34 s). Empty, the default, is the one Worker as before. Moving to it renames the caller's checks to one, `<job> / Worker bundle size`, so a ruleset that requires the per-Worker names needs the new one in the same change.
- `worker-deploy.yml` says why its jobs keep setup-node's dependency cache off: each holds the deploy secrets, and a restored cache is a path into them for code from a less trusted run. Unchanged.

## 0.21.4 (2026-11-06)

- `devkit-shared` (pins): a pin of a shared package whose lockfile resolves another release is an error. npm keeps a lock entry for a git dependency when its tag in `package.json` moves, so a bump that edits only `package.json` ships the old code: Capsid pinned site-runtime v0.76.0 over a lock that resolved 0.74.0 (capsid #785), and Capsomer's lock resolved 0.62.1 under a v0.73.0 pin. The check reads the `package-lock.json` beside each `package.json` (the `node_modules/<name>` version must equal the tag) and, in a pnpm repository, `pnpm-lock.yaml` (it must record the pin's specifier). The fix is in the message: delete the lock's `node_modules/<name>` entry, then `npm install --package-lock-only`.

## 0.21.3 (2026-11-05)

- No false passes or failures on the scoreboard (Dustin, 2026-11-05). A check that could not measure an item says so: `::notice title=<item>::<url> could not measure: <reason>`, exit 3 when nothing failed (Monitoring Plugins' UNKNOWN). `devkit-live` records such a result, a crash or an install failure as `unmeasured` with the reasons, never `error`; the board shows ❔ "could not measure" with why (Capsid's Completeness tab reads it from capsid #780), a measured failure in the same cell still makes it missing, and `live.yml` is red only for a measured failure. A reported check's `error` reads as `unmeasured`.
- `devkit-ops-audit`: a failed GitHub read, or no `--repo`, leaves H4's sha, H5 and R1 not measured, each named with its reason, instead of exit 2 hiding the health findings (or, without `--repo`, nothing said at all). Exit 3 when nothing failed.
- `devkit-a11y`: a Playwright whose own Chromium build is not installed launches the newest build Playwright installed (or `DEVKIT_A11Y_CHROMIUM`) and says which, instead of "could not run"; no browser at all, an unscannable home page, and a page or view axe could not scan are not measured, never a warning that passes.
- `default.json` (Renovate): `prConcurrentLimit` is 10 (Renovate's default), not 3. Pull requests that wait on a human held all three slots, so a release of d1-dump, devkit or site-runtime stayed under Rate-Limited on the Dependency Dashboard of carrel, germomics and others and opened no PR. `prHourlyLimit` 2 still paces creation. A pin of one of Dustin's own packages automerges on green like its minor and patch, so it no longer waits for a human.
- `devkit-shared`: the expired `failsFrom: "0.21.0"` markers are gone; those rules fail as they have since 0.21.0. `review` and `scorecard` still warn until 0.22.0.
- `devkit-live`: area 10 runs `prelum-chart-audit` without `--strict-frame`, which has changed nothing since the frame became an error by default; Prelum drops the flag next.

## 0.21.2 (2026-11-04)

- `devkit-ops-audit` (area 8, round 2): with `--repo`, a GitHub read that fails (401, 403, 429, a 5xx, no answer) is "could not run", exit 2, never a warning and exit 0, so a broken token cannot show green. New H5: `/health`'s `checks` against the bindings the repository's wrangler config declares (`--wrangler <path>`, else the root config), each binding without a check an error unless `.ops-audit.json` beside the config names it under `unprobed` with a reason (or maps it to its check under `checks`). N6 now asks for the shared error page: the 404 is HTML with a `<title>` and Capsomer's ErrorPage region (class `cap-error-page`, `ERROR_PAGE_MARKER`), not any `text/html`.
- `live/areas.json`: area 8 gives `--repo` to bsw, Capsid's MCP (with `--drill-workflow restore-rehearsal.yml`, Capsid's drill) and the three admin MCPs (each with its `--wrangler`), and Foxing its `apps/web` config.
- `restore-drill.yml` (R3): after the D1 drill, "Restore a sample of files and check the bytes" runs d1-dump v0.11.0's `drill-files` on the same bucket: a sample of each files backup (`files-sample`, default 5) restored with `restoreFiles` into scratch and checked against the copies' bytes and etags. Needs d1-dump v0.11.0 released first.
- `worker-deploy.yml` (D4): a gradual rollout that passed the live gate is judged by its errors too. "Compare the error rates" reads both versions' requests and errors since the split from the GraphQL Analytics API and refuses the new version (rolled back) when it has 3 or more errors at more than twice the old rate and a point above it; under 20 requests it promotes on the gate with a warning; an unreadable read leaves the split (exit 3). The token needs Account Analytics Read. `gradual-percent` and `preview` stay opt-in: README, "Why both stay opt-in".

## 0.21.1 (2026-11-03)

- `review.yml`: the automatic PR reviewer (D5), an advisory four-week trial from 2026-11-03. On each same-repository pull request that is not a draft or Renovate's, it sends the job's OIDC token to Capsid (`POST /review/run`), which reads the pull request through its GitHub App, reviews it with DeepSeek V4.1 Flash on Workers AI through the account's AI Gateway and records the verdict; `scripts/review-check.mjs` writes it to a `review verdict` check (neutral, or skipped) and the job summary, never a comment. No secret. The caller is `examples/review-caller.yml`; its job grants `id-token: write` and `checks: write`. `devkit-shared` asks for it in every repository, as a warning until 0.22.0.

## 0.21.0 (2026-11-01)

- **The rules that were warnings until 0.21.0 now fail**: local copies of shared exports found by name, test fakes devkit ships (`./github`, `./access`, `./network`, `./d1`), the AI code rules (C1, C2, C5, C6, C13, W5, R2), an MCP server more than one minor behind site-runtime, and every devkit workflow a repository's kinds need (`checks`, `workflow-audit`, `dependencies`, `worker-size`, `no-bloat`, `conformance`, `bump-consumers`). Every repository's default branch passed this check before the release.
- **Removed:** `ai-author.yml`, `pr-footer.yml` and `shared.yml`, which `checks.yml` replaced in 0.20.23, and their example callers; `family.yml` and the `devkit-family` bin, the names before 0.20.8; reading `.family.json` (it is `.shared.json`); and the `devkit:` input pin rule, which only `ai-author.yml` took. The shared-code check now asks for `checks` where it asked for `ai-author`, `pr-footer` and `shared`.
- Wording: "shared feature" and "the network's faces" where the messages said "family".

## 0.20.25 (2026-11-01)

- `rollback-drill.yml`: the weekly rollback drill (checklist F2). It deploys a known good version of a test Worker (`drill/worker.mjs`, `devkit-rollback-drill` on workers.dev), plants a bad deploy through this commit's `worker-deploy.yml`, and its `verdict` job passes only when the live gate refused the planted deploy and rolled the Worker back to the known good version, read from `/health` and from Cloudflare's deployment list. Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in devkit.
- `worker-deploy.yml`: `drill` input (default false), for the drill only: the live gate's failure does not fail the caller's run. The gate's steps are unchanged.

## 0.20.24 (2026-11-01)

- `scorecard.yml`: OpenSSF Scorecard for every public repository (checklist C5), weekly and on each push to the default branch. It publishes the score to the OpenSSF API (the public score and badge), uploads the SARIF to code scanning, and its `scorecard gate` job fails when the aggregate score falls below the last published one, naming each check that fell (`tolerance` input, 0 by default). The job that publishes holds only the steps the Scorecard API accepts. The caller is `examples/scorecard-caller.yml`; devkit runs it on itself (`scorecard-self.yml`). `devkit-shared` asks for it in a public repository, as a warning until 0.22.0.
- `release.yml`: build provenance (C7). Each new release packs the tagged tree with `npm pack --ignore-scripts`, attests the tarball with `actions/attest-build-provenance` and attaches it to the release, so `gh attestation verify` can check a release came from this workflow. The caller's job now grants `id-token: write` and `attestations: write` beside `contents: write`; a caller that does not fails to start, so update the permissions with the pin. `build: true` (with `node-version-file`, `.node-version` by default) is Capsomer's release: it runs `npm ci`, drops the prepare script and tags a release commit holding the built files, so Capsomer and site-runtime release through this file instead of copies of it.
- `worker-deploy.yml`: StepSecurity Harden-Runner first in every job (C8), in `audit` mode, recording each host a job reaches and refusing sudo and containers. `egress-policy: block` with `allowed-endpoints` turns the record into a rule once each site's hosts are known.

## 0.20.23 (2026-11-01)

- `checks.yml`: the small checks in one job. It runs the footer strip (`pr-footer.yml`), the trailer check (`ai-author.yml`) and the shared-code check (`shared.yml`) on one runner instead of three, from devkit at the caller's pin, with nothing installed. An edit of a pull request description runs only the footer step, and its concurrency group never cancels a run checking the code. The caller is `examples/checks-caller.yml`. `devkit-shared` counts it as calling all three and now names it as the caller to add. The three separate workflows keep working until every repository has moved.
- `devkit-live` and `live.yml`: the MCP test grants (area 11). `live.yml` passes one `MCP_TEST_GRANT_<HOST>` secret per MCP server (Capsid, Carrel, the Dustin Edwards, Foxing and Foxhound admin servers, and Foxhound's merchant server), and `devkit-live` hands them only to a check marked `"grants": true` in `live/areas.json` (area 11's `site-runtime-ai-audit`), so no other check's code holds a server's key. Capsid's grant goes to `/ops/mcp` (`--grant-path`, site-runtime 0.67.2), where its agent keys are taken. With a grant the audit also runs tools/list (T1-T4, T7, T9, T12), the conformance server scenarios (P3, P4, P7) and the rate-limit burst (S1); a server without its secret is still checked without a token.
- `devkit-live`: a reported check's `site_reports` reads one site's result from another reporter, keyed by site id. Area 2's `signed-in-security` reads Carrel Desk from Carrel's own report (`carrel-mcp.dustinedwards.info/reports/signed-in-security.json`, Desk graded in-process as the Owner) and the Portal from Capsid's, so no Access service token is needed for Desk.
- Area 6 on the scoreboard checks kind `app` too (`live/areas.json`), so the daily run grades the Capsid Portal with `site-runtime-images` (0.61.0 or later reports a home page that sends a stranger to a sign-in as one C1 error: a shared link shows the sign-in's card). Carrel Desk is skipped for area 6, having nothing public to share, and the signed-in pages of both are listed as unchecked.
- `devkit-live`: an area's `unchecked` names what its checks cannot reach; the board lists each one and the job is not finished while any remain. Area 10 runs `prelum-chart-audit --strict-frame`, gives Foxhound its three demo routes through `site_args` (`--start`, `--pages`, from Prelum v0.25.0), and lists the Capsid Portal, Foxing's /stats, /year and /goals and Carrel desk as unchecked (signed-in only).

## 0.20.22 (2026-10-31)

- `worker-deploy.yml`: a gradual rollout runs `wrangler triggers deploy` after the split. A version upload leaves routes, custom domains and cron schedules as they were (Cloudflare Docs, "Deployment management"), so a changed cron would have stayed on the old schedule. The input and README now also say gradual is not for a Worker that declares its Durable Objects in `exports` (area 8, D4).

## 0.20.21 (2026-10-31)

- `conformance.yml`: the MCP conformance gate on Actions (area 11, P2 to P7 and P10). It runs `devkit-conformance` from the server's own install against its `.conformance.json`, in `working-directory` for a server in `mcp/`, the job Carrel ran on its own. The caller is `examples/conformance-caller.yml`. The network check (`devkit-shared`) asks for it, as a warning until 0.21.0, in every repository with an MCP server (a source file importing site-runtime `./mcp-server` or `./mcp-login`); a CI step that runs `devkit-conformance`, as Carrel's does, counts.
- `devkit-shared` checks the AI code (area 11), each finding naming its checklist item, as warnings until 0.21.0: Anthropic's Messages API called outside site-runtime `./anthropic` (C1, G1); a Workers AI `AI.run` without `signal`, `gateway` or `max_tokens` (C2, G1, C5); an AI Search answer or reranker with no timeout near it (C2, C13); JSON cut out of a model's free text with a regex, in a file that calls a model (C6); a prompt's own dash rule instead of WRITING_RULES (W5); and `fireRoutine` imported, a routine fired outside `fireOnce` (R2). A file kept on purpose is excused in `.shared.json` "copies". On the family's main branches today: Capsid 2 (the AI Search reranker's timeout, its own routine guard), Carrel 1 (R2), Foxhound 4 and germomics 3 (W5), site-api 1 (C6); none elsewhere.
- `devkit-shared` holds every MCP server to one site-runtime door (S7): an MCP server's site-runtime pin more than one minor behind the newest release fails from 0.21.0, whatever the release's age; one minor behind is the usual warning.

## 0.20.20 (2026-10-31)

- `devkit-shared`: a site-runtime registry entry (`@dustinedwards/site-runtime/sites`) counts as the `headers` and `csp` features. A static site's Worker is `staticSite({ site })` and its `_headers` comes from `site-runtime-headers`, both of which build the set and the page policy from the entry, so it no longer imports `./headers` or `./csp` itself (area 2, site-runtime 0.58.0).

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
