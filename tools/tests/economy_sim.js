// Live pacing regression: the model includes 70x normal EXP below Base 100, 70/3x at 100+,
// the quest formulas, the doubled-gear loot cadence, and the Lv100 reset.
// Economy: EXP / Zeny / quest rewards, against the real constants and formulas
// pulled out of index.html.
//   node tools/tests/economy_sim.js
//
// The rules being tested:
//   * live pacing anchors hold (owner): about 7 min to Base Lv10, 2 h to Lv50, about
//     5 more hours from Lv50 to Lv99, then a much harder 48 h (2-day) Lv100-150 tail
//     after the one-time reset; solved at ~800 kills/hour on the band map's boss field;
//   * job bars mirror the base curve (JOFF lockstep), so the job gates land on those
//     same anchors;
//   * quests pay a fraction of need(Lv) and can never carry more than ~40% of a level
//     (or the high end plays as quest errands instead of a grind);
//   * endgame Zeny income is on the same scale as the Zeny sinks (refining and
//     pet mutation rolls), not three orders of magnitude below them.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const econ = grab('// ---------- economy tuning ----------', '// ---------- state ----------');
const nq = grab('function qScale(q){', '\nconst qTxt=');   // qScale + newQuest + qRefresh
// epkOf/qrOf read MPS, which lives on the arena-geometry line above the economy block
const arena = grab('const SU=k=>', ',K5=[') + ';';

// The curve the whole game levels by is pinned so a change is deliberate. It is two
// continuous power segments up to 99, then the deliberate reset at 100 and steep 100-150 tail.
if (!/const NA1=132\.99332769,NE1=1\.87201222,N50=Math\.floor\(NA1\*Math\.pow\(50,NE1\)\),NE2=3\.05002160,N100=419344,NE3=8\.40337760;/.test(src))
  throw new Error('needAt() curve constants changed - update this test deliberately');
if (!/needAt=L=>L<=50\?Math\.floor\(NA1\*Math\.pow\(L,NE1\)\):L<=99\?Math\.floor\(N50\*Math\.pow\(L\/50,NE2\)\):Math\.floor\(N100\*Math\.pow\(L\/100,NE3\)\)/.test(src))
  throw new Error('needAt() formula changed - update this test deliberately');
if (!/const JOFF=\[0,9,49,98\];/.test(src))
  throw new Error('JOFF job/base lockstep offsets changed - update this test deliberately');
if (!/const QXP=\{kill:1\/1400,loot:1\/1750,boss:1\/840\}/.test(src))
  throw new Error('QXP quest fractions changed - update this test deliberately');
if (!/Math\.random\(\)<mob\.oreCh\)/.test(src))
  throw new Error('ore drop gate changed - update gear_sim deliberately');

const petc = grab('const EGG=3000,', 'const petDmg=');
const peq = (src.match(/peqCost=t=>[^,;]+/) || [null])[0];
if (!peq) throw new Error('cannot find peqCost');

