# How RO attaches a head and a weapon — and what this repo should do

Researched 2026-10-04 for the sprite redo (`tools/sprite_picker.html`). Sources at the
bottom. This is background for whoever implements the owner's pose selection; nothing
here changes the game by itself.

## What the real client does

1. **An action index packs an animation and a facing: `action = animation × 8 + direction`.**
   Every animation exists as 8 directional variants of 45°. The art itself is drawn for
   **five** facings (down, down-left, left, up-left, up); the right side is the horizontal
   mirror of the left. That is exactly why this repo's sheets carry five arts per animation
   and why dirs 5/6/7 (NE/E/SE) are mirrored from 3/2/1.

2. **The head is parented to the body, per frame — not once.** For each frame of each
   action and facing, the child's layers shift by
   `childLayer.x + bodyAnchor.x − ownAnchor.x`, where the two attach points are stored
   **per motion** in the `.act` files. Stand and sit are special: the head/headgear act
   holds one pose per head direction instead of an animation, which is how the head can
   turn while the body stands still. Headgears hang off the *head* anchor.

3. **Weapons, shields and garments are not parented; they are aligned to the character
   origin** (the body anchor), and their `.act` files are authored per class *and* gender
   because each class animates differently. A weapon therefore lands in the same place on
   every body it is offered — and a body drawn to a different build than the weapon art
   grips it a few pixels out. Serious sprite tools keep **hand-written per-body, per-weapon,
   per-frame offset tables** for exactly this, applied everywhere a character is composed
   (`weapon_offsets.txt`, `npm run nudge`).

4. **Draw order is a per-direction layer priority, not a fixed "weapon in front".**
   Defaults are garment −1, body 0, head 1, weapon 2, shield 3, headgear 4+n, but the
   client's own tables (`.imf`, level-priority data) swing a weapon **behind the body in
   the middle of an attack when the character faces away**. Without that data a renderer
   "simply always draws the weapon in front" — which looks wrong on N/NW/NE attack frames.

## What that means for Prontera Grind

* The game **already composite head + body into one sheet at runtime** (`packTex()` in
  `index.html`, per class × sex × hairstyle). "Bake them into one sprite" is therefore not
  a new idea — it is how it works. The failure is not the layering, it is the **anchors**.
* Baking the head *art* into the pack instead would kill hairstyle and hat changes: the
  head sheet holds **19 hairstyles**, so it would be 19 classes × 19 styles ≈ 361 atlases
  instead of 19 + 2. RO keeps the head separate for the same reason.
* The head anchor is already measured from the art (`head_stub + HEAD_SEAT`, house rule 4).
  The **weapon has no measured anchor at all** — `PACK_WEAPON_ADJUST` is one hard-coded
  `[dx,dy]` per weapon family for every class, pose and frame. That is the "weapon does not
  attach properly" the owner keeps seeing.
* The other half of the problem is the **pose inventory**: the sheets are inconsistent
  (below), so the reader picks the wrong figure for a view/animation and the head then sits
  on a pose that is falling over, sitting down or looking the other way.

### The recommended fix, in order

1. **Owner's pick** of which pose fills each of the 24 slots (8 views × idle/walk/attack)
   per class — that is what `tools/sprite_picker.html` collects.
2. **Per-cell measured head anchors** on the chosen poses (already the rule; re-measure
   after the rebuild).
