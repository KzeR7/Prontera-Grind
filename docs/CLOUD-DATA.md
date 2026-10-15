# Cloud data and delivery size

Local audit: 2026-10-15, updated after World Atlas integration. Sizes below are decimal MB (1,000,000 bytes), not monthly
account usage, provider billing or a guarantee about a hosting plan.

## What uses cloud resources

- **Published storage:** the assembled `dist/` tree, not the full Git repository.
- **Player downloads:** HTML/code and requested artwork. The total published tree
  is not one visit's transfer. Native wardrobe/pet artwork is loaded on demand;
  `sprite_pack_data.js` is a legacy fallback, not normal native startup artwork.
- **API/database usage:** account/session/save/leaderboard requests and stored
  records. `_routes.json` includes only `/api/*`; static resources do not invoke
  Pages Functions under this configuration. Save frequency/player count matter
  separately from image sizes. No live account usage or current pricing was read.
- **Rendering:** geometry, ambient movement and native animation run in the
  browser, not a stream of cloud-rendered frames. The new journey preview makes
  no game API/save calls. Future live integration should persist progression
  identifiers, not generated scene geometry or texture pixels.

## Changes and measured sizes

| Item | Before | After | Meaning |
| --- | ---: | ---: | --- |
| Production static tree: adding in-game exploration | 39,769,265 B | 44,190,234 B | 1,195 files; about 44.19 MB / 42.14 MiB, not a visit's download |
| Production static tree: latest main skill FX + exploration | 44,190,234 B | 44,603,321 B | 1,196 files; about 44.60 MB / 42.54 MiB; skill FX retained from main, exploration payload unchanged |
| Three journey environment images | 6,523,346 B | 3,734,024 B | 42.8% smaller with exactly the same decoded pixels |
| Astral opening: environment images | 6,523,346 B | 2,289,304 B | 64.9% smaller: stone + space only; lava deferred |
| Thor opening: environment images | 6,523,346 B | 2,817,162 B | 56.8% smaller: stone + lava only; space deferred |
| Journey stage change / return to already loaded destination | Previously eagerly loaded | No additional environment image requests | Shared image/promise cache for this page's lifetime |

The earlier production optimisation still saves **186,336 bytes**, from removing whitespace in four
ordinary map-kit JSON delivery copies. Parsed values are strictly checked before
writing; source documents, PNG artwork, native catalogs/metadata and fallback
bytes are untouched. Hosting compression may make the actual transfer difference
smaller than this raw-file saving. The build now needs Node as well as Bash.

The lossless assets now also ship for the in-game **World Atlas → Season 2 Maps** view. The selected runtime is 4,410,802 bytes, including a local
renderer and its MIT license, code and three WebP images. It loads **only on opening
exploration**, not on login or when merely opening the atlas. Relative to the
pre-exploration game, initial HTML/controller additions are 10,167 raw bytes; this is not a
compressed network-transfer measurement. A build guard caps the whole site at
43 MiB and selected exploration resources at 4.25 MiB.

The game adapter selects runtime files from the reviewed workshop sources into
`dist/assets/endgame/`; it does not publish tools, source PNG masters, proposal
art or captures. The workshop/reference studio remain developer-only pages. Their
PNG masters are retained for editing and exact-pixel verification, not shipped.
The scene has no save/API calls; the parent game's original farming and normal
account/save traffic continue separately. Exploration unlocks/rewards are not live.

Actual Chromium checks observed only the two Astral WebP requests on opening,
with HTTP Content-Length matching the manifest; switching to Thor requested lava
once, and returning/stage navigation requested no additional environment images.
The earlier standalone-workshop local initial Astral page's advertised response-body total was
**3,318,502 bytes**, including code/native-character resources. This is a local
request/header audit, not a production wire/billing measurement; TLS/HTTP headers,
compression, browser caches and deployed responses can differ. Resource Timing
size fields were unavailable in this software-browser environment and are not used
as a bandwidth measurement.

## What is deliberately not deleted

The active wardrobe catalog references all 615 non-catalog files in v5; the pet
catalog references all 162 non-catalog files in v1. They are not obsolete duplicates.
The skill artwork and legacy fallback remain necessary runtime resources. Removing
classes/pets or the fallback to make a smaller number would remove functionality.
Native sprite pixels, directions, timing and placement have not been modified.

Concept art, review screenshots, source PNGs, scripts and documentation are already
absent from `dist/`. The build/test now explicitly rejects `docs/` alongside tools
and source-art folders. `docs/` was also added to the advisory `.assetsignore` list;
**publishing only `dist/` is the tested boundary**, not relying on root-directory
ignore behavior. Do not publish the repository root to save a build step.

## Reproduce / maintain

```sh
bash tools/build_site.sh
node tools/tests/publish_sim.js
node tools/tests/map_delivery_sim.js
CHROMIUM_BUNDLED_LIBS=1 node tools/check_map_journey_browser.js http://127.0.0.1:8000 --publish
```

For regenerated environment artwork, install Pillow with WebP support in your
Python environment, then run `python3 tools/maps/build_runtime_textures.py`.
It writes content-hashed lossless WebP copies and `runtime-manifest.json`, verifies
source/decoded pixel equality and removes only superseded copies from its previous
manifest. Never run native sprite files through this environment-only pipeline.
Refresh browser captures after changing workshop source/runtime assets.

Browser HTTP cache behavior across reloads depends on deployed response headers;
no long-lived cache headers or cloud configuration were changed here. Lossless
compression reduces stored/downloaded image bytes, **not decoded GPU texture
memory**. No deployment, remote migration or live account change was performed.
