# Native pet sprite pack

The original eight saved numeric species IDs stay in their original order. Twelve new species are appended (three per rarity), giving 20 species / five per rarity. The runtime loads only local native art; no pet images are downloaded from Divine Pride.

## Art and rebuilding

`source-manifest.json` pins the 40 original ACT/SPR binaries from grf.robrowser.com (3,831,006 bytes). `export.go` renders original source actions 0–7 (idle), 8–15 (walk), 16–23 (attack) with the pinned ragassets renderer `4de4fa747431979d35c747d7edd549a872efd9e1`. Each frame's native pixels, placement and delay are preserved. No recoloring, painted frames, invented attachment offsets or interpolated poses.

1. Recover each manifest URL to `<native-root>/<path>` and verify its SHA-256 and byte length. Filenames and URL escaping are pinned in the manifest.
2. Check out the renderer revision, put `export.go` at `gateway/cmd/pet-export/main.go`, and from `gateway/` build `go build -o /tmp/pet-export ./cmd/pet-export` (verified with Go1.24.2).
3. Run `/tmp/pet-export <native-root> <exports-root>`; full native proof frames stay outside the site.
4. With Pillow installed, run `python tools/build_pet_sprites.py <exports-root> <empty-pack-directory>`. The shipped directory is `assets/pets/v1/`. Audit with `python tools/tests/skill_pet_assets.py <skill-sheet-directory> <exports-root> <native-root>`.

Canvas 256×256, foot pivot128/192. The 163-file pack totals **1,733,434 bytes**, with a maximum decoded atlas **1,944,128 bytes**. Each stance is separate; Eddga also separates directions because its native frames are large. Native attack durations are in the species catalog. Only active animation states/directions and the open preview are pinned. Runtime: 16MiB decoded image budget, nine cached atlases, 4MiB per-atlas ceiling, SHA-256 verification, failed-download caching, explicit retry, and image disposal on eviction. An already painted native frame stays visible during another state download; first use falls back to the local native thumbnail.

Native attack frames follow actual attack events without changing attack cadence, damage, mutation, prices, skill-roll weights or rarity/drop odds. Added signatures use the existing 5%–10% Bond ladder; recommendations use existing skills and do not guarantee rolls. Passives still apply only to deployed pets and distinct species can add their bonuses as before.

## New pets and suggested battle skills

| Rarity | Pet | Signature at Bond0 → Bond5 | Suggested existing skills |
| --- | --- | --- | --- |
| Common | Drops | Golden Jelly: +5–10% Zeny | Treasure Sniff + Tail Wag |
| Common | Poporing | Resilient Gel: +5–10% Max HP | Vital Aura + Warm Nuzzle |
| Common | Fabre | Silken Guard: 5–10% less damage taken | Guarding Chirp + Warm Nuzzle |
| Rare | Smokie | Sneaky Finder: +5–10% equipment drops | Treasure Sniff + Tail Wag |
| Rare | Yoyo | Curious Forager: +5–10% ore drops | Treasure Sniff + Piercing Fang |
| Rare | Spore | Forest Wisdom: +5–10% EXP/Job EXP | Vital Aura + Guarding Chirp |
| Epic | Sohee | Spirit Tutor: +5–10% EXP/Job EXP | Arcane Blessing + Spirit Bolt |
| Epic | Deviruchi | Impish Ambush: +5–10% damage to MVPs | Piercing Fang + Blood Siphon |
| Epic | Nine Tail | Fox Fortune: +5–10% equipment drops | Flame Burst + War Cry |
| Legendary | Deviling | Dark Rally: +5–10% fighting pet damage | Arcane Blessing + Spirit Bolt |
| Legendary | Ghostring | Spectral Veil: 5–10% less damage taken | Vital Aura + Spirit Bolt |
| Legendary | Eddga | Tiger Challenge: +5–10% damage to MVPs | War Cry + Flame Burst |

Try: Pets → select a collected pet → Upgrades & skills → Idle / Walk / Attack. The panel also shows recommended skill pairs. Pets still come from drops.

## Runtime playback tuning (v135)

Original atlas pixels, frame ordering and stored delays stay unchanged. The game uses real time for pet animation, independent of the x1/x2/x4 combat clock. Playback runs at 20% native timing with at least 120ms per displayed idle/walk frame; attack poses last at least 0.8s and 120ms per frame. Repeated combat hits do not restart an unfinished pose. The preview uses the same frame timing floor. Pet travel follows 95% of the hero movement formula (including bonuses and the long-distance run boost); damage and attack cooldowns are unchanged.
