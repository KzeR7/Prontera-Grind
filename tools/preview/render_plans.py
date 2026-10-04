#!/usr/bin/env python3
"""tools/preview/render_plans.py — paint the ten map plans into top-down PNGs.

    node tools/preview/dump_plans.js /tmp/plans.json      # plans straight from index.html
    python3 tools/preview/render_plans.py /tmp/plans.json out_dir

It reproduces what the game's own painters do — the ground is a base tile repeat plus one
drawImage per planned cell (the same +0.6px bleed), water and decks are the plan's rectangles,
props are billboards drawn far-to-near at their real world size — so a layout can be judged
without a browser. It crops, it never draws: every pixel comes from the kit atlas.

Options:  --box x0,x1,z0,z1   crop the view (default -45,-45,45,45 = the whole field)
          --px N              output size (default 1800)
          --lane              mark the running lane and the monster spawn band
"""
import json, os, sys
from PIL import Image, ImageDraw

KIT_PK = 2.9 / 80.0        # hero 2.9 units / the kit's 80px character frame
KIT_S = .85                # one design cell in world units
KIT_FAR = 90               # the painted ground is 90x90 world units
KIT_PX = 2048              # ...at this texture size


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opts = {a.split('=')[0].lstrip('-'): a.split('=')[1] for a in sys.argv[1:] if a.startswith('--') and '=' in a}
    flags = {a.lstrip('-') for a in sys.argv[1:] if a.startswith('--') and '=' not in a}
    repo = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
    plans = json.load(open(args[0] if args else '/tmp/plans.json'))
    man = json.load(open(os.path.join(repo, 'assets/kit/ro-spritesheet.json')))
    atlas = Image.open(os.path.join(repo, 'assets/kit/ro-spritesheet.png')).convert('RGBA')

    out_dir = args[1] if len(args) > 1 else '/tmp/plan_previews'
    os.makedirs(out_dir, exist_ok=True)
    size = int(opts.get('px', 1800))
    box = [float(v) for v in opts['box'].split(',')] if 'box' in opts else [-45, -45, 45, 45]
    lane = json.load(open(os.path.join(repo, 'assets/kit/ro-spritesheet.json'))) and plans['arena']
    sc = size / (box[2] - box[0])
    px = lambda x: (x - box[0]) * sc
    pz = lambda z: (z - box[1]) * sc
    cell_px = KIT_S * sc

    def tile_img(name, n=None):
        e = man['tiles'].get(name)
        if not e:
            return None
        t = atlas.crop((e['x'], e['y'], e['x'] + e['w'], e['y'] + e['h']))
        return t.resize((n, n), Image.LANCZOS) if n else t

    def sprite_img(name, scale):
        e = man['sprites'].get(name)
        if not e:
            return None, 0, 0
        t = atlas.crop((e['x'], e['y'], e['x'] + e['w'], e['y'] + e['h']))
        k = KIT_PK * man['suggest']['KIT_PS'].get(name, 1.0) * scale
        w, h = max(1, round(e['w'] * k * sc)), max(1, round(e['h'] * k * sc))
        return t.resize((w, h), Image.LANCZOS), e['anchorX'] * k * sc, e['anchorY'] * k * sc

    for m, p in plans['maps'].items():
        img = Image.new('RGBA', (size, size), (0, 0, 0, 255))
        # ground: the base tile, sampled down and repeated (the game's own stamp size)
        base = p['base'] if p['base'] in man['tiles'] else p['base2']
        n = max(8, round(cell_px * 4))
        st = tile_img(base, n)
        for y in range(0, size, n):
            for x in range(0, size, n):
                img.paste(st, (x, y))
        # cells
        cache = {}
        for c in p['cells']:
            if c['tile'] not in cache:
                cache[c['tile']] = tile_img(c['tile'])
            t = cache[c['tile']]
            if t is None:
                continue
            t = t.resize((max(1, round(cell_px + .6)),) * 2, Image.LANCZOS)
            img.paste(t, (round(px(c['x']) - cell_px / 2), round(pz(c['z']) - cell_px / 2)))
        d = ImageDraw.Draw(img)
        # water + deck rectangles
        pair = p.get('waterFrames') or ['water_frame_0', 'water_frame_1']
        wt = tile_img(pair[0])
        for r in p['water']:
            if wt is None:
                continue
            rw, rh = round(r['w'] * sc), round(r['h'] * sc)
            tw = wt.resize((rw, rh), Image.LANCZOS) if rw > 0 and rh > 0 else None
            if tw:
                img.paste(tw, (round(px(r['x'] - r['w'] / 2)), round(pz(r['z'] - r['h'] / 2))))
        if p.get('deck'):
            dk, dt = p['deck'], tile_img(p.get('deckTile') or 'bridge_planks')
            if dt is not None:
                rw, rh = round(dk['w'] * sc), round(dk['l'] * sc)
                dt = dt.resize((rw, rh), Image.LANCZOS)
                img.paste(dt, (round(px(dk['x'] - dk['w'] / 2)), round(pz(dk['z'] - dk['l'] / 2))))
        # props: far to near
        for pr in sorted(p['props'], key=lambda q: q['z']):
            t, ax, ay = sprite_img(pr['type'], pr.get('scale', 1))
            if t is None:
                continue
            img.paste(t, (round(px(pr['x']) - ax), round(pz(pr['z']) - ay)), t)
        if 'lane' in flags:
            a = plans['arena']
            d.rectangle([px(-a['BX']), pz(-45), px(a['BX']), pz(45)], outline=(255, 60, 60, 255), width=3)
            d.rectangle([px(-a['BX']), pz(a['Z0']), px(a['BX']), pz(a['Z1'])], outline=(60, 255, 120, 255), width=3)
        img.convert('RGB').save(os.path.join(out_dir, 'map%d.png' % int(m)), quality=88)
        print('map%d.png' % int(m))
    print('wrote', out_dir)


if __name__ == '__main__':
    main()
