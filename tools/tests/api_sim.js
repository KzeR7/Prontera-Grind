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

// Every row WRITTEN is counted, because rows written is the free plan's tightest limit and the
// point of the v82 usage diet: an accepted save sync must cost exactly one. The counter reads the
// statement's own SQL, so a hidden extra UPDATE (the old `touchSeen` on every request) shows up.
function makeD1(sqlite, stats) {
  const note = (sql) => {
    if (!stats) return;
    stats.writes++;
    const m = /^\s*(INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_]+)/i.exec(sql);
    if (m) { const t = m[2].toLowerCase(); stats.byTable[t] = (stats.byTable[t] || 0) + 1; }
    stats.sql.push(sql.replace(/\s+/g, ' ').trim().slice(0, 60));
  };
  const wrap = (stmt, args = [], sql = '') => ({
    _stmt: stmt, _args: args, _sql: sql,
    bind: (...more) => wrap(stmt, args.concat(more), sql),
    first: async () => stmt.get(...args) ?? null,
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => { note(sql); return { success: true, meta: stmt.run(...args) }; },
  });
  return {
    prepare: sql => wrap(sqlite.prepare(sql), [], sql),
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(q => { note(q._sql || ''); return { success: true, meta: q._stmt.run(...q._args) }; });
        sqlite.exec('COMMIT'); return results;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}

function freshEnv({ throughMigration = Infinity } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(root, 'migrations');
  for (const name of fs.readdirSync(dir).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
    if (Number(name.slice(0, name.indexOf('_'))) > throughMigration) continue;
    sqlite.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
  }
  const stats = { writes: 0, byTable: {}, sql: [] };
  return { env: { DB: makeD1(sqlite, stats) }, sqlite, stats };
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

// One live session per account (v252) means a login anywhere ends the session that account held
// before. The tests below keep long-lived cookies in globals between cases, so a successful login
// refreshes the global for that account - exactly what a browser would see, where the new cookie
// replaces the old one.
const TRACKED = { FRIEND: '__friend', KZER: '__owner' };
const login = async (env, body) => {
  const r = await call('onRequestPost', 'api/sessions.js', { request: req('POST', '/api/sessions', { body }), env });
  if (r.status === 200 && r.cookie) {
    const key = TRACKED[String((r.data && r.data.u) || body.u || '').toUpperCase()];
    if (key) globalThis[key] = r.cookie;
  }
  return r;
};

// Every handler in one place, so a rename fails here rather than in production.
const api = {
  register: (env, body) => call('onRequestPost', 'api/register.js', { request: req('POST', '/api/register', { body: { email: String(body.u || 'fixture').replace(/[^A-Za-z0-9]/g, '') + '@example.test', ...body } }), env }),
  login,
  logout: (env, cookie) => call('onRequestDelete', 'api/sessions.js', { request: req('DELETE', '/api/sessions', { cookie }), env }),
  me: (env, cookie) => call('onRequestGet', 'api/me.js', { request: req('GET', '/api/me', { cookie }), env }),
  getSave: (env, cookie) => call('onRequestGet', 'api/save.js', { request: req('GET', '/api/save', { cookie }), env }),
  // a well-behaved client names the account it is playing AND stamps the save it sends (v88.6); a test
  // may still pass its own owner or its own stamp to show the refusal
  putSave: async (env, cookie, body) => {
    const me = await api.me(env, cookie);
    const owner = me.data && me.data.u;
    return call('onRequestPut', 'api/save.js', { request: req('PUT', '/api/save', { cookie, body: Object.assign({ owner }, stampFor(body, owner)) }), env });
  },
  // exactly what is sent, with no stamping and no owner added: for the refusals themselves
  putRaw: (env, cookie, body) => call('onRequestPut', 'api/save.js', { request: req('PUT', '/api/save', { cookie, body }), env }),
  grants: (env, cookie) => call('onRequestGet', 'api/grants.js', { request: req('GET', '/api/grants', { cookie }), env }),
  claim: (env, cookie, ids) => call('onRequestPost', 'api/grants.js', { request: req('POST', '/api/grants', { cookie, body: { ids } }), env }),
  mailbox: (env, cookie) => call('onRequestGet', 'api/mailbox.js', { request: req('GET', '/api/mailbox', { cookie }), env }),
  messages: (env, cookie) => call('onRequestGet', 'api/messages.js', { request: req('GET', '/api/messages', { cookie }), env }),
  readMsgs: (env, cookie, ids) => call('onRequestPost', 'api/messages.js', { request: req('POST', '/api/messages', { cookie, body: { ids } }), env }),
  players: (env, cookie) => call('onRequestGet', 'api/gm/players.js', { request: req('GET', '/api/gm/players', { cookie }), env }),
  player: (env, cookie, id) => call('onRequestGet', 'api/gm/player.js', { request: req('GET', `/api/gm/player?id=${id}`, { cookie }), env }),
  act: (env, cookie, body) => call('onRequestPost', 'api/gm/player.js', { request: req('POST', '/api/gm/player', { cookie, body }), env }),
  log: (env, cookie) => call('onRequestGet', 'api/gm/log.js', { request: req('GET', '/api/gm/log', { cookie }), env }),
  usage: (env, cookie) => call('onRequestGet', 'api/gm/usage.js', { request: req('GET', '/api/gm/usage', { cookie }), env }),
};

// A save that looks like the real thing (the fields the game's load() insists on). It carries no
// owner stamp: putSave() adds the signed-in account's, the way the page does.
const saveBlob = (lv, zeny) => JSON.stringify({
  pets: [], cls: 'Novice', sex: 'm', lv, exp: 12, hp: 300, zeny, kills: 7, pts: 4,
  jobs: { Novice: { jl: 1, jx: 0 } }, sk: { aid: 1 }, st: { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 },
  eq: {}, inv: [], base: {}, mp: 0, lvl: 1, prog: [1, 1, 1, 1, 1], q: null, cards: [], ore: { ori: 0, elu: 0 },
});
// v88.6: the page stamps every save with its account. Adds the stamp unless the test wrote its own.
function stampFor(body, owner) {
  if (typeof body.blob !== 'string') return body;
  let save;
  try { save = JSON.parse(body.blob); } catch { return body; }
  if (!save || typeof save !== 'object' || Array.isArray(save) || 'owner' in save) return body;
  return Object.assign({}, body, { blob: JSON.stringify(Object.assign({}, save, { owner })) });
}

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

await T('public registration creates a player even on a fresh database', async () => {
  const r = await api.register(env, { u: 'KzeR', p: 'owner-password-1' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.gm, 0, 'public registration must not create an owner');
  sqlite.prepare("UPDATE users SET gm=2 WHERE username='KzeR'").run(); // operator provisions the fixture owner
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
  // Leave the account signed in for the cases below: one live session per account means the login
  // above already replaced the cookie this suite keeps in __friend.
  await api.login(env, { u: 'FRIEND', p: 'friend-password' });
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
  // the blob is stored as sent, plus the identity the server writes: the name stamp (v88.6) and,
  // since v280, the durable account id that survives a rename.
  // FRIEND is the second account registered in the fixture database.
  assert.deepStrictEqual(JSON.parse(got.data.blob),
    Object.assign(JSON.parse(saveBlob(21, 99999)), { owner: 'FRIEND', accountId: 2 }));
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
  // creditedMs is measured at request time, a few ms after last_seen was written: allow that
  // epsilon instead of an exact equality (the source of this suite's intermittent failure).
  const twoH=2*60*60*1000;
  assert.ok(direct.data.offlineClaim.creditedMs>=twoH&&direct.data.offlineClaim.creditedMs<twoH+60000,
    'credited time is the ~2h window, not less');
  assert.strictEqual(direct.data.offlineClaim.kills,100);
  directSave.offlineClaimId=direct.data.offlineClaim.id;
  const directAccepted=await api.putSave(env,c,{version:after.data.version,blob:JSON.stringify(directSave),offlineClaimId:directSave.offlineClaimId});
  assert.strictEqual(directAccepted.status,200,'the corrected retry acknowledges the issued claim');
});

await T('v422: an issued claim freezes the class and progression run it was priced for', async () => {
  const h = freshEnv();
  const reg = await api.register(h.env, { u: 'OWNERCTX', p: 'ownerctx-password' });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('OWNERCTX').id;
  const blob = JSON.parse(saveBlob(30, 500));
  blob.cls = 'Knight'; blob.runSeq = 2; blob.runGen = 2; blob.accountId = id;
  // This is the exact stored sample the four-hour entitlement must freeze. A later client save
  // deliberately replaces it below; the pending claim must not be repriced by that mutation.
  blob.offlineIncome = { version: 1, rewardVersion: 6, key: 'Knight:0:1', at: 1000, aid: id, gen: 2,
    xp: 6000, zeny: 3000, job: 420, kph: 120 };
  await api.putSave(h.env, reg.cookie, { version: 0, blob: JSON.stringify(blob), savedAt: 1 });
  const awayAt = Date.now() - 4 * 3600000;
  h.sqlite.prepare('UPDATE saves SET last_seen = ?, rate_kph = ? WHERE user_id = ?').run(awayAt, 100, id);
  const got = await api.getSave(h.env, reg.cookie);
  const claim = got.data.offlineClaim;
  assert.ok(claim && claim.id > 0, 'a claim is issued for the away window');
  assert.strictEqual(claim.cls, 'Knight', 'the claim freezes the class it was priced for');
  assert.strictEqual(claim.runGen, 2, 'and the progression run');
  assert.deepStrictEqual(claim.pricing && {
    xp: claim.pricing.xp, zeny: claim.pricing.zeny, job: claim.pricing.job, kph: claim.pricing.kph,
    sourceMap: claim.pricing.sourceMap, sourceStage: claim.pricing.sourceStage,
    incomeVersion: claim.pricing.incomeVersion, rewardVersion: claim.pricing.rewardVersion,
  }, { xp: 6000, zeny: 3000, job: 420, kph: 120, sourceMap: 0, sourceStage: 1, incomeVersion: 1, rewardVersion: 6 },
    'the claim freezes the complete measured minute and source, not only its owner');
  assert.ok(claim.pricing.intervalEndAt >= claim.pricing.intervalStartAt, 'the server also freezes explicit interval bounds');
  const stored = h.sqlite.prepare(`SELECT cls, run_gen, income_xp, income_zeny, income_job, income_kph,
    source_map, source_stage, income_version, reward_version, sampled_at, interval_start_at, interval_end_at
    FROM offline_reward_claims WHERE id = ?`).get(claim.id);
  assert.strictEqual(stored.cls, 'Knight', 'the freeze is durable, not just reported');
  assert.strictEqual(stored.run_gen, 2);
  assert.deepStrictEqual([stored.income_xp, stored.income_zeny, stored.income_job, stored.income_kph,
    stored.source_map, stored.source_stage, stored.income_version, stored.reward_version, stored.sampled_at],
    [6000, 3000, 420, 120, 0, 1, 1, 6, 1000], 'the D1 row holds immutable pricing and source fields');
  assert.strictEqual(stored.interval_start_at, awayAt,
    'the frozen interval starts at the stored away baseline, before the GET advances it');
  assert.ok(stored.interval_end_at >= stored.interval_start_at);
  const retry = await api.getSave(h.env, reg.cookie);
  assert.strictEqual(retry.data.offlineClaim.id, claim.id, 'a retry returns the same frozen claim');
  assert.strictEqual(retry.data.offlineClaim.cls, 'Knight');
  assert.strictEqual(retry.data.offlineClaim.runGen, 2);
  assert.deepStrictEqual(retry.data.offlineClaim.pricing, claim.pricing, 'retry returns the original immutable pricing, not a reissued plan');
  const base = JSON.parse(retry.data.blob); base.offlineClaimId = claim.id;
  // A newer minute can be stronger/weaker and from another field, but it cannot reprice this claim.
  base.offlineIncome = { ...base.offlineIncome, key: 'Knight:1:2', xp: 600000, zeny: 300000, job: 42000, kph: 30000 };
  const accepted = await api.putSave(h.env, reg.cookie, { version: retry.data.version, blob: JSON.stringify(base), offlineClaimId: claim.id, savedAt: 2 });
  assert.strictEqual(accepted.status, 200, 'the frozen claim is consumed by the versioned save exactly as before');
  const consumed = h.sqlite.prepare('SELECT claimed_at, cls, run_gen FROM offline_reward_claims WHERE id = ?').get(claim.id);
  assert.ok(consumed.claimed_at > 0, 'exactly-once consumption is unchanged');
  assert.strictEqual(consumed.cls, 'Knight', 'consumption never rewrites the frozen owner');
  assert.strictEqual(consumed.run_gen, 2);
  const pricedAfterAck = h.sqlite.prepare('SELECT income_xp, income_zeny, source_map, source_stage FROM offline_reward_claims WHERE id = ?').get(claim.id);
  assert.deepStrictEqual([pricedAfterAck.income_xp, pricedAfterAck.income_zeny, pricedAfterAck.source_map, pricedAfterAck.source_stage], [6000, 3000, 0, 1],
    'the acknowledgement cannot rewrite an already-issued entitlement with a later sample');
});

await T('v424: an ineligible post-0020 claim is explicit, bounded, zero-priced and still exactly-once acknowledged', async () => {
  const h = freshEnv();
  const reg = await api.register(h.env, { u: 'UNTRAINED', p: 'untrained-password' });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('UNTRAINED').id;
  const blob = JSON.parse(saveBlob(30, 500));
  blob.cls = 'Swordman'; blob.runSeq = 2; blob.runGen = 2; blob.accountId = id;
  // No offlineIncome minute exists yet. A later first minute must not price this already-issued gap.
  await api.putSave(h.env, reg.cookie, { version: 0, blob: JSON.stringify(blob), savedAt: 1 });
  const awayAt=Date.now()-4*3600000;
  h.sqlite.prepare('UPDATE saves SET last_seen=?, rate_kph=? WHERE user_id=?').run(awayAt,120,id);
  const got=await api.getSave(h.env,reg.cookie),claim=got.data.offlineClaim;
  assert.ok(claim&&claim.id>0,'the handler issues the durable acknowledgement claim');
  assert.strictEqual(claim.pricingState,'ineligible','new no-sample rows never impersonate legacy pricing:null');
  assert.strictEqual(claim.pricing,null);
  assert.strictEqual(claim.intervalStartAt,awayAt,'the interval is frozen even though pricing is not');
  assert.ok(claim.intervalEndAt>=claim.intervalStartAt);
  assert.strictEqual(got.data.serverNow,claim.intervalEndAt,'GET uses its one server clock for both bounds and anchor');
  const durable=h.sqlite.prepare('SELECT pricing_state, income_xp, interval_start_at, interval_end_at FROM offline_reward_claims WHERE id=?').get(claim.id);
  assert.deepStrictEqual([durable.pricing_state,durable.income_xp,durable.interval_start_at],['ineligible',null,awayAt]);
  // A deliberately stronger later sample travels in the acknowledgement save but cannot rewrite
  // this entitlement; the client-side real-applier regression proves it cannot pay from this either.
  const ack=JSON.parse(got.data.blob);ack.offlineClaimId=claim.id;
  ack.offlineIncome={version:1,rewardVersion:6,key:'Swordman:0:1',at:Date.now(),aid:id,gen:2,xp:6000,zeny:3000,job:420,kph:120};
  const accepted=await api.putSave(h.env,reg.cookie,{version:got.data.version,blob:JSON.stringify(ack),offlineClaimId:claim.id,savedAt:2});
  assert.strictEqual(accepted.status,200);
  assert.ok(h.sqlite.prepare('SELECT claimed_at FROM offline_reward_claims WHERE id=?').get(claim.id).claimed_at>0);
  assert.strictEqual(h.sqlite.prepare('SELECT income_xp, pricing_state FROM offline_reward_claims WHERE id=?').get(claim.id).income_xp,null,
    'acknowledgement cannot turn an ineligible row into a later priced claim');
});

await T('v424: 0020 classifies historical rows and only legacy rows retain the compatibility signal', async () => {
  const h=freshEnv();
  const reg=await api.register(h.env,{u:'CLAIMSTATE',p:'claimstate-password'});
  const id=h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('CLAIMSTATE').id;
  const base=JSON.parse(saveBlob(20,40));base.cls='Knight';base.runSeq=2;base.runGen=2;
  await api.putSave(h.env,reg.cookie,{version:0,blob:JSON.stringify(base),savedAt:1});
  const issued=Date.now();
  // Simulate an old all-null row carried through migration 0020. It must remain recoverable, not
  // re-labelled as one of today's ineligible rows.
  h.sqlite.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,
    cls,run_gen,pricing_state) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,4*3600000,4*3600000,120,240,0,issued,'Knight',2,'legacy');
  const legacy=await api.getSave(h.env,reg.cookie);
  assert.strictEqual(legacy.data.offlineClaim.pricingState,'legacy');
  assert.strictEqual(legacy.data.offlineClaim.pricing,null);
  const ack=JSON.parse(legacy.data.blob);ack.offlineClaimId=legacy.data.offlineClaim.id;
  assert.strictEqual((await api.putSave(h.env,reg.cookie,{version:legacy.data.version,blob:JSON.stringify(ack),offlineClaimId:ack.offlineClaimId})).status,200,
    'legacy recovery rows remain versioned/restore-fenced acknowledgements');
  // State and fields disagreeing is corruption, never another local-sample fallback.
  h.sqlite.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,
    cls,run_gen,income_xp,pricing_state) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,4*3600000,4*3600000,120,240,0,issued+1,'Knight',2,99,'ineligible');
  const corrupt=await api.getSave(h.env,reg.cookie);
  assert.strictEqual(corrupt.data.offlineClaim.pricingState,'corrupt');
  assert.strictEqual(corrupt.data.offlineClaim.pricing,null);
});

