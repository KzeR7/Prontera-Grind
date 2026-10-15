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
progression; Endless Echo is a separate damage trial with its own rewards and limits.

## Ascension fields

Maps → Ascension Map contains Astral Citadel and Thor Volcano, beside the framed
World Atlas destination grid. The adjacent Social Hub tab is locked as Coming Soon.
Astral and Thor have illustrated destination previews. Travel enters the main battlefield with the current
character, combat and drops. Astral requires Base 140 and a recorded Abyss Stage 10
victory; Thor requires Base 150 and an Astral Stage 5 victory. Existing saves must
record those boss victories after this update, since older saves did not track them.
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
Catalyst (Thor) each roll at 0.035% per kill; Valkyrie's Sigil rolls at 0.0025% per
ordinary mob/escort and 0.1% per MVP. The map's Field intelligence shows the wallet.
Online and server-budgeted offline kills share these rolls. Materials are collected
for N+ weapon evolution (Shard/Catalyst) and Ascension skill growth (Sigil).
Recipes and skill upgrade menus remain planned; these materials cannot be spent yet.
Existing maps, pet identities and Nightmare reward values retain their meaning.

## Classes and progression

There are 19 classes: Novice plus six three-step lines:

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
replaces a normal swing during the burst. After completion,
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
is learned. Bow range passives extend both normal attacks and skills.
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

## Equipment, cards and currency

Gear eligibility depends on class, weapon family and progression tier. Switching
classes stows incompatible equipment safely and can restore the same item IDs on
return. Inventory, class snapshots, equipment locks and autosell must agree.
Selecting bag equipment always inspects it, including on saves with the retired click-sell flag. Manual sales ask for confirmation; bulk sales preview their contents. Drop auto-sell settings do not sell existing inventory.
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
