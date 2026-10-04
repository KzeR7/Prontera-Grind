#!/usr/bin/env python3
"""Build the data file behind tools/sprite_picker.html.

The picker is the owner's workbook for redoing the class sprites: it shows every
pose sitting in every sheet in Sprite/, labels the pose this tool *thinks* it is
(animation, direction, frame), measures where the head sits on it, and lets the
owner tick the poses that should fill the game's 8 camera views x 3 animations.

Nothing here changes the game or the pack. It only reads the sheets and writes
tools/sprite_picker_data.js (plus a QC contact sheet in /tmp when asked).

usage:  python3 tools/make_sprite_picker.py [--qc /tmp/picker_qc.png]
"""
import base64
import io
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sprite_pack as m                                   # noqa: E402
import montage                                                 # noqa: E402

REPO = m.REPO
OUT = os.path.join(REPO, 'tools', 'sprite_picker_data.js')

# the game's own packed-cell geometry (index.html packTex): body cell 96x96 is
# drawn into a 126x134 cell at (padL,padT) and the head 64x64 at anchor-(32,48)
CELL_W, CELL_H, PAD_L, PAD_T, FEET_Y, BODY = 126, 134, 15, 38, 90, 96

DIRS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']            # game dir order
ANIM = ['idle', 'walk', 'attack']

# Every class the game shows, in tree order, with the sheet the pipeline reads.
CLASSES = [
    'Novice', 'Swordman', 'Mage', 'Archer', 'Acolyte', 'Thief', 'Merchant',
    'Knight', 'Lord Knight', 'Wizard', 'High Wizard', 'Hunter', 'Sniper',
    'Priest', 'High Priest', 'Blacksmith', 'Whitesmith', 'Assassin',
    'Assassin Cross',
]
# aco / assasin / assasin cross file names do not normalise to the class name
EXTRA_SHEETS = {'Acolyte': 'aco.png', 'Assassin': 'assasin.png',
                'Assassin Cross': 'assasin cross.png'}


def sheet_path(class_name):
    if class_name in EXTRA_SHEETS:
        return os.path.join(m.SPRITE_DIR, EXTRA_SHEETS[class_name])
    fn = m.find_sheet(class_name)
    return os.path.join(m.SPRITE_DIR, fn) if fn else None


