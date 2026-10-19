# Game design

Read this for the player model; use [Code map](CODE-MAP.md) for implementation.
This describes the current game, not a proposal to add features. Exact formulas
and tuning values belong in code and tests rather than duplicated documentation.

## Player loop

A player creates an account, begins as a Novice, and automatically fights monsters
in a selected map/field. Kills award Base EXP, Job EXP, Zeny and random loot.
The player spends stat and skill points, equips/refines gear, uses cards, develops
pets, completes quests and moves to harder fields. The game keeps grinding while
panels are open. Away rewards have separate timing and save rules.

The original ten maps have ten normal stages each. Stage 10 has an immediate boss with escorts;
do not apply the earlier stages' kill threshold to that encounter. Maps have distinct
visual identities and recommended progression. The Nightmare band extends endgame
progression; Endless Echo is a separate damage trial with its own rewards and limits. Each completed
ranked run pays 100 Echo Shards at any DPS, up to two runs per day (200 shards).
Practice and abandoned runs pay no shards; first-clear DPS caches remain one-time rewards.

## Ascension fields

Maps → Ascension Map contains Astral Citadel and Thor Volcano, beside the
World Atlas destination list. Endless Echo has its own tab between Ascension Map and the locked Social Hub tab.
Astral and Thor have illustrated destination previews. Travel enters the main battlefield with the current
character, combat and drops. Both maps require a fourth-job class, with no prerequisite boss clears.
Ascension combat scales from the Nightmare Abyss Stage 5 regular mob (internal
Stage 15). Astral HP multipliers by stage are 2/3/4.5/6.5/9 and ATK multipliers
are 1.5/1.9/2.4/3/3.8. Thor HP multipliers are 7/9/11/14/18 and ATK multipliers
are 4/4.8/5.6/6.6/8. The stage-5 boss retains three times its original stage
regular HP and ATK. In v191, only its five escorts receive half the original
stage regular HP; their ATK is unchanged. Stages 1–4 and boss HP are unchanged.
The first fourth-job trial uses Astral stage-1 regular HP/ATK and retains its HIT.
Ordinary Ascension mobs and escorts have 45 HIT; v191 lowers boss HIT from 55 to
50. At 80 Flee, ordinary/escort hit chance is 65% and boss hit chance is 70%,
before blind/block. The existing 5% dodge floor still applies.
Both Ascension maps have five stages: 1–2 share arrival scenery, 3 is the crossing,
4 is the approach, and 5 starts immediately with the MVP and five escorts. Neither
map adds Nightmare stages or drops equipment. Cards, ore and pets still roll.
Astral uses a continuous stone bridge in a deep space sky, with ruined edge arches,
a rune observatory and a boss seal. The rear gate stands on paving and all pillars
have solid foundations joining the bridge. Uneven chipped paving, worn border
mosaics, branching cracks, fallen column sections and small relic shrines give the
bridge its age. Arrival has a compass inlay, the crossing a broken mosaic, the
observatory an engraved celestial instrument, and the sanctuary a constellation
seal. Nearby islands have independent fractured rock profiles and scattered ruins.
Tall details stay along the margins, leaving the combat corridor open.
Thor retains the approved volcanic scenes.
Old ten-stage Ascension saves migrate once (1/2–3/4–6/7–9/10 → 1/2/3/4/5),
including away-income source stages. Recorded clears, materials and owned items survive.

Native mobs use local original APNGs for idle, walk and attack in eight directions.
Materials are saved separately from equipment: Astral Shard (Astral) and Primal
Catalyst (Thor) each roll at 0.2% per kill; Valkyrie's Sigil rolls at 0.05% per
ordinary mob/escort and 1% per MVP. The map's Field intelligence shows the wallet.
Online and server-budgeted offline kills share these rolls. Materials are collected
for N+ equipment evolution (Shards/Catalysts plus Sigils). Shards/Catalysts also fund
selective Mythic reforging. Mythic Protection Scrolls can be exchanged for 100
Valkyrie’s Sigils each in the Black Market (its existing Base 100 gate applies), or
600 Echo Shards each in the Echo Shard Store. Both add to the saved Mythic scroll
reserve used by protected +11–15 attempts. The 0.05% online boss scroll drop remains.
Equipment → Ascension Forge requires a fourth-job class. Its recipe lists owned/required
materials and Zeny in green when enough and red with missing amounts when short;
a disabled forge action explains the shortage. Choose a set, then an eligible owned N+ piece. Evolution spends Shards/Catalysts, Sigils and Zeny, preserving the same item ID, refinement, cards and existing affixes while filling to four affixes. It never creates an extra item. Mythic equipment can only be worn by fourth jobs. Character contains working Ascension stats and Skill ascension allocation tabs.
Existing maps, pet identities and Nightmare reward values retain their meaning.

