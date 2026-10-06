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
const gearDropEnd = src.indexOf('  if(Math.random()*100<mob.cardCh)', gearDropStart);
if (killStart < 0 || gearDropStart < 0 || gearDropEnd < gearDropStart) throw new Error('cannot find the live kill() gear-drop loop');
const gearDropLoop = src.slice(gearDropStart, gearDropEnd);
const code = [
  'const bon=()=>0;',
  grab('const CD=[', 'const pm=s=>'),                       // class roster: CLASSES, lineOf
  pick(/const C=\(\)=>[^;]+;/, 'C()'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'canUse'),
  grab('const pm=s=>', 'const REC='),                        // pm() + MAPS
  pick(/const secOf=[^;]+;/, 'secOf'),
  pick(/const secField=\(m,l\)=>[^;]+;/, 'secField'),
  pick(/const RAR=\[[^\]]*\];/, 'RAR'),
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'rarity tables'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AFF/AB'),
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
  pick(/const affixValue=\(k,section,tier,roll\)=>\{[^}]+\};/, 'affixValue'),
  `function executeGearRoll(mob,roll){const old=Math.random;Math.random=()=>roll;const drops=[],mkDrop=it=>({it});try{${gearDropLoop}}finally{Math.random=old}return drops}`,
  grab('function canShield(){', 'function ekey(it)'),        // shield and single-katar class rules
  grab('function slotAccepts(k,it){', 'function equipChooser(k){'),
].join('\n');

