import assert from "node:assert/strict";
import test from "node:test";

import { againstBase } from "../bin/shared.mjs";
import { isWarning } from "../bin/shared/config.mjs";
import { checkPins, lockDisagrees } from "../bin/shared/pins.mjs";

const SHA_V2 = "2".repeat(40);
const SHA_RAW = "9".repeat(40);
const tags = () => ({
  tags: ["v0.9.0", "v0.10.0", "v0.2.0"],
  commits: { "v0.9.0": "1".repeat(40), "v0.10.0": SHA_V2, "v0.2.0": "3".repeat(40) },
});
/** @param {Record<string, string>} files */
const tree = (files) => ({
  files: Object.keys(files),
  read: (/** @type {string} */ f) => files[f] ?? "",
});

test("a raw commit is refused, a pin behind the newest tag is a warning, and a site-runtime pin behind a minor out three days fails", () => {
  const found = checkPins(
    tree({
      "package.json": JSON.stringify(
        {
          dependencies: {
            a: "github:DrDustinEdwards/prelum#v0.9.0",
            b: `github:DrDustinEdwards/site-runtime#${SHA_RAW}`,
            c: "github:DrDustinEdwards/d1-dump#v0.10.0",
            d: "git+https://github.com/DrDustinEdwards/capsomer.git#v0.9.0",
            enarratio: "^0.9.0",
          },
        },
        null,
        1,
      ),
      "app/package.json": '{"dependencies":{"enarratio":"0.10.0"}}',
      ".github/workflows/ci.yml": `uses: DrDustinEdwards/devkit/.github/workflows/no-bloat.yml@${SHA_V2} # v0.10.0\nuses: DrDustinEdwards/devkit/.github/workflows/shared.yml@${"1".repeat(40)} # v0.9.0`,
    }),
    tags,
  );
  assert.deepEqual(
    found.map((f) => f.message),
    [
      "prelum is at v0.9.0; the newest release is v0.10.0",
      `site-runtime is pinned to ${SHA_RAW.slice(0, 12)}, which is no release; pin v0.10.0`,
      "capsomer is at v0.9.0; the newest release is v0.10.0",
      "enarratio is at v0.9.0; the newest release is v0.10.0",
      "devkit is at v0.9.0; the newest release is v0.10.0",
    ],
  );
  assert.equal(found[4].line, 2);
  assert.deepEqual(
    found.map((f) => isWarning(f)),
    [true, false, true, true, true],
  );
  // A FRESH package: behind a minor out three days fails, behind a younger one warns, unread dates warn.
  const now = Date.parse("2026-11-10T00:00:00Z");
  const dates = {
    "site-runtime": { "v0.9.0": "2026-11-01T00:00:00Z", "v0.10.0": "2026-11-09T00:00:00Z" },
    prelum: new Error("GitHub answered 403"),
  };
  const pins = (ref) =>
    checkPins(
      tree({
        "package.json": `{"dependencies":{"s":"github:DrDustinEdwards/site-runtime#${ref}"}}`,
      }),
      tags,
      dates,
      now,
    );
  const behind = pins("v0.2.0");
  assert.equal(
    behind[0].message,
    "site-runtime is at v0.2.0, behind v0.9, a minor out more than 3 days; bump to v0.10.0",
  );
  assert.equal(isWarning(behind[0]), false);
  const fresh = pins("v0.9.0");
  assert.equal(fresh[0].message, "site-runtime is at v0.9.0; the newest release is v0.10.0");
  assert.equal(isWarning(fresh[0]), true);
  assert.equal(isWarning(fresh[1]), true);
  assert.match(fresh[1].message, /prelum's release dates could not be read/);
  // An MCP server: more than one minor behind the newest fails whatever the release's age; one behind is the usual warning.
  const server = (ref) =>
    checkPins(
      tree({
        "mcp/package.json": `{"dependencies":{"s":"github:DrDustinEdwards/site-runtime#${ref}"}}`,
        "mcp/src/door.ts": 'import { x } from "@dustinedwards/site-runtime/mcp-login";',
      }),
      tags,
      {},
      now,
    )[0];
  assert.match(
    server("v0.2.0").message,
    /^the MCP server in mcp runs site-runtime v0\.2\.0, more than one minor behind v0\.10\.0/,
  );
  assert.equal(isWarning(server("v0.2.0")), false);
  assert.equal(
    server("v0.9.0").message,
    "site-runtime is at v0.9.0; the newest release is v0.10.0",
  );
  // A lockfile that resolves another release than the pin names fails, npm and pnpm.
  const pkg =
    '{"dependencies":{"@dustinedwards/site-runtime":"github:DrDustinEdwards/site-runtime#v0.10.0"}}';
  const npm = (v) =>
    tree({
      "package.json": pkg,
      "package-lock.json": JSON.stringify({
        packages: { "node_modules/@dustinedwards/site-runtime": { version: v } },
      }),
    });
  const run = (t) => checkPins(t, tags).filter((f) => f.message.includes("lock"));
  assert.equal(run(npm("0.10.0")).length, 0);
  const stale = run(npm("0.9.0"));
  assert.equal(stale.length, 1);
  assert.equal(isWarning(stale[0]), false);
  assert.match(stale[0].message, /pinned to v0\.10\.0 but package-lock\.json resolves 0\.9\.0/);
  // An npm workspace member has no lock of its own: the root lock holds its entry, nested under the member or hoisted.
  const member = (key, v) =>
    tree({
      "apps/web/package.json": pkg,
      "package-lock.json": JSON.stringify({
        packages: { [key]: { version: v } },
      }),
    });
  const key = "@dustinedwards/site-runtime";
  assert.equal(run(member(`apps/web/node_modules/${key}`, "0.10.0")).length, 0);
  assert.equal(run(member(`node_modules/${key}`, "0.10.0")).length, 0);
  const staleMember = run(member(`apps/web/node_modules/${key}`, "0.9.0"));
  assert.equal(staleMember.length, 1);
  assert.match(
    staleMember[0].message,
    /pinned to v0\.10\.0 but package-lock\.json resolves 0\.9\.0/,
  );
  assert.equal(run(member("apps/web/node_modules/other", "1.0.0")).length, 1); // no entry at all
  assert.equal(
    lockDisagrees(
      tree({
        "package.json": pkg,
        "pnpm-lock.yaml": "specifier: github:DrDustinEdwards/site-runtime#v0.10.0",
      }),
      "package.json",
      1,
      "x",
      "site-runtime",
      "v0.10.0",
    ).length,
    0,
  );
  assert.equal(
    lockDisagrees(
      tree({
        "package.json": pkg,
        "pnpm-lock.yaml": "specifier: github:DrDustinEdwards/site-runtime#v0.9.0",
      }),
      "package.json",
      1,
      "x",
      "site-runtime",
      "v0.10.0",
    ).length,
    1,
  );
});

test("PLANT: on a pull request a failure the base already has is a warning, and one the change adds still fails", () => {
  const old = {
    check: "copies",
    file: "app/a.ts",
    line: 3,
    message: "escapeHtml copies site-runtime ./html",
  };
  const added = {
    check: "copies",
    file: "app/b.ts",
    line: 9,
    message: "escapeHtml copies site-runtime ./html",
  };
  const judged = againstBase([{ ...old, line: 7 }, added], [old]);
  assert.deepEqual(
    judged.map((f) => [f.file, isWarning(f)]),
    [
      ["app/a.ts", true],
      ["app/b.ts", false],
    ],
  );
  assert.match(judged[0].message, /already on the base branch/);
  // A warning on the base excuses nothing: only a failure there is the repository's state.
  assert.equal(isWarning(againstBase([added], [{ ...added, warn: true }])[0]), false);
});
