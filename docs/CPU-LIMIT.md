# Why the free plan's CPU limit is hit so fast

2026-11-15. Written in answer to the Cloudflare daily summary *"Your Workers hit the free tier CPU
time limit at least 1,000+ times in the past 24 hours"*.

This document explains what the email means, which of this repository's requests actually exceed the
free plan's budget, and what the options are. **It contains no code change on its own** — the numbers
below are local measurements on the Node/D1 shim (`tools/tests/api_sim.js` style harness, not the
hosted runtime), and they are stated as such.

## What the email means

* The free plan allows **10 ms of CPU per request** (not wall time — time spent waiting on D1 or the
  network does not count). Workers Free cannot raise it. Workers Paid gives 30 s by default,
  configurable up to 5 minutes per request.
* When a Worker goes over, the runtime **kills the isolate mid-execution**. The player sees error
  1102, a broken page, or an API call that never returns. Nothing in our code catches it; the
  handler simply stops. That is why the email says "stops running it mid-task".
* "1,000+ times in 24 hours" is a count of those kills, not of all requests. A single endpoint that
  is killed for every caller produces exactly this shape, and it keeps producing it every day until
  either the code gets cheaper or the plan changes.

**The important consequence for this game:** a killed `PUT /api/save` is not a lost request, it is a
save that never landed. The client retries, so the player usually just sees a stalled sync — but a
request that dies *after* D1 took the write and *before* the response is built leaves the client
holding an older version number, and the next push 409s. So this is not only a performance issue.

## What the CPU budget actually buys

Cloudflare documents the free tier as 10 ms CPU per request. As a rough conversion, native
PBKDF2-SHA256 on this sandbox costs:

| work | measured cost |
| --- | --- |
| PBKDF2-SHA256, 20,000 iterations (our current login work factor) | **6.2 ms** |
| PBKDF2-SHA256, 100,000 iterations | 22.9 ms |
| scrypt N=16384 r=8 p=5 (the reader-only profile in `_lib/scrypt-reader.js`) | 208 ms |

So **one password verification already spends more than half of a free request's entire CPU
budget**, and every registration spends two of them (password + recovery code, in sequence) — which
is ~12 ms of hashing before any D1 call is made. `docs/PASSWORD-KDF-PLAN.md` already records that
raising the work factor to anything modern is impossible on the free plan for exactly this reason.

`GET /api/me` costs almost nothing, so the session probe is not the problem. Login and registration
are the two cheapest-looking endpoints that are actually expensive, and they are the ones a new
player hits first.

## The bigger per-request cost: the save blob

`PUT /api/save` is the hottest endpoint in the game (the client pushes on a 60 s debounce while
visible, 150 s while hidden, and immediately after any meaningful action). It is also the one that
handles the largest payload — the accepted ceiling is **512 KB** (`validate.js`), and the request cap
is 600 KB (`save.js`).

Measured on a **90 KB** save (a late-game character with a few hundred inventory rows), one accepted
`PUT` was **~9 ms** end-to-end in Node, and instrumenting `JSON.parse`/`JSON.stringify` shows why:

> **6 full parses of the save blob and 2 full stringifies per accepted sync** — ~0.67 MB of JSON
> re-tokenised for a 90 KB save.

The parses are spread across the pipeline, each re-reading the same string:

| where | what it is doing |
| --- | --- |
| `readJson` → `JSON.parse(text)` | the request body itself |
| `checkSaveBlob(blob)` | parse #2 — validate + return `save` |
| `saveBelongsTo(row.blob, user)` → `storedSaveAccountId` | parses the **stored** blob |
| `storedRestoreAt(row.blob)` | parses the **stored** blob again |
| `withSaveIdentity(body.blob, user)` | parses the **incoming** blob again |
| `JSON.parse(stored)` | parses it once more to get `storedSave` |
| `recordDamageObservation` / `auditAcceptedSave` / `publicFields` | reuse the parsed object (cheap) |

On a 512 KB save that is roughly 3.5 MB of JSON tokenised per sync, and the per-sync cost scales
linearly with save size: **the players who have played longest pay the most CPU per save**, which is
the opposite of what a free tier wants. Parsing is pure synchronous CPU, so it is counted in full
against the 10 ms budget.

