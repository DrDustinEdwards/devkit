# Changelog

## [0.6.0]

- `.github/workflows/worker-deploy.yml`: the shared deploy, verify and rollback workflow for a Cloudflare Worker, ported from capsid's `deploy` and `live gate` jobs (capsid's merge pipeline design, section 6, PR 8). Jobs `deploy` and `live gate`, the step "Roll back the deploy this run shipped", and capsid's three rollback annotations byte for byte, so capsid's watcher records the deploy in `deploy_outcomes`. Wrangler 4.107.0, pinned. Callers pin this release's commit sha.
- `scripts/rollback-guard.mjs`: capsid's rollback guard, byte for byte, inlined into the workflow by `scripts/inline-rollback-guard.mjs`. Its tests are ported and run in CI, with run cases that execute the live gate's steps against stubbed curl and wrangler.
- `examples/worker-deploy-caller.yml`: the shape of a caller.
- README: "The shared deploy", with the inputs, the secrets and the limits of a Cloudflare rollback.
