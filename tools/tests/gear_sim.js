// Equipment database, per-map drop relevance, the drop mix, and the slot chooser.
//   node tools/tests/gear_sim.js
//
// The rules being tested:
//   * the catalogue is a real database: 10 maps x 4 sections (Novice / 1st job / 2nd job /
//     high tier), and every section carries 2-3 weapon types plus body, headgear, shield,
//     legwear and two accessories - weapons are what a player hunts for, so they come first;
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

const gearDropLoop = grab('  for(const[T,ch]of mob.drops)', '  if(Math.random()*100<mob.cardCh*lk)');
const code = [
  'const bon=()=>0;',
  grab('const CD=[', 'const pm=s=>'),                       // class roster: CLASSES, lineOf
  pick(/const C=\(\)=>[^;]+;/, 'C()'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'canUse'),
  grab('const pm=s=>', 'const REC='),                        // pm() + MAPS
  pick(/const secOf=[^;]+;/, 'secOf'),
  pick(/const RAR=\[[^\]]*\];/, 'RAR'),
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'rarity tables'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AFF/AB'),
  pick(/K5=\[[^\]]*\];/, 'K5'),
  pick(/const cardVal=\(g,st\)=>[^;]+;/, 'cardVal'),
  pick(/const cardStat=\(g,seed\)=>\{[^}]*\};/, 'cardStat'),
  pick(/const SU=k=>[^,]+/, 'SU'),
  grab('function gearPool(m,l){', 'const dropTxt='),
  grab('function genGear(T,l,sec,boss){', '// ---------- skill effects'),
  `function executeGearRoll(mob,roll){const old=Math.random;Math.random=()=>roll;const drops=[],lk=1,mkDrop=it=>({it});try{${gearDropLoop}}finally{Math.random=old}return drops}`,
  grab('function canShield(){', 'function ekey(it)'),        // canShield / dualOn / dualOk
  grab('function slotAccepts(k,it){', 'function equipChooser(k){'),
].join('\n');

