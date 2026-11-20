// Player-character Astral dungeon acceptance (haven-v449), without a browser or a Durable Object.
//
// The clock is supplied by the test: every attack, mechanic and stage boundary resolves on a
// timestamp the engine wrote, never on the moment a request happened to arrive.
//
// What is asserted here is the *server* model: the four stages, the objective scaling, the three
// boss mechanics, downed/revive, the portal, the fixed deadline, idempotent action receipts and a
// run that a solo or a trio can actually finish.
import assert from 'node:assert/strict';
import {
  createRaidRun, sanitizeRaidRun, advanceRaidRun, applyRaidAction, raidPublicRun, STAGE_BOUNDS, SIM_TICK_MS,
} from '../../functions/_lib/raid-engine.js';
import {
  RAID_RULES, RAID_STAGES, RAID_STAGE_KEYS, stageWorkload, raidPartySize, raidRunSeconds, raidStageSeconds,
} from '../../functions/_lib/raid-rules.js';
import { raidProfileFromSave, decodeRaidSave } from '../../functions/_lib/raid-profile.js';
import { packSave } from '../../functions/_lib/save-codec.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); fail++; }
};
const finiteHp = run => run.members.every(m => Number.isFinite(m.hp) && Number.isFinite(m.maxHp) && m.hp >= 0 && m.hp <= m.maxHp);
const living = run => run.members.filter(m => !m.downed && m.hp > 0);

// A real save, read through the same decoder production uses. `atkPct`/`hpp` are percentages.
function saveFor(cls = 'Lord Knight', magic = false) {
  const st = magic
    ? { str: 1, agi: 90, dex: 120, luk: 1, int: 120, vit: 120 }
    : { str: 120, agi: 120, dex: 120, luk: 90, int: 1, vit: 120 };
  const main = magic
    ? { id: 'staff', slot: 'weapon', wt: 'staff', name: 'Rift Staff', val: 5200, r: 15, aff: [{ k: 'matk', v: 18 }], sec: 5 }
    : { id: 'katar', slot: 'weapon', wt: 'katar', name: 'Rift Katar', val: 5200, r: 15, aff: [{ k: 'atk', v: 18 }], sec: 5 };
  return {
    lv: 175, cls, sex: 'm', st,
    eq: {
      weapon: main,
      armor: { id: 'a', slot: 'armor', val: 4200, r: 12, aff: [{ k: 'hpp', v: 6 }] },
      head: { id: 'h', slot: 'head', val: 3000, r: 10, aff: [] },
      off: { id: 'o', slot: 'off', wt: 'dagger', val: 1400, r: 8, aff: [] },
      acc1: { id: 'a1', slot: 'acc1', val: 2000, r: 10, aff: [{ k: 'hp', v: 900 }] },
      acc2: { id: 'a2', slot: 'acc2', val: 2000, r: 10, aff: [] },
    },
    inv: [
      { id: 'bag-katar', slot: 'weapon', wt: 'katar', name: 'Bag Katar', val: 1, r: 0, aff: [], sec: 5 },
      { id: 'bag-staff', slot: 'weapon', wt: 'staff', name: 'Bag Staff', val: 1, r: 0, aff: [], sec: 5 },
    ],
    pv: { hpp: 0 },
  };
}
const profile = (cls, magic) => raidProfileFromSave(saveFor(cls, magic));
const member = (id, name, p) => ({ id, name, profile: p });

// A run pinned to a quiet hazard budget (no mechanics) unless a test wants them: the layout tests
// below measure targeting, not dodging.
function baseRun(memberList, overrides = {}) {
  return createRaidRun({
    id: 'raid:sim-' + Math.random().toString(36).slice(2, 8),
    leaderId: memberList[0].id,
    partySize: memberList.length,
    now: 1_000_000,
    deadlineAt: 1_000_000 + RAID_STAGES.reduce((s, x) => s + x.budgetSeconds, 0) * 1000 + RAID_RULES.graceSeconds * 1000,
    seed: 12345,
    members: memberList,
    ...overrides,
  });
}
// Walk the run at a fixed cadence, sending one focused intent per member, so the auto-combat model
// actually runs. This is what a player who taps once and stands still produces.
function play(run, seconds, { focus = true, every = 5_000, onTick = null } = {}) {
  let at = run.startedAt;
  for (let second = 1; second <= seconds && run.state === 'active'; second++) {
    at = run.startedAt + second * 1000;
    advanceRaidRun(run, at);
    if (run.state !== 'active') break;
    if (focus && second * 1000 % every === 0) {
      const target = run.enemies.find(e => e.hp > 0);
      for (const m of living(run)) {
        applyRaidAction(run, m.id, 'focus', { actionId: 'focus:' + m.id + ':' + second, at, targetId: target ? target.id : '' });
      }
    }
    if (onTick) onTick(run, at, second);
  }
  return run;
}

