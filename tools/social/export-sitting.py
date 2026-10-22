#!/usr/bin/env python3
"""Install the sitting-only adapters into the pinned ragassets checkout."""
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[2];gateway=Path(sys.argv[1])/'gateway';native=root/'tools/native-wardrobe'
export=(native/'export.go').read_text().replace('if req.EnableShadow {','if shouldDrawShadowFor(req.EnableShadow, req.Job, req.Action) {').replace('for k, n := range map[string]int{', 'shadowCount := 0; if shouldDrawShadowFor(req.EnableShadow, req.Job, req.Action) { shadowCount = 1 }; for k, n := range map[string]int{').replace('"shadow": 1}', '"shadow": shadowCount}')
(gateway/'internal/render/engine/wardrobe_export.go').write_text(export)
for command,file,old,new in [('social-export','main.go','offset := 0','offset := 16'),('social-accessories','accessory_export.go','action := 0','action := 16')]:
 p=gateway/'cmd'/command;p.mkdir(exist_ok=True);s=(native/file).read_text().replace('[]string{"idle", "walk", "attack"}','[]string{"sit"}').replace(old,new);(p/'main.go').write_text(s)
s=(native/'accessory_proof.go').read_text().replace('"idle0": 0, "walk2": 10, "attack4": uint(off + 4)','"sit0": 16, "sit2": 18, "sit4": 20')
s=s.replace('off := attack','off := attack; _ = off')
p=gateway/'cmd/social-proof';p.mkdir(exist_ok=True);(p/'main.go').write_text(s)
