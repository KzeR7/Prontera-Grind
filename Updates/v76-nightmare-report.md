# v76 "Nightmare" — what was coded, and the trial-dungeon answers

Build: `2026-10-07 grind-v76 nightmare band and exclusive nightmare gear`.
This is the detailed summary you asked for, then the three open suggestions: **dungeon name**,
**what Trial Shards exchange into**, and **what a one-off milestone chest should reward**.

---

## Part 0 — your two questions

**"What do you mean by 25M being a realistic 5-minute ceiling?"** — I meant the *top rung* of the
milestone-chest ladder in Part 4: it was the total damage dealt inside one 5-minute run. I picked 25M
as a round number, because **nothing in the game measures damage yet** — the trial is what would
measure it. So it was a guess, and you were right to question it. Here is the closest thing to a real
measurement I can make from the shipped numbers:

* Nightmare mob HP per kill, straight out of the game's formula (`42 x mapBonus x power^1.3`, x12 in
  the band):

  | Field | Mob HP | DPS that equals "one kill every 4.5s" |
  |---|---|---|
  | Comodo 10 | 20,127 | 4,473 |
  | Abyss 10 (old ceiling) | 55,287 | 12,286 |
  | NM Prontera 11 | 213,785 | 47,508 |
  | NM Niflheim 13 | 1,081,985 | 240,441 |
  | NM Abyss 15 | 1,391,313 | 309,181 |

* The middle column is the game's **own** balance target: `tools/pacing_report.js` is solved on
  **800 kills/hour**, i.e. one kill every 4.5 seconds on the level-appropriate field. Read backwards,
  that says a hero who belongs on Nightmare Abyss 15 is expected to be pushing roughly **300,000 DPS**
  while farming — packs, skills and pets included.
* A trial dummy is **single target**: no pack splash, no walking, but also no boss crit immunity on
  my draft. Single-target throughput is a fraction of farm throughput, so a fully decked 150 with
  Abyssal Nightmare gear realistically lands somewhere in the **20-40M** band over 5 minutes — i.e.
  **65,000-135,000 DPS**.
* Verdict: **25M was in the right range for a top rung, but it was luck, not measurement.** The number
  that should be locked is a DPS figure (see below), the rungs are **one array in the code**, and the
  right moment to finalise them is after your first real run — v77 will ship them provisional and I
  will move them from your measurement.

**"The rank board should show the best DPS within one session, not accumulated."** — Recorded, and it
changes three things:

1. **Metric: best single-run DPS.** A ranked run is one 5-minute session; the board takes the
   **maximum DPS of a single run**, never the sum of runs. Logging in 30 times a day cannot climb the
   board, only one good run can.
2. **Display: DPS is the headline** (`84,120 DPS`), with that run's total damage underneath
   (`25.2M in 5:00`) and the loadout it was set with.
3. **Storage: mirror of the kills board, but MAX instead of delta.** Same worker, same
   `period=daily|weekly|all` shape and LIMIT 50 as `functions/api/board.js`, except the row keeps
   `max(dps)` per (user, period) instead of an accumulating counter. Weekly season = the weekly row.

---

## Part 1 — What I coded

### 1.1 The problem

Field power stopped at **Abyss Stage 10 = 99**. Your level cap is 150. So from about Base Lv 75-80
(the Abyss farm) to 150 there was **nothing to climb and nothing new to find** — same map, same
drops, only the stat cap moving. That was the buzz kill.

### 1.2 What a player sees now

Every map has **15 stages** instead of 10. Stages 11-15 are the **Nightmare band**, drawn on the
World Map as their own five purple nodes labelled **NM 1 … NM 5**, after the normal ten. A header on
the field band says `Nightmare 0/5 · unlocks at Base Lv 100` (or `n/5` as you unlock them).

