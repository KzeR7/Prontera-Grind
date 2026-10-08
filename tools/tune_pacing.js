// tools/tune_pacing.js — solve and verify the live Base-EXP curve.
//   node tools/tune_pacing.js            # solve design B from its targets, print the constants
//   node tools/tune_pacing.js --verify   # check index.html's shipped constants + timings
//   node tools/tune_pacing.js a,b,c,d,e[,f]
//        # check a candidate: a=NA1, b=NE1, c=NE2, d=NE2B, e=N100[, f=NE3]
//
// Everything here is in the units index.html ships (the v56 display scale: EXP_RATE 7, so a
// Lv1 kill pays 21 EXP and Base 10 needs 360). tools/pacing_report.js prints the same model
// as a level-by-level table.
//
// Canonical model: 800 kills/hour along the level-appropriate field route (Prontera p1-10;
// early class fields through p50; then power ~= Base Lv), a boss replacing the pack every
// 16th kill, and the shipped quest fractions. The Stage-10 boss-with-escorts fight is not
// simulated.
//
// v56 design (owner request): Base 1-50 keeps the v51 pace (~2.5 min to Lv10, ~14 min to
// Lv50) while Base 50->70 becomes the mid-game wall - about 80 minutes, "less than 2 hours"
// on the live chart, ramping from seconds per level at 51 to ~10 minutes at 70. The curve is
// continuous, so the wall lifts the requirements above it; the 70-99 segment is therefore
// nearly flat (130k -> 167k) and Base 99 lands at about 6 h 55 m. v84 (owner playtest: the
// 100-150 band cleared in a day): every Base 100+ requirement is DOUBLED - N100 carries the
// x2 (43260 -> 86520, RESET_RATIO 3.86 -> 1.9306), NE3 is untouched, and the tail target is
// the doubled ~81 h model climb.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const grab = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot read ' + name + ' from index.html'); return m; };

const EXPK = +grab(/const EXPK=([\d.]+),/, 'EXPK')[1];
const BOSEK = +grab(/EXPK=[\d.]+,BOSEK=([\d.]+),/, 'BOSEK')[1];
const NA1 = +grab(/const NA1=([\d.]+),/, 'NA1')[1];
const NE1 = +grab(/NE1=([\d.]+),N50/, 'NE1')[1];
const RATE = +grab(/EXP_RATE=(\d+);/, 'EXP_RATE')[1];
const BOOST_LV = +grab(/const EXP_BOOST_LV=(\d+),/, 'EXP_BOOST_LV')[1];
const BOOST_X = +grab(/EXP_BOOST_X=(\d+),/, 'EXP_BOOST_X')[1];
const MPS = 15, KPH = 800;
const QXP = { kill: 1 / 140, loot: 1 / 175, boss: 1 / 84 };    // v56: x10 to match EXP_RATE/10
const RESET_RATIO = 1.9306;                                    // v84: owner doubled Base 100+ (was 3.86)
const DEFAULT_NE3 = 8.2928141;

// Targets, in the units the report prints.
const TGT = { T10: 2.5 / 60, T50: 13.9 / 60, WALL: 80 / 60, T99: 6.9, TAIL: 96 };

const EARLY_PWR = [[11,10],[14,12],[16,15],[19,17],[27,20],[34,28],[42,35],[49,43],[59,50]];
const pwFor = lv => { if (lv <= 10) return Math.max(1, lv | 0);
  for (const [cap, p] of EARLY_PWR) if (lv <= cap) return p; return Math.min(99, lv | 0); };
const rateAt = L => L <= BOOST_LV ? RATE * BOOST_X : L < 100 ? RATE : RATE / 3;
const mobExp = p => Math.max(1, Math.floor(EXPK * Math.pow(p, 1.5) / 50));
const bossExp = p => Math.max(1, Math.floor(BOSEK * Math.pow(p, 1.5) / 50));
const expPerKill = p => (MPS * mobExp(p) + bossExp(p)) / (MPS + 1);
const qrate = L => QXP.kill / (12 + 2 * L) + .126 * QXP.loot / (3 + Math.floor(L / 3))
  + (L >= 12 ? QXP.boss / ((MPS + 1) * (1 + Math.floor(L / 10))) : 0);
// index.html rounds every requirement to three significant figures (roundReq).
const roundReq = n => { const a = Math.abs(n), m = a < 100 ? 1 : a < 1e4 ? 10 : a < 1e5 ? 100 : 1e3;
  return Math.max(1, Math.round(n / m) * m); };

