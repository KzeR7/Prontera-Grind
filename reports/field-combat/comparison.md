# Real-field combat comparison — timing only

> Reward-rate warning: fourth-job fixtures use GM x100 rewards; third-job fixtures use ordinary player rates. These native absolute rates must not be compared across tiers. Read `results.md` for ordinary-rate normalized results.

**Exploratory simulations, not the owner’s save or a deployed browser test. No game balance was changed.**

Before uses only the pre-v177 `playerAttack()`; after uses current timing. All other source and each paired starting build/field/RNG seed match.

3 seeds; 180 seconds per farming session; independent boss attempts up to 90 seconds, stopped on first death or victory. Actual movement, enemies, escorts, critical resistance, healing, procs and deaths are enabled. No pets.

## Assumptions

- GX is a proxy, not the user save: visible base STR120/AGI120/LUK120/DEX16/VIT2/INT1, +15 Infernal katar base chosen to reproduce visible weapon ATK14212, visible weapon affixes ASPD74/CDM45/ATK90/LUK83, inferred +9/+8/+7/+8/+8 other refinements. Unseen armor rolls/cards/skills/Ascension are model assumptions. No claim to reproduce the screenshot HUD DPS.
- All fourth jobs: level150, max ordinary inherited/class skills, 50 shared points (Might/Precision/Ferocity/Vitality/Evasion each10) and 30 class points (each upgrade rank5); legal max-budget synthetic account. Curated eligible three-star Nightmare cards, max card mastery and no pets.
- Casters: corrected +15 GM presets, identical gear for INT-focused and INT/ASPD; base INT120 in both. INT-focus spends toward DEX/LUK/VIT before AGI; INT/ASPD buys AGI120 and DEX60 before the remaining priorities. There is an actual point-budget trade-off, not free AGI.
- Third jobs: completed +10 N+ benchmark gear/cards/mastery; strip AGI/ASPD affixes and speed/AGI cards identically across all speeds, then purchase base AGI1/60/120 and allocate the remaining legal budget. These are speed-isolation fixtures, not claims of optimized N+ builds.
- Current corrected PR101 item bases are identical on both timing sides. No gameplay tuning, caster buff, equipment-gated timing or test-limit relaxation was applied.

**Use EXP/min, boss clears/min, boss outcomes and deaths together. Boss death despawns surviving escorts, so a lower total kill count can coexist with faster boss farming. Raw/HUD-style DPS counts overkill.** Different fixtures are not a comprehensive class-balance ranking.

## Abyss Nightmare Stage 5

