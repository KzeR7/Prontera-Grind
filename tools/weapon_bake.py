#!/usr/bin/env python3
"""Bake a weapon into the owner's chosen attack poses - prototype + proof.

Why this shape
--------------
The owner's selection picks, for every class and view, six poses that are NOT all from the
standard attack row: 197 of the 570 picks come from other rows of the sheet (rows 6/7, the
walk rows).  So the per-frame hand data in assets/weapon_joints_data.js cannot cover them -
the grip has to be measured from the picked cell itself.

The measurement in make_weapon_joints.py picks, per frame, "the skin blob furthest from the
hip".  That is right in most frames but hops between the two arms in others, which is the
jitter the owner saw in v28 (knight dir 0 ran 65,67,69,45,68,45 - a 24 px jump between
neighbouring frames).  Here the same blob is *tracked* through the six frames instead: seed
on the frame where the hand is most clearly away from the torso, then walk outwards always
taking the blob nearest the previous frame.  The result is one arm per view, no hopping.

Nothing here ships yet: it writes a contact sheet so the owner can judge the automatic
placement first.

usage:  /tmp/venv/bin/python tools/weapon_bake.py --proof /tmp/weapon_proof.png
        /tmp/venv/bin/python tools/weapon_bake.py --grips /tmp/grips.json
"""
import argparse
import io
import json
import math
import os
import sys

import numpy as np
from PIL import ImageFilter
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sprite_pack as m                                   # noqa: E402

REPO = m.REPO
BODY = 96
FEET = 90
MIRROR = {5: 3, 6: 2, 7: 1}
MAX_STEP = 30                       # a hand cannot move further than this between frames

CLASS_BODY = {'Acolyte': 'aco', 'Assassin': 'assassin', 'Assassin Cross': 'assassin_cross',
              'Blacksmith': 'blacksmith', 'High Priest': 'aco', 'High Wizard': 'high_wizard',
              'Hunter': 'hunter', 'Knight': 'knight', 'Lord Knight': 'lord_knight',
              'Mage': 'mage', 'Merchant': 'blacksmith', 'Novice': 'novice', 'Priest': 'aco',
              'Sniper': 'archer', 'Swordman': 'swordman', 'Thief': 'thief',
              'Whitesmith': 'whitesmith', 'Wizard': 'wizard'}
# the class' main-hand weapon, exactly the game's own table (CLASS_WEAPON + the job tree)
CLASS_WEP = {'Knight': 'sword', 'Lord Knight': 'sword', 'Swordman': 'sword', 'Novice': 'sword',
             'Archer': 'bow', 'Hunter': 'bow', 'Sniper': 'bow',
             'Mage': 'staff', 'Wizard': 'staff', 'High Wizard': 'staff',
             'Assassin': 'katar', 'Assassin Cross': 'katar',
             'Merchant': 'axe', 'Blacksmith': 'axe', 'Whitesmith': 'axe',
             'Acolyte': 'mace', 'Priest': 'mace', 'High Priest': 'mace', 'Thief': 'dagger'}
# bows and staves are carried upright; the rest point along the forearm
UPRIGHT = ('bow', 'staff')


def lj(path, prefix):
    txt = open(path).read()
    return json.loads(txt[txt.index(prefix) + len(prefix):].rstrip().rstrip(';'))


# ------------------------------------------------------------------ the cell painter
def cell_of(cls, view, frame, class_data, defaults):
    """The exact 96x96 cell the picker shows: same crop, same nearest-neighbour scale."""
    poses = class_data['poses']
    src = MIRROR.get(view, view) if view >= 5 else view
    ids = (defaults['attack'].get(cls) or {}).get(str(src))
    if not ids or frame >= len(ids) or ids[frame] is None:
        return None, None, None
    p = poses[ids[frame]]
    sheet = Image.open(os.path.join(REPO, class_data['file'])).convert('RGBA')
    s = min(1, 90 / p['w'], 88 / p['h'])
    w, h = max(1, round(p['w'] * s)), max(1, round(p['h'] * s))
    ox, oy = (BODY - w) // 2, FEET - h
    crop = sheet.crop((p['x'], p['y'], p['x'] + p['w'], p['y'] + p['h'])).resize((w, h), Image.NEAREST)
    if view in MIRROR:
        crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
    out = Image.new('RGBA', (BODY, BODY), (0, 0, 0, 0))
    out.paste(crop, (ox, oy), crop)
    return out, p, (ox, oy, w, h)


