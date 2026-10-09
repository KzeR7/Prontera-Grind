// Equipment database, per-map drop relevance, the drop mix, and the slot chooser.
//   node tools/tests/gear_sim.js
//
// The rules being tested:
//   * the catalogue is a real database: 10 maps x 4 sections (starter / 1st job / 2nd job /
//     high tier), each with weapons plus body, headgear, shield, legwear and accessories; the
//     active late-map sections carry every weapon family so all classes can hunt their own;
//   * a drop is RELEVANT: every weapon in a map's pool is one a class that actually levels
//     there can use, and every class that levels there can use at least one weapon in each
//     of that map's sections;
//   * gear is the common drop and cards are the rare one - the old field rolled two gear
//     items and three mobs' worth of cards, so card drops outnumbered equipment;
//   * fieldOf() only ever hands out items that are in that field's own pool, and the boss
//     of a level-10 field drops the whole pool;
//   * clicking an equipment slot opens a bag filtered to exactly what that slot takes for
//     that class - a weapon of the wrong type, a shield for a class that cannot hold one,
//     a legwear item for the weapon slot, a card or an ore are all refused.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

const killStart = src.indexOf('function kill(o){');
const gearDropStart = src.indexOf('  for(const[T,ch]of mob.drops)', killStart);
// The slice runs from the gear loop, past the card gate, to the ore gate. A fixture only carries
// cardCh/card when a test wants the card branch, so the extra lines are inert for the rest - and
// they let this suite drive the ore roll (Sand Tracker's hook) too.
const gearDropEnd = src.indexOf("  if(Math.random()*100<(mob.boss?.5:.03)){", gearDropStart);
if (killStart < 0 || gearDropStart < 0 || gearDropEnd < gearDropStart) throw new Error('cannot find the live kill() drop loops');
const gearDropLoop = src.slice(gearDropStart, gearDropEnd);
const code = [
  'const bon=()=>0;',
  grab('const CD=[', 'const pm=s=>'),                       // class roster: CLASSES, lineOf
  pick(/const C=\(\)=>[^;]+;/, 'C()'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'canUse'),
  grab('const pm=s=>', 'const REC='),                        // pm() + MAPS
  grab('const NMNAME=', 'const EARLY_FIELD_PWR'),             // the two Nightmare rows appended to GEAR
  pick(/const secOf=[^;]+;/, 'secOf'),
  pick(/const NMLV=[^;]+;/, 'NMLV'),
  pick(/const nmTierOf=[^\n]*/, 'nmTierOf'),
  pick(/const secField=\(m,l\)=>[^;]+;/, 'secField'),
  pick(/const RAR=\[[^\]]*\];/, 'RAR'),
  pick(/const RAR5=\{[^;]*;/, 'the Nightmare N rarity helpers (v76.2)'),
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'rarity tables'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AFF/AB'),
  pick(/const FIELD_GEAR=\[[^\]]*\],FIELD_GEAR_MID=\[[^\]]*\],BOSS_POOL_TOTAL=\[[^\]]*\];/, 'field drop tables'),
  pick(/const FIELD_GEAR_NM=\[[^\]]*\],FIELD_GEAR_MID_NM=\[[^\]]*\];/, 'the Nightmare drop tables'),
  pick(/const NMPLUS_DROP=[^;]+;/, 'the v89 N+ drop halving'),
  pick(/const NM_MAT=\[[^\]]*\];/, 'the Nightmare crafting materials'),
  pick(/const NM_MAT_CH=[^;]+;/, 'the material drop chance'),
  pick(/const BOSS_CRIT_RES=\[[^\]]*\],NM_CRIT_RES=\[[^\]]*\],bossCritRes=\(m,l\)=>[^;]+;/, 'boss crit resistance (+ the v76 Nightmare ladder)'),
  pick(/const AFFIX_CDM_SCALE=[^\n]+;/, 'gear-only Crit DMG post-roll scale'),
  pick(/K5=\[[^\]]*\];/, 'K5'),
  pick(/const cardVal=\(g,st\)=>[^;]+;/, 'cardVal'),
  pick(/const cardStat=\(g,seed\)=>\{[^}]*\};/, 'cardStat'),
  pick(/const SU=k=>[^,]+/, 'SU'),
  grab('function gearPool(m,l){', 'const dropTxt='),
  pick(/const BAGMAX=\d+;/, 'BAGMAX'),
  pick(/const MAPTIER=\[[^\]]*\];/, 'MAPTIER'),
  pick(/const MAPGRADE=\[[^\]]*\];/, 'MAPGRADE'),
  pick(/const MAPVAL=\[[^\]]*\];/, 'MAPVAL'),
  pick(/const dropTier=\(m,l\)=>[^;]+;/, 'dropTier'),
  pick(/const sellVal=it=>[^;]+;/, 'sellVal'),
  grab('function genGear(T,l,sec,boss,tier){', '// ---------- skill effects'),
  pick(/const NM_FLAT=\[[^\]]*\],NM_FLAT_MUL=\[[^\]]*\],NM_MUL=\{[^}]*\};/, 'the v89/v90 Nightmare affix multipliers'),
  pick(/const nmMulOf=\(k,section\)=>[^\n]*/, 'nmMulOf'),
  pick(/const NM_ABYSS_AFF=[^;]+;/, 'NM_ABYSS_AFF'),
  pick(/const nmAffMapOf=[^\n]*/, 'nmAffMapOf'),
  pick(/const affixValue=\(k,section,tier,roll[^)]*\)=>\{[^}]+\};/, 'affixValue'),
  `function executeGearRoll(mob,roll){const old=Math.random;Math.random=()=>roll;const drops=[],mkDrop=it=>({it});try{${gearDropLoop}}finally{Math.random=old}return drops}`,
  grab('function canShield(){', 'function ekey(it)'),        // shield and single-katar class rules
  grab('function slotAccepts(k,it){', 'function equipChooser(k){'),
].join('\n');

