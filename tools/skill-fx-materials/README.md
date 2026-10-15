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

The reviewed choreography/atlases remain in
`tools/skill-fx-proposals/afterglow-v7.html` and `afterglow-v8.html`. Owner selections
are in `owner-choices.json`; `owner-fx-old.js` / `owner-fx-new.js` refine selected
effects. `owner-fx-redo.js` contains the eight subsequently requested replacements:
warm electrical Jupitel Thunder, cached fractured stone for Heaven’s Drive,
larger Magic Crasher/Snare Trap/Quick Cut/Deathmark silhouettes and clearer shadow
attackers for Shadow Dash/Phantom Rush. The original undecided votes remain historical
in the owner report; the current runtime exposes their redo IDs separately.
Regenerate the mixed runtime with `python3 tools/build_afterglow.py`.
Do not edit reviewed sources to apply feedback: their source hashes pin the choices.
The mixed build omits unused legacy animations/helpers and comment-only lines to
retain the existing publishing size limit. `node tools/tests/owner_fx_sim.js`
compares resulting drawing operations with the exact selected source.
Current Grimtooth uses matte weathered chitin, wider surrounding rings and smaller
rear teeth. Storm Gust has a visible floor boundary. Local scale/readability
refinements affect Feint Slash, Marked Shot, Divine Barrage, Counter Attack and Land Mine;
Meteor Assault retains its selected V7 blades with a stronger ground contact. The adapter in `assets/skill-afterglow.js`
projects native battlefield anchors, applies single-target monster size, and keeps
area coverage independent of monster size. The effect count and mobile particle
limits still apply. Browser raster checks are needed in addition to operation tests;
these checks do not establish whole-game GPU or physical phone performance.

For the applied selections open
`/tools/skill-fx-proposals/applied-fx-review.html` through the static preview server.
The original V7/V8 choice editor is `skill-fx-compare.html`; `arcana-v8-review.html`
remains the historical V7/V8 comparison using the preserved V8 module.
