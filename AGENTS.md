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
fights a boss once every 15 kills.

| Where | What |
|---|---|
| `index.html` | the entire game (HTML, CSS, JS inline). This *is* the game. |
| `assets/sprite_pack_data.js` | the built sprite pack: 19 class bodies + 2 heads, base64 atlases. ~5.8 MB. |
| `assets/thief_sprites_data.js` | the *older* thief-only pack. Superseded, but `tools/make_sprite_pack.py` still reads it for shared pose data — do not delete. |
| `Sprite/*.png` | the uploaded RO-style sprite sheets (21 of them). The **source art**. |
| `tools/make_sprite_pack.py` | crops `Sprite/` → `assets/sprite_pack_data.js`. |
| `tools/montage.py` | rebuilds the four montage sheets (see below). |
| `tools/tests/` | the seven test suites. Run them before every push. |
| `UPDATE-BOOTSTRAP.py` | one-shot: rebuilds the whole update from a fresh clone (see *Delivery*). |
| `READ-ME-FIRST.md` | handover note for whoever pushes the current work. |

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
6. **All nine test suites must be green before you push.** Add a test when you add
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
endgame (**~269 h total to Lv150 at the model rate** — an outcome, not an anchor; retune
`aC` if the owner wants it shorter). `EXPK=5.5`, `BOSEK=46` (the boss stays 8.33x a mob),
`ZK=[8,14]`, `BZK=[150,250]`, `QZ={kill:1.6,loot:9,boss:26}`, `zenAt(p)=max(1,round(.011*p*p))`
are unchanged. **`QXP={kill:1/120,loot:1/150,boss:1/72}`** is the v11 column scaled by 4/15:
on the steep new curve quests must never carry more than ~40% of a level (they supply ~35%
overall). **Job bars mirror the base curve** (`JOFF=[0,9,49,98]`): job level j of a tier
costs the job exp (70% of mob exp) that base level j+JOFF[tier] pays out, so each job bar
fills in step with the base bar and the job gates (Novice 10 / 1st-job 40 / 2nd-job 50) land
on the anchors by construction. Zeny over a full model run is **~46.5M**, enough for the
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

