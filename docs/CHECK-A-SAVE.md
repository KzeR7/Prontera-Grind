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
-- The ladder: progress should rise down the list. A step DOWN is the moment a copy that was behind
-- won, and the version either side of it says which client wrote it.
SELECT version,
       json_extract(blob, '$.lv')              AS lv,
       json_extract(blob, '$.zeny')            AS zeny,
       json_extract(blob, '$.ascension.level') AS ascension,
       json_extract(blob, '$.fishing.coins')   AS fishcoins,
       json_extract(blob, '$.cloud.v')         AS client_says_account_was,
       datetime(saved_at / 1000, 'unixepoch')  AS saved
FROM save_history
WHERE user_id = (SELECT id FROM users WHERE lower(username) = lower('cloud8909'))
ORDER BY version DESC;
```

Any write is destructive, so `docs/LAUNCH-SECURITY.md` §2 applies: run the `SELECT` first, and guard
the `UPDATE` with both the id and the value you expect to replace.

## "It still isn't saved" with a clean console (v327)

A report of lost progress with **no red `/api/save` line at all** points the other way: a 4xx would
have been printed by the browser, so nothing was refused. Either the pushes are landing and the
*load* is what loses them, or the pushes were never sent (`CLOUD.on` false, sync paused, the tab
believing it is signed in as someone else). Those two look identical to the player and are opposite
fixes, so measure before touching code.

The player pastes this into the console **on the game page** (it needs `currentUser`, `CLOUD` and
`saveKey`, which only exist there). It fetches the account's copy once and prints every field where
the two disagree:

```js
(async () => {
  const L = JSON.parse(localStorage.getItem('pg_save3_' + currentUser) || 'null') || {};
  const d = await (await fetch('/api/save', { credentials: 'same-origin', cache: 'no-store' })).json();
  const Sv = JSON.parse(d.blob || 'null') || {};
  const isO = v => v && typeof v === 'object';
  const diffs = [];
  (function walk(a, b, p) {
    if (isO(a) && isO(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p + '.' + k);
      return;
    }
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) diffs.push(p.slice(1) + '  browser=' + String(sa).slice(0, 80) + '  account=' + String(sb).slice(0, 80));
  })(L, Sv, '');
  console.log('account:', currentUser, '| bytes browser/account:', JSON.stringify(L).length, JSON.stringify(Sv).length);
  console.log('account version:', d.version, '| written:', new Date(d.savedAt).toLocaleString());
  console.log('sync:', { on: CLOUD.on, ver: CLOUD.ver, dirty: CLOUD.dirty, pushing: CLOUD.pushing, lost: CLOUD.lost, paused: CLOUD.paused, lastPushSecsAgo: Math.round((Date.now() - CLOUD.lastPush) / 1000) });
  console.log('browser stamp cloud.v:', (L.cloud || {}).v, '| browser offlineAt:', new Date(L.offlineAt || 0).toLocaleString());
  console.log('DIFFS (' + diffs.length + ')');
  diffs.slice(0, 40).forEach(x => console.log('  ' + x));
})()
```

| What the output shows | What it means |
|---|---|
| `sync.on: false` or `paused: true`, `lastPushSecsAgo` huge | **Nothing was ever uploaded.** The player's progress is only in that browser; the account copy is not the bug. Look at why sync is off: the badge says `☁ ⛔` for a session/owner mismatch, `☁ ⇅` stuck means a push that never returns. |
| `browser=…` newer than `account=…` on the lost fields, `version` not advancing between two runs a minute apart | The pushes are **not landing** — compare `CLOUD.ver` with `account version`: if they stay equal while the device keeps playing, the flush is being skipped (the debounce) or refused silently. |
| `account=…` newer than the browser on the lost fields | The account **has** the progress and the client did not load it: a load/adopt problem, not a save problem. Check `cloud.v` against the account's `version`; a stale stamp means the login took the "account wins" road. |
| the lost field is absent from both (`account=undefined`) | It never entered the save object at all — a serialisation gap in the module that owns it, not cloud sync. |
| `DIFFS (0)` | The two copies agree, so the progress was never lost: it is a display or a rule problem (a forge that charged but did not apply, a stat capped in the UI). |

One warning: that `fetch('/api/save')` is a real save exchange, so it counts as a return. If the tab
had genuinely been away for three minutes it mints an away claim, and the next push acknowledges it —
one red 428, once. It writes no save row (see the WRITE ECONOMY note in `functions/api/save.js`).

The authoritative version of the same question is the D1 query at the top of this page; the console
version just needs no dashboard access and no waiting.

## "The whole character came back older, after I logged back in"

That shape is not the 428 story. A refused save loses at most one sync window; a *character* that is
older is the account's own copy being old (or empty) and the login faithfully loading it. Two things
answer it, in this order.

**First: this browser is already holding every copy it has ever stashed.** `cloudAdopt` never deletes
the copy it replaces — it writes it to `pg_save3_<name>_local_<ms>`. So before logging in again:

```js
// Every save this browser holds. Reads only - nothing is written.
console.table(Object.keys(localStorage)
  .filter(k => k.startsWith('pg_save3_'))
  .map(k => {
    let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) {}
    return { key: k, lv: s.lv, zeny: s.zeny,
             ascension: (s.ascension || {}).level,
             fishcoins: (s.fishing || {}).coins,
             account_version: (s.cloud || {}).v,
             last_written: s.offlineAt ? new Date(s.offlineAt).toLocaleString() : '',
             bytes: (localStorage.getItem(k) || '').length };
  }))
