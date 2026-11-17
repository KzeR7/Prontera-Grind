#!/usr/bin/env python3
"""Bakes original Ragnarok Online skill effects into flipbooks for assets/signature-fx.js.

    python3 tools/make_ro_fx.py            rebuild assets/ro-fx/
    python3 tools/make_ro_fx.py --check    fail if the committed pack differs from a rebuild
    python3 tools/make_ro_fx.py --sheet out.png   contact sheet of every book (for review)

Three kinds of source, all pinned by git blob id in tools/native-expanded/fx-source-manifest.json
and fetched into .cache/native-fx/:
  * STR  - the client's layered key-frame effects (data/texture/effect/*.str plus their textures).
           Every key frame is composed the way the client does and flattened to one image.
  * SPR  - sprite effects (data/sprite/이팩트/*.spr + .act), action 0.
  * TEX  - single textures used as stills (the Asura Strike characters, the tarot cards...).
A book is one WebP atlas of equally sized cells plus a row in assets/ro-fx/index.js.
"""
import base64, hashlib, io, json, math, os, struct, subprocess, sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'native-expanded'))
import roact  # noqa: E402

MANIFEST = os.path.join(ROOT, 'tools', 'native-expanded', 'fx-source-manifest.json')
CACHE = os.path.join(ROOT, '.cache', 'native-fx')
OUT = os.path.join(ROOT, 'assets', 'ro-fx')
EFFECT = 'data/texture/effect/'
SPRITE = 'data/sprite/이팩트/'
HERO_PX = 90.0          # a player sprite is about this tall in client pixels
CELL_MAX = 150          # longest side of a cell, in atlas pixels
FRAMES_MAX = 30

# key -> (kind, source, options)
BOOKS = {
    # Monk line
    'asura':       ('tex', ['asura1.tga', 'asura2.tga', 'asura3.tga', 'asura4.tga', 'asura5.tga', 'asura6.tga'], {}),
    'flash':       ('str', 'sr_flashcombo', {}),
    'investigate': ('spr', '침투경_', {}),
    # Crusader line
    'holycross':   ('str', 'holy_cross', {}),
    'grandcross':  ('str', 'cross', {}),
    'shieldcharge': ('str', 'shield_charge', {}),
    'shield':      ('tex', ['shield_boomerang.bmp'], {}),
    # Sage line
    'mindbreak':   ('str', 'mentalbreak', {}),
    'web':         ('tex', ['spiderweb.tga'], {}),
    # Alchemist line
    'demo':        ('spr', '데몬스트레이션', {}),
    # Rogue line
    'strip':       ('str', 'strip_weapon', {}),
    'masq':        ('str', 'groomy', {}),
    # Performers
    'note':        ('str', 'note_1', {}),
    'tarot':       ('tex', ['tarot%02d.tga' % i for i in range(1, 15)], {'key': False}),
    # Ninja line
    'shadowslash': ('spr', '그림자베기', {}),
    'mist':        ('spr', '안개베기', {}),
    'issen':       ('spr', '일섬', {}),
    'blaze':       ('spr', '화염진', {}),
    'ice':         ('spr', '얼음땡', {}),
    'kamaitachi':  ('spr', '와일드스톰', {}),
    'bakuretsu':   ('spr', 'bakuretsu_hadou/bakuretsu_hadou', {}),
    'crossslash':  ('str', 'jyumonjikiri', {}),
    'soulcut':     ('str', 'setsudan', {}),
    # Gunslinger line
    'coin':        ('tex', ['coin_a.bmp', 'coin_b.bmp', 'coin_c.bmp', 'coin_d.bmp', 'coin_e.bmp'], {}),
    'desperado':   ('spr', '데스페라도', {}),
    'rapid':       ('spr', '래피드샤워', {}),
    'tracking':    ('spr', '트래킹', {}),
    'triple':      ('spr', '트리플액션', {}),
    'bullet':      ('spr', '매지컬불릿', {}),
    'hammer':      ('str', 'RL_HAMER_GOD/hogg', {}),
    'dtail':       ('str', 'RL_D_TAIL/DTDT', {}),
    'platinum':    ('str', 'RL_P_ALTER/platinum', {}),
    'slug':        ('str', 'RL_SLUGSHOT/slug', {}),
    'firedance':   ('str', 'rl_fire_dance/firedance', {}),
    'firerain':    ('str', 'rl_fire_rain/fire_rain', {}),
    'heat':        ('str', 'rl_heat_barrel/htb', {}),
}


