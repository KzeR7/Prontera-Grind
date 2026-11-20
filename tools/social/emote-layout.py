#!/usr/bin/env python3
"""Measures each emote's painted area so the emoji tray can show them at one visual size.

Each emote PNG is an animation whose canvas is larger than the art (e.g. gg 50x24, love 112x91).
For every id this prints the union of the painted pixels across all frames, and the scale that fits
that area into a 34 px tray slot. Presentation only: the art files are not touched.
Usage: python3 tools/social/emote-layout.py   (needs Pillow)

The dice is six files behind one id (dice.png is face 1, dice2..dice6 the rest). They are measured
together as one entry so the tray scales and centres whichever face a roll lands on; a per-face
entry would let the six drift out of alignment.
"""
import glob, os, json, re
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'social', 'emotions')
SLOT = 34.0
# dice2..dice6 belong to the `dice` id, not to ids of their own.
EXTRA_FACES = re.compile(r'^(dice)[2-9]$')
groups = {}
for f in sorted(glob.glob(os.path.join(OUT, '*.png'))):
    name = os.path.basename(f)[:-4]
    m = EXTRA_FACES.match(name)
    groups.setdefault(m.group(1) if m else name, []).append(f)
layout = {}
for name, files in sorted(groups.items()):
    x0 = y0 = 10**9; x1 = y1 = -1
    for f in files:
        im = Image.open(f)
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
