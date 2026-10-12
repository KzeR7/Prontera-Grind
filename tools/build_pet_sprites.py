#!/usr/bin/env python3
"""Pack native pet animations losslessly; fetch only selected species at runtime."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
from wardrobe_png import encode_png

REPO = Path(__file__).resolve().parents[1]


def build(source, output):
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('Use an empty output directory')
    catalog = dict(version=1, canvas=[256,256], anchor=[128,192], species={}, assets={})
    for folder in sorted(source.iterdir(), key=lambda p:int(p.name)):
        actions = json.loads((folder/'actions.json').read_text())
        first=actions['idle0']['frames'][0];thumb=Image.open(folder/'images'/(first['image']+'.png')).convert('RGBA')
        thumbnail=f'thumb-{folder.name}.png';(output/thumbnail).write_bytes(encode_png(thumb))
        catalog['species'][folder.name]=dict(thumbnail=thumbnail,attackDurations=[actions[f'attack{d}']['delay']*len(actions[f'attack{d}']['frames']) for d in range(8)])
        for stance in ['idle','walk','attack']:
            for direction in (range(8) if folder.name=='1115' else [None]):
                selected={k:v for k,v in actions.items()if k.startswith(stance) and (direction is None or k==stance+str(direction))}
                ids = list(dict.fromkeys(frame['image'] for view in selected.values() for frame in view['frames']))
                pixels = {key:Image.open(folder/'images'/(key+'.png')).convert('RGBA') for key in ids}
                def layout(width):
                    positions={};shelves=[];height=0
                    for key in sorted(ids,key=lambda key:(-pixels[key].height,ids.index(key))):
                        im=pixels[key]
                        if im.width>width:return None
                        fits=[s for s in shelves if s[0]+im.width<=width and im.height<=s[2]]
                        shelf=min(fits,key=lambda s:width-s[0]-im.width) if fits else [0,height,im.height]
                        if not fits:shelves.append(shelf);height+=im.height+1
                        positions[key]=[shelf[0],shelf[1],im.width,im.height];shelf[0]+=im.width+1
                    return width,height-1,positions
                width,height,positions=min((x for x in (layout(w) for w in range(128,2049,16)) if x),key=lambda x:x[0]*x[1])
                assert width*height*4<=4*1024*1024,(folder.name,width,height)
                image=Image.new('RGBA',(width,height))
                for key,im in pixels.items():image.paste(im,positions[key][:2])
                png=encode_png(image);image_sha=hashlib.sha256(png).hexdigest();image_file='atlas-'+image_sha[:20]+'.png'
                (output/image_file).write_bytes(png)
                poses=[];seen={};routes={}
                for name,view in selected.items():
                    refs=[]
                    for frame in view['frames']:
                        pose=positions[frame['image']]+[frame['x'],frame['y']]
                        key=tuple(pose)
                        if key not in seen:seen[key]=len(poses);poses.append(pose)
                        refs.append(seen[key])
                    routes[name]=dict(delay=view['delay'],frames=refs)
                metadata=json.dumps(dict(version=1,width=width,height=height,poses=poses,stance=stance,direction=direction,actions=routes),separators=(',',':')).encode()
                meta_sha=hashlib.sha256(metadata).hexdigest();meta_file='poses-'+meta_sha[:20]+'.json';(output/meta_file).write_bytes(metadata)
                catalog['assets'][folder.name+'-'+stance+(''if direction is None else '-'+str(direction))]=dict(image=image_file,imageSha256=image_sha,imageBytes=len(png),meta=meta_file,metaSha256=meta_sha,metaBytes=len(metadata),width=width,height=height,figureHeight=thumb.height,thumbnail=thumbnail)
    (output/'catalog.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
    print(json.dumps(dict(species=len(catalog['species']),files=len(list(output.iterdir())),bytes=sum(p.stat().st_size for p in output.iterdir()),largestDecodedAtlasBytes=max(r['width']*r['height']*4 for r in catalog['assets'].values()))))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args();build(args.source,args.output)
