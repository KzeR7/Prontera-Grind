#!/usr/bin/env python3
"""Build the live class-skin manifest from the canonical Updates/Sprite art.

Run from the repository root:

    python3 tools/make_class_skins.py
    python3 tools/make_class_skins.py --check

The owner's class art (Updates/Sprite/<tree>/<job> <gender> <pose>.png) is one 200x200
still per supplied view - not an animation sheet.  This tool measures what the game needs
to draw those stills and writes assets/class_skins_data.js:

    window.CLASS_SKINS.classes[class][gender] = {ref, poses:{S,SE,NE,attack}, files:{...}}

    poses[view] = [x, y, w, h]   the art's own opaque bounds (alpha > 8), a crop of the
                                 source PNG: no pixel is ever added, moved or recoloured
    files[view]                  the source PNG, relative to CLASS_SKINS.dir
    ref                          the S walk pose's pixel height; the game scales every
                                 pose of a class/gender by one constant, so the drawn
                                 character keeps the same size in every direction

Only the four supplied views are described: walk S, walk SE, walk NE and attack SE.
The game mirrors them horizontally for SW / NW / attack SW, exactly like the canonical
viewer in Updates/Sprite/index.html.  Nothing here invents a frame or a direction.

The class list, the file names and the seven folders are validated with the same rules
as tools/make_sprite_viewer.py, so the reference viewer and the live game can never
disagree about which file belongs to which class.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sprite_viewer as viewer                                     # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "class_skins_data.js"
ALPHA = 8

# Game class -> (tree folder, job id in the viewer manifest).  The order is the game's own
# class order (const CD in index.html) so the generated file reads exactly like the game; the
# suite checks that the two lists stay in step.
GAME_CLASSES = [
    ("Novice", "Novice", "novice"),
    ("Swordman", "Swordman", "swordman"),
    ("Mage", "Mage", "mage"),
    ("Archer", "Archer", "archer"),
    ("Thief", "Thief", "thief"),
    ("Acolyte", "Acolyte", "aco"),
    ("Merchant", "Merchant", "merchant"),
    ("Knight", "Swordman", "knight"),
    ("Wizard", "Mage", "wizard"),
    ("Hunter", "Archer", "hunter"),
    ("Assassin", "Thief", "assassin"),
    ("Priest", "Acolyte", "priest"),
    ("Blacksmith", "Merchant", "blacksmith"),
    ("Lord Knight", "Swordman", "lordknight"),
    ("High Wizard", "Mage", "highwizard"),
    ("Sniper", "Archer", "sniper"),
    ("Assassin Cross", "Thief", "assassincross"),
    ("High Priest", "Acolyte", "highpriest"),
    ("Whitesmith", "Merchant", "whitesmith"),
]

# The four supplied views the game asks for, and the source pose each one reads.
VIEWS = [("S", "walk", "S"), ("SE", "walk", "SE"), ("NE", "walk", "NE"), ("attack", "attack", "SE")]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def alpha_bbox(data: bytes, threshold: int = ALPHA):
    """Opaque bounds of an 8-bit RGBA, non-interlaced PNG, using the standard library only.

    Only the alpha channel is reconstructed: every PNG filter refers to the current byte,
    the byte 4 back (the previous pixel of the same channel) and the row above, so the
    alpha plane can be defiltered on its own without touching the colour bytes.
    """
    pos, idat, width, height = 8, [], 0, 0
    while pos < len(data):
        length = struct.unpack_from(">I", data, pos)[0]
        kind, chunk = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if depth != 8 or colour != 6 or interlace:
                raise ValueError("expected an 8-bit RGBA, non-interlaced PNG")
        elif kind == b"IDAT":
            idat.append(chunk)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat))

    stride, prev = width * 4, bytes(width)
    x0, y0, x1, y1, offset = width, height, -1, -1, 0
    for y in range(height):
        method = raw[offset]
        offset += 1
        row = raw[offset:offset + stride]
        offset += stride
        alpha = bytearray(row[3::4])
        if method == 1:
            for i in range(1, width):
                alpha[i] = (alpha[i] + alpha[i - 1]) & 255
        elif method == 2:
            for i in range(width):
                alpha[i] = (alpha[i] + prev[i]) & 255
        elif method == 3:
            for i in range(width):
                left = alpha[i - 1] if i else 0
                alpha[i] = (alpha[i] + ((left + prev[i]) >> 1)) & 255
        elif method == 4:
            for i in range(width):
                left = alpha[i - 1] if i else 0
                up = prev[i]
                up_left = prev[i - 1] if i else 0
                guess = left + up - up_left
                pa, pb, pc = abs(guess - left), abs(guess - up), abs(guess - up_left)
                near = left if (pa <= pb and pa <= pc) else (up if pb <= pc else up_left)
                alpha[i] = (alpha[i] + near) & 255
        elif method != 0:
            raise ValueError(f"unknown PNG filter {method} on row {y}")
        first = last = None
        for i, value in enumerate(alpha):
            if value > threshold:
                if first is None:
                    first = i
                last = i
        if first is not None:
            if first < x0:
                x0 = first
            if last > x1:
                x1 = last
            if y0 == height:
                y0 = y
            y1 = y
        prev = bytes(alpha)
    if x1 < 0:
        raise ValueError("the PNG has no pixel above the alpha threshold")
    return [x0, y0, x1 + 1 - x0, y1 + 1 - y0]


def build():
    """-> the manifest dict, or raises ValueError with the first problem it finds."""
    rows = viewer.collect_files()                      # folders, file names and 200x200 all checked there
    by_pose = {f"{row['tree']}|{row['job']}|{row['gender']}|{row['action']}|{row['direction']}": row
               for row in rows}

    classes = {}
    for name, tree, job in GAME_CLASSES:
        entry = {"tree": tree, "job": job}
        for gender in ("m", "f"):
            word = "male" if gender == "m" else "female"
            poses, files = {}, {}
            for view, action, direction in VIEWS:
                row = by_pose.get(f"{tree}|{job}|{word}|{action}|{direction}")
                if not row:
                    raise ValueError(f"{name} has no {word} {action} {direction} source art "
                                     f"({tree}/{job} {word} {action} {direction}.png)")
                data = (viewer.SPRITE_DIR / row["path"]).read_bytes()
                if data[:8] != PNG_SIGNATURE:
                    raise ValueError(f"not a PNG: {row['path']}")
                poses[view] = alpha_bbox(data)
                files[view] = row["path"]
            entry[gender] = {"ref": poses["S"][3], "poses": poses, "files": files}
        classes[name] = entry

    return {"dir": viewer.SPRITE_DIR.relative_to(ROOT).as_posix(),
            "views": [view for view, _, _ in VIEWS],
            "classes": classes}


def render(manifest) -> str:
    body = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    return ("// Class skins for Prontera Grind - generated by tools/make_class_skins.py\n"
            "// Source: Updates/Sprite/<tree>/<job> <gender> <pose>.png - one 200x200 still per supplied view.\n"
            "// poses[view] = [x,y,w,h] = the art's own opaque bounds, drawn as a crop; files[view] = that\n"
            "// source PNG under dir. ref = the S pose's pixel height, so one constant scale is used for the\n"
            "// whole class/gender. The game mirrors these four\n"
            "// views for SW / NW / attack SW and never invents a frame, a direction or a pixel.\n"
            f"window.CLASS_SKINS={body};\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the manifest needs refreshing")
    args = parser.parse_args()

    try:
        expected = render(build())
    except (OSError, ValueError) as error:
        print(f"make_class_skins: {error}", file=sys.stderr)
        return 1

    current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    if current == expected:
        print("Class skins are current.")
        return 0
    if args.check:
        print("Class skin manifest is stale. Run: python3 tools/make_class_skins.py", file=sys.stderr)
        return 1
    OUT.write_text(expected, encoding="utf-8")
    classes = len(GAME_CLASSES)
    print(f"Wrote {OUT.relative_to(ROOT)}: {classes} classes x 2 genders x {len(VIEWS)} views "
          f"from {classes * 8} source PNGs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
