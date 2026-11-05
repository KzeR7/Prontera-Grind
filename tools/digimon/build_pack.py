#!/usr/bin/env python3
"""Build the small Digimon follower study pack from a local pinned sprite checkout.
Usage: python tools/digimon/build_pack.py /path/to/digimon-up-sprites/baked
Build the four Sanctuary lines with idle, walking, attack and faint frames.
"""
import hashlib,json,sys
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]); dest=Path('assets/digimon/v2');dest.mkdir(parents=True,exist_ok=True)
catalog={'version':2,'source':'https://github.com/dannyphang/digimon-up-sprites','revision':'4eaee71cc949953e45ce5a77564469ba93e36907','species':{}}
for name in ['agumon','gabumon','patamon','palmon','greymon','metalgreymon','wargreymon','garurumon','weregarurumon','metalgarurumon','angemon','magnaangemon','seraphimon','togemon','lillymon','rosemon']:
 items=[];idle=[];size=None
 for act in ['idle','walking','attack','faint']:
  for path in sorted((root/name/act).glob('f_*.png')):
   raw=path.read_bytes(); im=Image.open(path).convert('RGBA');size=im.size;box=im.getchannel('A').getbbox()
   if not box:box=(0,0,1,1)  # Some attack/faint sequences deliberately contain blank frames.
   if act=='idle':idle.append(box)
   items.append((act,path.name,im.crop(box),box,hashlib.sha256(raw).hexdigest()))
 if not idle or not any(a=='walking' for a,*_ in items):raise ValueError('missing action '+name)
 l=min(x[0] for x in idle);t=min(x[1] for x in idle);r=max(x[2] for x in idle);b=max(x[3] for x in idle)
 # Shelf-pack each exact source frame; its original offset keeps every action on one foot pivot.
 width=2048 if max(image.width for _,_,image,_,_ in items)>1024 else 1024
 if max(image.width for _,_,image,_,_ in items)>width:raise ValueError('frame too wide '+name)
 x=y=row=0;records={act:[] for act in ['idle','walking','attack','faint']}; placements=[]
 for act,filename,image,box,sha in items:
  w,h=image.size
  if x+w>width:x=0;y+=row+1;row=0
  placements.append((image,x,y));records[act].append({'rect':[x,y,w,h],'offset':[box[0],box[1]],'source':filename,'sha256':sha});x+=w+1;row=max(row,h)
 atlas=Image.new('RGBA',(width,y+row),(0,0,0,0))
 for image,x,y in placements:atlas.paste(image,(x,y))
 atlas.save(dest/(name+'.png'),optimize=True)
 catalog['species'][name]={'image':name+'.png','canvas':list(size),'anchor':[(l+r)/2,b],'figureHeight':b-t,'actions':records}
(dest/'catalog.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
print('Built',len(catalog['species']),'species')
