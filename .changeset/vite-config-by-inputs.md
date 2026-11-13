---
"@dustinedwards/devkit": minor
---

devkit-no-bloat judges a Knip plugin config in code (a Vite config) by the inputs Knip takes from it, not by its body. When Knip takes nothing new from the config at the base and now, a change to the config or to the modules it imports counts as code, not as a change of measure. The inputs come from `knip --debug`, with the base checked out beside the change. Pages the build writes and the scripts those pages load don't count as new inputs. A config that adds an entry or a dependency is still a change of measure. This lets a site's docs rebuild (Capsomer #405) go through without a bypass.
