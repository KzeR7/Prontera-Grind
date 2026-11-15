# Why the free plan's CPU limit is hit so fast

2026-11-15, **revised** after the owner supplied the Metrics charts for Oct 30, Nov 6–9, Nov 11–13,
Nov 13 and Nov 15. The first version of this document was written from the email alone and got the
shape wrong; this version uses the charts, which are the real evidence.

## What the charts show

`Exceeded CPU Time Limits` per the Errors panel:

| Date | Success | Errors | of which CPU | Median CPU |
| --- | ---: | ---: | ---: | ---: |
| Oct 30 | 386 | 5 | **0** | 17.8 ms |
| Oct 30–31 | 1,220 | 9 | **0** | 11.6 ms |
| Nov 6–9 | 7,169 | 41 | **0** | 11.5 ms |
| **Nov 11–13** | 10,152 | 34 | **0** | 9.5 ms |
| Nov 13 | 11,869 | 43 | **13** | 8.7 ms |
| **Nov 15 (24 h)** | 7,631 | 1,097 | **1,084** | **13.7 ms** |

Two facts decide this whole question:

1. **For two weeks the CPU limit was never hit — zero, on every single day.** The code was *already*
   running 10–18 ms median CPU in all of those days, i.e. already far over the nominal 10 ms cap, and
   Cloudflare killed nothing. The free tier tolerates ordinary overruns on a small account.
2. **Then on Nov 15 it killed 1,084 in one day**, with ~92% of all errors being CPU kills, while
   median CPU *rose* from 8.7 ms to 13.7 ms and p99 went 45 → 62 ms.

**The correct conclusion: this is a regression, not a chronic over-budget design.** Something that
went live on/around Nov 14–15 both raised the CPU and blew up the request count. Nothing else about
the account changed: subrequests per request are flat (~2.1) on every day including the bad one, and
"Script Threw Exception" and "Exceeded Memory" are 0 throughout — so it is not new heavy endpoints
and not a crash loop.

Note also that the owner's timezone is GMT+8: the Nov 15 spike began around **09:00 SGT** and peaked
about an hour later, which is when that day's deploy and the players arrived together.

## What shipped just before it

From `docs/UPDATE-LOG.md`, all on Nov 14–15 and all server-side (no visible build change, so nobody
would connect them to a slowdown):

* **network (IP) bans** — `_middleware.js` now runs `ipHash()` + `isIpBanned()` **on every `/api/*`
  request**;
* **automatic save audit** — `auditAcceptedSave()` now runs on **every accepted save**;
* **the save audit's own false positives** — the welcome-back payout and the sold-out fishing bag
  were being flagged as cheating on Nov 14, patched on Nov 15;
* **v408 offline rewards** (build bump, client);
* v407 MVP fish art and announcement gifts (build bump).

## Measured cost of each culprit

All numbers are local (Node 22 + the real handlers against the real migrations through a D1 shim),
so they bound *shape*, not the hosted millisecond. Measured twice, the second time correctly — the
first pass wrongly passed `prev: null` to the audit, which skips the entire rate check.

### 1. The save blob is parsed six times per sync — and this is the big one

Instrumenting `JSON.parse`/`JSON.stringify` over one accepted `PUT /api/save` counts **6 parses of the
blob and 2 stringifies**, because each helper re-reads the same string:
`readJson` (body), `checkSaveBlob`, `saveBelongsTo` (stored), `storedRestoreAt` (stored),
`withSaveIdentity` (incoming), and the `storedSave` re-parse.

| real save size | one parse | today (6 parses + 2 stringify) | parse-once | saved |
| ---: | ---: | ---: | ---: | ---: |
| 18 KB | 0.18 ms | **1.5 ms** | 0.6 ms | 0.9 ms |
| 81 KB | 0.76 ms | **6.5 ms** | 2.5 ms | 4.0 ms |
| 273 KB | 2.81 ms | **24.4 ms** | 9.4 ms | **15.0 ms** |
| 456 KB (near the 512 KB cap) | 3.64 ms | **34.9 ms** | 13.8 ms | **21.1 ms** |

