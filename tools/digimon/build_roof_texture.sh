#!/usr/bin/env bash
# Optimize the AI-generated shingle texture used by the Sanctuary building.
set -euo pipefail
cd "$(dirname "$0")/../.."
convert tools/digimon/timber-roof-source.png -resize 768x768 -quality 84 assets/digimon/sanctuary/timber-roof.webp