| Build | ASPD start / peak current | EXP/min before → after | EXP change | Boss clears/min before → after | Farm deaths before → after¹ | Boss wins before → after² | Boss win seconds before → after³ |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lord Knight sword AGI1 | 153.7 / 156.6 | 113.0K → 113.0K | +0.0% | 0.67 → 0.67 | 0 → 0 | 3/3 → 3/3 | 73.30 → 72.06 |
| Lord Knight sword AGI60 | 160.3 / 165.1 | 113.0K → 131.8K | +16.7% | 0.67 → 0.78 | 0 → 0 | 3/3 → 3/3 | 69.69 → 56.27 |
| Lord Knight sword AGI120 | 169.8 / 177.4 | 134.8K → 49.0K | -63.7% | 0.78 → 1.00 | 0 → 0 | 3/3 → 3/3 | 61.43 → 46.13 |
| High Wizard staff AGI1 | 151.8 / 151.8 | 391.7K → 391.7K | +0.0% | 2.22 → 2.22 | 0 → 0 | 3/3 → 3/3 | 20.58 → 20.58 |
| High Wizard staff AGI60 | 157.0 / 157.0 | 406.8K → 403.0K | -0.9% | 2.22 → 2.11 | 0 → 0 | 3/3 → 3/3 | 22.18 → 24.27 |
| High Wizard staff AGI120 | 164.6 / 164.6 | 406.8K → 444.4K | +9.3% | 2.22 → 2.44 | 0 → 0 | 3/3 → 3/3 | 21.70 → 22.60 |
| Sniper bow AGI1 | 156.7 / 158.0 | 22.6K → 30.1K | +33.3% | 0.67 → 0.89 | 0 → 0 | 3/3 → 3/3 | 62.24 → 60.63 |
| Sniper bow AGI60 | 165.3 / 167.4 | 30.1K → 33.9K | +12.5% | 0.89 → 1.00 | 0 → 0 | 3/3 → 3/3 | 58.12 → 50.29 |
| Sniper bow AGI120 | 177.8 / 181.1 | 33.9K → 45.2K | +33.3% | 1.00 → 1.33 | 0 → 0 | 3/3 → 3/3 | 54.31 → 42.04 |
| Assassin Cross katar AGI1 | 158.0 / 158.0 | 387.9K → 395.5K | +1.9% | 2.11 → 2.33 | 0 → 0 | 3/3 → 3/3 | 22.72 → 22.78 |
| Assassin Cross katar AGI60 | 167.4 / 167.4 | 448.2K → 491.1K | +9.6% | 2.56 → 2.67 | 0 → 0 | 3/3 → 3/3 | 20.04 → 18.79 |
| Assassin Cross katar AGI120 | 181.1 / 181.1 | 485.1K → 561.2K | +15.7% | 2.67 → 3.22 | 0 → 0 | 3/3 → 3/3 | 18.27 → 14.27 |
| Assassin Cross dagger AGI1 | 158.0 / 158.0 | 354.0K → 384.2K | +8.5% | 2.00 → 2.00 | 0 → 0 | 3/3 → 3/3 | 25.21 → 24.34 |
| Assassin Cross dagger AGI60 | 167.4 / 167.4 | 431.6K → 448.2K | +3.8% | 2.33 → 2.56 | 0 → 0 | 3/3 → 3/3 | 22.00 → 20.26 |
| Assassin Cross dagger AGI120 | 181.1 / 181.1 | 444.4K → 538.6K | +21.2% | 2.44 → 3.00 | 0 → 0 | 3/3 → 3/3 | 18.78 → 14.44 |
| High Priest mace AGI1 | 152.7 / 154.0 | 113.0K → 113.0K | +0.0% | 0.67 → 0.67 | 0 → 0 | 3/3 → 3/3 | 73.01 → 69.06 |
| High Priest mace AGI60 | 158.6 / 160.8 | 158.2K → 158.2K | +0.0% | 0.67 → 0.67 | 0 → 0 | 3/3 → 3/3 | 65.12 → 63.84 |
| High Priest mace AGI120 | 167.2 / 170.7 | 158.2K → 169.5K | +7.1% | 0.67 → 1.00 | 0 → 0 | 3/3 → 3/3 | 62.62 → 57.13 |
| Whitesmith axe AGI1 | 154.0 / 156.5 | 158.2K → 158.2K | +0.0% | 0.67 → 0.67 | 0 → 0 | 3/3 → 3/3 | 72.43 → 72.84 |
| Whitesmith axe AGI60 | 160.7 / 164.9 | 158.2K → 184.6K | +16.7% | 0.67 → 1.00 | 0 → 0 | 3/3 → 3/3 | 69.83 → 53.12 |
| Whitesmith axe AGI120 | 170.5 / 177.1 | 169.5K → 214.7K | +26.7% | 1.00 → 1.00 | 0 → 0 | 3/3 → 3/3 | 59.84 → 47.68 |
| Warlock int-focus | 167.0 / 167.0 | 60.85M → 61.82M | +1.6% | 8.11 → 8.33 | 0 → 0 | 3/3 → 3/3 | 5.04 → 3.93 |
| Warlock int-speed | 176.3 / 176.3 | 58.59M → 64.08M | +9.4% | 7.89 → 8.56 | 0 → 0 | 3/3 → 3/3 | 4.90 → 4.39 |
| Arch Bishop int-focus | 177.8 / 180.3 | 35.35M → 39.22M | +11.0% | 4.78 → 5.22 | 0 → 0 | 3/3 → 3/3 | 11.24 → 10.51 |
| Arch Bishop int-speed | 191.4 / 192.0 | 38.42M → 44.71M | +16.4% | 5.11 → 5.89 | 0 → 0 | 3/3 → 3/3 | 9.61 → 8.42 |
| GX Infernal proxy | 192.0 / 192.0 | 45.97M → 65.54M | +42.6% | 8.44 → 10.89 | 0 → 0 | 3/3 → 3/3 | 6.69 → 4.56 |

