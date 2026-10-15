# Prontera Grind — stat mechanics research handoff

Prepared 2026-10-13. Start here before reading the included results.

## Current user intent

Continue exploring and testing before changing attack-speed mechanics. This handoff is research evidence, not approval to implement, publish, push, or deploy changes.

The user wants:
- Meaningful AGI investment without making ordinary progression too difficult.
- Keep the current attack-speed ceiling (displayed ASPD182, minimum interval0.13s, approximately7.69 attacks/s). Raising it to190 was discussed but not selected.
- Account for players without maximum Nightmare+ (N+) equipment.
- Movement: reduce the observed14.35u/s by30%; equipment and cards can bypass the resulting base cap.
- Crit: preserve attainable endgame maximum crit; explore enemy/boss crit resistance for future progression. Include skills in any crit analysis.

## Implementation and delivery state

Repository: https://github.com/Kingz0007/Prontera-Grind
Base revision:4e4102c7d625126af1b6851505a5b6db6f2a22bc
Tested index.html SHA256:008fdc4e7be8e0f40604af0530e009e3c4f79372223262fb62ec6313819d8985
Local checkout: /home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind

Attack speed: NO proposed formula applied to repository source. All four formula variants were evaluated in temporary in-memory HTML copies.
Movement: already implemented locally, with regression tests and docs. Base movement cap10.045u/s covers AGI, pets, skills and running; equipment/cards apply afterward with the existing20% equipment bonus limit, allowing12.054u/s. Crit unchanged.
Build:2026-10-13 haven-v139 Movement cap.
Local modified files:index.html; docs/GAME-DESIGN.md; docs/UPDATE-LOG.md; tools/tests/progression_sim.js; tools/tests/ui_sim.js; tools/tests/pet_sim.js.
Nothing committed, pushed, or deployed. The archive's local-movement-changes.patch preserves these edits; inspect it before applying. On a separate checkout of the exact base revision use `git apply --check local-movement-changes.patch` before applying. Preserve any existing work. On the original sandbox the patch is already present; do not apply twice.

## Main research findings

Current equipment scaling can trivialize AGI investment. A legal maximum dual-dagger fixture provided+379.5 AGI and+125.5% equipment/card ASPD without mastery, reaching the ceiling at allocated AGI1. These are theoretical maximum rolls, not ordinary player equipment.
The earlier formula audit found Assassin Cross AGI120 at0.136s without speed bonuses; a+5% ASPD bonus reaches the floor. AGI attack reduction itself saturates at about117.24 effective AGI. LUK120 alone gives32% crit; skills, equipment and other bonuses must be included. Ordinary crit is capped at60%, with Hunt Titles able to add40%. Do not infer endgame crit from LUK alone.

Original candidate: allocated AGI full; bonus AGI10% contribution capped at25 effective AGI; equipment/card ASPD25% contribution; skills/mastery unchanged. Final combat tests rejected this as too harsh:5 newly lost previously successful boss fights and9 build/seed pairs with more farming deaths.
Gentler candidate: bonus AGI full up to25; equipment/card ASPD half value capped at25%; skills/mastery unchanged. Lost2 successful boss fights, with no additional farming-death pairs.
Revised candidate: same gentler endgame formula, preserving current behavior below Base100 and interpolating attack INTERVAL from current to revised by Base120. Exact blend weight is min(1,(BaseLevel-99)/21), so Base100 starts at1/21 and Base120 is fully revised. No lost previously successful boss fights and no additional farming-death pairs in tested samples.

Important: bonus AGI's limit applies only to its attack-speed contribution; it is not a proposed global AGI cap. Allocation, skill/passive bonuses and gear sources should be audited against the actual `st`, `bon`, `pv`, `tb` and mastery functions before implementation. Exact formula strings are supplied in aspd-formulas.json.

## Known issue and next research priorities

