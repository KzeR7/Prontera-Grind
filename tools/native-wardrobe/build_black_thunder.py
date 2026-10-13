#!/usr/bin/env python3
"""Render the pinned Black Thunder STR, retaining its native 60 FPS/90-frame loop.

Only this resource's rectangular, untinted source-alpha quads are supported.
The STR's type-1 keys are per-frame deltas, not target values. Texture selection,
1024-unit rotation and the 320px effect origin follow roBrowser's STR format.
No sprite artwork, palette or manual attachment offsets are introduced.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

from PIL import Image

HERE = Path(__file__).resolve().parent


def read_str(path):
    data = path.read_bytes()
    assert data[:4] == b'STRM'
    version, fps, length, count = struct.unpack_from('<IIII', data, 4)
    assert version == 148 and fps == 60 and length == 90 and count == 7
    offset = 36
    layers = []
    for _ in range(count):
        textures = []
        n, = struct.unpack_from('<I', data, offset)
        offset += 4
        for _ in range(n):
            textures.append(data[offset:offset + 128].split(b'\0')[0].decode('ascii').lower())
            offset += 128
        n, = struct.unpack_from('<I', data, offset)
        offset += 4
        keys = []
        for _ in range(n):
            v = struct.unpack_from('<iI2f8f8ffIff4fIII', data, offset)
            offset += 124
            keys.append(dict(frame=v[0], type=v[1], pos=v[2:4], uv=v[4:12],
                             xy=v[12:20], texture=v[20], mode=v[21], step=v[22],
                             angle=v[23], color=v[24:28], src=v[28], dst=v[29]))
        layers.append(dict(textures=textures, keys=keys))
    assert offset == len(data)
    return fps, length, layers


def layer_at(layer, frame):
    source = delta = None
    source_index = delta_index = -1
    for index, key in enumerate(layer['keys']):
        if key['frame'] <= frame:
            if key['type'] == 0:
                source, source_index = key, index
            elif key['type'] == 1:
                delta, delta_index = key, index
    if source is None:
        return None
    last_source = max(k['frame'] for k in layer['keys'] if k['type'] == 0)
    morph = delta is not None and delta_index == source_index + 1 and delta['frame'] == source['frame']
    if not morph and delta is not None and last_source <= source['frame']:
        return None
    t = frame - source['frame'] if morph else 0
    value = dict(source)
    for field in ['pos', 'uv', 'xy', 'color']:
        value[field] = [v + (delta[field][i] * t if morph else 0)
                        for i, v in enumerate(source[field])]
    value['angle'] += delta['angle'] * t if morph else 0
    # Hidden stop keys may contain infinite texture-step values; their alpha is
    # zero. Do not evaluate 0 * infinity or turn an invisible layer into artwork.
    if value['color'][3] <= 0:
        return None
    if morph:
        texture = source['texture'] + delta['step'] * t
        assert math.isfinite(texture)
        assert delta['mode'] in [2, 3]
        value['texture'] = (min(texture, len(layer['textures']) - 1)
                            if delta['mode'] == 2 else texture % len(layer['textures']))
    return value


def render_frame(layers, textures, frame):
    result = Image.new('RGBA', (320, 280))
    for layer in layers:
        value = layer_at(layer, frame)
        if value is None:
            continue
        assert (value['src'], value['dst']) == (5, 6)
        assert value['color'][:3] == [255, 255, 255]
        assert value['uv'] == [0, 0, 1, 1, 0, 0, 1, 1]
        xy = value['xy']
        assert xy[0] == xy[3] and xy[1] == xy[2] and xy[4] == xy[5] and xy[6] == xy[7]
        image = textures[layer['textures'][int(value['texture'])]]
        # Map the original texture quad to screen pixels. The RO origin is the
        # character's feet (160,200); STR coordinates are relative to (320,320).
        sx = (xy[1] - xy[0]) / image.width
        sy = (xy[7] - xy[4]) / image.height
        if sx == 0 or sy == 0:
            continue
        angle = value['angle'] * math.tau / 1024
        c, s = math.cos(angle), math.sin(angle)
        tx = 160 + value['pos'][0] - 320 + c * xy[0] - s * xy[4]
        ty = 200 + value['pos'][1] - 320 + s * xy[0] + c * xy[4]
        inverse = (c / sx, s / sx, -(c * tx + s * ty) / sx,
                   -s / sy, c / sy, (s * tx - c * ty) / sy)
        transformed = image.transform(result.size, Image.Transform.AFFINE, inverse,
                                      resample=Image.Resampling.BILINEAR)
        alpha = max(0, min(255, value['color'][3])) / 255
        if alpha < 1:
            transformed.putalpha(transformed.getchannel('A').point(lambda a: round(a * alpha)))
        result.alpha_composite(transformed)
    return result


def build(native, output, catalog):
    manifest = json.loads((HERE / 'requested-items-source-manifest.json').read_text())
    for record in manifest['files']:
        data = (native / record['path']).read_bytes()
        assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256'], record['path']
    folder = native / 'data/texture/effect/efst_black_thunder'
    fps, length, layers = read_str(folder / 'ros2023_f.str')
    textures = {p.name.lower(): Image.open(p).convert('RGBA') for p in folder.glob('*.tga')}
    frames = []
    images = {}
    for frame in range(length):
        image = render_frame(layers, textures, frame)
        bounds = image.getbbox()
        if bounds is None:
            frames.append([])
            continue
        x, y, right, bottom = bounds
        assert 0 < x < right < 320 and 0 < y < bottom < 280
        crop = image.crop(bounds)
        digest = hashlib.sha256(f'{crop.width}x{crop.height}:'.encode() + crop.tobytes()).hexdigest()
        images[digest] = crop
        # Pinned renderer uses z=35 for the effect pass, scaled by 1000.
        frames.append([dict(image=digest, x=x, y=y, z=35000, slot='blackThunder')])
    actions = {stance + str(d): dict(delay=1000 / fps, frames=frames)
               for stance in ['idle', 'walk', 'attack'] for d in range(8)}
    for job in json.loads(catalog.read_text())['classes'].values():
        destination = output / str(job)
        (destination / 'images').mkdir(parents=True, exist_ok=True)
        for digest, image in images.items():
            image.save(destination / 'images' / (digest + '.png'))
        for sex in ['m', 'f']:
            (destination / f'blackThunder-{sex}.json').write_text(json.dumps(actions))
    print(json.dumps(dict(frames=length, fps=fps, distinctImages=len(images),
                         atlasPixelLowerBound=sum(im.width * im.height for im in images.values()))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('catalog', type=Path)
    args = parser.parse_args()
    build(args.native, args.output, args.catalog)
