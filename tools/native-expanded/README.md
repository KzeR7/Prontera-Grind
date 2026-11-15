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
