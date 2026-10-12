# Lord Knight prototype verification

Verified 2026-10-12 on the preservation branch based on `e69ebb9b37d8b8dcace91f1efb78000ea3a07778`. No game integration or deployment.

## Completed checks

| Check | Observed result |
| --- | --- |
| Generator + independent `--check` | 360 appearances; 3,240 APNGs; 21,600 nonempty, unclipped native frames; hashes, source routes and frame timing verified |
| Source coverage | 1,104 animations reused from preserved studio bytes; 2,136 missing views filled from native renderer/cache |
| Static size | 68,674,485 bytes total; largest bundle 200,030 bytes |
| Node loader regressions | Passed malformed/corrupt input, range/geometry/timing checks, native action identity, cancellation, superseded decode cleanup, failure fallback, memory budget and oversized-response handling |
| Frame clock | Irregular native delays preserved; idle/walk loop; one full attack per selected swing duration, final frame held |
| Full shared-browser decode | All 360 appearances / 3,240 animations / 21,600 frames passed, exactly 360 bundle requests |
| Retention during exhaustive browser audit | One decoded view after each switch; peak two during replacement; zero audit canvases retained after disposal |
| Real controls, desktop and phone widths | Passed at 1280×1000 and 390×844: gender-specific selection memory, attack final-frame hold, still mode, simulated load failure/retry, no horizontal overflow and controls within viewport |
| Reduced motion | Starts with Still frame enabled; local sprite renders |
| Network | Workshop resources remain same-origin; zero external resource requests observed |
| Publishing isolation | 10 publishing tests passed; all 314 game-build paths and SHA-256 values identical before/after; new workshop excluded |
| Existing prototype regressions | Previous cosmetics/class-weapon/hair-color suite passes reused after checking their code and artwork remain unchanged |
| Syntax/whitespace | New JavaScript syntax, Python compilation and Git whitespace checks passed |

Runtime: Node 24.14.1, Python 3.9.25, Pillow 11.3.0, shared cloud Chromium. The exact working inputs and commands are recorded in the task's workspace validation record. The generated manifest pins every bundle's content hash, and bundle headers pin every native PNG and decoded RGBA hash.

## Practical limits

The exhaustive browser test checks loading, decoding, nonempty frames and disposal. It does not visually inspect every grip pixel or compare every new render against an unarmed baseline. Canvas readback can round translucent color channels; browser output is checked for nonempty geometry rather than claimed byte-identical to Pillow RGBA output.

The slowest individual decode observed during that stress audit was 56.6 ms. That includes browser scheduling and validation workload; it is not an isolated CPU benchmark or a smooth-frame guarantee. Decoding yields between compressed frames and is serialized, but real-device profiling is still needed before live integration.

Shared-browser WebGL probing returned false. No full-game GPU test, real-phone FPS/memory test, backend/save integration or production deployment was performed. Only three directions are authored; mirroring is labeled explicitly. Other classes, additional authored directions and selectable accessory/costume bundles remain future work.
