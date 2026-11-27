---
"@dustinedwards/devkit": patch
---

devkit-no-bloat no longer refuses a pull request whose only change to a checks workflow's `on` is dropping `edited` from `pull_request.types`. A description edit adds no commit, so dropping its runs skips no check of code. Every other change to `on` is still refused.
