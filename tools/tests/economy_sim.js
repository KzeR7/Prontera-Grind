// Live pacing regression: v56 puts the whole live EXP economy at one tenth of the old scale
// (7x normal EXP below Base 100, 7/3x at 100+), ends the 3x early band at Base 50, and makes
// 50-70 the deliberate mid-game wall (~80 min) - which lands Base 10 at ~2.5 min, Base 50 at
// ~14 min, Base 99 at ~6 h 55 m and the post-reset 100-150 tail at 48 h. Covers the quest
// formulas, the doubled-gear loot cadence, the Lv100 reset and the low-level Zeny floor.
// Economy: EXP / Zeny / quest rewards, against the real constants and formulas
// pulled out of index.html.
//   node tools/tests/economy_sim.js
//
// The rules being tested:
//   * live pacing anchors hold (owner): about 2.5 min to Base Lv10, Base 50 at ~14 min, the
//     deliberate ~80-minute Base 50-70 wall, ~7 hours to Base 99 and the 48 h post-reset
//     tail, using the level-appropriate map-stage power path at ~800 kills/hour;
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
// continuous power segments up to 99, then the deliberate reset at 100 and post-99 tail.
if (!/const NA1=18\.705917193,NE1=1\.28684215,N50=Math\.floor\(NA1\*Math\.pow\(50,NE1\)\),NE2=11\.33248639,N70=Math\.floor\(N50\*Math\.pow\(1\.4,NE2\)\),NE2B=0\.72933977,N100=43260,NE3=8\.2928141;/.test(src))
  throw new Error('needAt() curve constants changed - update this test deliberately');
if (!/const roundReq=n=>\{const a=Math\.abs\(n\),m=a<100\?1:a<1e4\?10:a<1e5\?100:1e3;return Math\.max\(1,Math\.round\(n\/m\)\*m\)\};/.test(src))
  throw new Error('roundReq() three-significant-figure rounding changed - update this test deliberately');
if (!/needAt=L=>roundReq\(L<=50\?Math\.floor\(NA1\*Math\.pow\(L,NE1\)\):L<=70\?Math\.floor\(N50\*Math\.pow\(L\/50,NE2\)\):L<=99\?Math\.floor\(N70\*Math\.pow\(L\/70,NE2B\)\):Math\.floor\(N100\*Math\.pow\(L\/100,NE3\)\)\)/.test(src))
  throw new Error('needAt() formula changed - update this test deliberately');
if (!/const EXP_BOOST_LV=50,EXP_BOOST_X=3,EXP_RATE=7;/.test(src))
  throw new Error('the v56 EXP band/rate changed - update this test deliberately');
if (!/const ZMIN=5;/.test(src))
  throw new Error('the low-level Zeny floor changed - update this test deliberately');
if (!/const JOFF=\[0,9,49,98\];/.test(src))
  throw new Error('JOFF job/base lockstep offsets changed - update this test deliberately');