## Ascension progression (v167)

Any combat EXP earned as a fourth job credits both Ascension tracks in full.
Shared stat Ascension starts at 0 and caps at 50, granting one point per level.
Each fourth job has its own saved allocation of the same earned budget; switching
classes restores its preset. Eight stats cap at 10 ranks each, so 50 points cannot
max all eight. Bonuses activate only while playing a fourth job.

| Stat | Growth | Rank 10 |
| --- | --- | --- |
| Might | +10% × (rank / 10)² physical/magic character damage | +10% |
| Precision | +10 × (rank / 10)² post-cap crit points | +10 points |
| Ferocity | +30 × (rank / 10)² crit-damage points | +30 points |
| Slayer | +15% × (rank / 10)² boss damage | +15% |
| Vitality | +2% max HP | +20% |
| Guard | 1% less remaining incoming damage | 10% less |
| Haste | 1% shorter basic-attack interval after its ordinary floor, capped at 192 ASPD | Up to 10% shorter |
| Evasion | +0.5 percentage point post-cap flee | +5 points |

Skill Ascension starts at 0 and caps at 30 **per fourth job**, one point per level.
Six skills each take five ranks. The five ordinary skills keep their existing
rank 1–10 ledger; the sixth is unlocked by its first Ascension rank: Enchant Blade,
Tetra Vortex, Unlimit, Dark Claw, Epiclesis or Magma Eruption. The sixth skill also appears in the normal skill library with a link to unlock
it in Skill ascension. New attacks can be assigned to the six-slot combo; buffs
auto-cast independently and have an on/off control in Skill ascension. Resets are free during testing and keep earned levels.

Offensive skill bonuses (damage, boss damage, critical chance, vulnerability and
offensive buffs) scale with (rank / 5)²: 4/16/36/64/100% of their maximum. Utility,
healing, shields, duration and cooldown upgrades retain linear scaling. Dragon
Breath's burn and Chain Lightning's extra bounce unlock at rank 5. New damaging
signatures (Tetra Vortex/Magma Eruption) also scale their base cast power from
42.4% at rank 1 to 100% at rank 5; ordinary attacks' base coefficients are unchanged. Boss-damage bonuses replace the
proposed defense penetration extras because enemies have no DEF/MDEF stat.
Existing resistance, boss crowd-control limits and ordinary skill budgets apply.
Ascension events/buffs cancel on reset, class change or account-state replacement.

The next-level requirement is `round(base × (level + 1)^1.8 / 1000) × 1000`,
with base 16,007,274 for shared stats and 8,212,500 for class skills. At the
8M combat EXP/min reference, the shared track targets about 700 active hours and
each class skill track about 87.5 hours. Full costs are 336,000,008,000 and
42,000,866,000 EXP respectively. These are reference targets; actual farming rates
vary with build, map, travel and deaths. Previously earned levels, partial EXP and
allocations survive this retune.

Away progress uses the existing 50% rate and four-hour claim cap, credited to the
class in its saved income sample, once per server claim. Quest and GM Base-EXP
grants do not contribute; no historical EXP is converted.

Astral EXP pays 3/4/5/6.5/8 times the Nightmare Abyss Stage 15 regular reward
per kill; Thor pays 7/8.5/10/12/15 times. Boss EXP is four times the original
stage regular reward. Escort HP reductions do not reduce their EXP.
Zeny uses the matching Abyss regular/boss payout with Astral stage multipliers
2/2.1/2.2/2.3/2.4 and Thor 2.4/2.55/2.7/2.85/3, all increased by 30% in v191.
The increase applies to ordinary enemies, stage-5 escorts and bosses, through
both live reward definitions and away simulations. The separate 90% paying-kill
chance and 50–100% payout roll still apply, including to bosses.
The current reward version is 6. Stale Ascension measured income samples are
invalidated at load and claim, then replaced by a new farming sample; ordinary
map samples survive. Earned levels, EXP, allocations and material wallets survive.
Material drop rates are unchanged pending further owner tuning.

