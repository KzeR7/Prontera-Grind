#!/usr/bin/env python3
"""Write (or verify) the SIMPLEST kind of animated PNG - the exact shape the class skins use.

An APNG is a normal PNG with four extra chunk types.  The simplest useful form is what every file
in Updates/Sprite/ is, and what this tool writes:

    IHDR              one image header for the whole animation (8-bit RGBA, non-interlaced)
    acTL              num_frames = N, num_plays = 0        <- 0 means "loop forever"
    fcTL (seq 0)      frame 1: w,h,x=0,y=0, delay_num/den, dispose 0, blend 0
    IDAT              frame 1's pixels - ALWAYS IDAT for the first frame, never fdAT
    fcTL (seq 1)      frame 2 ...
    fdAT (seq 2)      frame 2's pixels: a 4-byte sequence number, then exactly what IDAT holds
    fcTL (seq 3) / fdAT (seq 4) / ...   one fcTL + one fdAT pair per following frame
    IEND

Every frame covers the whole canvas (w,h = the image size, offset 0,0), every frame replaces what
was there before (blend_op 0 = SOURCE, dispose_op 0 = NONE), and each frame carries its own delay.
Delays are stored as a fraction of a second: delay_num / delay_den (a denominator of 0 means 100).

This tool is deliberately dependency-free (stdlib only) so it can run anywhere the repo runs:

    python3 tools/make_simple_apng.py --demo Updates/ApngAnimation/simple_apng_demo.png
    python3 tools/make_simple_apng.py --frames a.png b.png --out combo.png --delay 100
    python3 tools/make_simple_apng.py --verify Updates/ApngAnimation/simple_apng_demo.png --json

`--json` prints the frame count, the delays and the SHA-256 of every frame's raw RGBA bytes, so a
test in another language (see tools/tests/class_skin_sim.js) can decode the same file with the
game's own decoder and prove the two agree frame for frame.

The demo is a plain moving square - it is a format example, NOT game art.  Never use it as, or mix
it into, the class sprite art.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIGNATURE = b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------- low-level PNG help
def chunk(kind: str, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind.encode("ascii") + data + struct.pack(">I", zlib.crc32(kind.encode("ascii") + data) & 0xFFFFFFFF)


def paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else (b if pb <= pc else c)


def unfilter(raw: bytes, width: int, height: int, bpp: int = 4) -> bytes:
    """Undo the PNG per-scanline filters (0 none, 1 sub, 2 up, 3 average, 4 paeth)."""
    stride = width * bpp
    out = bytearray(stride * height)
    for y in range(height):
        kind = raw[y * (stride + 1)]
        line, prev = y * stride, (y - 1) * stride
        for x in range(stride):
            value = raw[y * (stride + 1) + 1 + x]
            a = out[line + x - bpp] if x >= bpp else 0
            b = out[prev + x] if y else 0
            c = out[prev + x - bpp] if (y and x >= bpp) else 0
            out[line + x] = (value + (0 if kind == 0 else a if kind == 1 else b if kind == 2
                                      else (a + b) >> 1 if kind == 3 else paeth(a, b, c))) & 255
    return bytes(out)


def filter_none(pixels: bytes, width: int, height: int) -> bytes:
    """Re-encode pixels with filter 0 on every scanline - the smallest possible encoder."""
    stride = width * 4
    return b"".join(b"\x00" + pixels[y * stride:(y + 1) * stride] for y in range(height))


def parse_chunks(data: bytes):
    """-> [(kind, payload), ...] for a PNG, checking the signature first."""
    if data[:8] != SIGNATURE:
        raise SystemExit("not a PNG (bad signature)")
    out, pos = [], 8
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8].decode("latin1")
        out.append((kind, data[pos + 8:pos + 8 + length]))
        pos += 12 + length
        if kind == "IEND":
            break
    return out


def read_png(path: Path):
    """Read an 8-bit RGBA non-interlaced PNG (or frame 1 of an APNG) -> (width, height, rgba)."""
    chunks = parse_chunks(Path(path).read_bytes())
    header = dict(chunks)["IHDR"]
    width, height, depth, colour, _comp, _filt, interlace = struct.unpack(">IIBBBBB", header)
    if depth != 8 or colour != 6 or interlace:
        raise SystemExit(f"{path}: only 8-bit RGBA, non-interlaced PNGs are supported (got depth {depth}, colour type {colour}, interlace {interlace})")
    raw = zlib.decompress(b"".join(payload for kind, payload in chunks if kind == "IDAT"))
    return width, height, unfilter(raw, width, height)


def compress_frame(pixels: bytes, width: int, height: int) -> bytes:
    return zlib.compress(filter_none(pixels, width, height), 9)


# --------------------------------------------------------------------- read an APNG back out
def decode_apng(path: Path):
    """-> {"width","height","delays_ms","frames":[bytes,...]} for a simplest-form APNG."""
    chunks = parse_chunks(Path(path).read_bytes())
    frames, delays = [], []
    shown = None
    current = None

    def flush():
        nonlocal shown, current
        if current is None:
            return
        raw = zlib.decompress(b"".join(current["parts"]))
        pixels = unfilter(raw, current["w"], current["h"])
        saved = bytes(shown) if current["dispose"] == 2 else None
        for y in range(current["h"]):
            for x in range(current["w"]):
                src = (y * current["w"] + x) * 4
                dst = ((current["y"] + y) * current["width"] + current["x"] + x) * 4
                alpha = pixels[src + 3]
                if current["blend"] == 1 and alpha < 255:
                    keep = shown[dst + 3] * (255 - alpha) / 255
                    for c in range(3):
                        shown[dst + c] = int((pixels[src + c] * alpha + shown[dst + c] * keep) / (alpha + keep or 1))
                    shown[dst + 3] = int(alpha + keep)
                else:
                    for c in range(4):
                        shown[dst + c] = pixels[src + c]
        frames.append(bytes(shown))
        if current["dispose"] == 1:
            for y in range(current["h"]):
                for x in range(current["w"]):
                    dst = ((current["y"] + y) * current["width"] + current["x"] + x) * 4
                    shown[dst:dst + 4] = b"\x00\x00\x00\x00"
        elif saved is not None:
            shown[:] = saved
        current = None

    for kind, payload in chunks:
        if kind == "IHDR":
            width, height, depth, colour, _c, _f, interlace = struct.unpack(">IIBBBBB", payload)
            if depth != 8 or colour != 6 or interlace:
                raise SystemExit(f"{path}: expected 8-bit RGBA, non-interlaced")
            shown = bytearray(width * height * 4)
        elif kind == "fcTL":
            flush()
            _seq, fw, fh, fx, fy = struct.unpack(">IIIII", payload[:20])
            dnum, dden = struct.unpack(">HH", payload[20:24])
            delays.append(round(dnum / (dden or 100) * 1000))
            current = {"width": width, "w": fw, "h": fh, "x": fx, "y": fy,
                       "dispose": payload[24], "blend": payload[25], "parts": []}
        elif kind in ("IDAT", "fdAT"):
            if current is None:
                current = {"width": width, "w": width, "h": height, "x": 0, "y": 0,
                           "dispose": 0, "blend": 0, "parts": []}
                delays.append(0)
            current["parts"].append(payload[4:] if kind == "fdAT" else payload)
        elif kind == "IEND":
            flush()
    return {"width": width, "height": height, "delays_ms": delays, "frames": frames}


# ---------------------------------------------------------------------------- write an APNG
def write_apng(frames, delays_ms, out: Path, loops: int = 0):
    """frames: [(width, height, rgba), ...] (all the same size).  delays_ms: one per frame."""
    if not frames:
        raise SystemExit("no frames")
    width, height, _ = frames[0]
    if any((w, h) != (width, height) for w, h, _ in frames):
        raise SystemExit("every frame must be the same size - the simplest APNG has no sub-rects")
    if len(delays_ms) != len(frames):
        raise SystemExit("one delay per frame, please")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    body = [chunk("IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk("acTL", struct.pack(">II", len(frames), loops))]
    sequence = 0
    for index, ((fw, fh, pixels), delay) in enumerate(zip(frames, delays_ms)):
        den = 1000
        body.append(chunk("fcTL", struct.pack(">IIIIIHHBB", sequence, fw, fh, 0, 0, delay, den, 0, 0)))
        sequence += 1
        data = compress_frame(pixels, fw, fh)
        if index == 0:
            body.append(chunk("IDAT", data))            # the first frame is always IDAT
        else:
            body.append(chunk("fdAT", struct.pack(">I", sequence) + data))
            sequence += 1
    body.append(chunk("IEND", b""))
    out.write_bytes(SIGNATURE + b"".join(body))
    return out


def demo_frames(count: int = 6, size: int = 64):
    """A plain moving square on a transparent background - a format example, not art."""
    frames = []
    colours = [(255, 90, 90), (255, 190, 60), (90, 220, 120), (70, 170, 255), (170, 120, 255), (255, 120, 200)]
    for i in range(count):
        pixels = bytearray(size * size * 4)
        x0 = 4 + i * (size - 24) // max(1, count - 1)
        y0 = 4 + (i % 3) * 8
        for y in range(12):
            for x in range(12):
                r, g, b = colours[i % len(colours)]
                at = ((y0 + y) * size + x0 + x) * 4
                pixels[at:at + 4] = bytes((r, g, b, 255))
        frames.append((size, size, bytes(pixels)))
    return frames


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--demo", metavar="OUT.png", help="write a small generated demo APNG")
    parser.add_argument("--frames", nargs="+", help="source PNGs to combine into one APNG")
    parser.add_argument("--out", help="output path for --frames")
    parser.add_argument("--delay", type=int, default=100, help="delay in milliseconds for every frame (default 100)")
    parser.add_argument("--delays", help="per-frame delays in ms, comma separated")
    parser.add_argument("--loops", type=int, default=0, help="num_plays; 0 (default) means loop forever")
    parser.add_argument("--verify", metavar="FILE.png", help="decode a simplest-form APNG and report it")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    args = parser.parse_args()

    if args.verify:
        info = decode_apng(Path(args.verify))
        report = {"file": args.verify, "width": info["width"], "height": info["height"],
                  "frames": len(info["frames"]), "delays_ms": info["delays_ms"],
                  "frames_sha": [hashlib.sha256(f).hexdigest() for f in info["frames"]]}
    elif args.demo:
        frames = demo_frames()
        delays = [100] * len(frames)
        path = write_apng(frames, delays, Path(args.demo), args.loops)
        info = decode_apng(path)
        assert [hashlib.sha256(f).hexdigest() for f in info["frames"]] == [hashlib.sha256(f[2]).hexdigest() for f in frames], \
            "the file this tool wrote did not read back exactly"
        report = {"file": str(path), "width": info["width"], "height": info["height"],
                  "frames": len(info["frames"]), "delays_ms": info["delays_ms"],
                  "frames_sha": [hashlib.sha256(f).hexdigest() for f in info["frames"]]}
    elif args.frames:
        if not args.out:
            raise SystemExit("--frames needs --out")
        frames = [read_png(Path(p)) for p in args.frames]
        delays = [int(x) for x in args.delays.split(",")] if args.delays else [args.delay] * len(frames)
        path = write_apng(frames, delays, Path(args.out), args.loops)
        report = {"file": str(path), "width": frames[0][0], "height": frames[0][1],
                  "frames": len(frames), "delays_ms": delays,
                  "frames_sha": [hashlib.sha256(f[2]).hexdigest() for f in frames]}
    else:
        parser.error("pass --demo, --frames or --verify")

    if args.json:
        print(json.dumps(report))
    else:
        print(f"{report['file']}: {report['frames']} frames, {report['width']}x{report['height']}, "
              f"delays {report['delays_ms']} ms, loops forever")
        print("frame sha256 (raw RGBA): " + ", ".join(s[:12] for s in report["frames_sha"]))


if __name__ == "__main__":
    main()
