#!/usr/bin/env python3
"""Refresh the canonical Updates/Sprite/index.html from its seven source folders.

Run from the repository root:
  python3 tools/make_sprite_viewer.py
  python3 tools/make_sprite_viewer.py --check

This only refreshes the embedded class/file manifest; it never edits or converts the PNGs.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPRITE_DIR = ROOT / "Updates" / "Sprite"
VIEWER = SPRITE_DIR / "index.html"

TREES = [
    {"name": "Novice", "classes": [{"id": "novice", "label": "Novice"}]},
    {"name": "Thief", "classes": [
        {"id": "thief", "label": "Thief"},
        {"id": "assassin", "label": "Assassin"},
        {"id": "assassincross", "label": "Assassin Cross"},
    ]},
    {"name": "Merchant", "classes": [
        {"id": "merchant", "label": "Merchant"},
        {"id": "blacksmith", "label": "Blacksmith"},
        {"id": "whitesmith", "label": "Whitesmith"},
    ]},
    {"name": "Mage", "classes": [
        {"id": "mage", "label": "Mage"},
        {"id": "wizard", "label": "Wizard"},
        {"id": "highwizard", "label": "High Wizard"},
    ]},
    {"name": "Archer", "classes": [
        {"id": "archer", "label": "Archer"},
        {"id": "hunter", "label": "Hunter"},
        {"id": "sniper", "label": "Sniper"},
    ]},
    {"name": "Acolyte", "classes": [
        {"id": "aco", "label": "Acolyte"},
        {"id": "priest", "label": "Priest"},
        {"id": "highpriest", "label": "High Priest"},
    ]},
    {"name": "Swordman", "classes": [
        {"id": "swordman", "label": "Swordman"},
        {"id": "knight", "label": "Knight"},
        {"id": "lordknight", "label": "Lord Knight"},
    ]},
]

FILENAME = re.compile(
    r"^(?P<job>[a-z]+) (?P<gender>male|female) "
    r"(?P<action>walking|attack|attacking) (?P<direction>N|NE|S|SE)\.png$"
)
POSE_ORDER = {"walk": {"NE": 0, "N": 1, "S": 2, "SE": 3}, "attack": {"SE": 4}}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _class_order():
    return {
        tree["name"]: {item["id"]: index for index, item in enumerate(tree["classes"])}
        for tree in TREES
    }


def collect_files():
    expected_folders = {tree["name"] for tree in TREES}
    actual_folders = {item.name for item in SPRITE_DIR.iterdir() if item.is_dir()}
    if actual_folders != expected_folders:
        missing = sorted(expected_folders - actual_folders)
        extra = sorted(actual_folders - expected_folders)
        raise ValueError(f"sprite folders differ from the viewer config (missing={missing}, extra={extra})")

    tree_rank = {tree["name"]: index for index, tree in enumerate(TREES)}
    class_rank = _class_order()
    rows = []
    seen = set()

    for tree in TREES:
        folder = tree["name"]
        class_ids = {item["id"] for item in tree["classes"]}
        for file in (SPRITE_DIR / folder).glob("*.png"):
            match = FILENAME.fullmatch(file.name)
            if not match:
                raise ValueError(f"unrecognised sprite filename: {file.relative_to(ROOT)}")
            job, gender, action, direction = match.groups()
            if job not in class_ids:
                raise ValueError(f"{job} is not listed under the {folder} tree")
            key = (folder, job, gender, "walk" if action == "walking" else "attack", direction)
            if key in seen:
                raise ValueError(f"duplicate pose key: {key}")
            seen.add(key)

            data = file.read_bytes()
            if len(data) < 24 or data[:8] != PNG_SIGNATURE:
                raise ValueError(f"not a valid PNG: {file.relative_to(ROOT)}")
            width, height = struct.unpack_from(">II", data, 16)
            if width != 200 or height != 200:
                raise ValueError(f"expected 200x200 source art, got {width}x{height}: {file.relative_to(ROOT)}")

            rows.append({
                "tree": folder,
                "job": job,
                "gender": gender,
                "action": "walk" if action == "walking" else "attack",
                "direction": direction,
                "originalPose": f"{action} {direction}",
                "fileName": file.name,
                "path": file.relative_to(SPRITE_DIR).as_posix(),
            })

    if not rows:
        raise ValueError("no sprite PNGs found")

    for tree in TREES:
        for job in tree["classes"]:
            for gender in ("male", "female"):
                if not any(row["tree"] == tree["name"] and row["job"] == job["id"] and row["gender"] == gender for row in rows):
                    raise ValueError(f"no {gender} files found for {tree['name']}/{job['id']}")

    rows.sort(key=lambda row: (
        tree_rank[row["tree"]],
        class_rank[row["tree"]][row["job"]],
        0 if row["gender"] == "male" else 1,
        POSE_ORDER[row["action"]][row["direction"]],
    ))
    return rows


def update_json_block(html, block_id, value):
    pattern = re.compile(
        rf'(<script id="{re.escape(block_id)}" type="application/json">)'
        rf'([\s\S]*?)(</script>)'
    )
    encoded = json.dumps(value, ensure_ascii=False, indent=2)
    updated, count = pattern.subn(lambda match: match.group(1) + encoded + match.group(3), html, count=1)
    if count != 1:
        raise ValueError(f"could not find exactly one JSON block named {block_id!r} in {VIEWER.relative_to(ROOT)}")
    return updated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the canonical HTML needs refreshing")
    args = parser.parse_args()

    html = VIEWER.read_text(encoding="utf-8")
    expected = update_json_block(html, "sprite-config", TREES)
    expected = update_json_block(expected, "sprite-manifest", collect_files())
    if expected == html:
        print("Sprite viewer is current.")
        return 0
    if args.check:
        print("Sprite viewer manifest is stale. Run: python3 tools/make_sprite_viewer.py", file=sys.stderr)
        return 1
    VIEWER.write_text(expected, encoding="utf-8")
    print(f"Updated {VIEWER.relative_to(ROOT)} from {sum(len(row['classes']) for row in TREES)} class jobs and source PNGs.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"make_sprite_viewer: {error}", file=sys.stderr)
        raise SystemExit(1)
