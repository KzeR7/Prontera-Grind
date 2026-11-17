# Cloud data and delivery size

Local audit: 2026-10-15, updated after World Atlas integration. Sizes below are decimal MB (1,000,000 bytes), not monthly
account usage, provider billing or a guarantee about a hosting plan.

## What uses cloud resources

- **Published storage:** the assembled `dist/` tree, not the full Git repository.
- **Player downloads:** HTML/code and requested artwork. The total published tree
  is not one visit's transfer. Native wardrobe/pet artwork is loaded on demand;
  `sprite_pack_data.js` is a legacy fallback, not normal native startup artwork.
- **API/database usage:** account/session/save/leaderboard requests and stored
  records. `_routes.json` includes only `/api/*`; static resources do not invoke
  Pages Functions under this configuration. Save frequency/player count matter
  separately from image sizes. No live account usage or current pricing was read.
- **Rendering:** geometry, ambient movement and native animation run in the
  browser, not a stream of cloud-rendered frames. The new journey preview makes
  no game API/save calls. Future live integration should persist progression
  identifiers, not generated scene geometry or texture pixels.

## Changes and measured sizes

| Item | Before | After | Meaning |
| --- | ---: | ---: | --- |
| Production static tree: adding in-game exploration | 39,769,265 B | 44,190,234 B | 1,195 files; about 44.19 MB / 42.14 MiB, not a visit's download |
| Production static tree: latest main skill FX + exploration | 44,190,234 B | 44,603,321 B | 1,196 files; about 44.60 MB / 42.54 MiB; skill FX retained from main, exploration payload unchanged |
| Three journey environment images | 6,523,346 B | 3,734,024 B | 42.8% smaller with exactly the same decoded pixels |
| Astral opening: environment images | 6,523,346 B | 2,289,304 B | 64.9% smaller: stone + space only; lava deferred |
| Thor opening: environment images | 6,523,346 B | 2,817,162 B | 56.8% smaller: stone + lava only; space deferred |
| Journey stage change / return to already loaded destination | Previously eagerly loaded | No additional environment image requests | Shared image/promise cache for this page's lifetime |

The earlier production optimisation still saves **186,336 bytes**, from removing whitespace in four
ordinary map-kit JSON delivery copies. Parsed values are strictly checked before
writing; source documents, PNG artwork, native catalogs/metadata and fallback
bytes are untouched. Hosting compression may make the actual transfer difference
smaller than this raw-file saving. The build now needs Node as well as Bash.

The lossless assets now also ship for the in-game **World Atlas → Season 2 Maps** view. The selected runtime is 4,410,802 bytes, including a local
renderer and its MIT license, code and three WebP images. It loads **only on opening
exploration**, not on login or when merely opening the atlas. Relative to the
pre-exploration game, initial HTML/controller additions are 10,167 raw bytes; this is not a
compressed network-transfer measurement. A build guard caps the whole site at
43 MiB and selected exploration resources at 4.25 MiB.

The game adapter selects runtime files from the reviewed workshop sources into
`dist/assets/endgame/`; it does not publish tools, source PNG masters, proposal
art or captures. The workshop/reference studio remain developer-only pages. Their
PNG masters are retained for editing and exact-pixel verification, not shipped.
The scene has no save/API calls; the parent game's original farming and normal
account/save traffic continue separately. Exploration unlocks/rewards are not live.

Actual Chromium checks observed only the two Astral WebP requests on opening,
with HTTP Content-Length matching the manifest; switching to Thor requested lava
once, and returning/stage navigation requested no additional environment images.
The earlier standalone-workshop local initial Astral page's advertised response-body total was
**3,318,502 bytes**, including code/native-character resources. This is a local
request/header audit, not a production wire/billing measurement; TLS/HTTP headers,
compression, browser caches and deployed responses can differ. Resource Timing
size fields were unavailable in this software-browser environment and are not used
as a bandwidth measurement.

## The stored save format (codec v414 / `__v` 2)

A save row is stored **compact**: `inv`, `cards`, the fishing bag and - since `__v` 2 - the cards
socketed inside items are written as positional tuples instead of objects, and `eq` stays ordinary.
`functions/_lib/save-codec.js` and the inline copy in `index.html` (around `SAVE_CODEC_VERSION`) must
stay mirrored; they are both at version 2.

**Codec v2 drops two redundant things and nothing else:**

