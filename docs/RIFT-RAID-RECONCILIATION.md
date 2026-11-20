# v449 delivery reconciliation + preservation audit

Branch: `arena/bfc7d4d1-prontera-grind`
This document exists because the delivery was reported against the wrong pull request. It records the
exact commit, proves the 15 earlier commits survived into the final tree, and separates automated
evidence from real multiplayer browser testing.

## 1. Which PR and which commit

| | |
| --- | --- |
| **Correct PR** | <https://github.com/KzeR7/Prontera-Grind/pull/270> |
| Branch | `arena/bfc7d4d1-prontera-grind` |
| **Head SHA (the tested commit)** | `a250ffd` — see §6 for the exact suite results on it |
| Previous remote tip | `4dd545538babe700b2b5a4464eed0e8a102db765` (v448) |
| Base | `main` @ `37a13bf` |
| Commits ahead of `main` | 16 (15 v447/v448 + 1 v449) plus the v449 follow-ups in this revision |

**PR #263 is not this work.** #263 is `arena/6f878512-prontera-grind` @ `6a764fae` — the v411 lane
build. It stays open and untouched; it should be closed as superseded once this is accepted. Nothing
was force-pushed, merged or deployed to reconcile this.

The delivery was reported as "PR #263 → 6a764fa (v411)". That pairing is real but belongs to the old
branch. The v449 rewrites live only on `arena/bfc7d4d1-prontera-grind`.

This revision supersedes the `f979eda` head the report was written against: the scheduler was rewritten
to resolve fixed cells, solo was moved into the browser, and the settlement contract for a solo run was
made explicit. Cloudflare Pages, Workers Builds and CodeRabbit all pass on `a250ffd`.

## 2. Preservation audit of the 15 remote commits (`37a13bf..4dd5455`)

Audited tree-to-tree (`4dd5455` → `f979eda`), not by history.

### 2.1 Nothing was lost

| Check | Result |
| --- | --- |
| Files deleted | **0** |
| Files in the final tree that were in the v448 tree | 12,003 of 12,003 |
| Files added | 2 (`assets/raid-dungeon.js`, `assets/astral-raid-scenes.js`) |
| Files modified | 17 |

### 2.2 Files the 15 commits touched and I did **not** — byte-identical

18 files, all `git diff --quiet` clean, including every migration and every staging tool:

`.gitattributes`, `assets/social.css`, `assets/social.js`, `docs/TESTING.md`, `functions/_lib/db.js`,
`functions/_lib/raid-profile.js`, `functions/api/grants.js`, `functions/api/mailbox.js`,
`migrations/0022_player_character_raid.sql`, `migrations/0023_raid_cards.sql`, `tools/dev_server.js`,
`tools/social/dev-sockets.mjs`, `tools/staging/legacy_raid_upgrade.sql`, `tools/staging/rift_raid_stage.mjs`,
`tools/stamp_engine_sri.js`, `tools/tests/migration_sim.js`, `tools/tests/raid_profile_source_sim.mjs`,
`wrangler.toml`

### 2.3 Progression behaviour verified functionally

Line-matching is not the right test for a rewrite, so the shipped behaviours were asserted directly.
19 of 19 hold:

weapon stars capped at 20 · +2% ATK per star · +1.5% armour penetration per star · forge boosters ·
three raid cards · ranks at 1/3/6/10/15 copies · one equipped card · account-wide card table ·
2 entries per Malaysia day · earned aura mirrored on lobby open · four raid titles (goals 1/3/6/10) ·
pity + fractured chest rolls · exactly-once settlement · checkpoint write · room restore ·
room run persistence · worker raid routes · **zero raid alarms** · v449 build tag in the handoff.

### 2.4 Intentional reversions (and why)

These v448 lines are gone on purpose. Each is the lane arena the v449 rewrite replaced.

| Reverted | Reason |
| --- | --- |
| `assets/rift-raid.js` lane map (~446 lines) | The DOM lane arena, `LANES`/`LANE_LABEL`, `raid-zone`/`raid-pcard-unit`, ember/atlas CSS and the arena raf loop are replaced by the walking dungeon (`raid-dungeon.js`). The lobby, ready/party, forge, cards, aura, titles, results and settlement UI all survive in the same file. |
| `functions/_lib/raid-engine.js` phase model | `raidTotalHp`/`raidPhaseHp`/`raidDurationSeconds` and the `strike|dodge|ward|heal` actions do not describe a four-stage dungeon; replaced by `createRaidRun`/`advanceRaidRun`/`applyRaidAction(move\|focus\|interact\|revive\|dash)`. |
| `functions/_lib/raid-rules.js` phase config | `phaseNames`, `clearTargetSeconds`, `moveCooldownMs` replaced by the stage table, mechanics, ritual and revive rules. |
| `functions/api/raid.js` phase plumbing | `raidTotalHp`/`raidPhaseHp` calls and `phaseHps` in responses; the run clock now comes from `raidRunSeconds()`. |
| `zone` on the action request | A lane is not a destination. The client sends `x`/`z` (move) or `targetId` (focus/interact/revive). |
| Four Rift title descriptions | Ids, names, goals and symbols unchanged; the copy now says "Astral dungeon" instead of "Rift Sovereign". |
| Map-tab and Social-Hub raid copy | Same reason — it described the lane arena. |
| `BUILD`, `?v=` query strings | `haven-v448` → `haven-v449`. |