const harness = `
${code}
// v75: the drop loops read the fighting pets' passives (Hoarded Flame / Sand Tracker). This suite
// is about the drop TABLES, so the passives are held at zero here; pet_sim.js owns their maths.
let PETPASSIVE=0;                      // a test raises this to prove the hook is live
const petPassive=()=>PETPASSIVE;
const ORE={ori:'Oridecon',elu:'Elunium'};    // the ore gate inside the slice names the two ores
const SECN=['Starter gear','1st-job gear','2nd-job gear','High-tier gear'];
const SLOTS={weapon:{label:'Weapon',stat:'ATK',ic:'A'},armor:{label:'Armor',stat:'DEF',ic:'B'},head:{label:'Headgear',stat:'HP',ic:'C'},off:{label:'Shield',stat:'DEF',ic:'D'},leg:{label:'Legwear',stat:'DEF',ic:'E'},acc:{label:'Accessory',stat:'HP',ic:'F'}};
const rnd=(a,b)=>a+Math.random()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
let S=null;
this.__g={ MAPS, GEAR, gearPool, fieldOf, genGear, rarIdx, rarOf, rarCls, RAR5, RAR6, RARALL, FIELD_GEAR_NM, FIELD_GEAR_MID_NM, NMPLUS_DROP, NM_MAT, NM_MAT_CH, NM_FLAT, NM_FLAT_MUL, NM_MUL, nmMulOf, NM_ABYSS_AFF, nmAffMapOf, executeGearRoll, slotAccepts, canUse, canShield, katarOnly, dualWield, CLASSES, lineOf, secOf, secField, SLOTS, BAGMAX, MAPTIER, MAPGRADE, set PETPASSIVE(v){PETPASSIVE=v}, get PETPASSIVE(){return PETPASSIVE}, MAPVAL, dropTier, sellVal, AM, AFF, AB, RAR, AFFIX_CDM_SCALE, scaleCritDamageAffix, affixValue, FIELD_GEAR, FIELD_GEAR_MID, BOSS_POOL_TOTAL, BOSS_CRIT_RES, bossCritRes, gearTierOf, classTierOf, gearTierOK, gearUserOf,
           set S(v){S=v}, get S(){return S} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const G = sb.__g;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('gear: catalogue, per-map relevance, drop mix, slot chooser\n');

const WEP = ['sword', 'dagger', 'katar', 'staff', 'bow', 'axe', 'mace'];

// ---- 1. the catalogue itself -------------------------------------------------
t('ten maps, four job sections each, all of them populated', () => {
  assert.strictEqual(G.MAPS.length, 10, 'map count');
  assert.strictEqual(G.GEAR.length, 10, 'gear set count - one per map');
  G.MAPS.forEach((mp, i) => {
    assert.ok(mp.gear === G.GEAR[i], mp.n + ' must use GEAR[' + i + ']');
    // v79: the two Nightmare rows are appended to the same array at load, so a map's gear table
    // carries six rows: four job sections (0-3) plus sections 4-5, which only the Nightmare
    // band's fields (stages 11-15) ever roll.
    assert.strictEqual(mp.gear.length, 6, mp.n + ' needs four job sections plus the two Nightmare rows');
    for (let sec = 0; sec < 4; sec++) assert.ok(mp.gear[sec] && Object.keys(mp.gear[sec].w).length, mp.n + ' section ' + sec + ' is empty');
    assert.ok(mp.gear[4] && mp.gear[5], mp.n + ' needs its two Nightmare rows');
  });
});

t('every section has weapons and its available armour/accessory slots', () => {
  let weapons = 0;
  G.MAPS.forEach(mp => mp.gear.forEach((sg, sec) => {
    const where = mp.n + ' section ' + sec;
    const wt = Object.keys(sg.w);
    assert.ok(wt.length >= 1, where + ': no weapon at all');
    wt.forEach(k => assert.ok(WEP.includes(k), where + ': unknown weapon type ' + k));
    assert.ok(sg.w[wt[0]], where + ': empty weapon name');
    ['a', 'h', 'l', 'ac', 'ac2'].forEach(k => assert.ok(sg[k] && sg[k].length > 2, where + ': missing ' + k));
    if(mp.n==='Prontera'&&sec===0)assert.ok(!sg.o,'Novice cannot equip the shield slot');
    else assert.ok(sg.o&&sg.o.length>2,where+': missing shield');
    weapons += wt.length;
  }));
  console.log('       ' + weapons + ' weapon entries across 40 sections');
});

t('names do not repeat inside a map (no two slots or gear sets offer the same item)', () => {
  G.MAPS.forEach(mp => {
    const sets=[...mp.gear,...(mp.gearUpgrade?[mp.gearUpgrade]:[])];
    sets.forEach((sg, sec) => {
      const names = Object.keys(sg.w).map(k => sg.w[k]).concat([sg.a, sg.h, sg.o, sg.l, sg.ac, sg.ac2].filter(Boolean));
      assert.strictEqual(new Set(names).size, names.length, mp.n + ' gear set ' + sec + ' repeats a name');
    });
    if(mp.gearUpgrade){
      const old=new Set(mp.gear.flatMap(sg=>Object.keys(sg.w).map(k=>sg.w[k]).concat([sg.a,sg.h,sg.o,sg.l,sg.ac,sg.ac2].filter(Boolean))));
      Object.keys(mp.gearUpgrade.w).map(k=>mp.gearUpgrade.w[k]).concat([mp.gearUpgrade.a,mp.gearUpgrade.h,mp.gearUpgrade.o,mp.gearUpgrade.l,mp.gearUpgrade.ac,mp.gearUpgrade.ac2].filter(Boolean))
        .forEach(name=>assert.ok(!old.has(name),mp.n+' higher-tier set repeats '+name));
    }
  });
});

t('the five early maps retain their existing job-tier progression', () => {
  for(let l=1;l<=10;l++)assert.strictEqual(G.secField(0,l),0,'Prontera must stay on Novice gear');
  const novicePool=G.gearPool(0,10),noviceTypes=new Set(novicePool.filter(x=>!['armor','head','off','leg','acc'].includes(x.k)).map(x=>x.k));
  assert.deepStrictEqual([...noviceTypes].sort(),['dagger','sword']);
  assert.ok(!novicePool.some(x=>x.k==='off'),'Prontera cannot drop a shield that Novice cannot equip');
  const weaponTypes=(m,sec)=>Object.keys(G.MAPS[m].gear[sec].w);
  for(let m=1;m<=4;m++)for(let l=1;l<=10;l++)
    assert.strictEqual(G.secField(m,l),l<=5?0:l<=7?1:l<=9?2:3,`${G.MAPS[m].n} stage ${l} tier`);
  for(let sec=0;sec<4;sec++){
    assert.ok(weaponTypes(1,sec).includes('sword'),'Izlude needs Swordman swords in every tier');
    assert.ok(weaponTypes(1,sec).includes('axe')&&weaponTypes(1,sec).includes('mace'),'Izlude needs Merchant weapons in every tier');
    assert.ok(weaponTypes(2,sec).includes('staff'),'Geffen needs Mage staves');
    // v80 (owner): Morroc's weapon follows the job. Daggers while a Thief can wear the section,
    // katars once only an Assassin or Assassin Cross can - neither can wield a dagger.
    assert.ok(sec<2?weaponTypes(3,sec).includes('dagger'):weaponTypes(3,sec).includes('katar'),
      'Morroc needs its Thief-line weapon in every tier');
    assert.ok(weaponTypes(4,sec).includes('bow'),'Payon needs Archer bows');
  }
  assert.ok(G.gearPool(1,10).some(x=>x.n==='Golden Axe'||x.n==='Loaded Mace'),'Izlude boss tier must include a Merchant weapon');
  assert.ok(G.gearPool(2,10).some(x=>x.n==='Wand of Hermes'),'Geffen boss tier must include its Mage weapon');
  // v80 (owner): Morroc's boss tier is third-job gear, so its Thief-line weapon is a katar -
  // an Assassin Cross cannot wield the dagger the map used to list there.
  assert.ok(G.gearPool(3,10).some(x=>x.k==='katar'),'Morroc boss tier must include its Assassin weapon');
  assert.ok(G.gearPool(4,10).some(x=>x.n==='Gakkung Bow'),'Payon boss tier must include its Archer weapon');
});

t('mid/endgame stages route second- and third-job equipment as requested',()=>{
  const expected={5:Array(10).fill(2),6:Array(10).fill(2),7:Array(10).fill(2),
    8:[2,2,2,2,2,3,3,3,3,3],9:Array(10).fill(3)};
  for(const [mapText,stages] of Object.entries(expected)){
    const m=+mapText,mp=G.MAPS[m];
    for(let l=1;l<=10;l++)assert.strictEqual(G.secField(m,l),stages[l-1],`${mp.n} stage ${l} job section`);
  }
  for(let m=5;m<=7;m++){
    for(let l=1;l<=10;l++)assert.ok(G.gearPool(m,l).every(x=>x.sec===2),`${G.MAPS[m].n} Stage ${l} must drop section-2 gear`);
  }
  for(let l=1;l<=5;l++)assert.ok(G.gearPool(8,l).every(x=>x.sec===2),`Niflheim Stage ${l} is improved second-job gear`);
  for(let l=6;l<=10;l++)assert.ok(G.gearPool(8,l).every(x=>x.sec===3),`Niflheim Stage ${l} is third-job gear`);
  for(let l=1;l<=5;l++)assert.ok(G.gearPool(9,l).every(x=>x.sec===3&&x.quality===1),`Abyss Stage ${l} is standard third-job gear`);
  for(let l=6;l<=10;l++)assert.ok(G.gearPool(9,l).every(x=>x.sec===3&&x.quality===1.25),`Abyss Stage ${l} is higher-quality third-job gear`);
  for(let m=5;m<=9;m++)for(let l=1;l<=10;l++){
    const pool=G.gearPool(m,l),types=new Set(pool.filter(x=>!['armor','head','off','leg','acc'].includes(x.k)).map(x=>x.k));
    assert.deepStrictEqual([...types].sort(),[...WEP].sort(),`${G.MAPS[m].n} Stage ${l} must carry all class weapon families`);
    for(const slot of ['armor','head','off','leg','acc'])assert.ok(pool.some(x=>x.k===slot),`${G.MAPS[m].n} Stage ${l} has no ${slot} drop`);
    for(const [cls,c] of Object.entries(G.CLASSES)){
      const gate=G.secField(m,l);
      if(G.classTierOf(cls)>=gate)assert.ok(c.wt.some(wt=>types.has(wt)),`${G.MAPS[m].n} Stage ${l} has no usable weapon for ${cls}`);
    }
  }
});

t('Abyss higher-tier third-job gear improves item values without changing section or rarity',()=>{
  const standard=G.gearPool(9,5).find(x=>x.k==='armor'),advanced=G.gearPool(9,6).find(x=>x.k==='armor');
  assert.strictEqual(standard.sec,advanced.sec,'both sets retain the third-job section');
  assert.strictEqual(standard.tier,advanced.tier,'the map rarity band is unchanged');
  const set=G.gearPool(9,6).map(x=>x.n).join('|');
  assert.notStrictEqual(set,G.gearPool(9,5).map(x=>x.n).join('|'),'Stage 6 starts a distinct higher-tier set');
  vm.runInContext('globalThis.__oldRandom=Math.random;Math.random=()=>.5',sb);
  try{
    G.S={mp:9};
    const normal=G.genGear(standard,99,3,false,3),upgraded=G.genGear(advanced,99,3,false,3);
    assert.ok(upgraded.val>normal.val,'upgraded base item value must be stronger');
    assert.deepStrictEqual(upgraded.aff.map(a=>a.k),normal.aff.map(a=>a.k),'same rarity rolls the same affix kinds');
    assert.ok(upgraded.aff.every((a,i)=>a.v>=normal.aff[i].v),'upgraded affixes must not be weaker');
    assert.ok(upgraded.aff.some((a,i)=>a.v>normal.aff[i].v),'the higher quality must improve affixes too');
  }finally{vm.runInContext('Math.random=globalThis.__oldRandom;delete globalThis.__oldRandom',sb)}
});

t('armour and accessory names are unique across the whole game', () => {
  const seen = new Map();
  G.MAPS.forEach(mp => [...mp.gear,...(mp.gearUpgrade?[mp.gearUpgrade]:[])].forEach(sg => [sg.a, sg.h, sg.o, sg.l, sg.ac, sg.ac2].filter(Boolean).forEach(n => {
    if (seen.has(n)) throw new Error(n + ' is both ' + seen.get(n) + ' and ' + mp.n);
    seen.set(n, mp.n);
  })));
});

// ---- 2. per-map relevance ----------------------------------------------------
// The five early maps are class-themed. Every mixed late map now carries a weapon family
// for every class, so all class lines can return there to hunt their own gear.
// v80: Geffen and Payon each gained a second weapon family so neither map is a one-weapon shelf
// (a mage got staves and nothing else, an archer bows and nothing else). The line that uses the
// new family is listed with the map, because a shelf only counts as served if somebody who levels
// there can pick the thing up: Geffen now carries a Thief's dagger low down and an Assassin's
// katar up high, Payon a Swordman's sword.
// v80 (owner): on the Thief line the weapon follows the JOB, not the map. A Thief wields a
// dagger; Assassin and Assassin Cross wield nothing else, and neither can wear a dagger at all.
// So Geffen and Morroc hand out daggers on the sections a Thief can wear (starter and 1st-job)
// and katars on the ones only an Assassin or Assassin Cross can wear (2nd-job and high tier).
const EVERY_CLASS=Object.keys(G.CLASSES);
const MAP_LINES = [
  ['Novice', 'Swordman'],
  ['Swordman', 'Knight', 'Lord Knight', 'Merchant', 'Blacksmith', 'Whitesmith'],
  ['Mage', 'Wizard', 'High Wizard', 'Thief', 'Assassin', 'Assassin Cross'],
  ['Thief', 'Assassin', 'Assassin Cross'],
  ['Archer', 'Hunter', 'Sniper', 'Swordman'],
  EVERY_CLASS, EVERY_CLASS, EVERY_CLASS, EVERY_CLASS, EVERY_CLASS,
];
const wtsOf = cls => G.CLASSES[cls].wt || [];
const typesIn = (mp, sec) => Object.keys(mp.gear[sec].w);
const ARM = ['armor', 'head', 'off', 'leg', 'acc'];
const isWep = x => !ARM.includes(x.k);

t('every weapon in a map pool is usable by a line that levels there', () => {
  G.MAPS.forEach((mp, m) => {
    const allowed = new Set(MAP_LINES[m].flatMap(wtsOf));
    for(let l=1;l<=10;l++)G.gearPool(m,l).filter(isWep).forEach(x=>
      assert.ok(allowed.has(x.k),mp.n+' stage '+l+' drops a '+x.k+' but no line there can use it'));
  });
});

t('a themed map serves its own line in every section', () => {
  [0, 1, 2, 3, 4].forEach(m => {
    const wt = new Set(MAP_LINES[m].flatMap(wtsOf));
    G.MAPS[m].gear.forEach((sg, sec) => {
      assert.ok(typesIn(G.MAPS[m], sec).some(k => wt.has(k)), G.MAPS[m].n + ' section ' + sec + ' has no weapon its line can use');
    });
  });
});

t('the type a line can actually use is never missing from its map', () => {
  G.MAPS.forEach((mp, m) => {
    const want = new Set(MAP_LINES[m].flatMap(wtsOf)), have = new Set(mp.gear.flatMap((sg, sec) => typesIn(mp, sec)));
    want.forEach(k => assert.ok(have.has(k), mp.n + ' never drops a ' + k + ', which its classes train in'));
  });
});

t('each mixed map carries a real spread of weapon types', () => {
  [5, 6, 7, 8, 9].forEach(m => {
    const have = new Set(G.MAPS[m].gear.flatMap((sg, sec) => typesIn(G.MAPS[m], sec)));
    assert.ok(have.size >= 5, G.MAPS[m].n + ' only carries ' + [...have].join('/'));
    G.MAPS[m].gear.forEach((sg, sec) => assert.ok(typesIn(G.MAPS[m], sec).length >= 3,
      G.MAPS[m].n + ' section ' + sec + ' needs at least 3 weapon types'));
  });
});

t('every active late-map gear tier offers a weapon for every class',()=>{
  const types=[...WEP].sort();
  for(let m=5;m<10;m++)for(const sec of [2,3]){
    const have=typesIn(G.MAPS[m],sec).sort();
    assert.deepStrictEqual(have,types,`${G.MAPS[m].n} section ${sec} must carry all seven weapon families`);
    for(const [cls,c] of Object.entries(G.CLASSES))
      assert.ok(c.wt.some(wt=>have.includes(wt)),`${G.MAPS[m].n} section ${sec} has no weapon for ${cls}`);
  }
});

t('Abyss Stage 10 drops the complete top-tier weapon and armor pool',()=>{
  assert.strictEqual(G.secField(9,9),3,'Abyss late fields must use high-tier gear');
  assert.strictEqual(G.dropTier(9,9),3,'Abyss fields stay Epic');
  assert.strictEqual(G.dropTier(9,10),4,'Abyss boss drops are Legendary');
  const pool=G.gearPool(9,10),boss=G.fieldOf(9,10).boss;
  assert.deepStrictEqual([...new Set(pool.filter(isWep).map(x=>x.k))].sort(),[...WEP].sort());
  for(const slot of ARM)assert.ok(pool.some(x=>x.k===slot),'Abyss high-tier pool needs '+slot);
  assert.strictEqual(boss.drops.length,pool.length,'the boss still lists its whole pool');
  const total=boss.drops.reduce((a,d)=>a+d[1],0);
  // v73: Abyss is a mid/endgame map, so its boss pool is the 30%-lighter one (~4.2% a kill).
  assert.ok(Math.abs(total-4.2)<1.2,'the Abyss boss pool totals about 4.2% per kill, got '+total.toFixed(2)+'%');
  boss.drops.forEach(d=>assert.ok(pool.some(x=>x.n===d[0].n),'every boss entry comes from the map pool'));
  assert.strictEqual(G.MAPS[9].gear[3].a,'Dark Lord Mail','Abyss should retain its named best armor set');
});

t('a high-tier section never repeats a starter weapon name', () => {
  G.MAPS.forEach(mp => {
    const t0 = mp.gear[0], t3 = mp.gear[3];
    const shared = typesIn(mp, 0).filter(k => t0.w[k] === t3.w[k]);
    assert.strictEqual(shared.length, 0, mp.n + ' high tier repeats a starter weapon name');
  });
});

// ---- 3. the drop mix ---------------------------------------------------------
t('gear outnumbers cards on every field', () => {
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const F = G.fieldOf(m, l);
    F.mobs.forEach(mob => {
      assert.strictEqual(mob.drops.length, 3, 'want three gear rolls per mob');
      const gearChance = mob.drops.reduce((a, d) => a + d[1], 0);
      assert.ok(gearChance > mob.cardCh * 10, 'gear ' + gearChance + '% vs card ' + mob.cardCh + '%');
      assert.ok(mob.cardCh <= 0.5, 'card drop rate must stay rare');
    });
    const [x, y] = F.mobs.map(mob => mob.drops.map(d => d[0].n).join('|'));
    assert.notStrictEqual(x, y, G.MAPS[m].n + ' Lv' + l + ': both mobs drop the same three items');
  }
});

t('the drop table: 3.6% a kill on maps 1-5, 2.52% from Comodo on, boss pools 6% / 4.2%', () => {
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const F = G.fieldOf(m, l), mid = m >= 5;
    F.mobs.forEach(mob => {
      // v57 (owner: "30 min of grinding gave a bunch of legendaries"): the field roll is a
      // third of what it was - 3.6% per kill in total, cards 0.15%.
      // v73 (owner: "farming a few hours reaches the 1000 bag cap"): from Comodo on (map index
      // 5) the field table drops another 30% - 1.05/.84/.63 = 2.52% a kill - and so does that
      // map's Stage-10 boss pool. Maps 1-5 keep every original number, boss included.
      assert.deepStrictEqual(Array.from(mob.drops, d => d[1]), mid ? [1.05, .84, .63] : [1.5, 1.2, .9]);
      assert.strictEqual(mob.cardCh, .15, 'regular-mob card chance changed');
    });
    if (l === 10) {
      const total = F.boss.drops.reduce((a, d) => a + d[1], 0), want = mid ? 4.2 : 6;
      assert.ok(Math.abs(total - want) < 1.2, 'the boss pool totals about ' + want + '%, got ' + total.toFixed(2) + '%');
      assert.strictEqual(F.boss.drops.length, G.gearPool(m, 10).length, 'the boss still lists its whole pool');
      assert.strictEqual(F.boss.cardCh, .1, 'boss card chance changed');
      assert.strictEqual(F.boss.critRes, G.bossCritRes(m), 'the boss carries its own map crit resistance');
    }
  }
  // the mid table is exactly 30% below the original, not "roughly 30%"
  G.FIELD_GEAR.forEach((v, i) => assert.ok(Math.abs(v * .7 - G.FIELD_GEAR_MID[i]) < 1e-9, 'FIELD_GEAR_MID[' + i + '] must be 30% below the original'));
  assert.ok(Math.abs(G.BOSS_POOL_TOTAL[1] - G.BOSS_POOL_TOTAL[0] * .7) < 1e-9, 'the mid boss pool must be 30% below the early one');
});

t('the real equipment-drop loop creates boss gear when an independent roll succeeds', () => {
  G.S = {st:{luk:0},eq:{}};
  // ore:false because the slice now reaches the ore gate, and this test counts equipment
  const F = G.fieldOf(0, 10), boss = {...F.boss,boss:true,lvl:10,sec:F.sec,ore:false};
  assert.strictEqual(boss.drops.length, G.gearPool(0,10).length, 'expected a roll for every boss-pool item');
  // The per-item gate is 6/n % (~0.86% on this 7-item pool): a 1.2% die pays out nothing,
  // a 0.5% die clears every entry.
  assert.strictEqual(G.executeGearRoll(boss, .012).length, 0, 'the boss gate is now ~6% for the whole pool');
  const drops = G.executeGearRoll(boss, .005);
  assert.strictEqual(drops.length, boss.drops.length, 'the actual boss gear loop did not emit items');
  // Prontera's stage-10 boss is capped at Fine now: it can never print an endgame item.
  assert.ok(drops.every(d => d.it && d.it.tier === G.MAPGRADE[0]), 'the boss drop must sit on the map grade cap');
  assert.ok(drops.every(d => d.it.slot), 'successful boss rolls must be real equipment objects');
  // The regular-mob branch is also the live loop: 0.8% clears all three gates (1.5/1.2/0.9).
  const mob = {...G.fieldOf(0,1).mobs[0],boss:false,lvl:1,sec:0,ore:false};
  const mobDrops = G.executeGearRoll(mob, .008);
  assert.strictEqual(mobDrops.length, 3, 'regular-mob equipment gates did not execute');
});

t('every field allocates a weapon first, and never lists an item twice (v79)', () => {
  // v79 owner: "my equipment drops allocation is messy & confusing". The old window handed each mob
  // three consecutive pool entries from T[(l*3+2*j)%n], so 20 of the 100 normal fields dropped no
  // weapon at all and one item was listed on both mobs at two different rates. Roll 1 is now always
  // a weapon, rolls 2-3 are armour or an accessory, and nothing repeats unless the map has a single
  // weapon family - which after v80 no normal map does (Geffen carries a dagger or a katar beside
  // its staves, Payon a sword beside its bows), so every field offers its mobs a real choice.
  // v89: stages 14-15 (the N+ rows) no longer walk the shelf - each mob lists every weapon family -
  // so that band has its own test below. This walk test covers the walked stages 1-13.
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 13; l++) {
    const F = G.fieldOf(m, l), where = G.MAPS[m].n + ' stage ' + l;
    const pool = G.gearPool(m, l), weapons = pool.filter(x => !['armor','head','off','leg','acc'].includes(x.k));
    for (const mob of F.mobs) {
      const [w, ...rest] = mob.drops.map(d => d[0]);
      assert.ok(weapons.some(x => x.n === w.n), where + ': roll 1 must be a weapon');
      rest.forEach(x => assert.ok(['armor','head','off','leg','acc'].includes(x.k), where + ': rolls 2-3 must be armour or accessories'));
      if (weapons.length > 1) assert.strictEqual(new Set(mob.drops.map(d => d[0].n)).size, 3, where + ': one mob lists an item twice');
    }
    // the two mobs never repeat a defensive piece, and their weapons differ when there is a choice
    const a = F.mobs[0].drops.map(d => d[0].n), b = F.mobs[1].drops.map(d => d[0].n);
    a.slice(1).forEach(n => assert.ok(!b.slice(1).includes(n), where + ': ' + n + ' is on both mobs'));
    if (weapons.length > 1) assert.notStrictEqual(a[0], b[0], where + ': both mobs carry the same weapon');
    // each stage walks the shelf: stage 1 starts at the head of the weapon list
    assert.strictEqual(a[0], weapons[(2 * (l - 1)) % weapons.length].n, where + ': weapon rotation');
    // the three rates are the field's own, in the same order as before (weapon, then two pieces)
    assert.deepStrictEqual(F.mobs[0].drops.map(d => d[1]), G.fieldOf(m, l).mobs[0].drops.map(d => d[1]), where + ': rates');
  }
  // a map's whole weapon list is reachable from its own stages, band by band
  for (const [m, levels] of [[0,[1,2]],[1,[1,2]],[5,[1,2,3,4,5,6,7,8,9,10]],[8,[1,2,3,4,5]],[9,[1,2,3,4,5]]]) {
    const got = new Set(), all = new Set();
    for (const l of levels) {
      const pool = G.gearPool(m, l);
      pool.filter(x => !['armor','head','off','leg','acc'].includes(x.k)).forEach(x => all.add(x.k));
      G.fieldOf(m, l).mobs.forEach(mm => mm.drops.forEach(([x]) => { if (!['armor','head','off','leg','acc'].includes(x.k)) got.add(x.k); }));
    }
    assert.deepStrictEqual([...got].sort(), [...all].sort(), G.MAPS[m].n + ' stages ' + levels[0] + '-' + levels[levels.length-1] + ' must reach every weapon family');
  }
});

t('N and N+ by tier (v90.10): the weapon walk is back on every map, and the N+ halving stays on tier 2', () => {
  // v90 (owner: \"for fairness, let's just remain the drop on stage 4 & 5\"). v89 had every mob on stages 14-15
  // list the whole N+ shelf; that split is reverted, so those stages walk the shelf exactly as stages 1-13 do:
  // each mob carries ONE weapon, the weapon list advances two per stage, and the two mobs differ. The
  // N+ halving (NMPLUS_DROP) is kept: the weapon chance is half the Nightmare table, and the MVP pool is half.
  const isW = T => !['armor', 'head', 'off', 'leg', 'acc'].includes(T.k);
  // v90.10: tier 1 (maps 0-4) is the N row, section 4; tier 2 (maps 5-9) is the N+ row, section 5, halved
  for (let m = 0; m < G.MAPS.length; m++) for (const l of [14, 15]) {
    const wantSec = m >= 5 ? 5 : 4;
    const F = G.fieldOf(m, l), where = G.MAPS[m].n + ' Nightmare stage ' + l;
    const weapons = G.gearPool(m, l).filter(isW);
    assert.strictEqual(F.sec, wantSec, where + ' must be section ' + wantSec);
    const wantWeapon = (m >= 5 ? G.FIELD_GEAR_MID_NM[0] : G.FIELD_GEAR_NM[0]) * (wantSec === 5 ? G.NMPLUS_DROP : 1);
    F.mobs.forEach((mob, j) => {
      const weaponRolls = mob.drops.filter(([T]) => isW(T));
      assert.strictEqual(weaponRolls.length, 1, where + ': one weapon roll per mob, not the whole shelf');
      assert.strictEqual(weaponRolls[0][0].n, weapons[(2 * (l - 1) + j) % weapons.length].n, where + ' mob ' + j + ': the walk picks the weapon');
      assert.ok(Math.abs(weaponRolls[0][1] - wantWeapon) < 1e-3, where + ': weapon rate ' + weaponRolls[0][1] + ' != ' + wantWeapon);
      const defensive = mob.drops.filter(([T]) => !isW(T));
      assert.strictEqual(defensive.length, 2, where + ': two armour/accessory rolls');
      assert.ok(defensive.every(([T]) => ['armor', 'head', 'off', 'leg', 'acc'].includes(T.k)), where + ': defensive rolls must be armour or accessories');
    });
    if (weapons.length > 1) assert.notStrictEqual(F.mobs[0].drops[0][0].n, F.mobs[1].drops[0][0].n, where + ': both mobs carry the same weapon');
  }
  // the weapon chance per kill is one walk roll at the halved rate, not more and not less
  const total = G.fieldOf(9, 14).mobs[0].drops.filter(([T]) => isW(T)).reduce((a, [, c]) => a + c, 0);
  assert.ok(Math.abs(total - G.FIELD_GEAR_MID_NM[0] * G.NMPLUS_DROP) < 1e-3, 'Abyss N+ weapon chance is half the Nightmare table, got ' + total);
  const totalN = G.fieldOf(0, 14).mobs[0].drops.filter(([T]) => isW(T)).reduce((a, [, c]) => a + c, 0);
  assert.ok(Math.abs(totalN - G.FIELD_GEAR_NM[0]) < 1e-3, 'Prontera N weapon chance is the full Nightmare table (no halving on tier 1), got ' + totalN);
  // the MVP pool is halved as well (v89): 300 x .5 = 150 spread over the whole pool
  const bossTotal = G.fieldOf(9, 15).boss.drops.reduce((a, [, c]) => a + c, 0);
  assert.ok(Math.abs(bossTotal - 1.5) < 0.1, 'the Stage 5 MVP pool must total about 1.5% (13 entries, each rounded to .01), got ' + bossTotal.toFixed(3));
  // and the N+ table is one half of the Nightmare table it used to be, in both bands
  assert.strictEqual(G.NMPLUS_DROP, .5, 'the N+ nerf is one half');
});

t('N+ flat affixes (v89): STR and Flee top out near the high-tier ceiling, the other affixes keep their numbers', () => {
  // v89 (owner: \"n+ affix are giving 60+ flee % and 60+ str is too much\"). Flat stats and Flee use
  // section multipliers 3.5 (N, section 4) and 4 (N+, section 5) instead of 5 and 6.
  assert.deepStrictEqual(Array.from(G.NM_FLAT_MUL), [3.5, 4], 'the flat-stat multipliers are pinned');
  assert.strictEqual(G.affixValue('str', 5, 4, 1.25), 55, 'N+ STR top roll on Abyss is 55 (was 83)');
  assert.strictEqual(G.affixValue('str', 4, 4, 1.25), 48, 'N STR top roll on Abyss is 48 (was 69)');
  // the ceiling N+ flat stats reach is the one a Legendary high-tier piece already rolls
  assert.strictEqual(G.affixValue('str', 3, 4, 1.25), 55, 'the high-tier Legendary STR top roll is the same 55');
  // the other affixes keep their Nightmare multipliers, and sections 0-3 never change
  assert.strictEqual(G.affixValue('hp', 5, 4, 1.25), Math.round(6 * G.AM[4] * G.AB.hp * 1.25), 'N+ Max HP keeps x6');
  assert.strictEqual(G.affixValue('cdm', 5, 4, 1.25), G.scaleCritDamageAffix(Math.round(6 * G.AM[4] * G.AB.cdm * 1.25)), 'N+ Crit DMG keeps x6 and its gear scale');
  assert.strictEqual(G.affixValue('str', 3, 4, .8), Math.round(4 * G.AM[4] * G.AB.str * .8), 'section 3 (high tier) is untouched');
  assert.strictEqual(G.affixValue('flee', 2, 2, 1), Math.round(3 * G.AM[2] * G.AB.flee), 'section 2 flee is untouched');
});

t('fieldOf only hands out items from that field pool', () => {
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const pool = G.gearPool(m, l).map(x => x.n), F = G.fieldOf(m, l);
    F.mobs.forEach(mob => mob.drops.forEach(d => assert.ok(pool.includes(d[0].n), d[0].n + ' is not in the ' + G.MAPS[m].n + ' Lv' + l + ' pool')));
    if (l === 10) {
      assert.ok(F.boss, 'level 10 must have a boss');
      assert.strictEqual(F.boss.drops.length, pool.length, 'the boss lists its whole pool');
      F.boss.drops.forEach(d => assert.ok(pool.includes(d[0].n)));
    } else assert.strictEqual(F.boss, null, 'bosses only exist at level 10');
  }
});

t('the field table and live gear drops preserve each normal map rarity tier', () => {
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const F = G.fieldOf(m, l), expected = G.dropTier(m, l);
    for (const mob of F.mobs) for (const [item] of mob.drops) {
      assert.strictEqual(item.tier, expected, G.MAPS[m].n + ' Stage ' + l + ' drop-table tier');
      assert.strictEqual(G.rarIdx(item), item.sec >= 5 ? 6 : item.sec >= 4 ? 5 : expected, G.MAPS[m].n + ' Stage ' + l + ' displayed item rarity');
    }
    if (F.boss) for (const [item] of F.boss.drops) {
      assert.strictEqual(item.tier, expected, G.MAPS[m].n + ' Stage ' + l + ' MVP drop-table tier');
      assert.strictEqual(G.rarIdx(item), item.sec >= 5 ? 6 : item.sec >= 4 ? 5 : expected, G.MAPS[m].n + ' Stage ' + l + ' MVP item rarity');
    }
  }
  // Normal generation still passes the field's rarity to the actual item, not just the preview.
  for (const [map, tier, label] of [[5,2,'Rare'],[7,3,'Epic']]) {
    const F=G.fieldOf(map,1),mob={...F.mobs[0],boss:false,lvl:1,sec:F.sec,ore:false,cardCh:0};
    G.S={st:{luk:0},eq:{},mp:map};
    const items=G.executeGearRoll(mob,.005);
    assert.strictEqual(items.length,3, G.MAPS[map].n+' fixture must clear all three gear gates');
    assert.ok(items.every(x=>x.it.tier===tier&&x.it.name.startsWith(label+' ')),G.MAPS[map].n+' actual equipment must remain '+label);
  }
});

t('regular mobs drop both ores on every stage and Stage 10 keeps its stronger boss rate', () => {
  for (let m = 0; m < G.MAPS.length; m++) {
    for (let l = 1; l < 10; l++) {
      const field = G.fieldOf(m, l);
      assert.ok(field.mobs.every(x => x.ore), G.MAPS[m].n + ' Stage ' + l + ' regular mobs must drop both ores');
      assert.ok(field.mobs.every(x => x.oreCh === 0.005), G.MAPS[m].n + ' Stage ' + l + ' ore rate must be 0.5% each');
    }
    const F = G.fieldOf(m, 10);
    assert.strictEqual(F.boss.card.g, 3, 'boss card must be Legendary');
    assert.ok(F.boss.cardCh < F.mobs[0].cardCh, 'boss card rarer than a mob card');
    assert.ok(F.boss.ore && F.mobs.every(x => x.ore), 'Stage 10 regular mobs and boss drop oridecon/elunium');
    assert.ok(F.mobs.every(x => x.oreCh === 0.01), 'Stage 10 regular mobs drop ore at 1% each');
    assert.strictEqual(F.boss.oreCh, 0.025, 'the boss drops ore at 2.5% each');
  }
  assert.strictEqual(G.fieldOf(0, 1).mobs[0].card.g, 0, 'low fields keep common cards');
});

t('the pool is the routed stage set, with the requested progression on late maps', () => {
  G.MAPS.forEach((mp, m) => {
    let prev = 0;
    for (let l = 1; l <= 10; l++) {
      const pool = G.gearPool(m, l), sec = G.secField(m, l);
      const set = m === 9 && l >= 6 ? mp.gearUpgrade : mp.gear[sec];
      const names = Object.keys(set.w).map(k => set.w[k]).concat([set.a, set.h, set.o, set.l, set.ac, set.ac2].filter(Boolean));
      assert.strictEqual(pool.map(x => x.n).join('|'), names.join('|'), mp.n + ' Lv' + l + ' pool must be the routed gear set');
      assert.ok(pool.every(x=>x.sec===sec),mp.n+' Lv'+l+' item/job section mismatch');
      assert.ok(pool.every(x=>x.quality===(m===9&&l>=6?1.25:1)),mp.n+' Lv'+l+' quality variant mismatch');
      // v80 (owner): the Thief line gives its dagger up for the Assassin katar, so Morroc's
      // 2nd-job and high-tier shelves carry one weapon family where the lower ones carry two.
      // A one-family section may therefore be one item shorter than the section below it.
      const families = Object.keys(set.w).length;
      assert.ok(pool.length >= prev - (families === 1 ? 1 : 0), mp.n + ' Lv' + l + ' pool shrank');
      assert.ok(pool.length >= 7, mp.n + ' Lv' + l + ' pool is thin: ' + pool.length);
      prev = pool.length;
    }
    if (m === 0) {
      const novice = G.gearPool(m, 1).map(x => x.n).join('|');
      for(let l=2;l<=10;l++)assert.strictEqual(G.gearPool(m,l).map(x => x.n).join('|'),novice,'Prontera must stay on Novice gear');
    } else if (m < 5) {
      const s0 = G.gearPool(m, 1).map(x => x.n);
      [6, 8, 10].forEach(l => assert.ok(G.gearPool(m, l).some(n => !s0.includes(n.n)), mp.n + ' later sections add nothing'));
    } else if (m <= 7) {
      for(let l=1;l<=10;l++)assert.ok(G.gearPool(m,l).every(x=>x.sec===2),mp.n+' must stay on second-job gear all normal stages');
    } else if (m === 8) {
      for(let l=1;l<=5;l++)assert.ok(G.gearPool(m,l).every(x=>x.sec===2),'Niflheim stages 1-5 are second-job gear');
      for(let l=6;l<=10;l++)assert.ok(G.gearPool(m,l).every(x=>x.sec===3),'Niflheim stages 6-10 are third-job gear');
    } else {
      for(let l=1;l<=5;l++)assert.strictEqual(G.fieldOf(m,l).gearSet,'base','Abyss stages 1-5 use standard third-job gear');
      assert.notStrictEqual(G.gearPool(m,5).map(x=>x.n).join('|'),G.gearPool(m,6).map(x=>x.n).join('|'),'Abyss Stage 6 must start the higher third-job set');
    }
  });
});

// ---- 4. the slot chooser -----------------------------------------------------
const item = (o) => Object.assign({ id: 1, name: 'Thing', tier: 1, slot: 'weapon', wt: 'sword', val: 10 }, o);
function bag(cls, items) { G.S = { cls, inv: items, eq: {} }; }

t('a weapon slot offers only weapons of a type the class may use', () => {
  const sword = item({ id: 1, wt: 'sword' }), bow = item({ id: 2, wt: 'bow' });
  bag('Swordman', [sword, bow]);
  assert.ok(G.slotAccepts('weapon', sword), 'Swordman must be offered a sword');
  assert.ok(!G.slotAccepts('weapon', bow), 'Swordman must not be offered a bow');
  bag('Archer', [sword, bow]);
  assert.ok(G.slotAccepts('weapon', bow) && !G.slotAccepts('weapon', sword), 'Archer is bow-only');
});

t('off-hand shields stay class-gated; Assassins dual-wield daggers but never a shield', () => {
  const shield = item({ id: 3, slot: 'off' }), dagger = item({ id: 4, slot: 'weapon', wt: 'dagger' }),
    katar = item({ id: 5, slot: 'weapon', wt: 'katar' }), sword = item({ id: 6, wt: 'sword' });
  bag('Swordman', [shield, dagger, katar, sword]);
  assert.ok(G.slotAccepts('off', shield), 'Swordman may hold a shield');
  assert.ok(!G.slotAccepts('off', dagger) && !G.slotAccepts('off', katar), 'Swordman may not use a weapon off-hand');
  assert.ok(!G.slotAccepts('off', sword), 'a one-handed sword is not an off-hand item for a Swordman');
  bag('Knight', [shield]);
  assert.ok(G.slotAccepts('off', shield), 'Knight keeps the shield');
  for(const cls of ['Assassin','Assassin Cross']){
    assert.deepStrictEqual(Array.from(G.CLASSES[cls].wt),['katar','dagger'],cls+' may wield katar and dagger');
    bag(cls,[shield,dagger,katar]);
    assert.ok(G.katarOnly(),cls+' still counts as the two-handed Katar class');
    assert.ok(G.dualWield(),cls+' may dual-wield');
    assert.ok(G.slotAccepts('weapon',katar)&&G.slotAccepts('weapon',dagger),cls+' may equip either blade in the main hand');
    assert.ok(G.slotAccepts('off',dagger),cls+' may hold a dagger in the left hand');
    assert.ok(!G.slotAccepts('off',shield),cls+' still may not hold a shield');
    assert.ok(!G.slotAccepts('off',katar)&&!G.slotAccepts('off',sword),cls+' may not hold a sword or katar in the left hand');
  bag('Swordman',[sword]);
  assert.ok(!G.dualWield(),'a Swordman does not dual-wield');
  bag('Archer',[item({id:9,wt:'bow'})]);
  assert.ok(!G.dualWield(),'an Archer does not dual-wield');
  }
});

t('a slot only accepts its own slot, and never cards or ores', () => {
  const leg = item({ id: 6, slot: 'leg' }), acc = item({ id: 7, slot: 'acc' }), card = item({ id: 8, card: true, slot: 'weapon' }), ore = item({ id: 9, ore: true, slot: 'weapon' });
  bag('Mage', [leg, acc, card, ore]);
  assert.ok(!G.slotAccepts('weapon', leg));
  assert.ok(!G.slotAccepts('leg', acc));
  assert.ok(G.slotAccepts('leg', leg));
  assert.ok(!G.slotAccepts('weapon', card) && !G.slotAccepts('weapon', ore), 'cards/ores are not equipment');
  assert.ok(!G.slotAccepts('acc1', leg) && !G.slotAccepts('acc1', card));
  assert.ok(G.slotAccepts('acc1', acc) && G.slotAccepts('acc2', acc), 'either accessory slot');
});

t('class tier gates gear: Novice and 1st jobs share the low band, transcendent gear needs a 3rd job', () => {
  // v74 (owner): a sec-1 piece needs a real first job, sec-2 needs a promotion, sec-3 needs a
  // transcendent class, and starter gear (sec 0) fits anyone. The gate lives in canUse(), which
  // every equip path already goes through.
  bag('Novice', []);
  // a sword: the one weapon type the whole Novice -> Lord Knight ladder may hold, so the tier
  // gate is the only thing that can refuse a piece here
  const starter = item({ id: 1, sec: 0, wt: 'sword' });
  const firstJob = item({ id: 2, sec: 1, wt: 'sword' });
  const secondJob = item({ id: 3, sec: 2, wt: 'sword' });
  const highTier = item({ id: 4, sec: 3, wt: 'sword' });
  assert.strictEqual(G.gearTierOf(starter), 0); assert.strictEqual(G.gearTierOf(firstJob), 1);
  assert.strictEqual(G.gearTierOf(secondJob), 2); assert.strictEqual(G.gearTierOf(highTier), 3);
  assert.deepStrictEqual([starter, firstJob, secondJob, highTier].map(G.gearUserOf),
    ['any class', 'Novice and 1st-job classes', '2nd-job classes and up', 'transcendent classes only']);
  // v74.1: the lowest band is Novice + 1st-job gear, so a Novice wears sections 0 and 1
  for (const [cls, want] of [['Novice', [0, 1]], ['Swordman', [0, 1]], ['Knight', [0, 1, 2]], ['Lord Knight', [0, 1, 2, 3]]]) {
    bag(cls, [starter, firstJob, secondJob, highTier]);
    const ok = [starter, firstJob, secondJob, highTier].map(it => G.slotAccepts('weapon', it));
    assert.deepStrictEqual(ok.map((v, i) => v ? i : -1).filter(i => i >= 0), want, cls + ' gear tiers it may wear');
  }
  // and the same rule through the two argument form / the class the sweep uses
  assert.ok(!G.gearTierOK(highTier, 'Swordman') && G.gearTierOK(highTier, 'Lord Knight'));
  assert.ok(G.gearTierOK(secondJob, 'Knight') && !G.gearTierOK(secondJob, 'Swordman'));
  assert.ok(G.gearTierOK(firstJob, 'Novice'), 'a Novice is left alone: 1st-job gear is the lowest band');
  assert.ok(!G.gearTierOK(secondJob, 'Novice'), 'but 2nd-job gear is still out of reach for one');
  // Explicit stage checks from the owner's correction: a Thief cannot use 2nd-job gear; an
  // Assassin (2nd job) cannot use either Nightmare section; a transcendent class can.
  const nightmare = item({ id: 5, sec: 4, wt: 'sword' }), abyssal = item({ id: 6, sec: 5, wt: 'sword' });
  assert.ok(!G.gearTierOK(secondJob, 'Thief') && G.gearTierOK(secondJob, 'Assassin'),
    'section 2 is for second-job classes, not first-job Thieves');
  assert.strictEqual(G.gearTierOf(nightmare), 3); assert.strictEqual(G.gearTierOf(abyssal), 3);
  assert.ok(!G.gearTierOK(nightmare, 'Assassin') && !G.gearTierOK(abyssal, 'Assassin'),
    'a second-job Assassin cannot wear Nightmare or Abyssal Nightmare gear');
  assert.ok(!G.gearTierOK(nightmare, 'Thief') && !G.gearTierOK(abyssal, 'Thief'),
    'a first-job Thief cannot wear either Nightmare section');
  assert.ok(G.gearTierOK(nightmare, 'Assassin Cross') && G.gearTierOK(abyssal, 'Assassin Cross'),
    'the third-job Assassin Cross meets the Nightmare class-stage gate');
  assert.deepStrictEqual([G.gearUserOf(nightmare), G.gearUserOf(abyssal)],
    ['transcendent classes only', 'transcendent classes only']);
  // drops match the gate: by the time a map hands out a section, its own ladder can wear it
  // (map 0 is Novice-only starter gear; maps 5-10 give high-tier from field level 3, and their
  // Base Lv bands are 60+, where the second/third jobs live)
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const sec = G.secField(m, l);
    assert.ok(sec <= G.MAPS[m].gear.length - 1, G.MAPS[m].n + ' level ' + l + ' asks for section ' + sec);
  }
  assert.ok(src.includes('canUse=it=>gearTierOK(it)&&'), 'the tier gate must stay part of canUse()');
  assert.ok(src.includes("const st=k=>S.st[k]+bon(k),gearTierOf=it=>"), 'the gate sits on the shared stat line');
});

t('an item outside the bag is refused', () => {
  const s = item({ id: 11, wt: 'staff', slot: 'weapon' });
  bag('Mage', []);
  assert.ok(!G.slotAccepts('weapon', s), 'an item outside S.inv is refused');
  bag('Mage', [s]);
  assert.ok(G.slotAccepts('weapon', s), 'a staff fits a Mage weapon slot');
});

t('every slot is offered exactly what the class may wear, and nothing else', () => {
  // end-to-end with a bag built out of the real Prontera pool, worn by a real class
  const mk = (x, i) => ({ id: 100 + i, name: x.n, tier: 1, val: 10,
    slot: ARM.includes(x.k) ? x.k : 'weapon', wt: ARM.includes(x.k) ? undefined : x.k });
  const inv = G.gearPool(0, 1).map(mk);
  bag('Novice', inv);
  assert.strictEqual(inv.filter(it => G.slotAccepts('weapon', it)).length, 2, 'a Novice can use the Prontera sword and dagger');
  ['weapon', 'armor', 'head', 'off', 'leg', 'acc1', 'acc2'].forEach(k => {
    const list = inv.filter(it => G.slotAccepts(k, it));
    if(k==='off'){assert.strictEqual(list.length,0,'Novice must not be offered a shield from Prontera');return}
    assert.ok(list.length >= 1, 'empty bag list for slot ' + k);
    list.forEach(it => assert.ok(G.canUse(it), it.name + ' offered for ' + k + ' but the class cannot use it'));
  });
  // a class that cannot hold a shield is offered none, even with a full bag
  bag('Assassin', inv);
  assert.strictEqual(inv.filter(it => G.slotAccepts('off', it) && it.slot === 'off').length, 0);
});

t('drop rarity is capped by MAP: no low-level boss can print endgame gear', () => {
  const bands = G.MAPTIER, caps = G.MAPGRADE;
  assert.deepStrictEqual(Array.from(bands), [0, 0, 1, 1, 2, 2, 3, 3, 3, 3], 'the per-map rarity ladder changed');
  assert.deepStrictEqual(Array.from(caps), [1, 2, 2, 3, 3, 3, 3, 3, 3, 4], 'the per-map grade cap changed');
  // v57 owner tiers: Izlude/Geffen/Morroc/Payon are early, Comodo/Louyang/Amatsu/Niflheim mid,
  // and Abyss is the only endgame map - so only Abyss may reach Legendary.
  assert.deepStrictEqual(Array.from(caps).map(c => c >= 4), [false,false,false,false,false,false,false,false,false,true],
    'Abyss must be the only map that can drop Legendary gear');
  assert.strictEqual(G.dropTier(8, 10), 3, 'Niflheim stage 10 tops out below Abyss');
  assert.strictEqual(G.dropTier(9, 10), 4, 'Abyss stage 10 is the Legendary source');
  assert.ok(G.MAPVAL[9] > G.MAPVAL[8] * 1.2, 'and the Abyss value band is a clear step above the mid maps');
  assert.strictEqual(G.BAGMAX, 1000, 'the bag holds 1000 items');
  for (let m = 0; m < G.MAPS.length; m++) {
    // stages 1-9 keep the map's own band, now clamped by that map's cap
    const perMap = [...new Set([1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => G.dropTier(m, l)))];
    assert.strictEqual(perMap.length, 1, G.MAPS[m].n + ' stages 1-9 must all sit on one band');
    assert.strictEqual(perMap[0], Math.min(caps[m], bands[m]), G.MAPS[m].n + ' stages 1-9 band');
  }
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const want = Math.min(caps[m], l >= 10 ? 4 : bands[m]);
    assert.strictEqual(G.dropTier(m, l), want, G.MAPS[m].n + ' stage ' + l + ' band');
    assert.ok(want <= caps[m], G.MAPS[m].n + ' stage ' + l + ' rolled past its cap');
    const F = G.fieldOf(m, l);
    assert.strictEqual(F.tier, want, G.MAPS[m].n + ' stage ' + l + ' field tier');
    F.mobs.forEach(mo => assert.strictEqual(mo.tier, want, 'every mob carries its field tier'));
    if (l === 10) assert.strictEqual(F.boss.tier, caps[m], 'the boss sits on the map cap, not always Legendary');
    if (l < 10) assert.ok(F.tier <= bands[m], 'a stage cannot out-roll its own map');
  }
  // Abyss Epic really does beat a Payon Legendary, which no longer drops at all
  const payonLegendary = 4.5 * G.MAPVAL[4], abyssEpic = 2.8 * G.MAPVAL[9];
  assert.ok(abyssEpic > payonLegendary, 'Abyss Epic (' + abyssEpic.toFixed(2) + ') must beat Payon Legendary (' + payonLegendary.toFixed(2) + ')');
});

t('the rarity band is fixed but the affixes are rolled every time', () => {
  const T = { k: 'sword', n: 'Test Blade' }, seen = new Set();
  for (let i = 0; i < 40; i++) {
    const it = G.genGear(T, 99, 3, true, 4);
    assert.strictEqual(it.tier, 4, 'a Legendary field must never hand out a lower band');
    assert.strictEqual(it.aff.length, 3, 'Legendary gear rolls three affixes');
    seen.add(it.aff.map(a => a.k + ':' + a.v).join(','));
  }
  assert.ok(seen.size > 1, 'two drops of the same item must differ in their affixes');
  const mid = G.genGear(T, 40, 1, false, 1);
  assert.strictEqual(mid.tier, 1);
  assert.ok(mid.aff.length >= 1 && mid.aff.length <= 2, 'Fine gear rolls one or two affixes');
  assert.ok(mid.name.startsWith('Fine '), 'the item name states its fixed band: ' + mid.name);
});

t('Nightmare equipment is its own N rarity, separate from Legendary and map quality', () => {
  // v76.2 owner: Nightmare equipment has its own rarity N. Its normal field-quality value must not
  // be promoted to Legendary just because the item comes from a Nightmare section.
  // v79 owner: the two Nightmare rows are split - section 4 is N, section 5 (Abyssal, the 15/7x
  // row) is N+, with its own colour, name prefix and auto-sell bucket, so ticking N can never
  // auto-sell the better row.
  const lowMapTier = G.dropTier(0, 12);
  const nm = G.genGear({ k: 'sword', n: 'Dread Excalibur' }, 150, 4, false, lowMapTier);
  const hi = G.genGear({ k: 'sword', n: 'Dark Lord Sword' }, 150, 3, true, 4);
  // v90.8 (owner: flatten N+ power): Nightmare gear no longer follows its map's quality. Every
  // Nightmare piece rolls the top tier, so the lower map's N gear is as strong as Abyss's.
  assert.strictEqual(nm.tier, 4, 'v90.8: Nightmare gear is flat - the top tier on every map, not the map field-quality value');
  assert.strictEqual(nm.tier, G.dropTier(9, 15), 'v90.8: the lowest map drops the same power as the Abyss map');
  assert.strictEqual(nm.aff.length, 3, 'v90.8: flat Nightmare gear rolls three affixes on every map');
  assert.strictEqual(G.rarIdx(nm), 5, 'section 4 selects the independent N rarity');
  assert.strictEqual(G.rarOf(nm).n, 'N', 'the rarity label is N, not Legendary');
  assert.strictEqual(G.rarCls(nm), 'r5', 'and N is painted with .r5');
  assert.ok(nm.name.startsWith('N '), 'the item name states it: ' + nm.name);
  assert.ok(src.includes('.r5{color:#5b21b6;font-weight:bold}'), 'the N rarity is dark purple in the CSS');
  assert.strictEqual(G.rarIdx(hi), 4, 'ordinary high-tier gear stays Legendary');
  assert.ok(hi.name.startsWith('Legendary '), 'and keeps its own prefix: ' + hi.name);
  const ab = G.genGear({ k: 'sword', n: 'Absolute Dark Lord Sword' }, 150, 5, true, G.dropTier(9, 15));
  assert.strictEqual(G.rarIdx(ab), 6, 'Abyssal Nightmare is N+, its own band - not Legendary, and not the same N as section 4');
  assert.strictEqual(G.rarOf(ab).n, 'N+', 'section 5 reads N+');
  assert.strictEqual(G.rarCls(ab), 'r6', 'and is painted with .r6');
  assert.ok(ab.name.startsWith('N+ '), 'the item name states it: ' + ab.name);
  assert.ok(src.includes('.r6{color:#c026d3;font-weight:bold}'), 'N+ is its own colour in the CSS');
  assert.strictEqual(G.RARALL.length, 7, 'seven rarity bands: five ordinary + N + N+');
  // The owner's Nightmare drop-rate tables are unchanged: one third of their normal counterparts.
  assert.strictEqual(G.FIELD_GEAR_NM.map(x => +(x * 3).toFixed(2)).join(','), '1.5,1.2,0.9');
  assert.strictEqual(G.FIELD_GEAR_MID_NM.map(x => +(x * 3).toFixed(2)).join(','), '1.05,0.84,0.63');
});

t('v90.9 Abyss affixes sit 5% under Nightmare Prontera; the maps between ramp linearly', () => {
  // Only affixes move with the map. The base value is flat (v90.8), so Prontera and Abyss N+ gear
  // differ only in their affix rolls. Map 0 is x1, map 9 (Abyss) is x0.95.
  assert.strictEqual(G.NM_ABYSS_AFF, 0.95, 'the Abyss affix factor is 0.95');
  assert.strictEqual(G.nmAffMapOf(0), 1, 'Nightmare Prontera (map 0) is x1');
  assert.strictEqual(G.nmAffMapOf(9), 0.95, 'Abyss (map 9) is x0.95');
  assert.ok(Math.abs(G.nmAffMapOf(4) - (1 - 0.05 * 4 / 9)) < 1e-9, 'map 4 sits on the linear ramp');
  assert.strictEqual(G.nmAffMapOf(undefined), 1, 'with no map given the factor is x1 (old callers unchanged)');
  for (const k of ['str', 'hp', 'atk', 'flee', 'crit']) {
    const atMap0 = G.affixValue(k, 5, 4, 1.25, 0), atMap9 = G.affixValue(k, 5, 4, 1.25, 9);
    assert.strictEqual(atMap9, Math.round(G.nmMulOf(k, 5) * 0.95 * G.AM[4] * G.AB[k] * 1.25), k + ' on Abyss is the 0.95 roll');
    assert.ok(atMap9 < atMap0, k + ' on Abyss is below Prontera at the same roll: ' + atMap9 + ' < ' + atMap0);
  }
  // Same seeded random stream for both maps, so each drop makes the same picks and only the affix factor differs.
  const seedRandom = seed => vm.runInContext('__seedA=' + seed + ';Math.random=function(){__seedA=(__seedA+0x6D2B79F5)|0;let t=Math.imul(__seedA^(__seedA>>>15),1|__seedA);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};', sb);
  const sumAff = mp => {
    seedRandom(12345);
    G.S = { st: { luk: 0 }, eq: {}, mp };
    let sum = 0;
    for (let i = 0; i < 400; i++) {
      const it = G.genGear({ k: 'sword', n: 'Absolute Dark Lord Sword' }, 150, 5, false, 4);
      for (const a of it.aff) sum += a.v;
    }
    return sum;
  };
  const origRandom = vm.runInContext('Math.random', sb);
  let ratio;
  try { ratio = sumAff(9) / sumAff(0); }
  finally { vm.runInContext('Math.random=__origRandom', Object.assign(sb, { __origRandom: origRandom })); }
  assert.ok(Math.abs(ratio - 0.95) < 0.01, 'the N+ affix total on Abyss is 0.95 of Prontera on the same rolls: ' + ratio.toFixed(4));
  G.S = { st: { luk: 0 }, eq: {}, mp: 9 };
  const ab = G.genGear({ k: 'sword', n: 'Absolute Dark Lord Sword' }, 150, 5, false, 4);
  assert.strictEqual(ab.mp, 9, 'an N+ piece records the map it dropped on, for reforge');
  G.S = { st: { luk: 0 }, eq: {}, mp: 9 };
  const hi3 = G.genGear({ k: 'sword', n: 'Dark Lord Sword' }, 150, 3, true, 4);
  assert.strictEqual(hi3.mp, undefined, 'a non-Nightmare piece records no map');
});

t('v90.8 flat Nightmare power: the same N+ gear is worth the same on the lowest and the Abyss map', () => {
  // Prontera (map 0) and Abyss (map 9) used to differ about 11x in N+ base value. The mean of 300
  // rolls must now match within 10%, and the value must not depend on the map at all.
  const mean = mp => {
    G.S = { st: { luk: 0 }, eq: {}, mp };
    let sum = 0;
    for (let i = 0; i < 300; i++) sum += G.genGear({ k: 'sword', n: 'Absolute Dark Lord Sword' }, 150, 5, false, G.dropTier(mp, 15)).val;
    return sum / 300;
  };
  const lo = mean(0), hi = mean(9);
  assert.ok(Math.abs(lo - hi) / hi < 0.1, 'the N+ mean is flat across maps: map 0 ' + lo.toFixed(1) + ' vs map 9 ' + hi.toFixed(1));
  const n = G.genGear({ k: 'sword', n: 'Dread Excalibur' }, 150, 4, false, G.dropTier(0, 12));
  assert.strictEqual(n.tier, 4, 'v90.8: N gear on the lowest map is top-tier too');
});

t('the cdm affix only rolls on weapons and accessories, like the cdm card always has',()=>{
  // v73 (owner: "players only target cri damage on all equipments"): gear Crit DMG is now a
  // weapon/accessory affix. Armor, headgear, shield and legwear never roll it.
  assert.ok(G.AFF.includes('cdm'),'cdm must stay in the master affix list');
  const noCdm = ['armor','head','off','leg'], withCdm = ['sword','acc'];
  for(const kind of noCdm)for(let i=0;i<150;i++){
    const it=G.genGear({k:kind,n:'Test '+kind},99,3,false,4);
    assert.ok(it.aff.length&&it.aff.every(a=>a.k!=='cdm'),kind+' must never roll cdm (roll '+i+')');
  }
  for(const kind of withCdm){
    let seen=0;
    for(let i=0;i<300;i++){const it=G.genGear({k:kind,n:'Test '+kind},99,3,false,4);if(it.aff.some(a=>a.k==='cdm'))seen++}
    assert.ok(seen>0,kind+' must still be able to roll cdm');
  }
  // the cdm CARD follows the same slot rule through CFIT
  assert.ok(src.includes("const CFIT={str:'weapon',dex:'weapon',atk:'weapon',crit:'weapon',cdm:'weapon'"),'the card fit table must keep cdm on weapons/accessories');
  assert.ok(src.includes("(slot==='weapon'||slot==='acc'?AFF:AFF.filter(k=>k!=='cdm'))"),'the live affix pool must be slot-filtered');
});

t('N and N+ Flee, ATK, ASPD and Crit % take the v90 nerf; STR, Max HP and Crit DMG do not move', () => {
  // v90 (owner): a slightly higher nerf on Flee, ATK, ASPD and CRIT in sections 4/5. Flee x3.0 / x3.4,
  // ATK %, ASPD % and Crit % x4.2 / x5.0. The flat stats stay on x3.5 / x4.
  assert.deepStrictEqual(Array.from(G.NM_MUL.flee), [3, 3.4], 'Flee multipliers are pinned');
  assert.deepStrictEqual(Array.from(G.NM_MUL.atk), [4.2, 5], 'ATK multipliers are pinned');
  assert.deepStrictEqual(Array.from(G.NM_MUL.aspd), [4.2, 5], 'ASPD multipliers are pinned');
  assert.deepStrictEqual(Array.from(G.NM_MUL.crit), [4.2, 5], 'Crit multipliers are pinned');
  assert.strictEqual(G.affixValue('flee', 5, 4, 1.25), 38, 'N+ Flee top roll on Abyss is 38 (was 44)');
  assert.strictEqual(G.affixValue('flee', 4, 4, 1.25), 33, 'N Flee top roll on Abyss is 33 (was 39)');
  assert.strictEqual(G.affixValue('atk', 5, 4, 1.25), 55, 'N+ ATK top roll is 55 (was 66)');
  assert.strictEqual(G.affixValue('atk', 4, 4, 1.25), 46, 'N ATK top roll is 46');
  assert.strictEqual(G.affixValue('aspd', 5, 4, 1.25), 41, 'N+ ASPD top roll is 41');
  assert.strictEqual(G.affixValue('crit', 4, 4, 1.25), 19, 'N Crit % top roll is 19');
  assert.strictEqual(G.affixValue('crit', 5, 4, 1.25), 22, 'N+ Crit % top roll is 22');
  assert.strictEqual(G.affixValue('str', 5, 4, 1.25), 55, 'N+ STR is unchanged at 55');
  assert.strictEqual(G.affixValue('hp', 5, 4, 1.25), 995, 'N+ Max HP is unchanged at 995');
  // the nerf is only on sections 4 and 5: section 3 keeps its plain 1+section multiplier
  assert.strictEqual(G.affixValue('flee', 3, 4, 1), Math.round(4 * G.AM[4] * G.AB.flee), 'section 3 Flee is untouched');
  assert.strictEqual(G.affixValue('atk', 3, 4, 1), Math.round(4 * G.AM[4] * G.AB.atk), 'section 3 ATK is untouched');
  assert.strictEqual(G.nmMulOf('flee', 5), 3.4, 'nmMulOf picks the N+ column');
  assert.strictEqual(G.nmMulOf('flee', 4), 3, 'nmMulOf picks the N column');
});

t('gear Crit DMG alone is scaled to 70% after the existing rounded affix roll',()=>{
  assert.strictEqual(G.AFFIX_CDM_SCALE,.7,'gear CDM output multiplier');
  assert.strictEqual(G.scaleCritDamageAffix(100),70,'a prior rolled value of 100 becomes 70');
  assert.strictEqual(G.scaleCritDamageAffix(40),28,'a prior rolled value of 40 becomes 28');
  assert.strictEqual(G.scaleCritDamageAffix(1),1,'the existing minimum +1 is preserved');
  for(let tier=0;tier<G.AM.length;tier++)for(let section=0;section<4;section++)for(const roll of [.8,.91,1,1.2,1.249]){
    for(const key of G.AFF){
      const raw=Math.max(1,Math.round((1+section)*G.AM[tier]*G.AB[key]*roll));
      const expected=key==='cdm'?G.scaleCritDamageAffix(raw):raw;
      assert.strictEqual(G.affixValue(key,section,tier,roll),expected,`${key} tier ${tier} section ${section} roll ${roll}`);
    }
  }
  assert.ok(src.includes("k==='cdm'?scaleCritDamageAffix(raw):raw"),'the post-roll multiplier must apply only to gear Crit DMG');
  assert.ok(src.includes('const n=[1,1+ri(0,1),2,2+ri(0,1),3][t]'),'live affix counts changed without updating the chart notes');
});

t('the affix range chart matches the live generator for every stat, rarity and gear section',()=>{
  const chart=fs.readFileSync(__dirname+'/../../Updates/cards-gear-audit/affix-ranges.html','utf8');
  assert.ok(chart.includes('Crit DMG only:')&&chart.includes('round(raw × 0.70)'),'chart must explain the separate gear CDM post-roll');
  assert.ok(chart.includes('Card Crit DMG values are unchanged'),'chart must distinguish gear from cards');
  assert.ok(chart.includes(src.match(/const BUILD='([^']+)'/)[1]),'chart build label must match the game');
  const tables=[...chart.matchAll(/<table data-rarity="([^"]+)">([\s\S]*?)<\/table>/g)];
  assert.strictEqual(tables.length,G.RAR.length,'one table per rarity');
  for(const [tableIndex,table] of tables.entries()){
    const [,rarity,body]=table;
    assert.strictEqual(rarity,G.RAR[tableIndex].n,'rarity order');
    const rows=[...body.matchAll(/<tr data-affix="([^"]+)" data-weight="([^"]+)">([\s\S]*?)<\/tr>/g)];
    assert.strictEqual(rows.length,G.AFF.length,rarity+' affix count');
    for(const [rowIndex,row] of rows.entries()){
      const [,key,weight,cellsHtml]=row,affix=G.AFF[rowIndex];
      assert.strictEqual(key,affix,rarity+' affix order');
      assert.strictEqual(Number(weight),G.AB[affix],rarity+' '+affix+' weight');
      const cells=[...cellsHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1]);
      assert.strictEqual(cells.length,5,rarity+' '+affix+' needs weight + four section ranges');
      assert.strictEqual(cells[0].replace(/<[^>]*>/g,'').trim(),'×'+G.AB[affix].toFixed(2),rarity+' '+affix+' printed weight');
      for(let section=0;section<4;section++){
        const scale=(1+section)*G.AM[tableIndex]*G.AB[affix];
        const rawMin=Math.max(1,Math.round(scale*.8)),rawMax=Math.max(1,Math.ceil(scale*1.25+.5)-1);
        const expected=affix==='cdm'?[G.scaleCritDamageAffix(rawMin),G.scaleCritDamageAffix(rawMax)]:[rawMin,rawMax];
        const actual=cells[section+1].replace(/<[^>]*>/g,'').trim().match(/^\+(\d+)–(\d+)$/);
        assert.ok(actual,rarity+' '+affix+' S'+section+' range is malformed');
        assert.deepStrictEqual([Number(actual[1]),Number(actual[2])],expected,rarity+' '+affix+' S'+section);
      }
    }
  }
});

t('Katars and bows always roll four card sockets; other weapons stay at three or fewer',()=>{
  for(const wt of ['katar','bow'])for(let tier=0;tier<5;tier++)for(let sec=0;sec<4;sec++){
    const it=G.genGear({k:wt,n:'Test '+wt},99,sec,false,tier);
    assert.strictEqual(it.slots,4,wt+' tier '+tier+' section '+sec);
  }
  for(const wt of ['dagger','staff','axe','sword','mace'])for(let tier=0;tier<5;tier++){
    const it=G.genGear({k:wt,n:'Test '+wt},99,3,false,tier);
    assert.ok(it.slots<=3,wt+' unexpectedly exceeded the old socket cap');
  }
});

t('selling gear is pocket money and never funds an upgrade', () => {
  assert.strictEqual(G.sellVal({ tier: 0, sec: 0, lvl: 1 }), 50, 'a starter Common piece sells for 50z');
  const best = G.sellVal({ tier: 4, sec: 3, lvl: 99 });
  assert.ok(best > 1000 && best < 2000, 'the best Legendary Abyss gear sells for under 2,000z (got ' + best + ')');
  for (let t = 0; t < 5; t++) for (let s = 0; s < 4; s++) {
    const v = G.sellVal({ tier: t, sec: s, lvl: 99 });
    assert.ok(v <= 2000, 'no item may be worth more than 2,000z (tier ' + t + ' sec ' + s + ' = ' + v + ')');
  }
});

t('a fighting pet widens the gear and ore windows, and nothing else (v75)', () => {
  // Hoarded Flame (+gear chance) and Sand Tracker (+ore chance) are the only companion effects
  // that bend a drop table, and this proves they bend exactly the windows they claim: a die that
  // misses at 0% lands at +10%, and the card gate does not move with it.
  const F = G.fieldOf(2, 5), mob = { ...F.mobs[0], boss: false, lvl: 5, sec: F.sec, tier: F.tier, ore: true, oreCh: 0.004 };
  G.S = { st: { luk: 0 }, eq: {} };
  // The field's three gear gates are 1.5 / 1.2 / 0.9 percent. A 0.98% die misses the last one...
  G.PETPASSIVE = 0;
  assert.strictEqual(G.executeGearRoll(mob, .0098).length, 2, 'at +0% a 0.98% die misses the 0.9% gate');
  assert.strictEqual(G.executeGearRoll(mob, .0085).length, 3, 'and a 0.85% die already cleared it');
  // ...and +10% widens that gate to exactly 0.99%, which is ten percent of the chance, not ten points
  G.PETPASSIVE = 10;
  assert.strictEqual(G.executeGearRoll(mob, .0098).length, 3, '+10% gear chance must let that die through');
  assert.strictEqual(G.executeGearRoll(mob, .0099).length, 2, 'the widened gate stops at exactly 0.99%');
  // the ore gate right below it is the same shape: 0.4% becomes 0.44%, so 0.42% is the dividing line
  G.PETPASSIVE = 0;
  assert.strictEqual(G.executeGearRoll(mob, .0042).filter(d => d.it && d.it.ore).length, 0, 'at +0% a 0.42% die finds no ore');
  G.PETPASSIVE = 10;
  assert.strictEqual(G.executeGearRoll(mob, .0042).filter(d => d.it && d.it.ore).length, 2, 'at +10% the same die finds both ores');
  assert.strictEqual(G.executeGearRoll(mob, .0045).filter(d => d.it && d.it.ore).length, 0, 'and the widened gate stops at 0.44%');
  G.PETPASSIVE = 0;
});

t('LUK does not touch drop odds, cards, ores or pets any more', () => {
  for (const l of [0, 99]) {
    const F = G.fieldOf(2, 5), mob = { ...F.mobs[0], boss: false, lvl: 5, sec: F.sec, tier: F.tier, ore: false };
    G.S = { st: { luk: l }, eq: {} };
    // A die of .008 (0.8%) clears all three gear gates (1.5/1.2/0.9%) under both builds.
    const drops = G.executeGearRoll(mob, .008);
    assert.strictEqual(drops.length, 3, 'LUK ' + l + ' must not change which gear rolls land (' + drops.length + ')');
    assert.ok(!drops.some(d => d.it && d.it.card), 'and the 0.15% card gate is untouched too');
  }
});

const total = pass + fail;
console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + total + ' assertions groups)');
process.exit(fail ? 1 : 0);
