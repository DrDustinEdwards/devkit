// What a pull request may not change about how no-bloat counts: classify, reasons, narrowed measures, workflow inputs and Knip config.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { hiddenFiles, lockfileProblems, unreadAdded } from "../bin/no-bloat/base.mjs";
import { classify, raised } from "../bin/no-bloat/classify.mjs";
import { workflowInputs } from "../bin/no-bloat/workflow.mjs";
import { narrowed, unreadFiles } from "../bin/no-bloat/count.mjs";
import {
  inputsNarrowed,
  knipConfigInputs,
  knipCounted,
  knipPluginFiles,
  pageScripts,
} from "../bin/no-bloat/knip-config.mjs";
import { unreasoned } from "../bin/no-bloat/reasons.mjs";
import { isReason } from "../bin/no-bloat/scan.mjs";
import { checkTools, checkoutProblems } from "../bin/no-bloat/tools.mjs";
import { git, parseYaml, runBin, scratch, tool } from "./fixtures/no-bloat.mjs";

test("classify: what counts as code, a change of measure, a workflow that runs the check, and a shared package moved back", () => {
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    ".no-bloat.json": [
      '{"jscpd":{"args":["src"]},"baseline":{}}',
      '{"jscpd":{"args":["src","--ignore=**/x.js"]},"baseline":{"a":1}}',
    ],
    "knip.ts": ["export default {}", "export default { entry: ['src/**'] }"],
    "package.json": [
      JSON.stringify({
        name: "x",
        knip: {},
        devDependencies: { "@dustinedwards/devkit": "github:DrDustinEdwards/devkit#v0.38.0" },
      }),
      JSON.stringify({
        name: "x",
        knip: { rules: { exports: "off" } },
        devDependencies: { "@dustinedwards/devkit": "github:DrDustinEdwards/devkit#v0.37.1" },
      }),
    ],
    ".github/workflows/checks.yml": [
      "uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@abc",
      "uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@abc\n  with: { no-bloat-prepare: rm src/copy.ts }",
    ],
    ".github/workflows/deploy.yml": ["on: push", "on: [push]"],
  });
  const classifyYaml = (/** @type {Parameters<typeof classify>[0]} */ c) => classify(c, parseYaml);
  const change = (/** @type {string[]} */ changed) => ({
    changed,
    configPath: ".no-bloat.json",
    before: (/** @type {string} */ p) => files[p]?.[0] ?? null,
    now: (/** @type {string} */ p) => files[p]?.[1] ?? null,
  });
  assert.deepEqual(classifyYaml(change(Object.keys(files))), {
    code: true,
    definition: [".no-bloat.json (outside baseline and tools)", "knip.ts", 'package.json "knip"'],
    workflow: [".github/workflows/checks.yml"],
    back: [
      "@dustinedwards/devkit github:DrDustinEdwards/devkit#v0.38.0 to github:DrDustinEdwards/devkit#v0.37.1",
    ],
    refused: [],
    removed: [],
    entries: {},
  });
  // A baseline, lockfile and changeset change alone moves nothing the counts read; a tool must be npm's at x.y.z, never older.
  files[".no-bloat.json"] = [
    '{"baseline":{},"tools":{"jscpd":"jscpd@5.4.0"}}',
    '{"baseline":{"a":1},"tools":{"knip":"knip@7.0.0","jscpd":"jscpd@5.4.0"}}',
  ];
  // A workspace package's manifest and lockfile are read like the root's.
  files["mcp/package.json"] = [
    JSON.stringify({ name: "m", dependencies: { a: "1.0.0" } }),
    JSON.stringify({ name: "m", dependencies: { a: "1.1.0" } }),
  ];
  assert.deepEqual(
    classifyYaml(
      change([
        ".no-bloat.json",
        "package-lock.json",
        "mcp/package.json",
        "mcp/package-lock.json",
        ".changeset/a-change.md",
        ".changeset/config.json",
      ]),
    ),
    { code: false, definition: [], workflow: [], back: [], refused: [], removed: [], entries: {} },
  );
  // Removing a build plugin and its library is one change of measure, which may not leave an import unlisted; removing a
  // library alone, or beside code, is code.
  files["vite.config.ts"] = ["export default { plugins: [tw()] }", "export default {}"];
  files["package.json"] = [
    JSON.stringify({ name: "x", devDependencies: { "@tailwindcss/vite": "4.3.3", vite: "8.0.0" } }),
    JSON.stringify({ name: "x", devDependencies: { vite: "8.0.0" } }),
  ];
  const drop = classifyYaml({
    ...change(["vite.config.ts", "package.json"]),
    plugins: ["vite.config.ts"],
  });
  assert.deepEqual(
    [drop.code, drop.definition],
    [false, ["vite.config.ts", "package.json devDependencies removes @tailwindcss/vite"]],
  );
  const knip = (/** @type {number} */ unlisted) => ({ baseline: { knip: { unlisted } } });
  assert.deepEqual(raised(knip(0), knip(0), drop), []);
  assert.match(raised(knip(1), knip(0), drop).join(), /raises unlisted from 0 to 1/);
  const alone = classifyYaml(change(["package.json"]));
  assert.deepEqual([alone.code, alone.removed], [true, []]);
  files[".no-bloat.json"][1] =
    '{"baseline":{},"tools":{"knip":"file:./fake","jscpd":"jscpd@4.3.0"}}';
  assert.deepEqual(classifyYaml(change([".no-bloat.json"])).refused, [
    'tools.knip is "file:./fake". The check runs knip from npm at an exact version, "knip@x.y.z".',
    "tools.jscpd moves from jscpd@5.4.0 to jscpd@4.3.0, an older release. Keep each tool at its version or newer.",
  ]);

  // Moving only the devkit pin of a workflow that runs the check (the rollout's and Renovate's bump) is no code and no
  // change of measure; a workflow that does not run the check is never code.
  const sha = (/** @type {string} */ c) => c.repeat(40);
  files[".github/workflows/checks.yml"] = [
    `uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${sha("a")} # v0.40.0`,
    `uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${sha("b")} # v0.41.0`,
  ];
  assert.deepEqual(
    classifyYaml(change([".github/workflows/checks.yml", ".github/workflows/deploy.yml"])),
    { code: false, definition: [], workflow: [], back: [], refused: [], removed: [], entries: {} },
  );

  // devkit installed from anywhere but its own release tag, or overridden, runs another check.
  for (const pin of [
    "github:evil/devkit#v0.41.0",
    "file:./vendor/devkit",
    "^0.40.0",
    "github:DrDustinEdwards/devkit#main",
  ]) {
    files["mcp/package.json"] = [
      JSON.stringify({
        devDependencies: { "@dustinedwards/devkit": "github:DrDustinEdwards/devkit#v0.40.0" },
      }),
      JSON.stringify({ devDependencies: { "@dustinedwards/devkit": pin } }),
    ];
    assert.match(
      classifyYaml(change(["mcp/package.json"])).refused.join("\n"),
      /mcp\/package\.json devDependencies has @dustinedwards\/devkit at ".+"\. Pin devkit to a release tag/,
      pin,
    );
  }
  files["package.json"] = [
    JSON.stringify({ name: "x" }),
    JSON.stringify({ name: "x", overrides: { "@dustinedwards/devkit": "file:./vendor/devkit" } }),
  ];
  assert.match(
    classifyYaml(change(["package.json"])).refused[0],
    /package\.json "overrides" names @dustinedwards\/devkit/,
  );
});

