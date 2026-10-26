
## 2026-10-13 — stat-cap mechanics investigation
- Repository: Kingz0007/Prontera-Grind; revision `4e4102c7d625126af1b6851505a5b6db6f2a22bc`; clean working tree; no repository edits.
- Selected coverage: evaluate actual ASPD, crit and AGI movement declarations with controlled stat/bonus inputs to verify the recommendation's factual basis. No gameplay change or broad suite required.
- Completed: `node /tmp/prontera-stat-cap-audit.js`, cwd `/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind`, passed, exit 0. Node v24.14.1; no services/dependencies/fixtures beyond built-in Node modules. index.html SHA256 `61c69021afdc16d6b07b0768fed03c3b572699a440efa55aee98ee2bae501c17`; audit SHA256 `5391581a7b3032dd4cf9da6450eabfacdf4d9c55c84659d4ee5a534e1f88daa0`.
- Observed: Assassin Cross total AGI120 attack interval 0.136s, capped at 0.13s with +5% ASPD; LUK120 alone crit32%; AGI attack reduction saturates at 117.24; movement rises from 8.6834 at AGI120 to 10.7950 at AGI200. Source inspection verifies equipment movement caps at20% and ordinary crit at60% with Hunt Titles adding40%.
- Earlier inline audit failed an exact floating-point equality assertion (0.13599999999999998 vs0.136), Node exit1; corrected audit uses tolerance and passes. This was a scratch-check issue, not a game defect.
- Outstanding: none for this investigation. Proposed balance changes have not been implemented or playtested.

## 2026-10-13 — movement cap and speed equipment audit (in progress)
- Selected checks outstanding: real-runtime equipment audit (roll maxima, legal socket limits, bonus aggregation); progression_sim.js (movement behavior); ui_sim.js (sheet/guide); pet_sim.js and pet_game_sim.js (movement consumers); crit_sim.js (preserved crit behavior). Add combat suites if ASPD tuning changes. Prior formula audit is historical only once formulas change.
- Repository cwd `/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind`, starting revision `4e4102c7d625126af1b6851505a5b6db6f2a22bc`. Node v24.14.1; installed jsdom and Three available; no service required for simulations. Record final hashes and results after edits.

- First movement check pass: progression 30, pet 19, pet runtime integration and crit 5 passed (exit0); UI 63 passed/1 failed (exit1): existing check expects the Swift Mount description. Description restored. New actual hero displacement regression added. UI and progression outstanding again. Pet and crit checks reusable: subsequent changes only stat-sheet text and progression tests, no relevant formulas/dependencies changed.
- Equipment audit: `node /tmp/prontera-equipment-audit.js` passed exit0 against original index.html SHA256 `61c69021afdc16d6b07b0768fed03c3b572699a440efa55aee98ee2bae501c17`; script SHA256 `abc27a06e7b661ece8f9804dfac9b71ce8de33be64fd163102c54a5cf1c6622a`. Maximum legal dual-dagger speed fixture: +379.5 AGI, +125.5% ASPD from equipment/cards; no mastery. ASPD cap reached at allocated AGI1. jsdom29.1.1/three0.128.0, Node24.14.1, synthetic runtime with renderer stub.
- Executed check commands: `node tools/tests/{progression_sim,ui_sim,pet_sim,pet_game_sim,crit_sim}.js` individually, cwd above. First tested index SHA256 b08ad668952ce1560ac78b10d5118ad8888e31df38a291cd125aa85256d7e45f. Current inputs for follow-up:
```json
{
  "index.html": "008fdc4e7be8e0f40604af0530e009e3c4f79372223262fb62ec6313819d8985",
  "tools/tests/progression_sim.js": "11157264eedf544cbacc9e474007e403c85cad3c3657cc069c9d317c1ad9e7d3",
  "tools/tests/ui_sim.js": "5e8884260fe1f05e9447280b3b8be389cc5e2a74c0479286dea55b151962f579",
  "tools/tests/pet_sim.js": "f5d1f414cbfc0b9d500df6ed721b3822b5524cdf8a9953e168cbe605ed060006",
  "tools/tests/pet_game_sim.js": "777f1ca7d2d1b16133aa96bb777246aeb9d2167353b2c90254a92771198ff629",
  "tools/tests/crit_sim.js": "4a973396600e6777c6fa3ce330735c5813bd918b5fa60d2018e08ef4e62d96a9",
  "tools/tests/helpers/game.js": "df376c4e60eaccb03e9ddbab3b30e8b8075e1adfefcaa5a72fa8def280a90c9a"
}
```