await T('v424: no state column means old rows can be acknowledged, but new issuance waits for migration 0020', async () => {
  const h = freshEnv({ throughMigration: 19 });
  const reg = await api.register(h.env, { u: 'PRE0020', p: 'pre0020-password' });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('PRE0020').id;
  const blob = JSON.parse(saveBlob(30, 500)); blob.cls='Knight';blob.runSeq=2;blob.runGen=2;blob.accountId=id;
  await api.putSave(h.env,reg.cookie,{version:0,blob:JSON.stringify(blob),savedAt:1});
  const awayAt=Date.now()-4*3600000;
  h.sqlite.prepare('UPDATE saves SET last_seen=?, rate_kph=? WHERE user_id=?').run(awayAt,120,id);
  const noState=await api.getSave(h.env,reg.cookie);
  assert.strictEqual(noState.status,503,'a qualifying return retries until its reward window can be persisted');
  assert.strictEqual(noState.data.offlineClaimsUnavailable,true);
  assert.strictEqual(h.sqlite.prepare('SELECT last_seen FROM saves WHERE user_id=?').get(id).last_seen,awayAt,
    'waiting for the schema must not erase the unclaimed away window');
  assert.equal(h.sqlite.prepare('PRAGMA table_info(offline_reward_claims)').all().some(c=>c.name==='pricing_state'),false);
  // A genuinely pre-0020 pending row is still returned/acknowledged under its legacy contract.
  h.sqlite.prepare('INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,cls,run_gen) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id,4*3600000,4*3600000,120,240,0,Date.now(),'Knight',2);
  const legacy=await api.getSave(h.env,reg.cookie);
  assert.strictEqual(legacy.data.offlineClaim.pricingState,'legacy');
  const ack=JSON.parse(legacy.data.blob);ack.offlineClaimId=legacy.data.offlineClaim.id;
  assert.strictEqual((await api.putSave(h.env,reg.cookie,{version:legacy.data.version,blob:JSON.stringify(ack),offlineClaimId:ack.offlineClaimId})).status,200);
  // A historical no-state row is legacy only when the old snapshot fields are all absent. A partial
  // 0019 snapshot is corrupt; it must not fall through to a mutable local sample merely because
  // pricing_state was added later.
  h.sqlite.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,
    cls,run_gen,income_xp) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,4*3600000,4*3600000,120,240,0,Date.now()+1,'Knight',2,99);
  const partial=await api.getSave(h.env,reg.cookie);
  assert.strictEqual(partial.data.offlineClaim.pricingState,'corrupt');
  assert.strictEqual(partial.data.offlineClaim.pricing,null);
});

