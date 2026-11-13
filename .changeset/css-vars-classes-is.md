---
"@dustinedwards/devkit": patch
---

`devkit-css-vars` `classes`: a stylesheet that lists a class only inside `:is()` or `:where()` no longer counts as styling it. Capsomer's `layout-gap.css` lists every layout in `:is(.cap-stack, .cap-panes, ...)[data-gap]`, so loading it passed a Portal that had dropped `layout-panes.css`; now that fails.