test(
  "end to end: dropping a count, switching a measure off, or changing a measure with code fails; a measure changed alone may not lower a count",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ shared: false }));
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      writeFileSync(join(dir, "a.mjs"), "export const a = 1;\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "update-ref", "refs/remotes/origin/main", "main");
      git(dir, "checkout", "-qb", "change");
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));

      // jscpd switched off and its count dropped, with code beside it.
      writeFileSync(join(dir, "b.mjs"), "export const b = 1;\n");
      const off = { ...config, jscpd: false, baseline: { ...config.baseline } };
      delete off.baseline.jscpd;
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(off));
      const r = runBin(dir, [], { GITHUB_ACTIONS: "" });
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /::error::jscpd: this change drops its count from the baseline/);
      assert.match(
        r.stdout,
        /::error::this change moves code and also how it is counted \(\.no-bloat\.json/,
      );

      // The same switch alone still drops the count; a narrower knip config alone may not lower one.
      rmSync(join(dir, "b.mjs"));
      assert.match(
        runBin(dir, [], { GITHUB_ACTIONS: "" }).stdout,
        /::error::jscpd: this change drops its count/,
      );
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      writeFileSync(join(dir, "knip.ts"), "export default { entry: ['**'] };\n");
      writeFileSync(tool(dir, "knip"), "process.stdout.write('{\"issues\":[]}');\n");
      const lowered = { ...config, baseline: { ...config.baseline, knip: {} } };
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(lowered));
      const n = runBin(dir, [], { GITHUB_ACTIONS: "" });
      assert.equal(n.status, 1, n.stdout);
      assert.match(
        n.stdout,
        /::error::knip: this change of how it is counted \(knip\.ts\) lowers files from 2 to 0/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("a Knip config line, a skip tag, a jscpd marker or a legacy-scan keep needs a reason of its own, in words; a comment it would inherit is not one", () => {
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    "knip.jsonc": [
      '{\n  // Generated by the build, read by nothing in this repository.\n  "ignore": [\n    "gen/**"\n  ]\n}\n',
      '{\n  // Generated by the build, read by nothing in this repository.\n  "ignore": [\n    "gen/**",\n    "src/hidden/**"\n  ],\n  "rules": { "types": "off", "unlisted": "off" },\n  // x\n  "ignoreDependencies": ["a"],\n  "ignoreBinaries": ["b"] // the deploy script runs it from the shell\n}\n',
    ],
    "dashboard/knip.ts": [null, "export default {};\n"],
  });
  const change = {
    changed: Object.keys(files),
    before: (/** @type {string} */ p) => files[p]?.[0] ?? null,
    now: (/** @type {string} */ p) => files[p]?.[1] ?? null,
    added: [
      { path: "src/a.ts", text: "/** @beta */" },
      { path: "src/a.ts", text: "/** @alias the old name the CLI still imports */" },
      { path: "src/a.ts", text: "// jscpd:ignore-start x" },
      { path: "src/a.ts", text: "/** @public */ export const keep = 1;" },
      { path: "README.md", text: "`@beta` hides an export." },
      { path: "src/b.ts", text: "// legacy-scan:keep" },
      {
        path: "src/b.ts",
        text: "// legacy-scan:keep isImeEnter guards it, in Capsomer's shortcuts",
      },
      {
        path: "src/b.ts",
        text: "// legacy-scan:keep ime-safe-enter-submit isImeEnter guards it, in Capsomer's shortcuts",
      },
    ],
  };
  const out = unreasoned(change, {}, {});
  assert.deepEqual(
    out.map((m) => m.slice(0, m.indexOf(" is new") > 0 ? m.indexOf(" is new") : m.indexOf(":"))),
    [
      'knip.jsonc line 5 ("src/hidden/**")',
      'knip.jsonc line 7 ("rules": { "types": "off", "unlisted": "off" },)',
      'knip.jsonc line 9 ("ignoreDependencies": ["a"],)',
      "dashboard/knip.ts",
      "src/a.ts",
      "src/a.ts",
      "src/a.ts",
      "src/b.ts",
      "src/b.ts",
    ],
  );
  assert.match(out[7], /a new `legacy-scan:keep` names no guide or gives no reason/);
  assert.match(out[4], /a new `@beta` gives no reason/);
  assert.match(out[5], /a new `jscpd:ignore-start` gives no reason/);
  assert.match(out[6], /a new `@public` gives no reason/);
  // jscpd splits --ignore on commas: dropping one glob widens the measure, adding one is new.
  const jscpd = (/** @type {string} */ ignore) => ({
    jscpd: { args: ["app", "--ignore", ignore] },
  });
  const none = { changed: [], before: () => null, now: () => null, added: [] };
  assert.deepEqual(
    unreasoned(none, jscpd("**/*.md,**/*.json"), jscpd("**/*.md,**/*.d.ts,**/*.json")),
    [],
  );
  assert.match(
    unreasoned(none, jscpd("**/*.md,**/x/**"), jscpd("**/*.md")).join("\n"),
    /gain --ignore "\*\*\/x\/\*\*"/,
  );
  assert.equal(isReason("x"), false);
  assert.equal(isReason("TODO: reason"), false);
  assert.equal(isReason("the fixture mirrors the API reply"), true);
});

