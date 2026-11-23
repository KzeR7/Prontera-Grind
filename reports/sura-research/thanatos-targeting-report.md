# Thanatos boss-targeting research

Research only, 2026-11-23, against pre-change commit `824511bd35e9fedda474a331546048c405ef1b66`. No gameplay files were changed for this experiment. The priority behavior was injected into the HTML **in memory** for the simulation. It selects an alive, engaged boss when Sura's next rotation slot is a ready Asura; ordinary movement brings Sura to the boss, and the boss can remain the current target afterwards. This is a prototype, not a production implementation or an isolated redirect of only the hit.

## Method and limitations

- Actual Astral Citadel solo raid boss-stage spawn and combat update loop, including boss armor (50%, before stars), boss crit resistance (55%), escorts, raid hazards, movement, actual skills and Asura retreat. Stage entry is jumped directly to stage 4; these results are not the full-run raid DPS meter.
- Fresh game for each seeded run. Five seeds: 123, 321, 456, 789 and 987. Each pair uses the same seed. As soon as the boss dies, the fight is stopped; otherwise it stops on defeat or at 180 seconds.
- Synthetic Lv150 builds, six Infernal Mythic pieces, max ordinary skills, 50 Ascension points and rank 5 class skills, no cards, stars, pets or card mastery. Sura weapon +15, GX +14; the others +15. Other equipment +15. These are GM-generated builds, not the player's actual builds. They do not establish gear parity beyond the stated settings.
- Two starting conditions: **natural** selects the boss as the actual stage spawn does; **escort-engaged** explicitly forces the starting target to a regular escort. The latter tests a possible targeting problem but is not a measured frequency in live runs.
- Two survival modes: **normal** runs the encounter without intervention; **invulnerable** restores player HP to maximum before each update to isolate damage and prevent death. Mechanics and movement otherwise remain active. Invulnerability is not representative of a real player and can change combat conditions.
- Headless test harness mocks rendering, including `dotTick` damage-number display; damage-over-time ticks themselves are still processed in the combat update loop. Class-specific effects and the player's rotation/build can change the comparison. No player save was used.
- Boss DPS = boss HP actually removed / encounter seconds, capped at boss maximum HP. Total DPS = cumulative character damage to all enemies / encounter seconds; it can include overkill and escort damage. Both are means of per-run DPS, not the ratio of mean damage to mean time. Groups can have different durations, especially when a boss dies; GX/Geneticist/Mechanic invulnerable tests hit the 180-second cap. Therefore DPS across groups is not a controlled fixed-duration comparison.

## Natural boss target — invulnerable

Means of five runs; 5/5 Sura fights killed the boss; all GX, Geneticist and Mechanic runs were censored at 180 seconds without a kill.

| Class / mode | Boss DPS | Total DPS | Time | Asura boss / mob |
| --- | ---: | ---: | ---: | ---: |
| Sura current | 9.005M | 16.503M | 101.37s | 83 / 5 |
| Sura priority prototype | 9.322M | 16.808M | 98.02s | 86 / 0 |
| Guillotine Cross current | 4.430M | 8.055M | 180s | — |
| Geneticist current | 3.547M | 7.504M | 180s | — |
| Mechanic current | 2.213M | 6.200M | 180s | — |

Sura priority was +3.5% mean boss DPS and 3.3% shorter mean kill time here. Variance is important: seed 123 took 96.20s current versus 107.87s priority, so this is not a consistent gain in all five trials. GX and Sura results do not reproduce the player's live ranking and cannot be used to tune against the player's build.

Geneticist's mean boss DPS was ~60% higher than Mechanic in this artificial capped test, despite the historical stationary fitting target of 110% single target. The numbers are a reason to investigate, not enough evidence for a nerf; Different skills, gear and finite boss HP particularly limit inference.

## Deliberately start on an escort — invulnerable

Five Sura runs in each group, all killed the boss:

| Mode | Boss DPS | Total DPS | Mean kill time | Asura boss / mob |
| --- | ---: | ---: | ---: | ---: |
| Current | 7.413M | 14.680M | 123.05s | 84 / 24 |
| Priority prototype | 8.980M | 16.424M | 102.01s | 88 / 0 |

Prototype: +21.1% mean boss DPS, +11.9% mean total DPS, and 17.1% shorter mean kill time in this deliberately constructed case. This does **not** imply the same gain in the player's normal raid. Priority switches the main current target, so subsequent non-Asura attacks may also hit the boss; the result is not the isolated effect of changing Asura's primary target alone.

## Normal survival

All five runs in each normal-survival group ended in a solo defeat before the boss was killed. In the natural-target Sura runs, all 15 Asuras hit the boss in both current and prototype; results were identical: 10.112M boss DPS, 31.600M total DPS, 17.37s mean to defeat. In the forced-escort Sura runs, current averaged 2.116M boss / 35.689M total DPS with 0/17 Asuras on the boss; priority averaged 8.168M boss / 31.962M total DPS with 15/15 on the boss. Their mean survival times were different (19.41s and 17.53s), so those short averages are not a clean sustained-DPS comparison.

## Reproduce

From the repo root (requires Node and npm registry access):

```sh
npm install --no-save --package-lock=false jsdom@22 three@0.128.0
node reports/sura-research/thanatos-targeting.cjs > reports/sura-research/thanatos-targeting-results.jsonl
CLASSES=Geneticist,Mechanic SCENARIOS=natural node reports/sura-research/thanatos-targeting.cjs > reports/sura-research/thanatos-geneticist-results.jsonl
```

The script asserts six Infernal pieces and the raid boss's crit resistance and armor. `SEEDS`, `SURVIVAL`, `SCENARIOS`, and `CLASSES` environment variables can reduce the run. The complete per-seed observations are in the two JSONL files.

## Implemented v466: priority plus 10% personal damage

After approval, the working-tree implementation was tested with the same five seeds and invulnerability method. These numbers combine both changes; they are not the priority-only prototype above. Both variants killed the boss in all five runs. The after runs are saved in `thanatos-sura-v466-results.jsonl`.

| Starting target | Build | Boss DPS | Total DPS | Mean kill time | Asura boss / mob |
| --- | --- | ---: | ---: | ---: | ---: |
| Natural | v465 current | 9.005M | 16.503M | 101.37s | 83 / 5 |
| Natural | v466 | 10.721M | 19.764M | 85.79s | 76 / 0 |
| Forced escort | v465 current | 7.413M | 14.680M | 123.05s | 84 / 24 |
| Forced escort | v466 | 10.721M | 19.764M | 85.79s | 76 / 0 |

The natural case gained 19.1% mean boss DPS; the forced-escort case gained 44.6%. These gains exceed the 10% hit multiplier because of changed targets, fight length, rotation timing and randomness. They are **not predictions for the player's live 35–42M raid**. In these particular seeds, the implemented selection redirected the starting escort cases to the boss early, leading to the same results as the natural case. The boss cap, fake invulnerability, mocked visuals and synthetic equipment caveats above still apply.

To rerun v466 against the working tree:

```sh
SOURCE=working CLASSES=Sura SURVIVAL=invulnerable node reports/sura-research/thanatos-targeting.cjs > reports/sura-research/thanatos-sura-v466-results.jsonl
```

After integrating the newer raid changes and renumbering this game build to v467, the same v467 working-tree runs were repeated. All ten records matched `thanatos-sura-v466-results.jsonl` byte-for-byte. The fixed baseline mode also loads the v465 raid script from the historical source, so the earlier results remain reproducible.
