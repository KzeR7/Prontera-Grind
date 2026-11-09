# Validation — gym roofs and Sakura Reach pond

## Source and scope

- Source snapshot: GitHub `main` at `28c99a39cca290ee8f64366c63b61b8a4b2e140f`
  (`2026-11-09 haven-v369 …`), 18 commits newer than the original arena base.
- Candidate tree: `D:\TEMP\Temp\opencode\art-work`, built from that snapshot by
  `prepare-art-work.py`; no local clone was used as the source of truth.
- Only art, one shared-collision addition, tests and docs change. Fishing rules,
  chair IDs, lake shape, gym stations, bridge walking height and plaza movement
  are untouched.

## Targeted checks

All of these pass in the candidate tree:

| Check | Result |
| --- | --- |
| `node tools/make_social_gym.mjs --check` | generated runtime matches the reviewed study source |
| `node docs/proposals/gym-redesign/geometry-regression.cjs` | indexed lathe/torus/sphere and triangle-list boxes preserve topology (earlier lost-index bug) |
| `node tools/tests/social_art_redesign_sim.js` | roof coverage on all five sides plus the center veranda, sign clearance, shell collision, four station routes, eight fishing-seat routes, bridge deck profile, opaque water coverage, native coping/sakura retention, allocation-stable animation |
| `node tools/tests/social_gym_sim.js` | gym stations, rewards and session contract |
| `node tools/tests/social_scene_sim.js` | scene lifecycle with the new hooks |
| `node tools/tests/social_fishing_sim.js` | fishing contract and asset version |
| `node tools/tests/social_sim.js` | shared plaza rules and the new fingerprint |
| `node tools/tests/social_worker_sim.mjs` | Worker imports the same rules and runs a socket/payout cycle |
| `node tools/tests/kit_sim.js`, `sprite_sim.js`, `starter_sim.js` | pass individually (they were flaky only during the parallel candidate run) |
| `bash tools/build_site.sh` | `dist/` 185 MB, 3,823 files, `version.txt` = the v370 BUILD |

Measured geometry in the production builders: **gym 45,392** batched triangles,
**pond 31,498**. These are triangle counts, not frame-time claims.

The new regression deliberately samples solid plank centers on the bridge, not
the 2.5 cm drainage joints, so the deck comparison follows the real walking
formula `4·arch·t·(1−t)`.

## Full gate

The gate runner executes every `tools/tests/*` suite plus the smoke and Worker
tests against a tree.

| Tree | Result |
| --- | --- |
| Untouched `main` `28c99a3` | **198 / 212 passed**, 14 red |
| Candidate | **202 / 213 passed**, 11 red |

No new failures. The candidate's red set is a strict subset of the baseline's:
three baseline failures (`dev_server`, `social_fishing`, `update_watch`) now pass
because the BUILD mirrors, asset versions and line endings are consistent. The
remaining 11 fail identically on untouched `main`:

`card_star_balance`, `class_skin`, `hosted_launch_stage`,
`hosted_scrypt_prepare`, `hosted_scrypt_reader_probe`, `preview_fields`,
`publish`, `session_lost`, `skill_balance`, `sprite_viewer`,
`weapon_proposal`.

They cover hosted/staging tooling, publish and session fixtures, balance checks
and the sprite viewer. None touches the gym or pond paths; they are recorded as
pre-existing baseline state rather than accepted as green.

## Visual review

Actual-game renders were captured from the integrated scene at revision r3:

- `screens/gym.png` — all five roof sections, painted court, bays and props.
- `screens/gym-entry.png` — raised board, clear entrance opening and supports.
- `screens/gym-roof.png` — continuous mitered roof, gables and interior walls.
- `screens/pond.png`, `screens/pond-phone.png` — whole lake and bridge.
- `screens/cascade.png`, `screens/cascade-base-only.png` — animated cascade and
  the opaque water base used when highlights are disabled.
- `screens/bridge.png`, `screens/bridge-close.png` — deck, trestles, braces,
  rails and lanterns.
- `screens/shore.png`, `screens/north-shore.png` — original limestone coping,
  planted coves and sparse accents.

Iterations corrected: a three.js r128 geometry API mismatch, missing side and
center roofs, roof/wall gaps, a low entrance board, a repeated faceted rock ring,
overly striped falling water and noisy large rock surfaces.

Limitations: this is stylized game art built from the project's existing
textures and flat-shaded renderer. Automated checks prove coverage, clearance,
routes and allocation stability; they are not an artistic-quality certificate.
The cascade is deliberately readable at gameplay distance, not a fluid
simulation. Owner visual acceptance is still required.

## Deployment notes

- BUILD advances to `2026-11-09 haven-v370 gym roofs and Sakura Reach pond` in
  `index.html` and all three mirrors.
- Social asset URLs are cache-busted together to `?v=370`.
- The rules fingerprint becomes `20/15/8/6/16/120/0/1/5` because the enclosed
  gym shell adds five collision sections. Pages and the Social Worker must be
  deployed together; a stale Worker rejects the room snapshot.
- Staging only: Pages `prontera-grind-staging` and Worker
  `prontera-social-staging`, D1 `pg-staging` (`3a38c6fc-…`). No production
  project, database or merge.
