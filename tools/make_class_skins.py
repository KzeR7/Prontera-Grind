#!/usr/bin/env python3
"""Build the live class-skin manifest from the canonical Updates/Sprite APNGs.

Run from the repository root:

    python3 tools/make_class_skins.py
    python3 tools/make_class_skins.py --check

The owner's class art (Updates/Sprite/<tree>/<job> <gender> <pose>.png) is one complete
200x200 **animated PNG** per supplied view - every file carries an `acTL` chunk, several
frames, and `num_plays = 0` (loop forever).  This tool never edits an image: it measures
what the game needs to draw them and writes assets/class_skins_data.js:

    window.CLASS_SKINS.classes[class][gender] = {
      files:  {S, SE, NE, [N,] attack}   source PNG, relative to CLASS_SKINS.dir
      frames: {view: number of APNG frames in that file}
      delays: {view: [[delay_num, delay_den], ...]}   per-frame timing, as authored
      poses:  {view: [x, y, w, h]}       the union of every frame's opaque bounds
      height: drawn height in source pixels of the rest (S walk) pose
      anchor: [x, y]                     the billboard anchor: figure centre x, ground line y
    }

The game draws the whole 200x200 file on the billboard (no cropping, so the animation can
never jump), mirrors it horizontally for the left-facing routes, and lets the browser play
each APNG's own frames at its own delays.  Only the supplied views are described; the game
mirrors NE->NW and SE->SW and never invents a frame, a direction or a pixel.

The class list, the file names and the seven folders are validated with the same rules as
tools/make_sprite_viewer.py, so the reference viewer and the live game can never disagree
about which file belongs to which class.
"""
from __future__ import annotations

import argparse
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
ANCHOR_X = 100          # every supplied file is drawn centred in its 200x200 canvas

# Game class -> (tree folder, job id in the viewer manifest).  The order is the game's own
# class order (const CD in index.html); the suite checks the two lists stay in step.
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

# The four views every class/gender supplies, and the optional extra N view (High Priest only).
VIEWS = [("S", "walk", "S"), ("SE", "walk", "SE"), ("NE", "walk", "NE"), ("attack", "attack", "SE")]
OPTIONAL_VIEWS = [("N", "walk", "N")]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class ApngError(ValueError):
    pass


def _chunks(data: bytes):
    pos = 8
    while pos < len(data):
        length = struct.unpack_from(">I", data, pos)[0]
        kind = data[pos + 4:pos + 8]
        yield kind, data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IEND":
            break


def apng_meta(data: bytes):
    """-> (width, height, frame_count, num_plays, delays) for a 200x200 looping APNG.

    Only what the game needs is validated: the `acTL` chunk (this really is an animation),
    more than one frame, a 200x200 RGBA canvas, and `num_plays = 0` so the browser loops it.
    """
    width = height = frames = plays = None
    delays, seen_fctl = [], 0
    for kind, chunk in _chunks(data):
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if depth != 8 or colour != 6 or interlace:
                raise ApngError("expected an 8-bit RGBA, non-interlaced PNG")
        elif kind == b"acTL":
            frames, plays = struct.unpack(">II", chunk[:8])
        elif kind == b"fcTL":
            seen_fctl += 1
            num, den = struct.unpack(">HH", chunk[20:24])
            delays.append([num, den])
    if frames is None:
        raise ApngError("not an animated PNG: no acTL chunk")
    if frames < 2:
        raise ApngError(f"an animation must carry several frames, found {frames}")
    if seen_fctl != frames:
        raise ApngError(f"acTL says {frames} frames but the file has {seen_fctl} fcTL chunks")
    if plays != 0:
        raise ApngError(f"expected an endless animation (num_plays = 0), found {plays}")
    return width, height, frames, plays, delays


