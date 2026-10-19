# Development and testing

Run commands from the repository root. Inspect task/environment setup instructions
first and reuse installed tools. There is no root package manifest or lockfile.
This guide documents repo commands; it does not assert your environment is ready.

## Dependencies

Use Node 24 for local API development/tests (`node:sqlite` and WebCrypto) and
Python 3 for the preview/check scripts. The game itself does not need an npm install.
DOM integration suites require optional local packages:

```sh
npm install --no-save --package-lock=false jsdom three@0.128.0
node -e "require('jsdom'); require('three'); require('node:sqlite'); console.log('test dependencies ready')"
```

Sprite tooling needs a Python virtual environment with Pillow; the legacy pack
pipeline also needs numpy and scipy. Install only the dependencies of the selected
pipeline. Native source recovery/export has additional pinned Go/renderer inputs;
follow the relevant [asset README](CODE-MAP.md#asset-pipelines-current-versus-fallback)
rather than reconstructing them from an older handover.

## Choose the preview for the task

### Game plus accounts, cloud saves and GM tools

```sh
bash tools/build_site.sh
node tools/dev_server.js
```

The default entry point is `http://localhost:8788/`. The server serves `dist/`,
routes actual API handlers through a local SQLite D1 shim and applies local
migrations. Rebuild `dist/` after changing client files. Restart after changing
API handlers (the server caches imported modules).

For disposable GM testing, use `node tools/dev_server.js --gm-all` instead and
register a synthetic account in that local instance. This option grants owner
access only in the development server. The database is in memory by default;
`--db tools/.devdb/preview.sqlite` deliberately keeps local test data across restarts.
Do not change the shared GM password or use production credentials for a preview.
Stop a foreground server with Ctrl-C.

The shim does not prove Cloudflare CPU limits, actual D1 behavior or browser cookie
behavior on the deployed host. For platform-specific changes, use the configured
Wrangler/D1 workflow described in `wrangler.toml` and
[deployment steps](../tools/cloudflare-deploy-steps.md). Do not run remote migrations
or deploy as an incidental local check.

### Game and art/effect development pages

```sh
python3 tools/preview_server.py 8000
```

Open `http://localhost:8000/` for the game; use the routes in
[TOOLS-START-HERE.md](../TOOLS-START-HERE.md) for specific dev pages. This is a
static/tool preview, not the accounts API server. Avoid raw `file://` opens:
fetching and APNG behavior need HTTP. A platform may provide a different browser
entry URL; use that environment's actual preview URL.

## During development

Use the [Code map](CODE-MAP.md) to select checks for the changed behavior and its
callers. Add regression coverage for new game behavior; documentation-only changes
need link/command/history checks, not a new game test. Read test output as well as
exit status: some suites print a skip and return zero when dependencies are missing.

Tests commonly extract source spans from `index.html`. If you move a declaration,
inspect those boundaries and include the real dependencies. `pack_sim.js` now reads
its own block directly from the page; a separate `/tmp/pack_block.js` extraction is
not required. `PACK_BLOCK` and `PACK_DATA` are optional explicit overrides.

For skill FX changes, run `python3 tools/build_skill_materials.py --check`,
`python3 tools/tests/skill_materials.py`, `python3 tools/build_afterglow.py --check` and
`node tools/tests/afterglow_sim.js` alongside the affected combat checks. The latter
exercises all 75 generated animations, the real cast lifecycle, projection at
reversed/vertical camera angles, canvas state, resize, expiry and dense-cast limits.
The material checks require Pillow 11.3.0 and numpy 2.0.2 in the selected Python
environment; see the [material pipeline](../tools/skill-fx-materials/README.md).
They decode all 64 cells and check alpha isolation, detail and the asset size budget.
The animation simulation covers decoded, pending and failed atlas images.
Its Canvas context records operations; it does not validate raster appearance or GPU
performance. Use the actual browser for pixels and desktop/narrow layout checks.

## Before pushing

The existing push gate requires all JavaScript simulations, all smoke suites and
the generated asset checks below. Install their prerequisites first. Do not present
a run containing skips as a fully passed gate.

```sh
python3 tools/make_sprite_viewer.py --check
python3 tools/make_class_skins.py --check
python3 tools/make_weapon_pack.py --check
for t in tools/tests/*_sim.js; do node "$t" || exit 1; done
for t in tools/tests/*_smoke.js; do node "$t" || exit 1; done
```

`publish_sim.js` runs the real static publishing build and checks its contents.
Changes to native art additionally require the pipeline's pixel/hash/placement/
timing audits under `tools/tests/` and the source-preservation proofs described in
its README. These Python suites are not included in the JavaScript loops. Many
require original sheets, recovered native binaries or independent renderer exports
outside the checkout; read arguments and recover pinned inputs before running.
If the inputs are unavailable, record the specific blocked audit.

For example, `tools/tests/skill_pet_assets.py` takes three directories: supplied
skill sheets, native pet renderer exports, and recovered native pet binaries.
`tools/tests/evil_scythe_assets.py` has its own four directory arguments. Do not run
all Python audits blindly or treat a missing external proof fixture as a pass.

## Visual verification and honest reporting

For UI/rendering changes, exercise the actual controls on desktop and a narrow
phone viewport. Check apply/cancel, loading failures, class/account changes and
reload when they cross the changed behavior. Confirm that assets load through the
built site, not only from repository-root tooling.

The jsdom/Three harness and some browser checks use a WebGL renderer stub. They
verify their implemented logic/DOM/canvas paths, not GPU rendering or physical
phone performance. For renderer/performance changes, use a capable browser/device
when available; otherwise report that portion as unverified.

Record exact commands, results and material missing coverage in the task handoff.
Historical pass counts and old workspace-only records are not evidence for a new
checkout or a combined branch.

## Ascension maps

Build with `bash tools/build_site.sh` and run `node tools/dev_server.js --gm-all`
for a disposable preview. Maps → Ascension Map uses normal travel, combat and
loot. The World Atlas holds the original ten maps. Both destination lists use plain backgrounds with gold section dividers.
Both Ascension destinations require a fourth-job class without boss clears. The previous scenery popup is no longer used.

Run `node tools/tests/panel_layout_smoke.js`,
`node tools/tests/ascension_scene_sim.js`,
`node tools/tests/ascension_progression_sim.js`,
`node tools/tests/astral_scenery_sim.js` and
`python tools/tests/native_mob_assets.py` (Pillow 11.3.0).
The native source recovery and exact frame/timing audit are documented in
[Native mobs](../tools/native-mobs/README.md). Verify actual browser rendering on
both palettes, field groups and bosses, travel back, reload and a phone viewport.
DOM checks with a renderer stub do not prove WebGL pixels or physical phone speed.
The prior `tools/check_game_maps_browser.js` verifies the retired popup behavior;
it is historical and is not an acceptance check for playable Ascension maps.

The live Astral renderer is `assets/astral-scenery.js`; historical ten-stage scenery
studies/captures retain their original source. The five-stage loader maps Thor to
its original four scenery groups. Regenerate the live Astral atlas PNG with:

```sh
node tools/maps/render_astral_preview.js | python tools/maps/render_astral_preview.py
```

The Python command needs Pillow and numpy. It rasterizes the actual geometry with
its space/stone sources, vertex colors and per-slab UVs; it does not certify WebGL
rendering. Pass stage `1`, `3`, `4` or `5` to the JavaScript exporter and an output
PNG path to Python for a close view of each area. `astral_scenery_sim.js` checks
deterministic geometry, varied paving/island surfaces, actual prop bounds against
the combat corridor, pillar supports, finite vertices, mesh budgets, and resource
disposal both with textures and with missing images.

## Parked fourth-job visual review

The owner testing build has `FOURTH_JOBS_LIVE=true`. Use the normal static preview server and open
`/Updates/fourth-jobs/review.html` for the original native fixed-look sprites and
30 core skill effects. This page is excluded from the production build.

Run `python3 tools/build_fourth_job_review.py --check`,
`node tools/tests/afterglow_sim.js` (now covers 105 effects on a flag-on page copy),
`node tools/tests/owner_fx_sim.js` and the existing fourth-job skill suite. The
normal skill material checks above remain required. With Pillow installed, run
`python tools/tests/fourth_job_assets.py --native <native-root> --proof <export-root>`;
[source recovery and native export instructions](../tools/native-fourth-jobs/README.md)
explain how to obtain those external fixtures. Without those arguments, the asset
audit validates recorded packed hashes and frame reconstruction only.

In the shared browser, run
`coderabbit-agent-browser eval "$(cat tools/check_fourth_job_browser.js)"` at desktop
and 390px widths. Check sprite download failure/retry and reduced-motion startup
as well. The fixed-look pack is integrated with the live renderer in v161. Run
`python3 tools/build_fourth_job_runtime.py --check` and
`node tools/tests/fourth_job_runtime_sim.js` for delivery/loading/frame coverage;
review-page checks do not replace gameplay and wardrobe acceptance before release.

Fourth-job playback correction: `node tools/tests/fourth_job_motion_sim.js` checks
native skill routes and deterministic body/effect time. Run
`tools/check_fourth_job_playback_browser.js` via the shared browser eval command
on the review page to check actual Canvas FX for all 30 skills, resumed playback
and body changes during scrubbing. The expanded native audit checks 400 actions /
2,573 frames. Manual route browser coverage is 384; GX roll aliases are covered
by motion and pixel playback checks. Skill selection intentionally resumes playback.

For v162, run `ascension_evolution_sim.js`, `astral_journey_sim.js`, `mythic_testing_sim.js`, `fourth_job_mythic_sim.js` and the existing Ascension/UI suites. Regenerate Thor with `node tools/maps/render_astral_preview.js thor | python tools/maps/render_astral_preview.py`; this mode also needs `@napi-rs/canvas` (tested 1.0.11), alongside Three, Pillow and numpy. The banner uses actual scene geometry and textures, with software lighting.

## Ascension progression (v163)

Run `node tools/tests/ascension_tracks_sim.js`,
`node tools/tests/ascension_combat_sim.js` and
`node tools/tests/ascension_rewards_sim.js`. They exercise actual page helpers,
combat, source-class away attribution, duplicate claims, state repair, ordinary
skill ledger separation and live/away reward parity. Include save/owner/cloud,
offline, skill/combo, job/trial/Mythic, combat/stat/economy and Ascension map/UI
suites when these paths change. Historical balance fixtures can be regenerated
with `node tools/progression_balance.js --reuse-baseline`, then separately
`--skills --reuse-baseline` and `--encounters --reuse-baseline`; preserve original
baseline rows. Validate with `node tools/tests/skill_balance_sim.js`.

In the built browser check both Character allocation tabs at desktop and 390px:
earn/spend limits, six class presets, all six upgrades per class, combo availability,
auto-cast on/off, reset/cancel, reload and fresh account isolation. Test scene
rendering on a GPU-capable browser separately from the documented renderer stub.

For v165 reward/pacing retunes, `ascension_rewards_sim.js` pins 700 shared hours
and ~87.5 class hours at 8M combat EXP/min, 5–10% EXP per HP, and 5–10% Zeny
**per kill** against matching Abyss regular/MVP mobs at low/mid/high random rolls.
It checks live/away parity including bosses and unchanged original-map Zeny.
`ascension_tracks_sim.js` rejects v164 measured-income samples both at load and
claim while preserving current-version samples, earned progress and ordinary-map
samples. Existing Mythic/evolution suites cover actual prices, resource deductions
and equipment identity. Price probes must use `mythic:true`; `sec:6` alone falls
back to N+ rarity for ore and reforge fees.

For v166, `node tools/tests/retune_sim.js` checks Mythic affix specialization,
post-cap ASPD display, all 72 set/slot icon mappings and 42 native PNG hashes,
and Skills/Class Tree separation. `ascension_rewards_sim.js` now pins 5–10%
EXP per kill and bounded 2–3× Zeny per kill; `ascension_tracks_sim.js` rejects
v165 away samples. Include the existing gear/combat, Mythic/evolution and panel
checks. The isolated `crit_sim.js` and `ui_sim.js` harnesses include neutral Ascension
dependencies; their current assertions cover the separate Echo destination and
Class Tree lineage. Full-page Ascension combat and panel suites cover integration.

For v167 run `node tools/tests/combat_retune_sim.js`: all six fourth jobs,
ordinary/Mythic equipment, Haste on/off, extreme speed bonuses, displayed 192
ceiling, actual basic-hit cadence and saved-roll preservation. The updated
`ascension_progression_sim.js` pins independent HP/ATK stage ramps and boss
3× HP / original 4× ATK (corrected in v168). Include `job_rite_sim.js` because trial stats use Astral entry,
and reward/offline suites to verify unchanged per-kill payouts. `retune_sim.js`
now checks the reverted HP/CDM rolls and 192 cap. Stat conversions remain proposed.

For v168, `combat_retune_sim.js` also checks unchanged original-map HIT at all
150 stages and real Astral/Thor enemy swings: 65% regular / 75% boss hit chance
at 80 Flee, retained blind/block effects and the 5% dodge floor. The progression
suite pins literal original ATK values for every Ascension stage and the 4× boss
multiplier while preserving reduced HP. Trial coverage verifies its HIT is unchanged.

For v169, `retune_sim.js` checks the shared headgear pool in all seven sections,
actual physical-stat generation across sections/tiers, paid reforge offers and
acceptance for all eight grades, and preservation of a saved old headgear roll.
Include gear, economy, save/load and evolution checks. Temporary conversion
experiments must keep raw gear/allocated stats matched and state scope explicitly;
stat snapshots and stationary combat do not establish leveling or farm income.

For v170, `node tools/tests/hp_affix_sim.js` covers all eight grades, HP ×2 with
Crit/LUK ×1, unchanged cards and off-hand weighting, saved raw rolls, item/reforge
UI and stored-roll autosell minimums. HP-dependent combat, healing/shields, pets,
trial, save/account and equipment suites are affected. The earlier conversion
experiment's damage reductions describe the rejected crit/LUK proposal, not v170.

The v170 PR preparation also refreshes progression `after` measurements with
`node tools/progression_balance.js --reuse-baseline` and its `--skills` /
`--encounters` modes; historical `before` rows stay intact. `pet_sim.js` uses
its old rotation estimate as a diagnostic only and checks the actual Pack Leader
+10% limit and duplicate-species protection through `petDmg()`. Generated
Afterglow covers ordinary skills; Ascension skills use the generic FX lifecycle.


## v179 travel, materials, class/skill layout and fourth-job wardrobe

Run `node tools/tests/progression_refresh_sim.js` for all twenty two-second Astral
stage pairs (including pet following), both old material wallet migrations and
idempotence, legacy gifts/crafting/reforge/purchases, refinement loss/protection,
current-path/full-tree controls, top-of-Skills combo and the Echo scene.
Affected callers are `astral_journey_sim.js`, `material_sim.js`,
`adventurer_updates_sim.js`, `gear_sim.js`, `zeny_sink_sim.js`, `eclipse_ui_sim.js`,
`panel_layout_smoke.js`, `ui_sim.js`, `fourth_job_sim.js` and the GM/save suites.
`node tools/build_gm_catalog.cjs --check` verifies the regenerated GM catalog.

Fourth-job customization now uses native components, superseding the earlier
fixed-look gameplay adapter described above. Run `fourth_job_runtime_sim.js`,
`wardrobe_game_sim.js`, `wardrobe_sim.js`, `python3 tools/tests/fourth_wardrobe_baseline.py`
and `publish_sim.js`. The native layer/proof audit needs recovered source inputs;
see [fourth-job wardrobe rebuild](../tools/native-wardrobe/README.md). Do not skip
that audit when regenerating sprite data. The former fixed composite pack remains
a local proof reference and is excluded from publishing.

Check desktop and 390px shared-browser layouts: Maps → Endless Echo, Class Tree
current path/full overview/neutral portrait, Skills combo first, and Wardrobe
hair/colors/accessories for all six jobs and both genders. The sandbox's Chromium
could not create WebGL; `node tools/native-wardrobe/browser_setup.cjs` reloads the
shared page with the explicit repository renderer stub for DOM/Canvas checks.
Reapply it after a fresh reload when needed. Stubbed checks do not cover GPU or
physical phones.

## v185 Mythic GM bases

Run `node tools/tests/mythic_gift_base_sim.js` and
`node tools/tests/gm_presets_sim.js`. The first compares every set/slot and weapon
against actual maximum-field N+ drops at low/mid/high rolls, then evolves eligible
owned sources. Shield bases are compared directly because current fourth jobs
cannot equip shields. It checks all six maximum presets, legacy gift repair,
repeat loads, separate accounts, cards/refinement/affix/ID preservation, paid
reforge offers, queued cloud gifts and regenerated catalog parity.
Include Mythic/evolution, gear, class/save/owner/cloud and GM suites. Regenerate
the catalog with `node tools/build_gm_catalog.cjs`, then verify `--check`.

## Timing-only real-field comparison

For exploratory comparisons without changing game balance:

```sh
node tools/compare_field_combat.cjs reports/field-combat
node tools/summarize_field_combat.cjs reports/field-combat
```

The first runs actual field enemies, movement, healing, effects, deaths and boss
escorts with only `playerAttack()` changed in memory between old/current timing.
It asserts matching paired inputs, reconciles damage/kill counters, suppresses newly
acquired pets and freezes Job/Ascension earnings to hold the test build constant.
`--quick` is a short harness check, not acceptance evidence. The second reconciles
measured EXP against real regular/boss rewards and derives ordinary Lv150 rates;
GM-generated fourth-job fixtures otherwise retain x100 native reward rates.
Read `results.md` first, then the full fixtures/assumptions and per-seed JSON.
The screenshot-derived GX fixture is not the owner's save; different fixture
investments are not a class-ranking proof. Renderer/FX are stubbed, and three
seeds/three-minute windows do not justify a balance multiplier.

## Cosmetic combo-gap swings (v186)

Run `node tools/tests/cosmetic_combo_sim.js`, `combo_rotation_sim.js` and
`attack_sync_sim.js` (the latter two also under `tools/tests/`). The real-page
cosmetic suite rejects combat RNG during both creation and impact, targeting,
projectiles, damage/leech/proc helpers, stale class/account/target state and
paused queued-skill fallback damage. It covers every offensive class: no basics
inside a combo burst, damaging basics retained during the three-second recovery.
The rotation suite checks complete ASPD-paced swings and unchanged skill spacing;
include fourth-job skill/motion checks for Rolling Cutter's five 0.2-second casts.

For actual native attack pixels and desktop/390px Skills pause/resume controls:

```sh
# Optional browser dependencies, alongside jsdom/Three and Node 24:
npm install --no-save --package-lock=false playwright-core @sparticuz/chromium
bash tools/build_site.sh
# With tools/preview_server.py already serving the repository on port 8000:
CHROMIUM_BUNDLED_LIBS=1 node tools/check_cosmetic_combo_browser.cjs http://127.0.0.1:8000/dist
```

Keep the previously installed test dependencies when adding browser packages in
an environment without a package manifest. The check loads shipped native assets
from the built site, runs the real attack/update/native Canvas painter, compares
changing RGBA pixels, and checks zero cosmetic damage for male/female GX/Warlock.
It replaces only the external Three CDN download with the same local r128 library;
there is no WebGL renderer stub. In the sandbox, Chromium uses software SwiftShader.
The animation is stepped deterministically (rAF is paused), so this is not a
physical-phone/FPS or full-scene GPU performance test. Diagnostics are scratch
files under `node_modules/.arena-checks/`, not publishable artifacts.

The checked-in attack-timing and field-combat reports predate v186's cosmetic-only
gap rule. Their stored source hashes identify the historical damaging-gap version;
do not cite those DPS/income values as measurements of v186. Re-measure into a
new report directory if current-version balance evidence is needed; preserve the
old reports. Refresh all three progression fixtures after combat changes and keep
the historical skill-balance limits intact, even if they still fail.


## Late Ascension / Mythic progression (v187)

Run `node tools/tests/endgame_progression_sim.js` alongside Ascension tracks/combat,
fourth-job skills/Mythic, equipment/evolution, save/owner and cosmetic-combo suites.
The nine-group regression covers offensive rank curves and maximum preservation,
linear support/cooldown upgrades, signature base power, mixed-refinement set floors,
UI values, save/reset/class/account isolation and retained combo timing. Mutation
checks against linear stats/skills, instant maximum set bonuses and instant full
signature power must fail. The existing promotion/reload test now expects +2% ATK
from an immature two-piece Celestial set, rather than its +15 maximum of +5%.

Reproduce the paired stationary report without replacing the working page:

```sh
mkdir -p node_modules/.arena-checks
patch -R -o node_modules/.arena-checks/v186.html index.html < reports/endgame-progression-v187/v186-to-v187.patch
node tools/compare_endgame_progression.cjs node_modules/.arena-checks/v186.html reports/endgame-progression-v187-rerun
```

The reverse patch reconstructs the exact local v186 page used for this comparison;
verify the before/after SHA-256 values recorded in `comparison.json`. Later source
changes may require recovering the recorded source first. The 48 paired setups
assert identical inputs, unchanged no-Ascension N+ and maximum-investment DPS,
and monotonic intermediate growth for eight class/weapon builds. All use maximum
ordinary skills/job levels, empty sockets, no mastery/pets and a stationary boss
with no crit resistance; the N+ entry proxy is not a fresh Job 1 owner save. The
50/30/20 design guide is not a measured exact contribution, and the old timing-only
values are not a reason to add another blanket +47% to an already invested build.
Recheck real farming/survival before making field-pacing claims.

For built-site controls at 1280px/390px, with the preview server/dependencies above:

```sh
bash tools/build_site.sh
CHROMIUM_BUNDLED_LIBS=1 node tools/check_endgame_progression_browser.cjs http://127.0.0.1:8000/dist
CHROMIUM_BUNDLED_LIBS=1 node tools/check_cosmetic_combo_browser.cjs http://127.0.0.1:8000/dist
```

The first uses actual allocation/sub-tab controls, reset cancel/confirm, Forge set
selection, refinement previews, save reload and account replacement. The second
retains the native cosmetic-animation pixel checks. Both pause rAF for deterministic
checks and use software Chromium WebGL, not a renderer stub or physical-device/FPS
proof. Screenshots/diagnostics remain excluded under `node_modules/.arena-checks/`.

The pet asset disposal test waits for the actual async decoder-entry signal with a
five-second failure bound instead of 100 event-loop spins. This removes a concurrency
race observed during the full gate without relaxing asset/disposal assertions.

## Field-report rendering regressions

`node tools/tests/field_report_sim.js` exercises the pure production renderers in
`tools/lib/field_reports.cjs` without replaying combat. It covers the native GM x100
warning independently of normalization, full/quick/other seed counts, per-side
boss-attempt denominators, mixed win/loss outcomes, missing/invalid boss means and
unchanged reduction arithmetic for valid means. Removing the warning, restoring a
hard-coded session count or bypassing the timing guard must make the suite fail.

For an end-to-end quick check, use a scratch output directory (not the historical
checked-in report):

```sh
node tools/compare_field_combat.cjs node_modules/.arena-checks/field-report-quick --quick
node tools/summarize_field_combat.cjs node_modules/.arena-checks/field-report-quick
```

The comparison generator itself must emit the native reward warning before running
the summarizer. Quick output reports one seed, 10-second sessions/limits and actual
attempts, and is explicitly not acceptance/balance evidence. The summarizer retains
its measured-source hash check; do not bypass it to re-normalize historical data
against a newer game. Existing Markdown can be re-rendered from its stored raw and
ordinary-rate summaries using the pure renderers, without editing either JSON file.

## Attack and contact audio (v190)

Run `node tools/tests/combat_audio_sim.js` and `node tools/tests/attack_audio_sim.js`
for native WAV integrity/mappings, separate motion/contact budgets, loading/unlock,
all 25 classes' actual animation/contact callbacks, misses and cosmetic gap swings.
Include `gameplay_polish_sim.js` for saved sound settings, `attack_sync_sim.js`,
`cosmetic_combo_sim.js`, `combo_rotation_sim.js`, `combat_damage_sim.js`,
`pet_game_sim.js` and `publish_sim.js` for affected callers and asset delivery.
In the browser, unlock audio with a click/key, verify native WAV decoding, normal
swings with combos paused, skill bursts and pets, then toggle Attack / hit sounds
in Settings. BGM uses its own controls. Instrumented callbacks do not prove
subjective listening quality or physical speaker latency.


## Outdoor combat fields and monster proportions (v195)

See [source pipeline](../tools/native-fields/README.md) for pinned public source
packages, the two unavailable dungeon substitutions and monster fallback IDs. Run:

```sh
node tools/tests/native_fields_sim.js
node tools/tests/reference_mobs_sim.js
python tools/tests/native_fields_assets.py --source-cache /path/to/map-cache --mob-cache /path/to/mob-cache
python3 tools/backup_map_kit_hd.py
node tools/tests/kit_sim.js
node tools/tests/publish_sim.js
bash tools/build_site.sh
CHROMIUM_BUNDLED_LIBS=1 node tools/check_native_fields_browser.cjs http://localhost:8000/dist
```

The asset audit needs numpy and Pillow; this task verified Python 3.14, Pillow
12.1.1 and numpy 2.4.2. Browser dependencies and the preview server follow the
cosmetic-combo section above. Do not rebuild dist while browser checks are running.
The browser test covers fifty desktop/390px scenes, travel during an initial native
load, original animated monster pixels, hero readiness, actual hero/monster floor
contact, hero traversal across hills in both directions, pet/loot/projectile/aura
contact at several ground heights, arena cleanup and missing asset fallback. The
simulation checks outdoor-only prop selection, combat clearance, distinct hill
profiles, gradual slopes, natural pond depressions, exact triangle contact and
smooth indexed terrain normals. It also passes the real Three r128 ShaderLib
source through the prop material hook, checking that unresolved map includes are
replaced with atlas-bound UV sampling while preserving color conversion. It uses real WebGL through SwiftShader, with paused rAF; it does
not establish physical-device performance. Shared Preview Chromium lacks WebGL
in this sandbox. Inspect the generated map screenshots for terrain and scenery.

### Saved map preview and default selection (v196)

New outdoor fields are opt-in via `?nativeFields=1`; plain game URLs use existing
kit maps. The native browser harness now checks all ten default maps without
field asset requests, then previews new terrain and returns to the plain URL to
verify the override was not persisted. Native simulation also executes the real
activation gate with absent, enabled, disabled and invalid query values. See
[the handoff](NATIVE-FIELDS-HANDOFF.md) for startup, activation and rollback.