- Follow-up `node tools/tests/ui_sim.js`: passed64, exit0. `node tools/tests/progression_sim.js`: initially failed new displacement fixture (random roaming target); fixed fixture to target (0,10), rerun passed31, exit0. Production code unchanged by fixture fix. Existing pet/crit passes retained. Browser visual movement verification not performed; simulations use a renderer stub. Review and final whitespace check outstanding.

- Final `git diff --check`: passed, exit0. Final inputs below. Progression31/UI64 passed at these code/test inputs; pet19/pet runtime/crit5 reused from this turn because only unrelated sheet text and progression test fixtures changed afterward. No root package/lockfile; dependencies unchanged (Node24.14.1/jsdom29.1.1/three0.128.0). No server, cloud data or external fixture used. ASPD tuning remains pending user clarification, so no ASPD behavior changed.
```json
{
  "index.html": "008fdc4e7be8e0f40604af0530e009e3c4f79372223262fb62ec6313819d8985",
  "tools/tests/progression_sim.js": "221a740553c696be3fd0a6167f93509cbb37ed678243561d1d3609a11c8091b0",
  "tools/tests/ui_sim.js": "5e8884260fe1f05e9447280b3b8be389cc5e2a74c0479286dea55b151962f579",
  "tools/tests/pet_sim.js": "f5d1f414cbfc0b9d500df6ed721b3822b5524cdf8a9953e168cbe605ed060006",
  "tools/tests/pet_game_sim.js": "777f1ca7d2d1b16133aa96bb777246aeb9d2167353b2c90254a92771198ff629",
  "tools/tests/crit_sim.js": "4a973396600e6777c6fa3ce330735c5813bd918b5fa60d2018e08ef4e62d96a9",
  "tools/tests/helpers/game.js": "df376c4e60eaccb03e9ddbab3b30e8b8075e1adfefcaa5a72fa8def280a90c9a",
  "tools/tests/helpers/progression.js": "71927ff61dcc2e8e49d8d859ffb6bbbc1a9ba299f195c6fe813fe7e82fe0d154",
  "docs/GAME-DESIGN.md": "6ee4169cd9c70b1caa3087a47d85ac4a97858700fd5b3d84474445cddd2fcf28",
  "docs/UPDATE-LOG.md": "a21f8e8cf4eb62aa17378671972b474bbc865d65e421e192ba4d30df839b0e18"
}
```

