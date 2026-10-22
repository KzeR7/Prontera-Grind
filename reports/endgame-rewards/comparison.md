# Endgame rewards — Nightmare Abyss, the two Ascension maps, and the job trial

**Read-only measurement** except where marked applied. Every number is produced from the live game by
`tools/compare_endgame_rewards.js`, `tools/compare_job_trial.js` and `tools/compare_ascension_economy.js`;
re-run those commands to regenerate their tables. Build `2026-10-22 haven-v212`.

## What changed in v210, v211 and v212

The Nightmare Abyss Stage 15 MVP (Dark Lord) lost the v198 "+25% HP, this boss only" special case:
**111,676,981 → 89,341,585 HP**, the band's own boss HP on every other Nightmare map. That is the
owner's requested 20% cut of the live value (×1.25 then ×0.8 is exactly ×1). Its EXP (33,908),
Zeny (17,581), ATK (14,364), escorts and drops are untouched, and it is still the deepest boss in
the game (Niflheim's Lord of Death: 78,853,659).

**v211** then made the job-change trial (Crucible of the Valkyrie) harder than that boss: its opponent
is now **1.25× the Dark Lord's HP (111,676,981)** instead of 3× the Astral Stage 1 mob (45,028,158).
See the trial section below.

**v212** retuned Thor Volcano's **Zeny and drop rates** (EXP untouched, as the owner asked): Zeny now
follows each stage's monster-HP ramp, and both Ascension material chances scale with the monster's HP.
Every stage of both maps now pays the same Zeny and materials a minute. See the economy section.

## How to read the numbers

* **EXP is what the player is paid at Base Lv 100+**: the raw reward times `expRate()` = 7/3 = 2.333.
  Zeny is the expected payout including the payout roll (`nmZenyRoll`, mean 0.675).
* **EXP / M HP** and **Zeny / M HP** are the fairness ratios: time per kill follows monster HP, so at
  a fixed DPS they are proportional to EXP/min and Zeny/min.
* **Kills / level** divides `needAt(150)` = 2,497,000 EXP by one kill.
* The **1M DPS tables** turn the ratios into seconds and per-minute income. 1M DPS is an
  illustration, not a measured build; the ratios between fields are the point.
* Boss waves are the MVP plus its escorts (3 on maps 0-4, 5 on maps 5-11).

## The numbers

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
| Abyss NM15 | 5 | 126,865,050 | 169,486 | 27,247 | 20% | 1,336 | 215 |

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
| Abyss NM15 wave | 126,865,050 | 126.9 | 80,157 | 12,886 |
| Astral Citadel S5 wave | 371,482,301 | 371.5 | 315,330 | 13,730 |
| Thor Volcano S5 wave | 742,964,607 | 743.0 | 295,622 | 8,581 |

## Ascension premium — Astral Citadel and Thor Volcano mobs against the Nightmare Abyss 15 mob

Nightmare Abyss 15 mob: 3,613 EXP / M HP, 27,116 EXP and 1,933 Zeny a kill.

| Field | EXP / M HP | vs NM Abyss 15 mob | EXP per kill | vs NM Abyss 15 mob | Zeny per kill | vs NM Abyss 15 mob |
|---|---:|---:|---:|---:|---:|---:|
| Astral Citadel S1 | 5,420 | 1.50x | 81,347 | 3.00x | 5,026 | 2.60x |
| Astral Citadel S2 | 4,818 | 1.33x | 108,463 | 4.00x | 5,277 | 2.73x |
| Astral Citadel S3 | 4,015 | 1.11x | 135,578 | 5.00x | 5,529 | 2.86x |
| Astral Citadel S4 | 3,613 | 1.00x | 176,253 | 6.50x | 5,780 | 2.99x |
| Astral Citadel S5 | 6,423 | 1.78x | 216,925 | 8.00x | 6,031 | 3.12x |
| Thor Volcano S1 | 3,613 | 1.00x | 189,810 | 7.00x | 6,031 | 3.12x |
| Thor Volcano S2 | 3,412 | 0.94x | 230,484 | 8.50x | 6,408 | 3.32x |
| Thor Volcano S3 | 3,285 | 0.91x | 271,157 | 10.00x | 6,785 | 3.51x |
| Thor Volcano S4 | 3,097 | 0.86x | 325,388 | 12.00x | 7,162 | 3.70x |
| Thor Volcano S5 | 6,022 | 1.67x | 406,735 | 15.00x | 7,539 | 3.90x |

## Ascension MVPs against the Nightmare Abyss 15 MVP

| Field | MVP | MVP HP | MVP ATK | MVP EXP | MVP Zeny | EXP / M HP | Zeny / M HP |
|---|---|---:|---:|---:|---:|---:|---:|
| Abyss NM15 | Dark Lord | 89,341,585 | 14,364 | 33,908 | 17,581 | 380 | 197 |
| Astral Citadel S5 | Memory of Thanatos | 202,626,711 | 115,789 | 867,701 | 54,854 | 4,282 | 271 |
| Thor Volcano S5 | Ifrit | 405,253,422 | 182,826 | 1,626,940 | 68,567 | 4,015 | 169 |

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
| Abyss NM15 | Dark Lord | 89,341,585 | 14,364 | 33,908 | 17,581 | 380 | 197 |

## MVPs on the compared fields

| Field | MVP | MVP HP | MVP ATK | MVP EXP | MVP Zeny | EXP / M HP | Zeny / M HP |
|---|---|---:|---:|---:|---:|---:|---:|
| Abyss NM10 | Dark Lord | 658,173 | 3,055 | 2,114 | 1,329 | 3,212 | 2,020 |
| Abyss NM15 | Dark Lord | 89,341,585 | 14,364 | 33,908 | 17,581 | 380 | 197 |
| Astral Citadel S5 | Memory of Thanatos | 202,626,711 | 115,789 | 867,701 | 54,854 | 4,282 | 271 |
| Thor Volcano S5 | Ifrit | 405,253,422 | 182,826 | 1,626,940 | 68,567 | 4,015 | 169 |


## What the numbers say

**1. The Dark Lord now pays like its own band.** 89,341,585 HP for 33,908 EXP is **380 EXP per
million HP** — inside the Nightmare band's 362-380 instead of the 304 it hit before v210, and it is
still the hardest-hitting and tankiest boss in the game.

| MVP | HP | EXP | EXP / M HP |
|---|---:|---:|---:|
| Nightmare Prontera 15 (Mastering) | 19,594,285 | 7,096 | 362 |
| Nightmare Niflheim 15 (Lord of Death) | 78,853,659 | 29,920 | 379 |
| **Nightmare Abyss 15 (Dark Lord, v210)** | **89,341,585** | **33,908** | **380** |
| Nightmare Abyss 15 (Dark Lord, before v210) | 111,676,981 | 33,908 | 304 |
| Abyss 10 (normal Dark Lord) | 658,173 | 2,114 | 3,212 |
| Astral Citadel 5 (Memory of Thanatos) | 202,626,711 | 867,701 | 4,282 |
| Thor Volcano 5 (Ifrit) | 405,253,422 | 1,626,940 | 4,015 |

**2. Its wave is still the weakest camp in the endgame.** Because `fieldExpReward` pays the Stage 15
MVP only **1.25× an escort** while the MVP holds **70% of the wave's HP**, the full wave (126.9M HP)
returns **169,486 EXP = 1,336 per million HP**: **0.37×** the 3,610 per million HP that
`tools/tests/nightmare_sim.js` calls "the exp-optimal camp". At 1M DPS that is **80,157 EXP and
12,886 Zeny a minute**, against 315,330 and 13,730 on Astral Citadel Stage 5. The v210 cut improved
this from 0.31× to 0.37×; any further gain has to come from the payout rule, not from HP.

**3. The Nightmare mobs themselves are fine, with one known dip.** Nightmare Abyss 15 mobs pay
3,613 EXP per million HP against Stage 14's 4,280: Stage 15 adds the v89 +30% HP and ATK but only
+12% EXP. 92 kills per Base-150 level at 7.5M HP each. That dip is unchanged by v210 and is still
the owner's call (raising `nmExpOf(15)` from 48 to ~58 restores Stage-14 parity).

**4. The two Ascension maps pay fairly per HP — with ragged edges.** Against the Nightmare Abyss 15
mob (3,613 EXP / M HP, 27,116 EXP a kill):

* **Astral Citadel**: 1.50× / 1.33× / 1.11× / 1.00× / 1.78× per HP for Stages 1-5.
* **Thor Volcano**: 1.00× / 0.94× / 0.91× / **0.86×** / 1.67× per HP for Stages 1-5.

So the per-kill pay is generous (3-15× a Nightmare mob) and the per-HP pay is roughly flat — but
**Thor Volcano Stages 2-4 are the only endgame mobs that pay less per HP than the Nightmare Abyss 15
mob**, and both maps' **Stage 4 is the weakest stage of its own ladder** (Astral 3,613, Thor 3,097).
Stage 5 jumps because v191 halves escort HP, not because it pays more. No test pins the per-HP
premium, so nothing catches this.

**5. The Ascension MVPs are the fair ones.** Memory of Thanatos pays 4,282 EXP per million HP and
Ifrit 4,015 — 10-11× the Dark Lord's rate, and about 0.67× their own mobs' rate, which is the
convention the Nightmare band's bosses break (0.105×).

**6. Zeny is never the problem; it is a different shape.** Nightmare Abyss 15 pays 1,933 Zeny a kill
(26.5× Abyss Stage 10's 73) and the wave 12,886 a minute at 1M DPS. Ascension mobs pay 2.6-3.9× that
per kill. Per HP the Ascension numbers look low only because Zeny does not scale with HP (the v172
decision). The genuinely thin spots are **Thor Volcano 3-4**: 68-82 Zeny per million HP and about 4k
Zeny a minute — an EXP/material field, not a Zeny field.

**7. Pacing at 1M DPS (illustration).** Dark Lord wave 126.9s → 80k EXP/min; Astral Stage 1 mob 15.0s
→ 325k; Astral Stage 5 mob 33.8s → 385k; Thor Stage 4 mob 105.1s → 186k; Thor Stage 5 mob 67.5s →
361k; Thor Stage 5 wave 743s → 296k. Kills per Base-150 level: 92 (NM Abyss 15), 31-12 (Astral), 13-6
(Thor).

**8. Inside both Ascension maps, Stage 1 and Stage 5 are the efficient camps and Stage 4 is the
trap.** If you ever want a flat ladder, Stage 4's ramp is the one to move.

## The job trial (Crucible of the Valkyrie)

**v211 (owner: "job change should be hard and stronger than abyss nightmare boss").** The opponent is
built in `startJobRite()` from Astral Citadel Stage 1's first monster template plus
`ascensionCombatStats(10,1)`, and its HP is now anchored to the Nightmare Abyss Stage 15 MVP through
the boss's own formula: **1.25× 89,341,585 = 111,676,981 HP**. It spawns with no EXP, no Zeny and no
drops; dying ends the trial as a defeat.

| Crucible opponent | Value |
|---|---:|
| Template | an Astral Citadel Stage 1 monster (chosen at random each entry), power 140 |
| Nightmare Abyss 15 MVP for reference | 89,341,585 HP, 14,364 ATK |
| HP | 111,676,981 (1.25× the Nightmare Abyss 15 MVP's 89,341,585 HP) |
| ATK | 15,235 (the Astral Stage 1 mob's value, above the Abyss NM boss's 14,364) |
| Time limit | 30s, and dying ends the trial as a defeat |
| Rewards | none: the opponent spawns with 0 EXP, 0 Zeny and no drops |

| Gear tier | Class | DPS | Clear time | Max HP | Damage per hit taken | Hits to die | Wins in 30s |
|---|---|---:|---:|---:|---:|---:|---|
| early | Lord Knight | 161,174 | 692.9s | 89,978 | 9,149 | 10 | **no** |
| early | Assassin Cross | 467,255 | 239.0s | 53,861 | 10,315 | 5 | **no** |
| early | Whitesmith | 160,038 | 697.8s | 95,977 | 9,155 | 10 | **no** |
| early | High Priest | 109,615 | 1018.8s | 62,485 | 9,144 | 7 | **no** |
| early | Sniper | 241,090 | 463.2s | 49,178 | 10,315 | 5 | **no** |
| early | High Wizard | 265,447 | 420.7s | 49,708 | 10,311 | 5 | **no** |
| mid | Lord Knight | 515,156 | 216.8s | 226,517 | 5,566 | 41 | **no** |
| mid | Assassin Cross | 1,563,294 | 71.4s | 135,378 | 6,792 | 20 | **no** |
| mid | Whitesmith | 487,180 | 229.2s | 241,619 | 5,568 | 43 | **no** |
| mid | High Priest | 364,569 | 306.3s | 157,304 | 5,564 | 28 | **no** |
| mid | Sniper | 707,488 | 157.9s | 123,606 | 6,792 | 18 | **no** |
| mid | High Wizard | 927,018 | 120.5s | 125,283 | 6,787 | 18 | **no** |
| N+ | Lord Knight | 3,012,582 | 37.1s | 686,866 | 3,809 | 180 | **no** |
| N+ | Assassin Cross | 8,817,031 | 12.7s | 373,359 | 3,809 | 98 | yes |
| N+ | Whitesmith | 3,042,660 | 36.7s | 721,556 | 3,809 | 189 | **no** |
| N+ | High Priest | 2,401,403 | 46.5s | 476,990 | 3,809 | 125 | **no** |
| N+ | Sniper | 3,268,556 | 34.2s | 340,893 | 3,809 | 90 | **no** |
| N+ | High Wizard | 6,040,083 | 18.5s | 345,942 | 3,809 | 91 | yes |

early: 0/6 classes clear inside 30s, fastest 239.0s, slowest 1018.8s.

mid: 0/6 classes clear inside 30s, fastest 71.4s, slowest 306.3s.

N+: 2/6 classes clear inside 30s, fastest 12.7s, slowest 46.5s.


**Verdict: it is now harder than the Abyss Nightmare boss, and only a finished build can win.**
Against the same benchmark fixtures (see the tier definitions in `tools/progression_balance.js`):

* **N+ gear (a completed build): 2 of 6 classes clear inside 30s.** Assassin Cross 12.7s and High
  Wizard 18.5s win; Sniper needs 34.2s, Whitesmith 36.7s, Lord Knight 37.1s and High Priest 46.5s.
  Nobody dies (3,809 damage a hit against 90-189 hits of HP), so it is a pure damage check.
* **Mid gear: 0 of 6** (fastest 71.4s). **Early gear: 0 of 6** (fastest 239s, slowest 1,019s).
* The opponent swings 15,235 ATK - above the Dark Lord's own 14,364 - so it is stronger than the
  Abyss Nightmare boss on both axes.

Read the DPS numbers as a benchmark, not a ceiling: they come from a stationary single-target harness
with fixed six-slot combos, no pets and no over-cap refinement, so a fully invested third job does
more than this table shows. If the gate turns out too strict in play, the two dials are
`JOB_RITE_BOSS_MULT` (1.0 puts the opponent exactly at the Dark Lord's HP) and `JOB_RITE_SECS`
(45s lets five of six classes through at benchmark gear; 60s lets all six).

## The Ascension economy — Zeny and drop rates (v212 applied)

The owner's brief was "dont mind the exp. i want to tune the zeny, and drop rates", so EXP is
untouched in both maps and only these two mechanisms changed. Measured by
`tools/compare_ascension_economy.js`, which reads the live page.

### What was wrong

`fieldZenyReward()` pays every Ascension kill `Nightmare Abyss 15 regular-mob Zeny × ascZenyBonus`.
The old bonus ladder rose 25% from Stage 1 to 5 while Thor's monster HP rose 157%, so Zeny per kill
crawled up while the time per kill ballooned. `ascensionDrops()` rolled a flat 0.2% for the map
material and 0.05% for a Sigil regardless of the monster's HP, so Stage 4 of either map paid half the
materials an hour of Stage 1. Net effect before v212:

| Field | Zeny per kill | Zeny / M HP | Map material | Sigil | Materials/h @1M DPS |
|---|---:|---:|---|---|---:|
| Astral Citadel S1 | 5,026 | **335** | 0.2% (Astral Shard) | 0.05% | 0.48 |
| Astral Citadel S2 | 5,277 | 234 | 0.2% | 0.05% | 0.32 |
| Astral Citadel S3 | 5,529 | 164 | 0.2% | 0.05% | 0.21 |
| Astral Citadel S4 | 5,780 | 118 | 0.2% | 0.05% | 0.15 |
| Astral Citadel S5 | 6,031 | 179 | 0.2% | 0.05% | 0.21 |
| Thor Volcano S1 | 6,031 | 115 | 0.2% (Primal Catalyst) | 0.05% | 0.14 |
| Thor Volcano S2 | 6,408 | 94.9 | 0.2% | 0.05% | 0.11 |
| Thor Volcano S3 | 6,785 | 82.2 | 0.2% | 0.05% | 0.09 |
| Thor Volcano S4 | 7,162 | **68.2** | 0.2% | 0.05% | 0.07 |
| Thor Volcano S5 | 7,539 | 112 | 0.2% | 0.05% | 0.11 |

Thor Volcano was the hardest content in the game and the worst Zeny farm in it, and neither map's
depth paid anything for its extra danger.

### What v212 does

* **Zeny follows the stage's HP ramp.** `ascZenyRamp()` reuses the same numbers `ascensionCombatStats`
  uses for monster HP (Astral `2/3/4.5/6.5/9`, Thor `7/9/11/14/18`, Stage 5 halved because its
  escorts are), and `ascZenyBonus` is that ramp ×1.3, the existing Ascension bonus. Zeny per million
  HP is therefore identical on every stage of both maps, so a minute of farming pays the same
  wherever you stand. Astral Stage 1 is unchanged; Thor Stage 1 triples; Thor Stage 4 pays 4.9×.
* **Material odds follow the monster's HP.** `ascMaterialChance()` and `ascSigilChance()` scale the
  base 0.5% / 0.125% by the monster's max HP against the Astral Stage 1 mob (15,009,386), so the
  chance rises exactly as fast as the kill rate falls. Bosses keep their 1% Sigil roll and, at 3× a
  mob's HP, roll 3× its material chance. Every stage of both maps now converges on one rate.
* **Both maps and the online/offline split read the same helpers**, so the map card, the away-income
  path and the live kill path cannot disagree. The map card now prints the live odds for the stage
  you are inspecting instead of a constant.

| Field | Mob HP | Zeny per kill | Zeny / M HP | EXP / M HP | Gear drops / kill | Card | Map material | Sigil | Ore |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Abyss NM15 | 7,504,693 | 1,933 | 258 | 3,613 | 0.42% | 0.15% | — | — | 1% |
| Astral Citadel S1 | 15,009,386 | 5,026 | 335 | 5,420 | none | 0.15% | 0.5% (Astral Shard) | 0.125% | 1% |
| Astral Citadel S2 | 22,514,079 | 7,539 | 335 | 4,818 | none | 0.15% | 0.75% (Astral Shard) | 0.188% | 1% |
| Astral Citadel S3 | 33,771,118 | 11,309 | 335 | 4,015 | none | 0.15% | 1.125% (Astral Shard) | 0.281% | 1% |
| Astral Citadel S4 | 48,780,504 | 16,335 | 335 | 3,613 | none | 0.15% | 1.625% (Astral Shard) | 0.406% | 1% |
| Astral Citadel S5 | 33,771,118 | 11,309 | 335 | 6,423 | none | 0.15% | 1.125% (Astral Shard) | 0.281% | 1% |
| Thor Volcano S1 | 52,532,851 | 17,591 | 335 | 3,613 | none | 0.15% | 1.75% (Primal Catalyst) | 0.438% | 1% |
| Thor Volcano S2 | 67,542,237 | 22,617 | 335 | 3,412 | none | 0.15% | 2.25% (Primal Catalyst) | 0.563% | 1% |
| Thor Volcano S3 | 82,551,623 | 27,643 | 335 | 3,285 | none | 0.15% | 2.75% (Primal Catalyst) | 0.688% | 1% |
| Thor Volcano S4 | 105,065,702 | 35,182 | 335 | 3,097 | none | 0.15% | 3.5% (Primal Catalyst) | 0.875% | 1% |
| Thor Volcano S5 | 67,542,237 | 22,617 | 335 | 6,022 | none | 0.15% | 2.25% (Primal Catalyst) | 0.563% | 1% |

### Per hour at 1M DPS

| Field | Kills / min | Zeny / hour | Map material / hour | Sigils / hour | Ore / hour | Cards / hour | Gear / hour |
|---|---:|---:|---:|---:|---:|---:|---:|
| Abyss NM15 | 8.0 | 927,295 | 0.00 | 0.00 | 4.8 | 0.72 | 2.0 |
| Astral Citadel S1 | 4.0 | 1,205,485 | 1.2 | 0.30 | 2.4 | 0.36 | — |
| Astral Citadel S2 | 2.7 | 1,205,492 | 1.2 | 0.30 | 1.6 | 0.24 | — |
| Astral Citadel S3 | 1.8 | 1,205,487 | 1.2 | 0.30 | 1.1 | 0.16 | — |
| Astral Citadel S4 | 1.2 | 1,205,486 | 1.2 | 0.30 | 0.74 | 0.11 | — |
| Astral Citadel S5 | 1.8 | 1,205,487 | 1.2 | 0.30 | 1.1 | 0.16 | — |
| Thor Volcano S1 | 1.1 | 1,205,481 | 1.2 | 0.30 | 0.69 | 0.10 | — |
| Thor Volcano S2 | 0.89 | 1,205,482 | 1.2 | 0.30 | 0.53 | 0.08 | — |
| Thor Volcano S3 | 0.73 | 1,205,486 | 1.2 | 0.30 | 0.44 | 0.07 | — |
| Thor Volcano S4 | 0.57 | 1,205,484 | 1.2 | 0.30 | 0.34 | 0.05 | — |
| Thor Volcano S5 | 0.89 | 1,205,482 | 1.2 | 0.30 | 0.53 | 0.08 | — |

### Per hour at 4M DPS

| Field | Kills / min | Zeny / hour | Map material / hour | Sigils / hour | Ore / hour | Cards / hour | Gear / hour |
|---|---:|---:|---:|---:|---:|---:|---:|
| Abyss NM15 | 32.0 | 3,709,182 | 0.00 | 0.00 | 19.2 | 2.9 | 8.1 |
| Astral Citadel S1 | 16.0 | 4,821,939 | 4.8 | 1.2 | 9.6 | 1.4 | — |
| Astral Citadel S2 | 10.7 | 4,821,968 | 4.8 | 1.2 | 6.4 | 0.96 | — |
| Astral Citadel S3 | 7.1 | 4,821,946 | 4.8 | 1.2 | 4.3 | 0.64 | — |
| Astral Citadel S4 | 4.9 | 4,821,944 | 4.8 | 1.2 | 3.0 | 0.44 | — |
| Astral Citadel S5 | 7.1 | 4,821,946 | 4.8 | 1.2 | 4.3 | 0.64 | — |
| Thor Volcano S1 | 4.6 | 4,821,923 | 4.8 | 1.2 | 2.7 | 0.41 | — |
| Thor Volcano S2 | 3.6 | 4,821,927 | 4.8 | 1.2 | 2.1 | 0.32 | — |
| Thor Volcano S3 | 2.9 | 4,821,945 | 4.8 | 1.2 | 1.7 | 0.26 | — |
| Thor Volcano S4 | 2.3 | 4,821,936 | 4.8 | 1.2 | 1.4 | 0.21 | — |
| Thor Volcano S5 | 3.6 | 4,821,927 | 4.8 | 1.2 | 2.1 | 0.32 | — |

### What a set costs

| Set | Map | Material | Shards / catalysts | Sigils | Zeny |
|---|---|---|---:|---:|---:|
| Celestial | Astral | Astral Shard | 108 | 11 | 410,000,000 |
| Voidwalker | Astral | Astral Shard | 119 | 11 | 458,000,000 |
| Ethereal | Astral | Astral Shard | 112 | 11 | 428,000,000 |
| Primal | Thor | Primal Catalyst | 133 | 11 | 500,000,000 |
| Molten | Thor | Primal Catalyst | 145 | 11 | 560,000,000 |
| Infernal | Thor | Primal Catalyst | 153 | 11 | 600,000,000 |

Reference: at 1M DPS the best Ascension drop field (Astral Citadel S1) pays 1.2 Astral Shard an hour, and at 4M DPS 4.8.

### What it means for the set grind

One Mythic set is 108-153 materials, 11 Sigils and 410-600M Zeny. At 4M DPS (a completed N+ build on
the benchmark harness) the time to one set is:

| | Materials | Sigils | Zeny |
|---|---|---|---|
| v211 (Astral S1 / Thor S4) | 56-80h / 225-319h | 23h / 92h | 85h / 124h |
| **v212 (any stage, either map)** | **23-32h** | **9-12h** | **85-124h** |

Depth is no longer a penalty on any axis, and Thor now pays as well as Astral instead of 3.5× worse,
which is what its mob HP and Zeny per kill (17,591-35,182) justify. Zeny is still the long pole
because the sets themselves cost 410-600M; that is a set-price question (`ASC_SETS`), not a farm-rate
one, and it was outside this brief.

### Knobs left on the table (not applied)

| Knob | Effect |
|---|---|
| `ASC_MAT_CH` 0.5 → 1.0 | Doubles materials again: 9.6/h at 4M DPS, a set's materials in 11-16h. `ASC_SIGIL_CH` would move with it to keep the 4:1 ratio. |
| `ascZenyRamp` ×1.5 | Another 50% on every Ascension payout: 7.2M Zeny/h at 4M DPS, a 410M set's Zeny in 57h instead of 85h. |
| `ASC_SETS` Zeny costs | The only lever that shortens the Zeny side without inflating the income curve. Not touched here. |
| Equipment drops on the two maps | Still none, as designed in v158 and restated in the handbook. Nothing in v212 changes that. |

**Caveat on every per-hour figure:** they are `DPS ÷ HP × 3600` kills an hour, i.e. a player who never
walks, never waits for a respawn and never loses a pack. Real rates differ by kit; the tables are for
comparing fields, which is what the tuning turns on.

## Remaining options — Nightmare Stage 15 (historical, for reference)

The options that were priced before v210 was chosen. v210 is **A-variant "cut the HP by 20% with no
payout change"**: it moved the MVP from 304 to 380 per million HP and the wave from 0.31× to 0.37×.

| Package | Change | MVP HP | MVP EXP | MVP EXP / M HP | Wave EXP / M HP | vs S10 wave |
|---|---|---:|---:|---:|---:|---:|
| — | before v210 (MVP = 1.25× escort, +25% HP) | 111,676,981 | 33,908 | 304 | 1,136 | 0.31x |
| **applied** | v210: −20% MVP HP, payout unchanged | 89,341,585 | 33,908 | 380 | 1,336 | 0.37x |
| A1 | on top of v210: MVP pays 10× an escort | 89,341,585 | 271,264 | 3,036 | 3,207 | 0.89x |
| A2 | on top of v210: MVP pays 15× an escort | 89,341,585 | 406,896 | 4,554 | 4,276 | 1.18x |
| B2 | instead of v210: `NMBOSSHP` 48 → 24, MVP 7.5× an escort | 44,670,793 | 203,448 | 4,554 | 4,125 | 1.14x |

A1/A2 are the "make the boss a reward" step; they are independent of the v210 HP cut and can be
applied on top of it. Both need `mvp_exp_sim.js`'s "whole wave raw EXP unchanged" assertion
restated.

## Caveats

* Static measurement at Base Lv 150 with ordinary rewards, no pets, no gear, no card bonuses and no
  player death risk (except in the job-trial section, which measures real player DPS with the
  repository's benchmark fixtures).
* The job-trial DPS figures come from a stationary, single-target harness with fixed six-slot
  combos: real fights add movement, packs and skill timing. They are comparative, not promises.
* 1M DPS is an illustration; low-HP camps are limited by attack cadence, not HP, which is why Abyss
  Stage 10 is left out of the pacing tables.
* Zeny expectations use 20,000 rolls of a fixed sequence, so they reproduce to the Zeny; the game's
  own rolls are random per kill.

## Reproduce

```sh
node tools/compare_endgame_rewards.js          # the field and MVP tables above
node tools/compare_endgame_rewards.js --json   # the same numbers as JSON
node tools/compare_job_trial.js                # the Crucible table above
node tools/compare_job_trial.js --json
```
