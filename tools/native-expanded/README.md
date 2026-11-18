# Native expanded-roster sprites

`tools/make_expanded_pack.py` renders the 40 expanded-roster hero bodies (20 classes, male
and female) straight from Ragnarok Online client files, the way the client composes them.

- `roact.py` - small SPR / ACT reader and frame painter (Python + Pillow, no other tools).
- `source-manifest.json` - every source file: repository, commit, path, git blob id, size
  and SHA-256. Bodies and the reference head come from `devilm/costume-ro`
  (`data/sprite/인간족/몸통` and `머리통`); the Gunslinger's held gun comes from
  `rAthena-Thailand/ClientROThailand`.
- `output-manifest.json` - SHA-256 of every file in `assets/sprite-pack-x/`; this is what
  `--check` compares.

```
python3 tools/make_expanded_pack.py          # needs `gh` (GitHub API) and Pillow; ~4 minutes
python3 tools/make_expanded_pack.py --check  # offline
```

Downloads land in `.cache/native-expanded/` and are never committed. Pixels are not
redrawn or recoloured. The older sheets in `Sprite/` are kept as the owner's uploads but
are no longer the source of these bodies.

## Where the art comes from, and how to get more

The sandbox can only reach GitHub, so everything is pulled through the GitHub API and
pinned by git blob id (a blob id never changes, unlike a branch).

| What | Repository | Path inside it |
|---|---|---|
| Class bodies (`.spr` + `.act`) | `devilm/costume-ro` | `data/sprite/인간족/몸통/남/<job>_남` (male), `.../여/<job>_여` (female) |
| Heads | `devilm/costume-ro` | `data/sprite/인간족/머리통/{남,여}/<n>_{남,여}` |
| Gunslinger held gun | `rAthena-Thailand/ClientROThailand` | `Client-2025-06-04/Pre-Renewal/data/sprite/인간족/건너/` |
| Weapon inventory icons (`.bmp`) | `hvg249/TranslationRO-BR` (branch `master`) | `data/texture/유저인터페이스/item/` (file names are CP949 shown as Latin-1) |
| Item id -> icon file name | `hvg249/TranslationRO-BR` | `System/itemInfo.lua` (classic item ids only) |

Korean job folder names used: 크루세이더 Crusader, 팔라딘 Paladin, 가드 Royal Guard,
세이지 Sage, 프로페서 Scholar, 소서러 Sorcerer, 연금술사 Alchemist, 크리에이터 Biochemist,
제네릭 Geneticist, 몽크 Monk, 챔피온 Champion, 슈라 Sura, 로그 Rogue, 스토커 Stalker,
쉐도우체이서 Shadow Chaser, 바드 / 무희 Bard / Dancer, 클라운 / 집시 Minstrel / Gypsy,
민스트럴 / 원더러 Maestro / Wanderer, 닌자 Ninja, 건너 Gunslinger.

Steps to add or replace a sprite:

1. Find the file: `gh api "repos/<repo>/git/trees/<tree sha>"` lists a folder (walk down
   from the branch root; GitHub code search does not index `.spr` / `.act`).
2. Download it: `gh api repos/<repo>/git/blobs/<blob sha>` and base64-decode `.content`.
   `raw.githubusercontent.com` is not reachable from the sandbox.
3. Add the entry (repo, path, blob id, size, SHA-256) to `source-manifest.json`, then run
   `python3 tools/make_expanded_pack.py` and `--check`.

Weapon icons are not built by this tool. Each BMP was converted to PNG with the magenta
key made transparent and saved as `assets/equipment-icons/<item id>.png`; its blob URL
and SHA-256 are recorded in `assets/equipment-icons/manifest.json` and
`mythic-manifest.json`, and `tools/tests/equipment_art_sim.js` verifies them.

## haven-v410 additions

### Two more bodies (Rebellion, Kagerou & Oboro)

Same repository and commit as the other bodies (`devilm/costume-ro`, folder
`data/sprite/인간족/몸통/{남,여}/`). These three jobs are filed under English names there:
`rebellion_남`, `rebellion_여`, `kagerou_남`, `oboro_여` (`.spr` + `.act` each). They are saved as
`.cache/native-expanded/body/{rebellion_m,rebellion_f,kagerou_m,oboro_f}.*` and pinned in
`source-manifest.json` (96 entries now). Rebellion reuses the Gunslinger's gun sprite.

### The Wardrobe pack (`assets/wardrobe/expanded/v1/`)

Built by `python3 tools/make_expanded_wardrobe.py` (about 20 seconds; `--check` verifies the
committed files against `wardrobe-output-manifest.json`; `--sheet out.png [class …]` paints a
contact sheet for eyeballing; `--fixture` rewrites the routes the test compares).

* **Bodies:** the same 88 body files as the sprite pack, re-rendered on the Wardrobe's
  320×280 canvas, one atlas per job and gender, with idle, walk, attack and sit.
* **Hair and accessories:** nothing new is downloaded or copied. The game reads them in place
  from `assets/wardrobe/v5/` (standing) and `assets/social/sitting/` (sitting).
* **Reference job:** the Knight's body files, used only to read where its head attaches in
  each frame. From `devilm/costume-ro` at the same commit: `기사_남.{spr,act}`,
  `기사_여.{spr,act}`, saved to `.cache/native-expanded/ref/knight_{m,f}.*` and pinned in
  `wardrobe-source-manifest.json`.
* **How a head lands on a new body:** the catalog stores each job's head attach point per frame
  (`tracks`) and the Knight's (`reference`). The game moves the Knight's shipped hair or
  accessory frames by the difference. `PGExpandedJobs.reroute` in `assets/expanded-jobs.js` and
  `reroute()` in the builder must stay identical; `tools/tests/expanded_wardrobe_sim.js` fails
  if they drift.
