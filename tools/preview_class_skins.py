#!/usr/bin/env python3
"""Paint exactly what the game draws, for review without a browser.

This is a dev tool: it reads the same manifest the game reads
(assets/class_skins_data.js, built by tools/make_class_skins.py) and repeats index.html's
drawing maths offline - the measured crop of the source PNG, the mirror, one constant scale
per class/gender, and the pose's own bottom edge on the ground line.  Nothing here is game
art; every pixel comes from Updates/Sprite/.

    python3 tools/preview_class_skins.py                       # every class into /tmp/class_skins_qc
    python3 tools/preview_class_skins.py --out /tmp/qc --scale 2
    python3 tools/preview_class_skins.py --class Knight        # one class only

The two columns marked ATTACK show attacking-dir0 and the mirrored attacking-dir1, which is
how the game draws a swing facing the camera and a swing facing the other way.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets" / "class_skins_data.js"

# The game's SKIN_VIEW / SKIN_ATTACK_MIRROR tables (index.html), in viewDir order 0..7
SKIN_VIEW = {0: ("S", 0), 1: ("SE", 1), 2: ("SE", 1), 3: ("NE", 1), 4: ("NE", 0), 5: ("NE", 0), 6: ("SE", 0), 7: ("SE", 0)}
SKIN_ATTACK_MIRROR = [0, 1, 1, 1, 0, 0, 0, 0]
BACKDROP = (236, 233, 226, 255)
GROUND = (206, 198, 182, 255)
INK = (34, 30, 26, 255)


def load_manifest():
    text = MANIFEST.read_text(encoding="utf-8")
    match = re.search(r"window\.CLASS_SKINS=(\{.*\});", text, re.S)
    if not match:
        raise SystemExit("assets/class_skins_data.js is missing - run tools/make_class_skins.py")
    return json.loads(match.group(1))


def cell(manifest, cls, sex, view, mirror, box_height, scale):
    """One drawn cell: crop, mirror, scale - the same numbers the game uses."""
    entry = manifest["classes"][cls][sex]
    img = Image.open(ROOT / manifest["dir"] / entry["files"][view]).convert("RGBA")
    x, y, w, h = entry["poses"][view]
    art = img.crop((x, y, x + w, y + h))
    if mirror:
        art = art.transpose(Image.FLIP_LEFT_RIGHT)
    px = scale * (box_height / entry["ref"])
    return art.resize((max(1, round(w * px)), max(1, round(h * px))), Image.NEAREST)


def sheet(manifest, cls, classes, scale, cell_w, cell_h, label_h):
    """-> an image with one row per gender and one column per facing / attack."""
    cols = list(range(8)) + ["a0", "a1"]
    width = 92 + len(cols) * (cell_w + 6) + 6
    height = label_h + 2 * (cell_h + label_h + 8) + 8
    img = Image.new("RGBA", (width, height), BACKDROP)
    draw = ImageDraw.Draw(img)
    draw.text((6, 5), f"{cls} - the game's own art, drawn the way index.html draws it "
                      f"(row 1 male, row 2 female)", fill=INK)
    for row, (sex, label) in enumerate((("m", "male"), ("f", "female"))):
        top = label_h + row * (cell_h + label_h + 8)
        draw.text((6, top + 4), label, fill=INK)
        for index, col in enumerate(cols):
            left = 92 + index * (cell_w + 6)
            draw.rectangle([left, top, left + cell_w, top + cell_h], fill=GROUND)
            if col == "a0":
                view, mirror, tag = "attack", False, "attack SE"
            elif col == "a1":
                view, mirror, tag = "attack", True, "attack SW"
            else:
                view, mirror = SKIN_VIEW[col]
                tag = f"{['S','SW','W','NW','N','NE','E','SE'][col]} -> {view}{' (mirror)' if mirror else ''}"
            art = cell(manifest, cls, sex, view, mirror, cell_h - 8, scale)
            img.alpha_composite(art, (left + (cell_w - art.width) // 2, top + cell_h - 4 - art.height))
            draw.text((left, top + cell_h + 2), tag[:18], fill=INK)
    return img


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="/tmp/class_skins_qc", help="directory for the QC images")
    parser.add_argument("--class", dest="only", help="one class name (default: every class)")
    parser.add_argument("--scale", type=float, default=1.4, help="pixel zoom of the source art")
    parser.add_argument("--cell", type=int, default=76, help="cell width in the sheet")
    parser.add_argument("--row", type=int, default=104, help="cell height in the sheet")
    args = parser.parse_args()

    manifest = load_manifest()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    names = [args.only] if args.only else list(manifest["classes"])
    strip = []
    for name in names:
        if name not in manifest["classes"]:
            raise SystemExit(f"unknown class {name!r}; try one of: {', '.join(manifest['classes'])}")
        img = sheet(manifest, name, names, args.scale, args.cell, args.row, 18)
        img.save(out / f"{name.replace(' ', '_').lower()}_directions.png")
        strip.append(img)
        print(f"wrote {out / (name.replace(' ', '_').lower() + '_directions.png')}")
    if len(strip) > 1:
        total = sum(i.height + 4 for i in strip)
        combined = Image.new("RGBA", (max(i.width for i in strip), total), BACKDROP)
        y = 0
        for i in strip:
            combined.alpha_composite(i, (0, y))
            y += i.height + 4
        combined.save(out / "all_classes_directions.png")
        print(f"wrote {out / 'all_classes_directions.png'} ({combined.width}x{combined.height})")
    print(f"{len(names)} class(es): crops are the art's own pixels; mirrors are horizontal flips; "
          f"the scale is the game's constant per class/gender (SKIN_H / the S pose height).")


if __name__ == "__main__":
    main()