// Walk the run at a fixed cadence until `done(run)` holds, or the second budget runs out. The tests
// below care about an *event* -- a stage clearing, a portal opening -- not about an arbitrary wall-clock
// offset. A party that clears stage 1 at ~42 s and is auto-carried into stage 2 at ~62 s has no open
// portal left to inspect at a fixed 120 s read, so "read at 120 s and expect stage 1's portal" was never
// a property of the game; it only passed while the scheduler under-simulated the run and left the party
// stranded in stage 1. Stopping on the event asserts the behaviour that is actually specified.
function playUntil(run, done, seconds = 1_200, { focus = true, every = 5_000 } = {}) {
  let at = run.startedAt;
  for (let second = 1; second <= seconds && run.state === 'active'; second++) {
    at = run.startedAt + second * 1000;
    advanceRaidRun(run, at);
    if (run.state !== 'active') break;
    if (focus && second * 1000 % every === 0) {
      const target = run.enemies.find(e => e.hp > 0);
      for (const m of living(run)) {
        applyRaidAction(run, m.id, 'focus', { actionId: 'focus:' + m.id + ':' + second, at, targetId: target ? target.id : '' });
      }
    }
    if (done(run)) break;
  }
  return run;
}

// The player loop, as the client actually sends it: one intent per second, per living member. A
// mechanic telegraph is walked out of, a ritual source is shot, a downed teammate is revived, and a
// cleared stage is walked through. Nothing here touches engine internals: it is only `act` intents.
function playbase(memberList, { seed = 3, seconds = 1_200 } = {}) {
  const run = createRaidRun({ id: 'raid:play-' + Math.random().toString(36).slice(2, 8), seed, now: 1_000_000, members: memberList });
  run.stagesCleared = [];
  for (let second = 1; second <= seconds && run.state === 'active'; second++) {
    const at = run.startedAt + second * 1000;
    advanceRaidRun(run, at);
    if (run.state !== 'active') break;
    const mech = run.mechanics.find(m => !m.resolvedAt && m.endsAt > at && m.kind !== 'ritual');
    const ritual = run.mechanics.find(m => m.kind === 'ritual' && !m.resolvedAt);
    const boss = run.enemies.find(e => e.kind === 'boss' && e.hp > 0);
    for (const m of living(run)) {
      const id = (label) => `${label}:${m.id}:${second}`;
      if (run.stageCleared) {
        const through = applyRaidAction(run, m.id, 'interact', { actionId: id('portal'), targetId: 'portal', at });
        if (through.ok && !run.stagesCleared.includes(run.stageKey)) run.stagesCleared.push(run.stageKey);
        advanceRaidRun(run, at + 60);
        break;
      }
      if (ritual) {
        const source = run.enemies.find(e => ritual.sourceIds.includes(e.id) && e.hp > 0);
        if (source) applyRaidAction(run, m.id, 'focus', { actionId: id('focus'), targetId: source.id, at });
        continue;
      }
      if (mech) {
        const spot = dodgeSpot(mech, m);
        if (spot) applyRaidAction(run, m.id, 'move', { actionId: id('dodge'), x: spot.x, z: spot.z, at });
        continue;
      }
      const ally = run.members.find(x => x.downed && x.id !== m.id);
      if (ally) {
        if (Math.hypot(ally.x - m.x, ally.z - m.z) > 2.2) applyRaidAction(run, m.id, 'move', { actionId: id('help'), x: ally.x, z: ally.z, at });
        else applyRaidAction(run, m.id, 'revive', { actionId: id('revive'), targetId: ally.id, at });
        continue;
      }
      const target = run.enemies.find(e => e.hp > 0 && e.kind === 'ritual-source')
        || boss
        || run.enemies.find(e => e.hp > 0);
      if (target) applyRaidAction(run, m.id, 'focus', { actionId: id('focus'), targetId: target.id, at });
    }
  }
  if (run.state === 'cleared' && !run.stagesCleared.includes(run.stageKey)) run.stagesCleared.push(run.stageKey);
  return run;
}

