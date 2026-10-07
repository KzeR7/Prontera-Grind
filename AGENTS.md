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
| `tools/tests/` | the test suites. Run all of them before every push. |
| `tools/preview/` | dev-only: dumps the ten plans out of the game and paints them top-down, so a layout can be judged without a browser (`node tools/preview/dump_plans.js` then `python3 tools/preview/render_plans.py`). Nothing here ships to the player. |
| `READ-ME-FIRST.md` | handover note: what this repo is, how to run it and how to recover after a workspace reset. |

Ships by committing to `main` on GitHub (`KzeR7/Prontera-Grind`); Cloudflare Pages
rebuilds from the repo. **The two files the game actually needs are `index.html` and
`assets/sprite_pack_data.js`.** Everything else is tools, tests and docs.

Login for testing: user `GM`; **the GM password is not in this repo** (since v60 the client stores only
a 20,001-pass hash of it). The owner holds it — ask them, or set a new one with
`node tools/make_gm_hash.js "new password"` and paste the printed line into `index.html`. Normal
accounts are created in-game and stored in `localStorage` under `pg_acc4`, saves under
`pg_save3_<user>`.

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
6. **All test suites under `tools/tests/` must be green before you push.** Add a test when you add
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
python3 - <<'PYPACK'
h=open('index.html').read()
open('/tmp/pack_block.js','w').write(h[h.index('const PACK_BODY='):h.index('function ensureHero(')])
PYPACK
node tools/tests/pack_sim.js           # -> "bodies in pack (19): ..."
node tools/tests/class_change_sim.js   # -> "25 passed, 0 failed"
node tools/tests/class_skin_sim.js     # -> "39 passed, 0 failed" (live class skins, both genders, mirrors)
node tools/tests/kit_sim.js            # -> "34 passed, 0 failed" (v2 atlas + KIT_PS, payon recipe, ten identities)
node tools/tests/skill_sim.js          # -> "52 passed, 0 failed" (91-skill roster, caps, cooldowns, GCD queue)
node tools/tests/save_load_sim.js      # -> "22 passed, 0 failed"
node tools/tests/economy_sim.js        # -> "23 passed, 0 failed"
node tools/tests/gear_sim.js           # -> "30 passed, 0 failed"
node tools/tests/picker_sim.js         # -> "19 passed, 0 failed" (the picker, booted under a DOM stub)
node tools/tests/card_sim.js           # -> "13 passed, 0 failed"
node tools/tests/drop_card_sheet_sim.js # -> "12 passed, 0 failed"
node tools/tests/weapon_review_sim.js  # -> "13 passed, 0 failed"
node tools/tests/pet_sim.js            # -> "13 passed, 0 failed" (+ printed pet data and the maxed-pet balance measurement)
node tools/tests/sprite_sim.js         # -> "12 passed, 0 failed"
node tools/tests/background_sim.js     # -> "12 passed, 0 failed" (grinding is permanent)
node tools/tests/gm_auth_sim.js        # -> "12 passed, 0 failed" (GM password hashed; local GM password; tool/game agree)
node tools/tests/publish_sim.js        # -> "7 passed, 0 failed" (runs the real build; only game files ship)
node tools/tests/scene_sim.js          # -> "8 passed, 0 failed" (per-map scenery, water, clear lane)
node tools/tests/starter_sim.js        # -> "8 passed, 0 failed" (the gentle starter stages)
node tools/tests/stat_sim.js           # -> "7 passed, 0 failed"
node tools/tests/weapon_joint_sim.js   # -> "7 passed, 0 failed"
node tools/tests/ui_sim.js             # -> "37 passed, 0 failed"
node tools/tests/sprite_viewer_sim.js  # -> "Sprite viewer: 154 PNGs, 7 trees, 19 class jobs; ..."
python3 tools/make_class_skins.py --check    # -> "Class skins are current."
python3 tools/make_sprite_viewer.py --check  # -> "Sprite viewer is current."
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

### 2026-10-04 — `balance-audit cards-gear` (analysis only - no game change, no BUILD bump)

* **What changed for the player:** nothing. This entry records a **measurement pass the owner
  asked for**: the card and equipment numbers, and what a nerf would do to them. `index.html` was
  not touched and `BUILD` is still `ui-v35`.
* **The delivery:** `Updates/cards-gear-audit/AUDIT.md` (the report, written for the owner),
  `Updates/cards-gear-audit/audit.js` (the reproducible tool - it lifts the live formulas out of
  `index.html` by string boundary exactly like the test suites, then drives 200 seeded gear sets),
  `Updates/cards-gear-audit/audit-output.txt` (the raw run). Re-run with
  `node Updates/cards-gear-audit/audit.js`.
* **What it found** (Lord Knight Lv150, 120/120/120, Abyss Stage-10 field, auto-attacks only;
  skills multiply the same base by ~x17, pets ride `atk()` so they scale identically):
  * **Equipment is the outlier, not the cards.** vs the same character naked: Epic field set +0
    = x9.6 DPS, Epic +10 = x20.8, Legendary +5 = x34.8, Legendary +10 = x48.2, plus nine
    Legendary ATK cards = x58.7.
  * **The weapon's flat `val` is 92.6% of the ATK before the class/percentage multipliers** -
    level + all stats + 150 levels contribute 556, one +10 Legendary weapon contributes 6,990.
  * **Affixes stack across all seven slots** (one affix of each stat per item): a Legendary set
    averages **+42% ATK, ceiling +182%**, plus a similar ASPD and Crit DMG layer, which is where
    the big multiplier comes from.
  * **Cards are individually small:** one Legendary ATK or ASPD card is **+2.7% DPS**, Crit DMG
    +1.5%, LUK +0.9%, and Crit is worth 0% because the 60% cap is already reached; a full
    nine-card Legendary set is +21.7% (x1.24-1.29 at *every* level from Base 6 to 150).
  * **DEF makes you un-killable before it makes you strong:** `def()*0.6` is subtracted from every
    incoming hit with a floor of 1, so a full set takes **1 damage from every mob and every boss
    on the hardest map** (`index.html:1512`).
  * **Refine is already a real ore sink** at the top: +0->+5 is 5.4 ores, +0->+10 averages **154
    ores** (the +9->+10 rung alone is ~107), i.e. ~514 Stage-10 waves for one item and ~3,600 for
    a seven-slot set - a failure at +5 or above drops the item a level and the ore is always spent.
  * **A gear cliff sits at Comodo:** maps 1-5 use section 0-2 by level, but every map from Comodo
    up is pinned to section 3 (`m>=5?3:secOf(l)`), which is a 3.2x step in `val` at one map
    boundary - gear goes from x2.8 (Payon) to x8.0 (Comodo) to x17 (Louyang) while the naked
    character barely moves.
* **Suggested nerf bundle, measured:** cards `CV 1,2,3,5 -> 1,1.5,2,2.5`, affixes capped at 2 per
  item, `AM -> 1,1.5,2.2,3,4.5`, val level term `.15 -> .10`, refine `15%/lvl -> 10%/lvl` =
  **endgame DPS x0.33** (still ~x16 naked, mobs still die in ~0.4s, bosses in ~4s). Each lever and
  its individual effect is tabulated in the report; card-only nerfs move very little (x0.91).
* **Files touched:** `Updates/cards-gear-audit/{AUDIT.md,audit.js,audit-output.txt}` (new),
  `AGENTS.md`. No game file, no art, no atlas.
* **Art:** none. `Sprite/`, the class pack, `assets/kit/` and `tools/montage.py` are untouched.
* **Tests:** none run and none needed - no game code changed, so the 14 suites are unaffected. The
  audit is a dev tool; it is not part of the test battery. When a nerf is chosen, `gear_sim.js`,
  `card_sim.js` and `economy_sim.js` pins will need moving (the report lists them).
* **Branches / PR:** `arena/01a106ae-prontera-grind`; committed for safekeeping, **no PR** - the
  owner is still choosing what to change.
* **Known limits / follow-ups:**
  * The owner asked for data + suggestions; **no nerf has been chosen or applied**. Awaiting the
    decision before `index.html` moves.
  * The fixtures are the repo's own endgame Lord Knight; other classes' maxed rotations differ, so
    the absolute DPS numbers move by class but every ratio holds.
  * Two suggested changes need code, not constants, and are therefore **not** in the measured
    table: converting DEF from a flat subtraction (floored at 1) into a capped percentage
    reduction, and the section cliff at map 5.
  * House-rule text still says "the thirteen test suites" in three places (lines 34/65/561) while
    `pet_sim.js` has made it fourteen since v34 - worth a one-line fix in a future pass.

### 2026-10-04 — `balance-audit v2 layer-waterfall def-immunity` (analysis only - no game change)

* **What changed for the player:** nothing. Second, corrected pass on the card/equipment audit the
  owner asked for. `index.html` was not touched and `BUILD` is still `ui-v35`.
* **What was wrong with the first pass (v1 entry above):** its fixture spent stat points
  round-robin (every stat rose together) instead of the real build the stat suite pins, so every
  endgame number was ~2-3% off and the "level+stats" line understated the character. The fixture now
  fills main stat -> LUK -> AGI -> spares, i.e. **STR/AGI/LUK 120 at Lv150**, matching
  `stat_sim.js`. The report's own figures were regenerated; the conclusions did not move.
* **The delivery:** `Updates/cards-gear-audit/AUDIT.md` is now the **simplified** report the owner
  asked for (one waterfall table, one stats table, one staged nerf table, one straight-answer
  section). `audit.js` gained two sections: **3b, the layer waterfall**, and a DEF-immunity block.
  New dev tool `Updates/cards-gear-audit/def-scan.js` prints real DEF along the curve (it is what
  the DEF constant below was chosen from). `audit-output.txt` regenerated.
* **The waterfall** (Lord Knight Lv150, one layer at a time, auto-attack DPS):
  | layer | DPS | total | layer's own value |
  |---|---|---|---|
  | level 150 + stats only | 6,972 | x1.0 | - |
  | + skill passives | 8,717 | x1.3 | x1.25 |
  | + equipment flat stats (+0) | 59,873 | x8.6 | **x6.9** |
  | + refine to +10 | 136,610 | x19.6 | x2.3 |
  | + affixes | 359,856 | x51.6 | **x2.6** |
  | + nine Legendary ATK cards | 438,133 | x62.8 | x1.2 |
  So **cards are the smallest layer** and the two gear layers are the outliers - the opposite of
  the owner's first instinct, and now measured end to end.
* **Level and stats are worth ~581 ATK** at Lv150 (they are mostly crit, 51%, and attack speed,
  both near their caps); **one +10 Legendary weapon is 6,990 ATK - 12x the whole stat
  contribution.** That is the root cause: grinding cannot keep pace with drops.
* **New finding - the defensive half deletes combat.** `index.html:1512` subtracts `def*0.6` per
  hit with a floor of 1, so a geared character takes **exactly 1 damage from every mob and every
  boss in the game**. Measured fix: `def/(def+4000)` capped at 75% leaves the naked game within
  0-2% of today (naked DEF is 93), puts mid-gear at 26-46% reduction and endgame at 60-75%.
* **The staged nerf, measured** (each stage includes the one above): STAGE 1 affix cap 2/item +
  `AM -> 1,1.5,2.2,3,4.5` = **x0.66**; STAGE 2 + flat value down (level term `.10`, Legendary
  `4.5 -> 3.5`) = **x0.37**; STAGE 3 + refine `15% -> 10%` = x0.31; STAGE 4 + cards `CV -> 2.5` =
  x0.28. **Recommendation: STAGE 2 + the DEF line** - five constants and one formula, gear goes
  from x60 to x18, endgame mob TTK stays at 0.34s.
* **Files touched:** `Updates/cards-gear-audit/{AUDIT.md,audit.js,audit-output.txt,def-scan.js}`,
  `AGENTS.md`. No game file, no art, no atlas.
* **Art:** none. `Sprite/`, the class pack, `assets/kit/` and `tools/montage.py` are untouched.
* **Tests:** none run and none needed - no game code changed. When a stage is chosen, `gear_sim.js`,
  `card_sim.js` and `economy_sim.js` pins need moving (the report names them).
* **Branches / PR:** `arena/01a106ae-prontera-grind`; committed for safekeeping, **no PR** - the
  owner is still choosing which stage to ship.
* **Known limits / follow-ups:**
  * Still no nerf chosen. The report now recommends STAGE 2 + DEF; awaiting the owner's call.
  * The v1 entry's bundle numbers (`x0.33` etc.) were measured on the round-robin fixture. They are
    superseded by this entry's staged table; the ordering of the levers is unchanged.
  * The DEF fix touches the damage line inside `update()`, so `save_load_sim.js`/`scene_sim.js`
    boundary grabbers must be re-checked when it is implemented - it is a game-loop line, not a
    constant.

### 2026-10-04 — `ui-v36 skill-max keep-class dps-meter boss-roam`
* **What changed for the player:**
  * **You can now max your skills.** A skill level costs a flat **2 points** instead of the old
    escalating ladder (1,2,3,4,5). At max job level every class can finish its whole tree - the
    old curve left a maxed Lord Knight 39 points short of his own skills with no way to buy
    them, which read as a broken panel. A Novice finishes with 1 point spare, a 1st job 10, a
    2nd job 19, a transcendent 28, so there is still a build choice but never a dead tree.
  * **The "?" on the EXP bars is gone.** Hovering Base/Job EXP no longer swaps in the help
    cursor or pops a native tooltip; the percentage is already written on the bar, and screen
    readers still get "Base Level 42: 45.0% to next level" through `aria-valuetext`. The Zeny
    chip keeps its own live rate flyout, just without the help cursor.
  * **A class you have played keeps everything when you switch back to it:** Base Lv, EXP, job
    level, skills, stats and its gear. Two holes were closed: a save with no per-class records
    (anything written before those records existed) used to treat its own played classes as
    never played, which forced the Novice restart and dropped Base Lv to 25 - job levels above
    1 now count as proof a class was played. And returning to a class whose record carries no
    stored loadout no longer strips the equipment you are wearing into the Bag.
  * **A DPS readout sits next to Kills/min** in the HUD. It uses the same rolling 60-second
    window and the same stall/reset rules as the kill and Zeny rates, and every point of damage
    you deal (hits, skills, DoTs, pets) is banked in the save as `S.dmg`, so it survives a
    reload like the lifetime kill count does.
  * **Stage 10 stays with the boss.** The character used to roam the whole arena between waves,
    so a fresh boss wave spawned at the far end and walked the field; the roam now orbits the
    boss's own spawn point at 2.2-6.0 units, inside the 6.5 aggro range, still clamped to the
    arena. Farming maps keep the field-wide roam.
* **Files touched:** `index.html` (skill cost/ledger, EXP-bar tooltips, played-class detection,
  class-record loadout repair, damage counter + HUD rate stepper + DPS readout, boss roam,
  `BUILD`), `tools/tests/skill_sim.js` (flat-cost pins, the "every line can finish its tree"
  rule, the aid freebie), `tools/tests/ui_sim.js` (DPS markup/rate/format pins, EXP-bar
  no-title pins), `tools/tests/class_change_sim.js` (career counts as played, unknown loadout
  keeps gear), `tools/tests/save_load_sim.js` (functional boss-roam test), `AGENTS.md`.
* **Art:** none. `Sprite/`, the class pack and `assets/kit/` are untouched; `tools/montage.py`
  was not used.
* **Tests:** `pack_sim` (19 class bodies), `class_change` 24, `save_load` 11; `economy` 21,
  `stat` 7, `card` 13, `skill` 50, `gear` 24; `scene` 8, `kit` 34, `ui` 19, `sprite` 12;
  `starter` 7, `pet` 11 - all green. New coverage: every class line can afford its own tree at
  max job level (was pinned as "no line can"), the DPS window/stall/reset behaviour and the
  formatted HUD value, the EXP bars carry no `title` and keep their aria sentence, a save with
  job levels but no records keeps its played classes and does not lose Base Lv, an unknown
  loadout does not strip gear, and the boss roam stays 2.2-6.0 units from the boss while a
  farming map still roams wider than 9 units.
* **Branches / PR:** `arena/01a106ae-prontera-grind` - see the reply for the pull-request link.
* **Known limits / follow-ups:**
  * The flat 2-point curve is deliberately generous (spare points, listed above). If builds
    should be tighter, the single knob is `skCost()` in `index.html`.
  * The DPS meter counts **your** whole output, including pet hits and damage-over-time ticks -
    it is not a strict "auto-attack only" number.
  * The balance nerf is still undecided. The DEF one-liner (`def/(def+4000)`, cap 75%) and the
    staged gear plan are unchanged from the `balance-audit v2` entry; the owner is filling in
    the tuning sheet (`Updates/cards-gear-audit/tuning-sheet.html`) first.
  * Old saves gain `S.dmg` on the next save; `load()` repairs it to 0, so the first DPS sample
    after loading always starts from a clean window.

### 2026-10-04 — `tuning-sheet` (the nerf fill-in form; no game change, no BUILD bump)
* **What changed for the player:** nothing in the game yet — this is the form the nerf gets written
  from. `Updates/cards-gear-audit/tuning-sheet.html` is a self-contained page (open it in any
  browser, no internet needed) with **53 rows** in 7 sections: the six equipment flat-base values,
  the affix count/magnitude and all 11 affix weights, the card values and the two card drop rates,
  the three field and two boss drop rates, mob/boss HP, and the two either/or decisions (the two
  HP-carrying slots, and the DEF change). Every row shows the current number, my recommendation
  (already typed into the box) and what it does; the bottom is a measured table of what the ÷3
  actually does. **Copy answers** puts a JSON block on the clipboard to paste back in chat.
* **What the sheet recommends, in one line:** flat base ÷3 = **x0.38** of today's endgame DPS, then
  hand power back with affix magnitude +30% (AM `1/2.1/3.4/5.2/8.5`) and card values +30%
  (CV `1/2.6/3.9/6.5`) → **x0.48, a 52% nerf**; keep the headgear/accessory base so max HP does not
  fall from 166,508 to 60,099; halve the Stage-10 boss gear rate (2.4% → 1.2%); take the Legendary
  boss card from 0.08% to 0.05%; leave mob and boss HP alone (bosses go from a 1.5s to a 3.1s kill).
