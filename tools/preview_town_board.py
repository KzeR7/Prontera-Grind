#!/usr/bin/env python3
"""
Town layout boards — what the player's town is made of, drawn from the shipping art.

  python3 tools/preview_town_board.py
    -> Updates/town-hd/board-1-town-layout.png        (plan, 2:1 orthographic)
    -> Updates/town-hd/board-2-town-camera-view.png   (through the game's own camera)

This is NOT a screenshot: there is no browser in this workspace. It is an offline composition of
the REAL atlas (assets/town/town-atlas.json + .png) at the REAL placements (tools/_town_dump.js
reads them out of the running game in jsdom) projected orthographically at 2:1, in the same
back-to-front order the renderer would use. Its job is to answer the questions a screenshot would —
is the ring the right size for the plaza, is the fountain too big, does a lamp sit on top of a
stall, does a house overlap its neighbour — and to give the owner something to look at.

The ground is schematic (flat colours, not the kit tiles), so nothing here should be judged as
"the final look of the floor"; the buildings, fountain, gate, statue and props are the real crops
at their real world sizes.

Run `node tools/_town_dump.js` first (needs `npm i --no-save jsdom three@0.128.0`): it boots the real
game in jsdom, enters the town with the real atlas manifest, and writes every painted sprite's
placement to /tmp/town_placements.json.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PLACE = os.environ.get('TOWN_PLACEMENTS', '/tmp/town_placements.json')
ATLAS = os.path.join(ROOT, 'assets', 'town', 'town-atlas.json')
OUT = os.path.join(ROOT, 'Updates', 'town-hd', 'board-1-town-layout.png')

S = 21.0                 # pixels per world unit on the ground
HZ = 0.92                # how tall a world unit of height is drawn (slightly flattened, like the camera)
W, H = 2560, 1500        # canvas
CX, CY = W // 2, 560                 # where world (0,0) lands on the canvas

GROUND = (108, 156, 88)          # grass_jade average
GROUND_D = (92, 138, 76)
COBBLE = (169, 160, 141)         # ruin_cobble average
KERB = (203, 199, 185)           # limestone_pale average
DIRT = (202, 170, 116)           # dirt_path average
INK = (30, 34, 42)


def load_font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


TZ0 = -6.0                   # the plaza centre (TOWN_Z): the board frames the town, not the origin


def proj(x, z, y=0.0):
    """world -> board pixels (2:1 orthographic), centred on the plaza."""
    return (CX + (x - z) * S, CY + (x + z - 2 * TZ0) * S * 0.5 - y * S * HZ)


def ground_poly(pts, color, draw):
    draw.polygon([proj(x, z) for x, z in pts], fill=color)


def mat4(m):
    """three.js stores matrices column-major as a flat 16 list; return rows for multiplying."""
    return [[m[c * 4 + r] for c in range(4)] for r in range(4)]


def matmul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def project(vp, x, y, z, w, h):
    """world -> pixels through the game's own view-projection matrix, or None behind the camera."""
    v = [x, y, z, 1.0]
    clip = [sum(vp[r][k] * v[k] for k in range(4)) for r in range(4)]
    if clip[3] <= 0.001:
        return None
    return ((clip[0] / clip[3] * .5 + .5) * w, (.5 - clip[1] / clip[3] * .5) * h)


