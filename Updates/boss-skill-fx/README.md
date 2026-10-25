# Boss skill FX — twelve MVPs, two signature moves each

Owner request (2026-10-25): *"create skill fx for all boss… 1 or 2 unique fx… flashy & vibrant.
Lower level maps can be simpler & high maps skills fx should be stronger & more impactful.
Example 1 big slash across the map with some breaking effect or digital effect. The skill fx should
not be consistent. Maybe 3-4 sec once from the boss."*

This folder keeps the review material. The live effect system is `assets/boss-fx.js`; the review page
is `/bossfx` (`tools/boss_fx_preview.html`); `sheet-all-moves.png` is one representative frame of
every move, rendered straight from the module by `tools/render_boss_fx_sheet.js`.

## The roster

| # | Map | Boss | Tier | Move 1 | Move 2 |
| - | --- | --- | :-: | --- | --- |
| 0 | Prontera | Mastering | 1 | Jelly Barrage — nine jelly blobs bounce in on separate arcs and pop | King's Bounce — a golden crown drops and bounces three jelly shockwaves |
| 1 | Izlude | Drake | 1 | Anchor Typhoon — a spectral anchor spins through water orbits, then slams a foam ring flat | Cutlass Cross — two saltwater cutlass cleaves cross and spray apart |
| 2 | Geffen | Baphomet | 1 | Goat Sigil — a pentagram ignites and five fire columns answer its points | Hell Ram — twin crescent horns sweep in opposite directions |
| 3 | Morroc | Phreeoni | 1 | Sand Maw — a quicksand funnel pulls the field in and snaps shut | Desert Fang — three serrated fangs rake the sand |
| 4 | Payon | Eddga | 1 | Tiger Rampage — three four-claw rakes tear across the field | Rampart Quake — a paw slam: cracks, rock spikes, dust ring |
| 5 | Comodo | Kraken | 2 | Tidal Maw — three cresting waves sweep while a whirlpool drags foam in | Abyss Tentacles — six sucker-lined tentacles erupt and hammer the centre |
| 6 | Louyang | Dragon Lord | 2 | Dragon Ascension — a flame dragon spirals up, then dives across the field burning a trench | Skyfall Pillar — five fire pillars rise under a crown of meteors |
| 7 | Amatsu | Shiranui | 2 | Foxfire Bloom — nine kitsune tails and pale spirit flames bloom among petals | Sakura Storm — a petal cyclone is cut open by a pink crescent |
| 8 | Niflheim | Lord of Death | 2 | Soul Harvest — three spectral scythes reap the field, souls rise | Death Verdict — a skull seal stamps down under a judgment beam |
| 9 | Abyss | Dark Lord | 3 | Abyssal Cross — an enormous crimson X opens field and ground with glitch shards | Chaos Requiem — a void sphere collapses into three shockwaves and blood spikes |
| 10 | Astral Citadel | Memory of Thanatos | 3 | Memory Fracture — one white slash shatters the air into glass panes and digital echoes | Thanatos Judgment — a celestial gate drives a pillar through a clock seal |
| 11 | Thor Volcano | Ifrit | 3 | Primal Eruption — lava geysers erupt under ash and glowing fissures | Ifrit Blaze — one colossal horizontal fire slash spans the map and leaves a burning trench |

## The three tiers

| tier | maps | composition | camera |
| --- | --- | --- | --- |
| 1 — simple | 0-4 (Prontera → Payon) | one clean idea, on the boss's own ground. No full-field sweeps. | a tiny nudge (0.3) |
| 2 — layered | 5-8 (Comodo → Niflheim) | map-wide sweeps plus a second motif: a seal under the wave, a diving body, petals with the cut. | a visible nudge (0.75) |
| 3 — cataclysm | 9-11 (Abyss, Astral Citadel, Thor) | full-field slashes, fracture/glitch structures, shard and ember storms, a trench left behind. | a real shake (1.2) |

Tier 1/2/3 also carry composition sizes 0.92 / 1.42 / 2.02 against the game's reference camera
(3.05 world units drawn as 120px), so the same 500-unit slash that reads "local" on a tier-1 boss
covers the whole lane on a tier-3 boss.

## The clock

* First cast ~1.9s after the boss wave starts; then **one cast every 3.2-4.6s**, re-rolled after
  every single cast so it never becomes a metronome.
* The two moves alternate but **the same move never plays twice in a row**.
* A new boss wave, map or Nightmare stage resets the clock. A dead boss casts nothing.
* Nothing is painted while the tab is hidden or the sim is catching up; the clock still advances.
* `S.cameraShake === false` keeps the tier-3 shake off without changing the drawing.

## What it deliberately does not do

No damage, no cooldowns, no aggro, no drops, no sprite edits, no combat-log spam. The boss's existing
swings, numbers and rewards are untouched — the effect layer only paints. Nothing here changes the
class skill renderer (`assets/skill-overdrive.js` / `assets/skill-afterglow.js`).

## Regenerating the sheet

```sh
npm install --no-save --package-lock=false @napi-rs/canvas
node tools/render_boss_fx_sheet.js Updates/boss-skill-fx/sheet-all-moves.png 0.46
```

The third argument is the fraction of each move's life to capture (0.46 is roughly the impact frame).
`node tools/tests/boss_fx_sim.js` is the regression suite; `/bossfx` plays all of it live.
