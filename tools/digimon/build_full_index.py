#!/usr/bin/env python3
"""Generate the full Digimon profile/evolution index from the pinned upstream data.

Usage: python3 tools/digimon/build_full_index.py /path/to/digimon-up-sprites/digimon.json
The upstream sprite repository contains 251 profile records. This index links those
profiles to any matching v3 runtime atlas; variants remain in the 280-entry roster.
"""
import json
import sys
from pathlib import Path

SOURCE_URL = "https://github.com/dannyphang/digimon-up-sprites"
SOURCE_REVISION = "4eaee71cc949953e45ce5a77564469ba93e36907"
EXPECTED_PROFILES = 251
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets/digimon/index.json"


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__.strip())
    source_path = Path(sys.argv[1])
    source = json.loads(source_path.read_text(encoding="utf-8"))
    if not isinstance(source, list) or len(source) != EXPECTED_PROFILES:
        raise SystemExit(f"Expected {EXPECTED_PROFILES} source profiles, got {len(source) if isinstance(source, list) else 'non-list'}")

    ids = [item["folder"] for item in source]
    if len(set(ids)) != len(ids):
        raise SystemExit("Source contains duplicate profile IDs")
    known = set(ids)
    species = []
    edge_count = 0
    unresolved = set()
    local_sprites = 0
    for item in source:
        sid = item["folder"]
        evolves_to = list(item.get("evolves_to", []))
        evolves_from = list(item.get("evolves_from", []))
        edge_count += len(evolves_to)
        unresolved.update(ref for ref in evolves_to + evolves_from if ref not in known)

        v3_image = ROOT / "assets/digimon/v3" / f"{sid}.webp"
        v1_image = ROOT / "assets/digimon/v1" / f"{sid}.png"
        if v3_image.is_file():
            image = {"path": f"assets/digimon/v3/{sid}.webp", "atlas": "v3"}
            local_sprites += 1
        elif v1_image.is_file():
            image = {"path": f"assets/digimon/v1/{sid}.png", "atlas": "v1"}
            local_sprites += 1
        else:
            image = None

        species.append({
            "id": sid,
            "name": item["name"]["en"],
            "nameZh": item.get("name", {}).get("zh") or None,
            "stage": item.get("stage", {}).get("en") or None,
            "attribute": item.get("attribute", {}).get("en") or None,
            "type": item.get("type", {}).get("en") or None,
            "evolvesFrom": evolves_from,
            "evolvesTo": evolves_to,
            "profileUrl": item.get("source") or None,
            "image": image,
        })

    result = {
        "schemaVersion": 1,
        "title": "Digimon Profile and Evolution Index",
        "source": {
            "repository": SOURCE_URL,
            "revision": SOURCE_REVISION,
            "profileData": "digimon.json",
            "profileReference": "https://digimon.net/reference_en/",
        },
        "coverage": {
            "profileCount": len(species),
            "animationEntryCount": 280,
            "animationVariantCount": 32,
            "evolutionLinksListed": edge_count,
            "localSpriteCount": local_sprites,
            "profilesWithoutLocalSprite": len(species) - local_sprites,
            "unresolvedEvolutionReferenceCount": len(unresolved),
            "unresolvedEvolutionReferences": sorted(unresolved),
            "notes": [
                "This is a 251-profile index, not a claim that every Digimon ever published is included.",
                "Evolution links reproduce the source data; the source describes its profile/evolution data as incomplete and some links point to profiles not in this dataset.",
                "Image is null when the pinned source has no matching animation entry for this profile.",
                "The runtime roster has 280 animation entries including 32 variants; those entries are not 280 distinct profiles. Variants can inherit a base profile where the source naming establishes one.",
            ],
        },
        "species": species,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(species)} profiles, {edge_count} listed evolution links, {local_sprites} local sprite references")


if __name__ == "__main__":
    main()