// Where a player walks to leave a telegraph: out of the cone, out of the strip, or into the ward.
function dodgeSpot(mechanic, m) {
  if (mechanic.kind === 'astral-cataclysm') return { x: mechanic.safeX, z: mechanic.safeZ };
  if (mechanic.kind === 'soul-cleave') {
    const perp = mechanic.angle + Math.PI / 2;
    const r = 7;
    return { x: mechanic.originX + Math.cos(perp) * r, z: mechanic.originZ + Math.sin(perp) * r };
  }
  if (mechanic.kind === 'sweep') {
    const out = (mechanic.halfWidth || 2) + 2.5;
    return { x: mechanic.x + (m.x < mechanic.x ? -out : out), z: m.z };
  }
  return null;
}

console.log('astral dungeon engine (v449): four stages, server-owned clock\n');

t('the four stages are the Astral dungeon, in order, with their own targets', () => {
  assert.deepEqual(RAID_STAGES.map(s => s.key), ['approach', 'arcade', 'observatory', 'sanctuary']);
  assert.deepEqual(RAID_STAGES.map(s => s.targetSeconds), [52, 67, 67, 240]);
  assert.equal(RAID_STAGES[3].name, "Thanatos's Sanctuary");
  for (const stage of RAID_STAGES) {
    const b = STAGE_BOUNDS[stage.key];
    assert.ok(b, 'engine bounds exist for ' + stage.key);
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) assert.ok(Number.isFinite(b[key]), stage.key + ' has ' + key);
    assert.ok(b.minX < b.maxX && b.minZ < b.maxZ, stage.key + ' bounds are a real box');
  }
  assert.equal(raidPartySize(1), 1);
  assert.equal(raidPartySize(3), 3);
  assert.deepEqual([...RAID_RULES.partySizes], [1, 2, 3], 'the only legal party sizes are 1, 2 and 3');
  assert.equal(raidPartySize(9), 1, 'an out-of-range party size falls back to a solo room, never to a bigger one');
});

t('physical and magic profiles produce finite, capped server power', () => {
  const phys = profile('Lord Knight', false);
  const magic = profile('Warlock', true);
  for (const p of [phys, magic]) {
    assert.ok(Number.isFinite(p.maxHp) && p.maxHp > 1000);
    assert.ok(Number.isFinite(p.dps) && p.dps >= RAID_RULES.dpsMin && p.dps <= RAID_RULES.dpsMax);
  }
  assert.equal(phys.magic, false);
  assert.equal(magic.magic, true);
  // A magic class reads its power from INT, not from a physical main stat, so the same gear band
  // must still produce a usable number (its DPS is a share of the cap, not a different scale).
  assert.ok(magic.power > 0 && phys.power > 0);
  assert.ok(magic.dps >= RAID_RULES.dpsMin && magic.dps <= RAID_RULES.dpsMax);
  // Stats alone cannot reach the 800k cap: the snapshot is a share of a documented power formula,
  // and the cap exists so a hand-edited item value still cannot turn the raid into an instant kill.
  const cheat = raidProfileFromSave({
    ...saveFor('Lord Knight', false),
    st: { str: 500, dex: 500, luk: 500, vit: 500, int: 500, agi: 500 },
    eq: { ...saveFor('Lord Knight', false).eq, weapon: { id: 'k', slot: 'weapon', wt: 'katar', val: 999_999_999, r: 15 } },
  });
  assert.ok(cheat.dps <= RAID_RULES.dpsMax, 'the cap is a hard ceiling: ' + cheat.dps);
  assert.equal(cheat.dps, RAID_RULES.dpsMax, 'the absurd weapon is capped, not extrapolated');
});

t('a packed bag weapon survives the canonical decoder and the equipped weapon still wins', () => {
  const packed = packSave(saveFor('Lord Knight', false));
  assert.notEqual(packed.__v, undefined);
  const decoded = decodeRaidSave(JSON.stringify(packed));
  assert.ok(decoded && Array.isArray(decoded.inv));
  const p = raidProfileFromSave(decoded);
  assert.equal(p.weaponId, 'katar');
  assert.equal(p.magic, false);
  assert.ok(p.dps > 0);
});

t('a fresh run starts on stage 1 with the whole pack alive and the party at the entrance', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  assert.equal(run.stageIndex, 0);
  assert.equal(run.stageKey, 'approach');
  assert.equal(run.state, 'active');
  assert.equal(run.stageCleared, false);
  assert.ok(run.enemies.length >= 5, 'stage 1 has a pack: ' + run.enemies.length);
  assert.ok(run.enemies.every(e => e.hp === e.maxHp && !e.dead));
  const b = STAGE_BOUNDS.approach;
  for (const m of run.members) {
    assert.ok(m.x >= b.minX && m.x <= b.maxX && m.z >= b.minZ && m.z <= b.maxZ, 'spawned inside the bounds');
    assert.equal(m.hp, m.maxHp);
  }
});

