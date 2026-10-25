#!/usr/bin/env python3
"""Audit the field colours: raw native tiles vs the graded floor the game ships.

    node tools/maps/terrain-v2/render_floor_real.js     # produces docs/proposals/terrain-v2/floor-<map>.png
    python3 tools/maps/terrain-v2/render_color_audit.py

Writes docs/proposals/terrain-v2/board-color.png (raw vs graded swatches with HSV) and
docs/proposals/terrain-v2/color-audit.json (the numbers quoted in the proposal).
This is the evidence for "why every map looked the same": the comparison of the ten
base tiles that the v195 pass selected.
"""
import colorsys
import json
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ASSETS = os.path.join(ROOT, 'assets/native-fields/v1')
FLOORS = os.path.join(ROOT, 'docs/proposals/terrain-v2')
LABEL = ['Prontera', 'Izlude', 'Geffen', 'Morocc', 'Payon', 'Comodo', 'Louyang', 'Amatsu', 'Niflheim', 'Abyss']
NAMES = ['prontera', 'izlude', 'geffen', 'morocc', 'payon', 'comodo', 'louyang', 'amatsu', 'gl_chyard', 'hu_fild05']


def mean_rgb(img, box=None):
    a = np.asarray(img.convert('RGB'), dtype=np.float64) / 255.0
    if box:
        x, y, w, h = box
        a = a[y:y + h, x:x + w]
    return a.reshape(-1, 3).mean(axis=0)


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(*c)
    return round(h * 360), round(s, 2), round(v, 2)


def dist(a, b):
    return round(float(np.linalg.norm((np.asarray(a) - np.asarray(b)) * 255)), 1)


def pairwise(cols):
    d = [dist(cols[i], cols[j]) for i in range(len(cols)) for j in range(i + 1, len(cols))]
    close = [(LABEL[i], LABEL[j], dist(cols[i], cols[j]))
             for i in range(len(cols)) for j in range(i + 1, len(cols))
             if dist(cols[i], cols[j]) < 25]
    return {'min': min(d), 'median': round(float(np.median(d)), 1), 'max': max(d), 'closePairs': close}


def main():
    raw, graded = [], []
    for n in NAMES:
        raw.append(mean_rgb(Image.open(os.path.join(ASSETS, n, 'terrain.png')), (16, 16, 224, 224)))
        f = os.path.join(FLOORS, 'floor-%s.png' % n)
        graded.append(mean_rgb(Image.open(f), (200, 200, 1600, 1600)) if os.path.exists(f) else raw[-1])

    report = {
        'raw': [{'map': LABEL[i], 'rgb': [round(c * 255) for c in raw[i]], 'hsv': hsv(raw[i])} for i in range(10)],
        'graded': [{'map': LABEL[i], 'rgb': [round(c * 255) for c in graded[i]], 'hsv': hsv(graded[i])} for i in range(10)],
        'rawSpread': pairwise(raw), 'gradedSpread': pairwise(graded),
    }
    json.dump(report, open(os.path.join(FLOORS, 'color-audit.json'), 'w'), indent=1)

    CW, CH, PAD, HDR = 300, 170, 8, 26
    block = CH * 2 + PAD
    im = Image.new('RGB', (CW * 5, HDR * 2 + block * 2 + 12), (16, 17, 19))
    dr = ImageDraw.Draw(im)
    dr.text((8, 8), 'RAW native base tiles - what the v195 pass painted with: two fields identical, two more near-identical, 8/10 in one hue band',
            fill=(235, 235, 235))
    dr.text((8, HDR + block + 6), 'GRADED floor shipped now - own art, per-field hue + lighting correction (min pair distance 25.8 vs 0.0)',
            fill=(235, 235, 235))
    for block_i, layer in enumerate(('raw', 'graded')):
        top = HDR + block_i * (block + 12)
        for i, n in enumerate(NAMES):
            x = (i % 5) * CW + PAD // 2
            y = top + (i // 5) * CH
            if layer == 'raw':
                sw = Image.open(os.path.join(ASSETS, n, 'terrain.png')).convert('RGB').crop((16, 16, 240, 240))
                sw = sw.resize((CW - PAD, CH - 34), Image.LANCZOS)
            else:
                f = os.path.join(FLOORS, 'floor-%s.png' % n)
                sw = Image.open(f).convert('RGB').resize((CW - PAD, CH - 34), Image.LANCZOS) if os.path.exists(f) else None
            if sw is None:
                continue
            im.paste(sw, (x, y))
            c = raw[i] if layer == 'raw' else graded[i]
            dr.text((x + 2, y + CH - 30), '%s  rgb(%d,%d,%d)  %d deg  s%.2f  v%.2f' %
                    (LABEL[i], round(c[0] * 255), round(c[1] * 255), round(c[2] * 255), *hsv(c)), fill=(250, 250, 250))
    out = os.path.join(FLOORS, 'board-color.png')
    im.save(out)
    print('wrote', out)
    print('raw   distance: min %(min)s median %(median)s  >25 apart: %(closePairs)s' % report['rawSpread'])
    print('graded distance: min %(min)s median %(median)s  >25 apart: %(closePairs)s' % report['gradedSpread'])


if __name__ == '__main__':
    main()