| Map | Old top (stage 10) | NM 1 | NM 5 |
|---|---|---|---|
| Prontera | 10 | **105** | **121** |
| Izlude | 50 | 111 | 127 |
| Geffen | 50 | 117 | 133 |
| Morroc | 50 | 123 | 139 |
| Payon | 50 | 129 | 145 |
| Comodo | 69 | 135 | 151 |
| Louyang | 76 | 141 | 157 |
| Amatsu | 83 | 147 | 163 |
| Niflheim | 89 | 153 | 169 |
| Abyss | 99 | **159** | **175** |

The band is one ladder that starts at 105 on map 1 and ends at **175 on Nightmare Abyss 15** — the
deepest field in the game. Which map you pick sets your entry point: at Base Lv 100 you can already
farm anywhere from power 105 (Prontera) up to 159 (Abyss). **Every normal stage 1-10 is byte-for-byte
what it was** — this is all new floor, nothing retuned underneath you.

The five gates are **Base Lv 100 / 110 / 125 / 140 / 150**, one per stage. It is a pure level unlock:
**no new save fields, no migration, nothing to re-earn**. If a save is ever loaded in a stage it has
not unlocked, it is quietly walked back to the highest one it can stand in.

**Stage 15 is a boss stage**, exactly like stage 10 (boss + the usual pack, and killing the boss
resets the fight).

### 1.3 "Strong enough to make it hard"

You said the mobs had to be genuinely hard, so the band is not just a difficulty number. Against the
same-power monster:

| | Mob HP | The mob's hit on you (after your 75% DEF cut) |
|---|---|---|
| Abyss stage 10 (the old ceiling) | 56,013 | 389 |
| **Nightmare Abyss 15** | **2,782,608 (50x)** | **1,526 (3.9x)** |
| Nightmare Abyss 15 MVP | 33,126,480 | — |

(That second column is the *monster's* attack, not yours — a Nightmare Abyss 15 mob hits about two and
a half times harder than an Abyss 10 mob does.)

* **24x mob HP** and **2.25x mob damage** — the two knobs are single constants (`NMHP`, `NMATK`).
  (v76 shipped 12x / 1.5x; your play-test said it was a bit easy — see Part 5.)
* The stage-15 MVP has **24x the HP** of a stage-10 one (`NMBOSSHP`).
* Nightmare monsters pay **2.5x EXP** and **2.2x Zeny** (`NMEXP`, `NMZENY`) — you get paid for the
  extra time, not just punished by it.
* **Ore** drops at **1.5%** a kill in the band (0.5% normally, 1% on a stage-10 MVP field).
* MVP drop pool **3%** total (6% on the first five maps, 4.2% on the mid/endgame ones) — the band's
  drops are a third of what they were, per your v76.2 note.
* **MVPs resist crit harder**, one figure per map, rising like the normal ladder:
  **35 / 35 / 36 / 36 / 38 / 38 / 40 / 40 / 42 / 45%**. A capped 60% crit build crits a Nightmare
  Abyss MVP **33%** of the time (39% on Nightmare Prontera). The old ladder (15/15/15/20/30) is
  untouched for stages 1-10. The mechanic is unchanged; as of v76.2 the figure is no longer printed
  under the MVP's name (your note: the map already says it).

### 1.4 Two new gear sections, exclusive to the band

| Section | Rolls on | Name |
|---|---|---|
| **4** | NM stages 11-13, and their mobs | **Nightmare gear** |
| **5** | NM stages 14-15 and both bosses | **Abyssal Nightmare gear** |

* **Sections 4 and 5 are unreachable below stage 11 — structurally, not by rule.** The section index
  is computed from the stage, and every stage 1-10 path is asserted to stay at 0-3 in three test
  suites. Normal maps cannot roll this gear even by accident.
* Each section is **that map's own high-tier row, renamed**: same weapon families, so no class loses
  a weapon it could use (swords, katars, bows, staffs, maces, axes, daggers all present), all-new
  names. Examples: *Dread Excalibur / Dread Plate Armor*, *Kraken Admiral Saber*, *Void Wand of
  Hermes*, *Sandwraith Bloody Roar*, *Leviathan Trident Bow*, *Oni Dragon Slayer*, *Yokai Masamune*,
  *Helheim Deathbringer*, *Glast Dark Lord Sword* — with section 5 versions one word further
  (*Abyssal, Maelstrom, Singularity, Eclipse, Wraithlord, Trench, Yama, Kami, Nidhogg, Absolute*).