# ------------------------------------------------------------------ hand measurement
def skin_mask(cell):
    """Skin pixels via the body's own neck colour, or a colour rule when there is none."""
    a = np.array(cell.convert('RGBA')).astype(int)
    al = a[:, :, 3] > 8
    ref = None
    st = m.head_stub(cell)
    if st:
        top = st[0]
        ys, xs = np.where(a[max(0, top - 1):top + 4, :, 3] > 8)
        if len(ys):
            med = np.median(a[max(0, top - 1):top + 4, :, :3][ys, xs], axis=0)
            r, g, b = med
            if r >= 80 and r > g and g >= b - 20:
                ref = med
    if ref is not None:
        mask = (np.abs(a[:, :, :3] - ref).sum(axis=2) < 95) & al
    else:
        r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
        mask = (r > 120) & (r > g + 12) & (g >= b - 12) & (r - b > 24) & al
    return mask, al, st


def blobs(mask, ref, min_px=6):
    """Skin blobs with the pixel of each that is FARTHEST from ref - the fist, not the elbow."""
    from scipy import ndimage
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        yy, xx = np.where(lab == i)
        if len(yy) < min_px:
            continue
        d = (xx - ref[0]) ** 2 + (yy - ref[1]) ** 2
        k = int(np.argmax(d))
        out.append({'n': len(yy), 'far': (float(xx[k]), float(yy[k])), 'far_d': float(d[k]) ** 0.5,
                    'x': float(xx.mean()), 'y': float(yy.mean()),
                    'x0': int(xx.min()), 'x1': int(xx.max()), 'y0': int(yy.min()), 'y1': int(yy.max())})
    return out


def frame_masks(cell):
    """-> (skin mask below the shoulders, torso point, shoulder line, alpha, ground line)."""
    mask, al, st = skin_mask(cell)
    ys = np.where(al.max(axis=1))[0]
    if not len(ys):
        return None, (BODY / 2, 64.0), 30.0, None, 90
    top, bot = int(ys[0]), int(ys[-1])
    tf = m.torso_frame(cell)
    torso = (float(tf[0]), float(tf[1])) if tf else (BODY / 2, float(bot) - 10)
    shoulder = (st[0] + 6) if st else float(top) + (bot - top) * 0.22
    mask[:int(shoulder), :] = False
    return mask, torso, shoulder, al, bot


def frame_candidates(cell, ref):
    """Hand-sized skin blobs, never a leg: a big blob that reaches the ground line is a limb."""
    mask, torso, shoulder, al, bot = frame_masks(cell)
    if mask is None:
        return [], torso, shoulder, None, bot
    cands = [b for b in blobs(mask, ref) if b['n'] >= 6]
    cands = [b for b in cands if not (b['n'] > 110 and b['y1'] >= bot - 8)]
    return cands, torso, shoulder, al, bot


def extremity(cell_al, torso, side, shoulder, bot=None):
    """Silhouette point that reads as the glove/fist - used when no skin shows.

    The legs are cut out first (a boot is never a hand) and the point is then taken as the
    farthest from the torso still on the arm's own side, which lands on the glove or the wrist
    of the drawn arm instead of the foot the old measurement used to grab.
    """
    al = cell_al.copy()
    al[:int(shoulder), :] = False
    if bot is not None:                              # feet and shins out of the running
        al[int(bot - (bot - shoulder) * 0.30):, :] = False
    yy, xx = np.where(al)
    if not len(xx):
        return None
    if side is not None:                             # keep the same arm as the chain
        sel = (xx - torso[0]) * (1 if side > 0 else -1) > 2
        if sel.sum() >= 8:
            yy, xx = yy[sel], xx[sel]
    d = (xx - torso[0]) ** 2 + (yy - torso[1]) ** 2
    k = int(np.argmax(d))
    return float(xx[k]), float(yy[k])


