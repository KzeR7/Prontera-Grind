# Mythic raid pets — proposal (not implemented)

Status: design proposal for owner review. No pet species, save field, sprite sheet or
drop table has been changed by this document.

## What exists today

- `PETS` in `index.html` holds **20 species, 5 per rarity** across four rarities
  (`RN=['Common','Rare','Epic','Legendary']`), indices 0–19 in a fixed numeric order.
  Saves store that index, so a new rarity must be **appended**, never inserted.
- A pet is never hatched: it drops from a monster (`0.3%` per kill, `5%` from a boss).
- Every pet's art is a native 256×256 atlas in `assets/pets/v1/`
  (`tools/native-pets/README.md`): eight directions × idle/walk/attack, cut from the
  original ACT/SPR by `export.go` + `tools/build_pet_sprites.py`. There is **no
  recolouring, repainting or invented frame** — house rule 1 — so a new species is an
  art job first and a code job second.
- Duplicates fold into the one pet per species (`petFold`), and each species keeps a
  Bond rank with a 5%–10% signature.

## What "Mythic" needs beyond a fifth tier

1. `RN`/`RCL`/`MUT`/`MC` gain a fifth entry (`r:4`) — mutation colour, roll weights and
   the release/price anchor all read those tables.
2. `PETS` gains five appended entries (indices 20–24). Nothing is renumbered.
3. `assets/pets/v1/` gains five species atlases + thumbnails, and the catalog version
   bump that `pets.js` validates (SHA-256 per file, 1 MiB per atlas, 4 MiB decoded).
4. A raid-only drop path in `assets/raid.js`: the raid boss roll already picks a boss
   card at 10%; a Mythic pet needs its own independent roll (proposed **1.5% per
   Sanctum clear**, boosted to **4%** on a first-ever clear of that dungeon so the first
   kill feels like a trophy). This is client-side loot — **no new DO message, no alarm**.
5. Pet panel: a fifth rarity band, a raid badge on the tile, and the compendium entry.

## The five candidates

Each is a native RO monster sheet that does not yet have a pet atlas, chosen so the art
reads at pet scale and the skill is distinct from every existing signature.

| # | Pet | Source sheet | Signature (Bond 0 → Bond 5) | Existing skill pair |
| - | --- | ------------ | --------------------------- | ------------------- |
| 1 | **Abyssal Thanatos** | Memory of Thanatos (1708) | *Extinction Echo*: +6–12% damage to Raid bosses and MVPs | Piercing Fang + Blood Siphon |
| 2 | **Ifrit Ember** | Ifrit (1832) | *Primal Heat*: +5–10% ATK, and 3% of your damage is repeated as fire after 1s | Flame Burst + War Cry |
| 3 | **Obsidian Warden** | Obsidian Golem (1833) | *Sanctum Bulwark*: 6–12% less damage taken while inside a Raid | Guarding Chirp + Vital Aura |
| 4 | **Astral Seraph** | Retribution Angel (1831) | *Sanctum Grace*: revives come back with +15–30% HP and 1s shorter cooldown | Arcane Blessing + Spirit Bolt |
| 5 | **Void Whisper** | Death Whisperer (1837) | *Soul Tithe*: +5–10% MATK, and each kill restores 1–2% max HP | Spirit Bolt + Blood Siphon |

Design notes:

- Every signature is a **raid-flavoured** version of an existing effect family, so no new
  combat rule is invented: `boss` damage, `atk`, `dr`, revive HP, `matk` + lifesteal all
  exist in `petBuff`/`petPassive`.
- None of them is a "strictly better Legendary": each is capped at the same 5%–10%
  ladder (12% only on the boss-damage one, paid for by being dead weight outside raids).
- Sprite direction for the sheets (to be rendered from the native ACT/SPR, not painted):
  each keeps its native palette and silhouette; the "Mythic" read comes from the aura
  ring the pet panel already draws in the mutation colour, not from new pixels.

## Cost

| Work | Effort |
| ---- | ------ |
| Five native atlases (`export.go` + `build_pet_sprites.py`) | art pipeline run, ~40 files per species |
| Rarity 4 in `RN`/`RCL`/`MUT`/`MC` + save repair | small, but must keep indices 0–19 untouched |
| Raid drop roll + compendium/panel rows | small, client-side only |
| Tests (`pet_sim`, `pet_sprites_sim`, `raid_sim`, `save_load_sim`) | extend existing suites |

Blocked on: **art**. The pinned renderer and the original ACT/SPR sources are not
reachable from this environment (only npm/PyPI/GitHub are), so the five sheets have to be
produced by the normal pet-pack run before any of the code above can ship.

## Decision needed

1. Approve the five species above, or swap any of them.
2. Approve the drop rate (1.5% per sanctum clear, 4% on the first clear).
3. Confirm the rarity name **Mythic** (it collides with the existing item rarity ladder
   `N / N+ / Mythic` in gear — the pet band could be **Mythic** or **Raidbound**).
