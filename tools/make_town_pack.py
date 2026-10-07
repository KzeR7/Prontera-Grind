#!/usr/bin/env python3
"""
Prontera Town HD art pack builder.

  python3 tools/make_town_pack.py            # rebuild assets/town/town-atlas.* from Updates/town-hd/work/*.png
  python3 tools/make_town_pack.py --check    # fail if the built atlas is stale

The town's buildings are painted with a flat magenta backdrop (#FF00FF) so the whole building is
outlined cleanly. This tool:
  1. removes that backdrop (chroma key, with a small feather so painted edges keep their shape),
  2. trims each sprite to its real content box and records the ground anchor (bottom centre),
  3. packs every sprite into ONE atlas (`assets/town/town-atlas.png` + `.json`) that the game crops
     from at runtime, exactly like `assets/kit/ro-spritesheet.png` is cropped by `kitCrop`,

so the town ships two files, not a dozen, and the game keeps its "one atlas, crop at runtime" rule.
The magenta originals are kept under Updates/town-hd/work/ (the paint source); the trimmed,
alpha-cut copies are written to Updates/town-hd/ (the backup), and the built atlas is mirrored to
Updates/town-hd/ as well.

--check re-runs the whole build in memory and byte-compares the two outputs, so a stale atlas can
never ship (the same contract as tools/make_class_skins.py --check).
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WORK = os.path.join(ROOT, 'Updates', 'town-hd', 'work')
BACKUP = os.path.join(ROOT, 'Updates', 'town-hd')
OUT_PNG = os.path.join(ROOT, 'assets', 'town', 'town-atlas.png')
OUT_JSON = os.path.join(ROOT, 'assets', 'town', 'town-atlas.json')

# name -> (source file, kind, notes). `kind` is what the game treats the crop as: 'bld' stands on
# the ground (anchor = bottom centre), 'prop' is the same but smaller, 'fx' is a transparent overlay.
SPRITES = [
    ('house_town_a', 'house_town_a.png', 'bld'),
    ('house_inn', 'house_inn.png', 'bld'),
    ('guild_hall', 'guild_hall.png', 'bld'),
    ('house_shop', 'house_shop.png', 'bld'),
    ('house_tall', 'house_tall.png', 'bld'),
    ('house_stone', 'house_stone.png', 'bld'),
    ('house_chapel', 'house_chapel.png', 'bld'),
    ('house_timber', 'house_timber.png', 'bld'),
    ('cathedral', 'cathedral.png', 'bld'),
    ('fountain', 'fountain.png', 'prop'),
    ('gate_arch', 'gate_arch.png', 'bld'),
    ('stall_red', 'stall_red.png', 'prop'),
    ('stall_blue', 'stall_blue.png', 'prop'),
    ('tree_big', 'tree_big.png', 'prop'),
    ('lamp_post', 'lamp_post.png', 'prop'),
    ('statue_hero', 'statue_hero.png', 'prop'),
    ('banner_pole', 'banner_pole.png', 'prop'),
    ('bench', 'bench.png', 'prop'),
    ('flower_bed', 'flower_bed.png', 'prop'),
    ('flower_bed2', 'flower_bed2.png', 'prop'),
]

ALPHA_FEATHER = 0.10          # magenta that survives the key by this much is faded, not cut
MAX_SIDE = 640                # longest side of one sprite. The buildings are drawn about 240px tall on
                              # a 1200px viewport, so 640 keeps 2.6x supersampling for retina / zoom
                              # while the whole atlas stays a couple of megabytes instead of sixteen.


def is_magenta(r, g, b):
    # the generator's backdrop is #FF00FF, but any magenta-leaning pixel of the backdrop counts:
    # magenta is the one hue a warm medieval palette never uses, so the test is generous.
    return r > 90 and b > 90 and g < 0.55 * min(r, b) and (r + b) > 1.7 * g


def key_out(img):
    """Remove the flat magenta backdrop, returning (RGBA image, alpha edge count)."""
    img = img.convert('RGB')
    px = img.load()
    w, h = img.size
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if is_magenta(r, g, b):
                continue                      # nothing behind the sprite: leave it transparent
            op[x, y] = (r, g, b, 255)
    return out


def feather_edges(img, keys, radius=2):
    """Give the cut-out a 1-2px soft edge so it does not look razor-sliced against the world."""
    px = img.load()
    w, h = img.size
    edge = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            near_hole = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    near_hole = True
                    break
            if near_hole:
                edge.append((x, y))
    hole = keys
    for x, y in edge:
        r, g, b, _ = px[x, y]
        # a magenta-ish rim pixel is bleed from the backdrop: fade it out instead of keeping it
        if is_magenta(r, g, b) or (x, y) in hole:
            px[x, y] = (r, g, b, 70)
    return img


def build():
    sprites = {}
    images = {}
    for name, fn, kind in SPRITES:
        path = os.path.join(WORK, fn)
        if not os.path.exists(path):
            continue
        keyed = key_out(Image.open(path))
        bbox = keyed.getbbox()
        if bbox:
            keyed = keyed.crop(bbox)
        if max(keyed.width, keyed.height) > MAX_SIDE:
            k = MAX_SIDE / max(keyed.width, keyed.height)
            keyed = keyed.resize((max(1, round(keyed.width * k)), max(1, round(keyed.height * k))), Image.LANCZOS)
        feather_edges(keyed, set())
        images[name] = keyed
        sprites[name] = {'kind': kind, 'w': keyed.width, 'h': keyed.height}
    if not images:
        raise SystemExit('no source art in %s' % WORK)

    # pack: tallest first along a fixed row height, next-fit rows, 8px gutter
    GUT = 8
    order = sorted(images, key=lambda n: -images[n].height)
    W = 4096
    x = y = 0
    row_h = 0
    for n in order:
        im = images[n]
        if x + im.width + GUT > W:
            x = 0
            y += row_h + GUT
            row_h = 0
        sprites[n]['x'], sprites[n]['y'] = x, y
        x += im.width + GUT
        row_h = max(row_h, im.height)
    H = y + row_h
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for n in order:
        atlas.paste(images[n], (sprites[n]['x'], sprites[n]['y']))

    man = {
        'meta': {
            'image': 'town-atlas.png',
            'size': {'w': W, 'h': H},
            'description': 'Prontera Town HD art - RO3-style painted buildings, fountain and props, '
                           'built by tools/make_town_pack.py from Updates/town-hd/work/.',
        },
        'sprites': sprites,
    }
    return atlas, man


def serialise(atlas, man):
    import io
    buf = io.BytesIO()
    atlas.save(buf, 'PNG', optimize=True)
    return buf.getvalue(), (json.dumps(man, indent=1, sort_keys=True) + '\n').encode()


def main():
    atlas, man = build()
    png, js = serialise(atlas, man)
    if '--check' in sys.argv:
        stale = []
        for path, want in ((OUT_PNG, png), (OUT_JSON, js)):
            have = open(path, 'rb').read() if os.path.exists(path) else b''
            if have != want:
                stale.append(os.path.relpath(path, ROOT))
        if stale:
            print('Town art is STALE: ' + ', '.join(stale))
            print('Run: python3 tools/make_town_pack.py')
            sys.exit(1)
        print('Town art is current (%d sprites, atlas %dx%d).' % (len(man['sprites']), man['meta']['size']['w'], man['meta']['size']['h']))
        return
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    open(OUT_PNG, 'wb').write(png)
    open(OUT_JSON, 'wb').write(js)
    os.makedirs(BACKUP, exist_ok=True)
    open(os.path.join(BACKUP, 'town-atlas.png'), 'wb').write(png)
    open(os.path.join(BACKUP, 'town-atlas.json'), 'wb').write(js)
    # the paint sources stay in WORK (that is what this tool rebuilds from); the alpha-cut result
    # is the atlas itself, mirrored into Updates/town-hd/ the way the kit mirrors its own sheet.
    print('Town art built: %d sprites, atlas %dx%d, %d KB.'
          % (len(man['sprites']), man['meta']['size']['w'], man['meta']['size']['h'], len(png) // 1024))
    missing = [n for n, fn, _ in SPRITES if not os.path.exists(os.path.join(WORK, fn))]
    if missing:
        print('not painted yet (the game keeps its block/code stand-ins): ' + ', '.join(missing))


if __name__ == '__main__':
    main()
