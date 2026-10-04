# AGENTS.md — Prontera Grind

**This file is the project's update log. It is not optional.**

## The rule

> **Every agent that changes anything in this repo must append an entry to the
> [Update log](#update-log) at the bottom of this file before it finishes — and bump the
> `BUILD` tag in `index.html` if the change is visible in the game.**

* Append only. **Never rewrite, reorder or delete an older entry.** If an old entry is
  wrong, correct it in a new entry and say so.
* Write the entries in plain English for a non-programmer: what changed, what they will
  notice in the game, what to type to see it.
* Keep it short: the template at the very bottom tells you exactly what to fill in.
* If you did **not** change anything (you only read, or you only pushed an existing
  commit), you do not need an entry — say so in your reply instead.

## The project in one screen

**Prontera Grind** is a browser Ragnarok-Online-flavoured idle/grind game: one HTML file,
Three.js from a CDN, no build step. The player picks a class line, grinds monsters across
10 maps, levels up, spends stat and job points, wears gear, collects pets **from drops
only** (there is no hatching), trains them by gambling Zeny, rolls for cards and ores, and
fights an immediate boss plus escorts on each Stage 10 map.

| Where | What |
|---|---|
| `index.html` | the entire game (HTML, CSS, JS inline). This *is* the game. |
| `assets/sprite_pack_data.js` | the built sprite pack: 19 class bodies + 2 heads, base64 atlases. ~5.8 MB. `tools/make_sprite_pack.py` also re-seeds from this file - it is the only source for shared heads/poses now. |
| `Sprite/*.png` | the uploaded RO-style sprite sheets (21 of them). The **source art**. |
| `tools/make_sprite_pack.py` | crops `Sprite/` → `assets/sprite_pack_data.js`. |
| `tools/montage.py` | rebuilds the four montage sheets (see below). |
| `tools/tests/` | the thirteen test suites. Run them before every push. |
| `tools/preview/` | dev-only: dumps the ten plans out of the game and paints them top-down, so a layout can be judged without a browser (`node tools/preview/dump_plans.js` then `python3 tools/preview/render_plans.py`). Nothing here ships to the player. |
| `READ-ME-FIRST.md` | handover note: what this repo is, how to run it and how to recover after a workspace reset. |

Ships by committing to `main` on GitHub (`KzeR7/Prontera-Grind`); Cloudflare Pages
rebuilds from the repo. **The two files the game actually needs are `index.html` and
`assets/sprite_pack_data.js`.** Everything else is tools, tests and docs.

Login for testing: user `GM`, password `gm1234` (GM account; normal accounts are created
in-game and stored in `localStorage` under `pg_acc4`, saves under `pg_save3_<user>`).

## House rules — non-negotiable

1. **Crop only. Never draw, trace, recolour or substitute sprite art**, and never invent
   art to fill a gap. If a class has no sheet, it falls back to its job line's art — that
   is the correct behaviour, not a bug.
2. **Both genders come from one body set.** Do not author a separate female body.
3. **All 8 directions and all 3 animation rows** (idle 1 frame, walk 8, attack 6) must
   survive any change to the packing or compositing code.
4. **Head anchors are measured per cell from the body art** — the *stub + 3* rule:
   `anchor = [round(stub_cx), stub_top + HEAD_SEAT]`, where the stub is the topmost
   narrow run of the frame (≤18 px wide, ≤16 rows tall) and `HEAD_SEAT = 3`. That is the
   frame's own hair/neck stub, so the head is welded to the neck in every pose. It
   reproduces the hand-placed shipped anchors *exactly* (106/106 stub frames, max |dy| 0)
   and beats the old "topmost silhouette pixel" rule, which anchored to a raised arm or
   blade on attack frames and made the head slide off the body. Never reuse
   `transfer_anchors()`-style offsets, and never add a global clamp: two attempts at
   clamping were measured and both float the head (see the v11 log entry). x is always
   the stub's own centre, never the silhouette centroid. Stub-less frames (the diving
   lunge) fall back to the torso with that direction's median `stub_top − hips_y`.
5. **Montage sheets only through `tools/montage.py`.** Never hand-split a montage.
6. **All thirteen test suites must be green before you push.** Add a test when you add
   behaviour. A change with no test is not finished.
7. **Bump the `BUILD` tag** (`const BUILD='…'` in `index.html`) for anything a player can
   see, and **append to the log below**.
8. **Never report a link you have not seen work.** If a push or a download cannot be
   verified, say so plainly.

## The sprite pipeline

```sh
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pillow numpy scipy   # once
/tmp/venv/bin/python tools/make_sprite_pack.py          # Sprite/ -> assets/sprite_pack_data.js
```

The tool auto-discovers a class sheet by name (`knight.png` → body `knight`), so dropping
a new sheet into `Sprite/` and re-running it is the whole workflow. It prints one line per
body with its cell/anchor health. Expected tail: `wrote assets/sprite_pack_data.js (5.8 MB,
19 bodies)`.

Four of the sheets are **montages** — fan-made composites that had to be re-cut so every
pose matches the shipped art. `make_sprite_pack.py` calls `tools/montage.py`
automatically and prints what it did:

| montage sheet | rebuilt from | poses matched | median IoU |
|---|---|---|---|
| `lord knight.png` | `knight.png` | 112/112 | 0.91 |
| `white smith.png` | `blacksmith.png` | 116/116 | 0.90 |
| `high wizard.png` | `wizard.png` | 120/120 | 0.93 |
| `high priest.png` | `priest.png` | 132/132 | 0.94 |

Pack geometry (do not change without re-measuring every anchor): cell 126×134,
pad left 15 / top 38, pivot 63/128, body atlas 96×96 per cell × 8 directions × 24 rows,
head 64×64 × 8 × 19, head drawn at `anchor − (32,48)`, frames `[1,8,6]`, fps `[1,10,12]`.

Art status: **19 classes are on their own uploaded art** — knight, lord_knight, wizard,
high_wizard, hunter, sniper, priest, high_priest, merchant, whitesmith, novice, mage,
archer, aco, swordman, blacksmith, thief, assassin, assassin_cross. Head sheets: `male`,
`female`.

## Class change — the rule as it stands

A class you have **never played** restarts: Base Lv stays as you are now, Job Lv goes back
to 1, stats are refunded to unspent points. A class you **have played** (`S.base[class]`
exists) is **one click away**: it keeps its Base Lv, EXP, stat points, stats, job level,
skills and worn gear, so going back to it is a single click from anywhere in the tree with
no Novice reset — that is what the user asked for, and `classBlock()` returns `''` for any
played class before it checks anything else. Worn gear is stored as ids only and matched
back out of the bag, so nothing is ever duplicated or conjured. The Novice is a hard
restart: Base Lv 25 (if higher), EXP 0, Novice job levels/skills cleared, stats refunded,
and `S.base.Novice` deleted. Gates that still apply, for **unplayed** classes only: parent
class job level, and "reset to Novice first" for anything not directly under the class you
are standing in.

Formulas the tests pin down: `totalPts() = 10 + Σ(3+⌊l/5⌋)` for l = 2…lv;
`need(lv)` = the three-segment v16 curve below; `jneed(j)` = the JOFF lockstep below.

## Balance - the numbers that matter

All of this lives in `index.html`. Each block is commented in-source; this is the map.

**Economy — v16 pacing** (constants sit under `// ---------- economy tuning ----------`):
the owner's anchors are **~10 min to the first job change (Base Lv ~10), ~2 h to the second
(Base Lv ~49), ~2 days to the transcendent line (Base Lv ~99)** — fast at the bottom, the
grind lives at the top. `needAt(L)` is three continuous power segments
(`NA1·L^NE1` ≤50, anchored powers to `NE2` ≤99 and `NE3` above), solved with
`tools/tune_pacing.js` against the canonical model (~800 kills/hour, camping the band map's
boss field): **Base 10 in 10 min, Base 49 in 1.9 h, Base 99 in 45 h**, then a long 100-150
endgame (**~269 h total to Lv150 at the historical model rate** — an outcome, not an anchor; retune
`aC` if the owner wants it shorter). `EXPK=5.5`, `BOSEK=46` (the boss stays 8.33x a mob),
`ZK=[8,14]`, `BZK=[150,250]`, `QZ={kill:1.6,loot:9,boss:26}`, `zenAt(p)=max(1,round(.011*p*p))`
are unchanged. **`QXP={kill:1/120,loot:1/150,boss:1/72}`** is the v11 column scaled by 4/15:
on the steep new curve quests must never carry more than ~40% of a level (they supply ~35%
overall in the historical v16 model). **Job bars mirror the base curve** (`JOFF=[0,9,49,98]`): job level j of a tier
costs the job exp (70% of mob exp) that base level j+JOFF[tier] pays out, so each job bar
fills in step with the base bar and the job gates (Novice 10 / 1st-job 40 / 2nd-job 50) land
on the anchors by construction. Zeny over a historical model run is **~46.5M**, enough for the
+10 7-slot setup and thousands of pet rolls.

> **The 800 kills/hour figure is still the model's assumption - re-measure it.** It was
> measured before skills could multi-cast, so real throughput differs (and boss fights cost
> real seconds). v16 anchored the curve to the owner's *time* targets inside that model; if
> playtest says real pacing is off, re-run `node tools/tune_pacing.js` with a corrected
> `KPH` (or move `EXPK`) instead of hand-nudging the curve - then re-check `economy_sim.js`.

**Mob HP** is `HPK*mb*pw^HPE` (`HPK=42`, `HPE=1.3`; bosses use 500 instead of 42, so a boss is
~12x a mob). `pw` is the map's recommended base level plus the field level, and `mb` is a
per-map multiplier from 1.0 to 3.35. **The exponent used to be 1.85 and that was the whole
problem**: player ATK is roughly linear in level once stats cap at 99, so HP grew quadratically
against it and time-to-kill ballooned per map - a correctly-levelled character needed ~26s per
mob on Geffen, ~64s on Payon and ~102s on Amatsu, with bosses running to 25 minutes. At 1.3 the
same builds see **1.3-9.5s per mob and 37-131s per boss**. Measured with `tools/tests`-style
extraction of the real `atk()`/`aspd()`/`crit()`/`genGear()` rather than by hand; the numbers are
in the *Balance* rationale of the v9 log entry.

> **Changing `HPE` moves kills/hour far more than `EXPK` does.** Retune one, then re-check the
> other. `save_load_sim.js` pins `HPE` into a safe band and asserts Prontera and Payon stay
> cheap, so an accidental revert fails a test.

**Stats.** `MAXST=120`, `BASECAP=99`, `ELITELV=100`, `statCap()` unlocks 100-120 only above
Base Lv 100. Grant is `4+floor(l/5)` per level; cost is `1+floor((v-1)/10)` below 100 and
`10+(v-100)` above. Reaching 120 costs 930 points, and Lv 150 grants 2,811 - so **exactly
three stats can be maxed, with 21 points spare**. Verified by simulation, not by ratio: the
obvious `3+floor(l/5)` grant curve ends at 120/120/119, i.e. only two maxed.

**The map tab** is a wide two-band panel (`.wp.wide`, `flex:2 2 900px`). Top band: the ten maps
as compact cards (`repeat(auto-fill,minmax(86px,1fr))`), name + recommended level, so an eleventh
map is just another card. Second band: the picked map's ten fields as **one row**
(`repeat(auto-fit,minmax(52px,1fr))`, so it only wraps when the window is genuinely narrow) with
the travel button on the same line - and this band is `position:sticky;top:-1px`, so the field you
are choosing stays on screen while the drop tables below it scroll. Underneath sit **two fixed-shape
cards** in `.mapcols` (`repeat(auto-fit,minmax(280px,1fr))`, side by side on a wide window,
stacked under 900px): **Monsters** and **Boss & pets**. Since v16 there is **no "gear that drops
here" card** (the owner found it bulky): every drop is listed on the monster that drops it as a
`.dropline` row (icon + name left, % right), the boss lists its whole pool as `.poolitem` chips at
1.2% each, and both cards carry the card/ore lines. Two stable cards + the reserved scrollbar
gutter (`.wbody{scrollbar-gutter:stable}`) are what keep the panel the same size when switching
maps. **Keep the order: map cards → field band → tables** - `ui_sim.js` asserts it, because the
whole point is that clicking a map shows its fields immediately below, with no scrolling.

**Every map must look different - it is a rule, not a preference.** The arena scenery is data,
not code: `TH[map]` is `[prop kind, main colour, accent, extras]` and one builder (`buildDeco`)
reads it. `extras` is where a map becomes a *place*:
* `w:[colour, pools, radiusX, radiusZ]` - standing water, drawn as a shore ring + pool + a lighter
  glint (the engine's **water** layer). Ground and water are separate, so any map can have a pond,
  a lagoon, a frozen lake or lava by changing this one line.
* `mix:[kinds]` - extra prop kinds that also scatter here, from the loose **tree** props: 6 bamboo,
  7 bush, 8 boulder (0 round tree, 1 conifer, 2 pole, 3 cactus, 4 crystal, 5 slab are the biome
  kinds). A prop kind is **not** a map index - indexing `TH` by prop kind is how Payon once came
  out with Amatsu's palette. Loose props borrow the map's own colours (boulders use `ROCK`).
* `n` scatter count and `sz` scatter scale - Niflheim is deliberately sparse (134 meshes) while
  Payon is dense forest (421).

Hard rules that `scene_sim.js` enforces:
* water appears **only** where `w` asks for it, in the colour it asks for, and every pool is
  clamped outside the running lane (`|x| >= BX_+3.5`) whatever its radius;
* no prop group starts in the lane margin (`|x| < BX_+1.5` inside `Z0-1.5..Z1+1.5`), and **nothing
  solid is drawn into the play lane** (`|x| < BX_`) once a prop is at full size - scenery is never
  an obstacle;
* every map has a distinct signature (palette + prop tally + water colour) and every map is built
  from at least two prop kinds;
* the builder is deterministic - a respawn must not reshuffle the map under the player;
* prop groups carry `userData.kind` so the scene can be inspected (and tested) without guessing
  from geometry.

**The map kit is v2 — one painted RO-style atlas for all ten maps.** The kit lives in
`assets/kit/`: `ro-spritesheet.png` + `.json` — a 2048×2048 sheet with **25 terrain tiles**
(grass_olive/forest/geffen/jade/blossom, dirt_path, dirt_payon, riverbank_wall, cliff_rock,
cliff_sand with the alias `cliff`, sand/sand_dark/sand_gold, limestone_pale, waste_nifl,
rock_abyss, ruin_cobble, paddy_water, water_frame_0/1, water_dark_0/1, bridge_planks,
bridge_red) and **34 environment billboards** (the v1 seven, three palms, two cacti, five desert
ruins and a desert bone, plus the v2 additions: bamboo_grove, tree_cherry, tree_dark_gnarled,
tree_dead, tower_geffen, house_prontera, house_ruin, torii_gate, bridge_red_arch, lantern_stone,
shrine_stone, standing_stone, tombstone, stalagmite, crystal_cluster, pier_post) — plus
`ro-map-payon.json` and `ro-map-morocc.json`, the two attached 48x32 level designs. The manifest
is a **superset of every v1 name and of every name the retired Morocc generator painted**, so it
is a drop-in; its `character.ro_adventurer` strip is v1's pixel for pixel (verified against the
v1 sheet), which is what `KIT_PK` is measured from; and it carries a `suggest.KIT_PS` table that
the game copies verbatim — `kit_sim.js` compares the two entry for entry. **The runtime desert
generator is retired**: v1 painted Morocc's atlas in the page from `assets/kit/morocc-atlas.js`;
v2 carries all of those names on the one sheet, so `'morocc'` is now only an alias and the file
lives on in `Updates/retired-v1-kit/` as history. The art is original painted work researched
against divine-pride map renders for palette and landmarks
(`Updates/map-sprites-v2/RESEARCH.md`); nothing is traced or ripped from the RO client, and the
pipeline that built it (`process_tiles.py`, `cut_props.py`, `derive_props.py`, `pack_atlas.py`)
is in `Updates/map-sprites-v2/work/` with every processed asset individually, so repacking with
additions is a five-minute job.

* `KIT_MAP` says which arena map wears what. **All ten maps wear the kit** (v18): 3 → the
  attached **morocc** design, 4 → the **payon** recipe, and the other eight → `fieldPlan`
  recipes - deterministic (seeded LCG) configs of ground tiles, cliff rings, roads, water strips,
  ground bands, decks and prop scatters/fixed landmarks, laid out in code from the same crops. A
  plan dresses the **ground** (its tiles painted into one 2048x2048 texture over the 90x90 field),
  its **water** (merged row rectangles, animated by swapping the frame pair the recipe asks for -
  the bright pair by default, `water_dark_0/1` for Abyss), its **deck** (`bridge_planks` by
  default, `bridge_red` for Amatsu) and its **props** (billboards, sized and anchored from the
  manifest).
* **Every map has its own v2 identity, and it is a rule, not a preference.** Researched map by map
  against divine-pride renders - one painted technique, ten moods - and pinned per map by
  `kit_sim.js` (ground tile + cell tiles + landmark props, and no two maps may share a signature):

  | # | map | the look |
  |---|---|---|
  | 0 | Prontera | olive meadow, warm dirt avenue, round green trees, one cottage far off-lane |
  | 1 | Izlude | teal sea, **golden sand shore band**, palms at the waterline, a pier on three posts |
  | 2 | Geffen | moody blue-grey-green plains, dark gnarled clumps, standing stones, the wizard tower in a far corner |
  | 3 | Morocc | the attached desert-ruins design, cell for cell (its pixels are v2's now) |
  | 4 | Payon | near-black forest, **red-brown mud trail**, bamboo groves on the banks, mossy boulders at the crossing |
  | 5 | Comodo | golden beach, palms, dark cave-mouth crags behind the sand |
  | 6 | Louyang | jade highland, **terraced paddy water off the lane**, bamboo, a stone shrine, lantern pairs |
  | 7 | Amatsu | blossom fields, **red lacquer bridge** on the road, a torii on the approach, lantern pairs, the great red arch far off-lane |
  | 8 | Niflheim | purple-grey waste, dead trees, graves, bones, one ruined house; no bright colour anywhere |
  | 9 | Abyss | dark slate, pale limestone shore around a **deep dark lake**, stalagmites, crystals |
* **Payon is laid out in code, not from the attached grid.** The owner rejected the attached
  payon layout (a huge diagonal lake with player-sized trees) and asked for RO's Payon Forest, so
  `payonPlan()` builds the field from the RO recipe out of the same kit tiles: a wide wandering
  **mud road** (`dirt_payon`) down the middle, a **creek** across it with a **plank bridge** on the
  road, tree lines that **tower over the player** on both banks, saplings, bushes and **bamboo
  groves** under them, a stone post and a mossy boulder on each bank at the crossing, and a rocky
  mountain edge. `ro-map-payon.json` stays in the repo as the owner's design - it is just no
  longer the field. Morocc still uses its design cell for cell.
* **Prop size is derived from the kit's own character, not guessed.** The kit ships an 80px
  character frame; this game's hero stands 2.9 units, so `KIT_PK = 2.9/80` and a prop is
  `crop height x KIT_PK x KIT_PS[type]`. `KIT_PS` is the art pass's tuned table - v2 crops are
  taller and better proportioned than v1's, so the v1 factors were wrong for them: big trees
  3.3-3.6x the hero, cherry 3.0x, palms 2.6-3.1x, dead/gnarled 2.5-2.7x, the Geffen tower 5.1x (a
  far landmark), torii 2.3x, houses ~2x, bamboo ~1.9x, saplings ~1x, bushes/curbs knee height.
  **Every prop type a field places must have a factor** - `kit_sim.js` fails on one that does
  not, because the default (1.0) makes player-sized trees again - and it also fails if the game's
  table drifts from the manifest's.
* Recipes place props three ways: `trees` (the two tree lines), `scatter` (randomised; `side`
  pins one side) and `fixed` (a landmark exactly where the brief says - a tower in a far corner,
  a torii on the approach). `bands` paint a ground tile across a depth range and an x range: the
  lane check is in the builder, so no band can ever be written into the run whatever a recipe
  says, and neither the tree line nor the scatter lands inside one.
* With one atlas there is nothing left to borrow between atlases: `'payon'`, `'morocc'` and
  `'kit'` are aliases of one manifest object, so a crop is never made twice and the v1
  cross-atlas `src` field is now a label, not a second download.
* Cell types map to tiles exactly as the kit's own engine maps them: grass→grass_olive,
  grass_dark→grass_forest, dirt→dirt_path, cliff→cliff_rock, bank→riverbank_wall. Water is the
  animated pass, bridge cells are the deck mesh, Morocc's tiles keep their own names (sand,
  sand_dark, ruin_cobble, cliff) and its sky cells are off-map. **Keep the mapping in step with
  `ro-map-engine.js`'s `_rebuildTerrainCache`** - that is where it comes from.
* The design is anchored on the point it is built around (Payon's bridge, Morocc's grid centre)
  and centred on the play band (`KIT_ZC`), one cell = `KIT_S` = 0.85 world units.
* **Props never stand in the running lane** (`|x| < BX_`). Props a design puts there are moved to
  the lane edge (their side and depth kept) - never dropped, so the design's prop count survives -
  and the plan counts them as `nudged`, so the rule is visible in the plan instead of silent.
  Billboards may overhang the lane *visually* (a torii's arch spans part of the road, as the tree
  canopies always have); nothing is *placed* there. If a crop a design asks for is missing from
  the atlas, the placement is **skipped and reported, never substituted** - v2 closed the last
  such gap (`rock_boulder_mossy`, skipped and reported since kit-v14, now renders).
* Nothing in the kit is drawn, traced, recoloured or substituted by this repo.
* If the atlas cannot load, every map falls back to the v13 scenery (`buildKit` returns null and
  `buildDeco` continues). The kit must never be able to break the game.
* `kit_sim.js` pins all of it (30 tests): the v2 manifest (25 tiles / 34 billboards, crops inside
  the sheet, anchors at the feet, the 80px character strip), the drop-in superset and the retired
  generator, `KIT_PS` equal to the manifest's table and covering every billboard, the alias
  unification, the Payon recipe (mud road, creek, bridge on the road, bamboo on both banks,
  boulders at the crossing, both tree lines, the creek out of the monster spawn band), Morocc's
  design cell for cell off v2's crops, each map's identity and unique signature, the landmarks
  (one each, off-lane, RO-scaled), the red deck and the lantern pairs, the dark water pair and
  its animation, the paddies off-lane with nothing standing in them, water out of the spawn band
  unless decked, the decks where the recipe says, the RO scale (trees ≥ 3x the hero, bushes knee
  height, a crag boulder-*shaped*), all ten maps building against a stubbed canvas/THREE with
  every crop shared between placements, and the dead-atlas fallback.

**What RO Payon actually looks like** (researched for kit-v15, and the look v2 finally has art
for): a *mountainous bamboo forest* - Payon village is built on a mountain edge with steep cliffs
over a river, and the forest fields are a dirt path cut through big dark trees: brown mud ground
with grass at the edges, a trunk wider than the character, ferns at its base, the player tiny
against it. `payonPlan()` lays that out; v2 ships the **bamboo groves and the mossy boulder** the
v1 kit lacked - both were reported as gaps rather than drawn, and both now come from the sheet.

**Drop rarity is FIXED; the affixes are not (v34).** `dropTier(map, stage)` is a property of
*where* an item falls, not of the roll: each map sits on a rarity band (`MAPTIER`, maps 1-2
Common / 3-4 Fine / 5-6 Rare / 7-10 Epic), stages 8-9 walk that band one step up, no regular drop
is ever Legendary, and **every Stage 10 boss drop is Legendary**. The map panel states the band
on the drop lines, and `genGear()` only rolls the random half of the item - its **affixes**, its
refine room and its value inside the band - so two drops of the same name still differ. LUK no
longer nudges the rarity roll (there is no roll to nudge); it still lifts the drop *odds*.
`gear_sim.js` pins the whole ladder. Selling is pocket money by the same rule: `sellVal()` runs
~50z for a Common starter piece to ~1,825z for the best Legendary Abyss gear, so a bag dump
never funds an upgrade. The bag itself holds `BAGMAX = 1000` items; at capacity loot is refused
and stays on the ground (cards live in their own, uncapped bag).

