# Endgame rewards — Nightmare Abyss boss vs the two newest maps

**Read-only measurement. No game balance, constant or save was changed.** Build `2026-10-22 haven-v209`.
Every number comes from the live code through `tools/compare_endgame_rewards.js`; re-run that command to
regenerate this report's tables.

## What is compared

* **Nightmare Abyss (map 9)**, Stages 11-15, and the **Stage 15 Dark Lord wave** in detail.
* **The two newest maps — Astral Citadel (map 10) and Thor Volcano (map 11)**, Stages 1-5 including both
  Stage 5 boss waves. These are the Ascension fields and the only maps added after the ten-map Nightmare
  band, so they are the "2 new maps" this report reads.
* **Every Nightmare Stage 15 MVP**, so the Abyss boss can be read against its own band.

## How to read the numbers

* **EXP is what the player is paid at Base Lv 100+**, i.e. the raw reward times `expRate()` = 7/3 = 2.333.
  Zeny is the expected payout including the Nightmare/Ascension payout roll (`nmZenyRoll`, mean 0.675).
* **EXP / M HP** and **Zeny / M HP** are the balance ratios: time per kill follows monster HP, so at a
  fixed DPS they are proportional to EXP/min and Zeny/min. They are the fair way to compare a 55k HP mob
  with a 111M HP MVP.
* **Kills / level** divides `needAt(150)` = 2,497,000 EXP by one kill. It measures how many swings of
  farming a level takes, but it also just measures monster HP, so read it next to EXP / M HP.
* The **1M DPS tables** convert the ratios into seconds, EXP/min and Zeny/min. 1M DPS is an illustration,
  not a measured build; the ratios between fields are the point.
* Boss wave rows are the MVP plus its escorts (3 escorts on maps 0-4, 5 on maps 5-11). An MVP carries
  about 70% of its wave's HP on the normal fields and 75% of it in Nightmare, but pays 63% of the wave's
  EXP on Abyss Stage 10 and only 20% on Nightmare Abyss 15.

## What the code is aiming at

`tools/tests/nightmare_sim.js` records the intended yardsticks: Abyss Stage 10 mobs pay 1,953 raw EXP per
million HP, the Abyss Stage 10 **MVP wave is "the exp-optimal camp" at 3,610 paid EXP per million HP**, and
the Nightmare capstone was meant to land near that parity (2,145-2,236 raw per million HP before the v89
+30% Stage 15 HP buff, 1,650-1,720 after it). The same test says: *"Any EXP/Zeny rebalance of Stage 5 is the
owner's call."* That call is what this report serves.

EXP is shown as paid at Base Lv 100+ (expRate 2.333x). Zeny is the expected payout including the Nightmare/Ascension roll. One level at Base 150 costs 2,497,000 EXP.

## Reference — Abyss Stage 10 (normal cap)

| Field | Power | Mob HP | Mob ATK | Mob EXP | Mob Zeny | EXP / M HP | Zeny / M HP | Kills / level |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Abyss S10 | 99 | 55,286 | 2,159 | 252 | 73 | 4,558 | 1,318 | 9909 |

## Nightmare Abyss, Stages 11-15

| Field | Power | Mob HP | Mob ATK | Mob EXP | Mob Zeny | EXP / M HP | Zeny / M HP | Kills / level |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Abyss NM11 | 168 | 5,277,611 | 7,295 | 8,941 | 842 | 1,694 | 159 | 279 |
| Abyss NM12 | 171 | 5,400,454 | 7,425 | 13,774 | 1,090 | 2,550 | 202 | 181 |
| Abyss NM13 | 174 | 5,523,945 | 7,554 | 18,851 | 1,355 | 3,413 | 245 | 132 |
| Abyss NM14 | 177 | 5,648,076 | 7,684 | 24,176 | 1,635 | 4,280 | 290 | 103 |
| Abyss NM15 | 180 | 7,504,693 | 10,157 | 27,116 | 1,933 | 3,613 | 258 | 92 |

## Nightmare Abyss Stage 15 — the Dark Lord wave

| Field | Escorts | Wave HP | Wave EXP | Wave Zeny | MVP share of EXP | EXP / M HP | Zeny / M HP |
|---|---:|---:|---:|---:|---:|---:|---:|
| Abyss NM15 | 5 | 149,200,446 | 169,486 | 27,247 | 20% | 1,136 | 183 |

## Astral Citadel, Stages 1-5

