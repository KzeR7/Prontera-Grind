# Map Kit v2 — note for the implementing agent

**Read AGENTS.md first.** This folder is the finished deliverable for *Map Sprite Brief v2
("closer to real RO")*: a higher-fidelity replacement for `assets/kit/ro-spritesheet.png/.json`
plus the per-map art the old kit never had — bridges, bamboo, cherry trees, dead trees,
tombstones, crystals, standing stones and buildings. The owner approved the direction; your
job is to wire it into `index.html`. Nothing in the game has been touched yet — the game
still runs on the v1 kit until you do the steps below.

## What is in this folder

| file | what it is |
|---|---|
| `ro-spritesheet.png` | the v2 atlas, 2048×2048 RGBA (~2.7 MB), **25 tiles + 34 billboards + the v1 character strip** |
| `ro-spritesheet.json` | the manifest, **same schema as v1** (`meta/tiles/sprites/character`) plus a `suggest` block (see below) |
| `preview.html` | open it next to the two files above (`python3 -m http.server`) — tiles proven seamless, every prop at in-game scale next to the hero, ten animated map-mood cards |
| `RESEARCH.md` | the divine-pride research: per-map palette + landmarks, and what RO's ground style actually is |
| `work/` | the pipeline that built everything (tile processor, chroma-key prop cutter, variant deriver, packer) + every processed asset individually |

## Provenance — read before judging the art rules

House rule 1 (crop only, never draw) protects the **class sprite pack**. The map kit has
always been different: the v1 kit itself was painted art delivered through `Updates/`.
This kit is **original painted art**; divine-pride.net map renders were used as *style and
palette reference only* (see RESEARCH.md). Nothing was traced, ripped or recoloured from
the RO client. Derived variants (e.g. `tree_ancient_variant`, `palm_double`, the water
frame 2, the dark/jade water remaps) are derived **from this kit's own art** and are
documented in RESEARCH.md. Do not redraw or substitute anything here — if a prop reads
wrong in game, report it to the owner.

## Step 1 — drop the kit in (zero code required to light it up)

The manifest is a **superset of every name the game already uses**. Copy the two files
over the live kit:

```sh
cp Updates/map-sprites-v2/ro-spritesheet.png  assets/kit/ro-spritesheet.png
cp Updates/map-sprites-v2/ro-spritesheet.json assets/kit/ro-spritesheet.json
```

* All 8 v1 tile names and all 7 v1 sprite names exist with new art.
* `character.ro_adventurer` is the v1 strip **copied pixel-for-pixel**, still 80 px frames,
  so `KIT_PK = 2.9/80` stays correct.
* The attached Payon design's `rock_boulder_mossy` **now exists** — the 3 placements that
  have been skipped-and-logged since kit-v14 will start rendering on their own.

## Step 2 — retire the runtime Morocc atlas (recommended)

The manifest also carries every name `morocc-atlas.js` generates: tiles `sand`,
`sand_dark`, `ruin_cobble`, `cliff` (alias of `cliff_sand`) and all 10 desert props
(`palm_giant/tall/double`, `cactus_flower/small`, `ruin_pillar/column_fallen/stump/curb`,
`desert_bone`). So `src:'morocc'` can simply resolve to the same v2 atlas as
`src:'payon'` — one `KIT.srcMan` entry pointing both keys at the one manifest. Then
`morocc-atlas.js` and its script tag can be deleted (keep the file in `Updates/` history
if the owner wants). The Morocc *design* (`ro-map-morocc.json`) still applies cell for
cell — only the pixels come from the v2 sheet now. If you prefer the minimal diff, skip
this step: nothing breaks, Morocc just keeps the old generated look.

## Step 3 — update `KIT_PS` (required — sizes and aspects changed)

