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

# Some saves come from the client's own sprites folder, where the dice is split into its six
# faces. Accept either name; the alternatives are tried in order.
ALIASES = {
    'dice': ['Dice.gif', 'dice1.gif', 'dice.gif'],
    'x': ['Ecks.gif', 'X.gif', 'ecks.gif'],
}



def load_frames(path):
    """Return (frames, delays_ms). GIFs are composited onto the full canvas, as RO drew them.

    The per-frame delays are kept, not flattened. An RO emotion is not a uniform loop: Omg holds
    its 13th frame for 1500 ms so the shout is readable, and Spin holds its last frame for 1000 ms.
    Reducing those to the shortest delay would make the emote flash past its own punchline.

    A GIF keeps its delays as centiseconds, so 25 ms is not representable and Pillow reports the
    stored value (many wiki rips run at 50 ms). Whatever is stored is what the client played.
    """
    im = Image.open(path)
    frames, delays = [], []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        frames.append(im.convert('RGBA'))
        delays.append(im.info.get('duration') or 0)
    # A wholly untimed GIF is treated as 50 ms, which is the RO emotion base tick.
    if not any(delays):
        delays = [50] * len(frames)
    return frames, delays


def clean_frames(frames):
    """Remove a solid background the way the client would, using a flood fill from the border.

    RO draws these emotes straight onto the sprite sheet, so the shipped PNGs are transparent. A GIF
    saved from a wiki page can arrive flattened onto a solid colour, which would draw a box over the
    character.

    Removing "every pixel of the background colour" would be wrong - it would punch holes in white
    parts of the art (a white sign, the whites of eyes). So only the background *region* is removed:
    a 4-connected flood fill inward from the border. Art that is already transparent, or whose
    border is mostly artwork, is left untouched.
    """
    from collections import deque, Counter

    clean = [f.convert('RGBA') for f in frames]
    if any(f.getchannel('A').getextrema()[0] < 255 for f in clean):
        return clean, None                          # already has transparency

    # The likely background is the most common colour on the border of the first few frames.
    votes = Counter()
    for f in clean[:min(len(clean), 6)]:
        w, h = f.size
        for x in range(w):
            votes[f.getpixel((x, 0))[:3]] += 1; votes[f.getpixel((x, h - 1))[:3]] += 1
        for y in range(h):
            votes[f.getpixel((0, y))[:3]] += 1; votes[f.getpixel((w - 1, y))[:3]] += 1
    key, count = votes.most_common(1)[0]
    edge = sum(votes.values())
    if count < edge * 0.8:
        return clean, None                          # border is artwork, not a flat background

    out, removed_any = [], False
    for f in clean:
        w, h = f.size
        px = f.load()
        seen = bytearray(w * h)
        queue = deque()
        for x in range(w):
            for y in (0, h - 1):
                if px[x, y][:3] == key:
                    queue.append((x, y)); seen[y * w + x] = 1
        for y in range(h):
            for x in (0, w - 1):
                if px[x, y][:3] == key and not seen[y * w + x]:
                    queue.append((x, y)); seen[y * w + x] = 1
        while queue:
            x, y = queue.popleft()
            px[x, y] = (0, 0, 0, 0)
            removed_any = True
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][:3] == key:
                    seen[ny * w + nx] = 1
                    queue.append((nx, ny))
        out.append(f)

    if not removed_any:
        return clean, None
    if all(f.getbbox() is None for f in out):
        return clean, None                          # would have erased everything - leave it alone
    return out, key


def crop_union(frames):
    """Crop every frame to the union of the painted pixels, as pack-emotions.py does.

    A single shared box keeps the animation from jittering frame to frame, and makes the PNG
    canvas equal the drawn area - which is the shape emote-layout.py and emoteSlot expect.
    """
    box = measure(frames)
    if box[2] - box[0] > CANVAS or box[3] - box[1] > CANVAS:
        raise SystemExit(f'painted area is {box[2]-box[0]}x{box[3]-box[1]}, larger than {CANVAS}px')
    return [f.crop(box) for f in frames]


def build(frames, delays):
    """Write an APNG carrying the real per-frame delays, the way pack-emotions.py does.

    pack-emotions.py puts one integer `delay` per emotion in the lock and encodes a longer hold as
    the same frame repeated; APNG's own per-frame duration can carry the hold directly, but the
    lock format - and the game reading it - is built around a base delay plus repeats. So the
    delays are reduced to a base tick and a repeat count, and the repeats are emitted as real
    frames. The animation then plays exactly as the GIF did, and stays inside the shape the rest
    of the tooling (and the lock file) already understands.
    """
    # A GIF may store 0 ms on a frame it wants shown instantly (Grat.gif does). A zero-length
    # frame is still a frame, so it takes the base tick rather than dividing by zero.
    real = [d for d in delays if d > 0]
    base = min(real) if real else 50
    timeline, times = [], []
    for frame, d in zip(frames, delays):
        n = max(1, int(round((d or base) / base)))
        timeline.extend([frame] * n)
        times.extend([d or base] * n)

    # The wiki rips end with a BLANK frame held a full second (pat 990 ms, spin 1000 ms). Played as
    # drawn, the emote disappears and leaves an empty speech bubble hanging over the character. The
    # sprite-cut art this game already ships ends on a blank too - but for one 50 ms tick, which is
    # a clean vanish. A held blank is the tail of the GIF's exit fade, not part of the emotion, so
    # it is trimmed to that single tick. Only the tail is touched: a blank in the middle is a
    # deliberate beat and is left alone.
    blank = [i for i, f in enumerate(timeline) if f.getbbox() is None]
    if blank and blank[-1] == len(timeline) - 1:
        tail = len(timeline) - 1 - blank[0] + 1
        if tail < len(timeline) and times[-1] > 2 * base:
            del timeline[len(timeline) - tail + 1:]
            del times[len(times) - tail + 1:]

    data = BytesIO()
    timeline[0].save(data, format='PNG', save_all=True, append_images=timeline[1:],
                     duration=base, loop=0, disposal=0, blend=0)
    return data.getvalue(), base, len(timeline)


