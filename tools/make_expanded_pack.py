#!/usr/bin/env python3
"""Build the expanded-roster hero bodies (haven-v408) from the sheets in Sprite/ and Sprite/female/.

The 20 expanded classes have no native Wardrobe atlases and no Updates/Sprite APNGs, so the
game draws them through the legacy sprite pack.  The shipped pack (assets/sprite_pack_data.js,
5.8 MB, one shared body per class) is left byte-for-byte alone.  This tool reuses its reader
(tools/make_sprite_pack.py + tools/montage.py: same cells, same anchors rule, no repainting)
and writes one PNG atlas per body plus a small anchor index, so a player downloads only the
one body they are wearing:

    assets/sprite-pack-x/<body>.webp    8 cols x 24 rows of 96x96, row = anim*8 + dir
    assets/sprite-pack-x/index.js       window.SPRITE_PACK_X = {dir, bodies:{<body>:{file,anchors}}}

Male bodies are named after the sheet ('royal_guard'); female bodies are 'f_<sheet>'.
The game maps each class to its two bodies in EXPANDED_BODY (index.html).

    python3 tools/make_expanded_pack.py            # rebuild everything
    python3 tools/make_expanded_pack.py --check    # verify the committed output is current
"""
import hashlib
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sprite_pack as msp
import montage

REPO = msp.REPO
OUT_DIR = os.path.join(REPO, 'assets', 'sprite-pack-x')
MALE_DIR = os.path.join(REPO, 'Sprite')
FEMALE_DIR = os.path.join(REPO, 'Sprite', 'female')

# sheet name -> the sheet it evolves from (used to rebuild a montage sheet against the
# nearest normal sheet of the same line, exactly as make_sprite_pack.py does).
LINES = {
    'crusader': 'swordman', 'paladin': 'crusader', 'royal guard': 'paladin',
    'sage': 'mage', 'scholar': 'sage', 'sorcerer': 'scholar',
    'alchemist': 'merchant', 'biochemist': 'alchemist', 'geneticist': 'biochemist',
    'monk': 'aco', 'champion': 'monk', 'sura': 'champion',
    'rogue': 'thief', 'stalker': 'rogue', 'shadow chaser': 'stalker',
    'bard': 'archer', 'minstrel': 'bard', 'maestro': 'minstrel',
    'dancer': 'archer', 'gypsy': 'dancer', 'wanderer': 'gypsy',
    'ninja': 'novice', 'gunslinger': 'novice',
}
MALE = ['crusader', 'paladin', 'royal guard', 'sage', 'scholar', 'sorcerer', 'alchemist',
        'biochemist', 'geneticist', 'monk', 'champion', 'sura', 'rogue', 'stalker',
        'shadow chaser', 'bard', 'minstrel', 'maestro', 'ninja', 'gunslinger']
FEMALE = ['crusader', 'paladin', 'royal guard', 'sage', 'scholar', 'sorcerer', 'alchemist',
          'biochemist', 'geneticist', 'monk', 'champion', 'sura', 'rogue', 'stalker',
          'shadow chaser', 'dancer', 'gypsy', 'wanderer', 'ninja', 'gunslinger']


def sheet_path(name, dirs):
    for d in dirs:
        p = os.path.join(d, name + '.png')
        if os.path.exists(p):
            return p
    return None


def reference(name, dirs):
    """Nearest sheet up the line that reads as one row per direction."""
    seen, cur = set(), name
    while cur and cur not in seen:
        seen.add(cur)
        p = sheet_path(cur, dirs)
        if p:
            try:
                _, rows = msp.sheet_figures(p)
                if not msp.layout_problem(rows):
                    return p
            except Exception:
                pass
        cur = LINES.get(cur)
    return None


