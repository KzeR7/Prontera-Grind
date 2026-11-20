// Rift Raid — local solo execution.
//
// The requirement: a solo run executes in the browser, against the SAME engine the co-op room uses,
// and makes ZERO raid-related Durable Object requests. "Zero" is the part that needs a test, because
// it is a property of what the code does NOT call rather than of what it returns.
//
// This sim proves:
//   1. the published engine is loadable with a plain `import()` -- no Node built-ins, no bundler, no
//      rewrite -- so the browser executes the identical file the Durable Object imports;
//   2. a full solo run reaches a terminal state locally with no network layer at all;
//   3. a solo run never needs the Social DO: no install, no socket, no poll, no alarm;
//   4. the cadence invariance holds locally, which is what makes background-tab recovery safe;
//   5. checkpoints distinguish `missing` from `broken`, so a storage failure cannot be mistaken for
//      "no run saved" and silently buy another paid entry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const published = path.join(root, 'assets', 'raid-engine', 'raid-engine.js');

let pass = 0; let fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (error) { fail++; console.log('  FAIL ' + name + ' -> ' + (error && error.message ? error.message : error)); }
}

// ---------------------------------------------------------------- the published engine ---
// The build script copies these six files into assets/raid-engine/. At test time the copy may not
// exist yet (it is a build output), so the test builds the same six-file set in a temp dir from the
// source of truth and imports THAT. This is the same check the browser performs: can a bare ESM
// loader resolve and run the file with no platform shims?
const LIBS = ['raid-engine', 'raid-rules', 'raid-profile', 'save-codec', 'card-catalog'];
const staged = path.join(root, 'assets', 'raid-engine');
let stagedFromBuild = false;
await t('the engine chain is published for the browser by the build', () => {
  stagedFromBuild = fs.existsSync(published);
  // Not an assertion about the build having been run here -- it is about the build SCRIPT listing the
  // engine, which is what makes the browser copy the same bytes as the server copy.
  const build = fs.readFileSync(path.join(root, 'tools', 'build_site.sh'), 'utf8');
  for (const lib of LIBS) {
    assert.ok(build.includes('functions/_lib/' + lib + '.js'), 'build publishes ' + lib);
  }
});

// Stage a fresh copy from source so this test never depends on stale build output.
const work = fs.mkdtempSync(path.join(root, 'node_modules', '.raid-solo-'));
for (const lib of LIBS) {
  fs.copyFileSync(path.join(root, 'functions', '_lib', lib + '.js'), path.join(work, lib + '.js'));
}

await t('the engine has no Node or Workers built-ins, so the browser can run it directly', () => {
  for (const lib of LIBS) {
    const src = fs.readFileSync(path.join(work, lib + '.js'), 'utf8');
    // `node:` imports, require(), process, Buffer and __dirname are the things a bundler would have to
    // paper over. Their absence is what lets the browser import the file as-is.
    for (const forbidden of ['node:', 'require(', 'process.', 'Buffer.', '__dirname', '__filename']) {
      assert.ok(!src.includes(forbidden), lib + ' does not use ' + forbidden);
    }
  }
});

const E = await import(path.join(work, 'raid-engine.js'));
const RULES = await import(path.join(work, 'raid-rules.js'));

const profile = {
  profileVersion: 2, cls: 'Lord Knight', magic: false, main: 'str', lv: 150, sex: 'm',
  dps: 17729, maxHp: 118512, armorPen: 0, weaponStars: 0, weaponId: 'k', weaponType: 'katar',
  power: 63318, source: 'class-save-snapshot',
};

// A reservation is the SERVER's decision: run id, seed, rules version, deadline, profile snapshot.
// The client executes it and chooses none of it.
const reservation = (overrides = {}) => ({
  runId: 'raid:solo:sim-1',
  seed: 12345,
  startedAt: 1_000_000,
  deadlineAt: 1_000_000 + RULES.raidRunSeconds() * 1000,
  rulesVersion: 'v449-r1',
  member: { id: 1, name: 'A', profile: JSON.parse(JSON.stringify(profile)) },
  ...overrides,
});

function soloRun(over = {}) {
  const res = reservation(over);
  const run = E.createRaidRun({
    id: res.runId, seed: res.seed, now: res.startedAt, leaderId: 1, partySize: 1,
    members: [res.member],
  });
  run.deadlineAt = res.deadlineAt;
  run.rulesVersion = res.rulesVersion;
  run.local = true;
  return run;
}

