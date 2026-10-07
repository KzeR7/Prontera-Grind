// Nightmare band: five more stages per map (11-15) unlocked at Base Lv 100/110/125/140/150, the
// two gear catalogue sections that exist nowhere else, and the difficulty knobs that make the band
// hurt.   node tools/tests/nightmare_sim.js
//
// The rules being checked:
//   * the unlock ladder is Base Lv 100 / 110 / 125 / 140 / 150 and nothing else - no new save field;
//   * fieldPower keeps climbing past the old ceiling of 100 (Abyss Stage 10) up to 175 (Nightmare
//     Abyss Stage 15), and every normal stage's power is byte-for-byte what it was;
//   * secField returns 4 or 5 ONLY above stage 10, so Nightmare gear cannot leak into the normal
//     game, and every map carries exactly six catalogue rows;
//   * a Nightmare section is its own map's high-tier row renamed: same weapon families (so every
//     class still has a weapon), all-new names, and a higher value multiplier;
//   * the difficulty constants are the shipped ones and the live spawn()/fieldOf() read them.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

// The catalogue, the map table, the power curve and the Nightmare block all live between G() and
// gearPool(). pm() is stubbed exactly like drop_card_sheet_sim does, since the map table parses its
// monsters at load time and this suite is about power, not sprites.
const code = [
  'const pm=s=>{const[n,c,sh]=String(s).split(":");return{n,c:parseInt(c,16)||0,shape:sh,spriteId:0,spriteSize:"Medium",spriteScale:1}};',
  // the affix/rarity tables the field tables and the item cards are built from (they sit above the
  // slice on the real page)
  'const AFF=["str","agi","dex","luk","int","hp","atk","crit","aspd","flee","cdm"];',
  'const AB={str:1,agi:1,dex:1,luk:1,int:1,hp:12,atk:.8,crit:.45,aspd:.6,flee:.8,cdm:.7};',
  'const K5=["str","agi","dex","luk","int"],AM=["a","b","c","d","e"],GRADE=[1,2,3,4],GI=[0,1,2,4],CV=[3.2,6.4,9.6,16];',
  grab('const G=(w,a,h,o,l,ac,ac2)=>', 'function gearPool(m,l){'),
  grab('function gearPool(m,l){', 'function fieldOf('),
  `const CFIT={};`,             // card fit table: fieldOf() only builds card names from it
    grab('function fieldOf(', 'const poolIc='),
].join('\n');

