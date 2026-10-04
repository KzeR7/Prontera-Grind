// Pet data & power: the roster, the training ladder, the six gacha skills, and what a MAXED pet
// (G6 mutation + all three pieces at Mythril 5/5 + a skill) actually does to the numbers.
//   node tools/tests/pet_sim.js
//
// The rules being checked:
//   * the roster and the skill table are intact: 8 pets across 4 rarities (two each) and six
//     equally weighted gacha skills - 2 player buffs, 2 AoE attacks, 2 single-target attacks;
//   * the training ladder is the shipped one: PTG .40/.25/.15/.09/.05, GREAT 5% double-ups,
//     peqCost(t) = 1200(t+1)^2, Claw +12%/tier, Collar +8% attack speed/tier, Charm +6% crit/tier;
//   * petDmg() is the real formula - atk() x rarity factor x mutation x Claw - so a maxed pet is
//     measured, not guessed;
//   * MEASUREMENT: a maxed pet's damage per second against the player's own DPS on the same
//     build, and its time-to-kill on an Abyss stage-10 boss. This is the "is it overpowered?"
//     number the owner asked for, printed in full, with a generous sanity ceiling so a runaway
//     (an accidental extra x10, say) fails the suite.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

const code = [
  pick(/const SU=k=>[^\n]*HPK=\d+,HPE=[\d.]+/, 'HPK/HPE'),
  grab('const CD=[', 'const pm=s=>'),                    // CLASSES
  pick(/const C=\(\)=>[^;]+;/, 'C()'),
  pick(/const items=\(\)=>[^\n]*/, 'items/ev/iname/eqv'),
  pick(/const bon=k=>\{[^\n]*/, 'bon()'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'st/canUse'),
  grab('const maxHp=\(\)=>', 'const totalPts=\(\)=>'),   // atk/matk/aspd/crit/flee/missCh/def/mdef/critD
  pick(/const RAR=\[[^\]]*\];/, 'RAR'),
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'AM/GRADE/GI/CV'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AFF/AB'),
  pick(/const MAPTIER=\[[^\]]*\];/, 'MAPTIER'),
  pick(/const dropTier=\(m,l\)=>[^;]+;/, 'dropTier'),
  // the equipment catalogue + the map table + its level bands (a stub mob parser, since pet
  // power does not depend on monster sprites)
  'const pm=s=>{const[n,c,sh]=String(s).split(":");return{n,c:parseInt(c,16)||0,shape:sh,spriteId:0,spriteSize:"Medium",spriteScale:1}};',
  grab('const G=(w,a,h,o,l,ac,ac2)=>', 'const pw=()=>'),
  grab('function genGear(T,l,sec,boss,tier){', '// ---------- skill effects'),
  grab('const PETS=[', 'const rollingSet=new Set'),      // roster, ladders, PEQ, PET_SKILLS, petDmg/petInt/petHit
  pick(/const SKSLOTS=t=>[^;]+;/, 'SKSLOTS/SKFADE'),
  pick(/const skOff=id=>[^\n]*/, 'skOff/skillOn'),
].join('\n');

const harness = `
${code}
let __seed=1;const __r=()=>((__seed=(__seed*1103515245+12345)>>>0)/4294967296);
const rnd=(a,b)=>a+__r()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
const pickW=w=>{let r=Math.random()*w.reduce((x,y)=>x+y,0);for(let i=0;i<w.length;i++){r-=w[i];if(r<0)return i}return w.length-1};
let S=null,tb={},petBuff={atk:0,matk:0,atkT:0,matkT:0},petSkillCd={},mobs=[];
const hurt=()=>{},log=()=>{},addFloat=()=>{},playSkillFx=()=>{},collDmg=()=>0;
// The passive-skill half of the derived stats: the real pv() walk over the line's passives, so
// Aura Blade / Owl's Eye and friends are counted in the player's numbers below.
const pv=k=>SKILLS.reduce((a,s)=>a+(s.type==='pas'&&s.key===k&&skillOn(s.id)?s.f(lv(s.id)):0),0);
this.__p={ PETS,PET_SKILLS,RN,RCL,MUT,GW,PT,PTG,GREAT,PEQ,EGG,petDmg,petInt,peqCost,rollCost,petSkillCost,
  MAPS,genGear,atk,aspd,crit,critD,C,CLASSES,HPK,HPE,petHit,SKILLS,SKSLOTS,SKFADE,lineOf,st,mul:S=>0,pv,
  petBuff, resetSeed:()=>{__seed=20261004;}, set S(v){S=v}, get S(){return S} };
`;

