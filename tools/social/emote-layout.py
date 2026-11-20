#!/usr/bin/env python3
"""Measures each emote's painted area so the emoji tray can show them at one visual size.

Each emote PNG is an animation whose canvas is larger than the art (e.g. gg 50x24, love 112x91),
and some animations drift: the "Help" of hlp flies all the way across its canvas, and oh bobs.
Measuring the union of every frame therefore measures the TRAVEL, not the art - hlp's canvas came
out 69x49 for a 24x15 word, so scaling the canvas to the slot drew the word at 11 px and the user
reported it as "too small" (correctly).

So the size is measured on a REPRESENTATIVE frame: the one carrying the most painted pixels. That is
the frame the eye reads as "the emote", and it no longer shrinks when an animation travels.

Two things still use the union of all frames, because they must never clip: the centre the tray
pivots on, and the scale cap that keeps a travelling emote inside its slot.

Usage: python3 tools/social/emote-layout.py   (needs Pillow)

The dice is six files behind one id (dice.png is face 1, dice2..dice6 the rest). They are measured
together as one entry so the tray scales and centres whichever face a roll lands on; a per-face
entry would let the six drift out of alignment.
"""
import glob, os, json, re
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'social', 'emotions')
SLOT = 40.0          # the tray box emoteSlot(...,40) draws into
TARGET = 0.80        # a normal emote should fill 80% of that box -> 32 px of apparent art
CLEAR = SLOT * 0.92  # no emote may exceed this, or its neighbour cell clips it
FLOOR = 0.0          # no floor: the CLEAR cap must be able to shrink big art to fit the slot
# dice2..dice6 belong to the `dice` id, not to ids of their own.
EXTRA_FACES = re.compile(r'^(dice)[2-9]$')


def opaque(im):
    return im.convert('RGBA').getchannel('A').point(lambda a: 255 if a > 80 else 0)


groups = {}
for f in sorted(glob.glob(os.path.join(OUT, '*.png'))):
    name = os.path.basename(f)[:-4]
    m = EXTRA_FACES.match(name)
    groups.setdefault(m.group(1) if m else name, []).append(f)

layout = {}
for name, files in sorted(groups.items()):
    ux0 = uy0 = 10**9
    ux1 = uy1 = -1
    rx0 = ry0 = 10**9
    rx1 = ry1 = -1
    best_pixels = -1
    w = h = 0
    for f in files:
        im = Image.open(f)
        w, h = im.size
        for k in range(im.n_frames):
            im.seek(k)
            bb = opaque(im).getbbox()
            if not bb:
                continue
            ux0, uy0 = min(ux0, bb[0]), min(uy0, bb[1])
            ux1, uy1 = max(ux1, bb[2]), max(uy1, bb[3])
            # The representative frame: the fullest one, i.e. the pose the eye reads as the emote.
            crop = opaque(im).crop(bb)
            pixels = sum(1 for v in crop.get_flattened_data() if v > 80)
            if pixels > best_pixels:
                best_pixels = pixels
                rx0, ry0, rx1, ry1 = bb
    canvas_w, canvas_h = rx1 - rx0, ry1 - ry0        # what the emote LOOKS like
    travel_w, travel_h = ux1 - ux0, uy1 - uy0        # the ground it covers while animating
    s = max(TARGET * SLOT / max(canvas_w, canvas_h), FLOOR)
    # The whole PNG is what the <img> draws, and it is clipped by the slot box, so the cap is on the
    # CANVAS - not just the painted part. kissheart's canvas is 131x122 for 63x58 of art; capping the
    # art let the oversized canvas bleed past the cell and clip a neighbour.
    s = min(s, CLEAR / max(w, h))
    layout[name] = {'w': w, 'h': h,
                    'cx': round((ux0 + ux1) / 2, 1), 'cy': round((uy0 + uy1) / 2, 1),
                    's': round(s, 3)}
print('const EMOTE_LAYOUT=' + json.dumps(layout, separators=(',', ':')) + ';')
