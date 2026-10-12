#!/usr/bin/env python3
"""Losslessly compact a wardrobe catalog into an empty, separate destination."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
from wardrobe_png import encode_png


def optimize(source, output):
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('Use an empty output directory')
    catalog = json.loads((source / 'catalog.json').read_text())
    converted = {}
    for record in catalog['assets'].values():
        name = record['image']
        if name not in converted:
            original = (source / name).read_bytes()
            assert hashlib.sha256(original).hexdigest() == record['imageSha256']
            candidate = encode_png(Image.open(source / name))
            pixels = candidate if len(candidate) < len(original) else original
            digest = hashlib.sha256(pixels).hexdigest()
            filename = 'atlas-' + digest[:20] + '.png'
            (output / filename).write_bytes(pixels)
            converted[name] = filename, digest, len(pixels)
        record['image'], record['imageSha256'], record['imageBytes'] = converted[name]
        metadata = (source / record['meta']).read_bytes()
        assert hashlib.sha256(metadata).hexdigest() == record['metaSha256']
        (output / record['meta']).write_bytes(metadata)
    (output / 'catalog.json').write_text(json.dumps(catalog, separators=(',', ':')) + '\n')
    before = sum(path.stat().st_size for path in source.iterdir())
    after = sum(path.stat().st_size for path in output.iterdir())
    print(json.dumps(dict(beforeBytes=before, afterBytes=after, savedBytes=before-after)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    optimize(args.source, args.output)
