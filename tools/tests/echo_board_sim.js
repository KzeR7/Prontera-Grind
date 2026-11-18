// Endless Echo leaderboard: real /api/board + /api/save handlers against Node's SQLite/D1 shim,
// plus the repriced Cash Shop protection-scroll bundles from the one shared catalog.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boardDayKey, boardWeekStart } from '../../functions/_lib/board.js';
import { echoRewardFor } from '../../functions/_lib/echo-board.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function makeD1(sqlite, stats = null) {
  const wrap = (stmt, args = [], sql = '') => ({
    bind: (...more) => wrap(stmt, args.concat(more), sql),
    first: async () => { if (stats) stats.reads.push(sql); return stmt.get(...args) ?? null; },
    all: async () => { if (stats) stats.reads.push(sql); return { results: stmt.all(...args) }; },
    run: async () => {
      const meta = stmt.run(...args);
      if (stats) stats.writes.push({ sql, changes: Number(meta?.changes) || 0 });
      return { success: true, meta };
    },
  });
  return {
    prepare: sql => wrap(sqlite.prepare(sql), [], sql),
    // Match D1's ordered, all-or-nothing batch and keep write accounting intact.
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const q of statements) out.push(await q.run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}
const stats = { reads: [], writes: [] };
const sqlite = new DatabaseSync(':memory:');
for (const name of fs.readdirSync(path.join(root, 'migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
  sqlite.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));
}
const env = { DB: makeD1(sqlite, stats) };
function request(method, url, { body, cookie } = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  const values = { 'Content-Type': 'application/json' };
  if (cookie) values.Cookie = cookie;
  if (text) values['Content-Length'] = String(new TextEncoder().encode(text).length);
  const headers = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, url: url.startsWith('http') ? url : 'https://pg.test' + url,
    headers: { get: k => headers.get(String(k).toLowerCase()) ?? null }, text: async () => text };
}
async function call(file, fn, method, url, args = {}) {
  const mod = await import(pathToFileURL(path.join(root, 'functions', file)).href);
  const res = await mod[fn]({ request: request(method, url, args), env });
  const data = (res.headers.get('Content-Type') || '').includes('json') ? await res.json() : null;
  return { status: res.status, data, res };
}
async function register(u, p) {
  const out = await call('api/register.js', 'onRequestPost', 'POST', '/api/register', { body: { u, p, email: u+'@example.test' } });
  assert.equal(out.status, 201, out.data?.err);
  return out.res.headers.get('Set-Cookie').split(';')[0];
}
const today = boardDayKey(), week = boardWeekStart(today);
async function put(cookie, version, lv, trial) {
  const me = await call('api/me.js', 'onRequestGet', 'GET', '/api/me', { cookie });
  return call('api/save.js', 'onRequestPut', 'PUT', '/api/save', {
    cookie, body: { owner: me.data.u, version, savedAt: Date.now(),
      blob: JSON.stringify({ lv, kills: 0, cls: 'Novice', zeny: 0, owner: me.data.u, trial }) },
  });
}
const board = (cookie, period, kind = 'echo') =>
  call('api/board.js', 'onRequestGet', 'GET', `/api/board?period=${period}&board=${kind}`, { cookie });

const pass = [], fail = [];
const t = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass.push(name); }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail.push(name); }
};
console.log('echo board: protection-scroll prices, DPS periods and Top-100 rewards\n');

await t('cash shop sells the cheaper protection-scroll bundles and no old ones', async () => {
  const shop = (await import(pathToFileURL(path.join(root, 'assets/shop-catalog.js')).href)).default;
  const find = sku => shop.find({ ACCESSORIES: {} }, sku);
  assert.deepEqual([find('sup:refineScrolls:2')?.amount, find('sup:refineScrolls:2')?.price], [2, 100]);
  assert.deepEqual([find('sup:refineScrolls:10')?.amount, find('sup:refineScrolls:10')?.price], [10, 299]);
  assert.deepEqual([find('sup:mythicScrolls:2')?.amount, find('sup:mythicScrolls:2')?.price], [2, 249]);
  assert.deepEqual([find('sup:mythicScrolls:10')?.amount, find('sup:mythicScrolls:10')?.price], [10, 700]);
  for (const gone of ['sup:refineScrolls:1', 'sup:refineScrolls:5', 'sup:mythicScrolls:1', 'sup:mythicScrolls:3'])
    assert.equal(find(gone), null, gone + ' should be gone');
});

