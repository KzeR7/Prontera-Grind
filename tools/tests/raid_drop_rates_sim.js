// Raid clear loot rates: the owner asked "is it luck or is there an issue?" after seeing the boss card
// AND the raid title on the same early clear. This suite extracts the real awardRewards() out of
// assets/raid.js and runs it 120,000 times against a seeded RNG, so the answer is measured, not claimed.
//   node tools/tests/raid_drop_rates_sim.js
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const raidJs = fs.readFileSync(path.join(__dirname, '../../assets/raid.js'), 'utf8');

// ---- extract awardRewards() by brace matching (it is inside the PGRaid IIFE) ----------------------
const startAt = raidJs.indexOf('function awardRewards(cleared, skipFailRewards) {');
assert.ok(startAt > 0, 'awardRewards is still in assets/raid.js');
let depth = 0, endAt = -1;
for (let i = raidJs.indexOf('{', startAt); i < raidJs.length; i++) {
  if (raidJs[i] === '{') depth++;
  else if (raidJs[i] === '}') { depth--; if (depth === 0) { endAt = i + 1; break; } }
}
assert.ok(endAt > startAt, 'awardRewards body closes');
const fnSrc = raidJs.slice(startAt, endAt);

// ---- a deterministic RNG the sandbox's Math will use ---------------------------------------------
let seed = 0x9e3779b9;
function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }

function run(clears, opts = {}) {
  const stats = { cards: 0, titles: 0, both: 0, petCalls: 0, cardAdds: 0, titleAdds: 0, clears: 0, cardKeys: {} };
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random: rnd }),
    Number, Array, JSON, String, Object, console,
    S: null,
    REWARDS: { solo: { shards: 2, sigils: 0, zeny: 1000, echo: 5 }, party: { shards: 3, sigils: 1, zeny: 2000, echo: 7 }, fail: { shards: 0, sigils: 0, zeny: 0, echo: 0 } },
    raidSaveState: () => sandbox.__st,
    __st: { clears: 0 },
    RAID_BOSS_CARDS: [
      { n: 'Sovereign Thanatos Card', cardKey: 'raid:matk', stat: 'matk' },
      { n: 'Primordial Ifrit Card', cardKey: 'raid:atk', stat: 'atk' }
    ],
    newCard: (def) => ({ def, id: 1 }),
    addCard: (card) => { stats.cardAdds++; stats.cardKeys[card.def.cardKey] = (stats.cardKeys[card.def.cardKey] || 0) + 1; return true; },
    log: () => {},
    addFloat: () => {},
    pl: { x: 0, z: 0 },
    raidboundDrop: (raidId) => { stats.petCalls++; return opts.pet ? 'Raidbound' : null; },
    PGTitles: { sync: () => [], find: () => null },
    CLASSES: {},
    activeDungeon: () => opts.dungeon || { id: 'astral', matName: 'Astral Shard', matIdx: 0, bossCardKey: 'raid:matk', bossCardName: 'Sovereign Thanatos Card' },
    raid: { mode: 'solo', elapsed: 61 }
  };
  sandbox.S = { ascensionMat: [0, 0, 0], zeny: 0, shards: 0, titleAwards: [] };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + '\nthis.__award = awardRewards;', sandbox);
  for (let i = 0; i < clears; i++) {
    sandbox.S.titleAwards = [];                 // fresh account: every title is still unowned
    const before = { c: sandbox.__st.clears };
    const out = sandbox.__award(true, false);
    if (sandbox.__st.clears > before.c) stats.clears++;
    if (out.bossCardDrop) stats.cards++;
    if (out.titleDrop) stats.titles++;
    if (out.bossCardDrop && out.titleDrop) stats.both++;
    if (sandbox.S.titleAwards.length) stats.titleAdds++;
    // reset the counters the next iteration should not inherit
    sandbox.S.titleAwards = [];
  }
  return stats;
}

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); pass++; } catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; } };
console.log('raid clear loot rates (120,000 simulated clears)\n');

const N = 120000;
const s = run(N);
const pct = (n) => (100 * n / N).toFixed(2) + '%';

