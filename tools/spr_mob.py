"""Mob sprite renderer - full versions of the Prontera map monsters."""
import math
from spr_core import cell, ell, limb, outline, poly, proj, rr, shade, mix
from spr_pose import slash_arc

GROUND_BOB = 88

# Prontera monsters + boss -- RO-mobile palette: juicy bright slimes,
# cream bunny, honey bee, leaf-green plant, scarab beetle
MOB_SPECS = {
    'Poring': dict(body='#ff9ec4', dark='#d95f92', light='#ffd6e8', eye='#2a2028',
                   kind='slime', label='Poring'),
    'Drops': dict(body='#ffb84a', dark='#d08020', light='#ffe6a8', eye='#2a2028',
                  kind='slime', label='Drops'),
    'Poporing': dict(body='#9ae84a', dark='#5fa82c', light='#d4f8a8', eye='#2a2028',
                     kind='slime', label='Poporing'),
    'Mastering': dict(body='#7ae86a', dark='#3f9a42', light='#c0f8b8', eye='#c02020',
                      kind='slime', boss=True, label='Mastering'),
    'Fabre': dict(body='#b8e05a', dark='#7a9a2c', light='#dcf8a0', eye='#2a2028',
                  kind='worm', label='Fabre'),
    'Lunatic': dict(body='#fff4f4', dark='#d8b8b8', light='#ffffff', eye='#e04050',
                    kind='bunny', label='Lunatic'),
    'Savage Bebe': dict(body='#c09a5a', dark='#7d5f38', light='#e8c898', eye='#e8d060',
                        kind='cat', label='Savage Bebe'),
    'Chonchon': dict(body='#7ab8f0', dark='#3f74b8', light='#b8dcf8', eye='#2a2028',
                     kind='bird', label='Chonchon'),
    'Peco Peco': dict(body='#ffd850', dark='#c09020', light='#fff4a8', eye='#2a2028',
                      kind='bird', label='Peco Peco'),
    'Willow': dict(body='#7ac04a', dark='#488030', light='#a8dc78', eye='#2a2028',
                   kind='plant', label='Willow'),
    'Rocker': dict(body='#c86a3a', dark='#7a3a1c', light='#f0a068', eye='#e02020',
                   kind='beetle', label='Rocker'),
}

COLS = ('body', 'dark', 'light', 'eye')


def _eyes(d, x, y, col, r=1.5, gap=3.0, angry=False):
    ell(d, x - gap, y, r, r * 1.25, col)
    ell(d, x + gap, y, r, r * 1.25, col)
    if angry:
        ell(d, x - gap, y - r * 1.7, r * 1.3, r * .5, col)
        ell(d, x + gap, y - r * 1.7, r * 1.3, r * .5, col)


