#!/usr/bin/env bash
# build_site.sh - assemble EXACTLY the files the game needs into dist/ , so a static host
# (Render Static Site, Cloudflare Pages, GitHub Pages, any nginx) publishes the game and nothing else.
#
#   bash tools/build_site.sh            # writes ./dist
#   bash tools/build_site.sh /tmp/out   # writes somewhere else
#
# Why this exists: the repo is the game AND its tools, art sources, audit pages and screenshots. A
# static host pointed at the repo root publishes all of it - which is how the retired GM password
# ended up downloadable at /_login.html, and why a full load of the site was ~21 MB larger than it
# needs to be. Point the host's publish/output directory at dist/ instead.
#
# What the game actually fetches at runtime (measured, not guessed):
#   index.html                     the whole game
#   gm.html                        the GM console (a client of /api/gm/*, worthless without a GM session)
#   assets/                        sprite pack, class skins data, weapon joints, map kit, mob fallbacks
#   Updates/Sprite/                the animated class PNGs that assets/class_skins_data.js points at
#   _routes.json                   Pages config: only /api/* goes through Functions (Cloudflare, v62)
# Everything else - tools/, Sprite/, image-search/, the audit pages, the legacy _login.html/_shot.html
# and the _recon screenshots - is repo material, not game material.
#
# It is not published by any test: it only reads the repo and writes dist/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/dist}"

rm -rf "$OUT"
mkdir -p "$OUT"

require() { [ -e "$ROOT/$1" ] || { echo "MISSING: $1 - the game would load broken from this build" >&2; exit 1; }; }
require index.html
require gm.html
require _routes.json
require assets/sprite_pack_data.js
require assets/class_skins_data.js
require assets/weapon_joints_data.js
require assets/wardrobe/v5/catalog.json
require assets/wardrobe/fourth/v1/catalog.json
require assets/kit/ro-spritesheet.png
require assets/kit/ro-spritesheet.json
require Updates/Sprite

cp "$ROOT/index.html" "$OUT/index.html"
cp "$ROOT/gm.html" "$OUT/gm.html"
cp "$ROOT/_routes.json" "$OUT/_routes.json"
cp -r "$ROOT/assets" "$OUT/assets"
# The preserved first fitting is a development reference; v5 is the live shared class/outfit pack.
rm -rf "$OUT/assets/wardrobe/v1" "$OUT/assets/wardrobe/v3" "$OUT/assets/wardrobe/v4" "$OUT/assets/fourth-jobs"
# Development-only art that would otherwise ride along with cp -r assets. Measured with the page
# load, not guessed: a normal session never asks for any of these.
#   assets/mob_*.png        only Updates/damage-numbers-v2/index.html, a page that is not published
#   assets/weapons/**       only tools/weapon_proposal.html - the game draws weapons from the
#                           base64 window.WEAPON_ART in assets/weapons_data.js
#   weapons_manifest.json   build metadata for make_weapon_pack.py, never fetched
rm -rf "$OUT/assets/weapons" "$OUT/assets/weapons_manifest.json"
rm -f "$OUT"/assets/mob_*.png
mkdir -p "$OUT/Updates"
cp -r "$ROOT/Updates/Sprite" "$OUT/Updates/Sprite"

# Strip whitespace only from four ordinary map-kit JSON delivery copies.
node "$ROOT/tools/optimize_delivery.js" "$OUT"
node "$ROOT/tools/maps/build_game_exploration.js" "$OUT"
# The selected vendored renderer ships with its complete MIT license.
cp "$ROOT/tools/maps/vendor/THREE-LICENSE.txt" "$OUT/assets/endgame/THREE-LICENSE.txt"

# Static build tag for updateWatch() so 60-second deploy checks hit the CDN instead of /api/* Functions.
#
# v275 (owner): the HTML entry point must always be REVALIDATED, never served from a stale cache.
# index.html is where `const BUILD` lives AND where every asset `?v=` number lives, so a cached copy
# of it cannot be rescued: it asks the CDN for the OLD `?v=` names, gets the OLD assets, and the
# player keeps the old client - including whatever fix shipped in those assets. The owner had to
# clear the browser by hand to see the v274 emoji fix for exactly this reason. Cloudflare Pages sets
# no Cache-Control on HTML, so browsers applied heuristic freshness and pinned the old page for days.
#
# `no-cache` = "you may store it, but revalidate before reusing it". A returning player then costs one
# conditional request answered 304 - the ~1.3 MB of HTML is NOT re-sent - instead of staying on an old
# build. assets/ is content-addressed by `?v=` and keeps its long cache, so this costs one revalidating
# request per load, not a re-download.
node -e '
  const fs = require("fs");
  const out = process.argv[1];
  const html = fs.readFileSync(out + "/index.html", "utf8");
  const m = html.match(/const BUILD=\x27([^\x27]+)\x27/);
  if (!m || !m[1]) { console.error("BUILD BROKEN: const BUILD missing in index.html"); process.exit(1); }
  fs.writeFileSync(out + "/version.txt", m[1]);
  const NO_CACHE = "  Cache-Control: no-cache, must-revalidate\n";
  fs.writeFileSync(out + "/_headers",
    "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
    + "/index.html\n" + NO_CACHE
    + "/gm.html\n" + NO_CACHE
    + "/*.html\n" + NO_CACHE
    + "/version.txt\n" + NO_CACHE + "  Content-Type: text/plain; charset=utf-8\n");
' "$OUT"

# A build that silently ships the wrong thing is worse than one that fails.
for must in index.html gm.html _routes.json version.txt _headers assets/sprite_pack_data.js assets/class_skins_data.js assets/weapon_joints_data.js; do
  [ -s "$OUT/$must" ] || { echo "BUILD BROKEN: $must is missing or empty in $OUT" >&2; exit 1; }
done
for forbidden in _login.html _shot.html logic2.js docs tools Sprite image-search assets/weapons assets/weapons_manifest.json; do
  [ -e "$OUT/$forbidden" ] && { echo "BUILD BROKEN: $forbidden must never be published" >&2; exit 1; }
done
[ -d "$OUT/tools" ] && { echo "BUILD BROKEN: tools/ leaked into the publish directory" >&2; exit 1; }
compgen -G "$OUT/assets/mob_*.png" > /dev/null && { echo "BUILD BROKEN: dev-only mob previews leaked into the publish directory" >&2; exit 1; }

# Cloudflare Pages Free: keep the generated tree below 20,000 files and 25 MiB/file.
FILE_COUNT=$(find "$OUT" -type f | wc -l)
[ "$FILE_COUNT" -lt 20000 ] || { echo "BUILD BROKEN: Pages free file-count limit exceeded" >&2; exit 1; }
OVERSIZED=$(find "$OUT" -type f -size +26214400c -print -quit)
[ -z "$OVERSIZED" ] || { echo "BUILD BROKEN: asset exceeds Pages 25 MiB limit: $OVERSIZED" >&2; exit 1; }

echo "wrote $OUT"
echo "  $(du -sh "$OUT" | cut -f1) total, $(find "$OUT" -type f | wc -l) files"
echo "  html:    $(du -sh "$OUT/index.html" | cut -f1)
  console: $(du -sh "$OUT/gm.html" | cut -f1)"
echo "  assets:  $(du -sh "$OUT/assets" | cut -f1)"
echo "  sprites: $(du -sh "$OUT/Updates/Sprite" | cut -f1)"
