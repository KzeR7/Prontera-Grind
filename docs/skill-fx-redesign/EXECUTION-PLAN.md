# Execution plan

## 1. Outcome and boundaries

Deliver clear, weighty, individually recognizable skill effects that belong beside the game's native sprites. Reuse projection, lifecycle and combat dispatch where suitable. Replace weak artwork and shared visual assumptions rather than just increasing particle count.

Preserve native hero/monster/pet/icon pixels, anchors, all directions, animation timing, skill IDs, saves, balance, hit counts, targeting, cooldowns, paths, combo cadence and the 28-effect cap. No camera shake, new sound system, account/API changes or deployment is part of this plan. New effect artwork may be authored; native character artwork may not be repainted.

## 2. Why the previous pass fell short

Observed in the current source:

- Eight generic procedural materials, eight frames each, serve 75 effects. Dedicated geometry exists, but repeated material language weakens individuality.
- `tools/skill-fx-materials/runtime.js` uses `source-in` for tinting, replacing RGB shading. `screen` is the default blend. This can flatten texture and pale out on bright terrain.
- `assets/skill-afterglow.js` uses a common 2.2-second lifetime cap and a global `age * 1.65` drawing clock. This is not a statement that every animation remains visible for 2.2 seconds.
- All current Canvas effects are above the scene. Separate back teeth cannot be hidden behind the native monster layer.
- Small-target scaling also reduces secondary contacts. A detailed atlas viewed enlarged is not proof of readability at actual gameplay size.
- Fire Bolt currently draws five falling bolts while the game defines three hits. This is an existing visual discrepancy to correct without changing damage.

RO is a mixture of textured layers, sprites, geometry and skill-specific code. The community client references demonstrate per-layer animation/blending and separate release/hit effects; they do not establish exact original Gravity timing or art. Browser video playback was unavailable during research, so no frame measurements from original gameplay are claimed.

## 3. Phase A — recover baseline and audit contact

1. Read `AGENTS.md`, current docs and this directory. Check branch, working tree and source hashes. Recover the supplied V149 baseline only when absent; preserve newer/unrelated work.
2. Load the native comparison page and the actual game using the documented server. Verify browser readiness and register the service. Never treat the comparison page's Canvas ground plane as full GPU gameplay.
3. Record one identical scene per pilot: actual native sprites, target scale, terrain, camera, viewport, playback speed, random seed and simulation clock. Capture current and candidate in that same scene.
4. Audit `resolveSwing`, `castSkill`, `playSkillFx`, `tickSkillFx`, `syncSkillFx` and native layer ordering before altering the adapter.

**Critical timing fact:** `castSkill` emits the visual and applies declared multi-hit damage synchronously. Fire Bolt's three damage hits and Sonic Blow's eight damage hits are not independently scheduled strike events. Do not invent timed damage callbacks to fit the art. Put the primary contact on cast resolution; subsequent streaks are a cosmetic flourish. Optional anticipation must use an existing visual windup hook and cancel cleanly on retarget/death/class change. If that hook is unavailable, omit pre-contact anticipation. Do not delay damage or wait hundreds of milliseconds to show the first impact.

Exit: baseline captured, timing/layer audit recorded, assets linked to stable IDs. Mark proposed values separately from observed measurements.

## 4. Phase B — finish Grimtooth artwork

Use the asset register and pilot specification. Produce original raster art with transparent backgrounds, solid shaded bodies and limited supporting light. If an image-generation tool is used, read its skill first; keep prompts/source outputs and manually curate the result. Generate consistent reference art or individual components, then author coherent frames. Independent random images are not an animation sequence.

First approve a neutral-light tooth study on the game's actual grass and cobblestone: varied hooked tips, dark roots, warm gray/ivory ridges and restrained violet crevices. Then create the eruption/contact/retraction sequence. Preserve the small inward-facing teeth and open center. Keep the mouth footprint around the selected target even though the gameplay skill retains line targeting.

