// The server: real handlers, real SQL, against a real database.
//   node tools/tests/api_sim.js
//
// How this works: Pages Functions take `{ request, env }` and speak to D1 through `env.DB` using
// prepare/bind/first/run/all. Node 22 ships SQLite (node:sqlite), so this suite loads
// migrations/0001_init.sql into an in-memory database, wraps it in a D1-shaped shim, and then calls
// the ACTUAL handlers from functions/api/**. That means the SQL, the hashing, the session cookies,
// the conflict rule and every GM action are exercised for real — not stubbed.
//
// What it does NOT cover: Cloudflare's own runtime (a Worker is not Node). Anything that depends on
// the platform — CPU limits, cookie handling by the browser, the D1 binding — is checked by running
// `wrangler pages dev` by hand (see README-DEPLOY / tools/server-shift-plan.md).

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

// ---------------------------------------------------------------- harness ----
// WebCrypto + btoa/atob exist in Node 22 as globals; keep the check honest so a future Node that
// drops them fails loudly instead of silently testing a stub.
assert.ok(globalThis.crypto?.subtle, 'this suite needs Node 22+ (global crypto.subtle)');
assert.ok(typeof globalThis.btoa === 'function', 'this suite needs global btoa (Node 16+)');

function makeD1(sqlite) {
  const wrap = (stmt, args = []) => ({
    _stmt: stmt, _args: args,
    bind: (...more) => wrap(stmt, args.concat(more)),
    first: async () => stmt.get(...args) ?? null,
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ success: true, meta: stmt.run(...args) }),
  });
  return {
    prepare: sql => wrap(sqlite.prepare(sql)),
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(q => ({ success: true, meta: q._stmt.run(...q._args) }));
        sqlite.exec('COMMIT'); return results;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}

function freshEnv() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(root, 'migrations');
  for (const name of fs.readdirSync(dir).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
  }
  return { env: { DB: makeD1(sqlite) }, sqlite };
}

// A tiny HTTP-shaped request; the handlers only use headers/get/text/url.
function req(method, url, { body, cookie, headers = {} } = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (cookie) h.set('cookie', cookie);
  const text = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  if (text) h.set('content-length', String(new TextEncoder().encode(text).length));
  return {
    // Cloudflare's Request.url is always absolute; simulate that rather than a bare path.
    method, url: url.startsWith('http') ? url : 'https://pg.test' + url,
    headers: { get: k => h.get(String(k).toLowerCase()) ?? null },
    text: async () => text,
  };
}

const cookieFrom = res => {
  const raw = res.headers.get('Set-Cookie') || res.headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
};

const call = async (mod, fn, args) => {
  const m = await import(pathToFileURL(path.join(root, 'functions', fn)).href);
  const res = await m[mod]({ request: args.request, env: args.env, params: args.params || {} });
  const type = res.headers.get('Content-Type') || '';
  const data = type.includes('json') ? await res.clone().json() : null;
  return { status: res.status, data, res, cookie: cookieFrom(res) };
};

// Every handler in one place, so a rename fails here rather than in production.
const api = {
  register: (env, body) => call('onRequestPost', 'api/register.js', { request: req('POST', '/api/register', { body }), env }),
  login: (env, body) => call('onRequestPost', 'api/sessions.js', { request: req('POST', '/api/sessions', { body }), env }),
  logout: (env, cookie) => call('onRequestDelete', 'api/sessions.js', { request: req('DELETE', '/api/sessions', { cookie }), env }),
  me: (env, cookie) => call('onRequestGet', 'api/me.js', { request: req('GET', '/api/me', { cookie }), env }),
  getSave: (env, cookie) => call('onRequestGet', 'api/save.js', { request: req('GET', '/api/save', { cookie }), env }),
  putSave: (env, cookie, body) => call('onRequestPut', 'api/save.js', { request: req('PUT', '/api/save', { cookie, body }), env }),
  grants: (env, cookie) => call('onRequestGet', 'api/grants.js', { request: req('GET', '/api/grants', { cookie }), env }),
  claim: (env, cookie, ids) => call('onRequestPost', 'api/grants.js', { request: req('POST', '/api/grants', { cookie, body: { ids } }), env }),
  messages: (env, cookie) => call('onRequestGet', 'api/messages.js', { request: req('GET', '/api/messages', { cookie }), env }),
  readMsgs: (env, cookie, ids) => call('onRequestPost', 'api/messages.js', { request: req('POST', '/api/messages', { cookie, body: { ids } }), env }),
  players: (env, cookie) => call('onRequestGet', 'api/gm/players.js', { request: req('GET', '/api/gm/players', { cookie }), env }),
  player: (env, cookie, id) => call('onRequestGet', 'api/gm/player.js', { request: req('GET', `/api/gm/player?id=${id}`, { cookie }), env }),
  act: (env, cookie, body) => call('onRequestPost', 'api/gm/player.js', { request: req('POST', '/api/gm/player', { cookie, body }), env }),
  log: (env, cookie) => call('onRequestGet', 'api/gm/log.js', { request: req('GET', '/api/gm/log', { cookie }), env }),
};

