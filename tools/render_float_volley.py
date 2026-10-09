#!/usr/bin/env python3
"""Render the damage-float volley at two tunings side by side, from the game's own motion math.

    /tmp/venv/bin/python tools/render_float_volley.py
        -> Updates/damage-floats-proposal/volley-before-after-v74.png

This is a RENDERING, not a screenshot: there is no browser in the sandbox, so the picture is
painted here with Pillow from exactly the arithmetic `index.html` runs in its draw loop
(`floats.forEach(...)`). If the two ever disagree, the game is the truth and this script is wrong.
Two honest caveats, both written on the picture itself:

  * the game draws the digits in Trebuchet MS, which is not installed here, so the numbers are
    set in DejaVu Sans Bold (also bold, also a humanist sans, a little wider per glyph);
  * the starburst is the game's polygon maths (12 jittered outer spikes, an 8-spike inner star,
    a pale core), redrawn here rather than rendered from the page's SVG.

The point of the picture is the thing the sliders actually move: how big the digits are, how far
and how fast they travel, when they start to fade, and how hard they punch on spawn.

Settings come from TUNINGS below, which mirrors the tuner page's slider names one for one.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'Updates', 'damage-floats-proposal', 'volley-before-after-v74.png')
SS = 2  # supersample factor: everything is drawn at 2x and resampled down

# --- the two tunings: every field is a tuner-page slider or a value derived from one ------------
TUNINGS = [
    {
        'name': 'BEFORE  ·  v73 / grind-v83.4',
        'picks': '28px / 39px  ·  rise 70px  ·  life 1.75s  ·  fade from 90%  ·  punch x1.9',
        'sNorm': 28, 'sCrit': 39, 'rise': 70, 'life': 1.75, 'fade': .90, 'punch': 1.9, 'spread': 14,
        'rate': .571,
    },
    {
        'name': 'AFTER  ·  v74 / grind-v88.7',
        'picks': '20px / 32px  ·  rise 70px  ·  life 1.15s  ·  fade from 75%  ·  punch x1.5',
        'sNorm': 20, 'sCrit': 32, 'rise': 70, 'life': 1.15, 'fade': .75, 'punch': 1.5, 'spread': 14,
        'rate': .8696,
    },
]

PANEL_W, PANEL_H = 520, 430
PAD = 18
HEADER = 74
FOOTER = 116
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
UI_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def font(path, size):
    return ImageFont.truetype(path, max(6, int(round(size * SS))))


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


# --- the game's motion maths, straight out of index.html ---------------------------------------
def frame(tune, kind, tt, spread=0.0):
    """Return (dx, dy, scale, opacity) for one float at tt = elapsed fraction of its life."""
    r = max(0.0, 1.0 - tt)                                  # f.life, the counter the draw loop uses
    crit = kind == 'crit'
    # sc=1+cs*Math.max(0,1-tt/.2)  with cs = .7*punch on crits and .25*punch on normals
    cs = tune['punch'] * (.7 if crit else .25)
    sway = 10 * (tt / .28) if tt < .28 else 10 - 38 * min(1, (tt - .28) / .72)
    dy = -tune['rise'] * min(1, tt * 1.15)
    dxx = sway + spread
    sc = 1 + cs * max(0, 1 - tt / .2)
    opacity = min(1.0, max(0.0, r / (1 - tune['fade'])))    # r/.1 at v73, r/.25 at v74
    return dxx, dy, sc, opacity


def head_clearance(tune, crit):
    """mobDamageY's clearance above the head, in screen px: half the number's own box + a gap."""
    box = (tune['sCrit'] * 2.5) if crit else (tune['sNorm'] * 1.2)
    return box / 2 + 6


def burst_box(tune, txt):
    """w=Math.max(fs*2,len*fs*.84), h=fs*2.5 - the star is sized from the finished number."""
    fs = tune['sCrit']
    return max(fs * 2, len(txt) * fs * .84), fs * 2.5


# --- drawing helpers ----------------------------------------------------------------------------
def grass(size):
    """The game plays on bright grass, which is where a thin-stroked number has to stay legible."""
    w, h = size
    img = Image.new('RGB', size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=lerp((86, 118, 70), (36, 58, 34), t))
    for i in range(220):        # a little texture, so the panel does not read as a flat swatch
        x = random.randint(0, w - 1); y = random.randint(int(h * .55), h - 1)
        d.point((x, y), fill=(random.randint(52, 96), random.randint(84, 132), random.randint(52, 84)))
    return img.filter(ImageFilter.GaussianBlur(.6))


def draw_mob(d, cx, base_y, scale):
    """A deliberately generic placeholder: the numbers are what is on trial, not the monster."""
    body = (150, 96, 46)
    dark = (78, 49, 19)
    d.ellipse([cx - 15 * scale, base_y - 84 * scale, cx + 15 * scale, base_y - 54 * scale], fill=(232, 200, 122), outline=dark, width=2)
    d.rounded_rectangle([cx - 5 * scale, base_y - 58 * scale, cx + 5 * scale, base_y - 22 * scale], radius=3, fill=body)
    d.rounded_rectangle([cx - 21 * scale, base_y - 46 * scale, cx + 21 * scale, base_y - 38 * scale], radius=4, fill=body)
    d.rounded_rectangle([cx - 23 * scale, base_y - 10 * scale, cx + 23 * scale, base_y], radius=4, fill=dark)


def star_points(cx, cy, w, h, spikes, outer, inner, rot, jitter, rnd):
    pts = []
    for i in range(spikes * 2):
        a = rot + math.pi * i / spikes - math.pi / 2
        r = (inner if i % 2 else outer) * (rnd.uniform(.8, 1.15) if i % 2 == 0 else rnd.uniform(.72, 1.22)) if jitter else (inner if i % 2 else outer)
        pts.append((cx + math.cos(a) * r * w, cy + math.sin(a) * r * h))
    return pts


def draw_burst(img, cx, cy, w, h, tune, alpha, rnd):
    """The v82/v83.3 frame: 12 jittered outer spikes, an 8-spike inner star, a pale core."""
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rw, rh = w / 104.0, h / 104.0     # the game's svg viewBox is -52 -52 104 104
    rot = rnd.uniform(0, math.pi)
    d.polygon(star_points(cx, cy, rw, rh, 12, 48, 30, rot, True, rnd), fill=(160, 22, 8, 255))
    d.polygon(star_points(cx, cy, rw, rh, 8, 34, 20, rot * .6, True, rnd), fill=(255, 207, 77, 255))
    d.ellipse([cx - 12 * rw, cy - 12 * rh, cx + 12 * rw, cy + 12 * rh], fill=(255, 243, 200, 255))
    layer.putalpha(layer.getchannel('A').point(lambda v: int(v * alpha)))
    img.alpha_composite(layer)


def vgrad_text(img, xy, text, fnt, top, bot, opacity, anchor='mm'):
    """The game's crit fill: a cream-to-gold gradient clipped to the glyphs, with a dark rim."""
    dummy = ImageDraw.Draw(img)
    x0, y0, x1, y1 = dummy.textbbox(xy, text, font=fnt, anchor=anchor)
    box = (int(x1 - x0 + 8 * SS), int(y1 - y0 + 8 * SS))
    mask = Image.new('L', box, 0)
    md = ImageDraw.Draw(mask)
    md.text((4 * SS, 4 * SS), text, font=fnt, fill=255, anchor='la', stroke_width=max(1, int(SS)), stroke_fill=255)
    # the tight dark rim (v72): a slightly larger black copy sitting behind the gradient
    rim = mask.filter(ImageFilter.MaxFilter(3))
    grad = Image.new('RGB', box)
    gd = ImageDraw.Draw(grad)
    for y in range(box[1]):
        gd.line([(0, y), (box[0], y)], fill=lerp(top, bot, y / max(1, box[1] - 1)))
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    layer.paste((46, 12, 4, 255), (int(x0 - 4 * SS), int(y0 - 4 * SS)), rim)
    layer.paste(grad, (int(x0 - 4 * SS), int(y0 - 4 * SS)), mask)
    layer.putalpha(layer.getchannel('A').point(lambda v: int(v * opacity)))
    img.alpha_composite(layer)


