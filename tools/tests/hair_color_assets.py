#!/usr/bin/env python3
"""Independently decode cached sprites and measure actual native palette equivalence."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageSequence, ImageChops

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import fetch_hair_colors as build

directory=ROOT/'Updates/hair-color-preview'
catalog=json.loads((directory/'catalog.json').read_text())
audit=json.loads((directory/'audit.json').read_text())
rows={r['key']:r for r in audit['cases']}
expected={c['key'] for c in build.plan(catalog,'samples')}
assert expected <= set(rows), f'Missing sample cases: {expected-set(rows)}'
assert len(rows)==len(audit['cases'])
frame_count=0
for row in rows.values():
    assert row['status']=='pass',row['key']
    png=(directory/'art'/row['file']).read_bytes()
    assert png[24]==8 and png[25]==6 and png[28]==0, 'Current decoder needs 8-bit RGBA, no interlace'
    with Image.open(directory/'art'/row['file']) as im:
        assert im.size==(320,280)
        assert im.n_frames==row['frames']
        frames=[f.convert('RGBA') for f in ImageSequence.Iterator(im)]
        im.seek(0)
        delays=[round(f.info.get('duration',0)) for f in ImageSequence.Iterator(im)]
        assert delays==row['durations'] and (all(d>0 for d in delays) or len(frames)==1)
        assert hashlib.sha256(b''.join(f.tobytes() for f in frames)).hexdigest()==row['rgbaSha256']
        for f in frames:
            x0,y0,x1,y1=f.getbbox()
            assert 0<x0<x1<320 and 0<y0<y1<280,row['key']
        with Image.open(directory/'art'/(row['key']+'-still.png')) as still:
            assert still.convert('RGBA').tobytes()==frames[0].tobytes()
        frame_count+=len(frames)
    if row['stance']!='attack':
        assert row['comparison']=='baseline-at-rendered-frame-start'
        assert row['baselineFrames']==len(row['baselineDurations'])
        assert row['matchingTimeline']==(row['durations']==row['baselineDurations'])

equivalence=[]
for sex in ['m','f']:
    for hair in catalog['hairs'][sex]:
        hashes={}
        for palette in catalog['palettes'][sex]:
            row=rows[f"4008-{sex}-sword-{hair}-{palette['id']}-SE"]
            hashes.setdefault(row['rgbaSha256'],[]).append(palette['id'])
        assert len(hashes)>1,f'All palettes identical for {sex}/{hair}'
        equivalence.append({'sex':sex,'hair':hair,'distinctRenders':len(hashes),'equivalentPaletteGroups':list(hashes.values())})
stance_equivalence=[]
for stance in catalog['stances']:
    for sex in ['m','f']:
        for hair in catalog['hairs'][sex]:
            variants=[rows[f"4008-{sex}-sword-{hair}-{p['id']}-SE"+('' if stance=='attack' else '-'+stance)]['rgbaSha256'] for p in catalog['palettes'][sex]]
            assert len(set(variants))>1, (stance,sex,hair)
            stance_equivalence.append({'stance':stance,'sex':sex,'hair':hair,'distinctRenders':len(set(variants))})
metrics={'cachedLooks':len(rows),'decodedFrames':frame_count,'samplePlanLooks':len(expected),
         'selectableLooks':81000,'exhaustiveRenderAudit':len(rows)==81000,
         'byStance':{stance:{'looks':sum(r['stance']==stance for r in rows.values()),'frames':sum(r['frames'] for r in rows.values() if r['stance']==stance),'weaponVisible':sum(r['stance']==stance and r['weaponVisibility']=='visible' for r in rows.values())} for stance in catalog['stances']},
         'nativeTimelineDifferences':[r['key'] for r in rows.values() if r.get('matchingTimeline') is False],
         'paletteEquivalence':equivalence,'stancePaletteEquivalence':stance_equivalence}
(directory/'validation-summary.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(f"PASS: {len(rows)} looks / {frame_count} decoded frames; all {len(expected)} required samples; native color changes present for all 40 styles")
print('Distinct palette renders per style:',sorted(set(r['distinctRenders'] for r in equivalence)))
