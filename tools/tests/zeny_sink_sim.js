// Zeny sinks (v90.8): the random Nightmare Zeny payout, the Black Market's Nightmare material sale,
// and the wiring that makes both reachable from the game.   node tools/tests/zeny_sink_sim.js
//
// The rules being checked:
//   * every kill from Niflheim (map 8) on, normal stages included, and every Nightmare stage, pays Zeny on NM_ZENY_CH
//     (90%) of its kills, bosses included, at a random NM_ZENY_LO to NM_ZENY_HI (0.5x to 1.0x) of the old value,
//     so the mean is about 0.675 of before;
//   * every other kill (Prontera to Amatsu, normal stages) pays in full (multiplier 1);
//   * buyMat() sells one Nightmare material for BM_MAT_PRICE Zeny, only from Base Lv BM_LV, and only
//     when the player can pay it; a refused purchase changes nothing;
//   * the Black Market panel lists the ten materials with a Buy 1 button, and the action is dispatched.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' -> ' + e.message.split('\n')[0]); }
};

// ---- the payout roll and the material sale, run from their real source text ----
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`
  // RND is the fixed roll; null means real randomness (used by the 200,000-roll sample)
  let RND = 0;
  const __real = Math.random;
  // SEQ, when set, is a queue of rolls read in order: the chance roll first, then the amount roll
  let SEQ = null;
  Math.random = () => (SEQ && SEQ.length ? SEQ.shift() : RND === null ? __real() : RND);
  const rnd = (a, b) => a + Math.random() * (b - a);
  ${pick(/const NM_ZENY_CH=[^;]+;/, 'NM_ZENY_CH')}
  ${pick(/function nmZenyRoll\(mob\)\{[^\n]*/, 'nmZenyRoll')}
  ${pick(/const NM_MAT=\[[^\]]+\];/, 'NM_MAT')}
  ${pick(/const BM_MAT_PRICE=\d+;/, 'BM_MAT_PRICE')}
  ${pick(/function buyMat\(m\)\{[^\n]*/, 'buyMat')}
  const safeCount=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(n))):0};
  const BM_LV=100;
  const bmOpen=()=>(S.lv|0)>=BM_LV;
  let S=null, LOGS=[], UI=0, SAVES=0;
  const log=(m)=>LOGS.push(m), ui=()=>UI++, save=()=>SAVES++;
  this.__m={nmZenyRoll, buyMat, NM_MAT, BM_MAT_PRICE, NM_ZENY_CH,
    get S(){return S}, set S(v){S=v}, LOGS, get UI(){return UI}, get SAVES(){return SAVES},
    set RND(v){RND=v}, set SEQ(v){SEQ=v}};
`, sandbox);
const M = sandbox.__m;

t('a Nightmare kill pays Zeny on NM_ZENY_CH (90%) of its kills, on both tiers', () => {
  assert.strictEqual(M.NM_ZENY_CH, 0.9, 'the chance is 90%, so 10% of kills drop no Zeny (v90.9)');
  M.S = { mp: 0, lvl: 11 };   // tier 1, Nightmare Prontera Stage 11
  M.RND = 0.5; // 0.5 < 0.9 -> pays
  assert.ok(M.nmZenyRoll({ boss: false }) > 0, 'tier 1 pays on a 0.5 roll');
  M.RND = 0.95; // 0.95 >= 0.9 -> no Zeny at all
  assert.strictEqual(M.nmZenyRoll({ boss: false }), 0, 'tier 1 pays nothing on a 0.95 roll');
  M.S = { mp: 9, lvl: 15 };   // tier 2, Nightmare Abyss Stage 15
  M.RND = 0.5;
  assert.ok(M.nmZenyRoll({ boss: false }) > 0, 'tier 2 pays on a 0.5 roll');
  M.RND = 0.95;
  assert.strictEqual(M.nmZenyRoll({ boss: false }), 0, 'tier 2 pays nothing on a 0.95 roll');
  M.S = null;
});

t('a paying Nightmare kill is 0.5x to 1.0x the old value', () => {
  M.S = { mp: 0, lvl: 11 };
  M.SEQ = [0.1, 0]; // chance roll pays, amount roll at its floor
  assert.strictEqual(M.nmZenyRoll({ boss: false }), 0.5, 'the low end is 0.5x');
  M.SEQ = [0.1, 0.9999]; // chance roll pays, amount roll at its ceiling
  const hi = M.nmZenyRoll({ boss: false });
  assert.ok(hi > 0.99 && hi <= 1, 'the high end is 1.0x: ' + hi);
  M.SEQ = null;
  M.S = null;
});

t('the mean payout over many real rolls is about 0.675 of the old value', () => {
  M.S = { mp: 0, lvl: 11 };
  M.RND = null; // real randomness drives the sample
  const n = 200000;
  let sum = 0, paid = 0;
  for (let i = 0; i < n; i++) {
    const v = vm.runInContext('nmZenyRoll({ boss: false })', sandbox);
    sum += v; if (v > 0) paid++;
  }
  const mean = sum / n, rate = paid / n;
  assert.ok(Math.abs(rate - 0.9) < 0.01, 'about 90% of kills pay: ' + rate.toFixed(4));
  assert.ok(Math.abs(mean - 0.675) < 0.01, 'the mean is about 0.675x the old value: ' + mean.toFixed(4));
  M.S = null;
});

