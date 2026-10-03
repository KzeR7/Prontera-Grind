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
  pick(/const skCost=[^;]+;/, 'skCost()'),
  pick(/const skOff=[^;]+;/, 'skOff()'),
].join('\n');

const harness = `
${roster}
${helpers}
// skOff and skillOn share one line in index.html, so the pick above already brought both in.
let S = null;
const lv = id => (S.sk && S.sk[id]) || 0;
this.__k = { SKILLS, CLASSES, SKSLOTS, SKFADE, skCost, applyDot, applyStun, skillOn, skOff, down,
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
    // In RO the Novice has First Aid and nothing offensive, so one skill is correct here -
    // not a gap to fill. Inventing a Novice attack skill is what leaked a bogus chain tag
    // into every class tree, because every class inherits Novice.
    const min = name === 'Novice' ? 1 : 3;
    const own = K.SKILLS.filter(s => s.from === name);
    assert.ok(own.length >= min, `${name} has only ${own.length} of its own skills`);
    const reach = K.SKILLS.filter(s => s.cls.includes(name));
    assert.ok(reach.length >= (name === 'Novice' ? 1 : 4), `${name} can only reach ${reach.length} skills`);
  }
});

t('every job line has the same number of its own skills', () => {
  const byTier = {};
  for (const [name, c] of Object.entries(K.CLASSES)) {
    if (name === 'Novice') continue;
    const n = K.SKILLS.filter(s => s.from === name).length;
    (byTier[c.tier] = byTier[c.tier] || new Set()).add(n);
  }
  for (const [tier, set] of Object.entries(byTier))
    assert.strictEqual(set.size, 1, `tier ${tier} job lines disagree on skill count: ${[...set]}`);
  console.log('       ' + Object.entries(byTier).map(([t, s]) => 'tier ' + t + ': ' + [...s][0] + ' own skills').join(' | '));
});

t('no class can max its whole tree - the escalating cost has to bite', () => {
  // buying level L costs L points, so maxing a 5-level skill costs 1+2+3+4+5 = 15
  assert.strictEqual([1,2,3,4,5].reduce((a, L) => a + K.skCost(L), 0), 15, 'maxing a skill should cost 15');
  const earned = t => 9 + (t >= 1 ? 49 : 0) + (t >= 2 ? 49 : 0) + (t >= 3 ? 49 : 0);
  for (const [name, c] of Object.entries(K.CLASSES)) {
    const reach = K.SKILLS.filter(s => s.cls.includes(name));
    const need = reach.reduce((a, s) => { let x = 0; for (let L = 1; L <= s.max; L++) x += K.skCost(L); return a + x }, 0);
    assert.ok(need > earned(c.tier),
      `${name} can max all ${reach.length} skills for ${need} of ${earned(c.tier)} points - ${need - earned(c.tier)} spare`);
  }
  console.log('       Novice 9/15 | 1st job 58/75 | 2nd job 107/135 | transcendent 156/195');
});

t('effects are actually attached to the new skills (tagging must run after the push)', () => {
  // Regression: the FX tagging loop used to sit ABOVE SKILLS.push(), so SKILLS.find() returned
  // undefined for every new skill and the guard silently swallowed it. The roster looked right
  // in source and did nothing at runtime.
  const want = { mbrk:['aoe','dot'], fdiver:['stun'], fnova:['aoe','stun'], ashower:['aoe'],
                 sandat:['stun'], signum:['aoe'], cartrev:['aoe'], tblow:['dot'],
                 vermilion:['aoe'], landmine:['aoe'], vsplash:['dot'], tundead:['aoe'],
                 meltdown:['aoe','dot'], spearboom:[], fassault:[] };
  for (const [id, keys] of Object.entries(want)) {
    const s = byId(id);
    assert.ok(s, id + ' is missing from the roster');
    for (const k of ['aoe','dot','stun','chain'])
      assert.strictEqual(!!s[k], keys.includes(k), `${id} should${keys.includes(k)?'':' not'} have ${k}`);
  }
});

t('the Thief line has no AoE, as in Ragnarok Online', () => {
  // iRO is explicit: "the Thief does not have any AOE skills to level with"
  for (const cls of ['Thief', 'Assassin', 'Assassin Cross']) {
    const aoe = K.SKILLS.filter(s => s.cls.includes(cls) && s.aoe).map(s => s.n);
    const allowed = ['Grimtooth', 'Meteor Assault'];   // Assassin's own 3x3 / around-caster skills
    for (const n of aoe) assert.ok(allowed.includes(n), `${cls} reached an AoE skill: ${n}`);
  }
});

t('invented and wrong-job skills are gone', () => {
  const gone = ['tstone', 'rcutter', 'adoramus', 'chargearr', 'hcrush', 'firewall'];
  for (const id of gone) assert.ok(!byId(id), id + ' is still in the roster');
  const names = K.SKILLS.map(s => s.n);
  for (const n of ['Throw Stone', 'Rolling Cutter', 'Adoramus', 'Charged Arrow', 'Head Crush'])
    assert.ok(!names.includes(n), `"${n}" is not a skill for the job it was on`);
  // and their real replacements exist
  for (const id of ['akatar', 'basilica', 'fassault', 'tblow', 'fnova'])
    assert.ok(byId(id), 'missing replacement ' + id);
  assert.strictEqual(byId('akatar').from, 'Assassin Cross');
  assert.strictEqual(byId('basilica').from, 'High Priest');
  assert.strictEqual(byId('fassault').from, 'Sniper');
  assert.strictEqual(byId('tblow').from, 'Lord Knight');
  assert.strictEqual(byId('fnova').from, 'Wizard');
});

t('single-target RO skills do not carry area or bounce tags', () => {
  // Bowling Bash is 5x5 (area) and Double Strafe / Jupitel Thunder / Spear Boomerang /
  // Frost Diver / Lord of Vermilion hits one target or a fixed area - none of them bounce
  const single = ['bash', 'pierce', 'spiral', 'dstr', 'jup', 'spearboom', 'fdiver', 'fassault',
                  'sonic', 'mammo', 'holy', 'soulb', 'vsplash'];
  for (const id of single) {
    const s = byId(id);
    assert.ok(s, id + ' missing');
    assert.ok(!s.chain, `${s.n} bounces to other mobs but is single-target in RO`);
  }
  assert.ok(byId('bowl').aoe && !byId('bowl').chain, 'Bowling Bash is a 5x5 area, not a bounce');
  assert.ok(byId('vermilion').aoe && !byId('vermilion').chain, 'Lord of Vermilion is a 9x9 area');
  assert.ok(byId('sharp').chain, 'Sharp Shooting pierces a line and should bounce');
  assert.ok(byId('blitz').chain, "Blitz Beat's falcon hits nearby mobs too");
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
  // chain is deliberately the rarest: in RO almost every multi-target skill is a true area
  // (Bowling Bash, Magnum Break, Storm Gust, Lord of Vermilion...). Only Blitz Beat's falcon
  // and Sharp Shooting's piercing line genuinely bounce, so only those two carry it.
  for (const [label, list, min] of [['dot', dot, 6], ['stun', stun, 6], ['chain', chain, 2], ['tradeoff', trade, 3]])
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
  // tier 3 is the transcendent job (Lord Knight, Assassin Cross, High Priest, ...)
  assert.strictEqual(K.SKSLOTS(3), 4, 'a transcendent job should cast four');
  assert.strictEqual(K.SKSLOTS(undefined), 1, 'a missing tier must fall back to one');
  assert.deepStrictEqual(Array.from(K.SKFADE), [1, .55, .3, .18], 'SKFADE needs a rung per tier');
  for (let i = 1; i < K.SKFADE.length; i++)
    assert.ok(K.SKFADE[i] < K.SKFADE[i - 1], `cast ${i + 1} should land softer than cast ${i}`);
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
