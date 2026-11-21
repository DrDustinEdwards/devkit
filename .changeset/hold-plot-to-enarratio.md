---
"@dustinedwards/devkit": patch
---

The shared Renovate policy holds `@observablehq/plot` in every repository except Enarratio. Enarratio draws with Plot, so a Plot release that changes how it draws is accepted in Enarratio first, and a site takes the new Plot with the Enarratio release that carries it. A site that bumped Plot alone (carrel, dustinedwards-info and Prelum did on 2026-11-19) rendered charts differently from the Enarratio it pins.
