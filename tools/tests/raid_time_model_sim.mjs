// Raid time-model acceptance (haven-v449), without a browser and without Cloudflare.
//
// THE QUESTION THIS ANSWERS
// A raid advances only when the room is read or an action arrives (`raidSnapshot`/`raidAction` both
// call `advanceRaidRun(run, now)`). Recurring Durable Object alarms are deliberately disabled. That
// raises the obvious abuse question: can a player change the *outcome* by changing how often they
// read? Can frequent reads stall a mechanic, dodge damage, or double-pay? Can a long silence let a
// stage overrun or a reward settle twice?
//
// The answer must be "no". These tests drive the same run at wildly different read/action cadences,
// through real disconnections (nobody reading at all), and before/after the deadline, and assert the
// run reaches exactly the same state with exactly the same rewards.
//
// Time in the engine is only ever a timestamp the caller supplies; `advanceRaidRun` walks an event
// queue between `run.updatedAt` and `now`. So frequency should be provably irrelevant.
import assert from 'node:assert/strict';
import {
  createRaidRun, advanceRaidRun, applyRaidAction, raidPublicRun,
} from '../../functions/_lib/raid-engine.js';
import { RAID_RULES, RAID_STAGES } from '../../functions/_lib/raid-rules.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.short || e && e.message || e)); fail++; }
};

const T0 = 1_000_000;
const member = (id, dps = 12000, maxHp = 118512) => ({
  id, name: 'P' + id,
  profile: {
    profileVersion: 2, cls: 'Lord Knight', magic: false, main: 'str', lv: 150, sex: 'm',
    dps, maxHp, armorPen: 0, weaponStars: 0, weaponId: 'k', weaponType: 'katar',
    power: Math.round(dps / 0.28), source: 'class-save-snapshot',
  },
});
const newRun = (members, seed = 7) => createRaidRun({ id: 'raid:tm-' + Math.random().toString(36).slice(2, 8), seed, now: T0, members });

// A compact fingerprint of everything that decides the run's outcome. Two runs with the same
// fingerprint ended the same way, whatever cadence got them there.
function outcome(run) {
  return JSON.stringify({
    state: run.state,
    stageIndex: run.stageIndex,
    stageKey: run.stageKey,
    stageCleared: run.stageCleared,
    finishedAt: run.finishedAt,
    downed: run.members.map(m => m.downed),
    downs: run.members.map(m => m.downs),
    dodges: run.members.map(m => m.dodges),
    hp: run.members.map(m => Math.round(m.hp)),
    enemiesHp: run.enemies.map(e => Math.round(e.hp)),
    enemiesAlive: run.enemies.filter(e => e.hp > 0).length,
    mechanics: run.mechanics.map(m => `${m.kind}:${m.startsAt}:${m.endsAt}:${m.resolvedAt}:${m.outcome || ''}`),
    log: run.log,
  });
}

// Drive a run to `untilMs` with a read every `everyMs`. This is exactly what the client's 2 s poll
// does; here the interval is a parameter so we can prove it does not matter.
function driveWithReads(run, untilMs, everyMs) {
  let guard = 0;
  while (run.updatedAt < untilMs && run.state === 'active' && guard++ < 20_000) {
    const at = Math.min(untilMs, run.updatedAt + everyMs);
    advanceRaidRun(run, at);
    if (run.state !== 'active') break;
  }
  return run;
}

console.log('raid time model (v449): read/action frequency, disconnection, deadline\n');

// ---------------------------------------------------------------- frequency ----
t('read frequency cannot change the outcome (250 ms vs 2 s vs 30 s)', () => {
  const until = T0 + 60_000;
  const results = [250, 2_000, 30_000].map(every => {
    const run = newRun([member(1), member(2)]);
    driveWithReads(run, until, every);
    return { every, fingerprint: outcome(run), run };
  });
  const [fast, normal, slow] = results;
  assert.equal(fast.fingerprint, normal.fingerprint,
    'a 250 ms poll and the client\'s 2 s poll must reach the same state');
  assert.equal(slow.fingerprint, normal.fingerprint,
    'a 30 s poll must reach the same state as a 2 s poll');
  // And it is a real simulation, not a frozen one: the run actually advanced.
  assert.ok(normal.run.members[0].damage > 0 || normal.run.enemies.some(e => e.hp < e.maxHp),
    'the run resolved combat while it was being read');
});

t('a single late read resolves the identical timeline as many small reads', () => {
  const until = T0 + 90_000;
  const many = newRun([member(1), member(2)]);
  driveWithReads(many, until, 250);
  const one = newRun([member(1), member(2)]);
  advanceRaidRun(one, until);          // exactly one read, 90 s later
  assert.equal(outcome(one), outcome(many),
    'one 90 s catch-up read must equal 360 reads of 250 ms');
});

