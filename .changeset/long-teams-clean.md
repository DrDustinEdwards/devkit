---
"@dustinedwards/devkit": patch
---

`devkit-no-bloat`: a change of measure or of the workflow that runs the check no longer fails on the comment counts. They are recorded, not gated, and code changes move them without a baseline write, so `--write-baseline` on a measure-only change (a devkit bump with a new schedule, a Knip plugin config) was refused as "lowers lines" for drift since the last write.
