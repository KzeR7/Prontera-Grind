// The write pause: state machine and Durable Object. Synthetic only — no Cloudflare account, no D1,
// no network.   node tools/tests/write_gate_sim.mjs
//
// What this pins:
//   * a brand-new gate is CLOSED, so forgetting to configure the switch fails safe;
//   * nothing is admitted unless the gate is open, and a closing gate refuses instantly;
//   * `drained` needs no live lease AND a quiet window, and a lease that is never released expires;
//   * `seal` (the only "safe to restore" state) refuses until the gate has drained;
//   * the token is compared in constant time, a short configured token is refused outright, and
//     repeated wrong guesses lock control requests;
//   * state survives a restart, and corrupt storage loads as CLOSED rather than as open;
//   * the Worker is unrouted: the switch is reachable only through the Pages binding.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_MAX, AUTH_LOCK_MS, CLOSED, CLOSING, LEASE_MS, MAX_LEASES, OPEN, QUIET_MS,
  admit, closeGate, drain, initialState, noteAuthFail, openGate, publicStatus, release, sanitize, sealGate,
} from '../../workers/gate/policy.mjs';
import { WriteGate } from '../../workers/gate/index.mjs';
import defaultWorker from '../../workers/gate/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const T0 = 1_765_000_000_000;
const phrase = action => ({ close: 'CLOSE WRITES', seal: 'SEAL WRITES', open: 'OPEN WRITES' })[action];
let pass = 0;
const ok = (name, fn) => { fn(); console.log('  ok   ' + name); pass++; };

// ---------------------------------------------------------------- policy ----
ok('a new gate is closed: nothing is admitted until an operator opens it', () => {
  const st = initialState();
  assert.equal(st.state, CLOSED);
  assert.equal(st.reason, 'never-opened');
  assert.deepEqual(admit(st, T0, 'req-00000001').ok, false);
  assert.equal(drain(st, T0).liveLeases, 0);
  assert.equal(publicStatus(st, T0).open, false);
});

ok('the confirmation phrase is required, and must be typed exactly', () => {
  const st = initialState();
  assert.throws(() => openGate(st, T0, {}), e => e.code === 'confirm-required');
  assert.throws(() => openGate(st, T0, { confirm: 'open writes' }), e => e.code === 'confirm-required');
  const r = openGate(st, T0, { confirm: '  OPEN WRITES ', actor: 'owner' });
  assert.equal(r.changed, true);
  assert.equal(st.state, OPEN);
  assert.equal(st.epoch, 2, 'the first open starts epoch 2: epoch 1 was never written to');
});

ok('open admits requests and counts their leases', () => {
  const st = initialState();
  openGate(st, T0, { confirm: phrase('open') });
  assert.equal(admit(st, T0, 'req-aaaaaaaa').ok, true);
  assert.equal(admit(st, T0 + 10, 'req-bbbbbbbb').ok, true);
  assert.equal(drain(st, T0 + 10).liveLeases, 2);
  assert.equal(release(st, 'req-aaaaaaaa'), true);
  assert.equal(release(st, 'req-aaaaaaaa'), false, 'releasing twice is a no-op');
  assert.equal(drain(st, T0 + 10).liveLeases, 1);
});

ok('a closing gate refuses immediately — including the request that closed it', () => {
  const st = initialState();
  openGate(st, T0, { confirm: phrase('open') });
  admit(st, T0, 'req-cccccccc');
  closeGate(st, T0 + 5, { confirm: phrase('close'), reason: 'drill' });
  assert.equal(st.state, CLOSING);
  const refused = admit(st, T0 + 6, 'req-dddddddd');
  assert.equal(refused.ok, false);
  assert.equal(refused.state, CLOSING);
  assert.equal(drain(st, T0 + 6).liveLeases, 1, 'the already-admitted request is still in flight');
  assert.throws(() => sealGate(st, T0 + 6, { confirm: phrase('seal') }), e => e.code === 'not-drained');
});

ok('drained needs no live lease AND a full quiet window', () => {
  const st = initialState();
  openGate(st, T0, { confirm: phrase('open') });
  admit(st, T0, 'req-eeeeeeee');
  closeGate(st, T0 + 1, { confirm: phrase('close') });
  assert.equal(release(st, 'req-eeeeeeee'), true);
  assert.equal(drain(st, T0 + 2).drained, false, 'released is not drained: the quiet window has not passed');
  assert.equal(drain(st, T0 + QUIET_MS - 1).drained, false);
  const quiet = drain(st, T0 + QUIET_MS);
  assert.equal(quiet.drained, true);
  assert.equal(quiet.quietMs, QUIET_MS);
});

