# Decisions to preserve

These decisions summarize shipped behavior and recorded owner choices. They are
not authorization to expand a task. If the user changes one, update this note and
the implementation/tests together. Read the linked sources for exact details.

| Decision | Reason / implementation evidence |
| --- | --- |
| Return directly to previously played classes | The owner wanted saved builds available without repeating a Novice reset. `classBlock()` and `changeClass()` restore the class snapshot. Gear is matched by identity, not cloned. |
| Base EXP requirements increase from 100 | The owner approved the tested 50% increase to Base requirements from Lv100. Job requirements, contract rewards and the measured offline EXP/min rule keep their existing formulas. See `baseNeedAt`, `needAt` and `base_pacing_sim.js`. |
| Ordered six-slot combos with recovery | Attacks cast once in player-selected order from the active class line, then recover for 3 seconds. Between-skill swings follow ASPD visually but deal no normal-attack damage or on-hit effects (owner decision, 17 October 2026); recovery basics still deal damage. Rolling Cutter retains its explicit repeats. Buffs and emergency healing are independent. Earlier jobs remain useful through inherited marks and follow-up effects. No Heat/SP meter. |
| Keep old IDs and save ownership | Renamed skills, appended pets, cosmetics and cloud sync must not reinterpret old progress or mix accounts. See migration, save-owner and cloud tests. |
| Pets come from drops, not hatching | Collection is part of farming. Training/Bond/skill rolls do not replace acquisition. See `PETS` and pet tests. |
| Daggers count as katars for katar skills | Owner decision (Milestone 4), to avoid problems with the Assassin Cross dagger. Skill execution does not check weapon type, so a dagger already triggers katar skills; any future weapon gate must accept a dagger wherever it accepts a katar. Guillotine Cross wears a katar, or a dagger in each hand, through `katarOnly()` and `dualWield()`. See `tools/tests/dual_wield_sim.js` and `tools/tests/fourth_job_skills_sim.js`. |
| Lv 150+ is an Ascension level, not Base Level | Owner clarification (Milestone 4/5). Base Level 150 and above is a separate Ascension level with its own stats; Job Level continues as normal and a later Ascension skill tab raises skill boost. The fourth-job unlock gate uses Base Lv 150; v163 adds separate Ascension tracks without extending Base Level. See `Updates/fourth-jobs/README.md`. |
| Fourth-job visuals use the latest skills and original native art | Owner approval (15 October 2026) uses five core RO skills per class (superseding the provisional three-skill package), authorizes recovery of all six native progression bodies and keeps classes locked during preparation. The fixed-look review pack does not authorize wardrobe costumes or a release. See `Updates/fourth-jobs/VISUALS.md`. |
| First fourth-job unlock requires a timed class trial | Owner decision (16 October 2026): dark arena, one matching native Biolabs opponent, 30 seconds, 3× first Astral ordinary mob HP with its original ATK (owner update, 19 October 2026). Victory, defeat and timeout show animated result wording for three real seconds in the dark room, then return automatically; victory promotes automatically on return. Leaving returns immediately. No trial rewards. Previously played classes return directly. See `tools/tests/job_rite_sim.js` and the fourth-job README. |
| Current combat limits and Ascension difficulty (v168) | Owner requests a hard 192 ASPD cap, applied after Haste and all speed sources. Ordinary/Mythic flee remains 60%/80%. Owner clarified HP reductions only: original Ascension ATK restored, bosses use 3× regular HP / 4× ATK. Owner selected +15 HIT for Astral/Thor field enemies; original maps and trial HIT retain their rules. See Game design for stage values. The v179 material wallet consolidates Nightmare materials into Void Core. |
| Discuss balance changes before implementation | Owner requests suggestions and a choice before further retuning. v170 adopts all-grade HP ×2 only; Crit and LUK remain ×1, and saved raw affixes retain their values. Consider existing Mythic gear and indirect farming/economy effects in any proposed conversion. |
| Physical headgear options at every grade (v169) | Owner extends the Mythic STR/DEX/INT/VIT/HP/ATK/MATK affix pool to all headgear grades. New rolls and paid reforges use it; saved rolls, counts and numeric ranges retain their rules. Owner subsequently approved all-grade HP ×2 with Crit/LUK ×1 after reviewing the comparisons. |
| Fourth jobs enabled for owner testing | Owner instruction (16 October 2026) explicitly unlocks all six classes, Mythic equipment, refinement and reforging. `FOURTH_JOBS_LIVE=true` in the local v160 build. No deployment implied. |
| Fourth-job wardrobe rebuilt (v179) | Owner requests fourth-job customization. Native body/hair/accessory component exports supersede v161 fixed composites in gameplay. Keep original pixels, native attachment/order/timing and world scale; all six classes support the same hairstyles, palettes and 52 accessories. The old composites remain default-look regression proofs. |
| Ascension correction (v162) | Owner requests fourth-job-only N+ evolution, set picker and eligible-item dropdown, separate Echo map tab and continuous Astral walking. v163 activates the approved stat/skill progression described below. New equipment and skill artwork remains pending. |
| Shared earned Ascension points, per-class allocation (v163) | Owner approves shared level 50, eight stats/rank 10, separate saved presets using the same earned budget; not all stats can be maxed. Class skill tracks cap at 30, six skills/rank 5. Combat EXP credits both fully; away EXP follows its saved source class at 50%. Free resets during testing. Exact bonuses and EXP/reward curves are in Game design and code; tune later. |
| Material economy and explicit progression target (v165) | Owner chooses 700 shared active hours at the 8M combat EXP/min reference; class skills retain ~87.5h. New-map bonuses stay 5–10%: EXP per HP, Zeny per kill against the matching Abyss regular/MVP. Zeny no longer scales with HP, keeping materials the main purpose. Retain existing crafting/reforge/refine prices after reducing supply. Earned levels, EXP, allocations and wallets survive. |
| Preserve original sprite art | Supplied crops and pinned native sources define the artwork. Preserve pixels, native placement, layers and action timing; do not fill gaps with invented art. See native pipeline READMEs. |
| Distinct native bodies for both genders | Current ACT/SPR wardrobe uses each gender's native body and action data. The original shared-body instruction describes only the legacy packed fallback. |
| Cosmetics preserve gameplay | Wardrobe apply/cancel/reset must retain job, equipment and progression. See wardrobe game tests. |
| Reserve future progression bodies | Rune Knight, Warlock and Guillotine Cross body replacements were removed from wardrobe. The owner declined event outfits and cloak overlays. See the native wardrobe README and v128 history. New full-body choices need an explicit design decision. |
| Park outdoor redesign until later activation (v196) | Owner wants to merge the saved work without selecting new maps yet. Existing maps remain the default; `?nativeFields=1` previews the preserved outdoor renderer without persisting the choice. Monster artwork remains separate. See [handoff](NATIVE-FIELDS-HANDOFF.md). |
| Original destinations are outdoor mob fields (v195) | Owner clarified that Prontera means the hunting field, not town. Use natural slopes, hills and valleys for depth. Remove town layouts and repeated stairs. Each field needs distinct terrain while native sprite art and combat remain intact. |
| Keep each map distinct and the lane clear | Landmarks, water and props create each map's identity without obstructing combat. Layout is deterministic; scene/kit tests pin this. |
| Tune balance with the real model | HP, kill speed, rewards and sinks interact. Old fixed kills/hour estimates are assumptions, not current measurements. Use current economy/progression tools and fixtures when balance is in scope. |
| Ship only the assembled site | `tools/build_site.sh` selects static runtime files into `dist/`; the production API lives in Pages Functions. Dev pages, source art, notes and credentials do not belong in the published tree. |

