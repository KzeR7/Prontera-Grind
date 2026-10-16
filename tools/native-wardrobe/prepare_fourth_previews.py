#!/usr/bin/env python3
"""Recover pinned fourth-job garment previews and emit explicit ACT/SPR adapters.

These four pieces use exact public preview PNGs and exposed geometry. They are
not recovered original binaries. Runtime never requests these external services.
"""
import argparse, hashlib, json, subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
from prepare_evil_scythe import action_bytes, sprite_bytes

HERE=Path(__file__).resolve().parent

def prepare(native,cache):
    manifest=json.loads((HERE/'fourth-preview-manifest.json').read_text())
    def get(record):
        path=cache/record['path']
        def valid(data):return len(data)==record['bytes'] and hashlib.sha256(data).hexdigest()==record['sha256']
        if not path.is_file() or not valid(path.read_bytes()):
            data=subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--retry','2','--max-time','45',record['url']])
            if not valid(data):raise ValueError('Preview source changed: '+record['path'])
            path.parent.mkdir(parents=True,exist_ok=True)
            temporary=path.with_suffix(path.suffix+'.tmp');temporary.write_bytes(data);temporary.replace(path)
        return path
    records=manifest['files']+manifest['frames']
    with ThreadPoolExecutor(max_workers=4)as pool:list(pool.map(get,records))
    outputs={}
    for record in manifest['files']:
        tree=json.loads((cache/record['path']).read_text())
        assert tree['robe'] and not tree['itemAlwaysFront']
        images=[Image.open(cache/f"{record['key']}-{record['job']}-{record['sex']}-{i}.png").convert('RGBA') for i in range(tree['robe']['frameCount'])]
        for suffix,data in [('.act',action_bytes(tree['robe'],images)),('.spr',sprite_bytes(images))]:
            path=native/(record['nativeBase']+suffix);relative=str(path.relative_to(native))
            fingerprint=dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
            if manifest['derivedFiles'][relative]!=fingerprint:raise ValueError('Derived adapter changed: '+relative)
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);outputs[relative]=fingerprint
    print(json.dumps(dict(status='pass',pinnedResponses=len(records),derivedAdapters=len(outputs))))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('native',type=Path);p.add_argument('--cache',type=Path,required=True)
    a=p.parse_args();prepare(a.native,a.cache)
