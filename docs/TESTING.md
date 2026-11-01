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
npm install --no-save --package-lock=false jsdom three@0.128.0 ws miniflare@4.20260730.0
node -e "require('jsdom');require('three');require('ws');require('node:sqlite');console.log('test dependencies ready')"
```

`jsdom` + `three` are needed by anything that boots `index.html`; `ws` by anything that
loads `tools/dev_server.js` (`dev_server_sim.js`, `social_api_sim.mjs`); `miniflare` by
`social_worker_sim.mjs`, which now runs the plaza Worker's real modules in the local
Cloudflare runtime. The game itself needs no npm install.

**Full git history.** A few suites read old revisions (`skill_balance_sim.js`,
`card_star_balance_sim.js`, `hosted_launch_stage_sim.js`, `hosted_scrypt_prepare_sim.js`)
and fail with `exists on disk, but not in <sha>` in a shallow clone. Run
`git fetch --unshallow origin` once. That failure is environmental, not a regression —
check it before blaming the code.

**Python.** Sprite/asset checks need Python 3 with Pillow; the legacy pack pipeline also
needs numpy and scipy. Install only the selected pipeline's dependencies and follow its
README rather than reconstructing versions from an older handover.

**Git history.** A few suites read pinned historical revisions with `git show`
(`card_star_balance_sim.js` and `skill_balance_sim.js` use `d164bd0`). A shallow clone
must fetch them first or those suites fail with `Command failed: git show …`:

```sh
git fetch origin d164bd0527cfe335f9c183d0e576800716b7dd26
```

## Latest local gate (haven-v262)

The most recent complete local run had **164 passes / 1 failure** across 165 suites.
The one failure is the previously known intermittent camp-ring smoke assertion; the
owner chose to retain the current camp layout, and that assertion was not changed.
The new preview runtime and hosted launch package tests were added after the run began
and passed separately; their complete-suite run is still pending. No dependency skips
were reported. Preview configuration, local workerd preview routing and all three
generated-asset checks passed. This is local evidence only.

## Account security and unverified competitive boards (haven-v262)

Apply migrations only to disposable databases when testing. The local server applies
all of them automatically. `node tools/tests/launch_security_sim.js` covers legacy
accounts, concurrent email registration, recovery, request limits and unverified
board disclosure. `node tools/tests/unverified_echo_launch_sim.js` covers launch
cutoff, >100M review-only flags, retryable score updates, old-period nonpayment,
atomic rollback, new prizes and retries. `echo_board_sim.js` preserves reward tier
and HTTP checks under the new season policy; `competition_pause_sim.js` confirms
legacy non-atomic entry points remain disabled. `prize_delivery_safety_sim.js`
checks full-cap gift delivery. `node tools/staging/local.mjs test` uses an isolated
local Pages/D1 project and synthetic accounts, with a test-only start override.
None proves browser score integrity or hosted launch readiness. See
[Competition security](COMPETITION-SECURITY.md) for cutoffs and remaining risks.


## Write pause (the recovery switch)

`node tools/tests/write_gate_sim.mjs` covers the pause state machine and the Durable
Object (closed by default, exact phrases, constant-time token, lockout, restart,
corrupt storage loading as closed). `node tools/tests/write_gate_middleware_sim.js`
proves no `/api` path — save, grants, GM, shop webhook, and the reads that write as a
side effect — reaches a handler while the pause is on, and that an unreachable switch
fails closed. `node tools/tests/write_gate_api_sim.js` covers the `/api/gate` control
endpoint; `node tools/tests/write_gate_cli_sim.mjs` covers the owner's CLI.
`node tools/tests/write_gate_binding_sim.js` covers how the code reaches the switch and
how the CLI talks to `/api/gate`. It exists because the other four were green while
production was not, for two separate reasons: (1) a Durable Object binding is a
**namespace** (`idFromName` / `get`), not something with a `fetch` method, and the mocks
had been written as bare `{fetch}` objects — `env.GATE.fetch(...)` ran in tests and threw
on Cloudflare, failing closed with 503; (2) `write_gate.mjs` sent `{confirm, reason}`
without `action` on `POST /api/gate`, while `/api/gate` requires `body.action` and
answered 404 (`Not found.`) before reaching the switch, which the CLI suite missed because
its mocked `fetch` never ran `/api/gate`. Every mock in these suites is now
namespace-shaped with no top-level `fetch`, and `write_gate_binding_sim.js` drives both a
direct CLI→`/api/gate` wire check and a two-Worker local Cloudflare runtime rehearsal
(`miniflare` / `workerd`: `pages` Worker + cross-script SQLite `WriteGate` Durable Object
on `prontera-gate`, driven through `write_gate.mjs` `status` → `open` → `close`).
Restoring either old bug fails the suites — checked by mutation. None contacts a live
Cloudflare account, and the switch is off unless `WRITE_GATE = "required"` is set, so the
existing suites are unaffected.

## D1 Time Travel selection (read-only)

`node tools/tests/recovery_point_sim.mjs` exercises the owner-only seven-day
bookmark selector. `node tools/tests/recovery_rehearsal_sim.mjs` exercises a
synthetic SQLite recovery sequence; `node tools/tests/hosted_disposable_rehearsal_sim.mjs`
tests target guards and a mocked CLI driver for the separately prepared hosted
drill. `node tools/audits/local_d1_restore.mjs` rehearses synthetic local D1
export/import, not Time Travel. These tests do not contact production or prove a
hosted restore. See [Recovery](RECOVERY.md).

## Password-recovery UI

`node tools/tests/recovery_ui_sim.js` checks recovery validation, cancellation,
rotated-code acknowledgement and the return to login without touching a real account.
For an additional Chromium check, install `playwright-core` and `@sparticuz/chromium`
together with the packages above (no root package manifest means an npm install can
prune earlier packages), build the site and start `HOST=127.0.0.1 node
tools/dev_server.js --port 8793`. In another terminal run `node
tools/check_recovery_browser.cjs`. It creates synthetic accounts only and rejects
non-loopback test URLs; never use real account credentials. It checks desktop and
phone-width layouts, errors, success and signing in again without a refresh. Stop the
server after testing. This check was run with bundled headless Chromium in Linux; it
is not a substitute for hosted staging or physical-device checks.

## Ground-spell target behavior

The owner chose on 2026-10-28 to retain the existing behavior: ground field pulses
hit every living enemy inside their radius across camps, without a five-target cap.
This supersedes the v227 update log's five-target claim for ground fields only;
direct AoE remains capped at five. `node tools/tests/ground_aoe_sim.js` checks both,
including range, movement, target death and switching active camps, using synthetic
in-memory game state. No damage formulas or balance settings were changed.

## Isolated Pages/D1 rehearsal

Use `bash tools/build_site.sh && node tools/staging/local.mjs test` for a fresh,
synthetic, local-only Wrangler Pages/D1 rehearsal; `node tools/staging/local.mjs serve`
starts the same isolated setup for manual testing with a synthetic GM owner. See
[Isolated staging](ISOLATED-STAGING.md) for Windows steps, credentials, safety boundaries
and limitations. This is not hosted Cloudflare staging.
The optional `node tools/staging/local.mjs test-strong` uses 600,000 PBKDF2
iterations in a temporary copy only, testing legacy upgrade and recovery races. It
does not alter the production candidate or prove hosted limits. The 2026-10-29
gate after this work had 146 passes and the same four failures; both new competition
checks and all three generated-asset checks passed.

## Preflight reset and staff leaderboard exclusion (haven-v271)

`node tools/tests/launch_reset_sim.js` uses synthetic SQLite only. It exercises the
real reset transaction, preserved credentials/shop rows, fresh-save loading through
the real client, old-session/version rejection, rollback, schema guards and mocked
remote ordering. It also proves an unclaimed Cash Shop grant blocks the reset without
changing data, while a claimed grant no longer blocks. It never contacts Cloudflare. `leaderboard_sim.js` and
`unverified_echo_launch_sim.js` cover GM/owner exclusion on every public period and
new prize placement; `ui_sim.js` checks the player-facing explanation. The owner
runbook is [Prelaunch reset](PRELAUNCH-RESET.md); hosted execution remains unverified.

## Choose the preview for the task

### Game plus accounts, cloud saves and GM tools

Damage-review draft: run `node tools/tests/damage_monitor_sim.js` for bounded samples, GM authorization, provisional flags and best-effort save behavior. See [Damage monitoring](DAMAGE-MONITORING.md); no browser-reported flag proves cheating or enables payouts.

Prize work: `node tools/tests/competition_settlement_foundation_sim.js` exercises the disabled settlement batch and synthetic prize delivery; `node tools/tests/prize_delivery_safety_sim.js` checks full balances. `tools/audits/competition_settlement_foundation_d1_local.mjs` additionally needs local Miniflare and tests disposable D1 only. The new unverified scorer uses the atomic batch; old period rows remain disconnected. See [Competition security](COMPETITION-SECURITY.md).
Baseline draft: `node tools/tests/competition_baseline_foundation_sim.js` and the optional disposable `tools/audits/competition_baseline_foundation_d1_local.mjs`. Grandfathered source data is not verified gear, and baseline capture is not activated.

```sh
bash tools/build_site.sh
node tools/dev_server.js
```

The default entry point is `http://localhost:8788/`. The server serves `dist/`, routes
actual API handlers through a local SQLite D1 shim and applies local migrations. Rebuild
`dist/` after changing client files; restart after changing API handlers (the server
caches imported modules).

