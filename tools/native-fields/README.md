# Outdoor combat fields and reference monsters (v195, parked in v196)

**Status: saved for later; existing maps remain the default.** Use
`?nativeFields=1` for an explicit preview. See the
[activation and rollback handoff](../../docs/NATIVE-FIELDS-HANDOFF.md) before
enabling the redesign for players. Monster artwork changes remain active separately.

The ten original World Atlas destinations are outdoor mob fields. Their encounters,
saves, stages and progression remain intact. `assets/native-fields.js` renders
smooth rolling heightfields, natural paths, native trees, shrubs, mushrooms,
stumps and rocks. It does not place town buildings, streets, stairs or garden
furniture. Each field has its own hill, ridge and hollow positions: meadow hills,
coastal grassland, wooded ridges, desert dunes, forest slopes, jungle hollows,
mountain foothills, wild meadows, dead woodland and a rocky lake basin.

A shared indexed terrain mesh has smooth vertex normals. `heightAt` interpolates
the exact rendered triangle, so the hero, monsters, pets, loot, effects and labels
follow slopes without hovering or sinking. Large scenery stays outside the combat
bounds; low native plants reach the margins. Props embed their roots into slopes.
A connected winding dirt trail has soft shoulders and samples the center of a
complete dirt tile. Source materials use large mirrored repeats to join their edges without visible
square seams. Natural ponds form where the
sloping bank intersects the water surface; there are no rectangular pool rims.

## Sources

`selection.json` uses stable local destination names and an optional `sourceMap`
for the actual public field package. Prontera and Izlude use `prt_fild08` vegetation
and grass/dirt; Geffen uses `gef_fild00`, Morocc `moc_fild01`, Payon `pay_fild01`,
Comodo `cmd_fild01`, Louyang `lou_fild01`, and Amatsu `ama_fild01`. These are
composed hunting fields, not copies of the original package's complete layout.
Public Niflheim and Abyss dungeon packages were unavailable: Niflheim retains
native `gl_chyard` dead trees/rocks and Abyss uses `hu_fild05` (Abyss Lake).
Both Ascension maps keep their separate renderer.

Model chunks and 256px terrain crops (16px atlas padding, 288px stride) retain
source pixels and geometry. Selected model texture regions are repacked at their
original resolution with equivalent UVs. The generator rejects changes to existing
pinned source bytes; newly selected public sources are added to the lock. Caches
are outside the checkout. Town assets from earlier iterations no longer appear
in the current runtime model selections.

`source-lock.json` pins URLs, downloaded bytes, SHA-256 hashes, selected package
versions and generated files. Original Ragnarok artwork belongs to Gravity;
RagnaGO's package delivery does not transfer ownership of the artwork.

`assets/reference-mobs.js` loads 70 original monster atlases on demand. Decoded RGBA pixels, frame rectangles/offsets, all available directions and action
delays are preserved. Atlases use exact lossless WebP when smaller than PNG.
No art is painted, recoloured or replaced. Attack playback fits the source frame
sequence to the existing combat swing; idle/walk retain their authored delays.
Idle-only sources retain their authored idle action when another action is absent.
The unavailable source IDs are listed in the lock; those monsters retain the
existing Divine Pride/native APNG art and scales. Display aliases remain intact.

Scale uses the actual `/maps/novice.json` idle figure (91px high) against this
game's 2.16-unit native hero (`SKIN_H = 72 × PACK_K`, `PACK_K = .03`), preserving native inter-species proportions independently
of combat size classes. The full-frame offsets retain flight/hover placement.
The live sprite uses a cropped CanvasTexture billboard, so 3D scenery depth-tests
against it. Catalogs are shared; decoded atlas caches are limited to eight monster
species and two field sets. Each visible creature owns its canvas. Terrain,
model geometry, materials and GPU textures are disposed when leaving a field.
Failed loads keep the existing scenery/sprite path and can retry on travel.

## Reproduce and audit

Python with Pillow 12.1.1 and numpy 2.4.2 was used in this task (Python 3.14).
The generator checks locked source bytes before accepting or regenerating assets:

```sh
python tools/native-fields/build.py --cache /path/to/map-cache --mob-cache /path/to/mob-cache
python tools/tests/native_fields_assets.py
node tools/tests/native_fields_sim.js
node tools/tests/reference_mobs_sim.js
```

The caches are outside the checkout. The generator downloads only missing selected
public files; it does not call prepare endpoints, log in, or copy application code.
Recovered assets use local runtime URLs; unavailable monsters retain their existing fallback URLs. These assets ship through the existing `assets/`
copy in `tools/build_site.sh`; raw map packages and development contact sheets are
excluded from publishing.

## Delivery budgets

Publishing retains the original 62.5 MiB limit for existing runtime assets and
adds a separate 68 MiB ceiling for ten field sets and seventy lossless monster
atlases (130.5 MiB combined). The publish test verifies every new output against
the source lock and rejects extra files. Model atlases include only the selected
texture regions. Maps and monster images load on demand; these delivery totals
are not the initial download or decoded-memory size.
