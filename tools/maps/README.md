# Detailed endgame scenery proposal — revision 3

**Astral is one continuous floating bridge through space, leading to a boss at
its far end.** Four stage selections are zones along that same route, not four
separate rooms. Thor's three ordinary groups use organic volcanic fields; its
approved circular boss scene is preserved.

## Open the complete review

```sh
PREVIEW_PAGE=tools/map_scene_review.html python3 tools/preview_server.py 8000
```

- Root: complete comparison board, whole-route hero capture, eight local views,
  direct 3D links and full written proposal.
- `/tools/map_scene_preview.html?map=astral`: complete bridge overview with labels.
- **Follow bridge → boss**: explicit 28-second camera tour, not player movement.
- Stage buttons: inspect local zones of the same bridge, or Thor's field groups.
- `/tools/map_scene_preview.html?map=thor&stage=10`: approved Thor boss scene.
- `/tools/map_proposal.html`: historical concept-art viewer; `/game`: unchanged game.

Read `docs/map-concepts/FULL-PROPOSAL.md` for intended encounters, native-monster
status, progression, material economy and remaining gameplay work.

## Geometry and clearance

| Stages | Astral / one route | Thor / shared field groups |
|---|---|---|
| 1–3 | Arrival Span, focus z −8 | Outer Fissure |
| 4–6 | Ruined Crossing, focus z −74 | Magma Gallery |
| 7–9 | Celestial Approach, focus z −140 | Core Approach |
| 10 | Bridge-End Sanctuary, focus z −208 | Primal Core / approved circular boss |

Astral builds identical complete geometry for every selection. A polygon deck runs
from z +24 to −245, generally about 30 units wide, flaring into an attached pointed
sanctuary beyond −177. The thin extruded support is not a set of boxed platforms.
The circle at the terminus is flat ornamental inlay, not the floor footprint.

Thor's ordinary floors are irregular ShapeGeometry terrain; masonry tiling,
rectangular plinths and straight fighting-box curbs are absent. Pools are visible
above the peripheral field surface. The approved boss retains its radius-27 disc,
plinth, lake, crown, rear caldera, materials, lighting and camera framing. A pinned
mesh/instance/material-colour fingerprint guards preservation.

Selected diagnostic clear zones use x ±13, z focus ±20 for Astral; Thor retains
x ±13, z −28…+12. Tests check transformed obstacles, polygon containment and the
continuous center path. Underfloor geometry must stay below zero, including
instanced supports. This metadata does not change current gameplay bounds.

## Materials, camera and lifecycle

Original environment artwork: `textures/weathered-stone.png`, `molten-basalt.png`
and `astral-void.png`. Native sprite pixels are untouched. Damaged ground uses
2048² canvas surfaces, with shared Astral paving along the route. The backdrop
provides stars, subtle nebula and a crescent world; stone/lava use procedural
fallbacks if loading fails and the viewer announces missing materials.

Overview framing fits the entire route on desktop and portrait screens. Its near
clip is adjusted to avoid distant thin-deck/support depth fighting. Local views,
manual camera controls and the translated bounds guide remain available. The
separately labelled Game camera preserves current projection/elevation/distance
settings; it is not a playable release.

Current maxima: 536 instanced pieces, 12 instanced batches and approximately
12,695 estimated scenery triangles. Actual draw calls include unique geometry,
atmosphere and shadow passes; these budgets do not establish device frame rates.

Resources are disposed on switching. Atmosphere stays at 96 points. Reduced motion
is respected, static inspection renders only when dirty, hidden tabs pause updates,
and context loss stops rendering with a reload notice. All resources are local.

## Sources, captures and verification

- `endgame-scenes.js`: shared route, natural fields, materials and metadata.
- `tools/map_scene_preview.html`: renderer, route controls and inspection camera.
- `tools/map_scene_review.html`: comparison board and full-proposal dialog.
- `build_review_manifest.js`: promotes nine actual desktop captures and records
  scene/viewer/material/image hashes; no automatic production updates.

