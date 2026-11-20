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
| **Head SHA (the tested commit)** | `f979eda302f51b72b49a4647ba541d6816ceb959` |
| Previous remote tip | `4dd545538babe700b2b5a4464eed0e8a102db765` (v448) |
| Base | `main` @ `37a13bf` |
| Commits ahead of `main` | 16 (15 v447/v448 + 1 v449) |

**PR #263 is not this work.** #263 is `arena/6f878512-prontera-grind` @ `6a764fae` — the v411 lane
build. It stays open and untouched; it should be closed as superseded once this is accepted. Nothing
was force-pushed, merged or deployed to reconcile this.

The delivery was reported as "PR #263 → 6a764fa (v411)". That pairing is real but belongs to the old
branch. The v449 rewrites live only on `arena/bfc7d4d1-prontera-grind` at `f979eda`.

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

### 4.2 Where cadence invariance stands

Measured over 100 / 250 / 1000 / 2000 / 5000 / 30000 ms reads and 100–681 s windows:

| | committed `f979eda` | this branch |
|---|---|---|
| auto-attacks paid, window to 15 s | 12 / 11 / **9** | 11 / 12 / 12 |
| outcome differences across cadences | yes | fewer, and no freezes |

The committed engine loses **three swings** between a 100 ms poll and a 5 s read. This branch loses at
most one, and never in total damage. Residual differences are in *which* enemy an in-progress party is
mid-kill on at the comparison instant, not in whether the run progresses — every cadence examined
reaches the same stage and the same total damage.

Cadence invariance is **not yet exact** and is not claimed as exact. `raid_time_model_sim.mjs` encodes
the strict version of the property and passes 8 of 14; the committed engine passes 10 of 14. Those six
tests are a target, not a regression.

### 4.3 What is green

engine 19/19 · api 12/12 · profile 9/9 · raid_ui 20/20 · migration 14/14 · ui 64/64 · api 78/78.
`raid_api_source_sim` (was 9/12) and `raid_profile_source_sim` (was 0/9) are both fully green now.