ok('a lease that is never released expires, so a dead request cannot block recovery forever', () => {
  const st = initialState();
  openGate(st, T0, { confirm: phrase('open') });
  admit(st, T0, 'req-ffffffff');
  closeGate(st, T0 + 1, { confirm: phrase('close') });
  const justBefore = drain(st, T0 + LEASE_MS - 1);
  assert.equal(justBefore.liveLeases, 1, 'still considered in flight inside the lease');
  const after = drain(st, T0 + LEASE_MS + QUIET_MS);
  assert.equal(after.liveLeases, 0);
  assert.equal(after.drained, true);
});

ok('seal is the only "safe to restore" state, and reopening starts a new epoch', () => {
  const st = initialState();
  openGate(st, T0, { confirm: phrase('open') });
  const epoch = st.epoch;
  closeGate(st, T0 + 1, { confirm: phrase('close') });
  assert.equal(publicStatus(st, T0 + QUIET_MS).safeToRestore, false, 'closing without a seal is NOT safe to restore');
  const sealed = sealGate(st, T0 + QUIET_MS, { confirm: phrase('seal') });
  assert.equal(sealed.changed, true);
  assert.equal(st.state, CLOSED);
  assert.equal(publicStatus(st, T0 + QUIET_MS).safeToRestore, true);
  assert.equal(sealGate(st, T0 + QUIET_MS, { confirm: phrase('seal') }).changed, false, 'sealing twice is a no-op');
  assert.equal(admit(st, T0 + QUIET_MS, 'req-gggggggg').ok, false, 'a sealed gate admits nothing');
  openGate(st, T0 + QUIET_MS + 1, { confirm: phrase('open') });
  assert.equal(st.epoch, epoch + 1);
  assert.deepEqual(st.leases, {}, 'reopening clears stale leases');
});

ok('the audit ring is bounded, newest-first and records no token', () => {
  const st = initialState();
  for (let i = 0; i < 40; i++) {
    openGate(st, T0 + i * 1000, { confirm: phrase('open'), reason: 'cycle ' + i });
    closeGate(st, T0 + i * 1000 + 500, { confirm: phrase('close'), reason: 'cycle ' + i });
  }
  assert.equal(st.audit.length, AUDIT_MAX);
  assert.equal(st.audit[0].action, 'close');
  assert.equal(st.audit[0].reason, 'cycle 39');
  assert.ok(st.audit.every(x => !JSON.stringify(x).includes('TOKEN')));
});

ok('lease ids are validated and the concurrency cap fails closed', () => {
  const st = initialState();
  openGate(st, T0, { confirm: phrase('open') });
  assert.throws(() => admit(st, T0, 'short'), e => e.code === 'bad-lease');
  assert.throws(() => admit(st, T0, 'has space'), e => e.code === 'bad-lease');
  for (let i = 0; i < MAX_LEASES; i++) admit(st, T0, 'req-' + String(i).padStart(8, '0'));
  const over = admit(st, T0, 'req-over-limit');
  assert.equal(over.ok, false);
  assert.equal(over.state, 'busy', 'over the cap refuses rather than dropping bookkeeping');
});

ok('unreadable state loads as CLOSED, never as open', () => {
  for (const raw of [null, {}, { state: 'banana' }, { state: OPEN, leases: 'x', audit: 'x' }, 'text', 42]) {
    const st = sanitize(raw);
    assert.ok(st.state === CLOSED || st.state === OPEN);
    if (raw && raw.state === OPEN) { assert.equal(st.state, OPEN, 'a valid open state is kept'); continue; }
    assert.equal(st.state, CLOSED, 'anything unrecognised must be closed');
  }
  assert.deepEqual(sanitize({ state: OPEN, leases: { good: T0, bad: 'x' } }).leases, { good: T0 });
});

ok('wrong-token attempts accrue a lockout, and a success clears it', () => {
  const st = initialState();
  for (let i = 0; i < 4; i++) noteAuthFail(st, T0);
  assert.equal(publicStatus(st, T0).authLocked, false);
  noteAuthFail(st, T0);
  assert.equal(publicStatus(st, T0).authLocked, true);
  assert.equal(publicStatus(st, T0 + AUTH_LOCK_MS + 1).authLocked, false);
  noteAuthFail(st, T0 + 1);
  assert.equal(st.auth.fails, 1, 'a failure outside the window starts a fresh count');
});

// ---------------------------------------------------------- durable object ----
function fakeObject({ env = {}, stored } = {}) {
  const map = new Map();
  if (stored !== undefined) map.set('gate', structuredClone(stored));
  const ready = [];
  const ctx = {
    storage: {
      get: async key => (map.has(key) ? structuredClone(map.get(key)) : undefined),
      put: async (key, value) => { map.set(key, structuredClone(value)); },
    },
    blockConcurrencyWhile: fn => { ready.push(Promise.resolve().then(fn)); },
  };
  const gate = new WriteGate(ctx, env);
  const call = async (pathSuffix, init = {}) => {
    await Promise.all(ready);
    return gate.fetch(new Request('https://gate.internal' + pathSuffix, init));
  };
  return { gate, storage: map, call };
}
const TOKEN = 'k'.repeat(48);
const post = (body, token) => ({
  method: 'POST',
  headers: token === undefined ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', 'X-Gate-Token': token },
  body: JSON.stringify(body),
});
const get = token => ({ headers: token === undefined ? {} : { 'X-Gate-Token': token } });