def track_hand(cells):
    """One arm across the six frames of a view -> (points, torso, shoulder).

    Seeded on the frame whose best candidate is furthest from the torso, then walked outwards
    always taking the blob nearest the previous frame's fist: one arm per view, no hopping
    between the two arms the way the per-frame measurement used to.
    """
    rough = [frame_masks(c) if c is not None else (None, (BODY / 2, 64.0), 30.0, None, 90)
             for c in cells]
    live = [r for r in rough if r[3] is not None]
    torso = (float(np.median([r[1][0] for r in live])), float(np.median([r[1][1] for r in live]))) \
        if live else (BODY / 2, 64.0)
    shoulder = float(np.median([r[2] for r in live])) if live else 30.0

    per = [(frame_candidates(c, torso) if c is not None else ([], torso, shoulder, None, 90))
           for c in cells]
    cands = [p[0] for p in per]

    def score(bl):
        return (bl['far'][0] - torso[0]) ** 2 + (bl['far'][1] - torso[1]) ** 2

    seeded = [(score(bl), i) for i, cl in enumerate(cands) for bl in cl]
    if not seeded:
        return [None] * 6, torso, shoulder
    pts = [None] * len(cells)
    _, seed = max(seeded)
    best = max(cands[seed], key=score)
    pts[seed] = (best['far'][0], best['far'][1], 'hand')

    def walk(order):
        for i in order:
            prev = pts[i - 1] if i > 0 and pts[i - 1] else None
            if prev is None:
                continue
            pick, pd = None, None
            for bl in cands[i]:
                d = ((bl['far'][0] - prev[0]) ** 2 + (bl['far'][1] - prev[1]) ** 2) ** 0.5
                if d > MAX_STEP:
                    continue
                if pd is None or d < pd:
                    pick, pd = bl, d
            if pick is not None:
                pts[i] = (pick['far'][0], pick['far'][1], 'hand')
            elif cells[i] is not None:
                e = extremity(per[i][3], torso, None if not prev else (prev[0] - torso[0]), shoulder, per[i][4])
                if e and ((e[0] - prev[0]) ** 2 + (e[1] - prev[1]) ** 2) ** 0.5 <= MAX_STEP * 2:
                    pts[i] = (e[0], e[1], 'extremity')
                else:
                    pts[i] = (prev[0], prev[1], 'held')          # keep the arm steady
    walk(list(range(seed + 1, len(cells))))
    if seed:
        walk(list(range(seed - 1, -1, -1)))
    for i in range(len(pts)):
        if pts[i] is None and cells[i] is not None:
            e = extremity(per[i][3], torso, None, shoulder, per[i][4])
            pts[i] = (e[0], e[1], 'extremity') if e else (torso[0], torso[1], 'torso')
    return pts, torso, shoulder


# The very shapes the game draws for its 2D hero (drawWep in index.html), rebuilt in the
# weapon's own coordinates (grip at 0,0, the weapon running up -y) and drawn straight into
# the 96x96 cell with an outline.  No rotation of a bitmap: every point is rotated and the
# polygons are filled in cell space, so the pixels stay crisp at the pack's own scale.
W_SCALE = 1.0
OUTLINE = (26, 22, 30, 255)
STEEL, LIGHT, WOOD, GOLD = (168, 174, 186, 255), (226, 230, 238, 255), (104, 66, 34, 255), (198, 164, 92, 255)


# ---------------------------------------------------------------- the art it uses
# Three sources, in this order - all of them "the game's own" art, nothing invented:
#   1. Sprite/weapons/<type>.png + grip.json   - real weapon sheets, if the owner drops any
#   2. assets/weapons/<type>.png               - the item icons the game already shows,
#                                                fetched once with --fetch-icons
#   3. the shapes this file draws              - exactly what drawWep() draws in the game
# The measured placement is the same whatever the art is, so swapping art never needs a
# re-measure.
ICON_IDS = {'dagger': 1202, 'katar': 1250, 'staff': 1601, 'bow': 1701, 'axe': 1301,
            'sword': 1106, 'mace': 1501}
# the game's own numbers for these icons (index.html: WEAPON_ICON_GRIP / _SIZE / _ANGLE),
# scaled from the 64-unit hero to the pack's 96 px cell
ICON_GRIP = {'dagger': (0.5, 0.78), 'katar': (0.5, 0.76), 'staff': (0.5, 0.8), 'bow': (0.5, 0.5),
             'axe': (0.56, 0.78), 'sword': (0.5, 0.8), 'mace': (0.5, 0.77)}
ICON_SIZE = {'dagger': 25, 'katar': 30, 'staff': 29, 'bow': 34, 'axe': 30, 'sword': 29, 'mace': 28}
ICON_ANGLE = {'dagger': -35, 'katar': 22, 'staff': -24, 'bow': 18, 'axe': -30, 'sword': -35, 'mace': -28}


