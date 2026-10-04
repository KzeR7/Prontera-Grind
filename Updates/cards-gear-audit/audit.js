// Cards & equipment power audit  (dev tool, nothing in here ships to the player)
//   node Updates/cards-gear-audit/audit.js
//
// It pulls the REAL card/gear/stat formulas out of index.html by string boundary (the same
// technique the test suites use - see tools/tests/gear_sim.js and pet_sim.js), so every number
// printed here is the live game's number, not a re-derived copy. Passives from the skill tree are
// included (the SKILLS array is lifted whole); pets, buffs and tradeoffs are not.
//
// Math.random inside the sandbox is a fixed LCG, so two runs of the same fixture roll the SAME
// gear (item for item) - that is what makes "gear" and "gear + cards" a paired comparison.
//
// What it answers:
//   1. what each card is worth, grade by grade
//   2. what a drop's value/affixes are worth, tier by tier
//   3. at endgame, how much of the character's power comes from level+stats vs gear vs cards
//   4. the same at ten level milestones, with and without a full 7-slot set
//   5. what the drop faucet actually feeds the player
//   6. what a set of candidate nerfs would do (PATCHES rewrites the extracted source)
const fs = require('fs'), vm = require('vm'), path = require('path');
// Defaults to the working copy. Set AUDIT_HTML to measure another build - that is how the
// historical sheets (picks-check.js / neutral.js) are re-run against a pre-v38 index.html copy,
// because their patch list describes that build's source strings.
const FILE = process.env.AUDIT_HTML || path.join(__dirname, '..', '..', 'index.html');
const src = fs.readFileSync(FILE, 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

const code = [
  pick(/const SU=k=>[^\n]*HPK=\d+,HPE=[\d.]+/, 'HPK/HPE'),
  grab('const CD=[', 'const pm=s=>'),                 // CLASSES, lineOf, act/pas/tos, the whole SKILLS array
  pick(/const C=\(\)=>[^;]+;/, 'C()'),
  pick(/const items=\(\)=>[^\n]*/, 'items/ev/iname/eqv'),
  pick(/const bon=k=>\{[^\n]*/, 'bon()'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'st/canUse'),
  grab('const maxHp=\(\)=>', 'const totalPts=\(\)=>'), // maxHp/atk/matk/aspd/crit/flee/missCh/def/mdef/critD/needAt
  pick(/const totalPts=\(\)=>\{[^\n]*/, 'totalPts'),
  pick(/const RAR=\[[^\]]*\];/, 'RAR'),
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'AM/GRADE/GI/CV'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AFF/AB'),
  pick(/const AL=\{[^}]*\};/, 'AL'),
  pick(/K5=\[[^\]]*\];/, 'K5'),
  pick(/const cardVal=\(g,st\)=>[^;]+;/, 'cardVal'),
  pick(/const cardStat=\(g,seed\)=>\{[^}]*\};/, 'cardStat'),
  pick(/const CFIT=\{[^}]*\}/, 'CFIT'),
  pick(/const MAPTIER=\[[^\]]*\];/, 'MAPTIER'),
  pick(/const dropTier=\(m,l\)=>[^;]+;/, 'dropTier'),
  pick(/const secOf=[^;]+;/, 'secOf'),
  // secField() is v38 (the Comodo cliff floor). A pre-v38 file has no such function and does not
  // call one, so the fallback keeps the historical AUDIT_HTML baselines runnable.
  /const secField=\(m,l\)=>[^;]+;/.test(src) ? src.match(/const secField=\(m,l\)=>[^;]+;/)[0] : 'const secField=(m,l)=>secOf(l);',
  pick(/const sellVal=it=>[^;]+;/, 'sellVal'),
  pick(/const refCost=it=>[^;,]+/, 'refCost'),
  pick(/refCh=it=>\[[^\]]*\]\[it\.r\|\|0\]/, 'refCh'),
  pick(/const SKSLOTS=t=>[^;]+;/, 'SKSLOTS'),
  'const MOB_SPRITES={},MOB_SIZE_BY_ID={},MOB_SIZE_SCALE={Small:.62,Medium:.92,Large:1.28};',
  'const pm=s=>{const[n,c,sh]=String(s).split(":");return{n,c:parseInt(c,16)||0,shape:sh}};',
  grab('const EXPK=', 'const JOFF='),                  // EXPK/BOSEK/ZK/BZK/QZ/QXP and the needAt constants
  grab('const G=(w,a,h,o,l,ac,ac2)=>', 'const pw=()=>'),
  grab('const starterStage=(m,l)=>', 'function spawn('),  // starterStage / starterHp / starterAtk
  grab('function gearPool(m,l){', 'const dropTxt='),      // gearPool / fieldOf
  grab('function genGear(T,l,sec,boss,tier){', '// ---------- skill effects'),
].join('\n');

// ---- run the extracted game code in a sandbox, with optional source patches ----------------
function build(patches = []) {
  let patched = code;
  const applied = [];
  for (const [from, to, label] of patches) {
    if (!patched.includes(from)) throw new Error('patch target not found: ' + label);
    patched = patched.replace(from, to);
    applied.push(label);
  }
  const harness = `
${patched}
const SLOTS={weapon:{label:'Weapon',stat:'ATK'},armor:{label:'Armor',stat:'DEF'},head:{label:'Headgear',stat:'HP'},
  off:{label:'Shield',stat:'DEF'},leg:{label:'Legwear',stat:'DEF'},acc:{label:'Accessory',stat:'HP'}};
let __seed=20261004;
Math.random=()=>((__seed=(__seed*1103515245+12345)>>>0)/4294967296);   // reproducible rolls
const rnd=(a,b)=>a+Math.random()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
let S=null;
const skillOn=()=>true;   // every skill a fixture writes into S.sk is "learned and on"
const pv=k=>SKILLS.reduce((a,s)=>a+(s.type==='pas'&&s.key===k&&skillOn(s.id)?s.f(lv(s.id)):0),0);
const petBuff={atk:0,matk:0,hp:0,leech:0},tb={},collDmg=()=>0,playedClasses=()=>0;
this.__x={ MAPS,GEAR,gearPool,fieldOf,genGear,atk,matk,aspd,crit,critD,def,mdef,maxHp,flee,missCh,st,bon,items,ev,iname,eqv,C,
  CLASSES,lineOf,SKILLS,CV,AB,AFF,K5,AL,CFIT,GRADE,GI,RAR,AM,MAPTIER,dropTier,secOf,
  cardVal,cardStat,sellVal,refCost,refCh,totalPts,needAt,HPK,HPE,EXPK,starterStage,starterHp,starterAtk,SKSLOTS,pv,
  reseed:n=>{__seed=n},
  set S(v){S=v}, get S(){return S} };
`;
  const sb = { console };
  vm.createContext(sb); vm.runInContext(harness, sb);
  sb.__x.patches = applied;
  return sb.__x;
}
const X = build();
const f = n => n.toLocaleString('en-US');
const pct = (n, d = 1) => (n * 100).toFixed(d) + '%';

