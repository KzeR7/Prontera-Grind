# Saved outdoor map redesign — activation handoff (v196)

## Merge behavior

**The existing maps are the default.** The outdoor redesign is preserved as an
opt-in preview. Merging this patch does not select the new terrain for ordinary
players. `NATIVE_FIELDS_DEFAULT=false` in `index.html` controls that choice.
The small renderer module is included, but the field catalog, geometry and
textures are not requested until the preview is enabled. Assets still ship in
`dist/` so preview links work after a merge.

The reference monster artwork/proportion changes are separate and remain active:
70 available original atlases, original pixels/actions and calibrated relative
sizes. Missing IDs retain existing art. This switch parks maps only.

## Preview now

From the repository root:

```sh
bash tools/build_site.sh
python3 tools/preview_server.py 8000
```

- Existing maps: `http://localhost:8000/dist/`
- Saved outdoor fields: `http://localhost:8000/dist/?nativeFields=1`
- Explicit existing-map override: `http://localhost:8000/dist/?nativeFields=0`

For another host, add `?nativeFields=1` to its game URL (or
`&nativeFields=1` when a query already exists). Only the exact value `1` enables
preview with the current default. It lasts while that query is in the URL;
it is never written to a save, account or local storage. Open the plain URL to
return to existing maps. This is a visual preview switch, not an access control.
Both modes use the same player save; normal play still saves progression.

## What is saved

- `assets/native-fields.js`: ten distinct outdoor fields with continuous hills,
  valleys/dunes, smooth normals, soft winding paths and natural ponds. No town
  layouts or repeated stair flights. Large scenery stays outside combat bounds.
- `assets/native-fields/v1/`: selected native terrain/model textures and geometry,
  catalogs and monster atlases. Field sets load lazily with a two-set cache.
- `index.html`: opt-in gate, existing kit fallback, triangle-exact floor contact
  for actors/pets/loot/effects, camera and minimap integration; arena isolation.
- `tools/native-fields/`: generator, selection and pinned source/output hashes.
- `tools/tests/native_fields_sim.js`, `native_fields_assets.py`,
  `reference_mobs_sim.js`: geometry/lifecycle, provenance/pixels and sprite checks.
- `tools/check_native_fields_browser.cjs`: real WebGL default/preview checks,
  traversal, animation, contacts, missing delivery and return to default.

Read [the asset pipeline notes](../tools/native-fields/README.md) for all sources,
regeneration, size budgets and monster scale calibration. Prontera means the mob
field. These are composed hunting fields, not exact copies of source map layouts.
Niflheim uses graveyard assets (`gl_chyard`); Abyss uses Abyss Lake (`hu_fild05`)
because the named source dungeon packages were unavailable. Ascension maps and
special arenas keep their separate scenery. Original art ownership is unchanged.

## Enable later

1. Review all ten fields at desktop and portrait widths using the preview URL.
   Check hills, ground contact, scenery clearance, transitions and monster scale.
2. Set `NATIVE_FIELDS_DEFAULT=true` in `index.html` when ready for a general
   rollout. Leave the URL overrides available for comparison and rollback.
3. Bump `BUILD`, append `docs/UPDATE-LOG.md`, and synchronize the kit backup:
   `python3 tools/backup_map_kit_hd.py`.
4. Update activation expectations in the field simulation and browser harness
   (they currently require default-off), run the affected checks below, then
   follow [the full pre-push requirements](TESTING.md#before-pushing).
5. Rebuild and publish through the normal repository workflow. A local flag
   edit does not publish or deploy the site.

To roll back a later rollout, restore `NATIVE_FIELDS_DEFAULT=false`, bump `BUILD`,
refresh the kit backup, check, rebuild and publish. `?nativeFields=0` lets an
individual URL use existing maps even when the default is later enabled.
No save migration or asset deletion is needed.

## Verification

Use the prepared repository environment (Node 24, Python 3, Three r128; browser
harness additionally needs playwright-core and @sparticuz/chromium).

```sh
node tools/tests/native_fields_sim.js
node tools/tests/reference_mobs_sim.js
node tools/tests/kit_sim.js
node tools/tests/ascension_scene_sim.js
python3 tools/backup_map_kit_hd.py --check
bash tools/build_site.sh
node tools/tests/publish_sim.js
# With the preview server running:
CHROMIUM_BUNDLED_LIBS=1 NATIVE_QUICK=1 node tools/check_native_fields_browser.cjs http://localhost:8000/dist
```

The browser check asserts all ten ordinary maps use the existing kit without
field downloads, then explicitly previews the new fields, and finally removes
the query to verify the choice did not persist. Omit `NATIVE_QUICK=1` for all
50 stage/viewport scenes. Pixel/source audit commands and cache options are in
the pipeline README. Previous full v195 checks cover the preserved geometry and
pixels; physical-device frame rate has not been measured.

## Composition pass (v234) — merged, switched off

**Status: merged to `main` and deliberately disabled.** The owner asked to land the work
and keep the new maps aside for future edits. `NATIVE_FIELDS_DEFAULT=false` is unchanged, so
ordinary play still uses the existing kit maps; the native fields load only with
`?nativeFields=1`. The branch `arena/783b0e96-prontera-grind` is kept, and the merge was a real
merge commit rather than a squash, so any single step can be reverted on its own.

What the pass did, in one line each:

- `NATIVE_SCENE` replaced the random `NATIVE_THEME`/`NATIVE_THEME_BUDGET` pools with one
  hand-placed sketch per destination — `at` (hero group), `atx` (mirrored flank), and optional
  `ring`/`grid`/`fence`/`path`/`rows`/`bridge`/`shore`/`pier`/`field`.
- `PROP_H` plus `scaleFor()` give each of the 34 sprites a target world height (a person is 2.9),
  so houses are 10-12 units and the Geffen tower 18-20. The random scale multiplier is gone.
- A bridge is placed only where the map has water, across the pond's short axis. Seven maps
  have no water and no bridge.
- The camera sees roughly **thirty units ahead of the spawn point**; a set piece at `z<=-28` is
  off-screen on the first frame. Every map now carries a themed cluster inside that band, with
  the landmark kept at `z<=-30` as the payoff you walk into.
- The v233 bedding layer was restored after the recipe rewrite deleted it inside a `try/catch`;
  each bedding piece is now seated on the ground under its own footprint, and
  `THEME_MESH_CAP` is a hard ceiling again.

Review material: `Updates/map-textures-preview/board-11-composed-fields-from-spawn.png` (all ten
fields, first frame at stage 5) and `board-12-amatsu-approach-walk.png` (Amatsu at spawn,
mid-lane and at the shrine). Both are painted from the real atlas with each map's own palette
and winding trail, using a scratch software renderer — not WebGL. Server-side lighting, fog and
the 25 terrain tiles are not in them.

To resume:

1. Enable the preview (`?nativeFields=1`, see *Preview now* above) and walk all ten fields,
   including the boss band, which carries the least dressing by design (`SCENE_BAND`).
2. The open half of the owner's request is **new sprite art**: the atlas is still the same 34
   supplied pieces, and he dislikes the old art. Any addition must join
   `assets/kit/ro-spritesheet.json` without repainting existing pixels (AGENTS.md).
3. Then follow *Enable later* above — it is unchanged and still the activation path.
