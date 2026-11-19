# DigiPet and fishing title artwork (v440)

The three original sheets supplied on 2026-11-19 are kept in
`supplied-2026-11-19/`, including every unused design. Sheet 1 (`image-8.png`)
supplies DigiPet artwork; sheets 2 and 3 (`image-9.png`, `image-10.png`) supply
fishing artwork. `source-map.json` records the original dimensions and SHA-256s,
the one-based source cell and exact crop box for each current title ID.

The current 36 DigiPet and 20 fishing titles each use a different transparent,
lossless WebP in `assets/social-title-icons/`. The DigiPet cutouts remove the
edge-connected dark sheet background while preserving the emblems, including their
own frames and original visible RGB pixels. The monochrome fishing marks have the
light paper matte removed, including the spaces inside their shapes; antialiased
edges are decontaminated to black rather than retaining a white fringe. A subtle
CSS outline keeps black marks readable over dark UI without a solid tile.

The generated whitelist `assets/social-title-art.js` only accepts known kind/ID
pairs. Its URLs use a `?v=440` cache key so clients do not keep older opaque
images; the whitelist itself retains bare paths for packaging. The full original
sheets remain in the repository, not the published game directory.

With Pillow installed:

```sh
python tools/build_social_title_art.py
python tools/build_social_title_art.py --check
node tools/tests/social_title_art_sim.js
node tools/tests/social_fishing_sim.js
node tools/tests/digimon_sanctuary_ui_sim.js
node tools/tests/social_scene_sim.js
node tools/tests/publish_sim.js
```

The generator validates sheet hashes and crop bounds, rejects reused source cells,
and `--check` regenerates the alpha masks and compares every visible RGBA pixel
and the registry with the expected outputs. DigiPet masks use the gold perimeter
and edge-connected background; review new crops visually because a different
sheet or emblem shape may need a different mask. To add a future title, preserve
the existing title IDs, add the unused source cell/box to the map, regenerate,
and extend the catalog/scene/publish tests. Do not publish the whole source sheets.

The title collections show the images contained in their cards. In the plaza,
all three title lines are unbacked. The separate mastery symbols keep their exact
source crops elsewhere; here a CSS luminance-to-alpha filter removes their black
matte, with a fine dark outline for contrast. This works inside the transformed
player label where screen blending alone leaves an opaque rectangle.

The plaza resolves known mastery, fishing and DigiPet names using the existing
look fields; unknown names remain plain text and never become image URLs. If the
art registry is absent, the collections keep their earlier painted/medal fallback
and plaza lines remain text. Existing unlocks, rarity colours, save fields,
network messages and Durable Object traffic are unchanged. Missing-image-file
errors do not have a separate fallback.
