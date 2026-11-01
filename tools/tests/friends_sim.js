// Friends: the real handlers against a real database, plus the room's friend-aware snapshots.
//   node tools/tests/friends_sim.js
//
// api_sim.js proves the shared plumbing; THIS suite proves the friends rules themselves: who may
// ask whom, what an unanswered request can become, that a pair cannot exist twice in either
// direction, that only the addressee can accept, and that none of it touches the save blob. The
// last section drives the social room directly, because the plaza draws a friend's name from its
// own snapshots and that flag must be per-viewer.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---------------------------------------------------------------- harness ----
function makeD1(sqlite) {
  const wrap = (stmt, args = []) => ({
    bind: (...more) => wrap(stmt, args.concat(more)),
    first: async () => stmt.get(...args) ?? null,
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ success: true, meta: stmt.run(...args) }),
    _run: () => ({ meta: stmt.run(...args) }),
  });
  return {
    prepare: sql => wrap(sqlite.prepare(sql)),
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const out = statements.map(q => q._run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}

function freshEnv({ skipFriends } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const dir = path.join(root, 'migrations');
  for (const name of fs.readdirSync(dir).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
    if (skipFriends && name.startsWith('0012')) continue;
    sqlite.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
  }
  return { env: { DB: makeD1(sqlite) }, sqlite };
}

// The handlers only read method, url, headers.get and text()/json().
function req(method, url, { body, cookie, headers = {} } = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (cookie) h.set('cookie', cookie);
  const text = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  if (text) h.set('content-length', String(new TextEncoder().encode(text).length));
  return {
    method, url: url.startsWith('http') ? url : 'https://pg.test' + url,
    headers: { get: k => h.get(String(k).toLowerCase()) ?? null },
    text: async () => text,
  };
}

const load = async file => import(pathToFileURL(path.join(root, 'functions', file)).href);
const register = await load('api/register.js');
const friends = await load('api/friends.js');

const cookieFor = async (env, name) => {
  const r = await register.onRequestPost({ request: req('POST', '/api/register', { body: { u: name, p: 'friends-test-password', email: name.toLowerCase() + '@example.test' } }), env });
  assert.equal(r.status, 201, name + ' registers');
  const sc = r.headers.get('set-cookie') || '';
  return sc.split(';')[0];
};

const api = {
  list: async (env, cookie, who) => {
    const r = await friends.onRequestGet({ request: req('GET', '/api/friends' + (who ? '?who=' + encodeURIComponent(who) : ''), { cookie }), env });
    return { status: r.status, data: await r.json() };
  },
  act: async (env, cookie, action, name) => {
    const r = await friends.onRequestPost({ request: req('POST', '/api/friends', { cookie, body: { action, name } }), env });
    return { status: r.status, data: await r.json() };
  },
};

let pass = 0, fail = 0;
const T = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message)); fail++; }
};

console.log('friends: requests, acceptance, limits, privacy and the plaza flag\n');

await T('migration 0012 is additive: it creates its own table and touches nothing else', async () => {
  const sql = read('migrations/0012_friends.sql');
  assert.ok(/CREATE TABLE IF NOT EXISTS friends/.test(sql), 'creates friends idempotently');
  assert.ok(!/ALTER TABLE (?!.*friends)/.test(sql), 'no other table is altered');
  assert.ok(!/DROP /.test(sql), 'nothing is dropped');
  // A pair can only exist once, whichever order it was written in.
  const { sqlite } = freshEnv();
  sqlite.exec("INSERT INTO users(username, pass_hash, created_at) VALUES ('a','x',1), ('b','x',1)");
  sqlite.exec("INSERT INTO friends(requester_id, addressee_id, state, created_at) VALUES(1,2,'pending',1)");
  assert.throws(() => sqlite.exec("INSERT INTO friends(requester_id, addressee_id, state, created_at) VALUES(2,1,'pending',1)"),
    /UNIQUE constraint failed/, 'the reversed pair is the same pair');
  assert.throws(() => sqlite.exec("INSERT INTO friends(requester_id, addressee_id, state, created_at) VALUES(1,1,'pending',1)"),
    /CHECK constraint failed/, 'you cannot be your own friend');
  assert.throws(() => sqlite.exec("INSERT INTO friends(requester_id, addressee_id, state, created_at) VALUES(1,2,'maybe',1)"),
    /CHECK constraint failed/, 'only pending and accepted exist');
  sqlite.close();
});

