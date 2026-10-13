# Historical agent notes

Archived from the previous root AGENTS.md. These notes describe earlier versions
and environments; they are not current instructions. Start with ../../AGENTS.md.
The original text below is preserved verbatim.

---

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

**Class-tier gear gate (v74, widened in v74.1).** A piece belongs to a class TIER, not just a
slot: `gearTierOf` is the item's `sec` (0 starter / 1 first job / 2 second job / 3 high tier) and
`gearTierOK=(it,cls=S.cls)=>gearTierOf(it)<=Math.max(1,classTierOf(cls))` compares it with the
class tree's own `CLASSES[cls].tier` - **the `max(1,...)` is the owner's v74.1 instruction** that
the lowest band is starter + 1st-job gear, so a Novice and a first job both wear sections 0 and 1,
a second job reaches section 2 and only a transcendent class section 3. (v74 originally read
`gearTierOf(it)<=classTierOf(cls)`, which made the Novice starter-only; that was too strict.) It is
folded into `canUse()`, which every equip path already goes through (bag highlight, chooser,
auto-equip on drop, offline auto-equip, tooltip), so there is one rule and one place to change
it. On a class change `stowUnfit()` takes every worn piece the new class cannot use off the body
into the Bag, sets `locked=true` (auto-sell can never eat it) and stamps `wearer` with the class
that was wearing it - and because `snapClass()` already stored those ids on the departing class,
`equipRec()` wears them again on the way back. `initSession`/`cloudStart` run the same sweep, so
a pre-v74 save loads legal.

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
3. **Ranged engagement is generalised (v83), and it is a balance lever.** The 5-unit
   "you may attack from range" check used to be hardcoded to `skillOn('soulb')`; the stand-off is now
   `heroStandoff(mob)` - the best ready ranged skill's own range (Soul Breaker / Soul Destroyer carry
   `rng:5`), else the class band (bow 5, staff 4.5, melee `1.2 + 0.45*size`) - so every ranged class
   now fights from range instead of walking to a 3-unit class ring. That is a real DPS/safety buff to
   the bow and staff lines: re-measure kills/hour before touching the bands, and note that a melee
   class holding a ranged skill stops closing in too (`field_loop_smoke.js` pins all of this).
4. **The shadow map went 1024 -> 2048** when the field got longer, and landmarks added ~40 shadow
   casters. Watch frame rate on weak machines before adding more scenery.

## Verify before you push (expected output)

```sh
python3 - <<'PYPACK'
h=open('index.html').read()
open('/tmp/pack_block.js','w').write(h[h.index('const PACK_BODY='):h.index('function ensureHero(')])
PYPACK
node tools/tests/pack_sim.js           # -> "bodies in pack (19): ..."
node tools/tests/class_change_sim.js   # -> "27 passed, 0 failed"
node tools/tests/class_skin_sim.js     # -> "39 passed, 0 failed" (live class skins, both genders, mirrors)
node tools/tests/kit_sim.js            # -> "36 passed, 0 failed" (v2 atlas + KIT_PS, map recipes, Echo Court)
node tools/tests/skill_sim.js          # -> "58 passed, 0 failed" (91-skill roster, caps, cooldowns, swing-frame casts)
node tools/tests/dual_wield_sim.js     # -> "11 passed, 0 failed" (v81: Assassin dagger + dual-wield rules)
node tools/tests/save_load_sim.js      # -> "26 passed, 0 failed"
node tools/tests/trial_sim.js          # -> "16 passed, 0 failed" (Endless Echo payout, caches, store and gear token)
node tools/tests/economy_sim.js        # -> "23 passed, 0 failed"
node tools/tests/gear_sim.js           # -> "38 passed, 0 failed"
node tools/tests/picker_sim.js         # -> "19 passed, 0 failed" (the picker, booted under a DOM stub)
node tools/tests/card_sim.js           # -> "13 passed, 0 failed"
node tools/tests/drop_card_sheet_sim.js # -> "13 passed, 0 failed"
node tools/tests/weapon_review_sim.js  # -> "13 passed, 0 failed"
node tools/tests/pet_sim.js            # -> "13 passed, 0 failed" (+ printed pet data and the maxed-pet balance measurement)
node tools/tests/sprite_sim.js         # -> "13 passed, 0 failed" (v83: idle breath, lunge, hit recoil)
node tools/tests/background_sim.js     # -> "12 passed, 0 failed" (grinding is permanent)
node tools/tests/gm_auth_sim.js        # -> "12 passed, 0 failed" (GM password hashed; local GM password; tool/game agree)
node tools/tests/publish_sim.js        # -> "7 passed, 0 failed" (runs the real build; only game files ship)
node tools/tests/scene_sim.js          # -> "8 passed, 0 failed" (per-map scenery, water, clear lane)
node tools/tests/starter_sim.js        # -> "10 passed, 0 failed" (the gentle starter stages, v83 camps + per-camp refill)
node tools/tests/stat_sim.js           # -> "7 passed, 0 failed"
node tools/tests/weapon_joint_sim.js   # -> "7 passed, 0 failed"
node tools/tests/ui_sim.js             # -> "52 passed, 0 failed"
node tools/tests/sprite_viewer_sim.js  # -> "Sprite viewer: 154 PNGs, 7 trees, 19 class jobs; ..."
node tools/tests/town_smoke.js         # -> "40/40 steps ok" (needs jsdom; skips cleanly without it)
node tools/tests/field_loop_smoke.js   # -> "6/6 steps ok" (v83: the real field loop - camps, refill, login card, stand-off, printed damage, and the ranged hold that stops kiting)
python3 tools/make_class_skins.py --check    # -> "Class skins are current."
python3 tools/make_sprite_viewer.py --check  # -> "Sprite viewer is current."
python3 tools/make_town_pack.py --check      # -> "Town art is current (20 sprites, atlas 4096x1793)."
python3 tools/measure_town_ground.py --check # -> "Town ground offsets are current (20 sprites)."
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
* `ui_sim.js` renders the **real** `V.*` panels against a fake save, so **anything a panel calls
  must be in one of the spans it grabs** - not merely defined somewhere in `index.html`. A v77
  panel asked `townUnlocked()`, which lived 2 500 lines away in the town block, and five map
  tests threw `townUnlocked is not defined`. The fix is a `pick()` for the new helper next to the
  `grab('const V={', ...)` entry plus any storage stub it reads (`lsGet`) - not a stub of the
  helper, which would stop the panel's own gate being exercised.
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

