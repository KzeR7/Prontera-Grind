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
npm install --no-save --package-lock=false jsdom three@0.128.0 ws miniflare@4.20260730.0 sharp@0.35.2
node -e "require('jsdom');require('three');require('ws');require('sharp');require('node:sqlite');console.log('test dependencies ready')"
```

`jsdom` + `three` are needed by anything that boots `index.html`; `ws` by anything that
loads `tools/dev_server.js` (`dev_server_sim.js`, `social_api_sim.mjs`); `miniflare` by
`social_worker_sim.mjs`, which now runs the plaza Worker's real modules in the local
Cloudflare runtime. `sharp` validates all 280 WebP atlases in `social_digimon_sim.js`
and rebuilds the v3 pack. The game itself needs no npm install.

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

## Built-site browser reliability

Use a disposable local server/database, **not a hosted game**. Build once, then run the
same `dist/` in both engines. On a Linux test machine with browser downloads available:

```sh
# Include the ordinary test dependencies in the same install (no root package.json).
npm install --no-save --package-lock=false jsdom three@0.128.0 ws miniflare@4.20260730.0 sharp@0.35.2 playwright-core@1.65.1 @sparticuz/chromium@153.0.0
bash tools/build_site.sh
npx playwright-core install --with-deps firefox
node tools/check_browser_reliability.cjs chromium
node tools/check_browser_reliability.cjs firefox
```

The runner starts `tools/dev_server.js` on loopback, per-run synthetic accounts, real
cookies and the local socket shim. Each case launches a new temporary browser profile.
The desktop journey uses a mouse; the small journey uses a **touch-capable** context
(a narrow mouse-only window does not select the same layout). Chromium uses headless
SwiftShader on Linux; no renderer stub or CDN fulfillment. On Linux with headless
Firefox WebGL unavailable, try a headed session (`HEADED=1` with a display or Xvfb
and Mesa installed). Report a missing context/extension as such, not a rendering pass.
The same runner accepts installed `chrome` and `msedge` channels. See the
[results, failure repros and separate stock Brave checklist](../reports/browser-reliability/README.md).
The combined-build matrix exercises the First Adventure companion, owned item selection and Equip, pending engine retry, both WebGL contexts and leaving/re-entering during a pending town load. Use `adopt-town` or `adopt-town-reject` after the engine name to run the cloud-adoption races alone: both hold the required catalog, call the real `cloudAdopt()` for the signed-in player, then release or reject the request. The rejection case returns through Field and retries. `plaza_entry_sim.js` separately holds a scene promise across an account or session change (stub, not rendering evidence).
Never infer Shields behavior from Chromium. `BROWSER_ARTIFACTS` overrides the default
`.tmpcheck/browser-reliability/` screenshot directory; the optional second argument
after the engine runs only one scenario (e.g. `firefox journey`).

## Save size and codec regressions (haven-v415)

```sh
node tools/tests/save_max_state_sim.mjs
node tools/tests/save_codec_canread_sim.mjs
node tools/tests/save_format_parity_sim.mjs
node tools/tests/cpu_profile_invoker_sim.mjs
node tools/tests/cpu_hot_paths_sim.mjs
node tools/tests/save_codec_item_state_sim.mjs
node tools/tests/save_codec_real_sim.mjs
node tools/tests/save_codec_catalog_sim.mjs
node tools/tests/save_codec_chain_sim.mjs
node tools/tests/save_codec_gm_sim.js
node tools/tests/api_sim.js
node tools/tests/gm_tools_sim.js
node tools/tests/fishing_save_reload_sim.mjs
node tools/tests/cloud_sim.js
node tools/tests/update_watch_sim.js
```

`fishing_save_reload_sim.mjs` boots the real `index.html` + `assets/social-fishing.js` client against
`functions/api/{register,me,save,sessions}.js` and an in-memory D1 SQLite database to verify fishing
and cloud durability across in-flight uploads during `#updatePrompt` clicks, slow (>1.5s) automatic
update flushes, catches saved while a prior upload is in flight (`rev > ackRev`), `localStorage`
`QuotaExceededError` recovery via IndexedDB `pg_durable_v1`, 428 away-claim handshakes, 413/401/503
reload refusal with `Keep playing` + `Retry`, 409 conflict handling (same-`cid` zero-extra-PUT
deduplication, same-`cid` rebase, foreign-device adopt + `_local_` backup + fishing `adopt-behind`
ledger, GM `restoreFenced`), bounded `cloudLogout`, the `restoreFrom` workflow from `CHECK-A-SAVE.md`,
and `CLOUD.updating` mutation pausing.