```sh
npm install --no-save --package-lock=false jsdom three@0.128.0 playwright-core @sparticuz/chromium
CHROMIUM_BUNDLED_LIBS=1 node tools/check_endgame_scenery_browser.js http://127.0.0.1:8000
node tools/maps/build_review_manifest.js
node tools/tests/endgame_scenery_sim.js
node tools/tests/map_scene_review_sim.js
node tools/tests/map_proposal_sim.js
node tools/tests/publish_sim.js
```

Browser captures/report go to ignored `tools/preview/endgame-captures/`. Only the
nine desktop deliverable captures are promoted to `docs/map-concepts/scenery-review/`.
Optional positional paths select another capture directory. `CHROMIUM_BUNDLED_LIBS`
unpacks NSS on minimal Linux; `CHROME_PATH` can choose an installed Chromium.

Actual browser checks use Chromium WebGL 2 / ANGLE SwiftShader, not a renderer
stub: eight local views, whole-route desktop/phone, phone boss views, tour
start/progress/stop, controls, repeated switching, one canvas, no phone overflow,
board/dialog/deep links/reload/context loss. CPU checks additionally cover all
20 stages, shared full-route identity, deterministic geometry, clearance, floor
containment, preservation fingerprint, full camera-tour completion, lifecycle,
material success/failure and static rendering.

Software WebGL does not prove physical-device performance, native sprite contrast,
dense skill readability or completed combat. Authorised ACT/SPR sources are still
missing; no substitute creatures are used.

## Vendored Three.js and production boundary

`vendor/three-r128.min.js` is the unmodified `three@0.128.0` npm `build/three.min.js`,
MIT license in `vendor/THREE-LICENSE.txt`; SHA-256
`9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2`.
The studio, generator, source PNGs, proposal and captures remain excluded. Since
v146 the publish adapter selectively includes scene/runtime modules, lossless WebP
materials and the renderer/license for the in-game scenery explorer. Farming map
IDs, save schema and balance remain unchanged; live combat is not integrated.

## Journey build 4 — separate working traversal prototype

Open `/tools/map_journey.html`. The comparison board links it prominently; the
workshop preview on port 8000 uses this as its entry page. The separate game
preview on port 8788 opens the actual World Atlas UI. To launch the workshop directly:

```sh
PREVIEW_PAGE=tools/map_journey.html python3 tools/preview_server.py 8000
```

- `journey-state.js`: ten precise route waypoints, constant-speed capped-delta
  travel, pause/reversal/redirection, intermediate arrival events and deterministic
  encounter-placement plans. No saves, combat, drops or progression gates.
- `journey-hero.js`: reuses unmodified `assets/wardrobe.js` and the existing audited
  native Lord Knight body/hair. Original frames, native anchor, scale derived from
  measured figure height, real idle/walk actions/directions and native delays.
  Loading failures block travel; explicit retry and late-disposal handling.
- `journey-details.js`: independent Astral overlay, 566 pieces / 12,616 triangles
  in 24 batches/unique meshes. Fine seams, engravings, compass markings, chips,
  small fixtures, brackets, chain links, torn pennants and radial terminal inlay.
  Added solids stay outside the entire x±13 travel corridor; inlays are flat.
  Original local stone grain and correct linear colour handling keep new detail
  separate from approved base scenery. All resources are disposed explicitly.
- `mob-catalog.json`: twelve **missing-native-source** identity records, not art.
  Journey rosters and optional labelled spawn markers expose the gap, not fake mobs.
- `tools/map_journey.html`: native walking with camera follow, arrival-only stage
  updates, no Astral scene rebuild, detail/motion/closer-view/overview controls,
  pending mob roster, retained position on map return and context-loss handling.

