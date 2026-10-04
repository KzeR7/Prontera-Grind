#!/usr/bin/env python3
"""Measure the hand joint of every attack frame, from the body art itself.

The game places the weapon with a sine-wave arm model (poseOf/weaponHandPoint), so as the
attack frame advances the weapon slides while the drawn hand does not - the owner reported
it as "the weapon changes position when the frame moves".

Ragnarok Online does not do that: a weapon sheet is aligned to the body's base anchor with
per-frame offsets authored frame by frame ("Weapons = Body as base", Act Editor "align all
the anchor points with the base body"). This tool does the same thing automatically:

    for every attack cell of every class body in the built pack,
    find the bare-skin hand (the neck-coloured blob furthest from the hips, below the
    shoulders), fall back to the silhouette's extremity when the hand is gloved or hidden,
    then enforce temporal smoothness across the six frames.

Output: assets/weapon_joints_data.js - window.WEAPON_JOINTS[body][dir][frame] = [x, y],
a pixel in the 96x96 body cell, exactly where the weapon pivot belongs.

usage:  python3 tools/make_weapon_joints.py [--qc /tmp/joints_qc.png]
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sprite_pack as m                                   # noqa: E402

REPO = m.REPO
OUT = os.path.join(REPO, 'assets', 'weapon_joints_data.js')
FRAMES = 6
MAX_STEP = 26          # a hand cannot move further than this between two attack frames


def attack_cells(pack):
    """-> {body: {dir: [cell 96x96, ...6]}} for the attack animation of every body."""
    out = {}
    for name, body in pack['bodies'].items():
        atlas = Image.open(io.BytesIO(base64.b64decode(body['atlas'].split(',')[1]))).convert('RGBA')
        dirs = {}
        for d in range(8):
            row = (2 * 8 + d)
            dirs[d] = [atlas.crop((f * 96, row * 96, (f + 1) * 96, (row + 1) * 96))
                       for f in range(FRAMES)]
        out[name] = dirs
    return out


def neck_colour(cell):
    """The skin tone of the body's own neck stub, or None when the top is not skin."""
    st = m.head_stub(cell)
    a = np.array(cell.convert('RGBA')).astype(int)
    if not st:
        return None
    top = st[0]
    ys, xs = np.where(a[max(0, top - 1):top + 4, :, 3] > 8)
    if not len(ys):
        return None
    cols = a[max(0, top - 1):top + 4, :, :3][ys, xs]
    med = np.median(cols, axis=0)
    r, g, b = med
    if r < 80 or r <= g or g < b - 20:          # not a skin-ish tone (white hair, metal)
        return None
    return med


def blobs(mask, min_px=8):
    from scipy import ndimage
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        yy, xx = np.where(lab == i)
        if len(yy) < min_px:
            continue
        out.append({'n': len(yy), 'cx': float(xx.mean()), 'cy': float(yy.mean()),
                    'x0': int(xx.min()), 'x1': int(xx.max()), 'y0': int(yy.min()), 'y1': int(yy.max())})
    return out


def hand_for(cell, prev=None):
    """(x, y, source) - the grip pixel for one attack cell."""
    a = np.array(cell.convert('RGBA')).astype(int)
    al = a[:, :, 3] > 8
    ys = np.where(al.max(axis=1))[0]
    if not len(ys):
        return None
    top, bot = int(ys[0]), int(ys[-1])
    tf = m.torso_frame(cell)
    hip = (tf[0], tf[1]) if tf else (48.0, bottom_centre(al) or 64.0)
    stub = m.head_stub(cell)
    shoulder = (stub[0] + 6) if stub else top + int((bot - top) * 0.22)

    # --- the bare-skin hand: skin-coloured, below the shoulders, far from the hips
    ref = neck_colour(cell)
    skin = None
    if ref is not None:
        d = np.abs(a[:, :, :3] - ref).sum(axis=2)
        skin = (d < 95) & al
    else:
        r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
        skin = (r > 120) & (r > g + 12) & (g >= b - 12) & (r - b > 24) & al
    skin[:shoulder, :] = False                       # never the face or the neck itself
    cands = [bl for bl in blobs(skin) if bl['n'] >= 8]
    if cands:
        best = max(cands, key=lambda bl: (bl['cx'] - hip[0]) ** 2 + (bl['cy'] - hip[1]) ** 2)
        return best['cx'], best['cy'], 'hand'

    # --- gloved or hidden hand: the silhouette's own extremity (fist, blade fist, elbow)
    lower = al.copy()
    lower[:shoulder, :] = False
    yy, xx = np.where(lower)
    if not len(xx):
        return None
    dist = (xx - hip[0]) ** 2 + (yy - hip[1]) ** 2
    k = int(np.argmax(dist))
    return float(xx[k]), float(yy[k]), 'extremity'


