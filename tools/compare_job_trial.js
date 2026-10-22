// tools/compare_job_trial.js — read-only check of the Crucible of the Valkyrie opponent.
//
//   node tools/compare_job_trial.js            # markdown on stdout
//   node tools/compare_job_trial.js --json
//
// The job-change trial builds its opponent in startJobRite(): the template of Astral Citadel
// Stage 1's first mob plus ascensionCombatStats(10,1), with HP set to JOB_RITE_BOSS_MULT x the
// Nightmare Abyss Stage 15 MVP's own HP (v211).
// This tool reads those numbers out of the live page and then measures what the six third-job
// classes actually do to it, using the repository's existing benchmark fixture
// (tools/progression_balance.js `outfitted`, three gear tiers) and its stationary damage harness
// (tools/skill_balance.js). Nothing is changed.
//
// Gear tiers, as progression_balance defines them:
//   early = +3 refinement, 1st/2nd-job tier gear, few sockets
//   mid   = +6 refinement, high-tier gear, more sockets
//   N+    = +10 refinement, N+ gear, Nightmare cards and max card mastery ("completed build")
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createGame } = require(path.join(ROOT, 'tools/tests/helpers/game'));
const sb = require(path.join(ROOT, 'tools/skill_balance'));

// The repository's own fixture, sliced out of tools/progression_balance.js. That module refuses to
// load unless a historical index.html blob is present, so its fixture is extracted instead of
// copied: there is still exactly one definition of "the benchmark build".
function benchmarkFixture() {
  const file = fs.readFileSync(path.join(ROOT, 'tools/progression_balance.js'), 'utf8');
  const i = file.indexOf('function outfitted('), j = file.indexOf('function encounters(');
  if (i < 0 || j < 0) throw new Error('cannot find the outfitted() fixture in tools/progression_balance.js');
  const src = file.slice(i, j);
  return new Function('configure', src + '\nreturn outfitted;')(sb.configure);
}

const J = process.argv.includes('--json');
const comma = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const CLASSES = [
  ['Lord Knight', 'sword'], ['Assassin Cross', 'katar'], ['Whitesmith', 'axe'],
  ['High Priest', 'mace'], ['Sniper', 'bow'], ['High Wizard', 'staff'],
];
const TIERS = [['early', 0], ['mid', 1], ['N+', 2]];

const g = createGame();
const ev = g.ev;
let out;
try {
  // A Base 150 third-job character: the only state the trial can be entered from.
  ev(`S=fresh();S.lv=150;S.gmnm=1;S.auto=false;S.adv=false;S.gm=false;S.mp=9;S.lvl=15;spawn();`);
  const darkLord = ev(`(()=>{const b=mobs.find(o=>o.boss);return {hp:b.hp,atk:b.atk};})()`);
  const secs = ev('JOB_RITE_SECS'), mult = ev('JOB_RITE_BOSS_MULT'), anchor = ev('nmBossHpOf(9,15)');
  const astral1 = ev(`(()=>{const t=fieldOf(10,1).mobs[0],s=ascensionCombatStats(10,1);
    return {tpl:t.n,hp:s.hp,hpMax:s.max,atk:s.atk,power:fieldPower(10,1),sec:fieldOf(10,1).sec};})()`);
  // What startJobRite() actually hand-builds, read from the live spawn data of Astral Stage 1.
  ev(`S.mp=10;S.lvl=1;spawn();`);
  const fieldMob = ev('mobs.find(o=>!o.boss)');
  const enemy = {
    name: 'Crucible opponent',
    hp: Math.floor(anchor * mult), atk: astral1.atk, fieldHp: fieldMob.hp, fieldAtk: fieldMob.atk,
    fieldName: fieldMob.n, power: astral1.power, secs, mult, anchor, darkLord,
  };

  const rows = [];
  for (const [tierName, profile] of TIERS) {
    for (const [cls, weapon] of CLASSES) {
      benchmarkFixture()(g, cls, profile, weapon, true);
      const dps = sb.stationary(g, 1, 30).dps;
      const maxHp = ev('maxHp()'), defv = ev('def()');
      const pr = ev('prOf({lvl:fieldPower(10,1),boss:false})');
      const taken = enemy.atk * (1 - Math.min(.75, defv * (1 - pr) / (defv * (1 - pr) + 4000)));
      rows.push({ tier: tierName, cls, dps, clearSec: enemy.hp / dps, maxHp, takenPerHit: taken,
        hitsToDie: maxHp / taken, wins: dps * enemy.secs >= enemy.hp });
    }
  }
  out = { enemy, rows };
} finally { g.close(); }

if (J) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const { enemy, rows } = out;
console.log('| Crucible opponent | Value |\n|---|---:|');
console.log(`| Template | an Astral Citadel Stage 1 monster (chosen at random each entry), power ${enemy.power} |`);
console.log(`| Nightmare Abyss 15 MVP for reference | ${comma(enemy.darkLord.hp)} HP, ${comma(enemy.darkLord.atk)} ATK |`);
console.log(`| HP | ${comma(enemy.hp)} (${enemy.mult}× the Nightmare Abyss 15 MVP's ${comma(enemy.anchor)} HP) |`);
console.log(`| ATK | ${comma(enemy.atk)} (the Astral Stage 1 mob's value, above the Abyss NM boss's ${comma(enemy.darkLord.atk)}) |`);
console.log(`| Time limit | ${enemy.secs}s, and dying ends the trial as a defeat |`);
console.log(`| Rewards | none: the opponent spawns with 0 EXP, 0 Zeny and no drops |\n`);
console.log('| Gear tier | Class | DPS | Clear time | Max HP | Damage per hit taken | Hits to die | Wins in 30s |');
console.log('|---|---|---:|---:|---:|---:|---:|---|');
for (const r of rows) {
  console.log(`| ${r.tier} | ${r.cls} | ${comma(r.dps)} | ${r.clearSec.toFixed(1)}s | ${comma(r.maxHp)} | ${comma(r.takenPerHit)} | ${r.hitsToDie.toFixed(0)} | ${r.wins ? 'yes' : '**no**'} |`);
}
const by = tier => rows.filter(r => r.tier === tier);
for (const [tier] of TIERS) {
  const t = by(tier), wins = t.filter(r => r.wins).length;
  console.log(`\n${tier}: ${wins}/${t.length} classes clear inside ${enemy.secs}s, fastest ${Math.min(...t.map(r => r.clearSec)).toFixed(1)}s, slowest ${Math.max(...t.map(r => r.clearSec)).toFixed(1)}s.`);
}