The baseline `endgame-scenes.js`, approved Thor scenery and native source assets
are unchanged by this pass. Total Astral base plus overlay is approximately 25,311
estimated triangles before native sprites/atmosphere and shadow passes. No physical
GPU frame-rate claim follows from those numbers.

```sh
node tools/tests/map_journey_sim.js
CHROMIUM_BUNDLED_LIBS=1 node tools/check_map_journey_browser.js http://127.0.0.1:8000 --publish
```

The browser checker promotes four actual journey captures and a source/native
catalog checksum manifest to `docs/map-concepts/journey-review/` only after checks
pass. Phone screenshots and intermediate captures stay ignored. The published
manifest is also checked by `map_scene_review_sim.js`. CPU checks cover all travel
waypoints, pause/reversal/redirection, all twenty encounter layouts, source-pending
catalog integrity, detail clearance/disposal, and the real native loader metadata,
anchors, failure/retry and late disposal. Real browser checks cover visible native
frames, movement/camera/arrival without scene rebuild, pause/return/reversal,
markers, phone framing, native failure/retry and actual context loss.

Chromium can report `net::ERR_ABORTED` after a streamed native file's bytes have
already been completely consumed. The browser checker records these separately
as `transportCompletionNotices` **only** for exact files whose lengths and SHA-256
values were verified by the unchanged native loader before it reported ready.
Any other failed request fails the check. Console errors/warnings are not waived.

Animated mob art and live combat remain blocked/unimplemented. This prototype does
not read the account's character or appearance, write saves, award rewards, or
enter production publishing. It uses a fixed native demonstration character.

## Quick-transition follow-up

Quick transitions are now enabled by default: duration is based on remaining route
distance, with a 0.8-second minimum for short motion and a 3.5-second target maximum
for long trips. Normal walking retains 6.5 units/second. Toggling quick mode or
retargeting replans from the current position; pause state is preserved on a mode
change. Native animation delays, combat stats and production code are untouched.

Normal walking caps each update at 0.1 seconds; quick transitions consume visible
wall-clock deltas capped at 0.5 seconds. The page uses the latter clock for camera
follow as well, so slow rendering does not multiply travel time by a combat-clock
cap. Visibility changes reset the frame baseline, avoiding background jumps.
Software-WebGL Stage 1→7 arrival measured 5.249s, plus camera settling to 6.156s;
3.5s is a transition target, not a physical-device latency guarantee.

`Travel.encounterStage` is null throughout motion, including paused motion. The
workshop clears active layout slots/markers on departure and prepares only the
destination on arrival. Intermediate waypoint arrivals do not activate layouts.
These are placement lifecycle rules, not simulated combat/reward handling. Live
integration must clear old attacks/enemies without awarding despawn rewards and
spawn a fresh destination wave; see the full proposal for cooldown/boss rules.

CPU checks cover all 100 stage-pair quick trips, duration/continuity, source and
intermediate encounter suppression, pause/mode changes and bounded visible stalls.
Browser checks exercise Stage 1→7 acceleration, normal mode and same-stage return
layout restoration, in addition to the previous journey checks. The actual
captures/source manifest have been refreshed. Source alternatives and the remaining
native-art/network blocker are recorded in `docs/map-concepts/MOB-ART-PLAN.md`.

## Completed non-mob preview polish

`journey-navigation.js` validates preview URL state and keyboard routes. It does
not touch saves, local storage, class state or unlock progression. The workshop
adds compact on-map controls (including phone use), clickable overview checkpoints,
arrival/pause announcements and direct map/stage/view links. The Astral sanctuary
pulls back on arrival to frame the terminal artwork; closer inspection is optional.
Selecting the currently selected destination no longer rebuilds its scene.

Environment images fall back after 12 seconds; the catalog request, including its
JSON body, has an 8-second abort bound. Material failures expose a reload action;
invalid/unavailable catalogs remain visibly pending without blocking the scene.
Native hero failure still blocks travel and offers explicit retry. Disabling the
quality toggle disables shadows and caps rendering at one pixel per CSS pixel.

