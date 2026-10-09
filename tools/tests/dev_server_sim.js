// End to end, over real HTTP: the whole server path the player's browser will take.
//   node tools/tests/dev_server_sim.js
//
// api_sim.js calls the handlers directly; THIS suite boots the local dev server (tools/dev_server.js)
// and talks to it with fetch(), cookies and all. That is the layer where the things a direct call
// cannot catch live: cookie round-trips, status codes on the wire, JSON content types (the client's
// "is there an API here?" test depends on exactly that), and the static/API split.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../dev_server.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-dev-server-site-'));
const build = spawnSync('bash', [path.join(root, 'tools', 'build_site.sh'), site], { encoding: 'utf8' });
if (build.status !== 0) {
  fs.rmSync(site, { recursive: true, force: true });
  throw new Error('could not build the dev-server fixture: ' + (build.stderr || build.stdout));
}
let pass = 0, fail = 0;
const t = async (n, fn) => { try { await fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + (e && e.message)); fail++; } };
console.log('dev server: the real handlers over real HTTP, with cookies\n');

const { port, close } = await start({ port: 0, host: '127.0.0.1', site });
const base = 'http://127.0.0.1:' + port;
const jar = {};                                   // one cookie jar per named player
const call = async (who, method, url, body) => {
  const r = await fetch(base + url, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' },
      jar[who] ? { cookie: jar[who] } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (raw.length) jar[who] = raw.map(c => c.split(';')[0]).join('; ');
  const type = r.headers.get('content-type') || '';
  return { status: r.status, type, data: type.includes('json') ? await r.json() : await r.text() };
};
// the page stamps every save with the account it belongs to (v88.6); these saves are all the Friend account's
const save = lv => JSON.stringify({ lv, cls: 'Novice', zeny: lv * 100, kills: lv, st: { str: 1 }, q: [], inv: [], v: 20, owner: 'Friend' });

try {
  await t('the API answers as JSON, which is what makes the client turn the cloud on', async () => {
    const me = await call('anon', 'GET', '/api/me');
    assert.strictEqual(me.status, 401);
    assert.ok(me.type.includes('json'), 'a JSON content type on /api/me is the client\'s whole probe, got ' + me.type);
  });

  await t('the first account registered becomes the owner, and gets a recovery code', async () => {
    const r = await call('owner', 'POST', '/api/register', { u: 'KzeR', p: 'a-long-owner-password' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.gm, 2, 'the first account must be the owner - no bootstrap secret in the repo');
    assert.match(r.data.recovery, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.ok(jar.owner.includes('pg_session='), 'a session cookie must come back over the wire');
  });

  await t('the cookie alone signs you in on the next request', async () => {
    const me = await call('owner', 'GET', '/api/me');
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.data.u, 'KzeR');
  });

  // The preview server (--gm-all) exists so the owner is never stranded on an account without GM
  // tools: on a throwaway process every account it hands out is an owner. The default above stays the
  // production rule, so this must be opt-in.
  await t('--gm-all makes every account on that server an owner, not just the first', async () => {
    const preview = await start({ port: 0, host: '127.0.0.1', site, gmAll: true });
    try {
      const host = 'http://127.0.0.1:' + preview.port;
      const first = await fetch(host + '/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ u: 'Owner', p: 'a-long-owner-password' }),
      });
      const second = await fetch(host + '/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ u: 'Second', p: 'a-long-second-password' }),
      });
      const a = await first.json(), b = await second.json();
      assert.strictEqual(a.gm, 2, 'the first preview account is an owner');
      assert.strictEqual(b.gm, 2, 'and so is every later one - that is the point of --gm-all');
      const cookie = second.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      const gm = await fetch(host + '/api/gm/players', { headers: { cookie } });
      assert.strictEqual(gm.status, 200, 'the GM API must answer a preview account');
    } finally { await preview.close(); }
  });

  await t('a second player registers, is not a GM, and has their own empty save', async () => {
    const r = await call('friend', 'POST', '/api/register', { u: 'Friend', p: 'a-long-friend-password' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.gm, 0, 'only the first account is the owner');
    const s = await call('friend', 'GET', '/api/save');
    assert.strictEqual(s.status, 200);
    assert.strictEqual(s.data.blob, null);
  });

  await t('a save round-trips through the server, and the leaderboard columns come back derived', async () => {
    const put = await call('friend', 'PUT', '/api/save', { owner: 'friend', version: 0, blob: save(17), savedAt: Date.now() });
    assert.strictEqual(put.status, 200);
    assert.strictEqual(put.data.version, 1);
    const get = await call('friend', 'GET', '/api/save');
    assert.strictEqual(get.data.version, 1);
    assert.strictEqual(JSON.parse(get.data.blob).lv, 17);
  });

  await t('the second browser sees the same character (this is the whole point)', async () => {
    const out = await fetch(base + '/api/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ u: 'Friend', p: 'a-long-friend-password' }),
    });
    const cookie = out.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const got = await fetch(base + '/api/save', { headers: { cookie } }).then(r => r.json());
    assert.strictEqual(JSON.parse(got.blob).lv, 17, 'the same save must load on another device');
  });

  await t('a stale version is refused with 409 and the server copy, never a silent loss', async () => {
    const r = await call('friend', 'PUT', '/api/save', { owner: 'friend', version: 0, blob: save(99), savedAt: Date.now() });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(JSON.parse(r.data.blob).lv, 17, 'the client needs the server copy to offer a choice');
  });

  await t('a save stamped for another account is refused over the wire (409), and the player keeps their own', async () => {
    const r = await call('friend', 'PUT', '/api/save', { owner: 'friend', version: 1, savedAt: Date.now(),
      blob: JSON.stringify({ lv: 99, cls: 'Novice', zeny: 0, kills: 0, owner: 'SomeoneElse' }) });
    assert.strictEqual(r.status, 409, 'the other account\'s save is refused on the wire');
    assert.strictEqual(r.data.saveMismatch, true, 'and the page is told it is an owner refusal');
    const get = await call('friend', 'GET', '/api/save');
    assert.strictEqual(JSON.parse(get.data.blob).lv, 17, 'the player\'s own save is unchanged');
    assert.strictEqual(get.data.version, 1, 'and its version did not move');
  });

  await t('the leaderboard route returns the player\'s all-time score and records new synced kills', async () => {
    const all = await call('friend', 'GET', '/api/board?period=all');
    assert.strictEqual(all.status, 200);
    assert.deepStrictEqual([all.data.entries[0].name, all.data.entries[0].level, all.data.entries[0].kills], ['Friend', 17, 17]);
    assert.strictEqual((await call('anon', 'GET', '/api/board?period=daily')).status, 401);
    const put = await call('friend', 'PUT', '/api/save', { owner: 'friend', version: 1, blob: save(22), savedAt: Date.now() });
    assert.strictEqual(put.status, 200);
    const day = await call('friend', 'GET', '/api/board?period=daily');
    assert.deepStrictEqual([day.data.entries[0].name, day.data.entries[0].kills], ['Friend', 5]);
  });

  await t('the owner can reach the GM API; a player cannot', async () => {
    const asOwner = await call('owner', 'GET', '/api/gm/players');
    assert.strictEqual(asOwner.status, 200);
    assert.ok(asOwner.data.players.some(p => p.u === 'Friend'), 'the owner sees the player list');
    const asPlayer = await call('friend', 'GET', '/api/gm/players');
    assert.strictEqual(asPlayer.status, 403, 'a normal account must be refused');
  });

  await t('a GM gift sent over HTTP is waiting for the player on their next login', async () => {
    const players = await call('owner', 'GET', '/api/gm/players');
    const friend = players.data.players.find(p => p.u === 'Friend');
    const sent = await call('owner', 'POST', '/api/gm/player', {
      id: friend.id, action: 'grant', kind: 'zeny', payload: { amount: 250000 }, note: 'welcome',
    });
    assert.strictEqual(sent.status, 200);
    const pending = await call('friend', 'GET', '/api/grants');
    assert.strictEqual(pending.data.grants.length, 1);
    assert.strictEqual(pending.data.grants[0].payload.amount, 250000);
  });

  await t('an announcement is queued for everyone', async () => {
    const players = await call('owner', 'GET', '/api/gm/players');
    const friend = players.data.players.find(p => p.u === 'Friend');
    const sent = await call('owner', 'POST', '/api/gm/player', { id: friend.id, action: 'announce', body: 'Servers up!', kind: 'notice', toAll: true });
    assert.strictEqual(sent.status, 200);
    const msgs = await call('friend', 'GET', '/api/messages');
    assert.ok(msgs.data.messages.length >= 1);
    assert.strictEqual(msgs.data.messages[0].body, 'Servers up!');
  });

  await t('the usage card answers over HTTP, for the owner only, without an analytics token', async () => {
    const asOwner = await call('owner', 'GET', '/api/gm/usage');
    assert.strictEqual(asOwner.status, 200);
    assert.strictEqual(asOwner.data.source, 'ledger', 'no token here -> our own books');
    assert.strictEqual(asOwner.data.requests, null, 'unmeasured counters are null, never zero');
    assert.ok(asOwner.data.ledger.saves >= 1, 'the ledger counts the saves in this database');
    assert.strictEqual(asOwner.data.limits.rowsWritten, 100000);
    assert.strictEqual((await call('friend', 'GET', '/api/gm/usage')).status, 403, 'a player must not read it');
    assert.strictEqual((await call('anon', 'GET', '/api/gm/usage')).status, 401);
  });

  await t('every GM action wrote an audit row', async () => {
    const log = await call('owner', 'GET', '/api/gm/log');
    assert.strictEqual(log.status, 200);
    const kinds = log.data.events.map(e => e.kind);
    for (const k of ['gm-grant', 'gm-announce']) assert.ok(kinds.includes(k), 'no audit row for ' + k + ' (saw: ' + kinds.join(',') + ')');
    // The feed also carries a human label, which is what the console shows; assert it is not the raw kind.
    const row = log.data.events.find(e => e.kind === 'gm-grant');
    assert.ok(row.label && row.label !== 'gm-grant', 'the audit feed should label actions in words, got ' + row.label);
  });

  await t('the static site is served alongside the API, and dev material is not', async () => {
    const page = await fetch(base + '/');
    assert.strictEqual(page.status, 200);
    assert.ok((await page.text()).includes('Prontera Grind'), 'the game itself must be served at /');
    assert.ok((await fetch(base + '/gm.html')).status === 200, 'the GM console must be served');
    assert.strictEqual((await fetch(base + '/tools/dev_server.js')).status, 404, 'dev files must not be reachable');
    assert.ok(fs.existsSync(path.join(site, 'index.html')), 'the fixture must be built before the server starts');
    assert.ok(!fs.existsSync(path.join(site, 'tools')), 'the published tree must not contain tools/');
  });

  await t('an unknown API path answers JSON 404, never the index page', async () => {
    const r = await call('anon', 'GET', '/api/nope');
    assert.strictEqual(r.status, 404);
    assert.ok(r.type.includes('json'), 'a JSON 404 keeps the client from misreading an error as a static host');
  });
} finally {
  await close();
  fs.rmSync(site, { recursive: true, force: true });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
