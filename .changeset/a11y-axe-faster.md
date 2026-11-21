---
"@dustinedwards/devkit": patch
---

`devkit-a11y` runs axe about four times faster on a page with thousands of elements: it asks for violations only and analyses a page with no frames in the page itself. Enarratio's scan went from 9 to 4 minutes with the same findings. `live` also caps the Foxing `prelum-audit` at 200 pages, as it does the chart audit.