def bottom_centre(al):
    ys = np.where(al.max(axis=1))[0]
    if not len(ys):
        return None
    row = al[ys[-1]]
    xs = np.where(row)[0]
    return float(xs.mean()) if len(xs) else None


def smooth(points):
    """Temporal guard: no hand jump bigger than MAX_STEP between frames, holes interpolated."""
    pts = [list(p) if p else None for p in points]
    known = [i for i, p in enumerate(pts) if p]
    if not known:
        return pts
    for i in range(len(pts)):                                  # fill the holes
        if pts[i] is None:
            lo = max([k for k in known if k < i], default=None)
            hi = min([k for k in known if k > i], default=None)
            if lo is None:
                pts[i] = list(pts[hi])
            elif hi is None:
                pts[i] = list(pts[lo])
            else:
                t = (i - lo) / (hi - lo)
                pts[i] = [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t,
                          pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t]
    for i in range(1, len(pts)):                               # clamp a jump to the previous frame
        dx, dy = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
        d = (dx * dx + dy * dy) ** 0.5
        if d > MAX_STEP:
            k = MAX_STEP / d
            pts[i] = [pts[i - 1][0] + dx * k, pts[i - 1][1] + dy * k]
    return pts


def main():
    pack = m.load_existing()
    cells = attack_cells(pack)
    joints, sources = {}, {}
    for body, dirs in cells.items():
        joints[body] = {}
        sources[body] = {}
        for d, frames in dirs.items():
            raw = [hand_for(c) for c in frames]
            smoothed = smooth([(p[0], p[1]) if p else None for p in raw])
            joints[body][d] = [[int(round(p[0])), int(round(p[1]))] for p in smoothed]
            sources[body][d] = [p[2] if p else 'none' for p in raw]
            n_hand = sum(1 for p in raw if p and p[2] == 'hand')
            print('  %-16s dir %d  hand %d/%d  %s' % (body, d, n_hand, FRAMES,
                                                      ' '.join('%s' % (s[0].upper() if s else '?') for s in sources[body][d])))
    src = {b: {str(d): ''.join((c or '?')[0].upper() for c in sources[b][d]) for d in sources[b]}
           for b in sources}
    txt = ('// Hand joints for every attack frame - generated by tools/make_weapon_joints.py\n'
           '// WEAPON_JOINTS[body][dir][frame] = [x,y] pixel in the 96x96 body cell: where the\n'
           '// weapon pivot sits so the weapon is held in the hand as the attack animates.\n'
           '// Measured from the art (bare-skin hand, else the silhouette extremity), then\n'
           '// clamped so no hand jump exceeds %d px between frames.\n' % MAX_STEP)
    txt += 'window.WEAPON_JOINTS=%s;\n' % json.dumps(joints, separators=(',', ':'))
    txt += ('// how each joint was found: H = bare hand, E = silhouette extremity (gloved hand)\n'
            'window.WEAPON_JOINTS_SRC=%s;\n' % json.dumps(src, separators=(',', ':')))
    with open(OUT, 'w') as f:
        f.write(txt)
    print('wrote %s (%.1f KB, %d bodies)' % (os.path.relpath(OUT, REPO),
                                             os.path.getsize(OUT) / 1024, len(joints)))
    if '--qc' in sys.argv:
        qc(cells, joints, sources, sys.argv[sys.argv.index('--qc') + 1])


def qc(cells, joints, sources, out_path):
    """Contact sheet: every attack frame with its measured joint - check it by eye."""
    tiles = []
    for body, dirs in cells.items():
        for d, frames in dirs.items():
            for f, cell in enumerate(frames):
                im = Image.new('RGBA', (100, 132), (255, 255, 255, 255))
                im.alpha_composite(cell, (2, 2))
                dr = ImageDraw.Draw(im)
                x, y = joints[body][d][f]
                dr.line([(x + 2 - 5, y + 2), (x + 2 + 5, y + 2)], fill=(255, 0, 0, 255))
                dr.line([(x + 2, y + 2 - 5), (x + 2, y + 2 + 5)], fill=(255, 0, 0, 255))
                dr.text((2, 118), '%s %d/%d %s' % (body[:9], d, f, (sources[body][d][f] or '?')[0].upper()),
                        fill=(150, 0, 0, 255))
                tiles.append(im)
    cols = 12
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 100, rows * 132), (245, 245, 245))
    for i, t in enumerate(tiles):
        sheet.paste(t.convert('RGB'), ((i % cols) * 100, (i // cols) * 132))
    sheet.save(out_path)
    print('wrote %s (%d frames)' % (out_path, len(tiles)))


if __name__ == '__main__':
    main()
