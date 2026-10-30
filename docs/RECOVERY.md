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
rehearsal: close the gate, confirm drain, **seal** it, capture/verify an emergency
snapshot, check the selected point, confirm, restore, verify, then reopen. The pause
steps drive the real state machine from `workers/gate/policy.mjs` (the same code the
Durable Object runs), so the ordering tested is the ordering that will run: the
restore step refuses to start unless the gate is sealed. It injects failures and
keeps the gate closed rather than retrying or resuming. The standalone
`tools/recovery/rehearsal_protocol.mjs` has no Cloudflare driver or production
integration. Synthetic snapshots are not Wrangler exports or D1 Time Travel.

This is only an ordering/failure test. It cannot pause the live game, prove a
distributed drain, deal with stale preview deployments, or protect against writers
outside this project. It is not a restore button.

## Disposable hosted Time Travel drill — owner-run once, on synthetic data only

`tools/recovery/hosted_disposable_rehearsal.mjs` is an owner-run Windows drill,
not a production restore tool. It creates a randomly named temporary D1, verifies
its name and ID, inserts only a synthetic number, captures a bookmark, changes the
number, uses Time Travel to restore the earlier number, then deletes that temporary
D1 and checks that it is absent. It rejects the known production and staging IDs.
The random database name is printed for inspection if creation, restore or cleanup
fails; do not blindly retry or delete another database. The drill uses Cloudflare
quota and needs a spare database slot.

On 2026-10-30 the owner ran it against their own Cloudflare account. The transcript
reported the temporary database's identity verified, the synthetic value restored by
Time Travel, the temporary database deleted and confirmed absent, and the closing
`PASS: hosted synthetic Time Travel restore and cleanup` line. No real game data,
production database or production restore was involved. That confirms hosted Time
Travel can restore a synthetic database in this account and that the drill's cleanup
works; it does **not** confirm the retention window, the compatibility of any
historical point with the current code, a production-sized restore, its duration, or
the write pause. It also does not confirm the drill's failure paths, which only have
mock tests.

## The write pause (prepared and tested; not deployed, not enabled)

A D1 restore overwrites the whole database in place. The pause flag therefore cannot
live in D1: a restore would roll it back to "open" at exactly the moment it must stay
closed. It lives in its own Worker instead.

`workers/gate/` is a separate script, `prontera-gate`, hosting one Durable Object,
`WriteGate`. It has **no D1 binding**, no route and `workers_dev = false`: the only
way in is the `GATE` binding on the Pages project. `workers/gate/policy.mjs` is the
whole state machine and has no Cloudflare, storage or clock of its own, so it is
tested with Node only (`tools/tests/write_gate_sim.mjs`).

| state | every `/api/*` request | meaning |
| --- | --- | --- |
| `open` | admitted, holding a short lease | normal play |
| `closing` | refused (503) | the pause has started and leases are draining |
| `closed` | refused (503) | an operator **sealed** it; the only state reported as safe to restore |

A brand-new object is `closed` with the reason `never-opened`, so forgetting to
configure the switch fails safe: the API answers maintenance instead of silently
accepting writes. Nothing is stored in D1, and the object's state survives database
restores by construction.

**Reads are refused too, on purpose.** "Read" is not read-only in this codebase:
`GET /api/save` moves the away baseline and issues offline claims, and
`GET /api/board` settles prizes. A read-only tier would be a write path. The public
site and the client files keep being served; only `/api/*` stops, plus `/api/gate`
itself, which must stay reachable or nobody could lift the pause.

**Fail closed, and what that costs.** If `WRITE_GATE = "required"` and the binding is
missing, or the object does not answer, every request is refused. The honest trade:
a gate outage is an API outage, and a Durable Object that loses its storage loads as
`closed`. That is deliberate for a safety switch, and it is why the switch is off by
default (`WRITE_GATE` unset = no pause exists, which is how local dev and the test
suites run).

**Draining is a quiet window, not a proof.** Each admitted request takes a 90-second
lease and releases it afterwards, even when the handler throws. `drained` means no
live lease **and** no admission for 90 seconds. That proves nothing was admitted
recently; a lease expires on a timer, so a request that outlives its lease could
still be writing. The window is longer than any handler here can plausibly run, and
sealing is an operator judgement recorded in the audit trail — not a guarantee.

### Enabling it (one deployment, in this order)

> **Exact step-by-step, with a verification gate after each stage and the rollback for
> each:** [ENABLE-WRITE-PAUSE.md](ENABLE-WRITE-PAUSE.md). Read that page rather than the
> summary below if you are doing it for the first time.

