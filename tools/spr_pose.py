"""Animation poses: joint positions per frame, and the weapon drawing."""
import math
from spr_core import ell, limb, poly, rr, shade, mix


def pose(kind, fr, wt='dagger'):
    """Joint positions for one frame.

    Keys: knee/foot/elb/hand are suffixed '+1'/'-1'; plus bob, swing, lean, sw.
    """
    P = {'hip': (0, 30, 0), 'chest': (0, 42, 0), 'head': (0, 55, 0),
         'bob': 0.0, 'swing': 0.0, 'lean': 0.0, 'sw': 0.0}
    if kind == 0:                                       # idle
        P['bob'] = -1.0 * fr
        for s in (-1, 1):
            P['knee%d' % s] = (5.4 * s, 15, 0)
            P['foot%d' % s] = (5.4 * s, 1.5, 0)
            P['elb%d' % s] = (10.8 * s, 39, 1.5)
            P['hand%d' % s] = (11.2 * s, 31, 3)
    elif kind == 1:                                     # walk
        u = fr / 4.0 * math.pi * 2
        sw = math.sin(u)
        P['bob'] = -abs(math.sin(u)) * 1.8
        P['sw'] = sw
        P['knee-1'] = (-5.4 + 3.0 * sw, 15, 0)
        P['foot-1'] = (-5.4 + 8 * sw, 2, max(0.0, 2 - sw * 2))
        P['knee1'] = (5.4 - 3.0 * sw, 15, 0)
        P['foot1'] = (5.4 - 8 * sw, 2, max(0.0, 2 + sw * 2))
        P['elb-1'] = (-10.8 - sw * 2, 39, 1.5 + sw * 3)
        P['hand-1'] = (-11.2 - sw * 3, 31, 3 + sw * 4)
        P['elb1'] = (10.8 + sw * 2, 39, 1.5 - sw * 3)
        P['hand1'] = (11.2 + sw * 3, 31, 3 - sw * 4)
    else:                                               # attack
        u = fr / 3.0
        P['bob'] = -1.0
        s = -(u / .34) if u < .34 else (1.0 if u < .62 else -(1 - (u - .62) / .38))
        P['swing'] = s
        P['lean'] = s * 3
        P['chest'] = (P['lean'] * .35, 42, 0)
        P['head'] = (P['lean'] * .6, 55, 0)
        for k in ('-1', '1'):
            sg = 1 if k == '1' else -1
            P['knee' + k] = (5.4 * sg, 15, 0)
            P['foot' + k] = (5.4 * sg + s * 2.5, 1.5, 0)
            P['elb' + k] = (10.8 * sg, 39, 1.5)
        if wt == 'bow':
            P['elb-1'] = (-16, 36, 1)
            P['hand-1'] = (-13, 42, 6)
            P['elb1'] = (11, 40, 0)
            P['hand1'] = (7, 44, 5)
        else:
            P['elb-1'] = (-10.8, 39, 1.5)
            P['hand-1'] = (-11.2, 33, 3)
            P['elb1'] = (10.8 + s * 3, 38 - s * 2, 1.5 + s * 2)
            P['hand1'] = (11.2 + s * 5, 30 + abs(s) * 4, 3 + s * 8)
    return P


def draw_weapon(d, x, y, ang, wt, metal, swing=0.0):
    """Weapon gripped at screen point (x,y), rotated by `ang`."""
    ca, sa = math.cos(ang), math.sin(ang)

    def R(px, py):
        return (x + px * ca - py * sa, y + px * sa + py * ca)
    wood, dark = (108, 62, 26, 255), (72, 40, 16, 255)
    if wt == 'dagger':
        rr(d, *R(-1.3, -2), *R(1.3, 5), wood)
        rr(d, *R(-2.6, -4), *R(2.6, -2), metal)
        poly(d, [R(-1.6, -4), R(1.6, -4), R(.6, -18 - swing * 3), R(-1, -18 - swing * 3)], metal)
        poly(d, [R(-.6, -4), R(1.6, -4), R(.6, -18 - swing * 3)], shade(metal, 1.35))
    elif wt == 'katar':
        # short blades held in one fist, angled outward so they read clearly
        for s in (-1, 1):
            poly(d, [R(s * 2.6 - 1.0, -4), R(s * 2.6 + 1.0, -4),
                     R(s * 4.6 + swing * 1.5, -15), R(s * 3.0 + swing * 1.5, -15)], metal)
            poly(d, [R(s * 2.6, -4), R(s * 2.6 + 1.0, -4),
                     R(s * 4.6 + swing * 1.5, -15)], shade(metal, 1.3))
            rr(d, *R(s * 2.2 - 1.2, -6.5), *R(s * 2.2 + 1.2, -3), dark)
        rr(d, *R(-3.6, -5), *R(3.6, 0), dark)
        rr(d, *R(-3.6, -5), *R(3.6, -2.5), wood)
    elif wt == 'sword':
        rr(d, *R(-1.4, -2), *R(1.4, 5), wood)
        rr(d, *R(-5, -4), *R(5, -2), metal)
        poly(d, [R(-2.2, -4), R(2.2, -4), R(1.3, -30 - swing * 4), R(-1.3, -30 - swing * 4)], metal)
        poly(d, [R(0, -4), R(2.2, -4), R(1.3, -30 - swing * 4)], shade(metal, 1.4))
    elif wt == 'bow':
        d.arc([x - 14, y - 19, x + 12, y + 13], -78, 78, fill=wood, width=3)
        bx = x - 12 + swing * 9
        d.line([bx, y - 13, bx, y + 10], fill=(244, 240, 226, 255), width=1)
        if swing > .2:
            rr(d, *R(6, -1), *R(16, 1), metal)
    elif wt == 'staff':
        rr(d, *R(-1.5, -32), *R(1.5, 5), wood)
        ell(d, *R(0, -35), 6, 6, metal)
        ell(d, *R(0, -35), 3.2, 3.2, mix(metal, (196, 146, 255, 255), .75))
    elif wt == 'axe':
        rr(d, *R(-1.5, -24), *R(1.5, 5), wood)
        poly(d, [R(1, -26), R(15, -19), R(14, -8), R(1, -11)], metal)
    else:                                                 # mace
        rr(d, *R(-1.5, -15), *R(1.5, 5), wood)
        ell(d, *R(0, -18), 5.5, 5.5, metal)


def slash_arc(d, x, y, ang, size=1.0, alpha=0.85):
    """Crescent slash drawn on the attack frames."""
    col = (255, 245, 214, int(255 * alpha))
    cx = x - math.cos(ang) * 13 * size
    cy = y - math.sin(ang) * 13 * size
    r = 15 * size
    d.arc([cx - r, cy - r, cx + r, cy + r], ang * 180 / math.pi - 62,
          ang * 180 / math.pi + 62, fill=col, width=3)
    d.arc([cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4], ang * 180 / math.pi - 48,
          ang * 180 / math.pi + 48, fill=(255, 255, 255, int(190 * alpha)), width=1)