// tools/compare_ascension_economy.js — read-only Zeny and drop-rate measurement for the two
// Ascension fields (Astral Citadel, Thor Volcano), with the Nightmare Abyss 15 field as reference.
//
//   node tools/compare_ascension_economy.js            # markdown on stdout
//   node tools/compare_ascension_economy.js --json
//
// Everything is read from the live page: spawn() builds the monster, so its HP, Zeny payout, ore
// chance, card chance, gear drops and material rolls are the game's own. Two DPS references are
// used, 1M and 4M, because every rate here scales with how fast you kill (kills/min = DPS / HP).
//
// Drop chances in the game are percentages: `Math.random()*100 < chance` for gear, cards and the
// Ascension materials, `Math.random() < chance` for ore (chance is a fraction there).
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createGame } = require(path.join(ROOT, 'tools/tests/helpers/game'));

const J = process.argv.includes('--json');
const NP = 20000;
const comma = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const one = n => n == null ? '—' : (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(n < 1 ? 2 : 1));

const g = createGame();
const ev = g.ev;
let out;
try {
  ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.gmnm=1;S.auto=false;S.adv=false;S.gm=false;`);
  const expRate = ev('expRate()');
  ev(`window.__lcg=(function(){let s=123456789;const f=()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296};f.reset=()=>{s=123456789};return f})();Math.random=window.__lcg;`);

  // Expected Zeny for a regular kill, including the payout roll.
  const zenyMean = (m, l) => ev(`(()=>{S.mp=${m};S.lvl=${l};window.__lcg.reset();let s=0;for(let i=0;i<${NP};i++)s+=fieldZenyReward(${m},${l},0)*nmZenyRoll({boss:false});return s/${NP}})()`);

  function field(m, l) {
    ev(`S.mp=${m};S.lvl=${l};spawn();`);
    const mob = ev(`(()=>{const o=mobs.find(x=>!x.boss);return {
      n:o.n,hp:o.hp,atk:o.atk,oreCh:o.ore?o.oreCh:0,cardCh:o.cardCh||0,card:o.card&&o.card.n,
      gear:(o.drops||[]).map(([T,ch])=>({n:T.n||T.k,ch})),tier:o.tier,sec:o.sec};})()`);
    const mapMat = m - 10;                        // 0 = Astral Shard, 1 = Primal Catalyst
    const drops = {
      mapMat: m < 10 ? 0 : 0.2,                     // ascensionDrops: Math.random()*100 < .2
      sigil: m < 10 ? 0 : 0.05,                     // ascensionDrops: Math.random()*100 < .05
      ore: mob.oreCh * 2 * 100,                     // ori and elu rolled separately, as a percentage
      card: mob.cardCh,
      gear: mob.gear.reduce((s, d) => s + d.ch, 0),
    };
    return {
      name: ev(`MAPS[${m}].n`), map: m, stage: l, power: ev(`fieldPower(${m},${l})`),
      mob: mob.n, hp: mob.hp, atk: mob.atk, tier: mob.tier, sec: mob.sec,
      zeny: zenyMean(m, l), exp: ev(`fieldExpReward(${m},${l})`) * expRate,
      mapMat, matName: mapMat >= 0 ? ev(`ASCENSION_MATERIALS[${mapMat}]`) : null, drops,
    };
  }

  const rows = [field(9, 15)];
  for (let l = 1; l <= 5; l++) rows.push(field(10, l));
  for (let l = 1; l <= 5; l++) rows.push(field(11, l));

  // Set costs, read from ASC_SETS so the report cannot drift from the game.
  const sets = ev(`JSON.stringify(Object.entries(ASC_SETS).map(([id,s])=>({id,name:s.name,mat:s.mat,cost:s.cost,pieces:Object.keys(s.cost).length})))`);
  out = { rows, sets: JSON.parse(sets) };
} finally { g.close(); }

const DPS = [1e6, 4e6];
const rates = r => DPS.map(dps => {
  const killsPerMin = dps / r.hp * 60;
  const perHour = chance => killsPerMin * 60 * chance / 100;   // chance is a percentage
  return {
    dps, killsPerMin,
    zenyPerMin: killsPerMin * r.zeny,
    matPerHour: perHour(r.drops.mapMat),
    sigilPerHour: perHour(r.drops.sigil),
    orePerHour: perHour(r.drops.ore),
    cardPerHour: perHour(r.drops.card),
    gearPerHour: perHour(r.drops.gear),
  };
});

if (J) {
  console.log(JSON.stringify({ ...out, rates: out.rows.map(r => ({ field: r.name + ' ' + r.stage, ...Object.fromEntries(rates(r).map((x, i) => [DPS[i] / 1e6 + 'M', x])) })) }, null, 2));
  process.exit(0);
}

console.log('| Field | Mob HP | Zeny per kill | Zeny / M HP | EXP / M HP | Gear drops / kill | Card | Map material | Sigil | Ore |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of out.rows) {
  console.log(`| ${r.name} ${r.map >= 10 ? 'S' + r.stage : 'NM' + r.stage} | ${comma(r.hp)} | ${comma(r.zeny)} | ${one(r.zeny / (r.hp / 1e6))} | ${one(r.exp / (r.hp / 1e6))} | ${r.drops.gear ? r.drops.gear.toFixed(2) + '%' : 'none'} | ${r.drops.card}% | ${r.drops.mapMat ? r.drops.mapMat + '% (' + r.matName + ')' : '—'} | ${r.drops.sigil}% | ${r.drops.ore}% |`);
}

for (const dps of DPS) {
  console.log(`\n### Per hour at ${dps / 1e6}M DPS\n`);
  console.log('| Field | Kills / min | Zeny / hour | Map material / hour | Sigils / hour | Ore / hour | Cards / hour | Gear / hour |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of out.rows) {
    const x = rates(r)[DPS.indexOf(dps)];
    console.log(`| ${r.name} ${r.map >= 10 ? 'S' + r.stage : 'NM' + r.stage} | ${one(x.killsPerMin)} | ${comma(x.zenyPerMin * 60)} | ${one(x.matPerHour)} | ${one(x.sigilPerHour)} | ${one(x.orePerHour)} | ${one(x.cardPerHour)} | ${x.gearPerHour ? one(x.gearPerHour) : '—'} |`);
  }
}

const shard = out.rows.find(r => r.map === 10 && r.stage === 1);
console.log('\n### What a set costs\n');
console.log('| Set | Map | Material | Shards / catalysts | Sigils | Zeny |');
console.log('|---|---|---|---:|---:|---:|');
for (const s of out.sets) {
  const m = s.mat === 0 ? 'Astral Shard' : 'Primal Catalyst';
  const mats = Object.values(s.cost).reduce((a, c) => a + c[0], 0);
  const sig = Object.values(s.cost).reduce((a, c) => a + c[1], 0);
  const z = Object.values(s.cost).reduce((a, c) => a + c[2], 0);
  console.log(`| ${s.name} | ${s.mat === 0 ? 'Astral' : 'Thor'} | ${m} | ${mats} | ${sig} | ${comma(z)} |`);
}
console.log(`\nReference: at 1M DPS the best Ascension drop field (${shard.name} S1) pays ${one(rates(shard)[0].matPerHour)} ${shard.matName} an hour, and at 4M DPS ${one(rates(shard)[1].matPerHour)}.`);