* **210 new items**, names checked unique across the whole catalogue, and **they are their own rarity
  now: tagged `N`, painted dark purple**, never "Legendary" (v76.2 — see Part 5). Mechanically they
  still pay at the Legendary band, so autosell, values and drop weights are untouched.
* Value: a **Nightmare** item is **1.5x** the high-tier row, an **Abyssal Nightmare** item **15/7x**
  it. There is no new grade — it is a new section whose numbers sit where the 100-150 grind needs
  them, so the Legendary chase you already know still means something.

### 1.5 Play-testing it

The GM console has a new button **"Unlock Nightmare (Base Lv 150)"** (`gmnm`): it sets Base Lv 150
and unlocks all five stages, so you can walk into Nightmare Abyss 15 without 150 levels of playing.
Worth a look on your phone:

1. World Map → Abyss → the field strip should show 15 nodes, the last five purple/greyed.
2. Tap **NM 1** — the field card reads `Nightmare Abyss Stage 1`, the drop tables list Glast NM gear,
   and the boss card (on NM 5) prints **45%** crit resistance.
3. Tap **NM 2** — no boss card, it now says `Boss appears at NM 5 (stage 15).` (it used to say
   "Stage 10", which was wrong on a Nightmare field).
4. GM → Unlock Nightmare → NM 5 should hit noticeably harder than anything you have farmed.

### 1.6 What it does *not* change

No new maps, sprites, classes or skills; no change to stages 1-10, drop rates, refine, cards, pets or
the Index; no change to the leaderboard (still kills). Two real bugs were found and fixed by the new
test suite while wiring this: stage 15 was a boss stage in one code path and a normal field in
another, and `fieldOf` refused to build a boss above stage 10.

### 1.7 Tuning knobs (if a play-test says "too hard" or "too soft")

All one-line changes, all in `index.html`:

* `NMHP` (mob HP), `NMATK` (mob damage), `NMBOSSHP` (boss HP) — difficulty.
* `NMLV` — the five Base Lv gates.
* `NMBASE`/`NMSTEP`/`NMGAP` — where the band starts (105) and how fast it climbs per map (+6) and
  per stage (+4).
* `NMEXP`/`NMZENY` — the payout for the extra time.
* `NM_CRIT_RES` — the crit ladder.
* Tests: **35 suites, all green.** New suite `tools/tests/nightmare_sim.js` (8 groups) holds the
  whole band: the gates, the power schedule map by map, section exclusivity both ways, the renamed-row
  rule, the value multipliers, the difficulty constants + worked damage figures, and the save/travel
  guards. `crit_sim`, `gear_sim`, `ui_sim` and the audit worksheet were updated with it.

---

## Part 2 — Dungeon name suggestions

The thing you fight is a dummy with infinite HP that never hits back, for exactly 5 minutes, twice a
day for the board. Six candidates, then my pick:

| # | Name | Why it works |
|---|---|---|
| 1 | **Endless Echo** | The target never dies; your damage is the only thing that speaks. Short, fits a leaderboard header (`Endless Echo · Season 3`) and a title (`Echo Breaker`). |
| 2 | **The Proving Grounds** | Plainest possible pitch: come prove your damage. Zero lore required. |
| 3 | **The Anvil** | You hammer something that never breaks for five minutes. Fits the rhythm of the run and reads well as a season (`Anvil Season 3`). |
| 4 | **Abyss Trial Hall** | Ties it to the endgame map everyone is already farming, and makes the placement obvious. |
| 5 | **Nightmare Coliseum** | Uses the new band's name, so v76 and the trial feel like one arc. |
| 6 | **Hall of Records** | Emphasises the board rather than the punching bag — good if the season board is the real point. |