def plain_text(img, xy, text, fnt, fill, opacity, stroke_fill, stroke_width=.5):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((xy[0], xy[1] + 2 * SS), text, font=fnt, fill=(0, 0, 0, 255), anchor='mm', stroke_width=2 * SS, stroke_fill=(0, 0, 0, 255))
    d.text(xy, text, font=fnt, fill=fill + (255,), anchor='mm', stroke_width=max(1, int(stroke_width * SS)),
           stroke_fill=stroke_fill + (255,))
    layer.putalpha(layer.getchannel('A').point(lambda v: int(v * opacity)))
    img.alpha_composite(layer)


def render_panel(tune, seed=7):
    rnd = random.Random(seed)
    img = grass((PANEL_W * SS, PANEL_H * SS)).convert('RGBA')
    d = ImageDraw.Draw(img)
    ground = int(PANEL_H * SS * .74)
    d.line([(0, ground), (PANEL_W * SS, ground)], fill=(24, 40, 24), width=2 * SS)

    cx = int(PANEL_W * .5 * SS)
    base_y = ground
    draw_mob(d, cx, base_y, 1.15)
    head_y = base_y - 84 * 1.15          # the placeholder's head line, the mobDamageY anchor

    samples = [0.0, .2, .4, .6, .8, 1.0]
    # --- one ordinary hit, then one critical, each sampled along its flight --------------------
    for kind, txt, size, col, stroke in (
        ('hit', '12,480', tune['sNorm'], (255, 240, 166), (75, 53, 20)),
        ('crit', '68,300', tune['sCrit'], (255, 210, 63), (87, 51, 10)),
    ):
        fnt = font(FONT_PATH, size)
        crit = kind == 'crit'
        spawn_y = head_y - head_clearance(tune, crit) * SS
        bw, bh = burst_box(tune, txt) if crit else (0, 0)
        for i, tt in enumerate(samples):
            dx, dy, sc, op = frame(tune, kind, tt)
            if op <= .02 and i:
                continue
            x = cx + dx * SS + (i * 0)          # one column per tuning: the flight reads as a trail
            y = spawn_y + dy * SS
            if crit:
                draw_burst(img, x, y, bw * SS * sc, bh * SS * sc, tune, op * .95, rnd)
                vgrad_text(img, (x, y), txt, font(FONT_PATH, size * sc), (255, 243, 176), (255, 201, 60), op)
            else:
                plain_text(img, (x, y), txt, font(FONT_PATH, size * sc), col, op, stroke)

    # --- three numbers from one volley, to show the 14px spread fanning them out ---------------
    fnt = font(FONT_PATH, tune['sNorm'])
    ys = head_y - head_clearance(tune, False) * SS
    for k, sp in ((0, -tune['spread']), (1, 0), (2, tune['spread'])):
        dx, dy, sc, op = frame(tune, 'hit', .35, spread=sp)
        plain_text(img, (cx + dx * SS + (k - 1) * 46 * SS, ys + dy * SS), '9,240',
                   font(FONT_PATH, tune['sNorm'] * sc), (255, 240, 166), op, (75, 53, 20))
    return img