const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const P = sb.__p;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('pet: roster, ladders, skills and the maxed-pet power measurement\n');

// ---------------------------------------------------------------- the data
t('the roster is 8 pets, two at each of the four rarities', () => {
  assert.strictEqual(P.PETS.length, 8);
  assert.deepStrictEqual([...new Set(P.PETS.map(p => p.r))], [0, 1, 2, 3]);
  [0, 1, 2, 3].forEach(r => assert.strictEqual(P.PETS.filter(p => p.r === r).length, 2, 'rarity ' + r + ' must hold two pets'));
  assert.strictEqual(new Set(P.PETS.map(p => p.spriteId)).size, 8, 'every pet has its own Divine Pride id');
});

t('six equally weighted gacha skills: 2 buffs, 2 AoE, 2 single-target', () => {
  assert.strictEqual(P.PET_SKILLS.length, 6);
  const kinds = P.PET_SKILLS.map(s => s.kind);
  assert.deepStrictEqual(kinds.filter(k => k === 'buff').length, 2, 'two buffs');
  assert.deepStrictEqual(kinds.filter(k => k === 'aoe').length, 2, 'two AoE');
  assert.deepStrictEqual(kinds.filter(k => k === 'single').length, 2, 'two single-target');
  P.PET_SKILLS.forEach(s => {
    assert.ok(s.cd > 0 && s.desc && s.icon && s.color, s.n + ' must be a complete entry');
    assert.ok(s.desc.includes(String(s.power)), s.n + ' description must state its power (' + s.desc + ')');
  });
  // the two buffs buff, the attacks multiply pet damage
  P.PET_SKILLS.filter(s => s.kind === 'buff').forEach(s => {
    assert.ok(['atk', 'matk'].includes(s.stat) && s.power === 20 && s.duration === 8, s.n + ' is a +20%/8s player buff');
  });
  P.PET_SKILLS.filter(s => s.kind === 'aoe').forEach(s => assert.ok(s.radius >= 4, s.n + ' needs a real radius'));
  assert.ok(P.PET_SKILLS.find(s => s.id === 'piercingfang').power === 2.2);
  assert.ok(P.PET_SKILLS.find(s => s.id === 'spiritbolt').power === 2.5);
});

t('the training ladder is the shipped one', () => {
  assert.deepStrictEqual([...P.PT], ['Wooden', 'Iron', 'Silver', 'Gold', 'Mythril']);
  assert.deepStrictEqual([...P.PTG], [.4, .25, .15, .09, .05], 'success chance by current tier');
  assert.strictEqual(P.GREAT, .05, 'one success in twenty jumps two tiers');
  assert.deepStrictEqual(Array.from({ length: 5 }, (_, t) => P.peqCost(t)), [1200, 4800, 10800, 19200, 30000], 'peqCost(t) = 1200(t+1)^2');
  assert.strictEqual(P.PEQ[0].d(5), '+60% pet damage', 'Mythril Claw = +12%/tier');
  assert.strictEqual(P.PEQ[1].d(5), '+40% pet attack speed', 'Mythril Collar = +8%/tier');
  assert.strictEqual(P.PEQ[2].d(5), '30% pet crit chance (x2 damage)', 'Mythril Charm = +6%/tier');
  assert.strictEqual(P.MUT.length, 7, 'grade 0 (none) through grade 6');
  assert.strictEqual(P.MUT[6], 40, 'G6 is x40 damage');
});

