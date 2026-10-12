#!/usr/bin/env python3
"""Compare a compacted catalog to its original RGBA atlases and animation metadata."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('original',type=Path)
parser.add_argument('optimized',type=Path)
args=parser.parse_args()
a=json.loads((args.original/'catalog.json').read_text());b=json.loads((args.optimized/'catalog.json').read_text())
assert a['classes']==b['classes'] and a['assets'].keys()==b['assets'].keys()
images=set()
for key,old in a['assets'].items():
 new=b['assets'][key]
 for field in old.keys()-{'image','imageSha256','imageBytes'}:assert old[field]==new[field],(key,field)
 if old['image'] not in images:
  original=Image.open(args.original/old['image']).convert('RGBA')
  optimized=Image.open(args.optimized/new['image']).convert('RGBA')
  assert original.size==optimized.size and original.tobytes()==optimized.tobytes(),key
  images.add(old['image'])
 for field in ['meta','image']:
  data=(args.optimized/new[field]).read_bytes()
  assert len(data)==new[field+'Bytes'] and hashlib.sha256(data).hexdigest()==new[field+'Sha256']
assert sum(p.stat().st_size for p in args.optimized.iterdir())<7*1024*1024
assert sum(p.stat().st_size for p in args.optimized.iterdir())<sum(p.stat().st_size for p in args.original.iterdir())
print(json.dumps(dict(status='pass',exactRgbaAtlases=len(images),assetRecords=len(a['assets']),metadataAndTiming='identical')))
