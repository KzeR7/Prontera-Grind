#!/usr/bin/env python3
"""Compare independent switches to complete native engine renders for every frame."""
from PIL import Image,ImageChops
import pathlib,json,sys
repo=pathlib.Path(__file__).resolve().parents[2];assets=repo/'assets/wardrobe/v1';c=json.loads((assets/'catalog.json').read_text());proof=pathlib.Path(sys.argv[1]);frames=0;maximum=0
for sex in ['m','f']:
 def read(k):
  r=c['assets'][k];return json.loads((assets/r['meta']).read_text()),Image.open(assets/r['image']).convert('RGBA')
 base,bi=read('base-'+sex);hair,hi=read('hair-'+sex+'-2-0')
 for name,v in base['actions'].items():
  for mask in range(8):
   for fi,frame in enumerate(v['frames']):
    im=Image.new('RGBA',(320,280));layers=[(p,bi) for p in frame]+[(p,hi) for p in hair['actions'][name]['frames'][fi]]
    for p,atlas in sorted(layers,key=lambda l:l[0][6]):
     bit={'halo':1,'glasses':2,'wings':4}.get(p[7],0)
     if bit and not mask&bit:continue
     sx,sy,w,h,x,y,_,_=p;im.alpha_composite(atlas.crop((sx,sy,sx+w,sy+h)),(x,y))
    expected=Image.open(proof/'variants'/sex/name/str(mask)/(str(fi)+'.png')).convert('RGBA');diff=ImageChops.difference(im,expected);delta=max(max(e) for e in diff.getextrema());maximum=max(maximum,delta);assert delta<=1,(sex,name,mask,fi,delta);frames+=1
print(json.dumps(dict(status='pass',frames=frames,accessoryCombinations=8,directions=8,stances=3,genders=2,maxChannelDifference=maximum)))
