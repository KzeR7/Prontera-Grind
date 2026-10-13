#!/usr/bin/env python3
"""Check all packed layers against native exports, then independent native compositions."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops
repo=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('exports',type=Path);p.add_argument('pieces',type=Path);p.add_argument('proof',type=Path)
a=p.parse_args();root=repo/'assets/wardrobe/v5';cat=json.loads((root/'catalog.json').read_text());cache={};layer_count=0;proof_count=0;maximum=0

def asset(key):
    if key in cache:return cache[key]
    rec=cat['assets'][key]
    for field in ['meta','image']:
        data=(root/rec[field]).read_bytes();assert len(data)==rec[field+'Bytes'] and hashlib.sha256(data).hexdigest()==rec[field+'Sha256']
    m=json.loads((root/rec['meta']).read_text());im=Image.open(root/rec['image']).convert('RGBA');assert im.size==(rec['width'],rec['height']);assert im.width*im.height*4<=4*1024*1024
    poses=m['poses']
    if 'layers'in m:poses=[[m['layers'][i]for i in pose]for pose in poses]
    digests={};translated=[]
    for pose in poses:
        out=[]
        for sx,sy,w,h,x,y,z,slot in pose:
            assert 0<=sx<sx+w<=im.width and 0<=sy<sy+h<=im.height and 0<x<x+w<320 and 0<y<y+h<280
            k=(sx,sy,w,h)
            if k not in digests:digests[k]=hashlib.sha256(f'{w}x{h}:'.encode()+im.crop((sx,sy,sx+w,sy+h)).tobytes()).hexdigest()
            out.append(dict(image=digests[k],x=x,y=y,z=z,slot=slot))
        translated.append(out)
    original={k:dict(delay=v['delay'],frames=[translated[i]for i in v['frames']])for k,v in m['actions'].items()}
    actions={k:dict(delay=v['delay'],frames=[poses[i]for i in v['frames']])for k,v in m['actions'].items()}
    cache[key]=(original,actions,im);return cache[key]

assert len(cat['classes'])==19 and not cat['outfits'];assert cat['accessories']==json.loads((Path(__file__).resolve().parents[2]/'tools/native-wardrobe/accessories.json').read_text())
for key in cat['assets']:
    original,actions,im=asset(key)
    if key.startswith('base-'):
        _,job,sex=key.split('-');jobs=[int(job)];filename='base-'+sex;folder=a.exports;slots={'body','weapon','shadow'}
    elif key.startswith('hair-'):jobs=cat['classes'].values();filename=key;folder=a.exports;slots={'hair'}
    else:jobs=cat['classes'].values();filename=key.removeprefix('piece-');folder=a.pieces;slots={filename.rsplit('-',1)[0]}
    for job in jobs:
        expected=json.loads((folder/str(job)/(filename+'.json')).read_text())
        for name,view in expected.items():
            route=name if key.startswith('base-')else str(job)+':'+name
            frames=[[p for p in f if p['slot']in slots]for f in view['frames']]
            assert original[route]==dict(delay=view['delay'],frames=frames),(key,job,name)
            layer_count+=sum(map(len,frames))
    if key.startswith('hair-') and not key.endswith('-2-0'):cache.pop(key)
print('All packed pixels/positions/timings match native exports:',layer_count,flush=True)
for cls,job in cat['classes'].items():
    for sex in ['m','f']:
        _,base,bi=asset(f'base-{job}-{sex}');_,hair,hi=asset(f'hair-{sex}-2-0')
        for items in cat['accessories'].values():
            for item in items:
                _,piece,pi=asset(f'piece-{item["key"]}-{sex}')
                for name,b in base.items():
                    route=str(job)+':'+name;h=hair[route];c=piece[route]
                    assert len(b['frames'])==len(h['frames']) and b['delay']==h['delay'];assert item.get('clock')=='independent' or (b['delay']==c['delay'] and (item.get('clock')=='component' or len(b['frames'])==len(c['frames'])))
                    if item.get('clock')=='independent' or name not in ['idle0','walk2','attack4']:continue
                    for i in range(len(c['frames'])):
                        frame=b['frames'][i%len(b['frames'])]
                        result=Image.new('RGBA',(320,280));layers=[(p,bi)for p in frame]+[(p,hi)for p in h['frames'][i%len(h['frames'])]]+[(p,pi)for p in c['frames'][i]]
                        for q,atlas in sorted(layers,key=lambda x:x[0][6]):
                            sx,sy,w,height,x,y,_,_=q;result.alpha_composite(atlas.crop((sx,sy,sx+w,sy+height)),(x,y))
                        expected=Image.open(a.proof/str(job)/sex/item['key']/name/f'{i}.png').convert('RGBA');delta=max(e[1]for e in ImageChops.difference(result,expected).getextrema());assert delta<=(3 if item['key']=='evilScythe'else 2),(cls,sex,item['key'],name,i,delta);maximum=max(maximum,delta);proof_count+=1
    print('Checked',cls,flush=True)
files=list(root.iterdir());size=sum(f.stat().st_size for f in files);assert len(files)<700
print(json.dumps(dict(status='pass',exactLayerFrames=layer_count,nativeComparisonFrames=proof_count,maxChannelDifference=maximum,files=len(files),bytes=size)))
