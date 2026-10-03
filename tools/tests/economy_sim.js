// Economy: EXP / Zeny / quest rewards, against the real constants and formulas
// pulled out of index.html.
//   node tools/tests/economy_sim.js
//
// The rules being tested:
//   * Base Lv 1 -> 150 takes about 100 hours at ~800 kills/hour for a NORMAL
//     account (the GM multiplier must not be baked into the curve);
//   * quests supply roughly a third of all EXP, and scale with need(Lv) rather
//     than drifting away from it - the old formula divided by 100 and paid a
//     normal player 1% of what it paid the GM account;
//   * endgame Zeny income is on the same scale as the Zeny sinks (refining and
//     pet mutation rolls), not three orders of magnitude below them.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const econ = grab('// ---------- economy tuning ----------', '// ---------- state ----------');
const nq = grab('function newQuest(type){', '\nconst qTxt=');

// needAt() is the curve the whole game levels by; pin it so a change is deliberate.
if (!/needAt=L=>Math\.floor\(38\*Math\.pow\(L,1\.75\)\)/.test(src))
  throw new Error('needAt() formula changed - update this test deliberately');

const harness = `
${econ}
${nq}
const needAt = L => Math.floor(38 * Math.pow(L, 1.75));
let S = null, PW = 1;
const gx = () => S.gm ? (S.gmx || 100) : 1;
const pw = () => PW;
this.__e = { newQuest, needAt, EXPK, BOSEK, ZK, BZK, QXP, QZ, zenAt,
             set S(v){S=v}, get S(){return S}, set PW(v){PW=v}, get PW(){return PW} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const E = sb.__e;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('economy: EXP curve, quest share, Zeny scale\n');

// ---- the model the balance was solved with ------------------------------------
// The player camps the level-10 (boss) field of the map whose band covers them.
// spawn() puts a boss up every MPS+1 kills, so effective EXP per kill is a blend.
const MAP_B = [0, 9, 19, 31, 43, 59, 66, 73, 79, 89];
const BAND = [[12,0],[24,1],[34,2],[46,3],[60,4],[67,5],[74,6],[80,7],[90,8],[99,9]];
const MPS = 15, KILLS_PER_HOUR = 800;
const pwFor = lv => { for (const [cap, m] of BAND) if (lv <= cap) return MAP_B[m] + 10; return 99; };
const mobExp = p => Math.max(1, Math.floor(E.EXPK * Math.pow(p, 1.5) / 50));
const bossExp = p => Math.max(1, Math.floor(E.BOSEK * Math.pow(p, 1.5) / 50));
const expPerKill = p => (MPS * mobExp(p) + bossExp(p)) / (MPS + 1);
const mobZeny = p => ((E.ZK[0] + E.ZK[1]) / 2) * p * p / 1000;
const bossZeny = p => ((E.BZK[0] + E.BZK[1]) / 2) * p * p / 1000;
const zenyPerKill = p => (MPS * mobZeny(p) + bossZeny(p)) / (MPS + 1);

// quest completions per level, then the EXP they pay out
function questShare() {
  let totalNeed = 0, questXp = 0;
  for (let L = 1; L < 150; L++) {
    const p = pwFor(L), n = E.needAt(L);
    E.S = { lv: L, gm: false }; E.PW = p;
    // mobs deliver the rest, so kills/level depends on the share we are measuring:
    // solve it self-consistently from the mob side only, quests are additive.
    const kills = Math.ceil(n * 0.7 / expPerKill(p));
    const nKill = kills / (12 + 2 * L);
    const nLoot = (kills * 0.0385) / (3 + Math.floor(L / 3));
    const nBoss = L >= 12 ? (kills / (MPS + 1)) / (1 + Math.floor(L / 10)) : 0;
    totalNeed += n;
    questXp += nKill * E.newQuest('kill').xp + nLoot * E.newQuest('loot').xp + nBoss * E.newQuest('boss').xp;
  }
  return questXp / totalNeed;
}
function totalKills(share) {
  let k = 0;
  for (let L = 1; L < 150; L++) { const p = pwFor(L); k += Math.ceil(E.needAt(L) * (1 - share) / expPerKill(p)); }
  return k;
}
function totalZeny(share) {
  let z = 0;
  for (let L = 1; L < 150; L++) { const p = pwFor(L); z += Math.ceil(E.needAt(L) * (1 - share) / expPerKill(p)) * zenyPerKill(p); }
  return z;
}

const SHARE = questShare();
const KILLS = totalKills(SHARE);
const HOURS = KILLS / KILLS_PER_HOUR;

t('mob EXP at the endgame field is the tuned value', () => {
  assert.strictEqual(mobExp(99), 108, 'pw99 mob exp');
  assert.strictEqual(bossExp(99), 906, 'pw99 boss exp');
  assert.strictEqual(mobExp(1), 1, 'pw1 mob exp must not be 0');
});

t('EXP grows with the field power level, never backwards', () => {
  let prev = 0;
  for (const p of [1, 10, 29, 43, 59, 73, 89, 99]) { const e = mobExp(p); assert.ok(e >= prev, 'exp fell at pw' + p); prev = e; }
});

t('quests pay a fraction of need(Lv), not a flat number', () => {
  E.S = { lv: 150, gm: false }; E.PW = 99;
  const n = E.needAt(150);
  assert.strictEqual(E.newQuest('kill').xp, Math.floor(n * E.QXP.kill));
  assert.strictEqual(E.newQuest('loot').xp, Math.floor(n * E.QXP.loot));
  assert.strictEqual(E.newQuest('boss').xp, Math.floor(n * E.QXP.boss));
  assert.strictEqual(E.newQuest('boss').xp, 12858, 'boss quest xp at Lv150');
});

t('quest EXP scales with level instead of drifting', () => {
  E.S = { gm: false };
  E.S.lv = 50; E.PW = pwFor(50); const a = E.newQuest('kill').xp;
  E.S.lv = 100; E.PW = pwFor(100); const b = E.newQuest('kill').xp;
  assert.ok(b > a * 2, 'quest exp should track need(Lv) growth');
  assert.ok(b / a < 6, 'quest exp grew implausibly fast');
});

t('the old /100 bug is gone: a normal player is not paid 1% of the GM', () => {
  E.PW = 99;
  E.S = { lv: 150, gm: false }; const normal = E.newQuest('kill');
  E.S = { lv: 150, gm: true, gmx: 100 }; const gm = E.newQuest('kill');
  // both are floored independently, so compare the ratio, not exact multiples
  const ratioXp = gm.xp / normal.xp, ratioZ = gm.z / normal.z;
  assert.ok(ratioXp > 99 && ratioXp < 101, 'GM x100 should be ~100x exp, got ' + ratioXp.toFixed(2));
  assert.ok(ratioZ > 99 && ratioZ < 101, 'GM x100 should be ~100x zeny, got ' + ratioZ.toFixed(2));
  assert.ok(normal.xp > 1000, 'a Lv150 kill quest paying ' + normal.xp + 'xp is the old bug');
});

t('quests supply about a third of all EXP (got ' + (SHARE * 100).toFixed(1) + '%)', () => {
  assert.ok(SHARE > 0.25, 'quests too weak: ' + (SHARE * 100).toFixed(1) + '%');
  assert.ok(SHARE < 0.40, 'quests too strong: ' + (SHARE * 100).toFixed(1) + '%');
});

t('Lv 1 -> 150 takes about 100h at ' + KILLS_PER_HOUR + ' kills/h (got ' + HOURS.toFixed(1) + 'h)', () => {
  assert.ok(HOURS > 85, 'too fast: ' + HOURS.toFixed(1) + 'h');
  assert.ok(HOURS < 115, 'too slow: ' + HOURS.toFixed(1) + 'h');
  console.log('       ' + KILLS.toLocaleString() + ' kills, ' + HOURS.toFixed(1) + ' hours, quests ' + (SHARE * 100).toFixed(1) + '%');
});

t('a full run earns enough Zeny for the endgame sinks', () => {
  const z = totalZeny(SHARE);
  const refCost = (r, sec) => Math.round(200 * (r + 1) * (1 + sec * .5));
  const refCh = [100,100,100,100,70,60,50,40,30,20];
  let oneSlot = 0; for (let r = 0; r < 10; r++) oneSlot += refCost(r, 3) / (refCh[r] / 100);
  const fullSetup = oneSlot * 7;
  assert.ok(z > fullSetup * 5, 'only ' + Math.round(z / fullSetup) + 'x a full +10 setup - refining is unaffordable');
  assert.ok(z > 200 * 10000, 'only ' + Math.round(z / 10000) + ' pet mutation rolls affordable');
  console.log('       ' + Math.round(z).toLocaleString() + 'z total = ' + (z / fullSetup).toFixed(1) + 'x a 7-slot +10 setup, ' + Math.round(z / 10000) + ' pet rolls');
});

t('endgame Zeny per kill is on the same scale as a refine attempt', () => {
  const perKill = zenyPerKill(99);
  assert.ok(perKill > 50, 'pw99 pays ' + perKill.toFixed(0) + 'z/kill - was 7 before this change');
  assert.ok(perKill < 2000, 'pw99 pays ' + perKill.toFixed(0) + 'z/kill - inflated');
});

t('low-level Zeny is not inflated (a Lv1 kill is still pocket change)', () => {
  assert.ok(mobZeny(1) < 1, 'pw1 should pay ~0 before the max(1,...) floor');
  E.S = { lv: 1, gm: false }; E.PW = 1;
  assert.ok(E.newQuest('kill').z < 200, 'a Lv1 quest should not pay endgame money');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
