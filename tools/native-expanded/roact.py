"""Minimal Ragnarok Online SPR / ACT reader and frame painter (pure Python + Pillow).

Reads the client sprite (.spr: indexed + RGBA images, RLE from v2.1) and action (.act:
per-action frames of positioned layers, plus the attach point RO uses to pin a head to a
body) formats, and paints one frame exactly as the client composes it.
"""
import struct
from PIL import Image
def read_spr(path):
    b=open(path,'rb').read();assert b[:2]==b'SP'
    ver=struct.unpack_from('<H',b,2)[0];ni=struct.unpack_from('<H',b,4)[0];o=6;nr=0
    if ver>=0x200: nr=struct.unpack_from('<H',b,6)[0];o=8
    pal=None
    if ver>=0x101:
        p=b[-1024:];pal=[(p[i*4],p[i*4+1],p[i*4+2]) for i in range(256)]
    imgs=[]
    for _ in range(ni):
        w,h=struct.unpack_from('<HH',b,o);o+=4
        if ver>=0x201:
            n=struct.unpack_from('<H',b,o)[0];o+=2;data=bytearray();e=o+n
            while o<e:
                c=b[o];o+=1
                if c==0:
                    k=b[o];o+=1;data.extend(b'\0'*(k if k else 1))
                else:data.append(c)
            data=bytes(data[:w*h]).ljust(w*h,b'\0')
        else:
            data=b[o:o+w*h];o+=w*h
        im=Image.new('RGBA',(w,h));px=[]
        for c in data:
            px.append((0,0,0,0) if c==0 else pal[c]+(255,))
        im.putdata(px);imgs.append(im)
    rg=[]
    for _ in range(nr):
        w,h=struct.unpack_from('<HH',b,o);o+=4;d=b[o:o+w*h*4];o+=w*h*4
        im=Image.new('RGBA',(w,h));px=[(d[i*4+3],d[i*4+2],d[i*4+1],d[i*4]) for i in range(w*h)]
        im.putdata(px);rg.append(im.transpose(Image.FLIP_TOP_BOTTOM))
    return imgs,rg
def read_act(path):
    b=open(path,'rb').read();assert b[:2]==b'AC'
    ver=struct.unpack_from('<H',b,2)[0];na=struct.unpack_from('<H',b,4)[0];o=16;acts=[]
    for _ in range(na):
        nf=struct.unpack_from('<I',b,o)[0];o+=4;frames=[]
        for _ in range(nf):
            o+=32;nl=struct.unpack_from('<I',b,o)[0];o+=4;layers=[]
            for _ in range(nl):
                x,y,spr,mir=struct.unpack_from('<iiiI',b,o);o+=16
                L=dict(x=x,y=y,spr=spr,mirror=mir,sx=1.0,sy=1.0,angle=0,type=0,color=(255,255,255,255))
                if ver>=0x200:
                    L['color']=tuple(b[o:o+4]);o+=4
                    L['sx']=struct.unpack_from('<f',b,o)[0];o+=4
                    if ver>=0x204: L['sy']=struct.unpack_from('<f',b,o)[0];o+=4
                    else: L['sy']=L['sx']
                    L['angle'],L['type']=struct.unpack_from('<ii',b,o);o+=8
                    if ver>=0x205:o+=8
                layers.append(L)
            ev=-1
            if ver>=0x200: ev=struct.unpack_from('<i',b,o)[0];o+=4
            anchors=[]
            if ver>=0x203:
                n=struct.unpack_from('<i',b,o)[0];o+=4
                for _ in range(n):
                    _,ax,ay,_=struct.unpack_from('<iiii',b,o);o+=16;anchors.append((ax,ay))
            frames.append(dict(layers=layers,anchors=anchors,event=ev))
        acts.append(frames)
    delays=[4.0]*na
    if ver>=0x201:
        n=struct.unpack_from('<i',b,o)[0];o+=4+40*n
        if ver>=0x202:
            delays=list(struct.unpack_from('<%df'%na,b,o))
    return dict(ver=ver,actions=acts,delays=delays)
def draw(frame,imgs,rg,size=(200,200),origin=(100,150),only=None):
    out=Image.new('RGBA',size)
    for i,L in enumerate(frame['layers']):
        if L['spr']<0 or (only is not None and i not in only):continue
        src=(rg if L['type']==1 else imgs)
        if L['spr']>=len(src):continue
        im=src[L['spr']]
        if L['mirror']:im=im.transpose(Image.FLIP_LEFT_RIGHT)
        if abs(L['sx']-1)>1e-6 or abs(L['sy']-1)>1e-6:
            im=im.resize((max(1,round(im.width*abs(L['sx']))),max(1,round(im.height*abs(L['sy'])))),Image.NEAREST)
        if L['angle']:im=im.rotate(-L['angle'],expand=True,resample=Image.NEAREST)
        x=origin[0]+L['x']-(im.width+1)//2;y=origin[1]+L['y']-(im.height+1)//2
        out.alpha_composite(im,(x,y)) if 0<=x and 0<=y and x+im.width<=size[0] and y+im.height<=size[1] else out.paste(im,(x,y),im)
    return out
