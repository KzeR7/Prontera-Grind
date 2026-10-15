# Handoff: 4th Jobs (Milestone 4)

Read this first. [README.md](README.md) is the reference spec; this file says where work stopped,
what is verified, what is still open, and how to pick it up.

## Snapshot (2026-10-15)

- **Branch:** `arena/20c27edf-prontera-grind` (session-fixed; do not switch branches).
- **Last commit:** `840758c` — "4th jobs: 18 signature skills and mechanics, parked". Local only.
  Not pushed, no PR, no merge, no deploy.
- **Live game:** unchanged. `FOURTH_JOBS_LIVE = false` in `index.html`; 19 classes, 91 skills,
  `BUILD = '2026-10-15 haven-v152 Season 2 Maps and chosen skill effects'`.
- **Owner instruction still outstanding:** do **not** flip the flag or bump `BUILD` until the owner
  explicitly says to unlock the classes.

## Where things are

| What | Where |
| --- | --- |
| Six 4th-job classes (roster rows) | `index.html` → `CD4` (under `FOURTH_JOBS_LIVE`) |
| Unlock gate (Base Lv 150 + parent Job Lv 50) | `index.html` → `ADV4_BASE_LV`, `classBlock()` |
| Pacing offset | `index.html` → `JOFF` (5th entry = 100) |
| 18 skills + mechanic comment | `index.html` → `SKILLS4` (just above the `SKILLS` normaliser) |
| Mechanic runtime | `index.html` → `addSelfStack`, `takeSelfStacks`, `addTargetStack`, `takeTargetStacks`, `strikeMilestone`, `bounceStrike`, `startAbsorb`, `absorbSoak` (beside `chainHit`); hooks inside `castSkill` and the player-damage line |
| Flag-gated icon aliases and FX kinds | `index.html` → `if(FOURTH_JOBS_LIVE)` block after `SKILL_VISUAL_REDESIGN` |
| Dagger = katar rule | `index.html` → `katarOnly()` (now includes Guillotine Cross) |
| Tests | `tools/tests/fourth_job_sim.js` (20), `tools/tests/fourth_job_skills_sim.js` (25), `tools/tests/dual_wield_sim.js` (14) |
| Balance fixtures | `tools/tests/fixtures/progression_{gear,encounters,skills}.json` — regenerate with `node tools/progression_balance.js` (gear), `--encounters`, `--skills` |
| Owner-facing log | `docs/UPDATE-LOG.md` (entry "4th-job skills and mechanics, slice 2") |
| Decisions | `docs/DECISIONS.md` (three new rows: dagger = katar, Ascension clarification, parked until instructed) |

## Verified

- Full JS gate: 86 `*_sim.js` / `*_smoke.js` suites, all exit 0.
- Python generated-asset checks (`make_sprite_viewer.py`, `make_class_skins.py`, `make_weapon_pack.py`, all `--check`): current.
- Fixtures regenerated: hash-only changes; measured numbers identical to the previous run.
- `publish_sim.js` passes, so `Updates/` stays out of the published site.

## Still open (fill these in, then tick them here)

Status key: **[ ]** not started · **[~]** partly done · **[x]** done. Owner = who must decide or supply.

- [ ] **Owner: unlock.** Explicit instruction to flip `FOURTH_JOBS_LIVE` and bump `BUILD`.
- [ ] **Owner: `JOFF[4] = 100` pacing.** Kept as built (Job Lv 1–50 ↔ Base 101–150). Confirm once the Ascension design is settled.
- [ ] **Owner: native bodies (ROADMAP Milestone 4, Phase B).** The 4th jobs wear parent packed bodies. New body choices need an owner decision (`docs/DECISIONS.md`, "Reserve future progression bodies").
- [ ] **Owner or agent with sheets: skill icons and FX.** The 18 skills reuse native art by alias (`ART4` in `index.html`). Their own art is not made; do not repaint existing sprites.
- [ ] **Agent: Afterglow V6 effects** for the 4th-job skills. Not generated.
- [ ] **Owner: Ascension aura and Ascension track.** Design note only. Lv 150+ is a separate Ascension level with its own stats; a later Ascension skill tab raises skill boost. Nothing is built.
- [ ] **Agent/owner: Crucible rite panel.** `changeClass()` stands in for the rite.
- [ ] **Owner: balance.** Stat multipliers (`aspd`, `atk`, `hp` in `CD4`) and skill numbers (`SKILLS4`) are provisional. Tune with the new mobs and bosses, then regenerate fixtures.
- [ ] **Agent: browser check.** Nothing has been looked at in a real browser with the flag on: Class Tree row, skill cards, combo bar, icon aliases, the absorb ward and bounce visuals. Do this before the unlock.
- [ ] **Agent: flag-on roster suites.** Several live-page checks will fail once the flag is on (19 → 25 classes, 91 → 109 skills, `JOFF` length, Class Tree rows). Update them deliberately; the go-live checklist in the README lists them.
- [ ] **Owner question: 4th jobs in the Transcendent collection.** The current build keeps the 3rd-job collection at six (the `fourth_job_sim.js` test pins this). Confirm that is intended.

## Gotchas for the next agent

- **Dark-launch discipline.** Anything 4th-job-specific must sit behind `FOURTH_JOBS_LIVE`, or the live fixtures and pins will shift. The only live-code edits are no-op for live skills (`castSkill` hooks check fields only the 4th-job skills have; `absorbSoak` returns the damage untouched with no ward; `katarOnly` gains a class that does not exist live).
- **`combatHash` covers the combat region of `index.html`.** Any edit inside it makes `skill_balance_sim.js` fail until the fixtures are regenerated. Regenerate all three modes, then check the diff is hash-only.
- **The baseline commit `d164bd05` must exist locally.** The balance tools diff against it. If it is missing after an environment reset, run `git fetch --quiet origin d164bd0527cfe335f9c183d0e576800716b7dd26`.
- **`node_modules` is not committed.** Reinstall with `npm install --no-save --package-lock=false jsdom three@0.128.0`. Do not change `package.json`.
- **Test harness pitfalls seen so far:**
  - Node's `deepStrictEqual` fails on arrays from the jsdom realm. Use `JSON.parse(ev(...JSON.stringify...))` (the `probe` helper in `fourth_job_skills_sim.js`).
  - Do not name a local `const fresh` in a probe: it shadows the game's `fresh()` and throws a temporal-dead-zone error.
  - Check counts against the real code, not guesses. Two wrong guesses this session were the live skill count (it is 91) and the Hunting Pounce hit count (2).
- **Roulette strikes and bounces use per-hit damage** (`raw / hits`), so "an extra cut for 60%" means 60% of one cut.
- **Warg Strike's 25% chance** is the owner's example; it is the only roulette number the owner has given.
- **The `skillHit` override in the skill sim** persists in the page for the rest of that run. Each probe resets it, so keep new probes self-contained.

## How to resume

```sh
cd /home/user/Prontera-Grind
git status && git log --oneline -3          # expect 840758c on top, clean tree
npm install --no-save --package-lock=false jsdom three@0.128.0   # only if node_modules is missing
node tools/tests/fourth_job_sim.js          # 20/20 (flag on copy, live-page checks)
node tools/tests/fourth_job_skills_sim.js   # 25/25
node tools/tests/dual_wield_sim.js          # 14/14
for t in tools/tests/*_sim.js tools/tests/*_smoke.js; do node "$t" || echo "FAIL $t"; done
```

Before any push, run the full gate in `docs/TESTING.md`, including the three Python `--check` commands. Do not push, merge or deploy without an explicit instruction.
