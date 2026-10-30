# Competition security: authority and settlement plan

## Launch decision and current draft (2026-10-30)

The owner chose to launch **unverified** rankings and prizes now and revisit
server-authoritative scoring later. This is a conscious risk acceptance, not a
claim that trustworthy competition is complete. Browser-authored kills, Echo DPS,
gear, client balances and prize receipts can be fabricated. Flags are review-only:
they do not ban, exclude, reduce scores or stop prizes. Players keep their own gear.

The local v262 draft enables the kills board and a new Echo prize season. The
all-time Echo board retains old unverified bests; historic daily/weekly rows and
old settlement markers remain untouched and are never automatically back-paid.
The **first request** to the new code schedules the first daily prize period at
the next midnight Asia/Singapore. Weekly prizes start with the first full Monday
week whose start is on or after that boundary. Old daily/weekly standings are not
copied to this season. A run must finish and have its save accepted before its
period ends; offline or late syncs do not count for the expired period. Equal Echo
scores rank by ascending account ID. Prizes are created lazily when a player syncs
or views the Echo board after a period ends; no scheduled job is assumed. A
settlement failure makes the Echo board temporarily unavailable and is retryable.

New placements, prize ledger and ordinary gift grants are one D1 transaction;
retries are idempotent. A failed score write does not invalidate an accepted save:
the save response flags it pending, the browser warns and retries. An extended
outage through the cutoff can still lose that period's score. Full-cap prize gifts
remain pending, not partly consumed. Mail/client balances remain unverified.

Local synthetic SQLite and disposable Pages/workerd/D1 tests do not replace a
hosted staging exercise, production backup, migration-ledger review or final
approval. Migrations 0008, 0009, 0010, 0011 are additive, but **0007 was already
applied manually to production**; review the Wrangler migration ledger and do not
blindly replay it. Preview isolation on the actual hosted project is unconfirmed.
No production migration, deployment, push or merge has been authorized.

## Earlier trust investigation (historical, before the owner's launch decision)

The following research describes the deferred authoritative design. Any historical
references to a paused board or disconnected settlement are superseded by the
launch decision above. The actual older score writer and non-atomic legacy settlement
remain disabled; only the separate unverified launch path can award new prizes.

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

On 2026-10-29 the owner rejected standardized competition loadouts and clarified
that ranking should reflect **each player's own equipment**. Preserve existing
saves, items and normal gameplay; do not silently substitute preset gear, reset
progress or exclude legacy gear from a competition without an owner decision.
GM accounts and commands must remain available for testing. Their competition
eligibility and the treatment of GM-generated gear have not been decided. On 2026-10-29
the owner chose to accept existing gear as a grandfathered starting point rather
than excluding it. This accepts the risk that forged gear already present at the
cutover may be grandfathered; the server cannot retroactively prove its origin.

Today the browser generates drops and changes equipment, affixes, cards and
refinement in a client-authored save. A save accepted by D1 proves only that the
account sent those bytes, not that the gear was earned. The synthetic
`competition_gear_trust_sim.js` creates a plausible item using the actual game
generator without a server-observed drop, saves it successfully, and checks that
the draft competitive board remains paused. Checking item shapes or valid stat
ranges alone cannot distinguish such a forged item from a legitimately earned one.

To make scores trustworthy while reflecting personal gear, the server would need
trusted account-owned equipment and other score-relevant progression, plus a
versioned combat calculation that uses that state, server-owned randomness/time,
validated actions, and an atomic reward ledger. Real gameplay must have a credible
path to earn, equip, refine, reforge and socket competitive gear; simply rejecting
or overwriting the existing save would violate the preservation requirement. No
complete authoritative inventory or combat engine exists here today.

Legacy gear lacks sufficient trusted provenance to prove it was earned: the owner
explicitly chose to grandfather it, not to exclude it. The baseline/cutover has not
yet been implemented, and the trust limitation must remain visible. A secure path
for equipment and progression changes after that baseline, transition mechanics,
GM-generated gear, offline play and client disconnects remain open. Do not silently
change those policies or treat the baseline as proof that historical gear was earned.
The separate kills board also depends on client-authored counts and remains paused
in the draft. No conclusion is asserted about production pause state.

## Grandfathered-save baseline foundation (local draft)

The owner's choice is to grandfather each player's existing equipment rather
than exclude it. `migrations/0010_competition_baseline.sql` and
`functions/_lib/competition-baseline.js` add a disabled, private foundation for
capturing a single immutable, versioned copy of an existing accepted cloud save.
The database query reads only from `saves`, checks that the account and source
save predate a server-supplied cutoff, checks the save version and account stamp,
and never accepts a save body as an argument. Older saves with no stamp can be
captured; mismatched stamps are refused. A retry cannot replace a captured copy,
and a later normal save does not modify it. This supports preserving the player's
own gear and all other original fields rather than silently supplying a loadout.

This is not an active cutover or score engine: there is no public endpoint or
scheduler; the entrypoint throws. The copied save and everything in it remain **unverified historical client data**.
The owner approved grandfathering existing equipment, not automatically trusting
every other field as a competitive input. Other progression, stats and currencies
still need an explicit, reviewed eligibility policy. The query by itself does not
secure later drops, equipment changes,
refinement, cards, stats, pets, skills, currencies or scores. Existing gear or
progress already forged before the cutoff remains indistinguishable. The future
cutoff must be set by the server and never by a client. The primitive deliberately
refuses an account created after cutoff or a save updated after cutoff; it does not
solve offline or unsynced changes, new players, a safe all-player cutover, GM gear,
restores, concurrency at scale or how to handle missing/late snapshots. Those issues
must be resolved before enabling capture, not silently restricting players.

