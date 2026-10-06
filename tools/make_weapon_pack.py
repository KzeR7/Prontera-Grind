#!/usr/bin/env python3
"""Harvest Ragnarok Online weapon art and pack it for the browser.

This is the tool behind `assets/weapons/` and `assets/weapons_data.js`, the art the
weapon-proposal page (`tools/weapon_proposal.html`) shows on every class.

What it reads
-------------
Real Ragnarok Online client art, in the form the client ships it:

* `<source>/data/sprite/아이템/*.spr`  - the artwork an item wears lying on the ground.
  One frame, a 22-26 px front view: this is the recognisable "item icon" art, and it
  is what the family *designs* come from (three per family - see DESIGN below).
* `<source>/data/sprite/인간족/<job>/<job>_<sex>_<weapon>.spr|.act` - the **held
  weapon** sprites.  These carry the weapon drawn on the character for the client's
  two angle sets: the south/front group (S, SE, E, SW) and the north/back group
  (W, NW, N, NE).  Those are what `held` art in the manifest is.

Both formats are read here from scratch (stdlib only, Pillow for the image writes):
SPR v0x200/0x201/0x205 with the u16 frame-size prefix and index-0 RLE runs, and ACT
v0x205 layers/anchors.  The format notes are in `tools/weapon-art-notes.md`.

Provenance
----------
The pixels are Gravity's Ragnarok Online art, cropped only - never redrawn,
recoloured or scaled by hand (AGENTS.md house rule 1).  `assets/weapons_manifest.json`
records, per image, the exact source file it came from.  Nothing here is served to a
player by itself: the game keeps using its own art until the owner approves a bake.

Usage
-----
    /tmp/venv/bin/python tools/make_weapon_pack.py --source /path/to/extracted/client
    /tmp/venv/bin/python tools/make_weapon_pack.py --check     # is assets/ current?

`--source` must point at a directory holding `data/sprite/` with the Korean folder
names, i.e. the output of a GRF extractor.  Two public mirrors of an extracted
client were used for the committed art; see `--list-sources` and the notes file.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import struct
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - the venv always has it
    Image = None

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
WEAPON_DIR = ASSETS / "weapons"
DATA_JS = ASSETS / "weapons_data.js"
MANIFEST = ASSETS / "weapons_manifest.json"

# ---------------------------------------------------------------------------
# The curated set.  Three designs per weapon family, picked by eye from the art
# the client ships and named by their Korean item name so the manifest can point
# back at the exact source file.  `icon` names an item sprite (the ground art);
# `held` names a held-weapon sprite for the per-direction angle art.
# ---------------------------------------------------------------------------
DESIGN = [
    # family, design id, label, icon item name, held weapon name (or None)
    ("sword",  "sword_knight",  "Knight's Blade",     "프리스트의검",     "기사/기사_남_프리스트의검"),
    ("sword",  "sword_chill",   "Chilling Sword",     "서늘한검",         None),
    ("sword",  "sword_elem",    "Elemental Sword",    "엘레멘탈소드",     None),
    ("dagger", "dagger_chill",  "Chilling Knife",     "서늘한나이프",     None),
    ("dagger", "dagger_ice",    "Frost Dagger",       "서늘한대거",       None),
    ("dagger", "dagger_broken", "Broken Blade",       "부러진검",         None),
    ("katar",  "katar_plain",   "Katar",              "카타르",           None),
    ("katar",  "katar_reinf",   "Reinforced Katar",   "강화카타르",       None),
    ("katar",  "katar_guil",    "Guillotine Katar",   "길로틴카타르",     None),
    ("bow",    "bow_chill",     "Chilling Bow",       "서늘한활",         "바드/바드_남_활"),
    ("bow",    "bow_royal",     "Royal Bow",          "왕가의활",         None),
    ("bow",    "bow_thorn",     "Thorn Bow",          "어느마법사의마도검", None),
    ("staff",  "staff_gold",    "Golden Rod Staff",   "골든로드스태프",   None),
    ("staff",  "staff_ion",     "Aion Staff",         "아이온스태프",     None),
    ("staff",  "staff_shadow",  "Shadow Staff",       "쉐도우스태프",     None),
    ("mace",   "mace_gold",     "Golden Mace",        "골든메이스",       None),
    ("mace",   "mace_wand",     "Arc Wand",           "아크완드",         None),
    ("mace",   "mace_forge",    "Forge Hammer",       "홀그랜제련망치",   None),
    ("axe",    "axe_chill",     "Chilling Battleaxe", "서늘한양날도끼",   None),
    ("axe",    "axe_single",    "Chilling Axe",       "서늘한도끼",       None),
    ("axe",    "axe_hammer",    "Chilling Hammer",    "서늘한철퇴",       None),
    ("spear",  "spear_chill",   "Chilling Lance",     "서늘한창",         None),
    ("spear",  "spear_undine",  "Undine Spear",       "운디네의창",       None),
    ("spear",  "spear_plain",   "Plain Spear",        "스피어",           None),
]

FAMILIES = ["sword", "dagger", "katar", "bow", "staff", "mace", "axe", "spear"]

# The client's two angle sets for a held weapon, as the ACTs use them.
FRONT_DIRS = ["S", "SE", "E", "SW"]          # sprite set A
BACK_DIRS = ["W", "NW", "N", "NE"]           # sprite set B
DIRS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]


# ---------------------------------------------------------------------------
# SPR
# ---------------------------------------------------------------------------
class Spr:
    """A Ragnarok Online .spr (v0x200 / 0x201 / 0x205)."""

    def __init__(self, path: Path):
        self.b = b = path.read_bytes()
        if b[:2] != b"SP":
            raise ValueError(f"{path}: not a spr")
        self.ver = struct.unpack_from("<H", b, 2)[0]
        self.n_idx = struct.unpack_from("<H", b, 4)[0]
        self.n_rgba = struct.unpack_from("<H", b, 6)[0] if self.ver >= 0x200 else 0
        self.pal = b[-1024:] if self.n_idx > 0 else b""
        o = 8 if self.ver >= 0x200 else 6
        self.indexed: list[tuple[int, int, bytes]] = []
        for _ in range(self.n_idx):
            w, h = struct.unpack_from("<HH", b, o)
            o += 4
            if self.ver >= 0x201:
                size = struct.unpack_from("<H", b, o)[0]
                o += 2
                end = o + size
                px = bytearray(w * h)
                p = 0
                while o < end and p < w * h:
                    v = b[o]
                    o += 1
                    if v == 0:                       # run of transparent pixels
                        run = b[o]
                        o += 1
                        p = min(w * h, p + run)
                    else:
                        px[p] = v
                        p += 1
                o = end
            else:
                px = bytearray(b[o:o + w * h])
                o += w * h
            self.indexed.append((w, h, bytes(px)))
        self.rgba: list[tuple[int, int, bytes]] = []
        for _ in range(self.n_rgba):
            w, h = struct.unpack_from("<HH", b, o)
            o += 4
            self.rgba.append((w, h, b[o:o + w * h * 4]))
            o += w * h * 4
        self.end = o

    def count(self) -> int:
        return len(self.indexed) + len(self.rgba)

    def image(self, i: int) -> "Image.Image":
        if i < len(self.indexed):
            w, h, px = self.indexed[i]
            out = bytearray(w * h * 4)
            pal = self.pal
            for j, v in enumerate(px):
                if v == 0:                            # index 0 is transparent
                    continue
                k = v * 4
                out[j * 4] = pal[k]
                out[j * 4 + 1] = pal[k + 1]
                out[j * 4 + 2] = pal[k + 2]
                out[j * 4 + 3] = 255
            return Image.frombytes("RGBA", (w, h), bytes(out))
        j = i - len(self.indexed)
        w, h, d = self.rgba[j]
        return Image.frombytes("RGBA", (w, h), d)


# ---------------------------------------------------------------------------
# ACT (v0x205)
# ---------------------------------------------------------------------------
def parse_act(path: Path):
    """Return actions[action][frame] = [(x, y, spr, flags), ...]."""
    b = path.read_bytes()
    if b[:2] != b"AC":
        raise ValueError(f"{path}: not an act")
    ver = struct.unpack_from("<H", b, 2)[0]
    o = 4
    nact = struct.unpack_from("<H", b, o)[0]
    o += 2
    if ver >= 0x200:
        o += 10
    actions = []
    for _ in range(nact):
        nfr = struct.unpack_from("<I", b, o)[0]
        o += 4
        frames = []
        for _ in range(nfr):
            if ver >= 0x200:
                o += 32                                # attack/fit ranges, unused
            nl = struct.unpack_from("<I", b, o)[0]
            o += 4
            layers = []
            for _ in range(nl):
                x, y, spr, flags = struct.unpack_from("<iiii", b, o)
                o += 16
                o += 28                                # colour, scales, rot, type, w, h
                layers.append((x, y, spr, flags))
            o += 4                                     # event id
            nanc = struct.unpack_from("<I", b, o)[0]
            o += 4
            o += 16 * nanc
            frames.append(layers)
        actions.append(frames)
    return actions


# ---------------------------------------------------------------------------
# Harvest
# ---------------------------------------------------------------------------
def decode_ko(name: str) -> str:
    """Korean names in a GRF-extracted tree arrive as a cp949 byte stream that has
    been re-encoded; this undoes whichever single-byte re-encoding was used."""
    for enc in ("cp874", "cp1252", "latin1"):
        try:
            return name.encode(enc).decode("cp949")
        except Exception:
            continue
    return name


def build_index(source: Path):
    """Map decoded Korean 'name' -> path for every .spr under data/sprite."""
    index: dict[str, Path] = {}
    base = source / "data" / "sprite"
    if not base.is_dir():
        raise SystemExit(f"{source}: no data/sprite under it (is this an extracted client?)")
    for dp, _dn, fn in os.walk(base):
        parts = [decode_ko(p) for p in os.path.relpath(dp, base).split(os.sep)]
        rel = "/".join(parts)
        for f in fn:
            if f.lower().endswith(".spr"):
                index.setdefault(f"{rel}/{decode_ko(f)}", Path(dp) / f)
    return index


def find_item(index, wanted: str):
    """The ground-item sprite whose Korean name is `wanted`."""
    for key, p in index.items():
        parts = key.split("/")
        if len(parts) >= 2 and parts[-1] == f"{wanted}.spr" and "아이템" in parts[-2]:
            return p
    # some mirrors keep the item art one folder deeper
    for key, p in index.items():
        if key.endswith(f"/{wanted}.spr") and "인간족" not in key:
            return p
    return None


def find_held(index, wanted: str):
    """The held-weapon sprite (job folder + weapon name), as .spr + .act."""
    for key, p in index.items():
        if "인간족" not in key:
            continue
        stem = key[:-4]
        if stem.endswith(wanted) and os.path.exists(p.with_suffix(".act")):
            return p, p.with_suffix(".act")
    return None, None


def png_b64(img: "Image.Image") -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def harvest(source: Path, out_dir: Path):
    index = build_index(source)
    print(f"indexed {len(index)} sprites under {source}/data/sprite")
    manifest = {"families": FAMILIES, "designs": [], "held": {}}
    data: dict[str, str] = {}
    out_dir.mkdir(parents=True, exist_ok=True)

    for family, did, label, item_name, held_name in DESIGN:
        src = find_item(index, item_name)
        if src is None:
            print(f"  ! {did:14s} item '{item_name}' not found - skipped")
            continue
        spr = Spr(src)
        img = spr.image(0)
        bbox = img.getbbox()
        if bbox is None:
            print(f"  ! {did:14s} '{item_name}' decoded empty - skipped")
            continue
        img = img.crop(bbox)                     # crop only, never redraw
        img.save(out_dir / f"{did}.png")
        data[did] = png_b64(img)
        entry = {
            "id": did, "family": family, "label": label,
            "w": img.width, "h": img.height,
            "source": str(src).replace(str(source), "").lstrip("/"),
        }
        if held_name:
            hspr, hact = find_held(index, held_name)
            if hspr:
                held_spr = Spr(hspr)
                acts = parse_act(hact)
                sets: dict[str, list[dict]] = {}
                for dirname, action in (("front", 4), ("back", 4 + 8)):
                    # motion 4 = standby-with-weapon; 10/11 = attack.  Both use the
                    # same two sprite sets, so the art table is read from the attack
                    # motion when it exists and falls back to the standby motion.
                    for motion in (10, 5, 4):
                        if motion * 8 + 7 >= len(acts):
                            continue
                        picked = {}
                        for d in range(8):
                            fr = acts[motion * 8 + d]
                            idx = {L[2] for f in fr for L in f if L[2] >= 0}
                            if idx:
                                picked[DIRS[d]] = sorted(idx)
                        if picked:
                            sets["front" if action == 4 else "back"] = picked
                            break
                held_entry = {
                    "id": did, "label": label,
                    "source": str(hspr).replace(str(source), "").lstrip("/"),
                    "frames": held_spr.count(),
                    "dirs": {},
                }
                for group, key in (("front", "front"), ("back", "back")):
                    picked = sets.get(key) or {}
                    for d, idxs in picked.items():
                        if d in FRONT_DIRS and group == "front" or d in BACK_DIRS and group == "back":
                            pass
                        i = idxs[0]
                        himg = held_spr.image(i)
                        bb = himg.getbbox()
                        if bb is None:
                            continue
                        himg = himg.crop(bb)
                        key2 = f"{did}__{d}"
                        himg.save(out_dir / "held" / f"{key2}.png" if (out_dir / "held").exists() or True else None)
                        data["held_" + key2] = png_b64(himg)
                        held_entry["dirs"][d] = {
                            "frame": i, "w": himg.width, "h": himg.height,
                        }
                if held_entry["dirs"]:
                    manifest["held"][did] = held_entry
                    entry["held"] = sorted(held_entry["dirs"].keys())
        manifest["designs"].append(entry)
        print(f"  + {did:14s} {family:6s} {img.width:>2}x{img.height:<2} {label}"
              + (f"  held:{','.join(entry.get('held', []))}" if entry.get("held") else ""))

    write_data(data)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {DATA_JS.relative_to(ROOT)} ({len(data)} images) and {MANIFEST.relative_to(ROOT)}")


def write_data(data: dict[str, str]):
    lines = [
        "// Weapon art for the proposal page - built by tools/make_weapon_pack.py.",
        "// Real Ragnarok Online client art, cropped only (AGENTS.md house rule 1).",
        "// assets/weapons_manifest.json says which client file each image came from.",
        "window.WEAPON_ART={",
    ]
    for k in sorted(data):
        lines.append(f'  "{k}":"{data[k]}",')
    lines.append("};")
    DATA_JS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def check() -> int:
    if not DATA_JS.exists() or not MANIFEST.exists():
        print("weapon art is MISSING - run tools/make_weapon_pack.py --source <client>")
        return 1
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    bad = []
    for entry in manifest["designs"]:
        if not (WEAPON_DIR / f"{entry['id']}.png").exists():
            bad.append(entry["id"])
    js = DATA_JS.read_text(encoding="utf-8")
    for entry in manifest["designs"]:
        if f'"{entry["id"]}"' not in js:
            bad.append(entry["id"] + " (not in data)")
    if bad:
        print(f"weapon art is STALE: {', '.join(sorted(set(bad)))}")
        return 1
    print(f"Weapon art is current ({len(manifest['designs'])} designs, "
          f"{len(manifest['held'])} with per-direction art).")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", help="an extracted RO client (a dir holding data/sprite/)")
    ap.add_argument("--out", default=str(WEAPON_DIR), help="where the PNGs go")
    ap.add_argument("--check", action="store_true", help="verify assets/ is current")
    args = ap.parse_args(argv)
    if args.check:
        return check()
    if not args.source:
        ap.error("--source is required to harvest (or use --check)")
    if Image is None:
        ap.error("Pillow is required: /tmp/venv/bin/pip install pillow")
    harvest(Path(args.source), Path(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
