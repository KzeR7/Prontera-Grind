#!/usr/bin/env python3
"""Composite the real per-field floor: shipped weights + that field's own tiles.

    node tools/maps/terrain-v2/sample_floor.js /tmp/floor.json
    python3 tools/maps/terrain-v2/render_floor.py --floor /tmp/floor.json [--tag before|after]

Unlike render_preview.py (which colours by slope with one shared palette), this uses
each field's actual assets/native-fields/v1/<map>/terrain.png crops — the four tiles
the game paints with — so the board shows the colours a player really sees.

Writes docs/proposals/terrain-v2/board-floor-<tag>.png
"""
import argparse, json, os, subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ASSETS = os.path.join(ROOT, 'assets/native-fields/v1')
OUT = os.path.join(ROOT, 'docs/proposals/terrain-v2')
LABEL = ['Prontera', 'Izlude', 'Geffen', 'Morocc', 'Payon', 'Comodo', 'Louyang', 'Amatsu', 'Niflheim', 'Abyss']


def tiles(name):
    """The four 256px crops, exactly as the module reads them out of terrain.png."""
    im = Image.open(os.path.join(ASSETS, name, 'terrain.png')).convert('RGB')
    return [np.asarray(im.crop((i * 256, 0, i * 256 + 256, 256))).astype(np.float32) / 255.0 for i in range(4)]


def tiled(tile, size, scale):
    """Mirror-tiled, like surface() does, so seams do not confuse the comparison."""
    h, w = tile.shape[:2]
    reps = int(np.ceil(size / (w * scale))) + 1
    big = np.zeros((reps * h, reps * w, 3), np.float32)
    for j in range(reps):
        for i in range(reps):
            t = tile
            if i % 2:
                t = t[:, ::-1]
            if j % 2:
                t = t[::-1]
            big[j * h:(j + 1) * h, i * w:(i + 1) * w] = t
    out = Image.fromarray((np.clip(big, 0, 1) * 255).astype(np.uint8)).resize((size * scale, size * scale), Image.BILINEAR)
    return np.asarray(out.crop((0, 0, size, size))).astype(np.float32) / 255.0


def hillshade(h, step):
    dy, dx = np.gradient(h, step)
    nx, ny, nz = -dx, -dy, np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    lx, ly, lz = -0.5, -0.55, 0.67
    return np.clip((nx * lx + ny * ly + nz * lz) / n, 0, 1)


def compose(entry, size=380):
    N = int(round(np.sqrt(len(entry['height']))))
    step = 90.0 / (N - 1)
    h = np.array(entry['height'], np.float32).reshape(N, N)
    grass = np.array(entry['grass'], np.float32).reshape(N, N)[..., None]
    dirt = np.array(entry['dirt'], np.float32).reshape(N, N)[..., None]
    rock = np.array(entry['rock'], np.float32).reshape(N, N)[..., None]
    beach = np.array(entry['beach'], np.float32).reshape(N, N)[..., None]
    trail = np.array(entry['trail'], np.float32).reshape(N, N)[..., None]

    base, patch, road, cliff = tiles(entry['name'])
    scale = 2
    B = tiled(base, size, scale)
    P = tiled(patch, size, scale)
    R = tiled(road, size, scale)
    C = tiled(cliff, size, scale)

    def up(a):
        return np.asarray(Image.fromarray((a[..., 0] * 255).astype(np.uint8)).resize((size, size), Image.BILINEAR))[..., None].astype(np.float32) / 255.0

    g, d, r, b, t = up(grass), up(dirt), up(rock), up(beach), up(trail)
    # base + material blends, in the same order the module draws them
    col = B * (1 - d * 0.85) + P * (d * 0.85)
    col = col * (1 - r * 0.8) + C * (r * 0.8)
    col = col * (1 - b * 0.5) + P * (b * 0.5)
    col = col * (1 - t * 0.75) + R * (t * 0.75)
    sh = np.asarray(Image.fromarray((hillshade(h, step) * 255).astype(np.uint8)).resize((size, size), Image.BILINEAR))[..., None].astype(np.float32) / 255.0
    col = np.clip(col * (0.52 + 0.78 * sh), 0, 1)

    w = entry.get('water')
    if w:
        X, Z = np.meshgrid(np.linspace(-45, 45, N), np.linspace(-45, 45, N))
        ang = np.arctan2((Z - w['z']) / w['rz'], (X - w['x']) / w['rx'])
        rr = np.hypot((X - w['x']) / w['rx'], (Z - w['z']) / w['rz']) / (1 + .09 * np.sin(ang * 3) + .05 * np.cos(ang * 5))
        below = (h < w['level']) & (rr <= 1.32)
        if below.any():
            mask = np.asarray(Image.fromarray((below * 255).astype(np.uint8)).resize((size, size), Image.NEAREST)) > 127
            col[mask] = np.array([0.24, 0.43, 0.50]) * (0.7 + 0.5 * sh)[mask]
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--floor', default='/tmp/floor.json')
    ap.add_argument('--tag', default='before')
    a = ap.parse_args()
    if not os.path.exists(a.floor):
        subprocess.run(['node', os.path.join(ROOT, 'tools/maps/terrain-v2/sample_floor.js'), a.floor], check=True)
    d = json.load(open(a.floor))
    W = 380
    im = Image.new('RGB', (W * 5, W * 2 + 30), (16, 17, 19))
    dr = ImageDraw.Draw(im)
    dr.text((8, 9), 'REAL FLOOR - each field composed from its OWN four terrain tiles + shipped weights (no shared palette)', fill=(235, 235, 235))
    for m, entry in enumerate(d['maps']):
        im.paste(compose(entry), ((m % 5) * W, 26 + (m // 5) * W))
        dr.text(((m % 5) * W + 6, 26 + (m // 5) * W + 4), LABEL[m], fill=(255, 255, 255))
    p = os.path.join(OUT, 'board-floor-%s.png' % a.tag)
    im.save(p)
    print('wrote', p)


if __name__ == '__main__':
    main()