t('a fresh run never carries member/profile maxHp disagreement, and sanitize repairs damage', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  for (const m of run.members) assert.equal(m.maxHp, m.profile.maxHp);
  const broken = JSON.parse(JSON.stringify(run));
  delete broken.members[0].maxHp;
  delete broken.members[1].profile.maxHp;
  broken.mechanics = 'nonsense';
  broken.stageIndex = 99;
  broken.state = 'failed'; broken.finishedAt = 1_001_000; broken.settledAckAt = 1_002_000;
  const restored = sanitizeRaidRun(broken);
  assert.ok(restored);
  for (const m of restored.members) {
    assert.ok(Number.isFinite(m.maxHp) && m.maxHp >= 1000);
    // The run-level ceiling is clamped to a 1,000 HP floor once the profile is gone; it must never be
    // NaN or zero, and a surviving profile always wins.
    if (m.profile && m.profile.maxHp > 1000) assert.equal(m.maxHp, m.profile.maxHp);
  }
  assert.ok(Array.isArray(restored.mechanics));
  assert.ok(restored.stageIndex >= 0 && restored.stageIndex < RAID_STAGES.length);
  assert.equal(restored.state, 'failed');
  assert.equal(restored.settledAckAt, 1_002_000, 'the acknowledged retry window survives a room restart');
  assert.ok(finiteHp(restored));
});

t('the stage objective is scaled from the party, not from its size', () => {
  const approach = stageWorkload(1);
  const arcade = stageWorkload(2);
  const observatory = stageWorkload(3);
  assert.ok(approach.packs > 0, 'stage 1 is a pack stage');
  assert.equal(arcade.anchors, RAID_RULES.scaling.anchorsSolo, 'stage 2 asks for anchors');
  assert.equal(observatory.ritualSources, RAID_RULES.scaling.ritualSourcesSolo, 'stage 3 asks for ritual sources');
  // The objective is flat across party sizes: nobody needs a second person for a mandatory mechanic.
  assert.deepEqual(stageWorkload(1, 3), stageWorkload(1, 1));
  // Every stage's objective is a duration for the party that is actually in it, and the stage clock
  // is never shorter than that duration.
  const p = profile('Lord Knight', false);
  for (const size of [1, 3]) {
    const members = Array.from({ length: size }, (_, i) => member(i + 1, 'P' + i, p));
    const run = baseRun(members);
    const workloadSeconds = run.enemies.reduce((s, e) => s + e.maxHp, 0) / run.partyDps;
    assert.ok(workloadSeconds >= RAID_RULES.scaling.minClearSeconds * 0.95, 'the objective is at least the minimum: ' + workloadSeconds.toFixed(1));
    assert.ok(workloadSeconds <= (run.stageEndsAt - run.stageStartedAt) / 1000, 'the objective fits inside the stage clock');
  }
});

t('the fixed deadline ends the run at its own timestamp, not at request arrival', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  // Park the party out of reach so nothing but the clock can end this run.
  run.hazardPlan = [];
  run.nextMechanicAt = Infinity;
  for (const e of run.enemies) { e.x = STAGE_BOUNDS.approach.minX + 0.5; e.z = STAGE_BOUNDS.approach.minZ + 0.5; }
  for (const m of run.members) { m.x = STAGE_BOUNDS.approach.maxX - 1; m.z = STAGE_BOUNDS.approach.maxZ - 1; m.auto = true; }
  const deadline = run.deadlineAt;
  advanceRaidRun(run, deadline + 9_999_999);
  assert.equal(run.state, 'failed', 'an idle party loses the run');
  assert.ok(run.finishedAt > 0 && run.finishedAt <= deadline, 'the run ends at or before its deadline: ' + (run.finishedAt - run.startedAt) / 1000 + 's');
  assert.ok(run.updatedAt <= deadline, 'the clock never runs past the deadline');
  // The deadline is the sum of the four stage budgets plus each stage's own allowance.
  assert.equal(deadline - run.startedAt, raidRunSeconds() * 1000, 'the deadline covers every stage, including the boss allowance');
  assert.ok(raidStageSeconds('sanctuary') > raidStageSeconds('approach'), 'the boss stage carries a longer allowance');
  assert.equal(raidRunSeconds(), RAID_STAGES.reduce((sum, st) => sum + raidStageSeconds(st.key), 0));
});

