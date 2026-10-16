#!/usr/bin/env python3
"""Compare default layered fourth jobs with the previously audited native composites."""
import hashlib,json,subprocess
from pathlib import Path
from PIL import Image,ImageChops
repo=Path(__file__).resolve().parents[2]
root=repo/'assets/wardrobe/fourth/v1';cat=json.loads((root/'catalog.json').read_text())
oldroot=repo/'assets/fourth-jobs/v1';old=json.loads((oldroot/'catalog.json').read_text());count=0;maximum=0

def asset(key):
    rec=cat['assets'][key];meta=json.loads((root/rec['meta']).read_text());poses=meta['poses']
    if 'layers'in meta:poses=[[meta['layers'][i]for i in pose]for pose in poses]
    return Image.open(root/rec['image']).convert('RGBA'),{k:dict(delay=v['delay'],frames=[poses[i]for i in v['frames']])for k,v in meta['actions'].items()}
for job in cat['classes'].values():
    for sex in ['m','f']:
        bi,b=asset(f'base-{job}-{sex}');hi,h=asset(f'hair-{sex}-2-0');prior=old['looks'][f'{job}-{sex}'];atlas=Image.open(oldroot/prior['image']).convert('RGBA')
        assert cat['assets'][f'base-{job}-{sex}']['figureHeight']==prior['figureHeight']
        for route,view in b.items():
            hair=h[f'{job}:{route}'];expected=prior['actions'][route]
            assert view['delay']==expected['delay'] and len(view['frames'])==len(expected['frames'])
            for i,frame in enumerate(view['frames']):
                image=Image.new('RGBA',(320,280));layers=[(p,bi)for p in frame]+[(p,hi)for p in hair['frames'][i]]
                for (sx,sy,w,height,x,y,_,_),source in sorted(layers,key=lambda p:p[0][6]):image.alpha_composite(source.crop((sx,sy,sx+w,sy+height)),(x,y))
                sx,sy,w,height,x,y=expected['frames'][i];native=Image.new('RGBA',(320,280));native.paste(atlas.crop((sx,sy,sx+w,sy+height)),(x,y))
                delta=max(v[1]for v in ImageChops.difference(image,native).getextrema());assert delta<=3,(job,sex,route,i,delta);maximum=max(maximum,delta);count+=1
# Earlier-class assets remain byte-identical to the starting revision.
for line in subprocess.check_output(['git','ls-tree','-r','HEAD','assets/wardrobe/v5'],cwd=repo,text=True).splitlines():
    info,path=line.split('\t');oid=info.split()[2];assert subprocess.check_output(['git','hash-object',path],cwd=repo,text=True).strip()==oid,path
print(json.dumps(dict(status='pass',defaultNativeFrames=count,maxChannelDifference=maximum,earlierClassAssets='unchanged')))
