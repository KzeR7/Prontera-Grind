# Endgame progression and Endless Echo — current design

> **Status — 2026-10-09 (`grind-v91`).** Nightmare field progression is the grind-v90.10 two-tier
> ladder. Endless Echo remains a **180-second (3:00) run**. This revision names the stationary target
> **Lord of Death Illusion**, keeps the darker Echo Court, sets the repeatable ranked payout to
> **1–50 Shards**, and sets the requested store prices. The Refine Scroll is a saved, inert
> placeholder and is not the Drop Protection Scroll; the append-only history remains in `AGENTS.md`
> and `READ-ME-FIRST.md`.

## 1. Endgame field ladder

The game retains ten maps. Normal stages are 1–10. Nightmare stages 11–15 are split into two tiers:
Nightmare Prontera to Payon unlock at Base Lv 120 and drop section 4 (N); Nightmare Comodo to Abyss
unlock at Base Lv 140 and drop section 5 (N+). The Nightmare Gear Token also allows a Base Lv 120+
player to choose a map as the source for one class-usable item, using those same rows. Endless Echo is
a separate practice and DPS-measurement activity, not a replacement for field progression.

## 2. Endless Echo: room, clock and attempts

- **Duration:** exactly 180 seconds. The clock opens at `3:00`; damage is measured over that whole
  interval and divided by 180 for the ranked DPS score.
- **Target:** one infinite-HP dummy named **Lord of Death Illusion**. It does not attack or move, and
  both the player and target stay in place. It uses the existing Lord of Death sprite for a boss
  silhouette, but its combat flag stays `boss:false`; the name and art do not grant boss-damage
  bonuses or skew the DPS test. Niflheim's field boss remains Lord of Death.
- **Practice:** unlimited; no score, repeatable Shards, ranked attempts or first-clear cache progress.
- **Ranked:** two attempts per day, resetting on the existing Asia/Singapore day boundary. Completed
  runs pay the bracket for that run's DPS; a new personal best updates the record but gives no bonus.
- **Early exit:** leaving in the first 10 seconds returns the attempt. Leaving after that spends the
  attempt, records an abandoned run and grants no payout or cache.
- **No trial drops, EXP or Zeny from combat.** The Shard store is an exchange; it does not change the
  dummy into another farm.
- The saved best is the **best single run**, never damage summed across sessions. There is not yet a
  separate public trial leaderboard or weekly season payout; `S.trial` tracks the player's trial
  state.

### Map and entry UI

Endless Echo remains the full-width, centered feature card under the World Map choices. The World Map
tab now uses a tower icon. The lobby separates Ranked attempt, unlimited Training and Shard Store,
and shows the timer and payout ladder before entry.

The Echo Court reuses Niflheim's HD terrain and graveyard billboards, with a broad oval of ruin-cobble
and abyss-stone tiles, a broken-pillared perimeter, a darker violet/slate tint and lower ambient
lighting. The normal Niflheim scenery appears while the art is loading; the active court is rebuilt
when the kit arrives.

## 3. Repeatable ranked payout

The payout is the **single highest bracket reached**, not a sum of all lower brackets. Every completed
ranked run pays from **1 to 50 Echo Shards**. The personal-best record does not add a bonus. One-time
first-clear caches are separate from this repeatable ladder.

| DPS in the 3-minute run | Repeatable Echo Shards |
|---:|---:|
| Completed run (0–99,999 DPS) | 1 |
| 100,000 | 3 |
| 250,000 | 5 |
| 500,000 | 8 |
| 750,000 | 12 |
| 1,000,000 | 16 |
| 1,500,000 | 22 |
| 2,250,000 | 30 |
| 3,000,000 | 40 |
| 4,500,000+ | 50 |

Two top-bracket runs pay up to **100 repeatable Shards per day**. First-clear caches remain separate,
one-time rewards (see below); cache payouts do not repeat on subsequent runs.

## 4. First-clear milestone caches

The seven existing thresholds and their save/index order are unchanged. A ranked run that reaches
several unclaimed marks opens each cache in order; caches can only be claimed once per save.

| DPS threshold | One-time cache |
|---:|---|
| 250,000 | 50,000 Zeny + 5 Oridecon + 5 Elunium |
| 500,000 | 100,000 Zeny + 10 Oridecon + 10 Elunium |
| 1,000,000 | 100 Echo Shards |
| 1,500,000 | 250,000 Zeny + 20 Oridecon + 20 Elunium + 150 Echo Shards |
| 2,250,000 | 250 Echo Shards |
| 3,000,000 | 40 Oridecon + 40 Elunium |
| 4,500,000 | 500 Echo Shards + 30 Oridecon + 30 Elunium |

All seven caches together contain **1,000 one-time Shards, 400,000 Zeny, 105 Oridecon and 105
Elunium**. Their thresholds remain `250000,500000,1000000,1500000,2250000,3000000,4500000` in the
existing saved order.

## 5. Shard Store: prices and what each reward does

The store is repeatable and Shard balance carries over. Prices are:

| Exchange | Cost | Reward |
|---|---:|---|
| Oridecon x5 | 45 Shards | 5 Oridecon |
| Elunium x5 | 45 Shards | 5 Elunium |
| Zeny Cache | 35 Shards | 500,000 Zeny |
| Card Mastery Token | 180 Shards | One token for a permanent-stat roll in the Index |
| Random Legendary Card Voucher | 200 Shards | One random Legendary monster card with a random Legendary stat |
| Nightmare Gear Token | 400 Shards | Choose a map; Base Lv 120+ |
| Refine Scroll | 400 Shards | Inert placeholder; no effect/use yet |

### Random Legendary Card Voucher

A purchase picks one species at random from the full Monster Index roster (field monsters and
bosses), then rolls one stat from the Legendary card stat pool. It adds that Grade 3 / Legendary
card to the player's card collection. It is a random card and random stat—not a Card Mastery Token,
not a guaranteed choice of a specific monster, and not a deterministic voucher.

### Nightmare Gear Token

The player must be **Base Lv 120 or higher**. Buying the token opens a ten-map picker; choosing a map
adds exactly one generated Nightmare item directly to the bag. The item is selected from that map's
class-compatible weapon pool when possible, with armour as the fallback if the class has no matching
weapon. The row follows the live tier split: Nightmare Prontera to Payon give section 4, and Nightmare
Comodo to Abyss give section 5. Quality remains capped by the selected map's normal `dropTier`
progression. The current item selector is deterministic from the character's total kill count, not an
RNG roll. This is a map-source choice, not a random all-map gear box.

### Refine Scroll placeholder

The 400-Shard **Refine Scroll** is intentionally inert until the owner specifies its future use. A
purchase increments a saved reserve count shown in the Refine panel. It currently has no effect, does
not unlock a refine action, and is not consumed by refining; do not infer or add a mechanic yet. It is
not the Drop Protection Scroll, which is still crafted from Nightmare materials and still prevents one
failed +5-or-higher refine from dropping a rank.

## 6. Reward suggestion and guardrails

**Suggested future Shard sink (not implemented): rotating weekly cosmetics or titles**—for example,
a season-themed nameplate, aura or damage-number skin, with older rewards returning in later rotations.
That gives long-term players something to save for without adding another permanent stat or combat
power reward. Future rewards should avoid making direct power increases the only reason to run
Endless Echo.

There is no weekly season reward, trial-only cosmetic or public ranked leaderboard in this build.
Practice remains free, ranked attempts stay capped at two daily, and repeatable Echo Shards come only
from completed ranked brackets; the one-time caches remain separately claimable.