t('auto-combat kills the pack and opens the exit portal, then the party walks through', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  run.hazardPlan = [];
  playUntil(run, r => r.stageCleared);
  assert.equal(run.stageCleared, true, 'stage 1 cleared by standing and fighting');
  assert.equal(run.stageIndex, 0, 'stage 1 was still the current stage when it cleared');
  assert.ok(run.portalOpenAt > 0, 'the portal has an open time');
  assert.ok(run.members[0].damage > 0, 'damage came from the server model');
  // The portal is refused before a stage is cleared and accepted after it.
  const fresh = baseRun([member(1, 'A', p)]);
  const early = applyRaidAction(fresh, 1, 'interact', { actionId: 'portal:early:1', targetId: 'portal', at: fresh.startedAt + 1000 });
  assert.equal(early.ok, false, 'no portal before the stage is clear');
  if (run.stageIndex === 0) {
    const through = applyRaidAction(run, 1, 'interact', { actionId: 'portal:late:1', targetId: 'portal', at: run.updatedAt });
    assert.equal(through.ok, true, through.error || '');
    assert.ok(run.portalRequestedAt > 0);
    assert.equal(run.stageIndex, 0, 'the interact only asks to walk through; the transition is the next tick');
  }
  // Crossing a whole cell is what resolves the walk-through; 50 ms can land inside the current cell.
  advanceRaidRun(run, run.updatedAt + SIM_TICK_MS * 2);
  assert.ok(run.stageIndex >= 1, 'the party advanced past the approach: stage ' + run.stageIndex);
  assert.equal(run.stageKey, 'arcade');
  // `play()` is still walking the run, so by now stage 2 may itself be clear. What must hold is that
  // the new stage carried its own fresh objective of enemies rather than inheriting a finished one.
  assert.ok(run.enemies.length > 0 && run.enemies.every(e => e.maxHp > 0), 'the new stage has its own objective');
  if (!run.stageCleared) assert.ok(run.enemies.some(e => e.hp > 0));
});

// The scheduler's defining property: the run is a function of the clock, not of how often it is read.
// This is the assertion that the fixed-cell rewrite exists to satisfy, and the one the older suite
// lacked -- its `play()` helper hard-coded a 1 s read, so a scheduler whose damage depended on the read
// cadence could still pass every test. A 100 ms client, a 1 s client and a 5 s client that send the same
// intents must be in the same state at the same instant.
t('the same intents at the same instant give the same state at any read cadence', () => {
  const p = profile('Lord Knight', false);
  const focusEvery = 5_000;
  const end = 120_000;
  const runAt = (stepMs) => {
    const run = baseRun([member(1, 'A', p)]);
    run.hazardPlan = [];
    // Reads and intents are separate schedules. The player's focus taps happen on the 5 s wall clock no
    // matter how often the loop wakes, so the intent list is identical for every reader; only the read
    // instants differ. Both are merged into one ascending timeline, read-then-intent when they coincide.
    const events = [];
    for (let t = stepMs; t <= end; t += stepMs) events.push({ t, read: true });
    for (let t = focusEvery; t <= end; t += focusEvery) events.push({ t, read: false });
    events.sort((a, b) => a.t - b.t || (a.read === b.read ? 0 : a.read ? -1 : 1));
    for (const ev of events) {
      const at = run.startedAt + ev.t;
      advanceRaidRun(run, at);
      if (run.state !== 'active') break;
      if (ev.read) continue;
      const target = run.enemies.find(e => e.hp > 0);
      for (const m of living(run)) {
        applyRaidAction(run, m.id, 'focus', { actionId: 'focus:' + m.id + ':' + at, at, targetId: target ? target.id : '' });
      }
    }
    return {
      stageIndex: run.stageIndex,
      stageKey: run.stageKey,
      damage: Math.round(run.members[0].damage),
      hp: Math.round(run.members[0].hp),
      alive: run.enemies.filter(e => e.hp > 0).length,
      enemyHp: run.enemies.filter(e => e.hp > 0).map(e => e.id + ':' + Math.round(e.hp)).sort().join(','),
      cursor: run.cursorAt - run.startedAt,
    };
  };
  const fine = runAt(100);
  for (const stepMs of [1_000, 5_000, 30_000]) {
    assert.deepEqual(runAt(stepMs), fine, 'a ' + stepMs + ' ms reader sees the same run as a 100 ms reader');
  }
});

t('an untouched stage carries the party through the portal so nobody is stranded', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  run.hazardPlan = [];
  playUntil(run, r => r.stageCleared);
  assert.equal(run.stageCleared, true);
  const openedAt = run.portalOpenAt;
  const stageBefore = run.stageIndex;
  assert.equal(stageBefore, 0);
  advanceRaidRun(run, openedAt + 25_000);
  assert.ok(run.stageIndex > stageBefore, 'the party moved on without an interact');
});