Existing sinks are retained after reducing currency supply: Mythic evolution
costs 50–140M Zeny per piece plus materials; four-affix Mythic reforges cost
1.2M (all), 3.6M (two), or 7.2M (one), with selective ore/material fees.
Mythic +11–15 attempts cost 264/288/312/336/360k Zeny plus 15 ore each, at
30/21/12/5/2% success. Protected failure preserves the Mythic rank; unprotected +11–15 failures lose one rank. Expected +10→+15
fees total about 29.57M, or 159.21M including purchased ore at existing prices;
actual RNG costs vary. Prior map reward changes did not rebalance these prices.
New skill artwork remains unfinished. Mythic inventory icons now use native Glacier/Dim Glacier art for Astral sets and Crimson/Lava Leather/Phoenix art for Thor sets. The custom sets share some official pieces; see `assets/equipment-icons/mythic-manifest.json` for all slot mappings and original hashes.

## Classes and progression

There are 25 classes: Novice plus six four-step lines. The first three steps are:

| First job | Second job | Transcendent job |
| --- | --- | --- |
| Swordman | Knight | Lord Knight |
| Mage | Wizard | High Wizard |
| Archer | Hunter | Sniper |
| Thief | Assassin | Assassin Cross |
| Acolyte | Priest | High Priest |
| Merchant | Blacksmith | Whitesmith |

Base level, Job level, stat points and skill ranks are different kinds of progress.
Skills use class-specific six-slot combos, with no SP resource. Players choose
learned offensive skills from the current class's inherited line and reorder them
with arrows or slot selectors. Each attack casts once in order at full power, with
0.5-second cast spacing aligned to attack animation contact. Skill swings animate
at the faster of the build's attack interval and that cast spacing. Each cast
replaces a normal swing during the burst. Between casts, ASPD may play complete
**visual-only** attack swings when they fit before the next skill's windup. These
cosmetic swings do not deal damage, roll combat RNG, launch projectiles, trigger
Twin Strike/on-hit effects or heal through leech. They never shorten skill spacing
or delay the next cast. This rule is the same for every class and equipment grade.
Rolling Cutter retains its existing five repeats at 0.2-second spacing. After completion,
offensive skills recover for 3 simulation seconds; basic attacks and pets continue.
Basic attacks, pet power and healing amounts retain
their existing formulas. Cooldowns belong to individual skills. Unavailable, paused or out-of-range attacks
are skipped for that combo. Changes to slot selection/order apply to the next
combo, while pause and individual auto-cast switches take effect immediately.
Buffs refresh near expiry on their own cooldowns without consuming offensive slots;
First Aid remains a separate emergency heal. Passives do not occupy slots.
Each class keeps its own saved combo, including a separate pause switch. Old saves
use their earlier offensive priority to initialize slots; missing priorities use a
starter combo with inherited openers and attacks from newer jobs. Field transitions
preserve combo/recovery timing, while class and account changes clear transient
combat state. Melee classes close to normal attack range even when a ranged skill
is learned. During a fight, characters immediately close any gap when their
target drifts just outside attack range, and hold position once back in range.
Bow range passives extend both normal attacks and skills.
Mage and Acolyte lines attack with magic at six tiles; their area skills
have increased reach and damage, especially Mage. Read each skill's current definition:
historical IDs can remain unchanged after a skill is renamed or redesigned.

Previously played classes can be revisited directly and restore their saved
progression and equipment. Unplayed classes retain parent-job and route gates.
Promotion along the current line retains allocated stats; a fresh promotion from
Novice refunds them. Returning to Novice has a deliberate reset path. Use
`classBlock()`, `changeClass()`, `freshBuild()` and `noviceRun()` plus class-change
tests for the exact transitions; never treat all class changes as one reset.

