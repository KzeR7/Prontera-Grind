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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import montage

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITE_DIR = os.path.join(REPO, 'Sprite')
ASSETS = os.path.join(REPO, 'assets')
# The pack re-seeds from its own last output: unchanged bodies and the shared heads are
# kept as shipped, everything else is rebuilt from Sprite/. (It once seeded from the
# thief-only pack; that file is gone - the shipped pack is the only source now.)
EXISTING = os.path.join(ASSETS, 'sprite_pack_data.js')

CELL = 96                      # body cell size in the atlas
HEAD_SEAT = 3                  # head anchor = stub top row + this (see anchors_for_body)
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

# Classes still waiting for art.  A sheet dropped in Sprite/ is picked up when its
# file name matches the class name ignoring case, spaces, underscores and dots -
# "Lord Knight.png", "lordknight.png" and "lord_knight.png" all work.  The body is
# named after the class in the same normalised form ('lord_knight'), which is how
# index.html looks for it, so no code change is needed when a sheet arrives.
PENDING_CLASSES = ['Merchant',
                   'Knight', 'Lord Knight', 'Wizard', 'High Wizard', 'Hunter',
                   'Sniper', 'Priest', 'High Priest', 'Whitesmith']

# class -> the class it evolves from (mirrors the game's class tree).  When a sheet
# turns out to be a montage, this is how the tool finds the nearest sheet that is in
# the normal one-row-per-direction layout, to rebuild the montage against.
EVOLVES_FROM = {
    'Swordman': 'Novice', 'Knight': 'Swordman', 'Lord Knight': 'Knight',
    'Mage': 'Novice', 'Wizard': 'Mage', 'High Wizard': 'Wizard',
    'Archer': 'Novice', 'Hunter': 'Archer', 'Sniper': 'Hunter',
    'Thief': 'Novice', 'Assassin': 'Thief', 'Assassin Cross': 'Assassin',
    'Acolyte': 'Novice', 'Priest': 'Acolyte', 'High Priest': 'Priest',
    'Merchant': 'Novice', 'Blacksmith': 'Merchant', 'Whitesmith': 'Blacksmith',
}


def norm_key(text):
    """Class name -> pack body name: 'Lord Knight' -> 'lord_knight'."""
    return re.sub(r'[^a-z0-9]+', '_', str(text).lower()).strip('_')


def flat_key(text):
    """Everything but letters and digits removed, for matching file names."""
    return re.sub(r'[^a-z0-9]', '', str(text).lower())


def evolution():
    """EVOLVES_FROM keyed by normalised name, as the tools use class keys."""
    return {norm_key(k): norm_key(v) for k, v in EVOLVES_FROM.items()}


def find_sheet(class_name):
    """Sheet file for a class name, matched loosely; None when it is not there.

    Compared with all spacing and punctuation removed, so 'White Smith.png',
    'whitesmith.png' and 'white_smith.png' all serve the Whitesmith.
    """
    want = flat_key(class_name)
    for fn in sorted(os.listdir(SPRITE_DIR)):
        if not fn.lower().endswith(('.png', '.gif', '.webp')):
            continue
        if flat_key(os.path.splitext(fn)[0]) == want:
            return fn
    return None


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


def _runs(row):
    """[(start, end)] of the contiguous True runs in one row of a boolean mask."""
    out, s = [], None
    for i, v in enumerate(row):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(row) - 1))
    return out