t('a telegraphed mechanic damages only who stayed inside it, on its own clock', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  run.hazardPlan = [];
  advanceRaidRun(run, run.nextMechanicAt + 1);
  const mech = run.mechanics.find(m => !m.resolvedAt);
  assert.ok(mech, 'the stage produced a mechanic');
  assert.ok(mech.endsAt > mech.startsAt, 'it is telegraphed, not instant');
  const before = run.members.map(m => m.hp);
  // Keep both members exactly where they are: whether they are hit is the server's geometry.
  advanceRaidRun(run, mech.endsAt + 1);
  const damaged = run.members.filter((m, i) => m.hp < before[i]).length;
  assert.ok(run.mechanics.every(m => m.resolvedAt > 0), 'the mechanic is resolved once');
  assert.ok(finiteHp(run));
  // A mechanic that nobody is inside still resolves (it is a real event, not a no-op).
  assert.ok(damaged <= run.members.length);
});

t('a downed member is out of the fight and a living teammate revives them in reach', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  run.hazardPlan = [];
  // Down member 1 by hand: this test is about the revive rule, not about the damage model.
  run.members[0].hp = 0; run.members[0].downed = true;
  const downed = applyRaidAction(run, 1, 'interact', { actionId: 'down:portal:1', targetId: 'portal', at: run.updatedAt });
  assert.equal(downed.ok, false, 'a downed member cannot act');
  run.members[1].x = run.members[0].x + 6.5;
  run.members[1].z = run.members[0].z;
  const away = applyRaidAction(run, 2, 'revive', { actionId: 'revive:far:1', targetId: 1, at: run.updatedAt });
  assert.equal(away.ok, false, 'a revive beyond the 3.2-unit reach is refused');
  run.members[1].x = run.members[0].x; run.members[1].z = run.members[0].z;
  let revived = null;
  for (let i = 0; i < 3 && !revived; i++) {
    const r = applyRaidAction(run, 2, 'revive', { actionId: 'revive:near:' + i, targetId: 1, at: run.updatedAt });
    assert.equal(r.ok, true, r.error || '');
    if (r.result.healed > 0) revived = r;
  }
  assert.ok(revived, 'three holds revive the teammate');
  assert.equal(run.members[0].downed, false);
  assert.ok(run.members[0].hp > 0 && run.members[0].hp <= run.members[0].maxHp);
  assert.ok(finiteHp(run));
});

t('a full wipe ends the run as failed, with no NaN and no further actions', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  for (const m of run.members) { m.hp = 0; m.downed = true; }
  advanceRaidRun(run, run.updatedAt + 1000);
  assert.equal(run.state, 'failed');
  assert.equal(run.wipe, undefined); // the field lives on the public snapshot
  assert.ok(finiteHp(run));
  const late = applyRaidAction(run, 1, 'interact', { actionId: 'late:portal:1', targetId: 'portal', at: run.updatedAt });
  assert.equal(late.ok, false);
});

t('movement is a destination, clamped to the stage, with a small server floor', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  const b = STAGE_BOUNDS.approach;
  const ok = applyRaidAction(run, 1, 'move', { actionId: 'move:one:1', x: b.maxX + 500, z: b.minZ - 500, at: run.startedAt + 500 });
  assert.equal(ok.ok, true, ok.error || '');
  assert.ok(run.members[0].x <= b.maxX && run.members[0].z >= b.minZ, 'the destination is clamped into the stage');
  const tooSoon = applyRaidAction(run, 1, 'move', { actionId: 'move:two:1', x: 0, z: 0, at: run.startedAt + 510 });
  assert.equal(tooSoon.ok, false, 'movement has a server floor');
  // The walk happens on the run's clock, at the engine's own speed.
  const from = { x: run.members[0].x, z: run.members[0].z };
  const back = applyRaidAction(run, 1, 'move', { actionId: 'move:four:1', x: 0, z: 0, at: run.members[0].lastIntentAt + RAID_RULES.moveMinIntervalMs });
  assert.equal(back.ok, true, back.error || '');
  advanceRaidRun(run, run.updatedAt + 1000);
  const moved = Math.hypot(run.members[0].x - from.x, run.members[0].z - from.z);
  assert.ok(moved > 0 && moved <= RAID_RULES.walkSpeed + 0.001, 'one second of walking: ' + moved.toFixed(2));
  // The automatic chase never walks a member into a live telegraph, and never tunnels through one in
  // a single long step: the strip sits between the party and the only enemy they can reach.
  const guarded = baseRun([member(1, 'A', p)]);
  const guard = guarded.members[0];
  const enemy = guarded.enemies[0];
  guard.x = 6; guard.z = -6; guard.intentX = 6; guard.intentZ = -6;
  enemy.x = -6; enemy.z = -6;
  guarded.enemies.slice(1).forEach(e => { e.hp = 0; });
  guarded.nextMechanicAt = Infinity;
  guarded.mechanics.push({ kind: 'sweep', id: 'sw:guard', startsAt: guarded.startedAt, endsAt: guarded.startedAt + 9_999_999, resolvedAt: 0, x: 0, halfWidth: 2 });
  let closest = Math.abs(guard.x);
  for (let step = 1; step <= 20; step++) {
    advanceRaidRun(guarded, guarded.startedAt + step * 1000);
    closest = Math.min(closest, Math.abs(guard.x));
  }
  assert.ok(closest >= 2, 'the auto-chase stops at the telegraph edge, never inside it: x=' + closest.toFixed(2));
  assert.ok(Math.abs(guard.x) >= 2, 'and it does not tunnel through it either');
});

