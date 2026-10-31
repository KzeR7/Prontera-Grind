# Preflight gameplay reset — keep the logins

Owner decision, 2026-10-31: clear the testing game data, but keep account logins.
This is a guarded, owner-run operation, **not** something a deployment does automatically.
The implementation is `tools/recovery/prelaunch_reset.mjs`; its synthetic regression is
`tools/tests/launch_reset_sim.js`.

**“Keep the login” means keep the username, password, recovery code, email, GM/owner
role and ban status. It does not keep an active session:** everyone must sign in again.
The tool never prints or changes password/recovery hashes.

## What stays, what goes

| Preserved | Reset or cleared |
| --- | --- |
| The complete `users` row: identity, credentials, email, role, ban and login counters | Every character becomes a fresh owned Lv 1 Novice; old inventory, skills, pets, currencies, records and appearance are gone |
| Authentication `rate_limits` | All old sessions; old save history (one fresh-save history entry remains) |
| `shop_orders`, `entitlements`, `shop_webhooks` and shop audit events | GM gifts/gift batches, announcements/mail/read receipts, non-shop audit events |
| Database schema, migration ledger and ID sequences | Kills and Echo rankings, old reward/settlement records, competition periods/placements/prizes/baselines |
| Cloudflare secrets and the separate write-gate state | Offline claims, damage samples/alerts; Echo launch boundary returns to `starts_at=0` |

**Purchases:** cosmetic ownership and purchase/webhook records stay. Supplies already
delivered into a character are gameplay inventory and reset with the character; the
purchase record remains. This tool is not a refund or purchase-revocation tool. If the
launch policy needs purchased supplies restored, decide and implement that separately
before opening writes. GM-granted cosmetic ownership is also retained by this version.
**Unclaimed paid supplies are a stop condition:** the reset refuses to run while any
Cash Shop grant is still waiting in `grants` (`claimed_at IS NULL`). Have the buyer sign
in and claim it, or resolve the delivery explicitly, before the maintenance window.

The fresh server save is deliberately small and owner-stamped. The game's existing
`load()` merges it with the current `fresh()` defaults, so starter equipment/skills do
not need a second balance definition in the reset tool. Each existing save version is
incremented. Together with session revocation, that makes an old tab adopt the fresh
cloud save instead of uploading its old testing progress.

This does **not** erase private database backups, old browser-local backup keys, or
external Stripe records. Those are recovery records, not public launch progress.
The plaza/chat/poker Durable Object is separate, in-memory room state: this D1 tool does
not reset it. If those transient rooms must also start empty, restart/redeploy the
already-approved social Worker during the same maintenance window. No character save
is stored there.

## GM accounts on the leaderboards

The public API excludes `users.gm > 0` **before** the Top-50/Top-100 limit on:

- Kills: daily, weekly and all-time;
- Endless Echo: daily, weekly and all-time.

New Echo prize settlement uses the same exclusion, so a hidden GM cannot occupy a
player prize place. The GM console can still inspect staff accounts. Already settled
historical prize records are not rewritten by the leaderboard filter; the preflight
reset clears those records. The in-game board explains the exclusion.

## 1. Rehearse locally first

Node 22.5+ is required. From the repository root:

```powershell
node tools/tests/launch_reset_sim.js
```

This uses synthetic SQLite data, the real login/save handlers, the real game loader and
mock remote/gate adapters. It performs no hosted operation. It checks preserved login
and shop rows, fresh-save loading, stale-session/version rejection, atomic rollback,
unknown-schema refusal, backup mismatch, gate changes and no automatic reopen.

For an existing **local-only** persistent preview database, stop its dev server first:

```powershell
node tools/recovery/prelaunch_reset.mjs --local tools/.devdb/preview.sqlite
# The command above is a dry run on a disposable copy; the original is untouched.
node tools/recovery/prelaunch_reset.mjs --local tools/.devdb/preview.sqlite --apply --confirm "RESET GAMEPLAY KEEP LOGINS"
```

A local apply first writes a verified SQLite backup into `Desktop\HH Save`. Do not use
production credentials or a production backup as a local preview database.

## 2. Before maintenance: check paid deliveries

From the owner's authenticated Windows clone, run this read-only query. It prints a
count, not account or purchase details:

```powershell
npx.cmd wrangler@4.154.0 d1 execute pg --remote --json --command "SELECT COUNT(*) AS pending_shop_grants FROM grants WHERE claimed_at IS NULL AND (created_by='Cash Shop' OR note LIKE 'Cash Shop:%');"
```

