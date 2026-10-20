# Native wardrobe: all 25 classes

## Fourth-job rebuild (v179)

Rune Knight, Warlock, Ranger, Guillotine Cross, Arch Bishop and Mechanic now
support the same 20 hairstyles per gender, nine native palettes and 52 accessories
as the earlier nineteen classes. The live component pack is
`assets/wardrobe/fourth/v1/`; the earlier pack remains byte-identical at v5.
Default layered sprites match all 1,869 previous native composite animation frames
exactly, including position and world scale. No alternate body outfit is used.

Use Go 1.24.2, Python 3.9+ and Pillow 11.3.0. Check out ragassets
`4de4fa747431979d35c747d7edd549a872efd9e1` outside the game checkout. Install
`export.go` as `gateway/internal/render/engine/wardrobe_export.go`, `main.go` as
`gateway/cmd/wardrobe-export/main.go`, `accessory_export.go` as
`gateway/cmd/wardrobe-accessories/main.go` and `accessory_proof.go` as
`gateway/cmd/wardrobe-accessory-proof/main.go`. Build those three commands there.
The `mise exec go@1.24.2 -- go build ...` form works in the coding sandbox.

Recover inputs in this order (native-root and all scratch exports stay outside
the checkout):

```sh
python3 tools/native-fourth-jobs/recover.py /tmp/fourth-native
python3 tools/native-wardrobe/fetch_sources.py /tmp/fourth-native
python3 tools/native-wardrobe/fetch_accessory_sources.py /tmp/fourth-native
python3 tools/native-wardrobe/fetch_accessory_sources.py /tmp/fourth-native --manifest tools/native-wardrobe/requested-items-source-manifest.json
python3 tools/native-wardrobe/fetch_accessory_sources.py /tmp/fourth-native --manifest tools/native-wardrobe/seven-items-source-manifest.json
python3 tools/native-wardrobe/fetch_accessory_sources.py /tmp/fourth-native --manifest tools/native-wardrobe/fourth-source-manifest.json
python3 tools/native-wardrobe/prepare_fourth_previews.py /tmp/fourth-native --cache /tmp/fourth-previews
```

The fourth source manifest pins 310 original garment records, including per-job
Archangel wing data. The preview manifest pins 480 public responses: 48 per-job
trees and 432 PNG frame responses. All frame banks were independently fetched for
each class/gender and match the earlier pinned originals. Evil Scythe, Shuriken,
Poison Spider and Mainspring Screw use 96 explicitly derived ACT/SPR adapters;
these retain exact pixels/exposed geometry and are not recovered original binaries.
Preparation verifies fingerprints and must follow original input recovery so those
four preview adapters take precedence. Runtime serves only local files.

Create `/tmp/fourth-hairs.json` from the live hairstyle lists:

```sh
node -p "JSON.stringify({hairs:require('./assets/wardrobe.js').HAIRS})" > /tmp/fourth-hairs.json
python3 -c "import json; print(json.dumps({'classes':json.load(open('assets/wardrobe/fourth/v1/catalog.json'))['classes']}))" > /tmp/fourth-classes.json
```

Run the three built commands:

```sh
for job in 4054 4055 4056 4059 4057 4058; do
  wardrobe-export /tmp/fourth-native /tmp/fourth-hairs.json /tmp/fourth-exports/$job full $job || exit
  wardrobe-accessories /tmp/fourth-native tools/native-wardrobe/accessories.json /tmp/fourth-pieces/$job $job || exit
  wardrobe-accessory-proof /tmp/fourth-native tools/native-wardrobe/accessories.json /tmp/fourth-proofs/$job $job || exit
done
python3 tools/native-wardrobe/build_black_thunder.py /tmp/fourth-native /tmp/fourth-pieces /tmp/fourth-classes.json
python3 tools/build_wardrobe_collection.py /tmp/fourth-exports /tmp/fourth-pieces tools/native-wardrobe/accessories.json /tmp/fourth-pack --fourth-jobs
```

Copy the fresh pack into `assets/wardrobe/fourth/v1/` only after validation. It
contains 564 files / 6,233,243 bytes (5.94 MiB), maximum decoded atlas 4,026,880
bytes. Each store retains the existing 16 MiB image / 1 MiB metadata budgets.
Publishing excludes the obsolete fixed composites (retained in the checkout for
proofs), permits 6.25 MiB for this pack and 62.5 MiB for the complete site.

```sh
python3 tools/tests/wardrobe_accessories_assets.py /tmp/fourth-exports /tmp/fourth-pieces /tmp/fourth-proofs --pack assets/wardrobe/fourth/v1
python3 tools/tests/fourth_wardrobe_baseline.py
node tools/tests/fourth_job_runtime_sim.js
node tools/tests/wardrobe_game_sim.js
node tools/tests/wardrobe_sim.js
node tools/tests/publish_sim.js
```

The native audit checks 447,970 exact layer frames and 11,943 independent native
compositions (maximum 3/255 translucent rounding difference). Baseline proof checks
1,869 default frames pixel-for-pixel plus unchanged earlier-class assets. Runtime
coverage includes 2,160 hair/color looks and all 624 class/gender/piece choices.
Canvas and controls can be checked in the shared browser with the repository's
explicit renderer stub when the sandbox cannot create WebGL. That does not verify
GPU rendering or physical devices.

---

# Fifty-two-piece Wardrobe (v5)

