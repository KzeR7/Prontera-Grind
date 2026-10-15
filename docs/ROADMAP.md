# Horizon Haven — Future Progression Roadmap

> **Document purpose:** Strategic development roadmap for the post-Base Lv 150 endgame
> expansion. This document captures design decisions, progression mechanics, system
> architectures, and item economies for future implementation.

---

## 1. Executive Summary & Design Vision

Currently, Horizon Haven (Prontera Grind) caps progression at **Base Lv 150** with Transcendent
Job Lv 50, standard stats capped at 120, 10 core maps (Prontera through Abyss), two tiers of
Nightmare fields (N at Lv 120+, N+ at Lv 140+), and Endless Echo as a 3-minute single-dummy DPS
trial.

This roadmap outlines the next major evolutionary phase:
1. **3rd Job Advancement ("Trans-Awakening")** at **Base Lv 150 & Job Lv 50**.
2. **Post-Lv 150 Ascension Stats** (a dedicated attribute box for endgame combat scaling).
3. **Two New High-Level Maps (Maps 11 & 12)** featuring a dual-material drop loop (Items A & B).
4. **The Boss Map ("Sanctuary of the Fallen")** with targeted summoning and a Randomized Roulette Boss.
5. **Weapon Ascension to Mythic Rarity** (transforming +10 N+ weapons into endgame powerhouses).
6. **Endless Tower (50-Floor Gauntlet)** providing multi-wave mob survival and boss rush challenges.

```
                      ┌──────────────────────────────────────┐
                      │ Base Lv 150 & Transcendent Job Lv 50 │
                      └──────────────────┬───────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      ┌─────────────────────────┐                 ┌─────────────────────────┐
      │   3rd Job Advancement   │                 │  Ascension Stats Box    │
      │  (Job Lv 1-50, 3 Skills)│                 │ (Boss %, Haste, Def, HP)│
      └────────────┬────────────┘                 └────────────┬────────────┘
                   │                                           │
                   └─────────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Two New Maps (Maps 11 & 12)       │
                      │ Astral Citadel & Thor Volcano Fields │
                      └──────────────────┬───────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
            ┌─────────────────────────┐     ┌─────────────────────────┐
            │   Item A (Common Drop)  │     │   Item B (Rare Drop)    │
            │ Craft Skill Bonus Glyphs│     │ Summon Ticket / Branch  │
            └─────────────────────────┘     └────────────┬────────────┘
                                                         │
                                                         ▼
                                            ┌─────────────────────────┐
                                            │      The Boss Map       │
                                            │ Sanctuary of the Fallen │
                                            │ (Targeted / Roulette)   │
                                            └────────────┬────────────┘
                                                         │
                                                         ▼
                                            ┌─────────────────────────┐
                                            │     Ascension Cores     │
                                            │ Transform N+ -> Mythic  │
                                            └─────────────────────────┘
```

---

## 2. 3rd Job Advancement ("Trans-Awakening")

### Unlock Requirements
* **Base Level:** 150 (max base level cap).
* **Job Level:** 50 in current Transcendent class (Lord Knight, High Wizard, Sniper, Assassin Cross, High Priest, Whitesmith).
* **Advancement Quest / Rite:** "Crucible of the Valkyrie" (interact with the Class Tree panel once both conditions are met).

### Job Level Ladder
* 3rd Jobs feature their own dedicated **Job Level 1 to 50** progression.
* Each 3rd Job level grants **1 Skill Point** (50 points total) to allocate into 3rd Job signature skills and passives.

### The 6 Class Lines