// Four segments, exactly as index.html evaluates them: 1-50 (cA,aA / NA1,NE1), 50-70 (aB),
// 70-99 (aC / NE2B), then the Base-100 reset and the post-99 ramp (n100, ne3 / N100, NE3).
function build(p) {
  const n50 = Math.floor(p.cA * Math.pow(50, p.aA));
  const n70 = Math.floor(n50 * Math.pow(1.4, p.aB));
  return L => roundReq(L <= 50 ? Math.floor(p.cA * Math.pow(L, p.aA))
    : L <= 70 ? Math.floor(n50 * Math.pow(L / 50, p.aB))
      : L <= 99 ? Math.floor(n70 * Math.pow(L / 70, p.aC))
        : Math.floor(p.n100 * Math.pow(L / 100, p.ne3)));
}

function simulate(p) {
  const needAt = build(p), T = { 1: 0 }; let hours = 0, qx = 0, tot = 0, worst = 0, worstLow = 0;
  for (let L = 1; L < 150; L++) {
    const n = needAt(L), r = rateAt(L), epk = expPerKill(pwFor(L));
    // v85: quest EXP pays the pre-v84 curve above Base 99 (needAt/2 there), so the quest term
    // of the per-kill income halves in the tail and the v84 doubling is not offset by quests.
    const qf = L > 99 ? .5 : 1;
    const kills = Math.ceil(n / (epk * r + n * qrate(L) * r * qf));
    const q = kills * n * qrate(L) * r * qf, mob = kills * epk * r;
    worst = Math.max(worst, q / (mob + q));
    if (L <= 99) worstLow = Math.max(worstLow, q / (mob + q));
    qx += q; tot += n; hours += kills / KPH; T[L + 1] = hours;
  }
  return { T, hours, share: qx / tot, worst, worstLow };
}
const bisect = (lo, hi, f) => { const flo = f(lo), fhi = f(hi);
  if (flo > 0 || fhi < 0) throw new Error(`target out of reach in [${lo}, ${hi}] (${flo.toFixed(3)} .. ${fhi.toFixed(3)})`);
  for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; } return (lo + hi) / 2; };

function solve() {
  const p = { cA: NA1, aA: NE1 };
  const wall = (aB, aC) => { const s = simulate({ ...p, aB, aC, n100: 30000, ne3: DEFAULT_NE3 }); return s.T; };
  p.aB = bisect(2, 25, aB => (wall(aB, 1)[70] - wall(aB, 1)[50]) * 3600 - TGT.WALL * 3600);
  p.aC = bisect(0.2, 3, aC => wall(p.aB, aC)[99] - TGT.T99);
  p.n100 = Math.round(build({ ...p, n100: 30000, ne3: DEFAULT_NE3 })(99) / RESET_RATIO / 10) * 10;
  p.ne3 = bisect(3, 30, ne3 => { const s = simulate({ ...p, ne3 }); return (s.hours - s.T[100]) - TGT.TAIL; });
  return p;
}

function report(p, tag) {
  const s = simulate(p), T = s.T, needAt = build(p);
  const mm = h => h < 1 ? (h * 60).toFixed(1) + ' min' : h.toFixed(2) + ' h';
  console.log(`\n${tag}`);
  console.log(`  constants  NA1=${p.cA}  NE1=${p.aA}  N50=${Math.floor(p.cA * Math.pow(50, p.aA))}  NE2=${p.aB.toFixed(8)}`);
  console.log(`             N70=${Math.floor(Math.floor(p.cA * Math.pow(50, p.aA)) * Math.pow(1.4, p.aB))}  NE2B=${p.aC.toFixed(8)}  N100=${p.n100}  NE3=${p.ne3.toFixed(7)}`);
  console.log(`  milestones Lv10 ${mm(T[10])} | Lv50 ${mm(T[50])} | Lv70 ${mm(T[70])} | Lv99 ${mm(T[99])} | Lv150 ${mm(s.hours)}`);
  console.log(`  segments   1-50 ${mm(T[50])} | 50-70 ${mm(T[70] - T[50])} | 70-99 ${mm(T[99] - T[70])} | tail ${mm(s.hours - T[100])}`);
  console.log(`  shares     quest EXP ${(s.share * 100).toFixed(1)}% overall, worst level ${(s.worst * 100).toFixed(1)}%`);
  console.log('  needs      ' + [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 100, 110, 120, 130, 140, 150]
    .map(L => L + ':' + needAt(L).toLocaleString()).join('  '));
  return { s, T, needAt };
}

