# Class skill redesign (v97)

The game defines 91 skill slots: five per class and one for Novice. Descendants retain inherited skills. Sword jobs use swords; every Assassin-line attack supports katars and daggers. Attacks and buffs run automatically on cooldown, with no mana or manual resource rotation.

## Combat

- Direct attacks include split-hit bursts, line/cone/radial shapes, dashes, timed explosions, marks, and a short bleed.
- Shadow Dash and Phantom Rush close to melee; they strike in place in the stationary trial.
- Snare Trap roots bosses for at most 1.25 seconds, followed by 3 seconds of root resistance. Root does not prevent attacks.
- Holy classes deal personal damage. Searing Light adds low-health healing; Holy Echo repeats a small part of every fourth holy cast.
- Buffs refresh independently. Maximum Power Thrust replaces Overthrust. No buff drains health or requires a health threshold.
- Offensive casts use oldest-cast priority; multiple skills in a swing share the existing diminishing multipliers. Multi-hit attacks divide a total coefficient across their hits.
- Each attack's rank curve is independent and strictly increasing. Learning a different skill does not reduce its coefficient. Companion calibration is constant per class.

The existing stat, equipment and critical formulas remain. Training bonuses preserve the stats attached to replaced passive slots and are listed in tooltips. This isolates the skill changes from a second stat-system rebalance. Boss HP is unchanged.

## Saves

Save version 2 refunds legacy skill ranks through the existing earned-minus-spent ledger, retaining First Aid. Equipment, job levels and stats are preserved. Played classes get a one-time free stat reset. Auto-allocation first learns attacks, then every available first rank before raising higher ranks. Migration is idempotent.

## Reproduce validation

The optional real-game harness needs Node, jsdom 26 and Three.js r128. Install them outside the checkout:

```sh
npm install --prefix /tmp/prontera-test-deps --no-audit --no-fund jsdom@26 three@0.128.0
export NODE_PATH=/tmp/prontera-test-deps/node_modules
node tools/tests/skill_redesign_sim.js
node tools/skill_balance.js --baseline
node tools/skill_balance.js
SKILL_SEED=987 node tools/skill_balance.js --baseline
SKILL_SEED=987 node tools/skill_balance.js
node tools/tests/skill_balance_sim.js
node tools/skill_encounters.js --baseline
node tools/skill_encounters.js
node tools/check_skill_encounters.js --strict
```

The baseline is frozen at `731426a73612bcd0550f0823361978830d214f76`. Stationary tests run the actual update loop for 20 seconds of warm-up and 300 seconds of measurement. Two seeds cover 19 classes, three legal rank/stat profiles, single/three targets, and both advanced Assassin weapons: 252 comparisons. The source hash guards against accepting stale results. `--quick` uses separate diagnostic files and never satisfies the full gate.

Moving checks use real spawn, damage, recovery and kill logic: 180 seconds of farming and five independent boss attempts per setup, with and without a modest pet. Boss attempts reset RNG, cooldowns, positions and transient effects. Defeats are recorded separately. `SKILL_FIELD_SECONDS=1800` extends farming; `--nightmare` selects stages 13/15 (use `SKILL_CLASSES` to select eligible classes). These use different encounters from the stationary fixtures and must be interpreted separately.

## Balance limits

The frozen stationary gate is ±5% single-target DPS, ±10% three-target DPS, and ±5% average companion power, against each class's own old result. No cross-class equalization is applied.

**Moving encounter gates remain separate:** burst, crowd control and movement change short fights and farming. The strict encounter checker reports each deviation from the proposed ±5% farm/boss-time target and any reduced boss success. Passing stationary checks does not establish equivalent farming or boss survival. Current fixtures are controlled samples, not exhaustive coverage of cards, mastery, every equipment combination, Nightmare or 30-minute farming.

Do not retune boss HP to hide a failed comparison. The initial fit helper refuses to overwrite an already fitted table; any changes to tuning require fresh source-matched measurements and rank-monotonicity checks.
