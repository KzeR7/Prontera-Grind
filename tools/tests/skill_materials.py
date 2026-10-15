#!/usr/bin/env python3
"""Audit the shipped material atlas: decode, alpha isolation, detail and budget."""
import base64
import io
from pathlib import Path
import re
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[2]
module=(root/'assets/skill-materials.js').read_text()
encoded=re.search(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',module)
assert encoded,'runtime atlas missing'
image=Image.open(io.BytesIO(base64.b64decode(encoded[1]))).convert('RGBA')
assert image.size==(1024,1024),image.size
assert len(module.encode())<400_000,'material module exceeds its publishing allowance'
pixels=np.asarray(image)
for row in range(8):
    for frame in range(8):
        tile=pixels[row*128:(row+1)*128,frame*128:(frame+1)*128]
        alpha=tile[:,:,3]
        assert np.count_nonzero(alpha)>150,(row,frame,'empty material')
        assert np.count_nonzero(alpha==0)>100,(row,frame,'missing transparency')
        # Transparent cell boundaries prevent bleeding while the GPU/Canvas scales sprites.
        assert np.max(alpha[[0,-1],:])==0 and np.max(alpha[:,[0,-1]])==0,(row,frame,'atlas bleed')
        assert len(np.unique(alpha))>15,(row,frame,'flat alpha')
    if row!=7:
        assert not np.array_equal(pixels[row*128:(row+1)*128,:128],pixels[row*128:(row+1)*128,128:256]),(row,'animation is static')
print('Material atlas: 64 decoded sprites, animated detail, alpha isolation, transparent borders and <400KB runtime passed.')
