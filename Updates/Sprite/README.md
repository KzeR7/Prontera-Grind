# Canonical class-sprite reference backup

`Updates/Sprite/index.html` is the **single canonical browser reference** for the seven uploaded class-tree folders. Keep refreshing that page in place; do not make a second `final`, `new`, or `backup` copy. Its local pose gallery and review-note tools are for inspection and comments, not runtime game assets.

## Refresh after adding or replacing PNGs

From the repository root, run:

```sh
python3 tools/make_sprite_viewer.py
python3 tools/make_sprite_viewer.py --check
node tools/tests/sprite_viewer_sim.js
```

The generator rebuilds the embedded folder/class and image manifests in `index.html`. It checks the seven configured folders, class/gender filename conventions, and 200×200 PNG dimensions. If a new class or tree is added, first add its label and folder mapping in `tools/make_sprite_viewer.py`, then regenerate and test.

Open `Updates/Sprite/index.html` in a browser or serve the repository with the project's local HTTP server. The page uses only local relative PNG paths and has no external script dependency. Review notes stay in the browser unless copied or downloaded by the owner.

## This set is now what the live game wears

Every file here is a full-body 200×200 **animated PNG**: it carries several frames, its own per-frame delays and `num_plays = 0` (loop forever). A still reader only ever sees frame 0, which is how an earlier version of this note wrongly described the set as "still poses" — parse `acTL`/`fcTL` or step `ImageSequence` before judging a file. Frame counts in the uploaded set: 8 frames (127 files), 5 (13), 6 (4), 9 (10). What the set does **not** carry is an idle animation, an E or W drawing, a straight-up N drawing (High Priest is the only exception), or the game's 19 selectable hair styles — so the live game walks in place while you stand still, uses SE for straight left/right, uses NE for straight up unless the class supplies its own N, and cannot put the old hairstyles on top of the art.

`assets/class_skins_data.js` (built by `python3 tools/make_class_skins.py`, checked with `--check`) stores, for every class and gender: the source file per view, its frame count, its per-frame delays, the union of its frames' opaque bounds, its drawn height and its ground line. `node tools/tests/class_skin_sim.js` checks all of that against the real files (APNG chunk by chunk), plus the mapping, both genders, the routes and mirrors, the previews and the asset loading. `tools/preview_class_skins.py` paints one directions sheet and one frame-by-frame walk-cycle sheet per class offline for review.

The game never runs these files through the 8×24 atlas slicing: the browser decodes and plays them, and each rendered frame copies what the browser is showing onto a 200×200 canvas used as the hero's `CanvasTexture`. There is no frame counter in the game, so the files' own timing and endless loop are what the player sees.

Do not replace `assets/sprite_pack_data.js` or the root `Sprite/*.png` sheets with this set: the animated pack is still the fallback art, and `node tools/tests/pack_sim.js` still checks that compositor and the class-to-skin mapping.

`tools/sprite_picker_standalone.html` and `tools/attack_selection.json` are separate game attack-pose/head-seat tools and backups. They are intentionally not overwritten by this reference page.