// ============================================================ fixture helpers
const mkSet = (Y, lvl, sec, tier, r, cards) => {
  const one = (T, slot) => { const it = Y.genGear(T, lvl, sec, false, tier); it.r = r; it.slot = slot; return it; };
  const set = {
    weapon: one({ k: 'sword', n: 'Weapon' }, 'weapon'), armor: one({ k: 'armor', n: 'Armor' }, 'armor'),
    head: one({ k: 'head', n: 'Headgear' }, 'head'), off: one({ k: 'off', n: 'Shield' }, 'off'),
    leg: one({ k: 'leg', n: 'Legwear' }, 'leg'), acc1: one({ k: 'acc', n: 'Acc1' }, 'acc'), acc2: one({ k: 'acc', n: 'Acc2' }, 'acc'),
  };
  for (const [slot, c] of cards || []) (set[slot].cards = set[slot].cards || []).push(c);
  return set;
};
// spend totalPts(lv) on main -> luk -> agi -> vit -> dex -> int, respecting the pre-100 cap
function alloc(Y, lv, cls = 'Lord Knight') {
  const main = Y.CLASSES[cls].main, order = [main, 'luk', 'agi', 'vit', 'dex', 'int'].filter((v, i, a) => a.indexOf(v) === i);
  const cap = lv >= 100 ? 120 : 99, st = { str: 1, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 };
  Y.S = { lv };                       // totalPts() reads S.lv
  let left = Y.totalPts(lv);
  const cost = v => v < 100 ? 1 + Math.floor((v - 1) / 10) : 10 + (v - 100);
  // a real build: fill the line's main stat to the cap, then LUK, then AGI, then whatever is left
  // (this is the "exactly three stats maxed at Lv150" shape the stat suite pins)
  for (const k of order) while (st[k] < cap && left >= cost(st[k])) { left -= cost(st[k]); st[k]++; }
  return st;
}
function fixture(Y, lv, cls = 'Lord Knight', gear = null) {
  const sk = {}; Y.SKILLS.forEach(s => { if (Y.lineOf(cls).includes(s.from)) sk[s.id] = s.max; });
  return { cls, sex: 'm', hair: 0, lv, exp: 0, hp: 1, zeny: 0, kills: 0, pts: 0, mp: 0, lvl: 5, kl: 0,
    gmx: 100, gm: false, st: alloc(Y, lv, cls), sk, skOff: {}, jobs: {}, base: {}, prog: [],
    eq: Object.assign({ weapon: null, armor: null, head: null, off: null, leg: null, acc1: null, acc2: null, weapon2: null }, gear || {}),
    inv: [], cards: [], pets: [], ore: { ori: 0, elu: 0 }, q: [] };
}
const autoDps = Y => Y.atk() * (1 / Y.aspd()) * (1 + Math.min(1, Y.crit() / 100) * (Y.critD() - 1));
const mb = m => 1 + m * .15 + Math.max(0, m - 4) * .2;
function mobStat(Y, m, stage) {                  // mirrors spawn()'s numbers (see index.html)
  const l = Y.MAPS[m].b + stage, M = mb(m), early = Y.starterStage(m, stage);
  const hp = early ? Math.min(Y.starterHp(stage), Math.floor(Y.HPK * M * Math.pow(l, Y.HPE))) : Math.floor(Y.HPK * M * Math.pow(l, Y.HPE));
  return { l, hp, atk: early ? Y.starterAtk(stage) : Math.floor((5 + l * 4.6) * M) };
}
const bossStat = (Y, m, stage) => { const l = Y.MAPS[m].b + stage, M = mb(m); return { l, hp: Math.floor(500 * M * Math.pow(l, Y.HPE)), atk: Math.floor((8 + l * 6.5) * M) }; };
const incoming = (Y, atk) => { const d = Y.def() * .6; return [Math.max(1, Math.round(atk * .8 - d)), Math.max(1, Math.round(atk * 1.2 - d))]; };

// average one scenario over N seeded sets: returns mean stats + the spread of ATK
function measure(Y, fieldLvl, sec, tier, r, cards, N = 200, cls = 'Lord Knight', charLvl = 150) {
  const acc = { atk: 0, dps: 0, def: 0, hp: 0, crit: 0, val: 0, bonAtk: 0, min: Infinity, max: 0 };
  for (let i = 0; i < N; i++) {
    Y.reseed(90001 + i * 7919);
    const set = mkSet(Y, fieldLvl, sec, tier, r, typeof cards === 'function' ? cards(Y, fieldLvl, sec, tier, r) : cards);
    const S = fixture(Y, charLvl, cls, set); Y.S = S; S.hp = Y.maxHp();
    const a = Y.atk();
    acc.atk += a; acc.dps += autoDps(Y); acc.def += Y.def(); acc.hp += Y.maxHp(); acc.crit += Y.crit();
    acc.val += ['weapon', 'armor', 'head', 'off', 'leg', 'acc1', 'acc2'].reduce((x, s) => x + Y.ev(S.eq[s]), 0);
    acc.bonAtk += Y.bon('atk'); acc.min = Math.min(acc.min, a); acc.max = Math.max(acc.max, a);
  }
  Object.keys(acc).forEach(k => { if (k !== 'min' && k !== 'max') acc[k] /= N; });
  return acc;
}
const cardsIn = (Y, g, stat) => () => {
  const c = () => ({ id: 1, n: 'x', g, stat, v: Y.cardVal(g, stat) });
  return [['weapon', c()], ['weapon', c()], ['weapon', c()], ['armor', c()], ['head', c()], ['off', c()], ['leg', c()], ['acc1', c()], ['acc2', c()]];
};

