// The Vite plugin behind a site that ships no framework to the browser (julieedwards-info, bsw): the site's
// one browser module, bundled on its own into a classic script served at /site.js, so no React reaches the
// page and a CSP's script-src 'self' covers it with no inline script. `vite dev` serves it fresh per request;
// a build emits it into the client output. Vite is the site's own, not a dependency of this package.
import { build } from "vite";

async function bundle(entry) {
  const out = await build({
    configFile: false,
    logLevel: "warn",
    build: {
      write: false,
      minify: true,
      lib: { entry, formats: ["iife"], name: "site", fileName: () => "site.js" },
    },
  });
  const result = Array.isArray(out) ? out[0] : out;
  if (!("output" in result)) throw new Error("site.js: the bundle produced no output");
  return result.output[0].code;
}

export function siteScript({ entry = "app/site.ts" } = {}) {
  return {
    name: "site-script",
    configureServer(server) {
      server.middlewares.use("/site.js", async (_req, res) => {
        res.setHeader("Content-Type", "text/javascript");
        res.end(await bundle(entry));
      });
    },
    async generateBundle() {
      if (this.environment.name !== "client") return;
      this.emitFile({ type: "asset", fileName: "site.js", source: await bundle(entry) });
    },
  };
}