| Transcendent Job | 3rd Job Class | Archetype & Combat Identity |
|---|---|---|
| **Lord Knight** | **Rune Knight** | Draconic power, runestone enchantments, and massive sweeping flame burst. |
| **High Wizard** | **Warlock** | Cataclysmic elemental spellweaving, multi-target bouncing arcs, and meteor storms. |
| **Sniper** | **Ranger** | Fullscreen arrow barrages, lethal single-target marksman shots, and wolf companion strikes. |
| **Assassin Cross** | **Guillotine Cross** | Rapid multi-hit execution strikes, high-momentum spinning blades, and shadow dashes. |
| **High Priest** | **Arch Bishop** | Devastating sacred holy light rays, radial exorcism shockwaves, and party sustain auras. |
| **Whitesmith** | **Mechanic** | Heavy whirling axe devastation, explosive cart artillery, and armor-buffing thermal shields. |

### Signature 3rd Job Skills (3 per Class)
Designed specifically around Horizon Haven's batch combat execution (max 3 batch, 1.5s gap, cooldown-based, no SP pool):

#### 1. Rune Knight
* **Ignition Break** *(Active Strike · Cooldown: 4.0s · Shape: Radial)*
  Ignites weapon with intense dragon heat, detonating an explosive shockwave hitting all enemies in the lane for heavy physical damage.
* **Dragon Breath** *(Active Strike · Cooldown: 5.5s · Shape: Frontal Cone)*
  Unleashes a cone of fiery draconic flame. Damage scales directly with character Max HP and Base Level.
* **Runestone Mastery** *(Active Buff · Cooldown: 14.0s · Duration: 12.0s)*
  Crushes an ancient runestone, granting an absorption barrier equal to 20% Max HP and granting weapon attacks 15% armor penetration.

#### 2. Warlock
* **Chain Lightning** *(Active Spell · Cooldown: 3.5s · Shape: Bouncing Target)*
  Discharges high-voltage lightning at the primary target that leaps to up to 3 additional nearby enemies, dealing escalating damage per bounce (+15% per jump).
* **Crimson Rock** *(Active Spell · Cooldown: 6.0s · Shape: Splash Impact)*
  Summons a colossal burning meteor that crashes onto the battlefield, dealing massive magic damage with a guaranteed 1.0s stun and 3.0s burn DoT.
* **Reading Spellbook** *(Active Buff · Cooldown: 15.0s · Duration: 12.0s)*
  Pre-casts complex arcane incantations, reducing skill batch recovery gap from 1.5s to 1.2s and shortening all magic cooldowns by 15%.

#### 3. Ranger
* **Arrow Storm** *(Active Strike · Cooldown: 5.0s · Shape: Full-Lane Volley)*
  Fires a relentless storm of arrows into the sky, raining physical destruction down upon every monster currently active in the lane.
* **Aimed Bolt** *(Active Strike · Cooldown: 3.0s · Shape: Single Target)*
  Takes precise aim at a single foe, delivering high-velocity armor-piercing damage. Deals +35% bonus damage against Bosses and immobilized targets.
* **Warg Strike** *(Passive Proc · Cooldown: Internal 1.0s)*
  Basic attacks and skills have a 25% chance to call down an ethereal spirit wolf to bite the target for unmitigated physical damage.

#### 4. Guillotine Cross
* **Cross Impact** *(Active Strike · Cooldown: 3.0s · Shape: Single Target)*
  Slips behind the enemy to deliver a blinding 7-hit assassination flurry with high critical strike scaling.
* **Rolling Cutter** *(Active Strike · Cooldown: 2.0s · Shape: Radial)*
  Spins violently with dual daggers or katar, slicing all adjacent enemies. Each consecutive cast within 4 seconds adds 1 momentum stack (up to 5 stacks, +15% damage per stack).
* **Dark Illusion** *(Active Gap-Closer · Cooldown: 4.5s · Shape: Single Target)*
  Dissolves into shadows and reappears at the target's flank, delivering an immediate strike and granting +25% Critical Chance for 3.0 seconds.

#### 5. Arch Bishop
* **Adoramus** *(Active Spell · Cooldown: 3.5s · Shape: Single Target)*
  Focuses a beam of blinding sacred sunlight upon an enemy, dealing heavy holy magic damage and reducing the target's attack speed and movement by 30% for 3 seconds.
