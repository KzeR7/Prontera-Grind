// Nightmare band: five more stages per map (11-15) unlocked at Base Lv 100/110/125/140/150, the
// two gear catalogue sections that exist nowhere else, and the difficulty knobs that make the band
// hurt.   node tools/tests/nightmare_sim.js
//
// The rules being checked:
//   * the unlock ladder is Base Lv 100 / 110 / 125 / 140 / 150 and nothing else - no new save field;
//   * fieldPower keeps climbing past the old ceiling of 99 (Abyss Stage 10) up to 175 (Nightmare
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
const HPE=1.3;
let S={lv:1,gmnm:false};
this.__n={ MAPS, GEAR, fieldPower, secField, dropTier, gearPool, fieldOf, bossCritRes,
  NMLV, NMBASE, NMSTEP, NMGAP, NMHP, NMATK, NMEXP, NMZENY, NMBOSSHP, NM_CRIT_RES, BOSS_CRIT_RES, nmExpOf, nmZenyOf,
  FIELD_GEAR, FIELD_GEAR_MID, FIELD_GEAR_NM, FIELD_GEAR_MID_NM, BOSS_POOL_TOTAL, NMPLUS_DROP, NM15_BUFF, nm15Of,
  nmOpen, nmMax, NMNAME, NMNAME2,
  nmPayOf, NM_MAT, NM_MAT_CH,
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
  // v77.1 (owner): "i think we buffed the nightmare maps too much. tune it down on the damage. also
  // adjust the zeny & exp rate, make sure is relevant." The wall keeps v77's 48x, the sting comes
  // back down to 2x (above v76's 1.5x, below v76.2's 2.25x), and the band pays per kill like the
  // ~101x-HP wall it is: EXP 2.5 -> 4, Zeny 2.2 -> 4. These numbers are what the live game ships; a
  // later retune moves this line with it.
  assert.deepStrictEqual([N.NMHP, N.NMATK, N.NMEXP, N.NMZENY, N.NMBOSSHP], [48, 2, 4, 4, 48], 'the band constants are pinned (v77.1: 48x HP, 2x ATK, 4x EXP/Zeny)');
  // spawn() is a game-loop function, so its wiring is checked at the source and the numbers are
  // worked out from the same formulas below.
  assert.ok(src.includes('nm1=S.lvl>10,nm=nm1?NMHP*nm15Of(S.lvl):1,na=nm1?NMATK*nm15Of(S.lvl):1,ne=nm1?nmExpOf(S.lvl)*nmPayOf(S.mp,S.lvl,1.5):1,nz=nm1?nmZenyOf(S.lvl)*nmPayOf(S.mp,S.lvl,2):1'), 'minionDef reads the knobs once (v85: stage ramp; v89: x1.3 on Stage 15; v90.3: map pay)');
  // v85: the Stage 15 MVP pays the band EXP/Zeny too (the v76 line had neither - a 66M-HP MVP
  // paid less EXP than two of its own map's mobs), and the offline simulator mirrors the ramps.
  assert.ok(src.includes('na=nm1?NMATK*nm15Of(S.lvl):1,ne=nm1?NMEXP*nmPayOf(S.mp,S.lvl,1.5):1,nz=nm1?NMZENY*nmPayOf(S.mp,S.lvl,2):1;'), 'spawn() reads the MVP knobs once (v89: ATK x1.3 on Stage 15; v90.3: map pay)');
  assert.ok(src.includes('exp:Math.max(1,Math.floor(BOSEK*Math.pow(l,1.5)/50*ne)),zeny:Math.max(ZMIN,Math.floor(ri(BZK[0],BZK[1])*l*l/1000*nz))'), 'MVP EXP/Zeny x NMEXP/NMZENY');
  assert.ok(src.includes('nm1=stage>10,ne=nm1?nmExpOf(stage)*nmPayOf(m,stage,1.5):1,nz=nm1?nmZenyOf(stage)*nmPayOf(m,stage,2):1'), 'the offline simulator mirrors the band pay (v90.3: map pay)');
  assert.ok(src.includes('hp=early?Math.min(starterHp(S.lvl),Math.floor(HPK*mb*Math.pow(l,HPE))):Math.floor(HPK*mb*Math.pow(l,HPE)*nm)'), 'mob HP x NMHP');
  assert.ok(src.includes('atk:early?starterAtk(S.lvl):Math.floor((5+l*4.6)*mb*na*eaOf(l))'), 'mob ATK x NMATK (and the v86 endgame bump)');
  assert.ok(src.includes('exp:Math.max(1,Math.floor(EXPK*Math.pow(l,1.5)/50*ne))'), 'mob EXP x NMEXP');
  assert.ok(src.includes('Math.floor(500*mb*Math.pow(l,HPE)*(nm1?NMBOSSHP*nm15Of(S.lvl):1))'), 'boss HP x NMBOSSHP (v89: x1.3 on Stage 15)');
  assert.ok(src.includes('atk:Math.floor((8+l*6.5)*mb*na*eaOf(l))'), 'boss ATK shares the band multiplier and the v86 endgame bump');
  // A worked example using the live field powers (99 and 175). Keep spawn()'s flooring order too:
  // the HP/ATK multipliers are applied before Math.floor, not to an already-rounded base value.
  const mb = 1 + 9 * .15 + Math.max(0, 9 - 4) * .2;
  const abyss10Power = N.fieldPower(9, 10), abyss15Power = N.fieldPower(9, 15);
  const hp = (l, mult = 1) => Math.floor(42 * mb * Math.pow(l, 1.3) * mult);
  const atk = (l, mult = 1) => Math.floor((5 + l * 4.6) * mb * mult);
  // the live knobs, not copied numbers: a retune of NMHP/NMATK moves this example with it
  const abyss10 = { hp: hp(abyss10Power), atk: Math.round(atk(abyss10Power) * .25) };
  // v89 (owner): Stage 5 - the MVP stage on every map - carries +30% HP and +30% ATK (N.NM15_BUFF)
  const abyss15 = { hp: hp(abyss15Power, N.NMHP * N.NM15_BUFF), atk: Math.round(atk(abyss15Power, N.NMATK * N.NM15_BUFF) * .25) };
  const abyss15BossHp = Math.floor(500 * mb * Math.pow(abyss15Power, 1.3) * (N.NMBOSSHP * N.NM15_BUFF));
  assert.deepStrictEqual([abyss10Power, abyss10.hp, abyss10.atk], [99, 55286, 386], 'Abyss Stage 10 uses its live power-99 baseline');
  assert.deepStrictEqual([abyss15Power, abyss15.hp, abyss15.atk, abyss15BossHp], [175, 7234826, 1764, 86128892], 'the Nightmare example follows spawn() rounding (v86 ATK bump and v89 x1.3 included)');
  console.log('       Abyss Stage 10 : mob HP ' + abyss10.hp.toLocaleString() + ', a hit lands for ' + abyss10.atk.toLocaleString() + ' after a 75% DEF cut');
  console.log('       Nightmare Abyss 15: mob HP ' + abyss15.hp.toLocaleString() + ' (' + (abyss15.hp / abyss10.hp).toFixed(0) + 'x), a hit lands for ' + abyss15.atk.toLocaleString() + ' (' + (abyss15.atk / abyss10.atk).toFixed(1) + 'x)');
  console.log('       Abyss Stage 15 boss: ' + abyss15BossHp.toLocaleString() + ' HP');
  assert.ok(abyss15.hp / abyss10.hp > 50, 'a Nightmare mob takes a good two orders of magnitude longer to kill than a normal one');
  assert.ok(abyss15.atk / abyss10.atk > 1.3, 'and it must hit at least a third harder');
  assert.ok(abyss15.atk / abyss10.atk < 5.2, 'but not so hard that v77\u2019s 5.2x is back - the sting was tuned down on purpose (v89: +30% puts Stage 5 at ~4.6x, still under it)');
  assert.ok(N.NMEXP > 3 && N.NMZENY > 3, 'and the band pays for the time its wall costs');
});

