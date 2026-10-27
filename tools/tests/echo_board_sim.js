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
for (const name of fs.readdirSync(path.join(root, 'migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
  sqlite.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));
}
const env = { DB: makeD1(sqlite) };
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
  const out = await call('api/register.js', 'onRequestPost', 'POST', '/api/register', { body: { u, p } });
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

const alpha = await register('Alpha', 'alpha-password-1');
const beta = await register('Beta', 'beta-password-22');

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

await t('a finished day pays its Top 100 exactly once, through the grants queue', async () => {
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10);
  const ids = sqlite.prepare('SELECT id, username FROM users').all();
  for (const [i, u] of ids.entries()) {
    sqlite.prepare('INSERT INTO leaderboard_echo(user_id, period_key, dps) VALUES(?, ?, ?)')
      .run(u.id, 'day:' + yesterday, 2000000 - i * 1000);
  }
  await board(alpha, 'daily');           // first read after the period ends settles it
  const grants = sqlite.prepare("SELECT user_id, payload, note FROM grants WHERE created_by='Endless Echo' ORDER BY user_id, payload").all();
  assert.ok(grants.length >= 3, 'rank prizes were queued: ' + JSON.stringify(grants));
  assert.ok(grants.some(g => g.payload === '{"resource":"refineScrolls","amount":3}' && /rank #1/.test(g.note)));
  assert.ok(grants.some(g => g.payload === '{"resource":"dailyRolls","amount":2}' && /rank #1/.test(g.note)));
  const rewards = sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo_rewards').get().n;
  assert.equal(rewards, ids.length);
  await board(alpha, 'weekly');          // settling again must pay nobody twice
  await board(beta, 'daily');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM grants WHERE created_by='Endless Echo'").get().n, grants.length);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo_rewards').get().n, rewards);
});

console.log('\n' + pass.length + ' passed, ' + fail.length + ' failed');
process.exit(fail.length ? 1 : 0);
