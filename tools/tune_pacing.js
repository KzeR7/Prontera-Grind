// tools/tune_pacing.js — solve the EXP/job curves against the requested live pacing.
//   node tools/tune_pacing.js
//   node tools/tune_pacing.js cA,aA,aB,n100   # verify a candidate
//
// Canonical model: 800 kills/hour on the level-appropriate field power along the route
// (Prontera p1-10; early class fields through p50; then power ~= Base Lv). Mob EXP, Job EXP,
// quest fractions and the 70x / 70/3x normal EXP rates mirror index.html. A boss replaces
// the pack every 16th kill; the actual Stage-10 boss-with-escorts fight is not simulated.
//
// Pacing targets: Base 1->10 in about 7 minutes, then Base 10->50 in about 30 minutes
// (37 minutes total). Preserve Base 50->99 at about 5 more hours (5h37 total), and the
// 48-hour Base 100->150 tail after the deliberate reset. Requirements rise within each
// phase; only the rebirth transition drops the threshold.
//
// The .126 loot-quest completion factor matches qrOf() in index.html after the 2x gear
// drop changes. Card and ore pickups are not counted by the loot quest.

const EXPK = 5.5, BOSEK = 46, MPS = 15, KPH = 800;
const rateAt = L => L < 100 ? 70 : 70 / 3;
const QXP = { kill: 1 / 1400, loot: 1 / 1750, boss: 1 / 840 };
const EARLY_PWR = [[11,10],[14,12],[16,15],[19,17],[27,20],[34,28],[42,35],[49,43],[59,50]];
const pwFor = lv => { if (lv <= 10) return Math.max(1, lv | 0);
  for (const [cap, p] of EARLY_PWR) if (lv <= cap) return p; return Math.min(99, lv | 0); };
const mobExp = p => Math.max(1, Math.floor(EXPK * Math.pow(p, 1.5) / 50));
const bossExp = p => Math.max(1, Math.floor(BOSEK * Math.pow(p, 1.5) / 50));
const expPerKill = p => (MPS * mobExp(p) + bossExp(p)) / (MPS + 1);
// Per-kill quest XP, matching qrOf() in index.html, including the live .126 loot factor.
const qrateRaw = L => (QXP.kill / (12 + 2 * L) + .126 * QXP.loot / (3 + Math.floor(L / 3))
  + (L >= 12 ? QXP.boss / ((MPS + 1) * (1 + Math.floor(L / 10))) : 0));
let QSCALE = 1;
const qrateAt = L => QSCALE * qrateRaw(L) * rateAt(L);

const DEFAULT_NE3 = 5.57031747;   // current seed for verify mode; final tune solves the post-99 ramp
const RESET_RATIO = 3.86;   // preserve the existing ~3.9x requirement drop at the Base-100 rebirth
function build(p) {
  const n50 = Math.floor(p.cA * Math.pow(50, p.aA)), ne3 = p.ne3 ?? DEFAULT_NE3;
  return L => L <= 50 ? Math.floor(p.cA * Math.pow(L, p.aA))
    : L <= 99 ? Math.floor(n50 * Math.pow(L / 50, p.aB))
      : Math.floor(p.n100 * Math.pow(L / 100, ne3));
}

