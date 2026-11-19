# Supplied skill icons

All 91 player skills use exact, unmodified PNG crops from the owner's three supplied sheets. `source-map.json` pins sheet hashes/lengths and documents each skill's actual current name, class, visual subject, family and crop rectangle. Assassin/Assassin Cross use purple shadow blades, claws and poison art; Swordman uses swords, sword strikes and training. Holy, elemental, bow, merchant and defensive art follow each skill's current effect. Historical skill IDs are not a reliable description of the renamed effects.

Save the original attachments as `sheet-1.png`, `sheet-2.png`, `sheet-3.png` in an external input directory, then run:

```sh
python tools/build_skill_icons.py <sheet-directory>
```

Pillow is required. The build verifies pinned originals and writes `assets/skill-icons.js` and `assets/skill-icons/`. It does not recolor or rescale source pixels. Closely related effects share some crops: 79 PNGs cover91 skills. The complete PNG/catalog pack is1,798,662 bytes; visible skill cards request individual local images lazily. Pinterest was unnecessary because the supplied sheets cover the current skill effects. Original attachments are retained outside the published tree.

Audit exact pixels using `tools/tests/skill_pet_assets.py`; UI coverage checks all91 mapped skills. The game continues to use its existing class/skill ordering, skill levels, descriptions, autocast controls and upgrade actions.


## Fourth jobs and pet buffs (v204)

`assets/skill-icons-extra.js` extends the original registry with 36 distinct
fourth-job icons (including Ascension signatures) and four distinct pet buff
icons. It loads immediately after the original registry. The original 91 entries
and their crop files remain unchanged. Fourth-job aliases remain a fallback if
the supplemental registry fails to load.

The owner's reference links to RPG Skills Icons 05 by a-ravlik / Olekzandr
Zahorulko. The additions use the same artist's collections 08, 10 and 12, selected
from the author's public portfolio. `extra-source-map.json` records each source
URL/hash/length, selected rectangle, visual subject and family. These are exact
47×47 crops from those additional public sheets, with no painting, recolouring,
resizing or removal of source marks. Selected cells avoid the source labels.

Recover the three source images by their pinned URLs into an external directory,
using the filenames in `extra-source-map.json`, then run (Pillow 11.3.0):

```sh
python tools/build_extra_skill_icons.py <source-directory>
python tools/build_extra_skill_icons.py <source-directory> --check
```

The check compares every crop to its original pixels, rejects duplicate artwork,
and verifies generated registry/catalog bytes. Outputs are
`assets/skill-icons/extra/` and `assets/skill-icons-extra.js`. Since v438 the four
pet PNGs remain a fallback for the newer supplied-sheet crops below. Countdown,
description, keyboard focus and expiry behavior remain unchanged.
`fourth_job_skills_sim.js`, `display_polish_sim.js` and `publish_sim.js` cover
integration and delivery. No skill, pet, saved ID or combat value changes.

## Expanded-class skills, mastery titles and pet buffs (v437–v438)

The five supplied sheets are pinned in `supplied-2026-11-19/` and remain under
`tools/`, outside the published game. `expanded-source-map.json` records their
hashes and the exact, manually selected crop for each of the 130 expanded-class
skills, four pet buffs and the 50-symbol title grid. Each skill or pet buff gets
an unused, distinct crop chosen to fit its effect and colour; the existing `icon`
and `fx` fields remain unchanged as fallback metadata and cast effects. Symbol 47
has a wider recorded box so the source's long horizontal rays remain whole.

Build or audit with Pillow (the generated files are lossless WebP and compare
pixel-for-pixel to the source rectangles):

```sh
python tools/build_expanded_icon_assets.py
python tools/build_expanded_icon_assets.py --check
node tools/tests/expanded_roster_sim.js
node tools/tests/mastery_titles_buffs_sim.js
```

The generator writes `assets/expanded-skill-icons/`, `assets/title-symbols/`
and `assets/skill-icons-expanded.js`. Each icon is requested only when shown;
the source-only catalogs are omitted from the publish tree. The pet HUD uses
`pet_warcry`, `pet_arcane`, `pet_siphon` and `pet_vital` from the new registry,
falling back first to the v204 pet PNGs and then to the original skill art if a
registry is missing. `publish_sim.js` keeps a separate bounded budget for the new
art without increasing the classic or combined delivery ceilings.

The optional `tools/check_mastery_titles_browser.cjs` checks all 50 rendered image
bounds, the below-player label and pet examples at desktop and phone sizes; see
`docs/TESTING.md` for its disposable-preview command.
