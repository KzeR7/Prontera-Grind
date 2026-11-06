# Checking what a save is actually stamped with

When a player reports "I relogged and I am back at Lv 1", the first question is what the server holds
for that account. This is the query that answers it, and how to read the answer.

Run it in **Workers & Pages → D1 → `pg` → Console** (or `npx wrangler d1 execute pg --remote`),
replacing the name:

```sql
-- What the server holds for one account, who the save says it belongs to, and whether that is wrong.
SELECT u.id,
       u.username,
       json_extract(s.blob, '$.owner')     AS save_owner,      -- the name written into the save
       json_extract(s.blob, '$.accountId') AS save_account_id, -- v280+: the durable users.id
       json_extract(s.blob, '$.lv')        AS lv,
       s.version,
       datetime(s.updated_at / 1000, 'unixepoch') AS last_written,
       CASE
         WHEN s.user_id IS NULL                                   THEN 'no save on the server'
         WHEN json_extract(s.blob, '$.accountId') = u.id          THEN 'OK - the id matches'
         WHEN json_extract(s.blob, '$.accountId') IS NOT NULL     THEN 'WRONG ACCOUNT - a different id'
         WHEN lower(json_extract(s.blob, '$.owner')) = lower(u.username) THEN 'OK - the name matches'
         ELSE 'NAMES ANOTHER ACCOUNT - a rename, or somebody else''s save'
       END AS verdict
FROM users u
LEFT JOIN saves s ON s.user_id = u.id
WHERE u.username = 'cloud8909';
```

The `verdict` column is the point of the query: it compares the save's identity with the account that
holds it, so the answer does not depend on the reader spotting a mismatch.

## Reading it

| `verdict` | `lv` / `version` | What it means |
|---|---|---|
| `OK - the id matches` | their real level | **Nothing is wrong with the save.** Whatever they saw was the client losing or refusing its own copy, not a lost save. |
| `OK - the name matches` | their real level | Same: a healthy save from before v280. It gains the id on its next write. |
| `OK - ...` | **1 or 2, with a high `version`** | The Lv 1 save was **written** — it reached the server and won. The old level is in `save_history`; list it before restoring. |
| `NAMES ANOTHER ACCOUNT` | any | A real identity mismatch — either a rename (the case v280 addresses) or somebody else's save in that row. **This is the only verdict where v280 is the fix.** |
| `WRONG ACCOUNT` | any | The blob carries a *different* account's id. The server refuses it on read and write; do not overwrite, investigate first. |
| `no save on the server` | — | The account never synced. The progress never left that browser, so there is nothing to restore. |

`save_account_id` being `NULL` is normal for any save written before v280 — a name-only stamp is judged
by the name.

The `LEFT JOIN` matters: an account with no save still shows up, with `lv` and `save_owner` empty.

## If the level needs recovering

`save_history` keeps the last few blobs per account (`0001_init.sql`), and the GM console can restore
one. List them first — never restore blind:

```sql
SELECT version, json_extract(blob, '$.lv') AS lv,
       datetime(saved_at / 1000, 'unixepoch') AS saved
FROM save_history
WHERE user_id = (SELECT id FROM users WHERE username = 'cloud8909')
ORDER BY version DESC;
```

Any write is destructive, so `docs/LAUNCH-SECURITY.md` §2 applies: run the `SELECT` first, and guard
the `UPDATE` with both the id and the value you expect to replace.

## A note on the v280 fix

v280 makes the save's identity the account id instead of its name. It fixes an account whose **name
changed** while its save was stamped with the old one. If a player was never renamed and still came
back at Lv 1, v280 is correct but is *not* their cause — check this query before assuming it is.

## "It rolled back to N+ after I forged three times" (v326)

This is the case the query above reports as **healthy**, and it was still a real loss. Knowing which
row to look at matters, so here is the whole mechanism.

* The client pushes at most one save per **minute** (`CLOUD_DEBOUNCE = 60000`). A forge, an ascend, a
  purchase — all of it sits in the tab for up to a minute before it reaches D1.
* Signing in compared the tab's copy with the server's copy using a *whole-blob* comparison that
  ignored `owner`, but nothing else. A save re-taken by the game's own bookkeeping (a `gmStats`
  snapshot, a re-stamped `cloud` bookmark) no longer matched byte-for-byte, so a copy that was only
  **seconds newer than the server** was judged "different" and thrown away in favour of the older
  account copy. Forge → reload → the pre-forge weapon. Forge again → the same thing. That is the
  "same weapon goes back to N+ three times" report.
* The discarded copy was never deleted: it is stashed in that browser as
  `pg_save3_<name>_local_<ms>` (see `docs/RECOVERY.md`), which is why the item was always still there
  to be found.

**The v326 rule.** Timestamps ride inside the save (`save.offlineAt`, `save.cloud = {v, at}`), so they
survive a reload. On sign-in the tab keeps its own copy **only** when both hold:

