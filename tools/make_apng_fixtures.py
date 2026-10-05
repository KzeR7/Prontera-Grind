#!/usr/bin/env python3
"""Freeze a reference rendering of every uploaded animation, for the test suite to check against.

The game decodes the APNG frames itself in JavaScript (index.html: skinDecodePng).  This tool
renders the same frames with Pillow - an independent decoder - and writes a small JSON of the
SHA-256 of each composited frame's RGBA bytes plus the file's own per-frame delays:

    tools/tests/fixtures/apng_frame_sha.json

`node tools/tests/class_skin_sim.js` decodes all 154 files in JavaScript and compares every frame
against that fixture, so a change to the decoder, the files or the manifest is caught.  Regenerate
after replacing a PNG:

    /tmp/venv/bin/python3 tools/make_apng_fixtures.py        # needs Pillow
    node tools/tests/class_skin_sim.js

Pillow is only needed to *write* the fixture; the suite itself needs Node alone.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets" / "class_skins_data.js"
FIXTURE = ROOT / "tools" / "tests" / "fixtures" / "apng_frame_sha.json"


def load_manifest():
    text = MANIFEST.read_text(encoding="utf-8")
    match = re.search(r"window\.CLASS_SKINS=(\{.*\});", text, re.S)
    if not match:
        raise SystemExit("assets/class_skins_data.js is missing - run tools/make_class_skins.py")
    return json.loads(match.group(1))


def main():
    manifest = load_manifest()
    sprite_dir = ROOT / manifest["dir"]
    files = sorted({f for entry in manifest["classes"].values()
                    for sex in ("m", "f") for f in entry[sex]["files"].values()})
    out = {"note": "sha256 of every composited RGBA frame (Pillow), written by tools/make_apng_fixtures.py",
           "dir": manifest["dir"], "files": {}}
    frames_total = 0
    for rel in files:
        path = sprite_dir / rel
        image = Image.open(path)
        frames, delays = [], []
        for frame in ImageSequence.Iterator(image):
            rgba = frame.convert("RGBA")
            if rgba.size != (200, 200):
                raise SystemExit(f"{rel}: {rgba.size} is not 200x200")
            frames.append(hashlib.sha256(rgba.tobytes()).hexdigest())
            delays.append(int(round(frame.info.get("duration", 0))))     # milliseconds, as Pillow reads the fcTL
        out["files"][rel] = {"frames": frames, "delays": delays}
        frames_total += len(frames)
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(out, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}: {len(files)} files, {frames_total} frames")


if __name__ == "__main__":
    main()
