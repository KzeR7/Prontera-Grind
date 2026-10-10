# v98 progression, cards and farming guide

## Player rules

- Level cap 150; stat cap 120 from level 100; 2,811 points at 150. Three stats at 120 cost 2,790 points. Normal level-ups now grant the same points as resets.
- Thief, Assassin and Assassin Cross use STR. Only Mage/Wizard/High Wizard and Acolyte/Priest/High Priest receive the INT skill multiplier. Physical compensation is inside class/rank coefficients; interpolation preserves increasing attack power with rank.
- Ordinary critical chance still caps at 60%, plus up to 40% earned through Index. Normal and Nightmare boss resistance is unchanged. Criticals still apply to damaging skills.
- Crit damage: `1.9 + LUK*0.008 + DEX*0.005 + equipment/card CDM/100`. The smaller LUK contribution leaves room for physical skill compensation and stronger cards.
- Weapon base values, refinement and monster/boss HP were not retuned. Staff descriptions explain the 80% weapon-base contribution to MATK. Auto-equip explicitly compares base value, not total build damage.
- Affixes use slot-specific pools; VIT and a modest MATK percentage are supported. Fixed affix counts: Common/Fine/Rare/Epic/Legendary = 1/1/2/3/3. Crit DMG remains on weapons and accessories. Nightmare affixes no longer become weaker on later maps.
- Movement affixes appear on accessories and boots, with per-roll caps of 5% and 8%. Movement cards add other routes. Equipment and cards share a 20% movement cap; AGI and pet movement remain separate contributions.

## Cards

180 named definitions cover 90 monster families in normal and Nightmare forms. Their effects and eligible equipment slots are fixed. Live drops, offline drops, the map and guide use these definitions. Nightmare rotations now expose every family.

Limits: one equipped card per family (normal/Nightmare count together), two boss cards per build, one boss card per item, one Crit DMG card per item. Empty sockets can therefore support distinct damage, speed, defensive or farming choices.

Examples:

| Source | Purpose |
|---|---|
| Early Prontera movement cards | Travel and farming speed |
| Willow | INT plus MATK; early caster option |
| Mantis | STR plus ATK; physical specialist |
| Ordinary-monster damage cards | Farming rather than boss fights |
| HP%, DEF and MDEF cards | Survival choices |
| Niflheim Lord of Death | Accessory Crit DMG +0.35× normal / +0.50× Nightmare |
| Abyss Dark Lord | Weapon Crit DMG +0.50× normal / +0.75× Nightmare |

The Shard Store voucher now grants a normal boss card from Prontera through Amatsu. It cannot bypass the Niflheim/Abyss crit-card farms. Every boss voucher remains Legendary for existing Mastery reset requirements.

Legacy cards retain their old effect and can be converted individually into the named normal variant. Conflicting equipped cards return to loose inventory without being deleted. Mastery continues to use the original monster family. Existing saves receive free card removal and a free stat reset for played classes, plus any missing stat-point budget. No reset occurs just from opening the guide.

## Reforge

Choose the affixes to replace. Replacement stats and values are random; untouched affixes, refinement and cards are preserved. Payment is spent when the offer is rolled, including when keeping the old result. Paid offers persist through reload and can be accepted once. Resolve an offer before selling its item.

Base fee: `150,000 × (rarity index + 1)` Zeny.

| Service | Fee | Ore | Nightmare map material |
|---|---:|---:|---:|
| Full: all affixes | 1× | None | None |
| Double: 2 of 3 | 3× | 2 × rarity factor | 2 on Nightmare gear |
| Single: 1 protected selection | 6× | 4 × rarity factor | 4 on Nightmare gear |

On items with fewer than three affixes, selecting every affix uses the Full price. Ore follows weapon versus armor; Nightmare materials follow the item's saved map (legacy items default to Prontera).

## HP leech