def art_path(wt):
    for cand in (os.path.join(REPO, 'Sprite', 'weapons', wt + '.png'),
                 os.path.join(REPO, 'assets', 'weapons', wt + '.png')):
        if os.path.exists(cand):
            return cand
    return None


def fetch_icons():
    """Download the item icons the game itself shows, into assets/weapons/ (one time)."""
    import urllib.request
    out = os.path.join(REPO, 'assets', 'weapons')
    os.makedirs(out, exist_ok=True)
    got = []
    for wt, iid in ICON_IDS.items():
        dest = os.path.join(out, wt + '.png')
        if os.path.exists(dest):
            got.append(wt + ' (cached)')
            continue
        url = 'https://www.divine-pride.net/img/items/item/dpRO/%d' % iid
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = r.read()
            Image.open(io.BytesIO(data)).convert('RGBA').save(dest)
            got.append(wt)
        except Exception as e:                                        # noqa: BLE001
            print('  %-6s could not be fetched (%s)' % (wt, e))
    print('weapon art in assets/weapons:', ', '.join(got) or 'nothing')
    return bool(got)


def art_for(wt, art_dir=None):
    """-> (image, grip (x,y) inside it, half_width) or None when there is no art file."""
    path = os.path.join(art_dir, wt + '.png') if art_dir else art_path(wt)
    if not path or not os.path.exists(path):
        return None
    im = Image.open(path).convert('RGBA')
    # a real weapon sheet: grip at the bottom centre unless grip.json says otherwise
    meta_path = os.path.join(os.path.dirname(path), 'grip.json')
    grip = None
    if os.path.exists(meta_path):
        try:
            grip = json.load(open(meta_path)).get(wt)
        except Exception:                                             # noqa: BLE001
            grip = None
    if grip is None:
        # the game's own icon numbers when this is an icon (square, art not centred on the
        # grip), otherwise the bottom centre of a held-weapon sprite
        square = im.width == im.height and im.width <= 128
        if square and wt in ICON_GRIP:
            gx, gy = ICON_GRIP[wt]
            target = ICON_SIZE[wt] * 1.5                              # 64-unit hero -> 96 px cell
            k = target / im.width
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            grip = (gx * im.width, gy * im.height)
        else:
            grip = (im.width / 2.0, im.height * 0.85)
    return im, (float(grip[0]), float(grip[1]))


def draw_weapon_into(cell, wt, hand, ang, art_dir=None):
    """Put the weapon in the cell: grip at the hand, rotated to the angle, then outlined."""
    got = art_for(wt, art_dir)
    if got:
        im, grip = got
        pad = int(max(im.width, im.height) * 0.8) + 4
        big = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        big.alpha_composite(im, (pad, pad))
        gx, gy = grip[0] + pad, grip[1] + pad
        if abs(ang) > 1e-6:
            big = big.rotate(-ang, resample=Image.BICUBIC, center=(gx, gy))
        layer = Image.new('RGBA', cell.size, (0, 0, 0, 0))
        layer.alpha_composite(big, (int(round(hand[0] - gx)), int(round(hand[1] - gy))))
    else:
        layer = _drawn_weapon(cell, wt, hand, ang)
    mask = layer.split()[3].point(lambda a: 255 if a > 40 else 0)
    ring = mask.filter(ImageFilter.MaxFilter(3))
    ring = Image.composite(Image.new('L', mask.size, 0), ring, mask)
    outline = Image.new('RGBA', cell.size, (0, 0, 0, 0))
    outline.paste(OUTLINE, (0, 0), ring)
    cell.alpha_composite(outline)
    cell.alpha_composite(layer)


