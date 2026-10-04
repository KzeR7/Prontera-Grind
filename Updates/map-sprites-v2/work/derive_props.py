#!/usr/bin/env python3
"""Variant props derived from this kit's own paintings (never from RO assets):
tree_ancient_variant <- tree_ancient_large (mirror + warmer hue)
palm_tall           <- palm_giant (mirror, slimmer, lighter)
palm_double         <- palm_giant (two composited trunks)
cactus_small        <- cactus_flower (scaled, de-flowered crop)
ruin_column_fallen  <- ruin_pillar (rotated 90, half sunk)
ruin_curb           <- ruin_stump (low wide crop)"""
import os, json
import numpy as np
from PIL import Image, ImageOps
OUT='out/props'
def hue(img,mr,mg,mb,bright=1.0):
    a=np.asarray(img,dtype=np.float32)
    a[...,0]*=mr*bright; a[...,1]*=mg*bright; a[...,2]*=mb*bright
    return Image.fromarray(np.uint8(np.clip(a,0,255)))
def anchor(img):
    a=np.asarray(img)
    rows=np.where((a[...,3]>60).sum(axis=1)>max(2,img.width*0.04))[0]
    return {'w':img.width,'h':img.height,'anchorX':img.width//2,
            'anchorY':max(1,(int(rows[-1])-3) if len(rows) else img.height-4)}
metas=json.load(open(f'{OUT}/_anchors.json'))
def save(name,img):
    img.save(f'{OUT}/{name}.png'); metas[name]=anchor(img); print('prop',name,metas[name])

tal=Image.open(f'{OUT}/tree_ancient_large.png')
save('tree_ancient_variant',hue(ImageOps.mirror(tal),1.08,1.02,0.82))

pg=Image.open(f'{OUT}/palm_giant.png')
pt=ImageOps.mirror(pg).resize((int(pg.width*0.66),int(pg.height*0.95)),Image.LANCZOS)
save('palm_tall',hue(pt,1.04,1.06,0.92,1.05))

a=pg.resize((int(pg.width*.82),int(pg.height*.82)),Image.LANCZOS)
b=ImageOps.mirror(pg).resize((int(pg.width*.62),int(pg.height*.62)),Image.LANCZOS)
b=hue(b,1.06,1.04,0.9)
W=int(a.width*1.28); H=a.height
comp=Image.new('RGBA',(W,H),(0,0,0,0))
comp.alpha_composite(b,(W-b.width,H-b.height))
comp.alpha_composite(a,(0,0))
save('palm_double',comp)
json.dump(metas,open(f'{OUT}/_anchors.json','w'),indent=1)