**A big-save player is burning 25–35 ms of pure JSON work per sync, two thirds of it duplicated.**
That is enough on its own to be killed on the free plan, and it is why the p99 sits at 62 ms.

This is not new code, but it is what makes the account fragile: the *distribution* matters more than
the average. The moment more players reach large saves, or a few tabs with big saves sync close
together, the kills start — exactly the Nov 15 shape.

### 2. The per-request ban check (Nov 14)

`networkBanVerdict()` runs on **every** `/api/*` request: `ipHash()` (SHA-256) plus at least one D1
read of `ip_bans`. Measured: a bare `GET /api/me` is now **2 D1 statements** where it used to be 1.
It is small, and it is not the reason for the spike (Nov 13 already had 13 CPU kills *before* this
shipped), but it is a permanent tax on the cheapest, most frequent call in the game.

### 3. The automatic save audit (Nov 14)

Measured at **~1.1 ms** on a 90 KB save with a previous row present (5 D1 statements), and the same
~1.1 ms whether it flags or not — there is no CPU cliff on the flagging path. It also writes a
`save_alerts` row and mails every owner account the **first** time a rule fires per account, which is
a rows-written cost rather than a CPU one. `auditStaticSave` accounts for most of it (1.2 ms at
300 KB), and it walks the whole inventory on every sync.

**It was correct to suspect this, but the numbers say it is not the smoke — it is ~1 ms per save.**

### 4. Ruled out, so nobody "fixes" these by mistake

* **`/api/version`** — dead code. `index.html`'s update watcher has fetched `version.txt` since
  v389; nothing calls `/api/version`. (It would have been expensive: decoding the 1.33 MB
  `index.html` is ~5.3 ms. If it were ever revived, it must not re-read the whole page.)
* **The write gate** — it adds a ban read, a SHA-256 and two Durable Object round trips per request,
  but it went live Oct 30 and the account hit **zero** CPU errors for the following two weeks.
  The DO hops are wall time, not CPU. Keep the leases; this is not the regression.
* **The plaza Worker's 1 s battle alarm** — a different budget (DO requests/duration).
* **D1 reads/writes** — I/O, not CPU.
* **`gm-catalog.js`** (220 KB of literals) — GM routes only; a player request never pays for it.

## What to do, in order

1. **Parse the save once.** Removes 3 of the 6 parses and 1 of the 2 stringifies; saves 4 ms at 81 KB
   and 21 ms at the 456 KB ceiling. Pure win, no rule changes, and it is the difference between
   "fragile" and "fine" for the players who matter most.
2. **Trim the audit's static pass** — it walks every item in `eq`/`inv`/`cards` on every sync for
   `refine-over-cap`/`affix-over-cap`. Check the worst item, not all of them, or run the static pass
   every Nth save (it is review-only, so a sampled run loses nothing but a little latency in the
   flag appearing).
3. **Shrink the 512 KB save ceiling** — every player's per-sync CPU scales directly with it.
4. **Move the ban check off the hot read paths** — it only needs to gate entry points (login,
   register, recover) and writes to be useful; a suspended player cannot do anything with a read.
5. **Workers Paid ($5)** — a legitimate stopgap, since the account already runs 8–18 ms median on
   *every* day and is only surviving on Cloudflare's overrun tolerance. It is not a substitute for
   (1), which is waste regardless of plan.

## How to confirm which one it was

The charts already answer the "is it chronic" question. To pin the Nov 15 09:00 SGT step
specifically, correlate it with the deploy that landed that morning (the Nov 15 build bump for v408
and the save-audit false-positive fix) and with the request line, which is the busiest of the whole
set that day. If the CPU kills stop after the next deploy, the deploy is the suspect; if they persist
on quiet days, item (1) is the floor that has to come down.