def shapes_for(wt, scale=W_SCALE):
    """-> [('poly', points, colour) | ('circle', (x,y,r), colour)] in weapon space.

    Grip at (0,0), the weapon running up -y, the same silhouettes and colours as the game's
    own 2D weapon drawing (drawWep), slimmed so they read at the pack's pixel scale.
    """
    S = scale
    out = []
    if wt == 'sword':
        out += [('poly', [(-1.7, 1), (1.7, 1), (1.7, 8), (-1.7, 8)], WOOD),
                ('poly', [(-5.5, -0.5), (5.5, -0.5), (5.5, 2), (-5.5, 2)], GOLD),
                ('poly', [(-1.5, -25), (1.5, -25), (1.5, 0), (-1.5, 0)], STEEL),
                ('poly', [(-0.6, -23), (0.2, -23), (0.2, -2), (-0.6, -2)], LIGHT)]
    elif wt == 'dagger':
        out += [('poly', [(-1.5, 1), (1.5, 1), (1.5, 7), (-1.5, 7)], WOOD),
                ('poly', [(-1.7, -13), (1.7, -13), (1.7, 1), (-1.7, 1)], STEEL),
                ('poly', [(-0.5, -12), (0.3, -12), (0.3, 0), (-0.5, 0)], LIGHT)]
    elif wt == 'katar':
        out += [('poly', [(-6.5, -14), (-3.2, -14), (-3.2, 5), (-6.5, 5)], STEEL),
                ('poly', [(2.6, -14), (5.9, -14), (5.9, 5), (2.6, 5)], STEEL),
                ('poly', [(-6.5, 1.5), (5.9, 1.5), (5.9, 5), (-6.5, 5)], WOOD)]
    elif wt == 'staff':
        out += [('poly', [(-1.4, -30), (1.4, -30), (1.4, 5), (-1.4, 5)], WOOD),
                ('circle', (0, -32, 4.0), GOLD),
                ('circle', (0, -32, 2.0), (216, 196, 252, 255))]
    elif wt == 'bow':
        # a thin crescent: the outer arc out, the inner arc back, so it reads as a stroke
        def arc(r, a0, a1, n=12):
            return [(r * math.sin(a), -r * math.cos(a)) for a in
                    [a0 + i * (a1 - a0) / n for i in range(n + 1)]]
        out += [('poly', arc(19, -1.15, 1.15) + arc(16.4, 1.15, -1.15)[::-1], WOOD),
                ('poly', [(-1.9, -17.6), (0.4, -17.6), (0.4, 17.6), (-1.9, 17.6)], (244, 240, 228, 255))]
        out += [('poly', [(a, b) for a, b in [(-1.0, -2.6), (2.6, -2.6), (2.6, -0.8), (-1.0, -0.8)]], STEEL)]
    elif wt == 'axe':
        out += [('poly', [(-1.5, -20), (1.5, -20), (1.5, 7), (-1.5, 7)], WOOD),
                ('poly', [(1.5, -22), (13, -17.4), (13, -8.6), (1.5, -10.4)], STEEL),
                ('poly', [(1.8, -20.4), (9, -16.8), (9, -12.8), (1.8, -15.4)], LIGHT)]
    else:                                                   # mace
        out += [('poly', [(-1.4, -16), (1.4, -16), (1.4, 7), (-1.4, 7)], WOOD),
                ('circle', (0, -18, 5.4), STEEL),
                ('circle', (0, -18, 2.2), (128, 128, 132, 255))]
    scaled = []
    for sh in out:
        if sh[0] == 'poly':
            scaled.append(('poly', [(x * S, y * S) for x, y in sh[1]], sh[2]))
        else:
            x, y, r = sh[1]
            scaled.append(('circle', (x * S, y * S, r * S), sh[2]))
    return scaled


def _drawn_weapon(cell, wt, hand, ang):
    """The game's own drawn shapes (drawWep), rotated into the cell with the grip at the hand."""
    th = math.radians(ang)
    cos, sin = math.cos(th), math.sin(th)

    def t(p):
        x, y = p
        return (hand[0] + x * cos - y * sin, hand[1] + x * sin + y * cos)

    layer = Image.new('RGBA', cell.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for kind, v, col in shapes_for(wt):
        if kind == 'poly':
            d.polygon([t(p) for p in v], fill=col)
        else:
            cx, cy = t(v[:2])
            d.ellipse([cx - v[2], cy - v[2], cx + v[2], cy + v[2]], fill=col)
    return layer


def weapon_length(wt):
    return {'sword': 27.0, 'dagger': 14.0, 'katar': 15.0, 'staff': 33.0, 'bow': 20.0,
            'axe': 23.0, 'mace': 19.0}[wt]


def weapon_half_width(wt):
    """How far the art sticks out sideways from its own axis - the clearance test needs it."""
    return {'sword': 2.5, 'dagger': 2.0, 'katar': 7.0, 'staff': 4.5, 'bow': 19.0,
            'axe': 14.0, 'mace': 6.0}[wt]


def _segment_distance(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
    vx, vy = bx - ax, by - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / L2))
    return ((px - (ax + vx * t)) ** 2 + (py - (ay + vy * t)) ** 2) ** 0.5