## 2026-10-13 — proposed AGI investment tuning (analysis only)
- Selected outstanding check: `node /tmp/prontera-aspd-proposal.js` from repository root. Model source class multipliers, max learned skills and speed buffs; simulate allocated AGI versus equipment AGI/ASPD budgets. Proposal: allocated AGI full value; bonus AGI contributes 10%, at most25 effective AGI; equipment ASPD contributes25%; skills/mastery unchanged; floor0.13s unchanged. No repository implementation authorized by this explanation request. Existing movement passes retained: inputs unchanged.
- `node /tmp/prontera-aspd-proposal.js`: passed, exit0. Node24.14.1/jsdom29.1.1/three0.128.0, real class/skill definitions with renderer stub and synthetic aggregate equipment budgets; no external services. Repository revision 4e4102c7d625126af1b6851505a5b6db6f2a22bc. No repository edits this turn.
- Results: Assassin Cross allocated AGI threshold103 with +105 bonus AGI/+30% gear ASPD;92 with +175/+60%;79 maximum katar;76 maximum dual daggers. All assume +5% mastery ASPD; bonus AGI budgets include mastery. Active skill bonuses read real maximum ranks. At strongest modeled gear, Lord Knight and Whitesmith cap at89, Sniper80; High Wizard and High Priest remain slower (0.2023s/0.1488s atAGI120). Proposal is not a verified universal six-class balance: caster tuning requires separate consideration.
```json
{
  "index.html": "008fdc4e7be8e0f40604af0530e009e3c4f79372223262fb62ec6313819d8985",
  "tools/tests/helpers/game.js": "df376c4e60eaccb03e9ddbab3b30e8b8075e1adfefcaa5a72fa8def280a90c9a",
  "/tmp/prontera-aspd-proposal.js": "895125ccefb0f2123767deddcb3b8187b710d2dec66224e6bd4c07631e52d829"
}
```

## 2026-10-13 — progression combat comparison (in progress)
- Selected checks outstanding: temporary real-update benchmark across six job lines, legal stat/skill budgets, actual generated equipment from prior accessible fields, partial unstarred sockets, modest refine levels, seeded farming and boss combat. Compare current and proposed ASPD in separate in-memory HTML copies; preserve current movement patch in both. No benchmark rerun can be reused from prior algebra-only proposal checks.
- Commands will run from `/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind`; Node24.14.1/jsdom29.1.1/three0.128.0; real source and renderer-stub game harness; no external services. Scratch benchmark in /tmp, final reports under workspace/output. Repository formulas will not change during this validation request.
- First baseline/proposal benchmark attempts exited1 after18 scenarios because a single Nightmare Geffen gear pool lacks Lord Knight weapons. Fixture corrected to source class-appropriate Nightmare maps; Merchant sources Izlude. No game defect. Both complete runs remain outstanding.
- Partial reruns terminated to tighten encounter pairing: each farm/boss encounter now resets its own seed, preventing farm RNG divergence from affecting boss initial conditions. Starter fixture now tests NoviceLv5/stage3 and retains the stronger initial knife; prior NoviceLv8/stage9 fixture was overly aggressive. Full current/proposal runs outstanding; partial outcomes are preliminary, not final evidence.
- Added a gentler candidate to resolve preliminary ordinary-gear regressions: bonus AGI retains full speed value up to25 effective AGI; gear/card ASPD contributes half value up to25%; skill/mastery effects and0.13s floor retained. Benchmark script expanded only by variant selection; running current/proposal scenarios and configurations unchanged. Additional candidate check outstanding.
- Current and proposal full benchmarks completed180 builds each, exit0. Comparison assertion found pre-encounter ATK snapshots included residual active buffs from the preceding scenario; encounters themselves reset all combat state and are unaffected. Normalize reporting snapshots from fresh configuration, assert gear/stats/skill ranks identical, and preserve measured encounter outputs byte-for-byte. Comparison check remains outstanding.
- All current/proposal/gentler runs passed180 configurations each (exit0). `node /tmp/prontera-normalize-audit.js current proposal gentler` passed (exit0), proved fixtures equivalent and all measured combat outputs preserved. Earlier normalization failed strict cross-realm object comparison (exit1); corrected JSON normalization. `node /tmp/prontera-compare-audit.js proposal gentler` passed, exit0. Original proposal:6 new boss deaths and9 new120-second timeouts; gentler:3 new boss deaths and6 new timeouts. Revised candidate selected outstanding to protect Base1–99 and phase gentler scaling in by120. Extended300-second checks selected for surviving boss timeouts because live boss fights do not have the benchmark timer.
- Initial final comparison passed: revised had0 new boss losses and0 new farming deaths; extended surviving bosses all eventually cleared. A final fixture audit identified gearPool-based fixtures could use a field power above the highest stage that actually drops a named item. Tightened generation to actual fieldOf drop entries at their highest accessible stage, and records exact source stage/power per item. Selected all four final benchmarks outstanding to remove this potential optimism. Earlier benchmark results remain evidence for the earlier fixtures, not final exact-drop figures.
- Exact-drop benchmark initially exited1 on Swordman: IzludeStage6 does not yet drop a sword in the first-job band. Fixture now uses the strongest accessible earlier-band weapon when the requested band has no compatible weapon. This preserves real drop availability instead of inventing an item. Final four runs remain outstanding.
- Selected additional boundary check outstanding: `node /tmp/prontera-cap-check.js`, compiled revised ASPD in temporary HTML; verify allocated-AGI thresholds, unchanged ceiling, and maximum caster/Zeal interaction. This is a formula boundary check using aggregate bonuses, separate from drop-accurate combat fixtures.
- Final exact-drop runs: `node /tmp/prontera-progression-audit.js current`, `proposal`, `gentler`, `revised` all completed180 builds each, exit0. Generated items now come from fieldOf-listed drops with exact accessible field power and source stage; partial unstarred cards and legal points validated. Derived reporting stats start with cleared buffs. Earlier broad-pool fixture reports superseded by these files. Final extended boss comparison outstanding.
- `node /tmp/prontera-cap-check.js`: passed, exit0. At Base150 with25 equipment AGI and no ASPD mastery, Assassin Cross reaches0.13s at allocated AGI93/90/87/82 for raw gear ASPD10/20/30/50%; with max ASPD mastery threshold79. Boundary check finds High Priest fastest modeled interval0.15007s, so live Zeal condition `aspd()<=.131` cannot trigger under the revised endgame formula. This is an unresolved design issue before universal implementation, not a failed benchmark script.