const harness = `
${code}
const SECN=['Novice gear','1st-job gear','2nd-job gear','High-tier gear'];
const SLOTS={weapon:{label:'Weapon',stat:'ATK',ic:'A'},armor:{label:'Armor',stat:'DEF',ic:'B'},head:{label:'Headgear',stat:'HP',ic:'C'},off:{label:'Shield',stat:'DEF',ic:'D'},leg:{label:'Legwear',stat:'DEF',ic:'E'},acc:{label:'Accessory',stat:'HP',ic:'F'}};
const rnd=(a,b)=>a+Math.random()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
let S=null;
this.__g={ MAPS, GEAR, gearPool, fieldOf, genGear, executeGearRoll, slotAccepts, canUse, canShield, dualOk, CLASSES, lineOf, secOf, SLOTS,
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

t('every section carries weapons plus one of every armour slot', () => {
  let weapons = 0;
  G.MAPS.forEach(mp => mp.gear.forEach((sg, sec) => {
    const where = mp.n + ' section ' + sec;
    const wt = Object.keys(sg.w);
    assert.ok(wt.length >= 1, where + ': no weapon at all');
    wt.forEach(k => assert.ok(WEP.includes(k), where + ': unknown weapon type ' + k));
    assert.ok(sg.w[wt[0]], where + ': empty weapon name');
    ['a', 'h', 'o', 'l', 'ac', 'ac2'].forEach(k => assert.ok(sg[k] && sg[k].length > 2, where + ': missing ' + k));
    weapons += wt.length;
  }));
  console.log('       ' + weapons + ' weapon entries across 40 sections');
});

t('names do not repeat inside a map (no two slots offer the same item)', () => {
  G.MAPS.forEach(mp => mp.gear.forEach((sg, sec) => {
    const names = Object.keys(sg.w).map(k => sg.w[k]).concat([sg.a, sg.h, sg.o, sg.l, sg.ac, sg.ac2]);
    assert.strictEqual(new Set(names).size, names.length, mp.n + ' section ' + sec + ' repeats a name');
  }));
});

t('armour and accessory names are unique across the whole game', () => {
  const seen = new Map();
  G.MAPS.forEach(mp => mp.gear.forEach(sg => [sg.a, sg.h, sg.o, sg.l, sg.ac, sg.ac2].forEach(n => {
    if (seen.has(n)) throw new Error(n + ' is both ' + seen.get(n) + ' and ' + mp.n);
    seen.set(n, mp.n);
  })));
});

// ---- 2. per-map relevance ----------------------------------------------------
// Which class lines each map is built to serve. The five early maps are class-themed; the five
// level 60+ maps are mixed, and by then every line is a 2nd/3rd job, so they are tested against
// the advanced weapon lists (a Lord Knight, an Assassin Cross, a Sniper, a Whitesmith, a High
// Priest and a High Wizard can all be standing on Comodo at Lv 60+).
const MAP_LINES = [
  ['Novice', 'Swordman', 'Acolyte'],
  ['Merchant', 'Blacksmith', 'Whitesmith'],
  ['Mage', 'Wizard', 'High Wizard'],
  ['Thief', 'Assassin', 'Assassin Cross'],
  ['Archer', 'Hunter', 'Sniper'],
  ['Lord Knight', 'Assassin Cross', 'Sniper', 'Whitesmith', 'High Priest', 'High Wizard'],
  ['Lord Knight', 'Assassin Cross', 'Sniper', 'Whitesmith', 'High Priest', 'High Wizard'],
  ['Lord Knight', 'Assassin Cross', 'Sniper', 'Whitesmith', 'High Priest', 'High Wizard'],
  ['Lord Knight', 'Assassin Cross', 'Sniper', 'Whitesmith', 'High Priest', 'High Wizard'],
  ['Lord Knight', 'Assassin Cross', 'Sniper', 'Whitesmith', 'High Priest', 'High Wizard'],
];
const wtsOf = cls => G.CLASSES[cls].wt || [];
const typesIn = (mp, sec) => Object.keys(mp.gear[sec].w);
const ARM = ['armor', 'head', 'off', 'leg', 'acc'];
const isWep = x => !ARM.includes(x.k);

t('every weapon in a map pool is usable by a line that levels there', () => {
  G.MAPS.forEach((mp, m) => {
    const allowed = new Set(MAP_LINES[m].flatMap(wtsOf));
    mp.gear.forEach((sg, sec) => typesIn(mp, sec).forEach(k => {
      assert.ok(allowed.has(k), mp.n + ' section ' + sec + ' drops a ' + k + ' but no line there can use it');
    }));
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

t('equipment rolls are doubled on mobs and bosses while card odds stay unchanged', () => {
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const F = G.fieldOf(m, l);
    F.mobs.forEach(mob => {
      assert.deepStrictEqual(Array.from(mob.drops, d => d[1]), [4.8, 4.0, 3.2]);
      assert.strictEqual(mob.cardCh, .45, 'regular-mob card chance changed');
    });
    if (l === 10) {
      F.boss.drops.forEach(([, ch]) => assert.strictEqual(ch, 2.4, 'boss equipment chance was not doubled'));
      assert.strictEqual(F.boss.cardCh, .08, 'boss card chance changed');
    }
  }
});

t('the real equipment-drop loop creates boss gear when an independent roll succeeds', () => {
  G.S = {st:{luk:0},eq:{}};
  const F = G.fieldOf(0, 10), boss = {...F.boss,boss:true,lvl:10,sec:F.sec};
  assert.strictEqual(boss.drops.length, 9, 'expected a roll for every boss-pool item');
  // A 1.8% roll fails the old 1.2% gate but passes the doubled 2.4% gate.
  const drops = G.executeGearRoll(boss, .018);
  assert.strictEqual(drops.length, boss.drops.length, 'the actual boss gear loop did not emit items');
  assert.ok(drops.every(d => d.it && d.it.tier >= 2), 'boss flag must reach genGear() and guarantee at least Rare');
  assert.ok(drops.every(d => d.it.slot), 'successful boss rolls must be real equipment objects');
  // The regular-mob branch is also the live loop: 3.5% clears the new first two gates,
  // but misses the old rates and the new 3.2% third roll.
  const mob = {...G.fieldOf(0,1).mobs[0],boss:false,lvl:1,sec:0};
  const mobDrops = G.executeGearRoll(mob, .035);
  assert.strictEqual(mobDrops.length, 2, 'doubled regular-mob equipment gates did not execute');
});

t('fieldOf only hands out items from that field pool', () => {
  for (let m = 0; m < G.MAPS.length; m++) for (let l = 1; l <= 10; l++) {
    const pool = G.gearPool(m, l).map(x => x.n), F = G.fieldOf(m, l);
    F.mobs.forEach(mob => mob.drops.forEach(d => assert.ok(pool.includes(d[0].n), d[0].n + ' is not in the ' + G.MAPS[m].n + ' Lv' + l + ' pool')));
    if (l === 10) {
      assert.ok(F.boss, 'level 10 must have a boss');
      assert.strictEqual(F.boss.drops.length, pool.length, 'the boss drops the whole pool');
      F.boss.drops.forEach(d => assert.ok(pool.includes(d[0].n)));
    } else assert.strictEqual(F.boss, null, 'bosses only exist at level 10');
  }
});

t('the level 10 boss and its card are the field ceiling', () => {
  for (let m = 0; m < G.MAPS.length; m++) {
    const F = G.fieldOf(m, 10);
    assert.strictEqual(F.boss.card.g, 3, 'boss card must be Legendary');
    assert.ok(F.boss.cardCh < F.mobs[0].cardCh, 'boss card rarer than a mob card');
    assert.ok(F.boss.ore && F.mobs[0].ore, 'level 10 fields drop oridecon/elunium');
    // v16 ore buff: 2% per monster, 5% per boss (was 0.4% flat)
    assert.strictEqual(F.mobs[0].oreCh, 0.02, 'level 10 mobs drop ore at 2%');
    assert.strictEqual(F.mobs[1].oreCh, 0.02, 'both mobs drop ore at 2%');
    assert.strictEqual(F.boss.oreCh, 0.05, 'the boss drops ore at 5%');
  }
  const low = G.fieldOf(0, 1);
  assert.strictEqual(low.mobs[0].ore, false, 'low fields must not drop refine ores');
  assert.ok(!low.mobs[0].oreCh, 'low fields roll no ore chance');
  assert.strictEqual(low.mobs[0].card.g, 0, 'low fields roll common cards');
});

t('the pool is exactly the section set and only grows as you climb', () => {
  G.MAPS.forEach((mp, m) => {
    let prev = 0;
    for (let l = 1; l <= 10; l++) {
      const pool = G.gearPool(m, l), sec = mp.gear[m >= 5 ? 3 : G.secOf(l)];
      const names = Object.keys(sec.w).map(k => sec.w[k]).concat([sec.a, sec.h, sec.o, sec.l, sec.ac, sec.ac2]);
      assert.strictEqual(pool.map(x => x.n).join('|'), names.join('|'), mp.n + ' Lv' + l + ' pool must be the section set');
      assert.ok(pool.length >= prev, mp.n + ' Lv' + l + ' pool shrank');
      assert.ok(pool.length >= 7, mp.n + ' Lv' + l + ' pool is thin: ' + pool.length);
      prev = pool.length;
    }
    // a themed map's later sections must be different gear, not renamed repeats. The level 60+
    // maps are pinned to one high-tier set on purpose: they are all Lv 60-99, so their whole
    // pool is the top section and the field never offers a starter item.
    if (m < 5) {
      const s0 = G.gearPool(m, 1).map(x => x.n);
      [4, 8, 10].forEach(l => assert.ok(G.gearPool(m, l).some(n => !s0.includes(n.n)), mp.n + ' later sections add nothing'));
    } else {
      assert.strictEqual(G.gearPool(m, 1).map(x => x.n).join('|'), G.gearPool(m, 10).map(x => x.n).join('|'),
        mp.n + ' is a Lv 60+ map: every field must use the high-tier set');
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

t('the off hand offers shields only to shield classes, daggers only to dual-wielders', () => {
  const shield = item({ id: 3, slot: 'off' }), dagger = item({ id: 4, slot: 'weapon', wt: 'dagger' }), sword = item({ id: 5, wt: 'sword' });
  bag('Swordman', [shield, dagger, sword]);
  assert.ok(G.slotAccepts('off', shield), 'Swordman may hold a shield');
  assert.ok(!G.slotAccepts('off', dagger), 'Swordman may not dual-wield');
  assert.ok(!G.slotAccepts('off', sword), 'a one-handed sword is not an off-hand item for a Swordman');
  bag('Assassin', [shield, dagger, sword]);
  assert.ok(!G.slotAccepts('off', shield), 'Assassin cannot hold a shield');
  assert.ok(G.slotAccepts('off', dagger), 'Assassin may dual-wield daggers');
  bag('Knight', [shield]);
  assert.ok(G.slotAccepts('off', shield), 'Knight keeps the shield');
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
  assert.strictEqual(inv.filter(it => G.slotAccepts('weapon', it)).length, G.gearPool(0, 1).filter(isWep).length - 1);  // sword+dagger for a Novice, not the mace
  ['weapon', 'armor', 'head', 'off', 'leg', 'acc1', 'acc2'].forEach(k => {
    const list = inv.filter(it => G.slotAccepts(k, it));
    assert.ok(list.length >= 1, 'empty bag list for slot ' + k);
    list.forEach(it => assert.ok(G.canUse(it), it.name + ' offered for ' + k + ' but the class cannot use it'));
  });
  // a class that cannot hold a shield is offered none, even with a full bag
  bag('Assassin', inv);
  assert.strictEqual(inv.filter(it => G.slotAccepts('off', it) && it.slot === 'off').length, 0);
});

const total = pass + fail;
console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + total + ' assertions groups)');
process.exit(fail ? 1 : 0);
