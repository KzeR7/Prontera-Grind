# Sura combo and MVP research

Research against repository base `33fcf48a13cd7e1f32c3c75570ad56ab1faa3390`; no game changes. Prototypes are runtime-only and comparisons are exploratory, not release-ready balance conclusions. Node dependencies: `npm install --no-save --package-lock=false jsdom three@0.128.0`.

## Rotation/cooldown experiments

`node reports/sura-research/rotation.cjs` and `node reports/sura-research/paired-cooldowns.cjs` emit JSONL. A seeded real-update, stationary one-boss fixture: base level 150, uniform generated/refined unsocketed gear, no pets, ordinary skills maximum, no Ascension stats, all Sura skill ranks 1/3/5 as specified; 20 seconds warmup + 120 measured, three seeds. Cast counts and cycles cover the full 140 seconds, not the measured 120-second interval. Dummy has no critical resistance, cannot die, and uses Endless Echo trial mode: no Asura retreat. Rotations are ordered sky/tiger/rampage/gate/knuckle/asura. Temp prototype: Sky generates a sphere; tiger power x1.15; gate power x1.2 and execute .3; rampage +5% per active sphere; rank-5 knuckle +20% boss damage, quadratic by rank. Other current buffs auto-cast; includes inherited Call Spirits and Zen.

At rank 5 average DPS: knuckle 12s/asura 6s = 100,495, knuckle 10s or 8s or 7s or 6s/asura 6s = 108,460, knuckle 5s/asura 6s = 102,752, knuckle 5s/asura 5s = 166,786. For the 140s count, the first has 26 Sky casts, 9 Knuckle, 13 Asura; 6s Knuckle has 26 Sky, 13 Knuckle, 13 Asura; both 5s yield 24 of each. Making Knuckle faster alone can therefore *decrease* DPS because its extra casts affect rotation timing and Asura's 6s cooldown causes it to be skipped. Reducing Asura to 4s instead of 5s changed nothing in this fixture. Results are seed-sensitive and do not establish outcomes for every attack speed, interruption, sphere setup, or target switch. A lower cooldown cannot guarantee every attack under all conditions.

## Actual field encounters

`node reports/sura-research/boss-maps.cjs current` and `node reports/sura-research/boss-maps.cjs prototype` emit JSONL for five seeds each. The engine spawns the real MVP and five escorts and runs real movement, damage, boss crit resistance, character defeat, and Asura retreat for up to 240s. Map 9 stage 15 = Nightmare Abyss, map 10 stage 5 = Astral, map 11 stage 5 = Thor. Synthetic fixture: level 150, GM-preset class-specific Mythic equipment +15, no cards/pets/mastery, fully allocated 50 offensive/vitality Ascension stat points and all class skill upgrades at rank 5, skills maxed. This is not an actual player save, not a live browser performance test, and not an optimized equal-cost gear comparison. Also use `current transfer` / `prototype transfer` to select synthetic +10 N+ gear, no Ascension stats, ordinary maxed skills and (prototype only) one point unlocking Knuckle. For `prototype full no-inherited-buffs`, disable Call Spirits and Zen to test sphere refill sensitivity. Prototype applies the above damage and stack changes plus area tuning 0.50, Knuckle 5s and Sura-only test Asura 5s. The file's global Asura cooldown mutation is safe *only* because prototype runs Sura alone; production must not alter Monk/Champion. `ASURA_FACTOR=.75` optionally experiments with reducing Sura Asura's damage; not a proposed shipped nerf.

Results (five seeds, median only among kills; always include win count):

| Map | Current Sura | Prototype Sura | Current GC | Current Sorcerer |
|---|---:|---:|---:|---:|
| Nightmare Abyss | 3.93s (5/5) | 3.97s (5/5) | 10.30s (5/5) | 11.60s (5/5) |
| Astral | 20.30s (5/5) | 15.60s (5/5) | 24.37s (5/5) | 28.60s (5/5) |
| Thor | 49.47s (5/5) | 35.13s (5/5) | 48.63s (3/5) | 58.97s (5/5) |

Thor GC median is conditional on three wins, not comparable as if all five survived. Current Sura ranged 27.0–50.1s; prototype ranged 32.8–44.5s. On one Thor prototype run, all six attacks cast 6 times. Without the two inherited sphere buffs, prototype Thor median was 38.60s (5/5); one run cast all six 7 times. At +10 N+, Nightmare Sura median was 71.73s current vs 50.70s prototype (both 5/5); every tested class was defeated on Astral and Thor at this lower gear level. Accordingly no conclusion can be drawn about MVP completion on those maps at transfer gear. Do not equate survival to guaranteed future drop rates or income.

All adjustments were simultaneous; isolate individual factors before attributing improvements. Faster Asura increased stationary DPS dramatically and makes skill damage even more Asura-dependent. Sphere buffs from all inherited jobs are active unless explicitly disabled; their interaction with Sura-only rotation must be investigated. Rank-one Sura cooldown experiments used the prototype's unconditional 5s Knuckle: they do not measure the currently shipped 12s unlock. Finite-HP fights include the execute condition; the stationary dummy never enters the wounded phase. No automated farm/drop/hour benchmark or real-player builds were measured. Normal map AoE area tuning 0.50 has not been validated for kill rates or economy.

## Implemented build verification

`node reports/sura-research/boss-maps.cjs ship` tests the implemented source without applying any prototype patches. All five runs on each map matched the prototype's recorded times exactly; see `boss-ship.jsonl`. The benchmark explicitly assigns the proposed combo; existing player-saved combos are intentionally not overwritten. `tools/tests/sura_rebalance_sim.js` separately exercises the actual suggested combo, damage mechanics and the real update loop. Rendering tests use mocked canvas/WebGL rather than screenshots or a physical device.

### Follow-up audit

A second full test pass ran all 259 `*_sim.js`, `*_sim.mjs`, and `*_smoke.js` suites successfully after fixing a skill-description initialization guard and two stale test-harness dependencies (the afterglow build version and the Sanctuary worker's chat-filter module). Progression fixtures were remeasured against the same historical baseline after the final game change; `skill_balance_sim.js` passed. A headless Chromium/SwiftShader check on desktop and phone-sized viewports confirmed five visible hub spheres and five field spheres when the live stack is set to five, their removal after consumption, and healthy WebGL contexts. This is a simulated browser/GPU check, not a physical-device test.

### Final audit

Repaired malformed `configure` source extraction in both rotation scripts. Rerunning both scripts produced byte-for-byte identical results to their respective checked-in JSONL files. The skill combo editor now displays the actual cooldown, with tests covering both Sura and Champion.
