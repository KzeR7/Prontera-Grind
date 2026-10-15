# 4th Jobs (Milestone 4) — built, parked, not unlocked

**Status (2026-10-15):** all six 4th-job classes and their 18 signature skills are built in
`index.html` and tested, but **parked**. `FOURTH_JOBS_LIVE` is `false`, so the live game still has
19 classes, 91 skills and the `haven-v157` build label (`main`'s). Nothing here is unlocked until the owner
gives an explicit instruction (see [Go-live checklist](#go-live-checklist)).

**Picking this up later? Read [HANDOFF.md](HANDOFF.md) first:** it lists where work stopped, what is verified and what is still open.

This folder is the reference for that instruction. It does not replace the code: the code is the
source of truth, and this file says what it should do and what is still open.

## What is built

| Piece | Where | Live today? |
| --- | --- | --- |
| Six 4th-tier classes (`CD4`) | `index.html`, under `FOURTH_JOBS_LIVE` | No (flag off) |
| Unlock gate: Base Lv 150 + parent Job Lv 50 (`ADV4_BASE_LV`) | `classBlock()` | Only when flag on |
| Pacing: `JOFF[4]=100` (Job Lv 1 at Base 101, Job Lv 50 at Base 150) | `JOFF` | `JOFF` pin has the 5th entry, unused live |
| Fourth Class Tree row | `V.job()` | Only when flag on |
| Packed body = parent body (until native bodies exist) | `PACK_BODY` | Only when flag on |
| 18 signature skills (`SKILLS4`) | `index.html`, joined to `SKILLS` only when flag on | No |
| Mechanic runtime (stacks, bounces, stuns, roulette, gap-closers, absorb) | `castSkill` and helpers beside `chainHit` | Unchanged for live skills |
| Native icon aliases and effect kinds for the 18 skills | `if(FOURTH_JOBS_LIVE)` block after `SKILL_VISUAL_REDESIGN` | No |
| Guillotine Cross katar-or-dagger rule (`katarOnly`) | `katarOnly()` | Live function, no live class affected |

Tests (all run from the repository root):

* `node tools/tests/fourth_job_sim.js` — 20 checks: roster, unlock gate, pacing, Class Tree, bodies, gear.
* `node tools/tests/fourth_job_skills_sim.js` — 25 checks: the 18 skills, every mechanic, and the live skill list unchanged.
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

## The 18 signature skills

Each row is one skill. Power is the total damage of the cast, split across hits, as in the rest of
the game. Numbers are **provisional** and not balance-tuned against the combat model.

| ID | Name | Class | CD (s) | Hits | Power | Shape | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rk_charge` | Rune Charge | Rune Knight | 4.0 | 3 | 2.3 | single | gap-closer (dash 4); gains Rune stacks per hit (max 5) |
| `rk_burst` | Rune Burst | Rune Knight | 6.0 | 1 | 2.6 | radial | spends Rune stacks, +25% each |
| `rk_ward` | Rune Ward | Rune Knight | 10.0 | 1 | 1.2 | single | absorb: 25% of max HP, 8 s |
| `wl_chain` | Chain Lightning | Warlock | 3.0 | 1 | 2.6 | single | bounce to 3 nearest, 50% of a hit |
| `wl_seal` | Soul Seal | Warlock | 4.0 | 1 | 1.6 | single | target stacks: seal (max 5, 8 s) |
| `wl_det` | Seal Detonation | Warlock | 6.0 | 1 | 2.4 | splash | spends target seals, +20% each; stun 0.8 s if any were spent |
| `rg_hunt` | Hunting Pounce | Ranger | 4.0 | 2 | 2.2 | single | gap-closer (dash 6); gains Quarry stacks per hit (max 4) |
| `rg_warg` | Warg Strike | Ranger | 3.5 | 2 | 2.0 | single | roulette: each hit 25% to stun 1.5 s; spends Quarry, +15% each |
| `rg_storm` | Storm Arrows | Ranger | 5.0 | 1 | 2.4 | splash | bounce to 4 nearest, 40% of a hit |
| `gc_cross` | Cross Impact | Guillotine Cross | 3.5 | 2 | 2.6 | cross | spends target Bleed, +12% each; roulette: each cut 30% for an extra cut at 60% of a cut |
| `gc_slip` | Shadow Slip | Guillotine Cross | 4.5 | 3 | 2.0 | single | gap-closer (dash 5); target stacks: Bleed (max 5, 6 s) |
| `gc_veil` | Venom Veil | Guillotine Cross | 10.0 | 1 | 1.1 | single | absorb: 20% of max HP, 6 s |
| `ab_chain` | Holy Chain | Arch Bishop | 3.5 | 2 | 1.8 | single | bounce to 2 nearest, 50% of a hit |
| `ab_judge` | Judgment Seal | Arch Bishop | 6.0 | 1 | 2.6 | single | stun 1.0 s (bosses resist repeat stuns) |
| `ab_ward` | Sanctuary Ward | Arch Bishop | 12.0 | 1 | 1.0 | single | absorb: 30% of max HP, 8 s |
| `mc_gat` | Gatling Fever | Mechanic | 3.0 | 6 | 2.8 | single | gains Heat stacks per hit (max 5) |
| `mc_over` | Overheat Cannon | Mechanic | 6.0 | 1 | 2.6 | splash | spends Heat stacks, +20% each |
| `mc_rocket` | Rocket Jump | Mechanic | 5.0 | 1 | 2.0 | splash | gap-closer (dash 6); stun 0.6 s on all targets |

## Mechanic definitions

These are the rules the code implements (see the `SKILLS4` comment in `index.html`).

* **Stacks, self (`gain` / `spend`).** A landed hit adds one stack, up to `max`. Each stack lasts 12
  seconds from its last hit. A spending skill consumes every stack when it is cast and adds `per`
  damage for each stack spent. Stacks belong to the character's current class run: changing class resets the skill runtime, so they clear.
* **Stacks, target (`tgtStack` / `tgtSpend`).** A hit on the primary target adds one stack to that
  mob, up to `max`, lasting `life` seconds. A spending skill consumes the mob's stacks for `per` each.
  Target stacks are lost when the mob dies or leaves.
* **Bounce.** After the cast lands, the `n` nearest other living enemies in the same pack each take
  `share` of **one** hit. A bounce is a proc hit: it does not re-trigger marks or deathmarks, and it
  does not bounce again.
* **Stun.** Flat stuns (`stun`) apply to every target hit. Target-spend stuns apply only when stacks
  were actually spent. Stun time follows the game's existing rules, so bosses resist repeats.
* **Roulette (`roulette`).** Each direct hit rolls `chance` percent. On success it either stuns for
  `value` seconds (`effect: "stun"`) or adds an extra strike for `value` × one hit's damage
  (`effect: "strike"`). A strike is a proc hit and does not roll again. Warg Strike is the 25% example.
  *Interpretation:* "roulette" means random-chance procs, as recorded in the session. It does **not**
  mean the boss-map roulette in Milestone 2, which is out of scope here.
* **Gap-closer (`dash`).** Existing dash: the player steps toward the target and stops at its stop distance.
  It does nothing when the target is in another pack, when the target is already close, or when it is
  further than the dash distance plus a small margin.
* **Absorb (`absorb`).** Casting starts a ward that soaks incoming monster damage until it is used up
  or it expires. A new ward replaces any ward still up. Without a ward, incoming damage is unchanged.

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
  packed body until native bodies exist. Native art needs the owner's sprite sheets, and the rule
  is not to repaint sprite art. `docs/DECISIONS.md` requires an explicit owner decision for new bodies.
* **Skill icons and effects.** The 18 skills reuse native icons and effect kinds, by alias. Their
  own art and FX are open, and are not invented here.
* **Afterglow V6 effects.** Not generated for the 4th-job skills.
* **Ascension aura** and the **Crucible rite panel** (the current `changeClass()` stands in for the rite).
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
