---
"@dustinedwards/devkit": patch
---

devkit-live installs site-runtime beside Prelum when it runs Prelum's checks. Prelum stopped declaring site-runtime as a peer on 2026-11-13, so `prelum-audit`, `prelum-content` and `prelum-chart-audit` crashed with ERR_MODULE_NOT_FOUND on every site and areas 1, 4 and 10 of the scoreboard read "could not measure".
