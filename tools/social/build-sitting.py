#!/usr/bin/env python3
"""Pack native action 16–23 using the existing lossless wardrobe packer."""
import sys,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'tools'))
# Reuse the existing packing algorithm, selecting sitting instead of combat actions.
source=(root/'tools/build_wardrobe_collection.py').read_text()
source=source.replace("['idle0']","['sit0']").replace("name.startswith('idle')","name.startswith('sit')")
# Scale comes from the existing standing figure, never the shorter sitting height.
source=source.replace("for key,height in heights.items():manifest['assets'][key]['figureHeight']=height", "for key,height in heights.items():manifest['assets'][key]['figureHeight']=standing[key]['figureHeight']")
scope={'__name__':'social_packer','__file__':str(root/'tools/build_wardrobe_collection.py')}
standing={}
for pack in ['assets/wardrobe/v5','assets/wardrobe/fourth/v1']:
 standing.update(json.loads((root/pack/'catalog.json').read_text())['assets'])
scope['standing']=standing;exec(compile(source,scope['__file__'],'exec'),scope)
classes={**scope['CLASSES'],**scope['FOURTH_CLASSES']}
scope['build'](Path(sys.argv[1]),Path(sys.argv[2]),root/'tools/native-wardrobe/accessories.json',Path(sys.argv[3]),classes=classes)