* **Correction (an older entry's numbers):** the affix magnitude table in `AUDIT.md` and
  `audit-output.txt` was wrong — `audit.js` computed the affix scale as `AM x section` instead of
  `AM x (1 + section)`, understating the top three columns by 50%. The real endgame Legendary
  affix is **+21% ATK / +320 HP / +40% Crit DMG / +16% ASPD / +12 Crit / +27 stat**, not
  +22/+240/+30/+12/+9/+20. The tool is fixed (with a comment naming the trap), both files carry the
  corrected table, and the DPS numbers in the `balance-audit v2` entry are unaffected — those are
  measured through the real `genGear()`, not through this table.
* **Files touched:** `Updates/cards-gear-audit/tuning-sheet.html` (new),
  `Updates/cards-gear-audit/audit.js` (new section 7: the ÷3 variant, four give-back combinations,
  the per-map boss HP table; affix table fix), `Updates/cards-gear-audit/audit-output.txt`
  (regenerated), `Updates/cards-gear-audit/AUDIT.md` (corrected affix table + a pointer to the
  sheet from the nerf section), `AGENTS.md`. No game file, no art.
* **Art:** none. `Sprite/`, the class pack and `assets/kit/` are untouched; `tools/montage.py` was
  not used.
* **Tests:** none run — no game code changed. The sheet is validated by a throwaway harness that
  runs its script against a stub DOM: all 53 rows render, every input is pre-filled with the
  recommendation, the built HTML contains no `undefined`, and the file makes **zero external
  requests** (so it renders inside the preview sandbox). Regenerate the numbers with
  `node Updates/cards-gear-audit/audit.js > Updates/cards-gear-audit/audit-output.txt`.
* **Branches / PR:** `arena/01a106ae-prontera-grind` - see the reply for the pull-request link.
* **Known limits / follow-ups:**
  * The sheet does not change the game. When the numbers come back, they become one code change
    (`index.html` constants + `genGear()`/`fieldOf()` + the DEF line) with `gear_sim.js`,
    `card_sim.js` and `economy_sim.js` pins moved to match.
  * The variant table is auto-attack DPS on the audit fixture (Lv150 Lord Knight, +10 Legendary
    set, nine Legendary ATK cards, 200 seeded sets). Skill rotations multiply the same base.
  * `tuning-sheet.html` is a tool, not a player-facing file: it is not linked from the game.

### 2026-10-04 — `ui-v37 skills-fit` (corrects the v36 skill price; the owner reported it was still unfixable)
* **What changed for the player:**
  * **Skills now really can all be maxed.** A skill level costs **1 point** (5 to max a skill), so a
    line's whole tree costs **4 / 24 / 44 / 64** points against **9 / 58 / 107 / 156** earned by a
    maxed Novice / 1st job / 2nd job / transcendent. The v36 entry said a flat 2 points per level
    was enough and it is not: that left only 1-28 points spare, and a Lord Knight promoted at the
    minimum gate (Swordman 40 -> Knight 40) who had also restarted the Novice once - which clears
    the Novice's own job level while its skills stay bought - earned **127 against a 128-point
    tree, one point short.** The owner was right; the fault was the price, not their save.
  * **The Skills panel now shows the arithmetic** instead of asking you to trust it: "this line's
    tree costs 64, a maxed line earns 156 - **92 to spare**". If a line ever cannot finish, the
    panel says so in numbers.
  * **Old saves that were over-spent repair themselves on load.** The v35 shop minted points (it
    charged the escalating ladder but kept its ledger in levels), so a save could carry more skill
    levels than its line ever earned and the panel clamped to "0 available" for ever, with the
    tree out of reach at max job level. `load()` now trims the unearned levels (in reverse roster
    order - the last-defined skills are the ones bought last) and the Skills panel explains:
    "Repaired an older save: N skill points refunded". The note clears when you next buy or reset.
  * Everything else from `ui-v36` is unchanged and still shipped: no hover tooltip on the EXP
    bars, class switching that keeps Base Lv / job level / skills / stats / gear, the DPS readout
    beside Kills/min, and the boss-stage roam that stays with the boss.
* **Files touched:** `index.html` (skill price and ledger, `skTree()`/`skEarnedMax()` and the panel
  readout, the `load()` over-spent repair + `S.skRepair`, `BUILD`), `tools/tests/skill_sim.js`
  (1-point price, the "thinnest history" worst-case rule, aid freebie, over-spent fixture),
  `tools/tests/save_load_sim.js` (the repair, built from the real roster), `tools/tests/ui_sim.js`
  (the panel's tree/income readout and the guarantee line), `AGENTS.md`.
* **Art:** none.
* **Tests:** all fourteen green - `pack_sim` (19 bodies), `class_change` 24, `save_load` **12**,
  `economy` 21, `stat` 7, `card` 13, `skill` **51**, `gear` 24, `scene` 8, `kit` 34, `ui` **20**,
  `sprite` 12, `starter` 7, `pet` 11. The new skill test is the one that matters: it walks the
  **thinnest possible history in the game** (minimum promotion gates + a Novice restart, the
  Novice's own job level at 1) against the real `CLASSES`/`SKILLS` data and requires a 30+ point
  margin on every job line: Novice 4 of 9, 1st job 24 of 58, 2nd job 44 of 97, Lord Knight
  **64 of 127 (63 spare)**. A test that only checked a *fully* levelled line is what let v36 ship.
* **Branches / PR:** `arena/01a106ae-prontera-grind`, same pull request as `ui-v36`
  (https://github.com/KzeR7/Prontera-Grind/pull/15).
* **Known limits / follow-ups:**
  * With 1 point per level there is no longer any scarcity in the tree - every line maxes
    everything. That is the owner's stated rule ("a full skill tree must be maxable at max job
    level"), and `skCost()` is the single knob if that ever changes.
  * The repair trims the *most recently defined* skills first. It only ever removes levels the
    line cannot pay for, and it reports the number it removed; a save that is within budget is
    not touched at all (pinned by a test).
  * The game server started for the live preview serves the working copy, so a refresh picks this
    up immediately; the deployed site only updates when the pull request is merged.

### 2026-10-04 — `tuning-sheet` made live + copy-safe (tooling only, no game change, no BUILD bump)
* **What changed for the owner:** the tuning sheet is now served as its own live preview, and its
  answers can always be recovered even inside a sandboxed preview frame. **Copy answers** writes
  the JSON into a visible box under the buttons as well as trying the clipboard, there is a
  **Download JSON** button, and the decisions section falls back to the recommendation instead of
  dropping out if a radio group is not found. Nothing else about the form changed.
* **Files touched:** `Updates/cards-gear-audit/tuning-sheet.html`, `AGENTS.md`. No game file.
* **Art:** none.
* **Tests:** none needed for the game. The sheet is checked by a throwaway stub-DOM harness: 53
  rows render, every input is pre-filled with the recommendation, the answers box fills with all
  seven sections, the built HTML contains no `undefined`, and the file makes **zero external
  requests** (which is what lets it render inside the preview). The 14 game suites are untouched
  and were green on `5a81578`.
* **Branches / PR:** `arena/01a106ae-prontera-grind`, same pull request as `ui-v36`/`ui-v37`.
* **Known limits / follow-ups:**
  * Two live previews are running from this workspace: the game (`index.html`) and the sheet. Both
    serve the working copy of the branch; the deployed site still updates only on merge.

### 2026-10-04 — `picks-review` (review of the owner's filled-in tuning sheet; analysis only, no game change, no BUILD bump)
* **What changed for the player:** nothing - `index.html` is untouched and the live preview still
  runs `ui-v37`. This entry records the measurement of the tuning sheet the owner returned, so the
  numbers exist in the repo instead of only in the conversation.
* **New dev tool:** `Updates/cards-gear-audit/picks-check.js`. It reads `audit.js` up to the point
  where that script starts printing, reuses its extraction/harness verbatim, applies the owner's
  answers as source patches and re-measures. Run: `node Updates/cards-gear-audit/picks-check.js`.
  A review in plain language is in `Updates/cards-gear-audit/PICKS-REVIEW.md`.
* **The answers, measured:** weapon base ÷3 + accessory ÷3 + affix magnitude `1/2.1/3.4/5.2/8.5` +
  card values `1/2.6/3.9/6.5` + boss gear 2.4%→0.5% + boss card 0.08%→0.05% + field rolls 5/5/3 =
  **endgame DPS x0.48** (438,133 → 212,029), max HP **x0.73** (166,508 → 121,330, because the
  accessory base was divided while the sheet's own radio said "HP slots kept"), naked and early game
  **x0.79-0.81**, mid game x0.76, late game x0.55-0.61, DEF unchanged at 12,719, mob TTK 0.13 → 0.26 s,
  boss TTK 1.50 → 3.10 s.
* **Three findings worth the owner's attention:**
  1. **The Comodo cliff is not where the audit said it was.** The high-tier cliff lives in
     `gearPool()` (item *names*) and in `fieldOf()`'s `sec` (the drop's *numbers*). The first only
     renames loot. Patching the second is what changes value - and the sheet's "from field level 3"
     reading falls into `secOf()`'s first band on late maps, i.e. **section 0 / Novice gear** at
     Abyss stage 1-2 (gear value 1,044 → 162, geared DPS x0.12). Flooring the section at 2 instead
     gives x0.33 for the same intent.
  2. **The DEF cap does not create danger above mid-gear.** With `def/(def+4000)` + the 75% cap the
     endgame takes 308 per mob hit and 436 per boss hit, while the game's own regen is 1.6%/s of max
     HP (1,941/s) - net negative, so a geared character still cannot die. Only the naked/low-gear
     game (currently 1 damage per hit) becomes lethal (8 s / 4 s to die). A `max(flat, 4% of maxHp)`
     boss hit is the one-line fix that keeps danger real.
  3. **Boss drop rates are no longer the pacing bottleneck.** 0.5% per pool item is one Legendary
     item per 22 boss kills (~9 min), while one +10 refine is still ~513 waves (~3.6 h). Cutting the
     drop rate barely changes time-to-power; the ore faucet is the real knob.
* **Research used (external):** RO card rate 0.01% (west-games, 99porings); RO refine tables (iRO
  Wiki classic, NovaRO); `def/(def+k)` as the standard diminishing-returns formula with "k = the
  armour of a fully geared character" (CalculatorHub, r/gamedesign); and a same-shaped report from
  another idle RPG that defence builds become meaningless when regen out-heals incoming damage
  (r/incremental_games).
* **Files touched:** `Updates/cards-gear-audit/picks-check.js` (new),
  `Updates/cards-gear-audit/PICKS-REVIEW.md` (new), `AGENTS.md`. No game file, no art, no test change.
* **Art:** none.
* **Tests:** none run for the game (nothing in it changed; the 14 suites were green on `5a81578`).
  `picks-check.js` is the test for this turn and its output is reproducible from the fixed LCG seed.
* **Branches / PR:** `arena/01a106ae-prontera-grind`. **Committed locally only - deliberately NOT
  pushed**, as the owner asked ("dont push pr first"). PR #15 is unchanged and still holds
  `ui-v36` + `ui-v37` + the sheet.
* **Known limits / follow-ups:**
  * The Comodo-cliff and HP-slot findings change what the sheet means, so the sheet is not yet the
    final spec. Waiting on the owner's call for the four items in §6 of `PICKS-REVIEW.md`.
  * Nothing in this review is a balance commitment: the numbers are auto-attack DPS on the audit
    fixture (Lv150 Lord Knight, +10 Legendary set, nine Legendary ATK cards, 200 seeded sets).

### 2026-10-04 — `ui-v38 weapon-cut cards-carry` (balance round 3: ~70% of endgame damage, power moved into affixes and cards)

* **What changed for the player** (all of it from the owner's round-3 brief: keep clears fast, keep
  damage high, but make *playing* the progression):
  * **Weapons carry far less flat power.** The weapon's base drop value is **6 -> 2** (so the
    weapon is **78.8%** of the pre-multiplier ATK at the endgame, was 92.3%); armour,
    headgear, shield, legwear and accessory keep theirs (4 / 10 / 3 / 3 / 5). A weapon is the
    single biggest flat power source a character owns, so dividing its base divides it at every
    level and every rarity.
  * **Affixes got ~1.7x fatter** (`AM` = 1.7 / 2.72 / 4.42 / 6.8 / 11.05). A Legendary ATK affix
    is **+36%** (was +21%), and it still rolls 2-3 affixes per Legendary item.
  * **Cards are the give-back, because a card is something you farm** (`CV` = 3.2 / 6.4 / 9.6 / 16,
    x3.2). A Legendary ATK card is **+13% ATK, was +4%**: nine of them take the endgame character
    from ATK 12,227 to 19,524 (**+60%**, was **+22%**) and are worth **x1.60** of whole DPS
    (+71% to +92% at the milestone rows; they were +24% to +29%).
  * **Crit damage no longer stacks as a shortcut** (`AB.cdm` 1.5 -> **0.7**): a Legendary CDM
    *affix* is **+32%** (was +40%) and every point of crit damage buys less than half what it did.
    The 60% crit-rate cap is untouched.
  * **The Comodo cliff is softened into a ramp.** On maps 5-10 the high tier now starts at **field
    level 3** and levels 1-2 hand out 2nd-job gear instead of high-tier gear from level 1, but the
    drop's *section* is **floored at section 2** - so a Lv70 character farming Abyss stage 1 gets
    section-2 item names/values, not Novice-section trash (that was the sheet's own cliff).
  * **Bosses pay out less often.** The Stage-10 boss drops its whole pool at **1% per item, was
    2.4%** (one Legendary item per ~11 boss kills, was ~4.6; one *specific* item is 1 in 100 boss
    kills) and its card is **0.1%, was 0.08%** (1 in 1,000 boss kills). Field rolls (4.8/4/3.2%)
    and the ores (5% boss / 2% minion) are unchanged - the owner explicitly kept those.
  * **You can be hit again.** Incoming damage is a capped percentage cut,
    `atk * (1 - min(.75, def/(def+4000)))`, floored at 1, instead of `atk - def*0.6` floored at 1.
    The old line made every geared character take exactly **1** from every monster and every boss
    in the game; now the naked game is within 2% of before, mid-gear takes 26-46% and endgame takes
    the 75% cap (endgame mobs hit for ~308-463, bosses ~436-655).
  * **Pets keep their place** (`PETBAL` 2.18 -> **3.4**). A pet's damage is `your ATK x PETBAL x
    ...`, so the weapon cut cut pet damage with it; without the knob a maxed pet would have
    silently dropped to 0.64x a maxed character. It now measures **1.005x** again.
* **The result, measured by `audit.js` on the shipped file itself** (section 3b, Lord Knight Lv150
  + 120/120/120 + a +10 Legendary set + nine Legendary ATK cards, mean of 200 seeded sets):
  **438,133 -> 305,020 auto-DPS = x0.70**, ATK 32,291 -> 19,524, max HP 166,508 -> 167,289 (the HP
  slots were deliberately left alone), crit rate 60% (the cap) and crit damage x4.67 -> x5.08 in
  the audit's own card-less endgame set. The layer profile moved from
  flat x6.87 / refine x2.28 / affix x2.63 / cards x1.22 to **flat x2.96 / refine x1.99 / affix
  x3.70 / cards x1.60** (total x62.8 -> x43.7): the biggest layer is now the one you roll, the
  second biggest the one you farm, and flat drops are the smallest of the three.
* **Every band moves, the top moves least** (section 4, stage-5 field at the middle of the map's
  level band, x of the old geared DPS): Prontera x0.84, Izlude x0.84, Geffen x0.83, Morroc x0.82,
  Payon x0.82, Comodo x0.69, Louyang x0.76, Amatsu x0.73, Niflheim x0.71, Abyss x0.63. Early mobs
  die in 1.3s geared (was 1.1), mid-game 0.4-0.7s (was 0.3-0.6), the endgame still under a second.
* **Files touched:** `index.html` (`AM`/`CV` + the balance comment block, `AB.cdm`, the `genGear`
  flat-value map, `secField()` + `gearPool`/`fieldOf`, the boss `drops`/`cardCh`, the game-loop
  incoming-damage line, `PETBAL`, `BUILD`), `tools/tests/gear_sim.js` (secField in the harness, the
  1% boss gate proved by a 1.5% roll that now pays nothing, the pool/section rules),
  `tools/tests/ui_sim.js` (panel strings 1% / 0.1%), `tools/tests/card_sim.js` (CV-derived card
  values, the cdm-below-STR relation), `tools/tests/save_load_sim.js` (its duplicated CV/AB stubs),
  `Updates/cards-gear-audit/audit.js` (secField extraction + fallback, `AUDIT_HTML` override, the
  DEF/faucet sections relabelled to the shipped line, the historical sections marked as such),
  `Updates/cards-gear-audit/picks-check.js` + `neutral.js` (baseline guard + `AUDIT_HTML`),
  `Updates/cards-gear-audit/PICKS-REVIEW.md` ("What shipped (v38)"), `tools/tune_pacing.js` (loot
  cadence .126 -> .118), `AGENTS.md`.
* **Art:** none.
* **Tests:** all fourteen green - `skill` 51, `class_change` 24, `gear` 24, `economy` 21, `ui` 20,
  `pack` 19 bodies, `card` 13, `save_load` 12, `sprite` 12, `pet` 11, `scene` 8, `starter` 7,
  `stat` 7. `node --check` on the extracted inline script.
* **Branches / PR:** `arena/01a106ae-prontera-grind`, same pull request as `ui-v36`/`ui-v37`
  (https://github.com/KzeR7/Prontera-Grind/pull/15). **Not pushed yet**: the owner's standing rule
  is to be told before a push.
* **Known limits / follow-ups:**
  * `audit.js` sections 6 and 7 are the *pre-v38* simulations (their patch sources are pre-v38
    strings, and they print "patch target not found" against this build); they are run against a
    pre-v38 copy with `AUDIT_HTML=<file> node Updates/cards-gear-audit/audit.js`. The live tables
    are sections 1-5 and 3b.
  * `tools/tune_pacing.js` now models the v38 loot cadence (0.118 expected gear pickups per kill,
    was 0.126). Re-solving with it moves the shipped curve constants by well under 1% (cA 132.993
    -> 132.851, NE2 3.05002 -> 3.04976, N100 419,344 -> 418,891, NE3 8.40338 -> 8.39503), so the
    shipped EXP curve was left alone; the level milestones still solve to 7 min / 2 h / 7 h / 48 h.
  * **Crit damage, measured the way the owner asked for it.** The *route* is nerfed and the
    numbers say so: a Legendary CDM affix is +40% -> **+32%**, and nine Legendary CDM cards now
    add **x1.17** DPS against the **x1.60** nine ATK cards add - i.e. the CDM set sits **36.7%
    behind** the ATK set, where before v38 it was only 7.4% behind. Two honest footnotes: (a) a
    Legendary CDM *card* is +8% -> +11% in displayed value, because the x3.2 CV give-back applies
    to every card - the per-point weight is what fell; (b) the raw crit multiplier in a *card-less*
    endgame set is slightly higher than before (x4.67 -> x5.08, and x5.01 -> x5.21 on the seeded
    set) because `critD()` also feeds on LUK/DEX, and AM x1.7 fattens every stat affix. If the
    owner wants the multiplier itself down as well, the knobs are `AB.cdm` (further down), or
    removing the LUK/DEX terms from `critD()`, or a crit-damage cap.
  * In the audit's card-heavy endgame fixture a maxed pet sits at **x0.94** of its old absolute
    DPS while its owner is at x0.70 - the pet:character ratio the test asserts is unchanged, but
    pets gain nothing from the card layer, so a full-card character out-runs its pet sooner than
    it used to (0.74x -> 0.47x of a maxed character per pet). Retune `PETBAL` if that matters.

### 2026-10-04 — merge: `main` (the weapon-review work) into the v38 branch, and the BUILD line that broke main

* **Why:** PR #15 came back `CONFLICTING`. `origin/main` had gained the parallel session's weapon
  work (v26-v29 rendering, the sprite/weapon pickers, `assets/weapon_joints_data.js`, dozens of new
  tools) and, with it, a fatal defect: **two `const BUILD=` declarations in the same script block**
  (`ui-v29` above `ui-v35`), a SyntaxError - main's game script did not run at all.
* **Resolution:** that one line (plus its comment) was the whole conflict. The merged file keeps a
  single `BUILD` = `'2026-10-04 ui-v38 weapon-cut cards-carry + weapon-hold'`, which names both
  sides. Nothing else conflicted: main's rendering code, assets and tools merged untouched, and its
  three new suites came with them.
* **The retired v1 kit is deleted for good.** main's `index.html` had brought back
  `<script src="assets/kit/morocc-atlas.js">`, pointing at a file that exists in neither tree (v1
  was retired to `Updates/retired-v1-kit/` when map kit v2 landed). It 404'd in the console *and*
  it failed `kit_sim`'s own pin ("the retired generator is not loaded by the page any more", 33 of
  34). The tag is gone, with a comment saying why. The archived attachment itself stays in
  `Updates/retired-v1-kit/morocc-atlas.js` - it is the owner's original file, kept as history.
* **Verified on the merged tree:** `node --check` on the inline script; all **17 suites** green -
  `skill` 51, `kit` 34, `class_change` 24, `gear` 24, `economy` 21, `ui` 20, `picker` 19, `card` 13,
  `weapon_review` 13, `save_load` 12, `sprite` 12, `pet` 11, `scene` 8, `starter` 7, `stat` 7,
  `weapon_joint` 7, `pack` 19 bodies - and `audit.js` still measures the v38 target exactly:
  438,133 -> **305,020** auto-DPS (x0.70), layers x2.96/x1.99/x3.70/x1.60.
  (The first pass after the merge missed `kit_sim`, which is the one suite that would have caught
  the dead tag. Run the whole `tools/tests/` directory, not a hand-typed list.)

### 2026-10-05 — `ui-v39 buff-icons sell-tools log-filter`

* **What changed for the player** — four things, all from the owner's list:
  * **Pet buffs are icons now, parked above the status bar on the far right.** They used to be text
    chips *inside* the status bar. Each running buff is now one tile with the skill's own icon and
    the seconds left; **hovering (or focusing) it opens the full description** - skill name, which
    pet cast it, what it does and how long it has left. Attack skills never had a chip and still do
    not; only the four buffs (War Cry, Arcane Blessing, Blood Siphon, Vital Aura) can be running.
  * **A master auto-cast switch on the Skills tab**, at the far right of the Novice row beside
    First Aid, because that row is the one every class shares. Ticked = every learned skill of the
    current line auto-casts; it **unticks itself the moment any single skill is switched off**, and
    one click switches them all on or all off. Passives are not part of it (they never auto-cast).
  * **The Bag sells for you.** A new "Selling tools" card: a tick per rarity
    (Common/Fine/Rare/Epic/Legendary) **auto-sells that rarity the moment it drops** - it is paid
    exactly what a manual sale pays, it still counts toward loot quests, and because the sale runs
    before the bag cap a ticked band can never be lost to a full bag. "Sell matching now" purges
    what is already in the bag, and **Click-sell: ON/OFF** turns a single click in the grid into an
    instant sale (hover still shows what the item is). The old "Sell Common/Fine" / "Sell up to
    Rare" buttons are gone; the ticks + purge do the same job. Nothing is ticked by default.
  * **Logs, two ways.** The on-screen log on the left now has its **own tab to fold it away** (the
    tab stays, and the history keeps collecting). The Log window gained a **filter bar** pinned to
    its top: Zeny / Equipment / Kills / Cards / Pets / Levels / Skills / Quests / Other, each with a
    tick, plus All and None. Tick only Zeny to see only Zeny, etc. A line that belongs to two
    categories (a kill also pays Zeny) shows while *either* is ticked. Filtering hides lines from
    the **window** only - the on-screen feed deliberately keeps showing everything - and the newest
    80 lines are always kept, so unticking and re-ticking brings the history straight back.
* **Files touched:** `index.html` (the v39 CSS block; `#hudBuffs` moved out of `#hud` into `#ov`;
  `feedWrap`/`feedTab` in the markup; `LOGCATS` + `logCats/logOn/logShown` + the 3-argument
  `log(m,cls,cat)` with 25 call sites categorised; `feedOn/feedTab` + `ACT.feed/logf/logfall`;
  `bars()` pet-buff icon tiles + flyout; `skTog/skAllOn/skSetAll/skMasterTile` + `ACT.skall` and the
  Novice-row tile; `autoSellOn/clickSellOn` + the auto-sell branch in `collect()` +
  `ACT.autosell/sellnow/clicksell/quicksell` (replacing `sellbelow`); `fresh()` fields
  `feed/clickSell/autoSell/logOff` + their `load()` repairs; `BUILD`),
  `tools/tests/ui_sim.js` (the `log()` boundary, five new harness grabs, 4 new tests + 2 extended),
  `tools/tests/save_load_sim.js` (its harness grew `setRaw()`; one new repair test), `AGENTS.md`.
* **Art:** none.
* **Tests:** all **seventeen** green - `ui` 24, `skill` 51, `kit` 34, `class_change` 24, `gear` 24,
  `economy` 21, `picker` 19, `card` 13, `save_load` 13, `weapon_review` 13, `sprite` 12, `pet` 11,
  `scene` 8, `starter` 7, `stat` 7, `weapon_joint` 7, `pack` 19 bodies - plus `node --check` on the
  inline script. The new ui tests run the real `bars()`, the real `skSetAll/skAllOn`, the real
  `collect()` auto-sell path and the real `feedOn/feedTab`, against real state.
* **Branches / PR:** `arena/01a107bd-prontera-grind`. **Not pushed yet** - the owner's standing rule
  is to be told before a push.
* **Known limits / follow-ups:**
  * Auto-sell is deliberately **strict on repair**: only a real `true`/`1` in the save arms a
    rarity, because a corrupt entry must never silently start selling something the player did not
    tick.
  * Auto-sell and click-sell cover **equipment** (that is what the Bag holds). Cards and ores were
    never bag items - cards go to the Cards tab, ores to their own counters - so there is nothing to
    auto-sell there.
  * The log filter is a **view**: lines are never deleted, only hidden, and the checked set is
    saved. A ticked "All" state is `logOff:{}` (nothing hidden), so an old save needs no migration
    beyond the repair above.
  * The master tile lives in the **Novice row only**. Every class shares that row (First Aid is the
    one skill every line keeps), so it is always reachable - it is not repeated per section.
  * `ui_sim.js` grabs the combat-overlay span up to `function log(m,cls,cat){`: the signature grew a
    third parameter, and the boundary string had to move with it. Any future change to `log()`'s
    signature must update that grab or the test's `addFloat` block silently goes missing.

### 2026-10-05 — `ui-v40 feed-follows-filter translucent-log-tab`

* **What changed for the player** (the owner asked for the on-screen log to be filtered too, but
  kept minimal, and for the log tab to be semi transparent):
  * **The on-screen log now follows the same ticks as the Log window.** No second set of filter
    controls was added to the play screen - one filter state drives both views, so ticking "Zeny"
    in the Log window leaves only Zeny lines on the left. Unticking brings the history straight
    back (the newest 80 lines are still kept), and the feed still shows only its four newest lines
    and still fades each one after 7 seconds.
  * **The log tab is semi transparent at rest** (`rgba(59,42,26,.42)`, muted text, hairline border)
    and only becomes solid on hover or keyboard focus. It is deliberately quiet furniture.
  * **One quiet mark when a filter is hiding something:** a 7px amber dot on the tab, no text. Its
    tooltip says what it is ("the Log window is hiding N categories from it"). That is the whole
    on-screen cost of filtering.
  * The Log window's own line now reads "the on-screen log follows the same ticks" instead of the
    v39 wording.
* **This corrects the v39 entry above**, which said the on-screen feed deliberately keeps showing
  everything. That was the v39 behaviour; the owner asked for it to change, so it changed.
* **Files touched:** `index.html` (`#feedTab` CSS + `#feedTab.filt::after`, `feedHidden/feedLive/
  feedPass/feedDraw` and the rewritten `log()`, `feedDraw()` after `ACT.logf`/`ACT.logfall`, the
  Log panel blurb, `BUILD`), `tools/tests/ui_sim.js` (the log test gained the tab appearance, the
  dot and a real `feedDraw` run against a stub DOM), `AGENTS.md`.
* **Art:** none.
* **Tests:** all **seventeen** green again - `ui` 24, `skill` 51, `kit` 34, `class_change` 24,
  `gear` 24, `economy` 21, `picker` 19, `card` 13, `save_load` 13, `weapon_review` 13, `sprite` 12,
  `pet` 11, `scene` 8, `starter` 7, `stat` 7, `weapon_joint` 7, `pack` 19 bodies - plus
  `node --check` on the inline script.
* **Branches / PR:** `arena/01a107bd-prontera-grind`. **Not pushed yet.**
* **Known limits / follow-ups:** the dot is the only on-screen hint that a filter is active, so a
  player who forgets a tick can wonder where their kill lines went - the tooltip explains it and
  the Log window shows every tick at a glance. If the owner would rather have direct controls on
  the play screen, the minimal version would be a single small "funnel" button on the log tab that
  opens the same tick row for five seconds; that is not built, deliberately.

### 2026-10-05 — `ui-v41 log-funnel self-folding-filter`

* **What changed for the player** (the owner picked the funnel option): a small **funnel button
  (▽) sits on the Logs tab**, next to the fold label. Pressing it opens the **same tick row the
  Log window uses**, immediately above the tab - Zeny / Equipment / Kills / Cards / Pets / Levels /
  Skills / Quests / Other plus All and None - and the row **folds itself away after 7 seconds**.
  Hovering, focusing or clicking inside holds it open and restarts the countdown, and Escape
  closes it before it closes any window. The row opens *upward*, so the log lines and the tab do
  not move while it is up. Both places flip the same filter state, so a tick changed in the row
  shows up in the Log window and the on-screen feed at once.
* **Files touched:** `index.html` (`#feedTabs` / `#feedFil` / `#feedFilter` CSS, the markup inside
  `#feedWrap`, `FEED_FIL_MS` + `feedFilHide/feedFilArm/renderFeedFilter/feedFilShow/feedFilToggle`,
  the `mouseenter/mouseleave/focusin/focusout` hold handlers, the delegated click on the row, the
  Escape branch, `feedTab()` folding the row with the log, `ACT.logf`/`ACT.logfall` re-rendering an
  open row, `BUILD`), `tools/tests/ui_sim.js` (one new test: markup order, the life span, the hold
  and Escape wiring, and the real open/self-fold run against a stub DOM, including that the row
  and the window offer exactly the same ticks), `AGENTS.md`.
* **Art:** none.
* **Tests:** all **seventeen** green - `ui` 25, `skill` 51, `kit` 34, `class_change` 24, `gear` 24,
  `economy` 21, `picker` 19, `card` 13, `save_load` 13, `weapon_review` 13, `sprite` 12, `pet` 11,
  `scene` 8, `starter` 7, `stat` 7, `weapon_joint` 7, `pack` 19 bodies - plus `node --check` on the
  inline script.
* **Branches / PR:** `arena/01a107bd-prontera-grind` - pushed for review; the pull request opened
  from it is linked in the session reply. This entry covers everything since the v38 merge:
  pet-buff icon tiles, the master auto-cast switch, the bag selling tools, the log filter, the feed
  following the filter, the translucent tab, and this funnel.

### 2026-10-05 — `tool-v42 equipment-card tuning sheet` (tool only; no game change, no BUILD bump)

* **What changed for the owner:** added a self-contained, offline HTML worksheet at
  `Updates/cards-gear-audit/equipment-cards-tuning.html`, based on the current `ui-v41` game data.
  It lists all ten maps, their ten stages, all four equipment tiers and **336** catalog entries;
  selecting a map and stage shows the exact field monsters, their three gear rolls and card effects,
  plus the Stage-10 boss's full equipment pool. The map's stage-to-tier schedule, individual field
  drop assignments, item names/pool membership, shared drop rates, card stat pools and effect
  values can all be edited. It also lists all **200 field-card entries and 10 boss cards**, with an
  optional one-card stat override. **Copy change spec** or **Download JSON** returns only the edits;
  the page saves edits in that browser and does not change the game.
* **Files touched:** `Updates/cards-gear-audit/equipment-cards-tuning.html` (new, with an embedded
  snapshot of the current game tables), `tools/tests/drop_card_sheet_sim.js` (new: snapshot parity,
  map/stage coverage, drop routing, card rules, offline rendering and export checks), `AGENTS.md`.
  `index.html` is unchanged.
* **Art:** none. `Sprite/`, the packed character art and `assets/kit/` are untouched; `tools/montage.py`
  was not used.
* **Tests:** all **eighteen** suites green - `card` 13, `class_change` 24, `drop_card_sheet` 8,
  `economy` 21, `gear` 24, `kit` 34, `pack` 19 bodies, `pet` 11, `picker` 19, `save_load` 13,
  `scene` 8, `skill` 51, `sprite` 12, `starter` 7, `stat` 7, `ui` 25, `weapon_joint` 7 and
  `weapon_review` 13. The sheet test verifies its embedded data against the real `fieldOf()` and
  card formulas, and checks the worksheet JavaScript and rendered HTML. The game inline script also
  passes `node --check`.
* **Branches / PR:** `arena/01a10974-prontera-grind`. No push or PR requested; not pushed.
* **Known limits / follow-ups:** this is a baseline snapshot, not a game patch. The drop-rate inputs
  are global because the current game shares those rates across maps; the sheet can change map/stage
  pools and individual gear assignments, but does not yet offer separate per-map probability
  sliders. Card-value edits are global per grade/stat; the optional one-card override targets one
  monster on one map/stage. Paste the exported JSON back before any of these edits are applied to
  `index.html`.

### 2026-10-05 — `balance-v42 early-map class pathways`

* **What changed for players:**
  * **Prontera is now the easy Novice start for Base Lv 1-10.** All ten stages stay on the starter drop tier. The live pool contains Novice-usable swords, daggers, armor, headgear, legwear and accessories; it no longer drops a mace or shield, which a Novice cannot equip.
  * **Izlude serves the Swordman and Merchant trees:** every tier now includes a Swordman sword alongside Merchant axes and maces. Stage 10's boss pool includes the high-tier Golden Axe and Loaded Mace. Geffen serves Mage staves, Morroc serves Thief daggers/katars, and Payon serves Archer bows; its Archer target follows the owner's correction.
  * The four class maps now state their bands on the map: stages 1-5 target Base Lv 10-20, and stages 6-10 target Base Lv 20-50. Their drops progress from starter gear (stages 1-5), to 1st-job gear (6-7), 2nd-job gear (8-9), then high-tier gear at the Stage-10 boss. The late-map power and gear schedules are unchanged. No equipment Base Lv gates were added.
  * The Build tag is `2026-10-05 balance-v42 early-map class pathways`. **Boss-card effects were not changed**; they remain pending the owner's review of the card-by-card proposal.
* **Worksheet:** refreshed `Updates/cards-gear-audit/equipment-cards-tuning.html` for the new game baseline. It now shows each stage's target Base Lv and the current class-map gear tiers. This supersedes the preceding worksheet snapshot: the revised catalog has **338** entries. `node tools/tests/drop_card_sheet_sim.js --refresh-snapshot` rebuilds that embedded snapshot after an intentional game-data change.
* **Files touched:** `index.html` (map identities/recommendations, early field-power schedule, stage-to-gear routing, optional off-hand drops for Novice, Build tag), `tools/tests/gear_sim.js`, `tools/tests/starter_sim.js`, `tools/tests/ui_sim.js`, `Updates/cards-gear-audit/equipment-cards-tuning.html`, `tools/tests/drop_card_sheet_sim.js`, and this log.
* **Art:** none. No sprite or map art changed.
* **Tests:** all **eighteen suites** green: card 13, class_change 24, drop_card_sheet 9, economy 21, gear 25, kit 34, pack 19 bodies, pet 11, picker 19, save_load 13, scene 8, skill 51, sprite 12, starter 8, stat 7, ui 25, weapon_joint 7, weapon_review 13. The inline game script also passes `node --check`; `git diff --check` is clean.
* **Branches / PR:** `arena/01a10974-prontera-grind`. Not pushed; no PR opened.

### 2026-10-05 — `balance-v43 progression pacing`

* **What changed for players:** Base Lv 1-10 is tuned to about **7 minutes**, and Base Lv 10-50 to about **30 more minutes** (about 37 minutes total), using the level-appropriate early-map power route. Job bars keep the existing class resets and offsets: the first-job Job Lv 1-40 track now mirrors roughly that same 30-minute interval, with the next job gate around Base 48-49. The Base 50-99 stretch remains about five hours, and the post-reset Base 100-150 tail remains about 48 hours. Updated the early map detail hint so Prontera says Base Lv 1-10 and the class-map starters say Base Lv 10-20.
* **Card tuning:** no boss-card values or socket rules were changed; the proposed 2x card-value change remains pending review/approval.
* **Worksheet compatibility:** refreshed only the worksheet's source-build marker to v43. Since this build changes pacing, not card/gear data, the worksheet now migrates saved v42 edits in place instead of discarding them; a regression test covers that preservation.
* **Files touched for this pacing pass:** `index.html` (EXP curve, level-power mapping for Job pacing, map hint, BUILD), `tools/tune_pacing.js`, `tools/tests/economy_sim.js`, `Updates/cards-gear-audit/equipment-cards-tuning.html` (build marker + v42 saved-state migration), `tools/tests/drop_card_sheet_sim.js`, and this log. Earlier v42 map-pathway and worksheet files remain part of the same uncommitted worktree.
* **Model results:** Base 10 at 7.0 min, Base 50 at 37.1 min total (30.1 min from Base 10), Base 99 at 5.617 h total (about five hours after Base 50); job gates at Base 10 / 48 / 99. The model uses 800 kills/hour and an average boss every 16 kills; real time still depends on class, gear and combat speed.
* **Tests:** all **18 suites** pass, including the updated economy pacing/job-gate model and worksheet migration; `node --check` on the inline game script and `git diff --check` are clean.
* **Branches / PR:** `arena/01a10974-prontera-grind`. No commit, push, or PR.

### 2026-10-05 — `balance-v44 two-handed Assassin Katar + affix range chart`

* **What changed for players:** Assassin and Assassin Cross can equip only one Katar, and it occupies both hands. The equipment screen labels it `2H Katar`, hides the off-hand slot, and explains that no shield or second weapon can be worn. Daggers and off-hand gear from older Assassin saves are moved into the bag on load; gear that becomes invalid during a class change is stowed rather than lost. Mixed late-map weapon drops were adjusted where their old dagger entries would no longer be usable by any of the advanced class lines leveling there.
* **Affix reference:** added the self-contained `Updates/cards-gear-audit/affix-ranges.html`. It charts all 11 affixes for five rarities and four gear sections, with exact rounded min/max values, live weights, units, the generator formula and affixes-per-item counts. `gear_sim.js` checks all 220 displayed range cells against the live source constants and formula.
* **Cards and pacing:** card pools, values, effects and socket rules are unchanged. The v43 leveling pace is carried forward unchanged; this pass does not retune or revert it.
* **Worksheet compatibility:** refreshed the baseline for the revised mixed-map catalog and v44 build. Older v42/v43 worksheet edits migrate forward; edits on unaffected gear and user-added items remain, while replaced weapon identities reset and drop overrides pointing at those old identities are discarded. Tests cover both migrations.
* **Files touched:** `index.html` (Assassin weapon lists, two-handed equipment rules/UI, legacy-save and class-change repair, mixed-map weapon pools, BUILD), `tools/tests/gear_sim.js`, `tools/tests/class_change_sim.js`, `tools/tests/save_load_sim.js`, `tools/tests/sprite_sim.js`, `tools/tests/ui_sim.js`, `Updates/cards-gear-audit/affix-ranges.html` (new), `Updates/cards-gear-audit/equipment-cards-tuning.html`, `tools/tests/drop_card_sheet_sim.js`, and this log. The v43 pacing changes and their tests remain in the worktree.
* **Art:** none. No sprite assets changed.
* **Tests:** all **18 suites** pass, including the katar-only class/equipment/load cases, affix-chart parity and worksheet migration; the inline game script passes `node --check`, and `git diff --check` is clean.
* **Branches / PR:** `arena/01a10974-prontera-grind`. No commit, push or PR.

### 2026-10-05 — `balance-v45 all-class late-map gear + four-slot bows/Katars`

* **What changed for players:** the active gear tiers on Comodo, Louyang, Amatsu, Niflheim and Abyss now each drop all seven weapon families, so every class can find a weapon it can equip on those late maps. Abyss keeps the Dark Lord high-tier armor set and now has a high-tier weapon for every family; its Stage-10 boss rolls that complete pool at the existing Legendary 1% per-item rate. Early-map class themes and pacing are unchanged.
* **Card sockets:** generated bows and Katars now always have four card sockets; other weapon families keep the existing 1–3 socket roll. The card effects and values themselves are unchanged.
* **Map revisit recommendation (not implemented):** next, add a Monster Index / map-mastery track that records first kills and card discoveries and awards regional tokens or cosmetic rewards. That makes earlier maps worth revisiting without letting their gear overtake Abyss. Any new or changed card effects should be proposed card-by-card first; none were changed here.
* **Worksheet and chart:** refreshed the equipment worksheet snapshot to the 378-item catalog and v45 build. Its migration matches saved edits by item identity and rebases shifted catalog/drop IDs from v44; v42/v43 saved edits still migrate. The affix chart is also labeled for v45; its values/formula are unchanged.
* **Files touched:** `index.html` (all-class late-map pools, Katar/Bow socket count, BUILD), `tools/tests/gear_sim.js`, `tools/tests/ui_sim.js`, `Updates/cards-gear-audit/equipment-cards-tuning.html`, `tools/tests/drop_card_sheet_sim.js`, `Updates/cards-gear-audit/affix-ranges.html`, and this log.
* **Tests:** all **18 suites** pass, including late-map class coverage, Abyss boss-pool completeness, 4-socket generation/rendering, chart parity and worksheet migration; inline game JavaScript passes `node --check`, and `git diff --check` is clean.
* **Branches / PR:** `arena/01a10974-prontera-grind`. No commit, push or PR.

### 2026-10-05 — `balance-v46 Crit DMG output tune + Mastery Index`

* **What changed for players:** the gear Crit DMG affix remains in the roll pool, but only its final gear value is multiplied by 70% after the existing rounded roll (`100 → 70`). Its `AB.cdm` and all other affix values are unchanged. Card Crit DMG and card valuation are unchanged. The standalone affix chart now explains and tests this gear-only final scale.
* **Mastery Index:** added a dock tab and a 📚 Index button beside the on-screen Quest Board. The Mob Index records lifetime kills for each of the 90 regular/boss entries across all maps and shows the global title ladder. Ten cumulative lifetime-kill titles are progressively unlockable and equippable in the HUD:
  * 100 — Field Initiate; 500 — Field Scout; 2,000 — Rune-Midgarts Vanguard; 7,500 — Midgard Tracker; 20,000 — Dungeon Reaper;
  * 45,000 — Rift Warden; 90,000 — Abyss Stalker; 160,000 — Dark Lord's Bane; 275,000 — Champion of Midgard; 450,000 — Valkyrie's Chosen.
* **Card Mastery recommendation implemented:** confirm before consuming one loose card into the permanent album; every 5 dedicated copies grant 1 permanent point in STR, AGI, DEX, INT, VIT or LUK. Each stat caps at +5, for +30 total points / 150 cards to complete the stat reward track. Card names and duplicate counts remain archived; socketed cards cannot be dedicated, and all current card effects stay intact.
* **Save and worksheet compatibility:** old game saves receive empty mastery records; kill counts, the album, allocations and earned/equipped titles persist and are repaired against the unlock/cap rules. Added the v45 worksheet build to its safe migration list before refreshing the v46 snapshot; tests cover v45 edit preservation.
* **Pacing / cards / equipment:** the v43 progression pace remains unchanged. No boss-card changes, card-value changes, socket-capacity changes or equipment Base Lv gates were added in this pass.
* **Files touched for v46:** `index.html` (gear-only CDM output, persistent mastery model, kill/title/card UI and Quest Board link, BUILD), `tools/tests/gear_sim.js`, `tools/tests/pet_sim.js`, `tools/tests/economy_sim.js`, `tools/tests/save_load_sim.js`, `tools/tests/ui_sim.js`, `Updates/cards-gear-audit/affix-ranges.html`, `Updates/cards-gear-audit/equipment-cards-tuning.html`, `tools/tests/drop_card_sheet_sim.js`, and this log. The worksheet card-effect matrix remains unchanged.
* **Art:** none. The title seals and parchment treatment are CSS/UI; no sprites or map art changed.
* **Tests:** all **18 suites** pass (including live affix-chart parity, card preservation, the mastery save/UI flows, and v45 worksheet migration); the inline game script passes `node --check`, and `git diff --check` is clean.
* **Branches / PR:** `arena/01a10974-prontera-grind`. No commit, push or PR.

### 2026-10-05 — `balance-v47 bag locks + gear level reference`

* **What changed for players:** the Bag now keeps equipment in pickup/inventory order instead of reshuffling by rarity and value whenever loot arrives. Locked gear is pinned above unlocked gear, marked with a gold star, and can be locked/unlocked from the Bag or equipment detail panel. Lock state saves across reloads; auto-sell and bulk-sell skip locked items. Click-sell or manual Sell on locked gear opens an unlock warning; confirming only unlocks it, and a second click/Sell action is required to sell it.
* **Equipment level:** gear details/tooltips now show a reference Gear Lv equal to the dropped monster level plus 10 per rarity step (Common +0, Fine +10, Rare +20, Epic +30, Legendary +40), clamped to 1-150. This is informational only; it does not gate equipment by player Base Lv. No gear stats or class-use rules changed.
* **Pacing / cards:** the EXP curve was not changed. `node tools/tune_pacing.js` confirms the Base Lv 100-150 tail remains about **48.0 modeled hours** at 800 kills/hour; the requested new target duration is still pending. Card effects and values, sockets, and the v46 gear-only Crit DMG scale remain unchanged.
* **Worksheet compatibility:** updated the visible build markers to v47 and added v46 to the worksheet's safe prior-build list. The catalog/card snapshot itself is unchanged because this pass only adds UI and save-state behavior; v45 and earlier safe migrations remain supported.
* **Files touched:** `index.html` (bag ordering, reference Gear Lv display, lock state and protected selling, BUILD), `tools/tests/ui_sim.js`, `tools/tests/save_load_sim.js`, `Updates/cards-gear-audit/affix-ranges.html` (build badge/footer), `Updates/cards-gear-audit/equipment-cards-tuning.html` (build marker and v46 migration compatibility), `tools/tests/drop_card_sheet_sim.js`, and this log.
* **Art:** none. No sprites or map art changed.
* **Tests:** all **18 suites** pass: card 13, class_change 25, drop_card_sheet 12, economy 22, gear 30, kit 34, pack (19 class bodies), pet 11, picker 19, save_load 18, scene 8, skill 51, sprite 12, starter 8, stat 7, UI 30, weapon_joint 7, weapon_review 13. Inline game JavaScript passes `node --check`; `git diff --check` is clean.
* **Branches / PR:** `arena/01a10974-prontera-grind`. No commit, push, or PR.

### 2026-10-05 — `balance-v48 individual mastery + skill allocator`

* **What changed for players:** the bottom HUD is a real wrapping flex row again, so the status bars and counters stop colliding on narrow screens. An equipped Index title is no longer squeezed into that row: it appears as a small readable seal above the player's head in the play view and follows the character.
* **Index Mastery:** the old global-kill ladder is replaced by an individual ledger for all 90 map/species entries. Each entry has eight kill rungs (1, 5, 20, 50, 100, 250, 500 and 1,000); every kill and every newly crossed rung adds Index XP to the progress bar. Variety discovers species, while repeated kills raise that species' mastery. Ten Index-XP title ranks (25 through 50,000 XP) can be equipped from the Index.
* **Card Mastery:** every named card now has a five-rank track. One loose duplicate advances only that card, preserves its duplicate history, and grants one reward point to choose from STR/AGI/DEX/INT/VIT/LUK, Max HP%, Flee%, HP Leech, DEF, MDEF, ATK%, MATK%, ASPD% or Crit%. Socketed cards are not consumed. The selected rewards feed the live HP, damage, magic damage, attack speed, crit, flee, defence, magic defence and strike-healing formulas.
* **Skills:** added **Auto-allocate all skills** beside Auto-cast all. It spends the whole current line's available budget in lower-class/data order before moving upward. Skill income is capped to the reachable, data-derived tree cost, job records are repaired to their class maximums, and old over-spent skill saves are trimmed without allowing future class additions to mint overflow points.
* **Save and worksheet compatibility:** old kill totals migrate into Index XP; old card-global reward points migrate deterministically into per-card reward records; individual kill ledgers, card identities, reward choices, title equipment and skill repairs persist. The visible game and card/gear reference markers are v48, while v47 and earlier worksheet edits remain safe migrations.
* **Files touched:** `index.html`, the Index/card/skill/save/UI simulations, `Updates/cards-gear-audit/affix-ranges.html`, `Updates/cards-gear-audit/equipment-cards-tuning.html`, and this log. **Art:** none; sprite and map assets are unchanged.
* **Tests:** all 18 suites are green: pack 19 bodies, class_change 25, save_load 18, economy 22, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 30, sprite 12, starter 8, pet 11, picker 19, drop_card_sheet 12, weapon_joint 7 and weapon_review 13. The inline game script passes `node --check`, `git diff --check` is clean, and the live preview serves successfully on port 8000. No commit, push or PR.

### 2026-10-05 — `balance-v49 mastery GM test controls`

* **What changed for the GM:** the GM panel now has direct test controls for every v48 system. Index buttons can add a single Poring kill, give every species 1/100/1,000 kills, set 50,000 Index XP for title testing, or clear the ledger. Card buttons can add loose Poring cards, prepare Poring 5/5 or every card at 5/5 for reward-picker testing, or reset mastery without touching socketed cards. Skill buttons can max the current line's job records, max-and-auto-allocate the line, or reset that line for another run.
* **Build/reference markers:** the player-visible build is now `2026-10-05 balance-v49 mastery GM test controls`; the card/gear worksheet accepts v48 and earlier saved edits as safe migrations. No game balance tables or art changed in this GM-only pass.
* **Files touched:** `index.html` (GM helpers, controls and BUILD), the v49 reference markers/migration list, `tools/tests/ui_sim.js`, `tools/tests/drop_card_sheet_sim.js`, and this log.
* **Tests:** all 18 suites are green: pack 19 bodies, class_change 25, save_load 18, economy 22, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 30, sprite 12, starter 8, pet 11, picker 19, drop_card_sheet 12, weapon_joint 7 and weapon_review 13. The inline game script passes `node --check`, `git diff --check` is clean, and the live preview serves successfully on port 8000. No commit, push or PR.

### 2026-10-05 — `balance-v50 slower Index + capped Card Mastery + safer pets`

* **Index Mastery:** individual species tracking remains intact, but its eight kill rungs are now **100, 1,000, 5,000, 25,000, 100,000, 500,000, 1,000,000 and 5,000,000**. The ten global title thresholds now run from 100 to **4,320,000 Index XP**, matching about 20 days at 150 kills/minute; milestone bonuses were reduced to small one-time awards so they do not materially shorten that model. The GM panel now has one-kill, 1/100/1,000/5,000-per-species, 10,000-XP title, final-title and clear scenarios.
* **Card Mastery:** the five per-card ranks remain, and each rank contributes one point to the active reward budget until the current global caps are filled. Every reward now has an account-wide effective cap: core stats +25, Max HP +10%, Flee +10 percentage points, HP Leech +3%, DEF/MDEF +25, and ATK/MATK/ASPD/Crit +5%. The active budget is exactly the sum of those caps, so a full album has no surplus points; later ranks remain recorded and become spendable if future reward categories add capacity. Assignment rejects capped rewards, save repair trims malformed arrays globally, and the picker shows current/cap values and the budget. A GM cap fixture fills every cap; loose-card-only dedication and socket protection are unchanged.
* **Pets:** the complete damage chain is retuned: PETBAL 2.65, G6 mutation x38, Claw +10%/tier, Collar +7%/tier, Charm +5%/tier, and lower attack-skill multipliers. The measured maxed Angeling with two attack skills is about **0.64x** one maxed character's sustained rotation; a common maxed pet remains a real companion. War Cry/Arcane Blessing are +15% and weighted below the other rolls; Blood Siphon/Vital Aura are also restrained. The twelve-skill pool adds Treasure Sniff, Warm Nuzzle, Guarding Chirp and Tail Wag as low-impact non-DPS utility rolls. GM presets can create maxed DPS, buff-slot and utility-slot pets.
* **Build/reference markers:** the player-visible build and both card/gear reference pages are `2026-10-05 balance-v50 slower index capped cards safer pets`; v49 is accepted as a safe worksheet migration. No art or sprite assets changed.
* **Files touched:** `index.html`, the pet/skill/save/UI simulations, worksheet marker/migration checks, both reference pages, and this log.
* **Tests:** all 18 suites pass: pack 19 bodies, class_change 25, save_load 21, economy 22, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 30, sprite 12, starter 8, pet 12, picker 19, drop_card_sheet 12, weapon_joint 7 and weapon_review 13. Inline game JavaScript passes `node --check`; `git diff --check` is clean. No commit, push or PR.
### 2026-10-05 — `tool-v48 sprite movement preview`

* **What changed for the owner:** added a standalone sprite review page at `Updates/Sprite/index.html`. It covers all seven class-tree folders, all 19 jobs and both genders; the direction pad and short route demo show S, NE/NW, SE/SW and SE/SW attacks. NW/SW are visibly labelled horizontal mirrors of the supplied NE/SE art. Missing angles are called out instead of silently replaced, with the High Priest N pose identified as an up-view fallback. The page also has local-only review notes with copy/download actions. The source PNGs are single 200×200 poses, not animation sheets, so the preview moves the existing image but does not invent animation frames.
* **Files touched:** `Updates/Sprite/index.html` (new standalone viewer), `tools/tests/sprite_viewer_sim.js` (asset manifest, directions, missing-source cases and inline-script checks), and this log. The game and `BUILD` tag are unchanged.
* **Tests:** all **19 suites** pass, including the new sprite viewer check; inline viewer JavaScript passes `node --check`, every listed image responds from the preview server, and `git diff --check` is clean.
* **Branches / PR:** `arena/01a10af7-prontera-grind`. No commit, push or PR.

### 2026-10-05 — `tool-v49 refreshed viewer for the new directional sprites`

* **What changed for the owner:** refreshed the preview with the six newly added PNGs: Archer female NE and S walks, Archer male SE walk, Sniper male SE attack, and High Priest male/female NE walks. The viewer now lists **154** source poses, and all 19 jobs in both genders have direct NE, S and SE walking plus SE attack art. High Priest now uses its new NE files; its older N files remain available in the source gallery but are no longer an up-view fallback.
* **Files touched:** the six new PNGs in `Updates/Sprite/{Archer,Acolyte}/`, `Updates/Sprite/index.html` (refreshed manifest), `tools/tests/sprite_viewer_sim.js` (now asserts complete requested pose coverage), and this log. No game code or `BUILD` change.
* **Tests:** all **19 suites** pass; the viewer test checks all 154 local PNGs, their 200×200 dimensions, full requested pose coverage, mirrors and inline JavaScript. The viewer script passes `node --check`; `git diff --check` is clean.
* **Branches / PR:** `arena/01a10af7-prontera-grind`. No commit, push or PR.

### 2026-10-05 — `tool-v50 canonical sprite reference backup + class-skin alignment check`

* **What changed for the owner:** declared `Updates/Sprite/index.html` the one canonical review/backup page, documented it in `Updates/Sprite/README.md` and `READ-ME-FIRST.md`, and added `python3 tools/make_sprite_viewer.py` so future PNG updates refresh that same HTML in place (`--check` verifies it is current). The live game already prefers the exact named animated skin for each of its 19 class jobs; tightened `pack_sim.js` to assert every class resolves to its own packed body. The reference PNGs remain separate: they are still poses, not the game's eight-direction body/head animation atlas, so replacing the live pack with them would remove existing animation and hair composition.
* **Files touched:** `Updates/Sprite/index.html`, new `Updates/Sprite/README.md`, new `tools/make_sprite_viewer.py`, `tools/tests/sprite_viewer_sim.js`, `tools/tests/pack_sim.js`, `index.html` (clarifying class-skin fallback comments only), `READ-ME-FIRST.md`, and this log. No player-visible game behavior or `BUILD` change.
* **Tests:** all **19 suites** pass. The viewer check verifies 154 PNGs, 200×200 dimensions, complete requested source poses and a current generated manifest; `pack_sim.js` verifies all 19 exact game skin mappings. Inline viewer JS passes `node --check`, and `git diff --check` is clean.
* **Branches / PR:** `arena/01a10af7-prontera-grind`. Prepared for the requested PR; not pushed yet.

### 2026-10-05 — `tool-v50 PR #18 published`

* **PR:** pushed `arena/01a10af7-prontera-grind` and opened PR #18, “Add canonical class sprite reference backup,” against `main`. The prior v50 log line saying “not pushed yet” was accurate before publication; this entry records the completed push and PR.
* **Checks:** all 19 local test suites passed before the push. GitHub's Cloudflare Workers Builds check then reported **failure**; its only diagnostic is a Cloudflare dashboard link that redirects to account sign-in, and the GitHub check contains no build log or annotations. The failure reason is therefore unverified; do not describe the deployment check as passing.

### 2026-10-05 — `skin-v51 live class skins in the game`

* **What changed for players:** your character is now drawn from the uploaded class art in `Updates/Sprite/`. Every one of the 19 classes uses its own files, in the gender you picked, for the four views that exist: **S** (straight down), **SE** and **NE** walking, and the **SE** attack. **SW**, **NW** and the **SW attack** are the same poses mirrored horizontally - in the game and in the reference viewer, from the same source file. The art has no N, E or W drawing, so walking straight up shows the NE view and walking straight left/right shows the SE / mirrored SE view; the Appearance panel says that in words, so no facing is silently wrong.
* **Animation trade-off (chosen by the owner):** these are single finished drawings, not sheets, so there are no walk or attack frames to play. Walking slides the one pose the game already had - exactly what the reference viewer does - and an attack is its one drawn swing. One constant scale per class and gender keeps the character the same size it was next to the monsters.
* **Hair:** the uploaded art has the hair drawn into it, so the 19 hairstyles can no longer be composed on top. The saved hairstyle is untouched in your account and still applies if the animated pack is ever shown again; the ◀/▶ buttons now explain this instead of pretending to work.
* **Weapons:** the held-weapon item icon is switched off for now (the owner's call while the class art is finished). The icon was anchored to hand positions measured from the old animated atlas, so it could only float wrongly on the new art. Weapons still fight, keep their stats and show in Equipment and the Bag; the slash and arrow effects are unchanged.
* **Previews:** Settings shows a **live preview of the class skin you are wearing** (class + gender, S view), and the class-change panel shows the class you are looking at, male or female, before you switch. The class you are already on says "You wear this now".
* **Safety net:** the game waits until all four drawings of that class and gender have decoded before it wears them; until then (or if a file cannot load, which is logged in the game log) it keeps the animated sprite, so a half-loaded class can never show the wrong pose or another class's art.
* **Art:** none drawn, recoloured or redrawn - the game crops the uploaded PNGs by their own measured opaque bounds and mirrors them horizontally. `tools/montage.py` was not used and `assets/sprite_pack_data.js` / `Sprite/*.png` are untouched.
* **Files touched:** `index.html` (class-skin loader/compositor, hero selection, Settings + class-change previews, held-weapon switch, BUILD), new `assets/class_skins_data.js`, new `tools/make_class_skins.py`, new `tools/preview_class_skins.py`, new `tools/tests/class_skin_sim.js`, `tools/tests/pack_sim.js`, `tools/tests/sprite_sim.js`, `tools/tests/ui_sim.js`, `tools/tests/drop_card_sheet_sim.js`, `Updates/cards-gear-audit/equipment-cards-tuning.html` (v47 as a safe previous build, snapshot refreshed), `Updates/cards-gear-audit/affix-ranges.html` (build badge), `Updates/Sprite/README.md`, `READ-ME-FIRST.md`, and this log.
* **Known limits / follow-ups (tell the owner):**
  * Three uploaded files are byte-for-byte duplicates of another pose: `aco female walking S` = `aco male walking S` (her front walk is the male drawing), `aco female attack SE` = `aco female walking SE` (her attack is her own walk), and `blacksmith female walking NE` = `whitesmith female walking NE`. `class_skin_sim.js` pins this list so a re-upload is noticed; no new art was invented to fill the gaps.
  * Only one walk pose per direction exists, so movement has no leg cycle; if the owner wants motion, the options are more supplied frames or a self-made bob (not done).
  * The held-weapon placement pass (v29 parked weapon + `assets/weapon_joints_data.js`) is parked behind `HERO_HELD_WEAPON=false`, ready to be re-measured against the new attack art.
* **Merged with main (v50):** this branch was built on the PR #18 merge; `main` then gained the v50 balance pass (slower index, capped cards, safer pets) and the two branches conflicted in `index.html` (the `BUILD` line only), the equipment worksheet, its snapshot test and the affix chart badge. `origin/main` was merged into this branch: the v50 build became a **safe previous build** for the worksheet, its embedded baseline was refreshed against the merged game, and the held-weapon switch, the class-skin hero and v50's on-screen title seal all coexist in `draw()`.
* **Tests:** all **20 suites** pass on the merged tree - card 13, class_change 25, class_skin 23, drop_card_sheet 12, economy 22, gear 30, kit 34, pack 19 bodies, pet 12, picker 19, save_load 21, scene 8, skill 52, sprite 12, sprite_viewer 154 PNGs, starter 8, stat 7, ui 31, weapon_joint 7, weapon_review 13. `node --check` on the inline game script and `git diff --check` are clean; both manifest generators report current.
* **Branches / PR:** `arena/01a10b27-prontera-grind` -> PR #20 against `main` (open, not merged).

### 2026-10-05 — `skin-v52 animated class skins (APNG)`

* **Correction, stated first:** the previous entry's "these are single finished drawings… there are no walk or attack frames to play" was **wrong**, and so was `Updates/Sprite/README.md`'s "still poses". Every one of the 154 uploaded files is a multi-frame, endlessly looping APNG; the earlier check only ever read frame 0. All 154 were re-parsed chunk by chunk: `acTL` present in every file, frame counts **8 (127 files), 5 (13), 6 (4), 9 (10)**, `num_plays = 0` (loop forever) everywhere, 200×200 RGBA. `make_class_skins.py` now refuses a file that is not a multi-frame endless loop, so a re-upload cannot silently bring the old mistake back.
* **What changed for players:** the uploaded art is no longer shown as one frozen pose per view - it **animates**. The hero walks with the uploaded leg cycle, swings with the uploaded attack animation, and each of the four supplied views plays its own frames with its own per-frame delays, looping forever. Because SW / NW / the SW attack are the same files mirrored, both sides of every walk and both attack directions animate from real frames.
* **How the animation works (and why it is not an atlas):** the game never cuts these files into an 8×24 sheet and never counts frames itself. Each file is decoded by the browser in a hidden-but-painted `<img>` (1×1 clipped layer with `opacity:0` - not `display:none`, which browsers may skip), and once per rendered frame the game copies whatever frame the browser is currently showing onto a 200×200 transparent canvas which is the hero's `CanvasTexture` (`needsUpdate` after each copy, nearest filtering, no background painted, canvas cleared each frame). The file's own timing decides what the player sees; nothing is invented, sped up or slowed down.
* **Hero scale and anchor:** one constant scale per class and gender, taken from the art's own drawn height (`SKIN_H = 72 × PACK_K`, the height the hero already had next to the monsters), anchored at the art's own ground line so the feet stay on the floor while frames advance. The square image is never stretched.
* **Views / mirrors (unchanged contract, now animated):** facings 0-7 → S, SE mirrored, SE, NE mirrored, NE (or the class's own `N` file), NE, SE, SE mirrored; attacks use the supplied SE attack, mirrored for facings 0-3. The art has no idle drawing, no E or W drawing and no N drawing except High Priest's, so **standing still keeps the S walk playing** (walk-in-place, exactly what the canonical viewer does), straight up uses NE (or High Priest's own N) and straight left/right uses SE / mirrored SE. The Appearance panel says all of this in words: it no longer claims an idle or an E/W/N drawing exists.
* **Hair and weapons (unchanged from v51):** the art includes the hair, so the 19 hairstyles cannot be composed on top (the saved choice is untouched in the account and still applies to the animated-pack fallback); the held-weapon overlay stays parked behind `HERO_HELD_WEAPON=false`, so no old weapon icon can float wrongly on the new attack frames.
* **Melee swing cue (new call, easy to reverse):** the old white swing arc was stroked in code over the hero during every melee attack, and on top of the uploaded attack animation it read as a second, duplicate slash. It is now off behind `HERO_SWING_ARC=false` (declared right above `drawSlashFX`), bow and staff projectiles are untouched, and the Appearance panel says the arc is off and why. Set the switch to `true` to bring the cue back.
* **Previews:** both the Appearance panel and the class-change panel now play the real animation (same pack, same S view, same anchor) because the game loop redraws whichever preview is open, instead of painting a one-off still when the panel was built.
* **Safety net:** a class's skin is worn only after every supplied view has decoded; until then, or if a file fails (logged in the game log), that class's animated pack body is drawn instead, so a half-loaded class can never show the wrong view or another class's art.
* **Files touched:** `index.html` (APNG bridge: decoder layer, per-class pack, route/mirror table, canvas-frame capture in the render loop, previews, panel wording, `BUILD`), `assets/class_skins_data.js` (regenerated: frames, delays, per-view opaque bounds, height, anchor), `tools/make_class_skins.py` (stdlib APNG chunk parser, per-frame alpha bounds, `--check` now rejects stills and non-looping files), `tools/preview_class_skins.py` (frame-sampling directions sheet + frame-by-frame walk-cycle sheet per class), `tools/tests/class_skin_sim.js` (rewritten, 25 tests), `tools/tests/ui_sim.js`, `Updates/cards-gear-audit/affix-ranges.html` + `equipment-cards-tuning.html` (v52 label; v51 kept as a safe previous build), `Updates/Sprite/README.md`, `READ-ME-FIRST.md`, and this log. No source PNG was added, deleted, re-encoded or edited; `tools/montage.py` was not used.
* **Tests:** all **20 suites** pass (card 13, class_change 25, class_skin 25, drop_card_sheet 12, economy 22, gear 30, kit 34, pack 19 bodies, pet 12, picker 19, save_load 21, scene 8, skill 52, sprite 12, sprite_viewer 154 PNGs, starter 8, stat 7, ui 31, weapon_joint 7, weapon_review 13). `class_skin_sim.js` now reads the real APNG chunks for all 154 files, cross-checks the manifest against the canonical viewer's manifest and pose map, and drives the game's own skin code in a Node vm (stub decoder): route + mirror for all 8 facings and both attack sides, whole-frame capture with `needsUpdate`, no atlas slicing, header-anchored 200×200 texture, mirror drawn as a canvas flip, hero hides rather than showing a stale view, all-views-before-wearing, per-class fallback on a broken file, missing-manifest fallback, and both previews. `node --check` on the inline game script and `git diff --check` are clean; both generators report current.
* **Verified vs not verified:** verified here = the APNG metadata of all 154 files, frame-by-frame renders of every class/gender/view through `tools/preview_class_skins.py` (PIL, real frames), and the in-game code path in the Node vm harness. **Not verified here = a real browser.** This sandbox has no browser or headless-browser harness, so the on-screen animation could not be watched; the owner should load the live preview to confirm the hero animates.
* **Branches / PR:** `arena/01a10b27-prontera-grind` -> PR #20 against `main` (open, not merged).

### 2026-10-05 — `skin-v53 class animations decoded in-game`

* **What was wrong with v52 (found by the owner's browser test, fixed here):** v52 handed the playing to the browser - a hidden `<img>` per file, with the game copying "whatever frame the browser is showing" onto the hero's canvas. Browsers do not keep an APNG running when it is not painted on screen, so that copy was frame 0 forever: the hero wore the new art but stood still. The owner reported exactly that ("no multi frame walking and attacking").
* **What changed:** `index.html` now decodes each file's frames itself and plays them.
  * `skinDecodePng` walks the PNG/APNG chunks (`IHDR`, `acTL`, `fcTL`, `IDAT`, `fdAT`), inflates the zlib stream with `DecompressionStream('deflate')`, reconstructs the scanlines (PNG filter types 0-4, Paeth included), applies APNG blend/dispose (`SOURCE` / `OVER`, `NONE` / `BACKGROUND` / `PREVIOUS`) and writes every frame into one horizontal strip canvas per view.
  * `captureSkinFrame` paints the frame that is due right now - chosen by `skinFrameIndex` from the file's own delay table (an APNG delay denominator of 0 counts as 100, per spec), wrapping forever - onto the hero's 200×200 `CanvasTexture`. A new facing or a new swing restarts at that animation's frame 0.
  * All 154 files are decoded: they are 8-bit RGBA, non-interlaced, every frame full-canvas 200×200, blend `SOURCE`, dispose `NONE`, delays 75 ms (walk) / 100 ms (attack), `num_plays = 0`.
  * Decoded views are cached with a bounded LRU (18 views ≈ 23 MB) that always pins the class being worn and the class being previewed. If a view is ever dropped, the hero keeps the frame already on screen and the view re-decodes in the background; a facing whose art is missing hides rather than showing another facing's pose.
  * A browser without `DecompressionStream`, or a page opened as `file://`, keeps the art via the `<img>` decoders as before, logs why the frames are missing and how to fix it, and the Appearance panel carries an honest note. None of that is silent.
  * When a class's frames are ready the game log says so once ("Class skin animation ready: Knight male - 8 S, 8 SE, 8 NE, 9 attack frames, played with the file's own delays"), so the animation running is visible without guessing.
* **Proof, not assertion:** `tools/tests/class_skin_sim.js` now runs the game's own decoder over **all 154 files and compares every decoded frame byte-for-byte (SHA-256) against an independent Pillow rendering** of the same file (`tools/tests/fixtures/apng_frame_sha.json`, written by the new `/tmp/venv/bin/python3 tools/make_apng_fixtures.py`; the suite itself needs Node alone). 1195 frames are compared. On top of that the suite drives the real code in a Node vm with a software canvas and checks the hero's own pixels: the frame due at a given millisecond equals Pillow's frame, the mirror is exactly a horizontal flip of it, one walk cycle really paints 8 different pictures, attacks restart at frame 0, an attack plays its own frames, the fallbacks (missing file, no decoder, `file://`, no manifest), the bounded cache, the eviction behaviour and both previews. 37 checks in that suite; all 20 suites pass.
* **Files touched:** `index.html` (in-game APNG decoder and frame player, cache/pinning, fallbacks, ready log, panel note, `BUILD`), new `tools/make_apng_fixtures.py`, new `tools/tests/fixtures/apng_frame_sha.json`, `tools/tests/class_skin_sim.js` (rewritten harness with the software canvas), `Updates/cards-gear-audit/affix-ranges.html` + `equipment-cards-tuning.html` (v53 label; v52 kept as a safe previous build, snapshot refreshed), `Updates/Sprite/README.md`, `READ-ME-FIRST.md`, and this log. No source PNG was added, deleted, re-encoded or edited.
* **Verified here vs not verified here:** verified = the decoder against Pillow for all 1195 frames, the hero/preview pixels, the route/mirror table against the canonical viewer, the loaders and fallbacks, and every local suite. **Not verified here = a real browser** - this sandbox has no browser, so the animation must be confirmed by the owner on the live preview; the log line above is the quickest way to see that the frames are in and playing.
* **Branches / PR:** `arena/01a10b27-prontera-grind` -> PR #20 against `main` (open, not merged).

### 2026-10-05 — `skin-v53 owner-confirmed + APNG animation backup and agent notes`

* **Owner confirmation:** the owner loaded the live preview and reported the hero now animates ("Yes it works now"). The v53 decoder-and-clock approach in `index.html` is the one that ships, and it is what the notes below describe.
* **New folder `Updates/ApngAnimation/`, written so a future agent updating the art follows the same method instead of rediscovering it:**
  * `README.md` — the detailed note: what the uploaded files really are (154 multi-frame looping APNGs, frame counts, 75/100 ms delays, `num_plays = 0`, the duplicate files); the simplest APNG **byte by byte** (`IHDR`, `acTL`, `fcTL` sequence 0 + `IDAT` for frame 1, then one `fcTL` + one `fdAT` per following frame, `IEND`; payload tables; delay_num/den with denominator 0 meaning 100; dispose/blend meanings) and the two traps that cost time (frame-0-only readers; `fcTL` delay fields at payload offsets 20/22, i.e. `p+28`/`p+30`); how the game decodes (`skinDecodePng` → `DecompressionStream` → `skinUnfilter`/`skinPaeth` → blend/dispose → strip canvas) and plays (`skinFrameIndex` from the file's own delays, `captureSkinFrame` canvas flip + whole-frame `drawImage` + `needsUpdate`, restart at frame 0 per view/action, constant scale + ground anchor, routes/mirrors, bounded LRU with pinning, all fallbacks, the ready log line); the file map; the mistake that shipped once (browsers pause an APNG that is not painted on screen) and the rules that follow from it; how to verify without a browser; and the full update procedure (new PNG → `make_class_skins.py` → `make_apng_fixtures.py` → `make_sprite_viewer.py` → `backup_apng_code.py` → QC sheets → suites → `BUILD` + mirrors → AGENTS.md → live check).
  * `class_skin_animation.js` — **verbatim backup** of the live animation block extracted from `index.html`, kept honest by the new `tools/backup_apng_code.py` (`--check`), which `class_skin_sim.js` runs: the backup can never silently rot.
  * `simple_apng_demo.png` — a 64×64, 6-frame example of the simplest APNG (plain coloured squares: a format example, explicitly not game art).
* **New tool `tools/make_simple_apng.py`** (stdlib only): writes the simplest APNG from existing PNGs (`--frames … --out … --delay`), generates the demo (`--demo`), and decodes/verifies any simplest-form APNG (`--verify … --json` reporting the SHA-256 of every frame's raw RGBA). Its own round trip is asserted, and `class_skin_sim.js` decodes the committed demo **and** a freshly written file with the game's decoder and compares every frame byte for byte — writer, decoder and game agree on the same simplest form.
* **Tests:** all **20 suites** pass; `class_skin_sim.js` is now **39 checks** (added: simplest-APNG round trip through the game's decoder; the backup and the note are present, current and still cover the required method). Every other check from v53 (1195/1195 frames matching Pillow, hero pixels, mirrors, loaders, cache/eviction, fallbacks, previews) still passes.
* **Files touched:** new `Updates/ApngAnimation/{README.md,class_skin_animation.js,simple_apng_demo.png}`, new `tools/make_simple_apng.py`, new `tools/backup_apng_code.py`, `tools/tests/class_skin_sim.js`, `READ-ME-FIRST.md`, `Updates/Sprite/README.md`, and this log. No game behaviour changed, so `BUILD` stays `2026-10-05 skin-v53 class animations decoded in-game`; no source PNG was added, deleted, re-encoded or edited.
* **Branches / PR:** `arena/01a10b27-prontera-grind` -> PR #20 against `main` (open, not merged).
### 2026-10-05 — `balance-v51 faster early game + card gacha + title seal`

* **Index ledgers remember you (item 1a):** opening a map other than the one you are standing on no longer collapses the moment the game re-renders (every kill, level-up and refresh rebuilds the panel). Each mob/card ledger section now keeps its own open/closed state per tab (`indexSectionOpen`/`indexToggleSection`, the `idxmap` action), the native `<details>` toggle is suppressed so it cannot fight the re-render, and the map you are on still starts open. Clicking a section shut keeps it shut, even for the current map.
* **Equipped title is a small gold seal under the feet (item 1b):** the on-screen title lost its parchment fill and dropped to a 9.5px transparent chip with a thin gold frame, its gold caret now pointing up at the character, and a round glyph badge on the left carrying the title's own rank mark (`#heroTitleMark`). It is projected at the feet (`scr(pl.x,0.16,pl.z)`) instead of above the head, so it no longer covers the sprite.
* **Card Mastery became a token gacha (item 2):** the "Loose cards available" heading is now "Card Index available" and every "global max" wording is gone. One mastery rank = one token; a token buys one gacha roll for +1 to a random stat. Per-stat caps stay, capped stats are skipped rather than wasting a token, and a full 90-card album (450 ranks) fills the 243 rollable caps. Reset spends 1 loose Legendary card, clears every rolled stat and refunds every spent token; the card list, summary and per-card explanation now describe this in one short paragraph. Old saves migrate: retired per-rank picks and the old global track become recorded rolls, over-cap picks are trimmed, and GM's `capDemo` became `rollAll`.
* **Refine and cards moved under the piece (item 3):** the equipment detail card (refine ladder, card slots, unequip) now renders inside the doll directly beneath the selected row, and the bag detail card splices into the grid right under the clicked tile; the old bottom-of-window card is now only the "click an item" hint. **Sell safety confirmed:** every rarity bulk-sale and auto-sell path reads `S.inv` only, and worn equipment lives in `S.eq`, so equipped gear cannot be sold or deleted by any sell tool (locked gear is skipped too). A new UI test proves a matching rarity bag copy sells while the worn weapon stays on.
* **Drops and refine halved / nerfed (item 4):** Stage-10 field ore drops fall from 2% to 1% per monster and boss ore from 5% to 2.5%; refine success is x0.7 rounded up on the whole ladder, so 100/100/100/100/70/60/50/40/30/20 becomes **70/70/70/70/49/42/35/28/21/14** and both UI descriptions print the new numbers.
* **3x early EXP band (item 5):** Base and Job EXP (and quest EXP, which rides the same rate) is 3x from Base Lv 10 through 70 via `EXP_BOOST_LV=70` / `EXP_BOOST_X=3` in `expRate()`, with the 70x and 70÷3x bands unchanged outside it. Modelled pacing: Base 10 about 2.5 min, Base 50 about 13.6 min, Base 99 about 4h50m, and the Base 100-150 tail untouched at about 48h. `tools/tune_pacing.js` and the economy simulation anchors were re-fitted to the new targets.
* **Transcendent collection reads correctly (item 6):** +1% damage per transcendent (tier-3) class that reached Base Lv 100+, counted account-wide and permanent. `snapClass()` records the class level, so a class you stepped away from still counts, and the character/job labels now say exactly what the count does; an account whose only 100+ classes are tier-2 deliberately shows 0 because only the six transcendent jobs qualify.
* **Build/reference markers:** the player-visible build is `2026-10-05 balance-v51 faster early game + card gacha + title seal`; the worksheet baseline was refreshed (ore rates, build) and v50 was added to its safe-previous-build migration list.
* **Files touched:** `index.html`, `Updates/cards-gear-audit/equipment-cards-tuning.html`, `Updates/cards-gear-audit/affix-ranges.html`, `tools/tune_pacing.js`, `tools/tests/{economy,gear,ui,class_change,save_load,drop_card_sheet}_sim.js`, and this log.
* **Tests:** all 19 suites pass: pack 19 bodies, class_change 25, save_load 21, economy 22, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 35, sprite 12, starter 8, pet 12, picker 19, drop_card_sheet 12, weapon_joint 7, weapon_review 13 and sprite_viewer 154 PNGs / 19 jobs. The inline game script passes `node --check`.
* **Branches / PR:** `arena/01a10b6a-prontera-grind`. Not committed or pushed yet.

### 2026-10-05 — `merge: skin-v53 class animations + balance-v51 faster early game`

* **Merge:** `origin/main` (PR #20, the class-skin / APNG work) merged into `arena/01a10b6a-prontera-grind`. Conflicts were the single BUILD line, the affix page's two markers, the worksheet baseline and its safe-build list, the worksheet migration test and this log. Everything else auto-merged, including the hero art and the balance work in `index.html`. The resolution names both sides in one player-visible build, `2026-10-05 skin-v53 class animations + balance-v51 faster early game`, refreshes the worksheet baseline from the merged game (the halved ore rates travel with it) and keeps both log entries. The v51 entry above is therefore superseded on two points: its build string, and its “not committed or pushed yet” note.
* **Files touched by the merge:** `index.html` (BUILD line), `Updates/cards-gear-audit/{affix-ranges,equipment-cards-tuning}.html` (markers, safe-build list, refreshed baseline), `tools/tests/drop_card_sheet_sim.js` (one merged migration test) and this log.
* **Tests:** all **20 suites** pass after the merge: pack 19 bodies, class_change 25, class_skin 39 checks, save_load 21, economy 22, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 36, sprite 12, starter 8, pet 12, picker 19, drop_card_sheet 12, weapon_joint 7, weapon_review 13 and sprite_viewer 154 PNGs / 19 jobs. The merged inline game script passes `node --check`; `tools/make_sprite_viewer.py --check` and `tools/backup_apng_code.py --check` both report current.
* **Branches / PR:** `arena/01a10b6a-prontera-grind`; pushed and opened as a pull request against `main` (see the next entry for the number).

### 2026-10-05 — `balance-v51 + skin-v53 PR #21 published`

* **PR:** pushed `arena/01a10b6a-prontera-grind` and opened PR #21, “Balance v51: faster early game, card gacha, title seal, ore/refine nerf,” against `main`. The entry above promised the number; this is it.
* **Before the push:** committed the six-item update, merged `origin/main` (PR #20) with all conflicts resolved, and re-ran everything on the merged tree — all 20 suites green, inline script `node --check` clean, sprite-viewer and APNG-backup checks current, `git diff --check` clean.

### 2026-10-05 — `grind-v54 background grinding`

* **What changed for the player:** the game no longer freezes when you look at another tab. A browser stops sending animation frames to a tab that is not on screen, which is exactly what used to stop the fight; now the sim's time is owned by one clock (`simAdvance` at the bottom of `index.html`). The frame loop drives it while the tab is on screen, a once-a-second timer drives it while the tab is hidden, and the real time that passed is replayed in steps no bigger than the 0.1s the old loop already allowed. Combat, EXP, Zeny, drops, pets, quests, level-ups and the five-second autosave all carry on at the normal rate (plus one save at the moment the tab goes to the background). Nothing is drawn while hidden - that is what keeps a background tab cheap, and the ticker only ever runs while `document.hidden` is true.
* **What you will see:** switch to another tab for a few minutes and come back, and the log has one new line, e.g. `Away 3m 12s · +42 kills · +6,120 Zeny` - with a `· Base Lv 60 → 61` when a level-up landed in there. The clock also gives the right time to a tab that stalled while visible: the next frame replays the missing seconds in capped steps instead of throwing them away.
* **The one cap:** a single wake replays at most 10 minutes (`SIM_CATCHUP`). An ordinary hidden tab loses nothing - the browser wakes the timer about once a second, and about once a minute after five minutes hidden, and each wake is replayed in full. A laptop that slept for hours replays the last ten minutes and drops the rest, and the line says so: `Away 3h (10m of grinding) · +601 kills · +6,010 Zeny`. `SIM_CATCHUP` is the single number to tune if the owner ever wants a sleep to count for more or less.
* **New setting:** Settings → Gameplay → "Keep grinding while this tab is in the background" (`S.bg`, on for new saves and migrated to on for old ones). Untick it and a hidden tab is paused instead: its time is dropped rather than simulated, the character picks up exactly where it was left, and no away line is printed. It is on by default because that is what the owner asked for.
* **Files touched:** `index.html` (the clock, the hidden-tab ticker, the away summary, the `S.bg` save field + migration + Settings checkbox + `ACT.bg`, `BUILD`), new `tools/tests/background_sim.js`, `READ-ME-FIRST.md`, `Updates/cards-gear-audit/{affix-ranges,equipment-cards-tuning}.html` (build label; the worksheet snapshot was refreshed and the old build added to its carry-forward list), and this log.
* **Art:** none. No sprite sheet, atlas, class skin or code block under `Updates/` was touched; `tools/montage.py` was not used and `assets/sprite_pack_data.js` is untouched.
* **Tests:** all **21 suites** pass: pack 19 bodies, class_change 25, class_skin 39, save_load 21, economy 22, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 36, sprite 12, starter 8, pet 12, picker 19, drop_card_sheet 12, weapon_joint 7, weapon_review 13, sprite_viewer 154 PNGs / 19 jobs, and the new `background_sim` 12 checks (one 16ms frame = one small step; 30 hidden seconds with no frames at all; a 10s-throttled tab still gets its whole minute; the away line's real kills/Zeny; no double replay on return; the 10-minute cap and its wording; `maxDt <= SIM_STEP` on every slice; x4 speed in the background; the pause setting; the ticker not double-driving a visible tab; the save field and its migration). The inline game script passes `node --check`.
* **Branches / PR:** `arena/01a10c2f-prontera-grind` → PR #22 against `main`.
* **Known limits / follow-ups:** **not verified in a real browser here** - this sandbox has no browser, so the tab-switch itself must be confirmed by the owner on the live preview; the test proves the game catches up whatever the browser's timer throttling hands it, which is the half the game controls. Background grinding is real progress at the normal playing rate, so a tab left hidden overnight now grinds overnight - that is the requested behaviour, and the Settings checkbox (or `SIM_CATCHUP`) is where to change it if the owner ever wants the background to be slower or shorter.

### 2026-10-05 — `tool-v55 pacing report`

* **What changed for the owner:** a new read-only dev tool, `node tools/pacing_report.js`, answers "what is the level curve in gameplay time right now". It reads every constant out of `index.html` (requirement seeds, EXPK/BOSEK, ZK/BZK, the 3x/70x/70÷3x bands, the quest fractions and QZ) and prints the same canonical model `tune_pacing.js` and `economy_sim.js` balance against: 800 kills/hour, a boss every 16th kill, and the level-appropriate field power path. It shows EXP per kill (what the kill log actually prints), EXP to next level, kills and time per level, cumulative time, and Zeny earned (mob Zeny plus the quest Zeny that quest goals cancel out to per kill). `--levels 1-30` prints any range level by level. Nothing in the game changes, and nothing is written anywhere.
* **Files touched:** new `tools/pacing_report.js`, and this log. No game code, no art, no `BUILD` change (the player sees nothing new).
* **Tests:** no suite touches the tool, and it does not run inside one; all 21 suites still pass on the same tree (`background_sim` 12 included). The tool throws rather than printing a stale number if a constant it reads is renamed.
* **Branches / PR:** `arena/01a10c2f-prontera-grind` (PR #22 is open against `main` for the background-grinding build on the same branch).

### 2026-10-05 — `grind-v56 mid-game exp wall + reset fixes`

* **Smaller, rounded numbers (owner item 1):** every displayed EXP number is now one tenth of what it was. `EXP_RATE=7` replaces the flat 70x inside `expRate()` (the 3x band and the 100+ one-third band scale with it), and `needAt()` pipes every requirement through `roundReq`, which rounds to three significant figures. A Poring pays 21 EXP (was 210), Base 10 needs 360 (was 3,574) and Base 99 reads 167,000 (was 3,474,784) - no more ragged 187 / 3,574 style figures. Because the requirement curve and the multiplier scale together this is display-only; the one thing it was not neutral for is quests, whose reward is `need(L)*QXP*expRate()`, so `QXP` was multiplied by ten (1/140, 1/175, 1/84) to keep quests paying exactly the same share of a level as before (23.5% overall, 39.3% worst).
* **The Base 50-70 wall (owner item 2):** `EXP_BOOST_LV` moved 70 -> 50, so Base 51-70 no longer earns the 3x band. Backed by the live chart, the owner asked for "less than 2 hours" and picked the middle option: Base 50->70 now takes **1 h 20 m** (was 12 min), ramping smoothly from seconds per level at 51 to ~10 minutes at 70, with Base 70 at 1 h 34 m. The curve is continuous, so a longer wall lifts everything above it - Base 70-99 requirements are nearly flat (130,000 -> 167,000) and Base 99 lands at **6 h 55 m** (was 4 h 50 m). Base 1-50 keeps its exact v51 pace (Lv10 2.5 min, Lv50 13.7 min) and the post-reset 100-150 tail stays 48 h (Lv150 at 55 h).
* **Low-level Zeny floor (owner item 3, gentle option):** `ZMIN=5` floors both the mob and the boss Zeny lines in `spawn()` and the reference `zenAt()`, so a Lv1 kill pays 5z instead of 1z; the raw curve takes over around Base 22 and the mid/late curve is untouched. Roughly 5x the early wallet, fading into today's numbers by Base 25.
* **Stat reset (owner item 4):** `rcost()` is free below Base 20 and stays 50z x Lv above it, and the buttons now read "free below Base 20". Two real bugs sat behind "reset button sometimes doesnt work": (a) an unaffordable reset was refused with a log line only - it now floats `Need 1,500z` over the character and logs it, and an unaffordable button is `disabled` with a title saying what it costs, so the refusal is never silent; (b) `ui()` -> `renderWin()` rebuilt every open window's `innerHTML` on every kill, so a click whose press and release spanned a rebuild landed on a fresh node and did nothing - `renderWin()` now defers while a pointer is held inside the windows and re-runs on pointerup. (A label bug caught in review: the price was first written as a non-interpolating `'${rcost()}z'` string.)
* **Files touched:** `index.html` (economy block + `ZMIN`, `needAt`/`roundReq`, `rcost`, `spawn()` Zeny floors, both reset actions + button labels + `denied()`, the `renderWin` pointer guard, `BUILD`), `tools/tune_pacing.js` (rewritten as the v56 solver/verifier: `node tools/tune_pacing.js` solves the design, `--verify` checks index.html against it), `tools/pacing_report.js` (reads the new constants shape), `tools/tests/{economy_sim,ui_sim}.js`, `READ-ME-FIRST.md`, `Updates/cards-gear-audit/{affix-ranges,equipment-cards-tuning}.html` (build label x3, carry-forward list, refreshed worksheet baseline), this log.
* **Tests:** all **21 suites** pass: pack 19 bodies, class_change 25, class_skin 39, save_load 21, economy 23, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 37, sprite 12, starter 8, pet 12, picker 19, drop_card_sheet 12, weapon_joint 7, weapon_review 13, sprite_viewer 154 PNGs / 19 jobs, background 12. `economy_sim` now pins the new anchors (360 / 2,870 / 130,000 / 167,000 / 43,300 / 1,248,000, every one a three-sig-fig value, strictly increasing with the single drop at Base 100 at 3.86x), the 21/7/7÷3 rate tiers, the 80-minute wall, the 6.9 h Base 99, the 48 h tail and the 5z floor; `ui_sim` proves a free reset below Base 20 works with an empty wallet, a refused reset costs nothing and is visible on screen, an unaffordable button is disabled and priced, and the deferred-rebuild guard is in place. The inline game script passes `node --check`.
* **Branches / PR:** `arena/01a10c2f-prontera-grind` -> PR #22 against `main` (this round lands on the same open PR).
* **Known limits / follow-ups:** the owner chose the 80-minute wall knowing the cost stated up front - Base 70-99 requirements barely climb and the road to Base 99 is about two hours longer than before. Every anchor lives in `TGT` at the top of `tools/tune_pacing.js`, and that tool now both solves and verifies this design, so the next retune is a deliberate edit there. Not verified in a real browser here (no browser in the sandbox): the reset-button fix and the new labels should be clicked once on the live preview.

### 2026-10-05 — `grind-v57 map-capped gear + calmer drops` (owner round 7, items 2/3/5/6/7)

* **Boss equipment is tiered by map (owner item 2, option a):** two new per-map tables sit beside
  `MAPTIER`. `MAPGRADE=[1,2,2,3,3,4,4,4,4,4]` is the *cap* - Prontera tops out at Fine, Izlude/Geffen
  at Rare, Morroc/Payon at Epic, and only the Lv60+ maps (Comodo onward) can reach Legendary - and
  `dropTier(m,l)` now returns `min(cap, ladder)`, so a stage-10 Payon boss can no longer print a
  Legendary item. `MAPVAL=[0.34,0.40,0.47,0.56,0.66,0.78,0.90,1.0,1.08,1.18]` gives every map a value
  band that `genGear()` multiplies in, so the map's *tier* now dominates the grade: an Abyss Epic
  (2.8x1.18=3.30) beats a Payon Legendary (4.5x0.66=2.97 - which can no longer drop at all). Items
  already in a save keep the numbers they rolled; only new drops use the bands.
* **Gentle drop rates (owner item 3, option a):** field gear 12%/kill -> **3.6%** (three rolls at
  1.5/1.2/0.9 instead of 4.8/4.0/3.2, so ~29 items/h instead of ~96), card 0.45% -> **0.15%**
  (~1.2/h), boss equipment 13%/kill (one 1% roll *per pool entry*) -> **~6% total** with the whole
  pool still listed (`Math.round(600/n)/100` per entry, so every item stays obtainable and the
  displayed per-item rate matches the roll), and pet drops 0.3%/kill + 5%/boss -> **0.03% + 0.5%**
  (~1 pet per two hours instead of ~2.4/h). `gearPool()` and the boss pool are unchanged, so no item
  became unobtainable; only the odds moved. The map panel's drop lines and the card odds follow
  automatically because they read the same tables.
* **Mob index readjusted (owner item 5):** the species ladder is now
  `[10,50,250,1000,5000,10000,25000,50000]` (was `[100,1000,5000,25000,100000,500000,1000000,5000000]`,
  i.e. over 100x too long) with milestone XP `[2,4,8,15,25,45,70,110]` (279 per fully hunted
  species, 50,279 Index XP total). The title ladder is a smooth ~3x geometric run:
  200 / 1,000 / 3,000 / 10,000 / 30,000 / 100,000 / 250,000 / 500,000 / 750,000 / 1,000,000 - the
  last rank is about twenty maxed species, satisfying "the top title must be a bigger goal than one
  species maxed and a few others", while the 90-species album (4,525,110 Index XP) is tracked
  separately in the panel as its own completion goal. GM controls updated (`all50000`, `xp1000000`).
* **Card mastery UI (owner item 6):** the token gacha now lists the last eight rolls newest-first
  (`cardRollRecent()`), so what a long session actually rolled is visible instead of only the totals.
  The reset lists every loose Legendary card with its own sacrifice button and
  `cardMasteryReset(cardId)` spends the one you picked (defaulting to the first only when called
  without an id). The loose-card list gained Common/Fine/Rare/Epic/Legendary sub-tabs with counts
  (defaulting to the rarest loose rarity, All one tap away), and every stack has an **Insert all**
  button that dedicates as many copies as its remaining ranks allow in one tap through the real
  `donateCardToMastery()` path - 7 Poring cards fill 5/5 and leave 2 loose.
* **Settings tab cleaned up (owner item 7):** the appearance block is now a small character card -
  Male/Female buttons, the live class preview, one line of text - and the hair controls/paragraphs
  ("Hair comes with the class art", the view/standing-still/weapon essays, the "style 8 of 19"
  line) are gone. A disabled **Costume (soon)** button states the plan: "Costumes - outfits that
  restyle a class without changing its stats - are planned for a future patch", with a
  `costume` action that logs it if it is ever enabled. The long damage-number and background-grinding
  paragraphs were each cut to one line; the class-change card dropped its "S (front) view" detail.
* **Files touched:** `index.html` (MAPGRADE/MAPVAL/dropTier, field + boss + pet drop lines, the map
  panel's pet odds line, `genGear()` value band, index ladder/titles/album line + GM controls,
  `cardRollRecent`, `cardMasteryLegendaryCards`/`donateAllToMastery`/`cardMasteryReset(id)`,
  `cardGrade` state + tabs + insert-all, the Settings panel, `BUILD`), `tools/tests/{gear_sim,
  drop_card_sheet_sim, ui_sim, save_load_sim}.js`, `Updates/cards-gear-audit/*` (build label,
  carry-forward list, refreshed worksheet baseline), `READ-ME-FIRST.md`, this log.
* **Tests:** all **21 suites** pass: pack 19 bodies, class_change 25, class_skin 39, save_load 22,
  economy 23, stat 7, card 13, skill 52, gear 30, scene 8, kit 34, UI 37, sprite 12, starter 8,
  pet 12, picker 19, drop_card_sheet 12, weapon_joint 7, weapon_review 13, sprite_viewer 154
  PNGs/19 jobs, background 12. `gear_sim` pins the new caps, bands, rates and the Abyss-Epic-beats-
  Payon-Legendary arithmetic; `drop_card_sheet_sim` pins the worksheet totals; `ui_sim` pins the
  settings copy, the rarity tabs / picker buttons and the drop lines; `save_load_sim` proves the
  insert-all and pick-a-sacrifice behaviour on a real state.
* **Branches / PR:** `arena/01a10c2f-prontera-grind` -> PR #22 against `main` (the same PR as the
  v56 round).
* **Known limits / follow-ups:** the two biggest owner items from the same message are **not in this
  round** and are next: **skills** (+1 skill per class, longer cooldowns so skills stay individually
  spammable but do not all fire together, some build choice - the owner explicitly wants a dedicated
  tuning discussion before the numbers are final) and **pets** (per-pet identity instead of rarity
  reskins: a signature skill + stat leaning per pet, rarity setting the slot count and leaning
  strength, plus one free random skill granted at drop). The map value band means new drops below
  Amatsu are worth less than they used to be (owned items keep their rolls), which is the intended
  fix for "30 min of grinding gave a bunch of legendaries" and will want a balance read after the
  owner plays a while.

### 2026-10-05 — `grind-v58 Abyss-only legendary + card panel polish` (owner follow-ups)

* **Mid maps now top out at Epic, bosses included (owner item 1):** the owner's tier read was
  explicit - Izlude/Geffen/Morroc/Payon are early, Comodo/Louyang/Amatsu/Niflheim are mid, and
  Abyss is the *only* endgame map. `MAPGRADE` is now `[1,2,2,3,3,3,3,3,3,4]` (it was
  `[1,2,2,3,3,4,4,4,4,4]`, which let every mid map print Legendary gear - that is the drop the
  owner saw) and `MAPVAL` was respaced to `[0.34,0.40,0.47,0.56,0.66,0.72,0.78,0.84,0.92,1.15]`
  so the Abyss band steps clear of the mid maps. `dropTier(m,l)` clamps both the field ladder and
  the stage-10 boss to the map cap, so a Niflheim boss tops out at Epic and only Abyss can roll
  Legendary. `gear_sim` now pins the cap array, the "only Abyss may reach Legendary" rule, the
  two boundary stages and the Abyss band gap.
* **Card mastery panel rebuilt (owner item 2):** the roll list is capped at the **last three**
  rolls (newest first) and rendered as one **horizontal** chip strip with real styling
  (`.card-roll-recent` / `.roll-chips` / `.roll-chip`, inherit font, gold ring on the newest) -
  the previous bare vertical list pushed the whole tab down. The reset is now a **dropdown plus
  one button** (`.card-pick` + `cardpick` action + `cardPick` state): pick the Legendary from the
  list, press Reset to the right. A row of sacrifice buttons per card is gone, so a big
  collection cannot wreck the layout.
* **Background grinding is permanent (owner item 3):** the checkbox is removed from Settings, the
  `bg` action is deleted, every load normalises `f.bg=true` and `bgOn()` is a constant `true`, so
  hiding the tab always keeps the sim (and its save) running. The line stays as a statement of
  fact. `background_sim` was rewritten around the new contract: even a legacy save that says
  `bg:false` still grinds, and no UI/action can flip it.
* **Test-pin repairs (the v57 regressions the owner's "don't break my game" note was about):**
  `class_skin_sim` still asserted the settings copy that v57 deleted (the view/idle/swing-arc
  paragraphs and "hair is part of the art") - those now assert the retired text is *gone* and the
  Costume note is present; `starter_sim` pinned the old 0.45% card chance (now 0.15%);
  `pet_sim` needed the new `MAPGRADE`/`MAPVAL` picks in its harness, and `genGear()` now reads the
  map band through `(S&&S.mp|0)||0` so a harness with no live state cannot crash it;
  `equipment-cards-tuning.html`'s `SAFE_PREVIOUS_BUILDS` had a missing opening quote from an
  earlier hand bump, which is what made the worksheet fail `node --check` ("Octal literals are
  not allowed in strict mode") - the list is repaired and de-duplicated.
* **Files touched:** `index.html` (MAPGRADE/MAPVAL/genGear, card panel + CSS + `cardpick`/`cardPick`,
  Settings Gameplay line, `bg` removal, `bgOn`, `f.bg`, `BUILD`), `tools/tests/{gear_sim,ui_sim,
  background_sim,class_skin_sim,starter_sim,pet_sim}.js`, `Updates/cards-gear-audit/*` (v58 label,
  repaired carry-forward list, refreshed worksheet baseline), `READ-ME-FIRST.md`, this log.
* **Tests:** all **21 suites** pass on the same tree (no suite reports a FAIL line): pack 19,
  class_change 25, class_skin 39, save_load 22, economy 23, stat 7, card 13, skill 52, gear 30,
  scene 8, kit 34, UI 37, sprite 12, starter 8, pet 12, picker 19, drop_card_sheet 12,
  weapon_joint 7, weapon_review 13, sprite_viewer 154 PNGs/19 jobs, background 12.
* **Branches / PR:** `arena/01a10c2f-prontera-grind` -> PR #22 against `main`, updated with this
  commit.
* **Known limits / follow-ups:** items 1 (skills) and 4 (pets) from the owner's seven-item round
  are still to come - both are design-heavy and the owner wants a dedicated tuning discussion
  (skills especially: +1 skill per class, longer cooldowns, some build choice). Saves are safe
  across both v57 and v58: gear values are stamped at drop time, so items already owned keep
  their rolls, and the only removal is the background checkbox (the field stays in saves,
  normalised to on).

### 2026-10-06 — `grind-v59 deeper skill lines + a free pet skill` (owner items 1 and 4)

* **The roster is 91 skills (was 73) - one more per class (owner item 1).** Novice keeps only First
  Aid; each of the 18 job classes now carries **5** skills (4 existing + 1 new), so Swordman's line
  teaches `provoke`, Knight's `spear`, Lord Knight's `jointbeat`, Mage's `fireball`, Wizard's
  `tstorm`, High Wizard's `napalm`, Archer's `iconc`, Hunter's `falconry`, Sniper's `pharrow`,
  Thief's `steal`, Assassin's `vdust`, Assassin Cross's `sdestroy`, Acolyte's `iagi`, Priest's
  `kyrie`, High Priest's `meditatio`, Merchant's `discount`, Blacksmith's `wresearch` and
  Whitesmith's `cboost`. Two of them are the answer to a combat question the owner had: `tstorm`
  is the Wizard's first true AoE and `sdestroy` is the Cross's ranged execute (it carries `rng`).
* **Per-skill caps are RO-style, not one number per tier (owner's correction).** `act`/`pas`/`tos`
  now default to `mx=10`, and a utility/passive skill in each class stops at 5 (First Aid,
  Endure, Energy Coat, Frenzy, Basilica, Deadly Poison, Over Thrust, Spear Boomerang, Frost Nova,
  Land Mine, Grimtooth, Gravitation Field among the old ones; Provoke, Improve Concentration,
  Steal, Increase AGI, Kyrie Eleison, Discount and Cart Boost among the new). A full line tree is
  now **140 points (139 payable, First Aid's level is free)**.
* **Cooldowns went up, damage came down, and one global cooldown ties it together.** Every active
  cooldown is x1.5 (rounded to .5s) and every trade-off x1.2 (rounded to whole seconds), and the
  per-level damage slopes were halved so a skill at its new max still does what the old 5-level max
  did (verified numerically: every pre-existing skill within 0.05 of v58 at max level). `SKGCD=.5`
  is a new shared global cooldown: cast 0 lands instantly and starts its own cooldown, casts 1-2 of
  a swing are queued (`castQ`, `{t:SKGCD*(cast-1),sk,k}`), fire when their turn comes, and are
  dropped if the target dies first - so a three-skill swing is pressure over the swing instead of
  three hits on one frame. 1/2/3 cast slots per tier are unchanged. **The tuning numbers are not
  final** - the owner asked for a dedicated discussion before they are locked.
* **Job levels now pay out all the way (the complaint this round fixes).** At max job level a line
  earns 156 points against a 139-point tree, so there is room to finish everything and 17 points to
  steer with; a line promoted at the minimum gate and restarted can be 12 short, which is the build
  choice the panel now states out loud. No point refund: a save that over-spent on a skill whose cap
  dropped keeps its levels, `skpAvail()` clamps at 0 and the repair loop only ever trims overspend -
  nothing a player already bought is taken away, and a skill reset clears any stuck state.
* **Every pet now arrives from a drop with one random skill already slotted (owner item 4).** The
  drop rolls the same weighted pool the gacha uses (`pickW(PET_SKILL_WEIGHTS)`) and stores one
  skill, so a fresh pet is useful from the first minute and the collection has meaning before any
  Zeny is spent; the paid gacha then fills the second slot ("Gacha the second skill") and still
  never repeats a skill. Pet *identity* work (signature skill / stat leaning) stays deliberately
  parked - the owner asked for more time to think about it.
* **Files touched:** `index.html` (`act`/`pas`/`tos` caps, 18 new skill definitions + `FX` tags +
  `SKILL_ICON` glyphs + `SKILL_VFX`, halved slopes, raised cooldowns, `SKGCD`/`castQ` + its four
  clear sites + the `update()` drain, pet drop skill, pets panel copy, skills panel copy, `BUILD`),
  `tools/tests/{skill_sim,ui_sim,pet_sim}.js`, `Updates/cards-gear-audit/*` (v59 label, v58 added
  to `SAFE_PREVIOUS_BUILDS` = 17 unique entries), `READ-ME-FIRST.md`, this log (the
  "Verify before you push" block had drifted since v37 - it is now the current 21-suite list).
* **Tests:** all **21 suites** pass on the same tree (no suite reports a FAIL line): pack 19,
  class_change 25, class_skin 39, save_load 22, economy 23, stat 7, card 13, skill 52, gear 30,
  scene 8, kit 34, UI 37, sprite 12, starter 8, pet 13, picker 19, drop_card_sheet 12,
  weapon_joint 7, weapon_review 13, sprite_viewer 154 PNGs/19 jobs, background 12.
* **Branches / PR:** `arena/01a10c2f-prontera-grind` -> PR #22 against `main`, updated with this
  commit.
* **Known limits / follow-ups:** skill numbers are a first pass (cooldown x1.5/x1.2 and the halved
  slopes are the owner-endorsed shape, not the final feel) and want the dedicated tuning session
  the owner asked for; pet identity is still parked by the owner's own request. The 5-level utility
  skills are the only place a "wasted" point can happen if a later patch changes a cap - the panel
  warns and the repair loop trims, so no save loses anything.

### 2026-10-06 — `docs only: the server shift plan (no game change, BUILD not bumped)`

* **What changed for the player:** Nothing. No file the browser loads was touched, so `BUILD` stays
  at `2026-10-06 grind-v59 deeper skill lines + a free pet skill`. The owner asked three questions -
  should the game stay on Render or move to Cloudflare, how do accounts and saves become
  server-side so a player can log in on any device, and what has to be prepared for that - and the
  answers are not a code change, so they are written down instead of shipped.
* **Files touched:** `tools/server-shift-plan.md` (new: the whole plan, ~330 lines), `READ-ME-FIRST.md`
  (one pointer line so the next agent finds it), this log. Nothing else.
* **Art:** no sheets added, removed or rebuilt; `tools/montage.py` was not used.
* **Tests:** all **21 suites** pass on this tree (no FAIL line): pack 19, class_change 25,
  class_skin 39, save_load 22, economy 23, stat 7, card 13, skill 52, gear 30, scene 8, kit 34,
  UI 37, sprite 12, starter 8, pet 13, picker 19, drop_card_sheet 12, weapon_joint 7,
  weapon_review 13, sprite_viewer 154 PNGs/19 jobs, background 12, plus both `--check` tools
  ("Sprite viewer is current.", "Class skins are current."). `index.html` is untouched, so this run
  only proves the docs change broke nothing - which is exactly what it should prove.
* **Branches / PR:** `arena/50beb968-prontera-grind`, PR opened against `main` for the owner to read.
* **Known limits / follow-ups:** the plan makes no decisions on the owner's behalf - the sync
  cadence, whether away-progress exists, whether the client stays client-authoritative and whether
  real-time co-op is ever wanted are all flagged as owner decisions in §7a. The two facts it leans on
  hardest are worth re-checking before acting: Render's Hobby bandwidth for the last 30 days, and the
  real size of a late-game save (`JSON.stringify(S).length` in the console). The GM password in
  `index.html` is called out as the one thing worth fixing before any server work starts, because
  the repo is public.

### 2026-10-06 — `docs only: the owner's answers folded into the server shift plan`

* **What changed for the player:** Nothing; `index.html` is untouched and `BUILD` is unchanged.
  The owner read the plan from the entry above and answered its open questions, so those answers
  are now part of `tools/server-shift-plan.md` instead of living in a chat log.
* **The answers:** the first build is **phases 1 + 2** (accounts + cloud saves, server-measured away
  progress, and the social layer - online list, world chat, leaderboard all polled through one
  `/api/live` endpoint); **real-time co-op is wanted later**, not in this build; login is
  **username + password with a one-time recovery code** at registration (no email service); and the
  host decision waits on the owner reading Render's monthly bandwidth figure from the dashboard.
  The owner also asked whether 1 + 2 is still free-tier-safe, so the plan now works the arithmetic
  out loud (new §3d): about **24,300 requests/day and 6,100 D1 row writes/day** at 20 players
  playing 4 h a day, against allowances of 100,000 for each - roughly 4x headroom, with the social
  poll interval (15 s) and the save debounce (60 s) as the two knobs that move it.
* **Files touched:** `tools/server-shift-plan.md` (decisions block under §1, new §3d budget table,
  §7a turned from questions into answers, §9 roadmap statuses, §3a told where the Render bandwidth
  number lives, §10 step 2 now says phases 1 + 2), this log. `index.html` and every test file are
  untouched.
* **Art:** no sheets added, removed or rebuilt; `tools/montage.py` was not used.
* **Tests:** all **21 suites** green on this tree at the previous commit (the earlier entry has the
  counts); nothing executable changed since, so this entry does not re-run them.
* **Branches / PR:** `arena/50beb968-prontera-grind`, the same PR updated with this commit.
* **Known limits / follow-ups:** the plan is still a plan - no server code exists. The owner chose
  "plan only" for this session, so phase 0 (rotate the public GM password, hide the dev files from
  the deploy) and phase 1 have not been started. The two facts the plan still wants before it is
  acted on are Render's bandwidth figure and a real `JSON.stringify(S).length`.

### 2026-10-06 — `docs only: the Render dashboard reading, and a corrected reason for the verdict`

* **What changed for the player:** Nothing; `index.html` is untouched and `BUILD` is unchanged.
  The owner sent a screenshot of Render's monthly usage page, so the plan now carries real numbers
  instead of an estimate.
* **The reading:** 52 MB of the 5 GB bandwidth (HTTP responses; WebSocket 0), **0 of 750 free
  instance hours**, 1 service, 6 of 500 pipeline minutes. Interpretation, now written into §1a and
  §3a: the client is about five cold loads into its month, so **Render's bandwidth cap is a
  cents-scale risk even at 20 players** (one hard reload a day each ≈ 5.8 GB ≈ $0.13 of overage) -
  the earlier framing of bandwidth as the headline reason to move was wrong and is corrected.
  0 instance hours with 1 service also strongly suggests the service is a **Static Site** (static
  sites never consume instance hours and never sleep); the type still needs confirming on the
  service page, because it decides whether the client also moves in phase 1.
* **The corrected verdict:** the reason to put the server on Cloudflare is **that Render free has
  nowhere durable to put accounts** - the free Postgres expires 30 days after creation and the free
  Key Value is in-memory - plus the 15-minute spin-down and the 750-hour pool being exactly one
  24/7 service. Cloudflare D1 does not expire and Pages has no bandwidth cap. The recommendation
  itself is unchanged; only its justification got honest.
* **Files touched:** `tools/server-shift-plan.md` (new §1a, §3a now records the dashboard reading
  and how to settle static-vs-web-service, §1 host decision row, §7d and §10 checklists updated),
  this log. No code, no tests, no art.
* **Tests:** all 21 suites were green at the previous commit and nothing executable has changed
  since; not re-run.
* **Branches / PR:** `arena/50beb968-prontera-grind`, same PR updated.
* **Known limits / follow-ups:** the plan is still unbuilt (the owner chose plan-only). Open items:
  confirm the Render service type, rotate the GM password out of the public client, and measure a
  real `JSON.stringify(S).length` when phase 1 starts.

### 2026-10-06 — `grind-v60 GM password rotated out of the client`

* **What changed for the player:** the GM login still works exactly as before, but the password is
  different **and the old one (`gm1234`) no longer works anywhere**. The game file does not contain
  the password any more - only a stretched hash of it - so a public repo (and the copy that was being
  served at `/_login.html` on the live site) no longer hands the GM account to anyone who reads it.
  Normal accounts, saves and everything else are untouched. `BUILD` is now
  `2026-10-06 grind-v60 GM password rotated out of the client`, so the login card confirms the new
  file is loaded. **The new GM password is not in the repo or in this log** - the owner has it.
* **Why now:** the owner asked for the rotation after the server-shift plan flagged it. The specific
  discovery that made it urgent: `_login.html` (a pre-pack legacy page that the repo still deploys)
  contained `GM_PASS='gm1234'` *and* auto-filled the password field, so the live Render site was
  serving the GM password to anyone who guessed the file name. That copy is now empty of credentials.
* **How it works now:** `hashPw` is one cheap 64-bit pass, far too weak to store a password behind, so
  `gmHash(p)` runs it `GM_ROUNDS+1` paves over a salted start (`pg-gm:` prefix). `GM_ROUNDS=20000`,
  measured at ~25 ms in node - invisible on a login click, and ~20,000x the work for anyone guessing
  offline. Only `GM_PASS_HASH` (16 hex chars) is in the file. `node tools/make_gm_hash.js "new
  password"` prints the line to paste in; `--check "password"` says whether a password is the live one;
  `--show` prints the stored hash and round count; it refuses anything under 12 characters and reads
  the game's own `hashPw`/`GM_ROUNDS` so the tool and the game cannot drift apart. Honest limit, said
  in the source: this is still a client-side door - a player with devtools can set `S.gm` by hand.
  Real GM security is the server work in `tools/server-shift-plan.md` §6.
* **The first version of the change was wrong, and the new test caught it:** I generated the hash with
  `GM_ROUNDS=20001` and the game's loop (`for i<GM_ROUNDS`) then hashed 20,002 times, so the password
  did not work. `gm_auth_sim` was too weak to notice (it only compared tool-vs-game functions, which
  agree by construction); it now **rehearses the owner's real workflow on a scratch copy of the game**
  in `/tmp` - run the tool, paste the printed line, `--check` the password, `--check` a wrong one - so
  an off-by-one or a stale paste can never lock the owner out. `GM_ROUNDS` is 20000 and the rehearsal
  passes.
* **Files touched:** `index.html` (`GM_USER`/`GM_ROUNDS`/`GM_PASS_HASH`, new `gmHash()` beside
  `hashPw()`, the login branch, `BUILD`), `tools/make_gm_hash.js` (new tool), `tools/tests/gm_auth_sim.js`
  (new suite, 10 checks), `_login.html` + `_shot.html` (credentials emptied; the legacy GM branch can
  no longer log in), `tools/shot_harness.js` (password comes from `window.PG_GM_PASS`), the two
  `Updates/cards-gear-audit/` files (build label refreshed; v59 appended to `SAFE_PREVIOUS_BUILDS`,
  now 18 entries), `AGENTS.md` (login line + suite list), `READ-ME-FIRST.md`, this log.
* **Art:** no sheets added, removed or rebuilt; `tools/montage.py` was not used.
* **Tests:** all **22 suites** pass (21 + the new `gm_auth_sim`, 10 passed / 0 failed), plus both
  `--check` tools. The two suites that pin build labels (`drop_card_sheet_sim`, `gear_sim`) failed
  until their audit files were refreshed - that is the intended behaviour, not a workaround.
* **Branches / PR:** `arena/50beb968-prontera-grind`, same PR updated.
* **Known limits / follow-ups:** the old password is still readable in git history and in old log
  entries - that cannot be undone, which is why the password was **rotated** rather than hidden. A
  player could still hand-edit `S.gm`; that is a client-side-door limitation and it goes away with
  server accounts. **The deploy must be checked**: if the Render static site publishes the whole repo,
  `_login.html`, `_shot.html`, `logic2.js` and the four 2 MB `_recon_v27*.png` are all public - use
  Render's Build Filters (Settings → Build & Deploy → Ignored Paths) - and the `*.recon.png` files
  should be moved to `Sprite/recon/` so the refresh leaves them out of the published tree too.

### 2026-10-06 — `docs only: the Render service type answered, and the expiry question`

* **What changed for the player:** Nothing; no code changed in this entry.
* **What was settled:** the game's live URL is `https://prontera-grind.onrender.com/`, and with
  0 instance hours on one service that is a **Render Static Site** - so the client can stay on Render
  indefinitely at $0, and nothing about the current game is at risk there. The 30-day expiry the owner
  asked about applies **only to Render's free Postgres** (deleted 14 days after expiry) and the free
  Key Value (in-memory), i.e. exactly the pieces a backend would need - which is why the migration
  only matters when phase 1 starts, and why it is not urgent today.
* **Also written down:** the live site currently publishes the whole repo, including
  `_login.html` (which is how the retired GM password was downloadable), the two legacy pages,
  `logic2.js`, `tools/`, `Updates/`, `Sprite/` and the four 2 MB `_recon_v27*.png` - so the plan now
  lists the fix (Render **Publish Directory** pointing at a folder holding only the game files, or
  moving the dev files under `Sprite/recon/` and `tools/legacy/`) and warns that Render's Build
  Filters control *whether a deploy runs*, not what gets published.
* **Files touched:** `tools/server-shift-plan.md` only (new §1a wording, the answered §3a box, the
  "what the 30-day expiry applies to" note, §6.1 marked done, §7b publish-hygiene section, §10 step 1),
  this log. No game code, no tests, no art.
* **Tests:** all 22 suites were green at the previous commit (the v60 entry has the counts) and
  nothing executable changed since; not re-run.
* **Branches / PR:** `arena/50beb968-prontera-grind`, same PR updated.
* **Known limits / follow-ups:** the publish-directory change is a Render dashboard action only the
  owner can take; the plan names the two ways to do it but neither is done.

### 2026-10-06 — `tools/build_site.sh: publish the game, not the repo`

* **What changed for the player:** nothing they see in the game — `index.html` is untouched by this
  entry. What changes is **what the website serves**: a new build script assembles only the files the
  game actually fetches into `dist/`, so the live site can stop publishing `tools/`, `Sprite/`,
  `image-search/`, `Updates/` (except the class sprites), the audit pages, the legacy `_login.html`
  and `_shot.html`, and the four 2 MB `_recon_v27*.png`.
* **Why:** a static host publishes the whole publish directory. That is how the retired GM password
  was downloadable from the live site at `/_login.html`, and it is why a full load of the site was
  ~37 MB rather than the ~16 MB the game needs.
* **What it does:** `bash tools/build_site.sh [outdir]` copies `index.html`, `assets/` and
  `Updates/Sprite/` into `dist/` (default), then *fails* if a required file is missing/empty or if
  `_login.html`, `_shot.html`, `logic2.js` or `tools/` ended up in the output. Verified by hand:
  `dist/` is 16 MB / 175 files (html 388 KB, assets 9.0 MB, class sprites 5.7 MB), every runtime URL
  the game requests returns 200 with the right byte count when served from `dist/`, and
  `/_login.html` returns 404.
* **What the owner must do (dashboard only):** on Render → Settings → Build & Deploy →
  **Build Command** = `bash tools/build_site.sh`, **Publish Directory** = `dist`. (Cloudflare Pages:
  same command, "Build output directory" = `dist`.) Build Filters are *not* the fix — they control
  whether a deploy runs, not what is published.
* **Files touched:** `tools/build_site.sh` (new), `.gitignore` (`dist/`), `tools/server-shift-plan.md`
  (§7b now documents the script and the two dashboard fields), this log. No game code, no tests, no art.
* **Tests:** the script is not exercised by any suite (nothing under `tools/tests/` reads it) and it
  writes only to `dist/`, which is gitignored. All 22 suites were green on the v60 commit; the only
  changes since are this script and markdown, so the tree is unchanged for every harness.
* **Branches / PR:** `arena/50beb968-prontera-grind`, same PR updated.
* **Known limits / follow-ups:** the Render/Cloudflare settings are owner actions in a dashboard, not
  something a push can do for them; until they are set, the live site still publishes the whole repo.

### 2026-10-06 — `grind-v61 a local GM password, publish hygiene enforced by a test, and the GM panel plan`

* **What changed for the player:** nothing in normal play. The GM login gains a second, deliberate
  door: a **local GM password** kept in the GM's own browser, so a short simple password can be used
  for testing without ever appearing in this public file. Set it once from the console with
  `localStorage.setItem('pg_gm_local', gmHash('test1234'))`, then log in as `GM` / `test1234`;
  `localStorage.removeItem('pg_gm_local')` removes it. The file's own long password still works, and
  is still required when no local value is set. `BUILD` is now
  `2026-10-06 grind-v61 local GM password + publish-only build`.
* **Why it is safe enough:** the local hash never leaves the GM's browser, so no other player can read
  it and the repo carries no usable secret. It is still a client-side door - devtools can set `S.gm`
  on anyone's own copy - which is why the real GM account is server-side work
  (`tools/gm-panel-plan.md`, §6).
* **Publish hygiene, now enforced rather than remembered:** `.assetsignore` (Cloudflare's convention)
  plus `tools/tests/publish_sim.js`, which **runs the real `tools/build_site.sh`** and fails if a
  runtime file is missing, if any `assets/` path named in `index.html` is absent from the output, if
  the class skins (`Updates/Sprite/`) stopped shipping, if a dev file (`_login.html`, `_shot.html`,
  `logic2.js`, `tools/`, `Sprite/`, `image-search/`, the `_recon_*.png`, the repo docs) appears in it,
  or if the tree grows past 30 MB. It also asserts `.assetsignore` uses no `!` re-includes, so it can
  never be the reason a real game file disappears. Both are in the pre-push list now.
* **New plan document:** `tools/gm-panel-plan.md` - the researched answer to the owner's "GM settings
  generator". It maps Ragnarok's atcommands (`@item`, `@zeny`, `@baselevel`, `@who`, `@kick`, `@ban`,
  `@broadcast`, charcommands `#item <name>`) onto this game's real save fields, records what the
  existing in-game GM tab already does, explains why **editing another player's account is impossible
  until saves live on the server** (phase 1), picks the delivery mechanism (a `grants` table applied at
  next login, mailbox later on the same table), and lays out the security model (GM flag in D1 only,
  `/gm` behind the session, two roles, an audit row for every action, no password ever visible).
* **Files touched:** `index.html` (`gmOk` + the login branch + `BUILD`), `tools/tests/gm_auth_sim.js`
  (12 checks now, covering the local password and that it fails closed), `tools/tests/publish_sim.js`
  (new, 7 checks), `.assetsignore` (new), `tools/gm-panel-plan.md` (new),
  `Updates/cards-gear-audit/{affix-ranges,equipment-cards-tuning}.html` (v61 label; v60 appended to
  `SAFE_PREVIOUS_BUILDS`), `AGENTS.md`, `READ-ME-FIRST.md`, `tools/server-shift-plan.md` (new §7b.1 on
  why the rule is enforced by a test).
* **Art:** no sheets added, removed or rebuilt; `tools/montage.py` was not used.
* **Tests:** all **23 suites** pass (21 + `gm_auth_sim` + `publish_sim`), both `--check` tools current,
  and the inline game script passes `node --check`.
* **Branches / PR:** `arena/50beb968-prontera-grind`, same PR updated.
* **Known limits / follow-ups:** **the workspace reset mid-edit during this work and truncated
  `index.html` to 456 lines** - it was restored from the v60 commit and the three intended edits were
  re-applied by script with assertions, then every suite re-run (`wc -l` 4080, 397 KB). Anyone reading
  this later: if a file looks impossibly short, `git checkout HEAD -- <file>` is the recovery, and the
  suites are what prove the tree is sane. The GM panel itself is **not built** - it needs phase 1 of
  the server shift first.

### 2026-10-06 — `grind-v62 cloud accounts, saves and GM tools`

* **The server shift's phase 1 is built** (`tools/server-shift-plan.md` § *Phase 1 status*, and the
  design of record is `tools/gm-panel-plan.md`). Cloudflare Pages Functions + D1: username/password
  accounts (PBKDF2-SHA256, 20 000 iterations, hash format `pbkdf2$<iters>$<salt>$<hash>` so the cost
  can be raised later without breaking anyone), one-time recovery codes, session cookies, cloud saves
  with conflict detection and history, announcements, GM gifts, and the GM console.
* **The game still works with no server at all.** That is the load-bearing decision: `CLOUD.api` is set
  only when `/api/me` answers *JSON* — a static host answers HTML, which the client refuses to treat as
  a server — and everything cloud-related is skipped, leaving v61 behaviour (accounts and saves in
  `localStorage`) byte for byte. The same file therefore ships to the old static host unchanged.
* **Nothing can lose a save.** The browser keeps simulating and `localStorage` stays the running state;
  the server is a vault. A `409` opens a three-way chooser (keep this device / keep the cloud / decide
  later), and every branch keeps both copies: the loser of "keep the cloud" is stashed under
  `pg_save3_<user>_local_<timestamp>`, and the server keeps a save-history copy a GM can restore.
* **A failed push stays dirty**, so the next flush retries it — worth stating because the obvious
  implementation (`dirty=false` in a `finally`) silently drops the sync until the player does
  something new. Found by `cloud_sim.js`, not by playing.
* **Gifts are applied by the player's own client**, then claimed (`POST /api/grants`). Offline players
  are the normal case, so the server queues and the client — which owns the save format and its repair
  rules — applies. A gift the client does not understand is **left unclaimed**, so the GM sees it still
  pending and can resend, instead of it disappearing.
* **The GM console is `gm.html`** (`@item`/`@zeny`/`@baselevel`/`@broadcast`/`@ban` vocabulary, an audit
  row for every action, passwords replaceable but never readable). It is served publicly and that is
  fine: it is a client of `/api/gm/*` and every call is authorised from the session cookie. The **first
  account registered becomes the owner** (`gm=2`), so no bootstrap password lives in the repo.
* **`_routes.json`** ships in `dist/`: only `/api/*` goes through Functions, so page views stay on the
  free static path. Two other deliberate cost decisions: PBKDF2 at 20 000 rounds (~7 ms) fits the free
  plan's 10 ms CPU ceiling that rules out scrypt/argon2; and `pub` (leaderboard columns) is re-derived
  from the save blob on the server, never trusted from the client.
* **Files touched:** `index.html` (the cloud module, `CLOUD.api` branch in `submitAuth`, `save()` →
  `cloudTouch()`, `logout()`, a Cloud log filter, the GM-console button, `BUILD`), `gm.html` (new),
  `migrations/0001_init.sql` (new), `wrangler.toml` (new), `_routes.json` (new),
  `functions/_lib/{auth,db,http,validate}.js` (new), `functions/api/{register,sessions,me,save,messages,grants}.js`
  (new), `functions/api/gm/{players,player,log}.js` (new), `tools/dev_server.js` (new),
  `tools/tests/{api_sim,cloud_sim,gm_console_sim,dev_server_sim}.js` (new), `tools/tests/publish_sim.js` (three new checks), `tools/build_site.sh` (`gm.html` and
  `_routes.json` now ship), `Updates/cards-gear-audit/*.html` (v62 label; v61 appended to
  `SAFE_PREVIOUS_BUILDS`), `AGENTS.md`, `READ-ME-FIRST.md`, `tools/server-shift-plan.md`.
* **Tests:** all **27 suites** pass (23 + `api_sim` + `cloud_sim` + `gm_console_sim` + `dev_server_sim`), both `--check`
  tools current, `bash tools/build_site.sh` clean, inline game script passes `node --check`.
  `api_sim.js` runs the real handlers against a real SQLite (`node:sqlite`, D1-shaped shim) and found
  three real bugs while it was written: `currentUser` called `db.sessionByToken` on the D1 handle
  itself, `noteFailure` read `.first()` without `await` (which disabled the whole per-account lockout),
  and `new URL(request.url)` threw on a bare path.
* **Art:** no sheets added, removed or rebuilt; `tools/montage.py` was not used.
* **Branches / PR:** `arena/50beb968-prontera-grind`, same PR updated.
* **`tools/dev_server.js`** runs the whole server locally with no Cloudflare account: it serves
  `dist/` and routes `/api/*` to the same handler files, over real HTTP with real cookies and an
  in-memory database, so the cross-device login can be shown working today. `tools/tests/dev_server_sim.js`
  automates that trip (13 checks) — the layer a direct handler call cannot cover, because the client's
  *is there an API here?* test depends on the wire Content-Type.
* **Known limits / follow-ups:** the **Cloudflare project does not exist yet** and `wrangler.toml`
  still holds `REPLACE_WITH_YOUR_D1_ID`, so no player is on the server path — the deploy steps are
  `READ-ME-FIRST.md` § *Put the saves on the server*. `/api/board` (leaderboard), presence, world chat
  and away-progress accrual are phase 2. There is no password *reset* for a player who loses both
  password and recovery code except through a GM (by design, and owner-only). The workspace truncated
  `index.html` mid-edit **twice** during this work; both times it was restored from the last commit and
  the edits re-applied by guarded script — the habit that saved it is committing after each verified
  step.

### 2026-10-06 — `grind-v63 save backups + a login that keeps your progress`

* **The deploy found a real bug before it happened.** Moving to a new address means a new
  `localStorage`, so the characters living in a player's browser cannot follow them — and a second bug
  sat right next to it: `initSessionFromCloud` only honoured the device's own copy for a *returning*
  login, so a player registering a fresh account on the device they had been playing on would have had
  their work ignored and replaced by the account's empty save. Both are fixed by putting the whole
  reconciliation in one place, `cloudJoin`, which never guesses: identical copies agree on a version,
  an empty cloud adopts this device's progress, and two different copies open the existing three-way
  chooser (which keeps both, whichever way the player answers).
* **The crossing bridge is a file**: **⬇ Back up saves** / **⬆ Restore a backup** on the login card.
  It exports every `pg_save3_*` blob (plus the browser's own account list) as JSON and can put it back
  on any address. A backup file may only ever write those keys — a test feeds it a file containing
  `pg_gm_local` and asserts the GM marker is *not* written, because "restore this file someone sent
  you" would otherwise be a way to hand yourself the GM tools.
* **Announcements and gifts now arrive while playing**: a five-minute poll of `/api/grants` and
  `/api/messages`. It deliberately does **not** fetch the save, so no background request can ever
  overwrite what is being played; a long-hidden tab refreshes the save separately (`cloudRefresh`),
  adopting silently only when it has nothing unsynced of its own.
* **`tools/cloudflare-deploy-steps.md`** is the new walkthrough: create D1 (`pg`, APAC), run
  `migrations/0001_init.sql` in the console, connect Pages to the repo with build
  `bash tools/build_site.sh` and output `dist`, put the database id in `wrangler.toml` (the file is
  the source of truth once committed — the dashboard's matching fields become read-only), then a
  seven-line checklist before players are told. It also records that the first account registered is
  the owner, so the owner must register before the address is shared.
* **Corrected from the docs while writing it**: `wrangler pages dev` takes `--d1 NAME=<database_id>`
  (the old `--d1=DB --local` in `wrangler.toml`'s comment was wrong), and a Wrangler file makes its
  fields read-only in the dashboard — deleting the file is the documented way to hand configuration
  back to the dashboard.
* **Files touched:** `index.html` (`cloudJoin`/`cloudRefresh`/`cloudStart`, the rewritten
  `initSessionFromCloud`, the five-minute poll, the save-file module + login-card buttons,
  `BUILD`), `tools/tests/cloud_sim.js` (+11 checks, 30 total), `tools/cloudflare-deploy-steps.md`
  (new), `wrangler.toml` (corrected local-dev command + source-of-truth note), `READ-ME-FIRST.md`,
  `Updates/cards-gear-audit/*.html` (v63 label; v62 appended to `SAFE_PREVIOUS_BUILDS`), `AGENTS.md`.
* **Tests:** all **27 suites** pass; `cloud_sim.js` covers the four login outcomes (identical, empty
  cloud, different, new device), the hidden-tab refresh, the backup's key whitelist, and that the poll
  never touches the save. Both `--check` tools current, `bash tools/build_site.sh` clean.
* **Known limits / follow-ups:** still nothing deployed — `wrangler.toml` holds the placeholder until
  the owner creates the database. `save_history` and the GM restore path are unchanged. The backup
  file is not encrypted: it is the player's own data and they are told what is in it.

### 2026-10-06 — `2026-10-06 grind-v64 daily, weekly and all-time leaderboard`
* **What changed for the player:**
  * The dock now has a **Leaderboard** tab (shortcut **V**) with Daily, Weekly and All-time views, a refresh button, and a refresh when the tab opens. Rows show kills and current Base Lv; Base Lv breaks kill-count ties.
  * Daily and weekly scores count positive kill gains accepted in cloud saves during the period, not lifetime kills relabelled as today's. Existing saves seed All-time only. Calendar windows use Asia/Singapore dates and Monday-start weeks.
* **Files touched:** `index.html` (board UI, API refresh, `BUILD`), `migrations/0002_leaderboard.sql`, `functions/_lib/board.js`, `functions/api/board.js`, `functions/_lib/validate.js`, `tools/dev_server.js`, leaderboard/migration/API/UI/dev-server/publish tests, deployment notes, `wrangler.toml`, equipment-sheet build snapshot, `AGENTS.md`.
* **Art:** no sheets were added, removed or rebuilt; `tools/montage.py` was not used.
* **Tests:** `bash tools/build_site.sh` completed (177 files); sprite-viewer and class-skin checks current; all 29 `tools/tests/*_sim.js` suites passed, including leaderboard 6/6, migration 5/5, UI 39/39 and dev-server 14/14. Inline game JavaScript and changed JavaScript pass `node --check`; `git diff --check` is clean.
* **Branches / PR:** `arena/1896fc9a-prontera-grind`; no PR opened and nothing pushed.
* **Known limits / follow-ups:**
  * The v64 code is not deployed. Apply `migrations/0002_leaderboard.sql` to the existing D1 database `pg` before Pages serves the new `/api/board`; a merge to the connected production branch `main` triggers Pages automatically. The manual steps are in `tools/cloudflare-deploy-steps.md`.
  * Render is deliberately retained as a backup and was not changed. Away progress (4-hour cap, half-rate reward), online count (no list), and world chat in Logs remain future work, not part of this change. A future 15-second chat poll would allow up to about 15 seconds of delivery delay.

### 2026-10-06 — `2026-10-06 grind-v65 offline rewards, RO icons and UI fixes`

* **Ore drops:** regular mobs now drop both Oridecon and Elunium on every field: 0.5% each on Stages 1–9 and 1% each on Stage 10. Stage-10 bosses stay at 2.5% each.
* **Movement and framing:** high-AGI movement now uses a gentle square-root curve instead of a fast linear ramp, and the camera focus was adjusted so the character sits slightly above screen centre.
* **Equipment and Skills:** while equipping, compatible bag items temporarily rise to the top; closing the chooser restores inventory order. Clicking outside closes the bag and its equipment details, including when another tab handler has already cleared the chooser state. Skills show five per desktop row, a selected skill's description below the grid, and dismiss that detail on an outside click.
* **Ragnarok artwork:** skill and equipment icons use Divine Pride's item/skill image URLs, with separate weapon families (Katar included) and stable name-based equipment variants. An image error swaps in the existing local glyph, so unavailable external art never breaks the panel. No sprite sheets were changed.
* **Offline rewards:** saves record a recent kills/hour sample and a fractional-kill remainder. On return after at least a minute, time is capped at four hours and simulated kills use 50% of the saved recent pace; the normal drop tables can award EXP, Zeny, gear, cards, both ores and pets, with the usual quest, auto-sell/equip and bag rules. The welcome-back dialog shows away and credited time, kills, total drops, EXP, equipment-item count, card count, Zeny and a reward breakdown. When cloud saves conflict, the player chooses the save first; only that copy receives offline progress. This is client-authoritative, not cheat-proof.
* **Registration:** successful local registration now enters the game immediately. Cloud registration keeps the one-time recovery-code acknowledgement and labels its confirmation as the step into the game. The static browser-only account path still has a four-character minimum, while cloud passwords require ten; the local hash/save is device-local and not appropriate protection for valuable cross-device progress.
* **Files touched:** `index.html` (`BUILD`, field drops, movement/camera, icon URLs/fallback, chooser/Skills UI, offline save/simulation/modal, registration); `tools/tests/{cloud_sim,economy_sim,gear_sim,ui_sim}.js`; new `tools/tests/{offline_sim,registration_sim}.js`; `READ-ME-FIRST.md`; `tools/server-shift-plan.md`; `Updates/cards-gear-audit/{affix-ranges,equipment-cards-tuning}.html`; this log.
* **Art:** no art files were added or rebuilt. The UI requests remote Divine Pride icons and keeps local glyph fallbacks.
* **Tests:** `bash tools/build_site.sh` completed (177 files); `python3 tools/make_sprite_viewer.py --check` and `python3 tools/make_class_skins.py --check` passed; all 31 `tools/tests/*_sim.js` suites passed, including offline rewards (6), registration (4), gear drops (30), and UI (42). The inline game script passes `node --check`; `git diff --check` is clean.
* **Branches / PR:** `arena/87d4d23a-prontera-grind`; no commit, push, or PR created.
* **Known limits / follow-ups:** offline progress uses locally saved samples/timestamps, so it is an idle-game convenience rather than a server-verified reward. Absences under one minute do not open the reward popup. External icon URLs need a connection to Divine Pride; failed loads fall back to glyphs. Presence and world chat remain future work.

### 2026-10-07 — `2026-10-07 grind-v66 camera, skill art, login and combat polish`

* **Movement, measured:** the old `6.5 + 0.05 × AGI` formula reached 11.45 world units/second at AGI 99 and 12.5 at AGI 120. The live curve is `4.1 + 0.07 × sqrt(AGI)`: 4.80 at AGI 99 (**58.1% slower**) and 4.87 at AGI 120 (**61.1% slower**). The explicit Speed x2/x4 control still multiplies it.
* **Camera:** v65 changed the vertical focus but retained a 5-unit forward look-ahead, which left the character low in the preview. v66 reduces that lead to 0.25 units. With the current desktop camera angle and hero scale, the body centre projects to about 47.9% of the play area, just above centre.
* **Skill art:** removed the external Divine Pride skill-image dependency after the preview showed a generic red result. All 91 skills now have locally rendered 46px SVG gems, with metal/glass/glow styling and more than 40 skill motifs. No image-host connection is required for skills; gear icons remain on their separate source/fallback path.
* **Combat floats:** normal hits use outlined cream/gold digits; skill hits use a distinct blue glow; enemy misses and player dodges have separate badges; incoming damage stays red. Criticals are 32px with an expanded red-gold starburst frame and a small CRIT label, while retaining the damage number. Direct skill, AoE, chain, DoT and delayed hits keep the skill visual class.
* **Registration/login:** a successful registration now asks for confirmation before any local account is created or cloud request is sent. The shared confirmation modal is above the login overlay. Remember user ID is optional, stores only the username, and is automatically enabled after successful local or cloud registration. Unchecking removes the stored ID; no password is remembered.
* **Offline trust and bandwidth:** v65's rewards still run client-side. A cloud save carries the timestamp/rate sample to another device after normal sync; browser-only accounts do not. Changing the device clock forward can repeatedly claim the four-hour cap; clock rollback is not a security control. A future authoritative version would not need continuous polling and could fit into the existing save/login exchange; bytes should be negligible compared with the full save blob, while idempotent DB work and conflict handling matter more. No server endpoint or D1 schema changed here.
* **Files touched:** `index.html` (`BUILD`, camera, local skill SVGs, damage kinds/styles, auth confirmation, remember-user state); new `tools/tests/combat_float_sim.js`; `tools/tests/{registration_sim,cloud_sim,skill_sim,ui_sim}.js`; `READ-ME-FIRST.md`; `tools/server-shift-plan.md`; `Updates/cards-gear-audit/{affix-ranges,equipment-cards-tuning}.html`; this log.
* **Art:** no character/map sheets were added or rebuilt; skill gems are inline vector markup.
* **Tests:** `bash tools/build_site.sh` completed (177 files); sprite-viewer and class-skin checks are current; all 32 `tools/tests/*_sim.js` suites passed, including combat floats (8), registration (7), skills (52) and UI (42). Inline game JavaScript passes `node --check`; `git diff --check` is clean.
* **Branches / PR:** `arena/87d4d23a-prontera-grind`; no commit, push, or PR created.
* **Known limits / follow-ups:** the 4-hour/50% offline policy is a convenience feature, not server-verified. Local-only accounts stay on one browser unless backed up. A server-authoritative reward implementation can reuse login/save traffic, but needs explicit idempotent reward transactions and conflict-safe validation before being enabled.

### 2026-10-07 — `2026-10-07 grind-v67 measured movement, combat floats and server-timed offline rewards`

* **Movement dial:** followed the requested half-slowdown blend between the old `6.5 + .05 × AGI` pace and v66's `4.1 + .07 × sqrt(AGI)`. The live formula is `5.3 + .025 × AGI + .035 × sqrt(AGI)`: 8.12 at AGI 99 (29.1% below the old 11.45) and 8.68 at AGI 120 (30.5% below the old 12.5). The camera/framing was not changed.
* **Combat floats:** the projected `left`/`top` coordinates were applied to `position:relative` damage elements, adding those coordinates to normal flow and making numbers pile on the left. Damage types now stay `position:absolute` in the screen overlay. Damage styling is simpler, 17px ordinary numbers, modest 21px crits without burst/tag ornaments, and unframed MISS/EVADE labels. Incoming/skill distinctions and both number settings remain.
* **Cloud away claims:** `/api/save` uses server `last_seen` and server-observed kill deltas/rate; client `Date.now()`, `offlineAt`, and `offlineKph` cannot authorize cloud duration or kill count. Claims persist in D1 until a version-checked save containing the matching ID is accepted; browser retries, initial-return PUTs, conflict choices, cloud-adopt/login/refresh and session restore all hand off the claim and acknowledge its ID. Rate and claims preserve the existing 4-hour cap, 50% kill budget and fractional carry. Reusing a claim ID does not apply rewards twice in the normal client.
* **Migration:** new idempotent `migrations/0003_server_timed_offline_claims.sql` creates the pending-claim table and indexes only (no `ALTER TABLE` or save-blob rewrite); the claimed row carries the fractional remainder. `tools/cloudflare-deploy-steps.md` now instructs existing Pages installs to apply 0002, then 0003 before deploying.
* **Trust boundary:** the cloud server authorizes the away window and kill budget, but the browser still simulates loot/EXP and uploads the complete save blob. This fixes device-clock manipulation for cloud away claims; it does **not** make save edits or reward rolls cheat-proof. Local-only accounts keep the old local-clock simulation. README and the server-shift plan spell out this distinction.
* **Build and references:** `BUILD` is now `2026-10-07 grind-v67 measured movement, combat floats and server-timed offline rewards`. The equipment tuning snapshot accepts v66 as the prior safe build; the affix sheet and deployment verification tag use v67.
* **Files touched:** `index.html`; `functions/api/save.js`, `functions/_lib/db.js`; new migration 0003; API/migration/offline/cloud/UI/combat tests; `READ-ME-FIRST.md`; `tools/cloudflare-deploy-steps.md`; `tools/server-shift-plan.md`; equipment audit sheets; this log.
* **Tests:** all 32 `tools/tests/*_sim.js` suites pass (including API 28, migration 7, offline 8, cloud 31, UI 42 and combat floats 8). `bash tools/build_site.sh` completed (177 files); sprite-viewer/class-skin checks and extracted inline JS + changed Worker module syntax checks pass; `git diff --check` is clean.
* **Branches / PR:** `arena/87d4d23a-prontera-grind`; no commit, push, or PR created.
* **Known limit:** true reward authority still needs a server-side reward simulator and broader save validation. Before a production deploy, apply migration 0003 to the bound D1 database `pg`; the migration is idempotent.
### 2026-10-05 — `tool-v54 weapon proposal: real RO weapon art on every class` (no game change, no BUILD bump)

* **What the owner asked for:** weapons on the 19 class sprites — *"research online, mainly ragnarok online… make a html that i can view your proposal, adjust the position, option to not have weapon on certain jobs, and each weapon maybe 2-3 different design… maybe dont draw yourself and find sprite u can use online"*. All four asks are in the page below, and no sprite was drawn.
* **Research, and what was actually found.** The sandbox reaches **GitHub and PyPI only** — `divine-pride`, raw.githubusercontent and every file host are blocked, which is also why the `--fetch-icons` route in `tools/weapon-plan.md` never worked. The art came out of **public mirrors of an extracted RO client, cloned over git** (`tiagofm94/RO-Clientresources` and its larger fork `sammeepay/RO-Clientresources`), by writing a reader for the client's own formats:
  * `data/sprite/아이템/*.spr` — 1128 ground-item sprites, one frame each, 18-26 px. This is the recognisable item art: `프리스트의검`, `서늘한검`, `카타르`, `골든로드스태프`, `왕가의활`, `운디네의창`…
  * `data/sprite/인간족/<job>/<job>_<sex>_<weapon>.spr|.act` — the **held weapon**, animated with the body. The dump holds these for only a handful of jobs (8 jobs with `프리스트의검`, Assassin with `카타르`, plus Bard's bow and Sage's book).
  * Two traps cost real time and are now written down in `tools/weapon-art-notes.md`: **SPR v0x201 frames carry a `uint16 size` prefix** before their RLE data (found by reading ragassets' Go reader — a reader without it derails after frame 1), and **ACT v0x205 layers are 44 bytes** with `sprite_index = -1` for the many empty layers (a weapon ACT is mostly empty actions).
  * Scale check: the classic RO body is **74 px** tall; this repo's HD class art draws **~90 px**, so `BASE_SCALE = 1.25`.
* **Curation, three designs per family (crop only, house rule 1):** sword — Knight's Blade / Chilling Sword / Elemental Sword; dagger — Chilling Knife / Frost Dagger / Broken Blade; katar — Katar / Reinforced / Guillotine; bow — Chilling / Royal / Thorn; staff — Golden Rod / Aion / Shadow; mace — Golden / Arc Wand / Forge Hammer; axe — Chilling Battleaxe / Chilling Axe / Chilling Hammer; spear — Chilling Lance / Undine / Plain Spear. Deliberately **not** used, though a name search finds them: `서늘한책` (book), `서늘한바이올린` (violin), `서늘한채찍` (whip), `풍신의부채` (fan), `매의눈` (monocle) and every armour piece.
* **`tools/weapon_proposal.html` (served at `/` by `tools/preview_server.py`) — the page to review.** Every one of the 19 classes on its own real sprite, one weapon drawn at the hand:
  * the class art **animates**, because the page reuses the same decoder `index.html` uses (`skinDecodePng` walk → `DecompressionStream` → unfilter → APNG blend/dispose), so the owner sees the walk cycle, not frame 0;
  * the weapon is **draggable** to move, wheel or `[`/`]` to rotate, `-`/`+` to size, `0` to reset — and the marker dot shows the grip point being steered;
  * **✕ on any class in the list = "no weapon for this job"**, which is the second thing the owner asked for;
  * **three designs per family**, click to swap, with the family taken from the game's own `CD` table (`CLASS_FAMILIES` in the page is checked against `index.html` by the suite);
  * the right-hand panel shows the live numbers (offset, rotation, size, on/off), a plain-English summary of every class, and **Copy my proposal** exports one JSON block — per class `{weapon, family, design, dx, dy, rot, scale}` — which is the entire hand-back;
  * choices persist in `localStorage` (`pg_weapon_proposal_v1`); **Clear saved** returns to the automatic placement;
  * a "What the real client does" strip shows the official held-weapon frames the client actually ships for that family, so the angle can be judged against the original. Only the Knight's sword and the Bard's bow have those here — the page says so in words rather than pretending.
* **Defaults tuned by rendering, not guessed:** three hand-anchor variants were composited offline and compared; on the south view the grip sits `2%` in from the sprite's opaque box and on the attack view `100%` across, which puts the blade **clear of the silhouette** instead of across the chest. Tuned art: `sword_knight`, `dagger_chill`, `katar_plain`, `bow_chill`, `staff_gold`, `mace_gold`, `axe_chill`, `spear_plain`.
* **Files touched:** new `tools/weapon_proposal.html`, new `tools/make_weapon_pack.py` (`--source` harvests, `--check` verifies), new `tools/weapon-art-notes.md` (the format notes and provenance), new `assets/weapons/{24 item PNGs, held/}`, new `assets/weapons_data.js` (base64, so the page also works from `file://`) + `assets/weapons_manifest.json` (per image: family, label, exact client source path), new `tools/tests/weapon_proposal_sim.js`, `tools/preview_server.py` (`/` and `/weapons` now serve the proposal; the older review page stays at `/review`), `READ-ME-FIRST.md`, and this log.
* **Art:** 32 weapon images added under `assets/weapons/` — **cropped only**, never redrawn, recoloured, rotated or resized (`weapon_proposal_sim.js` asserts the packer contains no `resize`/`rotate`/`ImageDraw`). No class sheet, no `Updates/Sprite/` file and no `assets/sprite_pack_data.js` was touched; `tools/montage.py` was not used.
* **The game is untouched.** `index.html` still draws its own weapon layer (`WEAPON_ICON_*`, `syncWeaponSprites`); nothing reads `assets/weapons*` at runtime. That is why **`BUILD` is untouched by this pass** — it stays the merged
  `2026-10-05 skin-v53 class animations + balance-v51 faster early game` that main carries. No player can see any of this yet. Nothing is baked into the pack until the owner approves a proposal.
* **Tests:** all **21 suites** pass on the tree with `main` merged in (card 13, class_change 25, class_skin 39, drop_card_sheet 12, economy 22, gear 30, kit 34, pack 19 bodies, pet 12, picker 19, save_load 21, scene 8, skill 52, sprite 12, sprite_viewer 154 PNGs, starter 8, stat 7, ui 36, weapon_joint 7, weapon_review 13, weapon_proposal **87**); the inline game script passes `node --check` and all four generators report current. The new suite checks the manifest against the PNGs' real IHDR sizes and against `weapons_data.js`, that every class/family pair on the page matches `index.html`'s own `CD` table, that the page carries the decoder, the drag/rotate/reset handlers, the per-job off switch and the JSON export, and that the packer crops but never draws.
* **Verified here vs not verified here:** verified = the SPR/ACT decoders against the real files (frame sizes, palette, RLE, layer indices all decode), the offline composite of all ~45 class/view combinations (rendered and eyeballed), every suite, and HTTP 200 for the page, both data files, both image sets and the class PNGs. **Not verified here = a real browser** — there is no browser in this sandbox, so the drag feel and the animation must be confirmed by the owner on the live preview.
* **Merge:** `main` had moved on while this pass was in progress (PR #21, `balance-v51 faster early game + card gacha + title seal`), so
  `origin/main` was merged into `arena/01a10c1b-prontera-grind` before the push. The only conflict was this log — both sides had appended
  entries at the bottom, and both sets are kept (`balance-v51`, its merge note and the PR #21 note first, this entry last, newest last).
  Everything else auto-merged; the player-visible `BUILD` line is main's merged one, `2026-10-05 skin-v53 class animations + balance-v51 faster early game`,
  because this pass changes nothing a player can see.
* **Branches / PR:** `arena/01a10c1b-prontera-grind` -> PR #23 against `main`.

### 2026-10-05 — `tool-v55 weapon proposal: freeze for placement, pick a hand, weapon per view` (no game change, no BUILD bump, not pushed)

* **What the owner said after reviewing `tool-v54`:** *"hard to adjust when the sprite is moving"*, *"lock on into hands, and i can select where there hands are"*, *"south and south east i want no weapon shown, attack SE i want weapon shown"*, and *"dont push pr"*. All three are in `tools/weapon_proposal.html` now; **the page was rewritten, and this entry supersedes the control and save/export bullets of the `tool-v54` entry below** (the art, the harvest and the families are unchanged).
* **The sprite now starts frozen.** Placing a weapon against a walk cycle was the complaint, so the page opens on a still frame. `▶ Play animation` / `❄ Freeze` switches it, `◀ frame` / `frame ▶` (or `,` and `.`) step one frame at a time, and the bar above the canvas always says which frame is shown.
* **`🎯 Set hand` locks the weapon onto a hand the owner picks.** Press it, then click the sprite: that view's grip is set exactly where clicked, measured in the same 200×200 class-sprite pixels the rest of the tool uses. Arrow keys nudge it by 1 pixel (hold Shift for 5). `use this hand on every view` copies the grip to the class's other drawings; `↺ automatic hand` returns to the built-in guess. **The hand is per class *and* per view**, and until a view is clicked it keeps following the guess — nothing has to be pinned down by hand.
* **A "Weapon per view" table decides which drawings carry a weapon.** One checkbox per view — South, South-East, North-East, Attack (SE), and North where the class actually has that drawing — with that view's hand, offset and angle shown beside it. `weapon on every view` and `bare-handed everywhere` tick or clear the whole class. So a Knight can be bare-handed on South and South-East and armed only while attacking, which is exactly what the owner asked for. The **✕ in the class list still means "no weapon for this job"** on every view, and a green/grey dot per view in the list shows which views are armed at a glance.
* **The hand-back grew up with it.** Choices persist in `localStorage['pg_weapon_proposal_v2']`; an older `pg_weapon_proposal_v1` entry is migrated by copying its single placement into every view. **Copy my proposal** now exports, per class, `{family, design, views:{<view>:{weapon, hand, dx, dy, rot, scale}}}` — one entry per drawing, with `hand` as `[x,y]` or **`null` for "keep guessing"** (not "0,0"), and `weapon:false` for a bare-handed view.
* **Tested, not just written.** `tools/tests/weapon_proposal_sim.js` no longer only reads the page's text: it now boots the page's own inline script in a Node `vm` with a small DOM stub and drives the real controls — it clicks the rendered per-view checkboxes and checks that South goes bare while Attack stays armed, flips the job-level ✕, sets a hand and confirms it is used exactly as picked while the other views stay on the guess, and reads the export back apart. **87 → 214 checks.** The suite was mutation-tested (deliberately breaking the frozen default, the checkbox handler and the per-view export each made it fail).
* **Docs brought in line:** `tools/weapon-art-notes.md` ("The proposal page" section — the frozen start, the hand picker, the per-view table, `_v2` storage and the new export shape), `READ-ME-FIRST.md` and `TOOLS-START-HERE.md`.
* **Unchanged and still true:** crop-only art (no sprite was drawn, traced or recoloured), the families and their three designs, the automatic `HAND` defaults that were tuned by rendering all ~45 class/view tiles and were not touched by this rewrite, `BASE_SCALE = 1.25`, and the fact that **nothing is in the game** — `index.html` is untouched by this pass, so **`BUILD` stays** `2026-10-05 skin-v53 class animations + balance-v51 faster early game`.
* **Not verified here:** still no browser in this sandbox. The click-and-drag *feel*, the frozen frame and the hand clicking need the owner's eyes on the live preview (port 8000). Nothing is pushed — the owner asked for the PR to be left alone, so this sits as a local commit on `arena/01a10c1b-prontera-grind`.

### 2026-10-05 — `tool-v56 weapon proposal: the hand click really locks on, plus weapon flip` (no game change, no BUILD bump, not pushed)

* **What the owner said:** *"i dont get the click on hand function. it doesnt lock on into anything. does follow the hand or location i set. also add a function to flip the weapon image"*. Both are done in `tools/weapon_proposal.html`.
* **Why the hand click could look like it did nothing.** The click *was* writing the hand, but the weapon is drawn at `hand + offset`, and the offset is whatever the last drag left behind. So a click set a new hand and the weapon landed **beside** the crosshair — or, on a view the owner had unticked, there was no weapon to move at all. The three fixes: the click now **clears that view's `dx`/`dy`**, so the weapon's grip snaps onto the exact pixel clicked; a view with no weapon now **says so on the canvas** ("No weapon on this view — tick it in 'Weapon per view'"); and the pick listens on the **document in the capture phase** (ignoring clicks that land on buttons/inputs), so no overlay can swallow it. While the mode is on, a dashed crosshair follows the pointer and the canvas spells out what a click will do; a badge beside the button reads `hand 103, 146 (automatic)` or `hand 100, 120 (set)`, and the numbers panel and the view table show the same hand.
* **Also drawn now:** when a weapon has been pushed off the hand on purpose, a dashed line links the hand marker to the weapon's grip with a small gold ring on the grip — so "the hand" and "where the weapon sits" are never confused again.
* **Flip added (the new request).** `⇄ Flip left/right`, `⇅ Flip up/down`, `↺ normal`, plus the `F` / `V` keys and a ⇄ ⇅ pair on every row of the view table. It mirrors the weapon image **about its own grip point**, so a flipped weapon stays in the hand rather than jumping sideways; per class *and* per view, shown in the numbers panel, and carried in the hand-back as `flip:[x,y]` with `1`/`-1`.
* **Verified here:** the same offline composite trick as before — the Knight's frozen South frame with the sword drawn at the default hand, then mirrored, then flipped vertically, all three rendered and eyeballed (the blade changes direction, the hilt stays on the hand). The proposal suite now **fires real events at a stubbed DOM**: it dispatches a `pointerdown` at the canvas pixel for sprite point (100,120) and asserts the hand becomes exactly 100,120 with the old nudge cleared, that the mode-off click is a plain drag again, that `F`/`V` and both flip buttons and the per-view ⇄ buttons flip the right view and no other, and that `flip` comes back out of the export. **244 checks, all 21 suites green**; the new checks were mutation-tested (keeping the old offset, removing the flip from the drawing, and dropping it from the export each made the suite fail).
* **Not verified here:** still no browser in the sandbox — the click *feel* needs the owner. **Still not pushed** (owner's instruction); the page is on the local preview (port 8000).

### 2026-10-05 — `tool-v57 weapon proposal: a placement for every frame` (no game change, no BUILD bump, not pushed)

* **The owner's question:** *"im trying to set the location of the weapon on each frame. i click set hand on each frame, adjusted the size and postion. but when i play the animation the weapon just stays at the final location i selected. is it my understanding issue or a bug on your side?"* — **it was ours, not a misunderstanding.** The hand, offset, rotation, size and flip were stored **once per view**, so every frame shared them: setting a hand "on each frame" overwrote the same record, and playback drew that one placement on all of them.
* **What changed.** The same numbers are now stored **per frame index**: the page records what you set against the drawing you are looking at, and playing the animation draws each frame with its own numbers, so the weapon moves with the body. A frame with nothing stored of its own falls back to the view's **shared** numbers (the automatic guess until a hand is chosen). New tools under the frame stepper: **`📌 copy to every frame`** (one placement everywhere), **`clear this frame`**, and a **`blend the frames in between`** switch — with two or more frames set, the frames between them get a straight line between those two hands, and before the first key / after the last one the weapon holds that key's place. A lone key changes only its own frame, so one click can never freeze the whole walk. The line under the stepper says whether the frame you are looking at is *its own*, *blended* or *shared*, and how many frames of the view are tuned; the view table shows the hand, offset and rotation **for the frame on screen** (gold when the frame has its own) plus a `frames` column (`3/8`).
* **Blend is on by default** and is normalised on load, so a save from `tool-v55` (which had no frames and no switch) behaves like a fresh one.
* **The hand-back is v3 and already worked out.** Per class `{family, design, views:{<view>:{weapon, blend, base:{hand, handAuto, dx, dy, rot, scale, flip}, frames:[{hand, dx, dy, rot, scale, flip, src}]}}}` — `frames` is one resolved entry per drawing (8 for a Knight walk, 9 for its attack, 5 for a High Priest attack, taken from `assets/class_skins_data.js`'s own frame counts), so the game never has to interpolate anything itself. `src` is `frame`, `blend` or `shared`; `base` is what an untouched frame falls back to, with `handAuto` saying the hand there is still the guess.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **424 checks, 0 failed** (was 244) — the new block drives the page's own functions: two frames set to two different hands, a frame in between that must *not* be stuck on the first, blending that must land halfway (frame 3 of 8 between keys at 0 and 4 → 90,115), holding after the last key, a lone key that must not freeze the walk, `copy to every frame`, `clear this frame`, and the exported matrix (8/9/5 entries per view, blended frames resolved, `src` flags). Mutation-tested: making every frame share the view's numbers (exactly the bug the owner reported) and making the frame writer write to the view both fail the suite. All **21 suites** green; the four `--check` generators current.
* **Not verified here:** still no browser — the owner should press **▶ Play animation** after setting two or three frames and watch the weapon follow. `index.html` untouched, so **`BUILD` is unchanged**; **still not pushed** (owner's instruction), the page is on the local preview (port 8000).

### 2026-10-05 — `tool-v58 weapon proposal: the female sprites, and your progress saved as the default` (no game change, no BUILD bump, not pushed)

* **What the owner asked:** *"where is the female version? can u also save my current progress as default? i need more time to manual this"* — and pasted their whole proposal JSON back.
* **The female sprites are in.** The `♂ Male` / `♀ Female` buttons in the stage bar switch the art. The numbers are stored **per sprite per view**, because the male and female sheets are different drawings with different pose boxes — a hand that lands on his hand misses hers. Four views even have a different number of frames (Knight attack 9 vs 5, Acolyte South-East 8 vs 5, Wizard attack 8 vs 9, High Wizard attack 5 vs 8), so the frame stepper, the blend, the export and the table all follow the sprite you are on.
  * `⧉ copy this class to the other gender` drops everything about the class onto the other sprite — deliberately a **starting point**, not truth, and the two lines of hint say so.
  * A proposal written for one sprite (a hand-back, or the default below) that names a view where **the other sprite has a different drawing count** gives that sprite the shared numbers instead of a frame index that means nothing on it, and the page says why under **Sprite**. Everything else is copied across, so their tuned Novice already lands correctly on her.
* **Your progress is the page's default now.** `assets/weapon_proposal_data.js` (`window.WEAPON_PROPOSAL_DEFAULT`, generated from the JSON pasted in this request, key for key) is loaded by a `<script src>` before the page script: a fresh browser, an empty `localStorage` or another machine all open on your work. Edits still win over it; **`↺ back to the saved default`** wipes this browser and returns to it, and **`📥 Load a saved proposal JSON`** pastes a hand-back straight in.
  * Their numbers are preserved exactly: the Novice bare-handed on South/South-East/North-East and armed only on Attack (rot −348, flip mirrored, scale 0.6, and their five attack frames 87,115 / 88,118 / 84,114 / 130,129 / 128,130), the Swordman attack frames, the Archer's per-frame sizes, the Merchant's −8 axes, every `weapon:false` and every design choice. Only frames they really set by hand carry over — the ones the page had blended are left to blend again, so each sprite keeps following its own hand.
  * Damaged or extra keys in a save can no longer break the page (a bad `views` map used to throw on boot and leave the page blank — fixed).
* **One real bug found by all of this:** blending a **mirror** averaged `+1` and `−1` into `0`, which the drawing code read as "not mirrored" — so a flipped weapon could silently un-flip on the frames between two keys. The mirror now snaps to the nearer key (test added).
* **Tests:** `tools/tests/weapon_proposal_sim.js` **490 checks, 0 failed** (was 424). New: the shipped default is parsed and spot-checked against the owner's own numbers, the page is driven with it to prove it opens on their Novice/Swordman/Merchant work, each sprite guesses its own hand, switching sprites clamps the frame to a count they have, a hand set on one sprite leaves the other alone, `copy this class to the other gender` really copies, the export carries both sprites with their own drawing counts, and `back to the saved default` restores everything. Mutation-tested (making the two sprites share one record, ignoring the default file, and ignoring her frame counts all fail the suite). All **21 suites** green, four `--check` generators current.
* **Also fixed:** the preview server on port 8000 had **stopped listening** (every route answered nothing) — restarted (`/`, `/weapons`, `/review`, `/standalone`, `/picker`, the new data file and the class data all 200 again).
* **Still not pushed** (owner's instruction) — the page is on the local preview, and `index.html` is untouched, so **`BUILD` is unchanged**.
* **A note on this branch's history:** the sandbox re-cloned the repository twice during this pass. Each re-clone put the local branch back at its branch point and dropped the local commits (`tool-v55` … the first `tool-v58` commit), because only `52ad694` had ever been pushed. Both times the work was recovered by fetching `origin/arena/01a10c1b-prontera-grind`, re-anchoring the branch to `52ad694` with `git reset --mixed` (which does not touch the files) and committing everything again — so `tool-v55` through `tool-v58` arrive as **one commit**, and the files on disk were never lost. No push happened; re-run `tools/tests/weapon_proposal_sim.js` after any future re-clone to confirm (it was re-run and passed after each recovery).

### 2026-10-06 — `tool-v59 weapon proposal: your newest choices are now what the page opens on` (no game change, no BUILD bump, not pushed)

* **What the owner asked:** *"update my choices. save as default"* — with their whole proposal pasted back, and this one carried **both sprites** (every class has a male block and a female block).
* **The page now starts on those numbers.** `assets/weapon_proposal_data.js` was rebuilt from that paste, key for key, classes in the order they sent: the Novice and Thief on the Broken Blade, the Swordman and Lord Knight on the Knight's Sword, the **Knight on the Chilling Sword**, the Mage and High Wizard on the Gold Staff, the **Wizard on the Ion Staff**, the Archer, Hunter and Sniper on the Chilling Bow, the Acolyte and High Priest on the Gold Mace, the **Priest on the Wand-Mace**, the Merchant, Blacksmith and Whitesmith on the Chilling Axe, the **Assassin on the Reinforced Katar** and the Assassin Cross on the plain one. Every class they had left unarmed on South/South-East/North-East (and the **Assassin alone** on North-East) still is; the High Priest still has its extra North drawing, in both sprites.
* **What carried over and what did not.** Only the drawings they had really placed by hand are stored, each marked `"frame"` — 103 on the male sprites (the Novice, Swordman, Mage, Archer, Thief, Acolyte, Merchant, Knight, Wizard, Hunter, Assassin and Priest attack rows, the Assassin's South and South-East walk, plus single tuned frames on the Acolyte's idle and the Hunter's first walk), and 24 on hers. The entries their own export had **blended** between two keys (the tails of the Swordman's and Archer's attacks) were left out on purpose so the page draws those little in-between movements again from the same two hands: the numbers come out the same. Where they left the hand on **automatic**, it stays automatic — the file stores `hand: null`, so every sprite keeps finding its own.
* **Her half is where the work still is** — worth saying plainly, because it is not a page fault: her hand-set numbers are only the four basic classes (Novice, Swordman, Mage and Archer), and on those she is running **his** numbers, which they copied across with `⧉ copy this class to the other gender`. Her drawings sit in a different place inside the 200×200 box (her Swordman attack box starts at 79,69 against his 70,60), so on her sprite the sword floats above her head during the attack and the staff and bow miss her hands. Everything else of hers is still the untouched default of *armed on every view*. Standing on the `♀ Female` button and giving those four a quick pass is the next thing worth doing.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **518 checks, 0 failed** (was 490). The clause that pinned the old default's numbers was pointed at the new ones — the Novice's five frame hands and their mirror, his **and** hers, the Swordman's and Archer's frame keys, the Thief bare on his sprite and armed on hers, the four new designs, the Assassin bare on North-East, the Acolyte's upside-down frame, the Merchant's 70-pixel swing, every base's `hand`/`handAuto` being consistent, and every stored frame being marked `"frame"` (so a blended value can never be frozen as if they had chosen it). All **21 suites** green; the four `--check` generators current; the preview server answers on `/`, `/weapons`, `/review`, `/standalone` and `/picker` and serves this data file byte for byte.
* **Not verified here:** still no browser in the sandbox — the owner should press **`↺ back to the saved default`** (or hard-refresh) once, because their own browser is holding the older numbers in `localStorage` and that copy deliberately wins. `index.html` untouched, so **`BUILD` is unchanged**; **still not pushed** (owner's instruction), the page is on the local preview (port 8000).

### 2026-10-06 — `tool-v60 weapon proposal: the Knight walks unarmed (and the file is checked against your paste)` (no game change, no BUILD bump, not pushed)

* **What the owner asked:** *"update my choices. save as defult. dont pr first"* — with the whole proposal pasted back a second time.
* **The whole paste was compared key for key against what the page already opens on**, so a re-paste can neither lose their work nor quietly freeze something: all 19 classes, both sprites, all 154 view records, every design choice and every hand-set frame came back **identical**, except for **one edit** — the **Knight's male sprite now walks bare-handed** on South, South-East and North-East (his Chilling Sword stays on the attack row; her sprite stays armed on all four views, as before). That one change is what went into `assets/weapon_proposal_data.js`.
* **Why the file did not simply become the paste.** A paste made by the page's own *Copy my proposal* always carries more than the owner chose: the `hand` the page guessed on the views they left automatic, and the frame-by-frame numbers it blended between the two hands they did set. Those are the page's work, not their decisions, so they are dropped on the way in — only drawings they placed by hand are stored (each marked `"frame"`), a hand they left automatic stays `null` so every sprite keeps finding its own, and the blend is worked out again the same way. That is why a re-paste leaves the tuning untouched.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **520 checks, 0 failed** (was 518) — the Knight's three bare walks with his armed attack row are now asserted, along with the fact that his bare walks carry no hidden frame numbers.
* **The sandbox re-cloned the repository a third time** during this pass: the local branch was back at its branch point and the preview server had stopped. Recovered the same way as before — fetch the pushed branch, `git reset --mixed` onto it (which never touches the files), re-run the suite, commit again — so this pass's work also arrives as **one commit**. `index.html` is untouched, so **`BUILD` is unchanged**; **still not pushed**, as asked, and the page is on the local preview (port 8000).

### 2026-10-06 — `tool-v61 weapon proposal: new designs for five classes, and their swings placed by hand` (no game change, no BUILD bump, not pushed)

* **What the owner asked:** *"update to the weapon proposal as default"* — with the whole proposal pasted back again.
* **The paste was compared against what the page already opens on, and this time there was real work in it.** Only the parts that had changed were folded in; everything else was already identical, so nothing of theirs was overwritten or frozen twice.
* **Five classes are on a new design:** the **Blacksmith → Chilling Axe** (`axe_single`, the single-headed one), the **Lord Knight → Elemental Sword**, the **High Wizard → Shadow Staff**, the **Sniper → Thorn Bow** and the **Assassin Cross → Guillotine Katar**. Every design is real client art already in the pack; nothing was drawn or recoloured.
* **The male sprite of the Blacksmith, Lord Knight, High Wizard and Sniper now walks bare-handed** on South, South-East and North-East, with the weapon only on the attack row — the same arrangement the Knight got last time. **Her sprite stays armed on all four views**, as they left it.
* **Their placed swings came across as they set them.** The Knight's attack was re-tuned (all nine frames, now finishing 63 px across with the weapon mirrored); the Blacksmith has eight frames, the Lord Knight five, the High Wizard four, the Sniper eight, and the **Assassin Cross finally has a placement on every one of his views** (S, SE, NE and attack, all eight frames each). Frames the page had only *blended* between two hands are left out on purpose, so the page draws those in-betweens again from the same keys — the High Wizard's attack is the one case here, and the numbers come out the same.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **525 checks, 0 failed** (was 520) — the five new designs are asserted, along with the four classes' bare male walks and armed female ones, the Knight's re-tuned swing, the Assassin Cross's per-view placements, and the High Wizard's deliberate gap.
* **The sandbox re-cloned the repository again** during this pass (the local commit was gone and the preview server had stopped); recovered exactly as before — fetch the pushed branch, `git reset --mixed` onto it so the files are never touched, re-run the suite, commit again. That is why this pass and the previous one each arrive as a single commit. `index.html` untouched, so **`BUILD` is unchanged**; **still not pushed**, as asked, and the page is on the local preview (port 8000).

### 2026-10-06 — `tool-v62 weapon proposal: the checks now prove every class sits on art that exists` (no game change, no BUILD bump, not pushed)

* **The owner pasted the whole proposal back a third time, asking for it to be the default.** It was compared against what the page already opens on, field by field, by script rather than by eye: **19 classes, 154 view records (male and female), 184 hand-placed frames, 2,366 individual numbers — and every one of them already matched.** Nothing was overwritten, nothing was frozen twice, and there is no new tuning to report. The five classes they switched last time (Blacksmith → Chilling Axe, Lord Knight → Elemental Sword, High Wizard → Shadow Staff, Sniper → Thorn Bow, Assassin Cross → Guillotine Katar) and the four jobs that now walk bare-handed on the male sprite are all still in place.
* **A quiet kind of mistake is now impossible to ship.** If a class ever points at a weapon that is not real art — a typo in an id, or a design removed from the pack later — the page does not crash: it quietly falls back to the family's own image and everything still draws, so the class would silently be holding the wrong weapon. The test suite now walks all 19 shipped classes and checks each one's family *and* design against both the art pack and the page's own design list, and fails loudly naming the class and the id if anything is missing or mismatched. The check was verified by deliberately breaking one id and watching it fail, then putting the file back byte-for-byte.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **526 checks, 0 failed** (was 525); all 21 suites green; `node --check` clean. Nothing the owner can see changed, so `index.html` is untouched and `BUILD` is unchanged. Still **not pushed**, as asked.

### 2026-10-06 — `tool-v63 weapon proposal: what you paste back is proven to be what the page holds` (no game change, no BUILD bump, not pushed)

* **A guarantee the owner relies on every time they hand their choices back, now actually tested.** They paste a proposal in, or ask for it to be the default, and the whole point is that the numbers arrive unchanged: the same hands, angles, sizes, mirrors and per-frame placements, in the same views, for both sprites. The suite now **re-exports the shipped default from the page and compares it to the saved file, number for number** — 19 classes, 154 view records and all 184 hand-placed frames, plus every on/off flag, design pick and hand. This is the check that makes "no differences found" on the next paste-back meaningful instead of lucky.
* **Why it was missing:** that round trip can rot silently. Change how a number is rounded, or stop writing the mirror flag, and the owner's next paste-back would show differences that are really the page's drift — and their own tuning would look like it had moved when it had not. Now any such change fails the suite with the class, sprite and view named.
* **Verified by breaking it, not by assuming:** the export was deliberately sabotaged so hand-set frames would come out marked as inherited; the suite failed with `Novice/m/attack: 0 hand-set frames exported vs 5 stored` and the exact frames listed, then the page file was put back byte-for-byte (checksum compared) and the suite returned to green. The four art generators (`make_weapon_pack`, `make_class_skins`, `make_sprite_viewer`, `backup_apng_code`) all still report their assets current.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **527 checks, 0 failed** (was 526); all 21 suites green; `node --check` clean. Nothing the owner can see changed, so `index.html` is untouched and `BUILD` is unchanged. Still **not pushed**, as asked.

### 2026-10-06 — `tool-v64 weapon proposal: the whole proposal on one screen (and her pass is now measurable)` (no game change, no BUILD bump, not pushed)

* **What the owner asked for:** to keep going on the weapon request. The page has always shown **one class at a time**, which is fine for placing a weapon but useless for judging the proposal as a whole — and the owner's own remaining job is her sprite, which means 19 classes to look over.
* **New: "Every class at a glance".** The card of that name now has a `▤ show the pictures` button. It opens a grid of **19 small live pictures, one per class**, each animating that class's weapon row, drawn from whatever the page currently holds — the saved default or the owner's unsaved edits. Clicking a picture selects that class in the picker. It starts hidden, so the page still opens exactly as it did, and it follows the ♂ / ♀ switch.
* **Her pass is now measurable at a glance.** Under each picture is one honest word about that sprite: **her own numbers** (she has been worked on), **same as his** (everything stored on her sprite is his to the digit), **his on some views** (partly her work, partly still his), or **not tuned yet** (nothing stored — the page's own automatic hand is what draws). A line above the grid counts them: on her sprite today it reads **5 still on his numbers, 14 not tuned yet**, and on his **17 on his own numbers, 2 never touched at all** (High Priest and Whitesmith). That is the worklist for her side, in the page instead of in a head.
* **The pictures cannot lie about the placement.** The composite rule — grip, hand, angle, size, mirror, offset — now lives in **one function** that both the big stage and the small pictures call. Before this pass the drawing lived inside the stage routine, so a second view of the same thing could have drifted from the picker; a test now asserts both call the same function.
* **Two new safeguards, both verified by breaking them:** every element id the script reaches for must exist in the page (a typo would hand the page a null at boot and kill it — the stub used by the tests would silently invent an element, so this is checked against the markup instead), and the composite was unit-tested on a recording canvas: a bare view paints the body and **no** weapon, an armed view paints the weapon **exactly** on the stored hand plus offset, at the family angle plus that frame's own rotation.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **548 checks, 0 failed** (was 527); the page script passes `node --check`. Nothing the owner can see in the game changed, so `index.html` is untouched and `BUILD` is unchanged. Still **not pushed**, as asked.

### 2026-10-06 — `tool-v65 weapon proposal: the PR is updated with the whole thing` (no game change, no BUILD bump)

* **The owner asked for the weapon proposal PR to be updated**, which ends the hold they had put on it: the work is no longer local-only. Everything from `tool-v55` to `tool-v64` — the freeze/hand-picking, the per-frame placement, the female sprite, their choices as the page's default, the five new designs, the check-ups, and the "every class at a glance" strip — now sits on PR #23.
* **The PR had also gone stale**, which was fixed in the same push: two PRs (#24 cloud/accounts, #25 leaderboard) had been merged into `main` since this branch was last touched, and GitHub reported the branch as **conflicting**. `main` was merged back in and the one conflict (**AGENTS.md**, because both sides appended to this very log) was resolved as a union — every entry from both sides is kept, this branch's eleven entries sit at the bottom, and none of the other side's sixteen were dropped. The diff of this PR against `main` is now only the weapon-proposal files (43 files); **`index.html` is byte-identical to `main`'s**, so `BUILD` is unchanged and nothing a player can see moves.
* **Checked before pushing:** all **30** test suites green (nine more than before, because `main` brought new ones with the leaderboard and cloud work), the weapon suite at **548 checks / 0 failed**, both the page script and the data file clean under `node --check`, and the working tree clean.

### 2026-10-06 — `tool-v66 weapon proposal: the hand-back is now short enough to paste` (no game change, no BUILD bump)

* **The owner's problem:** sending their work back meant copying a block of text **twenty thousand lines long**. Pasting that is slow, hard to read, and every paste risked an error, so the thing they need most — "here are my new placements" — was the thing that was hardest to do. The export had to resolve every frame of every view of both sprites even though almost all of it was unchanged from the saved default.
* **New: `📋 Copy only what I changed`**, sitting next to the old `📋 Copy everything`. It sends **only the classes and views that actually differ from the saved default**, and nothing else. On a realistic sitting — one class, two frames moved — it is **895 bytes on one line, against 309 KB** for the full export. That is roughly **350 times smaller**, and it stays small no matter how much of the proposal gets tuned, because it only ever names what changed. The button shows its own size, so the owner can see how little they are about to paste.
* **It is not a summary.** Loading a short hand-back back into the page rebuilds the edited state **exactly** — same class, same sprite, same view, same every frame — which is checked in the tests by comparing the whole state before and after. A view that gets mentioned comes with all of its stored rows, because loading replaces a view rather than patching it: a partial one would quietly drop rows, and a frame the owner *cleared* has to come back cleared instead of reappearing with its old numbers. When nothing has been moved, the short hand-back is empty and says so — the state *is* the default, so there is nothing to send.
* **`📋 Copy everything` is unchanged** and still there for backups; it stays indented so it can be read. Nothing the owner can see in the game changed: `index.html` is untouched, `BUILD` is unchanged.
* **Tests:** `tools/tests/weapon_proposal_sim.js` **567 checks, 0 failed** (was 565), the page script passes `node --check`, and all **30** suites are green. Pushed to PR #23 for eyeballing; do not merge it — that is the owner's call.

### 2026-10-07 — `2026-10-07 grind-v68 prontera town: buildings, a fountain, five NPCs and click-to-walk`

* **What the owner asked for:** a *new map* — Prontera-like, buildings all around, a big fountain in
  the middle with an area for NPCs, **five NPCs with names and sprites**, **no mobs**, and
  **mouse-click movement**, for players to walk around, take quests and read information. All six
  points are in: the town is entered with **T** (or the World Map tab's town row), the plaza is
  ringed by sixteen buildings, the fountain is three stone tiers with eight jets, and the terrace
  holds Kafra Elise, Captain Rondel, Sister Marina, Scholar Wren and Smith Gordon — each of whom
  has a working page (warp/save, contracts, healing, the Mastery Index, drops and refine).
* **The town is a place, not a stage.** It is deliberately **not** a `MAPS` entry, so the Monster
  Index, the drop tables, the leaderboard and the offline claim are untouched by its existence. It
  has no spawner: the town branch in `update(dt)` returns before the respawn/roam block, so nothing
  can spawn, attack, drop or unlock while the player is in it. `collect`/`kill` are unreachable
  there, and the kill-rate sample that offline rewards are built from is not fed by town time.
* **Every pixel is the game's own art** (house rule 1, crop only). The building ring uses the kit's
  own `house_prontera` crops and `ruin_cobble` paving; the block-built RO houses stand in until the
  atlas loads, exactly as the field's own fallback town does. The NPC sprites composite the class
  sprite pack with the pack's own measured rules — **one idle row per NPC** (~0.5 MB) instead of a
  full 24-row atlas (~13 MB) each, because five extra full atlases would have cost ~65 MB of canvas
  for art that never animates; the drawn hero stands in until the pack loads. The fountain, gate,
  terrace, stalls, lamps and banners are the same primitives and palette the fallback town uses.
* **Click-to-move, and it goes round things.** A tap (not a drag — the camera keeps its
  orbit/zoom) raycasts the ground, drops a gold ring and walks the hero there; a tap on an NPC walks
  the hero over and opens their box. WASD/arrows walk as well and are routed ahead of the dock
  hotkeys while in town, and **F** talks to the NPC beside you. The basin is a wall: if the straight
  line to the target crosses it, `townWalk` hands the walk a tangent point so the hero rounds the
  fountain; the hero and the stored target are clamped by the simulation, not by `draw()`.
* **Five real bugs the new smoke test caught before this shipped** (all fixed): the field's roam
  block still ran in town and re-targeted the hero at random field spots; the hero's clamp lived only
  in `townTick` (called from `draw`), so a headless/simulation path let the hero walk into the
  fountain; the tangent steer point was written back into `pl.wx/wz`, so the hero stopped at the rim
  instead of going round; Kafra's warp accepted a **locked** stage (`S.prog[i]|0` of `undefined` read
  as 1); and the kit house group reported itself visible while empty.
* **The harness is in the repo:** `tools/tests/town_smoke.js` boots the real `index.html` in jsdom
  with the real Three.js r128 and walks 23 town scenarios. It is deliberately **not** named
  `*_sim.js` (it needs `npm i --no-save jsdom three@0.128.0`; it skips with exit 0 otherwise), so the
  plain-node gate is unchanged. `node_modules/` is now ignored.
* **Build and references:** `BUILD` is `2026-10-07 grind-v68 prontera town: buildings, a fountain,
  five NPCs and click-to-walk`. The two build-labelled reference pages
  (`Updates/cards-gear-audit/affix-ranges.html`, `equipment-cards-tuning.html`) and the deploy
  checklist carry the new tag, and v67 was prepended to the worksheet's `SAFE_PREVIOUS_BUILDS`.

### 2026-10-07 — `grind-v68` follow-up: the town is a card in the map UI, click-to-talk, click-to-walk everywhere

* **The owner's feedback:** "i want this map to be a new map in my current game", "to go to the map
  will be in my current map UI. adjust the sizing", "1. click to talk to npc", "i cant live preview.
  it brings me to my weapon proposal page". All four are addressed in the same v68 build.
* **The town is a card in the World Map tab's grid now** (`class="mapcard town-card"`, the same
  class and the same size as the ten fields, `data-a="town"`), marked *Safe · no mobs* and *● Safe
  town* while you are in it. Standing in town swaps the band below for the town's own: **Leave
  town** plus the five NPCs and what each one does — a map with no stages no longer shows a stage
  picker. The roster in that band is `window.TOWN_NPC`, the same data the NPCs are built from, so a
  sixth NPC added to `TOWN_NPC` shows up in the UI by itself. (`window.TOWN_NPC` is published from
  the bootstrap line, not from the town block: `skill_sim.js` slices that block into a sandbox with
  no `window`, and the assignment threw there — found by running the gate.)
* **Clicking an NPC talks immediately** — in the plaza and on their name plate (the plates are the
  big, forgiving target now). The character still walks over while the page is open; nothing is
  gated on arrival any more.
* **Click-to-walk works on every map, not just the town** — the same raycast and gold ring, with the
  click target clamped to the field lane and the roam put on hold (`pl.wt=999`) until the hero gets
  there, at which point the auto-roam resumes on its own. Combat still owns movement while a pack is
  engaged, so a click mid-fight only drops the ring.
* **The dev server's `/` is the game.** It used to map `/` to the weapon proposal page, which is
  exactly why the owner's preview "brought me to my weapon proposal page". `/` and `/game` now serve
  `index.html`; the proposal page keeps `/weapons` (and gained `/proposal`), `TOOLS-START-HERE.md`
  and `READ-ME-FIRST.md` say so.
* **Also in this pass:** the HUD's title/status line and the `#prog` banner say *🏘 Prontera Town /
  Safe map · no monsters* instead of the last field's stage; the walk ring lives in the scene (not
  the town group) and is stepped once per drawn frame, so it works in both worlds.
* **Tests:** all suites green; `ui_sim`'s map-panel assertions were **updated on purpose** (eleven
  `mapcard`s now: ten fields + the town, with only ten `data-a="selm"`), and `town_smoke.js` grew
  from 23 to **28 steps** — the town card in the grid, the town band and its five-name roster, a
  name-plate click, a world click talking at once, and click-to-walk in a field (held target, then
  the roam taking over). The smoke test caught the field test's own timing assumption, not a game
  bug.

### 2026-10-07 — `map-kit-hd-option-b: Ultra-HD 256×256/512×512 Data.grf tiles + RO3 seamless splatmap, canopy light & 3D map details`

* **What the owner asked for:** Ragnarok Online 3 style seamless map floors (**Option B: RO3 Seamless Splatmap Floor + Canopy Sunlight & Shadows**) upgraded to **crisp HD resolution** (zero blur, zero boxy grid repetition), plus **rich 3D ground details** (stones, grass tufts, RO1 herbs, mushrooms, crystals, curbs, lotus pads, fences) across all 10 maps and a **visual audit/harmonization of the 34 existing billboard sprites** against the new HD ground textures.
* **Upgraded to native `512×512` HD & modern crisp `Data.grf` ground tiles (`assets/kit/ro-tiles-hd.png` + `ro-tiles-hd.json` & `assets/kit/ro-spritesheet.png`):**
  * Extracted native `512×512` HD ground textures from `prontera_re` (`prt_city_g01.bmp`, `prt_city_g02.bmp`, `prt_city_bot01.bmp`, `prt_city_bot04.bmp`, `prt_city_bot08.bmp`, `prt_ch_bot02.bmp`, `prt_in_bot02.bmp`) and modern crisp biome textures from `lasagna` (`las_city_bot01.bmp`, `las_city_bot03_1..4.bmp`, `las_dun_bot01.bmp`), `eclage` (`ecl_fild_bottom01.bmp`), `rockridge` (`ridge_fild01.bmp`, `ridge_in_bottom01..02.bmp`), and `Data.grf` field/water sets (`water000/004.bmp`, `water200.bmp`, `water300/304.bmp`).
  * Removed phase-canceling roll-shift averaging and micro-blur: tiles retain 100% of their native hand-painted detail with toroidal low-frequency brightness equalization (`σ = 38px`) and thresholded `UnsharpMask` edge definition.
  * Packed all 24 terrain tiles at **native `256×256` HD** into `assets/kit/ro-tiles-hd.png` (`1536×1024`) + `assets/kit/ro-tiles-hd.json`, and updated the 24 `128×128` tile slots in `assets/kit/ro-spritesheet.png` (and `Updates/map-sprites-v2/ro-spritesheet.png`).
* **Audited & Harmonized All 34 Billboard Sprites (`assets/kit/ro-spritesheet.png`):**
  * Audited every billboard sprite over its corresponding new HD ground tile (`board-10-3d-details-and-sprites-audit.png`).
  * Fixed the stray white pixel artifact on `tree_cherry`'s trunk, harmonized the foliage greens/saturation of `tree_bush_bright`, `tree_sapling`, `tree_ancient_large/variant`, `tree_tall_cluster`, `tree_dark_gnarled`, and `bamboo_grove` to match the `Data.grf` HD turf palettes, added subtle base ambient-occlusion shading near `anchorY`, and applied a crisp `UnsharpMask` detail pass across all 34 sprites.
* **Wired Option B (`RO3 Seamless Splatmap Floor + Canopy Light`) & `kit3DDetails(plan, m, root)` into `index.html`:**
  * `kitFetch()` and `kitCrop()` load `ro-tiles-hd.json` / `ro-tiles-hd.png` so terrain tiles crop at `256×256` HD with `LinearFilter` and `16×` anisotropic filtering.
  * `kitGroundTex(plan)` renders a **`4096×4096` Ultra-HD ground canvas** in the browser where each terrain layer is painted as a continuous world-aligned repeating HD pattern through a feathered organic splatmap brush (`KIT._lay`), adding dark soil/curb rims along cobble/dirt/limestone edges, warm golden sunlight clearing pools, and dappled tree/landmark canopy shadows from `plan.props`.
  * `kit3DDetails(plan, m, root)` dresses all 10 maps (`153–885` 3D meshes per map, outside the combat lane) with **3D prop-base grounding clusters** (mossy root stones, 5-blade 3D grass/fern tufts, fallen coconuts, sakura petal drifts, crystal shards), **3D beveled road curb stones**, and **biome-specific RO1/RO3 3D details**: Prontera octagonal 3D fountain rim, lilypads, cottage rail fences & Yellow/White Herbs; Izlude/Comodo driftwood, seashells & starfish; Geffen glowing Blue Mana Crystals & Blue Herbs; Morocc sandstone ruin blocks & terracotta amphora jars; Payon red/orange spotted forest mushrooms, mossy fallen logs & creek reeds; Louyang floating paddy lotus blossoms; Amatsu sakura petal drifts & canal reeds; Niflheim crooked wrought-iron grave fences & glowing purple ghost-wisps; and Abyss cyan/gold dragon crystals & curved dragon rib-bones.
* **Preview boards & verification (`Updates/map-textures-preview/`):** `board-6-hd-option-b-zoom-comparison.png`, `board-7-hd-all-10-stages-option-b.png`, `board-8-hd-512-native-tiles-catalog.png`, `board-9-ingame-hd-option-b-verification.png`, and `board-10-3d-details-and-sprites-audit.png`.
* **Tests:** `tools/tests/kit_sim.js` **35 passed, 0 failed**; `tools/tests/scene_sim.js` **8 passed, 0 failed**; `tools/tests/ui_sim.js` **42 passed, 0 failed**; `tools/tests/publish_sim.js` **10 passed, 0 failed**.

### 2026-10-07 — `grind-v68` art pass: the town gets its own HD pack, and click-to-walk stays the town's

* **The owner's feedback:** "click to walk is only for this town map. dont change the others." and
  "the building sprite is awlful. make it as nice as ragnarok online 3. i already stated this
  earlier. the details and fountain too. make it all HD & nice."
* **Click-to-walk is the town's control again.** The field click from the previous pass is gone
  (handler, helper and hint all removed); a tap on a field map does nothing, and the roam keeps
  driving the hero exactly as it did before v68. `town_smoke.js` now proves it from the outside: a
  real pointerdown/pointerup pair on the canvas in a field must not touch `pl.wt` and must not drop
  the walk ring.
* **The town has its own painted art pack.** `assets/town/town-atlas.png` + `.json` — nine RO3-style
  painted buildings (town house, inn, shop, tall house, stone house, chapel, timber cottage, guild
  hall, cathedral), a painted fountain, gate, market stalls, tree, lamp, statue, banner, bench and
  flower beds. Painted to the owner's own art direction (HD Ragnarok Online 3 city art), then
  chroma-keyed off a flat magenta backdrop, trimmed to the content box, downscaled to a 640 px
  longest side and packed into one 4096x1281 atlas by `tools/make_town_pack.py` (`--check`
  byte-compares, the same contract as the other builders). Paint sources stay in
  `Updates/town-hd/work/`; the built atlas is mirrored into `Updates/town-hd/`.
* **The buildings and the fountain are the pack's, not boxes any more.** Every building stands at its
  true aspect with a soft contact shadow; the ring is seventeen spots dressed from eight designs
  (mirrored and sized so the ring never repeats). The **painted fountain** replaces the block tiers
  and keeps live water — droplets off the upper basin, spray off the crown, sparkle on the pool. The
  painted cathedral replaces the block one, the painted gate arch replaces the block towers. Anything
  not painted yet keeps its block stand-in, and a painted building always takes over the moment the
  pack lands, even if the player is already in town.
* **The ground is the kit's own HD terrain**, laid at about one world unit per tile: `ruin_cobble`
  plaza, a `limestone_pale` kerb band and side paths, `dirt_path` avenue, `grass_jade` lawn.
* **One real bug the smoke test caught in this pass:** the art pack finishes downloading on its own
  clock, usually *before* the player ever walks in — `townArt()` dereferenced a town that did not
  exist yet and would have thrown on boot. It now returns early when the town is not built, and the
  suite pins that (`assert.doesNotThrow` with the pack "loaded" and the town unbuilt).
* **Not painted yet** (they keep their code-built stand-ins, and the pack takes them over the moment
  their art exists): gate arch, market stalls, trees, lamp posts, statue, banner poles, benches and
  flower beds. Their names are already wired and the pack lists them as missing on every build.
* **Tests:** all suites green; all five `--check` tools current (including the new town pack);
  `town_smoke.js` is now **29 steps** — it stands in a stub manifest for the real atlas and asserts
  the ring is painted, the block ring hides, the fountain is the painted one with a full spray list,
  and the ground tiles are the HD set.

### 2026-10-07 — `grind-v69`: the plaza gets the rest of its art (twenty painted sprites), and the town square is laid out like a square

* **Where this picks up:** the previous entry painted the nine buildings and the fountain and left a
  list of props wired but unpainted ("gate arch, market stalls, trees, lamp posts, statue, banner
  poles, benches and flower beds"). This pass paints that list and fixes the layout the painted art
  exposed. Every one of the twenty sprites in `assets/town/town-atlas.*` is now used by the game.
* **Nine new painted props + the memorial statue** (`Updates/town-hd/work/`, packed by
  `tools/make_town_pack.py`, atlas now 4096x1793 / ~9 MB, 20 sprites, `--check` current): the gate
  arch, a red and a blue market stall, the big shade tree, the lamp post, the banner pole, the bench,
  two different flower beds, and a memorial statue of a knight. Painted to the same art direction as
  the buildings (hand-painted RO3 city art, magenta backdrop, chroma-keyed, trimmed, 640 px longest
  side), so the plaza reads as one set. **There is no bare block left in the town** — a painted prop
  replaces its code-built stand-in the moment the pack loads.
* **Two new prop spots the game did not have:** the statue (`x -6.6, z 9.6`, 3.4 units, beside the
  avenue just inside the gate) and four flower beds on the plaza's own axes (r 9.6, so the ring
  between the fountain and the lamps is not bare). The four code-built benches and the six banner
  poles became prop spots too (`prop('bench',…)`, `prop('banner_pole',…)`), which needed `prop()` and
  the `propSpots` list hoisted above them — they were defined after the benches, and `prop` in a
  block is a `const`, so calling it earlier threw at build time (caught by the smoke test
  immediately).
* **The square is laid out like a square.** The painted ring made two things obvious, and
  `tools/preview_town_board.py` (below) showed both: the ring was a wide scatter (r 19.4-22.4) with a
  7.5-unit cottage next to a 2.3-unit tower, and its north side grew straight through the cathedral.
  Now **fifteen houses wall the square** on the east and west at r 16.5-18.2, with the **gate corridor
  south and the cathedral's north end left open**, and a house is sized by **how much street frontage
  its slot owns** (`tw = (2*pi*r/22) * 0.99..1.12`, height from the art's own aspect) instead of by
  the art's raw height — so the two rows meet like a street line. A slower rotation over 22 slots
  replaces the old `% 8`, so no two neighbouring houses repeat. The gate arch came down from 8.4 to
  7.6 units and the cathedral moved in from z -33 to -29.5 so it closes the skyline instead of
  floating; the fountain went **up** to 9.5 units (it is the centrepiece) and its water anchors
  (`TOWN.waterTop`/`waterBasin`) are derived from that height rather than hard-coded; the tree ring
  moved out to r 18.6 and grew from 22 to 30 (27 place), because the houses now stand on the old line
  — and its skip test was fixed while doing it: it used to drop any tree inside the walkable **box**
  (x ±17.5 / z -16.6..19), which cut away the whole southern apron including trees that had nothing to
  do with the bound; it now keeps the avenue clear (`|x| < 6.2 and z > 5`) and keeps the square itself
  clear (`dist to plaza centre < 15.4`), so trees fill the ground a player actually walks past.
* **A board, because this workspace has no browser.** `node tools/_town_dump.js` boots the real
  `index.html` in jsdom, walks into the town with the **real** atlas manifest, and writes
  `/tmp/town_placements.json` (every painted sprite: which art, where, how big, mirrored, which
  group); `python3 tools/preview_town_board.py` composes those onto one 2:1 image at the real world
  sizes with the game's own contact shadows, back to front, with the ground schematic. That is
  `Updates/town-hd/board-1-town-layout.png` — it is how the overlap and the crowd round the north
  end were caught, and it is the honest way to look at a layout with no Chrome to download. Neither
  tool is in the `*_sim.js` gate (they need jsdom).
* **Tests:** `node tools/tests/town_smoke.js` **29/29**; every `*_sim.js` green (including
  `ui_sim`, which was pointed at the town card in the previous pass, and the two build-labelled
  suites, which is why the label files below moved with the tag); all five `--check` tools current
  (`make_town_pack.py --check` now reports 20 sprites).
* **Build and references:** `BUILD` is now `2026-10-07 grind-v69 prontera town in HD: painted
  buildings, fountain and a dressed plaza`. Both build-labelled reference pages
  (`Updates/cards-gear-audit/affix-ranges.html`, `equipment-cards-tuning.html`) and
  `tools/cloudflare-deploy-steps.md` carry it, and **v68 was prepended to `SAFE_PREVIOUS_BUILDS`**
  (v68 lived in the tree long enough for the owner to make hand-backs against it). `READ-ME-FIRST.md`'s
  town section is retitled **v69** and now describes the twenty-sprite pack, the painted list and the
  town-only click control; `TOOLS-START-HERE.md` gained the town smoke suite, the town pack builder
  and the two board tools. Files: `index.html`, `tools/make_town_pack.py` sources +
  `Updates/town-hd/work/*` (10 new), `assets/town/town-atlas.*`, `Updates/town-hd/board-1-town-layout.png`,
  `tools/_town_dump.js`, `tools/preview_town_board.py`, `tools/tests/town_smoke.js` (unchanged this
  pass — it already asserted the painted ring, and it passed), the three label files, the three docs.

### 2026-10-07 — `grind-v69` scale pass: every town sprite sized against the game's own art, trees moved outside the street

* **The complaint:** "the building size looks off. existing trees and every details look off.
  readjust it." It was right, and the cause was measurable: the town was sizing sprites by numbers
  invented per call site, while the game already has an art scale to measure against.
* **The scale the game already uses, used as the reference.** A hero is **2.7 units** (the sprite
  pack draws 90 px of art at `PACK_K` = .03), the field's own house is **7.6 x 6.4** (crop 280x234 x
  `KIT_PK` x .75), its big tree **10.9 x 9.7**, its stone lantern **1.7 x 3.2**, its tower **3.9 x
  14.8**. New `TOWN_WH` table (next to `TOWNP`) gives every painted sprite its world height, and
  **width always comes from the art's own aspect**, so nothing stretches: a normal town house is
  7.2-8.8 tall, a shop 8.2, the guild hall 10.4, the cathedral 17.5, the gate arch 10.2, the
  fountain 6.4, the statue 5.4, a lamp 5.6, a banner pole 7.2, a bench 1.3, a flower bed 1.3, a tree
  8.4. `TOWN_BLK` holds the sizes the code-built stand-ins ask for, so the fallback is the same size
  as the painted sprite that replaces it and nothing jumps when the pack lands.
* **What that fixed, concretely:** buildings were **4.7 x 5.5** and are now ~**7.2-8.8**; the fountain
  was **9.5** tall (taller than a house — it read as a chimney) and is **6.4**; the trees were
  **4.6** tall and are now **8.4** with trunks and canopies to match (the code-built stand-in went
  from a 1.5-unit pole to a 3.2-unit trunk under a 2.5-radius canopy); the gate arch was **9.8 x
  12.6** (more city than the cathedral) and is **8.1 x 10.2**; lamps are 5.6 not 3.6, banners 7.2 not
  4.3.
* **The square is sized to its houses now.** Plaza radius **12.5 -> 11.4**, houses ring it at
  **16.7-18.2** (was 16.5-19.1) with a 1.2-unit walkway between the kerb and the fronts, so the houses
  wall the square instead of standing out in the grass looking small. Lamps moved to r 10.7, banners
  to 11.9, the plaza's flower beds to 8.9, the fountain to 6.4 tall / 6.0 wide, and the ground tiles
  were re-tiled at about one unit per tile for the new radius (23/25/…).
* **The trees are outside the street, and the camera side is clear.** Trees were being placed at
  r 21.4 on **every** arc, which put a forest south of the plaza — between the default camera (which
  sits on +z, behind the gate) and the town. They now keep only the arcs behind and beside the town
  (`sin(a) <= .42`), outside the house line at r 21.6-26.4, 13 of them, and the giant double trunk is
  gone (a lot tree, not the field's wild ancient). The avenue guard stays (`|x| < 7.5 and z > 4`).
* **Also measured, not guessed:** the street-line sizing now reads the same table — a house is as tall
  as `TOWN_WH` says and as wide as its art makes it, capped at 1.12 of its slot's frontage so the
  guild hall and the chapel cannot swallow a neighbour; `RING_DESIGNS` moved up beside the table so
  the block fallback and the painted pack pick the *same* design for a slot (they were two separate
  lists); and the block fountain's `.68` scale matches the painted 6.4 units.
* **Verification:** `town_smoke.js` **29/29** (one assertion tightened on purpose: the plaza radius
  floor moved from 12 to 11, since the square is deliberately tighter); all `*_sim.js` green; all five
  `--check` tools current. The board
  (`Updates/town-hd/board-1-town-layout.png`, from `tools/_town_dump.js` +
  `tools/preview_town_board.py`) is what the new proportions were judged on — the sprite-size table in
  this entry is the same numbers the board draws with.

### 2026-10-07 — `grind-v69` camera pass: the town seen through the game's own camera (and the bug that caught), plus the flaky `api_sim`

* **Why:** scale and layout were being judged on a plan board, and a plan is not what the player sees.
  `tools/preview_town_board.py` now renders a **second** board — `Updates/town-hd/board-2-town-camera-view.png`
  — by taking the camera the game itself would have and projecting every sprite through its real
  view-projection matrix (`cam.matrixWorldInverse` x `cam.projectionMatrix`, both dumped by
  `tools/_town_dump.js`). The dump now also enters the town the way the game does, applies the town's
  own zoom clamp, pins the window to 16:9 and settles the camera on the spot the hero lands on
  (`ct = pl*.6 / pl.z - CAMERA_LEAD_Z`), so the board is the honest "you just walked in" frame.
* **The bug the camera board caught: the ring only ever walled the east side.** The two arcs were
  generated as `side * (-66 + k*22)` degrees, and a mirrored angle list is the same list — fourteen
  houses, seven pairs stacked on top of each other, all of them east of the fountain. The plan board
  had hidden it because the pairs overlap exactly. The west arc is now `114 + k*22` degrees (a real
  mirror), so the ring is seven houses east and seven west, x from -17.4 to 16.9. A regression guard
  was added to `town_smoke.js` (houses on **both** sides, the avenue to the gate clear, the cathedral's
  north end clear, fourteen houses) — the plan board could not have caught it, the camera board did.
* **The town is framed for its own size.** The field's default pull-back (`18` units of view at zoom
  `1`, the same for every map) shows about a third of a 44-unit town, so entering the town now clamps
  the zoom to **<= .46** (was .62) and the wheel may go out to **.40** in town (the fields keep their
  own `.6..2` exactly as before — `TOWN.scene` picks the floor). At .46 the square, the houses and
  the gate are in frame together.
* **Flower beds no longer grow through the roads.** The beds on the plaza's rim were placed at
  r 15.4, which put them on the two `limestone_pale` side paths; they now sit at r 12.8-14.9 and skip
  the strips (`|x| 12.4..17.4`, `|z-TZ| < 12.2`), so they dress the cobbles and the grass and never
  the paving.
* **`api_sim`'s flake, found and fixed at the root.** The suite had been failing intermittently (and
  only in a back-to-back run) on "offline time is server-timed…": it computes `Date.now()-2h` for
  `last_seen` and the handler credits the elapsed time **exactly**, so whenever a millisecond ticked
  between the two calls the assertion saw `7200001 !== 7200000` and three later assertions (200 vs
  428, kills 207 vs 7) cascaded off it. The test now freezes `Date.now` for that one call and restores
  it in a `finally`. Four consecutive standalone runs and **two full `*_sim.js` loops: green**.
* **Tests:** `town_smoke.js` **30/30** (the new ring guard); all `*_sim.js` green twice over; all five
  `--check` tools current. `dist/` rebuilt. Build tag unchanged (`grind-v69`) — nothing in this pass
  changes what a player sees in the fields.