* **Known approximation:** pieces worn on the body rather than the head (wings, capes, bags)
  follow the head by the same rule, so they can sit a few pixels off on some frames.

## haven-v411 additions: held weapons and attack motions

### Weapons in the hand

Weapon sprites come from `rAthena-Thailand/ClientROThailand` at commit
`6f91cbd1df3b94f3e4ea27c6eeb63a4b9f319e96`, folder
`Client-2025-06-04/Pre-Renewal/data/sprite/인간족/<job folder>/`. File names are stored on GitHub
under their CP949 bytes, so list a folder through the git trees API and decode each name
(`name.encode('latin-1').decode('cp949')`) rather than typing the path. All 36 files are pinned in
`source-manifest.json` under `weapon/` (128 entries in total now) and re-downloaded by
`python3 tools/make_expanded_pack.py`.

| Bodies | Job folder | File stem (`_남` male, `_여` female) | What it is |
| --- | --- | --- | --- |
| Crusader, Paladin | `크루세이더` | `크루세이더_<sex>_20161` | sword |
| Royal Guard | `로얄가드` | `로얄가드_<sex>_프리스트의검` | sword |
| Sage, Scholar | `세이지` | `세이지_<sex>_28603` | book |
| Sorcerer | `소서러` | `소서러_<sex>_28603` | book |
| Alchemist, Biochemist | `연금술사` | `연금술사_<sex>_16062` | mace |
| Geneticist | `제네릭` | `제네릭_<sex>_16062` | mace |
| Rogue, Stalker | `로그` | `로그_<sex>_라크마` | dagger |
| Bard, Minstrel | `바드` | `바드_남_20174` | bow |
| Dancer, Gypsy | `무희` | `무희_여_20174` | bow |
| Ninja | `닌자` | `닌자_<sex>_라크마` | dagger |

The client keeps one weapon set per second job and reuses it for the transcendent job, so
Paladin, Scholar, Biochemist, Stalker and Minstrel & Gypsy borrow their second job's files.
The mapping lives in `HELD` in `tools/make_expanded_pack.py`; the Wardrobe builder reads the
same table.

**Not available from any public GitHub source (searched 2026-11-15):** the ordinary weapon
sprites of a full client (`_검`, `_단검`, `_너클`, `_권총`, `_수리검`, `_악기`, `_채찍` and so on).
That repository only carries a handful of item-specific sprites. As a result these fight
bare-handed for now: Shadow Chaser, Maestro & Wanderer, Kagerou & Oboro, and the revolvers of
Gunslinger and Rebellion. To finish them, the files needed from a client `data.grf` are:

* `data/sprite/인간족/건너/건너_{남,여}_권총.{spr,act}` and `rebellion/rebellion_{남,여}_권총.*` (revolver)
* `data/sprite/인간족/쉐도우체이서/쉐도우체이서_{남,여}_단검.*` (dagger)
* `data/sprite/인간족/민스트럴/민스트럴_남_활.*`, `원더러/원더러_여_활.*` (bow) or `_악기` / `_채찍`
* `data/sprite/인간족/kagerou/kagerou_남_수리검.*`, `oboro/oboro_여_수리검.*` (huuma shuriken)

Drop them into `.cache/native-expanded/weapon/<body>_<m|f>.{spr,act}`, add them to `HELD` and the
source manifest, and rebuild both packs.

### Which attack motion a body plays

An ACT file has three attack motions: 40 = attack1, 80 = attack2, 88 = attack3. `attack_action()`
in `tools/make_expanded_pack.py` picks one per body:

* Monk, Champion, Sura: 40, the bare-fist punch (80 is the mace swing and was wrong for knuckles).
* Gunslinger, Rebellion: 80, the two-revolver stance. 88 is the two-handed pose the client uses
  for rifles, gatling guns and launchers; the only gun sprites available are of that kind, so
  the gun is not drawn rather than showing the wrong weapon.
* A body with a weapon: the motion that weapon is drawn in (a weapon ACT only has frames for the
  motion it belongs to).
* Otherwise 88 for the aimed jobs and 80 for the rest.

Dead end, do not retry: drawing our own small revolvers at the hands. Finding the hands by skin
colour picked up belts, boots and trim on most frames.

## haven-v412 additions: second client source, skill effects

- Weapons missing from ClientROThailand (revolvers, shuriken, the Rogue bow, instrument, whip, knuckle) come from `linhan85/rAthenaCN_LeeClient` at a pinned commit; `source-manifest.json` now lists 148 files. Attack motions: 40 overhead, 80 one-hand swing / revolvers / instrument / whip, 88 bow / throw / knuckle punch.
- `tools/make_ro_fx.py` bakes skill effects into `assets/ro-fx/`: `python3 tools/make_ro_fx.py` rebuilds, `--check` verifies the shipped files against a rebuild, `--sheet out.png [keys]` writes a review sheet. Its `BOOKS` table maps a flipbook key to a `.str` timeline, an effect sprite or a set of stills. Sources are pinned in `fx-source-manifest.json` and cached in `.cache/native-fx/`.

## Asura Strike impact pose (haven-v421)

Monk, Champion and Sura use the native one-hand-down frame (`96 + direction`,
zero-based frame `2`) from their pinned body ACT/SPR pairs in `devilm/costume-ro`.
The builder puts the eight directions and their head attachment points in each
male/female field atlas. `PGExpandedJobs.Store` moves the shared hair and
accessories from the same-facing neutral route to the impact's native anchor.
The pose is already loaded with the regular field look, so the first cast does
not need to fetch a sitting look. Social Hub sitting still uses action `16`.
