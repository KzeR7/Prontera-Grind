# Field-test results — ordinary reward rates

**No gameplay tuning was applied.** This compares old/current attack timing in memory, with identical starting builds per pair. 246 farming sessions (180 seconds each, three seeds) and 216 independent boss attempts (first win/death or 90 seconds). Real movement, enemy attacks, escorts, crit resistance, healing, shields and damage effects; headless renderer. No pets.

## Important qualifications

- GX is a **synthetic Infernal proxy**, not your saved character. Only visible base stats and weapon rolls could be matched; unseen equipment/cards/skills/Ascension are assumptions. The proxy has 228,638 ATK and 584,140 HP, versus 276,583 ATK and 424,803 HP in the screenshot, and has no pets. Its Thor5 failures must not be attributed to your actual character.
- Caster fixtures have +15 corrected Mythic gear, three-star cards, max card mastery and 50/30 Ascension budgets; they do not match the GX proxy’s full investment. Compare a build against itself, not absolute class rankings.
- Original fourth-job simulations retained the GM x100 reward setting used to generate gear. **All EXP/Zeny rates in this summary are normalized to ordinary Lv150 player rewards.** Normal EXP is calculated from each sample’s actual regular/boss kill counts using the unchanged real reward helpers, including integer rounding; it reconciles exactly to native measured rewards before normalization. Zeny uses the actual native/normal multiplier ratio. No combat result was changed.
- Boss death clears surviving escorts without awarding their kills. A faster boss clear can reduce total kills and EXP; use boss clears, income and survival together.
- Three seeds and three-minute windows are exploratory, not enough to set a balance multiplier.

## Thor Stage 1 — farming

| Build | Current peak ASPD | EXP/min old → current | Timing gain | Deaths old → current¹ |
|---|---:|---:|---:|---:|
| Warlock int-focus | 167.0 | 4.24M → 4.45M | +5.0% | 0 → 0 |
| Warlock int-speed | 176.3 | 4.30M → 4.77M | +10.8% | 0 → 0 |
| Arch Bishop int-focus | 180.3 | 2.55M → 2.83M | +10.7% | 0 → 0 |
| Arch Bishop int-speed | 192.0 | 2.78M → 3.21M | +15.2% | 0 → 0 |
| GX Infernal proxy | 192.0 | 3.65M → 4.96M | +35.8% | 0 → 0 |

## Astral Stage 5 — farming and independent boss trials

| Build | EXP/min old → current | Timing gain | Boss time old → current | Deaths old → current¹ |
|---|---:|---:|---:|---:|
| Warlock int-focus | 6.22M → 6.75M | +8.5% | 16.72s → 16.36s | 0 → 0 |
| Warlock int-speed | 6.10M → 6.87M | +12.6% | 15.11s → 14.26s | 0 → 0 |
| Arch Bishop int-focus | 3.49M → 3.90M | +11.7% | 31.09s → 26.32s | 0 → 0 |
| Arch Bishop int-speed | 3.90M → 4.56M | +16.7% | 29.53s → 24.20s | 0 → 0 |
| GX Infernal proxy | 3.18M → 4.43M | +39.4% | 14.09s → 9.94s | 1 → 0 |

All five Astral fixtures won all three independent boss trials with either timing.

## Thor Stage 5 — boss trials

| Build | Old timing: wins / time | Current timing: wins / time | Farm deaths old → current¹ |
|---|---:|---:|---:|
| Warlock int-focus | 3/3 · 31.07s | 3/3 · 34.83s | 0 → 0 |
| Warlock int-speed | 3/3 · 36.44s | 3/3 · 32.11s | 0 → 0 |
| Arch Bishop int-focus | 3/3 · 60.78s | 3/3 · 53.61s | 0 → 0 |
| Arch Bishop int-speed | 3/3 · 56.20s | 3/3 · 47.18s | 0 → 0 |
| GX Infernal proxy | 0/3 · — | 0/3 · — | 40 → 38 |

¹ Farming deaths summed over three seeds: nine minutes per timing. Boss time is the mean of winning independent trials only. GX has no successful independent Thor5 trial; a later farm clear does not make it a reliable farming build.