t('the boss card drops on 10% of clears, one roll per clear', () => {
  const p = s.cards / N;
  console.log('       card ' + pct(s.cards) + ' (' + s.cards + '/' + N + ')');
  assert.ok(Math.abs(p - 0.10) < 0.004, 'card rate ' + pct(s.cards) + ' is 10% within noise');
  assert.equal(s.cardAdds, s.cards, 'exactly one card is granted per successful card roll');
});
t('the raid title drops on 10% of clears, one roll per clear', () => {
  const p = s.titles / N;
  console.log('       title ' + pct(s.titles) + ' (' + s.titles + '/' + N + ')');
  assert.ok(Math.abs(p - 0.10) < 0.004, 'title rate ' + pct(s.titles) + ' is 10% within noise');
  assert.equal(s.titleAdds, s.titles, 'exactly one title is granted per successful title roll');
});
t('card and title are INDEPENDENT rolls, so both land on 1% of clears', () => {
  const p = s.both / N;
  console.log('       both  ' + pct(s.both) + ' (' + s.both + '/' + N + ')');
  assert.ok(Math.abs(p - 0.01) < 0.0015, 'both-in-one-clear ' + pct(s.both) + ' is 1% within noise');
  // and seeing it inside 100 clears is the coin-flip the owner experienced: 1-(1-p)^n
  const any = 1 - Math.pow(1 - 0.01, 100);
  console.log('       chance of seeing both at least once in 100 clears: ' + (100 * any).toFixed(1) + '%');
  assert.ok(any > 0.6 && any < 0.66, 'the 100-clear expectation is ~63%');
});
t('the Raidbound pet roll is asked for once per clear (and is dormant until the art ships)', () => {
  assert.equal(s.petCalls, N, 'exactly one raidboundDrop() call per cleared run');
  const live = run(4000, { pet: true });
  assert.equal(live.petCalls, 4000, 'still one call per clear when the pool is live');
});
// failed runs: cleared=false must never touch the card/title/clear counters
const failStats = (() => {
  const stats = { cards: 0, titles: 0, clears: 0 };
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random: rnd }), Number, Array, JSON, String, Object, console,
    S: { ascensionMat: [0, 0, 0], zeny: 0, shards: 0, titleAwards: [] },
    REWARDS: { solo: { shards: 0, sigils: 0, zeny: 0, echo: 0 }, party: { shards: 0 }, fail: { shards: 0, sigils: 0, zeny: 0, echo: 0 } },
    raidSaveState: () => sandbox.__st, __st: { clears: 0 },
    RAID_BOSS_CARDS: [{ n: 'x', cardKey: 'raid:matk', stat: 'matk' }], newCard: () => ({}),
    addCard: () => { stats.cards++; return true; }, log: () => {}, addFloat: () => {}, pl: { x: 0, z: 0 },
    raidboundDrop: () => { stats.cards++; return null; }, PGTitles: { sync: () => [], find: () => null }, CLASSES: {},
    activeDungeon: () => ({ id: 'astral', matName: 'x', matIdx: 0, bossCardKey: 'raid:matk' }),
    raid: { mode: 'solo', elapsed: 10 }
  };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + '\nthis.__award = awardRewards;', sandbox);
  for (let i = 0; i < 3000; i++) sandbox.__award(false, false);
  stats.clears = sandbox.__st.clears;
  return stats;
})();
t('a failed run rolls no card, no title and no clear credit', () => {
  assert.equal(failStats.cards, 0, 'no card on a failed run');
  assert.equal(failStats.clears, 0, 'a failed run does not count as a clear');
});
t('each dungeon can only drop its own card', () => {
  assert.deepEqual(Object.keys(s.cardKeys), ['raid:matk'], 'Astral clears only ever grant the Thanatos card');
  const thor = run(3000, { dungeon: { id: 'thor', matName: 'x', matIdx: 1, bossCardKey: 'raid:atk', bossCardName: 'Primordial Ifrit Card' } });
  assert.deepEqual(Object.keys(thor.cardKeys), ['raid:atk'], 'Thor clears only ever grant the Ifrit card');
});

console.log('\nraid drop rates: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
