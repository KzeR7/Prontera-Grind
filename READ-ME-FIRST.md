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
* `tools/skill_fx_preview.html` — **the skill-effect preview** (served at `/skillfx`): every active
  skill's RO-style animated sprite effect on a small stage — click to cast, pick hero class and
  target, slow-mo, loop, **▶ Play every skill**. It runs the game's own effect code (extracted from
  `index.html` at load), and the right panel carries the RO/ROM/RO3 research note per effect family.
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
  **The saved defaults are live in the game from v78.** New edits made here are still proposals until they are copied back into `assets/weapon_proposal_data.js` and integrated.
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

## BUILD v90.7 — the scroll costs 20 materials at 1% (grind-v90.7)

* **Materials:** each Nightmare Stage 15 boss drops its map's material at 1% a kill (`NM_MAT_CH`, was 25%).
* **Drop Protection Scroll:** 20 materials of any mix, from any maps (`DPS_MATS`), make one scroll. Crafting spends exactly 20; extra materials stay in the stacks.
* **What the scroll does:** it only stops a failed refine at +5 or higher from dropping a rank. A +7 that fails stays +7. It does not guarantee success; the success chances are unchanged.
* **Balance (open):** at 1% a kill, one scroll is about 2,000 Stage 15 boss kills, and a +10 with protection is about 16 scrolls, roughly 32,000 boss kills. That is the owner's chosen rate and is one constant (`NM_MAT_CH`) to change.

Files: `index.html` (`NM_MAT_CH`, `DPS_MATS`, `craftDps()`, `dpsPanel()`); tests `tools/tests/material_sim.js`, `nightmare_sim.js`; mirrors and this file are bumped to grind-v90.7.

## BUILD v90.6 — crafting: Nightmare materials make a Drop Protection Scroll (grind-v90.6)

The owner scrapped the Crown and picked option 3 from the Nightmare list: each map's material, used in a craft.

* **Materials:** each Nightmare map's Stage 15 boss drops that map's own material (Dread Essence, Kraken Scale, Void Core, Sandwraith Dust, Spectral Ectoplasm, Leviathan Fin, Oni Horn, Yokai Mask, Helheim Rune, Glast Fragment). The chance is `NM_MAT_CH` = 25% per boss kill. Materials go straight to a stack and do not use bag space.
* **Drop Protection Scroll:** crafted from one of each of the ten materials, on the Refine tab. It is used automatically when a failed refine would drop a rank (a failure at +5 or higher). The scroll is spent and the rank stays. A failure below +5 never uses a scroll, and a success is unchanged.
* **Crown:** removed. Its code and its constant are gone.
* **Balance (open):** at 25% per boss kill, one scroll needs about 40 Stage 15 boss kills (about 4 per map). A full +0 to +10 N+ weapon with protection needs about 16 scrolls, so about 640 boss kills. That is a lot. Tune `NM_MAT_CH` and the recipe after a play-test.

Files: `index.html` (`NM_MAT`, `NM_MAT_CH`, the boss `mat`, the live and offline kill rolls, `collect()` pickup, `refine()`, `craftDps()`, `nmMatCounts()`, `dpsPanel()`, the `craftdps` action, the save fields `nmMat` and `dps`); tests: new `tools/tests/material_sim.js` (9 checks: materials, craft, panel, refine with and without a scroll, success chance and cost, and the wiring); `nightmare_sim.js`, `gear_sim.js`, `crit_sim.js`, `ui_sim.js` (the Crown checks are now material checks, and the boss pool test is back to its plain form). Mirrors and this file are bumped to grind-v90.6.

Refine numbers (for reference): success is 70% at +0 to +3, 49% at +4, 42% at +5, 35% at +6, 28% at +7, 21% at +8 and 14% at +9. Each +1 adds 15% of the piece's base value. See the v90.6 log entry.
## BUILD v90.5 — Nightmare pay anchored to Abyss (grind-v90.5)

The owner asked not to buff Abyss but to tune the lower maps down, since Zeny already overflows. v90.4 had raised Abyss to about 3.1x EXP and 2.6x Zeny per kill at Stage 15. Now `nmPayOf` is taken relative to Abyss at the same stage, so Abyss keeps its pre-v90.4 pay (1) and every other map is lower. Each map still pays the same per HP as the others. At Stage 15 Prontera pays about 0.32x EXP and 0.39x Zeny per kill. Stages 1-10 are unchanged. Tests: `nightmare_sim.js` (new v90.5 test: Abyss is 1, the rest are below 1).

Still open: the Crown (see the v90.4 section). It does not yet give a reason to farm the lower maps.

## BUILD v90.4 — Nightmare fairness: a Crown per map, and pay per HP (grind-v90.4)

The owner picked option C with B from the "how do we solve this" question: low Nightmare maps were far weaker than Abyss, and players farmed one map and skipped the rest.

* **Pay per HP, not per map (B):** Nightmare mob EXP and Zeny now scale by the HP a mob takes. Each map's factor is `nmPayOf(m, l, k)` = its map HP factor mb (1 + 0.15 per map index, plus 0.2 more past index 4) x (its power / Prontera's power)^(1.3 - k), with k = 1.5 for EXP and 2 for Zeny. The EXP and Zeny formulas grow faster than HP, so each stream carries its own exponent. The sim (`nightmare_sim.js`) prints EXP/HP and Zeny/HP per map and stage: every map is 1.000 of Prontera at Stages 11-15. Stages 1-10 are unchanged. The Stage 15 boss uses the same factor.
* **One Crown per map (C):** each map's Stage 15 boss can drop that map's own headgear, the Crown (for example Dread Crown, Glast Crown). It has its own name, is boss-only, and is outside the field pools. The chance is `NM_SIG_CH` = 3% per Stage 15 boss kill. It is rolled at the map's own N+ value, so the Abyss Crown is the strongest.
* **Katar icon and the "Not equitable on current class" label** from grind-v90.3 are unchanged.

