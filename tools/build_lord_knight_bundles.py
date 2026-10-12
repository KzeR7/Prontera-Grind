#!/usr/bin/env python3
"""Build native Lord Knight appearance bundles; never touches game or original studio.

Pillow 11.3.0 is used to decode every frame. Downloads are optional, resumable,
and limited to two workers. Cache misses fail without --fetch.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
import struct
from pathlib import Path
from PIL import Image, ImageSequence
import fetch_class_weapons as native
import fetch_hair_colors as hair

ROOT = Path(__file__).resolve().parents[1]
STUDIO = ROOT / 'Updates/hair-color-preview'
OUT = ROOT / 'Updates/lord-knight-bundles'
MAGIC = b'PGAP1\n'
MAX_BYTES = 25 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect_png(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[24:26] != b'\x08\x06' or data[28] != 0:
        raise ValueError('Expected non-interlaced 8-bit RGBA PNG')
    bounds, durations, rgba = [], [], hashlib.sha256()
    with Image.open(io.BytesIO(data)) as im:
        if im.size != (320, 280) or not 2 <= im.n_frames <= 16:
            raise ValueError('Invalid native dimensions/frame count')
        for frame in ImageSequence.Iterator(im):
            pixels = frame.convert('RGBA')
            box = pixels.getbbox()
            if not box or not (0 < box[0] < box[2] < 320 and 0 < box[1] < box[3] < 280):
                raise ValueError('Empty or clipped frame')
            delay = frame.info.get('duration', 0)
            if not 0 < delay <= 10000:
                raise ValueError('Invalid native timing')
            bounds.append(list(box)); durations.append(delay); rgba.update(pixels.tobytes())
    return dict(frames=len(bounds), durations=durations, bounds=bounds, rgbaSha256=rgba.hexdigest())


def unpack(data):
    if len(data) > MAX_BYTES or data[:6] != MAGIC:
        raise ValueError('Invalid bundle size/signature')
    length = struct.unpack('>I', data[6:10])[0]
    header = json.loads(data[10:10+length]); payload = data[10+length:]
    if header['schemaVersion'] != 1 or len(header['entries']) != 9:
        raise ValueError('Invalid header')
    offset = 0
    for entry in header['entries']:
        if entry['offset'] != offset or entry['length'] <= 0:
            raise ValueError('Invalid payload range')
        png = payload[offset:offset+entry['length']]
        if sha(png) != entry['sha256']:
            raise ValueError('PNG checksum mismatch')
        measured = inspect_png(png)
        if any(entry[key] != value for key, value in measured.items()):
            raise ValueError('PNG metadata mismatch')
        offset += entry['length']
    if offset != len(payload):
        raise ValueError('Trailing/missing payload bytes')
    return header


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--check', action='store_true', help='Verify all committed bundles without network or writes')
    args = parser.parse_args()
    if args.fetch and args.check:
        parser.error('--fetch and --check are mutually exclusive')
    catalog_bytes = (STUDIO/'catalog.json').read_bytes()
    catalog = json.loads(catalog_bytes)
    cls = next(c for c in catalog['classes'] if c['name'] == 'Lord Knight')
    old = {r['key']: r for r in json.loads((STUDIO/'audit.json').read_text())['cases']}
    catalog_hash = sha(catalog_bytes)
    selections = [(sex, head, palette['id']) for sex in ['m', 'f']
                  for head in catalog['hairs'][sex] for palette in catalog['palettes'][sex]]
    manifest_path = OUT/'manifest.json'
    prior = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'looks': []}
    records = {r['id']: r for r in prior['looks']}
    if not args.check:
        (OUT/'bundles').mkdir(parents=True, exist_ok=True)
        native.CACHE.mkdir(parents=True, exist_ok=True)

    def build(selection):
        sex, head, palette = selection
        identity = f'4008-{sex}-sword-{head}-{palette}'
        appearance = dict(job=4008, sex=sex, head=head, palette=palette, weapon='sword',
                          headgear=[69, 3], garment=1, outfit=4008, shadow=True)
        record = records.get(identity)
        if record:
            data = (OUT/record['file']).read_bytes()
            if sha(data) != record['sha256'] or len(data) != record['bytes']:
                raise ValueError('Bundle checksum mismatch: '+identity)
            header = unpack(data)
            if header['appearance'] != appearance or header['catalogSha256'] != catalog_hash:
                raise ValueError('Bundle identity/catalog mismatch: '+identity)
            expected = {(s, d) for s in catalog['stances'] for d in catalog['directions']}
            if {(e['stance'], e['direction']) for e in header['entries']} != expected:
                raise ValueError('Incomplete coverage: '+identity)
            if (record['sex'], record['head'], record['palette']) != selection or record['id'] != identity:
                raise ValueError('Manifest identity mismatch: '+identity)
            if record['animations'] != 9 or record['frames'] != sum(e['frames'] for e in header['entries']):
                raise ValueError('Manifest frame summary mismatch: '+identity)
            for e in header['entries']:
                expected_case = hair.case(catalog, cls, sex, 'sword', head, palette, e['direction'], e['stance'])
                if e['key'] != expected_case['key'] or e['action'] != expected_case['params']['action'] or e['url'] != native.url(catalog, expected_case['params']):
                    raise ValueError('Native source route mismatch: '+identity)
            return record
        if args.check:
            raise ValueError('Missing appearance: '+identity)
        entries, payload = [], bytearray()
        for stance in catalog['stances']:
            for direction in catalog['directions']:
                case = hair.case(catalog, cls, sex, 'sword', head, palette, direction, stance)
                url = native.url(catalog, case['params'])
                saved = old.get(case['key'])
                if saved and saved['status'] == 'pass':
                    data = (STUDIO/'art'/saved['file']).read_bytes()
                    if sha(data) != saved['sha256'] or saved['url'] != url:
                        raise ValueError('Saved source identity mismatch: '+case['key'])
                    provenance = 'preserved-studio'
                else:
                    data = native.fetch(url, args.fetch)
                    provenance = 'renderer-cache'
                metadata = inspect_png(data)
                entries.append(dict(key=case['key'], stance=stance, direction=direction,
                    action=case['params']['action'], offset=len(payload), length=len(data),
                    sha256=sha(data), url=url, source=provenance, **metadata))
                payload.extend(data)
        header = dict(schemaVersion=1, width=320, height=280, anchor=[160, 200],
            catalogSha256=catalog_hash, appearance=appearance, entries=entries)
        encoded = json.dumps(header, separators=(',', ':')).encode()
        data = MAGIC + struct.pack('>I', len(encoded)) + encoded + payload
        if len(data) > MAX_BYTES:
            raise ValueError('Exceeds Cloudflare Pages per-file limit')
        name = 'bundles/'+identity+'-'+sha(data)[:16]+'.pgap'
        temp = OUT/(name+'.tmp'); temp.write_bytes(data); temp.replace(OUT/name)
        return dict(id=identity, sex=sex, head=head, palette=palette, file=name,
                    sha256=sha(data), bytes=len(data), animations=9,
                    frames=sum(e['frames'] for e in entries))

    def manifest():
        looks = [records[f'4008-{s}-sword-{h}-{p}'] for s, h, p in selections
                 if f'4008-{s}-sword-{h}-{p}' in records]
        result = dict(schemaVersion=1, catalogSha256=catalog_hash, className='Lord Knight',
            width=320, height=280, anchor=[160, 200], hairs=catalog['hairs'], palettes=catalog['palettes'],
            directions=list(catalog['directions']), stances=list(catalog['stances']),
            complete=len(looks)==360, expectedLooks=360, looks=looks,
            summary=dict(looks=len(looks), animations=len(looks)*9, frames=sum(r['frames'] for r in looks),
                bundleBytes=sum(r['bytes'] for r in looks), maxBundleBytes=max([r['bytes'] for r in looks] or [0])))
        temp = manifest_path.with_suffix('.tmp'); temp.write_text(json.dumps(result, indent=2)+'\n'); temp.replace(manifest_path)

    with ThreadPoolExecutor(max_workers=2) as pool:
        for count, record in enumerate(pool.map(build, selections), 1):
            records[record['id']] = record
            if not args.check:
                manifest()
            if count % 10 == 0 or count == 1:
                print(f'{count}/360 appearances verified', flush=True)
    if args.check:
        if (prior.get('catalogSha256') != catalog_hash or prior.get('hairs') != catalog['hairs']
                or prior.get('palettes') != catalog['palettes'] or prior.get('directions') != list(catalog['directions'])
                or prior.get('stances') != list(catalog['stances'])):
            raise ValueError('Manifest catalog/coverage mismatch')
        if not prior.get('complete') or len(prior['looks']) != 360:
            raise ValueError('Incomplete or duplicate manifest')
    print('PASS: 360 appearances / 3240 native animations', flush=True)


if __name__ == '__main__':
    main()
