#!/usr/bin/env python3
"""Pack native class exports, sharing hair/costume pixels across the entire roster."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

CLASSES = {'Swordman':1,'Knight':7,'Lord Knight':4008,'Thief':6,'Assassin':12,
           'Assassin Cross':4013,'Archer':3,'Hunter':11,'Sniper':4012}

def add_figure_heights(manifest, source):
    # Measure the native rest pose without costumes or weapon effects. Keep the same
    # world height as the previous renderer rather than scaling from unrelated APNG art.
    for job in CLASSES.values():
        for sex in ['m','f']:
            folder=source/str(job)
            body=json.loads((folder/f'base-{sex}.json').read_text())['idle0']['frames'][0]
            hair=json.loads((folder/f'hair-{sex}-2-0.json').read_text())['idle0']['frames'][0]
            layers=[p for p in body+hair if p['slot'] in {'body','hair'}]
            top=min(p['y'] for p in layers)
            bottom=max(p['y']+Image.open(folder/'images'/(p['image']+'.png')).height for p in layers)
            manifest['assets'][f'base-{job}-{sex}']['figureHeight']=bottom-top

def build(source, output):
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('Use an empty output directory to avoid orphaned assets')
    groups, images = {}, {}
    for job in CLASSES.values():
        folder = source / str(job)
        for path in sorted(folder.glob('*.json')):
            name = path.stem
            actions = json.loads(path.read_text())
            if name.startswith('base-'):
                sex = name.split('-')[1]
                parts = [('base-'+str(job)+'-'+sex, {'body','weapon'}),
                         ('costume-'+sex, {'halo','glasses','wings','shadow'})]
            else:
                parts = [(name, {'hair'})]
            for group, slots in parts:
                target = groups.setdefault(group, {})
                for key, view in actions.items():
                    frames = [[p for p in frame if p['slot'] in slots] for frame in view['frames']]
                    target[key if group.startswith('base-') else str(job)+':'+key] = dict(delay=view['delay'], frames=frames)
                    for frame in frames:
                        for p in frame:
                            images.setdefault(p['image'], folder/'images'/(p['image']+'.png'))
    manifest = dict(version=2, width=320, height=280, anchor=[160,200], classes=CLASSES, assets={})
    for name, actions in sorted(groups.items()):
        # Native action order is stable across palettes; content-hash order is not.
        # Stable placement lets all palette variants reuse the same attachment file.
        ids = list(dict.fromkeys(p['image'] for v in actions.values() for f in v['frames'] for p in f))
        order = {image:i for i,image in enumerate(ids)}
        pixels = {i:Image.open(images[i]).convert('RGBA') for i in ids}
        positions = {}; x = y = row = 0
        for i in sorted(ids, key=lambda i:(-pixels[i].height,order[i])):
            im = pixels[i]
            if x+im.width>512:
                x=0; y+=row+1; row=0
            positions[i]=[x,y,im.width,im.height]
            x+=im.width+1; row=max(row,im.height)
        height=max(1,y+row)
        assert 512*height*4<=4*1024*1024, (name,height)
        atlas=Image.new('RGBA',(512,height))
        for i,im in pixels.items():
            atlas.paste(im,positions[i][:2])
        stream=io.BytesIO(); atlas.save(stream,format='PNG',optimize=True)
        png=stream.getvalue(); sha=hashlib.sha256(png).hexdigest(); image='atlas-'+sha[:20]+'.png'
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
        meta=json.dumps(dict(version=2,width=512,height=height,poses=poses,actions=actions),separators=(',',':')).encode()
        digest=hashlib.sha256(meta).hexdigest(); filename='poses-'+digest[:20]+'.json'; (output/filename).write_bytes(meta)
        manifest['assets'][name]=dict(meta=filename,metaSha256=digest,metaBytes=len(meta),image=image,imageSha256=sha,imageBytes=len(png),width=512,height=height)
    add_figure_heights(manifest, source)
    assert len(manifest['assets'])==380, len(manifest['assets'])
    (output/'catalog.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    files=list(output.iterdir())
    print(json.dumps(dict(files=len(files),bytes=sum(p.stat().st_size for p in files),images=len(list(output.glob('*.png'))),maxAtlasBytes=max(r['width']*r['height']*4 for r in manifest['assets'].values()))))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path); parser.add_argument('output',type=Path)
    args=parser.parse_args(); build(args.source,args.output)
