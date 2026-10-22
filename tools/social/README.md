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
12 original action timelines into `/tmp/social-emotions` using the renderer's
native layer transforms. `python tools/social/pack-emotions.py /tmp/social-emotions`
creates APNGs and verifies decoded frames/timing against those exports. Identical
consecutive PNG frames may coalesce with the summed delay. The 12 IDs are mapped
by inspecting the original animations, not substituting Unicode glyphs.

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
