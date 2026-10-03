// Skills: the roster, the four new effects (dot / stun / chain / tradeoff), the per-skill
// auto-cast switch, and how many skills fire per swing at each job tier.
//   node tools/tests/skill_sim.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

// CD -> CLASSES -> down() -> act/pas/tos -> SKILLS -> the FX tagging block
const roster = grab('const CD=[', 'const pm=s=>');
// the whole effect-helper block (applyDot / applyStun / chainHit). chainHit is pulled in but
// never called here - it needs mobs, shots and hurt(), which belong to the live game loop.
const helpers = [
  grab('// ---------- skill effects: damage over time, stun, chain ----------', 'const mkDrop='),
  pick(/const SKSLOTS=[^;]+;/, 'SKSLOTS'),
  pick(/const skOff=[^;]+;/, 'skOff()'),
].join('\n');

const harness = `
${roster}
${helpers}
// skOff and skillOn share one line in index.html, so the pick above already brought both in.
let S = null;
const lv = id => (S.sk && S.sk[id]) || 0;
this.__k = { SKILLS, CLASSES, SKSLOTS, SKFADE, applyDot, applyStun, skillOn, skOff, down,
             set S(v){S=v}, get S(){return S} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const K = sb.__k;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('skills: roster, effects, auto-cast switch, casts per swing\n');

const byId = id => K.SKILLS.find(s => s.id === id);

t('every skill id is unique (a duplicate would strand spent points)', () => {
  const seen = new Map();
  for (const s of K.SKILLS) {
    assert.ok(!seen.has(s.id), `duplicate id "${s.id}" (${seen.get(s.id)} and ${s.n})`);
    seen.set(s.id, s.n);
  }
  console.log('       ' + K.SKILLS.length + ' skills');
});

t('every skill has a name, a class list, a level cap and a description function', () => {
  for (const s of K.SKILLS) {
    assert.ok(s.n, s.id + ' has no name');
    assert.ok(Array.isArray(s.cls) && s.cls.length, s.id + ' has no class list');
    assert.ok(s.max >= 1, s.id + ' has no level cap');
    assert.strictEqual(typeof s.d, 'function', s.id + ' has no description');
    for (let L = 1; L <= s.max; L++) assert.ok(typeof s.d(L) === 'string' && s.d(L).length, `${s.id}.d(${L}) is empty`);
  }
});

t('every skill type is one the engine understands', () => {
  const known = new Set(['act', 'pas', 'heal', 'to']);
  for (const s of K.SKILLS) assert.ok(known.has(s.type), `${s.id} has type "${s.type}"`);
});

t('every job line has skills to spend points on', () => {
  for (const name of Object.keys(K.CLASSES)) {
    // the Novice is the starting class: Job Lv caps at 10, so it only ever earns 9 points.
    // Two skills at max 5 is the intended ceiling there, not a gap to fill.
    const min = name === 'Novice' ? 2 : 3;
    const own = K.SKILLS.filter(s => s.from === name);
    assert.ok(own.length >= min, `${name} has only ${own.length} of its own skills`);
    const reach = K.SKILLS.filter(s => s.cls.includes(name));
    assert.ok(reach.length >= (name === 'Novice' ? 2 : 4), `${name} can only reach ${reach.length} skills`);
  }
});

t('skill points available roughly match what each line can spend', () => {
  // a second job earns 9 (Novice) + 49 + 49 + 49 = 156 points; make sure there is enough
  // to buy without hundreds of points going permanently unspent
  const lk = K.SKILLS.filter(s => s.cls.includes('Lord Knight'));
  const spendable = lk.reduce((a, s) => a + s.max, 0);
  assert.ok(spendable >= 60, `a Lord Knight can only ever spend ${spendable} of ~156 points`);
  console.log('       Lord Knight can spend ' + spendable + ' of ~156 points across ' + lk.length + ' skills');
});

t('actives carry a cooldown and a damage multiplier that grows with level', () => {
  for (const s of K.SKILLS.filter(x => x.type === 'act')) {
    assert.ok(s.cd > 0, s.id + ' has no cooldown');
    assert.strictEqual(typeof s.mul, 'function', s.id + ' has no multiplier');
    assert.ok(s.hits >= 1, s.id + ' has no hit count');
    assert.ok(s.mul(5) > s.mul(1), `${s.id} does not scale with level`);
    assert.ok(s.col, s.id + ' has no colour');
  }
});

t('the four new effects are all present in the roster', () => {
  const dot = K.SKILLS.filter(s => s.dot), stun = K.SKILLS.filter(s => s.stun);
  const chain = K.SKILLS.filter(s => s.chain), trade = K.SKILLS.filter(s => s.type === 'to');
  for (const [label, list, min] of [['dot', dot, 8], ['stun', stun, 6], ['chain', chain, 6], ['tradeoff', trade, 3]])
    assert.ok(list.length >= min, `only ${list.length} ${label} skills, expected at least ${min}`);
  console.log('       dot ' + dot.length + ' | stun ' + stun.length + ' | chain ' + chain.length +
              ' | tradeoff ' + trade.length + ' | aoe ' + K.SKILLS.filter(s => s.aoe).length);
});

t('effect parameters are in sane ranges', () => {
  for (const s of K.SKILLS) {
    if (s.dot) {
      assert.ok(s.dot.pow > 0 && s.dot.pow <= .15, `${s.id} dot.pow ${s.dot.pow} out of range`);
      assert.ok(s.dot.dur >= 1 && s.dot.dur <= 10, `${s.id} dot.dur ${s.dot.dur} out of range`);
      // a dot should add a fraction of the hit, not several times the hit
      assert.ok(s.dot.pow * s.dot.dur <= 1.0, `${s.id} dot totals ${(s.dot.pow * s.dot.dur).toFixed(2)}x the hit`);
      assert.ok(s.dot.col, s.id + ' dot has no colour');
    }
    if (s.stun) assert.ok(s.stun.dur > 0 && s.stun.dur <= 2, `${s.id} stun.dur ${s.stun.dur} out of range`);
    if (s.chain) {
      assert.ok(s.chain.n >= 1 && s.chain.n <= 4, `${s.id} chain.n ${s.chain.n} out of range`);
      assert.ok(s.chain.pow > 0 && s.chain.pow <= 1, `${s.id} chain.pow ${s.chain.pow} out of range`);
    }
  }
});

t('a tradeoff always costs something - no free buffs', () => {
  for (const s of K.SKILLS.filter(x => x.type === 'to')) {
    const o = s.to;
    assert.ok(o.dur(5) > 0 && o.dur(5) <= 30, s.id + ' duration out of range');
    assert.ok(o.hp > 0 && o.hp <= 1, s.id + ' hp gate out of range');
    assert.ok(s.cd > o.dur(5), `${s.id} cooldown ${s.cd}s must exceed its ${o.dur(5)}s duration or it never lapses`);
    const gain = (o.atk(5) || 0) + (o.aspd(5) || 0);
    const cost = Math.abs(o.def(5) || 0) + (o.drain(5) || 0) * o.dur(5);
    assert.ok(gain > 0, s.id + ' grants nothing');
    assert.ok(cost > 0, s.id + ' has no downside - it is not a tradeoff');
    console.log(`       ${s.n}: gain ${gain.toFixed(0)} vs cost ${cost.toFixed(0)} over ${o.dur(5)}s`);
  }
});

t('tradeoffs scale with level, and their drain cannot out-damage the buff window', () => {
  for (const s of K.SKILLS.filter(x => x.type === 'to')) {
    assert.ok(s.to.dur(5) >= s.to.dur(1), s.id + ' duration shrinks with level');
    const drainTotal = s.to.drain ? s.to.drain(5) * s.to.dur(5) : 0;
    assert.ok(drainTotal < 100, `${s.id} drains ${drainTotal.toFixed(0)}% of max HP in one cast`);
  }
});

t('applyStun never stacks and caps out, halved on bosses', () => {
  const m = { boss: false };
  K.applyStun(m, 1); K.applyStun(m, 1); K.applyStun(m, 1);
  assert.strictEqual(m.stun, 1, 'stun stacked instead of refreshing');
  K.applyStun(m, 99);
  assert.ok(m.stun <= 2, 'a normal mob can be locked down for ' + m.stun + 's');
  const b = { boss: true };
  K.applyStun(b, 2);
  assert.ok(b.stun <= 1, 'a boss was stunned for ' + b.stun + 's');
  K.applyStun(b, 0); K.applyStun(b, -5);
  assert.strictEqual(b.stun, 1, 'a zero/negative stun changed the timer');
});

t('applyDot accumulates ticks and ignores nonsense input', () => {
  const m = {};
  K.applyDot(m, 100, 4, '#fff');
  K.applyDot(m, 50, 2, '#0f0');
  assert.strictEqual(m.dots.length, 2, 'dots should stack as separate entries');
  K.applyDot(m, 100, 0, '#fff');
  assert.strictEqual(m.dots.length, 2, 'a zero-duration dot was added');
  K.applyDot(null, 100, 4, '#fff');
  K.applyDot(m, 0, 4, '#fff');
  assert.ok(m.dots.every(d => Number.isFinite(d.dps) && Number.isFinite(d.dur)), 'a dot holds NaN');
});

t('job tier decides how many skills fire per swing', () => {
  assert.strictEqual(K.SKSLOTS(0), 1, 'Novice should cast one skill per swing');
  assert.strictEqual(K.SKSLOTS(1), 2, 'a first job should cast two');
  assert.strictEqual(K.SKSLOTS(2), 3, 'a second job should cast three');
  assert.strictEqual(K.SKSLOTS(undefined), 1, 'a missing tier must fall back to one');
  assert.deepStrictEqual(Array.from(K.SKFADE), [1, .55, .3]);
  assert.ok(K.SKFADE[0] > K.SKFADE[1] && K.SKFADE[1] > K.SKFADE[2], 'later casts should land softer');
});

t('switching a skill off stops it being usable, and back on restores it', () => {
  K.S = { cls: 'Lord Knight', sk: { frenzy: 5, spiral: 5 }, skOff: {} };
  assert.ok(K.skillOn('frenzy'), 'frenzy should be usable at level 5');
  K.S.skOff.frenzy = 1;
  assert.ok(!K.skillOn('frenzy'), 'frenzy still fires after being switched off');
  assert.ok(K.skillOn('spiral'), 'switching one skill off must not affect another');
  delete K.S.skOff.frenzy;
  assert.ok(K.skillOn('frenzy'), 'frenzy did not come back after being switched on');
});

t('a skill with no levels, or from another line, is never usable', () => {
  K.S = { cls: 'Lord Knight', sk: { spiral: 5 }, skOff: {} };
  assert.ok(!K.skillOn('mbrk'), 'an unleveled skill is usable');
  assert.ok(!K.skillOn('env'), 'a Thief skill is usable by a Lord Knight');
});

t('an unknown skill id is simply unusable rather than a crash', () => {
  K.S = { cls: 'Lord Knight', sk: { spiral: 5 }, skOff: {} };
  assert.strictEqual(K.skillOn('nosuchskill'), false);
});

t('a save with no skOff at all still works', () => {
  K.S = { cls: 'High Wizard', sk: { meteor: 5 }, skOff: undefined };
  assert.ok(K.skillOn('meteor'), 'missing skOff broke skillOn');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