console.log('cards & equipment power audit  -  formulas lifted from index.html\n');

// ============================================================ 1. cards
console.log('='.repeat(100));
console.log('1. CARD VALUES  (cardVal(g,stat) = round(CV[g] * AB[stat]))');
console.log('='.repeat(100));
console.log('grade       CV' + X.AFF.map(k => X.AL[k].padStart(12)).join(''));
X.GRADE.forEach((g, i) => {
  console.log(g.padEnd(11) + String(X.CV[i]).padEnd(4) + X.AFF.map(k => String(X.cardVal(i, k)).padStart(10)).join(''));
});
console.log('\npool: Common/Uncommon roll only ' + X.K5.join('/') + '   |   Rare/Legendary roll all ' + X.AFF.length + ' stats');
console.log('a card fits ONE group (CFIT): ' + Object.entries(X.CFIT).map(([k, v]) => k + '->' + v).join(' '));
console.log('\nwhere each grade drops (fieldOf): stages 1-3 Common, 4-7 Uncommon, 8-9 Rare; Stage-10 boss Legendary');
[X.fieldOf(0, 1).mobs[0], X.fieldOf(9, 8).mobs[0]].forEach(m => console.log('  field card: ' + X.GRADE[m.card.g].padEnd(11) + m.cardCh + '% per kill'));
console.log('  boss  card: ' + X.GRADE[X.fieldOf(9, 10).boss.card.g].padEnd(11) + X.fieldOf(9, 10).boss.cardCh + '% per boss kill');
console.log('  the rate never changes with stage or map - only the grade does');
console.log('\nwhat stat each map\'s boss card actually rolls (cardStat(3,m) - it is FIXED per map):');
console.log('  ' + [0,1,2,3,4,5,6,7,8,9].map(m => X.MAPS[m].n.slice(0,9) + '=' + X.cardStat(3, m)).join('  '));
console.log('  field (mob) cards are fixed too: per map + stage + mob, e.g. map 6 stage 8 mobs roll ' +
  X.AFF.map((_, i) => i).length + ' stat slots seeded by (map*10+stage+mob).');


// one card, socketed into an otherwise card-free endgame set: what does ONE card actually do?
console.log('\none card, measured on a Lv150 +10 Legendary set (auto-attack DPS change, same set each time):');
{
  X.reseed(90001);
  const baseSet = JSON.stringify(mkSet(X, 99, 3, 4, 10, null));
  const run = (g, stat, where) => {
    const S = fixture(X, 150, 'Lord Knight', JSON.parse(baseSet)); X.S = S;
    if (stat) (S.eq[where].cards = S.eq[where].cards || []).push({ id: 1, n: 'c', g, stat, v: X.cardVal(g, stat) });
    S.hp = X.maxHp();
    return { dps: autoDps(X), atk: X.atk(), hp: X.maxHp(), crit: X.crit(), critD: X.critD() };
  };
  const b = run();
  console.log('  base (no cards): DPS ' + f(Math.round(b.dps)) + ', ATK ' + f(b.atk) + ', maxHP ' + f(b.hp) +
    ', crit ' + b.crit.toFixed(0) + '% at x' + b.critD.toFixed(2) + ' crit damage');
  console.log('\n  stat        fits      g0      g1      g2      g3    the g3 card is');
  X.AFF.forEach(stat => {
    const where = X.CFIT[stat] === 'weapon' ? 'weapon' : X.CFIT[stat] === 'acc' ? 'acc1' : X.CFIT[stat] === 'head' ? 'head' : 'armor';
    const cells = [0, 1, 2, 3].map(g => (run(g, stat, where).dps / b.dps - 1) * 100);
    const r3 = run(3, stat, where);
    const what = stat === 'hp' ? '+' + f(X.cardVal(3, 'hp')) + ' max HP (that is ' + ((X.cardVal(3, 'hp') / b.hp) * 100).toFixed(1) + '% of the bar)'
      : stat === 'crit' && b.crit >= 60 ? '+' + X.cardVal(3, 'crit') + ' crit, but the 60% cap is already reached'
      : '+' + X.cardVal(3, stat) + ' ' + X.AL[stat];
    console.log('  ' + X.AL[stat].padEnd(11) + where.padEnd(9) + cells.map(c => ((c >= 0 ? '+' : '') + c.toFixed(1) + '%').padStart(7)).join('') + '   ' + what);
  });
  console.log('  (the g3 column here is the SAME 9-slot set with seven cards missing - the first three rows are');
  console.log('   a single card in the weapon; see section 3 for a full set of nine)');
}

