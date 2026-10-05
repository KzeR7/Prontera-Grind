#!/usr/bin/env python3
"""Keep a verbatim backup of the live class-skin ANIMATION code, next to the method's notes.

The animation lives inside `index.html` (the whole game is one file), so this tool extracts that
block exactly as the browser runs it and writes it to:

    Updates/ApngAnimation/class_skin_animation.js

The block starts at the `// ----- Class skins (assets/class_skins_data.js ...` comment and ends
just before `function packTex(opt){`.  It is the part that decodes the APNG frames and paints the
due frame - everything a future update has to follow.

    python3 tools/backup_apng_code.py            # refresh the backup
    python3 tools/backup_apng_code.py --check     # fail if it is stale (the test suite runs this)

`tools/tests/class_skin_sim.js` runs `--check`, so the backup can never silently rot: if the live
code changes and the backup is not refreshed, that suite fails.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "index.html"
OUT = ROOT / "Updates" / "ApngAnimation" / "class_skin_animation.js"

START = "// ----- Class skins (assets/class_skins_data.js"
END = "function packTex(opt){"

BANNER = f"""// BACKUP of the live class-skin ANIMATION code, extracted verbatim from index.html.
//
// Read Updates/ApngAnimation/README.md first: it explains, for a future update, what the uploaded
// files are (multi-frame looping APNGs), how the game decodes and plays them, the traps that cost
// time, and the exact steps to follow when new art arrives.
//
// This file is a copy for reading and restoring - the game runs the block inside index.html.
// Regenerate / verify with:
//     python3 tools/backup_apng_code.py
//     python3 tools/backup_apng_code.py --check
// (class_skin_sim.js runs --check, so this copy cannot go stale unnoticed.)

"""


def extract() -> str:
    page = PAGE.read_text(encoding="utf-8")
    start = page.index(START)
    end = page.index(END, start)
    block = page[start:end]
    if "skinDecodePng" not in block or "captureSkinFrame" not in block:
        raise SystemExit("the class-skin block in index.html does not look like the animation code any more")
    return BANNER + block


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit 1 if the backup is stale")
    args = parser.parse_args()

    expected = extract()
    if args.check:
        if not OUT.exists():
            print(f"{OUT.relative_to(ROOT)} is missing - run python3 tools/backup_apng_code.py", file=sys.stderr)
            return 1
        actual = OUT.read_text(encoding="utf-8")
        if actual != expected:
            print(f"{OUT.relative_to(ROOT)} is stale - run python3 tools/backup_apng_code.py", file=sys.stderr)
            return 1
        print("Class-skin animation backup is current.")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(expected, encoding="utf-8")
    lines = expected.count("\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({lines} lines) from the live index.html block")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
