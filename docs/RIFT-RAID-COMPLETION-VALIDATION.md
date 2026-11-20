# Rift Raid — completion validation

**What this answers:** a solo run is simulated in the browser. The server reserved it, so it knows the
entry, the seed, the roster and the rules version — but it did not watch the fight. This document
states exactly what the current settlement does and does not prove, and proposes the mechanism that
would let the server verify a clear instead of accepting a bounded claim. It includes the measured CPU
and payload cost of that mechanism, taken on the engine as it exists.

Related: `docs/RIFT-RAID-VALIDATION.md` (results and costs), `docs/RIFT-RAID-RECONCILIATION.md`
(cadence findings and the solo/co-op split).

---

## 1. What is true today

| Claim | Status |
| --- | --- |
| The entry was reserved exactly once, for this account, on this day | **Proven.** Atomic D1 insert with a daily trigger and an active-run trigger; a duplicate start is rejected by the database, not by a check-then-write. |
| The run identity (seed, rules version, roster, profiles, deadline) is the server's | **Proven.** The client receives them; it cannot choose them. |
| Rewards are the server's own numbers, settled once | **Proven.** Reward rows come from `rollRaidClear` / `rollPityChest` / `rollFracturedChest`, and `raid_settlements` makes settlement single-valued. The request never carries an amount. |
| The reported result is inside the bounds the run could physically produce | **Proven.** Outcome is one of two words; the finish instant must lie inside the reserved window; damage, support and actions are clamped to ceilings derived from the run's own DPS and elapsed seconds. |
| **The fight happened as reported** | **NOT proven.** A client can claim a clear it did not earn, within those bounds. |

That last row is the honest limitation. A signed start token authenticates a **reservation**. It says
"this account paid for this run with this seed at this time". It says nothing about what happened
afterwards, and the settlement endpoint must not be described as if it did.

### Why the bounds still matter

The bounds are not verification, but they remove the profit motive for the simplest lies:

- **Reward amounts are never read from the request.** Claiming `riftShards: 9999` is refused outright;
  the field is not in the accepted set.
- **The outcome is a word, not a verdict.** `victory`, `cleared!`, or any other token is refused.
- **Contribution is clamped.** A claim of 9e12 damage is recorded as the ceiling its DPS and elapsed
  time could produce, so an inflated claim cannot raise the contribution-based payout above an honest
  clear's.
- **The clock is the reservation's.** A finish before the start or after the deadline is refused, so a
  "clear" cannot be back-dated or stretched.

What remains possible is a client that reports a *plausible* failed run honestly and a *plausible*
clear dishonestly, at no more reward than an honest clear. The cost of that is one entry and one
fight's worth of rewards that the player did not earn. It is a real gap, it is a small one, and it is
the gap the next section closes.

---

## 2. Proposed: bounded replay of timestamped intents

**The idea.** The engine is already deterministic: same seed, same profiles, same intents, same
instant ⇒ same state. That property is asserted by `raid_time_model_sim.mjs` and by the
cadence-invariance test in `player_raid_engine_sim.mjs`. So the server does not need to trust the
client's account of the fight — it can re-run it from the intents and check the result itself.

**Shape of a solo run, under replay:**

1. `start` reserves the entry and returns the seed, rules version and profiles (unchanged).
2. The browser records every intent it applies: `{ action, at, targetId | x/z, actionId }`. These are
   exactly the calls it already makes to `applyRaidAction`; recording them is a push onto an array.
3. `settle` posts the intent stream instead of a summary claim.
4. The server creates the run from the same reservation and replays the stream through the same
   `advanceRaidRun` / `applyRaidAction`. The **replayed** terminal state is what settles. The client's
   claimed outcome is not consulted.

**Why this is trustworthy.** The replay is the same code path, the same seed and the same profiles.
The only input the client controls is the intent list, and the engine constrains what an intent can do:
a move is a destination the run's own clock walks to, a focus selects an enemy that exists, a paid
action is subject to its own cooldown and range. A client that fabricates intents is not simulating a
different fight — it is playing one, at 22 ms of server CPU.

**Bounded, per the owner's requirement.** The stream is not unbounded input:

| Bound | Value | Rationale |
| --- | --- | --- |
| Maximum intents | 1,200 | A 681 s run at one intent per second is 681; the cap leaves room for a busy player and still bounds the array. |
| Minimum intent spacing | 0 (free intents) / 220 ms (`move`, enforced by the engine) | Already the rules. |
| Intent `at` range | `[startedAt, deadlineAt]` | An intent outside the reserved window is not part of this run. |
| Serialized payload | 64 KB | 817 representative intents measured at **30.7 KB**; 64 KB is roughly double and still a small request. |
| Replay CPU | ~35 ms worst case (measured) | See below. |

**Measured replay cost** (this sandbox, the engine as committed):

| Replay | Time |
| --- | --- |
| Full 681 s run, intents every 5 s (327 read cells) | 44 ms |
| Full 681 s run, intents every 2 s | 22 ms |
| Full 681 s run, intents every 1 s (544 read cells) | 22 ms |
| Worst case: the whole 681 s in one catch-up call (2,621 cells resolved) | 34 ms |
| 300 s of run with 300 focus intents | 42 ms |

Cloudflare Pages Functions run on a CPU-time budget rather than a wall-clock one, and this is
pure computation with no I/O, so the numbers above are the relevant ones. A budget of **50 ms
of CPU for replay plus a hard 64 KB payload cap** leaves the whole rest of the request (D1 reads and
the settlement batch) unaffected. A failed or over-budget replay does not silently pass: it returns
"the result could not be verified", keeps the reservation, and lets the client retry.

**What replay still does not protect.** The client chooses *which* intents to send. It cannot make an
illegal intent legal, but it can omit intents it actually sent (making its fight look worse) or send a
stream that corresponds to a fight it did not literally play. Replay therefore proves "this terminal
state is reachable from this reservation under these intents" — which is the meaningful claim — and
not "this human pressed these keys". That is the correct ceiling for a browser-simulated run, and it
should be stated in the PR rather than implied away.

---

## 3. Cost of shipping replay

| Item | Change |
| --- | --- |
| Engine | None. Determinism is already required for solo/co-op cadence invariance. |
| `start` | None. |
| `settle` | Accept an intent array instead of a claim; replay it; settle from the replayed state. |
| Validation | Bounds table above, enforced before replay. |
| D1 | None. The settlement ledger is unchanged. |
| Browser | Record intents as they are applied; post them at settle. ~30 KB on the wire. |

The reason this is a *proposal* and not part of this branch is scope: it changes the settle contract
for solo, and the owner asked for the solo/co-op split, timeline correctness and measured costs to land
and be reviewed first. It is written down here so the gap is documented with a concrete, measured plan
rather than left as an unexplored caveat.

---

## 4. Interim statement for the PR

> Solo settlement validates the reservation, the roster, the run clock, the shape of the reported
> result, and physical ceilings on damage/support/actions. It pays the server's reward tables and never
> reads a reward amount from the client. It does **not** verify that the fight occurred as reported: the
> signed start authenticates the reservation, not the clear. Bounded replay of timestamped intents
> against the deterministic engine would close that gap; it is measured at ~35 ms worst-case CPU and
> ~31 KB per run, and is proposed in `docs/RIFT-RAID-COMPLETION-VALIDATION.md`.