def draw_mob(raw, dir_i, kind, fr):
    """Render one 64x96 mob cell."""
    sp = {k: (tuple(int(raw[k].lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)) + (255,))
          for k in COLS}
    body, dark, light, eye = sp['body'], sp['dark'], sp['light'], sp['eye']
    im, d = cell()
    a = dir_i * math.pi / 4
    face = math.cos(a)
    side = math.sin(a)
    back = face <= -0.35
    mk = raw['kind']
    bob, sq = _motion(kind, fr)

    def at(x, y, z=0.0):
        sx, sy, _ = proj(x, y, z, a, 0)
        return sx, sy + bob

    if mk == 'slime':
        k = 1.35 if raw.get('boss') else 1.2
        rx, ry = 17 * sq * k, 15.5 * sq * k
        sx, cy = at(0, 0)
        ell(d, sx, cy, rx, ry, body)
        ell(d, sx, cy + ry * .22, rx * .74, ry * .62, light)
        ell(d, sx, cy - ry * .30, rx * .60, ry * .38, mix(body, (255, 255, 255, 255), .5))
        for s in (-1, 1):
            ell(d, sx + s * 9, cy + ry * .92, 4.6, 2.4, dark)
        if not back:
            _eyes(d, sx + side * 3, cy - ry * .08, eye, 2.4, 4.8, raw.get('boss'))
            ell(d, sx + side * 3, cy + ry * .36, 2.6, 1.5, dark)
        else:
            ell(d, sx, cy - ry * .10, rx * .46, ry * .36, dark)

    elif mk == 'worm':
        for i, (ox, dz, rx, ry) in enumerate([(13, 3.5, 9.5, 8.5), (2, 1.5, 10.5, 9.5),
                                              (-9, -1, 9.0, 8.0)]):
            px, py = at(ox, 9, dz * (-1 if back else 1))
            col = body if i == 2 else (dark if i == 0 else mix(body, dark, .35))
            ell(d, px, py, rx, ry, col)
        hx3, hy = at(0, 14, -2 if not back else 2)
        ell(d, hx3, hy, 10, 9, body)
        ell(d, hx3 - side * 2, hy - 3, 5, 4, light)
        for s in (-1, 1):
            ell(d, hx3 + s * 4, hy - 9, 1.6, 4.5, dark)
        if not back:
            _eyes(d, hx3 - side * 3, hy - 1, eye, 1.8, 3.4)
            ell(d, hx3 - side * 3, hy + 4, 2.0, 1.2, dark)

    elif mk == 'bunny':
        bx, by = at(0, 11)
        if not back:
            for s in (-1, 1):
                ell(d, bx + s * 5, by - 17, 3.0, 10, body)
                ell(d, bx + s * 5, by - 17, 1.6, 7, mix(body, (240, 150, 170, 255), .6))
        ell(d, bx, by, 14, 12.5, body)
        ell(d, bx - side * 3, by - 4, 8, 6, light)
        ell(d, bx, by - 12, 9.5, 8.5, body)
        if not back:
            _eyes(d, bx + side * 2, by - 14, eye, 1.7, 3.4)
            ell(d, bx + side * 2, by - 9, 1.4, 1.0, mix(eye, (200, 80, 90, 255), .5))
        else:
            ell(d, bx, by - 13, 7, 6, shade(body, .9))
        ell(d, bx, by + 12, 7, 4.5, body)
        for s in (-1, 1):
            ell(d, bx + s * 7, by + 11, 4.2, 3.0, body)

    elif mk == 'cat':
        lean = 3.0 if (kind == 2 and fr > 0) else 0
        cx, cy = at(0, 9)
        poly(d, [(cx - 12, cy + 4), (cx + 10, cy + 4),
                 (cx + 13 + lean, cy - 6), (cx - 10, cy - 8)], body)
        ell(d, cx + 3, cy - 9, 9.5, 8, body)
        for s in (-1, 1):
            ell(d, cx + 3 + s * 5, cy - 15, 3.0, 4.0, body)
            ell(d, cx + 3 + s * 5, cy - 15, 1.5, 2.4, mix(body, (220, 140, 150, 255), .5))
        ell(d, cx - 13, cy + 1, 5, 4.5, dark)
        for s in (-1, 1):
            ell(d, cx - 2 + s * 5, cy + 6, 4.0, 3.0, body)
        if not back:
            _eyes(d, cx + 3 + side * 2, cy - 11, eye, 1.7, 3.4)
            ell(d, cx + 3 + side * 2, cy - 6, 1.6, 1.0, dark)
            for i in range(3):
                rr(d, cx - 9 + i * 5, cy - 5, cx - 7.5 + i * 5, cy, dark)

    elif mk == 'bird':
        flap = math.sin(fr / 4.0 * math.pi * 2) * (3.0 if kind == 1 else 1.2)
        bx, by = at(0, 8)
        ell(d, bx, by, 12, 10.5, body)
        ell(d, bx - side * 3, by - 3, 6.5, 5, light)
        for s in (-1, 1):
            ell(d, bx + s * 11, by - 2 + s * flap, 6.5, 4.5, dark if back else mix(body, dark, .35))
        ell(d, bx, by - 11, 7.5, 7, body)
        poly(d, [(bx - 2.5, by - 11), (bx + 2.5, by - 11),
                 (bx + side * 7, by - 9.5)], (240, 190, 70, 255))
        for s in (-1, 1):
            ell(d, bx + s * 4, by + 11, 3.4, 1.8, (232, 160, 60, 255))
            ell(d, bx + s * 4, by + 13, 3.6, 1.4, (240, 190, 70, 255))
        if not back:
            _eyes(d, bx + side * 1.5, by - 13, eye, 1.5, 2.8)
            ell(d, bx, by - 19, 4.0, 3.0, mix(body, (230, 70, 70, 255), .6))

    elif mk == 'plant':
        sway = math.sin(fr / 4.0 * math.pi * 2) * 2.0 * (1 if kind == 1 else .4)
        tx, ty = at(0, 0)
        ell(d, tx, ty + 6, 6.5, 8, (122, 84, 44, 255))
        ell(d, tx - 2.4, ty + 5, 2.6, 5, (150, 106, 60, 255))
        ell(d, tx + sway, ty - 10, 16, 14, body)
        ell(d, tx + sway - 5, ty - 14, 9, 8, light)
        ell(d, tx + sway + 7, ty - 6, 7, 6, dark)
        for s in (-1, 1):
            ell(d, tx + sway + s * 13, ty + 4, 7, 4, body)
        if not back:
            _eyes(d, tx + sway + side * 2, ty - 8, eye, 2.0, 4.0)

    else:                                               # beetle
        bx, by = at(0, 7)
        for s in (-1, 1):
            for i in range(3):
                limb(d, [(bx + s * 6, by + 2),
                         (bx + s * (10 + i), by + 6 + i * 1.5)], 2.4, dark)
        ell(d, bx, by, 14, 10, body)
        ell(d, bx - side * 4, by - 3, 8, 5.5, light)
        rr(d, bx - 1.0, by - 9, bx + 1.0, by + 9, dark)
        ell(d, bx, by - 10, 6.5, 5.5, dark)
        for s in (-1, 1):
            ell(d, bx + s * 3, by - 13, 2.0, 3.0, mix(dark, (60, 40, 20, 255), .6))
        if not back:
            _eyes(d, bx + side * 1.5, by - 11, eye, 1.4, 2.6)

    if kind == 2 and fr in (1, 2) and mk in ('cat', 'bird', 'beetle'):
        slash_arc(d, 32 + side * 10, 52, (0.6 if side >= 0 else math.pi - 0.6),
                  .8, .85 if fr == 2 else .5)
    return outline(im)
def _motion(kind, fr):
    """-> (bob, squash) shared by every mob."""
    if kind == 0:
        return -1.4 * fr, 1.0 + 0.03 * fr
    if kind == 1:
        return -abs(math.sin(fr / 4.0 * math.pi * 2)) * 2.6, 1.0
    return -abs(math.sin(fr / 3.0 * math.pi)) * 3.2, 1.0 + 0.10 * (fr / 3.0)