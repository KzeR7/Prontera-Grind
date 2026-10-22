# Endgame rewards — Nightmare Abyss, the two Ascension maps, and the job trial

**Read-only measurement.** Every number below is produced from the live game by
`tools/compare_endgame_rewards.js` and `tools/compare_job_trial.js`; re-run either command to
regenerate its tables. Build `2026-10-22 haven-v210`.

## What changed in v210

The Nightmare Abyss Stage 15 MVP (Dark Lord) lost the v198 "+25% HP, this boss only" special case:
**111,676,981 → 89,341,585 HP**, the band's own boss HP on every other Nightmare map. That is the
owner's requested 20% cut of the live value (×1.25 then ×0.8 is exactly ×1). Its EXP (33,908),
Zeny (17,581), ATK (14,364), escorts and drops are untouched, and it is still the deepest boss in
the game (Niflheim's Lord of Death: 78,853,659). Every table below shows the post-change state; the
"before v210" rows are kept where the history matters.

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

The trial opponent is built in `startJobRite()` from Astral Citadel Stage 1's first monster template
plus `ascensionCombatStats(10,1)`, with `JOB_RITE_HP_MULT` applied to HP. It spawns with no EXP, no
Zeny and no drops; dying ends the trial as a defeat.

| Crucible opponent | Value |
|---|---:|
| Template | an Astral Citadel Stage 1 monster (chosen at random each entry), power 140 |
| HP | 45,028,158 (3× the stage's 15,009,386 HP mob) |
| ATK | 15,235 (the stage mob's own 15,235) |
| Time limit | 30s, and dying ends the trial as a defeat |
| Rewards | none: the opponent spawns with 0 EXP, 0 Zeny and no drops |

| Gear tier | Class | DPS | Clear time | Max HP | Damage per hit taken | Hits to die | Wins in 30s |
|---|---|---:|---:|---:|---:|---:|---|
| early | Lord Knight | 161,174 | 279.4s | 89,978 | 9,149 | 10 | **no** |
| early | Assassin Cross | 467,255 | 96.4s | 53,861 | 10,315 | 5 | **no** |
| early | Whitesmith | 160,038 | 281.4s | 95,977 | 9,155 | 10 | **no** |
| early | High Priest | 109,615 | 410.8s | 62,485 | 9,144 | 7 | **no** |
| early | Sniper | 241,090 | 186.8s | 49,178 | 10,315 | 5 | **no** |
| early | High Wizard | 265,447 | 169.6s | 49,708 | 10,311 | 5 | **no** |
| mid | Lord Knight | 515,156 | 87.4s | 226,517 | 5,566 | 41 | **no** |
| mid | Assassin Cross | 1,563,294 | 28.8s | 135,378 | 6,792 | 20 | yes |
| mid | Whitesmith | 487,180 | 92.4s | 241,619 | 5,568 | 43 | **no** |
| mid | High Priest | 364,569 | 123.5s | 157,304 | 5,564 | 28 | **no** |
| mid | Sniper | 707,488 | 63.6s | 123,606 | 6,792 | 18 | **no** |
| mid | High Wizard | 927,018 | 48.6s | 125,283 | 6,787 | 18 | **no** |
| N+ | Lord Knight | 3,012,582 | 14.9s | 686,866 | 3,809 | 180 | yes |
| N+ | Assassin Cross | 8,817,031 | 5.1s | 373,359 | 3,809 | 98 | yes |
| N+ | Whitesmith | 3,042,660 | 14.8s | 721,556 | 3,809 | 189 | yes |
| N+ | High Priest | 2,401,403 | 18.8s | 476,990 | 3,809 | 125 | yes |
| N+ | Sniper | 3,268,556 | 13.8s | 340,893 | 3,809 | 90 | yes |
| N+ | High Wizard | 6,040,083 | 7.5s | 345,942 | 3,809 | 91 | yes |

early: 0/6 classes clear inside 30s, fastest 96.4s, slowest 410.8s.

mid: 1/6 classes clear inside 30s, fastest 28.8s, slowest 123.5s.

N+: 6/6 classes clear inside 30s, fastest 5.1s, slowest 18.8s.
**Verdict: it is fair for a completed third-job build and impossible without one.** With N+ benchmark
gear (the +10 refinement, N+ card, max-mastery build the repository uses to mean "finished") all six
classes clear with 11-25 seconds to spare and take 3,809 damage a hit against 90-189 hits of HP, so
the fight is a pure damage check with no death risk. One tier down — +6 refinement, high-tier gear —
only Assassin Cross squeezes in at 28.8s and everyone else needs 49-124s. At +3 gear nobody can win,
and the opponent's 15,235 ATK kills those characters in 5-10 hits, so the trial fails twice over.

The 30-second limit is therefore effectively "you must own roughly N+ benchmark gear", and the class
spread is wide: Assassin Cross 5.1s against High Priest 18.8s. Nothing in the Class Tree tells the
player that.

If that gate is too tight, the single dial is `JOB_RITE_HP_MULT` (2 = 30.0M HP, 1 = the plain 15.0M
Astral Stage 1 mob):

| `JOB_RITE_HP_MULT` | Opponent HP | early gear | mid gear | N+ gear |
|---|---:|---|---|---|
| 3 (current) | 45,028,158 | 0/6 clear (96-411s) | 1/6 clear (28.8s) | 6/6 clear (5.1-18.8s) |
| 2 | 30,018,772 | 0/6 clear (64-274s) | 1/6 clear (19.2s) | 6/6 clear (3.4-12.5s) |
| 1 | 15,009,386 | 0/6 clear (32-137s) | 4/6 clear (9.6-41.2s) | 6/6 clear (1.7-6.3s) |

Raising `JOB_RITE_SECS` instead would help the mid tier only if it went past ~50s, which turns a
30-second rite into a long fight. Lowering the multiplier to 1 keeps the "kill an Ascension mob"
idea and lets a mid-geared player pass with four of six classes.

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
