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
// micromark (Prelum's Markdown parser) decodes named character references with decode-named-character-reference, whose
// character-entities table is about 33 KB of source, and htmlparser2 (Prelum's HTML reader) carries the same names again
// inside entities' decode tree. In a server build the first is answered by entities' own `decodeHTMLStrict`, so one
// table is left; where `entities` cannot be resolved, or in a browser build, nothing changes.
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
const NAMED_REFERENCE = "decode-named-character-reference";
const NAMED_REFERENCE_SHIM = (/** @type {string} */ entities) => `import { decodeHTMLStrict } from ${JSON.stringify(entities)};
export function decodeNamedCharacterReference(value) {
  const reference = "&" + value + ";";
  const decoded = decodeHTMLStrict(reference);
  return decoded === reference ? false : decoded;
}`;
const SHIM_ID = "\0native-builtins-named-reference";

/** @returns {import("vite").Plugin} */
export function nativeBuiltins() {
  /** The resolved `entities/decode`, "" when the project has none, undefined before the first look. */
  /** @type {string | undefined} */
  let entities;
  return {
    name: "devkit:native-builtins",
    enforce: "pre",
    async resolveId(id) {
      if (Object.hasOwn(REPLACED, id)) return PREFIX + id;
      if (id !== NAMED_REFERENCE || this.environment?.config.consumer !== "server") return null;
      entities ??= (await this.resolve("entities/decode", undefined, { skipSelf: true }))?.id ?? "";
      return entities ? SHIM_ID : null;
    },
    load(id) {
      if (id === SHIM_ID) return NAMED_REFERENCE_SHIM(entities ?? "");
      return id.startsWith(PREFIX) ? REPLACED[id.slice(PREFIX.length)] : null;
    },
    transform(_code, id) {
      return LEGACY_RENDERER.test(id.split("?")[0]) ? { code: LEGACY_STUB, map: null } : null;
    },
  };
}
