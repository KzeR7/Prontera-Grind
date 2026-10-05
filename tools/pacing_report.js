// tools/pacing_report.js — what the current EXP/Zeny curves mean in gameplay time.
//   node tools/pacing_report.js            # the full report (milestones, early levels, jobs)
//   node tools/pacing_report.js --levels 1-30   # level-by-level table for a level range
//
// This is a read-only report: it changes nothing and is not part of the test suite. It uses the
// same canonical model the balance was solved with (tools/tune_pacing.js, economy_sim.js):
//
//   * 800 kills/hour on the level-appropriate field (pwOf: Prontera p1-10, the early class
//     fields through p50, then power ~= Base Lv), with a boss every 16th kill;
//   * mob EXP = EXPK*pw^1.5/50, boss EXP = BOSEK*pw^1.5/50, both multiplied by expRate()
//     (3x the normal 70x through Base 70, 70x to 99, 70/3x at 100+);
//   * requirement = needAt(Base Lv) and quest EXP = needAt(L) * qrOf(L), both read live
//     out of index.html, so the report follows the game instead of describing an old build.
//
// Every constant is read from index.html. If a constant is renamed this tool throws rather than
// printing a stale number.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot read ' + name + ' from index.html'); return m; };

// ---- constants, straight out of the game ------------------------------------------------
const [, EXPK, BOSEK] = pick(/const EXPK=([\d.]+),BOSEK=([\d.]+),ZK=\[(\d+),(\d+)\],BZK=\[(\d+),(\d+)\];/, 'EXPK/BOSEK/ZK/BZK');
const ZK = pick(/const EXPK=[\d.]+,BOSEK=[\d.]+,ZK=\[(\d+),(\d+)\],BZK=\[(\d+),(\d+)\];/, 'ZK/BZK').slice(1, 3).map(Number);
const BZK = pick(/const EXPK=[\d.]+,BOSEK=[\d.]+,ZK=\[\d+,\d+\],BZK=\[(\d+),(\d+)\];/, 'BZK').slice(1, 3).map(Number);
const QXP = (() => { const m = pick(/const QXP=\{kill:1\/(\d+),loot:1\/(\d+),boss:1\/(\d+)\}/, 'QXP'); return { kill: 1 / +m[1], loot: 1 / +m[2], boss: 1 / +m[3] }; })();
const [, NA1, NE1, NE2] = pick(/const NA1=([\d.]+),NE1=([\d.]+),N50=Math\.floor\(NA1\*Math\.pow\(50,NE1\)\),NE2=([\d.]+),N100=(\d+),NE3=([\d.]+);/, 'needAt constants');
const N100 = +pick(/N100=(\d+),NE3=/, 'N100')[1], NE3 = +pick(/N100=\d+,NE3=([\d.]+);/, 'NE3')[1];
const [, BOOST_LV, BOOST_X] = pick(/const EXP_BOOST_LV=(\d+),EXP_BOOST_X=(\d+);/, 'EXP boost band');
const EARLY_PWR = [...pick(/const EARLY_PWR=\[([\s\S]*?)\];/, 'EARLY_PWR')[1].matchAll(/\[(\d+),(\d+)\]/g)].map(m => [+m[1], +m[2]]);
const JOFF = pick(/const JOFF=\[([^\]]+)\];/, 'JOFF')[1].split(',').map(Number);
const MPS = 15, KILLS_PER_HOUR = 800;   // the model's own numbers (pack size, cadence)

const needAt = L => L <= 50 ? Math.floor(NA1 * Math.pow(L, NE1))
  : L <= 99 ? Math.floor(Math.floor(NA1 * Math.pow(50, NE1)) * Math.pow(L / 50, NE2))
    : Math.floor(N100 * Math.pow(L / 100, NE3));
const pwOf = L => { if (L <= 10) return Math.max(1, L | 0); for (const [cap, p] of EARLY_PWR) if (L <= cap) return p; return Math.min(99, L | 0); };
const expRate = L => L <= +BOOST_LV ? 70 * +BOOST_X : L < 100 ? 70 : 70 / 3;
const mobExp = p => Math.max(1, Math.floor(+EXPK * Math.pow(p, 1.5) / 50));
const bossExp = p => Math.max(1, Math.floor(+BOSEK * Math.pow(p, 1.5) / 50));
const expPerKill = p => (MPS * mobExp(p) + bossExp(p)) / (MPS + 1);
const avg = a => (a[0] + a[1]) / 2;
const mobZeny = p => Math.max(1, Math.floor(avg(ZK) * p * p / 1000));
const bossZeny = p => Math.max(1, Math.floor(avg(BZK) * p * p / 1000));
const zenyPerKill = p => (MPS * mobZeny(p) + bossZeny(p)) / (MPS + 1);
const qrOf = L => QXP.kill / (12 + 2 * L) + .126 * QXP.loot / (3 + Math.floor(L / 3)) + (L >= 12 ? QXP.boss / ((MPS + 1) * (1 + Math.floor(L / 10))) : 0);
// Quest Zeny: a completed quest pays goal * QZ[type] * zenAt(power), and the goal is exactly the
// work that completed it, so every goal cancels: income per kill is zenAt(power) * the QZ mix.
const QZ = (() => { const m = pick(/const QXP=\{[^}]+\},QZ=\{kill:([\d.]+),loot:([\d.]+),boss:([\d.]+)\}/, 'QZ'); return { kill: +m[1], loot: +m[2], boss: +m[3] }; })();
const zenAt = p => Math.max(1, Math.round(.011 * p * p));
const questZenyPerKill = (p, L) => zenAt(p) * (QZ.kill + .126 * QZ.loot + (L >= 12 ? QZ.boss / (MPS + 1) : 0));

