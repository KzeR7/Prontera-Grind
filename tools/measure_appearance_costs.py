#!/usr/bin/env python3
"""Measure asset costs and verify a lossless static-bundle proof (no game integration)."""
import argparse
import hashlib
import json
import struct
from pathlib import Path
from PIL import Image
import fetch_hair_colors as builder

ROOT=Path(__file__).resolve().parents[1]
STUDIO=ROOT/'Updates/hair-color-preview'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site',type=Path,required=True,help='Existing build_site.sh output to measure')
    args=parser.parse_args()
    if not (args.site/'index.html').is_file():parser.error('Build output missing')
    catalog=json.loads((STUDIO/'catalog.json').read_text())
    audit=json.loads((STUDIO/'audit.json').read_text())
    rows={r['key']:r for r in audit['cases']}
    assert all(r['status']=='pass' for r in rows.values())
    by_stance={}
    for stance in catalog['stances']:
        selected=[r for r in rows.values() if r['stance']==stance]
        routes=[]
        for i,cls in enumerate(catalog['classes']):
            for sex in ['m','f']:
                for weapon in cls['weapons']:
                    for j,direction in enumerate(catalog['directions']):
                        row=builder.case(catalog,cls,sex,weapon,catalog['hairs'][sex][i],(i+j)%9,direction,stance)
                        routes.append(rows[row['key']])
        route_bytes=sum((STUDIO/'art'/r['file']).stat().st_size for r in routes)
        by_stance[stance]={'auditedAnimations':len(selected),'auditedFrames':sum(r['frames'] for r in selected),
            'auditedAnimationBytes':sum((STUDIO/'art'/r['file']).stat().st_size for r in selected),
            'visibleWeaponSamples':sum(r['weaponVisibility']=='visible' for r in selected),
            'classRouteSamples':len(routes),'estimatedFullAnimationBytes':route_bytes*180,
            'estimatedFullDecodedRGBABytes':sum(r['frames']*320*280*4 for r in routes)*180}

    # One selected look with all three stances/directions; content bytes stay native.
    reference=[rows[f'4008-m-sword-2-0-{d}'+('' if s=='attack' else '-'+s)]
               for s in catalog['stances'] for d in catalog['directions']]
    payload=bytearray();index=[]
    for row in reference:
        data=(STUDIO/'art'/row['file']).read_bytes()
        index.append({'key':row['key'],'offset':len(payload),'length':len(data),'sha256':row['sha256'],
                      'frames':row['frames'],'durations':row['durations'],'stance':row['stance'],'direction':row['direction']})
        payload.extend(data)
    header=json.dumps({'schemaVersion':1,'width':320,'height':280,'entries':index},separators=(',',':')).encode()
    bundle=b'PGAP1\n'+struct.pack('>I',len(header))+header+payload
    proof=STUDIO/'measurements/lord-knight-m-head2-palette0.pgap';proof.parent.mkdir(exist_ok=True);proof.write_bytes(bundle)
    # Read back from disk, verify every embedded native PNG byte-for-byte.
    packed=proof.read_bytes();assert packed[:6]==b'PGAP1\n'
    header_size=struct.unpack('>I',packed[6:10])[0];decoded=json.loads(packed[10:10+header_size]);start=10+header_size
    for entry in decoded['entries']:
        data=packed[start+entry['offset']:start+entry['offset']+entry['length']]
        assert hashlib.sha256(data).hexdigest()==entry['sha256']
        assert data==(STUDIO/'art'/rows[entry['key']]['file']).read_bytes()

    current=[]
    source_dir=ROOT/'Updates/Sprite/Swordman'
    for path in sorted(source_dir.glob('lordknight male *.png')):
        with Image.open(path) as im:
            current.append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'width':im.width,'height':im.height,
                            'frames':im.n_frames,'decodedRGBABytes':im.width*im.height*im.n_frames*4})
    files=[p for p in args.site.rglob('*') if p.is_file()]
    baseline={'files':len(files),'bytes':sum(p.stat().st_size for p in files),'largestFileBytes':max(p.stat().st_size for p in files)}
    total_combos=sum(v['classRouteSamples'] for v in by_stance.values())*180
    look_bundles=len(catalog['classes'])*2*20*9
    report={'schemaVersion':1,'productionBaseline':baseline,'byStance':by_stance,
        'naiveFullCollection':{'animationFiles':total_combos,'withSeparateStills':total_combos*2,
          'estimatedAnimationBytes':sum(v['estimatedFullAnimationBytes'] for v in by_stance.values()),
          'estimatedDecodedRGBABytes':sum(v['estimatedFullDecodedRGBABytes'] for v in by_stance.values()),
          'method':'Each of 150 class/gender/weapon/direction samples per stance weighted by 180 hair/palette choices; estimate, not full download. No content deduplication.'},
        'plannedStaticPackaging':{'lookBundles':look_bundles,'thumbnailFiles':360,'manifestFilesBudget':1,
          'projectedTotalFiles':baseline['files']+look_bundles+360+1,'pagesFreeFileLimit':20000,
          'note':'One binary PNG bundle per class/gender/style/palette holding all selected stances/directions/weapons. Count estimate only; full collection not packed.'},
        'referenceLook':{'animations':len(reference),'frames':sum(r['frames'] for r in reference),
          'nativeAnimationBytes':len(payload),'bundleBytes':len(bundle),'bundleOverheadBytes':len(bundle)-len(payload),
          'decodedRGBABytes':sum(r['frames']*320*280*4 for r in reference),'bundleRoundTrip':'pass',
          'proofFile':str(proof.relative_to(ROOT)),'sha256':hashlib.sha256(bundle).hexdigest()},
        'currentLordKnightMale':{'files':current,'decodedRGBABytes':sum(r['decodedRGBABytes'] for r in current)},
        'canvasPixelsRatio':320*280/(200*200)}
    (STUDIO/'asset-costs.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
