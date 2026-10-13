#!/usr/bin/env python3
"""Recover pinned preview data and produce explicitly derived ACT/SPR adapters.

Three garments lack original ACTs in the recovered official supplement. Exact
public preview PNGs and exposed layer/attachment/delay fields are retained; these
adapters are development inputs, not original binaries or gameplay downloads.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess

from PIL import Image
from prepare_evil_scythe import action_bytes, sprite_bytes

HERE = Path(__file__).resolve().parent


def prepare(native, cache):
    manifest = json.loads((HERE / 'seven-items-source-manifest.json').read_text())
    sources = {}
    for record in manifest['previews']:
        path = cache / record['path']
        def valid(data):
            return len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256']
        if not path.is_file() or not valid(path.read_bytes()):
            data = subprocess.check_output(['curl', '--fail', '--silent', '--show-error',
                                           '--location', '--retry', '2', '--max-time', '40', record['url']])
            if not valid(data):
                raise ValueError('Preview source changed: ' + record['path'])
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + '.tmp')
            temporary.write_bytes(data)
            temporary.replace(path)
        sources[record['path']] = path.read_bytes()
    outputs = {}
    for key in manifest['previewKeys']:
        for sex in ['m', 'f']:
            reference = json.loads(sources[f'{key}/gender-{sex}.json'])
            preview = json.loads(sources[f'{key}/tree-0-{sex}.json'])
            assert preview['body'] == reference['body'], (key, sex, 'gender mismatch')
            assert preview['robe'] == reference['item'], (key, sex, 'item mismatch')
            count = preview['robe']['frameCount']
            images = [Image.open(io.BytesIO(sources[f'{key}/frame-{sex}-{i}.png'])).convert('RGBA')
                      for i in range(count)]
            spr = sprite_bytes(images)
            for record in manifest['previews']:
                if record['kind'] != 'tree' or record['key'] != key or record['sex'] != sex:
                    continue
                tree = json.loads(sources[record['path']])
                assert tree['robe']['frameCount'] == count and not tree['itemAlwaysFront']
                base = native / record['nativeBase']
                base.parent.mkdir(parents=True, exist_ok=True)
                for suffix, data in [('.act', action_bytes(tree['robe'], images)), ('.spr', spr)]:
                    path = base.with_suffix(suffix)
                    relative = str(path.relative_to(native))
                    fingerprint = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                    if manifest.get('derivedFiles') and manifest['derivedFiles'][relative] != fingerprint:
                        raise ValueError('Derived adapter changed: ' + relative)
                    path.write_bytes(data)
                    outputs[relative] = fingerprint
    print(json.dumps(dict(status='pass', pinnedPreviews=len(sources), derivedFiles=outputs)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native', type=Path)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.native, args.cache)