Ship editable sources, selected transparent frames, provenance and deterministic packing instructions with every generated atlas. Use an external alpha mask or RGBA export; never accept a painted checkerboard as transparency. Inspect edges on dark, light and terrain backgrounds. Do not copy or redistribute RO assets based solely on public client references.

Exit: a normal-speed native-sprite Grimtooth preview, contact sheet and comparison capture. The owner should be able to judge bite, material and scale before rollout. Owner feedback at this visual checkpoint controls the direction; no repeated permission prompts for routine implementation.

## 5. Phase C — integrate a minimal material/layer pipeline

Keep the current renderer until a concrete limitation requires a change. Canvas can deliver this art style.

### Color and blending

- Add a preserve-color mode and use it for painted materials. Do not blanket `source-in` tint them. If palette variants are needed, author them or preserve luminance through a tested color transform.
- Store per-layer blend mode, opacity, anchor, draw order, frame durations and scale in a manifest. Use `source-over` for solid teeth/debris/smoke and light blending only for emission/contact accents. Verify alpha edges under scaling.
- Give pilots explicit millisecond frame timing. Keep the legacy 1.65 multiplier only for skills not migrated; do not change the clock for all 75 accidentally.

### Depth and placement

- Current native monsters use `#mobSpriteLayer` at z-index 0; weapons use `#weaponSpriteLayer` at 1. Audit actual stacking contexts and hero rendering before choosing insertion points.
- Prototype a ground/rear effect pass below native sprites and a front/contact pass above them. Sort teeth by projected world depth, including reversed camera angles; do not hardcode screen top/bottom as rear/front.
- Two global effect passes cannot fully solve occlusion among many interleaved monsters. Test a crowded pack. If needed, split per-target rear/front groups within the native sprite ordering or use a verified mask. Document residual occlusion; never paint copies of native sprites into the FX to fake depth.
- Update clean-screen visibility, resize, DPR, disposal and pending/failed texture fallback for every added layer. Keep FX pointer-free and below HUD/damage text.
- Size the maw footprint from target bounds; apply a separate minimum contact size for readability. Keep existing skill trajectory and area targeting independent of cosmetic footprint.

### Memory and quality

- Preload only required atlases; bound decoded caches and dispose resources. No texture generation/atlas decoding inside each draw.
- Proposed pilot budget: combined encoded assets <=1.5 MiB, simultaneously resident pilot textures <=32 MiB, max texture edge 2048px. Count every atlas page and cached surface. These are design ceilings, not current measurements.
- Preserve core silhouette/contact at narrow/dense detail; reduce dust and embers first. Keep 26 Grimtooth teeth at all quality levels as the current regression requires.
- The existing publishing test requires the assembled tree below 38.5 MiB. Measure headroom before adding artwork; optimize/repack within the existing gate rather than raising it silently.

Exit: integrated Grimtooth passes correctness checks and is visually accepted. Rollback is the existing renderer/atlas with the new path disabled; no save migration.

## 6. Phase D — prove two more materials

1. **Sonic Blow:** authored sharp cuts with a shaded body, localized hit spark and decisive finish. Eight cosmetic accents may communicate the existing eight-hit identity, but must not reschedule gameplay damage.
2. **Fire Bolt:** three visual contacts, painted hot cores, orange bodies, darker smoke and short distinct impacts. Preserve downward trajectory. With current contact-time dispatch, show contact immediately and let any continuing descent be cosmetic; do not show a long windup after the target has taken damage.

Compare all three on bright cobblestone, grass and dark forest at actual scale, normal speed and 390px/1440px viewports. Include small regular target and boss scale. Stop and revise when the result still reads as glossy geometry or a translucent overlay. Still-frame beauty alone does not pass.

## 7. Phase E — cover the remaining 72 skills

`skill-inventory.json` contains exactly 75 rendered skills, including the three pilots; 16 passives have no cast FX. Proposed rollout groups are planning suggestions, not accepted art.