The haven-v419 follow-up extends this suite to **18 scenarios**, including real independent
browser profiles and tabs sharing localStorage, recovery while localStorage **stays full**, a
legacy save without revision metadata, cancellation during an outstanding update save,
IndexedDB request success followed by transaction abort, and real 409/GM-restore responses
carrying pending offline claims. All eight added scenarios fail against the original PR #248
client (`5045513`); its original ten scenarios still pass. `update_watch_sim.js` additionally
checks cancelled automatic-update jitter, the next poll's snooze, and a superseded refresh
leaving the newer attempt in control of pausing/navigation (22 checks).

**2026-11-18 Windows follow-up gate:** 229/240 suites pass after restoring the checkout's LF
bytes, installing the documented dependencies, and fetching the pinned historical source.
The same 11 failures reproduce with the original PR #248 source: `class_skin_sim`,
`hosted_scrypt_prepare_sim`, `hosted_scrypt_reader_probe_sim`, `panel_layout_smoke`,
`plaza_bots_sim`, `preview_fields_sim`, `publish_sim`, `render_lost_boot_smoke`,
`session_lost_sim`, `sprite_viewer_sim`, and `weapon_proposal_sim`. These include Windows
Python/path/SQLite cleanup limitations and existing assertions; none were weakened.
The Pages config and all three generated-asset checks pass. The real temporary-directory
build/version/header check in `update_watch_sim` passes; a direct default `dist/` build is
blocked by this sandbox's Git Bash handling of the C: workspace path.

All three progression benchmarks were executed on both the original PR client and the
patched client: 42 gear, 21 encounter, and 63 growth rows match exactly, including the
historical baseline rows. The committed measurement fixtures were generated by those actual
runs; the prior stored encounter/growth rows were stale. No budget or assertion changed,
and no digest-only fixture refresh was used to bypass measurement.

**PR #248 integration with main `0266d98`:** 230/241 suites pass with the same 11 failures.
`class_icon_delivery_sim.mjs` exercises the real emblem renderer and verifies all 49 portraits
against original RGBA pixels. `publish_sim.js` checks the exact selected files, unchanged CSS
rules and bounded portrait delivery, while `hosted_launch_stage_sim.js` requires all portrait
sources and the matching `optimize_delivery.js` in the archive. Save/reload remains 18/18 and
the update watcher 22/22. Actual benchmark reruns preserve all 126 pre-merge measurement rows.


`helpers/full-storage-save.js` builds the refined/locked, all-three-star account with actual
`genGear()` / `newCard()` / `addCatch()` calls, a seeded clock/RNG, compatible distinct-family sockets,
production-length ids and the fish dex/stats. Do not replace it with short handwritten fish ids or
half-starred cards. The measured case is 338,180 characters under the merged v3 encoder and 295,175
under v4, against the unchanged 307,200 limit. This is a finite regression, **not a global maximum**.

`save_codec_canread_sim.mjs` (haven-v419) is a **differential** test: it compares the codec-version
decision in `_lib/validate.js` against the pre-v416 `JSON.parse` reader - the oracle here is the code
that shipped before the version lookup changed, not a second implementation of the new one. Cases include
escaped property names (`{"\u005f_v":4}` is `{__v:4}`), duplicate keys with different spacing, whitespace
around the colon, malformed suffixes JSON.parse rejects, nested/irrelevant placements, non-numeric values,
every codec version at 0/1/5/50 records, plain saves, and the production constructor fixture; plus the
capability matrix and the "an incompatible client is served EXPANDED items, never tuples" property.
141 checks. A text scan for a literal `"__v":` fails 7 of them, which is exactly the regression
v416 shipped and v419 removed.

`save_format_parity_sim.mjs` (haven-v419) proves the same thing at the API boundary, where item loss
would actually happen: a real row written by the handler and a row seeded directly into storage with an
escaped marker, read back with **no header / 110 / 111 / 112**, on **GET and on a 409 conflict reply**,
asserting status, authoritative version, and that every page below the row's codec version receives plain
items with `refine`/`lock` intact (and that a page which can decode receives the stored bytes
unchanged). 46 checks.

