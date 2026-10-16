#!/usr/bin/env python3
"""Deliver the audited native composites without changing pixels or action clocks."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build(check=False):
    source = ROOT / 'Updates/fourth-jobs/native'
    output = ROOT / 'assets/fourth-jobs/v1'
    catalog = json.loads((source / 'catalog.json').read_text())
    files = {}
    for record in catalog['looks'].values():
        record.pop('frameHashes')  # Independent proof stays with the source pack.
        record['figureHeight'] = 200 - min(f[5] for d in range(8) for f in record['actions']['idle' + str(d)]['frames'])
        files[record['image']] = (source / record['image']).read_bytes()
    files['catalog.json'] = (json.dumps(catalog, separators=(',', ':')) + '\n').encode()
    if check:
        assert output.is_dir() and {p.name for p in output.iterdir()} == set(files), 'Stale runtime files'
        for name, data in files.items():
            assert (output / name).read_bytes() == data, 'Stale runtime asset: ' + name
    else:
        output.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (output / name).write_bytes(data)
    print('Native fourth-job runtime: 12 identical atlases and original action metadata verified.' if check else 'Wrote native fourth-job runtime.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
