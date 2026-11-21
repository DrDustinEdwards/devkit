---
"@dustinedwards/devkit": patch
---

devkit-a11y: the Tab walk starts from the top of the page. Its opening click had set Tab's starting point inside an error page's whole-screen main, so the first Tab skipped the skip link and bsw's 404 failed L2.
