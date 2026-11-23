# Raidbound raid pets

Status **shipped in v469, signatures reworked in v470 (2026-11-22)**: the fifth tier, the prices, the
five species, their fixed signatures and the raid drop roll are in `index.html` / `assets/raid.js`. The one thing still
missing is **art**: none of the five native pet atlases is in `assets/pets/v1/` yet, and the drop
path refuses any species whose atlas is not in the shipped catalog, so the roll is dormant — it
turns itself on the moment the pet pack lands. It supersedes
`docs/proposals/mythic-raid-pets.md` (v467), which is kept for the record.

## What the owner decided (v468–v469)

| # | Decision | Answer in this document |
| - | -------- | ----------------------- |
| 1 | Tier name | **Raidbound** — not "Mythic". "Mythic" stays the gear affix ladder (N / N+ / Mythic), so the two never collide in a log line or a tooltip. |
| 2 | Drop rate | **10% per clear**, exactly the band the Raid Boss Card and the exclusive Raid Title already use. No first-clear bonus, no separate 1.5%/4% ladder. |
| 3 | Signature skill | A **fixed passive**, one per species, the same shape as every other signature (`petPassive`). It is not rolled and cannot be swapped. |
| 4 | Active skills | **Random, as today.** A Raidbound pet arrives with one rolled skill and rolls its second slot with the ordinary skill gacha. The six actives added in v468 are in that pool. |
| 5 | Price | **Exactly ×2 Legendary** on all three sinks — mutation roll, skill gacha and the training/upgrade step. Numbers in "Cost" below. |

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

## Cost (owner: **×2 Legendary**, exactly)

Legendary prices already carry the v90 doubling, so Raidbound is stated on top of them rather than
inherited from the `1+r` ladder (which would make Raidbound *cheaper* than Legendary: 12,500 vs
20,000). The shipped tables are literal ladders, one entry per rarity, so the lower rows cannot
drift:

```js
PET_STEP_X  = [1, 1, 1, 2, 4]                                  // peqCostOf multiplies peqCost(t)
PET_ROLL_X  = [2500, 5000, 7500, 20000, 40000]
PET_GACHA_X = [2000, 4000, 6000, 16000, 32000]
```

| Price | Common (r0) | Rare (r1) | Epic (r2) | Legendary (r3) | **Raidbound (r4)** |
| ----- | ----------- | --------- | --------- | -------------- | ------------------ |
| Mutation roll `rollCost` | 2,500 | 5,000 | 7,500 | 20,000 | **40,000** |
| Skill gacha `petSkillCost` | 2,000 | 4,000 | 6,000 | 16,000 | **32,000** |
| Upgrade step 1 `peqCostOf(t=0)` | 1,200 | 1,200 | 1,200 | 2,400 | **4,800** |
| Upgrade step 5 `peqCostOf(t=4)` | 30,000 | 30,000 | 30,000 | 60,000 | **120,000** |
| Full 5-step ladder (1,200·Σ(t+1)²) | 66,000 | 66,000 | 66,000 | 132,000 | **264,000** |

## Signatures, v470 (owner: "more unique like skill damage +10%, reduce enemy defence")

The first pass spread 25 species over **nine** families, which read as five re-skins of "+5–10% to a
stat". They are now spread over **sixteen**, seven of which are new mechanics rather than a bigger
number, and **no two species share a key set** (pinned in `pet_sim`):

| Family | Effect (5% at Bond 0 → 10% at Bond 5) | Where it is read | First carried by |
| ------ | -------------------------------------- | ---------------- | ---------------- |
| `atk` | +% ATK | `atk()` | Nine Tail · Deviling · Eddga |
| `matk` | +% MATK | `matk()` | Spore · Void Whisper |
| `skdmg` | +% **skill** damage (never basic attacks) | skill hit formula | Sohee · Seraph · Ifrit |
| `critdmg` | +% **critical** damage | `critD()` | Deviruchi · Nine Tail |
| `aspd` | +% attack speed (shorter interval) | `aspd()` | Yoyo |
| `pen` | ignores % of the target's armour | `applyStarAndBossArmor()` | Poporing · Thanatos · Warden |
| `flee` | +% Flee, inside the existing cap | `flee()` | Smokie · Ghostring |
| `hp` / `dr` | +% Max HP / % less damage taken | `maxHp()`, incoming hit | Angeling, Fabre, … |
| `boss` | +% damage to MVPs and your pets' damage to them | both damage paths | Baphomet Jr. |
| `petdmg` | +% damage for every fighting pet | `petDmg()` | Wolf · Deviling · Ifrit |
| `move` | +% movement speed | `moveSpd()` | Peco Peco · Eddga |
| `zeny` / `exp` / `gear` / `ore` | economy families | kill rewards, drops | Poring, Lunatic, … |

Every family is read by a formula that already existed, so nothing bypasses a cap: Flee still clamps
at 60/80%, attack speed keeps its floor, armour penetration only scales the armour a raid boss
already has (50%), and every value is still inside the owner's "no buff above 10%" rule.
`pet_sim` fails if a family loses its hook (a passive that shows but does nothing) or if two species
end up with the same signature.

