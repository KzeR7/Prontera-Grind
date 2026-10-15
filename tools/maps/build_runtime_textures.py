#!/usr/bin/env python3
"""Lossless environment-only delivery copies. Never edits PNG masters/native sprites.
Requires Pillow with WebP. Run from the repository root.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
DIRECTORY = ROOT / 'textures'
NAMES = {'stone': 'weathered-stone', 'lava': 'molten-basalt', 'space': 'astral-void'}
sha = lambda data: hashlib.sha256(data).hexdigest()


def build():
    manifest_path = DIRECTORY / 'runtime-manifest.json'
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'textures': {}}
    records = {}
    for key, name in NAMES.items():
        source = DIRECTORY / (name + '.png')
        with Image.open(source) as image:
            image.load()
            if image.mode not in ('RGB', 'RGBA'):
                raise ValueError('Unexpected master mode: ' + str(source))
            from io import BytesIO
            stream = BytesIO()
            options = {'lossless': True, 'quality': 100, 'method': 6, 'exact': True}
            if image.info.get('icc_profile'):
                options['icc_profile'] = image.info['icc_profile']
            image.save(stream, 'WEBP', **options)
            data = stream.getvalue()
            with Image.open(BytesIO(data)) as decoded:
                if decoded.convert(image.mode).tobytes() != image.tobytes():
                    raise ValueError('Lossless pixel verification failed: ' + name)
            if len(data) >= source.stat().st_size:
                raise ValueError('Delivery copy must be smaller: ' + name)
            filename = name + '-' + sha(data)[:12] + '.webp'
            (DIRECTORY / filename).write_bytes(data)
            records[key] = {'file': filename, 'bytes': len(data), 'sha256': sha(data),
                            'width': image.width, 'height': image.height, 'mode': image.mode,
                            'pixelSha256': sha(image.tobytes()), 'source': source.name,
                            'sourceBytes': source.stat().st_size, 'sourceSha256': sha(source.read_bytes())}
    manifest = {'schemaVersion': 1, 'encoding': 'lossless-webp',
                'note': 'Pixel-identical environment delivery copies; PNG masters and native sprites unchanged.',
                'destinations': {'astral': ['stone', 'space'], 'thor': ['stone', 'lava']}, 'textures': records}
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    # Remove only old generated copies named by our previous manifest; never source artwork.
    keep = {record['file'] for record in records.values()}
    for record in previous.get('textures', {}).values():
        name = record.get('file', '')
        if name not in keep and Path(name).name == name and name.endswith('.webp') and any(name.startswith(stem + '-') for stem in NAMES.values()):
            (DIRECTORY / name).unlink(missing_ok=True)
    before = sum(record['sourceBytes'] for record in records.values())
    after = sum(record['bytes'] for record in records.values())
    print(f'Environment delivery: {before:,} -> {after:,} bytes ({100 * (1 - after / before):.1f}% smaller), exact pixels.')


if __name__ == '__main__':
    build()
