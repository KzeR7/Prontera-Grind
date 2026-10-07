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
WATER = (74, 138, 190)           # water_frame average - the river
DECK = (178, 170, 152)           # the bridge's stone
QUAY = (150, 143, 126)           # the riverbank wall
INK = (30, 34, 42)
TILE_COL = {'grass_jade': GROUND, 'ruin_cobble': COBBLE, 'limestone_pale': KERB,
            'dirt_path': DIRT, 'water_frame_0': WATER, 'water_frame_1': WATER}


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


def shade(hexcol, f):
    return tuple(min(255, int(int(hexcol[i:i + 2], 16) * f)) for i in (1, 3, 5))


def box_faces(b):
    """The six quads of a solid box - the curtain wall, the bridge deck, the banks, the gate towers.
    A sprite-only board cannot show those at all, which is why the wall went missing from it."""
    import math
    cx, cy, cz = b['x'], b['y'] + b['h'] / 2, b['z']
    hw, hh, hd = b['w'] / 2, b['h'] / 2, b['d'] / 2
    ca, sa = math.cos(b.get('ry', 0)), math.sin(b.get('ry', 0))

    def corner(sx, sy, sz):
        x, z = sx * hw, sz * hd
        return (cx + x * ca - z * sa, cy + sy * hh, cz + x * sa + z * ca)

    V = {(i, j, k): corner(i, j, k) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)}
    return [([V[(-1, 1, -1)], V[(1, 1, -1)], V[(1, 1, 1)], V[(-1, 1, 1)]], 1.20),   # top catches the light
            ([V[(1, -1, -1)], V[(1, 1, -1)], V[(1, 1, 1)], V[(1, -1, 1)]], .84),
            ([V[(-1, -1, -1)], V[(-1, 1, -1)], V[(-1, 1, 1)], V[(-1, -1, 1)]], .84),
            ([V[(-1, -1, 1)], V[(-1, 1, 1)], V[(1, 1, 1)], V[(1, -1, 1)]], .95),
            ([V[(-1, -1, -1)], V[(-1, 1, -1)], V[(1, 1, -1)], V[(1, -1, -1)]], .95)]


