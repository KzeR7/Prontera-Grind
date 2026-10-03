// tools/tune_pacing.js — solve the exp/job curves against the owner's pacing anchors.
//   node tools/tune_pacing.js
//
// Same canonical model as tools/tests/economy_sim.js (800 kills/hour, player camps the
// level-10 field of the band map, boss folded into per-kill EXP) but solved PER LEVEL:
// kills_L = need / (epk + need*qrate_L) — quests complete while killing and pay
// need(Lv)*QXP, so each level's kill count is self-consistent instead of assuming one
// global quest share.
//
// Anchors (owner, v16): ~10 min to the 1st job change, ~2 h to the 2nd, ~48 h to the
// transcendent line, then a long 100-150 endgame.
//
// Curve family (three anchored power segments, continuous at the joins):
//   needAt(L) = cA*L^aA            (L <= 50)
//   needAt(L) = n50*(L/50)^aB      (50 < L <= 99)
//   needAt(L) = n99*(L/99)^aC      (L > 99)
// Job costs mirror the base curve (lockstep): a job level j of tier t costs what the
// base level it runs alongside pays in job exp, so each job bar fills next to the base
// bar and the three job changes land on the anchors by construction.

const EXPK = 5.5, BOSEK = 46, MPS = 15, KPH = 800;
let QXP = { kill: 1 / 32, loot: 1 / 40, boss: 1 / 19 };
// v16 shipping fractions: the v11 column scaled by 4/15 so quests can never carry more
// than ~40% of a level on the steep high end of the new curve (verified at the bottom).
const QXP_SHIP = { kill: 1 / 120, loot: 1 / 150, boss: 1 / 72 };
const MAP_B = [0, 9, 19, 31, 43, 59, 66, 73, 79, 89];
const BAND = [[12, 0], [24, 1], [34, 2], [46, 3], [60, 4], [67, 5], [74, 6], [80, 7], [90, 8], [99, 9]];
const pwFor = lv => { for (const [cap, m] of BAND) if (lv <= cap) return MAP_B[m] + 10; return 99; };
const mobExp = p => Math.max(1, Math.floor(EXPK * Math.pow(p, 1.5) / 50));
const bossExp = p => Math.max(1, Math.floor(BOSEK * Math.pow(p, 1.5) / 50));
const expPerKill = p => (MPS * mobExp(p) + bossExp(p)) / (MPS + 1);
// quests completed while taking one level, per kill (same goals as qScale in the game)
const qrateRaw = L => (QXP.kill / (12 + 2 * L) + 0.0385 * QXP.loot / (3 + Math.floor(L / 3))
  + (L >= 12 ? QXP.boss / ((MPS + 1) * (1 + Math.floor(L / 10))) : 0));
let QSCALE = 1;
const qrateAt = L => QSCALE * qrateRaw(L);
const killsAt = (L, needAt) => needAt(L) / (expPerKill(pwFor(L)) + needAt(L) * qrateAt(L));

function build(p) {
  const n50 = Math.floor(p.cA * Math.pow(50, p.aA));
  const n99 = Math.floor(n50 * Math.pow(99 / 50, p.aB));
  return L => L <= 50 ? Math.floor(p.cA * Math.pow(L, p.aA))
    : L <= 99 ? Math.floor(n50 * Math.pow(L / 50, p.aB))
      : Math.floor(n99 * Math.pow(L / 99, p.aC));
}

const JOFF = [0, 9, 49, 98];
const GATE = [10, 40, 50];