def camera_board(man, dump, atlas):
    c = dump['cam']
    W, H = c['viewW'], c['viewH']
    vp = matmul(mat4(c['proj']), mat4(c['view']))
    board = Image.new('RGBA', (W, H), (26, 30, 38, 255))
    d = ImageDraw.Draw(board)
    R, TZ = dump['plaza']['r'], dump['plaza']['z']

    def poly(pts, color):
        px = [project(vp, x, .01, z, W, H) for x, z in pts]
        if any(p is None for p in px):
            return
        d.polygon(px, fill=color)

    # --- ground (schematic, projected) ---
    poly([(-46, -46), (46, -46), (46, 46), (-46, 46)], (108, 156, 88))
    poly([(cx, cz + TZ) for cx, cz in _circle(R + .45, 64)], KERB)
    poly([(cx, cz + TZ) for cx, cz in _circle(R, 64)], COBBLE)
    poly([(-4.5, 22.5), (4.5, 22.5), (4.5, 7.0), (-4.5, 7.0)], DIRT)
    for cx in (-14.9, 14.9):
        poly([(cx - 1.6, TZ - 10.8), (cx + 1.6, TZ - 10.8), (cx + 1.6, TZ + 10.8), (cx - 1.6, TZ + 10.8)], DIRT)
    poly([(-9.6, -19.4), (9.6, -19.4), (9.6, -13.0), (-9.6, -13.0)], (196, 189, 172))
    # the walkable bound, so it is visible whether anything grows inside it
    b = dump['bound']
    for edge in ([(-b['x0'], b['z0']), (-b['x1'], b['z0'])], [(-b['x1'], b['z0']), (-b['x1'], b['z1'])],
                 [(-b['x1'], b['z1']), (-b['x0'], b['z1'])], [(-b['x0'], b['z1']), (-b['x0'], b['z0'])]):
        px = [project(vp, x, .05, z, W, H) for x, z in edge]
        if all(p is not None for p in px):
            d.line(px, fill=(120, 200, 130, 200), width=2)

    # --- the sprites, far to near (billboards always face the camera) ---
    rows = []
    for sp in dump['sprites']:
        e = man['sprites'].get(sp['art'])
        if not e:
            continue
        anchor = project(vp, sp['x'], sp.get('y', 0), sp['z'], W, H)
        top = project(vp, sp['x'], sp.get('y', 0) + sp['h'], sp['z'], W, H)
        if not anchor or not top:
            continue
        dist = ((sp['x'] - c['pos'][0]) ** 2 + (sp['z'] - c['pos'][2]) ** 2) ** .5
        rows.append((dist, sp, e, anchor, top))
    rows.sort(key=lambda r: -r[0])
    for dist, sp, e, anchor, top in rows:
        ph = max(2, int(round(abs(top[1] - anchor[1]))))
        pw = max(2, int(round(ph * e['w'] / e['h'])))
        crop = atlas.crop((e['x'], e['y'], e['x'] + e['w'], e['y'] + e['h']))
        if sp['flip']:
            crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
        crop = crop.resize((pw, ph), Image.LANCZOS)
        box = (int(round(anchor[0] - pw / 2)), int(round(anchor[1] - ph)))
        if box[0] > W or box[0] + pw < 0 or box[1] > H:
            continue
        board.alpha_composite(crop, box)

    # --- NPC markers + the frame's own caption ---
    f = load_font(17)
    for n in dump['npc']:
        p = project(vp, n['x'], 1.4, n['z'], W, H)
        if not p:
            continue
        d.ellipse((p[0] - 8, p[1] - 8, p[0] + 8, p[1] + 8), fill=(214, 60, 60), outline=(255, 245, 225), width=2)
    title = load_font(26)
    small = load_font(16)
    d.text((24, 20), 'Prontera Town — through the game\u2019s own camera', font=title, fill=(255, 244, 214))
    d.text((24, 54), 'camera (%.0f, %.0f, %.0f) looking at the plaza centre · fov %d · zoom %.2f · %dx%d'
           % (c['pos'][0], c['pos'][1], c['pos'][2], c['fov'], c['zoom'], W, H), font=small, fill=(196, 206, 220))
    d.text((24, 74), 'ground is schematic (the real floors are the kit HD tiles) · green box = where the hero may walk',
           font=small, fill=(168, 180, 196))
    return board