// ---------------------------------------------------------------- one maxed pet, measured
const eq = (T, lvl, sec) => { const it = P.genGear(T, lvl, sec, true, 4); it.r = 10; return it; };
// A fixed seed (inside the vm, where genGear's rnd lives) keeps the endgame set - and therefore
// every number printed below - reproducible.
const endgame = cls => { P.resetSeed(); return endgameSet(cls); };
const endgameSet = cls => ({
  cls, sex: 'm', hair: 0, lv: 150, exp: 0, hp: 1, zeny: 0, kills: 0, pts: 0, mp: 9, lvl: 10, kl: 0, gmx: 100, gm: false,
  st: { str: 120, agi: 120, dex: 1, luk: 120, int: 1, vit: 1 },
  // a maxed character: every skill of the line at max, so the passives are counted too
  sk: (() => { const sk = { aid: 5 }, line = P.lineOf(cls); P.SKILLS.forEach(s => { if (line.includes(s.from)) sk[s.id] = s.max; }); return sk; })(),
  skOff: {}, jobs: {}, base: {}, prog: [],
  eq: {
    weapon: eq({ k: 'sword', n: 'Dark Lord Sword' }, 99, 3),
    armor: eq({ k: 'armor', n: 'Dark Lord Mail' }, 99, 3),
    head: eq({ k: 'head', n: 'Dark Lord Mask' }, 99, 3),
    off: eq({ k: 'off', n: 'Dark Lord Guard' }, 99, 3),
    leg: eq({ k: 'leg', n: 'Dark Lord Boots' }, 99, 3),
    acc1: eq({ k: 'acc', n: 'Dark Lord Ring' }, 99, 3),
    acc2: eq({ k: 'acc', n: 'Dark Lord Pendant' }, 99, 3),
    weapon2: null,
  },
  inv: [], cards: [], pets: [], ore: { ori: 0, elu: 0 }, q: [],
});
const maxedPet = sp => ({ id: 1, sp, mut: 6, eq: [5, 5, 5], skill: '', on: true });
// Average multiplier of one pet swing once Charm (30%) crits are folded in.
const critFactor = p => 1 + Math.min(1, p.eq[2] * .06) * 1;      // 30% chance of x2 = x1.3 on average
// Long-run damage per second of ONE pet, skills included: an attack that has a ready skill
// spends the swing casting it (petHit returns before the basic hit).
function petDps(p) {
  const dmg = P.petDmg(p), swing = 1 / P.petInt(p), skill = P.PET_SKILLS.find(s => s.id === p.skill);
  let dps = dmg * critFactor(p) * swing;
  if (skill && skill.kind !== 'buff') {
    const uses = Math.min(swing, 1 / skill.cd);              // can never cast more often than it swings
    dps = dmg * critFactor(p) * (swing - uses) + dmg * skill.power * uses;
  }
  return dps;
}
const bossHp = () => { const mp = P.MAPS[9], pw = mp.b + 10, mb = 1 + 9 * .15 + Math.max(0, 9 - 4) * .2; return Math.floor(500 * mb * Math.pow(pw, P.HPE)); };

t('petDmg is the real formula: atk x rarity x mutation x Claw', () => {
  P.S = endgame('Lord Knight');
  const a = P.atk();
  const angeling = maxedPet(7);                               // Angeling, Legendary
  assert.strictEqual(P.PETS[7].n, 'Angeling');
  assert.strictEqual(P.petDmg(angeling), Math.round(a * 1 * 40 * 1.6), 'Legendary + G6 + Mythril Claw');
  const poring = maxedPet(0);                                 // Poring, Common
  assert.strictEqual(P.petDmg(poring), Math.round(a * .2 * 40 * 1.6), 'Common pets are a fifth of that');
  assert.ok(Math.abs(P.petInt(angeling) - 1.25 / 1.4) < 1e-9, 'Collar 5 = 40% faster attacks');
});

t('MEASUREMENT: what a maxed pet does next to the player (printed, not hidden)', () => {
  P.S = endgame('Lord Knight');
  const atk = P.atk(), swing = 1 / P.aspd(), crit = Math.min(100, P.crit()), cd = P.critD();
  const autoDps = atk * swing * (1 + crit / 100 * (cd - 1));
  const rows = P.PETS.map((sp, i) => {
    const p = maxedPet(i), dmg = P.petDmg(p), dps = petDps({ ...p, skill: 'spiritbolt' });
    return { pet: sp.n, rar: P.RN[sp.r], dmg, dps };
  });
  console.log('       endgame Lord Knight: ATK ' + atk.toLocaleString() + ' | ' + (1 / swing).toFixed(2) + ' swings/s | ' +
    crit.toFixed(0) + '% crit at x' + cd.toFixed(2) + ' => auto-attack DPS ' + Math.round(autoDps).toLocaleString() + ' (' + (autoDps / atk).toFixed(1) + 'x ATK/s)');
  console.log('       one maxed pet (G6, Mythril 5/5/5, Spirit Bolt):');
  rows.forEach(r => console.log('         ' + r.pet.padEnd(13) + r.rar.padEnd(10) + 'hit ' + String(r.dmg).padStart(9) +
    '  |  DPS ' + String(Math.round(r.dps)).padStart(9) + '  = ' + (r.dps / autoDps).toFixed(1) + 'x the whole player'));
  const best = rows[7].dps, worst = rows[0].dps;
  console.log('       x3 pets on the field: ' + Math.round(best * 3).toLocaleString() + ' DPS at the top, ' + Math.round(worst * 3).toLocaleString() + ' at the bottom');
  console.log('       Abyss stage-10 boss HP ' + bossHp().toLocaleString() + ' -> one maxed Angeling alone kills it in ' + (bossHp() / best).toFixed(2) + 's');
  assert.ok(best > 0 && Number.isFinite(best), 'the measurement must produce a number');
  // A generous ceiling: this fails only if pets slip an order of magnitude further (a bug, not a tuning choice).
  assert.ok(best / autoDps < 1000, 'a maxed pet must not be 1000x the player (got ' + (best / autoDps).toFixed(1) + 'x)');
  assert.ok(worst > autoDps / 4, 'even the weakest maxed pet stays meaningful (got ' + (worst / autoDps).toFixed(1) + 'x)');
});

