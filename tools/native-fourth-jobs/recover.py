#!/usr/bin/env python3
"""Restore only pinned original binaries used by the fourth-job renderer."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib,json
from pathlib import Path
from urllib.request import urlopen
MANIFEST=Path(__file__).with_name('source-manifest.json')
def recover(record,root):
    target=root/record['path']
    if record.get('absent'):
        if target.exists():raise ValueError('Expected absent optional input: '+record['path'])
        return
    def valid(data):return len(data)==record['bytes'] and hashlib.sha256(data).hexdigest()==record['sha256']
    if target.is_file() and valid(target.read_bytes()):return
    with urlopen(record['url'],timeout=45) as response:data=response.read(record['bytes']+1)
    if not valid(data):raise ValueError('Native input differs: '+record['path'])
    target.parent.mkdir(parents=True,exist_ok=True)
    temporary=target.with_suffix(target.suffix+'.tmp');temporary.write_bytes(data);temporary.replace(target)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);args=p.parse_args()
    records=json.loads(MANIFEST.read_text())['files']
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda record:recover(record,args.output),records))
    print('Verified',sum(not r.get('absent') for r in records),'pinned native inputs')
