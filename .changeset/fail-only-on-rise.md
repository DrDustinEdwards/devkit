---
"@dustinedwards/devkit": minor
---

devkit-no-bloat (Knip, jscpd, shared copies, legacy, tests, size) and devkit-copies fail only when a count rises above its baseline. A count below it passes with a warning to lower the baseline in the next change that touches it.
