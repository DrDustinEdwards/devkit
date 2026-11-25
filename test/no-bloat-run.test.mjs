// The no-bloat bin run end to end in a scratch git repository.

import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { git, runBin, scratch, tool } from "./fixtures/no-bloat.mjs";

test(
  "end to end: --write-baseline records the counts, a later run that grew fails, and so does one that shrank until the baseline is lowered",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(
        join(dir, ".no-bloat.json"),
        JSON.stringify({ knip: [{ label: "knip (root)" }] }),
      );
      const written = runBin(dir, ["--write-baseline"]);
      assert.equal(written.status, 0, written.stderr);
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));
      assert.deepEqual(config.knip, [{ label: "knip (root)" }]);
      assert.deepEqual(config.baseline["knip (root)"], { files: 2, exports: 3 });
      assert.deepEqual(config.baseline.jscpd, { clones: 4, lines: 30, percentage: 2.5, unread: 0 });
      assert.deepEqual(config.baseline.tests, { files: 0, cases: 0 });
      // No commit yet: the day.
      assert.match(config.baseline.measured_at, /^\d{4}-\d{2}-\d{2}$/);

      const summary = join(dir, "summary.md");
      writeFileSync(summary, "");
      const grown = scratch({ clones: 7 });
      writeFileSync(join(grown, ".no-bloat.json"), JSON.stringify(config));
      const r = runBin(grown, [], { GITHUB_STEP_SUMMARY: summary });
      rmSync(grown, { recursive: true, force: true });
      assert.equal(r.status, 1);
      assert.match(
        r.stdout,
        /\| jscpd \| clones \| 4 \| 7 \(up\) \|\n\| jscpd \| duplicated lines \| 30 \| 30 \|\n/,
      );
      assert.match(
        r.stdout,
        /::error::jscpd: clones went from 4 to 7. Run `npx jscpd` to see them.\n::error::Remove what was added:/,
      );
      assert.doesNotMatch(r.stdout, /::error::knip/);
      assert.match(readFileSync(summary, "utf8"), /### No-bloat ratchet \(baseline /);

      const shrunk = scratch({ clones: 2 });
      writeFileSync(join(shrunk, ".no-bloat.json"), JSON.stringify(config));
      const s = runBin(shrunk);
      assert.equal(s.status, 1, s.stdout);
      assert.match(
        s.stdout,
        /::error::Lower the baseline to lock this in \(jscpd: clones 4 to 2\)/,
      );
      assert.equal(runBin(shrunk, ["--write-baseline"]).status, 0);
      assert.equal(runBin(shrunk).status, 0);
      rmSync(shrunk, { recursive: true, force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a tool that fails is an error and exit 1, there is no --warn-only, and --write-baseline refuses a partial baseline",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch({ jscpdFails: true });
    try {
      const r = runBin(dir);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /::error::jscpd could not run: jscpd exited 3: jscpd: boom/);
      assert.match(r.stdout, /\| knip \| files \| none \| 2 \|/);

      writeFileSync(
        join(dir, "bloat.json"),
        JSON.stringify({
          knip: [{ label: "knip" }, { label: "knip (broken)", args: ["--fail"] }],
          baseline: { knip: { files: 1 } },
        }),
      );
      const failed = runBin(dir, ["--config", "bloat.json", "--lines-from", "no-such-rev"]);
      assert.equal(failed.status, 1, failed.stdout);
      assert.match(
        failed.stdout,
        /::error::knip \(broken\) could not run: knip exited 2: knip: boom/,
      );
      assert.match(failed.stdout, /::error::jscpd could not run/);
      assert.match(failed.stdout, /::error::knip: files went from 1 to 2/);
      assert.match(failed.stdout, /::error::The baseline at no-such-rev could not be read: /);
      // A report never stops a copy, so there is no report mode.
      const warnOnly = runBin(dir, ["--warn-only"]);
      assert.equal(warnOnly.status, 2);
      assert.match(warnOnly.stderr, /--warn-only was removed in 0\.37\.0/);

      const w = runBin(dir, ["--write-baseline"]);
      assert.equal(w.status, 1);
      assert.match(
        w.stderr,
        /^devkit-no-bloat: jscpd could not run: [^\n]*\ndevkit-no-bloat: the baseline was not written/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a pull request that adds a test fails until its baseline is raised, and the summary has its lines by kind",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, "a.test.mjs"), '// why a\ntest("a", () => {});\n');
      writeFileSync(join(dir, "notes.md"), "-- a line that starts with two dashes\n");
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");
      writeFileSync(
        join(dir, "a.test.mjs"),
        'test("a", () => {});\n// why b\ntest("b", () => {});\n',
      );
      writeFileSync(join(dir, "notes.md"), "");
      git(dir, "commit", "-qam", "Add a test");

      const summary = join(dir, "summary.md");
      const r = runBin(dir, ["--lines-from", "main"], { GITHUB_STEP_SUMMARY: summary });
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /::error::tests: test cases went from 1 to 2/);
      const lines = readFileSync(summary, "utf8");
      assert.match(lines, /\| tests \| 1 \| 0 \| \+1 \|/);
      // The removed comment is read at the base, where it was a comment.
      assert.match(lines, /\| comments \| 1 \| 1 \| 0 \|/);
      assert.match(lines, /\| docs \| 0 \| 1 \| -1 \|/);

      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      assert.equal(
        JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8")).baseline.measured_at,
        git(dir, "rev-parse", "--short", "HEAD").trim(),
      );
      assert.equal(runBin(dir).status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a raised baseline fails on a pull request and in a local run, a tools change does not excuse it, and only a change that moves no code may raise",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", devDependencies: { a: "1.0.0" } }),
      );
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");
      // A copy and the raise that would let it in, with the tools moved too.
      writeFileSync(join(dir, "copy.mjs"), "export const a = 1;\n");
      const grown = tool(dir, "jscpd");
      writeFileSync(grown, readFileSync(grown, "utf8").replace("clones: 4", "clones: 5"));
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));
      config.tools = { jscpd: "jscpd@4.4.0" };
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      const refused = runBin(dir, ["--write-baseline"], { GITHUB_ACTIONS: "" });
      // A local run with no remote names what to pass.
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /none of origin\/HEAD, origin\/main, origin\/master resolves/);
      git(dir, "update-ref", "refs/remotes/origin/main", "main");
      const w = runBin(dir, ["--write-baseline"], { GITHUB_ACTIONS: "" });
      assert.equal(w.status, 1, w.stderr);
      assert.match(w.stderr, /jscpd: this change raises the baseline's clones from 4 to 5/);
      assert.match(w.stderr, /the baseline was not written/);
      config.baseline.jscpd.clones = 5;
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Raise");
      const pr = runBin(dir, ["--lines-from", "main"]);
      assert.equal(pr.status, 1, pr.stdout);
      assert.match(
        pr.stdout,
        /::error::jscpd: this change raises the baseline's clones from 4 to 5/,
      );
      const local = runBin(dir, [], { GITHUB_ACTIONS: "" });
      assert.equal(local.status, 1, local.stdout);
      assert.match(local.stdout, /::error::jscpd: this change raises the baseline's clones/);
      // Setting GITHUB_ACTIONS does not skip a default branch that resolves.
      assert.equal(runBin(dir).status, 1);
      // Nor does pointing --lines-from at the change itself.
      const self = runBin(dir, ["--lines-from", "HEAD"]);
      assert.equal(self.status, 1, self.stdout);
      assert.match(self.stdout, /HEAD is the change itself/);

      // The same raise with no code moved (a tool bump: config, lockfile, versions) passes; a new library does not.
      git(dir, "rm", "-q", "copy.mjs");
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", devDependencies: { a: "2.0.0" } }),
      );
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Bump");
      assert.equal(runBin(dir, ["--lines-from", "main"]).status, 0);
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", devDependencies: { a: "2.0.0", unused: "1.0.0" } }),
      );
      git(dir, "commit", "-qam", "Add a library");
      assert.equal(runBin(dir, ["--lines-from", "main"]).status, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a baseline count new in the change is raised from 0, and an exception added without a reason fails",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ shared: false }));
      assert.equal(runBin(dir, ["--write-baseline"]).status, 0);
      const config = JSON.parse(readFileSync(join(dir, ".no-bloat.json"), "utf8"));
      delete config.baseline.knip;
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      writeFileSync(join(dir, "knip.json"), '{\n  "ignore": ["old/**"]\n}\n');
      writeFileSync(join(dir, ".jscpd.json"), '{ "ignore": ["**/node_modules/**"] }\n');
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Base");
      git(dir, "checkout", "-qb", "change");
      writeFileSync(join(dir, "a.mjs"), "export const a = 1;\n");
      assert.equal(runBin(dir, ["--write-baseline"], { GITHUB_ACTIONS: "" }).status, 1);
      config.baseline.knip = { files: 2, exports: 3 };
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify(config));
      writeFileSync(
        join(dir, "knip.json"),
        '{\n  // Generated by the build, read by nothing here.\n  "ignore": ["old/**", "gen/**"],\n  "ignoreDependencies": [\n    "a",\n    "b" // used by the deploy script\n  ]\n}\n',
      );
      writeFileSync(join(dir, ".jscpd.json"), '{ "ignore": ["**/node_modules/**", "copy/**"] }\n');
      writeFileSync(
        join(dir, "b.mjs"),
        "// jscpd:ignore-start\nexport const b = 1;\n// jscpd:ignore-end\n// jscpd:ignore-start the fixture mirrors the API reply\n/** @public */\nexport const c = 1;\n/** @public read by the docs build */\n",
      );
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "Change");
      const r = runBin(dir, ["--lines-from", "main"]);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /::error::knip: this change raises the baseline's files from 0 to 2/);
      assert.match(
        r.stdout,
        /::error::knip\.json line 5 \("a",\) is new and says nothing about why/,
      );
      assert.doesNotMatch(r.stdout, /knip\.json line [346] /);
      assert.match(r.stdout, /::error::\.jscpd\.json: the ignore entry "copy\/\*\*" is new/);
      assert.match(
        r.stdout,
        /::error::b\.mjs: a new `jscpd:ignore-start` gives no reason \(\/\/ jscpd:ignore-start\)/,
      );
      assert.equal(r.stdout.match(/::error::b\.mjs: a new `jscpd:ignore-start`/g)?.length, 1);
      assert.equal(r.stdout.match(/::error::b\.mjs: a new `@public` gives no reason/g)?.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: no config, or one with an empty baseline, fails rather than passing every count",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      const missing = runBin(dir);
      assert.equal(missing.status, 1);
      assert.match(missing.stdout, /\.no-bloat\.json does not exist, so every count would pass/);
      writeFileSync(join(dir, ".no-bloat.json"), JSON.stringify({ baseline: {} }));
      const empty = runBin(dir);
      assert.equal(empty.status, 1);
      assert.match(empty.stdout, /\.no-bloat\.json has no baseline/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "end to end: a config that is not JSON fails, rather than passing with no baseline",
  { skip: process.platform === "win32" },
  () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, ".no-bloat.json"), "{ nope");
      const r = runBin(dir);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /\.no-bloat\.json is not JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
