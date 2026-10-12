#!/usr/bin/env python3
"""Build a local class/gender/weapon/hair audit. --fetch downloads missing renders only.
Two concurrent requests maximum; byte-for-byte response cache is kept outside the repo.
Each armed animation is compared with the identical native action without a weapon.
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import time
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image, ImageChops, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Updates/class-weapon-preview'
CATALOG = ROOT / 'tools/class_weapon_catalog.json'
CACHE = Path(os.environ.get('WORKSPACE_ROOT', str(ROOT.parents[3]))) / 'workspace-context/class-weapon-cache'

def plan(catalog, pilot=False):
    for cls in catalog['classes']:
        for sex in ['m', 'f']:
            for weapon in cls['weapons']:
                for hair in catalog['hairs'][:1] if pilot else catalog['hairs']:
                    for direction, facing in ({'SE':7} if pilot else catalog['directions']).items():
                        base = cls.get('action') or cls['actions'][sex][weapon]
                        params = {'job':cls['job'], 'gender':'female' if sex=='f' else 'male',
                            'head':hair['id'], 'headPalette':0, 'headgear':'69,3', 'garment':1,
                            'weapon':catalog['weapons'][weapon], 'action':base+facing,
                            'enableShadow':'true', 'canvas':catalog['canvas']}
                        key = f"{cls['job']}-{sex}-{weapon}-{hair['id']}-{direction}"
                        yield {'key':key, 'class':cls['name'], 'job':cls['job'], 'sex':sex,
                               'weapon':weapon, 'hair':hair['id'], 'direction':direction, 'params':params}

def url(catalog, params):
    return catalog['provider'] + '?' + urllib.parse.urlencode(params)

_LOCKS = {}

def fetch(source, allow):
    key = hashlib.sha256(source.encode()).hexdigest()
    # Axe and mace cases can request the same unarmed baseline concurrently.
    with _LOCKS.setdefault(key, threading.Lock()):
        return fetch_locked(source, allow)

def fetch_locked(source, allow):
    key = hashlib.sha256(source.encode()).hexdigest()
    file = CACHE / (key+'.png')
    if file.exists(): return file.read_bytes()
    if not allow: raise RuntimeError('Missing cached render; use --fetch: '+source)
    for attempt in range(3):
        try:
            request = urllib.request.Request(source, headers={'User-Agent':'Prontera-Grind-sprite-fitting/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response: data=response.read()
            with Image.open(io.BytesIO(data)) as check: check.verify()
            tmp = file.with_suffix('.tmp'); tmp.write_bytes(data); tmp.replace(file)
            return data
        except (urllib.error.URLError, TimeoutError):
            if attempt==2: raise
            time.sleep(1+attempt*2)

def frames(data):
    with Image.open(io.BytesIO(data)) as image:
        result=[(f.convert('RGBA'),round(f.info.get('duration',0))) for f in ImageSequence.Iterator(image)]
        return image.size, result

def inspect(case, catalog, allow):
    result={k:v for k,v in case.items() if k!='params'}
    armed_url=url(catalog,case['params']); bare_url=url(catalog,{**case['params'],'weapon':0})
    result.update(url=armed_url,baselineUrl=bare_url)
    try:
        data=fetch(armed_url,allow); bare=fetch(bare_url,allow)
        size,armed=frames(data); bare_size,unarmed=frames(bare)
        if size!=(320,280) or bare_size!=size or len(armed)<2 or len(armed)!=len(unarmed):
            raise ValueError('Unexpected dimensions/frame coverage')
        differences=[];clipped=[];durations=[]
        for i,((a,delay),(b,bdelay)) in enumerate(zip(armed,unarmed)):
            if delay<=0 or delay!=bdelay: raise ValueError('Native action timing mismatch')
            box=a.getbbox()
            if box is None: raise ValueError('Empty frame')
            if box[0]<=0 or box[1]<=0 or box[2]>=size[0] or box[3]>=size[1]: clipped.append(i)
            rgb=ImageChops.difference(a,b)
            # All channels matter: a weapon may cover opaque pixels without changing alpha.
            mask=ImageChops.lighter(ImageChops.lighter(rgb.getchannel('R'),rgb.getchannel('G')),
                                    ImageChops.lighter(rgb.getchannel('B'),rgb.getchannel('A')))
            differences.append(sum(count for value,count in enumerate(mask.histogram()) if value))
            durations.append(delay)
        status='pass' if any(differences) and not clipped else 'missing-weapon' if not any(differences) else 'clipped'
        filename=case['key']+'.png'
        (OUT/'art'/filename).write_bytes(data)
        armed[0][0].save(OUT/'art'/(case['key']+'-still.png'))
        result.update(file=filename,sha256=hashlib.sha256(data).hexdigest(),baselineSha256=hashlib.sha256(bare).hexdigest(),
            frames=len(armed),durations=durations,weaponPixels=differences,clippedFrames=clipped,status=status)
    except Exception as error:
        result.update(status='error',error=str(error))
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch',action='store_true');parser.add_argument('--pilot',action='store_true')
    args=parser.parse_args();catalog=json.loads(CATALOG.read_text())
    CACHE.mkdir(parents=True,exist_ok=True);(OUT/'art').mkdir(parents=True,exist_ok=True)
    cases=list(plan(catalog,args.pilot));results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(lambda c:inspect(c,catalog,args.fetch),cases):
            results.append(result)
            if len(results)%10==0 or result['status']!='pass':
                print(f"{len(results)}/{len(cases)} {result['key']}: {result['status']}",flush=True)
    report={'catalog':catalog,'cases':results,'summary':{s:sum(r['status']==s for r in results) for s in ['pass','missing-weapon','clipped','error']}}
    name='pilot.json' if args.pilot else 'audit.json'
    (OUT/name).write_text(json.dumps(report,indent=2)+'\n')
    if not args.pilot:
        (OUT/'manifest.js').write_text('window.CLASS_WEAPON_AUDIT='+json.dumps(report,separators=(',',':'))+';\n')
    print(json.dumps(report['summary']),flush=True)
    if any(r['status']!='pass' for r in results):raise SystemExit(1)

if __name__=='__main__':main()