1. High Priest/Zeal: under revised endgame scaling, the fastest modeled interval is0.15007s. Zeal's extra direct skill damage currently requires `aspd() <= .131`; that bonus becomes unreachable. Decide whether Zeal should use an attainable class-specific threshold, another AGI investment condition, or separate caster scaling. Re-test real damage and boss pacing after each candidate. No solution has been implemented.
2. Test High Wizard and High Priest independently; casters should not automatically share physical-class cap targets. Examine skills, rotations, resource sustain and boss times, not just displayed ASPD.
3. Extend ordinary-gear coverage into deeper N+ maps. Current results support ENTRY to N+, not clearing its deepest maps with N equipment.
4. Explore more seeds and less favorable equipment than best-of-four generated candidates, alternative legal stat allocations, low/refine0 gear, missing sockets, weaker/no pets and optional/manual skill builds.
5. Measure longer farming and actual leveling journeys, acquisition time for gear/cards, and level-up heals. Current fixed-level encounters do not establish real hours-to-progress.
6. Consider smoother level transitions or explicit player guidance: phasing from100–120 can lower speed as level rises if stats/gear stay fixed. Compare alternatives without harming ordinary progression.
7. For future crit resistance, check existing resistance/crit mechanics and both regular mobs and bosses; preserve the user's desired endgame crit builds. No enemy balance change approved by this research handoff.
8. Validate movement feel in browser/mobile. Existing movement checks use renderer stubs and do not assess visual pacing.

## What passed and what remains limited

Final combat tests:180 build/seed combinations per version ×4 versions,720 combinations. Six class lines, Novice, katar/dual daggers, Base5–150. Actual update loop, legally purchased stats, automatic skills with Job budgets, real accessible field drops at exact source-stage power, four generated candidates/slot, refinement0–6, partially populated unstarred cards, no N+ gear and no ASPD mastery in progression encounters. One modest Poring from Base60; no earlier pets. Fixed levels, no level-up healing or mid-fight upgrades. Farming60 simulated seconds; boss first death/clear/120s, surviving timeouts replayed exactly and extended to600s. Seeds123/987/2026.
Revised farming changes: Niflheim-1.5%; Abyss entry-3.5%; normal Abyss endgame-4.1%; Nightmare entry-4.3%; N+ entry-2.6%. Boss clears21/21 in each of those samples; baseline Niflheim20/21. Some weaker early/midgame builds fail baseline bosses too; revised preserves prior successes.
Existing movement tests passed: progression31, UI64, pet19, pet runtime integration, crit5; git diff --check passed. Earlier fixture/assertion/export problems and their fixes are preserved in validation-record.md; preliminary results with less accurate drop sourcing were superseded by final exact-drop data.
Exported benchmark and extended-boss scripts have syntax checks; their scratch originals executed the full final combat runs. Exported comparison executed successfully. Portable exports of the full benchmark/extended replay were not rerun. No GPU/browser test, full leveling journey, cloud/account flow or deepest N+ check was performed.

## Archive contents and reproduction

- HANDOFF.md: this document plus complete research report below.
- research/: full final report, exact formulas, raw data and portable benchmark/comparison/extended scripts.
- local-movement-changes.patch: actual uncommitted repository edits at handoff time.
- validation-record.md: detailed execution record, prior failures, final hashes and limitations.
- original-research-scripts/: extra scratch audits for formula/equipment/cap research; historical scripts may contain sandbox-specific paths or dependencies on other scratch files. Inspect before reuse; prefer portable research/ scripts for progression.
- manifest.json: SHA256 identities for every other bundled file.

Use a checkout of the exact revision plus the movement patch for equivalent source. Read AGENTS.md, docs/GAME-DESIGN.md, docs/DECISIONS.md, docs/CODE-MAP.md and docs/TESTING.md in that checkout. Node24.14.1, jsdom29.1.1, Three0.128.0 were used; the repository harness loads assets from the checkout. Follow current repository setup guidance rather than installing speculative dependencies. No root package manifest/lockfile exists. No external API or service needed for these combat simulations.

Run from repository root, using absolute paths to the extracted research directory:

