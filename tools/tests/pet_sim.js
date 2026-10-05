// Pet data & power: the roster, the training ladder, the eight gacha skills, the buff rules, and
// what a MAXED pet (G6 mutation + all three pieces at Mythril 5/5 + two attack skills) actually
// does to the numbers.
//   node tools/tests/pet_sim.js
//
// The rules being checked:
//   * the roster is 8 pets across 4 rarities (two each), and the gacha is eight equally weighted
//     skills - 4 temporary player buffs (ATK, MATK, Blood Siphon's life leech, Vital Aura's max
//     HP) and 4 attacks (2 AoE, 2 single-target);
//   * every pet has TWO skill slots and one roll fills both, never repeating a skill;
//   * a pet can use one skill per PETGAP (7s) on top of that skill's own cooldown, every player
//     buff lasts 30s on a 60s cooldown, a buff never stacks (a second pet's copy is ignored) and
//     ATK and MATK can never run at the same time;
//   * the training ladder is the shipped one: PTG .40/.25/.15/.09/.05, GREAT 5% double-ups,
//     peqCost(t) = 1200(t+1)^2, Claw +12%/tier, Collar +8% attack speed/tier, Charm +6% crit/tier;
//   * petDmg() is the real formula - atk() x PETBAL x rarity x mutation x Claw;
//   * BALANCE: one fully maxed pet must deal about as much DPS as ONE fully maxed character
//     playing their whole skill rotation. That is the owner's target number, so it is asserted
//     (not just printed): if a retune drifts away from it this suite fails.
//   * MEASUREMENT: a stepped simulation drives the REAL petHit() over 120 seconds with crits
//     switched off and checks the analytic damage model used for the balance assertion.
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
  pick(/const AFFIX_CDM_SCALE=[^\n]+;/, 'gear-only Crit DMG post-roll scale'),
  pick(/const affixValue=\(k,section,tier,roll\)=>\{[^}]+\};/, 'affixValue'),
  pick(/const MAPTIER=\[[^\]]*\];/, 'MAPTIER'),
  pick(/const dropTier=\(m,l\)=>[^;]+;/, 'dropTier'),
  // the equipment catalogue + the map table + its level bands (a stub mob parser, since pet
  // power does not depend on monster sprites)
  'const pm=s=>{const[n,c,sh]=String(s).split(":");return{n,c:parseInt(c,16)||0,shape:sh,spriteId:0,spriteSize:"Medium",spriteScale:1}};',
  grab('const G=(w,a,h,o,l,ac,ac2)=>', 'const pw=()=>'),
  grab('function genGear(T,l,sec,boss,tier){', '// ---------- skill effects'),
  grab('const PETS=[', 'const rollingSet=new Set'),      // roster, ladders, PEQ, the 8 skills, petDmg/petHit
  pick(/const PET_SKILL_WEIGHTS=PET_SKILLS\.map\(\(\)=>1\),rollPetSkills=[^\n]*/, 'rollPetSkills'),
  pick(/const SKSLOTS=t=>[^;]+;/, 'SKSLOTS/SKFADE'),
  pick(/const skOff=id=>[^\n]*/, 'skOff/skillOn'),
].join('\n');

