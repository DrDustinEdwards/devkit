#!/usr/bin/env node
// The expand-only migration check. An applied D1 migration is history: the database ran it, and a fresh clone and every
// restore rebuild the schema from the files as they are. So a migration is never edited, renamed or deleted, and a new
// one only adds (a table, a column, an index) unless it says why it does more. Moved here from dustinedwards.info's
// scripts/check-migrations.mjs.
//
//   npx devkit-migrations <dir>                    check the migrations in <dir> against <dir>/manifest.json
//   npx devkit-migrations <dir> --write [--force]  record each migration's sha256 in the manifest
//   options: --manifest <file> (default <dir>/manifest.json), --min <n> (fewer .sql files fails: a wrong or emptied
//            directory), --state <dir> (wrangler's local state, default .wrangler/state), --require-ledger
//
// The check fails when:
//   - the manifest is missing or empty, or the directory holds fewer than --min migrations;
//   - a .sql file is not recorded (a new migration adds its hash in the same commit: --write), its bytes differ from its
//     recorded hash (an applied migration was edited; the repair is a new migration), or a recorded file is gone;
//   - a migration after the manifest's `expand_only_after` drops or renames a table or column without a line
//     `-- contract: <reason>` in it (a table rebuild, for instance, says so). --write sets `expand_only_after` to the
//     newest migration the first time it runs, so the files already applied are not judged again;
//   - the local database under --state has a d1_migrations ledger that lacks a migration on disk or names one that is not
//     on disk. No local database skips this, unless --require-ledger (CI that applies the migrations first passes it).
//
// --write refuses to change a recorded hash without --force, which puts the decision in the shell history. Line endings
// are read as LF, so a checkout with autocrlf hashes the same as the commit.
//
// APPLY, IN A DEPLOY. So no site needs migrations run by hand before a merge:
//
//   npx devkit-migrations <dir> --apply <database> [--config <wrangler config>]
//
// asks the remote database which migrations are pending (`wrangler d1 migrations list --remote`). None: exit 0. Pending
// ones that only add are applied after the D1 Time Travel bookmark is read, and the restore command goes to the log and
// the step summary, because a Worker rollback never undoes a migration. A pending migration that drops or renames, deletes
// rows, or carries a `-- contract:` line is refused (exit 1) with the hand-run command: the person decides that one. An
// output it cannot read, a bookmark it cannot read, a failed apply, or a database still behind afterwards exits 1, before
// the caller deploys. It runs the repository's own wrangler (node_modules/.bin), else `npx wrangler`.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const NOTE = "sha256 of each migration. devkit-migrations compares against this. Adding a migration means adding its hash in the same commit.";
const DESTRUCTIVE = [
  [/\bDROP\s+TABLE\b/i, "drops a table"],
  [/\bALTER\s+TABLE\s+[^;]*?\bDROP\b/i, "drops a column"],
  [/\bALTER\s+TABLE\s+[^;]*?\bRENAME\b/i, "renames a table or column"],
];

export const sha256 = (/** @type {string} */ text) => createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");

/**
 * What a migration does beyond adding, read with its comments and string literals blanked; empty when it only adds or
 * carries a `-- contract: <reason>` line.
 * @param {string} sql
 * @returns {string[]}
 */
export function contractions(sql) {
  if (/^\s*--\s*contract:\s*\S/im.test(sql)) return [];
  const code = sql.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  return DESTRUCTIVE.filter(([pattern]) => pattern.test(code)).map(([, what]) => /** @type {string} */ (what));
}

/**
 * Why a pending migration must be applied by a person rather than by the deploy; empty when it only adds. Stricter than
 * `contractions`: a `-- contract:` line makes a migration reviewable, not safe to run unattended, and a DELETE loses rows.
 * @param {string} sql
 * @returns {string[]}
 */
export function handOnly(sql) {
  const marked = /^\s*--\s*contract:\s*\S/im.test(sql);
  const unmarked = sql.replace(/^\s*--\s*contract:.*$/gim, "");
  const code = unmarked.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, " ").replace(/\bCREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b[\s\S]*?\bBEGIN\b[\s\S]*?\bEND\s*;/gi, " ");
  return [...(marked ? ["says `-- contract:`"] : []), ...contractions(unmarked), ...(/\bDELETE\s+FROM\b/i.test(code) ? ["deletes rows"] : [])];
}

/**
 * `wrangler d1 migrations list --remote`, read three ways: pending (with the names), clean, or unreadable. Names win over
 * the clean line, and output with neither is unreadable rather than clean, so a changed wrangler fails closed.
 * @param {{ code: number, text: string }} listed
 * @returns {{ state: "pending" | "clean" | "unreadable", pending: string[] }}
 */
