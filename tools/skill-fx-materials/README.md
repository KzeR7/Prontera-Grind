# Skill effect materials

`tools/build_skill_materials.py` generates `assets/skill-materials.js` from deterministic
procedural textures and `runtime.js`. This pipeline creates effect artwork only;
native hero, monster, pet and skill icon sources are untouched.

## Generate and verify

Use Python 3 with Pillow 11.3.0 and numpy 2.0.2 in a virtual environment:

```sh
python3 -m venv /path/to/skill-fx-venv
/path/to/skill-fx-venv/bin/pip install Pillow==11.3.0 numpy==2.0.2
/path/to/skill-fx-venv/bin/python tools/build_skill_materials.py
/path/to/skill-fx-venv/bin/python tools/build_skill_materials.py --check
/path/to/skill-fx-venv/bin/python tools/tests/skill_materials.py
python3 tools/build_afterglow.py
node tools/tests/afterglow_sim.js
```

Commit source changes and regenerated outputs together. Optional `--contact-sheet`
writes an atlas image to a requested path. Check publishing size with
`node tools/tests/publish_sim.js`; the assembled site has a strict size budget.

## Runtime

The choreography adds material-specific contact responses at each skill’s existing
hit/assembly time, without changing damage or flight paths. Blade trails have a
colored body and a fine bright edge over their turbulent texture. Grimtooth reuses
three cached procedural tooth surfaces for 26 small teeth in two staggered rings;
mobile/dense settings reduce loose particles while retaining the complete maw.
The extra tooth surfaces are generated on demand in Canvas, not added to the atlas.


Eight 128px frames for each of flame, fireball, smoke, flare, brush, ice, meteor
and seal share one 1024px transparent WebP atlas. Textures are authored at 192px
and downsampled; transparent cell borders prevent sampling neighbors. The embedded
atlas avoids separate effect texture requests. Tint canvases are created on demand
and bounded to 96 entries. Pending or failed decoding uses vector fallback drawing.

Choreography and its interactive atlas live in
`tools/skill-fx-proposals/afterglow-v8.html`; regenerate with
`python3 tools/build_afterglow.py`. The adapter in `assets/skill-afterglow.js`
projects native battlefield anchors, applies single-target monster size, and keeps
area coverage independent of monster size. The effect count and mobile particle
limits still apply. Browser raster checks are needed in addition to operation tests;
these checks do not establish whole-game GPU or physical phone performance.

For native sprite comparisons open
`/tools/skill-fx-proposals/arcana-v8-review.html` through the static preview server.