### 2.5 Unrelated changes accidentally overwritten

**None found.** No non-raid file differs from the v448 tip. The only files in the diff are raid
client, raid server, raid tests, raid docs and the build/handoff metadata that must name the new
build.

## 3. Automated vs real multiplayer evidence

These are deliberately kept apart; the first does not prove the second.

### Automated (Node, no browser, no Cloudflare)

Run against `f979eda`:

```sh
node tools/tests/player_raid_engine_sim.mjs
node tools/tests/raid_api_source_sim.mjs
node tools/tests/raid_profile_source_sim.mjs
node tools/tests/raid_ui_sim.js
node tools/tests/migration_sim.js
node tools/tests/ui_sim.js
node tools/tests/api_sim.js
node tools/tests/combat_field_contract_sim.js
```

Covers: the four stages and their objectives, server-owned combat, dodgeable telegraphs, downed/revive/
wipe, the ritual interrupt, the fixed timeline, exactly-once entries and settlement, checkpoint
recovery, the lobby/forge/card/title UI, and the disconnect/reconnect cases in §4.

### Real browser (one client, local dev server)

Chromium 131 + `puppeteer-core` against `RAID_ENABLED=true node tools/dev_server.js`: lobby → solo
start → walk → zero console errors, with `body.raid-fighting` hiding all ten field-chrome selectors.

### Not yet automated, and not claimed

Two independent browsers completing the raid together, shared boss HP observed in both, consistent
telegraphs across clients, and a reconnection with exactly-once rewards **in a real browser**. The
Node sim drives two and three members through the same server code and the room is exercised through
its real HTTP surface, but that is a simulation of multiplayer, not multiplayer. These remain
**OWNER STAGING BROWSER** items (checklist in `RIFT-RAID-VALIDATION.md` §5).

## 4. Cadence work: what was actually broken, and what is measured now

The read-frequency bug was real and it was in the combat engine, not in the numbers. It is now fixed,
and the fix is measurable rather than asserted.

### 4.1 The freeze

A solo member auto-chasing its own focus target could stop dealing damage entirely while still walking
and still taking hits. Root causes, each confirmed in isolation before being fixed:

* **`walkTotal` was anchored to the raw read time.** A 250 ms cadence moved the walk grid 50 ms per
  call relative to a 2 s cadence, so the same party stood in a different place and ate a telegraph the
  other client dodged. Movement and regen are now settled on an absolute 100 ms grid, and only whole
  elapsed cells are integrated, so the distance walked by time *T* is `floor(T / 100 ms)` cells for
  every cadence.
* **Combat resolved at the raw `at`,** so a swing came due between two grid boundaries and was never
  pairable. Combat, enemy attacks and ritual triggers now resolve at a grid instant, and every member
  cadence is seeded and advanced on that same grid.
* **A due-but-unpayable timer was a permanent event.** `nextMemberEvent` returned timers already behind
  the clock, the loop stepped to "now", nothing could be paid, and it never advanced again. A member
  timer is now an event only while that member is actually in combat range, and every cadence is rolled
  forward to its own next boundary when it cannot be paid — never reset to `now + interval`, which had
  been silently costing one swing each time the party closed on a new target.
* **The chase could deadlock on its own boundary.** `autoApproach` stopped at exactly
  `memberReach * 0.86` while combat required `memberReach + 1.6`, so a member froze one hair outside
  its own attack range. The chase now closes to `memberReach * 0.86 - 0.9`.
* **The tail step and the stage-clear break.** The walk dropped a partial cell, and
  `if (at >= target) break` fired before stage completion when the step landed *on* the target. Both
  are fixed; a stage that clears at the window edge now gets its final pass.

The published symptom — a party that keeps walking, keeps getting hit, and stops dealing damage — no
longer occurs. A solo reference-gear Lord Knight now clears stage 1 and fights on through stage 2 on a
fresh read cadence, and the engine suite runs to completion instead of hanging.

