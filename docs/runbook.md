# Runbook: running and recovery

The one runbook for every Worker site in the family. A site links here rather than keeping its own; what is true of one site alone (its database name, its buckets, its backup time) is in the table under "Each site" below, and a site's own `RECOVERY.md` or `docs/RUNBOOK.md` may add steps only that site needs.

Every command runs from the site's repository root with a token that can do it (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in the environment), and `npx wrangler` resolves to the site's pinned wrangler. Never paste a token into an incident record or a log.

## Which incident is it?

| What you see | Incident | Go to |
| --- | --- | --- |
| The home page or `/health` does not answer, or answers 5xx, and no deploy went out in the last hour | Site down | [Site down](#site-down) |
| `/health` names the `d1` check `fail`, or pages log `D1_ERROR` | Database down | [Database down](#database-down) |
| It broke right after a merge to the default branch | Bad deploy | [Bad deploy](#bad-deploy) |
| `/health` warns `backup` or `files` past 26 hours, or the weekly restore drill failed | Stale backup | [Stale backup](#stale-backup) |
| Rows or files are missing or wrong, whatever the cause | Lost data | [Lost data](#lost-data) |

Open an incident record (below) first, with the start time, and keep it as you go.

## Site down

1. Confirm from outside the account: `curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/` and `curl -sS https://<host>/health`. Then check [Cloudflare Status](https://www.cloudflarestatus.com/). A Cloudflare incident is waited out and recorded, not fixed.
2. Read the Worker's errors: `npx wrangler tail <worker> --status error --format pretty`, or Workers Logs in the dashboard. The family's log lines are JSON with `event` first (site-runtime `./log`).
3. If `/health` names one failing check, follow it: `d1` is [Database down](#database-down); an R2, KV or binding check is that service (its own status, then the binding in `wrangler.jsonc`).
4. If it started with a deploy, it is a [Bad deploy](#bad-deploy). `/health` reports the deployed commit as `sha`; compare it with the default branch.
5. Public pages on the edge cache (site-runtime `./edge-cache`) keep being served stale for a week while the Worker fails, so a reader may not see the outage. Signed-in pages and writes do.

## Database down

D1 itself unavailable, as opposed to data that is wrong (that is [Lost data](#lost-data)).

1. `npx wrangler d1 info <db>` answers if the database exists and the API can reach it. `npx wrangler d1 execute <db> --remote --command "SELECT 1"` proves a query runs.
2. If D1 is down platform-wide (Cloudflare Status, "D1"), wait. Stored public pages are served stale; nothing to restore.
3. If only this database refuses, read the error: a `D1_ERROR` naming a missing table or column after a deploy is a migration, so a [Bad deploy](#bad-deploy) and then [Lost data](#lost-data) with the deploy's bookmark. "Database not found" means the database was deleted: Time Travel is gone with it, so restore the newest dump into a new database ([From a dump](#from-a-dump-older-than-30-days-or-the-database-is-gone)).
4. Never run a Time Travel restore to "fix" an outage: it overwrites the database in place and cancels queries in flight.

## Bad deploy

1. If the site deploys through devkit's `worker-deploy.yml`, the live gate rolls back a deploy whose verify refused it, and says so in the run (`rolled back: was ... now ...`). Check that first.
2. Otherwise roll back by hand to the version before: `npx wrangler rollback --name <worker> --message "<incident id>: <why>"`. With no version id it goes to the last deployment that served one version at 100%. To pick one: `npx wrangler deployments list --name <worker>`, then `npx wrangler rollback <version id> --name <worker> --message "..."`.
3. With a gradual rollout under way (`gradual-percent` in worker-deploy.yml), send all traffic back to the old version: `npx wrangler versions deploy <old version id>@100% --yes --message "..."`. The deploy job's summary names both versions.
4. Read `/health` until its `sha` moves: `curl -sS https://<host>/health`.
5. A rollback swaps code and bindings only. It never undoes a D1 migration, and Cloudflare refuses it when the D1 or KV bindings changed between the two versions. If the deploy ran a migration that damaged data, the deploy job's summary (with `d1-database` set) holds the bookmark from before it: go to [Lost data](#lost-data) and restore to that bookmark.
6. Revert or fix the commit on the default branch: the next merge deploys it again otherwise.

## Stale backup

`/health`'s `backup` (the nightly D1 dump) or `files` (the nightly files pass) warns past 26 hours; the weekly `restore-drill.yml` fails on a dump older than 26 hours or one that does not restore.

1. Read the cron record: `/health`'s `cron` check names a job that failed, and the site's `cron_runs` table holds its error (`npx wrangler d1 execute <db> --remote --command "SELECT job, status, error, started_at FROM cron_runs WHERE job LIKE '%backup%' ORDER BY started_at DESC LIMIT 5"`).
2. Find the newest complete dump: run the drill, which names it and restores it (`CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx github:DrDustinEdwards/d1-dump#<tag> drill --bucket <backups bucket>`), or dispatch the site's `restore-drill.yml`. The dashboard's bucket view lists `backups/json/` too.
3. A run with no `_complete.json` failed a check (`BackupIncomplete` names it in the log line): a required table missing, a count that does not match, a credential column. Fix the cause; do not mark it complete by hand.
4. A files pass that has not finished is normal for a large first pass (several nights). One that never finishes is a run that ends on its time budget every night: read `files/<name>/_progress.json`.
5. Once fixed, the next scheduled run clears the warning. A dump by hand: dispatch the site's backup through its admin route or cron test, never `wrangler d1 export`, which fails on FTS5 tables.

## Lost data

Choose the newest copy that holds the data. In order:

### D1 Time Travel (any minute of the last 30 days)

Time Travel restores the whole database in place to a minute, on Workers Paid, within 30 days. It overwrites everything written since, so first decide whether rows written after the damage must be kept (then use [From a dump](#from-a-dump-older-than-30-days-or-the-database-is-gone) into a copy and move only the lost rows back).

```sh
# 1. The undo point: the bookmark for now. Write it in the incident record.
npx wrangler d1 time-travel info <db>

# 2. The bookmark just before the damage (RFC 3339 with an offset, or Unix seconds).
npx wrangler d1 time-travel info <db> --timestamp="2026-10-31T11:58:00+00:00"

# 3. Restore. It prints the previous bookmark, which undoes this restore.
npx wrangler d1 time-travel restore <db> --bookmark=<bookmark from step 2>
#    or: npx wrangler d1 time-travel restore <db> --timestamp=<unix seconds>

# 4. Check: /health, the row counts that matter, a page that reads them.
npx wrangler d1 execute <db> --remote --command "SELECT COUNT(*) FROM <table>"

# Undo, if the restore made it worse:
npx wrangler d1 time-travel restore <db> --bookmark=<bookmark from step 1>
```

A deploy through `worker-deploy.yml` with `d1-database` set wrote the bookmark from before its migrations, and this exact restore command, to its run summary.

### From a dump (older than 30 days, or the database is gone)

The nightly dumps are in the site's backups bucket under `backups/json/<run id>/` (d1-dump README, "Restore"). Retention keeps one a day for 14 days, one a week for 8 weeks and one a month for 6 months.

1. Pick the run: the newest complete one before the damage. The weekly drill's output names the newest.
2. Create an empty database: `npx wrangler d1 create <db>-restored`.
3. Restore into it from a Worker with both bindings, since `restoreDump` needs a D1 binding: bind the new database as `RESTORED` beside `BACKUPS` and call `restoreDump(env.RESTORED, env.BACKUPS, "backups/json/<run id>/")` once (an admin-only route or a one-off scheduled run). It refuses a non-empty database and checks every table's count against the dump's marker.
4. Either move the lost rows back into the live database (`npx wrangler d1 execute <db> --remote --file rows.sql`, rows read from `<db>-restored`), or, when the live database is gone, point the site's `DB` binding at `<db>-restored` and deploy.
5. Delete `<db>-restored` when it is no longer the live one, and only then: `npx wrangler d1 delete <db>-restored`.

### Files from R2

The nightly files pass copies each media and upload bucket into the backups bucket under `files/<name>/<key>`, the newest version of each file, and keeps a file deleted from the source for 30 days. `restoreFiles` (d1-dump README, "Restore files") copies them back, and is a dry run unless told otherwise:

```ts
const plan = await restoreFiles(env.BACKUPS, env.MEDIA, { name: "media", prefix: "img/" }); // what would be restored
await restoreFiles(env.BACKUPS, env.MEDIA, { name: "media", prefix: "img/", apply: true });  // only what is missing
```

A file that exists but differs is left unless `overwrite: true`. For one file by hand:

```sh
npx wrangler r2 object get <backups bucket>/files/<name>/<key> --file ./restore.bin --remote
npx wrangler r2 object put <bucket>/<key> --file ./restore.bin --content-type <type> --remote
```

## Each site

RPO is how much can be lost; RTO is how long recovery takes. For data still in D1, Time Travel's RPO is a minute for 30 days. When the database itself is gone, the RPO is the time since the last complete nightly dump: up to 24 hours, and `/health` warns at 26. Files are only as recent as the last complete files pass: up to 24 hours once a pass has finished, and not covered at all before the first one finishes.

RTO, measured and not:

- **Rollback**: one wrangler command, which Cloudflare applies at once ("A rollback will immediately create a new deployment"); the live gate reads the sha back within 20 reads, 3 seconds apart. About 2 minutes with a person at the keyboard.
- **Time Travel restore**: untimed. Cloudflare states no duration, and no restore has been run against a scratch remote database (one could not be created and deleted without touching the account's live databases from here). The steps above are the documented ones. Allow 15 minutes, including finding the bookmark, until a timed run replaces this figure.
- **Restore from a dump**: the restore itself measured against a local D1 (Miniflare's workerd, the engine `wrangler d1 --local` runs), d1-dump README, "Measured against a local D1": a 35-table, 1,422-row, 8.3 MB dump restored and checked in 19 seconds, and a 20,000-row, 38 MB one with an FTS5 index in 2 minutes 55 seconds. Remote D1 adds a round trip per batch. Allow 1 hour, most of it creating the database and binding it.
- **Files**: one write per file, streamed; the run budget is 1,000 files or 5 minutes per call.

| Site | Worker | D1 database | Backups bucket | Nightly dump (UTC) | Files backed up | D1 RPO | Files RPO | RTO (rollback / Time Travel / dump) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Foxhound | `foxhound` | `foxhound` | `foxhound-backups` | 03:00 | media | 1 min (30 days), else 24 h | 24 h after the first complete pass | 2 min / untimed, allow 15 min / 1 h |
| Foxing | `foxing` | `foxing` | `foxing-backups` | 03:17 | media, covers | 1 min (30 days), else 24 h | 24 h after the first complete pass | 2 min / untimed, allow 15 min / 1 h |
| germomics | `germomics` | `germomics` | `germomics-backups` | 03:17 | audio, images | 1 min (30 days), else 24 h | 24 h after the first complete pass | 2 min / untimed, allow 15 min / 1 h |
| julieedwards.info | `julieedwards` | `julieedwards` | `julieedwards-backups` | 03:37 | media | 1 min (30 days), else 24 h | 24 h | 2 min / untimed, allow 15 min / 1 h |
| TXASM | `txasm` | `txasm` | `txasm-books` (dumps share the books bucket) | 13:00 | uploads | 1 min (30 days), else 24 h | 24 h after the first complete pass | 2 min / untimed, allow 15 min / 1 h |
| Carrel | `carrel-desk` | `carrel` | `carrel-backups` | 03:17 | none (holds no files of its own) | 1 min (30 days), else 24 h | none | 2 min / untimed, allow 15 min / 1 h |
| dustinedwards.info | `dustinedwards` | `dustinedwards` | `dustinedwards-backups` | 05:00 | media (its own mirror) | 1 min (30 days), else 24 h | 24 h | 2 min / untimed, allow 15 min / 1 h |
| Capsid | `capsid-mcp` | `capsid` | its own (`src/backup.ts`) | 09:00 | its own | 1 min (30 days), else 24 h | its own | 2 min / untimed, allow 15 min / 1 h |
| BioScience Writers | `bsw` | none | none | none | none | nothing stored | nothing stored | 2 min / none / none |

The static sites (Capsomer, Prelum, Enarratio) hold no data: their source is the repository, and a redeploy is the recovery.

## Incident record

One record per incident, kept in Capsid under the site's namespace as `incidents/<YYYY-MM-DD>-<short-name>.md`, written while it happens and finished when it ends. Times are UTC.

```markdown
# <site>: <what readers saw>, <YYYY-MM-DD>

- Start: 2026-10-31T11:39Z (first sign: <monitor, report, log line>)
- Detected: 2026-10-31T11:52Z (by <who or what>)
- End: 2026-10-31T12:20Z (how it was confirmed: <health sha, a page, a count>)
- Impact: <who could not do what, for how long; data lost, if any, and how much>
- Cause: <the one change or failure that started it>
- Fix: <what was done, in order, with the commands; the bookmark or version ids used>
- Follow-up: <the change that stops it happening again, with its PR or issue>
```

Start and end are when readers were affected, not when someone noticed or closed the laptop. "Cause" is one sentence; if it is not known yet, write "unknown" and fill it in before closing the record.