t('MEASUREMENT: one maxed pet vs the player\'s full maxed-skill rotation (single target)', () => {
  P.S = endgame('Lord Knight');
  const line = P.lineOf('Lord Knight');
  const atk = P.atk(), slots = P.SKSLOTS(P.C().tier), f = P.SKFADE, iint = P.st('int');
  // playerAttack() sorts the ready skills by mul*hits and casts the top SKSLOTS with SKFADE.
  const rot = P.SKILLS.filter(s => s.type === 'act' && line.includes(s.from) && P.S.sk[s.id] > 0)
    .map(s => s.mul(s.max) * (s.hits || 1)).sort((a, b) => b - a).slice(0, slots)
    .reduce((a, m, i) => a + m * (f[i] || .3), 0) * (1 + iint * .01);
  const cf = 1 + Math.min(100, P.crit()) / 100 * (P.critD() - 1);
  const skillDps = atk * rot * cf / P.aspd();
  const autoDps = atk * (1 / P.aspd()) * cf;
  const best = petDps({ ...maxedPet(7), skill: 'spiritbolt' });
  console.log('       player ATK ' + atk.toLocaleString() + ' (passives included): auto ' + Math.round(autoDps).toLocaleString() +
    ' DPS | + a full maxed rotation (x' + rot.toFixed(2) + ' per swing) ' + Math.round(skillDps).toLocaleString() + ' DPS');
  console.log('       one maxed Angeling ' + Math.round(best).toLocaleString() + ' DPS = ' + (best / autoDps).toFixed(1) +
    'x the auto-attack player, ' + (best / skillDps).toFixed(2) + 'x the FULL rotation player, ' + (best * 3 / skillDps).toFixed(2) + 'x with three pets');
  assert.ok(skillDps > autoDps, 'a maxed rotation must beat plain swings');
  assert.ok(best > 0 && Number.isFinite(best));
});

t('a maxed pet buff lifts the pet as well as the player', () => {
  P.S = endgame('Lord Knight');
  const p = maxedPet(7);
  const before = P.petDmg(p), atkBefore = P.atk();
  P.petBuff.atk = 20;                                  // War Cry / Arcane Blessing, +20% for 8s
  const rAtk = P.atk() / atkBefore, rPet = P.petDmg(p) / before;
  assert.ok(rAtk > 1.05, 'the buff is a real gain even after gear and passives dilute it (x' + rAtk.toFixed(3) + ')');
  assert.ok(Math.abs(rAtk - rPet) < .02, 'and the pet rises by exactly the same factor, because petDmg reads atk()');
  P.petBuff.atk = 0;
});

t('roster and costs are visible data (for the Pets panel and the notes)', () => {
  const line = P.PETS.map((p, i) => p.n + ' (' + P.RN[p.r] + ', ' + P.rollCost({ sp: i }) + 'z per mutation roll)').join(' | ');
  console.log('       ' + line);
  console.log('       maxing one stat: ' + JSON.stringify(P.PT) + ' at ' + P.PTG.map(x => Math.round(x * 100) + '%').join('/') + ' per roll, ' + P.peqCost(0) + '-' + P.peqCost(4) + 'z per roll');
  P.PETS.forEach((p, i) => assert.ok(P.rollCost({ sp: i }) === 2500 * (1 + p.r), 'mutation roll price'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
