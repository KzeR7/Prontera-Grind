# Raidbound raid pets — proposal (not implemented)

Status: design proposal for owner review. **No pet species, save field, sprite sheet or drop
table has been changed by this document.** It supersedes
`docs/proposals/mythic-raid-pets.md` (v467), which is kept for the record.

## What the owner decided (v468)

| # | Decision | Answer in this document |
| - | -------- | ----------------------- |
| 1 | Tier name | **Raidbound** — not "Mythic". "Mythic" stays the gear affix ladder (N / N+ / Mythic), so the two never collide in a log line or a tooltip. |
| 2 | Drop rate | **10% per clear**, exactly the band the Raid Boss Card and the exclusive Raid Title already use. No first-clear bonus, no separate 1.5%/4% ladder. |
| 3 | Signature skill | A **fixed passive**, one per species, the same shape as every other signature (`petPassive`). It is not rolled and cannot be swapped. |
| 4 | Active skills | **Random, as today.** A Raidbound pet arrives with one rolled skill and rolls its second slot with the ordinary skill gacha. The six actives added in v468 are in that pool. |
| 5 | Price | **A little more expensive than Legendary** — not a wall. Exact numbers in "Cost" below: ×1.5 on every Legendary price. |

## What exists today (the ladder the new tier has to extend)

- `PETS` in `index.html` holds **20 species, 5 per rarity**, rarities
  `RN=['Common','Rare','Epic','Legendary']` at indices 0–3. A save stores the roster index, so a
  fifth rarity must be **appended** (indices 20–24) and rarities 0–19 must not move.
- Rarity drives four things: `petDmg`'s `[.2,.32,.55,1][r]`, `petInt`'s `1.7-r*.15`, the mutation
  roll price `2500*(1+r)` and the skill gacha `2000*(1+r)`, and the `RCL`/`MC` colour tables.
- Legendary (`r===3`) doubles all three prices (v90).
- A pet is never hatched: it drops from a monster. Duplicates fold into Bond.
- Every pet's art is a native 256×256 atlas in `assets/pets/v1/` cut from the original ACT/SPR by
  `export.go` + `tools/build_pet_sprites.py`. **No recolour, no repaint, no invented frame.**

## What "Raidbound" needs beyond a fifth tier

1. `RN`/`RCL`/`MUT`/`MC`/`PET_SKILL_WEIGHTS` gain a fifth entry. `petDmg`'s rarity factor gains a
   fifth term (see "Balance" — it is **1.0, not 1.4**: a Raidbound pet does Legendary-grade
   damage, and its edge is the signature plus a slightly faster interval).
2. `PETS` gains five appended entries (indices 20–24). Nothing is renumbered; the save repair keeps
   rejecting unknown indices as it always has.
3. `assets/pets/v1/` gains five species atlases + thumbnails and the catalog version bump that
   `pets.js` validates (SHA-256 per file, 1 MiB per atlas, 4 MiB decoded).
4. One raid-only drop path in `assets/raid.js`, **inside the existing `if (cleared)` block**, right
   after the boss-card roll and before the title roll:

   ```js
   // 10% Raidbound pet drop — the same band as the Raid Boss Card (1) and the Raid Title (2).
   // Client-side loot: no new DO message, no alarm, no extra WebSocket traffic.
   if (typeof PET_RB_POOL !== 'undefined' && Math.random() < 0.10) { … grantPet(speciesIndex) … }
   ```

   The pool is per dungeon (Astral Citadel / Thor Volcano), mirroring `dng.bossCardKey`, so each
   raid keeps its own trophies. A duplicate folds into Bond like any other pet drop.
5. Pet panel: a fifth rarity band with a raid badge on the tile, and the compendium row.

## Balance (the owner's "a little")

| Lever | Legendary (today) | Raidbound (proposed) | Effect |
| ----- | ----------------- | -------------------- | ------ |
| `petDmg` rarity factor | `1` | `1.0` | same hit as a Legendary — the trophy is not a stat cliff |
| `petInt` interval | `1.7-3*.15 = 1.25` | `1.7-4*.15 = 1.10` | **12% faster** attacks (~+13% DPS) |
| Signature | rolled two-slot skills only | **fixed passive**, raid-scoped | the actual reason to own one |
| Mutation ladder `MUT` | `1,2,4,6,8,18,38` | unchanged | grade growth is shared by every rarity |
| Bond ladder | 5% → 10% | unchanged | |

Measured against `tools/tests/pet_sim.js`: a maxed Legendary sits at **0.736×** the illustrative
rotation inside the 0.22–0.30× band. A 13% interval gain on the same numbers lands ≈0.83×, still
far under the pinned ceiling, so no existing DPS budget moves.