def blade_angle(wt, hand, torso, shoulder, frame):
    """The angle the weapon is drawn at, in degrees (0 = up, +cw), from the arm's own pose.

    The axis is the forearm (shoulder -> hand), so the weapon continues the drawn arm the way
    a held weapon does.  Two guards keep the art readable: upright families get a small fixed
    tilt instead, and any angle that would lay the weapon across the torso is rotated away
    from the body until it clears it.
    """
    hx, hy = hand
    side = 1.0 if hx >= torso[0] else -1.0
    if wt in UPRIGHT:
        ang = (10.0 if wt == 'bow' else 5.0) * side
    else:
        dx, dy = hx - shoulder[0], hy - shoulder[1]
        ang = math.degrees(math.atan2(dx, -dy))
        ang += 4.0 * math.sin(frame * 1.1)              # a little life between the frames
    L = weapon_length(wt)
    for step in range(0, 61, 2):                        # keep the blade off the torso
        for cand in (ang + step * side, ang - step * side):
            th = math.radians(cand)
            axis = (math.sin(th), -math.cos(th))
            tip = (hx + axis[0] * L, hy + axis[1] * L)
            if _segment_distance(torso, (hx, hy), tip) > 6.0 + weapon_half_width(wt):
                return cand
    return ang


def write_standalone(data_js, out_html):
    """The review page with the data inlined, so it opens straight from a file too.

    The newlines stay in: a one-line inliner once let the data file's leading // comment
    swallow the whole assignment (v33's standalone bug).
    """
    page = open(os.path.join(REPO, 'tools', 'weapon_review.html')).read()
    data = open(data_js).read()
    tag = '<script src="weapon_review_data.js"></script>'
    if tag not in page:
        raise SystemExit('weapon_review.html no longer loads weapon_review_data.js - fix the inliner')
    page = page.replace(tag, '<script>\n%s\n</script>' % data.rstrip('\n'), 1)
    with open(out_html, 'w') as fh:
        fh.write(page)
    print('wrote %s (%.2f MB, standalone)' % (os.path.relpath(out_html, REPO),
                                              os.path.getsize(out_html) / 1048576))


def load_head_atlas():
    """The male head atlas out of the pack data, so the proof/review seats the same head."""
    try:
        raw = open(os.path.join(REPO, 'assets', 'sprite_pack_data.js')).read()
        i = raw.find('"male":"data:image/png;base64,')
        j = raw.find('"', i + 30)
        return Image.open(io.BytesIO(__import__('base64').b64decode(raw[i + 30:j])))
    except Exception:                                                 # noqa: BLE001
        return None


# ------------------------------------------------------------------ review data
def png_trim(im):
    """-> (data uri of the image trimmed to its content, [x, y] of that content)."""
    bb = im.split()[3].getbbox() or (0, 0, im.width, im.height)
    buf = io.BytesIO()
    im.crop(bb).save(buf, 'PNG', optimize=True)
    return ('data:image/png;base64,' + __import__('base64').b64encode(buf.getvalue()).decode(),
            [bb[0], bb[1]])


def load_adjust(path):
    """The owner's own corrections from the review page -> {(cls, view, frame): (dx, dy)}."""
    if not path or not os.path.exists(path):
        return {}
    try:
        data = json.load(open(path))
    except Exception:                                                 # noqa: BLE001
        return {}
    out = {}
    for k, v in (data.get('adjust') or {}).items():
        parts = k.split('|')
        if len(parts) == 3:
            out[(parts[0], int(parts[1]), int(parts[2]))] = (float(v[0]), float(v[1]))
    return out


def load_head_seats():
    """Every cell's absolute head pivot, all 8 views: tools/head_seats.json.

    Written by `node tools/head_seats.js`, which asks the PICKER itself for the seat
    (`headSpot = baseSeat(pose, view) + that view's own drag`), so the review page can seat the
    head exactly where the owner sees it in the picker.
    """
    try:
        return json.load(open(os.path.join(REPO, 'tools', 'head_seats.json')))['seats']
    except Exception:                                                 # noqa: BLE001
        return None