V5 offers thirteen Head, twelve Face, ten Mouth and seventeen Wings pieces, plus None for each.
It renders the current class automatically. The previous Rune Knight, Warlock and
Guillotine Cross costumes are reserved for future class updates and removed from
live choices. Old saves wearing them return to the current class body while keeping
hair and accessories. Full-body costume replacements remain under research; the
user declined the event outfits and cloak-only previews.

## Seven additional pieces (v133)

| Category | English label | Item ID | View ID | Saved key |
| --- | --- | --- | --- | --- |
| Wings | Bear Bag | 20596 | 81 | `bearBag` |
| Wings | Shuriken | 480360 | 190 | `shuriken` |
| Wings | Poison Spider | 20613 | 101 | `poisonSpider` |
| Wings | Mainspring Screw | 20989 | 93 | `mainspringScrew` |
| Wings | Sorcerer Cape | 20630 | 280 | `sorcererCape` |
| Face | Gozarian Mask | 5475 | 472 | `gozarianMask` |
| Face | Demon Mask | 18540 | 714 | `demonMask` |

`seven-items-source-manifest.json` pins 124 original ACT/SPR records for Bear Bag,
Sorcerer Cape and the two masks. For Shuriken, Poison Spider and Mainspring Screw,
it pins 174 Divine Pride preview responses and 228 derived ACT/SPR adapter hashes.
Their original ACTs were unavailable. As with Evil Scythe, the adapters retain the
exact PNG pixels and exposed layer, attachment and animation fields; they are
explicitly derived development inputs, not recovered original binaries.
Gender references are checked against explicit item previews. Runtime serves only
local packed assets. The manifest also preserves all 488 previous asset records.

Recover and verify inputs using Python/Pillow and the pinned Go renderer below:

```sh
python3 tools/native-wardrobe/fetch_sources.py /tmp/seven-native
python3 tools/native-wardrobe/fetch_accessory_sources.py /tmp/seven-native --manifest tools/native-wardrobe/seven-items-source-manifest.json
python3 tools/native-wardrobe/prepare_garment_previews.py /tmp/seven-native --cache /tmp/seven-preview
```

Install the current `export.go`, `accessory_export.go` and `accessory_proof.go` into
ragassets at the pinned commit and build both commands as described below. Create
`/tmp/seven-defs.json` from the manifest's `items` object, then export every job:

```sh
for job in 0 2 9 4010 1 7 4008 6 12 4013 3 11 4012 4 8 4009 5 10 4011; do
  wardrobe-accessories /tmp/seven-native /tmp/seven-defs.json /tmp/seven-pieces/$job $job || exit
  wardrobe-accessory-proof /tmp/seven-native /tmp/seven-defs.json /tmp/seven-proofs/$job $job || exit
done
```

Use the preceding v132 pack as the append baseline; it is not represented by the
starting commit until the earlier additions are committed. Append each of the seven
saved keys with `build_wardrobe_collection.py --append <previous-pack> --piece <key>`
using a fresh output directory each time, and copy the last pack to `assets/wardrobe/v5/`.
All seven retain body-synchronized native action timing, both genders, all 19 classes,
eight directions and idle/walk/attack.

```sh
python3 tools/tests/seven_wardrobe_assets.py /tmp/seven-native /tmp/seven-pieces /tmp/seven-proofs /tmp/seven-preview
node tools/tests/wardrobe_sim.js
node tools/tests/wardrobe_game_sim.js
node tools/tests/publish_sim.js
node tools/measure_wardrobe_data.js
```

The focused audit verifies 38,278 exact layers, 5,215 independently rendered
compositions (maximum rounding difference 3/255), source/adapter fingerprints and
unchanged previous packed resources. The 616-file pack totals 13,970,152 bytes
(13.32 MiB); publishing budgets are 13.5 MiB for wardrobe and 38.5 MiB for the site.
The largest decoded atlas remains 4,137,984 bytes. Cache limits remain 16 MiB for
images and 1 MiB for serialized metadata. The cold default Novice male look uses
293,068 bytes in five requests; opening the wardrobe with it resident adds zero.
GPU and physical-device checks remain separate from native proofs and Canvas tests.

## Four requested pieces (v132)