Published captures now include walking, overview, Astral boss and Thor boss.
Browser checks cover clickable checkpoints, on-screen 390px phone controls,
keyboard handling, direct Astral/Thor stage links, material/catalog failure,
character retry and context loss. CPU tests cover URL validation and shortcut
focus/modifier safety in addition to the earlier movement/geometry/native tests.
Static software-rendered captures do not establish physical-device frame rate.

The owner explicitly allowed mobs to be deferred. Another five reachable GitHub
tree checks found no matching original sprite paths; factual results are in
`docs/map-concepts/mob-source-checks.json`. There are still zero installed native
mobs. Production combat, gates, rewards, saves and balance remain outside this
non-mob preview completion pass; do not report them as complete.

## Environment delivery size / cloud audit

The walking workshop uses `journey-materials.js` and
`textures/runtime-manifest.json`: destination-only, content-hashed **lossless WebP**
copies. Astral opens stone + space (2,289,304 B), Thor stone + lava (2,817,162 B),
rather than preloading all three PNG masters (6,523,346 B). Shared promises/images
prevent stage changes or revisiting destinations from fetching them again in the
same page. Destination controls are disabled while the new material loads; failure
uses the existing explicit procedural fallback/reload, including invalid manifests.
The 12s image and 8s JSON bounds remain. No raw-master download fallback is used.

`python3 tools/maps/build_runtime_textures.py` requires Pillow/WebP. It preserves
PNG masters and verifies exact decoded pixels before writing delivery copies and
hash/size/pixel provenance. The reference scenery studio still uses original PNGs.
CPU checks: `node tools/tests/map_delivery_sim.js`. The journey browser check also
verifies destination-only HTTP sizes/cache reuse, pending-switch controls, broken
images/manifest fallback and exact Chromium-decoded pixel equality for all three
materials. Its manifest pins runtime code, manifest and generated WebP bytes.

See [Cloud data and delivery size](../../docs/CLOUD-DATA.md) for the production
before/after audit and storage/download/API distinctions. Both preview assets and
master/reference/review files remain excluded from production; future integration
must select only runtime copies. Compression does not reduce decoded GPU memory.

## In-game World Atlas integration (v146)

`index.html` keeps the ten farming-map IDs unchanged and adds two separate
**Endgame exploration** cards. `assets/map-exploration.js` opens a same-origin
modal scene, passing only normalized appearance/class in a disposable URL fragment,
never an account or save blob. The actor factory accepts that saved look; defaults
remain unchanged in the workshop. The scene does not award rewards or persist
stage state. Existing farming/sync continues; `simVisualsOff` suppresses covered
field graphics/FX while the scene runs. Closing/reloading calls its explicit
idempotent disposer before removing the frame; focus and field UI resume.
Messages are accepted only from the current same-origin frame. Heading switches
follow its destination; reload retains its stage and native appearance.

`build_game_exploration.js` is a publish adapter, not an extra copy of scene sources.
It selects modules/manifest/WebP files into `dist/assets/endgame/`, rewrites runtime
URLs and removes developer/proposal links. The build also preserves the renderer's
MIT license. Never publish the full tools tree or PNG masters. The scene/large
assets are deferred until an entry is opened. Map cards have their own size
container so a narrow atlas sidebar cannot force a two-column overflow.

Checks: `publish_sim.js`, `panel_layout_smoke.js` and
`CHROMIUM_BUNDLED_LIBS=1 node tools/check_game_maps_browser.js http://127.0.0.1:8788 --publish`.
The browser check requires the built site/disposable local API server; it uses
real WebGL and native image decoding. It fulfills the main game's unavailable CDN
transport with pinned Three, and deliberately returns empty responses for existing
external farming mob/item art to exercise the original fallback. This is not proof
that those external hosts work here or that the deferred new mobs are installed.