3. **Per-cell measured weapon grip**: find the hand in the pose (the bare-skin blob away
   from the neck stub) and store that as the grip point, per class × animation × direction
   × frame — the RO `.act` analogue. Fall back to the current procedural hand point, and
   keep a per-class × weapon nudge table (the picker's click-to-fix) for the residue.
4. **Direction-aware layer order**: draw the weapon behind the body on the attack frames
   of the away-facing views (N/NW/NE), in front otherwise — RO does this from its tables.
5. Only then re-cut the pack; keep the montage pipeline as the fallback for sheets that are
   still montages.

## What this repo's sheets actually contain (measured 2026-10-04)

| sheet | layout | notes |
|---|---|---|
| novice, swordman, mage, archer, aco, thief, merchant, knight, wizard, hunter, sniper, priest, blacksmith, assassin, assassin cross | one row per direction | row 0 mixes idle (figs 0–4) with knocked-down/sitting poses; some rows carry fewer than 8 walk figures (novice/wizard rows 4–6 hold 6) |
| lord knight, high wizard, high priest, white smith | montage | whole strips pasted onto one canvas with drawn borders; poses only reachable by matching against the class line's proper sheet |

Consequence for the reader in `tools/make_sprite_pack.py`: `normal_labels()` is a
**guess** (idle = row 0 figs 0–4, walk = rows 1–5, attack = rows 4–8 after the walk cycle),
and the guess is exactly where wrong poses enter the pack. The picker shows every pose with
this guess attached and lets the owner overrule it.

## The weapon pass (2026-10-04, `tools/weapon_bake.py`)

Everything below was measured on the owner's own 19-class selection; numbers live in
`tools/weapon_grips.json` and the reasoning in `tools/weapon-plan.md`.

* **The sheets are bare-handed.** No pose of any of the 21 sheets draws a weapon, and there is no
  weapon art in the repo (`assets/kit/ro-spritesheet.png` is terrain). Weapons are composited, as
  in real RO. A "weapon" in this project is one of seven silhouettes: `sword, dagger, katar,
  staff, bow, axe, mace`.
* **`assets/weapon_joints_data.js` cannot drive the bake.** It is measured per frame in isolation
  ("the skin blob furthest from the hip"), which hops between the two arms
  (`knight dir 0 → 65, 67, 69, 45, 68, 45`), and it only covers the standard attack rows while
  **197 of the owner's 570 picked poses come from other rows**. Keep the file for the legacy
  runtime path; never use it as the grip source for a bake.
* **Frame differencing is a dead end.** An attack moves the whole body, so motion highlights the
  entire silhouette instead of the swinging arm. Tried and rejected.
* **What works** (all of it in `weapon_bake.py`):
  1. take the cell exactly as the picker does (nearest-neighbour, `ox=floor((96-w)/2)`,
     `oy=90-h`, mirrored views mirrored);
  2. skin mask from the body's own neck colour (`make_sprite_pack.head_stub`), candidates =
     hand-sized blobs below the shoulder line, rejecting blobs that are large **and** reach the
     ground line (those are legs/boots);
  3. per blob use the pixel **farthest from the torso** — the fist, not the elbow;
  4. **track one arm across the six frames**: seed on the frame whose best candidate is farthest
     from the torso, then chain the candidate nearest the previous frame's fist (≤ 30 px); if
     nothing chains, take the silhouette extremity on the same side (cutting the bottom 30 % of
     the shoulder→ground span so boots never win); if even that fails, **hold the previous point**
     so the weapon never jumps;
  5. angle = the forearm axis (shoulder → hand); rotate it away from the body in 2° steps until the
     blade clears the torso by `6 + half the weapon's width` (an axe head is 13 px wide); bows and
     staves are `UPRIGHT` and get a small fixed tilt instead.
* **Coverage on the owner's selection: 570/570 armed cells.** 315 measured from a bare hand; 255
  inferred from the glove/wrist/hidden arm — concentrated in the armoured classes (Knight 8/30
  found, Lord Knight 9/30, High Wizard 10/30 … Mage 27/30, Thief 25/30). The review page marks
  those tiles "inferred", so the owner's eye is spent where it matters.
* **Views 3/4/5 (NW/N/NE) stay bare** (the owner's v27 rule) and idle/walk stay weaponless (v26);
  the bake only fills views 0,1,2,6,7. Any future weapon on an away-facing view needs art per
  direction — front-view art cannot be turned into a back-view grip honestly.
* **Review loop:** `tools/weapon_bake.py --review tools/weapon_review_data.js` writes the pictures
  the page shows; the owner's paste-back JSON (`{"version":1,"adjust":{"Class|view|frame":[dx,dy]}}`)
  goes straight into `--adjust`, so nobody re-measures anything.
* **Art sources, in order:** `Sprite/weapons/<type>.png` (plus optional `grip.json`) →
  `assets/weapons/<type>.png` (the game's item icons, fetched by `--fetch-icons` — the sandbox has
  no outbound internet for that host) → the shapes the game draws itself (`drawWep`). Placement is
  independent of the art, so swapping art never needs a re-measure.

## Sources

* rAthena wiki, *Acts* — layer list, per-frame X/Y offsets, flip, direction control:
  https://github.com/rathena/rathena/wiki/Acts
* kidmortal/ragnarok-sprite-generator, `docs/how-it-works.md` — action = animation × 8 +
  direction; head/headgear parented via `bodyAnchor − ownAnchor`; weapons/shields/garments
  unparented and hand-corrected; draw order garment −1, body 0, head 1, weapon 2, shield 3,
  headgear 4+n: https://github.com/kidmortal/ragnarok-sprite-generator
* adsonpleal/ragassets — `action = (animation type × 8) + direction`; the client's
  per-direction layer-priority table decides what draws behind: https://github.com/adsonpleal/ragassets
* r/RagnarokOnline (ACT Editor thread) — every sprite is composited on shared body/head
  anchors; weapons and garments use the body anchor, headgears the head anchor:
  https://www.reddit.com/r/RagnarokOnline/comments/1m7q56r/
* NamuWiki, *Ragnarok Online* — five drawn facings covering eight directions, right side
  mirrored; weapons need per-class motions, headgear does not:
  https://en.namu.wiki/w/라그나로크%20온라인
