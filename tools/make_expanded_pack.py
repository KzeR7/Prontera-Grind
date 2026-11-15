#!/usr/bin/env python3
"""Build the expanded-roster hero bodies from native Ragnarok Online client sprites.

haven-v409 replaced the pose-matching cutter (which guessed frames out of the uploaded
Sprite/ sheets and got walk / idle rows wrong) with a direct render of the client's own
.spr / .act files, the same way the client composes a character:

    body action frame  ->  painted at the ACT origin
    head attach point  ->  body anchor - head anchor + head layer offset (per frame)

so every direction, every walk frame and every attack frame is the real animation, and the
head sits where the client puts it.

Sources are listed, by git blob id and SHA-256, in tools/native-expanded/source-manifest.json
and are downloaded into .cache/native-expanded/ (never committed).

Output (the layout index.html's packTex() reads):

    assets/sprite-pack-x/<body>.webp    8 cols x 24 rows of 126x134, row = anim*8 + dir
    assets/sprite-pack-x/index.js       window.SPRITE_PACK_X = {dir, cell, origin, pivotY,
                                          bodies:{<body>:{file, anchors}}}

    anim 0 idle (1 frame), 1 walk (8), 2 attack (6); dirs S,SW,W,NW,N,NE,E,SE.
    anchors[anim][dir][frame] = [x, y] or [x, y, headColumn]: where the head atlas pivot
    (32,48) goes inside the 126x134 cell; headColumn is given when the client turns the head
    to a different direction than the body (it does during attacks).

Melee jobs play RO's first attack action, the bow / gun jobs the third (aimed) one.
The Gunslinger and the Rebellion are drawn holding the native gun sprite during the attack.

usage:
    python3 tools/make_expanded_pack.py            # fetch (if needed) and rebuild everything
    python3 tools/make_expanded_pack.py --check    # verify the committed output
"""
import base64
import hashlib
import io
import json
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, 'native-expanded'))
import roact  # noqa: E402

OUT_DIR = os.path.join(REPO, 'assets', 'sprite-pack-x')
MANIFEST = os.path.join(HERE, 'native-expanded', 'source-manifest.json')
OUTPUTS = os.path.join(HERE, 'native-expanded', 'output-manifest.json')
CACHE = os.path.join(REPO, '.cache', 'native-expanded')

CW, CH = 126, 134            # the shipped pack's padded cell (SPRITE_PACK.cellW / cellH)
ORIGIN = (63, 108)           # where the ACT origin (the ground point) sits in a cell
PIVOT_Y = 118                # ground line the game stands the sprite on (origin + 10, as shipped)
FRAMES = [1, 8, 6]

MALE = ['crusader', 'paladin', 'royal_guard', 'sage', 'scholar', 'sorcerer', 'alchemist',
        'biochemist', 'geneticist', 'monk', 'champion', 'sura', 'rogue', 'stalker',
        'shadow_chaser', 'bard', 'minstrel', 'maestro', 'ninja', 'gunslinger', 'kagerou', 'rebellion']
FEMALE_OF = {'bard': 'dancer', 'minstrel': 'gypsy', 'maestro': 'wanderer', 'kagerou': 'oboro'}
BODIES = [(k, k, 'm') for k in MALE] + [('f_' + FEMALE_OF.get(k, k), FEMALE_OF.get(k, k), 'f') for k in MALE]
AIMED = {'bard', 'minstrel', 'maestro', 'dancer', 'gypsy', 'wanderer', 'gunslinger', 'rebellion'}
HELD = {'gunslinger': 'gun', 'rebellion': 'gun'}   # the client ships the same gun sprite for both

# Where the centre of head-sprite 1's image sits relative to the head atlas pivot (32,48), per
# atlas column. Measured once by locating that sprite inside assets/sprite_pack_data.js heads.
HEAD_CENTRE = {'m': [[-1, 13], [0, 14], [-1, 14], [0, 14], [-1, 13], [-1, 14], [-1, 14], [-1, 14]],
               'f': [[-1, 14], [-1, 14], [-1, 14], [0, 14], [-1, 14], [-1, 14], [-1, 14], [0, 14]]}
# head sprite index + mirror flag -> head atlas column (direction)
HEAD_COL = {(0, 0): 0, (1, 0): 1, (2, 0): 2, (3, 0): 3, (4, 0): 4, (3, 1): 5, (2, 1): 6, (1, 1): 7,
            (0, 1): 0, (4, 1): 4}


def fetch():
    """Download every source into the cache and verify it. Idempotent."""
    for rec in json.load(open(MANIFEST, encoding='utf-8'))['files']:
        path = os.path.join(CACHE, rec['name'])
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            raw = subprocess.check_output(['gh', 'api', 'repos/%s/git/blobs/%s' % (rec['repo'], rec['blob'])])
            open(path, 'wb').write(base64.b64decode(json.loads(raw)['content']))
        data = open(path, 'rb').read()
        if len(data) != rec['bytes'] or hashlib.sha256(data).hexdigest() != rec['sha256']:
            raise SystemExit('source %s does not match the manifest' % rec['name'])


def load(name):
    return (roact.read_act(os.path.join(CACHE, name + '.act')),) + roact.read_spr(os.path.join(CACHE, name + '.spr'))


def pick(n):
    """Six samples of an n-frame attack: a 5-frame swing holds its last frame."""
    return [0, 1, 2, 3, 4, 4] if n == 5 else [round(i * (n - 1) / 5) for i in range(6)]


