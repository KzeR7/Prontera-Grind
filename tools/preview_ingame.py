#!/usr/bin/env python3
"""Render what the game will actually show for each camera azimuth.

Reproduces index.html's sprite maths offline (no browser needed):
    toCam  = atan2(cos(az), sin(az))
    rel    = (faceAng - toCam) mod 2pi
    column = round(rel / (pi/4)) mod 8          <- JS Math.round = floor(x+.5)

usage: python3 preview_ingame.py <atlas.png> <faceAng|auto> <out.png> [sex-note]
"""
import math
import sys
from PIL import Image

CELL_W, CELL_H, DIRS, ROWS = 64, 96, 8, 10
SKY = (138, 158, 190)
GROUND = (216, 205, 180)


def js_round(x):
    return math.floor(x + 0.5)


def view_dir(face_ang, az):
    to_cam = math.atan2(math.cos(az), math.sin(az))
    rel = face_ang - to_cam
    rel = ((rel % (2 * math.pi)) + 2 * math.pi) % (2 * math.pi)
    return js_round(rel / (math.pi / 4)) % 8


def render(atlas_path, face="auto", out="preview.png", rows=(0, 2, 6)):
    atlas = Image.open(atlas_path).convert('RGBA')
    scale = 3
    cw, ch = CELL_W * scale, CELL_H * scale
    pad = 8
    W = DIRS * (cw + pad) + pad
    H = len(rows) * (ch + pad + 14) + pad + 26
    img = Image.new('RGB', (W, H), SKY)
    # horizon-ish ground band for context
    for y in range(int(H * .62), H):
        for_x = None
        img.paste(GROUND, (0, y, W, y + 1))

    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    d.text((pad, 6), 'camera azimuth -> sprite column (what the player sees)', fill=(20, 20, 30))

    for ri, row in enumerate(rows):
        y = pad + 26 + ri * (ch + pad + 14)
        for i in range(DIRS):
            az = i * math.pi / 4
            fa = (-az + math.pi) if face == "auto" else float(face)
            col = view_dir(fa, az)
            cell = atlas.crop((col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H))
            cell = cell.resize((cw, ch), Image.NEAREST)
            x = pad + i * (cw + pad)
            img.paste(cell, (x, y), cell)
            d.rectangle([x, y, x + cw - 1, y + ch - 1], outline=(60, 60, 70))
            d.text((x + 4, y + ch + 2), 'az%d col%d' % (i, col), fill=(20, 20, 30))
    img.save(out)
    print('wrote', out, img.size)


if __name__ == '__main__':
    a = sys.argv[1]
    f = sys.argv[2] if len(sys.argv) > 2 else 'auto'
    o = sys.argv[3] if len(sys.argv) > 3 else 'preview.png'
    render(a, f, o)