await t('reward tiers pay the proposed prizes at the band edges', async () => {
  assert.deepEqual(echoRewardFor('daily', 1), [{ resource: 'refineScrolls', amount: 3 }, { resource: 'dailyRolls', amount: 2 }]);
  assert.deepEqual(echoRewardFor('daily', 3), [{ resource: 'refineScrolls', amount: 2 }, { resource: 'dailyRolls', amount: 2 }]);
  assert.deepEqual(echoRewardFor('daily', 10), [{ resource: 'refineScrolls', amount: 1 }]);
  assert.deepEqual(echoRewardFor('daily', 100), [{ resource: 'shards', amount: 30 }]);
  assert.deepEqual(echoRewardFor('daily', 101), []);
  assert.deepEqual(echoRewardFor('weekly', 1), [{ resource: 'mythicScrolls', amount: 5 }]);
  assert.deepEqual(echoRewardFor('weekly', 3), [{ resource: 'mythicScrolls', amount: 3 }]);
  assert.deepEqual(echoRewardFor('weekly', 10), [{ resource: 'mythicScrolls', amount: 1 }]);
  assert.deepEqual(echoRewardFor('weekly', 25), [{ resource: 'refineScrolls', amount: 5 }, { resource: 'dailyRolls', amount: 5 }]);
  assert.deepEqual(echoRewardFor('weekly', 50), [{ resource: 'refineScrolls', amount: 3 }]);
  assert.deepEqual(echoRewardFor('weekly', 100), [{ resource: 'shards', amount: 100 }]);
  assert.deepEqual(echoRewardFor('all', 1), []);
});

await t('the D1 shim executes batches in order and rolls back on failure', async () => {
  sqlite.exec('CREATE TEMP TABLE batch_probe (id INTEGER PRIMARY KEY)');
  try {
    const db = env.DB;
    const result = await db.batch([
      db.prepare('INSERT INTO batch_probe(id) VALUES (?)').bind(1),
      db.prepare('INSERT INTO batch_probe(id) SELECT 2 WHERE changes() = 1'),
    ]);
    assert.equal(result[0].meta.changes, 1);
    assert.equal(result[1].meta.changes, 1);
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO batch_probe(id) VALUES (?)').bind(3),
      db.prepare('INSERT INTO batch_probe(id) VALUES (?)').bind(1),
    ]));
    assert.deepEqual(sqlite.prepare('SELECT id FROM batch_probe ORDER BY id').all().map(row => row.id), [1, 2]);
  } finally { sqlite.exec('DROP TABLE batch_probe'); }
});

const alpha = await register('Alpha', 'alpha-password-1');
const beta = await register('Beta', 'beta-password-22');
// Disposable test-only launch override: exercise an already-open full week.
sqlite.prepare('UPDATE unverified_echo_config SET starts_at=1').run();

await t('ranked DPS syncs into daily, weekly and all-time Echo boards, best-only', async () => {
  const trial = dps => ({ day: today, used: 1, best: dps, runs: 1, chest: 0,
    echoBoard: { day: today, dayDps: dps, week, weekDps: dps } });
  assert.equal((await put(alpha, 0, 150, trial(900000))).status, 200);
  assert.equal((await put(beta, 0, 140, trial(1500000))).status, 200);
  // a weaker later run (and an older all-time best re-sync) must never lower a period score
  assert.equal((await put(alpha, 1, 150, trial(400000))).status, 200);
  const daily = await board(alpha, 'daily');
  assert.deepEqual(daily.data.entries.map(x => [x.name, x.dps]), [['Beta', 1500000], ['Alpha', 900000]]);
  assert.equal(daily.data.limit, 100);
  assert.equal(daily.data.rewards.tiers[0].label, '#1');
  assert.match(daily.data.rewards.tiers[0].prizes, /3 Refine Protection Scrolls \+ 2 Daily Roulette Rolls/);
  assert.deepEqual((await board(alpha, 'weekly')).data.entries.map(x => x.name), ['Beta', 'Alpha']);
  assert.deepEqual((await board(alpha, 'all')).data.entries.map(x => x.dps), [1500000, 900000]);
  assert.equal((await board(alpha, 'all')).data.rewards, null);
  // the kills board is untouched and still answers without a board param meaning kills
  assert.equal((await board(alpha, 'daily', 'kills')).data.board, 'kills');
  assert.equal((await board(alpha, 'daily', 'bogus')).status, 400);
});

