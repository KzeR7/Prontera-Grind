# Native social assets

Original Ragnarok Online artwork belongs to Gravity. Existing pinned sources and
renderer provenance remain in `tools/native-wardrobe/README.md`. No artwork was
painted, recoloured, or inferred. Assets are served locally at runtime.

## Sitting

Recover all original wardrobe/fourth-job/accessory sources and the explicitly
identified garment preview adapters following the existing native wardrobe README.
Use the same ragassets commit `4de4fa747431979d35c747d7edd549a872efd9e1`, Go 1.24.2,
Python/Pillow and numpy. `export-sitting.py <ragassets-checkout>` installs separate
`social-export`, `social-accessories`, and `social-proof` commands, selecting native
ACT actions 16–23. It also makes the export extension respect the renderer's
`shouldDrawShadowFor`: seated bodies have no standing shadow.

Build those commands in the pinned gateway. Supply the existing HAIRS lists as
`{"hairs": ...}` and export all 25 class IDs from the two live wardrobe catalogs:

```sh
social-export <native> <hairs.json> <exports>/<job> full <job>
social-accessories <native> tools/native-wardrobe/accessories.json <pieces>/<job> <job>
social-proof <native> tools/native-wardrobe/accessories.json <proof>/<job> <job>
```

Generate Black Thunder with `python tools/social/build-effect.py <native> <pieces>
<all-classes.json>`, where the catalog combines the 25 class IDs. This reuses
`build_black_thunder.py` with sitting routes. The same original effect frames/timing are
retained. Then pack into an empty destination:

```sh
python tools/social/build-sitting.py <exports> <pieces> <empty-output>
python tools/tests/social_assets.py <exports> <pieces> <proof> --pack <empty-output>
```

`build-sitting.py` reuses the existing wardrobe packer and standing figure heights,
so sitting never enlarges the shorter pose. Catalog hashes cover every image and
metadata file. The audit checks every crop's original RGBA hash, positions, layer
order and delay, plus independent native compositions for three directions per
class/gender/accessory. The live normal wardrobe packs are unchanged.

## Emotions

`emotions-lock.json` pins the original ACT/SPR URLs and hashes. Recover those bytes
as `/tmp/emotion.act` and `/tmp/emotion.spr`. Install `emotions.go` as
`gateway/cmd/social-emotions/main.go` in the pinned renderer and run it. It exports
all 93 original action timelines into `/tmp/social-emotions` using the renderer's
native layer transforms. `python tools/social/pack-emotions.py /tmp/social-emotions`
creates APNGs and verifies decoded frames/timing against those exports. Identical
consecutive PNG frames may coalesce with the summed delay. Existing PNG encoding
is retained when decoded pixels and timing already agree, preserving the original
12 files byte-for-byte. The 32 shipped IDs in `emotion-map.json` are mapped
by inspecting the original animations, not substituting Unicode glyphs.

### PR #269: the 14 added emotions (art pending)

`emotion-map.json` now lists 46 ids: the original 32, then 14 more (`omg, oh, x, hlp, go, bzz, awsm,
pat, slur, grat, fsh, spin, dice, oops`) appended so no saved id moves index. Each new id maps to the
action that really holds it in `emotion.act/spr`; `tools/tests/emotion_map_sim.js` pins every number
against the `ET_*` enum and fails if one drifts.

That PR first proposed 45 ids at actions 86-130. The sprite has 93 actions (0-92), so 38 of those
numbers were past the end of the file, and the 7 that landed inside it were the wrong animations
(`omg` at 86 is `YUT6`; the real `/omg` is `HUK` at action 23). The other 13 (`clap, bye, happy,
amazed, best, best2, chaos, absurd, joy, kiskis, funny, martialarts, salute`) are Ragnarok Online II
emotes, not RO 1 - they have no frames in `emotion.spr` and were dropped.

**These 14 have no PNGs yet.** `emotions-lock.json` records them with a `null` sha256, which means
"registered, art not generated", and `social_sim.js` refuses any id that is neither hashed nor
declared pending.

There are two ways to supply the art. The first is the sprite route above: recover the bytes as
`/tmp/emotion.act` and `/tmp/emotion.spr`, run `emotions.go`, then:

```sh
python3 tools/social/pack-emotions.py /tmp/social-emotions   # packs only the actions that exist
python3 tools/social/emote-layout.py                         # prints the new EMOTE_LAYOUT
```

The second needs no renderer and no Go, only Pillow. Save the emote GIFs from
<https://irowiki.org/wiki/Emotes> into a folder, using their own file names (`Omg.gif`, `Sob.gif`,
`Emote_bawi.png`, ...), and run:

```sh
python3 tools/social/import-emote-gifs.py <folder-with-gifs>
python3 tools/social/emote-layout.py                       # prints the new EMOTE_LAYOUT
```

`import-emote-gifs.py` converts whichever files it finds into the same APNG shape the game already
loads: frames cropped to the union of the painted pixels across the animation (exactly what
`pack-emotions.py` does, so the tray maths is identical), original frame order, original delay,
loop forever, transparent. It writes `assets/social/emotions/<id>.png`, records the sha256 in
`emotions-lock.json` and leaves every id it did not find untouched - so the 32 cut from the sprite
sheet stay byte-for-byte as shipped. It never repaints, rescales or invents art.

`pack-emotions.py` skips and reports ids whose action is not in the sprite instead of crashing, and it
merges into the lock file so the 32 verified entries keep their hashes. Paste the layout line into
`assets/social-rules.js`. Until then the tray shows those 14 with a blank slot: the ids exist and are
sendable, but nothing is drawn.

## Town

`town-lock.json` pins the public Prontera manifest/model/paving bytes from RagnaGO.
Download those four entries into a source cache, then run:

```sh
python tools/social/build-town.py <cache>
```

The generator retains original model geometry and native texture regions, changing
only the atlas layout/UV coordinates. Every copied texture region is compared
byte-for-byte. Scene placements are our own fountain plaza layout. The seating model is the
original green slatted park bench at source chunk 430. Chunk 1293 is a hanging
noticeboard and must not be used as a chair. Paving samples
native atlas tiles; surrounding trees/shrubs reuse the existing pinned Prontera
field asset pack. Native town and sitting art has a separate 10 MiB delivery budget.

Raw binaries, recovered sources, renderer checkout and independent proof images
stay outside the game checkout. Only runtime outputs and reproduction/audit code
are included in this change.