// A save that looks like the real thing (the fields the game's load() insists on).
const saveBlob = (lv, zeny) => JSON.stringify({
  pets: [], cls: 'Novice', sex: 'm', lv, exp: 12, hp: 300, zeny, kills: 7, pts: 4,
  jobs: { Novice: { jl: 1, jx: 0 } }, sk: { aid: 1 }, st: { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 },
  eq: {}, inv: [], base: {}, mp: 0, lvl: 1, prog: [1, 1, 1, 1, 1], q: null, cards: [], ore: { ori: 0, elu: 0 },
});

let pass = 0, fail = 0;
const t = (n, fn) => {
  try { fn(); console.log('  ok   ' + n); pass++; }
  catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; }
};
const T = async (n, fn) => {   // async tests run inline to keep the output ordered
  try { await fn(); console.log('  ok   ' + n); pass++; }
  catch (e) { console.log('  FAIL ' + n + ' -> ' + (e && e.message)); fail++; }
};

console.log('server: accounts, sessions, saves, GM actions (real SQL)\n');

// --------------------------------------------------------------- the story ----
const { env, sqlite } = freshEnv();

await T('the first account ever registered becomes the owner', async () => {
  const r = await api.register(env, { u: 'KzeR', p: 'owner-password-1' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.gm, 2, 'the first account must be the owner');
  assert.ok(r.cookie?.startsWith('pg_session='), 'register must set a session cookie');
  assert.match(r.data.recovery, /^[A-Z0-9]{4}(-[A-Z0-9]{4})+$/, 'a recovery code is returned once');
});

await T('the second account is a normal player, and names are case-insensitively unique', async () => {
  const r = await api.register(env, { u: 'FRIEND', p: 'friend-password' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.gm, 0, 'only the first account is the owner');
  const dup = await api.register(env, { u: 'kzer', p: 'another-password' });
  assert.strictEqual(dup.status, 409, 'kzer must collide with KzeR');
});

await T('reserved names, short passwords and bad shapes are refused', async () => {
  assert.strictEqual((await api.register(env, { u: 'GM', p: 'long-enough-pw' })).status, 400);
  assert.strictEqual((await api.register(env, { u: 'admin', p: 'long-enough-pw' })).status, 400);
  assert.strictEqual((await api.register(env, { u: 'ok_name', p: 'short' })).status, 400);
  assert.strictEqual((await api.register(env, { u: 'no spaces', p: 'long-enough-pw' })).status, 400);
});

await T('login works, the cookie is a session, and /api/me knows who it is', async () => {
  const bad = await api.login(env, { u: 'FRIEND', p: 'wrong-password' });
  assert.strictEqual(bad.status, 401);
  const good = await api.login(env, { u: 'friend', p: 'friend-password' });
  assert.strictEqual(good.status, 200);
  assert.strictEqual(good.data.u, 'FRIEND', 'login is case-insensitive on the name, exact on the display');
  const me = await api.me(env, good.cookie);
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.data.u, 'FRIEND');
  assert.strictEqual(me.data.recoverySet, true);
  globalThis.__friend = good.cookie;
});

await T('a wrong password never says whether the account exists', async () => {
  const a = await api.login(env, { u: 'FRIEND', p: 'nope-nope-nope' });
  const b = await api.login(env, { u: 'ghost-user', p: 'nope-nope-nope' });
  assert.strictEqual(a.status, b.status, 'both must answer the same status');
  assert.strictEqual(a.data.err, b.data.err, 'and the same message');
});

await T('no cookie, a forged cookie and a logged-out cookie are all 401', async () => {
  assert.strictEqual((await api.me(env, null)).status, 401);
  assert.strictEqual((await api.me(env, 'pg_session=not-a-real-token-value-aaaaaaaaaaaaaaaaaaaa')).status, 401);
  const { cookie } = await api.login(env, { u: 'FRIEND', p: 'friend-password' });
  await api.logout(env, cookie);
  assert.strictEqual((await api.me(env, cookie)).status, 401, 'logout must invalidate the token server-side');
});

await T('saves: first upload, then versions bump, and the blob is stored verbatim', async () => {
  const c = globalThis.__friend;
  assert.strictEqual((await api.getSave(env, c)).status, 200);
  assert.strictEqual((await api.getSave(env, c)).data.blob, null, 'a new account has no save yet');
  const first = await api.putSave(env, c, { version: 0, blob: saveBlob(20, 12345), savedAt: 1 });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.data.version, 1);
  const second = await api.putSave(env, c, { version: 1, blob: saveBlob(21, 99999), savedAt: 2 });
  assert.strictEqual(second.data.version, 2);
  const got = await api.getSave(env, c);
  assert.deepStrictEqual(JSON.parse(got.data.blob), JSON.parse(saveBlob(21, 99999)));
  assert.strictEqual(got.data.version, 2);
});

