"""Verify every shipped native APNG against the recorded source, including playback pixels."""
import hashlib, json, pathlib, re
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((root/'tools/native-mobs/source-manifest.json').read_text())
assert len(manifest['assets'])==18*24
heights={}
for name,record in manifest['assets'].items():
    path=root/'assets/mobs/v1'/name
    data=path.read_bytes()
    assert len(data)==record['bytes'] and hashlib.sha256(data).hexdigest()==record['sha256'],name
    image=Image.open(path)
    assert image.size==tuple(manifest['canvas']) and image.n_frames==len(record['frames']),name
    for i,frame in enumerate(record['frames']):
        image.seek(i);rgba=image.convert('RGBA')
        assert list(rgba.getbbox())==frame['bounds'],(name,i,'bounds')
        assert image.info.get('duration',0)==frame['duration'],(name,i,'timing')
        assert hashlib.sha256(rgba.tobytes()).hexdigest()==frame['pixelSha256'],(name,i,'pixels')
        mob=name.split('-')[0];heights[mob]=max(heights.get(mob,0),frame['bounds'][3]-frame['bounds'][1])
for mob in heights:
    image=Image.open(root/f'assets/mobs/v1/{mob}-0.png').convert('RGBA')
    poster=Image.open(root/f'assets/mobs/v1/thumb-{mob}.png').convert('RGBA')
    assert poster.tobytes()==image.crop(image.getbbox()).tobytes(),(mob,'poster pixels')
js=(root/'assets/native-mob-heights.js').read_text()
assert json.loads(js.split('Object.freeze(')[1].split(');')[0])==heights
sizes=json.loads((root/'tools/native-mobs/size-reference.json').read_text())['sizes']
code=(root/'index.html').read_text().split('const MOB_SIZE_BY_ID={')[1].split('};')[0]
runtime_sizes=dict(re.findall(r"(\d+):'(Small|Medium|Large)'",code))
assert all(runtime_sizes[mob]==size for mob,size in sizes.items())
print('PASS: 432 native APNG exports: source hashes, frames, exact pixels, placement, delays, 18 posters and figure extents.')
