// devkit-migrations: what counts as more than expanding, and the manifest comparison in both directions.

import assert from "node:assert/strict";
import test from "node:test";

import { check, contractions, handOnly, readBookmark, readPending, sha256 } from "../bin/migrations.mjs";

test("drops and renames are contractions unless the file says why; comments and strings are not read", () => {
  assert.deepEqual(contractions("ALTER TABLE posts ADD COLUMN dropped_at TEXT;\n-- DROP TABLE posts;\nINSERT INTO t VALUES ('DROP TABLE x');"), []);
  assert.deepEqual(contractions("DROP TABLE posts;\nALTER TABLE `new` RENAME TO posts;"), ["drops a table", "renames a table or column"]);
  assert.deepEqual(contractions("ALTER TABLE posts DROP COLUMN category;"), ["drops a column"]);
  assert.deepEqual(contractions("-- contract: rebuilds posts to drop a foreign key\nDROP TABLE posts;"), []);
});

test("an edited, unrecorded, deleted or contracting migration each fails; a clean set passes", () => {
  const sql = { "0001_a.sql": "CREATE TABLE a (id INTEGER);", "0002_b.sql": "ALTER TABLE a ADD COLUMN b TEXT;" };
  const read = (f) => sql[f];
  const manifest = { expand_only_after: "0001_a.sql", sha256: { "0001_a.sql": sha256(sql["0001_a.sql"]), "0002_b.sql": sha256(sql["0002_b.sql"]) } };
  assert.deepEqual(check({ files: Object.keys(sql), read, manifest }), []);
  assert.match(check({ files: Object.keys(sql), read: (f) => (f === "0001_a.sql" ? "CREATE TABLE a (id TEXT);" : sql[f]), manifest }).join(), /0001_a\.sql differs/);
  assert.match(check({ files: ["0001_a.sql"], read, manifest }).join(), /0002_b\.sql is in the manifest but not on disk/);
  const next = { ...sql, "0003_c.sql": "ALTER TABLE a DROP COLUMN b;" };
  const problems = check({ files: Object.keys(next), read: (f) => next[f], manifest }).join("\n");
  assert.match(problems, /0003_c\.sql is not in the manifest/);
  assert.match(problems, /0003_c\.sql drops a column/);
});

test("--apply runs only what adds: a drop, rename, DELETE or `-- contract:` line is a person's call; trigger bodies are not read", () => {
  assert.deepEqual(handOnly("CREATE TABLE a (id INTEGER);\nALTER TABLE a ADD COLUMN b TEXT;\nUPDATE a SET b = 'x';\nCREATE TRIGGER a_ad AFTER DELETE ON a BEGIN DELETE FROM a_fts WHERE rowid = old.id; END;"), []);
  assert.deepEqual(handOnly("-- contract: rebuild a\nDROP TABLE a;"), ["says `-- contract:`", "drops a table"]);
  assert.deepEqual(handOnly("DELETE FROM sessions;"), ["deletes rows"]);
  assert.deepEqual(handOnly("ALTER TABLE a RENAME COLUMN b TO c;"), ["renames a table or column"]);
});

test("--apply reads wrangler's list as pending, clean or unreadable, and its bookmark after the banner", () => {
  assert.deepEqual(readPending({ code: 0, text: "Migrations to be applied:\n│ 0052_ops_sites_hosts.sql │\n│ 0053_x.sql │" }), { state: "pending", pending: ["0052_ops_sites_hosts.sql", "0053_x.sql"] });
  assert.deepEqual(readPending({ code: 0, text: "✅ No migrations to apply!" }), { state: "clean", pending: [] });
  assert.equal(readPending({ code: 1, text: "✅ No migrations to apply!" }).state, "unreadable");
  assert.equal(readPending({ code: 0, text: "something new" }).state, "unreadable");
  assert.equal(readBookmark(' ⛅️ wrangler 4.149.0\n{ "bookmark": "00000085-0000024c", "timestamp": "2026-10-31T11:00:00Z" }'), "00000085-0000024c");
  assert.equal(readBookmark("✘ [ERROR] Authentication error"), "");
});
