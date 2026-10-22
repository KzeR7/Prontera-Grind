// tools/compare_endgame_rewards.js — read-only HP / EXP / Zeny comparison for the endgame fields.
//
//   node tools/compare_endgame_rewards.js            # markdown tables on stdout
//   node tools/compare_endgame_rewards.js --json     # the same numbers as JSON
//
// It changes nothing. Every number comes from the live game: the real spawn() builds each wave
// (mob and MVP, including the Nightmare Stage 15 buff and the Ascension stat ramps), and the real
// fieldExpReward() / fieldZenyReward() / nmZenyRoll() pay for the kills. EXP is shown as the player
// actually receives it at Base Lv 100+ (expRate() = EXP_RATE/3 = 2.333x the raw reward); Zeny is the
// expected value of the payout roll, sampled with a fixed pseudo-random sequence so it is repeatable.
//
// Two ratios carry the balance reading, because time per kill follows monster HP:
//   EXP per million HP   — how much EXP one million points of damage buys (higher = faster levels)
//   Zeny per million HP  — the same for Zeny
// "Kills per level" divides needAt(150) by one kill's EXP: the level at the cap, where the whole
// endgame band is played.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createGame } = require(path.join(ROOT, 'tools/tests/helpers/game'));

const g = createGame();
const ev = g.ev;

const NP = 20000;            // Zeny sample size
const J = process.argv.includes('--json');

const comma = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const perM = (value, hp) => hp ? Math.round(value / (hp / 1e6)) : null;