await T('offline claim classification treats interval-only historical snapshots as corrupt', async () => {
  const h=freshEnv(),reg=await api.register(h.env,{u:'PARTIALTIME',p:'partialtime-password'});
  const id=h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('PARTIALTIME').id;
  await api.putSave(h.env,reg.cookie,{version:0,blob:saveBlob(30,500)});
  const end=Date.now(),start=end-4*3600000;
  h.sqlite.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at)
    VALUES(?,?,?,?,?,?,?)`).run(id,4*3600000,4*3600000,120,240,0,end);
  assert.strictEqual((await api.getSave(h.env,reg.cookie)).data.offlineClaim.pricingState,'legacy',
    'a truly empty historical snapshot remains recoverable');
  for(const state of [null,'legacy'])for(const bounds of [[start,null],[null,end],[start,end]]){
    h.sqlite.prepare('UPDATE offline_reward_claims SET pricing_state=?,interval_start_at=?,interval_end_at=? WHERE user_id=? AND claimed_at IS NULL')
      .run(state,...bounds,id);
    const got=await api.getSave(h.env,reg.cookie);
    assert.strictEqual(got.data.offlineClaim.pricingState,'corrupt',
      'partial frozen bounds cannot authorize mutable-sample fallback: '+JSON.stringify({state,bounds}));
    assert.strictEqual(got.data.offlineClaim.pricing,null);
  }
});

await T('a missing claim-state migration preserves GET/PUT reward windows until issuance can resume', async () => {
  const h=freshEnv({throughMigration:19}),reg=await api.register(h.env,{u:'MIGWAIT',p:'migrationwait-password'});
  const id=h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('MIGWAIT').id;
  const blob=JSON.parse(saveBlob(30,500));blob.cls='Knight';blob.runGen=2;blob.runSeq=2;blob.accountId=id;
  blob.offlineIncome={version:1,rewardVersion:6,key:'Knight:0:1',aid:id,gen:2,at:1,xp:6000,zeny:3000,job:420,kph:120};
  await api.putSave(h.env,reg.cookie,{version:0,blob:JSON.stringify(blob)});
  const awayAt=Date.now()-4*3600000-10000;
  h.sqlite.prepare('UPDATE saves SET last_seen=?,rate_kph=120 WHERE user_id=?').run(awayAt,id);
  const before=h.sqlite.prepare('SELECT version,blob,last_seen FROM saves WHERE user_id=?').get(id);
  for(const attempt of [()=>api.getSave(h.env,reg.cookie),()=>api.putSave(h.env,reg.cookie,{version:1,blob:JSON.stringify(blob)})]){
    const refused=await attempt();
    assert.strictEqual(refused.status,503);
    assert.strictEqual(refused.data.offlineClaimsUnavailable,true);
    assert.deepStrictEqual(h.sqlite.prepare('SELECT version,blob,last_seen FROM saves WHERE user_id=?').get(id),before,
      'neither a read nor a rejected sync may consume the waiting window');
    assert.strictEqual(h.sqlite.prepare('SELECT COUNT(*) AS n FROM offline_reward_claims').get().n,0);
  }
  h.sqlite.exec(fs.readFileSync(path.join(root,'migrations/0020_offline_claim_pricing_state.sql'),'utf8'));
  const resumed=await api.getSave(h.env,reg.cookie);
  assert.strictEqual(resumed.status,200);
  assert.strictEqual(resumed.data.offlineClaim.pricingState,'priced');
  assert.strictEqual(resumed.data.offlineClaim.intervalStartAt,awayAt);
  assert.strictEqual(resumed.data.offlineClaim.creditedMs,4*3600000);
  assert.strictEqual((await api.getSave(h.env,reg.cookie)).data.offlineClaim.id,resumed.data.offlineClaim.id,
    'recovery issues one persistent entitlement for the preserved window');
});

await T('a legacy save first return freezes its existing same-class sample instead of retiring earned income', async () => {
  const h=freshEnv(),reg=await api.register(h.env,{u:'FIRSTRETURN',p:'firstreturn-password'});
  const id=h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('FIRSTRETURN').id;
  const blob=JSON.parse(saveBlob(30,500));blob.cls='Knight';blob.accountId=id;
  blob.offlineIncome={version:1,rewardVersion:6,key:'Knight:0:1',at:1,xp:6000,zeny:3000,job:420,kph:120};
  await api.putSave(h.env,reg.cookie,{version:0,blob:JSON.stringify(blob)});
  h.sqlite.prepare('UPDATE saves SET last_seen=?,rate_kph=120 WHERE user_id=?').run(Date.now()-4*3600000,id);
  const first=await api.getSave(h.env,reg.cookie),claim=first.data.offlineClaim;
  assert.strictEqual(claim.pricingState,'priced','an unmigrated save is not an untrained modern run');
  assert.strictEqual(claim.runGen,1,'match the client legacy generation-one adoption');
  assert.deepStrictEqual([claim.pricing.xp,claim.pricing.zeny,claim.pricing.job,claim.pricing.kph],[6000,3000,420,120]);
  blob.runGen=1;blob.runSeq=1;blob.offlineClaimId=claim.id;
  blob.offlineIncome={...blob.offlineIncome,aid:id,gen:1,xp:600000,zeny:300000};
  assert.strictEqual((await api.putSave(h.env,reg.cookie,{version:first.data.version,blob:JSON.stringify(blob),offlineClaimId:claim.id})).status,200);
  const frozen=h.sqlite.prepare('SELECT income_xp,income_zeny,run_gen FROM offline_reward_claims WHERE id=?').get(claim.id);
  assert.deepStrictEqual([frozen.income_xp,frozen.income_zeny,frozen.run_gen],[6000,3000,1],
    'adoption cannot reprice its already-issued first-return entitlement');
  for(const sample of [
    {...blob.offlineIncome,aid:id+100},
    {...blob.offlineIncome,gen:7},
    {version:1,rewardVersion:6,key:'Novice:0:1',at:1,xp:6000,zeny:3000,job:420,kph:120},
  ]){
    const legacy={...blob};delete legacy.runGen;delete legacy.runSeq;delete legacy.offlineClaimId;legacy.offlineIncome=sample;
    h.sqlite.prepare('UPDATE saves SET blob=?,last_seen=? WHERE user_id=?').run(JSON.stringify(legacy),Date.now()-4*3600000,id);
    const denied=await api.getSave(h.env,reg.cookie);
    assert.strictEqual(denied.data.offlineClaim.pricingState,'ineligible','legacy adoption never borrows an explicitly foreign account/class/run');
    h.sqlite.prepare('UPDATE offline_reward_claims SET claimed_at=? WHERE user_id=? AND claimed_at IS NULL').run(Date.now(),id);
  }
  const modern={...blob,runGen:2,runSeq:2};delete modern.offlineClaimId;
  modern.offlineIncome={version:1,rewardVersion:6,key:'Knight:0:1',at:1,xp:6000,zeny:3000,job:420,kph:120};
  h.sqlite.prepare('UPDATE saves SET blob=?,last_seen=? WHERE user_id=?').run(JSON.stringify(modern),Date.now()-4*3600000,id);
  assert.strictEqual((await api.getSave(h.env,reg.cookie)).data.offlineClaim.pricingState,'ineligible',
    'modern owner metadata cannot be silently inferred when its sample has none');
  h.sqlite.prepare('UPDATE offline_reward_claims SET claimed_at=? WHERE user_id=? AND claimed_at IS NULL').run(Date.now(),id);
  const oldNormal={...modern};delete oldNormal.runGen;delete oldNormal.runSeq;
  oldNormal.offlineIncome={...modern.offlineIncome};delete oldNormal.offlineIncome.rewardVersion;
  h.sqlite.prepare('UPDATE saves SET blob=?,last_seen=? WHERE user_id=?').run(JSON.stringify(oldNormal),Date.now()-4*3600000,id);
  const compatible=(await api.getSave(h.env,reg.cookie)).data.offlineClaim;
  assert.strictEqual(compatible.pricingState,'priced','old normal-field samples without Ascension version remain payable');
  assert.strictEqual(compatible.pricing.rewardVersion,0);
});

await T('v422: the smoothed kill rate re-bases across a class or run boundary instead of carrying old-class speed', async () => {
  const h = freshEnv();
  const reg = await api.register(h.env, { u: 'RATEBASE', p: 'ratebase-password' });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('RATEBASE').id;
  const rateRow = () => Number(h.sqlite.prepare('SELECT rate_kph FROM saves WHERE user_id = ?').get(id).rate_kph);
  const sw = JSON.parse(saveBlob(40, 900)); sw.cls = 'Swordman'; sw.runSeq = 1; sw.runGen = 1;
  await api.putSave(h.env, reg.cookie, { version: 0, blob: JSON.stringify(sw), savedAt: 1 });
  h.sqlite.prepare('UPDATE saves SET last_seen = ?, rate_kph = ? WHERE user_id = ?').run(Date.now() - 60000, 240, id);
  // Class change: the Hunter must not price away claims from the Swordman's smoothed speed.
  const hunter = JSON.parse(JSON.stringify(sw)); hunter.cls = 'Hunter'; hunter.runSeq = 2; hunter.runGen = 2; hunter.kills = sw.kills + 10;
  const switched = await api.putSave(h.env, reg.cookie, { version: 1, blob: JSON.stringify(hunter), savedAt: 2 });
  assert.strictEqual(switched.status, 200);
  assert.strictEqual(rateRow(), 0, 'the old class rate is not carried into the new class');
  // Same class name, new progression run (the Novice reset shape): still a boundary.
  h.sqlite.prepare('UPDATE saves SET last_seen = ?, rate_kph = ? WHERE user_id = ?').run(Date.now() - 60000, 240, id);
  const h3 = JSON.parse(JSON.stringify(hunter)); h3.runSeq = 3; h3.runGen = 3; h3.kills = hunter.kills + 10;
  const reran = await api.putSave(h.env, reg.cookie, { version: 2, blob: JSON.stringify(h3), savedAt: 3 });
  assert.strictEqual(reran.status, 200);
  assert.strictEqual(rateRow(), 0, 'a new run of the same class re-bases too');
  // A stored save from before runs were numbered is NOT a boundary: migration erases nothing,
  // and the first post-migration sync keeps smoothing from the legacy rate.
  const legacyStored = JSON.parse(JSON.stringify(h3)); delete legacyStored.runGen; delete legacyStored.runSeq;
  h.sqlite.prepare('UPDATE saves SET blob = ?, last_seen = ?, rate_kph = ? WHERE user_id = ?')
    .run(JSON.stringify(legacyStored), Date.now() - 60000, 240, id);
  const h4 = JSON.parse(JSON.stringify(h3)); h4.runSeq = 4; h4.runGen = 4; h4.kills = h3.kills + 12;
  const cont = await api.putSave(h.env, reg.cookie, { version: 3, blob: JSON.stringify(h4), savedAt: 4 });
  assert.strictEqual(cont.status, 200);
  assert.ok(rateRow() > 0, 'a pre-ownership stored save keeps smoothing into the numbered run');
});

await T('a login does not erase the away window: the offline claim survives signing in', async () => {
  // The real sequence (v88.1 owner report: "offline reward seems not to be working" on cloud
  // accounts): the player syncs, is gone four hours, and COMES BACK - which means logging in
  // FIRST, and only then does the game ask /api/save for its claim. The login used to touch
  // saves.last_seen, so the away window was already zero when the claim was computed and no
  // cloud account ever received an offline reward. This pins the real order, not a hand-staged one.
  const h = freshEnv();
  const reg = await api.register(h.env, { u: 'RETURNING', p: 'returning-password' });
  await api.putSave(h.env, reg.cookie, { version: 0, blob: saveBlob(10, 5), savedAt: 1 });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('RETURNING').id;
  const awayMs = 4 * 60 * 60 * 1000, goneAt = Date.now() - awayMs;
  h.sqlite.prepare('UPDATE saves SET last_seen = ?, rate_kph = ? WHERE user_id = ?').run(goneAt, 100, id);
  const back = await api.login(h.env, { u: 'RETURNING', p: 'returning-password' });
  assert.strictEqual(back.status, 200);
  const seen = h.sqlite.prepare('SELECT last_seen FROM saves WHERE user_id = ?').get(id).last_seen;
  assert.strictEqual(seen, goneAt,
    'login must not move the away baseline (it records the sign-in in users.last_login_at instead)');
  const got = await api.getSave(h.env, back.cookie);
  const claim = got.data.offlineClaim;
  assert.ok(claim && claim.id > 0, 'the return after a real login still earns a server-timed claim');
  assert.ok(claim.awayMs >= awayMs, 'the away window is the full four hours the player was gone');
  assert.strictEqual(claim.creditedMs, 4 * 60 * 60 * 1000, 'still capped at four hours');
  assert.strictEqual(claim.kills, 200, '100 kills/hour × 4 hours × 50%');
  const base = JSON.parse(got.data.blob); base.kills += claim.kills; base.offlineClaimId = claim.id;
  const accepted = await api.putSave(h.env, back.cookie, { version: got.data.version, blob: JSON.stringify(base), offlineClaimId: claim.id, savedAt: 2 });
  assert.strictEqual(accepted.status, 200, 'the claim is acknowledged with the next sync');
  const again = await api.getSave(h.env, back.cookie);
  assert.strictEqual(again.data.offlineClaim, null, 'the same period cannot be claimed twice');
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
  await api.login(env, { u: 'FRIEND', p: 'friend-password' });   // leave a live session for the GM cases
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

await T('a gift expires 5 days after it was sent and can no longer be claimed', async () => {
  // v401 (owner: "i want the gm mail expiry to be 5 days. any gift not claim will be directly
  // vanish."). Back-date one grant past the window and leave one fresh, then prove the stale one is
  // both invisible to the client AND unclaimable if the client still holds its id.
  const owner = globalThis.__owner;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;
  const freshGrp = await api.register(env, { u: 'TTLTEST', p: 'ttl-password-xyz' });
  const ttlId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('TTLTEST').id;
  await api.act(env, owner, { id: ttlId, action: 'grant', kind: 'zeny', payload: { amount: 111 } });
  await api.act(env, owner, { id: ttlId, action: 'grant', kind: 'zeny', payload: { amount: 222 } });
  const rows = sqlite.prepare('SELECT id FROM grants WHERE user_id = ? ORDER BY id').all(ttlId);
  assert.strictEqual(rows.length, 2, 'two gifts were queued');
  const day = 24 * 60 * 60 * 1000;
  // Age the first one to 5 days + 1 minute: inside the boundary check it must already be gone.
  sqlite.prepare('UPDATE grants SET created_at = ? WHERE id = ?').run(Date.now() - (5 * day) - 60000, rows[0].id);
  // Age the second to 4 days 23 hours: still claimable.
  sqlite.prepare('UPDATE grants SET created_at = ? WHERE id = ?').run(Date.now() - (5 * day) + 60000, rows[1].id);
  const seen = await api.grants(env, freshGrp.cookie);
  assert.strictEqual(seen.data.grants.length, 1, 'only the in-window gift is listed');
  assert.strictEqual(seen.data.grants[0].id, rows[1].id, 'the fresh gift is the one still offered');
  // A client that cached the expired id must not be able to redeem it.
  await api.claim(env, freshGrp.cookie, [rows[0].id]);
  const stale = sqlite.prepare('SELECT claimed_at FROM grants WHERE id = ?').get(rows[0].id);
  assert.strictEqual(stale.claimed_at, null, 'an expired gift cannot be claimed even by id');
  // The in-window one still works.
  await api.claim(env, freshGrp.cookie, [rows[1].id]);
  assert.ok(sqlite.prepare('SELECT claimed_at FROM grants WHERE id = ?').get(rows[1].id).claimed_at, 'an unexpired gift is still claimable');
  void friendId;
});

await T('the players list is ordered by most recent sign-in, never-signed-in last', async () => {
  // v403 (owner: "the top will be always the players play currently then by date, means players that
  // never login will go further down based on latest login").
  const owner = globalThis.__owner;
  const day = 86400000, t = Date.now();
  const mk = (name, login) => {
    const id = Number(sqlite.prepare('INSERT INTO users(username,pass_hash,created_at,last_login_at) VALUES(?,?,?,?)')
      .run(name, 'synthetic', t, login).lastInsertRowid);
    return id;
  };
  mk('ORDER_YESTERDAY', t - day);
  mk('ORDER_NEVER', null);
  mk('ORDER_RECENT', t - 60000);
  mk('ORDER_WEEKAGO', t - 7 * day);
  const list = (await api.players(env, owner)).data.players;
  const names = list.map(p => p.u);
  const positions = names.reduce((m, n) => (m[n] = names.indexOf(n), m), {});
  assert.ok(positions.ORDER_RECENT < positions.ORDER_YESTERDAY, 'the most recent sign-in is above yesterday');
  assert.ok(positions.ORDER_YESTERDAY < positions.ORDER_WEEKAGO, 'yesterday is above last week');
  assert.ok(positions.ORDER_WEEKAGO < positions.ORDER_NEVER, 'a player who never signed in sorts last, not first');
  // The payload must carry the field the table shows, or the column and the order disagree.
  for (const p of list) assert.ok('lastLogin' in p, 'every row reports lastLogin');
});

await T('the mailbox lists claimable gifts with a 5-day deadline', async () => {
  // v401 (owner: "i want endless echo payout to be on mail & with expiry. so 5 days without claim,
  // rewards will vanish."). The mailbox is the player-facing view of the same grants queue.
  const owner = globalThis.__owner;
  const mb = await api.register(env, { u: 'MBTEST', p: 'mailbox-password-1' });
  const id = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('MBTEST').id;
  await api.act(env, owner, { id, action: 'grant', kind: 'zeny', payload: { amount: 4321 } });
  const out = await api.mailbox(env, mb.cookie);
  assert.strictEqual(out.status, 200, 'the mailbox answers');
  assert.strictEqual(out.data.ttlDays, 5, 'the window is five days');
  assert.strictEqual(out.data.mail.length, 1, 'the gift is listed');
  const row = out.data.mail[0];
  assert.strictEqual(row.payload.amount, 4321, 'the payload survives the round trip');
  assert.ok(row.expiresAt - row.at === 5 * 24 * 60 * 60 * 1000, 'expiry is exactly five days after it was sent');
  // A gift older than the window is gone from the mailbox and cannot be claimed by id.
  sqlite.prepare('UPDATE grants SET created_at = ? WHERE id = ?').run(Date.now() - 6 * 86400000, row.id);
  // Assert the QUERY, not just the endpoint: the endpoint also sweeps, which would hide a query that
  // forgot the age filter. This is the check that keeps the guarantee honest.
  const mailLib = await import(pathToFileURL(path.join(root, 'functions/_lib/db.js')).href);
  const raw = await mailLib.mailBox(env.DB, id);
  assert.strictEqual(raw.results.length, 0, 'the mailbox query itself excludes expired rows');
  const after = await api.mailbox(env, mb.cookie);
  assert.strictEqual(after.data.mail.length, 0, 'an expired gift disappears from the mailbox');
  // Claiming first, before the mailbox read sweeps the row: the claim itself must be refused.
  await api.claim(env, mb.cookie, [row.id]);
  const still = sqlite.prepare('SELECT claimed_at FROM grants WHERE id = ?').get(row.id);
  assert.ok(!still || still.claimed_at === null, 'an expired gift cannot be claimed even by id');
  // And the sweep the mailbox runs clears it away entirely.
  const swept = await api.mailbox(env, mb.cookie);
  assert.strictEqual(swept.data.mail.length, 0, 'nothing expired is offered');
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM grants WHERE id = ?').get(row.id).n, 0, 'expired rows are swept');
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

await T('GM announcements can attach a gift (materials, gear, or Zeny) for one player or everyone', async () => {
  const owner = globalThis.__owner, friend = globalThis.__friend;
  const friendId = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FRIEND').id;

  const bad = await api.act(env, owner, {
    id: friendId,
    action: 'announce',
    body: 'Invalid gift test',
    kind: 'event',
    toAll: false,
    gift: { kind: 'gift', catalogId: 'resource:ori', amount: 0 },
  });
  assert.strictEqual(bad.status, 400, 'invalid gift quantity must be rejected');

  const res = await api.act(env, owner, {
    id: friendId,
    action: 'announce',
    body: 'Weekend refinement event! Enjoy free Oridecon.',
    kind: 'event',
    toAll: true,
    gift: { kind: 'gift', catalogId: 'resource:ori', amount: 25 },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.data));
  assert.ok(res.data.messageId > 0);
  assert.match(res.data.giftLabel, /25 × Oridecon/);

  const msgRes = (await api.messages(env, friend)).data;
  const ann = (msgRes.inbox || []).find(x => x.id === res.data.messageId);
  assert.ok(ann, 'inbox includes the announcement');
  assert.ok(ann.gift, 'inbox entry carries the attached gift');
  assert.strictEqual(ann.gift.claimed, false);
  assert.strictEqual(ann.gift.payload.resource, 'ori');
  assert.strictEqual(ann.gift.payload.amount, 25);
  assert.strictEqual(ann.gift.payload.messageId, res.data.messageId);

  await api.readMsgs(env, friend, [res.data.messageId]);
  // Clear the queued announcement grants so subsequent tests see clean grants state
  sqlite.prepare('DELETE FROM grants WHERE payload LIKE ?').run('%"messageId":%');
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

await T('a second sign-in ends the first device: one live session per account', async () => {
  const first = await api.login(env, { u: 'FRIEND', p: 'friend-password' });
  assert.strictEqual(first.status, 200);
  assert.strictEqual((await api.me(env, first.cookie)).status, 200, 'the first device works');
  const second = await api.login(env, { u: 'FRIEND', p: 'friend-password' });
  assert.strictEqual(second.status, 200, 'the second device signs in normally');
  assert.strictEqual((await api.me(env, second.cookie)).status, 200, 'the second device is live');
  assert.strictEqual((await api.me(env, first.cookie)).status, 401, 'the first device is signed out');
  assert.strictEqual((await api.getSave(env, first.cookie)).status, 401,
    'and cannot touch the save - the whole point of one session per account');
  // The kicked device can take the account back by signing in again; that ends the other one.
  const again = await api.login(env, { u: 'FRIEND', p: 'friend-password' });
  assert.strictEqual((await api.me(env, again.cookie)).status, 200);
  assert.strictEqual((await api.me(env, second.cookie)).status, 401, 'taking it back ends the other device');
  // A registration signs in too, and holds exactly one session for its new account.
  const reg = await api.register(env, { u: 'SOLOPLAYER', p: 'soloplayer-password' });
  assert.strictEqual(reg.status, 201);
  assert.strictEqual((await api.me(env, reg.cookie)).status, 200);
  const rows = sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = 'SOLOPLAYER')").get();
  assert.strictEqual(rows.n, 1, 'a fresh account holds one session row');
  globalThis.__friend = again.cookie;
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
  // v397: the restore revokes sessions, so this test signs the player back in the way the game does.
  globalThis.__friend = (await api.login(env, { u: 'FRIEND', p: 'brand-new-password' })).cookie;
  const nowSave = await api.getSave(env, globalThis.__friend);
  assert.strictEqual(nowSave.data.version, restored.data.version, 'the restore is a new version on top');
  const rows = sqlite.prepare('SELECT COUNT(*) AS n FROM save_history WHERE user_id = ?').get(friendId);
  assert.ok(rows.n >= 2, 'the overwritten save is still recoverable');
  assert.strictEqual((await api.act(env, owner, { id: friendId, action: 'restore', version: 999999 })).status, 404);
  // v394: the restored blob must say it came from a restore, or an open tab rebases its (bigger)
  // pre-restore save straight back on top and the restore is gone seconds later.
  const stamp = JSON.parse(nowSave.data.blob).gmRestore;
  assert.ok(stamp && Number.isFinite(Number(stamp.at)), 'the restored save is stamped with the restore');
  assert.strictEqual(Number(stamp.from), Number(backup.version), 'and names the backup it came from');
  const backupBlob = JSON.parse(sqlite.prepare('SELECT blob FROM save_history WHERE user_id = ? AND version = ?')
    .get(friendId, backup.version).blob);
  assert.strictEqual(JSON.parse(nowSave.data.blob).lv, backupBlob.lv, 'the restored figures are what the account now holds');
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
  // v396: FRIEND carries a GM restore fence from the backup test above, so this push must carry the
  // stamp forward the way a device that adopted the restore does - otherwise the fence refuses it,
  // which is the whole point of the fence.
  const fence = JSON.parse((await api.getSave(env, friend)).data.blob).gmRestore;
  const evil = JSON.stringify(Object.assign({ lv: 999999, cls: 'x'.repeat(500), zeny: -50, kills: 1e12, pets: [] },
    fence ? { gmRestore: fence } : {}));
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

await T('a stale tab cannot write its save onto another account (the shared cookie)', async () => {
  // Real incident: the GM's character appeared on a player's account. The GM tab was still open, the
  // browser's one session cookie had moved to the player, and the tab's save went out under the player.
  const { env: e4 } = freshEnv();
  await api.register(e4, { u: 'OWNERGM', p: 'owner-password-1' });
  const second = await api.register(e4, { u: 'SECONDAC', p: 'second-password-2' });
  await api.putSave(e4, second.cookie, { version: 0, blob: saveBlob(12, 350), savedAt: 1 });
  const stale = await api.putSave(e4, second.cookie, { owner: 'OWNERGM', version: 1, blob: saveBlob(150, 999999), savedAt: 2 });
  assert.strictEqual(stale.status, 409, 'refused');
  assert.strictEqual(stale.data.accountMismatch, true, 'the client is told why');
  assert.strictEqual(stale.data.owner, 'SECONDAC', 'and whose session it is');
  const after = await api.getSave(e4, second.cookie);
  assert.strictEqual(JSON.parse(after.data.blob).lv, 12, 'the other account keeps its own character');
  assert.strictEqual(after.data.version, 1, 'and its version did not move');
});

await T('a write must name its account, and every save or gift read names its owner', async () => {
  const { env: e5 } = freshEnv();
  const me = await api.register(e5, { u: 'NAMED', p: 'named-password-1' });
  const noOwner = await api.putSave(e5, me.cookie, { owner: undefined, version: 0, blob: saveBlob(10, 1), savedAt: 1 });
  assert.strictEqual(noOwner.status, 400, 'an out-of-date page is told to reload, not silently accepted');
  assert.strictEqual((await api.getSave(e5, me.cookie)).data.blob, null, 'nothing was written');
  const ok = await api.putSave(e5, me.cookie, { version: 0, blob: saveBlob(10, 1), savedAt: 1 });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await api.getSave(e5, me.cookie)).data.owner, 'NAMED');
  assert.strictEqual((await api.grants(e5, me.cookie)).data.owner, 'NAMED');
});

// ------------------------------------------- the v88.6 save-owner stamp ----
// Every save names the account it belongs to, inside the save. The server stores that stamp as sent,
// refuses to store a save stamped for anyone else, and never hands one out.
await T('v88.6: the stored save carries the account it belongs to, and the owner is the signed-in name', async () => {
  const { env: e6 } = freshEnv();
  const me = await api.register(e6, { u: 'STAMPME', p: 'stamp-password-1' });
  const ok = await api.putSave(e6, me.cookie, { version: 0, blob: saveBlob(10, 1), savedAt: 1 });
  assert.strictEqual(ok.status, 200);
  const got = await api.getSave(e6, me.cookie);
  assert.strictEqual(JSON.parse(got.data.blob).owner, 'STAMPME', 'the save records its account');
  assert.strictEqual(got.data.owner, 'STAMPME');
});

await T('v88.6: a save with no stamp is refused as out of date, and nothing is written', async () => {
  const { env: e7 } = freshEnv();
  const me = await api.register(e7, { u: 'NOSTAMP', p: 'nostamp-password' });
  const r = await api.putRaw(e7, me.cookie, { owner: 'NOSTAMP', version: 0, blob: saveBlob(10, 1), savedAt: 1 });
  assert.strictEqual(r.status, 400, 'an unstamped save is refused');
  assert.match(r.data.err, /out of date/, 'and the page is told to reload');
  assert.strictEqual((await api.getSave(e7, me.cookie)).data.blob, null, 'nothing was written');
});

await T('v88.6: a save stamped for another account is refused on write, and the account keeps its own', async () => {
  const { env: e8 } = freshEnv();
  await api.register(e8, { u: 'OWNERX', p: 'owner-password-x' });
  const mine = await api.register(e8, { u: 'MINEX', p: 'mine-password-x1' });
  await api.putSave(e8, mine.cookie, { version: 0, blob: saveBlob(12, 350), savedAt: 1 });
  // the tab names MINEX (the account it is playing), but the save inside is stamped OWNERX
  const foreign = JSON.stringify(Object.assign(JSON.parse(saveBlob(150, 999999)), { owner: 'OWNERX' }));
  const r = await api.putRaw(e8, mine.cookie, { owner: 'MINEX', version: 1, blob: foreign, savedAt: 2 });
  assert.strictEqual(r.status, 409, 'refused');
  assert.strictEqual(r.data.saveMismatch, true, 'the client is told it is a save-owner refusal');
  assert.strictEqual(r.data.owner, 'MINEX', 'and whose session it is - never the other account\'s name');
  assert.ok(!JSON.stringify(r.data).includes('OWNERX'), 'the other account\'s name is not sent back');
  const after = await api.getSave(e8, mine.cookie);
  assert.strictEqual(JSON.parse(after.data.blob).lv, 12, 'the account keeps its own character');
  assert.strictEqual(after.data.version, 1, 'and its version did not move');
});

await T('v88.6: the stamp is compared without regard to case, like every account name', async () => {
  const { env: e9 } = freshEnv();
  const me = await api.register(e9, { u: 'CaseName', p: 'case-password-1' });
  const r = await api.putRaw(e9, me.cookie, { owner: 'CASENAME', version: 0, blob: JSON.stringify(Object.assign(JSON.parse(saveBlob(10, 1)), { owner: 'casename' })), savedAt: 1 });
  assert.strictEqual(r.status, 200, 'a stamp in another case is the same account');
});

// v280 (owner): renaming an account must not lock it out of its own save. The `owner` stamp is the
// account's NAME, which is mutable data, while the row is already keyed by users.id - so after a
// rename `savedElsewhere()` fires on the account's OWN save and every read and write 409s forever.
// Reproduced from the owner's server: register -> sync -> rename -> GET returns saveMismatch.
await T('v280: an account keeps its save across a rename', async () => {
  const h = freshEnv();
  const me = await api.register(h.env, { u: 'BEFORE', p: 'a-long-password-1' });
  const put = await api.putSave(h.env, me.cookie, { version: 0, blob: saveBlob(14, 18005), savedAt: 1 });
  assert.strictEqual(put.status, 200, 'the first sync lands');

  // the rename itself, exactly as the D1 console does it
  h.sqlite.prepare("UPDATE users SET username = 'AFTER', gm = 2 WHERE username = 'BEFORE'").run();

  const got = await api.getSave(h.env, me.cookie);
  assert.strictEqual(got.status, 200, 'the renamed account can still READ its save');
  assert.strictEqual(JSON.parse(got.data.blob).lv, 14, 'and it is the same character');
  assert.strictEqual(got.data.owner, 'AFTER', 'the response names the new account');

  const next = await api.putSave(h.env, me.cookie, { version: got.data.version, blob: saveBlob(15, 18006), savedAt: 2 });
  assert.strictEqual(next.status, 200, 'and can still WRITE it');

  const id = h.sqlite.prepare("SELECT id FROM users WHERE username = 'AFTER'").get().id;
  const stored = JSON.parse(h.sqlite.prepare('SELECT blob FROM saves WHERE user_id = ?').get(id).blob);
  assert.strictEqual(stored.lv, 15, 'the new level is stored');
  assert.strictEqual(stored.owner, 'AFTER', 'and the stamp has been moved to the new name, exactly once');
  // The durable half of the stamp. Without this the fix looks green while writing nothing that
  // survives the NEXT rename - the write has to carry the account id, not just the new name.
  assert.strictEqual(stored.accountId, id, 'the durable account id is written into the stored save');
});

await T('v88.6: a stored save that names another account is never handed out, and never written over', async () => {
  const h = freshEnv();
  const me = await api.register(h.env, { u: 'VICTIM', p: 'victim-password-1' });
  await api.putSave(h.env, me.cookie, { version: 0, blob: saveBlob(20, 5), savedAt: 1 });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('VICTIM').id;
  // something other than the page put another account's save into this row (a bad restore, a DB edit)
  h.sqlite.prepare('UPDATE saves SET blob = ? WHERE user_id = ?')
    .run(JSON.stringify(Object.assign(JSON.parse(saveBlob(99, 9)), { owner: 'SOMEONE' })), id);
  const got = await api.getSave(h.env, me.cookie);
  assert.strictEqual(got.status, 409, 'the foreign save is not handed out, even to its own row\'s session');
  assert.strictEqual(got.data.saveMismatch, true);
  assert.strictEqual(got.data.blob, undefined, 'and its contents are not sent');
  const put = await api.putSave(h.env, me.cookie, { version: 1, blob: saveBlob(21, 6), savedAt: 2 });
  assert.strictEqual(put.status, 409, 'and it is not overwritten either');
  assert.strictEqual(put.data.saveMismatch, true);
  const still = h.sqlite.prepare('SELECT blob, version FROM saves WHERE user_id = ?').get(id);
  assert.strictEqual(JSON.parse(still.blob).owner, 'SOMEONE', 'the stored save is exactly as it was');
  assert.strictEqual(still.version, 1);
});

await T('v88.6: a save written before the stamp existed still loads, and is stamped on its next write', async () => {
  const h = freshEnv();
  const me = await api.register(h.env, { u: 'LEGACYAC', p: 'legacy-password-1' });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('LEGACYAC').id;
  // a row from before v88.6: no stamp inside the save. Its away baseline is "just now", so no offline
  // claim is due and this test is only about the stamp.
  const now = Date.now();
  h.sqlite.prepare(`INSERT INTO saves(user_id, version, blob, saved_at, updated_at, last_seen, rate_kph,
                      kills_total, level, cls, zeny, playtime) VALUES(?, 3, ?, ?, ?, ?, 0, 7, 20, 'Novice', 0, 0)`)
    .run(id, saveBlob(20, 5), now, now, now);
  const got = await api.getSave(h.env, me.cookie);
  assert.strictEqual(got.status, 200, 'an unstamped save is not locked out by the upgrade');
  assert.strictEqual(JSON.parse(got.data.blob).lv, 20);
  const next = await api.putSave(h.env, me.cookie, { version: 3, blob: got.data.blob, savedAt: 2 });
  assert.strictEqual(next.status, 200, 'the page writes it back with its stamp');
  assert.strictEqual(JSON.parse((await api.getSave(h.env, me.cookie)).data.blob).owner, 'LEGACYAC');
});

await T('v88.6: the GM cannot restore another account\'s backup onto a player, but can restore that player\'s own', async () => {
  const h = freshEnv();
  const owner = (await api.register(h.env, { u: 'KzeR', p: 'owner-password-1' })).cookie;
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='KzeR'").run();
  const player = await api.register(h.env, { u: 'PLAYERR', p: 'player-password-1' });
  await api.putSave(h.env, player.cookie, { version: 0, blob: saveBlob(15, 5), savedAt: 1 });
  const pid = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('PLAYERR').id;
  // a backup row that names somebody else, filed under the player's history
  h.sqlite.prepare('INSERT OR REPLACE INTO save_history(user_id, version, blob, saved_at) VALUES(?, 7, ?, 1)')
    .run(pid, JSON.stringify(Object.assign(JSON.parse(saveBlob(80, 1)), { owner: 'SOMEONE' })));
  const bad = await api.act(h.env, owner, { id: pid, action: 'restore', version: 7 });
  assert.strictEqual(bad.status, 409, 'a backup stamped for another account is refused');
  assert.strictEqual(JSON.parse(h.sqlite.prepare('SELECT blob FROM saves WHERE user_id = ?').get(pid).blob).lv, 15,
    'the live save is untouched');
  const good = await api.act(h.env, owner, { id: pid, action: 'restore', version: 1 });
  assert.strictEqual(good.status, 200, 'the player\'s own backup restores as before');
  // v397: the restore revokes the player's sessions, so read the save back the way they would - signed in.
  const again = await api.login(h.env, { u: 'PLAYERR', p: 'player-password-1' });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(JSON.parse((await api.getSave(h.env, again.cookie)).data.blob).owner, 'PLAYERR');
});

// ------------------------------------------- the v82 usage diet (D1 writes) ----
// Rows written is the hardest free-plan limit (100,000/day, then D1 stops answering for the rest of
// the day), so the number of writes per sync is pinned here rather than left to review.
await T('an accepted sync writes the save row exactly once', async () => {
  const h = freshEnv();
  const me = await api.register(h.env, { u: 'DIET', p: 'diet-password-1' });
  assert.strictEqual((await api.putSave(h.env, me.cookie, { version: 0, blob: saveBlob(10, 5), savedAt: 1 })).status, 200);
  const inserted = h.stats.byTable.saves || 0;
  assert.strictEqual(inserted, 1, 'the first save is one INSERT, got ' + inserted);
  const before = h.stats.byTable.saves || 0;
  const r = await api.putSave(h.env, me.cookie, { version: 1, blob: saveBlob(11, 6), savedAt: 2 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((h.stats.byTable.saves || 0) - before, 1,
    'one accepted sync must write the saves row once - a second UPDATE (the old per-request last_seen touch) doubles every player\'s daily writes. Statements were: ' + h.stats.sql.join(' | '));
  // ...and the away baseline still moved (it is written by that same UPDATE).
  const row = h.sqlite.prepare('SELECT last_seen, version FROM saves WHERE user_id = ?').get(
    h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('DIET').id);
  assert.strictEqual(row.version, 2);
  assert.ok(row.last_seen > 1, 'the accepted save carries the new last_seen with it');
});

// ------------------------------------------ the v410 CPU diet (JSON parses) ----
// Parsing the save blob is the most expensive thing a sync does, and on the free plan a request that
// spends too much CPU is killed mid-flight (docs/CPU-LIMIT.md). Before v410 an accepted PUT parsed
// the same blob SIX times - the body, checkSaveBlob, saveBelongsTo, storedRestoreAt,
// withSaveIdentity and a final storedSave re-parse - and stringified it twice. Only three parses are
// irreducible: the request envelope, the incoming save, and the stored row. Pin that, so a future
// helper cannot quietly reintroduce a full re-read of up to 512 KB per sync.
await T('an accepted sync parses the save blob once per side, not six times', async () => {
  const h = freshEnv();
  const me = await api.register(h.env, { u: 'PARSE', p: 'parse-password-1' });
  // A save big enough that the instrumentation threshold (8 KB) sees it.
  const big = JSON.parse(saveBlob(30, 999));
  big.inv = Array.from({ length: 300 }, (_, i) => ({
    id: 'it' + i, name: 'Salvaged Blade ' + i, slot: 'weapon', wt: 'sword', tier: 4, val: 900 + i,
    aff: [{ k: 'atk', v: 900 }, { k: 'crit', v: 120 }], slots: 2, cards: [], sec: 6, lvl: 120, quality: 5, r: 10,
  }));
  let blob = JSON.stringify(big);
  assert.ok(blob.length > 8192, 'the fixture must be over the 8 KB instrumentation threshold');
  const first = await api.putSave(h.env, me.cookie, { version: 0, blob });
  assert.strictEqual(first.status, 200, 'the fixture save must be accepted');
  // Take the STORED blob as the fixture: it already carries the owner/accountId stamp, so the
  // second push is a byte-for-byte straight sync with nothing for the server to re-stamp.
  blob = h.sqlite.prepare('SELECT blob FROM saves WHERE user_id = (SELECT id FROM users WHERE username = ?)')
    .get('PARSE').blob;

  const parse = JSON.parse, stringify = JSON.stringify;
  let parses = 0, strings = 0;
  JSON.parse = function (v, ...rest) { if (typeof v === 'string' && v.length > 8192) parses++; return parse.call(this, v, ...rest); };
  JSON.stringify = function (v, ...rest) { const out = stringify.call(this, v, ...rest); if (typeof out === 'string' && out.length > 8192) strings++; return out; };
  let accepted;
  try {
    // putRaw sends the body EXACTLY as given: api.putSave would run the harness's own stampFor()
    // helper, and that helper's two parses are this test's bookkeeping, not the server's CPU.
    accepted = await api.putRaw(h.env, me.cookie, { version: 1, owner: 'PARSE', blob });
  }
  finally { JSON.parse = parse; JSON.stringify = stringify; }
  assert.strictEqual(accepted.status, 200, 'the second sync must be accepted');
  // envelope + incoming save + stored row = 3. (The stored-row parse is what saveBelongsTo and the
  // restore fence share; it is one parse, not two.)
  assert.strictEqual(parses, 3,
    'an accepted sync must not parse the save blob more than three times (envelope, incoming, stored); saw ' + parses);
  assert.strictEqual(strings, 1,
    'an accepted sync must stringify the save blob at most once; saw ' + strings);
});

await T('a conflict (or a claim demand) still moves the away baseline', async () => {
  const h = freshEnv();
  const me = await api.register(h.env, { u: 'BASELINE', p: 'baseline-password' });
  await api.putSave(h.env, me.cookie, { version: 0, blob: saveBlob(10, 5), savedAt: 1 });
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('BASELINE').id;
  const stale = Date.now() - 60000;                   // a minute ago: under the 3-minute claim window
  h.sqlite.prepare('UPDATE saves SET last_seen = ? WHERE user_id = ?').run(stale, id);
  const conflict = await api.putSave(h.env, me.cookie, { version: 99, blob: saveBlob(12, 7), savedAt: 3 });
  assert.strictEqual(conflict.status, 409);
  const after = h.sqlite.prepare('SELECT last_seen FROM saves WHERE user_id = ?').get(id).last_seen;
  assert.ok(after > stale, 'a refused sync must still move the baseline, or retry time counts as away time');
});

await T('the usage card is GM-only, and without an Analytics token it still answers', async () => {
  const { env: e4, sqlite: db4 } = freshEnv();
  const owner = (await api.register(e4, { u: 'KzeR', p: 'owner-password-1' })).cookie;
  db4.prepare("UPDATE users SET gm=2 WHERE username='KzeR'").run();
  const player = (await api.register(e4, { u: 'PLAYER', p: 'player-password' })).cookie;
  assert.strictEqual((await api.usage(e4, null)).status, 401);
  assert.strictEqual((await api.usage(e4, player)).status, 403, 'a player must not read the account usage');
  await api.putSave(e4, player, { version: 0, blob: saveBlob(30, 1234), savedAt: 1 });
  const r = await api.usage(e4, owner);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.source, 'ledger', 'no token -> our own books, never a fabricated number');
  assert.strictEqual(r.data.requests, null, 'an unmeasured counter must be null, not zero');
  assert.strictEqual(r.data.d1, null);
  assert.strictEqual(r.data.ledger.accounts, 2);
  assert.strictEqual(r.data.ledger.saves, 1);
  assert.ok(r.data.ledger.saveBytes > 100, 'the save size is part of the ledger');
  assert.ok(/CF_ANALYTICS_TOKEN/.test(r.data.hint || ''), 'the card must say how to switch the real numbers on');
  assert.strictEqual(r.data.limits.rowsWritten, 100000);
});

await T('the usage card reads Cloudflare\'s own counters when the token is set', async () => {
  const h = freshEnv();
  const owner = (await api.register(h.env, { u: 'OWNER', p: 'owner-password-1' })).cookie;
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='OWNER'").run();
  const realFetch = globalThis.fetch;
  const seenQueries = [];
  let doSeen = null;
  let cpuSeen = null;
  globalThis.fetch = async (url, init) => {
    const bodyText = String(init?.body || '');
    const isDo = bodyText.includes('durableObjectsInvocationsAdaptiveGroups');
    const isCpu = bodyText.includes('pagesFunctionsInvocationsAdaptiveGroups');
    if (isDo) doSeen = { url: String(url), init };
    else if (isCpu) cpuSeen = { url: String(url), init };
    else seenQueries.push({ url: String(url), init, body: JSON.parse(bodyText) });
    if (isCpu) return {
      ok: true, status: 200,
      json: async () => ({ data: { viewer: { accounts: [{
        workersInvocationsAdaptive: [{ sum: { requests: 4, errors: 0, cpuTimeUs: 2000 }, quantiles: { cpuTimeP50: 400, cpuTimeP99: 900 }, dimensions: { datetimeHour: '2026-11-15T05', status: 'success' } }],
        pagesFunctionsInvocationsAdaptiveGroups: [{ sum: { requests: 90, errors: 9 }, quantiles: { cpuTimeP50: 3000, cpuTimeP99: 10000 }, dimensions: { datetimeHour: '2026-11-15T05', status: 'exceededResources' } }],
      }] } } }),
    };
    if (isDo) return {
      ok: true, status: 200,
      json: async () => ({ data: { viewer: { accounts: [{
        durableObjectsInvocationsAdaptiveGroups: [{ sum: { requests: 70 } }, { sum: { requests: 12 } }],
        durableObjectsStorageGroups: [{ max: { storedBytes: 4096 } }],
      }] } } }),
    };
    return {
      ok: true, status: 200,
      json: async () => ({ data: { viewer: { accounts: [{
        // Two invocation rows (one per status) and one D1 row: the card must ADD them up.
        workersInvocationsAdaptive: [{ sum: { requests: 120, errors: 0 } }, { sum: { requests: 30, errors: 4 } }],
        d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 900, rowsWritten: 61, readQueries: 9, writeQueries: 6 } }],
      }] } } }),
    };
  };
  try {
    const r = await api.usage({ ...h.env, CF_ACCOUNT_ID: 'acct-123', CF_ANALYTICS_TOKEN: 'tok-abc' }, owner);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.source, 'analytics');
    assert.strictEqual(r.data.requests.used, 150, 'the rows are summed, not just the first one read');
    assert.strictEqual(r.data.requests.errors, 4);
    assert.strictEqual(r.data.d1.rowsWritten, 61);
    assert.ok(seenQueries.length >= 2 && seenQueries[0].url.includes('/client/v4/graphql'), 'it must ask Cloudflare, not guess');
    assert.match(seenQueries[0].init.headers.Authorization, /^Bearer tok-abc$/);
    assert.ok(!JSON.stringify(r.data).includes('tok-abc'), 'the token must never come back in a response');
    const workersReq = seenQueries.find(s => s.body.query.includes('workersInvocationsAdaptive'));
    const d1Req = seenQueries.find(s => s.body.query.includes('d1AnalyticsAdaptiveGroups'));
    assert.ok(workersReq && d1Req, 'both workers and D1 datasets are queried');
    assert.match(workersReq.body.variables.dayStart, /T00:00:00\.000Z$/, 'the free-plan day starts at midnight UTC');
    // v403: the Durable Object meter is present, summed across its rows, and never folded into the
    // request count above - a wrong field there must not corrupt the numbers that were already right.
    assert.ok(doSeen, 'a separate Durable Object query is made');
    assert.ok(JSON.parse(doSeen.init.body).query.includes('durableObjectsStorageGroups'));
    assert.strictEqual(r.data.objects.requests, 82, 'DO request rows are summed');
    assert.strictEqual(r.data.objects.storedBytes, 4096, 'stored bytes come through');
    assert.strictEqual(r.data.requests.used, 150, 'the DO query did not disturb the request total');
    // v411: the CPU card is a third, isolated query. It must report the kills and lead with Pages,
    // because that is where /api/* actually lives - the Workers line alone shows 4 requests and
    // would call this a calm day.
    assert.ok(cpuSeen, 'a separate CPU query is made');
    const cpuBody = JSON.parse(cpuSeen.init.body);
    assert.match(cpuBody.query, /pagesFunctionsInvocationsAdaptiveGroups/);
    assert.match(cpuBody.query, /cpuTimeUs/);
    assert.equal(r.data.cpu.verdict.kills, 9, 'the kills are counted from exceededResources');
    assert.equal(r.data.cpu.verdict.source, 'Pages Functions', 'the lead dataset is the game traffic');
    assert.equal(r.data.cpu.limitUs, 10000);
    assert.equal(r.data.requests.used, 150, 'the CPU query did not disturb the request total either');
  } finally { globalThis.fetch = realFetch; }
});

await T('a failed Durable Object query leaves the request and D1 numbers intact', async () => {
  // v403: the DO meter is a second, optional query. If Cloudflare renames a field there, the card must
  // still show requests and D1 rather than blanking out - that is why it is not folded into the first.
  const h = freshEnv();
  const owner = (await api.register(h.env, { u: 'OWNER', p: 'owner-password-1' })).cookie;
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='OWNER'").run();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(init?.body || '').includes('durableObjectsInvocationsAdaptiveGroups'))
      return { ok: false, status: 400, json: async () => ({ errors: [{ message: 'Unknown field durableObjectsStorageGroups' }] }) };
    return { ok: true, status: 200, json: async () => ({ data: { viewer: { accounts: [{
      workersInvocationsAdaptive: [{ sum: { requests: 200, errors: 1 } }],
      d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 5000, rowsWritten: 22, readQueries: 1, writeQueries: 1 } }],
    }] } } }) };
  };
  try {
    const r = await api.usage({ ...h.env, CF_ACCOUNT_ID: 'acct-123', CF_ANALYTICS_TOKEN: 'tok-abc-do-fail' }, owner);
    assert.strictEqual(r.status, 200, 'the card still answers');
    assert.strictEqual(r.data.requests.used, 200, 'request numbers survive a DO failure');
    assert.strictEqual(r.data.d1.rowsWritten, 22, 'D1 numbers survive a DO failure');
    assert.strictEqual(r.data.objects, null, 'the DO meter reports unknown, never zero');
  } finally { globalThis.fetch = realFetch; }
});

await T('a broken Analytics token degrades to the ledger instead of breaking the console', async () => {
  const h = freshEnv();
  const owner = (await api.register(h.env, { u: 'OWNER', p: 'owner-password-1' })).cookie;
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='OWNER'").run();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ errors: [{ message: 'Authentication error' }] }) });
  try {
    const r = await api.usage({ ...h.env, CF_ACCOUNT_ID: 'acct-123', CF_ANALYTICS_TOKEN: 'bad' }, owner);
    assert.strictEqual(r.status, 200, 'the GM console must still load');
    assert.strictEqual(r.data.source, 'ledger');
    assert.match(r.data.error, /Authentication error/);
    assert.ok(r.data.ledger.accounts >= 1);
  } finally { globalThis.fetch = realFetch; }
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


// ------------------------------------------- the GM restore fence (v396) ----
// Every one of these runs on its own database: the fence is a property of one account's row.
const fenceEnv = async (name) => {
  const h = freshEnv();
  const reg = await api.register(h.env, { u: name, p: 'fence-password-' + name });
  assert.strictEqual(reg.status, 201, 'registering ' + name);
  // an OWNER to perform GM actions: the first account on a fresh database may promote itself
  const ownerReg = await api.register(h.env, { u: 'FENCEGM', p: 'fence-gm-password' });
  const ownerId = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get('FENCEGM').id;
  h.sqlite.prepare('UPDATE users SET gm = 2 WHERE id = ?').run(ownerId);
  const owner = ownerReg.cookie;
  const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get(name).id;
  return { h, env: h.env, sqlite: h.sqlite, cookie: reg.cookie, owner, id };
};

await T('v396: a restore locks the account against a stale tab, and only the GM can lift it', async () => {
  const { env, sqlite, cookie, owner, id } = await fenceEnv('Fence');
  // The player grinds and syncs: v1, the big pre-restore Zeny figure.
  const pre = await api.putSave(env, cookie, { version: 0, blob: saveBlob(150, 33300000), savedAt: 1 });
  assert.strictEqual(pre.status, 200, 'the first save lands');
  assert.strictEqual(pre.data.version, 1);

  // A backup of an earlier, smaller save is what the GM rolls the account back to.
  const earlier = JSON.stringify(Object.assign(JSON.parse(saveBlob(120, 12000000)), { owner: 'Fence' }));
  sqlite.prepare('INSERT OR REPLACE INTO save_history(user_id,version,blob,saved_at) VALUES (?,?,?,?)')
    .run(id, 900, earlier, Date.now());
  const restored = await api.act(env, owner, { id, action: 'restore', version: 900 });
  assert.strictEqual(restored.status, 200, 'the restore is accepted');
  assert.strictEqual(restored.data.sessionsRevoked, true, 'and it signs the account out (v397)');
  const fenceV = restored.data.version;
  // v397: sign in again, the way the player does - the fence is what stops the stale copy, not the session.
  const back = await api.login(env, { u: 'Fence', p: 'fence-password-Fence' });
  assert.strictEqual(back.status, 200);
  const cookie2 = back.cookie;

  // The owner's case: a tab that never reloaded still holds the pre-restore copy and keeps pushing.
  // It presents the exact version the row is on, so nothing else in the API would stop it.
  const staleBlob = JSON.stringify(Object.assign(JSON.parse(saveBlob(150, 33300000)), { owner: 'Fence' }));
  const stale = await api.putSave(env, cookie2, { version: fenceV, blob: staleBlob, savedAt: 2 });
  assert.strictEqual(stale.status, 409, 'the stale copy is refused');
  assert.strictEqual(stale.data.restoreFenced, true, 'and it says why');
  assert.ok(stale.data.blob.includes('12000000'), 'the answer carries the restored save, so the client can adopt it');
  assert.strictEqual(stale.data.version, fenceV, 'the row did not move');

  const after = await api.getSave(env, cookie2);
  assert.ok(after.data.blob.includes('12000000'), 'the account still holds the restored save');
  assert.ok(JSON.parse(after.data.blob).gmRestore, 'and the fence is still stamped');

  for (let i = 0; i < 3; i++) {
    const r = await api.putSave(env, cookie2, { version: fenceV, blob: staleBlob, savedAt: 3 + i });
    assert.strictEqual(r.status, 409, 'a stale tab cannot win by retrying');
  }

  // A device that DID adopt the restore carries the stamp forward, so play after the rollback saves.
  const stamp = JSON.parse(stale.data.blob).gmRestore;
  const adoptedBlob = JSON.stringify(Object.assign(JSON.parse(saveBlob(120, 12005000)), { owner: 'Fence', gmRestore: stamp }));
  const adopted = await api.putSave(env, cookie2, { version: fenceV, blob: adoptedBlob, savedAt: 4 });
  assert.strictEqual(adopted.status, 200, 'play on top of the restored save is saved normally');
  assert.strictEqual(JSON.parse((await api.getSave(env, cookie2)).data.blob).zeny, 12005000, 'and it is the new figure');

  // Only the GM can lift it.
  const unlocked = await api.act(env, owner, { id, action: 'unlock' });
  assert.strictEqual(unlocked.status, 200, 'the GM can clear the fence');
  assert.strictEqual(unlocked.data.cleared, true);
  const back2 = await api.login(env, { u: 'Fence', p: 'fence-password-Fence' });
  assert.ok(!JSON.parse((await api.getSave(env, back2.cookie)).data.blob).gmRestore, 'the stamp is gone after an unlock');
});

await T('v397: a restore signs out every open tab, so none can outlive the rollback', async () => {
  // The owner's log, in order: `login` at 11:22:20, `gm-restore` at 11:22:44. The tab was already
  // open and signed in when the rollback landed, so it kept serving the copy it had and only a
  // browser cookie reset stopped it. A restore is a statement that every copy is now wrong, so it
  // revokes the sessions rather than asking each browser to notice: the next sign-in is guaranteed
  // to run cloudJoin against the restored save.
  const { env, sqlite, cookie, owner, id } = await fenceEnv('Kicked');
  assert.strictEqual((await api.putSave(env, cookie, { version: 0, blob: saveBlob(150, 500), savedAt: 1 })).status, 200);
  const earlier = JSON.stringify(Object.assign(JSON.parse(saveBlob(120, 12000000)), { owner: 'Kicked' }));
  sqlite.prepare('INSERT OR REPLACE INTO save_history(user_id,version,blob,saved_at) VALUES (?,?,?,?)')
    .run(id, 950, earlier, Date.now());

  // The tab is still signed in and working right up to the restore.
  assert.strictEqual((await api.me(env, cookie)).status, 200, 'the tab is signed in before the restore');

  const restored = await api.act(env, owner, { id, action: 'restore', version: 950 });
  assert.strictEqual(restored.status, 200);
  assert.strictEqual(restored.data.sessionsRevoked, true, 'the restore says it revoked sessions');

  // The tab's own cookie no longer works: it cannot push, and it cannot read the account back.
  assert.strictEqual((await api.me(env, cookie)).status, 401, 'the old tab is signed out');
  const stalePush = await api.putSave(env, cookie, { version: restored.data.version, blob: saveBlob(150, 999999), savedAt: 2 });
  assert.strictEqual(stalePush.status, 401, 'a signed-out tab cannot push its copy');

  // A fresh sign-in sees the restored save - the path the tests cover end to end.
  const back = await api.login(env, { u: 'Kicked', p: 'fence-password-Kicked' });
  assert.strictEqual(back.status, 200, 'the player can sign back in');
  const nowSave = await api.getSave(env, back.cookie);
  assert.ok(nowSave.data.blob.includes('12000000'), 'and the login loads the restored copy');
});

await T('v396: a save that already carries the restore is never refused', async () => {
  const { env, sqlite, cookie, owner, id } = await fenceEnv('Fence2');
  await api.putSave(env, cookie, { version: 0, blob: saveBlob(150, 500), savedAt: 1 });
  const restoredBlob = JSON.stringify(Object.assign(JSON.parse(saveBlob(150, 100)), { owner: 'Fence2' }));
  sqlite.prepare('INSERT OR REPLACE INTO save_history(user_id,version,blob,saved_at) VALUES (?,?,?,?)')
    .run(id, 901, restoredBlob, Date.now());
  const r = await api.act(env, owner, { id, action: 'restore', version: 901 });
  assert.strictEqual(r.status, 200);
  const back = await api.login(env, { u: 'Fence2', p: 'fence-password-Fence2' });
  assert.strictEqual(back.status, 200);
  // The stamp the server actually wrote - a client reads it from the copy it adopted, never invents it.
  const stamp = JSON.parse((await api.getSave(env, back.cookie)).data.blob).gmRestore;
  assert.ok(stamp && stamp.at, 'the restore left a stamp to adopt');
  // The very next push from the device that adopted it: same stamp, more play. Allowed.
  const okBlob = JSON.stringify(Object.assign(JSON.parse(saveBlob(150, 99000)), { owner: 'Fence2', gmRestore: stamp }));
  const ok = await api.putSave(env, back.cookie, { version: r.data.version, blob: okBlob, savedAt: 2 });
  assert.strictEqual(ok.status, 200, 'the restore does not block the account forever');
});

// ---------------------------------------------------------- network bans ----
// The owner's brief (2026-11-14): a player was banned twice and came back on a new name. An
// account ban stops one name; a network ban must stop the address — and the console must show
// which accounts share a network so the second name is obvious before it is opened.
const regFrom = (env, u, p, ip) =>
  call('onRequestPost', 'api/register.js', {
    request: req('POST', '/api/register', {
      body: { u, p, email: u.toLowerCase() + '@example.test' },
      headers: ip ? { 'CF-Connecting-IP': ip } : {},
    }), env,
  });
const loginFrom = (env, u, p, ip) =>
  call('onRequestPost', 'api/sessions.js', {
    request: req('POST', '/api/sessions', {
      body: { u, p }, headers: ip ? { 'CF-Connecting-IP': ip } : {},
    }), env,
  });
const ipbans = (env, cookie, body) =>
  call('onRequestPost', 'api/gm/ipbans.js', { request: req('POST', '/api/gm/ipbans', { cookie, body }), env });
const ipbansList = (env, cookie) =>
  call('onRequestGet', 'api/gm/ipbans.js', { request: req('GET', '/api/gm/ipbans', { cookie }), env });

await T('network bans: the console sees the network, the second account on it, and bans both names off it', async () => {
  const net = freshEnv(), e = net.env, d = net.sqlite;
  const ownerReg = await api.register(e, { u: 'NETOWNER', p: 'owner-net-pass' });
  d.prepare("UPDATE users SET gm = 2 WHERE username = 'NETOWNER'").run();
  const owner = ownerReg.cookie;
  // The shape of the incident: one cheat, a second name, same home network.
  const cheat = await regFrom(e, 'X74055', 'cheat-net-pass', '198.51.100.10');
  assert.strictEqual(cheat.status, 201);
  const alt = await regFrom(e, 'RICO957', 'alt-net-pass', '198.51.100.10');
  assert.strictEqual(alt.status, 201);
  const cheatId = d.prepare("SELECT id FROM users WHERE username = 'X74055'").get().id;

  // The player panel names the network and — the point — the other account sitting on it.
  const detail = await api.player(e, owner, cheatId);
  assert.strictEqual(detail.status, 200);
  assert.strictEqual(detail.data.network.fps.length, 1, 'both sign-ins hash to one fingerprint');
  assert.ok(detail.data.network.fps[0].sources.includes('current session'), 'the live session is a source');
  assert.ok(detail.data.network.fps[0].sources.includes('sign-in log'), 'the register event records `ip <fp>`');
  assert.ok(!detail.data.network.fps[0].banned, 'nothing is banned yet');
  assert.ok(detail.data.network.shared.some(s => s.u === 'RICO957'), 'the alternate name must be surfaced');

  // Ban the network once: both names lose it.
  const ban = await api.act(e, owner, { id: cheatId, action: 'ban-ip', note: 'cheating; same net as RICO957' });
  assert.strictEqual(ban.status, 200);
  assert.strictEqual(ban.data.count, 1, 'one shared fingerprint was suspended');
  assert.match(ban.data.fps[0], /^[0-9a-f]{16}$/);

  assert.strictEqual((await loginFrom(e, 'X74055', 'cheat-net-pass', '198.51.100.10')).status, 403,
    'the cheat cannot sign in from the banned network');
  const altLogin = await loginFrom(e, 'RICO957', 'alt-net-pass', '198.51.100.10');
  assert.strictEqual(altLogin.status, 403, 'the second name is refused on the same network');
  assert.strictEqual(altLogin.data.ipBanned, true, 'and the refusal says why');
  assert.strictEqual((await regFrom(e, 'THIRDNAME', 'third-net-pass', '198.51.100.10')).status, 403,
    'a THIRD name cannot be registered from that network either');
  assert.strictEqual((await api.me(e, alt.cookie)).status, 401,
    'the alt account was signed out with the ban, mid-session');

  // The ban is the network, not the account: the same name plays from anywhere else.
  assert.strictEqual((await loginFrom(e, 'X74055', 'cheat-net-pass', '203.0.113.9')).status, 200,
    'a different network still works');

  // And the one lockout that must never happen: the owner signing in from the banned network.
  const ownerFromBanned = await loginFrom(e, 'NETOWNER', 'owner-net-pass', '198.51.100.10');
  assert.strictEqual(ownerFromBanned.status, 200, 'the owner is exempt, so a mistaken ban is fixable');

  // The audit row carries human words, the fingerprints, and the GM's own note. (The owner
  // re-signed-in from the banned network just above, so that fresh cookie is the live session.)
  const log = await api.log(e, ownerFromBanned.cookie);
  const ev = log.data.events.find(x => x.kind === 'gm-ip-ban');
  assert.ok(ev, 'gm-ip-ban must be in the log');
  assert.strictEqual(ev.label, 'Network suspended', 'every event has a human label');
  assert.ok((ev.detail || '').includes(ban.data.fps[0]), 'the detail names the fingerprint');
  assert.ok((ev.detail || '').includes('same net as RICO957'), 'the note survives into the log');
});

await T('network bans: manual suspend/restore by IP, GM-only, idempotent, and validated', async () => {
  const net = freshEnv(), e = net.env, d = net.sqlite;
  const ownerReg = await api.register(e, { u: 'NETOWNER2', p: 'owner-net-pass' });
  d.prepare("UPDATE users SET gm = 2 WHERE username = 'NETOWNER2'").run();
  const owner = ownerReg.cookie;
  const joe = await regFrom(e, 'PLAINJOE', 'plain-pass-1', '203.0.113.44');
  assert.strictEqual(joe.status, 201);

  // A player may not look at or touch the ban list.
  assert.strictEqual((await ipbansList(e, joe.cookie)).status, 403);
  assert.strictEqual((await ipbans(e, joe.cookie, { action: 'add', value: '203.0.113.44' })).status, 403);

  // The owner suspends a raw IP: it is hashed before storage, never written raw.
  const add = await ipbans(e, owner, { action: 'add', value: '203.0.113.44', note: 'alt factory' });
  assert.strictEqual(add.status, 200);
  assert.match(add.data.fp, /^[0-9a-f]{16}$/, 'the answer is a fingerprint, not the address');
  assert.strictEqual((await loginFrom(e, 'PLAINJOE', 'plain-pass-1', '203.0.113.44')).status, 403);
  assert.strictEqual((await loginFrom(e, 'PLAINJOE', 'plain-pass-1', '198.51.100.99')).status, 200,
    'other networks are untouched');

  // Adding the same network again (typed IP or pasted fingerprint) keeps one row.
  assert.strictEqual((await ipbans(e, owner, { action: 'add', value: add.data.fp })).status, 200);
  const list = await ipbansList(e, owner);
  assert.strictEqual(list.data.bans.length, 1, 'one row per network, however it is typed in');
  assert.strictEqual(list.data.bans[0].fp, add.data.fp);
  assert.strictEqual(list.data.bans[0].by, 'NETOWNER2', 'the row says who suspended it');

  // Garbage never becomes a silent useless ban.
  assert.strictEqual((await ipbans(e, owner, { action: 'add', value: 'not-an-ip!!' })).status, 400);
  assert.strictEqual((await ipbans(e, owner, { action: 'add', value: '' })).status, 400);

  // Restore, exactly once.
  assert.strictEqual((await ipbans(e, owner, { action: 'remove', fp: add.data.fp })).status, 200);
  assert.strictEqual((await ipbans(e, owner, { action: 'remove', fp: add.data.fp })).status, 404,
    'removing a network that is not banned says so');
  assert.strictEqual((await loginFrom(e, 'PLAINJOE', 'plain-pass-1', '203.0.113.44')).status, 200,
    'removing the ban reopens the network');

  // The owner can never be network-suspended through their own account, exactly like `ban`.
  const ownerId = d.prepare("SELECT id FROM users WHERE username = 'NETOWNER2'").get().id;
  const ownerDetail = await api.player(e, owner, ownerId);
  assert.strictEqual(ownerDetail.status, 200);
  assert.strictEqual((await api.act(e, owner, { id: ownerId, action: 'ban-ip' })).status, 400);
});

await T('network bans: the front door refuses every route from a banned network, except login and the owner', async () => {
  const net = freshEnv(), e = net.env, d = net.sqlite;
  const ownerReg = await api.register(e, { u: 'NETOWNER3', p: 'owner-net-pass' });
  d.prepare("UPDATE users SET gm = 2 WHERE username = 'NETOWNER3'").run();
  const owner = ownerReg.cookie;
  const cheat = await regFrom(e, 'BANME1', 'banme-net-pass', '192.0.2.77');
  assert.strictEqual(cheat.status, 201);
  const cheatId = d.prepare("SELECT id FROM users WHERE username = 'BANME1'").get().id;
  assert.strictEqual((await api.act(e, owner, { id: cheatId, action: 'ban-ip' })).status, 200);

  const mw = await import(pathToFileURL(path.join(root, 'functions', 'api', '_middleware.js')).href);
  const run = async (path, { ip, cookie, method = 'GET' } = {}) => {
    let nexted = 0;
    const r = await mw.onRequest({
      request: req(method, path, { cookie, headers: ip ? { 'CF-Connecting-IP': ip } : {} }),
      env: e,
      next: async () => { nexted++; return new Response('handler', { status: 200 }); },
    });
    return { status: r.status, nexted, body: r.headers.get('Content-Type')?.includes('json') ? await r.clone().json() : null };
  };

  // From the banned network, nothing reaches a handler — not even with a cookie in hand.
  for (const path of ['/api/save', '/api/me', '/api/board', '/api/gm/player']) {
    const r = await run(path, { ip: '192.0.2.77', cookie: cheat.cookie });
    assert.strictEqual(r.status, 403, path + ' must be refused at the front door');
    assert.strictEqual(r.nexted, 0, path + ' must never reach its handler');
  }
  assert.strictEqual((await run('/api/save', { ip: '192.0.2.77' })).body.ipBanned, true,
    'the refusal names itself so the client can explain it');

  // The login route is passed through for the handler to judge (password first, owner exempt).
  const loginRoute = await run('/api/sessions', { ip: '192.0.2.77', method: 'POST' });
  assert.strictEqual(loginRoute.nexted, 1, 'login is enforced by the login handler, not blanket-blocked');

  // The owner's session passes anywhere, so a mistaken ban can always be undone from the console.
  const ownerOk = await run('/api/save', { ip: '192.0.2.77', cookie: owner });
  assert.strictEqual(ownerOk.status, 200, 'the owner is exempt at the front door');
  assert.strictEqual(ownerOk.nexted, 1);

  // No fingerprint at all (local dev, tests without the header): behaviour is unchanged.
  const noIp = await run('/api/save', {});
  assert.strictEqual(noIp.status, 200, 'no CF-Connecting-IP means nothing to match');
  assert.strictEqual(noIp.nexted, 1);

  // An unbanned network is untouched.
  const otherIp = await run('/api/save', { ip: '198.51.100.200' });
  assert.strictEqual(otherIp.status, 200);
  assert.strictEqual(otherIp.nexted, 1);

  // And a login attempt from the banned network really is refused by the handler itself.
  const refused = await loginFrom(e, 'BANME1', 'banme-net-pass', '192.0.2.77');
  assert.strictEqual(refused.status, 403, 'the handler enforces the ban with the password checked first');
  assert.strictEqual(refused.data.ipBanned, true);
});

// ---------------------------------------------- the automatic save audit ----
// The owner (2026-11-14): "how i identify is the stats is over the limit, level to fast & alot
// of materials which the account only made in 5mins. i cant be monitoring the game myself 24
// hours." The server audits every accepted save against the game's own invariants and against
// the rate of progress since the previous one (0015), flags REVIEW-ONLY, pokes the owner in-game
// the first time a rule fires, and never lets a GM gift or an offline claim look like cheating.
import {
  auditStaticSave, auditSaveRates, creditsFromGrants, claimCredits, addCredits,
  levelsFromExp, expToNext, OFFLINE_REWARD_MULT, OFFLINE_CAP_MS, LUMP_ALLOWANCE,
  OFFLINE_LEVEL_CAP_LV, OFFLINE_LEVEL_CAP, offlineLevelCapFor, offlineExpBudget,
  COUNTERS, RATE_LIMITS,
} from '../../functions/_lib/save-audit.js';

// A save that passes every static rule (lv 60 earns far more points than this fixture spends).
const quietSave = (over = {}) => JSON.stringify(Object.assign({}, JSON.parse(saveBlob(60, 0)), { pts: 0 }, over));

t('save audit: the pure rules — impossible stats, refine ceilings, rates with claims credited', () => {
  // static impossibilities
  const evil = JSON.parse(quietSave({ st: { str: 300, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 } }));
  assert.ok(auditStaticSave(evil).some(v => v.kind === 'stat-over-cap'), 'a 300 STR at lv 60 is flagged');
  const broke = JSON.parse(quietSave({ pts: 999999 }));
  assert.ok(auditStaticSave(broke).some(v => v.kind === 'stat-points-over'), 'more points than the level earns is flagged');
  const gear = JSON.parse(quietSave({ eq: { weapon: { name: 'Dagger', sec: 0, r: 99 } } }));
  assert.ok(auditStaticSave(gear).some(v => v.kind === 'refine-over-cap'), '+99 on normal gear is flagged');
  assert.deepStrictEqual(auditStaticSave(JSON.parse(quietSave())), [], 'an honest save has no static flags');
  // rates: sub-minute windows are not judged; a 2-minute 50k-kill jump is impossible
  const prev = { kills: 7, lv: 60, zeny: 0, raw: JSON.parse(quietSave()) };
  const next = { kills: 50007, lv: 62, zeny: 0, raw: JSON.parse(quietSave({ kills: 50007, lv: 62 })) };
  assert.deepStrictEqual(auditSaveRates({ prev, next, elapsedMs: 30_000 }), [], 'too short a window proves nothing');
  const flagged = auditSaveRates({ prev, next, elapsedMs: 180_000 });
  assert.ok(flagged.some(v => v.kind === 'kill-rate'), '50k kills in two minutes is flagged');
  // the server's own offline-claim payout is never a flag
  const claimed = auditSaveRates({ prev, next, elapsedMs: 180_000, claimKills: 50_000 });
  assert.ok(!claimed.some(v => v.kind === 'kill-rate'), 'claim-credited kills are not a flag');
  // GM grants claimed inside the window are credited back
  const credits = creditsFromGrants([
    { kind: 'zeny', payload: JSON.stringify({ amount: 500_000_000 }) },
    { kind: 'level', payload: JSON.stringify({ amount: 60 }) },
    { kind: 'gift', payload: JSON.stringify({ resource: 'shards', amount: 5_000 }) },
    { kind: 'gift', payload: JSON.stringify({ resource: 'mystery', amount: 5_000 }) },
  ]);
  assert.strictEqual(credits.zeny, 500_000_000);
  assert.strictEqual(credits.levels, 60);
  assert.strictEqual(credits.resources.shards, 5_000);
  assert.strictEqual(credits.resources.mystery, undefined, 'an unrecognised resource credits nothing');
});

// The owner (2026-11-15): "the anti cheat flagging system seems to be a bit broken, most of the
// flagging are incorrect... 37 level from 2 mins, i believe its the afk reward". A welcome-back
// payout is the server's own money, and the claim's kills buy exp, Zeny and loot - not just kills.
t('save audit: the exp curve is the game\'s own, so a claim\'s exp can be priced in levels', () => {
  // Pull the real curve out of index.html: the constants line and the two arrow functions the
  // client uses to charge a level. If the page ever retunes them, this fails instead of the console
  // quietly crediting the wrong number of levels.
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const grab = re => { const m = page.match(re); assert.ok(m, 'index.html must still define ' + re); return m[0]; };
  const body = [
    'const BASE_EXP_LATE_LV=100;',
    grab(/const NA1=[^;]+;/),
    grab(/BASE_EXP_LATE_X\s*=\s*[0-9.]+/),
    grab(/const roundReq\s*=\s*n=>\{[^}]*\};/),   // its body has a ';' in it, so match the braces
    grab(/needAt=L=>[\s\S]*?(?=,baseNeedAt=)/).replace(/^needAt=/, 'const needAt = '),
    grab(/baseNeedAt=L=>[\s\S]*?(?=,need=)/).replace(/^baseNeedAt=/, 'const baseNeedAt = '),
    'return baseNeedAt;',
  ].join('\n');
  const clientNeed = new Function(body)();
  const mismatches = [];
  for (let lv = 1; lv < 150; lv++) {
    if (clientNeed(lv) !== expToNext(lv)) mismatches.push(lv + ': page ' + clientNeed(lv) + ' vs audit ' + expToNext(lv));
  }
  assert.deepStrictEqual(mismatches.slice(0, 4), [], 'the audit prices a level exactly as index.html does');
  assert.strictEqual(mismatches.length, 0);
  // and the walk agrees with the page's own checkLevel loop
  const expFor = (from, levels) => { let e = 0; for (let i = 0; i < levels; i++) e += expToNext(from + i); return e; };
  assert.strictEqual(levelsFromExp(expFor(113, 37), 113), 37, 'that much exp buys exactly 37 levels');
  assert.strictEqual(levelsFromExp(expFor(113, 37) - 1, 113), 36, 'one exp short buys one level less');
  assert.strictEqual(levelsFromExp(0, 113), 0);
});

t('save audit: a claim is half its measured minute, ten levels at most from Lv 120, and never says so', () => {
  // v408 (owner: "i would not want to have a cap level ... offline rewards should be only half of
  // the online players"), then: "can u make level 120 above, have a cap of 10 levels per offline
  // rewards. this should be hidden from players." One ceiling, above one level, enforced by both
  // sides and announced by neither.
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const grab = re => { const m = page.match(re); assert.ok(m, 'index.html must still define ' + re); return m[0]; };
  assert.match(page, /const OFFLINE_LEVEL_CAP_LV=120,OFFLINE_LEVEL_CAP=10;/, 'the page carries the 120/10 ceiling');
  assert.strictEqual(OFFLINE_LEVEL_CAP_LV, 120, 'the audit uses the same starting level');
  assert.strictEqual(OFFLINE_LEVEL_CAP, 10, 'and the same number of levels');
  // the rendered popup is checked in offline_sim against the real note string; here the old
  // "capped" sentence must simply never come back.
  assert.doesNotMatch(page, /Away EXP is capped at/, 'no popup sentence announces the ceiling');
  assert.match(page, /OFFLINE_CAP_MS=4\*60\*60\*1000,OFFLINE_REWARD_MULT=\.5,/, 'the page pays half');
  assert.strictEqual(OFFLINE_REWARD_MULT, .5, 'the audit prices the same half');
  assert.match(page, /const minutes=plan\.creditedMs\/60000\*OFFLINE_REWARD_MULT;/, 'paid minutes are credited at half rate');
  assert.match(page, /r\.exp=valid\?Math\.min\(safeCount\(income\.xp\*minutes\),levelBudget\):0/, 'the claim is held to the budget');
  assert.match(page, /r\.zeny=valid\?safeCount\(income\.zeny\*minutes\):0/, 'and Zeny is not clamped at all');
  // The page's own budget, run here, must equal the audit's for every level it can meet.
  const pageBudget = new Function([
    'const BASE_EXP_LATE_LV=100;',
    grab(/const NA1=[^;]+;/), grab(/BASE_EXP_LATE_X\s*=\s*[0-9.]+/), grab(/const roundReq\s*=\s*n=>\{[^}]*\};/),
    grab(/needAt=L=>[\s\S]*?(?=,baseNeedAt=)/).replace(/^needAt=/, 'const needAt = '),
    grab(/baseNeedAt=L=>[\s\S]*?(?=,need=)/).replace(/^baseNeedAt=/, 'const baseNeedAt = '),
    grab(/const OFFLINE_LEVEL_CAP_LV=\d+,OFFLINE_LEVEL_CAP=\d+;/),
    grab(/function offlineExpBudget\([^\n]*/),
    grab(/function offlineLevelBudget\(lv\)\{[\s\S]*?\n\}/),
    'return { offlineExpBudget, offlineLevelBudget };',
  ].join('\n'))();
  // and it starts INSIDE the claim: everything to 120, then ten levels. One claim reaches 130.
  for (const [lv, levels] of [[60, 70], [113, 17], [118, 12], [119, 11], [120, 10], [130, 10], [149, 10]]) {
    assert.strictEqual(offlineLevelCapFor(lv), levels, 'the audit allows ' + levels + ' levels from ' + lv);
    assert.strictEqual(pageBudget.offlineLevelBudget(lv), offlineExpBudget(lv, levels),
      'the page budget from Lv ' + lv + ' is the same ' + levels + ' levels');
    assert.strictEqual(pageBudget.offlineExpBudget(lv, levels), offlineExpBudget(lv, levels),
      'and it prices them the same way');
  }
});

t('save audit: a welcome-back claim credits what it paid, walked down the game curve', () => {
  const claim = { kills: 60_000, creditedMs: 4 * 60 * 60 * 1000 };
  const minutes = (OFFLINE_CAP_MS / 60_000) * OFFLINE_REWARD_MULT;   // 4 h, paid at half rate
  const paid = claimCredits({ claim, income: { version: 1, xp: 1.2e6, zeny: 300_000 }, prevLv: 113 });
  // 1.2M exp/min over 120 paid minutes is 36 levels' worth, held at the 113 -> 130 ceiling
  assert.strictEqual(paid.levels, Math.min(levelsFromExp(1.2e6 * minutes, 113), offlineLevelCapFor(113)),
    'levels are exactly the exp the payout paid, on the same curve as the page');
  assert.strictEqual(levelsFromExp(1.2e6 * minutes, 113), 36, 'the curve alone would buy 36 levels');
  assert.strictEqual(paid.levels, 17, 'the 130 ceiling is what lands it');
  assert.strictEqual(paid.zeny, Math.ceil(300_000 * minutes), 'Zeny is credited the same way');
  assert.ok(paid.resources.ori >= 1_000 && paid.resources.nmat0 >= 1_000, 'claim kills also roll loot');
  assert.strictEqual(paid.kills, 0, 'the kills themselves are credited separately, not twice');
  // the sample the owner actually saw (1.25M exp/min = 37 levels' worth) is now held at 113 -> 130
  const rich = claimCredits({ claim, income: { version: 1, xp: 1.25e6, zeny: 0 }, prevLv: 113 });
  assert.strictEqual(rich.levels, 17, 'a claim from 113 pays its seven levels to 120 plus ten');
  // from Lv 120 the same claim is worth exactly ten levels, and not one more
  const capped = claimCredits({ claim, income: { version: 1, xp: 1.25e6, zeny: 0 }, prevLv: 120 });
  assert.strictEqual(capped.levels, 10, 'ten levels is the whole claim above 120');
  const from118 = claimCredits({ claim, income: { version: 1, xp: 1.25e6, zeny: 0 }, prevLv: 118 });
  assert.strictEqual(from118.levels, 12, 'from 118 the claim pays two levels to 120 plus ten');
  assert.ok(capped.levels < rich.levels, 'the ceiling is doing the work at 120, not at 113');
  // no measured sample (an old save): the kills are priced from the game's own reference
  const priced = claimCredits({ claim, income: null, prevLv: 113 });
  assert.ok(priced.levels > 0, 'a priced claim still credits its levels');
  // a shorter absence is worth proportionally less, because fewer minutes are paid
  const half = claimCredits({ claim: { kills: 7_500, creditedMs: 30 * 60 * 1000 }, income: { version: 1, xp: 1.25e6, zeny: 0 }, prevLv: 113 });
  assert.ok(half.levels < rich.levels, 'half an hour pays fewer levels than four hours');
  assert.strictEqual(claimCredits({ claim: { kills: 0, creditedMs: 0 }, prevLv: 113 }), null, 'no claim pays nothing');
  // a claim and a GM gift in the same window add up instead of overwriting each other
  const both = addCredits(paid, creditsFromGrants([{ kind: 'gift', payload: JSON.stringify({ resource: 'ori', amount: 500 }) }]));
  assert.strictEqual(both.resources.ori, paid.resources.ori + 500);
  assert.strictEqual(both.levels, paid.levels);
});

t('save audit: the AFK payout is not a flag, but a leap past it is', () => {
  const base = JSON.parse(quietSave());
  const income = { version: 1, xp: 1.25e6, zeny: 300_000 };
  const prev = { kills: 1_000, lv: 113, zeny: 0, raw: { ...base, offlineIncome: income } };
  const claim = { kills: 60_000, creditedMs: 4 * 3600 * 1000 };
  const credits = claimCredits({ claim, income, prevLv: 113 });
  assert.strictEqual(credits.levels, 17, 'a four-hour claim from 113 is worth 17 levels, i.e. it reaches 130');
  // ...and those landing in the two minutes after the claim is the payout, not a hack.
  const modest = { kills: 61_000, lv: 130, zeny: 36_000_000, raw: { ...base, lv: 130, kills: 61_000 } };
  assert.deepStrictEqual(
    auditSaveRates({ prev, next: modest, elapsedMs: 120_000, claimKills: 60_000, credits }), [],
    'a payout the claim explains is never a flag');
  // the same save at 150 is 20 levels nothing paid for
  const past = { kills: 61_000, lv: 150, zeny: 36_000_000, raw: { ...base, lv: 150, kills: 61_000 } };
  const pastFlag = auditSaveRates({ prev, next: past, elapsedMs: 120_000, claimKills: 60_000, credits });
  assert.ok(pastFlag.some(v => v.kind === 'level-rate'), 'a jump past 130 still flags: ' + JSON.stringify(pastFlag));
  // The same 37-level jump under a half-hour claim is 25 levels nothing paid for, so it reports.
  const short = claimCredits({ claim: { kills: 7_500, creditedMs: 30 * 60 * 1000 }, income, prevLv: 113 });
  assert.strictEqual(short.levels, 12, 'half an hour at this sample is worth 12 levels');
  const flagged = auditSaveRates({ prev, next: past, elapsedMs: 120_000, claimKills: 7_500, credits: short });
  assert.ok(flagged.some(v => v.kind === 'level-rate'), 'a jump past the claim is still a flag: ' + JSON.stringify(flagged));

  // Above Lv 120 the claim pays ten levels, so a 17-level jump is 7 levels nothing paid for.
  const cappedPrev = { kills: 1_000, lv: 120, zeny: 0, raw: { ...base, lv: 120, offlineIncome: income } };
  const cappedCredits = claimCredits({ claim, income, prevLv: 120 });
  assert.strictEqual(cappedCredits.levels, 10, 'the 120+ ceiling rides into the credit');
  const ten = { kills: 61_000, lv: 130, zeny: 36_000_000, raw: { ...base, lv: 130, kills: 61_000 } };
  assert.deepStrictEqual(
    auditSaveRates({ prev: cappedPrev, next: ten, elapsedMs: 120_000, claimKills: 60_000, credits: cappedCredits }), [],
    'the ten levels the claim pays above 120 are never a flag');
  const seventeen = { kills: 61_000, lv: 137, zeny: 36_000_000, raw: { ...base, lv: 137, kills: 61_000 } };
  const overCap = auditSaveRates({ prev: cappedPrev, next: seventeen, elapsedMs: 120_000, claimKills: 60_000, credits: cappedCredits });
  assert.ok(overCap.some(v => v.kind === 'level-rate'), 'a jump past ten levels above 120 still flags: ' + JSON.stringify(overCap));

  // Fishing Fishcoins and DigiPet Pet Coins are minigames and are never judged at all (owner,
  // 2026-11-15: "i think we dont need to be in the flag, these are mini games. i dont think
  // cheating in this does any good").
  const fish = (coins) => ({ ...base, fishing: { coins } });
  for (const gain of [300_000, 1_000_000, 300_000_000]) {
    const sale = auditSaveRates({
      prev: { kills: 0, lv: 113, zeny: 0, raw: fish(1_000_000) },
      next: { kills: 0, lv: 113, zeny: 0, raw: fish(1_000_000 + gain) }, elapsedMs: 120_000,
    });
    assert.deepStrictEqual(sale, [], 'Fishcoins +' + gain.toLocaleString('en-US') + ' in two minutes is not a flag');
  }
  const pet = (coins) => ({ ...base, digimonBag: { coins } });
  assert.deepStrictEqual(auditSaveRates({
    prev: { kills: 0, lv: 113, zeny: 0, raw: pet(0) },
    next: { kills: 0, lv: 113, zeny: 0, raw: pet(500_000) }, elapsedMs: 120_000,
  }), [], 'Pet Coins landing in one jump are not a flag');
  // gone from the audit entirely, not merely unlimited: no counter, no hourly rate, no lump
  for (const key of ['fishcoins', 'petcoins']) {
    assert.ok(!(key in COUNTERS), key + ' is not a counter any more');
    assert.ok(!(key in RATE_LIMITS), key + ' has no hourly limit any more');
    assert.ok(!(key in LUMP_ALLOWANCE), key + ' has no lump allowance any more');
  }
});

await T('save audit: the away payout is credited end to end, and a leap past it still flags', async () => {
  // One account per run of the scenario; the claim is a real `offline_reward_claims` row.
  const scenario = async (name, toLv, kills, zeny, claimMs, fromLv = 113) => {
    const h = freshEnv();
    const player = await api.register(h.env, { u: name, p: 'away-password-1' });
    const id = h.sqlite.prepare('SELECT id FROM users WHERE username = ?').get(name).id;
    // a Lv 113 save carrying the measured farm sample the client prices a claim from
    const start = Object.assign(JSON.parse(saveBlob(fromLv, 0)), {
      pts: 0, offlineIncome: { version: 1, xp: 1.25e6, zeny: 300_000 },
    });
    let put = await api.putSave(h.env, player.cookie, { blob: JSON.stringify(start), version: 1 });
    assert.strictEqual(put.status, 200);
    // the claim the server would have issued for that window: 30,000 kills/h paid at half rate
    const claimKills = Math.floor(30000 * claimMs / 3600000 * .5);
    const claimId = Number(h.sqlite.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,claimed_at)
      VALUES(?,?,?,?,?,?,?,NULL)`).run(id, claimMs, claimMs, 30000, claimKills, 0, Date.now() - claimMs).lastInsertRowid);
    // the next sync is two minutes after the last one
    h.sqlite.prepare('UPDATE saves SET saved_at = saved_at - 120000, last_seen = last_seen - 120000 WHERE user_id = ?').run(id);
    const after = Object.assign({}, start, { lv: toLv, kills, zeny, offlineClaimId: claimId });
    put = await api.putSave(h.env, player.cookie, { blob: JSON.stringify(after), version: put.data.version, offlineClaimId: claimId });
    assert.strictEqual(put.status, 200, JSON.stringify(put.data).slice(0, 200));
    return h.sqlite.prepare('SELECT kind, detail FROM save_alerts').all();
  };

  // four hours at this sample pays 17 levels from 113 - 130 is inside the claim, 150 is not
  const inside = await scenario('Away', 130, 60007, 36_000_000, 4 * 3600 * 1000);
  assert.deepStrictEqual(inside, [], 'a claim-explained jump records no alert');
  const past = await scenario('AwayPast', 150, 60007, 36_000_000, 4 * 3600 * 1000);
  assert.ok(past.some(a => a.kind === 'level-rate'), 'a jump past 130 still flags: ' + JSON.stringify(past));

  // the same jump under a half-hour claim is 12 levels the claim cannot pay
  const leap = await scenario('AwayLeap', 150, 60007, 36_000_000, 30 * 60 * 1000);
  assert.ok(leap.some(a => a.kind === 'level-rate'), 'a leap past the claim still flags: ' + JSON.stringify(leap));

  // From Lv 120 the claim is worth ten levels: 130 is paid for, 137 is not
  const capped = await scenario('AwayCapped', 130, 60007, 36_000_000, 4 * 3600 * 1000, 120);
  assert.deepStrictEqual(capped, [], 'the ten levels a 120+ claim pays records no alert');
  const overCap = await scenario('AwayOverCap', 137, 60007, 36_000_000, 4 * 3600 * 1000, 120);
  assert.ok(overCap.some(a => a.kind === 'level-rate'), 'a jump past ten levels above 120 flags: ' + JSON.stringify(overCap));
});

