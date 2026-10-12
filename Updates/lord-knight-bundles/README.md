# Lord Knight local sprite workshop

**Prototype only.** No game renderer, save schema, combat, BUILD, hosting configuration or production file list is changed. The original studios remain intact.

Start the repository server:

```sh
python3 tools/preview_server.py 8000
```

Open `/Updates/lord-knight-bundles/`. The page, scripts, catalog and all appearance bundles are local; its Content Security Policy restricts network requests to the same origin. Serve over localhost or HTTPS so Web Crypto is available. No third-party renderer is contacted by the browser. A local server must remain running; there is no service-worker offline installation.

## Coverage

- Lord Knight, native job/outfit 4008, sword family 2; male and female source renders.
- The original frozen 20 hairstyles per gender and native palettes 0–8. IDs are retained, including palette aliases.
- 360 appearances × nine animations = **3,240 native APNGs** packed into 360 `.pgap` files.
- Idle, walking and weapon-specific attack, each in authored S, SE and NE directions. Optional mirroring is labeled; it is not additional authored coverage. Five of the eight authored directions remain unfinished.
- Fixed native halo 69, glasses 3, archangel wings 1, original class outfit and baked source shadow. Accessory toggles and replacement costumes are not part of this pack.
- Source canvas 320×280, native anchor [160,200]. No pixel recoloring, drawn replacement art or manual weapon offsets.

Use the Character, Hairstyle and Native color controls to choose a look. Each gender retains its selection while the page is open. Still frame respects reduced motion. Attack plays one complete native action in the selected swing duration and holds its final frame; Play one attack restarts it. Idle and walking loop with their source delays and can stow the weapon naturally.

## Build and verify

Python 3.9+ with Pillow 11.3.0, and Node 24 were used. Reuse a suitable environment or create one as documented in the original hair studio handoff.

```sh
# Download only missing source responses; at most two concurrent requests.
/tmp/cosmetics-visual-env/bin/python tools/build_lord_knight_bundles.py --fetch
# Verify all packed PNG bytes, decode all native frames, timing and bounds. No network or writes.
/tmp/cosmetics-visual-env/bin/python tools/build_lord_knight_bundles.py --check
node tools/tests/appearance_bundle_sim.js
```

Without `--fetch`, generation uses preserved source art and the URL-addressed renderer response cache. With `--check`, every bundle must already exist. Generation checkpoints `manifest.json` atomically after each completed appearance and resumes from checked bundles. Run only one generator process at a time. A missing or damaged existing bundle fails explicitly; preserve its evidence before removing only the affected manifest record to regenerate it. Do not silently refresh successful renderer responses.

The URL cache remains under `$WORKSPACE_ROOT/workspace-context/class-weapon-cache/`. Completed bundles contain all required art and provenance, so the workshop and `--check` do not depend on that temporary cache or the old GitHub account. The earlier all-class studio's audit and validation summary are intentionally unchanged; this new pack has its own manifest.

### Browser audit

Measured results and limitations are recorded in [VERIFICATION.md](VERIFICATION.md).

Open the workshop in the shared browser, evaluate `tools/check_appearance_bundle_browser.js`, then inspect `window.appearanceAudit` until its status is `pass` or `failed`. It parses every bundle, decodes every animation, checks nonempty browser frames and disposal, and requires exactly one request per appearance. It does not play the game or measure phone GPU frame rate. `tools/check_appearance_controls_browser.js` checks real controls, gender selection memory, one-swing timing, failure/retry, viewport bounds and same-origin resource requests.

## Bundle format and provenance

The existing PGAP1 proof format is extended with appearance identity and source metadata:

1. Six-byte ASCII magic `PGAP1\n`.
2. Four-byte big-endian JSON-header length.
3. UTF-8 JSON header (schema 1): dimensions, anchor, original catalog SHA-256, native appearance IDs and exactly nine animation entries.
4. Concatenated **unchanged PNG response bytes**; offsets are relative to payload start.

Each entry includes source URL, native action, stance/direction, PNG SHA-256, decoded RGBA SHA-256, frame count, native delays and per-frame nontransparent bounds. `source` distinguishes preserved studio bytes from cached provider responses. Filenames include the bundle content hash; the manifest stores the full SHA-256 and byte length. The loader validates the whole bundle, each PNG, view identity, ranges, dimensions, APNG counts and native delays before decoding.

Art provenance: classic Ragnarok Online / Gravity through the [ragassets renderer](https://github.com/adsonpleal/ragassets). Existing asset-use requirements and attribution continue to apply. The saved source URLs describe the exact native composition.

All new PNGs are decoded with Pillow and checked for nonempty, unclipped frames. Existing studio samples also have armed/unarmed comparison evidence. Newly filled front/rear permutations use the same native Lord Knight sword actions (80+direction), but this builder does **not** repeat unarmed-baseline pixel comparisons for every added permutation. Geometry checks and native action provenance do not constitute a geometric proof of every grip pixel.

`decoder.js` copies the current game's existing APNG compositing functions into this isolated prototype, with the original block hash recorded in its header. Its inflate helper uses a stream pipeline to propagate decompression errors. The game source itself is untouched. The prototype preserves the decoder's blend/dispose behavior and paints a new canvas frame only when the displayed frame, appearance, view or mirror changes.

## Loading and memory

`ActiveLook` retains one compressed appearance bundle and one decoded animation strip. Direction/stance changes reuse the bundle. A switch keeps the last good appearance visible until the requested view decodes successfully; it then releases the previous canvas. A queued request supersedes older requests, fetches are aborted, and stale decoded canvases are freed. Decodes are serialized. Failure leaves the last good appearance visible and offers Retry.

The resident decoded-pixel budget is 32 MiB, including old and candidate strips during a switch. Browser canvas backing stores, compressed buffers, decompression arrays and garbage-collection timing are additional; the displayed counter is **not total process/GPU memory**. Only one view is retained after a successful switch. Full-game performance and real-phone memory/FPS remain unverified.

## Cloudflare free-plan fit

The prototype is excluded by `tools/build_site.sh`, which continues to publish only the game and its existing assets. These bundles are below Pages' documented 25 MiB per-file limit and add 360 art files when deliberately packaged for a future approved release, well below the 20,000-file limit. They require no Functions, D1 writes, R2 or paid service. No hosting settings or billing were changed.

Use the original [performance report](../hair-color-preview/PERFORMANCE-AND-HOSTING.md) for the full-roster packaging projection and API quotas. This task implements the Lord Knight prototype, not the proposed complete 6,840-bundle production catalog. Expanding direction/accessory/class coverage requires rebuilding the file/memory budgets before integration.
