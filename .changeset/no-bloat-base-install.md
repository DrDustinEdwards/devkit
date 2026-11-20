---
"@dustinedwards/devkit": patch
---

devkit-no-bloat reads the base's config against the base's own packages. A change that removes a package a Vite or other Knip config imports, and edits that config in the same change, left the base's config unloadable, so no config was settled and the edit was refused as a change of measure alongside code. When the lockfile differs from the base's, the base is now installed (`npm ci --ignore-scripts`) before its config is read.