def cache_name(path):
    return path.lower().replace('/', '__')


def records():
    return {r['name']: r for r in json.load(open(MANIFEST, encoding='utf-8'))['files']}


def fetch():
    for name, rec in records().items():
        path = os.path.join(CACHE, name)
        if not os.path.exists(path):
            os.makedirs(CACHE, exist_ok=True)
            raw = subprocess.check_output(['gh', 'api', 'repos/%s/git/blobs/%s' % (rec['repo'], rec['blob'])])
            open(path, 'wb').write(base64.b64decode(json.loads(raw)['content']))
        data = open(path, 'rb').read()
        if len(data) != rec['bytes'] or hashlib.sha256(data).hexdigest() != rec['sha256']:
            raise SystemExit('source %s does not match the manifest' % name)


def src(path):
    name = cache_name(path)
    full = os.path.join(CACHE, name)
    return full if os.path.exists(full) else None


# ---- STR ----------------------------------------------------------------------------------------
def read_str(path):
    b = open(path, 'rb').read()
    if b[:4] != b'STRM':
        raise SystemExit('%s is not a STR file' % path)
    _ver, fps, maxkey, nlayers = struct.unpack_from('<4I', b, 4)
    o, layers = 36, []
    for _ in range(nlayers):
        tc, = struct.unpack_from('<i', b, o); o += 4
        tex = []
        for _i in range(tc):
            tex.append(b[o:o + 128].split(b'\0')[0].decode('cp949', 'replace')); o += 128
        kc, = struct.unpack_from('<i', b, o); o += 4
        keys = []
        for _i in range(kc):
            v = struct.unpack_from('<iI2f8f8ffIff4f3I', b, o); o += 124
            keys.append(dict(frame=v[0], type=v[1], pos=v[2:4], xy=v[12:20], aniframe=v[20], anitype=v[21],
                             delay=v[22], angle=v[23] / (1024 / 360.0), color=v[24:28], dst=v[29]))
        layers.append(dict(tex=tex, keys=keys))
    return fps, maxkey, layers


def str_textures(path):
    return sorted({t for layer in read_str(path)[2] for t in layer['tex']})


def texture(path, key=True):
    """A texture as float RGBA. BMP files use magenta as the transparent colour."""
    im = Image.open(path)
    if im.mode == 'RGBA':
        return np.asarray(im).astype(np.float32) / 255
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    alpha = 1 - ((a[..., 0] > .98) & (a[..., 1] < .02) & (a[..., 2] > .98)).astype(np.float32) if key else np.ones(a.shape[:2], np.float32)
    return np.dstack([a, alpha])


def str_state(layer, k):
    """The layer at key k: the last base key, advanced by the morph key that shares its frame."""
    an, fi, ti, last, last_src = layer['keys'], -1, -1, 0, 0
    for i, a in enumerate(an):
        if a['frame'] <= k:
            if a['type'] == 0: fi = i
            if a['type'] == 1: ti = i
        last = max(last, a['frame'])
        if a['type'] == 0: last_src = max(last_src, a['frame'])
    if fi < 0 or (ti < 0 and last < k):
        return None
    f, t, d = an[fi], (an[ti] if ti >= 0 else None), k - an[fi]['frame']
    if ti != fi + 1 or t['frame'] != f['frame']:
        return None if (t is not None and last_src <= f['frame']) else dict(f)
    r, n = dict(f), len(layer['tex'])
    r['color'] = [f['color'][i] + t['color'][i] * d for i in range(4)]
    r['xy'] = [f['xy'][i] + t['xy'][i] * d for i in range(8)]
    r['angle'] = f['angle'] + t['angle'] * d
    r['pos'] = [f['pos'][i] + t['pos'][i] * d for i in range(2)]
    if t['anitype'] == 1: r['aniframe'] = f['aniframe'] + t['aniframe'] * d
    elif t['anitype'] == 2: r['aniframe'] = min(f['aniframe'] + t['delay'] * d, n - 1)
    elif t['anitype'] == 3: r['aniframe'] = (f['aniframe'] + t['delay'] * d) % n
    elif t['anitype'] == 4: r['aniframe'] = (f['aniframe'] - t['delay'] * d) % n
    return r


W, H = 640, 480


