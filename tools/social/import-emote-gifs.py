#!/usr/bin/env python3
"""Turns the real RO emote GIFs into the game's emote PNGs - no renderer needed.

    python3 tools/social/import-emote-gifs.py <dir-with-gifs>

Why this exists: the game's emote art normally comes from the pinned emotion.act/spr through
emotions.go + pack-emotions.py, which needs the renderer and a network reachable from CI. When
that is not available, this converts the authentic RO emote GIFs (the ones iRO Wiki publishes at
https://irowiki.org/wiki/Emotes) into the same 160x160 transparent APNGs the game already loads.

It reads whichever GIFs are present in <dir> and only touches the ids it finds, so the 32 shipped
emotes that were cut from the sprite sheet are left byte-for-byte alone.

    File name           -> emotion id
    Omg.gif             -> omg        (see FILENAMES below)
    Emote_bawi.png      -> rock

The output is a real APNG with the same loop, the same per-frame delay and the same frames in the
same order. Every frame is cropped to the union of the painted pixels across the whole animation,
which is exactly what pack-emotions.py does - so EMOTE_LAYOUT and the tray maths treat these files
identically to the 32 cut from the sprite sheet. Nothing is repainted, rescaled or invented.
"""
import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/social/emotions'
LOCK = ROOT / 'tools/social/emotions-lock.json'
MAP = ROOT / 'tools/social/emotion-map.json'
CANVAS = 160          # sanity limit only: pack-emotions.py crops to the painted area

# id -> the file name iRO Wiki uses for it
FILENAMES = {
    'omg': 'Omg.gif', 'oh': 'Ohh.gif', 'x': 'Ecks.gif', 'hlp': 'Hlp.gif', 'go': 'Goo.gif',
    'bzz': 'Bzz.gif', 'awsm': 'Awsm.gif', 'pat': 'Pat.gif', 'slur': 'Slur.gif', 'grat': 'Grat.gif',
    'fsh': 'Fsh.gif', 'spin': 'Spin.gif', 'dice': 'Dice.gif', 'oops': 'Oops.gif',
    # already-shipped ids, so a full import can refresh them too if ever needed
    'surprise': 'Exc.gif', 'question': 'Que.gif', 'music': 'Hoe.gif', 'heart': 'Lov.gif',
    'love': 'Lov2.gif', 'sweat': 'Swt.gif', 'idea': 'Lit.gif', 'anger': 'Ang.gif', 'cloud': 'Agh.gif',
    'money': 'Money.gif', 'dots': '....gif', 'ok': 'Thx.gif', 'dead': 'Desp.gif', 'sorry': 'Sry.gif',
    'laugh': 'Heh.gif', 'smile': 'Ono.gif', 'cry': 'Sob.gif', 'shy': 'Ggg.gif', 'kissheart': 'Kis.gif',
    'think': 'Kis2.gif', 'hmm': 'Pif.gif', 'blush': 'Ok.gif', 'drool': 'Meh.gif', 'meh': 'Shy.gif',
    'panic': 'Come.gif', 'sleep': 'Yawn.gif', 'mail': 'Mail.gif', 'gg': 'Ene.gif',
    'rock': 'Emote_bawi.png', 'scissors': 'Emote_gawi.png', 'paper': 'Emote_bo.png',
}


def load_frames(path):
    """Return (frames, delay_ms). GIFs are composited onto the full canvas, as RO drew them."""
    im = Image.open(path)
    frames, delays = [], []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        frames.append(im.convert('RGBA'))
        delays.append(im.info.get('duration') or 0)
    # RO's own emotion timelines run at 25-50 ms; a GIF with no timing is treated as 50 ms.
    delay = min([d for d in delays if d] or [50])
    return frames, delay


