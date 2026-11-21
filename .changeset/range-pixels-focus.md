---
"@dustinedwards/devkit": patch
---

devkit-a11y: a range input's focus ring, drawn on its thumb (a shadow part Chromium's computed style cannot read), is found by comparing the pixels around the slider focused and unfocused. Foxhound's three sliders no longer fail L2.
