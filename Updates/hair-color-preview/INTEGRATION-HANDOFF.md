# Hair, native colors and weapon attachment — next-agent handoff

Date: 2026-10-12. Repository: `kingz00002/Prontera-Grind`.
Inspected base revision: `2fd019f71aaf3f5ae7e769a81eafe897841b9b81`.
This is a prototype and implementation plan. Items marked **planned** below are not implemented in the live game.

## 1. User request and current result

**Current update:** Idle and walking are now selectable alongside attack. Read [PERFORMANCE-AND-HOSTING.md](PERFORMANCE-AND-HOSTING.md) for measured decode/memory/asset costs, Cloudflare free-plan limits and the recommended static bundle/cache design. The compact download now embeds starter looks rather than the entire sample collection; use the source and three art archives together for the complete local studio.

The latest request adds idle/walking and asks whether the future integration can stay smooth on Cloudflare free hosting. The owner previously requested 20 randomly selected hairstyles for male characters and 20 for female characters, color options for all existing classes, and detailed documentation for the next agent. Earlier requests established accurate native weapon attachment, headgear, face accessories, wings and costumes as the direction.

Implemented here:

- A separate hair/color studio at `/Updates/hair-color-preview/`.
- All 19 current classes, both genders and each class's allowed weapon families.
- Independently selected 20-style lists for each gender; selection is frozen, not rerolled on page load.
- Native palette IDs 0–8 for each selected hairstyle. These are **nine catalog entries**, not a promise of nine visually distinct colors. `validation-summary.json` records exact duplicate render groups for each style.
- Separate male/female hair and color controls, swatches, 40 thumbnail choices, animation/still mode, explicit mirror, retry and a saved-sample shortcut.
- Real authored S, SE and NE views for idle (base 0), walking (base 8) and weapon-specific attack actions. Idle requests pin `headdir=straight`. Source compositing includes Angel Halo (headgear view 69), Glasses (view 3) and Archangel Wings (garment 1), with each class's own outfit.
- 81,000 selectable combinations: 50 class/gender/weapon routes × 20 styles × 9 palettes × 3 directions × 3 stances. Still mode uses frame 0 of the same source action; it is not another hairstyle.
- Local sample assets and an audit. Other combinations request the renderer when selected. Browser loading does not mark a remote combination as audited or persist it to the repository.

**Not implemented:** live save changes, an in-game barber, live hair/weapon rendering changes, color unlocks/prices, full replacement costumes on all classes, arbitrary custom weapon attachment, eight authored directions or exhaustive rendering of all 81,000 combinations. Current game files and BUILD stay unchanged.

## 2. Frozen selection and palette meaning

Seed: `aa3233f5635d02c9192a5048c7dd905e`.

Algorithm: take human style IDs from the saved provider catalog; for each gender independently, rank each style by SHA-256 of UTF-8 `seed|gender|id`; choose the lowest 20 hashes, then sort IDs numerically for display. The seed was randomly generated once. The saved lists, not a language-specific RNG implementation, are the authoritative selection.

| Gender | Native head IDs |
| --- | --- |
| Male (`m`) | 2, 5, 7, 8, 10, 12, 17, 19, 20, 22, 24, 26, 27, 28, 30, 32, 35, 39, 40, 42 |
| Female (`f`) | 2, 4, 5, 12, 13, 14, 15, 17, 18, 19, 21, 24, 27, 30, 34, 35, 37, 39, 41, 42 |

The reference catalog has 42 styles per human gender. Each selected style advertises `colors: 9`. Provider `projectHair()` computes this as maximum palette ID + 1; therefore use `headPalette=0` through `8`, **not 1 through 9**. `headPalette=-1` means the sprite's standard palette and is deliberately outside the nine-entry selector. Do not conflate `-1`, palette 0, UI index 0 and the game's existing `S.hair=0`.

Source swatches are representative samples from one rich style per gender. They are approximate UI hints; the full rendered character is the accurate reference. Duplicate palette entries remain selectable under their native IDs to preserve provenance. No CSS filters, hand-painted color changes, `skinTone`, `skinColor` or body palette overrides are used.

Saved reference SHA-256:
`916321a53e2c60880d1d4999217f954cfc4198e8a5b00fdd6fa501aaa2043d56`.

## 3. Source links and request contract