* **Judex** *(Active Spell · Cooldown: 2.5s · Shape: Radial)*
  Emits a divine shockwave outward from the caster, dealing holy magic damage to all nearby enemies (amplified by 50% against Undead and Demon monsters).
* **Sacrament & Coluseo** *(Active Buff · Cooldown: 16.0s · Duration: 12.0s)*
  Invokes divine protection, regenerating 1.5% Max HP every second and accelerating skill cooldown recovery by 10%.

#### 6. Mechanic
* **Axe Tornado** *(Active Strike · Cooldown: 3.5s · Shape: Radial)*
  Spins a heavy two-handed axe or mace to generate a localized whirlwind, dragging nearby enemies inward and dealing heavy physical damage.
* **Cart Cannon** *(Active Strike · Cooldown: 3.0s · Shape: Splash Ranged)*
  Fires explosive artillery munitions from the reinforced pushcart, dealing heavy ranged physical splash damage with high knockback.
* **Overheat Buffer** *(Active Buff · Cooldown: 14.0s · Duration: 12.0s)*
  Channels thermal exhaust into offensive kinetic output. Absorbs 10% of incoming damage and converts it into bonus flat ATK (up to +25% total ATK).

### Visual & Sprite Strategy
* **Phase A — Mechanics & Aura (Immediate implementation):**
  - Character advances to 3rd Job in the Class Tree.
  - Character receives an animated glowing **Ascension Aura** beneath their feet / around their sprite.
  - New skills use custom **Afterglow V6 Canvas choreography** matching the existing 75-skill pipeline.
  - Existing native male/female class bodies and wardrobe accessories remain 100% functional.
* **Phase B — Full 3rd Job Native Bodies:**
  - When the 8-directional native ACT/SPR assets for Rune Knight, Warlock, Ranger, Guillotine Cross, Arch Bishop, and Mechanic are processed, characters seamlessly upgrade to distinct 3rd job body sprites.

---

## 3. Post-Lv 150 "Ascension Stats" System

### The Concept
Standard base stat allocation caps at 120 (costing 2,790 points out of 2,811 available at Base Lv 150). Rather than endlessly inflating primary stats, reaching Base Lv 150 unlocks a separate **Ascension Stats Panel** ("Ascension Attributes" / "Valkyrie Grace").

### How Ascension Points Are Earned
1. **Overflow EXP:** Every full level bar earned past Base Lv 150 awards 1 Ascension Stat Point.
2. **Boss Map First-Clears:** Defeating unique MVPs in the Boss Map awards bonus Ascension Points.
3. **Endless Tower Milestones:** Every 10 floors cleared in Endless Tower awards Ascension Points.

### The 6 Ascension Attribute Nodes

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                         ASCENSION ATTRIBUTES                           │
 ├────────────────────────────────────────────────────────────────────────┤
 │ [🗡️] Boss Slayer       : +1.0% MVP / Boss Damage per rank (Cap: 30)     │
 │ [🌾] Mob Annihilator   : +1.2% Field Monster Damage per rank (Cap: 25)  │
 │ [⚡] Swift Haste       : -0.01s ASPD floor & +0.5% Cooldown Haste (Cap: 20) │
 │ [✨] Skill Mastery     : +1.5% 3rd Job Skill Damage per rank (Cap: 30) │
 │ [🛡️] Iron Aegis        : +0.8% All Damage Reduction (Cap: 25)          │
 │ [💖] Vitality Well     : +1.5% Max HP & +0.05% Leech Cap per rank (Cap: 20) │
 └────────────────────────────────────────────────────────────────────────┘