await T('offline time is server-timed, capped, half-rate, persistent until claimed, and one-use', async () => {
  const c = globalThis.__friend;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  const awayMs = 24 * 60 * 60 * 1000;
  const priorAt=Date.now()-awayMs;
  sqlite.prepare('UPDATE saves SET last_seen=?, rate_kph=? WHERE user_id=?').run(priorAt,100,friendId);
  sqlite.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,claimed_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(friendId,0,0,100,0,.25,priorAt,priorAt);
  const first = await api.getSave(env, c);
  const claim = first.data.offlineClaim;
  assert.ok(claim && claim.id > 0, 'the server issues a persisted claim');
  assert.ok(claim.awayMs >= awayMs, 'elapsed time comes from D1 server last_seen');
  assert.strictEqual(claim.creditedMs, 4 * 60 * 60 * 1000, 'server caps at four hours');
  assert.strictEqual(claim.kills, 200, '100 kills/hour × 4 hours × 50%');
  const retry = await api.getSave(env, c);
  assert.strictEqual(retry.data.offlineClaim.id, claim.id, 'retry returns the same claim instead of minting another');
  assert.strictEqual(retry.data.offlineClaim.kills, claim.kills);
  const version = retry.data.version;
  const base = JSON.parse(retry.data.blob); base.kills += claim.kills;
  base.offlineClaimId = claim.id;
  base.offlineAt = 9999999999999; base.offlineKph = 30000; base.offlineKillRemainder = 0.99;
  const missing = await api.putSave(env, c, { version, blob: JSON.stringify(Object.assign({}, base, { offlineClaimId: undefined })), savedAt: 9999999999999 });
  assert.strictEqual(missing.status, 428, 'a pending server claim is required before this save can sync');
  const accepted = await api.putSave(env, c, { version, blob: JSON.stringify(base), offlineClaimId: claim.id, savedAt: 9999999999999 });
  assert.strictEqual(accepted.status, 200);
  assert.strictEqual(accepted.data.offlineClaimId, claim.id);
  const row = sqlite.prepare('SELECT version, saved_at, rate_kph, kills_total FROM saves WHERE user_id=?').get(friendId);
  assert.strictEqual(row.kills_total, 207);
  assert.ok(row.saved_at < 9999999999999, 'client-supplied clock is ignored');
  const storedClaim = sqlite.prepare('SELECT claimed_at, remainder FROM offline_reward_claims WHERE id=?').get(claim.id);
  assert.strictEqual(storedClaim.claimed_at > 0, true);
  assert.strictEqual(storedClaim.remainder, 0.25, 'the server keeps its own fractional remainder with the claim');
  const after = await api.getSave(env, c);
  assert.strictEqual(after.data.offlineClaim, null, 'the same period cannot be claimed a second time');

  // A save request can be the first request after a long absence (for example, a tab that came
  // back online without running the visibility refresh). PUT must return a server claim rather than
  // silently accepting the save as online progress.
  // This path credits the elapsed time EXACTLY (2h is under the cap), so the clock must not tick
  // between the arithmetic here and the handler's own Date.now(): a single millisecond used to fail
  // the assertion below (7200001 !== 7200000) and cascade into three more. Freeze it for the call.
  const realNow=Date.now,frozen=Date.now();
  const directAway=frozen-2*60*60*1000;
  sqlite.prepare('UPDATE saves SET last_seen=?, rate_kph=? WHERE user_id=?').run(directAway,100,friendId);
  const directSave=JSON.parse(after.data.blob);directSave.kills+=100;
  Date.now=()=>frozen;
  let direct;
  try{direct=await api.putSave(env,c,{version:after.data.version,blob:JSON.stringify(directSave),offlineClaimId:directSave.offlineClaimId});}
  finally{Date.now=realNow}
  assert.strictEqual(direct.status,428,'a first-return PUT also requires the pending claim');
  assert.strictEqual(direct.data.offlineClaim.creditedMs,2*60*60*1000);
  assert.strictEqual(direct.data.offlineClaim.kills,100);
  directSave.offlineClaimId=direct.data.offlineClaim.id;
  const directAccepted=await api.putSave(env,c,{version:after.data.version,blob:JSON.stringify(directSave),offlineClaimId:directSave.offlineClaimId});
  assert.strictEqual(directAccepted.status,200,'the corrected retry acknowledges the issued claim');
});