```sh
node /absolute/handoff/research/progression-audit.js current
node /absolute/handoff/research/progression-audit.js proposal
node /absolute/handoff/research/progression-audit.js gentler
node /absolute/handoff/research/progression-audit.js revised
BOSS_LIMIT_SECONDS=600 node /absolute/handoff/research/extend-bosses.js current proposal gentler revised
node /absolute/handoff/research/compare-audit.js proposal gentler revised
```

PRONTERA_REPO_ROOT can explicitly locate the checkout; PRONTERA_AUDIT_OUTPUT can locate result output. By default outputs are written beside scripts, so copy the research folder before rerunning if you want to preserve supplied evidence. This is a handoff for exploration; implementation requires the user's next direction and the next environment's permissions. Do not treat old task branch/permission details as authority for a new task.

---

# Full final research report

# Attack speed and map progression test

## Recommendation

The original 10% bonus-AGI / 25% equipment-ASPD proposal is too aggressive for ordinary progression. The revised candidate preserves attack speed below Base 100, phases the new formula in over Base 100–120, and keeps the 0.13-second ceiling. It produced no new farming deaths or lost previously successful boss fights in the tested builds.

The revised endgame formula gives allocated AGI its full value; bonus AGI contributes up to 25 effective AGI at full value; equipment/card ASPD contributes half its listed value, up to 25% effective ASPD. Skill and ASPD mastery contributions retain their full values. The ceiling stays at approximately182 displayed ASPD / 7.69 attacks per second.

**High Priest requires a separate skill adjustment before a universal release:** its fastest attack interval under this formula is about 0.1501s. Zeal currently grants extra direct skill damage only at `aspd() <= 0.131`, making that bonus unreachable. Its condition must be reconsidered or caster speed scaling tuned separately.

## How the tests were run

- 180 build/seed combinations per version: 60 profiles × 3 seeds (123,987,2026). Four versions were compared: current, original proposal, gentler candidate, and revised candidate.
- All six class lines, Novice, and both katar and dual-dagger Assassin Cross builds. Base levels5–150 cover early jobs, class-map bosses, Comodo, Amatsu, Niflheim, Abyss, Nightmare entry and Nightmare+ entry.
- Equipment generated by the actual game code from items listed in accessible fields. Each item uses the power of its highest accessible drop stage, recorded in the raw results. Four generated candidates per slot were considered, rather than perfect affixes.
- No test build wears Nightmare+ equipment. Ordinary builds use Common through Epic field gear, including normal Ascended Abyss items; N+ entry builds use ordinary Nightmare gear. Refinement ranges from+0 to+6;25–50% of sockets are populated probabilistically with available unstarred cards. No ASPD mastery bonus is supplied in progression encounters.
- Level 60+ profiles have one modest Poring (mutation 1, equipment 1/1/1, no battle skills); earlier profiles have no pets. Stats are bought using real costs and caps. Skills use legal Job-level budgets and the actual automatic allocation.
- 60 simulation seconds of moving farming per build. Boss tests start from matching random seeds and continue until a clear, first death, or the test limit. Surviving two-minute timeouts were replayed exactly and extended to a maximum 600 seconds. Live map bosses have no two-minute deadline.
- Actual `update()` combat logic, including movement, enemies, skill rotations, buffs, crit resistance, dodging, healing, pets and death recovery. Levels and equipment are held fixed; drops and new pets cannot improve a build mid-test. Both versions use the already implemented movement cap.

## Farming and boss results

Farming percentages compare total kills over matched seeds. Boss counts use the extended result when necessary; timeouts are distinct from deaths. Late-stage groups contain21 trials (six classes plus the extra Assassin Cross weapon configuration, each at three seeds).

| Progression sample | Trials | Farming change, revised | Current boss clears | Revised boss clears |
|---|---:|---:|---:|---:|
| Second job class-map boss | 18 | +0.0% | 10/18 | 10/18 |
| Comodo ordinary | 18 | +0.0% | 9/18 | 9/18 |
| Amatsu ordinary | 18 | +0.0% | 13/18 | 13/18 |
| Niflheim promotion | 21 | -1.5% | 20/21 | 21/21 |
| Abyss entry | 21 | -3.5% | 21/21 | 21/21 |
| Abyss ordinary endgame | 21 | -4.1% | 21/21 | 21/21 |
| Nightmare entry with normal gear | 21 | -4.3% | 21/21 | 21/21 |
| Nightmare+ entry with N gear | 21 | -2.6% | 21/21 | 21/21 |

