#!/usr/bin/env python3
"""Prop pipeline: chroma-key the magenta background off generated prop paintings,
despill the edges, trim, scale to the atlas target size, measure the ground anchor."""
import os, sys, json
import numpy as np
from PIL import Image

SRC='props'; OUT='out/props'; os.makedirs(OUT, exist_ok=True)

# target max atlas pixel size per prop (w,h). Scaled to fit, aspect kept.
TARGET={
 'tree_ancient_large':(300,340),'tree_ancient_variant':(300,340),'tree_tall_cluster':(250,300),
 'tree_sapling':(150,150),'tree_bush_bright':(150,120),'rock_cliff_crag':(220,180),
 'river_stone_post':(80,110),'rock_boulder_mossy':(160,120),
 'palm_giant':(240,330),'palm_tall':(190,300),'palm_double':(260,300),
 'cactus_flower':(130,170),'cactus_small':(100,120),
 'ruin_pillar':(120,260),'ruin_column_fallen':(220,110),'ruin_stump':(130,130),
 'ruin_curb':(160,80),'desert_bone':(190,120),
 'bamboo_grove':(230,330),'tree_dead':(240,310),'tombstone':(110,140),
 'house_ruin':(280,240),'tree_cherry':(290,330),'lantern_stone':(100,160),
 'bridge_red_arch':(320,180),'shrine_stone':(170,230),'stalagmite':(170,260),
 'crystal_cluster':(170,190),'standing_stone':(150,230),'tree_dark_gnarled':(280,330),
 'house_prontera':(280,260),'tower_geffen':(200,340),'pier_post':(80,130),
 'torii_gate':(260,280),
}

def key_magenta(img):
    a=np.asarray(img.convert('RGB'),dtype=np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    # magenta-ness: red & blue high, green low
    mag=np.minimum(r,b)-g
    alpha=np.clip((80-mag)/60.0,0,1)          # mag>80 -> bg, mag<20 -> solid
    # despill: pull magenta cast out of semi pixels
    spill=np.clip(np.minimum(r,b)-g,0,255)*0.55*(alpha<1)*(alpha>0)
    r2=r-spill; b2=b-spill
    out=np.dstack([r2,g,b2,alpha*255])
    return Image.fromarray(np.uint8(np.clip(out,0,255)),'RGBA')

def trim(img,thr=16):
    a=np.asarray(img)
    m=a[...,3]>thr
    ys,xs=np.where(m)
    if len(xs)==0: return img,(0,0)
    x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
    return img.crop((x0,y0,x1+1,y1+1)),(x0,y0)

def clean(img,thr=24):
    """drop stray semi-transparent islands smaller than 0.2% of pixels"""
    try: from scipy import ndimage
    except ImportError: return img
    a=np.asarray(img).copy()
    m=a[...,3]>thr
    lab,n=ndimage.label(m)
    if n>1:
        sizes=ndimage.sum(m,lab,range(1,n+1))
        keep=set(i+1 for i,s in enumerate(sizes) if s>=m.sum()*0.002)
        kill=~np.isin(lab,list(keep))
        a[...,3][kill]=0
    return Image.fromarray(a)

def process(name):
    img=Image.open(f'{SRC}/{name}.png')
    img=key_magenta(img)
    img=clean(img)
    img,_=trim(img)
    tw,th=TARGET.get(name,(200,200))
    s=min(tw/img.width,th/img.height,1.0)
    img=img.resize((max(1,int(img.width*s)),max(1,int(img.height*s))),Image.LANCZOS)
    # anchor: horizontal centre, bottom-most meaningfully-opaque row minus a small inset
    a=np.asarray(img)
    rows=np.where((a[...,3]>60).sum(axis=1)>max(2,img.width*0.04))[0]
    ay=(int(rows[-1])-3) if len(rows) else img.height-4
    img.save(f'{OUT}/{name}.png')
    meta={'w':img.width,'h':img.height,'anchorX':img.width//2,'anchorY':max(1,ay)}
    print('prop',name,meta)
    return meta

if __name__=='__main__':
    names=[n[:-4] for n in sorted(os.listdir(SRC)) if n.endswith('.png')]
    if len(sys.argv)>1: names=sys.argv[1:]
    metas={}
    for n in names: metas[n]=process(n)
    json.dump(metas,open(f'{OUT}/_anchors.json','w'),indent=1)