- [Hair catalog](https://assets.latam-tools.com.br/raw/hair.json): human/doram styles and palette counts/swatches. Local snapshot: `hair-source.json`.
- [Renderer documentation](https://github.com/adsonpleal/ragassets): `/image`, APNGs, `head`, `headPalette`, `frame`, `canvas`, native garment/weapon composition.
- [Catalog extraction source](https://github.com/adsonpleal/ragassets/blob/main/extract-grf.mjs): `projectHair`, `paletteSet`. Explains zero-based palette range and approximate swatches.
- [Weapon action table](https://github.com/MrAntares/roBrowserLegacy/blob/master/src/DB/Jobs/WeaponAction.js).
- [Weapon type IDs](https://github.com/MrAntares/roBrowserLegacy/blob/master/src/DB/Items/WeaponType.js).
- [Current repository](https://github.com/kingz00002/Prontera-Grind).

Example male Lord Knight, selected hair 2, palette 0, sword, side attack:

```text
https://assets.latam-tools.com.br/image?job=4008&gender=male&head=2&headPalette=0&headgear=69%2C3&garment=1&weapon=2&action=87&enableShadow=true&canvas=320x280%2B160%2B200
```

Add `&frame=0` for an actual static image; omit `frame` for the native APNG. Image elements can display remote images without canvas access. A future game canvas decoder should use locally published assets, avoiding reliance on provider CORS or availability during combat.

Assets are classic Ragnarok Online / Gravity artwork served by this third-party renderer, not RO3 artwork. This handoff documents provenance; it does not establish a new redistribution license. Preserve source attribution and the project's existing asset-use requirements when publishing.

## 4. Class and weapon action mapping

`catalog.json` is the studio's complete frozen catalog. Its class names and weapon lists are tested against the current `CD` table in `index.html`.

| Class | Native job | Allowed weapons | Base attack action |
| --- | ---: | --- | --- |
| Novice | 0 | dagger, sword | Male dagger 80/sword 88; female dagger 88/sword 80 |
| Swordman | 1 | sword | 80 |
| Mage | 2 | staff | 80 |
| Archer | 3 | bow | 80 |
| Thief | 6 | dagger | 80 |
| Acolyte | 4 | mace | 80 |
| Merchant | 5 | axe, mace | 80 |
| Knight | 7 | sword | 80 |
| Wizard | 9 | staff | Male 80; female 88 |
| Hunter | 11 | bow | 88 |
| Assassin | 12 | katar, dagger | Katar 88; dagger 80 |
| Priest | 8 | mace | 80 |
| Blacksmith | 10 | axe, mace | 88 |
| Lord Knight | 4008 | sword | 80 |
| High Wizard | 4010 | staff | Male 80; female 88 |
| Sniper | 4012 | bow | 88 |
| Assassin Cross | 4013 | katar, dagger | Katar 88; dagger 80 |
| High Priest | 4009 | mace | 80 |
| Whitesmith | 4011 | axe, mace | 88 |

Direction offsets: S=0, SE=7, NE=5. `action = stance base + offset`: idle base 0, walking base 8, attack base from the table. Ordinary idle/walk may stow the weapon. The unarmed comparison is retained but visible-weapon differences are required only for attack. A separate combat-ready pose (base32) exists in the source but is outside this three-stance studio.
Weapon type IDs: dagger=1, sword=2, axe=6, mace=8, staff=10, bow=11, katar=16.

Do not use bare-handed action 40/47 and assume setting `weapon` fixes the grip. Earlier tests found no sword pixels for those actions. The correct sword animation on Lord Knight has nine frames; the current bare-handed source has five. Neither an index-for-index overlay nor a universal attack action works across the roster.

## 5. Files and responsibilities

All paths below are repository-relative.

| File | Responsibility |
| --- | --- |
| `Updates/hair-color-preview/catalog.json` | Frozen selections, seed, palettes, classes, weapons, directions and source identity |
| `Updates/hair-color-preview/catalog.js` | Browser mirror of catalog JSON; tests require exact equivalence |
| `Updates/hair-color-preview/hair-source.json` | Original provider hair catalog bytes |
| `Updates/hair-color-preview/model.js` | Pure validated selection → native request/key; shared by browser and Node tests |
| `Updates/hair-color-preview/preview.js` | Independent gender controls, source choice, stale request guards, timeout/error/retry and reduced motion |
| `Updates/hair-color-preview/index.html`, `preview.css` | Responsive preview interface |
| `Updates/hair-color-preview/art/` | Native APNGs and exact decoded first-frame PNGs |
| `Updates/hair-color-preview/audit.json`, `manifest.js` | Cached case provenance, hashes, frame delays, weapon-vs-unarmed pixel counts, bounds and status |
| `Updates/hair-color-preview/validation-summary.json` | Independent decoder results and palette render equivalence |
| `tools/fetch_hair_colors.py` | Sample/full plan, filters, download/recheck, merged atomic audit checkpoints |
| `tools/fetch_class_weapons.py` | Shared native fetch/cache/APNG inspection; retained for earlier prototype |
| `tools/export_hair_colors.py` | Reproducible standalone HTML, contact sheets and handoff/source archives |
| `tools/tests/hair_color_sim.js` | Selection reproducibility, 81,000 routes, asset identities and real controller behavior |
| `tools/check_hair_color_browser.js` | Shared-browser check of all cached animations and 360 hair/color choices, including standalone HTML |
| `tools/tests/hair_color_assets.py` | Decode every cached frame; still equality, dimensions, timing, bounds, actual palette changes |

Asset key:
`<job>-<sex>-<weapon-family>-<head-id>-<palette-id>-<direction>` for attack; append `-idle` or `-walk` for the other stances. The original attack keys/filenames remain valid.
It describes the current fixed cosmetic set only. **Planned:** extend the production key with costume/outfit, headgear, face accessory, garment, shield and catalog/art revision before any of those become selectable. Otherwise different looks will share stale textures.

## 6. Reproduce and extend the prototype

Serve from the repository root using the configured preview server:

```sh
python3 tools/preview_server.py 8000
# Open http://localhost:8000/Updates/hair-color-preview/
```

Python asset tools require Pillow. This task used Python 3.9.25, Pillow 11.3.0 in `/tmp/cosmetics-visual-env`, and Node 24.14.1. That temporary environment is not guaranteed to survive restoration. Reuse any suitable existing environment; if absent:

```sh
python3 -m venv /tmp/cosmetics-visual-env
/tmp/cosmetics-visual-env/bin/pip install Pillow==11.3.0
```

Normal sample rebuild:

```sh
/tmp/cosmetics-visual-env/bin/python tools/fetch_hair_colors.py --fetch
/tmp/cosmetics-visual-env/bin/python tools/tests/hair_color_assets.py
node tools/tests/hair_color_sim.js
/tmp/cosmetics-visual-env/bin/python tools/export_hair_colors.py
```

No-network audit rebuild is the same generator command without `--fetch`. It needs the original armed and unarmed response cache, not just the `art/` directory. The cache is at `$WORKSPACE_ROOT/workspace-context/class-weapon-cache/` and keyed by SHA-256 of the exact request URL; it is not included in source archives. If `WORKSPACE_ROOT` is unset, this cloud checkout layout is assumed. On another checkout, set `WORKSPACE_ROOT` to your workspace root explicitly. Downloads use at most two worker threads, per-URL locks, a 45-second request timeout and up to three network attempts.

Sample mode renders all 360 gender/style/palette combinations on Lord Knight sword SE in each stance, plus 150 class/gender/weapon/direction routes with deterministic selected hair/palette choices, repeated for idle, walking and attack. Two overlaps per stance leave **1,524 unique planned samples**. An additional 12 starter-look views complete the first hair/palette on Lord Knight in all three directions: **1,536 audited looks** in this delivery. Audit checkpoints occur every ten results and are merged by key; reruns reuse response bytes and can resume after interruption. Run one generator process at a time; thread locks are not cross-process locks.

Optional exhaustive cache (**planned follow-up; not run for this delivery**):

```sh
/tmp/cosmetics-visual-env/bin/python tools/fetch_hair_colors.py --fetch --mode full
# Or expand in bounded batches, retaining previous audited cases:
/tmp/cosmetics-visual-env/bin/python tools/fetch_hair_colors.py --fetch --mode full --class 'High Wizard' --sex f --stance walk
/tmp/cosmetics-visual-env/bin/python tools/fetch_hair_colors.py --fetch --mode full --class 'Novice' --hair 2 --palette 3 --direction SE
```

Full mode means 81,000 armed cases plus unarmed comparisons, not 81,000 network requests total. This can take substantial time and storage. Keep concurrency at two and respect provider failures. `--fetch` only fetches cache misses; it does not refresh successful responses. For an intentional upstream refresh, archive old provenance, remove only chosen URL cache entries, rebuild and revalidate.

When changing the selection: update `catalog.json`, regenerate `catalog.js` as `window.HAIR_CATALOG=<JSON>;`, rebuild samples, run both tests and export again. When changing the catalog revision, archive/reset the old audit and art first so merged records do not claim obsolete selections. Preserve IDs already saved in any future production catalog; do not silently replace a saved choice with an unrelated style. To deliberately reroll, generate/store a new seed, recompute lists using the documented algorithm, and treat it as a new catalog revision.

## 7. Validation meaning and limits

Completed results are recorded in `validation-summary.json`, `audit.json` and the workspace validation record. Tests distinguish three levels:

1. **Selectable:** all 81,000 combinations resolve to the correct job, gender, hair, palette, weapon and action; still mode adds `frame=0`. This is request validation, not asset availability proof.
2. **Audited native samples:** all 1,524 planned samples plus 12 starter views are downloaded and decoded; every frame is nonempty and fits 320×280. Attack frame counts/delays match the unarmed action and contain visible weapon differences. Idle/walk retain native timelines; the baseline is sampled at each rendered-frame start when the native timeline differs. Native idle/walk visibility is recorded without forcing a drawn weapon. APNG/first-frame hashes are pinned. Palette renders are compared to establish actual changes and duplicates.
3. **Browser/visual checks:** saved and remote selections, controls, failure handling, reduced motion, responsive geometry and generated contact sheets. See the validation record for the exact observed results; do not label the entire 81,000-image set visually reviewed.

Weapon-pixel differences prove that the weapon rendered; they are not a mathematical guarantee that every grip pixel is perfect. Native action data supplies the attachment. The 320×280 canvas and anchor `+160+200` belong to this renderer study; they cannot be pasted into the game's 200×200 constants without adaptation. Source shadow is baked in this study; decide deliberately whether to keep it with the game's ground shadow.

## 8. Current live rendering and save behavior — inspect before editing

Use symbol searches rather than relying on line numbers, because `index.html` is a large evolving single-file game.

- `fresh()` initializes `sex:'m', hair:0`. `S.hair` is a legacy index into the packed fallback head atlas, with handlers wrapping modulo 19. There are duplicate `hair` handler definitions; resolve their real dispatch behavior when integrating. It is not a native head ID.
- `skinPack(cls,sex)` caches only `class|gender`, using `window.CLASS_SKINS` from `assets/class_skins_data.js`.
- `tools/make_class_skins.py` measures existing 200×200 APNGs under `Updates/Sprite/`. `S`, `SE`, `NE` and `attack` are required views; some High Priest art also has `N`.
- `skinRoute()` maps eight gameplay directions to those supplied views/reflections. Attacks currently share one supplied attack view plus mirroring.
- `mkSkinHero()` assumes `SKIN_SIZE=200`; `skinViewEnsure`, `skinStrip` and related decoder/cache paths share the source files. Preserve the APNG decoder's timing/disposal behavior.
- `skinFrameIndex()` chooses native delay intervals. `skinSwingMs()` maps one combat swing onto the entire attack timeline using `atkAnim`, and clamps before wraparound. **Keep one swing = one full visual attack; do not tie damage to an independently looping browser APNG.**
- `captureSkinFrame()` draws the base frame then calls `drawSkinWeapon()`. The latter uses `skinWeaponPlacement()` and `SKIN_WEAPON_DEFAULTS`, with manually authored offsets and custom icons.
- `ensureHero()` chooses the loaded class skin and falls back to `packTex`/the old sprite pack while art loads. `packTex()` consumes legacy hair indices. Native APNG hair is baked into current class images; changing `S.hair` alone does not alter it.
- `drawSkinPreview()` powers appearance/class/portrait/equipment previews; it presently receives class and gender only.
- `save()`/`load()` handle local and cloud state. `functions/api/save.js` stores the serialized save blob; `functions/_lib/validate.js::checkSaveBlob` limits blob size to 512 KiB and checks existing invariants. Do not store images/base64 in saves or bypass owner/version/offline-claim protections.

## 9. Planned integration — recommended sequence

### Phase A: Versioned appearance model and safe migration

Add a dedicated catalog and an additive state field. Illustrative shape (not implemented):

```json
{
  "appearance": {
    "version": 1,
    "catalogVersion": "ro-hair-2026-10-12",
    "bySex": {
      "m": {"mode": "legacy", "headId": null, "headPaletteId": null},
      "f": {"mode": "legacy", "headId": null, "headPaletteId": null}
    }
  }
}
```

Keep `S.sex` as the existing selected gender. Maintain independent stored choices so switching gender restores the previous style/color. Preserve old `S.hair` for the fallback pack. Old saves start in `legacy` mode and retain their existing art; do not blindly reinterpret `hair:0` as a provider head ID or force all old characters into style 2.

Implement one pure normalizer used by fresh/load/import/cloud resume/UI actions. Validate version, exact integer type, gender-specific whitelist and palette IDs; reject NaN/fractions/unknown values and fall back predictably. Unknown future catalog data must not crash or corrupt saves. A confirmed native choice switches only that gender to `mode:'native'`. Keep appearance account/character-wide across job changes unless the owner requests per-class styles; class loadouts must not accidentally reset it. Cosmetics must not affect equipment ownership or combat stats.

### Phase B: Local asset catalog and renderer adapter

Start with Lord Knight to verify integration, then cover the complete roster before release. Use native precomposed assets and metadata at build time: it is the smallest implementation supported by this proof. Preserve the current renderer as the `legacy` fallback. Avoid a game-time dependency on the public provider.

Create a manifest with job/class, gender, head/palette IDs, outfit/accessory IDs, weapon family, action kind/direction, dimensions, anchor, frame counts, rational delays, source URL/hash and art version. Use the studio's idle/walk/attack routing as the starting point, then complete the production asset set and all required directions. Inspect provider action definitions and actual output rather than inferring animation rows from the preview's attack actions. Retain all eight gameplay directions; distinguish authored directions from explicit mirrored fallback routes. Do not invent missing frames.

Production assets need a bounded cache: decode only the equipped look and necessary preview, evict old strips and dispose replaced Three.js textures. Never preload every variant. Generalize canvas width/height and anchor metadata rather than squeezing 320×280 source frames into hardcoded 200×200 assumptions. Check billboard scale and planted feet through every class change and direction.

At full scale, baked permutations grow rapidly as more cosmetics are added. A layered ACT/SPR renderer could share body/head/weapon data later, but requires native attachment points, z-order, palettes and synchronized action frames. This prototype does not supply that implementation. Do not replace it with arbitrary 2D offsets or palette masks inferred from screenshots.

### Phase C: Weapon and clock integration

Extend the selected appearance key and `skinPack` lookups; invalidate/rebuild `heroKey` on hair, color, equipment weapon family, gender, class and cosmetic changes. Switch the visible look atomically when its required views are ready; late image loads must not replace a newer selection.

For native precomposed assets, disable `drawSkinWeapon` for that route, otherwise a second custom weapon appears over the native one. Keep the old path for legacy assets. An explicit route flag such as `weaponBaked:true` is safer than testing filename strings. Keep current combat stats, dual-wield damage and equipment logic intact; choosing an appearance must never create/delete equipment. Offhand/shield/dual-wield art needs separate source coverage; this study validates weapon-family art, not every loadout configuration.

Drive native attack frame selection from `skinSwingMs` and current combat progress, retaining the last-frame clamp. The sword's nine frames must span the same one combat swing previously shown with five frames. Preserve projectile/hit timing and the existing damage event source. Idle/walk use their native delays. For temporary load failures, retain current art or the documented legacy fallback, with a clear UI status rather than a half-loaded character.

### Phase D: Player UI and persistence

Add a hair/color section to Character settings using thumbnails, named or numbered colors, and preview/apply/cancel. Preview is transient; Apply stores validated IDs, refreshes all hero/panel previews and calls existing save flow. Cancel must leave character state and gear unchanged. Use local thumbnails, keyboard focus, labels and reduced motion. Match the actual gender-specific art; same numeric style IDs need not look the same across genders.

Keep the barber cosmetic-only initially. Prices, unlocks, tokens, rarity and progression rewards were not specified and should be designed separately rather than silently invented. Native palette aliases can be grouped in the UI after preserving their stable stored IDs. The owner can choose whether to show all entries or only distinct colors in a later product pass.

### Phase E: Release gates

Add meaningful regressions for old-save migration, malformed/new-version data, both gender choices, class switching, reload/cloud/import round trips, cache identity/eviction, stale loads, fallback recovery, portrait/equipment consistency and no stat changes. Extend `class_skin_sim.js`, `attack_sync_sim.js`, relevant APNG fixtures/decoder tests, `save_load_sim.js`, `migration_sim.js` and cloud/save-owner suites where behavior changes.

Run the relevant real browser flow with usable WebGL: male/female, all 19 classes, every allowed weapon family, all eight gameplay directions, idle/walk/attack, fast attack rates, class/gender/equipment changes during loading, mobile and reduced motion. The older sandbox report mentioned unavailable WebGL; recheck current capability and explicitly record any limitation instead of treating a DOM stub as combat verification.

Check production publishing via `tools/build_site.sh`: it currently includes all `assets/` and only `Updates/Sprite/` from Updates. Put production assets in a deliberate published location; the studio must stay excluded. Do not copy the whole Updates tree into production. Bump BUILD only when visible live-game behavior changes; append AGENTS.md for every repository change. Run all repository-required suites before any push, following current TOOLS-START-HERE.md fixture preparation and smoke-test instructions. No push or deployment was requested in this task.

## 10. Next-agent starting checklist

1. Read this handoff, current AGENTS.md rules, catalog, audit/validation summary and workspace validation record. Preserve unrelated uncommitted work and earlier preview folders.
2. Open the studio and its offline sample mode. Inspect male/female style sheets and the native color comparisons.
3. Verify source revision and current `skinPack`, `captureSkinFrame`, `skinSwingMs`, `fresh/load/save` implementations; historical AGENTS sections include superseded rendering details.
4. Keep the user's chosen 20-per-gender lists stable. Do not reroll or silently map old save indices onto them.
5. Implement Phases A–D behind the legacy fallback, then fulfill Phase E before reporting live integration complete.
6. Update this handoff and the validation summary with what actually shipped, remaining gaps, measured bundle/memory costs and exact verification commands.

## 11. Current verification and delivery format

`validation-summary.json` and `asset-costs.json` are machine-readable results. The workspace validation record holds exact commands, hashes, corrections and browser checks. The previous 508-attack/4,512-frame result remains valid for those unchanged PNG bytes but does not cover the new stances by itself.

Run the current checks:

```sh
/tmp/cosmetics-visual-env/bin/python tools/fetch_hair_colors.py --fetch
# Completes the starter's front/rear views in addition to the normal sample plan:
/tmp/cosmetics-visual-env/bin/python tools/fetch_hair_colors.py --fetch --mode full --class 'Lord Knight' --hair 2 --palette 0
/tmp/cosmetics-visual-env/bin/python tools/tests/hair_color_assets.py
node tools/tests/hair_color_sim.js
bash tools/build_site.sh /tmp/stance-site
/tmp/cosmetics-visual-env/bin/python tools/measure_appearance_costs.py --site /tmp/stance-site
coderabbit-agent-browser open http://localhost:8000/Updates/hair-color-preview/
coderabbit-agent-browser eval "$(cat tools/check_hair_color_browser.js)"
coderabbit-agent-browser eval "$(cat tools/benchmark_appearance_browser.js)"
/tmp/cosmetics-visual-env/bin/python tools/export_hair_colors.py
```

The browser selection check exercises all cached images and 1,080 gender/style/color/stance selections on the full local studio. On the compact export it checks only the embedded starter animations and six gender/stance choices, without requesting unembedded variants. Reload to reset mirror/still after this check. Benchmark results come from the current game's exact APNG decoder in shared Chromium; they do not measure full-game GPU frame rate or real-phone performance.

Download format:

- `hair-color-studio.html`: compact interactive page with the starter look and gallery thumbnails embedded. Other selections call the provider online. It retains all controls and all 81,000 routes; it is not a full offline game asset pack.
- `hair-color-source.zip`: source, manifests, audit, tests, benchmark and documentation. It intentionally excludes art.
- `hair-color-art-idle.zip`, `hair-color-art-walk.zip`, `hair-color-art-attack.zip`: native samples and first-frame PNGs, split to keep each download under 25 MB. Extract all three and source ZIP into the same repository root to restore the full local studio.
- `INTEGRATION-HANDOFF.md`, `PERFORMANCE-AND-HOSTING.md`, `asset-costs.json`, `browser-benchmark.json`: next-agent plan and measured evidence.

The single `.pgap` bundle under `measurements/` is a tested byte-preserving packaging proof for one Lord Knight look. No live code reads it yet. The full 6,840-bundle catalog is a proposed file-count design, not an already generated production asset collection.