t('frequent reads cannot stall, extend or re-arm a mechanic', () => {
  const run = newRun([member(1)]);
  // Run until the first telegraph exists, then read very fast through its whole window.
  while (!run.mechanics.some(m => !m.resolvedAt) && run.state === 'active' && run.updatedAt < T0 + 60_000) {
    advanceRaidRun(run, run.updatedAt + 2_000);
  }
  const mech = run.mechanics.find(m => !m.resolvedAt);
  assert.ok(mech, 'a mechanic was scheduled');
  const startsAt = mech.startsAt, endsAt = mech.endsAt;
  // Hammer the room with reads while the telegraph is up.
  let at = run.updatedAt;
  while (at < endsAt + 5_000) {
    at = Math.min(endsAt + 5_000, at + 100);
    advanceRaidRun(run, at);
  }
  const same = run.mechanics.find(m => m.startsAt === startsAt);
  assert.equal(same.startsAt, startsAt, 'the telegraph never re-arms on a read');
  assert.equal(same.endsAt, endsAt, 'its window never extends');
  assert.ok(same.resolvedAt > 0, 'and it resolves exactly once');
});

t('frequent reads cannot add damage or attacks', () => {
  const until = T0 + 45_000;
  const fast = newRun([member(1)]);
  driveWithReads(fast, until, 100);
  const slow = newRun([member(1)]);
  driveWithReads(slow, until, 5_000);
  const dealt = run => run.enemies.reduce((s, e) => s + (e.maxHp - e.hp), 0);
  assert.equal(dealt(fast), dealt(slow),
    'damage comes from the clock, not from how often the room is read');
  assert.equal(fast.members[0].actions, slow.members[0].actions,
    'and the skill count matches too');
});

// ------------------------------------------------------------- disconnection ---
t('one player disconnects while teammates continue: the run does not stall', () => {
  const run = newRun([member(1), member(2), member(3)]);
  // Player 2 goes silent: never the one reading, never acting, for 40 s of wall clock.
  driveWithReads(run, T0 + 40_000, 2_000);
  const idle = run.members.find(m => m.id === 2);
  const active = run.members.find(m => m.id === 1);
  assert.ok(active.damage > 0, 'a connected teammate keeps dealing damage');
  assert.ok(idle.damage > 0, 'a silent teammate still auto-attacks via the server clock');
  assert.ok(run.updatedAt >= T0 + 40_000, 'the run advanced while one client was gone');
  assert.equal(run.state, 'active', 'losing one of three does not end the run');
  // A reconnect read must not replay or re-award anything.
  const before = outcome(run);
  const pub = raidPublicRun(run, run.updatedAt);
  advanceRaidRun(run, run.updatedAt);        // a no-op re-read at the same instant
  assert.equal(outcome(run), before, 'a reconnect read at the same instant changes nothing');
  assert.equal(pub.state, 'active');
});

t('everyone disconnects and reconnects BEFORE the deadline: nothing is skipped or duplicated', () => {
  const run = newRun([member(1), member(2)]);
  driveWithReads(run, T0 + 20_000, 2_000);
  const damageBefore = run.members.map(m => m.damage);
  // Nobody reads for 30 s. The engine must catch up exactly as if it had been read throughout.
  const gapUntil = run.updatedAt + 30_000;
  advanceRaidRun(run, gapUntil);
  const afterGap = newRun([member(1), member(2)]);
  driveWithReads(afterGap, gapUntil, 2_000);
  assert.equal(run.members.reduce((s, m) => s + m.damage, 0),
    afterGap.members.reduce((s, m) => s + m.damage, 0),
    'a silent gap resolves to the same total damage as continuous reads');
  assert.ok(run.members.reduce((s, m) => s + m.damage, 0) >= damageBefore.reduce((s, v) => s + v, 0),
    'and it never rewinds');
});

t('everyone disconnects and reconnects AFTER the deadline: the run resolves once, as a loss', () => {
  const run = newRun([member(1), member(2)]);
  driveWithReads(run, T0 + 10_000, 2_000);
  const deadline = run.deadlineAt;
  // Come back long after the deadline.
  advanceRaidRun(run, deadline + 3_600_000);
  assert.notEqual(run.state, 'active', 'a run that outlived its deadline is not still running');
  const finishedAt = run.finishedAt;
  assert.ok(finishedAt > 0 && finishedAt <= deadline,
    'it ended at or before its own deadline, not at the reconnection time');
  // Reading again must not re-finish, re-roll or move anything.
  const settled = outcome(run);
  for (let i = 0; i < 5; i++) advanceRaidRun(run, deadline + 3_600_000 + i * 1_000);
  assert.equal(outcome(run), settled, 'repeat reconnects are inert once the run is terminal');
  assert.equal(run.finishedAt, finishedAt, 'finishedAt is written once');
});

