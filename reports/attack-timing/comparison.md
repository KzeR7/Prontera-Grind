# Attack-timing comparison — every class

**Before:** current game with only `playerAttack()` replaced by its pre-v177 version.
**After:** current attack timing. Neither side uses the October 10 balance baseline.

Each pair has identical equipment, stats, skills and combo configuration. No game code, equipment balance or test limits were changed.

120 measured seconds after a 20-second warm-up, at 30 simulation steps/second. This is the repository stationary combat harness, not a live boss or farming forecast. Pet damage is not added.

## Setups

- **early:** Novice/first/second jobs: existing configure profile 2 (Lv 10/49/99), synthetic +6 growth equipment, inherited skills up to rank 10.
- **third:** Third jobs: existing completed outfitted profile 2, Lv150 +10 N+ equipment/cards and card mastery. Matches earlier Sniper/High Priest examples.
- **fourth:** Fourth jobs: Lv150 corrected +15 maximum GM preset, empty sockets, maximum ordinary class skills, automatic six-slot combo, no allocated Ascension stats/skills, no pets or card mastery. This is not a fully maxed account.

Different tier setups are not directly comparable for class balance. Fourth-job numbers use corrected PR #101 GM bases on **both** sides.

## Fourth jobs — single target

| Class | Weapon | Before DPS | After DPS | Change |
|---|---|---:|---:|---:|
| Rune Knight | sword | 4.703M | 6.902M | +46.74% |
| Warlock | staff | 5.718M | 6.593M | +15.29% |
| Ranger | bow | 5.720M | 8.155M | +42.57% |
| Guillotine Cross | katar | 8.242M | 12.125M | +47.11% |
| Guillotine Cross | dagger | 9.213M | 13.554M | +47.12% |
| Arch Bishop | mace | 3.971M | 4.696M | +18.26% |
| Mechanic | axe | 4.462M | 6.658M | +49.23% |
| Mechanic | mace | 4.462M | 6.658M | +49.23% |

## Third jobs — single target

| Class | Weapon | Before DPS | After DPS | Change |
|---|---|---:|---:|---:|
| Lord Knight | sword | 2.821M | 3.421M | +21.23% |
| High Wizard | staff | 6.181M | 6.339M | +2.57% |
| Sniper | bow | 3.013M | 3.607M | +19.73% |
| Assassin Cross | katar | 8.188M | 10.025M | +22.44% |
| Assassin Cross | dagger | 7.808M | 9.393M | +20.30% |
| High Priest | mace | 2.433M | 2.813M | +15.62% |
| Whitesmith | axe | 2.757M | 3.460M | +25.50% |
| Whitesmith | mace | 2.757M | 3.460M | +25.50% |

## Second jobs — single target

| Class | Weapon | Before DPS | After DPS | Change |
|---|---|---:|---:|---:|
| Knight | sword | 7.81K | 7.95K | +1.85% |
| Wizard | staff | 16.55K | 16.55K | +0.00% |
| Hunter | bow | 15.28K | 15.82K | +3.53% |
| Assassin | katar | 23.81K | 24.41K | +2.51% |
| Assassin | dagger | 23.81K | 24.41K | +2.51% |
| Priest | mace | 6.12K | 6.32K | +3.19% |
| Blacksmith | axe | 9.88K | 10.23K | +3.58% |
| Blacksmith | mace | 9.88K | 10.23K | +3.58% |

## First jobs — single target

| Class | Weapon | Before DPS | After DPS | Change |
|---|---|---:|---:|---:|
| Swordman | sword | 1.16K | 1.16K | +0.00% |
| Mage | staff | 2.17K | 2.17K | +0.00% |
| Archer | bow | 2.06K | 2.06K | +0.00% |
| Thief | dagger | 2.15K | 2.15K | +0.00% |
| Acolyte | mace | 1.36K | 1.36K | +0.00% |
| Merchant | axe | 1.57K | 1.57K | +0.00% |
| Merchant | mace | 1.57K | 1.57K | +0.00% |

## Novice — single target

| Class | Weapon | Before DPS | After DPS | Change |
|---|---|---:|---:|---:|
| Novice | dagger | 118.44 | 118.44 | +0.00% |
| Novice | sword | 118.44 | 118.44 | +0.00% |

## Three-target aggregate DPS

Damage summed across three stationary targets, not DPS per target.

| Class | Weapon | Before DPS | After DPS | Change |
|---|---|---:|---:|---:|
| Novice | dagger | 118.44 | 118.44 | +0.00% |
| Novice | sword | 118.44 | 118.44 | +0.00% |
| Swordman | sword | 1.30K | 1.30K | +0.00% |
| Mage | staff | 3.88K | 3.88K | +0.00% |
| Archer | bow | 2.30K | 2.30K | +0.00% |
| Thief | dagger | 2.45K | 2.45K | +0.00% |
| Acolyte | mace | 1.58K | 1.58K | +0.00% |
| Merchant | axe | 2.08K | 2.08K | +0.00% |
| Merchant | mace | 2.08K | 2.08K | +0.00% |
| Knight | sword | 8.85K | 9.23K | +4.34% |
| Wizard | staff | 28.46K | 28.46K | +0.00% |
| Hunter | bow | 19.84K | 20.69K | +4.29% |
| Assassin | katar | 34.83K | 36.05K | +3.50% |
| Assassin | dagger | 34.83K | 36.05K | +3.50% |
| Priest | mace | 6.59K | 6.72K | +1.99% |
| Blacksmith | axe | 13.64K | 14.28K | +4.68% |
| Blacksmith | mace | 13.64K | 14.28K | +4.68% |
| Lord Knight | sword | 3.150M | 3.691M | +17.18% |
| High Wizard | staff | 8.598M | 8.779M | +2.10% |
| Sniper | bow | 3.156M | 3.758M | +19.10% |
| Assassin Cross | katar | 10.334M | 11.982M | +15.95% |
| Assassin Cross | dagger | 9.652M | 11.066M | +14.65% |
| High Priest | mace | 2.797M | 3.181M | +13.71% |
| Whitesmith | axe | 4.324M | 5.014M | +15.96% |
| Whitesmith | mace | 4.324M | 5.014M | +15.96% |
| Rune Knight | sword | 7.750M | 10.210M | +31.74% |
| Warlock | staff | 12.728M | 13.495M | +6.02% |
| Ranger | bow | 7.013M | 9.460M | +34.89% |
| Guillotine Cross | katar | 9.895M | 13.794M | +39.41% |
| Guillotine Cross | dagger | 11.061M | 15.419M | +39.39% |
| Arch Bishop | mace | 7.521M | 8.460M | +12.49% |
| Mechanic | axe | 6.494M | 8.964M | +38.04% |
| Mechanic | mace | 6.494M | 8.964M | +38.04% |

## Verification and limitations

- 25 classes; 33 weapon builds; 132 sessions (two timings × two target counts).
- Every pair passed identical input-state checks and unchanged ATK, MATK and base attack-interval checks.
- Total DPS includes both basic attacks and skills recorded by the established harness. `comparison.json` also includes basic-attack-only DPS, stats and input hashes.
- Matching initial random seeds does not force matching critical-hit sequences once attack order changes. Results are deterministic fixture measurements, not statistical confidence intervals.
- More basic attacks can also alter buff uptime, proc order and skill scheduling. A change in total DPS is not an item-stat change.
- Renderer/FX and selected effect callbacks are stubbed by the existing harness; these numbers are not a complete deployed-combat or physical-device measurement.

Reproduce from repository root with Node 24 and the documented jsdom/Three dependencies:

```sh
node tools/compare_attack_timing.cjs reports/attack-timing
```