**Equipment database and drops.** `GEAR[map][section]` is the catalogue - 10 maps × 4 sections
(Novice / 1st job / 2nd job / high tier), each section carrying 2-3 weapon types plus body,
headgear, shield, legwear and two accessories (**96 weapon entries** in total; armour and
accessory names are unique across the whole game). The section a field rolls is
`secOf(lvl)` - levels 1-3 / 4-7 / 8-9 / 10 - except the five level 60+ maps, which are pinned to
their high-tier section. **A drop is always relevant**: every weapon in a map's pool is one a
class that levels there can use, and the type a line trains in is never missing from its map
(the five early maps are class-themed - merchants get axes and maces, mages staves, archers
bows, thieves daggers then katars). `gearPool(m,l)` is the whole pool; `fieldOf(m,l)` gives each
mob **three** gear rolls (2.4 % / 2.0 % / 1.6 %) spread across the pool, and a card at **0.45 %**
- gear outnumbers cards ~13:1 per mob, where the old field rolled two gear items and three
mobs' worth of cards. Level 10 bosses drop the entire pool at 1.2 % each plus their Legendary
card at 0.08 %. **Refine ores** (Oridecon / Elunium) drop only on Level 10 fields: **2 % per
ore per monster, 5 % per boss** (v16 buff, was a flat 0.4 %) - `fieldOf` carries the rates as
`oreCh`, and `kill()` rolls `Math.random()<mob.oreCh` per ore. `gearSlot(x)` maps a pool entry
to its UI group, because a weapon entry carries its *type* as `k`, not `'weapon'`.

**Cards.** Grade gates the stat pool. `cardStat(g,seed)` draws from `K5` (the five base stats)
for Common/Fine and from `AFF` (base stats + hp/atk/crit/aspd/flee/cdm) for Rare/Legendary,
because **the two lowest grades must not get the new effects**. `cardVal(g,st)=round(CV[g]*AB[st])`
so a Legendary HP card is worth 60 and a Legendary STR card 5 - percentages look small on
purpose, they multiply the whole attack total. `CFIT` maps each stat to a gear slot.

**Pets.** Drops only - **there is no hatching and no hatch button**; `ACT.egg` and `ACT.ptg`
were dead code and have been deleted. Training is a gacha roll: `PTG=[.4,.25,.15,.09,.05]` is
the success chance by current tier and `GREAT=.05` makes one success in twenty jump two tiers.
`peqCost(t)=1200*(t+1)^2`. **Nerfed in v11** - the old ladder (`[.8,.6,.4,.25,.12]`, `GREAT=.1`)
maxed a stat in **16 rolls / 334k Zeny**; the new one takes **40 rolls / 802k per stat, and
~2.4M for all three pieces** (measured by Monte-Carlo over the real ladder, `economy_sim.js`
pins it). It is the last optional sink, so it is meant to be the priciest thing a maxed player
buys. **The 3-vs-40 split is correct and is not a bug**: 3 is the equip limit, 40 the collection cap.
**Measured power (v34, `tools/tests/pet_sim.js`)**: a maxed G6 Legendary pet (Mythril 5/5/5,
Spirit Bolt) deals **~2.2M per hit / ~3.4M DPS** against an endgame Lord Knight's ~377k auto-attack
DPS - **9.0x the owner's plain swings, 0.45x a fully maxed skill rotation, and 1.34x that player
with three pets on the field**; it alone kills an Abyss Stage-10 boss (658k HP) in ~0.2s. Even the
weakest maxed pet (a Common Poring) is 1.4x the owner's auto-attacks. The multiplier is flat
(`petDmg = atk x rarity x mutation x Claw`), so **the ratio is the same at every level and every
gear tier** - a maxed pet carries a fresh character exactly as hard as a Lv150 one. The audit is
printed by the suite; no pet number was changed in v34 - the owner has the measurement and the
call.

**Skills.** Two structural rules, both pinned by `skill_sim.js`:

* **Parity.** Novice has exactly 1 skill, and *every* job line has exactly 4 of its own - 1st,
  2nd and transcendent alike. Novice having only First Aid is correct, not a gap: in RO the
  Novice has no offensive skills. Do not add one. Inventing a Novice attack skill is what put a
  bogus chain tag in *every* class tree, because every class inherits Novice.
* **Scarcity.** `skCost(L)=L`, so buying level L costs L points and maxing a 5-level skill costs
  15. A line earns 9 (Novice) / 58 (1st) / 107 (2nd) / 156 (transcendent) and can reach
  1 / 5 / 9 / 13 skills - i.e. 14 / 74 / 134 / 194 points of tree after the free first point of
  aid. **No line can max its own tree**, which is the point: the shortfall is 5 / 16 / 27 / 38
  points. At one point per level every line could, with 28-86 points left over. Removing or
  renaming a skill refunds its points through a repair in `load()`.
* **The ledger is per line, and it counts what the + button charged.** `skLine()` is
  `lineOf(S.cls)`, `skEarned()` sums only those classes' job levels, and
  `skSpent()` sums `skCostOf(L)=L(L+1)/2` - the cumulative cost of reaching level L - not the
  level itself. Both halves matter: the v10 code pooled **every class you had ever played**
  against **one global `S.sk`**, and subtracted only the skill's *level*, so a purchase
  refunded two thirds of its own price (maxing nine skills paid 134 points and the ledger
  remembered 45). That is the skill-point overflow the owner kept seeing. `skpAvail()` clamps
  at 0 so an over-spent save from an older build reads as "nothing spare" rather than
  negative, and pays the deficit down as the line earns more job levels.

**Skill feel, not skill accuracy.** This is an RO-*flavoured* game, not a clone, and the owner
has said so explicitly. iRO Wiki was used to fix outright mistakes - skills belonging to 3rd
jobs, skills that do not exist, and a duplicate display name on Sniper - but **mechanics are
assigned for feel, not for fidelity**. The rule that is actually enforced (`skill_sim.js`) is
coverage: *every job line must reach at least three of dot / stun / chain / AoE / tradeoff*, and
`Bash` stays untagged as a baseline so the effects read as a difference. Current spread:
dot 12, stun 16, chain 10, AoE 19, tradeoff 7 across 73 skills, with all six job lines holding
a tradeoff. If you add a skill, check the line it lands on still clears three.

Two identity choices worth keeping: the **Thief line has no AoE** (single-target burst and
poison instead), and **only one tradeoff runs at a time** - when several are ready the highest
`atk+aspd` payoff wins, so a Lord Knight gets Frenzy over the Two-Hand Quicken inherited from
Knight. Switching a rival off in the Skills panel is how a player overrides that.

> **Trap:** tradeoffs are easy to ship broken and hard to notice. `to.atk`, `to.aspd`, `to.def`,
> `to.drain` and `to.dur` are **functions of skill level** and must be *called* when the buff
> starts; storing them raw puts a function in `tb.atk`, `atk()` returns NaN and every hit deals
> NaN. Separately `tb.t` is `undefined` until the first cast, so guards must read `(tb.t||0)` -
> written as `tb.t<=0` they are false forever and no tradeoff ever fires at all. Both shipped in
> v8 and v9. `skill_sim.js` now lifts the real activation and expiry blocks out of `update()` by
> brace-matching and executes them, because a structural test cannot catch either bug.

> **Trap:** the `FX` effect-tagging loop must run **after** `SKILLS.push(...)`. It used to sit
> above it, so `SKILLS.find()` returned `undefined` for every new skill and the `if(s)` guard
> swallowed it silently - the roster looked correct in source and did nothing at runtime.
> `skill_sim.js` has a regression test that reads the tags back off the pushed skills.

**Skills.** Four effects, and only these four - `dot` (`pow` is the share of the triggering
hit dealt **per second**), `stun` (a mob neither advances nor swings; halved on bosses, capped
so nothing can be locked down), `chain` (bounces onto the nearest mobs) and `to` (tradeoff: an
auto-cast buff with a real cost, gated on an HP floor, never firing while another is running).
Casts per swing scale with job tier via `SKSLOTS`/`SKFADE`: Novice 1, first job 2, second job 3,
later casts at 55% / 30%. Every castable skill can be switched off through `S.skOff`, which is
persisted and repaired on load. **Do not add new effect types** without asking.

**Arena.** With no mobs on the field the character **roams** (picks a fresh spot every 2.2-4.5s
via `pl.wt/wx/wz`); it does not march back to the entrance. **Only a defeat resets the position**
to `x=0, z=Z1-1.5`. Both are pinned in `save_load_sim.js`.

The battle arena is **26 wide by 40 deep**: `BX_=13`, `Z0=-28`, `Z1=12`. The
camera sits on +Z looking toward -Z, which makes **low Z the top of the screen**. The
player starts at `Z1-1.5` (bottom). Every respawn rerolls three pack sites in the dry,
open field: **13–18.5 units apart** (v30, between v28’s fixed ~18–23 and v29’s 9.5–15.5). `AGGRO=6.5`, and only
the active pack can chase or attack; on each spawn and after each pack falls, `nearestPack()`
chooses whichever surviving pack is closest to the player. Pets and skills stay on that
pack; no 1 → 2 → 3 fixed order. On Stage 10 the boss appears immediately
with three regular escorts on maps 1–5 or five on maps 6–10. Defeat the boss to
clear its remaining escorts; the whole boss wave respawns without a kill prerequisite.
`ct.z` tracks `pl.z-5` to keep the player in the lower part of the frame. Prontera's
fallback town stays beyond the far edge (`TZ=Z0-8`).

**Monster render size (v30):** the Divine Pride Small/Medium/Large labels and base
factors `.62/.92/1.28` are still intact, but normal monsters render at **70%** of their
former visual height in *both* sprite paths (GPU and HTML fallback). Against the 2.92-unit
hero, Fabre now appears ~1.32 units tall and Poring ~1.96; even Large regular mobs are
below player height. Boss rendering is **unchanged** (`spriteScale * 1.18`). These are
visual-only changes — `size` (combat reach), HP, stats, rewards and the monster art are not
modified. `mobVisualScale()` is the shared helper for mob mesh, DOM sprite and target tag.

**Stage scenes (v29):** `KIT_MAP` is the original map scene on stages 1–3; `STAGE_SCENES`
is ten maps × three **independent, themed recipes** for 4–6, 7–9 and 10. `stageSpec(m,l)`
selects the recipe, `kitPlan(m,l)` builds it, and the draw key includes the stage. Later
recipes set their own base, path, water, decks, vegetation and landmarks; even Morocc uses a
new field layout rather than stamping its original attached design with extras. **No later
scene uses a noise patch, monster floor pad, boss-floor ring, plaza or round stamp.** Boss
stages stand out through paired map-native landmarks *outside* the lane, not floor paint.
Water is still allowed where it belongs to the map (sea, creek, dark lake), and randomized
pack sites reject water. Stages 1–3 retain their v27 scene and its original organic ground
variation; nothing was added around their spawn sites. All pixels remain the existing kit.


**Art.** No map or terrain sheets exist in `Sprite/`, and house rule 1 forbids inventing art, so
all map visuals are procedural: `TH[m]` picks a biome kind and two colours, `buildDeco` scatters
props, and `landmark()` places the large structures that frame the avenue.

## What is needed going forward

1. **Re-measure kills/hour** after a real playtest, then retune. v16 anchored the whole pacing
   curve to the owner's time targets (10 min / 2 h / 2 days to the three job changes) *inside the
   800 kills/hour model*, so the curve is right **for that model** - if real throughput differs,
   re-run `node tools/tune_pacing.js` with the measured `KPH` and let it re-solve `needAt`
   (then re-check `economy_sim.js`). Do not hand-nudge the curve, and do not guess `EXPK`:
   playtest, read the real kills/hour, then re-solve.
2. **Player HP is an open design question, deliberately untouched.** The user is still deciding
   whether to remove it. Nothing in the death path has been changed. If it is removed, the
   casualties are `def()`, `mdef()`, `flee()`, `maxHp()`, VIT, `bon('hp')`, the head/acc HP
   scaling, First Aid, and the passives `endure`, `hprec`, `coat`, `heal`, `sanct`, `assum`,
   `skin` and `phys` - that is a large refactor, not a deletion. Note also that the real
   punishment today is not dying, it is that defeat sets `S.kl=0`, which throws away progress
   toward the 15-kill boss threshold.
3. **Ranged engagement is still special-cased to one skill.** The 5-unit "you may attack from
   range" check in `update()` is hardcoded to `skillOn('soulb')`, so the `rng` flag on any other
   skill does almost nothing. Generalising it would buff every ranged class at once - do it
   deliberately, with the kills/hour number in hand.
4. **The shadow map went 1024 -> 2048** when the field got longer, and landmarks added ~40 shadow
   casters. Watch frame rate on weak machines before adding more scenery.

## Verify before you push (expected output)

```sh
python3 - <<'PY'
h=open('index.html').read()
open('/tmp/pack_block.js','w').write(h[h.index('const PACK_BODY='):h.index('function ensureHero(')])
PY
node tools/tests/pack_sim.js           # -> "bodies in pack (19): ..."
node tools/tests/class_change_sim.js   # -> "22 passed, 0 failed"
node tools/tests/save_load_sim.js      # -> "10 passed, 0 failed"
node tools/tests/economy_sim.js        # -> "21 passed, 0 failed"
node tools/tests/stat_sim.js           # -> "7 passed, 0 failed"
node tools/tests/card_sim.js           # -> "13 passed, 0 failed"
node tools/tests/skill_sim.js          # -> "48 passed, 0 failed"
node tools/tests/gear_sim.js           # -> "20 passed, 0 failed  (20 assertions groups)"
node tools/tests/scene_sim.js          # -> "8 passed, 0 failed" (per-map scenery, water, clear lane)
node tools/tests/kit_sim.js            # -> "20 passed, 0 failed" (payon recipe + RO scale, morocc design, builders, loader)
node tools/tests/ui_sim.js             # -> "13 passed, 0 failed"
node tools/tests/sprite_sim.js         # -> "10 passed, 0 failed" (mob art, weapon icons, view names)
node tools/tests/starter_sim.js        # -> "4 passed, 0 failed"
node tools/tests/weapon_joint_sim.js   # -> "7 passed, 0 failed" (measured hand joints, parked weapon)
node tools/tests/picker_sim.js         # -> "13 passed, 0 failed" (the picker the owner uses, booted under a DOM stub)
node tools/tests/pack_sim.js          # -> "bodies in pack (19): ..."
node tools/tests/class_change_sim.js  # -> "22 passed, 0 failed"
node tools/tests/save_load_sim.js     # -> "10 passed, 0 failed"
node tools/tests/economy_sim.js       # -> "21 passed, 0 failed"
node tools/tests/stat_sim.js          # -> "7 passed, 0 failed"
node tools/tests/card_sim.js          # -> "13 passed, 0 failed"
node tools/tests/skill_sim.js         # -> "50 passed, 0 failed"
node tools/tests/gear_sim.js          # -> "24 passed, 0 failed  (24 assertions groups)"
node tools/tests/scene_sim.js         # -> "8 passed, 0 failed" (per-map scenery, water, clear lane)
node tools/tests/kit_sim.js           # -> "34 passed, 0 failed" (v2 atlas + KIT_PS, payon recipe, morocc design, ten identities, builders, loader)
node tools/tests/ui_sim.js            # -> "18 passed, 0 failed"
node tools/tests/sprite_sim.js        # -> "11 passed, 0 failed" (mob/weapon Divine Pride mapping, fallbacks)
node tools/tests/starter_sim.js       # -> "7 passed, 0 failed" (the gentle starter stages)
node tools/tests/pet_sim.js           # -> "11 passed, 0 failed" (+ the printed pet data, buff rules and the maxed-pet balance measurement)
```

Every suite pulls real code out of `index.html` by **string boundary**, so an edit that
moves a declaration can break a test without breaking the game. Traps, all hit once already:

* `save_load_sim.js` grabs `const CD=[` to `const fresh=()=>` and `const fresh=()=>` to
  `const saveKey=`. **Anything a helper inside `load()` refers to must be declared inside
  one of those spans** - that is why the `MAXST/BASECAP/ELITELV/statCap` block and
  `cardVal/cardStat` sit *before* `fresh()`, and why arena geometry (`BX_/Z0/Z1/MPS/AGGRO`)
  is grabbed rather than stubbed.
* The `pl` declaration lives inside that second span. If you express the player spawn
  point in terms of an arena constant, the harness needs that constant too.
* Two skills reachable by one class must not share a display **name** even if their ids differ -
  Sniper shipped with two separate "Falcon Assault" entries. `skill_sim.js` checks every class.
* Two constants share one line, so a regex for one returns both: `skOff` and `skillOn`.
  Check what you actually grabbed before declaring either in a harness.
* A test that re-declares a game formula needs a **source pin** (a regex asserting the
  real formula is still there) or it will happily pass against a stale copy.
  `class_change_sim.js` and `save_load_sim.js` both have one.
* `ui_sim.js` renders the **real** `V.*` panels against a fake save and fails on any
  `undefined` in the HTML and on any `data-a="…"` that is not a key in `ACT`. That lint
  is why the slot chooser's buttons are known to be wired; run it after touching a panel.
  A panel that prints `undefined` (a pool entry with no `k`, a missing `SECN` index) is the
  failure mode it exists for - the map panel shipped one such blank during v11 development.
* `gear_sim.js` checks the equipment database and the slot chooser's filter. Its map-to-line
  table is the **design intent** (which classes each map serves): if you add a weapon type to
  a map, either that map's lines must be able to use it or the table is wrong.

`pack_sim.js` reads the pack from the repo it lives in (`PACK_DATA=<path>` to override) and
needs `/tmp/pack_block.js` (the command above writes it; `PACK_BLOCK=<path>` to override).
`class_change_sim.js` pulls the real functions out of `index.html`, so it fails loudly if a
function name changes.

## Delivery — read this before promising the user anything

* **The user gets the game through GitHub, not through chat.** Uploads to the repo are the
  confirmed working route; there is no other one.
* **Arena's preview panel blocks file downloads**, and raw sandbox URLs
  (`https://<port>-<id>.e2b.app/…`) now require a traffic token, so a plain link is **not** a
  delivery method any more. Do not hand the user a download URL and call it done.
* **Give the user the pull-request link** after a push — that is what they merge from.
* A sandbox preview server *does* work for showing the user a running build
  (`python3 -m http.server 8000 --bind 0.0.0.0` from the repo root). Use it to let them
  eyeball a visual change; it is still **not** a delivery route.
* **The workspace can reset mid-session.** It has happened repeatedly: the repo re-clones,
  `git` rewinds to the base commit, `/tmp` is emptied, background servers die. Keep work
  committed, re-check `git log` after every few tool calls, and never run
  `git checkout -f` / `git reset --hard` over modified files — it silently reverts them.
* Recovery path if a reset lands: the repo **is** the backup. `index.html`, the sprite pack and
  the map kit are all committed, so a fresh clone plus `git pull` on the working branch is the
  whole recovery - then re-run the thirteen suites to prove the tree is sane (`READ-ME-FIRST.md`
  has the commands). **There is no bootstrap script any more**: `UPDATE-BOOTSTRAP.py` was deleted
  in v27 because it was a v7-era self-installer that overwrote `index.html` and `tools/` with a
  compressed 2026-10-02 build - running it would have thrown a week of work away. It is in git
  history if anyone ever wants to read it; do not bring it back.
* Network egress from the sandbox is **GitHub only** — every file host tested (transfer.sh,
  0x0.st, catbox, filebin, …) is unreachable. `pip` works.

## Update log

Newest entry last. Template at the very bottom of this file.

### 2026-10-02 — `sprites-v4 full-class-pack`
* First full class pack: the class sheets in `Sprite/` were packed into
  `assets/sprite_pack_data.js` (9 bodies: novice, mage, archer, aco, swordman,
  blacksmith, thief, assassin, assassin_cross) and every class without its own art
  fell back to its job line's body.
* Merchant was wired to the **blacksmith** sheet by mistake — noted here because it was
  fixed the next day.
* `tools/make_sprite_pack.py` introduced; anchors were offset in this build, which
  produced the head wobble fixed on 2026-10-03.

### 2026-10-03 — `sprites-v7 all 19 classes`
* **Every class is now on its own uploaded art.** Knight, lord knight, wizard, high
  wizard, hunter, sniper, priest, high priest and merchant were added; the merchant now
  uses `merchant.png`, not the blacksmith sheet. 18 classes built; thief, assassin and
  assassin cross kept as shipped. Pack: 5.8 MB, 19 bodies, ~120/120 cells per body.
* **The four montage sheets were re-cut** through `tools/montage.py` (table above) so
  every pose matches the shipped art. Nothing was drawn — the sheets were only cut up.
* **Head wobble fixed.** Anchors are now measured per cell from each body (band-4 top row
  centroid): **0.16–0.38 px** seating error across all 19 bodies, where the shipped art
  measures 0.24 px. The old build was 7–13 px off.
* **Class change is a restart**, with memory: see *Class change* above for the exact rule
  (AXC 120/40 → Novice → Hunter 90 example is pinned in the tests).
