#!/usr/bin/env python3
"""haven-v380: real game sprites for the seven Fishing MVPs.

The files this replaces were raw reference drops (opaque photo/sketch backgrounds, one was a
pencil collage), so the DigiDex-style Index drew them as opaque squares. This tool paints the
seven bosses in the roster's own chibi style - transparent background, bold silhouette, dark
outline, one glint eye - at 256x256 (the float renders up to ~256 and the Index at 64, so HD
holds everywhere), deterministic, no network.

    python3 tools/mvp_sprite_art.py          # (re)write the seven PNGs
    python3 tools/mvp_sprite_art.py --check  # exit 1 when the files drift from the generator

Species weight ranges (kg) live in assets/social-fishing.js; the scene scales the pond peek
by the same numbers (see social-scene.js MVP_PEEK), so the heaviest boss is also the biggest.
"""
import sys, hashlib, os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'social', 'fish')
SS = 4                      # supersample: draw at 1024, ship at 256
SIZE = 256 * SS

# species id -> (body, belly, fin/accent, outline)
PALETTES = {
    'mvp_azure_drake':   ((74, 125, 212), (207, 224, 248), (36, 66, 130), (24, 34, 64)),
    'mvp_tide_drake':    ((58, 168, 143), (210, 244, 232), (26, 104, 88), (18, 48, 44)),
    'mvp_abyss_drake':   ((86, 82, 158),  (188, 182, 232), (46, 42, 96),  (20, 18, 44)),
    'mvp_iron_crab':     ((96, 106, 122), (172, 182, 196), (140, 92, 58),  (30, 32, 40)),
    'mvp_crimson_shark': ((214, 74, 90),  (248, 236, 238), (150, 36, 54),  (66, 18, 28)),
    'mvp_gilded_shark':  ((224, 178, 62), (250, 240, 210), (168, 122, 30), (84, 58, 14)),
    'mvp_void_maw':      ((62, 44, 100),  (154, 132, 200), (36, 24, 66),   (16, 10, 32)),
}



class D(ImageDraw.ImageDraw):
    """ImageDraw that tolerates float widths (everything here is SS-scaled)."""
    def line(self, xy, fill=None, width=1, joint=None):
        super().line(xy, fill=fill, width=max(1, int(round(width))), joint=joint)

