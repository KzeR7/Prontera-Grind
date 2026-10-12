#!/usr/bin/env python3
"""Recover pinned Divine Pride previews and adapt decoded data for the native renderer.

The emitted ACT/SPR files are development adapters, NOT recovered original binaries.
Only exposed animation fields and exact PNG pixels are used. Garments are unparented
in the pinned renderer; attachment points are retained without adding any offsets.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess

from PIL import Image

HERE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def sprite_bytes(images):
    # SPR 2.0 direct-color frames: bottom-up ABGR; unused indexed palette follows.
    result = bytearray(b'SP' + struct.pack('<HHH', 0x200, 0, len(images)))
    for image in images:
        result += struct.pack('<HH', *image.size)
        pixels = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()
        for i in range(0, len(pixels), 4):
            result += pixels[i:i + 4][::-1]
    return bytes(result + bytes(1024))


def action_bytes(tree, images):
    # ACT 2.5 adapter: no attack/fit ranges, sounds, RGB tints or other unexposed
    # fields are claimed as original metadata. PNGs carry source colors already.
    actions = tree['actions']
    result = bytearray(b'AC' + struct.pack('<HH', 0x205, len(actions)) + bytes(10))
    for action in actions:
        result += struct.pack('<I', len(action['motions']))
        for motion in action['motions']:
            result += bytes(32) + struct.pack('<I', len(motion['layers']))
            for layer in motion['layers']:
                index = layer['frameIndex']
                assert -1 <= index < len(images)
                assert layer['alpha'] == 1, 'Unexpected tint: inspect source before adapting'
                width, height = images[index].size if index >= 0 else (0, 0)
                result += struct.pack('<iiiIIffiiii', layer['x'], layer['y'], index,
                                      int(layer['mirror']), 0xffffffff,
                                      layer['zoomX'], layer['zoomY'], layer['angle'],
                                      1, width, height)
            result += struct.pack('<iIIiii', -1, 1, 0,
                                  motion['attachPointX'], motion['attachPointY'], 0)
    result += struct.pack('<I', 0)
    result += struct.pack('<' + 'f' * len(actions), *(a['delay'] / 25 for a in actions))
    return bytes(result)


def prepare(native_root, cache):
    manifest = json.loads((HERE / 'evil-scythe-source-manifest.json').read_text())
    cache.mkdir(parents=True, exist_ok=True)
    sources = {}
    for record in manifest['files']:
        path = cache / record['path']
        valid = lambda data: len(data) == record['bytes'] and sha(data) == record['sha256']
        if not path.is_file() or not valid(path.read_bytes()):
            data = subprocess.check_output(['curl', '--silent', '--show-error', '--fail',
                                           '--location', '--retry', '2', '--max-time', '40',
                                           record['url']])
            if not valid(data):
                raise ValueError('Preview source changed: ' + record['path'])
            temporary = path.with_suffix(path.suffix + '.tmp')
            temporary.write_bytes(data)
            temporary.replace(path)
        sources[record['path']] = path.read_bytes()
    images = {sex: [Image.open(io.BytesIO(sources[f'frame-{sex}-{i}.png'])).convert('RGBA')
                    for i in range(manifest['frameCounts'][sex])] for sex in ['m', 'f']}
    for sex in ['m', 'f']:
        reference = json.loads(sources[f'gender-reference-{sex}.json'])
        preview = json.loads(sources[f'tree-0-{sex}.json'])
        assert preview['body'] == reference['body'], 'Preview gender mismatch'
        assert preview['robe'] == reference['item'], 'Preview garment mismatch'
    outputs = {}
    for record in manifest['files']:
        if record['kind'] != 'tree':
            continue
        tree = json.loads(sources[record['path']])
        assert tree['robe'] and not tree['itemAlwaysFront']
        assert tree['robe']['frameCount'] == len(images[record['sex']])
        base = native_root / record['nativeBase']
        base.parent.mkdir(parents=True, exist_ok=True)
        for suffix, data in [('.act', action_bytes(tree['robe'], images[record['sex']])),
                             ('.spr', sprite_bytes(images[record['sex']]))]:
            target = base.with_suffix(suffix)
            relative = str(target.relative_to(native_root))
            fingerprint = dict(bytes=len(data), sha256=sha(data))
            if manifest.get('derivedFiles') and manifest['derivedFiles'].get(relative) != fingerprint:
                raise ValueError('Derived adapter changed: ' + relative)
            target.write_bytes(data)
            outputs[relative] = fingerprint
    print(json.dumps(dict(status='pass',pinnedSources=len(sources),derivedFiles=outputs)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native_root', type=Path)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.native_root, args.cache)
