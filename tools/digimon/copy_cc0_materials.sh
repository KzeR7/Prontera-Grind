#!/usr/bin/env bash
# Reproduce the exact browser copies from the pinned, CC0 Poly Haven mirror.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p assets/digimon/sanctuary/cc0
for name in medieval_wood rough_pine_door roof_09; do
  cp "tools/digimon/cc0-materials/$name.webp" "assets/digimon/sanctuary/cc0/$name.webp"
done