```

* **Boss Slayer:** Directly increases damage against Stage 10 MVPs, Stage 15 Nightmare bosses, and Boss Map encounters.
* **Mob Annihilator:** Enhances multi-mob clearing speed during field grinding and Endless Tower mob floors.
* **Swift Haste:** Shaves precious milliseconds off the 0.13s ASPD floor and trims the 1.5s skill batch gap.
* **Skill Mastery:** Scales the raw multiplier of 3rd Job skills and prolongs signature buff durations.
* **Iron Aegis:** Flat and percentage damage mitigation, crucial for surviving high-tier MVP attacks.
* **Vitality Well:** Expands total health pool and gracefully raises the rolling HP leech limit (from 2.0% up to 3.0% Max HP/sec).

---

## Current Ascension field implementation (haven-v155)

Both destinations are playable in the main battlefield with five stages each:
1–2 share a design, stage 3 and stage 4 have distinct scenery, stage 5 is the MVP.
Astral Shards and Primal Catalysts are farmed for N+ weapon evolution; Valkyrie’s
Sigils are farmed for new Ascension skill growth. Equipment does not drop here.
The material wallet and online/offline rolls work; spending recipes and skill
upgrade menus are future work. Old ten-stage saves migrate once without losing
clears or owned items. The designs below retain earlier proposals; this owner
correction supersedes their ten-stage/equipment/summoning reward assumptions.

## 4. Two New Progression Maps (Maps 11 & 12)

Visual direction studies: [Map concept review](map-concepts/README.md). These are
concept references, not implemented maps or production sprite assets.
Owner direction (15 October 2026): four shared environment designs per destination
for Stages 1–3, 4–6, 7–9 and Stage 10, with much higher scenery/mob detail.
Latest correction: Astral must be a connected floating bridge in space toward its
far-end boss; Thor ordinary fields must be natural terrain, not fighting boxes.
The owner-approved Thor boss visual design is retained.
The revised material probabilities below are provisional 100× reductions from the
initial roadmap; final rates require measured farming-throughput validation.

These two maps bridge the gap beyond Map 10 (Abyss) and provide the foundational farming loop for 3rd Job skills, boss summoning, and weapon ascension.

### Map 11: Astral Citadel (Ruins of the Fallen Citadel)
* **Theme:** One continuous floating bridge through space, passing ruined celestial architecture and widening into a boss sanctuary at its far end. Stage groups are zones along the same route, not disconnected platforms.
* **Level Recommendation:** Base Lv 140–150 (Transcendent & Awakening progression).
* **Environment Palette:** Sky: `#18122B`, Ground: `#393053`, Ruins: `#443C68`, Accent: Celestial Lavender `#A7727D`.
* **Monster Roster:**
  1. *Retribution Angel* (Celestial winged fighter)
  2. *Despair Phantom* (Ghostly hovering spectre)
  3. *Tower Watcher* (Ancient arcane automaton)
  4. *Death Whisperer* (Dark cultist caster)
  5. *Agony Demon* (Heavy horned bruiser)
* **Stage 10 MVP Boss:** **Memory of Thanatos**
  - *Abilities:* Wide-cleaving sword slashes, periodic armor break, and shadowy phantom mirrors.

### Map 12: Thor Volcano / Magma Core (The Primal Forge)
* **Theme:** Deep subterranean lava chambers, glowing magma cascades, black basalt rock, and extreme heat.
* **Level Recommendation:** Base Lv 150+ (Ascension & Mythic progression).
* **Environment Palette:** Sky: `#220901`, Ground: `#3B1408`, Magma pools: `#F74116`, Accent: Cinder Gold `#F39E36`.
* **Monster Roster:**
  1. *Magma Slag* (Fiery ooze blob)
  2. *Fire Imp* (Agile flying cinder demon)
  3. *Kasa* (Blazing winged avian warrior)
  4. *Salamander* (Heavy armored reptilian fire-beast)
  5. *Obsidian Golem* (Towering rock giant infused with molten veins)
* **Stage 10 MVP Boss:** **Ifrit**
  - *Abilities:* Screen-shaking meteor showers, blazing fire ring explosions, and an enraged fire aura.