def build(src, sex, heads):
    act, imgs, rgba = load('body/%s_%s' % (src, sex))
    held = load('weapon/%s_%s' % (HELD[src], sex)) if src in HELD else None
    actions, head, centre = act['actions'], heads[sex]['actions'], HEAD_CENTRE[sex]
    attack = 88 if src in AIMED else 40
    atlas, anchors = Image.new('RGBA', (CW * 8, CH * 24)), []
    pad = 100
    for anim, (first, wanted) in enumerate(((0, [0]), (8, list(range(8))), (attack, None))):
        rows = []
        for d in range(8):
            frames = actions[first + d]
            row = []
            for i, f in enumerate(wanted if wanted is not None else pick(len(frames))):
                fr = frames[min(f, len(frames) - 1)]
                big = roact.draw(fr, imgs, rgba, (CW + 2 * pad, CH + 2 * pad), (pad + ORIGIN[0], pad + ORIGIN[1]))
                ba = fr['anchors'][0]
                if held and anim == 2:
                    wf = held[0]['actions'][first + d]
                    wf = wf[min(f, len(wf) - 1)]
                    wa = wf['anchors'][0] if wf['anchors'] else ba
                    big.alpha_composite(roact.draw(wf, held[1], held[2], big.size,
                                                   (pad + ORIGIN[0] + ba[0] - wa[0], pad + ORIGIN[1] + ba[1] - wa[1])))
                box = big.getbbox()
                if box and (box[0] < pad or box[1] < pad or box[2] > pad + CW or box[3] > pad + CH):
                    raise SystemExit('%s_%s: a frame does not fit the cell' % (src, sex))
                atlas.paste(big.crop((pad, pad, pad + CW, pad + CH)), (i * CW, (anim * 8 + d) * CH))
                hf = head[first + d]
                hf = hf[min(f, len(hf) - 1)]
                layer = [x for x in hf['layers'] if x['spr'] >= 0][0]
                ha = hf['anchors'][0]
                col = HEAD_COL.get((layer['spr'], layer['mirror']), d)
                entry = [ORIGIN[0] + ba[0] - ha[0] + layer['x'] + centre[col][0],
                         ORIGIN[1] + ba[1] - ha[1] + layer['y'] + centre[col][1]]
                if col != d:
                    entry.append(col)
                row.append(entry)
            rows.append(row)
        anchors.append(rows)
    return atlas, anchors


def encode(atlas):
    buf = io.BytesIO()
    atlas.save(buf, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    back = Image.open(io.BytesIO(buf.getvalue())).convert('RGBA')
    a, b = atlas.tobytes(), back.tobytes()
    # exact=True keeps colour under alpha 0 too; compare visible pixels only to be safe
    if a != b and [p if p[3] else 0 for p in atlas.getdata()] != [p if p[3] else 0 for p in back.getdata()]:
        raise SystemExit('lossless encoding changed pixels')
    return buf.getvalue()


def render():
    fetch()
    heads = {s: roact.read_act(os.path.join(CACHE, 'head', '1_%s.act' % s)) for s in 'mf'}
    files, bodies = {}, {}
    for key, src, sex in BODIES:
        atlas, anchors = build(src, sex, heads)
        files[key + '.webp'] = encode(atlas)
        bodies[key] = {'file': key + '.webp', 'anchors': anchors}
    index = ('// Expanded-roster hero bodies - generated by tools/make_expanded_pack.py. Do not hand edit.\n'
             '// Native Ragnarok Online client sprites (tools/native-expanded/source-manifest.json).\n'
             'window.SPRITE_PACK_X=%s;\n' % json.dumps(
                 {'dir': 'assets/sprite-pack-x/', 'cell': [CW, CH], 'origin': list(ORIGIN), 'pivotY': PIVOT_Y,
                  'bodies': bodies}, separators=(',', ':'), sort_keys=True))
    files['index.js'] = index.encode('utf-8')
    return files


def main():
    check = '--check' in sys.argv
    if check:
        want = json.load(open(OUTPUTS))['files']
        have = sorted(os.listdir(OUT_DIR))
        bad = [n for n in sorted(set(have) | set(want))
               if n not in want or n not in have
               or hashlib.sha256(open(os.path.join(OUT_DIR, n), 'rb').read()).hexdigest() != want[n]]
        if bad:
            print('expanded sprite pack is STALE: ' + ', '.join(bad))
            return 1
        srcs = json.load(open(MANIFEST, encoding='utf-8'))['files']
        if len(srcs) != 2 * len(BODIES) + 4 + 4 * len(set(HELD.values())):
            print('expanded sprite pack source manifest does not list every source')
            return 1
        print('Expanded sprite pack is current (%d bodies, %d native sources).' % (len(BODIES), len(srcs)))
        return 0
    files = render()
    os.makedirs(OUT_DIR, exist_ok=True)
    for old in os.listdir(OUT_DIR):
        if old not in files:
            os.remove(os.path.join(OUT_DIR, old))
    for name, data in files.items():
        open(os.path.join(OUT_DIR, name), 'wb').write(data)
    json.dump({'files': {n: hashlib.sha256(d).hexdigest() for n, d in sorted(files.items())}},
              open(OUTPUTS, 'w'), indent=1)
    total = sum(len(d) for d in files.values())
    print('wrote %d files, %.2f MiB' % (len(files), total / 1048576))
    return 0


if __name__ == '__main__':
    sys.exit(main())