## Lv150 N+ — Abyss Nightmare Stage 5

All three AGI fixtures use identical speed-stripped gear; legal base-stat allocation differs. Ordinary N+ does not necessarily reach 192 ASPD.

| Build | Base AGI | Boss time old → current | Boss-time reduction | EXP/min timing change |
|---|---:|---:|---:|---:|
| Lord Knight sword | 1 | 73.30s → 72.06s | +1.7% | +0.0% |
| Lord Knight sword | 60 | 69.69s → 56.27s | +19.3% | +16.7% |
| Lord Knight sword | 120 | 61.43s → 46.13s | +24.9% | -63.7% |
| High Wizard staff | 1 | 20.58s → 20.58s | +0.0% | +0.0% |
| High Wizard staff | 60 | 22.18s → 24.27s | -9.4% | -0.9% |
| High Wizard staff | 120 | 21.70s → 22.60s | -4.1% | +9.3% |
| Sniper bow | 1 | 62.24s → 60.63s | +2.6% | +33.3% |
| Sniper bow | 60 | 58.12s → 50.29s | +13.5% | +12.5% |
| Sniper bow | 120 | 54.31s → 42.04s | +22.6% | +33.3% |
| Assassin Cross katar | 1 | 22.72s → 22.78s | -0.2% | +1.9% |
| Assassin Cross katar | 60 | 20.04s → 18.79s | +6.3% | +9.6% |
| Assassin Cross katar | 120 | 18.27s → 14.27s | +21.9% | +15.7% |
| Assassin Cross dagger | 1 | 25.21s → 24.34s | +3.4% | +8.5% |
| Assassin Cross dagger | 60 | 22.00s → 20.26s | +7.9% | +3.8% |
| Assassin Cross dagger | 120 | 18.78s → 14.44s | +23.1% | +21.2% |
| High Priest mace | 1 | 73.01s → 69.06s | +5.4% | +0.0% |
| High Priest mace | 60 | 65.12s → 63.84s | +2.0% | +0.0% |
| High Priest mace | 120 | 62.62s → 57.13s | +8.8% | +7.1% |
| Whitesmith axe | 1 | 72.43s → 72.84s | -0.6% | +0.0% |
| Whitesmith axe | 60 | 69.83s → 53.12s | +23.9% | +16.7% |
| Whitesmith axe | 120 | 59.84s → 47.68s | +20.3% | +26.7% |

## Findings

1. **The bonus reaches third-job N+ builds.** Faster physical examples clear the Abyss boss substantially sooner. At AGI120: Lord Knight 61.43 → 46.13s, Sniper 54.31 → 42.04s, Assassin Cross katar 18.27 → 14.27s, Whitesmith 59.84 → 47.68s.
2. **Caster speed investment already matters without a new magic buff.** Current Thor1 EXP/min is higher for INT/AGI than INT-focused variants of both casters. Warlock has no Zeal skill; Arch Bishop does.
3. **Arch Bishop already has speed-conditioned spell scaling.** Its inherited Zeal rank5 adds 15% speed; when the interval is ≤0.131s, its active value also multiplies direct skill damage by 1.15. The INT/AGI fixture reaches 192 ASPD and records boosted casts; the INT-focused fixture peaks around180 and records none. This is already implemented, not a hypothetical buff.
4. **A larger percentage gain does not establish stronger overall field performance.** These fixtures mix different investment assumptions. The GX proxy gains strongly in Thor1 but cannot reliably survive Thor5; do not use it to justify nerfing the owner’s GX or buffing all casters.
5. **No balance coefficient is justified yet.** First obtain the actual GX save (or complete loadout/skills/Ascension/pet details), and build matched-investment alternatives before making class-ranking or compensation decisions.

## Data and reproduction

- `comparison.md`: full native-rate field tables and damage-source composition.
- `comparison.json`: raw measured sessions, complete synthetic fixtures, assumptions and hashes.
- `ordinary-rates.json`: ordinary-rate summaries and all rate-conversion inputs.

```sh
node tools/compare_field_combat.cjs reports/field-combat
node tools/summarize_field_combat.cjs reports/field-combat
```
