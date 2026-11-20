---
"@dustinedwards/devkit": patch
---

The network copy scan holds its counts exactly, as no-bloat does: a count below its baseline fails until live/copies.json is lowered. The baseline had stayed at 65 copies and 126 names while the scan measured 15 and 115 (2026-11-20), so a new copy could have taken the room; both are lowered to today's counts. The package-overlap count (9 against a baseline of 7) is unchanged and still fails the job.
