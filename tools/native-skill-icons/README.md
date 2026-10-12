# Supplied skill icons

All 91 player skills use exact, unmodified PNG crops from the owner's three supplied sheets. `source-map.json` pins sheet hashes/lengths and documents each skill's actual current name, class, visual subject, family and crop rectangle. Assassin/Assassin Cross use purple shadow blades, claws and poison art; Swordman uses swords, sword strikes and training. Holy, elemental, bow, merchant and defensive art follow each skill's current effect. Historical skill IDs are not a reliable description of the renamed effects.

Save the original attachments as `sheet-1.png`, `sheet-2.png`, `sheet-3.png` in an external input directory, then run:

```sh
python tools/build_skill_icons.py <sheet-directory>
```

Pillow is required. The build verifies pinned originals and writes `assets/skill-icons.js` and `assets/skill-icons/`. It does not recolor or rescale source pixels. Closely related effects share some crops: 79 PNGs cover91 skills. The complete PNG/catalog pack is1,798,662 bytes; visible skill cards request individual local images lazily. Pinterest was unnecessary because the supplied sheets cover the current skill effects. Original attachments are retained outside the published tree.

Audit exact pixels using `tools/tests/skill_pet_assets.py`; UI coverage checks all91 mapped skills. The game continues to use its existing class/skill ordering, skill levels, descriptions, autocast controls and upgrade actions.
