#!/usr/bin/env python3
"""Paint exactly what the game draws, for review without a browser.

This is a dev tool: it reads the same manifest the game reads
(assets/class_skins_data.js, built by tools/make_class_skins.py) and repeats index.html's
drawing maths offline - the whole 200x200 animation frame, the mirror, one constant scale per
class/gender, and the art's own ground line.  Nothing here is game art; every pixel comes from
Updates/Sprite/.

    python3 tools/preview_class_skins.py                       # every class into /tmp/class_skins_qc
    python3 tools/preview_class_skins.py --out /tmp/qc --char 80
    python3 tools/preview_class_skins.py --class Knight        # one class only

Two sheets are written per class:

  <class>_directions.png  rows = male / female, columns = the eight facings plus both attack
                          facings.  Each column samples its own view's animation (the caption
                          says which frame), so the sheet proves the routing and the mirroring.
  <class>_walk_cycle.png  every frame of the S walk animation, one row per gender - the proof
                          that the source files really animate and how many frames they carry.

Both sheets draw the complete 200x200 frame, scaled by the game's constant
(SKIN_H / the art's own drawn height) and anchored at the art's ground line, so the character
stands the same height in every cell and its feet stay on the line as frames advance.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets" / "class_skins_data.js"

# The game's SKIN_VIEW / SKIN_ATTACK_MIRROR tables (index.html), in viewDir order 0..7
SKIN_VIEW = {0: ("S", 0), 1: ("SE", 1), 2: ("SE", 1), 3: ("NE", 1), 4: ("NE", 0), 5: ("NE", 0), 6: ("SE", 0), 7: ("SE", 0)}
SKIN_ATTACK_MIRROR = [0, 1, 1, 1, 0, 0, 0, 0]
FACING_NAME = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]
BACKDROP = (236, 233, 226, 255)
GROUND = (206, 198, 182, 255)
INK = (34, 30, 26, 255)
FAINT = (120, 112, 102, 255)


def game_scale():
    """The game's SKIN_H = 72 * PACK_K, read from index.html so the tool cannot drift."""
    text = (ROOT / "index.html").read_text(encoding="utf-8")
    match = re.search(r"PACK_K=([0-9.]+)", text)
    if not match:
        raise SystemExit("could not find PACK_K in index.html")
    return 72 * float(match.group(1))


def load_manifest():
    text = MANIFEST.read_text(encoding="utf-8")
    match = re.search(r"window\.CLASS_SKINS=(\{.*\});", text, re.S)
    if not match:
        raise SystemExit("assets/class_skins_data.js is missing - run tools/make_class_skins.py")
    return json.loads(match.group(1))


def source_frame(path: Path, index: int):
    """The requested APNG frame, as RGBA.  PIL reads one frame at a time; seek() picks it."""
    im = Image.open(path)
    frames = getattr(im, "n_frames", 1)
    if frames > 1:
        im.seek(index % frames)
    return im.convert("RGBA"), frames


def drawn(manifest, cls, sex, view, mirror, frame_index, char_px):
    """One drawn cell: the whole frame, mirrored maybe, scaled like the game scales it.

    -> (art, pixels_per_source_pixel, frames_in_this_view)
    The game draws the 200x200 square at 200 * (SKIN_H / height) world units and anchors it at
    the art's ground line, so a fixed character height on the sheet is the same maths.
    """
    entry = manifest["classes"][cls][sex]
    src = ROOT / manifest["dir"] / entry["files"][view]
    art, frames = source_frame(src, frame_index)
    if mirror:
        art = art.transpose(Image.FLIP_LEFT_RIGHT)
    px = char_px / entry["height"]
    size = max(1, round(art.width * px)), max(1, round(art.height * px))
    return art.resize(size, Image.NEAREST), px, frames


