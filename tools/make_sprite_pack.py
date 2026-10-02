#!/usr/bin/env python3
"""Build Prontera Grind sprite packs from the RO-style class sheets in Sprite/.

Each sheet is 9 rows of poses:
    row 0            idle, first figures
    rows 1..8        walk cycle, one direction per row (dirs 0..7 = S,SW,W,NW,N,NE,E,SE)
    rows 4..8        tail figures (after the walk cycle) = attack, dirs 0..4

Directions 5,6,7 are the horizontal mirrors of 3,2,1 everywhere in this art,
so they are mirrored rather than read from the sheet.

Output matches the layout the game already reads (see index.html pack code):
    body atlas  8 cols x 24 rows of 96x96, row = anim*8 + dir   (anim 0 idle, 1 walk, 2 attack)
    head atlas  8 cols x 19 rows of 64x64 (shared, copied from the existing pack)
    anchors[anim][dir][frame] = [x,y] = where the head pivot (32,48) sits in the cell

usage:  python3 tools/make_sprite_pack.py [--out assets/sprite_pack_data.js]
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image, ImageOps
import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITE_DIR = os.path.join(REPO, 'Sprite')
ASSETS = os.path.join(REPO, 'assets')
EXISTING = os.path.join(ASSETS, 'thief_sprites_data.js')

CELL = 96                      # body cell size in the atlas
FEET_Y = 90                    # baseline: figure bottom sits here in every cell
FRAMES = [1, 8, 6]             # idle, walk, attack

# Sheet anatomy, verified against the shipped thief pack: dirs 5,6,7 are always
# the horizontal mirror of 3,2,1 (the sheets' own rows 6,7,8 are not used for
# walking), walk dirs 0..4 come from sheet rows 1..5, and each attack direction
# takes the poses sitting after the walk cycle on rows 4..8.
IDLE_ROW = 0
IDLE_FIGS = [0, 1, 2, 3, 4]               # dirs 0..4; 5,6,7 are mirrored
WALK_ROW0 = 1                             # walk dir 0 on sheet row 1
ATTACK_ROW0 = 4                           # attack dir 0 on sheet row 4
MIRROR = {5: 3, 6: 2, 7: 1}               # dir -> source dir

# class line -> (sheet file, body name in the pack)
SHEETS = {
    'novice':     ('novice.png',     'novice'),
    'mage':       ('mage.png',       'mage'),
    'archer':     ('archer.png',     'archer'),
    'aco':        ('aco.png',        'aco'),
    'swordman':   ('swordman.png',   'swordman'),
    'blacksmith': ('blacksmith.png', 'blacksmith'),
    'thief':      ('thief.png',      'thief'),
    'assassin':   ('assasin.png',    'assassin'),
    'assassin_cross': ('assasin cross.png', 'assassin_cross'),
}


# --------------------------------------------------------------- sheet reading
def content_runs(v, min_len=4):
    out, s = [], None
    for i, x in enumerate(v):
        if x and s is None:
            s = i
        elif not x and s is not None:
            if i - s >= min_len:
                out.append((s, i - 1))
            s = None
    if s is not None and len(v) - s >= min_len:
        out.append((s, len(v) - 1))
    return out


def sheet_figures(path):
    """-> rows: list of (y0, y1, [(x0, x1), ...]) with figures left to right."""
    im = Image.open(path).convert('RGBA')
    a = np.array(im.getchannel('A'))
    rows = []
    for (y0, y1) in content_runs(a.max(axis=1) > 8, 6):
        sub = a[y0:y1 + 1, :]
        cols = content_runs(sub.max(axis=0) > 8, 4)
        figs = []
        for (x0, x1) in cols:
            c = im.crop((x0, y0, x1 + 1, y1 + 1))
            bb = c.getchannel('A').getbbox()
            if bb:
                figs.append((x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3]))
        rows.append((y0, y1, figs))
    return im, rows


def figure(im, rows, ri, ci):
    if ri >= len(rows) or ri < 0:
        return None
    figs = rows[ri][2]
    if ci >= len(figs) or ci < 0:
        return None
    x0, y0, x1, y1 = figs[ci]
    return im.crop((x0, y0, x1, y1))


# ------------------------------------------------------------------ placement
def pick_scale(fig, limit_w=90, limit_h=88):
    """Uniform scale that keeps a figure inside its cell (never upscales)."""
    w, h = fig.size
    s = min(1.0, limit_w / w, limit_h / h)
    return s


def pasted(fig, scale):
    if scale != 1.0:
        fig = fig.resize((max(1, round(fig.width * scale)), max(1, round(fig.height * scale))), Image.LANCZOS)
    return fig


def cell_bbox(atlas, a, d, f):
    c = atlas.crop((f * CELL, (a * 8 + d) * CELL, (f + 1) * CELL, (a * 8 + d + 1) * CELL))
    return c.getchannel('A').getbbox()


def transfer_anchors(mine, anchors, ref_atlas, ref_anchors):
    """Re-seat anchors onto a reference pack's placement.

    The head only lines up if it sits where the reference art puts it, so each
    reference anchor is shifted by however far this body moved inside its cell
    (bbox centre / top).  Bodies are drawn to the same framing, so this keeps the
    shipped placement where the art matches and follows the body everywhere else.
    """
    out = [[[] for _ in range(8)] for _ in range(3)]
    n = 0
    for a in range(3):
        for d in range(8):
            for f in range(len(anchors[a][d])):
                an = anchors[a][d][f]
                tr = fr = None
                try:
                    tr = ref_anchors[a][d][f]
                except (KeyError, IndexError, TypeError):
                    tr = None
                mb = cell_bbox(mine, a, d, f)
                rb = cell_bbox(ref_atlas, a, d, f)
                if tr and mb and rb:
                    dx = ((mb[0] + mb[2]) / 2) - ((rb[0] + rb[2]) / 2)
                    dy = mb[1] - rb[1]
                    out[a][d].append([int(round(tr[0] + dx)), int(round(tr[1] + dy))])
                    n += 1
                else:
                    out[a][d].append(an)
    return out, n


def anchor_for(cell, y_bias=3):
    """Head anchor for one body cell: neck centre x, shoulder top + bias."""
    a = np.array(cell.getchannel('A'))
    ys = np.where(a.max(axis=1) > 8)[0]
    if not len(ys):
        return None
    top = int(ys[0])
    band = a[top:top + 4, :]
    xs = np.where(band.max(axis=0) > 8)[0]
    cx = int(round((xs[0] + xs[-1]) / 2)) if len(xs) else CELL // 2
    return [cx, top + y_bias]


def attack_indices(row):
    """Frame picks for one attack row: the poses sitting after the walk cycle.

    Rows with 13+ figures hold an 8-frame walk plus 5 attack poses, which the
    shipped pack expands to 6 frames by repeating pose 2.  Rows with 12 hold a
    6-frame walk plus 6 attack poses used as-is.
    """
    n = len(row)
    after = row[8:] if n >= 13 else row[6:]
    if len(after) >= 6:
        return [8 + i if n >= 13 else 6 + i for i in range(6)]
    if len(after) == 5:
        idx = (8 if n >= 13 else 6)
        return [idx, idx + 1, idx + 2, idx + 2, idx + 3, idx + 4]
    idx = max(0, len(row) - 1)
    return [idx] * 6


def build_body(im, rows):
    """-> (atlas image, anchors[3][8][frames])."""
    atlas = Image.new('RGBA', (CELL * 8, CELL * 24), (0, 0, 0, 0))
    anchors = [[[] for _ in range(8)] for _ in range(3)]
    missing = []

    def place(anim, d, f, fig):
        cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        if fig is not None:
            sc = pick_scale(fig)
            fig2 = pasted(fig, sc)
            x = (CELL - fig2.width) // 2
            y = FEET_Y - fig2.height
            cell.alpha_composite(fig2, (max(0, x), max(0, y)))
        atlas.alpha_composite(cell, (f * CELL, (anim * 8 + d) * CELL))
        an = anchor_for(cell)
        anchors[anim][d].append(an if an else [CELL // 2, 24])
        return fig is not None

    borrowed = []
    srcs = {}                       # (anim, dir) -> sheet source, for reporting
    # ---- idle: first figures of the idle row, dirs 5,6,7 mirrored
    for d in range(8):
        src = MIRROR.get(d, d)
        fig = figure(im, rows, IDLE_ROW, IDLE_FIGS[src])
        if fig is not None and d in MIRROR:
            fig = ImageOps.mirror(fig)
        srcs[(0, d)] = ('row%d' % IDLE_ROW, IDLE_FIGS[src], 'mirror' if d in MIRROR else '')
        if not place(0, d, 0, fig):
            missing.append(('idle', d, 0))

    # ---- walk: sheet rows 1..5 for dirs 0..4, dirs 5,6,7 mirrored
    for d in range(8):
        src = MIRROR.get(d, d)
        ri = WALK_ROW0 + src
        for f in range(FRAMES[1]):
            fig = figure(im, rows, ri, f)
            if fig is not None and d in MIRROR:
                fig = ImageOps.mirror(fig)
            if not place(1, d, f, fig):
                missing.append(('walk', d, f))
        srcs[(1, d)] = ('row%d' % ri, '0-7', 'mirror' if d in MIRROR else '')

    # ---- attack: rows 4..8 for dirs 0..4, dirs 5,6,7 mirrored
    have = [ATTACK_ROW0 + k for k in range(5) if ATTACK_ROW0 + k < len(rows)]
    for d in range(8):
        src = MIRROR.get(d, d)
        ri = ATTACK_ROW0 + src
        if ri not in have:                 # sheet is one row short: borrow the nearest
            ri = min(have, key=lambda r: abs(r - ri)) if have else ri
            borrowed.append((d, ri))
        idx = attack_indices(rows[ri][2]) if ri < len(rows) else [0] * 6
        for f in range(FRAMES[2]):
            ci = idx[f] if f < len(idx) else idx[-1]
            fig = figure(im, rows, ri, ci)
            if fig is not None and d in MIRROR:
                fig = ImageOps.mirror(fig)
            if not place(2, d, f, fig):
                missing.append(('attack', d, f))
        srcs[(2, d)] = ('row%d' % ri, idx, 'mirror' if d in MIRROR else '')
    return atlas, anchors, missing, borrowed


def data_uri(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


# --------------------------------------------------------- existing pack reuse
def load_existing():
    txt = open(EXISTING).read()
    i = txt.index('window.THIEF_PACK=')
    j = txt.index('{', i)
    depth = 0
    for k in range(j, len(txt)):
        if txt[k] == '{':
            depth += 1
        elif txt[k] == '}':
            depth -= 1
            if depth == 0:
                break
    body = txt[j:k + 1]
    body = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', body)
    return json.loads(body)


def main():
    out = 'assets/sprite_pack_data.js'
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1].split(',')

    base = load_existing()
    ref_atlas = Image.open(io.BytesIO(base64.b64decode(base['bodies']['thief']['atlas'].split(',')[1]))).convert('RGBA')
    ref_anchors = base['bodies']['thief']['anchors']
    pack = {k: base[k] for k in ('cellW', 'cellH', 'padL', 'padT', 'pivotX', 'pivotY',
                                 'frames', 'fps', 'hairStyles')}
    pack['bodies'] = dict(base['bodies'])      # keep thief / assassin / assassin cross as shipped
    pack['heads'] = base['heads']              # heads are shared by every class

    keep = set(pack['bodies']) if '--regenerate' not in sys.argv else set()
    for key, (sheet, name) in SHEETS.items():
        if only and key not in only:
            continue
        if name in keep:
            print('  %-16s kept as shipped' % name)
            continue
        path = os.path.join(SPRITE_DIR, sheet)
        if not os.path.exists(path):
            print('  ! missing sheet %s' % sheet)
            continue
        im, rows = sheet_figures(path)
        atlas, est_anchors, missing, borrowed = build_body(im, rows)
        anchors, n = transfer_anchors(atlas, est_anchors, ref_atlas, ref_anchors)
        pack['bodies'][name] = {'atlas': data_uri(atlas), 'anchors': anchors}
        filled = sum(1 for a in anchors for row in a for x in row)
        print('  %-16s rows=%-2d  cells=%d/120  missing=%d  anchors re-seated=%d  atlas=%dx%d%s' % (
            name, len(rows), filled, len(missing), n, atlas.width, atlas.height,
            ('  borrowed attack rows for dirs %s' % [b[0] for b in borrowed]) if borrowed else ''))
        if missing:
            print('     gaps: %s%s' % (missing[:6], ' ...' if len(missing) > 6 else ''))

    txt = ('// Class sprite packs for Prontera Grind - generated by tools/make_sprite_pack.py\n'
           '// Body atlas: 8 cols x 24 rows of 96x96. Row = animIdx*8 + dirIdx (idle 1f, walk 8f, attack 6f).\n'
           '// Dirs: S,SW,W,NW,N,NE,E,SE. Head atlas: 8 cols x 19 hair rows of 64x64.\n'
           '// anchors[anim][dir][frame] = [x,y] where the head pivot (32,48) is placed.\n')
    txt += 'window.SPRITE_PACK=%s;\n' % json.dumps(pack, separators=(',', ':'))
    with open(os.path.join(REPO, out), 'w') as f:
        f.write(txt)
    print('wrote %s (%.1f MB, %d bodies)' % (out, os.path.getsize(os.path.join(REPO, out)) / 1e6, len(pack['bodies'])))


if __name__ == '__main__':
    main()
