#!/usr/bin/env python3
"""Reuse the native per-layer and independent composition audit for sit actions."""
from pathlib import Path
root=Path(__file__).resolve().parents[2]
s=(root/'tools/tests/wardrobe_accessories_assets.py').read_text().replace('in [6,19]','==25').replace("['idle0','walk2','attack4']","['sit0','sit2','sit4']")
exec(compile(s,str(root/'tools/tests/wardrobe_accessories_assets.py'),'exec'),{'__name__':'__main__','__file__':str(root/'tools/tests/wardrobe_accessories_assets.py')})