console.log('\n' + '='.repeat(100));
console.log('2. EQUIPMENT: flat value and affixes');
console.log('='.repeat(100));
// The flat bases are lifted from genGear() itself, so this table can never drift from the game.
const base = JSON.parse(src.match(/\{weapon:\d+,armor:\d+,head:\d+,off:\d+,leg:\d+,acc:\d+\}/)[0].replace(/([a-z]+):/g, '"$1":'));
console.log('val = base x section[1/2.2/4/7] x (1 + lvl*0.15) x RAR[tier].m   ->   ev() = val x (1 + refine*0.15)');
console.log('\nflat "val" of one drop, level 99, high-tier section (3), before refine:');
console.log('slot      base  ' + X.RAR.map(r => (r.n + ' x' + r.m).padStart(15)).join(''));
['weapon', 'head', 'acc', 'armor', 'leg', 'off'].forEach(slot => {
  console.log('  ' + (slot === 'off' ? 'shield' : slot).padEnd(8) + String(base[slot]).padEnd(6) +
    X.RAR.map(r => f(Math.round(base[slot] * 7 * (1 + 99 * .15) * r.m)).padStart(15)).join(''));
});
console.log('  weapon/armor/shield/legwear feed ATK/DEF; headgear feeds maxHp x4; accessories feed maxHp x3');
console.log('\nAFFIX scale af = (1 + section) x AM[tier]:');
console.log('tier        AM   ' + [0, 1, 2, 3].map(s => ('sec' + s).padStart(9)).join('') + '   affixes per item');
X.AM.forEach((am, t) => {
  const n = [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3]][t];
  console.log('  ' + X.RAR[t].n.padEnd(11) + String(am).padEnd(5) +
    [0, 1, 2, 3].map(s => ((1 + s) * am).toFixed(2).padStart(9)).join('') + '   ' + n[0] + (n[0] === n[1] ? '' : '-' + n[1]));
});
console.log('\naffix value = round(af x AB[stat] x rnd(0.8,1.25)); expected value shown (x1.025):');
console.log('stat         ' + ['sec0-3 Common', 'sec1-2', 'sec2-3 Rare', 'sec3 Epic', 'sec3 Legendary'].map(s => s.padStart(15)).join(''));
// Weights come from the file's own AB table (v38 cut cdm 1.5 -> 0.7) and the magnitudes from AM.
['atk', 'aspd', 'crit', 'luk', 'cdm', 'hp'].forEach(name => {
  const w = X.AB[name];
  // af = (1 + section) x AM[tier] -- the (1 + ...) is easy to drop: writing 'AM * sec' instead
  // understated the top three columns by 50% until 2026-10-04.
  const cells = [[0, X.AM[0]], [1, X.AM[1]], [2, X.AM[2]], [3, X.AM[3]], [3, X.AM[4]]]
    .map(([sec, am]) => Math.round((1 + sec) * am * w * 1.025));
  console.log('  ' + X.AL[name].padEnd(11) + cells.map(c => f(c).padStart(15)).join(''));
});
console.log('  ("sec3 Epic" = Amatsu/Niflheim/Abyss field drop; "sec3 Legendary" = Stage-10 boss drop)');
console.log('\n=> ONE endgame legendary drop can carry 3 affixes, and every one of the seven slots');
console.log('   rolls from the same pool, so the same percentage stat can stack seven times.');

// ============================================================ 3. endgame decomposition
console.log('\n' + '='.repeat(100));
console.log('3. ENDGAME  (Lord Knight Lv150, 120/120/120, all line passives, avg of 200 rolled sets)');
console.log('='.repeat(100));
const N = 200;
const scen = [
  ['naked (no gear, no cards)', null, null],
  ['Epic field set, +0', { sec: 3, tier: 3, r: 0 }, null],
  ['Epic field set, +10', { sec: 3, tier: 3, r: 10 }, null],
  ['Legendary boss set, +5', { sec: 3, tier: 4, r: 5 }, null],
  ['Legendary boss set, +10', { sec: 3, tier: 4, r: 10 }, null],
  ['  + 9 Legendary ATK cards', { sec: 3, tier: 4, r: 10 }, cardsIn(X, 3, 'atk')],
  ['  + 9 Legendary ASPD cards', { sec: 3, tier: 4, r: 10 }, cardsIn(X, 3, 'aspd')],
  ['  + 9 Legendary CRIT cards', { sec: 3, tier: 4, r: 10 }, cardsIn(X, 3, 'crit')],
  ['  + 9 Legendary CDM cards', { sec: 3, tier: 4, r: 10 }, cardsIn(X, 3, 'cdm')],
];
const res = scen.map(([label, g, cards]) => {
  const r = g ? measure(X, 99, g.sec, g.tier, g.r, cards, N) : measure(X, 150, 3, 3, 0, null, N);
  if (!g) { // naked: same for every roll
    const S = fixture(X, 150, 'Lord Knight', null); X.S = S; S.hp = X.maxHp();
    r.atk = X.atk(); r.dps = autoDps(X); r.def = X.def(); r.hp = X.maxHp(); r.crit = X.crit(); r.val = 0; r.bonAtk = 0; r.min = r.max = r.atk;
  }
  return { label, ...r };
});
console.log('scenario                            ATK       DEF      MAX HP    crit  auto-DPS      gear val  affix ATK%');
res.forEach(r => console.log('  ' + r.label.padEnd(33) + f(Math.round(r.atk)).padStart(8) + f(Math.round(r.def)).padStart(10) +
  f(Math.round(r.hp)).padStart(12) + (pct(Math.min(1, r.crit / 100), 0)).padStart(6) + f(Math.round(r.dps)).padStart(12) +
  f(Math.round(r.val)).padStart(11) + ('+' + r.bonAtk.toFixed(0) + '%').padStart(11)));
const at = lbl => res.findIndex(r => r.label === lbl);
const naked = res[at('naked (no gear, no cards)')];
console.log('\nvs naked:');
res.slice(1).forEach(r => console.log('  ' + r.label.padEnd(33) + 'ATK x' + (r.atk / naked.atk).toFixed(1).padStart(5) +
  '   auto-DPS x' + (r.dps / naked.dps).toFixed(1).padStart(5) + '   maxHP x' + (r.hp / naked.hp).toFixed(1).padStart(5) +
  '   DEF +' + f(Math.round(r.def - naked.def)).padStart(8)));
console.log('\nspread across the 200 rolled sets (the affix lottery, Epic field set +10): ATK ' +
  f(Math.round(res[2].min)) + ' - ' + f(Math.round(res[2].max)) + '  (mean ' + f(Math.round(res[2].atk)) + ')');