1. `save.cloud.v === server.version` — this tab's copy descends from exactly the version the server
   still holds, i.e. nothing else has written since; **and**
2. `offlineAt > save.cloud.at` — the tab has done work after its last accepted upload.

Anything else (a different version, another device, a GM restore) keeps the account copy winning,
exactly as before. The comparison also ignores `gmStats`, so identical progress is not "different".

**Was the Zeny refunded?** No — and it was never charged twice either. The forge deducts the Zeny and
bumps the weapon in the *same* save blob, so whichever blob wins is internally consistent. When an
older blob wins, the Zeny spent after it comes back **together with** everything else from that
window: the weapon, the Zeny and any drops are all rolled back to the same instant. Nothing is
half-applied, and there is no GM "refund" action — only `gift`/`grant`. To give a specific player their
progress back, restore the newest `save_history` blob that still has the forged weapon
(`json_extract(blob, '$.eq')`) rather than hand-editing Zeny.

**Did the forge ever reach the server?** Check `save_history` for the window: if no version in the last
hour has the higher refinement, the tab never uploaded, which is consistent with either the debounce or
a refused connection — the fix above covers the second case, and `navigator.onLine`, a 503 maintenance
pause or the write gate are what to look at for the first.

**Tests.** `tools/tests/cloud_sim.js` (`joinHarness`/`signIn`) pins the rule: a login keeps an ahead
device copy, another device still wins, a quiet copy still loads the account, a legacy save with no
`cloud` stamp adopts as before, `sameSave` ignores a re-taken `gmStats`, and a leaving upload is
`keepalive`d.

## The 428 in the browser console is not an error

`PUT /api/save` answering **428 Precondition Required** means the server wants the client to collect a
**server-timed away claim** first: it has measured a gap of three minutes or more since the last sync and
will not let the save land until those away minutes are acknowledged. The client applies the claim
(`applyOfflineProgress`), sets `offlineClaimId`, and pushes again — one extra round trip, visible in the
console as a red line and a retried PUT. Two in a row can happen after a long break (one claim per away
window, and a page load before the retry). It is not a lost save.

What matters is the response after it: `{"version":2830,"bytes":140637,"offlineClaimId":null,…}` is an
**accepted** write. If the same claim id keeps coming back, nothing is being written — v326 stops
retrying that claim and says so in the chat log instead of looping silently.

A wall of them in one console is usually just history: the server mints a claim after any absence of
three minutes or more, so a session that has been open (and reloaded) for hours collects one per
return. They are red because browsers paint every 4xx red, not because anything failed.

**Why a tab you are watching can produce them (fixed in v327).** The client backs off to a slower save
cadence while the tab is hidden — and that cadence used to be five minutes, *above* the three-minute
away threshold. AFK fishing with the game behind DevTools or another window therefore measured every
background save as a return from absence: claim, 428, retry, for as long as the tab stayed in the
background. The hidden cadence is 2.5 minutes now. The rule that keeps it fixed: **no background sync
interval may reach the away threshold**, and `cloud_sim` reads `OFFLINE_MIN_MS` straight out of
`functions/api/save.js` to check it.

**The one case where a 428 did cost a save (fixed in v327).** At login the client pushes a device copy
that is ahead of the account. If that push was answered with 428, the code treated the refusal as "a
real conflict after all" and fell through to `cloudAdopt` — which loaded the older account copy on top
of the play it had just failed to upload. The claim handshake retried a moment later, but by then the
live save was the old one. So a login that hit the claim window threw the forge away even with v326's
newer-copy rule. `cloudJoin` now returns on every answer except `ok`/`adopted`: a 428 is a handshake,
not a conflict, and an `offline` push never adopts an older copy either.

## "I keep several accounts and log in and out" (v326)

Switching accounts in one browser is a normal way to play, and it was the worst case for the old
logout: `logout()` saved the device copy, fired the upload **without waiting for it**, deleted the
session beside it, and reloaded. The navigation cancelled the PUT, or the PUT reached the server after
the session row was gone and came back 401 — so the account copy on the server stayed a minute behind
**every time**, and the next login (or any other device) downloaded that older copy.

It now waits: `save()` → flush on the leaving path (`keepalive`, capped at 2.5 s) → **then** the
`DELETE /api/sessions`, capped at 1.5 s → reload. Both waits are capped so a dead server cannot trap
the player on a page they asked to leave.

Two related facts worth knowing when someone reports this:

* A save **larger than 60 KB** cannot use `keepalive` (the browser caps it), so on a plain refresh or a
  closed tab the upload is still cancellable. That is fine now, because `save()` writes the device copy
  synchronously and the v326 login rule keeps a device copy that descends from the account's own
  version — the progress waits for the next login instead of being deleted.
* Every account has its own slot (`pg_save3_<name>`) and every copy carries `accountId`, so one
  account's login can never read, overwrite or stash another's. `tools/tests/cloud_sim.js` drives the
  whole round trip (A forges → logs out → B logs in and saves → A logs back in) against a fake server
  with a real version counter.