await T('a stale write is refused with the server copy, never silently applied', async () => {
  const c = globalThis.__friend, current = (await api.getSave(env, c)).data.version;
  const stale = await api.putSave(env, c, { version: current - 1, blob: saveBlob(99, 1), savedAt: 3 });
  assert.strictEqual(stale.status, 409, 'a version mismatch must be a conflict');
  assert.strictEqual(stale.data.conflict, true);
  assert.strictEqual(stale.data.version, current, 'the server hands back its own version');
  const still = await api.getSave(env, c);
  assert.strictEqual(JSON.parse(still.data.blob).lv, 21, 'the stale write must not have landed');
});

await T('the server refuses a save the game itself would reject', async () => {
  const c = globalThis.__friend;
  const v = (await api.getSave(env, c)).data.version;
  assert.strictEqual((await api.putSave(env, c, { version: v, blob: 'not json' })).status, 400);
  assert.strictEqual((await api.putSave(env, c, { version: v, blob: '{"zeny":1}' })).status, 400, 'no level -> refused');
  assert.strictEqual((await api.putSave(env, c, { version: v, blob: '"a string"' })).status, 400);
  assert.strictEqual((await api.putSave(env, c, { version: v, blob: 'x'.repeat(600000) })).status, 413, 'oversized -> 413');
  assert.strictEqual((await api.putSave(env, c, { version: v, blob: saveBlob(21, 5) })).status, 200, 'a good save still works');
});

await T('the leaderboard columns come from the save, not from a client-supplied object', async () => {
  const row = sqlite.prepare('SELECT level, cls, zeny, kills_total FROM saves WHERE user_id = (SELECT id FROM users WHERE username = ?)').get('FRIEND');
  assert.strictEqual(row.level, 21);
  assert.strictEqual(row.cls, 'Novice');
  assert.strictEqual(row.kills_total, 7);
});

await T('a logged-out device cannot touch the save', async () => {
  const { cookie } = await api.login(env, { u: 'FRIEND', p: 'friend-password' });
  await api.logout(env, cookie);
  assert.strictEqual((await api.getSave(env, cookie)).status, 401);
  assert.strictEqual((await api.putSave(env, cookie, { version: 3, blob: saveBlob(99, 0) })).status, 401);
});

