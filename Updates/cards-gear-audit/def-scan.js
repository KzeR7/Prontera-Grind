// quick dev scan: real DEF values along the level curve, naked vs geared (used to pick the
// DEF-reduction constant in the audit). Not part of the game or the test battery.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('/home/user/Prontera-Grind/index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, n) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + n); return m[0]; };
const code = [
  pick(/const SU=k=>[^\n]*HPK=\d+,HPE=[\d.]+/, 'hpk'),
  grab('const CD=[', 'const pm=s=>'),
  pick(/const C=\(\)=>[^;]+;/, 'C'),
  pick(/const items=\(\)=>[^\n]*/, 'items'),
  pick(/const bon=k=>\{[^\n]*/, 'bon'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'st'),
  grab('const maxHp=\(\)=>', 'const totalPts=\(\)=>'),
  pick(/const totalPts=\(\)=>\{[^\n]*/, 'totalPts'),
  pick(/const RAR=\[[^\]]*\];/, 'RAR'),
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'AM'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AB'),
  pick(/K5=\[[^\]]*\];/, 'K5'),
  pick(/const MAPTIER=\[[^\]]*\];/, 'MAPTIER'),
  pick(/const dropTier=\(m,l\)=>[^;]+;/, 'dropTier'),
  pick(/const secOf=[^;]+;/, 'secOf'),
  pick(/const SKSLOTS=t=>[^;]+;/, 'SKSLOTS'),
  'const MOB_SPRITES={},MOB_SIZE_BY_ID={},MOB_SIZE_SCALE={};',
  'const pm=s=>{const[n,c,sh]=String(s).split(":");return{n,c:parseInt(c,16)||0,shape:sh}};',
  grab('const EXPK=', 'const JOFF='),
  grab('const G=(w,a,h,o,l,ac,ac2)=>', 'const pw=()=>'),
  grab('const starterStage=(m,l)=>', 'function spawn('),
  grab('function gearPool(m,l){', 'const dropTxt='),
  grab('function genGear(T,l,sec,boss,tier){', '// ---------- skill effects'),
].join('\n');
const harness = code + `
const SLOTS={weapon:{stat:'ATK'},armor:{stat:'DEF'},head:{stat:'HP'},off:{stat:'DEF'},leg:{stat:'DEF'},acc:{stat:'HP'}};
let __seed=20261004;Math.random=()=>((__seed=(__seed*1103515245+12345)>>>0)/4294967296);
const rnd=(a,b)=>a+Math.random()*(b-a),ri=(a,b)=>Math.floor(rnd(a,b+1)),uid=()=>1;
let S=null;const skillOn=()=>true;
const pv=k=>SKILLS.reduce((a,s)=>a+(s.type==='pas'&&s.key===k&&skillOn(s.id)?s.f(lv(s.id)):0),0);
const petBuff={atk:0,matk:0,hp:0},tb={},collDmg=()=>0;
this.__x={def,MAPS,secOf,dropTier,genGear,totalPts,CLASSES,SKILLS,lineOf,RAR,starterStage,starterHp,starterAtk,reseed:n=>{__seed=n},set S(v){S=v},get S(){return S}};
`;
const sb = { console }; vm.createContext(sb); vm.runInContext(harness, sb);
const X = sb.__x;
const alloc = lv => {
  const st = { str: 1, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 };
  X.S = { lv }; let left = X.totalPts(lv);
  const cost = v => v < 100 ? 1 + Math.floor((v - 1) / 10) : 10 + (v - 100);
  const order = ['str', 'luk', 'agi', 'vit', 'dex', 'int'];
  for (let g = 0; g < 9000 && left > 0; g++) { let s = false; for (const k of order) { const c = cost(st[k]); if (st[k] < (lv >= 100 ? 120 : 99) && c <= left) { st[k]++; left -= c; s = true } } if (!s) break }
  return st;
};
const mk = (Y, lvl, sec, tier, r) => {
  const one = (T, slot) => { const it = Y.genGear(T, lvl, sec, false, tier); it.r = r; it.slot = slot; return it };
  return { weapon: one({ k: 'sword', n: 'W' }, 'weapon'), armor: one({ k: 'armor', n: 'A' }, 'armor'), head: one({ k: 'head', n: 'H' }, 'head'),
    off: one({ k: 'off', n: 'O' }, 'off'), leg: one({ k: 'leg', n: 'L' }, 'leg'), acc1: one({ k: 'acc', n: '1' }, 'acc'), acc2: one({ k: 'acc', n: '2' }, 'acc') };
};
const fx = (Y, lv, set) => ({ cls: 'Lord Knight', lv, st: alloc(lv), sk: {}, skOff: {}, eq: Object.assign({ weapon: null, armor: null, head: null, off: null, leg: null, acc1: null, acc2: null, weapon2: null }, set || {}) });
console.log('map        charLv  fieldLv  sec  tier        DEF naked   DEF +0   DEF +10   raw hit   % cut naked  % cut +0  % cut +10');
[6, 17, 27, 39, 52, 63, 70, 77, 85, 95].forEach((lv, m) => {
  const stage = 5, sec = m >= 5 ? 3 : X.secOf(stage), tier = X.dropTier(m, stage), fl = X.MAPS[m].b + stage;
  X.S = fx(X, lv, null); const dn = X.def();
  X.reseed(90001); X.S = fx(X, lv, mk(X, fl, sec, tier, 0)); const d0 = X.def();
  X.reseed(90001); X.S = fx(X, lv, mk(X, fl, sec, tier, 10)); const d10 = X.def();
  const mb = 1 + m * .15 + Math.max(0, m - 4) * .2, l = fl, early = X.starterStage(m, stage);
  const atk = early ? X.starterAtk(stage) : Math.floor((5 + l * 4.6) * mb);
  const pct = (d, k) => Math.min(.75, d / (d + k)) * 100;
  console.log(X.MAPS[m].n.padEnd(11) + String(lv).padEnd(8) + String(fl).padEnd(9) + String(sec).padEnd(5) + X.RAR[tier].n.padEnd(8) +
    String(dn).padStart(9) + String(d0).padStart(9) + String(d10).padStart(10) + String(atk).padStart(10) +
    (pct(dn, 4000).toFixed(0) + '%').padStart(13) + (pct(d0, 4000).toFixed(0) + '%').padStart(10) + (pct(d10, 4000).toFixed(0) + '%').padStart(11));
});
console.log('\n(DEF reduction candidates: def/(def+K).  K=4000 keeps the early game within a few points of');
console.log(' today, gives mid-gear ~40-60% and caps endgame at 75% - i.e. gear still matters, nothing is immune.)');
