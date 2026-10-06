# Ragnarok Online weapon art — where it comes from, how it is read

*Written 2026-10-05 for the weapon proposal pass. Read this before touching
`tools/make_weapon_pack.py`, `assets/weapons/` or `tools/weapon_proposal.html`.*

## Why this exists

The owner asked for weapons on the 19 class sprites, with real Ragnarok Online art rather
than anything drawn by hand (house rule 1). The classes carry **no weapon in any pose** of
any sheet — every body in `Updates/Sprite/` is bare-handed — so a weapon has to be composited
on top, exactly the way the real client does it. The real client's weapon art is what this
pass harvests.

## What the client actually ships

Inside a Ragnarok Online client, under `data/sprite/` (folder names are cp949 Korean):

| path | what it is | size on screen |
| --- | --- | --- |
| `아이템/<item>.spr` | the art an item wears **lying on the ground**. One frame, a front view. This is the recognisable item art. | 18-26 px square |
| `인간족/<job>/<job>_<sex>_<weapon>.spr` + `.act` | the **held weapon**, drawn on the character, animated with the body | 20-90 px, 6-15 frames |
| `방패/<job>/…` | shields, same idea as held weapons | — |
| `악세사리/{남,여}/…` | headgear, with the body's per-direction layers | — |
| `인간족/몸통/{남,여}/…` | the classic **body** the weapon art is proportioned for | 27-43 × 70-75 px |

**The scale matters.** The classic body is ~74 px tall and the HD class art this repo ships
is ~90 px of drawn height, so a classic weapon drawn at `1 : 1` comes out about 18% short.
`BASE_SCALE = 1.25` in the proposal page is that ratio (74 × 1.25 ≈ 92).

## The two file formats

Both readers are in `tools/make_weapon_pack.py` (stdlib only). The traps below each cost
real time; they are written down so nobody re-discovers them.

### SPR (sprites)

Header: `SP` + `uint16 version`.  **A version of `0x201` means 2.01 — the bytes are
little-endian and read "1.2" in a hex dump.**

* `uint16 n_indexed`, and `uint16 n_rgba` **only when version ≥ 0x200**.
* The **palette is the last 1024 bytes** of the file, 256 entries of `[R, G, B, A]`.
* Indexed frames, version ≥ 0x201: `uint16 w`, `uint16 h`, then **`uint16 size`** — the
  byte length of this frame's compressed data — then that many bytes of data. Then the next
  frame's header follows. The size prefix is the thing every simple reader misses: without
  it you decode the next frame's width as pixel data and the whole file derails.
* The RLE: `0x00 n` writes `n` **transparent** pixels (so two direct zero bytes are a run of
  two, not one); any other byte is one literal palette index.
* Decoding a pixel: **index 0 is transparent**, every other index is opaque. The palette's
  own alpha byte is not the opacity — doing it the other way round (255 − A) yields the
  same art for most files and silently wrong art for some, which is worse.
* Version < 0x201: frames are raw `w*h` bytes with no size prefix and no RLE.

### ACT (animation)

Header `AC` + `uint16 version` (0x205 in every weapon file here), `uint16 n_actions`,
then 10 reserved bytes when version ≥ 0x200.

```
action          = uint32 n_frames, then frames
frame           = 32 bytes (attack range + fit range, unused)
                  uint32 n_layers, then layers
                  int32 event_id
                  uint32 n_anchors, then anchors (16 bytes each)
layer           = int32 x, int32 y, int32 sprite_index, uint32 flags   (16 bytes)
                  + 28 bytes of colour / scale / rotation / type / w / h
```

* `sprite_index = -1` is an **empty layer** — most actions of a weapon ACT are exactly that,
  which is why a reader that ignores the index looks like it decoded "nothing".
* `flags & 1` is the horizontal mirror.
* **Actions are grouped 8 per direction**, in the client's own order:
  `0 S · 1 SW · 2 W · 3 NW · 4 N · 5 NE · 6 E · 7 SE`, then the next group of eight is the
  next motion.
* The motions that carry weapon art are **4** (the standby-with-weapon pose) and **10/11**
  (the attack). Within one motion the client only keeps **two or three different drawings**:
  one used by the south-facing directions (S, SE, E, SW) and one by the north-facing ones
  (W, NW, N, NE). That is why a proposal page needs a per-view angle rather than an exact
  per-direction sprite — the angles genuinely do not exist in this art.

## What this repo ships

```
assets/weapons/<design>.png            24 item images, cropped to their own opaque bounds
assets/weapons/held/<design>__<D>.png  held-weapon frames, only for the designs that have them
assets/weapons_data.js                 the same images, base64, so the page works from file://
assets/weapons_manifest.json           per image: family, label and the exact client path it came from
```

`tools/make_weapon_pack.py --source <extracted client>` rebuilds all of it; `--check` fails
when `assets/` is stale. Eight families × three designs, listed in `DESIGN` at the top of the
tool — that list is the whole curation, so swapping a design is one line.