## Astral Stage 5

| Build | ASPD start / peak current | EXP/min before → after | EXP change | Boss clears/min before → after | Farm deaths before → after¹ | Boss wins before → after² | Boss win seconds before → after³ |
|---|---:|---:|---:|---:|---:|---:|---:|
| Warlock int-focus | 167.0 / 167.0 | 266.51M → 289.23M | +8.5% | 3.00 → 3.33 | 0 → 0 | 3/3 → 3/3 | 16.72 → 16.36 |
| Warlock int-speed | 176.3 / 176.3 | 261.34M → 294.40M | +12.6% | 3.00 → 3.33 | 0 → 0 | 3/3 → 3/3 | 15.11 → 14.26 |
| Arch Bishop int-focus | 177.8 / 180.3 | 149.78M → 167.34M | +11.7% | 1.67 → 2.00 | 0 → 0 | 3/3 → 3/3 | 31.09 → 26.32 |
| Arch Bishop int-speed | 191.4 / 192.0 | 167.34M → 195.23M | +16.7% | 2.00 → 2.33 | 0 → 0 | 3/3 → 3/3 | 29.53 → 24.20 |
| GX Infernal proxy | 192.0 / 192.0 | 136.35M → 190.07M | +39.4% | 3.67 → 5.11 | 1 → 0 | 3/3 → 3/3 | 14.09 → 9.94 |

## Thor Stage 1

| Build | ASPD start / peak current | EXP/min before → after | EXP change | Boss clears/min before → after | Farm deaths before → after¹ | Boss wins before → after² | Boss win seconds before → after³ |
|---|---:|---:|---:|---:|---:|---:|---:|
| Warlock int-focus | 167.0 / 167.0 | 181.67M → 190.71M | +5.0% | 0.00 → 0.00 | 0 → 0 | — | — → — |
| Warlock int-speed | 176.3 / 176.3 | 184.39M → 204.27M | +10.8% | 0.00 → 0.00 | 0 → 0 | — | — → — |
| Arch Bishop int-focus | 177.8 / 180.3 | 109.37M → 121.12M | +10.7% | 0.00 → 0.00 | 0 → 0 | — | — → — |
| Arch Bishop int-speed | 191.4 / 192.0 | 119.31M → 137.39M | +15.2% | 0.00 → 0.00 | 0 → 0 | — | — → — |
| GX Infernal proxy | 192.0 / 192.0 | 156.37M → 212.41M | +35.8% | 0.00 → 0.00 | 0 → 0 | — | — → — |

## Thor Stage 5

| Build | ASPD start / peak current | EXP/min before → after | EXP change | Boss clears/min before → after | Farm deaths before → after¹ | Boss wins before → after² | Boss win seconds before → after³ |
|---|---:|---:|---:|---:|---:|---:|---:|
| Warlock int-focus | 167.0 / 167.0 | 245.98M → 253.73M | +3.1% | 1.44 → 1.56 | 0 → 0 | 3/3 → 3/3 | 31.07 → 34.83 |
| Warlock int-speed | 176.3 / 176.3 | 238.23M → 275.03M | +15.4% | 1.33 → 1.67 | 0 → 0 | 3/3 → 3/3 | 36.44 → 32.11 |
| Arch Bishop int-focus | 177.8 / 180.3 | 133.64M → 156.88M | +17.4% | 0.67 → 1.00 | 0 → 0 | 3/3 → 3/3 | 60.78 → 53.61 |
| Arch Bishop int-speed | 191.4 / 192.0 | 156.88M → 166.57M | +6.2% | 1.00 → 1.00 | 0 → 0 | 3/3 → 3/3 | 56.20 → 47.18 |
| GX Infernal proxy | 192.0 / 192.0 | 0.00 → 7.75M | — | 0.00 → 0.11 | 40 → 38 | 0/3 → 0/3 | — → — |