def main():
    if not os.path.exists(PLACE):
        raise SystemExit('missing %s — run: node tools/_town_dump.js' % PLACE)
    man = json.load(open(ATLAS))
    dump = json.load(open(PLACE))
    atlas = Image.open(os.path.join(ROOT, 'assets', 'town', man['meta']['image'])).convert('RGBA')

    board = Image.new('RGBA', (W, H), (26, 30, 38, 255))
    d = ImageDraw.Draw(board)

    # --- the ground, schematic ------------------------------------------------------------------
    R = dump['plaza']['r']
    TZ = dump['plaza']['z']
    ground_poly([(-46, -46), (46, -46), (46, 46), (-46, 46)], GROUND, d)
    # the avenue in from the gate, and the two side paths
    ground_poly([(-4.5, 22.5), (4.5, 22.5), (4.5, 7.0), (-4.5, 7.0)], DIRT, d)
    for cx in (-14.9, 14.9):
        ground_poly([(cx - 1.6, TZ - 10.8), (cx + 1.6, TZ - 10.8),
                     (cx + 1.6, TZ + 10.8), (cx - 1.6, TZ + 10.8)], DIRT, d)
    kerb = [(cx, TZ + cz) for cx, cz in _circle(R + .45, 64)]
    ground_poly(kerb, KERB, d)
    plaza = [(cx, TZ + cz) for cx, cz in _circle(R, 64)]
    ground_poly(plaza, COBBLE, d)
    # the terrace the NPCs stand on, behind the fountain
    ground_poly([(-9.6, -19.4), (9.6, -19.4), (9.6, -13.0), (-9.6, -13.0)], (196, 189, 172), d)

    # --- every painted sprite, back to front ----------------------------------------------------
    rows = []
    for s in dump['sprites']:
        e = man['sprites'].get(s['art'])
        if not e:
            continue
        rows.append((s['x'] + s['z'], s, e))
    rows.sort(key=lambda r: (r[0], -r[2]['h']))

    shadows, pieces = [], []
    for _depth, s, e in rows:
        crop = atlas.crop((e['x'], e['y'], e['x'] + e['w'], e['y'] + e['h']))
        if s['flip']:
            crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
        pw, ph = max(1, round(s['w'] * S)), max(1, round(s['h'] * S))
        crop = crop.resize((pw, ph), Image.LANCZOS)
        x, z, y = s['x'], s['z'], s.get('y', 0)
        sx, sy = proj(x, z, y)
        box = (round(sx - pw / 2), round(sy - ph))
        # the same soft contact shadow the game draws, so the sprite reads as standing on the ground
        sw, sh = pw * 0.9, pw * 0.27
        sh_img = Image.new('L', (int(sw), int(sh)), 0)
        sd = ImageDraw.Draw(sh_img)
        sd.ellipse((0, 0, sw - 1, sh - 1), fill=110)
        sh_img = sh_img.filter(ImageFilter.GaussianBlur(6))
        shadows.append((sx - sw / 2, sy - sh / 2, sh_img))
        pieces.append((box, crop))

    for x, y, sh in shadows:
        board.paste((22, 26, 18), (int(x), int(y)), sh)
    for box, crop in pieces:
        board.alpha_composite(crop, box)

    # --- the NPCs (markers: their art is the class sprite pack, not this atlas) ------------------
    for n in dump['npc']:
        sx, sy = proj(n['x'], n['z'])
        d.ellipse((sx - 9, sy - 9, sx + 9, sy + 9), fill=(214, 60, 60), outline=(255, 245, 225), width=2)
        tag = {'kafra': 'Kafra Elise', 'captain': 'Captain Rondel', 'sister': 'Sister Marina',
               'wren': 'Scholar Wren', 'smith': 'Smith Gordon'}.get(n['id'], n['id'])
        f = load_font(17)
        tw = d.textlength(tag, font=f)
        d.rectangle((sx - tw / 2 - 5, sy + 11, sx + tw / 2 + 5, sy + 33), fill=(0, 0, 0, 170))
        d.text((sx - tw / 2, sy + 13), tag, font=f, fill=(255, 240, 210))

    # --- the town's own name + a legend ---------------------------------------------------------
    title = load_font(30)
    small = load_font(18)
    d.text((28, 24), 'Prontera Town — HD art layout board', font=title, fill=(255, 244, 214))
    d.text((28, 64), 'real atlas crops at the real in-game placements, drawn back to front · '
                     '2:1 orthographic · ground shown schematically', font=small, fill=(196, 206, 220))
    counts = {}
    for s in dump['sprites']:
        counts[s['art']] = counts.get(s['art'], 0) + 1
    legend = ' · '.join('%s×%d' % (k, v) for k, v in sorted(counts.items()))
    d.text((28, 90), legend, font=small, fill=(168, 180, 196))

    board.convert('RGB').save(OUT, 'PNG', optimize=True)
    print('wrote %s (%s · %d sprites placed)' % (os.path.relpath(OUT, ROOT), '%dx%d' % board.size, len(dump['sprites'])))

    if 'cam' in dump:
        cam_board = camera_board(man, dump, atlas)
        OUT2 = os.path.join(ROOT, 'Updates', 'town-hd', 'board-2-town-camera-view.png')
        cam_board.convert('RGB').save(OUT2, 'PNG', optimize=True)
        print('wrote %s (%s)' % (os.path.relpath(OUT2, ROOT), '%dx%d' % cam_board.size))


def _circle(r, n):
    import math
    for i in range(n):
        a = i * 2 * math.pi / n
        yield (math.cos(a) * r, math.sin(a) * r)


if __name__ == '__main__':
    main()