def components(alpha, min_px=120):
    """Pose boxes from the connected parts of one sheet (montages included).

    Montage sheets paste whole strips onto one canvas, so the row/column reader
    sees one giant figure.  Connected components separate the poses again, which
    is what the owner needs to tick individual poses.
    """
    from scipy import ndimage
    lab, n = ndimage.label(alpha > 8, structure=np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        yy, xx = np.where(lab == i)
        if len(yy) < min_px:
            continue
        x0, x1, y0, y1 = int(xx.min()), int(xx.max()), int(yy.min()), int(yy.max())
        out.append((y0, x0, x1 + 1, y1 + 1))
    out.sort(key=lambda b: (b[0] // 12, b[1]))
    return out


def normal_labels(rows):
    """Label every figure of a one-row-per-direction sheet.

    Mirrors index.html's reader: idle = row 0 figs 0..4 for dirs 0..4,
    walk = rows 1..5 figs 0..7, attack = the poses after the walk cycle on rows
    4..8; dirs 5,6,7 are the horizontal mirror of dirs 3,2,1.
    """
    labels = {}
    for d in range(5):                       # idle: row 0, one pose per direction
        if d < len(rows[0][2]):
            labels[(0, d)] = (0, d, 0, False)
    for d in range(5):
        ri = 1 + d
        if ri >= len(rows):
            continue
        for f in range(min(8, len(rows[ri][2]))):
            labels[(ri, f)] = (1, d, f, False)
    have = [4 + k for k in range(5) if 4 + k < len(rows)]
    for d in range(5):
        ri = 4 + d
        if ri >= len(rows):
            continue
        if ri not in have:
            ri = min(have, key=lambda r: abs(r - ri)) if have else ri
        idx = m.attack_indices(rows[ri][2])
        for f, ci in enumerate(idx):
            if ci < len(rows[ri][2]):
                labels[(ri, ci)] = (2, d, f, False)
    # the mirrored directions reuse the same art
    mirror = {5: 3, 6: 2, 7: 1}
    for (anim, d, f, fl) in list(labels.values()):
        pass
    return labels


def seat_for(crop):
    """(x, y, source) - where the head pivot sits on this pose, crop-local.

    Same rule as the pack builder: the pose's own hair/neck stub, +HEAD_SEAT.
    Falls back to the torso frame when the pose has no stub (a lying-down or
    dive pose), which the picker marks as 'torso' so the owner knows.
    """
    st = m.head_stub(crop)
    if st:
        return [int(round(st[1])), int(st[0]) + m.HEAD_SEAT, 'stub']
    tf = m.torso_frame(crop)
    if tf:
        return [int(round(tf[0])), int(round(tf[1])) - 26, 'torso']
    return [crop.width // 2, 24, 'none']


def game_constants():
    """The weapon/attach constants straight out of index.html, so the picker shows the
    game's own weapon icon, at the game's own spot, and cannot drift from it."""
    h = open(os.path.join(REPO, 'index.html')).read()

    def literal(marker):
        i = h.index(marker)
        j = h.index('{', i)
        depth = 0
        for k in range(j, len(h)):
            if h[k] == '{':
                depth += 1
            elif h[k] == '}':
                depth -= 1
                if depth == 0:
                    break
        txt = h[j:k + 1]
        txt = re.sub(r"'([^']*)'", r'"\1"', txt)                             # JS strings
        txt = re.sub(r'([{,\s])([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', txt)   # bare keys
        txt = re.sub(r'([\[{,:]\s*)\.(\d)', r'\g<1>0.\2', txt)                # JS .5 -> 0.5
        return json.loads(txt)

    url = re.search(r'weaponItemUrl=wt=>WEAPON_ITEM_IDS\[wt\]\?`([^`]+)`', h)
    hidden = re.search(r'WEAPON_HIDDEN_DIRS=\[([^\]]*)\]', h)
    dirs = [int(x) for x in hidden.group(1).split(',') if x.strip()] if hidden else []
    return {
        # views where the game keeps the weapon hidden (front-view item art on a back view)
        'weaponHiddenDirs': dirs,
        'weaponItemIds': literal('WEAPON_ITEM_IDS={'),
        'weaponIconSize': literal('WEAPON_ICON_SIZE={'),
        'weaponIconAngle': literal('WEAPON_ICON_ANGLE={'),
        'weaponIconGrip': literal('WEAPON_ICON_GRIP={'),
        'classWeapon': literal('CLASS_WEAPON={'),
        'packWeaponAdjust': literal('PACK_WEAPON_ADJUST={'),
        # the page needs the prefix only; the id is appended per weapon family
        'weaponUrl': (url.group(1).split('${')[0] if url else
                      'https://www.divine-pride.net/img/items/item/dpRO/'),
        'weaponOnlyAttack': 'if(pose.kind!==2){weaponNodes.forEach' in h,
    }


def build_class(class_name):
    path = sheet_path(class_name)
    if not path or not os.path.exists(path):
        return None
    im = Image.open(path).convert('RGBA')
    alpha = np.array(im.getchannel('A'))
    rows = None
    try:
        _, rows = m.sheet_figures(path)
    except Exception:
        rows = None
    bad = m.layout_problem(rows) if rows else 'no rows'
    kind = 'normal' if not bad else 'montage'

    poses = []
    if kind == 'normal':
        for ri, (y0, y1, figs) in enumerate(rows):
            for ci, (x0, ty0, x1, ty1) in enumerate(figs):
                poses.append({'x': x0, 'y': ty0, 'w': x1 - x0, 'h': ty1 - ty0,
                              'row': ri, 'col': ci})
        labels = normal_labels(rows)
        for p in poses:
            lab = labels.get((p['row'], p['col']))
            if lab:
                p['anim'], p['dir'], p['frame'], _ = lab
    else:
        # A montage pastes whole strips (drawn borders and all) onto one canvas,
        # so the poses cannot be cut out by whitespace.  They *can* be found:
        # every pose of the class line's proper sheet sits somewhere in the
        # montage, and the montage tool already knows how to locate it.  So the
        # candidate list is the located poses - each one labelled with the pose
        # of the reference sheet it matches.
        for (y0, x0, x1, y1) in components(alpha):
            poses.append({'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'row': -1, 'col': -1})
        ref = m.reference_sheet(m.norm_key(class_name))
        if ref:
            try:
                ref_im, ref_rows = m.sheet_figures(ref)
                ref_lab = normal_labels(ref_rows)
                mon_mask = alpha > 8
                # Greedy global assignment, same as the montage tool: every
                # reference pose takes the best montage spot still free.
                pairs = []
                for ri, (y0, y1, figs) in enumerate(ref_rows):
                    for ci, (x0, ty0, x1, ty1) in enumerate(figs):
                        if (ri, ci) not in ref_lab:
                            continue
                        mm = np.array(ref_im.crop((x0, ty0, x1, ty1)).getchannel('A')) > 8
                        if mm.shape[0] > mon_mask.shape[0] or mm.shape[1] > mon_mask.shape[1]:
                            continue
                        # same overlap map the montage tool uses, but the top 12
                        # spots instead of 3: the greedy pass below needs room to
                        # move a pose off a spot another pose claims first
                        iou = montage._iou_map(mon_mask.astype(np.float32), mm.astype(np.float32))
                        for p in np.argsort(iou.ravel())[-12:][::-1]:
                            yy, xx = np.unravel_index(p, iou.shape)
                            pairs.append((float(iou[yy, xx]), ri, ci, int(xx), int(yy),
                                          int(mm.shape[1]), int(mm.shape[0])))
                pairs.sort(reverse=True)
                taken_ref, taken_pos, found = set(), set(), []
                for score, ri, ci, mx, my, w, h in pairs:
                    if score < 0.6 or (ri, ci) in taken_ref or (mx // 4, my // 4) in taken_pos:
                        continue
                    taken_ref.add((ri, ci))
                    taken_pos.add((mx // 4, my // 4))
                    found.append((score, mx, my, w, h, ref_lab[(ri, ci)]))
                found.sort(key=lambda t: (t[2] // 12, t[1]))
                if len(found) >= 0.5 * len(ref_lab):
                    poses = []
                    for score, mx, my, w, h, lab in found:
                        poses.append({'x': mx, 'y': my, 'w': w, 'h': h, 'row': -1, 'col': -1,
                                      'anim': lab[0], 'dir': lab[1], 'frame': lab[2],
                                      'iou': round(float(score), 3)})
            except Exception as e:                             # labelling is a hint
                print('    (montage labelling failed: %s)' % e)

    # mirror hints: the art only carries dirs 0..4, the game mirrors 3,2,1
    for p in poses:
        crop = im.crop((p['x'], p['y'], p['x'] + p['w'], p['y'] + p['h']))
        p['seat'] = seat_for(crop)
        if p.get('anim') is not None:
            p['label'] = '%s %s f%d' % (ANIM[p['anim']], DIRS[p['dir']], p['frame'])
        else:
            p['label'] = None
    for i, p in enumerate(poses):
        p['id'] = i

    # whole cycles: the labelled poses of one animation+direction+sheet row, in frame
    # order - one click fills a whole walk/attack view instead of eight
    groups = {}
    for p in poses:
        if p.get('anim') is None:
            continue
        groups.setdefault((p['anim'], p['dir'], p['row']), []).append(p['id'])
    strips = []
    for (a, dd, r), ids in sorted(groups.items()):
        ids.sort(key=lambda i: poses[i]['frame'])
        strips.append({'anim': a, 'dir': dd, 'row': r, 'ids': ids})

    # the sheet's own guess at the 8 views x 3 animations, from the labels
    auto = {}
    for d in range(8):
        src = m.MIRROR.get(d, d)
        entry = {}
        for want_anim, want in ((0, 'idle'), (1, 'walk'), (2, 'attack')):
            pick = [p['id'] for p in poses
                    if p.get('anim') == want_anim and p.get('dir') == src]
            pick.sort(key=lambda i: poses[i]['frame'])
            entry[want] = {'ids': pick, 'mirror': d in m.MIRROR}
        auto[str(d)] = entry
    return {
        'name': class_name,
        'sheet': os.path.basename(path),
        'file': 'Sprite/' + os.path.basename(path),
        'w': im.width, 'h': im.height,
        'kind': kind,
        'layoutNote': bad or 'one row per direction',
        'poses': poses,
        'strips': strips,
        'auto': auto,
    }


def main():
    data = {'cell': {'w': CELL_W, 'h': CELL_H, 'padL': PAD_L, 'padT': PAD_T,
                     'feet': FEET_Y, 'body': BODY},
            'dirs': DIRS, 'anim': ANIM, 'game': game_constants(), 'classes': {}}
    for name in CLASSES:
        d = build_class(name)
        if not d:
            print('  %-16s no sheet' % name)
            continue
        lab = sum(1 for p in d['poses'] if p.get('label'))
        print('  %-16s %-8s %3d poses, %3d labelled, %s'
              % (name, d['kind'], len(d['poses']), lab, d['layoutNote']))
        data['classes'][name] = d
    txt = ('// Pose index for tools/sprite_picker.html - generated by '
           'tools/make_sprite_picker.py\n'
           '// Read-only: nothing in the game reads this file.\n'
           'window.SPRITE_PICKER_DATA=%s;\n'
           % json.dumps(data, separators=(',', ':')))
    with open(OUT, 'w') as f:
        f.write(txt)
    print('wrote %s (%.1f KB)' % (os.path.relpath(OUT, REPO), os.path.getsize(OUT) / 1024))
    write_standalone(data)

    if '--qc' in sys.argv:
        qc_path = sys.argv[sys.argv.index('--qc') + 1]
        qc(data, qc_path)


STANDALONE = os.path.join(REPO, 'tools', 'sprite_picker_standalone.html')


def write_standalone(data):
    """One file with everything inside it: the app, the pose index, all 21 sheets as
    data URIs and the two head atlases.  This is the build that opens anywhere - the
    Arena file viewer, a phone, a USB stick - with no repository files beside it.
    Same app source as tools/sprite_picker.html, so the two cannot drift."""
    pack = m.load_existing()
    pack_light = {'hairStyles': pack['hairStyles'],
                  'heads': pack['heads'],
                  'cellW': pack['cellW'], 'cellH': pack['cellH'],
                  'padL': pack['padL'], 'padT': pack['padT'],
                  'pivotX': pack['pivotX'], 'pivotY': pack['pivotY'],
                  'frames': pack['frames']}
    d2 = json.loads(json.dumps(data))                      # deep copy
    for name, c in d2['classes'].items():
        with open(os.path.join(REPO, c['file']), 'rb') as f:
            c['img'] = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()
    tmpl = open(os.path.join(REPO, 'tools', 'sprite_picker.html')).read()
    if '<script src="../assets/sprite_pack_data.js"></script>' not in tmpl:
        raise SystemExit('standalone build: the template changed - update the inliner')
    out = tmpl.replace(
        '<script src="../assets/sprite_pack_data.js"></script>',
        '<!-- standalone build: everything below is inside this one file -->\n'
        '<script>window.SPRITE_PACK=%s;</script>' % json.dumps(pack_light, separators=(',', ':')))
    out = out.replace(
        '<script src="sprite_picker_data.js"></script>',
        '<script>window.SPRITE_PICKER_DATA=%s;</script>' % json.dumps(d2, separators=(',', ':')))
    with open(STANDALONE, 'w') as f:
        f.write(out)
    print('wrote %s (%.1f MB, self-contained)' % (os.path.relpath(STANDALONE, REPO),
                                                 os.path.getsize(STANDALONE) / 1e6))


def qc(data, out_path):
    """A contact sheet of every pose - for checking the auto-labels by eye."""
    TW, TH = 46, 70
    tiles = []
    for name, d in data['classes'].items():
        im = Image.open(os.path.join(REPO, d['file'])).convert('RGBA')
        for p in d['poses']:
            crop = im.crop((p['x'], p['y'], p['x'] + p['w'], p['y'] + p['h']))
            s = min(TW / crop.width, (TH - 12) / crop.height, 1.0)
            if s < 1.0:
                crop = crop.resize((max(1, int(crop.width * s)), max(1, int(crop.height * s))),
                                   Image.LANCZOS)
            pad = Image.new('RGBA', (TW, TH), (255, 255, 255, 255))
            pad.alpha_composite(crop, ((TW - crop.width) // 2, 2))
            dr = ImageDraw.Draw(pad)
            dr.text((1, TH - 11), (p.get('label') or '-')[:9], fill=(180, 0, 0, 255))
            dr.text((1, TH - 6), (d['name'][:9]), fill=(0, 90, 180, 255))
            tiles.append(pad)
    cols = 20
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * TW, rows * TH), (250, 250, 250))
    for i, t in enumerate(tiles):
        sheet.paste(t.convert('RGB'), ((i % cols) * TW, (i // cols) * TH))
    sheet.save(out_path, quality=88)
    print('wrote %s (%d poses)' % (out_path, len(tiles)))


if __name__ == '__main__':
    main()
