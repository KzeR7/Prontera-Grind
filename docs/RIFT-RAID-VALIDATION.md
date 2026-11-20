# Rift Raid — Stage A/B validation report

Branch: `arena/bfc7d4d1-prontera-grind` (from `main` at `37a13bf`)
Build label: `2026-11-20 haven-v447 Rift stars, cards and earned titles`
Feature state: **closed by default** (`RAID_RULES.enabled = false`, `wrangler.toml` `RAID_ENABLED = "false"`; the Pages handler also requires the exact string `true`).

## 1. Scope delivered

One playable boss encounter for 1–3 player characters:

- Map → **Rift Raid** tab and the **Social Hub** both open the same lobby.
- Solo or a 2–3 character party; eligibility and remaining entries are shown before Ready.
- Readiness is per member; roster or loadout changes clear it.
- Server-owned encounter: HP, phases, lanes, hazards, cooldowns, damage, downing, revive, wipe,
  clear, action receipts and reward rolls all live on the server.
- Exactly two entries per Malaysia calendar day; exactly-once reward settlement through the
  existing `grants` queue.
- Lobby → Arena → Results, with reconnect and D1 checkpoint recovery.

Delivered in v447 (the previously deferred layer):

- **Weapon stars** — 20 maximum, forged from Rift Shards in the raid lobby. Every star grants
  **+2% ATK in all content** (field, raid and any future zone) and **+1.5% defence penetration**
  against the Rift Sovereign (capped at the boss's 30% armour). A failed attempt never removes a
  star. Three optional extra-shard deposits raise the success chance.
- **Raid cards** — three account-wide cards, one equipped slot. Clear/fractured/pity chests each
  drop a card; duplicates add copies and rank the card up (ranks at 1/3/6/10/15 copies).
- **Earned cosmetics** — the Rift Aura on the first qualifying clear, plus four Rift titles in the
  Mastery Index (1/3/6/10 clears). No Cash Shop item, no purchase path.
- Existing persisted records are untouched; the card tables are additive.

## 2. Why this is not PR #263 copied

PR #263 was read as a reference only. The following prototype defects were replaced:

| Prototype | This branch |
| --- | --- |
| `member.maxHp` absent while `profile.maxHp` was used, producing `undefined`/NaN arithmetic | `sanitizeMember` repairs both fields to one finite ceiling before any damage, healing, ward or revive; `sanitizeRaidRun` repairs persisted runs |
| Bag weapons invisible because the lookup read only `eq` and not the packed `inv` | `decodeRaidSave` runs the canonical `unpackSave` codec; the profile reads equipped + bag items |
| Physical-only power approximation with hardcoded STR | 47-row class table (main stat, ATK/MATK multiplier, HP multiplier) + physical/magic power formulas; representative physical and magic builds are tested |
| 15 s Strike / 9 s hive cadence where Dodge queued behind an attack | Separate `strike` (5 s cooldown) and `dodge` action paths; a dodge is an independent request and never waits for an in-flight strike |
| Per-tick timer/DO loop | No raid alarm. Hazards are scheduled from `startedAt` and resolve at their own `endsAt`; quiet clients, late packets and simultaneous deadlines replay the fixed schedule |
| Rewards paid as they were rolled | D1 ledger `UNIQUE(run_id,user_id,kind)` + unique `grants.ref`; retries read back exactly what D1 paid |
| Migration 0018 / build v411 | `migrations/0022_player_character_raid.sql` + `0023_raid_cards.sql`; build `haven-v447` |

## 3. Server architecture

- `functions/_lib/raid-rules.js` — frozen tuning, day key, deterministic reward rolls, rule summary.
- `functions/_lib/raid-profile.js` — class-aware profile v2, canonical save decode, readiness fingerprint.
- `functions/_lib/raid-engine.js` — pure, clock-injected state machine, action receipts, hazard plan.
- `functions/api/raid.js` — auth, feature gate, transactional D1 entry reservation, party readiness,
  action forwarding, checkpoint persistence, settlement and recovery.
- `workers/social/room.mjs` — request-driven run/party state in the existing Durable Object.
- `workers/social/index.mjs` — private `/raid/*` routes and storage keys
  `player-character-raid-v1:*` / `player-character-raid-parties-v1`.
- `migrations/0022_player_character_raid.sql` — accounts, runs, members, entries, settlements,
  chests, reward ledger, entry triggers, reward trigger and `grants.ref`.
- `migrations/0023_raid_cards.sql` — account-wide `raid_cards`, per-chest `raid_card_drops`, the
  duplicate-ranking trigger and the one-equipped-card index.
- `assets/rift-progression.js` — shared star curve/cost/booster table and the field ATK multiplier.
- `assets/rift-raid.js` — lobby/arena/results client, including the Rift Forge and card collection;
  reuses native class preview canvases and the Ascension boss thumb; no second WebGL renderer.
- `assets/mastery-titles.js` — four `raidClears` challenges and the Rift Raid title filter.
- `assets/social.js` — `raid_state` / `raid_party` messages on the existing socket.

### Health contract

- `maxHp` is a finite integer in `[1000, 1e9]`; `hp` is clamped to `[0, maxHp]`.
- Every mutation is a published action ID (`/^[A-Za-z0-9:_-]{8,100}$/`). A replay returns the stored
  receipt and never re-applies damage/healing.
- A player at 0 HP cannot strike, dodge, ward, heal or revive. Only another living member can
  `revive`; the rescued member returns at 20% max HP with a fresh auto-attack clock.
- A failed action still advances the fixed timeline before the refusal is returned.

### Timing

- Deadlines are fixed at install: solo 300 s, group 360 s.
- Hazards first appear at 7.5 s and every 9 s thereafter; each has a 1.5 s telegraph and resolves at
  its own `endsAt`.
- Late snapshots/actions advance through the schedule; they never move `startsAt`, `endsAt`,
  `nextHazardAt` or `deadlineAt` later.
- Catch-up is bounded to 512 events; action receipts are retained for the whole run (512 cap, not a
  rolling window).
- A storage read failure is surfaced as an error; it is never treated as an empty encounter.
- A settlement is recorded in D1 before the DO acknowledges it; the DO retains the terminal run for
  an hour after acknowledgement so a lost response can be retried.
- `GET /api/raid` also returns a 15-minute `lastRun` pointer for a member who was offline at the
  moment of the clear; the client calls the same idempotent settle and shows the D1-paid rewards once.

### Rewards

- Full clear: clear ledger row + fractured chest.
- Failure: pity chest.
- Every chest also rolls one account-wide card. Clear and fractured each roll; pity rolls once.
  `raid_card_drops` has `PRIMARY KEY(run_id,user_id,kind)`, and its trigger increments copies
  only on the first insert, so a replayed settlement cannot award a second card or copy.
- Both reward rows use `INSERT OR IGNORE` with `UNIQUE(run_id,user_id,kind)`; the ledger trigger
  updates `raid_accounts` and inserts ordinary `gift`/`zeny` grants with deterministic `ref` values.
- Rift Shards are recorded in `raid_accounts` and mirrored to `S.riftShards` through a
  `resource:'riftShards'` grant; sigils/materials/zeny use the same direct-apply path.
- Rift Raid grants are the narrow non-expiring exception in `db.js`; every ordinary GM gift keeps
  the five-day rule.

## 4. Migration

Apply **both** raid migrations in order: `0022_player_character_raid.sql` then
`0023_raid_cards.sql`. They are additive, have no self-transaction, and are auto-runnable by
`tools/dev_server.js` and `wrangler d1 execute --file=`.

`0022` adds `grants.ref` and a partial unique index; existing rows have `NULL` refs, so ordinary
grants are unaffected. `0023` adds only the account-wide card collection and card-drop ledger. It
does not alter saves, grants, chests or any existing reward row. Weapon stars are stored on the
weapon item in the normal save (`stars` 0–20), so no migration is needed for them.

## 5. Acceptance results

Run from the repository root:

```sh
node tools/tests/migration_sim.js
node tools/tests/raid_profile_source_sim.mjs
node tools/tests/player_raid_engine_sim.mjs
node tools/tests/raid_api_source_sim.mjs
node tools/tests/raid_ui_sim.js
node tools/tests/ui_sim.js
node tools/tests/api_sim.js
node tools/tests/chatcheck_sim.mjs
node tools/tests/social_handshake_sim.mjs
```

Current results:

| Test | Result |
| --- | --- |
| `migration_sim.js` | **14 passed, 0 failed** (0022 additive install, triggers, exactly-once ledger/grants, 0023 duplicate-safe card copies) |
| `raid_profile_source_sim.mjs` | **8 passed, 0 failed** (47 class rows, star ATK/penetration, card rank effects) |
| `player_raid_engine_sim.mjs` | **14 passed, 0 failed** (includes solo/trio clear pacing and the 30% armour penetration step) |
| `raid_api_source_sim.mjs` | **11 passed, 0 failed** (card drops and the one-equipped-card API) |
| `raid_ui_sim.js` | **11 passed, 0 failed** (forge success/failure, booster cost, aura/titles, card equip, field star ATK, reconnect) |
| `ui_sim.js` | **64 passed, 0 failed** |
| `api_sim.js` | **78 passed, 0 failed** |
| `chatcheck_sim.mjs` | **9 passed, 0 failed** |
| `social_handshake_sim.mjs` | **10 passed, 0 failed** |

The existing `ui_sim.js` initially reported one environment failure in this sandbox because `jsdom`
and `three` were not installed; after installing the documented test dependencies it is 64/64. No
assertion was deleted or loosened.

### Acceptance matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Real hazard damage, healing, downing, revive, wipe; no NaN/null HP | engine sim: fixed hazard resolution, heal/ward/revive, full party wipe, serialized round-trip finite HP | PASS (sim) |
| Quiet clients, late actions, simultaneous mechanic deadlines | engine sim: late snapshot, deadline at fixed timestamp, two actions at one millisecond, 65 receipts | PASS (sim) |
| Physical and magic profiles; current packed saves | engine sim: Lord Knight katar and Warlock staff; `packSave` bag weapon decoded via canonical codec | PASS (sim) |
| Two then three sessions, leader/member disconnect | three jsdom client instances render the same run, keep their own card and survive leader reconnect; no browser binary in this sandbox | PASS (sim), **OWNER STAGING BROWSER** |
| Weapon stars: max 20, all-content ATK, boss defence penetration, no loss on failure, 3 boosters | profile/engine sims assert the 30% armour step and 20-star cap; UI sim forges a failure (star kept) and a success with a paid booster | PASS (sim), **OWNER STAGING** |
| Raid cards: account-wide, one equipped, duplicates rank, drops from all three chest kinds | migration sim (duplicate-safe copies), API sim (drop + equip + unequip), UI sim (rank/equip controls) | PASS (sim), **OWNER STAGING** |
| Earned aura + four titles only | UI sim mirrors `qualifyingClears` into `S.raidClears`, asserts the aura class and the 1/3/6/10 title goals; no purchase path exists | PASS (sim), **OWNER STAGING** |
| Lost-response retries; exactly-once entries/rewards | API source sim: resumed start, repeated settle, simultaneous starts, D1 ledger/grants including mirrored Rift Shards; UI sim applies `riftShards`/`ascMat0/2` directly and keeps Rift Raid out of the expiring mailbox | PASS (sim) |
| Phone-sized controls | UI sim checks 44/48 px controls; CSS uses full-screen overlay and single-column ≤720 px | PASS (static), **OWNER PHONE** |
| Measured DO activity | instrumented source sim (below) | PASS (Node only) |
| Screenshots/video of lobby → fight → reconnect → results | not capturable in this sandbox | **OWNER STAGING** |

## 6. Measured resource cost

Instrumented `raid_api_source_sim.mjs` for one two-player start, one strike, one settlement, a
reconnect read, a teammate readback, one rejected room install, and one room-forgets-the-run recovery:

```text
D1 prepared statements: 202
D1 batches:              8
D1 batched rows:         34
Social DO requests:      19
Room run writes:         10
New raid alarm calls:     0
```

Interpretation:

- A start is one DO `/raid/install`, one D1 transaction (run + members + entries) and one checkpoint
  update; no timer is armed.
- Each accepted action is one DO request, one DO storage `put` of the run, one D1 checkpoint
  `UPDATE`, and one existing-socket broadcast. The broadcast replaces polling, not adds a timer.
- A settlement is one DO snapshot plus one DO acknowledgement; D1 writes the account/contribution/
  settlement/ledger/chest rows in one transaction.
- There is **no** `setAlarm`, `setInterval` network loop, or per-tick `send` in the raid code.
  Automatic attacks and hazards advance on the next action, snapshot or settlement. A player who
  stops interacting sees the resolved timeline when they next read/settle; the client never polls.
  Adding a 3-second alarm for fully live idle damage would be new recurring DO traffic and is left
  for explicit owner approval rather than being smuggled into this branch.
- A six-minute solo run with one action every 2 s is bounded by ~180 DO requests, ~180 DO puts and
  ~180 D1 checkpoint updates, plus start/settle. The UI does not poll; reconnect reads one snapshot.

Hosted Cloudflare CPU, D1 row-write counts and DO duration must still be recorded on staging; the
numbers above are Node-simulator measurements, not production telemetry.

## 7. Staging steps (separate reviewable step — not performed)

The copy-paste Windows handoff (update local `main`, merge this branch in a temporary worktree,
apply only 0022 + 0023, deploy staging) is in
[`docs/RIFT-PROGRESSION-HANDOFF.md`](RIFT-PROGRESSION-HANDOFF.md).

1. Back up staging D1 and record `BASE_SCHEMA`.
2. Apply `migrations/0022_player_character_raid.sql` and then `migrations/0023_raid_cards.sql` to `pg-staging` (in that order).
3. Deploy `workers/social` and the Pages Functions to staging with `RAID_ENABLED=true`.
4. Run the preflight (it never deploys):

```sh
RIFT_STAGE_BASE=https://<staging-host> \
RIFT_STAGE_DB=pg-staging \
BASE_SCHEMA=<recorded-schema> \
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
node tools/staging/rift_raid_stage.mjs
```

5. Two real browsers: solo clear, failed run/pity, ready invalidation, reconnect.
   The preflight can be rehearsed against localhost with
   `RIFT_STAGE_BASE=http://127.0.0.1:8799 BASE_SCHEMA=x node tools/staging/rift_raid_stage.mjs`;
   it passes locally (including `/api/chatcheck` reaching the Social room).
6. Three real browsers: leader leaves, member leaves, simultaneous start, late action, phone layout.
7. Capture screenshots/video and D1/DO metrics before any production discussion.

Production deployment is not part of this branch. `wrangler.toml` keeps `RAID_ENABLED = "false"`.

### Owner browser checklist

- [ ] Map → Rift Raid shows entries and eligibility before Ready.
- [ ] Social Hub → Open Rift Raid opens the same lobby.
- [ ] Solo: lane telegraph is readable on a phone; Dodge works while a Strike request is in flight.
- [ ] Party of two: roster change clears Ready; loadout change clears Ready.
- [ ] Leader disconnects/reconnects: same run, HP, phase, receipts and deadline.
- [ ] Member disconnects/reconnects: same arena; no duplicate entry.
- [ ] Kill the room tab/worker: reconnect restores from checkpoint; a failed storage read does not
      silently start a new encounter.
- [ ] Clear: result settles once; rewards appear once in the existing grant flow.
- [ ] Failure: pity chest settles once.
- [ ] Rift Forge: select the standard attempt and each of the three extra-shard deposits; a failure
      keeps the star count and only spends shards; a success adds exactly one star.
- [ ] At 20 stars the Forge shows Maxed; the field Character sheet shows the star line and the
      weapon’s ATK rises everywhere (not just in the raid).
- [ ] Rift Raid cards: the result shows the dropped card, the lobby shows copies/rank, Equip moves
      the gold slot, and a second client sees the same account card.
- [ ] First clear: the Rift Aura appears around the portrait; Mastery Index → Rift Raid shows the
      earned title and the next clear goal.
- [ ] Repeat a settlement request / retry after a lost response: no second reward.
- [ ] Phone viewport: no horizontal overflow; lane/action buttons ≥44 px.
- [ ] Record DO request count, DO storage ops, D1 rows and screenshots.

## 8. Known gaps / risks

1. **No browser screenshots or video in this sandbox.** No Chromium/Playwright browser binary is
   available, so the visual acceptance remains owner-run on staging.
2. **No hosted Cloudflare measurement.** The Node instrumentation proves the code path and absence
   of alarms, but hosted DO duration/storage and D1 row writes need staging telemetry.
3. **Checkpoint gap.** If the DO accepts an action and the process dies before the Pages checkpoint
   write, the next restore uses the previous checkpoint (or the install payload if the very first
   install response was lost). The run, roster, phase and deadline remain; at most the last action's
   receipt can be replayed. The normal path writes the checkpoint before returning the action.
4. **One world-party lobby.** The existing Social room supports one raid party at a time; this is
   sufficient for acceptance (1–3 characters) but is not a multi-party matchmaker.
5. **No idle tick.** Automatic attacks/hazards resolve on the next request by design (no alarm and
   no client polling). If the owner wants the arena to visibly tick while every player is idle,
   that requires either a DO alarm or a periodic socket message and must be approved separately.
6. **UI uses the existing plaza socket for live party updates.** Opening the lobby enters the plaza
   (the existing renderer), not a second WebGL context. Solo play does not require the plaza scene.
7. **Party material bonus is applied** to shards, sigils and regional materials with a
   server-side stochastic rounding roll. It is not applied to zeny.
8. **Star and card numbers are v1 tuning.** 20 stars at +2% ATK/+1.5% penetration, the 8→26 shard
   base cost and the 10/24/42-point booster steps are deliberately conservative; the owner should
   measure a few clears before treating them as final. Card effects are snapshotted at run start;
   equipping a card mid-run does not change that run.
9. **Star forging is a save progression path, like refine.** It spends the mirrored `S.riftShards`
   and writes `weapon.stars` into the normal save; it is not a second server purchase ledger. A
   hand-edited save can therefore claim stars, the same trust boundary as refine. Card ownership is
   D1-owned and cannot be forged by the client.
