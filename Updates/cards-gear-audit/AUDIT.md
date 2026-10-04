# Cards & equipment — the simple version

**No game code was touched.** `BUILD` is still `ui-v35`. This is a measurement report.
Every number comes from `audit.js`, which lifts the real formulas out of `index.html` and runs
them over 200 rolled gear sets. Raw run: `audit-output.txt`. Re-run: `node Updates/cards-gear-audit/audit.js`.

The fixture is a maxed Lord Knight: Lv150, STR/AGI/LUK 120 (the game's own "three stats maxed"
shape), all line passives, standing on the Abyss Stage-10 field.

---

# 1. Where your power comes from

One layer added at a time:

| # | layer | auto-DPS | total | **this layer** |
|---|---|---|---|---|
| 1 | **level 150 + base stats** (no skills, no gear) | 6,972 | x1.0 | — |
| 2 | + skill passives | 8,717 | x1.3 | x1.25 |
| 3 | **+ equipment flat stats** (a +0 set) | 59,873 | x8.6 | **x6.9** |
| 4 | + refine to +10 | 136,610 | x19.6 | x2.3 |
| 5 | **+ affixes** (the random % lines) | 359,856 | x51.6 | **x2.6** |
| 6 | + nine Legendary ATK cards | 438,133 | x62.8 | x1.2 |

**One sentence:** your level and stats are 1 unit of power; what drops is **63 units** on top —
and the two biggest pieces are the equipment's own flat stats (x6.9) and its affixes (x2.6).
**Cards are the smallest layer (x1.2).**

The same table shows DEF going 93 -> 12,719 and max HP 5,774 -> 166,508. Section 5 explains why
that half is the worse problem.

---

# 2. Level & base stats — what they actually give

| what | formula | at Lv150 / STR 120 / AGI 120 / LUK 120 |
|---|---|---|
| **ATK** | `4 + level*2 + mainStat*1.5 + (DEX+LUK)*0.25` | **~581** |
| **Crit** | `3 + LUK*0.4` (cap 60%) | **51%** — already near the cap |
| **Crit damage** | `x2 + LUK*0.01 + DEX*0.005` | x3.21 |
| **Attack speed** | AGI, but **caps at 50% faster** (AGI 83) | at the cap |
| **DEF** | `level*0.5 + VIT*0.5` | 93 |
| **Max HP** | `level*20 + VIT*8` | 5,774 |

So levels and stats are worth a lot of **crit and attack speed**, and only about **580 ATK**.

**One +10 Legendary weapon is worth 6,990 ATK on its own — 12x everything your level and stats
give you combined.** That single fact is the whole problem: grinding can't keep up with drops.

---

# 3. Equipment — exactly what it gives

Every item carries **two things**: one flat stat, and 1-3 random affixes.

### a) The flat stat (`val`) — one per item

| slot | feeds | at Lv99, high tier, Legendary | after +10 refine |
|---|---|---|---|
| weapon | **ATK** | 2,996 | **7,490** |
| headgear | **Max HP x4** | 4,993 | 12,483 |
| accessory | Max HP x3 | 2,496 | 6,240 |
| armor | DEF | 1,997 | 4,993 |
| legwear | DEF | 1,498 | 3,745 |
| shield | DEF | 1,498 | 3,745 |

`val = base x section[1 / 2.2 / 4 / 7] x (1 + level x 0.15) x rarity[1 to 4.5]`, and
`refine adds 15% of val per level` (x2.5 at +10).

### b) The affixes (the random % lines)

1-3 per item, from this pool. An **endgame Legendary affix** is worth:

| affix | value | affix | value |
|---|---|---|---|
| ATK % | **+21%** | Max HP | +320 |
| Crit DMG % | +40% | Crit % | +12 |
| ASPD % | +16% | LUK/STR/etc. | +27 |

**Each of the seven slots rolls from the same pool independently**, so a Legendary set (21 affix
draws from an 11-stat pool) averages ~1.9 ATK affixes (**+40% ATK**), ~1.9 Crit-DMG affixes
(**+76% Crit DMG**) and ~1.9 ASPD affixes (**+30% ASPD**); the ceiling — every one of the 21 draws
an ATK roll — is **+441%**. Those multiply together, which is the **x2.6 DPS** the waterfall
measures: affixes alone are worth more than a second full set.