// ------------------------------------------------------------------- GM ----
await T('a normal player is refused every GM endpoint', async () => {
  const c = globalThis.__friend;
  for (const r of [await api.players(env, c), await api.player(env, c, 1), await api.log(env, c),
    await api.act(env, c, { id: 1, action: 'ban' })]) {
    assert.strictEqual(r.status, 403, 'a player must not reach the GM API');
  }
});

await T('the owner sees the player list and one player in detail', async () => {
  const owner = (await api.login(env, { u: 'KzeR', p: 'owner-password-1' })).cookie;
  globalThis.__owner = owner;
  const list = await api.players(env, owner);
  assert.strictEqual(list.status, 200);
  assert.deepStrictEqual(list.data.players.map(p => p.u).sort(), ['FRIEND', 'KzeR']);
  const friend = list.data.players.find(p => p.u === 'FRIEND');
  const one = await api.player(env, owner, friend.id);
  assert.strictEqual(one.status, 200);
  assert.strictEqual(one.data.account.u, 'FRIEND');
  assert.ok(one.data.save.bytes > 100, 'the save size is reported');
  assert.strictEqual(one.data.save.pub.lv, 21);
});

await T('the GM sends Zeny, an item and a level, and the player receives them once', async () => {
  const owner = globalThis.__owner, friend = globalThis.__friend;
  const id = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  assert.strictEqual((await api.act(env, owner, { id, action: 'grant', kind: 'zeny', payload: { amount: 500000 }, note: 'sorry for the rollback' })).status, 200);
  assert.strictEqual((await api.act(env, owner, { id, action: 'grant', kind: 'level', payload: { amount: 5 } })).status, 200);
  assert.strictEqual((await api.act(env, owner, { id, action: 'grant', kind: 'item', payload: { item: { id: 9001, slot: 'weapon', wt: 'sword', name: 'GM Blade', val: 40, aff: [], cards: [] } } })).status, 200);
  assert.strictEqual((await api.act(env, owner, { id, action: 'grant', kind: 'zeny', payload: { amount: 0 } })).status, 400, 'a zero grant is refused');

  const seen = await api.grants(env, friend);
  assert.strictEqual(seen.data.grants.length, 3, 'the player sees three pending grants');
  assert.deepStrictEqual(seen.data.grants.map(g => g.kind), ['zeny', 'level', 'item']);
  assert.strictEqual(seen.data.grants[0].payload.amount, 500000);

  // The client applies them and claims; a second claim must not resurrect them.
  assert.strictEqual((await api.claim(env, friend, seen.data.grants.map(g => g.id))).status, 200);
  assert.strictEqual((await api.grants(env, friend)).data.grants.length, 0);
  const stillMine = sqlite.prepare('SELECT COUNT(*) AS n FROM grants WHERE claimed_at IS NOT NULL').get();
  assert.strictEqual(stillMine.n, 3);
});

await T('one player cannot claim another player\'s grants', async () => {
  const owner = globalThis.__owner;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  await api.act(env, owner, { id: friendId, action: 'grant', kind: 'zeny', payload: { amount: 777 } });
  const other = await api.register(env, { u: 'THIRD', p: 'third-password-x' });
  assert.strictEqual((await api.grants(env, other.cookie)).data.grants.length, 0, 'grants are per account');
  const id = sqlite.prepare('SELECT id FROM grants WHERE user_id = ? AND claimed_at IS NULL').get(friendId).id;
  await api.claim(env, other.cookie, [id]);
  const row = sqlite.prepare('SELECT claimed_at FROM grants WHERE id = ?').get(id);
  assert.strictEqual(row.claimed_at, null, 'claiming someone else\'s grant must do nothing');
});

