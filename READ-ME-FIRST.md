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
* `tools/` — the art pipelines (`make_sprite_pack.py`, `make_sprite_viewer.py`, `make_simple_apng.py`, `montage.py`), the test suites (`tools/tests/`)
  and a dev-only plan previewer (`tools/preview/`).
* `tools/server-shift-plan.md` — the design record for accounts, cloud saves, leaderboard, and later
  social/away-progress work (Render vs Cloudflare, free-tier maths, API/D1 sketch, save sync + conflict
  rules, and the staged roadmap). It tracks what is already built and the owner's current scope choices.
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
for t in tools/tests/*_sim.js; do node "$t" || exit 1; done
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