*(Corrected 2026-10-04: this table used to read +22% / +240 / +30% / +9 / +12% / +20, because the
audit tool computed the affix scale as `AM x section` instead of `AM x (1 + section)`. The single
affix is `round((1+section) x AM[grade] x weight x rnd(0.8,1.25))`; at section 3 + Legendary that is
a scale of 26, so a max-roll ATK affix is +26% and the expected roll is +21%.)*

### c) Refine

A real ore sink: +0 -> +5 costs 5 ores, +0 -> +10 averages **154 ores** (a failure above +5 drops
the item a level). Most players will sit near +5, which is x1.75, not x2.5.

### d) Cards

| grade | ATK % | Max HP | Crit DMG % | ASPD % |
|---|---|---|---|---|
| Common | +1% | +12 | +2% | +1% |
| Uncommon | +2% | +24 | +3% | +1% |
| Rare | +2% | +36 | +5% | +2% |
| Legendary | **+4%** | **+60** | **+8%** | +3% |

A weapon holds 2-3 cards, each other slot holds 1. **One Legendary ATK card = +2.7% damage; the
full set of nine = +22%.** Small on their own — they only look big because they land on a number
gear already multiplied.

---

# 4. Suggested nerf — staged, pick how far

> **The owner has since chosen a different shape: flat base / 3, with the power handed back through
> affixes and cards.** That variant is measured at the bottom of `audit-output.txt` (section 7) and is
> what `tuning-sheet.html` is built from: flat base ÷3 = **x0.38** of today's DPS on its own; plus
> affix magnitude ×1.3 and card values ×1.3 it lands at **x0.48** (a 52% nerf, mobs still die in
> 0.26s). The one catch is max HP: the flat value of **headgear and accessories is the HP**, so
> dividing those two slots cuts max HP 166,508 → 60,099 — the sheet's default is to keep those two
> slots (same damage nerf, HP untouched). The staged plan below stays as the reference scale.

Each stage includes the one above. Same maxed character, measured:

| stage | auto-DPS | vs today | mob TTK | boss TTK | max HP |
|---|---|---|---|---|---|
| **today** | 438,133 | — | 0.13s | 1.5s | 166,508 |
| **STAGE 1** affix cap 2/item + `AM -> 1, 1.5, 2.2, 3, 4.5` | 289,248 | **x0.66** | 0.19s | 2.3s | 165,286 |
| **STAGE 2** + flat value down (level term `.10`, Legendary `3.5`) | 164,025 | **x0.37** | 0.34s | 4.0s | 91,358 |
| **STAGE 3** + refine `15% -> 10%` per level | 135,216 | **x0.31** | 0.41s | 4.9s | 74,351 |
| **STAGE 4** + cards `CV -> 1, 1.5, 2, 2.5` | 121,704 | **x0.28** | 0.45s | 5.4s | 74,351 |

### Recommendation: **STAGE 2**, plus the DEF change below.