Head now also offers **AFK Text Balloon** ([20052](https://www.divine-pride.net/database/item/20052), view 471, `afkBalloon`), **Dragon Helm** ([19667](https://www.divine-pride.net/database/item/19667), view 464, `dragonHelm`), and **Gold Dragonhelm** ([5451](https://www.divine-pride.net/database/item/5451), view 452, `goldDragonHelm`). Wings adds **Black Thunder** ([400149](https://www.divine-pride.net/database/item/400149), `blackThunder`) as requested. Its official item slot is Middle; wardrobe categorization does not change equipment or its native effect placement.

`requested-items-source-manifest.json` pins the original ACT/SPR sources for the heads and official supplement STR/TGA sources for Black Thunder. Recover these with:

```sh
python3 tools/native-wardrobe/fetch_sources.py /tmp/requested-native
python3 tools/native-wardrobe/fetch_accessory_sources.py /tmp/requested-native --manifest tools/native-wardrobe/requested-items-source-manifest.json
```

Use the existing pinned Go renderer/export/proof procedures, with the updated `export.go`, `accessory_export.go` and `accessory_proof.go`. Create a definitions JSON containing only the three requested head items; run both Go commands for every class job. Independent STR effects are deliberately skipped by those ACT/SPR commands. Generate Black Thunder separately:

```sh
python3 tools/native-wardrobe/build_black_thunder.py /tmp/requested-native /tmp/requested-pieces assets/wardrobe/v5/catalog.json
```

The STR renderer supports this pinned resource's rectangular source-alpha quads, original textures, per-frame delta keys, texture animation, rotation, opacity and native effect origin. Pillow bilinear texture rasterization is baked once at its native 60 FPS into a 90-frame loop; runtime only loads local packed PNG/JSON. This is an STR effect export, not recovered ACT/SPR animation. Its pixel comparisons prove lossless packing of that export; they do not claim identical output to the original client's GPU sampler. Native head composition proofs are independent Go renderer outputs.

Recover `baselineCommit` from the new manifest into a scratch directory. Append each item in order with `build_wardrobe_collection.py --append <previous-pack> --piece <key>`, always using an empty next output folder. Keys are `afkBalloon`, `dragonHelm`, `goldDragonHelm`, `blackThunder`. Copy only the final pack into `assets/wardrobe/v5/`.

Metadata `clock: "component"` lets the AFK balloon retain its eight-frame native idle while the body has three frames; stance/attack timing still follows the character. `clock: "independent"` keeps Black Thunder looping regardless of stance/attack progress. Hero, portrait and fitting redraw identities include these component frames. Reduced-motion fitting remains static. The fitting bounds include all idle frames to avoid animation-driven zoom changes or clipping.

```sh
python3 tools/tests/requested_wardrobe_assets.py /tmp/requested-native /tmp/requested-pieces /tmp/requested-proofs
node tools/tests/wardrobe_sim.js
node tools/tests/wardrobe_game_sim.js
node tools/tests/publish_sim.js
node tools/measure_wardrobe_data.js
```

At v132, the collection contained 45 pieces across 19 classes/both genders, with no combat changes. All 480 previous asset records and packed resource hashes are preserved. The v132 pack was about 12.18 MiB; its publishing budgets were 12.25 MiB for wardrobe and 37.25 MiB for the complete static site. Decoded images remain capped at 16 MiB and serialized metadata at 1 MiB. First selecting Black Thunder downloads about 806 KiB before HTTP compression; both genders share its packed image/metadata files. Real GPU/physical-device verification remains separate from canvas/browser controls and native proofs.

## Evil Scythe (v129)

W → Wings → Evil Scythe → Apply look. This is Costume: Evil Scythe, item
[20597](https://www.divine-pride.net/database/item/20597), garment view 79,
stable saved key `evilScythe`. All 19 classes, both genders, eight directions and
idle/walk/attack use the current class body; gear and progression are preserved.
No new full-body costume is approved.

The official-data archive's files named `c_evil_scythe` contain different artwork.
**Do not use them.** `evil-scythe-source-manifest.json` pins the public Divine Pride
DressupTree/DressupFrame responses containing the actual pixels and decoded animation
metadata. Original ACT binaries were not recovered. `prepare_evil_scythe.py` emits
explicitly derived ACT/SPR development adapters for the pinned native renderer;
these are not original binaries. Source PNG pixels, layer position, mirror, scale,
angle, attachment points and action delays are retained. Non-rendering binary fields
not exposed by the preview (sound events, fit ranges, etc.) are not claimed as
original metadata. The native renderer's garment ordering and unparented placement
are used without invented art or offsets. The endpoint uses RO sex IDs (1 male,
0 female), verified against explicit `female=false/true` item previews; its web UI's
reversed labels must not decide source gender.

The game serves only local packed files. It never calls Divine Pride. Four new
hashed files and a catalog entry extend v5; all 573 older packed files and existing
asset records are unchanged. The collection is 11,551,999 bytes; selecting Evil
Scythe first downloads 96,350 male / 130,933 female bytes before HTTP compression.
The decoded cache stays 16 MiB and the serialized metadata cache 1 MiB. Publishing
allows 11.25 MiB for the collection (the extra piece crossed the old 11 MiB ceiling).

### Rebuild Evil Scythe

Use Python 3.9+ with Pillow 11.3.0 and Go 1.24.2. Recover the normal pinned inputs
with `fetch_sources.py` first. Check out ragassets
`4de4fa747431979d35c747d7edd549a872efd9e1` as described below. Copy `export.go`
to `gateway/internal/render/engine/wardrobe_export.go`, `accessory_export.go`
to `gateway/cmd/wardrobe-accessories/main.go` and `accessory_proof.go` to
`gateway/cmd/wardrobe-accessory-proof/main.go`, then build those two Go commands.
Keep all development inputs and exports outside the game checkout.

```sh
python3 tools/native-wardrobe/fetch_sources.py /tmp/evil-native
python3 tools/native-wardrobe/prepare_evil_scythe.py /tmp/evil-native --cache /tmp/evil-preview
python3 - <<'PYDEFS'
import json
from pathlib import Path
items=json.loads(Path('tools/native-wardrobe/accessories.json').read_text())
Path('/tmp/evil-defs.json').write_text(json.dumps({'backwear':[i for i in items['backwear'] if i['key']=='evilScythe']}))
PYDEFS
for job in 0 2 9 4010 1 7 4008 6 12 4013 3 11 4012 4 8 4009 5 10 4011; do
  wardrobe-accessories /tmp/evil-native /tmp/evil-defs.json /tmp/evil-pieces/$job $job || exit
  wardrobe-accessory-proof /tmp/evil-native /tmp/evil-defs.json /tmp/evil-proofs/$job $job || exit
done
```

To append this item, recover the v128 pack from the manifest's `baselineCommit`
into `/tmp/evil-baseline` (`git archive <baseline-commit> assets/wardrobe/v5 | tar -x -C /tmp/evil-baseline`).
Use an empty output directory; the append command refuses an existing item.
The first source argument is unused when appending:

```sh
python3 tools/build_wardrobe_collection.py /tmp/unused /tmp/evil-pieces tools/native-wardrobe/accessories.json /tmp/evil-pack --append /tmp/evil-baseline/assets/wardrobe/v5 --piece evilScythe
python3 tools/tests/evil_scythe_assets.py /tmp/evil-pieces /tmp/evil-proofs /tmp/evil-preview /tmp/evil-native
node tools/tests/wardrobe_sim.js
NODE_PATH=<jsdom-three-prefix>/node_modules node tools/tests/wardrobe_game_sim.js
node tools/tests/publish_sim.js
node tools/measure_wardrobe_data.js
```

The focused native audit verifies 5,990 exact layer frames and 745 independent native
compositions (maximum translucent compositing rounding difference 3/255), original
source pixels and all previous packed file hashes. Desktop/390px browser tests use
the explicitly marked renderer stub; real WebGL and physical devices remain unverified.
Temporary `/tmp/evil-*` files are rebuild/test inputs and are unnecessary to play.

## Sources and build

`accessories.json` records the original view ID, stable save key and display name.
Pinned existing native files come from the earlier source manifests; new resources
come from the RO Translation Project's public official_data.grf supplement.
`accessory-source-manifest.json` pins decompressed file hashes, lengths and archive
ranges. `fetch_accessory_sources.py <native-root>` verifies cached files and restores
missing ones with ranged downloads. A changed upstream archive fails verification.
Art stays original; there is no painting, palette editing or manual attachment offset.

Build `accessory_export.go` as a separate gateway/cmd/wardrobe-accessories command
in the pinned renderer, with `export.go` installed as its engine extension. For every
one of the 19 class job IDs:

```sh
wardrobe-accessories <native-root> accessories.json <piece-exports>/<job> <job>
python3 tools/build_wardrobe_collection.py <existing-full-exports> <piece-exports> tools/native-wardrobe/accessories.json <empty-output>
```

The body atlas includes its native shadow. Hair stays shared across classes and
palettes. Each selected accessory loads its own shared atlas and attachment file;
unselected accessories are never fetched. First-use pieces download on demand,
resident pieces and None reuse cached assets. Decoded images remain bounded to
16 MiB, serialized attachment metadata to 1 MiB. Data is versioned at v5; v3/v4 are
excluded from publishing. Dynamic selections participate in request identity, so
pending or failed accessories cannot be applied and stale selections cannot win.

## Checks

Build `accessory_proof.go` separately as gateway/cmd/wardrobe-accessory-proof. It
renders each piece independently of the layer exporter, sampling front idle,
side walking and rear attack for every class/gender and every frame in those views.

```sh
wardrobe-accessory-proof <native-root> accessories.json <proofs>/<job> <job>
python3 tools/tests/wardrobe_accessories_assets.py <existing-full-exports> <piece-exports> <proofs>
node tools/tests/wardrobe_sim.js
NODE_PATH=<jsdom-three-prefix>/node_modules node tools/tests/wardrobe_game_sim.js
node tools/measure_wardrobe_data.js
```

The asset audit also compares every packed layer pixel, coordinate, depth and
animation frame against its native export across all eight directions and three
stances. UI tests use the explicitly marked renderer stub; real WebGL/physical
phone validation remains outstanding. Source findings and unsuccessful costume
candidates are documented in the task's research report.

## Previous collection (historical)

# Wardrobe collection (v4)

The live wardrobe uses the player's current class and offers numbered hairstyles
1–20, colors 1–9, four accessory slots (Head, Face, Mouth, Wings), and three
full costumes: Vanguard armour (Rune Knight alternate outfit), Arcane robes
(Warlock), and Shadow leathers (Guillotine Cross). Costumes replace appearance
including its fixed native weapon animation; class, gear and combat stats do not
change. All 19 playable classes and both genders are supported. Choosing Current
class outfit restores the class body while retaining hair and accessories.

Old version-1 appearances with halo/glasses/wings booleans migrate into named
slots. Those booleans remain mirrored for compatibility. Invalid choices fall back
to a known selection. Hair IDs remain native internally; only labels changed.

## Rebuild v4

Use the pinned renderer and toolchain documented below. Recover all five source
manifests with `python3 tools/native-wardrobe/fetch_sources.py <native-root>`.
Copy `main.go` to gateway/cmd/wardrobe-export/main.go and `export.go` to
 gateway/internal/render/engine/wardrobe_export.go. Build the exporter there.
For each job in `0 2 9 4010 1 7 4008 6 12 4013 3 11 4012 4 8 4009 5 10 4011 4054 4055 4059`:

```sh
wardrobe-export <native-root> <repo>/Updates/hair-color-preview/catalog.json <exports>/<job> full <job>
python3 tools/build_wardrobe_classes.py <exports> <empty-output>
```

`accessories` mode exports style 2/color 0 and base/accessory layers only; use it
only to augment an already complete export tree. The v4 build combines preserved
v3 hair exports with refreshed base/accessory exports and three complete costume
exports. The native bodies and every original hair palette remain unchanged.

Images use lossless PNG palettes; identical files are shared. Accessory metadata
has an optional `layers` table: poses reference exact layer records by index.
The loader validates and expands this before drawing. This eliminates repeated
attachment records without quantization, offsets or timing changes. The metadata
schema/catalog remain version 2; the new URL prevents old loaders seeing new data.
No cosmetic switch contacts an external provider. Decoded atlases remain bounded
to 16 MiB; the serialized metadata LRU remains 1 MiB.

## Verify v4

Copy `collection_proof.go` to a separate gateway/cmd/wardrobe-collection-proof/main.go,
then build and run it as `wardrobe-collection-proof <native-root> <proof-output>`.
It uses the renderer's complete composition independently of the layer exporter,
covering six selections in all directions/actions, both genders and all 22 bodies.

```sh
python3 tools/tests/wardrobe_classes_assets.py <proof-output> --collection
node tools/tests/wardrobe_sim.js
NODE_PATH=<jsdom-and-three-prefix>/node_modules node tools/tests/wardrobe_game_sim.js
node tools/measure_wardrobe_data.js
```

Real GPU/physical-device validation remains separate from native pixel proofs and
browser control checks performed with the marked renderer stub.

## Previous v3 implementation and measurements (historical)

# Complete native class wardrobe (v3)

The live catalog now covers all 19 classes, including **Novice** and
**Mage → Wizard → High Wizard**, alongside the five previously supported trees.
Open W to customize the current class; applying cosmetics does not change jobs or
gear. Wardrobe has hair/color selectors and accessory cards, with a fixed idle preview.
Class, facing and preview-action selectors are removed. Full outfit replacements are deferred. New characters and old saves use native sprites by default. Gender remains in
Settings; hair, color and halo/glasses/wings choices follow the character across classes.

Novice uses a dagger (male attack action 80, female 88). Mage uses a staff (80 for
both genders); Wizard and High Wizard use staff action 80 for male and 88 for female.
Staves have one native weapon component with no separate slash. Missing High Wizard
IMF files use the pinned renderer's own ordering fallback. No artwork is invented.
Equipped-weapon matching, additional costume outfits and unlock pricing remain deferred.

## Rebuild and verify the current pack

The asset URL is `assets/wardrobe/v3/`; the compact metadata format remains version 2
and saved appearance format remains version 1. Earlier v1 reference assets are retained
and excluded from publishing. The prior v2 catalog is available in Git history.

Use Python with Pillow 11.3.0 and Go 1.24.2, and the pinned ragassets commit below.
`fetch_sources.py <native-root>` now verifies the union of all four manifests (711 files),
including the Merchant/Acolyte inputs and `remaining-source-manifest.json`.
Copy `main.go` and `export.go` into the pinned renderer as described below and build
`wardrobe-export`. For every job in
`0 2 9 4010 1 7 4008 6 12 4013 3 11 4012 4 8 4009 5 10 4011`, run:

```sh
wardrobe-export <native-root> <repo>/Updates/hair-color-preview/catalog.json <exports>/<job> full <job>
python3 tools/build_wardrobe_classes.py <exports> <empty-output>
```

Review the packed output before replacing v3. Export `proof <job>` to a separate
`<proofs>/<job>` for native comparisons. The current validation command is:

```sh
python3 tools/tests/wardrobe_classes_assets.py <proofs> --proof-jobs 0 2 9 4010
node tools/tests/wardrobe_sim.js
node tools/tests/wardrobe_game_sim.js
```

The asset audit checks all 6,840 appearances; `--proof-jobs` explicitly limits native
pixel comparisons to those jobs. Omit it only when fixtures for all 19 jobs are present.
Existing 15-class exports for this update were recovered losslessly from the committed
v2 atlases, then repacked with the four new native exports. Their pixel bytes, positions,
layer order, figure heights and animation timing are compared against the original v2.
The lossless compact pack contains 444 files / 6,523,388 bytes (363 PNGs, 80 pose files and one catalog).
The largest decoded atlas is 2,193,408 bytes. The fixed 16 MiB decoded-atlas cache
and 7 MiB pack budget apply. Hashed attachment metadata has a separate LRU cache
bounded to 1 MiB of serialized input bytes (JavaScript object overhead is separate).

Verification: all 6,840 appearances pass structural/loader audits; 10,048 native
frames for the four added jobs match with zero channel difference. All 861,588
existing layer frames retain exact pixels, positions, ordering and timing. Fourteen
affected JavaScript suites pass. Desktop (1440×1000) and phone (390×844) UI runs
each cover 912 views; observed peak decoded atlas cache is 4,427,776 bytes.

## Data reduction and current UI

`wardrobe_png.py` maps every original RGBA tuple to an exact PNG palette entry,
including translucent colors and RGB under transparent pixels; it does not quantize
or repaint. `build_wardrobe_classes.py` uses it for future builds. For an existing pack:

```sh
python3 tools/optimize_wardrobe_pngs.py <original-pack> <empty-output>
python3 tools/tests/wardrobe_lossless_assets.py <original-pack> <optimized-pack>
node tools/measure_wardrobe_data.js <report.json>
```

All 363 decoded atlases match byte for byte. Compared with the first v3 pack,
this saves 5,426,409 bytes (45.4%). Normal native startup defers the legacy
`assets/sprite_pack_data.js` (5,819,715 bytes) and its class APNGs. They remain
published and load if the native renderer fails. While the Wardrobe adapter is
still parsing, native classes wait rather than requesting legacy art.

Raw selected-look responses measure 492,835–546,117 bytes, including the catalog;
HTTP compression, headers, browser/GPU allocations and unrelated game assets are
excluded. Opening Wardrobe or toggling accessories adds zero sprite requests when
the active look is resident. The measured color change uses one 2,268-byte PNG;
shared attachment metadata is reused. Appearance saves contain only 111 bytes of IDs.

The fitting preview zooms the original canvas using all accessory bounds so toggles
keep a stable, unclipped frame. This does not change battlefield art or scale. Gender
remains in Settings. Apply/Cancel/Reset operate on the current class, and old controls
cannot redirect the preview to another job.

Next release steps: verify real WebGL rendering and desktop/phone performance, then
publish the reviewed update. Equipped-weapon matching is the next cosmetic feature.
Shared-browser checks use the clearly marked renderer stub when WebGL is unavailable.

---

## Historical v2 implementation notes

# Native character trees and Wardrobe (v2)

The live native renderer now covers three full trees:

- Swordsman (`Swordman` in existing saves) → Knight → Lord Knight
- Thief → Assassin → Assassin Cross
- Archer → Hunter → Sniper

These class sprites load by default, including for old saves with `appearance:null`.
Wardrobe changes hairstyle, native hair color and the existing halo/glasses/wings costume
accessories. Gender is in Settings. Reset hair and costume restores the native default;
it does not opt back into the old renderer. Other trees retain their existing art.
Saved male/female hair choices and costume flags are shared between supported classes;
legacy numeric hair IDs, class progress, equipment and combat stats are preserved.

Equipped-weapon matching remains deferred. Each class has its fixed native family:
sword for the Swordsman tree, dagger for Thief, katar for Assassin/Assassin Cross,
and bow for the Archer tree. Native weapon-specific attack actions are 80, or 88 for
Assassin/Assassin Cross/Hunter/Sniper. Bows have no sword-slash source component.
This does not add costume outfits beyond the existing three accessory switches.

## Sharing and bounds

`assets/wardrobe/v2/` contains **404 files / 7,041,794 bytes** for 3,240 looks.
There are 18 body/weapon records, 360 shared hair/color records and two shared costume
records. Each hair or costume atlas holds pixels once for all nine classes; class attachment
and timing records reference those pixels. Repeated frames share pose records. The v1
reference pack is retained in Git but excluded from the publish tree.

The loader retains its 16 MiB decoded atlas budget; a class change reuses resident hair
and costume images and requests only its body/weapon image and metadata. Only small
appearance IDs are saved. Unchanged animation frames skip texture uploads. Stale requests
cannot overwrite a later class, including a return to an already cached class. Failed
class loads use the existing class renderer, and Wardrobe Retry retries both preview and hero.

## Rebuild the nine classes

Use Python 3.9+ with Pillow 11.3.0 and Go 1.24.2. Native source files stay outside the
published game. The two source manifests pin 576 inputs and public URLs; recovery validates
both existing files and new downloads. No client palettes or sprite pixels are invented.

1. `python3 tools/native-wardrobe/fetch_sources.py <native-root>`
2. Obtain ragassets commit `4de4fa747431979d35c747d7edd549a872efd9e1` from
   `https://github.com/adsonpleal/ragassets`. Copy `export.go` and `main.go` into the
   locations described in the historical v1 section below, then build its `wardrobe-export`.
3. For each job in `1 7 4008 6 12 4013 3 11 4012`, run:
   `wardrobe-export <native-root> <repo>/Updates/hair-color-preview/catalog.json <exports>/<job> full <job>`.
   Use `proof` instead of `full`, with a separate `<proofs>/<job>` destination, for the
   independently rendered costume-mask fixtures.
4. `python3 tools/build_wardrobe_classes.py <exports> <empty-output>`.
   Review the output before replacing `assets/wardrobe/v2/`. A subsequent published asset
   revision should use a new versioned path.
5. `python3 tools/tests/wardrobe_classes_assets.py <proofs>` checks all 3,240 look timelines,
   hashes, bounds and body/weapon presence. It also compares **22,768 frames** against the
   complete native renderer across both genders, eight directions, three stances and all
   eight costume masks: **zero channel difference** in this build.

`wardrobe_sim.js` tests actual assets, shared downloads, memory bounds, retries and class
request races. `wardrobe_game_sim.js` tests default sprites, legacy/current saves, class
changes, preview/apply/cancel, reset and combat clocks. `check_wardrobe_browser.js` runs
real controls, saves, class switching, 3,240 looks and combat simulation on the shared
browser. Its temporary renderer stub means these measurements cover CPU/canvas behavior;
real WebGL/GPU and physical phone performance still require device verification.

---

## Historical first fitting (v1)

The following documents the preserved first implementation. Its Lord-Knight-only scope
and opt-in behavior are superseded by v2 above; its source provenance remains applicable.

# Lord Knight layered Wardrobe (v1)

The owner authorized a first in-game Wardrobe fitting. Open **Wardrobe (W)** or Settings → Open Wardrobe. Select male/female, one of the frozen 20 styles per gender, nine native color entries, halo/glasses/wings, and preview idle/walk/attack in eight authored directions. Apply saves the choice; Cancel and closing discard drafts. “Use original class appearance” restores the existing rendering route.

The field renderer uses this appearance for **Lord Knight only**. Other classes retain their class art; the chosen Lord Knight look is retained when changing classes. This scope matches the approved first Lord Knight layer proof. Clothing replacements, other-class layered packs, unlock prices and new combat behavior are not implemented. No merge, push or deployment.

## Source versions and fidelity

`source-manifest.json` records all 468 original native input files: the earlier 463-file backup plus shadow ACT and male/female sword-slash SPR/ACT. SHA-256 and public URLs are included. The frozen hair catalog is unchanged.

The native sources come from `grf.robrowser.com` and `classicweb.niktoutro.com/chaosclient`, both referenced by roBrowser's demo configuration. They are different client versions from the LATAM service used by the earlier studio. This is **not a byte-identical replacement for those saved APNGs**:

- An exhaustive comparison covered all 360 looks / 21,600 corresponding frames. Many newer palettes differ; female head27 also has a small silhouette difference. The UI describes recovered client palette differences, and shows the actual result before Apply.
- A second head27 source did not improve the reference match. The initial native version is retained. Experimental palette matching/reconstruction is not part of these assets; no palettes were repainted or inferred.
- Native layer fidelity is tested separately: all eight accessory masks × both genders × eight directions × idle/walk/attack (2,560 frames, head2/palette0) match the complete native renderer **exactly**, including weapons, slash effects, shadows, sorting and attachment points.
- Original prototype sources, art and precomposed bundles remain intact.

Ragnarok Online / Gravity artwork retains its existing provenance. Upstream ragassets renderer code is MIT licensed; its license does not relicense game artwork.

## Runtime design and measured cost

`assets/wardrobe.js` supplies save normalization, a serialized/coalescing loader, SHA-256 validation, bounded response reads, metadata and image-dimension checks, atlas cache and native frame drawing. `assets/wardrobe-ui.js` adds the fitting panel and game adapter; `assets/wardrobe.css` scopes layout without changing other panels.

- `assets/wardrobe/v1/`: **618 files / 4,398,094 bytes** for 360 looks and 24 views each. Body, sword/slash, shadow and accessories are shared per gender. Head atlases are separate per style/color; byte-identical files are deduplicated. No multiplication by accessory combinations.
- Compare the earlier three-direction precomposed workshop: 68,674,485 bundle bytes. It remains excluded from publishing.
- Complete measured publish tree: **935 files / 26,703,393 bytes**, largest file 5,819,715 bytes. The build enforces <20,000 files and ≤25 MiB per file. Static requests retain `/api/*`-only Functions routing; no R2, D1 artwork, Function renderer or new endpoint.
- A selected look loads one catalog plus shared body and hair metadata/PNG. Accessory switches reuse those images. Source filenames are hashed under a versioned path. Failed switches keep the previous ready appearance; old saves use their existing art until Apply.
- The loader caps cached decoded atlas pixels at **16 MiB**, with at most six cached records after cleanup; largest atlas 2,271,232 RGBA bytes. Actual exhaustive browser peak was 4,034,560 cached pixel bytes. Figures exclude compressed responses, metadata, transient browser decode buffers, canvas/GPU allocations and general game memory.
- Hero texture uploads occur only when the pose/frame changes. Attack progress uses the existing `atkAnim` combat clock, plays once and clamps the final frame. Old held-weapon overlays do not run on the native route.
- A normalized saved appearance is approximately **110 bytes**, inside the existing account save. `S.hair` is retained verbatim; old numeric styles are never treated as native IDs. Male/female head/color preferences are independent. Existing owner/version protections and save cadence remain in place.

## Rebuild offline

Requires Python 3.9+ / Pillow 11.3.0 and Go ≥1.22 (verified Go1.24.2). Native inputs and the upstream renderer source are development inputs outside the publish tree.

1. Extract `wardrobe-native-inputs-v1.zip` into an empty source directory. It includes all 468 files, including shadow/slash inputs, plus the pinned renderer tooling. Run `python3 tooling/validate_native_subset.py` in that directory; verify files against `source-manifest.json`. The earlier 463-file backup remains preserved separately.
2. Extract the preserved ragassets source tarball at commit `4de4fa747431979d35c747d7edd549a872efd9e1` to a separate directory. Copy `export.go` to `gateway/internal/render/engine/wardrobe_export.go`, and `main.go` to `gateway/cmd/wardrobe-export/main.go`.
3. From its `gateway/` directory, run:

   ```sh
   go run ./cmd/wardrobe-export <native-root> <repo>/Updates/hair-color-preview/catalog.json <scratch-export>
   ```

4. From this repository, pack to an **empty destination** (move aside the old directory to avoid orphaned hashed files):

   ```sh
   python3 tools/build_wardrobe_atlases.py <scratch-export> <empty-atlas-output>
   ```

5. Compare/review generated output, then use it as `assets/wardrobe/v1/`. On a later published revision, increment the runtime asset version/path rather than silently repurposing a shipped catalog.

For native independent-switch proof, append `proof` to step 3 and run `python3 tools/tests/wardrobe_layers.py <proof-export>`. The exporter reuses native engine internals; it does not invent attachments, subtract composite screenshots, or use manual hand offsets. Missing required parts or clipped crops cause export failure.

## Verification

- `node tools/tests/wardrobe_sim.js`: all actual catalog files, normalization, hashes, bounds, limits, stale queue coalescing, failures/retry, accessory masking, single-swing clamp, disposal.
- `node tools/tests/wardrobe_game_sim.js` (jsdom26 and three0.128.0): real game saves/migration, preview/apply/cancel, gender memory, class fallback, owner reset, close/reopen and texture/frame behavior.
- `python3 tools/tests/wardrobe_assets.py <report.json>`: verifies every asset and compares all preserved LATAM frames, reporting the source-version differences above. This comparison intentionally reports differences; it does not assert LATAM equivalence.
- `python3 tools/tests/wardrobe_layers.py <proof-export>`: asserts exact recomposition against native engine outputs for 2,560 frames.
- `tools/check_wardrobe_browser.js`: real shared-browser loading of all 360 appearances plus selectors, actual local save, cancellation, failed-load preservation/retry, native game adapter and memory limits. The UI harness explicitly marks its temporary WebGLRenderer stub.
- Affected legacy save-owner, save-load, cloud, attack, class-skin, UI, panel, Eclipse, field-loop and publish suites passed. All suites remain mandatory before any future push.

**Remaining release checks:** the shared browser has no WebGL. Real 3D gameplay, GPU texture behavior, phone frame times and memory remain unverified. Screenshots show the actual game UI/native canvas with a temporary renderer stub, not a rendered battlefield. Test the fitting on a WebGL-capable desktop and phone before expanding classes or publishing. Exact LATAM palette/hairstyle parity remains separate source-recovery work; no such parity is claimed.

Shared-browser UI reproduction in this sandbox: start/register the documented preview server, open `http://localhost:8000/` with `coderabbit-agent-browser`, then run `node tools/native-wardrobe/browser_setup.cjs` if WebGL is unavailable. This marks and injects a renderer stub for UI testing only; the source game is unchanged. Run `coderabbit-agent-browser eval "$(cat tools/check_wardrobe_browser.js)"`. A normal later navigation restores the actual renderer. Do not use these UI results as GPU/gameplay performance measurements.

## Unified class wardrobe (v2)

The shared catalog covers 15 classes: the Swordsman, Thief, Archer, Acolyte and Merchant trees. Supported classes use native sprites by default. Wardrobe previews any supported class without changing jobs or equipment; saved hair and accessories follow the active class. Gender remains in Settings. Wardrobe sits immediately left of Settings.

All classes use the compact version 2 catalog: per-class body/weapon atlases, shared hair/costume pixels, and class-specific attachment routes. The six added classes use native mace art. Priest and Blacksmith families have one weapon layer, with no separate slash. All eight directions, three actions, 20 hairstyles and nine colors per gender are retained.

Rebuild with the pinned native renderer and the union of `source-manifest.json`, `class-source-manifest.json` and `tree-source-manifest.json`. Export each job into `<exports>/<job-id>` by appending the job ID to the exporter command (the older `full <job-id>` form also works). Run `python3 tools/build_wardrobe_classes.py <exports> <empty-output>`, then replace `assets/wardrobe/v2` with that output. Do not merge version 1 catalogs into this format. The loader regression exercises all 5,400 class/appearance combinations.

For independent native proof, export each job with `proof <job-id>` into `<proofs>/<job-id>`, then run `python3 tools/tests/wardrobe_classes_assets.py <proofs>`. The legacy `wardrobe_assets.py` and `wardrobe_layers.py` still audit preserved v1 art. The merged catalog was repacked by losslessly cropping the two branches' committed atlases; pixel bytes, layer positions, layer order and frame clocks are checked against those inputs separately from native-engine proof.

## Initial V5 measured delivery (historical)

The complete 574-file collection is 11,324,007 bytes (10.80 MiB), bounded by an
11 MiB publishing check. Expanding from nine to forty independently selectable
pieces increases the complete offline collection while lowering the default
appearance's download: Novice male is 284,321 bytes; all cold base looks range
277,426–332,248 bytes before HTTP compression. Individual accessories cost
35,387–272,993 bytes on first use. Resident selections and None add zero bytes.
The largest decoded atlas is 4,137,984 bytes, below the unchanged 4 MiB limit.
The packer tries deterministic shelf layouts at several widths to avoid wasted
space without changing any native pixels, placement or animation timing.

## Refine effects (v134)

The live hero supplies an optional `weaponEffect(ctx, image, layer, phase)` callback
as the eighth argument to `PGWardrobe.draw`. It runs before and after each native
`weapon` layer, preserving native layer order and source pixels. The game crops
those layers for refine edging/glints and a 120ms swing-tip trail, bounded to 32
cached crops per source image. Refined heroes repaint at up to 30 FPS for glints
and fading trails even when the native pose is unchanged. Native idle/walk art
keeps its stowed weapons. In v199, the ninth optional `stowedEffect` callback runs
before/after the body layer for frames without a native weapon, including attack
windups.
The game masks two lateral arm regions from the current body frame, adds a pulsing
edge and a faint additive overlay, and keeps hair/accessories and native source
assets unchanged. Arm crops have their own 32-frame-per-image bound. Weapon-bearing
frames use only the weapon effect, so the two effects do not overlap.
The live adapter repaints and resets trails when the pose or glow tier changes.

Owner glow tiers: below +7 none; +7–8 mint; +9 violet; +10–12 crimson; +13 lime;
+14 gold; +15 cyan. Unlisted ranks inherit the closest lower tier.