const harness = `
${code}
const SECN=['Starter gear','1st-job gear','2nd-job gear','High-tier gear'];
const SLOTS={weapon:{label:'Weapon',stat:'ATK',ic:'A'},armor:{label:'Armor',stat:'DEF',ic:'B'},head:{label:'Headgear',stat:'HP',ic:'C'},off:{label:'Shield',stat:'DEF',ic:'D'},leg:{label:'Legwear',stat:'DEF',ic:'E'},acc:{label:'Accessory',stat:'HP',ic:'F'}};
const rnd=(a,b)=>a+Math.random()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
let S=null;
this.__g={ MAPS, GEAR, gearPool, fieldOf, genGear, executeGearRoll, slotAccepts, canUse, canShield, katarOnly, CLASSES, lineOf, secOf, secField, SLOTS, BAGMAX, MAPTIER, MAPGRADE, MAPVAL, dropTier, sellVal, AM, AFF, AB, RAR, AFFIX_CDM_SCALE, scaleCritDamageAffix, affixValue,
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
t('ten maps, four sections each, all of them populated', () => {
  assert.strictEqual(G.MAPS.length, 10, 'map count');
  assert.strictEqual(G.GEAR.length, 10, 'gear set count - one per map');
  G.MAPS.forEach((mp, i) => {
    assert.ok(mp.gear === G.GEAR[i], mp.n + ' must use GEAR[' + i + ']');
    assert.strictEqual(mp.gear.length, 4, mp.n + ' needs four sections');
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

t('names do not repeat inside a map (no two slots offer the same item)', () => {
  G.MAPS.forEach(mp => mp.gear.forEach((sg, sec) => {
    const names = Object.keys(sg.w).map(k => sg.w[k]).concat([sg.a, sg.h, sg.o, sg.l, sg.ac, sg.ac2].filter(Boolean));
    assert.strictEqual(new Set(names).size, names.length, mp.n + ' section ' + sec + ' repeats a name');
  }));
});

t('early maps use novice equipment first, then class-tier gear through the Lv50 boss stage', () => {
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
    assert.ok(weaponTypes(3,sec).includes('dagger'),'Morroc needs Thief daggers');
    assert.ok(weaponTypes(4,sec).includes('bow'),'Payon needs Archer bows');
  }
  assert.ok(G.gearPool(1,10).some(x=>x.n==='Golden Axe'||x.n==='Loaded Mace'),'Izlude boss tier must include a Merchant weapon');
  assert.ok(G.gearPool(2,10).some(x=>x.n==='Wand of Hermes'),'Geffen boss tier must include its Mage weapon');
  assert.ok(G.gearPool(3,10).some(x=>x.n==='Sandstorm Dagger'),'Morroc boss tier must include its Thief weapon');
  assert.ok(G.gearPool(4,10).some(x=>x.n==='Gakkung Bow'),'Payon boss tier must include its Archer weapon');
});

t('armour and accessory names are unique across the whole game', () => {
  const seen = new Map();
  G.MAPS.forEach(mp => mp.gear.forEach(sg => [sg.a, sg.h, sg.o, sg.l, sg.ac, sg.ac2].filter(Boolean).forEach(n => {
    if (seen.has(n)) throw new Error(n + ' is both ' + seen.get(n) + ' and ' + mp.n);
    seen.set(n, mp.n);
  })));
});

// ---- 2. per-map relevance ----------------------------------------------------
// The five early maps are class-themed. Every mixed late map now carries a weapon family
// for every class, so all class lines can return there to hunt their own gear.
const EVERY_CLASS=Object.keys(G.CLASSES);
const MAP_LINES = [
  ['Novice', 'Swordman'],
  ['Swordman', 'Knight', 'Lord Knight', 'Merchant', 'Blacksmith', 'Whitesmith'],
  ['Mage', 'Wizard', 'High Wizard'],
  ['Thief', 'Assassin', 'Assassin Cross'],
  ['Archer', 'Hunter', 'Sniper'],
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
  assert.ok(Math.abs(total-6)<1.2,'the boss pool totals about 6% per kill, got '+total.toFixed(2)+'%');
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

t('the drop table: mobs roll three gear chances at 3.6%, the boss rolls four at 1.5%', () => {
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const F = G.fieldOf(m, l);
    F.mobs.forEach(mob => {
      // v57 (owner: "30 min of grinding gave a bunch of legendaries"): the field roll is a
      // third of what it was - 3.6% per kill in total, cards 0.15%.
      assert.deepStrictEqual(Array.from(mob.drops, d => d[1]), [1.5, 1.2, .9]);
      assert.strictEqual(mob.cardCh, .15, 'regular-mob card chance changed');
    });
    if (l === 10) {
      const total = F.boss.drops.reduce((a, d) => a + d[1], 0);
      assert.ok(Math.abs(total - 6) < 1.2, 'the boss pool totals about 6%, got ' + total.toFixed(2) + '%');
      assert.strictEqual(F.boss.drops.length, G.gearPool(m, 10).length, 'the boss still lists its whole pool');
      assert.strictEqual(F.boss.cardCh, .1, 'boss card chance changed');
    }
  }
});

t('the real equipment-drop loop creates boss gear when an independent roll succeeds', () => {
  G.S = {st:{luk:0},eq:{}};
  const F = G.fieldOf(0, 10), boss = {...F.boss,boss:true,lvl:10,sec:F.sec};
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
  const mob = {...G.fieldOf(0,1).mobs[0],boss:false,lvl:1,sec:0};
  const mobDrops = G.executeGearRoll(mob, .008);
  assert.strictEqual(mobDrops.length, 3, 'regular-mob equipment gates did not execute');
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

t('the pool is exactly the section set and only grows as you climb', () => {
  G.MAPS.forEach((mp, m) => {
    let prev = 0;
    for (let l = 1; l <= 10; l++) {
      const pool = G.gearPool(m, l), sec = mp.gear[G.secField(m, l)];
      const names = Object.keys(sec.w).map(k => sec.w[k]).concat([sec.a, sec.h, sec.o, sec.l, sec.ac, sec.ac2].filter(Boolean));
      assert.strictEqual(pool.map(x => x.n).join('|'), names.join('|'), mp.n + ' Lv' + l + ' pool must be the section set');
      assert.ok(pool.length >= prev, mp.n + ' Lv' + l + ' pool shrank');
      assert.ok(pool.length >= 7, mp.n + ' Lv' + l + ' pool is thin: ' + pool.length);
      prev = pool.length;
    }
    // Prontera is locked to Novice gear on every stage. The four class maps hold their first
    // tier through stage 5, then progress at stages 6, 8 and 10. The level 60+ maps stay pinned
    // to one high-tier set on purpose, so their whole pool never offers a starter item.
    if (m === 0) {
      const novice = G.gearPool(m, 1).map(x => x.n).join('|');
      for(let l=2;l<=10;l++)assert.strictEqual(G.gearPool(m,l).map(x=>x.n).join('|'),novice,'Prontera must stay on Novice gear');
    } else if (m < 5) {
      const s0 = G.gearPool(m, 1).map(x => x.n);
      [6, 8, 10].forEach(l => assert.ok(G.gearPool(m, l).some(n => !s0.includes(n.n)), mp.n + ' later sections add nothing'));
    } else {
      // v38: the high tier starts at field level 3, and stages 1-2 hand out section 2 (the
      // Comodo cliff floor) instead of the old "high tier from level 1".
      const top = G.gearPool(m, 3).map(x => x.n).join('|');
      assert.strictEqual(G.gearPool(m, 10).map(x => x.n).join('|'), top, mp.n + ' Lv10 must use the high-tier set');
      assert.strictEqual(G.gearPool(m, 2).map(x => x.n).join('|'), G.gearPool(m, 1).map(x => x.n).join('|'),
        mp.n + ' stages 1 and 2 must share the floored section');
      assert.notStrictEqual(G.gearPool(m, 1).map(x => x.n).join('|'), top,
        mp.n + ' stages 1-2 must not already hand out the top section');
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

t('off-hand shields stay class-gated; Assassins use one Katar and cannot off-hand weapons', () => {
  const shield = item({ id: 3, slot: 'off' }), dagger = item({ id: 4, slot: 'weapon', wt: 'dagger' }),
    katar = item({ id: 5, slot: 'weapon', wt: 'katar' }), sword = item({ id: 6, wt: 'sword' });
  bag('Swordman', [shield, dagger, katar, sword]);
  assert.ok(G.slotAccepts('off', shield), 'Swordman may hold a shield');
  assert.ok(!G.slotAccepts('off', dagger) && !G.slotAccepts('off', katar), 'Swordman may not use a weapon off-hand');
  assert.ok(!G.slotAccepts('off', sword), 'a one-handed sword is not an off-hand item for a Swordman');
  bag('Knight', [shield]);
  assert.ok(G.slotAccepts('off', shield), 'Knight keeps the shield');
  for(const cls of ['Assassin','Assassin Cross']){
    assert.deepStrictEqual(Array.from(G.CLASSES[cls].wt),['katar'],cls+' must be katar-only');
    bag(cls,[shield,dagger,katar]);
    assert.ok(G.katarOnly(),cls+' should be marked as a single-katar class');
    assert.ok(G.slotAccepts('weapon',katar),cls+' may equip a katar in the main hand');
    assert.ok(!G.slotAccepts('weapon',dagger),cls+' may not equip a dagger');
    assert.ok(!G.slotAccepts('off',shield)&&!G.slotAccepts('off',dagger)&&!G.slotAccepts('off',katar),cls+' has no usable off-hand');
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

t('LUK does not touch drop odds, cards, ores or pets any more', () => {
  for (const l of [0, 99]) {
    const F = G.fieldOf(2, 5), mob = { ...F.mobs[0], boss: false, lvl: 5, sec: F.sec, tier: F.tier };
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
