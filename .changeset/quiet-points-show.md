---
"@dustinedwards/devkit": patch
---

devkit-a11y no longer reports a focused control as covered when it takes no pointer events itself, as the chart point buttons do inside Enarratio's pointer-less layer; the check now asks what is on top at the control's centre by paint order.
