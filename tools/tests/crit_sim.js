// The v73 crit rules (owner): LUK pays 0.25 a point with a flat base of 2, everything that comes
// from stats, skill passives, gear and card mastery is capped at 60% (and above 45% every further
// point counts half), and Index Crit - earned only by unlocking Hunt Titles - is the one source
// that lives outside that cap. All ten titles add up to +40, so a perfect Index puts a fully
// capped build on exactly 100% crit. High-level bosses also cut the crit chance rolled against
// them by their map's resistance.
//   node tools/tests/crit_sim.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('cannot find ' + a); return src.slice(i, j); };

const code = [
  pick(/const INDEX_CRIT=\[[^\]]*\];/, 'INDEX_CRIT ladder'),
  pick(/const indexCritBonus=[^\n]+/, 'indexCritBonus'),
  pick(/const indexCrit=[^\n]+/, 'indexCrit'),
  pick(/const INDEX_TITLES=\[[\s\S]*?\n\];/, 'INDEX_TITLES'),
  pick(/const indexRankForXp=[^\n]+/, 'indexRankForXp'),
  pick(/const indexExperience=[^\n]+/, 'indexExperience'),
  pick(/const BOSS_CRIT_RES=\[[^\]]*\],NM_CRIT_RES=\[[^\]]*\],bossCritRes=\(m,l\)=>[^;]+;/, 'boss crit resistance (+ the v76 Nightmare ladder)'),
  pick(/const crit=\(\)=>[^\n]*/, 'crit/flee/missCh'),
];
const harness = `
${code.join('\n')}
const safeCount = v => {const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(n))):0};
let PV = 0, BON = 0, CM = 0;
const S = { st:{luk:1,dex:1}, lv:1, indexXp:0, eq:{} };
const st = k => S.st[k] || 1, pv = k => PV, bon = k => BON, cardMasteryStat = k => CM;
this.__c = { crit, bossCritRes, indexCrit, indexCritBonus, INDEX_CRIT, INDEX_TITLES, BOSS_CRIT_RES, NM_CRIT_RES,
  set(pv, bon, cm, luk, xp){ PV = pv; BON = bon; CM = cm; S.st.luk = luk; S.indexXp = xp; } };
`;

const box = { console };
vm.createContext(box);
vm.runInContext(harness, box);
const C = box.__c;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('crit rate: the 60% cap, the soft stretch, Index Crit and boss resistance\n');

t('LUK pays 0.25 a point on top of a flat base of 2', () => {
  C.set(0, 0, 0, 1, 0);
  assert.strictEqual(C.crit(), 2.25, 'LUK 1 and nothing else');
  C.set(0, 0, 0, 99, 0);
  assert.strictEqual(C.crit(), 26.75, 'LUK 99 alone is a quarter of the old 39.6%');
  C.set(0, 0, 0, 120, 0);
  assert.strictEqual(C.crit(), 32, 'the elite LUK ceiling');
  assert.ok(!/st\('luk'\)\*\.4/.test(src), 'the old 0.4-per-LUK weight must be gone');
  assert.ok(!src.includes('Math.min(60,3+st('), 'the old flat-3 body must be gone');
});

t('every stat, skill, gear and mastery source stops at 60%, and above 45% each point counts half', () => {
  C.set(0, 0, 0, 4, 0);                       // 2 + 1 = 3
  assert.strictEqual(C.crit(), 3);
  C.set(0, 0, 0, 172, 0);                     // 2 + 43 = 45 exactly: no soft cap yet
  assert.strictEqual(C.crit(), 45);
  C.set(0, 0, 0, 200, 0);                     // 52 raw -> 45 + 7/2
  assert.strictEqual(C.crit(), 48.5, 'the stretch above 45% pays half');
  // a Lv70 crit build: LUK maxed (99) plus both Hunter/Sniper crit passives (+30) still falls short
  C.set(30, 0, 0, 99, 0);
  assert.ok(Math.abs(C.crit() - 50.875) < 1e-9, 'LUK 99 + Falconry/True Sight = 50.875%, not the cap');
  // no combination of capped sources may pass 60
  C.set(100000, 100000, 5, 120, 0);
  assert.strictEqual(C.crit(), 60, 'stats, skills, gear and card mastery alone can never pass 60%');
});

t('Index Crit is earned only from Hunt Titles and lifts the total towards 100%', () => {
  assert.strictEqual(C.INDEX_CRIT.length, C.INDEX_TITLES.length, 'one slice per title');
  assert.strictEqual(C.INDEX_CRIT.reduce((a, b) => a + b, 0), 40, 'the whole ladder is +40');
  assert.strictEqual(C.indexCritBonus(0), 0);
  assert.strictEqual(C.indexCritBonus(1), 1, 'Field Initiate is +1');
  assert.strictEqual(C.indexCritBonus(3), 4, 'the first three titles are +1/+1/+2');
  assert.strictEqual(C.indexCritBonus(10), 40, 'Valkyrie\'s Chosen completes the +40');
  assert.strictEqual(C.indexCritBonus(99), 40, 'and it cannot go higher');
  for (let i = 1; i < C.INDEX_CRIT.length; i++) assert.ok(C.indexCritBonus(i + 1) >= C.indexCritBonus(i), 'the ladder never goes down');
  // the last title needs 1,000,000 Index XP (about twenty species hunted to 50,000 kills)
  assert.strictEqual(C.INDEX_TITLES[C.INDEX_TITLES.length - 1].xp, 1000000);
  C.set(100000, 100000, 5, 120, 1000000);
  assert.strictEqual(C.crit(), 100, 'a capped build plus a complete Index is exactly 100%');
  C.set(100000, 100000, 5, 120, 999999999);
  assert.strictEqual(C.crit(), 100, 'and 100 is the ceiling');
  C.set(0, 0, 0, 1, 1000000);
  assert.strictEqual(C.crit(), 42.25, 'Index Crit rides on top of an otherwise empty build');
});

