# Your tuning sheet, reviewed against the real code

**Date:** 2026-10-04 · **Your sheet:** `tuning-sheet.html`, 53 rows, answered in full ·
**Measured with:** `node Updates/cards-gear-audit/picks-check.js` (applies your exact values to the
extracted game and re-measures; raw output in the chat, script committed locally **unpushed**).

Nothing in `index.html` has been changed by this review. No BUILD bump. PR #15 is untouched.

---

## 1. What you sent, and what it does

| your answer | verdict | measured effect |
|---|---|---|
| weapon base **6 → 2** (÷3) | **good** — this is the main lever | endgame DPS **x0.48**, early game **x0.79** — the nerf scales *up* with progress, which is exactly what the audit wanted |
| armor 4, shield 3, legwear 3 **kept** | **good** | DEF untouched, and DEF is worth far more once the capped formula lands |
| headgear 10 **kept** | **good** | max HP intact from the x4 head slot |
| accessory **5 → 1.67** (÷3) | **conflicts with your own "HP slots kept" radio** | max HP **166,508 → 121,330 (x0.73)**. See §3 |
| section ladder / level term .15 / rarity kept | **good** | stops the nerf from hitting every level twice; concentrates it in flat gear value |
| affix magnitude **1 / 2.1 / 3.4 / 5.2 / 8.5** | **good** — the give-back works | per-affix **x1.40** at Fine, **x1.31** at Epic, **x1.33** at Legendary; Common gets nothing (early game takes the ÷3 whole) |
| affix counts, all 11 weights kept | **fine** | counts kept at 3 on Legendary is right — cutting them was stage 1 and it was the wrong lever |
| card values **1 / 2.6 / 3.9 / 6.5** | **good** | cards go from x1.24 to x1.25 of endgame DPS; the value of the *give-back* is that it makes collecting cards matter |
| field card 0.45% kept | **fine** | that is **45x** Ragnarok Online's 0.01% card rate — generous, but this is a browser idle game, not a 10,000-kill grind |
| boss card **0.08 → 0.05%** | **good** | still **5x** RO's rate, and a nice "collection" goal (10 maps × 1 fixed card each) |
| field rolls **5 / 5 / 3** (was 4.8 / 4 / 3.2) | **mildly odd** | field gear +8% at the same time boss gear -79%. Not harmful, just directionally inconsistent |
| boss gear **2.4 → 0.5%** | **defensible, but it barely moves the needle** | 4.6 → 22.2 boss kills per Legendary item (~2 → ~9 min), yet one +10 refine is still **513 waves (~3.6 h)**. The item rate is not the pacing bottleneck any more |
| mob/boss HP, ore rates kept | **good** | endgame mob TTK 0.13 → **0.26 s**, boss 1.50 → **3.10 s** (auto-attacks only) |
| DEF fix: **capped** `def/(def+4000)`, 75% | **right fix — but it does not create danger** | see §4: when geared you are still unkillable, by regen |
| Comodo cliff "high-tier only from field level 3" | **reconsider — see §2** | as implemented it makes late-map stage 1-2 drops *Novice-tier* gear |

---

## 2. The Comodo cliff, as written, is far harsher than the sheet's wording

The sheet said "high-tier only from field level 3". In the code the cliff lives in **two** places:

* `gearPool()` picks the item **names** (what can drop), and
* `fieldOf()`'s `sec` decides the drop's **numbers** (value and affix scale).

A patch to `gearPool()` alone only renames the loot — it changes no numbers, because the value
comes from the slot base × section, and the section is read from the mob. So the change has to
touch both, and "gate to the level table" then gives:

| map, field level | today | as picked ("level table") | floored at section 2 |
|---|---|---|---|
| Comodo stage 1 — gear value per drop | 532 | **70** | 315 |
| Comodo stage 1 — geared DPS | 6,870 | **1,443 (x0.21)** | 2,703 (x0.39) |
| Abyss stage 1 — gear value per drop | 1,044 | **162** | 650 |
| Abyss stage 1 — geared DPS | 34,697 | **4,151 (x0.12)** | 11,560 (x0.33) |

On maps 5-10, field levels 1-2 fall into `secOf()`'s first band = **section 0, Novice gear**, so a
level-90 character farming Abyss stage 1 is handed gear for a level-6 Novice. That is not "no free
high-tier gear", it is vendor trash — and stages 1-3 are exactly where a player farms to level up
on a new map.