def measure(frames):
    """Union of the painted pixels across the animation, as the tray maths needs it."""
    boxes = [f.getchannel('A').point(lambda a: 255 if a > 80 else 0).getbbox() for f in frames]
    boxes = [b for b in boxes if b]
    if not boxes:
        raise SystemExit('every frame is fully transparent')
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__.strip().splitlines()[2].strip())
    src = Path(sys.argv[1])
    if not src.is_dir():
        raise SystemExit(f'{src} is not a directory')

    mapping = json.loads(MAP.read_text())
    lock = json.loads(LOCK.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    by_lower = {p.name.lower(): p for p in src.iterdir() if p.is_file()}

    # The dice is six files, not one: dice1..dice6 each carry the same tumble and a different
    # landed face. /dice rolls 1-6 on the server and the client picks the matching file, so all
    # six are converted from one shared crop box. A single box matters: one EMOTE_LAYOUT entry
    # has to scale and centre all six, so they must be pixel-identical in size and framing.
    dice_paths = [by_lower.get(f'dice{n}.gif') for n in range(1, 7)]
    dice_faces = []
    if all(dice_paths):
        dice_sets = []
        for n, p in enumerate(dice_paths, 1):
            fr, dl = load_frames(p)
            fr, keyed = clean_frames(fr)
            dice_sets.append((n, fr, dl, keyed))
        box = measure([f for _, fr, _, _ in dice_sets for f in fr])
        if box[2] - box[0] > CANVAS or box[3] - box[1] > CANVAS:
            raise SystemExit(f'dice painted area is {box[2]-box[0]}x{box[3]-box[1]}, larger than {CANVAS}px')
        for n, fr, dl, keyed in dice_sets:
            data, base, _ = build([f.crop(box) for f in fr], dl)
            name = 'dice' if n == 1 else f'dice{n}'
            (OUT / f'{name}.png').write_bytes(data)
            dice_faces.append((name, len(fr), len(dl), base, data, keyed, f'dice{n}.gif'))
        print(f'  dice faces 1-6 written from a shared {box[2]-box[0]}x{box[3]-box[1]} box')

    skip = set()
    if dice_faces:
        skip.add('dice')
    # Never overwrite art the sprite route already produced and verified. FILENAMES also lists the
    # 32 shipped ids so a full refresh is possible, but matching a wiki GIF (panic <- Come.gif)
    # must not silently replace a verified sprite render. --refresh opts in to that.
    if '--refresh' not in sys.argv:
        for eid, entry in lock.get('outputs', {}).items():
            if entry.get('sha256'):
                skip.add(eid)

    found, missing = [], []
    for eid, fname in FILENAMES.items():
        if eid not in mapping or eid in skip:
            continue
        wanted = [fname] + ALIASES.get(eid, [])
        path = next((by_lower[w.lower()] for w in wanted if w.lower() in by_lower), None)
        if path is None:
            missing.append((eid, fname))
            continue
        fname = path.name

        frames, delays = load_frames(path)
        gif_frames = len(frames)
        frames, keyed = clean_frames(frames)
        canvas = crop_union(frames)

        data, base, timeline = build(canvas, delays)

        dest = OUT / f'{eid}.png'
        dest.write_bytes(data)

        rec = Image.open(dest)
        rec.seek(0)
        size = rec.size
        entry = lock['outputs'].get(eid, {})
        entry.update({
            'action': mapping[eid],
            'delay': base,
            'frames': rec.n_frames,
            'sha256': hashlib.sha256(data).hexdigest(),
            'source': f'{fname} (iRO Wiki)',
        })
        lock['outputs'][eid] = entry
        found.append((eid, fname, gif_frames, rec.n_frames, base, size, keyed))

    # One lock entry per id, so `dice` describes face 1 and names the other five files it owns.
    # The game reads `faces` to know which PNGs a rolled result can ask for; without it a roll of
    # 4 would point at a file the lock never mentions.
    if dice_faces:
        first = Image.open(OUT / 'dice.png')
        first.seek(0)
        entry = lock['outputs'].get('dice', {})
        entry.update({
            'action': mapping['dice'],
            'delay': dice_faces[0][3],
            'frames': first.n_frames,
            'sha256': hashlib.sha256((OUT / 'dice.png').read_bytes()).hexdigest(),
            'source': 'dice1.gif (iRO Wiki)',
            'faces': 6,
        })
        lock['outputs']['dice'] = entry
        for name, g, _, base, data, keyed, src_name in dice_faces:
            size = Image.open(OUT / f'{name}.png').size
            note = f'  (removed {keyed} background)' if keyed else ''
            print(f'  {name:10} <- {src_name:16} {g:2} gif frames -> {size[0]}x{size[1]}, {base} ms{note}')
        found.append(('dice', 'dice1-6.gif', dice_faces[0][1], first.n_frames, dice_faces[0][3],
                      first.size, dice_faces[0][5]))

    LOCK.write_text(json.dumps(lock, indent=2) + '\n')

    for eid, fname, g, n, d, size, keyed in found:
        note = f'  (removed {keyed} background)' if keyed else ''
        print(f'  {eid:10} <- {fname:16} {g:2} gif frames -> {n:2} apng, {d} ms, {size[0]}x{size[1]}{note}')
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