Current stat allocation caps at 99 before Base level 100, and at 120 from 100.
At Base 150, wearing Mythic gear raises allocation to 150. Earned allocations survive
class switches, gear removal and reload; removing Mythic prevents further allocation
above the ordinary cap.
Base progression ends at 150. Do not copy earlier grant curves or pacing estimates
from historical notes: `totalPts()`, `statCap()`, `needAt()`, `jneed()` and the
progression/economy tests define current behavior. Base EXP requirements from
Lv100 onward are 50% higher than the shared reference curve, with existing
rounding. `needAt()` retains that reference curve for Job requirements and
contract rewards; `baseNeedAt()` supplies the player Base EXP bar. Existing
levels and earned EXP are preserved. Offline EXP still uses measured EXP/min,
50% efficiency and a four-hour cap per claim. The target of roughly five days
is a balance goal, not a guaranteed duration for every class, build or login schedule.

Nightmare Stage 5 (internal stage 15) redistributes its existing raw EXP budget
across the MVP and its three/five escorts: the MVP pays at least 25% more than
one escort, with integer remainder assigned to the MVP. Normal stages and
Nightmare stages 1-4 retain their rewards. The total for killing every member
is unchanged before per-kill Base/Job rounding; killing the MVP first still
clears surviving escorts, so actual income can vary with kill order. Online
and offline monster definitions share EXP rewards and boss Zeny multipliers.
Offline payouts use the saved measured income, rather than adding those monster
rewards again; after changing fields/builds, a fresh farming minute replaces
the prior sample. No sample means no offline income.

Movement from AGI, pets, skills and running shares a 10.045 units/second cap.
Equipment and card movement is applied afterward and can exceed that cap; those
bonuses retain their combined +20% limit.

Class Tree opens with cards for the current five-step lineage; each class name is an explicit job-change button.
Available cards use the existing class-change and first-unlock trial gates.
The Class tree subview retains the full 25-node overview with its inspector.
Locked/current cards explain their status; the portrait has a neutral slate background.
Inspection in the full overview does not change class.

### Merchant-line HP (v190)

Pushcart grants +2% maximum HP per rank, up to +20%. Cart Momentum retains
its offensive stacking effect and no longer grants HP training. With maxed
Pushcart, Whitesmith has a 1.92× combined class/skill HP multiplier and Mechanic
has 2.10× (1.75× class × 1.20). Equipment, cards, pets and Ascension HP bonuses
apply through their existing rules.

## Equipment, cards and currency

Gear eligibility depends on class, weapon family and progression tier. Switching
classes stows incompatible equipment safely and can restore the same item IDs on
return. Inventory, class snapshots, equipment locks and autosell must agree.
Selecting bag equipment always inspects it, including on saves with the retired click-sell flag. Manual sales ask for confirmation; bulk sales preview their contents. Drop auto-sell settings do not sell existing inventory.
Ordinary core crit caps at 60%. Above 45%,
each additional point contributes half. Hunt Title Index Crit adds up to 40%
after the core cap, with a 100% normal total ceiling. Mythic direct crit affixes
and set crit bonuses then add without that cap: 100% + 20% = 120%. Socketed cards
and LUK keep their ordinary rules. Off-hand dagger bonuses keep their 50% weighting.
Boss resistance reduces the full result, for both basic attacks and skills. Astral and Thor drop no equipment; Mythic gear comes from the Forge.
Cards, refining, ores and Nightmare materials interact with gear and the economy.
Check the corresponding tests before changing eligibility, rolls, prices or rewards.

Zeny funds upgrades and several random systems. Kill speed, monster health, EXP,
quest rewards and currency sinks affect one another. Model estimates are not
measured player times; a cosmetic task is not authorization to retune progression.

## Pets and appearance

Pets join through drops. Training, Bond, deployment and battle-skill rolls are
separate systems. The 20 species include saved numeric identities; additions are
appended so old saves keep the correct species. Recommendations do not guarantee
random skill rolls. Only deployed pets contribute their applicable bonuses.

Wardrobe shows the active class. Hair, colors and accessories are saved cosmetics;
gender can be previewed and applied in Wardrobe or selected in Settings. Applying, cancelling or resetting a look must not
change class, equipment, stats or progress. Current male/female native bodies are
distinct art. Full-body replacements using future progression classes were removed;
do not restore them as a presumed missing feature.

## Saves and account boundaries

Browser storage supports local accounts/saves; the deployed game also supports
server accounts and cloud saves. Save ownership, conflict handling, migrations and
server-approved away claims protect progress. A local browser copy is not proof
that an account owns the corresponding server save.

