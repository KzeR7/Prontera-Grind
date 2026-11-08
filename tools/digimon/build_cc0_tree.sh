#!/usr/bin/env bash
# Extract one transparent tree (first row, fifth column) from rubberduck's CC0 tree sheet.
set -euo pipefail
cd "$(dirname "$0")/../.."
convert tools/digimon/cc0-materials/rubberduck-isometric-trees.png -crop 384x560+1536+0 +repage -trim +repage -resize 384x512 -quality 88 assets/digimon/sanctuary/cc0/woodland-tree.webp
