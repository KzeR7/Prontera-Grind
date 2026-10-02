#!/usr/bin/env python3
"""Import an EXTERNAL sprite sheet (PNG) into the Prontera Grind atlas format.

The game reads 512x960 atlases: 8 columns (view directions) x 10 rows of
64x96 cells.  Row order is IDLE(2) + WALK(4) + ATK(4) -- see tools/spr_core.py.

This tool takes a hand-made / ripped sheet (any grid, any cell size), cuts the
figures out, normalises every figure into a 64x96 cell, and writes both the
PNG and the data-URI entry inside assets/sprites_data.js.

usage
-----
  # 1. look at what the sheet contains
  python3 import_sheet.py inspect sheet.png

  # 2. build atlases from a mapping file
  python3 import_sheet.py build sheet.png mapping.json

mapping.json
------------
  {
    "mode": "body",              # 'body' = outfit + the game's 2 heads
    "out":  {"thief_m": "assets/hero_thief_m.png"},
    "keys": ["hero:thief_m"],
    "remove": ["herobody:thief_m", "herohead:spiky_m"],   # optional
    "sheet": [[7,0,1,2,3,4,5,6], ...],   # per game row: source figure indices
    "cells": [3, 2, 5, 4, 9, 8, 7, 6, 1, 0]               # optional ordering aid
  }

`sheet` is the important one: one entry per game row (10 rows, top to bottom).
Each entry is a list of 8 source figure indices (by id from `inspect`), one per
view direction.  Use -1 for an empty cell.
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image, ImageChops

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(REPO, 'assets')
SPR = os.path.join(REPO, 'tools')
sys.path.insert(0, SPR)

CELL_W, CELL_H = 64, 96
DIRS, ROWS = 8, 10
ATLAS_W, ATLAS_H = CELL_W * DIRS, CELL_H * ROWS


# ---------------------------------------------------------------- background
def keyed_out(im, tol=18):
    """Turn a flat background colour (corner sampled) into transparency.

    PNGs that already carry an alpha channel are left alone.
    """
    if im.mode == 'RGBA' and im.getchannel('A').getextrema()[0] < 255:
        return im, None
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = max(set(corners), key=corners.count)[:3]
    solid = Image.new('RGB', (w, h), bg)
    r, g, b = ImageChops.difference(im.convert('RGB'), solid).split()
    # key out only pixels whose *worst* channel is close to the background
    worst = ImageChops.lighter(ImageChops.lighter(r, g), b)
    mask = worst.point(lambda v: 0 if v <= tol else 255)
    im.putalpha(ImageChops.darker(im.getchannel('A'), mask))
    return im, bg


# ------------------------------------------------------------------- figures
def find_figures(im, min_px=30):
    """Find sprite figures as bounding boxes, row-major.

    Uses a connected-component pass over the alpha mask (8-connected), which
    copes with sheets that are NOT on a uniform grid (RO sheets often pack a
    left block of 8 dirs and a right block of fewer columns).
    """
    w, h = im.size
    a = im.getchannel('A').load()
    seen = bytearray(w * h)
    boxes = []
    for y0 in range(h):
        for x0 in range(w):
            i = y0 * w + x0
            if seen[i] or a[x0, y0] <= 8:
                continue
            # flood fill (explicit stack, 8-connected)
            stack = [(x0, y0)]
            seen[i] = 1
            minx = maxx = x0
            miny = maxy = y0
            n = 0
            while stack:
                x, y = stack.pop()
                n += 1
                if x < minx:
                    minx = x
                elif x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                elif y > maxy:
                    maxy = y
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            j = ny * w + nx
                            if not seen[j] and a[nx, ny] > 8:
                                seen[j] = 1
                                stack.append((nx, ny))
            if n >= min_px:
                boxes.append((minx, miny, maxx + 1, maxy + 1))

    # merge boxes that overlap heavily (limbs drawn separately, weapon parts)
    boxes = merge_boxes(boxes)
    boxes = cluster_rows(boxes)
    return boxes


def stacked(a, b, min_overlap=0.35, max_vgap=20):
    """True when two boxes are parts of one figure stacked vertically.

    RO-style art often draws the head as a separate mass floating just above
    the shoulders.  Such pieces overlap heavily in x and are a short vertical
    hop apart -- unlike two neighbours in the same row, which sit side by side.
    """
    a, b = (a, b) if a[1] <= b[1] else (b, a)          # a above b
    vgap = b[1] - a[3]
    if vgap > max_vgap:
        return False
    ox = min(a[2], b[2]) - max(a[0], b[0])
    if ox <= 0:
        return False
    narrow = min(a[2] - a[0], b[2] - b[0])
    return ox >= min_overlap * narrow


def merge_boxes(boxes, gap=4):
    """Union boxes that belong to the same figure (touching or stacked)."""
    changed = True
    while changed:
        changed = False
        out = []
        while boxes:
            b = boxes.pop()
            for i, o in enumerate(out):
                if near(b, o, gap) or stacked(b, o):
                    out[i] = (min(b[0], o[0]), min(b[1], o[1]), max(b[2], o[2]), max(b[3], o[3]))
                    changed = True
                    break
            else:
                out.append(b)
        boxes = out
    return boxes


def near(a, b, gap):
    return not (a[2] + gap < b[0] or b[2] + gap < a[0] or a[3] + gap < b[1] or b[3] + gap < a[1])


def cluster_rows(boxes, tol=12):
    """Sort into reading order: rows by vertical centre, then left to right."""
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], []
    for b in boxes:
        if not cur:
            cur = [b]
            continue
        cy = (b[1] + b[3]) / 2
        ref = sum((x[1] + x[3]) / 2 for x in cur) / len(cur)
        if abs(cy - ref) <= tol:
            cur.append(b)
        else:
            rows.append(glue(cur))
            cur = [b]
    if cur:
        rows.append(glue(cur))
    return [r for r in rows if r]


def glue(row, gap=2):
    """Re-join fragments that sit side by side inside one sheet row.

    A sprite whose artwork contains near-background colours can split into two
    components; if their x-ranges overlap they belong to the same figure.
    """
    row = sorted(row, key=lambda b: b[0])
    out = []
    for b in row:
        if out and b[0] <= out[-1][2] + gap:
            o = out[-1]
            out[-1] = (min(b[0], o[0]), min(b[1], o[1]), max(b[2], o[2]), max(b[3], o[3]))
        else:
            out.append(b)
    # drop specks that are far smaller than the typical figure in this row
    if len(out) > 2:
        areas = sorted((b[2] - b[0]) * (b[3] - b[1]) for b in out)
        med = areas[len(areas) // 2]
        out = [b for b in out if (b[2] - b[0]) * (b[3] - b[1]) >= med * 0.2]
    return out


def flatten(rows):
    return [b for r in rows for b in r]


# ------------------------------------------------------------------ placing
def pick_block(row, dirs=DIRS):
    """Choose `dirs` figures from one detected sheet row.

    Sheets usually pack the 8 view directions in a contiguous left block and
    extra poses (attack / death / other rows) to the right.  Split the row at
    its widest horizontal gap and keep whichever side holds exactly `dirs`.
    """
    if len(row) <= dirs:
        return list(range(len(row)))
    gaps = [(row[i + 1][0] - row[i][2], i) for i in range(len(row) - 1)]
    _, i = max(gaps)
    if i + 1 == dirs:
        return list(range(dirs))
    if len(row) - (i + 1) == dirs:
        return list(range(i + 1, len(row)))
    return list(range(dirs))


def auto_rows(rows_boxes, dirs=DIRS, row_map=None):
    """-> per game row, the global figure indices to crop, or [] to leave blank."""
    offsets, total = [], 0
    for r in rows_boxes:
        offsets.append(total)
        total += len(r)
    out = []
    for r in range(ROWS):
        src = r if row_map is None else row_map[r]
        if src is None or src >= len(rows_boxes) or not rows_boxes[src]:
            out.append([])
            continue
        out.append([offsets[src] + p for p in pick_block(rows_boxes[src], dirs)])
    return out


def apply_dir_order(idxs, order):
    """Re-order the 8 crops, e.g. 'reverse' when the sheet faces the other way."""
    if not order or not idxs:
        return idxs
    if order == 'reverse':
        order = list(range(len(idxs)))[::-1]
    if order == 'shift4':
        order = (list(range(len(idxs)))[4:] + list(range(4)))
    return [idxs[o] if o < len(idxs) else None for o in order]


def fit_cell(im, box, resample='lanczos', maxw=60, maxh=90):
    """Cut a figure out and place it in a 64x96 cell, feet near the bottom."""
    fig = im.crop(box)
    fw, fh = fig.size
    sc = min(maxw / fw, maxh / fh)
    nw, nh = max(1, round(fw * sc)), max(1, round(fh * sc))
    res = {'lanczos': Image.LANCZOS, 'nearest': Image.NEAREST, 'box': Image.BOX}[resample]
    fig = fig.resize((nw, nh), res)
    cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    x, y = (CELL_W - nw) // 2, CELL_H - 7 - nh
    cell.alpha_composite(fig, (x, y))
    return cell, (x, y, nw, nh)


def _unused_head_window(refs, pad=1):
    """Union alpha bbox (in cell coords) of the reference head atlases.

    Anything the heads cover gets erased from a full-body import so the game
    can composite its own heads (spiky_m / ponytail_f) on top.
    """
    x0 = y0 = 10 ** 6
    x1 = y1 = -1
    for ref in refs:
        im = Image.open(os.path.join(REPO, ref) if not os.path.isabs(ref) else ref).convert('RGBA')
        for r in range(ROWS):
            for c in range(DIRS):
                bb = im.crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H)).getbbox()
                if not bb:
                    continue
                x0, y0 = min(x0, bb[0]), min(y0, bb[1])
                x1, y1 = max(x1, bb[2]), max(y1, bb[3])
    return (max(0, x0 - pad), max(0, y0 - pad), min(CELL_W, x1 + pad), min(CELL_H, y1 + pad))


# Where the head sits inside a figure, measured from the game's own art
# (hero_thief_m vs herohead_spiky_m): the head is the top ~33% of the figure's
# height and reaches the full width in profile views, where hair sweeps out.
# Two bands: a full-width strip for hair/ears, and an inset band that stops
# short of the shoulders so a held weapon is not clipped.
DEFAULT_HEAD_BLANK = [
    {'x': 'full', 'y': [0.00, 0.24]},
    {'x': [0.10, 0.90], 'y': [0.24, 0.44]},
]


def blank_rects(box, specs):
    """Turn fractional head bands into cell-pixel rectangles for one figure.

    `box` is where fit_cell placed the figure: (x, y, w, h).  Fractions are of
    that box, so they survive any import scale.
    """
    x, y, w, h = box
    rects = []
    for spec in specs:
        pad = spec.get('pad', 1)
        xr = spec.get('x', 'full')
        y0, y1 = spec['y']
        px0 = x if xr == 'full' else x + xr[0] * w
        px1 = (x + w) if xr == 'full' else x + xr[1] * w
        rects.append((max(0, int(round(px0)) - pad), max(0, int(round(y + y0 * h)) - pad),
                      min(CELL_W, int(round(px1)) + pad), min(CELL_H, int(round(y + y1 * h)) + pad)))
    return rects


HEAD_REFS = ['assets/herohead_spiky_m.png', 'assets/herohead_ponytail_f.png']


def head_metrics(refs=HEAD_REFS):
    """Measure where the game's own heads sit inside a 64x96 cell.

    Returns (height, bottom, centre) as medians over every reference cell, so
    an imported head can be dropped exactly on the body's neck line.
    """
    hs, bots, cxs = [], [], []
    for ref in refs:
        path = ref if os.path.isabs(ref) else os.path.join(REPO, ref)
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGBA')
        for r in range(ROWS):
            for c in range(DIRS):
                bb = im.crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H)).getbbox()
                if not bb:
                    continue
                hs.append(bb[3] - bb[1])
                bots.append(bb[3])
                cxs.append((bb[0] + bb[2]) / 2)
    if not hs:
        return 22, 43, 32
    hs.sort(); bots.sort(); cxs.sort()
    mid = len(hs) // 2
    return hs[mid], bots[mid], round(cxs[mid])


def build_head_atlas(im, rows_boxes, map_rows, resample='lanczos', fill='repeat',
                     target_h=None, bottom=None, center=None, scale=1.0):
    """Pack head crops into the game's atlas layout.

    Heads are anchored, not stretched to fill: each crop is scaled so its
    height matches the reference heads (spiky_m / ponytail_f) and dropped so
    its bottom edge meets the body's neck line.
    """
    if target_h is None or bottom is None or center is None:
        ch, cb, cc = head_metrics()
        target_h = target_h or ch
        bottom = bottom or cb
        center = center if center is not None else cc
    print('head anchor: height=%s bottom=%s centre=%s scale=%s' % (target_h, bottom, center, scale))
    atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    flat = flatten(rows_boxes)
    if map_rows == 'auto' or isinstance(map_rows, dict):
        row_map = map_rows.get('row_map') if isinstance(map_rows, dict) else None
        order = map_rows.get('dir_order') if isinstance(map_rows, dict) else None
        map_rows = auto_rows(rows_boxes, DIRS, row_map)
        if order:
            map_rows = [apply_dir_order(r, order) for r in map_rows]
    last = None
    for row in range(ROWS):
        idxs = map_rows[row] if row < len(map_rows) else []
        if not idxs and fill == 'repeat' and last:
            idxs = last
        elif idxs:
            last = idxs
        for d in range(DIRS):
            if d >= len(idxs) or idxs[d] is None or idxs[d] < 0:
                continue
            fig = im.crop(flat[idxs[d]])
            fw, fh = fig.size
            sc = (target_h / fh) * scale
            nw, nh = max(1, round(fw * sc)), max(1, round(fh * sc))
            res = {'lanczos': Image.LANCZOS, 'nearest': Image.NEAREST, 'box': Image.BOX}[resample]
            fig = fig.resize((nw, nh), res)
            x = int(round(center - nw / 2))
            y = int(round(bottom - nh))
            atlas.alpha_composite(fig, (d * CELL_W + max(0, x), row * CELL_H + max(0, y)))
    return atlas


def build_atlas(im, rows_boxes, map_rows, resample='lanczos', fill='repeat', blank=None):
    atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    flat = flatten(rows_boxes)
    if map_rows == 'auto' or isinstance(map_rows, dict):
        row_map = map_rows.get('row_map') if isinstance(map_rows, dict) else None
        order = map_rows.get('dir_order') if isinstance(map_rows, dict) else None
        map_rows = auto_rows(rows_boxes, DIRS, row_map)
        if order:
            map_rows = [apply_dir_order(r, order) for r in map_rows]
    last = None
    for row in range(ROWS):
        idxs = map_rows[row] if row < len(map_rows) else []
        if not idxs and fill == 'repeat' and last:
            idxs = last          # sheet has no art for this animation: reuse
        elif idxs:
            last = idxs
        for d in range(DIRS):
            if d >= len(idxs) or idxs[d] is None or idxs[d] < 0:
                continue
            cell, box = fit_cell(im, flat[idxs[d]], resample)
            for rect in blank_rects(box, blank or []):
                cell.paste((0, 0, 0, 0), rect)
            atlas.alpha_composite(cell, (d * CELL_W, row * CELL_H))
    return atlas


# -------------------------------------------------------------- sprites_data
def data_uri(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def patch_js(new_entries, remove=(), custom=None):
    """Rewrite assets/sprites_data.js keeping every other atlas untouched."""
    js = os.path.join(ASSETS, 'sprites_data.js')
    txt = open(js).read()
    m = re.search(r'window\.SPRITE_ATLASES=(\{.*\});\s*$', txt, re.S)
    if not m:
        raise SystemExit('cannot parse %s' % js)
    data = json.loads(m.group(1))
    added = []
    for k, v in new_entries.items():
        data[k] = v
        added.append(k)
    for k in remove:
        if data.pop(k, None) is not None:
            added.append('-' + k)
    cur = []
    m2 = re.search(r'window\.CUSTOM_HEROES=(\[[^\]]*\]);', txt)
    if m2:
        cur = json.loads(m2.group(1))
    for k in custom or []:
        if k not in cur:
            cur.append(k)
    for k in remove:
        key = k.replace('herobody:', 'hero:')
        if key not in new_entries and key in cur:   # keep keys we just shipped
            cur.remove(key)
    with open(js, 'w') as f:
        f.write('// generated by tools/build_atlas.py - do not edit\n')
        f.write('window.SPRITE_ATLASES=%s;\n' % json.dumps(data, separators=(',', ':')))
        f.write('window.CUSTOM_HEROES=%s;\n' % json.dumps(cur, separators=(',', ':')))
    return added, len(data)


# --------------------------------------------------------------------- cli
def cmd_inspect(path):
    im = Image.open(path)
    print('file        : %s  %s %s' % (path, im.size, im.mode))
    im2, bg = keyed_out(im)
    print('background  : rgb%s' % (bg,))
    rows = find_figures(im2)
    print('figures     : %d in %d rows' % (sum(len(r) for r in rows), len(rows)))
    n = 0
    for ri, r in enumerate(rows):
        info = []
        for b in r:
            info.append('#%d %dx%d@%d,%d' % (n, b[2] - b[0], b[3] - b[1], b[0], b[1]))
            n += 1
        print('  row %2d (%2d): %s' % (ri, len(r), '  '.join(info)))
    return rows


# Ready-made delivery modes.  'body' keeps the game's layered look (your
# outfit + the two existing heads); 'full' ships your whole figure and retires
# the layered pair, so nobody's head is pasted on top.
MODES = {
    'body': {'blank_head': 'auto', 'remove': [],
             'keys': ['herobody:thief_m', 'herobody:thief_f']},
    'full': {'blank_head': False, 'remove': ['herobody:thief_m', 'herobody:thief_f'],
             'keys': ['hero:thief_m', 'hero:thief_f'], 'custom': True},
}


def cmd_build(path, mapping):
    mode = mapping.get('mode')
    if mode:
        if mode not in MODES and mode != 'head':
            raise SystemExit('unknown mode %r (use %s/head)' % (mode, '/'.join(MODES)))
        cfg = dict(MODES.get(mode, {}))
        for k, v in mapping.items():
            if k != 'mode' and k in ('keys', 'remove', 'blank_head', 'custom'):
                cfg[k] = v
        mapping = dict(mapping, **cfg)
        print('mode %s -> keys %s%s' % (mode, cfg['keys'],
              (' ; retiring ' + ', '.join(cfg.get('remove', []))) if cfg.get('remove') else ''))
    im = Image.open(path)
    im, bg = keyed_out(im)
    boxes = find_figures(im)
    resample = mapping.get('resample', 'lanczos')
    entries = {}
    pairs = []                                  # (atlas name, output path, suffix)
    for name, out in mapping['out'].items():
        pairs.append((name, out, None))
        alt = (mapping.get('also_out') or {}).get(name)
        if alt:
            pairs.append((name, alt, '_f' if not out.endswith('_f.png') else '_m'))
    for name, out, suffix in pairs:
        spec = mapping['sheet'][name] if isinstance(mapping['sheet'], dict) else mapping['sheet']
        blank = None
        bh = mapping.get('blank_head', 'auto')
        if bh == 'auto':
            blank = DEFAULT_HEAD_BLANK
            print('head swapped: blanking %d band(s) of each figure' % len(blank))
        elif bh is False:
            print('head kept: your sprite keeps its own head/hood')
        elif isinstance(bh, list):
            blank = bh
        if mode == 'head' or mapping.get('head_layout'):
            atlas = build_head_atlas(im, boxes, spec, resample, mapping.get('fill', 'repeat'),
                                     mapping.get('head_h'), mapping.get('head_bottom'),
                                     mapping.get('head_center'), mapping.get('head_scale', 1.0))
        else:
            atlas = build_atlas(im, boxes, spec, resample, mapping.get('fill', 'repeat'), blank)
        outp = os.path.join(REPO, out)
        atlas.save(outp, optimize=True)
        size = os.path.getsize(outp)
        print('wrote %s %s  %d KB' % (out, atlas.size, size // 1024))
        for key in mapping.get('keys', []):
            k = key % name if '%s' in key else key
            if suffix:
                k = k[:-2] + suffix          # _m <-> _f
            entries[k] = data_uri(atlas)
    if mapping.get('patch', True):
        custom = list(entries) if (mode == 'full' or mapping.get('custom')) else []
        added, total = patch_js(entries, mapping.get('remove', []), custom)
        print('sprites_data.js: %s (now %d atlases)' % (', '.join(added), total))
    else:
        print('sprites_data.js: left untouched (patch=false)')


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == 'inspect':
        cmd_inspect(sys.argv[2])
    elif cmd == 'build':
        mapping = json.load(open(sys.argv[3]))
        cmd_build(sys.argv[2], mapping)
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