| Field | Power | Mob HP | Mob ATK | Mob EXP | Mob Zeny | EXP / M HP | Zeny / M HP | Kills / level |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Astral Citadel S1 | 140 | 15,009,386 | 15,235 | 81,347 | 5,026 | 5,420 | 335 | 31 |
| Astral Citadel S2 | 142 | 22,514,079 | 19,298 | 108,463 | 5,277 | 4,818 | 234 | 23 |
| Astral Citadel S3 | 145 | 33,771,118 | 24,376 | 135,578 | 5,529 | 4,015 | 164 | 18 |
| Astral Citadel S4 | 148 | 48,780,504 | 30,471 | 176,253 | 5,780 | 3,613 | 118 | 14 |
| Astral Citadel S5 | 149 | 33,771,118 | 38,596 | 216,925 | 6,031 | 6,423 | 179 | 12 |

## Thor Volcano, Stages 1-5

| Field | Power | Mob HP | Mob ATK | Mob EXP | Mob Zeny | EXP / M HP | Zeny / M HP | Kills / level |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Thor Volcano S1 | 150 | 52,532,851 | 40,628 | 189,810 | 6,031 | 3,613 | 115 | 13 |
| Thor Volcano S2 | 152 | 67,542,237 | 48,753 | 230,484 | 6,408 | 3,412 | 95 | 11 |
| Thor Volcano S3 | 155 | 82,551,623 | 56,879 | 271,157 | 6,785 | 3,285 | 82 | 9 |
| Thor Volcano S4 | 158 | 105,065,702 | 67,036 | 325,388 | 7,162 | 3,097 | 68 | 8 |
| Thor Volcano S5 | 159 | 67,542,237 | 81,256 | 406,735 | 7,539 | 6,022 | 112 | 6 |

## The two newest maps' Stage 5 boss waves

| Field | Escorts | Wave HP | Wave EXP | Wave Zeny | MVP share of EXP | EXP / M HP | Zeny / M HP |
|---|---:|---:|---:|---:|---:|---:|---:|
| Astral Citadel S5 | 5 | 371,482,301 | 1,952,328 | 85,009 | 44% | 5,256 | 229 |
| Thor Volcano S5 | 5 | 742,964,607 | 3,660,615 | 106,262 | 44% | 4,927 | 143 |

## At a steady 1M DPS — regular mobs (illustration)

Seconds per kill is the monster HP divided by 1M DPS. Real builds differ; the ratios between fields are what the table shows. Abyss Stage 10 is left out: a 55k HP mob dies inside one attack, so its real rate is set by attack cadence, not HP.

| Field | HP | Seconds | EXP / min | Zeny / min |
|---|---:|---:|---:|---:|
| Abyss NM11 | 5,277,611 | 5.3 | 101,652 | 9,569 |
| Abyss NM12 | 5,400,454 | 5.4 | 153,028 | 12,112 |
| Abyss NM13 | 5,523,945 | 5.5 | 204,756 | 14,714 |
| Abyss NM14 | 5,648,076 | 5.6 | 256,820 | 17,374 |
| Abyss NM15 | 7,504,693 | 7.5 | 216,790 | 15,455 |
| Astral Citadel S1 | 15,009,386 | 15.0 | 325,185 | 20,091 |
| Astral Citadel S2 | 22,514,079 | 22.5 | 289,053 | 14,063 |
| Astral Citadel S3 | 33,771,118 | 33.8 | 240,877 | 9,823 |
| Astral Citadel S4 | 48,780,504 | 48.8 | 216,791 | 7,109 |
| Astral Citadel S5 | 33,771,118 | 33.8 | 385,404 | 10,715 |
| Thor Volcano S1 | 52,532,851 | 52.5 | 216,790 | 6,888 |
| Thor Volcano S2 | 67,542,237 | 67.5 | 204,747 | 5,693 |
| Thor Volcano S3 | 82,551,623 | 82.6 | 197,082 | 4,931 |
| Thor Volcano S4 | 105,065,702 | 105.1 | 185,820 | 4,090 |
| Thor Volcano S5 | 67,542,237 | 67.5 | 361,316 | 6,697 |

## At a steady 1M DPS — boss waves

| Field | HP | Seconds | EXP / min | Zeny / min |
|---|---:|---:|---:|---:|
| Abyss NM15 wave | 149,200,446 | 149.2 | 68,158 | 10,957 |
| Astral Citadel S5 wave | 371,482,301 | 371.5 | 315,330 | 13,730 |
| Thor Volcano S5 wave | 742,964,607 | 743.0 | 295,622 | 8,581 |

## Every Nightmare Stage 15 MVP (context)