Files: `index.html` (`nmPayOf`, `NM_SIG_CH`, the Crown in `fieldOf`'s boss drops, and the EXP/Zeny pay in `minionDef`, `spawn` and the offline simulator). Tests: `nightmare_sim.js` (balance table, Crown rules), `gear_sim.js` and `crit_sim.js` (the boss-pool total excludes the Crown). Mirrors and this file are bumped to grind-v90.4.

Still open: the Crown's power follows its map, so a Prontera Crown is much weaker than an Abyss one. If the owner wants every Crown to be the same power, that is a one-line change in `fieldOf`.

## BUILD v90.3 — katar icon, and a clear label on class-locked drops (grind-v90.3)

Two small owner requests, plus a design question that is still open.

* **Katar icon (grind-v90.3):** on the world map the katar showed the dagger's 🔪 in its line of text. It now shows 🥊 (`WICON.katar` in `index.html`). The katar silhouette in the sprite-style SVG is unchanged.
* **"Not equitable" label (grind-v90.3):** a drop that the current class cannot wear used to have its rate struck through. The rate now stays readable (dimmed a little), and a small red note follows it: `(Not equitable on current class)`. The wording is the owner's exact text. The strike-through rule is gone (`dropTxt` in `index.html` wraps the rate in `.drr`; the note is `.dnot`).
* **Open: Nightmare fairness.** The owner asked how to solve it. Low Nightmare maps give almost the same N gear as Abyss but far weaker bosses, so players farm one map. Option (C), an exclusive N+ piece from each map's Stage 15 boss, paired with option (B), per-kill reward scaled per HP, is the current recommendation. **Nothing was built for this yet.** It needs a balance sim and the owner's choice first.

## BUILD v90 — Affix nerf on Flee/ATK/ASPD/CRIT, refine and Legendary pet costs up, Black Market for endgame Zeny (grind-v90, v90.1, v90.2)

Four owner requests in one build. Every number is a named constant or a single formula, so a later retune is one edit.

* **Four N and N+ affixes are nerfed a little more** (`NM_MUL`, `nmMulOf()`, read by `affixValue()`, sections 4 and 5 only):
  Flee **x3.0 / x3.4** (was x3.5 / x4); ATK %, ASPD % and Crit % **x4.2 / x5.0** (was x5 / x6). Top Abyss rolls: N+ Flee
  44 → **38**, N Flee 39 → **33**, N+ ATK 66 → **55**, N+ ASPD 50 → **41**, N+ Crit 27 → **22**. STR, AGI, DEX, LUK, INT,
  Max HP and Crit DMG keep their v89 numbers.
* **Refining costs more.** Zeny per step is `400 × (level + 1) × (1 + section × 0.5)` (was 200). Ore per attempt is
  `refOre()` (`REF_ORE`): **1** for Common and Fine, **2** for Rare and Epic, **5** for Legendary, **5** for Legendary and **10** for N and N+ (v90.2; was 1 for all).
* **Legendary pets cost 2×** (`r === 3` only): mutation roll **20,000z**, skill gacha **16,000z**, upgrade steps doubled
  (`peqCostOf(p, t)`, the pet panel and the upgrade action both read it). Common, Rare and Epic pets are unchanged.
* **New Black Market tab (key `X`, 🏪), unlocked at Base Lv 100** (`BM_LV`). Two Zeny sinks:
  * **Ore:** Oridecon or Elunium, **100,000z each** (`BM_ORE`), one at a time.
  * **Reforge** one affix on any worn piece that has affixes (`reforge()`): one affix is dropped at random and a new one
    the piece does not have is rolled at the drop roll. Price **150,000z × (rarity + 1)** (`BM_REFORGE`): 1,050,000z for N+.
    Armor and other non-weapon pieces never roll Crit DMG here, the same rule as drops.
* **Why:** past Base Lv 100 the grind earns about **178,000z an hour** at power 99 (800 kills an hour), more on Nightmare, and
  the old sinks cost a few thousand to 20,000z. The Black Market turns that Zeny into ore and reforges.
* **Markets under the quest panel (grind-v90.2):** the Black Market and the Leaderboard left the dock. They sit under the
  quest panel behind one open/hide arrow (`qpSide()`, `sideOpen`, `SIDE_TABS`). `X` and `V` still open them.
* **Skills no longer shift (grind-v90.2):** the selected skill's detail card moved out of the skill grid into a fixed
  220px slot above the families (`.sk-slot`), so picking a skill never moves the grid. It says "Pick a skill" when empty.
* **Fairness, stages 14-15 (grind-v90.1):** the owner's "for fairness, let's just remain the drop on stage 4 & 5" meant
  **Nightmare Stages 14-15 on every map**. The v89 N+ weapon split is reverted: those stages walk the weapon shelf one
  weapon per mob again (`fieldOf()`), and the N+ halving (`NMPLUS_DROP`) stays.
* **Open:** the Black Market prices are a first guess (see the v90 entries in `AGENTS.md`). Reforges roll at quality 1,
  since gear does not store its quality.

## BUILD v89 — Nightmare balance: Stage 5 harder, N+ drops halved and shared, N/N+ flat affixes lowered, pets -37% (grind-v89)

Five owner balance requests in one build. Every number is a single named constant, so a later retune is one edit.

* **Stage 5 (Nightmare Stage 15, the MVP stage on every map) hits and takes harder:** its monsters, escorts and
  MVP carry **+30% HP and +30% ATK** (`NM15_BUFF = 1.3`, `nm15Of()`, read by `minionDef()` and `spawn()`). Abyss
  Stage 5 mob HP goes from 5,565,251 to **7,234,826** and its hit from 1,357 to **1,764**. Stages 11-14 are unchanged.
* **N+ drops are halved** (`NMPLUS_DROP = .5`): every N+ gear roll on Nightmare Stages 4 and 5 (section 5), and the
  Stage 5 MVP pool (3% → 1.5%). Cards, ore and pets are not touched. N (section 4) keeps the v76.2 third.
* **N+ drops are fair across classes:** before, Abyss Stage 4 normal mobs dropped only axe and mace, and staff,
  dagger and bow were on the Stage 5 MVP alone. Now every mob on Stages 4 and 5 lists **every weapon family** on its
  map's N+ shelf, each at an equal share of the stage's weapon chance (Abyss: 0.025% a kill per family, 0.175%
  in total). No class needs the boss for its weapon. Stages 1-13 still walk the shelf as before.
* **Pets are nerfed** (`PETBAL 1.91 → 1.2`, about −37% on every pet hit). One maxed Legendary pet now deals about
  **0.26x** a maxed character (was 0.42x). Rarity, mutation grade, Claw and skill multipliers are unchanged, so the
  whole band moves together.
* **N and N+ flat affixes are lowered:** STR, AGI, DEX, LUK, INT and Flee roll at section multiplier **×3.5 (N)** and
  **×4 (N+)** instead of ×5 and ×6. The top Abyss N+ roll goes from **83 to 55 STR** and from **66 to 44 Flee**; N goes from
  69 to 48 STR and from 55 to 39 Flee. Max HP, ATK %, ASPD, Crit % and Crit DMG keep their Nightmare numbers. Sections 0-3 are untouched.
* **Known consequence (not changed, owner's call):** Stage 5's pay was not retuned, so its EXP and Zeny per HP fall about 23%
  (the capstone was at parity with Abyss mob grinding; it now sits at about 1,690 EXP per HP against 1,953).
* **To see it:** `node tools/tests/gear_sim.js` (N+ shelf and halving), `node tools/tests/nightmare_sim.js` (Stage 5
  buff and worked numbers), `node tools/tests/pet_sim.js` (the pet band), `node tools/tests/ui_sim.js` (the N+ map panel).

## BUILD v88.6 — every save records whose it is, and another account's save is refused (grind-v88.6)

Every save now carries the name of the account it belongs to. The game and the server refuse to load,
write, upload or restore a save that names a different account, so one account's progress can no longer
end up under another name.

* **What you will notice:** nothing on a normal login or save. If this browser holds a save that belongs to
  another account, the login card says whose it is, the game does not start, and nothing is written over it.
  A cloud account's cloud save is not touched. If a backup file holds a save for another account, that save is
  left out of the restore and the question says so. Saves made before this version keep working and get their
  name the next time they are saved. A tab still open on the previous build is asked by the server to reload
  before it can save again; the page does that itself within about a minute of a deploy.
* **To see it:** `node tools/tests/save_owner_sim.js`, `node tools/tests/api_sim.js`,
  `node tools/tests/cloud_sim.js`, and `node tools/tests/save_owner_boot_smoke.js` (the last one needs
  `npm i --no-save jsdom three@0.128.0`, like `field_loop_smoke.js`).
* **Not live yet:** the server half is in `functions/`, so it takes effect with the Cloudflare deploy.

## BUILD v88.5 — a melee character no longer stands still beside a monster it cannot reach (grind-v88.5)

A player reported: a Merchant gets stuck while attacking mobs. It keeps taking hits, and only dying
(which sends it back to the entrance) gets it moving again. Reproduced in a real field loop: the
hero stood still, out of reach of a small monster, and the monster stood still just outside the
hero's attack range and kept hitting. The same stall showed up for Novice, Swordman and Thief, so it
is not specific to the Merchant.

* **What you will notice:** a melee character that has settled beside a monster it cannot reach
  waits about a second for the monster to step in, then walks in and fights. A monster that walks
  into reach on its own is still waited for, so a normal fight looks the same.
* **To see it:** `node tools/tests/field_loop_smoke.js` (its new case 6 fails on the previous build).

## BUILD v88.4 — a save from one account can no longer land on another (grind-v88.4)

A player reported: after playing the GM account, logging into a second account showed the second
name with the GM character and its gameplay. Reproduced with two accounts and one browser session: a
save from the first account, sent while the cookie already belonged to the second, was accepted by
the server and replaced the second account's save.

* **What you will notice:** nothing on a normal login. If a tab is still playing one account while the
  browser has signed in as another, that tab stops syncing and says so on the card. Nothing from it
  is uploaded and nothing from the other account is applied to it. The local copy is kept.
* **To see it:** `node tools/tests/api_sim.js` (the stale-tab and owner cases fail on the previous
  save.js) and `node tools/tests/cloud_sim.js` (the owner cases fail on the previous index.html).

## BUILD v88.3 — the login card answers while it waits (grind-v88.3)

A player reported: type the password, click Login, and nothing happens. Checked the real login card
with a slow server: the card showed nothing, and the Login button stayed live, so a player who waited
or clicked again got no sign that anything was happening. A stalled request never ended. The v88.2
fix only covered a failure after the server had answered.

* **What you will notice:** while the server answers, the card says "Signing in…" (or "Creating your
  account…") and the Login button is greyed out. If the server has not answered after 20 seconds, the
  card says "The server did not answer in time. Check your connection and try again." and the button
  comes back. A normal login is unchanged.
* **To see it:** `node tools/tests/cloud_login_error_sim.js` (9 cases; the wait and timeout cases fail on
  the previous build).

## BUILD v88.2 — cloud sign-in errors are shown on the login card (grind-v88.2)

The owner reported being unable to log in. Checked both halves: the server login (register, login,
wrong password, the session cookie) works end to end against the real `functions/api/*` handlers, and
the real page in jsdom signs in fine. The defect found: when the server accepted the login but the game
then failed while starting (for example a save that would not load), the error was swallowed. The card
stayed open with no message, and the server had already created the session.

* **What you will notice:** that failure now shows a message on the login card: "Signed in, but the game
  could not start: <reason>. Your account is fine - reload the page and log in again." Nothing else changes.
* **To see it:** the regression suite is `node tools/tests/cloud_login_error_sim.js` (6 cases; 2 fail on
  the previous build).
* **Still open:** a login that fails with an error message on the card is the one to report; the message
  text is what identifies the cause.

## BUILD v88.1 — offline rewards pay out again on cloud accounts (grind-v88.1)

The owner reported the offline reward "seems to be not working" (it should be 4 hours max at 50%
of the recent pace). Checked both paths end to end:

* **Local accounts (no cloud): fine.** Booted the real page in jsdom, planted a 4-hour-old save
  with a 1200 kills/hour pace: the welcome-back card credited exactly 4 hours and 2,400 kills
  (1200 × 4 × 50%); a 10-hour absence still credited only 4 hours; under 3 minutes still shows
  nothing.
* **Cloud accounts: broken, now fixed.** The away time is measured server-side from
  `saves.last_seen`, but `functions/api/sessions.js` stamped `last_seen = now` on every successful
  **login** — and a returning player signs in *before* the game asks for its claim, so the away
  window was already zero when the claim was computed. No cloud account ever received an offline
  reward. The login no longer touches the away baseline (the sign-in is still recorded in
  `users.last_login_at` for the GM list, and the baseline moves on the first save sync of the
  session, as designed). Verified end to end against the real handlers + a real database: away 4
  hours, log in, the card credits 4 hours at 50% of the server-measured pace, and the claim is
  one-use as before.
* **Test:** new `api_sim.js` case pins the real sequence (away → login → claim), and it fails if
  the login touch comes back. All 39 suites green; `field_loop_smoke` 7/7.

## BUILD v88 — the town is gone, the sheets are tidy, and the page updates itself (grind-v88)

The owner's nine-item list, all in `index.html` unless noted:

* **Prontera Town is fully removed** — the map card, the town band, the whole engine, the NPC talk
  box and its CSS/HTML, the `window.town*` console hooks, and every file: `assets/town/` (the 9.2 MB
  HD atlas), `Updates/town-hd/` (the 59 MB source art), the four town tools and the `town_smoke.js`
  suite. Nothing references it and nothing loads it; the Endless Echo card now takes the whole
  destination row on the World Map. The Prontera **field** (map 1, the Novice start) is untouched —
  that is a grinding map, not the town.
* **The Character sheet is tidied**: the "RO-style" tag is gone from the ASPD readout, the readout
  says **Movement speed** (one number, no sprint figure), and the six stat descriptions now list
  what each stat actually does (LUK no longer claims drop rate — nothing on the character bends the
  drop tables).
* **"Auto-equip better gear" moved to the Bag tab**, above the selling tools.
* **"Auto-advance through stages and maps" moved to the World Map tab**, next to the stage picker.
* **Auto-advance fixed**: with the switch on, a player parked *below* the unlocked frontier (an
  old map revisited, a stage farmed with the switch off) never moved — the old code only advanced
  at exactly the frontier. It now catches you up ("turn off to farm" is the whole contract), in
  the live game and in the offline simulation alike.
* **Dual-wield fix**: the save-load repair predated v81 and stowed any off-hand piece that was not
  a shield, so an Assassin's second dagger silently came off on every load, login and cloud sync.
  The repair now keeps a dual-wield dagger (and still empties the left hand for a katar). Auto-equip
  is dual-wield aware too: a dropped dagger takes whichever hand raises the pair, and a katar that
  beats the pair takes both hands.
* **Refine no longer closes the bag**: the picker's "clicked elsewhere" test looked for an
  Equipment *window* that does not exist (the panel is the Status window's Equipment sub-tab), so
  the Refine button counted as outside. The paper doll is now "inside".
* **The skills grid no longer jumps when you press a skill**: the press is anchored to its own
  tile after the rebuild, and the window bodies opt out of the browser's scroll anchoring.
* **The attack animation matches the attack speed**: the drawn swing no longer floors at .2s, so a
  fast ASPD looks as fast as it is.
* **The page reloads itself when a deploy lands**: `/api/version` (a new Pages Function) answers
  with the deployed BUILD string, read straight out of the served `index.html`; the page polls it
  once a minute and hard-refreshes on a mismatch (PC and mobile). A static host without the
  endpoint simply never reloads. The four data `<script>` tags also moved `?v=1` → `?v=2`.
* **Tests:** all 39 `*_sim.js` suites green (1201 assertions), plus the jsdom field smoke 7/7.
  New: `update_watch_sim.js` (the watcher and the endpoint), and new cases in `starter_sim`,
  `offline_sim` (auto-advance catch-up), `dual_wield_sim` (the load repair and auto-equip),
  `combat_damage_sim` (the swing follows the real attack rate) and `ui_sim` (the moved switches,
  the tidied sheet, the single-card destination row).

## BUILD v87.1 — merged with main (grind-v87.1): the number retune + above-head spawn on top of v87

* PR #39 went **conflicting** when `main` merged PR #40 (grind-v84 double Base 100+ EXP · v85
  quest-exact Base 100+ doubling / Nightmare pay ramp / first-15 job half cost · v86 camp-refill
  freeze fix + endgame damage retune + RO-style ASPD · v87 mob HIT rating & armor pierce + 8s
  field restock). Resolved by hand: v84–v87 are balance/economy only — the float visual code on
  main was still the pre-retune version — so this branch's float work applies cleanly on top.
  See **BUILD v83.5** and **BUILD v73** below for the retune and the above-head spawn.
* **BUILD re-bumped to `grind-v87.1`** so the login card names the merged file: *the number retune
  from the tuner (28/39px digits, a 70px flight, ×1.9 punch, spread) and damage numbers start
  above the head*.
* The incoming-damage line carries both changes: v87's `prOf` armor-pierce formula **and** this
  branch's `heroDamageY()` spawn above the hero's head.

## BUILD v83.5 — damage numbers start above the head (grind-v83.5): nothing covers what you fight

* **The owner asked for the numbers to start above the mob's head** (bosses included) so they stop
  covering the monsters — and the hero. Before, the digits sat on the monster's head and the crit's
  97.5px starburst lay over its whole upper body; incoming damage sat at a fixed 2.4, on the hero's
  chest.
* **How:** `mobDamageY(o,crit)` measures the clearance in **screen px** through the same projection
  the floats use (`scr`), from the sprite's own head line (`3.05*mobVisualScale(o)` — the height
  `syncMobImage` draws the sprite). It holds at every zoom, and it follows the mob's drawn scale, so
  **bosses start higher** than regulars. A crit clears its whole burst box (54.75px), an ordinary hit
  its digits (22.8px); the old 1.7 floor stays for mobs still spawning in. Incoming damage gets
  `heroDamageY()` — above the hero's head (the 2.92-tall billboard's top) instead of 2.4.
* **Short form checked — it goes well:** every damage number is formatted by `numTxt` (short by
  default, full via Settings), the starburst sizes itself from the finished label (`1.3M` → the same
  131×98px box as `1896`), and the gradient digit fill carries the K/M/B suffix as-is. Pinned by a
  new ui_sim check.

## BUILD v73 — the number retune (grind-v83.4): 28/39px digits, a 70px flight, ×1.9 punch, and a real spread

* **The owner retuned the damage numbers from the tuner** (`Updates/damage-floats-proposal/`, strip B):
  arc fade · sway up, fade left · Game (Trebuchet) · **28px** normal / **39px** critical · **rise 70px**
  (the top end of the page's Rise slider) · **1.75s** life · fade starting at **90%** · impact punch
  **×1.9** · spread **14px**. The font, the gradient crit fill and the 1px dark rim from v72 are
  untouched, and so is the v71 centring of the explode frame.
* **Bigger and higher:** the digits grow 17→28px (normals) and 32→39px (crits), the starburst scales
  with them (`fs=39` in the builder), and the whole flight climbs **70px** instead of 30px — normal
  hits, skill hits, crits and skill crits all travel it.
* **Longer, and it fades later:** the life stretches 1.05s → **1.75s** (`DMG_RATE` .95 → .571) and the
  burst breathes for all of it (`fburst-pop` 1.05s → 1.75s); the hold-then-fade now keeps the digits
  solid until **90%** of the life (was 55%).
* **Punchier:** the impact punch is ×1.9 — crits pop to **×2.33** on spawn, ordinary hits to **×1.475**
  (was ×2 / ×1.25).
* **The spread is real now:** it used to be inert in sway mode (the sway path owned the sideways
  motion) and the game had no spread at all, so a multi-mob volley piled onto one pixel. Every damage
  number now rolls its own **±14px** horizontal offset at spawn (`DMG_SPREAD`), ridden on top of the
  sway, so the volley fans out. The tuner's `driftX` rule honours it too, and its sliders default to
  this pick, so the 📋 button prints exactly what is live.
* **Unchanged:** the colours, the gradient crit fill + 1px rim, no CRIT chip, the sway path (10px right,
  then 38px left), one number per monster per swing, DoT merging, the short form from 100K, and the
  v67 screen projection.
* **Dev-only:** `Updates/damage-floats-proposal/` (the tuner, at `/damage`) and
  `Updates/crit-frame-compare/` (the crit-frame comparison, at `/crit`) both show the new pick, and
  `volley-before-after-v73.png` in the tuner folder renders the same volley at the old vs new
  settings. Nothing in the proposal folders ships to players.

## BUILD v79.6 — sharp claw slashes: tapered blades, no fat round blobs (on the v79 sprite system)

The owner compared the preview against a real-client capture: RO's slashes are **claws** —
crescent blades that taper to sharp points — while the old sheets drew thick round-capped
strokes that read as fat circular blobs (Sonic Blow, Grimtooth, Soul Breaker, Spiral Pierce,
Bowling Bash and every other slash family).
* New `fxClaw` helper draws a crescent as an outer arc plus a tapered inner arc that meets it at
  **sharp tips**; `slash` is now a big claw + a thinner echo claw + tip spark, `wave` a tapered
  shockwave with sharp horns, `vortex` three tapered winding claws. Every family that uses those
  sheets (impact, multiSlash, spiral, shadow, radial, soulBolt, sdestroy, shockwave, fireNova…)
  inherits the sharp read.
* `skill_sim` 58/58, sheets rendered to PNG and visually checked against the reference capture.

## BUILD v79.5 — the box-bands bug is dead: UV spin fixed, soul wave & hammer strike polished

The owner's screenshots finally showed the "boxes": horizontal bands. Root cause found and fixed —
it was never the art sizes: `skillFxSpriteUv` rotated the UVs by mixing **u (a 1/n sliver of the
sheet) with v (the full height)**, so any layer with a rotation (`ang` or `spin`) smeared its
v-span across the whole sheet and rendered as a stretched rectangular band. The rotation now
happens in cell-normalised space (both axes 0..1 over the frame cell) and maps back — a true
in-place spin. Every effect that ever showed a band is fixed by this one change.
* **Soul Breaker / Soul Destroyer** re-polished on the fixed pipeline: one bigger clean wave
  (Breaker with a light trail + bloom; Destroyer wrapped in its purple vortex).
* **Hammer Fall** now reads as the strike the research describes ("slams the targeted cell with
  the equipped weapon"): the translucent coloured light-hammer starts raised and swings DOWN
  onto the mob (swing direction verified frame-by-frame as an image before shipping), then stun
  star, shockwave and dust.
* **Meteor Assault**'s side slashes now genuinely spin into a horizontal whirl.
* `skill_sim` gained a regression test that fails if any spun layer's UVs ever smear across the
  sheet again (58 tests). Timings/balance untouched; `/skillfx` to watch everything.

## BUILD v79.4 — organic streaks, single soul slash, swinging light-hammer (on the v79 sprite system)

The owner sent screenshots: the thin straight streak sheets (arrows, slashes) read as floating
rectangles at field scale, the Meteor Assault floor blades looked like giant boxes, and the solid
falling hammer was wrong. Fixed at the art level this time.
* **Arrow and slash sheets redrawn organic.** The arrow is now one tapered comet streak with a
  soft glow head (the separate rectangular speed-lines that read as "boxes" are gone); the slash
  is a thick soft-edged energy crescent. Every arrow/slash family inherits the fix, and Arrow
  Shower dropped from five stacked streaks to three smaller comets.
* **Soul Breaker / Soul Destroyer** are now **one clean slash wave** riding from the player into
  the mob (Destroyer's in purple with a soul burst) — no more stacked wave boxes.
* **Hammer Fall** is a **translucent hammer of light that swings down** onto the mob (additive,
  tinted, UV-swung through ~90°) instead of a solid steel hammer falling from the sky; the stun
  star, shockwave and dust land as it connects.
* **Meteor Assault** whirls **horizontally** with four camera-facing slashes striking at the
  caster's sides over the expanding ring — the giant floor blades are gone.
* `skill_sim` pins all four shapes (57 tests). Everything else unchanged; `/skillfx` to view.

## BUILD v79.3 — reworked casts, ground-fight-free decals, real hammer fall (on the v79 sprite system)

Third watch-through, twelve notes, all addressed.
* **No more square patches under effects.** The ground rings/decals were sitting exactly coplanar
  with the terrain, so the additive quads z-fought the floor into flickering squares. Ground
  layers now hover at y≥.08 with a polygon offset, and the UV cells got a wider inset — the box
  outline is gone everywhere, not just where the art margins fixed it.
* **Fire Bolt** now drops **a few single fire bolts out of the sky**, each with its own landing
  burst. **Fire Ball** is a **burning ball shot from the player** that explodes on arrival.
* **Storm Gust** is the RO1 **gust of storm**: two counter-spinning vortex discs over a wide frost
  ring, ice daggers whirling in the gust, snow sparkles and rolling mist.
* **Napalm Vulcan** fires a **ghost orb from the caster** that detonates on the mob (it shared the
  sky-fire read before; it does not anymore).
* **Meteor Assault** sweeps **horizontally**: three spinning purpleslash crescents on the ground
  around the caster instead of vertical slashes.
* **Soul Breaker / Soul Destroyer** ride a **wave of slices from the player into the mob** — the
  Destroyer's wave is wrapped in a purple soul-storm.
* **Holy Light is no longer a projectile**: a pillar of light comes down on the target and blooms.
  **Judex** drops a gold cross-star from the sky into a judgement starburst. **Magnus
  Exorcismus** rains four holy pillars out of the sky inside its field.
* **Hammer Fall is literal**: a new baked-colour **war-hammer sheet** (steel head, wooden haft,
  normal-blended so the steel reads as steel) drops head-first on the mob, then stun star,
  shockwave and dust.
* **Flames are organic now** — bezier tongues with gradient bodies, hot cores and rising embers
  instead of flat triangles — which fixes the "fake fire" on Meltdown everywhere fire plays.
* Sheet count 21 → **22** (`hammer`). `skill_sim` now pins the new cast shapes (57 tests).
  Timings/anchors of untouched skills unchanged; see `/skillfx`.

## BUILD v79.2 — sharp unboxed effects, real meteors, split poisons (on the v79 sprite system)

Follow-up pass on the v79 sprite effects after the owner's second watch-through.
* **No more square edges.** Every painter was redrawn on the new **144px sheet frames** with a
  ~66px radius margin, so nothing touches the frame — the faint "box" around some effects is gone.
* **Sharpness.** The 1.5× higher source resolution stops the blur the v79.1 2× size-up introduced.
* **Meteor Storm no longer reads like a doodle.** The rocks are now dark cratered stones with a
  molten rim and converging trail, blended **normally** (additive blending can't draw dark rock),
  falling the whole way from the sky and landing shockwave-per-shockwave on the marker.
* **The thief-line poisons are three different reads:** Envenom bursts a focused splash on the
  target, Venom Dust keeps its lingering low cloud (no burst), Venom Splasher is a sticky bomb
  that erupts after a beat. New **shard sheet** (diving ice dagger) carries Storm Gust and
  Frost Diver's falling layers.
* Sheet count 20 → **21**; `skill_sim` grew to the sheet-pin + poison-differentiation checks and
  still pins every cast's timing. `/skillfx` shows everything; timings and anchors are untouched.

## BUILD v79.1 — sky-fall mage skills, bigger sprite effects, more variety (on the v79 sprite system)

The v79 sprite-effect system, retuned after the owner's first watch-through. **Every effect is
roughly twice the size** (the field camera sits far away), the **mage line now strikes from the
sky** — Fire Bolt and Napalm Vulcan drop fireballs onto the target, Napalm Beat a ghost comet,
Frost Diver a diving shard, Storm Gust rains shards into its frost field — and **shared families
no longer read as copies**: eighteen skills got their own recipes (Thunder Storm vs Lord of
Vermilion, Fire Ball vs Magnum Break vs Meltdown, Cart Termination vs Cart Revolution, the five
AGI-buff reads, Kyrie's cross bubble, Judex's starburst, Falcon Assault vs Blitz Beat…). Four new
sheets joined the vocabulary: crescent wave, vortex, holy cross and starburst. Timings, anchors
and balance remain untouched; the `/skillfx` preview shows all of it, now with **the game's own
updated class skins** (animated APNG + saved weapon sprite, both genders) as the casting hero.

## BUILD v79 — RO-style animated sprite effects for every skill

Every active skill, auto-buff and First Aid now plays an **animated sprite effect** built the way
the original client builds its `.str` effects: several texture layers on their own frame timelines,
blended additively. Sixteen procedurally rendered sheets rebuild the classic effect vocabulary the
client itself ships (pok impact bursts, expanding rings, lens glows, slash streaks — Meteor Assault
is literally `purpleslash.tga` — ice shards, lightning bolts, holy pillars, falling meteors, poison
bubbles, zeny coins, the falcon, smoke, sparkles, and a ROM-style ground AoE decal); the 40 effect
families in `SKILL_FX_SPR` compose them, one recipe per family, with each skill's own colour as the
tint. The old geometry recipes remain in the file untouched as the no-canvas fallback, and every
timing, anchor and balance number is unchanged. **Watch them at `/skillfx`**
(`python3 tools/preview_server.py 8000`, then open the preview link + `/skillfx`): click any skill
to cast it, slow time down, loop it, or play the whole roster — with the research note for each
family in the side panel.

## BUILD v78.2 — map-stage equipment progression for every class

The normal route now matches the class gear you asked for while keeping job eligibility (`section`),
rarity (`tier` / N), and drop odds separate.

* **Comodo, Louyang, and Amatsu:** all normal stages 1-10 drop section-2, second-job gear.
* **Niflheim:** stages 1-5 drop its stronger section-2 second-job set; stages 6-10 switch to
  section-3 third-job/high-tier gear.
* **Abyss:** stages 1-5 drop the standard section-3 third-job set. Stages 6-10 switch at Stage 6 to
  a distinct upgraded third-job set with 25% stronger item values and affixes. It remains section 3,
  so the third-job/transcendent equip gate still applies; it is not Nightmare N or a new rarity tier.
* **Every class has a weapon to hunt in each stage band.** The active pools retain all seven weapon
  families, and the stage rotations cover those families across Comodo, Louyang, Amatsu, both
  Niflheim bands, and both Abyss bands. Non-weapon slots remain available in those gear sets too.
* **Rarity and drop chances are unchanged.** Map-based rarity caps, Stage 10's full-field cap, and
  all equipment drop rates stay as before. Nightmare sections 4-5 remain the separate N category.
* **Checks:** all **36** `*_sim.js` suites passed; Town smoke passed **40/40**. Focused results:
  `gear_sim` 37/37, `drop_card_sheet_sim` 13/13, `nightmare_sim` 9/9, `ui_sim` 50/50, and
  `trial_sim` 16/16.

## BUILD v78.1 — Nightmare N rarity, equipment gates, and field-tier corrections

This follow-up corrected the Nightmare classification while keeping the v78 saved weapon sprites.
Its earlier map-stage routing below has since been superseded by the v78.2 distribution above.

* **Nightmare gear is N, not Legendary.** Sections 4-5 use the independent N rarity and auto-sell
  bucket. The all-maps numeric tier-4 override is removed; generated quality follows the selected
  map cap, and the Nightmare Gear Token uses the same rule. The selected-item auto-sell control now
  targets N rather than indexing the normal rarity list.
* **Class-stage equipment gates are confirmed.** On the mid-level maps (Comodo, Louyang, Amatsu and
  Niflheim), normal stages 1-2 drop section-2 gear for second-job classes; stages 3-10 switch to
  section-3 high-tier gear, which requires a third-job/transcendent class. Nightmare sections 4-5
  share that highest class gate: Assassin and Thief cannot wear them; Assassin Cross can.
* **Normal drops and odds are preserved.** Prontera/Izlude remain Common on stages 1-9. The Stage 10
  map cap applies to the whole field, escorts and MVP included. No map's equipment drop chances changed.
* Stage 10 clears follow the normal map route when Auto-advance is on, and Town / Endless Echo remain
  together in their compact destination row. Normal drop-table previews carry the same map rarity as
  their generated equipment instead of defaulting to Common.
* **Checks:** all **36** `*_sim.js` suites passed; Town smoke passed **40/40**. Focused results: `gear_sim` 35/35, `nightmare_sim` 9/9, `ui_sim` 50/50, `trial_sim` 16/16, `class_skin_sim` 40/40, and `drop_card_sheet_sim` 12/12.

## BUILD v78 — saved class weapon sprites on the updated v77.2 game

The new build keeps the v77.2 trial payout, daily-priced Shard Store, and HD Prontera town, and adds the saved weapon art to the live animated hero.

* The game loads the local weapon sprite pack and saved proposal defaults, then composites the matching weapon over each decoded class-skin frame using its class, gender, view, and frame placement. Saved grip, offset, rotation, scale, flip, per-view bare/armed choices, and frame interpolation are respected.
* All 19 playable jobs are covered for both male and female sprites. A class uses its saved design for the selected weapon family; another equippable family falls back to that family's first bundled design. Combat and equipment stats are unchanged, and the remote square-item overlay remains disabled.
* The proposal page starts from the defaults used by the game. Later edits in that page remain proposals until copied back and integrated.
* **Checks:** all **36** `*_sim.js` suites passed; `town_smoke.js` passed **40/40**. Focused results: `class_skin_sim` 40/40, `weapon_proposal_sim` 587/587, and `drop_card_sheet_sim` 12/12. The preview's game, proposal page, and both weapon-data assets return HTTP 200.

## BUILD v77.2 — the trial pays a flat number, the store is priced on a day's pay, and your HD town is in

Your three notes, all built — and the town you merged yourself is in the build too.

* **A new personal best pays nothing extra.** *"new personal best dont pay at endless. with or without
  new personal best pays out a daily number."* The +15 bonus is gone from the code, not just hidden:
  a ranked run pays its ladder rung and that is the whole payout. The ladder itself is untouched
  (100k → 5 Shards, 1.5 M → 50, 4.5 M → **115**), the record still sets your **personal best** on the
  screen and the board, and the result screen now just notes *new personal best* next to the number
  instead of adding to it. A perfect day is therefore **2 × 115 = 230 Shards** — earning it once is no
  longer worth 130.
* **The store is priced off that day** — one day = the day's two ranked runs at the top rung = **230
  Shards**:

  | Buy | Price | What a day of top pay gets you |
  |---|---|---|
  | Oridecon ×5 | **38** | six bundles = **228 → exactly the 30 you asked for** |
  | Elunium ×5 | **38** | the same 30 |
  | Zeny Cache (500,000z) | **25** | nine caches, ~4.5 M Zeny |
  | Card Mastery Token | **460** | **two days** |
  | Legendary Card Voucher | **900** | four days |
  | Nightmare Gear Token | **2,000** | the long save — about nine days, still **Base Lv 120+** |

  The order you set stands: card < legendary < nightmare. Ore stays the steady buy; the three tokens
  are save-ups.
* **Prontera Town is in this build — locked, as you asked.** Your town line was merged in (216 commits
  of it: the walled way in, the sunken river, the paved square, the gate). The World Map tab's grid now
  holds its card beside the ten fields and the purple **Endless Echo** card; while it is shut the card
  is dashed and says so, and there is no way in. **To open it: set `TOWN_OPEN` to `true`, bump `BUILD`,
  push** — nothing else in the gate changes. (GM accounts and the save-flag bypass already walk in, so
  you can look at it without opening it to players.)
* **The merge had to protect the game you already have**, and the suites caught two things it nearly
  broke: the phone pinch-zoom hint and a hero standing at y=0 inside the town instead of on its ground.
  Both fixed, plus the fields' stage ladder stayed at **15 nodes** (10 + the Nightmare band) rather than
  the older 10 the town branch still carried. The trial and the town now refuse each other politely:
  walking into one leaves the other.
* **Tests:** all **36** `_sim` suites green, and the town's own smoke test **40/40** — 37 suites in
  total, plus the four art `--check` tools. The trial suite grew a test that proves the store's
  arithmetic above (230/day → exactly 30 ore, the tokens at two days and 2k).
* **Still your call:** the dungeon's real name (Endless Echo is a placeholder), the chest rungs, and the
  **global** DPS board — the personal best is local today; a shared board wants a `dps` column and a
  small database migration, which is a build of its own.

## BUILD v77.1 — the trial's economy, the band's sting, and the ten-second grace

Your six notes on the v77 trial, all built. **The trial and Nightmare figures below replace the v77
ones** (the v77 section stays underneath as history).

* **A ranked try has a grace window.** Leave a ranked run inside the first **10 seconds** and the try
  is *not* spent — step out after that and it is used, and the run pays nothing and never touches your
  best. The result screen says what happened and how long you lasted, so the rule is never a surprise.
  Training is free whenever you leave it.
* **The Shard ladder starts where you actually fight.** Your own yardstick sets it — ~1.5M DPS alone at
  Lv 150, ~4.5M with three pets out: **100k→5 · 250k→12 · 500k→20 · 750k→28 · 1M→36 · 1.5M→50 ·
  2.25M→68 · 3M→85 · 4.5M→115**, and a new personal best is **+15**. **5k DPS pays nothing any more**;
  the old ladder's top rung (120k) is now the second one.
* **The store is priced against two ranked days.** Oridecon x5 and Elunium x5 are **38** Shards each
  (so two good ranked days buy about thirty of either), the Zeny cache is **500,000z for 25**, the
  **Card Mastery Token is 250**, the **Legendary Card Voucher 450**, and the **Nightmare Gear Token is
  900 — and it needs Base Lv 120**. The token is refused, greyed out and labelled below that level, and
  it is about four days of the whole ranked allowance.
* **Seven one-off chests.** Every rung below is paid once, the first time a *ranked* run reaches it
  (one huge run opens everything it passed, practice opens nothing):

  | DPS | Chest |
  |---|---|
  | 250,000 | 50,000z + 5 Ori + 5 Elu |
  | 500,000 | 100,000z + 10 Ori + 10 Elu |
  | 1,000,000 | 100 Shards |
  | **1,500,000** (decked, no pets) | 250,000z + 20 Ori + 20 Elu + 150 Shards |
  | 2,250,000 | 250 Shards |
  | 3,000,000 | 40 Ori + 40 Elu |
  | **4,500,000** (three pets out) | 500 Shards + 30 Ori + 30 Elu |

  The lobby names the next chest you have not reached; the result screen lists the ones a run opened.
* **The Nightmare sting came down and the band's pay went up.** The wall stays at the 48x HP you asked
  for, the damage comes back from 3x to **2x**, and EXP and Zeny go from 2.5x/2.2x to **4x/4x** — the
  band now pays **~9x a Stage 10 mob per kill** (power 175 against 99 is 2.3x of that on its own), so a
  kill that takes a few times longer still pays well over double per hour. Worked example, printed by
  the test: a Nightmare Abyss 15 mob's hit lands for **1,357** through a 75% DEF cut (3.5x a Stage 10
  mob, where v77 was 5.2x); its HP and the 66.3M-HP boss are unchanged.
* **The Nightmare MVP card now states its own rarity.** The MVP pool listed its Nightmare pieces with
  no rarity mark and the card called every MVP drop "Legendary" — on a Nightmare field that is wrong
  twice over. Each pool entry now carries its rarity (**N**), the sentence reads **N** on stages 11-15,
  and the card line reads its own grade instead of the hardcoded one.
* **Your data, double-checked.** All **ten maps** carry a full set of data — monsters, a boss, six gear
  sections, its own kit recipe and design, a pet-odds row, both Nightmare name lists and a map
  recommendation — and the two HD kit mirrors in `Updates/map-sprites-v2/` are byte-identical to the
  live `assets/kit/` files (34 billboards, 25 HD tiles, every name the recipes ask for). The review
  sheet matches the live tables exactly (10 maps, 6 sections, 588 items). Nothing was stale — if the
  new town map you added is a **new map entry**, tell me its name and I will wire its row, recipe and
  drop tables in one pass; I could not find a map in the repo that the game does not know about.

## BUILD v77 — Endless Echo (the damage trial), the band doubled again, and five fixes

The dungeon is **built**: `2026-10-08 grind-v77 Endless Echo, doubled Nightmare band, N auto-sell`.

* **Endless Echo — the trial.** A purple **🏛 Endless Echo** card now sits in the World Map's own map
  grid (not under the stages), and it opens the lobby with the three doors you asked for:
  **Ranked** — the button prints the tries you have left (`2/2` down to `0/2`, then it greys out) —
  **Training** (unlimited, pays nothing), and the **Shard Store**. A run is **five minutes**, counted
  down in the top bar, against one **Trial Dummy** that has infinite HP and never hits back. The
  character spawns 1.4 units from it (inside melee reach) and neither of them moves for the whole
  run. Ranked is **2 a day** on the same Asia/Singapore clock as the boards. **The board score is your
  best single run** — never a sum — and ranked runs also set `S.trial.best`, your personal best.
* **The arena is the room you described:** rune circles cut into black stone, ten obsidian pillars with
  ember crowns, bones and slabs on the floor, a purple key light with an orange rim light, and a
  purple sky/fog theme. It rebuilds whenever you enter, and leaving puts the real map back.
* **Trial Shards.** Ranked runs pay by DPS — **5,000→20 · 15,000→35 · 40,000→50 · 80,000→75 ·
  120,000→100**, plus **+10** for a new personal best. Practice pays nothing; Shards carry over.
  The store sells **Oridecon x5 / Elunium x5 (10)**, a **250,000z cache (25)**, a **Card Mastery
  Token (40)**, a **Legendary Card Voucher (60)** and a **Nightmare Gear Token (120)** — that last
  one asks which map, then hands over one Nightmare-roll item at Lv 150, from section 5 if the whole
  band is open and section 4 before that, always a weapon your class can swing.
* **The Nightmare band doubled again** (your words: *"double the hp. atk can be increase too. ill test
  it and see if this make sense"*). Mob and MVP **HP x24 → x48**, and the sting goes **x2.25 → x3**.
  Worked example: a Nightmare Abyss 15 mob now has **5,565,216 HP (99x an Abyss 10 mob)** and its hit
  lands for **2,035** through a 75% DEF cut (5.2x); the stage-15 MVP has **66.3M HP**. EXP and Zeny in
  the band are unchanged (`x2.5` / `x2.2`). It is one doubling from the shipped figure, not a
  compounding one, so please play-test it and tell me if it went past "hard" into "silly".
* **N is in the auto-sell ticks.** The Bag's auto-sell row is six ticks now (Common … Legendary **N**),
  and a Nightmare piece can be sold on drop like anything else. Old saves get the sixth tick added,
  switched off, so nothing sells itself the moment you log in.
* **The Bag's equipment icons are sprites.** Every equipment family has a drawn silhouette (sword,
  dagger, axe, mace, staff, bow, katar, armour, headgear, shield, boots, accessory, ore, card) that
  shows instantly, in the rarity's colour; the real Ragnarok item art loads on top of it where the
  art host allows it (the request now goes out without a Referer, which is what the host refused
  before — that was why a deployed build showed placeholder marks). A Nightmare piece keeps its
  purple tile and glow either way.
* **Every MVP is just a name.** No `(boss)`, no `(MVP)`, and **no crit-resistance readout** anywhere —
  not on the card, not in the map panel. The mechanic is untouched; only the text is gone.
* **The map no longer hops when you tap a stage.** The old fix nudged the pressed stage with the
  browser's `scrollIntoView()`, which walks *every* scrollable parent (the window body, `#wins`, the
  page) — on a phone that moved the whole screen even when the stage was already visible. Now both
  scroll positions are kept by number and the pressed node is nudged inside its own list only.
* **Still your call (nothing blocks):** the dungeon's real **name** (Endless Echo is a placeholder I
  can rename in one line), the **Shard Store prices**, and the one-off **milestone chest** rungs — the
  ladder is in DPS (5,000 / 15,000 / 40,000 / 80,000 / 120,000) so one real run tells us where the
  chests should sit. A fully decked Base Lv 150 character is expected around 65k–135k DPS, so the
  middle rungs are the ones that will matter.

## BUILD v77 — the town is locked until the owner opens it; houses face the square; nothing floats or overlaps

Everything here is the five-item list the owner left on the town PR (#76).

* **The town ships shut.** `const TOWN_OPEN=false;` at the top of the town block is the switch;
  `townUnlocked()` is the gate (`TOWN_OPEN || S.gm || localStorage pg_town_open==='1'`). While it is
  shut the map still shows the town card — greyed, labelled **Closed**, with no way in — and the HD
  atlas **is not fetched at all** (the fetch moved from boot into `townEnter`, so a locked town
  costs visitors nothing). **Leaving is never gated**, so nobody can be stranded inside. Open it for
  yourself with `window.townUnlock()` (or `localStorage pg_town_open=1` before boot); open it for
  everybody by setting `TOWN_OPEN` to `true` and bumping `BUILD` — that flip is the whole release.
* **Nothing billboards any more.** Every building was a `THREE.Sprite`, which three.js turns to face
  the camera every frame — that was "the gate & all houses spins together with the camera". Buildings
  are now `THREE.Mesh` planes with a fixed yaw, so each front keeps pointing at the square it stands
  on (measured: every front's unit dot product to its target is > .999).
* **The wall and the gate share one palette.** The curtain wall wears the kit's warm `cliff` stone
  and every cone on the gate line (gatehouse, watch towers, corner bastions) is capped with the same
  `TOWN_MASON.roof` — the brown castle entrance and the wall beside it are finally dressed alike.
* **The float was the art's own empty feet.** The town sprites carry a transparent margin *below*
  the painted ground line, so a plane cut to the image edge hung that gap over the ground. The
  per-art offsets are measured, not guessed (`TOWN_SINK`, owned by `tools/measure_town_ground.py`,
  whose `--check` fails if one drifts), and each facade sinks by that fraction of its height.
* **Trees no longer grow out of walls.** The blocker list is filled before anything is planted, a
  house blocks its whole plot (facade plus the body behind it), and each tree tries seven fallback
  radii before it is dropped: 16 trees stand, every one measured clear.
* **The platform over the fountain was shrunk and moved back** so it sits behind the north houses
  instead of through them (0 overlaps against all 17 house plots).
* **Tests:** `town_smoke` is **40 scenarios** now (the gate, the bypasses, the facings, the
  grounding, the clearances), **ui_sim 42**, all **34** suites and the seven `--check` tools green.

## BUILD v76.2 — Nightmare rarity, MVP naming, a harder band, and the map fixes

The owner's first play-test of v76 came back with six notes; this is all of them. **The difficulty and
drop figures below replace the v76 ones** (the v76 section is kept underneath as history).

* **Nightmare gear is its own rarity.** Sections 4 and 5 are no longer "Legendary": they are tagged
  **N** and their names are painted **dark purple** (`.r5`), so an exclusive piece never reads as one
  more pile of ordinary endgame loot. It is display-only — the mechanics still pay them at the
  Legendary band, so autosell, values and drop weights are untouched. The look carries through to the
  character: **wearing Nightmare armour, headgear or weapon tints the worn model dark purple** (the
  same rarity colour table that paints Legendary gear gold), and a Nightmare drop sparkles purple in
  the field. The item's own name states it too: `N Dread Excalibur`.
* **Bosses are MVPs now.** Every player-facing mention — the card header (`MVP & pets`), the tag
  (`Dark Lord (MVP)`), the hints (`MVP fights immediately…`, `MVP appears at NM 5`), the HUD
  (`MVP FIGHT · 3 minions`), the quest text, the Executioner pet description, the ore hint and the
  stage title (`(MVP map)`) — says MVP. The internal names (`isBoss`, `bossCritRes`, the CSS classes)
  did not change, so nothing else moved.
* **The crit-resistance line came off the MVP card.** The mechanic is unchanged (MVPs still cut your
  Crit%), but the figure is no longer printed under the name.
* **The band is twice the wall and half again the sting.** `NMHP 12 → 24`, `NMBOSSHP 12 → 24`,
  `NMATK 1.5 → 2.25`. A Nightmare Abyss 15 mob now has **2,782,608 HP (50x an Abyss 10 mob)** and its
  hit lands for **1,526** through a 75% DEF cut (3.9x); the stage-15 MVP has **33.1M HP**. Damage was
  deliberately not doubled with the HP: two Nightmare mobs hitting for ~2,000 a swing would delete a
  full-HP character in a round. Payouts moved with the extra time (`NMEXP 1.5 → 2.5`,
  `NMZENY 1.6 → 2.2`) so the band is still the best place to spend five minutes.
* **Nightmare drops are a third of what they were** (owner: "nerf the nightmare drop rate to 33% of
  the current rate"). New tables `FIELD_GEAR_NM=[.5,.4,.3]` and `FIELD_GEAR_MID_NM=[.35,.28,.21]` are
  exactly a third of the matching normal table, and the band's MVP pool is a third too
  (`BOSS_POOL_TOTAL[2] 900 → 300`, i.e. 3% total instead of 9%). Cards, ore and EXP are untouched.
* **The damage trial has its place in the map panel already.** A purple **Endless Echo** band now sits
  at the bottom of the World Map window stating the rules that are settled — 5:00 run, a target that
  never dies and never hits back, unlimited practice, **2 ranked runs a day**, and a board that keeps
  the **best single-run DPS** (runs are never summed). The entry button is disabled until v77 builds
  the dungeon itself.
* **The map panel stopped hopping.** The real scroller on a phone is `#wins`, not the window body, so
  the rebuild was resetting it every time a stage was tapped. The rebuild now restores the outer
  scroll by number and only nudges the pressed control into view when it is off screen
  (`scrollIntoView({block:'nearest'})`), so a re-render in place stays perfectly still.

## BUILD v76 — the Nightmare band (Base Lv 100-150) and its exclusive gear

Field power used to stop at **Abyss Stage 10 (power 99)** while the level cap is 150, so Base Lv
100-150 had nothing to climb and no new drops. Every map now carries five more stages.

* **The band.** Each map gains **stages 11-15**, labelled `NM 1` … `NM 5` on the World Map in their
  own purple nodes. They open on **Base Lv 100 / 110 / 125 / 140 / 150** — a pure level unlock, so
  there is nothing new to save and no migration. Stage 15 of every map ends with a boss, exactly like
  stage 10 does.
* **The power ladder keeps going.** `fieldPower` continues past the old ceiling: Nightmare Prontera
  Stage 11 is power 105, and **Nightmare Abyss Stage 15 is power 175** — the deepest field in the
  game. Every normal stage's power is byte-for-byte what it was.
* **They are genuinely hard.** Nightmare monsters take **12x** the HP of a normal monster at the same
  power and hit **1.5x** as hard (both are single constants, `NMHP` and `NMATK`, if you want them
  tuned after a playtest). Worked example from the test suite, measured against Abyss Stage 10:

  | | mob HP | a hit that lands (after a 75% DEF cut) |
  |---|---|---|
  | Abyss Stage 10 | 56,013 | 389 |
  | Nightmare Abyss 15 | 1,391,304 | 1,017 |
  | Nightmare Abyss 15 boss | 16,563,240 | — |

  Nightmare monsters also pay **1.5x EXP** and **1.6x Zeny**, drop ore at **1.5%** a kill (regular
  monsters pay 0.5%, and 1% on a normal stage-10 boss field), and their bosses carry a **9% drop
  pool** instead of 6% (4.2% on the mid/endgame maps).
* **Nightmare bosses resist crit harder.** Their five stages share one figure per map, rising the
  same way the normal ladder does: **35 / 35 / 36 / 36 / 38 / 38 / 40 / 40 / 42 / 45%** from Nightmare
  Prontera to Nightmare Abyss. A capped 60% crit build crits a Nightmare Abyss boss **33%** of the
  time (39% on Nightmare Prontera). The normal bosses are untouched (v74's 15/15/15/20/30), and the
  map panel prints whichever ladder the field you are reading belongs to.
* **Two gear sections that exist nowhere else.** Nightmare fields roll **section 4 (Nightmare gear)**
  on stages 11-13 and **section 5 (Abyssal Nightmare gear)** on stages 14-15 and off their bosses —
  and those are the *only* fields in the game whose section index is 4 or 5, so the exclusivity is
  structural, not a rule someone has to remember. Each section is its own map's high-tier row,
  **renamed with a per-map word** (Dread, Kraken, Void, Sandwraith, Spectral, Leviathan, Oni, Yokai,
  Helheim, Glast / Abyssal, Maelstrom, Singularity, Eclipse, Wraithlord, Trench, Yama, Kami,
  Nidhogg, Absolute) — same weapon families so no class loses a weapon, all-new names, **210 new
  items**. A **Nightmare** item is worth **1.5x** the high-tier row and an **Abyssal Nightmare** item
  **15/7x** it, at the same Legendary grade.
* **Testing the band:** the GM console has **Unlock Nightmare (Base Lv 150)**, which sets Base Lv 150
  and unlocks all five stages so you can walk straight into Nightmare Abyss 15.

## BUILD v76 — the square is paved, and the wall is masonry

A second realism pass over what the town camera actually shows, grounded in the Prontera references
the owner asked for: the city is a **walled rectangle**, and the **streets around the central
fountain are the market**.

* **The plaza is a market square, not a grey disc.** Two paved streets (2.6 wide, `limestone_pale`)
  cross the square through the fountain, and a paved apron (r 5.0..7.2) rings its basin, so the
  square reads as the crossroads the market sits on. The **flower beds moved off the crossing
  streets** onto the diagonals, behind the benches, so no bed stands in a road.
* **The wall reads as a wall.** The face the camera sees now carries **six buttresses a side**,
  **arrow slits** between them and a **corbel table** under the walkway, and each end of the curtain
  is capped by a **corner bastion** with merlons and a blue roof — the wall stops at a tower instead
  of stopping in the middle of a field.
* **Tests:** `town_smoke` is **36 scenarios** now (the new one walks the plaza's paving, checks that
  no bed stands in the crossing streets, counts the buttresses and slits, and re-checks that every
  course still names a tile the kit ships), and all **34** suites plus the five `--check` tools are
  green.
## Testing the preview (and getting GM tools on it)

```sh
node tools/dev_server.js --gm-all --db tools/.devdb/preview.sqlite
```

* The preview's database is **in memory by default**, so restarting it wipes accounts and saves, and
  the account you registered last time is gone. `--db <file>` keeps it instead (the path above is
  gitignored).
* **`--gm-all` makes every account registered on that preview an owner**, so a new preview can never
  leave you on an account with no GM tools. It is preview-only — never set `DEV_GM_ALL` on the
  Cloudflare project.
* **On the live server**, the owner is the first account registered against that database. If you lose
  it, the game's own `GM` login (username `GM` + the GM password) still gives you the GM tab in that
  browser, and `tools/cloudflare-deploy-steps.md` → *If you lose the owner (GM) account* has the
  one-line SQL to promote your cloud account back to `gm=2`.

## BUILD v75 — pet species passives and duplicate Bond

Pets used to differ only in their drawing and their rarity: two pets of one rarity were the same
pet, and a duplicate was dead weight in a 40-slot bag. A species now has a job of its own.

* **Every species carries one signature passive**, always on while that pet is one of the fighting
  three. It is worth **+5% when you tame it and +10% at Bond 5** — the ceiling is your rule
  ("*i dont want any buff go above 10%*"), and the ladder is five steps of +1%:

  | Pet | Signature passive | What it does |
  |---|---|---|
  | Poring | Greedy Gel | Zeny from kills |
  | Lunatic | Moonlit Study | EXP and Job EXP from kills |
  | Wolf | Pack Leader | Damage for **every** fighting pet |
  | Desert Wolf | Sand Tracker | Oridecon and Elunium drop chance |
  | Peco Peco | Swift Mount | Movement speed (the sheet says so on the line itself) |
  | Dragon Whelp | Hoarded Flame | Equipment drop chance |
  | Baphomet Jr. | Executioner | Damage to bosses, yours **and** your pets' |
  | Angeling | Divine Grace | Max HP, and less damage taken |

* **A duplicate folds into the pet you already own.** One pet per species, ever: the second Poring
  you find is merged into the first (best mutation kept, each gear slot keeps its better level, a
  skill the older pet was missing moves into its free slot) and the species gains **+1 Bond**. Fifty
  folded duplicates would be Bond 5 with nothing left to chase; the ladder is 1 / 3 / 6 / 10 / 15.
* **Old saves are folded on login**, exactly like a new duplicate — nothing is thrown away, and a
  stack of identical pets turns into one good pet plus Bond.
* **Nothing is a hidden multiplier.** Six of the eight passives cannot touch pet damage at all; the
  two that do (Pack Leader, Executioner) are held to the same companion band, and `pet_sim` now
  asserts the band *with Pack Leader at its ceiling* (0.78x, not 0.72x) so the promise is tested
  rather than assumed. No pet grants player crit chance — Index Crit is still the only path to 100%.
* **Where you see it:** the pet card prints the passive, the number at its current Bond and how many
  more duplicates the next rank wants; the pet list shows a `B2` badge; the Character sheet has a
  **Pet bonuses** line naming each fighting pet's contribution; and the Drops panel and pet-drop log
  lines name the passive when a species arrives. `+1 duplicate on the selected pet` buttons in the
  GM console let you watch a Bond climb without farming fifteen drops.

## BUILD v75 — the water is below the road: a sunken river, quays cut at the bridge

The v74 gate → bridge → river was all there and still read wrong through the game's own camera, so
this pass went back over the channel itself. Every problem was geometry, not art.

* **The river lay ON the road, not below it.** v74's water was a plane at y **.03** — level with the
  street — between quay walls standing 1.1 above it: the camera saw a blue stripe with a lip, and the
  bridge had nothing to arch over. `TOWN_RIVER` now carries the channel's own numbers (`water:-.85`,
  `bed:-1.35`, `span:4.2`, `gap:5.8`, `kerb:.45`). The lawn is built as **two** planes around the band
  (one lawn plane would have floated straight over the water), the bed takes the kit's `sand_gold`,
  and the water sits .85 below the street between two quay walls whose retaining faces run from the
  bed up to a low street parapet and its coping. The deck's crown is .87 and its underside .45, so it
  clears the water by 1.3 units: a bridge over water you can see, which is what "below is a river"
  asked for.
* **The quay wall ran straight across the avenue.** Each quay was one 150-unit box at z 15/20, so a
  wall crossed the road at both bridge mouths and the deck was buried in it. The run is now cut at the
  deck: the parapet stops at |x| > 4.65, the wall continues underneath as the bridge's abutment, and
  `town_smoke` guards it against the town's own box meshes — a long run whose span reaches into the
  avenue near a quay line fails the suite.
* **The arch cannot read (the town camera never looks down the river), so the channel carries it
  instead:** the deck's shadow on the water (a gradient strip under it), the shaded waterline at the
  foot of both quays, reeds inside the channel, a stair down to the water cut against the quay at
  x ±21, and the piers dressed as cutwaters standing on the bed.
* **All the masonry wears the kit's own stone.** The curtain wall, its watch towers, the gate towers,
  both quay courses, the deck (`bridge_planks` — the kit's own deck tile, the one the fields' bridges
  use) and the ramps name real kit tiles through `TOWN.tiles`, so no flat pastel box stands next to
  painted art any more.
* **The walk moved with it:** `townGroundY` takes its base from the bridge table (`B.base`), so the
  hero climbs the ramp from the street to the crown and down again, and `TOWN_BOUND.z1` is **22.3**
  (21.8 left the walk-out target standing on the journey's last metre of ramp).
  `tools/preview_town_board.py` draws the quay runs **cut at the deck** too — a full-width strip on
  the board was drawing the very bug the town had just been fixed for.
* **Tests:** `town_smoke` is **35 scenarios** (the bridge pins and the walk-out line rebuilt against
  the new numbers, the painted-shadow pair's off-by-one fixed, the masonry check guarded on
  `TOWN.kitArt` and its tile names verified against `assets/kit/ro-tiles-hd.json`), and all **34**
  suites plus the five `--check` tools are green.

## BUILD v74.1 — novices keep 1st-job gear, and the phone layout pass

* **The lowest gear band is Novice + 1st-job.** v74 made a Novice starter-gear-only, which locked
  a fresh character out of the very pieces a first job can wear a minute later. The gate is now
  `gearTierOf(item) <= max(1, classTierOf(you))`, so **sections 0 and 1 of the gear list are one
  band** (`Worn by: Novice and 1st-job classes`) and everyone from Novice to a 1st job wears both.
  2nd-job gear still needs a 2nd job; transcendent gear still needs a transcendent class. Nothing
  else about the tier system changed - the auto-stow-on-class-change, the auto-lock and the
  auto re-wear all still work, they just have less to do on a Novice.
* **The phone layout was rebuilt.** The owner played the deployed build on his phone and the UI
  was "abit messy and not in place". The causes were all the same shape - the layout assumed a
  desktop window:
  * **Viewport height.** `100vh` on a phone is the height with the URL bar *retracted*, so the
    game was taller than the screen and the bottom of the HUD sat below the fold. Everything that
    measures the screen now uses `100dvh` (with `100vh` kept first as the fallback), the visual
    viewport is watched as well as `resize` (iOS does not always fire one when the URL bar
    moves), and pull-to-refresh can no longer reload a farming session (`overscroll-behavior:none`).
  * **The dock is measured, not guessed.** `resize()` publishes the real dock height as
    `--docktop`, and the log feed, the pet-buff strip and the map/tab windows all sit just above
    it instead of being covered by it.
  * **The HUD is a fixed grid on a phone.** Two rows - identity / HP / Zeny, then `Kills/min ·
    EXP/min · DPS` - plus the account cluster on its own row. Numbers going from 9 to 10 to 100
    used to re-flow the whole bar.
  * **Tappable controls and reachable tabs.** Dock icons grow to 34px (32px on a small phone) from
    the 28px desktop size, the tab row scrolls sideways instead of wrapping into a second row, the
    panels fill the play area instead of being stacked into slivers, and the dock and the bottom
    bar clear a gesture bar via `env(safe-area-inset-bottom)`.
  * **Pinch to zoom.** A phone has no scroll wheel, so before this build the 3D camera could not be
    zoomed at all on one. One finger still rotates; two fingers pinch to zoom between the same
    0.6x and 2x limits the wheel uses; the finger that is not pinching never swings the camera, and
    lifting one finger resumes rotation from where the other one is instead of jumping.
  * Desktop is untouched - every one of those rules lives in `@media(max-width:700px)`,
    `max-width:430px` or `pointer:coarse` at the end of the stylesheet.
* **The APK question.** Tuning the web build (this section) is the right first move: the page is
  already installable from the browser once a `manifest.json` + service worker + icons are added
  ("Add to Home Screen" then gives a full-screen icon, no store, no signing), and an APK would be
  the *same files* inside a wrapper (Capacitor / Trusted Web Activity) needing a signing key and an
  account for every release, with no performance gain. Ask for the PWA files if the home-screen
  icon is wanted; ask for an APK only if a store listing is the goal.

## BUILD v74 — class gear tiers, movement speed on the sheet, EXP/min, softer boss crit resist

* **Equipment is gated by class tier now.** A piece belongs to a class tier (Starter / 1st-job /
  2nd-job / High-tier), and you must *be* that tier to wear it: a first job reaches 1st-job gear, a
  second job 2nd-job gear, and **High-tier gear is transcendent classes only**. So 2nd/3rd-class
  equipment can no longer be worn by a 1st class, and the item card says which tier a piece is for
  (`Worn by: 2nd-job classes and up`). **(v74.1: a Novice shares the first band with the 1st-job
  classes — see the v74.1 section below. The original v74 rule "a Novice wears starter gear only"
  was too strict and is rescinded.)**
* **Changing class takes the wrong gear off — safely.** Every worn piece your new class cannot use
  is moved to the Bag and **auto-locked**, so auto-sell can never eat it, and it remembers its
  wearer: *"This was Lord Knight's gear — it goes straight back on when you switch to Lord Knight
  again."* Switch back and it is worn again automatically, nothing duplicated. Saves made before
  this build are swept on login, so the rule applies from the first frame.
* **Movement speed is on the Character sheet.** `Move 7.35 u/s · 10.29 sprinting` beside ATK/ASPD,
  with a line explaining that AGI is the only stat that moves it (about +0.03 a point) and that
  the sprint multiplier applies on trips longer than 3 units. Nothing about the curve changed.
* **The HUD shows EXP/min.** The header row is now `Kills/min · EXP/min · DPS`, all on the same
  rolling 60-second window with the same stall reset; EXP counts gross income (a level-up no
  longer makes the meter dip).
* **Boss crit defence softened** (v73's ladder was too steep): Comodo/Louyang/Amatsu **-15%**,
  Niflheim **-20%**, Abyss **-30%**; maps 1-5 still resist nothing. A capped 60% build crits them
  **51/51/51/48/42%** of the time.

## BUILD v74 — the town's way in: a walled gate, a bridge over the river, a street of shops

This pass answers three things the owner saw in screenshots of the shipped town — "i would want the
building on the left side also", "all the buildings looks floating", "the entrance looks so off. just a
gate. maybe add bridge after gate to walk toward the center then below is a river" — and follows the
research they asked for (Prontera: dense blocks on all four sides, radial avenues off a central plaza
whose fountain is the market, the church north, **gates with moat water and bridges**).

* **Grounding (why they read as floating):** the contact shadow was a single plane whose *depth* came
  from the artwork's height (`e.h*k*.3`) with the texture squashed to match, so a tall narrow building
  stood on a wide pale puddle and a low prop on almost nothing. Both layers are now cut from the
  sprite's **width** — a soft penumbra and a tight dark core, offset slightly towards the camera — and
  the block stand-ins get the same pair, so a building does not change shape when the art pack lands.
* **The way in is a walk you can make:** the avenue is split by a **river** (z 15..20) drawn with the
  kit's own animated water tiles, crossed by a **stone bridge** whose deck and whose *ground height*
  come from one profile (`townGroundY`), so the hero walks up and over it; `townAvoid` keeps the hero
  out of the water off the deck, and the walkable bound now runs out to the wall the gate stands in.
  The gate itself moved into that **curtain wall** (crenellated, watch towers, gold finials), with market
  tents on the forecourt outside, the road out of town paved and two trees framing the approach.
* **The left flank is built:** three street houses (`TOWN.street`) front the avenue between the
  square's southern corner houses and the river — placed off dumped coordinates, since the ring's own
  corner houses already stand there.
* **How it was judged without a browser:** the dump (`node tools/_town_dump.js`) now carries the real
  ground tiles, the river, the bridge's segment tops, every solid box and a **second camera standing on
  the far bank**, and `python3 tools/preview_town_board.py` draws three boards — the plan, the square
  from the hero's landing spot, and **`board-3-town-entrance-view.png`**, the way in through the gate,
  over the bridge and up the avenue. That last board is the shot the owner's screenshot came from.
* **Tests:** `town_smoke` is **35 scenarios** now (the river and the bridge's walk line, the walk out of
  the square and over the arch, the entrance street, the grounding shadows, the river's animation tick),
  and all 34 suites plus the five `--check` tools are green.

## BUILD v73 — crit retune, Index Crit to 100%, lighter mid-map drops, boss crit resist

* **Refine no longer closes the slot picker.** While you are choosing a weapon/armour for a slot,
  clicking **Refine** (or a card socket, Unequip or Lock) used to shut the picker — those controls
  live in the **Equipment window**, and only the Bag counted as "inside". Both windows count now, so
  the picker survives a refine and you can compare the next piece. A click outside both windows (or
  the banner's ✕) still closes it.
* **Crit rate is a build again.** Base **2** (was 3), LUK pays **0.25** a point (was 0.4), the crit
  affix/card weight is **0.32** (was 0.45), and above **45%** every further point counts **half**.
  The core still caps at **60%**. A Lv70 LUK-99 dump plus both Hunter/Sniper crit passives lands
  ~51%, so you need gear to finish the cap.
* **Index Crit — the way to 100% without equipment or stats.** Every **Hunt Title** adds Index Crit
  that sits **outside** the 60% cap: +1/+1/+2/+2/+3/+4/+5/+6/+7/+9 → **+40** at a complete Index
  (all ten titles, 1,000,000 Index XP). A fully capped build plus a full Index is exactly **100%**.
  It is on the stats sheet, the Index panel and every title row; the GM panel's "Set the final title"
  tries it instantly.
* **Crit damage (cdm) can no longer be worn on every slot.** The **cdm affix now rolls on weapons
  and accessories only** (legacy gear keeps its rolls), its weight dropped **0.7 → 0.45** and the
  70% post-roll scale is unchanged: a top Legendary affix is +11-18 instead of +18-27, on at most
  three worn pieces. The **cdm card** keeps its own **3/7/10/13** ladder. The crit multiplier base
  moved **2.0 → 1.9**.
* **High-level bosses resist crits.** Comodo/Louyang/Amatsu **-20/-25%**, Niflheim **-30%**,
  Abyss **-40%** of your Crit %; maps 1-5 bosses resist nothing. Shown on the map panel and on the
  boss nameplate (`· Crit Res 20%`). **(v74 softened this to -15/-15/-15/-20/-30 — it was too
  steep.)**
* **Drops are 30% lighter from Comodo on.** Maps 6-10 pay **2.52%** gear a kill (was 3.6%) and their
  Stage-10 boss pools total **~4.2%** (was ~6%); Prontera and the four class maps keep every original
  number, and every boss still lists all of its items.
* **The 1-minute "offline reward" popup is gone.** A hidden tab is timer-throttled to about once a
  minute and grinds at full speed, so the old **60 s** "away" floor was paying twice for ordinary
  background play. The floor is now **three minutes** on both the client and the server, and a claim
  that lands inside the time this page has been open (and fits the sim's own 10-minute replay
  budget) is acknowledged without rewards or popup. A real absence still pays in full.
* **Pets:** PETBAL 2.65 → 1.91 so a maxed pet stays in the 0.6-0.7x companion band next to the
  re-tuned character ceiling.

## BUILD v72 — crit frame aligned, and the digits are the selection's own font and fill

* **The font was the "design looks off" report.** The copy button prints its raw slider keys, and the
  owner's paste said **`font: game`** — which on the proposal page is *Game (Trebuchet)*. The build
  had shipped **Chunky (Verdana 900)**, whose key would print as `font: classic`. So the digits were
  a different typeface from the strip they picked. Criticals are now Game (Trebuchet) at the tuned
  32px, normals 17px, both at the page's weight.
* **The crit fill is the page's, not a sticker.** Strip B draws the number as a **cream→gold gradient
  clipped to the glyphs** (`#fff3b0 → #ffc93c`) with a **.6px maroon stroke** and two soft drop
  shadows — not the flat gold fill under a heavy 4-way dark outline the game had. Skill crits get the
  same treatment in silver-blue.
* **One addition for the real map:** the page previews strip B on a dark background, where its thin
  stroke reads fine; on Prontera's bright grass it washes out (the page's own research notes a hard
  outline is what keeps digits legible there). A **1px dark drop-shadow rim** was added to the page's
  recipe, so the look survives bright ground without going back to the thick outline. Rendered proof:
  the four-row comparison in the report.
* **The burst breathes for its whole life** now: the page's own curve (overshoot to ×1.25 at 30%,
  settle with a small random rotation wobble, slow bloom to ×1.05), not a 0.32s pop that then froze.
* **Unchanged:** the frame geometry and centring from v71, colours, no CRIT chip, the v69 motion
  (arc punch, sway-up-fade-left, hold-then-fade from 55% of 1.05s), burst sizing from the number,
  and the v67 screen projection.

## BUILD v71 — the crit explode frame is centred on the digits again

* **What the owner saw:** after PR #29 the critical numbers did not look like the proposal page they
  were picked from. They were right — the frame was being drawn **half a burst up and left of the
  number**, so it read as a sun sitting beside the digits rather than a splash behind them.
* **The bug:** the pop animation sat on the `<svg>` *inside* the centred `.fburst` box. Its keyframes
  carry `translate(-50%,-50%)`, and on the svg that resolves against the svg's own width and height —
  a second half-box shift added on top of the box's own centring. The impact ring (which was animated
  correctly) stayed on the digits, which is what made the mismatch obvious.
* **Also restored to the proposal's own burst while fixing it:** the middle layer is the proposal's
  **8-spike inner star + pale core** again (a flat `r=26` gold disc had swallowed the middle of the
  starburst); the speed-lines are a **random spray** — length, thickness, angle, travel and duration
  all vary, 9 on a critical and 8 on a skill critical — instead of an even pinwheel; and the burst and
  ring follow the proposal's sizing (`max(2×fs, len×fs×.84)` wide, `2.5×fs` tall, ring `1.4×fs`).
* **Unchanged:** the colours, the 32px chunky digits, the absence of a CRIT chip, the v69 motion (arc
  punch on spawn, sway up then fade drifting left, hold-then-fade from 55% of the 1.05s life), the
  number-first sizing rule for 6–7 digit crits, and the v67 screen-projection registration.
* **Dev-only:** `Updates/damage-floats-proposal/` is the tuner page these settings come from — its
  strip B is now the same geometry the game draws, so the two can be compared side by side.

## BUILD v70 — crit 32px, short form from 100K (on top of v68/v69 of this session)

* **Damage numbers rebuilt to the owner's tuned pick (v69):** Verdana-900 chunky digits (17px normal, 32px critical after the v70 trim), arc punch on spawn, numbers spawn centred on the mob and **sway up then fade drifting left**, holding solid until 55% of their 1.05s life. Criticals and skill criticals carry the **restored explode frame** — irregular red starburst, speed-line streaks and an impact ring sized from the number (up to 7 digits), with **no "CRIT" chip**; skill criticals get their own silver-blue `skill-critical` look instead of borrowing the normal crit's.
* **Short form now starts at 100K (v70, the owner's rule):** 100,000 reads "100K", 1,000,000 reads "1M", and everything below — 99,999 included — stays in full digits. The Settings toggle still switches every float to full digits everywhere.
* **v68:** the skill-name banner moved above the hero's head (world height 3.65, was forehead-level 3.15); multi-cast slots still stagger upward.
* **Dev-only:** `Updates/damage-floats-proposal/` is the live tuner page that produced these settings (open with `python3 tools/preview_server.py 8000` → `/`; it has a **📋 Copy my selection** button). The weapon page moved to `/weapons`. Nothing in the proposal folder ships to players.
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
* **Testing:** all suites green plus the five `--check` tools. The town itself is driven end to end by
  `node tools/tests/town_smoke.js` — a jsdom harness that boots the real `index.html` with the real
  Three.js r128 (`npm i --no-save jsdom three@0.128.0`; it prints a skip line and exits 0 without
  them, so a clean checkout is never blocked). It walks **35 town scenarios** (the count and the list
  grew with each town pass; v74 added the river and the bridge's walk line, the walk out of the square
  and over the arch to the wall, the entrance street, the grounding shadows and the river's own
  animation tick — see the v74 section above): entry and scene swap,
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
  town is checked by `node tools/_town_dump.js` (jsdom walks into the real town with the real atlas
  manifest, takes the cameras the game would have — the hero's landing spot and the bank outside the
  gate — and writes every sprite's placement plus the ground tiles, the river, the bridge's segment
  tops and every solid box) and `python3 tools/preview_town_board.py`, which draws **three** boards: the
  plan at 2:1 (`Updates/town-hd/board-1-town-layout.png`, real crops at real world sizes, back to
  front), the **view through the game's own camera** (`board-2-town-camera-view.png`) and the
  **entrance** (`board-3-town-entrance-view.png`, from the bank outside the gate). The camera board is what caught the last real bug - the
  ring's west arc was a mirrored angle list, which is the *same* list, so all fourteen houses stood on
  the east side exactly on top of each other, invisible on the plan and obvious from the camera.
  Entering the town also pulls the camera back further than a field does (zoom .46, wheel to .40),
  because the square does not fit in a field's frame.
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