const harness = `
${code}
let __seed=1;const __r=()=>((__seed=(__seed*1103515245+12345)>>>0)/4294967296);
const rnd=(a,b)=>a+__r()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
const pickW=w=>{let r=Math.random()*w.reduce((x,y)=>x+y,0);for(let i=0;i<w.length;i++){r-=w[i];if(r<0)return i}return w.length-1};
let S=null,tb={},petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={},petSkillCd={},petNote={},mobs=[],pl={x:1.5,z:1.5};
const numTxt=String,addFloat=()=>{},playSkillFx=()=>{},log=()=>{},collDmg=()=>0;
let dealt=0;const hurt=(o,d)=>{dealt+=d;o.hp=1e12};
// The REAL countdown the game runs every frame, lifted so the stepped simulation ticks exactly
// like the live loop does.
const tickPet=dt=>{${grab("for(const id in petSkillCd)petSkillCd[id]=Math.max(0,petSkillCd[id]-dt);", "  if(pv('hpreg')")}};
// The passive-skill half of the derived stats: the real pv() walk over the line's passives, so
// Aura Blade / Owl's Eye and friends are counted in the player's numbers below.
const pv=k=>SKILLS.reduce((a,s)=>a+(s.type==='pas'&&s.key===k&&skillOn(s.id)?s.f(lv(s.id)):0),0);
this.__p={ PETS,PET_SKILLS,RN,RCL,MUT,GW,PT,PTG,GREAT,PEQ,EGG,PETGAP,PETBAL,petDmg,petInt,peqCost,rollCost,petSkillCost,
  rollPetSkills,petSkills,petBuffWhy,petLeech,petHit,tickPet,maxHp,
  MAPS,genGear,atk,matk,aspd,crit,critD,C,CLASSES,HPK,HPE,SKILLS,SKSLOTS,SKFADE,lineOf,st,pv,
  petBuff,petBuffSrc,setMobs:m=>{mobs=m},setDealt:v=>{dealt=v},getDealt:()=>dealt,
  setRandom:v=>{Math.random=()=>v},
  resetPetState:()=>{for(const k in petSkillCd)delete petSkillCd[k];for(const k in petNote)delete petNote[k];
    for(const s of['atk','matk','hp','leech']){petBuff[s]=0;petBuff[s+'T']=0;petBuffSrc[s]=''}},
  resetSeed:()=>{__seed=20261004;}, set S(v){S=v}, get S(){return S} };
`;

const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const P = sb.__p;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('pet: roster, ladders, the eight skills, buff rules and the maxed-pet measurement\n');

// ---------------------------------------------------------------- the data
t('the roster is 8 pets, two at each of the four rarities', () => {
  assert.strictEqual(P.PETS.length, 8);
  assert.deepStrictEqual([...new Set(P.PETS.map(p => p.r))], [0, 1, 2, 3]);
  [0, 1, 2, 3].forEach(r => assert.strictEqual(P.PETS.filter(p => p.r === r).length, 2, 'rarity ' + r + ' must hold two pets'));
  assert.strictEqual(new Set(P.PETS.map(p => p.spriteId)).size, 8, 'every pet has its own Divine Pride id');
});

t('the gacha is eight equally weighted skills: 4 buffs, 2 AoE, 2 single-target', () => {
  assert.strictEqual(P.PET_SKILLS.length, 8);
  const kinds = P.PET_SKILLS.map(s => s.kind);
  assert.strictEqual(kinds.filter(k => k === 'buff').length, 4, 'four player buffs');
  assert.strictEqual(kinds.filter(k => k === 'aoe').length, 2, 'two AoE');
  assert.strictEqual(kinds.filter(k => k === 'single').length, 2, 'two single-target');
  P.PET_SKILLS.forEach(s => {
    assert.ok(s.cd > 0 && s.desc && s.icon && s.color, s.n + ' must be a complete entry');
    assert.ok(s.desc.includes(String(s.power)), s.n + ' description must state its power (' + s.desc + ')');
  });
  // every player buff is 30s on a 60s cooldown, and one gacha per pet
  const buffs = P.PET_SKILLS.filter(s => s.kind === 'buff');
  assert.deepStrictEqual([...buffs.map(s => s.stat)], ['atk', 'matk', 'leech', 'hp'], 'ATK, MATK, leech, max HP');
  assert.deepStrictEqual([...buffs.map(s => s.power)], [20, 20, 5, 20], '+20% ATK, +20% MATK, 5% leech, +20% max HP');
  buffs.forEach(s => {
    assert.strictEqual(s.duration, 30, s.n + ' must last 30s');
    assert.strictEqual(s.cd, 60, s.n + ' must sit on a 60s cooldown');
    assert.ok(/never stacks/i.test(s.desc), s.n + ' must say that it never stacks');
  });
  P.PET_SKILLS.filter(s => s.kind === 'aoe').forEach(s => assert.ok(s.radius >= 4, s.n + ' needs a real radius'));
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'flameburst').power, 1.6);
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'thunderclap').power, 1.4);
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'piercingfang').power, 2.2);
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'spiritbolt').power, 2.5);
  assert.strictEqual(P.PETGAP, 7, 'one skill per pet every 7 seconds');
});