const JOFF = [0, 9, 49, 98], GATE = [10, 40, 50];
function simulate(p, clamp = true) {
  const needAt = build(p);
  // The clamp target is a 40% maximum single-level quest share. Multiplying both mob and
  // quest XP by the same live EXP rate does not change that share.
  if (clamp) {
    let worstMobRatio = 0;
    for (let L = 1; L < 150; L++) worstMobRatio = Math.max(worstMobRatio,
      needAt(L) * qrateRaw(L) / expPerKill(pwFor(L)));
    QSCALE = Math.min(1, .667 / worstMobRatio);
  } else QSCALE = 1;

  let hours = 0, questXp = 0, totalNeed = 0, maxShare = 0;
  const T = { 1: 0 }, jl = [1, 1, 1, 1], jx = [0, 0, 0, 0], gate = [null, null, null];
  let tier = 0;
  for (let L = 1; L < 150; L++) {
    const rate = rateAt(L), pk = expPerKill(pwFor(L)) * rate, n = needAt(L), qr = qrateAt(L);
    const kills = Math.ceil(n / (pk + n * qr));
    const gained = kills * pk, qxp = kills * n * qr;
    maxShare = Math.max(maxShare, qxp / (gained + qxp));
    questXp += qxp; totalNeed += n;
    hours += kills / KPH;
    T[L + 1] = hours;

    let je = .7 * gained;   // Job EXP is 70% of mob EXP; quests pay Base EXP only
    while (je > 0 && tier < 3) {
      if (jl[tier] >= GATE[tier]) { tier++; continue; }
      const Lj = jl[tier] + JOFF[tier], nj = needAt(Lj);
      const pkj = expPerKill(pwFor(Lj)) * rateAt(Lj), qrj = qrateAt(Lj);
      const mobPart = Math.max(1, Math.floor(.7 * nj * pkj / (pkj + nj * qrj)));
      const take = Math.min(je, mobPart - jx[tier]);
      jx[tier] += take; je -= take;
      if (jx[tier] >= mobPart) {
        jl[tier]++; jx[tier] = 0;
        if (jl[tier] >= GATE[tier] && !gate[tier]) gate[tier] = { hours, base: L + 1 };
      }
    }
  }
  return { needAt, SHARE: questXp / totalNeed, maxShare, T, gate,
    T10: T[10], T50: T[50], T99: T[99], T150: hours };
}

// ---- verify mode: node tune_pacing.js cA,aA,aB,n100 ----------------------------
if (process.argv[2]) {
  const [cA, aA, aB, n100, ne3] = process.argv[2].split(',').map(Number);
  if ([cA, aA, aB, n100].some(x => !Number.isFinite(x))) throw new Error('expected cA,aA,aB,n100 and optional ne3');
  const v = simulate({ cA, aA, aB, n100, ...(Number.isFinite(ne3) ? { ne3 } : {}) }, false);
  console.log(`verify cA=${cA} aA=${aA} aB=${aB} n100=${n100} NE3=${Number.isFinite(ne3) ? ne3 : DEFAULT_NE3}`);
  console.log('Base 10', (v.T10 * 60).toFixed(2) + ' min', '| Base 50', v.T50.toFixed(3) + ' h',
    '| Base 99', v.T99.toFixed(3) + ' h', '| tail 100-150', (v.T150 - v.T[100]).toFixed(3) + ' h',
    '| total', v.T150.toFixed(3) + ' h');
  console.log('quest share', (v.SHARE * 100).toFixed(2) + '% global,', (v.maxShare * 100).toFixed(2) + '% max per level');
  v.gate.forEach((g, i) => console.log('job gate ' + i + ':', g ? `Base ${g.base} @ ${g.hours.toFixed(3)}h` : 'not reached'));
  process.exit(0);
}

