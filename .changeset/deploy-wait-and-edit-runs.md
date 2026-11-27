---
"@dustinedwards/devkit": minor
---

The gradual rollout's wait ends early: the live gate reads the analytics every 30 seconds and runs the verify command as soon as the new version has served 20 requests, enough to compare error rates, or after `gradual-minutes`, now at most 3 by default (was a fixed 10). The error comparison moved into `scripts/error-rates.mjs`; the verify command still gets no Cloudflare token. An edit of a pull request's description no longer reruns the checks: `examples/pr-caller.yml` drops the `edited` trigger, and the new `examples/footer-caller.yml` strips the footer on an edit with devkit's footer action, skipping Renovate's edits. `check-callers.mjs` holds a devkit action to the same full-sha pin as a reusable workflow.