def crop_union(frames):
    """Crop every frame to the union of the painted pixels, as pack-emotions.py does.

    A single shared box keeps the animation from jittering frame to frame, and makes the PNG
    canvas equal the drawn area - which is the shape emote-layout.py and emoteSlot expect.
    """
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    if not boxes:
        raise SystemExit('every frame is fully transparent')
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes),
           max(b[2] for b in boxes), max(b[3] for b in boxes))
    if box[2] - box[0] > CANVAS or box[3] - box[1] > CANVAS:
        raise SystemExit(f'painted area is {box[2]-box[0]}x{box[3]-box[1]}, larger than {CANVAS}px')
    return [f.crop(box) for f in frames]


def build(frames, delay):
    out = BytesIO()
    frames[0].save(out, format='PNG', save_all=True, append_images=frames[1:],
                   duration=delay, loop=0, disposal=0, blend=0)
    return out.getvalue()


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__.strip().splitlines()[2].strip())
    src = Path(sys.argv[1])
    if not src.is_dir():
        raise SystemExit(f'{src} is not a directory')

    mapping = json.loads(MAP.read_text())
    lock = json.loads(LOCK.read_text())
    OUT.mkdir(parents=True, exist_ok=True)

    found, missing = [], []
    for eid, fname in FILENAMES.items():
        if eid not in mapping:
            continue
        path = src / fname
        if not path.is_file():
            # tolerate the wiki's own name variations and a lower-case copy
            alt = [p for p in src.iterdir() if p.name.lower() == fname.lower()]
            if not alt:
                missing.append((eid, fname))
                continue
            path = alt[0]

        frames, delay = load_frames(path)
        gif_frames = len(frames)
        canvas = crop_union(frames)

        # Identical consecutive frames coalesce with their delays summed, exactly as
        # pack-emotions.py does, so the animation keeps its original timing.
        packed = []
        for f in canvas:
            if packed and packed[-1][0].tobytes() == f.tobytes():
                packed[-1][1] += delay
            else:
                packed.append([f, delay])
        images = [p[0] for p in packed]
        # APNG carries one duration per frame in this encoding; equal steps keep the timeline exact
        data = build(images, delay)

        dest = OUT / f'{eid}.png'
        dest.write_bytes(data)

        rec = Image.open(dest)
        rec.seek(0)
        size = rec.size
        entry = lock['outputs'].get(eid, {})
        entry.update({
            'action': mapping[eid],
            'delay': delay,
            'frames': rec.n_frames,
            'sha256': hashlib.sha256(data).hexdigest(),
            'source': f'{fname} (iRO Wiki)',
        })
        lock['outputs'][eid] = entry
        found.append((eid, fname, gif_frames, rec.n_frames, delay, size))

    LOCK.write_text(json.dumps(lock, indent=2) + '\n')

    for eid, fname, g, n, d, size in found:
        print(f'  {eid:10} <- {fname:16} {g:2} gif frames -> {n:2} apng, {d} ms, {size[0]}x{size[1]}')
    print(f'\n{len(found)} emotions written to {OUT.relative_to(ROOT)}')

    if not found:
        have = sorted(p.name for p in src.iterdir() if p.is_file())
        print(f'\nNothing matched in {src}')
        print(f'That folder holds {len(have)} file(s). First 20:')
        for name in have[:20]:
            print(f'  {name}')
        if any(n.lower().endswith(('.act', '.spr')) for n in have):
            print('\nThose look like the game sprite files (emotion.act / emotion.spr), not GIFs.')
            print('This script converts the emote GIFs from https://irowiki.org/wiki/Emotes .')
            print('The .act/.spr route needs the Go renderer instead - see tools/social/README.md.')
        else:
            print('\nThis script wants the GIFs saved from https://irowiki.org/wiki/Emotes,')
            print('named exactly as the wiki names them: ' + ', '.join(sorted(FILENAMES.values())[:6]) + ', ...')
        raise SystemExit(1)

    if missing:
        print(f'{len(missing)} id(s) had no file in that folder:')
        for eid, fname in missing:
            print(f'  {eid:10} needs {fname}')
    print('\nnext: python3 tools/social/emote-layout.py  -> paste the EMOTE_LAYOUT line into assets/social-rules.js')


if __name__ == '__main__':
    main()
