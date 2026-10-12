#!/usr/bin/env python3
"""Build a shared 19-class wardrobe with individually loaded accessories."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
from wardrobe_png import encode_png
from build_wardrobe_classes import CLASSES

def build(source,pieces,definitions,output):
    output.mkdir(parents=True,exist_ok=True)
    if any(output.iterdir()):raise ValueError('Use an empty output directory')
    defs=json.loads(definitions.read_text());groups={};images={};heights={}
    def add(folder,path,group,slots,job):
        actions=json.loads(path.read_text());target=groups.setdefault(group,{})
        for name,view in actions.items():
            frames=[[p for p in f if p['slot'] in slots] for f in view['frames']]
            target[name if group.startswith('base-') else str(job)+':'+name]=dict(delay=view['delay'],frames=frames)
            for f in frames:
                for p in f:images.setdefault(p['image'],folder/'images'/(p['image']+'.png'))
    for job in CLASSES.values():
        folder=source/str(job)
        for sex in ['m','f']:
            base=json.loads((folder/f'base-{sex}.json').read_text())['idle0']['frames'][0]
            hair=json.loads((folder/f'hair-{sex}-2-0.json').read_text())['idle0']['frames'][0]
            figure=[p for p in base+hair if p['slot'] in {'body','hair'}]
            heights[f'base-{job}-{sex}']=max(p['y']+Image.open(folder/'images'/(p['image']+'.png')).height for p in figure)-min(p['y']for p in figure)
            add(folder,folder/f'base-{sex}.json',f'base-{job}-{sex}',{'body','weapon','shadow'},job)
            for items in defs.values():
                for item in items:
                    f=pieces/str(job);key=item['key'];add(f,f/f'{key}-{sex}.json',f'piece-{key}-{sex}',{key},job)
        for path in sorted(folder.glob('hair-*.json')):add(folder,path,path.stem,{'hair'},job)
    manifest=dict(version=2,width=320,height=280,anchor=[160,200],classes=CLASSES,outfits={},accessories=defs,assets={})
    for name, actions in sorted(groups.items()):
        # Native action order is stable across palettes; content-hash order is not.
        # Stable placement lets all palette variants reuse the same attachment file.
        ids = list(dict.fromkeys(p['image'] for v in actions.values() for f in v['frames'] for p in f))
        order = {image:i for i,image in enumerate(ids)}
        pixels = {i:Image.open(images[i]).convert('RGBA') for i in ids}
        def layout(width):
            positions = {}; shelves = []; height = 0
            for i in sorted(ids, key=lambda i:(-pixels[i].height,order[i])):
                im = pixels[i]
                if im.width > width:
                    return None
                fits = [s for s in shelves if s[0]+im.width<=width and im.height<=s[2]]
                if fits:
                    shelf = min(fits, key=lambda s:width-s[0]-im.width)
                else:
                    shelf = [0,height,im.height]; shelves.append(shelf)
                    height += im.height+1
                positions[i]=[shelf[0],shelf[1],im.width,im.height]
                shelf[0] += im.width+1
            return width, max(1,height-1), positions
        candidates = [layout(w) for w in (range(256,2049,16) if name.startswith('piece-') else [512])]
        width,height,positions = min((v for v in candidates if v), key=lambda v:v[0]*v[1])
        assert width*height*4<=4*1024*1024, (name,width,height)
        atlas=Image.new('RGBA',(width,height))
        for i,im in pixels.items():
            atlas.paste(im,positions[i][:2])
        png=encode_png(atlas); sha=hashlib.sha256(png).hexdigest(); image='atlas-'+sha[:20]+'.png'
        (output/image).write_bytes(png)
        # Frame references retain native timing while removing repeated attachment records.
        poses=[]; seen={}
        for view in actions.values():
            frames=[]
            for frame in view['frames']:
                pose=[positions[p['image']]+[p['x'],p['y'],p['z'],p['slot']] for p in frame]
                identity=json.dumps(pose,separators=(',',':'))
                if identity not in seen:
                    seen[identity]=len(poses); poses.append(pose)
                frames.append(seen[identity])
            view['frames']=frames
        metadata=dict(version=2,width=width,height=height,poses=poses,actions=actions)
        if name.startswith('piece-'):
            # Repeated attachment layers dominate larger accessory collections.
            # Reference each exact layer once without changing pixels or ordering.
            layers=[]; layer_ids={}; compact=[]
            for pose in poses:
                refs=[]
                for layer in pose:
                    identity=tuple(layer)
                    if identity not in layer_ids:
                        layer_ids[identity]=len(layers); layers.append(layer)
                    refs.append(layer_ids[identity])
                compact.append(refs)
            metadata.update(poses=compact,layers=layers)
        meta=json.dumps(metadata,separators=(',',':')).encode()
        digest=hashlib.sha256(meta).hexdigest(); filename='poses-'+digest[:20]+'.json'; (output/filename).write_bytes(meta)
        manifest['assets'][name]=dict(meta=filename,metaSha256=digest,metaBytes=len(meta),image=image,imageSha256=sha,imageBytes=len(png),width=width,height=height)
    for key,height in heights.items():manifest['assets'][key]['figureHeight']=height
    assert len(manifest['assets'])==360+2*len(CLASSES)+2*sum(len(x)for x in defs.values())
    (output/'catalog.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    files=list(output.iterdir());print(json.dumps(dict(files=len(files),bytes=sum(p.stat().st_size for p in files),maxAtlasBytes=max(r['width']*r['height']*4 for r in manifest['assets'].values()))))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['source','pieces','definitions','output']:p.add_argument(name,type=Path)
    a=p.parse_args();build(a.source,a.pieces,a.definitions,a.output)