That alone does not explain 1,000+ kills a day — a single player pushing every 60 s is 1,440 requests
a day, so the *hours played* matter. But it does mean that **any burst of players (or one tab with a
large save left open) turns into a burst of over-budget requests**, and each one is a visible error in
the client.

## The second suspect: the write gate

`functions/api/_middleware.js` runs on **every** `/api/*` request. Since 2026-10-30 the deployment is
configured with `WRITE_GATE = "required"`, so every request also does:

1. `networkBanVerdict` → `ipHash` (SHA-256) + a D1 read of the ban table;
2. `askGate('/admit')` → a **Durable Object round trip**;
3. in `finally`, `askGate('/release')` → a **second Durable Object round trip** via `waitUntil`.

The DO calls themselves are wall time (not CPU), but the SHA-256 fingerprinting, the JSON
encode/decode of both bodies, and the session lookup for the owner-exemption check are CPU, and they
are paid by requests that would otherwise cost nearly nothing — `/api/me` every 45 s per open tab,
`/api/version`, the chat probe. They are small individually but they add up across many tabs, and
they are the reason so many *trivial* requests can appear in a CPU metric at all.

The gate is also a single Durable Object (`idFromName('world')` style binding, one instance), so its
own admission/release path is a serialisation point — worth knowing when the account is being
hammered.

## What is almost certainly NOT the cost

Checked and ruled out so they do not get "fixed" by mistake:

* **The plaza Worker's 1 s battle alarm** — that bills Durable Object *requests* and duration, which
  is a different budget. It does not count against a Pages Function's 10 ms CPU.
* **D1 reads/writes** — I/O, not CPU.
* **The save audit** (`save-audit.js`) — measured at ~0.3 ms on a 90 KB save; it reuses the already
  parsed object, and it only pays for a grant lookup when it is about to flag something.
* **`recordUnverifiedEcho` / `settleUnverifiedEcho`** — ~0.03 ms each; they are cheap D1 statements
  and skip entirely when the save carries no Echo score.
* **`gm-catalog.js`** (220 KB of literal data) — only imported by `/api/gm/*` routes, so a player
  request never pays for it. Do not "optimise" it for this problem.

## Options, cheapest first

1. **Make `PUT /api/save` parse the blob once.** `checkSaveBlob` already returns the parsed object, but
   the callers re-parse the same string up to four more times (see the table above). Passing the parsed
   object through — and having `saveBelongsTo` / `storedRestoreAt` accept an already-parsed stored
   blob — removes 3 of the 6 parses without changing any rule. This is a pure, testable win and is the
   single highest-leverage change in the repository for this limit.
2. **Cap or shrink the blob.** 512 KB is generous for this game; the client's own save is padded by
   history and inventory rows. A smaller ceiling (and pruning on the client) reduces every player's
   per-sync cost proportionally.
3. **Move diagnostics off the write path.** `recordDamageObservation`, the audit and Echo settlement are
   already best-effort; on the free plan they could run on a sampled basis (every Nth save) instead of
   every sync. This does not change their guarantees — they are review-only.
4. **Trim the gate's per-request work.** The ban check only needs to run on entry points (login,
   register, recover) to be useful; running it on every `/api/me` probe is the expensive version of a
   check that a suspended player cannot exploit through a read. The admission lease still has to be
   paid — that is the pause's whole design — but the fingerprinting and the session lookup inside it
   can be skipped for the cheap read paths.
5. **Workers Paid.** Trivial to switch on (free tier is 10 ms fixed; paid is 30 s default, up to 5 min)
   and it makes all of the above optional rather than urgent. It does **not** make a 6-parse save
   path efficient, so it is a budget decision, not a fix.

## What to check before acting

* Cloudflare dashboard → Workers & Pages → the Pages project → **Metrics**: the breakdown by
  endpoint/cron and the "Exceeded CPU Time Limits" line. The email gives a count, not a caller, and
  the numbers above are local — they establish *shape*, not the hosted value.
* The daily summary counts every script in the account. Confirm the kills are on the Pages Functions
  and not the `prontera-social` / `prontera-gate` Workers, whose budgets are different (requests and
  duration, not per-request CPU).
* `docs/PASSWORD-KDF-PLAN.md` and `docs/CAMP-AUTH-AUDIT.md` already concluded that a modern password
  KDF is impossible on this plan. Nothing here changes that; it only quantifies it.