Keep old saves working. Verify load → change → save → reload and switching between
two accounts for state changes. Do not replace real conflict/ownership logic with
a permissive preview shortcut in production code.

## Fourth jobs enabled for testing

The six fourth jobs are enabled by owner request (16 October 2026), with five skills each.
Rolling Cutter casts five times in one slot at 0.2-second spacing before advancing;
other attacks retain ordinary combo timing. Support runs outside offensive slots.
See [research and adaptations](../Updates/fourth-jobs/SKILL-RESEARCH.md).

First fourth-job advancement also requires a 60-second Crucible fight in a dark
arena, using the matching native Biolabs opponent and first ordinary Astral mob
combat stats. Animated victory/defeat/timeout wording stays in the dark room for three
real seconds with combat stopped, followed by automatic return and, on victory,
automatic job change. Timeout, defeat or leaving allows retry
without field rewards/progress. Played classes return directly. The local test build uses `FOURTH_JOBS_LIVE=true`; see the [matchups and rules](../Updates/fourth-jobs/README.md#advancement-trial-16-october-2026-parked).

### Mythic testing access (v160)
GM → Ascension testing grants Base 150, crafting materials, Zeny, ores and both
protection scroll types. Grant any of the six complete sets for your current weapon
families. Max the parent job and use Class Path for the real timed trial.
GM → Maxed Ascension equipment by class grants a matching set to the bag for any
of the six fourth jobs, with +15 refinement, maximum base values and four maximum
legal affix rolls. Includes each weapon option, two accessories and two daggers for
Guillotine Cross. Bases match maximum Abyss Nightmare Stage 5 N+ drops evolved into Mythic; the gift
constructor uses that same base range. Legacy gifts in the old low-value band
repair on load or queued cloud delivery, preserving their relative base roll, item
ID, cards, refinement and affixes. Evolved N+ bases remain unchanged.
Cards stay empty. Class, equipped items and wallets are preserved;
insufficient bag capacity rejects the entire grant. Additional GM controls add 1,000
of both ores alongside the existing +20, and set Base level to 1, 99 or 120 while
clearing Base EXP and recalculating unspent points without resetting allocated stats.
The Forge evolves compatible owned N+ equipment; maps do not drop gear.
Mythic refines reach +15 (15 ores per attempt; +11…+15 chances 30/21/12/5/2%).
Four-affix reforges retain their paid offer across reloads. The cloud GM console
includes all crafted gear, materials and Mythic scrolls, and supports +15/four-affix edits.
Fourth jobs use the original native composites in gameplay, portraits and Wardrobe,
with both genders, eight directions and native idle/walk/attack clocks. The fixed
head and weapon are composed by the native renderer. Hair/accessory controls are
disabled for these bodies; saved cosmetics return on earlier classes. Separate
weapon-layer refinement edging is unavailable on these combined sprites. Equipment
→ Ascension opens the N+ evolution Forge.

Astral stage changes walk along the continuous bridge with the following camera; arrival rebases the scene and actors together. Echo entry cancels travel safely. Thor’s atlas banner is rasterized from its actual scenery and textures.

### Mythic affix and combat retune (v167)

The v166 raw HP/CDM roll increases are reverted. Newly rolled HP uses weight 12,
and CDM uses .45 before its existing 70% post-roll. Saved affixes are not rewritten.
Critical damage still gains .008× per LUK and .005× per DEX; VIT still gives 8 base
HP, .5 DEF and .4 MDEF per point. Mythic crit affixes and set bonuses retain their
existing post-cap behavior until a stat-conversion proposal is accepted.

In v170 the owner approved **HP affix ×2 at every equipment grade**, for both
existing and future items, including inherited rolls after evolution. Stored roll
numbers are preserved; `bon('hp')` doubles only equipment affixes when reading
stats. Cards, VIT, equipment base values and set bonuses retain their own rules.
The existing off-hand dagger contribution remains 50%. Item details and reforge
comparisons show effective HP plus the stored roll; autosell minimums retain
stored-roll units so saved filters keep their behavior.

The owner chose to retain **Crit ×1 and LUK ×1**. The tested ×.25 Crit / ×.5 LUK
reductions are not adopted. HP scaling changes survival, healing/shields derived
from max HP and potentially farming rates; it is not a measured farming-time guarantee.
Discuss further balance proposals with the owner before implementing them.

Basic attacks now have a hard 192 ASPD ceiling after Haste, gear, cards and skills.
Using this game's display formula, that is 9.6 attacks/second and an interval
of 5/48 seconds. Ordinary equipment retains its .13s floor before Haste; Mythic
gear and Haste can reach the final ceiling. Extra Haste cannot exceed 192.
Skill cast spacing and combo recovery retain their separate timing rules.

All headgear grades offer STR/DEX/INT/VIT/HP/ATK/MATK with equal selection odds
(v169 owner choice). New drops and reforges use this pool; existing rolls survive.
Each key now has a 1/7 chance on the first affix, so the older INT/VIT/HP/MATK
options are less frequent than in the former four-key pool. Roll values and
affix counts retain their rarity rules.
Skills opens with the six-slot combo editor above the compact skill library and selected inspector.
There is no separate Combo tab or empty bottom setup fold.


## v179 progression and wardrobe refresh

Astral stage changes walk continuously to any destination in exactly two seconds;
pets keep pace. Arrival rebases the world/camera together and account/class/trial
changes cancel travel safely. Ordinary movement and combat speed are unchanged.
Endless Echo has a local illustrated portal/arena background in Maps.

Nightmare MVPs across all ten ordinary regions drop only Void Core. Save version 3
sums old ten-slot or five-slot material wallets once. Drops, offline rewards,
legacy GM gifts, market purchases, scroll crafting (20 cores) and selective N/N+
reforges use that wallet. Ascension materials retain their separate purposes.

Unprotected refinement failures at current +5 through +9 lose one rank, including
Mythic. Below +5 is safe; Mythic +10 is a checkpoint. Above +10, an unprotected
failure loses one rank down to the checkpoint. Protection still consumes the
appropriate scroll on every attempt, including success.

All six fourth jobs now use genuine native body/hair/accessory components with
20 hairstyles per gender, nine original palettes and the same 52 pieces as earlier
classes. Apply/cancel/reset, male/female memory and account/class changes preserve
progression and equipment. The separate fourth-job pack retains all eight directions,
original frame clocks/placement, weapon/shadow layers and original world scale.
See the native wardrobe README for source recovery, packing and proof commands.


## Late-investment offense (v187)

There is no extra damage multiplier for simply transferring to a fourth job.
Might/Precision/Ferocity/Slayer and offensive skill upgrades give their largest
increments at final ranks, without increasing their maximum. Support and speed
bonuses, skill cooldowns and combo timing are unchanged. Existing earned levels,
allocations, EXP and item records are preserved; intermediate investments become
weaker than v186 by design, while the same fully invested build retains its power.

Mythic set ATK/MATK/Crit/Crit DMG/Field DMG bonuses start at 40% of listed maximum
through +10. Above +10, the multiplier is 0.4 + 0.6 × ((mean refinement - 10) / 5)²,
reaching 100% at +15. Each 2/4/6-piece tier uses its best qualifying pieces; active
offensive stats retain the maximum earned across qualifying tiers, preventing a
weak additional piece from reducing a previously earned bonus. Defense, HP, flee
and ASPD set bonuses retain their existing values. Item bases, affix/card rolls,
refine prices/odds and the GM base repair do not change.

The proposed 50/30/20 allocation was a planning budget, not an additional multiplier
or a claim of exact measured contribution. v186's maximum gear/Ascension fixtures
already exceeded the old timing-only DPS targets, so v187 back-loads existing
power instead of adding another blanket damage buff. See the qualified paired
measurements in `reports/endgame-progression-v187/summary.md`; those empty-socket,
petless stationary fixtures are not fully maxed account or live-field forecasts.

## Update notifications (v198)

The game checks the deployed build once a minute. A different build shows an
Update available popup while play continues. Keep playing dismisses that deployment
notice; a later deployment can show a new one. Players choose Refresh & log in
again; this saves locally and awaits a cloud sync attempt before refreshing.
Weapon refinement uses the owner's v199 tiers: below +7 none, +7–8 mint, +9 violet,
+10–12 crimson, +13 lime, +14 gold, +15 cyan. Unlisted ranks inherit the closest
lower tier. Glows persist while idle, walking and attacking. Native poses with a
weapon use its silhouette/glint; idle/walk poses with stowed weapons glow around
the arms. Source sprite assets are preserved.
