---
"@dustinedwards/devkit": minor
---

New `release-batch.yml` and `release-pr.yml`: once a day, each shared package with changesets waiting gets one "Release X" pull request. Before it opens, the candidate is built and tested in every public consumer, at the consumer's own pins and then with the candidate. It merges itself once its checks pass. The pull request is made with a private GitHub App's token (variable `RELEASE_APP_CLIENT_ID`, secret `RELEASE_APP_PRIVATE_KEY`), because one made with `GITHUB_TOKEN` starts no checks. `bump-consumers.yml` takes a `repository` input and returns the consumers it found.
