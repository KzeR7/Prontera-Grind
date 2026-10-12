"""Encode native RGBA pixels losslessly using an exact PNG palette when smaller."""
import io
from PIL import Image


def encode_png(image):
    image = image.convert('RGBA')
    stream = io.BytesIO()
    image.save(stream, format='PNG', optimize=True)
    rgba = stream.getvalue()
    colors = image.getcolors(256)
    if colors is None:
        return rgba
    palette = sorted(color for _, color in colors)
    indices = {color: i for i, color in enumerate(palette)}
    indexed = Image.new('P', image.size)
    indexed.putpalette([channel for color in palette for channel in color[:3]])
    indexed.putdata([indices[color] for color in image.getdata()])
    indexed.info['transparency'] = bytes(color[3] for color in palette)
    stream = io.BytesIO()
    indexed.save(stream, format='PNG', optimize=True)
    candidate = stream.getvalue()
    # Exact mapping, including partial alpha and RGB under transparent pixels.
    assert Image.open(io.BytesIO(candidate)).convert('RGBA').tobytes() == image.tobytes()
    return candidate if len(candidate) < len(rgba) else rgba
