#!/usr/bin/env python3
"""Preserve exact cells from additional collections by the reference icon artist."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def build(source, check=False):
    mapping = json.loads((ROOT / 'tools/native-skill-icons/extra-source-map.json').read_text())
    output = ROOT / 'assets/skill-icons/extra'
    output.mkdir(parents=True, exist_ok=True)
    sheets = {}
    for key, rec in mapping['sources'].items():
        path = source / rec['file']
        data = path.read_bytes()
        assert len(data) == rec['bytes'] and hashlib.sha256(data).hexdigest() == rec['sha256'], key
        sheets[key] = Image.open(path).convert('RGBA')
    registry, assets, pixels = {}, {}, set()
    for key, rec in mapping['items'].items():
        crop = sheets[rec['source']].crop(rec['box'])
        fingerprint = hashlib.sha256(crop.tobytes()).hexdigest()
        assert fingerprint not in pixels, f'Repeated icon pixels: {key}'
        pixels.add(fingerprint)
        path = output / (key + '.png')
        if not check:
            crop.save(path, optimize=True)
        assert Image.open(path).convert('RGBA').tobytes() == crop.tobytes(), key
        data = path.read_bytes()
        assets[path.name] = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), rgbaSha256=fingerprint)
        registry[key] = dict(file='extra/' + path.name, family=rec['family'], subject=rec['subject'])
    js = ('/* Exact cells from the reference artist\'s RPG Skills Icons 08, 10 and 12. */\n'
          '(function(root){Object.assign(root.PGSkillIcons,' + json.dumps(registry, separators=(',', ':')) +
          ');})(typeof globalThis===\'object\'?globalThis:this);\n')
    catalog = json.dumps(dict(version=1, sources=mapping['sources'], assets=assets), separators=(',', ':')) + '\n'
    if check:
        assert (ROOT / 'assets/skill-icons-extra.js').read_text() == js
        assert (output / 'catalog.json').read_text() == catalog
    else:
        (ROOT / 'assets/skill-icons-extra.js').write_text(js)
        (output / 'catalog.json').write_text(catalog)
    print(f'{len(registry)} unique exact icon crops verified; 36 fourth-job skills and four pet buffs')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    build(args.source, args.check)
