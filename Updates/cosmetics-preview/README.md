# Celestial Vanguard — first cosmetic fitting

Open `index.html` through the repository preview server, or open the downloaded standalone folder's `index.html`. Four independent switches produce 16 complete combinations. This is a visual prototype for the male Lord Knight, not a live-game unlock or save migration.

## The four pieces

| Slot | Preview name | Original source |
| --- | --- | --- |
| Headgear | Angel Halo | Ragnarok Online Angel's Halo / Auréola, item 2282, headgear view 69 |
| Face | Classic Glasses | Ragnarok Online Glasses / Óculos, item 2203, headgear view 3 |
| Back | Archangel Wings | Ragnarok Online Archangel Wings / Asas de Arcanjo, item 2573, garment view 1 |
| Costume | Vanguard Armor | Preview name for Ragnarok Online's Rune Knight alternate outfit, job 4054, outfit 1 |

Art is by Gravity, served by the [ragassets public renderer](https://github.com/adsonpleal/ragassets). All requests and downloaded-file SHA-256 hashes are in `art/sources.json`. No external requests are made by the fitting room itself. The [official Ragnarok Online 3 site](https://ro3.roglobal.com/) was inspected as a reference; this collection contains classic RO sprites, not RO3 art. A usable RO3 directional costume sprite set was not found in this research pass.

## Accurate attachment

The original appearance is job 4008, male, head 40, head palette 0. Its 29 RGBA frames and delays match the current game's Lord Knight APNGs exactly across S, SE, NE and attack. Each combination is rendered using native RO action and attachment data. No painted hats, stretched inventory icons, guessed universal offsets, or recolored artwork are used.

The costume is a full body replacement and has its own native motions. Its export origin is four pixels higher to align its feet with the existing character. The base uses `200x200+100+150`; the costume uses `200x200+100+146`. Headgear and wings are included during native composition, so their layers follow the selected body and direction.

The current game supplies three walking views and one attack view for this character. This fitting room covers those same views; Mirror view is explicitly a horizontal reflection, not an additional independently drawn direction. Attack poses are shown without a weapon overlay. Weapon placement on the new outfit still needs a separate fitting pass before live integration.

Halos and glasses use the native head attachment. The robe/wing data determines front/back occlusion. Some wings are naturally hidden during the turning attack poses. The original hairstyle is retained with and without the costume. Images retain transparency, original colors and original frame delays. Still mode shows the first decoded frame and defaults on when the browser requests reduced motion.

## Reproduce

Requires Python with Pillow for fetching/metadata generation; the preview has no package dependencies.

```sh
python3 tools/fetch_cosmetics.py --fetch # fetch missing source files only, then rebuild metadata
python3 tools/fetch_cosmetics.py         # rebuild from local source images only
node tools/tests/cosmetics_sim.js
python3 tools/preview_server.py 8000
```

Open `http://localhost:8000/Updates/cosmetics-preview/`.

The prototype lives in `Updates/cosmetics-preview/`, outside the production site's published file list. It changes no character stats, equipment, progression, saves or live-game code. The next live integration step is fitting costume weapons and checking the other class/gender combinations, then connecting selections to the wardrobe/save system.