```powershell
# 1. the switch, with no database attached
npx wrangler deploy --config workers/gate/wrangler.toml
# 2. its secret (32+ random characters; the object refuses anything shorter)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # openssl may be absent on Windows
npx wrangler secret put GATE_TOKEN --config workers/gate/wrangler.toml
# 3. in the root wrangler.toml, uncomment WRITE_GATE and the GATE binding, then deploy Pages
# 4. open writes once, and check it took
$env:PG_GATE_TOKEN = "<the same secret>"
node tools/recovery/write_gate.mjs open "OPEN WRITES"
node tools/recovery/write_gate.mjs status
```

Step 4 is not optional: the gate ships closed, so a Pages deployment that is wired
but never opened leaves every player on a maintenance screen. Preview deployments
never receive the binding (`[env.preview]` in the root `wrangler.toml`), so a branch
build stays static-only.

### Incident runbook (writes first, restore second)

```powershell
node tools/recovery/write_gate.mjs close "CLOSE WRITES" --reason "restore to 2026-10-30 12:00 SGT" --wait
node tools/recovery/write_gate.mjs seal  "SEAL WRITES"     # refuses until the pause has drained
node tools/recovery/write_gate.mjs audit                   # what happened, and when
#   -> fresh private backup, bookmark, release check, owner approval (above)
node tools/recovery/write_gate.mjs open  "OPEN WRITES"     # only after the post-restore checks pass
```

The token comes from `PG_GATE_TOKEN` only — never an argument — is compared in
constant time inside the object, and is never printed by the tool. The three phrases
are exact strings so a recalled shell command cannot pause or reopen the live site
by accident. Wrong tokens get 404 (the endpoint does not advertise itself) and five
within ten minutes lock the control surface for five. Every transition, its reason
and its epoch are kept in a bounded 60-entry audit ring inside the object.

**What it does not do.** It does not restore anything, back anything up, or choose a
restore point. It does not stop the `prontera-social` Durable Object (chat is not D1
and is not restored). It does not stop a request that was admitted before the pause
finished draining, or a client that is already holding a response. It cannot make
Stripe stop retrying: a webhook that arrives during the pause gets a 503 and is
retried by Stripe later. And it cannot detect writes that come from somewhere other
than this project's `/api/*`.

**Client behaviour.** A paused API answers `{maintenance:true}` with `Retry-After`.
The game treats that as away-time rather than a dropped connection: the simulation
stops, nothing is uploaded, and the gate dialog says maintenance (v263). On
reconnect it adopts the account's save, so play drawn during the pause is never
pushed over restored data; the device copy is stashed as a local backup as usual.
Every open tab must reload after the pause lifts — a tab that synced before the pause
still holds the older copy.

**Still unverified.** The Worker, its binding, the secret, a real pause on the live
project and a real reopen have not been deployed or exercised. The tests are Node
tests against a stub object and a synthetic SQLite database.

## A production restore is NOT automated or rehearsed

A D1 Time Travel restore **overwrites the entire live database in place**, cancels
in-flight transactions and can lose *all* saves, accounts, rewards and other writes
newer than the selected point. Time Travel does not restore the Pages deployment or
the social Durable Object. A selected historical schema may be incompatible with
current code, notably a point before the launch migrations. Restore can resurrect
revoked sessions and old credentials. The client may retry or upload unsynced saves.
Cloudflare returns a previous bookmark for undo, but undo also overwrites later writes;
do not treat it as risk-free. Never assume a bookmark previews actual data.

Before a real incident response the write pause below must be enabled, deployed and
verified — it is prepared and tested, but it has never been deployed or run against
the live project, so there is still no *verified* switch here. With it sealed, take
and validate a fresh private emergency export, record the current bookmark, identify
the compatible application release, practice the exact workflow on a separate
disposable hosted D1, and obtain explicit owner approval before any live restore. Do not restore the separate staging database either without permission:
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

The write pause has five suites: `tools/tests/write_gate_sim.mjs` (state machine and
Durable Object), `write_gate_middleware_sim.js` (every `/api` path refused when the
pause is on; fail-closed when the switch is unknown), `write_gate_api_sim.js` (the
`/api/gate` control endpoint), `write_gate_cli_sim.mjs` (the owner's CLI: fixed
target, secret handling, `action` + phrases, refusals) and
`write_gate_binding_sim.js` (namespace binding resolution, CLI→`/api/gate` wire
contract, and a local `miniflare`/`workerd` cross-script SQLite Durable Object
rehearsal). None contacts a live Cloudflare account.

Cloudflare: [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
