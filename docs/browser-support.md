# Browser support

One policy for every site and app in the network, read by people and by agents (Chrome's Modern Web Guidance reads a
project's stated policy in place of its default, "Interpreting Browser Support & Fallbacks"). It is stated in
[Baseline](https://web.dev/baseline) terms, the web platform's own status for a feature across the core browsers:
Chrome and Edge, Firefox and Safari, on desktop and on phones.

| Baseline status                                                      | How we use it                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Widely available** (in every core browser for 30 months or more)   | Freely, with no fallback.                                                                                                                                                 |
| **Newly available** (in every core browser, for less than 30 months) | Where it is the right tool, with a graceful degrade or a small fallback of our own for the browsers a few versions behind.                                                |
| **Limited availability** (missing from at least one core browser)    | Only as progressive enhancement: feature-detected (`@supports`, `CSS.supports`, `"x" in obj`), and never required for content or a core task, which must work without it. |

- **No polyfills.** A Newly available feature that a core task needs gets a short fallback of our own or a different
  design, never a library that rebuilds the feature.
- **Security features are enhancements too.** Trusted Types, Integrity-Policy and the like are turned on where the
  browser has them; a browser without them still gets a working page, and still gets every server-side protection.
- **The status is the source's, not memory's.** Check the feature's Baseline status on its MDN page or in the Modern Web
  Guidance guide for it before relying on it, and name the status in the code comment when the choice is not obvious.