Prop crops are bigger and better-proportioned than v1, so the old factors are wrong for
them. `suggest.KIT_PS` in the manifest carries a complete tuned table (every one of the
34 props has a factor — `kit_sim.js` fails on a missing one, by design). Replace the
`KIT_PS` constant in `index.html` with that table. The intended world heights it encodes,
in hero-multiples: big trees 3.2–3.6×, cherry tree 3.0×, dead/gnarled trees 2.6–2.8×,
bamboo ~1.9×, torii 2.2×, Geffen tower 5× (far landmark), houses ~2×, saplings ~1×,
bushes/curbs knee height. `preview.html` shows every prop at exactly these sizes next to
the hero — eyeball it before and after.

## Step 4 — give each map its new identity props (`KIT_MAP` recipes)

`suggest.maps` in the manifest is the contract from RESEARCH.md in machine-readable form.
Concretely, against the current `KIT_MAP`:

* **0 Prontera** — add `house_prontera` (1, far off-lane) to the scatter; keep the rest.
* **1 Izlude** — swap the shore band to `sand_gold`; scatter `pier_post` (2–3) by the pier
  deck; palms no longer need `src:'morocc'` after step 2.
* **2 Geffen** — ground `grass_geffen`; replace the borrowed desert ruins with
  `tree_dark_gnarled`, `standing_stone` (3–4) and one `tower_geffen` in a far corner.
* **3 Morocc** — nothing: the design applies as-is (step 2).
* **4 Payon** — road tile `dirt_payon`; add `bamboo_grove` lines along the banks (the
  groves RO's Payon is famous for — the old kit had no bamboo at all) and keep
  `rock_boulder_mossy` for the crossing.
* **5 Comodo** — ground `sand_gold`; props stay the palm/cactus set.
* **6 Louyang** — ground `grass_jade`; `paddy_water` strips **outside the lane**;
  scatter `bamboo_grove`, `shrine_stone`, `lantern_stone`.
* **7 Amatsu** — ground `grass_blossom`; deck tile `bridge_red` for the stream bridge;
  scatter `tree_cherry`, one `torii_gate` on the road before the bridge, `lantern_stone`
  pairs, one `bridge_red_arch` as off-lane scenery.
* **8 Niflheim** — ground `waste_nifl`; scatter `tree_dead`, `tombstone` (4–6),
  one `house_ruin`, keep the bones.
* **9 Abyss** — ground `rock_abyss` with a `limestone_pale` shore ring; the lake should
  use **`water_dark_0/1`** — the water builder currently hardcodes the two frame names, so
  let a recipe override the frame pair (one small change: read the pair from the recipe
  with `['water_frame_0','water_frame_1']` as default); scatter `stalagmite`,
  `crystal_cluster`, `standing_stone`.

All the existing hard rules stay: props never in the lane (`|x| < BX_` — move to the lane
edge, never drop), water out of the monster spawn band, seeded determinism, every placed
prop type present in `KIT_PS`.

## Step 5 — tests, then ship

* `kit_sim.js` pins v1 behaviour; it will need its pins moved, not its rules: the
  `rock_boulder_mossy` skipped-placement assertion **inverts** (3 placements now render),
  the KIT_PS table grows, recipe pins change with step 4, and the Morocc src unification
  (step 2) changes the loader's asset list. Keep the rules themselves (lane clear, water
  clamped, determinism, every prop in its atlas, the fallback when the atlas cannot load).
* Run the full battery from AGENTS.md (all suites + `node --check` on the inline JS).
* Bump `BUILD` (this is player-visible), append the AGENTS.md log entry, push, PR.
* Sanity-eyeball in the live preview: Payon bamboo + mossy boulders, Amatsu torii + cherry
  + red deck, Abyss dark water, Geffen tower, Niflheim graves, Morocc unchanged in layout
  but sharper in texture.

## If you need to rebuild or extend the art

`work/` has the whole pipeline: `process_tiles.py` (seamless + downscale + palette
derivations), `cut_props.py` (chroma-key, despill, trim, anchor measurement),
`derive_props.py` (documented variants), `pack_atlas.py` (shelf packer + manifest).
Each processed tile/prop also sits in `work/tiles/` and `work/props/` individually with
`_anchors.json`, so repacking with additions is a five-minute job. Anchors are measured
(bottom-most meaningfully-opaque row − 3 px), not guessed — keep it that way.