¹ Deaths summed over all seeds, 9.0 total farming minutes per timing. ² Independent fresh-entry boss attempts with minions; Thor Stage 1 has no boss. ³ Mean of successful attempts only; never interpret missing or conditional win times as full kill-time parity.

## Speed-conditioned spell bonus

Arch Bishop inherits Zeal (`iagi`): at rank 5 it provides a 15% speed buff and its active value also multiplies direct skill damage when the attack interval is ≤0.131 seconds. This is an existing rule, not a new experimental caster buff. The JSON records peak ASPD and boosted cast counts.

## Current-timing damage composition (raw recorded DPS)

| Field | Build | Total | Basic | Direct skills | Procs⁴ | DoT | Effective (overkill capped) |
|---|---|---:|---:|---:|---:|---:|---:|
| Abyss Nightmare Stage 5 | Lord Knight sword AGI1 | 1.87M | 203.4K | 1.67M | 0.00 | 1.8K | 1.84M |
| Abyss Nightmare Stage 5 | Lord Knight sword AGI60 | 2.17M | 464.2K | 1.70M | 0.00 | 1.8K | 2.14M |
| Abyss Nightmare Stage 5 | Lord Knight sword AGI120 | 2.44M | 759.2K | 1.68M | 0.00 | 1.8K | 2.43M |
| Abyss Nightmare Stage 5 | High Wizard staff AGI1 | 5.32M | 129.5K | 4.49M | 696.1K | 0.00 | 5.07M |
| Abyss Nightmare Stage 5 | High Wizard staff AGI60 | 5.19M | 228.2K | 4.36M | 610.4K | 0.00 | 4.97M |
| Abyss Nightmare Stage 5 | High Wizard staff AGI120 | 5.81M | 467.8K | 4.70M | 645.7K | 0.00 | 5.54M |
| Abyss Nightmare Stage 5 | Sniper bow AGI1 | 1.73M | 213.5K | 1.51M | 0.00 | 0.00 | 1.72M |
| Abyss Nightmare Stage 5 | Sniper bow AGI60 | 1.94M | 487.5K | 1.46M | 0.00 | 0.00 | 1.93M |
| Abyss Nightmare Stage 5 | Sniper bow AGI120 | 2.30M | 759.6K | 1.54M | 0.00 | 0.00 | 2.28M |
| Abyss Nightmare Stage 5 | Assassin Cross katar AGI1 | 5.69M | 331.1K | 5.13M | 229.3K | 0.00 | 5.17M |
| Abyss Nightmare Stage 5 | Assassin Cross katar AGI60 | 6.70M | 762.0K | 5.38M | 561.8K | 0.00 | 6.11M |
| Abyss Nightmare Stage 5 | Assassin Cross katar AGI120 | 7.61M | 1.21M | 5.55M | 846.7K | 0.00 | 7.15M |
| Abyss Nightmare Stage 5 | Assassin Cross dagger AGI1 | 5.20M | 313.0K | 4.66M | 233.0K | 0.00 | 4.77M |
| Abyss Nightmare Stage 5 | Assassin Cross dagger AGI60 | 6.17M | 697.0K | 4.97M | 509.6K | 0.00 | 5.75M |
| Abyss Nightmare Stage 5 | Assassin Cross dagger AGI120 | 7.25M | 1.11M | 5.34M | 803.2K | 0.00 | 6.81M |
| Abyss Nightmare Stage 5 | High Priest mace AGI1 | 1.82M | 117.1K | 1.49M | 215.0K | 0.00 | 1.81M |
| Abyss Nightmare Stage 5 | High Priest mace AGI60 | 1.98M | 197.2K | 1.58M | 202.9K | 0.00 | 1.96M |
| Abyss Nightmare Stage 5 | High Priest mace AGI120 | 2.20M | 379.3K | 1.60M | 218.4K | 0.00 | 2.18M |
| Abyss Nightmare Stage 5 | Whitesmith axe AGI1 | 1.94M | 214.4K | 1.73M | 0.00 | 0.00 | 1.84M |
| Abyss Nightmare Stage 5 | Whitesmith axe AGI60 | 2.38M | 526.3K | 1.86M | 0.00 | 0.00 | 2.31M |
| Abyss Nightmare Stage 5 | Whitesmith axe AGI120 | 2.79M | 909.7K | 1.88M | 0.00 | 0.00 | 2.69M |
| Abyss Nightmare Stage 5 | Warlock int-focus | 26.78M | 1.71M | 23.48M | 1.59M | 0.00 | 18.08M |
| Astral Stage 5 | Warlock int-focus | 34.50M | 1.58M | 30.80M | 2.12M | 0.00 | 31.74M |
| Thor Stage 1 | Warlock int-focus | 23.91M | 2.52M | 20.04M | 1.35M | 0.00 | 20.86M |
| Thor Stage 5 | Warlock int-focus | 31.86M | 1.66M | 28.20M | 2.00M | 0.00 | 30.78M |
| Abyss Nightmare Stage 5 | Warlock int-speed | 27.63M | 2.50M | 23.57M | 1.56M | 0.00 | 18.68M |
| Astral Stage 5 | Warlock int-speed | 35.65M | 2.38M | 31.18M | 2.09M | 0.00 | 32.59M |
| Thor Stage 1 | Warlock int-speed | 25.20M | 3.76M | 20.31M | 1.12M | 0.00 | 22.13M |
| Thor Stage 5 | Warlock int-speed | 36.17M | 2.48M | 31.54M | 2.15M | 0.00 | 34.55M |
| Abyss Nightmare Stage 5 | Arch Bishop int-focus | 13.27M | 2.18M | 10.08M | 1.00M | 0.00 | 11.49M |
| Astral Stage 5 | Arch Bishop int-focus | 20.84M | 1.93M | 17.16M | 1.74M | 0.00 | 20.36M |
| Thor Stage 1 | Arch Bishop int-focus | 13.90M | 3.25M | 9.55M | 1.10M | 0.00 | 13.25M |
| Thor Stage 5 | Arch Bishop int-focus | 19.79M | 1.99M | 16.21M | 1.59M | 0.00 | 19.64M |
| Abyss Nightmare Stage 5 | Arch Bishop int-speed | 15.18M | 2.69M | 11.47M | 1.03M | 0.00 | 12.91M |
| Astral Stage 5 | Arch Bishop int-speed | 22.30M | 2.51M | 17.95M | 1.84M | 0.00 | 21.57M |
| Thor Stage 1 | Arch Bishop int-speed | 15.69M | 4.14M | 10.42M | 1.13M | 0.00 | 14.99M |
| Thor Stage 5 | Arch Bishop int-speed | 23.38M | 2.54M | 18.94M | 1.91M | 0.00 | 23.08M |
| Abyss Nightmare Stage 5 | GX Infernal proxy | 24.72M | 7.63M | 12.58M | 4.50M | 0.00 | 22.32M |
| Astral Stage 5 | GX Infernal proxy | 24.22M | 7.80M | 11.74M | 4.67M | 0.00 | 24.02M |
| Thor Stage 1 | GX Infernal proxy | 23.81M | 9.86M | 7.86M | 6.09M | 0.00 | 22.97M |
| Thor Stage 5 | GX Infernal proxy | 23.27M | 7.44M | 11.26M | 4.57M | 0.00 | 23.27M |

⁴ Procs includes Twin Strike and `skillHit(..., proc=true)` paths, including delayed/ground-skill effects; this is an accounting category, not exclusively random on-hit procs. Raw JSON includes both timings and every seed.

## Validation

- 123 old/current pairs had byte-identical input state, field definitions and seed.
- 246 farming sessions and 216 independent boss attempts completed.
- Every session reconciled damage components against the game’s damage counter, effective ≤ raw damage, and counted kills against the game’s kill counter.
- Renderer/visual effects are stubbed; no GPU, production cloud account, owner-save or physical-device claims.
- These short seeded runs identify candidates for further testing, not a justified damage multiplier.

Reproduce with Node24 and the documented dependencies:
```sh
node tools/compare_field_combat.cjs reports/field-combat
```
