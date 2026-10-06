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
  return { prepare: sql => wrap(sqlite.prepare(sql)) };
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
  const out = await call('api/register.js', 'onRequestPost', 'POST', '/api/register', { body: { u, p } });
  assert.equal(out.status, 201, out.data?.err);
  return out.res.headers.get('Set-Cookie').split(';')[0];
}
async function put(cookie, version, lv, kills) {
  return call('api/save.js', 'onRequestPut', 'PUT', '/api/save', {
    cookie, body: { version, savedAt: Date.now(), blob: JSON.stringify({ lv, kills, cls: 'Novice', zeny: 0 }) },
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

console.log('\n' + pass.length + ' passed, ' + fail.length + ' failed');
process.exit(fail.length ? 1 : 0);