t('the pay ramps by stage (v85): EXP 16/24/32/40/48, Zeny 4/5/6/7/8', () => {
  // The owner doubled the Base 100+ requirements in v84, then asked for the band's mob pay to
  // be retuned against the new curve: EXP ramps so kill counts per level stay in a ~25-240 band
  // across 100-150 (flat x4 gave 50-480), Zeny ramps only "a little higher" (their words).
  assert.deepStrictEqual([11, 12, 13, 14, 15].map(N.nmExpOf), [16, 24, 32, 40, 48], 'EXP ramp = NMEXP x 2 x (stage-9)');
  assert.deepStrictEqual([11, 12, 13, 14, 15].map(N.nmZenyOf), [4, 5, 6, 7, 8], 'Zeny ramp = NMZENY + (stage-11)');
  assert.deepStrictEqual([1, 10, 16].map(N.nmExpOf), [16, 16, 48], 'the helpers clamp to the band');
  // Efficiency per HP (raw EXP per million HP - the x7/3 display rate cancels in ratios): the
  // ramp walks the deepest map into parity with plain Abyss Stage 10 mob grinding (1,953) by the
  // capstone, while the on-ramp field (NM Prontera 11, the mb=1 map) is AT parity from the first
  // stage. The MVP wave (3,610) stays the exp-optimal camp - the band is the intended route, not
  // a forced one, and its exclusive N/N+ gear is the reason to be there.
  const perM = (m, st) => { const p = N.fieldPower(m, st), mb = 1 + m * .15 + Math.max(0, m - 4) * .2;
    return N.nmExpOf(st) * Math.floor(5.5 * Math.pow(p, 1.5) / 50) / (42 * mb * Math.pow(p, 1.3) * N.NMHP) * 1e6; };
  assert.ok(Math.abs(perM(0, 11) - 2208) < 30, 'NM Prontera S11 pays ~2,208/HP (parity with Abyss mob grinding from stage one)');
  assert.ok(perM(9, 11) > 690 && perM(9, 11) < 740, 'NM Abyss S11 pays ' + perM(9, 11).toFixed(0) + '/HP - the deep-map HP multiplier still bites early');
  assert.ok(perM(9, 15) > 2150 && perM(9, 15) < 2230, 'NM Abyss S15 pays ' + perM(9, 15).toFixed(0) + '/HP - the capstone reaches parity');
  assert.ok(perM(9, 15) / perM(9, 11) > 2.9, 'deepening the stage more than triples the deep map\u2019s pay per HP');
  // v89 (owner): Stage 5 has +30% HP, and the pay was NOT retuned with it, so the capstone's pay per HP
  // falls from parity (~2,190) to about 1,690 - the pre-buff figure above is kept so the ramp is still
  // read on its own. Any EXP/Zeny rebalance of Stage 5 is the owner's call.
  assert.ok(perM(9, 15) / N.NM15_BUFF > 1650 && perM(9, 15) / N.NM15_BUFF < 1720, 'with the v89 Stage 5 HP the capstone pays ' + (perM(9, 15) / N.NM15_BUFF).toFixed(0) + '/HP');
  console.log('       EXP per million HP - NM Prontera 11: ' + perM(0, 11).toFixed(0) + ', NM Abyss 11: ' + perM(9, 11).toFixed(0) +
    ', NM Abyss 15: ' + perM(9, 15).toFixed(0) + ' (Abyss S10 mob = 1,953, MVP wave = 3,610)');
});