---

## 5. The Dual-Material Drop & Crafting Loop (Items A & B)

Monsters in Maps 11 and 12 drop two vital materials that feed the entire endgame economy:

```
    [Mobs in Map 11 & 12]
          ├── Common Drop (~0.035%)  ──> [Item A: Astral Shard / Primal Catalyst]
          │                                  │
          │                                  ▼
          │                            Craft [Class Skill Glyphs]
          │                            (Permanent Skill Enhancements)
          │
          └── Rare Drop (~0.0025%)   ──> [Item B: Valkyrie's Sigil / Ancient Blood]
                                             │
                                             ▼
                                       Consume in [The Boss Map]
                                             │
                                             ▼
                                       Defeat MVP Bosses
                                             │
                                             ▼
                                       [Ascension Cores]
                                             │
                                             ▼
                                       Transform [N+ Weapon] -> [Mythic Weapon]
```

### 1. Item A: "Astral Shard" (Map 11) / "Primal Catalyst" (Map 12)
* **Drop Rate:** Standard uncommon drop (~0.035% per monster kill).
* **Purpose:** Crafting **Class Skill Glyphs (Item A)** in the Black Market.
* **Skill Glyph Mechanics:**
  - Glyphs are permanent consumable socket enchants or talent unlockers that augment specific 3rd Job skills.
  - *Examples:*
    - *Glyph of the Dragon:* Increases Dragon Breath cone angle by 30% and adds +10% Max HP scaling.
    - *Glyph of Arcanum:* Chain Lightning bounces 1 additional time (+4th bounce) with no damage decay.
    - *Glyph of the Windrunner:* Arrow Storm critical strike chance increased by +15%.
    - *Glyph of the Shadow:* Rolling Cutter momentum stacks now decay one by one instead of all at once.

### 2. Item B: "Valkyrie's Sigil" / "Blood of the Ancients"
* **Drop Rate:** Rare drop (~0.0025% from normal mobs, 0.1% chance from Stage 10 MVPs; not guaranteed).
* **Purpose:** Serves as the key currency required to enter and summon bosses inside **The Boss Map**.

### 3. Boss Drop: "Ascension Cores" (Mythic Essence)
* **Source:** Dropped exclusively by MVPs inside Maps 11/12 and The Boss Map.
* **Purpose:** The vital catalyst required for **Weapon Ascension** to Mythic rarity.

---

## 6. The Boss Map ("Sanctuary of the Fallen" / "Valkyrie's Crucible")

A dedicated instanced arena accessible directly from the World Map navigation dock. No 9-stage trash mob farming required—pure, high-stakes MVP combat.

