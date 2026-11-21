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