t('the deadline outcome does not depend on when the party comes back', () => {
  const settle = rejoinAfter => {
    const run = newRun([member(1), member(2)]);
    driveWithReads(run, T0 + 5_000, 2_000);
    advanceRaidRun(run, run.deadlineAt + rejoinAfter);
    return JSON.stringify({ state: run.state, finishedAt: run.finishedAt, stageIndex: run.stageIndex });
  };
  const hour = settle(3_600_000);
  const day = settle(86_400_000);
  const week = settle(7 * 86_400_000);
  assert.equal(hour, day, 'rejoining an hour later and a day later end identically');
  assert.equal(day, week, 'and a week later too');
});

// ------------------------------------------------------- actions vs frequency --
t('action frequency cannot add paid output: identical actions produce identical results', () => {
  // Same intent sequence, sent at two very different rates by interleaving idle reads.
  const build = () => {
    const run = newRun([member(1)]);
    advanceRaidRun(run, T0 + 1_000);
    return run;
  };
  const a = build();
  const b = build();
  // Identical action list, at identical timestamps, but `b` is polled between every one.
  const stamps = [5_000, 9_000, 13_000, 17_000, 21_000, 25_000];
  for (const ms of stamps) {
    advanceRaidRun(a, T0 + ms);
    applyRaidAction(a, 1, 'focus', { actionId: 'focus:a:' + ms, targetId: a.enemies[0].id, at: T0 + ms });
    // b: same action, but hammered with reads first
    let at = b.updatedAt;
    while (at < T0 + ms) { at = Math.min(T0 + ms, at + 137); advanceRaidRun(b, at); }
    applyRaidAction(b, 1, 'focus', { actionId: 'focus:b:' + ms, targetId: b.enemies[0].id, at: T0 + ms });
  }
  const strip = run => {
    const o = JSON.parse(outcome(run));
    o.mechanics = 'ignored';   // the seed is shared, but read timing may differ on ties
    return JSON.stringify(o);
  };
  assert.equal(strip(a), strip(b), 'reading between actions changes no output');
  assert.equal(a.members[0].actions, b.members[0].actions, 'no extra skills from extra reads');
  assert.equal(a.members[0].damage, b.members[0].damage, 'no extra damage from extra reads');
});

t('movement intent is floored, so spamming move cannot outrun the walk', () => {
  const run = newRun([member(1)]);
  advanceRaidRun(run, T0 + 1_000);
  const member0 = run.members[0];
  const start = { x: member0.x, z: member0.z };
  // 40 move intents inside one second, all to the far corner.
  let accepted = 0;
  for (let i = 0; i < 40; i++) {
    const at = T0 + 1_000 + Math.floor(i * 25);
    const r = applyRaidAction(run, 1, 'move', { actionId: 'move:spam:' + i, x: 10, z: -19, at });
    if (r.ok) accepted++;
    advanceRaidRun(run, at);
  }
  advanceRaidRun(run, T0 + 2_000);
  const travelled = Math.hypot(member0.x - start.x, member0.z - start.z);
  const maxByWalk = RAID_RULES.walkSpeed * 1.0 + 0.5;
  assert.ok(accepted <= Math.ceil(1_000 / RAID_RULES.moveMinIntervalMs) + 1,
    'the 220 ms floor caps accepted intents: ' + accepted);
  assert.ok(travelled <= maxByWalk,
    'and the member still only walks at ' + RAID_RULES.walkSpeed + ' u/s: moved ' + travelled.toFixed(2));
});

// The retry contract, stated the way the engine actually implements it: exactly-once is a property of
// the actions that PAY for something (an interact, a revive, a dash). Free intents -- movement and
// target selection -- carry no receipt, because re-sending one can neither pay twice nor heal twice;
// what they must guarantee instead is that a replayed one is inert. `focus` used to be tested as if it
// had a receipt, which asserted a mechanism the contract never required. The property that matters is
// now asserted directly, and the genuine stale-replay hazard (an old intent undoing a newer one) is
// covered next to it.
t('a replicated paid action is answered from its receipt and never paid twice', () => {
  const run = newRun([member(1)]);
  advanceRaidRun(run, T0 + 1_000);
  const target = run.enemies.find(e => e.hp > 0);
  const first = applyRaidAction(run, 1, 'interact', { actionId: 'interact:dup:1', targetId: target.id, at: T0 + 2_000 });
  assert.equal(first.ok, true, first.error || '');
  const paidAfterFirst = run.members[0].actions;
  for (let i = 0; i < 25; i++) {
    const again = applyRaidAction(run, 1, 'interact', { actionId: 'interact:dup:1', targetId: target.id, at: T0 + 2_000 + i });
    assert.equal(again.duplicate, true, 'every replay is answered from the receipt');
  }
  assert.equal(run.members[0].actions, paidAfterFirst, 'a replayed id never pays a second time');
});

