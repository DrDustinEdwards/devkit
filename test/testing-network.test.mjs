import assert from "node:assert/strict";
import test from "node:test";

import { installFetch, refuseNetwork } from "@dustinedwards/devkit/network";

test("the refusing fetch throws an error naming the URL and the hint, and restore puts the real fetch back", async () => {
  const real = globalThis.fetch;
  const restore = refuseNetwork({ hint: "See the stubs." });
  try {
    await assert.rejects(
      fetch("https://example.test/x"),
      /asked for https:\/\/example\.test\/x\. See the stubs\.$/,
    );
  } finally {
    restore();
  }
  assert.equal(globalThis.fetch, real);
});

test("installs restore in reverse order, as a stack", async () => {
  const real = globalThis.fetch;
  const first = async () => new Response("first");
  const restoreFirst = installFetch(first);
  try {
    const restoreSecond = installFetch(async () => new Response("second"));
    try {
      assert.equal(await (await fetch("https://example.test")).text(), "second");
    } finally {
      restoreSecond();
    }
    assert.equal(globalThis.fetch, first);
  } finally {
    restoreFirst();
  }
  assert.equal(globalThis.fetch, real);
});
