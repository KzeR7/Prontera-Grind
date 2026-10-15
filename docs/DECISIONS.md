# Decisions to preserve

These decisions summarize shipped behavior and recorded owner choices. They are
not authorization to expand a task. If the user changes one, update this note and
the implementation/tests together. Read the linked sources for exact details.

| Decision | Reason / implementation evidence |
| --- | --- |
| Return directly to previously played classes | The owner wanted saved builds available without repeating a Novice reset. `classBlock()` and `changeClass()` restore the class snapshot. Gear is matched by identity, not cloned. |
| Base EXP requirements increase from 100 | The owner approved the tested 50% increase to Base requirements from Lv100. Job requirements, contract rewards and the measured offline EXP/min rule keep their existing formulas. See `baseNeedAt`, `needAt` and `base_pacing_sim.js`. |
| Ordered six-slot combos with recovery | Attacks cast once in player-selected order from the active class line, then recover for 3 seconds. Buffs and emergency healing are independent. Earlier jobs remain useful through inherited marks and follow-up effects. No Heat/SP meter. |
| Keep old IDs and save ownership | Renamed skills, appended pets, cosmetics and cloud sync must not reinterpret old progress or mix accounts. See migration, save-owner and cloud tests. |
| Pets come from drops, not hatching | Collection is part of farming. Training/Bond/skill rolls do not replace acquisition. See `PETS` and pet tests. |
| Daggers count as katars for katar skills | Owner decision (Milestone 4), to avoid problems with the Assassin Cross dagger. Skill execution does not check weapon type, so a dagger already triggers katar skills; any future weapon gate must accept a dagger wherever it accepts a katar. Guillotine Cross wears a katar, or a dagger in each hand, through `katarOnly()` and `dualWield()`. See `tools/tests/dual_wield_sim.js` and `tools/tests/fourth_job_skills_sim.js`. |
| Lv 150+ is an Ascension level, not Base Level | Owner clarification (Milestone 4/5). Base Level 150 and above is a separate Ascension level with its own stats; Job Level continues as normal and a later Ascension skill tab raises skill boost. Design note only: the 4th-job unlock gate uses Base Lv 150 and the Ascension track is not built. See `Updates/fourth-jobs/README.md`. |
| Fourth-job visuals use the latest skills and original native art | Owner approval (15 October 2026) uses five core RO skills per class (superseding the provisional three-skill package), authorizes recovery of all six native progression bodies and keeps classes locked during preparation. The fixed-look review pack does not authorize wardrobe costumes or a release. See `Updates/fourth-jobs/VISUALS.md`. |
| 4th jobs stay parked until instructed | Owner instruction (Milestone 4). The six 4th-job classes and their 30 skills are built behind `FOURTH_JOBS_LIVE=false` and stored as reference in `Updates/fourth-jobs/`. Flip the flag only on explicit owner instruction. |
| Preserve original sprite art | Supplied crops and pinned native sources define the artwork. Preserve pixels, native placement, layers and action timing; do not fill gaps with invented art. See native pipeline READMEs. |
| Distinct native bodies for both genders | Current ACT/SPR wardrobe uses each gender's native body and action data. The original shared-body instruction describes only the legacy packed fallback. |
| Cosmetics preserve gameplay | Wardrobe apply/cancel/reset must retain job, equipment and progression. See wardrobe game tests. |
| Reserve future progression bodies | Rune Knight, Warlock and Guillotine Cross body replacements were removed from wardrobe. The owner declined event outfits and cloak overlays. See the native wardrobe README and v128 history. New full-body choices need an explicit design decision. |
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
