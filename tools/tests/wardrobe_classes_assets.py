#!/usr/bin/env python3
"""Audit every native class look and independently recompose all costume masks."""
import argparse,hashlib,json,pathlib
from PIL import Image,ImageChops
repo=pathlib.Path(__file__).resolve().parents[2]
root=repo/'assets/wardrobe/v4';catalog=json.loads((root/'catalog.json').read_text());cache={}
def asset(key):
    if key in cache:return cache[key]
    r=catalog['assets'][key]
    for field in ['meta','image']:
        b=(root/r[field]).read_bytes()
        assert len(b)==r[field+'Bytes'] and hashlib.sha256(b).hexdigest()==r[field+'Sha256']
    m=json.loads((root/r['meta']).read_text());im=Image.open(root/r['image']).convert('RGBA')
    assert im.size==(m['width'],m['height']) and im.width*im.height*4<=4*1024*1024
    if 'layers' in m:m['poses']=[[m['layers'][i] for i in pose] for pose in m['poses']]
    for v in m['actions'].values():
        assert 0<v['delay']<=60000 and 0<len(v['frames'])<=32
        v['frames']=[m['poses'][i] for i in v['frames']]
        for frame in v['frames']:
            for sx,sy,w,h,x,y,z,slot in frame:
                assert 0<=sx<sx+w<=im.width and 0<=sy<sy+h<=im.height
                assert 0<x<x+w<320 and 0<y<y+h<280
    cache[key]=(m,im);return m,im

render_classes={**catalog['classes'],**catalog.get('outfits',{})}
frames=0;looks=0;max_delta=0
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('proof',type=pathlib.Path)
parser.add_argument('--collection',action='store_true',help='Use six native full-look fixtures covering new slots and outfits')
parser.add_argument('--proof-jobs',type=int,nargs='+',help='Compare only these jobs to native fixtures; all classes still receive asset audits')
args=parser.parse_args();proof=args.proof
proof_jobs=set(args.proof_jobs) if args.proof_jobs is not None else set(render_classes.values())
assert proof_jobs and proof_jobs<=set(render_classes.values())
for cls,job in render_classes.items():
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
                    if head!=2 or color!=0 or job not in proof_jobs:continue
                    sets=[set(),{'halo','glasses','wings'},{'catEars','sunglasses','flower','wings'},{'ribbon','mask','leaf','wings'},{'catEars','mask','flower'},{'ribbon','glasses','leaf'}] if args.collection else [{slot for bit,slot in [(1,'halo'),(2,'glasses'),(4,'wings')] if mask&bit} for mask in range(8)]
                    for mask,enabled in enumerate(sets):
                        for i,frame in enumerate(b['frames']):
                            im=Image.new('RGBA',(320,280))
                            layers=[(p,bi) for p in frame]+[(p,hi) for p in h['frames'][i]]+[(p,ci) for p in c['frames'][i]]
                            for p,atlas in sorted(layers,key=lambda l:l[0][6]):
                                if p[7] not in {'body','hair','weapon','shadow'} and p[7] not in enabled:continue
                                sx,sy,w,hgt,x,y,_,_=p
                                im.alpha_composite(atlas.crop((sx,sy,sx+w,sy+hgt)),(x,y))
                            expected_path=proof/str(job)/sex/str(mask)/name/(str(i)+'.png') if args.collection else proof/str(job)/'variants'/sex/name/str(mask)/(str(i)+'.png')
                            expected=Image.open(expected_path).convert('RGBA')
                            delta=max(e[1] for e in ImageChops.difference(im,expected).getextrema())
                            assert delta<=(2 if job in {4,5,8,4009,10,4011} else 1),(cls,sex,name,mask,i,delta)
                            max_delta=max(max_delta,delta);frames+=1
                looks+=1;del cache[key]
    print('checked',cls,flush=True)
files=list(root.iterdir());assert len(files)<500
assert len(list(root.glob('poses-*.json')))<=2*len(render_classes)+42, 'palettes must share attachment metadata'
assert sum(p.stat().st_size for p in files)<8*1024*1024, 'shared pack exceeds storage budget'
print(json.dumps(dict(status='pass',looks=looks,nativeProofJobs=sorted(proof_jobs),nativeComparisonFrames=frames,maxChannelDifference=max_delta,bytes=sum(p.stat().st_size for p in files),files=len(files))))
