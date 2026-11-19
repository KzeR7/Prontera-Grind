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
| Skill and pet-buff artwork | `assets/skill-icons.js`, `assets/skill-icons-expanded.js`, `assets/skill-icons/`, `assets/expanded-skill-icons/`; `tools/native-skill-icons/` and `tools/build_expanded_icon_assets.py` | source crop audit and generator `--check`; `expanded_roster_sim.js`, `display_polish_sim.js`, `tools/check_skill_pets_browser.js` |
| Mastery titles and field skill buffs | `assets/mastery-titles.js`, `assets/title-symbols/`, `assets/player-buffs.js`, `assets/ui/mastery-titles.css`; `index.html`: `repairMastery`, `equippedMasteryTitle`, `renderTitleCollection`, `playerBuffSnapshot`, `placeHudBuffs`; `assets/social.js` and `assets/social-scene.js` reuse the existing look transport | `mastery_titles_buffs_sim.js`, `ui_sim.js`, `social_scene_sim.js`, `save_load_sim.js`, `publish_sim.js`, `tools/check_mastery_titles_browser.cjs`; focused preview: `PREVIEW_PAGE=tools/mastery_update_preview.html python3 tools/preview_server.py 8000` |
| DigiPet and fishing title artwork | `assets/social-title-art.js`, `assets/social-title-icons/`, `assets/social.js`, `assets/social-fishing.js`, `assets/social-scene.js`; unbacked plaza labels and mastery-symbol alpha filter in `assets/social.css`; complete sheets, crop map and generator instructions in `tools/social-title-icons/` | `social_title_art_sim.js`, `digimon_sanctuary_ui_sim.js`, `social_fishing_sim.js`, `social_scene_sim.js`, `publish_sim.js`, `tools/check_social_title_art_browser.cjs` |
| Boss skill effects (MVP signature moves) | `assets/boss-fx.js`: `PGBossFx` (the `BOSSES` roster with `life`/`choreo` screen-time and `TIER.fadeAt`, `SKILLS`, `create`, `paint`, `draw`, `skillsOfMap`); `index.html`: `bossSkillLayer`, `tickBossSkill`, `castBossSkill`, `syncBossSkillFx`, `resetBossSkill`, `BOSS_CAST_MIN/MAX` | `boss_fx_sim.js`; interactive review at `/bossfx` (`tools/boss_fx_preview.html`); timing notes in `Updates/boss-skill-fx/README.md` |
| Skill casting effects | `assets/expanded-fx/approved.js` routes reviewed expanded-class FX and hybrids, alongside `assets/skill-overdrive.js`, `assets/skill-afterglow.js`, generated `assets/afterglow-animations.js` and `assets/skill-materials.js`; `index.html`: `playSkillFx`, `tickSkillFx`, `syncSkillFx`; interactive review at `tools/skill-fx-proposals/prismatic-overdrive.html` | `overdrive_sim.js`, `overdrive_preview_sim.js`, `afterglow_sim.js`, `skill_sim.js`; `python3 tools/build_afterglow.py --check` |
| Panels, buttons and hotkeys | `index.html`: `V`, `ACT`, `TABS`, `SIDE_TABS`; `assets/ui/` and wardrobe UI module | `ui_sim.js`, `panel_layout_smoke.js`, `eclipse_ui_sim.js`, `mail_roulette_ui_sim.js` |
| Small-screen / phone shell (fullscreen maximizes the portrait view; no orientation lock) | `assets/ui/mobile.js` (`window.PGMobile`: layout detection, `html.pg-mobile`, rail sheet, field-only, `toggleFullscreen`), `assets/ui/mobile.css` (the whole phone shell, scoped to `html.pg-mobile` and loaded after `eclipse.css`), `index.html`: `#pgQuests`, `#pgScrim`, `#fsBtn`, `#pgFocusBtn`, `screenOptions()` phone block | `mobile_layout_sim.js`, `eclipse_ui_sim.js`, `ui_sim.js`, `panel_layout_smoke.js` |
| Page interaction: selection, right-click, image drag | `index.html`: `isTextField`; the document `contextmenu` / capture-phase `dragstart` listeners; the `user-select` and `-webkit-touch-callout` rules on `*,*::before,*::after` with the text-field exception | `interaction_guard_sim.js` |
| Cash Shop (Stripe Checkout, cosmetics + supplies + the donor tier) | `assets/shop-catalog.js` (the price list, shared; `DONATIONS` holds `don:all-cosmetics` and its floor/step/ceiling), `assets/shop.js` (the Donations view and the amount box), `assets/shop.css`; `functions/_lib/shop.js`, `functions/api/shop/{catalog,checkout,order,webhook}.js`, `functions/api/gm/shop.js`, `migrations/0005_shop.sql`; `functions/api/save.js` (`lockedCosmetics`), `assets/wardrobe-ui.js` (`wardrobeLocked`), `gm.html` (Cash Shop tab) | `shop_api_sim.js`, `shop_sim.js`, `dev_server_sim.js`; setup and donation rules in [MONETIZATION-SETUP.md](MONETIZATION-SETUP.md) §10b |
| Friends (haven-v273) | `assets/friends.js`, `assets/friends.css` (More ▸ Friends panel), `assets/social.js` (`Add friend` in the name menu, `★` marks, `syncFriends`), `functions/_lib/friends.js`, `functions/api/friends.js`, `migrations/0012_friends.sql`, `workers/social/room.mjs` (per-viewer `friend` flag); save-clock badge through `dot('friends')` in `index.html` | `friends_sim.js`, `friends_ui_sim.js`, `social_sim.js`, `social_ui_sim.js`, `social_api_sim.mjs`, `social_worker_sim.mjs`; see [Social hub](SOCIAL-HUB.md#friends-haven-v273) |
| Plaza fishing (haven-v287, economy/index/auto haven-v288, public rigs/titles/bag tiers haven-v295, art drop haven-v302, MVP roster haven-v407) | `assets/social-fishing.js` (`PGSocialFishing`: 100-species catalog across 25 painted body plans + catch rates, 7 mutations, Fishcoin economy with rods/bait, cast rating, reel physics, auto-fishing, draggable dock + tabbed Bag/Index/Shop/Titles window, bag tiers, twenty fishing titles, painted rods with tier auras, 146 cropped species out of a 155-species catalog + candy painter for nine (v303), a per-tier glow on the rod held in the plaza (v300), soft rod gates + fully random catches + gear-aware Index odds (v304/v305: `ROD_GATE`, `rodCeiling`, `GATE_ESCAPE`, `tierShares`, `rateWith`), `parseShowOff`, `S.fishing` persistence; v407: ten owner-cropped MVP bosses (`mvp_tidewarden` … `mvp_stormcoil`, Tideforged Warden … Stormcoil Leviathan) at the 512 px pond contract, 1,000–3,000 kg, `MANIFEST.json` + `FISH_ART` + `FISH_ART_VERSION`, spawn pool in `workers/social/room.mjs` `FISHING_MVP_IDS`), `assets/social-fishing.css`, `assets/social-rules.js` (`PONDS` (one 38 × 60 north–south, irregular west lake shifted west and extended south), `POND_FALLS`, `POND_PROPS` + `CHAIRS`, `onBridge` and walkable/SEATS), `assets/social-scene.js` (pond water/fish/bobber rig, pond chairs, v304 pond garden: coping ring, arch bridge, boulder cascade with an animated sheet, lanterns, blossom trees, `scene.fishing` incl. `showFish` overhead show-off sprites with a weight label, `setRig` for other anglers, pond-click callback), `assets/social.js` (`🎣 Fishing` toolbar button, `bindFishing`, `showoff`/`rig` relay wiring, `onLocalMessage` legacy hook, `huntTitleName`/`fishingTitleName`, `confirmFishingStop` leave-warning, `pushFishNote` Local announcements), `index.html` (`S.fishing` defaults + load sanitizer incl. coins/rods/bait/bagTier/title) | `social_fishing_sim.js` (core, scene rig and the window's tabs), `social_sim.js` (rig broadcast, show-off relay, resume windows), `social_scene_sim.js`, `update_watch_sim.js`; see [Social hub](SOCIAL-HUB.md#ponds-public-rigs-titles-and-the-afk-spawn-fix-haven-v295), [owner fixes after v295](SOCIAL-HUB.md#owner-fixes-after-v295-haven-v296) [v297](SOCIAL-HUB.md#a-hundred-species-pond-giants-and-quiet-exits-haven-v297) [v299](SOCIAL-HUB.md#twenty-titles-rod-auras-no-doubled-show-offs-haven-v299) [v300](SOCIAL-HUB.md#the-rod-you-hold-glows-in-its-own-colour-haven-v300) [v302](SOCIAL-HUB.md#whales-honest-prices-harder-titles-and-an-afk-walk-that-works-haven-v303) |
| Seeded plaza regulars (haven-v406) | `assets/plaza-bots.js` (UMD: mulberry32 `buildRoster`/`segmentAt`/`stateAt`, walk/idle/seat/fish segment schedule over `R.walkable` ring waypoints with every rest a 10–20 min stay and one emote per stay, `buildDigiSpots()` corridor hang by the DigiPet NPCs, `fastPath` typed-array BFS verified equal to social-rules `path()`), `assets/social.js` (`plazaBots*` glue: scene-only push that never touches `app.players`, seat-yield stand-aside, `R.EMOTIONS` bubbles, tick rides the existing session `setInterval`, `resetPlayers()` resync, Close-only `playerMenu` guard), `workers/social/room.mjs` (`bots:{seed,at,count}` stamped on the existing join snapshot, memoized `botSeed`, `PLAZA_BOT_COUNT=6` dial), `index.html` (`assets/plaza-bots.js?v=406`) | `plaza_bots_sim.js`, `social_sim.js`, `social_ui_sim.js`, `social_scene_sim.js`, `update_watch_sim.js` (now pins the new tag); see [Social hub](SOCIAL-HUB.md#seeded-plaza-regulars-haven-v406) |
| Browser saves, login, cloud sync, away rewards | `index.html`: `fresh`, `load`, `save`, `saveKey`, `CLOUD`, `offlinePlan`, `packSave` / `unpackSave`; mirrored wire codec in `functions/_lib/save-codec.js`, format negotiation in `_lib/validate.js`; [save format](CLOUD-DATA.md#the-stored-save-format-haven-v415--__v-4) | `save_load_sim.js`, `save_owner_sim.js`, `cloud_sim.js`, `offline_sim.js`, `migration_sim.js`, `save_max_state_sim.mjs`, `save_codec_*_sim.*` |
| API accounts, sessions and saves | `functions/api/`, `functions/_lib/auth.js`, `functions/_lib/db.js` (`startVerifiedSession` — one live session per account, enforced in the same transaction as the insert), `functions/_lib/validate.js`; the kicked-device dialog `#sessionGate`, `cloudSessionReplaced()`, and the fast `cloudSessionTick()` /api/me probe in `index.html` | `api_sim.js`, `registration_sim.js`, `cloud_sim.js`, `dev_server_sim.js` |
| GM console and grants | `gm.html` (own `@media(max-width:820px)` phone block since v274: one column, no nested scroller, 40px targets, players as one line each below 480px, `closeDetail()`; v407 flag review: `data-act="flagclear"` / `data-act="flagreopen"`), `functions/api/gm/`, `functions/api/grants.js`, `functions/_lib/gm-tools.js`, save-audit review in `functions/api/gm/damage.js` POST + `db.clearSaveAlert`/`reopenSaveAlert` (migration `0016_save_alert_review.sql`: `cleared_at`/`cleared_by`, reopens on a re-fire) | `gm_console_sim.js`, `gm_tools_sim.js`, `gm_auth_sim.js`, `api_sim.js` |
| Mail, daily roulette and shared buffs | `index.html`: `renderMailView`, `rdReaderMarkup`, `renderDailyRouletteView`, `renderDailyRouletteWheelSvg`, `renderGmStudioView`, `gmSendMailAnnouncement`, `dailyEffectTilesHTML`, `updateMailDailyHud`; styling in `assets/ui/eclipse.css`; v407 gift campaigns: `functions/api/gm/announcements.js` + `db.openAnnouncementGiftCampaign`/`claimAnnouncementGiftsFor` (migration `0017_announcement_gifts.sql`), replayed at registration so a letter's gift reaches accounts created later | `mail_roulette_ui_sim.js`, `eclipse_ui_sim.js`, `display_polish_sim.js`, `api_sim.js` |
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
- **Expanded roster (haven-v408):** the 20 extra classes live in `CDX`/`CD4X` and their
  skills in `SKILLSX` (`index.html`), apart from the shipped `CD`/`CD4`/`SKILLS4`, so the
  Wardrobe, class-skin and balance fixtures still enumerate the original 25. `EXPANDED_LINE`
  is the membership test; `hasLv150ThirdClass()` is the unlock. Bodies (haven-v409) are
  native RO client sprites rendered by `tools/make_expanded_pack.py` with the SPR/ACT reader
  in `tools/native-expanded/` (sources pinned by git blob id + SHA-256 in
  `source-manifest.json`, downloaded to `.cache/`) into `assets/sprite-pack-x/` (one
  lossless WebP per body in 126×134 cells plus `index.js`) and fetched one body at a time
  by `requestExpandedBody()`; `packTex()` reads `rec.cell` and the optional head column in
  an anchor. Their weapon families (spear, book, knuckle, instrument, whip, shuriken, gun)
  are kin of shipped families: `WEAPON_KIN`, `kinDrop()`, `kinWeaponName()` next to `GEAR`.
  `kinDrop()` takes the map it is resolving for: on a Nightmare map it never names a new-family
  N+ (that only exists on Ascension), handing over `nmNItem()` - the family's own section-4
  piece, named for the map being farmed - instead.
  Since haven-v417 they are also real items: the Nightmare rows (sections 4-5) of every map
  carry the families that map trains (`NM_NEW_FAMILY`, `NM_FAMILY_BY_MAP`, `nmRowNew`), and the
  two Ascension maps have shelves of their own (`ASC_GEAR_ASTRAL`, `ASC_GEAR_THOR`, read by
  `gearPool`). Sections 0-3 are untouched, so the shipped pools and rates did not move.
  Damage budgets sit at the top of `SKILL_TUNING` and are
  recorded in `tools/tests/fixtures/expanded_skill_budget.json`. Skills borrow a shipped
  icon (`icon`) and cast effect (`fx`); `tools/tests/expanded_roster_sim.js` covers the lot.
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

`assets/signature-fx.js` (`PGSignatureFx`) paints the signature skill effects of the expanded roster
(Asura Strike's kanji, Crazy Weed, bottles, plants, Spirit Spheres, coins, shuriken, revolver fire)
on top of the shared effect. `playSkillFx` calls `play(id, ctx)`, `tickSkillFx` calls `tick(dt)`;
the skill-to-effect table is `MAP` at the bottom of the file. Test: `tools/tests/signature_fx_sim.js`.
haven-v412: effects that exist in the Ragnarok Online client are flipbooks in `assets/ro-fx/` (`index.js` = `window.RO_FX`), baked by `tools/make_ro_fx.py` from the sources pinned in `tools/native-expanded/fx-source-manifest.json`; a `MAP` step `['book',{book:key,...}]` plays one.
Signature skills (`core`), `autocast` rows (`AUTOCAST_SOURCES`, `autocastProc`), the Auto-fill table `COMBO_PLAN`, `bossPower` and `shock` are documented where they are declared, just above `GROUND_SKILLS` in `index.html`. Test: `tools/tests/signature_skills_sim.js`.

`assets/expanded-jobs.js` (`PGExpandedJobs`) is the Wardrobe store for the 22 expanded classes:
bodies from `assets/wardrobe/expanded/v1/` (built by `tools/make_expanded_wardrobe.py`), hair and
accessories read in place from `assets/wardrobe/v5/` and `assets/social/sitting/` and moved onto
each body by `Store.route()`. Sources and method: `tools/native-expanded/README.md`.

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

First Adventure (v427): `assets/adventure-guide.js` owns the non-modal beginner journey,
`S.handbook.adventure`, action-driven milestones and `adventureHandbook()`;
`assets/adventure-guide.css` owns the companion and roadmap. `maybeGuide()` delegates
fresh accounts to `adventureMaybeGuide()`, `kill()` reports only live victories, and
existing `bars()`/`renderWin()`/plaza `mapTick()` refresh the presentation. No new timer
or multiplayer messages. `adventure_guide_sim.js` covers account/legacy/future saves,
real-action gates and class-switch milestone retention. `tools/check_adventure_browser.cjs`
rehearses real registration, relogin, town → field, combat and UI actions at desktop/phone
sizes in Chromium and Firefox against the built disposable preview.

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

### Digimon Sanctuary foundation (haven-v326)

`assets/social-digimon.js` renders the four fixed-view companions from the small
`assets/digimon/v1` pack (generated by `tools/digimon/build_pack.py`); the plaza
selector and `digimonPartner` save field live in `assets/social.js` and are
separate from Ragnarok pets. `assets/social-rules.js` defines the two open pads
and validates IDs; `assets/social-scene.js` draws them and the companions;
`workers/social/room.mjs` relays the optional presentation ID. This is not a
care, evolution or battle implementation. See [Social hub](SOCIAL-HUB.md#digimon-sanctuary-foundation-haven-v326)
and `tools/tests/social_digimon_sim.js`.

`haven-v327`: `assets/social-digimon.js` also owns the independent cosmetic
breadcrumb follower and distance-based walk phase; `assets/social-scene.js`
advances one follower per visible player. `assets/social.js` and
`assets/social.css` contain the Sanctuary companion window, still backed by the
same `digimonPartner` choice. See `social_digimon_sim.js` and `social_ui_sim.js`.

`haven-v328`: `assets/digimon-sanctuary.js` defines separate casual saved
care/training/mastery/evolution and turn-based no-stakes solo spars. The Social
UI hosts the controls, `assets/social-rules.js` shares new scenery collision and
16 display IDs, and `assets/social-scene.js` renders the textured grounds and
stage-sized followers. Art packing and generated floor sources are in
`tools/digimon`; `digimon_sanctuary_sim.js` and `social_digimon_sim.js` cover
rules, paths and atlas bounds.

**Plaza loot (v393):** `plazaLootTick()` pays cards/gear/ore/materials at the **measured** `income.kph`
by replaying kills through `offlineAwardKill(mob,{measured:true,noKillCount:true})` — the away claim's
own path, which pays loot and zero rate. EXP/Zeny stay on `plazaAfkTick`'s single payment. `noKillCount`
is load-bearing: `/api/save` learns the away rate from `publicFields().kills`, so a plaza that grew
`S.kills` would mint a second pay on reconnect. Never gate plaza drops on `OFFLINE_RATE_CAP`; it is a
corrupted-save ceiling and 30,000/h would pay ~45 cards an hour.

**Who is allowed to halt the simulation (v392):** `CLOUD.lost` does not stop the plaza. `loop()`,
`bgTick()` and `simWorker.onmessage` guard on `CLOUD.lost&&!plazaEarningWhileAway()`, and
`plazaEarningWhileAway()` is `social-open && !!plazaFarmIncome()`. The plaza may replay a rate that was
measured **before** the drop because that rate is capped by its 60 s measurement; field combat is live and
stays halted at exactly 0. `CLOUD.gate`/`CLOUD.paused` **do** stop the plaza (the number would not be
trusted on reconnect), and `farmSamplingPaused()` keeps `CLOUD.lost` — nothing is *measured* while
awaiting connection, only already-measured income is *paid*. If you add a new halt condition, ask which
side it belongs on: halting the *clock* is cheap to over-apply and expensive to notice.

**What a "field minute" is keyed to (v391):** `farmKey()` is `class:map` — **not** the stage. A stage
clears every `MPS` (15) kills, which at high level is ~15–28 s, so including it in the key restarted the
60 s measurement window before it could ever complete and the plaza was paid nothing (v391 bug). The
stage still lives in `farmStageKey()`, which is what gets stored in `S.offlineIncome.key` (three parts)
for the label and the offline-reward source. If you add anything that restarts sampling, key it on the
**map**, and remember `applyOfflineProgress`'s validator expects the three-part key.

**Who a measured minute may pay (v421):** the plaza side of that validator — `plazaFarmIncome()` —
also requires the key's class to be the current `S.cls`. The key always carried the class, but the
check used to accept any valid class *name*, so `changeClass()` let a fresh class idle in the plaza at
the old class's measured rate (EXP, Zeny, Job and the loot replay). The sample is deliberately NOT
cleared on a class change: the away claim is documented to keep using it until a full field minute
replaces it, and switching back to the class that earned it resumes its own plaza pay.

**Who a measured reward belongs to (v422):** class alone was not enough — a reset Novice is a new
character with the same name. Every measured minute now also carries the account id and a progression
run generation (`S.runSeq`/`S.runGen`; `snapClass()` records the run on `S.base[cls]` so a restored
class continues it), and both `plazaFarmIncome()` and the away-claim validator require all three to
match the character standing here (`incomeOwnedByCurrent()`). `changeClass()`/`logout()` settle the
outgoing class's pending plaza accrual through the normal earn path (`settlePlazaAfk()`); only
sub-unit remainders (less than one EXP/Zeny/Job and one loot kill) are dropped. Server claims freeze
the class and run they were priced for
(`offline_reward_claims.cls/run_gen`, migration 0018 — NULL means a legacy claim, payable as before),
and the smoothed kill rate re-bases to 0 across a class/run boundary so old-class speed never prices a
new character. `repairSave` adopts pre-ownership saves into generation 1, so migration erases nothing.
The fishing one-catch-per-spawn MVP marker persists in the save (`fishing.mvpCaught`, newest 32 ids)
instead of an in-memory Set that a reload wiped.

**Frozen offline entitlement state and timing (v423/v424):** `0019_offline_claim_pricing_snapshot.sql`
added the immutable pricing/source fields and issued interval fields. `0020_offline_claim_pricing_state.sql`
then classifies the historical rows once and adds `offline_reward_claims.pricing_state`: **`legacy`** is
the only old-row/local-sample recovery path, **`priced`** is a complete immutable snapshot,
**`ineligible`** is a newly issued, permanently zero-payout acknowledgement when no eligible minute
exists, and a state/field mismatch is reported to the client as **`corrupt`** and rejected. Before
0020, a no-state row is legacy only when every frozen snapshot field is absent; a complete 0019 row
remains `priced`, while even a partial frozen row is `corrupt` and cannot fall back to a later local
sample. New claim issuance verifies that 0020 exists only after an away interval qualifies; it does
not add a per-sync D1 read. A function-first rollout returns a retryable 503 for a qualifying new
claim until the schema is applied, before GET or PUT can advance its unpaid away baseline. Existing
pending claims remain readable/acknowledgeable, and active non-qualifying saves still work. Historical
rows with even interval-only frozen fragments are corrupt; only a completely absent snapshot may
use legacy recovery.

`functions/api/save.js` returns `pricingState`, `intervalStartAt`, `intervalEndAt`, and `serverNow`.
`applyOfflineProgress()` never reconstructs coverage from response-time `now - awayMs`: it validates
those immutable bounds first and maps `PAGE_BOOT_AT` to server time with the request-start timestamp
saved by `cloudFetch()`. A slow response, retry, reload or client/server clock offset therefore cannot
move an interval across page boot and consume a real payout. Suppression still protects a short window
actually covered by this running page; `CLOUD.gate` always disables suppression because the simulation
was frozen. A true legacy row without issued bounds is not coverage-suppressed: the client will not
invent a bound from response time, while the normal versioned acknowledgement still prevents replay.
These changes retain versioned exactly-once acknowledgement, retained-run ownership,
restore fences and the existing no-new-Social-DO-traffic model; they are not a broader reward-accounting
redesign.

**First return of a pre-run save (v426):** issuance adopts a stored save with neither run field into
generation 1, matching the client loader, and freezes its existing same-class minute. Missing sample
account/run stamps are inferred only for that old-save shape after the save's account ownership is
verified. Explicit foreign account/class/run stamps remain ineligible; modern untrained saves never
gain this legacy inference. A later replacement minute cannot reprice the first-return claim.

**Where the plaza's Field card gets its numbers (v390):** it prints the **measured** rate from
`plazaFarmIncome()` in `index.html`, never the `#expmin`/`#zenymin` HUD samplers. Those are live combat
readings that reset after `HUD_IDLE_RESET` (30 s) without a kill, so copying them made a paying plaza
read `0 EXP/min` to any player who stood still. If you add another rate readout, read the measured
value; the samplers answer "what am I killing right now", not "what will the plaza pay".

**Who owns a Sanctuary fight (v388, consolidated in v389):** solo DigiPet PvE is
entirely client-side. Party and PvP matches are *device-simulated*: the plaza
(`workers/social/room.mjs`) pairs the players, seeds the match, tells both
devices `startsAt` (the three-second countdown) and the same seed, and then steps
out — it does not tick the fight, does not stream strikes and pays **no** reward
of its own, so a plaza that also settled would double-pay every clear.
`armClientPvp` performs that hand-off inside the second accept, because v388
stopped arming the 1s battle alarm for these matches and a tick-driven hand-off
could therefore never fire. A fight no device reports is abandoned after
`CLIENTSIM_ABANDON_MS` (120s). Because these runs carry no server-built units,
every read of `partner`/`partners`/`enemies`/`earned`/`profile` needs a guard.

**Sanctuary redesign direction (2026-11-05):** the owner rejected the v328
layout and tab-based activity presentation. The authoritative requested direction
and recommended sequencing are recorded in
[Digimon Sanctuary live-world redesign roadmap](proposals/digimon-sanctuary-world-redesign-roadmap.md).
It is planning only; v328 code remains the current implementation until replaced.


### Sanctuary world foundation (haven-v329, partial)

The approved map footprint replaces both ponds with one west lake, a shared
walkable deck and a south cascade. `assets/social-rules.js` owns collision, seat
positions and bridge dimensions; `assets/social-scene.js` owns the raised deck
and preliminary east gym/field/ring scenery; `assets/social-fishing.js` avoids
casting onto the deck; `workers/social/room.mjs` repairs invalid old resumed
positions. The NPCs and on-map activity systems are not implemented yet. See
[redesign roadmap](proposals/digimon-sanctuary-world-redesign-roadmap.md).


### Curved sakura lake (haven-v330)

The owner corrected the v329 lake orientation and appearance: the shared
`pondRadius`, `pondBoundary`, `pondContains`, `pondDistance` and `clampPond`
rules describe a north–south, gently irregular oval. `assets/social-scene.js`
uses the same boundary for water geometry and shader, and paints an oak-toned
bridge and sakura around the banks. `assets/social-fishing.js` uses the curved
shape for distance and cast targets; bridge clicks still use the deck. The west
house at (−46, 16) and southwest garden were removed to fit the taller lake.


### South lake and restored garden (haven-v331)

The owner rejected v330's high, oval-looking lake because it displaced the
southwest tree. The lake is now centred at (−34, 66), with a broader irregular
38 × 46 outline, 18 sakura, the bridge at z 64, and a south-shore waterfall.
`pondRadius` and the water shader share the same rounded, asymmetrical shape;
collision, fishing and click tests follow it. The southwest garden and original
tree are restored. Shared `MIN_Z`/`MAX_Z` extend navigation south to 112 while
retaining the old northern and x limits. The scene's ground and north–south road
extend south accordingly; the Worker validates rig coordinates against shared
bounds, and old invalid resumes are recovered. The west house at (−46, 16) is
still absent. The east Sanctuary remains preliminary, not completed gameplay.


### Longer lake and bridge approaches (haven-v332)

The lake is centred at (−38, 73), nominally 38 × 60: its northern shore is
roughly unchanged while its southern end extends by about 13 units. The shared
bridge is taller (arch 2.9), with matching native stone paving from the main
road to the east landing and a rounded-ended path on the west bank. The 25
sakura avoid the approaches and the view of the southern waterfall. Its eight
seat IDs and restored garden remain. Ground and the north–south road extend
south, and `MAX_Z` is 126; x and north bounds remain unchanged. Ground depth
bias prevents long-distance water z-fighting. Shared bridge/shore rules, Worker
rig bounds and resume recovery continue to apply; Sanctuary gameplay is still
unfinished.


### Sanctuary buildings and centered bridge (haven-v333, visual phase)

`assets/social-scene.js` now builds a cutaway half-timber gym with four stat
station props, shingled roof, boardwalk, gated field fence, future food and
field-guide kiosks, trainer sign, outer native trees, and a ring with steps and
spectator seating. `assets/social-rules.js` defines matching gym walls, posts,
kiosk/sign barriers, field fence gates and outer-tree obstacles for client and
Worker; invalid old resumes are recovered. The bridge and both stone approaches
move to the lake center. The south waterfall is aligned with the actual lobe:
its flanking rocks rest on land and the splash enters water. The new roof source
and rebuild script are in `tools/digimon/`; boardwalk reuses the native kit.
This is a visual building pass, not a completed implementation of NPCs, live
world training, auto-PvE or authoritative PvP.

### Corrected east Sanctuary (haven-v334, visual phase)

`assets/social-rules.js` owns the asymmetric `MIN_X` / `MAX_X`, the south-east
Sanctuary pads, gym and stand barriers, `SANCTUARY_FENCES` segment collision
(including bevels/gaps), and `SANCTUARY_RING` canvas dimensions/height. The
Worker validates fishing rigs against the same explicit bounds. Scene geometry
in `assets/social-scene.js` renders the cutaway gabled gym and equipment,
three distinct future kiosks, angled plank walkway, gated meadow, ring and
bleachers; player and follower height uses the shared ring. The new material
sources and reproduction script are in `tools/digimon/`. This supersedes the
v333 placement and native-kit-boardwalk description above. `LIMIT` remains a
legacy value, not the eastern boundary. Live-world interactions remain absent.

### Sanctuary staff and art (haven-v335)

`assets/social-scene.js` builds the joined gym back wings, fills the shop strip
and renders five stationary NPCs with native `PGWardrobe` sprites, label/button
and raycast dialogue. They are client-side presentation and status dialogue,
not services or progression. Four explicitly decorative idle meadow residents
use the existing shared `PGSocialDigimon` atlas store. `SANCTUARY_TREES` in
`assets/social-rules.js` supplies shared obstacles; the rear-gym trees use a
CC0 sprite rather than the native tree model. CC0 sources and local reproduction
are documented in `tools/digimon/cc0-materials/README.md`. The lake and
competitive-authority requirements are unchanged.

### Timber gym and ring seating (haven-v336)

`assets/social-scene.js` places exposed half-timber grids outside both faces of
the gym side walls and the courtyard side of the rear wall. Side and rear roofs
stay over the perimeter, while the centre remains open. Rear woodland trees
use fixed upright planes, with the rear eave kept clear of their trunks. The
ring's two three-tier stands have individual planks, supports, rails and a
corner return; they are scenery, not interactive seats. The ring canvas uses
a small procedurally drawn texture. DOM staff/station labels are hidden when a
camera ray crosses a gym wall. `assets/social-rules.js` contains the extended
side-wall and stand-corner collision used by browser and Worker. Owner-specified
future training animations are recorded in the redesign roadmap, not implemented.

### Reference-led gym rebuild (haven-v337)

`assets/social-scene.js` replaces the v336 low, roof-dominated wings with two
separate taller timber/plaster wall sections, gabled front bays and a central
connector around an open exercise court. The inward roof slopes are deliberately
cut away while the outer pitched slopes, rafters, foundations, windows and
braces remain visible. Rear trees are existing `tree2` native field meshes,
with narrowed depth to avoid penetrating the wall and capped height below the
roof. `SANCTUARY_GYM_FENCES` in `assets/social-rules.js` shares the front-rail
collision with the Worker; the shortened side walls and end-bay openings have
matching barrier bounds. The earlier external 3D asset study is not used by
this runtime. Gym apparatus is still scenery, not live training.

* **Sanctuary gym correction (v338):** `assets/social-rules.js` exports the angled
  `SANCTUARY_GYM_WALLS` shared by collision and the scene; `assets/social-scene.js`
  builds the two rotated timber wings and broad outer roofs from those segments,
  and assembles level mitred ring stands. The social room and scene simulations
  exercise navigation, tree clearance, geometry and tier alignment.

* **Live gym first slice (v339):** `assets/social.js` owns the ephemeral local
  station session, proximity UI, approach, cancellation and completion;
  `assets/social-scene.js` renders the partner's per-stat poses and effects.
  `assets/digimon-sanctuary.js` validates and applies completed casual gains to
  the existing versioned save, without persisting a new offline timer. Training
  poses are not relayed to other plaza viewers and are not PvP authority.

* **Automatic gym partners (v340):** `assets/social.js` keeps the original
  `S.digimonPartner`/`S.digimonSanctuary` as slot one and adds independent
  `S.digimonPartner2`, `S.digimonSanctuary2` and `S.digimonActiveSlot`. Its
  ephemeral one-per-player controller repeats validated 20-minute completions
  while a cloud plaza socket remains live, including in the field. It cancels
  on logout/disconnection and discards uncompleted legacy saved timers on entry.
  `assets/digimon-sanctuary.js` adds client-saved XP/level; `social-rules.js`
  defines three positions per activity; `workers/social/room.mjs` reserves and
  broadcasts them, with request-scoped acknowledgements; `social-scene.js`
  renders independent training residents and the extra equipment. Neither XP nor
  stats are server-authoritative. Deploy client and Social Worker together.
  `tools/tests/social_gym_sim.js` covers room reservations and lifecycle;
  `social_ui_sim.js` covers auto-cycles, dual slots and cancellation/races.

* **Owned Sanctuary bag and Pet Coins (current):** `assets/digimon-sanctuary.js`
  owns the versioned `S.digimonBag` normalizer and atomic bag transactions. A
  new/companion-less save receives one starter egg and 50 Pet Coins; hatching
  uses the 48 bundled Baby I/Baby II forms without duplicates. `owned` contains
  save-line IDs, while the two existing partner fields and Sanctuary progress
  remain independent and are unioned into ownership during migration. `food`
  and `eggs` are pet-bag items; `coins` is not Zeny, Fishcoins, Chips or Cash
  Shop currency. `assets/social.js` renders the owned-only roster, Pet Bag and
  Cook Lina shop, consumes one Pet Meal per successful feed and grants the
  explicitly temporary local-spar reward once per win. `assets/social-scene.js`
  opens that shop from Cook Lina. `digimon_sanctuary_sim.js` and
  `digimon_sanctuary_ui_sim.js` cover migration, random-pool bounds,
  purchase/feed/reward failures and the fresh-account flow.

* **Live Sanctuary field and ring (v344):** `assets/digimon-battle.js` contains
  the shared clamped loadout, same-stage three-bot wave simulation, mutual
  acceptance, three-second countdown, automatic PvP rounds and stable reward
  tables. `workers/social/room.mjs` owns room membership, positions, random
  rolls, timers, wave/match IDs, cancellation and settlement; it ignores client
  result/reward packets. `workers/social/index.mjs` and
  `tools/social/dev-sockets.mjs` schedule battle ticks alongside the existing
  alarms/timers. `assets/social.js` sends only start/accept/stop intents,
  applies deduplicated server rewards to the original owned line, and renders
  the field HUD, acceptance dialog, countdown and animated result. In the
  v345 no-cloud Solo plaza it instead runs the shared simulator locally with
  owner/room `0`, `SOLO` labels and separate `solo-pve:` reward IDs; the gym
  likewise uses labeled local practice without a reservation. Account/state
  changes, leaving or connecting online stop that local run, and ring PvP
  remains online-only. Online start intents also block duplicate clicks and
  have a ten-second no-response recovery (plus leave/socket cleanup), so an
  older Worker that ignores battle packets cannot leave the client waiting
  forever. `assets/social-scene.js` roams decorative residents only
  while no PvE run is active, then renders independent partner/bot/ring sprites
  with health bars. `social-battle.css` supplies the responsive presentation.
  Existing gym, feeding, bag, Ragnarok-pet and Zeny boundaries are unchanged.
  Coverage: `digimon_battle_sim.js`, `sanctuary_battle_sim.js`, Solo/online
  `social_ui_sim.js`, the battle additions in `social_scene_sim.js`, and the
  real Solo/two-client browser rehearsals.

* **One activity panel, movable: gym and grind (v371):** `assets/social.js`
  now renders every "you are standing somewhere actionable" moment through a single
  `#sanctuaryActivityPanel` inside the plaza frame. `renderActivityPanel` picks the
  mode (`gym` at the gym, `pve` at the PvE farm) and — importantly — **renders its
  contents even while the panel is hidden**, so the document always carries the
  current action control (e.g. `[data-gym-stop]`) instead of dropping it. The panel
  drags by its `.sap-head`; the spot persists to `localStorage[pg_plaza_panel_pos]`,
  is clamped to the plaza bounds, and toggles `.is-moved` to release the centred
  `translateX(-50%)` default. Gym sessions are **5 minutes**
  (`G.DURATION = 5 * 60 * 1000` in `assets/digimon-sanctuary.js`). The footer carries
  the **"Keep repeating"** switch backed by the save (`S.plazaRepeat.gym`, default ON
  because auto-training always repeated, and `S.plazaRepeat.pve`, default OFF). The
  grind mode reuses the battle CTA (`#sanctuaryBattleNearby`, re-parented into the
  panel, 1.8 s after a completed/defeated `pve_end`); the gym mode lists all four
  stat buttons with the per-session countdown. Closing mutes the panel until
  proximity changes. `assets/social.css` owns the panel palette, the dragged
  `.is-moved` state, the countdown, 600px layout and the `html.pg-mobile`
  suppression of `#socialBgmMount` and the collapsed `#socialMiniMap` chip.
  `assets/bgm.js` refuses to build `Audio` or load the YouTube iframe on the phone
  shell (detected via `html.pg-mobile` plus the `pg-mobile-change` window event, so
  resizing stops playback without a reload), and `assets/ui/mobile.css` hides
  `#bgmPlayer` and swaps the desktop Settings -> Background music rows for a
  phone-only note (`.bgm-pc-only` / `.bgm-phone-note`). `index.html` wires the GM
  announcement studio description to the composer element (`#gmStudioBody` is the
  textarea; the wrapper is `#gmStudioPanel`) and makes the update watcher remember a
  hidden tab's new build instead of reloading it (`pendingUpdateBuild`, reapplied on
  `visibilitychange`). Suites: `social_ui_sim.js` (CSS hooks, drag, clamps, Stop
  button, keep-repeating switch, solo grind repeat), `bgm_sim.js` (phone sandbox with
  no Audio/YouTube), `update_watch_sim.js` (hidden-tab remember),
  `digimon_sanctuary_sim.js` / `digimon_sanctuary_ui_sim.js` (5-minute session),
  `eclipse_ui_sim.js` / `mail_roulette_ui_sim.js` (announcement description).

* **One tabbed DigiPet panel, per-activity partners, session logs, idle keep-alive (v372):**
  `assets/social.js` renders the field grind and the gym through a single movable
  `#sanctuaryActivityPanel` with a `Training | PvE grind | Logs` tab strip
  (`data-sap-tab`, `role=tablist`). Proximity opens the matching tab; a visible
  Logs tab is never auto-switched. Every activity keeps its own partner in the save
  (`S.plazaPartners.gym` / `.pve`, same normalize-on-read style as `S.plazaRepeat`):
  `activitySlot(kind)` resolves it with a fall-back to the followed partner, and
  `setActivitySlot` writes it with the same guards as the gym/PvE start flows
  (a slot mid-battle cannot be picked for the gym and vice versa; changing a
  running session's partner requires stopping it). `gymPanelPartner`,
  `battleProfileFor`, `pvePanelMarkup`, `battleNearbyFrame`, `repeatPveRun`,
  `startWorldTraining`, `trainingSlotBusy()` and `currentLook()` all take/resolve
  the per-activity slot instead of the followed one; the DigiPet partner grid and
  `assignPartner` no longer block the *followed* slot on battle — only the species
  change of a busy slot stays locked. Logs live in an in-memory ring
  (`ACTIVITY_LOG_MAX=40`, `pushActivityLog`) teed from `worldNotice` plus gym
  completions; no save-format change. The plaza socket keep-alive in `social.js`
  now pings unconditionally every 45 s (previously only while fishing/gym), and
  `workers/social/room.mjs` exempts fishing reservations (`c.fish` / `c.seat`)
  from the silence sweep (only `REAUTH_MS` claims them) and extends their
  disconnect resume record to `ACTIVITY_RESUME_MS=30 minutes`. `index.html`
  gates `maybeGuide` with a once-ever `<kind>Seen` marker in `S.handbook`, written
  on first player interaction (`guideStep`, `guidepage`, `escapeUI`), so the
  beginner/ascension tour never auto-opens again. Suites: `social_ui_sim.js`
  (tabs, parallel partners, follower switch mid-grind, Logs tab), `social_sim.js`
  (sweep exemption + REAUTH bound), `guide_sim.js` (tour-once contract).

* **Staged combat, activity dock and Fishing MVP pass (haven-v384):**
  `assets/social-scene.js` owns queued PvE presentation timing through `STAGE`,
  separate fighter lanes/contact/recoil/KO staging, the 512 px MVP pond texture and
  the clipped-corner bridge billboard. `assets/social.js`, `assets/social.css` and
  `assets/social-battle.css` own `#socialHudStack`, one `#digipetDock` chip per gym /
  PvE / PvP activity, panel lifecycle and the in-panel PvE action. Fishing odds and
  the 512 px crop manifest remain in `assets/social-fishing.js` and
  `tools/mvp_art_crop.py`. Coverage: `social_scene_sim.js`, `social_ui_sim.js`,
  `social_fishing_sim.js`; current behavior is detailed in
  [Social hub](SOCIAL-HUB.md#staged-digipet-fights-activity-dock-and-fishing-mvp-pass-haven-v384).

* **Persistent forms, compact gear and connected grind repeats (haven-v385):**
  `assets/digimon-sanctuary.js` owns Bag schema v3 (`gearAutoSell`), safe manual
  gear sale, 36 derived-progress titles and each partner's `unlocked` evolution
  forms plus `peakStage`. Dismissing a species removes it from `owned` but leaves
  its per-slot progression available for a later duplicate-protected hatch;
  `switchForm` changes only the active form/stage and retains the progression and
  form history. `assets/social.js` renders the kind-filtered icon inventory and
  side inspector, restores the best saved copy when a dismissed species returns,
  and keeps the Training/PvE panel selections independent from running-session
  ownership. A PvE run first started in the farm can grant a socket-scoped repeat
  permit in `workers/social/room.mjs`; only the same room, line, form, partner slot
  and mode may resume away from the farm, and Stop, leave, room switch or socket
  disconnect revokes it. `assets/social-fishing.js` records every landed catch in
  the Index/statistics before deciding whether a full bag can store it. Coverage:
  `digimon_sanctuary_sim.js`, `digimon_sanctuary_ui_sim.js`,
  `sanctuary_battle_sim.js`, `social_ui_sim.js`, `social_fishing_sim.js` and
  `social_worker_sim.mjs`.

* **Independent follower, Evo Points, party HUD (haven-v386):**
  `assets/social.js` keeps the plaza follower (`digimonActiveSlot`) separate from gym/PvE
  partner picks; gym start uses `activitySlot('gym')`. Bag `evoPoints` and `evoPointCost`
  in `assets/digimon-sanctuary.js` gate one-way evolution; `switchForm` is refused.
  `gearSellMatchingAuto` sells unequipped, unrefined Auto-sell tiers; refine max is +10.
  `assets/social-scene.js` scatters PvE homes by battle id, keeps a battling trainer's
  idle follower, and lowers/enlarges the MVP pond sprite. Party toast + HUD live in
  `assets/social.js` / `assets/social.css`. Coverage: `digimon_sanctuary_sim.js`,
  `digimon_sanctuary_ui_sim.js`, `digimon_battle_sim.js`, `social_scene_sim.js`,
  `social_ui_sim.js`.

* **Form switch + Evo Points, hub toggles (haven-v387):**
  `switchForm` is free among unlocked forms; `evolve` still spends `evoPoints`.
  Toolbar buttons toggle; Esc runs `closeAllHubOverlays`. Coverage:
  `digimon_sanctuary_sim.js`, `digimon_sanctuary_ui_sim.js`, `social_ui_sim.js`.