await T('save audit: an impossible save still stores, and the FIRST flag pokes the owner in-game', async () => {
  const h = freshEnv();
  const owner = await api.register(h.env, { u: 'AuditOwner', p: 'owner-password-1' });
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='AuditOwner'").run();
  const sus = await api.register(h.env, { u: 'Suspect', p: 'suspect-password-1' });
  const evil = JSON.stringify(Object.assign(JSON.parse(saveBlob(50, 0)), { st: { str: 300, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 } }));
  const put = await api.putSave(h.env, sus.cookie, { blob: evil, version: 1 });
  assert.strictEqual(put.status, 200, 'flags never reject a save: ' + JSON.stringify(put.data));
  const alerts = h.sqlite.prepare('SELECT kind, threshold FROM save_alerts').all();
  assert.ok(alerts.some(a => a.kind === 'stat-over-cap'), 'the impossible stat is recorded');
  const msgs = h.sqlite.prepare(`SELECT body FROM messages WHERE target_user=(SELECT id FROM users WHERE username='AuditOwner')`).all();
  assert.ok(msgs.length >= 1, 'the owner is poked in-game');
  assert.match(msgs[0].body, /Suspicious save flagged: Suspect/);
  assert.match(msgs[0].body, /review/i, 'the poke says flags are for review');
  const ev = h.sqlite.prepare(`SELECT detail FROM events WHERE kind='save-alert'`).all();
  assert.ok(ev.length >= 1, 'the player log records why');
  // the GM surface reads it back: player detail, the list marker, the audit card feed
  const id = h.sqlite.prepare(`SELECT id FROM users WHERE username='Suspect'`).get().id;
  const detail = await api.player(h.env, owner.cookie, id);
  assert.ok(Array.isArray(detail.data && detail.data.alerts), 'player detail carries alerts: ' + JSON.stringify(detail.data || {}).slice(0, 300));
  assert.ok(detail.data.alerts.some(a => a.kind === 'stat-over-cap' && a.label), 'the player panel lists the flag');
  const list = await api.players(h.env, owner.cookie);
  assert.ok(list.data.players.find(p => p.id === id)?.alerted, 'the player list marks the account');
  const audit = await call('onRequestGet', 'api/gm/audit.js', { request: req('GET', '/api/gm/audit', { cookie: owner.cookie }), env: h.env });
  assert.ok(Array.isArray(audit.data && audit.data.alerts), 'audit endpoint answers: ' + JSON.stringify(audit.data || {}).slice(0, 300));
  assert.ok(audit.data.alerts.some(a => a.username === 'Suspect' && a.kind === 'stat-over-cap'), 'the Suspicious saves card is fed');
  // a second violation of the SAME rule must not poke the owner again
  const put2 = await api.putSave(h.env, sus.cookie, { blob: JSON.stringify(Object.assign(JSON.parse(put.data.blob || evil), { st: { str: 301 } })), version: put.data.version });
  if (put2.status === 200) {
    const again = h.sqlite.prepare(`SELECT COUNT(*) n FROM messages WHERE target_user=(SELECT id FROM users WHERE username='AuditOwner')`).get().n;
    assert.strictEqual(Number(again), Number(msgs.length), 'repeat flags update the row, they do not re-poke');
  }
});