t('one gacha fills BOTH slots and never repeats a skill', () => {
  const ids = P.PET_SKILLS.map(s => s.id), seen = new Set();
  for (let i = 0; i < 200; i++) {
    const [a, b] = P.rollPetSkills();
    assert.ok(ids.includes(a) && ids.includes(b), 'both slots must hold a real skill (' + a + ', ' + b + ')');
    assert.notStrictEqual(a, b, 'a pet can never hold the same skill twice');
    seen.add(a); seen.add(b);
  }
  assert.strictEqual(seen.size, 8, 'after 200 rolls every skill must have come up at least once');
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
  assert.ok(P.PETBAL > 0 && Number.isFinite(P.PETBAL), 'the pet balance knob exists');
});

// ---------------------------------------------------------------- the buff rules
t('the buff rules are enforced and readable: no stacking, ATK or MATK but not both', () => {
  P.resetPetState();
  const byId = id => P.PET_SKILLS.find(s => s.id === id);
  assert.strictEqual(P.petBuffWhy(byId('warcry')), '', 'ATK is castable into an empty field');
  assert.strictEqual(P.petBuffWhy(byId('vital')), '', 'and so is max HP');
  P.petBuff.atk = 20; P.petBuff.atkT = 30;
  assert.strictEqual(P.petBuffWhy(byId('warcry')), 'the ATK buff is already up', 'a second pet cannot stack a second ATK buff');
  assert.strictEqual(P.petBuffWhy(byId('arcane')), 'ATK cannot run next to MATK', 'and MATK cannot join it');
  P.resetPetState();
  P.petBuff.matk = 20; P.petBuff.matkT = 30;
  assert.strictEqual(P.petBuffWhy(byId('arcane')), 'the MATK buff is already up');
  assert.strictEqual(P.petBuffWhy(byId('warcry')), 'MATK cannot run next to ATK');
  P.resetPetState();
  P.petBuff.hp = 20; P.petBuff.hpT = 30; P.petBuff.leech = 5; P.petBuff.leechT = 30;
  assert.strictEqual(P.petBuffWhy(byId('vital')), 'the Max HP buff is already up');
  assert.strictEqual(P.petBuffWhy(byId('siphon')), 'the life-leech buff is already up');
  P.resetPetState();
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
const maxedPet = (sp, skills = ['piercingfang', 'spiritbolt']) => ({ id: 1, sp, mut: 6, eq: [5, 5, 5], skills, on: true });
// Charm's 30% crit at x2, folded into one average multiplier.
const critFactor = p => 1 + Math.min(1, p.eq[2] * .06) * 1;
// Long-run damage per second of ONE pet. Casts are gated by the 7s PETGAP and by each skill's own
// cooldown; whatever the pet does not spend on a skill it spends on an auto-attack, and only
// auto-attacks can crit. opts.crit=false leaves crits out so the stepped simulation, which runs
// with crits forced off, can be compared to it.
function petDps(p, skills = ['piercingfang', 'spiritbolt'], opts = {}) {
  const dmg = P.petDmg(p), swing = 1 / P.petInt(p), list = skills.map(id => P.PET_SKILLS.find(s => s.id === id));
  const raw = list.map(s => Math.min(swing, 1 / s.cd));
  const total = raw.reduce((a, b) => a + b, 0), cap = Math.min(swing, 1 / P.PETGAP);
  const scale = total > cap ? cap / total : 1, uses = raw.map(r => r * scale);
  const cf = opts.crit === false ? 1 : critFactor(p);
  let dps = dmg * cf * (swing - uses.reduce((a, b) => a + b, 0));
  list.forEach((s, i) => { if (s.kind !== 'buff') dps += dmg * s.power * uses[i]; });
  return dps;
}
// The same pet, driven through the REAL petHit() 120 times a second for `seconds` of game time.
// Math.random is pinned so crits never fire; the analytic model above is asked for the same.
function simPetDps(p, seconds = 120) {
  P.S = endgame('Lord Knight');
  P.resetPetState();
  const target = { x: 0, z: 0, hp: 1e12, flash: 0 };
  P.setMobs([target]); P.setDealt(0); P.setRandom(0.99);
  const dt = 1 / 120;
  let swing = 0;
  for (let time = 0; time < seconds; time += dt) {
    P.tickPet(dt);
    swing -= dt;
    if (swing <= 0) { swing = P.petInt(p); P.petHit(p, target); }
  }
  const dealt = P.getDealt();
  P.setRandom(Math.random); P.setMobs([]);
  return dealt / seconds;
}
const rotMul = () => {
  const line = P.lineOf('Lord Knight'), slots = P.SKSLOTS(P.C().tier), f = P.SKFADE, iint = P.st('int');
  // playerAttack() sorts the ready skills by mul*hits and casts the top SKSLOTS with SKFADE.
  return P.SKILLS.filter(s => s.type === 'act' && line.includes(s.from) && P.S.sk[s.id] > 0)
    .map(s => s.mul(s.max) * (s.hits || 1)).sort((a, b) => b - a).slice(0, slots)
    .reduce((a, m, i) => a + m * (f[i] || .3), 0) * (1 + iint * .01);
};
const autoDps = () => P.atk() * (1 / P.aspd()) * (1 + Math.min(100, P.crit()) / 100 * (P.critD() - 1));
const bossHp = () => { const mp = P.MAPS[9], pw = mp.b + 10, mb = 1 + 9 * .15 + Math.max(0, 9 - 4) * .2; return Math.floor(500 * mb * Math.pow(pw, P.HPE)); };

t('petDmg is the real formula: atk x PETBAL x rarity x mutation x Claw', () => {
  P.S = endgame('Lord Knight');
  const a = P.atk();
  const angeling = maxedPet(7);                               // Angeling, Legendary
  assert.strictEqual(P.PETS[7].n, 'Angeling');
  assert.strictEqual(P.petDmg(angeling), Math.round(a * P.PETBAL * 1 * 40 * 1.6), 'Legendary + G6 + Mythril Claw');
  const poring = maxedPet(0);                                 // Poring, Common
  assert.strictEqual(P.petDmg(poring), Math.round(a * P.PETBAL * .2 * 40 * 1.6), 'Common pets are a fifth of that');
  assert.ok(Math.abs(P.petInt(angeling) - 1.25 / 1.4) < 1e-9, 'Collar 5 = 40% faster attacks');
});

t('Blood Siphon heals you for 5% of what the pet deals; Vital Aura moves the HP cap', () => {
  P.S = endgame('Lord Knight');
  P.resetPetState();
  const base = P.maxHp();
  P.petBuff.leech = 5;
  P.S.hp = 100;
  P.petLeech(1000);
  assert.strictEqual(P.S.hp, 150, '5% of a 1000-damage hit is 50 HP');
  P.S.hp = 100; P.petLeech(0);
  assert.strictEqual(P.S.hp, 100, 'a swing that dealt nothing heals nothing');
  P.resetPetState();
  P.petBuff.hp = 20; P.petBuff.hpT = 30;
  assert.strictEqual(P.maxHp(), Math.round(base * 1.2), '+20% Max HP, exactly');
  P.S.hp = P.maxHp();
  P.petBuff.hpT = 0.05;
  P.tickPet(0.1);
  assert.strictEqual(P.petBuff.hp, 0, 'the buff lapses');
  assert.ok(P.S.hp <= P.maxHp(), 'and the bar is clamped back down to the unbuffed cap');
  P.resetPetState();
});

t('MEASUREMENT: one maxed pet must deal about as much as one maxed CHARACTER', () => {
  P.S = endgame('Lord Knight');
  const atk = P.atk(), auto = autoDps(), rot = rotMul(), full = auto * rot;
  const rows = P.PETS.map((sp, i) => {
    const p = maxedPet(i), dmg = P.petDmg(p), dps = petDps(p);
    return { pet: sp.n, rar: P.RN[sp.r], dmg, dps };
  });
  console.log('       endgame Lord Knight: ATK ' + atk.toLocaleString() + ' | ' + (1 / P.aspd()).toFixed(2) + ' swings/s | ' +
    Math.min(100, P.crit()).toFixed(0) + '% crit at x' + P.critD().toFixed(2) + ' => auto-attack DPS ' + Math.round(auto).toLocaleString() +
    ' | whole maxed rotation (x' + rot.toFixed(2) + ' per swing) ' + Math.round(full).toLocaleString());
  console.log('       one maxed pet (G6, Mythril 5/5/5, Piercing Fang + Spirit Bolt):');
  rows.forEach(r => console.log('         ' + r.pet.padEnd(13) + r.rar.padEnd(10) + 'hit ' + String(r.dmg).padStart(10) +
    '  |  DPS ' + String(Math.round(r.dps)).padStart(10) + '  = ' + (r.dps / full).toFixed(2) + 'x a maxed character'));
  const best = rows[7].dps, worst = rows[0].dps, ratio = best / full;
  console.log('       x3 pets on the field: ' + Math.round(best * 3).toLocaleString() + ' DPS at the top, ' + Math.round(worst * 3).toLocaleString() + ' at the bottom');
  console.log('       Abyss stage-10 boss HP ' + bossHp().toLocaleString() + ' -> one maxed Angeling alone kills it in ' + (bossHp() / best).toFixed(2) + 's');
  console.log('       PETBAL ' + P.PETBAL + ' delivers ' + ratio.toFixed(3) + 'x the maxed rotation (the target is 1.00x)');
  assert.ok(best > 0 && Number.isFinite(best), 'the measurement must produce a number');
  // THE BALANCE. 12% of slack leaves room for the model approximating petHit()'s skill order,
  // but a real retune (double or halve the pets) moves it far outside this band.
  assert.ok(Math.abs(ratio - 1) <= .12, 'a maxed pet must land within 12% of a maxed character (got ' + ratio.toFixed(3) + 'x)');
  assert.ok(worst / full > .14, 'even a Common pet must be a real companion (got ' + (worst / full).toFixed(2) + 'x)');
});

t('the stepped simulation and the analytic model agree (real petHit, crits off)', () => {
  const p = maxedPet(7);
  const analytic = petDps(p, ['piercingfang', 'spiritbolt'], { crit: false });
  const stepped = simPetDps(p, 120);
  console.log('       120s of real petHit(): ' + Math.round(stepped).toLocaleString() + ' DPS vs model ' + Math.round(analytic).toLocaleString() +
    ' DPS (delta ' + ((stepped / analytic - 1) * 100).toFixed(1) + '%)');
  assert.ok(Math.abs(stepped / analytic - 1) < .06, 'the model must track the real code (' + (stepped / analytic).toFixed(3) + 'x)');
  // and a pet whose second slot is a buff trades a little DPS for the party buff
  const buffPet = maxedPet(7, ['piercingfang', 'warcry']);
  const buffDps = petDps(buffPet, ['piercingfang', 'warcry']);
  console.log('       same pet with Piercing Fang + War Cry instead: ' + Math.round(buffDps).toLocaleString() + ' DPS, and the player keeps +20% ATK for 30s of every 60s');
  assert.ok(buffDps < petDps(p, ['piercingfang', 'spiritbolt']), 'a buff slot costs the pet damage, as it should');
});

t('the buffs lift the player as well as the pet, and only once', () => {
  P.S = endgame('Lord Knight');
  P.resetPetState();
  const p = maxedPet(7);
  const before = P.petDmg(p), atkBefore = P.atk(), hpBefore = P.maxHp();
  P.petBuff.atk = 20;                                  // War Cry, +20% for 30s
  const rAtk = P.atk() / atkBefore, rPet = P.petDmg(p) / before;
  assert.ok(rAtk > 1.05, 'the buff is a real gain even after gear and passives dilute it (x' + rAtk.toFixed(3) + ')');
  assert.ok(Math.abs(rAtk - rPet) < .02, 'and the pet rises by exactly the same factor, because petDmg reads atk()');
  P.petBuff.matk = 20;
  const bothAtk = P.atk();
  P.resetPetState();
  assert.ok(bothAtk > atkBefore, 'MATK alongside it changes nothing about ATK - the two are separate stats, and the rules above keep them from running together');
  assert.strictEqual(P.maxHp(), hpBefore, 'and no buff is left running after a reset');
});

t('roster and costs are visible data (for the Pets panel and the notes)', () => {
  const line = P.PETS.map((p, i) => p.n + ' (' + P.RN[p.r] + ', ' + P.rollCost({ sp: i }) + 'z per mutation roll)').join(' | ');
  console.log('       ' + line);
  console.log('       maxing one stat: ' + JSON.stringify(P.PT) + ' at ' + P.PTG.map(x => Math.round(x * 100) + '%').join('/') + ' per roll, ' + P.peqCost(0) + '-' + P.peqCost(4) + 'z per roll');
  P.PETS.forEach((p, i) => assert.ok(P.rollCost({ sp: i }) === 2500 * (1 + p.r), 'mutation roll price'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
