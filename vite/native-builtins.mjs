// The Vite plugin that swaps a polyfill for the platform's own function. mdast-util-to-hast (every site that renders
// Markdown through Prelum) imports @ungap/structured-clone, which ships its own serialize and deserialize, about
// 3 KiB raw and 0.9 KiB gzip in a Worker, because a bundler cannot drop the branch it takes when the global exists.
// Workers have structuredClone, and so does every browser the network supports (Baseline Widely available, devkit's
// docs/browser-support.md), so the polyfill never runs.
//
// Each entry is a module id and the source that replaces it. A replacement keeps the calls the network makes:
// mdast-util-to-hast passes one value. @ungap's own `json` and `lossy` options are not supported, so a caller that
// passes them gets the native clone, which throws on a function rather than dropping it.
//
// It also drops React's legacy string renderer from a Worker. react-dom/server.edge requires
// react-dom-server-legacy.browser.production.js (about 259 KB source) only to export renderToString and
// renderToStaticMarkup, which a bundler cannot drop from a CommonJS file. Every site renders with
// renderToReadableStream (site-runtime ./react-entry), so those two exports become functions that throw.
/** @type {Record<string, string>} */
const REPLACED = {
  "@ungap/structured-clone": "export default (value, options) => structuredClone(value, options);",
};

const LEGACY_RENDERER =
  /\/react-dom\/cjs\/react-dom-server-legacy\.(?:browser|node)\.production\.js$/;
const LEGACY_STUB = `const gone = () => {
  throw new Error("renderToString and renderToStaticMarkup are not in this build (devkit nativeBuiltins); use renderToReadableStream.");
};
exports.renderToString = gone;
exports.renderToStaticMarkup = gone;
exports.version = "";`;

const PREFIX = "\0native-builtins:";

/** @returns {import("vite").Plugin} */
export function nativeBuiltins() {
  return {
    name: "devkit:native-builtins",
    enforce: "pre",
    resolveId(id) {
      return Object.hasOwn(REPLACED, id) ? PREFIX + id : null;
    },
    load(id) {
      return id.startsWith(PREFIX) ? REPLACED[id.slice(PREFIX.length)] : null;
    },
    transform(_code, id) {
      return LEGACY_RENDERER.test(id.split("?")[0]) ? { code: LEGACY_STUB, map: null } : null;
    },
  };
}