### Entry Requirements
* Consumes **1× Item B** (Valkyrie's Sigil) per boss encounter.

### Two Battle Modes

#### Mode 1: Targeted Boss Summoning
* Choose any unlocked MVP from your Monster Index roster (e.g. Baphomet, Lord of Death, Dark Lord, Memory of Thanatos, Ifrit).
* The boss spawns immediately with its authentic escorts and behaviors.
* **Player Value:** Enables focused card hunting, specific weapon drop farming, and targeted material collection without clearing standard stages.

#### Mode 2: Randomized Roulette Boss (Wheel of Fate)
* Spin the Roulette Wheel! Spawns a randomly selected MVP enhanced with a dynamic combat mutator.
* **Roulette Mutators:**
  - 👑 **Twin Titans:** Spawns two distinct MVPs at once (e.g. Baphomet + Drake) with +100% bonus rewards.
  - ⚡ **Frenzied Rage:** Boss has +40% Attack Speed and +30% ATK, but drops 2× Ascension Cores.
  - 💎 **Golden Jackpot:** Guaranteed double card drop rate and 5× Zeny payout.
  - 🛡️ **Iron Fortress:** Boss has +50% DEF/MDEF and shields; defeating it awards 3× Ascension Stat points.
  - 🌪️ **Chaos Swarm:** Boss summons continuous waves of aggressive mini-bosses; surviving awards a rare Card Mastery Token.

---

## 7. Weapon Ascension — The Mythic Rarity Tier

### Overview
Transcending Tier 5 (N+) Nightmare weapons into the ultimate **Mythic Rarity (Prismatic / Red border)**.

```
       [+10 N+ Weapon]
             +
       [30× Ascension Cores] (from Boss Map / Maps 11 & 12 MVPs)
             +
       [50× Nightmare Materials] (nmMat)
             +
       [10,000,000 Zeny]
             │
             ▼
       [✨ Mythic Ascended Weapon ✨]
```

### Mythic Weapon Properties
1. **Base Stats:** 35% higher base ATK / MATK scaling compared to N+ gear.
2. **Preserved Progress:** Retains existing +10 refinement, socketed cards, and protected reforge affixes.
3. **4th Affix Socket:** Unlocks a fourth affix roll slot with higher maximum value caps.
4. **Innate Mythic Unique Passive:** Each weapon family rolls or carries a unique combat passive:
   - *Sword / Spear:* Chance on hit to summon an orbital sword barrage dealing 250% AoE damage.
   - *Staff:* Elemental spells have a 10% chance to refund their batch cooldown immediately.
   - *Bow:* Critical hits apply a 5-second bleed dealing 15% of critical damage per second.
   - *Katar / Dagger:* Critical strikes ignore 25% of target DEF and generate a temporary movement burst.
   - *Axe / Mace:* Basic attacks have a chance to trigger an armor-crushing stun wave.
5. **Mythic Refine Glow:** At +10, radiates a vivid prismatic / crimson energy trail during attack animations.

---

## 8. Endless Tower (50-Floor Vertical Gauntlet)

A long-form endurance dungeon mode that complements Endless Echo (single dummy trial) and the Boss Map.

### Structure & Progression
* **50 Total Floors:** Divided into 5-floor sectors.
  - **Floors 1–4, 6–9, etc.:** Multi-mob swarms with random champion affixes (*Swift*, *Vampiric*, *Armored*).
  - **Floor 5, 15, 25, 35, 45:** Mini-Boss chambers (Ghostring, Angeling, Deviling, Mutant Dragon).
  - **Floor 10, 20, 30, 40, 50:** Climactic MVP Boss chambers (Drake $\rightarrow$ Eddga $\rightarrow$ Baphomet $\rightarrow$ Lord of Death $\rightarrow$ Naght Sieger).
* **Floor Timer:** 75 seconds per floor. Failure to clear within the time or character death ends the ascent.
* **Persistent Checkpoints:** Reaching Floor 10, 20, 30, 40, and 50 unlocks permanent elevator checkpoints, allowing players to resume or quick-sweep completed sectors weekly.

### Tower Rewards
* **First-Clear Floor Caches:** Generous one-time rewards per 10 floors (Zeny caches, Oridecon/Elunium bundles, Refine Protection Scrolls, and Legendary Card Vouchers).
* **Repeatable Currency ("Tower Emblems"):** Traded in the Tower Exchange for Item B summon sigils, Ascension Stat point vouchers, and exclusive cosmetic headgears.

---

## 9. Technical Architecture & Save Schema Integration

To ensure seamless backward compatibility with existing saves and maintain all test harness invariants:

### Save State Extensions (`S`)
```javascript
// Additions to fresh() and repairProgression()
{
  // 3rd Job & Ascension state
  ascension: {
    unlocked: false,      // true when Base Lv 150 & Transcendent Job Lv 50 rite completed
    points: 0,           // available Ascension Stat Points
    spent: 0,            // total points invested
    stats: {
      bossDmg: 0,        // Boss Slayer rank
      mobDmg: 0,         // Mob Annihilator rank
      haste: 0,          // Swift Haste rank
      skillMastery: 0,   // Skill Mastery rank
      ironAegis: 0,      // Iron Aegis rank
      vitalityWell: 0    // Vitality Well rank
    }
  },

  // 3rd Job Skills (retains existing SKILLS structure and skill batching)
  // Saved under existing S.jobs[className] and S.sk[skillId]

  // Boss Map & Summoning
  bossSummon: {
    sigils: 0,           // Count of Item B (Valkyrie Sigils)
    rouletteStreak: 0,   // Consecutive roulette clears
    cleared: {}          // First-clear ledger for targeted bosses
  },

  // Mythic gear support
  // Existing gear tier expands: 0=Novice, 1=1st Job, 2=2nd Job, 3=Trans, 4=N, 5=N+, 6=Mythic
}
```

### Safety & Balance Guarantees
1. **Existing Save Invariant:** Old saves load cleanly without errors; unreached requirements default safely (`ascension.unlocked = false`).
2. **Combat Damage Balance:** 3rd job skill multipliers and Ascension stats are guarded by extending `skill_balance_sim.js` and `progression_sim.js` fixtures to include benchmark 3rd job profiles.
3. **Gear Identity:** Ascending an N+ weapon modifies its tier and properties in place; item IDs and socketed cards are never cloned or duplicated.
4. **Batch Execution Preservation:** 3rd job skills adhere to the 3-cast batch ceiling and 1.5s simulation gap, ensuring combat stays rhythmic and readable.

---

## 10. Suggested Phased Implementation Plan

When ready to implement, execute in these sequential milestones:

* **Milestone 1 — Two New Maps & Material Loop (Maps 11 & 12)**
  - Implement Map 11 (Astral Citadel) and Map 12 (Thor Volcano) in `MAPS` and `TH`.
  - Add mob drop tables for **Item A** (Astral Shard) and **Item B** (Valkyrie's Sigil).
  - Update World Map stage selection and navigation.

* **Milestone 2 — The Boss Map ("Sanctuary of the Fallen")**
  - Implement the Boss Map instance UI.
  - Targeted boss summoning using Item B.
  - Randomized Roulette Boss with combat mutators and bonus drop multipliers.
  - Boss drops: Ascension Cores.

* **Milestone 3 — Weapon Ascension to Mythic Rarity**
  - Add Mythic rarity tier (Tier 6) with distinct red/prismatic UI styling.
  - Black Market Ascension forge recipe (+10 N+ weapon + Ascension Cores + nmMat + Zeny).
  - 4th affix socket and unique weapon family passives.

* **Milestone 4 — 3rd Job Advancement & Skills**
  - Base Lv 150 & Transcendent Job Lv 50 unlock condition in `classBlock()` and `changeClass()`.
  - Add the 6 3rd Job classes to `CLASSES`.
  - Implement 3 signature skills per class (18 total) into `SKILLS` and generate Afterglow V6 effects.
  - Character Ascension aura visual.

* **Milestone 5 — Post-Lv 150 Ascension Stats Box**
  - Implement the Ascension Attributes UI panel in Character tab.
  - Level 150 overflow EXP tracking.
  - Wire the 6 ascension nodes into combat formulas (`atk`, `matk`, `maxHp`, `aspd`, `damageTake`).

* **Milestone 6 — Endless Tower (50-Floor Mode)**
  - 50-Floor instance logic, floor timer, and wave spawner.
  - Sector elevator checkpoints (every 10 floors).
  - Tower Exchange shop and milestone caches.


### Local v146 map UI integration

Astral Citadel and Thor Volcano can now be opened from the game's World Atlas
under **Endgame exploration**, using the saved native character appearance and
lazy lossless materials. This is isolated scenery inspection while the existing
field continues farming—not a new progression unlock or implementation of the
future Maps 11/12 combat/reward systems above. Mobs remain deferred. See the
[current proposal](map-concepts/FULL-PROPOSAL.md) and
[actual in-game UI captures](map-concepts/game-ui-review/manifest.json).