await T('save audit: too-fast kills and materials flag between syncs; honest play does not', async () => {
  const h = freshEnv();
  const owner = await api.register(h.env, { u: 'RateOwner', p: 'owner-password-1' });
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='RateOwner'").run();
  const sus = await api.register(h.env, { u: 'Speedy', p: 'speedy-password-1' });
  // honest play first: +100 kills over three minutes records nothing
  let put = await api.putSave(h.env, sus.cookie, { blob: quietSave(), version: 1 });
  assert.strictEqual(put.status, 200);
  h.sqlite.prepare(`UPDATE saves SET saved_at = saved_at - 180000 WHERE user_id=(SELECT id FROM users WHERE username='Speedy')`).run();
  put = await api.putSave(h.env, sus.cookie, { blob: JSON.stringify(Object.assign(JSON.parse(quietSave()), { kills: 107 })), version: put.data.version });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(h.sqlite.prepare(`SELECT COUNT(*) n FROM save_alerts`).get().n, 0, 'honest play must not flag');
  // now the impossible window: 50k kills and 10k shards in three minutes
  h.sqlite.prepare(`UPDATE saves SET saved_at = saved_at - 180000 WHERE user_id=(SELECT id FROM users WHERE username='Speedy')`).run();
  put = await api.putSave(h.env, sus.cookie, { blob: JSON.stringify(Object.assign(JSON.parse(quietSave()), { kills: 50107, shards: 10000 })), version: put.data.version });
  assert.strictEqual(put.status, 200, 'a flagged save is still stored');
  const kinds = h.sqlite.prepare(`SELECT kind, observations FROM save_alerts`).all().map(a => a.kind);
  assert.ok(kinds.includes('kill-rate'), 'kill rate flagged: ' + kinds);
  assert.ok(kinds.includes('rate:shards'), 'material rate flagged: ' + kinds);
  // within the 5-minute bucket a repeat counts as one observation
  h.sqlite.prepare(`UPDATE saves SET saved_at = saved_at - 180000 WHERE user_id=(SELECT id FROM users WHERE username='Speedy')`).run();
  put = await api.putSave(h.env, sus.cookie, { blob: JSON.stringify(Object.assign(JSON.parse(quietSave()), { kills: 100107, shards: 20000 })), version: put.data.version });
  assert.strictEqual(put.status, 200);
  const row = h.sqlite.prepare(`SELECT observations FROM save_alerts WHERE kind='kill-rate'`).get();
  assert.strictEqual(Number(row.observations), 1, 'coarse bucket: repeats inside it are one observation');
  // the owner's poke names the human rule, not the machine kind
  const msgs = h.sqlite.prepare(`SELECT body FROM messages WHERE target_user=(SELECT id FROM users WHERE username='RateOwner')`).all();
  assert.ok(msgs.length >= 1 && /Kill rate/.test(msgs[0].body), 'the poke is in plain language: ' + (msgs[0] && msgs[0].body));
});