def build(name, dirs):
    path = sheet_path(name, dirs[:1])
    if not path:
        raise SystemExit('missing sheet: %s in %s' % (name, dirs[0]))
    im, rows = msp.sheet_figures(path)
    bad, note = msp.layout_problem(rows), ''
    if bad:
        ref = reference(name, dirs)
        if ref:
            rebuilt, rep = montage.rebuild(ref, path)
            if rebuilt is not None:
                tmp = os.path.join('/tmp', 'xpack_%s.png' % hashlib.md5(path.encode()).hexdigest())
                rebuilt.save(tmp)
                im, rows = msp.sheet_figures(tmp)
                bad = msp.layout_problem(rows)
                note = 'rebuilt from %s (%d/%d poses, median IoU %.2f)' % (
                    os.path.relpath(ref, REPO), rep['matched'], rep['poses'], rep['median_iou'])
    if bad:
        raise SystemExit('%s: %s' % (path, bad))
    atlas, anchors, missing, borrowed = msp.build_body(im, rows)
    return encode(atlas), anchors, {'cells': sum(1 for a in anchors for row in a for x in row),
                                     'missing': len(missing), 'borrowed': [b[0] for b in borrowed],
                                     'note': note}


def encode(atlas):
    """Lossless WebP bytes for one atlas (exact: RGB under transparent pixels is kept too).
    The decoded pixels are compared with the atlas, so nothing is ever quantised. WebP rather
    than PNG because the whole published tree has a 180 MiB ceiling (publish_sim) and the 40
    bodies are 2.6 MiB this way against 3.5 MiB as palette PNG or 9.5 MiB as truecolour PNG."""
    import numpy as np
    from PIL import Image
    rgba = atlas.convert('RGBA')
    buf = io.BytesIO()
    rgba.save(buf, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    back = Image.open(io.BytesIO(buf.getvalue())).convert('RGBA')
    if not (np.array(back) == np.array(rgba)).all():
        raise SystemExit('lossless encoding changed pixels')
    return buf.getvalue()


def main():
    check = '--check' in sys.argv
    files, bodies, report = {}, {}, []
    jobs = [(msp.norm_key(n), n, [MALE_DIR]) for n in MALE] + \
           [('f_' + msp.norm_key(n), n, [FEMALE_DIR, MALE_DIR]) for n in FEMALE]
    for body, name, dirs in jobs:
        png, anchors, info = build(name, dirs)
        fn = body + '.webp'
        files[fn] = png
        bodies[body] = {'file': fn, 'anchors': anchors}
        report.append('  %-16s cells=%d/120 missing=%d%s%s' % (
            body, info['cells'], info['missing'],
            (' borrowed attack dirs %s' % info['borrowed']) if info['borrowed'] else '',
            ('  ' + info['note']) if info['note'] else ''))
    index = ('// Expanded-roster hero bodies - generated by tools/make_expanded_pack.py. Do not hand edit.\n'
             '// Same cell layout and anchor rule as assets/sprite_pack_data.js; one PNG per body.\n'
             'window.SPRITE_PACK_X=%s;\n' % json.dumps({'dir': 'assets/sprite-pack-x/', 'bodies': bodies},
                                                       separators=(',', ':'), sort_keys=True))
    files['index.js'] = index.encode()
    if check:
        stale = [fn for fn, data in files.items()
                 if not os.path.exists(os.path.join(OUT_DIR, fn))
                 or open(os.path.join(OUT_DIR, fn), 'rb').read() != data]
        extra = [fn for fn in os.listdir(OUT_DIR) if fn not in files]
        if stale or extra:
            raise SystemExit('Expanded sprite pack is stale: %s' % ', '.join(stale + extra))
        print('Expanded sprite pack is current (%d bodies).' % len(bodies))
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    for fn in os.listdir(OUT_DIR):
        if fn not in files:
            os.remove(os.path.join(OUT_DIR, fn))
    for fn, data in files.items():
        with open(os.path.join(OUT_DIR, fn), 'wb') as f:
            f.write(data)
    print('\n'.join(report))
    print('wrote %d bodies, %.1f MB' % (len(bodies), sum(len(d) for d in files.values()) / 1e6))


if __name__ == '__main__':
    main()
