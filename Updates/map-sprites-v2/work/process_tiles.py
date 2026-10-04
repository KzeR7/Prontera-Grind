#!/usr/bin/env python3
"""Tile pipeline: make generated 1024px tiles seamless, downscale to 128,
then derive the palette-variant tiles from our own art."""
import os, math, random
import numpy as np
from PIL import Image, ImageEnhance, ImageDraw, ImageFilter

SRC='tiles'; OUT='out/tiles'; os.makedirs(OUT, exist_ok=True)
TS=128

def tileable(img, margin=0.14):
    a=np.asarray(img.convert('RGB'),dtype=np.float32)
    H,W,_=a.shape
    b=np.roll(np.roll(a,H//2,axis=0),W//2,axis=1)
    yy=np.arange(H); xx=np.arange(W)
    def ramp(idx,n):
        m=int(n*margin)
        d=np.minimum(idx,n-1-idx).astype(np.float32)
        w=np.clip(1.0-d/m,0,1)
        return w*w*(3-2*w)  # smoothstep
    wy=ramp(yy,H)[:,None]; wx=ramp(xx,W)[None,:]
    w=np.maximum(wy,wx)[...,None]
    out=a*(1-w)+b*w
    return Image.fromarray(np.uint8(np.clip(out,0,255)))

def finish(img,name):
    img=img.resize((TS,TS),Image.LANCZOS)
    img.save(f'{OUT}/{name}.png')
    print('tile',name)

def matrix(img,mr,mg,mb,bright=1.0,sat=1.0):
    a=np.asarray(img.convert('RGB'),dtype=np.float32)
    a[...,0]*=mr; a[...,1]*=mg; a[...,2]*=mb
    a*=bright
    if sat!=1.0:
        g=a.mean(axis=2,keepdims=True)
        a=g+(a-g)*sat
    return Image.fromarray(np.uint8(np.clip(a,0,255)))

base={}
for f in sorted(os.listdir(SRC)):
    n=f[:-4]
    t=tileable(Image.open(f'{SRC}/{f}'))
    base[n]=t
    finish(t,n)

# --- derived frames & palettes (all from our own generated art) ---
W0=base['water_frame_0']
# frame 1: rolled ripple pattern = shimmer when the engine swaps frames
w1=Image.fromarray(np.roll(np.roll(np.asarray(W0),48,axis=0),24,axis=1))
w1=ImageEnhance.Brightness(w1).enhance(1.04)
base['water_frame_1']=w1; finish(w1,'water_frame_1')

finish(matrix(W0,0.42,0.52,0.78,0.50,1.05),'water_dark_0')          # Abyss deep lake
finish(matrix(base['water_frame_1'],0.42,0.52,0.78,0.50,1.05),'water_dark_1')
finish(matrix(W0,0.78,1.06,0.88,0.90,0.95),'paddy_water')           # Louyang rice paddy
finish(matrix(base['grass_forest'],0.88,0.96,1.22,0.90,0.70),'grass_geffen')   # moody blue-grey
finish(matrix(base['grass_forest'],1.16,0.90,1.18,0.72,0.30),'waste_nifl')     # purple-grey waste
finish(matrix(base['cliff_rock'],0.82,0.88,1.10,0.62,0.85),'rock_abyss')       # dark slate floor
finish(matrix(base['sand'],1.07,0.99,0.80,1.0,1.1),'sand_gold')                # Comodo golden beach
finish(matrix(base['sand'],1.0,1.0,1.04,1.12,0.45),'limestone_pale')           # Abyss Lakes shore
finish(matrix(base['dirt_path'],0.95,0.82,0.70,0.82,1.05),'dirt_payon')        # Payon forest mud
finish(matrix(base['bridge_planks'],1.42,0.52,0.46,1.0,1.25),'bridge_red')     # Amatsu lacquer deck

# grass_blossom: Amatsu meadow with fallen petals scattered over our grass
g=base['grass_olive'].copy()
g=ImageEnhance.Brightness(g).enhance(1.04)
rnd=random.Random(7)
lay=Image.new('RGBA',g.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
for i in range(260):
    x=rnd.randrange(0,g.size[0]); y=rnd.randrange(0,g.size[1])
    r=rnd.randint(7,16)
    col=rnd.choice([(248,200,216),(242,168,192),(252,224,232),(236,152,180)])
    ang=rnd.uniform(0,180)
    d.ellipse([x-r,y-int(r*.55),x+r,y+int(r*.55)],fill=col+(rnd.randint(150,220),))
lay=lay.filter(ImageFilter.GaussianBlur(1.2))
g=Image.alpha_composite(g.convert('RGBA'),lay).convert('RGB')
# keep it tileable: petals near edges get wrapped by tileable()
finish(tileable(g,0.08),'grass_blossom')
print('all tiles done:',len(os.listdir(OUT)))