const harness = `
${arena}
${econ}
${nq}
${petc}
this.__pet = { PTG, GREAT, PT, peqCost: eval('(' + ${JSON.stringify('t=>' + peq.split('=>')[1])} + ')') };
const needAt=L=>L<=50?Math.floor(NA1*Math.pow(L,NE1)):L<=99?Math.floor(N50*Math.pow(L/50,NE2)):Math.floor(N100*Math.pow(L/100,NE3));
let S = null, PW = 1;
const gx = () => S.gm ? (S.gmx || 100) : 1;
const pw = () => PW;
this.__e = { expRate, qRefresh, newQuest, needAt, EXPK, BOSEK, ZK, BZK, QXP, QZ, zenAt, pwOf, epkOf, qrOf, JOFF,
             set S(v){S=v}, get S(){return S}, set PW(v){PW=v}, get PW(){return PW} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const E = sb.__e;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('economy: live 70x/70÷3x pacing, quest share, job gates and Zeny scale\n');

// ---- the model the balance was solved with (same as tools/tune_pacing.js) ----------
// The player camps the Stage-10 field of the map band. A boss replaces the pack every
// MPS+1 kills; quest XP uses the current live multiplier and loot progress uses the
// expected .126 equipment pickups per kill after the doubled drop rates. Each level is
// self-consistent: kills = need / (epk*rate + need*qrate*rate).
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
const rateFor = L => L < 100 ? 70 : 70 / 3;
const killsFor = L => { const p = pwFor(L), n = E.needAt(L), rate = rateFor(L);
  return Math.ceil(n / (expPerKill(p) * rate + n * E.qrOf(L) * rate)); };

function baseTimeline() {
  let hours = 0, questXp = 0, totalNeed = 0, worst = 0; const T = { 1: 0 };
  for (let L = 1; L < 150; L++) {
    const p = pwFor(L), n = E.needAt(L), rate = rateFor(L), kills = killsFor(L);
    const mobXp = kills * expPerKill(p) * rate, qxp = kills * n * E.qrOf(L) * rate;
    worst = Math.max(worst, qxp / (mobXp + qxp));
    questXp += qxp; totalNeed += n; hours += kills / KILLS_PER_HOUR; T[L + 1] = hours;
  }
  return { T, hours, share: questXp / totalNeed, worst };
}
// Job gates under the JOFF lockstep: assume the player changes class the moment a gate
// opens; leftover job exp follows them into the next class.
function jobGates() {
  const GATE = [10, 40, 50], jl = [1, 1, 1, 1], jx = [0, 0, 0, 0], gates = [];
  let tier = 0, hours = 0;
  for (let L = 1; L < 150 && tier < 3; L++) {
    const p = pwFor(L); hours += killsFor(L) / KILLS_PER_HOUR;
    let je = 0.7 * killsFor(L) * expPerKill(p) * rateFor(L);   // quests pay Base EXP only
    while (je > 0 && tier < 3) {
      if (jl[tier] >= GATE[tier]) { tier++; continue; }
      const Lj = jl[tier] + E.JOFF[tier], n = E.needAt(Lj), r = rateFor(Lj), e = E.epkOf(Lj) * r, q = E.qrOf(Lj) * r;
      const cost = Math.max(1, Math.floor(.7 * n * e / (e + n * q)));
      const take = Math.min(je, cost - jx[tier]); jx[tier] += take; je -= take;
      if (jx[tier] >= cost) { jl[tier]++; jx[tier] = 0; if (jl[tier] >= GATE[tier]) gates[tier] = { hours, base: L + 1 }; }
    }
  }
  return gates;
}
function totalZeny() { let z = 0; for (let L = 1; L < 150; L++) z += killsFor(L) * zenyPerKill(pwFor(L)); return z; }

const TL = baseTimeline();
const GATES = jobGates();

t('mob EXP at the endgame field is the tuned value', () => {
  assert.strictEqual(mobExp(99), 108, 'pw99 mob exp');
  assert.strictEqual(bossExp(99), 906, 'pw99 boss exp');
  assert.strictEqual(mobExp(1), 1, 'pw1 mob exp must not be 0');
});

t('EXP grows with the field power level, never backwards', () => {
  let prev = 0;
  for (const p of [1, 10, 29, 43, 59, 73, 89, 99]) { const e = mobExp(p); assert.ok(e >= prev, 'exp fell at pw' + p); prev = e; }
});

t('the curve is strictly increasing within each phase, with the rebirth drop at 100', () => {
  let prev = 0;
  for (let L = 1; L < 150; L++) {
    if (L === 100) { prev = E.needAt(L); continue; }   // the one deliberate drop
    const n = E.needAt(L); assert.ok(n > prev, 'needAt(' + L + ') = ' + n + ' <= ' + prev); prev = n;
  }
  assert.strictEqual(E.needAt(10), 9904, 'early requirement anchor');
  assert.strictEqual(E.needAt(50), 201521, 'Base 50 anchor');
  assert.strictEqual(E.needAt(99), 1618659, 'Base 99 anchor');
  // The level-100 reset is deliberate; the much steeper endgame ramp climbs through 150.
  assert.ok(E.needAt(100) < E.needAt(99), 'level 100 must be cheaper than 99 at the reset');
  const drop = E.needAt(99) / E.needAt(100);
  assert.ok(drop > 3 && drop < 5, 'the reset should be about 3.9x, got x' + drop.toFixed(1));
  assert.strictEqual(E.needAt(100), 419344, 'Base 100 reset floor');
  assert.strictEqual(E.needAt(150), 12657029, 'level cap');
});

t('normal EXP is 70x below 100 and one-third thereafter; GM is unchanged', () => {
  for(const lv of [1,10,60,99,100,150]){
    E.S={lv,gm:false}; assert.strictEqual(E.expRate(),lv<100?70:70/3);
    E.S.gm=true; assert.strictEqual(E.expRate(),100);
    E.S.gmx=25; assert.strictEqual(E.expRate(),25);
  }
  assert.ok(src.includes('xp=Math.round(mob.exp*expRate())'), 'kill Base EXP wiring');
  assert.ok(src.includes('addJob(Math.round(Math.round(mob.exp*.7)*expRate()))'), 'kill Job EXP wiring');
  assert.ok(src.includes("mob.zeny*(1+pv('zeny')/100))*g"));
});
t('the real kill reward block boosts Base/Job EXP but leaves player Zeny unchanged', () => {
  const rewards=grab('  const g=gx();S.kills++','  addFloat(mob.x,2.4,mob.z,');
  for(const level of [1,99,100,150])for(const gm of [false,true]){
    const world={};vm.createContext(world);
    vm.runInContext(`
      const S={lv:${level},gm:${gm},gmx:100,kills:0,kl:0,zeny:0,exp:0};
      const gx=()=>S.gm?S.gmx:1;
      ${src.match(/const expRate=[^;]+;/)[0]}
      const mob={exp:100,zeny:10,boss:false},pv=()=>0,qProg=()=>{};
      let jobXP=0,pend=[],zenyEarned=0;const addJob=x=>jobXP+=x;
      ${grab('function earnZeny(amount){','function kill(o){')}
      ${rewards}
      this.result={xp:S.exp,z:S.zeny,jobXP};
    `,world);
    const rate=gm?100:level<100?70:70/3;
    assert.strictEqual(world.result.xp,Math.round(100*rate));
    assert.strictEqual(world.result.jobXP,Math.round(70*rate));
    assert.strictEqual(world.result.z,gm?1000:10);
  }
});

t('saved quests refresh to the new EXP rate without losing progress', () => {
  E.S={lv:99,gm:false,q:[{type:'kill',goal:210,prog:12,xp:1,at:99}]};
  E.qRefresh(); assert.strictEqual(E.S.q[0].prog,12);
  assert.strictEqual(E.S.q[0].xp,Math.floor(E.needAt(99)*E.QXP.kill*70));
  E.S.lv=100; E.qRefresh();
  assert.strictEqual(E.S.q[0].xp,Math.floor(E.needAt(100)*E.QXP.kill*(70/3)));
});

t('quests pay a fraction of need(Lv), not a flat number', () => {
  E.S = { lv: 150, gm: false }; E.PW = 99;
  const n = E.needAt(150);
  assert.strictEqual(E.newQuest('kill').xp, Math.floor(n * E.QXP.kill * (70/3)));
  assert.strictEqual(E.newQuest('loot').xp, Math.floor(n * E.QXP.loot * (70/3)));
  assert.strictEqual(E.newQuest('boss').xp, Math.floor(n * E.QXP.boss * (70/3)));
  assert.strictEqual(E.newQuest('boss').xp, 351584, 'boss quest xp at Lv150');
});

t('quest EXP scales with need(Lv) instead of drifting', () => {
  E.S = { gm: false };
  E.S.lv = 50; E.PW = pwFor(50); const a = E.newQuest('kill').xp;
  E.S.lv = 100; E.PW = pwFor(100); const b = E.newQuest('kill').xp;
  // At rebirth, both the requirement curve and the live EXP multiplier reset; the
  // quest reward should follow need(Lv) and that one-third post-99 rate exactly.
  const curve = E.needAt(100) / E.needAt(50) / 3;
  assert.ok(b > 0 && a > 0, 'quest rewards must stay positive across the reset');
  assert.ok(Math.abs(b / a - curve) / curve < 0.05, 'quest exp grew off-curve: ' + (b / a).toFixed(2) + ' vs ' + curve.toFixed(2));
});

t('the old /100 bug is gone: a normal player is not paid 1% of the GM', () => {
  E.PW = 99;
  E.S = { lv: 150, gm: false }; const normal = E.newQuest('kill');
  E.S = { lv: 150, gm: true, gmx: 100 }; const gm = E.newQuest('kill');
  // both are floored independently, so compare the ratio, not exact multiples
  const ratioXp = gm.xp / normal.xp, ratioZ = gm.z / normal.z;
  assert.ok(Math.abs(ratioXp - 100/(70/3)) < .01, 'GM should retain its own EXP multiplier, got ' + ratioXp.toFixed(2));
  assert.ok(ratioZ > 99 && ratioZ < 101, 'GM x100 should be ~100x zeny, got ' + ratioZ.toFixed(2));
  assert.ok(normal.xp > 1000, 'a Lv150 kill quest paying ' + normal.xp + 'xp is the old bug');
});

t('quests stay a side dish, not the meal (got ' + (TL.share * 100).toFixed(1) + '%)', () => {
  // The 100-150 reset/tail is kill-dominated, so quest XP remains a meaningful but
  // secondary global share after the lower rewards are scaled to the live EXP rates.
  assert.ok(TL.share > 0.12, 'quests too weak: ' + (TL.share * 100).toFixed(1) + '%');
  assert.ok(TL.share < 0.42, 'quests too strong: ' + (TL.share * 100).toFixed(1) + '%');
});

t('no single level is carried by quests (worst ' + (TL.worst * 100).toFixed(1) + '%)', () => {
  assert.ok(TL.worst <= 0.45, 'a level fed ' + (TL.worst * 100).toFixed(1) + '% by quests - the high end must stay a mob grind');
});

t('pacing anchor: Base Lv 10 (1st job change) in about 7 min (got ' + (TL.T[10] * 60).toFixed(1) + ' min)', () => {
  assert.ok(TL.T[10] * 60 > 6, 'too fast: ' + (TL.T[10] * 60).toFixed(1) + ' min');
  assert.ok(TL.T[10] * 60 < 8.2, 'too slow: ' + (TL.T[10] * 60).toFixed(1) + ' min');
});

t('pacing anchor: Base Lv 50 in about 2 h (got ' + TL.T[50].toFixed(2) + ' h)', () => {
  assert.ok(TL.T[50] > 1.5, 'too fast: ' + TL.T[50].toFixed(2) + ' h');
  assert.ok(TL.T[50] < 2.6, 'too slow: ' + TL.T[50].toFixed(2) + ' h');
});

t('pacing anchor: Base Lv 50 to 99 takes about 5 h (got ' + (TL.T[99] - TL.T[50]).toFixed(2) + ' h)', () => {
  const midgame = TL.T[99] - TL.T[50];
  assert.ok(midgame > 4.3, 'too fast: ' + midgame.toFixed(2) + ' h');
  assert.ok(midgame < 5.7, 'too slow: ' + midgame.toFixed(2) + ' h');
  assert.ok(TL.T[99] > 6.4 && TL.T[99] < 7.8, 'Base 99 total should be around 7 h: ' + TL.T[99].toFixed(2) + ' h');
});

t('pacing anchor: Base 100-150 is a hard ~2-day climb after the reset (got ' + (TL.hours - TL.T[100]).toFixed(1) + ' h)', () => {
  const tail = TL.hours - TL.T[100];
  assert.ok(tail > 42, 'tail too short: ' + tail.toFixed(1) + ' h');
  assert.ok(tail < 54, 'tail too long: ' + tail.toFixed(1) + ' h');
  console.log('       1->150 total: ' + TL.hours.toFixed(1) + ' h (' + TL.T[99].toFixed(1) + ' h to 99 + ' +
    tail.toFixed(1) + ' h tail) at ' + KILLS_PER_HOUR + ' kills/h');
});

t('job gates land on the anchors: base ' + GATES.map(g => g && g.base).join('/') +
  ' at ' + GATES.map(g => g && g.hours.toFixed(1) + 'h').join('/'), () => {
  assert.ok(Math.abs(GATES[0].base - 10) <= 1, '1st job gate at base ' + GATES[0].base);
  assert.ok(Math.abs(GATES[1].base - 49) <= 2, '2nd job gate at base ' + GATES[1].base);
  assert.ok(Math.abs(GATES[2].base - 99) <= 2, 'transcendent gate at base ' + GATES[2].base);
  assert.ok(GATES[0].hours < 0.4, '1st job after ' + GATES[0].hours.toFixed(2) + ' h');
  assert.ok(GATES[1].hours > 1.2 && GATES[1].hours < 3, '2nd job after ' + GATES[1].hours.toFixed(2) + ' h');
  assert.ok(GATES[2].hours > 6 && GATES[2].hours < 8.5, 'transcendent after ' + GATES[2].hours.toFixed(2) + ' h');
});

t('a full run earns enough Zeny for the endgame sinks', () => {
  const z = totalZeny();
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


// ---- pet equipment training (nerfed: it used to be an easy max-out) -----------
const PET = sb.__pet;
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
// Monte-Carlo the real ladder: roll until the stat is capped, paying the real cost per roll.
function petCost(p, great, base, trials = 20000) {
  let rolls = 0, zeny = 0, worst = 0;
  for (let i = 0; i < trials; i++) {
    let t = 0, r = 0, z = 0;
    while (t < 5) { const c = base(t); r++; z += c; if (rnd() < p[t]) t += (rnd() < great && t + 2 <= 5) ? 2 : 1; }
    rolls += r; zeny += z; worst = Math.max(worst, r);
  }
  return { rolls: rolls / trials, zeny: zeny / trials, worst };
}
const OLD = [.8, .6, .4, .25, .12], OLD_BASE = t => 1200 * (t + 1) * (t + 1);

t('the training rates are a long grind, not an easy max', () => {
  assert.strictEqual(PET.PTG.join(','), '0.4,0.25,0.15,0.09,0.05', 'PTG changed - update this test deliberately');
  assert.strictEqual(PET.GREAT, 0.05, 'GREAT changed - update this test deliberately');
  assert.strictEqual(PET.peqCost(0), 1200, 'peqCost base changed - update this test deliberately');
  assert.strictEqual(PET.peqCost(4), 1200 * 25, 'peqCost must stay quadratic');
  PET.PTG.forEach((v, i) => { if (i) assert.ok(v < PET.PTG[i - 1], 'rates must fall as the tier rises'); });
  const now = petCost(PET.PTG, PET.GREAT, PET.peqCost);
  const then = petCost(OLD, .1, OLD_BASE);
  assert.ok(now.rolls > 30, 'one stat maxes in only ' + now.rolls.toFixed(1) + ' rolls');
  assert.ok(now.rolls < 150, 'one stat takes ' + now.rolls.toFixed(1) + ' rolls - tedium, not a sink');
  assert.ok(then.rolls < 20, 'the old ladder was ' + then.rolls.toFixed(1) + ' rolls - expected a short one');
  assert.ok(now.rolls > then.rolls * 2, 'the nerf must be a big one: ' + then.rolls.toFixed(1) + ' -> ' + now.rolls.toFixed(1));
  console.log('       ' + then.rolls.toFixed(1) + ' -> ' + now.rolls.toFixed(1) + ' rolls per stat (' +
    Math.round(then.zeny).toLocaleString() + 'z -> ' + Math.round(now.zeny).toLocaleString() + 'z), ' +
    Math.round(now.zeny * 3).toLocaleString() + 'z for all three');
});

t('maxing all three pet pieces is a real endgame sink', () => {
  const now = petCost(PET.PTG, PET.GREAT, PET.peqCost);
  assert.ok(now.zeny * 3 > 1000000, 'under 1M to max a pet is too cheap: ' + Math.round(now.zeny * 3));
  assert.ok(now.zeny * 3 < 4000000, 'over 4M to max a pet is out of reach: ' + Math.round(now.zeny * 3));
  // the last point is the one that should hurt, or a maxed pet is just a matter of time
  for (let t = 0; t < 4; t++) assert.ok(PET.peqCost(4) > PET.peqCost(t), 'the top tier must be the priciest step');
  const now2 = petCost(PET.PTG, PET.GREAT, PET.peqCost);
  assert.ok(now2.worst > 30, 'even the luckiest ladder should take work: worst case ' + now2.worst + ' rolls');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