await T('save audit: GM grants claimed in the window are credited, so gifts never flag the receiver', async () => {
  const h = freshEnv();
  const owner = await api.register(h.env, { u: 'GrantOwner', p: 'owner-password-1' });
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='GrantOwner'").run();
  const lucky = await api.register(h.env, { u: 'Lucky', p: 'lucky-password-1' });
  const id = h.sqlite.prepare(`SELECT id FROM users WHERE username='Lucky'`).get().id;
  let put = await api.putSave(h.env, lucky.cookie, { blob: quietSave(), version: 1 });
  assert.strictEqual(put.status, 200);
  // the owner's own tools: 500M zeny and 60 levels, claimed moments before the sync that shows them
  const g1 = await api.act(h.env, owner.cookie, { action: 'grant', id, kind: 'zeny', payload: { amount: 500000000 } });
  assert.ok(g1.status === 200, 'grant zeny: ' + JSON.stringify(g1.data));
  const g2 = await api.act(h.env, owner.cookie, { action: 'grant', id, kind: 'level', payload: { amount: 60 } });
  assert.ok(g2.status === 200, 'grant level: ' + JSON.stringify(g2.data));
  const grantIds = h.sqlite.prepare(`SELECT id FROM grants WHERE user_id=?`).all(id).map(r => r.id);
  const claimed = await api.claim(h.env, lucky.cookie, grantIds);
  assert.strictEqual(claimed.status, 200, 'the receiver claims: ' + JSON.stringify(claimed.data));
  h.sqlite.prepare(`UPDATE saves SET saved_at = saved_at - 180000 WHERE user_id=?`).run(id);
  put = await api.putSave(h.env, lucky.cookie, {
    blob: JSON.stringify(Object.assign(JSON.parse(quietSave()), { lv: 120, zeny: 500000000 })),
    version: put.data.version,
  });
  assert.strictEqual(put.status, 200, 'the gifted save is stored: ' + JSON.stringify(put.data));
  const kinds = h.sqlite.prepare(`SELECT kind FROM save_alerts`).all().map(a => a.kind);
  assert.deepStrictEqual(kinds, [], 'a claimed GM gift and a granted level never flag their receiver: ' + kinds);
});