console.log('\nwhere the ATK comes from at the top end (one seeded Legendary set, no cards, then with the cards):');
const detail = (Y, withCards) => {
  Y.reseed(90001);
  const set = mkSet(Y, 99, 3, 4, 10, withCards ? cardsIn(Y, 3, 'atk')() : null);
  const S = fixture(Y, 150, 'Lord Knight', set); Y.S = S; S.hp = Y.maxHp();
  const st = S.st, flatBase = 4 + 150 * 2 + Y.st('str') * 1.5 + (Y.st('dex') + Y.st('luk')) * .25;
  return { S, Y, atk: Y.atk(), dps: autoDps(Y), flatBase, weapon: Y.ev(S.eq.weapon),
    pvAtk: Y.pv('atk'), affAtk: Y.bon('atk') - (withCards ? 3 * Y.cardVal(3, 'atk') + 6 * Y.cardVal(3, 'atk') : 0),
    cardAtk: withCards ? 9 * Y.cardVal(3, 'atk') : 0, def: Y.def(), hp: Y.maxHp(), crit: Y.crit(), critD: Y.critD(), aspd: Y.aspd() };
};
{
  const a = detail(X, false);
  console.log('  level + stats (no gear)            ' + f(Math.round(a.flatBase)).padStart(9));
  console.log('  weapon flat val (ev at +10)        ' + f(Math.round(a.weapon)).padStart(9) + '   <- 19x the whole stat contribution');
  console.log('  class multiplier                   ' + ('x' + X.C().atk).padStart(9) + '   ' + a.S.cls);
  console.log('  passive skills                     ' + ('+' + a.pvAtk + '%').padStart(9));
  console.log('  gear affixes (7 slots)             ' + ('+' + a.affAtk.toFixed(0) + '%').padStart(9));
  console.log('  legendary ATK cards (9)            ' + ('+' + a.cardAtk + '%').padStart(9));
  const b = detail(X, true);
  console.log('  -> ATK ' + f(a.atk) + ' -> ' + f(b.atk) + ' with the nine legendary ATK cards (+' + pct(b.atk / a.atk - 1, 1) + ')');
  console.log('     the weapon alone is ' + pct(a.weapon / (a.flatBase + a.weapon), 1) + ' of the ATK before the class/percentage multipliers');
  console.log('     crit ' + a.crit.toFixed(0) + '% at x' + a.critD.toFixed(2) + ' crit damage, ' + (1 / a.aspd).toFixed(2) + ' swings/s');
}
console.log('\ncombat effect on the Abyss stage-10 field: mob HP ' + f(mobStat(X, 9, 10).hp) +
  ', boss HP ' + f(bossStat(X, 9, 10).hp) + '   (auto-attacks only; mob ATK ' + f(mobStat(X, 9, 10).atk) + ', boss ATK ' + f(bossStat(X, 9, 10).atk) + ')');
const secs = (hp, dps) => (hp / dps);
[at('naked (no gear, no cards)'), at('Epic field set, +10'), at('Legendary boss set, +10'), at('Legendary boss set, +10') + 1].forEach(i => {
  const r = res[i], mob = mobStat(X, 9, 10), boss = bossStat(X, 9, 10);
  console.log('  ' + r.label.padEnd(30) + 'mob dies in ' + secs(mob.hp, r.dps).toFixed(2).padStart(6) + 's' +
    '   pack of 3 in ' + (secs(mob.hp, r.dps) * 3).toFixed(1).padStart(5) + 's' +
    '   boss in ' + secs(boss.hp, r.dps).toFixed(1).padStart(6) + 's   (' + (r.dps / mob.hp).toFixed(2) + ' mobs/s)');
});

console.log('\nincoming damage (the SHIPPED v38 line: def/(def+4000) capped at 75%, floored at 1):');
[at('naked (no gear, no cards)'), at('Epic field set, +10'), at('Legendary boss set, +10')].forEach(i => {
  const r = res[i], mob = mobStat(X, 9, 10), boss = bossStat(X, 9, 10);
  // pre-v38 this was `atk - def*.6` floored at 1, which made every geared character immune.
  const inc = atk => { const c = Math.min(.75, r.def / (r.def + 4000)); return [Math.max(1, Math.round(atk * .8 * (1 - c))), Math.max(1, Math.round(atk * 1.2 * (1 - c)))]; };
  console.log('  ' + r.label.padEnd(30) + 'DEF ' + f(Math.round(r.def)).padStart(7) + '  mob hits for ' +
    inc(mob.atk).join('-').padStart(9) + '   boss hits for ' + inc(boss.atk).join('-'));
});

