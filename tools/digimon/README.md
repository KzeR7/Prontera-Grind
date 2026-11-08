# Digimon Sanctuary sprite, index and floor packs

## Full profile and evolution index

`assets/digimon/index.json` is the metadata index of **251 Digimon profiles**,
including stage, attribute, type, profile links, and the source-listed `evolvesFrom`
and `evolvesTo` links. Its source revision and coverage notes are in the JSON.
The index itself remains data only; the separately generated `roster.js` controls
runtime selection. Of the 251 profiles, **248 have an exact local v3 animation
entry** and the other three have `image: null`.

The repository's pinned Digimon Up source has **280 animated entries**, including
32 variants; those entries are not 280 unique profiles. Eighteen variants inherit
a base profile and 14 animation-only entries have no profile, leaving 266
profiled animation entries in the runtime roster. The source itself notes gaps in
evolution data, and the index preserves links to missing/variant profiles as
unresolved references rather than guessing their identities.

Rebuild the index from the exact pinned Digimon Up checkout's `digimon.json`:

```
python3 tools/digimon/build_full_index.py /path/to/digimon-up-sprites/digimon.json
```

This generator copies profile metadata and reference URLs only. It does not
copy the source repository's animation art. Digimon names and profiles are
provided for reference; this is not a claim of affiliation or a complete
official franchise catalogue.

## Sprite and floor packs

`assets/digimon/v3` contains all **280 animation entries and 17,666 frames**:
one lossless WebP atlas and one JSON frame record per entry, plus one catalog
(561 files, 35.92 MiB total; the images alone are 33.50 MiB). Idle, walking,
attack and faint are packed from `dannyphang/digimon-up-sprites` commit
`4eaee71cc949953e45ce5a77564469ba93e36907`. The older `v1` four-follower pack
is retained for already-cached clients; the superseded 16-form v2 pack is not
shipped alongside v3. The upstream project describes the art as Bandai Namco
artwork shared for fan use; its statement is **not a grant of rights**.
Publication authorization is a separate decision.

To regenerate v3 and the shared roster, check out the exact source revision and
run (use a temporary tooling directory or install Sharp together with the other
project test dependencies so npm does not prune them):

```
npm install --no-save --package-lock=false sharp@0.35.2
node tools/digimon/build_pack.js /path/to/digimon-up-sprites
```

The packer verifies the source revision, entry/frame counts and profile
coverage. It crops only transparent margins, stores each source-frame SHA-256,
original offset and a common idle-figure anchor, and retains the RGBA pixels.
Blank source frames are retained. Each atlas is wide enough for its largest
frame. The renderer has one fixed viewpoint, not eight directions, and flips it
for horizontal movement. Each form is normalized from its own idle bounds;
stage metadata controls its world-presentation scale.

The UI and scene share a 32-entry LRU decoded-atlas cache. The catalog and small
shared roster load first, but a form's metadata and WebP are requested only when
that form is shown. Selection, followers, gym residents, spar partners and the
Social Worker all use the same 280-ID whitelist. Evolution offers only exact,
direct source-listed links to another bundled ID; it does not invent tagged,
fusion or missing-profile paths. The four original save keys and their preferred
original evolution paths remain compatible.

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
