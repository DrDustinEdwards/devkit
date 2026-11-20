---
"@dustinedwards/devkit": patch
---

The dev toolbar's performance audit reads an image's size from the request that loaded it instead of fetching the image again, which downloaded lazy images the page had deferred and froze an animated SVG's CSS animations in Safari. An off-screen lazy image that has not loaded is skipped. Astro 7.4.13 made the same fix.
