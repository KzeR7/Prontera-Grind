#!/usr/bin/env bash
# Optimize the original AI-generated Sanctuary material textures.
set -euo pipefail
cd "$(dirname "$0")/../.."
for name in walkway-wood gym-sand gym-plaster; do
  adjustments=()
  case "$name" in
    walkway-wood) adjustments=(-modulate 135,75,100 -brightness-contrast 0x-8);;
    gym-sand) adjustments=(-modulate 125,70,100 -brightness-contrast 0x-20);;
  esac
  convert "tools/digimon/${name}-source.png" -resize 768x768 "${adjustments[@]}" -quality 84 "assets/digimon/sanctuary/${name}.webp"
done
