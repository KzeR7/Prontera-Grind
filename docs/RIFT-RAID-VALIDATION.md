# Rift Raid — Astral dungeon validation report (build v449 → v450)

Branch: `arena/bfc7d4d1-prontera-grind` (from `main` at `37a13bf`)
Build label: `2026-11-20 haven-v450 Astral dungeon raid`
Feature state: **closed by default** (`wrangler.toml` `RAID_ENABLED = "false"`; the Pages handler
requires the exact string `true`).

The build label moved from v449 to v450 because this pass changes three shipped files —
`assets/rift-raid.js`, `assets/raid-solo.js` and `functions/api/raid.js` — and `dist/_headers` serves
`/assets/*` from cache. Leaving their `?v=` tags at 449 would have handed a cached browser the previous
client, which is precisely the class of miss the version guard in `update_watch_sim.js` exists to catch:
that guard listed the social assets but not the raid runtime, so it could not have caught it. The raid
tags are now covered by their own assertion (§3.1). `RAID_RULES_VERSION` deliberately stays `v449-r1`:
no rule, stage, reward or timing changed, and a bump would invalidate every in-flight checkpoint for no
gameplay reason.

v448 shipped one boss encounter with three hazard lanes. v449 replaces it entirely: the raid is now a
four-stage dungeon the party walks through, and the lane vocabulary (`strike`/`dodge`/`ward`/`heal`,
`LANES`, hazard lanes, phase HP) no longer exists anywhere in the code.

## 1. Scope delivered

One playable four-stage dungeon for 1–3 player characters, entered from **Map → Rift Raid** or the
**Social Hub**, with exactly two entries per Malaysia calendar day and exactly-once reward settlement
through the existing `grants` queue.

| Stage | Key | Name | Target | Objective |
| --- | --- | --- | --- | --- |
| 1 | `approach` | Starlit Approach | 52 s | three packs on a floating bridge, then the exit portal |
| 2 | `arcade` | Fallen Arcade | 67 s | guards plus two rift anchors that shield them |
| 3 | `observatory` | Runic Observatory | 67 s | elite waves plus two ritual sources |
| 4 | `sanctuary` | Thanatos's Sanctuary | 240 s | Thanatos: soul cleave, astral cataclysm, Ritual of Ruin, enrage at 25% |

- **Walking is the mechanic.** A `move` intent is a *destination*, clamped to the stage bounds and
  held for 2.5 s; the server walks the member at 9.6 units/second on the run's own clock. With no
  manual intent the server auto-approaches the focus target at class reach, and that automatic chase
  **never enters and never tunnels through** a live telegraph (it is sliced into 100 ms chunks and
  compares danger depth before/after every step).
- **Combat is server-owned.** Auto-attack (2.6 s, 18% crit ×1.6), class skill (7.4 s ×2.35), pet
  (3.4 s ×0.22), enemy attacks (2.9 s), boss armour 16%, weapon-star penetration, downed state,
  revive (2.6 s hold, 3.2 unit reach, 35% HP), wipe on all-downed.
- **The clock is fixed.** `startedAt`/`deadlineAt` are written to D1 when the run is reserved, and the
  Social room builds its copy from **that** timestamp — a run's identity can never drift from its own
  reservation. The public snapshot echoes them unchanged; `serverNow` is a separate field.
- **The stage objective is a duration.** Enemy HP is `partyDps × seconds`, so a stage takes the same
  wall-clock time for a fresh 12k-DPS character and a fully geared one; gear changes damage numbers
  and safety, not the schedule. Stage objectives are bounded so the weakest legal save can always
  clear the stage it paid an entry for.

### The client is one renderer

`assets/raid-dungeon.js` mounts the dungeon inside the field's own three.js scene/`PGField`
(`ORIGIN = -320`), so the hero, camera and drag controls are the ones the player already knows. The
`PGField` lights are forced off (`RAID_LIGHT = {hemi:0, sun:0}`) and the dungeon rig carries its own
(`hemi .55 / sun .8 / point .5`); floors are `DoubleSide`. `assets/astral-raid-scenes.js` is a UMD
module (also `require`d by `tools/build_site.sh`) holding the four stage layouts. Field chrome
(`#eclipseCombat`, `#minimapTools`, `#sideRail`, `#eclipseMapCard`, `#feedWrap`, `#eclipseCompanions`,
`#pgQuests`, `#hint`, `#tag`, `#socialChat`) is hidden by `body.raid-fighting`; the portrait card, the
bottom dock and the top bar intentionally stay.

