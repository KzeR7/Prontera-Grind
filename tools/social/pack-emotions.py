import json,hashlib,sys
from io import BytesIO
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2];source=Path(sys.argv[1]);out=root/'assets/social/emotions';out.mkdir(parents=True,exist_ok=True)
names=json.loads((root/'tools/social/emotion-map.json').read_text());meta=json.loads((source/'meta.json').read_text());records={}
# Actions the pinned emotion.act/spr actually contains (tool/social/README.md: 93 timelines). An id
# mapped past the end has no frames to pack; it is reported and skipped instead of raising IndexError,
# because the map also carries the ids whose art is still to be generated.
SPRITE_ACTIONS=len(meta)
missing=[name for name,i in names.items() if str(i) not in meta]
for name in missing: print(f'  no art yet: {name} (action {names[name]} is not in the {SPRITE_ACTIONS}-action sprite)')

for name,i in names.items():
 if str(i) not in meta: continue
 rec=meta[str(i)];frames=[Image.open(source/f'{i}-{f}.png').convert('RGBA') for f in range(rec['frames'])];box=(min(im.getbbox()[0] for im in frames if im.getbbox()),min(im.getbbox()[1] for im in frames if im.getbbox()),max(im.getbbox()[2] for im in frames if im.getbbox()),max(im.getbbox()[3] for im in frames if im.getbbox()));frames=[im.crop(box) for im in frames]
 buffer=BytesIO();frames[0].save(buffer,format='PNG',save_all=True,append_images=frames[1:],duration=rec['delay'],loop=0,disposal=0,blend=0)
 path=out/(name+'.png')
 # Preserve existing encoding when the original pixels and timeline already agree.
 def matches(file):
  test=Image.open(file);n=0
  for f in range(test.n_frames):
   test.seek(f);repeats=round(test.info['duration']/rec['delay'])
   if abs(repeats*rec['delay']-test.info['duration'])>.01:return False
   for _ in range(repeats):
    if n>=len(frames) or test.convert('RGBA').tobytes()!=frames[n].tobytes():return False
    n+=1
  return n==len(frames)
 if not path.exists() or not matches(path):path.write_bytes(buffer.getvalue())
 test=Image.open(path);n=0
 for f in range(test.n_frames):
  test.seek(f);repeats=round(test.info['duration']/rec['delay'])
  for _ in range(repeats):assert test.convert('RGBA').tobytes()==frames[n].tobytes();n+=1
 assert n==len(frames)
 records[name]={'action':i,'delay':rec['delay'],'frames':len(frames),'sha256':hashlib.sha256((out/(name+'.png')).read_bytes()).hexdigest()}
sources={ext:{'url':'https://grf.robrowser.com/data/sprite/%C3%80%C3%8C%C3%86%C3%91%C3%86%C2%AE/emotion.'+ext,'sha256':hashlib.sha256(Path('/tmp/emotion.'+ext).read_bytes()).hexdigest()} for ext in ['act','spr']}
lock=root/'tools/social/emotions-lock.json'
if lock.exists():assert json.loads(lock.read_text())['sources']==sources,'Native emotion source changed'
existing=json.loads(lock.read_text()) if lock.exists() else {'outputs':{}}
merged={**existing.get('outputs',{}),**records}
lock.write_text(json.dumps({'sources':sources,'outputs':merged},indent=2)+'\n');print(f'{len(records)} native emotion animations rebuilt and verified; {len(missing)} still need art')