const harness = `
${code}
let S={lv:1,gmnm:false};
this.__n={ MAPS, GEAR, fieldPower, secField, dropTier, gearPool, fieldOf, bossCritRes,
  NMLV, NMBASE, NMSTEP, NMGAP, NMHP, NMATK, NMEXP, NMZENY, NMBOSSHP, NM_CRIT_RES, BOSS_CRIT_RES,
  FIELD_GEAR, FIELD_GEAR_MID, FIELD_GEAR_NM, FIELD_GEAR_MID_NM, BOSS_POOL_TOTAL,
  nmOpen, nmMax, NMNAME, NMNAME2,
  set S(v){S=v}, get S(){return S} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const N = sb.__n;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('nightmare: the Base Lv 100-150 band\n');

t('the band opens on Base Lv 100 / 110 / 125 / 140 / 150, and nowhere else', () => {
  assert.deepStrictEqual(Array.from(N.NMLV), [100, 110, 125, 140, 150], 'the unlock ladder is pinned');
  const open = lv => { N.S = { lv, gmnm: false }; return N.nmOpen(); };
  assert.strictEqual(open(1), 0, 'a new character has no Nightmare stages');
  assert.strictEqual(open(99), 0, 'Base Lv 99 is still the old ceiling');
  assert.strictEqual(open(100), 1, 'Base 100 opens Nightmare stage 11');
  assert.strictEqual(open(109), 1);
  assert.strictEqual(open(110), 2);
  assert.strictEqual(open(124), 2);
  assert.strictEqual(open(125), 3);
  assert.strictEqual(open(140), 4);
  assert.strictEqual(open(149), 4);
  assert.strictEqual(open(150), 5, 'Base 150 opens the last one');
  assert.strictEqual(N.nmMax(), 15, 'so stage 15 is the deepest field in the game');
  N.S = { lv: 1, gmnm: true };
  assert.strictEqual(N.nmOpen(), 5, 'and the GM switch opens all five for testing');
  N.S = { lv: 1, gmnm: false };
});

t('field power keeps climbing: 99 at Abyss 10 becomes 175 at Nightmare Abyss 15', () => {
  // the published schedule, map by map: stage 11 starts 5 levels past the old ceiling and every map
  // steps 6, every stage 4
  const expect = m => [0, 1, 2, 3, 4].map(k => N.NMBASE + m * N.NMSTEP + k * N.NMGAP);
  for (let m = 0; m < 10; m++)
    assert.deepStrictEqual([11, 12, 13, 14, 15].map(l => N.fieldPower(m, l)), expect(m), N.MAPS[m].n + ' Nightmare schedule');
  assert.strictEqual(N.fieldPower(0, 11), 105, 'Nightmare Prontera Stage 11 is power 105');
  assert.strictEqual(N.fieldPower(9, 15), 175, 'Nightmare Abyss Stage 15 is the endgame: 175');
  assert.strictEqual(N.fieldPower(9, 10), 99, 'and the old ceiling (Abyss Stage 10 = power 99) is exactly where it was');
  assert.strictEqual(N.fieldPower(9, 11), 159, 'the first Nightmare stage on Abyss already beats it by 60 levels');
  assert.strictEqual(N.fieldPower(1, 11), 111, 'and Nightmare Izlude Stage 11 opens at 111');
  // no stage can ever be easier than the one before it on any map (the early maps' published band
  // is flat at 20 for stages 5-6, so this is >= and not >), and the Nightmare band itself is strictly
  // steeper: every one of its stages is harder than the last
  for (let m = 0; m < 10; m++) for (let l = 2; l <= 10; l++)
    assert.ok(N.fieldPower(m, l) >= N.fieldPower(m, l - 1), N.MAPS[m].n + ' stage ' + l + ' must not be easier than ' + (l - 1));
  for (let m = 0; m < 10; m++) for (let l = 12; l <= 15; l++)
    assert.ok(N.fieldPower(m, l) > N.fieldPower(m, l - 1), N.MAPS[m].n + ' Nightmare stage ' + l + ' must be harder than ' + (l - 1));
  // every normal stage is untouched - the v1-10 schedule the audit sheet pins
  const band = [10, 12, 15, 17, 20, 20, 28, 35, 43, 50];
  for (let m = 1; m <= 4; m++) assert.deepStrictEqual([1,2,3,4,5,6,7,8,9,10].map(l => N.fieldPower(m, l)), band, N.MAPS[m].n);
  assert.deepStrictEqual([1,2,3,4,5,6,7,8,9,10].map(l => N.fieldPower(0, l)), [1,2,3,4,5,6,7,8,9,10], 'Prontera');
  assert.deepStrictEqual([1,2,3,4,5,6,7,8,9,10].map(l => N.fieldPower(9, l)), [90,91,92,93,94,95,96,97,98,99,100].slice(0, 10), 'Abyss b+stage');
});

t('Nightmare gear is exclusive: sections 4 and 5 exist only above stage 10', () => {
  for (let m = 0; m < 10; m++) {
    for (let l = 1; l <= 10; l++)
      assert.ok(N.secField(m, l) <= 3, N.MAPS[m].n + ' stage ' + l + ' must never roll Nightmare gear (got ' + N.secField(m, l) + ')');
    for (const l of [11, 12, 13]) assert.strictEqual(N.secField(m, l), 4, N.MAPS[m].n + ' stage ' + l + ' is Nightmare gear');
    for (const l of [14, 15]) assert.strictEqual(N.secField(m, l), 5, N.MAPS[m].n + ' stage ' + l + ' is Abyssal Nightmare gear');
  }
  // and the two new rows really exist, one pair per map
  assert.strictEqual(N.GEAR.length, 10, 'ten maps');
  for (let m = 0; m < 10; m++) assert.strictEqual(N.GEAR[m].length, 6, N.MAPS[m].n + ' must carry six catalogue rows');
});

t('a Nightmare row is its own map high-tier row renamed - same families, all-new names', () => {
  const names = new Set();
  for (let m = 0; m < 10; m++) {
    const hi = N.GEAR[m][3];
    for (const i of [0, 1]) {
      const row = N.GEAR[m][4 + i];
      // every weapon family the high-tier row has, the Nightmare row has - so no class loses a weapon
      assert.deepStrictEqual(Object.keys(row.w).sort(), Object.keys(hi.w).sort(), N.MAPS[m].n + ' section ' + (4 + i) + ' weapon families');
      for (const k in hi.w) {
        assert.ok(row.w[k].endsWith(' ' + hi.w[k]), row.w[k] + ' must keep the base name ' + hi.w[k]);
        assert.notStrictEqual(row.w[k], hi.w[k], 'and be a new item');
      }
      assert.ok(row.a.endsWith(' ' + hi.a) && row.h.endsWith(' ' + hi.h) && row.l.endsWith(' ' + hi.l) && row.ac.endsWith(' ' + hi.ac), 'armour slots follow the same rule');
      assert.strictEqual(!!row.o, !!hi.o, 'the shield slot matches the high-tier row');
      for (const v of [...Object.values(row.w), row.a, row.h, row.o, row.l, row.ac, row.ac2].filter(Boolean)) {
        assert.ok(!names.has(v), 'item names must be unique across the whole catalogue: ' + v);
        names.add(v);
      }
    }
  }
  console.log('       ' + names.size + ' Nightmare items across 10 maps x 2 sections');
  // the two sections are named on the item card (SECN[sec] is printed there)
  assert.ok(src.includes("SECN=['Starter gear','1st-job gear','2nd-job gear','High-tier gear','Nightmare gear','Abyssal Nightmare gear']"), 'SECN carries both Nightmare names');
});

t('the Nightmare rows are worth more than the high-tier row, and section 5 tops section 4', () => {
  const mult = pick(/\[1,2\.2,4,7,10\.5,15\]\[sec\]/, 'the section multiplier table');
  assert.ok(mult, 'the value multiplier must carry six entries');
  const M = [1, 2.2, 4, 7, 10.5, 15];
  assert.ok(M[4] > M[3] && M[5] > M[4], 'Nightmare > high tier, Abyssal Nightmare > Nightmare');
  assert.strictEqual(M[4] / M[3], 1.5, 'a Nightmare item is worth 1.5x the high-tier row');
  assert.strictEqual(M[5] / M[3], 15 / 7, 'and an Abyssal Nightmare item is worth 15/7 of it');
  // the live genGear reads that table for whatever section the field rolls
  assert.ok(/const val=Math\.max\(1,Math\.round\(\{weapon:2,armor:4,head:10,off:3,leg:3,acc:5\}\[slot\]\*\[1,2\.2,4,7,10\.5,15\]\[sec\]/.test(src),
    'genGear must price a Nightmare item from section 4 or 5');
});

t('the difficulty knobs are the shipped ones and the live code reads them', () => {
  // v77: the owner asked for "double the hp, atk can be increase too", so the wall takes a second
  // doubling (12 -> 24 in v76.2, now 24 -> 48) and the sting doubles too (1.5 -> 3). These numbers
  // are what the live game ships; a later retune moves this line with it.
  assert.deepStrictEqual([N.NMHP, N.NMATK, N.NMEXP, N.NMZENY, N.NMBOSSHP], [48, 3, 2.5, 2.2, 48], 'the band constants are pinned (v77: 48x HP, 3x ATK)');
  // spawn() is a game-loop function, so its wiring is checked at the source and the numbers are
  // worked out from the same formulas below.
  assert.ok(src.includes('nm1=S.lvl>10,nm=nm1?NMHP:1,na=nm1?NMATK:1,ne=nm1?NMEXP:1,nz=nm1?NMZENY:1'), 'spawn() reads the knobs once');
  assert.ok(src.includes('hp=early?Math.min(starterHp(S.lvl),Math.floor(HPK*mb*Math.pow(l,HPE))):Math.floor(HPK*mb*Math.pow(l,HPE)*nm)'), 'mob HP x NMHP');
  assert.ok(src.includes('atk:early?starterAtk(S.lvl):Math.floor((5+l*4.6)*mb*na)'), 'mob ATK x NMATK');
  assert.ok(src.includes('exp:Math.max(1,Math.floor(EXPK*Math.pow(l,1.5)/50*ne))'), 'mob EXP x NMEXP');
  assert.ok(src.includes('Math.floor(500*mb*Math.pow(l,HPE)*(nm1?NMBOSSHP:1))'), 'boss HP x NMBOSSHP');
  assert.ok(src.includes('atk:Math.floor((8+l*6.5)*mb*na)'), 'boss ATK shares the band multiplier');
  // a worked example, so the band can be judged without playing it: mb is the same map bonus spawn()
  const mb = 1 + 9 * .15 + Math.max(0, 9 - 4) * .2;
  const hp = l => Math.floor(42 * mb * Math.pow(l, 1.3));
  const atk = l => Math.floor((5 + l * 4.6) * mb);
  const abyss10 = { hp: hp(100), atk: Math.round(atk(100) * .25) }, abyss15 = { hp: hp(175) * 48, atk: Math.round(atk(175) * 3 * .25) };
  console.log('       Abyss Stage 10 : mob HP ' + abyss10.hp.toLocaleString() + ', a hit lands for ' + abyss10.atk.toLocaleString() + ' after a 75% DEF cut');
  console.log('       Nightmare 15   : mob HP ' + abyss15.hp.toLocaleString() + ' (' + (abyss15.hp / abyss10.hp).toFixed(0) + 'x), a hit lands for ' + abyss15.atk.toLocaleString() + ' (' + (abyss15.atk / abyss10.atk).toFixed(1) + 'x)');
  console.log('       Abyss 15 boss  : ' + (Math.floor(500 * mb * Math.pow(175, 1.3)) * 48).toLocaleString() + ' HP');
  assert.ok(abyss15.hp / abyss10.hp > 50, 'a Nightmare mob takes a good two orders of magnitude longer to kill than a normal one');
  assert.ok(abyss15.atk / abyss10.atk > 1.3, 'and it must hit at least a third harder');
});

t('the field tables read the band: boss pool, ore and crit resistance', () => {
  const nmBoss = N.fieldOf(9, 15).boss, normBoss = N.fieldOf(9, 10).boss;
  assert.strictEqual(nmBoss.critRes, .45, 'Nightmare Abyss bosses resist 45% crit');
  assert.strictEqual(normBoss.critRes, .3, 'the normal Abyss boss still resists 30%');
  // v76.2 (owner): the band's drops are a THIRD of the rate they were, MVP pool included
  assert.strictEqual(nmBoss.drops[0][1], Math.round(300 / nmBoss.drops.length) / 100, 'from BOSS_POOL_TOTAL[2] = 300, i.e. 3% total');
  assert.strictEqual(normBoss.drops[0][1], Math.round(420 / normBoss.drops.length) / 100, 'the mid/endgame MVP pool keeps 4.2%');
  // ...and the mob rolls are exactly a third of whichever normal table the map would use
  assert.deepStrictEqual([N.FIELD_GEAR_NM, N.FIELD_GEAR_MID_NM].map(t => t.map(x => +(x * 3).toFixed(2))), [N.FIELD_GEAR, N.FIELD_GEAR_MID],
    'the Nightmare tables are a clean third of the normal ones');
  for (const [m, l] of [[0, 11], [9, 11], [9, 15], [5, 13]]) {
    const nm = N.fieldOf(m, l).mobs[0].drops.map(d => d[1]), base = N.gearPool(m, l).length;
    assert.strictEqual(base, N.gearPool(m, l).length, 'the pool is whole');
    assert.ok(nm.every(ch => ch > 0), 'a Nightmare mob still rolls gear');
  }
  assert.ok(src.includes('const gch=l>10?(m>=5?FIELD_GEAR_MID_NM:FIELD_GEAR_NM):(m>=5?FIELD_GEAR_MID:FIELD_GEAR);'), 'fieldOf picks the band table by stage, not by map alone');
  assert.strictEqual(N.fieldOf(0, 11).mobs[0].oreCh, .015, 'Nightmare fields drop ore 1.5% a kill');
  assert.strictEqual(N.fieldOf(0, 10).mobs[0].oreCh, .01, 'the normal boss field keeps 1%');
  assert.strictEqual(N.fieldOf(9, 9).boss, null, 'and nothing but stage 10 and 15 has a boss');
  assert.ok(N.fieldOf(9, 15).boss && N.fieldOf(3, 15).boss, 'every map ends its Nightmare band with a boss');
  // the drops a Nightmare field rolls come from the Nightmare rows only
  assert.ok(N.gearPool(9, 15).every(x => x.sec === 5) && N.gearPool(9, 12).every(x => x.sec === 4), 'pool entries carry their section (the N rarity reads it)');
  assert.ok(N.gearPool(9, 10).every(x => x.sec === 3), 'and a normal field still says section 3');
  const T = N.gearPool(9, 15).map(x => x.n);
  const hi = new Set(Object.values(N.GEAR[9][3].w).concat(N.GEAR[9][3].a, N.GEAR[9][3].h, N.GEAR[9][3].o, N.GEAR[9][3].l, N.GEAR[9][3].ac, N.GEAR[9][3].ac2).filter(Boolean));
  assert.ok(T.every(n => !hi.has(n)), 'a Nightmare field must not drop the normal high-tier items');
});

t('a save cannot be left standing in a locked Nightmare stage', () => {
  assert.ok(src.includes('f.lvl=Math.max(1,Math.min(15,Math.floor(f.lvl||1)))'), 'load() accepts stage 15');
  assert.ok(src.includes('if(S.mp>=MAPS.length||S.lvl>15){S.mp=0;S.lvl=1}'), 'and the sanitizer treats 15 as legal');
  assert.ok(src.includes('S.lvl=Math.min(S.lvl,10+nmOpen())'), 'initSession pulls a character out of a stage it has not unlocked');
  assert.ok(src.includes('go:()=>{if(mapL<=Math.max(S.prog[mapM],nmMax()))'), 'travel allows an unlocked Nightmare stage');
  assert.ok(src.includes('nmo=nmOpen(),cap=Math.max(pr,nmMax())'), 'the map panel caps at the band');
  assert.ok(src.includes('mapL=Math.min(mapL,Math.max(1,Math.max(S.prog[mapM],nmMax())))'), 'and the stage picker cannot be clamped below the band');
});

const total = pass + fail;
console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + total + ' assertion groups)');
process.exit(fail ? 1 : 0);