## 2026-10-13 — final progression comparison and deliverables
- Repository revision `4e4102c7d625126af1b6851505a5b6db6f2a22bc`; cwd `/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind`. No repository edits during this validation request. Existing movement test passes reused: production/test/dependency inputs unchanged. No attack-speed proposal applied to tracked source.
- Final exact-drop coverage: 60 legal builds × seeds123/987/2026 × four formula versions; all six job lines and both Assassin Cross weapons; Base5–150; real update loop; renderer stub; +0–6 gear, partial unstarred cards, no N+ equipment or ASPD mastery. Matched encounter seeds; fixed levels/equipment. Node24.14.1/jsdom29.1.1/three0.128.0, existing installed dependencies; no external service. No root lockfile/package manifest.
- `BOSS_LIMIT_SECONDS=600 node /tmp/prontera-extend-bosses.js current proposal gentler revised`: passed exit0, replayed surviving120s timeouts exactly and extended boss encounters. `node /tmp/prontera-compare-audit.js proposal gentler revised`: passed exit0, asserted equal stat/gear/skill fixtures. These are final exact-drop results, superseding earlier fixture comparisons.
- `python3 /tmp/prontera-write-report.py`: final report generation passed exit0 from workspace root. Earlier report attempt failed on starter knife without refine; corrected missing refine to0.
- Original proposal lost5 previously successful boss fights and added farming deaths in9 pairs; gentler lost2/added0; revised lost0/added0. Revised sampled Abyss/Nightmare/N+ entry bosses21/21 each, farming roughly2.6–4.3% slower. Weak earlier builds still sometimes fail baseline bosses. High Priest Zeal trigger becomes unreachable under endgame scaling; class-specific adjustment remains required before implementing universally. Deep N+ maps and a complete leveling journey were not tested.
- Exported extend-bosses.js initially failed syntax validation (exit1) due incorrect source slicing. Fixed export boundary; standalone `node --check /home/vercel-sandbox/workspace/output/stat-balance/extend-bosses.js` passed exit0. Standalone checks for progression-audit.js and compare-audit.js at the same output path each passed exit0. Checks cwd workspace root; no browser or service required.
- `node /home/vercel-sandbox/workspace/output/stat-balance/compare-audit.js proposal gentler revised`: passed exit0 from repository root, confirmed portable exported comparison and final data. Portable full benchmark/extended replay not rerun: their executed scratch originals supply combat evidence; exported scripts have syntax checks only except comparison.
- No outstanding simulation check. Outstanding design requirement: High Priest/Zeal compatibility before universal attack-speed implementation. Outputs are recommendations and reproduction tools.
- Final reproducible input/output SHA256 identities:
```json
{
  "/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind/index.html": "008fdc4e7be8e0f40604af0530e009e3c4f79372223262fb62ec6313819d8985",
  "/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind/tools/tests/helpers/game.js": "df376c4e60eaccb03e9ddbab3b30e8b8075e1adfefcaa5a72fa8def280a90c9a",
  "/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind/tools/tests/helpers/progression.js": "71927ff61dcc2e8e49d8d859ffb6bbbc1a9ba299f195c6fe813fe7e82fe0d154",
  "/home/vercel-sandbox/workspace/output/stat-balance/progression-audit.js": "2ca89db7654354b9dece636045a7a4178040c6989af4e7f6de65789d27c3b6f5",
  "/home/vercel-sandbox/workspace/output/stat-balance/extend-bosses.js": "bafaf4c91c84d09b0b440b900137845b5fd88a02c1f57a4874a7839fc8997537",
  "/home/vercel-sandbox/workspace/output/stat-balance/compare-audit.js": "7104c61f1f99b94c4c2ba389d77b9c359e683154c970708efb6942e12e4ded24",
  "/home/vercel-sandbox/workspace/output/stat-balance/aspd-formulas.json": "0da975ea92b92b6ec41e95dcacfbbf65db825714d4c100dba493df7ba3c6bd30",
  "/home/vercel-sandbox/workspace/output/stat-balance/current-combat.json": "ea0e549bfd4410ce4318ce01c5922fe733a6fdf1ce7778dab65f833dfecdc4ea",
  "/home/vercel-sandbox/workspace/output/stat-balance/proposal-combat.json": "73f49a1ba3d02ed119cff4a2b6ae7b7856da09b1433d73baf267a3bdbfec4e58",
  "/home/vercel-sandbox/workspace/output/stat-balance/gentler-combat.json": "4a24a216b12c725ff600e16c7a9d5520e6945d716a475e3267618a76f9c6a753",
  "/home/vercel-sandbox/workspace/output/stat-balance/revised-combat.json": "e9d7726fbf5d26cf949271bfafb2021886e4dcf3309184466d3111cf3c83ea05",
  "/home/vercel-sandbox/workspace/output/stat-balance/comparison.json": "076b2b467312431414bcffc19e43fbe01ae640c7fc535f13a745477f44622b28",
  "/home/vercel-sandbox/workspace/output/stat-balance/cap-thresholds.json": "032e2764163723976edd09d1ceae3a90b620778cb83de85e70dcea92704a321c",
  "/home/vercel-sandbox/workspace/output/stat-balance/report.md": "5ad2c639774396916b1c67469a98b5948165d6c642b7c5cb5ed97c50da17cd6a",
  "/tmp/prontera-progression-audit.js": "600e1eb1d21eceb19f1341c7d8c8d9946e3175230130ad7d86adbebdc262f201",
  "/tmp/prontera-extend-bosses.js": "721c883679be1ec4dc74fcf89f6d6a9b9ef9da81d7a632da0c124c8a4a4cfb14",
  "/tmp/prontera-compare-audit.js": "6a67f8ff187296b55a377d7b13d681ae6dfdc594478b5a05023adf817c0b476a",
  "/tmp/prontera-cap-check.js": "30827da33fabe084ffa133783b94d442871115a191a7efc1b7494582ff0c05b0",
  "/tmp/prontera-write-report.py": "89659346d993647ce9f6817515223a2c31f9c687bc625701b9c3c29e07ec3cec"
}
```
