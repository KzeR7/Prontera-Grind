# Performance and Cloudflare free hosting — appearance expansion

Assessment date: 2026-10-12. Scope: prototype measurements and a production integration plan; no Cloudflare settings, billing, game runtime or deployment changed.

## Answer

**Keeping Cloudflare hosting at $0 is feasible with static asset bundles, loading only the equipped appearance, and the existing API/save cadence.** The large catalog does not need to be resident in memory. Simply publishing every standalone animation would exceed the free Pages file limit, however. A full-game no-lag guarantee is not established: shared Chromium has no usable WebGL and no real phone was tested.

The studio now offers idle, walking and weapon-specific attack for all classes, both genders, 20 hairstyles each and palette IDs0–8. Normal native idle/walk can stow weapons. The preview uses S/SE/NE with explicit mirroring; eight separately authored directions remain future production coverage.

## Actual project configuration

- `wrangler.toml`: Cloudflare Pages, build command `bash tools/build_site.sh`, publish directory `dist`, D1 binding `DB` for saves.
- `_routes.json`: **only `/api/*` invokes Functions**. Published appearance files under `/assets/appearance/` should remain outside those routes.
- Production output currently contains 314 files, about 23 MB (exact bytes in `asset-costs.json`). The studio is excluded from production.
- `index.html`: cloud save debounce60 seconds while visible,300 seconds while hidden; local saves retain existing behavior. Do not create an API call for every hair click or animation frame.
- The existing GM usage endpoint/card can show Cloudflare metered requests and D1 reads/writes when its analytics credentials are configured. Its fallback ledger is not an exact billing meter. The dashboard is the alternative; no credentials or account usage were available to this assessment.

## Official free-plan limits checked

| Service | Current documented free allowance | Relevance |
| --- | --- | --- |
| Pages static assets | Requests free and unlimited when Functions are not invoked | Sprite downloads remain static |
| Pages site files | 20,000 files per free-plan site | Individual-per-animation publication does not fit |
| Pages asset size | 25 MiB maximum per file | Keep every bundle below this, verified at build time |
| Pages builds | 500 per month, one concurrent;20-minute build timeout | Pre-generate artwork outside the Pages build |
| Pages Functions / Workers Free | 100,000 requests/day shared across the account;10 ms CPU per request | Login/save/API traffic; do not render PNGs inside Functions |
| D1 Free | 5 million rows read/day,100,000 rows written/day,5 GB total storage | Existing saves/economy; store IDs, never image data |

Sources (official, fetched 2026-10-12):