**Recommendation:** floor the section at 2 for those two stages
(`sec = m>=5 ? (l>=3 ? 3 : 2) : secOf(l)`, and the same in `gearPool`) — you still kill the free
x3.2 step on arrival, but the drops stay usable (x0.33-0.39 instead of x0.12-0.21). Or drop the
cliff idea entirely: it is the one change in the set that makes the game *worse* to play in a
specific window.

---

## 3. The one contradiction: max HP drops 27%

You picked the "**HP slots kept**" radio — meaning headgear *and* accessories stay at today's base —
but typed `base_acc = 1.67` (5 ÷ 3). Headgear feeds max HP x4, each accessory x3, so the two
accessories are 6 of the 10 HP units in the set:

| variant | max HP at Lv150 (+10 Legendary) |
|---|---|
| today | 166,508 |
| **as typed** (weapon 2, accessory 5/3) | **121,330 (x0.73)** |
| the radio's reading (weapon 2, accessory 5) | 166,851 (x1.00) |

Your DPS is **identical** in both cases (accessories feed HP only), so this is purely "do I want
27% less HP?". Given §4, HP is not what keeps you alive anyway — but if the intent was "do not
touch the HP slots", type `5`. If you *do* want HP down, better to do it on purpose: accessory
`3.33` gives x0.87, and you can leave the radio honest.

---

## 4. The DEF fix is right, but it does not make the game dangerous

With your capped pick (`def/(def+4000)`, 75% max) plus the game's own regen (0.8% of max HP every
0.5 s = **1.6%/s**):

| gear | DEF | mob hit | regen/s | net/s | time to die | boss hit | net/s | time to die |
|---|---|---|---|---|---|---|---|---|
| naked | 93 | 1,206 | 92 | +712 | **8 s** | 1,706 | +1,329 | **4 s** |
| mid-gear +10 | 7,112 | 444 | 1,017 | **-721** | never | 628 | -493 | never |
| endgame (your picks) | 12,719 | 308 | 1,941 | **-1,736** | never | 436 | -1,578 | never |

So the fix restores the *naked/low-gear* game (you can actually die while levelling) and removes
the "1 damage from everything" absurdity at the top — but from mid-gear on, regen out-heals every
enemy in the game. Defence gear becomes decorative again, just for a different reason.

Three ways to make gear-gated danger real, cheapest first:

1. **Boss hits carry a share of your max HP** (one line): `d = max(flat, 0.04 * maxHp())`.
   4% per 1.2 s swing = 3.3%/s vs 1.6%/s regen → ~60 s to die if you stop fighting. Naked is
   unaffected (the flat part is bigger there).
2. **Slow regen** (one constant): 0.8% → 0.2% per 0.5 s makes any sustained fight a resource;
   combined with (1) it is the classic idle-game "boss check".
3. **Raise boss ATK** — measured: it would need **x5.3** (2,182 → ~11,600) to threaten an endgame
   character, and that same number one-shots a naked Lv150 (9,085 vs 5,774 HP). Flat ATK alone
   cannot do this job; that is why (1) exists.