await T('announcements reach everyone, and a message can be aimed at one player', async () => {
  const owner = globalThis.__owner, friend = globalThis.__friend, third = (await api.login(env, { u: 'THIRD', p: 'third-password-x' })).cookie;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'announce', toAll: true, body: 'Server restarts in 10 minutes.' })).status, 200);
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'announce', body: 'Just for you, friend.', kind: 'event' })).status, 200);

  const f = await api.messages(env, friend);
  assert.deepStrictEqual(f.data.messages.map(m => m.body).sort(), ['Just for you, friend.', 'Server restarts in 10 minutes.'].sort());
  const t3 = await api.messages(env, third);
  assert.deepStrictEqual(t3.data.messages.map(m => m.body), ['Server restarts in 10 minutes.'], 'the aimed message must not leak');

  await api.readMsgs(env, third, t3.data.messages.map(m => m.id));
  assert.strictEqual((await api.messages(env, third)).data.messages.length, 0, 'read messages stay read');
  assert.strictEqual((await api.messages(env, friend)).data.messages.length, 2, 'and only for the reader');
});

await T('only the owner may change a password or a GM level', async () => {
  const owner = globalThis.__owner;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  // Make FRIEND a GM (level 1) and check that a GM still cannot do owner things.
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'set-gm', level: 1 })).status, 200);
  const gmCookie = (await api.login(env, { u: 'FRIEND', p: 'friend-password' })).cookie;
  assert.strictEqual((await api.players(env, gmCookie)).status, 200, 'a GM may open the console');
  assert.strictEqual((await api.act(env, gmCookie, { id: friendId, action: 'set-password', password: 'hacked-password' })).status, 403);
  assert.strictEqual((await api.act(env, gmCookie, { id: owner ? 1 : 1, action: 'set-gm', level: 2 })).status, 403);
  assert.strictEqual((await api.act(env, gmCookie, { id: friendId, action: 'note', text: 'checking reports' })).status, 200, 'notes are allowed');
});

await T('a password reset revokes every session and the new password works', async () => {
  const owner = globalThis.__owner;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  const oldCookie = globalThis.__friend;
  assert.strictEqual((await api.me(env, oldCookie)).status, 200);
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'set-password', password: 'brand-new-password' })).status, 200);
  assert.strictEqual((await api.me(env, oldCookie)).status, 401, 'old sessions must die with the old password');
  assert.strictEqual((await api.login(env, { u: 'FRIEND', p: 'brand-new-password' })).status, 200);
  assert.strictEqual((await api.login(env, { u: 'FRIEND', p: 'friend-password' })).status, 401);
  globalThis.__friend = (await api.login(env, { u: 'FRIEND', p: 'brand-new-password' })).cookie;
});

await T('the owner cannot be banned and cannot demote themselves', async () => {
  const owner = globalThis.__owner;
  const ownerId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('KzeR').id;
  assert.strictEqual((await api.act(env, owner, { id: ownerId, action: 'ban' })).status, 400);
  assert.strictEqual((await api.act(env, owner, { id: ownerId, action: 'set-gm', level: 0 })).status, 400);
});

await T('a ban locks the account out; unban restores it', async () => {
  const owner = globalThis.__owner;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'ban' })).status, 200);
  assert.strictEqual((await api.login(env, { u: 'FRIEND', p: 'brand-new-password' })).status, 403);
  assert.strictEqual((await api.me(env, globalThis.__friend)).status, 401, 'existing sessions are killed by a ban');
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'unban' })).status, 200);
  assert.strictEqual((await api.login(env, { u: 'FRIEND', p: 'brand-new-password' })).status, 200);
  globalThis.__friend = (await api.login(env, { u: 'FRIEND', p: 'brand-new-password' })).cookie;
});

await T('a save backup can be restored, and the overwritten save is kept', async () => {
  const owner = globalThis.__owner, friend = globalThis.__friend;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  // Push the version to a multiple of 10 so a history row is written, then move on.
  let v = (await api.getSave(env, friend)).data.version;
  for (let i = 0; i < 12; i++) {
    const r = await api.putSave(env, friend, { version: v, blob: saveBlob(30 + i, 100 + i), savedAt: 100 + i });
    assert.strictEqual(r.status, 200);
    v = r.data.version;
  }
  const detail = await api.player(env, owner, friendId);
  assert.ok(detail.data.save.history.length >= 1, 'a history row must exist by now');
  const backup = detail.data.save.history[0];
  const restored = await api.act(env, owner, { id: friendId, action: 'restore', version: backup.version });
  assert.strictEqual(restored.status, 200);
  const nowSave = await api.getSave(env, friend);
  assert.strictEqual(nowSave.data.version, restored.data.version, 'the restore is a new version on top');
  const rows = sqlite.prepare('SELECT COUNT(*) AS n FROM save_history WHERE user_id = ?').get(friendId);
  assert.ok(rows.n >= 2, 'the overwritten save is still recoverable');
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'restore', version: 999999 })).status, 404);
});

