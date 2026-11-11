#!/usr/bin/env python3
"""haven-v383: the seven Fishing MVPs are CROPS of the owner's reference art.

v380 painted chibi stand-ins because those references arrived as opaque 128px drops. The owner
rejected the redraw ("why is the fish mvp self drawn? it supposes to be a crop of the images I
sent"), so this tool keeps the supplied pixels and only cleans up the framing:

  1. find the reference background by flood-filling inward from the borders (tolerant of the
     photo/sketch greys and the dark plates), so interior white bellies stay opaque;
  2. keep the largest subject - this is what isolates the main crab from the concept sheet's
     smaller sketches - plus any piece that overlaps its bounding box;
  3. bleed the supplied edge colours under the transparent fringe, feather the cut, trim to the
     subject, and square-pad with a small margin (no white photo-matte halo in the pond);
  4. upscale once to 512 with Lanczos and a light unsharp, so the large pond float keeps a native
     512px texture while the Index and catch cards only ever downsample it.

The untouched references live in tools/mvp-art-source/ (that folder is the source of
truth). Never repaint, recolour or substitute the art here.

    python3 tools/mvp_art_crop.py           # (re)write the seven PNGs
    python3 tools/mvp_art_crop.py --check   # exit 1 when the shipped files drift
"""
import hashlib
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'mvp-art-source')
OUT = os.path.join(ROOT, 'assets', 'social', 'fish')
SIZE = 512
MARGIN = 0.04  # fraction of the square kept clear around the subject

# Per-image tuning. tol = max channel distance that still counts as background; crop = optional
# (left, top, right, bottom) pre-cut in source pixels for sheets with several sketches.
SPECS = {
    'mvp_azure_drake':   {'tol': 26, 'shadow': (110, 242, 26)},
    'mvp_tide_drake':    {'tol': 26},
    'mvp_abyss_drake':   {'tol': 30, 'shadow': (150, 236, 16)},
    'mvp_iron_crab':     {'tol': 26, 'main_only': True, 'keep': (0, 0, 99, 128)},
    'mvp_crimson_shark': {'tol': 26},
    'mvp_gilded_shark':  {'tol': 34},
    'mvp_void_maw':      {'tol': 26, 'shadow': (150, 236, 16)},
}


def border_seeds(rgb, tol):
    """Distinct border colours: sheets often sit on a plate plus a white strip."""
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(np.float32)
    seeds = [np.median(border, axis=0)]
    for sample in border[::7]:
        if all(np.abs(sample - seed).max() > tol for seed in seeds):
            seeds.append(sample)
        if len(seeds) >= 3:
            break
    return seeds


