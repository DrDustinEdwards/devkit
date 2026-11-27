---
"@dustinedwards/devkit": minor
---

New `claude/hooks/pre-push.sh` (`devkit-pre-push`): a Claude Code hook that runs, before a `git push`, the fast checks CI would fail the push on (AI trailer or Claude author, `format:check`, `devkit-shared`, `devkit-no-bloat`, `devkit-worker-size`) and blocks it on a real finding; a check that cannot run is skipped and CI stays the gate. Add its entry to a repository's `.claude/settings.json` from the README. `devkit-worker-size --write-budget` lowers a budget to the next round number above the size (10 KiB from 1000 KiB, 5 from 100, 1 below), never raising one, and a run within budget says when a trim left room.