t('Index Crit is fed by the title ladder, never by gear or stats', () => {
  assert.ok(src.includes('const indexCrit=()=>(typeof indexRankForXp===') , 'indexCrit must read the Index rank');
  assert.ok(!/[^a-zA-Z]bon\('indexCrit'\)/.test(src) && !src.includes("'indexCrit'"), 'no gear affix or card may carry indexCrit');
  assert.ok(src.includes('const INDEX_CRIT=[1,1,2,2,3,4,5,6,7,9];'), 'the ladder is pinned');
  assert.ok(src.includes('Index Crit +${indexCrit()}% / +40%'), 'the Index panel shows the running total');
});

t('high-level bosses cut the crit chance rolled against them', () => {
  assert.strictEqual(C.BOSS_CRIT_RES.length, 10, 'one figure per map');
  [0, 1, 2, 3, 4].forEach(m => assert.strictEqual(C.bossCritRes(m), 0, 'maps 1-5 resist nothing'));
  // v74 (owner): the first ladder was too steep. -15/-15/-15/-20/-30 now.
  assert.strictEqual(C.bossCritRes(5), .15, 'Comodo');
  assert.strictEqual(C.bossCritRes(6), .15, 'Louyang');
  assert.strictEqual(C.bossCritRes(7), .15, 'Amatsu');
  assert.strictEqual(C.bossCritRes(8), .2, 'Niflheim');
  assert.strictEqual(C.bossCritRes(9), .3, 'Abyss');
  assert.deepStrictEqual(Array.from(C.BOSS_CRIT_RES), [0,0,0,0,0,.15,.15,.15,.2,.3], 'the whole ladder is pinned');
  // a capped 60% build crits those bosses 51 / 51 / 51 / 48 / 42 percent of the time
  assert.deepStrictEqual(Array.from(C.BOSS_CRIT_RES).slice(5).map(r => +(60 * (1 - r)).toFixed(1)), [51, 51, 51, 48, 42]);
  assert.ok(src.includes("Math.max(0,crit()*(1-(mob.critRes||0)))"), 'the live strike must apply the resistance');
  assert.ok(src.includes('drops:T.map(x=>[x,Math.round(BOSS_POOL_TOTAL[l>10?2:(m>=5?1:0)]/n)/100]),critRes:bossCritRes(m,l),'), 'every Stage-10 boss carries its map figure');
  // v76: the Nightmare band has its own, steeper ladder - the endgame walls the owner asked for
  assert.deepStrictEqual(Array.from(C.NM_CRIT_RES), [.35,.35,.36,.36,.38,.38,.4,.4,.42,.45], 'the Nightmare ladder is pinned');
  assert.strictEqual(C.bossCritRes(9, 15), .45, 'Nightmare Abyss Stage 15 cuts crit by 45%');
  assert.strictEqual(C.bossCritRes(0, 11), .35, 'Nightmare Prontera Stage 11 cuts 35%');
  assert.strictEqual(C.bossCritRes(9), .3, 'and the normal Abyss boss is untouched');
  assert.deepStrictEqual(Array.from(C.NM_CRIT_RES).map(r => +(60 * (1 - r)).toFixed(1)), [39, 39, 38.4, 38.4, 37.2, 37.2, 36, 36, 34.8, 33], 'a capped 60% build crits a Nightmare boss 33-39% of the time');
  assert.ok(src.includes('critRes:bossCritRes(m,l)') && src.includes('offlineMobForCurrentField'), 'offline boss kills carry the band figure too');
  // the real strike() rolls against the reduced chance
  const strikeBox = {};
  vm.createContext(strikeBox);
  vm.runInContext(`
    let mob={x:1,z:3,hp:1e9,size:1,critRes:.3},shake=0,hit=null,S={dmg:0};
    const missCh=()=>0,crit=()=>50,atk=()=>100,matk=()=>200,st=()=>0,critD=()=>2,
      rnd=(a,b)=>a,addFloat=()=>{},damageFloat=(...a)=>{hit=a},
      showDamage=(o,x,y,z,a,c,sk)=>damageFloat(x,y,z,a,c,false,sk),mobDamageY=()=>1.9;
    ${grab('function strike(mult,col,magic=false,skill=false){', '// Higher job tiers get more casts per swing:')}
    Math.random=()=>.4;
    strike(1,'#fff');
    this.__res=shake;
  `, strikeBox);
  assert.strictEqual(strikeBox.__res, 2, 'a 40% die beats a 50% crit, but not 50% x (1-0.30) = 35%');
  vm.runInContext('mob.critRes=0;Math.random=()=>.4;strike(1,"#fff");this.__res=shake;', strikeBox);
  assert.strictEqual(strikeBox.__res, 6, 'without the resistance the same die is a critical');
  assert.ok(src.includes('const BOSS_CRIT_RES=[0,0,0,0,0,.15,.15,.15,.2,.3]'), 'the live ladder is pinned in the game source');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
