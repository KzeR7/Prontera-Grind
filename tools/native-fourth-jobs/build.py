#!/usr/bin/env python3
"""Losslessly pack pinned native renderer frames for the parked fourth-job review."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from wardrobe_png import encode_png
ROOT=Path(__file__).resolve().parents[2]
CLASSES={'Rune Knight':4054,'Warlock':4055,'Ranger':4056,'Guillotine Cross':4059,'Arch Bishop':4057,'Mechanic':4058}
def sha(data):return hashlib.sha256(data).hexdigest()
def build(source,output):
    output.mkdir(parents=True,exist_ok=True)
    manifest={'version':1,'canvas':[320,280],'anchor':[160,200],'classes':CLASSES,'looks':{}}
    for name,job in CLASSES.items():
        for sex in ['m','f']:
            actions={};images={};positions={};proof={};x=y=row=0
            for stance in ['idle','walk','attack','cast']+(['roll'] if job==4059 else []):
                for direction in range(8):
                    key=stance+str(direction);folder=source/str(job)/sex/key
                    meta=json.loads((folder/'action.json').read_text());frames=[];hashes=[]
                    assert meta['delay']>0 and meta['frames']>0
                    for i in range(meta['frames']):
                        im=Image.open(folder/f'{i}.png').convert('RGBA');assert im.size==(320,280)
                        box=im.getbbox();assert box and box[0]>0 and box[1]>0 and box[2]<320 and box[3]<280,(name,sex,key,i,'clipped')
                        crop=im.crop(box);digest=sha(crop.tobytes()+str(crop.size).encode())
                        images.setdefault(digest,crop);frames.append([digest,box[0],box[1]])
                        hashes.append(sha(im.tobytes()))
                    actions[key]={'delay':meta['delay'],'action':meta['action'],'frames':frames}
                    proof[key]=hashes
            for digest,im in sorted(images.items(),key=lambda pair:(-pair[1].height,pair[0])):
                if x+im.width>1024:x=0;y+=row+1;row=0
                positions[digest]=[x,y,im.width,im.height];x+=im.width+1;row=max(row,im.height)
            height=y+row;assert 1024*height*4<=4*1024*1024,(name,sex,'atlas budget')
            atlas=Image.new('RGBA',(1024,height))
            for digest,im in images.items():atlas.paste(im,positions[digest][:2])
            for a in actions.values():a['frames']=[positions[digest]+[dx,dy]for digest,dx,dy in a['frames']]
            data=encode_png(atlas);filename=f'{job}-{sex}.png';(output/filename).write_bytes(data)
            manifest['looks'][f'{job}-{sex}']={'image':filename,'bytes':len(data),'sha256':sha(data),'width':1024,'height':height,'actions':actions,'frameHashes':proof,'skillActions':{'gc_roll':'roll'} if job==4059 else {}}
    (output/'catalog.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    print(f"Packed {len(manifest['looks'])} native looks / {sum(len(r['actions']) for r in manifest['looks'].values())} actions; {sum(p.stat().st_size for p in output.iterdir()):,} bytes")
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.source,a.output)
