#!/usr/bin/env python3
"""Build the lightweight DigiDex portrait sheet from bundled idle frames.

Requires Pillow 11.3. No source art is downloaded or repainted. The browser loads
this single static WebP instead of every full animation atlas in the index.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import re

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "digimon"
SOURCE = ASSETS / "v3"
IMAGE = ASSETS / "digidex-portraits.webp"
MANIFEST = ASSETS / "digidex-portraits.json"
CELL = 64
COLUMNS = 20
FIT = 56


def roster_ids() -> list[str]:
    source = (ASSETS / "roster.js").read_text(encoding="utf-8")
    match = re.search(r"const ENTRIES=(\[.*?\]);\nconst IDS=", source, re.S)
    if not match:
        raise RuntimeError("Could not read the generated roster entries")
    ids = [entry["id"] for entry in json.loads(match.group(1))]
    if len(ids) != 280 or len(set(ids)) != len(ids):
        raise RuntimeError(f"Expected 280 unique forms, got {len(ids)}")
    if any(not re.fullmatch(r"[a-z0-9_-]+", form) for form in ids):
        raise RuntimeError("Unsafe form ID in portrait roster")
    return ids


def build() -> tuple[bytes, dict]:
    ids = roster_ids()
    rows = (len(ids) + COLUMNS - 1) // COLUMNS
    sheet = Image.new("RGBA", (COLUMNS * CELL, rows * CELL), (0, 0, 0, 0))
    for index, form in enumerate(ids):
        record = json.loads((SOURCE / f"{form}.json").read_text(encoding="utf-8"))
        idle = record.get("actions", {}).get("idle", [])
        if not idle:
            raise RuntimeError(f"{form}: no bundled idle frame")
        rect = idle[0]["rect"]
        if len(rect) != 4 or any(not isinstance(v, int) or v < 0 for v in rect):
            raise RuntimeError(f"{form}: invalid idle rectangle")
        x, y, width, height = rect
        image_name = Path(record["image"]).name
        if image_name != record["image"] or image_name != f"{form}.webp":
            raise RuntimeError(f"{form}: unexpected atlas path")
        with Image.open(SOURCE / image_name) as atlas:
            atlas = atlas.convert("RGBA")
            if x + width > atlas.width or y + height > atlas.height or not width or not height:
                raise RuntimeError(f"{form}: idle rectangle exceeds its atlas")
            portrait = atlas.crop((x, y, x + width, y + height))
        alpha_box = portrait.getchannel("A").getbbox()
        if not alpha_box:
            raise RuntimeError(f"{form}: empty idle portrait")
        portrait = portrait.crop(alpha_box)
        scale = min(FIT / portrait.width, FIT / portrait.height)
        size = (max(1, round(portrait.width * scale)), max(1, round(portrait.height * scale)))
        portrait = portrait.resize(size, Image.Resampling.NEAREST)
        cell_x = (index % COLUMNS) * CELL
        cell_y = (index // COLUMNS) * CELL
        sheet.alpha_composite(portrait, (cell_x + (CELL - size[0]) // 2, cell_y + (CELL - size[1]) // 2))
    encoded = io.BytesIO()
    sheet.save(encoded, format="WEBP", lossless=True, quality=95, method=6)
    payload = encoded.getvalue()
    manifest = {
        "version": 1,
        "image": IMAGE.name,
        "source": "One alpha-trimmed idle frame from each bundled v3 form",
        "cell": CELL,
        "columns": COLUMNS,
        "rows": rows,
        "width": sheet.width,
        "height": sheet.height,
        "count": len(ids),
        "ids": ids,
        "sha256": hashlib.sha256(payload).hexdigest(),
    }
    return payload, manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify checked-in outputs without rewriting them")
    args = parser.parse_args()
    payload, manifest = build()
    expected_manifest = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if not IMAGE.exists() or IMAGE.read_bytes() != payload:
            raise SystemExit("Portrait sheet is stale; run tools/digimon/build_digidex_portraits.py")
        if not MANIFEST.exists() or MANIFEST.read_text(encoding="utf-8") != expected_manifest:
            raise SystemExit("Portrait manifest is stale; run tools/digimon/build_digidex_portraits.py")
    else:
        IMAGE.write_bytes(payload)
        MANIFEST.write_text(expected_manifest, encoding="utf-8")
    print(f"{'Verified' if args.check else 'Built'} {len(manifest['ids'])} portraits · {manifest['width']}×{manifest['height']} · {len(payload) / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