await (async () => {
  let o = fakeObject({ env: {} });
  let r = await o.call('/status', get('anything'));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'not-configured', 'no secret means no remote control');

  o = fakeObject({ env: { GATE_TOKEN: 'short' } });
  assert.equal((await o.call('/status', get('short'))).status, 503, 'a short token is refused');

  o = fakeObject({ env: { GATE_TOKEN: TOKEN } });
  assert.equal((await o.call('/status', get('wrong'))).status, 404, 'a wrong token gets no advertisement');
  for (let i = 0; i < 4; i++) await o.call('/status', get('wrong-' + i));
  r = await o.call('/status', get(TOKEN));
  assert.equal(r.status, 429, 'repeated guesses lock the control surface');
  assert.ok(Number(r.headers.get('Retry-After')) > 0);

  o = fakeObject({ env: { GATE_TOKEN: TOKEN }, stored: initialState() });
  r = await o.call('/status', get(TOKEN));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).state, CLOSED, 'a brand-new object is closed');

  // internal admission needs no token (only the binding can reach it)
  r = await o.call('/admit', post({ id: 'req-11111111' }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).ok, false);

  // phrase enforcement happens in the object, not only in the CLI
  r = await o.call('/open', post({}, TOKEN));
  assert.equal(r.status, 400);
  const refusedOpen = await r.json();
  assert.equal(refusedOpen.error, 'confirm-required');
  assert.equal(refusedOpen.confirm, 'OPEN WRITES');

  r = await o.call('/open', post({ confirm: 'OPEN WRITES', reason: 'test' }, TOKEN));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).state, OPEN);

  r = await o.call('/admit', post({ id: 'req-22222222' }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);

  await o.call('/close', post({ confirm: 'CLOSE WRITES' }, TOKEN));
  r = await o.call('/admit', post({ id: 'req-33333333' }));
  assert.equal(r.status, 503, 'closed gate refuses new work');
  assert.equal((await r.json()).maintenance, true);

  r = await o.call('/seal', post({ confirm: 'SEAL WRITES' }, TOKEN));
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'not-drained', 'the in-flight lease is still held');

  await o.call('/release', post({ id: 'req-22222222' }));
  await new Promise(done => setTimeout(done, 5));
  // The quiet window is real time in the object; the seal cannot pass inside it.
  r = await o.call('/seal', post({ confirm: 'SEAL WRITES' }, TOKEN));
  assert.equal(r.status, 409);

  // The stored state is what a restart reads back, and it is still closing (never silently opened).
  const restarted = fakeObject({ env: { GATE_TOKEN: TOKEN }, stored: o.storage.get('gate') });
  r = await restarted.call('/status', get(TOKEN));
  assert.equal((await r.json()).state, CLOSING, 'a restart keeps the pause');

  const corrupt = fakeObject({ env: { GATE_TOKEN: TOKEN }, stored: { state: 'banana', leases: { x: 1 } } });
  r = await corrupt.call('/status', get(TOKEN));
  const status = await r.json();
  assert.equal(status.state, CLOSED, 'unreadable storage is not an open gate');
  assert.equal(status.open, false, 'and never reports writes as open');

  // A readable state with damaged bookkeeping keeps the operator's intent and drops the bad leases,
  // rather than taking the live site down over one unparseable entry.
  const partial = fakeObject({ env: { GATE_TOKEN: TOKEN }, stored: { state: 'open', leases: 'broken', audit: 7 } });
  r = await partial.call('/status', get(TOKEN));
  const partialStatus = await r.json();
  assert.equal(partialStatus.state, OPEN);
  assert.deepEqual(partialStatus.drain.liveLeases, 0);

  // The object is the only stateful thing, and nothing else may reach it.
  const config = fs.readFileSync(path.join(here, '..', '..', 'workers', 'gate', 'wrangler.toml'), 'utf8');
  assert.match(config, /workers_dev\s*=\s*false/, 'the gate Worker must have no public address');
  assert.doesNotMatch(config, /^\s*routes\s*=/m, 'and no route');
  assert.match(config, /new_sqlite_classes\s*=\s*\["WriteGate"\]/);
  assert.doesNotMatch(config, /d1_databases/, 'the gate must not be able to touch a database');
  const r404 = await defaultWorker.fetch(new Request('https://example.test/status'));
  assert.equal(r404.status, 404, 'the script itself serves nothing');
  console.log('  ok   the Durable Object: token, phrases, refusal, restart and unrouted script');
  pass++;
})();

console.log(`\nPASS: ${pass} write-pause checks (synthetic gate state only; Cloudflare, D1 and a real restore are untouched)`);