- a card's `n` is rebuilt from `family` + `nightmare` (it is always `(nightmare ? 'Nightmare ' : '') +
  family`). `family` is *kept*, because it is only derivable from `cardKey` via the page's static
  `CARD_CATALOG`, which the server does not have.
- the cards socketed in an item get the same tuple as a loose card. They used to be stored as full
  objects, which was the last uncompacted collection and cost ~53% more per socketed card.

Neither is a "rebuild by re-rolling": nothing is generated or randomised, and a card whose name does
not follow the rule keeps its stored copy, so the codec can never rename a card.

**Compatibility.** `GET /api/save` and every conflict/restore-fenced reply run the stored blob through
`blobForClient(blob, clientSaveFormat(request))`. A page that does not send `X-Save-Format` gets the
save **unpacked to plain objects**; a page that sends 110 or later gets the compact text. This matters
because a pre-v414 loader keeps only fishing entries with a string `sp` - a compact fish tuple has none,
so an old page handed a compact row would show zero fish and then upload that loss. **Never remove that
gate**; `save_codec_chain_sim.mjs` block 7 fails without it.

**Ceiling and sizes** (`SAVE_BYTES_MAX` = 307,200 chars, checked on `Content-Length` before any parse).

`CARDMAX` is **not** a limit on how many cards a save may contain. It gates *acquiring a loose card*:
`cardStorageFull()` reads only `S.cards`, and socketed cards live in `item.cards`. A player can socket
cards and then earn another 1000 loose ones (`unsock()` pushes them back into `S.cards`), so
"loose + socketed" is **not** bounded by 1000.

**Codec v3** (`__v` 3) closes that gap. Three facts made it possible:

- A modern card is a *catalog row plus an identity*. `repairProgression()` already overwrites `family`,
  `n`, `stat`, `v`, `effects`, `fit`, `g`, `bossCard`, `map` and `nightmare` from `CARD_CATALOG` on every
  load, so those fields are a cache. v3 stores `[catalogId, id]`, plus a third slot `stars?` only when
  the card is actually starred - 23 chars instead of 118, 25 when starred.
  The table lives in `functions/_lib/card-catalog.js`, generated from the page's own `cardDefinition()`,
  and `save_codec_catalog_sim.mjs` fails if the two copies ever disagree. A card that does not match its
  row exactly (edited value, unknown key, wrong progression version, any unknown field) keeps the full
  v2 tuple, so the codec can never rename or normalise a card.
- A fish timestamp is a 13-digit ms value and a mutation comes from a closed set of 7. v3 stores `at` as
  a small delta from `__at` (sent once) and `mut` as an index.

**The catalog id is permanent.** `card-catalog.js` row 0 is a frozen integer id, assigned once and
never renumbered, reused or reordered: new cards take the next id above the current maximum and a
retired id is retired. A save stores that id. An array position would not work - inserting one card
that sorts first silently re-points every stored reference, so an older save decodes to a different
card than the player owns. `save_codec_catalog_sim.mjs` pins all 192 ids in a fixture and fails on any
renumber, and a historical-save test decodes the same blob twice to prove the mapping is stable.
An id the running build does not know is returned untouched, never guessed.

**A client is only handed a version it can decode.** The page sends `X-Save-Format` with its build
number; the server reads the *stored* blob's `__v` and unpacks to plain objects when the client is too
old for it. Build 111 decodes `__v` 3; build 110 stops at `__v` 2. Without this, a page from a previous
build would receive v3 rows and drop every card field and every fish it could not parse - and its next
upload would save that loss. Note that these constants are build numbers on the same scale as the
header, not a small enum: an enum (1, 2) makes `110 >= 2` true and silently hands v3 rows to everyone.

| State | compact v2 | compact v3 | syncs? |
| --- | ---: | ---: | --- |
| the reported account, 901 items / 485 cards / 801 fish | 188,726 | **147 KB** | yes |
| 1000 items, 1000 loose cards, 1000 fish | 266 KB | **172 KB** | yes, 128 KB spare |
| 1000 items, 0 loose, 1000 socketed cards, 1000 fish | 265 KB | **171 KB** | yes |
| 1000 items + 7 fully-carded worn items, 1000 loose cards, 1000 fish | 274 KB | **~180 KB** | yes |
| **1000 items x1 socketed + 1000 loose + 1000 fish** | 376 KB | **193 KB** | **yes**, 107 KB spare |
| **1000 items x4 socketed + 1000 loose + 1000 fish** (5000 real cards) | 703 KB | **275 KB** | **yes**, 32 KB spare |
| the same, with every other card starred | - | **280 KB** | **yes**, 27 KB spare |

So: **every reachable state fits, including the worst one.** 5000 cards, each carrying its own
17-character `Date.now()+Math.random()` id, is ~275 KB against a 307,200 ceiling - and ~280 KB with
every other card starred. The ids alone are ~28% of that save, and they are never shortened or
regenerated to make it smaller: a save id is the player's card identity.

A per-save id table was implemented, measured and **removed**: it costs more than it saves. The table
must contain each unique id once, and the references it replaces are only ~15 chars shorter, so for
unique ids it is a net loss (measured on 1000 loose cards: 38,241 chars with the table against 31,726
without). It only ever helped when ids repeat, which a real save does not do.

`save_max_state_sim.mjs` asserts **every** state above fits, including the 5000-card worst case and the
same state with half the cards starred. Starring used to disqualify a card from the catalog form, which
put this account back over the ceiling (~396 KB); that is now a regression test.

**No player data was changed to reach this.** No card is deleted and no new ownership limit was added:
the codec is a transport encoding and may not change what a player owns, and it never re-rolls,
regenerates or re-ids a card. Every gain above is a smaller *description* of the same data - a catalog
reference instead of a duplicated row, a delta instead of a timestamp, an omitted slot instead of an
absent marker. The save that used to be rejected for being too large is now the same save, encoded
smaller. `Workers Paid` raises the CPU ceiling but **does not** raise `SAVE_BYTES_MAX`.

**A GM edit keeps the row's format.** `storedBlobForm(save, previousBlob)` in `functions/api/gm/player.js`
re-packs through `packSave` when the row was compact, so an unlock or a history restore cannot quietly
inflate a 189 KB row into 370 KB, push it over the ceiling, and make restoring that history entry
return 413. A restore revokes the account's sessions, which is why tests that GM-restore need a fresh
login afterwards.

**CPU.** See `docs/CPU-LIMIT.md`: in a Node harness running the real handlers, a whole accepted
`PUT /api/save` (auth, parses, audits, D1, response) dropped from 7.97 ms to 5.38 ms at
237 KB -> 120 KB, and the parse count is pinned at 3. That is a like-for-like comparison inside this
repository, **not** a measurement of Cloudflare's billed `cpu_ms` - use Pages CPU quantiles or
`wrangler pages deployment tail` for that.

## What is deliberately not deleted

The active wardrobe catalog references all 615 non-catalog files in v5; the pet
catalog references all 162 non-catalog files in v1. They are not obsolete duplicates.
The skill artwork and legacy fallback remain necessary runtime resources. Removing
classes/pets or the fallback to make a smaller number would remove functionality.
Native sprite pixels, directions, timing and placement have not been modified.

Concept art, review screenshots, source PNGs, scripts and documentation are already
absent from `dist/`. The build/test now explicitly rejects `docs/` alongside tools
and source-art folders. `docs/` was also added to the advisory `.assetsignore` list;
**publishing only `dist/` is the tested boundary**, not relying on root-directory
ignore behavior. Do not publish the repository root to save a build step.

## When a player says their save is gone

Do not guess from the symptom - read what the server actually holds for that account. The query, and
how to read each answer, is in [checking a save](CHECK-A-SAVE.md). It also shows how to list the older
blobs in `save_history` before restoring one.

## Reproduce / maintain

```sh
bash tools/build_site.sh
node tools/tests/publish_sim.js
node tools/tests/map_delivery_sim.js
CHROMIUM_BUNDLED_LIBS=1 node tools/check_map_journey_browser.js http://127.0.0.1:8000 --publish
```

For regenerated environment artwork, install Pillow with WebP support in your
Python environment, then run `python3 tools/maps/build_runtime_textures.py`.
It writes content-hashed lossless WebP copies and `runtime-manifest.json`, verifies
source/decoded pixel equality and removes only superseded copies from its previous
manifest. Never run native sprite files through this environment-only pipeline.
Refresh browser captures after changing workshop source/runtime assets.

Browser HTTP cache behavior across reloads depends on deployed response headers;
no long-lived cache headers or cloud configuration were changed here. Lossless
compression reduces stored/downloaded image bytes, **not decoded GPU texture
memory**. No deployment, remote migration or live account change was performed.
