#!/usr/bin/env python3
"""Audit local native deliveries; optional independent downloaded source comparisons."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--source-cache',type=Path);p.add_argument('--mob-cache',type=Path);args=p.parse_args()
lock=json.loads((ROOT/'tools/native-fields/source-lock.json').read_text());base=ROOT/'assets/native-fields/v1';catalog=json.loads((base/'catalog.json').read_text());mobs=json.loads((base/'mobs.json').read_text())
def digest(data):return hashlib.sha256(data).hexdigest()
for name,r in lock['outputs'].items():
 data=(ROOT/name).read_bytes();assert digest(data)==r['sha256'] and len(data)==r['bytes'],name
assert len(catalog['maps'])==10 and len(mobs['monsters'])==70
for record in catalog['maps']:
 name=record['name'];array=np.fromfile(base/name/'models.bin',dtype='<f4').reshape(-1,10);assert np.isfinite(array).all();assert record['stride']==10
 for model in record['models'].values():
  assert model['count']%3==0 and model['first']+model['count']<=len(array);assert min(model['size'])>=0
 for f in ['terrain.png','models.webp']:Image.open(base/name/f).verify()
 if args.source_cache:
  source_name=record.get('sourceMap',name);folder=args.source_cache/source_name;manifest=json.loads((folder/'manifest.json').read_text());source=np.fromfile(folder/'models.bin',dtype='<f4').reshape(-1,10)
  for f in ['manifest.json','models.bin','models.webp','atlas.webp']:
   url=lock['origin']+('/maps/'+source_name+'/manifest.json' if f=='manifest.json' else manifest['files'][f]);assert digest((folder/f).read_bytes())==lock['sources'][url]['sha256']
  for role,model in record['models'].items():
   chunk=manifest['modelChunks'][model['sourceChunk']];expected=source[chunk['first']:chunk['first']+chunk['count']].copy();expected[:,:3]-=[(chunk['min'][0]+chunk['max'][0])/2,chunk['min'][1],(chunk['min'][2]+chunk['max'][2])/2]
   sw,sh=Image.open(folder/'models.webp').size;aw,ah=record['atlasSize'];bounds=expected[:,6:10].copy()
   for region in record['textureRegions']:
    rows=np.all(bounds==region['bounds'],axis=1);l,t,_,_=region['source'];dx,dy=region['destination']
    for col in [3,6,8]:expected[rows,col]=(expected[rows,col]*sw-l+dx)/aw
    for col in [4,7,9]:expected[rows,col]=(expected[rows,col]*sh-t+dy)/ah
   actual=array[model['first']:model['first']+model['count']];assert np.array_equal(actual,expected),'native geometry or pixel-equivalent UV remapping changed'
  original=Image.open(folder/'models.webp').convert('RGBA');packed=Image.open(base/name/'models.webp').convert('RGBA')
  for region in record['textureRegions']:
   l,t,r,b=region['source'];x,y=region['destination'];assert original.crop((l,t,r,b)).tobytes()==packed.crop((x,y,x+r-l,y+b-t)).tobytes(),'repacked native texture pixels changed'
  cfg=next(c for c in json.loads((ROOT/'tools/native-fields/selection.json').read_text()) if c['map']==name);terrain=Image.open(base/name/'terrain.png').convert('RGBA');atlas=Image.open(folder/'atlas.webp').convert('RGBA')
  for i,(x,y) in enumerate(cfg['tiles'].values()):assert terrain.crop((i*256,0,i*256+256,256)).tobytes()==atlas.crop((x*288+16,y*288+16,x*288+272,y*288+272)).tobytes(),'terrain pixels changed'
for id,r in mobs['monsters'].items():
 assert r['idleHeight']>0 and len(r['actions'])>=8
 im=Image.open(ROOT/r['texture']);w,h=im.size;assert w==r['size'];assert digest(im.convert('RGBA').tobytes())==r['pixelSha256']
 for f in r['frames']:assert 0<=f['x']<w and 0<=f['y']<h and f['x']+f['width']<=w and f['y']+f['height']<=h
 for a in r['actions']:assert a['delayMs']>0 and all(0<=i<len(r['frames']) for i in a['frames'])
 if args.mob_cache:
  original=json.loads((args.mob_cache/(id+'.json')).read_text());assert Image.open(ROOT/r['texture']).convert('RGBA').tobytes()==Image.open(args.mob_cache/(id+'.png')).convert('RGBA').tobytes(),'sprite pixel preservation';assert digest((args.mob_cache/(id+'.png')).read_bytes())==lock['sources'][lock['origin']+original['texture']]['sha256'];actual={k:v for k,v in r.items() if k not in ['bounds','idleHeight','texture','sourceTexture','pixelSha256']};expected={k:v for k,v in original.items() if k!='texture'};assert actual==expected,'native action/placement metadata changed'
  assert digest((args.mob_cache/(id+'.json')).read_bytes())==lock['sources'][lock['origin']+'/maps/mob-'+id+'.json']['sha256']
if args.mob_cache:
 novice=json.loads((args.mob_cache/'novice.json').read_text());f=novice['frames'];idle=[f[i] for a in novice['actions'][:8] for i in a['frames']];assert max(x['top']+x['height'] for x in idle)-min(x['top'] for x in idle)==mobs['referenceFigure']['idleHeight']==91
assert mobs['referenceFigure']['worldHeight']==72*.03 and mobs['pixelsPerUnit']==91/(72*.03)
print(f"PASS: {len(lock['outputs'])} output hashes; 10 terrain/model sets; 70 lossless native atlases, full action bounds/timing; source pixels, UVs, geometry and Novice calibration"+(' verified against independent downloaded source cache.' if args.source_cache and args.mob_cache else ' (external source comparisons not requested).'))