Three Mastery ranks remain meaningful: each grants 0.5% actual basic-attack damage, up to 1.5%. Blood Siphon grants 0.5% actual pet damage while active. Combined actual healing cannot exceed 2% max HP in a rolling second. Overkill, fractional rounding and stored healing cannot bypass it. Regeneration, potions and explicit healing skills remain separate. This intentionally reduces sustain; an enemy whose incoming damage is lower than regeneration/defense may still fail to threaten an overgeared character.

## Guide

Index → Build & farming guide and Market → Upgrade planner provide class weapon choices, Farming/Boss damage/Survival card priorities, owned/equipped status, accessible/normal/Nightmare filters, real drop percentages and clickable source fields. The market guide is collapsible so supplies and paid reforge offers remain easy to reach. Recommendations are farming targets, not a promise that every listed item increases DPS.

## Verification and reproducibility

Baseline: `d164bd0527cfe335f9c183d0e576800716b7dd26` (the exact starting game). This replaces the older v97 comparison against its retired baseline.

```sh
NODE_PATH=/path/to/jsdom-and-three/node_modules node tools/progression_balance.js
NODE_PATH=/path/to/jsdom-and-three/node_modules node tools/progression_balance.js --skills
NODE_PATH=/path/to/jsdom-and-three/node_modules node tools/progression_balance.js --encounters
NODE_PATH=/path/to/jsdom-and-three/node_modules node tools/tests/skill_balance_sim.js
NODE_PATH=/path/to/jsdom-and-three/node_modules node tools/tests/progression_sim.js
```

The optional `--reuse-baseline` flag retains previously measured baseline rows; only use it when baseline setup is unchanged. Default commands regenerate both sides. Node 24, jsdom 26 and Three r128 were used.

- Gear: six transcendent classes, including both Assassin weapon routes, three level-150 equipment/card completion profiles, single and three-target fights: 42 comparisons, 120 measured seconds after warm-up. Completed profile has +10 Nightmare gear/full Mastery and legal named cards. Earlier profiles have +3/+6 gear, partial sockets and partial Index. Affixes are controlled representative rolls, not an exhaustive optimization of every legal equipment combination. New headgear MATK is included.
- Growth: all 19 classes, three level/rank profiles, both Assassin routes: 63 comparisons, 60 measured seconds after warm-up, with no cards or affixes. Physical stat points are redistributed away from INT using the documented legal budget.
- Encounters: 21 paired 120-second farming samples plus up to 120 seconds per real boss attempt. Includes incomplete normal builds and completed Nightmare builds, actual movement, enemy attacks and leech.
- The gate enforces completed DPS at most +20%, no sampled gear/growth build below -10%, and retained boss wins/no additional farming deaths. Intermediate profiles may gain more than 20%; the owner's upper limit applies to completed benchmark builds.

These are deterministic samples, not guarantees for every build, pet loadout, random affix combination or long-term farming rate. Companion scaling is measured but not held to the old v97 ±5% target. See the committed `progression_*.json` fixtures for exact builds, inputs and results.

## Final measured results

| Completed build | Single target | Three targets |
|---|---:|---:|
| Lord Knight | -4.49% | -7.99% |
| High Wizard | 12.11% | 12.83% |
| Sniper | 17.19% | 14.00% |
| Assassin Cross (katar) | 15.83% | 14.22% |
| Assassin Cross (dagger) | 9.24% | 7.16% |
| High Priest | 17.90% | 18.43% |
| Whitesmith | 3.14% | -8.99% |

All 14 completed comparisons stayed within −10% to +20%. Incomplete gear comparisons ranged from −8.75% to +25.34%; the upper allowance is specifically for completed builds. Growth samples across all classes ranged from −8.06% to +15.14%. Moving farming throughput ranged from −9.91% to +17.54%; all 21 sampled builds won their boss attempt, with no farming deaths in either version. These short samples do not establish long-run farming rates or every possible maximum-DPS setup.

Validation: 52 simulation/smoke suites passed, including the replacement balance gate. The new progression suite has 26 behavior checks. Final scoped reruns and the static publishing build passed. Shared Chromium verified live combat, desktop/390px guide layout, guide-to-map navigation, persistent reforge acceptance without a second charge, preserved refinement, and the updated 1.5% Index leech description.
