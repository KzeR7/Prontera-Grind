// The HUD rate meters after the player has been away from the tab.
//
// Owner report (round 9): "when i tab away from the browser the game doesnt work. i saw it from
// the exp meter. when i came back from other tab or another window it wil start from 0 or lower
// rate, slowly climbing back to the average exp and zeny im getting. i think we went through this
// multiple times but it keeps coming back after some update."
//
// It had come back before: v390 routed the plaza Field card around the same defect because the
// live sampler zeroed itself after HUD_IDLE_RESET, and the HUD meters were left holding it. This
// suite pins the sampler itself, so the next update cannot quietly reintroduce it.
//
// The rules:
//   * a sampling gap is not a broken baseline - it is a stretch of play the sampler missed and can
//     still account for, so returning to the tab must not wipe the meter to 0;
//   * what the gap produced is prorated into the rolling minute, so ten minutes away cannot read
//     as one furious second of combat (the guarantee the old reset existed to provide);
//   * a gap in which nothing was produced - the game parked - compresses the dead time out instead
//     of leaving a hole, because a hole reads as a collapse in earnings for a full minute;
//   * a genuinely broken baseline still starts clean: a new login, a save whose counters went
//     backwards, or a clock running backwards;
//   * and the background tick really does feed the sampler - the unit tests below drive
//     stepHudRate directly, so without this assertion a future change could drop the call and
//     every one of them would still pass while the tab-switch bug came straight back.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('missing ' + a);
  return src.slice(i, j);
};

/* ── 1. the background tick shares the sampler ─────────────────────────────── */
assert.ok(src.includes('function sampleHudRate(now=performance.now())'),
  'the sampler has one entry point the frame driver and the background tick both use');
assert.ok(src.includes('const rates=sampleHudRate()'),
  'bars() reads the rate through that entry point');
const bgTickBody = grab('function bgTick', 'function bgHide');
assert.ok(bgTickBody.includes('simAdvance(now)') && bgTickBody.includes('sampleHudRate(now)'),
  'bgTick samples the rate after advancing the sim, so a hidden tab keeps the window fed');
assert.ok(bgTickBody.indexOf('sampleHudRate(now)') > bgTickBody.indexOf('simAdvance(now)'),
  'the sample happens after the sim has advanced, so the delta covers what the sim just earned');

/* ── 2. drive the real sampler ─────────────────────────────────────────────── */
const box = { simVisualsOff: () => false };
vm.createContext(box);
vm.runInContext(`
  let S = { zeny: 0 }, zenyEarned = 0, expEarned = 0;
  ${grab('function earnZeny(amount){', 'function kill(o){')}
  ${grab('const HUD_RATE_WINDOW=60000,HUD_IDLE_RESET=30000,HUD_RATE_REFRESH=1000;', 'const levelPct=')}
  this.__r = { stepHudRate, S };
`, box);
const R = box.__r;

let state = null;
const sample = (user, k, z, exp, time, dmg) => {
  const m = R.stepHudRate(state, user, k, z, time, dmg, exp);
  state = m.state;
  return m;
};
const near = (actual, want, msg) =>
  assert.ok(Math.abs(actual - want) < 0.01, `${msg} (got ${actual}, wanted ~${want})`);

// Steady play: 100 EXP and 1 kill per second, for a minute and a half.
let t = 0;
sample('p', 0, 0, 0, 0);
for (let i = 1; i <= 90; i++) {
  t = i * 1000;
  sample('p', i, i * 50, i * 100, t, i * 1000);
}
const steady = sample('p', 91, 4550, 9100, t + 1000, 91000);
assert.ok(steady.exp > 0 && steady.zeny > 0 && steady.kills > 0, 'the meter reads during normal play');
const steadyExp = steady.exp;

/* ── 3. returning to the tab must not wipe the meter ───────────────────────── */
// A long gap in which the character kept grinding: what it earned has to reach the window.
t += 120000;                                   // two minutes away, no samples taken
sample('p', 91 + 120, 4550 + 6000, 9100 + 12000, t, 91000 + 120000);
const afterGrind = sample('p', 212, 10600, 21200, t + 1000, 212000);
assert.notStrictEqual(afterGrind.exp, 0, 'a tab switch must not read 0 EXP/min on return');
assert.ok(Math.abs(afterGrind.exp - steadyExp) < steadyExp * 0.15,
  `the meter lands on the rate the player was actually getting (got ${afterGrind.exp}, steady ${steadyExp})`);

/* ── 4. a gap where nothing was produced compresses, not collapses ─────────── */
state = null;
t = 0;
sample('p', 0, 0, 0, 0);
for (let i = 1; i <= 60; i++) sample('p', i, i * 50, i * 100, i * 1000, i * 1000);
const before = sample('p', 61, 3050, 6100, 61000, 61000);
t = 61000 + 90000;                             // 90s parked: no kills, no EXP, no damage
const parked = sample('p', 61, 3050, 6100, t, 61000);
assert.notStrictEqual(parked.exp, 0, 'a parked stretch must not wipe the EXP rate to 0');
assert.ok(Math.abs(parked.exp - before.exp) < before.exp * 0.15,
  `dead time is compressed out rather than left as a hole (got ${parked.exp}, was ${before.exp})`);

/* ── 5. a long absence still cannot spike ──────────────────────────────────── */
state = null;
sample('p', 0, 0, 0, 0);
for (let i = 1; i <= 60; i++) sample('p', i, i * 50, i * 100, i * 1000, i * 1000);
sample('p', 60, 3000, 6000, 60000, 60000);
const spiked = sample('p', 60 + 879, 3000 + 990999, 6000 + 87900, 60000 + 600000, 60000 + 600000);
assert.ok(spiked.exp < 87900 * 2,
  `ten minutes of EXP cannot read as one furious second (got ${spiked.exp})`);
assert.ok(spiked.kills < 879 * 2,
  `ten minutes of kills cannot read as 879 in one second (got ${spiked.kills})`);
assert.ok(spiked.kills > 0, 'but it must not vanish either - the average is the truth');

/* ── 6. a genuinely broken baseline still starts clean ─────────────────────── */
state = null;
sample('p', 0, 0, 0, 0);
for (let i = 1; i <= 60; i++) sample('p', i, i * 50, i * 100, i * 1000, i * 1000);
sample('p', 60, 3000, 6000, 60000, 60000);
assert.strictEqual(sample('other', 5, 100, 100, 61000, 1000).exp, 0, 'a new login starts a clean window');
assert.strictEqual(sample('p', 1, 10, 10, 62000, 1000).exp, 0, 'counters going backwards mean a fresh save');
assert.strictEqual(sample('p', 1, 10, 10, 61000, 1000).exp, 0, 'a clock running backwards resets');

console.log('HUD rate meters: returning from a hidden tab keeps the real rate, prorates what the gap earned, and never spikes.');
