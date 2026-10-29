// The Vite plugin behind a site that ships no framework to the browser (julieedwards-info, bsw): the site's
// one browser module, bundled on its own into a classic script served at /site.js, so no React reaches the
// page and a CSP's script-src 'self' covers it with no inline script. `vite dev` serves it fresh per request;
// a build emits it into the client output. Vite is the site's own, not a dependency of this package.
//
// Islands (islands.mjs): each file in `islands` (default app/islands/) becomes an ES module, which the page imports
// only when an element names it, so a page pays for the scripts it uses. A build bundles them all in one pass, so code
// two islands share is one chunk under /islands/chunks/, fetched once, and every file is named by its content
// (/islands/<name>-<hash>.js), so a site can cache /islands/* immutable. The built /site.js carries the name to URL
// map, which startIslands reads; `vite dev` serves /islands/<name>.js, the one asked for, whole. Chunks are
// same-origin, so script-src 'self' still covers them.
//
// A server-rendered app reads the same map, and each island's gzip size, from `virtual:islands`:
//   import { ISLAND_URLS, ISLAND_GZIP_BYTES } from "virtual:islands";
import { readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { constants, gzipSync } from "node:zlib";
import { build } from "vite";
import { serveToolbar, TOOLBAR_LOADER } from "./dev-toolbar.mjs";
import { ISLAND_NAME } from "./islands.mjs";

// Islands are built as an app, not a library, so they are minified whole (library mode keeps an ES module's
// whitespace) and keep their default export ("exports-only").
const ISLAND_BUILD = { write: false, minify: true, modulePreload: false };

/** The module a server-rendered app imports the island URLs and sizes from. */
const VIRTUAL = "virtual:islands";
const RESOLVED = `\0${VIRTUAL}`;
/** Replaced in a built /site.js with the name to URL map; islands.mjs reads it, and in dev finds it undefined. */
const MANIFEST_GLOBAL = "__DEVKIT_ISLANDS__";

async function run(options, define) {
  const out = await build({ configFile: false, logLevel: "warn", define, build: options });
  const result = Array.isArray(out) ? out[0] : out;
  if (!("output" in result)) throw new Error("site-script: the bundle produced no output");
  return result.output;
}

/** `entry` alone, as a classic script (/site.js, with the built island URLs when given) or, for an island in `vite dev`, one whole ES module. */
async function bundle(entry, format = "iife", urls) {
  const output = await run(
    format === "iife"
      ? { write: false, minify: true, lib: { entry, formats: ["iife"], name: "site", fileName: () => "out.js" } }
      : {
          ...ISLAND_BUILD,
          rollupOptions: {
            input: entry,
            preserveEntrySignatures: "exports-only",
            output: { format: "es", entryFileNames: "out.js", inlineDynamicImports: true },
          },
        },
    urls && { [MANIFEST_GLOBAL]: JSON.stringify(urls) },
  );
  return output[0].code;
}

/** Every island in one build: islands/<name>-<hash>.js each, and what two share once under islands/chunks/. */
function bundleIslands(files) {
  return run({
    ...ISLAND_BUILD,
    rollupOptions: {
      input: Object.fromEntries(files),
      preserveEntrySignatures: "exports-only",
      output: { format: "es", entryFileNames: "islands/[name]-[hash].js", chunkFileNames: "islands/chunks/[name]-[hash].js" },
    },
  });
}

/**
 * Each island's URL, and the gzip bytes (level 9, what `gzip -9` reports) of everything a page that loads only that
 * island downloads: its file and the chunks it imports, each file once.
 */
function manifestOf(output) {
  const chunks = new Map(output.filter((o) => o.type === "chunk").map((o) => [o.fileName, o]));
  const urls = {};
  const gzipBytes = {};
  for (const chunk of chunks.values()) {
    if (!chunk.isEntry) continue;
    const files = new Set();
    const add = (file) => {
      if (files.has(file) || !chunks.has(file)) return;
      files.add(file);
      for (const imported of chunks.get(file).imports) add(imported);
    };
    add(chunk.fileName);
    urls[chunk.name] = `/${chunk.fileName}`;
    gzipBytes[chunk.name] = [...files].reduce((n, f) => n + gzipSync(chunks.get(f).code, { level: constants.Z_BEST_COMPRESSION }).length, 0);
  }
  return { urls, gzipBytes };
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
// `entry: false` is for an app with its own client script (a React Router site): no /site.js, islands only.
export function siteScript({ entry = "app/site.ts", islands = "app/islands", toolbar = true } = {}) {
  let dev = false;
  // One islands build per build process, so the client output and the server's `virtual:islands` agree.
  let built = null;
  const islandsBuild = () => {
    if (!built) {
      const pending = bundleIslands(islandFiles(islands));
      pending.catch(() => built === pending && (built = null));
      built = pending;
    }
    return built;
  };
  return {
    name: "site-script",
    configResolved(config) {
      dev = config.command === "serve";
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      const files = islandFiles(islands);
      const output = files.size ? (dev ? await bundleIslands(files) : await islandsBuild()) : [];
      const { urls, gzipBytes } = manifestOf(output);
      // `vite dev` serves each island whole by its plain name; the sizes are still the build's.
      if (dev) for (const name of Object.keys(urls)) urls[name] = `/islands/${name}.js`;
      for (const out of output) for (const file of out.moduleIds ?? []) if (!file.startsWith("\0")) this.addWatchFile(file);
      return `export const ISLAND_URLS = ${JSON.stringify(urls)};\nexport const ISLAND_GZIP_BYTES = ${JSON.stringify(gzipBytes)};\n`;
    },
    configureServer(server) {
      if (toolbar) serveToolbar(server);
      if (entry) {
        server.middlewares.use("/site.js", async (_req, res) => {
          res.setHeader("Content-Type", "text/javascript");
          res.end((await bundle(entry)) + (toolbar ? TOOLBAR_LOADER : ""));
        });
      }
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
      const output = islandFiles(islands).size ? await islandsBuild() : [];
      for (const out of output) {
        this.emitFile({ type: "asset", fileName: out.fileName, source: out.type === "chunk" ? out.code : out.source });
      }
      if (entry) this.emitFile({ type: "asset", fileName: "site.js", source: await bundle(entry, "iife", manifestOf(output).urls) });
    },
  };
}
