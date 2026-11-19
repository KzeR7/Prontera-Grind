#!/usr/bin/env python3
"""Cut transparent DigiPet and fishing title marks from the owner's sheets.

The complete source sheets and exact one-based cell/rectangle assignments live in
``tools/social-title-icons/``. Only the 56 current title marks ship to the game.
Use --check to verify source hashes, the deterministic cutouts and the JS registry.
"""
import argparse
import hashlib
import json
import re
from collections import deque
from pathlib import Path
from statistics import median

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/social-title-icons/supplied-2026-11-19'
MAP = ROOT / 'tools/social-title-icons/source-map.json'
OUT = ROOT / 'assets/social-title-icons'
REGISTRY = ROOT / 'assets/social-title-art.js'
ART_VERSION = '440'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pixel_data(image):
    # Pillow 13 renamed getdata; older supported versions still use it.
    return image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata()


def fill_outside(barrier):
    """Return a filled silhouette, with only edge-connected background removed."""
    width, height = barrier.size
    pixels = barrier.load()
    outside = bytearray(width * height)
    queue = deque()

    def seed(x, y):
        n = y * width + x
        if not pixels[x, y] and not outside[n]:
            outside[n] = 1
            queue.append((x, y))

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(width - 1, y)
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height:
                seed(nx, ny)
    mask = Image.new('L', barrier.size)
    mask.putdata([0 if value else 255 for value in outside])
    return mask


def digi_cutout(crop):
    """Use the supplied gold rim as a boundary; preserve the emblem's RGB pixels."""
    boundary = Image.new('L', crop.size)
    boundary.putdata([255 if r > 60 and r - b > 20 and g - b > 10 else 0
                      for r, g, b in pixel_data(crop)])
    # Connect small antialiased gaps in the rim before filling its interior. A
    # one-pixel feather retains the source's edge rather than replacing the art.
    boundary = boundary.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    alpha = fill_outside(boundary).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.35))
    result = crop.convert('RGBA')
    result.putalpha(alpha)
    return result


def fishing_cutout(crop):
    """Remove the light paper matte, including holes inside the monochrome marks."""
    pixels = list(pixel_data(crop))
    if any(max(rgb) - min(rgb) > 6 for rgb in pixels):
        raise ValueError('fishing source is no longer monochrome; review its cutout')
    light = [sum(rgb) / 3 for rgb in pixels if min(rgb) > 195]
    if not light:
        raise ValueError('fishing crop has no light background to remove')
    background = median(light)
    cutoff = background - 9  # discard small variations in the paper background
    if cutoff <= 190:
        raise ValueError('fishing background is too dark for the known matte')
    result = Image.new('RGBA', crop.size)
    output = []
    for r, g, b in pixels:
        value = (r + g + b) / 3
        if value <= 5:  # keep the actual black core pixels byte-for-byte
            output.append((r, g, b, 255))
        else:
            alpha = max(0, min(255, round((cutoff - value) * 255 / cutoff)))
            # Grey edge pixels are black mixed with paper; decontaminate the
            # light matte so the original black mark works on any background.
            output.append((0, 0, 0, alpha))
    result.putdata(output)
    return result


def check_alpha(image, name):
    alpha = image.getchannel('A')
    lo, hi = alpha.getextrema()
    width, height = image.size
    if lo != 0 or hi != 255 or any(alpha.getpixel(p) for p in
                                   ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))):
        raise ValueError(f'cutout must contain clear corners and an opaque mark: {name}')


def same_visible_pixels(expected, actual):
    """Lossless WebP may discard RGB beneath alpha=0; visible pixels must match."""
    if expected.size != actual.size:
        return False
    for wanted, found in zip(pixel_data(expected), pixel_data(actual)):
        if wanted[3] != found[3] or (wanted[3] and wanted[:3] != found[:3]):
            return False
    return True


def main(check=False):
    manifest = json.loads(MAP.read_text())
    if manifest.get('version') != 1:
        raise ValueError('unknown source-map version')
    sheets = {}
    for source in manifest['sources']:
        data = (SOURCE / source['file']).read_bytes()
        if len(data) != source['bytes'] or sha(data) != source['sha256']:
            raise ValueError(f"source mismatch: {source['file']}")
        image = Image.open(SOURCE / source['file']).convert('RGB')
        if list(image.size) != source['size'] or source['sheet'] in sheets:
            raise ValueError(f"invalid source dimensions or duplicate sheet: {source['file']}")
        sheets[source['sheet']] = image

    if not check:
        OUT.mkdir(parents=True, exist_ok=True)
    result, cells, filenames = {}, set(), set()
    for family in ('digi', 'fishing'):
        result[family] = {}
        for title_id, entry in manifest[family].items():
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', title_id):
                raise ValueError(f'invalid title ID: {title_id}')
            sheet, row, col = entry['sheet'], entry['row'], entry['column']
            cell = (sheet, row, col)
            if cell in cells or sheet not in sheets or (family == 'digi') != (sheet == 1):
                raise ValueError(f'duplicate or wrong-family source cell: {family}/{title_id}')
            cells.add(cell)
            x1, y1, x2, y2 = entry['box']
            width, height = sheets[sheet].size
            if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
                raise ValueError(f'crop outside source: {family}/{title_id}')
            filename = f'{family}-{title_id}.webp'
            filenames.add(filename)
            path = OUT / filename
            crop = sheets[sheet].crop((x1, y1, x2, y2))
            pixels = digi_cutout(crop) if family == 'digi' else fishing_cutout(crop)
            check_alpha(pixels, filename)
            if check:
                if not path.is_file() or not same_visible_pixels(pixels, Image.open(path).convert('RGBA')):
                    raise ValueError(f'missing or changed transparent cutout: {path}')
            else:
                pixels.save(path, format='WEBP', lossless=True, method=6)
            result[family][title_id] = 'assets/social-title-icons/' + filename

    # Paths in ART stay bare for the publish/staging whitelists. The URL query
    # invalidates older opaque crops in browser and CDN caches without new files.
    registry = ("/* Transparent cutouts from the supplied Social Hub title sheets. Generated; see tools/social-title-icons/. */\n"
                "(function(root){'use strict';const ART=" + json.dumps(result, separators=(',', ':'), ensure_ascii=False) + ";\n"
                "function url(kind,id){return Object.prototype.hasOwnProperty.call(ART,kind)&&Object.prototype.hasOwnProperty.call(ART[kind],id)?ART[kind][id]+'?v=" + ART_VERSION + "':''}\n"
                "function icon(kind,id,eager=false){const src=url(kind,id);return src?`<img class=\"social-title-symbol social-title-symbol--${kind}\" src=\"${src}\" alt=\"\" loading=\"${eager?'eager':'lazy'}\" decoding=\"async\" draggable=\"false\">`:''}\n"
                "const api={ART,url,icon};root.PGSocialTitleArt=api;if(typeof module==='object'&&module.exports)module.exports=api;\n"
                "})(typeof globalThis==='object'?globalThis:this);\n")
    if check:
        if REGISTRY.read_text() != registry:
            raise ValueError('social title art registry does not match source map')
        if {p.name for p in OUT.glob('*.webp')} != filenames:
            raise ValueError('social title art output contains missing or stale crops')
    else:
        REGISTRY.write_text(registry)
    print(f"{'Checked' if check else 'Built'} {len(result['digi'])} DigiPet and {len(result['fishing'])} fishing transparent title icons.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    main(parser.parse_args().check)
