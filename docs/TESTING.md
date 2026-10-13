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

For skill FX changes, run `python3 tools/build_afterglow.py --check` and
`node tools/tests/afterglow_sim.js` alongside the affected combat checks. The latter
exercises all 75 generated animations, the real cast lifecycle, projection at
reversed/vertical camera angles, canvas state, resize, expiry and dense-cast limits.
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
