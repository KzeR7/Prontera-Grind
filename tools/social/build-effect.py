#!/usr/bin/env python3
"""Reuse the native independent Black Thunder renderer for sitting routes."""
import sys,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'tools/native-wardrobe'))
p=root/'tools/native-wardrobe/build_black_thunder.py'
scope={'__name__':'social_effect','__file__':str(p)}
exec(compile(p.read_text().replace("['idle', 'walk', 'attack']","['sit']"),str(p),'exec'),scope)
scope['build'](Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]))
