# Prontera Grind — finished update, ready to push

`index.html` in this repo is the finished v7 build (`BUILD='2026-10-03 sprites-v7 all 19 classes'`)
and `assets/sprite_pack_data.js` is the matching 19-body sprite pack. The three test suites
pass. All that is left is to commit and push.

## If anything is missing — run the bootstrap

    python3 UPDATE-BOOTSTRAP.py

It writes the finished `index.html` and `tools/`, recovers the sprite sheets from
`origin/main` if they are not in the working tree, rebuilds `assets/sprite_pack_data.js`
from `Sprite/*.png`, and runs the test suites. It is safe to run twice. Then:

    git add -A
    git commit -m "All 19 classes on their own sprite art + class change is a restart"
    git push -u origin HEAD
    gh pr create --base main --fill

Send the user the pull-request link. That link is the only thing they need.

## What the update does

* **All 19 classes on their own sprite art**, cropped from the sheets in `Sprite/`
  (nothing drawn or substituted). Novice, Swordman, Mage, Archer, Acolyte, Thief,
  Merchant, Knight, Lord Knight, Wizard, High Wizard, Hunter, Sniper, Priest,
  High Priest, Blacksmith, Whitesmith, Assassin, Assassin Cross. Merchant moved off
  the blacksmith sheet. The four montage sheets (lord knight, white smith, high wizard,
  high priest) are rebuilt automatically — every pose matched, IoU 0.90–0.94.
* **Head wobble fixed**: per-cell head anchors measured from each body — 0.16–0.38 px
  seating (was 7–13 px; the shipped art measures 0.24).
* **Class change is a restart** (AXC 120/40 → Novice → Hunter example): loading a class
  starts it over at your current Base Lv with job levels cleared and stats refunded;
  the Novice restart drops you to Base Lv 25. Stepping away from a class keeps its own
  Base Lv, EXP, stats, points and gear in `S.base[class]`, so you can switch back to it.
* `tools/make_sprite_pack.py` rebuilds the pack after new sheets are dropped into `Sprite/`;
  `tools/montage.py` rebuilds the four montage sheets; `tools/tests/` holds the suites.

## Facts to verify after the rebuild

* 19 bodies in the pack, ~5.8 MB file.
* `node tools/tests/pack_sim.js` → all 19 classes composite a full 120 + 120 tile atlas
  (needs `/tmp/pack_block.js`, which the bootstrap writes).
* `node tools/tests/class_change_sim.js` → 11 passed, 0 failed.
* `node tools/tests/save_load_sim.js` → 4 passed, 0 failed.
* Login for the game: `GM` / `gm1234`.
