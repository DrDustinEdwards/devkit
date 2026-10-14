# devkit

Shared configuration for the Dustin Edwards repositories, public so private repositories can use it.

- `default.json`: the Renovate policy (ruling 33, `dustinedwards/decisions.md`). Each repository's `renovate.json` extends it.
- `.github/workflows/improve-score.yml`: the shared improve-score workflow (D5.1). It is the `score` job that used to be copied byte for byte into five repositories, now written once. It is called, never run on its own.
- `.github/workflows/bump-consumers.yml`: the release side of the own-packages rule in `default.json`. A package repository calls it on a tag push, and it starts a Renovate run in every repository whose `package.json` depends on that package, by ticking the manual-run box on that repository's Dependency Dashboard. Consumers are found from the manifests each time, never listed. It needs the `RENOVATE_TRIGGER_TOKEN` secret described in its header.
- `.github/workflows/no-bloat.yml`: the no-bloat report (Knip and jscpd against the repository's baseline), written once for the three repositories that each wrote their own. Warn-only: it never turns a pull request red. It runs the package's `devkit-no-bloat` bin, so the caller lists the package in its devDependencies. Public repositories call it on every pull request; the four private ones weekly. See below.
- `.github/workflows/ai-author.yml`: the gate that refuses an AI attribution trailer on a commit a push or pull request adds, and on a pull request a commit authored or committed as Claude. Capsid alone had it; every repository calls it, the private ones included, since it takes seconds. It runs the package's `devkit-check-trailers` bin from the devkit tag the caller pins.
- `.github/workflows/worker-deploy.yml`: the shared deploy, verify and rollback workflow for a Cloudflare Worker (capsid's merge pipeline design, section 6, PR 8). It is capsid's own `deploy` and `live gate` jobs, ported. See "The shared deploy" below.
- `scripts/rollback-guard.mjs`: capsid's rollback guard, byte for byte, which the deploy workflow carries inline. `scripts/inline-rollback-guard.mjs` writes it into the workflow after an edit.
- `scripts/check-callers.mjs`: the check a caller runs on its own workflow files. Every call to this repository's workflows must pin a full 40-character commit sha, and `secrets: inherit` is refused.
- `examples/no-bloat-caller.yml`, `examples/ai-author-caller.yml` and `examples/worker-deploy-caller.yml`: the shape of each caller.
- `examples/improve-score-caller.yml`: the shape of a caller. The per-repository `build` job stays in the caller; only `score` is shared.
- `testing/` and `bin/`: the shared test helpers and the shared checks, the part of this repository that is a package (`@dustinedwards/devkit`). See below.
- `test/`: runs the bump-consumers script against a stub of the GitHub API, and holds the shared scorer to its isolation properties (no network and read-only mounts for attempt code, the signing key in exactly two steps and never in the container, every action pinned, the attempt branch never checked out) and the check to its pin rule, and the test helpers to the behaviour their consumers rely on. CI runs them.

## Changing the shared scorer

Only by a reviewed pull request here, and a change reaches a caller only when that caller's default branch takes a reviewed change to the sha on its `uses:` line. That is the point: an improve attempt can edit its own repository, never what measures it. Do not edit a caller's `uses:` line to a branch or a tag; `check-callers.mjs` fails on it.

## The shared deploy

`.github/workflows/worker-deploy.yml` deploys a Cloudflare Worker, checks it live, and rolls it back when the check refuses it. It is capsid's `deploy` and `live gate` jobs and `scripts/rollback-guard.mjs`, ported rather than redesigned, so every Worker site gets what capsid has. capsid keeps its own `ci.yml` for now; Carrel adopts this first. A caller (`examples/worker-deploy-caller.yml`) calls it on a push to its default branch, after its own checks, pinned to a full devkit sha, with a concurrency group that never cancels a deploy in flight.

Two jobs:

- `deploy` checks out, installs, runs the caller's pre-deploy guard, runs `wrangler deploy` with the wrangler version pinned in the file, and publishes the run attempt it shipped in. Never on a pull request.
- `live gate` polls the health URL (40 reads, 3 seconds apart) until its JSON `sha` is this run's commit, then runs the verify command. Exit 0 passes. Exit 1 is a refusal, and only a refusal runs "Roll back the deploy this run shipped": the rollback guard rolls back only when what is live is this run's commit (or /health is unreadable and the deploy ran in this same attempt), runs `wrangler rollback`, and reads /health until the sha moves. Exit 3, or a /health that never answered, is "could not run": the job fails and nothing rolls back.

capsid's watcher reads the job name `live gate`, the step name, and the step's three `::error::` sentences ("rolled back: was ...", "not rolling back. ...", "the rollback did not take effect: ...") to write `deploy_outcomes`, and the step summary carries `rollback_from=` and `rollback_to=`. `test/worker-deploy-workflow.test.mjs` fails on a change to any of them.

Inputs:

| Input | Required | Default | What it is |
|---|---|---|---|
| `worker-name` | yes | | The Worker's name, for `wrangler deploy --name` and `wrangler rollback --name`. |
| `health-url` | yes | | The live health route. It must answer JSON whose `sha` is the deployed commit (abbreviated to 7 or more hex characters is fine). |
| `verify-command` | yes | | The live checks, run in the working directory with `EXPECT_SHA` and `HEALTH_URL` set and no install. 0 passes, 1 refuses, 3 could not run. It gets no Cloudflare secret. |
| `node-version-file` | no | `.nvmrc` | As `actions/setup-node` reads it, from the repository root. |
| `working-directory` | no | `.` | Where the Worker and its `wrangler` config live. |
| `install` | no | `npm ci` | The deploy job's install. |
| `pre-deploy` | no | none | The caller's guards before the deploy (a migration check, a config rebuild, a build), run with the Cloudflare secrets. A failure stops the deploy. |
| `sha-var` | no | none | When set, the deploy passes `--var <name>:<this run's commit>`, so the Worker can report it on /health. |

Secrets, passed by name (`secrets: inherit` is refused by `check-callers.mjs`): `CLOUDFLARE_API_TOKEN`, a token that can deploy and roll back the Worker (Workers Scripts: Edit), and `CLOUDFLARE_ACCOUNT_ID`. Both are required, and a missing one fails the deploy loudly rather than skipping it.

The limits. Cloudflare's rollback swaps the Worker's code and bindings only. It is refused when D1 or KV resources changed between the two versions, and it never undoes a D1 migration (Cloudflare Docs, "Rollbacks"). A deploy that ran a migration is not made safe by this workflow: keep migrations a separate, human step, and check them in `pre-deploy`. Data recovery is D1 Time Travel, by hand (`wrangler d1 time-travel restore`). The rollback goes to the previous version, whatever that is; the guard is what stops a rerun from moving production onto the refused commit.

The guard is inlined into the workflow so a caller's one pinned sha fixes both. After an edit to `scripts/rollback-guard.mjs`, run `node scripts/inline-rollback-guard.mjs`; the test fails while the two differ.

## The shared test helpers

Test code that more than one repository needs, written once here so the copies stop drifting (`capsid/research/design-shared-tests.md`, D1 and D2 of job_bf31c124055e). Installed by tag, like site-api:

    "@dustinedwards/devkit": "github:DrDustinEdwards/devkit#v0.6.0"

Only `testing/`, `bin/` and this README are in the package. No dependencies and no test framework: they run in node and in workerd.

- `@dustinedwards/devkit/github`: `stubGitHub({ owner, repo, branch, files })`, a fake of the GitHub contents and Git Data API at the outbound fetch. An unknown host or route throws, blob shas are real, a tree applies only when the ref moves, `failNext` plants 500s and `history` plants the commit listing. `install: false` hands back the fake as `fetch` instead of installing it globally. `gitBlobSha` and `versionOf` come with it.
- `@dustinedwards/devkit/network`: `refuseNetwork({ hint })`, the global fetch that throws naming the URL, and `installFetch`, the swap under it and under the GitHub fake. Each returns its restore.

- `@dustinedwards/devkit/d1`: `resetDb(db, { keep })`, which empties every table `sqlite_master` lists in one batch, so a table a migration adds is cleared without anyone adding it to a list. A full-text table is cleared through itself and its shadow tables are left to it; foreign keys are checked at commit, so table order does not matter; `d1_migrations`, SQLite's and D1's own tables are never touched. It returns the tables it cleared.
- `@dustinedwards/devkit/access`: `await stubAccess({ issuer, audience, email, authorizationUrl })`, a fake of Cloudflare Access for SaaS for one sign-in. The token endpoint answers an RS256 ID token signed by a key made per stub, carrying the issuer, the audience, the email and the nonce from the authorization URL, and the JWKS serves its public half, so the code under test verifies it as it verifies Access's. `claims` adds to every token, `token(extra)` signs one directly (also what a test sends as `Cf-Access-Jwt-Assertion`, with `jwksUrl` set to the team's `/cdn-cgi/access/certs`), and `tokenRequests` holds what the token endpoint received. An unknown URL throws unless `fallback` answers it.

An entry point is added when a repository adopts it, so each one ships with a consumer: `/access` is capsid's sign-in stub, and capsid adopts it next. `/clock` waits until a repository needs it. A release is a tag; a consumer moves to it in its own pull request.

## The shared checks

Checks more than one repository runs in CI, as bins in the same package (D3 and D4 of job_bf31c124055e), so a check runs the same on a laptop as in the shared workflow that calls it.

- `devkit-no-bloat`: Knip and jscpd, each count compared with the baseline in the repository's `.no-bloat.json`, and what grew said as a `::warning::` line and a table in the job summary. It always exits 0: a number nobody has acted on is information, not a rule. A tool the repository installs runs from `node_modules/.bin`, any other through npx at the major in the config's `tools` (default `knip@6`, `jscpd@4`). `npx devkit-no-bloat --write-baseline` records the current counts. The config's fields are in the header of `bin/no-bloat.mjs`; capsid's `scripts/no-bloat-baseline.json` is already in the baseline's shape.
- `devkit-check-trailers`: capsid's `check-commit-trailers.mjs`, the same rules and exits. With no arguments it reads the range from the GitHub event (`EVENT`, `PR_BASE`, `PR_HEAD`, `PUSH_BEFORE`, `PUSH_AFTER`, set by `ai-author.yml`); locally, `npx devkit-check-trailers <base> <head> [--authors]`. Exit 1 names each commit and how to fix it; exit 2 means it could not read the commits, which is a failure, not a pass.
- `pr-footer.yml`: removes the "Generated by Claude Code" footer a cloud session's GitHub connection appends to pull request descriptions, the rule `devkit-check-trailers` holds commits to. Not a bin: the script (`scripts/strip-pr-footer.mjs`) is inline in the workflow, so a caller needs only the sha. The caller grants `pull-requests: write` and listens for `opened`, `reopened` and `edited` (`examples/pr-footer-caller.yml`); a hand run cleans every past pull request.

Per-repository measurements (capsomer's page weight, dustinedwards-info's route weight) stay in the repository, as a job beside the shared one.
