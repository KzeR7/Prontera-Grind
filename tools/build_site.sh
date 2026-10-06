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
require assets/kit/ro-spritesheet.png
require assets/kit/ro-spritesheet.json
require Updates/Sprite

cp "$ROOT/index.html" "$OUT/index.html"
cp "$ROOT/gm.html" "$OUT/gm.html"
cp "$ROOT/_routes.json" "$OUT/_routes.json"
cp -r "$ROOT/assets" "$OUT/assets"
mkdir -p "$OUT/Updates"
cp -r "$ROOT/Updates/Sprite" "$OUT/Updates/Sprite"

# A build that silently ships the wrong thing is worse than one that fails.
for must in index.html gm.html _routes.json assets/sprite_pack_data.js assets/class_skins_data.js assets/weapon_joints_data.js; do
  [ -s "$OUT/$must" ] || { echo "BUILD BROKEN: $must is missing or empty in $OUT" >&2; exit 1; }
done
for forbidden in _login.html _shot.html logic2.js; do
  [ -e "$OUT/$forbidden" ] && { echo "BUILD BROKEN: $forbidden must never be published" >&2; exit 1; }
done
[ -d "$OUT/tools" ] && { echo "BUILD BROKEN: tools/ leaked into the publish directory" >&2; exit 1; }

echo "wrote $OUT"
echo "  $(du -sh "$OUT" | cut -f1) total, $(find "$OUT" -type f | wc -l) files"
echo "  html:    $(du -sh "$OUT/index.html" | cut -f1)
  console: $(du -sh "$OUT/gm.html" | cut -f1)"
echo "  assets:  $(du -sh "$OUT/assets" | cut -f1)"
echo "  sprites: $(du -sh "$OUT/Updates/Sprite" | cut -f1)"
