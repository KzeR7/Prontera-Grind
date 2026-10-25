# terrain-v2 — landform review (dev only)

Review tooling for the v2 landform of the ten World Atlas fields. The landform itself now
lives in `assets/native-fields.js` (v195 is kept there as `legacyHeight`); this folder only
samples and renders it. The proposal that explains it:

[docs/proposals/map-terrain-upgrade-2026-10-25.md](../../../docs/proposals/map-terrain-upgrade-2026-10-25.md)

## Files

| file | what it is |
|---|---|
| `sample_heights.js` | dumps 181×181 height grids for both landforms (v195 `legacyHeight` and shipped `terrainHeight`) to JSON. |
| `render_preview.py` | renders the comparison boards (top-down hillshade, the real field camera ray-marched over the heightfield, and the intensity variants) into `docs/proposals/terrain-v2/`. Needs numpy + Pillow; not a runtime dependency. |
| `../terrain_v2_preview.html` | live page: v195 vs v2 on all ten fields, with relief / lane / contour / wireframe dials and a live slope + relief readout. |

## Review

```sh
PREVIEW_PAGE=tools/maps/terrain_v2_preview.html python3 tools/preview_server.py 8000
```

```sh
node tools/maps/terrain-v2/sample_heights.js /tmp/heights.json
/tmp/venv/bin/python tools/maps/terrain-v2/render_preview.py --heights /tmp/heights.json --variants
NODE_PATH=<dir with three@0.128.0> node tools/tests/terrain_v2_sim.js
```

## Design rules the prototype keeps (and the test enforces)

1. `heightAt` interpolates the exact rendered triangle — hero/mob/pet/loot contact cannot drift.
2. The fight lane is flattened with a noise-ragged, fading boundary; it stays walkable
   (< 26° measured) while the field outside it carries the relief.
3. No `clamp()` on masks and no warping inside a step function: both leave a C0 crease that
   renders as a straight line across the field. Checked as a max height jump < 0.75 units.
4. Per-map rotation + seed + landform kind: no two fields may correlate above r = 0.6 after
   the shared perimeter is removed.
5. Pond water level is cut by the shaped bowl (depth-limited dig, wide beach), never a constant
   level mixed in over a short radius — that is what produced the vertical rims in the shipped
   pond.

## Tuning dials (per map, in `DESIGNS` in `assets/native-fields.js`)

`amp` overall relief · `frame` perimeter rise · `bench.{at,step,sharp,amount,warp}` shelves ·
`ridgeAmp`/`ridgeScale` skyline · `carve.{freq,depth}` drainage · `micro` close-up relief ·
`rotate` grain direction · `signature` the field's landmark · `trail.{bend,phase,width}` ·
`pathInfluence` how strong the trail's dirt is · `water` pond. `laneCfg.mix` is global
(0.55 now; 0 turns the arena into ordinary terrain). `TERRAIN` is `v2` unless the URL says
`terrain=v1`.
