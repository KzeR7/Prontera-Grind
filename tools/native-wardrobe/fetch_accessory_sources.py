#!/usr/bin/env python3
"""Restore pinned accessory inputs from a public resource supplement using HTTP ranges."""
import argparse, concurrent.futures, hashlib, html, json, re, threading, zlib
from pathlib import Path
from urllib.request import Request, urlopen
HERE=Path(__file__).resolve().parent


def recover(root):
    manifest=json.loads((HERE/'accessory-source-manifest.json').read_text())
    archive=manifest['archive'];download=None;lock=threading.Lock()
    def get(record):
        nonlocal download
        path=root/record['path']
        def valid(data):return len(data)==record['bytes'] and hashlib.sha256(data).hexdigest()==record['sha256']
        if path.is_file() and valid(path.read_bytes()):return
        with lock:
            if download is None:
                with urlopen(archive['page'],timeout=30) as response:page=response.read(2*1024*1024).decode()
                urls=[html.unescape(u) for u in re.findall(r'href="([^"]+)"',page)]
                download=next(u for u in urls if u.startswith('https://download') and u.endswith('/official_data.grf'))
        start=record['archiveOffset'];size=record['compressedBytes']
        with urlopen(Request(download,headers={'Range':f'bytes={start}-{start+size-1}'}),timeout=40) as response:
            if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start}-{start+size-1}/{archive["bytes"]}':raise ValueError('Archive revision/range changed')
            compressed=response.read(size+1)
        if len(compressed)!=size:raise ValueError('Unexpected compressed length')
        data=zlib.decompress(compressed)
        if not valid(data):raise ValueError('Accessory source checksum mismatch: '+record['path'])
        path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix(path.suffix+'.tmp');temp.write_bytes(data);temp.replace(path)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:list(pool.map(get,manifest['files']))
    print('Verified',len(manifest['files']),'pinned accessory inputs')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root',type=Path);a=p.parse_args();recover(a.root)