def curve(points, steps=24):
    """Catmull-Rom through control points -> dense polyline."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for t in range(steps):
            t2 = t / steps
            t22, t3 = t2 * t2, t2 * t2 * t2
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t2 + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t22 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t2 + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t22 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    out.append(points[-1])
    return out


def thick_path(draw, path, radii, fill):
    """Stamp a tapering body: circles along the path with per-point radius."""
    n = len(path)
    for i, (x, y) in enumerate(path):
        r = radii(i / (n - 1)) if callable(radii) else radii
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def body_outline(draw, path, radii, color, width):
    """Silhouette outline: offset polylines above/below the spine."""
    n = len(path)
    top, bot = [], []
    for i in range(n):
        x, y = path[i]
        x2, y2 = path[min(n - 1, i + 1)]
        x1, y1 = path[max(0, i - 1)]
        dx, dy = x2 - x1, y2 - y1
        L = (dx * dx + dy * dy) ** .5 or 1
        nx, ny = -dy / L, dx / L
        r = radii(i / (n - 1)) if callable(radii) else radii
        top.append((x + nx * r, y + ny * r))
        bot.append((x - nx * r, y - ny * r))
    ring = top + bot[::-1]
    draw.line(ring + [ring[0]], fill=color, width=max(1, int(round(width))), joint='curve')


def fin(draw, pts, color, outline, width):
    poly = curve(pts)
    draw.polygon(poly, fill=color)
    draw.line(poly + [poly[0]], fill=outline, width=max(1, int(round(width))), joint='curve')


def eye(draw, x, y, r, brow=False):
    draw.ellipse((x - r, y - r, x + r, y + r), fill=(250, 250, 252, 255))
    pr = r * .55
    draw.ellipse((x - pr * .8, y - pr, x + pr * .8, y + pr), fill=(24, 20, 30, 255))
    g = r * .28
    draw.ellipse((x - pr * .35, y - pr * .75, x - pr * .35 + g, y - pr * .75 + g), fill=(255, 255, 255, 255))
    if brow:
        draw.line([(x - r * 1.1, y - r * 1.5), (x + r * .9, y - r * 2.1)], fill=(24, 20, 30, 255), width=int(r * .5), joint='curve')


def glow(img, cx, cy, r, color, alpha):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(r * .45))
    img.alpha_composite(layer)


def base_canvas():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    return img, D(img)


def finish(img, name):
    img = img.resize((256, 256), Image.LANCZOS)
    img.save(os.path.join(OUT, name + '.png'))


# ------------------------------------------------------------- drakes (sea serpents)
def drake(name, spots=False):
    """Rising sea-serpent: head up in the frame, tail descending into the water, so the
    pond peek (which keeps the top ~62% of the art) always shows the face and neck."""
    body, belly, finc, out = PALETTES[name]
    img, d = base_canvas()
    glow(img, SIZE * .46, SIZE * .40, SIZE * .34, finc, 58)
    d = D(img)
    W = lambda f: SIZE * f
    spine = curve([(W(.84), W(.88)), (W(.66), W(.72)), (W(.48), W(.58)), (W(.32), W(.42)), (W(.22), W(.30))])
    rad = lambda t: W(.02) + W(.10) * (1.0 - .45 * t)  # thin tail -> thick neck
    thick_path(d, spine, rad, body + (255,))
    body_outline(d, spine, rad, out + (255,), W(.016))
    # dorsal sail along the back (upper-left edge of the spine)
    fin(d, [(W(.44), W(.48)), (W(.36), W(.26)), (W(.30), W(.40)), (W(.22), W(.18)), (W(.18), W(.32))], finc + (255,), out + (255,), W(.014))
    # tail fan at the bottom (mostly underwater in the peek)
    fin(d, [(W(.80), W(.84)), (W(.97), W(.94)), (W(.94), W(.72))], finc + (255,), out + (255,), W(.014))
    # head at the top, facing left
    head = curve([(W(.04), W(.40)), (W(.03), W(.24)), (W(.13), W(.14)), (W(.28), W(.16)), (W(.34), W(.28)), (W(.28), W(.40)), (W(.14), W(.44))])
    d.polygon(head, fill=body + (255,))
    d.line(head + [head[0]], fill=out + (255,), width=W(.016), joint='curve')
    # snout + horn + whisker
    fin(d, [(W(.05), W(.32)), (W(.005), W(.36)), (W(.06), W(.40))], belly + (255,), out + (255,), W(.012))
    fin(d, [(W(.20), W(.16)), (W(.17), W(.04)), (W(.26), W(.12))], finc + (255,), out + (255,), W(.012))
    d.line([(W(.10), W(.28)), (W(.015), W(.24))], fill=finc + (255,), width=W(.010))
    # jaw stripe
    d.polygon(curve([(W(.04), W(.38)), (W(.12), W(.42)), (W(.26), W(.38)), (W(.28), W(.32))]), fill=belly + (255,))
    eye(d, W(.15), W(.26), W(.032), brow=False)
    if spots:
        for t in (.15, .45, .75):
            x, y = spine[int(t * (len(spine) - 1))]
            glow(img, x, y, W(.035), (140, 220, 255), 200)
            d = D(img)
            d.ellipse((x - W(.014), y - W(.014), x + W(.014), y + W(.014)), fill=(190, 240, 255, 255))
    finish(img, name)


# ------------------------------------------------------------------ sharks
def shark(name, crown=False):
    body, belly, finc, out = PALETTES[name]
    img, d = base_canvas()
    glow(img, SIZE * .5, SIZE * .5, SIZE * .33, finc, 48)
    d = D(img)
    W = lambda f: SIZE * f
    # classic shark silhouette, nose left
    pts = [(W(.06), W(.52)), (W(.20), W(.40)), (W(.44), W(.34)), (W(.66), W(.38)), (W(.82), W(.34)), (W(.96), W(.22)), (W(.94), W(.46)), (W(.80), W(.56)), (W(.58), W(.62)), (W(.34), W(.64)), (W(.16), W(.62))]
    poly = curve(pts)
    d.polygon(poly, fill=body + (255,))
    d.line(poly + [poly[0]], fill=out + (255,), width=W(.016), joint='curve')
    # belly
    d.polygon(curve([(W(.10), W(.58)), (W(.30), W(.60)), (W(.55), W(.58)), (W(.74), W(.52)), (W(.60), W(.62)), (W(.34), W(.64)), (W(.16), W(.62))]), fill=belly + (255,))
    # dorsal fin
    fin(d, [(W(.40), W(.36)), (W(.50), W(.14)), (W(.58), W(.35))], finc + (255,), out + (255,), W(.014))
    # tail fins
    fin(d, [(W(.90), W(.38)), (W(.99), W(.10)), (W(.99), W(.34)), (W(.92), W(.46))], finc + (255,), out + (255,), W(.012))
    fin(d, [(W(.88), W(.48)), (W(.97), W(.62)), (W(.98), W(.48))], finc + (255,), out + (255,), W(.012))
    # side fin
    fin(d, [(W(.30), W(.60)), (W(.26), W(.78)), (W(.40), W(.63))], finc + (255,), out + (255,), W(.012))
    # gills
    for i in range(3):
        x = W(.24 + i * .035)
        d.line([(x, W(.44)), (x - W(.015), W(.56))], fill=out + (255,), width=W(.008))
    # mouth + teeth
    d.line([(W(.08), W(.55)), (W(.18), W(.585))], fill=out + (255,), width=W(.012))
    for i in range(4):
        x = W(.085 + i * .026)
        d.polygon([(x, W(.555 + i * .004)), (x + W(.012), W(.558 + i * .004)), (x + W(.006), W(.575 + i * .004))], fill=(255, 255, 255, 255))
    eye(d, W(.135), W(.465), W(.026), brow=True)
    if crown:
        cx, cy = W(.47), W(.13)
        d.polygon([(cx - W(.05), cy + W(.03)), (cx - W(.05), cy - W(.02)), (cx - W(.025), cy + W(.005)), (cx, cy - W(.04)), (cx + W(.025), cy + W(.005)), (cx + W(.05), cy - W(.02)), (cx + W(.05), cy + W(.03))], fill=(255, 224, 130, 255), outline=None)
        d.line([(cx - W(.05), cy + W(.03)), (cx - W(.05), cy - W(.02)), (cx - W(.025), cy + W(.005)), (cx, cy - W(.04)), (cx + W(.025), cy + W(.005)), (cx + W(.05), cy - W(.02)), (cx + W(.05), cy + W(.03)), (cx - W(.05), cy + W(.03))], fill=out + (255,), width=W(.010), joint='curve')
    finish(img, name)


# ------------------------------------------------------------------- iron crab
def iron_crab():
    body, belly, finc, out = PALETTES['mvp_iron_crab']
    img, d = base_canvas()
    glow(img, SIZE * .5, SIZE * .55, SIZE * .33, finc, 52)
    d = D(img)
    W = lambda f: SIZE * f
    # legs (behind body)
    for i, sx in enumerate((-.30, -.18, .18, .30)):
        for side in (-1, 1):
            x0 = W(.5 + sx * .8), 
            x0 = W(.5 + sx)
            y0 = W(.62)
            d.line([(x0, y0), (x0 + W(sx * .25), W(.80)), (x0 + W(sx * .33), W(.88))], fill=finc + (255,), width=W(.030), joint='curve')
    # claws
    for side in (-1, 1):
        ax = W(.5 + side * .31)
        d.line([(ax, W(.56)), (W(.5 + side * .40), W(.44)), (W(.5 + side * .42), W(.34))], fill=body + (255,), width=W(.055), joint='curve')
        claw = curve([(W(.5 + side * .34), W(.30)), (W(.5 + side * .42), W(.20)), (W(.5 + side * .52), W(.26)), (W(.5 + side * .465), W(.34)), (W(.5 + side * .50), W(.42)), (W(.5 + side * .41), W(.40)), (W(.5 + side * .36), W(.36))])
        d.polygon(claw, fill=belly + (255,))
        d.line(claw + [claw[0]], fill=out + (255,), width=W(.014), joint='curve')
    # shell
    shell = curve([(W(.22), W(.62)), (W(.26), W(.36)), (W(.42), W(.26)), (W(.58), W(.26)), (W(.74), W(.36)), (W(.78), W(.62)), (W(.60), W(.72)), (W(.40), W(.72))])
    d.polygon(shell, fill=body + (255,))
    d.line(shell + [shell[0]], fill=out + (255,), width=W(.018), joint='curve')
    # shell spikes
    for fx in (.32, .5, .68):
        fin(d, [(W(fx - .035), W(.335 if fx != .5 else .27)), (W(fx), W(.17 if fx == .5 else .24)), (W(fx + .035), W(.335 if fx != .5 else .27))], finc + (255,), out + (255,), W(.012))
    # rust plates
    d.line([(W(.32), W(.44)), (W(.68), W(.44))], fill=finc + (255,), width=W(.012))
    d.arc((W(.36), W(.36), W(.64), W(.58)), 20, 160, fill=finc + (255,), width=max(1, int(round(W(.010)))))
    # eyes on stalks
    for side in (-1, 1):
        ex = W(.5 + side * .12)
        d.line([(ex, W(.30)), (ex + W(side * .02), W(.22))], fill=out + (255,), width=W(.014))
        eye(d, ex + W(side * .025), W(.20), W(.026))
    # mouthplate
    d.polygon(curve([(W(.42), W(.72)), (W(.5), W(.78)), (W(.58), W(.72))]), fill=finc + (255,), outline=None)
    finish(img, 'mvp_iron_crab')


# ------------------------------------------------------------------ void maw
def void_maw():
    body, belly, finc, out = PALETTES['mvp_void_maw']
    img, d = base_canvas()
    glow(img, SIZE * .5, SIZE * .46, SIZE * .36, (120, 80, 200), 72)
    d = D(img)
    W = lambda f: SIZE * f
    # tentacles
    for i, (x0, x1, y1) in enumerate([(.30, .16, .86), (.42, .34, .92), (.56, .56, .94), (.68, .76, .88), (.78, .92, .74)]):
        t = curve([(W(x0), W(.58)), (W((x0 + x1) / 2), W(.74)), (W(x1), W(y1))])
        thick_path(d, t, lambda u: W(.052) * (1 - .5 * u), body + (255,))
        body_outline(d, t, lambda u: W(.052) * (1 - .5 * u), out + (255,), W(.012))
        # suckers
        for u in (.45, .75):
            idx = int(u * (len(t) - 1))
            x, y = t[idx]
            d.ellipse((x - W(.011), y - W(.011), x + W(.011), y + W(.011)), fill=belly + (255,))
    # mantle
    mantle = curve([(W(.24), W(.56)), (W(.26), W(.28)), (W(.42), W(.14)), (W(.62), W(.14)), (W(.76), W(.30)), (W(.74), W(.56)), (W(.50), W(.66))])
    d.polygon(mantle, fill=body + (255,))
    d.line(mantle + [mantle[0]], fill=out + (255,), width=W(.018), joint='curve')
    # the maw: glowing grin
    glow(img, W(.49), W(.50), W(.16), (150, 90, 255), 210)
    d = D(img)
    maw = curve([(W(.34), W(.48)), (W(.50), W(.60)), (W(.66), W(.46))])
    d.line(maw, fill=(196, 148, 255, 255), width=W(.030), joint='curve')
    for i in range(5):
        x = W(.36 + i * .062)
        d.polygon([(x, W(.505 + i * .008)), (x + W(.018), W(.512 + i * .008)), (x + W(.009), W(.535 + i * .008))], fill=(228, 200, 255, 255))
    # one big cyan eye
    ex, ey = W(.50), W(.32)
    glow(img, ex, ey, W(.075), (110, 230, 255), 220)
    d = D(img)
    d.ellipse((ex - W(.05), ey - W(.05), ex + W(.05), ey + W(.05)), fill=(18, 40, 48, 255))
    d.ellipse((ex - W(.038), ey - W(.038), ex + W(.038), ey + W(.038)), fill=(126, 232, 255, 255))
    d.ellipse((ex - W(.016), ey - W(.020), ex + W(.016), ey + W(.016)), fill=(10, 26, 34, 255))
    d.ellipse((ex - W(.001), ey - W(.030), ex + W(.014), ey - W(.012)), fill=(240, 255, 255, 255))
    # star specks
    for x, y in ((.30, .24), (.68, .22), (.60, .40)):
        d.line([(W(x) - W(.012), W(y)), (W(x) + W(.012), W(y))], fill=(210, 190, 255, 255), width=W(.006))
        d.line([(W(x), W(y) - W(.012)), (W(x), W(y) + W(.012))], fill=(210, 190, 255, 255), width=W(.006))
    finish(img, 'mvp_void_maw')


def main():
    check = '--check' in sys.argv
    def emit(name, fn):
        path = os.path.join(OUT, name + '.png')
        if check:
            if not os.path.exists(path):
                print('missing', path); sys.exit(1)
            return
        fn()
        data = open(path, 'rb').read()
        print(f"{name}: {len(data)//1024} KiB sha256={hashlib.sha256(data).hexdigest()[:12]}")
    emit('mvp_azure_drake', lambda: drake('mvp_azure_drake'))
    emit('mvp_tide_drake', lambda: drake('mvp_tide_drake'))
    emit('mvp_abyss_drake', lambda: drake('mvp_abyss_drake', spots=True))
    emit('mvp_iron_crab', iron_crab)
    emit('mvp_crimson_shark', lambda: shark('mvp_crimson_shark'))
    emit('mvp_gilded_shark', lambda: shark('mvp_gilded_shark', crown=True))
    emit('mvp_void_maw', void_maw)
    if check:
        print('check-only ok (existence)')


if __name__ == '__main__':
    main()