// ---- one pass over the whole climb --------------------------------------------------------
const rows = []; let hours = 0, zeny = 0;
for (let L = 1; L < 150; L++) {
  const p = pwOf(L), n = needAt(L), rate = expRate(L);
  const perMobKill = mobExp(p) * rate;                 // the number the log line shows per regular kill
  const perKillXp = expPerKill(p) * rate;
  const kills = Math.ceil(n / (perKillXp + n * qrOf(L) * rate));
  const levelHours = kills / KILLS_PER_HOUR;
  const levelZeny = kills * (zenyPerKill(p) + questZenyPerKill(p, L));
  hours += levelHours; zeny += levelZeny;
  rows.push({ L, p, need: n, perMobKill, kills, hours, levelHours, zPerKill: zenyPerKill(p), zeny, cumZeny: zeny });
}
// level 150 is the cap: you never pass through it, so its row carries the arrival totals
rows.push({ ...rows[rows.length - 1], L: 150, need: needAt(150), kills: 0, levelHours: 0, perMobKill: rows[rows.length - 1].perMobKill });
const at = L => rows[Math.min(L, 150) - 1];
const hm = h => { const m = Math.floor(h * 60), s = Math.round((h * 60 - m) * 60); return (h >= 1 ? Math.floor(h) + 'h ' + m % 60 + 'm' : m + 'm ' + s + 's'); };
const nz = n => Math.round(n).toLocaleString('en-US');

// ---- report ---------------------------------------------------------------------------------
const wantLevels = (() => { const i = process.argv.indexOf('--levels'); return i >= 0 ? process.argv[i + 1] : null; })();
console.log('Prontera Grind — level curve by gameplay time (canonical model: ' + KILLS_PER_HOUR + ' kills/hour, boss every ' + (MPS + 1) + ' kills)\n');
console.log('EXP per kill is what the kill log shows for a regular monster on the level-appropriate field;');
console.log('Zeny per kill averages that field\'s pack with its boss share. Requirements are needAt(Base Lv).\n');

if (wantLevels) {
  const [a, b] = wantLevels.split('-').map(Number);
  console.log('lv  field  EXP/kill   EXP to next   kills   time this level   total time   Zeny/kill');
  for (let L = a; L <= b; L++) { const r = at(L);
    console.log(String(L).padStart(2) + '  p' + String(r.p).padEnd(4) + ' ' + nz(r.perMobKill).padStart(9) + '  ' + nz(r.need).padStart(12) + '  ' + String(r.kills).padStart(5) + '  ' + hm(r.levelHours).padStart(15) + '  ' + hm(r.hours).padStart(11) + '  ' + nz(r.zPerKill).padStart(9)); }
} else {
  console.log('=== the whole climb: milestones ===');
  console.log('Base Lv   field  EXP/kill   EXP to next   kills   time this level   total time   Zeny earned');
  for (const L of [1, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 99, 100, 110, 120, 130, 140, 150]) { const r = at(L);
    console.log(String(L).padStart(7) + '   p' + String(r.p).padEnd(4) + ' ' + nz(r.perMobKill).padStart(9) + '  ' + nz(r.need).padStart(12) + '  ' + String(r.kills).padStart(5) + '  ' + hm(r.levelHours).padStart(15) + '  ' + hm(r.hours).padStart(11) + '  ' + nz(r.cumZeny).padStart(12)); }
  console.log('\n=== the early game, level by level (Base 1-20) ===');
  console.log('Base Lv   field  EXP/kill   EXP to next   kills   time this level   total time   Zeny/kill');
  for (let L = 1; L <= 20; L++) { const r = at(L);
    console.log(String(L).padStart(7) + '   p' + String(r.p).padEnd(4) + ' ' + nz(r.perMobKill).padStart(9) + '  ' + nz(r.need).padStart(12) + '  ' + String(r.kills).padStart(5) + '  ' + hm(r.levelHours).padStart(15) + '  ' + hm(r.hours).padStart(11) + '  ' + nz(r.zPerKill).padStart(9)); }
  console.log('\n=== the same curve, said in words ===');
  console.log('Base 10   ' + hm(at(10).hours).padEnd(9) + ' first job change');
  console.log('Base 46   ' + hm(at(46).hours).padEnd(9) + ' second job change gate (JOFF says Base 46)');
  console.log('Base 50   ' + hm(at(50).hours).padEnd(9) + ' the second-job endgame begins (2nd job gate is Base 50)');
  console.log('Base 70   ' + hm(at(70).hours).padEnd(9) + ' the ' + BOOST_X + 'x band ends, the 70x grind begins');
  console.log('Base 99   ' + hm(at(99).hours).padEnd(9) + ' transcendent gate, then the deliberate reset at 100');
  console.log('Base 150  ' + hm(at(150).hours).padEnd(9) + ' cap (the last ten levels alone are ' + hm(at(150).hours - at(140).hours) + ')');
  console.log('\n=== what the first hour pays (Zeny) ===');
  for (const L of [10, 20, 30, 50]) console.log('by Base ' + String(L).padEnd(3) + ' ' + nz(at(L).cumZeny).padStart(9) + ' Zeny earned in total');
}

console.log('\n(read straight from index.html: EXPK=' + EXPK + ', BOSEK=' + BOSEK + ', ZK=[' + ZK + '], BZK=[' + BZK + '], ' +
  'EX P band ' + BOOST_X + 'x through Lv' + BOOST_LV + ', needAt seeds ' + NA1 + '/' + NE1 + '/' + NE2 + '/' + N100 + '/' + NE3 + ')');
console.log('Elapsed times are the model\'s, not a promise: class, gear, Speed x2/x4 and play style all move them.');
