---
"@dustinedwards/devkit": patch
---

The scorecard gate only warns when Code-Review is the only check that fell. It counts how many of the last 30 changes another person approved, so with one owner and Renovate's automerges it slides down by itself and no change to the code brings it back; it left dustinedwards.info and Carrel red (6.8 to 6.7, Code-Review 2 to 1). A fall in any other check fails as before.