test("jscpd: a narrower measure or path is refused, a new file it skips anywhere fails, and a knip run's args cannot change", () => {
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    ".jscpd.json": [
      '{ "path": ["src"], "minLines": 5 }',
      '{ "path": ["src/a.ts"], "minLines": 20, "gitignore": true }',
    ],
  });
  const change = {
    before: (/** @type {string} */ p) => files[p]?.[0] ?? null,
    now: (/** @type {string} */ p) => files[p]?.[1] ?? null,
  };
  const out = narrowed(
    change,
    {
      knip: [{ label: "knip", args: ["--exclude", "types"] }],
      jscpd: { args: ["--format", "javascript"] },
    },
    { knip: [{ label: "knip" }], jscpd: { args: [] } },
  );
  assert.deepEqual(
    out.map((m) => /\(([^)]*)\)|run "knip"/.exec(m)?.[0]),
    [
      "(minLines from 5 to 20)",
      "(format from every format to javascript)",
      "(gitignore turned on)",
      '(path from ["src"] to ["src/a.ts"], which no longer reads src)',
      'run "knip"',
    ],
  );
  // A wider path, or the same read through its parent, is no narrowing.
  assert.deepEqual(
    narrowed(change, { jscpd: { args: ["."] } }, { jscpd: { args: ["src", "lib/"] } }).filter((m) =>
      m.includes("path from"),
    ),
    [],
  );
  assert.deepEqual(narrowed({ before: () => null, now: () => null }, {}, {}), []);
  // src/a.ts is read; src/b.ts beside it and scripts/x.ts outside its path are not; a file under minLines holds no copy,
  // and tests are never counted.
  const unread = unreadFiles(
    {},
    ["src/a.ts", "src/b.ts", "src/tiny.ts", "src/b.test.ts", "scripts/x.ts"],
    ["/r/src/a.ts"],
    "/r",
    (p) => (p === "src/tiny.ts" ? "export {};\n" : "a\nb\nc\nd\ne\n"),
    5,
  );
  assert.deepEqual(unread, ["src/b.ts", "scripts/x.ts"]);
  // The count can stay level when another file starts being read, so a new skipped file fails by name.
  assert.match(
    unreadAdded(unread, ["src/b.ts"]).join(),
    /src\/b\.ts is new, and jscpd does not read it/,
  );
  assert.deepEqual(unreadAdded(unread, ["src/a.ts"]), []);
});

