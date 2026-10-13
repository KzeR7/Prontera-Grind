#!/usr/bin/env python3
"""Audit the seven added pieces, pinned inputs and the previous v132 collection."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parents[2]


def audit(native, pieces, proofs, previews):
    root = REPO / 'assets/wardrobe/v5'
    manifest = json.loads((REPO / 'tools/native-wardrobe/seven-items-source-manifest.json').read_text())
    catalog = json.loads((root / 'catalog.json').read_text())
    assert catalog['accessories'] == json.loads((REPO / 'tools/native-wardrobe/accessories.json').read_text())
    assert {k: len(v) for k, v in catalog['accessories'].items()} == dict(headwear=13, facewear=12, mouthwear=10, backwear=17)
    assert len(catalog['classes']) == 19 and not catalog['outfits']
    for key, expected in manifest['baselineAssetRecords'].items():
        record = catalog['assets'][key]
        digest = hashlib.sha256(json.dumps(record, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        assert digest == expected, ('changed previous asset record', key)
        for field in ['meta', 'image']:
            data = (root / record[field]).read_bytes()
            assert hashlib.sha256(data).hexdigest() == record[field + 'Sha256']
    for records, folder in [(manifest['files'], native), (manifest['previews'], previews)]:
        for record in records:
            data = (folder / record['path']).read_bytes()
            assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256'], record['path']
    for name, record in manifest['derivedFiles'].items():
        data = (native / name).read_bytes()
        assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256']
    # Decode every derived direct-color SPR independently back to pinned PNGs.
    source_frames = 0
    for record in manifest['previews']:
        if record['kind'] != 'tree':
            continue
        data = (native / (record['nativeBase'] + '.spr')).read_bytes()
        assert data[:2] == b'SP'
        version, indexed, count = struct.unpack_from('<HHH', data, 2)
        assert version == 0x200 and indexed == 0
        at = 8
        for i in range(count):
            w, h = struct.unpack_from('<HH', data, at)
            at += 4
            raw = data[at:at + w*h*4]
            at += len(raw)
            rgba = bytes(c for j in range(0, len(raw), 4) for c in raw[j:j+4][::-1])
            decoded = Image.frombytes('RGBA', (w, h), rgba).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            expected = Image.open(previews / record['key'] / f'frame-{record["sex"]}-{i}.png').convert('RGBA')
            assert decoded.size == expected.size and decoded.tobytes() == expected.tobytes()
            source_frames += 1
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
        assert image.size == (record['width'], record['height']) and image.width * image.height * 4 <= 4 * 1024 * 1024
        poses = metadata['poses']
        if 'layers' in metadata:
            poses = [[metadata['layers'][i] for i in p] for p in poses]
        actions = {name: dict(delay=v['delay'], frames=[poses[i] for i in v['frames']]) for name, v in metadata['actions'].items()}
        cache[key] = image, actions
        return cache[key]

    exact = samples = maximum = 0
    for job in catalog['classes'].values():
        for sex in ['m', 'f']:
            bi, base = asset(f'base-{job}-{sex}')
            hi, hair = asset(f'hair-{sex}-2-0')
            for items in manifest['items'].values():
                for item in items:
                    key = item['key']
                    image, actions = asset(f'piece-{key}-{sex}')
                    exported = json.loads((pieces / str(job) / f'{key}-{sex}.json').read_text())
                    assert len(exported) == 24
                    for name, view in exported.items():
                        packed = actions[f'{job}:{name}']
                        assert packed['delay'] == view['delay'] == base[name]['delay']
                        assert len(packed['frames']) == len(view['frames']) == len(base[name]['frames'])
                        for frame, original in zip(packed['frames'], view['frames']):
                            assert len(frame) == len(original)
                            for p, expected in zip(frame, original):
                                sx, sy, w, h, x, y, z, slot = p
                                crop = image.crop((sx, sy, sx+w, sy+h))
                                digest = hashlib.sha256(f'{w}x{h}:'.encode() + crop.tobytes()).hexdigest()
                                assert dict(image=digest, x=x, y=y, z=z, slot=slot) == expected
                                assert 0 < x < x+w < 320 and 0 < y < y+h < 280
                                exact += 1
                        if name not in ['idle0', 'walk2', 'attack4']:
                            continue
                        for i, frame in enumerate(packed['frames']):
                            result = Image.new('RGBA', (320, 280))
                            layers = [(p, bi) for p in base[name]['frames'][i]]
                            layers += [(p, hi) for p in hair[f'{job}:{name}']['frames'][i]]
                            layers += [(p, image) for p in frame]
                            for p, atlas in sorted(layers, key=lambda p: p[0][6]):
                                sx, sy, w, h, x, y, _, _ = p
                                result.alpha_composite(atlas.crop((sx, sy, sx+w, sy+h)), (x, y))
                            expected = Image.open(proofs / str(job) / sex / key / name / f'{i}.png').convert('RGBA')
                            delta = max(v[1] for v in ImageChops.difference(result, expected).getextrema())
                            assert delta <= 3, (job, sex, key, name, i, delta)
                            maximum = max(maximum, delta)
                            samples += 1
    print(json.dumps(dict(status='pass',exactLayers=exact,independentNativeCompositions=samples,
                          maximumChannelDifference=maximum,preservedAssetRecords=len(manifest['baselineAssetRecords']),
                          sourceFrames=source_frames)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['native', 'pieces', 'proofs', 'previews']:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    audit(args.native, args.pieces, args.proofs, args.previews)
