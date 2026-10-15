#!/usr/bin/env python3
"""Bake deterministic VFX materials; never reads or modifies native sprite art.

Requires Python 3, numpy 2.0.2 and Pillow 11.3.0. Output is a single transparent
1024px WebP atlas embedded in a runtime JS module, avoiding per-cast image requests.
"""
from pathlib import Path
import argparse
import base64
import io
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'assets/skill-materials.js'
SIZE = 192
CELL = 128
FRAMES = 8
NAMES = ['flame', 'fireball', 'smoke', 'flare', 'brush', 'ice', 'meteor', 'seal']
y, x = np.mgrid[-1:1:complex(SIZE), -1:1:complex(SIZE)]


def noise(xx, yy, seed=1):
    """Smooth lattice noise, sampled in a continuous advected coordinate field."""
    ix, iy = np.floor(xx).astype(int), np.floor(yy).astype(int)
    u, v = xx - ix, yy - iy
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    def h(a, b):
        value = np.sin(a*127.1+b*311.7+seed*74.7)*43758.5453
        return value-np.floor(value)
    return ((1-u)*h(ix, iy)+u*h(ix+1, iy))*(1-v)+((1-u)*h(ix, iy+1)+u*h(ix+1, iy+1))*v


def fbm(xx, yy, seed=1):
    return sum(noise(xx*2**i, yy*2**i, seed+i*9)*(.55/2**i) for i in range(4)) / 1.03125


def rgba(color, alpha):
    a = np.clip(alpha, 0, 1)
    color = np.broadcast_to(color, (SIZE, SIZE, 3))
    pixels = np.dstack((np.clip(color, 0, 255), a*255)).astype(np.uint8)
    # Transparent borders prevent sampling neighboring cells during scaling.
    pixels[:2, :, 3] = pixels[-2:, :, 3] = 0
    pixels[:, :2, 3] = pixels[:, -2:, 3] = 0
    return Image.fromarray(pixels)


def glow(image, radius=5, gain=.5):
    """Bake local diffusion once, keeping the hot core sharp."""
    halo = image.filter(ImageFilter.GaussianBlur(radius))
    halo.putalpha(halo.getchannel('A').point(lambda a: int(a*gain)))
    return Image.alpha_composite(halo, image)


def flame(frame):
    t = frame/FRAMES*math.tau
    h = np.clip((.78-y)/1.65, 0, 1)
    flow = fbm(x*4+np.sin(t)*.45, y*4+np.cos(t)*.45-h*4, 11)
    fine = fbm(x*12+np.sin(t)*.4, y*7+np.cos(t)*.4, 41)
    center = np.sin(h*10+t)*(.04+h*.12) + (flow-.5)*.18
    width = .42*(1-h)**.68+.025
    dist = np.abs(x-center)/width
    density = np.clip((1-dist+(flow-.5)*1.4)*2.1, 0, 1)
    density *= np.clip((.82-y)*9, 0, 1)*np.clip((y+1)*5, 0, 1)
    density *= np.clip((1-h)*2.4+(flow-.4)*1.7, 0, 1)
    heat = np.clip((1-dist)*.85+(1-h)*.45+(fine-.5)*.5, 0, 1)
    stops = np.array([[100, 12, 5], [225, 42, 7], [255, 135, 20], [255, 224, 115], [255, 255, 235]])
    color = np.stack([np.interp(heat, np.linspace(0,1,5), stops[:,c]) for c in range(3)], axis=-1)
    return glow(rgba(color, density*.97), 5, .8)


def fireball(frame):
    t=frame/FRAMES*math.tau
    n=fbm(x*4+np.sin(t)*.6,y*4+np.cos(t)*.6,62)
    r=np.hypot(x,y)
    edge=.64+(n-.5)*.28
    density=np.clip((edge-r)*13,0,1)
    heat=np.clip(.45+(n-.5)*1.6+(1-r/.7)*.7,0,1)
    stops=np.array([[121,19,6],[230,62,9],[255,170,35],[255,244,181]])
    color=np.stack([np.interp(heat,np.linspace(0,1,4),stops[:,c]) for c in range(3)],axis=-1)
    return glow(rgba(color,density),6,.9)


def smoke(frame):
    t=frame/FRAMES*math.tau
    n=fbm(x*3+np.sin(t)*.3,y*3+np.cos(t)*.3,53)
    n2=fbm(x*7+np.cos(t)*.4,y*7+np.sin(t)*.4,78)
    r=np.hypot(x,y)
    density=np.clip((.8-r+(n-.5)*.48)*4,0,1)*np.clip((n-.25)*1.7,0,1)
    light=np.clip(145+(n-.5)*160+(n2-.5)*95-x*27-y*21,45,225)
    return rgba(np.stack((light*.91,light*.95,light),axis=-1),density*.78)


def flare(frame):
    t=frame/FRAMES
    r=np.hypot(x,y);an=np.arctan2(y,x)
    n=fbm(x*7,y*7,93)
    rays=(np.cos(an*11+np.sin(an*5)*2)**18)*np.exp(-r*4)
    core=np.exp(-r*r/(.012+t*.018))
    cloud=np.exp(-r*r/(.12+t*.11))*(.4+n*.6)
    density=np.clip(core+rays*.7+cloud*.48,0,1)*(1-t*.65)
    warmth=np.clip(r*1.8,0,1)
    return rgba(np.stack((255-warmth*8,251-warmth*56,237-warmth*128),axis=-1),density)


