# v76 "Nightmare" — what was coded, and the trial-dungeon answers

Build: `2026-10-07 grind-v76 nightmare band and exclusive nightmare gear`.
This is the detailed summary you asked for, then the three open suggestions: **dungeon name**,
**what Trial Shards exchange into**, and **what a one-off milestone chest should reward**.

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

| | Mob HP | Damage a landed hit does (after a 75% DEF cut) |
|---|---|---|
| Abyss stage 10 (the old ceiling) | 56,013 | 389 |
| **Nightmare Abyss 15** | **1,391,304 (25x)** | **1,017 (2.6x)** |
| Nightmare Abyss 15 boss | 16,563,240 | — |

* **12x mob HP** and **1.5x mob damage** — the two knobs are single constants (`NMHP`, `NMATK`).
* The stage-15 boss has **12x the HP** of a stage-10 boss (`NMBOSSHP`).
* Nightmare monsters pay **1.5x EXP** and **1.6x Zeny** (`NMEXP`, `NMZENY`) — you get paid for the
  extra time, not just punished by it.
* **Ore** drops at **1.5%** a kill in the band (0.5% normally, 1% on a stage-10 boss field).
* Boss drop pool **9%** total instead of 6% (4.2% on the mid/endgame maps).
* **Bosses resist crit harder**, one figure per map, rising like the normal ladder:
  **35 / 35 / 36 / 36 / 38 / 38 / 40 / 40 / 42 / 45%**. A capped 60% crit build crits a Nightmare
  Abyss boss **33%** of the time (39% on Nightmare Prontera). The old ladder (15/15/15/20/30) is
  untouched for stages 1-10, and the map panel now prints whichever ladder the field you are reading
  actually uses — before this pass it printed the normal number on a Nightmare field.

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
* **210 new items**, names checked unique across the whole catalogue, same Legendary grade as the row
  they come from.
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
runs pay shards (2/day, scaled by damage band + personal best bonus), so the numbers below are sized
so a normal week of ranked runs buys roughly two cheap things and one expensive thing.

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

| Milestone | Chest holds |
|---|---|
| **Finish your first ranked run** | 25 Shards + title **Echo Novice** |
| **1,000,000 damage in one run** | 50 Shards + Oridecon ×10 + Elunium ×10 |
| **5,000,000 damage in one run** | 75 Shards + Pet Roll Ticket ×1 + Zeny Cache (250,000) |
| **10,000,000 damage in one run** | 100 Shards + title **Echo Adept** + Card Index Token ×1 |
| **25,000,000 damage in one run** | 150 Shards + Legendary Card Voucher ×1 |
| **Beat your own personal best by 10%** | 20 Shards (repeatable — this is the "keep improving" drip) |
| **Top 10 on a weekly board** | 100 Shards + title **Echo Breaker** |
| **Perfect 5:00 with zero deaths** (no buffs) | title **Untouched** — cosmetic flex only, no currency |

Why this shape:

* The first two chests are reachable by anyone in the mid-game, so the mode does not feel like a
  150-only club.
* The 10M / 25M rungs are the ones that need the Nightmare band's gear, which ties the trial to v76
  without gating either behind the other.
* Titles carry **no stats** — they are the prestige, the Shards are the shopping, and the two
  expensive exchange items keep the shopping from breaking the drop economy.
* Thresholds are easy to move: they are eight numbers in one array, and one test asserts the ladder
  stays strictly increasing.

**Open for you:** whether 25M (my top rung) is a 5-minute ceiling or a stretch, and whether the
season board should be **best score** (my recommendation — it is what personal-best bonus rewards) or
**total damage across the week**.

---

## Suggested next step

If this reads right: I build the trial as **v77** — entry card on the Abyss map card, the 5-minute
run in the existing field engine with a dummy that has no AI, a new `score` board in the same worker
as the kills board (`period=weekly|all`, MAX instead of delta, LIMIT 50), Shards in the Index, the
exchange table in Part 3, and the milestone ladder in Part 4. Nothing in it touches the Nightmare
band you are about to play-test.
