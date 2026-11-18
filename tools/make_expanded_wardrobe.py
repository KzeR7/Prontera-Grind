#!/usr/bin/env python3
"""Build the Wardrobe pack for the expanded roster (assets/wardrobe/expanded/v1/).

The shipped Wardrobe (assets/wardrobe/v5/, built by the Go tools in tools/native-wardrobe/)
layers a body atlas, a hair atlas and accessory atlases on a 320x280 canvas whose ground point
is (160,200). This tool adds the 22 expanded classes to that system without touching v5:

  bodies       rendered here from the same native .spr / .act files as assets/sprite-pack-x/
               (tools/native-expanded/source-manifest.json), one atlas per class and gender.
  hair, head,  NOT re-rendered. The client pins a head (and everything worn on it) to the body
  face, mouth  with one rule:  position = body attach point - head attach point + own offset.
               Only the body attach point depends on the job, so each v5 route of the reference
               job (Knight) is moved by (new job's attach point - Knight's attach point), frame
               by frame. Checked against v5 itself: Novice, Archer, Mage and Lord Knight routes
               predicted from the Knight's this way match v5 to the pixel.
  wings / back v5 holds per-job garment data that does not exist for these jobs, so the Knight's
               garment frames are reused and moved by the same attach-point difference. This is
               an approximation (a few pixels off where the real client data would differ).

Nothing of v5 is copied. The pack ships 44 body atlases and one catalog holding every job's
attach points ("tracks") and the Knight's ("reference"); the game moves the v5 hair and
accessory routes itself when a look is put on (PGExpandedJobs.Store.route in
assets/expanded-jobs.js does exactly what reroute() does here, and
tools/tests/expanded_wardrobe_sim.js holds the two to the same result).

usage:
    python3 tools/make_expanded_wardrobe.py            # fetch (if needed) and rebuild
    python3 tools/make_expanded_wardrobe.py --check    # verify the committed output (offline)
    python3 tools/make_expanded_wardrobe.py --sheet out.png [class ...]   # contact sheet for review
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
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'native-expanded'))
import roact  # noqa: E402
import make_expanded_pack as pack  # noqa: E402

V5 = os.path.join(REPO, 'assets', 'wardrobe', 'v5')
OUT_DIR = os.path.join(REPO, 'assets', 'wardrobe', 'expanded', 'v1')
MANIFEST = os.path.join(HERE, 'native-expanded', 'wardrobe-source-manifest.json')
OUTPUTS = os.path.join(HERE, 'native-expanded', 'wardrobe-output-manifest.json')
CACHE = pack.CACHE
SHARED = '../../v5/'

REF_JOB = 7                      # Knight: the v5 routes every expanded job is derived from
ORIGIN = (160, 200)
CANVAS = (320, 280)
# class -> (client job id, male body, female body). One id per class: the Bard / Dancer style
# pairs simply have a different body behind base-<id>-m and base-<id>-f.
JOBS = {
    'Crusader': (14, 'crusader'), 'Paladin': (4015, 'paladin'), 'Royal Guard': (4066, 'royal_guard'),
    'Sage': (16, 'sage'), 'Scholar': (4017, 'scholar'), 'Sorcerer': (4067, 'sorcerer'),
    'Alchemist': (18, 'alchemist'), 'Biochemist': (4019, 'biochemist'), 'Geneticist': (4071, 'geneticist'),
    'Monk': (15, 'monk'), 'Champion': (4016, 'champion'), 'Sura': (4070, 'sura'),
    'Rogue': (17, 'rogue'), 'Stalker': (4018, 'stalker'), 'Shadow Chaser': (4072, 'shadow_chaser'),
    'Bard & Dancer': (19, 'bard'), 'Minstrel & Gypsy': (4020, 'minstrel'), 'Maestro & Wanderer': (4068, 'maestro'),
    'Ninja': (25, 'ninja'), 'Gunslinger': (24, 'gunslinger'),
    'Kagerou & Oboro': (4211, 'kagerou'), 'Rebellion': (4215, 'rebellion'),
}
STANCES = ('idle', 'walk', 'attack', 'sit')   # 'sit' is only used by the Social Hub (assets/social/sitting/)
KEYS = [s + str(d) for s in STANCES for d in range(8)]
ASURA_CLASSES = {'Monk', 'Champion', 'Sura'}
# The visually verified one-hand-down impact in the pinned Monk-line ACT files (zero-based).
ASURA_ACTION, ASURA_FRAME = 96, 2
STAND = [k for k in KEYS if not k.startswith('sit')]
SITTING = os.path.join(REPO, 'assets', 'social', 'sitting')


def fetch():
    pack.fetch()
    for rec in json.load(open(MANIFEST, encoding='utf-8'))['files']:
        path = os.path.join(CACHE, rec['name'])
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            raw = subprocess.check_output(['gh', 'api', 'repos/%s/git/blobs/%s' % (rec['repo'], rec['blob'])])
            open(path, 'wb').write(base64.b64decode(json.loads(raw)['content']))
        data = open(path, 'rb').read()
        if len(data) != rec['bytes'] or hashlib.sha256(data).hexdigest() != rec['sha256']:
            raise SystemExit('source %s does not match the manifest' % rec['name'])


def v5_meta(catalog, key):
    m = json.load(open(os.path.join(V5, catalog['assets'][key]['meta'])))
    if 'layers' in m:
        m['poses'] = [[m['layers'][i] for i in p] for p in m['poses']]
    return m


def paint(frame, imgs, rgba, shift=(0, 0)):
    """One ACT frame on a padded canvas, centred the way the v5 exporter centres a layer
    (a mirrored layer rounds the other way). Returns (image, x, y) trimmed to its pixels."""
    pad = 120
    out = Image.new('RGBA', (CANVAS[0] + 2 * pad, CANVAS[1] + 2 * pad))
    for layer in frame['layers']:
        src = rgba if layer['type'] == 1 else imgs
        if layer['spr'] < 0 or layer['spr'] >= len(src):
            continue
        im = src[layer['spr']]
        if layer['mirror']:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if abs(layer['sx'] - 1) > 1e-6 or abs(layer['sy'] - 1) > 1e-6:
            im = im.resize((max(1, round(im.width * abs(layer['sx']))), max(1, round(im.height * abs(layer['sy'])))), Image.NEAREST)
        if layer['angle']:
            im = im.rotate(-layer['angle'], expand=True, resample=Image.NEAREST)
        half = im.width // 2 if layer['mirror'] else (im.width + 1) // 2
        out.alpha_composite(im, (pad + ORIGIN[0] + shift[0] + layer['x'] - half,
                                 pad + ORIGIN[1] + shift[1] + layer['y'] - (im.height + 1) // 2))
    box = out.getbbox()
    if not box:
        return None
    return out.crop(box), box[0] - pad, box[1] - pad


def job_frames(src, sex, asura=False):
    """ACT frames per stance+direction, their delay, and the gun (if the job holds one)."""
    act, imgs, rgba = pack.load('body/%s_%s' % (src, sex))
    held = pack.held_weapon(src, sex)
    first = {'idle': 0, 'walk': 8, 'attack': pack.attack_action(src, held), 'sit': 16}
    frames, delay, guns = {}, {}, {}
    if asura:
        first['asura'] = ASURA_ACTION
    for stance in first:
        for d in range(8):
            fs = act['actions'][first[stance] + d]
            key = stance + str(d)
            if stance == 'asura':
                frames[key] = [fs[ASURA_FRAME]]
            else:
                frames[key] = [fs[0]] * 3 if stance in ('idle', 'sit') else fs[:32]
            delay[key] = int(round(act['delays'][first[stance] + d] * 25))
            if held and stance == 'attack':
                guns[key] = held[0]['actions'][first[stance] + d]
    return frames, delay, imgs, rgba, held, guns


class Atlas:
    """Shelf packer with exact de-duplication."""

    def __init__(self, width=512):
        self.width, self.images, self.index = width, [], {}

    def add(self, im):
        k = (im.size, im.tobytes())
        if k not in self.index:
            self.index[k] = len(self.images)
            self.images.append(im)
        return self.index[k]

    def finish(self):
        order = sorted(range(len(self.images)), key=lambda i: (-self.images[i].height, -self.images[i].width, i))
        pos, x, y, row = {}, 0, 0, 0
        for i in order:
            w, h = self.images[i].size
            if x + w > self.width:
                x, y, row = 0, y + row + 1, 0
            pos[i] = (x, y)
            x, row = x + w + 1, max(row, h)
        sheet = Image.new('RGBA', (self.width, y + row))
        for i, (px, py) in pos.items():
            sheet.paste(self.images[i], (px, py))
        return sheet, pos


def png(im):
    """Smallest lossless PNG: an indexed image when the sheet has at most 256 colours."""
    best = None
    colours = im.getcolors(256)
    if colours:
        pal = [c for _, c in colours]
        lut = {bytes(c): i for i, c in enumerate(pal)}
        data = im.tobytes()
        p = Image.frombytes('P', im.size, bytes(lut[data[i:i + 4]] for i in range(0, len(data), 4)))
        p.putpalette([v for c in pal for v in c[:3]])
        buf = io.BytesIO()
        p.save(buf, 'PNG', optimize=True, transparency=bytes(c[3] for c in pal))
        if Image.open(io.BytesIO(buf.getvalue())).convert('RGBA').tobytes() == im.tobytes():
            best = buf.getvalue()
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return best if best and len(best) < len(buf.getvalue()) else buf.getvalue()


def pose_table(actions):
    """actions {name: {delay, frames:[[layer,...],...]}} -> metadata dict with layer/pose tables."""
    layers, poses, li, pi, out = [], [], {}, {}, {}
    for name, a in actions.items():
        idx = []
        for frame in a['frames']:
            refs = []
            for layer in frame:
                t = tuple(layer)
                if t not in li:
                    li[t] = len(layers)
                    layers.append(list(layer))
                refs.append(li[t])
            t = tuple(refs)
            if t not in pi:
                pi[t] = len(poses)
                poses.append(refs)
            idx.append(pi[t])
        out[name] = {'delay': a['delay'], 'frames': idx}
    return layers, poses, out


def dump(obj):
    return json.dumps(obj, separators=(',', ':')).encode()


def record(files, meta, image=None):
    data = dump(meta)
    name = 'poses-%s.json' % hashlib.sha256(data).hexdigest()[:20]
    files[name] = data
    rec = {'meta': name, 'metaSha256': hashlib.sha256(data).hexdigest(), 'metaBytes': len(data)}
    if image is not None:
        iname = 'atlas-%s.png' % hashlib.sha256(image).hexdigest()[:20]
        files[iname] = image
        rec.update(image=iname, imageSha256=hashlib.sha256(image).hexdigest(), imageBytes=len(image))
    return rec


def fit(layer):
    """Keep a moved layer inside the canvas the runtime validates."""
    layer[4] = max(0, min(CANVAS[0] - layer[2], layer[4]))
    layer[5] = max(0, min(CANVAS[1] - layer[3], layer[5]))
    return layer


def reroute(ref_action, ref_base_n, ref_anchor, anchors, delay, clock):
    """Move one v5 route of the reference job onto another job's attach points."""
    rf, n, m = ref_action['frames'], len(anchors), len(ref_anchor)
    def moved(pose, a, b):
        return [fit(list(l[:4]) + [l[4] + a[0] - b[0], l[5] + a[1] - b[1]] + list(l[6:])) for l in pose]
    if clock == 'independent' or len(rf) != ref_base_n:
        # the piece runs its own loop: keep it, pinned to the first frame of the action
        return {'delay': ref_action['delay'] if clock == 'independent' else delay,
                'frames': [moved(p, anchors[0], ref_anchor[0]) for p in rf]}
    frames = []
    for i in range(n):
        r = i if n == m else int(round(i * (m - 1) / max(1, n - 1)))
        frames.append(moved(rf[r], anchors[i], ref_anchor[r]))
    return {'delay': delay, 'frames': frames}


