#!/usr/bin/env python3
"""Rebuild a montage sheet into the normal one-row-per-direction layout.

Some sheets are not laid out one direction per row: several strips are pasted
onto one canvas inside drawn borders (a "montage").  The poses themselves are
the usual set, so a montage can be reassembled automatically:

    for every pose of the class line's proper sheet (the parent class's sheet),
    find where that pose sits in the montage by silhouette overlap (IoU), lift
    the patch out - limited to the montage component it sits in, so neighbouring
    poses cannot bleed in - and paste it back at the reference position.

The result is a sheet the rest of the pipeline reads normally.  If the matches
are not confident the rebuild is refused, and the class keeps the art of the
class it inherits from.

Standalone:  python3 tools/montage.py <reference sheet> <montage> <out.png>
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.optimize import linear_sum_assignment
from scipy.signal import fftconvolve

MIN_IOU = 0.55          # a pose counts as found at this overlap
MIN_MATCHED = 0.95      # fraction of the reference poses that must be found


def content_runs(v, min_len):
    out, s = [], None
    for i, x in enumerate(v):
        if x and s is None:
            s = i
        elif not x and s is not None:
            if i - s >= min_len:
                out.append((s, i - 1))
            s = None
    if s is not None and len(v) - s >= min_len:
        out.append((s, len(v) - 1))
    return out


def sheet_positions(path):
    """(image, [(row_y, box)]) for a normal sheet - the boxes the builder reads."""
    im = Image.open(path).convert('RGBA')
    a = np.array(im.getchannel('A'))
    figs = []
    for (y0, y1) in content_runs(a.max(axis=1) > 8, 6):
        sub = a[y0:y1 + 1, :]
        for (x0, x1) in content_runs(sub.max(axis=0) > 8, 4):
            c = im.crop((x0, y0, x1 + 1, y1 + 1))
            bb = c.getchannel('A').getbbox()
            if bb:
                figs.append((y0, (x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3])))
    return im, figs


def _iou_map(montage_mask, mask):
    num = fftconvolve(montage_mask, mask[::-1, ::-1], mode='valid')
    loc = fftconvolve(montage_mask, np.ones_like(mask), mode='valid')
    return num / np.maximum(mask.sum() + loc - num, 1e-6)


def _best_match(montage_mask, mask):
    h, w = mask.shape
    H, W = montage_mask.shape
    if h > H or w > W:
        return None
    iou = _iou_map(montage_mask.astype(np.float32), mask.astype(np.float32))
    pos = np.argsort(iou.ravel())[-3:][::-1]          # 3 best, for a unique assignment
    out = []
    for p in pos:
        i, j = np.unravel_index(p, iou.shape)
        out.append((float(iou[i, j]), int(j), int(i), int(w), int(h)))
    return out


def rebuild(ref_path, montage_path, min_iou=MIN_IOU, min_matched=MIN_MATCHED):
    """-> (rebuilt image or None, report dict)."""
    ref, figs = sheet_positions(ref_path)
    mon = Image.open(montage_path).convert('RGBA')
    mon_mask = (np.array(mon.getchannel('A')) > 8)
    lab, _ = ndimage.label(mon_mask, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))

    cands, masks = [], []
    for (x0, y0, x1, y1) in [b for _, b in figs]:
        m = np.array(ref.crop((x0, y0, x1, y1)).getchannel('A')) > 8
        masks.append(m)
        cands.append(_best_match(mon_mask, m))

    # choose one distinct montage position per reference pose (greedy by score)
    pairs = []
    for ri, c in enumerate(cands):
        if not c:
            continue
        for k, (score, mx, my, w, h) in enumerate(c):
            pairs.append((score, ri, k, mx, my, w, h))
    pairs.sort(reverse=True)
    taken_r, taken_p = set(), set()
    chosen = {}
    for score, ri, k, mx, my, w, h in pairs:
        key = (mx // 3, my // 3)
        if ri in taken_r or (ri, k) in taken_p or key in {(c[3] // 3, c[4] // 3) for c in chosen.values()}:
            continue
        taken_r.add(ri)
        chosen[ri] = (score, mx, my, w, h)

    out = Image.new('RGBA', ref.size, (0, 0, 0, 0))
    scores = []
    for ri, (row_y, (x0, y0, x1, y1)) in enumerate(figs):
        if ri not in chosen:
            scores.append(0.0)
            continue
        score, mx, my, w, h = chosen[ri]
        scores.append(score)
        if score < min_iou:
            continue
        lid = lab[min(my + h // 2, mon.height - 1), min(mx + w // 2, mon.width - 1)]
        if lid > 0:                                   # keep only the matched pose
            win = np.array(mon.crop((mx, my, mx + w, my + h))).copy()
            keep = (lab[my:my + h, mx:mx + w] == lid)
            win[:, :, 3] = np.where(keep, win[:, :, 3], 0)
            out.alpha_composite(Image.fromarray(win), (x0, y0))
        else:
            out.alpha_composite(mon.crop((mx, my, mx + w, my + h)), (x0, y0))

    sc = np.array(scores)
    report = {'poses': len(figs), 'matched': int((sc >= min_iou).sum()),
              'median_iou': float(np.median(sc)) if len(sc) else 0.0,
              'weak': int((sc < min_iou).sum())}
    if report['matched'] < min_matched * report['poses'] or report['poses'] == 0:
        return None, report
    return out, report


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 1
    img, rep = rebuild(sys.argv[1], sys.argv[2])
    if not img:
        print('could not rebuild: %s' % rep)
        return 1
    img.save(sys.argv[3])
    print('rebuilt %s from %s: %d/%d poses, median IoU %.2f'
          % (sys.argv[3], sys.argv[1], rep['matched'], rep['poses'], rep['median_iou']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