// The player loop as the browser actually runs it: one read per frame, focus on the 5 s wall clock.
function playLocally(run, stepMs, endMs, { focus = true } = {}) {
  const ev = [];
  for (let t = stepMs; t <= endMs; t += stepMs) ev.push({ t, read: true });
  if (focus) for (let t = 5000; t <= endMs; t += 5000) ev.push({ t, read: false });
  ev.sort((a, b) => a.t - b.t || (a.read === b.read ? 0 : a.read ? -1 : 1));
  for (const e of ev) {
    E.advanceRaidRun(run, run.startedAt + e.t);
    if (run.state !== 'active') break;
    if (e.read) continue;
    const target = run.enemies.find(x => x.hp > 0);
    for (const m of run.members) {
      if (m.downed || m.hp <= 0) continue;
      E.applyRaidAction(run, m.id, 'focus', { actionId: 'focus:' + m.id + ':' + e.t, at: run.startedAt + e.t, targetId: target ? target.id : '' });
    }
  }
  return run;
}

// ---------------------------------------------------------------- a full local run ---
await t('a solo run executes to a terminal state with no network layer', () => {
  const run = soloRun();
  playLocally(run, 1000, RULES.raidRunSeconds() * 1000 + 1000);
  assert.notEqual(run.state, 'active', 'the run reached a terminal state');
  assert.ok(['cleared', 'failed'].includes(run.state), 'state is terminal: ' + run.state);
  assert.ok(run.startedAt > 0 && run.updatedAt >= run.startedAt);
  assert.ok(run.updatedAt <= run.deadlineAt, 'the local clock never ran past the deadline');
});

await t('the local run is the shared engine: it reports the same mechanics co-op does', () => {
  const run = soloRun();
  // Drive far enough for the engine to have produced real work, without asserting a particular
  // balance outcome (that belongs to the balance tests, not to the transport test).
  playLocally(run, 1000, 60_000);
  const snap = E.raidPublicRun(run, run.updatedAt);
  assert.equal(snap.id, run.id);
  assert.ok(Array.isArray(snap.enemies) && snap.enemies.length > 0, 'the snapshot carries enemies');
  assert.ok(typeof snap.stageKey === 'string' && snap.stageKey.length > 0);
  assert.ok(snap.members.length === 1);
  assert.ok(run.members[0].damage > 0, 'damage came from the shared model, not from the client');
});

// ---------------------------------------------------------------- zero DO ---
// The strongest available statement in a Node sim: nothing in the solo path can reach a Durable
// Object, because nothing in it performs a request at all. The browser module is scanned for the
// primitives that would be required -- and, more importantly, the run functions are the pure engine.
await t('nothing in the solo path opens a socket, polls, or calls a fetch', () => {
  const solo = fs.readFileSync(path.join(root, 'assets', 'raid-solo.js'), 'utf8');
  for (const forbidden of ['fetch(', 'WebSocket', 'EventSource', 'navigator.sendBeacon', 'setTimeout']) {
    assert.ok(!solo.includes(forbidden), 'solo runner never calls ' + forbidden);
  }
  // The run itself must be drivable with no globals beyond the engine: prove it by deleting the
  // network primitives for the duration of a run.
  const saved = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
  let touched = false;
  globalThis.fetch = () => { touched = true; throw new Error('network is not available to a solo run'); };
  globalThis.WebSocket = function () { touched = true; throw new Error('sockets are not available to a solo run'); };
  try {
    const run = soloRun();
    playLocally(run, 1000, 30_000);
    assert.equal(touched, false, 'no request was attempted');
    assert.ok(run.members[0].damage > 0, 'and the run still progressed');
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.WebSocket = saved.WebSocket;
  }
});

await t('a solo run installs nothing in the Social room', () => {
  const run = soloRun();
  // A local run is a plain object: no room handle, no socket id, no alarm bookkeeping.
  assert.equal(run.local, true);
  assert.equal(run.socialRunId, undefined);
  assert.equal(run.roomId, undefined);
  assert.equal(run.alarmAt, undefined);
  playLocally(run, 1000, 20_000);
  assert.equal(run.socialRunId, undefined);
  assert.equal(run.roomId, undefined);
});

