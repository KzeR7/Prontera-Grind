"""Rasterize the live geometry over its actual space texture. Requires Pillow/numpy.
The image is a software atlas illustration, not evidence of browser WebGL pixels.
"""
import sys,json,base64,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path(__file__).resolve().parents[2]
data=json.load(sys.stdin);scale=2;w,h=750*scale,350*scale
kind=data.get('kind','astral')
sky=Image.new('RGB',(w,h),(24,12,14)) if kind=='thor' else Image.open(root/'tools/maps/textures/astral-void.png').convert('RGB').resize((w,h),Image.Resampling.LANCZOS)
canvas=np.array(sky).copy();zbuf=np.full((h,w),np.inf);glow=np.zeros((h,w,3),dtype=np.uint8)
stone=np.array(Image.open(root/'tools/maps/textures/weathered-stone.png').convert('RGB'));th,tw=stone.shape[:2]
textures=[np.array(Image.open(io.BytesIO(base64.b64decode(t))).convert('RGB')) for t in data.get('textures',[])]
for f in data['faces']:
 p=np.array(f['p']);p[:,:2]*=scale
 xmin=max(0,int(np.floor(p[:,0].min())));xmax=min(w-1,int(np.ceil(p[:,0].max())))
 ymin=max(0,int(np.floor(p[:,1].min())));ymax=min(h-1,int(np.ceil(p[:,1].max())))
 if xmax<xmin or ymax<ymin:continue
 ax,ay,az=p[0];bx,by,bz=p[1];cx,cy,cz=p[2];den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
 if abs(den)<.0001:continue
 yy,xx=np.mgrid[ymin:ymax+1,xmin:xmax+1];xx=xx+.5;yy=yy+.5
 u=((by-cy)*(xx-cx)+(cx-bx)*(yy-cy))/den;v=((cy-ay)*(xx-cx)+(ax-cx)*(yy-cy))/den;q=1-u-v
 depth=u*az+v*bz+q*cz;view=zbuf[ymin:ymax+1,xmin:xmax+1];mask=(u>=0)&(v>=0)&(q>=0)&(depth<view)
 if not mask.any():continue
 color=np.array(f['c'])
 if f['uv']:
  surface=textures[f['texture']] if f.get('texture') is not None else stone;th,tw=surface.shape[:2]
  tex=np.array(f['uv']);tx=((u*tex[0,0]+v*tex[1,0]+q*tex[2,0])%1*(tw-1)).astype(int);ty=((1-(u*tex[0,1]+v*tex[1,1]+q*tex[2,1])%1)*(th-1)).astype(int)
  lit=np.clip(surface[ty,tx]*color/(255 if kind=='thor' else 190),0,255).astype(np.uint8);canvas[ymin:ymax+1,xmin:xmax+1][mask]=lit[mask]
 else:canvas[ymin:ymax+1,xmin:xmax+1][mask]=color
 view[mask]=depth[mask]
 if f['glow']:glow[ymin:ymax+1,xmin:xmax+1][mask]=color
blur=np.array(Image.fromarray(glow).filter(ImageFilter.GaussianBlur(4)))
canvas=np.clip(canvas.astype(float)+blur*.5,0,255).astype(np.uint8)
result=Image.fromarray(canvas).resize((750,350),Image.Resampling.LANCZOS)
result.save(Path(sys.argv[1]) if len(sys.argv)>1 else root/('assets/atlas/thor-volcano.png' if kind=='thor' else 'assets/atlas/astral-citadel.png'),optimize=True)
print('Rendered actual '+kind+' battlefield geometry into atlas PNG.',file=sys.stderr)