| Field | MVP | MVP HP | MVP ATK | MVP EXP | MVP Zeny | EXP / M HP | Zeny / M HP |
|---|---|---:|---:|---:|---:|---:|---:|
| Prontera NM15 | Mastering | 19,594,285 | 3,388 | 7,096 | 3,856 | 362 | 197 |
| Izlude NM15 | Drake | 22,946,881 | 3,951 | 8,314 | 4,515 | 362 | 197 |
| Geffen NM15 | Baphomet | 26,409,285 | 4,528 | 9,564 | 5,197 | 362 | 197 |
| Morroc NM15 | Phreeoni | 29,982,153 | 5,119 | 10,857 | 5,900 | 362 | 197 |
| Payon NM15 | Eddga | 33,666,131 | 5,724 | 12,194 | 6,625 | 362 | 197 |
| Comodo NM15 | Kraken | 49,020,325 | 7,992 | 18,611 | 9,646 | 380 | 197 |
| Louyang NM15 | Dragon Lord | 58,694,370 | 9,535 | 22,279 | 11,550 | 380 | 197 |
| Amatsu NM15 | Shiranui | 68,638,365 | 11,112 | 26,045 | 13,507 | 379 | 197 |
| Niflheim NM15 | Lord of Death | 78,853,659 | 12,721 | 29,920 | 15,517 | 379 | 197 |
| Abyss NM15 | Dark Lord | 111,676,981 | 14,364 | 33,908 | 17,581 | 304 | 157 |

## MVPs on the compared fields

| Field | MVP | MVP HP | MVP ATK | MVP EXP | MVP Zeny | EXP / M HP | Zeny / M HP |
|---|---|---:|---:|---:|---:|---:|---:|
| Abyss NM10 | Dark Lord | 658,173 | 3,055 | 2,114 | 1,329 | 3,212 | 2,020 |
| Abyss NM15 | Dark Lord | 111,676,981 | 14,364 | 33,908 | 17,581 | 304 | 157 |
| Astral Citadel S5 | Memory of Thanatos | 202,626,711 | 115,789 | 867,701 | 54,854 | 4,282 | 271 |
| Thor Volcano S5 | Ifrit | 405,253,422 | 182,826 | 1,626,940 | 68,567 | 4,015 | 169 |


## What the numbers say

**1. The Nightmare MVP is the one real outlier.** Dark Lord on Nightmare Abyss 15 has **111,676,981 HP and
pays 33,908 EXP** — **304 EXP per million HP**, the worst MVP in the game, and every Nightmare MVP is the
same shape:

| MVP | HP | EXP | EXP / M HP |
|---|---:|---:|---:|
| Nightmare Prontera 15 (Mastering) | 19,594,285 | 7,096 | 362 |
| Nightmare Niflheim 15 (Lord of Death) | 78,853,659 | 29,920 | 379 |
| Nightmare Abyss 15 (Dark Lord) | 111,676,981 | 33,908 | **304** |
| Abyss 10 (normal Dark Lord) | 658,173 | 2,114 | 3,212 |
| Astral Citadel 5 (Memory of Thanatos) | 202,626,711 | 867,701 | 4,282 |
| Thor Volcano 5 (Ifrit) | 405,253,422 | 1,626,940 | 4,015 |

Nightmare mobs on the same maps pay 3,448-3,614 per million HP, so the whole band's MVPs sit at **0.105**
of their own mobs' rate, and the Abyss boss at **0.084** because it also carries the extra 1.25x Dark Lord
HP from v198. Outside Nightmare an MVP pays about **0.67-0.70** of its mobs' rate (Abyss 10: 0.70,
Astral 5: 0.67, Thor 5: 0.67), which is the convention the band does not follow.

**2. The Stage 15 wave pays a quarter of what the game calls optimal.** The Dark Lord holds **74.8% of the
wave's HP but pays 20% of its EXP**, so the full wave (149.2M HP) returns **169,486 EXP = 1,136 per million
HP** against the 3,610 the code calls "the exp-optimal camp" — **0.31x**.

The cause is one line in `fieldExpReward`: at Stage 15 the wave budget is redistributed with
`escort = floor(budget / (escorts + 1.25))`, which pays the MVP only **1.25x an escort**. The MVP has
**14.9x an escort's HP** (500/42 = 11.9x, plus the 1.25x Dark Lord bump). So the tougher the MVP, the worse
it pays per HP.

**3. At equal DPS the mobs are fine; the MVP wave is not.** At a steady 1M DPS:

| Camp | EXP / min | Zeny / min |
|---|---:|---:|
| Nightmare Abyss 15 — regular mob | 216,790 | 15,455 |
| Astral Citadel 1 — regular mob | 325,185 | 20,091 |
| Astral Citadel 5 — regular mob | 385,404 | 10,715 |
| Thor Volcano 5 — regular mob | 361,316 | 6,697 |
| **Nightmare Abyss 15 — boss wave** | **68,158** | 10,957 |
| Astral Citadel 5 — boss wave | 315,330 | 13,730 |
| Thor Volcano 5 — boss wave | 295,622 | 8,581 |

