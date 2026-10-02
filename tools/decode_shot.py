#!/usr/bin/env python3
"""Reassemble canvas captures logged by shot_harness.js into PNGs.

usage: python3 decode_shot.py <brave.log> [tag ...]
"""
import base64
import re
import sys

from PIL import Image

log = sys.argv[1]
tags = sys.argv[2:] or ['FRONT']

text = open(log, 'rb').read().decode('utf-8', 'replace')
by_tag = {}
for tag, idx, body in re.findall(r'\[CHUNK\|([^|]+)\|(\d+)\]([A-Za-z0-9+/=;:,]+)', text):
    by_tag.setdefault(tag, {})[int(idx)] = body

if not by_tag:
    raise SystemExit('no [CHUNK|tag|idx] payloads found in %s' % log)

for tag in tags:
    chunks = by_tag.get(tag)
    if not chunks:
        print('no data for tag %s' % tag)
        continue
    url = ''.join(chunks[k] for k in sorted(chunks))
    path = '/tmp/shot_%s.png' % tag.lower()
    open(path, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
    im = Image.open(path)
    print('wrote %s %s %s (chunks=%d)' % (path, im.size, im.mode, len(chunks)))
    im.convert('RGB').save(path.replace('.png', '_v.png'))