def main():
    total_w = PAD * 3 + PANEL_W * 2
    total_h = HEADER + PANEL_H + FOOTER
    sheet = Image.new('RGB', (total_w * SS, total_h * SS), (20, 18, 14))
    d = ImageDraw.Draw(sheet)

    d.rectangle([0, 0, total_w * SS, HEADER * SS], fill=(30, 26, 20))
    d.text((PAD * SS, 20 * SS), 'Prontera Grind — damage floats, the same volley at two tunings',
           font=font(FONT_PATH, 21), fill=(233, 211, 154))
    d.text((PAD * SS, 48 * SS),
           'rendered from the game\'s own motion maths (no browser): digits in DejaVu Sans Bold, the game uses Trebuchet MS',
           font=font(UI_PATH, 11), fill=(150, 140, 116))

    for i, tune in enumerate(TUNINGS):
        x = PAD + i * (PANEL_W + PAD)
        d.rectangle([x * SS, HEADER * SS, (x + PANEL_W) * SS, (HEADER + PANEL_H) * SS], outline=(90, 78, 52), width=2 * SS)
        panel = render_panel(tune, seed=7 + i)
        sheet.paste(panel, (x * SS, HEADER * SS))
        d.text(((x + 10) * SS, (HEADER + 10) * SS), tune['name'], font=font(FONT_PATH, 14), fill=(255, 255, 255))
        d.text(((x + 10) * SS, (HEADER + PANEL_H - 26) * SS), tune['picks'], font=font(UI_PATH, 11.5), fill=(20, 16, 12))

        # the same three numbers, one set of arrows, so the two panels can be read against each other
    y0 = (HEADER + PANEL_H + 12) * SS
    for i, tune in enumerate(TUNINGS):
        x = PAD + i * (PANEL_W + PAD)
        d.text((x * SS, y0 + (0 if i == 0 else 34) * SS),
               'life %.2fs  ·  fade over the last %d%%  ·  crit peak x%.2f  ·  ordinary peak x%.3f' % (
                   tune['life'], int(round((1 - tune['fade']) * 100)), 1 + .7 * tune['punch'], 1 + .25 * tune['punch']),
               font=font(UI_PATH, 11.5), fill=(198, 186, 152))
    d.text((PAD * SS, y0 + 58 * SS),
           'what moved: the digits came down (28/39px -> 20/32px, the burst shrank with them), the numbers now live 1.15s instead of 1.75s,\n'
           'the fade starts at 75% of the life instead of 90%, and the spawn punch eased from x1.9 to x1.5. Rise (70px) and spread (14px) unchanged.',
           font=font(UI_PATH, 11.5), fill=(150, 140, 116))

    sheet = sheet.resize((total_w, total_h), Image.LANCZOS)
    sheet.save(OUT)
    print('wrote %s (%dx%d)' % (OUT, total_w, total_h))


if __name__ == '__main__':
    main()
