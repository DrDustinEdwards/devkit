---
"@dustinedwards/devkit": minor
---

devkit's peer ranges for Oxlint, oxlint-tsgolint and Oxfmt are open (`>=1.92.0 <2`, `>=7.0.2006 <8`, `>=0.77.0 <1`), so a Renovate bump of an Oxc tool in a repository is no longer a peer conflict that leaves its lockfile stale. The syntax-tree readers (`./node/syntax`, `devkit-destructive`, `devkit-secrets`) read through `@typescript/typescript6`, a dependency of devkit, and `typescript` is no longer a peer: TypeScript 7 has no JavaScript compiler API, so a repository on 7 failed them. devkit itself moves to TypeScript 7.0.2.