await t('old unverified leaderboard rows never trigger backpay', async () => {
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10);
  const ids = sqlite.prepare('SELECT id FROM users').all();
  for (const [i,u] of ids.entries()) sqlite.prepare('INSERT INTO leaderboard_echo(user_id,period_key,dps) VALUES(?,?,?)').run(u.id,'day:'+yesterday,2000000-i*1000);
  await board(alpha,'daily');await board(beta,'weekly');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM grants').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo_rewards').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM competition_prize_ledger').get().n,0);
  // A synthetic NEW period must still pay the exact first-place payloads once.
  const now=Date.now(),end=Math.ceil(now/1000)*1000+1000,key='day:2020-01-02';
  sqlite.prepare("INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at) VALUES(?,'daily','unverified-save-v1',?,?)").run(key,now-1000,end);
  for(const [i,u] of ids.entries())sqlite.prepare('INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES(?,?,?,?,?)').run(key,u.id,'test:'+u.id,2000000-i*1000,now);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,end-Date.now()+100)));
  await board(alpha,'daily');
  const grants=sqlite.prepare("SELECT user_id,payload,note FROM grants WHERE created_by='Echo competition' ORDER BY user_id,payload").all();
  assert.ok(grants.length>=3,'rank prizes were queued: '+JSON.stringify(grants));
  assert.ok(grants.some(g=>g.payload==='{"resource":"refineScrolls","amount":3}' && /#1/.test(g.note)));
  assert.ok(grants.some(g=>g.payload==='{"resource":"dailyRolls","amount":2}' && /#1/.test(g.note)));
  const placements=sqlite.prepare('SELECT COUNT(*) n FROM competition_placements WHERE period_key=?').get(key).n;
  assert.equal(placements,ids.length);
  await board(alpha,'weekly');await board(beta,'daily');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM grants WHERE created_by='Echo competition'").get().n,grants.length);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM competition_placements WHERE period_key=?').get(key).n,placements);
});

await t('unchanged Echo scores and already-settled periods spend zero Echo D1 writes on field syncs', async () => {
  const trial = dps => ({ day: today, used: 1, best: dps, runs: 1, chest: 0,
    echoBoard: { day: today, dayDps: dps, week, weekDps: dps } });
  const ver = (await call('api/save.js', 'onRequestGet', 'GET', '/api/save', { cookie: alpha })).data.version;
  stats.reads.length = 0;
  stats.writes.length = 0;
  // Alpha already holds 900,000 across today/week/all, and yesterday is already settled above.
  const same = await put(alpha, ver, 150, trial(900000));
  assert.equal(same.status, 200);
  const echoWrites = stats.writes.filter(w => /leaderboard_echo/i.test(w.sql) && w.changes>0);
  assert.equal(echoWrites.length, 0, 'unchanged personal bests must not rewrite leaderboard_echo rows: ' + JSON.stringify(echoWrites));
  assert.ok(!stats.reads.some(sql => /sqlite_master/i.test(sql)), 'save syncs must not scan sqlite_master');
  const settleReads = stats.reads.filter(sql => /leaderboard_echo/i.test(sql));
  assert.ok(settleReads.length <= 2, 'expected at most 1 personal-best read + 1 due-period check, got ' + settleReads.length);
  // Beating a personal best still writes immediately.
  const beat = await put(alpha, ver + 1, 150, trial(1800000));
  assert.equal(beat.status, 200);
  assert.equal((await board(alpha, 'daily')).data.entries[0].name, 'Alpha');
  assert.equal((await board(alpha, 'daily')).data.entries[0].dps, 1800000);
});

await t('pre-0006 database: save and kills work; Echo fails closed until migrations are applied', async () => {
  const preSqlite = new DatabaseSync(':memory:');
  for (const name of fs.readdirSync(path.join(root, 'migrations')).filter(n => /^(000[1-5]|0007)_.*\.sql$/.test(n)).sort()) {
    preSqlite.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));
  }
  const preEnv = { DB: makeD1(preSqlite) };
  const callPre = async (file, fn, method, url, args = {}) => {
    const mod = await import(pathToFileURL(path.join(root, 'functions', file)).href);
    const res = await mod[fn]({ request: request(method, url, args), env: preEnv });
    const data = (res.headers.get('Content-Type') || '').includes('json') ? await res.json() : null;
    return { status: res.status, data, res };
  };
  const reg = await callPre('api/register.js', 'onRequestPost', 'POST', '/api/register', { body: { u: 'PreUser', p: 'pre-password-123', email:'preuser@example.test' } });
  assert.equal(reg.status, 201);
  const ck = reg.res.headers.get('Set-Cookie').split(';')[0];
  const trial = { day: today, used: 1, best: 750000, runs: 1, chest: 0, echoBoard: { day: today, dayDps: 750000, week, weekDps: 750000 } };
  const s1 = await callPre('api/save.js', 'onRequestPut', 'PUT', '/api/save', {
    cookie: ck, body: { owner: 'PreUser', version: 0, savedAt: Date.now(), blob: JSON.stringify({ lv: 100, kills: 10, cls: 'Novice', zeny: 0, owner: 'PreUser', trial }) },
  });
  assert.equal(s1.status, 200, 'initial save succeeds before migration 0006');
  const s2 = await callPre('api/save.js', 'onRequestPut', 'PUT', '/api/save', {
    cookie: ck, body: { owner: 'PreUser', version: 1, savedAt: Date.now(), blob: JSON.stringify({ lv: 101, kills: 25, cls: 'Novice', zeny: 0, owner: 'PreUser', trial }) },
  });
  assert.equal(s2.status, 200, 'subsequent save syncs succeed before migration 0006');
  // v424 does not create another ambiguous pricing:null entitlement before migration 0020 is
  // verified. Active saves/boards remain usable, but a qualifying return must preserve its window;
  // genuinely pending old rows are still read/acknowledged by the compatibility paths elsewhere.
  const awayAt=Date.now()-4*3600000;
  preSqlite.prepare('UPDATE saves SET last_seen = ?, rate_kph = ? WHERE user_id = (SELECT id FROM users WHERE username = ?)')
    .run(awayAt, 120, 'PreUser');
  const stagedClaim = await callPre('api/save.js', 'onRequestGet', 'GET', '/api/save', { cookie: ck });
  assert.equal(stagedClaim.status, 503, 'a qualifying return retries while explicit claim state is unavailable');
  assert.equal(stagedClaim.data.offlineClaimsUnavailable, true);
  assert.equal(preSqlite.prepare('SELECT last_seen FROM saves WHERE user_id=(SELECT id FROM users WHERE username=?)')
    .get('PreUser').last_seen,awayAt,'the schema fence preserves the unpaid away interval');
  assert.equal(preSqlite.prepare('SELECT COUNT(*) AS n FROM offline_reward_claims').get().n, 0, 'the fence writes no ambiguous new legacy row');
  const killsBoard = await callPre('api/board.js', 'onRequestGet', 'GET', '/api/board?period=daily&board=kills', { cookie: ck });
  assert.equal(killsBoard.status, 200, 'kills board works before migration 0006');
  const echoBoard = await callPre('api/board.js', 'onRequestGet', 'GET', '/api/board?period=daily&board=echo', { cookie: ck });
  assert.equal(echoBoard.status, 503, 'Echo requires the new launch schema');
  preSqlite.close();
});

console.log('\n' + pass.length + ' passed, ' + fail.length + ' failed');
process.exit(fail.length ? 1 : 0);
