# Boss skill FX — twelve MVPs, two signature moves each

Owner request (2026-10-25): *"create skill fx for all boss… 1 or 2 unique fx… flashy & vibrant.
Lower level maps can be simpler & high maps skills fx should be stronger & more impactful.
Example 1 big slash across the map with some breaking effect or digital effect. The skill fx should
not be consistent. Maybe 3-4 sec once from the boss."*

This folder keeps the review material. The live effect system is `assets/boss-fx.js`; the review page
is `/bossfx` (`tools/boss_fx_preview.html`); `sheet-all-moves.png` is one representative frame of
every move, rendered straight from the module by `tools/render_boss_fx_sheet.js`.

`before-after-sakura-storm.png` is the receipt for the owner's report: the same move, same ages,
rendered from the previous module on the top row and the current one below. The old version laid a
flat tinted ellipse over the field, which is the hard-edged dark shape (with a visible rim) that
appeared under the boss.

The second, stricter review sheet is generated on demand instead of being committed (it is ~14 MB at
full height): `node tools/render_boss_fx_field_sheet.js out.png` composites every move over the real
Prontera field capture at true game scale, one row per move. Crispness and "does this leave a hard
edge on the ground" can only be judged against the actual field, not against a transparent plate.

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

## Screen time — full-field moves clear fast

Owner report (2026-10-27): *"skills fx like Ifrit Blaze & Memory Fracture which covers the whole
map. having in on screen for 3 secs block the gameplay. can we adjust the fx to disappear faster?"*

Measured at the reference camera, the six tier-3 moves paint shapes reaching **1298-2025 screen
px out from the boss's feet** (2.6-4.0k px across, so a 1200px-wide viewport is completely
covered) and used to hold them at full brightness for **3.05-3.2s**. All six have the problem,
not just the two named: **Abyssal Cross, Chaos Requiem** (Dark Lord), **Memory Fracture,
Thanatos Judgment** (Memory of Thanatos), **Primal Eruption, Ifrit Blaze** (Ifrit). The eight
tier-2 sweeps are smaller (524-822 px out from the boss) but also sat on the field for 2.7-3.0s,
so they got a milder version of the same treatment.

The fix is a **screen-time policy**, not a cut — every beat of every animation still plays:

| tier | moves | `life` (on screen) | `choreo` (art length) | playback | `fadeAt` |
| --- | --- | --- | --- | --- | --- |
| 1 — local | 10 | 2.15-2.65s (unchanged) | same as `life` | 1× | 1 (no early fade) |
| 2 — map-wide | 8 | **2.2s** (was 2.7-3.0s) | 2.7-3.0s | 1.23-1.36× | 0.5 |
| 3 — full-field | 6 | **1.7s** (was 3.05-3.2s) | 3.05-3.2s | 1.79-1.88× | 0.34 |

* `life` is what `PGBossFx.life(id)` and the game's cast clock see; `choreo` is the length the
  choreography was designed for. `paint()` fast-forwards pattern time by `choreo/life`, so the
  glass panes, second glitch wave, ember storm and trench fade all still happen — nothing is
  chopped off. Contact sheets sampled at a fraction of `life` therefore show the same impact
  frame as before the change.
* `fadeAt` is the fraction of the cast that stays at full brightness; after it the **whole layer**
  dims on a smoothstep to nothing, instead of the old per-pattern fade that only covered the last
  10-16%. Tier 3 is full brightness for its first ~0.58s, ~half dim by ~1.0s, gone at 1.7s. Tier 2
  is full until ~1.1s and gone at 2.2s. Tier 1 is untouched.
* The title card, stage wash, camera shake and the 3.2-4.6s gap after a cast are unchanged. A
  shorter cast only makes that gap start sooner: a tier-3 boss now shows an effect roughly every
  4.9-6.3s instead of 6.3-7.8s.

`node tools/tests/boss_fx_sim.js` checks the roster values, the fast-forward specs, the peak
brightness of a full-field cast at 20%/70%/95% of its life, and that a tier-1 burst still plays
at full brightness. `/bossfx` shows both times in each move's row.

## The clock

* First cast ~1.9s after the boss wave starts; then **a 3.2-4.6s gap after each effect ends**,
  re-rolled after every single cast so it never becomes a metronome.
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
The field sheet is produced by `tools/render_boss_fx_field_sheet.js`; it draws each move over
`tools/skill-fx-proposals/prontera-field.webp` at the game's reference camera.

```sh
node tools/render_boss_fx_field_sheet.js /tmp/sheet-field.png          # all 24 moves
node tools/render_boss_fx_field_sheet.js /tmp/tide.png kk_tide,kk_tentacle 3 250
```

## Crispness rules the module now follows

* Ground contact is an additive, heavily feathered `pool()` - never a flat `disc()` and never a dark
  plate, which is what painted a hard ellipse (with a visible rim) under the boss.
* Every closed shape gets a thin dark `contour()` plus a `hotEdge()` hairline, so it separates from
  bright grass without a fat black outline.
* Widths are floored in device pixels (`minW`), so hairlines stay hairlines instead of blurring.
* Slashes are built from one saturated body, one light band and one hot core - not stacked
  translucent ribbons, which read as a smear.
* Cracks taper to a hairline at the tip and each segment is stroked separately.
* A ring or fill style is never allowed to be a non-string; the canvas silently keeps the previous
  colour when it is, which is how a black ellipse appeared on Anchor Typhoon.
`node tools/tests/boss_fx_sim.js` is the regression suite; `/bossfx` plays all of it live.
