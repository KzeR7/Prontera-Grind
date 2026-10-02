"""Shared sprite-drawing primitives: colours, shapes, 3d projection."""
from PIL import Image, ImageDraw
import math

CELL_W, CELL_H = 64, 96
DIRS = 8
IDLE, WALK, ATK = 2, 4, 4
ROWS = IDLE + WALK + ATK
GROUND = 88
OUTLINE = (26, 16, 8, 255)


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def shade(c, k):
    a = c[3] if len(c) > 3 else 255
    return (max(0, min(255, int(c[0] * k))), max(0, min(255, int(c[1] * k))),
            max(0, min(255, int(c[2] * k))), a)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def ell(d, cx, cy, rx, ry, c):
    if rx > 0 and ry > 0:
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=c)


def rr(d, x0, y0, x1, y1, c):
    d.rectangle([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], fill=c)


def limb(d, pts, w, c):
    """Thick round-capped polyline."""
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for s in range(steps + 1):
            t = s / steps
            ell(d, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2.0, w / 2.0, c)
    for (x, y) in pts:
        ell(d, x, y, w / 2.0, w / 2.0, c)


def poly(d, pts, c):
    d.polygon(pts, fill=c)


def outline(im, col=OUTLINE, thr=32):
    """1px dark rim around the silhouette - the pixel-art look."""
    src = im.split()[3].load()
    out = im.copy()
    dst = out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if src[x, y] <= thr:
                continue
            for yy in (y - 1, y, y + 1):
                if not 0 <= yy < h:
                    continue
                for xx in (x - 1, x, x + 1):
                    if 0 <= xx < w and src[xx, yy] > thr and dst[xx, yy][3] == 0:
                        dst[xx, yy] = col
    return out


def cell():
    im = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def proj(x, y, z, a, bob, cx=32.0):
    """local (x right, y up, z forward) -> (screen x, screen y, depth)."""
    ca, sa = math.cos(a), math.sin(a)
    return (cx + x * ca + z * sa, GROUND - (y + bob), x * sa + z * ca)


def limb3(d, p0, p1, r, col, hi=True, a=0.0, bob=0.0):
    """3d limb drawn as a shaded round bar."""
    q0, q1 = proj(*p0, a, bob), proj(*p1, a, bob)
    limb(d, [q0[:2], q1[:2]], r, col)
    if hi:
        dx, dy = q0[0] - q1[0], q0[1] - q1[1]
        n = max(1.0, math.hypot(dx, dy))
        o = r * 0.3
        limb(d, [(q0[0] - dy / n * o - o * .4, q0[1] + dx / n * o - o * .5),
                 (q1[0] - dy / n * o - o * .4, q1[1] + dx / n * o - o * .5)],
             max(1.0, r * 0.4), shade(col, 1.22))