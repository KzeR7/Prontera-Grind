#!/usr/bin/env python3
"""Validate static atlases, all saved appearance references, and source provenance."""
import hashlib,io,json,pathlib,struct,sys
from PIL import Image,ImageChops
repo=pathlib.Path(__file__).resolve().parents[2];root=repo/'assets/wardrobe/v1';c=json.loads((root/'catalog.json').read_text());old=json.loads((repo/'Updates/lord-knight-bundles/manifest.json').read_text());cache={}
def asset(key):
 r=c['assets'][key]
 if key in cache:return cache[key]
 for path,sha,size in [(r['meta'],r['metaSha256'],r['metaBytes']),(r['image'],r['imageSha256'],r['imageBytes'])]:
  b=(root/path).read_bytes();assert len(b)==size and hashlib.sha256(b).hexdigest()==sha
 m=json.loads((root/r['meta']).read_text());im=Image.open(root/r['image']).convert('RGBA');assert im.size==(m['width'],m['height']);assert im.width*im.height*4<=4*1024*1024
 assert set(m['actions'])=={s+str(d) for s in ['idle','walk','attack'] for d in range(8)}
 for v in m['actions'].values():
  assert 0<v['delay']<=60000 and 0<len(v['frames'])<=32
  for f in v['frames']:
   for sx,sy,w,h,x,y,z,slot in f:assert 0<=sx<sx+w<=im.width and 0<=sy<sy+h<=im.height and 0<x<x+w<320 and 0<y<y+h<280
 cache[key]=(m,im);return m,im
report={'appearances':0,'frames':0,'maxChannelDifference':0,'alphaDifferenceFrames':0,'largeColorDifferenceFrames':0,'byLook':[]}
for sex in ['m','f']:
 base,bi=asset('base-'+sex)
 for head in c['hairs'][sex]:
  for pal in range(9):
   key=f'{sex}-{head}-{pal}';hair,hi=asset('hair-'+key)
   for n,b in base['actions'].items():assert len(b['frames'])==len(hair['actions'][n]['frames']) and b['delay']==hair['actions'][n]['delay']
   # Same appearance IDs, provider views and frame clocks as the preserved PGAP.
   path=repo/'Updates/lord-knight-bundles/bundles'/('4008-'+key+'.pgap')
   if not path.exists():
    paths=list((repo/'Updates/lord-knight-bundles/bundles').glob(f'4008-{sex}-sword-{head}-{pal}-*.pgap'));assert len(paths)==1,(key,paths);path=paths[0]
   b=path.read_bytes();n=struct.unpack('>I',b[6:10])[0];header=json.loads(b[10:10+n]);payload=b[10+n:];result=dict(key=key,frames=0,alphaPixels=0,largeColorPixels=0,maxDelta=0)
   for entry in header['entries']:
    view=entry['stance']+str({'S':0,'SE':7,'NE':5}[entry['direction']]);frames=base['actions'][view]['frames'];hf=hair['actions'][view]['frames'];ref=Image.open(io.BytesIO(payload[entry['offset']:entry['offset']+entry['length']]));assert len(frames)==ref.n_frames
    for i,frame in enumerate(frames):
     actual=Image.new('RGBA',(320,280));layers=[(p,bi) for p in frame]+[(p,hi) for p in hf[i]]
     for p,im in sorted(layers,key=lambda r:r[0][6]):sx,sy,w,h,x,y,_,_=p;actual.alpha_composite(im.crop((sx,sy,sx+w,sy+h)),(x,y))
     ref.seek(i);expected=ref.convert('RGBA');d=ImageChops.difference(actual,expected);alpha=d.getchannel('A');rgb=d.convert('RGB');ch=rgb.split();mx=ImageChops.lighter(ImageChops.lighter(ch[0],ch[1]),ch[2]);hist=mx.histogram();maximum=max(j for j,v in enumerate(hist) if v)
     alphaPixels=sum(alpha.histogram()[1:]);large=sum(hist[17:]);result['frames']+=1;result['alphaPixels']+=alphaPixels;result['largeColorPixels']+=large;result['maxDelta']=max(result['maxDelta'],maximum)
     report['frames']+=1;report['maxChannelDifference']=max(report['maxChannelDifference'],maximum);report['alphaDifferenceFrames']+=bool(alphaPixels);report['largeColorDifferenceFrames']+=bool(large)
   report['byLook'].append(result);report['appearances']+=1
   # Only one hair atlas retained during the offline audit.
   del cache['hair-'+key]
 print('checked',sex,flush=True)
report['catalogSha256']=hashlib.sha256((root/'catalog.json').read_bytes()).hexdigest()
path=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/wardrobe-assets.json');path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='byLook'},indent=2))