await T('without migration 0012 the API says so instead of failing, and chat still connects', async () => {
  const { env } = freshEnv({ skipFriends: true });
  const c = await cookieFor(env, 'NoSchema');
  const list = await api.list(env, c);
  assert.equal(list.status, 503); assert.equal(list.data.installed, false);
  assert.match(list.data.err, /not set up/);
  const act = await api.act(env, c, 'request', 'Anyone');
  assert.equal(act.status, 503); assert.equal(act.data.installed, false);
  // The plaza ingress must never fail because this migration is missing.
  const social = read('functions/api/social.js');
  assert.ok(/friendsInstalled/.test(social) && /catch\(e\)\{friends=\[\]\}/.test(social), 'a missing table means an empty friend list, not a refused socket');
});

await T('signed out, everything is refused before any SQL runs', async () => {
  const { env } = freshEnv();
  assert.equal((await api.list(env, null)).status, 401);
  assert.equal((await api.act(env, null, 'request', 'Anybody')).status, 401);
});

await T('a request goes one way, appears on both sides, and changes nothing until accepted', async () => {
  const { env } = freshEnv();
  const a = await cookieFor(env, 'Alice'), b = await cookieFor(env, 'Bob');
  const r = await api.act(env, a, 'request', 'bob');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.code, 'requested'); assert.equal(r.data.changed, true);
  assert.deepEqual(r.data.outgoing.map(o => o.name), ['Bob'], 'the display case comes from the database');
  assert.deepEqual(r.data.friends, [], 'asking is not being friends');
  const bList = (await api.list(env, b)).data;
  assert.deepEqual(bList.incoming.map(o => o.name), ['Alice'], 'the addressee sees the real display name');
  assert.deepEqual(bList.friends, []);
  assert.deepEqual(bList.outgoing, []);
  // Asking again is a no-op, not a duplicate row and not an error.
  const again = await api.act(env, a, 'request', 'Bob');
  assert.equal(again.status, 200); assert.equal(again.data.code, 'already-asked'); assert.equal(again.data.changed, false);
  assert.equal((await api.list(env, b)).data.incoming.length, 1);
});

await T('asking someone who already asked you accepts them, instead of creating a mirrored request', async () => {
  const { env, sqlite } = freshEnv();
  const a = await cookieFor(env, 'Carol'), b = await cookieFor(env, 'Dave');
  await api.act(env, a, 'request', 'Dave');
  const back = await api.act(env, b, 'request', 'Carol');
  assert.equal(back.data.code, 'accepted'); assert.equal(back.data.changed, true);
  assert.deepEqual(back.data.friends.map(f => f.name), ['Carol']);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM friends').get().n, 1, 'one row, not two half-requests');
  assert.equal(sqlite.prepare('SELECT state FROM friends').get().state, 'accepted');
  assert.equal((await api.list(env, a)).data.friends.length, 1, 'and both sides are friends');
});

await T('only the addressee can accept, and accepting twice is harmless', async () => {
  const { env } = freshEnv();
  const a = await cookieFor(env, 'Erin'), b = await cookieFor(env, 'Finn'), c = await cookieFor(env, 'Gina');
  await api.act(env, a, 'request', 'Finn');
  const stolen = await api.act(env, a, 'accept', 'Finn');
  assert.equal(stolen.status, 403, 'the sender cannot accept their own request');
  const bystander = await api.act(env, c, 'accept', 'Finn');
  assert.equal(bystander.status, 404, 'a stranger has nothing to accept');
  const ok = await api.act(env, b, 'accept', 'Erin');
  assert.equal(ok.data.code, 'accepted'); assert.equal(ok.data.changed, true);
  const twice = await api.act(env, b, 'accept', 'Erin');
  assert.equal(twice.status, 200); assert.equal(twice.data.code, 'already-friends'); assert.equal(twice.data.changed, false);
});

