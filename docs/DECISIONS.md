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
