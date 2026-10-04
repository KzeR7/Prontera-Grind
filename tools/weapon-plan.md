# The weapon side — what I found, what is already done, what only you can decide

*Written 2026-10-04, after the 19-class selection. Nothing in here is in the game yet.*

You asked: *"tell me how can we move in with the weapon side? maybe i pin point out the hands
for u?"* — and *"do as much, prepare and research before u hand it to me."*

Short answer: **you do not need to pin-point the hands.** The hand is measurable from your own
poses, I have measured all 912 cells, and there is a page where a wrong one is one drag to fix.
You had 4 real questions to answer — they are at the bottom.

---

## 1. What the sheets actually contain

I looked at all 21 sheets in `Sprite/` first, because that decides everything:

* the character bodies are **bare-handed** — there is no weapon drawn in any pose of any sheet;
* there is no weapon art anywhere else in the repo either (`assets/` holds the pack, the mobs,
  the joints file; `assets/kit/ro-spritesheet.png` is terrain and props).
* the sheet rows are idle / walk / attack; every class runs 8 directions and the attack row has
  6 figures. Your selection uses the standard attack row for **373 of 570 poses** — the other
  **197 come from other rows** (rows 6/7 mostly), which is exactly the cell you singled out.

So "hold a weapon" has to be composited: body + head + weapon into one cell. That matches how
Ragnarok Online works (weapons are separate art aligned to the body, `tools/sprite-attachment-notes.md`).

## 2. Why the weapon slides today (and why v28 did not fix it)

The game now draws a **Divine Pride item icon** and *guesses* where it goes from a sine-wave arm
model (`poseOf().arm/lift/lunge`) plus one constant offset per weapon type. Nothing in that model
knows where the drawn hand is, so the weapon moves while the hand does not — the thing you
reported. v27 hid the icon on NW/N/NE because front-view icon art reads wrong there.

v28 measured a hand per body/direction/frame into `assets/weapon_joints_data.js`. It failed for
two reasons I can now name:

1. **It measures each frame on its own**, taking "the skin blob furthest from the hip". In a swing
   the *other* arm is often further away, so the point hops between arms:
   `knight dir 0 → 65, 67, 69, 45, 68, 45` px. Neighbouring frames 24 px apart is a flicker.
2. **It only knows the standard attack rows.** 197 of your 570 poses are not in them, so 35 % of
   your selection had no data at all.

I also tried the obvious alternative — *find the arm by what moves between frames*. Dead end: the
whole body lurches in an attack, so motion lights up the entire silhouette. Recorded here so
nobody tries it a third time.

## 3. What I built instead (automatic, no hand-pinning)

`tools/weapon_bake.py` — the pass that produced the page you can look at:

1. **Measure from your picked cells**, not from the grid: the crop is taken exactly the way the
   picker takes it (nearest-neighbour, `ox=floor((96-w)/2)`, `oy=90-h`, mirrored views mirrored).
2. **Skin** comes from the body's own neck colour (the same trick the pack uses), so a knight's
   brown glove and a mage's skin are told apart; the *candidate* is a hand-sized blob below the
   shoulders; the *point* taken from it is the pixel farthest from the torso — the fist, not the
   elbow, and never a boot.
3. **Track the arm across the six frames**: seed on the frame where the hand is clearest, then
   chain the nearest candidate frame by frame. If the arm is behind the body, the grip **holds
   its last position** instead of jumping — no flicker, ever.
4. **Angle** continues the forearm; a guard rotates the weapon further out until the blade clears
   the body (an axe head is 13 px wide — it must not lie across the chest); bows and staves get a
   small fixed tilt instead, because they are carried upright.
5. **Nothing moves by itself when the frames advance**: the grip is per view, one arm, and the
   angle changes smoothly.

