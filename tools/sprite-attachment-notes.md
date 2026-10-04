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