**My pick: Endless Echo.** It is the only one that describes the actual mechanic (infinite target,
5 minutes), it is two words like every map name you already have, and it seasons cleanly. Concrete
strings it would produce: `Endless Echo` (entry card), `Endless Echo · Season 3` (board header),
`Best: 8,412,905` (personal best line), and titles `Echo Novice / Echo Adept / Echo Breaker` for the
three score tiers in Part 4.

If you want it anchored to the map instead, **Abyss Trial Hall** is the safest second choice.

---

## Part 3 — What Trial Shards exchange into

Design rule I used: **Shards buy things the game already has sinks for**, so nothing new has to be
balanced — and the top of the list connects the trial to the v76 Nightmare band you just got. Ranked
runs pay shards (2/day), banded by the DPS you reached in that run plus a personal-best bonus, so the
numbers below are sized so a normal week of ranked runs buys roughly two cheap things and one
expensive thing.

| Cost | Item | What it does |
|---|---|---|
| 10 | **Oridecon ×5** | Feeds Refine (+1 → +10) on weapons. The 100-150 sink. |
| 10 | **Elunium ×5** | Same, for armor / shield / headgear / legs / accessories. |
| 25 | **Zeny Cache (250,000)** | For refine fees and pet rolls when you are short. |
| 30 | **Pet Roll Ticket ×1** | One free roll on the pet mutation ladder (usually 2,500×(1+tier) zeny). |
| 40 | **Card Index Token ×1** | The permanent-stat token the Card Index already hands out per mastery rank — buys a stat roll without a duplicate card. |
| 60 | **Legendary Card Voucher** | One random Legendary card of a map you choose: either mastery progress toward a permanent reward, or the currency for one Card Index reset. |
| 120 | **Nightmare Gear Token** | **Pick any one Nightmare (section 4) or Abyssal Nightmare (section 5) item your class can wear.** This is the anti-RNG valve for the new band: it will not hand you a full set, but it means 15 dry NM runs still end somewhere. |
| season | **Trial Titles** | Not bought with shards — earned by score tier, kept forever, shown where your Index titles show. |

Notes on it:

* Shards are **account-bound and season-reset**, so the exchange can be generous without inflating the
  permanent economy. Leftovers carry into the next season at a 25% rate, or just expire — your call.
* Everything above is a **one-click claim**, no new UI pages: shards sit next to Ore and Zeny in the
  Index, and the voucher/token ask which map, then which item, exactly like the existing pickers.
* The two expensive rows (Legendary card, Nightmare gear token) get a **weekly cap of 1 each** so a
  grinder with lots of shards cannot skip the whole band.

---

## Part 4 — Milestone chest rewards (one-off)

These are **lifetime one-offs**, separate from the 2 ranked shard payouts a day — a chest opens once,
permanently, the first time a run crosses a line. That makes them a reason to *push* rather than a
reason to log in twice. Suggested ladder:

Since the board now ranks **DPS**, the rungs are DPS too — the same unit you will see on the screen,
and the "damage in one run" column is just DPS x 300s for reading. **These five numbers are
provisional**: they are the array I will re-set from your first real run (Part 0).

| Milestone | = damage in one 5:00 run | Chest holds |
|---|---|---|
| **Finish your first ranked run** | — | 25 Shards + title **Echo Novice** |
| **5,000 DPS** | 1.5M | 50 Shards + Oridecon ×10 + Elunium ×10 |
| **15,000 DPS** | 4.5M | 75 Shards + Pet Roll Ticket ×1 + Zeny Cache (250,000) |
| **40,000 DPS** | 12.0M | 100 Shards + title **Echo Adept** + Card Index Token ×1 |
| **80,000 DPS** | 24.0M | 150 Shards + Legendary Card Voucher ×1 |
| **120,000 DPS** | 36.0M | 200 Shards + title **Echo Breaker** |
| **Beat your own personal best by 10%** | — | 20 Shards (repeatable — the "keep improving" drip) |
| **Top 10 on a weekly board** | — | 150 Shards + a season badge |
| **A full 5:00 with zero damage taken** (the dummy never swings, so this is really "no potions used") | — | title **Untouched** — cosmetic flex, no currency |

