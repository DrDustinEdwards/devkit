// Islands for a site that ships no framework (the browser half of site-script.mjs): a part of a server-rendered page
// that needs a script names it, and its module loads only when the page needs it, as Astro's client directives do.
//
//   <div data-island="gallery" data-client="visible" data-props='{"start":2}'>...the server's HTML...</div>
//
// `startIslands()` in the site's app/site.ts finds every such element and, per its `data-client`, imports
// /islands/<name>.js and calls its default export with the element and the parsed props:
// - `load` (the default): at once.
// - `idle`: when the browser is idle (`data-client-timeout` in ms caps the wait).
// - `visible`: when the element nears the viewport (`data-client-root-margin`, such as "200px").
// - `media`: when `data-client-media` matches, such as "(max-width: 50em)".
// Each island runs once. The page works before it runs, so an island only adds to what the HTML already does.
//
// The directives are Astro's (packages/astro/src/runtime/client/{load,idle,visible,media}.ts, Astro 7.4), under its
// MIT license:
//
//   Copyright (c) 2021 Fred K. Schott
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
//   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
//   Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
//   COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/** Island names: what the plugin accepts as a file name under the islands folder. */
export const ISLAND_NAME = /^[a-z][a-z0-9-]*$/;

const DIRECTIVES = {
  load: (run) => run(),
  idle: (run, el) => {
    const timeout = Number(el.dataset.clientTimeout) || undefined;
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout });
    else setTimeout(run, timeout || 200);
  },
  visible: (run, el) => {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        run();
      },
      { rootMargin: el.dataset.clientRootMargin },
    );
    io.observe(el);
  },
  media: (run, el) => {
    const query = el.dataset.clientMedia;
    if (!query) return;
    const mql = window.matchMedia(query);
    if (mql.matches) run();
    else mql.addEventListener("change", run, { once: true });
  },
};

const started = new WeakSet();

// A built /site.js has this replaced with each island's content-hashed URL (site-script.mjs); in `vite dev`, or a page
// bundled some other way, it is undefined and an island is /islands/<name>.js.
const BUILT = typeof __DEVKIT_ISLANDS__ === "object" ? __DEVKIT_ISLANDS__ : {};
const islandUrl = (name) => (Object.hasOwn(BUILT, name) ? BUILT[name] : `/islands/${name}.js`);

/**
 * Starts every island under `root` (the document by default). `load` imports an island's module; the default reads
 * the built URL the site-script plugin wrote into /site.js, or /islands/<name>.js in `vite dev`. An island that fails to load or throws is
 * reported on the console and leaves the server's HTML as it was.
 * @param {{ root?: ParentNode, load?: (name: string) => Promise<{ default: (el: HTMLElement, props: unknown) => unknown }> }} [options]
 */
export function startIslands({ root = document, load = (name) => import(/* @vite-ignore */ islandUrl(name)) } = {}) {
  for (const el of root.querySelectorAll("[data-island]")) {
    if (!(el instanceof HTMLElement) || started.has(el)) continue;
    started.add(el);
    const name = el.dataset.island ?? "";
    const directive = DIRECTIVES[el.dataset.client ?? "load"];
    if (!ISLAND_NAME.test(name) || !directive) {
      console.error(`island: "${name}" with data-client "${el.dataset.client}" is not an island this page can start`);
      continue;
    }
    let ran = false;
    directive(async () => {
      if (ran) return;
      ran = true;
      const start = performance.now();
      try {
        const props = el.dataset.props ? JSON.parse(el.dataset.props) : {};
        await (await load(name)).default(el, props);
        el.dataset.islandReady = "";
        // Read by the dev toolbar's audit (dev-toolbar.mjs), which flags an island slow to start.
        el.dataset.islandMs = String(Math.round(performance.now() - start));
      } catch (error) {
        console.error(`island "${name}" failed`, error);
      }
    }, el);
  }
}
