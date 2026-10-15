"""Recover unmodified native APNG exports; requires Pillow for bounds/timing audit."""
import concurrent.futures, hashlib, io, json, pathlib, urllib.request
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/mobs/v1'
IDS = [1702,1705,1700,1706,1707,1708,1836,1837,1833,1831,1366,1832]
BASE = 'https://assets.latam-tools.com.br/image'
def recover(pair):
    mob, action = pair
    url = f'{BASE}?job={mob}&action={action}&canvas=512x512%2B256%2B400'
    path = OUT / f'{mob}-{action}.png'
    data = path.read_bytes() if path.exists() else urllib.request.urlopen(url, timeout=90).read()
    image = Image.open(io.BytesIO(data))
    assert image.size == (512,512), (mob,action,image.size)
    frames=[]
    for i in range(image.n_frames):
        image.seek(i)
        frame = image.convert('RGBA'); bounds = frame.getbbox()
        assert bounds and min(bounds[:2]) > 0 and max(bounds[2:]) < 512, (mob,action,i,bounds)
        frames.append({'duration':image.info.get('duration',0), 'bounds':bounds,
                       'pixelSha256':hashlib.sha256(frame.tobytes()).hexdigest()})
    assert all(f['duration'] > 0 for f in frames) or len(frames)==1
    path.write_bytes(data)
    return path.name, {'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'frames':frames}
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        records=dict(pool.map(recover,[(m,a) for m in IDS for a in range(24)]))
    manifest={'version':1,'source':BASE,'rendererReference':'adsonpleal/ragassets@4de4fa747431979d35c747d7edd549a872efd9e1',
              'canvas':[512,512],'anchor':[256,400],'actions':{'idle':0,'walk':8,'attack':16},'assets':records}
    (ROOT/'tools/native-mobs/source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    heights={}
    for mob in IDS:
        heights[str(mob)]=max(f['bounds'][3]-f['bounds'][1] for name,r in records.items() if name.startswith(str(mob)+'-') for f in r['frames'])
        image=Image.open(OUT/f'{mob}-0.png').convert('RGBA')
        image.crop(image.getbbox()).save(OUT/f'thumb-{mob}.png')
    (ROOT/'assets/native-mob-heights.js').write_text('/* Maximum native frame extents; generated from tools/native-mobs/source-manifest.json. */\nwindow.PGNativeMobHeights=Object.freeze('+json.dumps(heights,sort_keys=True)+');\n')
    print(f'Checked {len(records)} native exports, {sum(r["bytes"] for r in records.values())} bytes; original pixels and APNG timing retained.')
if __name__=='__main__': main()
