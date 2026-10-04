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