if (!/const QXP=\{kill:1\/140,loot:1\/175,boss:1\/84\}/.test(src))
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
const needAt=L=>roundReq(L<=50?Math.floor(NA1*Math.pow(L,NE1)):L<=70?Math.floor(N50*Math.pow(L/50,NE2)):L<=99?Math.floor(N70*Math.pow(L/70,NE2B)):Math.floor(N100*Math.pow(L/100,NE3)));
let S = null, PW = 1;
const gx = () => S.gm ? (S.gmx || 100) : 1;
const pw = () => PW;
this.__e = { expRate, qRefresh, newQuest, needAt, EXPK, BOSEK, ZK, BZK, QXP, QZ, zenAt, ZMIN, pwOf, epkOf, qrOf, JOFF,
             set S(v){S=v}, get S(){return S}, set PW(v){PW=v}, get PW(){return PW} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const E = sb.__e;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('economy: v56 21x/7x/7÷3x pacing, quest share, job gates and Zeny scale\n');

// ---- the model the balance was solved with (same as tools/tune_pacing.js) ----------
// Use the level-appropriate power route: early stage powers through p50, then p ~= Base Lv.
// The model averages a boss every MPS+1 kills; quest XP uses the live multiplier and .126
// expected equipment pickups per kill. Each level is self-consistent: kills = need /
// (mob EXP per kill + expected quest XP per kill).
const MPS = 15, KILLS_PER_HOUR = 800;
const pwFor = lv => E.pwOf(lv);
const mobExp = p => Math.max(1, Math.floor(E.EXPK * Math.pow(p, 1.5) / 50));
const bossExp = p => Math.max(1, Math.floor(E.BOSEK * Math.pow(p, 1.5) / 50));
const expPerKill = p => (MPS * mobExp(p) + bossExp(p)) / (MPS + 1);
const mobZeny = p => ((E.ZK[0] + E.ZK[1]) / 2) * p * p / 1000;      // raw formula, no floor
const bossZeny = p => ((E.BZK[0] + E.BZK[1]) / 2) * p * p / 1000;
const killZeny = p => Math.max(E.ZMIN, Math.floor(mobZeny(p)));   // what spawn() actually pays
const zenyPerKill = p => (MPS * killZeny(p) + Math.max(E.ZMIN, Math.floor(bossZeny(p)))) / (MPS + 1);
const rateFor = L => L <= 50 ? 21 : L < 100 ? 7 : 7 / 3;   // mirrors expRate(): 3x band through Lv50
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

t('the pacing model follows the current level-appropriate field power path', () => {
  for (const [lv, power] of [[1,1],[10,10],[11,10],[12,12],[15,15],[20,20],[21,20],
    [28,28],[35,35],[43,43],[50,50],[59,50],[60,60],[99,99],[100,99]])
    assert.strictEqual(E.pwOf(lv), power, 'pwOf(' + lv + ')');
});

t('the curve is strictly increasing within each phase, with the rebirth drop at 100', () => {
  let prev = 0;
  for (let L = 1; L < 150; L++) {
    if (L === 100) { prev = E.needAt(L); continue; }   // the one deliberate drop
    const n = E.needAt(L); assert.ok(n > prev, 'needAt(' + L + ') = ' + n + ' <= ' + prev); prev = n;
  }
  assert.strictEqual(E.needAt(10), 360, 'early requirement anchor');
  assert.strictEqual(E.needAt(50), 2870, 'Base 50 anchor');
  assert.strictEqual(E.needAt(70), 130000, 'the v56 Base 70 wall top');
  assert.strictEqual(E.needAt(99), 167000, 'Base 99 anchor');
  // The level-100 reset is deliberate; the much steeper endgame ramp climbs through 150.
  assert.ok(E.needAt(100) < E.needAt(99), 'level 100 must be cheaper than 99 at the reset');
  const drop = E.needAt(99) / E.needAt(100);
  assert.ok(drop > 3 && drop < 5, 'the reset should be about 3.9x, got x' + drop.toFixed(1));
  assert.strictEqual(E.needAt(100), 43300, 'Base 100 reset floor');
  assert.strictEqual(E.needAt(150), 1248000, 'level cap');
  for (const L of [10, 50, 70, 99, 100, 150]) {
    const n = E.needAt(L), step = n < 100 ? 1 : n < 1e4 ? 10 : n < 1e5 ? 100 : 1e3;
    assert.strictEqual(n % step, 0, 'needAt(' + L + ') = ' + n + ' is not a round ' + step + '-step number');
  }
});

t('normal EXP is 21x through Lv50, then 7x and one-third (the v56 one-tenth scale); GM is unchanged', () => {
  for(const lv of [1,10,50,51,60,99,100,150]){
    E.S={lv,gm:false}; assert.strictEqual(E.expRate(),lv<=50?21:lv<100?7:7/3);
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
      ${src.match(/const EXP_BOOST_LV=\d+,EXP_BOOST_X=\d+,EXP_RATE=\d+;/)[0]}
      ${src.match(/const expRate=[^;]+;/)[0]}
      const mob={n:'Test Mob',mapIndex:0,exp:100,zeny:10,boss:false},pv=()=>0,qProg=()=>{};
      let jobXP=0,pend=[],zenyEarned=0,recorded=0;const addJob=x=>jobXP+=x,recordMonsterKill=()=>recorded++;
      ${grab('function earnZeny(amount){','function kill(o){')}
      ${rewards}
      this.result={xp:S.exp,z:S.zeny,jobXP,kills:S.kills,recorded};
    `,world);
    const rate=gm?100:level<=50?21:level<100?7:7/3;
    assert.strictEqual(world.result.xp,Math.round(100*rate));
    assert.strictEqual(world.result.jobXP,Math.round(70*rate));
    assert.strictEqual(world.result.z,gm?1000:10);
    assert.strictEqual(world.result.kills,1,'the reward block still increments the lifetime kill count');
    assert.strictEqual(world.result.recorded,1,'the kill is forwarded once to the per-monster index');
  }
});

t('saved quests refresh to the new EXP rate without losing progress', () => {
  E.S={lv:99,gm:false,q:[{type:'kill',goal:210,prog:12,xp:1,at:99}]};
  E.qRefresh(); assert.strictEqual(E.S.q[0].prog,12);
  assert.strictEqual(E.S.q[0].xp,Math.floor(E.needAt(99)*E.QXP.kill*7));
  E.S.lv=100; E.qRefresh();
  assert.strictEqual(E.S.q[0].xp,Math.floor(E.needAt(100)*E.QXP.kill*(7/3)));
});

t('quests pay a fraction of need(Lv), not a flat number', () => {
  E.S = { lv: 150, gm: false }; E.PW = 99;
  const n = E.needAt(150);
  assert.strictEqual(E.newQuest('kill').xp, Math.floor(n * E.QXP.kill * (7/3)));
  assert.strictEqual(E.newQuest('loot').xp, Math.floor(n * E.QXP.loot * (7/3)));
  assert.strictEqual(E.newQuest('boss').xp, Math.floor(n * E.QXP.boss * (7/3)));
  assert.strictEqual(E.newQuest('boss').xp, 34666, 'boss quest xp at Lv150');
});

t('quest EXP scales with need(Lv) instead of drifting', () => {
  E.S = { gm: false };
  E.S.lv = 50; E.PW = pwFor(50); const a = E.newQuest('kill').xp, ra = E.expRate();
  E.S.lv = 100; E.PW = pwFor(100); const b = E.newQuest('kill').xp, rb = E.expRate();
  // At rebirth, both the requirement curve and the live EXP multiplier reset; the
  // quest reward must follow need(Lv) times whatever expRate() currently returns
  // (Lv50 sits inside the v56 3x band, Lv100 in the one-third band).
  const curve = (E.needAt(100) * rb) / (E.needAt(50) * ra);
  assert.ok(b > 0 && a > 0, 'quest rewards must stay positive across the reset');
  assert.ok(Math.abs(b / a - curve) / curve < 0.05, 'quest exp grew off-curve: ' + (b / a).toFixed(2) + ' vs ' + curve.toFixed(2));
});

t('the old /100 bug is gone: a normal player is not paid 1% of the GM', () => {
  E.PW = 99;
  E.S = { lv: 150, gm: false }; const normal = E.newQuest('kill');
  E.S = { lv: 150, gm: true, gmx: 100 }; const gm = E.newQuest('kill');
  // both are floored independently, so compare the ratio, not exact multiples
  const ratioXp = gm.xp / normal.xp, ratioZ = gm.z / normal.z;
  assert.ok(Math.abs(ratioXp - 100/(7/3)) < .01, 'GM should retain its own EXP multiplier, got ' + ratioXp.toFixed(2));
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

t('pacing anchor: Base Lv 10 (1st job change) in about 3 min (got ' + (TL.T[10] * 60).toFixed(1) + ' min)', () => {
  assert.ok(TL.T[10] * 60 > 2.4, 'too fast: ' + (TL.T[10] * 60).toFixed(1) + ' min');
  assert.ok(TL.T[10] * 60 < 3.6, 'too slow: ' + (TL.T[10] * 60).toFixed(1) + ' min');
});

t('pacing anchor: Base Lv 10->50 takes about 11 min with the 3x band (got ' + ((TL.T[50]-TL.T[10])*60).toFixed(1) + ' min)', () => {
  const total = TL.T[50] * 60, interval = (TL.T[50] - TL.T[10]) * 60;
  assert.ok(total > 12.5 && total < 16, 'Base 50 total should be about 14.4 min, got ' + total.toFixed(1));
  assert.ok(interval > 10 && interval < 12.5, 'Base 10->50 should be about 11 min, got ' + interval.toFixed(1));
});

t('pacing anchor: the v56 Base 50->70 wall is ~80 min, not minutes (got ' + ((TL.T[70] - TL.T[50]) * 60).toFixed(0) + ' min)', () => {
  const wall = (TL.T[70] - TL.T[50]) * 60;
  assert.ok(wall > 70, 'the 50-70 wall collapsed back to ' + wall.toFixed(0) + ' min');
  assert.ok(wall < 92, 'the 50-70 wall ran long: ' + wall.toFixed(0) + ' min');
});
t('pacing anchor: Base Lv 50 to 99 takes about 6 h 40 m (got ' + (TL.T[99] - TL.T[50]).toFixed(2) + ' h)', () => {
  const midgame = TL.T[99] - TL.T[50];
  assert.ok(midgame > 6.2, 'too fast: ' + midgame.toFixed(2) + ' h');
  assert.ok(midgame < 7.2, 'too slow: ' + midgame.toFixed(2) + ' h');
  assert.ok(TL.T[99] > 6.5 && TL.T[99] < 7.3, 'Base 99 total should be about 6 h 55 min: ' + TL.T[99].toFixed(2) + ' h');
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
  assert.ok(Math.abs(GATES[1].base - 48) <= 2, '2nd job gate at base ' + GATES[1].base);
  assert.ok(Math.abs(GATES[2].base - 99) <= 2, 'transcendent gate at base ' + GATES[2].base);
  assert.ok(GATES[0].hours > 0.03 && GATES[0].hours < 0.06, '1st job after ' + GATES[0].hours.toFixed(2) + ' h');
  const firstJobInterval = GATES[1].hours - GATES[0].hours;
  assert.ok(firstJobInterval > 0.14 && firstJobInterval < 0.20, 'first-job levels should align to the 11-minute Base 10->50 interval; got ' + (firstJobInterval*60).toFixed(1) + ' min');
  assert.ok(GATES[1].hours > 0.17 && GATES[1].hours < 0.25, '2nd job after ' + GATES[1].hours.toFixed(2) + ' h');
  assert.ok(GATES[2].hours > 6.5 && GATES[2].hours < 7.3, 'transcendent after ' + GATES[2].hours.toFixed(2) + ' h');
});

t('a full run earns enough Zeny for the endgame sinks', () => {
  const z = totalZeny();
  const refCost = (r, sec) => Math.round(200 * (r + 1) * (1 + sec * .5));
  const refCh = [70,70,70,70,49,42,35,28,21,14];   // v51: every step nerfed 30%
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

t('low-level Zeny is still pocket change but no longer zero (v56 floor)', () => {
  assert.ok(mobZeny(1) < 1, 'the raw pw1 formula should stay under 1z');
  assert.strictEqual(E.zenAt(1), 5, 'zeny per kill at power 1 is the 5z floor');
  assert.strictEqual(killZeny(1), 5, 'a Lv1 kill pays the 5z floor');
  assert.strictEqual(killZeny(10), 5, 'Lv10 kills are still the 5z floor');
  assert.strictEqual(killZeny(20), 5, 'the floor still applies at Lv20');
  assert.ok(killZeny(25) >= 6 && killZeny(25) <= 8, 'the curve takes over around Lv25 (got ' + killZeny(25).toFixed(1) + ')');
  assert.ok(killZeny(50) > 25, 'the mid-game curve is untouched (got ' + killZeny(50).toFixed(1) + ')');
  assert.strictEqual(E.ZMIN, 5, 'the shipped floor');
  assert.strictEqual(src.match(/zeny:Math\.max\(ZMIN,/g).length, 4, 'online and offline mob/boss Zeny all use the floor');
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