## Where the art came from (provenance)

The sandbox can reach **GitHub and PyPI only** — every other host is blocked, including
`divine-pride` and the raw/`media.githubusercontent` file endpoints. The art here was read
from two public mirrors of an extracted client, cloned over git:

| mirror | what it held |
| --- | --- |
| `tiagofm94/RO-Clientresources` (and its larger forks) | `data/sprite/아이템/` — 1128 item sprites, including `프리스트의검`, `서늘한검`, `카타르`, `골든로드스태프`, … the 24 designs used here |
| `sammeepay/RO-Clientresources` | the held-weapon sprites: `인간족/*/*_프리스트의검.spr` (8 jobs), `어세신_*_카타르*.spr`, `바드_남_활.Spr`, `세이지_남_28603.spr` |
| `adsonpleal/ragassets` | `tools make_weapon_pack.py`'s SPR reader was checked against its Go reader (`gateway/internal/render/roformat/spr.go`) — that is where the `uint16 size` prefix was found |

The pixels are Gravity's. **Crop only** — the packer crops to the sprite's own opaque bounds
and never scales, redraws or recolours. `assets/weapons_manifest.json` names the source file
for every image so the set can be re-derived or swapped.

Items the client ships that were considered and **not** used (they are not held weapons, even
though a name search finds them): `서늘한책` (a book), `서늘한바이올린` (a violin),
`서늘한채찍` (a whip), `풍신의부채` (a fan), `매의눈` (a monocle), and every
`서늘한*` armour / `골든로드*` armour piece.

## The proposal page

`tools/weapon_proposal.html` (served at `/` by `tools/preview_server.py`) — never opened as a
raw `file://` file if the class art is to animate:

* it decodes the class APNGs with the same walk `index.html` uses (`skinDecodePng` → chunk
  walk, `DecompressionStream('deflate')`, `unfilter`, APNG blend/dispose), so what the owner
  sees is the real animation, not a wrong-colour sprite;
* **it opens frozen on frame 0.** Placement against a moving sprite was the owner's first
  complaint. `▶ Play animation` / `❄ Freeze` (or the `,` / `.` keys) step frames with
  `◀ frame` / `frame ▶`; the pause bar always names the frame it is showing;
* **each gender has its own sprites and its own numbers.** `♂ Male` / `♀ Female` in the stage
  bar switches the art; the hand, offset, angle, size and flip are stored **per sprite per
  view**, because the two sheets are different drawings with different pose boxes (and four
  views have a different number of frames: Knight attack 9 vs 5, Acolyte South-East 8 vs 5,
  Wizard attack 8 vs 9, High Wizard attack 5 vs 8). `⧉ copy this class to the other gender`
  drops everything about the class onto the other sprite — deliberately, as a **starting
  point**, not as truth: her hands still want their own pass. When a proposal written for one
  sprite (a hand-back, or the shipped default) names a view where the other sprite has a
  different drawing count, that sprite keeps the shared numbers instead of a frame index that
  means nothing, and the page says so under **Sprite**;
* **every placement belongs to the frame you are on.** A hand moves during a walk cycle, so
  one fixed spot cannot follow it: the hand, offset, rotation, size and flip you set are
  stored against that frame index, and playing the animation draws each drawing with its own
  numbers — the weapon moves with the body. A frame you have not touched uses the view's
  **shared** numbers (the automatic hand until you choose one), unless **blend the frames in
  between** is ticked and two or more frames have their own numbers, in which case the frames
  between them are a straight line (before the first key and after the last one the weapon
  holds that key's place). One lone key changes only its own frame — it cannot freeze the
  whole walk on itself. `📌 copy to every frame` gives every drawing of the view the
  placement you are looking at; `clear this frame` hands that frame back to the shared
  numbers. The line under the frame stepper always says which of the three you are looking at
  and how many frames of the view are tuned;
* one weapon is drawn at the hand at the view's angle, **draggable**, rotatable (wheel,
  `[`/`]`), sizable (`-`/`+`) and resettable (`0`);
* **🎯 Set hand** locks the weapon onto a hand the owner picks: click the sprite and that
  view's grip is set, in 200×200 class-sprite pixels, **and the weapon snaps its grip onto
  that exact point** (the click clears `dx`/`dy`, which is what makes the snap visible — with
  an old nudge left in place the weapon lands beside the crosshair and the click looks like it
  did nothing). A dashed crosshair follows the pointer while the mode is on, a badge beside
  the button shows the hand (`automatic (x, y)` or `x, y (set)`), and a view with no weapon
  says so on the canvas instead of looking broken. Arrow keys nudge by 1 px (Shift = 5),
  `use this hand on every view` copies it, `↺ automatic hand` goes back to the guess. Every
  view follows its own automatic guess until it is clicked — the hand is per class *and*
  per view. The listener sits on the **document in the capture phase** and refuses clicks that
  land on a control, so nothing on the page can swallow the click;