`cpu_hot_paths_sim.mjs` (haven-v419) pins the four CPU-diet changes by **behaviour, not timing**:
`GET /api/save` reads the save row once and parses its blob once; an accepted sync whose leaderboard
projection did not change still writes `version/blob/saved_at/updated_at/last_seen` under the same
`AND version = ?` guard while leaving `level/cls/zeny/kills_total/playtime` alone, and a sync that did
change them writes them; a stale version is still a 409 with nothing written; and Echo settlement
still settles a due day/week, never pays twice, keeps the save accepted when a batch is refused,
closes an empty period and settles from `GET /api/board`. It also asserts that the dropped
checkpoint endpoint does not exist, so it cannot come back silently.

`save_codec_item_state_sim` checks all 51 refinement/lock-presence states, permanent enum mappings,
page/server decoding in both directions, malformed/future-value preservation and the client capability
matrix (110 → v1–2, 111 → v3, 112 → v4). Its historical JSON fixture is **frozen output from the real
v1/v2/v3 encoders** at the recorded revisions; do not regenerate it with the current encoder. The
API chain also checks that the full account stays compact through real PUT/GET and uses at most three
save-sized parses. Local size/fidelity/parse-count checks do **not** prove Cloudflare CPU headroom;
follow [CPU verification](CPU-LIMIT.md) after a separately authorised deployment.

**2026-11-17 local comparison:** the unmodified merge had 233 passes / 3 failures out of 236 gate
entries; this change has 234 passes / the same 3 failures out of 237, after the coordinated asset
cache-bust reruns. No dependency skips. The existing reds are `hosted_launch_stage_sim` (unpackaged
`assets/plaza-bots.js`), `render_lost_boot_smoke` (renderer-null/guide assertions) and `skill_balance_sim`
(stale combat measurement hash). No balance fixture was re-hashed, assertion removed or budget loosened.
API is 70/70 and GM tools 20/20 here; their earlier reported failures did not reproduce.

## Latest local gate (haven-v346)

The 2026-11-06 complete local run passed **207 checks / 0 failures** on Node
22.22.3: four generated-asset/config checks, 189 `*_sim.js`, eight `*_sim.mjs`,
and six `*_smoke.js` suites. There were no dependency skips. This includes the
complete 280-form asset validation, deterministic Sanctuary combat and room
authority, Solo gym/field UI simulation, unresponsive-Worker intent recovery,
a real workerd/two-WebSocket field-and-ring rehearsal, publish-size checks, and
the fixed historical staging-package rehearsal. For the BUILD-only combat-hash
refresh, all three progression fixtures retained all 126 historical and 126
current measurements byte-for-byte; only their source/combat hashes advanced.

Real Chromium acceptance against the final built site passed **9 Solo real-UI
checks**, **12 online two-client checks**, and **3 no-response recovery checks**,
with zero page errors or failed local requests in every run. Solo covered actual
local Register/login, plaza entry, hatching, a gym stat cycle with a test-only
accelerated clock, shared-simulator field waves, explicitly local Pet Coin
rewards, Stop, and online-only PvP messaging. The two-client online run covered
owned partners, same-stage PvE waves, server-issued Pet Coins, resident
restoration, opposite-side offers, genuine countdown cancellation with no
result/reward, requeue and mutual acceptance, automatic PvP, WIN/LOSE
presentation, and distinct settlement IDs. Its movement helper allowed enough
time for the real client walk; it did not bypass position validation. The
recovery rehearsal deliberately swallowed `pve_start`, verified duplicate
controls stayed locked, then observed the ten-second explanation and restored
control with no fabricated battle or reward. These are local
disposable-environment results, not hosted staging, production deployment,
physical-device certification, or an exhaustive visual review of all 280 forms.

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

## Mastery title and pet-buff layout

Start a disposable changes-only preview with
`PREVIEW_PAGE=tools/mastery_update_preview.html python3 tools/preview_server.py 8000`.
With `playwright-core` and `@sparticuz/chromium` installed (see Dependencies), run
`node tools/check_mastery_titles_browser.cjs --dist --plaza` after
`bash tools/build_site.sh`. It checks all 50 image bounds, sample equip/switch/remove,
four pet icons and countdowns, and the field title below the player on desktop and
phone in both source and packaged builds. `--plaza` also exercises an offline
synthetic plaza player and existing look updates at both viewport sizes. The default
loopback-only URL can be changed with `MASTERY_PREVIEW_URL`; no production account or service is used.
This is an automated Chromium check, not a physical-device or hosted-session test.

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