def build():
    fetch()
    catalog = json.load(open(os.path.join(V5, 'catalog.json')))
    files, assets, tracks, reference = {}, {}, {}, {}
    for si, sex in enumerate('mf'):
        ract = roact.read_act(os.path.join(CACHE, 'ref', 'knight_%s.act' % sex))
        rbase = v5_meta(catalog, 'base-%d-%s' % (REF_JOB, sex))
        ratlas = Image.open(os.path.join(V5, catalog['assets']['base-%d-%s' % (REF_JOB, sex)]['image'])).convert('RGBA')
        ref_anchor, ref_n = {}, {}
        sit_cat = json.load(open(os.path.join(SITTING, 'catalog.json')))
        sit_base = json.load(open(os.path.join(SITTING, sit_cat['assets']['base-%d-%s' % (REF_JOB, sex)]['meta'])))
        for stance, first in (('idle', 0), ('walk', 8), ('attack', 80), ('sit', 16)):
            for d in range(8):
                fs = ract['actions'][first + d]
                key = stance + str(d)
                ref_anchor[key] = [fs[0]['anchors'][0]] * 3 if stance in ('idle', 'sit') else [f['anchors'][0] for f in fs]
                ref_n[key] = len((sit_base if stance == 'sit' else rbase)['actions'][key]['frames'])
                if ref_n[key] != len(ref_anchor[key]):
                    raise SystemExit('the reference Knight no longer matches v5 (%s)' % key)
        shadow = [l for l in rbase['poses'][rbase['actions']['idle0']['frames'][0]] if l[7] == 'shadow'][0]
        sit_shadow = any(l[7] == 'shadow' for p in sit_base['poses'] for l in (p if isinstance(p[0], list) else [sit_base['layers'][i] for i in p]))
        shadow_im = ratlas.crop((shadow[0], shadow[1], shadow[0] + shadow[2], shadow[1] + shadow[3]))
        ref_hair = v5_meta(catalog, 'hair-%s-2-0' % sex)
        ref_hair0 = ref_hair['poses'][ref_hair['actions']['%d:idle0' % REF_JOB]['frames'][0]]

        job_anchor, job_delay = {}, {}
        for cls, (job, male) in JOBS.items():
            src = male if sex == 'm' else pack.FEMALE_OF.get(male, male)
            asura = cls in ASURA_CLASSES
            frames, delay, imgs, rgba, held, guns = job_frames(src, sex, asura)
            atlas, raw = Atlas(), {}
            sid = atlas.add(shadow_im)
            anchors = {}
            for key in frames:
                back = key[-1] in '2345'
                poses = []
                anchors[key] = [f['anchors'][0] for f in frames[key]]
                for i, fr in enumerate(frames[key]):
                    layers = [(sid, shadow[4], shadow[5], -1000, 'shadow')] if sit_shadow or not key.startswith('sit') else []
                    body = paint(fr, imgs, rgba)
                    if body:
                        layers.append((atlas.add(body[0]), body[1], body[2], 15000 if back else 10000, 'body'))
                    if key in guns:
                        gf = guns[key][min(i, len(guns[key]) - 1)]
                        ga = gf['anchors'][0] if gf['anchors'] else fr['anchors'][0]
                        gun = paint(gf, held[1], held[2], (fr['anchors'][0][0] - ga[0], fr['anchors'][0][1] - ga[1]))
                        if gun:
                            layers.append((atlas.add(gun[0]), gun[1], gun[2], 28000 if back else 23000, 'weapon'))
                    poses.append(layers)
                raw[key] = poses
            sheet, pos = atlas.finish()
            actions = {}
            for key in frames:
                out = []
                for layers in raw[key]:
                    out.append([fit([pos[i][0], pos[i][1], atlas.images[i].width, atlas.images[i].height, x, y, z, slot])
                                for i, x, y, z, slot in layers])
                actions[key] = {'delay': delay[key], 'frames': out}
            ltab, ptab, atab = pose_table(actions)
            meta = {'version': 2, 'width': sheet.width, 'height': sheet.height, 'layers': ltab, 'poses': ptab, 'actions': atab}
            rec = record(files, meta, png(sheet))
            rec.update(width=sheet.width, height=sheet.height)
            if asura:
                rec['asura'] = True
            # v5's rule: height of body + default hair in the resting pose (keeps world scale)
            b0 = [l for l in actions['idle0']['frames'][0] if l[7] == 'body']
            h0 = reroute({'delay': 100, 'frames': [ref_hair0]}, 1, ref_anchor['idle0'][:1], anchors['idle0'][:1], 100, None)['frames'][0]
            both = b0 + h0
            rec['figureHeight'] = max(l[5] + l[3] for l in both) - min(l[5] for l in both)
            assets['base-%d-%s' % (job, sex)] = rec
            job_anchor[job], job_delay[job] = anchors, delay

        tracks[sex] = {str(job): {key: {'d': job_delay[job][key], 'a': [list(x) for x in job_anchor[job][key]]} for key in job_anchor[job]} for job in job_anchor}
        reference[sex] = {key: [list(x) for x in ref_anchor[key]] for key in KEYS}

    # "shared" + "reference" + "tracks" are all the runtime needs to move a v5 hair / accessory
    # route onto an expanded job (PGExpandedJobs.Store.route does what reroute() does here).
    out = {'version': 2, 'width': CANVAS[0], 'height': CANVAS[1], 'anchor': list(ORIGIN), 'shared': SHARED,
           'referenceJob': REF_JOB, 'reference': reference, 'tracks': tracks,
           'classes': {cls: job for cls, (job, _) in JOBS.items()}, 'outfits': {}, 'accessories': catalog['accessories'],
           'assets': dict(sorted(assets.items()))}
    files['catalog.json'] = dump(out) + b'\n'
    return files


