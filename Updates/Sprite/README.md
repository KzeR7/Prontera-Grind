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

## Keep reference art separate from the live game pack

These files are individual full-body 200×200 still poses. They are not the game's eight-direction, multi-frame body/head atlas and do not carry the game's selectable hair. Do not replace `assets/sprite_pack_data.js` or the root `Sprite/*.png` sheets with this reference set. The game already resolves each of its 19 classes to its matching animated body when that body exists; `node tools/tests/pack_sim.js` checks the live compositor and class-to-skin mapping.

`tools/sprite_picker_standalone.html` and `tools/attack_selection.json` are separate game attack-pose/head-seat tools and backups. They are intentionally not overwritten by this reference page.
