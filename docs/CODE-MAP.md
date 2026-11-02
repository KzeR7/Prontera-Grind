# Code map

Paths are relative to the repository root. Search by the named symbol rather than
line number: `index.html` changes often. Inspect definitions and callers before
editing. Many tests execute extracted pieces of the real page.

## Find the right system

Field-combat measurement reports: `tools/compare_field_combat.cjs` and
`tools/summarize_field_combat.cjs` use the pure `tools/lib/field_reports.cjs`
renderers. Regression coverage: `tools/tests/field_report_sim.js`; historical
measurements remain qualified by their saved source hashes.

| Task | Implementation / search anchors | Useful checks |
| --- | --- | --- |
| Classes, promotion, saved builds | `index.html`: `CD`, `CLASSES`, `classBlock`, `changeClass`, `snapClass`, `noviceRun` | `class_change_sim.js`, `loadout_update_sim.js`, `save_load_sim.js` |
| Stats, Base/Job EXP and pacing | `index.html`: `statCap`, `totalPts`, `baseNeedAt`, `needAt`, `jneed`, `expRate`, `economy tuning`; `tools/tune_pacing.js` | `base_pacing_sim.js`, `stat_sim.js`, `economy_sim.js`, `progression_sim.js` |
| Combat and skill execution | `index.html`: `SKILLS`, `comboConfig`, `nextComboSkill`, `resolveSwing`, `heroKite`, `tickSkillFields`, `tickCombatSkills`, `simAdvance`, `loop`, `bgTick`, `simWorker` | `background_sim.js`, `ground_combat_sim.js`, `combo_rotation_sim.js`, `cosmetic_combo_sim.js`, `skill_sim.js`, `skill_redesign_sim.js`, `combat_damage_sim.js`, `attack_sync_sim.js`, `field_loop_smoke.js`, `ascension_attack_sim.js`; native pixels/controls: `tools/check_cosmetic_combo_browser.cjs` |
| Late Ascension/Mythic offense | `index.html`: `ascStatValue`, `ascUpgradeScale`, `ascSignaturePower`, `ascensionSetBonuses`; caps and support values remain unchanged | `endgame_progression_sim.js`, `ascension_combat_sim.js`, `ascension_tracks_sim.js`, `fourth_job_mythic_sim.js`; `tools/compare_endgame_progression.cjs`, `tools/check_endgame_progression_browser.cjs` |
| 4th-job classes and skills (Milestone 4, dark-launched behind `FOURTH_JOBS_LIVE`) | `index.html`: `CD4`/`FOURTH_JOBS_LIVE`, `ADV4_BASE_LV`, `classBlock()`, `JOFF`, `PACK_BODY`, `V.job()` tree rows, `SKILLS4` and the mechanic helpers beside `chainHit` (`castSkill`, `absorbSoak`), `katarOnly()` | `fourth_job_sim.js`, `fourth_job_skills_sim.js` (flag on, plus live-page checks); parked reference in `Updates/fourth-jobs/` |
| Fourth-job advancement trial (locked) | `index.html`: `JOB_RITE`, `startJobRite`, `showJobRiteResult`, `tickJobRite`, `finishJobRite`; dark room and three-second animated result/promotion | `job_rite_sim.js`, `fourth_job_sim.js`, `fourth_job_mythic_sim.js` |
| Gear, class eligibility, cards, autosell | `index.html`: `genGear`, `canUse`, `stowUnfit`, `equipRec`, `CARD_FITS` | `gear_sim.js`, `dual_wield_sim.js`, `card_sim.js`, `autosell_sim.js` |
| Ascension maps and native mobs | `assets/ascension.js`, `assets/astral-scenery.js`, `assets/mobs/v1/`; `index.html`: `MAPS`, `canTravel`, `ascensionDrops`, `recordMapClear`, `buildAscension`, `syncMobImage`, `nativeMobArtPx` (`NATIVE_MOB_MAX_PX`, `NATIVE_MOB_MAX_SHARE`), `mobVisualScale` (`ASCENSION_FRAME_PX`, `ASCENSION_MONSTER_VISUAL`, `ASCENSION_BOSS_VISUAL`, `ASCENSION_KEPT_VISUAL`, `MOB_VISUAL_MAX`, `boundMobScale`), `V.map`, `ACT.mapseason`; `tools/maps/build_game_exploration.js` | `publish_sim.js`, `panel_layout_smoke.js`, `ascension_scene_sim.js`, `ascension_attack_sim.js`, `sprite_sim.js`, `ascension_progression_sim.js`, `astral_scenery_sim.js`, `native_mob_assets.py` |
| Native fields and reference monster proportions | `assets/native-fields.js`, `assets/reference-mobs.js`, `tools/native-fields/`; `index.html`: `nativeFieldStore`, `mobVisualScale` | `native_fields_sim.js`, `terrain_v2_sim.js`, `reference_mobs_sim.js`, `native_fields_assets.py`, `tools/check_native_fields_browser.cjs` |
| Map stages, scenery, Nightmare | `index.html`: `MAPS`, `fieldPlan`, `buildDeco`, `KIT_MAP` | `starter_sim.js`, `scene_sim.js`, `kit_sim.js`, `nightmare_sim.js` |
| Endless Echo | `index.html`: `TRIAL`, `TRIAL_PAY`, `TRIAL_STORE` | `trial_sim.js` |
| Pets and training | `index.html`: `PETS`, `petBuff`, `petR`; `assets/pets.js`, `assets/pets/v1/` | `pet_sim.js`, `pet_game_sim.js`, `pet_sprites_sim.js` |
| Wardrobe and native hero sprites | `assets/wardrobe.js`, `assets/wardrobe-ui.js`, `assets/wardrobe.css`, `assets/wardrobe/v5/`; `index.html`: `PGWardrobe` | `wardrobe_sim.js`, `wardrobe_game_sim.js`, native asset audits |
| Fourth-job native visual preparation (locked) | `Updates/fourth-jobs/review.html`, `review.js`, `native/`; `tools/native-fourth-jobs/`; `tools/skill-fx-proposals/fourth-job-fx.js` feeds the existing Afterglow generator | `fourth_job_assets.py --native <sources> --proof <exports>`, `build_fourth_job_review.py --check`, expanded `afterglow_sim.js`, `fourth_job_motion_sim.js`, `check_fourth_job_browser.js`, `check_fourth_job_playback_browser.js`; see `Updates/fourth-jobs/VISUALS.md` |
| Skill artwork | `assets/skill-icons.js`, `assets/skill-icons/`; `tools/native-skill-icons/` | source crop audit; `tools/check_skill_pets_browser.js` |
| Boss skill effects (MVP signature moves) | `assets/boss-fx.js`: `PGBossFx` (the `BOSSES` roster with `life`/`choreo` screen-time and `TIER.fadeAt`, `SKILLS`, `create`, `paint`, `draw`, `skillsOfMap`); `index.html`: `bossSkillLayer`, `tickBossSkill`, `castBossSkill`, `syncBossSkillFx`, `resetBossSkill`, `BOSS_CAST_MIN/MAX` | `boss_fx_sim.js`; interactive review at `/bossfx` (`tools/boss_fx_preview.html`); timing notes in `Updates/boss-skill-fx/README.md` |
| Skill casting effects | `assets/skill-overdrive.js`, `assets/skill-afterglow.js`, generated `assets/afterglow-animations.js` and `assets/skill-materials.js`; `index.html`: `playSkillFx`, `tickSkillFx`, `syncSkillFx`; interactive review at `tools/skill-fx-proposals/prismatic-overdrive.html` | `overdrive_sim.js`, `overdrive_preview_sim.js`, `afterglow_sim.js`, `skill_sim.js`; `python3 tools/build_afterglow.py --check` |
| Panels, buttons and hotkeys | `index.html`: `V`, `ACT`, `TABS`, `SIDE_TABS`; `assets/ui/` and wardrobe UI module | `ui_sim.js`, `panel_layout_smoke.js`, `eclipse_ui_sim.js`, `mail_roulette_ui_sim.js` |
| Small-screen / phone shell (fullscreen maximizes the portrait view; no orientation lock) | `assets/ui/mobile.js` (`window.PGMobile`: layout detection, `html.pg-mobile`, rail sheet, field-only, `toggleFullscreen`), `assets/ui/mobile.css` (the whole phone shell, scoped to `html.pg-mobile` and loaded after `eclipse.css`), `index.html`: `#pgQuests`, `#pgScrim`, `#fsBtn`, `#pgFocusBtn`, `screenOptions()` phone block | `mobile_layout_sim.js`, `eclipse_ui_sim.js`, `ui_sim.js`, `panel_layout_smoke.js` |
| Page interaction: selection, right-click, image drag | `index.html`: `isTextField`; the document `contextmenu` / capture-phase `dragstart` listeners; the `user-select` and `-webkit-touch-callout` rules on `*,*::before,*::after` with the text-field exception | `interaction_guard_sim.js` |
| Cash Shop (Stripe Checkout, cosmetics + supplies + the donor tier) | `assets/shop-catalog.js` (the price list, shared; `DONATIONS` holds `don:all-cosmetics` and its floor/step/ceiling), `assets/shop.js` (the Donations view and the amount box), `assets/shop.css`; `functions/_lib/shop.js`, `functions/api/shop/{catalog,checkout,order,webhook}.js`, `functions/api/gm/shop.js`, `migrations/0005_shop.sql`; `functions/api/save.js` (`lockedCosmetics`), `assets/wardrobe-ui.js` (`wardrobeLocked`), `gm.html` (Cash Shop tab) | `shop_api_sim.js`, `shop_sim.js`, `dev_server_sim.js`; setup and donation rules in [MONETIZATION-SETUP.md](MONETIZATION-SETUP.md) §10b |
| Friends (haven-v273) | `assets/friends.js`, `assets/friends.css` (More ▸ Friends panel), `assets/social.js` (`Add friend` in the name menu, `★` marks, `syncFriends`), `functions/_lib/friends.js`, `functions/api/friends.js`, `migrations/0012_friends.sql`, `workers/social/room.mjs` (per-viewer `friend` flag); save-clock badge through `dot('friends')` in `index.html` | `friends_sim.js`, `friends_ui_sim.js`, `social_sim.js`, `social_ui_sim.js`, `social_api_sim.mjs`, `social_worker_sim.mjs`; see [Social hub](SOCIAL-HUB.md#friends-haven-v273) |
| Plaza fishing (haven-v287) | `assets/social-fishing.js` (`PGSocialFishing`: catalog, cast rating, reel physics, fishing dock + the one Fishing Bag window, `S.fishing` persistence), `assets/social-fishing.css`, `assets/social-rules.js` (`PONDS` + walkable), `assets/social-scene.js` (pond water/fish/bobber rig, `scene.fishing`, pond-click callback), `assets/social.js` (`🎣 Fishing` toolbar button, `bindFishing`, Local-chat show-off), `index.html` (`S.fishing` defaults + load sanitizer) | `social_fishing_sim.js`, `social_sim.js`, `social_scene_sim.js`, `update_watch_sim.js`; see [Social hub](SOCIAL-HUB.md#plaza-fishing-haven-v287) |
| Browser saves, login, cloud sync, away rewards | `index.html`: `fresh`, `load`, `save`, `saveKey`, `CLOUD`, `offlinePlan` | `save_load_sim.js`, `save_owner_sim.js`, `cloud_sim.js`, `offline_sim.js`, `migration_sim.js` |
| API accounts, sessions and saves | `functions/api/`, `functions/_lib/auth.js`, `functions/_lib/db.js` (`startVerifiedSession` — one live session per account, enforced in the same transaction as the insert), `functions/_lib/validate.js`; the kicked-device dialog `#sessionGate`, `cloudSessionReplaced()`, and the fast `cloudSessionTick()` /api/me probe in `index.html` | `api_sim.js`, `registration_sim.js`, `cloud_sim.js`, `dev_server_sim.js` |
| GM console and grants | `gm.html` (own `@media(max-width:820px)` phone block since v274: one column, no nested scroller, 40px targets, players as one line each below 480px, `closeDetail()`), `functions/api/gm/`, `functions/api/grants.js`, `functions/_lib/gm-tools.js` | `gm_console_sim.js`, `gm_tools_sim.js`, `gm_auth_sim.js` |
| Mail, daily roulette and shared buffs | `index.html`: `renderMailView`, `rdReaderMarkup`, `renderDailyRouletteView`, `renderDailyRouletteWheelSvg`, `renderGmStudioView`, `dailyEffectTilesHTML`, `updateMailDailyHud`; styling in `assets/ui/eclipse.css` | `mail_roulette_ui_sim.js`, `eclipse_ui_sim.js`, `display_polish_sim.js` |
| SQL and leaderboard | `migrations/`, `functions/api/board.js`, `functions/_lib/board.js` | `api_sim.js`, `leaderboard_sim.js` |
| Preflight gameplay reset (keep logins/purchases) | `tools/recovery/prelaunch_reset.mjs`, `launch_reset_core.mjs`; [owner runbook](PRELAUNCH-RESET.md). GM/owner public-board and new-prize exclusion: `functions/api/board.js`, `functions/_lib/competition-settlement.js` | `launch_reset_sim.js`, `leaderboard_sim.js`, `unverified_echo_launch_sim.js`, `competition_settlement_foundation_sim.js` |
| Launch runbook | [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md): order, commands and stop conditions for the last four launch steps | `live_backup_preflight_sim.js`, `live_additive_migrations_sim.js`, `live_launch_schema_check_sim.js`, `hosted_launch_stage_sim.js`, `pages_preview_config_sim.py` |
| Launch schema state | `tools/staging/live_launch_schema_check.mjs`: read-only, fixed-target comparison of live `pg` against the 0008–0011 contract, for when the tables already exist | `live_launch_schema_check_sim.js` |
| Write pause enablement | [ENABLE-WRITE-PAUSE.md](ENABLE-WRITE-PAUSE.md): the ordered owner steps, verification gates and per-step rollback for turning the pause on | `write_gate_sim.mjs`, `write_gate_middleware_sim.js`, `write_gate_api_sim.js`, `write_gate_cli_sim.mjs`, `write_gate_binding_sim.js` |
| Recovery: write pause | `workers/gate/` (`policy.mjs` is the state machine, `index.mjs` the Durable Object), `functions/_lib/gate-binding.js` (`DurableObjectNamespace` resolution), `functions/api/_middleware.js` (admission), `functions/api/gate.js` (control endpoint), `tools/recovery/write_gate.mjs` (owner CLI); enabled in root `wrangler.toml` (`WRITE_GATE = "required"`) | `write_gate_sim.mjs`, `write_gate_middleware_sim.js`, `write_gate_api_sim.js`, `write_gate_cli_sim.mjs`, `write_gate_binding_sim.js`; runbook in [RECOVERY.md](RECOVERY.md) |
| Static publishing and routing | `tools/build_site.sh` (also generates `dist/_headers`: since v275 the HTML entry point is `no-cache, must-revalidate` so a fix reaches players who never clear their cache — see [deploy steps](../tools/cloudflare-deploy-steps.md#5b-updates-reach-players-without-clearing-their-browser-v275)), `tools/optimize_delivery.js`, `wrangler.toml`, `_routes.json`, `.assetsignore`; [cloud-data audit](CLOUD-DATA.md) | `publish_sim.js`, `update_watch_sim.js` |

Simulation/smoke filenames above are under `tools/tests/`. These are starting points, not
an exhaustive test selection. Follow dependencies across systems and see
[Testing](TESTING.md) for the full push gate.

## Asset pipelines: current versus fallback

- **Current native wardrobe:** [native wardrobe README](../tools/native-wardrobe/README.md).
  Pinned sources, palette/layer metadata, exporters, catalog and browser loader
  must agree. Current runtime data is under `assets/wardrobe/v5/`.
- **Current pets:** [native pets README](../tools/native-pets/README.md). ACT/SPR
  inputs and the pinned renderer produce `assets/pets/v1/`; `assets/pets.js`
  handles loading/caching. Original IDs and animation cadence remain stable.
- **Current skill icons:** [skill icons README](../tools/native-skill-icons/README.md).
  `tools/build_skill_icons.py` crops the supplied sheets using the pinned mapping.
- **APNG fallback class art:** `assets/class_skins_data.js` and `Updates/Sprite/`.
  Read [APNG animation notes](../Updates/ApngAnimation/README.md) before changing
  decoding, disposal/blending, mirroring or frame timing.
- **Legacy packed bodies/heads:** `assets/sprite_pack_data.js`, `Sprite/`,
  `tools/make_sprite_pack.py`, `tools/montage.py`. Fixed frame counts and the
  stub-based anchors apply to this pack, not native ACT/SPR animation.
- **Weapons:** `assets/weapons/`, `assets/weapons_data.js`,
  `assets/weapon_joints_data.js`, `tools/make_weapon_pack.py`.
- **Map kit:** `assets/kit/`, with original working material under
  `Updates/map-sprites-v2/`. Scenery changes must preserve lane clearance and
  deterministic layout, as well as each map's identity.

Do not regenerate all art for an unrelated UI fix. Generated files and base64
atlases are outputs, not useful first reads. Start with manifests and generators.

The reviewed Arcana V7/V8 sources are preserved in `tools/skill-fx-proposals/`.
`owner-choices.json` records the owner’s 9 Old / 58 New selections, 8 undecided
casting effects, and notes. `owner-fx-old.js` and `owner-fx-new.js` refine the
explicitly selected effects; `owner-fx-redo.js` contains the subsequent owner-requested
redesigns for all eight originally undecided skills. The original report is preserved
as history, and the runtime exposes those overrides through `redesigned`. Run `python3 tools/build_afterglow.py` after editing
choices or refinements. It verifies source fingerprints, extracts selected V7
animations with their own helpers, retains V8 for New skills, applies the authorized redo overrides, and emits
`assets/afterglow-animations.js` plus the preserved V8 comparison module.
`node tools/tests/owner_fx_sim.js` checks operation equivalence against reviewed
sources for all effects without refinements, plus the warm lightning palette and
all sixteen refinements/redesigns.
The generated runtime
excludes preview backgrounds, stand-ins, controls and the extra Venom Field concept.
`assets/skill-afterglow.js` projects cast positions onto one transparent battlefield
canvas. Local effects preserve uniform scale; traveling effects align the study's
caster/target anchors with the projected flight path. The adapter plays the drawing timeline at 1.65×; visual duration is 2.2
simulation seconds, independent of damage and cooldowns. Single-target casts follow
the displayed monster size; area spells retain their world coverage. Animated flame,
smoke, light trails, ice, molten rock and seals use one embedded WebP atlas generated
by `tools/build_skill_materials.py`, with vector fallbacks while loading or on decode
failure. See the [material pipeline](../tools/skill-fx-materials/README.md). Grimtooth
reuses three cached tooth surfaces for 26 small inward-facing teeth in two rings;
all teeth remain visible at reduced detail. Shared contacts choose material responses
from the active skill (metal/earth fragments, flame and soot, ice shards, electrical
branches, holy light or spectral splinters). Additional contacts follow existing
arrival, fracture and assembly times. Gravity pressure keeps its inward motion.
No camera shake or gameplay timing changes are involved. The existing 28-effect cap
and lower particle detail on narrow screens/dense casts bound work. The original
Three renderer remains the fallback when the adapter is unavailable; its source
backup is under `tools/skill-fx-backups/pre-afterglow/`.

Prismatic Overdrive is the hand-authored presentation layer in
`assets/skill-overdrive.js`. It explicitly defines all 105 ordinary/fourth-job effects
and six Ascension signatures in shared and skill-specific pattern families, with deterministic
particles, class palettes and textured material layers. It wraps the generated catalog
rather than regenerating or rewriting the reviewed owner choices. The shared adapter
uses Overdrive's caster/travel metadata while enabled; `PGSkillOverdrive.setEnabled(false)`
selects the preserved legacy renderer, and an unknown id still falls back safely.
`/overdrive` (also `/fx`) serves the interactive native-sprite proposal with all 111
skills, current/Overdrive A/B (with an honest SAME state for preserved current FX),
replay/pause/speed, timeline scrubbing, play-all and Ultra/Balanced detail. Normal gameplay keeps the existing mobile/dense-cast policy;
forced detail is review-only. See `overdrive_sim.js` and `overdrive_preview_sim.js`.

The v217 clarity pass removes the shared seal/helix/burst preamble from self-buffs;
every aura variant now has its own readable symbol and motion, while First Aid uses a
minimal dedicated pattern. Knight sword thrusts draw complete guarded blades, Hundred
Spears draws full shafts, Sonic Wave is a broad pressure wave and Dragon Breath is a
textured fire cone rather than a creature body. Storm Gust, Meteor Storm and Lord of
Vermilion have explicit reduced composition scales. The Assassin tree retains
distinct pattern families rather than recoloured duplicates. Jupitel Thunder and Chain
Lightning use travel/junction choreography instead of recoloured sky bolts. Material
tint hits refresh LRU recency; regenerate with `tools/build_skill_materials.py` after
editing `tools/skill-fx-materials/runtime.js`.

The v218 spectacle remains on Shadow Dash (five shadow bodies, a broad wake and a
horizontal sever) and Soul Breaker (twin soul katars, a spectral reaper and a
diagonal cleave). The v219 restoration pins Meteor Assault to its caster-centred
`nova` and Rolling Cutter to its fast caster-centred `spin`; approved Cross Slash
remains on its unchanged `crossCut` choreography. In v220, Sonic Blow keeps its
rapid eight-contact concept but alternates neon-orchid and glacial-cyan split-edge
arcs with tapered trails and compact prismatic contacts. Current mode still uses
the preserved legacy Sonic painter, so its NEW/OVERDRIVE versus OLD/LEGACY A/B is
enabled and visually meaningful. The other 110 effects, combat mechanics and
detail/cap policies are untouched by the v220 follow-up.

For blend review, `/overdrive` defaults to the un-tinted
`tools/skill-fx-proposals/prontera-field.webp` backdrop. This is a 1440×841 capture
of the actual Prontera stage-1 WebGL field (45 placed props, no missing art), with
combat actors hidden only in the capture. The **Prontera / Studio** selector switches
between that map and the neutral procedural stage without reloading the selected
skill or changing its timing. The capture and selector are review-only; neither is
included in the production game build.

## Development helpers and historical material

- **Live Astral scenery:** `assets/astral-scenery.js` builds the current connected
  battlefield: merged paving/mosaic/engraving layers, instanced edge ruins, and
  independently fractured rock islands. `tools/maps/render_astral_preview.{js,py}`
  exports/rasterizes this geometry for `assets/atlas/astral-citadel.png` and optional
  area closeups. The runtime loader and atlas URL carry a build query for cache
  refresh. Check `astral_scenery_sim.js` and `ascension_scene_sim.js`.

- **New endgame map study (dev-only):** `tools/map_scene_preview.html`,
  `tools/maps/endgame-scenes.js`; see [scenery development](../tools/maps/README.md).
  One connected Astral bridge with four inspection zones, organic Thor fields
  and the preserved circular Thor boss;
  `tools/map_scene_review.html` compares actual captures. Not playable maps.
  Checks: `endgame_scenery_sim.js`, `map_scene_review_sim.js`, `map_proposal_sim.js` and
  `tools/check_endgame_scenery_browser.js`.

- **Continuous map journey (dev-only):** `tools/map_journey.html`,
  `tools/maps/journey-{state,details,hero,navigation}.js` and `mob-catalog.json`. Native character
  travel, camera follow and independent Astral small-detail overlay; Thor base
  scenery untouched. Mobs are source-pending placement plans, not animations.
  Checks: `map_journey_sim.js` and `tools/check_map_journey_browser.js`.

- `tools/skill-fx-proposals/applied-fx-review.html`: native-sprite before/after
  preview of the previous V8 baseline and applied effects. It opens with the eight
  redone skills; Show → All 75 effects restores the full roster.
- `tools/skill-fx-proposals/skill-fx-compare.html`: V7/V8 comparison and per-skill
  choice editor, backed by `skill-fx-compare.js`. Exports a versioned JSON code
  with source hashes, stable skill IDs, explicit choices and notes; import validates
  the whole report before replacing local review progress. Passives have no FX choice.
  Serve through the static preview; set `PREVIEW_PAGE` to this path to open it at `/`.

- `tools/dev_server.js`: built static site plus actual API handlers and a SQLite
  D1 shim. Local development only, not the Cloudflare production runtime. `/phone`
  serves `tools/phone_preview.html` — the game inside a phone-sized frame, for reviewing
  the small-screen layout in a desktop browser (`?d=se|13|max|pixel|galaxy|mini`,
  `&o=landscape`). That page stays out of `dist/` on purpose.
- `tools/preview_server.py`: game and dev-only art/effect pages; see
  [tool directory](../TOOLS-START-HERE.md) for routes.
- `assets/ui/mobile.css` + `assets/ui/mobile.js`: the phone and small-tablet layout. `mobile.js` runs before the game
  script, puts `pg-mobile`/`pg-focus` on `<html>` and exposes `window.PGMobile`; every selector in `mobile.css` is
  scoped to those classes, so the desk layout cannot be affected. Do not add phone rules to the middle of
  `assets/ui/eclipse.css` - its late `<=700px` blocks would override them.
- `tools/tests/helpers/game.js`: jsdom/Three harness with a WebGL renderer stub.
- `tools/check_*_browser.js`: task-specific browser checks. Read their required
  server URLs and fixtures before running; they are not all one generic gate.
- `Updates/`, [update log](UPDATE-LOG.md) and `docs/history/`
  ([agent notes](history/AGENT-NOTES.md), the
  [archived read-me](history/READ-ME-FIRST-archive.md),
  [archived ASPD/movement research](history/aspd-research-2026-10-13/README.md))
  contain history and proposals alongside reference assets. A retained proposal
  does not prove that feature is live.

Environment-only lossless delivery for the dev journey is generated by
`tools/maps/build_runtime_textures.py` into `tools/maps/textures/runtime-manifest.json`
and content-hashed WebP copies. `journey-materials.js` caches destination-specific
loads. Check `map_delivery_sim.js` and the journey browser audit; do not apply this
pipeline to native sprites/metadata. See [cloud data](CLOUD-DATA.md) for current
published bytes versus requested resources and API/database load.

Class Tree (v179): `V.job()` defaults to a current five-node path whose cards
use `ACT.job` and the existing advancement/trial gates. `jobview` switches to the
full 25-node overview; `ACT.selk` inspects there. `V.skills` renders `rotationBar`
before composition; `arrangePanel` moves it above the skill catalog without
mutating saves. Check `progression_refresh_sim.js`, `eclipse_ui_sim.js` and
`panel_layout_smoke.js`.

`assets/fourth-jobs.js` uses the shared bounded native component loader with
six class routes and `assets/wardrobe/fourth/v1/`. The earlier nineteen-class pack
remains at `assets/wardrobe/v5/`. `tools/build_wardrobe_collection.py --fourth-jobs`
packs original exports; fourth-source/preview manifests and
`prepare_fourth_previews.py` preserve provenance. The former fixed composite pack
is retained locally as proof input and excluded from publishing. See
`tools/native-wardrobe/README.md`; run `fourth_job_runtime_sim.js`,
`wardrobe_game_sim.js`, `fourth_wardrobe_baseline.py` and the native layer audit.

Ascension v162: `ascensionCandidates`, `transformToMythic` and `ascensionForgePanel` implement owned-item evolution. `makeMythicEquipment` is reserved for GM gifts. `startAstralJourney` / `tickAstralJourney` / `cancelAstralJourney` own continuous bridge travel. v163 activates the approved progression tracks.

Ascension v163: `ASC_XP_BASE`, `ASC_REWARD_VERSION`, `ASC_STATS`, `ASC_UPGRADES`, `cleanAscension`, `gainAscension`,
`allocateAscension`, `resetAscension` and `ascensionProgressPanel` own the two
tracks, class presets and UI. `ascSkillVariant` / `ascCooldown` / `ascDamage`
feed existing combat; `resetSkillRuntime` cancels transient effects. `farmSample`
marks the current reward version (4 in v165); `applyOfflineProgress` credits the saved source class.
`ascRewardRatio`, `fieldExpReward` and `fieldZenyReward` share online/away rewards.
In v165 only EXP uses HP scaling; Zeny uses matching Abyss regular/MVP per-kill rewards plus 5–10%.
Check `ascension_tracks_sim.js`, `ascension_combat_sim.js`,
`ascension_rewards_sim.js` alongside offline, save/owner/cloud, skill/combo,
combat/stat/economy, map and UI suites.

Handbook (v175): `handbook`, `beginnerGuide`, `levelingGuide`, `buildGuide` and
`ascensionGuide` render the five Guide chapters. `guideSources` reads `fieldOf`
for actual monsters, equipment and card chances; `CARD_CATALOG` supplies effects
and slot compatibility. Level bands are recommendations, while `classBlock`,
`NMLV`, `canTravel`, `ASC_STATS` and the current combat/economy helpers define
unlock rules. `maybeGuide` runs after session initialization and fourth-job changes;
`S.handbook` stores completion and step positions in the existing account save.
Tours can be dismissed or replayed without changing progression. Validate with
`guide_sim.js`, `panel_layout_smoke.js`, save/owner, class-change and job-rite suites.

Handbook v176: `guideBuildPlan`, `guideTierPlan` and `guideMythicTargets` supply
visible goal/tier recommendations and Forge links. `guideFinderSync` owns the
first-guide close → More → Guide hint, keyed to the current state object;
`S.handbook.findGuide` saves completion. Existing menu/panel redraws update the
highlight, and desktop/mobile resize/scroll events reposition it.

Ascension v191: `ascensionCombatStats` halves only stage-5 escort HP while retaining
boss HP and all ATK. `spawn` gives Ascension bosses +10 field HIT (50 total), while
`minionDef` keeps +15 (45 total). `ascZenyBonus` raises all stage/enemy payouts by
30% on top of `ascZenyLadder`, the original per-stage ladder (v214 restored it). `ASC_THOR_ZENY`
(1.4) multiplies map 11 only, so Thor Volcano pays 40% more than it used to and Astral is
unchanged; that one constant is the Thor Zeny dial. `ASC_REWARD_VERSION=6` invalidates stale Ascension income at load/claim.
Cover these boundaries with `ascension_progression_sim.js`,
`ascension_rewards_sim.js`, `ascension_tracks_sim.js`, `combat_damage_sim.js`,
`offline_sim.js` and `job_rite_sim.js`.

### Ascension drop and scroll exchanges (v192)

`ascensionDrops` supplies online/offline material rolls. v212: `ascMaterialChance` and
`ascSigilChance` scale `ASC_MAT_CH` (0.5%) and `ASC_SIGIL_CH` (0.125%) by the monster's
max HP against `ascDropIndex`'s Astral Stage 1 anchor, so every stage pays the same
materials an hour; update the map card, the handbook and both sims if those constants move. `buyMythicScroll` handles
the Black Market Sigil exchange through `ACT.buymythicscroll`; `TRIAL_STORE` and
`trialBuy` handle the Echo `mscroll` entry. Both purchases credit `S.mythicScrolls`.
`ascension_drop_shop_sim.js` covers probability boundaries, currencies, purchase
gates, both Echo entry points, persistence and refinement consumption.

### Saved outdoor field activation (v196)

The new outdoor renderer is parked behind `NATIVE_FIELDS_DEFAULT=false` in
`index.html`; `?nativeFields=1` enables a session preview. The in-game Display switch
is labelled **GM preview: New outdoor terrain (reloads)** and is rendered/handled only for
GM/owner accounts (`S.gm`); normal players do not see it. `tools/preview_server.py` serves **the game** with the constant
flipped ON, so the review preview shows the new fields without a query string; `?nativeFields=0`
there still gives the classic maps. Original kit maps are
the default and download no outdoor field geometry/textures. Monster atlases
remain independent. See [activation/rollback handoff](NATIVE-FIELDS-HANDOFF.md).

World/Whisper/Local chat and social plaza (v203): `assets/social.js`,
`assets/social-scene.js`, `assets/social-rules.js`, `assets/social-poker.js`, `functions/api/social.js`,
`workers/social/`; see [Social hub](SOCIAL-HUB.md) for architecture, deployment and
checks (`social_poker_sim.js`, `social_table_chat_sim.js`, `social_ledger_sim.js`). The independent scene leaves the real farming simulation running. Since
v225 the validated look also carries `lv` (field level aura) and `speed` (field run
speed); `PGSocialRules.walkSpeed` clamps and advances every player with it, and the
plaza reuses `buildLevelAura`/`LEVEL_AURAS` for the Base 50/99/150 sigil.

Recovery (v263): the write pause is a separate Worker, `workers/gate/`, holding one
Durable Object with no D1 binding. A D1 Time Travel restore overwrites the database
in place, so a pause flag stored in D1 would be rolled back by the restore it guards;
this one cannot be. `functions/api/_middleware.js` and `functions/api/gate.js` resolve the `GATE`
`DurableObjectNamespace` through `functions/_lib/gate-binding.js`, admit every `/api`
request while `WRITE_GATE = "required"`, and refuse everything (reads included —
`GET /api/save` writes) unless the answer is "open". `tools/recovery/write_gate.mjs`
is the owner's close/seal/open tool: see [Recovery](RECOVERY.md) and
[ENABLE-WRITE-PAUSE.md](ENABLE-WRITE-PAUSE.md).

Cash Shop (v215): `assets/shop-catalog.js` is the single price list, imported by the
Pages Functions the same way `workers/social` imports `assets/social-rules.js`, so
the game and the server can never disagree on a price. Ownership is server-side
(`entitlements`); `PUT /api/save` refuses a look wearing an unowned cosmetic and
the client strips it. With no `STRIPE_SECRET_KEY` the shop is browse-only;
`node tools/dev_server.js --fake-payments` rehearses purchases without Stripe. See
[Cash Shop setup](MONETIZATION-SETUP.md).