- [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

D1's daily limits reset at 00:00 UTC. Reaching free limits can cause errors until reset; it does not establish unlimited capacity. Worker Free exhaustion likewise can reject requests. A paid upgrade is not needed just to add cosmetics; future player traffic and other account workloads still matter. This task did not read live account usage or verify a particular player's billing plan.

**Do not make R2 a prerequisite for a strict-$0 first release.** [R2](https://developers.cloudflare.com/r2/pricing/) has free monthly allowances (10 GB-month Standard storage,1 million Class A operations,10 million Class B operations) and free egress, but exceeding allowances can incur storage/operation charges. The recommended first implementation uses existing Pages static hosting.

## Browser and memory measurements

`tools/benchmark_appearance_browser.js` extracts and runs the current game's exact `skinDecodePng` function. It downloads bytes first, then performs one warmup plus five timed decodes. These are source PNGs on the sandbox browser, not a simulation of mobile network speed.

| Side-facing male Lord Knight asset | Download bytes | Frames | Decoded RGBA | Median decode |
| --- | ---: | ---: | ---: | ---: |
| Current walking |47,432|8|1.22MiB|15.6ms|
| Current attack |27,760|5|0.76MiB|8.8ms|
| New idle |11,657|3|1.03MiB|6.5ms|
| New walking |24,992|8|2.73MiB|8.2ms|
| New attack |26,961|9|3.08MiB|11.4ms|

The larger 320×280 canvas has2.24× the pixels of the current200×200 canvas. Download size and decoded memory are different: compression makes the new walking file smaller here, while it needs more decoded memory. One direction's three new animations use6.84MiB of raw frame pixels. Raw frame totals exclude compressed buffers, temporary decoder arrays, duplicate canvas storage and GPU textures, so actual peak memory is higher. Decoding all nine stance/direction views is larger; see the measured reference bundle below.

The batched canvas test measured roughly0.002ms per draw call submission; **that is not GPU completion time or game FPS**. The browser was cloud Chromium140/Linux with4 reported logical processors. WebGL probing returned false. No GPU gameplay benchmark, low-end phone test, or production-latency measurement passed here, and no such result is implied.

The practical risk is a hitch when decoding a new outfit in the middle of combat, especially after rapid selector changes. Cosmetic choices do not inherently multiply per-frame work when only one precomposed character frame is drawn. Real battle scenes, damage effects and texture uploads still require validation after integration.

## Measured packaging costs and file-count plan

| Item | Result | Evidence status |
| --- | ---: | --- |
| Current production build |314 files /22,284,944 bytes (21.25MiB)|Measured build output|
| One new male Lord Knight look, all3 stances ×3 directions |9 animations /60 frames|Measured native sample|
| Same look, binary bundle |190,743 bytes (186.27KiB)|Built and round-trip verified|
| Same look, decoded frame pixels |21,504,000 bytes (20.51MiB)|Calculated from measured dimensions/frame counts|
| Current Lord Knight set, three walk views +attack |4.43MiB decoded pixels|Measured frame counts; different coverage from new nine-view set|
| Every combination as separate APNGs |81,000 files;162,000 with separate first-frame PNGs|Exact catalog count; exceeds free Pages20,000-file limit|
| Full compressed APNG collection |About1.50GB (1.40GiB)|Projection from class-balanced samples; not downloaded in full|
| All decoded combinations resident at once |About177.84GiB|Projection; explicitly not the proposed loading strategy|
| One bundle per class/gender/style/palette |6,840 bundles|Proposed file-count design|
| Bundles +360 thumbnails +1 manifest +existing314 files |7,515 files|Projection; fits20,000-file limit with headroom|

The size projection uses150 class/gender/weapon/direction samples per stance, each weighted by180 style/palette choices. This avoids over-weighting the many Lord Knight palette samples. It does not claim every hair has identical compressed size, and it does not subtract possible identical-content deduplication. Future costumes/accessories can multiply the number of looks; rerun the budget before adding those axes.

**Tested packing proof:** `tools/measure_appearance_costs.py` created `measurements/lord-knight-m-head2-palette0.pgap` and read every embedded APNG back with identical SHA-256. The format is six ASCII bytes `PGAP1\n`, a4-byte big-endian JSON-header length, the UTF-8 JSON index, then concatenated native PNG bytes. Entry offsets are relative to the payload start and include length, SHA, stance, direction, frames and delays. Packaging overhead for this example is2,080 bytes. This proves lossless static bundling of one appearance; a production parser, validated bounds, manifest, cache and game adapter still need implementation.

A bundle should be fetched once per equipped look, not once per rendered frame. Download all needed native PNGs together if small enough, then decode only currently needed views. Full catalog export should run offline or in a deliberate asset-production job, with chunked/resumable source fetching. Do not make Cloudflare's build clone/decode a giant inline atlas or wait for81,000 live image renders.

## Required integration changes

1. **Prebuild native art offline.** Use the frozen source IDs and authored action mappings. Do not run the public renderer or image-generation work inside a Function, on login, or during the20-minute Pages build. The source provider is a research/build dependency, not a production rendering service.
2. **Bundle by complete appearance.** Proposed key: class/gender/head/palette, with stance/direction/weapon entries inside one binary bundle. Include costume/accessory/catalog-version identity when they become selectable. Keep exact PNG bytes and metadata; do not base64-embed the whole catalog in index.html. The `.pgap` file in `measurements/` is one lossless proof, not a shipped loader.
3. **Fetch only the equipped bundle.** Keep a small manifest and static hair thumbnails. Decode the current stance/direction first; prefetch the next required views after the visible frame is ready. Use a revision/generation token, ignore stale loads and switch appearance atomically.
4. **Use a memory budget rather than a strip count.** Current `SKIN_STRIP_KEEP=18` assumes smaller frames. Initial engineering targets:32MiB decoded character cache on mobile,64MiB desktop, measured against actual devices. Evict least-recently-used unpinned strips; keep only the current hero and the visible preview. A preview should not pin every view of a second full class. Dispose old textures/canvases and release temporary decode arrays.
5. **Move decoding out of the combat hot path.** Prepare before Apply completes; yield between decodes or use a Web Worker/OffscreenCanvas where supported. Preserve a compatible fallback. Deduplicate byte-identical idle frames only after checking their original timing; never assume every idle animation is one static frame.
6. **Preserve one swing per attack.** Keep `skinSwingMs` tied to combat progress, not an independently looping APNG. Native precomposed weapons must disable the old `drawSkinWeapon` overlay on that route. Ordinary idle/walk should retain their native stowed appearance, not copy an attack weapon over them.
7. **Avoid unnecessary texture uploads.** Current `captureSkinFrame` sets `tex.needsUpdate=true` every paint. For the native precomposed path, redraw/upload only when the source frame, pose, mirror, appearance or visible effect changes. At60 paints/s a full320×280 RGBA upload represents about21.5MB/s per hero before driver overhead; at10 changed frames/s it is3.58MB/s. These are arithmetic estimates, not GPU measurements. Keep animated glints/effects updating when needed.
8. **Publish static hashed assets.** Put bundles in a deliberate location under `assets/`, maintain `/api/*`-only function routing, use versioned filenames and appropriate static caching. Add build gates for total files<20,000 and each asset≤25MiB. `build_site.sh` currently copies assets; do not publish all Updates folders.
9. **Save small appearance IDs through the existing save.** No new database row per stance/frame/color preview. Apply changes once, use existing synchronization and preserve owner/version protections. Do not change economy, reward or authentication cadence merely to add visuals.
10. **Run real-device release gates.** Track warm/cold appearance switch latency, peak decoded heap plus GPU textures, battle-frame p95/p99, long tasks and cache recovery. A60Hz frame has16.7ms total budget; a 30 Hz frame33.3ms. Agree product targets, profile a modest Android/iPhone and desktop, and fix measured spikes before declaring the integration smooth.

## Free-plan capacity is driven by API use, not hair count

A continually active client with one scheduled save per minute produces up to1,440 scheduled save requests/day; this is an illustration, not a player capacity estimate. Login, polling, boards, retries, multiple tabs and other Workers add requests. A save can touch more than one D1 row or index; do not assume one save equals exactly one billed row written. Existing code throttles hidden tabs to reduce activity. Use the GM metered usage card or Cloudflare dashboard to see actual totals, and keep headroom.

Changing a numeric hairstyle/palette field inside an existing save does not itself require another request or image storage in D1. Adding static art therefore need not raise backend compute cost. Retaining$0 still depends on the documented quotas, a package build that fits the static limits, and future traffic.
