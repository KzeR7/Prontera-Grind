# Digimon Sanctuary sprite and floor packs

`assets/digimon/v2` contains the four approved starter lines: Agumon,
Gabumon, Patamon and Palmon, each through its three named later forms. For
all 16 species, idle, walking, attack and faint are packed from the source
`dannyphang/digimon-up-sprites` commit
`4eaee71cc949953e45ce5a77564469ba93e36907`. The older `v1` four-follower pack
is retained for already-cached clients. The upstream project describes the art
as Bandai Namco artwork shared for fan use; its statement is not a grant of
rights. Publication authorization is a separate decision.

To regenerate v2, check out the exact source revision and run:

```
python3 -m pip install Pillow
python3 tools/digimon/build_pack.py /path/to/digimon-up-sprites/baked
```

The packer crops only transparent margins, stores each source-frame SHA-256,
original offset and a common idle-figure anchor, and retains the RGBA pixels.
Blank source frames are retained. Each atlas is wide enough for its largest
frame. The renderer has one fixed viewpoint, not eight directions, and flips it
for horizontal movement. Companions use Patamon-referenced rookie height with a
modest stage-size increase. The UI and scene share an on-demand image cache.

The stone flooring is an AI-generated original texture, stored as
`tools/digimon/arena-stone-source.png`. Run
`python3 tools/digimon/build_arena_texture.py` to regenerate its optimized
`assets/digimon/sanctuary/arena-stone.webp` delivery copy. No online texture was
imported. The source image is a texture, not character sprite art.

The gym's shingle roof is an AI-generated texture, saved as
`tools/digimon/timber-roof-source.png`. Run
`bash tools/digimon/build_roof_texture.sh` with ImageMagick to reproduce
`assets/digimon/sanctuary/timber-roof.webp`. The boardwalk reuses the existing
`bridge_planks` crop from `assets/kit/ro-tiles-hd.png` at runtime.

The v334 walkway, gym sand and plaster are AI-generated original material
textures, saved as `walkway-wood-source.png`, `gym-sand-source.png` and
`gym-plaster-source.png` in this directory. Run
`bash tools/digimon/build_world_textures.sh` with ImageMagick to reproduce
`assets/digimon/sanctuary/{walkway-wood,gym-sand,gym-plaster}.webp`. The
script applies the intended brightness/contrast adjustments for the two floor
materials. These replace the v333 native-kit boardwalk; no sprites are altered.

The v335 gym and wooded backdrop also use CC0 third-party roof, timber and
door materials and a tree sprite. See `cc0-materials/README.md` for the source,
authors, actual resolution, license and reproducible extraction/copy commands.
NPCs use the game's existing native wardrobe sprites; the decorative meadow
companions use the already-approved Digimon Up atlas and are not live mobs.
