#!/usr/bin/env python3
"""Measures each emote's painted area so the emoji tray can show them at one visual size.

Each emote PNG is an animation whose canvas is larger than the art (e.g. gg 50x24, love 112x91).
For every id this prints the union of the painted pixels across all frames, and the scale that fits
that area into a 34 px tray slot. Presentation only: the art files are not touched.
Usage: python3 tools/social/emote-layout.py   (needs Pillow)
"""
import glob, os, json
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'social', 'emotions')
SLOT = 34.0
layout = {}
for f in sorted(glob.glob(os.path.join(OUT, '*.png'))):
    name = os.path.basename(f)[:-4]
    im = Image.open(f)
    x0 = y0 = 10**9; x1 = y1 = -1
    for k in range(im.n_frames):
        im.seek(k)
        bb = im.convert('RGBA').getchannel('A').point(lambda a: 255 if a > 80 else 0).getbbox()
        if bb:
            x0 = min(x0, bb[0]); y0 = min(y0, bb[1]); x1 = max(x1, bb[2]); y1 = max(y1, bb[3])
    w, h = im.size
    cw, ch = x1 - x0, y1 - y0
    s = SLOT / max(cw, ch)
    layout[name] = {'w': w, 'h': h, 'cx': round((x0 + x1) / 2, 1), 'cy': round((y0 + y1) / 2, 1), 's': round(s, 3)}
print('const EMOTE_LAYOUT=' + json.dumps(layout, separators=(',', ':')) + ';')