STAGE 2 takes gear from x60 to x18 and cuts the HP bar from 166k to 91k, while the endgame loop
stays fast — a mob still dies in a third of a second. STAGE 3 is optional (refine is a fine sink,
it's just very strong per level). STAGE 4 is the cards, which move almost nothing.

The lines to change (`index.html`):

```
line 197  RAR: Fine 1.35 -> 1.3, Rare 1.9 -> 1.7, Epic 2.8 -> 2.3, Legendary 4.5 -> 3.5
line 198  AM=[1,1.6,2.6,4,6.5]              -> AM=[1,1.5,2.2,3,4.5]        (STAGE 1)
line 198  CV=[1,2,3,5]                      -> CV=[1,1.5,2,2.5]            (STAGE 4)
line 846  it.val*(1+(it.r||0)*.15)          -> * (1+(it.r||0)*.10)         (STAGE 3)
line 964  (1+l*.15)*RAR[t].m                -> (1+l*.10)*RAR[t].m          (STAGE 2)
line 965  n=[1,1+ri(0,1),2,2+ri(0,1),3][t]  -> last rung 3 becomes 2        (STAGE 1)
```

---

# 5. The other half: equipment makes you invulnerable

`index.html:1512` subtracts `def*0.6` from every incoming hit, **floored at 1**. So:

| DEF | mob hit today | mob hit with the fix | boss hit today | boss hit with the fix |
|---|---|---|---|---|
| 93 (naked) | 1,178 | 1,206 | 1,690 | 1,706 |
| 7,112 (mid-game +10) | **1** | 444 | **1** | 628 |
| 12,719 (endgame +10) | **1** | 308 | **1** | 436 |

A geared character takes **exactly 1 damage from every mob and every boss in the game**. Change it
to a capped percentage reduction:

```
index.html:1512   ... - (m.mag?mdef():def())*.6
                ->  * (1 - Math.min(.75, (m.mag?mdef():def()) / ((m.mag?mdef():def()) + 4000)))
```

That leaves the early game within 0-2% of today (naked DEF is only 93), gives mid-gear 26-46%
reduction and endgame 60-75%. **This is the single biggest "equipment is too strong" fix**, because
right now the defensive half of gear doesn't soften combat, it deletes it.

---

# 6. Straight answers

**Are the cards too strong?** No. One Legendary card is +2.7% damage; the whole nine-card set is
+22%; they behave identically at Lv6 and Lv150. Nerfing only cards moves endgame power by x0.91.

**Is the equipment too strong?** Yes. Flat stats x6.9, affixes x2.6, refine x2.3 — **x48 together**
— and defensively it makes you immune (1 damage a hit).

**What should I change?** STAGE 2 + the DEF line. That's five constants and one formula.

---

## Reference

### Where drops come from

* Rarity is fixed by the **map** (maps 1-2 Common, 3-4 Fine, 5-6 Rare, 7-10 Epic) — except a
  **Stage-10 boss, which is always Legendary on any map**.
* Gear: 3 rolls per mob at 4.8 / 4.0 / 3.2%. A Stage-10 boss drops its whole pool at 2.4% each.
* Cards: 0.45% per mob, 0.08% per boss, at every stage and map. Grade by stage (1-3 Common,
  4-7 Uncommon, 8-9 Rare, boss Legendary); each map's boss card is a **fixed** stat.
* Selling is pocket money on purpose: 1,825z for a top-grade item.

### The milestone picture (stage-5 field on each map, level-matched)

| map | Lv | DPS naked | DPS geared | gear x | mob dies in (naked / geared) |
|---|---|---|---|---|---|
| Prontera | 6 | 202 | 323 | x1.6 | 1.7s / 1.1s |
| Izlude | 17 | 413 | 620 | x1.5 | 2.0s / 1.3s |
| Geffen | 27 | 603 | 1,075 | x1.8 | 1.4s / 0.8s |
| Morroc | 39 | 824 | 1,470 | x1.8 | 1.0s / 0.6s |
| Payon | 52 | 1,073 | 2,450 | x2.3 | 0.8s / 0.3s |
| **Comodo** | 63 | 1,495 | 9,177 | **x6.1** | 12.2s / 2.0s |
| Louyang | 70 | 1,817 | 24,348 | **x13.4** | 13.6s / 1.0s |
| Amatsu | 77 | 2,161 | 29,352 | x13.6 | 14.8s / 1.1s |
| Niflheim | 85 | 2,586 | 34,189 | x13.2 | 15.5s / 1.2s |
| Abyss | 95 | 4,192 | 57,438 | x13.7 | 12.3s / 0.9s |

*(auto-attacks only — a real skill rotation is ~17x these numbers, so the ratios are what matter.)*

Two things to note: gear barely matters until Payon and then becomes the entire character, and
**there is a cliff at Comodo** — maps 1-5 pick their gear section from your level, but every map
from Comodo up is pinned to section 3 (`index.html:582`), a 3.2x jump in `val` at one map boundary.
Worth smoothing later.

### Before you change anything

* **Pets ride `atk()`**, so any ATK nerf shrinks pets by the same ratio — the "one maxed pet = one
  maxed character" rule in `pet_sim.js` still holds.
* **Skills are multipliers on the same base**, so every ratio here carries into the skill rotation.
* **Three suites pin these numbers** and need their expectations moved: `gear_sim.js`
  (rarity/rates/sell), `card_sim.js` (CV, AB, grade gating), `economy_sim.js` (pacing).
  `pet_sim.js` will print different endgame numbers but its rule is unaffected.
