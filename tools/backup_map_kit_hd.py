#!/usr/bin/env python3
"""
Backup and integrity check for Map Kit HD (Option B: RO3 Seamless Splatmap Floor + Canopy Light & 3D Details).
  python3 tools/backup_map_kit_hd.py          # refresh backup files from live index.html and assets/kit/
  python3 tools/backup_map_kit_hd.py --check  # verify backups match live files byte for byte
"""
import hashlib
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INDEX = os.path.join(ROOT, 'index.html')
BACKUP_JS = os.path.join(ROOT, 'Updates', 'map-textures-preview', 'map_kit_hd_option_b.js')

START_MARK = '// ----- The map kit: terrains, water, bridges and props'
END_MARK = '// ----- Ragnarok-style 8-dir sprites'

ASSET_PAIRS = [
    ('assets/kit/ro-tiles-hd.png', 'Updates/map-sprites-v2/ro-tiles-hd.png'),
    ('assets/kit/ro-tiles-hd.json', 'Updates/map-sprites-v2/ro-tiles-hd.json'),
    ('assets/kit/ro-spritesheet.png', 'Updates/map-sprites-v2/ro-spritesheet.png'),
    ('assets/kit/ro-spritesheet.json', 'Updates/map-sprites-v2/ro-spritesheet.json'),
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def extract_kit_block():
    with open(INDEX, 'r', encoding='utf-8') as f:
        src = f.read()
    i = src.find(START_MARK)
    j = src.find(END_MARK, i)
    if i < 0 or j < 0:
        raise RuntimeError('Could not locate map kit markers in index.html')
    return src[i:j]


def main():
    check_only = '--check' in sys.argv[1:]
    block = extract_kit_block()

    if check_only:
        if not os.path.exists(BACKUP_JS):
            print('FAIL: missing backup file', BACKUP_JS)
            sys.exit(1)
        with open(BACKUP_JS, 'r', encoding='utf-8') as f:
            saved = f.read()
        if saved != block:
            print('FAIL: map_kit_hd_option_b.js does not match index.html')
            sys.exit(1)
        for live_rel, bak_rel in ASSET_PAIRS:
            live_p = os.path.join(ROOT, live_rel)
            bak_p = os.path.join(ROOT, bak_rel)
            if not os.path.exists(live_p) or not os.path.exists(bak_p):
                print(f'FAIL: missing {live_rel} or {bak_rel}')
                sys.exit(1)
            if sha256_file(live_p) != sha256_file(bak_p):
                print(f'FAIL: checksum mismatch between {live_rel} and {bak_rel}')
                sys.exit(1)
        print('Map Kit HD backup (code + 4 atlas files) is current.')
        return

    os.makedirs(os.path.dirname(BACKUP_JS), exist_ok=True)
    with open(BACKUP_JS, 'w', encoding='utf-8') as f:
        f.write(block)
    for live_rel, bak_rel in ASSET_PAIRS:
        shutil.copy2(os.path.join(ROOT, live_rel), os.path.join(ROOT, bak_rel))
    print('Wrote', BACKUP_JS, 'and synced', len(ASSET_PAIRS), 'kit backup files.')


if __name__ == '__main__':
    main()
