# Why the free plan's CPU limit is hit so fast

> **2026-11-18 — read this section first.** This document is an ANALYSIS HISTORY, not a description of
> the current code. Several items below are already fixed and their numbers are stale (`6 parses per
> sync` is now 2, `/api/version` no longer exists, `S.cards` is capped). The measured statement of what
> the current code costs, what was changed for it in v419, and what is still open is in
> **[Current state](#current-state-2026-11-18)** at the end of this file.
>
> **Nothing in this file is a hosted measurement.** The charts quoted below were supplied by the owner
> from the Cloudflare dashboard. Everything else is local: Node 22, the real handlers, the D1 shim, via
> `tools/cpu_profile.mjs`. Node's `process.cpuUsage()` is **not** Cloudflare `cpu_ms`; it is a
> comparison between two trees measured the same way. The sandbox this work was done in can reach
> GitHub/npm/PyPI only, so deployment SHA, per-status invocation counts and `cpuTimeP50/P99` quantiles
> for any build are **not available here** and are not claimed anywhere below.

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

> **Status: FIXED, and reduced again in v419 to 2.** v410 reduced this to **3 parses** (the request envelope, the incoming save, one
> top-level read of the stored row), and v414 keeps it at 3 while making each of those parses read a
> ~49%-smaller string. The section below is the original measurement that justified the work; keep it
> as history, but do not quote "6 parses" as the current state — `tools/tests/api_sim.js` and
> `tools/tests/save_codec_chain_sim.mjs` both fail if the count climbs again.
>
> v414 also found what happens if that discipline is dropped: handing the raw stored blob to three
> helpers that each parse it (owner check, restore stamp, audit) turned 3 parses into **5**, which
> ate the entire CPU saving of the smaller format. `parseStamp` now memoises the last blob it read,
> and the audit takes the already-read top-level view instead of re-reading the row.
>
> **Whole-request measurement, not just parse+rebuild.** The review was right that a "24% less CPU"
> figure covering only `JSON.parse` and the codec says nothing about what the Free plan actually bills.
> Profiling a complete accepted `PUT /api/save` - auth, session lookup, envelope parse, `checkSaveBlob`,
> `unpackSave`, the audits, the D1 write and the response - with `process.cpuUsage()` over 21 runs
> (median, harness serialisation excluded) gives, at 600 items / 300 cards / 500 fish:
>
> | | upload | measured CPU |
> | --- | ---: | ---: |
> | plain (pre-v414) | 237 KB | **7.97 ms** |
> | compact (v414) | 120 KB | **5.38 ms** |
>
> That is **-2.59 ms / -33% for the entire request**.
>
> **What these numbers are, and are not.** They come from Node's `process.cpuUsage()` running the real
> handlers against the local D1 shim. That makes them a valid *comparison* - the same work, the same
> process, one variable changed (payload size) - and they do show that the format change removes real
> work from the whole request, not just from the parse. They are **not** a prediction of Cloudflare's
> billed `cpu_ms`. workerd is a different runtime with a different allocator and GC, deployed requests
> carry cold-start and Tail-Worker costs this harness does not model, and the local D1 shim is not the
> production database. A request measured at 5.38 ms here can be faster or slower in production, and
> only Cloudflare's own CPU metrics can settle that. **No claim in this repository should be read as
> "this request executes in 5.38 ms on Cloudflare".**
>
> What the figure does establish is the shape of the budget: the per-request floor (auth, session,
> audit plumbing, D1, the JSON envelope) does not shrink with the payload, so the saving is real but is
> not the whole budget. Below roughly 100 KB of payload the format is no longer the dominant cost and
> further codec work buys little; above it, it is.
>
> To measure it properly in production, Cloudflare exposes per-function CPU quantiles in the Pages
> dashboard and `wrangler pages deployment tail` for request logs; the runtime debugger can also
> profile a single request. Compare `cpu_ms` quantiles before and after this change rather than
> trusting the local figure.
>
> **The largest accounts are still the risk.** A save that is legal in both forms has to stay under the
> ceiling *as plain text* to be comparable at all, and the reported account's 370 KB plain blob is
> already refused (413) - which is the original bug. For those accounts only the compact arm exists, so
> the comparison above cannot be run for them at all.
>
> **Size and CPU are separate gates.** The older ~709 KB compact measurement predates the v3 card
> catalog and is not the current largest-account measurement. Review then reproduced a legitimate
> refined/locked, all-starred state over v3's size ceiling. The stronger v415 production-constructor
> fixture is **338,180 characters in v3 → 295,175 in v4** (see `docs/CLOUD-DATA.md`). That fixes this
> fixture's size refusal, not every possible account and not its hosted CPU budget. Raising the CPU
> budget (Workers Paid) still does not raise `SAVE_BYTES_MAX`.
>
> **After deployment, verify CPU separately:** watch the affected account complete repeated saves,
> and compare Pages `exceededResources` plus p50/p99 CPU against the pre-deployment window. Codec
> size/fidelity tests and the three-parse ceiling are not proof of Cloudflare CPU headroom. No v415
> production CPU measurement or deployment has been made from this sandbox.

Instrumenting `JSON.parse`/`JSON.stringify` over one accepted `PUT /api/save` measured **6 parses of
the blob and 2 stringifies** *at the time of writing*, because each helper re-read the same string:
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

> **Status: still present, verified 2026-11-18, and cheaper than stated.** `networkBanVerdict()` still
> runs on every `/api/*` request: `ipHash()` (SHA-256 over the client address) then `isIpBanned()`. But
> `isIpBanned` is served from a 5 s per-isolate cache of the `ip_bans` table (`IP_BAN_TTL_MS = 5000`),
> so it is **not** one D1 read per request. Measured against the current handlers: a bare
> `GET /api/me` is **1 D1 statement** in total — the session JOIN — with the ban check answered from
> the cache (and from the same `Cache` when cold, one tiny indexed read). The old "2 statements where
> it used to be 1" figure is therefore not what the current code does. It is still not the reason for
> the spike (Nov 13 already had 13 CPU kills *before* this shipped).

`networkBanVerdict()` runs on **every** `/api/*` request: `ipHash()` (SHA-256) plus a ban lookup that
is cached for 5 s per isolate, falling back to one read of `ip_bans`.

### 3. The automatic save audit (Nov 14)

> **Status: measured again 2026-11-18 on the production constructor fixture.** `auditStaticSave` is
> **0.21 ms** on a 295 KB save (0.046 ms at 55 KB), i.e. still real but no longer a top-three cost. The
> full audit hook adds the D1 statements listed in *Current state* below.

Measured at **~1.1 ms** on a 90 KB save with a previous row present (5 D1 statements), and the same
~1.1 ms whether it flags or not — there is no CPU cliff on the flagging path. It also writes a
`save_alerts` row and mails every owner account the **first** time a rule fires per account, which is
a rows-written cost rather than a CPU one. `auditStaticSave` accounts for most of it (1.2 ms at
300 KB), and it walks the whole inventory on every sync.

**It was correct to suspect this, but the numbers say it is not the smoke — it is ~1 ms per save.**

### 4. Ruled out, so nobody "fixes" these by mistake

* **`/api/version`** — dead code, and now deleted; there is no `functions/api/version*` file. `index.html`'s update watcher has fetched `version.txt` since
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
6. **Cap the loose-card list and the other unbounded save fields.** `S.cards` is the last list in a
   save with no ceiling; measured at 86 B per card it reaches ~86 KB on its own, and the bag's 1,000
   items add ~209 KB, so capping both puts the worst honest save at ~295 KB — inside the ceiling and
   ~8 ms after (1). **Done in v411** (`CARDMAX`, paid-out overflow, bulk sale).
7. **Delete `/api/version` and spread deploy reloads.** The endpoint answered a value only a deploy
   changes and every open tab polled it; the reload that a deploy triggers had every tab flushing its
   save in the same second — the shape of a spike. **Done in v411.**

**Status after v411 (still true in v419; item 1 is now 2 parses — see Current state):** items 1, 2,
6 and 7 are shipped. Items 3, 4 and 5 are open and are decisions
for the owner, not code: (3) and (4) change how a player's save is handled, and (5) is a bill. The
largest honest saves went from 2.8–21.9 ms of parse to under 10 ms **including** Cloudflare's ~5 ms
of overhead, and the two biggest accounts (`Demonz`, the owner's own, and the two banned cheaters)
either shrink on their next load or are gone.

**What is still not known, stated plainly:** *why* Nov 15 at ~09:00 SGT stepped from 0 to 1,084 kills
in one day. Two things blocked the answer, and v411 fixes both:

* **The data to answer it was never collected.** The console asked only for request counts from
  `workersInvocationsAdaptive`, which does not contain this project's own `/api/*` traffic (that is
  Pages Functions) and never asked for CPU or for the `exceededResources` status at all. So the
  question was unanswerable in principle, not merely unanswered. It is asked for now, per hour, in
  the Usage card (`_lib/usage.js` `cpuUsage`), with a test pinning the "Workers looks quiet while
  Pages is dying" trap that made this invisible.
* **This sandbox cannot reach Cloudflare's API** (only GitHub/npm/PyPI are allow-listed), so the
  historical query could not be run from here even now that it exists. The first run of it — in the
  console, or the `curl` above — is what will name the hour and the median.

**If it recurs**, the console now records the three facts that decide the response: the first killed
hour, whether `cpuTimeP50` moved (the code got heavier for everyone → revert) or only `cpuTimeP99`
(the same code, few heavy requests → find the endpoint), and the kill rate per hour. Items 3–5 remain
the standing defences if it turns out to be volume rather than code.

## How to answer this in one query, any time it happens again

The GM console's Usage card now draws this (v411), but the same numbers are one `curl` away when the
console is not to hand. Two things had to be true to be able to say anything at all:

1. **The traffic is in `pagesFunctionsInvocationsAdaptiveGroups`, not `workersInvocationsAdaptive`.**
   This project serves `/api/*` as Pages Functions. `workersInvocationsAdaptive` covers only the two
   Durable Object Workers, so a query against it alone reports a calm, tiny day while `/api` is being
   killed — which is precisely how the Nov spike could look absent from the charts.
2. **The kills are a `status`, and the shape is per hour.** A CPU kill (error 1102) is recorded as
   `dimensions.status: "exceededResources"`. Grouping by `datetimeHour` turns "it spiked" into
   "it started at HH:00".

```bash
curl -s https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ viewer { accounts(filter:{accountTag:\"'$CF_ACCOUNT_ID'\"}) {
        pagesFunctionsInvocationsAdaptiveGroups(limit:1000, filter:{datetime_geq:\"2026-11-15T00:00:00Z\", datetime_leq:\"2026-11-16T00:00:00Z\"}) {
          sum { requests errors }
          quantiles { cpuTimeP50 cpuTimeP99 }
          dimensions { datetimeHour status }
        } } } }"}' | jq .
```

Read it in this order:

| What you see | What it means |
| --- | --- |
| `status: exceededResources` rows | these are the CPU kills; count `errors` on them |
| First hour with any | when it started |
| `cpuTimeP99` in a **quiet** hour at or above 10,000 µs | the code floor is already at the ceiling — an everyday request is one bad save from being killed |
| `cpuTimeP99` quiet and low, kills only in the spike | one path or one account went heavy; correlate with the deploy time |
| `cpuTimeP50` also jumped | every request got heavier (the code changed), not a few heavy ones |
| `cpuTimeP50` flat, only P99 up | a minority of requests: big saves, settlement, a specific endpoint |

The free-plan kill pins at **exactly 10,000 µs**, so a P99 of 10,000 on a killed hour is the ceiling
being hit, not a coincidence — that is the fingerprint of "these requests were terminated".

**If it happens again, in order:** (1) run the query above for that day and note the first killed
hour; (2) compare it against the deploy time of the build that landed nearest before it; (3) look at
`cpuTimeP50` — if the median moved, the code got heavier for everyone and it is a revert or a hackday;
if only P99 moved, find the endpoint. This is now a measurement, not a guess.

## How to confirm which one it was

The charts already answer the "is it chronic" question. To pin the Nov 15 09:00 SGT step
specifically, correlate it with the deploy that landed that morning (the Nov 15 build bump for v408
and the save-audit false-positive fix) and with the request line, which is the busiest of the whole
set that day. If the CPU kills stop after the next deploy, the deploy is the suspect; if they persist
on quiet days, item (1) is the floor that has to come down.

---

## Current state (2026-11-18, third revision)

This document has been wrong twice, so the corrections are listed before the results.

**Revision 2 corrections (kept, still true):**
1. **The version reader was a compatibility bug.** A text scan for a literal `"__v":` answered "plain
   save" for `{"\u005f_v":4}` (which is `{__v:4}` to `JSON.parse`) and handed v4 item tuples to a page
   that cannot decode them. Removed; the version now comes from a PARSED view.
2. **The conflict benchmark measured the wrong request** (no `X-Save-Format`, so it timed legacy
   expansion). Modern and legacy clients are now separate cases.
3. **The profiler ignored `--case/--size/--runs`.** Fixed and pinned by tests.

**Revision 3 corrections (this one):**
4. **The conflict timing was not handler CPU.** The harness drained and parsed the reply INSIDE the CPU
   sample, so a 409 - whose reply carries the whole live save - was charged for the harness reading it.
   Preparation, execution and validation are now separate phases: requests are prepared before the
   sample, the sample stops when the response object exists, and draining/validating happens after it.
   The conflict cost fell from 11.5 ms to **7.4 ms** with no server-side change, which is the size of the
   error. **No earlier conflict figure in this file is valid and none is retained.**
5. **A global `--middleware` flag redirected the "handler-only" baseline.** There are now two explicit
   invokers; `handler-only` never imports the middleware module. `tools/tests/cpu_profile_invoker_sim.mjs`
   measures it: **0 middleware entries** for handler-only requests, **exactly one per request** for
   middleware requests.

Method: `tools/cpu_profile.mjs`, Node 22.22.3, the real handlers and the real migrations in `node:sqlite`
with a D1 shim. Each sample is the mean of 10 identical requests; the figure is the median of 11 samples,
and the reported value is the median of 3 alternating rounds. Fixtures are the production constructors
(`full-storage-save.js`): refined/locked gear, starred/socketed cards, a full fishing collection -
`small` ~3.2 KB, `medium` ~56 KB, `nearCap` 295,699 B against the unchanged 307,200 B ceiling.

***These are not Cloudflare `cpu_ms`.*** The harness prints, on every run, what production has and it does
not: workerd (this is Node), the real D1 binding (this is a shim), the **recovery gate Durable Object**
(absent unless `WRITE_GATE=required`, and unmeasurable here because there is no GATE binding), the gate's
two round trips, Tail Workers, and the Social Worker's separate budget.

### Before / after, identical workloads, handler only

Main's tree vs this branch, same harness, same fixtures, alternating rounds:

| case | main | v419 | Δ |
| --- | ---: | ---: | ---: |
| `PUT /api/save` near cap, accepted (modern 112) | 7.882 | **6.428** | −18 % |
| `PUT /api/save` medium, accepted | 1.776 | 1.693 | −5 % |
| `PUT /api/save` small, accepted | 0.721 | 0.643 | −11 % |
| `GET /api/save` near cap, modern 112 | 4.906 | **1.924** | **−61 %** |
| `GET /api/save` medium, modern 112 | 1.254 | 0.599 | −52 % |
| `GET /api/save` near cap, legacy page | 23.223 | 17.526 | −25 % |
| `GET /api/save` medium, legacy page | 3.666 | 2.225 | −39 % |
| `PUT /api/save` legacy (no header), small / medium | 0.679 / 3.108 | 0.577 / 2.943 | −15 % / −5 % |
| `GET /api/me` (all sizes) | 0.173-0.196 | 0.180-0.186 | flat |
| `GET /api/board?board=echo` | 0.401-0.431 | 0.404-0.423 | flat |

**Conflicts are reported separately and are not accepted-save CPU** (a 409 is a refused write, and its
reply carries the live row which a legitimately syncing client never receives):

| conflict | main | v419 |
| --- | ---: | ---: |
| modern 112, near cap | 10.963 | 7.379 |
| modern 112, medium | 2.383 | 1.560 |
| legacy, medium | 6.505 | 4.248 |

The two legacy near-cap rows are **not measured**: a near-cap save expands to 1,657,687 chars, over the
600,000 B envelope limit, so a page without the codec cannot upload one at all (413). The harness prints
that instead of a number.

### Front door (middleware), measured as its own invoker

| route | handler only (main → v419) | handler + middleware (main → v419) |
| --- | ---: | ---: |
| `GET /api/save` near cap | 5.144 → 1.871 | 5.072 → 2.032 |
| `GET /api/save` medium | 1.183 → 0.614 | 1.417 → 0.720 |
| `PUT /api/save` near cap | 6.996 → 6.372 | 6.722 → 6.680 |
| `PUT /api/save` medium | 1.909 → 1.823 | 1.959 → 1.865 |

The middleware delta (preview guard, ban hash + cached lookup) is ~0.01-0.15 ms on these routes -
smaller than earlier revision claimed, because the earlier row was polluted by the same drain error.
With `WRITE_GATE=required` it would additionally pay two Durable Object round trips (wall time, not
CPU), and that configuration cannot be measured here.

### What the four server-side changes are

1. **`_lib/validate.js`** - the codec version comes from a parsed view (the caller's, or `parseSave`'s
   memo), never from the text. This is a correctness fix first: the previous text scan mis-classified
   escaped property names and could serve tuples to an old page.
2. **`api/save.js` (GET)** - one read of the save row instead of two; the second read fetched a whole
   save-sized blob to learn a `last_seen` the response does not carry.
3. **`_lib/db.js` + `api/save.js` (PUT)** - an unchanged leaderboard projection is not rewritten; the
   row is still written (version, blob, timestamps) under the same `AND version = ?` guard.
4. **`api/save.js`** - the last claim's remainder is read only when a claim could be issued.

The GET improvement is most of the near-cap saving: one parse of the stored save instead of two, and one
row read instead of two.

### Reverted, with measurements (do not retry blind)

* **Parse sharing on a byte-identical re-sync**: parses 3 → 2, CPU +40 % at near cap. Reverted.
* **Durable settlement checkpoint** (migration 0018, lease, owner-only endpoint): its read cost the same
  single statement as the query it replaced (~7 µs saved) and added statements when a period was due.
  Dropped; settlement is unchanged and pinned by `cpu_hot_paths_sim.mjs`.

### Still open

* **The 307,200 B ceiling.** Per-sync CPU scales with it.
* **Legacy clients at large saves** are a size problem (413 on upload) as much as a CPU one (17.5 ms to
  serve an expansion).
* **Hosted `cpu_ms`** is unavailable from this sandbox - see the plan below. Local Node numbers do not
  prove the Free Tier problem is solved and are not presented as if they do.

## Hosted verification plan (requires authorisation, and a deployment)

Nothing in this file proves the Free Tier CPU problem is solved, and no local measurement can. The plan
below is what would actually settle it. It needs two things this sandbox does not have: Cloudflare API
access, and permission to deploy. **Do not deploy on the strength of the local numbers.**

### 0. What is needed first

* `CF_ANALYTICS_TOKEN` (account analytics read) and `CF_ACCOUNT_ID`.
* The deployment SHA of the build under test (`wrangler pages deployment list`), recorded BEFORE the
  window opens, so nobody has to guess which build a spike belongs to.
* The previous build's window kept for comparison - the account's own history is the control, and the
  nightly request count varies by more than any code change will.

### 1. Baseline, per service, before the change

Three surfaces have separate budgets and must not be summed:

| service | what to query | why |
| --- | --- | --- |
| Pages Functions (`/api/*`) | `pagesFunctionsInvocationsAdaptiveGroups` | this is where the save path lives |
| Social Worker (plaza DO) | `workersInvocationsAdaptive` | separate Worker, separate limit |
| Recovery-gate Worker | `workersInvocationsAdaptive` | only meaningful with `WRITE_GATE=required` |

A query against `workersInvocationsAdaptive` alone reports a calm week while `/api` is being killed -
that trap is why the first investigation missed. For the Pages surface, group by `datetimeHour` AND
`status`, and take `sum{requests,errors}` with `quantiles{cpuTimeP50,cpuTimeP99}`.

### 2. What to read, in order

1. `status: "exceededResources"` rows - these are CPU kills. Count `errors`. If the field is empty the
   day had none, which is the number that matters.
2. `status: "scriptThrewException"` and `status: "internalError"` as SEPARATE rows. The first is our bug,
   the second is a platform-side failure; neither is a CPU kill and neither may be counted as one.
3. `cpuTimeP50` per quiet hour. If the median moved, the code got heavier for everyone; if only P99
   moved, a few heavy requests did (near-cap saves, conflicts) and the fix belongs on that path.
4. Kills as a RATE per thousand requests, not a count, or a busy day looks like a regression.

### 3. What to compare, and what would count as support

* `exceededResources` per 1,000 requests, for the same route mix, before vs after. A drop that survives a
  comparable request count is support; a drop on a quieter day is not evidence.
* `cpuTimeP50` and `cpuTimeP99` for the `/api/save` and `/api/me` routes, before vs after, on days with
  similar traffic.
* Subrequests per request and `rows_read`/`rows_written` from D1 analytics, to confirm the statement
  reductions in this change (GET 6 → 5, accepted PUT 8 → 7) show up where the bill is.

### 4. What would falsify it

* `cpuTimeP99` unchanged at ~10,000 µs on killed hours: the code floor is still at the ceiling.
* Kills concentrated in one hour that also contains a deploy or a reload storm: that is traffic, not
  per-request cost.
* Any increase in `exceededResources` rate for a route this change touches.

### 5. Rollback

The change is a single commit with no migration and no new data shape, so a revert is safe in either
direction and a mixed old/new deployment against one D1 database is fine (the version decision falls back
to a parse). Verify after a revert with `api_sim`, `save_format_parity_sim` and
`save_codec_canread_sim`, then one save and one reload on a disposable account.