This is a known genre trap, not a Prontera-specific bug: players of other idle RPGs report exactly
this — "there's no reason to do any defensive setups […] defense builds are somewhat meaningless"
([r/incremental_games](https://www.reddit.com/r/incremental_games/comments/1mo5dtx/endless_idle_rpg_v07_update/)).

---

## 5. Research: how your numbers compare to the game you are riffing on

* **Cards.** Ragnarok Online's classic card rate is **0.01% (1 in 10,000)**, MVP cards included
  ([west-games calculator](https://west-games.com/ragnarok-drop-rate-calculator/),
  [99porings](https://99porings.com/revo-classic/cards/cards)). At 0.45% a field card is **45x**
  that and your 0.05% boss card is **5x** — both still generous, so 0.05% is a safe cut. If you
  ever want cards to feel like *events*, 0.15% boss / 0.30% field is still 15-30x RO.
* **Refine.** RO's real +10 on a Lv4 weapon is **0.0384%** cumulative on classic servers, and even
  the friendliest private servers sit at **10-20%** for the last rungs
  ([iRO Wiki](https://irowiki.org/classic/Refinement_System),
  [NovaRO](https://www.novaragnarok.com/wiki/Refinement_System)). Our ladder is 100/100/100/100 then
  70/60/50/40/30/20 **with no break** — far kinder, which is right for an idle game. Keep it; but it
  is why ore supply, not the item drop rate, is the real gate (513 waves for one +10).
* **The DEF fix.** `reduction = def/(def + k)` is the standard diminishing-returns formula
  (League of Legends uses k = 100; Path of Exile and Diablo use the same shape). The usual tuning
  rule is *"set k to the armour of a fully geared character so the endgame sits near 50%"*
  ([CalculatorHub](https://calculatorhub.com/tools/armor-damage-mitigation-calculator/),
  [r/gamedesign](https://www.reddit.com/r/gamedesign/comments/pxhx8d/what_are_common_damage_formulas_for_games_that_have_attack_and_defense_stats/)).
  With your gear, `k = 4000` gives 64% at mid-gear and 76% (capped 75%) at endgame, so your pick is
  on the *strong* side of the convention — reasonable, because our DEF number is large.

---

## 6. What I would change before this becomes code

1. **Accessory: type `5` (or accept HP x0.73 deliberately)** — §3. No DPS difference either way.
2. **Comodo cliff: floor at section 2, or skip it** — §2. As picked it hands Novice gear to level-90
   players on stages 1-2 of every late map.
3. **Add a boss "% of max HP" damage component (4%)** — §4. Otherwise DEF stays decorative and the
   whole DEF decision is cosmetic above mid-gear.
4. **Field rolls back to 4.8 / 4 / 3.2** (optional) — you cut boss gear 79% and raised field gear 8%
   in the same sheet; one of the two is probably not what you meant.

Everything else in your sheet I would ship as typed: it lands the endgame at **x0.48 DPS**
(438,133 → 212,029), keeps the whole early and mid game within x0.76-0.81, leaves DEF and the refine
economy alone, and gives cards and affixes a reason to exist again.

**Net effect if implemented as recommended:** endgame DPS x0.48, mob TTK 0.13 → 0.26 s, boss TTK
1.50 → 3.10 s, boss Legendary items 1-in-4.6 → 1-in-22 kills, boss card 1-in-1,250 → 1-in-2,000
kills, max HP unchanged, DEF capped at 75%, and bosses can actually kill a geared character.

---

# Decisions (2026-10-04, after the owner's reply)

1. **Accessory base stays 5** (was typed 1.67). Max HP untouched at 166,508; the DPS figure is
   identical either way, so the ÷3 would have cost 27% of HP for nothing.
2. **Comodo cliff: softened, not disabled.** `sec = m>=5 ? (l>=3 ? 3 : 2) : secOf(l)` and the same
   floor in `gearPool()` - field levels 1-2 on maps 5-10 hand out section-2 gear (x0.33 of today)
   instead of Novice-tier gear (x0.12).
3. **Boss "% of max HP" hit: dropped - it would not have done anything.** Measured: the endgame
   boss dies in 3.1 s of auto-attacks (2 swings), so a 4%-of-max-HP swing removes 8% of HP while
   regen restores 5% in the same time - net -3% per boss wave, fully refilled while walking to the
   next wave. It would take **58 s of continuous boss contact** to kill a geared character, and
   even then death in this game only teleports the hero to the arena entrance and resets the wave
   (~5 s lost), so there is nothing there to buy with a slower boss fight. The DEF cap stays - it
   fixes the "1 damage from every monster" absurdity and restores real danger while levelling -
   but geared immortality is accepted as normal for the genre.
4. **Boss drops cut, ores kept** - the split the owner asked for: boss gear 2.4% -> 0.5% per pool
   item (one Legendary item per 22 boss kills) and boss card 0.08% -> 0.05% (one card per ~2,000
   boss kills, a long-term collection goal). Ore rates stay at 5% (boss) / 2% (minion), because
   refining is the long game: one +10 is still ~513 waves / ~3.6 h, and that is the pacing the
   drop cut is meant to protect rather than worsen.
5. **Field drops stay exactly as shipped** (4.8% / 4.0% / 3.2%). The sheet's 5/5/3 was a +8% raise
   nobody asked for; the owner's instruction was to cut *boss* drops.

---

# Round 2 (2026-10-04, later)

**Drop rates revised:** boss equipment 2.4% -> **1%** per pool item (one Legendary item per ~11
boss kills; 4.6 today), boss card 0.08% -> **0.1%** (one per 1,000 boss kills). Ores unchanged at
5% (boss) / 2% (minion) - correct, because refining is the long game and one +10 is still ~513
waves. Field rolls also stay as shipped.

**Why the sheet loses 52% of endgame DPS, and what "same DPS" would cost.** The flat-gear layer is
a **x6.87 multiplier** on the whole character, so cutting it is expensive to undo. The weapon /3
brings it to **x2.96**; the sheet's +30% give-back returns only **x1.26**, because affixes and cards
share one *additive* percentage pool. Measured give-back scale vs endgame DPS (weapon /3, nothing
else cut):

| give-back scale | AM (Common -> Legendary) | CV | endgame DPS | vs today |
|---|---|---|---|---|
| x1.0 (no give-back) | 1 / 1.6 / 2.6 / 4 / 6.5 | 1 / 2 / 3 / 5 | 167,962 | x0.38 |
| **x1.3 (your sheet)** | 1 / 2.1 / 3.4 / 5.2 / 8.5 | 1 / 2.6 / 3.9 / 6.5 | 211,174 | **x0.48** |
| x2.0 | 2 / 3.2 / 5.2 / 8 / 13 | 2 / 4 / 6 / 10 | 332,651 | x0.76 |
| **x2.53 (DPS-neutral)** | 2.53 / 4.05 / 6.57 / 10.11 / 16.43 | 2.53 / 5.06 / 7.59 / 12.64 | 437,867 | **x1.00** |

**The catch: "same DPS" and "balanced layers" cannot both happen** - the layers multiply, so the
layers that absorb the cut must be much bigger than the layer that was cut. Own multiplier per
layer (from the waterfall):

| layer | today | your sheet (x0.48) | neutral (x1.00) |
|---|---|---|---|
| gear flat value | **x6.87** | x2.96 | x2.96 |
| refine +10 | x2.28 | x1.99 | x1.99 |
| affixes | x2.63 | x3.28 | **x6.10** |
| cards (9x ATK) | x1.22 | x1.25 | x1.40 |
| **total** | **x62.8** | x30.3 | x62.8 |

So the neutral setting does not balance anything - it moves dominance from flat gear to **affixes**.
It also makes the loot lottery harsher (worst of 200 seeded sets = **26%** of the best, vs 40% on
the sheet and 46% today) and leaves the endgame exactly as trivial as today (mobs die in 0.13 s),
which was the problem the audit started from. **The sheet's own x1.3 setting is the one with the
flattest layer profile (1.25 - 3.28).** A middle setting of x2.0 (= x0.76 DPS) is the compromise if
the cut feels too deep.

# What shipped (v38, 2026-10-04)

`index.html` is `ui-v38 weapon-cut cards-carry`. Every number below is measured by
`node Updates/cards-gear-audit/audit.js` **against the shipped file itself** (section references
are that tool's sections). This is the round-3 brief applied: keep clears fast, keep damage high,
make *playing* the progression - at ~70% of the old endgame damage, with the power moved out of
flat drops and into affixes and cards.

## The knobs

| knob | was | shipped |
|---|---|---|
| weapon flat base | 6 | **2** (armour 4 / head 10 / shield 3 / legwear 3 / accessory 5 unchanged) |
| `AM` affix magnitude | 1 / 1.6 / 2.6 / 4 / 6.5 | **1.7 / 2.72 / 4.42 / 6.8 / 11.05** (x1.7) |
| `CV` card values | 1 / 2 / 3 / 5 | **3.2 / 6.4 / 9.6 / 16** (x3.2) |
| `AB.cdm` crit damage per point | 1.5 | **0.7** |
| Comodo cliff | high tier from field level 1 | high tier from **field level 3**, the drop's section floored at **2** |
| boss equipment | 2.4% per pool item | **1%** per pool item |
| boss card | 0.08% | **0.1%** |
| incoming damage | `atk - def*0.6`, floor 1 | **`atk * (1 - min(.75, def/(def+4000)))`**, floor 1 |
| `PETBAL` pets | 2.18 | **3.4** |
| field rolls, ores, accessory base, crit-rate cap | - | **unchanged** (4.8/4/3.2%, 5%/2%, 5, 60%) |

## The target, met (section 3b)

| | before | v38 |
|---|---|---|
| auto-DPS | 438,133 | **305,020 (x0.70)** |
| ATK | 32,291 | 19,524 |
| max HP | 166,508 | 167,289 |
| gear flat layer | x6.87 | **x2.96** |
| refine +10 layer | x2.28 | x1.99 |
| affix layer | x2.63 | **x3.70** |
| nine Legendary ATK cards | x1.22 | **x1.60** |
| everything on top of level+stats | x62.8 | x43.7 |

The weapon is now **78.8%** of the pre-multiplier ATK at the endgame (was 92.3%), one Legendary
ATK affix is **+36%** (was +21%), one Legendary ATK card is **+13%** (was +4%) and nine of them are
worth +60% ATK / x1.60 DPS (was +22% / x1.22).

## Every band moves, the top moves least (section 4)

x of the old geared DPS, stage-5 field at the middle of each map's level band:

| map | before DPS | v38 DPS | x |
|---|---|---|---|
| Prontera | 323 | 271 | 0.84 |
| Izlude | 620 | 523 | 0.84 |
| Geffen | 1,075 | 894 | 0.83 |
| Morroc | 1,470 | 1,205 | 0.82 |
| Payon | 2,450 | 2,016 | 0.82 |
| Comodo | 9,177 | 6,301 | **0.69** |
| Louyang | 24,348 | 18,536 | 0.76 |
| Amatsu | 29,352 | 21,409 | 0.73 |
| Niflheim | 34,189 | 24,168 | 0.71 |
| Abyss | 57,438 | 35,924 | **0.63** |

Comodo takes the hardest hit because that is where the cliff was: stages 1-2 of maps 5-10 now hand
out section-2 gear instead of high-tier gear. In exchange the endgame mob still dies in under a
second and a mid-game mob in 0.4-0.7 s, so the loop stays fast. The **card layer** column moved the
other way everywhere: +24-29% before, **+71-92%** now.

## Crit damage, the way the request was worded (section 1 + 3)

**Nerfed:** a Legendary CDM affix is **+40% -> +32%**, every point of crit damage buys 53% less than
it did, and nine Legendary CDM cards now add x1.17 DPS against the x1.60 that nine ATK cards add -
the CDM set sits **36.7% behind** the ATK set, where before v38 it was 7.4% behind. Crit-damage
stacking is no longer a shortcut; farming ATK cards is.

**Two footnotes so nothing is hidden:** a Legendary CDM *card* is +8% -> +11% in displayed value
(the x3.2 card give-back applies to every card - the per-point weight is what fell), and the raw
crit multiplier of a card-less endgame set is a little *higher* than before (x4.67 -> x5.08)
because `critD()` also feeds on LUK/DEX, and AM x1.7 fattens every stat affix. If the multiplier
itself should come down as well the knobs are `AB.cdm`, the LUK/DEX terms in `critD()`, or a cap.

## Pets (pet_sim, asserted)

`PETBAL` 2.18 -> **3.4**, because `petDmg = your ATK x PETBAL x ...` and the weapon cut cut pet
damage with it. At 3.4 a maxed pet measures **1.005x** a maxed character again (it was 1.000x), so
the pet:character rule the owner asked for still holds. In absolute terms a maxed Angeling is
7.61M -> 5.92M DPS in the suite's card-less fixture (x0.78) and x0.94 in the audit's card-heavy
endgame set: pets do not benefit from the card layer, so a full-card character out-runs its pet
sooner than it used to (0.74x -> 0.47x of a maxed character per pet). `PETBAL` is the one knob.

## What the drops do now (section 5)

* Boss: the whole 9-item pool at **1% each = 9% per boss** (was 21.6%) - about **1 Legendary item
  per 11 boss kills**, and 1 in 100 boss kills for one *specific* item. Card 0.1% = 1/1,000.
* Field mobs and both escorts: unchanged (4.8 / 4.0 / 3.2% per kill = 12%).
* Ores unchanged: +10 still costs ~154 ores / ~532k zeny, one stage-10 wave still pays ~0.30 ore,
  so +10 on one item is still ~511 boss waves (a 7-slot set ~3,576).

## Re-running the tools

* The full raw run is saved as `audit-output.txt` (header says which build it measured).
* `audit.js` runs against the shipped file (it now lifts `secField` and reads the flat bases and
  the `AB` weights out of `index.html`, so its tables cannot go stale again). Sections **6 and 7 are
  the pre-v38 simulations** and print "patch target not found" on this build - run them against a
  pre-v38 copy: `AUDIT_HTML=/path/to/pre-v38/index.html node Updates/cards-gear-audit/audit.js`.
* `picks-check.js` and `neutral.js` model the **pre-v38 baseline** on purpose (their patch sources
  are that build's strings); they now refuse politely on the shipped file and tell you to pass
  `AUDIT_HTML`. With it they reproduce the x0.48 sheet run and the give-back sweep exactly as
  before.
* `tools/tune_pacing.js` models the v38 loot cadence (.118 gear pickups per kill, was .126).
  Re-solving moves the shipped constants by **under 1%** (cA 132.993 -> 132.851, NE2 3.05002 ->
  3.04976, N100 419,344 -> 418,891, NE3 8.40338 -> 8.39503), so the EXP curve was left alone; the
  milestones still solve to 7 min / 2 h / 7 h / 48 h.