await T('declining and cancelling both remove the row, so either side can ask again later', async () => {
  const { env } = freshEnv();
  const a = await cookieFor(env, 'Hana'), b = await cookieFor(env, 'Ivan');
  await api.act(env, a, 'request', 'Ivan');
  const declined = await api.act(env, b, 'remove', 'Hana');
  assert.equal(declined.data.code, 'declined'); assert.equal(declined.data.changed, true);
  assert.deepEqual((await api.list(env, b)).data.incoming, []);
  await api.act(env, a, 'request', 'Ivan');
  const cancelled = await api.act(env, a, 'remove', 'Ivan');
  assert.equal(cancelled.data.code, 'cancelled'); assert.equal(cancelled.data.changed, true);
  assert.deepEqual((await api.list(env, a)).data.outgoing, []);
  // A friendship is mutual: either side unfriends, and both lists agree.
  await api.act(env, a, 'request', 'Ivan');
  await api.act(env, b, 'accept', 'Hana');
  const gone = await api.act(env, a, 'remove', 'Ivan');
  assert.equal(gone.data.code, 'unfriended');
  assert.deepEqual((await api.list(env, b)).data.friends, []);
});

await T('a typo, yourself and a suspended account are told apart in plain sentences', async () => {
  const { env, sqlite } = freshEnv();
  const a = await cookieFor(env, 'Jules');
  const ghost = await api.act(env, a, 'request', 'NobodyHere');
  assert.equal(ghost.status, 404); assert.equal(ghost.data.code, 'no-such-player');
  assert.match(ghost.data.err, /Check the spelling/);
  const self = await api.act(env, a, 'request', 'jules');
  assert.equal(self.status, 400); assert.equal(self.data.code, 'self');
  await cookieFor(env, 'Kicked');
  sqlite.prepare("UPDATE users SET banned = 1 WHERE username = 'Kicked'").run();
  const banned = await api.act(env, a, 'request', 'Kicked');
  assert.equal(banned.status, 403); assert.equal(banned.data.code, 'banned');
  assert.ok(!/banned|suspended/i.test(String(banned.data.err).replace('suspended', '')), 'the sentence does not leak account state beyond "suspended"');
});

await T('the list is capped at 100 friends, and outgoing requests at 50', async () => {
  const { env, sqlite } = freshEnv();
  const me = await cookieFor(env, 'LimitOwner');
  const id = sqlite.prepare("SELECT id FROM users WHERE username = 'LimitOwner'").get().id;
  // 100 accepted friends, inserted directly: the cap is what matters here, not the ceremony.
  for (let i = 0; i < 100; i++) {
    sqlite.prepare("INSERT INTO users(username, pass_hash, created_at) VALUES(?, 'x', 1)").run('F' + i);
    const other = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('F' + i).id;
    sqlite.prepare("INSERT INTO friends(requester_id, addressee_id, state, created_at, accepted_at) VALUES(?, ?, 'accepted', 1, 1)").run(id, other);
  }
  await cookieFor(env, 'OneMore');
  const full = await api.act(env, me, 'request', 'OneMore');
  assert.equal(full.status, 409); assert.equal(full.data.code, 'friend-limit');
  assert.match(full.data.err, /100/);
  // Pending requests are a separate, smaller allowance.
  const { env: env2, sqlite: db2 } = freshEnv();
  const p = await cookieFor(env2, 'PendingOwner');
  const pid = db2.prepare("SELECT id FROM users WHERE username = 'PendingOwner'").get().id;
  for (let i = 0; i < 50; i++) {
    db2.prepare("INSERT INTO users(username, pass_hash, created_at) VALUES(?, 'x', 1)").run('P' + i);
    const other = db2.prepare('SELECT id FROM users WHERE username = ?').get('P' + i).id;
    db2.prepare("INSERT INTO friends(requester_id, addressee_id, state, created_at) VALUES(?, ?, 'pending', 1)").run(pid, other);
  }
  await cookieFor(env2, 'LateComer');
  const many = await api.act(env2, p, 'request', 'LateComer');
  assert.equal(many.status, 429); assert.equal(many.data.code, 'pending-limit');
});

