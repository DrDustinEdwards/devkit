// Resetting a test database between cases. A hand-written list of tables to clear drifts the day a migration adds
// one, so the tables are read from the
// schema instead. Works on any binding shaped like D1's: prepare, all, batch.

/** Never cleared: SQLite's own tables, D1's internal ones, and the record of which migrations ran. */
const NEVER = /^(sqlite_|_cf_)|^d1_migrations$/;

/** The shadow tables FTS5 (and FTS3/4) keeps beside a virtual table. */
const SHADOW = ["_data", "_idx", "_content", "_docsize", "_config", "_segments", "_segdir", "_stat"];

/**
 * Deletes every row of every table in `sqlite_master`, in one batch, and returns the tables it cleared. A virtual
 * table (FTS5) is cleared through itself and its shadow tables are left to it. Foreign keys are checked when the batch
 * commits rather than after each delete, so the order the schema lists tables in does not matter. `keep` names tables
 * to leave as they are.
 *
 * @param {D1Like} db
 * @param {{ keep?: readonly string[] }} [options]
 * @returns {Promise<string[]>}
 */
export async function resetDb(db, { keep = [] } = {}) {
  const { results } = await db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all();
  const rows = /** @type {Array<{ name: string, sql: string | null }>} */ (results);
  const virtual = rows.filter((r) => /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(r.sql ?? "")).map((r) => r.name);
  // Only the names FTS itself gives its shadow tables: a real table that merely starts with `<fts>_` is still cleared.
  const isShadow = (/** @type {string} */ name) => virtual.some((v) => SHADOW.some((suffix) => name === `${v}${suffix}`));

  const tables = rows.map((r) => r.name).filter((name) => !NEVER.test(name) && !keep.includes(name) && !isShadow(name));
  if (tables.length === 0) return [];

  await db.batch([
    db.prepare("PRAGMA defer_foreign_keys = ON"),
    ...tables.map((name) => db.prepare(`DELETE FROM "${name.replaceAll('"', '""')}"`)),
  ]);
  return tables;
}

/**
 * @typedef {{
 *   prepare(sql: string): { all(): Promise<{ results: unknown[] }> },
 *   batch(statements: unknown[]): Promise<unknown>,
 * }} D1Like
 */
