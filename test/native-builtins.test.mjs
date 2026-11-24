import assert from "node:assert/strict";
import { test } from "node:test";

import { nativeBuiltins } from "../vite/native-builtins.mjs";

const legacy = "/app/node_modules/react-dom/cjs/react-dom-server-legacy.browser.production.js";

test("the legacy string renderer becomes a stub that throws, and nothing else is touched", () => {
  const plugin = nativeBuiltins();
  const stub = plugin.transform.call(null, "huge", legacy);
  assert.match(stub.code, /exports\.renderToString = gone/);
  assert.equal(
    plugin.transform.call(
      null,
      "x",
      "/app/node_modules/react-dom/cjs/react-dom-server.edge.production.js",
    ),
    null,
  );
  assert.equal(plugin.transform.call(null, "x", legacy.replace("production", "development")), null);
});

test("decode-named-character-reference is answered by htmlparser2's entities in a server build only", async () => {
  const context = (consumer, found) => ({
    environment: { config: { consumer } },
    resolve: async (id, importer) =>
      found
        ? {
            id:
              id === "htmlparser2"
                ? "/app/node_modules/htmlparser2/index.js"
                : `${importer}/entities/decode.js`,
          }
        : null,
  });
  const id = "decode-named-character-reference";
  assert.equal(await nativeBuiltins().resolveId.call(context("client", true), id), null);
  assert.equal(await nativeBuiltins().resolveId.call(context("server", false), id), null);
  const plugin = nativeBuiltins();
  const shim = await plugin.resolveId.call(context("server", true), id);
  const source = plugin.load.call(null, shim);
  assert.match(source, /from "\/app\/node_modules\/htmlparser2\/index\.js\/entities\/decode\.js"/);
});
