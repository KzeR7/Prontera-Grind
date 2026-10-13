#!/usr/bin/env python3
"""Verify or restore the preserved pre-Afterglow skill visuals."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--restore', action='store_true', help='Replace only the FX mapping and renderer blocks in index.html')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
backup = Path(__file__).resolve().parent / 'pre-afterglow'
manifest = json.loads((backup / 'manifest.json').read_text())
page = root / 'index.html'
original = page.read_text()
restored = original
for block in manifest['blocks']:
    data = (backup / block['file']).read_bytes()
    if hashlib.sha256(data).hexdigest() != block['sha256']:
        raise SystemExit('Backup checksum mismatch: ' + block['file'])
    if restored.count(block['start']) != 1 or restored.count(block['end']) != 1:
        raise SystemExit('FX boundaries are missing or ambiguous: ' + block['file'])
    start = restored.index(block['start'])
    end = restored.index(block['end'], start)
    restored = restored[:start] + data.decode() + restored[end:]
if args.restore:
    page.write_text(restored)
    print('Restored original FX blocks. Rebuild dist/ before previewing the game.')
else:
    print('Backup checksums valid; current FX ' + ('match the backup.' if restored == original else 'differ from the backup. Use --restore to roll them back.'))