## Frequent mistakes to avoid

- Historical skill IDs do not always describe the skill's current name or effect.
- The legacy head-anchor recipe is not a replacement for native attachment metadata.
- A real page running with a stubbed renderer does not prove GPU rendering or phone performance.
- A smoke test can exit successfully after printing a dependency skip.
- Tests that copy formulas must pin the actual source or exercise it; otherwise
  they can keep passing after the implementation changes.
- Moving helpers in `index.html` can break source-extraction tests. Read the
  extracted span, add the real dependency, and keep the regression meaningful;
  do not silence it with a stub of the behavior under test.
- A static preview cannot validate cloud accounts or server-authorized away rewards.

Relevant detail: [Game design](GAME-DESIGN.md), [Code map](CODE-MAP.md),
[native wardrobe](../tools/native-wardrobe/README.md),
[native pets](../tools/native-pets/README.md),
[skill icons](../tools/native-skill-icons/README.md).

## Five-skill Ascension update (15 October 2026)

Five authentic RO skill identities per class; game-specific tuning and simplified
solo support. Rolling Cutter is the only repeated slot: five casts at 0.2s spacing,
then advance and retain recovery. See [research](../Updates/fourth-jobs/SKILL-RESEARCH.md).


### v179 owner requests

Astral stage-to-stage travel lasts two seconds in either direction, including long
jumps. Nightmare materials consolidate into Void Core with quantities retained.
Class Tree has current-lineage change cards and the full overview; Combo moves to
the top of Skills. Unprotected +5–9 refinement failures downgrade on all grades;
below +5 and the Mythic +10 checkpoint stay safe. Fourth-job wardrobes use native
components rather than inferred attachment offsets.

### 2026-10-17 — One-time historical balance exception

The owner explicitly approved ignoring the currently measured v186 historical
High Priest/Sniper balance failures: High Priest completed N+ single/three-target
DPS +20.3248%/+20.3106% against the October 10 baseline, and early-growth Sniper
DPS -10.8727%. This is a one-time acceptance of those results, not an instruction
to change the baseline, remove the test, relax thresholds permanently or disregard
new regressions. The test remains visibly failing. This approval does not itself
authorize a commit, push or deployment. Endgame compensation through Ascension
skills/stats and Mythic progression is at proposal stage; no coefficients changed.


