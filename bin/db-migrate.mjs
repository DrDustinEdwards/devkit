#!/usr/bin/env node
// A guarded wrapper around `wrangler d1 migrations apply`, for a site whose only D1 database is production. A bare
// `wrangler d1 migrations apply <db> --remote` reads like staging and writes live data, so this refuses the remote database
// unless the caller says so with `--remote-confirm`; a plain `--remote` exits 2. It changes nothing about what a migration
// does. CI applies migrations with `devkit-migrations --apply`, which applies only those that add.
//
//   npx devkit-db-migrate <database>                    local D1 (the safe default)
//   npx devkit-db-migrate <database> --remote-confirm   remote, that is production
//
// Other arguments go to wrangler. `--no-install` pins wrangler to the repository's devDependency, so npx never fetches an
// unpinned one that applies migrations to production.

import { spawnSync } from "node:child_process";
import { isMain } from "../node/index.mjs";

/**
 * The npx arguments, or an error message.
 * @param {string[]} args
 * @returns {{ error: string } | { wranglerArgs: string[], remote: boolean, database: string }}
 */
export function plan(args) {
  const [database, ...rest] = args;
  if (!database || database.startsWith("-"))
    return { error: "usage: devkit-db-migrate <database> [--remote-confirm] [wrangler args]" };
  if (rest.includes("--remote"))
    return {
      error: `Refusing to run: pass --remote-confirm, not --remote. The database "${database}" is production; the explicit flag exists so that is acknowledged rather than assumed.`,
    };
  const remote = rest.includes("--remote-confirm");
  const passthrough = rest.filter((a) => a !== "--remote-confirm" && a !== "--local");
  return {
    database,
    remote,
    wranglerArgs: [
      "--no-install",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      database,
      remote ? "--remote" : "--local",
      ...passthrough,
    ],
  };
}

function main() {
  const p = plan(process.argv.slice(2));
  if ("error" in p) {
    console.error(p.error);
    process.exit(2);
  }
  console.log(
    p.remote
      ? `Applying migrations to REMOTE "${p.database}" (production), authorized by --remote-confirm.`
      : `Applying migrations to the LOCAL "${p.database}" only. To apply to production, re-run with --remote-confirm.`,
  );
  const r = spawnSync("npx", p.wranglerArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.error) {
    console.error(`Failed to run wrangler: ${r.error.message}`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}

if (isMain(import.meta.url)) main();