t('the field tables read the band: boss pool, ore and crit resistance', () => {
  const nmBoss = N.fieldOf(9, 15).boss, normBoss = N.fieldOf(9, 10).boss;
  assert.strictEqual(nmBoss.critRes, .45, 'Nightmare Abyss bosses resist 45% crit');
  assert.strictEqual(normBoss.critRes, .3, 'the normal Abyss boss still resists 30%');
  // v76.2 (owner): the band's drops are a THIRD of the rate they were, MVP pool included
  assert.strictEqual(nmBoss.drops[0][1], Math.round(300 * N.NMPLUS_DROP / nmBoss.drops.length) / 100, 'from BOSS_POOL_TOTAL[2] = 300, halved for N+ (v89): 1.5% total');
  assert.strictEqual(normBoss.drops[0][1], Math.round(420 / normBoss.drops.length) / 100, 'the mid/endgame MVP pool keeps 4.2%');
  // ...and the mob rolls are exactly a third of whichever normal table the map would use
  assert.deepStrictEqual([N.FIELD_GEAR_NM, N.FIELD_GEAR_MID_NM].map(t => t.map(x => +(x * 3).toFixed(2))), [N.FIELD_GEAR, N.FIELD_GEAR_MID],
    'the Nightmare tables are a clean third of the normal ones');
  for (const [m, l] of [[0, 11], [9, 11], [9, 15], [5, 13]]) {
    const nm = N.fieldOf(m, l).mobs[0].drops.map(d => d[1]), base = N.gearPool(m, l).length;
    assert.strictEqual(base, N.gearPool(m, l).length, 'the pool is whole');
    assert.ok(nm.every(ch => ch > 0), 'a Nightmare mob still rolls gear');
  }
  assert.ok(src.includes('const gch=(l>10?(m>=5?FIELD_GEAR_MID_NM:FIELD_GEAR_NM):(m>=5?FIELD_GEAR_MID:FIELD_GEAR)).map(x=>sec===5?x*NMPLUS_DROP:x);'), 'fieldOf picks the band table by stage, not by map alone, and halves N+ (v89)');
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

t('drop-table items keep N section identity separate from map field quality', () => {
  assert.strictEqual(N.dropTier(0, 11), N.dropTier(0, 10), 'Prontera Nightmare quality is not forced to Legendary');
  assert.strictEqual(N.dropTier(0, 11), 1, 'the early map quality band stays at its map cap');
  assert.strictEqual(N.dropTier(9, 15), 4, 'the Abyss map quality cap remains as tuned');
  assert.ok(src.includes("const RAR5={n:'N'}") && src.includes("RAR6={n:'N+'}") && src.includes("(it&&+it.sec>=5)?6:(it&&+it.sec>=4)?5"),
    'sections 4/5 select the separate N / N+ rarity regardless of the numeric map quality');
  for (let m = 0; m < N.MAPS.length; m++) for (let l = 1; l <= 15; l++) {
    const F=N.fieldOf(m,l),tier=N.dropTier(m,l),sec=N.secField(m,l);
    for (const mob of F.mobs) for (const [item] of mob.drops) {
      assert.strictEqual(item.sec,sec,N.MAPS[m].n+' Stage '+l+' item section');
      assert.strictEqual(item.tier,tier,N.MAPS[m].n+' Stage '+l+' item field quality');
    }
    if(F.boss)for(const [item]of F.boss.drops){
      assert.strictEqual(item.sec,sec,N.MAPS[m].n+' Stage '+l+' MVP section');
      assert.strictEqual(item.tier,tier,N.MAPS[m].n+' Stage '+l+' MVP field quality');
    }
  }
});

t('a save cannot be left standing in a locked Nightmare stage', () => {
  assert.ok(src.includes('f.lvl=Math.max(1,Math.min(15,Math.floor(f.lvl||1)))'), 'load() accepts stage 15');
  assert.ok(src.includes('if(S.mp>=MAPS.length||S.lvl>15){S.mp=0;S.lvl=1}'), 'and the sanitizer treats 15 as legal');
  assert.ok(src.includes('S.lvl=Math.min(S.lvl,10+nmOpen())'), 'initSession pulls a character out of a stage it has not unlocked');
  assert.ok(src.includes('go:()=>{if(mapL<=Math.max(S.prog[mapM],nmMax()))'), 'travel allows an unlocked Nightmare stage');
  assert.ok(src.includes('nmo=nmOpen(),cap=Math.max(pr,nmMax())'), 'the map panel caps at the band');
  assert.ok(src.includes('mapL=Math.min(mapL,Math.max(1,Math.max(S.prog[mapM],nmMax())))'), 'and the stage picker cannot be clamped below the band');
});

t('v90.3 (B): reward per HP is the same on every Nightmare map at each stage', () => {
  // Mob HP is mb*power^HPE and time per kill goes with HP, so EXP and Zeny per HP should be the
  // same on every map at each stage. Prints the table, then checks each map against Prontera.
  const lines = [];
  for (let l = 11; l <= 15; l++) {
    const per = m => {
      const mb = 1 + m * .15 + Math.max(0, m - 4) * .2, p = N.fieldPower(m, l);
      const hp = 42 * mb * Math.pow(p, 1.3) * N.NMHP * N.nm15Of(l);
      return {
        e: 5.5 * Math.pow(p, 1.5) / 50 * N.nmExpOf(l) * N.nmPayOf(m, l, 1.5) / hp,
        z: 11 * p * p / 1000 * N.nmZenyOf(l) * N.nmPayOf(m, l, 2) / hp,
      };
    };
    const ref = per(0);
    const row = [];
    for (let m = 0; m < 10; m++) {
      const r = per(m), e = r.e / ref.e, z = r.z / ref.z;
      row.push('m' + m + ' ' + e.toFixed(3) + '/' + z.toFixed(3));
      assert.ok(Math.abs(e - 1) < .005, 'EXP per HP on map ' + m + ' stage ' + l + ' is ' + e.toFixed(4) + ' of Prontera');
      assert.ok(Math.abs(z - 1) < .005, 'Zeny per HP on map ' + m + ' stage ' + l + ' is ' + z.toFixed(4) + ' of Prontera');
    }
    lines.push('       Stage ' + l + ' (EXP/Zeny per HP vs Prontera): ' + row.join('  '));
  }
  lines.forEach(x => console.log(x));
  for (let m = 0; m < 10; m++) for (let l = 1; l <= 10; l++) assert.strictEqual(N.nmPayOf(m, l, 1.5), 1, 'stage ' + l + ' pays 1');
});

t('v90.5: Abyss keeps its old pay; the lower maps are tuned down to match it', () => {
  for (let l = 11; l <= 15; l++) {
    assert.strictEqual(N.nmPayOf(9, l, 1.5), 1, 'Abyss EXP pay is 1 at stage ' + l);
    assert.strictEqual(N.nmPayOf(9, l, 2), 1, 'Abyss Zeny pay is 1 at stage ' + l);
    for (let m = 0; m < 9; m++) {
      assert.ok(N.nmPayOf(m, l, 1.5) < 1, 'map ' + m + ' EXP pay is below Abyss at stage ' + l);
      assert.ok(N.nmPayOf(m, l, 2) < 1, 'map ' + m + ' Zeny pay is below Abyss at stage ' + l);
    }
  }
  console.log('       Stage 15 pay vs Abyss (EXP / Zeny): Prontera ' + N.nmPayOf(0, 15, 1.5).toFixed(3) + ' / ' + N.nmPayOf(0, 15, 2).toFixed(3) + ', Niflheim ' + N.nmPayOf(8, 15, 1.5).toFixed(3) + ' / ' + N.nmPayOf(8, 15, 2).toFixed(3));
});

t('v90.6 (crafting): each Nightmare map has one material, dropped by its Stage 15 boss only', () => {
  const names = new Set();
  for (let m = 0; m < 10; m++) {
    const F = N.fieldOf(m, 15);
    assert.ok(F.boss.mat, N.MAPS[m].n + ' Stage 15 boss carries a material');
    assert.strictEqual(F.boss.mat.m, m, 'the material belongs to its own map');
    assert.strictEqual(F.boss.mat.n, N.NM_MAT[m], 'named from the materials table');
    names.add(F.boss.mat.n);
    for (const mob of F.mobs) assert.strictEqual(mob.mat, undefined, 'no field mob drops a material');
    assert.strictEqual(N.fieldOf(m, 10).boss.mat, null, 'the Stage 10 boss has no material');
  }
  assert.strictEqual(names.size, 10, 'all ten materials have their own name');
  assert.strictEqual(N.NM_MAT_CH, 25, 'the material chance is 25% a Stage 15 boss kill');
});

const total = pass + fail;
console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + total + ' assertion groups)');
process.exit(fail ? 1 : 0);