Required: `pending_shop_grants` is `0`. If it is not zero, stop and resolve those
deliveries first; do not seal the gate and hope the reset will preserve them. The reset
tool repeats this check fail-closed during planning/rehearsal. Pending `shop_orders`
are preserved and can still be reconciled by the shop; this guard is specifically for
already-fulfilled supply orders whose grant has not yet been claimed into a character.

## 3. Live reset — owner-run, in this order

Prerequisites:

- The full current 0001–0011 D1 schema is already applied. This tool refuses missing,
  incompatible or unknown tables; it never runs migrations or guesses a future table's
  reset policy.
- Use the owner's Windows clone and existing authenticated Wrangler setup. The remote
  adapter pins both the `pg` name and its existing UUID; a command-line target override
  is not accepted.
- Keep the gate token in your private shell environment as `PG_GATE_TOKEN`, using your
  existing secret-handling setup. Never put it in chat, Git, a command argument or a file.
- Pick a maintenance window. Export/import can briefly affect database availability.

```powershell
cd $HOME\Desktop\Prontera-Grind
node tools/recovery/write_gate.mjs status
node tools/recovery/write_gate.mjs close "CLOSE WRITES" --reason "preflight gameplay reset" --wait
node tools/recovery/write_gate.mjs seal  "SEAL WRITES"
node tools/recovery/write_gate.mjs status
# Required: state closed, writes open no, safe to restore YES.

# Read-only transport/shape check. This does NOT export, import, reset or reopen.
node tools/recovery/prelaunch_reset.mjs --remote --check
# Required: PASS: read-only remote reset checks. If this stops, keep writes sealed.

node tools/recovery/prelaunch_reset.mjs --remote --apply --confirm "RESET GAMEPLAY KEEP LOGINS"
```

The read-only check verifies the fixed database identity, sealed gate, and the exact
account/gameplay verification queries without printing rows. On Windows it sends those
fixed queries as single-line commands because `npx` uses a shell there; multiline SQL
arguments can be broken before Wrangler receives them.

The reset command itself performs these steps, in order:

1. Verify the fixed database identity and confirm the gate is sealed.
2. Export a private SQL backup to `Desktop\HH Save`, restore it in memory and verify
   integrity, foreign keys and the complete reset schema.
3. Compare the live account/save-version fingerprint with that backup and refuse any
   unclaimed Cash Shop grant.
4. Rehearse the exact reset on the backup and verify its postconditions.
5. Recheck the same sealed gate epoch, then use pinned Wrangler 4.154.0's **atomic D1
   file-import** path once. It does not send independent delete commands or auto-retry.
6. Verify live account identities, incremented fresh-save versions and empty gameplay
   tables. Confirm the gate is still sealed. Print `PASS` with no credentials/save data.

The backup is private and contains real account data. Keep it out of chat, Git and
staging. The tool leaves writes **closed**, even on success.

If you also need empty transient plaza rooms, perform the separately approved social
Worker restart/redeploy now, while writes remain closed. Do not deploy an unreviewed
Worker revision merely to clear a room.

## 4. Verify, then explicitly reopen

Only after the reset reports `PASS` and any separate social-room step is complete:

```powershell
node tools/recovery/write_gate.mjs status
node tools/recovery/write_gate.mjs open "OPEN WRITES"
```

On every previously open device, reload the page and sign in again with the old login.
Check a normal account and the owner account:

1. Lv 1 Novice, fresh starter kit, empty testing inventory and reset records/currencies.
2. Save, reload and sign in again; the fresh progress persists.
3. Existing cosmetic ownership and purchase history remain available.
4. Kills and Echo boards start empty; after new player scores sync, GM/owner names are
   absent and player ranks are contiguous.
5. The next request rearms the Echo boundary at the next Singapore midnight; weekly
   prizes begin with the next full Monday-to-Monday period after that boundary.

## Stop conditions

On any error, uncertain import, schema mismatch, changed gate epoch or failed postcheck:
**keep writes closed and do not blindly retry or reopen.** The error now states whether
the atomic import was `not started`, `started; outcome unknown`, or `returned;
post-import verification incomplete`. Only `not started` means the reset definitely did
not reach D1 import. Inspect the gate audit and the private backup, then follow
[Recovery](RECOVERY.md). A restore is a separate operation; this tool never restores a
backup or opens the gate automatically.

Local tests do not prove hosted D1 availability, actual maintenance duration or the
owner's Cloudflare authentication. No live reset is claimed until the owner runs the
remote command and records its verified result.