// ============================================================ 3b. the waterfall
// Peel the layers off ONE maxed endgame character, one at a time, and report DPS at each step.
// That is the "where does the power come from" table: level+stats -> skills -> gear flat value ->
// refine -> affixes -> cards. Averaged over 200 seeded Legendary sets.
console.log('\n' + '='.repeat(100));
console.log('3b. THE WATERFALL  (Lord Knight Lv150 + 120/120/120, one layer at a time, avg of 200 sets)');
console.log('='.repeat(100));
{
  const strip = set => { for (const k in set) set[k].aff = []; return set; };
  const build = (opts) => {
    const acc = { dps: 0, atk: 0, def: 0, hp: 0 };
    for (let i = 0; i < 200; i++) {
      X.reseed(90001 + i * 7919);
      let set = null;
      if (opts.gear) {
        set = mkSet(X, 99, 3, 4, opts.refine === undefined ? 10 : opts.refine, null);
        if (opts.noAff) strip(set);
        if (opts.cards) for (const [slot, c] of cardsIn(X, 3, 'atk')()) set[slot].cards = (set[slot].cards || []).concat([c]);
      }
      const S = fixture(X, 150, 'Lord Knight', set);
      if (opts.noSkills) S.sk = { aid: 1 };
      X.S = S; S.hp = X.maxHp();
      acc.dps += autoDps(X); acc.atk += X.atk(); acc.def += X.def(); acc.hp += X.maxHp();
    }
    ['dps', 'atk', 'def', 'hp'].forEach(k => acc[k] /= 200);
    return acc;
  };
  const steps = [
    ['1. level 150 + stats only (no skills, no gear)', build({ noSkills: true })],
    ['2. + skill passives', build({})],
    ['3. + gear flat value (+0, affixes removed)', build({ gear: 1, refine: 0, noAff: 1 })],
    ['4. + refine to +10', build({ gear: 1, refine: 10, noAff: 1 })],
    ['5. + affixes (2-3 per item)', build({ gear: 1, refine: 10 })],
    ['6. + nine Legendary ATK cards', build({ gear: 1, refine: 10, cards: 1 })],
  ];
  const base = steps[0][1];
  console.log('step                                         auto-DPS   x step 1        ATK        DEF      MAX HP');
  steps.forEach(([label, r], i) => {
    const prev = i ? steps[i - 1][1].dps : r.dps;
    console.log('  ' + label.padEnd(44) + f(Math.round(r.dps)).padStart(10) + ('x' + (r.dps / base.dps).toFixed(1)).padStart(10) +
      f(Math.round(r.atk)).padStart(11) + f(Math.round(r.def)).padStart(11) + f(Math.round(r.hp)).padStart(12) +
      (i ? '   this layer x' + (r.dps / prev).toFixed(2) : ''));
  });
  console.log('\n  level + stats = 1 unit of power; everything you DROP adds ' +
    (steps[5][1].dps / base.dps).toFixed(0) + ' units on top of it.');
  console.log('  gear flat value x' + (steps[2][1].dps / steps[1][1].dps).toFixed(1) +
    '  ->  refine x' + (steps[3][1].dps / steps[2][1].dps).toFixed(1) +
    '  ->  affixes x' + (steps[4][1].dps / steps[3][1].dps).toFixed(2) +
    '  ->  cards x' + (steps[5][1].dps / steps[4][1].dps).toFixed(2));
  console.log('  (DEF is why nothing can hurt you: every hit subtracts def*0.6, floored at 1)');
}

// ============================================================ 4. milestones
console.log('\n' + '='.repeat(100));
console.log('4. MILESTONES  (stage-5 field, level = middle of the map band, drops at that field level)');
console.log('='.repeat(100));
console.log('map          lvl  sec  tier        ATK naked   ATK geared  DPS naked   DPS geared   gear x   +9 lg cards  cards x   mob HP     kills in (naked/geared)s');
[6, 17, 27, 39, 52, 63, 70, 77, 85, 95].forEach((lv, m) => {
  const stage = 5, sec = m >= 5 ? 3 : X.secOf(stage), tier = X.dropTier(m, stage);
  const nakedS = fixture(X, lv, 'Lord Knight', null); X.S = nakedS; const dN = autoDps(X), aN = X.atk();
  const dropLvl = X.MAPS[m].b + stage;
  const g = measure(X, dropLvl, sec, tier, 0, null, 60, 'Lord Knight', lv);
  const gc = measure(X, dropLvl, sec, tier, 0, cardsIn(X, 3, 'atk'), 60, 'Lord Knight', lv);
  const mob = mobStat(X, m, stage);
  console.log('  ' + X.MAPS[m].n.padEnd(11) + String(lv).padEnd(5) + String(sec).padEnd(5) + X.RAR[tier].n.padEnd(11) +
    f(aN).padStart(10) + f(Math.round(g.atk)).padStart(13) + f(Math.round(dN)).padStart(12) + f(Math.round(g.dps)).padStart(13) +
    ('x' + (g.dps / dN).toFixed(1)).padStart(9) + f(Math.round(gc.dps)).padStart(13) + ('x' + (gc.dps / g.dps).toFixed(2)).padStart(9) +
    f(mob.hp).padStart(11) + ('  ' + (mob.hp / dN).toFixed(1) + ' / ' + (mob.hp / g.dps).toFixed(1)).padStart(17));
});

// ============================================================ 5. faucet
console.log('\n' + '='.repeat(100));
console.log('5. THE DROP FAUCET');
console.log('='.repeat(100));
[0, 4, 6, 9].forEach(m => {
  const F = X.fieldOf(m, 1);
  console.log('  ' + X.MAPS[m].n.padEnd(10) + 'stage 1: ' + String(X.gearPool(m, 1).length).padStart(2) + ' items in the pool, 3 gear rolls per kill at ' +
    F.mobs[0].drops.map(d => d[1] + '%').join('/') + ' = ' + F.mobs[0].drops.reduce((a, d) => a + d[1], 0).toFixed(1) + '% per kill');
});
{ const F = X.fieldOf(9, 10);
  console.log('  Abyss      stage 10: boss drops the whole pool (' + F.boss.drops.length + ' items) at ' + F.boss.drops[0][1] + '% each = ' +
    F.boss.drops.reduce((a, d) => a + d[1], 0).toFixed(1) + '% per boss for a Legendary item (its card is ' + F.boss.cardCh + '%), plus 5 escorts at ' +
    F.mobs[0].drops.map(d => d[1] + '%').join('/') + ' each'); }
console.log('  every stage-10 boss drop is Legendary (tier 4) whichever map it is on');
console.log('  sell: ' + f(X.sellVal({ sec: 3, tier: 4, lvl: 99 })) + 'z for an item that is worth more than any drop on maps 1-6');
console.log('  refine: 200z (r0) -> ' + f(X.refCost({ r: 9, sec: 3 })) + 'z (r9) + 1 ore per ATTEMPT, success ' +
  [0, 3, 4, 5, 7, 9].map(r => X.refCh({ r }) + '%').join('/') + ' for r0/r3/r4/r5/r7/r9');