For disposable GM testing on your own computer, bind to localhost (for example,
`HOST=127.0.0.1 node tools/dev_server.js --gm-all` on macOS/Linux, or
`$env:HOST="127.0.0.1"; node tools/dev_server.js --gm-all` in PowerShell) and register a
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

The gate is: the three generated-asset checks, the Pages preview config check, every `*_sim.js` and every `*_smoke.js`.
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
python3 tools/tests/pages_preview_config_sim.py  # Python 3.11+ (tomllib)
python3 tools/make_sprite_viewer.py --check
python3 tools/make_class_skins.py --check
python3 tools/make_weapon_pack.py --check
for t in tools/tests/*_sim.js; do node "$t" || exit 1; done
for t in tools/tests/*_smoke.js; do node "$t" || exit 1; done
```

**2026-11-01 (`haven-v279` gate result): 184 suites pass.** The GM flag now reaches the plaza: added
to the server-resolved `X-Social-Identity` header, carried in `hello`/`snapshot`/chat messages, and
rendered as `🛠 Name`. `social_api_sim.mjs` pins that a client-claimed `gm` is discarded and that only
a promoted account is tagged.

**2026-11-01 (`haven-v277` gate result): 184 suites pass.** Login now tries the cloud before the offline
GM path for a `GM`-shaped name when an API is present, so a cloud account can hold the reserved name
without becoming unreachable. `gm_auth_sim` 12 → 13 and `migration_sim` 7 → 8 (the latter runs
`migrations/0013_gm_owner_name.sql`'s statements against real SQLite: one row moves, the save blob is
re-stamped, `version` bumps, everyone else is untouched).

**2026-11-01 (`haven-v276` gate result): 184 suites pass.** The update watcher now checks at boot
(`setTimeout(updateWatch,3000)`) and a dismissed prompt snoozes for 30 minutes instead of vanishing for
the life of the page, escalating to a non-dismissible "out of date" prompt after a day. `update_watch_sim.js`
grew 10 → 12 checks (snooze expiry, newer-build bypass, day-old escalation, boot wiring).

**2026-11-01 (`haven-v275` gate result): 184 suites pass.** Same 180 `*_sim.js`/`*_sim.mjs` + 4
`*_smoke.js` count as v274. The only behavioural addition is in `bash tools/build_site.sh`, whose
`dist/_headers` now makes the HTML entry point revalidate (`no-cache, must-revalidate`) so a shipped
fix reaches players who never clear their browser cache. `update_watch_sim.js` parses `_headers` as
path blocks and fails if an `.html` entry is missing that directive or gains `immutable`/`max-age`.

**2026-11-01 (`haven-v274` gate result): 180 `*_sim.js`/`*_sim.mjs` + 4 `*_smoke.js` suites, 184 pass, 0 fail, 0 dependency skips**
(the three generated-asset `--check`s and `pages_preview_config_sim.py` pass too). **The known-red baseline below is now
empty**: every row that used to fail for environmental reasons was fixed at the cause, not skipped.
`skill_balance_sim.js`, `card_star_balance_sim.js`, `hosted_launch_stage_sim.js` and `hosted_scrypt_prepare_sim.js`
read pinned revisions and need `git fetch origin d164bd0527cfe335f9c183d0e576800716b7dd26` **and**
`git fetch origin 7511a03c0787ec9b8d94cfc6658570ac402dc297`; `write_gate_binding_sim.js` needs
`miniflare@4.20260730.0` (in the install line above). If those four red again in a fresh clone, it is the shallow
history or the missing package, not the patch — check that before touching code.

**2026-11-01 (`haven-v273` gate result): 183 suites, 183 pass, 0 fail, 0 dependency skips.**
`skill_balance_sim.js` — the last known-red row — is green: the three progression fixtures
were regenerated with `--reuse-baseline`, and **all 126 measurements came back byte-identical**.
Only `sourceHash`/`combatHash` moved, because the hashed slice runs from `const RAR=` to the
reforge marker and therefore contains `UI_ICONS` (a new `friends` glyph was added) and
`const BUILD`. No budget was changed and no measurement was re-rolled, so this is a re-hash of
an unchanged combat surface, not a loosened gate. New suites: `friends_sim.js` (14 checks) and `friends_ui_sim.js` (the panel in the real page).

### The known-red baseline (measured 2026-10-26, re-measured 2026-10-28)

136 checks: **129 pass, 7 fail.** Those seven fail identically on the untouched base
commit `ae3897d` (`main`), so they are a standing baseline, not something a new patch
broke. The gate is therefore **"no new failures, and no suite gets quieter"** — not "all
green", which this tree has not been since v221.

**2026-10-28 (`haven-v253`): `publish_sim.js` is green again — 17/17, so the baseline is 6.**

**2026-10-29 (draft after `haven-v258`): `skill_balance_sim.js` now passes** after
fully rerunning the original benchmark against both its pinned historical revision and
the current game. The old baseline rows and measurement tool were identical; all 126
current rows were remeasured, and the existing budgets were not changed. The 21 moving
encounter rows differed from the previously saved sample; a second run reproduced the
new values exactly in this environment. Current-vs-prior sample kills ranged from
−18.10% to +30.26%, while sampled death and boss-win outcomes stayed the same. These
are fixed-seed 120-second samples, not real-world guarantees or a retuning decision.
At that point, five original game suites remained red, plus three competition suites
paused on this branch. `combat_field_contract_sim.js` adds current-rule checks.

**2026-10-29 (later draft):** The owner explicitly approved replacing the outdated
pack-only expectations in four combat suites with the current cross-camp rules. The
four suites now pass with checks for shape, range, target limits, waking, timing and
cancellation retained or strengthened; no gameplay code or combat balance changed.
The separate 3.35-unit camp-spacing assertion was not changed and remains red.
The three competition suites remain red while their features are paused.

**2026-10-29 GM identity observation:** `gm_presets_sim.js` intermittently fails
its unchanged item-ID uniqueness assertion. The game and suite matched the prior
PR head when reproduced. `node tools/audits/gm_item_id_collision.cjs` deliberately
forces the same clock and random values in a disposable game and demonstrates that
all eight preset items can receive the same ID. This is a potential item identity
bug, not a reason to weaken that test; investigate/fix separately without changing
existing saves or removing GM testing. The full-gate recheck returned 147 passing
and the same four known failures, while the preceding run hit this intermittent GM
failure.

**2026-10-30 (`haven-v263`): the camp smoke is green, and its budget was recomputed, not
relaxed.** `field_loop_smoke.js` had been red on a 3.35-unit camp-mate budget since v231
replaced the single 1.6–3.2 ring with three widening tiers (up to `CAMP_RING_MAX × 1.75`
= 5.075) for camps that cannot fit a member legally. The number was stale against the
code, not a monster drifting: measured over 880 seeded farming fields on all 12 maps,
the furthest camp-mate was 5.0750, exactly the documented bound, with no exceptions. The
check now derives its bound from the source constants, is seeded (it used to be
intermittent), and runs crowded fields (maps 9 and 11 put 17–18 camp-mates past the tight
ring, which is what gives it teeth — a single roomy field let a deliberately broken bound
pass). Two new assertions were added rather than removed: pairwise monster distance
against v231's `MOB_GAP` 2.6 floor (nothing asserted it before), and that at least one
sampled field actually uses a widened ring. Mutation-tested: widening the tier to 2.60×
or dropping `MOB_GAP` to 0.2 both fail it with the field and seed named.

The same run found a second, unrelated flake in that smoke: "every swing showed something"
failed about once in eight runs **on the untouched base**, because Assassin Cross printed
42–46 numbers+misses for 47 attacks (the band is 90%). The thresholds were left alone and
the block was seeded instead, so the result is reproducible. Whether 1–5 high-ASPD swings
genuinely resolving with no float is acceptable is still an open question for a follow-up;
it is not covered by this change.

**2026-10-30 gate result (all suites green, after the binding fix):** 180 suites,
**180 pass, 0 fail**. The count rose by one with `write_gate_binding_sim.js`, which is the
regression test for the 503 outage described under "Write pause" above.

**2026-10-30 gate result (earlier, before the binding fix):** 179 suites, **179 pass, 0 fail**.
Those 179 green suites were the reason the outage shipped — they modelled the binding
wrongly. The last
known-red suite, `social_worker_sim.mjs`, was a harness defect rather than a code failure:
it imported `convertV4MiniflareOptions`, a wrangler helper current miniflare no longer
exports, and read a bundle that only existed after a manual `wrangler deploy --dry-run`.
It now drives the Worker's real modules through miniflare's `modules` array (no build step),
reads the compatibility date from `workers/social/wrangler.toml`, and clamps only the
runtime date — the bundled workerd accepts at most `2026-08-06` while the Worker is
configured `2026-10-01`, and it says so on the console when it clamps. Assertions are
unchanged: 101 upgrade, a socket, and `room === 1`, with the anti-vacuity timeout kept.
Proven able to fail: renaming the Worker's `room` message type or asserting an impossible
room both turn it red.

**2026-10-30 gate result (earlier, after the read-only launch schema check):** 179 suites,
**178 pass**. The one failure is
`social_worker_sim.mjs`, which imports `convertV4MiniflareOptions` — the installed
miniflare 4.20260730.0 does not export it, so this is a harness/version problem, not a
code failure. `skill_balance_sim.js`, `card_star_balance_sim.js` and
`hosted_launch_stage_sim.js` are green (the balance fixtures were regenerated in the
previous entry with identical measurements). `live_launch_schema_check_sim.js` is new:
it proves the read-only schema check accepts a complete 0008–0011 application, reports
missing tables, columns, triggers, indexes and launch config separately, changes nothing
when it reads, and cannot acquire a write path (source-level guard). All 180 suites need
`npm install --no-save --package-lock=false jsdom three@0.128.0 ws` first; without it the
client-side suites fail to load rather than fail assertions.

**2026-10-29 (camp/auth audit):** The original 3.35-unit camp smoke was not changed.
An in-memory bounded-ring prototype and a local workerd password-cost probe are
measured in [Camp and auth audit](CAMP-AUTH-AUDIT.md). The owner chose to retain
the current camp layout; the tighter prototype is not approved. `recovery_hash_sim.js` covers skipping an otherwise discarded legacy
recovery-hash upgrade while retaining password upgrades, rotation and revocation.
The full gate had 144 passing and the same four failing suites, with no new
failures; all three generated-asset checks passed.

Two things changed, and neither one moved a ceiling out of the way of a real byte:

- `tools/build_site.sh` stopped copying art that only unpublished dev pages read (152 KiB:
  `assets/mob_*.png`, `assets/weapons/**`, `weapons_manifest.json`), and `publish_sim` now
  asserts those paths stay out.
- The map-exploration sub-app (`assets/endgame`) is measured against its own 4.25 MiB ceiling
  instead of being counted a second time inside the classic-game bucket — the same treatment
  native fields and social portraits already had. To keep the bucket as tight as it was, that
  line went **62.5 → 59 MiB** (measured 58.59), so the classic game gained ~0.4 MiB of headroom,
  not the 3.9 MiB that leaving 62.5 would have handed back. The combined 140.5 MiB ceiling still
  covers every shipped byte.

| suite | status | context |
| --- | --- | --- |
| `field_loop_smoke.js` | "a camp monster drifted off its camp ring" (8/9 steps) | old 3.35-unit limit conflicts with v231's widened candidate rings; do not relax the assertion without reconciling the intended layout |
| `ground_combat_sim.js` | formerly ground field radius/pack assertion; **now passes** | owner-approved cross-camp expectation; radius, target movement, death and cancellation checks remain |
| `rotation_updates_sim.js` | formerly "expanded area stays within its camp"; **now passes** | owner-approved cross-camp expectation; nearby and out-of-range targets are explicitly checked |
| `skill_redesign_sim.js` | formerly area-pack and dash assertions; **now passes** | owner-approved cross-camp expectation; damage, waking, range, distant sleeping targets and no-invulnerability checks remain |
| `fourth_job_skills_sim.js` | formerly expected same-camp Chain Lightning; **now passes** | owner-approved cross-camp bounces, with nearest-target and bounce-cap checks |
| `skill_balance_sim.js` | formerly "gear measurements stale"; **now passes** | both historical and current measurements were rerun against the unchanged tool and budgets; see the 2026-10-29 note above |

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
| Combat, skills, floats | `skill_sim`, `combo_rotation_sim`, `cosmetic_combo_sim`, `combat_damage_sim`, `combat_float_sim`, `combat_field_contract_sim`, `ground_aoe_sim`, `attack_sync_sim`, `crit_sim`, `hp_affix_sim`, `retune_sim`, `combat_retune_sim`, `background_sim`, `ascension_attack_sim` |
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
| Friends (accounts, not saves) | `friends_sim` (migration, auth, one-way request, limits, privacy, audit rows, per-viewer plaza flags), `friends_ui_sim` (the panel in jsdom: add box, accept, unfriend, dock badge, chat name menu, sign-out wipe) |
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
