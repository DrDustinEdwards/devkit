// The Vite plugin behind a site that ships no framework to the browser (julieedwards-info, bsw): the site's
// one browser module, bundled on its own into a classic script served at /site.js, so no React reaches the
// page and a CSP's script-src 'self' covers it with no inline script. `vite dev` serves it fresh per request;
// a build emits it into the client output. Vite is the site's own, not a dependency of this package.
//
// Islands (islands.mjs): each file in `islands` (default app/islands/) is bundled on its own into an ES module at
// /islands/<name>.js, which the page imports only when an element names it, so a page pays for the scripts it uses.
import { readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { build } from "vite";
import { serveToolbar, TOOLBAR_LOADER } from "./dev-toolbar.mjs";
import { ISLAND_NAME } from "./islands.mjs";

// An island is built as an app entry, not a library, so it is minified whole (library mode keeps an ES module's
// whitespace) and keeps its default export.
async function bundle(entry, format = "iife") {
  const out = await build({
    configFile: false,
    logLevel: "warn",
    build:
      format === "iife"
        ? { write: false, minify: true, lib: { entry, formats: ["iife"], name: "site", fileName: () => "out.js" } }
        : {
            write: false,
            minify: true,
            modulePreload: false,
            rollupOptions: {
              input: entry,
              preserveEntrySignatures: "exports-only",
              output: { format: "es", entryFileNames: "out.js", inlineDynamicImports: true },
            },
          },
  });
  const result = Array.isArray(out) ? out[0] : out;
  if (!("output" in result)) throw new Error(`${entry}: the bundle produced no output`);
  return result.output[0].code;
}

/** The island modules under `dir`: name to file. A folder that does not exist has none. */
function islandFiles(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return new Map();
  }
  const files = new Map();
  for (const file of names.filter((f) => /\.(ts|mts|js|mjs)$/.test(f) && !/\.(test|spec|d)\./.test(f))) {
    const name = basename(file, extname(file));
    if (!ISLAND_NAME.test(name)) throw new Error(`site-script: island file "${file}" must be named in lower case words and hyphens`);
    if (files.has(name)) throw new Error(`site-script: two island files are named "${name}"`);
    files.set(name, join(dir, file));
  }
  return files;
}

// `toolbar` (on by default) adds Astro's dev toolbar (dev-toolbar.mjs) to the dev /site.js; a build never has it.
export function siteScript({ entry = "app/site.ts", islands = "app/islands", toolbar = true } = {}) {
  return {
    name: "site-script",
    configureServer(server) {
      if (toolbar) serveToolbar(server);
      server.middlewares.use("/site.js", async (_req, res) => {
        res.setHeader("Content-Type", "text/javascript");
        res.end((await bundle(entry)) + (toolbar ? TOOLBAR_LOADER : ""));
      });
      server.middlewares.use("/islands/", async (req, res) => {
        const name = (req.url ?? "").replace(/^\//, "").replace(/\.js(?:\?.*)?$/, "");
        const file = islandFiles(islands).get(name);
        // Not handed on: Vite's page fallback would answer an unknown island with the HTML page.
        if (!file) {
          res.statusCode = 404;
          return res.end(`no island named "${name}"`);
        }
        res.setHeader("Content-Type", "text/javascript");
        res.end(await bundle(file, "es"));
      });
    },
    async generateBundle() {
      if (this.environment.name !== "client") return;
      this.emitFile({ type: "asset", fileName: "site.js", source: await bundle(entry) });
      for (const [name, file] of islandFiles(islands)) {
        this.emitFile({ type: "asset", fileName: `islands/${name}.js`, source: await bundle(file, "es") });
      }
    },
  };
}
