// siteScript's build: /site.js is named by its content, every island and shared chunk has an integrity that matches its
// bytes, and a built /site.js carries them for startIslands to preload.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { siteScript } from "../vite/site-script.mjs";

test("a built site names /site.js by its content and carries each island's integrity and imports", async () => {
  const dir = mkdtempSync(join(tmpdir(), "site-script-"));
  mkdirSync(join(dir, "islands"));
  writeFileSync(join(dir, "shared.js"), "export const shared = () => document.title + 'shared';");
  writeFileSync(
    join(dir, "islands", "one.js"),
    'import { shared } from "../shared.js"; export default (el) => { el.textContent = shared() + "one"; };',
  );
  writeFileSync(
    join(dir, "islands", "two.js"),
    'import { shared } from "../shared.js"; export default (el) => { el.textContent = shared() + "two"; };',
  );
  writeFileSync(
    join(dir, "site.js"),
    `import { startIslands } from ${JSON.stringify(fileURLToPath(new URL("../vite/islands.mjs", import.meta.url)))}; startIslands();`,
  );
  const plugin = /** @type {any} */ (
    siteScript({ entry: join(dir, "site.js"), islands: join(dir, "islands") })
  );
  plugin.configResolved({ command: "build" });
  /** @type {Array<{ fileName: string, source: string }>} */
  const files = [];
  await plugin.generateBundle.call({
    environment: { name: "client" },
    emitFile: (/** @type {any} */ file) => files.push(file),
  });
  const virtual = await plugin.load.call({ addWatchFile() {} }, "\0virtual:islands");
  const script = JSON.parse(/^export const SITE_SCRIPT = (.*);$/m.exec(virtual)?.[1] ?? "null");

  const site = files.find((f) => /^site-.+\.js$/.test(f.fileName));
  assert.ok(site, "the entry is emitted as /site-<hash>.js");
  assert.ok(!files.some((f) => f.fileName === "site.js"), "no fixed /site.js name is emitted");
  const sha = (/** @type {string} */ code) =>
    `sha384-${createHash("sha384").update(code).digest("base64")}`;
  assert.deepEqual(script, {
    src: `/${site.fileName}`,
    integrity: sha(site.source),
    crossOrigin: "anonymous",
  });

  // The built /site.js holds each file's integrity: every island and chunk, matched to the bytes emitted.
  for (const file of files.filter((f) => f.fileName.startsWith("islands/"))) {
    assert.ok(
      site.source.includes(sha(file.source)),
      `/site.js carries the integrity of ${file.fileName}`,
    );
  }
  assert.ok(
    files.some((f) => f.fileName.startsWith("islands/chunks/")),
    "the shared code is one chunk",
  );
});