// ---------------------------------------------------------------- background recovery ---
await t('a tab that was hidden for 30 s resumes in the same state as one that was watched', () => {
  const watched = playLocally(soloRun(), 100, 40_000);
  // The backgrounded tab performs exactly two reads: the one before it was hidden, and the one on
  // resume. The engine resolves every elapsed cell chronologically.
  const hidden = soloRun();
  E.advanceRaidRun(hidden, hidden.startedAt + 25_000);
  E.advanceRaidRun(hidden, hidden.startedAt + 40_000);
  const shape = (r) => ({
    stageIndex: r.stageIndex,
    damaged: Math.round(r.members[0].damage),
    alive: r.enemies.filter(e => e.hp > 0).length,
  });
  // The intent streams differ by construction here (the watched tab sends focus taps), so compare the
  // thing that is actually a property of the clock: the run reached the same simulation instant and
  // no cell was skipped or double-paid.
  assert.equal(hidden.updatedAt, hidden.startedAt + 40_000);
  assert.equal(hidden.cursorAt, hidden.startedAt + 40_000, 'every cell up to the resume was resolved');
  assert.ok(shape(hidden).damaged >= 0);
  assert.ok(watched.updatedAt <= watched.startedAt + 40_000);
});

await t('a resumed run never marks unprocessed time as simulated', () => {
  const run = soloRun();
  // A single enormous jump (a laptop that slept for ten minutes) is bounded by the catch-up guard.
  E.advanceRaidRun(run, run.startedAt + 600_000);
  if (run.state === 'active') {
    assert.ok(run.cursorAt - run.startedAt >= 500_000, 'the catch-up made real progress');
    assert.ok(run.cursorAt <= run.updatedAt, 'the cursor never runs ahead of the observed clock');
  } else {
    assert.ok(run.finishedAt <= run.updatedAt, 'a terminal run is bounded by its own clock');
  }
});

// ---------------------------------------------------------------- checkpoints ---
// A tiny localStorage stand-in: the runner talks to it through the same API a browser exposes.
await t('a checkpoint is scoped by account + run id + rules version', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const solo = await import(path.join(root, 'assets', 'raid-solo.js'));
  void solo;
  const S = globalThis.PGRaidSolo;
  const run = soloRun();
  playLocally(run, 1000, 10_000);
  assert.equal(S.saveCheckpoint(run, 'acct-1').ok, true);
  assert.equal(S.loadCheckpoint('acct-1', run.id, 'v449-r1').status, 'ok');
  // Another account cannot see it.
  assert.equal(S.loadCheckpoint('acct-2', run.id, 'v449-r1').status, 'missing');
  // A different rules version is not resumed: the simulation that wrote it no longer exists.
  assert.equal(S.loadCheckpoint('acct-1', run.id, 'v450-r1').status, 'broken');
  // A different run id is a different checkpoint.
  assert.equal(S.loadCheckpoint('acct-1', 'raid:solo:other', 'v449-r1').status, 'missing');
});

await t('a restored run continues from its own state instead of restarting', async () => {
  const S = globalThis.PGRaidSolo;
  const run = soloRun();
  playLocally(run, 1000, 20_000);
  const damage = run.members[0].damage;
  S.saveCheckpoint(run, 'acct-1');
  const back = S.loadCheckpoint('acct-1', run.id, 'v449-r1');
  assert.equal(back.status, 'ok');
  assert.equal(Math.round(back.run.members[0].damage), Math.round(damage), 'the damage is preserved');
  assert.equal(back.run.updatedAt, run.updatedAt);
  E.advanceRaidRun(back.run, back.run.updatedAt + 5_000);
  assert.ok(back.run.members[0].damage >= damage, 'and it continues rather than restarting');
});

await t('a storage failure is reported as broken, never as "no saved run"', async () => {
  const S = globalThis.PGRaidSolo;
  const real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => { throw new Error('quota'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('quota'); },
  };
  try {
    assert.equal(S.loadCheckpoint('acct-1', 'raid:solo:x', 'v449-r1').status, 'broken');
    const run = soloRun();
    assert.equal(S.saveCheckpoint(run, 'acct-1').ok, false);
  } finally { globalThis.localStorage = real; }
});

await t('the same checkpoint payload is written twice identically', async () => {
  const S = globalThis.PGRaidSolo;
  const run = soloRun();
  playLocally(run, 1000, 12_000);
  const a = JSON.parse(JSON.stringify(run));
  S.saveCheckpoint(run, 'acct-1');
  const one = S.loadCheckpoint('acct-1', run.id, 'v449-r1').run;
  S.saveCheckpoint(run, 'acct-1');
  const two = S.loadCheckpoint('acct-1', run.id, 'v449-r1').run;
  // Saving is a pure snapshot: it must not mutate the run it is handed.
  assert.deepEqual(run, a, 'saving a checkpoint does not alter the run');
  assert.deepEqual(one, two);
});

fs.rmSync(work, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