The two newest maps' mobs are 1.5-1.8x the Nightmare Abyss mob, which is a reasonable endgame step. The
Nightmare **boss wave is 4.4x below** the new maps' boss waves.

**4. Stage 15 mobs pay a little less per HP than Stage 14.** Stage 15 adds the v89 `NM15_BUFF` of +30% HP
and ATK but only +12% EXP, so mob EXP per million HP falls from **4,280 (NM14) to 3,613 (NM15)**, and Zeny
from 290 to 258. `nightmare_sim.js` already notes this was never retuned and leaves it to you.

**5. Zeny is not the problem — it is a different shape.** Nightmare Abyss 15 pays **1,933 Zeny a kill**
(26.5x Abyss Stage 10's 73) and **15.5k Zeny a minute** at 1M DPS, mid-pack among the new maps (Astral
Citadel 1 pays 20.1k, Thor Volcano 4 pays 4.1k). Per HP it looks low (258 per million against Abyss
Stage 10's 1,318) only because Zeny does not scale with monster HP — that is the v172 decision, and per
minute it holds up. The real Zeny dip is **Thor Volcano 3-4** (82 and 68 Zeny per million HP, 4.1k a
minute) because those stages add 25% HP for 6% Zeny.

**6. Kills per level at 150** are 92 on Nightmare Abyss 15, 31-12 on Astral Citadel, 13-6 on Thor Volcano.
That looks dramatic but is mostly the HP difference (7.5M against 15-105M); per HP the gap is the 1.5-1.8x
above.

**7. Inside the new maps, Stage 4 is the weakest stage to farm.** EXP per million HP falls S1 to S4
(Astral 5,420 → 3,613, Thor 3,613 → 3,097) and then jumps at Stage 5, where the v191 change halves escort
HP. Stage 1 and Stage 5 are the efficient camps; Stage 4 is the trap.

## Readjust options — Nightmare Stage 15

Paid values for Nightmare Abyss 15; the same change applies to all ten Nightmare maps. "vs S10 wave"
compares with the 3,610 EXP per million HP the test calls the exp-optimal camp.

| Package | Change | MVP HP | MVP EXP | MVP EXP / M HP | MVP Zeny / M HP | Wave EXP | Wave EXP / M HP | vs S10 wave |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| — | current (MVP = 1.25x escort, `NMBOSSHP` 48) | 111,676,981 | 33,908 | 304 | 157 | 169,486 | 1,136 | 0.31x |
| **A1** | MVP pays 10x an escort (HP unchanged) | 111,676,981 | 271,157 | 2,428 | 157 | 406,735 | 2,726 | 0.76x |
| **A2** | MVP pays 15x an escort (HP unchanged) | 111,676,981 | 406,735 | 3,642 | 157 | 542,313 | 3,635 | 1.01x |
| **B1** | `NMBOSSHP` 48 → 24, MVP 5x an escort | 55,838,491 | 135,578 | 2,428 | 315 | 271,157 | 2,904 | 0.80x |
| **B2** | `NMBOSSHP` 48 → 24, MVP 7.5x an escort | 55,838,491 | 203,368 | 3,642 | 315 | 338,946 | 3,630 | 1.01x |
| **C** | `NMBOSSHP` 48 → 24 only (MVP stays 1.25x) | 55,838,491 | 33,908 | 607 | 315 | 169,486 | 1,815 | 0.50x |

Read it this way:

* **A1** is the smallest change that makes the MVP worth its HP (0.67x of its mobs' rate — exactly the
  convention every other MVP follows). It keeps the 12x-mob boss fight, but the "whole wave raw EXP
  unchanged" rule stops applying, so `mvp_exp_sim.js`'s assertion has to be restated.
* **A2** is full parity with the game's own exp-optimal camp, at the cost of a 3.2x wave EXP budget.
* **B2** reaches the same parity by halving the fight (149s → 93s at 1M DPS) instead of inflating the
  payout. It also fixes the MVP's low Zeny per HP (157 → 315, in line with the 1.5x boss convention)
  without touching any Zeny constant. It breaks the 500/42 = 11.9x "MVP is 12x a mob" HP convention.
* **C** is the cheapest fix if the Dark Lord fight simply feels too long: it halves HP with no reward
  change, which gets the boss to 607 and the wave to 1,815 per million HP.

Two smaller dials, independent of the packages:

* **Stage 15 mob top-up (D):** `nmExpOf(15)` 48 → 58 (+21%) lifts Nightmare Stage 15 mobs from 3,613 to
  about 4,274 EXP per million HP, restoring the Stage 14 parity that the v89 +30% HP buff removed. It
  costs about +18% EXP on the whole Stage 15 wave.
* **Nothing for Zeny** is needed on the Nightmare band; the rates hold up per minute. If Thor Volcano 3-4
  should pay for their HP, that is an `ascZenyBonus` change (currently 2.7-2.85x, times the 1.3 global
  Ascension factor), not a Nightmare change.

## Scenario: Dark Lord HP −30% (requested, not applied)

Rewards stay exactly as they are; only Nightmare Abyss Stage 15's MVP loses 30% of its HP
(`111,676,981 → 78,173,887`). The escorts, their pay, the MVP's EXP (33,908) and Zeny (17,581) and its
14,364 ATK are unchanged.

| Cut | MVP HP | MVP sec¹ | MVP EXP / M HP | MVP Zeny / M HP | Wave HP | Wave sec¹ | Wave EXP / M HP | vs exp-optimal² | Wave EXP / min¹ | Wave Zeny / min¹ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| none | 111,676,981 | 111.7 | 304 | 157 | 149,200,446 | 149.2 | 1,136 | 0.31x | 68,158 | 10,957 |
| −20% | 89,341,585 | 89.3 | 380 | 197 | 126,865,050 | 126.9 | 1,336 | 0.37x | 80,157 | 12,886 |
| **−30%** | **78,173,887** | **78.2** | **434** | **225** | **115,697,352** | **115.7** | **1,465** | **0.41x** | **87,895** | **14,130** |
| −50% | 55,838,491 | 55.8 | 607 | 315 | 93,361,956 | 93.4 | 1,815 | 0.50x | 108,922 | 17,510 |

¹ at an illustrative 1M DPS, so the wave drops from about 2.5 minutes to about 1.9 minutes.
² the 3,610 EXP per million HP `nightmare_sim.js` calls the exp-optimal camp (Abyss Stage 10 MVP wave).

What a 30% cut does and does not do:

* **It is a real gain, but a partial one.** Wave income per minute rises 29% (68,158 → 87,895 EXP/min and
  10,957 → 14,130 Zeny/min) and the MVP's own rate rises from 304 to 434 EXP per million HP. The wave is
  still 0.41x of the game's own optimal camp and the MVP still pays **0.12** of its mobs' rate, against the
  0.67-0.70 every other MVP pays. Reaching full parity by HP alone would need about **−92%**
  (9.4M HP), which is why this is a nudge and not a fix.
* **The deepest map stops having the tankiest MVP.** At −30% the Dark Lord (78.2M HP) is level with
  Niflheim's Nightmare MVP, Lord of Death (78.9M), while still paying 13% more EXP and swinging 13% harder
  (14,364 against 12,721 ATK). If Abyss should stay visibly the deepest map, a −15% to −20% cut keeps that
  ordering.
* **Material farming speeds up.** Void Core drops from this boss only, at 1% a kill, so a 30% shorter fight
  is roughly 1.4x more attempts an hour, and each attempt costs 30% less incoming damage because ATK does
  not change.

Implementation is one line: `spawn()` currently gives this boss `Math.floor(baseHp*1.25)`; a 30% cut is
`Math.floor(baseHp*0.875)`. `tools/tests/encounter_retune_sim.js` pins the current `×1.25`, so its
expectation (and its summary line) changes with it; no other suite pins the Dark Lord's HP.


## Caveats

* This is a static measurement at Base Lv 150 with ordinary rewards, no pets, no gear, no card bonuses and
  no player death risk. It says nothing about whether a build survives these fields.
* 1M DPS is an illustration. Real DPS differs by class and gear, and low-HP camps are limited by attack
  cadence rather than HP, which is why Abyss Stage 10 is left out of the pacing tables.
* Zeny expectations are sampled over 20,000 rolls with a fixed sequence, so they are reproducible to the
  Zeny; the underlying game rolls are random per kill.
* The design comment above `NMHP` in `index.html` is stale: it still describes a 5.57M HP Nightmare Abyss
  mob and a 66.3M HP boss paying 9.3x a Stage 10 mob. The live numbers are 7.50M HP and 111.68M HP, paying
  107.6x EXP and 26.5x Zeny per kill. Worth refreshing in the same change as any readjust.

## Reproduce

```sh
node tools/compare_endgame_rewards.js          # the tables above
node tools/compare_endgame_rewards.js --json   # the same numbers as JSON
```