* **Test suites added**: `tools/tests/pack_sim.js` (pack vs. the game's own compositing),
  `class_change_sim.js` (11 checks), `save_load_sim.js` (4 checks).
* One known wart, printed by the tool every build: `lord_knight` has no attack row for
  direction 4 in the montage sheet, so the pack borrows the attack rows for that one
  direction (`borrowed attack rows for dirs [4]`). It looks right in game; fixing it
  properly needs a better `lord knight.png`.
* **`UPDATE-BOOTSTRAP.py` added** so this whole update can be rebuilt from a fresh clone
  of `main` — verified end to end twice, on a clone of `main` and on a clone of a branch
  with no sheets; both produced `index.html` with sha256 `b6ec63ea…` and a pack whose 19
  atlases are byte-identical to the built one.

### 2026-10-03 - `balance-v8 economy stats cards pets skills arena`
* **What changed for the player:**
  * **Levelling is ~1.35x faster and no longer broken.** The old `newQuest` multiplied quest
    rewards by `gx()/100`, and `gx()` is 1 for a normal account - so quests paid a *hundredth*
    of what the GM test account saw, with nothing to cancel it. A Lv150 kill quest paid 20z/36xp
    against a 244,311-exp level. Quests are now worth **31.7%** of total exp and a run is
    **96.4 h at 800 kills/hour** (was ~130 h). Zeny per run went 1.25M -> **12.2M**.
  * **Three stats can be maxed at Lv 150, not two.** Stat cap raised 99 -> **120**, with 100-120
    gated behind Base Lv 100. The grant curve had to change too: at `3+floor(l/5)` the best
    possible build ends 120/120/119.
  * **Cards scale with grade.** Rare and Legendary now roll hp/atk/crit/aspd/flee/cdm as well as
    the five base stats; Common and Fine deliberately do not.
  * **Pet training is a gamble, not a purchase.** The guaranteed Zeny tier-up became a roll
    (80/60/40/25/12%, one in ten jumps two tiers). The unreachable hatch button's code is gone.
  * **Skills are no longer all the same shape.** 55 skills reduced to "hit for X%" or "+Y% to one
    stat"; there are now **74**, with damage-over-time, stun, chain-bounce and risk/reward
    tradeoff buffs. Higher job tiers **cast more per swing** (Novice 1 -> second job 3) so a
    maxed build spams instead of auto-attacking. Every skill has an on/off switch.
  * **The field is a vertical avenue.** The player spawns at the bottom, mobs hold the top, and
    you run up to engage. Each map got a worn track and 14 large landmark structures; Prontera's
    buildings moved behind the field so it reads as a skyline rather than a maze.
* **Files touched:** `index.html`, `AGENTS.md`, `tools/tests/*` (four suites added, two updated).
* **Art:** none. No sheets were added, removed or rebuilt, and `tools/montage.py` was not run.
  There are no map or terrain sheets in `Sprite/`, so all map visuals stay procedural.
* **Tests:** `pack_sim` (19 bodies) / `class_change_sim` 11 / `save_load_sim` 6 /
  `economy_sim` 10 / `stat_sim` 7 / `card_sim` 13 / `skill_sim` 17 - all green.
  New: `economy_sim.js` pins the exp total, the quest share and the Zeny-per-run;
  `stat_sim.js` pins the 930-point cost, the elite ramp and the three-maxed-stats outcome;
  `card_sim.js` pins grade gating, `CFIT` slot spread and legacy-save repair;
  `skill_sim.js` pins the roster, effect ranges, stun caps and the auto-cast switch.
* **Branches / PR:** `arena/01a0ff7d-prontera-grind`.
* **Known limits / follow-ups:**
  * **The 96.4 h figure is measured against the pre-skill 800 kills/hour** and is therefore an
    over-estimate now. Re-measure, then retune `EXPK` - see *Balance* above.
  * Removing player HP was **explicitly deferred by the user** and nothing in the death path
    changed. Options are written up in the session notes, not implemented.
  * `rng` on skills is still inert except for Soul Breaker (hardcoded 5-unit engagement check).
  * Shadow map raised to 2048 and landmarks added ~40 casters; watch frame rate.

### 2026-10-03 - `balance-v9 roam mobhp skill-points RO-accuracy`
Follow-up pass after the user played v8. Four complaints, all confirmed against the source.

* **What changed for the player:**
  * **You no longer walk back down the field between packs.** With no mobs alive the character
    roams (fresh spot every 2.2-4.5s). **Only a defeat returns you to the entrance**, which now
    says "knocked back to the entrance" instead of "resting and retrying".
  * **Mobs die several times faster, especially on the early maps.** HP was `42*mb*pw^1.85`;
    the exponent is now **1.3**. Player ATK is roughly linear in level once stats cap, so 1.85
    grew quadratically against it. Measured on real builds with the game's own `atk()`/`aspd()`/
    `crit()`/`genGear()`:

    | map | build | TTK before | TTK after | boss before | boss after |
    |---|---|---|---|---|---|
    | Prontera | Novice Lv10 | 0.3s | 0.3s | 281s | 79s |
    | Izlude | Merchant Lv25 | 5.0s | 1.3s | 194s | 37s |
    | Geffen | Mage Lv35 | 27.1s | 5.3s | 641s | 102s |
    | Payon | Archer Lv55 | 63.5s | 7.9s | 1067s | 120s |
    | Amatsu | High Wizard Lv85 | 102.1s | 9.5s | 1502s | 131s |
    | Abyss | Whitesmith Lv99 | 52.5s | 4.4s | 745s | 59s |

    Prontera is the Novice farm and Izlude/Geffen/Morroc/Payon now fall to a first job, as asked.
    Bosses stay ~12x a mob so they still read as bosses.
  * **You can no longer max the whole skill tree.** A skill level now costs *its own level* in
    points (1,2,3,4,5 = 15 to max), where it used to cost 1. A line earns 9/58/107/156 and can
    reach 15/75/135/195 points of tree, so every tier has to choose. The `+` button shows the
    cost and greys out when you cannot afford it.
  * **Skills checked against Ragnarok Online.** Throw Stone removed (not an RO skill - and
    because every class inherits Novice, its chain tag was leaking an AoE-looking bounce into
    every tree, which is the "thief throw stone is aoe" report). Rolling Cutter -> Advanced
    Katar Mastery (Rolling Cutter is Guillotine Cross, a 3rd job), Adoramus -> Basilica
    (Archbishop), Charged Arrow -> Falcon Assault, Head Crush -> Traumatic Blow, Fire Wall off
    Wizard (a Mage spell) -> Frost Nova. Targeting retagged: Bowling Bash is a 5x5 area rather
    than a bounce; Jupitel Thunder, Double Strafe, Spear Boomerang, Frost Diver, Lord of
    Vermilion, Falcon Assault and Venom Splasher are single-target and no longer chain; Grimtooth
    and Meltdown lost their invented DoT/stun; Meteor Storm gained its stun chance. The Thief
    line now has **no AoE** except Grimtooth and Meteor Assault, matching the wiki.
  * **Every job line has exactly 4 of its own skills** (Novice has 1 - First Aid - which is
    correct: RO Novices have no offensive skills). Transcendent jobs now cast **4** skills per
    swing, not 3; tier is 0/1/2/3 and `SKFADE` gained a fourth rung (100/55/30/18%).
* **Files touched:** `index.html`, `AGENTS.md`, `tools/tests/skill_sim.js`,
  `tools/tests/save_load_sim.js`.
* **Art:** none. No sheets added, removed or rebuilt; `tools/montage.py` not run.
* **Tests:** `pack_sim` (19 bodies) / `class_change_sim` 11 / `save_load_sim` 9 /
  `economy_sim` 10 / `stat_sim` 7 / `card_sim` 13 / `skill_sim` 22 - all green.
  New checks: per-tier skill parity, no line can max its tree, effect tags actually attached to
  the pushed skills, the Thief line has no AoE, the invented skills are gone, single-target RO
  skills carry no area/bounce tag, orphaned skill ids are refunded on load, roaming replaces the
  march back to spawn, defeat resets position, and `HPE` stays in a safe band with Prontera and
  Payon pinned cheap.
* **Branches / PR:** `arena/01a0ff7d-prontera-grind`, pull request #3.
* **Known limits / follow-ups:**
  * **The 96.4 h run estimate is now stale in the other direction.** It was solved against
    800 kills/hour on the old 1.85 exponent. With mobs dying several times faster the real
    throughput is much higher and the run will finish **under** 96 h. Deliberately not
    pre-compensated: playtest, read the actual kills/hour, then raise `EXPK` if the run is too
    short. More fast kills is the intended feel - slower kills is not the fix.
  * **A real bug was found and fixed here:** the `FX` tagging loop ran *above* `SKILLS.push()`,
    so `SKILLS.find()` returned `undefined` for all 20 new skills and the `if(s)` guard
    swallowed it. Dot/stun/chain/AoE did nothing on every new skill in v8. Regression test added.
  * Player HP still untouched, as instructed. The defeat path now also clears any running
    tradeoff buff (`tb={}`) so you cannot respawn mid-drain.
  * `rng` on skills is still inert except for Soul Breaker (hardcoded 5-unit engagement check).

### 2026-10-03 - `balance-v10 tradeoffs-live mechanics-spread` (current)
The owner clarified that this is an RO-*flavoured* game, not a clone, so skill mechanics are now
assigned for feel rather than fidelity. While reworking that, two shipped bugs surfaced.

* **What changed for the player:**
  * **Tradeoffs now actually work.** They never fired in v8 or v9. `tb.t` was `undefined` until
    the first cast, so the `tb.t<=0` guard was false forever; and the level-scaling functions
    (`to.atk`, `to.dur`, ...) were stored in `tb` instead of being called, which would have made
    `atk()` return NaN and every hit deal NaN the moment one did fire. Frenzy, Deadly Poison and
    Overthrust were dead skills with a live-looking panel entry.
  * **Seven tradeoffs now exist, one per job line** (was three). Two-Hand Quicken (Knight),
    Energy Coat (Mage) and Basilica (High Priest) were passive stat sticks and are now timed
    auto-cast buffs with a cost; Wind Walk (Sniper) is new. Energy Coat is deliberately
    *defensive* - DEF +55 for ATK -21% - so tradeoffs are not all the same shape. Only one runs
    at a time and the biggest payoff wins, so switching a rival off in the Skills panel is how
    you steer it.
  * **Mechanics reach every line.** Archer, Thief, Acolyte and Merchant were reaching only one or
    two of the five mechanics. Double Strafe, Mammonite, Envenom, Sonic Blow, Venom Splasher,
    Jupitel Thunder, Spear Boomerang and the pre-existing Falcon Assault gained chain; Arrow
    Shower, Signum Crucis, Land Mine, Turn Undead, Cart Revolution, Magnum Break and Meltdown
    gained stun; Lord of Vermilion, Holy Light, Magnus Exorcismus and Judex gained dot.
    Spread is now dot 12 / stun 16 / chain 10 / AoE 19 / tradeoff 7, and **every job line
    reaches at least three mechanics** (was: Archer reached one).
  * **Sniper no longer shows "Falcon Assault" twice.** It already had `act('falcon',
    'Falcon Assault')`; the v9 addition reused the name under a different id, so the tree showed
    one label twice with different numbers behind it. The new slot is Wind Walk instead.
* **Files touched:** `index.html`, `AGENTS.md`, `tools/tests/skill_sim.js`.
* **Art:** none. No sheets added, removed or rebuilt; `tools/montage.py` not run.
* **Tests:** `pack_sim` (19 bodies) / `class_change_sim` 11 / `save_load_sim` 9 / `economy_sim` 10
  / `stat_sim` 7 / `card_sim` 13 / `skill_sim` **31** - all green.
  `skill_sim.js` gained seven **behavioural** tradeoff tests that brace-match the real activation
  and expiry blocks out of `update()` and execute them: a buff fires and fills `tb` with finite
  numbers, it expires rather than lasting forever, Deadly Poison drains HP but floors at 1, the
  HP gate blocks a cast, a running buff is never stacked, `skOff` suppresses it, and the strongest
  of two ready tradeoffs wins. A structural test could not have caught either shipped bug. Also
  added: no class may see two skills with the same display name.
  Retargeted away from RO purity: the single-target-purity test became a coverage test (every
  line reaches three mechanics, `Bash` stays untagged as a baseline), and the tradeoff test now
  scores benefit and cost in both directions so a defensive tradeoff passes.
* **Branches / PR:** `arena/01a0ff7d-prontera-grind`, pull request #3.
* **Known limits / follow-ups:**
  * Two shipped bugs (inert FX tags, dead tradeoffs) were both **silent**: a guard clause
    (`if(s)`) and an `undefined<=0` comparison each swallowed the failure, and every structural
    test still passed. Anything added to a roster by post-hoc mutation needs a test that reads
    the value back off the live object, not off the source text.
  * Kills/hour still needs a real playtest before `EXPK` is retuned - see the v9 entry.
  * Player HP still untouched, as instructed.
  * `rng` on skills is still inert except for Soul Breaker.

### 2026-10-03 — `balance-v11 gear-db map-grid slots skill-ledger pet-nerf class-return quest-live`
* **What changed for the player:**
  * **The head no longer wobbles off the body.** It was never the numbers, it was the *rule*:
    anchors were taken from the topmost silhouette pixel, which on attack frames is a raised arm
    or a blade, so the head slid off the neck. Anchors now sit on the frame's own hair/neck stub
    (`stub_top + 3`), which reproduces the hand-placed shipped anchors **exactly** - 106/106
    stub frames, `max|dy| = 0`. The whole pack was rebuilt (19 bodies, 120/120 cells each).
  * **The map panel is a grid that scales.** Ten maps are now ten cards
    (`repeat(auto-fill,minmax(104px,1fr))`) instead of a cramped one-row strip, in a wider window;
    below them the ten fields, then a drop table that groups the field's gear by slot and lists
    each mob's rolls and card odds. Adding an eleventh map adds a card and nothing else.
  * **A real equipment database.** 40 sections (10 maps × 4 tiers), 96 weapon entries, and weapons
    matched to the classes that actually level there - merchants get axes/maces, mages staves,
    archers bows, thieves daggers then katars, and the five level 60+ mixed maps carry all seven
    types across their sections. Armour and accessory names are unique game-wide.
  * **Gear drops are relevant and outnumber cards.** Three gear rolls per mob (2.4/2.0/1.6 %)
    drawn from that field's own pool, against a 0.45 % card - about 13:1, where the old field
    rolled two gear items and three mobs' worth of cards.
  * **Clicking an equipment slot opens the bag, filtered.** Weapon shows only weapons your class
    can actually use, shield only if the class may hold one (otherwise the off-hand dagger/katar
    for the dual-wielders), legwear/headgear/accessory only their own slot - cards and ores never
    appear. Items are ranked by value with a "(+N better)" delta against what you are wearing.
  * **The skill-point overflow is fixed at the root.** Two bugs, both in the ledger: it pooled the
    job levels of *every class you had ever played* against one global skill table, and it
    subtracted a skill's *level* while the + button charged the *cumulative* cost (1+2+3+4+5 = 15
    to reach Lv5). Points now belong to the class line you are standing in, and the ledger counts
    what was actually charged. No line can max its own tree (it is 5 / 16 / 27 / 38 points short
    at Novice / 1st / 2nd / transcendent). Old saves that spent the phantom points read as
    "nothing spare" instead of negative.
  * **Going back to a class you have played is one click.** No Novice reset, no re-levelling:
    Base Lv, EXP, stat points, stats, job level, skills and worn gear all come back where you left
    them, from anywhere in the tree. The Novice gate and parent job-level gate still apply to
    classes you have **never** played.
  * **Pet training is a real grind.** `PTG` .8/.6/.4/.25/.12 → .4/.25/.15/.09/.05 and `GREAT`
    .1 → .05: **16 → 40 rolls and 334k → 802k Zeny per stat, ~2.4M for all three pieces**
    (Monte-Carlo over the real ladder).
  * **Quest rewards are live.** A quest's goal *and* its reward are re-solved from your current
    level on every level-up and every map move, so a quest picked up at Lv 10 and handed in at
    Lv 50 pays the Lv 50 amount, and the Claim button pays exactly the number the panel stated.
    Panel and claim are verified equal on the rendered HTML.
* **Files touched:** `index.html` (equipment catalogue, `gearPool/fieldOf`, `gearSlot`, the map
  panel, `equipChooser/equipIn/slotAccepts` + `eqPick`, `skLine/skEarned/skSpent/skCostOf/
  skpAvail`, `playedClass/classBlock`, `qScale/qRefresh/newQuest`, pet constants, `BUILD`),
  `assets/sprite_pack_data.js` (rebuilt pack), `tools/make_sprite_pack.py` (`HEAD_SEAT = 3`,
  stub anchor rule), `tools/tests/{gear_sim,ui_sim}.js` (new),
  `tools/tests/{skill_sim,class_change_sim,economy_sim}.js` (extended), `AGENTS.md`.
* **Art:** no sheets added or hand-edited. The four montages were not re-cut; the pack was
  regenerated from the existing `Sprite/*.png` with the new anchor rule (crop-only throughout).
* **Tests:** pack_sim OK (19 bodies, 120/120 cells), class_change_sim **15**, save_load_sim **9**,
  economy_sim **12**, stat_sim **7**, card_sim **13**, skill_sim **37**, gear_sim **18** (new),
  ui_sim **5** (new). gear_sim covers the catalogue, per-map relevance, the drop mix and the slot
  chooser filter; ui_sim renders every real panel and lints that each `data-a` action exists in
  `ACT`; skill_sim now runs the actual purchase loop and compares the purse with the ledger.
* **Branches / PR:** `arena/01a100d8-prontera-grind`.
* **Known limits / follow-ups:**
  * Item 8's quest *wording* is left alone: "Collect N equipment drops" counts equipment only, so
    a player farming cards sees the counter stall - it is honest but it reads like a bug. Next
    pass should rename it.
  * Gear tiers are decorative today: a section-3 item has better base `val` but nothing stops a
    section-0 drop from rolling Epic. Worth a look once drops are played with.
  * The five level 60+ maps share one high-tier weapon set each; adding maps is cheap (append to
    `MAPS` + `GEAR`, add a `MAP_LINES` row in `gear_sim.js`).
  * Kills/hour still needs a real playtest before `EXPK` is retuned - see the v9 entry.

### 2026-10-03 — `ui-v12 map-tab-wide`
* **What changed for the player:**
  * **The map tab is now a wide, horizontal panel.** The ten maps are a single compact card strip
    at the top (previously three-line cards that wrapped into several rows and pushed everything
    else down), and a second band shows the picked map's ten fields in **one row** with the Travel
    button on the same line.
  * **The fields are visible the moment you click a map.** The field band sits directly under the
    map cards and is **pinned** while the rest of the panel scrolls, so you never scroll down to
    find the level you want, and you never lose sight of it while reading the drop tables.
  * The drop information is now three side-by-side cards on a wide window - gear by slot,
    monsters (rolls + card odds), and boss + pet odds - instead of one long column.
  * Pointed out on request: the old full-width sticky "Travel" bar ate a lot of vertical space and
    is gone; travel now lives in the field band's header line.