await T('save audit: the owner account is never audited (GM tools legitimately make impossible figures)', async () => {
  const h = freshEnv();
  const owner = await api.register(h.env, { u: 'SelfAudit', p: 'owner-password-1' });
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='SelfAudit'").run();
  const evil = JSON.stringify(Object.assign(JSON.parse(saveBlob(150, 0)), { st: { str: 300 } }));
  const put = await api.putSave(h.env, owner.cookie, { blob: evil, version: 1 });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(h.sqlite.prepare(`SELECT COUNT(*) n FROM save_alerts`).get().n, 0, 'no self-noise from the owner');
  const msgs = h.sqlite.prepare(`SELECT COUNT(*) n FROM messages WHERE target_user=(SELECT id FROM users WHERE username='SelfAudit')`).get().n;
  assert.strictEqual(Number(msgs), 0, 'the owner is never mailed about their own account');
});

await T('a reviewed save-audit flag can be cleared, reopened, and reopens itself if the rule fires again', async () => {
  const h = freshEnv();
  const owner = await api.register(h.env, { u: 'ReviewOwner', p: 'owner-password-1' });
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='ReviewOwner'").run();
  const sus = await api.register(h.env, { u: 'Reviewed', p: 'reviewed-password-1' });
  const evil = n => JSON.stringify(Object.assign(JSON.parse(saveBlob(50, 0)), { st: { str: n, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 } }));
  const put = await api.putSave(h.env, sus.cookie, { blob: evil(300), version: 1 });
  assert.strictEqual(put.status, 200, 'the impossible save is stored, not rejected');
  const id = h.sqlite.prepare(`SELECT id FROM users WHERE username='Reviewed'`).get().id;
  const flag = (action, kind = 'stat-over-cap') =>
    call('onRequestPost', 'api/gm/damage.js', { request: req('POST', '/api/gm/damage', { cookie: owner.cookie, body: { id, action, kind } }), env: h.env });
  const flagged = async () => (await api.players(h.env, owner.cookie)).data.players.find(p => p.id === id)?.alerted;
  const detailFlag = async () => (await api.player(h.env, owner.cookie, id)).data.alerts.find(a => a.kind === 'stat-over-cap');

  assert.strictEqual(await flagged(), true, 'the account starts flagged');
  assert.strictEqual((await detailFlag()).cleared, false, 'an open flag reads as not cleared');

  // clearing: the verdict is recorded, the row survives, the marker goes away
  // (this save breaks more than one rule - an over-cap stat also means unearned points - so the
  // account is only unflagged once every open rule has been read and cleared.)
  const cleared = await flag('clear');
  assert.strictEqual(cleared.status, 200, JSON.stringify(cleared.data));
  assert.match(cleared.data.note, /reopens by itself/i, 'the note says a re-fire undoes the verdict');
  assert.strictEqual(await flagged(), true, 'one cleared rule does not unflag the account while another is open');
  const otherKinds = h.sqlite.prepare('SELECT kind FROM save_alerts WHERE user_id=? AND kind<>?').all(id, 'stat-over-cap').map(r => r.kind);
  assert.ok(otherKinds.length >= 1, 'the same save breaks more than one rule: ' + otherKinds.join(', '));
  for (const kind of otherKinds) assert.strictEqual((await flag('clear', kind)).status, 200, 'clearing ' + kind);
  assert.strictEqual(await flagged(), false, 'a cleared flag stops marking the account');
  const afterClear = await detailFlag();
  assert.strictEqual(afterClear.cleared, true, 'the flag is still listed, as history');
  assert.strictEqual(afterClear.clearedBy, 'ReviewOwner', 'who cleared it is recorded');
  assert.ok(Number(afterClear.clearedAt) > 0, 'when it was cleared is recorded');
  assert.strictEqual(h.sqlite.prepare('SELECT COUNT(*) n FROM save_alerts WHERE user_id=?').get(id).n, 1 + otherKinds.length, 'clearing keeps the rows - evidence is not deleted');
  const card = await call('onRequestGet', 'api/gm/audit.js', { request: req('GET', '/api/gm/audit', { cookie: owner.cookie }), env: h.env });
  assert.ok(!(card.data.alerts || []).some(a => a.user_id === id), 'the Suspicious-saves card only shows open flags');
  assert.ok(h.sqlite.prepare(`SELECT COUNT(*) n FROM events WHERE kind='gm-flag-clear'`).get().n >= 1, 'the verdict is in the audit log');

  // idempotence and rules
  assert.strictEqual((await flag('clear')).status, 409, 'clearing an already-cleared flag is refused, not silently repeated');
  assert.strictEqual((await flag('clear', 'not-a-rule')).status, 400, 'only real rules can be cleared');
  assert.strictEqual((await flag('nonsense')).status, 400, 'only clear/reopen exist');
  const asPlayer = await call('onRequestPost', 'api/gm/damage.js', { request: req('POST', '/api/gm/damage', { cookie: sus.cookie, body: { id, action: 'clear', kind: 'stat-over-cap' } }), env: h.env });
  assert.strictEqual(asPlayer.status, 403, 'a player cannot clear their own flag');

  // reopening by hand
  const reopened = await flag('reopen');
  assert.strictEqual(reopened.status, 200, JSON.stringify(reopened.data));
  assert.strictEqual(await flagged(), true, 'a reopened flag marks the account again');
  assert.strictEqual((await detailFlag()).cleared, false);
  assert.strictEqual((await flag('reopen')).status, 409, 'reopening an open flag is refused');

  // and the important one: a verdict is not an immunity - the same rule firing again reopens it
  const clearedAgain = await flag('clear');
  assert.strictEqual(clearedAgain.status, 200);
  assert.strictEqual(await flagged(), false);
  for (const kind of otherKinds) await flag('clear', kind);
  const more = await api.putSave(h.env, sus.cookie, { blob: evil(301), version: put.data.version });
  assert.strictEqual(more.status, 200, 'the second impossible save is also stored');
  const refired = h.sqlite.prepare(`SELECT cleared_at FROM save_alerts WHERE user_id=? AND kind='stat-over-cap'`).get(id);
  assert.strictEqual(refired.cleared_at, null, 'a fresh violation reopens the flag by itself');
  assert.strictEqual(await flagged(), true, 'so the marker is back on the account');
});

