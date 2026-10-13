#!/usr/bin/env python3
"""Audit the four requested additions and preservation of the existing collection."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools/native-wardrobe'))
from build_black_thunder import read_str, render_frame


def audit(native, pieces, proofs):
    root = REPO / 'assets/wardrobe/v5'
    manifest = json.loads((REPO / 'tools/native-wardrobe/requested-items-source-manifest.json').read_text())
    catalog = json.loads((root / 'catalog.json').read_text())
    baseline = json.loads(subprocess.check_output(['git', 'show', manifest['baselineCommit'] + ':assets/wardrobe/v5/catalog.json'], cwd=REPO))
    assert catalog['classes'] == baseline['classes'] and not catalog['outfits']
    assert catalog['accessories'] == json.loads((REPO / 'tools/native-wardrobe/accessories.json').read_text())
    for key, record in baseline['assets'].items():
        assert catalog['assets'][key] == record, ('changed existing record', key)
        for field in ['meta', 'image']:
            assert hashlib.sha256((root / record[field]).read_bytes()).hexdigest() == record[field + 'Sha256']
    for record in manifest['files']:
        data = (native / record['path']).read_bytes()
        assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256'], record['path']
    cache = {}
    def asset(key):
        if key in cache:
            return cache[key]
        record = catalog['assets'][key]
        for field in ['meta', 'image']:
            data = (root / record[field]).read_bytes()
            assert len(data) == record[field + 'Bytes'] and hashlib.sha256(data).hexdigest() == record[field + 'Sha256']
        metadata = json.loads((root / record['meta']).read_text())
        image = Image.open(root / record['image']).convert('RGBA')
        assert image.size == (record['width'], record['height'])
        assert image.width * image.height * 4 <= 4 * 1024 * 1024
        poses = metadata['poses']
        if 'layers' in metadata:
            poses = [[metadata['layers'][i] for i in pose] for pose in poses]
        actions = {name: dict(delay=v['delay'], frames=[poses[i] for i in v['frames']]) for name, v in metadata['actions'].items()}
        cache[key] = image, actions
        return cache[key]

    exact = samples = maximum = 0
    for job in catalog['classes'].values():
        for sex in ['m', 'f']:
            bi, base = asset(f'base-{job}-{sex}')
            hi, hair = asset(f'hair-{sex}-2-0')
            for key in ['afkBalloon', 'dragonHelm', 'goldDragonHelm']:
                image, actions = asset(f'piece-{key}-{sex}')
                exports = json.loads((pieces / str(job) / f'{key}-{sex}.json').read_text())
                for name, view in exports.items():
                    packed = actions[f'{job}:{name}']
                    assert packed['delay'] == view['delay'] and len(packed['frames']) == len(view['frames'])
                    for frame, original in zip(packed['frames'], view['frames']):
                        assert len(frame) == len(original)
                        for layer, expected in zip(frame, original):
                            sx, sy, w, h, x, y, z, slot = layer
                            crop = image.crop((sx, sy, sx+w, sy+h))
                            digest = hashlib.sha256(f'{w}x{h}:'.encode() + crop.tobytes()).hexdigest()
                            assert dict(image=digest, x=x, y=y, z=z, slot=slot) == expected
                            exact += 1
                    if name not in ['idle0', 'walk2', 'attack4']:
                        continue
                    for i, frame in enumerate(packed['frames']):
                        result = Image.new('RGBA', (320, 280))
                        layers = [(p, bi) for p in base[name]['frames'][i % len(base[name]['frames'])]]
                        layers += [(p, hi) for p in hair[f'{job}:{name}']['frames'][i % len(hair[f'{job}:{name}']['frames'])]]
                        layers += [(p, image) for p in frame]
                        for p, atlas in sorted(layers, key=lambda p: p[0][6]):
                            sx, sy, w, h, x, y, _, _ = p
                            result.alpha_composite(atlas.crop((sx, sy, sx+w, sy+h)), (x, y))
                        expected = Image.open(proofs / str(job) / sex / key / name / f'{i}.png').convert('RGBA')
                        delta = max(v[1] for v in ImageChops.difference(result, expected).getextrema())
                        assert delta <= 2, (job, sex, key, name, i, delta)
                        maximum = max(maximum, delta)
                        samples += 1
    folder = native / 'data/texture/effect/efst_black_thunder'
    fps, length, layers = read_str(folder / 'ros2023_f.str')
    textures = {p.name.lower(): Image.open(p).convert('RGBA') for p in folder.glob('*.tga')}
    for sex in ['m', 'f']:
        image, actions = asset(f'piece-blackThunder-{sex}')
        for job in catalog['classes'].values():
            for name in ['idle', 'walk', 'attack']:
                for direction in range(8):
                    view = actions[f'{job}:{name}{direction}']
                    assert len(view['frames']) == length and view['delay'] == 1000 / fps
                    assert view == actions['0:idle0'], 'the effect is independent of job, gender and stance'
        # Fresh source rendering verifies lossless packing, not an independent STR renderer.
        for i, frame in enumerate(actions['0:idle0']['frames']):
            actual = Image.new('RGBA', (320, 280))
            for sx, sy, w, h, x, y, z, slot in frame:
                assert slot == 'blackThunder' and z == 35000
                actual.paste(image.crop((sx, sy, sx+w, sy+h)), (x, y))
            assert actual.tobytes() == render_frame(layers, textures, i).tobytes()
    print(json.dumps(dict(status='pass',exactHeadLayers=exact,independentNativeCompositions=samples,
                          maximumChannelDifference=maximum,losslessEffectFrames=2*length,
                          preservedAssetRecords=len(baseline['assets']))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['native', 'pieces', 'proofs']:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    audit(args.native, args.pieces, args.proofs)