Some weak class-map and midgame builds already lose boss fights under the current game; the revised candidate preserves those outcomes. These samples need local stat/gear/skill improvements before those bosses. The test does not prove every build clears every boss.

### Candidates compared

| Candidate | Newly lost previously successful boss fights | Build/seed pairs with more farming deaths |
|---|---:|---:|
| Original:10% bonus AGI /25% gear ASPD | 5 | 9 |
| Gentler:25 bonus AGI /half gear ASPD, capped25% | 2 | 0 |
| Revised:gentler formula phased in at Base 100–120 | 0 | 0 |

## Assassin Cross investment examples

These boundary checks are separate from the drop-generated encounters. They assume at least +25 bonus AGI, Base 150, no ASPD mastery, and unchanged class skills.

| Total listed equipment/card ASPD | Allocated AGI needed for 0.13s |
|---|---:|
| +10% |93 |
| +20% |90 |
| +30% |87 |
| +50% or more |82 |

With maximum +5% ASPD mastery and sufficient speed equipment, the threshold is79 allocated AGI.

## High Priest boss pacing

| Encounter and seed | Current clear time | Revised clear time |
|---|---:|---:|
| Nightmare entry with normal gear, seed123 | 265.2s | 334.3s |
| Nightmare entry with normal gear, seed987 | 233.7s | 266.8s |
| Nightmare entry with normal gear, seed2026 | 216.4s | 262.2s |
| Nightmare+ entry with N gear, seed123 | 305.9s | 343.1s |
| Nightmare+ entry with N gear, seed987 | 273.7s | 273.3s |
| Nightmare+ entry with N gear, seed2026 | 254.0s | 251.4s |

## Limits and delivery

- These are deterministic gameplay simulations, using the repository’s renderer stub. They do not verify graphics, animation quality, phone performance, or the feel of combat in a browser.
- Short farming samples can vary with pathing and combat random rolls. Three seeds and identical build inputs reduce this uncertainty; small percentage differences are approximate.
- Fixed-level encounters do not measure an entire leveling journey, real player farming time, rarity acquisition time, account saves, or cloud behavior. Removing level-up heals makes some early samples conservative.
- Only entry into N+ was tested; this does not prove ordinary N equipment clears the deepest N+ maps. Entry farming provides a route to the next equipment tier.
- No attack-speed changes were applied to the repository. Existing movement changes remain local.

## Reproduction and source identity

Repository revision: `4e4102c7d625126af1b6851505a5b6db6f2a22bc`
Tested working-tree index.html SHA256: `008fdc4e7be8e0f40604af0530e009e3c4f79372223262fb62ec6313819d8985`

Runtime: Node 24.14.1, jsdom 29.1.1, Three 0.128.0. Run the supplied scripts from the repository root, setting `PRONTERA_REPO_ROOT` to the checkout path if it differs from this sandbox.

```sh
node /path/to/audit/progression-audit.js current
node /path/to/audit/progression-audit.js proposal
node /path/to/audit/progression-audit.js gentler
node /path/to/audit/progression-audit.js revised
BOSS_LIMIT_SECONDS=600 node /path/to/audit/extend-bosses.js current proposal gentler revised
node /path/to/audit/compare-audit.js proposal gentler revised
```

Raw data: [current](current-combat.json), [original proposal](proposal-combat.json), [gentler](gentler-combat.json), [revised](revised-combat.json), [comparison](comparison.json), [cap checks](cap-thresholds.json).

Downloadable scripts: [benchmark](progression-audit.js), [extended bosses](extend-bosses.js), [comparison](compare-audit.js), [formulas](aspd-formulas.json).