## 2. What v449 fixed that v448 shipped broken

These were found by writing the acceptance sims against the real engine, not by inspection:

| Defect | Effect | Fix |
| --- | --- | --- |
| `move` wrote `member.x/z` directly | a tap teleported the hero; a telegraph was undodgeable and no walk cost time | the intent is stored; the run's clock does the walk (`raid-engine.js` `applyRaidAction('move')`) |
| Ritual sources took `boss.maxHp × 4%` | two sources needed 19.2 s of solo damage inside a 16 s channel: the **interrupt reward was mathematically unreachable** | a source is `partyDps × 6 s`, so two are 12 s of focus at any gear level |
| Boss stage clock was `240 + 45 s` | the walk-in and two 16 s rituals pushed a full clear past the stage timer | `bossStageGraceSeconds = 120`; `raidStageSeconds()`/`raidRunSeconds()` are the single source of truth for both the API and the engine |
| `maxClearSeconds` 120 vs a 52+45 s stage | the weakest allowed save got an objective longer than its own stage | floors bound to each stage's budget |
| Auto-chase tested only the step *endpoint* | a long tick could hop over a 5-unit telegraph, and a member standing inside one was frozen | 100 ms chunks + danger-depth comparison |
| Settle validator compared `startedAt`/`deadlineAt` to the current wall clock | every settlement failed with "the raid clock changed unexpectedly" | room installs the run from `payload.startedAt`; the snapshot echoes the fixed identity |
| `rollRaidCard()` can return `null` | a card-roll miss crashed the whole settlement (no shards, no zeny) | the API skips a miss instead of dereferencing it |
| Chest ledger rows nest amounts under `rewards` | the results panel printed "Recorded" for every chest | `flattenRewardRow()` in the API; the client reads both shapes |
| `advanceRaidRun` jumped from event to event | the state at a given instant depended on **how often the run was read**: a 1 s and a 100 ms client settled 8.8 s apart with 147k damage between them | whole `SIM_TICK_MS` cells resolved chronologically, with `run.cursorAt` (last resolved cell) kept separate from `updatedAt` (furthest instant observed) so a partial cell is never counted as simulated time |
| A swing was judged at the end of its cell | a member that finished walking into range mid-cell was billed as out of range and lost a whole cadence | range is evaluated per cell against the position the cell resolved to, and the cadence rolls to its own next boundary |
| A stale `focus`/`move` replay overwrote a newer intent | a retried packet undid the player's most recent choice; a replayed `move` reset the manual hold and dragged them back | free intents are ordered by the client's own timestamp (kept before the server clamp); an older one is acknowledged as `stale` and changes nothing |
| The `move` floor was measured against the server's clock | the server's own catch-up satisfied the 220 ms floor, so two moves sent 0 ms apart were both accepted | the floor compares the client's timestamps |
| `nextMechanicAt` stayed armed after a stage clear | a spawn timer could keep coming due for a stage that was already won | cleared on clear (`= Infinity`) |
| `referenceDps: 120_000` | dead config, and ~7× the real ceiling (the game's own `genGear` formula tops out near 18k DPS at Lv150 N+ with +20 stars) | `referenceDps: 18_000`, with the measurement recorded in the rule comment |

## 3. Acceptance results

```sh
node tools/tests/migration_sim.js
node tools/tests/raid_profile_source_sim.mjs
node tools/tests/player_raid_engine_sim.mjs
node tools/tests/raid_api_source_sim.mjs
node tools/tests/raid_ui_sim.js
node tools/tests/ui_sim.js
node tools/tests/api_sim.js
node tools/tests/combat_field_contract_sim.js
```

| Test | Result |
| --- | --- |
| `player_raid_engine_sim.mjs` | **20 passed, 0 failed** |
| `raid_time_model_sim.mjs` | **15 passed, 0 failed** |
| `raid_api_source_sim.mjs` | **12 passed, 0 failed** |
| `raid_ui_sim.js` | **20 passed, 0 failed** |
| `raid_profile_source_sim.mjs` | **9 passed, 0 failed** |
| `migration_sim.js` | **14 passed, 0 failed** |
| `ui_sim.js` | **64 passed, 0 failed** |
| `api_sim.js` | **78 passed, 0 failed** |
| `combat_field_contract_sim.js` | pass (field contract unaffected) |

`social_worker_sim.mjs` needs `miniflare`, which is not installed in this sandbox; it is unrelated to
the raid and was not run here.

### Measured clear times (not deadlines)

The owner's rule: report what the fights actually take, separately from the clock they are allowed.
These are full four-stage clears by the suite's own player loop (`playbase`), which dodges telegraphs,
shoots ritual sources and takes every portal. Seed 3, Lv150 reference gear. **Nothing here is padded and
no minimum duration is enforced.**

| Build | Party | Result | Clear time | HP left | Dodges |
| --- | --- | --- | --- | --- | --- |
| Physical (17,729 DPS) | solo | cleared 4/4 | **383 s** (6:23) | 107,209 / 118,512 | 17 |
| Magic (14,959 DPS) | solo | cleared 4/4 | **373 s** (6:13) | 69,132 / 69,132 | 16 |
| Physical | duo | cleared 4/4 | **382 s** (6:22) | 102,684 / 118,512 | 16 |
| Physical + magic | duo | cleared 4/4 | **363 s** (6:03) | 96,398 / 118,512 | 14 |
| Physical | trio | cleared 4/4 | **376 s** (6:16) | 103,180 / 118,512 | 15 |
| Physical + magic | trio | cleared 4/4 | **375 s** (6:15) | 101,518 / 118,512 | 16 |

For comparison, the run clock is **681 s** and the per-stage budgets are 52 / 67 / 67 / 240 s. So a
competent party finishes with roughly **five minutes of headroom** on the deadline, and a party that
does not react to mechanics is wiped in the sanctuary (asserted in the same suite). The spread between
builds and party sizes is 20 s — the fight is not sensitive to party size, which is what the
HP-scaling-from-party-DPS rule is for.

The earlier target of "~10–15 min" is **not met and is not being forced**: the fight ends when the
boss dies. Padding it would mean raising HP or adding phases, which the owner explicitly ruled out
until correctness was fixed. These are the honest numbers.

### Cadence invariance — measured, not asserted

The property the fixed-cell scheduler exists to provide: **the same seed, profiles and intents produce the
same state at the same simulation instant, no matter how often the run was read.** Measured on a full run
(seed 12345, Lv150 reference Lord Knight, 17,729 DPS, focus re-issued on the 5 s wall clock). "fin" is the
second the run reached its terminal state.

| Read cadence | before (`90b3882`) | after |
| --- | --- | --- |
| 100 ms | dmg 4,511,017 · fin 271.8 s | dmg 4,511,017 · fin 272.4 s |
| 1 s | dmg 4,363,704 · fin 263.0 s | dmg 4,511,017 · fin 272.4 s |
| 2 s | dmg 4,441,321 · fin 265.0 s | dmg 4,511,017 · fin 272.4 s |
| 5 s | dmg 4,363,704 · fin 265.0 s | dmg 4,511,017 · fin 272.4 s |
| 30 s | dmg 4,363,704 · fin 265.0 s | dmg 4,511,017 · fin 272.4 s |

The reviewed build reported **four different runs from one run**. It was only self-consistent at 100 ms,
which no real client polls at. The current build is identical at all five cadences, including the two
coarse ones that matter in production (the 2 s co-op poll and a backgrounded solo tab that resumes after
30 s).

Note the direction of the change: the 100 ms column is the trustworthy one (it is the finest sampling, and
it is the one both builds agree on). Fixing the scheduler makes every coarse reader converge **onto** it,
which is why the post-fix numbers sit at 272.4 s rather than at the old coarse 263–265 s. The reviewed
build's faster-looking clears were under-simulation, not speed.

`solo` and co-op share this scheduler, so the same guarantee covers a solo player whose tab was
backgrounded (the engine catches up cell by cell on resume) and a co-op party whose members poll at
different cadences or disconnect and reconnect.

### The catch-up bound

`advanceRaidRun` stops after `RAID_RULES.maxCatchupEvents` (60,000) resolved cells and returns with
`updatedAt` set to the real cursor, so a bounded read never marks unprocessed time as simulated. Worth
recording, because it changes what a reader should worry about:

| | |
| --- | --- |
| Cells in a full run | 681 s / 100 ms = **6,810** |
| Cap | **60,000** |
| Reachable in a real run | **No** |

A whole run — every cell, from the first swing to the terminal check — is an order of magnitude below
the cap. So in production the loop always completes and a run is never left partially advanced by the
bound. The guard exists to keep a pathological input (a hand-crafted `now` far beyond the deadline, a
corrupted checkpoint) from spinning, not to ration normal play. It is exercised separately and the
honest-cursor property holds on that path too: after a forced bounded pass, `cursorAt <= updatedAt`,
and a second read continues from the real cursor rather than skipping or re-paying the gap.

### What the engine sim actually plays

The two clear tests are not "stand still and win": each runs the client's real loop once per second
per living member — walk out of a sweep/cone, walk into the cataclysm ward, shoot the ritual sources,
walk to and revive a downed teammate, walk through the portal. Outcomes:

| Party | Result | Stage clears |
| --- | --- | --- |
| solo, 12k DPS / 118k HP | cleared in ~374 s | 45 / 103 / 164 s |
| solo, 17.9k DPS / 766k HP | cleared in ~368 s | 42 / 99 / 155 s |
| trio, 12k DPS each | cleared in ~359 s | 45 / 97 / 151 s |
| solo, never reacting | **failed** (wiped in the sanctuary) | — |

### Acceptance matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Four stages, in order, with their own targets | engine sim asserts keys, `targetSeconds` 52/67/67/240, bounds and the boss stage | PASS (sim) |
| Server-owned combat, no client damage | engine sim: auto-attack/skill/pet resolve on the run clock; a `move`/`focus` never deals damage | PASS (sim) |
| A dodgeable telegraph | engine sim: mechanic resolves on its own `endsAt`, only members inside take damage; auto-chase refuses to enter or tunnel | PASS (sim) |
| Downed / revive / wipe | engine sim: a downed member cannot act, a revive beyond 3.2 units is refused, three holds revive, all-downed fails the run | PASS (sim) |
| The ritual can be interrupted | engine sim: the ritual triggers at 70% boss HP with real sources; the clear runs interrupt it | PASS (sim) |
| Fixed timeline | engine sim: `deadlineAt` is exactly `raidRunSeconds()`; API sim: a late snapshot never moves `startedAt`/`deadlineAt` | PASS (sim) |
| Exactly-once entry and settlement | API sim: resumed start, repeated settle, simultaneous starts, ledger/grants, a card miss no longer aborts settlement | PASS (sim) |
| Checkpoint recovery | API sim: a room that forgets the run restores from the D1 checkpoint | PASS (sim) |
| Lobby, party, forge, cards, aura/titles | UI sim (20 assertions) | PASS (sim) |
| Real browser, solo, full clear | `tools/tests/raid_browser_acceptance.cjs` (§3.1): Chromium 131, the built `dist/`, the real Pages handlers, real SQLite behind a D1-shaped binding, the shipped `Social` DO class. **Cleared all four stages in 408 s of run clock with 7,919,183 damage**, 119 dodge moves, 0 downs | PASS (real browser) |
| Zero raid-related DO requests in solo | same run, counted at the service binding: **0** Social fetches for the whole solo run, and no co-op `sync` poll was ever issued | PASS (measured) |
| Settlement recorded exactly once | same run: one `raid_settlements` row, two reward rows, one entry consumed, results screen shows `outcome=clear`; a reload does not spend a second entry | PASS (real browser) |
| Two real browser sessions, co-op | party formed across two independent contexts, both ready, run started, shared enemy/boss HP identical, a teammate focus dealt damage the other client read back, disconnect mid-run, rejoin the SAME run, no second entry, return after the deadline | PASS (real browser) |
| Phone viewport | 390×844: panel usable (**7 actionable controls, minimum 44 px**, no horizontal overflow) **and** a solo run started from it | PASS (real browser) |
| Screenshots of a full clear | `reports/browser-acceptance/*.jpg` — arena mid-run, results, phone | PASS (screenshots) |
| Video of a full clear | Playwright records through an `ffmpeg` binary this sandbox does not have (and its download host is blocked) | **OWNER STAGING** |

## 3.1 Real-browser acceptance (v450)

Everything above this section is Node. This section is not: a real Chromium executed the built site,
and the numbers come from that execution.

```bash
# Chromium comes from the @sparticuz/chromium npm tarball, because the Chrome CDN is unreachable here.
npm install --prefix /tmp/br2 @sparticuz/chromium
node -e "require('/tmp/br2/node_modules/@sparticuz/chromium').inflate('/tmp/br2/chromium')"
LD_LIBRARY_PATH=/tmp/chlibs/lib PG_PLAY_BUDGET_MS=1020000 \
  node tools/tests/raid_browser_acceptance.cjs      # 32 assertions, exits non-zero on any failure
```

**What is real.** `dist/` exactly as `tools/build_site.sh` emits it, served over HTTP; Chromium 131
(real DOM, real ES module loading over the network, real timers, real `fetch`); the Pages Functions
in `functions/api/raid.js` called through their `onRequest` handlers; SQLite databases built by
applying every `migrations/*.sql` in order, behind a binding that implements the D1 statement API and
counts statements/batches/rows; the shipped `Social` Durable Object class from `workers/social/index.mjs`
instantiated over an in-memory storage double; and `assets/raid-engine/raid-engine.js` imported by the
runner over HTTP — the same bytes as `functions/_lib/raid-engine.js` (asserted at runtime).

**What is not real, and is therefore still an owner step.** The Pages/Workers runtime and its CPU
accounting (nothing here is a CPU budget); Durable Object placement, eviction, hibernation and storage
persistence; real D1 latency; WebGL dungeon rendering (no GPU in this build, so the renderer is
exercised for load and state flow, not for pixels); and video capture (no `ffmpeg`).

**How the run is played.** Not by calling engine internals. Inputs go through the client's own entry
points — `PGRaid.move/focus/portal`, i.e. the functions the renderer's click and key handlers call —
and the run advances on the shipped 100 ms loop against the real clock. Nothing advances a fake clock,
so a six-minute fight takes six minutes; the budget is the run's own 681 s deadline plus slack. The
build is not modified: an assertion fetches `assets/raid-engine/raid-engine.js` and checks its
content type and size at runtime.

**Measured, complete runs (the seed is drawn by the server, so these are different fights):**

```text
run A (the recorded acceptance run, 36/36 assertions, EXIT=0):
  cleared after 465 s of run clock, stageIndex 3 (all four maps + Thanatos)
  hp 19,169 / 118,512 at the end — a close finish, not a walkover
  53 dodge moves answering live telegraphs, 571 focus intents, 3 portal presses
  Social DO requests during the solo run: 0
  co-op sync polls during the solo run: 0
  raid_settlements rows: 1 · reward rows: 2 · raid_entries consumed: 1
  reload after the clear: entries still 1, view=results, outcome=clear
  results screen (reports/browser-acceptance/solo-result-desktop.jpg):
    "Thanatos falls. · Dungeon cleared" with the server's own reward rows —
    10 Rift Shards, 4 Valkyrie's Sigils, 2 Astral Shards, 1,000,000 Zeny (clear)
    5 Rift Shards, 2 Valkyrie's Sigils, 1 Astral Shard, 250,000 Zeny (fractured)
    plus a Sovereign Fang card from each chest

run B (an earlier seed): cleared after 408 s, 7,919,183 damage, 119 dodges, 0 downs
run C (a third seed): lost on Thanatos at 524 s with hp 0 after 7,536,476 damage;
                      settled once with outcome=failed and paid the failure table
```

Run C is included on purpose: the script's policy is deliberately simple, and a loss is a legal
outcome. What the acceptance run requires of any seed is that the fight resolves decisively and the
settlement records exactly one outcome with the right shape — which it did in all three.

Two-client co-op in the same run: party formed across two browser contexts, both ready, one start,
identical enemy and boss HP on both clients, a teammate focus dealt damage the other client read back
(1,699,775 → 1,522,608), a teammate move visible to the other client, the run surviving one
disconnect, the returning client rejoining the **same** run id, and `raid_runs` for the returning
account still 1 — reconnecting did not buy a second entry.

**Exactly what "zero raid DO requests" means.** The count is of *raid* traffic to the Social room: no
`install`, no `snapshot` poll, no `action`, no `ack`, and no room alarm — confirmed both by the
service-binding counter (0 fetches) and by the absence of any `"action":"sync"` request. It does **not**
claim the tab opened no socket at all: `PGRaid.open()` still tries to reuse the plaza connection for
party actions (`PGSocial.enter`), which is the existing social session and not raid traffic. A solo run
starts, simulates and settles correctly with that attempt failing; that is the case the API sim covers
(`env.SOCIAL` replaced with an unavailable binding). The distinction matters because the requirement was
"zero raid-related DO requests", not "no Social connection".

**Four defects this found that no Node test could have.** All four are fixed and pinned by tests:

1. **A reloaded tab could not resume its solo run.** The resume path took a synchronous snapshot
   before anything had imported the engine, so it threw `The raid engine is not loaded yet` and
   abandoned a run the account had already paid for. `PGRaidSolo.warm()` now loads the module first;
   `raid_ui_sim.js` pins the ordering.
2. **Every solo run started on 1,000 HP.** The client read `run.members[0].profile`, but `members` is
   the *public* snapshot and has no `profile`, so the engine's floor applied. The reservation now
   carries `run.profile` (the same reason it already carried `seed`), and the client sends it.
3. **The live HUD was replaced by the reservation one frame after start.** The co-op `sync` poller was
   still running during a solo run, and a local reservation was being adopted as run state — `R.run`
   became `{state: undefined}`, the run "ended", and settle was called with no claim (409, no reward).
   The poller now stops for a solo run, and a reservation is reported as `activeReservation`, never as
   `activeRun`.
4. **A clean solo clear was never recorded.** `updateRunOverlay` settled a finished run with no claim,
   which the server correctly rejects as "The run result was not reported." The claim now comes from
   the local run; a co-op settle still sends none, because the room is the authority there.

A fifth finding is smaller but was still a real defect, and only a phone viewport could show it: the
forge's booster rows use `.raid-btn.small` at **36 px**, under the 44 px touch minimum. The earlier
"44 px controls" check passed because those buttons were *disabled* (no weapon equipped) and the check
skipped disabled controls; with an equipped weapon they became actionable and measured 36 px. They are
now 44 px at `max-width:720px` and on any `pointer:coarse` device.

Two failures in earlier iterations were the *test's* fault, not the product's, and are recorded so the
distinction is visible: the co-op start assumed one 400 ms sleep was enough for the room to see the
second member's join (it now waits for the start button to become enabled), and a screenshot of the
results was taken after the reload that returns the page to its sign-in splash (it is now taken before
the reload). Screenshots that do not show the thing they claim to show are worse than no screenshots.

Defects 3 and 4 mean a solo clear in v449 **displayed** but paid nothing. That is the single most
important thing this browser run established.

## 4. Measured resource cost

Instrumented `raid_api_source_sim.mjs` — one two-player start, an action, four stage transitions, a
settlement, a reconnect read, a teammate readback, one rejected install and one room-forgets recovery:

```text
D1 prepared statements: 212
D1 batches:              8
D1 batched rows:         34
Social DO requests:      23
Room run writes:         22
New raid alarm calls:     0
```

- A start is one DO `/raid/install`, one D1 transaction and one checkpoint write; no timer is armed.
- An accepted action is one DO request, one DO storage write of the run, and one D1 checkpoint
  `UPDATE` for paid actions only (movement/focus intents are deliberately not checkpointed), plus one
  existing-socket broadcast.
- A settlement is one DO snapshot plus one DO acknowledgement, then one D1 transaction.
- There is **no** `setAlarm`, `setInterval` network loop or per-tick `send` in the raid code. The
  client polls once every 2 s only while its own run is active and the tab is visible; the room
  advances the run on that read. A 3-second server-side alarm for fully live idle damage would be new
  recurring DO traffic and is **left for explicit owner approval** rather than being smuggled in.

### Solo: measured, and it is a different shape entirely

A solo run is simulated in the browser, so the traffic profile is two requests, total:

```
measured: ONE complete solo run (reserve -> play -> settle)
  Social DO requests: 0        <- the acceptance rule
  D1 statements: 28  · batches: 2 · batched rows: 9
  Pages requests: 2 (start, settle) · completion-validation CPU: 1 bounded claim check
```

Compare with a co-op run, above, where every action and every 2 s read is a DO request. The split is
not a performance tweak; it removes the Durable Object from the solo path completely. The number is
asserted by `tools/tests/raid_api_source_sim.mjs` (which counts every fetch to the SOCIAL binding and
fails if one occurs) and again by the browser-level assertion in `raid_local_solo_sim.mjs`, which
replaces `fetch` and `WebSocket` with throwing stubs for the duration of a run and proves neither is
touched.

**Open owner decision:** if a party closes the tab mid-run, the run stops advancing until someone
reads it again (bounded by `deadlineAt`, so it always resolves). Fixing that needs a per-run alarm;
the cost estimate and the proposal are deliberately *not* implemented here. Solo has no equivalent
gap: the run advances while the tab is foregrounded, and a backgrounded or closed tab resumes from its
checkpoint when reopened, because the engine resolves the elapsed cells on the next read.

## 5. Staging steps (separate reviewable step — not performed)

The owner-run PowerShell handoff is `tools/staging/update-and-stage.ps1`; the walkthrough for a
Windows machine is `docs/RIFT-PROGRESSION-HANDOFF.md`. Migrations already present on staging:
`0022_player_character_raid.sql`, `0023_raid_cards.sql`. **v450 adds no migration** — the script
applies those two only if `pg-staging` is missing them.

The branch already contains the latest `main` (merged at `f648eab`), so the script's step-3 merge is
a no-op. Run it from the checkout, in PowerShell:

```powershell
cd C:\path\to\Prontera-Grind
git status --porcelain                  # must print nothing
npx --yes wrangler@4.154.0 whoami       # must print an account
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\staging\update-and-stage.ps1 -BuildTag haven-v450
```

Needs Git for Windows (`bash.exe`) and node on PATH. It touches only `prontera-grind-staging`,
`prontera-social-staging` and `pg-staging`, and refuses any production name or ID. It also refuses a
dirty checkout, which is why the acceptance driver's PNG captures are now git-ignored.

1. Back up staging D1 and record `BASE_SCHEMA`.
2. Deploy `workers/social` and the Pages Functions to staging with `RAID_ENABLED=true`
   (Pages `prontera-grind-staging`, DO `prontera-social-staging`, D1 `pg-staging`).
3. Run the preflight (it never deploys):
   `RIFT_STAGE_BASE=https://<staging-host> RIFT_STAGE_DB=pg-staging BASE_SCHEMA=<schema> node tools/staging/rift_raid_stage.mjs`
4. Two real browsers: solo clear, failed run/pity, ready invalidation, reconnect.
5. Three real browsers: leader leaves, member leaves, simultaneous start, late action, phone layout.
6. Capture screenshots/video and D1/DO metrics before any production discussion.

Production deployment is not part of this branch. `wrangler.toml` keeps `RAID_ENABLED = "false"`.

### Owner browser checklist

- [ ] Map → Rift Raid and Social Hub → Open Rift Raid both open the same lobby, with entries shown.
- [ ] Solo: the stage header, timer and party strip are readable on a phone; the field chrome is gone.
- [ ] Walking with WASD, arrows, drag and tap all move the hero at a believable speed (not a teleport).
- [ ] A soul-cleave telegraph is walkable out of; the astral cataclysm ward is walkable into.
- [ ] Hitting 70% boss HP starts the Ritual of Ruin; killing both sources interrupts it.
- [ ] Downed state: a living teammate can walk over and revive; a solo down ends the run.
- [ ] Clear: results screen lists real shard/sigil/material/zeny numbers, settles once.
- [ ] Failure: the fractured/pity chest settles once and still names its numbers.
- [ ] Four stages in order, each with its own objective and portal; the boss stage shows Thanatos.
- [ ] Rift Forge: failure keeps stars, a paid booster raises the rate, 20 stars shows Maxed.
- [ ] Cards: a drop appears, Equip moves the gold slot, a second client sees the same account card.