await T('the "who is this?" lookup answers for a friend, a stranger and yourself', async () => {
  const { env } = freshEnv();
  const a = await cookieFor(env, 'Mina'), b = await cookieFor(env, 'Nora');
  await api.act(env, a, 'request', 'Nora');
  await api.act(env, b, 'accept', 'Mina');
  const friend = (await api.list(env, a, 'nora')).data.player;
  assert.equal(friend.friends, true); assert.equal(friend.outgoing, false); assert.equal(friend.incoming, false);
  assert.ok(friend.since > 0, 'the day the friendship started is known');
  const stranger = (await api.list(env, a, 'SomebodyElse')).data.player;
  assert.equal(stranger, null);
  const me = (await api.list(env, a, 'mina')).data.player;
  assert.equal(me.self, true); assert.equal(me.friends, false);
  // The waiting side of a request is distinguishable, which is what the chat menu needs.
  const c = await cookieFor(env, 'Otto');
  await api.act(env, c, 'request', 'Mina');
  const incoming = (await api.list(env, a, 'otto')).data.player;
  assert.equal(incoming.incoming, true);
  const outgoing = (await api.list(env, c, 'Mina')).data.player;
  assert.equal(outgoing.outgoing, true);
});

await T('names are matched case-insensitively, and nothing is interpolated into SQL', async () => {
  const { env } = freshEnv();
  const a = await cookieFor(env, 'Pia'), b = await cookieFor(env, 'Quinn');
  const r = await api.act(env, a, 'request', 'QUINN');
  assert.equal(r.data.code, 'requested');
  assert.equal(r.data.outgoing[0].name, 'Quinn', 'the display case comes from the database');
  assert.equal((await api.list(env, b)).data.incoming[0].name, 'Pia');
  for (const evil of ["quinn' OR 1=1 --", "quinn'; DROP TABLE friends; --", "' UNION SELECT * FROM users --"]) {
    const bad = await api.act(env, a, 'request', evil);
    assert.ok([400, 404].includes(bad.status), evil + ' -> ' + bad.status);
  }
  assert.equal((await api.list(env, b)).data.incoming.length, 1, 'the table is intact and unchanged');
});

await T('every change is written to the audit log, and a no-op is not', async () => {
  const { env, sqlite } = freshEnv();
  const a = await cookieFor(env, 'Rhea'), b = await cookieFor(env, 'Sol');
  await api.act(env, a, 'request', 'Sol');
  await api.act(env, a, 'request', 'Sol');              // already-asked: no row, no event
  await api.act(env, b, 'accept', 'Rhea');
  await api.act(env, a, 'remove', 'Sol');
  const kinds = sqlite.prepare("SELECT kind FROM events WHERE kind LIKE 'friend-%' ORDER BY id").all().map(r => r.kind);
  assert.deepEqual(kinds, ['friend-request', 'friend-accepted', 'friend-removed']);
  const detail = sqlite.prepare("SELECT detail FROM events WHERE kind = 'friend-request'").get().detail;
  assert.match(detail, /Rhea -> Sol/, 'the log names both accounts');
});

await T('the save blob is untouched: friendship is not character progress', async () => {
  const { env, sqlite } = freshEnv();
  const a = await cookieFor(env, 'Tara'), b = await cookieFor(env, 'Uma');
  await api.act(env, a, 'request', 'Uma');
  await api.act(env, b, 'accept', 'Tara');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM saves').get().n, 0, 'no save was created or written');
  // And a reset that keeps accounts keeps the friendship.
  const core = await import(pathToFileURL(path.join(root, 'tools/recovery/launch_reset_core.mjs')).href);
  assert.ok(core.PRESERVED_TABLES.includes('friends'), 'the preflight reset preserves friends');
  assert.ok(!core.CLEARED_TABLES.includes('friends'));
});

