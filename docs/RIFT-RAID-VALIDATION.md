# Rift Raid — v449 Astral dungeon validation report

Branch: `arena/bfc7d4d1-prontera-grind` (from `main` at `37a13bf`)
Build label: `2026-11-20 haven-v449 Astral dungeon raid`
Feature state: **closed by default** (`wrangler.toml` `RAID_ENABLED = "false"`; the Pages handler
requires the exact string `true`).

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
| Real browser | Chromium 131 + puppeteer-core, dev server on 8799: lobby → solo start → walk to `(0,-6)` → `(-6,-14)`, zero console errors; `body.raid-fighting` hides all ten field-chrome selectors | PASS (local browser), **OWNER STAGING** |
| Phone-sized controls | UI sim checks 44/48 px controls; single-column ≤720 px | PASS (static), **OWNER PHONE** |
| Screenshots/video of a full clear | not capturable at SwiftShader frame rates in this sandbox | **OWNER STAGING** |

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

**Open owner decision:** if a party closes the tab mid-run, the run stops advancing until someone
reads it again (bounded by `deadlineAt`, so it always resolves). Fixing that needs a per-run alarm;
the cost estimate and the proposal are deliberately *not* implemented here.

## 5. Staging steps (separate reviewable step — not performed)

The PowerShell handoff for a Windows machine is in `docs/RIFT-PROGRESSION-HANDOFF.md`. Migrations
already present on staging: `0022_player_character_raid.sql`, `0023_raid_cards.sql`. v449 adds no
migration.

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