function readFields() {
  const fields = [];
  // A Lv150 character on ordinary rewards: expRate() is the 7/3 band from Base 100 up.
  ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.gmnm=1;S.auto=false;S.adv=false;S.gm=false;`);
  const expRate = ev('expRate()');
  const need = ev('needAt(150)');
  // Fixed LCG so the Zeny samples are identical on every run.
  ev(`window.__lcg=(function(){let s=123456789;const f=()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296};f.reset=()=>{s=123456789};return f})();Math.random=window.__lcg;`);

  const zenyMean = (m, l, boss) =>
    ev(`(()=>{S.mp=${m};S.lvl=${l};window.__lcg.reset();let s=0;for(let i=0;i<${NP};i++)s+=fieldZenyReward(${m},${l},${boss ? 1 : 0})*nmZenyRoll({boss:${boss ? 1 : 0}});return s/${NP}})()`);

  function field(m, l) {
    ev(`S.mp=${m};S.lvl=${l};spawn();`);
    const mob = ev('mobs.find(o=>!o.boss)');
    const boss = ev('mobs.find(o=>o.boss)') || null;
    return {
      name: ev(`MAPS[${m}].n`), map: m, stage: l,
      power: ev(`fieldPower(${m},${l})`),
      mobHp: mob.hp, mobAtk: mob.atk, mobExp: mob.exp, mobZeny: zenyMean(m, l, false),
      bossName: boss ? boss.n : null,
      bossHp: boss ? boss.hp : null, bossAtk: boss ? boss.atk : null,
      bossExp: boss ? boss.exp : null, bossZeny: boss ? zenyMean(m, l, true) : null,
      escorts: boss ? ev('mobs.filter(o=>!o.boss).length') : 0,
      waveHp: boss ? ev('mobs.reduce((s,o)=>s+o.hp,0)') : null,
      waveExp: boss ? ev('mobs.reduce((s,o)=>s+o.exp,0)') : null,
    };
  }

  const ref = field(9, 10);
  const nm = []; for (let l = 11; l <= 15; l++) nm.push(field(9, l));
  const astral = [], thor = [];
  for (let l = 1; l <= 5; l++) astral.push(field(10, l));
  for (let l = 1; l <= 5; l++) thor.push(field(11, l));
  const nm15Bosses = []; for (let m = 0; m < 10; m++) nm15Bosses.push(field(m, 15));

  const decorate = f => {
    const d = {
      ...f,
      mobExpPaid: f.mobExp * expRate,
      mobExpPerM: perM(f.mobExp * expRate, f.mobHp),
      mobZenyPerM: perM(f.mobZeny, f.mobHp),
      killsPerLevel: need / (f.mobExp * expRate),
      bossExpPaid: f.bossExp == null ? null : f.bossExp * expRate,
      bossExpPerM: f.bossExp == null ? null : perM(f.bossExp * expRate, f.bossHp),
      bossZenyPerM: f.bossZeny == null ? null : perM(f.bossZeny, f.bossHp),
      waveExpPaid: f.waveExp == null ? null : f.waveExp * expRate,
      waveExpPerM: f.waveExp == null ? null : perM(f.waveExp * expRate, f.waveHp),
      bossShare: f.bossExp == null ? null : f.bossExp / f.waveExp,
    };
    // Wave Zeny is the MVP payout plus one payout per escort, from the same expected values.
    d.waveZeny = d.bossHp == null ? null : d.bossZeny + d.escorts * d.mobZeny;
    d.waveZenyPerM = d.bossHp == null ? null : perM(d.waveZeny, d.waveHp);
    return d;
  };

  return {
    expRate, need,
    ref: decorate(ref), nm: nm.map(decorate), astral: astral.map(decorate), thor: thor.map(decorate),
    nm15Bosses: nm15Bosses.map(decorate),
  };
}

let report;
try { report = readFields(); } finally { g.close(); }

if (J) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const { expRate, need, ref, nm, astral, thor, nm15Bosses } = report;

const fieldTable = (rows, nmNames) => {
  const head = '| Field | Power | Mob HP | Mob ATK | Mob EXP | Mob Zeny | EXP / M HP | Zeny / M HP | Kills / level |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|';
  const body = rows.map(r =>
    `| ${r.name} ${nmNames ? 'NM' + r.stage : 'S' + r.stage} | ${r.power} | ${comma(r.mobHp)} | ${comma(r.mobAtk)} | ${comma(r.mobExpPaid)} | ${comma(r.mobZeny)} | ${comma(r.mobExpPerM)} | ${comma(r.mobZenyPerM)} | ${r.killsPerLevel.toFixed(0)} |`).join('\n');
  return head + '\n' + body;
};
const waveTable = rows => {
  const head = '| Field | Escorts | Wave HP | Wave EXP | Wave Zeny | MVP share of EXP | EXP / M HP | Zeny / M HP |\n|---|---:|---:|---:|---:|---:|---:|---:|';
  const body = rows.filter(r => r.bossHp).map(r =>
    `| ${r.name} ${r.map >= 10 ? 'S' : 'NM'}${r.stage} | ${r.escorts} | ${comma(r.waveHp)} | ${comma(r.waveExpPaid)} | ${comma(r.waveZeny)} | ${(r.bossShare * 100).toFixed(0)}% | ${comma(r.waveExpPerM)} | ${comma(r.waveZenyPerM)} |`).join('\n');
  return head + '\n' + body;
};
const bossTable = rows => {
  const head = '| Field | MVP | MVP HP | MVP ATK | MVP EXP | MVP Zeny | EXP / M HP | Zeny / M HP |\n|---|---|---:|---:|---:|---:|---:|---:|';
  const body = rows.filter(r => r.bossHp).map(r =>
    `| ${r.name} ${r.map >= 10 ? 'S' : 'NM'}${r.stage} | ${r.bossName} | ${comma(r.bossHp)} | ${comma(r.bossAtk)} | ${comma(r.bossExpPaid)} | ${comma(r.bossZeny)} | ${comma(r.bossExpPerM)} | ${comma(r.bossZenyPerM)} |`).join('\n');
  return head + '\n' + body;
};

console.log('<!-- generated by tools/compare_endgame_rewards.js -->\n');
console.log(`EXP is shown as paid at Base Lv 100+ (expRate ${expRate.toFixed(3)}x). Zeny is the expected payout including the Nightmare/Ascension roll. One level at Base 150 costs ${comma(need)} EXP.\n`);
console.log('## Reference — Abyss Stage 10 (normal cap)\n');
console.log(fieldTable([ref], false) + '\n');
console.log('## Nightmare Abyss, Stages 11-15\n');
console.log(fieldTable(nm, true) + '\n');
console.log('## Nightmare Abyss Stage 15 — the Dark Lord wave\n');
console.log(waveTable(nm) + '\n');
console.log('## Astral Citadel, Stages 1-5\n');
console.log(fieldTable(astral, false) + '\n');
console.log('## Thor Volcano, Stages 1-5\n');
console.log(fieldTable(thor, false) + '\n');
console.log("## The two newest maps' Stage 5 boss waves\n");
console.log(waveTable([...astral, ...thor]) + '\n');
const DPS = 1e6;
const paceTable = (rows, wave) => {
  const head = '| Field | HP | Seconds | EXP / min | Zeny / min |\n|---|---:|---:|---:|---:|';
  const body = rows.filter(r => wave ? r.waveHp : true).map(r => {
    const hp = wave ? r.waveHp : r.mobHp;
    const exp = wave ? r.waveExpPaid : r.mobExpPaid;
    const zeny = wave ? r.waveZeny : r.mobZeny;
    const sec = hp / DPS;
    return `| ${r.name} ${r.map >= 10 ? 'S' : 'NM'}${r.stage}${wave ? ' wave' : ''} | ${comma(hp)} | ${sec.toFixed(1)} | ${comma(exp / sec * 60)} | ${comma(zeny / sec * 60)} |`;
  }).join('\n');
  return head + '\n' + body;
};
console.log('## At a steady 1M DPS — regular mobs (illustration)\n');
console.log('Seconds per kill is the monster HP divided by 1M DPS. Real builds differ; the ratios between fields are what the table shows. Abyss Stage 10 is left out: a 55k HP mob dies inside one attack, so its real rate is set by attack cadence, not HP.\n');
console.log(paceTable([...nm, ...astral, ...thor], false) + '\n');
console.log('## At a steady 1M DPS — boss waves\n');
console.log(paceTable([...nm, ...astral, ...thor], true) + '\n');
console.log('## Every Nightmare Stage 15 MVP (context)\n');
console.log(bossTable(nm15Bosses) + '\n');
console.log('## MVPs on the compared fields\n');
console.log(bossTable([ref, ...nm, ...astral, ...thor]) + '\n');
