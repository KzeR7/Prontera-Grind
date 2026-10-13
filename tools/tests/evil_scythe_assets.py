#!/usr/bin/env python3
"""Audit appended Evil Scythe pixels, native layers, independent renders and preservation."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parents[2]


def audit(pieces, proofs, source, native):
    root = REPO / 'assets/wardrobe/v5'
    catalog = json.loads((root / 'catalog.json').read_text())
    manifest = json.loads((REPO / 'tools/native-wardrobe/evil-scythe-source-manifest.json').read_text())
    baseline = json.loads(subprocess.check_output(
        ['git', 'show', manifest['baselineCommit'] + ':assets/wardrobe/v5/catalog.json'], cwd=REPO))
    assert catalog['classes'] == baseline['classes'] and not catalog['outfits']
    assert catalog['accessories'] == json.loads((REPO / 'tools/native-wardrobe/accessories.json').read_text())
    previous = {record[field] for record in baseline['assets'].values()
                for field in ['image', 'meta']}
    for key, record in baseline['assets'].items():
        assert catalog['assets'][key] == record, ('changed existing asset', key)
        for field in ['image', 'meta']:
            data = (root / record[field]).read_bytes()
            assert hashlib.sha256(data).hexdigest() == record[field + 'Sha256']
            assert len(data) == record[field + 'Bytes']
    assert len({catalog['assets'][f'piece-evilScythe-{sex}'][field]
                for sex in ['m', 'f'] for field in ['image', 'meta']} - previous) == 4

    for record in manifest['files']:
        data = (source / record['path']).read_bytes()
        assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256']
    # Independently decode the SPR adapter's direct-color bank back to source PNG pixels.
    for record in manifest['files']:
        if record['kind'] != 'tree':
            continue
        data = (native / (record['nativeBase'] + '.spr')).read_bytes()
        assert data[:2] == b'SP'
        version, indexed, count = struct.unpack_from('<HHH', data, 2)
        assert version == 0x200 and indexed == 0 and count == manifest['frameCounts'][record['sex']]
        at = 8
        for index in range(count):
            width, height = struct.unpack_from('<HH', data, at)
            at += 4
            pixels = data[at:at + width * height * 4]
            at += len(pixels)
            rgba = bytes(channel for i in range(0, len(pixels), 4) for channel in pixels[i:i + 4][::-1])
            decoded = Image.frombytes('RGBA', (width, height), rgba).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            expected = Image.open(source / f'frame-{record["sex"]}-{index}.png').convert('RGBA')
            assert decoded.size == expected.size and decoded.tobytes() == expected.tobytes()

    cache = {}
    def asset(key):
        if key in cache:
            return cache[key]
        record = catalog['assets'][key]
        for field in ['meta', 'image']:
            data = (root / record[field]).read_bytes()
            assert len(data) == record[field + 'Bytes']
            assert hashlib.sha256(data).hexdigest() == record[field + 'Sha256']
        metadata = json.loads((root / record['meta']).read_text())
        image = Image.open(root / record['image']).convert('RGBA')
        assert image.size == (record['width'], record['height'])
        poses = metadata['poses']
        if 'layers' in metadata:
            poses = [[metadata['layers'][index] for index in pose] for pose in poses]
        actions = {name: dict(delay=view['delay'], frames=[poses[i] for i in view['frames']])
                   for name, view in metadata['actions'].items()}
        cache[key] = image, actions
        return cache[key]

    layers = samples = maximum = 0
    for job in catalog['classes'].values():
        for sex in ['m', 'f']:
            base_image, base = asset(f'base-{job}-{sex}')
            hair_image, hair = asset(f'hair-{sex}-2-0')
            image, actions = asset(f'piece-evilScythe-{sex}')
            exported = json.loads((pieces / str(job) / f'evilScythe-{sex}.json').read_text())
            assert len(exported) == 24
            for name, view in exported.items():
                packed = actions[f'{job}:{name}']
                assert packed['delay'] == view['delay'] == base[name]['delay']
                assert len(packed['frames']) == len(view['frames']) == len(base[name]['frames'])
                for i, (frame, original) in enumerate(zip(packed['frames'], view['frames'])):
                    assert len(frame) == len(original) == 1
                    for q, expected in zip(frame, original):
                        sx, sy, width, height, x, y, z, slot = q
                        assert 0 <= sx < sx + width <= image.width and 0 <= sy < sy + height <= image.height
                        assert 0 < x < x + width < 320 and 0 < y < y + height < 280
                        crop = image.crop((sx, sy, sx + width, sy + height))
                        digest = hashlib.sha256(f'{width}x{height}:'.encode() + crop.tobytes()).hexdigest()
                        assert dict(image=digest, x=x, y=y, z=z, slot=slot) == expected
                        layers += 1
                    if name not in ['idle0', 'walk2', 'attack4']:
                        continue
                    combined = Image.new('RGBA', (320, 280))
                    ordered = [(q, base_image) for q in base[name]['frames'][i]]
                    ordered += [(q, hair_image) for q in hair[f'{job}:{name}']['frames'][i]]
                    ordered += [(q, image) for q in frame]
                    for q, atlas in sorted(ordered, key=lambda pair: pair[0][6]):
                        sx, sy, width, height, x, y, _, _ = q
                        combined.alpha_composite(atlas.crop((sx, sy, sx + width, sy + height)), (x, y))
                    expected = Image.open(proofs / str(job) / sex / 'evilScythe' / name / f'{i}.png').convert('RGBA')
                    difference = max(hi for _, hi in ImageChops.difference(combined, expected).getextrema())
                    assert difference <= 3, (job, sex, name, i, difference)
                    maximum = max(maximum, difference)
                    samples += 1
    assert layers == 5990 and samples == 745
    print(json.dumps(dict(status='pass', exactNativeLayerFrames=layers,
                         independentCompositionSamples=samples, maxChannelDifference=maximum,
                         originalSourcePixels='exact', preservedAssetFiles=len(previous),
                         files=len(list(root.iterdir())), bytes=sum(p.stat().st_size for p in root.iterdir()))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['pieces', 'proofs', 'source', 'native']:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    audit(args.pieces, args.proofs, args.source, args.native)
