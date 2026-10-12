#!/usr/bin/env python3
"""Crop the user's supplied skill sheets without painting or recoloring their art."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[1]


def build(source, output):
    mapping = json.loads((REPO / 'tools/native-skill-icons/source-map.json').read_text())
    output.mkdir(parents=True, exist_ok=True)
    sheets = {}
    for i, record in enumerate(mapping['sources'], 1):
        data = (source / record['file']).read_bytes()
        assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256']
        sheets[i] = Image.open(source / record['file']).convert('RGBA')
    records = {}
    for key, item in mapping['items'].items():
        image = sheets[item['sheet']].crop(item['box'])
        filename = f"sheet-{item['sheet']}-{item['row']}-{item['column']}.png"
        image.save(output / filename, optimize=True)
        records[key] = dict(file=filename, family=item['family'], subject=item['subject'])
    # The runtime registry is local. PNGs are shared by skills using the same crop.
    (REPO / 'assets/skill-icons.js').write_text(
        '/* Exact crops from the three user-provided skill sheets. */\n'
        '(function(root){root.PGSkillIcons=' + json.dumps(records, separators=(',', ':')) +
        ";if(typeof module==='object'&&module.exports)module.exports=root.PGSkillIcons;})"
        "(typeof globalThis==='object'?globalThis:this);\n")
    catalog = dict(version=1, sources=mapping['sources'], assets={})
    for filename in sorted({r['file'] for r in records.values()}):
        data = (output / filename).read_bytes()
        catalog['assets'][filename] = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    (output / 'catalog.json').write_text(json.dumps(catalog, separators=(',', ':')) + '\n')
    print(json.dumps(dict(skills=len(records), images=len(catalog['assets']),
                         bytes=sum(p.stat().st_size for p in output.iterdir()))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Folder containing sheet-1.png through sheet-3.png')
    parser.add_argument('--output', type=Path, default=REPO / 'assets/skill-icons')
    args = parser.parse_args()
    build(args.source, args.output)