console.log('  a failure consumes the ore and the Zeny; at +5 and above it also drops the item one level (it never breaks)');
{
  // Monte-Carlo of the real success ladder: what does a +10 actually cost?
  const CH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(r => X.refCh({ r }));
  const cost = r => X.refCost({ r, sec: 3 });
  const N = 60000, ores = new Array(11).fill(0), zeny = new Array(11).fill(0), cnt = new Array(11).fill(0);
  for (let n = 0; n < N; n++) {
    let r = 0, o = 0, z = 0, seen = {};
    while (r < 10) { o++; z += cost(r);
      if (Math.random() * 100 < CH[r]) { r++; if (!seen[r]) { seen[r] = 1; ores[r] += o; zeny[r] += z; cnt[r]++; } }
      else if (r >= 5) r--; }
  }
  console.log('\n  expected cost to FIRST reach each refine level (high-tier item, one sample per item):');
  [5, 6, 7, 8, 9, 10].forEach(lv => console.log('    +' + lv + ': ' + (ores[lv] / cnt[lv]).toFixed(1).padStart(6) + ' ores   ' +
    f(Math.round(zeny[lv] / cnt[lv])).padStart(9) + 'z'));
  const o10 = ores[10] / cnt[10];
  const perWave = 5 * .04 + .10;                      // 5 escorts at 2% per ore + the boss at 5% per ore
  console.log('  one stage-10 wave pays ~' + perWave.toFixed(2) + ' ore (of either kind), so +10 on ONE item = ' +
    Math.round(o10 / perWave) + ' boss waves; a whole 7-slot +10 set = ' + Math.round(7 * o10 / perWave) + ' waves.');
  console.log('  (+0..+4 is ~11 ores total - that part is cheap. The +9 -> +10 rung alone averages ' +
    Math.round(ores[10] / cnt[10] - ores[9] / cnt[9]) + ' ores.)');
}

// ============================================================ 6. nerf options
console.log('\n' + '='.repeat(100));
console.log('6. CANDIDATE NERFS  (same fixture as section 3: Lv150, +10 Legendary set, 9 legendary ATK cards)');
console.log('   HISTORICAL: the variants below patch PRE-v38 source strings, which the shipped file no');
console.log('   longer contains, so every row reads "patch target not found" unless you point AUDIT_HTML');
console.log('   at a pre-v38 index.html copy. What shipped is in section 3b (the live waterfall).');
const top = res[at('  + 9 Legendary ATK cards')];
console.log('='.repeat(100));
// ---- the staged plan: each stage ADDS to the one above it -------------------------------------
const AFFIX_CAP2 = ['n=[1,1+ri(0,1),2,2+ri(0,1),3][t]', 'n=[1,1+ri(0,1),2,2+ri(0,1),2][t]', 'affix cap'];
const AM_SOFT   = ['AM=[1,1.6,2.6,4,6.5]', 'AM=[1,1.5,2.2,3,4.5]', 'AM down'];
const VAL_SOFT  = ['(1+l*.15)*RAR[t].m', '(1+l*.10)*RAR[t].m', 'val level term'];
const RAR_SOFT  = ["m:1,w:60},{n:'Fine',m:1.35,w:25},{n:'Rare',m:1.9,w:10},{n:'Epic',m:2.8,w:4},{n:'Legendary',m:4.5",
                   "m:1,w:60},{n:'Fine',m:1.3,w:25},{n:'Rare',m:1.7,w:10},{n:'Epic',m:2.3,w:4},{n:'Legendary',m:3.5", 'RAR.m down'];
const REF_SOFT  = ['it.val*(1+(it.r||0)*.15)', 'it.val*(1+(it.r||0)*.10)', 'refine down'];
const CARD_SOFT = ['CV=[1,2,3,5]', 'CV=[1,1.5,2,2.5]', 'CV down'];
const STAGES = [
  ['today', []],
  ['STAGE 1  affixes: cap 2 per item + AM 4.5', [AFFIX_CAP2, AM_SOFT]],
  ['STAGE 2  + flat value down (level .10, Legendary 3.5)', [AFFIX_CAP2, AM_SOFT, VAL_SOFT, RAR_SOFT]],
  ['STAGE 3  + refine 10%/level', [AFFIX_CAP2, AM_SOFT, VAL_SOFT, RAR_SOFT, REF_SOFT]],
  ['STAGE 4  + cards CV 2.5 (the full plan)', [AFFIX_CAP2, AM_SOFT, VAL_SOFT, RAR_SOFT, REF_SOFT, CARD_SOFT]],
];
console.log('stage                                                   auto-DPS   vs today      ATK   mob TTK   boss TTK   max HP');
const mobE = mobStat(X, 9, 10), bossE = bossStat(X, 9, 10);
STAGES.forEach(([label, patches]) => {
  try {
    const Y = build(patches);
    const m = measure(Y, 99, 3, 4, 10, cardsIn(Y, 3, 'atk'), 200);
    console.log('  ' + label.padEnd(52) + f(Math.round(m.dps)).padStart(10) + ('x' + (m.dps / top.dps).toFixed(2)).padStart(10) +
      f(Math.round(m.atk)).padStart(9) + (mobE.hp / m.dps).toFixed(2).padStart(10) + 's' + (bossE.hp / m.dps).toFixed(1).padStart(9) + 's' +
      f(Math.round(m.hp)).padStart(11));
  } catch (e) { console.log('  ' + label.padEnd(52) + '  -> ' + e.message); }
});
console.log('  (mob/boss TTK are auto-attacks only; the real game is ~17x faster with a skill rotation,');
console.log('   so even STAGE 4 keeps the endgame farming loop at well under a second per mob.)');

