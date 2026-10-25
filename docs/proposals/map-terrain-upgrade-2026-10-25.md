# Terrain v2 — making the outdoor fields stop looking repetitive

**Status (2026-10-25, after owner review):** **P1 + P2 are implemented** in
`assets/native-fields.js` — the v2 landform is the shipped field terrain (still parked
behind `NATIVE_FIELDS_DEFAULT=false`, i.e. `?nativeFields=1`), the floor is painted from
the landform, the trail follows the terrain and ponds keep their shape with a real beach.
Owner picked **mixed per-field intensity**, **keep trail and ponds (terrain-aware)** and
**P1+P2 together**. P3 (prop rules) and P5 (flip the default) are still open.
**Owner's brief (2026-10-25):** *"the maps have slope which I asked for, but it came out
repetitive and not realistic — give me a proposal on how we adjust it."*
**Applies to:** the ten World Atlas fields (Prontera → Abyss). Ascension/Astral and
Thor keep `assets/ascension.js` + `assets/astral-scenery.js` untouched.

Boards (open these first):

- [`board-topdown.png`](terrain-v2/board-topdown.png) — shipped vs proposed, hillshaded, all ten
- [`board-ingame.png`](terrain-v2/board-ingame.png) — the real field camera on both
- [`board-intensity.png`](terrain-v2/board-intensity.png) — the same landform at 0.55× / 1× / 1.7×
- [`metrics.json`](terrain-v2/metrics.json) — every number quoted below
- Live page: `PREVIEW_PAGE=tools/maps/terrain_v2_preview.html python3 tools/preview_server.py 8000`

---

## 1. What I found in your files first