def neck_for(cell, band=3, persist=3, min_width=8):
    """-> (neck_top_y, neck_centre_x) for one body cell, or None.

    The neck is the first row of the body's alpha that is wide *and stays wide*,
    scanning down the middle of the figure.  `min_width` is what keeps the answer
    off the outstretched arms and weapon: a raised sword or a thrown punch is a
    thin run (6-12 px) where the shoulders/neck are 18-30 px.

    The old rule took the topmost row with any pixel at all, so an attack pose
    whose blade or fist reaches above the shoulders pulled the head up with it -
    that is the head "wobbling out from the body" while attacking.
    """
    a = np.array(cell.getchannel('A')) > 8
    H, W = a.shape
    for y in range(H):
        if not a[y].any():
            continue
        ok = True
        for k in range(persist):
            if y + k >= H:
                ok = False
                break
            rr = _runs(a[y + k])
            if not rr or max(e - s + 1 for s, e in rr) < min_width:
                ok = False
                break
        if ok:
            sub = a[y:y + 4, :]
            _, xs = np.where(sub)
            cx = float(xs.mean()) if len(xs) else W / 2.0
            return y, cx
    ys = np.where(a.max(axis=1))[0]
    if not len(ys):
        return None
    return int(ys[0]), W / 2.0


def torso_frame(cell):
    """-> (centre x, reference y) for the body's lower half (hips + legs).

    The head is welded to the *torso*, not to the arms, so the seat is measured
    once per direction against the hips and then only follows the hips through the
    animation.  The lower half is the steadiest part of the silhouette: feet stay
    planted while swords and fists swing past the face.
    """
    a = np.array(cell.getchannel('A')) > 8
    ys = np.where(a.max(axis=1))[0]
    if not len(ys):
        return None
    top, bot = int(ys[0]), int(ys[-1])
    lo = top + int(round((bot - top) * 0.55))
    sub = a[lo:bot + 1, :]
    yy, xs = np.where(sub)
    if not len(xs):
        return None
    return float(np.median(xs)), lo + float(np.mean(yy))


def head_stub(cell, min_width=18, max_height=16):
    """-> (top row, centre x) of the body's own hair/neck stub, or None.

    The seat offset from that top row is HEAD_SEAT below.

    The sheets ship a headless body whose hair stub sits on top of the shoulders.
    The stub is NARROW compared with the shoulders and only a handful of rows tall,
    which is what separates it from an outstretched arm (narrow but long), a raised
    sword (narrow and long) or the shoulders themselves (wide).  It is the only part
    of the silhouette that stays put while a weapon swings past the face.
    """
    a = np.array(cell.getchannel('A')) > 8
    ys = np.where(a.max(axis=1))[0]
    if not len(ys):
        return None
    top, H = int(ys[0]), a.shape[0]
    if not a[top].any() or max(e - s + 1 for s, e in _runs(a[top])) > min_width:
        return None
    y2 = top
    while y2 + 1 < H and a[y2 + 1].any() and max(e - s + 1 for s, e in _runs(a[y2 + 1])) <= min_width:
        y2 += 1
    if (y2 - top) > max_height:
        return None
    xs = np.where(a[top])[0]
    return top, float(np.median(xs))