export function readPending({ code, text }) {
  const names = [...new Set(String(text).match(/\b\d{4}_[\w-]+\.sql\b/g) ?? [])];
  if (code !== 0) return { state: "unreadable", pending: [] };
  if (names.length && /Migrations to be applied/.test(text)) return { state: "pending", pending: names };
  if (!names.length && /No migrations to apply/.test(text)) return { state: "clean", pending: [] };
  return { state: "unreadable", pending: names };
}

/** The bookmark in `wrangler d1 time-travel info <db> --json` output, after any banner; "" when there is none. */
export function readBookmark(/** @type {string} */ text) {
  const raw = String(text ?? "");
  try {
    const bookmark = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)).bookmark;
    return typeof bookmark === "string" ? bookmark : "";
  } catch {
    return "";
  }
}

/**
 * Every problem with the migrations against the manifest, as sentences.
 * @param {{ files: string[], read: (file: string) => string, manifest: { sha256?: Record<string, string>, expand_only_after?: string } | null, min?: number }} input
 */
export function check({ files, read, manifest, min = 1 }) {
  const problems = [];
  if (files.length < min) problems.push(`${files.length} migrations on disk, fewer than ${min}: the directory is wrong or migrations were deleted`);
  if (!manifest) return [...problems, "no manifest: record the hashes with `npx devkit-migrations <dir> --write` and commit it"];
  const recorded = manifest.sha256 ?? {};
  if (!Object.keys(recorded).length) problems.push("the manifest records no hashes, so every comparison would pass over nothing");
  for (const file of files) {
    const expected = recorded[file];
    if (!expected) problems.push(`${file} is not in the manifest: a new migration adds its hash in the same commit (--write)`);
    else if (sha256(read(file)) !== expected) problems.push(`${file} differs from its recorded hash: an applied migration was edited. The repair is a new migration, never an edit`);
  }
  for (const file of Object.keys(recorded)) if (!files.includes(file)) problems.push(`${file} is in the manifest but not on disk: an applied migration was renamed or deleted`);
  if (typeof manifest.expand_only_after !== "string") problems.push("the manifest has no expand_only_after: run --write once to mark where the expand-only rule starts");
  else {
    for (const file of files.filter((f) => f > /** @type {string} */ (manifest.expand_only_after))) {
      const what = contractions(read(file));
      if (what.length) problems.push(`${file} ${what.join(" and ")}: expand only, or add a line \`-- contract: <reason>\` saying why it must`);
    }
  }
  return problems;
}

/**
 * The ledger's disagreements with the files on disk.
 * @param {string[]} files
 * @param {string[]} applied
 */
export function ledgerProblems(files, applied) {
  const problems = [];
  const behind = files.filter((f) => !applied.includes(f));
  const unknown = applied.filter((f) => !files.includes(f));
  if (behind.length) problems.push(`the local database has not applied ${behind.join(", ")}: run \`wrangler d1 migrations apply <db> --local\``);
  if (unknown.length) problems.push(`the local database applied ${unknown.join(", ")}, which is not on disk: a migration was renamed or deleted after it ran`);
  return problems;
}

/** The d1_migrations ledgers of the local databases under wrangler's state directory, opened read only. */
async function localLedgers(/** @type {string} */ state) {
  const dir = join(state, "v3", "d1", "miniflare-D1DatabaseObject");
  if (!existsSync(dir)) return [];
  const { DatabaseSync } = await import("node:sqlite");
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".sqlite") && n !== "metadata.sqlite")) {
    const db = new DatabaseSync(join(dir, name), { readOnly: true });
    try {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'").get()) continue;
      out.push({ file: name, names: db.prepare("SELECT name FROM d1_migrations ORDER BY name").all().map((row) => String(row.name)) });
    } finally {
      db.close();
    }
  }
  return out;
}

