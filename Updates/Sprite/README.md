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

These files are individual full-body 200×200 still poses. They are not an eight-direction, multi-frame animation atlas and they do not carry the game's 19 selectable hair styles — that is why the live game draws them as **one still per view**: S, SE and NE walking plus the SE attack, mirrored for SW, NW and the SW attack, and it keeps the animated pack as the fallback until they load. `assets/class_skins_data.js` (built by `python3 tools/make_class_skins.py`, checked with `--check`) stores the crop box and file for every class and gender, and `node tools/tests/class_skin_sim.js` checks the mapping, both genders, the mirrors and the asset loading. `tools/preview_class_skins.py` paints the same picture offline for review.

Do not replace `assets/sprite_pack_data.js` or the root `Sprite/*.png` sheets with this set: the animated pack is still the fallback art, and `node tools/tests/pack_sim.js` still checks that compositor and the class-to-skin mapping.

`tools/sprite_picker_standalone.html` and `tools/attack_selection.json` are separate game attack-pose/head-seat tools and backups. They are intentionally not overwritten by this reference page.
