#!/usr/bin/env python3
"""Optimize the locally generated arena texture; keep the source alongside this script."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
source=root/'tools/digimon/arena-stone-source.png'
out=root/'assets/digimon/sanctuary/arena-stone.webp'
out.parent.mkdir(parents=True,exist_ok=True)
Image.open(source).convert('RGB').save(out,'WEBP',quality=90,method=6)
print(out)