function simulate(p, clamp = true) {
  const needAt = build(p);
  // While solving: quests must never carry a level, so cap the worst single-level quest
  // share at ~40% by scaling the whole QXP column. With QXP_SHIP the clamp must not bind.
  if (clamp) {
    let worst = 0;
    for (let L = 1; L < 150; L++) worst = Math.max(worst, needAt(L) * qrateRaw(L) / expPerKill(pwFor(L)));
    QSCALE = Math.min(1, 0.667 / worst);
  } else QSCALE = 1;
  let hours = 0, questXp = 0, totalNeed = 0, maxShare = 0;
  const T = { 1: 0 }, jl = [1, 1, 1, 1], jx = [0, 0, 0, 0], gate = [null, null, null];
  let tier = 0;
  for (let L = 1; L < 150; L++) {
    const pk = expPerKill(pwFor(L)), n = needAt(L);
    const kills = Math.ceil(n / (pk + n * qrateAt(L)));
    const gained = kills * pk, qxp = kills * n * qrateAt(L);
    maxShare = Math.max(maxShare, qxp / (gained + qxp));
    questXp += qxp; totalNeed += n;
    hours += kills / KPH;
    T[L + 1] = hours;
    let je = 0.7 * gained;   // quests pay base exp only
    while (je > 0 && tier < 3) {
      if (jl[tier] >= GATE[tier]) { tier++; continue; }
      // lockstep: this job level costs exactly the job exp one base level pays out
      // while camping its canonical field (pk/qr of the mirrored base level itself)
      const Lj = jl[tier] + JOFF[tier];
      const pkj = expPerKill(pwFor(Lj));
      const mobPart = Math.max(1, Math.floor(0.7 * needAt(Lj) * pkj / (pkj + needAt(Lj) * qrateAt(Lj))));
      const take = Math.min(je, mobPart - jx[tier]);
      jx[tier] += take; je -= take;
      if (jx[tier] >= mobPart) { jl[tier]++; jx[tier] = 0;
        if (jl[tier] >= GATE[tier] && !gate[tier]) gate[tier] = { hours, base: L + 1 }; }
    }
  }
  return { needAt, SHARE: questXp / totalNeed, maxShare, T, gate, T10: T[10], T50: T[50], T99: T[99], T150: hours };
}

// ---- verify mode: node tune_pacing.js cA,aA,aB,aC ------------------------------
if (process.argv[2]) {
  const [cA, aA, aB, aC] = process.argv[2].split(',').map(Number);
  QXP = QXP_SHIP;
  const v = simulate({ cA, aA, aB, aC }, false);
  console.log(`verify cA=${cA} aA=${aA} aB=${aB} aC=${aC}`);
  console.log('T10', (v.T10 * 60).toFixed(1) + 'min', 'T50', v.T50.toFixed(2) + 'h', 'T99', v.T99.toFixed(1) + 'h', 'T150', v.T150.toFixed(0) + 'h');
  console.log('share', (v.SHARE * 100).toFixed(1) + '% worst', (v.maxShare * 100).toFixed(1) + '%');
  v.gate.forEach((g, i) => console.log('gate' + i, g ? `base ${g.base} @ ${g.hours.toFixed(2)}h` : '-'));
  process.exit(0);
}