// ---- the one change that is not a constant: DEF is a flat subtraction --------------------------
console.log('\nincoming damage - pre-v38 (flat subtraction, floor 1) vs v38 (capped percentage cut, SHIPPED):');
// def/(def+4000), capped at 75%. Chosen from Updates/cards-gear-audit/def-scan.js: it leaves the
// naked game within 0-2% of the old line, gives mid-gear 26-46% and endgame 60-75%.
// v38 replaced the game-loop line with exactly this, so the right-hand pair is the live game.
const cut = (d, k) => Math.min(.75, d / (d + k));
const hitNow = (atk, d) => Math.max(1, Math.round(atk * .8 - d * .6));
const hitPct = (atk, d, k) => Math.max(1, Math.round(atk * .8 * (1 - cut(d, k))));
{
  const Sn = fixture(X, 150, 'Lord Knight', null); X.S = Sn; const dNaked = X.def();
  const rows = [['naked (Lv150, no gear)', dNaked], ['mid-game +10 (Abyss field)', 7112], ['endgame +10 (Legendary)', measure(X, 99, 3, 4, 10, null, 200).def]];
  console.log('  DEF            mob hit pre-v38  mob hit shipped  boss hit pre-v38  boss hit shipped');
  rows.forEach(([label, d]) => {
    console.log('  ' + f(Math.round(d)).padStart(7) + '  ' + label.padEnd(26) + hitNow(mobE.atk, d).toString().padStart(8) +
      hitPct(mobE.atk, d, 4000).toString().padStart(15) + hitNow(bossE.atk, d).toString().padStart(17) + hitPct(bossE.atk, d, 4000).toString().padStart(15));
  });
  console.log('  BEFORE v38 a geared character took 1 from every mob AND every boss on the hardest map;');
  console.log('  the shipped cap: endgame takes ~25% of the raw hit, the naked character barely moves (3% cut).');
  console.log('  shipped line:  const md=m.mag?mdef():def(), cut=Math.min(.75,md/(md+4000));  d=round(atk*rand*(1-cut))');
}


// ---- section 7: the owner's ask - equipment flat base / 3, power handed back ----------------
console.log('\n' + '='.repeat(100));
console.log("7. THE OWNER'S ASK: flat base / 3, with the power returned through affixes and cards");
console.log('   HISTORICAL (pre-v38 baseline; these patches no longer match the shipped file - see 3b).');
console.log('='.repeat(100));
const BASE3   = ['{weapon:6,armor:4,head:10,off:3,leg:3,acc:5}[slot]',
                 '{weapon:2,armor:4/3,head:10/3,off:1,leg:1,acc:5/3}[slot]', 'flat base /3'];
const BASE2   = ['{weapon:6,armor:4,head:10,off:3,leg:3,acc:5}[slot]',
                 '{weapon:3,armor:2,head:5,off:1.5,leg:1.5,acc:2.5}[slot]', 'flat base /2'];
// the two slots that feed max HP (head x4, acc x3) are the ones the /3 hurts most: a character
// that loses two thirds of its flat value loses two thirds of its HP, not just its damage.
const BASE3_HP = ['{weapon:6,armor:4,head:10,off:3,leg:3,acc:5}[slot]',
                  '{weapon:2,armor:4/3,head:10,off:1,leg:1,acc:5}[slot]', 'flat base /3 on ATK slots, HP slots kept'];
const AM_BACK = ['AM=[1,1.6,2.6,4,6.5]', 'AM=[1,2.1,3.4,5.2,8.5]', 'AM +30% (affix give-back)'];
const CV_BACK = ['CV=[1,2,3,5]', 'CV=[1,2.6,3.9,6.5]', 'CV +30% (card give-back)'];
const VARIANTS = [
  ['today (no change)', []],
  ['A  flat base / 3 only', [BASE3]],
  ['A2  flat base / 2 only', [BASE2]],
  ['A3  /3 on ATK slots, HP slots kept', [BASE3_HP]],
  ['B  A + affixes x1.3 (AM up)', [BASE3, AM_BACK]],
  ['C  B + cards x1.3 (CV up)', [BASE3, AM_BACK, CV_BACK]],
  ['D  A + cards x1.3 (CV up only)', [BASE3, CV_BACK]],
];
console.log('variant                                                  auto-DPS   vs today      ATK   mob TTK   boss TTK   max HP');
const varRows = {};
VARIANTS.forEach(([label, patches]) => {
  try {
    const Y = build(patches);
    const m = measure(Y, 99, 3, 4, 10, cardsIn(Y, 3, 'atk'), 200);
    varRows[label] = m;
    console.log('  ' + label.padEnd(50) + f(Math.round(m.dps)).padStart(10) + ('x' + (m.dps / top.dps).toFixed(2)).padStart(10) +
      f(Math.round(m.atk)).padStart(9) + (mobE.hp / m.dps).toFixed(2).padStart(10) + 's' + (bossE.hp / m.dps).toFixed(1).padStart(9) + 's' +
      f(Math.round(m.hp)).padStart(11));
  } catch (e) { console.log('  ' + label.padEnd(50) + '  -> ' + e.message); }
});
const vA = varRows['A  flat base / 3 only'], vC = varRows['C  B + cards x1.3 (CV up)'];
if (vA) console.log('  the /3 alone leaves endgame at x' + (vA.dps / top.dps).toFixed(2) +
  ' of today; the same /3 hits every level equally (it is a plain multiplier on val), unlike the' + '\n  level-term change in stage 2, which only bites at the top.');
if (vA && vC) console.log('  handing a third of it back (affix magnitude +30%, card values +30%): x' + (vC.dps / top.dps).toFixed(2) +
  ' - i.e. the nerf is worth x' + ((vC.dps - top.dps) / top.dps * 100).toFixed(0) + '% after the give-back.');
console.log('\nboss HP per map at its Stage 10 (500 x mapMult x lvl^1.3) - and what it would need to be so');
console.log('that this swap does NOT change how long a boss takes to kill (today-DPS / variant-DPS):');
console.log('map            lvl     boss HP today    keep TTK: A    keep TTK: C');
[0,1,2,3,4,5,6,7,8,9].forEach(m => {
  const b = bossStat(X, m, 10);
  const kA = vA ? b.hp * top.dps / vA.dps : 0, kC = vC ? b.hp * top.dps / vC.dps : 0;
  console.log('  ' + X.MAPS[m].n.padEnd(13) + String(b.l).padStart(4) + f(b.hp).padStart(17) + f(Math.round(kA)).padStart(16) + f(Math.round(kC)).padStart(16));
});
if (vC) console.log('  (left alone, an endgame boss just takes x' + (top.dps / vC.dps).toFixed(1) +
  ' longer under variant C - boss HP only needs a nudge if that reads as too slow.)');

console.log('\n(dps is auto-attacks only - skills multiply the same base, so the ratios carry over)');