**Embedded/iframed previews (Arena sandbox, proxied hosts): always start it with
`tools/preview.sh` instead.** It adds `--preview-auth` (the `X-Preview-Session` header
bridge — required because browsers block third-party cookies in iframes, which otherwise
turns every post-login request into a 401 "signed in on another device") and
`--db tools/.devdb/preview.sqlite` (accounts/saves survive restarts). Neither grants GM.

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

### First Adventure browser acceptance (haven-v427)

Run `node tools/tests/adventure_guide_sim.js` for the actual-action gates, pause/skip/
completion, save/load, account changes, future formats and legacy completion. Run the
existing `guide_sim.js` too: reference tours and Ascension must keep working.

For the optional browser audit, include `playwright` in the single dependency-install
command above, then run `npx playwright install chromium firefox`. Build the site and run:

```sh
node tools/check_adventure_browser.cjs chromium /tmp/adventure-review
node tools/check_adventure_browser.cjs firefox /tmp/adventure-review
```

Use an appropriate local output path on Windows. Each audit starts a disposable local
server on an ephemeral port, creates synthetic accounts and takes desktop/phone screenshots.
It uses the pinned local Three.js file with real WebGL rendering (no renderer stub),
actual registration/relogin, town/field travel, a real kill, spending a stat point,
class selection, learning Bash, assigning a combo and finishing. Only the long Novice/
Swordman Job EXP waits use controlled fixtures. This does not test CDN availability,
Brave Shields, Safari or physical phones. No production accounts are touched.

