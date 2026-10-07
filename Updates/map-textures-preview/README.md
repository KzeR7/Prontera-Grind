# Map Kit HD (Option B: RO3 Seamless Splatmap Floor + Canopy Light & 3D Details) — Backup & Reference

This directory is the canonical backup of all extracted `Data.grf` textures, `256x256` / `512x512` HD seamless tiles, comparison boards (`board-1` through `board-10`), and in-game verification renders.

## Shipped Runtime Kit Files (Backed up in `assets/kit/` and `Updates/map-sprites-v2/`)
- `assets/kit/ro-tiles-hd.png` & `assets/kit/ro-tiles-hd.json` — `1536x1024` sheet of 24 native `256x256` HD terrain tiles (`cliff` aliased to `cliff_sand`, 25 manifest entries total).
- `assets/kit/ro-spritesheet.png` & `assets/kit/ro-spritesheet.json` — `2048x2048` v2 kit atlas with updated `128x128` terrain tiles and color/sharpness-harmonized 34 environment billboards.

## Preview & Verification Boards
- `index.html` — Interactive browser catalog & comparison viewer.
- `board-1-terrain-roads-sands.png` — Classic RO `Data.grf` grass, dirt, stone, cobble, and desert tiles.
- `board-2-biomes-cliffs-bridges-water.png` — Louyang, Amatsu, Niflheim, Abyss, cliffs, bridges, and animated water sets.
- `board-3-10-stages-simulated-fields.png` — Initial 10-stage biome simulation.
- `board-4-ro3-seamless-tiles.png` — Tiling seam comparison (Raw vs. Style A vs. Style B).
- `board-5-ro3-seamless-map-floors.png` — Option A vs. Option B RO3 floor layout comparison.
- `board-6-hd-option-b-zoom-comparison.png` — 1:1 High-DPI sharpness comparison (Previous Blurry Sample vs. Ultra-HD Option B).
- `board-7-hd-all-10-stages-option-b.png` — All 10 stages rendered in Ultra-HD Option B (`RO3 Seamless Splatmap Floor + Canopy Light`).
- `board-8-hd-512-native-tiles-catalog.png` — 16 native `512x512` (`prontera_re`) and modern (`lasagna`, `eclage`, `rockridge`) HD ground swatches.
- `board-9-ingame-hd-option-b-verification.png` — All 10 live game maps rendered directly from `kitPlan(m, 1)` + `ro-tiles-hd.png` + Option B splatmap & canopy shadows.
- `board-10-3d-details-and-sprites-audit.png` — Audit of harmonized billboard sprites + new RO1/RO3 3D ground details (`kit3DDetails`).

## Subfolders
- `hd/` — Individual `256x256` HD seamless swatches and `stage_0..9_hd_ro3.png` stage renders.
- `tex/` — Extracted `Data.grf` ground & water source PNGs and `cur_*` pre-upgrade baseline tiles.
- `ro3/` — Intermediate RO3 splatmap stage renders (`stage_0..9_ro3.png` and `stage_0..9_styleA.png`).