def derived(cat, v5, key, job, sex):
    """The routes of one v5 hair / accessory asset for one expanded job (what the game derives)."""
    ref = v5_meta(v5, key)
    rj, track = cat['referenceJob'], cat['tracks'][sex][str(job)]
    base = v5_meta(v5, 'base-%d-%s' % (rj, sex))
    actions = {}
    for k in STAND:
        ra = ref['actions']['%d:%s' % (rj, k)]
        actions[k] = reroute({'delay': ra['delay'], 'frames': [ref['poses'][i] for i in ra['frames']]},
                             len(base['actions'][k]['frames']), cat['reference'][sex][k], track[k]['a'], track[k]['d'], ref.get('clock'))
    return {'clock': ref.get('clock'), 'actions': actions}


def sheet(path, classes):
    """Contact sheet: what PGWardrobe.draw() composes, for a few looks per class."""
    cat = json.load(open(os.path.join(OUT_DIR, 'catalog.json')))
    v5 = json.load(open(os.path.join(V5, 'catalog.json')))
    def load(key, job=None, sex=None):
        if job is None:
            r = cat['assets'][key]
            m = json.load(open(os.path.join(OUT_DIR, r['meta'])))
            m['poses'] = [[m['layers'][i] for i in p] for p in m['poses']]
            return m, Image.open(os.path.join(OUT_DIR, r['image'])).convert('RGBA')
        return derived(cat, v5, key, job, sex), Image.open(os.path.join(V5, v5['assets'][key]['image'])).convert('RGBA')
    looks = [('m', 2, 0, []), ('f', 2, 0, []), ('m', 12, 3, ['halo', 'glasses', 'wings']), ('f', 19, 5, ['catEars', 'flower', 'mechanicWings'])]
    shots = [('idle', 0, 0), ('idle', 2, 0), ('idle', 4, 0), ('idle', 6, 0), ('walk', 1, 2), ('walk', 5, 5), ('attack', 0, 1), ('attack', 0, 4), ('attack', 6, 3), ('attack', 3, 3)]
    classes = classes or list(JOBS)
    cw, ch = 110, 130
    out = Image.new('RGBA', (cw * len(shots), ch * len(looks) * len(classes)), (52, 60, 72, 255))
    for ci, cls in enumerate(classes):
        job = cat['classes'][cls]
        for li, (sex, head, color, worn) in enumerate(looks):
            parts = [load('base-%d-%s' % (job, sex)), load('hair-%s-%d-%d' % (sex, head, color), job, sex)] + [load('piece-%s-%s' % (p, sex), job, sex) for p in worn]
            for xi, (stance, d, f) in enumerate(shots):
                layers = []
                for pi, (m, im) in enumerate(parts):
                    a = m['actions'][stance + str(d)]
                    for l in (m['poses'][a['frames'][min(f, len(a['frames']) - 1)]] if pi == 0 else a['frames'][min(f, len(a['frames']) - 1)]):
                        layers.append((l[6], len(layers), l, im))
                canvas = Image.new('RGBA', CANVAS)
                for _, _, l, im in sorted(layers, key=lambda t: (t[0], t[1])):
                    canvas.alpha_composite(im.crop((l[0], l[1], l[0] + l[2], l[1] + l[3])), (l[4], l[5]))
                out.alpha_composite(canvas.crop((160 - cw // 2, 215 - ch, 160 + cw // 2, 215)), (xi * cw, (ci * len(looks) + li) * ch))
    out.save(path)


def main():
    if '--sheet' in sys.argv:
        i = sys.argv.index('--sheet')
        sheet(sys.argv[i + 1], sys.argv[i + 2:])
        return 0
    if '--fixture' in sys.argv:
        # What the game must derive for a few looks; tools/tests/expanded_wardrobe_sim.js compares.
        cat = json.load(open(os.path.join(OUT_DIR, 'catalog.json')))
        v5 = json.load(open(os.path.join(V5, 'catalog.json')))
        out = {}
        for key, cls in (('hair-m-2-0', 'Royal Guard'), ('hair-f-19-4', 'Maestro & Wanderer'), ('piece-halo-m', 'Gunslinger'), ('piece-wings-f', 'Sura'),
                         ('piece-afkBalloon-m', 'Ninja'), ('piece-blackThunder-f', 'Kagerou & Oboro'), ('piece-foxEars-m', 'Rebellion'), ('piece-flower-f', 'Sage')):
            sex = key.split('-')[1] if key.startswith('hair') else key[-1]
            d = derived(cat, v5, key, cat['classes'][cls], sex)
            out['%s|%s' % (key, cls)] = hashlib.sha256(dump({k: d['actions'][k] for k in STAND})).hexdigest()
        json.dump({'note': 'sha256 of JSON.stringify(routes) per "asset|class", written by tools/make_expanded_wardrobe.py --fixture', 'routes': out},
                  open(os.path.join(HERE, 'tests', 'fixtures', 'expanded_wardrobe_routes.json'), 'w'), indent=1)
        return 0
    if '--check' in sys.argv:
        want = json.load(open(OUTPUTS))['files']
        have = sorted(os.listdir(OUT_DIR)) if os.path.isdir(OUT_DIR) else []
        bad = [n for n in sorted(set(have) | set(want))
               if n not in want or n not in have
               or hashlib.sha256(open(os.path.join(OUT_DIR, n), 'rb').read()).hexdigest() != want[n]]
        if bad:
            print('expanded wardrobe pack is STALE: ' + ', '.join(bad[:8]))
            return 1
        cat = json.load(open(os.path.join(OUT_DIR, 'catalog.json')))
        print('Expanded wardrobe pack is current (%d classes, %d files).' % (len(cat['classes']), len(have)))
        return 0
    files = build()
    os.makedirs(OUT_DIR, exist_ok=True)
    for old in os.listdir(OUT_DIR):
        if old not in files:
            os.remove(os.path.join(OUT_DIR, old))
    for name, data in files.items():
        open(os.path.join(OUT_DIR, name), 'wb').write(data)
    json.dump({'files': {n: hashlib.sha256(d).hexdigest() for n, d in sorted(files.items())}}, open(OUTPUTS, 'w'), indent=1)
    total = sum(len(d) for d in files.values())
    print('wrote %d files, %.2f MiB (catalog %.0f KiB)' % (len(files), total / 1048576, len(files['catalog.json']) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