### 4.2 Where cadence invariance stands — resolved

**It is now exact, and it is asserted rather than argued.** `advanceRaidRun` resolves whole
`SIM_TICK_MS` cells chronologically; `run.cursorAt` (last resolved cell) is kept separate from
`updatedAt` (furthest instant observed), so a partial cell is never counted as simulated time and a
bounded catch-up reports the work it actually did.

Measured on a full run (seed 12345, Lv150 reference Lord Knight, 17,729 DPS, focus re-issued on the 5 s
wall clock):

| Read cadence | reviewed build `90b3882` | this branch |
| --- | --- | --- |
| 100 ms | dmg 4,511,017 · fin 271.8 s | dmg 4,511,017 · fin 272.4 s |
| 1 s | dmg 4,363,704 · fin 263.0 s | dmg 4,511,017 · fin 272.4 s |
| 2 s | dmg 4,441,321 · fin 265.0 s | dmg 4,511,017 · fin 272.4 s |
| 5 s | dmg 4,363,704 · fin 265.0 s | dmg 4,511,017 · fin 272.4 s |
| 30 s | dmg 4,363,704 · fin 265.0 s | dmg 4,511,017 · fin 272.4 s |

The reviewed build produced **four different runs from the same run**, and agreed with itself only at
100 ms. This branch produces one. The 100 ms column is the trustworthy one — it is the finest sampling
and the one both builds agree on — so every coarse reader now converges *onto* it; the earlier
"faster" coarse clears were under-simulation, not speed.

`raid_time_model_sim.mjs` encodes the strict property and passes **19 of 19** here, against **11 of 19**
on `90b3882`. `player_raid_engine_sim.mjs` additionally carries a cadence-invariance test that fails on
`90b3882` at the 1 s reader. The property now covers what the split needs it to cover:

- **solo** — a frame loop at any cadence, and a backgrounded tab that resumes after 30 s or after the
  laptop slept, both land in the state a watched tab would have reached;
- **co-op** — members polling at different cadences, and disconnecting and reconnecting, resolve to the
  same party state; returning after the deadline resolves then, on the first successful read.

Four of those recovery assertions were added with this revision and all four fail on `90b3882`.

### 4.3 What is green

engine 20/20 · time model 19/19 · api 14/14 · profile 9/9 · raid_ui 22/22 · local solo 12/12 ·
solo-over-HTTP 6/6 · migration 14/14 · ui 64/64 · api_sim 78/78 · save_format_parity 46/46.

Eight unrelated suites (`publish_sim`, `update_watch_sim`, `panel_layout_smoke`, `plaza_bots_sim`,
`mastery_titles_buffs_sim`, `class_change_sim`, `gear_sim`, `drop_card_sheet_sim`) fail identically on
`90b3882` in a clean worktree; they concern the social runtime, the affix chart and build-tag mirrors,
not the raid, and are not claimed as passing.

## 5. Solo and co-op are now different systems

The split this revision adds is structural, not cosmetic.

| | Solo | Co-op |
| --- | --- | --- |
| Simulation runs in | the browser (`assets/raid-engine/*`, published verbatim from `functions/_lib`) | the Social Durable Object |
| `start` does | one D1 reservation: entry, run id, seed, rules version, profile snapshot | the same, plus a room install |
| Recurring requests | **none** — 2 requests for the whole run (`start`, `settle`) | one 2 s room sync while active and visible |
| Player input goes to | the local engine | the room, as an intent |
| Rewards settle from | a bounded, validated claim (see the completion-validation doc) | the room's authoritative terminal snapshot |
| Recovery | a local checkpoint scoped by account + run id + rules version | a D1 checkpoint the room rebuilds from |

**Measured for one complete solo run:** 0 Social DO requests, 28 D1 statements in 2 batches, 2 Pages
requests. **Zero** is asserted, not estimated: `raid_api_source_sim.mjs` counts every fetch to the
SOCIAL binding, and `raid_local_solo_sim.mjs` runs a whole fight with `fetch`/`WebSocket` replaced by
throwing stubs.

**One engine.** `tools/build_site.sh` copies `raid-engine`, `raid-rules`, `raid-profile`, `save-codec`
and `card-catalog` into `dist/assets/raid-engine/` unmodified. The chain is pure ESM with no Node or
Workers built-ins, which is what lets the browser import it as-is; that constraint is enforced by a
test rather than left to memory. There is no second rule set to drift.

**What that means for a reader of the old docs:** any statement of the form "the raid is
request-driven, so there is no recurring traffic" was true for mechanics resolution and misleading
about the client, which polls a room every 2 s in co-op. It is now stated per mode, and solo genuinely
has no recurring request.