// ---- sequential solve: each anchor pins one parameter -------------------------
const TGT = { T10: 10 / 60, T50: 2, T99: 48, T150: 150 };
function bisect(lo, hi, f) {
  let flo = f(lo), fhi = f(hi);
  if (flo > 0 || fhi < 0) throw new Error('no root in [' + lo + ',' + hi + ']: ' + flo.toFixed(3) + ' .. ' + fhi.toFixed(3));
  for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

function fit(aA, aB, aC) {
  const cA = bisect(0.5, 1e5, x => simulate({ cA: x, aA, aB, aC }).T10 - TGT.T10);
  const s = simulate({ cA, aA, aB, aC });
  return { cA, s };
}

let best = null;
for (let aA = 1.2; aA <= 4.0; aA += 0.1) {
  for (let aB = 1.4; aB <= 12.0; aB += 0.2) {
    try {
      const { cA, s } = fit(aA, aB, 2.5);
      const err = Math.abs(s.T50 - TGT.T50) + Math.abs(s.T99 - TGT.T99);
      if (!best || err < best.err) best = { err, cA, aA, aB, s };
    } catch (e) { }
  }
}
if (!best) { console.error('no fit found'); process.exit(1); }
console.log('coarse best', { cA: best.cA.toFixed(3), aA: best.aA.toFixed(2), aB: best.aB.toFixed(2), T50: best.s.T50.toFixed(2), T99: best.s.T99.toFixed(1) });

let { cA, aA, aB } = best;
for (let it = 0; it < 4; it++) {
  cA = bisect(0.5, 1e5, x => simulate({ cA: x, aA, aB, aC: 2.5 }).T10 - TGT.T10);
  aA = bisect(1.0, 5.0, x => simulate({ cA, aA: x, aB, aC: 2.5 }).T50 - TGT.T50);
  cA = bisect(0.5, 1e5, x => simulate({ cA: x, aA, aB, aC: 2.5 }).T10 - TGT.T10);
  aB = bisect(1.0, 14.0, x => simulate({ cA, aA, aB: x, aC: 2.5 }).T99 - TGT.T99);
}
cA = bisect(0.5, 1e5, x => simulate({ cA: x, aA, aB, aC: 2.5 }).T10 - TGT.T10);
// The 48h anchor at 99 forces needAt(99) high, and a monotone curve then needs ~200h+
// for 100-150 no matter what - so the 100-150 stretch is an outcome to report, not an
// anchor to solve. aC just shapes how gently it ramps.
const aC = 1.6;
const solved = simulate({ cA, aA, aB, aC });
console.log('\nsolve: quest clamp QSCALE =', QSCALE.toFixed(4),
  '-> ship QXP kill 1/' + Math.round(32 / QSCALE) + ', loot 1/' + Math.round(40 / QSCALE) + ', boss 1/' + Math.round(19 / QSCALE));

// final verification with the actual shipping constants (no clamp may bind)
QXP = QXP_SHIP;
const fin = simulate({ cA, aA, aB, aC }, false);

console.log('\n=== final curve (shipping QXP, no clamp) ===');
console.log(`cA=${cA.toFixed(4)}  aA=${aA.toFixed(4)}  aB=${aB.toFixed(4)}  aC=${aC.toFixed(4)}`);
console.log('global quest share', (fin.SHARE * 100).toFixed(1) + '%, worst single-level share', (fin.maxShare * 100).toFixed(1) + '%');
for (const L of [1, 2, 5, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 100, 110, 120, 130, 140, 149])
  console.log(`  needAt(${L}) = ${fin.needAt(L).toLocaleString()}`);
console.log('\nbase milestones (model hours):');
for (const [L, tgt] of [[10, '10 min'], [50, '2 h'], [99, '48 h'], [150, '~150 h']]) {
  const h = L === 150 ? fin.T150 : fin.T[L];
  console.log(`  Base ${L}: ${(h * 60).toFixed(0)} min / ${h.toFixed(2)} h  (target ${tgt})`);
}
console.log('\njob gates (lockstep):');
const names = ['Novice -> 1st job', '1st -> 2nd job', '2nd -> transcendent'];
fin.gate.forEach((g, i) => console.log(`  ${names[i]}: at Base Lv ${g ? g.base : '-'} after ${g ? g.hours.toFixed(2) : '-'} h`));
let prev = 0, bad = [];
for (let L = 1; L < 150; L++) { const n = fin.needAt(L); if (n <= prev) bad.push(L); prev = n; }
console.log(bad.length ? 'NOT monotone at ' + bad : 'curve strictly increasing ✓');
console.log('\nper-level time, hours (every 5th level + the joins):');
let line = '';
for (const L of [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 96, 97, 98, 99, 100, 105, 110, 120, 130, 140, 149])
  line += `L${L}:${((fin.T[L + 1] - fin.T[L]) * 60).toFixed(L > 90 ? 0 : 1)}m `;
console.log(line);
