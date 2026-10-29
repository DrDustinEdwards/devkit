// Astro's dev toolbar for the family's sites, in `vite dev` only (`apply: "serve"`): a bar at the foot of every page
// with Inspect (the page's islands), Audit (accessibility and performance) and Settings. The browser half is
// dev-toolbar-client.mjs, which carries Astro's license; this half serves it and puts it on the page.
//
// - A page Vite serves gets the script through transformIndexHtml.
// - A site on siteScript gets it from its dev /site.js, which loads it (site-script.mjs).
// - A React Router site, whose HTML Vite does not transform, adds it to its root in dev:
//     {import.meta.env.DEV && <script type="module" src="/@devkit/toolbar.js" />}
//
// The audit's accessibility half is axe-core, served at /@devkit/axe.js from the site's own node_modules, so this
// package still has no dependencies. A site without axe-core gets the performance half and a note saying so.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export const TOOLBAR_PATH = "/@devkit/toolbar.js";
const AXE_PATH = "/@devkit/axe.js";
const CLIENT = new URL("./dev-toolbar-client.mjs", import.meta.url);

/** One line of classic script that loads the toolbar, for a page whose only script is not a module. */
export const TOOLBAR_LOADER = `;(()=>{const s=document.createElement("script");s.type="module";s.src=${JSON.stringify(TOOLBAR_PATH)};document.head.append(s)})();`;

/** Serves the toolbar and axe-core under /@devkit/ on a dev server's middleware. */
export function serveToolbar(server) {
  server.middlewares.use(TOOLBAR_PATH, (_req, res) => {
    res.setHeader("Content-Type", "text/javascript");
    res.end(readFileSync(CLIENT));
  });
  server.middlewares.use(AXE_PATH, (_req, res) => {
    let file;
    try {
      file = createRequire(join(server.config.root, "package.json")).resolve("axe-core/axe.min.js");
    } catch {
      res.statusCode = 404;
      return res.end("axe-core is not installed in this site");
    }
    res.setHeader("Content-Type", "text/javascript");
    res.end(readFileSync(file));
  });
}

export function devToolbar() {
  return {
    name: "devkit-dev-toolbar",
    apply: "serve",
    configureServer: serveToolbar,
    transformIndexHtml: () => [{ tag: "script", attrs: { type: "module", src: TOOLBAR_PATH }, injectTo: "body" }],
  };
}