def head_seat(cls, view, frame, defaults, seats):
    """The head pivot for one cell, in game-cell pixels.

    `seats` covers all 8 views and is the source of truth. Without it we fall back to the
    drawn-view pivots shipped with the picker - which is exactly the bug the owner caught on
    2026-10-04: NE, E and SE live in `headDragMirror`, were never read here, and got baked
    with no head at all. Keep the fallback working (a bare checkout has no seats file), but a
    real run must carry the seats file.
    """
    if seats and seats.get(cls) and seats[cls][view] and seats[cls][view][frame]:
        return seats[cls][view][frame]
    return defaults['head'].get('%s|%d|%d' % (cls, view, frame))


def write_review(picker, defaults, grip_points, head, adjust, out_js, art_dir=None, seats=None):
    """tools/weapon_review_data.js - every class, one image pair per class, ready to nudge.

    Per class TWO images, both 6x8 tiles of 96 px (column = frame, row = view 0..7):
      cell   - body + head, exactly the atlas the game already draws
      weapon - the weapon alone, in its automatic place, transparent everywhere else
    plus hand[cls][view][frame] = the measured grip in cell pixels and source[] = how it was
    found, so the page can say where it had to infer instead of seeing a bare hand.
    """
    meta = {'classes': [], 'views': ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'],
            'frames': 6, 'armed': [0, 1, 2, 6, 7], 'bare': [3, 4, 5],
            'weapon': dict(CLASS_WEP)}
    grids, wgrids, hand, source = {}, {}, {}, {}
    for cls in picker['classes']:
        meta['classes'].append(cls)
        wt = CLASS_WEP.get(cls, 'sword')
        grid = Image.new('RGBA', (6 * BODY, 8 * BODY), (0, 0, 0, 0))
        wgrid = Image.new('RGBA', (6 * BODY, 8 * BODY), (0, 0, 0, 0))
        hand[cls] = [[None] * 6 for _ in range(8)]
        source[cls] = {}
        for view in range(8):
            for f in range(6):
                im, p, box = cell_of(cls, view, f, picker['classes'][cls], defaults)
                if im is None:
                    continue
                seat = head_seat(cls, view, f, defaults, seats)
                if head is not None and seat:
                    hx, hy = seat
                    tile = head.crop((view * 64, 0, view * 64 + 64, 64))
                    im.alpha_composite(tile, (round(hx - 32), round(hy - 48)))
                grid.alpha_composite(im, (f * BODY, view * BODY))
                if view in (3, 4, 5):
                    continue
                gp = grip_points[cls][view][f]
                if not gp:
                    continue
                dx, dy = adjust.get((cls, view, f), (0.0, 0.0))
                hand[cls][view][f] = [round(gp[0] + dx, 1), round(gp[1] + dy, 1)]
                source[cls]['%d|%d' % (view, f)] = gp[3]
                layer = Image.new('RGBA', (BODY, BODY), (0, 0, 0, 0))
                draw_weapon_into(layer, wt, (gp[0] + dx, gp[1] + dy), gp[2], art_dir)
                wgrid.alpha_composite(layer, (f * BODY, view * BODY))
        grids[cls] = png_uri(grid)
        wgrids[cls] = png_uri(wgrid)
    txt = ('// Weapon placement, measured from the owner\'s own attack poses - generated by\n'
           '// tools/weapon_bake.py --review.  The owner reviews it in tools/weapon_review.html.\n')
    txt += 'window.WEAPON_REVIEW=%s;\n' % json.dumps(
        {'meta': meta, 'cell': grids, 'weapon': wgrids, 'hand': hand, 'source': source},
        separators=(',', ':'))
    with open(out_js, 'w') as fh:
        fh.write(txt)
    print('wrote %s (%.2f MB, %d classes)' % (os.path.relpath(out_js, REPO),
                                              os.path.getsize(out_js) / 1048576, len(grids)))
    return meta


