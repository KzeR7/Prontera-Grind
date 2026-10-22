#!/usr/bin/env python3
"""Pack unchanged native Prontera models and paving; source fingerprints are pinned."""
import json,hashlib,io,math,sys,subprocess
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[2];cache=Path(sys.argv[1]);out=root/'assets/social/town';out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((cache/'manifest.json').read_text());source={};outputs={}
def sha(b):return hashlib.sha256(b).hexdigest()
for name in ['manifest.json','models.bin','models.webp','atlas.webp']:
 b=(cache/name).read_bytes();source[name]={'sha256':sha(b),'bytes':len(b),'url':'https://play.ragnago.com'+(manifest['files'][name] if name!='manifest.json' else '/maps/prontera/manifest.json')}
lock=root/'tools/social/town-lock.json'
if lock.exists():
 assert json.loads(lock.read_text())['sources']==source,'Native source changed'
data=np.frombuffer((cache/'models.bin').read_bytes(),dtype='<f4').reshape(-1,10);chunks={};arrays=[];offset=0
for name,index in {'fountain':912,'tree':164,'house':174,'tower':144,'hall':1046,'lamp':0,'bench':1293}.items():
 c=manifest['modelChunks'][index];a=data[c['first']:c['first']+c['count']].copy();a[:,:3]-=[(c['min'][0]+c['max'][0])/2,c['min'][1],(c['min'][2]+c['max'][2])/2]
 chunks[name]={'first':offset,'count':len(a),'size':(np.array(c['max'])-c['min']).tolist(),'sourceChunk':index};offset+=len(a);arrays.append(a)
p=np.concatenate(arrays);original=Image.open(cache/'models.webp').convert('RGBA');sw,sh=original.size
regions=[];x=y=row=0;aw=2048
for bounds in np.unique(p[:,6:10],axis=0):
 rect=[math.floor(float(bounds[0])*sw),math.floor(float(bounds[1])*sh),math.ceil(float(bounds[2])*sw),math.ceil(float(bounds[3])*sh)];l,t,r,b=rect;w,h=r-l,b-t
 if x+w+32>aw:x=0;y+=row;row=0
 regions.append((bounds.copy(),rect,[x+16,y+16]));x+=w+32;row=max(row,h+32)
ah=2**math.ceil(math.log2(y+row));atlas=Image.new('RGBA',(aw,ah));old=p[:,6:10].copy()
for bounds,(l,t,r,b),(dx,dy) in regions:
 atlas.paste(original.crop((l-16,t-16,r+16,b+16)),(dx-16,dy-16));sel=np.all(old==bounds,axis=1)
 for col in [3,6,8]:p[sel,col]=(p[sel,col]*sw-l+dx)/aw
 for col in [4,7,9]:p[sel,col]=(p[sel,col]*sh-t+dy)/ah
 # Every recovered texel is unchanged.
 assert atlas.crop((dx,dy,dx+r-l,dy+b-t)).tobytes()==original.crop((l,t,r,b)).tobytes()
def write(name,b):
 (out/name).write_bytes(b);outputs[name]={'sha256':sha(b),'bytes':len(b)}
buf=io.BytesIO();atlas.save(buf,format='WEBP',lossless=True,exact=True);write('models.webp',buf.getvalue());write('models.bin',p.astype('<f4').tobytes())
# Keep the small original terrain atlas intact, including its native padding.
write('paving.webp',(cache/'atlas.webp').read_bytes())
write('catalog.json',(json.dumps({'stride':10,'models':chunks,'atlasSize':[aw,ah]},separators=(',',':'))+'\n').encode())
lock.write_text(json.dumps({'sources':source,'outputs':outputs},indent=2)+'\n');print('Native town models packed:',sum(r['bytes'] for r in outputs.values()),'bytes; texels verified')