def background_mask(rgb, tol):
    """Border-connected pixels close to ANY of the plate's border colours."""
    h, w, _ = rgb.shape
    near = np.zeros((h, w), dtype=bool)
    for seed in border_seeds(rgb, tol):
        near |= np.abs(rgb.astype(np.float32) - seed).max(axis=2) <= tol
    seen = np.zeros((h, w), dtype=bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        # Eight-way fill follows the supplied image's diagonal antialias pixels. Four-way fill
        # stranded one-pixel white islands around fins and claws, which became a visible photo-matte
        # halo after the crop was enlarged in the pond.
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1),
                       (1, 1), (1, -1), (-1, 1), (-1, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def components(mask):
    """4-connected foreground blobs, largest first. Returns [(area, (l,t,r,b))]."""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            queue = deque([(y, x)])
            seen[y, x] = True
            area = 0
            l = r = x
            t = b = y
            while queue:
                cy, cx = queue.popleft()
                area += 1
                l, r = min(l, cx), max(r, cx)
                t, b = min(t, cy), max(b, cy)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            out.append((area, (l, t, r + 1, b + 1)))
    out.sort(key=lambda item: -item[0])
    return out


def shadow_mask(rgb, band):
    """Near-neutral pixels in a luminance band: the drop shadow under a white-background drop."""
    lo, hi, chroma = band
    lum = rgb.astype(np.float32).mean(axis=2)
    spread = rgb.max(axis=2).astype(np.float32) - rgb.min(axis=2)
    return (spread <= chroma) & (lum >= lo) & (lum <= hi)


def isolate(mask, main_only=False):
    """Keep the main subject; drop the concept sheet's leftover smaller sketches."""
    blobs = components(mask)
    if not blobs:
        return mask
    main_area, main_box = blobs[0]
    if main_only:
        keep = np.zeros_like(mask)
        keep[main_box[1]:main_box[3], main_box[0]:main_box[2]] |= mask[main_box[1]:main_box[3], main_box[0]:main_box[2]]
        return keep
    keep = np.zeros_like(mask)
    for area, box in blobs:
        overlap = not (box[0] >= main_box[2] or box[2] <= main_box[0] or box[1] >= main_box[3] or box[3] <= main_box[1])
        if area >= main_area * 0.02 or overlap:
            keep[box[1]:box[3], box[0]:box[2]] |= mask[box[1]:box[3], box[0]:box[2]]
    return keep


def bleed_edge_colours(rgb, foreground, steps=4):
    """Extend real subject colours beneath a soft alpha edge instead of its white/grey matte.

    Opaque supplied pixels are never changed. Only pixels outside the hard mask receive the
    average colour of their nearest known neighbours, repeated far enough to cover the 0.7 px
    feather. This is alpha decontamination, not repainting the reference.
    """
    colours = rgb.copy()
    known = foreground.copy()
    for _ in range(steps):
        total = np.zeros_like(colours, dtype=np.float32)
        count = np.zeros(known.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            neighbour_known = np.roll(known, (dy, dx), axis=(0, 1))
            neighbour_colours = np.roll(colours, (dy, dx), axis=(0, 1))
            if dy == 1:
                neighbour_known[0, :] = False
            elif dy == -1:
                neighbour_known[-1, :] = False
            if dx == 1:
                neighbour_known[:, 0] = False
            elif dx == -1:
                neighbour_known[:, -1] = False
            total += neighbour_colours * neighbour_known[..., None]
            count += neighbour_known
        fill = (~known) & (count > 0)
        if not fill.any():
            break
        colours[fill] = np.rint(total[fill] / count[fill, None]).astype(np.uint8)
        known[fill] = True
    return colours


def crop_one(sp_id, spec):
    src_path = os.path.join(SRC, sp_id + '.png')
    img = Image.open(src_path).convert('RGB')
    if spec.get('crop'):
        img = img.crop(spec['crop'])
    rgb = np.array(img)
    bg = background_mask(rgb, spec['tol'])
    if spec.get('shadow'):
        bg |= shadow_mask(rgb, spec['shadow'])
    fg = isolate(~bg, spec.get('main_only', False))
    if spec.get('keep'):
        # Neighbouring sketches on the sheet: cut them AFTER the plate colours were sampled,
        # so a crop edge can never be mistaken for background.
        left, top, right, bottom = spec['keep']
        box = np.zeros_like(fg)
        box[top:bottom, left:right] = True
        fg &= box
    if not fg.any():
        raise SystemExit(sp_id + ': the background knockout removed everything')
    edge_rgb = bleed_edge_colours(rgb, fg)
    alpha = Image.fromarray(np.where(fg, 255, 0).astype(np.uint8), 'L')
    # Feather by a single source pixel so the 4x upscale does not show a hard stair edge. The RGB
    # underneath that feather has already been decontaminated, so it cannot reveal a white halo.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    rgba = Image.fromarray(np.dstack((edge_rgb, np.asarray(alpha))), 'RGBA')
    box = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        raise SystemExit(sp_id + ': no subject left after trimming')
    subject = rgba.crop(box)
    side = int(max(subject.width, subject.height) * (1 + MARGIN * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(subject, ((side - subject.width) // 2, (side - subject.height) // 2))
    out = canvas.resize((SIZE, SIZE), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=55, threshold=2))
    return out


def digest(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def indexed_output(rendered):
    """Keep the supplied low-resolution palette while bounding seven 512px runtime files."""
    quantize_api = getattr(Image, 'Quantize', Image)
    dither_api = getattr(Image, 'Dither', Image)
    return rendered.quantize(colors=256,
                             method=getattr(quantize_api, 'FASTOCTREE', 2),
                             dither=getattr(dither_api, 'FLOYDSTEINBERG', 1))


def main():
    check = '--check' in sys.argv
    drift = []
    for sp_id, spec in sorted(SPECS.items()):
        target = os.path.join(OUT, sp_id + '.png')
        rendered = crop_one(sp_id, spec)
        indexed = indexed_output(rendered)
        if check:
            # PNG bytes are not stable across Pillow versions, so compare the quantized pixels -
            # and allow a two-level rounding difference from a different resampler build.
            current = Image.open(target).convert('RGBA') if os.path.exists(target) else None
            expected = indexed.convert('RGBA')
            if current is None or current.size != expected.size:
                drift.append(sp_id)
            else:
                a = np.asarray(current, dtype=np.int16)
                b = np.asarray(expected, dtype=np.int16)
                if int(np.abs(a - b).max()) > 2:
                    drift.append(sp_id)
            continue
        # The subjects are 128px references; a 256-colour indexed PNG preserves that supplied
        # palette while keeping seven 512px runtime textures below the Social asset budget.
        # (True-colour 512px PNGs added about 1 MiB without adding source detail.)
        indexed.save(target, optimize=True)
        print('wrote', os.path.relpath(target, ROOT))
    if check:
        if drift:
            print('drifted:', ', '.join(drift))
            sys.exit(1)
        print('mvp art matches the reference crops')
    return 0


if __name__ == '__main__':
    sys.exit(main())