/** --apply: the remote database brought level with the files, or exit 1 before the caller deploys. */
function apply(/** @type {string} */ dir, /** @type {string} */ database, /** @type {string | undefined} */ config) {
  const { spawnSync } = /** @type {typeof import("node:child_process")} */ (process.getBuiltinModule("node:child_process"));
  const extra = config ? ["--config", config] : [];
  // The repository's own wrangler, by absolute path, so the bookmark read outside the checkout runs the same version.
  const bin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  const local = existsSync(bin) ? bin : undefined;
  const wrangler = (/** @type {string[]} */ args, /** @type {string | undefined} */ cwd) => {
    const r = spawnSync(local ?? "npx", local ? args : ["wrangler", ...args], { cwd, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, CI: "true" }, timeout: 300_000 });
    const text = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? `\n${r.error.message}` : ""}`;
    process.stdout.write(text);
    return { code: r.status ?? 1, text };
  };
  const stop = (/** @type {string} */ message) => {
    console.log(`::error title=devkit-migrations::${message}`);
    process.exit(1);
  };
  const handCommand = `npx wrangler d1 migrations apply ${database} --remote`;
  const list = () => readPending(wrangler(["d1", "migrations", "list", database, "--remote", ...extra]));

  const before = list();
  if (before.state === "unreadable") stop(`could not tell which migrations ${database} has applied, so nothing was applied or deployed.`);
  if (before.state === "clean") return console.log(`devkit-migrations: ${database} has every migration.`);
  const blocked = before.pending.flatMap((file) => {
    const why = existsSync(join(dir, file)) ? handOnly(readFileSync(join(dir, file), "utf8")) : ["is not in " + dir];
    return why.length ? [`${file} ${why.join(" and ")}`] : [];
  });
  if (blocked.length) stop(`${blocked.join("; ")}. A person applies this one: ${handCommand}, then re-run the deploy. Nothing was applied or deployed.`);

  // Outside the checkout, as worker-deploy's bookmark step: by name through the API, not by a config id.
  const { tmpdir } = /** @type {typeof import("node:os")} */ (process.getBuiltinModule("node:os"));
  const bookmark = readBookmark(wrangler(["d1", "time-travel", "info", database, "--json"], tmpdir()).text);
  if (!bookmark) stop(`could not read the Time Travel bookmark of ${database}, so nothing was applied without an undo point.`);
  const undo = `npx wrangler d1 time-travel restore ${database} --bookmark=${bookmark}`;
  const note = `D1 ${database} before applying ${before.pending.join(", ")}: bookmark ${bookmark}. To undo:\n\n    ${undo}\n`;
  console.log(note);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${note}\n`, { flag: "a" });

  const applied = wrangler(["d1", "migrations", "apply", database, "--remote", ...extra]);
  const after = list();
  if (applied.code !== 0 || after.state !== "clean") stop(`applying ${before.pending.join(", ")} did not leave ${database} level (wrangler exited ${applied.code}, then read ${after.state}). Nothing was deployed. To go back: ${undo}`);
  console.log(`devkit-migrations: applied ${before.pending.join(", ")} to ${database}.`);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      manifest: { type: "string" },
      min: { type: "string", default: "1" },
      state: { type: "string", default: ".wrangler/state" },
      "require-ledger": { type: "boolean" },
      write: { type: "boolean" },
      force: { type: "boolean" },
      apply: { type: "string" },
      config: { type: "string" },
    },
  });
  const [dir] = positionals;
  if (!dir || !existsSync(dir)) {
    console.error(`usage: devkit-migrations <migrations dir> [--write [--force]] [--manifest <file>] [--min <n>] [--state <dir>] [--require-ledger]\n       devkit-migrations <migrations dir> --apply <database> [--config <wrangler config>]${dir ? `\n${dir} does not exist.` : ""}`);
    process.exit(2);
  }
  if (values.apply) return apply(dir, values.apply, values.config);
  const manifestPath = values.manifest ?? join(dir, "manifest.json");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const read = (/** @type {string} */ file) => readFileSync(join(dir, file), "utf8");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;

  if (values.write) {
    const previous = manifest?.sha256 ?? {};
    const sha = Object.fromEntries(files.map((f) => [f, sha256(read(f))]));
    const changed = files.filter((f) => previous[f] && previous[f] !== sha[f]);
    if (changed.length && !values.force) {
      console.log(`::error title=devkit-migrations::Refused: ${changed.join(", ")} would change hash, so an applied migration was edited. If the edit is right, run again with --force and say why in the commit.`);
      process.exit(1);
    }
    const expand_only_after = manifest?.expand_only_after ?? files.at(-1) ?? "";
    writeFileSync(manifestPath, `${JSON.stringify({ note: manifest?.note ?? NOTE, expand_only_after, sha256: sha }, null, 2)}\n`);
    console.log(`devkit-migrations: recorded ${files.length} hashes in ${manifestPath}${values.force ? " (--force)" : ""}; expand only after ${expand_only_after || "the start"}.`);
    return;
  }

  const problems = check({ files, read, manifest, min: Number(values.min) });
  const ledgers = await localLedgers(values.state);
  if (ledgers.length > 1) problems.push(`${ledgers.length} local databases carry a migration ledger (${ledgers.map((l) => l.file).join(", ")}); remove the stale one under ${values.state}`);
  else if (ledgers.length === 1) problems.push(...ledgerProblems(files, ledgers[0].names));
  else if (values["require-ledger"]) problems.push(`no local database under ${values.state} carries a migration ledger; apply the migrations locally first`);
  console.log(`devkit-migrations: ${files.length} migrations in ${dir}, ${Object.keys(manifest?.sha256 ?? {}).length} recorded, local ledger ${ledgers.length === 1 ? "compared" : "not found"}.`);
  for (const problem of problems) console.log(`::error title=devkit-migrations::${problem}`);
  if (problems.length) process.exit(1);
}

// Run through node_modules/.bin, argv[1] is the link and import.meta.url the file it points to.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
