#!/usr/bin/env python3
"""
Where a painted town sprite meets the ground.

  python3 tools/measure_town_ground.py            # print the measurement for every sprite
  python3 tools/measure_town_ground.py --check    # fail when index.html's TOWN_SINK is stale

The buildings are painted in three-quarter view, so the base of one is a parallelogram whose NEAR
corner is the lowest pixel of the crop - the pack trims to the content box, so the bottom edge of
the crop is that corner. Hang the sprite by that corner (which is what anchoring it at y=0 does)
and the rest of the wall stands in the air above its own shadow: up to a whole unit of it on a
house. That is what "all houses and trees look like it floats" was looking at.

THE RULE, so it can be re-run by anybody:
  for every column of the sprite, find the lowest painted pixel; take the median of those over the
  columns that reach into the LOWER HALF of the art (a roof eave or the underside of a canopy
  otherwise drags the number up and buries the thing); sink the sprite by that fraction of its
  height. Sinking plants the middle of the base on the ground - the ground is opaque and the
  camera looks down at it, so the near corner that ends up underneath is simply hidden.

--check parses `TOWN_SINK` out of index.html and compares it against a fresh measurement of
assets/town/town-atlas.png, the way tools/make_town_pack.py --check guards the atlas itself.
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ATLAS_JSON = os.path.join(ROOT, 'assets', 'town', 'town-atlas.json')
ATLAS_PNG = os.path.join(ROOT, 'assets', 'town', 'town-atlas.png')
INDEX = os.path.join(ROOT, 'index.html')

ALPHA = 200          # a pixel this opaque is painted; below it is the feathered cut-out edge
LOWER_HALF = 0.5     # only columns whose lowest pixel reaches this far down count as "the base"
ROUND = 3            # the precision the table is written to in index.html


def measure(man, atlas):
    """-> {name: (sink fraction, median bottom row as a fraction of the height, columns counted)}"""
    out = {}
    for name, s in man.items():
        im = atlas.crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h'])).convert('RGBA')
        w, h = im.size
        px = im.load()
        bottoms = []
        for x in range(w):
            for y in range(h - 1, -1, -1):
                if px[x, y][3] >= ALPHA:
                    if y >= h * LOWER_HALF:
                        bottoms.append(y)
                    break
        if not bottoms:
            out[name] = (0.0, 1.0, 0)
            continue
        bottoms.sort()
        med = bottoms[len(bottoms) // 2]
        out[name] = (round(1 - (med + 0.5) / h, 4), round(med / h, 3), len(bottoms))
    return out


def table_in_index():
    """The TOWN_SINK table as it is written in index.html, so --check reads the shipping value."""
    src = open(INDEX, encoding='utf-8').read()
    m = re.search(r'const TOWN_SINK=\{(.*?)\};', src, re.S)
    if not m:
        raise SystemExit('no TOWN_SINK table found in index.html')
    body = m.group(1)
    out = {}
    for k, v in re.findall(r"(\w+)\s*:\s*([0-9.]+)", body):
        out[k] = float(v)
    return out


def main():
    man = json.load(open(ATLAS_JSON))
    atlas = Image.open(ATLAS_PNG)
    got = measure(man['sprites'], atlas)
    if '--check' in sys.argv:
        want = table_in_index()
        bad = []
        for name in sorted(got):
            have = round(got[name][0], ROUND)
            if name not in want:
                bad.append('%s missing from TOWN_SINK (measured %.3f)' % (name, have))
            elif abs(want[name] - have) > 10 ** -ROUND:
                bad.append('%s is %s in index.html, measured %.3f' % (name, want[name], have))
        if bad:
            print('Town ground offsets are STALE:')
            for b in bad:
                print('  ' + b)
            print('Run: python3 tools/measure_town_ground.py, then paste the table into index.html')
            sys.exit(1)
        print('Town ground offsets are current (%d sprites).' % len(got))
        return
    print('%-14s %6s %6s %7s %6s' % ('sprite', 'sink', 'median', 'cols', 'units'))
    for name in sorted(got):
        frac, med, cols = got[name]
        print('%-14s %6.3f %6.3f %7d' % (name, frac, med, cols))
    print()
    print('TOWN_SINK={' + ','.join('%s:%s' % (n, ('%g' % round(got[n][0], ROUND)))
                                   for n in sorted(got)) + '};')


if __name__ == '__main__':
    main()