def brush(frame):
    t=frame/FRAMES*math.tau
    n=fbm(x*6+np.sin(t)*.2,y*8+np.cos(t)*.2,38)
    streak=fbm(x*3+np.sin(t)*.3,y*35,101)
    spine=np.sin(x*5+t)*.035
    width=.32+np.sin((x+1)*math.pi/2)*.13+(n-.5)*.23
    body=np.clip((width-np.abs(y-spine))*9,0,1)
    fade=np.clip((1-np.abs(x))*8,0,1)
    strands=np.clip((streak-.3)*2.7,0,1)
    density=(body*strands*.65+np.exp(-((y-spine)/.065)**2)*.65)*fade
    return glow(rgba([255,255,255],np.clip(density,0,1)),2,.3)


def ice(frame):
    # A shaded refractive shard, frost grain, internal fractures and edge glints.
    im=Image.new('RGBA',(SIZE,SIZE));d=ImageDraw.Draw(im)
    tip=(104,18);a=(65,65);b=(135,103);base=(91,174);left=(59,160);right=(127,167)
    d.polygon([tip,a,left,base,right,b],fill=(50,108,165,230))
    d.polygon([tip,a,base],fill=(81,170,218,220));d.polygon([tip,b,right,base],fill=(168,224,249,225))
    d.polygon([a,left,base],fill=(47,104,167,220));d.polygon([tip,(98,84),base],fill=(226,249,255,190))
    mask=np.asarray(im.getchannel('A'))/255
    n=fbm(x*19,y*19,123)
    glowline=np.exp(-((x+.06+y*.05)/.03)**2)
    arr=np.array(im,dtype=float);arr[:,:,:3]=np.clip(arr[:,:,:3]+(n-.5)[:,:,None]*48+glowline[:,:,None]*30,0,255)
    im=Image.fromarray(arr.astype(np.uint8));d=ImageDraw.Draw(im)
    d.line([a,tip,b,right],fill=(218,250,255,255),width=2)
    d.line([tip,base],fill=(242,255,255,235),width=2)
    for points in [[(85,79),(101,102),(84,123)],[(101,102),(116,119)],[(76,140),(92,149),(103,139)]]:d.line(points,fill=(205,243,255,125),width=1)
    t=frame/FRAMES*math.tau;gx=104+int(math.sin(t)*5);gy=45+int((frame/FRAMES)*105)
    d.line([(gx-9,gy),(gx+9,gy)],fill=(246,255,255,210));d.line([(gx,gy-7),(gx,gy+7)],fill=(246,255,255,210))
    return glow(im,3,.22)


def meteor(frame):
    t=frame/FRAMES*math.tau
    n=fbm(x*8+np.sin(t)*.1,y*8+np.cos(t)*.1,149)
    r=np.hypot(x,y);radius=.67+(fbm(x*4,y*4,119)-.5)*.15
    z=np.sqrt(np.clip(1-(r/.72)**2,0,1))
    lighting=np.clip((-x*.7-y*.6+z*.8),0,1)
    crust=28+lighting*65+(n-.5)*45
    # Emissive lava fractures through a rough, lit stone surface.
    fractures=np.clip((.055-np.abs(n-.48))*24,0,1)**2
    color=np.stack((crust*1.15+fractures*162,crust*.85+fractures*61,crust*.7+fractures*6),axis=-1)
    return glow(rgba(color,np.clip((radius-r)*30,0,1)),3,.35)


def seal(frame):
    im=Image.new('RGBA',(SIZE,SIZE));d=ImageDraw.Draw(im);c=SIZE/2;r=77
    color=(255,235,184,220)
    for rr,width in [(r,2),(r-5,1),(r-21,1)]:d.ellipse((c-rr,c-rr,c+rr,c+rr),outline=color,width=width)
    for offset in [0,math.pi]:
        pts=[(c+math.cos(j*math.tau/3+offset)*51,c+math.sin(j*math.tau/3+offset)*51) for j in range(4)]
        d.line(pts,fill=(255,225,156,160),width=1)
    for j in range(24):
        a=j*math.tau/24;cc,ss=math.cos(a),math.sin(a)
        px,py=c+cc*66,c+ss*66
        d.line([(px-cc*4-ss*2,py-ss*4+cc*2),(px+cc*4-ss*2,py+ss*4+cc*2),(px-ss*2,py+cc*2),(px+ss*2,py-cc*2)],fill=color,width=1)
    return glow(im,2,.45)


RENDERERS=[flame,fireball,smoke,flare,brush,ice,meteor,seal]


def build():
    atlas=Image.new('RGBA',(CELL*FRAMES,CELL*len(NAMES)))
    for row,render in enumerate(RENDERERS):
        for frame in range(FRAMES):
            image=render(frame).resize((CELL,CELL),Image.Resampling.LANCZOS)
            alpha=np.array(image.getchannel('A'));alpha[:2,:]=alpha[-2:,:]=0;alpha[:,:2]=alpha[:,-2:]=0
            image.putalpha(Image.fromarray(alpha));atlas.paste(image,(frame*CELL,row*CELL))
    data=io.BytesIO();atlas.save(data,format='WEBP',quality=82,alpha_quality=80,method=4)
    encoded=base64.b64encode(data.getvalue()).decode('ascii')
    module=(ROOT/'tools/skill-fx-materials/runtime.js').read_text()
    return '// Generated by tools/build_skill_materials.py; do not edit.\n'+module.replace('__ATLAS_DATA__',encoded),atlas


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true');parser.add_argument('--contact-sheet',type=Path)
    args=parser.parse_args();content,atlas=build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text()!=content:raise SystemExit('Skill materials are stale; run tools/build_skill_materials.py')
        print('Skill material atlas matches its deterministic source')
    else:
        OUTPUT.write_text(content);print('Generated assets/skill-materials.js')
    if args.contact_sheet:atlas.save(args.contact_sheet)
