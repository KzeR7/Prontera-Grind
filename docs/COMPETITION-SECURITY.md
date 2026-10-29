# Competition security: authority and settlement plan

Draft investigation, 2026-10-29. Boards and Echo leaderboard payouts remain
**paused**. This document and the local prototype are not an implementation of
server-authoritative gameplay and do not authorize re-enabling competition.

## What is untrusted today

- `functions/api/save.js` accepts a versioned browser-authored save, including
  kills, equipment, progression and Echo personal best. Ownership, numeric caps,
  timestamps and rate limits do not prove that a kill or score was earned.
- `publicFields()` extracts those values. Existing `leaderboard_kills` triggers
  still collect kill deltas from those saves even while the board is paused.
  Historical kill/Echo rows can therefore contain forged data. The current offline
  claim uses server time but its farming rate is derived from client-supplied kill
  deltas; it is not a competitive proof either. The separate personal Echo completion
  shards and milestone chests still run in the browser; the leaderboard prize pause
  does not disable them, and they cannot establish trusted competitive inventory.
- The old Echo settlement function selected from those scores, claimed a period,
  then wrote awards and grants separately. A failure after claiming could leave a
  partially paid period that could not safely retry. An `INSERT OR IGNORE` on the
  period alone is not an atomic payout.
- The draft server no longer calls those old write functions. They now also fail
  closed if called directly, and the board returns 503. Existing historical scores,
  settlements, grants and player saves are not deleted or corrected. Do not
  treat those records as a source for future prizes.

## Required trust boundary

A plausible direction is a separate, versioned competitive run service that
identifies the authenticated account, reads an **authoritative** progression,
inventory, equipment and skill state, starts and times the run server-side, and
executes or verifies all score-relevant rules on the server. The service must own
randomness, time, actions and the final score; it cannot accept a browser-provided
DPS number, duration, kill total, loadout, replay result or client clock as proof.
A deterministic replay still needs authoritative initial state and server-controlled
input/clock rules, and must account for bots and repeated actions. There is no
complete authoritative inventory or combat engine on this branch today.

That is a major architecture change, not just a leaderboard query. The existing
client game and local saves can remain playable; **do not silently reset or delete
legacy progress**. A fair policy for existing equipment and characters, migration,
GM testing, offline play, client disconnects, and rules-version changes needs an
explicit owner decision before competitive eligibility is implemented. GM tools
must remain usable for testing but must not grant unfair competitive eligibility.

## Settlement requirements

A new competition must use fresh, distinctly versioned score/period records, not
backfill the old untrusted tables. Define the server-side cutoff and grace policy;
freeze each period and score set; specify deterministic ties. Under a single D1
transaction, commit the period closure, immutable placements, reward ledger and
unique idempotent grants together. Retries and concurrent workers must never duplicate
or omit awards. Include an explicit policy for late runs, empty periods, corrections,
auditing, old grants and disputed results. Never delete or retroactively pay legacy
records without an owner-approved migration plan.

`tools/prototypes/competition_settlement.mjs` explores **only** cutoff, per-period
event replay, deterministic ties and all-or-nothing placement/grant writes in an
isolated Node SQLite schema. `node tools/tests/competition_settlement_prototype_sim.js`
tests synthetic inputs, retry and injected mid-payout failure. It is not imported by
application code, has no D1 binding or endpoint, does not verify gameplay or identity,
and its injected test clock is not a trustworthy production clock. It cannot prove
Cloudflare D1 concurrency, cross-period replay handling, recipient delivery, accounting,
authoritative score generation or live safety. The real grant system and D1 behavior
need independent end-to-end race/crash tests before any release.

`tools/prototypes/competition_d1_settlement.mjs` and the opt-in
`tools/audits/competition_d1_local.mjs` explore an atomic D1 `batch`: a conditional
period claim, deterministic placements, synthetic grants and period closure commit
together. A local Miniflare/D1 audit exercised concurrent settlement attempts,
retry and injected mid-batch failure; only one attempt awarded grants. The schema,
score data and clock are synthetic, and it is not part of the application. It does
not establish hosted D1 concurrency, live grant delivery, trusted scores, cutoff
policy, empty-period policy or production safety. The audit needs Miniflare (set
`PG_MINIFLARE_MODULE` to an installed copy if it is not in `node_modules`).

`node tools/tests/competition_pause_sim.js` tests the actual paused handlers and
fail-closed old write entry points with synthetic accounts, forged saves and old
untrusted rows. Passing it does not make scores trustworthy.

`tools/prototypes/echo_basic_attack.mjs` is a second disconnected experiment for
one physical basic hit against the non-boss Echo dummy. Its test compares 1,200
synthetic hits to the current browser's real `strike()` across four character
fixtures. It is **not** a complete 180-second run: it omits skills, pets, cast and
attack scheduling, server-owned random numbers, authoritative loadout/progression,
identity, persistence and rewards. Its inputs and test random rolls are supplied
by the harness, so it must never be wired to public requests or ranking as-is. It
is a parity starting point, not a verified score source.

## Suggested milestones

1. Agree on competitive eligibility for existing characters and GM testing.
2. Define an authoritative run and server-owned loadout/inventory, with versioned
   rules and a threat model; prototype and measure real combat parity and cost.
3. Implement isolated verified score records and complete, transactional settlement;
   test forged requests, clock boundaries, replay, concurrency and crash recovery on
   the real D1 runtime, then a separately isolated hosted staging project.
4. Run load, cost, monitoring and security tests; seek explicit owner approval before
   enabling any ranking or payout. Keep the current pause until every gate is met.
