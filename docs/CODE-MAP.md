# Code map

Paths are relative to the repository root. Search by the named symbol rather than
line number: `index.html` changes often. Inspect definitions and callers before
editing. Many tests execute extracted pieces of the real page.

## Find the right system

| Task | Implementation / search anchors | Useful checks |
| --- | --- | --- |
| Classes, promotion, saved builds | `index.html`: `CD`, `CLASSES`, `classBlock`, `changeClass`, `snapClass`, `noviceRun` | `class_change_sim.js`, `loadout_update_sim.js`, `save_load_sim.js` |
| Stats, Base/Job EXP and pacing | `index.html`: `statCap`, `totalPts`, `needAt`, `jneed`, `expRate`, `economy tuning`; `tools/tune_pacing.js` | `stat_sim.js`, `economy_sim.js`, `progression_sim.js` |
| Combat and skill execution | `index.html`: `SKILLS`, `heroStandoff`, `strike`, `tickCombatSkills`, `simAdvance`, `loop` | `skill_sim.js`, `skill_balance_sim.js`, `combat_damage_sim.js`, `attack_sync_sim.js`, `field_loop_smoke.js` |
| Gear, class eligibility, cards, autosell | `index.html`: `genGear`, `canUse`, `stowUnfit`, `equipRec`, `CARD_FITS` | `gear_sim.js`, `dual_wield_sim.js`, `card_sim.js`, `autosell_sim.js` |
| Map stages, scenery, Nightmare | `index.html`: `MAPS`, `fieldPlan`, `buildDeco`, `KIT_MAP` | `starter_sim.js`, `scene_sim.js`, `kit_sim.js`, `nightmare_sim.js` |
| Endless Echo | `index.html`: `TRIAL`, `TRIAL_PAY`, `TRIAL_STORE` | `trial_sim.js` |
| Pets and training | `index.html`: `PETS`, `petBuff`, `petR`; `assets/pets.js`, `assets/pets/v1/` | `pet_sim.js`, `pet_game_sim.js`, `pet_sprites_sim.js` |
| Wardrobe and native hero sprites | `assets/wardrobe.js`, `assets/wardrobe-ui.js`, `assets/wardrobe.css`, `assets/wardrobe/v5/`; `index.html`: `PGWardrobe` | `wardrobe_sim.js`, `wardrobe_game_sim.js`, native asset audits |
| Skill artwork | `assets/skill-icons.js`, `assets/skill-icons/`; `tools/native-skill-icons/` | source crop audit; `tools/check_skill_pets_browser.js` |
| Skill casting effects | `assets/skill-afterglow.js`, generated `assets/afterglow-animations.js`; `index.html`: `playSkillFx`, `tickSkillFx`, `syncSkillFx` | `afterglow_sim.js`, `skill_sim.js`; `python3 tools/build_afterglow.py --check` |
| Panels, buttons and hotkeys | `index.html`: `V`, `ACT`, `TABS`, `SIDE_TABS`; `assets/ui/` and wardrobe UI module | `ui_sim.js`, `panel_layout_smoke.js`, `eclipse_ui_sim.js` |
| Browser saves, login, cloud sync, away rewards | `index.html`: `fresh`, `load`, `save`, `saveKey`, `CLOUD`, `offlinePlan` | `save_load_sim.js`, `save_owner_sim.js`, `cloud_sim.js`, `offline_sim.js`, `migration_sim.js` |
| API accounts, sessions and saves | `functions/api/`, `functions/_lib/auth.js`, `functions/_lib/db.js`, `functions/_lib/validate.js` | `api_sim.js`, `registration_sim.js`, `dev_server_sim.js` |
| GM console and grants | `gm.html`, `functions/api/gm/`, `functions/api/grants.js`, `functions/_lib/gm-tools.js` | `gm_console_sim.js`, `gm_tools_sim.js`, `gm_auth_sim.js` |
| SQL and leaderboard | `migrations/`, `functions/api/board.js`, `functions/_lib/board.js` | `api_sim.js`, `leaderboard_sim.js` |
| Static publishing and routing | `tools/build_site.sh`, `wrangler.toml`, `_routes.json`, `.assetsignore` | `publish_sim.js` |

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

The owner's approved Canvas choreography lives in `tools/skill-fx-proposals/afterglow-v6.html`.
Run `python3 tools/build_afterglow.py` after changing that source. The generated runtime
excludes preview backgrounds, stand-ins, controls and the extra Venom Field concept.
`assets/skill-afterglow.js` projects cast positions onto one transparent battlefield
canvas. Local effects preserve uniform scale; traveling effects align the study's
caster/target anchors with the projected flight path. Their visual duration is 3.6
simulation seconds, independent of damage and cooldowns. The existing 28-effect cap
and lower particle detail on narrow screens/dense casts bound work. The original
Three renderer remains the fallback when the adapter is unavailable; its source
backup is under `tools/skill-fx-backups/pre-afterglow/`.

## Development helpers and historical material

- `tools/dev_server.js`: built static site plus actual API handlers and a SQLite
  D1 shim. Local development only, not the Cloudflare production runtime.
- `tools/preview_server.py`: game and dev-only art/effect pages; see
  [tool directory](../TOOLS-START-HERE.md) for routes.
- `tools/tests/helpers/game.js`: jsdom/Three harness with a WebGL renderer stub.
- `tools/check_*_browser.js`: task-specific browser checks. Read their required
  server URLs and fixtures before running; they are not all one generic gate.
- `Updates/`, `READ-ME-FIRST.md`, [update log](UPDATE-LOG.md) and
  [legacy notes](history/AGENT-NOTES.md) contain history and proposals alongside
  reference assets. A retained proposal does not prove that feature is live.
