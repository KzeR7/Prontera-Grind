#!/usr/bin/env python3
"""Pack out/tiles + out/props (+ the v1 character strip, cropped verbatim) into
assets/kit/v2/ro-spritesheet.png (2048x2048) + ro-spritesheet.json (v1 schema)."""
import os, json
import numpy as np
from PIL import Image

REPO='/home/user/Prontera-Grind'
OUTD=f'{REPO}/assets/kit/v2'; os.makedirs(OUTD,exist_ok=True)
ATLAS=2048; PAD=4
atlas=Image.new('RGBA',(ATLAS,ATLAS),(0,0,0,0))
man={'meta':{'image':'ro-spritesheet.png','size':{'w':ATLAS,'h':ATLAS},'format':'RGBA8888',
  'description':'Prontera Grind map kit v2 - RO-style terrain tiles, environment billboards & character. Original painted art (divine-pride map renders used as style reference only).'},
  'tiles':{},'sprites':{},'character':{}}

x=y=PAD; shelf=0
def place(img):
    global x,y,shelf
    w,h=img.size
    if x+w+PAD>ATLAS:
        x=PAD; y+=shelf+PAD; shelf=0
    if y+h+PAD>ATLAS: raise SystemExit('atlas overflow')
    atlas.paste(img,(x,y)); px,py=x,y
    x+=w+PAD; shelf=max(shelf,h)
    return px,py

# 1. tiles (opaque 128s) in name order
for f in sorted(os.listdir('out/tiles')):
    n=f[:-4]; img=Image.open(f'out/tiles/{f}').convert('RGBA')
    px,py=place(img)
    man['tiles'][n]={'x':px,'y':py,'w':img.width,'h':img.height}

# 2. props, tallest first for shelf efficiency
anchors=json.load(open('out/props/_anchors.json'))
props=sorted(anchors.items(),key=lambda kv:-kv[1]['h'])
for n,meta in props:
    img=Image.open(f'out/props/{n}.png')
    px,py=place(img)
    man['sprites'][n]={'x':px,'y':py,'w':meta['w'],'h':meta['h'],
                       'anchorX':meta['anchorX'],'anchorY':meta['anchorY']}

# 3. the v1 character strip, cropped verbatim (keeps the 80px scale reference)
v1=Image.open(f'{REPO}/assets/kit/ro-spritesheet.png')
c=json.load(open(f'{REPO}/assets/kit/ro-spritesheet.json'))['character']['ro_adventurer']
strip=v1.crop((c['x'],c['y'],c['x']+c['frameW']*c['frames'],c['y']+c['frameH']))
px,py=place(strip)
man['character']['ro_adventurer']={'x':px,'y':py,'frameW':c['frameW'],'frameH':c['frameH'],'frames':c['frames']}

atlas.save(f'{OUTD}/ro-spritesheet.png',optimize=True)
json.dump(man,open(f'{OUTD}/ro-spritesheet.json','w'),indent=1)
print('tiles',len(man['tiles']),'sprites',len(man['sprites']))
print('used up to y=',y+shelf+PAD)
print('wrote',OUTD)