t('the roll covers every kill from Niflheim on and every Nightmare stage; bosses included; the rest of the game pays in full', () => {
  M.RND = 0.95; // a roll that would make a rolled kill pay nothing
  const cases = [
    [{ mp: 8, lvl: 5 }, 'Niflheim normal mob', false, 0],
    [{ mp: 8, lvl: 10 }, 'Niflheim Stage 10 boss', true, 0],
    [{ mp: 9, lvl: 5 }, 'Abyss normal mob', false, 0],
    [{ mp: 9, lvl: 10 }, 'Abyss Stage 10 boss', true, 0],
    [{ mp: 0, lvl: 12 }, 'Nightmare Prontera boss-tier mob', false, 0],
    [{ mp: 9, lvl: 15 }, 'Nightmare Abyss Stage 15 boss', true, 0],
  ];
  for (const [field, name, boss, want] of cases) {
    M.S = field;
    assert.strictEqual(M.nmZenyRoll({ boss }), want, name + ' is rolled and pays nothing on a 0.95 roll');
  }
  const paidInFull = [
    [{ mp: 0, lvl: 1 }, 'Prontera Stage 1 mob', false],
    [{ mp: 0, lvl: 10 }, 'Prontera Stage 10 boss', true],
    [{ mp: 4, lvl: 7 }, 'Payon normal mob', false],
    [{ mp: 7, lvl: 10 }, 'Amatsu Stage 10 boss', true],
  ];
  for (const [field, name, boss] of paidInFull) {
    M.S = field;
    assert.strictEqual(M.nmZenyRoll({ boss }), 1, name + ' pays in full, the roll does not touch it');
  }
  M.S = null;
});

t('the Black Market sells one Nightmare material for 3,000,000 Zeny', () => {
  assert.strictEqual(M.BM_MAT_PRICE, 3000000);
  assert.strictEqual(M.NM_MAT.length, 10, 'ten materials, one per Nightmare map');
});

t('buyMat takes the price and adds one of that material', () => {
  M.S = { lv: 100, zeny: 5000000, nmMat: [] };
  M.LOGS.length = 0;
  sandbox.__m.buyMat(3);
  assert.strictEqual(M.S.zeny, 2000000, 'the price is taken');
  assert.strictEqual(M.S.nmMat[3], 1, 'the material goes into its own slot');
  assert.ok(M.UI >= 1 && M.SAVES >= 1, 'the screen refreshes and the game saves');
  assert.ok(M.LOGS.some(l => l.includes(M.NM_MAT[3])), 'the purchase is logged with the material name');
});

t('buyMat refuses when the player cannot pay, and changes nothing', () => {
  M.S = { lv: 100, zeny: 2999999, nmMat: [] };
  const before = M.UI;
  M.LOGS.length = 0;
  sandbox.__m.buyMat(0);
  assert.strictEqual(M.S.zeny, 2999999, 'no Zeny is taken');
  assert.strictEqual(M.S.nmMat[0], undefined, 'no material is added');
  assert.ok(M.LOGS.some(l => l.includes('Not enough Zeny')), 'the refusal is logged');
  assert.ok(M.UI > before, 'the screen refreshes on refusal');
});

t('buyMat does nothing below Base Lv 100 or for an unknown material', () => {
  M.S = { lv: 99, zeny: 9000000, nmMat: [] };
  sandbox.__m.buyMat(0);
  assert.strictEqual(M.S.zeny, 9000000, 'the Black Market is closed below Lv 100');
  M.S = { lv: 150, zeny: 9000000, nmMat: [] };
  sandbox.__m.buyMat(42);
  assert.strictEqual(M.S.zeny, 9000000, 'an index outside the ten materials is ignored');
});

// ---- wiring: the action table and the market panel ----
t('the action table dispatches bmmat to buyMat', () => {
  assert.ok(src.includes('bmmat:o=>buyMat(+o)'), 'bmmat is in the dispatch table');
});

t('the Black Market panel lists the ten materials with a Buy 1 button', () => {
  assert.ok(src.includes('data-a="bmmat"'), 'the material button carries the bmmat action');
  assert.ok(src.includes("Nightmare materials</div><small>3,000,000z each</small>'+mats"), 'the rows sit under a Nightmare materials heading');
  assert.ok(/disabled.*BM_MAT_PRICE|BM_MAT_PRICE.*disabled/.test(src), 'the button is disabled when the price is out of reach');
});

t('the live and offline kill payouts both call nmZenyRoll', () => {
  assert.ok(src.includes("mob.zeny*(1+pv('zeny')/100)*(1+petPassive('zeny')/100)*nmZenyRoll(mob))*g"), 'live kill');
  assert.ok(src.includes("Math.round(mob.zeny*(1+pv('zeny')/100)*nmZenyRoll(mob))*gx()"), 'offline kill');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + (pass + fail) + ' assertions groups)');
process.exit(fail ? 1 : 0);