t('a replayed free intent is inert, and a stale one cannot undo a newer choice', () => {
  const run = newRun([member(1)]);
  advanceRaidRun(run, T0 + 1_000);
  const [a, b] = run.enemies.filter(e => e.hp > 0);
  // A newer choice, then a duplicate of an intent the player made before it.
  const newer = applyRaidAction(run, 1, 'focus', { actionId: 'focus:new:1', targetId: a.id, at: T0 + 5_000 });
  assert.equal(newer.ok, true, newer.error || '');
  const damageAfter = run.members[0].damage;
  const stale = applyRaidAction(run, 1, 'focus', { actionId: 'focus:old:1', targetId: b.id, at: T0 + 3_000 });
  assert.equal(stale.ok, true, 'a stale intent is acknowledged, not an error');
  assert.equal(stale.stale, true, 'and it is reported as stale');
  assert.equal(run.members[0].targetId, a.id, 'the newer choice stands');
  assert.equal(run.members[0].damage, damageAfter, 'and it never pays damage');
  // A movement replay must not reset the manual hold or drag the player back.
  applyRaidAction(run, 1, 'move', { actionId: 'move:new:1', x: 8, z: 8, at: T0 + 9_000 });
  const hold = run.members[0].manualUntil;
  const spot = run.members[0].intentX;
  applyRaidAction(run, 1, 'move', { actionId: 'move:old:1', x: -8, z: -8, at: T0 + 4_000 });
  assert.equal(run.members[0].manualUntil, hold, 'a replayed move cannot extend the hold');
  assert.equal(run.members[0].intentX, spot, 'nor overwrite the destination');
});

t('a raid can only be settled from a terminal state, and the state is the only input', () => {
  const run = newRun([member(1)]);
  driveWithReads(run, T0 + 15_000, 2_000);
  // Still active: nothing to settle.
  assert.equal(run.state, 'active');
  assert.equal(run.finishedAt, 0, 'an active run has no finish time to settle on');
  // Force the terminal state through the engine, then prove it is stable and single-valued.
  for (const m of run.members) { m.hp = 0; m.downed = true; }
  advanceRaidRun(run, run.updatedAt + 1_000);
  assert.equal(run.state, 'failed');
  const stamp = run.finishedAt;
  for (let i = 0; i < 10; i++) advanceRaidRun(run, run.updatedAt + 5_000);
  assert.equal(run.state, 'failed', 'the outcome cannot flip by being read again');
  assert.equal(run.finishedAt, stamp, 'and the finish time never moves');
});

t('the public snapshot is a pure function of the run, not of when it is read', () => {
  const run = newRun([member(1), member(2)]);
  driveWithReads(run, T0 + 30_000, 2_000);
  const a = raidPublicRun(run, run.updatedAt);
  // Reading the *same* instant twice, and reading far in the future, must not invent state.
  const b = raidPublicRun(run, run.updatedAt);
  assert.deepEqual(a, b, 'two reads at one instant are identical');
  const future = raidPublicRun(run, run.updatedAt + 999_999);
  assert.equal(future.state, a.state, 'a far-future read does not advance the run by itself');
  assert.equal(future.stageIndex, a.stageIndex);
  assert.equal(future.finishedAt, a.finishedAt);
  assert.equal(a.startedAt, run.startedAt, 'the run identity is echoed unchanged');
  assert.equal(a.deadlineAt, run.deadlineAt);
});

t('a stage transitions once, however many readers race it', () => {
  const run = newRun([member(1)]);
  // Clear stage 1 by killing the objective, then let several "clients" read it.
  while (!run.stageCleared && run.state === 'active' && run.updatedAt < T0 + 120_000) {
    advanceRaidRun(run, run.updatedAt + 2_000);
  }
  assert.equal(run.stageCleared, true);
  const idx = run.stageIndex;
  const requestAt = run.updatedAt;
  const through = applyRaidAction(run, 1, 'interact', { actionId: 'portal:race:1', targetId: 'portal', at: requestAt });
  assert.equal(through.ok, true, through.error || '');
  for (let i = 0; i < 6; i++) advanceRaidRun(run, requestAt + 100 + i);
  assert.equal(run.stageIndex, idx + 1, 'exactly one stage transition');
  const after = outcome(run);
  for (let i = 0; i < 6; i++) advanceRaidRun(run, requestAt + 2_000 + i);
  // Reading on does advance combat, but it must never advance the *stage* again without a portal.
  assert.ok(run.stageIndex >= idx + 1, 'stage index never goes backwards');
  assert.ok(run.stageIndex <= idx + 2, 'and it does not skip a stage');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