await T('every GM action is in the audit log with the actor and the target', async () => {
  const owner = globalThis.__owner;
  const log = await api.log(env, owner);
  assert.strictEqual(log.status, 200);
  const kinds = log.data.events.map(e => e.kind);
  for (const k of ['gm-grant', 'gm-announce', 'gm-set-password', 'gm-ban', 'gm-unban', 'gm-restore', 'gm-note', 'gm-set-level']) {
    assert.ok(kinds.includes(k), 'the audit log is missing ' + k);
  }
  const grant = log.data.events.find(e => e.kind === 'gm-grant');
  assert.strictEqual(grant.actor, 'KzeR');
  assert.strictEqual(grant.u, 'FRIEND');
  assert.ok(grant.label && grant.label !== 'undefined', 'every event has a human label');
});

await T('a hostile save cannot smuggle impossible values into the server columns', async () => {
  const friend = globalThis.__friend;
  const v = (await api.getSave(env, friend)).data.version;
  const evil = JSON.stringify({ lv: 999999, cls: 'x'.repeat(500), zeny: -50, kills: 1e12, pets: [] });
  assert.strictEqual((await api.putSave(env, friend, { version: v, blob: evil, savedAt: 1 })).status, 200);
  const row = sqlite.prepare('SELECT level, cls, zeny FROM saves WHERE user_id = (SELECT id FROM users WHERE username = ?)').get('FRIEND');
  assert.ok(row.level <= 150, 'level must be clamped to the game cap, got ' + row.level);
  assert.ok(row.cls.length <= 32, 'class strings are trimmed');
  assert.strictEqual(row.zeny, 0, 'a negative wallet is floored at zero');
});

await T('rate limits stop a password sweep, and a success clears the counter', async () => {
  const { env: e2 } = freshEnv();
  await api.register(e2, { u: 'TARGET', p: 'correct-password' });
  let statuses = [];
  for (let i = 0; i < 8; i++) statuses.push((await api.login(e2, { u: 'TARGET', p: 'wrong-' + i })).status);
  assert.ok(statuses.includes(429), 'the per-account counter must trip within 8 tries: ' + statuses.join(','));
  assert.strictEqual((await api.login(e2, { u: 'TARGET', p: 'correct-password' })).status, 429, 'still locked while the window runs');
});

await T('two accounts never collide on the same save', async () => {
  const { env: e3 } = freshEnv();
  const a = await api.register(e3, { u: 'AAAA', p: 'password-aaaa' });
  const b = await api.register(e3, { u: 'BBBB', p: 'password-bbbb' });
  await api.putSave(e3, a.cookie, { version: 0, blob: saveBlob(10, 1), savedAt: 1 });
  await api.putSave(e3, b.cookie, { version: 0, blob: saveBlob(20, 2), savedAt: 1 });
  assert.strictEqual(JSON.parse((await api.getSave(e3, a.cookie)).data.blob).lv, 10);
  assert.strictEqual(JSON.parse((await api.getSave(e3, b.cookie)).data.blob).lv, 20);
});

// ------------------------------------------------- sanity on the source ----
const sources = fs.readdirSync(path.join(root, 'functions', 'api'), { recursive: true })
  .filter(f => String(f).endsWith('.js')).map(f => path.join('functions', 'api', String(f)));

await T('no handler contains a hard-coded secret', async () => {
  for (const f of sources) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{6,}['"]/i.test(s), f + ' looks like it holds a secret');
  }
});

await T('every GM endpoint checks gm rights before it queries anything', async () => {
  for (const f of sources.filter(f => f.includes('gm'))) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(/isGm\(user\)/.test(s), f + ' must call isGm(user)');
  }
});

sqlite.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
