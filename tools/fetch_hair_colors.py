#!/usr/bin/env python3
"""Cache and audit native hair/palette renders. No pixel recoloring or hand offsets.

Default sample: every selected hair/palette on Lord Knight plus all class/weapon/
gender/direction routes in idle/walk/attack. --mode full schedules 81,000 looks.
Responses are reused through fetch_class_weapons' URL-addressed cache.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import fetch_class_weapons as native
from PIL import ImageChops

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Updates/hair-color-preview'


def case(catalog, cls, sex, weapon, hair, palette, direction, stance='attack'):
    base = (cls.get('action') or cls['actions'][sex][weapon]) if stance=='attack' else catalog['stances'][stance]['baseAction']
    suffix = '' if stance=='attack' else '-'+stance
    result = dict(key=f"{cls['job']}-{sex}-{weapon}-{hair}-{palette}-{direction}{suffix}",
                **{'class': cls['name']}, job=cls['job'], sex=sex, weapon=weapon,
                hair=hair, palette=palette, direction=direction, stance=stance, params={
                    'job': cls['job'], 'gender': 'female' if sex == 'f' else 'male',
                    'head': hair, 'headPalette': palette, 'headgear': '69,3', 'garment': 1,
                    'weapon': catalog['weapons'][weapon], 'action': base + catalog['directions'][direction],
                    'enableShadow': 'true', 'canvas': catalog['canvas']})
    if stance=='idle':result['params']['headdir']='straight'
    return result


def plan(catalog, mode):
    cases = {}
    if mode == 'samples':
        knight = next(c for c in catalog['classes'] if c['name'] == 'Lord Knight')
        for sex in ['m', 'f']:
            for hair in catalog['hairs'][sex]:
                for palette in catalog['palettes'][sex]:
                    row = case(catalog, knight, sex, 'sword', hair, palette['id'], 'SE')
                    cases[row['key']] = row
        for i, cls in enumerate(catalog['classes']):
            for sex in ['m', 'f']:
                for weapon in cls['weapons']:
                    for j, direction in enumerate(catalog['directions']):
                        row = case(catalog, cls, sex, weapon, catalog['hairs'][sex][i], (i+j) % 9, direction)
                        cases[row['key']] = row
    else:
        for cls in catalog['classes']:
            for sex in ['m', 'f']:
                for weapon in cls['weapons']:
                    for hair in catalog['hairs'][sex]:
                        for palette in catalog['palettes'][sex]:
                            for direction in catalog['directions']:
                                row = case(catalog, cls, sex, weapon, hair, palette['id'], direction)
                                cases[row['key']] = row
    return [case(catalog, next(c for c in catalog['classes'] if c['name']==row['class']),
                 row['sex'],row['weapon'],row['hair'],row['palette'],row['direction'],stance)
            for row in cases.values() for stance in catalog['stances']]


def inspect(row, catalog, allow):
    if row['stance']=='attack':
        result = native.inspect(row, catalog, allow)
    else:
        # Ordinary idle/walk can stow the weapon. Keep the comparison evidence,
        # but do not mislabel native stowing as a failed weapon attachment.
        result={k:v for k,v in row.items() if k!='params'}
        result.update(url=native.url(catalog,row['params']),baselineUrl=native.url(catalog,{**row['params'],'weapon':0}))
        try:
            data=native.fetch(result['url'],allow);bare=native.fetch(result['baselineUrl'],allow)
            size,frames=native.frames(data);bare_size,baseline=native.frames(bare)
            if size!=(320,280) or size!=bare_size or not frames or not baseline:raise ValueError('Invalid frame coverage')
            if row['stance']=='walk' and len(frames)<2:raise ValueError('Walking must have multiple authored frames')
            differences=[];clipped=[];durations=[];elapsed=0
            baseline_delays=[d for _,d in baseline]
            if len(baseline)>1 and any(d<=0 for d in baseline_delays):raise ValueError('Invalid baseline timing')
            for i,(a,delay) in enumerate(frames):
                if len(frames)>1 and delay<=0:raise ValueError('Invalid native timing')
                # Some native stowed-weapon idle actions have 8 repeated frames
                # while weapon0 has 3. Compare by time; preserve both timelines.
                t=elapsed%sum(baseline_delays) if sum(baseline_delays) else 0
                for b,bdelay in baseline:
                    if t<bdelay or not bdelay:break
                    t-=bdelay
                elapsed+=delay
                box=a.getbbox()
                if box is None:raise ValueError('Empty frame')
                if box[0]<=0 or box[1]<=0 or box[2]>=320 or box[3]>=280:clipped.append(i)
                diff=ImageChops.difference(a,b)
                mask=diff.getchannel('R')
                for channel in ['G','B','A']:mask=ImageChops.lighter(mask,diff.getchannel(channel))
                differences.append(sum(n for v,n in enumerate(mask.histogram()) if v));durations.append(delay)
            file=row['key']+'.png';(OUT/'art'/file).write_bytes(data)
            frames[0][0].save(OUT/'art'/(row['key']+'-still.png'))
            result.update(file=file,sha256=hashlib.sha256(data).hexdigest(),baselineSha256=hashlib.sha256(bare).hexdigest(),
                          frames=len(frames),durations=durations,baselineFrames=len(baseline),baselineDurations=baseline_delays,
                          matchingTimeline=durations==baseline_delays,comparison='baseline-at-rendered-frame-start',
                          weaponPixels=differences,clippedFrames=clipped,status='clipped' if clipped else 'pass')
        except Exception as error:result.update(status='error',error=str(error))
    result['weaponVisibility']='visible' if any(result.get('weaponPixels',[])) else 'stowed-or-not-rendered'
    if result['status'] == 'pass':
        data = (OUT / 'art' / result['file']).read_bytes()
        _, frames = native.frames(data)
        result['rgbaSha256'] = hashlib.sha256(b''.join(f.tobytes() for f, _ in frames)).hexdigest()
        result['stillSha256'] = hashlib.sha256((OUT / 'art' / (row['key']+'-still.png')).read_bytes()).hexdigest()
        result['bounds'] = [f.getbbox() for f, _ in frames]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--mode', choices=['samples', 'full'], default='samples')
    for field in ['class', 'sex', 'hair', 'palette', 'direction', 'stance']:
        parser.add_argument('--'+field, dest=field, help='Optional exact filter (class name is case-sensitive)')
    args = parser.parse_args()
    catalog = json.loads((OUT/'catalog.json').read_text())
    cases = plan(catalog, args.mode)
    for field in ['class', 'sex', 'hair', 'palette', 'direction', 'stance']:
        value = getattr(args, field)
        if value is not None:
            cases = [c for c in cases if str(c[field]) == value]
    if not cases:
        parser.error('No cases match the filters')
    native.OUT = OUT
    native.CACHE.mkdir(parents=True, exist_ok=True)
    (OUT/'art').mkdir(parents=True, exist_ok=True)
    old = json.loads((OUT/'audit.json').read_text()) if (OUT/'audit.json').exists() else {'cases': []}
    merged = {r['key']: r for r in old['cases']}
    results = []
    selectable_count = len(plan(catalog,'full'))

    def checkpoint():
        rows = sorted(merged.values(), key=lambda r:r['key'])
        report = {'catalogSha256': hashlib.sha256((OUT/'catalog.json').read_bytes()).hexdigest(),
                  'selectableLooks': selectable_count, 'cases': rows,
                  'summary': {s: sum(r['status'] == s for r in rows) for s in ['pass', 'missing-weapon', 'clipped', 'error']}}
        for name, content in [('audit.json', json.dumps(report, indent=2)+'\n'),
                              ('manifest.js', 'window.HAIR_AUDIT='+json.dumps(report, separators=(',', ':'))+';\n')]:
            temp = OUT/(name+'.tmp'); temp.write_text(content); temp.replace(OUT/name)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(lambda row: inspect(row, catalog, args.fetch), cases):
            results.append(result); merged[result['key']] = result
            if len(results) % 10 == 0 or result['status'] != 'pass':
                print(f"{len(results)}/{len(cases)} {result['key']}: {result['status']}", flush=True)
                checkpoint()
    checkpoint()
    print(f"{sum(r['status']=='pass' for r in results)}/{len(results)} passed", flush=True)
    if any(r['status'] != 'pass' for r in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