def str_frames(name):
    """(fps, frames, origin): every third key of a 640x480 effect stage, origin at (320, 240)."""
    path = src(EFFECT + name + '.str')
    fps, maxkey, layers = read_str(path)
    base = os.path.dirname(EFFECT + name)
    cache, frames, step = {}, [], 3
    for k in range(0, maxkey, step):
        rgb, alpha = np.zeros((H, W, 3), np.float32), np.zeros((H, W), np.float32)
        for layer in layers:
            r = str_state(layer, k)
            if not r or not layer['tex']:
                continue
            tname = layer['tex'][int(r['aniframe']) % len(layer['tex'])]
            if tname not in cache:
                p = src(base + '/' + tname) or src(EFFECT + tname)
                cache[tname] = texture(p) if p else None
            tex = cache[tname]
            col = [max(0.0, min(255.0, c)) / 255 for c in r['color']]
            if tex is None or col[3] <= 0:
                continue
            ang = math.radians(r['angle']); ca, sa = math.cos(ang), math.sin(ang)
            pt = lambda i: (r['xy'][i] * ca - r['xy'][i + 4] * sa + r['pos'][0], r['xy'][i] * sa + r['xy'][i + 4] * ca + r['pos'][1])
            tl, tr, bl, br = pt(0), pt(1), pt(3), pt(2)
            m = np.array([[tr[0] - tl[0], bl[0] - tl[0]], [tr[1] - tl[1], bl[1] - tl[1]]])
            if abs(np.linalg.det(m)) < 1e-6:
                continue
            mi = np.linalg.inv(m)
            xs, ys = [q[0] for q in (tl, tr, bl, br)], [q[1] for q in (tl, tr, bl, br)]
            x0, x1 = max(0, int(min(xs))), min(W, int(max(xs)) + 1)
            y0, y1 = max(0, int(min(ys))), min(H, int(max(ys)) + 1)
            if x1 <= x0 or y1 <= y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + .5, np.arange(y0, y1) + .5)
            u = mi[0, 0] * (gx - tl[0]) + mi[0, 1] * (gy - tl[1])
            v = mi[1, 0] * (gx - tl[0]) + mi[1, 1] * (gy - tl[1])
            inside = (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
            th, tw = tex.shape[:2]
            s = tex[np.clip((v * th).astype(int), 0, th - 1), np.clip((u * tw).astype(int), 0, tw - 1)]
            a = s[..., 3] * col[3] * inside
            colour = s[..., :3] * np.array(col[:3], np.float32)
            reg, ra = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
            if r['dst'] != 6:      # the client adds these layers to the screen
                reg += colour * a[..., None]
            else:
                reg *= (1 - a[..., None]); reg += colour * a[..., None]; ra *= (1 - a); ra += a
        rgb = np.clip(rgb, 0, 1)
        al = np.maximum(alpha, rgb.max(axis=2))
        out = np.dstack([np.where(al[..., None] > 0, rgb / np.maximum(al[..., None], 1e-6), 0), al])
        frames.append(Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA'))
    return fps / step, frames, (W // 2, H // 2)


# ---- SPR / TEX ----------------------------------------------------------------------------------
def spr_frames(name):
    act = roact.read_act(src(SPRITE + name + '.act'))
    imgs, rgba = roact.read_spr(src(SPRITE + name + '.spr'))
    frames = [roact.draw(f, imgs, rgba, (500, 500), (250, 250)) for f in act['actions'][0]]
    delay = act['delays'][0] * 25 if act.get('delays') else 100
    return 1000.0 / max(25.0, delay), frames, (250, 250)


def tex_frames(names, key=True):
    ims = [Image.fromarray((texture(src(EFFECT + n), key) * 255).astype(np.uint8), 'RGBA') for n in names]
    w, h = max(i.width for i in ims), max(i.height for i in ims)
    frames = []
    for im in ims:
        c = Image.new('RGBA', (w, h)); c.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2)); frames.append(c)
    return 0, frames, (w // 2, h // 2)


# ---- books --------------------------------------------------------------------------------------
def needs(kind, source):
    """Client paths a book reads."""
    if kind == 'tex':
        return [EFFECT + n for n in source]
    if kind == 'spr':
        return [SPRITE + source + '.spr', SPRITE + source + '.act']
    return [EFFECT + source + '.str']       # its textures are listed in the manifest by the pin step


def bake(key):
    kind, source, opt = BOOKS[key]
    fps, frames, origin = (str_frames(source) if kind == 'str' else spr_frames(source) if kind == 'spr'
                           else tex_frames(source, opt.get('key', True)))
    if kind != 'tex':
        # drop empty lead-in and tail frames, then thin to FRAMES_MAX
        live = [i for i, f in enumerate(frames) if f.getbbox()]
        if not live:
            raise SystemExit('%s: nothing was drawn' % key)
        frames = frames[live[0]:live[-1] + 1]
        if len(frames) > FRAMES_MAX:
            stride = math.ceil(len(frames) / FRAMES_MAX)
            frames, fps = frames[::stride], fps / stride
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    w, h = x1 - x0, y1 - y0
    scale = min(1.0, CELL_MAX / max(w, h))
    cw, ch = max(1, round(w * scale)), max(1, round(h * scale))
    cols = math.ceil(math.sqrt(len(frames) * ch / cw)) or 1
    cols = max(1, min(len(frames), cols))
    rows = math.ceil(len(frames) / cols)
    atlas = Image.new('RGBA', (cols * cw, rows * ch))
    for i, f in enumerate(frames):
        cell = f.crop((x0, y0, x1, y1))
        if scale < 1:
            cell = cell.resize((cw, ch), Image.LANCZOS)
        atlas.alpha_composite(cell, ((i % cols) * cw, (i // cols) * ch))
    buf = io.BytesIO()
    atlas.save(buf, 'WEBP', quality=84, method=6, alpha_quality=92)
    # u = cell height in hero heights; ox/oy = where the effect origin sits in the cell (0..1, y down)
    meta = {'file': key + '.webp', 'n': len(frames), 'cols': cols, 'rows': rows, 'w': cw, 'h': ch,
            'fps': round(fps, 2), 'u': round(h / HERO_PX, 3),
            'ox': round((origin[0] - x0) / w, 3), 'oy': round((origin[1] - y0) / h, 3)}
    return buf.getvalue(), meta, atlas


def render():
    fetch()
    files, books = {}, {}
    for key in BOOKS:
        data, meta, _ = bake(key)
        files[key + '.webp'] = data
        books[key] = meta
    index = ('// Original Ragnarok Online skill effects, baked to flipbooks by tools/make_ro_fx.py. Do not hand edit.\n'
             '// Sources: tools/native-expanded/fx-source-manifest.json.\n'
             'window.RO_FX=%s;\n' % json.dumps({'dir': 'assets/ro-fx/', 'books': books}, separators=(',', ':'), sort_keys=True))
    files['index.js'] = index.encode('utf-8')
    return files


def main():
    if '--sheet' in sys.argv:
        fetch()
        out = sys.argv[sys.argv.index('--sheet') + 1]
        keys = sys.argv[sys.argv.index('--sheet') + 2:] or list(BOOKS)
        rows = []
        for key in keys:
            _, meta, atlas = bake(key)
            pick = [round(i * (meta['n'] - 1) / 9) for i in range(10)] if meta['n'] > 10 else list(range(meta['n']))
            rows.append([atlas.crop(((i % meta['cols']) * meta['w'], (i // meta['cols']) * meta['h'],
                                     (i % meta['cols'] + 1) * meta['w'], (i // meta['cols'] + 1) * meta['h'])) for i in pick])
        cell = 110
        sheet = Image.new('RGBA', (10 * cell, len(rows) * cell), (34, 38, 54, 255))
        for y, row in enumerate(rows):
            for x, im in enumerate(row):
                im = im.copy(); im.thumbnail((cell - 6, cell - 6))
                sheet.alpha_composite(im, (x * cell + (cell - im.width) // 2, y * cell + (cell - im.height) // 2))
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        sheet.save(out)
        return
    files = render()
    if '--check' in sys.argv:
        have = sorted(os.listdir(OUT)) if os.path.isdir(OUT) else []
        if have != sorted(files) or any(open(os.path.join(OUT, n), 'rb').read() != d for n, d in files.items()):
            raise SystemExit('assets/ro-fx/ is stale: run python3 tools/make_ro_fx.py')
        print('RO effect pack is current (%d books).' % len(BOOKS))
        return
    os.makedirs(OUT, exist_ok=True)
    for n in os.listdir(OUT):
        if n not in files:
            os.remove(os.path.join(OUT, n))
    for n, d in files.items():
        open(os.path.join(OUT, n), 'wb').write(d)
    print('wrote %d files, %.2f MiB' % (len(files), sum(len(d) for d in files.values()) / 1048576))


if __name__ == '__main__':
    main()