## The five candidates

Each is a native RO monster sheet that has no pet atlas yet, chosen so the art reads at pet scale
and the signature is a *raid* reading of an effect family `petPassive` already implements.

Indices 20–24, in this order (the order is the save format — append only):

| # | Pet (`PETS` index) | Sheet | Home raid | Signature passive (Bond 0 → Bond 5) | Suggested actives |
| - | ------------------ | ----- | --------- | ------------------------------------ | ----------------- |
| 20 | **Abyssal Thanatos** | Memory of Thanatos (1708) | Astral Citadel | **Extinction Echo** `boss+pen` — +5→10% damage to MVPs and raid bosses, **and your hits ignore 5→10% of their armour** | `piercingfang` + `soulrend` |
| 21 | **Astral Seraph** | Retribution Angel (1831) | Astral Citadel | **Sanctum Grace** `hp+skdmg` — +5→10% Max HP **and +5→10% skill damage** | `vital` + `arcane` |
| 22 | **Ifrit Ember** | Ifrit (1832) | Thor Volcano | **Primal Heat** `petdmg+skdmg` — +5→10% damage for every fighting pet **and +5→10% skill damage** | `flameburst` + `warcry` |
| 23 | **Obsidian Warden** | Obsidian Golem (1833) | Thor Volcano | **Sanctum Bulwark** `dr+pen` — 5→10% less damage taken **and your hits ignore 5→10% of the target's armour** | `guardingchirp` + `vital` |
| 24 | **Void Whisper** | Death Whisperer (1837) | Thor Volcano | **Soul Tithe** `exp+matk` — +5→10% EXP and Job EXP **and +5→10% MATK** | `spiritbolt` + `siphon` |

Only the signature is fixed. The two active slots are still rolled — the panel's "Suggested
pairing" line is a hint written for the species, not a grant, and the odds are untouched.

### How to use each one

- **Abyssal Thanatos — the boss killer.** `Extinction Echo` raises boss damage *and* strips armour,
  and raid bosses are the only targets that carry any (the sanctum boss sits at 50%, so 10% armour
  penetration is worth about +11% real damage on top of the +10%). It is the strongest single raid
  pick; on trash it is a blank slot. Deploy it **only for a raid or an
  MVP hunt**; on trash it is a blank slot. Pair it with `piercingfang` (armour-piercing single
  target) and `soulrend`, and keep it on `on` for the whole clear — the passive is unconditional
  while the raid is running.
- **Astral Seraph — the survival pick that also casts.** `Sanctum Grace` is Max HP **plus skill
  damage**, so it is the one defensive pet that still pays on a magic or skill-rotation build. Best on the Astral Citadel's later phases or
  on any class that has no self-heal; `vital` stacks another Max HP roll on top and `arcane` adds
  the magic damage a light-armour build is short of. Turn it on for progression attempts, off once
  the fight is on farm and you want damage instead.
- **Ifrit Ember — the pet-damage multiplier.** `Primal Heat` adds +5–10% to *every* fighting pet
  **and** +5–10% to your own skills, so it is the pick for a three-pet party that also casts. Deploy it as the **second and third
  slot** of a multi-pet party (three pets on: it is worth up to 3× its own number), and pair it
  with `flameburst`/`warcry` for an AoE + attack-buff rotation. It is the wrong choice for a solo
  one-pet setup.
- **Obsidian Warden — the tank's pet.** `Sanctum Bulwark` is damage reduction *plus* armour
  penetration: it keeps you alive and still chips the sanctum boss. Use it on melee/frontline classes
  that already stack DEF (percentage reduction on a high-DEF build is the largest effective-HP
  gain), with `guardingchirp` + `vital` to push the same direction; swap it out for Ifrit Ember
  once a fight is safe.
- **Void Whisper — the levelling pet, not the raid pet.** `Soul Tithe` is EXP/Job EXP plus MATK, so
  it pays out in **dense trash farming and alts** and still adds magic damage while you are there. Deploy it whenever the
  goal is levels or Job points (Field stages, grind maps) and park it during raids; `spiritbolt` +
  `siphon` keeps a magic class alive while it soaks EXP.

Design notes:

- Signatures are read by hooks that already existed in the formulas (see the family table below), so
  no new combat rule and no new cap is invented.
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

Blocked on: **art only**. The pinned renderer and the original ACT/SPR sources are not reachable
from this environment (only npm/PyPI/GitHub are), so the five sheets have to come from the normal
pet-pack run. Every line of code above is already shipped; `petArtShipped()` gates the drop on the
catalog, so the tier goes live the moment `assets/pets/v1/thumb-<spriteId>.png` and its atlas exist
and `assets/pet-catalog.json` lists them.

## Open questions

1. Art: run the pet pack for the five sheets, or swap a species before it is cut.
2. Nothing else is open — species, price (×2) and the per-clear drop were decided in v469.