def ground_tiles(dump, emit):
    """The ground the town really lays down, straight off the dump: the lawn, the plaza and its
    kerb, both halves of the avenue, the side paths and the river. Low to high and big to small, so
    the lawn never buries the plaza and the river always sits on top of the grass."""
    ts = sorted(dump.get('tiles', []), key=lambda t: (t['y'], -max(t['w'], t['h'])))
    for t in ts:
        col = TILE_COL.get(t['tile'], GROUND_D)
        if t.get('r'):
            emit([(t['x'] + px, t['z'] + pz) for px, pz in _circle(t['r'], 64)], col, t['y'])
        else:
            hw, hd = t['w'] / 2, t['h'] / 2
            # the lawn is 150 units across: one quad would have corners behind the camera and be
            # dropped whole, so anything big is laid in patches
            nx = max(1, int(t['w'] // 24)); nz = max(1, int(t['h'] // 24))
            for ix in range(nx):
                for iz in range(nz):
                    x0 = t['x'] - hw + t['w'] * ix / nx; x1 = t['x'] - hw + t['w'] * (ix + 1) / nx
                    z0 = t['z'] - hd + t['h'] * iz / nz; z1 = t['z'] - hd + t['h'] * (iz + 1) / nz
                    emit([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], col, t['y'])


def river_and_bridge(dump, emit):
    """The quay walls down each side of the channel, then the deck arching over them: the same
    segment tops the game builds the bridge from, so the board shows the hump the hero walks over."""
    rv, br = dump.get('river'), dump.get('bridge')
    if rv:
        # the quay runs are CUT where the bridge crosses (the wall continues underneath as the
        # abutment), so the board draws the same two outer runs the game builds - a full-width
        # strip here would draw the very bug the town was fixed for.
        abw = rv['half'] + .45
        for ez in (rv['z0'] - .4, rv['z1'] + .4):
            for sgn in (-1, 1):
                x0, x1 = sgn * abw, sgn * (rv['w'] / 2)
                if x0 > x1: x0, x1 = x1, x0
                emit([(x0, ez - .4), (x1, ez - .4), (x1, ez + .4), (x0, ez + .4)], QUAY, .9)
    if br:
        seg, bl = br['seg'], (br['z1'] - br['z0']) / br['seg']
        for i in range(seg):
            za, zb = br['z0'] + bl * i, br['z0'] + bl * (i + 1)
            emit([(-br['half'] - .45, za), (br['half'] + .45, za),
                  (br['half'] + .45, zb), (-br['half'] - .45, zb)], DECK, br['tops'][i] + .02)
            for sx in (-br['half'] - .3, br['half'] + .3):      # the parapets, a shade darker
                emit([(sx - .25, za), (sx + .25, za), (sx + .25, zb), (sx - .25, zb)], QUAY, br['tops'][i] + .64)


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


def camera_board(man, dump, atlas, camkey='cam', heading='Prontera Town — through the game\u2019s own camera'):
    c = dump[camkey]
    W, H = c['viewW'], c['viewH']
    vp = matmul(mat4(c['proj']), mat4(c['view']))
    board = Image.new('RGBA', (W, H), (26, 30, 38, 255))
    d = ImageDraw.Draw(board)
    R, TZ = dump['plaza']['r'], dump['plaza']['z']

    def poly(pts, color, y=.01):
        px = [project(vp, x, y, z, W, H) for x, z in pts]
        if any(p is None for p in px):
            return
        d.polygon(px, fill=color)

    # --- the ground the town lays down, the river and the bridge over it (all off the dump) ---
    ground_tiles(dump, poly)
    river_and_bridge(dump, poly)
    # --- the contact shadows, exactly what townSprite lays under each building (two flat ellipses
    #     cut from the sprite's width); "the buildings look floating" was this being too weak ---
    shadows = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadows)
    for sp in dump['sprites']:
        w = sp['w']
        # the game's own alphas: the soft penumbra tops out at .34, the tight core at .82
        for sw, sdepth, off, col, blur, a in ((1.22, .44, .05, (24, 18, 10), 0, 76),
                                              (.74, .24, .045, (16, 12, 7), 0, 196)):
            hw, hd = w * sw / 2, w * sdepth / 2
            cz = sp['z'] + w * off
            pts = [(sp['x'] - hw, cz - hd), (sp['x'] + hw, cz - hd), (sp['x'] + hw, cz + hd), (sp['x'] - hw, cz + hd)]
            px = [project(vp, x, .02, z, W, H) for x, z in pts]
            if any(p is None for p in px):
                continue
            x0 = int(min(p[0] for p in px)); x1 = int(max(p[0] for p in px))
            y0 = int(min(p[1] for p in px)); y1 = int(max(p[1] for p in px))
            bw, bh = max(2, x1 - x0), max(2, y1 - y0)
            mask = Image.new('L', (bw, bh), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, bw - 1, bh - 1), fill=a)
            mask = mask.filter(ImageFilter.GaussianBlur(max(3, bw * .09)))
            layer = Image.new('RGBA', (bw, bh), col + (0,))
            layer.putalpha(mask)
            shadows.alpha_composite(layer, (x0, y0))
    board.alpha_composite(shadows)
    # the walkable bound, so it is visible whether anything grows inside it
    b = dump['bound']
    for edge in ([(-b['x0'], b['z0']), (-b['x1'], b['z0'])], [(-b['x1'], b['z0']), (-b['x1'], b['z1'])],
                 [(-b['x1'], b['z1']), (-b['x0'], b['z1'])], [(-b['x0'], b['z1']), (-b['x0'], b['z0'])]):
        px = [project(vp, x, .05, z, W, H) for x, z in edge]
        if all(p is not None for p in px):
            d.line(px, fill=(120, 200, 130, 200), width=2)

    # --- everything that stands up, far to near: billboards and solid boxes in one depth order.
    #   A box is keyed by its nearest corner and a billboard by its own foot, so the curtain wall
    #   never swallows the gate standing in its opening.
    items = []
    for sp in dump['sprites']:
        e = man['sprites'].get(sp['art'])
        if not e:
            continue
        anchor = project(vp, sp['x'], sp.get('y', 0), sp['z'], W, H)
        top = project(vp, sp['x'], sp.get('y', 0) + sp['h'], sp['z'], W, H)
        if not anchor or not top:
            continue
        dist = ((sp['x'] - c['pos'][0]) ** 2 + (sp['z'] - c['pos'][2]) ** 2) ** .5
        items.append((dist, 'sp', sp, e, anchor, top))
    for b in dump.get('boxes', []):
        nx = max(abs(b['x'] - b['w'] / 2 - c['pos'][0]), abs(b['x'] + b['w'] / 2 - c['pos'][0]))
        nz = max(abs(b['z'] - b['d'] / 2 - c['pos'][2]), abs(b['z'] + b['d'] / 2 - c['pos'][2]))
        items.append((min((nx ** 2 + nz ** 2) ** .5, 1e9), 'box', b, None, None, None))
    items.sort(key=lambda r: -r[0])
    for dist, kind, payload, e, anchor, top in items:
        if kind == 'box':
            b = payload
            faces = []
            for pts, f in box_faces(b):
                px = [project(vp, x, y, z, W, H) for x, y, z in pts]
                if any(p is None for p in px):
                    continue
                dd = ((sum(p[0] for p in pts) / 4 - c['pos'][0]) ** 2 +
                      (sum(p[2] for p in pts) / 4 - c['pos'][2]) ** 2)
                faces.append((dd, px, shade(b['c'], f)))
            faces.sort(key=lambda f: -f[0])
            for _dd, px, col in faces:
                d.polygon(px, fill=col)
            continue
        sp = payload
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
    ftitle = load_font(26)
    small = load_font(16)
    d.text((24, 20), heading, font=ftitle, fill=(255, 244, 214))
    d.text((24, 54), 'camera (%.0f, %.0f, %.0f) looking at the plaza centre · fov %d · zoom %.2f · %dx%d'
           % (c['pos'][0], c['pos'][1], c['pos'][2], c['fov'], c['zoom'], W, H), font=small, fill=(196, 206, 220))
    d.text((24, 74), 'every ground tile off the dump, the river and the deck over it · green box = where the hero may walk',
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

    # --- the ground the town lays down: lawn, plaza, kerb, the avenue, the side paths, the river ---
    ground_tiles(dump, lambda pts, color, y=0: ground_poly(pts, color, d))
    # the bridge seen from above: the deck over the water, with the parapets either side
    br = dump.get('bridge')
    if br:
        ground_poly([(-br['half'] - .45, br['z0']), (br['half'] + .45, br['z0']),
                     (br['half'] + .45, br['z1']), (-br['half'] - .45, br['z1'])], DECK, d)
        for sx in (-br['half'] - .3, br['half'] + .3):
            ground_poly([(sx - .25, br['z0']), (sx + .25, br['z0']),
                         (sx + .25, br['z1']), (sx - .25, br['z1'])], QUAY, d)

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
        for sw, sh, a, blur in ((pw * 1.34, pw * .50, 86, 7), (pw * .80, pw * .28, 120, 3)):
            sh_img = Image.new('L', (int(sw), int(sh)), 0)
            sd = ImageDraw.Draw(sh_img)
            sd.ellipse((0, 0, sw - 1, sh - 1), fill=a)
            sh_img = sh_img.filter(ImageFilter.GaussianBlur(blur))
            shadows.append((sx - sw / 2, sy - sh / 2 + pw * .05, sh_img))
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
                     '2:1 orthographic · the real ground tiles, river and bridge', font=small, fill=(196, 206, 220))
    counts = {}
    for s in dump['sprites']:
        counts[s['art']] = counts.get(s['art'], 0) + 1
    legend = ' · '.join('%s×%d' % (k, v) for k, v in sorted(counts.items()))
    d.text((28, 90), legend, font=small, fill=(168, 180, 196))

    board.convert('RGB').save(OUT, 'PNG', optimize=True)
    print('wrote %s (%s · %d sprites placed)' % (os.path.relpath(OUT, ROOT), '%dx%d' % board.size, len(dump['sprites'])))

    views = [('cam', 'board-2-town-camera-view.png',
              'Prontera Town — through the game\u2019s own camera: the square'),
             ('camGate', 'board-3-town-entrance-view.png',
              'Prontera Town — the way in: through the gate, over the bridge, up the avenue')]
    for key, name, title in views:
        if key not in dump:
            continue
        cb = camera_board(man, dump, atlas, key, title)
        out = os.path.join(ROOT, 'Updates', 'town-hd', name)
        cb.convert('RGB').save(out, 'PNG', optimize=True)
        print('wrote %s (%s)' % (os.path.relpath(out, ROOT), '%dx%d' % cb.size))


def _circle(r, n):
    import math
    for i in range(n):
        a = i * 2 * math.pi / n
        yield (math.cos(a) * r, math.sin(a) * r)


if __name__ == '__main__':
    main()