1. Establish distinct material sheets for steel/arrow, earth, fire, ice, lightning, holy, shadow, support and heavy physical effects.
2. For each skill, audit its actual behavior and approved direction; author a unique silhouette, primary contact and decay. Reuse physical material components, not the same entire explosion recolored.
3. Write the per-skill manifest from real source anchors. Inventory null audit fields must be resolved during implementation; do not infer behavior from historical IDs (`nap` is Lightning Bolt, `amp` is Meteor Storm, `meteor` is Magic Crasher, `heal` is Searing Light).
4. Finish attacks in small material groups, then quieter buffs/heals. Preserve inward Gravity Well motion, parallel Double Strafe arrows and all other existing trajectories.
5. Track art, integration and validation separately. A rendered nonempty frame is not an art approval.

## 8. Acceptance and evidence

### Visual gate

For each pilot and then each group, retain a comparison GIF/video at 1x and a contact sheet at onset, contact, peak and decay. Same native sprite, terrain, scale and camera in both versions. Also inspect normal gameplay with overlapping casts, target death and camera reversal.

Reject if: contact cannot be located at normal speed; washed-out body on bright terrain; smooth plastic teeth; repetitive fence silhouette; floating ground interaction; all rear teeth drawn over the monster; projectile visibly arriving long after damage; HUD obscured; reduced detail removes the defining shape.

Proposed measurable targets: primary contact visible within the first two 60Hz rendered frames after cast resolution; at least half of the target silhouette remains readable outside the brief contact core; no full-screen white flash; no frame allocations growing with elapsed casts. These are acceptance targets to inspect/measure, not existing verified results. New art quality remains a human judgment.

### Automated and browser checks

Select checks against the current validation record and current inputs; reuse only equivalent results. From repo root for implementation changes:

```sh
python3 tools/build_afterglow.py --check
node tools/tests/afterglow_sim.js
node tools/tests/skill_sim.js
node tools/tests/skill_redesign_sim.js
node tools/tests/combo_rotation_sim.js
node tools/tests/attack_sync_sim.js
node tools/tests/publish_sim.js
bash tools/build_site.sh
git diff --check
```

Use the prepared Python environment with Pillow 11.3.0/numpy 2.0.2 for `python tools/build_skill_materials.py --check` and `python tools/tests/skill_materials.py` if their inputs/path remain in use. Add meaningful checks for new per-layer blending, RGB preservation, clock migration, depth partition, cache bounds, fallback/disposal and retained 26-tooth geometry. Update source and generated outputs together.

Actual browser checks must verify raster appearance, decoded/pending/failed textures, game-scale projection, desktop/narrow layouts, camera reversal, small/boss targets and 28 simultaneous effects. Benchmark on a capable browser/device with deterministic fixtures: proposed 60Hz target p95 total frame time <=16.7ms on desktop and 30Hz <=33.3ms on the chosen phone; proposed p95 FX contribution <=3ms desktop/<=6ms phone. Record hardware, DPR, viewport, sample duration, scene and warmed caches. If those targets fail, optimize optional layers and remeasure. Browser stubs do not prove GPU/performance. Previous WebGL2 and physical phone checks were blocked/unverified; resolve them or carry the limitation explicitly.

Before any implementation push, run every mandatory check in `docs/TESTING.md#before-pushing`, including generated sprite checks, all `*_sim.js` and `*_smoke.js`; inspect skip output. No prior pass count is evidence for a different checkout or patch.

## 9. Delivery and checkpoint rules

The present deliverable is proposal/data only. Keep a proposal-only PR separate from the existing unapproved V149 implementation unless the owner explicitly wants that implementation included. The portable archive retains both so neither is lost.

For actual player-visible implementation: append update log, bump BUILD/cache labels, commit generator/source art and runtime output together, include captures and validation limitations. Stage explicit files. Never commit local dependencies, credentials, runtime validation records or the transport ZIP. Do not deploy/merge as part of creating a PR. Use only the assigned task branch in this task; a new chat follows its own branch permissions.