def frame_boxes(data: bytes):
    """-> [[x, y, w, h], ...] opaque bounds per frame, and the union of them.

    Standard library only: only the alpha channel is reconstructed (every PNG filter refers
    to the current byte, the previous pixel of the same channel and the row above, so the
    alpha plane can be defiltered on its own without touching the colour bytes).
    """
    width = height = None
    idat, boxes = [], []
    for kind, chunk in _chunks(data):
        if kind == b"IHDR":
            width, height = struct.unpack_from(">II", chunk)
        elif kind == b"IDAT":
            idat.append(chunk)
        elif kind == b"fcTL":
            if width is not None and idat:
                boxes.append(_alpha_bbox(zlib.decompress(b"".join(idat)), width, height))
                idat = []
    if idat:
        boxes.append(_alpha_bbox(zlib.decompress(b"".join(idat)), width, height))
    boxes = [b for b in boxes if b]
    if not boxes:
        raise ApngError("no frame carries a pixel above the alpha threshold")
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return boxes, [x0, y0, x1 - x0, y1 - y0]


def _alpha_bbox(raw: bytes, width: int, height: int):
    stride = width * 4
    prev = bytes(width)
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
            raise ApngError(f"unknown PNG filter {method} on row {y}")
        first = last = None
        for i, value in enumerate(alpha):
            if value > ALPHA:
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
        return None
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
            files, frames, delays, poses = {}, {}, {}, {}
            s_height = s_ground = None
            for view, action, direction in VIEWS + OPTIONAL_VIEWS:
                row = by_pose.get(f"{tree}|{job}|{word}|{action}|{direction}")
                if not row:
                    if (view, action, direction) in OPTIONAL_VIEWS:
                        continue                    # the extra High Priest N files are a bonus view
                    raise ValueError(f"{name} has no {word} {action} {direction} source art "
                                     f"({tree}/{job} {word} {action} {direction}.png)")
                data = (viewer.SPRITE_DIR / row["path"]).read_bytes()
                if data[:8] != PNG_SIGNATURE:
                    raise ValueError(f"not a PNG: {row['path']}")
                width, height, count, _, wait = apng_meta(data)
                if (width, height) != (200, 200):
                    raise ValueError(f"expected a 200x200 canvas, got {width}x{height}: {row['path']}")
                boxes, union = frame_boxes(data)
                files[view] = row["path"]
                frames[view] = count
                delays[view] = wait
                poses[view] = union
                if view == "S":
                    heights = sorted(b[3] for b in boxes)
                    s_height = heights[len(heights) // 2]         # the rest pose's typical drawn height
                    s_ground = max(b[1] + b[3] for b in boxes)    # its lowest drawn row = the ground line
            entry[gender] = {"files": files, "frames": frames, "delays": delays, "poses": poses,
                             "height": s_height, "anchor": [ANCHOR_X, s_ground]}
        classes[name] = entry

    return {"dir": viewer.SPRITE_DIR.relative_to(ROOT).as_posix(),
            "views": [view for view, _, _ in VIEWS],
            "optionalViews": [view for view, _, _ in OPTIONAL_VIEWS],
            "classes": classes}


def render(manifest) -> str:
    body = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    return ("// Class skins for Prontera Grind - generated by tools/make_class_skins.py\n"
            "// Source: Updates/Sprite/<tree>/<job> <gender> <pose>.png - one complete 200x200 ANIMATED PNG\n"
            "// (acTL, several frames, num_plays = 0) per supplied view. files[view] is that source; frames and\n"
            "// delays are its own APNG metadata; poses[view] is the union of its frames' opaque bounds;\n"
            "// anchor = [figure centre x, ground line y] in the 200x200 canvas, and height = the rest pose's\n"
            "// drawn height in pixels. The game draws the whole file, lets the browser play it, mirrors it for\n"
            "// the left-facing routes and never invents a frame, a direction or a pixel.\n"
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
    print(f"Wrote {OUT.relative_to(ROOT)}: {classes} classes x 2 genders x {len(VIEWS)} APNG views "
          f"from {classes * 8} source files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