The gate is: the three generated-asset checks, the Pages preview config check, every `*_sim.js`, every `*_sim.mjs` and every `*_smoke.js`.
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
for t in tools/tests/*_sim.js tools/tests/*_sim.mjs; do node "$t" || exit 1; done
for t in tools/tests/*_smoke.js; do node "$t" || exit 1; done
```

**2026-11-06 (`haven-v332`): ownership by id, and a save that stopped happening.**
`save_owner_sim` runs the real `save()` against a copy whose name is stale but whose id is this
account's: it must be re-stamped, written, and queued for upload — while a copy carrying another
account's id writes nothing and queues nothing (mutation-checked by restoring the name-only guard, which
reproduces the silent stop). `cloud_sim` requires a ten-minute gap in completed saves to be reported
with the stamps, even with `CLOUD.dirty` false, and to land in the ledger.

**2026-11-06 (`haven-v331`): documented console commands must exist.**
`cloud_sim` extracts every `pgXxx()` from `docs/CHECK-A-SAVE.md` and asserts `index.html` defines it —
the rule that v330 broke by shipping docs for `pgSyncLog()` while defining only `syncLogShow`. Renaming
the binding back reproduces the failure in the deployed build.

**2026-11-06 (`haven-v330`): self-rebase, the sync ledger, and a swap that loses progress.**
`cloud_sim` answers a `PUT` with a 409 carrying a copy that is the device's own previous upload one
version ahead (31.7M against the device's 33.3M): the client must **rebase** — return `rebase`, adopt
version 8 without adopting the blob, arm one retry that sends 33.3M on version 8, and record both
figures. A copy that is genuinely ahead (41M) must still be adopted, and a device two versions stale
must not be allowed to force its copy up — mutation-checked both ways. An adopt must also paint `☁ ↺`
rather than `☁ ✓`, because the tick printed the previous upload's time and made a rollback look healthy.

**2026-11-06 (`haven-v330`): the sync ledger, and a swap that loses progress.**
`cloud_sim` drives `cloudAdopt` with an account copy that is behind the browser's (33,000,000 vs
31,200,000 Zeny) and requires an `adopt-behind` row carrying both figures, a log line naming both, and
the newer copy still stashed — while a copy that is ahead must be a plain `adopt` that says nothing, so
the warning cannot become noise. It also requires `push-ok` (with the version and the Zeny it carried)
and `push-fail` to be recorded, and the ring to keep exactly the last 40. All mutation-checked.

**2026-11-06 (`haven-v328`): a request that never settles, and a save that goes quiet.**
`cloud_sim` drives a `fetch` that stays pending until its signal aborts — the shape of a dropped socket —
and requires the attempt to end as `offline` with `pushing` cleared and the save still dirty, then a real
push on the next flush; it fails *fast* (a raced 2 s sentinel) rather than hanging, so removing the
deadline is a red test and not a slow one. The watchdog and the five-minute stall note have their own
cases, and all three were mutation-checked. The account-side fingerprint lives in the ladder query in
`docs/CHECK-A-SAVE.md`: a healthy account moves every 10–25 minutes, and a stalled queue is a run of no
rows at all.

**2026-11-11 (`haven-v384` gate result): 218 suites pass, 0 fail, 0 dependency skips.**
The four generated-asset/config checks, `mvp_art_crop.py --check`, every `*_sim.js`,
`*_sim.mjs` and `*_smoke.js` ran on Node 22.22.3 with the documented dependencies.
The three progression fixtures were regenerated with `--reuse-baseline`: all before/after
measurements remained byte-identical and only `sourceHash`/`combatHash` advanced with BUILD.
A real SwiftShader Chromium pass rendered the 12.6 × 3.15 neon MVP board at Y 9.2 above
the bridge and the 512 px pond sprite; a 1440/1080/900/720/701/700/390 px layout pass
confirmed the open activity panel suppresses its duplicate centre HUD while retaining the
small MVP banner. These local browser checks are not hosted staging or physical-device
certification.

**2026-11-10 (`haven-v383` gate result): 218 suites pass, 0 fail, 0 dependency skips.**
The four generated-asset/config checks, the new `mvp_art_crop.py --check` (pixel comparison
against the owner's reference crops) and every `*_sim.js`, `*_sim.mjs`, `*_smoke.js` ran on
Node 22.22.3 with `jsdom`/`three`/`ws`/`miniflare`/`sharp` installed. Five suites need
history the clone does not carry by default - `skill_balance_sim` and `card_star_balance_sim`
(`d164bd0`), `hosted_launch_stage_sim` (`7511a03c` and the staging pin `adf4f99e`),
`hosted_scrypt_prepare_sim` and the launch packager - so run `git fetch --unshallow origin`
and `git fetch origin <sha>` for those before blaming code. The three progression fixtures
were regenerated with `--reuse-baseline`: every measurement byte-identical, only
`sourceHash`/`combatHash` moved. `drop_card_sheet_sim --refresh-snapshot` re-pinned the
worksheet baseline to the new BUILD.

**2026-11-06 (`haven-v327` follow-up): the 428-during-login adopt and the fishing handler.**
`cloud_sim` grew to 80 checks (a 428 at login must not adopt the older copy — mutation-checked) and
`social_fishing_sim` pins the Sell-duplicates handler; the BUILD-sensitive suites and the three
generated-asset checks were re-run after the tag bump. The full 194-suite run below is the v326 tree
these two fixes sit on.

**2026-11-06 (`haven-v326` gate result): 194 suites pass, 0 fail, 0 dependency skips.**
The four generated-asset/config checks plus every `*_sim.js`, `*_sim.mjs` and `*_smoke.js` ran. New
`tools/tests/social_room_recovery_sim.mjs` (unit, fake storage) proves one failed poker-outbox read no
longer refuses every later socket. `cloud_sim` (77) gained the 428 away-claim handshake — applied once,
pushed back with its id, and a repeated claim reported instead of looping — plus a source pin for the
`online`/`pagehide` flush pair; `social_ui_sim` gained a same-tab reload that restores Local from
`sessionStorage` (and writes nothing to `localStorage`) and the `online`/`offline` reconnect. The three
progression fixtures were regenerated with `--reuse-baseline`: every measurement byte-identical, only
`sourceHash`/`combatHash` moved. Two suites (`hosted_launch_stage_sim`, `hosted_scrypt_prepare_sim`) fail
in a shallow clone until their pinned commits are fetched — that is the documented environment issue,
not a regression.

**2026-11-02 (`haven-v286` gate result): 195 suites pass, 0 fail, 0 dependency skips.**
The four generated-asset/config checks plus every `*_sim.js`, `*_sim.mjs` and
`*_smoke.js` ran. New `social_ledger_sim.js` covers durable poker payouts before and
after reservation expiry, Durable Object restart replay, stable ids, account-scoped
ACKs, bounded replay batches, saved-wallet dedupe, daily reset and the real save-loader
migration. `social_worker_sim.mjs` rehearses a real folded pot paying a disconnected
winner across storage-backed Worker restarts, same-id replay and post-ACK silence.
`social_table_chat_sim.js` covers table 1/hand 1 animating in two plaza rooms and stale
result cleanup on leave. The BUILD bump refreshed progression hashes only; all 126
measurements stayed byte-identical (42 gear, 21 moving, 63 growth).

**2026-11-02 (`haven-v285` gate result): 194 suites pass, 0 fail, 0 dependency skips.**
The four generated-asset/config checks plus every `*_sim.js`, `*_sim.mjs` and
`*_smoke.js` ran. `social_table_chat_sim.js` additionally asserts Local-only seat
bubbles on the viewed poker table, emotion images, text-only rendering, redraw
persistence without replay, mute/expiry/minimize cleanup, and that World/Whisper or
off-table Local lines never pop the table. The BUILD bump again refreshed only
progression hashes; all 126 measurements stayed byte-identical (42 gear, 21 moving,
63 growth). Software-WebGL review passed for the on-table Local bubble alongside the
v284 compact chat/result overlay and the v283 guard/history checks.

**2026-11-02 (`haven-v284` gate result): 194 suites pass, 0 fail, 0 dependency skips.**
The four generated-asset/config checks plus every `*_sim.js`, `*_sim.mjs` and
`*_smoke.js` ran. `social_table_chat_sim.js` additionally asserts the seated-only
compact chat lane, restored chat width after standing, and one-shot win/lose/fold
result overlays that do not replay on redraw. The BUILD bump again refreshed only
progression hashes; all 126 measurements stayed byte-identical (42 gear, 21 moving,
63 growth). Software-WebGL review passed for compact chat, table lane, win overlay,
floor-click guard, phone bounds and World history after reload.

**2026-11-02 (`haven-v283` gate result): 194 suites pass, 0 fail, 0 dependency skips.**
The four generated-asset/config checks plus every `*_sim.js`, `*_sim.mjs` and
`*_smoke.js` ran. The new `social_table_chat_sim.js` covers the leave guard,
reconnect reservation, World-only history and fixed table geometry. The required
BUILD bump moved the progression fixtures' source/combat hashes; all 126 current
measurements were rerun with the unchanged tool and pinned baseline and came back
byte-identical (42 gear, 21 moving, 63 growth). No budget or measurement was changed.
A software-WebGL browser review also passed for desktop/phone poker bounds,
chat-resize independence, the floor-click warning and World history after reload.

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
| Gear, cards, wardrobe, weapons | `equipment_v417_sim`, `gear_sim`, `card_sim`, `card_comparison_sim`, `card_star_balance_sim`, `dual_wield_sim`, `autosell_sim`, `affix_range_sim`, `equipment_cards_sim`, `equipment_selection_sim`, `equipment_art_sim`, `assassin_equipment_sim`, `wardrobe_sim`, `wardrobe_game_sim`, `cosmetics_sim`, `appearance_bundle_sim`, `hair_color_sim`, `class_weapon_sim`, `weapon_joint_sim`, `weapon_proposal_sim`, `weapon_review_sim`, `picker_sim` |
| Class art, sprites, pets | `pack_sim`, `sprite_sim`, `class_skin_sim`, `sprite_viewer_sim`, `pet_sim`, `pet_game_sim`, `pet_sprites_sim` |
| Skill, boss and combat FX | `overdrive_sim`, `overdrive_preview_sim`, `afterglow_sim`, `boss_fx_sim` (+ the Python material/afterglow `--check` scripts) |
| Audio | `combat_audio_sim`, `attack_audio_sim`, `bgm_sim` |
| UI, panels, interaction, guides | `ui_sim`, `eclipse_ui_sim`, `mail_roulette_ui_sim`, `display_polish_sim`, `haven_redesign_sim`, `gameplay_polish_sim`, `interaction_guard_sim`, `guide_sim`, `activity_scroll_sim`, `progression_effects_sim`, `mobile_layout_sim` (phone shell, `assets/ui/mobile.css` + `mobile.js`) |
| Shop | `shop_api_sim` (Pages Functions + in-memory D1), `shop_sim` (the page in jsdom), `ascension_drop_shop_sim`, `dev_server_sim` |
| GM tools and leaderboard | `gm_console_sim`, `gm_tools_sim`, `gm_auth_sim`, `gm_presets_sim`, `gm_setup_sim`, `leaderboard_sim` |
| Social hub | `social_sim`, `social_ui_sim`, `social_scene_sim`, `social_config_sim`, `social_api_sim.mjs`, `social_worker_sim.mjs` |
| Sanctuary field/ring combat | `digimon_battle_sim`, `sanctuary_battle_sim`, `sanctuary_worker_battle_sim.mjs` (real workerd, two actual WebSockets, movement, offers, countdown, combat and server-only settlement) |
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

### Sanctuary automatic gym (v340)

Run `node tools/tests/social_gym_sim.js` alongside `social_ui_sim.js`,
`social_scene_sim.js`, `social_sim.js` and `digimon_sanctuary_sim.js`.
The reservation test covers shared capacity, room isolation, late snapshots,
field leave, disconnect, switching rooms and malformed input; the UI simulation
covers repeated cycles, duplicate slots, logout/disconnect and stale replies.
For visual multiplayer QA, use two signed-in clients and the matching Social
Worker: check each station at multiple camera angles and sizes, then leave one
player in the field, stop/disconnect and confirm reservation release. Training
progress is client-saved, so these tests are not PvP-authority tests.

### Sanctuary field grinding and ring PvP (v344)

Run `node tools/tests/digimon_battle_sim.js` for exact-stage bot groups, waves,
automatic combat, PvP outcomes, rewards and care-stat clamping. Run
`node tools/tests/sanctuary_battle_sim.js` for room authority, forged-result
rejection, opposite-side matchmaking, mutual acceptance, cancellation and
disconnect cleanup. `node tools/tests/sanctuary_worker_battle_sim.mjs` repeats
the multiplayer path in real workerd with two actual WebSockets; do not replace
it with a direct room mock when changing Worker alarms or position validation.

For browser acceptance, use two isolated signed-in browser contexts against the
built site and matching Social Worker. Exercise a field wave and Stop grinding,
then enter from opposite ring approaches. Verify that the countdown's **Cancel
match** button remains clickable while 250 ms snapshots arrive, produces no
result or reward on either client, and permits a fresh queue/rematch. Finish the
rematch and compare both server-issued result/reward IDs. A local Chromium or
workerd pass is not evidence of a hosted deployment.

### Complete Digimon roster gate (v342)

The clean full-gate rerun passed **203/203 checks with no dependency skips**.
`social_digimon_sim.js` validates all 561 v3 files, 280 forms, 17,666 frames,
follower-canvas bounds, request coalescing and the 32-atlas LRU. Sanctuary and
Worker suites cover all-form save keys, exact-ID multiplayer looks and direct
branching evolution. `publish_sim.js` passes 18/18: the classic 59.5 MiB ceiling
is unchanged, the approved lazy Digimon group is below 40 MiB (35.92 MiB of v3
files), and combined delivery remains below 180 MiB.
`hosted_launch_stage_sim.js` passes with the catalog-derived, integrity-checked
runtime payload; it is a local rehearsal, not a hosted deployment.

For the BUILD-only combat-hash refresh, all three progression fixtures were
regenerated with `--reuse-baseline`. Before replacing them, the old fixtures were
preserved; all **126 current measurements and 126 reused historical measurements**
(42 gear, 21 moving, 63 growth in each set) remained byte-for-byte identical.
Only source/combat hashes advanced. `skill_balance_sim.js` passes.

Real Chromium acceptance exercised 15 unique lazy WebP forms without bulk-loading
the pack, failed local requests or page errors. It verified 12 painted desktop
cards, Aegiomon selection without fabricated evolution, Agumon → Meramon branch
evolution, selected-form attack frames in practice spar, a two-column 390 px
roster without horizontal overflow, and the 14-entry stage-not-listed filter.
This is not an exhaustive visual review of all 280 forms or a physical-touch
performance pass. The Digimon Up sprites still require separate publication
rights authorization; the upstream fan-use statement is not a rights grant.

## CPU work (haven-v419)

The CPU work has its own harnesses, and none of them is a Cloudflare measurement:

```sh
node tools/cpu_profile.mjs --runs 11 --batch 10 --json /tmp/after.json --label v419
# A/B against main: revert ONLY the three server files, same harness, same fixtures
git show origin/main:functions/api/save.js > functions/api/save.js   # etc, then restore
node tools/cpu_hotpaths.mjs --case save-put --size nearCap --runs 60
```

`cpu_profile.mjs` runs the real handlers against the real migrations in `:memory:` SQLite with a D1 shim
and counts statements. Three phases are kept strictly apart, because the earlier harness mixed them and
reported the harness's own work as the server's:

* **prepare** - module resolution and request construction happen BEFORE the CPU sample opens;
* **execute** - only the request; the sample is read when the `Response` object exists, and the body is
  never drained;
* **validate** - status, version and served encoding are checked AFTER the sample closes, and every
  assertion still throws.

It has two explicit invokers, not a global flag: `handler-only` (never imports the middleware module) and
`middleware` (the real `onRequest` with a real client address). Every run prints a measured invoker
counter and a list of the production components it does **not** include: workerd, the D1 binding, the
recovery-gate Durable Object and its two round trips, Tail Workers, the Social Worker. `cpu_hotpaths.mjs`
attributes self/inclusive time with the V8 sampling profiler and validates its own `--case/--size/--runs`.

`cpu_profile_invoker_sim.mjs` (28 checks) proves the claims above: middleware enters **0** times for
handler-only requests and **once** per middleware request, `execute()` never drains a body, `validate()`
is the only place that does, preparation precedes the sample, and conflict rows are labelled 409 rather
than accepted-save rows. `docs/CPU-LIMIT.md` records the numbers and the two experiments that were
measured and reverted.

**2026-11-18 gate, `haven-v419` + `main` (haven-v420), Node 22.22.3:** see the PR for the run after the
merge. The six known-red suites are unchanged from the base commit and do not touch this code:
`card_star_balance_sim` and `skill_balance_sim` (shallow clone, `git show d164bd0:index.html`),
`hosted_scrypt_prepare_sim` and `hosted_launch_stage_sim` (staging/git tooling), `panel_layout_smoke` and
`render_lost_boot_smoke` (DOM assertions). No assertion was weakened, no budget loosened and no fixture
re-hashed; `api_sim`'s save-sized parse count stays `assert.strictEqual(parses, 3)`.

## Plaza title artwork (haven-v440)

The three complete supplied sheets, including unused cells, live under
`tools/social-title-icons/`. With Pillow installed, run:

```sh
python tools/build_social_title_art.py --check
node tools/tests/social_title_art_sim.js
node tools/tests/digimon_sanctuary_ui_sim.js
node tools/tests/social_fishing_sim.js
node tools/tests/social_scene_sim.js
node tools/tests/publish_sim.js
node tools/tests/hosted_launch_stage_sim.js
```

The art generator verifies deterministic transparent cutouts against the retained
sheets; `social_title_art_sim.js` decodes all 56 WebPs and checks their alpha,
black fishing marks and cache-busted URLs. The publish check keeps the previous
classic and combined limits, checks the runtime files byte-for-byte and bounds the
new art separately. Unused source sheets and build/reference metadata remain in
the repository, not the publish folder. The staging-package test checks the
script, stylesheet and dynamic art URLs are carried into an owner-run rehearsal;
it does not deploy anything.
The unchanged combat fixture gate requires the pinned historical baseline commit.

For an optional desktop and emulated-touch phone Chromium check, start the
changes-only preview, build `dist/`, and run (with the documented Playwright
Chromium dependencies):

```sh
PREVIEW_PAGE=tools/mastery_update_preview.html python3 tools/preview_server.py 8000
bash tools/build_site.sh
node tools/check_social_title_art_browser.cjs
```

The checker decodes every DigiPet/fishing logo in the browser and verifies
transparent corners and unbacked title lines. It also compares rendered pixels
with and without each of the 50 mastery symbols on a light background inside a
transformed label: the symbol remains visible but the source's dark matte must
not appear. It uses emulated taps on the phone, verifies the separate player-name
styling is unchanged, checks the DigiPet header and collection stay within the
panel, and checks that chat stands aside for an open Fishing window and returns
when it closes. It checks the plaza label against a real rendered frame before
pausing continuous WebGL in the synthetic fixture.
For a shorter focused run, set `SOCIAL_ART_PROFILE=phone` or `desktop`, and/or
`SOCIAL_ART_TARGET=source` or `packaged` (the default runs both of each).

The browser check uses an isolated localStorage save and an offline synthetic
plaza; it is not a hosted multiplayer session or a physical-device test. The
preview's example choices do not write to a game save.