def sheet(manifest, cls, chars, cell_w, cell_h, label_h):
    """Directions sheet, one row per gender and one column per facing / attack."""
    entry = manifest["classes"][cls]
    ground_drop = cell_h - 6
    width = 34 + len(chars) * (cell_w + 6) + 6
    height = label_h + 2 * (cell_h + label_h + 4) + 6
    img = Image.new("RGBA", (width, height), BACKDROP)
    draw = ImageDraw.Draw(img)
    draw.text((6, 4), f"{cls} - the game's own art, drawn the way index.html draws it "
                      f"(row 1 male, row 2 female); each cell samples its view's animation", fill=INK)
    for row, (sex, label) in enumerate((("m", "male"), ("f", "female"))):
        top = label_h + row * (cell_h + label_h + 4)
        draw.text((4, top + cell_h // 2), label, fill=INK)
        for index, col in enumerate(chars):
            left = 34 + index * (cell_w + 6)
            draw.rectangle([left, top, left + cell_w, top + cell_h], fill=GROUND)
            draw.line([left, top + ground_drop, left + cell_w, top + ground_drop], fill=FAINT)
            if col == "a0":
                view, mirror, tag = "attack", False, "attack SE"
            elif col == "a1":
                view, mirror, tag = "attack", True, "attack SW"
            else:
                view, mirror = SKIN_VIEW[col]
                tag = f"{FACING_NAME[col]} -> {view}{' (mirror)' if mirror else ''}"
            frames = entry[sex]["frames"][view]
            frame_index = (index * frames) // len(chars)
            art, px, frames = drawn(manifest, cls, sex, view, mirror, frame_index, cell_h - 18)
            ax, ay = entry[sex]["anchor"]
            img.alpha_composite(art, (left + (cell_w - art.width) // 2 - round((ax - 100) * px),
                                      top + ground_drop - round(ay * px)))
            draw.text((left + 2, top + cell_h + 2), f"{tag} f{frame_index + 1}/{frames}", fill=INK)
    return img


def walk_cycle(manifest, cls, cell_w, cell_h, label_h):
    """Every frame of the class's S walk, both genders - the animation itself, in order."""
    entry = manifest["classes"][cls]
    frames = max(entry["m"]["frames"]["S"], entry["f"]["frames"]["S"])
    width = 34 + frames * (cell_w + 4) + 6
    height = label_h + 2 * (cell_h + label_h + 4) + 6
    img = Image.new("RGBA", (width, height), BACKDROP)
    draw = ImageDraw.Draw(img)
    draw.text((6, 4), f"{cls} - the S walk animation, every frame in order (row 1 male, row 2 female)", fill=INK)
    for row, (sex, label) in enumerate((("m", "male"), ("f", "female"))):
        top = label_h + row * (cell_h + label_h + 4)
        draw.text((4, top + cell_h // 2), label, fill=INK)
        count = entry[sex]["frames"]["S"]
        ax, ay = entry[sex]["anchor"]
        for index in range(count):
            left = 34 + index * (cell_w + 4)
            draw.rectangle([left, top, left + cell_w, top + cell_h], fill=GROUND)
            art, px, _ = drawn(manifest, cls, sex, "S", False, index, cell_h - 18)
            img.alpha_composite(art, (left + (cell_w - art.width) // 2 - round((ax - 100) * px),
                                      top + cell_h - 6 - round(ay * px)))
            draw.text((left + 2, top + cell_h + 2), f"frame {index + 1}/{count}", fill=INK)
    return img


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="/tmp/class_skins_qc", help="directory for the QC images")
    parser.add_argument("--class", dest="only", help="one class name (default: every class)")
    parser.add_argument("--char", type=float, default=64, help="character height on the sheet, in pixels")
    parser.add_argument("--cell", type=int, default=150, help="directions cell width in the sheet")
    parser.add_argument("--row", type=int, default=140, help="cell height in the sheet")
    parser.add_argument("--no-combined", action="store_true", help="skip the single combined sheet")
    args = parser.parse_args()

    manifest = load_manifest()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    names = [args.only] if args.only else list(manifest["classes"])
    chars = list(range(8)) + ["a0", "a1"]
    strip = []
    for name in names:
        if name not in manifest["classes"]:
            raise SystemExit(f"unknown class {name!r}; try one of: {', '.join(manifest['classes'])}")
        slug = name.replace(" ", "_").lower()
        directions = sheet(manifest, name, chars, args.cell, args.row, 16)
        directions.save(out / f"{slug}_directions.png")
        cycle = walk_cycle(manifest, name, args.cell, args.row + 22, 16)
        cycle.save(out / f"{slug}_walk_cycle.png")
        strip.append(directions)
        print(f"wrote {out / (slug + '_directions.png')} and {slug}_walk_cycle.png")
    if len(strip) > 1 and not args.no_combined:
        total = sum(i.height + 4 for i in strip)
        combined = Image.new("RGBA", (max(i.width for i in strip), total), BACKDROP)
        y = 0
        for i in strip:
            combined.alpha_composite(i, (0, y))
            y += i.height + 4
        combined.save(out / "all_classes_directions.png")
        print(f"wrote {out / 'all_classes_directions.png'} ({combined.width}x{combined.height})")
    print(f"{len(names)} class(es): every frame is the APNG's own pixels; mirrors are horizontal "
          f"flips; the scale is the game's own ({game_scale():.2f} world units per character, "
          f"one constant per class/gender).")


if __name__ == "__main__":
    main()