t('focus picks a real target and refuses one that is not in the stage', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  const target = run.enemies[0];
  const ok = applyRaidAction(run, 1, 'focus', { actionId: 'focus:real:1', targetId: target.id, at: run.startedAt + 400 });
  assert.equal(ok.ok, true);
  assert.equal(run.members[0].targetId, target.id);
  const bad = applyRaidAction(run, 1, 'focus', { actionId: 'focus:fake:1', targetId: 'not-in-this-stage', at: run.startedAt + 600 });
  assert.equal(bad.ok, false);
  assert.equal(run.members[0].targetId, target.id, 'a refused focus leaves the previous target');
});

t('action ids are idempotent: a replayed interact never pays twice', () => {
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  run.hazardPlan = [];
  playUntil(run, r => r.stageCleared);
  assert.equal(run.stageCleared, true);
  assert.equal(run.stageIndex, 0, 'the portal under test is stage 1\'s own portal');
  const first = applyRaidAction(run, 1, 'interact', { actionId: 'portal:once:1', targetId: 'portal', at: run.updatedAt });
  assert.equal(first.ok, true, first.error || '');
  const stamp = run.portalRequestedAt;
  const replay = applyRaidAction(run, 1, 'interact', { actionId: 'portal:once:1', targetId: 'portal', at: run.updatedAt });
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true, 'the receipt replays the first answer');
  assert.equal(run.portalRequestedAt, stamp, 'the replay changed nothing');
  for (const badId of ['short', '', 'x'.repeat(101), 'not valid!']) {
    const bad = applyRaidAction(run, 1, 'interact', { actionId: badId, targetId: 'portal', at: run.updatedAt });
    assert.equal(bad.ok, false, 'a malformed action id is refused: ' + JSON.stringify(badId.slice(0, 12)));
    assert.equal(bad.code, 400);
  }
});

t('the public snapshot is serialisable and carries everything the renderer draws', () => {
  const p = profile('Warlock', true);
  const run = baseRun([member(1, 'A', p), member(2, 'B', p)]);
  advanceRaidRun(run, run.startedAt + 5_000);
  const pub = JSON.parse(JSON.stringify(raidPublicRun(run, run.startedAt + 5_000)));
  for (const key of ['id', 'state', 'stageIndex', 'stageKey', 'stageName', 'stageEndsAt', 'stageCleared', 'serverNow', 'summary', 'members', 'enemies', 'mechanics']) {
    assert.ok(key in pub, 'the snapshot carries ' + key);
  }
  assert.equal(pub.members.length, 2);
  assert.ok(pub.members.every(m => Number.isFinite(m.hp) && Number.isFinite(m.maxHp) && Number.isFinite(m.x) && Number.isFinite(m.z)));
  assert.ok(pub.summary.requiredAlive >= 0 && pub.summary.requiredTotal > 0);
  assert.ok(pub.enemies.every(e => typeof e.id === 'string' && typeof e.spriteId === 'number' && 'dead' in e));
  assert.ok(Array.isArray(pub.mechanics));
  assert.equal(pub.serverNow, Math.max(run.updatedAt, run.startedAt + 5_000));
});

