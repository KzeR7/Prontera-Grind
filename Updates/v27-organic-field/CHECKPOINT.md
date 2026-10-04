# v27 `organic-field` — work-in-progress handover

**Status: NOT finished, NOT to be merged as "done".** This file is the instruction sheet for
whoever picks the work up (the same agent after a workspace reset, or another agent). The owner
asked for a backup mid-way; this is that backup.

The game on this branch already carries the new layouts, so it is playable — but the per-map art
pass, the `kit_sim.js` rewrite and the final log entry are still owed.

## What the owner asked for (their words, summarised)

1. Prontera barely changed: the buildings are still the old block-built town, and the floor does
   not match the city theme — it should be **bricks & green field**.
2. Izlude's green floor has **symmetric green patches** — looks fake; randomise it.
3. Geffen's trees are **vertically symmetrical**; randomise, and spread the design over the whole
   map — it feels like a box with everything in the centre.
4. Morocc is OK — but add more trees/stuff **far out**, not just centre.
5. Payon: same as Izlude (symmetry).
6. Comodo: same as Izlude; the floor is **repeats of boxes**, not natural.
7. Louyang: same as Izlude.
8. Amatsu: same as Izlude, needs more randomness.
9. Niflheim: same as Izlude.
10. Abyss: needs more randomness and to be **stretched further out**.

## Root causes found (so nobody re-diagnoses them)

* Ground "variation" was `(i*7 + j*13) % 9 === 0` — a **diagonal lattice** of single cells. On a
  repeating tile it reads as printed wallpaper: that is the "symmetric green patches" and the
  "repeats of boxes".
* Scenery was two mirrored tree lines (`for(const s of[-1,1])`) hugging the lane, plus a scatter
  band `|x|` 6.5–16 — hence "vertically symmetrical" and "everything in the centre / a box".
* The dressed field was a **hard rectangle** (`-26..26 × -23..11`) with the base tile visible
  beyond it — a box inside a plane.
* Prontera's buildings are the procedural `bld()` / town meshes built from THREE boxes in
  `index.html` (search `function bld(x,z,w,d,h`) — **not** kit art. The owner is describing those.
* The kit's own atlas does carry `house_prontera` (a painted cottage), so the fix is to retire the
  block town to fallback-only and dress the field with the kit's cottages instead (partly done).

## What is already done on this branch

* `index.html` — the kit section was rebuilt (search `// ----- organic layout` and the `KIT_MAP`
  block):
  * `kitHash/kitNoise/kitFbm` — seeded value noise (pure functions of a recipe seed).
  * `KIT_FIELD=[-30,30,-30,14]` — the dressed field, with `KIT_FAR=90` painted ground beyond it.
  * `kitEdge()` — **ragged wild edge**: rock probability rises towards and past the border, noise
    shaped, so the world never ends in a straight line.
  * `fieldPlan()` — one builder for every map, including Payon (the old `payonPlan`/`PAY` constants
    are gone). Organic `patch` ground, `groves` (clumps strewn over an `|x|` band), `scatter`
    (with rejection-sampling retries so the density really lands), `outcrops` (rock blobs off-lane
    with a prop on them), `bands` (jittered terrace edges), `plaza` (Prontera's brick square),
    `far` (a ring of scenery past the field border — **data not yet added per map**).
  * `farDress()` — Morocc keeps the attached design cell-for-cell and now gets sand mottling,
    outcrops and props all round it.
  * `kitPlan()` — dispatches recipes; Morocc's attached design is routed back through `farDress`.
  * Prontera, Izlude, Geffen, Comodo, Louyang, Amatsu, Niflheim, Abyss recipes are rewritten
    (clumps + far dressing + no mirrored lines); Payon keeps its mud road, creek, plank bridge,
    bamboo and mossy boulders, now with clumps instead of tree lines.
* `tools/preview/` — new dev tool (nothing shipped to the player):
  * `node tools/preview/dump_plans.js /tmp/plans.json` — runs the real `kitPlan()` in a VM and dumps
    all ten plans.
  * `/tmp/venv/bin/python tools/preview/render_plans.py /tmp/plans.json /tmp/out --px=1400
    --box=-33,-32,33,18` — paints them top-down (crops only) so layouts can be judged without a
    browser. Options: `--box x0,z0,x1,z1`, `--px`, `--lane`.

## What is still owed (the definition of done)

1. **Owner feedback pass** on the live preview — walk all ten maps and tune the recipes
   (density, clump sizes, palettes, landmarks, water, `plaza` shape).
2. **`far` ring data per map** — the builder supports it; no recipe uses it yet. Add a far ring to
   every recipe (`{type,count,r0,r1,z0,z1,s0,s1,gap}`) so the fog is full of scenery.
3. **Rewrite `tools/tests/kit_sim.js`** — it currently **throws on load**: its harness still binds
   `PAY` (`this.__k={...,PAY,...}`) and the `payonPlan` it pinned is gone. Rewrite its pins around
   v27: the noise helpers (`kitFbm` determinism / range), `KIT_FIELD`, `kitEdge` raggedness (not a
   rectangle), organic patch coverage, groves spread over `|x|` bands (no mirrored lines), the
   scatter retry, outcrops off-lane, `bands` jitter, the plaza, `farDress`, and a **no-symmetry**
   check (left/right prop counts must not mirror within a tolerance; patch pattern must not repeat
   on a small period). Keep the existing identity/scale/lane/determinism pins.
4. **Re-run all 13 suites** (`AGENTS.md` → *Verify before you push*). 12 of 13 were green at this
   checkpoint; kit alone is the one to fix. Also re-run the inline `node --check` extraction.
5. **Bump `BUILD`** from `kit-v27 organic-field wip` to the finished tag, and **append a final
   `AGENTS.md` entry** (the checkpoint entry above it stays; never rewrite an old entry).
6. **Push and open/undraft the PR** for the owner's merge.

## Rules that must not break (from `AGENTS.md`)

* Crop only — never draw, trace, recolour or substitute art. The kit's pixels are the kit's.
* Nothing solid in the running lane (`|x| < BX_`), no ground band written into it; the builder's
  `kitPut()`/`blocked()` guards are the enforcement — keep them.
* Plans must be **deterministic** per seed (`scene_sim.js` pins repeatability; `kit_sim.js` pins
  `JSON.stringify(plan(m))` equality between builds).
* Every prop a recipe places needs a `KIT_PS` factor, and `KIT_PS` must stay identical to the
  manifest's `suggest.KIT_PS` (a test compares them entry for entry).
* Prop scale: `KIT_PK = 2.9/80`, height = crop px × `KIT_PK` × factor. Big trees 3–4× the hero.
* The workspace can reset mid-session: commit early, and re-check `git log` after resets.
  **Do not run `UPDATE-BOOTSTRAP.py`** — it is a stale v7 one-shot that would overwrite the game.

## How to look at the work

```sh
# plans -> top-down previews (needs pillow: python3 -m venv /tmp/venv && pip install pillow)
node tools/preview/dump_plans.js /tmp/plans.json
/tmp/venv/bin/python tools/preview/render_plans.py /tmp/plans.json /tmp/out --px=1400 --box=-33,-32,33,18

# the game itself
python3 -m http.server 8000 --bind 0.0.0.0     # then open the preview panel, log in GM / gm1234
```
