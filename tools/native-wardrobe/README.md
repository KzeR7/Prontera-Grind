# Native character trees and Wardrobe (v2)

The live native renderer now covers three full trees:

- Swordsman (`Swordman` in existing saves) → Knight → Lord Knight
- Thief → Assassin → Assassin Cross
- Archer → Hunter → Sniper

These class sprites load by default, including for old saves with `appearance:null`.
Wardrobe changes hairstyle, native hair color and the existing halo/glasses/wings costume
accessories. Gender is in Settings. Reset hair and costume restores the native default;
it does not opt back into the old renderer. Other trees retain their existing art.
Saved male/female hair choices and costume flags are shared between supported classes;
legacy numeric hair IDs, class progress, equipment and combat stats are preserved.

Equipped-weapon matching remains deferred. Each class has its fixed native family:
sword for the Swordsman tree, dagger for Thief, katar for Assassin/Assassin Cross,
and bow for the Archer tree. Native weapon-specific attack actions are 80, or 88 for
Assassin/Assassin Cross/Hunter/Sniper. Bows have no sword-slash source component.
This does not add costume outfits beyond the existing three accessory switches.

## Sharing and bounds

`assets/wardrobe/v2/` contains **404 files / 7,041,794 bytes** for 3,240 looks.
There are 18 body/weapon records, 360 shared hair/color records and two shared costume
records. Each hair or costume atlas holds pixels once for all nine classes; class attachment
and timing records reference those pixels. Repeated frames share pose records. The v1
reference pack is retained in Git but excluded from the publish tree.

The loader retains its 16 MiB decoded atlas budget; a class change reuses resident hair
and costume images and requests only its body/weapon image and metadata. Only small
appearance IDs are saved. Unchanged animation frames skip texture uploads. Stale requests
cannot overwrite a later class, including a return to an already cached class. Failed
class loads use the existing class renderer, and Wardrobe Retry retries both preview and hero.

## Rebuild the nine classes

Use Python 3.9+ with Pillow 11.3.0 and Go 1.24.2. Native source files stay outside the
published game. The two source manifests pin 576 inputs and public URLs; recovery validates
both existing files and new downloads. No client palettes or sprite pixels are invented.

1. `python3 tools/native-wardrobe/fetch_sources.py <native-root>`
2. Obtain ragassets commit `4de4fa747431979d35c747d7edd549a872efd9e1` from
   `https://github.com/adsonpleal/ragassets`. Copy `export.go` and `main.go` into the
   locations described in the historical v1 section below, then build its `wardrobe-export`.
3. For each job in `1 7 4008 6 12 4013 3 11 4012`, run:
   `wardrobe-export <native-root> <repo>/Updates/hair-color-preview/catalog.json <exports>/<job> full <job>`.
   Use `proof` instead of `full`, with a separate `<proofs>/<job>` destination, for the
   independently rendered costume-mask fixtures.
4. `python3 tools/build_wardrobe_classes.py <exports> <empty-output>`.
   Review the output before replacing `assets/wardrobe/v2/`. A subsequent published asset
   revision should use a new versioned path.
5. `python3 tools/tests/wardrobe_classes_assets.py <proofs>` checks all 3,240 look timelines,
   hashes, bounds and body/weapon presence. It also compares **22,768 frames** against the
   complete native renderer across both genders, eight directions, three stances and all
   eight costume masks: **zero channel difference** in this build.

`wardrobe_sim.js` tests actual assets, shared downloads, memory bounds, retries and class
request races. `wardrobe_game_sim.js` tests default sprites, legacy/current saves, class
changes, preview/apply/cancel, reset and combat clocks. `check_wardrobe_browser.js` runs
real controls, saves, class switching, 3,240 looks and combat simulation on the shared
browser. Its temporary renderer stub means these measurements cover CPU/canvas behavior;
real WebGL/GPU and physical phone performance still require device verification.

---

## Historical first fitting (v1)