### 2026-10-17 — v187 late-investment offense

The owner approves distributing power through earned Ascension/Mythic progression,
with full potential late in the game rather than a flat fourth-job transfer buff.
Paired measurements showed existing maximum Ascension/+15 fixtures already exceed
the earlier timing-only targets, so v187 back-loads existing offense without raising
maximum coefficients: quadratic offensive stat/skill ranks, rank-scaled damaging
sixth-skill base power, and refinement-scaled offensive Mythic set bonuses. Support,
speed, cooldowns, 0.5s combo contacts, Rolling Cutter's 0.2s repeats and cosmetic
(non-damaging) gap swings are preserved. Intermediate builds are intentionally
weaker than v186; identical max-investment builds retain their DPS. The proposed
50/30/20 split remains a planning guide, not an exact attribution or an added buff.
The existing one-time historical High Priest/Sniper exception remains unchanged.

### 2026-10-18 — Merchant-line HP target (v190)

The owner selects Mechanic combined class/skill HP of 2.10× instead of 2.625×.
Keep its 1.75× class base and Pushcart’s maximum +20% HP; remove Cart Momentum’s
extra +30% HP training, retaining its offensive effect and saved ranks. This also
reduces Whitesmith to 1.92×. Other class lines and equipment/affix formulas are
unchanged. Ascension map HP/EXP/Zeny remain under discussion.

### 2026-10-18 — Ascension escort and income adjustment (v191)

The owner approves half HP for stage-5 escorts in Astral Citadel and Thor Volcano,
boss HIT 55→50, and +30% Zeny for ordinary mobs, escorts and bosses at every stage.
Boss HP, stages 1–4 HP, all ATK, EXP and drop rates retain their values. Reward
version 6 invalidates old Ascension income samples so new measured rates can be
recorded; original-map samples and earned progression remain intact. Drop-rate
changes are awaiting discussion of current material uses and costs.

### 2026-10-18 — Ascension materials and Mythic scroll exchanges (v192)

The owner selects 0.2% per kill for Astral Shards/Primal Catalysts, 0.05%
ordinary/escort Sigils, and explicitly 1% boss Sigils. Mythic Protection Scrolls
cost 100 Sigils each in the Black Market and 600 Echo Shards each in Echo.
The existing market gate applies; Echo retains its existing access rules. Purchases
use the existing saved Mythic scroll reserve, retaining refinement behavior and the
0.05% online boss scroll drop. Echo Shards are separate from Astral Shards.

### 2026-10-22 — Nightmare Abyss boss HP (v210)

The owner asked for a 20% cut of the Nightmare Abyss Dark Lord's live HP after the
endgame reward comparison. The v198 "+25% HP, this boss only" special case is
retired, so the boss spawns at the Nightmare band's own boss HP: 89,341,585
(111,676,981 before). EXP, Zeny, ATK, escorts and drops are unchanged. The reward
comparison in `reports/endgame-rewards/comparison.md` explains what that does and
what is left (the Stage 15 MVP still pays 1.25× an escort for 14.9× an escort's HP).

### 2026-10-19 — Crucible and boss tuning (v198)

The owner selects 3× trial HP and a 30-second limit, +25% HP for Nightmare
Abyss Dark Lord only, and 25% less Thor boss damage. Trial ATK, other field
HP/ATK, rewards and the three-second trial result pause retain their rules.

## Off-hand dagger balance (v200)

The owner chose 35% for off-hand dagger refined weapon ATK, affixes and cards,
including Mythic direct crit. Main-hand daggers stay at 100%; katars stay at 150%
with four sockets. Equal daggers contribute 135% weapon value and at most 4.05
full-card equivalents from six sockets. Stored rolls, sockets and IDs are preserved.

## Tactical ranged movement and persistent AoE (v201)

The owner approved a saved Kite / Stand still option below Auto-advance, the solo
holy-tree proposal and larger, marked, lingering AoE with tuned total DPS.
Meteor must have downtime and cannot fill the map continuously. Implementation
uses a five-second Meteor Storm with a 12-second cooldown, one instance of each
spell and at most two ground spells. Ordinary combo timing and recovery remain.
Holy attacks retain fixed per-cast healing limits; repeated ground ticks cannot
multiply holy marks/echoes. Existing skill IDs, ranks, loadouts and saves survive.

Social hub (owner, 22 October 2026): farming continues while visiting the plaza.
The social view has no enemies/combat; it does not pause or replace field farming.
Emoji opens beside Send; messages and emotions share a three-second delay. Native emotions appear overhead and as smaller
entries in plaza-local chat. World/Whisper/Log replace the bottom-left log area.