def png_uri(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + __import__('base64').b64encode(buf.getvalue()).decode()


# ------------------------------------------------------------------ proof sheet
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--proof', default='/tmp/weapon_proof.png')
    ap.add_argument('--grips', default='/tmp/weapon_grips.json')
    ap.add_argument('--classes', default='')
    ap.add_argument('--art', default='')
    ap.add_argument('--adjust', default='')
    ap.add_argument('--review', default='')
    ap.add_argument('--fetch-icons', action='store_true')
    ap.add_argument('--standalone', default='')
    a = ap.parse_args()
    if a.fetch_icons:
        fetch_icons()

    picker = lj(os.path.join(REPO, 'tools', 'sprite_picker_data.js'), 'window.SPRITE_PICKER_DATA=')
    defaults = lj(os.path.join(REPO, 'tools', 'sprite_picker_defaults.js'), 'window.SPRITE_PICKER_DEFAULTS=')
    adjust = load_adjust(a.adjust)

    grips, problems = {}, []
    for cls in picker['classes']:
        grips[cls] = {}
        for view in range(8):
            cells = [cell_of(cls, view, f, picker['classes'][cls], defaults)[0] for f in range(6)]
            pts, torso, sh = track_hand(cells)
            wt = CLASS_WEP.get(cls, 'sword')
            grips[cls][view] = [[round(p[0], 1), round(p[1], 1),
                                 round(blade_angle(wt, (p[0], p[1]), torso, (torso[0], sh), f), 1), p[2]]
                                if p else None for f, p in enumerate(pts)]
            if cells[0] is not None:
                hop = max(((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2) ** 0.5
                          for i in range(1, 6) if pts[i] and pts[i - 1])
                if hop > MAX_STEP + 1:
                    problems.append('%s v%d: %.0f px hop' % (cls, view, hop))
    json.dump(grips, open(a.grips, 'w'), indent=0)
    print('grips ->', a.grips)
    if a.review:
        head = load_head_atlas()
        seats = load_head_seats()
        if head is not None and seats is None:
            print('WARNING: tools/head_seats.json is missing - run `node tools/head_seats.js`; '
                  'the mirrored views (NE/E/SE) will be baked WITHOUT a head')
        write_review(picker, defaults, grips, head, adjust,
                     os.path.join(REPO, a.review) if not os.path.isabs(a.review) else a.review,
                     a.art or None, seats)
    if a.standalone:
        write_standalone(os.path.join(REPO, a.review) if not os.path.isabs(a.review) else a.review,
                         os.path.join(REPO, a.standalone) if not os.path.isabs(a.standalone) else a.standalone)
    if problems:
        print('HOP WARNINGS:', '; '.join(problems))
    else:
        print('no hop over %d px in any view' % MAX_STEP)

    if not a.proof:
        return
    want = [c for c in a.classes.split(',') if c] or list(picker['classes'].keys())
    head = load_head_atlas()
    seats = load_head_seats()
    if head is None:
        print('heads unavailable for the proof')
    Z = 2
    rows = []
    for cls in want:
        body = CLASS_BODY.get(cls, cls.lower())
        wt = CLASS_WEP.get(cls, 'sword')
        tiles = []
        for view in range(8):
            for f in (0, 2, 4):
                im, p, box = cell_of(cls, view, f, picker['classes'][cls], defaults)
                if im is None:
                    tiles.append(Image.new('RGB', (BODY * Z, BODY * Z), (24, 26, 32)))
                    continue
                seat = grips[cls][view][f]
                if seat:
                    dx, dy = adjust.get((cls, view, f), (0.0, 0.0))
                    draw_weapon_into(im, wt, (seat[0] + dx, seat[1] + dy), seat[2], a.art or None)
                seat = head_seat(cls, view, f, defaults, seats)
                if head is not None and seat:
                    hx, hy = seat
                    tile = head.crop((view * 64, 0, view * 64 + 64, 64))
                    im.alpha_composite(tile, (round(hx - 32), round(hy - 48)))
                tiles.append(im.convert('RGB').resize((BODY * Z, BODY * Z), Image.NEAREST))
        row = Image.new('RGB', (sum(t.width + 2 for t in tiles), BODY * Z + 16), (18, 20, 26))
        x = 0
        for t in tiles:
            row.paste(t, (x, 16))
            x += t.width + 2
        srcs = [grips[cls][v][f][3] for v in range(8) for f in range(6) if grips[cls][v][f]]
        auto = sum(1 for x in srcs if x == 'hand')
        ImageDraw.Draw(row).text((4, 3), '%s — %s   S,SW,W,NW,N,NE,E,SE  (frames 1,3,5)   '
                                 'hand found on %d of %d cells (the rest: gloved/hidden arm)'
                                 % (cls, wt, auto, len(srcs)), fill=(255, 207, 107))
        rows.append(row)
    W = max(r.width for r in rows)
    out = Image.new('RGB', (W, sum(r.height + 4 for r in rows)), (18, 20, 26))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + 4
    out.save(a.proof)
    print('wrote %s (%dx%d)' % (a.proof, out.width, out.height))


if __name__ == '__main__':
    main()
