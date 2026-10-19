> **Current status — 16 October 2026, v160:** Owner authorized the testing unlock.
> `FOURTH_JOBS_LIVE=true`: 25 classes / 121 skills. Earlier parked-state notes below
> describe preparation. Trials, Mythic Forge, +15 refinement, four-affix reforges
> and updated GM testing controls are enabled locally. Parent-body fallback remains;
> native review bodies are not yet wired into gameplay. No deployment performed.

# 4th Jobs (Milestone 4) — built, parked, not unlocked

**Status (2026-10-16):** all six 4th-job classes and their 30 core RO skills are built in
`index.html` and tested, but **parked**. `FOURTH_JOBS_LIVE` is `false`, so the live game still has
19 classes, 91 skills and the `haven-v158` build label (`main`'s). Nothing here is unlocked until the owner
gives an explicit instruction (see [Go-live checklist](#go-live-checklist)).

**Picking this up later? Read [HANDOFF.md](HANDOFF.md) first:** it lists where work stopped, what is verified and what is still open.

This folder is the reference for that instruction. It does not replace the code: the code is the
source of truth, and this file says what it should do and what is still open.

## Visual preparation update (2026-10-15)

The owner approved the five core RO skills per class, original native sprite recovery and keeping
the classes locked. [VISUALS.md](VISUALS.md) records the new six-class native review
pack, dedicated Afterglow effects and flag-gated aura. Wardrobe integration remains
open; the native review pack is a fixed composition and stays out of production.


## Advancement trial (16 October 2026; parked)

First advancement at Base 150 and Transcendent Job 50 enters a dark Crucible arena
from the Class Tree. Defeat the single opponent within **30 real seconds** to advance.
Pausing or hiding the page does not extend the timer. Timeout, defeat, leaving or
reload does not unlock the job; retry from the Class Tree. Previously played jobs
still restore directly. The arena grants no loot, EXP, materials or field progress.
Victory, defeat and timeout display large animated result text while combat stops in
the dark room for three real seconds. The return is automatic; victory automatically
changes the job after the pause. Reduced-motion users see static wording. Original
field position, HP and pending drops return when the trial ends.

| Current class | Opponent / original sprite ID | Unlock |
| --- | --- | --- |
| Lord Knight | Lord Knight Seyren / 1634 | Rune Knight |
| Assassin Cross | Assassin Cross Eremes / 1635 | Guillotine Cross |
| Whitesmith | Whitesmith Harword / 1636 | Mechanic |
| High Priest | High Priest Magaleta / 1637 | Arch Bishop |
| Sniper | Sniper Shecil / 1638 | Ranger |
| High Wizard | High Wizard Katrinn / 1639 | Warlock |

All six use three times the first ordinary Astral mob's HP and its original ATK,
obtained from `ascensionCombatStats(10,1)`: currently **45,028,158 HP / 15,235 ATK**,
with a **30-second** limit (v198).
The native sprites retain their own pixels and action timing; class-specific boss
stats are not imported. `tools/tests/job_rite_sim.js` exercises all six fights and
save/account boundaries. `FOURTH_JOBS_LIVE=false` remains the release gate.

## What is built

| Piece | Where | Live today? |
| --- | --- | --- |
| Six 4th-tier classes (`CD4`) | `index.html`, under `FOURTH_JOBS_LIVE` | No (flag off) |
| Unlock gate: Base Lv 150 + parent Job Lv 50 (`ADV4_BASE_LV`) | `classBlock()` | Only when flag on |
| Pacing: `JOFF[4]=100` (Job Lv 1 at Base 101, Job Lv 50 at Base 150) | `JOFF` | `JOFF` pin has the 5th entry, unused live |
| Timed advancement trial | `startJobRite()`, `kill()`, `tickJobRite()` | Only when flag on |
| Fourth Class Tree row | `V.job()` | Only when flag on |
| Packed body = parent body (until native bodies exist) | `PACK_BODY` | Only when flag on |
| 30 core RO skills (`SKILLS4`) | `index.html`, joined to `SKILLS` only when flag on | No |
| Mechanic runtime (stacks, bounces, stuns, roulette, gap-closers, absorb) | `castSkill` and helpers beside `chainHit` | Unchanged for live skills |
| Native icon aliases and effect kinds for the 30 skills | `if(FOURTH_JOBS_LIVE)` block after `SKILL_VISUAL_REDESIGN` | No |
| Guillotine Cross katar-or-dagger rule (`katarOnly`) | `katarOnly()` | Live function, no live class affected |

Tests (all run from the repository root):

* `node tools/tests/fourth_job_sim.js` — 20 checks: roster, unlock gate, pacing, Class Tree, bodies, gear.
* `node tools/tests/fourth_job_skills_sim.js` — 15 checks: the 30 skills, rapid-spin combo, support, save compatibility and unchanged live skill list.
* `node tools/tests/dual_wield_sim.js` — the live Assassin pin plus the Guillotine Cross rule.

Both 4th-job sims run a copy of the page with the flag turned on. Nothing is edited on disk.

## The six classes and provisional multipliers

The multipliers are the three numbers on each roster row: `aspd` (a lower value swings faster),
`atk` and `hp`. They are placeholders chosen to sit a little above the parent. **The owner will tune
them when new mobs and bosses arrive.** Change the numbers in the `CD4` rows of `index.html`.

| 4th job | Parent (Transcendent) | Weapon | Main | aspd (parent) | atk (parent) | hp (parent) |
| --- | --- | --- | --- | --- | --- | --- |
| Rune Knight | Lord Knight | sword | STR | 0.70 (0.72) | 2.10 (1.99) | 1.95 (1.80) |
| Warlock | High Wizard | staff | INT | 0.86 (0.90) | 2.60 (2.40) | 1.05 (1.00) |
| Ranger | Sniper | bow | DEX | 0.52 (0.55) | 2.00 (1.85) | 1.10 (1.05) |
| Guillotine Cross | Assassin Cross | katar or dagger pair | STR | 0.48 (0.50) | 2.05 (1.90) | 1.20 (1.15) |
| Arch Bishop | High Priest | mace | INT | 0.78 (0.80) | 1.80 (1.68) | 1.35 (1.25) |
| Mechanic | Whitesmith | axe or mace | STR | 0.68 (0.70) | 2.15 (2.01) | 1.75 (1.60) |

Unlock for all six: Base Lv 150 **and** parent Job Lv 50 (plus the existing chain of ancestors).
Job Lv cap 50. The 4th-job tier keeps the existing gear ceiling (`gearTierOf` and `classTierOf` clamp
at tier 3, so the Transcendent band applies).

## The 30 core RO skills

See [the researched skill selection and exact adaptations](SKILL-RESEARCH.md) for
all five skills per class, source links, Rolling Cutter tuning and save compatibility.
`SKILLS4` in `index.html` is the source of truth for current numbers. The review's
skill data and FX catalogue are generated from it.

Rolling Cutter casts five times within one slot at 0.2-second spacing, adds one
Rolling stack per cast (cap ten, lifetime ten seconds), then advances. Cross Ripper
Slasher requires and consumes stacks. Other attacks use the ordinary ordered combo.
Hallucination Walk, Praefatio, Duple Light and Highness Heal run automatically outside
the offensive slots. Existing IDs/ranks are retained; converted buffs are removed
from offensive slots by load sanitization. Endgame balance acceptance remains open.

## Dagger counts as katar (owner decision)

The owner decided that a dagger works the same as a katar for katar skills, so the Assassin Cross
issue does not come up. In the code this is:

* Guillotine Cross wears a two-handed katar, or a dagger in each hand, exactly as the Assassins do
  (`katarOnly()` covers it; `dualWield()` already opens the left hand for any class holding both).
* No skill checks the weapon type, so a dagger already triggers katar skills. Guillotine Cross
  skills do not add a weapon gate, so a dagger and a katar behave the same.
* `dual_wield_sim.js` keeps the live Assassin pin and adds a Guillotine Cross rule check, because the
  4th-job roster is not loaded in that harness while the flag is off.

## Ascension (design note, not implemented)

The owner clarified that **Lv 150 and above is not a Base Level increase.** It is a separate
**Ascension level with its own stats** to level up. Job level keeps running as normal. A later
Ascension skill tab will raise skill boost. This is a design note only: no Ascension level, stat or
tab is built here. Milestone 5 in `docs/ROADMAP.md` (the Ascension stats box) follows this note.

**Update after the merge with `main` (v157):** `main` already ships an Ascension at Lv 150 (the Astral Citadel and Thor Volcano maps, with stages and ascension gear). That system is not this design note. Reconcile the two before building the Ascension track or the 4th-job unlock details that depend on it.

The current `JOFF[4]=100` pacing maps Job Lv 1–50 to Base 101–150. That mapping stays as it is until
the Ascension design is settled, because it only sets pacing. It does not say that Base Lv continues
past 150.

## Open items (not done, and why)

* **Native bodies and wardrobe (ROADMAP Milestone 4, Phase B).** Each 4th job wears its parent's
  packed body until native wardrobe integration is complete. The original native art is now recovered
  and audited in the review pack; all cosmetic attachment routes remain open. The owner approved these original progression bodies for preparation.
* **Skill icons and effects.** The 30 skills reuse native icons and effect kinds, by alias. Their
  dedicated draft effects are now built; icons still use approved unmodified crops.
* **Afterglow effects.** Draft choreography for all 30 fourth-job skills is generated. The shared video has now been inspected and the visual treatment revised; native body/FX playback is synchronized. See the updated research notes.
* **Ascension aura and Crucible trial:** built behind the class flag. See the advancement trial below.
* **Balance.** Power, cooldown, stack and roulette numbers are provisional. The owner tunes them
  with the new mobs and bosses. `tools/progression_balance.js` regenerates the combat fixtures when
  they change.

## Go-live checklist

Do **not** do any of these until the owner explicitly instructs the unlock.

1. Set `FOURTH_JOBS_LIVE=true` in `index.html`. (The skill and combat numbers are already in place.)
2. Re-run the roster-wide suites. Expect these to change and update them deliberately:
   * `fourth_job_sim.js` — its live-page section (19 classes, 4 tree rows, 4 `JOFF` entries) will fail once the flag is on, and must be updated deliberately to the flag-on expectations.
   * `fourth_job_skills_sim.js` — its live skill-count check (91 skills) will also change; update it with the flag.
   * `economy_sim.js` — the `JOFF` pin is already `[0,9,49,98,100]`; the model stops at tier 3 by design.
   * `weapon_proposal_sim.js` — the CD table slice already follows the flag.
   * `skill_balance_sim.js` and `tools/progression_balance.js` — regenerate fixtures with `node tools/progression_balance.js`.
   * `dual_wield_sim.js` — the live pin stays; the Guillotine Cross rule already runs.
3. Confirm native body and icon status, or accept the parent-body fallback as an explicit owner decision in `docs/DECISIONS.md`.
4. Confirm saves: a character who never reached Base Lv 150 is unchanged; a character who already has
   4th-job keys is kept; `changeClass()` never duplicates items; an account switch keeps each save's
   parent-line snapshot. The new skill IDs are new keys, so old saves need no migration.
5. Bump `const BUILD` in `index.html` (it is a player-visible change) and mirror it in the build checks.
6. Append a `docs/UPDATE-LOG.md` entry in the AGENTS.md template.
7. Run the `docs/TESTING.md` push gate in full. Do not push, merge or deploy without the owner's instruction.
