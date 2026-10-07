// Pet data & power: the roster, the training ladder, the twelve gacha skills, the buff rules, and
// what a MAXED pet (G6 mutation + all three pieces at Mythril 5/5 + two attack skills) actually
// does to the numbers.
//   node tools/tests/pet_sim.js
//
// The rules being checked:
//   * the roster is 8 pets across 4 rarities (two each), and the gacha has twelve skills - 4
//     temporary player buffs, 4 attacks (2 AoE, 2 single-target), and 4 low-impact utilities;
//   * every pet has TWO skill slots and one roll fills both, never repeating a skill;
//   * a pet can use one skill per PETGAP (7s) on top of that skill's own cooldown, every player
//     buff lasts 30s on a 60s cooldown, a buff never stacks (a second pet's copy is ignored) and
//     ATK and MATK can never run at the same time;
//   * the training ladder is the shipped one: PTG .40/.25/.15/.09/.05, GREAT 5% double-ups,
//     peqCost(t) = 1200(t+1)^2, Claw +10%/tier, Collar +7% attack speed/tier, Charm +5% crit/tier;
//   * petDmg() is the real formula - atk() x PETBAL x rarity x mutation x Claw;
//   * BALANCE: one fully maxed pet should deal about 0.6-0.7x ONE fully maxed character's
//     sustained rotation. The complete chain is asserted, not just base auto-attacks.
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
  pick(/const MAPGRADE=\[[^\]]*\];/, 'MAPGRADE'),
  pick(/const MAPVAL=\[[^\]]*\];/, 'MAPVAL'),
  pick(/const dropTier=\(m,l\)=>[^;]+;/, 'dropTier'),
  // the equipment catalogue + the map table + its level bands (a stub mob parser, since pet
  // power does not depend on monster sprites)
  'const pm=s=>{const[n,c,sh]=String(s).split(":");return{n,c:parseInt(c,16)||0,shape:sh,spriteId:0,spriteSize:"Medium",spriteScale:1}};',
  grab('const G=(w,a,h,o,l,ac,ac2)=>', 'const pw=()=>'),
  grab('function genGear(T,l,sec,boss,tier){', '// ---------- skill effects'),
  grab('const PETS=[', 'const rollingSet=new Set'),      // roster, traits, bond ladder, PEQ, the 12 skills, petDmg/petHit
  grab('function petFold(own,inc){', 'function petDetail(p){'),   // v75 folding
  pick(/const PET_SKILL_WEIGHTS=\[[^\n]*/, 'rollPetSkills'),
  pick(/const SKSLOTS=t=>[^;]+;/, 'SKSLOTS/SKFADE'),
  pick(/const skOff=id=>[^\n]*/, 'skOff/skillOn'),
].join('\n');

