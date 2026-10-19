#!/usr/bin/env python3
"""Recover pinned public scenery and monster atlases; derive local runtime assets.

Usage: python tools/native-fields/build.py --cache /path/to/cache
Requires Pillow and numpy. The source lock is authoritative after the first run.
No account/session/prepare endpoints are used. Native art is never repainted.
"""
import argparse, hashlib, json, subprocess, re, io, math
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
ORIGIN='https://play.ragnago.com'
def sha(data):return hashlib.sha256(data).hexdigest()
def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
def dump(path,data):write(path,(json.dumps(data,separators=(',',':'),ensure_ascii=False)+'\n').encode())
def download(url,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','2','--max-time','90',url,'-o',str(path)],check=True)
def build(cache,mob_cache):
 target=ROOT/'assets/native-fields/v1';lockpath=ROOT/'tools/native-fields/source-lock.json'
 old=json.loads(lockpath.read_text()) if lockpath.exists() else None
 sources=dict(old['sources']) if old else {};outputs={};maps=[]
 def source(url,path):
  if not path.exists():download(url,path)
  data=path.read_bytes();record={'sha256':sha(data),'bytes':len(data)}
  if old and url in old['sources'] and old['sources'][url]!=record:raise ValueError('Source differs from pinned bytes: '+url)
  sources[url]=record;return data
 def output(path,data):
  write(path,data);outputs[str(path.relative_to(ROOT))]={'sha256':sha(data),'bytes':len(data)}
 for cfg in json.loads((ROOT/'tools/native-fields/selection.json').read_text()):
  name=cfg['map'];source_name=cfg.get('sourceMap',name);folder=cache/source_name
  raw=source(ORIGIN+'/maps/'+source_name+'/manifest.json',folder/'manifest.json');man=json.loads(raw)
  blobs={k:source(ORIGIN+man['files'][k],folder/k) for k in ['atlas.webp','models.webp','models.bin']}
  atlas=Image.open(folder/'atlas.webp');terrain=Image.new('RGBA',(1024,256))
  for i,(role,(x,y)) in enumerate(cfg['tiles'].items()):
   crop=atlas.crop((x*288+16,y*288+16,x*288+272,y*288+272)).convert('RGBA');terrain.paste(crop,(i*256,0))
  import io
  buf=io.BytesIO();terrain.save(buf,format='PNG');output(target/name/'terrain.png',buf.getvalue())
  data=np.frombuffer(blobs['models.bin'],dtype='<f4').reshape(-1,man['modelVertexStride'])
  records={};arrays=[];offset=0
  for role,i in cfg['models'].items():
   c=man['modelChunks'][i];v=data[c['first']:c['first']+c['count']].copy()
   origin=np.array([(c['min'][0]+c['max'][0])/2,c['min'][1],(c['min'][2]+c['max'][2])/2]);v[:,:3]-=origin
   arrays.append(v);records[role]={'first':offset,'count':len(v),'size':(np.array(c['max'])-c['min']).tolist(),'sourceChunk':i};offset+=len(v)
  packed=np.concatenate(arrays);original=Image.open(folder/'models.webp').convert('RGBA');sw,sh=original.size
  # Retain only textures actually sampled by the selected models, at original resolution.
  regions=[];x=y=row=0;atlas_width=2048
  for bounds in np.unique(packed[:,6:10],axis=0):
   rect=[math.floor(float(bounds[0])*sw),math.floor(float(bounds[1])*sh),math.ceil(float(bounds[2])*sw),math.ceil(float(bounds[3])*sh)]
   w,h=rect[2]-rect[0],rect[3]-rect[1]
   if x+w+32>atlas_width:x=0;y+=row;row=0
   regions.append({'bounds':bounds.tolist(),'source':rect,'destination':[x+16,y+16]});x+=w+32;row=max(row,h+32)
  atlas_height=2**math.ceil(math.log2(max(1,y+row)));repacked=Image.new('RGBA',(atlas_width,atlas_height))
  source_bounds=packed[:,6:10].copy()
  for region in regions:
   l,t,r,b=region['source'];dx,dy=region['destination'];repacked.paste(original.crop((l-16,t-16,r+16,b+16)),(dx-16,dy-16))
   rows=np.all(source_bounds==region['bounds'],axis=1)
   packed[rows,3]=(packed[rows,3]*sw-l+dx)/atlas_width;packed[rows,4]=(packed[rows,4]*sh-t+dy)/atlas_height
   packed[rows,6]=(packed[rows,6]*sw-l+dx)/atlas_width;packed[rows,8]=(packed[rows,8]*sw-l+dx)/atlas_width
   packed[rows,7]=(packed[rows,7]*sh-t+dy)/atlas_height;packed[rows,9]=(packed[rows,9]*sh-t+dy)/atlas_height
  buf=io.BytesIO();repacked.save(buf,format='WEBP',lossless=True,exact=True,method=4);output(target/name/'models.webp',buf.getvalue())
  output(target/name/'models.bin',packed.astype('<f4').tobytes())
  maps.append({'name':name,'sourceMap':source_name,'version':man['version'],'stride':man['modelVertexStride'],'models':records,'tiles':list(cfg['tiles']),'atlasSize':[atlas_width,atlas_height],'textureRegions':regions})
 output(target/'catalog.json',(json.dumps({'schema':1,'maps':maps},separators=(',',':'))+'\n').encode())
 # Preserve full source frame tables/actions and decoded RGBA pixels.
 mobs={};missing=[]
 source(ORIGIN+'/maps/novice.json',mob_cache/'novice.json')
 page=(ROOT/'index.html').read_text();block=page[page.index('const MOB_SPRITES='):page.index('// Divine Pride size classes')]
 ids=old['monsterIds'] if old else sorted(set(map(int,re.findall(r"'[^']+':(\d+)",block))))
 for id in ids:
  path=mob_cache/(str(id)+'.json')
  if (old and id in old['missingMonsterMetadata']) or (not old and not path.exists()):
   missing.append(id);continue
  try:raw=source(ORIGIN+'/maps/mob-'+str(id)+'.json',path);d=json.loads(raw)
  except (ValueError,json.JSONDecodeError):
   if old:raise
   missing.append(id);continue
  png=source(ORIGIN+d['texture'],mob_cache/(str(id)+'.png'));Image.open(mob_cache/(str(id)+'.png')).verify()
  im=Image.open(mob_cache/(str(id)+'.png')).convert('RGBA');buf=io.BytesIO();im.save(buf,format='WEBP',lossless=True,exact=True,method=4)
  webp=buf.getvalue();ext='webp' if len(webp)<len(png) else 'png';delivery=webp if ext=='webp' else png
  assert Image.open(io.BytesIO(delivery)).convert('RGBA').tobytes()==im.tobytes(),'Lossless sprite pixels changed'
  output(target/'mobs'/f'{id}.{ext}',delivery)
  frames=d['frames'];idle=[frames[i] for action in d['actions'][:8] for i in action['frames']]
  bounds=[min(f['left'] for f in frames),min(f['top'] for f in frames),max(f['left']+f['width'] for f in frames),max(f['top']+f['height'] for f in frames)]
  mobs[str(id)]={**d,'texture':f'assets/native-fields/v1/mobs/{id}.{ext}','sourceTexture':d['texture'],'pixelSha256':sha(im.tobytes()),'bounds':bounds,'idleHeight':max(f['top']+f['height'] for f in idle)-min(f['top'] for f in idle)}
 output(target/'mobs.json',(json.dumps({'schema':1,'pixelsPerUnit':91/2.16,'referenceFigure':{'file':'novice.json','idleHeight':91,'worldHeight':2.16},'monsters':mobs},separators=(',',':'))+'\n').encode())
 lock={'schema':1,'origin':ORIGIN,'monsterIds':ids,'sources':sources,'outputs':outputs,'missingMonsterMetadata':missing}
 dump(lockpath,lock)
 for path in target.rglob('*'):
  if path.is_file() and str(path.relative_to(ROOT)) not in outputs:path.unlink()
 print(f'Built {len(maps)} native field sets and {len(mobs)} native monster atlases; {len(missing)} unavailable metadata responses.')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--mob-cache',type=Path,required=True);args=p.parse_args();build(args.cache,args.mob_cache)