```

If a `_local_` row is the character the player remembers and the live `pg_save3_<name>` row is not,
it can be put back:

```js
// Put a stashed copy back as this browser's copy, stamped so the login keeps it.
async function restoreFrom(key) {
  if (!/^pg_save3_.+_local_\d+$/.test(key)) throw new Error('Pass a backup key (pg_save3_<name>_local_<ms>), not the live slot.');
  const main = 'pg_save3_' + currentUser;
  const copy = JSON.parse(localStorage.getItem(key) || 'null');
  if (!copy) throw new Error('No such copy: ' + key);
  const d = await (await fetch('/api/save', { credentials: 'same-origin', cache: 'no-store' })).json();
  const live = JSON.parse(d.blob || 'null') || {};
  console.log('restoring lv', copy.lv, 'zeny', copy.zeny, '| the account now has lv', live.lv, 'zeny', live.zeny, 'version', d.version);
  if (!confirm('Replace this account\'s copy with lv ' + copy.lv + ' / zeny ' + copy.zeny + '? The copy being replaced stays on this device and in the save history.')) return 'cancelled';
  localStorage.setItem(main + '_before_restore_' + Date.now(), localStorage.getItem(main) || '');
  copy.owner = currentUser;
  // The stamp is what makes the next login upload this copy instead of adopting over it: same version
  // as the account, written after it (see localAheadOfServer in index.html). cloud.at must be OLDER
  // than offlineAt, which is the whole test.
  copy.cloud = { v: Number(d.version) || 0, at: Date.now() - 60000 };
  copy.offlineAt = Date.now();
  localStorage.setItem(main, JSON.stringify(copy));
  return 'written - reload and log in; the login will upload it.';
}
```

The copy being replaced is kept twice (a `_before_restore_` key here, and the account's own history
server-side), so this is reversible both ways. It **overwrites the account** on the next login, so
only do it when the browser's copy really is the better one — the dry run prints both levels and both
Zeny totals first, and nothing is written until the confirm.

**Second: the account's own version ladder** — the `save_history` query above. The row where `lv` /
`zeny` step *down* is the moment a copy that was behind won, and `client_says_account_was` on the row
above it names the client (its own `cloud.v`) that wrote over the good copy. That version is also what
`POST /api/gm/player {action:'restore', version}` takes, so the good blob can be put back from the
server side without touching the browser at all — which is the right tool when the device's copies are
all older than the history.

## "An hour of play never reached the account" (v328)

The shape: hours of progress, a console with nothing in it, and a login that loads an older copy. A save
that is *refused* prints in red; a save that is *never sent* prints nothing at all, and until v328 the
second one had a one-way door in front of it: every request was fetched with no deadline, `cloudPush`
keeps `CLOUD.pushing` true until its request settles, and `cloudPush` returns `idle` while that flag is
set. One socket the network dropped and the whole session stopped uploading — silently, for ever, with
the in-game badge frozen on "☁ ⇅ Syncing…".

Three things now make that state impossible to hide:

* **Every request has a deadline** (`CLOUD_TIMEOUT_MS`, 20 s, via an `AbortController`). The abort takes
  the ordinary offline path: the save stays dirty and the next flush sends it.
* **A watchdog on the poll tick** drops a push that outlived its own deadline and re-queues its save, so
  the flag cannot outlive the request even where `AbortController` is missing.
* **A quiet save says so.** If the save is dirty and has not reached the account for `CLOUD_STALL_MS`
  (5 min) while the session is live, the badge reads "Not saved for N min" and the log explains that the
  progress is in this browser but the account still holds the older copy.

So the first question for a report like this is now answerable from the page itself: **what did the
badge say?** `☁ ⇅ Syncing…` frozen meant a dead request (v328 fixes it); `☁ … Not saved for 12 min` means
the flush is being refused or skipped, and the log line above it says why; `☁ ✓` with an older
character on screen means the loss happened before, not now — go to the ladder.

On the server side the same event looks like a *gap*: `save_history` samples every tenth version
(`HISTORY_EVERY`) and keeps five, so a run of zero writes leaves no row at all, and the ladder simply
stops advancing at the last version that really landed. That is a fingerprint worth recognising: a
healthy account's ladder moves every 10–25 minutes.

## "The badge had a tick and I still lost the last hour" (v330)

`☁ ✓` proves the last **accepted** push happened; it does not prove the Zeny on screen was inside it.
Those are different facts, and the gap between them is where the remaining reports live. Since the
decision is made once and never shown, the client now keeps a ledger of it:

```js
pgSyncLog()   // the last 40 decisions, oldest first
```

| `kind` | What it means |
|---|---|
| `push-ok` | A save was accepted. `v` is the version it produced, `zeny`/`kills` are what it carried — **this is what the account now holds**. |
| `push-fail` | A save was not accepted, with the reason. The save stays dirty and retries. |
| `join` | A login compared the two copies: `serverV`/`serverZeny` against `localV`/`localZeny`. Which one was kept follows on the next row. |
| `rebase` | A conflict that was this device's **own last upload** (server one version ahead, this copy at least as far along in Zeny, kills and level). The account's version *number* was taken and this save pushed on top — nothing was rolled back. |
| `adopt` | The account copy replaced this browser's, and it was **not** behind. Normal. |
| `adopt-behind` | The account copy replaced this browser's **and it was behind** — fewer Zeny, no more kills. `wasZeny` → `nowZeny` is the loss, `backup` is the key the newer copy was stashed under. This is the row a report like "it went back to 31m" should contain. |

So a report is answerable in one paste: look for the last `push-ok` before the logout — if its `zeny`
is the number the player saw, the account really had it and something *later* wrote over it; if it is
an older number, that push simply never took the last window. Then look at the `join`/`adopt-behind`
rows for the login.

A rollback that leaves the badge on an old `☁ ✓ HH:MM` is the `409`-then-adopt shape, not a stalled push: the
badge reports the last *accepted* upload, and adopting does not change that time. Since v330 that case is
rebased instead (row `rebase`), and an adopt paints `☁ ↺` rather than a tick, so the badge can no longer
claim a save that did not happen.

The same comparison is spoken in the game's own log: an `adopt-behind` puts both figures and the
backup key in front of the player, so it is visible at the time rather than reconstructed afterwards.

## "The badge had a tick and the account stopped hearing from me" (v332)

There was a state in which the client stopped uploading **and stopped saying anything**, with a tick
still on the badge: `save()` refused a copy on its **name** stamp alone, and that refusal returned
before `cloudTouch()`, so `CLOUD.dirty` stayed false — and `cloudPush()` returns `idle` on the dirty
check before any code that could have noticed. One stale name stamp (a rename, a copy from before
v280) was enough, and it lasted the whole session.

Now:

* **ownership is decided by the id** when the copy carries one, exactly as `saveRefusal()` and the
  server already did. A stale name on our own copy is repaired on the next save; another account's id
  is still refused, writes nothing, and is still explained in the log.
* **a completed save is timestamped**, and `cloudStallNote()` reports two silent minutes without one —
  with the `owner`, `accountId` and account id it was judged against — regardless of `CLOUD.dirty`. A
  guard that depends on the flag the fault clears cannot see the fault.

A report of this shape now has two artefacts instead of none: the log line
(`This device has not written a save for N minutes … save stamped for X, account id N against M`) and a
`save-stalled` row from `pgSyncLog()`.

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