def anchors_for_body(atlas):
    """anchors[3][8][frames] for a finished body atlas (rebuilt and kept alike).

    Seat rule (2026-10-03, replacing the "topmost pixel" rule):

      * a frame's own hair stub is the seat, and the head is drawn with its bottom
        edge just on top of it - the head rides the real body through the animation;
      * stubs that are outliers for their direction (a blade tip that happens to be
        the topmost thing in the cell) are rejected, and those frames use the same
        stub-to-hips offset as the rest of the direction;
      * x is the stub's own centre - never the whole silhouette's centre of mass -
        so a swing cannot drag the head sideways off the shoulders.

    The old rule took the topmost pixel of the entire silhouette and its centre of
    mass, so a raised sword or fist lifted the head clear off the neck (up to 16 px
    on attack frames) and slid it sideways with the weapon.  That is the reported
    "head wobbles away from the body while attacking".
    """
    out = [[[] for _ in range(8)] for _ in range(3)]
    for d in range(8):
        cells, stubs = {}, {}
        for a in range(3):
            for f in range(FRAMES[a]):
                cells[(a, f)] = atlas.crop((f * CELL, (a * 8 + d) * CELL,
                                            (f + 1) * CELL, (a * 8 + d + 1) * CELL))
                stubs[(a, f)] = head_stub(cells[(a, f)])
        got = [v for v in stubs.values() if v]
        if not got:
            for a in range(3):
                for f in range(FRAMES[a]):
                    out[a][d].append([CELL // 2, 24])
            continue
        med_x = float(np.median([v[1] for v in got]))
        med_y = float(np.median([v[0] for v in got]))
        # drop blade tips: a real stub is near the direction's own head position
        keep = {k: v for k, v in stubs.items()
                if v and abs(v[1] - med_x) <= 14 and abs(v[0] - med_y) <= 20}
        if not keep:
            keep = {k: v for k, v in stubs.items() if v}
        offs = []
        for k, v in keep.items():
            tf = torso_frame(cells[k])
            if tf:
                offs.append(v[0] - tf[1])
        fallback = float(np.median(offs)) if offs else -26.0
        for a in range(3):
            for f in range(FRAMES[a]):
                st = keep.get((a, f))
                if st:
                    # +3 is measured, not guessed: it reproduces the hand-placed anchors
                    # of the shipped thief / assassin pack on every embedded frame
                    out[a][d].append([int(round(st[1])), int(st[0]) + HEAD_SEAT])
                    continue
                tf = torso_frame(cells[(a, f)])
                cx = tf[0] if tf else CELL / 2.0
                hy = tf[1] if tf else 64.0
                out[a][d].append([int(round(cx)), int(round(hy + fallback))])
    return out


def measure_anchors(atlas):
    """Back-compat name used by the kept-body path."""
    return anchors_for_body(atlas)


def layout_problem(rows):
    """Why a sheet cannot be read as a row-per-direction sheet, or None if it can.

    A usable sheet needs at least eight rows and six or more figures on each of the
    walk rows (sheet rows 1..5).  Sheets built by pasting several separate strips
    onto one canvas fail this: their rows either merge into one another or carry a
    whole animation each.
    """
    if len(rows) < 8:
        return 'only %d row(s) of poses; expected 9 (idle + 5 walk + attack)' % len(rows)
    thin = [(i, len(rows[i][2])) for i in range(1, 6) if i < len(rows) and len(rows[i][2]) < 6]
    if thin:
        return 'row %d has only %d figure(s) where a walk cycle needs 6+' % thin[0]
    return None


def reference_sheet(class_name):
    """Nearest sheet up the class line that is a normal sheet (not a montage)."""
    seen, cur = set(), class_name
    while cur and cur not in seen:
        seen.add(cur)
        fn = find_sheet(cur)
        if fn:
            path = os.path.join(SPRITE_DIR, fn)
            try:
                _, rows = sheet_figures(path)
                if not layout_problem(rows):
                    return path
            except Exception:
                pass
        cur = evolution().get(cur)
    return None


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
    # anchors come from the finished atlas: the seat rule needs the whole
    # direction (idle pose included) before it can place any single frame
    anchors = anchors_for_body(atlas)
    return atlas, anchors, missing, borrowed


def data_uri(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


# --------------------------------------------------------- existing pack reuse
def load_existing():
    txt = open(EXISTING).read()
    i = txt.index('window.SPRITE_PACK=')
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
    pack = {k: base[k] for k in ('cellW', 'cellH', 'padL', 'padT', 'pivotX', 'pivotY',
                                 'frames', 'fps', 'hairStyles')}
    pack['bodies'] = dict(base['bodies'])      # every body already in the pack stays as shipped
    pack['heads'] = base['heads']              # heads are shared by every class

    keep = set(pack['bodies']) if '--regenerate' not in sys.argv else set()
    skipped = []
    jobs = list(SHEETS.items()) + [(norm_key(c), (find_sheet(c), norm_key(c))) for c in PENDING_CLASSES]
    for key, (sheet, name) in jobs:
        if only and key not in only and name not in only:
            continue
        if not sheet:
            print('  %-16s no sheet yet in Sprite/ (add %s.png)' % (name, name))
            continue
        if name in keep:
            # art stays exactly as shipped, but the anchors are re-measured with the
            # same rule as the rebuilt bodies so every class animates alike
            atlas = Image.open(io.BytesIO(base64.b64decode(pack['bodies'][name]['atlas'].split(',')[1]))).convert('RGBA')
            old_a = pack['bodies'][name]['anchors']
            new_a = measure_anchors(atlas)
            shift = max(abs(new_a[a][d][f][i] - old_a[a][d][f][i])
                        for a in range(3) for d in range(8) for f in range(FRAMES[a]) for i in (0, 1))
            pack['bodies'][name]['anchors'] = new_a
            print('  %-16s kept as shipped  (anchors re-measured, max shift %d px)' % (name, shift))
            continue
        path = os.path.join(SPRITE_DIR, sheet)
        if not os.path.exists(path):
            print('  ! missing sheet %s' % sheet)
            continue
        im, rows = sheet_figures(path)
        bad = layout_problem(rows)
        note = ''
        if bad:
            # not one row per direction - try rebuilding it against the class line's sheet
            ref = reference_sheet(name)
            if ref:
                rebuilt, rep = montage.rebuild(ref, path)
                if rebuilt is not None:
                    tmp = os.path.join('/tmp', 'rebuilt_%s.png' % name)
                    rebuilt.save(tmp)
                    im, rows = sheet_figures(tmp)
                    note = ('  rebuilt from %s (%d/%d poses, median IoU %.2f)'
                            % (os.path.basename(ref), rep['matched'], rep['poses'], rep['median_iou']))
                    bad = layout_problem(rows)
                else:
                    bad = '%s; rebuild matched only %d/%d poses' % (bad, rep['matched'], rep['poses'])
        if bad:
            print('  %-16s SKIPPED (%s: %s) - montage sheet, not one row per direction'
                  % (name, sheet, bad))
            skipped.append((name, sheet, bad))
            continue
        atlas, anchors, missing, borrowed = build_body(im, rows)
        pack['bodies'][name] = {'atlas': data_uri(atlas), 'anchors': anchors}
        filled = sum(1 for a in anchors for row in a for x in row)
        print('  %-16s rows=%-2d  cells=%d/120  missing=%d  atlas=%dx%d%s%s' % (
            name, len(rows), filled, len(missing), atlas.width, atlas.height,
            ('  borrowed attack rows for dirs %s' % [b[0] for b in borrowed]) if borrowed else '', note))
        if missing:
            print('     gaps: %s%s' % (missing[:6], ' ...' if len(missing) > 6 else ''))

    txt = ('// Class sprite packs for Prontera Grind - generated by tools/make_sprite_pack.py\n'
           '// Body atlas: 8 cols x 24 rows of 96x96. Row = animIdx*8 + dirIdx (idle 1f, walk 8f, attack 6f).\n'
           '// Dirs: S,SW,W,NW,N,NE,E,SE. Head atlas: 8 cols x 19 hair rows of 64x64.\n'
           '// anchors[anim][dir][frame] = [x,y] where the head pivot (32,48) is placed.\n')
    txt += 'window.SPRITE_PACK=%s;\n' % json.dumps(pack, separators=(',', ':'))
    with open(os.path.join(REPO, out), 'w') as f:
        f.write(txt)
    if skipped:
        print('\n  %d sheet(s) skipped as montages - these classes keep their first-job art:' % len(skipped))
        for name, sheet, why in skipped:
            print('    %-15s %s (%s)' % (name, sheet, why))
    print('wrote %s (%.1f MB, %d bodies)' % (out, os.path.getsize(os.path.join(REPO, out)) / 1e6, len(pack['bodies'])))


if __name__ == '__main__':
    main()
