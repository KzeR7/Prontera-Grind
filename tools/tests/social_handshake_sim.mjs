// v366: a connection the room cannot greet must not be left open.
//
// The failure this pins: `SocialRoom.connect()` sent its `hello` from a promise continuation
// (`replayPokerLedgers`), and `send()` swallowed the throw. A socket whose `send` failed therefore
// stayed OPEN forever - the client saw a successful upgrade, waited out its 12 s handshake timeout,
// dropped, and repeated. From the plaza that is indistinguishable from "chat is broken", which is
// exactly what it was reported as. connect() now returns null so the Worker can act on it.
//
// v367 corrects what "act on it" means. v366 answered HTTP 503 to the upgrade, and that was a
// regression in diagnosability: a refused upgrade hands the browser no socket at all, so the client
// reports only 1006 with no code and no reason - the exact silence this whole work is about.
// The Worker now completes the upgrade and closes with 4002 plus the captured error text, and the
// failure is recorded on the room so /api/chatcheck can report it too.
import assert from 'node:assert/strict';
import { SocialRoom } from '../../workers/social/room.mjs';

const identity = (id = 7) => ({ id, username: 'Tester' + id, friends: [], gm: false });

// A room with no timers: these checks are about the handshake, not the sweep.
const makeRoom = () => new SocialRoom({ now: () => 1_000_000, autoTimers: false });

const cases = [];
const check = (name, fn) => {
  try { fn(); cases.push(`  ok   ${name}`); }
  catch (e) { cases.push(`  FAIL ${name} -> ${e.message}`); process.exitCode = 1; }
};

check('a healthy socket is registered and receives the greeting', () => {
  const room = makeRoom();
  const seen = [];
  const c = room.connect(identity(1), (s) => seen.push(JSON.parse(s)), () => {});
  assert.ok(c, 'connect() returns the connection');
  assert.equal(room.clients.get(1), c, 'it is registered');
  assert.equal(seen[0].type, 'hello', 'hello is the first frame');
  assert.equal(seen[0].id, 1);
});

check('a socket that cannot be written to is REFUSED, not left open', () => {
  const room = makeRoom();
  let closed = null;
  const c = room.connect(identity(2), () => { throw new Error('socket closed'); }, (code) => { closed = code; });
  assert.equal(c, null, 'connect() reports the failure so the Worker can close with 4002');
  assert.equal(room.clients.has(2), false, 'and the dead connection is not left in the room');
  assert.equal(closed, null, 'the room leaves closing to the caller that owns the socket');
});

check('a failed greeting records WHY, so the cause is reportable', () => {
  const room = makeRoom();
  room.connect(identity(5), () => { throw new Error('write after close'); }, () => {});
  assert.equal(room.lastSendError, 'write after close', 'the room keeps the error text');
  // The Worker and /api/chatcheck both read this; without it the client can only ever say "closed".
  assert.equal(typeof room.lastSendError, 'string');
  const ok = room.connect(identity(6), () => {}, () => {});
  assert.ok(ok, 'a later healthy connection still succeeds alongside the recorded error');
});

check('a refused greeting does not poison the next attempt', () => {
  const room = makeRoom();
  room.connect(identity(3), () => { throw new Error('dead'); }, () => {});
  const seen = [];
  const c = room.connect(identity(3), (s) => seen.push(JSON.parse(s)), () => {});
  assert.ok(c, 'the same account can connect again immediately');
  assert.equal(room.clients.get(3), c);
  assert.equal(seen[0].type, 'hello');
});

check('send() reports delivery, which is what connect() depends on', () => {
  const room = makeRoom();
  let ok = false;
  const c = room.connect(identity(4), () => { ok = true; }, () => {});
  assert.ok(c && ok, 'the greeting was actually written');
  assert.equal(room.send(c, { type: 'pong' }), true, 'a live socket reports true');
});

check('a replacement socket still evicts the previous one with 4001', () => {
  const room = makeRoom();
  const closed = [];
  room.connect(identity(5), () => {}, (code) => closed.push(code));
  const second = room.connect(identity(5), () => {}, () => {});
  assert.ok(second, 'the replacement connects');
  assert.deepEqual(closed, [4001], 'the older tab is told to stop, which is what `blocked` keys on');
  assert.equal(room.clients.size, 1, 'only one connection per account');
});

console.log('v366: the plaza handshake must fail loudly\n');
console.log(cases.join('\n'));
console.log(`\n${cases.filter((c) => c.includes('  ok')).length} passed, ${cases.filter((c) => c.includes('FAIL')).length} failed\n`);
