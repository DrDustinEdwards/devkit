// devkit-migrations: what counts as more than expanding, and the manifest comparison in both directions.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  check,
  contractions,
  handOnly,
  readBookmark,
  pendingBlockers,
  readPending,
  sha256,
} from "../bin/migrations.mjs";

const BIN = fileURLToPath(new URL("../bin/migrations.mjs", import.meta.url));

test("drops and renames are contractions unless the file says why; comments and strings are not read", () => {
  assert.deepEqual(
    contractions(
      "ALTER TABLE posts ADD COLUMN dropped_at TEXT;\n-- DROP TABLE posts;\nINSERT INTO t VALUES ('DROP TABLE x');",
    ),
    [],
  );
  assert.deepEqual(contractions("DROP TABLE posts;\nALTER TABLE `new` RENAME TO posts;"), [
    "drops a table",
    "renames a table or column",
  ]);
  assert.deepEqual(contractions("ALTER TABLE posts DROP COLUMN category;"), ["drops a column"]);
  assert.deepEqual(
    contractions("-- contract: rebuilds posts to drop a foreign key\nDROP TABLE posts;"),
    [],
  );
});

test("an edited, unrecorded, deleted or contracting migration each fails; a clean set passes", () => {
  const sql = {
    "0001_a.sql": "CREATE TABLE a (id INTEGER);",
    "0002_b.sql": "ALTER TABLE a ADD COLUMN b TEXT;",
  };
  const read = (f) => sql[f];
  const manifest = {
    expand_only_after: "0001_a.sql",
    sha256: { "0001_a.sql": sha256(sql["0001_a.sql"]), "0002_b.sql": sha256(sql["0002_b.sql"]) },
  };
  assert.deepEqual(check({ files: Object.keys(sql), read, manifest }), []);
  assert.match(
    check({
      files: Object.keys(sql),
      read: (f) => (f === "0001_a.sql" ? "CREATE TABLE a (id TEXT);" : sql[f]),
      manifest,
    }).join(),
    /0001_a\.sql differs/,
  );
  assert.match(
    check({ files: ["0001_a.sql"], read, manifest }).join(),
    /0002_b\.sql is in the manifest but not on disk/,
  );
  const next = { ...sql, "0003_c.sql": "ALTER TABLE a DROP COLUMN b;" };
  const problems = check({ files: Object.keys(next), read: (f) => next[f], manifest }).join("\n");
  assert.match(problems, /0003_c\.sql is not in the manifest/);
  assert.match(problems, /0003_c\.sql drops a column/);
});

test("--apply runs only what adds: a drop, rename, DELETE or `-- contract:` line is a person's call; trigger bodies are not read", () => {
  assert.deepEqual(
    handOnly(
      "CREATE TABLE a (id INTEGER);\nALTER TABLE a ADD COLUMN b TEXT;\nCREATE TABLE c (a INTEGER REFERENCES a ON DELETE SET NULL ON UPDATE CASCADE);\nCREATE TRIGGER a_ad AFTER DELETE ON a BEGIN DELETE FROM a_fts WHERE rowid = old.id; END;",
    ),
    [],
  );
  assert.deepEqual(handOnly("-- contract: rebuild a\nDROP TABLE a;"), [
    "says `-- contract:`",
    "drops a table",
  ]);
  assert.deepEqual(handOnly("DELETE FROM sessions;"), ["deletes rows"]);
  for (const sql of [
    "UPDATE a SET b = 1;",
    "INSERT OR REPLACE INTO a VALUES (1);",
    "REPLACE INTO a VALUES (1);",
    "DROP INDEX i;",
    "DROP VIEW v;",
    "DROP TRIGGER t;",
    "PRAGMA writable_schema = 1;",
  ])
    assert.equal(contractions(sql).length, 1, sql);
  assert.deepEqual(contractions("DELETE FROM a;"), ["deletes rows"]);
  assert.deepEqual(handOnly("ALTER TABLE a RENAME COLUMN b TO c;"), ["renames a table or column"]);
});

test("--apply reads wrangler's list as pending, clean or unreadable, and its bookmark after the banner", () => {
  assert.deepEqual(
    readPending({
      code: 0,
      text: "Migrations to be applied:\n│ 0052_ops_sites_hosts.sql │\n│ 0053_x.sql │",
    }),
    { state: "pending", pending: ["0052_ops_sites_hosts.sql", "0053_x.sql"] },
  );
  assert.deepEqual(readPending({ code: 0, text: "✅ No migrations to apply!" }), {
    state: "clean",
    pending: [],
  });
  assert.equal(readPending({ code: 1, text: "✅ No migrations to apply!" }).state, "unreadable");
  assert.equal(readPending({ code: 0, text: "something new" }).state, "unreadable");
  assert.equal(
    readBookmark(
      ' ⛅️ wrangler 4.149.0\n{ "bookmark": "00000085-0000024c", "timestamp": "2026-10-31T11:00:00Z" }',
    ),
    "00000085-0000024c",
  );
  assert.equal(readBookmark("✘ [ERROR] Authentication error"), "");
});

test("quoted identifiers hold apostrophes, and a marker inside a block comment is not a marker", () => {
  assert.deepEqual(contractions("CREATE TABLE \"a'b\" (x);\nDROP TABLE t;\nSELECT 'x';"), [
    "drops a table",
  ]);
  assert.deepEqual(contractions("CREATE TABLE [a'b] (x); ALTER TABLE `c'd` RENAME TO e;"), [
    "renames a table or column",
  ]);
  assert.deepEqual(contractions("/*\n-- contract: x\n*/\nDROP TABLE a;"), ["drops a table"]);
  assert.deepEqual(handOnly("/* -- contract: x */ SELECT 1;"), []);
});

test("a pending file with an unexpected name is a person's call, not skipped", () => {
  const listed = readPending({
    code: 0,
    text: "Migrations to be applied:\n│ 0001_ok.sql │\n│ 1_bad.sql │",
  });
  assert.deepEqual(listed.pending, ["0001_ok.sql", "1_bad.sql"]);
  assert.deepEqual(pendingBlockers("0001_ok.sql", "CREATE TABLE a (x);"), []);
  assert.match(pendingBlockers("1_bad.sql", "CREATE TABLE a (x);").join(), /name/);
  assert.match(pendingBlockers("0002_gone.sql", null).join(), /not on disk/);
});

test("--write refuses a recorded migration that is gone from disk, unless --force", () => {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  try {
    writeFileSync(join(dir, "0001_a.sql"), "CREATE TABLE a (x);");
    const run = (...args) =>
      spawnSync(process.execPath, [BIN, dir, "--write", ...args], {
        encoding: "utf8",
      });
    assert.equal(run().status, 0);
    rmSync(join(dir, "0001_a.sql"));
    writeFileSync(join(dir, "0001_renamed.sql"), "CREATE TABLE a (x);");
    const refused = run();
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /0001_a\.sql is recorded but not on disk/);
    assert.equal(run("--force").status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("statements splits on `;` outside strings and comments, with strings blanked", async () => {
  const { statements } = await import("../bin/migration-scan.mjs");
  assert.deepEqual(
    statements(
      "CREATE TABLE t (a text DEFAULT ';'); -- note; DROP TABLE x\nCREATE INDEX i ON t(a);",
    ),
    ["CREATE TABLE t (a text DEFAULT _ )", "CREATE INDEX i ON t(a)"],
  );
});