// ------------------------------------------------------------- the plaza ----
await T('the room tells each client who is a friend, and only that client', async () => {
  const { SocialRoom } = await import(pathToFileURL(path.join(root, 'workers/social/room.mjs')).href);
  let now = 1000;
  const room = new SocialRoom({ now: () => now });
  const events = new Map();
  const connect = (id, name, friends) => {
    const seen = [];
    const c = room.connect({ id, username: name, friends }, s => seen.push(JSON.parse(s)), () => {});
    events.set(id, seen);
    return c;
  };
  const a = connect(1, 'Ann', [2]);          // Ann lists Ben as a friend
  const b = connect(2, 'Ben', []);           // Ben's list has not caught up yet
  const c = connect(3, 'Cid', []);
  const look = { cls: 'Novice', appearance: { version: 1, sex: 'm' } };
  room.receive(a, JSON.stringify({ type: 'join', look }));
  room.receive(b, JSON.stringify({ type: 'join', look }));
  room.receive(c, JSON.stringify({ type: 'join', look }));
  // What one client has been shown: its first room snapshot, then every player update after it.
  const view = id => {
    const seen = events.get(id);
    const first = seen.findIndex(e => e.type === 'room');
    assert.ok(first >= 0, 'the client was sent a room');
    const players = new Map(seen[first].players.map(p => [p.id, p]));
    for (const e of seen.slice(first + 1)) if (e.type === 'player' && e.player) players.set(e.player.id, e.player);
    return [...players.values()];
  };
  const benSees = view(2).find(p => p.name === 'Ann');
  assert.equal(benSees.friend, true, 'Ben sees Ann marked, because friendship is mutual');
  const cidSees = view(3).find(p => p.name === 'Ann');
  assert.equal(cidSees.friend, false, 'Cid does not see a mark that is not his');
  assert.deepEqual(view(1).map(p => [p.name, p.friend]), [['Ann', false], ['Ben', true], ['Cid', false]], 'and Ann sees her own list');
  // The client can correct the room when its list changes (accept / unfriend) ...
  now += 3000;
  room.receive(a, JSON.stringify({ type: 'friends', ids: [3] }));
  const cidAfter = events.get(3).filter(e => e.type === 'player').at(-1).player;
  assert.equal(cidAfter.name, 'Ann'); assert.equal(cidAfter.friend, true, 'a newly added friend is marked immediately');
  const benAfter = events.get(2).filter(e => e.type === 'player').at(-1).player;
  assert.equal(benAfter.name, 'Ann'); assert.equal(benAfter.friend, false, 'and an unfriended one stops being marked');
  // A later join carries the client's own, fresher list.
  const d = connect(4, 'Dee', []);
  room.receive(d, JSON.stringify({ type: 'join', look, friends: [1] }));
  const deeSees = events.get(4).filter(e => e.type === 'room').at(-1).players.find(p => p.name === 'Ann');
  assert.equal(deeSees.friend, true, 'the join handshake applies the list before the snapshot');
  // Junk cannot pollute the room.
  now += 3000;
  room.receive(d, JSON.stringify({ type: 'friends', ids: ['x', null, 1.5, -3, 0, true, { id: 1 }] }));
  assert.deepEqual([...d.friends], [], 'only positive integer account ids are kept');
  // Repeats are dropped, so a crafted list cannot spend the cap on the same id.
  now += 3000;
  room.receive(d, JSON.stringify({ type: 'friends', ids: Array(400).fill(1) }));
  assert.deepEqual([...d.friends], [1], 'and the same id is only counted once');
  now += 3000;
  room.receive(d, JSON.stringify({ type: 'friends', ids: Array.from({ length: 400 }, (_, i) => i + 1) }));
  assert.equal(d.friends.size, 200, 'and the list is bounded');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