**The attached map kit — Payon and Morocc are drawn from the owner's designs.** The kit lives in
`assets/kit/`: `ro-spritesheet.png` + `.json` (8 terrain tiles — grass_olive, grass_forest,
dirt_path, riverbank_wall, cliff_rock, water_frame_0/1, bridge_planks — and 7 environment
billboards — tree_ancient_large, tree_ancient_variant, tree_tall_cluster, tree_sapling,
tree_bush_bright, rock_cliff_crag, river_stone_post), `ro-map-payon.json` (the Payon river
crossing: 48x32 cells with corner heights, 250 water cells, 24 bridge cells, the bridge at
25.5/16.5, 30 placed props), `ro-map-morocc.json` and `morocc-atlas.js` (the Morocc desert ruins
design, and the attachment's own generator that paints its atlas in the page, copied verbatim).

* `KIT_MAP` says which arena map wears what: 3 → the attached **morocc** design, 4 → the
  **payon** field. A design dresses the
  **ground** (its tiles painted into one 2048x2048 texture over the 90x90 field), its **water**
  (merged row rectangles, animated by swapping the kit's two water frames) and its **props**
  (billboards, sized and anchored from the manifest).
* **Payon is laid out in code, not from the attached grid.** The owner rejected the attached
  payon layout (a huge diagonal lake with player-sized trees) and asked for RO's Payon Forest, so
  `payonPlan()` builds the field from the RO recipe out of the same kit tiles: a wide wandering
  **dirt road** down the middle, a **creek** across it with a **plank bridge** on the road, tree
  lines that **tower over the player** on both banks, saplings and bushes under them, and a rocky
  mountain edge (Payon Forest is a mountainous forest). `ro-map-payon.json` stays in the repo as
  the owner's design - it is just no longer the field. Morocc still uses its design cell for cell.
* **Prop size is derived from the kit's own character, not guessed.** The kit ships an 80px
  character frame; this game's hero stands 2.9 units, so `KIT_PK = 2.9/80` and a prop is
  `crop height x KIT_PK x KIT_PS[type]`. `KIT_PS` is the RO Payon proportions: big trees 3-4x the
  hero, saplings ~1x, bushes knee height (~0.3-0.7x), crags boulder-sized, palms 2.7-4x, cacti and
  ruins below the player. **Every prop type a field places must have a factor** - `kit_sim.js`
  fails on one that does not, because the default (1.0) makes player-sized trees again.
* Cell types map to tiles exactly as the kit's own engine maps them: grass→grass_olive,
  grass_dark→grass_forest, dirt→dirt_path, cliff→cliff_rock, bank→riverbank_wall. Water is the
  animated pass, bridge cells are the deck mesh, Morocc's tiles keep their own names (sand,
  sand_dark, ruin_cobble, cliff) and its sky cells are off-map. **Keep the mapping in step with
  `ro-map-engine.js`'s `_rebuildTerrainCache`** - that is where it comes from.
* The design is anchored on the point it is built around (Payon's bridge, Morocc's grid centre)
  and centred on the play band (`KIT_ZC`), one cell = `KIT_S` = 0.85 world units.
* **Props never stand in the running lane** (`|x| < BX_`). Props a design puts there are moved to
  the lane edge (their side and depth kept) - never dropped, so the design's prop count survives.
  The one exception is a design asking for art the atlas does not carry: Payon asks for
  `rock_boulder_mossy` and the sheet has no such billboard, so those 3 placements are **skipped and
  reported, never substituted** (show the gap to the owner; do not invent art for it).
* Nothing in the kit is drawn, traced, recoloured or substituted by this repo. The Morocc atlas is
  painted by the attachment's own generator, verbatim, at load time.
* If the atlas cannot load, every map falls back to the v13 scenery (`buildKit` returns null and
  `buildDeco` continues). The kit must never be able to break the game.
* `kit_sim.js` pins all of it: the Payon recipe (road, creek, bridge on the road, both banks
  dressed, the creek out of the monster spawn band), Morocc's design cell for cell, the RO scale
  table (trees ≥ 3x the hero, bushes knee height), the clear lane, both builders against a stubbed
  canvas/THREE, and the fallback.

**What RO Payon actually looks like** (researched for this build, and the reason Payon was rebuilt):
a *mountainous bamboo forest* - Payon village is built on a mountain edge with steep cliffs over a
river, and the forest fields are a dirt path cut through big dark trees. The reference screenshot
(showed to the owner) has a **brown dirt/mud ground** with grass at the edges, a **tree trunk wider
than the character** filling one side of the frame, small bright-green ferns at the tree bases, and
the player tiny against it. That is the look `payonPlan()` is aiming at. The kit ships **no bamboo
billboard** - if the owner wants the groves, that crop has to come from the kit, not be drawn.

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

Vertical, and deliberately so: `BX_=5.5`, `Z0=-14`, `Z1=3` (17 deep). The camera sits
on +Z looking toward -Z, which makes **low Z the top of the screen**. The player starts at
`Z1-1.5` (bottom) and mobs hold `Z0..Z0+6` (top), so you run up the avenue to engage; `AGGRO=8.5`
is how close you must get before a pack leaves its spawn, and bosses ignore it. `ct.z` tracks
`pl.z-5` to keep the player in the lower part of the frame. Prontera's buildings are scenery, not
a maze - the whole town set is offset by `TZ=-18` so it sits behind the far edge.

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
node tools/tests/pack_sim.js          # -> "bodies in pack (19): ..."
node tools/tests/class_change_sim.js  # -> "15 passed, 0 failed"
node tools/tests/save_load_sim.js     # -> "9 passed, 0 failed"
node tools/tests/economy_sim.js       # -> "12 passed, 0 failed"
node tools/tests/stat_sim.js          # -> "7 passed, 0 failed"
node tools/tests/card_sim.js          # -> "13 passed, 0 failed"
node tools/tests/skill_sim.js         # -> "37 passed, 0 failed"
node tools/tests/gear_sim.js          # -> "18 passed, 0 failed  (18 assertions groups)"
node tools/tests/scene_sim.js         # -> "8 passed, 0 failed" (per-map scenery, water, clear lane)
node tools/tests/kit_sim.js           # -> "15 passed, 0 failed" (payon recipe + RO scale, morocc design, builders, loader)
node tools/tests/ui_sim.js            # -> "6 passed, 0 failed" 
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
* Recovery path if a reset lands: `UPDATE-BOOTSTRAP.py` (rebuilds `index.html` + the pack
  from the sheets that are already on main), `tools/v7-index.patch` +
  `tools/restore_v7.sh`, and `READ-ME-FIRST.md`.
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

<!-- template — copy this block, fill it in, paste it at the bottom of the log -->

### YYYY-MM-DD — `<build tag>`
* **What changed for the player:**
* **Files touched:**
* **Art:** which sheets were added/removed/rebuilt, and whether `tools/montage.py` was used.
* **Tests:** the three summary lines, plus any new test and what it covers.
* **Branches / PR:** branch name and the pull-request link the user was given.
* **Known limits / follow-ups:**