Where the rungs sit, using Part 0's estimate: 5,000 DPS is "you can farm Comodo", 15,000 is "Abyss
stage 10 is comfortable", 40,000 is "you are wearing Nightmare gear", 80,000 is a decked 150 in
Abyssal gear, and 120,000 is the chase rung that needs a near-perfect build, a maxed pet and a
favourable 5 minutes.

Why this shape:

* The first two chests are reachable by anyone in the mid-game, so the mode does not feel like a
  150-only club.
* The 10M / 25M rungs are the ones that need the Nightmare band's gear, which ties the trial to v76
  without gating either behind the other.
* Titles carry **no stats** — they are the prestige, the Shards are the shopping, and the two
  expensive exchange items keep the shopping from breaking the drop economy.
* Thresholds are easy to move: they are a short array, and one test asserts the ladder stays strictly
  increasing.

**Decided (Part 0):** the board keeps the **best DPS of a single 5-minute session** and never sums runs
across sessions, so the chest rungs are DPS. **Still open:** the exact five numbers — send me your
first run's score (or just tell me when v77 is in your hands) and I will set them from the measurement
instead of the estimate.

---

## Part 5 — v76.2: your play-test notes, all six built

1. **The N rarity.** Nightmare and Abyssal Nightmare gear is tagged **N** with **dark purple names**
   instead of "Legendary", and the look carries: wearing Nightmare armour/headgear/weapon tints the
   worn model dark purple (the same colour table that paints Legendary gear gold), a Nightmare drop
   sparkles purple in the field, and the item name itself leads with `N ` — `N Dread Excalibur`.
   It is display-only; the numbers and the autosell bands are untouched.
2. **Bosses are MVPs everywhere**: the card header, the `(MVP)` tag, the fight hints, the HUD
   (`MVP FIGHT · 3 minions`), the quest text, the Executioner pet line, the ore hint and the stage
   title all say MVP now.
3. **The band is harder.** You said "abit easy, maybe double?" — the wall is doubled and the sting is
   only half again on purpose: `NMHP 12 → 24`, `NMBOSSHP 12 → 24`, `NMATK 1.5 → 2.25`. A Nightmare
   Abyss 15 mob is now **2.78M HP (50x an Abyss 10 mob)** and hits for **1,526** through your 75% DEF
   cut; its MVP has **33.1M HP**. Doubling the damage as well would have meant two mobs at ~2,000 a
   swing, i.e. a pack deleting a full-HP character in a round — not hard, just unplayable. Say the
   word and I will go further anyway; it is one constant.
4. **Nightmare drops are 33% of what they were** — exact thirds of the matching normal table, mob
   rolls and the band's MVP pool both.
5. **Sprites: there are none to add, and here is why.** Gear is drawn per *weapon type* — every sword
   in the game draws the same sword, every bow the same bow — so a renamed row was already using the
   right art. What actually distinguishes gear on the character is the **rarity colour**, and that is
   what the N rarity now owns. If you want the 210 Nightmare items to have genuinely *unique* art
   (new silhouettes, not a recolour), that is a sprite-pack job of its own; the recolour is live now.
6. **The map panel.** Endless Echo's card is in the map window with the settled rules and a disabled
   entry button until v77, and the hopping is fixed: the real scroller on a phone is the window stack,
   not the panel body, so a rebuild was resetting it every time you tapped a stage. It now restores
   the scroll by number and only nudges the control you pressed when it is actually off screen.

---

## Suggested next step

If this reads right: I build the trial as **v77** — entry card on the Abyss map card, the 5-minute run
in the existing field engine with a dummy that has no AI, a **best-run-DPS board** in the same worker
as the kills board (`period=weekly|all`, MAX instead of delta, LIMIT 50), Shards in the Index, the
exchange table in Part 3, and the DPS milestone ladder in Part 4. v77 also ships a `trial_sim` that
computes expected DPS from the live formulas, so the ladder can be checked before a browser is
involved. Nothing in it touches the Nightmare band you are about to play-test.
