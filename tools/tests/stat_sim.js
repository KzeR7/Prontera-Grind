// Stat progression: the 99 -> 120 elite tier and the point curve that pays for it.
//   node tools/tests/stat_sim.js
//
// The rules being tested:
//   * stats cap at 99 until Base Lv 100, then at 120;
//   * raising a stat costs 1+floor((v-1)/10) below 100 and 10+(v-100) above, and that
//     cost never goes DOWN as the stat climbs (the first draft of the elite tier dipped
//     from 10pt to 8pt at exactly v=100);
//   * a player who spends optimally ends Lv150 with exactly three stats at 120. The
//     original curve landed on 120/120/119 - two maxed and one a point short;
//   * a corrupt save cannot carry a stat above the hard cap.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name + ' in index.html'); return m[0]; };

const statBlock = pick(/const MAXST=\d+,BASECAP=\d+,ELITELV=\d+,statCap=\(\)=>[^;]+;/, 'stat cap constants');
const costFn = pick(/cost=k=>\{const v=S\.st\[k\];return[^}]*\}/, 'cost()');
const totalPtsFn = pick(/const totalPts=\(\)=>\{[^}]*\}/, 'totalPts()');
const clampLine = pick(/for\(const k of\['str','agi','dex','luk','int','vit'\]\)f\.st\[k\][^\n]*?;/, 'load() stat clamp');

const harness = `
${statBlock}
${totalPtsFn.replace('const totalPts', 'const totalPts_')}, rcost=()=>0;
const totalPts = totalPts_;
let S = null;
${costFn.replace('cost=k=>', 'const cost=k=>')}
const num_ = (v,d) => { v = +v; return Number.isFinite(v) ? v : d };
this.__s = { cost, totalPts, statCap, MAXST, BASECAP, ELITELV,
             clamp: f => { ${clampLine.trim()} return f; },
             set S(v){S=v}, get S(){return S} };
`;
const sb = { console, num_: (v, d) => { v = +v; return Number.isFinite(v) ? v : d }, MAXST_FALLBACK: 120 };
vm.createContext(sb); vm.runInContext(harness, sb);
const H = sb.__s;

const KEYS = ['str', 'agi', 'dex', 'luk', 'int', 'vit'];
const mkS = (lv, st = {}) => ({ lv, st: Object.assign({ str: 1, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 }, st) });

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('stat progression: 99 until Base Lv 100, then 120\n');

t('the cap is 99 below Base Lv 100 and 120 from Base Lv 100', () => {
  H.S = mkS(1); assert.strictEqual(H.statCap(), 99);
  H.S = mkS(99); assert.strictEqual(H.statCap(), 99, 'Lv99 must still cap at 99');
  H.S = mkS(100); assert.strictEqual(H.statCap(), 120, 'Lv100 must unlock 120');
  H.S = mkS(150); assert.strictEqual(H.statCap(), 120);
  assert.strictEqual(H.MAXST, 120);
});

t('the cost curve never gets cheaper as the stat climbs', () => {
  H.S = mkS(150);
  let prev = 0;
  for (let v = 1; v < 120; v++) {
    H.S.st.str = v;
    const c = H.cost('str');
    assert.ok(c >= prev, `cost fell at v=${v}: ${prev} -> ${c}`);
    assert.ok(c >= 1, 'cost must be at least 1 point');
    prev = c;
  }
});

t('one stat 1 -> 120 costs 930 points (530 to reach 99, 400 from 99 to 120)', () => {
  H.S = mkS(150);
  let to99 = 0, elite = 0;
  for (let v = 1; v < 99; v++) { H.S.st.str = v; to99 += H.cost('str'); }   // steps taken at v=1..98
  for (let v = 99; v < 120; v++) { H.S.st.str = v; elite += H.cost('str'); } // steps taken at v=99..119
  assert.strictEqual(to99, 530, 'cost 1->99');
  assert.strictEqual(elite, 400, 'cost 99->120 (10pt at v=99, then 10..29 through the elite tier)');
  assert.strictEqual(to99 + elite, 930, 'cost 1->120');
});

t('the grant curve pays 1352 by Lv99 and 2811 by Lv150', () => {
  H.S = mkS(99); assert.strictEqual(H.totalPts(), 1352);
  H.S = mkS(150); assert.strictEqual(H.totalPts(), 2811);
  H.S = mkS(1); assert.strictEqual(H.totalPts(), 10, 'a fresh character starts with 10 points');
});

// optimal play: pour everything into three stats, respecting the level gate on the cap
function playTo(lv) {
  const st = { str: 1, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 };
  const three = ['str', 'agi', 'dex'];
  let pts = 10;
  for (let l = 2; l <= lv; l++) {
    H.S = mkS(l, st);
    pts += (4 + Math.floor(l / 5));
    const cap = H.statCap();
    let guard = 0;
    while (guard++ < 5000) {
      let best = null, bc = Infinity;
      for (const k of three) if (st[k] < cap) { H.S.st[k] = st[k]; const c = H.cost(k); if (c < bc) { bc = c; best = k; } }
      if (!best || pts < bc) break;
      pts -= bc; st[best]++;
    }
  }
  H.S = mkS(lv, st);
  return { st, pts };
}

t('optimal play reaches exactly three stats at 120 by Lv150', () => {
  const r = playTo(150);
  const maxed = KEYS.filter(k => r.st[k] === 120);
  assert.strictEqual(maxed.length, 3, `got ${maxed.length} stats at 120: ${JSON.stringify(r.st)}`);
  assert.ok(r.pts >= 0 && r.pts < 100, 'leftover points should be small, got ' + r.pts);
  const others = KEYS.filter(k => r.st[k] === 1);
  assert.strictEqual(others.length, 3, 'the other three stats should be untouched');
  console.log('       final: ' + KEYS.map(k => k + ' ' + r.st[k]).join(', ') + ' | ' + r.pts + ' pts left');
});

t('a Lv99 player is capped at 99 and cannot pre-buy the elite tier', () => {
  const r = playTo(99);
  for (const k of KEYS) assert.ok(r.st[k] <= 99, k + ' reached ' + r.st[k] + ' below Lv100');
  const top = Math.max(...KEYS.map(k => r.st[k]));
  assert.ok(top >= 85, 'a Lv99 player should be near the cap, got ' + top);
  console.log('       Lv99: ' + KEYS.map(k => k + ' ' + r.st[k]).join(', '));
});

t('a save carrying a stat above the hard cap is clamped on load', () => {
  const f = H.clamp({ st: { str: 999, agi: -5, dex: 'abc', luk: null, int: 120, vit: 121 } });
  assert.strictEqual(f.st.str, 120, 'str above MAXST not clamped');
  assert.strictEqual(f.st.vit, 120, 'vit above MAXST not clamped');
  assert.strictEqual(f.st.int, 120, 'int at MAXST should be kept');
  assert.strictEqual(f.st.agi, 1, 'negative stat not repaired');
  assert.strictEqual(f.st.dex, 1, 'non-numeric stat not repaired');
  assert.strictEqual(f.st.luk, 1, 'null stat not repaired');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