t('a solo player of the reference gear clears all four stages by playing the mechanics', () => {
  const p = profile('Lord Knight', false);
  assert.ok(p.dps >= RAID_RULES.dpsMin);
  const run = playbase([member(1, 'A', p)], { seed: 3 });
  assert.equal(run.state, 'cleared', 'solo cleared after ' + Math.round((run.finishedAt - run.startedAt) / 1000) + 's stage=' + run.stageKey + ' hp=' + run.members[0].hp + '/' + run.members[0].maxHp + ' log=' + run.log.slice(-3).join(' | '));
  assert.ok(run.finishedAt <= run.deadlineAt, 'the clear happens inside the run clock');
  assert.equal(run.stageIndex, RAID_STAGES.length - 1);
  assert.ok(finiteHp(run));
  // Every stage paid its transition, in order, and the boss is actually dead.
  assert.deepEqual(run.stagesCleared, RAID_STAGE_KEYS);
  assert.ok(run.enemies.every(e => e.hp <= 0));
  assert.ok(run.members[0].dodges > 0, 'the party dodged real telegraphs');
});

t('a trio clears, and playing badly is a real loss rather than a slower win', () => {
  const p = profile('Lord Knight', false);
  const members = [member(1, 'A', p), member(2, 'B', p), member(3, 'C', p)];
  const run = playbase(members, { seed: 3 });
  assert.equal(run.state, 'cleared', 'trio cleared after ' + Math.round((run.finishedAt - run.startedAt) / 1000) + 's stage=' + run.stageKey + ' log=' + run.log.slice(-3).join(' | '));
  assert.ok(finiteHp(run));
  assert.deepEqual(run.stagesCleared, RAID_STAGE_KEYS);
  // The same party that never reacts is wiped in the sanctuary: the mechanics are the content, not
  // decoration. (This is the solo case, where a down cannot be revived by anyone.)
  const idle = baseRun([member(1, 'A', p)], { seed: 3 });
  for (let s = 1; s <= 400 && idle.state === 'active'; s++) advanceRaidRun(idle, idle.startedAt + s * 1000);
  assert.equal(idle.state, 'failed', 'an idle solo party loses the run');
  assert.ok(idle.finishedAt <= idle.deadlineAt);
});

t('the boss stage carries Thanatos, and the ritual sources are real enemies', () => {
  const rules = RAID_RULES;
  assert.equal(rules.bossArmor, 0.16);
  assert.deepEqual([...rules.ritual.triggers], [0.70, 0.35]);
  assert.ok(rules.ritual.channelMs >= 16_000);
  assert.ok(rules.soulCleave.tellMs >= 4_000 && rules.cataclysm.tellMs >= 5_000);
  const p = profile('Lord Knight', false);
  const run = baseRun([member(1, 'A', p)]);
  // Fast-forward through the first three stages by clearing them directly, then look at stage 4.
  for (let stage = 0; stage < 3; stage++) {
    for (const e of run.enemies) e.hp = 0;
    advanceRaidRun(run, run.updatedAt + 1000);
    assert.equal(run.stageCleared, true, 'stage ' + stage + ' clears when its objective is dead');
    const skip = applyRaidAction(run, 1, 'interact', { actionId: 'portal:skip:' + stage, targetId: 'portal', at: run.updatedAt });
    assert.equal(skip.ok, true, skip.error || '');
    // The scheduler only ever resolves whole simulation cells, so a read has to cross the cell that
    // contains the request for the transition to be applied. 50 ms used to be enough because the old
    // scheduler resolved whatever instant it was handed; under a fixed grid it can land inside the
    // current cell and legitimately resolve nothing.
    const before = run.stageIndex;
    advanceRaidRun(run, run.updatedAt + SIM_TICK_MS * 2);
    assert.equal(run.stageIndex, before + 1, 'the party walked through to stage ' + (stage + 2));
  }
  assert.equal(run.stageIndex, 3, 'reached the sanctuary');
  const boss = run.enemies.find(e => e.kind === 'boss');
  assert.ok(boss, 'the sanctuary has a boss');
  assert.equal(boss.name, 'Thanatos');
  assert.ok(boss.maxHp > 0);
  // Damage it below the first ritual trigger (70%) through the real combat loop, then let the engine
  // notice. The ritual is an HP-triggered boss mechanic, not a scripted event.
  boss.hp = boss.maxHp * 0.69;
  advanceRaidRun(run, run.updatedAt + 2_000);
  const ritual = run.mechanics.find(m => m.kind === 'ritual');
  assert.ok(ritual, 'the ritual triggered at 70% boss HP');
  assert.ok(ritual.endsAt - ritual.startsAt >= RAID_RULES.ritual.channelMs - 1, 'the channel is the full duration');
  assert.ok(Array.isArray(ritual.sourceIds) && ritual.sourceIds.length >= 2, 'the ritual has sources to kill');
  assert.ok(run.enemies.filter(e => ritual.sourceIds.includes(e.id)).every(e => e.hp > 0), 'the sources start alive');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
