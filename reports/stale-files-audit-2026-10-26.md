# Stale-file audit — 2026-10-26

Audit of `KzeR7/Prontera-Grind` at `09fce5b` (build `haven-v236`). Repo was 502 MB /
9,902 tracked files; `bash tools/build_site.sh` produces a 126.5 MiB `dist/` of 3,109 files.

Nothing was deleted for this report. Each candidate below names the evidence and what
must change if it goes.

## Method

1. Built the real publish tree (`bash tools/build_site.sh /tmp/dist-check`, 3,109 files)
   so "ships to players" and "repo only" are separate questions.
2. Reference sweep over all 9,902 tracked files: every path/basename was searched for in
   every tracked text file (JS, HTML, JSON, MD, PY, SH, SQL). Dynamic paths
   (`assets/mobs/v1/${id}-${action}.png`, `'assets/social/emotions/'+id+'.png'`,
   extensionless `require('./helpers/endgame')`, and the `for t in tools/tests/*_sim.js`
   glob) were then checked by hand and excluded as false positives.
3. SHA-256 sweep of every file ≥ 200 KB to find byte-identical copies.
4. Re-ran the push gate to confirm which files tests assert about
   (see [Testing](../docs/TESTING.md#the-known-red-baseline-measured-2026-10-26)).

## Tier A — no reader, no writer, no test: safe to delete (≈ 78 MB, 46 files + 1 dir)

> **Status 2026-10-26:** the owner took three of these groups; they are **deleted** (see
> the update log entry of the same date). Removed: `UI redesign/prontera-ui-redesign-v2.zip`
> (18 MB), `tools/maps/thief_{body,full}.json`, `tools/native-wardrobe/event-source-manifest.json`,
> the four `*_seed987` / `*_nightmare` fixtures, and the two dead wardrobe browser checks —
> 10 files, 18.3 MB, `UI redesign/` gone entirely.
> **Kept deliberately:** `.trae-html-share-packages/` (52 MB) — the owner did not ask for it,
> and the table below still documents why it is duplicate snapshot material whenever they want it.

| Path | Size | Evidence |
| --- | --- | --- |
| `.trae-html-share-packages/` | **52 MB**, 17 `.zip` | Not referenced by any file in the repo (the only literal hit is the folder's own name in `.gitignore`-less limbo). Each zip holds exactly one `Updates/…/index.html` that is **already committed at the same path** — verified byte-for-byte on `crit-frame-compare` (11,907 bytes both sides). An editor's "share" export; a duplicate snapshot of files that are in git. Also violates the repo rule to keep generated artifacts out of Git. |
| `UI redesign/prontera-ui-redesign-v2.zip` | **18 MB**, 1 file | No reference anywhere. The folder's only other occupant (`UI redesign/1`, a blank placeholder) was already deleted in the v-cleanup logged at `docs/UPDATE-LOG.md:6188`; this zip was left behind. |
| `tools/maps/thief_body.json`, `thief_full.json` | 600 B | Their outputs (`assets/herobody_thief_m.png` …) **do not exist** — the layered-thief preview they fed was deleted as broken (`docs/UPDATE-LOG.md:6188`). |
| `tools/native-wardrobe/event-source-manifest.json` | 5.8 KB | No reader. A pinned list of native wardrobe source URLs for one renderer commit, superseded by `assets/wardrobe/v5` + `tools/native-wardrobe/README.md`. |
| `tools/tests/fixtures/skill_balance_{before,after}_seed987.json`, `skill_encounters_{before,after}_nightmare.json` | ~180 KB | Referenced by **nothing**, including `skill_balance_sim.js` (it reads `fixtures/progression_*.json`) and the generator `tools/skill_balance.js` (which reads the *non*-seed987 pair). Superseded balance evidence; recoverable from git history. |
| `tools/check_wardrobe_collection_browser.js`, `tools/check_wardrobe_trees_browser.js` | 2 files | No doc, route or test names either one; the wardrobe browser gate today is `check_appearance_*.js`. Both still reference the live `wardrobeState`/`PGWardrobe` globals, so they would run — but nothing calls them and they duplicate newer checks. |

## Is any of this the 2026-10-25 map work? No.

Checked explicitly, because `tools/maps/` appears in Tier A. The v229 landform / v230
colour-identity work is **not** on any deletion list:

| Map work from yesterday | Where it lives | Verdict |
| --- | --- | --- |
| v229 landform v2 + v230 colour grading | `assets/native-fields.js`, `assets/native-fields/v1/**` (55 MiB, shipped behind `?nativeFields=1`) | keep — live, parked by `DECISIONS.md` |
| terrain-v2 review tooling | `tools/maps/terrain-v2/*`, `tools/tests/terrain_v2_sim.js` | keep — `render_floor.py` is named in `.gitignore` and in the proposal doc |
| terrain-v2 boards + metrics | `docs/proposals/terrain-v2/**` (11 MB) | keep — hash-pinned by `map_scene_review_sim.js` |
| map upgrade proposal | `docs/proposals/map-terrain-upgrade-2026-10-25.md` | keep |
| HD tile sources + review boards | `Updates/map-textures-preview/**` incl. `hd/` (25 swatches, 7.4 MB, described in its README) | keep — source material for the boards |
| map kit + its backups | `assets/kit/ro-tiles-hd.png`, `ro-spritesheet.png`, `Updates/map-sprites-v2/**` incl. `work/tiles`, `work/props` | keep — live art + `backup_map_kit_hd.py` target + per-prop sources documented in `README-IMPLEMENTATION.md` |

The two map-looking entries in Tier A (`tools/maps/thief_body.json`, `thief_full.json`) are
**not map files** — they are crop configs for the retired layered-*thief hero body*, and the
`assets/herobody_thief_m.png` output they name does not exist.

The map-related material inside `.trae-html-share-packages/` is only *zipped duplicates of
pages already in the repo*, snapshotted 2026-10-23 15:20 — before the 10-25 work. Verified:
`map-sprites-v2/preview.html.zip` = 70/70 entries byte-identical to the live files,
`Sprite/index.html.zip` = 156/156 identical, `map-textures-preview/index.html.zip` = 38/40
identical with 2 entries **older** than live (`README.md`, `map_kit_hd_option_b.js`). Nothing
from 10-25 is inside them, and nothing is lost by deleting them — the zips themselves stay in
git history.

**Method caveat:** the reference sweep skipped extensionless files, so `.gitignore` did not
count as a mention. `tools/maps/terrain-v2/render_floor.py` is therefore listed as
"unreferenced" in the raw scan but is documented in `.gitignore` and the proposal — kept.

## Tier B — superseded generations kept in git (20.6 MB, 1,518 files)

`assets/wardrobe/v1` (5.5 MB / 618 files), `v3` (7.1 MB / 444), `v4` (8.0 MB / 456).

- The live native wardrobe is **`v5`** (`assets/wardrobe.js` → v5 paths).
- No generator writes v1/v3/v4 (`grep` over `tools/*.py`, `tools/native-wardrobe/*.py`: none).
- No test loads them. Their **only** mentions are exclusion bookkeeping:
  `.assetsignore` (3 lines), `tools/build_site.sh` (skip list), `tools/tests/publish_sim.js`
  (the `forbidden` array), and one sentence in `tools/native-wardrobe/README.md`.
- Deleting means removing those 4 mentions too, or `publish_sim` keeps asserting that a
  directory no longer exists (it would still pass — it only checks absence in `dist/` — but
  the entries become lies).
- **Judgement call:** `v1` is described in `.assetsignore` as "preserved first fitting". If
  the owner wants that first fitting kept as art history, keep `v1` (5.5 MB) and drop `v3`/`v4`.

## Tier C — shipped to players but only dev pages read them (≈ 144 KiB inside `dist/`)

| Shipped file(s) | Size in `dist/` | Read by |
| --- | --- | --- |
| `assets/mob_*.png` (11 files) | 119 KiB | Only `Updates/damage-numbers-v2/index.html` (served at `/dmg2`, `/dmg`, `/numbers`), a page `.assetsignore` keeps **out** of `dist/`. The game's own mob art is `assets/mobs/v1/` + the Divine Pride fallback. |
| `assets/weapons/**` (item icons + 8 held views) | 20 KiB | Only `tools/weapon_proposal.html` (`/weapons`). The game draws weapons from the base64 `window.WEAPON_ART` in `assets/weapons_data.js`. |
| `assets/weapons_manifest.json` | 5 KiB | Build metadata for `make_weapon_pack.py`; never fetched by the game. |

**Why this one matters:** `publish_sim` is red today on
"existing runtime assets exceed their original 62.5 MiB budget". Measured exactly:
budgeted bytes = `126.5 MiB − native-fields 55.0 − social 8.9` = **62.65 MiB**, i.e.
**154.5 KiB over** the 62.5 MiB limit. The dev-only files above are **142 KiB** of that —
so excluding them from `dist/` leaves it ~12 KiB short of the limit, and any one further
small trim clears the row. That is the cheap, honest way to turn that suite green
(rather than raising the budget, which `AGENTS.md` now forbids).

## Tier D — looks stale, is not: keep

| Path | Why it stays |
| --- | --- |
| `assets/kit/ro-tiles-hd.png`, `ro-spritesheet.png` | Live: `index.html:8153` loads the HD tiles. |
| `Updates/map-sprites-v2/ro-tiles-hd.png`, `ro-spritesheet.png` (7.3 MB) | **Byte-identical backups** of the two above, written and verified by `tools/backup_map_kit_hd.py`. Deliberate. |
| `image-search/` (7.9 MB, 28 files) | Raw Divine Pride map downloads. No tool reads them, but they are the provenance for the native-field crops and `.gitignore`-style exclusion already keeps them out of `dist/`. Only delete if the owner no longer wants the source evidence. |
| `docs/map-concepts/` (39 MB), `docs/proposals/terrain-v2/` (11 MB) | Active proposal evidence; the review PNGs are hash-pinned by `map_scene_review_sim.js`. |
| `Updates/lord-knight-bundles` (67 MB), `hair-color-preview` (51 MB), `map-textures-preview` (36 MB), `class-weapon-preview` (16 MB) | Owner art/proposal packs, none shipped. Big, but they are the owner's material to retire — not an agent decision. |
| `assets/native-fields/v1` (55 MiB shipped) | Parked-but-live work: `NATIVE_FIELDS_DEFAULT=false`, reachable with `?nativeFields=1`, decision recorded in `docs/DECISIONS.md` ("Park outdoor redesign until later activation"). It is the single biggest item in `dist/` and is excluded from the publish budget by name. |
| `assets/wardrobe/fourth` (7.1 MB shipped) | Fourth-job wardrobe, live. |
| `assets/fourth-jobs/v1` (1.6 MB, not shipped) | Output of `tools/build_fourth_job_runtime.py`; loaded by `fourth_job_runtime_sim`, `wardrobe_game_sim`, `shop_sim`. |
| `Sprite/` (1.9 MB) | Source art for the legacy pack; `AGENTS.md` art rules. |
| `assets/sprite_pack_data.js` (5.6 MB shipped) | Legacy animated fallback pack, still the fallback until class skins load. |
| `tools/calibrate_skill_damage.js` | One-shot coefficient fitter from the v-something redesign; both fixtures it reads exist and are live. Harmless, 4 KB, documents how coefficients were derived. |

## Duplicate content found (≥ 200 KB)

Only four groups, and three are intentional:

| Files | Size each | Verdict |
| --- | --- | --- |
| `assets/kit/ro-tiles-hd.png` ↔ `Updates/map-sprites-v2/ro-tiles-hd.png` | 4.2 MB | intentional backup (`backup_map_kit_hd.py`) |
| `assets/kit/ro-spritesheet.png` ↔ `Updates/map-sprites-v2/ro-spritesheet.png` | 3.1 MB | intentional backup |
| `assets/{social/sitting,wardrobe/fourth/v1,wardrobe/v5}/atlas-f5b49b4….png` | 0.6 MB | same atlas, one copy per loader directory — each system resolves its own path |
| `assets/native-fields/v1/{izlude,prontera}/terrain.png` | 0.3 MB | **not** intentional: both fields still ship the same `prt_fild08` crop, the exact issue the v230 colour-grading entry set out to fix (`tint`/`sat`/`lum` are applied at build time, so the file on disk stays shared) |

## Recommended order

1. **Tier A** — 78 MB, zero risk, 46 files + 1 directory. One commit, no code touched.
2. **Tier C** — add the three groups to `build_site.sh`'s skip list (and `.assetsignore`
   for parity), which also clears the `publish_sim` budget row. Needs a `publish_sim`
   assertion added for the new exclusions.
3. **Tier B** — owner's call: v3+v4 (15.1 MB) are pure history; `v1` is the "first fitting".
4. Leave Tier D alone; it is either live, pinned by a test, or the owner's material.
