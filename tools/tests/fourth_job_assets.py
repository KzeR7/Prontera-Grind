#!/usr/bin/env python3
"""Audit parked class atlas pixels, placement and timing against native exports."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--native',type=Path);p.add_argument('--proof',type=Path);args=p.parse_args()
def sha(data):return hashlib.sha256(data).hexdigest()
manifest=json.loads((ROOT/'tools/native-fourth-jobs/source-manifest.json').read_text())
assert manifest['rendererCommit']=='4de4fa747431979d35c747d7edd549a872efd9e1'
if args.native:
    for r in manifest['files']:
        if r.get('absent'):
            assert not (args.native/r['path']).exists(),r['path']+' must remain absent'
            continue
        data=(args.native/r['path']).read_bytes()
        assert len(data)==r['bytes'] and sha(data)==r['sha256'],r['path']
pack=ROOT/'Updates/fourth-jobs/native';catalog=json.loads((pack/'catalog.json').read_text());assert catalog['canvas']==[320,280] and catalog['anchor']==[160,200]
expected={'Rune Knight':4054,'Warlock':4055,'Ranger':4056,'Guillotine Cross':4059,'Arch Bishop':4057,'Mechanic':4058}
assert catalog['classes']==expected
assert set(catalog['looks'])=={f'{j}-{s}'for j in expected.values()for s in ['m','f']}
frames=0;actions=0
for key,r in catalog['looks'].items():
    data=(pack/r['image']).read_bytes();assert len(data)==r['bytes'] and sha(data)==r['sha256'],key
    atlas=Image.open(pack/r['image']).convert('RGBA');assert atlas.size==(r['width'],r['height']) and atlas.width*atlas.height*4<=4*1024*1024
    assert set(r['actions'])=={s+str(d)for s in ['idle','walk','attack','cast']+(['roll'] if key.startswith('4059-') else [])for d in range(8)}
    job,sex=key.split('-')
    if job=='4059':
        assert r['skillActions']=={'gc_roll':'roll'}
        for d in range(8):
            assert r['actions']['roll'+str(d)]['action']==88+d
            assert r['actions']['roll'+str(d)]==r['actions']['attack'+str(d)]
            assert r['actions']['roll'+str(d)]['delay']==100
    else:assert r['skillActions']=={}
    for name,a in r['actions'].items():
        assert 0<a['delay']<=60000 and 0<len(a['frames'])<=32,(key,name)
        assert a['action']%8==int(name[-1])
        if args.proof:
            folder=args.proof/job/sex/name;meta=json.loads((folder/'action.json').read_text());assert meta=={'delay':a['delay'],'frames':len(a['frames']),'action':a['action']}
        assert len(a['frames'])==len(r['frameHashes'][name])
        for i,(sx,sy,w,h,x,y) in enumerate(a['frames']):
            assert 0<=sx<sx+w<=atlas.width and 0<=sy<sy+h<=atlas.height
            assert 0<x<x+w<320 and 0<y<y+h<280,(key,name,i,'clipped')
            full=Image.new('RGBA',(320,280));full.paste(atlas.crop((sx,sy,sx+w,sy+h)),(x,y));assert sha(full.tobytes())==r['frameHashes'][name][i],(key,name,i,'pixels')
            if args.proof:assert full.tobytes()==Image.open(folder/f'{i}.png').convert('RGBA').tobytes(),(key,name,i,'native renderer differs')
            frames+=1
        actions+=1
# Native genders and classes must really have different body pixels.
assert len({r['sha256']for r in catalog['looks'].values()})==12
print(f'PASS: 12 distinct native looks, {actions} actions, {frames} exact frames; hashes, native placement, timing, transparent margins and 4 MiB atlas limit.'+( ' Original sources and independent native render exports verified.' if args.native and args.proof else ' Use --native and --proof for source/render comparisons.'))