The table stores **one complete copy of a player's save**, not only equipped gear,
up to the existing save size limit; this has privacy, retention and D1 cost impacts
that require review. Rows cascade on account deletion. The public game and personal
saves do not read from this table, and no remote migration has been performed.
`competition_baseline_foundation_sim.js` and the optional disposable local D1 audit
exercise exact-copy, immutability, source-version checks and retries; they do not
prove hosted concurrency, trusted gameplay or production readiness.

## Disabled settlement foundation (local draft)

`migrations/0009_competition_settlement.sql` adds isolated period, candidate score,
placement and prize-ledger tables. The existing reward bands are copied from the
current Echo definitions, not taken from a browser. The candidate batch claims an
ended period, ranks the top 100 by score then stable account ID, creates one
ledger entry and linked standard gift per prize, and closes the period in one D1
transaction. Concurrent/retried claims and a failure after creating prizes were
tested with synthetic accounts in local SQLite and disposable Miniflare/D1. Empty
periods close without gifts. Existing Echo records are not imported or paid.

The module is **not connected to any endpoint** and its settlement entrypoint
always throws. Its exported SQL-builder is for local tests only, not an authorization
mechanism or API. The new score rows are NOT proof of valid gameplay. There is no
trusted run writer, scheduler, legacy baseline, eligibility policy for GM gear,
hosted race/crash validation, correction/dispute process or safe enablement switch.
Do not apply 0009 remotely or enable it until those are completed and reviewed.
Local D1 race tests are not proof of hosted behavior. Ties by account ID are a
candidate rule, not yet a published competition rule; old scores remain untrusted.
Rows currently cascade on account deletion, so audit-retention policy must be settled
before launch. Period creation/cutover and any administrative changes also require
validation and auditing before this can become operational.

The browser's existing grant application still owns its save and can be manipulated;
a receipt is not a server-authoritative resource balance. v261 prevents the current
client from silently losing a gift when Daily Roulette's 10,000-roll cap or a safe
integer resource limit would be exceeded: the entire gift remains pending until room
is available. It does not recover rewards already lost under older builds and does not
make client-side balances trustworthy. `prize_delivery_safety_sim.js` exercises cap,
exact-fit and duplicate cases; the settlement test also exercises real client gift
application and the real save/claim receipt handlers with synthetic grants.

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

`tools/prototypes/competition_run_lifecycle.mjs` models a **synthetic local-only**
run lifecycle with separate test tables: it snapshots a toy server-side profile and
random seed, enforces a 180-second wait, limits attempts, checks ownership/cutoffs,
rejects extra client-supplied score/loadout/seed fields, and commits completion and
best score atomically. `competition_run_lifecycle_sim.js` exercises retries, a changed
profile, an abandoned run, cutoff, synthetic GM/disabled eligibility, and an injected
score-write failure. The test's GM exclusion is an experimental policy, **not** an
owner decision or live restriction: GM tools must remain usable. Its 180 basic-hit
scoring calculation is a placeholder, not the actual Echo game; its profile table is
synthetic, not an authoritative real inventory. The caller supplies a synthetic user
ID and the test injects a clock: there is no authentication or public API. Node SQLite
on one connection cannot prove D1 concurrent requests, hosted limits, distributed
clocks, game parity, eligibility, cheating prevention, settlement or launch safety.

`tools/prototypes/echo_skill_hit.mjs` adds a separate disconnected experiment for
one synthetic direct skill hit on the non-boss Echo dummy. Its parity test compares
2,400 physical/magical cases to the game's `skillHit` with synthetic inputs and rolls.
It omits skill selection, timing, marks, pets, trusted inventory, actual runs and score
storage; this is not authoritative scoring and is not connected to public Functions.

`tools/prototypes/echo_basic_attack.mjs` is a second disconnected experiment for
one physical basic hit against the non-boss Echo dummy. Its test compares 1,200
synthetic hits to the current browser's real `strike()` across four character
fixtures. It is **not** a complete 180-second run: it omits skills, pets, cast and
attack scheduling, server-owned random numbers, authoritative loadout/progression,
identity, persistence and rewards. Its inputs and test random rolls are supplied
by the harness, so it must never be wired to public requests or ranking as-is. It
is a parity starting point, not a verified score source.

`tools/prototypes/echo_novice_run.mjs` extends the isolated hit research into a
full 180-second **synthetic** fresh Novice, basic-attacks-only simulation. Its parity
test compares every hit, total damage, timer and DPS with the real browser update loop
for nine seeded fixed-timestep runs. Seed and step are synthetic, the PRNG is not
secure, and there is no session, endpoint, D1 or authoritative clock. It omits skills,
pets, other loadouts/classes and frame pacing; it is a synthetic reference fixture,
not a proposed restriction on players' own equipment. In one sample, 30 Hz and 60 Hz produced 208 and 212 swings
respectively, so simulation cadence must be explicit in any fair versioned ruleset.
Matching one narrow case does not prove full-game parity or permit rankings/payouts.

## Suggested milestones

1. Design authoritative ownership and mutation of each player's own equipment,
   including the owner-approved grandfathered legacy baseline while preserving saves
   and GM testing. Do not treat unverifiable imports as proven. Cutover timing and
   subsequent server-verified changes still need implementation.
2. Build an authoritative run engine using player-specific trusted state, with versioned
   rules and a threat model; measure combat parity and cost before relying on results.
3. Implement isolated verified score records and complete, transactional settlement;
   test forged requests, clock boundaries, replay, concurrency and crash recovery on
   the real D1 runtime, then a separately isolated hosted staging project.
4. Run load, cost, monitoring and security tests; seek explicit owner approval before
   enabling any ranking or payout. Keep the current pause until every gate is met.