await T('an announcement gift also reaches accounts created after it was sent, until a GM closes it', async () => {
  const h = freshEnv();
  const owner = await api.register(h.env, { u: 'GiftOwner', p: 'owner-password-1' });
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='GiftOwner'").run();
  const early = await api.register(h.env, { u: 'WasHere', p: 'was-here-password' });
  const earlyId = h.sqlite.prepare("SELECT id FROM users WHERE username='WasHere'").get().id;
  const send = await api.act(h.env, owner.cookie, {
    id: earlyId, action: 'announce', toAll: true, kind: 'event',
    body: 'Launch week gift!', gift: { kind: 'zeny', amount: 5000 },
  });
  assert.strictEqual(send.status, 200, JSON.stringify(send.data));
  const mid = send.data.messageId;
  assert.match(send.data.note, /join later/i, 'the console is told the gift keeps going');
  const grantFor = name => h.sqlite.prepare(`SELECT g.kind, g.payload, g.batch_id FROM grants g
    JOIN users u ON u.id=g.user_id WHERE u.username=?`).all(name);

  // the account that existed at send time, as before
  assert.strictEqual(grantFor('WasHere').length, 1, 'existing accounts are paid once');

  // the account created afterwards - the actual bug (owner, 2026-11-14)
  const late = await api.register(h.env, { u: 'JoinedLater', p: 'joined-later-password' });
  const lateGrants = grantFor('JoinedLater');
  assert.strictEqual(lateGrants.length, 1, 'a later account receives the announcement gift');
  assert.strictEqual(lateGrants[0].kind, 'zeny');
  assert.strictEqual(JSON.parse(lateGrants[0].payload).amount, 5000);
  assert.strictEqual(lateGrants[0].batch_id, 'ann:' + mid, 'the same batch as the original fan-out, so nobody is paid twice');
  const lateMail = await api.messages(h.env, late.cookie);
  const letter = (lateMail.data.inbox || []).find(m => m.body === 'Launch week gift!');
  assert.ok(letter, 'and the letter is in their mail box');
  assert.ok(letter.gift, 'the letter carries the gift, not a bare message');
  assert.strictEqual(letter.gift.payload.amount, 5000);

  // closing the campaign stops it for the next account, and keeps what was already delivered
  const close = (cookie, action, id) => call('onRequestPost', 'api/gm/announcements.js', {
    request: req('POST', '/api/gm/announcements', { cookie, body: { id, action } }), env: h.env });
  assert.strictEqual((await close(early.cookie, 'close', mid)).status, 403, 'a player cannot close a campaign');
  const closed = await close(owner.cookie, 'close', mid);
  assert.strictEqual(closed.status, 200, JSON.stringify(closed.data));
  assert.match(closed.data.note, /already delivered stays/i, 'closing takes nothing back');
  await api.register(h.env, { u: 'AfterClose', p: 'after-close-password' });
  assert.strictEqual(grantFor('AfterClose').length, 0, 'a closed campaign pays no new account');
  assert.strictEqual(grantFor('JoinedLater').length, 1, 'the account that already had it keeps it');
  assert.strictEqual((await close(owner.cookie, 'close', mid)).status, 409, 'closing twice is refused');
  assert.strictEqual((await close(owner.cookie, 'reopen', mid)).status, 200, 'a campaign can be reopened');
  await api.register(h.env, { u: 'AfterReopen', p: 'after-reopen-password' });
  assert.strictEqual(grantFor('AfterReopen').length, 1, 'reopening pays new accounts again');

  // the console list says which ones are open
  const listed = await call('onRequestGet', 'api/gm/announcements.js', { request: req('GET', '/api/gm/announcements', { cookie: owner.cookie }), env: h.env });
  assert.strictEqual(listed.status, 200);
  const row = (listed.data.gifts || []).find(g => g.messageId === mid);
  assert.ok(row && row.closed === false && /Launch week/.test(row.body), 'the list shows the letter and its state');
  assert.ok(h.sqlite.prepare(`SELECT COUNT(*) n FROM events WHERE kind='gm-announce-gift-close'`).get().n >= 1, 'closing is audited');

  // a one-off drop can opt out entirely (close the earlier campaign first, so this account can
  // only be paid by the one-off itself)
  assert.strictEqual((await close(owner.cookie, 'close', mid)).status, 200, 'closing the first campaign again');
  const oneOff = await api.act(h.env, owner.cookie, {
    id: earlyId, action: 'announce', toAll: true, body: 'One-off compensation', gift: { kind: 'zeny', amount: 1000 }, giftLater: false,
  });
  assert.strictEqual(oneOff.status, 200);
  assert.ok(!/join later/i.test(oneOff.data.note), 'no later-joiner promise for a one-off');
  await api.register(h.env, { u: 'AfterOneOff', p: 'after-one-off-password' });
  assert.strictEqual(grantFor('AfterOneOff').length, 0, 'a one-off drop stays a snapshot');
});

await T('the console fails open when migration 0015 is absent — the "sign in first" regression', async () => {
  const h = freshEnv();
  const owner = await api.register(h.env, { u: 'DegOwner', p: 'owner-password-1' });
  h.sqlite.prepare("UPDATE users SET gm=2 WHERE username='DegOwner'").run();
  const p = await api.register(h.env, { u: 'DegPlayer', p: 'deg-password-1' });
  let put = await api.putSave(h.env, p.cookie, { blob: quietSave(), version: 1 });
  assert.strictEqual(put.status, 200, 'an ordinary save records normally');
  // A deployment where the code shipped but migration 0015 has not been applied yet — exactly
  // what bounced the signed-in owner back to the sign-in card after PR 228 merged.
  h.sqlite.exec('DROP TABLE save_alerts');
  // The audit hook now fails (its tables are gone) — and must still never fail the save.
  const evil = JSON.stringify(Object.assign(JSON.parse(quietSave()), { st: { str: 300 } }));
  put = await api.putSave(h.env, p.cookie, { blob: evil, version: put.data.version });
  assert.strictEqual(put.status, 200, 'an audit failure must never fail an accepted save: ' + JSON.stringify(put.data));
  const list = await api.players(h.env, owner.cookie);
  assert.strictEqual(list.status, 200, 'the player list must load: ' + JSON.stringify(list.data || {}).slice(0, 200));
  assert.ok(list.data.players.length >= 2, 'accounts still listed');
  assert.ok(list.data.players.every(x => x.alerted === false), 'the ⚠ marker degrades to off');
  const id = h.sqlite.prepare(`SELECT id FROM users WHERE username='DegPlayer'`).get().id;
  const detail = await api.player(h.env, owner.cookie, id);
  assert.strictEqual(detail.status, 200, 'the player detail must load: ' + JSON.stringify(detail.data || {}).slice(0, 200));
  assert.deepStrictEqual(detail.data.alerts, [], 'an absent table reads as an empty flag list');
  const audit = await call('onRequestGet', 'api/gm/audit.js', { request: req('GET', '/api/gm/audit', { cookie: owner.cookie }), env: h.env });
  assert.strictEqual(audit.status, 200, 'the Suspicious saves card must answer: ' + JSON.stringify(audit.data || {}).slice(0, 200));
  assert.deepStrictEqual(audit.data.alerts, []);
  assert.match(String(audit.data.note || ''), /0015/, 'the card names the migration to apply');
});

sqlite.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