* a **"Weapon per view" table** decides which drawings carry a weapon: one checkbox per view
  (South, South-East, North-East, Attack (SE), North when the class has that drawing), with
  that view's hand, offset and angle beside it, plus `weapon on every view` and
  `bare-handed everywhere`. So "bare on South and South-East, armed only while attacking" is
  expressible per class;
* **flip**: `⇄ Flip left/right`, `⇅ Flip up/down` and `↺ normal` (or the `F` / `V` keys, or
  the ⇄ ⇅ buttons on each row of the view table) mirror the weapon image **about its own grip
  point**, so a flipped weapon stays in the hand instead of jumping sideways. The flip is per
  class *and* per view;
* the class list's **✕** is still the whole-job switch: no weapon on any view;
* three designs per family, click to swap;
* **Every class at a glance** — `▤ show the pictures` opens 19 small live pictures, one per class,
  each showing that class's weapon row as the page is currently holding it (saved default or unsaved
  edits), animated, with one word under it: **her own numbers** / **same as his** / **his on some
  views** / **not tuned yet**, plus a count line above the grid. Clicking a picture selects that
  class. It opens hidden so the page still lands on the picker;
* **one composite rule, one function.** The stage and those pictures both go through `paintCell`
  (body frame, hand marker, weapon at the grip + the frame's own numbers, mirror about the grip),
  so a picture can never show something the picker would not. `tools/tests/weapon_proposal_sim.js`
  asserts both call it, and unit-tests the rule on a recording canvas: bare view = body and no
  weapon, armed view = weapon exactly at `hand + dx/dy`, rotated by the family angle plus the
  frame's own `rot`. The same suite also checks every element id the script reaches for exists in
  the markup (a typo there would boot a null and kill the page, and the DOM stub would hide it);
* **the page opens on the owner's progress.** `assets/weapon_proposal_data.js`
  (`window.WEAPON_PROPOSAL_DEFAULT`, generated from the owner's own `Copy my proposal`
  hand-back) is loaded by a `<script src>` before the page script, so a fresh browser, an
  empty `localStorage` or a different machine all start from the same tuned numbers. Edits
  still win over it; `↺ back to the saved default` clears this browser and returns to it, and
  `📥 Load a saved proposal JSON` pastes a hand-back back in (a v3 file — one sprite — is
  accepted and copied to both, with the frame-count caveat above);
  * only the drawings the owner really placed are stored, each marked `"src": "frame"`; the
  entries their own export had **blended** between two keys are deliberately left out, so the
  page re-derives those lines from the same keys (the numbers come out the same, and a view
  whose frames were all inherited stays empty and follows the sprite's own guess);
  * the shipped numbers are the owner's, so a view that looks off on the female sprite is
  usually a class they copied across with **`⧉ copy this class to the other gender`** — her
  four basic classes (Novice, Swordman, Mage, Archer) currently carry his attack numbers on
  her, whose pose boxes sit elsewhere in the 200×200 box; that is her tuning still to do, not
  a page fault;
* choices persist in `localStorage` under `pg_weapon_proposal_v3` (older `_v2`/`_v1` entries
  are migrated; `_v2`'s single placement is copied to both sprites, which is accurate for
  every view where the two sprites agree and a starting point elsewhere);
* **Copy my proposal** exports one JSON block (v4): per class
  `{family, design, views: {m: {<view>: …}, f: {<view>: …}}}` — that block is the whole
  hand-back, one block per sprite. `base` is the shared placement an untouched frame falls back to
  (`handAuto: true` means that hand is still the built-in guess), and `frames` is **one
  already-resolved entry per drawing** — `{hand, dx, dy, rot, scale, flip, src}` — so the game
  never has to blend anything itself. `src` is `frame`, `blend` or `shared`. `flip` is
  `[1|-1, 1|-1]` (left/right, up/down).

Two frames of truth to keep in mind when reading a proposal back:

* `dx`/`dy` are in **200×200 class-sprite pixels**, the same space `poses` in
  `assets/class_skins_data.js` uses, and the same space `hand` is measured in;
* `rot` is **added to** the family's default angle for that view, which lives in `ANGLE` in
  the page;
* `hand` is `[x, y]` or `null` — **`null` means "keep guessing"**, not "0,0". Leave it null
  unless the sprite drawing really does sit somewhere the guess cannot reach.

## The step after approval

1. fold the returned JSON into `ANGLE`/`HAND`/`GRIP` (or a new per-class table),
2. bake the weapon into the class art — the class frames are packed per view, so the weapon
   lands in the same 200×200 frame the game already plays (no runtime layer),
3. re-run the suites, bump `BUILD`, append to `AGENTS.md`.

Nothing in the game reads `assets/weapons*` today: `index.html` still draws its own weapon
layer (`WEAPON_ICON_*`, `syncWeaponSprites`), and this pass did not change the game at all.
