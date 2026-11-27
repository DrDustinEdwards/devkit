---
"@dustinedwards/devkit": patch
---

`devkit-pre-push` installs the pinned codespell for the user (`pip install --user`) when neither codespell nor pipx is on PATH, so the shared-code check is not skipped in a thread that has neither.
