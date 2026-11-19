#!/usr/bin/env python3
"""Crop the owner's skill sheets, pet buff icons and title symbols without changing pixels.

Sources and crop coordinates are pinned in native-skill-icons/expanded-source-map.json.
The source sheets are kept under tools/, outside the published game. Use --check to
verify the shipped lossless WebP pixels, catalog and JavaScript against those originals.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/native-skill-icons/supplied-2026-11-19'
MAP = ROOT / 'tools/native-skill-icons/expanded-source-map.json'
SKILL_DIR = ROOT / 'assets/expanded-skill-icons'
TITLE_DIR = ROOT / 'assets/title-symbols'
REGISTRY = ROOT / 'assets/skill-icons-expanded.js'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main(check=False):
    mapping = json.loads(MAP.read_text())
    sheets = {}
    for number, source in enumerate(mapping['sources'], 1):
        path = SOURCE / source['file']
        data = path.read_bytes()
        if len(data) != source['bytes'] or digest(data) != source['sha256']:
            raise ValueError(f'source mismatch: {path}')
        sheets[number] = Image.open(path).convert('RGB')

    records, skill_catalog, title_catalog, used_boxes = {}, {}, {}, set()
    if not check:
        SKILL_DIR.mkdir(parents=True, exist_ok=True)
        TITLE_DIR.mkdir(parents=True, exist_ok=True)

    def crop(sheet, box, path, catalog):
        expected = sheets[sheet].crop(box)
        if check:
            if not path.is_file() or ImageChops.difference(expected, Image.open(path).convert('RGB')).getbbox():
                raise ValueError(f'missing or changed source pixels: {path}')
        else:
            expected.save(path, format='WEBP', lossless=True, method=6)
        data = path.read_bytes()
        catalog[path.name] = {'bytes': len(data), 'sha256': digest(data)}

    for group, family in [('skills', 'expanded'), ('pet_buffs', 'pet')]:
        for skill_id, item in mapping[group].items():
            key = (item['sheet'], *item['box'])
            if skill_id in records or key in used_boxes:
                raise ValueError(f'duplicate skill ID or crop: {skill_id}')
            used_boxes.add(key)
            path = SKILL_DIR / f'{skill_id}.webp'
            crop(item['sheet'], item['box'], path, skill_catalog)
            records[skill_id] = {'file': path.name, 'src': 'assets/expanded-skill-icons/' + path.name,
                                 'family': family, 'subject': item['subject'],
                                 'name': item['name'], 'from': item['family']}

    symbol = mapping['symbols']
    for row in range(symbol['rows']):
        for col in range(symbol['columns']):
            num = row * symbol['columns'] + col + 1
            x, y = symbol['x'] + col * symbol['dx'], symbol['y'] + row * symbol['dy']
            a, b, c, d = symbol.get('overrides', {}).get(str(num), symbol['inset'])
            crop(symbol['sheet'], [int(x+a), int(y+b), int(x+c), int(y+d)],
                 TITLE_DIR / f'{num:02d}.webp', title_catalog)

    registry = ('/* Exact owner-supplied crops for expanded class skills and pet buffs. */\n'
                '(function(root){root.PGSkillIcons=root.PGSkillIcons||{};Object.assign(root.PGSkillIcons,'
                + json.dumps(records, separators=(',', ':'), ensure_ascii=False)
                + ");})(typeof globalThis==='object'?globalThis:this);\n")
    catalogs = [(SKILL_DIR / 'catalog.json', skill_catalog), (TITLE_DIR / 'catalog.json', title_catalog)]
    if check:
        if REGISTRY.read_text() != registry:
            raise ValueError('expanded skill registry does not match source map')
        for path, content in catalogs:
            if json.loads(path.read_text()) != {'version': 1, 'assets': content}:
                raise ValueError(f'catalog does not match crops: {path}')
    else:
        REGISTRY.write_text(registry)
        for path, content in catalogs:
            path.write_text(json.dumps({'version': 1, 'assets': content}, separators=(',', ':')) + '\n')
    print(f"{'Checked' if check else 'Built'} {len(mapping['skills'])} expanded skills, "
          f"{len(mapping['pet_buffs'])} pet buffs and {len(title_catalog)} title symbols.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    main(parser.parse_args().check)