There is no new external commit to pull: `main` is at `d26906c` (PR #126, boss skill FX) and
this branch starts from exactly that commit. The map work the brief refers to is already
merged — it is the **v195 outdoor fields** (`assets/native-fields.js` +
`assets/native-fields/v1/`), parked behind `NATIVE_FIELDS_DEFAULT=false` and reachable with
`?nativeFields=1`. So the "update for all maps except Ascension" is the ten-field native
terrain pass, and the complaint is about that pass, not about a missing pull.

## 2. Why it reads repetitive — the actual causes

The whole field height is this, for all ten destinations
(`assets/native-fields.js`, `terrainHeight`):

```js
let y = 1.1;
for (const h of d.hills) y += h[2] * Math.exp(-(((x-h[0])/h[3])**2 + ((z-h[1])/h[4])**2));
if (d.valley) y += mound(x, z, d.valley);
y += .16 * Math.sin(x*.17 + map) * Math.cos(z*.13 - map*.4);
```

1. **Every field is three Gaussian mounds + one Gaussian dip + one sine ripple.**
   `DESIGNS` only changes their numbers (position, radius, amplitude). There is no ridge,
   no crease, no cliff, no flat, no drainage — Gaussians are the flattest, most "blobby"
   primitive there is, so all ten fields are the same soft shape with a different layout.
   Measured: **3 "landforms" per field, every field** (local maxima on a 7-unit window);
   **33–43 % of each field is flatter than 3°**; the mean pairwise correlation between two
   fields' height patterns is **0.47** — as a set they are near-variants of one another.
2. **One surface shape for all ten.** `terrainGeometry()` is grid + `terrainHeight`, and the
   floor is a single 2048² canvas of one `base` tile, one `road` mask, four 256-px crops.
   The ground itself therefore has no slope information: a 30° face and a flat are painted
   the same. Real fields read through *material change* (grass → dirt → rock → scree), and
   there is none here.
3. **The arena is not part of the landform.** Hills run straight through the fight lane, so
   mobs, loot and the hero sit on the side of a dome. Nothing reserves a readable clearing.
4. **Scenery sits on a ring.** `placements()` pushes every prop to `|x| ≥ 17` and picks from
   `hash(i, …)`, so props ignore the terrain: no trees in hollows, no rock on cliffs, and the
   middle of the field is bare. That, plus the flat lighting, is most of the "not realistic"
   feeling.
5. **Water is a disk punched into the ground.** `pondRadius` mixes toward a constant level
   over ~1 unit, which makes a vertical rim with a bright shore ring (visible on Izlude,
   Comodo, Amatsu, Abyss in the board).
6. **The camera exaggerates all of it.** Native fields use pitch `el-0.17` (≈0.78 rad) at
   44 units, FOV 38. At that angle smooth domes read as flat colour, and any straight slope
   change reads as a seam. Two things I found in the shipped pass *because* of this: the pond
   rim, and `clamp()` on a mask (a clamp leaves a C0 crease along the whole line where it
   engages).

## 3. The proposal — six workstreams

A–C are implemented in `assets/native-fields.js` (`terrainHeight`, `heightAt`,
`terrainGeometry`, `surfaceWeights`, `slopeAt`). The v195 landform is kept beside them as
`legacyHeight` + `LEGACY`, so `?nativeFields=1&terrain=v1` still shows the old fields for
comparison — the prototype file is gone; the module is the prototype now.

### A. Replace the landform generator (the core fix)

Build a field out of **layers**, each doing one job, instead of one sum of blobs:

| layer | what it is | why |
|---|---|---|
| domain warp | sample every layer in a noise-shifted, per-map rotated frame | nothing in nature is on a rectangular lattice; also guarantees no two fields share a grain direction |
| landform | low-frequency fBm + one clear tilt | valley floors and a readable uphill direction |
| skyline | **ridged** multifractal (1−abs(noise), squared, weighted) | this is what makes a hill look like a hill — sharp crests, converging gullies |
| drainage | broad shallow swales where crests fall away | reads as erosion instead of random bumps |
| benches | height squeezed into flat shelves **only in rocky zones**, with a warped threshold | escarpments: the single biggest "real terrain" cue at this camera angle |
| signature | one landmark per field (basin, bluff, gorge, plateau, terrace, dune field, shelf) | gives each destination a memory |
| micro relief | small fBm, **stronger in the lane** than outside | keeps the floor from looking like plastic |
| frame | perimeter rises, near edge stays open | the horizon is land, not the edge of a 90×90 plane |

Plus three rules the prototype enforces (and the test suite checks):

- **Lane-aware:** the fight area is flattened with a **noise-ragged boundary** (a hard
  rectangle reads as a flat box dropped into the hills — the same mistake the v27 kit fields
  made), faded over 1–9 units, so mobs/loot/hero stay readable and walkable.
- **Seam-free by construction:** no `clamp()` on any mask, and the bench warp moves the
  *threshold*, never the value (warping inside a step function leaves a height
  discontinuity that renders as a straight line across the field). The prototype is tested
  for this: max adjacent-sample jump < 0.75 world units anywhere.
- **Exact contact kept:** `heightAt` still interpolates the exact rendered triangle, so
  hero/pet/mob/loot contact does not change (`native_fields_sim.js` keeps its guarantee).

### B. Per-destination recipes

Each field gets its own landform *kind*, amplitude, tilt, rotation, bench profile and
signature — not the same recipe re-parameterised:

| field | landform identity |
|---|---|
| Prontera | open meadow basin, low swells, farm terrace in the corner |
| Izlude | coastal shelf, bluff on one side, open water and a beach shelf |
| Geffen | one long wooded ridge with hollows either side + a rock spur |
| Morocc | transverse dune sea (deliberately the only field with a strong grain, no cliffs) |
| Payon | stacked forest spurs + a stream-cut gorge |
| Comodo | jungle sinkhole: karst rim around a basin floored by a pond |
| Louyang | mountain foothills, terraced slopes, dry ravine (highest relief) |
| Amatsu | soft meadow with one flat-topped shrine plateau |
| Niflheim | sunken dead hollow, cracked flats, low husk mounds (lowest relief) |
| Abyss | broken basalt shelves stepping down to a black lake (steepest) |

### C. Paint the floor from the terrain (Phase 2)

The prototype already computes, per vertex, weights `{grass, dirt, rock, beach}`:

- rock from **slope** (>17° → 32° ramp),
- dirt from broad patches + the single winding trail (a trail that wanders and crosses
  hollows rather than a painted road ignoring the landform),
- beach from the pond ring.

Runtime: one RGBA splat texture (or the four weights packed into vertex colours at the
current 72² grid, which costs nothing) and a 4-way blend of the existing kit tiles. This is
what makes the *same* geometry read as meadow / scree / shore instead of one green field.

### D. Props that respect the terrain (Phase 3)

- Place by weight: trees on gentle grass, rock on slope > 25°, shrubs anywhere, **nothing**
  on slope > 40°, roots embedded into the lowest corner (the existing rule, now driven by
  the real slope).
- Density from the relief mask so fields have groves and clearings rather than a ring of
  props at `|x| ≥ 17`.
- Keep the existing hard constraints: nothing inside the lane, nothing inside the pond,
  height caps.

### E. Water and cliff edges (Phase 3)

Replace the pond disk with a level surface that cuts the *shaped* bowl: depth-limited dig
in the heightfield over a wide beach, so the shoreline is the intersection of water and
terrain (that is what the current renderer already assumes — the disk is just too big).
Optional later: shallow shelf colour band and a second rock band under steep faces.

### F. Keep it cheap (Phase 0 gate)

The prototype is pure JS per-vertex work on a 72² grid (5.3k vertices), same as today —
one extra `computeVertexNormals` cost the game already pays. Splat weights add ~4 fBm
calls per vertex, comfortably inside the current field build (< 30 ms measured in the
sim). The 90×90 ground plane, fog, camera and disposables are unchanged.

## 4. Measured effect (shipped module, `metrics.json`)

Higher is not always better — the point is *structure*: more separate landforms, fewer flat
patches, sharper max slopes, less sameness. Raw amplitude inside the view band is lower than
the shipped domes because v2 spends its height on shelves and a rim instead of one dome in
the middle; the `board-intensity.png` dial goes from 0.55× to 1.7× if you want more.

| field | relief | relief in view band | slope p95 | max slope | landforms | flat <3° | grain | radial sym |
|---|---|---|---|---|---|---|---|---|
| Prontera | 5.42 → 6.86 | 5.27 → 3.09 | 15.8 → 17.1 | 19.1 → 35.7 | 3 → 9 | 42.7 % → 21.8 % | .29 → .13 | .17 → .17 |
| Izlude | 6.74 → 6.33 | 6.74 → 6.30 | 16.4 → 17.5 | 31.0 → 28.9 | 2 → 12 | 36.7 % → 33.8 % | .37 → .17 | -.02 → -.18 |
| Geffen | 6.63 → 5.34 | 6.62 → 4.68 | 19.6 → 18.0 | 28.9 → 27.1 | 3 → 18 | 36.9 % → 23.1 % | .37 → .30 | .18 → -.19 |
| Morocc | 6.31 → 4.03 | 6.31 → 1.92 | 22.8 → 11.8 | 32.1 → 18.0 | 3 → 20 | 37.1 % → 27.9 % | .59 → .01 | .14 → -.20 |
| Payon | 6.67 → 4.85 | 6.43 → 2.82 | 20.4 → 18.2 | 25.3 → 29.9 | 3 → 23 | 34.2 % → 18.6 % | .22 → .22 | .41 → .51 |
| Comodo | 7.97 → 5.50 | 7.97 → 3.46 | 23.3 → 16.4 | 44.8 → 34.8 | 3 → 21 | 33.0 % → 25.1 % | .12 → .24 | .34 → .38 |
| Louyang | 7.94 → 5.17 | 7.88 → 3.18 | 23.2 → 20.1 | 29.8 → 38.2 | 3 → 28 | 28.0 % → 13.6 % | .27 → .13 | .29 → .40 |
| Amatsu | 7.12 → 5.76 | 7.12 → 3.56 | 15.0 → 15.0 | 58.8 → 28.4 | 3 → 16 | 34.0 % → 20.1 % | .40 → .11 | .15 → -.14 |
| Niflheim | 6.08 → 4.14 | 5.78 → 2.32 | 20.3 → 13.6 | 26.6 → 24.8 | 3 → 24 | 34.8 % → 21.1 % | .26 → .21 | .35 → .35 |
| Abyss | 9.08 → 4.32 | 9.08 → 3.72 | 22.6 → 20.2 | 47.2 → 36.4 | 3 → 36 | 32.0 % → 13.9 % | .14 → .13 | -.29 → .05 |

Mean pairwise correlation between fields: **0.47 → 0.18**, and the test removes the shared
*intentional* rim before comparing patterns and fails if two fields correlate at r ≥ 0.6
(worst pair today: 0.52).

Two honest notes on that table:

- **Peak relief inside the visible band went down, not up.** v195 put one 6–9 unit dome in
  the middle of the field; v2 spreads relief into shelves, spurs and a rim. That is the
  trade the owner asked for (structure instead of blobs), but if a field feels too calm it
  is one number — `amp` — and the review page's Relief dial previews it live.
- **Morocc and Niflheim are deliberately the flattest.** Dunes and a dead hollow are not
  supposed to have cliffs; their identity is grain and a bowl, not relief.

## 5. Rollout plan

| phase | work | gate | rough size |
|---|---|---|---|
| **P0** | proposal + prototype + preview page + `terrain_v2_sim.js` | owner read the boards | **done** |
| **P1** | v2 landform inside `assets/native-fields.js`; v195 kept as `legacyHeight` behind `?nativeFields=1&terrain=v1`; native-field sim expectations updated | fields walkable, zero contact drift, existing field tests green | **done** |
| **P2** | floor painted from the landform: per-vertex slope weights + a 192² mask driving dirt/rock/beach over the base tile, plus a terrain-following trail | no visible tiling; field build ≈125–160 ms | **done** |
| **P3** | prop placement by slope (done: nothing on >32°, rock up to 42°) and a denser, mask-driven scatter; cliff-face rock band; optional shore bands | trees never on >32°, no prop in lane/pond | partly done |
| **P4** | per-map art pass on the dial (intensity, bench amount, trail width, signature size) using the live page | you approve each of the ten fields on desktop + portrait | review loop |
| **P5** | flip `NATIVE_FIELDS_DEFAULT=true`, `BUILD` bump, update-log entry, kit backup sync | full pre-push suite + browser harness | ~1 session |

Ascension is untouched in every phase. Save format, combat, drops and mob scale are
untouched; this is scenery only.

## 6. Risks

| risk | mitigation |
|---|---|
| Cliffs/benches hide mobs or the hero at pitch 0.78 | benches only in rocky zones and outside the lane; lane max slope capped and tested (< 26°) |
| New amplitude makes the camera clip into hills at the field edge | rim starts beyond `|x| > 32`, near edge deliberately left open; fog near/far already scale with camera distance |
| Peripheral fields read as a bowl (vignette) | frame is capped (`frame × 0.65–1.35` noise) and the in-band numbers are quoted above; the intensity dial exists precisely to tune this |
| Ground still looks flat because the floor is one tile | P2 is not optional — geometry alone only buys the silhouette; the material split is what sells slope |
| Perf on phones | same grid, same vertex count; weights are 4 fBm per vertex, measured in the sim; no extra draw calls until P2 |
| Two agents editing the terrain | `assets/native-fields.js` is the only file P1 changes; the prototype stays in `tools/maps/terrain-v2/` until then |

## 7. Decisions taken (owner, 2026-10-25)

1. **Intensity: mixed per field.** Each destination now carries its own `amp`; Louyang and
   Abyss are the steepest, Morocc and Niflheim the calmest.
2. **Trail and ponds: keep both, terrain-aware.** The trail wanders and follows hollows
   (Morocc stays trailless); ponds keep their shape but the ground under them is dug as a
   bowl with a wide beach instead of a vertical rim.
3. **P1 + P2 together**, so the floor changes material on slopes rather than staying one
   tile — implemented above.

Still open for you: **P5**, flipping `NATIVE_FIELDS_DEFAULT=true` so a plain game URL gets
these fields, and whether any single field's dial needs a nudge after you walk it.

## 8. How to review it now

```sh
# in the real game (fields are opt-in): walk all ten with the new landform
python3 tools/preview_server.py 8000   # then /game?nativeFields=1
# ...and the same URL with &terrain=v1 for the old shape, side by side

# landform-only review page: v195 vs v2, relief/lane/contour/wireframe dials
PREVIEW_PAGE=tools/maps/terrain_v2_preview.html python3 tools/preview_server.py 8000

# regenerate the static boards (needs numpy + Pillow)
node tools/maps/terrain-v2/sample_heights.js /tmp/heights.json
python3 tools/maps/terrain-v2/render_preview.py --heights /tmp/heights.json --variants

# regression
NODE_PATH=<dir with three@0.128> node tools/tests/terrain_v2_sim.js
```

`terrain_v2_sim.js` (254 assertions) covers: pure/deterministic heights, exact rendered-triangle
contact, lane walkability and relief outside it, no height discontinuity anywhere, ten
distinct landforms, no short-period repetition, normalised splat weights, rock on steep
faces, a wandering trail, the mesh contract the game relies on, and that `terrain=v1`
really selects the old landform while a plain URL selects v2.