* **Files touched:** `index.html` (map panel markup, `.mapband/.mapband.fields/.mapcols` CSS, the
  map window's width, `BUILD`), `tools/tests/ui_sim.js` (one new layout test), `AGENTS.md`.
* **Art:** none. No sheets or images added or edited.
* **Tests:** pack_sim OK, class_change_sim 15, save_load_sim 9, economy_sim 12, stat_sim 7,
  card_sim 13, skill_sim 37, gear_sim 18, ui_sim **6** (was 5). The new ui_sim case pins the
  panel order (cards → field band → tables), that the field band holds all ten levels and the
  travel button, that ten 52px fields fit a ~900px window in one row, and that the field band is
  the sticky one.
* **Branches / PR:** `arena/01a100d8-prontera-grind`, pull request #4.
* **Known limits / follow-ups:**
  * **The Payon map redesign is NOT in this entry.** The owner attached a map kit
    (`ro-map-engine.js`, `ro-map-data.json`, `ro-spritesheet.png` + `.json`, and an `index.html`
    showing it working) but **nothing landed in the sandbox** - `/home/user/uploads/` does not
    exist and a whole-disk search found no `ro-*` file. Asked the owner to re-attach. When it
    arrives: the kit is tiles + separated props (two big trees, bamboo, small tree, bush, cliff,
    pagoda, deep/shallow water, path, wooden wall), which is exactly the "mix and match per map"
    shape wanted - wire it into the arena for Payon first, then give every map its own tileset
    combination.
  * The field band wraps to two rows below a ~900px window; the tables stack below 900px too.
    Both are CSS media queries on the *viewport*, not the window, so a squeezed map window next to
    two other tabs will stack a little earlier than the numbers suggest. Harmless, but if the
    owner wants a true one-row field strip at any window size it needs a container query or JS.

### 2026-10-03 — `ui-v13 per-map-scenery`

* **What changed for the player:**
  * **Each map now looks like its own place.** The scenery is driven by one data row per map
    (`TH`), and every map scatters a *different* prop mix - Payon is the dense forest (conifer +
    bamboo + bushes + boulders), Comodo a boulder-ringed lagoon, Louyang a bamboo river valley,
    Niflheim a sparse frozen waste, Abyss lava. Nine maps, nine distinct signatures.
  * **Water is its own layer and can be mixed in anywhere.** Six maps carry standing water in
    their own colour: Izlude's harbour pond, Geffen's rune pond, Morroc's green oasis, Payon's
    pond, Comodo's wide lagoon, Louyang's river, Amatsu's shrine pond, Niflheim's frozen lake,
    Abyss's lava pools. Ground and water are separate, so "swap the water" is a one-line change.
  * **Three new loose props** (bamboo cluster, bush, boulder) join the tree/slab set - the
    trees-versus-water split the attached map kit was built around.
  * Nothing was moved into the player's running lane: pools and props all sit outside `|x| = BX_`.
* **Files touched:** `index.html` (the `TH` table + `water()` + `landmark()` + `buildDeco()`),
  `tools/tests/scene_sim.js` (**new**, 8 tests), `AGENTS.md` (the per-map scenery rule),
  `BUILD` -> `ui-v13 per-map-scenery`.
* **Art:** none drawn. No sheet, PNG or sprite touched - the new props are built from the same
  primitives as the old ones.
* **Tests:** pack_sim OK, class_change_sim 15, save_load_sim 9, economy_sim 12, stat_sim 7,
  card_sim 13, skill_sim 37, gear_sim 18, **scene_sim 8 (new)**, ui_sim 6. `scene_sim.js` runs the
  real `water()/landmark()/buildDeco()` against a faithful stubbed THREE for all nine maps.
* **Branches / PR:** `arena/01a100d8-prontera-grind`, pull request #4.
* **Known limits / follow-ups:**
  * **Still waiting on the attached map kit** (`ro-map-engine.js`, `ro-map-data.json`,
    `ro-spritesheet.png` + `.json`, the demo `index.html`): nothing landed in the sandbox, so the
    Payon redesign is still not started. This entry is the engine-side groundwork - the mix-and-
    match layer the kit plugs into.
  * Water pools are flat circles with a shore ring, not animated. Fine at the current camera
    distance; if the kit ships animated tiles, the `water()` layer is the one to replace.

### 2026-10-03 — `kit-v14 attached-map-designs`

* **What changed for the player:**
  * **Payon is the attached river crossing.** The owner's design dresses the field: forest turf and
    dirt, a **diagonal river** running through the play band with the **wooden bridge on the road**
    (mid-lane at z -7.9..-3.1), the design's 27 drawable props around it - ancient trees, a tall
    cluster, saplings, bright bushes, cliff crags, a river stone post - and the water animates
    between the kit's two frames.
  * **Morroc is the attached desert ruins**: sand, dark sand and ruin cobble terrain, cliff bands,
    and the design's 34 palms, cacti, ruin pillars, fallen columns, stumps, curbs and bones -
    cropped from the desert atlas the attachment's own generator paints at load.
  * Both designs are cropped art: nothing was drawn, traced, recoloured or substituted. Terrain,
    water and props all come from the attachments.
  * The arena itself is untouched - lane, spawn and monster band are exactly as they were. Props a
    design puts inside the running lane are moved to the lane edge, so nothing blocks the fight.
  * Maps without a design keep the v13 scenery, and if the kit cannot load every map falls back to
    it - the kit can never break the game.
* **Files added:** `assets/kit/ro-spritesheet.png` (227 KB, the owner's atlas),
  `assets/kit/ro-spritesheet.json`, `assets/kit/ro-map-payon.json`, `assets/kit/ro-map-morocc.json`,
  `assets/kit/morocc-atlas.js` (the attachment's generator, verbatim),
  `tools/tests/kit_sim.js` (**new**, 12 tests, including the loader's asset paths and the dead-atlas fallback).
* **Files touched:** `index.html` (the kit layer: loader, `kitPlan`, ground painter, water/deck/prop
  builders, `kitTick`, the `buildDeco` hook, the script tag, `BUILD`), `AGENTS.md`.
* **Art:** the atlas and the desert generator are the owner's, unedited. No sprite in `Sprite/` or
  in the pack was touched.
* **Tests:** pack OK, class_change 15, save_load 9, economy 12, stat 7, card 13, skill 37, gear 18,
  scene_sim 8, **kit_sim 12 (new)**, ui_sim 6.
* **Branches / PR:** `arena/01a100d8-prontera-grind`, pull request #4.
* **Known limits / follow-ups:**
  * **The atlas is missing a billboard the Payon design asks for.** `ro-map-payon.json` places
    `rock_boulder_mossy` 3 times, but `ro-spritesheet.json` carries only 7 sprites and that is not
    one of them. Those 3 placements are skipped and logged; they need either the missing crop in the
    sheet or the design switching to `rock_cliff_crag`. **Do not draw a replacement.**
  * The designs' cell **heights** are loaded but not used: the field stays flat so movement, mobs
    and the arena bounds are unchanged. Lifting the cliffs (vertex displacement outside the lane)
    is the obvious next step if the owner wants relief.
  * Heights/props aside, the other seven maps still use the v13 scenery. The kit's tiles and props
    are deliberately mix-and-match; dressing them from `KIT_MAP`-style specs is the next data-only
    step.
  * The 2.5D engine itself (`ro-map-engine.js`) is **not** part of the game - its camera, path
    finding and character are a separate mini-game. What was ported is the art and the level data.

### 2026-10-03 — `kit-v15 ro-payon-forest`

* **What changed for the player:**
  * **Every prop is now RO-sized.** The kit ships its own character frame (80px) and the hero here
    stands 2.9 units, so one atlas pixel is 0.036 units. Trees went from player-height to **3.5-4x
    the player**, saplings to player height, bushes to knee height, crags to boulder size, palms to
    ~2.7-4x, cacti and ruins below the player. (v14's single 0.0085 factor made the forest look
    like shrubbery - the owner spotted it immediately.)
  * **Payon was rebuilt to look like RO's Payon Forest.** The attached grid was a 48x32 lake with a
    diagonal river and it read nothing like Payon, so the field is now the RO recipe out of the same
    kit art: a wide wandering **dirt road** up the middle, a **creek across it with a plank bridge
    on the road**, dense **tree lines towering over the player on both banks** with saplings and
    bushes under them, stone posts at the crossing, and a **rocky mountain edge** (Payon Forest is a
    mountainous forest). The creek sits in front of the spawn and clear of the monster band, so you
    cross the water on the bridge to reach the mobs.
  * Morroc keeps its attached desert design - only its prop sizes changed.
* **Files touched:** `index.html` (the `payonPlan()` layout, `KIT_PK`/`KIT_PS` scale table,
  `kitPropScale`, the map table, ground painter cell coords, shared prop textures, `BUILD`),
  `tools/tests/kit_sim.js` (rewritten around the two fields and the scale table, 15 tests),
  `AGENTS.md` (the RO Payon notes + the scale rule).
* **Art:** unchanged - the same crops. No tile, tree or rock was drawn, traced or recoloured, and
  the reference screenshots used for the research were **deleted, not committed**.
* **Tests:** pack OK, class_change 15, save_load 9, economy 12, stat 7, card 13, skill 37, gear 18,
  scene_sim 8, **kit_sim 15**, ui_sim 6.
* **Branches / PR:** `arena/01a100d8-prontera-grind`, pull request #4.
* **Known limits / follow-ups:**
  * **No bamboo.** The kit has no bamboo billboard, and Payon Forest is famous for its bamboo
    groves. A crop from the owner's sheet is the only way to add them.
  * The kit's atlas still lacks `rock_boulder_mossy` (the attached payon design asked for it; the
    new field does not use it).
  * The creek is wadeable - no collision, no slowdown. The bridge is the intended crossing.
  * Payon's ground is flat (the design heights are still unused); the mountain edge is rocky
  texture, not raised terrain.

### 2026-10-03 — `pacing-v16 fast-early map-drops ore-buff`
* **What changed for the player:**
  * **Levelling is now fast at the bottom and a grind only at the top** - the owner's three
    anchors, solved into the curve with `tools/tune_pacing.js` (the game's own economy model,
    ~800 kills/hour):
    | milestone | gate | model time |
    |---|---|---|
    | 1st job change | Novice Job 10 / Base 10 | **10 min** |
    | 2nd job change | 1st-job Job 40 / Base 49 | **~1.9 h** |
    | transcendent line | 2nd-job Job 50 / Base 99 | **~45 h (~2 days)** |
    `needAt(L)` is now three continuous power segments (fast ≤50, steepening 50-99, long
    100-150 endgame; Lv150 total ≈ 269 h at the model rate - an outcome, not an anchor).
    **Job bars mirror the base curve** (`JOFF=[0,9,49,98]`): each job level costs the job exp
    its mirrored base level pays out, so both bars fill together and the job changes land on
    the anchors by construction. Quest EXP fractions were scaled to 1/120 / 1/150 / 1/72 so
    quests can never carry more than ~40% of a level (they supply ~35% overall); stat points,
    Zeny and drop odds per kill are untouched. In real play the first job change lands closer
    to 10-15 min because the Prontera field-clear climb (~135 kills) is the floor.
  * **The map tab no longer changes size when you switch maps, and the bulky "Gear that drops
    here" card is gone** (owner: too huge, wasted space). Every drop is now listed on the
    monster that drops it - one line per item, icon + name left, **% right** - and the boss
    lists its whole pool as compact chips at 1.2% each. Two fixed-shape cards (Monsters /
    Boss & pets) plus a reserved scrollbar gutter keep the panel stable across maps and fields.
  * **Oridecon and Elunium drop 5x-12.5x more often on Level 10 fields: 2% per ore per
    monster, 5% per boss** (was a flat 0.4%). Refine panel and map panel text show the new rates.
* **Files touched:** `index.html` (economy block: `QXP`, `needAt` curve + `NA*` constants,
  `JOFF`/`pwOf`/`epkOf`/`qrOf`, tier-aware `jneed`; `fieldOf` + `kill()` ore rates; the map
  panel + its CSS; refine texts; `BUILD`), `tools/tests/economy_sim.js` (rewritten around the
  v16 anchors: per-level self-consistent model, milestone + job-gate assertions, new pins),
  `tools/tests/ui_sim.js` (two-card map panel, drop lines with %, ore text, stable-gutter pin),
  `tools/tests/gear_sim.js` (ore-rate pins), `tools/tune_pacing.js` (**new** - the pacing
  solver/verifier), `AGENTS.md`.
* **Art:** none. No sheets added or rebuilt; `tools/montage.py` not run.
* **Tests:** pack_sim OK (19 bodies), class_change 15, save_load 9, **economy 18** (was 12),
  stat 7, card 13, skill 37, gear 18, scene 8, kit 15, **ui 6** - all green. economy_sim now
  pins the three time anchors, the job gates (base 10/49/99), the quest-share ceiling
  (no level >40% quests), the curve's monotonicity and its anchor values; gear_sim pins
  oreCh 0.02/0.05.
* **Branches / PR:** `arena/01a10154-prontera-grind`.
* **Known limits / follow-ups:**
  * **The anchors are calibrated to the 800 kills/hour model**, which predates multi-cast
    skills and ignores boss-fight seconds. Playtest, read the real kills/hour, then re-run
    `node tools/tune_pacing.js <KPH>` rather than hand-nudging - see *Balance*.
  * The 100-150 endgame came out at ~220 h beyond the transcendent change (a monotone curve
    cannot be cheaper at 100 than at 99). If the owner wants it shorter, the lever is `NE3`
    (the third segment's exponent), re-solved by tune_pacing.
  * Early levels 1-9 are cheaper than a handful of kills each; field-clear cadence (15 kills
    per Prontera field) is what actually sets the first-job floor.
  * Gear tiers are still decorative (a section-0 drop can roll Epic) - unchanged from v11.

### 2026-10-03 — `pacing-v17 short-tail class-collection`
* **What changed for the player:**
  * **The 100-150 tail is now ~3 days instead of ~7** (owner: "level 100-150 should maybe
    take 3 days"). The three existing anchors are untouched - 10 min to 1st job, ~2 h to
    2nd job, ~2 days (48 h) to the transcendent line at Base 99. Because a monotone curve
    can never make level 100 cheaper than the 48 h anchor forces level 99 to be, the tail
    uses a one-time **rebirth drop**: at Base 100 the requirement falls ~6x
    (needAt(99)=659,647 → needAt(100)=111,490) and ramps back up with a gentler exponent.
    `needAt(L)` is now: `⌊5.07·L^1.54⌋` ≤50, `⌊2096·(L/50)^8.42⌋` 50-99,
    `⌊111490·(L/100)^2.7⌋` >99. Model outcome: tail = **72.0 h (3 days)**, T150 ≈ 123 h
    total, quest share ~17% overall (the tail is kill-heavy) with the per-level ceiling
    still ≤40% and QXP untouched. Solved + verified with `tools/tune_pacing.js`
    (`node tools/tune_pacing.js 5.07,1.54,8.42,111490`).
  * **Class collection bonus: +2% damage per class played** (owner: wants players to change
    and play all classes, "maybe add a 2% damage bonus for each class they played before").
    `playedClasses()` counts the class being played plus every record in `S.base` (derived
    at runtime - old saves get credit for free, no migration); `collDmg() = 2 × count` is a
    multiplier inside `atk()`, capped at 19 classes × 2% = +38%. The job gates pace the
    mission: every 1st job to job 40 and every 2nd job to job 50 before its transcendent
    class can be entered. Shown on the character panel and the class tree:
    `🏆 Class collection: X/19 played · +Y% damage`.
* **Files touched:** `index.html` (economy block: `NA1/NE1/N50/NE2/N100/NE3` constants +
  `needAt` rebirth branch, pacing comment; `atk()` collection multiplier; `playedClasses`/
  `collDmg` helpers; collection lines in the character + class-tree panels; `BUILD`),
  `tools/tune_pacing.js` (**rewritten**: rebirth-tail family `⌊n100·(L/100)^NE3⌋`, NE3=2.7
  fixed, n100 bisected for `TAIL = T150−T100 = 72 h`, verify mode `cA,aA,aB,n100`, shipping
  QXP as base to kill the two-phase drift), `tools/tests/economy_sim.js` (phased
  monotonicity + rebirth-drop assertions, new curve pins, boss-quest-xp@150 = 4627, tail
  anchor 60-85 h, quest-share floor relaxed to 12%), `tools/tests/class_change_sim.js`
  (+4 collection tests: counting, dedupe, cap at 19, atk wiring), `tools/tests/ui_sim.js`
  (collection line on both panels; picks the two new helpers before `atk`), `AGENTS.md`.
* **Art:** none. No sheets added or rebuilt; `tools/montage.py` not run.
* **Tests:** pack_sim OK (19 bodies), **class_change 19** (was 15), save_load 9,
  **economy 18** (rebirth anchors: T10 10.1 min / T50 1.99 h / T99 48.1 h / tail 72.0 h),
  stat 7, card 13, skill 37, gear 18, scene 8, kit 15, **ui 7** (was 6) - all green.
* **Branches / PR:** `arena/01a10154-prontera-grind` (updates PR #5).
* **Known limits / follow-ups:**
  * The rebirth drop reads as a soft reset at level 100; it is not surfaced to the player
    with fanfare - the next level just feels faster. If it confuses anyone, a one-line
    note on the level-up toast at 100 would explain it.
  * The +38% collection cap is generous next to class ATK multipliers; if a future balance
    pass tightens damage, `collDmg()` is the single knob.

### 2026-10-03 — `pacing-v17 short-tail collection-nerf`
* **What changed for the player:**
  * **The class-collection bonus was too strong ("this is break the game") - nerfed on the
    same day.** It is now **+1% damage per TRANSCENDENT (3rd-job) class played, and only at
    Base Lv 100+** (was +2% per any of the 19 classes, always on). It is now a carrot for
    the rebirth grind instead of an early-game power spike: max +6% today, and both the
    count and the denominator are derived from the class data (`tier===3`), so **classes the
    owner adds later join the collection automatically** - nothing is hardcoded to 19.
    Panel lines now read `🏆 Class collection: X/Y transcendent classes · +Z% damage` and
    spell out `activates at Base Lv 100` while dormant.
* **Files touched:** `index.html` (`playedClasses` now counts tier-3 records only, new
  `t3Total()`, `collDmg()` gated at `S.lv>=100`; panel lines; `BUILD`),
  `tools/tests/class_change_sim.js` (5 collection tests rewritten: tier-3-only counting,
  the lv-100 gate, the data-driven cap, record growth through real `changeClass` calls,
  atk wiring pin), `tools/tests/ui_sim.js` (dormant note + 1/6 · +1% at lv 100), `AGENTS.md`.
* **Art:** none.
* **Tests:** pack_sim OK (19 bodies), **class_change 20** (was 19), save_load 9, economy 18,
  stat 7, card 13, skill 37, gear 18, scene 8, kit 15, ui 7 - all green.
* **Branches / PR:** `arena/01a10154-prontera-grind` (updates PR #5).
* **Known limits / follow-ups:**
  * The v17 entry above described the +2%/19-class version; it was shipped and nerfed
    within the same session. Only this nerf is live.

### 2026-10-03 — `kit-v18 all-ten-maps skin-purge`
* **What changed for the player:**
  * **All ten maps are now rebuilt from the attached map kit** (owner: the map-sprite agent
    finished its work - rebuild everything). Morocc keeps the attached design and Payon keeps
    the RO Forest recipe; the other eight arenas are new deterministic `fieldPlan` recipes
    out of the same kit crops (nothing drawn):
    | map | the look |
    |---|---|
    | Prontera | sunny meadow, dirt avenue, tree lines, stone posts |
    | Izlude | harbour: sea strip + bank, off-lane pier, beach palms |
    | Geffen | dark forest, deep cliff ring, standing ruin pillars/stumps |
    | Comodo | beach: sand ground, sea strip, palm + cactus scatter |
    | Louyang | lush forest, winding road, dense trees, shrine posts |
    | Amatsu | meadow with a stream crossed by a plank bridge on the road |
    | Niflheim | barren waste: dirt ground, crags, bones, ruin stumps |
    | Abyss | cave rock, dark lake at the far end, crags and stone posts |
    Recipes may borrow props across atlases (each prop carries its own `src`), and morocc-
    ground seas animate with the payon sheet's water frames. Water stays scenery: strips never
    reach the monster spawn band unless a deck crosses them; props never enter the lane; every
    plan is seeded so respawns never reshuffle a map.
  * **The old class skins are gone** (owner: "i dont need them delete those to avoid
    confusion" - the green thief-era layered art). Deleted: `assets/sprites_data.js`
    (layered hero atlases), `assets/thief_sprites_data.js` (THIEF_PACK), all 24
    `hero_*/herobody_*/herohead_*` sheets and the three `_preview_*` images,
    `tools/build_atlas.py`, `tools/import_sheet.py`, `tools/verify_sprites.js`. In the game:
    the `sprites_data.js` script tag, `loadAtlas` + its queue, the layered `herobody:/herohead:`
    and legacy `hero:` paths (`HERO_HEAD_FOR`, `heroBodyKey/heroAtlasKey/heroHeadKey`,
    `isCustomHero`, `heroKindAvail`, `CUSTOM_HEROES`), and every `window.THIEF_PACK` fallback.
    The hero is now: class pack, else the drawn hero - no third thing. `make_sprite_pack.py`
    re-seeds from `sprite_pack_data.js` itself (heads/poses/unchanged bodies), and the
    bootstrap dependency check follows.
* **Files touched:** `index.html` (kit: `fieldPlan`, `KIT_MAP` x10, cross-atlas prop check,
  water-frame borrow; hero/mob paths simplified; `BUILD`), `tools/tests/kit_sim.js`
  (15 → 20 tests: ten-map plans, recipe pins, cross-atlas builds), `tools/make_sprite_pack.py`,
  `UPDATE-BOOTSTRAP.py`, `AGENTS.md`.
* **Art:** none added. 29 files deleted (see above); `tools/montage.py` not run.
* **Tests:** pack_sim OK (19 bodies, unaffected by the purge), **kit 20** (was 15),
  class_change 20, save_load 9, economy 18, stat 7, card 13, skill 37, gear 18, scene 8, ui 7
  - all green.
* **Branches / PR:** `arena/01a10154-prontera-grind` (updates PR #5).
* **Known limits / follow-ups:**
  * `_shot.html` / `_login.html` at the repo root are pre-pack legacy pages that referenced
    the deleted atlases; they are kept as history but no longer run.
  * The eight recipes are first passes - if a map's identity reads wrong in play, its recipe
    in `KIT_MAP` is the single place to tune (ground, water, trees, scatter).

<!-- template — copy this block, fill it in, paste it at the bottom of the log -->

### YYYY-MM-DD — `<build tag>`
* **What changed for the player:**
* **Files touched:**
* **Art:** which sheets were added/removed/rebuilt, and whether `tools/montage.py` was used.
* **Tests:** the three summary lines, plus any new test and what it covers.
* **Branches / PR:** branch name and the pull-request link the user was given.
* **Known limits / follow-ups:**

### 2026-10-03 — `ui-v19 divine-pride sprites`
* **What changed for the player:**
  * The map window now stays inside the screen at narrow widths. Map and boss-field buttons remain selectable; the windows stack on small screens, and map/drop grids shrink instead of forcing horizontal overflow.
  * Regular monsters and bosses now use one-facing Ragnarok sprites from Divine Pride across all ten maps. Game-themed names are matched to the closest named RO monster.
  * During attacks, characters show a Divine Pride weapon-family item icon for their equipped weapon type. This covers all seven weapon families used by the 19 classes.
* **Files touched:** `index.html` (responsive map panels, sprite mapping/loaders, attack weapon overlay, `BUILD`), `tools/tests/ui_sim.js` (responsive layout + boss field checks), `tools/tests/sprite_sim.js` (new mapping, weapon-family and fallback checks), `AGENTS.md`.
* **Art:** no local sprite sheets were added, removed or rebuilt; `tools/montage.py` was not used. Divine Pride PNGs are requested at runtime; the game retains its original procedural mob art and weapon glyphs as fallbacks.
* **Tests:** `pack_sim` (19 class bodies), `class_change` 20, `save_load` 9; `economy` 18, `stat` 7, `card` 13, `skill` 37, `gear` 18; `scene` 8, `kit` 20, `ui` 8, `sprite` 4 - all green. The new sprite suite checks every regular mob and boss on all ten maps plus all weapon families; the UI suite checks narrow-screen layout and the Abyss boss field.
* **Branches / PR:** `arena/01a101dd-prontera-grind`; no PR opened.
* **Known limits / follow-ups:**
  * Divine Pride is an external runtime source. If its images are unavailable, the procedural mob art and existing weapon glyph remain visible.
  * Game-specific monster names use the closest RO monster ID. Weapon icons represent each weapon family rather than each custom item name or an animated held weapon model.

### 2026-10-03 — `ui-v20 combat hair preview`
* **What changed for the player:**
  * Moving official mob sprites now bounce as they travel; Poring-like blobs get a clear hop and squash/stretch, and other moving mobs get a lighter bob. Both the GPU and browser-image paths animate; the procedural fallback remains intact.
  * The character's weapon icon stays at the hand while idle, walking and attacking, and follows the corresponding 8-way body pose. Archer, Hunter and Sniper use a bow and fire the existing arrow projectile; Mage, Wizard and High Wizard swing a staff without a generic bolt; Assassin and Assassin Cross show one katar, never a dagger. Bow and staff attacks do not get the generic melee slash; no new skill effects were added.
  * Settings now shows a live front-view character preview using the selected class, gender and hairstyle. The 73 skill entries have unique pictograms, color accents, type labels and clearer level/auto-cast states.
  * The head/body placement was rechecked in packed male and female style-0 samples across directions and idle/walk/attack poses. The sampled heads remained seated, so no art or head anchors were shifted. This is a visual spot-check, not every hair style and frame. The RO compositor notes also describe per-motion body/head attach points: https://github.com/kidmortal/ragnarok-sprite-generator/blob/main/docs/how-it-works.md
* **Files touched:** `index.html` (mob motion, class weapon selection/pose mounting, Settings preview, skill cards, `BUILD`), `tools/tests/pack_sim.js` (packed hair-preview smoke check), `tools/tests/sprite_sim.js` (weapon anchors, class weapon rules and hopping), `tools/tests/ui_sim.js` (skill icons and Settings preview), `AGENTS.md`.
* **Art:** no local sprite sheets or packed atlases were added, removed or rebuilt; `tools/montage.py` was not used. Weapon-family icons still load from Divine Pride, with the existing glyph fallback.
* **Tests:** `pack_sim` (19 class atlases + selected female hairstyle preview), `class_change` 20, `save_load` 9; `economy` 18, `stat` 7, `card` 13, `skill` 37, `gear` 18; `scene` 8, `kit` 20, `ui` 10, `sprite` 7 - all green. The inline game JavaScript also passes `node --check`.
* **Branches / PR:** `arena/01a101dd-prontera-grind`; no PR opened.
* **Known limits / follow-ups:**
  * Divine Pride weapon icons are external runtime images; if unavailable, the class still has its existing local/glyph fallback. Icons represent weapon families, not an animated per-item 3D sprite.
  * The head audit covered representative styles/poses only. If a particular hair, gender, class or frame still looks off, it needs its own visual review before changing the crop-only anchors.

### 2026-10-04 — `ui-v21 skill visuals & sprite alignment`
* **What changed for the player:**
  * Active attacks, First Aid and temporary tradeoff buffs now create short-lived battlefield effects: skill-specific cues for falling meteors, ice, lightning, holy marks, arrows, katar slashes, poison, impacts and buffs. The 73 skill cards remain icons/descriptions; combat now gets a separate rendered event.
  * Weapon-family icons are positioned by a family grip anchor, so the icon's handhold—not its square image center—is held at the existing pose hand through swing rotation and scale. The Archer bow/arrow, Mage staff and single Assassin katar rules are unchanged.
  * Re-audited packed heads across all 19 male class bodies in every idle/walk/attack cell and eight directions, plus the selected female hairstyles/directions. The displayed heads follow the existing per-cell measured anchors; no global shift or new unmeasured anchor was justified.
* **Files touched:** `index.html` (skill-effect recipes/animation/disposal, weapon grip placement, `BUILD`), `tools/tests/skill_sim.js` (coverage and renderer lifecycle smoke tests for every mapped effect), `tools/tests/sprite_sim.js` (weapon-grip math regression), `tools/tests/pack_sim.js` (per-cell head-compositor anchor checks), `AGENTS.md`.
* **Art:** no sprite sheets were drawn, recoloured, replaced or rebuilt; `tools/montage.py` was not used. Skill effects are Three.js geometry, not replacement sprite art; weapon and mob art still load from Divine Pride with the existing fallback paths.
* **Tests:** `pack_sim` (19 class bodies; all 120 anchored head placements/body), `class_change` 20, `save_load` 9; `economy` 18, `stat` 7, `card` 13, `skill` 40, `gear` 18; `scene` 8, `kit` 20, `ui` 10, `sprite` 8 - all green. Inline game JavaScript passes `node --check`; `git diff --check` is clean.
* **Branches / PR:** `arena/01a101dd-prontera-grind`; pushed after verification, no PR opened.
* **Known limits / follow-ups:**
  * These are skill-specific, in-battle RO-style geometry cues, not playback of the original layered `.str` effects. The researched effect assets require per-layer textures and blend modes; the current renderer intentionally does not flatten them into a skill icon.
  * Divine Pride weapon icons are external runtime images. Grip positioning is regression-tested mathematically, but the exact pixel hotspot of each remote family icon could not be independently inspected from this sandbox; use the live preview to judge any remaining family-specific offset.
  * Camera, head/body anchors and mob-hop behavior were left unchanged.

### 2026-10-04 — `balance-v22 faster-exp starter-stages compact-map`
* **What changed for the player:**
  * Normal accounts earn **70× Base/Job and quest EXP below Base Lv 100**, then **70/3× (about 23.33×) at Lv 100–150**. The owner explicitly chose 70% of the default 100× GM rate, not a 70% increase, and chose one-third EXP at 100+, not three times the total levelling time. GM keeps its own configured rate. Zeny, gear/drop odds and level requirements are unchanged. Saved quests refresh their displayed rewards on login without losing progress. Earlier time targets in this document are superseded; the old 1× economy model remains a baseline regression, not a current playtime estimate.
  * Map window desktop width is **450px instead of a growing 900px panel**. Compact wrapping map/stage buttons, stacked drop cards, and keyboard-operable stage buttons fit the narrower layout. Map levels are called **Stage 1–10** in map selection, travel, the arena name, unlock messages and refining text; character/job levels remain levels. Press **M** to see it. Locked-stage drop previews still work; travel stays gated.
  * Advancing to a previously unplayed second/transcendent job **keeps allocated stats and unspent points**. Leaving Novice for a new class still refunds stats; previously played classes still restore their saved builds. The existing return-to-Novice hard restart (Base 25 cap and refunded stats) remains unchanged.
  * Every first job now has an active AoE available to buy for one skill point: **Magnum Break, Napalm Beat, Arrow Shower, Envenom, Signum Crucis, Cart Revolution**. Mage's Napalm Beat and Thief's Envenom gained area damage; the others already had it. This intentionally supersedes the old “no Thief AoE” rule. Novice still has only First Aid, and no new effect types or extra skills were added.
  * Prontera, Izlude, Geffen, Morroc and Payon **stages 1–5** use gentle combat values: HP capped at `floor(12*(6+5*(stage-1))^1.3)` and never above their old HP, ATK 6/9/12/15/18, and 2–3 enemies rather than stage 5 jumping to 3–8. Prontera Stage 1 retains one 42-HP enemy for new Novices. These are beginner farming routes (Base 10–60); gear strength/reward power remains map-specific. Stages 6–10, bosses and later maps retain their old formulas.
* **Files touched:** `index.html`, `tools/tests/{class_change,economy,skill,ui}_sim.js`, new `tools/tests/starter_sim.js`, `AGENTS.md`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not used.
* **Tests:** pack (19 bodies), class change **22**, save/load **9**; economy **21**, stats **7**, cards **13**, skills **41**, gear **18**; scene **8**, kit **20**, UI **10**, sprites **8**, starter **4** — all green. Inline JavaScript syntax and `git diff --check` pass.
  * New tests execute the actual kill-reward block at both EXP bands (including GM), refresh old quests, preserve all six stat allocations through all 12 promotions, and execute each first-job AoE against nearby/distant targets.
  * Starter tests execute the real spawn/drop data for all 25 early stages, preserve later-stage/boss formulas, and check all six first jobs without gear/skills at Base 10/20/30/40/50 for stages 1/2/3/4/5. Seeded, conservative pack-damage budgets assume low outgoing damage, misses and maximum incoming damage, with no dodge, regeneration or level-up healing; all survive. This is not a real-time movement playtest.
* **Branches / PR:** `arena/01a1029e-prontera-grind`; PR link recorded after publishing below.
* **Known limits / follow-ups:**
  * The selected EXP increase is deliberately large. No promise of exact hours: map unlock cadence, quests, overkill, gear income and job caps still affect pacing. Rewards use the character's Base Lv at award time; crossing 100 does not retroactively reprice already-earned EXP.
  * Preview server serves the new build (HTTP 200). Automated browser visual testing was blocked by unavailable Chromium downloads/system libraries; responsive layout is source/render tested, not screenshot-verified. Use the live preview to check the narrower map window and actual sustained farming.
  * Stats already refunded in an older build cannot be reconstructed automatically; spend those points once. Promotions from this build onward retain them.

### 2026-10-04 — `balance-v22 delivery`
* **What changed for the player:** no additional game changes; published the verified update for review/merge.
* **Files touched:** `AGENTS.md` only.
* **Art:** none; no montage rebuild.
* **Tests:** all 13 suites, inline JavaScript syntax and whitespace checks passed before the game push; this entry is documentation only.
* **Branches / PR:** `arena/01a1029e-prontera-grind` — https://github.com/KzeR7/Prontera-Grind/pull/7
* **Known limits / follow-ups:** merge the PR to deploy through the normal GitHub/Cloudflare route; live visual/farming review remains recommended.

### 2026-10-04 — `kit-v2-art map-sprite-brief-v2 deliverable`
* **What changed for the player:** nothing yet — this is the **art deliverable** for Map Sprite
  Brief v2 ("closer to real RO"), waiting in `Updates/map-sprites-v2/` for the implementing
  agent. The game still runs on the v1 kit until it is wired in. The owner found the v1 map
  sprites below standard and asked for higher-fidelity art researched against divine-pride.net.
* **What the deliverable is:** a new 2048×2048 atlas (v1 was 1280×512) with **25 terrain tiles
  (was 8) and 34 environment billboards (was 7)**, one painterly RO-style technique across ten
  per-map identities: Prontera cottage + big green trees, Izlude golden shore + pier posts,
  Geffen moody grass + gnarled trees + standing stones + wizard tower, Morocc full desert-ruin
  set, Payon forest mud + **bamboo groves** + the long-missing `rock_boulder_mossy`, Comodo
  golden beach palms, Louyang jade grass + paddy water + stone shrine + lantern, Amatsu petal
  grass + cherry tree + **torii gate + red arch bridge + red deck tile**, Niflheim purple-grey
  waste + dead tree + tombstone + ruined house, Abyss dark slate + limestone shore + **dark
  water frames** + stalagmite + crystals. Manifest is a **superset of every v1/morocc name**
  (drop-in), keeps the v1 character strip pixel-for-pixel (scale reference), and carries a
  `suggest` block: a complete tuned `KIT_PS` table + per-map recipe suggestions.
* **Files touched:** `Updates/map-sprites-v2/` (new: atlas, manifest, `README-IMPLEMENTATION.md`
  for the next agent, `RESEARCH.md` divine-pride notes, `preview.html`, `work/` pipeline +
  individual assets), `AGENTS.md`. **`index.html` untouched, no `BUILD` bump** — nothing is
  player-visible until implementation.
* **Art:** all original painted art (AI-generated to this brief, then processed: seamless-tiled,
  chroma-keyed, trimmed, measured anchors). divine-pride.net renders were style/palette
  **reference only**; nothing traced or ripped from the RO client. Variants derived from this
  kit's own art are documented in RESEARCH.md. Class sprites, `Sprite/`, the pack and
  `tools/montage.py` untouched.
* **Tests:** no game code changed, so the 13 suites are unaffected (verified the repo still has
  no `index.html` diff). The implementing agent must run the full battery after wiring
  (`kit_sim.js` pins will need moving — the README lists which ones, including the
  `rock_boulder_mossy` skipped-placement assertion that now inverts).
* **Branches / PR:** `arena/01a1047a-prontera-grind` — PR link recorded below after publishing.
* **Known limits / follow-ups:**
  * Implementation is deliberately left to the next agent: copy the two files over
    `assets/kit/`, update `KIT_PS`, apply the per-map recipe suggestions, optionally retire
    `morocc-atlas.js` (all its names are in the v2 manifest), move the kit_sim pins, bump
    `BUILD`. Full steps in `Updates/map-sprites-v2/README-IMPLEMENTATION.md`.
  * The Abyss dark-water pair needs one small code change (recipe-selectable water frames);
    everything else is data.
  * `standing_stone` was generated as a three-menhir row; the packed sprite is the best single
    stone (the full row sits in `work/props/` source history if ever wanted).
### 2026-10-04 — `balance-v23 curve pets sprite-sizes`
* **What changed for the player:**
  * The tuned EXP curve puts Base Lv 1–10 at about 7 minutes, Base 50 at about 2 hours, and Base 99 at about 48 hours in the canonical 800-kills/hour model. Base 100–150 is a much harder 336-hour (~14-day) climb after the rebirth reset; a full 1–150 run models to ~387 hours.
  * Equipment odds are doubled: regular mobs roll 4.8%/4.0%/3.2% gear entries, and each boss-pool item rolls at 2.4%. Card chances remain 0.45% on regular mobs and 0.08% on bosses. The extracted live kill loop is regression-tested; it passes boss gear through the boss generator and can create actual equipment.
  * Pet portraits now use Divine Pride monster PNGs. Claw, Collar and Charm each show their current upgrade level and success/double-upgrade chances. The six equally weighted gacha skills are two player buffs (ATK and MATK), two AoE attacks and two single-target attacks; magical player skills now use MATK.
  * The size labels for all 85 unique mob/boss sprite IDs were checked against Divine Pride; the visuals use Small/Medium/Large factors of .62/.92/1.28 relative to the player. Save loading repairs missing/out-of-range pet upgrades and invalid skill IDs.
* **Files touched:** `index.html` (`BUILD` v23), `tools/tune_pacing.js`, `tools/tests/{economy,gear,save_load,skill,sprite,ui}_sim.js`, `AGENTS.md`.
* **Art:** no local sprite sheets or packed atlases were changed. Monster and pet PNGs remain externally hosted by Divine Pride with the existing procedural fallbacks.
* **Tests:** all 13 suites pass: pack (19 class bodies + Settings preview), class change **22**, save/load **10**, economy **21**, stats **7**, cards **13**, skills **48**, gear **20**, scene **8**, kit **20**, UI **11**, sprites **10**, starter **4**. Inline game JavaScript passes `node --check`; `git diff --check` is clean.
  * New checks execute the live boss equipment-drop loop, pet skill gacha and combat effects, pet upgrade success/double/failure, MATK damage and buffs, save normalization, pet release cleanup, UI upgrade labels, and every audited sprite-size class.
* **Branches / PR:** `arena/01a10466-prontera-grind`; the PR link is recorded in the delivery entry immediately below.
* **Known limits / follow-ups:** EXP hours are model estimates, not a real-time playtest; the model assumes 800 kills/hour. Divine Pride sprites require network access. The live preview is available for visual review and actual pacing checks.

### 2026-10-04 — `balance-v23 delivery`
* **What changed for the player:** no additional game changes; published the verified v23 update for review and merge.
* **Files touched:** `AGENTS.md` only.
* **Art:** none; no local sprite sheets or atlases changed.
* **Tests:** documentation-only follow-up; results are listed in the v23 update entry immediately above.
* **Branches / PR:** `arena/01a10466-prontera-grind` — https://github.com/KzeR7/Prontera-Grind/pull/9
* **Known limits / follow-ups:** merge the PR to deploy; run an actual pacing/visual playtest using the preview.

### 2026-10-04 — `balance-v24 faster upper curve`
* **What changed for the player:**
  * Retuned the curve to preserve about 7 minutes for Base 1–10 and about 2 hours for Base 1–50, while reducing Base 50–99 to about 5 hours. Base 100–150 now models to about 48 hours (2 days) after the roughly 3.9x requirement reset at 100.
  * Quest EXP was rescaled with the curve so quests remain useful but secondary: about 23% of modeled run EXP overall, with the highest single-level share around 40%.
* **Files touched:** `index.html` (`BUILD` v24, EXP curve and quest scaling), `tools/tune_pacing.js`, `tools/tests/economy_sim.js`, `AGENTS.md`.
* **Art:** none; no sprite sheets or atlases changed.
* **Tests:** all 13 suites pass; inline game JavaScript syntax and `git diff --check` pass. The economy regression now separately asserts the 5-hour Base 50–99 interval and 48-hour Base 100–150 tail.
* **Branches / PR:** `arena/01a10466-prontera-grind`; updated existing PR #9: https://github.com/KzeR7/Prontera-Grind/pull/9
* **Known limits / follow-ups:** the times are still model estimates at 800 kills/hour, not measured player playtime; playtest the faster upper curve before merging.

### 2026-10-04 — `ui-v25 HUD rates & skill auto-cast`
* **What changed for the player:**
  * The HUD now displays Kills /Min instead of the lifetime kill count. Hover the Zeny total to see earned Zeny per minute. Both are rolling recent rates measured in real time during the current login; the Zeny rate counts gains, not purchases.
  * Each learned active skill now has a simple Auto cast checkbox on its card. New skills remain enabled by default; uncheck one to pause it and check it again to resume.
* **Files touched:** `index.html` (`BUILD` v25, HUD and Skills panel), `tools/tests/ui_sim.js`, `tools/tests/skill_sim.js`, `AGENTS.md`.
* **Art:** none; no sprite sheets or atlases changed.
* **Tests:** all 13 suites pass; the UI regression tests rolling rates, the hover title and checkbox defaults, and the skill regression pins default auto-cast behavior. Inline game JavaScript syntax and `git diff --check` pass.
* **Branches / PR:** `arena/01a10466-prontera-grind`; updates existing PR #9: https://github.com/KzeR7/Prontera-Grind/pull/9
* **Known limits / follow-ups:** the HUD rates reset at login or after starting a new adventure; the displayed Zeny rate is gross positive earnings over the recent window, not net profit after spending.

### 2026-10-04 — `tool-v26 sprite-picker pose chooser` (no game change, no BUILD bump)
* **What changed for the player:** nothing yet — this is the workbook the owner asked for
  before the sprite redo, plus the RO research behind it. The game and the pack are untouched.
* **New: `tools/sprite_picker.html`** — open it from a preview server rooted at the repo
  (`python3 -m http.server 8000 --bind 0.0.0.0`, then `/tools/sprite_picker.html`).
  For each of the 19 classes it shows all 8 camera views (S, SW, W, NW, N, NE, E, SE) with
  idle / walk / attack slots; ticking a pose tile on the right fills the active slot (walk 8,
  attack 6, idle 1, tick order = frame order); the preview under each view is the real
  composite — the pose in its 96x96 cell, the chosen hair on that pose's **measured** head
  seat, then the weapon at the game's own pixel. "Suggest 24 slots" seeds every view from the
  sheet layout, "Copy my selection" hands the picks (and any weapon-grip corrections) back as
  JSON. Picks are kept in localStorage between visits.
* **New: `tools/make_sprite_picker.py`** — reads every sheet in `Sprite/`, segments the poses
  (montages through the matcher in `tools/montage.py`), measures each pose's head seat with
  the same stub rule the pack uses, and writes `tools/sprite_picker_data.js`.
* **New: `tools/sprite-attachment-notes.md`** — the RO research: the head is parented to the
  body *per frame* through stored attach points; weapons are unparented, aligned to the body
  origin, and hand-corrected per class; draw order is a per-direction layer priority (a
  weapon goes behind the body when the character faces away). Conclusion recorded there: the
  game already bakes head+body at runtime, so the fix is measured attach points (the weapon
  has none — `PACK_WEAPON_ADJUST` is one hard-coded offset per family for every class, pose
  and frame) and a direction-aware draw order, not baking the head art in.
* **Also recorded there:** the sheets are inconsistent — 15 are one row per direction with
  knocked-down/sitting poses mixed into row 0, four are montages; `normal_labels()` is a
  guess and that guess is where the wrong poses (and so the sliding heads) come in.
* **Files touched:** `tools/make_sprite_picker.py` (new), `tools/sprite_picker.html` (new),
  `tools/sprite_picker_data.js` (new, generated, 252 KB), `tools/sprite-attachment-notes.md`
  (new), `AGENTS.md` (this entry). Nothing in `index.html`, `assets/` or `Sprite/`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run (its
  matcher is imported read-only, to label montage poses).
* **Tests:** all 13 suites green on the untouched tree (pack 19 bodies; class change 22,
  save/load 10; economy 21, stat 7, card 13, skill 48, gear 20; scene 8, kit 20, UI 13,
  sprite 10, starter 4). The picker itself: inline JS passes `node --check`, and it boots
  under a DOM/canvas stub — 8 view cards, 111 tiles for Knight, auto-suggest 452/456 slots
  across all 19 classes, selection JSON parses.
* **Branches / PR:** `arena/01a1054b-prontera-grind`; pushed for the owner's review, no PR —
  the sprite work itself starts once the owner sends the ticked selection back.
* **Known limits / follow-ups:**
  * The previews are canvas drawings, not browser screenshots — there is no browser in this
    sandbox, so the owner's eyeball is the check.
  * Auto-labels are hints from the sheet layout; the owner overrules them by ticking.
  * Montage sheets only expose the poses the matcher could locate (Lord Knight 69 of ~112),
    so a few slots there may have to inherit the parent class or be matched by hand.
  * Once the picks arrive: rebuild the pack from them, measure the weapon grip per cell, add
    the direction-aware weapon layer, then re-run the suites and bump `BUILD`.

### 2026-10-04 — `ui-v26 attack-only weapon + simpler sprite picker`
* **What changed for the player:**
  * **The weapon now shows only while attacking.** Idle and walking are bare-handed — you asked
    for it. The weapon icon (the game's own Divine Pride item art, with its existing glyph
    fallback) still appears for the attack swing exactly as before.
* **What changed for the sprite work (no game change):** `tools/sprite_picker.html` was rebuilt
  simpler, after the first version was confusing to use.
  * **Three tabs — Idle / Walk / Attack — one animation at a time**, instead of 24 mixed slots.
  * **One card per camera view** (0 S, 1 SW, 2 W, 3 NW, 4 N + the three mirrored ones), each
    showing the finished composite. The three mirrored views follow W/NW/SW automatically
    (one checkbox if you want to fill them separately).
  * **Whole cycles in one click**: "Use Attack N · sheet row 6 · 6 poses" fills every frame of
    that view at once. Singly-clickable poses stay available to fix an individual frame, and
    the frame strip (1…8 for walk, 1…6 for attack) shows which frames are still empty.
  * **The weapon is the game's own weapon** — the real Divine Pride item icon for the family,
    at the game's own hand/grip anchor, drawn only on the Attack tab. **Drag it in the preview**
    to move it for that class + weapon + view; the offset is stored in the copied selection, and
    ↺ puts it back. The vector weapon art remains the fallback if the icon cannot load.
  * The pose tiles no longer carry the technical row/column/IoU labels; the head-seat marker on
    a pose is in the tooltip, and every card preview shows where the head actually lands.
* **Files touched:** `index.html` (`syncWeaponSprites` attack-only guard, `BUILD` v26),
  `tools/tests/sprite_sim.js` (the weapon-visibility assertion now pins attack-only),
  `tools/make_sprite_picker.py` (reads the weapon/attach constants straight out of
  `index.html` so the picker can never drift; adds whole-cycle "strips"), 
  `tools/sprite_picker.html` (rebuilt), `tools/sprite_picker_data.js` (regenerated, 266 KB),
  `AGENTS.md`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run.
* **Tests:** all 13 suites green (class change 22, save/load 10; economy 21, stat 7, card 13,
  skill 48, gear 20; scene 8, kit 20, UI 13, sprite 10, starter 4; pack 19 bodies). Inline game
  JS passes `node --check`; the picker's own inline JS passes `node --check` and boots under a
  DOM/canvas stub, exercising all three tabs, auto-fill, the walkthrough, a view card, a
  whole-cycle button and a candidate tile (assignment verified to land in the selection JSON).
* **Branches / PR:** `arena/01a1054b-prontera-grind`; pushed for review.
* **Known limits / follow-ups:**
  * The weapon's *size* is not adjustable — only its position, which is what the owner asked for.
  * Weapon drag offsets are stored per class + weapon family + view; they are not yet applied to
    the game (`index.html` still uses its own `PACK_WEAPON_ADJUST` hand point). They will be
    folded in when the pack is rebuilt from the picks.
  * Divine Pride icons need network access in the browser; without it the picker draws the
    vector fallback, exactly as the game does.

### 2026-10-04 — `tool-v26 fix: self-contained picker` (no game change, no BUILD bump)
* **What changed for the player:** nothing in the game. The sprite picker showed a black
  screen for the owner: the page was opened somewhere that cannot serve the files next to it
  (the file viewer), so `assets/sprite_pack_data.js` and `Sprite/*.png` never loaded and the
  page had nothing to draw. Two fixes:
  * **`tools/sprite_picker_standalone.html`** — the whole picker in ONE file: app + pose index
    + all 21 sheets + both head atlases inlined (2.9 MB). It needs no other file, so it opens
    anywhere: file viewer, preview server, phone, offline.
  * **A visible failure banner.** If any of the three inputs (pose data, sprite pack, a class
    sheet) is missing, or the page throws while drawing, the top of the page now says what is
    missing and what to open instead — the black screen can no longer happen silently. A
    global `window.onerror` handler reports any future drawing error with its line number.
* **Also hardened:** view canvases and cards carry their own `data-dir` (drawing and the
  weapon-drag repaint no longer rely on DOM order), so a stray element can never shift a view
  onto the wrong direction.
* **Files touched:** `tools/sprite_picker.html` (banner, per-class inlined-sheet support,
  `data-dir`), `tools/make_sprite_picker.py` (writes the standalone next to the data file, so
  the two can never drift), `tools/sprite_picker_standalone.html` (new, generated),
  `tools/sprite_picker_data.js` (regenerated), `AGENTS.md`. `index.html` untouched.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run.
* **Tests:** game suites re-run and green (pack 19 bodies, sprite 10, UI 13, class change 22,
  save/load 10). The picker was run end to end under a DOM/canvas stub in all three modes —
  standalone (8 views drawn, tabs, auto-fill, walkthrough, whole-cycle assign, selection JSON
  parses), served page (same), and served page with its sibling files blocked (shows the
  banner instead of a blank page). Inline JS passes `node --check`.
* **Branches / PR:** `arena/01a1054b-prontera-grind`; pushed for review.
* **Known limits / follow-ups:** the standalone is generated - edit `tools/sprite_picker.html`
  (and run `tools/make_sprite_picker.py`), never the standalone directly.

### 2026-10-04 — `tool-v27 picker never fails silently`
* **What changed for the player:** nothing in the game (the v26 attack-only weapon stands).
  This is about the picker showing a black screen when the owner opened it.
* **Why it was black:** the picker is a script-driven page. Opened as a *file* (a viewer or an
  attachment preview) no scripts run, so nothing is ever drawn and the dark page reads as a
  black screen. Evidence: the preview server's log shows **no request from the owner's browser**
  — only my own health checks — so the page was not opened through the preview at all.
* **What the pages do now instead of going quietly black:**
  * a first-in-head error trap: any script error paints a red bar with the message and the
    file:line, and a **6-second watchdog** reports "nothing was drawn" with full diagnostics;
  * a `<noscript>` banner that says, in words, that scripts are blocked here and to use the
    live preview panel instead;
  * a header badge in the picker: `sheets n/19 · views n`;
  * every camera view draws a readable "loading <class> sheet…" / "empty frame" label rather
    than an empty black panel;
  * `window.__pgDiag()` reports pose data, head atlases, sheets loaded and views drawn.
* **New: `tools/picker_check.html`** — a small launcher. It states plainly whether JavaScript
  runs where it was opened, whether localStorage is available, whether it is inside an iframe,
  and links to both the normal and the single-file picker. The preview root now serves this
  page, so "is this place able to run the picker at all?" is answered before anything else.
* **Files touched:** `tools/picker_check.html` (new), `tools/sprite_picker.html`,
  `tools/sprite_picker_standalone.html` (regenerated from the same source), `AGENTS.md`.
* **Art:** none; `tools/montage.py` not run. Game files untouched by this entry.
* **Tests:** the picker booted under a DOM/canvas stub in three shapes — standalone, served
  page, and served page with the data file missing. First two: 8 view cards, 8 views drawn,
  `__pgDiag` reports 19 classes + both head atlases + the active sheet, no error bar. Missing
  data: no error bar, and the page prints the red "pose data did not load" banner (i.e. the
  black screen is now an explained screen). All 13 game suites were green at `f2bed26`.
* **Branches / PR:** `arena/01a1054b-prontera-grind`.
* **Known limits / follow-ups:**
  * There is no browser in this sandbox (Chromium downloads are blocked), so verification is
    static + stub-based, not a screenshot. The launcher exists to make the owner's own
    browser report the truth.
  * A viewer that strips both `<script>` and `<noscript>` would still show only the dark
    shell; the launcher and the header text are the fallback signal in that case.

### 2026-10-04 — `ui-v27 attack poses only, no weapon when facing away`
* **What changed for the player:**
  * **The weapon no longer shows on the away-facing views (NW 3, N 4, NE 5).** The weapon art is a
    front-view item icon, so on a back view it read as a ruined weapon stuck through the body.
    Those three views now attack bare-handed; the other five keep the weapon. One constant,
    `WEAPON_HIDDEN_DIRS=[3,4,5]`, so the owner's per-view choice can change it later.
  * (v26 stands: the weapon only appears at all while attacking.)
* **The picker is now attack-only** — `tools/sprite_picker.html` was cut down to what the owner asked
  to manage:
  * **Idle and walk are no longer shown or asked about.** They are filled automatically from the
    sheet layout (the measured path the pack already uses), so there is nothing to click for them.
  * **One row of 8 attack view cards**: pose + hair + weapon, a 6-frame strip each, and a
    **weapon checkbox per view** — unticked by default for NW/N/NE, matching the game.
  * Click a card → choose the view's attack frames: one whole attack set per sheet row in one
    click, or single poses one at a time (clicking a pose fills the current frame and steps on).
    ◀ back / next ▶ walk every frame of every view.
  * Dragging inside a preview moves that class+weapon's weapon for that view (and the move is
    recorded in the selection). A front-view icon cannot be rotated into a back view, which is
    exactly why the back views default to no weapon.
  * The copied selection carries only attack frames, the per-view weapon flags and the weapon
    moves — nothing about idle or walk.
* **Files touched:** `index.html` (`WEAPON_HIDDEN_DIRS`, weapon guard, `BUILD` v27),
  `tools/tests/sprite_sim.js` (pins the hidden-direction list and its use),
  `tools/sprite_picker.html` (attack-only rebuild), `tools/make_sprite_picker.py`
  (reads `WEAPON_HIDDEN_DIRS` out of `index.html` so the picker's defaults cannot drift),
  `tools/sprite_picker_data.js` + `tools/sprite_picker_standalone.html` (regenerated),
  `AGENTS.md`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run.
* **Tests:** all 13 suites green (class change 22, save/load 10; economy 21, stat 7, card 13,
  skill 48, gear 20; scene 8, kit 20, UI 13, sprite 10, starter 4; pack 19 bodies). Inline game
  JS passes `node --check`. The attack picker was booted under a DOM stub in both builds:
  8 view cards, weapon defaults `[on,on,on,off,off,off,on,on]`, 5 cycle buttons, 54 pose tiles,
  24 attack poses after auto-fill, and a payload with no idle/walk keys.
* **Branches / PR:** `arena/01a1054b-prontera-grind`.
* **Known limits / follow-ups:**
  * Which views hide the weapon is a fixed list in `index.html` today; the picker's per-view
    checkboxes are recorded but are not applied per class yet (one list for all classes).
  * Idle and walk are still the sheet's own layout picks — if the owner ever wants to change
    them, the pose index still carries them.

### 2026-10-04 — `ui-v28 the weapon is pinned to the hand`
* **The problem, and what the research says.** The weapon kept sliding out of the hand as the attack
  frames advanced. Reason: it was placed by a *model* of the swing (an arm the code imagined), so it
  sat near the hand, not on it. Ragnarok Online does not model that either — its act files carry a
  weapon offset **for every single frame**, and the docs are explicit about the anchor:
  *"Weapons = Body as base"* (rAthena Act Editor). The weapon is aligned to the **body's per-frame
  anchor**, and somebody set those numbers frame by frame (`weapon_offsets.txt` in the RO-offline
  tools is a hand-made table; the official editors ship a Weapon-offset control). So the fix is to
  measure the hand in the art, per frame, and draw the weapon there — no model, nothing to drift.
* **What changed for the player:** the weapon now sits **in the hand on the frame being played**, for
  every attack frame of every class, and it cannot slide: the position is the measured hand.
* **How it works.** `tools/make_weapon_joints.py` finds the bare-skin hand in every attack cell —
  the neck-coloured blob furthest from the hips below the shoulders (bare hands get a pixel-exact
  hit; gloved/wrapped classes fall back to the silhouette extremity, and one 27 px clamp exists so a
  frame cannot jump). 912 joints: 19 bodies x 8 directions x 6 attack frames, all in range.
  `assets/weapon_joints_data.js` carries them (`WEAPON_JOINTS[body][dir][frame]`, plus
  `WEAPON_JOINTS_SRC`: `H` = bare hand, `E` = extremity). In game, `weaponSpritePixel()` asks
  `weaponJointPixel()` first and uses it **with no extra offset** — the joint *is* the grip point,
  so `PACK_WEAPON_ADJUST` (which existed only to correct the old model) is not applied on this path
  and stays only as the fallback if the file is missing.
* **Files touched:** `index.html` (script tag, `weaponJointPixel`, joints-first `weaponSpritePixel`,
  `userData.body`, `BUILD` v28), `assets/weapon_joints_data.js` (new, 10.9 KB),
  `tools/make_weapon_joints.py` (new; `--qc <out.png>` writes a contact sheet of every body/dir/frame
  with the joint marked), `tools/sprite_picker.html` + `tools/make_sprite_picker.py` (the picker loads
  the joints, draws the measured joint as a green cross on every preview, mirrors it on the mirrored
  views, and places the weapon from it), `tools/sprite_picker_data.js` +
  `tools/sprite_picker_standalone.html` (regenerated), new test `tools/tests/weapon_joint_sim.js`,
  `AGENTS.md`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run.
* **Tests:** all 14 suites green — the new `weapon_joint_sim.js` (7 checks) proves the joints cover
  912/912 cells, that the hand never moves more than 28 px between attack frames, that the game's own
  placement returns **exactly** the joint pixel for every body/dir/frame, and that the old model
  really did slide (frame-to-frame gap spread > 6 px in most views, which is the bug the owner saw).
  Then class change 22, save/load 10; economy 21, stat 7, card 13, skill 48, gear 20; scene 8, kit 20,
  UI 13, sprite 10, starter 4; pack 19 bodies. Inline game JS passes `node --check`. The picker boots
  under a DOM stub in both builds (`ATTACK PICKER OK`: 8 cards, defaults
  `[on,on,on,off,off,off,on,on]`, 54 pose tiles, no idle/walk keys).
* **Branches / PR:** `arena/01a1054b-prontera-grind`.
* **Known limits / follow-ups:**
  * The joint is a position, not a rotation: the weapon is not tilted with the hand. Rotation is not
    what moves the weapon out of the hand, and the icon's grip already holds its own spin.
  * Gloved classes use the silhouette extremity, so if one of those lands badly the fix is a tighter
    sampling rule in `make_weapon_joints.py`, not a nudge in the game.
  * The picker's per-view weapon checkboxes and drag offsets are still recorded in the selection
    rather than read back by the game; whether the weapon hides per class is still one shared list.

### 2026-10-04 — `ui-v29 weapon parked, heads you can seat, S and N spelled out`
* **The owner's call, and the new order of work.** v28 (weapon pinned to the measured hand) was
  rejected — *"this idea doesnt work"* — with an explicit sequence: **hold the weapon in one
  position → the owner chooses the attack poses → the pose is confirmed → only then the weapon is
  worked out** (the owner has an idea for it). v28's per-frame joints are **not** thrown away: the
  measurement stays in the repo for the next step, the game just does not use it to move the weapon.
* **What changed for the player:**
  * **The weapon is parked.** It is held on one spot — the hand of the attack's *first* frame, with
    the first frame's angle and no scale pulse — for the whole attack, so nothing about it can move
    while the frames advance. Visibility is unchanged (attack only, v27: bare-handed on NW/N/NE).
  * (`BUILD` -> `2026-10-04 ui-v29 weapon-held-in-one-position`.)
* **The picker now says which way the character faces, in words.** The letters alone were the
  confusion ("is north then front or the back view?"): **S = he faces you (front), N = he faces
  away (back)** — verified from the art itself, not from convention: dir 0 shows the face, dir 4
  shows the back of the head and the cape, dirs 3/4/5 are the three away views. Every card is
  labelled *front - he faces you* / *back - he faces away* / *side - faces left*, and the header
  explains it. (This also confirms v27's weapon rule: the three views that hide the weapon are the
  three back views.)
* **The heads are in the picker and can be seated by hand.** The head is drawn in every preview;
  a **blue dashed box** marks the head on the selected view, and **dragging it** moves the head (per
  class + view + attack frame). The panel shows *Head: as measured / moved +2,-3 px*, with
  **↺ reset head** and **use this head on all 6 frames**. The export carries the result in the
  game's own units: `headX/headY` = the head pivot inside the 96x96 cell (measured seat x the same
  scale the pack builder uses, plus the drag), `headSource` becomes `manual` when dragged, and the
  raw drags travel in `headAdjust`. Payload is now **version 4**.
* **The picker is step 1: poses.** A **"hold the weapon in one position"** switch sits in the header
  (on by default). With it on, the weapon does not move in the previews; untick it to see it follow
  the hand. Dragging inside a picture now moves the **head**; the weapon drag moved to the selected
  view only. The header says plainly that the weapon comes after the poses are confirmed.
* **Files touched:** `index.html` (the parked weapon, `BUILD` v29), `tools/sprite_picker.html`
  (view words, the pin switch, head drag + panel row, export v4, `window.__pgTest` for the tests),
  `tools/make_sprite_picker.py` (unchanged behaviour - it rebuilds the standalone from the app
  source), `tools/sprite_picker_data.js` + `tools/sprite_picker_standalone.html` (regenerated),
  `tools/tests/weapon_joint_sim.js` (now pins the parked contract), **new**
  `tools/tests/picker_sim.js` (boots the real picker page under a DOM stub and drives the head
  drag, the park switch and the export), `AGENTS.md`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run.
* **Tests:** all **15** suites green - the two new/pinned ones: `picker_sim.js` 9 checks (the page
  boots with no error bar, 8 views, the S/N wording, the park switch really parks, a head drag moves
  the head by exactly the dragged amount and lands in the export as `manual`, the payload still has
  no idle/walk) and `weapon_joint_sim.js` 7 checks (912 joints intact, and the game now returns ONE
  spot for all six attack frames). Then class change 22, save/load 10; economy 21, stat 7, card 13,
  skill 48, gear 20; scene 8, kit 20, UI 13, sprite 10, starter 4; pack 19 bodies. Inline game JS
  passes `node --check`, and both picker builds boot.
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).
* **Known limits / follow-ups:**
  * The picker's weapon toggle, drag offsets and the parked-flag still only travel in the export;
    `index.html` reads none of them yet (one `WEAPON_HIDDEN_DIRS` list for every class).
  * The head drag is per frame; a frame with "keep previous frame" carries no head of its own.
  * Idle and walk remain the sheet's own layout picks.

### 2026-10-04 — `tool-v30 picker: poses only, every pose offered, a head marker you can see`
* **Three things the owner asked for, all in the picker (the game is untouched this round).**
* **The weapon is off the page.** The weapon dropdown, the per-view weapon checkbox, the weapon in the
  previews, the joint cross and the weapon drag are all gone - `tools/sprite_picker.html` no longer
  loads `assets/weapon_joints_data.js` either, and `make_sprite_picker.py` no longer inlines it into
  the standalone (2.9 MB -> 2.8 MB). The export is **version 5** and carries poses and heads only:
  `{version, note, mirrorSide, attack, headAdjust}`. The game keeps its own weapon rules (attack only,
  bare-handed on NW/N/NE, held in one position) until the owner's idea for it lands.
* **"Some of the poses I want seem missing" — they were.** The tile grid only offered poses that
  belonged to an attack set. It now lists **every figure in the sheet**, grouped under *Sheet row N*
  headings (Knight: 97 tiles, was 54; the rows that carry no attack label included, e.g. the
  `montage` row as *Other poses*). The sheet's own suggestion for the view still has the green border.
* **Fewer than six frames is fine, and a pose can be repeated.** Nothing enforces six: an empty frame
  holds the pose before it (a *leading* empty frame takes the first pose picked) - the export note says
  so - and a new **repeat frame N on all 6** button fills the view with the pose already on the current
  frame. Clicking the same picture twice repeats it as well.
* **The head marker is now the head, not a big square.** The old guide was the whole 64x64 head cell,
  which is mostly empty space, so there was nothing to aim at. The head's own pixels are scanned once
  per sex + view + hair style (`headBox`, alpha > 8) and drawn as a shaded box, with a ring and cross
  on the seat itself. **Dragging anywhere in a picture** seats that view's head (there is nothing else
  to drag any more, so no small target to hit). If a browser refuses `getImageData`, the box is skipped
  and the ring is still there.
* **Files touched:** `tools/sprite_picker.html` (weapon UI and weapon code removed, all-poses grid,
  repeat button, head marker, export v5), `tools/make_sprite_picker.py` (joints inlining removed),
  `tools/sprite_picker_data.js` + `tools/sprite_picker_standalone.html` (regenerated),
  `tools/tests/picker_sim.js` (11 checks - now proves there is no weapon control, that every pose in
  the sheet gets a tile, that a cleared frame exports null and the repeat button fills six, and that
  the head box is the head's pixels rather than the whole cell), `AGENTS.md`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run.
* **Tests:** all 15 suites green (class change 22, save/load 10; economy 21, stat 7, card 13, skill 48,
  gear 20; scene 8, kit 20, UI 13, sprite 10, starter 4; pack 19 bodies; weapon joints 7; picker 11).
  Inline JS passes `node --check`, and both picker builds boot under the stub.
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).
* **Known limits / follow-ups:**
  * The picker's own weapon choices are gone for good; if the owner wants per-class weapon hiding
    later it comes back as part of the weapon step, not as a checkbox here.
  * The head drag is per frame and per view; a frame set to "keep the previous" carries no head of its own.
  * Idle and walk remain the sheet's own layout picks, filled in by the build.

### 2026-10-04 — `tool-v31 the head was never drawn (sex key), and one-click view copies`
* **The bug the owner reported: "i still cant see a head, only a blue marker".** The head atlases are
  keyed `male`/`female` in `assets/sprite_pack_data.js`, but the picker's gender select holds `m`/`f`,
  so `headReady['m']` was always undefined and `packedCell` never drew a head at all. It also meant
  `headBox` got nothing to scan, which is why the guide was only the blue ring: the shaded head box
  could never appear. Fixed with one `sexKey()` mapping used by the drawing, the box scan and its cache
  key. **This is why the owner could not "identify where is the head"** - there was no head on screen.
  The harness now spies on `drawImage` and asserts a 64x64 head cell from the right atlas row/column
  lands exactly on the seat, so this cannot come back silently.
* **"Attacking pose should only need S & W, e.g. SW should be the same as W — am I right?"**
  Measured, not guessed: the sheet draws S, SW, W, NW and N **separately** and the picker already
  mirrors the other three (NE/E/SE) by itself, so five views is the floor the art gives you. SW and W
  are *not* the same picture (mean channel difference SW-vs-W 86-113, the same order as S-vs-W 97-117);
  SW is the three-quarter view and is closer to S than to W (S-vs-SW 66-83). So: you *may* reuse W's
  poses for SW, but it is a choice, not what the art does.
* **What was added so the owner can make that choice in one click:** the panel for a view now has a
  **"Shortcut — use the attack poses of: S SW W NW N"** row; one click copies that view's six frames
  onto the current view. A card whose frames match another view's says **"same as W"**, so the state of
  the whole set is visible at a glance. (The export is unchanged: it carries the resolved ids, so a copy
  is baked exactly like a hand-picked set.)
* **Files touched:** `tools/sprite_picker.html` (`sexKey()`, the shortcut row, the "same as" note,
  `paint` exposed to the harness), `tools/sprite_picker_standalone.html` (regenerated),
  `tools/tests/picker_sim.js` (13 checks - the two new ones are "the head is actually painted, from the
  right head cell" and "one view can take another view's poses in a single click"), `AGENTS.md`.
* **Art:** none added, removed, recoloured or rebuilt; `tools/montage.py` was not run. The Knight S/SW/W
  attack columns were rendered from the picker data only to measure the SW-vs-W difference above.
* **Tests:** all 15 suites green (class change 22, save/load 10; economy 21, stat 7, card 13, skill 48,
  gear 20; scene 8, kit 20, UI 13, sprite 10, starter 4; pack 19 bodies; weapon joints 7; picker 13).
  Inline JS passes `node --check`; both picker builds boot.
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).
* **Known limits / follow-ups:**
  * A copy is a copy: changing the source view afterwards does not follow. (Re-click the shortcut, or
    the card stops saying "same as ..." and that is the tell.)
  * The head drag is per frame and per view; a frame set to "keep the previous" carries no head of its own.
  * Idle and walk remain the sheet's own layout picks, filled in by the build.

### 2026-10-04 — `tool-v32 NE/E/SE get their own head art, and the drag follows the pointer` (no game change, no BUILD bump)
* **The two things the owner reported: "NE, E,SE the heads are not mirrored" and "when i move it
  around the movement seems to be inverted".** Both were real and both came from one wrong idea in the
  picker: it treated NE/E/SE as "the neighbouring view, flipped". The head sheet is not missing those
  views - it draws all eight, and the game reads them by the view's own column (`packTex` draws head
  column `d*64`). The picker drew the *source* view's head, unflipped, on a mirrored body - so the E
  card showed a left-facing head on a right-facing body; and it added the pointer's movement *before*
  mirroring the result, so on those three views dragging right pushed the head left.
* **What changed:** the head now comes from the *drawn* view's own atlas column; the seat comes from the
  pack's own anchor for the drawn direction (`anchors[anim][dir][frame]`), the exact number the game
  reads out; the plain fallback (a pose the pack does not carry) mirrors x when the body is mirrored;
  and the hand-drag offset is applied *after* mirroring, so the head follows the pointer on every view.
  NE/E/SE are still seatable on their own - the drag keys stay per view.
* **Also found while verifying: the export was still dropping the body offset.** It wrote the
  crop-measured seat + drag instead of the game cell - about 24 px up and left of what the preview
  showed and what the game needs (the "head & your blue marker are way off" numbers). The payload keeps
  its version-5 shape, but `headX/headY` are now the same cell pixels the preview draws.
* **Note for the owner:** head drags made before this fix were measured against the wrong seat. After
  reloading, press "reset head" on a frame (or drag it again) and the head sits where you put it.
* **Files touched:** `tools/sprite_picker.html` (head tile, seat, drag, export), `tools/sprite_picker_data.js`
  and `tools/sprite_picker_standalone.html` (both regenerated), `tools/tests/picker_sim.js`.
* **Tests:** all 15 suites green (class change 22, save/load 10; economy 21, stat 7, card 13, skill 48,
  gear 20; scene 8, kit 20, UI 13, sprite 10, starter 4; pack 19 bodies; weapon joints 7; picker **16**).
  The picker checks now pin the head rules: the view's own atlas column and no flip, E seated on the
  pack's own E anchor, a +10 px drag moving the head +10 px right on every view (mirrored included), the
  marker shade landing on the drawn tile inside the cell offset, and the export being cell pixels, not
  crop pixels. Inline JavaScript passes `node --check`; both picker builds boot ("ATTACK PICKER OK").
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).

### 2026-10-04 — `tool-v33 the owner's selection is the picker's standard, and it is backed up` (no game change, no BUILD bump)
* **What the owner asked for:** "make a back up for this in my github. also what i tune in would be a standard
  defult if i would like to adjust again. also this setting also make a back up. as i might add more classes
  in the future. make notes for future ai agent to understand too."
* **The backup.** The selection the owner sent back is saved byte for byte as `tools/attack_selection.json`
  (the v5 payload: 18 classes x 5 drawn views x 6 frames = 540 pose cells, plus 862 head entries). It is the
  source of truth for the attack poses and head seats from now on.
* **The standard.** `tools/make_sprite_picker.py` turns that backup into
  `tools/sprite_picker_defaults.js` (18 classes, 540 heads), which the picker loads. A fresh browser now opens
  on the owner's own numbers instead of on the sheet's guesses, and a new button **"↺ Back to the standard"**
  puts the page back to the saved selection after any editing. It restores only the classes the backup covers:
  a class added later keeps the sheet's own picks until the owner tunes it. The old "Reset everything" (blank
  the whole page) is gone - that is what this button replaces.
* **Nothing is re-measured.** The payload stores the head as an absolute pivot in the game's 96x96 cell; the
  loader turns it into a drag against whatever seat this build uses, so the owner's numbers survive future
  changes to the seat rule. `picker_sim.js` now proves the whole thing comes back number for number
  (3,240 numbers compared) and that the standalone carries the standard too.
* **Notes for the next agent:** `tools/sprite_selection-notes.md` - the files, what every field means, how to
  add a class later (the owner's "I might add more classes"), what is not covered yet (**Sniper has no
  selection**), and the two mistakes this round found (`setHead` keyed by the on-screen class; the standalone
  inliner stripping newlines so a `//` comment swallowed the standard).
* **Files touched:** new `tools/attack_selection.json`, `tools/sprite_selection-notes.md`,
  generated `tools/sprite_picker_defaults.js`; `tools/make_sprite_picker.py` (the defaults builder, the
  inliner, and the anchors now travel in the standalone so its head maths matches the repo build),
  `tools/sprite_picker.html` (`applyDefaults`/`resetAll`, the new button, the header note),
  `tools/sprite_picker_data.js` + `tools/sprite_picker_standalone.html` (regenerated),
  `tools/tests/picker_sim.js`.
* **Tests:** all 15 suites green (class change 22, save/load 10; economy 21, stat 7, card 13, skill 48,
  gear 20; scene 8, kit 20, UI 13, sprite 10, starter 4; pack 19 bodies; weapon joints 7; picker **19**).
  The picker was also booted from the standalone build under the same harness (19/19) and the served page
  was checked by hand. Inline JavaScript passes `node --check`.
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).

### 2026-10-04 — `tool-v34 the owner's second selection is the standard, and the first one is kept` (no game change, no BUILD bump)
* **What the owner sent back:** the picker's own v5 export again, this time with **Sniper tuned and all 19
  classes filled in** — 570 pose cells (19 classes x 5 drawn views x 6 frames) and 912 head entries
  (570 on the drawn views and 342 more on the mirrored ones).
* **Backups, the way the owner asked ("redo the back up and the previous back up and all"):** the second
  delivery replaced `tools/attack_selection.json`, and the first delivery is archived beside it as
  `tools/attack_selection_prev.json` — read-only history, never overwritten by a later payload.
  The standard was rebuilt from it: `tools/sprite_picker_defaults.js` now carries **19 classes / 570 heads**,
  the picker and the standalone were regenerated, and a fresh browser opens on the new numbers.
* **Coverage is now complete:** Sniper was the one class without a selection; it has one, so the "known gap"
  note in `tools/sprite_selection-notes.md` is gone.
* **Two traps found on the way:** the same crop box can name several poses (one per direction the sheet
  draws), so a payload must be resolved through the picker's **id** path, never by re-matching (x,y,w,h)
  rectangles — 456 of 912 boxes matched more than one pose; and the first delivery's head drags were tuned
  while the mirrored-column and inverted-drag bugs were still live, which is another reason the newest
  payload always wins.
* **Tests:** all 15 suites green; the picker round-trip compares all 3,420 numbers of the new standard
  (picker **19** passed, 0 failed).
* **Files touched:** `tools/attack_selection.json` (new payload), new `tools/attack_selection_prev.json`,
  generated `tools/sprite_picker_defaults.js` + `tools/sprite_picker_standalone.html`,
  `tools/sprite_selection-notes.md`.
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).

### 2026-10-04 — `tool-v35 the weapon side: measured, placed, and ready for the owner's review` (no game change, no BUILD bump)
* **What the owner asked for:** "tell me how can we move in with the weapon side? maybe i pin point out the
  hands for u?" plus the standing instruction to research first and hand over as little manual work as
  possible. The answer: **they do not need to pin-point anything** — the hand is measured from their own
  poses, and a page shows the result so only the odd tile needs a drag.
* **Why v28's joints file was not the answer** (this is now written down in `tools/weapon-plan.md`):
  it measures each frame on its own, so the point hops between the two arms (knight dir 0 ran
  65, 67, 69, 45, 68, 45 px) — that is the flicker the owner saw; and it only knows the standard attack
  rows, while **197 of the owner's 570 picked poses (35%) come from other rows** of the sheet. A second
  idea — find the arm by what moves between frames — is a dead end too: the whole body lurches in an
  attack, so motion lights up the whole silhouette.
* **What is built instead:** `tools/weapon_bake.py` measures the hand from the picked cell itself (skin
  taken from the body's own neck colour, hand-sized blobs below the shoulders, boots rejected, the pixel
  farthest from the torso = the fist), then **tracks one arm across the six frames** — seed on the clearest
  frame, chain the nearest candidate, and hold position when the arm is hidden rather than jumping. The
  angle continues the forearm and a guard rotates the weapon until it clears the body (an axe head is
  13 px wide); bows and staves get a small fixed tilt because they are carried upright.
* **Result:** 570 of 570 armed cells have a grip; 315 measured from a bare hand, 255 inferred from the
  glove/wrist/hidden arm (Mage 27/30 found, Knight 8/30 — the armoured classes are the ones worth a look).
  NW/N/NE stay bare (the owner's v27 rule); idle and walk stay weaponless (v26).
* **The owner's part:** `tools/weapon_review.html` (and the standalone twin) — every class, 8 views,
  6 frames, weapon already placed, drag any tile that looks wrong (one drag carries the whole view by
  default), arrow keys nudge 1 px, "Copy my adjustments" returns one small JSON block.
  `tools/preview_weapon.png` is the contact sheet of the automatic pass, all 19 classes.
* **Still the owner's call:** which art to bake (the item icons the game shows today — needs one online run
  of `--fetch-icons` because this sandbox has no internet; real weapon sheets dropped into
  `Sprite/weapons/`; or the game's own drawn shapes, which is what the preview uses), whether away-facing
  views really stay bare, and the final "bake it" go-ahead.
* **Files touched:** new `tools/weapon_bake.py`, `tools/weapon-plan.md`, `tools/weapon_review.html`,
  `tools/weapon_review_data.js` + `tools/weapon_review_standalone.html` (generated),
  `tools/weapon_grips.json`, `tools/preview_weapon.png`, `tools/tests/weapon_review_sim.js`.
* **Tests:** all 15 suites green (the new one: weapon review **13** passed, 0 failed — every class/view/frame
  covered, weapons only on the armed views, drag never inverted, the exported nudges exact).
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).

### 2026-10-04 — `tool-v36 a preview server in the repo, and a handover note for the next session` (no game change, no BUILD bump)
* **Why:** the owner could not open any of the preview links ("i cant access any of the links u given",
  then "not working"). The two things that could be fixed from this side are fixed.
* **The server used to live in `/tmp`** and was wiped by every sandbox reset, and it answered the front
  page with a **302 redirect** — a proxy in front of it can drop that and leave a blank page. It now
  lives in the repo as `tools/preview_server.py`, answers every route with a **direct 200 (no redirects
  anywhere)**, sends `Cache-Control: no-store`, and serves `/` (weapon review), `/review`, `/standalone`
  (the review page as one offline file) and `/picker` (the pose + head picker). Run it from the repo root:
  `python3 tools/preview_server.py 8000`.
* **The fallback for the owner** — a single self-contained page that makes no external requests at all
  (verified): `tools/weapon_review_standalone.html` on the branch, openable as a local file.
* **The handover:** `tools/HANDOVER-weapon-review.md` — how a fresh session recovers the branch
  (`git reset --mixed origin/arena/01a1054b-prontera-grind`, never `--hard`), starts the preview, and what
  the owner is asked to do (drag the odd tile, "Copy my adjustments", or say "bake it"). The reviewed
  state is tagged **`weapon-review-v35`** in the owner's GitHub as a fixed backup point.
* **Files touched:** new `tools/preview_server.py`, `tools/HANDOVER-weapon-review.md`.
* **Tests:** all 15 suites unchanged and green; the game is untouched.
* **Branches / PR:** `arena/01a1054b-prontera-grind` (PR #11).
### 2026-10-04 — `kit-v26 map-kit-v2 all-ten-maps`
* **What changed for the player:**
  * **Every map is now drawn from Map Kit v2**, the higher-fidelity RO-style art set that arrived in
    `Updates/map-sprites-v2/` with a note for the implementing agent (that is this entry). The old
    sheet carried 8 ground tiles and 7 trees; the new one carries **25 ground tiles and 34 props**,
    painted in one style with ten different moods. Nothing about how the game plays changes - the
    arena, the lane, the spawn band, mobs, drops and fights are untouched. What changes is what you
    see when you travel.
  * **Each map now looks like its own place**, researched against Ragnarok Online's fields:
    Prontera a sunny meadow with a dirt avenue and a cottage in the distance; Izlude a teal sea
    over a **golden sand shore**, palms at the waterline and its pier standing on posts; Geffen
    moody blue-grey grass with dark gnarled trees, standing stones and **the wizard tower on the
    horizon**; Comodo a golden beach with cave-mouth crags behind the sand; Louyang a jade highland
    with **terraced rice paddies** beside the road, bamboo, a stone shrine and lantern pairs;
    Amatsu a blossom field with a **red lacquer bridge** over its stream, a red torii gate on the
    approach and the great red arch bridge far off; Niflheim a purple-grey waste of dead trees,
    graves and one ruined house; the Abyss dark slate with a pale limestone shore around a **deep
    dark-blue lake** full of stalagmites and crystals. Morocc keeps its attached desert design,
    cell for cell, now painted from the sharper desert tiles.
  * **Payon finally reads as RO's Payon Forest**: its road is the kit's dark red-brown mud trail
    instead of the generic dirt tile, and both creek banks carry **bamboo groves** - the old kit
    had no bamboo crop at all, which is why the groves were impossible until now - plus the mossy
    boulders at the crossing the old atlas was missing.
  * **The in-page desert-atlas generator is gone.** v1 painted Morocc's sand and ruins in the
    browser at load; v2 ships every one of those names on the one sheet, so there is nothing left
    to generate and one less thing that can fail. Morocc's layout is exactly as it was.
  * If the new sheet cannot be downloaded, every map quietly falls back to the old procedural
    scenery, exactly as before - the kit can never break the game.
* **Files touched:** `index.html` (the kit layer: the v2 size table, the ten per-map recipes,
  Payon's mud road/bamboo/boulders, ground bands, recipe-selectable water frames and deck tile,
  one-atlas aliases, retired-generator removal, `BUILD`), `assets/kit/ro-spritesheet.png` and
  `.json` (replaced by the v2 sheet and manifest), `assets/kit/morocc-atlas.js` moved to
  `Updates/retired-v1-kit/morocc-atlas.js` and its `<script>` tag removed, `tools/tests/kit_sim.js`
  (rewritten around v2: 20 pins moved to 30), `AGENTS.md` (the kit section of the map above, the
  expected-output table, this entry).
* **Art:** nothing was drawn, traced, recoloured or substituted by this implementation - the v2 art
  is the delivered deliverable, copied verbatim into `assets/kit/`. `tools/montage.py` was not run;
  `Sprite/`, the class pack and the class bodies are untouched. The manifest's own tuned size
  table (`suggest.KIT_PS`) is now the game's `KIT_PS`, compared entry for entry by a test, and the
  80px character strip the prop scale is measured from was checked **byte-identical to v1's**
  (0 differing channel values), so `KIT_PK = 2.9/80` did not move.
* **Tests:** all 13 suites green - pack (19 bodies), class_change 22, save_load 10, economy 21,
  stat 7, card 13, skill 48, gear 20, scene 8, **kit 30** (was 20), ui 13, sprite 10, starter 4;
  inline JS passes `node --check`. `kit_sim.js` moved its pins, not its rules: the
  rock_boulder_mossy skipped-placement gap inverted (the crop exists now - Payon's field places
  two boulders at the crossing and the three the attached payon design asks for would all render),
  the size table is pinned against the manifest's own table, and the retired-generator test
  replaces the old "the generator still paints these names" test. New tests pin each map's identity
  and unique signature, the landmarks (one each, off-lane, RO-scaled), the red deck and lantern
  pairs, the Abyss dark water pair and its animation, the Louyang paddies off-lane with nothing
  standing in them, and the shared-crop cache. **Two real builder bugs were found and fixed while
  writing them**: a ground band at a depth painted only its first matching x range (Louyang's
  left-hand terraces were silently missing), and a tree's undergrowth could land in a band the
  tree itself had skipped.
* **Branches / PR:** `arena/01a10549-prontera-grind`; the pull-request link is recorded in the
  delivery entry below.
* **Known limits / follow-ups:**
  * **The torii gate stands at the lane edge, not astride the road.** Scenery may never stand in
    the running lane, so its anchor sits at the lane edge and only its painted arch overhangs the
    road. If you want it centred over the road, that needs an explicit "a gate may span the lane"
    exception in the lane rule - ask for it and it is a small, tested change.
  * **`grass_jade` and `paddy_water` are the kit's two brightest tiles** (the jade highland and
    RO's ripple-grid water). They look saturated in the atlas; in game the lighting and fog tone
    them down. If they read too neon in play, the lever is the palette remap in the art pipeline
    (`Updates/map-sprites-v2/work/process_tiles.py`), not a recolour in the game - house rule 1
    covers the kit's pixels too.
  * **The atlas is now the game's largest download** (2.8 MB, was 227 KB), fetched once and shared
    by all ten maps; every crop is cached once, so switching maps re-cuts nothing.
  * **`UPDATE-BOOTSTRAP.py` is a v7-era one-shot that would overwrite today's game with the v7
    build if anyone ran it** - when its patches no longer apply (they have not applied since v8) it
    restores `index.html` from an old commit and patches that. `READ-ME-FIRST.md` still tells a
    fresh agent to run it. Both are stale and dangerous; they should be deleted or rewritten, and
    this entry deliberately does not touch them.
  * `Updates/map-sprites-v2/preview.html` still shows every prop at its shipped size next to the
    hero, and is the quickest way to judge the art outside the game.

### 2026-10-04 — `kit-v26 delivery`
* **What changed for the player:** no additional game changes; published the verified v26 map-kit
  update for review and merge.
* **Files touched:** `AGENTS.md` only.
* **Art:** none; no sheets added, removed or rebuilt by this entry, and `tools/montage.py` was not
  run.
* **Tests:** documentation-only follow-up; the 13-suite results are listed in the `kit-v26` update
  entry immediately above, and were re-run green before the game push.
* **Branches / PR:** `arena/01a10549-prontera-grind` — https://github.com/KzeR7/Prontera-Grind/pull/10
* **Known limits / follow-ups:** merge the PR to deploy through the normal GitHub/Cloudflare route;
  then a real playtest pass over all ten maps is the thing the tests cannot do - judge Payon's
  bamboo and mud trail, Amatsu's red bridge and torii, the Abyss dark lake and Louyang's jade
  paddies in the live preview, and flag anything that reads wrong so the art pipeline (not the
  game) can be re-run.

### 2026-10-04 — `kit-v27 organic-field` **(checkpoint — work in progress, not finished)**

* **What changed for the player:** the owner's map feedback is being worked through. The ten maps
  no longer dress themselves in two mirrored tree lines or paint their ground with a
  mathematical lattice (`(i*7+j*13)%9`), which is what made the green patches look printed and
  every field look boxed in. Ground now varies in **organic noise patches**, scenery stands in
  **clumps spread across the whole field** (near the lane and far out), the map border turns wild
  in **ragged tongues** instead of a rectangle, and **Morocc keeps its attached design but is now
  dressed all round it**. **Prontera is the big visible change**: its floor is a **paved brick
  cobble avenue and square** through a green meadow and its buildings are the kit's own painted
  cottages — the old block-built town (THREE-box buildings, not kit art) is retired to fallback.
  **This is not finished**: the far-field ring and the per-map tuning are still owed, and the
  login card says `wip` on purpose.
* **Files touched:** `index.html` (the kit layout layer: seeded value noise, `KIT_FIELD`,
  `kitEdge`, the rewritten `fieldPlan`, the new `farDress`, `kitPlan` dispatch, all ten recipes,
  `BUILD`), `tools/preview/` (new dev-only tool: `dump_plans.js` + `render_plans.py`, top-down
  plan previews), `Updates/v27-organic-field/CHECKPOINT.md` (the handover instruction sheet),
  `image-search/` (RO reference renders kept with the repo's other research), `AGENTS.md`.
* **Art:** none. No tile, prop or pixel was drawn, traced, recoloured or substituted; `Sprite/`,
  the class pack and `assets/kit/` are untouched, and `tools/montage.py` was not run.
* **Tests:** 12 of 13 suites green at this checkpoint (class_change 22, save_load 10, economy 21,
  stat 7, card 13, skill 48, gear 20, scene 8, ui 13, sprite 10, starter 4). **`kit_sim.js` does
  not run yet** — its harness still binds the removed `PAY` constant and its pins describe the old
  layouts; rewriting it around v27 is item 3 of the checkpoint's to-do list. Inline game JS passes
  `node --check`.
* **Branches / PR:** `arena/01a1057c-prontera-grind`; checkpoint pushed as a draft pull request, so
  the work is safe on GitHub before the tuning pass.
* **Known limits / follow-ups:** **read `Updates/v27-organic-field/CHECKPOINT.md` before touching
  this** — it lists the root causes, what is done, what is owed (far-ring data per map,
  `kit_sim.js` rewrite, final `BUILD`, final log entry) and the house rules that must not break.

### 2026-10-04 — `kit-v27 organic-field all-ten-maps` (finished)

* **What changed for the player:** all ten arena maps were rebuilt from the owner's walk-through
  notes, and **Prontera finally wears the kit**. Details, map by map:
  * **Prontera** — the old block-built town was still showing because `buildDeco` returned early for
    map 0, so the kit never dressed it. That is fixed: the block town (and its procedural fountain)
    is now the *no-atlas fallback* only, and the map is the kit's own art — a **brick cobble avenue
    and paved square** in a light green meadow, the kit's painted cottages in a street row, and a
    **round fountain basin** in the square: a pool of the kit's water tile, a limestone curb ring,
    four stone posts on the rim and a **plinth at the centre**. There is no fountain crop on the
    sheet, so the basin is composed from crops — nothing drawn (house rule 1).
  * **Izlude** — de-jungled. It is now Prontera's field by the sea: light green meadow, sparse round
    trees, golden shore, palms at the waterline, the pier on its posts, and the sea running to the
    field edge so the far side is water instead of bare ground.
  * **Geffen / Louyang / Abyss** — the three the owner wants room to grow the battle field on:
    fewer, wider-spaced props, no rocky blobs in the middle, far sparser than before.
  * **Morocc** — the attached design is untouched, cell for cell, and is now **dressed all round
    it**: dunefields, mesas, palms, cacti, ruins and bones, alternating sides so **both sides** are
    dressed (the owner found one side bare).
  * **Payon / Comodo / Niflheim / Amatsu** — thinned and spaced; Comodo lost its rocky brown blobs
    entirely; Niflheim's trees and rocks are fewer; Amatsu's blossom is lighter.
  * **No more brown square**: the v26 rocky surround (and the inland rock blobs) is gone from every
    recipe. `kitEdge()` still exists as an opt-in wild edge, but **no map uses it** - the owner
    asked for open fields, and `kit_sim.js` pins that no map frames itself.
  * **The ground is organic now.** v26 painted its variation with `(i*7+j*13)%9===0` - a diagonal
    lattice of single cells that read as printed wallpaper (the owner's "symmetric green patches",
    "repeats of boxes"). Ground variation is **seeded value noise** with a **requested coverage
    fraction** solved from the noise's own distribution, so a recipe says "25% dark patches" and
    gets 25%, wherever the seed puts them. Scenery is placed in **clumps** spread over the whole
    field, with rejection sampling so the density really lands, and a **far ring** past the field
    border into the fog.
* **Files touched:** `index.html` (the kit layout layer: `kitHash/kitNoise/kitFbm`, `KIT_FIELD`,
  `kitEdge`, the rewritten `fieldPlan` with pools/outcrops/groves/bands/far, `farDress`, `kitPlan`,
  all ten `KIT_MAP` recipes, `buildDeco`'s Prontera fix, `BUILD`), `tools/tests/kit_sim.js`
  (rewritten around v27 - 33 pins), `tools/preview/` (new dev-only plan previewer: `dump_plans.js`
  + `render_plans.py`), `READ-ME-FIRST.md` (rewritten as a real handover), `AGENTS.md` (the map
  table's tool rows, the delivery recovery bullet, this entry).
* **Deleted:** `UPDATE-BOOTSTRAP.py`. It was a v7-era self-installer holding a compressed
  2026-10-02 build of `index.html` and `tools/`, and by v26 its patches no longer applied, so it
  would have restored that old build **over the current game** if anyone had run it (the v26 entry
  below flagged it; this entry is the fix). It is in git history. The recovery path is git itself:
  everything the game needs is committed.
* **Art:** nothing was drawn, traced, recoloured or substituted. Every pixel is a crop of the v2
  sheet; `tools/montage.py` was not run and `Sprite/`, the pack and `assets/kit/` are untouched.
  The fountain is five existing crops arranged, not new art.
* **Tests:** **all 13 suites green** — pack (19 bodies), class_change 22, save_load 10, economy 21,
  stat 7, card 13, skill 48, gear 20, scene 8, **kit 33** (was 30 at v26 and thrown out of date by
  this work - it now pins the organic layout: coverage fractions, no lattice period, no frame, both
  sides dressed, canopy spacing, the far ring, the fountain, Morocc's far dressing, and the ten
  identities), ui 13, sprite 10, starter 4. Inline game JS passes `node --check`.
* **Branches / PR:** `arena/01a1057c-prontera-grind` — https://github.com/KzeR7/Prontera-Grind/pull/12
* **Known limits / follow-ups:**
  * `kitEdge()` is unused by every recipe (that is the owner's call, not an oversight) - if a map
    ever wants a wild rocky border again, add `edge:{at,amp,s,...}` to its recipe and the test will
    start judging it for raggedness.
  * The fountain is composed from crops: a pool tile, a limestone curb, four stone posts and a
    plinth. It reads as a fountain basin from the arena camera; a real fountain crop would be
    better and is a job for the art pipeline, not the game.
  * The battle field is still `BX_` 5.5 wide; the owner wants to grow it later. The maps are now
    deliberately open, but widening the lane is a balance change (spawn band, AGGRO, camera) and
    was not touched here.
  * Prontera's old block town is still in `index.html` as the fallback if the kit cannot load, and
    still has no test of its own; `scene_sim.js` covers the fallback scenery path, not the town.

### 2026-10-04 — `kit-v28 stage-variants three-packs`

* **What changed for the player:** each map now has four visual stage bands. Stages 1–3 keep
  their existing recipe and kit artwork. Stages 4–6 add that map's first set of painted
  clearings and kit props; stages 7–9 switch to a stronger set of markings and landmarks.
  Stage 10 has its own large boss altar with a contrasting centre, outer ring and sentinels.
  All ten maps use their own palette, and switching stages rebuilds the scene immediately.
* **Combat field:** expanded from 11×17 to **26×40** world units, with wider shadow coverage.
  Three separated packs spawn together. The player and pets fight only pack 1, move to pack 2
  and then pack 3, and repeat from pack 1 when all are cleared. Sleeping packs cannot chase or
  hit the player; area and chain skills cannot reach across packs. Stage 10 still summons its
  lone boss after 15 kills, now on the marked altar. Starter fights still have only one or two
  monsters per encounter (three separated encounters); loot, boss rewards and unlock rules
  are unchanged. The town fallback was moved behind the larger arena.
* **Files touched:** `index.html` (arena, spawn/target loop, stage kit treatment, build tag),
  `tools/tests/{starter,kit,scene,save_load,skill}_sim.js`, `tools/preview/dump_plans.js`,
  `READ-ME-FIRST.md`, `AGENTS.md`.
* **Art:** no new sprite sheet, pixels, recolouring or substitute art. The three later bands
  reuse the existing painted kit tiles and billboards. The stage 1–3 layouts are left intact,
  except that scenery in the newly enlarged running lane moves to the safe edge (and Izlude's
  pier moves with its posts); no placed sprite is deleted. The old atlas and class sprites are
  untouched.
* **Tests:** all 13 suites green — pack 19 bodies, class change 22, save/load 10, economy 21,
  stat 7, card 13, skills **49**, gear 20, scene 8, kit **34**, ui 13, sprite 10, starter **7**.
  Kit tests cover the four stage bands on all ten maps and restored original layouts; skill tests
  exercise an area hit when the target switches mid-cast; starter
  tests execute real spawn and kill transitions, starter damage budgets, pack spacing, isolation,
  and boss placement. Inline game JavaScript passes `node --check`; the stage layouts were
  previewed top-down with the kit's own tile crops.
* **Known limits / follow-ups:** movement across the bigger field changes real kills/hour.
  The economy's 800 kills/hour pacing remains a model assumption, so time-to-job-change needs
  a real playtest before retuning the EXP curve. The new boss altar uses arranged existing
  crops, not a purpose-made boss-arena sprite.

### 2026-10-04 — `kit-v29 themed-scenes roaming-packs` (owner feedback on v28)

* **What changed for the player:** the stage 4–6 and 7–9 spawn pads and the stage 10 boss
  floor disc/ring added in v28 are **removed**. They were not the requested variation. Each
  of the ten maps now has three genuinely new layouts alongside its unchanged stage 1–3
  layout: new paths/water where the biome calls for them, different vegetation and distinct
  landmarks using the same kit crops. Boss stages have map-native landmark pairs framing the
  fight instead of anything painted on the floor. Morocc's original attached design remains
  on stages 1–3; later stages use different desert and ruin designs. No sprite was painted,
  recoloured, borrowed from another game or replaced.
* **Combat:** packs reroll on each respawn in the open battle area rather than staying on
  three marked positions. Their sites are roughly **9.5–15.5 units apart** (previously ~18–23),
  avoid water, and remain isolated. The player begins with the nearest pack to their current
  position; after that pack falls, the nearest *surviving* pack is chosen. No fixed 1–2–3
  route. Pets, area skills and chained hits remain limited to the active pack. The three-pack
  count, 15-kill boss, arena dimensions, rewards and save format are unchanged.
* **Files touched:** `index.html`, `tools/tests/{starter,kit,save_load}_sim.js`,
  `tools/preview/dump_plans.js`, `READ-ME-FIRST.md`, `AGENTS.md`.
* **Tests:** all 13 suites green — pack 19 bodies, class change 22, save/load 10, economy 21,
  stat 7, card 13, skill 49, gear 20, scene 8, kit 34, ui 13, sprite 10, starter 7.
  Kit tests compare all four complete scenes for every map and ban the v28 floor overlays;
  starter tests reroll hundreds of waves, check separation and dry sites, and execute the
  real nearest-pack selection and kill transition. Inline game JS passes `node --check`.
  The new plans were rendered top-down for visual review using the original kit atlas.
* **Known limit:** travel is shorter than v28, but the economy's 800-kills/hour assumption
  still needs a real gameplay measurement before any pacing retune. The boss-field landmarks
  use existing kit art rather than a custom boss sprite.

### 2026-10-04 — `kit-v30 pack-spacing smaller-mobs`

* **What changed for the player:** the three randomized pack sites are now **13–18.5
  units apart**: halfway between v28's distant fixed positions and v29's close
  9.5–15.5-unit rerolls. They still avoid water and engage by nearest pack, not number.
  Ordinary monsters are visibly smaller than the hero: **Fabre ~1.32 vs hero 2.92
  world units, Poring ~1.96 vs hero 2.92**. All regular mobs (including those with a
  Large size label) are below the hero's height. Bosses keep their exact previous
  on-screen scale — none were reduced.
* **Files touched:** `index.html` (pack spacing, shared regular-mob visual scale, `BUILD`),
  `tools/tests/{sprite,starter}_sim.js`, `AGENTS.md`, `READ-ME-FIRST.md`.
* **Art and combat:** no sprite source, packed atlas or kit art changed. Both official
  sprite routes (GPU and DOM fallback) follow the new scale. Monster hitboxes, aggro,
  rewards, HP and all boss dimensions are unchanged.
* **Tests:** all 13 suites green — pack 19 bodies, class change 22, save/load 10,
  economy 21, stat 7, card 13, skill 49, gear 20, scene 8, kit 34, ui 13,
  **sprite 11**, starter 7. New assertions pin Fabre/Poring's player-relative heights,
  every regular monster below the hero, unchanged boss height, and both sprite paths;
  spacing tests check the midpoint limits on repeated dry-site rolls. Inline game
  JavaScript passes `node --check`.
* **Known limit:** Divine Pride's PNGs have varied transparent margins; heights are based
  on rendered frames, and a visual pass in the live preview is still useful to judge
  individual silhouettes. The change is not a hitbox or balance change.

### 2026-10-04 — `ui-v31 levels rates boss-escorts`

* **What changed for the player:** the HP bar is modern green above 30% and red at or below
  30%. Full-width Job Level and Base Level progress bars sit at the bottom; hover or focus
  either for its exact percentage. Hover or focus Zeny to see *earned* Zeny/min, including
  quest and sale income but not purchases or GM grants. Kills/min refreshes every 30 seconds
  (hover it for kills/sec). The rates reset on login or a new adventure.
* **Stage 10:** the boss is present from the first spawn with three ordinary escorts on the
  first five maps and five on the last five. They engage together. Killing the boss clears
  the wave, and the next wave again includes the boss; no 15-kill gate remains. Normal
  stages still have randomized, nearest-selected three packs. The larger arena and all
  scene art, mob visual sizes, rewards, save data and boss scale are unchanged.
* **Files touched:** `index.html`, `tools/tests/{starter,economy,skill,ui}_sim.js`,
  `READ-ME-FIRST.md`, `AGENTS.md`. `BUILD` is now ui-v31.
* **Checks:** all 13 suites green (pack 19 bodies; class change 22; save/load 10;
  economy 21; stat 7; card 13; skill 49; gear 20; scene 8; kit 34; ui 14;
  sprite 11; starter 7). Inline JavaScript passes `node --check`; diff is clean.
* **Balance caveat:** `tools/tune_pacing.js` and `economy_sim.js` still use the old
  one-boss-per-15-kills model for their pacing projections. Those historical time and
  income estimates are **not** predictions for this new Stage-10 encounter. Re-measure
  kills/hour and boss-wave duration before retuning, rather than extrapolating the old
  800-kills/hour model. No in-browser visual playtest was run.

### 2026-10-04 — `ui-v32 split-exp live-rates` (owner correction to v31)

* **What changed for the player:** corrected the bottom XP dock from two stacked full-width
  bars to **one full-width bar split exactly in half**, as requested and informed by the
  left-Base/right-Job bottom-bar arrangement in Ragnarok X screenshots. Base occupies the
  left half and fills rightward; Job occupies the right half and fills leftward. Each
  half has a centered percentage, a level label, and its own hover/focus details; on
  narrow screens the labels sit above the percentages in the same single bar.
* **Rates:** the Zeny/min tooltip and Kills/min display now refresh once a second using
  events in the last 60 seconds rather than holding kill rate for 30 seconds. If the
  browser stops updating for more than 30 seconds (e.g. a 10-minute hang), the old
  samples and any aggregate delta during the stall are discarded, so resuming cannot
  display a huge, misleading per-minute rate. The next observed kills/credits start
  a fresh window. Early-window values are extrapolated to per-minute units.
* **Files touched:** `index.html` (`BUILD` ui-v32), `tools/tests/ui_sim.js`,
  `READ-ME-FIRST.md`, `AGENTS.md`. Stage-10 encounter, HP threshold, save format and
  battle/map visuals are unchanged.
* **Tests:** all 13 suites pass (ui 14), plus inline script `node --check` and
  `git diff --check`. UI tests cover fill direction/centering, per-second updates,
  a 60-second rolling window, and a 10-minute stalled frame gap. No in-browser
  automated screenshot comparison was available.

### 2026-10-04 — `combat-v33 hit-fx pet-sprites`

* **What changed for the player:** the combined bottom XP bar is slimmer: 14px high on
  desktop, 22px on small screens, with less dock padding. Active skills, First Aid and
  timed self-buffs show a name tag anchored above the moving hero for the short cast.
  Outgoing hits are gold with a dark RO-style outline; critical numbers sit on a jagged
  red burst inspired by the user's example. Incoming damage is red; miss/loot/level
  messages keep their own styles. Combat values and critical chance are not changed.
* **Pets:** all eight already have verified Divine Pride monster IDs in `PETS`, so no
  new invented art is needed. Field pets now pass through the same official PNG WebGL
  texture and HTML image fallback path as the mobs, instead of always using the
  procedural critter. Every pet, including Baphomet Jr. and Angeling, renders at a
  fixed small scale of .42 (~1.28 world units high against a 2.92-unit hero);
  mutations do not tint the official sprite. Existing procedural art is shown if the
  remote PNG is unavailable. Deactivating pets removes their mesh and HTML image.
* **Files touched:** `index.html` (`BUILD` v33), `tools/tests/{ui,skill,sprite}_sim.js`,
  `READ-ME-FIRST.md`, `AGENTS.md`. Save data, pet damage, mob and boss visual scales,
  Stage-10 encounter and map designs are unchanged.
* **Verification:** all 13 suites pass (ui 15, sprite 12); the inline script passes
  `node --check` and `git diff --check` is clean. UI tests execute the critical-hit
  routing and hero-anchored labels; sprite tests build all eight pet visuals using
  their real IDs and check both rendering paths and size. The Divine Pride CDN was
  unreachable from this sandbox, so live image availability and appearance still
  need visual confirmation in the browser preview.

### 2026-10-04 — `ui-v34 affix-rarity bag-popup damage-short pet-audit`

* **What changed for the player:** the owner's seven-item list, in order.
  * **Combat numbers are shorter.** Floating damage reads `100K` instead of `100,000` and `1M`
    instead of `1,000,000`; normal, critical and incoming damage all use the same rule. A new
    **Settings → Damage numbers** row switches between `Short · 100K / 1M` (the default) and
    `Full · 100,000`, and the choice is saved with the account.
  * **Stage buttons lost their job-tier label.** The small "novice / 1st job / 2nd job / boss"
    text under Stage 1-10 is gone, and the stage header no longer says "— 1st-job gear". The
    drop tables and item cards still name their gear section, as the owner asked.
  * **Clicking an equipment slot now pops the bag out over the panel.** The whole bag renders as
    the familiar tile grid: everything that fits that slot is ringed green and equips on click,
    everything that cannot go there is greyed out and inert, and the tiles keep their hover
    tooltips. The card under the paper doll (worn item, refine, card slots, Unequip) is unchanged.
  * **Gear rarity is fixed by where it drops; only the affixes roll.** One glance at a map tells
    you the band: maps 1-2 Common, 3-4 Fine, 5-6 Rare, 7-10 Epic; stages 8-9 step one band up; no
    regular drop is ever Legendary, and **every Stage 10 boss drop is Legendary** - so Abyss Dark
    Lord gear from the boss is all Legendary with random affixes. The map panel prints the band
    on every drop line ("Common", "Rare"...) and item tooltips now label their random stats
    "Affixes (n random)". Luck no longer nudges the rarity roll (there is no roll left to nudge);
    it still lifts the drop odds.
  * **The bag holds 1000 items** (`n/1000` in the panel). At capacity, loot is refused, reported
    and left on the ground instead of quietly growing the save; cards live in their own bag and
    are not capped. **Selling is pocket money now**: roughly 50z for a Common starter piece and
    under 2,000z even for the best Legendary Abyss gear, so a bag dump never funds an upgrade.
  * **Auto cast moved to where the skill is explained.** The checkbox is no longer on the skill
    tile; it sits in the skill description card below the grid ("Auto cast this skill", with a
    line saying whether it is live or paused).
* **Pet audit (the owner asked for the data and whether a maxed pet is overpowered).**
  `tools/tests/pet_sim.js` prints the whole set and measures it. Roster: 8 pets, two per rarity -
  Common Poring/Lunatic (x.2 damage), Rare Wolf/Desert Wolf (x.32), Epic Peco Peco/Dragon Whelp
  (x.55), Legendary Baphomet Jr./Angeling (x1). Mutation grades G1-G6 = x2/4/6/8/20/40, rolled at
  2,500-10,000z. Three training pieces, five tiers (Wooden -> Mythril) at 40/25/15/9/5% success,
  5% double-ups, 1,200-30,000z per roll: Claw +12%/tier damage, Collar +8%/tier speed, Charm
  +6%/tier crit (x2). Six equally weighted skills: War Cry and Arcane Blessing (+20% ATK/MATK for
  8s, 26s cooldown), Flame Burst and Thunderclap (1.6x / 1.4x pet damage to everything within 4
  units, 14s/12s), Piercing Fang and Spirit Bolt (2.2x / 2.5x single target, 10s/11s).
  **Measured:** a maxed G6 Legendary pet with Mythril 5/5/5 deals ~2.2M per hit and ~3.4M DPS
  against an endgame Lord Knight's ~377k auto-attack DPS - **9.0x the owner's plain swings, 0.45x
  a fully maxed skill rotation, 1.34x that player with three pets out**; one pet alone kills an
  Abyss Stage-10 boss (658k HP) in ~0.2s, and even the weakest maxed pet (Poring) is 1.4x the
  player's auto-attacks. Because `petDmg` is a flat multiplier on `atk()`, that ratio is the same
  at level 1 and level 150 - a maxed pet carries a fresh character exactly as hard as a maxed
  one. **Verdict: yes, pets are overpowered as a sidekick; no pet number was changed in v34** -
  the measurement is the deliverable and the retune is the owner's call (the levers are the
  rarity factors, `MUT`, and Claw's +12%/tier).
* **Files touched:** `index.html` (damage formatting + Settings row, `BAGMAX`, `MAPTIER`/
  `dropTier`, `genGear` rarity, `fieldOf`/`dropTxt` band display, `collect` cap, `sellVal`, the
  bag pop-out (`equipChooser` + CSS), skills panel, map panel labels, `itemMain` affixes, `BUILD`),
  `tools/tests/ui_sim.js` (13 -> 18), `tools/tests/gear_sim.js` (20 -> 23), new
  `tools/tests/pet_sim.js` (8), `READ-ME-FIRST.md` (suite list + pet suite), `AGENTS.md` (the
  fixed-rarity block, the measured-pet numbers, the suite table, this entry).
* **Art:** none. No sheet, atlas or pixel was drawn, traced, recoloured or substituted;
  `Sprite/`, the class pack and `assets/kit/` are untouched and `tools/montage.py` was not run.
* **Tests:** **all 14 suites green** - pack (19 bodies), class_change 22, save_load 10, economy 21,
  stat 7, card 13, skill 49, gear **23**, scene 8, kit 34, ui **18**, sprite 12, starter 7,
  **pet 8**; inline game JS passes `node --check`, `git diff --check` is clean. New coverage: the
  full rarity ladder per map and stage plus "a Legendary field never rolls lower and the affixes
  still differ between two drops", the 50z-2,000z sell window, the 1000-item cap executing the
  real `collect()` (with cards explicitly uncapped), the damage short-form ladder and the full
  switch, the bag pop-out (fitting tiles ringed/clickable, others greyed and inert, no inline
  list left), the stage buttons carrying no job text, and the pet roster/ladder/skill table with
  the maxed-pet measurement printed by the suite.
* **Branches / PR:** `arena/01a10643-prontera-grind` - https://github.com/KzeR7/Prontera-Grind/pull/14
* **Known limits / follow-ups:**
  * **The pet balance question is answered but not acted on** - see the audit above. If the owner
    wants pets pulled back, the cheapest lever that keeps the feel is Claw's +12%/tier and the
    Legendary x1 factor (both are single numbers in `PET_SKILLS`/`petDmg`), then re-run `pet_sim.js`.
  * Rarity being fixed means a field's drops are worth the same band every time, so a Common-band
    map can no longer "get lucky" with an Epic piece. That is the requested behaviour; the
    compensating knob if it ever feels flat is the item `val` spread inside the band (`rnd(.9,1.12)`).
  * The map panel's drop lines are longer by one word per line; on a very narrow phone the
    monster card wraps a little more. Judged acceptable, but worth an eyeball in the preview.
  * Old saves keep the names and rarities of items they already own; the new ladder applies to
    drops from now on. `sellVal()` reprices every item, old ones included.
  * The bag cap is enforced at pickup only: equipping/unequipping swaps items in place, so the
    count cannot exceed `BAGMAX` through normal play, but a save that somehow arrives over the cap
    is not truncated (nothing is deleted behind the owner's back).

### 2026-10-04 — `ui-v35 bag-highlight subtab-reset map-levels luk-drops autocast` **(checkpoint — pet rework still to come)**

* **What changed for the player:** five of the owner's six follow-up notes, delivered while the
  pet rework is agreed.
  * **The map cards show their level range again.** Each card under a map's name printed the word
    "farming" after v26; it now prints the recommended range (`Lv 1-12`, `Lv 90-99`) again, with a
    `●` in front of the map you are standing on.
  * **Reopening a window starts at its first sub-tab.** Status → Equipment used to stay on the
    Equipment sub-tab after the window was closed and reopened; it now opens on **Stats** every
    time (and Inventory opens on **Bag**).
  * **Choosing a slot highlights the real Bag tab instead of popping a list.** Clicking an
    equipment slot on the paper doll now switches to the actual Bag window, with every item that
    fits that slot ringed green and wired to equip on a click and a banner naming the slot, what
    is worn now and the (+N) deltas. Nothing else in the bag is greyed or disabled, so inspecting,
    selling, tooltips, refine and card work all keep behaving normally, and the equipment panel
    keeps the worn item's card under the doll. The separate pop-out window and its CSS are gone.
  * **LUK no longer bends the drop tables.** Drop odds are the field's own numbers again: gear,
    card, ore and pet rolls all use their printed percentages with nothing scaling them. LUK still
    does its real job on the character sheet (crit and the DEX/LUK side of attack).
  * **The Auto cast control moved to the top of the skill description card and got bigger** - a
    14px bold label with a 19px checkbox in its own highlighted row, above the effect text instead
    of below it.
* **Files touched (so far):** `index.html` (`BUILD` v35, the map-card label, `openTab`'s sub-tab
  reset, `ACT.seleq`/`V.bag0`/`equipChooser`/`V.equip`, the kill-loop drop rolls, the skill detail
  card + its CSS), `tools/tests/ui_sim.js` (the equip test now pins the Bag-tab highlight model
  and the map-card level ranges), `tools/tests/gear_sim.js` (drop-loop markers + a new LUK pin),
  `AGENTS.md`.
* **Art:** none; `Sprite/`, the class pack, `assets/kit/` and `tools/montage.py` untouched.
* **Tests:** all 14 suites green at this checkpoint - pack (19 bodies), class_change 22, save_load
  10, economy 21, stat 7, card 13, skill 49, gear **24**, scene 8, kit 34, ui 18, sprite 12,
  starter 7, pet 8; inline game JS passes `node --check`; `git diff --check` clean. New pins: no
  map card may say "farming" and every card carries a level range; a slot click opens the Bag tab
  and resets the sub-tabs on reopen; the bag rings the fitting sword and leaves the rest of the
  bag as ordinary tiles; LUK 0 vs 99 must land the same three gear rolls and the same card gate.
* **Branches / PR:** `arena/01a10643-prontera-grind` (the same branch as the v34 entry above, PR
  https://github.com/KzeR7/Prontera-Grind/pull/14).
* **Known limits / follow-ups:** the pet rework (one maxed pet = one maxed character, two skill
  slots per pet, 7s skill spacing, non-stacking ATK/MATK buffs, two new buffs) is **not in this
  checkpoint** - the build tag already says `pet-rework` for the commit that follows.

### 2026-10-04 — `ui-v35 pet-rework bag-highlight dmg-toggles map-rarity` (follow-up round 2)

* **What changed for the player:** the seven notes from the second follow-up round.
  * **Damage numbers are switchable twice over.** Settings carries a **Show: On / Off** pair that
    hides every floating combat number outright, and next to it the existing **Short (100K / 1M) /
    Full (100,000)** style picker. Defaults are On + Short, both survive a save/load, and old saves
    are repaired to that default. Zeny reward floats follow the same short/full style; `Miss` and
    the floating skill names are never hidden.
  * **The map cards print their level range again.** v26 had replaced the range under a map name
    with the word "farming"; every card now shows `● Lv 1-12` / `Lv 10-24` ... `Lv 90-99` again,
    with the dot marking the map you are standing on.
  * **Reopening a window starts at its first sub-tab.** Status → Equipment used to stick after the
    window was closed and reopened; `openTab` now resets Status to **Stats** and Inventory to
    **Bag** every time it opens.
  * **Choosing a slot highlights the REAL Bag window.** The separate pop-out window is gone: an
    equipment slot click opens the actual Bag tab (evicted by the usual 3-window rule if needed)
    with a banner naming the slot, what is worn and how many bag items fit, every fitting item
    ringed green with a ✓ badge and wired to equip on click. Everything else in the bag stays an
    ordinary tile - inspecting, selling, tooltips, refine and cards all keep working - and the
    equipment panel keeps the worn item's card (stats, refine, card slots, Unequip) under the doll.
  * **LUK is out of the drop tables.** `lk` is gone from the kill loop: gear, card, ore and pet
    odds are the field's own printed percentages again, whatever the character's LUK. LUK still
    feeds ATK (crit and the DEX/LUK stat term) - that is what it is for.
  * **The Auto cast control sits at the TOP of the skill description card and is bigger:** its own
    bordered row with a 14px bold label and a 19px checkbox, above the effect text.
  * **Fixed drop rarity is now MAP-driven.** Rarity comes from the map alone (`MAPTIER`), at every
    stage it has, so a Prontera or Izlude field can never drop Rare or Epic; **only a Stage 10
    boss is Legendary** (on any map), and stages 1-9 never are. The 8-9 step-up is gone, which is
    what the owner was still seeing on low maps. Affixes, refine room and value inside the band
    still roll.
  * **The pet rework** (see the block below): two skill slots, eight gacha skills, one 7s skill
    gap, 30s/60s buffs that never stack with ATK/MATK mutually exclusive, a life-leech and a
    max-HP buff, and a full damage retune so one maxed pet equals one maxed character.
* **The pet model, as shipped:** every pet has TWO skill slots; one 🎲 gacha (`petSkillCost`) fills
  both with two *distinct* skills out of eight equally weighted ones (4 player buffs, 2 AoE, 2
  single-target). A pet may use one skill per **PETGAP** (7s) on top of that skill's own cooldown,
  so two attack skills alternate at most every 7s. Attack skills always beat buffs and the
  strongest ready attack goes first; if every ready skill is a blocked buff the pet says why (once
  per 12s per pet) and swings normally instead. Buff rules: **a buff never stacks** - while one
  copy runs, another pet's cast is ignored, not refreshed - and **ATK and MATK can never run at the
  same time**. All four buffs last **30s on a 60s cooldown**. The new two are **Blood Siphon** (5%
  of the pet's damage heals you) and **Vital Aura** (+20% max HP; the bar is clamped back down when
  it lapses). The HUD draws one chip per active buff with the pet's name and the countdown, and the
  Pets panel spells the rules out. Old saves migrate `p.skill` into slot 1 and reroll to fill both.
* **The pet rebalance (this is the owner's requested target, and it is ASSERTED):** `PETBAL` is the
  single knob. At **2.18** a fully maxed pet (G6 mutation, all three pieces at Mythril 5/5, two
  attack skills) measures **7,610,598 DPS against a maxed character's 7,613,119 DPS rotation =
  1.000x**. Measured side by side on an endgame Lord Knight (ATK 33,987, 4.18 swings/s, 60% crit at
  x3.75): player auto-attack 377,171 DPS, whole maxed rotation 7,613,119 DPS; maxed pets ->
  Poring/Lunatic 1,156,605 (0.15x), Wolf/Desert Wolf 2,007,779 (0.26x), Peco Peco/Dragon Whelp
  3,778,976 (0.50x), Baphomet Jr./Angeling 7,610,598 (1.00x). Three pets at the top = 22.8M DPS.
  A maxed pet hits for 4,741,866 and one alone deletes the 658,173 HP Abyss Stage-10 boss in 0.09s.
  The stepped simulation (120s of the real `petHit()` with crits pinned off) tracks the analytic
  model the balance number is computed from to within 0.3%.
* **Files touched:** `index.html` (`BUILD` v35; the Settings show/format pairs; `numTxt` +
  `damageFloat` gating; the map-card level ranges; `openTab`'s sub-tab reset; `ACT.seleq`/`V.bag0`/
  `equipChooser`; the kill loop's LUK term; `dropTier`/`MAPTIER` comments; the skill detail card +
  its CSS; `petBuff`/`petBuffSrc`/`petNote`, `PETGAP`/`PETBAL`, the 8-skill table, `petSkills`/
  `petBuffWhy`/`petLeech`/`petHit`, `clearPetCd`, `rollPetSkills`, `maxHp`, the buff countdown, the
  load migration, `petDetail`, the `pskill` action, the HUD buff strip + CSS),
  `tools/tests/pet_sim.js` (rewritten: 8 skills, the buff rules, the two measurements, 11 pins),
  `tools/tests/skill_sim.js` (two-slot gacha + combat rules, 50 pins), `tools/tests/ui_sim.js`
  (the slot-click model, both damage toggles, the pet panel, the bars() fixture),
  `tools/tests/gear_sim.js` (map-driven rarity), `tools/tests/save_load_sim.js` (two slots +
  migration), `tools/tests/starter_sim.js` (`numTxt` stub), `AGENTS.md`, `READ-ME-FIRST.md`.
* **Art:** none; `Sprite/`, the class pack, `assets/kit/` and `tools/montage.py` untouched.
* **Tests:** all 14 suites green - pack (19 bodies), class_change 22, save_load 10, economy 21,
  stat 7, card 13, skill **50**, gear **24**, scene 8, kit 34, ui 18, sprite 12, starter 7,
  **pet 11**; inline game JS passes `node --check`; `git diff --check` clean. New pins: no map card
  may say "farming" and every card carries a level range; a slot click opens the Bag tab and a
  reopen resets the sub-tabs; the bag rings the fitting sword and leaves the rest ordinary; LUK 0
  and 99 must land the same three gear rolls and the same card gate; both damage toggles render,
  persist and reach `damageFloat`/`numTxt`; rarity is one band per map for stages 1-9 with bosses
  Legendary; the pet gacha fills two distinct slots and reaches all eight skills; buff no-stacking
  and ATK/MATK exclusivity are enforced *and logged*; the 7s gate holds; attack-first priority
  alternates two attack skills; leech heals exactly 5% and the max-HP cap returns on expiry; and
  **the balance target itself** (maxed pet within 12% of the maxed rotation).
* **Branches / PR:** `arena/01a10643-prontera-grind`, PR
  https://github.com/KzeR7/Prontera-Grind/pull/14 (the same PR as v34/v35).
* **Known limits / follow-ups:** (1) the balance target now makes THREE pets worth three characters
  - that is what "1 max pet = 1 maxed character" implies, so if pets should instead be sidekicks,
  lower `PETBAL` (0.5 = half a character each) and rerun `pet_sim.js`; (2) a gacha can hand a pet
  two buffs and no attack skill (21% of pairs) - deliberate, since support builds are real, but a
  "always at least one attack" guarantee is a one-line change if the owner wants it; (3) the 7s gap
  plus 10-14s attack cooldowns means a pet casts about once per 7s, not twice; (4) the damage
  `Show: Off` switch hides damage floats only - Miss and skill-name labels still appear; (5) the
  `pet-sim` balance pins are tied to the Lord Knight endgame fixture, so a class whose maxed
  rotation differs from 7.61M will show a different pet-vs-character ratio.
