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
