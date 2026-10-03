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
4. **Head anchors are measured per cell from the body art** — the *band-4 top row
   centroid* rule. Never reuse `transfer_anchors()`-style offsets; they produce the
   7–13 px head wobble that was fixed on 2026-10-03.
5. **Montage sheets only through `tools/montage.py`.** Never hand-split a montage.
6. **All three test suites must be green before you push.** Add a test when you add
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

Loading a class **restarts that class**: Base Lv stays as you are now, Job Lv goes back to
1, stats are refunded to unspent points. The class you step *away* from keeps its own
Base Lv, EXP, stat points, stats and worn gear in `S.base[class]` (ids only — items are
matched back out of the bag, so nothing is ever duplicated or conjured). The Novice is a
hard restart: Base Lv 25 (if higher), EXP 0, Novice job levels/skills cleared, stats
refunded, and `S.base.Novice` deleted. Gates: parent class job level, and "reset to
Novice first" for anything not directly under your current class.

Formulas the tests pin down: `totalPts() = 10 + Σ(3+⌊l/5⌋)` for l = 2…lv;
`need(lv) = ⌊38·lv^1.75⌋`; `jneed(j) = ⌊25·j^1.7⌋`.

## Balance - the numbers that matter

All of this lives in `index.html`. Each block is commented in-source; this is the map.

**Economy** (constants sit right after `const dropTxt=`, ~line 250):
`needAt(L)=floor(38*L^1.75)`, `EXPK=5.5`, `BOSEK=46` (the boss stays 8.33x a mob),
`ZK=[8,14]`, `BZK=[150,250]`, `QXP={kill:1/32,loot:1/40,boss:1/19}`,
`QZ={kill:1.6,loot:9,boss:26}`, `zenAt(p)=max(1,round(.011*p*p))`.
Summed level 1-149 that is **13,204,072 exp**; quests supply **31.7%** of it (the target was
~30%), and the run takes **77,152 kills = 96.4 h at 800 kills/hour**. Zeny over a full run is
**12,225,933**, enough for a +10 7-slot setup (~494k) several times over plus ~1,200 pet rolls.

> **The 800 kills/hour figure is now stale - re-measure it.** It was measured before skills
> could multi-cast. A second job now lands three skills per swing instead of one, plus dot,
> chain and AoE pressure, so real throughput is higher and the run is correspondingly shorter
> than 96 h. Do **not** pre-compensate by guessing a new `EXPK`: playtest, read the actual
> kills/hour off the log, then adjust `EXPK` - it is a single constant and every other economy
> number derives from it. `economy_sim.js` re-checks the total for you afterwards.

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

**Cards.** Grade gates the stat pool. `cardStat(g,seed)` draws from `K5` (the five base stats)
for Common/Fine and from `AFF` (base stats + hp/atk/crit/aspd/flee/cdm) for Rare/Legendary,
because **the two lowest grades must not get the new effects**. `cardVal(g,st)=round(CV[g]*AB[st])`
so a Legendary HP card is worth 60 and a Legendary STR card 5 - percentages look small on
purpose, they multiply the whole attack total. `CFIT` maps each stat to a gear slot.

**Pets.** Drops only - **there is no hatching and no hatch button**; `ACT.egg` and `ACT.ptg`
were dead code and have been deleted. Training is a gacha roll: `PTG=[.8,.6,.4,.25,.12]` is
the success chance by current tier and `GREAT=.1` makes one success in ten jump two tiers.
`peqCost(t)=1200*(t+1)^2`. Expected cost to max all three pet stats is ~1.09M, about 9% of one
run. **The 3-vs-40 split is correct and is not a bug**: 3 is the equip limit, 40 the collection cap.

**Skills.** Two structural rules, both pinned by `skill_sim.js`:

* **Parity.** Novice has exactly 1 skill, and *every* job line has exactly 4 of its own - 1st,
  2nd and transcendent alike. Novice having only First Aid is correct, not a gap: in RO the
  Novice has no offensive skills. Do not add one. Inventing a Novice attack skill is what put a
  bogus chain tag in *every* class tree, because every class inherits Novice.
* **Scarcity.** `skCost(L)=L`, so buying level L costs L points and maxing a 5-level skill costs
  15. A line earns 9 (Novice) / 58 (1st) / 107 (2nd) / 156 (transcendent) and can reach
  1 / 5 / 9 / 13 skills - i.e. 15 / 75 / 135 / 195 points of tree. **No line can max its own
  tree**, which is the point. At one point per level every line could, with 28-86 points left
  over. Removing or renaming a skill refunds its points through a repair in `load()`.

**Skill accuracy.** Targeting follows Ragnarok Online, checked against iRO Wiki, not what would
be most convenient. The Thief line has **no AoE at all** except Grimtooth and Meteor Assault
(which are Assassin's own). Bowling Bash / Magnum Break / Hammer Fall / Storm Gust / Frost Nova /
Lord of Vermilion / Magnus Exorcismus are the area skills; **chain is deliberately rare** (only
Blitz Beat's falcon and Sharp Shooting's piercing line genuinely bounce), because in RO almost
every multi-target skill is a true area rather than a bounce. Five invented or wrong-job skills
were replaced: Throw Stone (not RO, and Novice), Rolling Cutter (Guillotine Cross, a 3rd job) ->
Advanced Katar Mastery, Adoramus (Archbishop) -> Basilica, Charged Arrow (not RO) -> Falcon
Assault, Head Crush (not RO) -> Traumatic Blow. Fire Wall moved off Wizard (it is a Mage spell)
and Wizard got Frost Nova.

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

1. **Re-measure kills/hour** after a real playtest, then retune `EXPK`. This is now the single
   biggest open number: `HPE` went 1.85 -> 1.3, so mobs die several times faster than the
   800 kills/hour the 96.4 h estimate was solved against, and the run will come in **under**
   96 h - possibly well under. Do not guess a correction. Playtest, read the real kills/hour,
   then move `EXPK` (one constant, everything derives from it). If the pace feels right but the
   run is too short, raising `EXPK` is the correct lever: the goal is *more* fast kills, not
   slower ones.
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
node tools/tests/class_change_sim.js  # -> "11 passed, 0 failed"
node tools/tests/save_load_sim.js     # -> "9 passed, 0 failed"
node tools/tests/economy_sim.js       # -> "10 passed, 0 failed"
node tools/tests/stat_sim.js          # -> "7 passed, 0 failed"
node tools/tests/card_sim.js          # -> "13 passed, 0 failed"
node tools/tests/skill_sim.js         # -> "22 passed, 0 failed"
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
* Two constants share one line, so a regex for one returns both: `skOff` and `skillOn`.
  Check what you actually grabbed before declaring either in a harness.
* A test that re-declares a game formula needs a **source pin** (a regex asserting the
  real formula is still there) or it will happily pass against a stale copy.
  `class_change_sim.js` and `save_load_sim.js` both have one.

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

### 2026-10-03 - `balance-v9 roam mobhp skill-points RO-accuracy` (current)
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

<!-- template — copy this block, fill it in, paste it at the bottom of the log -->

### YYYY-MM-DD — `<build tag>`
* **What changed for the player:**
* **Files touched:**
* **Art:** which sheets were added/removed/rebuilt, and whether `tools/montage.py` was used.
* **Tests:** the three summary lines, plus any new test and what it covers.
* **Branches / PR:** branch name and the pull-request link the user was given.
* **Known limits / follow-ups:**