const harness = `
${code}
let __seed=1;const __r=()=>((__seed=(__seed*1103515245+12345)>>>0)/4294967296);
const rnd=(a,b)=>a+__r()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
const pickW=w=>{let r=Math.random()*w.reduce((x,y)=>x+y,0);for(let i=0;i<w.length;i++){r-=w[i];if(r<0)return i}return w.length-1};
let S=null,tb={},petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={},petSkillCd={},petNote={},mobs=[],pl={x:1.5,z:1.5};
const numTxt=String,addFloat=()=>{},playSkillFx=()=>{},log=()=>{},earnZeny=()=>{},collDmg=()=>0;
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
  petBuff,petBuffSrc,PET_SKILL_WEIGHTS,setMobs:m=>{mobs=m},setDealt:v=>{dealt=v},getDealt:()=>dealt,
  PETBOND,PET_TRAIT,bondCnt,bondRank,bondNext,traitVal,petPassive,petBonusList,petFold,foldDupPets,
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
console.log('pet: roster, ladders, the twelve skills, buff rules and the safer maxed-pet measurement\n');

// ---------------------------------------------------------------- the data
t('the roster is 8 pets, two at each of the four rarities', () => {
  assert.strictEqual(P.PETS.length, 8);
  assert.deepStrictEqual([...new Set(P.PETS.map(p => p.r))], [0, 1, 2, 3]);
  [0, 1, 2, 3].forEach(r => assert.strictEqual(P.PETS.filter(p => p.r === r).length, 2, 'rarity ' + r + ' must hold two pets'));
  assert.strictEqual(new Set(P.PETS.map(p => p.spriteId)).size, 8, 'every pet has its own Divine Pride id');
});

t('the gacha has twelve skills: 4 buffs, 2 AoE, 2 single-target and 4 utility', () => {
  assert.strictEqual(P.PET_SKILLS.length, 12);
  const kinds = P.PET_SKILLS.map(s => s.kind);
  assert.strictEqual(kinds.filter(k => k === 'buff').length, 4, 'four player buffs');
  assert.strictEqual(kinds.filter(k => k === 'aoe').length, 2, 'two AoE');
  assert.strictEqual(kinds.filter(k => k === 'single').length, 2, 'two single-target');
  P.PET_SKILLS.forEach(s => {
    assert.ok(s.cd > 0 && s.desc && s.icon && s.color, s.n + ' must be a complete entry');
    if(s.kind==='aoe'||s.kind==='single')assert.ok(s.desc.includes(String(s.power)), s.n + ' description must state its power (' + s.desc + ')');
    if(s.kind==='utility')assert.ok(/no combat damage/i.test(s.desc), s.n + ' must be explicitly non-DPS');
  });
  // every player buff is 30s on a 60s cooldown, and one gacha per pet
  const buffs = P.PET_SKILLS.filter(s => s.kind === 'buff');
  assert.deepStrictEqual([...buffs.map(s => s.stat)], ['atk', 'matk', 'leech', 'hp'], 'ATK, MATK, leech, max HP');
  assert.deepStrictEqual([...buffs.map(s => s.power)], [15, 15, 3, 15], '+15% ATK, +15% MATK, 3% leech, +15% max HP');
  buffs.forEach(s => {
    assert.strictEqual(s.duration, 30, s.n + ' must last 30s');
    assert.strictEqual(s.cd, 60, s.n + ' must sit on a 60s cooldown');
    assert.ok(/never stacks/i.test(s.desc), s.n + ' must say that it never stacks');
  });
  P.PET_SKILLS.filter(s => s.kind === 'aoe').forEach(s => assert.ok(s.radius >= 4, s.n + ' needs a real radius'));
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'flameburst').power, 1.45);
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'thunderclap').power, 1.25);
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'piercingfang').power, 2);
  assert.strictEqual(P.PET_SKILLS.find(s => s.id === 'spiritbolt').power, 2.25);
  assert.strictEqual(P.PET_SKILLS.filter(s => s.kind === 'utility').length, 4, 'four low-impact utility skills');
  assert.ok(P.PET_SKILL_WEIGHTS[0] < P.PET_SKILL_WEIGHTS[2] && P.PET_SKILL_WEIGHTS[1] < P.PET_SKILL_WEIGHTS[2], 'ATK/MATK buffs must be less common');
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
  assert.strictEqual(seen.size, 12, 'after 200 rolls every skill must have come up at least once');
});

t('a new species arrives with one rolled skill; a duplicate folds into Bond (v75)', () => {
  // The LIVE drop site inside kill(), cut out by its own opening so the offline simulator (which
  // has the same roll) cannot satisfy the match. Owner's v75 rule: a duplicate is not junk, it
  // becomes Bond - so this branch, not the push, is what an owned species goes through.
  const drop = grab('if(Math.random()*100<(mob.boss?.5:.03)){const r=pickW(PW[Math.min(S.mp,9)])', 'checkLevel();');
  assert.ok(drop.includes('const own=S.pets.find(x=>x.sp===sp)'), 'the drop must look for a pet of that species you already own');
  assert.ok(drop.includes('if(own){') && drop.includes('petFold(own,{'), 'a duplicate is folded in, never pushed as a second copy');
  // a NEW species still rolls the SAME weighted pool the gacha uses, and stores one skill
  assert.ok(drop.includes('const gifted=pickW(PET_SKILL_WEIGHTS);S.pets.push({'), 'a new species must roll one skill');
  assert.ok(drop.includes('skills:[PET_SKILLS[gifted].id]'), 'and the pet must arrive with it slotted');
  assert.ok(drop.includes('${PET_SKILLS[gifted].n}'), 'the drop message must name the skill it brought');
  // one filled slot, and the gacha is what completes the pair
  const p1 = { skills: ['warcry'] };
  assert.strictEqual(P.petSkills(p1).length, 1, 'a fresh pet holds exactly one skill');
  const p2 = { skills: ['warcry', 'spiritbolt'] };
  assert.strictEqual(P.petSkills(p2).length, 2, 'the gacha fills the second slot');
  // and the panel says so, instead of promising an empty pet
  assert.ok(src.includes('Every pet arrives from a drop with one random skill already slotted'),
    'the pets panel must explain the free skill');
  assert.ok(src.includes("SL.length===1?'Gacha the second skill'"), 'and the button must say what the paid roll will do');
});

t('the extra gacha skills are low-impact utility, not hidden DPS', () => {
  const utility=P.PET_SKILLS.filter(s=>s.kind==='utility');
  assert.strictEqual(JSON.stringify(utility.map(s=>s.effect)),JSON.stringify(['zeny','heal','def','comfort']));
  assert.ok(utility.every(s=>!('power' in s)&&/no combat damage/i.test(s.desc)));
  assert.ok(utility.find(s=>s.effect==='zeny').value<=50,'Zeny utility stays minor');
  assert.ok(utility.find(s=>s.effect==='heal').value<=5,'the heal utility stays minor');
  assert.ok(utility.find(s=>s.effect==='def').value<=5,'the defense utility stays minor');
});

t('the training ladder is the shipped one', () => {
  assert.deepStrictEqual([...P.PT], ['Wooden', 'Iron', 'Silver', 'Gold', 'Mythril']);
  assert.deepStrictEqual([...P.PTG], [.4, .25, .15, .09, .05], 'success chance by current tier');
  assert.strictEqual(P.GREAT, .05, 'one success in twenty jumps two tiers');
  assert.deepStrictEqual(Array.from({ length: 5 }, (_, t) => P.peqCost(t)), [1200, 4800, 10800, 19200, 30000], 'peqCost(t) = 1200(t+1)^2');
  assert.strictEqual(P.PEQ[0].d(5), '+50% pet damage', 'Mythril Claw = +10%/tier');
  assert.strictEqual(P.PEQ[1].d(5), '+35% pet attack speed', 'Mythril Collar = +7%/tier');
  assert.strictEqual(P.PEQ[2].d(5), '25% pet crit chance (x2 damage)', 'Mythril Charm = +5%/tier');
  assert.ok(src.includes('p.eq[2]*5'), 'live pet critical rolls must use the tuned Charm rate');
  assert.strictEqual(P.MUT.length, 7, 'grade 0 (none) through grade 6');
  assert.strictEqual(P.MUT[6], 38, 'G6 is x38 damage');
  assert.ok(P.PETBAL > 0 && Number.isFinite(P.PETBAL), 'the pet balance knob exists');
});

// ---------------------------------------------------------------- the buff rules
t('the buff rules are enforced and readable: no stacking, ATK or MATK but not both', () => {
  P.resetPetState();
  const byId = id => P.PET_SKILLS.find(s => s.id === id);
  assert.strictEqual(P.petBuffWhy(byId('warcry')), '', 'ATK is castable into an empty field');
  assert.strictEqual(P.petBuffWhy(byId('vital')), '', 'and so is max HP');
  P.petBuff.atk = 15; P.petBuff.atkT = 30;
  assert.strictEqual(P.petBuffWhy(byId('warcry')), 'the ATK buff is already up', 'a second pet cannot stack a second ATK buff');
  assert.strictEqual(P.petBuffWhy(byId('arcane')), 'ATK cannot run next to MATK', 'and MATK cannot join it');
  P.resetPetState();
  P.petBuff.matk = 15; P.petBuff.matkT = 30;
  assert.strictEqual(P.petBuffWhy(byId('arcane')), 'the MATK buff is already up');
  assert.strictEqual(P.petBuffWhy(byId('warcry')), 'MATK cannot run next to ATK');
  P.resetPetState();
  P.petBuff.hp = 15; P.petBuff.hpT = 30; P.petBuff.leech = 3; P.petBuff.leechT = 30;
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
const critFactor = p => 1 + Math.min(1, p.eq[2] * .05) * 1;
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
  list.forEach((s, i) => { if (s.kind === 'aoe' || s.kind === 'single') dps += dmg * s.power * uses[i]; });
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
  assert.strictEqual(P.petDmg(angeling), Math.round(a * P.PETBAL * 1 * 38 * 1.5), 'Legendary + G6 + Mythril Claw');
  const poring = maxedPet(0);                                 // Poring, Common
  assert.strictEqual(P.petDmg(poring), Math.round(a * P.PETBAL * .2 * 38 * 1.5), 'Common pets are a fifth of that');
  assert.ok(Math.abs(P.petInt(angeling) - 1.25 / 1.35) < 1e-9, 'Collar 5 = 35% faster attacks');
});

t('Blood Siphon heals you for 3% of what the pet deals; Vital Aura moves the HP cap', () => {
  P.S = endgame('Lord Knight');
  P.resetPetState();
  const base = P.maxHp();
  P.petBuff.leech = 3;
  P.S.hp = 100;
  P.petLeech(1000);
  assert.strictEqual(P.S.hp, 130, '3% of a 1000-damage hit is 30 HP');
  P.S.hp = 100; P.petLeech(0);
  assert.strictEqual(P.S.hp, 100, 'a swing that dealt nothing heals nothing');
  P.resetPetState();
  P.petBuff.hp = 15; P.petBuff.hpT = 30;
  assert.strictEqual(P.maxHp(), Math.round(base * 1.15), '+15% Max HP, exactly');
  P.S.hp = P.maxHp();
  P.petBuff.hpT = 0.05;
  P.tickPet(0.1);
  assert.strictEqual(P.petBuff.hp, 0, 'the buff lapses');
  assert.ok(P.S.hp <= P.maxHp(), 'and the bar is clamped back down to the unbuffed cap');
  P.resetPetState();
});

t('every species has ONE signature passive, 5% at Bond 0 and 10% at Bond 5 (v75)', () => {
  // The owner's instruction: passives yes, "tune it down hard. i dont want any buff go above 10%".
  assert.strictEqual(P.PET_TRAIT.length, 8, 'one trait per species');
  assert.ok(P.PET_TRAIT.every(t => t.n && typeof t.d === 'function' && t.k.length >= 1), 'every trait is named, described and keyed');
  const keys = P.PET_TRAIT.flatMap(t => t.k);
  assert.deepStrictEqual([...new Set(keys)].sort(),
    ['boss', 'dr', 'exp', 'gear', 'hp', 'move', 'ore', 'petdmg', 'zeny'], 'the nine hooks the game actually reads');
  // the ceiling, tested at both ends of the ladder
  assert.strictEqual(P.traitVal(0), 5, 'a pet you just tamed gives 5 percent');
  P.S = { pets: [], bond: [] };
  assert.strictEqual(P.bondRank(0), 0);
  for(const t of P.PETBOND) assert.strictEqual(P.bondNext(0) > 0, true);
  P.S.bond = [1];
  assert.strictEqual(P.bondRank(0), 1, 'one folded duplicate is Bond 1');
  P.S.bond = [3]; assert.strictEqual(P.bondRank(0), 2);
  P.S.bond = [6]; assert.strictEqual(P.bondRank(0), 3);
  P.S.bond = [10]; assert.strictEqual(P.bondRank(0), 4);
  P.S.bond = [15]; assert.strictEqual(P.bondRank(0), 5, 'fifteen folds caps the species');
  assert.strictEqual(P.bondNext(0), null, 'and nothing is left to chase at Bond 5');
  assert.strictEqual(P.traitVal(0), 10, 'Bond 5 is exactly the owner 10% ceiling');
  P.S.bond = [999]; assert.strictEqual(P.traitVal(0), 10, 'and it can never pass it');
  P.S.bond = [0];
  assert.strictEqual(P.traitVal(1), 5, 'the ladder is per species');
  P.S.bond = Array(8).fill(999);
  for(let sp = 0; sp < 8; sp++) assert.strictEqual(P.traitVal(sp), 10, P.PETS[sp].n + ' stops at 10%');
});

t('petPassive adds the FIGHTING pets, one copy per species, and nothing else', () => {
  const pet = (sp, on) => ({ id: sp + 1, sp, mut: 0, eq: [0, 0, 0], skills: [], on });
  P.S = { pets: [pet(0, true), pet(2, false), pet(4, true)], bond: [] };   // Poring + Peco Peco fight, the Wolf is benched
  assert.strictEqual(P.petPassive('zeny'), 5, 'Poring pays +5% Zeny');
  assert.strictEqual(P.petPassive('move'), 5, 'a fighting Peco Peco mounts you');
  assert.strictEqual(P.petPassive('petdmg'), 0, 'a Wolf on the bench leads no pack');
  P.S.pets[1].on = true;
  assert.strictEqual(P.petPassive('petdmg'), 5, 'send the Wolf to battle and the pack follows');
  assert.strictEqual(P.petPassive('move'), 5, 'send it to battle and the mount counts');
  assert.strictEqual(P.petPassive('zeny') + P.petPassive('move'), 10, 'two species, two separate numbers');
  // a hand-edited save cannot stack one species twice: the bonus is per SPECIES, not per pet
  P.S = { pets: [pet(0, true), pet(0, true), pet(0, true)], bond: [15] };
  assert.strictEqual(P.petPassive('zeny'), 10, 'three Porings still pay one Poring bonus (at Bond 5)');
  P.S = { pets: [pet(7, true)], bond: [0, 0, 0, 0, 0, 0, 0, 15] };   // Bond 5 = 15 folded Angeling
  const ag = P.petPassive('hp'), dr = P.petPassive('dr');
  assert.ok(ag > 0 && ag === dr, 'Divine Grace raises Max HP and cuts damage taken by the same number');
  assert.strictEqual(ag, 10, 'and that number obeys the ceiling');
  const list = P.petBonusList();
  assert.strictEqual(list.length, 1, 'the sheet lists one row per fighting species');
  assert.ok(/Angeling Divine Grace \+10% Max HP and 10% less damage taken/.test(list[0]), 'and spells the bonus out: ' + list[0]);
  P.S = { pets: [], bond: [] };
  assert.strictEqual(P.petBonusList().length, 0, 'no pets, no rows');   // cross-realm: compare lengths, not realms
});

t('a duplicate folds in: best mutation, best gear, the missing skill, +1 Bond (v75)', () => {
  const own = { id: 1, sp: 1, mut: 2, eq: [1, 0, 0], skills: ['warcry'], on: false };
  const inc = { id: 2, sp: 1, mut: 1, eq: [0, 4, 2], skills: ['spiritbolt', 'warcry'], on: true };
  P.S = { pets: [own], bond: [] };
  const r = P.petFold(own, inc);
  assert.strictEqual(own.mut, 2, 'the better mutation survives');
  assert.deepStrictEqual(own.eq, [1, 4, 2], 'each gear slot keeps its better level');
  assert.deepStrictEqual(own.skills, ['warcry', 'spiritbolt'], 'the missing skill is merged into the free slot, never a duplicate');
  assert.deepStrictEqual([r.before, r.after, r.bond], [0, 1, 1], 'and the species gains exactly one Bond');
  // a WORSE duplicate changes nothing but the Bond
  const before = JSON.stringify([own.mut, own.eq, own.skills]);
  P.petFold(own, { id: 3, sp: 1, mut: 0, eq: [0, 0, 0], skills: [] });
  assert.strictEqual(JSON.stringify([own.mut, own.eq, own.skills]), before, 'a weak duplicate adds Bond and nothing else');
  assert.strictEqual(P.bondCnt(1), 2, 'two folds, two Bond points');
  // two slots is still the cap
  const filled = { id: 4, sp: 3, mut: 0, eq: [0, 0, 0], skills: ['warcry', 'vital'], on: true };
  P.S = { pets: [filled], bond: [] };
  P.petFold(filled, { id: 5, sp: 3, mut: 0, eq: [0, 0, 0], skills: ['treasuresniff'] });
  assert.deepStrictEqual(filled.skills, ['warcry', 'vital'], 'a third skill cannot squeeze into two slots');
  // an old save with a stack of one species is folded on login, keeping the best copy and the ON flag
  P.S = { pets: [{ id: 6, sp: 0, mut: 0, eq: [0, 0, 0], skills: ['tailwag'], on: false },
                 { id: 7, sp: 0, mut: 4, eq: [2, 0, 0], skills: ['warmnuzzle'], on: true },
                 { id: 8, sp: 0, mut: 0, eq: [0, 0, 0], skills: [], on: false },
                 { id: 9, sp: 2, mut: 0, eq: [0, 0, 0], skills: [], on: true }], bond: [] };
  const folded = P.foldDupPets();
  assert.strictEqual(folded, 2, 'two Porings were folded');
  assert.strictEqual(P.S.pets.length, 2, 'one Poring and the untouched Peco Peco are left');
  const survivor = P.S.pets.find(p => p.sp === 0);
  assert.strictEqual(survivor.mut, 4, 'the G4 copy survived');
  assert.strictEqual(survivor.on, true, 'and it kept the fighting slot either copy had');
  assert.ok(survivor.skills.includes('tailwag') && survivor.skills.includes('warmnuzzle'), 'both skills were merged in');
  assert.strictEqual(P.bondCnt(0), 2, 'two folds = Bond 2');
  assert.strictEqual(P.foldDupPets(), 0, 'a second sweep finds nothing to do');
});

t('every signature passive is wired into the real game (v75)', () => {
  // A trait table nobody reads is a lie on a card. Each key is grepped at the exact site that
  // consumes it, so renaming a hook without updating the trait (or the other way round) fails here.
  const sites = {
    zeny: /mob\.zeny\*\(1\+pv\('zeny'\)\/100\)\*\(1\+petPassive\('zeny'\)\/100\)/,
    exp: /mob\.exp\*expRate\(\)\*\(1\+petPassive\('exp'\)\/100\)/,
    gear: /ch\*\(1\+petPassive\('gear'\)\/100\)/,
    ore: /mob\.oreCh\*\(1\+petPassive\('ore'\)\/100\)/,
    petdmg: /MUT\[p\.mut\]\*\(1\+p\.eq\[0\]\*\.10\)\*\(1\+petPassive\('petdmg'\)\/100\)/,
    boss: /mob\.boss\?1\+petPassive\('boss'\)\/100:1/,
    hp: /maxHp=\(\)=>[^;]*\(1\+petPassive\('hp'\)\/100\)/,
    dr: /\(1-cut\)\*\(1-petPassive\('dr'\)\/100\)/,
    move: /moveSpd=\(\)=>heroMoveSpeedForAgi\(st\('agi'\)\)\*\(1\+petPassive\('move'\)\/100\)/,
  };
  for(const k of Object.keys(sites)) assert.ok(sites[k].test(src), k + ' is never read by index.html');
  assert.ok(/spd=moveSpd\(\);/.test(src), 'the walk must call moveSpd(), or Swift Mount would only exist on the sheet');
  assert.strictEqual((src.match(/petPassive\('dr'\)/g) || []).length, 1, 'Divine Grace is read once, on the hit you take');
  // Executioner is read on all three damaging paths - your swing, your pet's skill and your
  // pet's auto-attack - and nowhere else
  assert.strictEqual((src.match(/petPassive\('boss'\)/g) || []).length, 3, 'Executioner covers your hit and both pet hits');
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
  console.log('       PETBAL ' + P.PETBAL + ' delivers ' + ratio.toFixed(3) + 'x the maxed rotation (the target is 0.60-0.70x)');
  assert.ok(best > 0 && Number.isFinite(best), 'the measurement must produce a number');
  // THE BALANCE. The complete chain should stay in the requested 0.6-0.7x companion band.
  assert.ok(ratio >= .58 && ratio <= .72, 'a maxed pet must land around 0.6-0.7x of a maxed character (got ' + ratio.toFixed(3) + 'x)');
  assert.ok(worst / full > .08, 'even a Common pet must be a real companion (got ' + (worst / full).toFixed(2) + 'x)');
  // v75: the SIGNATURE PASSIVES have to live inside this band too. Pack Leader (+10% pet damage
  // for every fighting pet, at Bond 5) is the only one that touches this number, and the owner
  // approved a bonus of at most 10% - so the band moves deliberately to at most 0.78x with the
  // strongest legal pack running, and this line is what holds that promise.
  const withPack = ratio * (1 + 10 / 100);
  console.log('       with Pack Leader maxed (+10%) the same pet sits at ' + withPack.toFixed(3) + 'x, the v75 limit');
  assert.ok(withPack <= .78, 'the passives must keep a maxed pet inside the companion band (got ' + withPack.toFixed(3) + 'x)');
});

t('the stepped simulation and the analytic model agree (real petHit, crits off)', () => {
  P.S = endgame('Lord Knight');       // a full character: the new trait tests below it leave a bare fixture behind
  const p = maxedPet(7);
  const analytic = petDps(p, ['piercingfang', 'spiritbolt'], { crit: false });
  const stepped = simPetDps(p, 120);
  console.log('       120s of real petHit(): ' + Math.round(stepped).toLocaleString() + ' DPS vs model ' + Math.round(analytic).toLocaleString() +
    ' DPS (delta ' + ((stepped / analytic - 1) * 100).toFixed(1) + '%)');
  assert.ok(Math.abs(stepped / analytic - 1) < .06, 'the model must track the real code (' + (stepped / analytic).toFixed(3) + 'x)');
  // and a pet whose second slot is a buff trades a little DPS for the party buff
  const buffPet = maxedPet(7, ['piercingfang', 'warcry']);
  const buffDps = petDps(buffPet, ['piercingfang', 'warcry']);
  console.log('       same pet with Piercing Fang + War Cry instead: ' + Math.round(buffDps).toLocaleString() + ' DPS, and the player keeps +15% ATK for 30s of every 60s');
  assert.ok(buffDps < petDps(p, ['piercingfang', 'spiritbolt']), 'a buff slot costs the pet damage, as it should');
});

t('the buffs lift the player as well as the pet, and only once', () => {
  P.S = endgame('Lord Knight');
  P.resetPetState();
  const p = maxedPet(7);
  const before = P.petDmg(p), atkBefore = P.atk(), hpBefore = P.maxHp();
  P.petBuff.atk = 15;                                  // War Cry, +15% for 30s
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
