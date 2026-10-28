# Development and testing

Run commands from the repository root. There is no root package manifest or lockfile;
this guide documents the commands, it does not assert your environment is ready.
Read the task's own setup instructions first and reuse installed tools.

Long per-build testing notes (v163–v215) are [archived](history/TESTING-version-notes.md);
the operative checklist is here.

## Dependencies

**Node.** Verified working on **Node 22.22.3** and previously pinned at Node 24. The
API/shop/social suites need `node:sqlite`, which is present from Node 22.5 (it prints an
`ExperimentalWarning`; that is not a failure). If a suite cannot resolve `node:sqlite`,
switch to Node 24 rather than skipping the suite.

**Optional local packages.** DOM and server integration suites need three packages,
installed in **one** command — with no `package.json`, installing one at a time deletes
the previous one:

```sh
npm install --no-save --package-lock=false jsdom three@0.128.0 ws
node -e "require('jsdom');require('three');require('ws');require('node:sqlite');console.log('test dependencies ready')"
```

`jsdom` + `three` are needed by anything that boots `index.html`; `ws` by anything that
loads `tools/dev_server.js` (`dev_server_sim.js`, `social_api_sim.mjs`). The game itself
needs no npm install.

**Python.** Sprite/asset checks need Python 3 with Pillow; the legacy pack pipeline also
needs numpy and scipy. Install only the selected pipeline's dependencies and follow its
README rather than reconstructing versions from an older handover.

**Git history.** A few suites read pinned historical revisions with `git show`
(`card_star_balance_sim.js` and `skill_balance_sim.js` use `d164bd0`). A shallow clone
must fetch them first or those suites fail with `Command failed: git show …`:

```sh
git fetch origin d164bd0527cfe335f9c183d0e576800716b7dd26
```

## Choose the preview for the task

### Game plus accounts, cloud saves and GM tools

```sh
bash tools/build_site.sh
node tools/dev_server.js
```

The default entry point is `http://localhost:8788/`. The server serves `dist/`, routes
actual API handlers through a local SQLite D1 shim and applies local migrations. Rebuild
`dist/` after changing client files; restart after changing API handlers (the server
caches imported modules).

For disposable GM testing use `node tools/dev_server.js --gm-all` and register a
synthetic account in that local instance — it grants owner access only there. The
database is in memory by default; `--db tools/.devdb/preview.sqlite` keeps local test
data across restarts. Do not change the shared GM password or use production credentials
for a preview. `--fake-payments` exercises the shop checkout without Stripe.

The shim does not prove Cloudflare CPU limits, real D1 behaviour or cookie behaviour on
the deployed host. For platform-specific changes use the Wrangler/D1 workflow in
`wrangler.toml` and the [deployment steps](../tools/cloudflare-deploy-steps.md). Never
run a remote migration or deploy as an incidental local check.

### Game and art/effect development pages

```sh
python3 tools/preview_server.py 8000
```

Open `http://localhost:8000/` for the game; the routes in
[TOOLS-START-HERE.md](../TOOLS-START-HERE.md) open the dev pages. This is a static/tool
preview, not the accounts API server. Do not use raw `file://` opens — fetching and APNG
decoding need HTTP. A platform may provide a different entry URL; use its preview URL.

## Before pushing

The gate is: the three generated-asset checks, every `*_sim.js` and every `*_smoke.js`.
Read the output, not just the exit code — a suite that prints a dependency skip and exits
0 has not passed.