The following documents the preserved first implementation. Its Lord-Knight-only scope
and opt-in behavior are superseded by v2 above; its source provenance remains applicable.

# Lord Knight layered Wardrobe (v1)

The owner authorized a first in-game Wardrobe fitting. Open **Wardrobe (W)** or Settings → Open Wardrobe. Select male/female, one of the frozen 20 styles per gender, nine native color entries, halo/glasses/wings, and preview idle/walk/attack in eight authored directions. Apply saves the choice; Cancel and closing discard drafts. “Use original class appearance” restores the existing rendering route.

The field renderer uses this appearance for **Lord Knight only**. Other classes retain their class art; the chosen Lord Knight look is retained when changing classes. This scope matches the approved first Lord Knight layer proof. Clothing replacements, other-class layered packs, unlock prices and new combat behavior are not implemented. No merge, push or deployment.

## Source versions and fidelity

`source-manifest.json` records all 468 original native input files: the earlier 463-file backup plus shadow ACT and male/female sword-slash SPR/ACT. SHA-256 and public URLs are included. The frozen hair catalog is unchanged.

The native sources come from `grf.robrowser.com` and `classicweb.niktoutro.com/chaosclient`, both referenced by roBrowser's demo configuration. They are different client versions from the LATAM service used by the earlier studio. This is **not a byte-identical replacement for those saved APNGs**:

- An exhaustive comparison covered all 360 looks / 21,600 corresponding frames. Many newer palettes differ; female head27 also has a small silhouette difference. The UI describes recovered client palette differences, and shows the actual result before Apply.
- A second head27 source did not improve the reference match. The initial native version is retained. Experimental palette matching/reconstruction is not part of these assets; no palettes were repainted or inferred.
- Native layer fidelity is tested separately: all eight accessory masks × both genders × eight directions × idle/walk/attack (2,560 frames, head2/palette0) match the complete native renderer **exactly**, including weapons, slash effects, shadows, sorting and attachment points.
- Original prototype sources, art and precomposed bundles remain intact.

Ragnarok Online / Gravity artwork retains its existing provenance. Upstream ragassets renderer code is MIT licensed; its license does not relicense game artwork.

## Runtime design and measured cost

`assets/wardrobe.js` supplies save normalization, a serialized/coalescing loader, SHA-256 validation, bounded response reads, metadata and image-dimension checks, atlas cache and native frame drawing. `assets/wardrobe-ui.js` adds the fitting panel and game adapter; `assets/wardrobe.css` scopes layout without changing other panels.

- `assets/wardrobe/v1/`: **618 files / 4,398,094 bytes** for 360 looks and 24 views each. Body, sword/slash, shadow and accessories are shared per gender. Head atlases are separate per style/color; byte-identical files are deduplicated. No multiplication by accessory combinations.
- Compare the earlier three-direction precomposed workshop: 68,674,485 bundle bytes. It remains excluded from publishing.
- Complete measured publish tree: **935 files / 26,703,393 bytes**, largest file 5,819,715 bytes. The build enforces <20,000 files and ≤25 MiB per file. Static requests retain `/api/*`-only Functions routing; no R2, D1 artwork, Function renderer or new endpoint.
- A selected look loads one catalog plus shared body and hair metadata/PNG. Accessory switches reuse those images. Source filenames are hashed under a versioned path. Failed switches keep the previous ready appearance; old saves use their existing art until Apply.
- The loader caps cached decoded atlas pixels at **16 MiB**, with at most six cached records after cleanup; largest atlas 2,271,232 RGBA bytes. Actual exhaustive browser peak was 4,034,560 cached pixel bytes. Figures exclude compressed responses, metadata, transient browser decode buffers, canvas/GPU allocations and general game memory.
- Hero texture uploads occur only when the pose/frame changes. Attack progress uses the existing `atkAnim` combat clock, plays once and clamps the final frame. Old held-weapon overlays do not run on the native route.
- A normalized saved appearance is approximately **110 bytes**, inside the existing account save. `S.hair` is retained verbatim; old numeric styles are never treated as native IDs. Male/female head/color preferences are independent. Existing owner/version protections and save cadence remain in place.

