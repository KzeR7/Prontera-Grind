# Prontera Grind — read me first

A browser Ragnarok-Online-flavoured idle/grind game. **One file is the game**: `index.html`
(HTML, CSS and JavaScript inline, Three.js from a CDN, no build step). Cloudflare Pages serves
`dist/` (see *Put the saves on the server* below for the API half), so a push to `main` is the
deploy — but the host's build output directory must be `dist/`, never the repo root.

* `index.html` — the whole game. `const BUILD='…'` near the top is the tag shown on the login card.
* `assets/sprite_pack_data.js` — the built class pack: 19 class bodies + 2 heads, base64 atlases (~5.8 MB).
* `assets/kit/` — **map kit v2**: `ro-spritesheet.png` + `.json` (25 terrain tiles, 34 billboards)
  and the two attached level designs (`ro-map-payon.json`, `ro-map-morocc.json`).
* `Sprite/*.png` — the uploaded class sheets, the source art for the pack (the animated fallback).
* `Updates/Sprite/index.html` — the **canonical class-sprite reference backup** for all seven uploaded trees;
  after changing its PNGs, refresh the manifest with `python3 tools/make_sprite_viewer.py`. See
  `Updates/Sprite/README.md` for the future-update workflow.
* `assets/class_skins_data.js` — the **live class skins**: for every class and gender, the file, frame
  count, per-frame delays, opaque bounds, drawn height and ground line of its uploaded **animated**
  PNGs (walking S / SE / NE, attack SE, plus High Priest's own walking N). Every one of those files is
  a multi-frame looping APNG, so the game **decodes those frames itself** (`skinDecodePng` in
  `index.html`: PNG chunks, `DecompressionStream`, unfilter, APNG blend/dispose) and paints the
  frame that is due at that moment onto the hero's texture - the clock is the file's own delay
  table, looping forever, and SW / NW / attack SW are the same file mirrored. The animated pack
  (`assets/sprite_pack_data.js`) is the fallback until they load. Rebuild after changing a PNG with
  `python3 tools/make_class_skins.py` (`--check` fails when it is stale, and also when a file stops
  being a multi-frame endless loop); re-make the frame fixture that proves the decoder with
  `/tmp/venv/bin/python3 tools/make_apng_fixtures.py`; and see the QC sheet tool
  `python3 tools/preview_class_skins.py` (one directions sheet plus one frame-by-frame walk-cycle
  sheet per class).
* `Updates/ApngAnimation/` — **how the class skins animate, and the working method to follow**:
  `README.md` (the APNG format as the art uses it, the game's decoder/player, every trap, and the
  full update procedure), `class_skin_animation.js` (verbatim backup of that code block, kept
  current by `python3 tools/backup_apng_code.py --check`), and `simple_apng_demo.png` (a 6-frame
  example of the simplest APNG, written by `python3 tools/make_simple_apng.py`). **Read this before
  changing the class art or the hero.**
* `TOOLS-START-HERE.md` — **the tool map**: every dev page, generator and picker in `tools/`, what it answers
  and who owns it. Read that instead of guessing which of the two dozen pages is the live one.
* `tools/weapon_proposal.html` — **the live weapon review page** (served at `/weapons` by
  `python3 tools/preview_server.py 8000`; `/` is the **game itself**, so the preview link opens it). Every one of the 19 classes on its own sprite
  with a real Ragnarok Online weapon on it. It opens **frozen** so the weapon can be placed against a
  still frame (`▶ Play animation` to animate, `,`/`.` to step a frame). Drag to move, wheel/`[`/`]` to
  rotate, `-`/`+` to size, `0` to reset. **🎯 Set hand** then a click on the sprite locks the weapon onto
  a hand you pick (arrows nudge; `↺ automatic hand` undoes it). **♂ Male / ♀ Female** switches between the two
  sprite sets — each has its own hands, angles and frames (the two are different drawings, and four views
  even have different frame counts), and `⧉ copy this class to the other gender` seeds one from the other.
  It **opens on your saved progress** (`assets/weapon_proposal_data.js`, refreshed with the choices
  you last pasted back), which `↺ back to the saved
  default` restores. **Every placement belongs to the frame you are on** — set a hand on frame 3 and frame 5 and the
  weapon moves with the body when you press play (`📌 copy to every frame` when you want one placement
  everywhere, `blend the frames in between` to let two or three keys animate smoothly). Clicking the
  sprite **snaps the weapon's grip onto that exact pixel**. `⇄` / `⇅` (or `F` / `V`) mirror the weapon image about its own
  grip, so a flipped weapon stays in the hand. A **"Weapon per view"** table ticks or
  unticks the weapon per drawing — so a job can be bare-handed on South and South-East but armed while
  attacking — and the class list's **✕** is still "no weapon for this job" everywhere. Three designs per
  weapon family, and **📋 Copy only what I changed** hands back just the classes and views that
  differ from the saved default — one short line (a two-frame edit is under a kilobyte against the
  full export's ~300 KB), which loads back into the identical state; **📋 Copy everything** is still
  there for backups. **Every class at a glance** has a
  `▤ show the pictures` button: nineteen small live pictures, one per class, of whatever the page is
  holding right now, each labelled with whose numbers that sprite is using (her own, still his, or not
  tuned yet) — the worklist for the female pass. Click a picture to work on that class. The art is real RO client art, decoded and cropped by
  `python3 tools/make_weapon_pack.py --source <extracted client>` (`--check` verifies `assets/`);
  `tools/weapon-art-notes.md` documents the SPR/ACT formats, the two traps and the provenance.
  **Nothing from this pass is in the game.**
* `tools/` — the art pipelines (`make_sprite_pack.py`, `make_class_skins.py`, `make_weapon_pack.py`,
  `make_sprite_viewer.py`, `make_simple_apng.py`, `montage.py`), the test suites (`tools/tests/`)
  and a dev-only plan previewer (`tools/preview/`).
* `tools/server-shift-plan.md` — the design record for accounts, cloud saves, leaderboard, the v65
  client-side offline-reward rules, and remaining social work (Render vs Cloudflare, free-tier maths,
  API/D1 sketch, save sync + conflict rules, and the staged roadmap). It tracks what is built and the
  owner's current scope choices.
* `AGENTS.md` — **the project's rules and its full update log**. Read it before changing anything:
  it carries the house rules (crop only, never draw art; all 8 directions and 3 animation rows
  survive; append to the log; bump `BUILD` for anything a player can see) and the history.

Login for testing: **`GM`** — the password is deliberately not written down here. Since v60 the game
stores only a stretched hash of it (`node tools/make_gm_hash.js --check "…"` says whether a password
is the live one; with no argument the tool prints how to set a new one). Since v61 you can also set a
**local, simple** GM password that lives only in your own browser and never in this repo: run
`localStorage.setItem('pg_gm_local', gmHash('test1234'))` in the game's console once, then log in as
`GM` / `test1234`; `localStorage.removeItem('pg_gm_local')` removes it. Normal accounts are made
in-game and stored in the browser (`pg_acc4`; saves under `pg_save3_<user>`).

## BUILD v69 — Prontera Town in HD: a safe map, five NPCs, painted buildings and a dressed plaza

* **A new map, and it is a place, not a stage: Prontera Town.** It is **a card in the World Map
  tab's own grid** — the same card class and the same size as the ten fields, sitting right beside
  them, marked *Safe · no mobs* — so the way in is the map UI you already use. Press **T**, click
  that card, or use `window.town()` in the console. While you are standing in town the band under
  the map cards becomes the town's own: a **Leave town** button and the **five NPCs with what each
  one does for you**, instead of a stage picker that a map with no stages should not have. The field's monsters, kit deco,
  road and sky are hidden while you are there, and the town has **no spawner at all** — nothing
  spawns, nothing attacks, nothing drops. It is the one map where the hero stops grinding.
* **The layout the owner asked for:** a cobbled plaza (radius 11.4) around the **painted HD
  fountain** (6.4 units tall over the square, with live water — droplets off the upper basin, spray
  off the crown, sparkle on the pool), an **NPC terrace** behind it with stone pillars and banners,
  the **gate arch** in from the south, **fourteen houses walling the square** east and west with the
  avenue and the cathedral keeping the two ends open, four market stalls, four benches, eight lamps,
  six banner poles, five flower beds on the plaza's axes, a **memorial statue** beside the gate and a
  **cathedral** closing the skyline.
* **Every sprite is sized against the game's own art scale, not by eye.** A hero is **2.7 units**, the
  field's own house is **7.6 x 6.4**, its big tree **10.9 x 9.7**, its stone lantern **1.7 x 3.2** — so
  a town house is 7.2-8.8 tall (the guild hall 10.4, the cathedral 17.5, the gate arch 10.2), the
  fountain centerpiece 6.4, a lamp 5.6, a tree 8.4, a bench 1.3. Widths always come from the art's own
  aspect, so nothing is stretched, and the code-built stand-ins use the same table — what you see
  before the pack loads is the size you get after it. The trees are lot trees outside the street line
  (the gate side is left clear, because the default camera looks in from there).
* **The town's own HD art pack (`assets/town/town-atlas.*`, built by `tools/make_town_pack.py`).**
  **Twenty RO3-style painted sprites** — nine buildings (town house, inn, shop, tall house, stone
  house, chapel, timber cottage, guild hall, cathedral), the fountain, the gate arch, two market
  stalls, a tree, a lamp post, a banner pole, a bench, two flower beds and the memorial statue — all
  in one atlas, cropped at runtime exactly like the map kit's own sheet. **Nothing in the town is a
  bare block any more:** every prop the plaza uses has painted art, and each painted sprite replaces
  its code-built stand-in the moment the pack loads (even if the player is already standing in town).
  The paint sources live in `Updates/town-hd/work/`; the builder chroma-keys the magenta backdrop,
  trims each sprite to its content box, downscales the longest side to 640 px (about 2.6x
  supersampling at the size a building is actually drawn) and packs them into
  `assets/town/town-atlas.png` (4096x1793, ~9 MB). `--check` re-runs the build in memory and
  byte-compares, so a stale atlas cannot ship. Every sprite is drawn at its true aspect and gets a
  soft contact shadow, so it reads as standing on the ground rather than as a sticker. A building is
  sized by how much street frontage its slot has (not by its art's height), so the two rows meet like
  a street line instead of a scatter of cottages, and the mirror flag alternates so the ring never
  repeats.
* **The ground is the kit's own HD terrain**, laid at about one world unit per tile (the kit's own
  scale): `ruin_cobble` paving for the plaza, a `limestone_pale` kerb band and side paths, `dirt_path`
  for the avenue in from the gate, `grass_jade` for the lawn.
* **Five NPCs with names and sprites, standing on the terrace:** **Kafra Elise** (warp & save),
  **Captain Rondel** (the guard's contract board), **Sister Marina** (temple healer), **Scholar
  Wren** (Royal Library / Mastery Index) and **Smith Gordon** (forge & market). Each has a name
  plate over their head that lights up when you are close enough to talk. Click one and the hero
  walks over and their box opens; **F** talks to whoever is beside you.
  Their sprites are the class sprite pack composited with the game's own measured rules (body cell
  + head at the pack's anchor), **one idle row per NPC** (~0.5 MB) rather than a full 24-row atlas
  (~13 MB) each — five extra full atlases would have cost ~65 MB of canvas for art that never
  animates. Until the pack has loaded each NPC wears the game's drawn hero, and the pack art
  replaces it the moment it arrives.
* **What talking gets you:** Kafra warps to any stage you have already unlocked — the same `S.prog`
  rule the World Map enforces, checked in code so a locked stage is refused, not merely greyed — and
  saves; the captain lists your contracts, pays out a finished one and drafts a fresh contract of
  the same kind scaled to your level; the sister restores HP and explains HP, defeat and First Aid;
  the scholar opens the Mastery Index and the card album and explains the ladder and tokens; the
  smith explains which field drops which rarity, ore, refine and the boss-only Legendary rule.
* **Click-to-walk belongs to the town, and only to the town.** The ten fields keep exactly the
  controls they shipped with (WASD/arrows and the auto-roam) — a tap on a field does nothing. *An
  earlier pass had given the fields a click target too; the owner asked for that back out — "click to
  walk is only for this town map. dont change the others" — and out it came.* In town, clicking the
  ground drops the gold ring and the hero walks there. **Click an NPC and they talk at once** — the box opens on
  the click, no walking required, and the hero walks over while you read. Their **name plates are
  clickable** too, so the easiest target on the plaza is the one that works. **WASD and the arrow
  keys** walk too, and while in
  town they take priority over the dock hotkeys. The basin is a wall, not a magnet: a target on the
  far side of the fountain is **walked around**, and the hero is clamped out of the fountain and out
  of the NPCs by the simulation itself (not by the frame that happens to draw it).
* **Nothing about the balance moved.** The town is not an entry in `MAPS`: no monsters, no cards, no
  drops, no stage, so the Monster Index, the drop tables, the leaderboard and the cloud offline claim
  never have to know it exists. Time in town does not feed the kill-rate sample that offline rewards
  are built from — parking in town does not throw away the credit for the time you were away. `S.town`
  is a display-only flag (the World Map button reads it) and `load()` clears it.
* **Testing:** all suites green plus the four `--check` tools. The town itself is driven end to end by
  `node tools/tests/town_smoke.js` — a jsdom harness that boots the real `index.html` with the real
  Three.js r128 (`npm i --no-save jsdom three@0.128.0`; it prints a skip line and exits 0 without
  them, so a clean checkout is never blocked). It walks **29 town scenarios**: entry and scene swap,
  the plaza/fountain/ring, the painted pack dressing every building and prop (with a stub manifest for
  the real atlas), the five NPCs and every page they render, click-to-walk both across the plaza and
  around the fountain, **the ten fields having no click-to-walk at all** (a real pointerdown/pointerup
  on the canvas in a field must not touch the walk target), WASD, ten minutes of standing still with
  zero spawns, healing, taking and claiming a contract, locked-stage warp refusal, warping out, the
  field spawning again afterwards, the offline rate untouched, the pack art replacing the stand-ins,
  and a save/load round trip. It has caught real bugs on the way: the field's roam running in town,
  the hero not being clamped by the simulation, the steer point overwriting the walk target, Kafra
  warping into a locked stage, an empty kit group reporting itself visible, and — this pass — the art
  pack finishing its download *before* the town was ever built, which dereferenced a town that did not
  exist yet and would have thrown on boot.
* **How this pass was looked at without a browser:** this workspace cannot download Chrome, so the
  town's layout is checked by `node tools/_town_dump.js` (jsdom walks into the real town with the real
  atlas manifest and writes every sprite's placement) and `python3 tools/preview_town_board.py`, which
  composes those onto one image at 2:1 — the buildings, fountain, gate, statue, stalls and props are
  the real crops at their real world sizes, back to front, shadows and all. It is how the ring was
  caught overlapping itself and the cathedral, and how the street line was tuned. The board is at
  `Updates/town-hd/board-1-town-layout.png`.

## BUILD v67 — moderated movement, fixed combat floats, server-timed cloud idle claims

* **Movement dialed back:** the speed is now exactly halfway between the old formula and v66's proposed slowdown. AGI 99 is **8.12** instead of 11.45 units/s (about **29.1% slower**, not 58%); AGI 120 is **8.68** instead of 12.5 (about **30.5% slower**, not 61%). The Speed x2/x4 button is unchanged.
* **Camera:** unchanged from v66, per request.
* **Combat floats:** fixed the projection bug: damage nodes were `position:relative`, so CSS added the projected screen coordinates to normal document flow. They are now absolute at the projected hit location. Attack numbers use a simpler, smaller typeface; crits are only modestly larger (21px vs 17px) without the oversized burst/tag; MISS/DODGE are plain labels with no badge frame.
* **Cloud offline timing:** the client no longer decides the away duration or kill budget for cloud accounts. Existing `/api/save` GET/PUT uses D1 server time and a server-observed kill rate; it issues a persistent one-use claim, capped at **4 hours** and **50% rate**, and carries fractional kills forward. The client clock and its `offlineKph` field are ignored. The claim is not lost if the response/tab is interrupted, and retrying cannot issue it twice. Apply `migrations/0003_server_timed_offline_claims.sql` to the live D1 database before deploying this build; instructions are in `tools/cloudflare-deploy-steps.md`.
* **Important trust boundary:** this closes the device-clock exploit for cloud offline timing/kill count without polling. The browser still rolls the actual EXP/items/cards/ores from the approved kill count, because combat, drops and the full save are still simulated client-side. A player who directly edits their save can still cheat other progression; complete reward authority requires moving the reward simulator and validating more of the save on the server. Browser-only local accounts still use local time and are not cross-device.

## BUILD v66 — camera, skill art, login and combat polish

* **Camera correction:** the previous 5-world-unit forward look-ahead left the hero visibly low. It is
  now only 0.25 units; with the current camera angle the hero's body centre projects to about 48% of
  the desktop play area (slightly above centre). This is an actual target change, not just a vertical
  focus tweak.
* **Movement amount:** the old pace was `6.5 + 0.05 × AGI`; it is now `4.1 + 0.07 × sqrt(AGI)`. At
  AGI 99 that is 4.80 instead of 11.45 units/second (**58% slower**); at AGI 120 it is 4.87 instead
  of 12.5 (**61% slower**). The speed button still deliberately multiplies movement.
* **Skill artwork:** replaced failed/hotlinked tiny icons with self-contained 46px fantasy SVG ability
  gems: metal rim, glass colour, glow and many distinct motifs for magic, weapons, healing, defence,
  archery, poison and utility. They load locally, are crisp on high-DPI screens, and do not need an
  image server.
* **Combat floats:** ordinary hits are outlined gold/ivory, skill hits have a separate cool-blue glow,
  misses/dodges use compact readable badges, incoming damage stays red, and criticals are 32px with a
  larger red-gold burst frame and a small CRIT tag. The numeric damage remains visible.
* **Registration/login:** clicking Create Account now asks for confirmation before sending/creating
  anything. Login has a Remember user ID on this device checkbox; a successful registration turns it
  on and stores only the username, never the password. The option can be unchecked to erase the saved
  username.
* **Offline-save caveat at v66 (superseded by v67):** cloud saves then carried the offline timestamp
  and rate sample between devices, but the client clock still controlled the award; a forward jump
  could claim the cap again. v67 now uses server-timed cloud claims for the away window and kill budget.
  Browser-only local accounts still use device time. Neither version makes the overall client-generated
  save or reward rolls cheat-proof.
* **Bandwidth:** v67 fits cloud claim issuance/acknowledgement into the existing login/save exchange;
  there is no heartbeat and almost no extra payload. The remaining larger security task is moving loot
  generation and validating save deltas server-side, not server timing.

## BUILD v65 — offline rewards and gameplay/UI fixes

* **Ordinary mobs now drop Oridecon and Elunium** on every map: 0.5% each on Stages 1–9 and 1% each
  on Stage 10; the Stage 10 boss remains 2.5% each.
* **Movement and camera:** v65 introduced the gentler AGI curve. The preview still showed the hero low
  because its 5-unit forward camera lead remained; v66 corrected that lead to 0.25 units.
* **Equipment/Skills panels:** equipment-compatible gear temporarily sorts to the top of the bag while
  choosing a slot, then normal ordering returns when it closes. Clicking elsewhere closes the chooser
  and its description. Skills use a five-column desktop grid, show the selected skill's details below
  the grid, and dismiss those details on an outside click.
* **Ragnarok equipment icons:** gear still uses recognizable item art where available (including
  Katar weapon art) and a safe fallback on a failed image load. The preview exposed unreliable remote
  skill thumbnails; v66 replaced skill thumbnails with local, high-resolution fantasy vector gems.
* **Offline rewards:** saves record a recent kill-rate estimate. On return after at least one minute,
  the game credits no more than four hours and simulates kills at **50% of that recent online rate**.
  The usual field reward rules still apply: EXP, Zeny, equipment, cards, both ores and pets can drop;
  auto-sell/equip, quest and bag rules still apply. The welcome-back dialog summarizes actual away
  time, credited time, kills, total drops, EXP, equipment items, cards and Zeny. A copy is reconciled
  first when cloud saves conflict; offline rewards are applied only to the save the player chooses.
* **Registration (refined in v66):** local registration enters the new character after the new
  confirmation popup is accepted. Cloud registration asks before account creation, then still requires
  the player to save the one-time recovery code before entering the game. Successful registration
  remembers the user ID (never the password); the login checkbox can disable and clear it. Cloud
  passwords require 10 characters; browser-only fallback accounts require 4. The browser-only mode is
  device-local and its client-side hash is not suitable for protecting an account with valuable
  cross-device progress; use the cloud account path for that.

## Run it

```sh
python3 -m http.server 8000 --bind 0.0.0.0     # then open the preview on port 8000
```

## Publish it

```sh
bash tools/build_site.sh                        # -> dist/ : index.html + assets/ + Updates/Sprite/
```

Point the host at **dist/** (Render static site: Build Command `bash tools/build_site.sh`, Publish
Directory `dist`; Cloudflare Pages: same command, "Build output directory" `dist`). The repo root is
*not* a publish directory: it holds the tools, the art sources and the screenshots, and a host that
serves the root publishes all of them. `tools/tests/publish_sim.js` runs this build in CI and fails if
anything dev-side reaches `dist/`.

With Cloudflare Pages connected to this GitHub repo and `main` set as the production branch, merging
a PR to `main` automatically starts the production build/deploy; use the Pages check/deployment
status to confirm it finished. A manual production deploy is also possible:

```sh
bash tools/build_site.sh
npx wrangler pages deploy dist --project-name prontera-grind --branch main
```

The Render site is deliberately retained as your backup; these steps do not change it. **Pages does
not run D1 migrations as part of a build.** Apply a database migration separately, once, before
shipping code that depends on it (see the v64 leaderboard note below).

The small cloud badge in the game header is a **save-sync status**, not a player-presence indicator:
`☁ …` means changes are waiting to sync, `☁ ⇅` means an upload is in progress, `☁ ✓` means the
save was accepted by the cloud, and `☁ ✕` means the game is offline (your local progress remains safe).

## Put the saves on the server (v64 leaderboard update, optional but this is the point of the shift)

**The click-by-click walkthrough is `tools/cloudflare-deploy-steps.md`** — creating the database,
loading the schema, connecting the Pages project, binding it, and the checks to run before telling
players the new address. What follows is the short version.



Accounts and saves can live in Cloudflare D1, so a character follows the player to any device. The
whole feature is **optional by construction**: with no API behind the address, the game runs exactly
as it always has, with accounts and saves in `localStorage`. Both paths are covered by
`tools/tests/cloud_sim.js` (30 checks) and `tools/tests/api_sim.js` (27 checks).

For a **new** installation, create a D1 database named `pg`, put its ID in `wrangler.toml`, and
apply `0001_init.sql` first. The existing Cloudflare setup already has this database/schema, so do
not create a second database or rerun the initial setup just to ship this leaderboard.

1. On the existing database, apply the leaderboard migration once:
   `npx wrangler d1 execute pg --remote --file=migrations/0002_leaderboard.sql`
   (or paste that SQL into the `pg` D1 console). It safely seeds all-time totals from existing cloud
   saves; daily/weekly scores start with newly synced kills and do not backfill history. The board
   uses Asia/Singapore calendar days and Monday-start weeks; Base Lv breaks kill-count ties. This is
   separate from a Pages deploy and must be applied before the new API is used.
2. For a brand-new database only, create `pg`, update `database_id` in `wrangler.toml`, then run
   `npx wrangler d1 execute pg --remote --file=migrations/0001_init.sql` followed by the `0002`
   command above.
3. Create/connect the Pages project with **Build command** `bash tools/build_site.sh` and **Build
   output directory** `dist`, then bind the D1 database to it as **`DB`** (Pages → Settings →
   Functions → D1 database bindings). `_routes.json` in `dist/` sends only `/api/*` through Functions,
   so the static site stays on the free unlimited path.
4. Deploy and open the game. The login card gains "☁ Cloud accounts are on"; the first account you
   register becomes the **owner** (`gm=2`) and is shown a one-time recovery code — write it down.
5. Sign in, play, then check it really followed you: open the game in another browser (or on a phone),
   sign in with the same username and password, and the same character should load.

**Players who choose to migrate a local browser save need one extra step**, because browser storage
belongs to the address, not the game: if the old client shows **⬇ Back up saves**, export there, then
use **⬆ Restore a backup** on the new site and register with the same account name. The game offers
to adopt that device's progress. Older backup builds may not have those controls; retaining Render
as a backup does not require changing it. `tools/cloudflare-deploy-steps.md` §6 has the details.

### See it working before deploying (no Cloudflare account needed)

```sh
bash tools/build_site.sh && node tools/dev_server.js      # -> http://localhost:8788
```

That serves `dist/` and routes `/api/*` to the very same handler files Cloudflare will run, with the
same D1-shaped shim the tests use, over real HTTP with real cookies — in-memory database, so stopping
the process wipes it. Register, play, then open the address in another browser and sign in with the
same username and password: the character should be there. `tools/tests/dev_server_sim.js` is that
whole trip, automated (14 checks, including the leaderboard endpoint). `npx wrangler pages dev dist` remains the official check, and is
the only way to test Cloudflare's own runtime (CPU limits, the real D1 binding).

Day-to-day: **`/gm.html`** is the GM console (players, gifts, passwords, announcements, save
backups). It is a client of `/api/gm/*` and holds no authority itself; the server checks the session
cookie on every call. Local testing without a server is unchanged:

```js
// console on the game page, then log in as GM with that password (this browser only)
localStorage.setItem('pg_gm_local', gmHash('test1234'))
```

Verify the production GM hash after rotating it: `node tools/make_gm_hash.js --check "$PW"`.

## Test it — before every push

```sh
python3 - <<'PY'
h=open('index.html').read()
open('/tmp/pack_block.js','w').write(h[h.index('const PACK_BODY='):h.index('function ensureHero(')])
PY
python3 tools/make_sprite_viewer.py --check
python3 tools/make_class_skins.py --check
python3 tools/make_weapon_pack.py --check      # the weapon art under assets/weapons/
python3 tools/make_town_pack.py --check        # the town's HD art under assets/town/ (needs pillow)
for t in tools/tests/*_sim.js; do node "$t" || exit 1; done
node tools/tests/town_smoke.js                 # optional: needs `npm i --no-save jsdom three@0.128.0`
```

Run the suite before every push. `pack_sim.js` reads the extracted `/tmp/pack_block.js`; the
sprite viewer test checks that its canonical HTML backup matches the PNG files. The tests pull
live code out of `index.html` by string boundary, so moving a declaration can break a harness
without breaking the game — if a suite throws, inspect the boundary it extracts before assuming
the game is at fault. `pet_sim.js` also prints the roster, training ladder, eight gacha skills,
buff rules and maxed-pet balance measurement; one assertion keeps a fully maxed pet within 12%
of one fully maxed character's whole rotation.

## Change the map art

```sh
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pillow numpy scipy    # once
/tmp/venv/bin/python tools/make_sprite_pack.py      # Sprite/ -> assets/sprite_pack_data.js
/tmp/venv/bin/python tools/montage.py               # the four montage sheets, only if re-cutting them
```

The map **layouts** (which tile goes where, how the scenery is clumped) are data in `index.html`:
`const KIT_MAP` holds the original recipe for each map and `STAGE_SCENES` holds three
independent layouts for stages 4–6, 7–9 and boss stage 10. `stageSpec()` chooses the recipe;
`fieldPlan()` builds it. Later stages do **not** paint spawn pads or boss-floor rings: they
change paths, water, vegetation and landmarks with the existing kit. The combat arena is
26×40 units. `packSites()` rolls three dry locations 13–18.5 units apart anew on every respawn;
`nearestPack()`, `spawn()`, `kill()` and `update()` choose the nearest surviving pack, not a
numbered route. `mobVisualScale()` makes regular mobs shorter than the player while leaving
bosses at their previous size. Stage 10 starts with the boss and three regular escorts
on maps 1–5 or five on maps 6–10; defeating the boss clears the wave and immediately
allows another boss wave after the respawn delay. The HUD shows green HP above 30%
(red at or below 30%), one full-width bottom XP bar split into a left Base half (filling rightward) and a
right Job half (filling leftward), with percentages centered in their own halves and
detailed hover percentages. Earned Zeny/min is shown on hover; Kills/min and Zeny/min
use rolling 60-second activity, refreshed every second (kills/sec on hover). After a
browser stall longer than 30 seconds, the rates reset instead of compressing the
paused time into a false burst. **The game also keeps grinding while the tab is in the
background.** One clock owns the sim's time (`simAdvance` at the bottom of `index.html`):
the animation-frame loop drives it while the tab is on screen and a once-a-second timer
drives it while the tab is hidden, replaying real elapsed time in steps no bigger than
0.1s, capped at 10 minutes per wake so a sleeping laptop cannot dump hours into one frame.
Only the frame loop draws. Coming back logs one line - `Away 3m 12s · +42 kills · +6,120
Zeny`. Since v58 there is no switch anywhere: background grinding is permanent (`bgOn()`
is a constant, every load normalises `S.bg=true`), and no save or button can pause it.
`tools/tests/background_sim.js` pins all of that without a browser. The shared Base/Job bar is now 14px high on desktop
(22px on narrow screens). Skills display their names over the moving player; gold
outgoing damage numbers and red spiked critical bubbles follow the supplied RO example.
Active pets use their eight existing Divine Pride monster sprite IDs in the same
WebGL/DOM renderer as mobs, all at one small scale (with a drawn fallback if an
official remote PNG cannot load). Samples also reset at login or on a new adventure.

**v59 deeper skill lines + a free pet skill.** Every job class now teaches **five** skills
(the roster is 91, up from 73) and skill levels are per-skill RO-style: most stop at 10, a
utility skill in each class stops at 5, so a full line tree costs **140 points (139 payable -
First Aid's level is free)** against the **156 a maxed line earns**. Job levels therefore pay out
all the way to 50, and the panel says plainly that a line promoted out of at the minimum gate may
not finish its tree (a restart can be 12 points short; that is the build choice). Cooldowns went
up (actives x1.5, trade-offs x1.2), damage slopes were halved so each skill at its new max still
matches the old 5-level output, and a shared **0.5s global cooldown** (`SKGCD`) now spreads the
casts of one swing: cast 0 lands instantly, casts 1-2 are queued and fire on their turn (and are
dropped if the target dies). Pets: **every pet arrives from a drop with one random skill already
slotted** (same weighted pool as the gacha, which then sells the second slot). Tuning numbers are
a first pass the owner wants to sit with before they are final; pet identity (signature skill /
stat leaning) stays parked at the owner's request. No save loses anything: caps that dropped
leave over-spent levels in place and the repair loop only ever trims overspend.

**v58 Abyss-only Legendary + card panel polish.** Grade caps were re-tiered to the owner's map
tiers: early maps (Prontera, Izlude, Geffen, Morroc, Payon) top out at Fine/Rare/Epic, the four
mid maps (Comodo, Louyang, Amatsu, Niflheim) now stop at **Epic - bosses included** - and **Abyss
is the only map that can drop Legendary gear**, with a value band that steps clear of the mid maps.
The Card Mastery tab shows the **last three** rolls as one horizontal chip strip, and the gacha
reset is a **dropdown of your loose Legendary cards plus a single Reset button**. Background
grinding is now permanent: the Settings checkbox is gone, hiding the tab always keeps the game
running, and no save or button can pause it. Owned gear is untouched by all of this - item values
are stamped when they drop.

**v57 map-capped gear and calmer drops.** Boss equipment is tiered by map now: `MAPGRADE` caps the
best rarity each map can drop (a Payon stage-10 boss tops out at Epic) and `MAPVAL` gives every map a
value band, so an Abyss Epic beats a Payon Legendary - which can no longer drop at all. Only items
dropped after this build use the bands; everything already in a save keeps its rolls. Drop rates came
down to the owner's gentle preset: field gear 3.6% per kill, cards 0.15%, a boss ~6% across its whole
pool (no more one 1% roll per pool entry), pets about one per two hours. The Mob Index was rescaled to
a 50,000-kill species ladder (10/50/250/1,000/5,000/10,000/25,000/50,000) with a 200 -> 1,000,000
title ladder and the 90-species album tracked separately. The Card Mastery tab shows the newest rolls,
lets you pick which Legendary the reset sacrifices, offers **Insert all** per stack and splits the
loose-card list into rarity tabs. The Settings tab lost its paragraphs: hair controls are gone, and a
disabled **Costume (soon)** button says costumes arrive in a future patch. Skills and pets from the
same owner message are the next round - skill cooldowns are explicitly parked for a dedicated tuning
discussion.

**v56 EXP curve and early economy.** Every displayed EXP number is one tenth of the old one
(`EXP_RATE 7` replaces the flat 70x, and all three rate tiers scale together, so the pace is
unchanged), and every requirement is rounded to three significant figures - Base 10 needs 360,
not 3,574. The 3x early boost now ends at Base 50, which turns Base 51-70 into the mid-game
wall: 50->70 takes about 1 h 20 m (levels ramp from seconds to ~10 minutes each) instead of
12 minutes, Base 70 lands at ~1 h 34 m and Base 99 at ~6 h 55 m. Base 1-50 keeps its old pace
(~2.5 min to Lv10, ~14 min to Lv50) and the post-reset 100-150 tail stays a 48-hour climb.
Quests pay the same share of a level as before (`QXP` was scaled x10 to cancel the display
change). Kills now pay at least 5 Zeny (`ZMIN`), so the first levels are not a 1-Zeny trickle;
the raw curve takes over around Base 22. `rcost()` is free below Base 20 and a refused reset
now says so on screen instead of only in the log, and windows no longer rebuild while a
pointer is held down - that was what made the reset buttons feel dead. Read the curve with
`node tools/pacing_report.js` (level-by-level times) and re-solve or check it with
`node tools/tune_pacing.js` / `node tools/tune_pacing.js --verify`. The pacing tests model the
canonical 16-kill boss cadence, so absolute times vary with a real Stage-10 boss-wave playtest.
To look at a layout without a browser:

```sh
node tools/preview/dump_plans.js /tmp/plans.json 10    # third arg: stage, defaults to 1
/tmp/venv/bin/python tools/preview/render_plans.py /tmp/plans.json /tmp/out --px=1400 --box=-38,-38,38,20
```

## If the workspace resets

Nothing is lost and nothing has to be rebuilt: `index.html`, the sprite pack and the map kit are
all committed. Re-clone or `git pull` the working branch, read the newest entry in `AGENTS.md`
(it says what was finished last and what is still owed), and run the suites above to prove the
tree is sane.

**Do not resurrect `UPDATE-BOOTSTRAP.py`.** It was a one-shot that shipped a compressed
2026-10-02 (v7) build of `index.html` and `tools/`, and by v26 its patches no longer applied, so
running it would restore that old build over the current game. It was deleted in v27; it is in
git history if anyone ever wants to read it. The recovery path is git, not a script.
