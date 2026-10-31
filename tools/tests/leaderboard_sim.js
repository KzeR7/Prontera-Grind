// Real /api/board handler, real SQL and save triggers, exercised against Node's SQLite/D1 shim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boardDayKey, boardWeekStart } from '../../functions/_lib/board.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function makeD1(sqlite) {
  const wrap = (stmt, args = []) => ({
    bind: (...more) => wrap(stmt, args.concat(more)),
    first: async () => stmt.get(...args) ?? null,
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ success: true, meta: stmt.run(...args) }),
  });
  return {
    prepare: sql => wrap(sqlite.prepare(sql)),
    // Match D1's ordered, all-or-nothing batch, including connection-local changes().
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const q of statements) out.push(await q.run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}
const sqlite = new DatabaseSync(':memory:');
const migrations = path.join(root, 'migrations');
for (const name of fs.readdirSync(migrations).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
  sqlite.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
}
const env = { DB: makeD1(sqlite) };
function request(method, url, { body, cookie } = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  const values = { 'Content-Type': 'application/json' };
  if (cookie) values.Cookie = cookie;
  if (text) values['Content-Length'] = String(new TextEncoder().encode(text).length);
  const headers = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    url: url.startsWith('http') ? url : 'https://pg.test' + url,
    headers: { get: k => headers.get(String(k).toLowerCase()) ?? null },
    text: async () => text,
  };
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
async function put(cookie, version, lv, kills) {
  // the account this tab is playing (the server refuses a save for any other account, v88.4)
  const me = await call('api/me.js', 'onRequestGet', 'GET', '/api/me', { cookie });
  return call('api/save.js', 'onRequestPut', 'PUT', '/api/save', {
    // the save names its account too (v88.6): the page stamps every save it sends
    cookie, body: { owner: me.data.u, version, savedAt: Date.now(), blob: JSON.stringify({ lv, kills, cls: 'Novice', zeny: 0, owner: me.data.u }) },
  });
}
async function board(cookie, period) {
  return call('api/board.js', 'onRequestGet', 'GET', '/api/board?period=' + period, { cookie });
}
const pass = [], fail = [];
let weeklyExtraToday = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass.push(name); }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail.push(name); }
};
console.log('leaderboard: period scores, level tie-breaks and the real D1-backed handler\n');

await t('day and week keys use Singapore calendar boundaries (Monday week start)', async () => {
  assert.equal(boardDayKey(Date.UTC(2026, 9, 5, 15, 59, 59)), '2026-10-05');
  assert.equal(boardDayKey(Date.UTC(2026, 9, 5, 16, 0, 0)), '2026-10-06');
  assert.equal(boardWeekStart('2026-10-04'), '2026-09-28');
  assert.equal(boardWeekStart('2026-10-05'), '2026-10-05');
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

await t('the board is account-only and rejects unknown periods', async () => {
  assert.equal((await board(null, 'daily')).status, 401);
  const bad = await board(alpha, 'monthly');
  assert.equal(bad.status, 400);
});

await t('first cloud saves seed all-time but do not invent daily kills', async () => {
  assert.equal((await put(alpha, 0, 20, 200)).status, 200);
  assert.equal((await put(beta, 0, 30, 1000)).status, 200);
  const daily = await board(alpha, 'daily');
  assert.equal(daily.status, 200);
  assert.deepEqual(daily.data.entries, []);
  const all = await board(alpha, 'all');
  assert.deepEqual(all.data.entries.map(x => [x.name, x.level, x.kills]), [
    ['Beta', 30, 1000], ['Alpha', 20, 200],
  ]);
});

await t('daily ranks synced kill increases, breaking ties by current Base Lv', async () => {
  assert.equal((await put(alpha, 1, 20, 205)).status, 200);
  assert.equal((await put(beta, 1, 45, 1005)).status, 200);
  const daily = await board(alpha, 'daily');
  assert.deepEqual(daily.data.entries.map(x => [x.name, x.level, x.kills]), [
    ['Beta', 45, 5], ['Alpha', 20, 5],
  ]);
  assert.equal(daily.data.timeZone, 'Asia/Singapore');
});

await t('weekly sums the current Monday-to-date buckets, while all-time remains cumulative', async () => {
  const who = sqlite.prepare("SELECT id FROM users WHERE username='Alpha'").get().id;
  const today = boardDayKey(), start = boardWeekStart(today);
  weeklyExtraToday = start === today ? 10 : 0;
  sqlite.prepare(`INSERT INTO leaderboard_kills(user_id, period_key, kills) VALUES(?,?,10)
    ON CONFLICT(user_id, period_key) DO UPDATE SET kills=kills+excluded.kills`).run(who, start);
  const weekly = await board(alpha, 'weekly');
  assert.deepEqual(weekly.data.entries.map(x => [x.name, x.kills]), [['Alpha', 15], ['Beta', 5]]);
  assert.match(weekly.data.label, /^This week · /);
  assert.equal((await board(alpha, 'all')).data.entries[0].kills, 1005);
});

await t('a reset does not subtract lifetime score, and new kills after it still count', async () => {
  assert.equal((await put(alpha, 2, 1, 0)).status, 200);
  assert.equal((await put(alpha, 3, 2, 4)).status, 200);
  const all = await board(alpha, 'all');
  assert.deepEqual(all.data.entries.map(x => [x.name, x.kills]), [['Beta', 1005], ['Alpha', 209]]);
  assert.equal((await board(alpha, 'daily')).data.entries[0].kills, 9 + weeklyExtraToday);
});

const staff = await register('StaffGM', 'staff-password-1');
const owner = await register('StaffOwner', 'owner-password-1');
sqlite.prepare("UPDATE users SET gm=1 WHERE username='StaffGM'").run();
sqlite.prepare("UPDATE users SET gm=2 WHERE username='StaffOwner'").run();
await t('GM and owner accounts are hidden from every kills board, without taking player ranks', async () => {
  const expected = {};
  for (const period of ['daily', 'weekly', 'all']) expected[period] = (await board(alpha, period)).data.entries;
  assert.equal((await put(staff, 0, 150, 100000)).status, 200);
  assert.equal((await put(owner, 0, 150, 200000)).status, 200);
  assert.equal((await put(staff, 1, 150, 100010)).status, 200);
  assert.equal((await put(owner, 1, 150, 200010)).status, 200);
  for (const period of ['daily', 'weekly', 'all']) {
    const out = await board(staff, period);
    assert.equal(out.status, 200);
    assert.deepEqual(out.data.entries, expected[period], period);
    assert.deepEqual(out.data.entries.map(x => x.rank), [1, 2], period);
  }
});
await t('the server role, not a name or client save flag, controls leaderboard visibility', async () => {
  sqlite.prepare("UPDATE users SET gm=1 WHERE username='Beta'").run();
  assert.deepEqual((await board(alpha, 'all')).data.entries.map(x => x.name), ['Alpha']);
  sqlite.prepare("UPDATE users SET gm=0 WHERE username='Beta'").run();
  assert.deepEqual((await board(alpha, 'all')).data.entries.map(x => x.name), ['Beta', 'Alpha']);
  assert.deepEqual((await board(owner, 'all')).data.entries.map(x => x.name), ['Beta', 'Alpha']);
});

console.log('\n' + pass.length + ' passed, ' + fail.length + ' failed');
process.exit(fail.length ? 1 : 0);
