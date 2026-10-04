# Map kit v2 — divine-pride research notes

Research pass for Map Sprite Brief v2 ("closer to real RO"). Every map below was
checked against divine-pride.net map pages and top-down render images
(`https://www.divine-pride.net/img/map/rendered/<mapcode>`, `/original/`, `/raw/`)
plus RO wiki field maps where the render was clearer. The renders were used as
**style and palette reference only** — all kit art is original, painted in the same
soft airbrushed, hand-painted-prop look. Nothing was traced or ripped.

## What the renders teach about RO's ground style

* Ground is **soft and airbrushed** with subtle mottling — never flat colour, never
  hard noise. Surface changes (grass→dirt) blend through darkened seams.
* Paths are hand-worn: lighter in the wheel line, darker at the moist edges.
* Cliff/rock seams are drawn as chunky dark crevice lines, almost comic-book.
* Water is bright and patterned: a diamond-grid of lighter ripple highlights.
* Props are painted billboards with **strong silhouettes** and saturated colour.

## Per-map notes (palette + landmarks to capture)

| # | Arena | Reference | What the render shows | v2 assets that carry it |
|---|---|---|---|---|
| 0 | Prontera | `prt_fild08` | olive-green meadow, wide warm-brown dirt roads wandering through, scattered round green trees, rocky outcrop seams, a small bridge at the north; warm sunny light | `grass_olive`, `dirt_path`, `tree_ancient_large/variant`, `tree_sapling`, `house_prontera`, `river_stone_post`, `bridge_planks` |
| 1 | Izlude | `izlude`, `iz_dun00` | teal sea with sparkle grid, sandy shore band, wooden pier posts, palms at the waterline | `water_frame_0/1`, `sand_gold`, `pier_post`, `palm_tall`, `bridge_planks` (pier deck) |
| 2 | Geffen | `gef_fild04/08` | moody blue-grey-green plains, dark tree clumps, standing stones, the wizard tower silhouette | `grass_geffen`, `tree_dark_gnarled`, `standing_stone`, `tower_geffen`, `cliff_rock` |
| 3 | Morocc | `moc_fild04/18/19` | pale cream-yellow sand heart ringed by dark ochre-brown rock mesas, deep blue sea at the south edge, sparse green shrubs, ruins | `sand`, `sand_dark`, `cliff_sand`, `ruin_cobble`, `ruin_pillar/column_fallen/stump/curb`, `palm_giant/tall/double`, `cactus_flower/small`, `desert_bone` |
| 4 | Payon | `pay_fild04/08/10` | near-black dense forest canopy, red-brown dirt trails cut through it, dark rocky cliff edges, a river along the east with plank crossings; mountainous | `dirt_payon`, `grass_forest`, `tree_ancient_large`, `tree_tall_cluster`, `bamboo_grove`, `rock_boulder_mossy`, `bridge_planks`, `riverbank_wall` |
| 5 | Comodo | `cmd_fild01/02/04` | golden beach, warm sunset light, palms, dark cave-mouth cliffs behind the sand | `sand_gold`, `palm_giant/double`, `rock_cliff_crag`, `water_frame_0/1` |
| 6 | Louyang | `lou_fild01`, `louyang` | jade-green highland, terraced paddy water, bamboo, stone shrines and lanterns | `grass_jade`, `paddy_water`, `bamboo_grove`, `shrine_stone`, `lantern_stone` |
| 7 | Amatsu | `ama_fild01`, `amatsu` | soft green fields around a big blue lake, **red-painted shrine bridge + gate** at the lake head, blossom trees, light paths | `grass_blossom`, `tree_cherry`, `bridge_red`, `bridge_red_arch`, `torii_gate`, `lantern_stone` |
| 8 | Niflheim | `nif_fild01/02` | realm of the dead: purple-grey-black waste, faint violet and ochre patches, dead trees, graves; no bright colour anywhere | `waste_nifl`, `tree_dead`, `tombstone`, `house_ruin`, `desert_bone` |
| 9 | Abyss | `hu_fild05` + Abyss caves | pale limestone shore ring around a huge **deep dark-blue lake**, dark surround; the caves add stalagmites and crystals | `limestone_pale`, `rock_abyss`, `water_dark_0/1`, `stalagmite`, `crystal_cluster`, `standing_stone` |

**One style, ten moods** — the whole kit is painted with one technique (soft airbrush
ground, chunky crevices, strong-silhouette billboards); only palette and prop set
change per map, exactly as the brief demands.

## Derived tiles (one technique, documented)

Some palette-variant tiles are *derived from this kit's own generated art* (never from
RO assets): `water_frame_1` (rolled ripple pattern of frame 0 → shimmer),
`water_dark_0/1` (deep-blue remap of the water frames), `paddy_water` (jade remap),
`grass_geffen` (moody blue remap of forest grass), `waste_nifl` (purple-grey remap of
desert hardpan), `rock_abyss` (dark slate remap of cliff rock), `sand_gold` /
`limestone_pale` (warm / pale remaps of sand), `dirt_payon` (dark red-brown remap of
the dirt road), `bridge_red` (lacquer remap of the planks), `grass_blossom`
(petal scatter over the meadow grass). This keeps the ten moods colour-coherent and
saved the generation budget for the props, where silhouettes matter.
