// devkit-migrations: what counts as more than expanding, and the manifest comparison in both directions.

import assert from "node:assert/strict";
import test from "node:test";

import { check, contractions, sha256 } from "../bin/migrations.mjs";

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
