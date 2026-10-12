#!/usr/bin/env python3
"""Audit exact supplied skill crops and native pet pixels, placement and timing."""
import hashlib,json,sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source=Path(sys.argv[1]);exports=Path(sys.argv[2]);native=Path(sys.argv[3])
mapping=json.loads((ROOT/'tools/native-skill-icons/source-map.json').read_text());icons=ROOT/'assets/skill-icons';ic=json.loads((icons/'catalog.json').read_text())
sheets={}
for i,r in enumerate(mapping['sources'],1):
 p=source/r['file'];assert digest(p)==r['sha256'] and p.stat().st_size==r['bytes'];sheets[i]=Image.open(p).convert('RGBA')
for id,r in mapping['items'].items():
 file=f"sheet-{r['sheet']}-{r['row']}-{r['column']}.png";crop=Image.open(icons/file).convert('RGBA');assert crop.tobytes()==sheets[r['sheet']].crop(r['box']).tobytes(),id
for f,r in ic['assets'].items():assert digest(icons/f)==r['sha256'] and (icons/f).stat().st_size==r['bytes']
assert len(mapping['items'])==91
for r in mapping['items'].values():
 if r['className'] in ['Assassin','Assassin Cross']:assert r['family']=='shadow',r
 if r['className']=='Swordman':assert r['family']=='sword',r
manifest=json.loads((ROOT/'tools/native-pets/source-manifest.json').read_text())
for r in manifest['files']:
 p=native/r['path'];assert digest(p)==r['sha256'] and p.stat().st_size==r['bytes']
pack=ROOT/'assets/pets/v1';catalog=json.loads((pack/'catalog.json').read_text());frames=0
assert len(catalog['species'])==20
for id,species in catalog['species'].items():
 folder=exports/id;actions=json.loads((folder/'actions.json').read_text());thumb=Image.open(pack/species['thumbnail']).convert('RGBA');src=Image.open(folder/'images'/(actions['idle0']['frames'][0]['image']+'.png')).convert('RGBA');assert thumb.size==src.size and thumb.tobytes()==src.tobytes()
 for stance in ['idle','walk','attack']:
  for d in range(8):
   r=catalog['assets'].get(id+'-'+stance)or catalog['assets'][id+'-'+stance+'-'+str(d)];assert digest(pack/r['image'])==r['imageSha256'];assert digest(pack/r['meta'])==r['metaSha256'];assert (pack/r['image']).stat().st_size==r['imageBytes'];assert (pack/r['meta']).stat().st_size==r['metaBytes']
   atlas=Image.open(pack/r['image']).convert('RGBA');meta=json.loads((pack/r['meta']).read_text());view=meta['actions'][stance+str(d)];nativeview=actions[stance+str(d)];assert view['delay']==nativeview['delay'];assert len(view['frames'])==len(nativeview['frames']);assert atlas.width*atlas.height*4<=4*1024*1024
   if stance=='attack':assert species['attackDurations'][d]==view['delay']*len(view['frames'])
   for i,poseid in enumerate(view['frames']):
    sx,sy,w,h,x,y=meta['poses'][poseid];frame=Image.new('RGBA',(256,256));frame.paste(atlas.crop((sx,sy,sx+w,sy+h)),(x,y));proof=Image.open(folder/'proof'/(stance+str(d))/(str(i)+'.png')).convert('RGBA');assert frame.tobytes()==proof.tobytes(),(id,stance,d,i);frames+=1
print(json.dumps(dict(skillCrops=91,uniqueSkillImages=len(ic['assets']),nativeInputs=len(manifest['files']),petSpecies=20,exactNativeFrames=frames,petPackBytes=sum(p.stat().st_size for p in pack.iterdir()))))