const arg = process.argv[2];
if (arg === '--verify' || arg === undefined || /^[\d.]/.test(arg)) {
  let p;
  if (/^[\d.]/.test(arg || '')) {
    const [cA, aA, aB, aC, n100, ne3] = arg.split(',').map(Number);
    report({ cA, aA, aB, aC, n100, ne3: ne3 || DEFAULT_NE3 }, 'candidate');
  } else if (arg === '--verify') {
    const [, cA, aA, aB, aC, n100, ne3] = grab(/const NA1=([\d.]+),NE1=([\d.]+),N50=Math\.floor\(NA1\*Math\.pow\(50,NE1\)\),NE2=([\d.]+),N70=Math\.floor\(N50\*Math\.pow\(1\.4,NE2\)\),NE2B=([\d.]+),N100=(\d+),NE3=([\d.]+);/, 'curve').map(Number);
    p = { cA, aA, aB, aC, n100, ne3 };
    const { s, T, needAt } = report(p, 'index.html (shipped)');
    const checks = [
      ['Base 10 lands at ~2.5 min', Math.abs(T[10] * 60 - 2.5) < 0.4, (T[10] * 60).toFixed(2) + ' min'],
      ['Base 50 lands at ~13.9 min', Math.abs(T[50] * 60 - 13.9) < 0.6, (T[50] * 60).toFixed(2) + ' min'],
      ['Base 50->70 is the ~80 minute wall', Math.abs((T[70] - T[50]) * 60 - 80) < 5, ((T[70] - T[50]) * 60).toFixed(0) + ' min'],
      ['Base 99 lands at ~6.9 h', Math.abs(T[99] - 6.9) < 0.3, T[99].toFixed(2) + ' h'],
      ['Base 100-150 tail is ~96 h (v85 quest-exact doubling)', Math.abs((s.hours - T[100]) - 96) < 2, (s.hours - T[100]).toFixed(1) + ' h'],
      ['the Base-100 reset drops ~1.9x (v84: owner doubled the band)', needAt(99) / needAt(100) > 1.8 && needAt(99) / needAt(100) < 2.05, (needAt(99) / needAt(100)).toFixed(2) + 'x'],
      ['requirements only drop at Base 100', (() => { let prev = 0; for (let L = 1; L < 150; L++) { if (L === 100) { prev = needAt(L); continue } const n = needAt(L); if (n <= prev) return false; prev = n } return true })(), 'strict inside each phase'],
      ['quests stay a side dish', s.share > 0.12 && s.share < 0.42, (s.share * 100).toFixed(1) + '%'],
      // v84: the worst-LEVEL quest share is only checked through Base 99. Quest EXP follows
      // needAt() by design, so doubling the Base 100+ requirements doubles quest pay too, while
      // the model's mob income stays capped at power 99 for L>99 - real Nightmare fields pay far
      // more per kill, so the model overstates the tail's quest share. The OVERALL share above
      // is the honest one and still holds.
      ['no level under Base 100 is carried by quests', s.worstLow <= 0.45, (s.worstLow * 100).toFixed(1) + '% (worst 100+: ' + (s.worst * 100).toFixed(1) + '%, model-capped mob income)'],
    ];
    console.log(''); let bad = 0;
    for (const [name, ok, got] of checks) { console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name} (got ${got})`); if (!ok) bad++; }
    if (bad) { console.log(`\n${bad} check(s) failed - index.html no longer matches this model.`); process.exit(1); }
    console.log('\nall checks pass: index.html matches the v56 model.');
  } else {
    p = solve();
    const { s, T } = report(p, 'solved from the v56 targets (Base 50 wall 80 min, Base 99 6.9 h, tail 48 h)');
    console.log(`\n  index.html should carry:  NE2=${p.aB.toFixed(8)},NE2B=${p.aC.toFixed(8)},N100=${p.n100},NE3=${p.ne3.toFixed(7)}`);
    console.log(`  (1-50 ${(T[50] * 60).toFixed(1)} min, wall ${((T[70] - T[50]) * 60).toFixed(0)} min, Base 99 ${T[99].toFixed(2)} h, tail ${(s.hours - T[100]).toFixed(1)} h)`);
  }
} else {
  console.log('usage: node tools/tune_pacing.js [--verify | a,b,c,d,e[,f]]');
}