Result over your selection: **570/570 armed cells have a grip**; 315 of them measured from a bare
hand, 255 inferred from the glove/wrist/hidden-arm outline (the gloved classes: Knight 8/30 from
bare skin, Mage 27/30, Sniper 14/30, Whitesmith 17/30). Where it inferred, the page says
"inferred" on the tile — those are the ones worth a look, and they are also the ones the game's
own artists would have nudged by hand.

The automatic placement is in `tools/weapon_grips.json` (numbers) and
`tools/weapon_review_data.js` (the pictures the page shows).

## 4. Your part: a page, and only the tiles that look wrong

Open **`tools/weapon_review.html`** (or `weapon_review_standalone.html` for a plain file —
same page, data baked in).

* every class, 8 views, 6 frames, weapon already placed, head already on;
* drag any tile whose weapon looks wrong — by default **one drag carries all six frames of that
  view**, so a view takes one drag, not six; arrow keys nudge 1 px (Shift: 5);
* `↺ Back to the automatic` per class if you disagree with everything;
* **Copy my adjustments** gives one small JSON block — paste it back to me.

Six views need no weapon: NW, N, NE stay bare (your v27 rule), and the mirrored side views keep
their own numbers. If the automatic pass is good as it is, say so and I bake it as it stands —
you would owe nothing.

## 5. The four things only you can decide

1. **Weapon art — which one?**
   * **(a) the item icons the game shows today** (Divine Pride). It is the art you already see in
     the game, and I can bake it, but the icons have to be saved into `assets/weapons/` first:
     this sandbox has no internet, so it takes one online run of
     `python3 tools/weapon_bake.py --fetch-icons` on a machine that has one (yours, or I retry
     here when the sandbox allows it).
   * **(b) real weapon sheets**, if you have any — drop `Sprite/weapons/sword.png`,
     `bow.png`, … plus an optional `grip.json` for the grip pixel. Best quality, no code change.
   * **(c) the shapes the game draws itself** (`drawWep`) — offline immediately, that is what the
     preview pictures currently use. Honest note: they are simple; they read fine at 96 px but
     they are not as pretty as real art.
2. **Do away-facing views really stay bare?** The preview keeps your v27 rule. If you want a
   weapon on N/NW/NE, front-view art cannot be turned into a back-view grip honestly — that needs
   art per direction. Say the word and I will only do it if the art exists.
3. **Idle and walk stay weaponless** (your v26 rule: the weapon shows during an attack only).
   Confirm, or tell me which rows should hold one.
4. **Baked into the pack, or drawn live?** You asked for one flattened image per pose, so the plan
   is: bake body + head + weapon into the pack's attack atlas, `index.html` draws one image, and
   the whole runtime weapon layer (`WEAPON_ICON_*`, `syncWeaponSprites`, the joints fallback) gets
   deleted. That is the last step, after your review.

## 6. After you confirm

1. I fold your adjustments back in (`--adjust`), bake the weapon into the pack's attack cells for
   the 5 armed views, keep the 3 bare views bare, bump `BUILD` and delete the runtime weapon path.
2. The picker stays exactly as it is — it carries no weapon UI and will not gain one.
3. Weapon textures and names stay as they are; nothing about drops, stats or the shop changes.

---

### Files, for whoever picks this up next

| path | what it is |
| --- | --- |
| `tools/weapon_bake.py` | measure + track + place + proof + review-data writer (`--proof`, `--review`, `--standalone`, `--art`, `--fetch-icons`, `--adjust`) |
| `tools/weapon_grips.json` | the automatic pass: `grips[class][view][frame] = [x, y, angle, how]` |
| `tools/weapon_review.html` | the page the owner reviews (loads `weapon_review_data.js`) |
| `tools/weapon_review_standalone.html` | the same page with the data inlined, for a file:// open |
| `tools/tests/weapon_review_sim.js` | 13 checks: every class/view/frame, no weapon on bare views, drag never inverted, export exact |
| `tools/preview_weapon.png` | contact sheet of the automatic pass, all 19 classes |
