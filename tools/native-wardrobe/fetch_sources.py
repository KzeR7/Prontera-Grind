#!/usr/bin/env python3
"""Recover pinned native inputs; validate cached bytes before reusing them."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import time
from urllib.request import urlopen

HERE=Path(__file__).resolve().parent

def recover(record, root):
    target=root/record['path']
    valid=lambda data: len(data)==record['bytes'] and hashlib.sha256(data).hexdigest()==record['sha256']
    if target.is_file() and valid(target.read_bytes()):
        return
    for attempt in range(3):
        try:
            with urlopen(record['url'],timeout=40) as response:
                data=response.read(record['bytes']+1)
            if not valid(data):
                raise ValueError('Native source hash mismatch: '+record['path'])
            target.parent.mkdir(parents=True,exist_ok=True)
            temporary=target.with_suffix(target.suffix+'.tmp')
            temporary.write_bytes(data);temporary.replace(target)
            return
        except Exception:
            if attempt==2:
                raise
            time.sleep(1)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    records={r['path']:r for name in ['source-manifest.json','class-source-manifest.json','tree-source-manifest.json','remaining-source-manifest.json','expansion-source-manifest.json']
             for r in json.loads((HERE/name).read_text())['files']}
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda r:recover(r,args.output),records.values()))
    print('Verified',len(records),'native inputs')
