#!/usr/bin/env python3
"""Audit every native class look and independently recompose all costume masks."""
import hashlib,json,pathlib,sys
from PIL import Image,ImageChops
repo=pathlib.Path(__file__).resolve().parents[2]
root=repo/'assets/wardrobe/v2';catalog=json.loads((root/'catalog.json').read_text());cache={}
def asset(key):
    if key in cache:return cache[key]
    r=catalog['assets'][key]
    for field in ['meta','image']:
        b=(root/r[field]).read_bytes()
        assert len(b)==r[field+'Bytes'] and hashlib.sha256(b).hexdigest()==r[field+'Sha256']
    m=json.loads((root/r['meta']).read_text());im=Image.open(root/r['image']).convert('RGBA')
    assert im.size==(m['width'],m['height']) and im.width*im.height*4<=4*1024*1024
    for v in m['actions'].values():
        assert 0<v['delay']<=60000 and 0<len(v['frames'])<=32
        v['frames']=[m['poses'][i] for i in v['frames']]
        for frame in v['frames']:
            for sx,sy,w,h,x,y,z,slot in frame:
                assert 0<=sx<sx+w<=im.width and 0<=sy<sy+h<=im.height
                assert 0<x<x+w<320 and 0<y<y+h<280
    cache[key]=(m,im);return m,im

frames=0;looks=0;max_delta=0
proof=pathlib.Path(sys.argv[1])
for cls,job in catalog['classes'].items():
    for sex in ['m','f']:
        base,bi=asset(f'base-{job}-{sex}');costume,ci=asset('costume-'+sex)
        hairs=json.loads((repo/'Updates/hair-color-preview/catalog.json').read_text())['hairs'][sex]
        for head in hairs:
            for color in range(9):
                key=f'hair-{sex}-{head}-{color}';hair,hi=asset(key)
                for name,b in base['actions'].items():
                    h=hair['actions'][str(job)+':'+name];c=costume['actions'][str(job)+':'+name]
                    assert len(b['frames'])==len(h['frames'])==len(c['frames'])
                    assert b['delay']==h['delay']==c['delay']
                    assert all(any(p[7]=='body' for p in frame) for frame in b['frames'])
                    assert all(any(p[7]=='hair' for p in frame) for frame in h['frames'])
                    if name.startswith('attack'):assert any(any(p[7]=='weapon' for p in f) for f in b['frames'])
                    if head!=2 or color!=0:continue
                    for mask in range(8):
                        for i,frame in enumerate(b['frames']):
                            im=Image.new('RGBA',(320,280))
                            layers=[(p,bi) for p in frame]+[(p,hi) for p in h['frames'][i]]+[(p,ci) for p in c['frames'][i]]
                            for p,atlas in sorted(layers,key=lambda l:l[0][6]):
                                bit={'halo':1,'glasses':2,'wings':4}.get(p[7],0)
                                if bit and not mask&bit:continue
                                sx,sy,w,hgt,x,y,_,_=p
                                im.alpha_composite(atlas.crop((sx,sy,sx+w,sy+hgt)),(x,y))
                            expected=Image.open(proof/str(job)/'variants'/sex/name/str(mask)/(str(i)+'.png')).convert('RGBA')
                            delta=max(e[1] for e in ImageChops.difference(im,expected).getextrema())
                            assert delta<=1,(cls,sex,name,mask,i,delta)
                            max_delta=max(max_delta,delta);frames+=1
                looks+=1;del cache[key]
    print('checked',cls,flush=True)
files=list(root.iterdir());assert len(files)<450
assert len(list(root.glob('poses-*.json')))<80, 'palettes must share attachment metadata'
assert sum(p.stat().st_size for p in files)<8*1024*1024, 'shared pack exceeds storage budget'
print(json.dumps(dict(status='pass',looks=looks,nativeComparisonFrames=frames,maxChannelDifference=max_delta,bytes=sum(p.stat().st_size for p in files),files=len(files))))