const TGT = { T10: 7 / 60, T50: 37 / 60, T99: 337 / 60, TAIL: 48 };
function bisect(lo, hi, f) {
  let flo = f(lo), fhi = f(hi);
  if (flo > 0 || fhi < 0) throw new Error('no root in [' + lo + ',' + hi + ']: ' + flo.toFixed(3) + ' .. ' + fhi.toFixed(3));
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function fit(aA, aB) {
  const cA = bisect(.5, 1e5, x => simulate({ cA: x, aA, aB, n100: 15e4 }).T10 - TGT.T10);
  return { cA, s: simulate({ cA, aA, aB, n100: 15e4 }) };
}

let best = null;
for (let aA = 0.1; aA <= 4.0; aA += .1) {
  for (let aB = 1.4; aB <= 12.0; aB += .2) {
    try {
      const { cA, s } = fit(aA, aB), err = Math.abs(s.T50 - TGT.T50) + Math.abs(s.T99 - TGT.T99);
      if (!best || err < best.err) best = { err, cA, aA, aB, s };
    } catch (e) { }
  }
}
if (!best) { console.error('no fit found'); process.exit(1); }
console.log('coarse best', { cA: best.cA.toFixed(3), aA: best.aA.toFixed(2), aB: best.aB.toFixed(2),
  T50: best.s.T50.toFixed(2), T99: best.s.T99.toFixed(1) });

let { cA, aA, aB } = best;
for (let it = 0; it < 4; it++) {
  cA = bisect(.5, 1e5, x => simulate({ cA: x, aA, aB, n100: 15e4 }).T10 - TGT.T10);
  aA = bisect(0.01, 5.0, x => simulate({ cA, aA: x, aB, n100: 15e4 }).T50 - TGT.T50);
  cA = bisect(.5, 1e5, x => simulate({ cA: x, aA, aB, n100: 15e4 }).T10 - TGT.T10);
  aB = bisect(1.0, 14.0, x => simulate({ cA, aA, aB: x, n100: 15e4 }).T99 - TGT.T99);
}
cA = bisect(.5, 1e5, x => simulate({ cA: x, aA, aB, n100: 15e4 }).T10 - TGT.T10);
const n100At = ne3 => bisect(1e3, 1e8, x => {
  const s = simulate({ cA, aA, aB, n100: x, ne3 }, false);
  return (s.T150 - s.T[100]) - TGT.TAIL;
});
const NE3 = bisect(3, 14, ne3 => {
  const n = n100At(ne3), s = simulate({ cA, aA, aB, n100: n, ne3 }, false);
  return s.needAt(99) / n - RESET_RATIO;
});
const n100 = Math.floor(n100At(NE3));
const fin = simulate({ cA, aA, aB, n100, ne3: NE3 }, false);

console.log('\n=== tuned production curve (70x / 70/3x rates; .126 loot cadence) ===');
console.log(`cA=${cA.toFixed(8)}  aA=${aA.toFixed(8)}  aB=${aB.toFixed(8)}  n100=${n100.toFixed(0)}  NE3=${NE3.toFixed(8)}`);
console.log('shipping QXP', Object.entries(QXP).map(([k, v]) => `${k}=1/${(1/v).toFixed(0)}`).join(', '));
console.log('quest share', (fin.SHARE * 100).toFixed(1) + '% global,', (fin.maxShare * 100).toFixed(1) + '% worst level');
for (const L of [1, 2, 5, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 100, 110, 120, 130, 140, 149, 150])
  console.log(`needAt(${L}) = ${fin.needAt(L).toLocaleString()}`);
console.log('\nbase milestones:');
for (const [L, target] of [[10, '7 min'], [50, '37 min total (7 + 30 min)'], [99, '5 h 37 min (~5 h after Base 50)'], [150, 'model total']]) {
  const h = L === 150 ? fin.T150 : fin.T[L];
  console.log(`Base ${L}: ${(h * 60).toFixed(1)} min / ${h.toFixed(3)} h (target ${target})`);
}
console.log('tail 100-150:', (fin.T150 - fin.T[100]).toFixed(1) + ' h (target 48 h); rebirth drop x' +
  (fin.needAt(99) / fin.needAt(100)).toFixed(2));
console.log('\njob gates:');
['Novice -> 1st job', '1st -> 2nd job', '2nd -> transcendent'].forEach((n, i) => {
  const g = fin.gate[i]; console.log(n + ':', g ? `Base ${g.base} @ ${g.hours.toFixed(3)} h` : 'not reached');
});
let prev = 0, bad = [];
for (let L = 1; L < 150; L++) {
  if (L === 100) { prev = fin.needAt(L); continue; }
  const n = fin.needAt(L); if (n <= prev) bad.push(L); prev = n;
}
console.log(bad.length ? 'NOT monotone within phase at ' + bad.join(', ') : 'strictly increasing within both phases; reset only at 100');
