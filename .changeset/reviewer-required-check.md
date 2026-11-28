---
"@dustinedwards/devkit": minor
---

The reviewer's BLOCK verdict now fails the `review verdict` check and the reviewer job, so the job's check (`checks / Reviewer`) can be a required check that GitHub's auto-merge waits for. APPROVE and CHANGES stay neutral, and a reviewer that cannot run still blocks nothing.