test("a pin-only workflow change passes alone; any other change to the workflow that runs the check may not lower a count", () => {
  const base = { baseline: { knip: { files: 2 } } };
  assert.deepEqual(raised(base, base, { code: false, definition: [], workflow: [], back: [] }), []);
  assert.match(
    raised({ baseline: { knip: { files: 0 } } }, base, {
      code: false,
      definition: [],
      workflow: [".github/workflows/ci.yml"],
      back: [],
    })[0],
    /this change of how it is counted \(\.github\/workflows\/ci\.yml\) lowers files from 2 to 0/,
  );
});

test(
  "end to end: a tracked file a .gitignore hides from Knip fails, whether the file or the hiding line is new; a workflow pin bump alone passes",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ shared: false }));
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
      const caller = (/** @type {string} */ c) =>
        `jobs:\n  checks:\n    uses: DrDustinEdwards/devkit/.github/workflows/pr.yml@${c.repeat(40)} # v0.40.0\n`;
      writeFileSync(join(dir, ".github", "workflows", "ci.yml"), caller("a"));
      mkdirSync(join(dir, "src", "old"), { recursive: true });
      writeFileSync(join(dir, "src", "old", "o.mjs"), "export const o = 1;\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");

      writeFileSync(join(dir, ".github", "workflows", "ci.yml"), caller("b"));
      git(dir, "commit", "-qam", "Bump the pin");
      const pin = runBin(dir, ["--lines-from", "main"]);
      assert.equal(pin.status, 0, pin.stdout);

      writeFileSync(join(dir, ".gitignore"), "node_modules/\nsummary.md\nsrc/bloat/\nsrc/old/\n");
      mkdirSync(join(dir, "src", "bloat"));
      writeFileSync(join(dir, "src", "bloat", "b.mjs"), "export const b = 1;\n");
      git(dir, "add", "-A");
      git(dir, "add", "-f", "src/bloat/b.mjs");
      git(dir, "commit", "-qm", "Hide");
      const r = runBin(dir, ["--lines-from", "main"]);
      assert.equal(r.status, 1, r.stdout);
      assert.match(
        r.stdout,
        /::error::src\/bloat\/b\.mjs is tracked, but \.gitignore line 3 \(src\/bloat\/\) hides it from Knip/,
      );
      assert.match(
        r.stdout,
        /::error::src\/old\/o\.mjs is tracked, but \.gitignore line 4 \(src\/old\/\) hides it/,
      );
      assert.deepEqual(
        hiddenFiles(
          [{ source: ".gitignore", line: "1", pattern: "dist/", path: "dist/x.js" }],
          [],
          () => "dist/\n",
        ),
        [],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("the tools are the check's own install at exact versions, and a second lockfile beside one fails", () => {
  // A range or tag would measure with whatever it resolves to, so the check refuses before it installs anything.
  assert.throws(
    () => checkTools(".", { knip: "knip@6", jscpd: "jscpd@4.3.0" }, "").run("knip", []),
    /tools\.knip is "knip@6", and the check runs only npm's knip at an exact version/,
  );
  assert.deepEqual(
    lockfileProblems([
      "package-lock.json",
      "npm-shrinkwrap.json",
      "web/pnpm-lock.yaml",
      "web/a.ts",
    ]),
    [
      "the root has package-lock.json and npm-shrinkwrap.json. Keep the one lockfile its package manager installs from, and delete the other.",
    ],
  );
});

test("a workflow change that turns the check off or changes what runs before it is refused, in any YAML spelling; an install script is a change of measure", () => {
  const pin = (/** @type {string} */ c) =>
    `DrDustinEdwards/devkit/.github/workflows/pr.yml@${c.repeat(40)} # v1.0.0`;
  const base = `on:\n  pull_request:\njobs:\n  checks:\n    uses: ${pin("a")}\n    with:\n      review: false\n      no-bloat-prepare: >-\n        npm run gen\n`;
  const check = (/** @type {string} */ now) =>
    workflowInputs("c.yml", base, now, parseYaml).join("\n");
  // Moving the pin, an input the check does not depend on, or the same data in another spelling is no such change.
  for (const same of [
    base.replace("a".repeat(40), "b".repeat(40)).replace("review: false", "review: true"),
    base.replace(/\n/g, "\r\n"),
    `"on": { pull_request: null }\njobs:\n  checks: { uses: "${pin("b")}", with: { review: true, "no-bloat-prepare": npm run gen } }\n`,
    // A schedule only adds runs (the daily shared-code run on the default branch).
    base.replace("  pull_request:\n", "  pull_request:\n  schedule:\n    - cron: '17 5 * * *'\n"),
  ])
    assert.equal(check(same), "");
  // Dropping `edited` stops only the runs a description edit started; any other change to the types is still refused.
  const typed = base.replace(
    "  pull_request:\n",
    "  pull_request:\n    types: [opened, synchronize, edited]\n",
  );
  const checkTyped = (/** @type {string} */ now) =>
    workflowInputs("c.yml", typed, now, parseYaml).join("\n");
  assert.equal(checkTyped(typed.replace(", edited]", "]")), "");
  assert.match(
    checkTyped(typed.replace(", synchronize, edited]", "]")),
    /changes its top-level "on"/,
  );
  assert.match(
    checkTyped(typed.replace(", edited]", "]\n    paths-ignore: ['**']")),
    /changes its top-level "on"/,
  );
  const add = (/** @type {string} */ lines) =>
    base.replace("      review: false\n", `      review: false\n${lines}`);
  for (const [now, what] of [
    [base.replace("npm run gen", "npm run gen && rm src/copy.ts"), /changes no-bloat-prepare/],
    [add("      no-bloat: false\n"), /changes no-bloat from "\(default\)" to "false"/],
    // Each spelling the line reader must handle: CRLF, a comment or anchor after with:, flow style, a quoted
    // or upper-case key, an expression.
    [add("      no-bloat: false\n").replace(/\n/g, "\r\n"), /changes no-bloat from/],
    [base.replace("with:\n", "with: # inputs\n      no-bloat: false\n"), /changes no-bloat from/],
    [base.replace("with:\n", "with: &inputs\n      no-bloat: false\n"), /changes no-bloat from/],
    [
      base.replace(
        /    with:[^]*$/,
        "    with: { review: false, no-bloat: false, no-bloat-prepare: npm run gen }\n",
      ),
      /changes no-bloat from/,
    ],
    [add('      "no-bloat": false\n'), /changes no-bloat from/],
    [add("      No-Bloat: false\n"), /changes no-bloat from/],
    [
      add("      no-bloat: ${{ false }}\n"),
      /changes no-bloat from "\(default\)" to "\$\{\{ false \}\}"/,
    ],
    [add("      no-bloat: true\n      No-Bloat: false\n"), /names no-bloat twice/],
    [base.replace("    uses:", "    if: false\n    uses:"), /changes the job "checks"'s if/],
    // A job it waits for that is skipped skips it; the triggers decide whether it runs at all.
    [
      base
        .replace(
          "jobs:\n",
          "jobs:\n  gate:\n    if: false\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n",
        )
        .replace("    uses:", "    needs: gate\n    uses:"),
      /changes the job "checks"'s needs[^]*changes the job "gate" that "checks" waits for/,
    ],
    [
      base.replace("  pull_request:\n", "  pull_request:\n    paths-ignore: ['**']\n"),
      /changes its top-level "on"/,
    ],
    [
      base.replace("  pull_request:\n", "  schedule:\n    - cron: '17 5 * * *'\n"),
      /changes its top-level "on"/,
    ],
    [
      base.replace("pr.yml@", "no-bloat.yml@"),
      /moves the job "checks" from pr\.yml to no-bloat\.yml/,
    ],
    ["jobs: {}\n", /drops the job "checks"/],
    [`${base}jobs: {}\n`, /no longer parses as YAML/],
  ])
    assert.match(check(/** @type {string} */ (now)), /** @type {RegExp} */ (what));
  // A job the caller waits for is held as it was, and one it does not is free.
  const gated = base
    .replace(
      "jobs:\n",
      "jobs:\n  gate:\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n  other:\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n",
    )
    .replace("    uses:", "    needs: [gate]\n    uses:");
  const changed = (/** @type {string} */ job) =>
    workflowInputs(
      "c.yml",
      gated,
      gated.replace(
        `  ${job}:\n    runs-on: ubuntu-latest`,
        `  ${job}:\n    if: false\n    runs-on: ubuntu-latest`,
      ),
      parseYaml,
    );
  assert.match(changed("gate").join(), /changes the job "gate" that "checks" waits for/);
  assert.deepEqual(changed("other"), []);
  // A workflow that calls neither, or is new, ran no check at the base.
  assert.deepEqual(
    workflowInputs("c.yml", "jobs:\n  a:\n    runs-on: x\n", "jobs: {}\n", parseYaml),
    [],
  );
  assert.deepEqual(workflowInputs("c.yml", "", base, parseYaml), []);

  const manifest = (/** @type {object} */ scripts) =>
    JSON.stringify({ name: "x", scripts: { test: "node --test", ...scripts } });
  const files = /** @type {Record<string, [string | null, string | null]>} */ ({
    "package.json": [manifest({}), manifest({ postinstall: "node scripts/pi.mjs" })],
    ".npmrc": [null, "registry=https://example.com/\n"],
    "patches/knip@6.45.1.patch": [null, "--- a\n"],
  });
  const kind = classify({
    changed: Object.keys(files),
    configPath: ".no-bloat.json",
    before: (p) => files[p]?.[0] ?? null,
    now: (p) => files[p]?.[1] ?? null,
  });
  assert.equal(kind.code, false);
  assert.deepEqual(kind.definition, [
    "package.json install scripts or patches",
    ".npmrc",
    "patches/knip@6.45.1.patch",
  ]);
});

test("a Knip plugin's config, and what a config in code imports, is a change of how Knip counts", () => {
  const files = {
    ".mocharc.cjs": 'const spec = require("./test/spec.cjs");\nmodule.exports = { spec };\n',
    "test/spec.cjs": 'module.exports = require("../tools/list");\n',
    "tools/list.ts": "export default [];\n",
    "apps/web/vite.config.ts":
      'import plugin from "./plugin.js";\nexport default { plugins: [plugin] };\n',
    "apps/web/plugin.ts": "export default {};\n",
    "tsconfig.json": "{}\n",
    "src/a.ts": 'import "./b";\n',
    "src/b.ts": "",
    "package.json": "{}",
    ".github/workflows/ci.yml": "",
  };
  const patterns = [
    ".mocharc.{js,cjs,json}",
    "vite.config.{js,ts}",
    "tsconfig.json",
    "package.json",
    ".github/workflows/*.yml",
  ];
  assert.deepEqual(
    knipPluginFiles(
      Object.keys(files),
      patterns,
      (p) => files[/** @type {keyof typeof files} */ (p)],
    ).sort(),
    [
      ".mocharc.cjs",
      "apps/web/plugin.ts",
      "apps/web/vite.config.ts",
      "test/spec.cjs",
      "tools/list.ts",
      "tsconfig.json",
    ],
  );
  // An import stops at code the repository's Knip project counts: Knip reads it the same whoever imports it (Capsomer's
  // docs site renders pages from its components and its own render modules). Data it imports is still followed.
  const site = {
    "site/vite.config.ts":
      'import { render } from "./home.ts";\nimport data from "./pages.json";\nexport default { plugins: [render] };\n',
    "site/home.ts":
      'import { open } from "../components/dialog/dialog.ts";\nexport const render = open;\n',
    "site/pages.json": "[]\n",
    "components/dialog/dialog.ts": "export const open = 1;\n",
    "knip.jsonc":
      '{\n  // why\n  "entry": ["components/*/*.ts", "!x"],\n  "project": ["**/*.{ts,mjs}"],\n}\n',
  };
  const read = (/** @type {string} */ p) => site[/** @type {keyof typeof site} */ (p)] ?? null;
  assert.deepEqual(knipCounted(read), ["components/*/*.ts", "**/*.{ts,mjs}"]);
  assert.deepEqual(
    knipCounted(() => null),
    ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
  );
  assert.deepEqual(
    knipPluginFiles(Object.keys(site), patterns, (p) => read(p) ?? "", knipCounted(read)).sort(),
    ["site/pages.json", "site/vite.config.ts"],
  );
  // A config Knip takes the same inputs from at the base and now is code, and so is what it imports.
  assert.deepEqual(
    knipPluginFiles(Object.keys(site), patterns, (p) => read(p) ?? "", knipCounted(read), [
      "site/vite.config.ts",
    ]),
    [],
  );
  assert.deepEqual(
    knipConfigInputs(
      "[.] Inputs\n[\n  'binary:vite (package.json)',\n  'entry:site/vite.config.ts',\n  'entry:src/vite-env.d.ts (site/vite.config.ts)',\n  'dependency:@vitejs/plugin-react (site/vite.config.ts)'\n]\n",
    ),
    {
      "package.json": ["binary:vite"],
      "site/vite.config.ts": ["dependency:@vitejs/plugin-react", "entry:src/vite-env.d.ts"],
    },
  );
  // Knip counts no less when the config only drops inputs, names pages the build writes, or loads a new page script;
  // an entry that makes a file of the repository used is a wider measure.
  const tracked = ["site/vite.config.ts", "site/page.ts", "site/dead.ts", "site/page.html"];
  const was = ["deferResolveEntry:site/index.html", "entry:src/vite-env.d.ts"];
  const scripts = pageScripts(["deferResolveEntry:site/gen/a.html"], (p) =>
    p === "site/gen/a.html"
      ? '<script src="/theme.js"></script><script type="module" src="/site/page.ts"></script><script src="https://x.example/a.js"></script>'
      : null,
  );
  assert.deepEqual(scripts, ["theme.js", "site/page.ts"]);
  const now = (/** @type {string[]} */ more) => ["entry:src/vite-env.d.ts", ...more];
  const ok = (/** @type {string[]} */ more) =>
    inputsNarrowed("site/vite.config.ts", was, now(more), tracked, tracked, scripts);
  assert.equal(ok([]), true);
  assert.equal(ok(["deferResolveEntry:site/gen/a.html", "deferResolveEntry:site/page.ts"]), true);
  assert.equal(ok(["deferResolveEntry:site/dead.ts"]), false);
  assert.equal(ok(["dependency:left-pad"]), false);
  // Dropping an entry makes Knip count more, so it is code; dropping a negation or anything else is a change of measure.
  const knip = (/** @type {string[]} */ entry, project = ["**/*.ts"], more = {}) =>
    JSON.stringify({ entry, project, ...more });
  const drop = (/** @type {string} */ was, /** @type {string} */ is) =>
    classify({
      changed: ["knip.json"],
      configPath: ".no-bloat.json",
      before: () => was,
      now: () => is,
    });
  const dropped = drop(knip(["a.ts", "b.ts"]), knip(["a.ts"]));
  assert.deepEqual([dropped.code, dropped.definition], [true, []]);
  assert.deepEqual(drop(knip(["a.ts", "!b.ts"]), knip(["a.ts"])).definition, ["knip.json"]);
  assert.deepEqual(drop(knip(["a.ts"]), knip(["a.ts"], ["src/**"])).definition, ["knip.json"]);
  // Adding entries or ignored dependencies is a change of measure that may lower any Knip count, and nothing else.
  const [more, ign] = [["a.ts", "app/site.ts", "app/islands/*.ts"], { ignoreDependencies: ["x"] }];
  const add = drop(knip(["a.ts"]), knip(more, undefined, ign));
  assert.deepEqual(
    [add.code, add.definition, add.entries],
    [false, ["knip.json"], { "knip.json": ["app/site.ts", "app/islands/*.ts", "x"] }],
  );
  const counts = (/** @type {number} */ files, clones = 0) => ({
    baseline: { knip: { files, exports: files }, jscpd: { clones }, comments: { code: files } },
  });
  assert.deepEqual(raised(counts(0), counts(3), add), []);
  assert.match(raised(counts(0), counts(3, 1), add).join(), /lowers clones from 1 to 0/);
  // Beside another change of measure, or with a negation, nothing may drop.
  assert.match(
    raised(counts(0), counts(2), { ...add, definition: ["knip.json", ".jscpd.json"] }).join(),
    /lowers files from 2 to 0/,
  );
  assert.deepEqual(drop(knip(["a.ts"]), knip(["a.ts", "!b.ts"])).entries, {});
  const kind = classify({
    changed: [".mocharc.cjs", "src/a.ts"],
    configPath: ".no-bloat.json",
    plugins: [".mocharc.cjs"],
    before: () => "",
    now: () => "x",
  });
  assert.deepEqual([kind.code, kind.definition], [true, [".mocharc.cjs"]]);
});

test(
  "end to end in Actions: the check counts the commit the run is for, so an install that moves HEAD or resets a file fails",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, "a.mjs"), "export const a = 1;\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      const sha = git(dir, "rev-parse", "HEAD").trim();
      assert.deepEqual(checkoutProblems(dir, sha), []);
      // What a postinstall that puts the base back would leave: a tracked file changed, or hidden from git status.
      writeFileSync(join(dir, "a.mjs"), "");
      assert.match(
        checkoutProblems(dir, sha).join(),
        /a\.mjs differs from [0-9a-f]{7}, the commit this run is for/,
      );
      git(dir, "update-index", "--skip-worktree", "a.mjs");
      assert.match(
        checkoutProblems(dir, sha).join(),
        /a\.mjs is marked assume-unchanged or skip-worktree/,
      );
      git(dir, "update-index", "--no-skip-worktree", "a.mjs");
      git(dir, "checkout", "--", "a.mjs");
      git(dir, "commit", "-q", "--allow-empty", "-m", "Elsewhere");
      assert.match(
        checkoutProblems(dir, sha).join(),
        /HEAD is [0-9a-f]{7}, not [0-9a-f]{7}, the commit this run is for/,
      );
      // The bin fails on it before it counts, and with no commit to hold to (outside Actions) it counts the working tree.
      const r = runBin(dir, ["--lines-from", "main"], { GITHUB_SHA: sha });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /::error::HEAD is/);
      assert.deepEqual(checkoutProblems(dir, ""), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