## Rebuild offline

Requires Python 3.9+ / Pillow 11.3.0 and Go ≥1.22 (verified Go1.24.2). Native inputs and the upstream renderer source are development inputs outside the publish tree.

1. Extract `wardrobe-native-inputs-v1.zip` into an empty source directory. It includes all 468 files, including shadow/slash inputs, plus the pinned renderer tooling. Run `python3 tooling/validate_native_subset.py` in that directory; verify files against `source-manifest.json`. The earlier 463-file backup remains preserved separately.
2. Extract the preserved ragassets source tarball at commit `4de4fa747431979d35c747d7edd549a872efd9e1` to a separate directory. Copy `export.go` to `gateway/internal/render/engine/wardrobe_export.go`, and `main.go` to `gateway/cmd/wardrobe-export/main.go`.
3. From its `gateway/` directory, run:

   ```sh
   go run ./cmd/wardrobe-export <native-root> <repo>/Updates/hair-color-preview/catalog.json <scratch-export>
   ```

4. From this repository, pack to an **empty destination** (move aside the old directory to avoid orphaned hashed files):

   ```sh
   python3 tools/build_wardrobe_atlases.py <scratch-export> <empty-atlas-output>
   ```

5. Compare/review generated output, then use it as `assets/wardrobe/v1/`. On a later published revision, increment the runtime asset version/path rather than silently repurposing a shipped catalog.

For native independent-switch proof, append `proof` to step 3 and run `python3 tools/tests/wardrobe_layers.py <proof-export>`. The exporter reuses native engine internals; it does not invent attachments, subtract composite screenshots, or use manual hand offsets. Missing required parts or clipped crops cause export failure.

## Verification

- `node tools/tests/wardrobe_sim.js`: all actual catalog files, normalization, hashes, bounds, limits, stale queue coalescing, failures/retry, accessory masking, single-swing clamp, disposal.
- `node tools/tests/wardrobe_game_sim.js` (jsdom26 and three0.128.0): real game saves/migration, preview/apply/cancel, gender memory, class fallback, owner reset, close/reopen and texture/frame behavior.
- `python3 tools/tests/wardrobe_assets.py <report.json>`: verifies every asset and compares all preserved LATAM frames, reporting the source-version differences above. This comparison intentionally reports differences; it does not assert LATAM equivalence.
- `python3 tools/tests/wardrobe_layers.py <proof-export>`: asserts exact recomposition against native engine outputs for 2,560 frames.
- `tools/check_wardrobe_browser.js`: real shared-browser loading of all 360 appearances plus selectors, actual local save, cancellation, failed-load preservation/retry, native game adapter and memory limits. The UI harness explicitly marks its temporary WebGLRenderer stub.
- Affected legacy save-owner, save-load, cloud, attack, class-skin, UI, panel, Eclipse, field-loop and publish suites passed. All suites remain mandatory before any future push.

**Remaining release checks:** the shared browser has no WebGL. Real 3D gameplay, GPU texture behavior, phone frame times and memory remain unverified. Screenshots show the actual game UI/native canvas with a temporary renderer stub, not a rendered battlefield. Test the fitting on a WebGL-capable desktop and phone before expanding classes or publishing. Exact LATAM palette/hairstyle parity remains separate source-recovery work; no such parity is claimed.

Shared-browser UI reproduction in this sandbox: start/register the documented preview server, open `http://localhost:8000/` with `coderabbit-agent-browser`, then run `node tools/native-wardrobe/browser_setup.cjs` if WebGL is unavailable. This marks and injects a renderer stub for UI testing only; the source game is unchanged. Run `coderabbit-agent-browser eval "$(cat tools/check_wardrobe_browser.js)"`. A normal later navigation restores the actual renderer. Do not use these UI results as GPU/gameplay performance measurements.
