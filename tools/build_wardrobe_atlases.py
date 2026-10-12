#!/usr/bin/env python3
"""Pack native component crops into shared static atlases. Requires Pillow 11."""
import argparse,hashlib,json,pathlib
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('source',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
repo=pathlib.Path(__file__).resolve().parents[1];catalog=json.loads((repo/'Updates/hair-color-preview/catalog.json').read_text());manifest=dict(version=1,width=320,height=280,anchor=[160,200],hairs=catalog['hairs'],assets={})
for path in sorted(a.source.glob('*.json')):
 actions=json.loads(path.read_text());ids=sorted({v['image'] for view in actions.values() for frame in view['frames'] for v in frame});images={i:Image.open(a.source/'images'/(i+'.png')).convert('RGBA') for i in ids};positions={};x=y=row=0
 for i in sorted(ids,key=lambda i:(-images[i].height,i)):
  im=images[i]
  if x+im.width>512:x=0;y+=row+1;row=0
  positions[i]=[x,y,im.width,im.height];x+=im.width+1;row=max(row,im.height)
 height=max(1,y+row);assert height<=4096
 atlas=Image.new('RGBA',(512,height))
 for i,im in images.items():atlas.paste(im,positions[i][:2])
 import io
 stream=io.BytesIO();atlas.save(stream,format='PNG',optimize=True);data=stream.getvalue();sha=hashlib.sha256(data).hexdigest();png='atlas-'+sha[:20]+'.png';(a.output/png).write_bytes(data)
 # Compact draw instruction: source x/y/w/h, destination x/y, z and slot.
 for view in actions.values():
  assert view['delay']>0 and 0<len(view['frames'])<=32
  view['frames']=[[positions[v['image']]+[v['x'],v['y'],v['z'],v['slot']] for v in frame] for frame in view['frames']]
 encoded=json.dumps(dict(version=1,width=512,height=height,actions=actions),separators=(',',':')).encode();metaSha=hashlib.sha256(encoded).hexdigest();meta='poses-'+metaSha[:20]+'.json';(a.output/meta).write_bytes(encoded)
 manifest['assets'][path.stem]=dict(meta=meta,metaSha256=metaSha,metaBytes=len(encoded),image=png,imageSha256=sha,imageBytes=len(data),width=512,height=height)
(a.output/'catalog.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
files=list(a.output.iterdir());print(json.dumps(dict(files=len(files),bytes=sum(p.stat().st_size for p in files),assets=len(manifest['assets']),largest=max(p.stat().st_size for p in files),maxAtlasBytes=max(r['width']*r['height']*4 for r in manifest['assets'].values()))))
