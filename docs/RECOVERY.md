# D1 recovery: seven-day, no additional backup storage

The owner chose Cloudflare D1 Time Travel rather than adding R2 or depending on a
Windows PC running a schedule. Cloudflare's production D1 backend keeps point-in-time
history automatically. Its published retention is up to 7 days on Workers Free and
30 on Workers Paid; the account's actual plan has not been verified by this tool.
Time Travel is in the same Cloudflare account, not an independent off-site backup,
and is not protection against account compromise or an incident outside retention.
The existing pre-launch private SQL export is older and predates migrations 0008–0011;
it must not be blindly imported into the current database.

## What is implemented

`tools/recovery/select_restore_point.mjs` is a **read-only Windows owner tool**. It
checks the fixed `pg` name and UUID, then asks Cloudflare Time Travel for a
current and six-day-old bookmark, and offers a menu of times (Singapore time, UTC+8)
within the past seven days, plus custom date/time. A selected point asks Cloudflare
for the corresponding bookmark. It does not ask for or print credentials, private
account data or save contents. It contains no restore, database-write or SQL-import
operation. Bookmark availability does not verify the old data, schema or game code.
Run it with the owner's existing authenticated Wrangler/Node setup:

```powershell
node .\tools\recovery\select_restore_point.mjs --check  # read-only readiness
node .\tools\recovery\select_restore_point.mjs          # read-only selection menu
```

It intentionally rejects times at or beyond seven days, even on a paid plan. A
six-day lookup is not proof that a full seven days are retained or that every point
can be restored. If Cloudflare denies a lookup, it stops without making changes.
An export-free selector does not create separate backups, alerts, audit logs or an
independent disaster recovery copy. No R2 storage, paid upgrade or cron was created.

On 2026-10-30, the owner ran the updated menu against live `pg`. The fixed identity
check and current and six-day-old Time Travel bookmark lookups passed, and the owner
cancelled the menu. No restore or backup was performed. This confirms the read-only
lookups, not a tested restore, the account's plan, a full seven-day window or the
compatibility of any historical point.

## Local safety-order rehearsal (not production recovery)

`node tools/tests/recovery_rehearsal_sim.mjs` runs a synthetic-only SQLite
rehearsal: freeze, confirm drain, capture/verify an emergency snapshot, check the
selected point, confirm, restore, verify, then resume. It injects failures and
keeps its **mock** gate closed rather than retrying or resuming. The standalone
`tools/recovery/rehearsal_protocol.mjs` has no Cloudflare driver or production
integration. Synthetic snapshots are not Wrangler exports or D1 Time Travel.

This is only an ordering/failure test. The fake gate cannot pause the real game,
prove a distributed drain, deal with stale preview deployments, or protect against
external D1 writers. It is not a restore button. A real independent write gate and
its Cloudflare quota/availability, in-flight request handling, authentication,
release compatibility and isolated hosted rehearsal are still required.

## Prepared disposable hosted Time Travel drill — not run

`tools/recovery/hosted_disposable_rehearsal.mjs` is an owner-run Windows drill,
not a production restore tool. It creates a randomly named temporary D1, verifies
its name and ID, inserts only a synthetic number, captures a bookmark, changes the
number, uses Time Travel to restore the earlier number, then deletes that temporary
D1 and checks that it is absent. It rejects the known production and staging IDs.
The random database name is printed for inspection if creation, restore or cleanup
fails; do not blindly retry or delete another database. The drill may use Cloudflare
quota, requires a spare database slot, and has not been run or verified on hosted
Cloudflare. Its fixed protocol and failure stops have only mock tests. It does not
read a real account, backup or save, pause the real game, or prove production restore
safety. Do not run it until reviewed and the owner understands its temporary cloud
resource creation/deletion.

## A production restore is NOT automated or rehearsed

A D1 Time Travel restore **overwrites the entire live database in place**, cancels
in-flight transactions and can lose *all* saves, accounts, rewards and other writes
newer than the selected point. Time Travel does not restore the Pages deployment or
the social Durable Object. A selected historical schema may be incompatible with
current code, notably a point before the launch migrations. Restore can resurrect
revoked sessions and old credentials. The client may retry or upload unsynced saves.
Cloudflare returns a previous bookmark for undo, but undo also overwrites later writes;
do not treat it as risk-free. Never assume a bookmark previews actual data.

Before a real incident response, an independently enforced maintenance mode that
actually stops all writes (including existing sessions, retries and background
processes) needs to be designed and verified. There is currently no verified switch
here. Then take and validate a fresh private emergency export, record the current
bookmark, identify the compatible application release, practice the exact workflow
on a separate disposable hosted D1, and obtain explicit owner approval before any
live restore. Do not restore the separate staging database either without permission:
it contains the owner's test data. A failed or timed-out restore has an uncertain
outcome; inspect it rather than retrying. Validate schema, authentication, saves,
rankings, payout ledger and service health before admitting users, and account for
pending clients/retries. A single-player repair is a distinct, unimplemented procedure.

The backup verifier at `tools/staging/live_backup_preflight.mjs` can export and
validate a fresh private SQL backup when explicitly run by the owner, but it may
briefly interrupt requests and is not a maintenance lock. Any SQL export contains
private account and save data; keep it private and never upload it to chat or Git.
Restore of a SQL export requires a separate, rehearsed method; importing it into a
nonempty production database is not a supported rollback procedure.

## Tests and references

`node tools/tests/recovery_point_sim.mjs` tests selector boundaries, Singapore time,
fixed identity and failure stops using synthetic fixtures only. `node
tools/audits/local_d1_restore.mjs` rehearses synthetic export/import into a separate
local D1. Neither tests Cloudflare Time Travel, a production restore, or real maintenance.

Cloudflare: [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