## Cost (owner: "a little more expensive", not a wall)

Legendary prices are the baseline (they already carry the v90 ×2). Raidbound pays **×1.5 on top of
Legendary**, which is +200% over an Epic and +50% over a Legendary:

| Price | Common (r0) | Rare (r1) | Epic (r2) | Legendary (r3) | **Raidbound (r4)** |
| ----- | ----------- | --------- | --------- | -------------- | ------------------ |
| Mutation roll `rollCost` | 2,500 | 5,000 | 7,500 | 20,000 | **30,000** |
| Skill gacha `petSkillCost` | 2,000 | 4,000 | 6,000 | 16,000 | **24,000** |
| Upgrade step 1 `peqCostOf(t=0)` | 1,200 | 1,200 | 1,200 | 2,400 | **3,600** |
| Upgrade step 5 `peqCostOf(t=4)` | 30,000 | 30,000 | 30,000 | 60,000 | **90,000** |
| Full 5-step ladder | 67,200 | 67,200 | 67,200 | 134,400 | **201,600** |

Formula: `rollCost = 2500*(1+r)*2*1.5`, `petSkillCost = 2000*(1+r)*2*1.5`,
`peqCostOf(t) = 1200*(t+1)²*2*1.5` for `r===4`. In code that is one more branch beside the existing
`r===3?2:1`, so the Common→Legendary rows above cannot drift.

Why ×1.5 and not the ladder's own `1+r`: the raw ladder would make Raidbound **cheaper** than a
Legendary (12,500 vs 20,000), because Legendary already carries the doubling. The premium has to be
stated, not inherited.

## The five candidates

Each is a native RO monster sheet that has no pet atlas yet, chosen so the art reads at pet scale
and the signature is a *raid* reading of an effect family `petPassive` already implements.

| # | Pet | Source sheet | Signature passive (Bond 0 → Bond 5) | Rolled actives |
| - | --- | ------------ | ------------------------------------ | -------------- |
| 1 | **Abyssal Thanatos** | Memory of Thanatos (1708) | *Extinction Echo*: +6–12% damage to raid bosses and MVPs | random |
| 2 | **Ifrit Ember** | Ifrit (1832) | *Primal Heat*: +5–10% ATK, 3% of your damage repeats as fire after 1s | random |
| 3 | **Obsidian Warden** | Obsidian Golem (1833) | *Sanctum Bulwark*: 6–12% less damage taken inside a raid | random |
| 4 | **Astral Seraph** | Retribution Angel (1831) | *Sanctum Grace*: revives return with +15–30% HP, 1s shorter cooldown | random |
| 5 | **Void Whisper** | Death Whisperer (1837) | *Soul Tithe*: +5–10% MATK, each kill restores 1–2% max HP | random |

Design notes:

- Every signature is a raid-flavoured version of an existing effect family (`boss` damage, `atk`,
  `dr`, revive HP, `matk` + lifesteal). No new combat rule is invented.
- None is a "strictly better Legendary": the cap stays on the 5–10% ladder (12% only for the
  boss-damage one, paid for by being dead weight outside a raid).
- The active slots are **random**, exactly like every other pet — the v468 gacha (18 skills: 4
  buffs, 5 AoE, 5 single-target, 4 utility) is the pool. Nothing is fixed there.
- Presentation: each keeps its native palette and silhouette; the Raidbound read comes from the
  aura ring the panel already draws in the mutation colour, not from new pixels.

## Effort

| Work | Effort |
| ---- | ------ |
| Five native atlases (`export.go` + `build_pet_sprites.py`) | art pipeline run, ~40 files per species |
| Rarity 4 in `RN`/`RCL`/`MUT`/`MC` + `petDmg`/`petInt` + save repair | small; indices 0–19 untouched |
| Raid drop roll inside the existing clear block | ~15 lines, client-side only |
| Panel band + compendium rows | small |
| Tests (`pet_sim`, `pet_sprites_sim`, `raid_sim`, `save_load_sim`) | extend existing suites |

Blocked on: **art**. The pinned renderer and the original ACT/SPR sources are not reachable from
this environment (only npm/PyPI/GitHub are), so the five sheets have to be produced by the normal
pet-pack run before any of the code above can ship.

## Open questions for the owner

1. Approve the five species, or swap any of them.
2. Confirm the ×1.5 premium (mutation 30,000z / gacha 24,000z / full ladder 201,600z).
3. Confirm the drop is rolled **per clear** (as the card and title are), not per boss kill.