**A wall of failures usually means the tools are not installed.** `node_modules` is not
kept between sandbox sessions, and 77 of the 136 suites load `jsdom`/`three`/`ws`; without
them you get dozens of `Cannot find module 'jsdom'` errors (and a few smokes that *skip and
exit 0*, which look like passes). Install the [dependencies](#dependencies) and re-run
before suspecting any code. Measured on 2026-10-26: the same commit went from **71 failures**
to **7** purely by installing them — so if the count is huge and spread across unrelated
systems, it is the environment, not the patch.

```sh
python3 tools/make_sprite_viewer.py --check
python3 tools/make_class_skins.py --check
python3 tools/make_weapon_pack.py --check
for t in tools/tests/*_sim.js; do node "$t" || exit 1; done
for t in tools/tests/*_smoke.js; do node "$t" || exit 1; done
```

### The known-red baseline (measured 2026-10-26)

136 checks: **129 pass, 7 fail.** Those seven fail identically on the untouched base
commit `ae3897d` (`main`), so they are a standing baseline, not something a new patch
broke. The gate is therefore **"no new failures, and no suite gets quieter"** — not "all
green", which this tree has not been since v221.

| suite | what it reports | why it is red |
| --- | --- | --- |
| `field_loop_smoke.js` | "a camp monster drifted off its camp ring" (8/9 steps) | camp-ring layout assertion no longer matches the spawn helper |
| `ground_combat_sim.js` | `assert(r.near<r.opening&&…)` | kiting movement windows; retune against the current combat loop |
| `rotation_updates_sim.js` | "expanded area stays within its camp" | area-expansion geometry vs. camp layout |
| `skill_redesign_sim.js` | `SyntaxError: Unterminated template` in an extracted span, plus a dash assertion | source-extraction anchor and dash behaviour both stale |
| `fourth_job_skills_sim.js` | strict deep-equal on a skill-id/slot sequence | fourth-job skill list moved past the fixture |
| `skill_balance_sim.js` | "gear measurements stale: rerun progression_balance.js" | historical measurement fixture, hash-pinned on purpose |
| `publish_sim.js` | 16/17, "existing runtime assets exceed their original 62.5 MiB budget" | the runtime asset budget was already over before v229. Re-measured 2026-10-28 at `74e1c0e`: the budgeted bucket is **62.79 MiB** (total 126.68 − native fields 54.97 − social 8.92), i.e. **0.29 MiB over**. Dev-only art was already taken out of `dist/` (152 KiB: `assets/mob_*.png`, `assets/weapons/**`, `weapons_manifest.json`), so what is left is feature code and fallback art — closing it means dropping the legacy class-skin fallback (`Updates/Sprite`, 5.7 MiB) or re-baselining the number, both an owner decision |

Rules for that table:

- Fixing one is welcome; **do not** delete the assertion, loosen the budget or re-hash a
  balance fixture to make a row disappear. `skill_balance_sim` hashes the combat source on
  purpose and `publish_sim`'s budget is the point of the check.
- If your change makes a row pass, or turns a green row red, say so explicitly in the
  handoff and in the update-log entry. A green row that goes red is a regression you own.
- Re-measure the baseline when the tree moves a long way; quote the date and the base
  commit you measured against.

### Asset audits that are not in the loop

Changes to native art additionally need the pipeline's pixel/hash/placement/timing
audits under `tools/tests/` and the source-preservation proofs described in its README.
These Python suites are not part of the JavaScript loops, and many need original sheets,
recovered native binaries or independent renderer exports from outside the checkout —
read each one's arguments and recover its pinned inputs before running. If the inputs are
unavailable, record the specific blocked audit; do not treat a missing fixture as a pass.
`tools/tests/skill_pet_assets.py` takes three directories (supplied skill sheets, native
pet renderer exports, recovered native pet binaries); `evil_scythe_assets.py` takes four.

## Suite map

Every suite lives in `tools/tests/`. `npm install` is only needed for the rows that boot
the page or the server.

| System | Suites |
| --- | --- |
| Accounts, saves, login, away rewards | `api_sim`, `registration_sim`, `cloud_sim`, `cloud_login_error_sim`, `offline_sim`, `migration_sim`, `save_load_sim`, `save_owner_sim`, `dev_server_sim` |
| Classes, stats, EXP, pacing | `class_change_sim`, `loadout_update_sim`, `stat_sim`, `base_pacing_sim`, `economy_sim`, `progression_sim`, `progression_refresh_sim`, `mvp_exp_sim` |
| Combat, skills, floats | `skill_sim`, `combo_rotation_sim`, `cosmetic_combo_sim`, `combat_damage_sim`, `combat_float_sim`, `attack_sync_sim`, `crit_sim`, `hp_affix_sim`, `retune_sim`, `combat_retune_sim`, `background_sim`, `ascension_attack_sim` |
| Fourth jobs, trials, Mythic | `fourth_job_sim`, `fourth_job_runtime_sim`, `fourth_job_mythic_sim`, `fourth_job_motion_sim`, `job_rite_sim`, `mythic_rules_sim`, `mythic_gift_base_sim`, `mythic_testing_sim`, `owner_fx_sim` |
| Ascension and endgame | `ascension_progression_sim`, `ascension_combat_sim`, `ascension_tracks_sim`, `ascension_rewards_sim`, `ascension_evolution_sim`, `endgame_progression_sim`, `encounter_retune_sim`, `material_sim`, `zeny_sink_sim`, `nightmare_sim`, `trial_sim` |
| Fields, maps, scenery | `scene_sim`, `starter_sim`, `kit_sim`, `native_fields_sim`, `terrain_v2_sim`, `terrain_proposal_sim`, `reference_mobs_sim`, `ascension_scene_sim`, `astral_scenery_sim`, `endgame_scenery_sim`, `native_theme_sim`, `map_journey_sim`, `map_delivery_sim`, `map_scene_review_sim`, `map_proposal_sim`, `field_report_sim`, `preview_fields_sim` |
| Gear, cards, wardrobe, weapons | `gear_sim`, `card_sim`, `card_comparison_sim`, `card_star_balance_sim`, `dual_wield_sim`, `autosell_sim`, `affix_range_sim`, `equipment_cards_sim`, `equipment_selection_sim`, `equipment_art_sim`, `assassin_equipment_sim`, `wardrobe_sim`, `wardrobe_game_sim`, `cosmetics_sim`, `appearance_bundle_sim`, `hair_color_sim`, `class_weapon_sim`, `weapon_joint_sim`, `weapon_proposal_sim`, `weapon_review_sim`, `picker_sim` |
| Class art, sprites, pets | `pack_sim`, `sprite_sim`, `class_skin_sim`, `sprite_viewer_sim`, `pet_sim`, `pet_game_sim`, `pet_sprites_sim` |
| Skill, boss and combat FX | `overdrive_sim`, `overdrive_preview_sim`, `afterglow_sim`, `boss_fx_sim` (+ the Python material/afterglow `--check` scripts) |
| Audio | `combat_audio_sim`, `attack_audio_sim`, `bgm_sim` |
| UI, panels, interaction, guides | `ui_sim`, `eclipse_ui_sim`, `mail_roulette_ui_sim`, `display_polish_sim`, `haven_redesign_sim`, `gameplay_polish_sim`, `interaction_guard_sim`, `guide_sim`, `activity_scroll_sim`, `progression_effects_sim`, `mobile_layout_sim` (phone shell, `assets/ui/mobile.css` + `mobile.js`) |
| Shop | `shop_api_sim` (Pages Functions + in-memory D1), `shop_sim` (the page in jsdom), `ascension_drop_shop_sim`, `dev_server_sim` |
| GM tools and leaderboard | `gm_console_sim`, `gm_tools_sim`, `gm_auth_sim`, `gm_presets_sim`, `gm_setup_sim`, `leaderboard_sim` |
| Social hub | `social_sim`, `social_ui_sim`, `social_scene_sim`, `social_config_sim`, `social_api_sim.mjs`, `social_worker_sim.mjs` |
| Publishing and build labels | `publish_sim` (builds `dist/`), `update_watch_sim` (the `BUILD` mirrors) |
| Smoke (boot the real page) | `field_loop_smoke`, `save_owner_boot_smoke`, `panel_layout_smoke` |

`tools/check_*_browser.cjs` / `.js` are task-specific browser checks, not a generic gate.
Read the URL and fixture arguments each one expects before running it.

For a specific change, [Code map](CODE-MAP.md) names the suites that cover it; the table
above is for orientation, not a substitute.

## Visual verification and honest reporting

For UI/rendering changes, exercise the actual controls on desktop and a narrow phone
viewport. Check apply/cancel, loading failures, class/account changes and reload when
they cross the changed behaviour. Confirm assets load through the built site, not only
from repository-root tooling.

The jsdom/Three harness and some browser checks use a WebGL renderer stub. They verify
their implemented logic/DOM/canvas paths, not GPU rendering or physical phone
performance. For renderer/performance changes use a capable browser/device when
available; otherwise report that portion as unverified.

Record exact commands, results and material missing coverage in the handoff. Historical
pass counts and old workspace-only records are not evidence for a new checkout or a
combined branch.
