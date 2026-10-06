// The client's cloud layer: offline-first, conflict-safe, and never in the way of local play.
//   node tools/tests/cloud_sim.js
//
// This suite pulls the real cloud block out of index.html and runs it against a stubbed fetch, so the
// contract that matters is pinned without a browser:
//
//   * with no API (a plain static host) the game behaves exactly as before — no cloud call, no error;
//   * a dead network never throws into the game and never loses the local save;
//   * a version conflict asks the player, and neither copy is thrown away;
//   * GM gifts are applied exactly once and then claimed;
//   * the recovery-code dialog appears exactly once, at registration.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
const T = async (n, fn) => { try { await fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + (e && e.message)); fail++; } };
console.log('client cloud layer: offline-first sync with a conflict-safe save\n');

// --------------------------------------------------------------- extraction ----
const start = src.indexOf('// ---------- cloud accounts and saves (optional) ----------');
const end = src.indexOf("addEventListener('load',()=>{setTimeout(cloudProbe,80)});", start);
assert.ok(start > 0 && end > start, 'the cloud block is not where this suite expects it');
const cloudCode = src.slice(start, end + "addEventListener('load',()=>{setTimeout(cloudProbe,80)});".length);

// Every dependency the block has on the game, stubbed so the suite can drive it directly.
function harness(opts = {}) {
  const calls = [];
  const els = new Map();
  const store = new Map(Object.entries(opts.storage || {}));
  const state = {
    S: opts.S || { lv: 12, cls: 'Novice', zeny: 100, kills: 5, st: { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 } },
    currentUser: null, logs: [], asks: [], saves: 0,
  };
  const fetchStub = async (url, init) => {
    calls.push({ url, init: init || {} });
    const route = (opts.routes || {})[url.replace('/api', '')] || {};
    const seq = calls.filter(c => c.url === url).length;
    const r = typeof route === 'function' ? route(seq, init) : route;
    if (r === undefined || r.throw) throw new Error(r && r.throw || 'offline');
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: k => (k.toLowerCase() === 'content-type' ? (r.ct ?? 'application/json') : null) },
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    };
  };
  const sandbox = {
    console, JSON, Math, Date, Number, String, Array, Object, Promise, Blob,
    fetch: fetchStub,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    document: { visibilityState: 'visible', getElementById: id => els.get(id) || null },
    navigator: {},
    addEventListener: () => {},
    setInterval: () => 0,
    setTimeout: (fn) => { if (opts.runTimers) fn(); return 0; },
    log: (m, cls, cat) => state.logs.push({ m, cls, cat }),
    cloudMsg: null,
    $: id => els.get(id) || null,
    ui: () => { state.uiCalls = (state.uiCalls || 0) + 1; },
    qRefresh: () => {}, newQuest: q => ({ type: q }), fresh: () => ({ lv: 1, cls: 'Novice', zeny: 0, kills: 0, st: { str: 1 }, q: [] }),
    load: () => Object.assign({ lv: 9, cls: 'Novice', zeny: 5, kills: 0, st: { str: 1 }, q: [] }, opts.loadReturn || {}),
    lsPut: (k, v) => { store.set(k, String(v)); },
    lsGet: k => (store.has(k) ? store.get(k) : null),
    iname: it => it.name,
    totalPts: () => 100,
    ELITELV: 100,
    MAPS: [1, 2, 3], save: () => { state.saves++; },
    initSession: () => { state.localSession = true; },
    showErr: m => state.err = m,
    getAcc: () => ({}), setAcc: () => {}, hashPw: () => 'h', gmOk: () => false, GM_USER: 'GM',
    ask: (msg, yes) => { state.asks.push(msg); state.askPromise = yes(); },
    authMode: 'login', hudRate: null, zenyEarned: 0,
  };
  sandbox.$ = sandbox.$;
  sandbox.globalThis = sandbox;
  sandbox.S = state.S;                 // the game state the block mutates
  sandbox.currentUser = null;          // and the account name it works against
  // A couple of the game's own element hooks the block writes to.
  for (const id of ['cloudBadge', 'loginCloud', 'userBadge', 'conflict', 'conflictWhy', 'conflictCards', 'cfThis', 'cfCloud', 'cfLater'])
    els.set(id, { id, textContent: '', title: '', style: {}, set onclick(fn) { this._onclick = fn; }, get onclick() { return this._onclick; }, innerHTML: '' });
  els.get('cfLater').onclick = null;
  // A top-level `const` inside vm.runInContext does NOT become a property of the sandbox, so the
  // block's bindings are copied onto globalThis explicitly: that is how a suite drives them.
  const EXPORTS = ['CLOUD','cloudProbe','cloudPush','cloudFlush','cloudFlushNow','cloudConflict',
    'cloudAdopt','cloudPull','cloudApplyGrants','ptsSpent','cloudAuth','cloudLogout','cloudTouch',
    'cloudSession','initSessionFromCloud','saveKeyFor','cloudBadge','cloudSay','cloudFetch'];
  vm.createContext(sandbox);
  vm.runInContext(cloudCode + '\n;' + EXPORTS.map(n => `globalThis.${n}=${n};`).join(''), sandbox);
  return { sandbox, state, calls, els, store };
}

// --------------------------------------------------------------- the tests ----
await T('no API on this host: the probe reports "no cloud" and nothing else runs', async () => {
  const h = harness({ routes: { '/me': { status: 404, ct: 'text/html', body: {} } } });
  const found = await h.sandbox.cloudProbe();
  assert.strictEqual(found, false);
  assert.strictEqual(h.sandbox.CLOUD.api, false, 'a static host must never look like a server');
  assert.strictEqual(h.sandbox.CLOUD.on, false);
  // The login line stays empty so the card looks exactly like it always has.
  assert.strictEqual(h.els.get('loginCloud').textContent, '');
});

await T('a network that is simply down is not an error either', async () => {
  const h = harness({ routes: { '/me': { throw: 'no network' } } });
  assert.strictEqual(await h.sandbox.cloudProbe(), false);
  assert.strictEqual(h.sandbox.CLOUD.api, false);
});

await T('an API that answers 401 turns the cloud on and invites the player to sign in', async () => {
  const h = harness({ routes: { '/me': { status: 401, body: { err: 'Not logged in.' } } } });
  assert.strictEqual(await h.sandbox.cloudProbe(), false, 'not signed in yet');
  assert.strictEqual(h.sandbox.CLOUD.api, true);
  assert.match(h.els.get('loginCloud').textContent, /register or sign in/i);
});

await T('playing offline: a failing push keeps the save and says so, and never throws', async () => {
  const h = harness({ routes: { '/save': { throw: 'offline' } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'FRIEND';
  h.state.S = h.sandbox.S;
  const r = await h.sandbox.cloudPush(true);
  assert.strictEqual(r, 'offline');
  assert.strictEqual(h.sandbox.CLOUD.offline, true);
  assert.strictEqual(h.sandbox.CLOUD.dirty, true, 'the local copy still leads, so it is still dirty');
  assert.match(h.els.get('cloudBadge').textContent, /✕/);
  assert.ok(h.state.logs.some(l => /safe on this device/i.test(l.m)), 'the player is told their progress is safe');
});

await T('a push sends the version it last saw, and stores the new one', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 8 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 7; h.sandbox.currentUser = 'FRIEND';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'ok');
  const body = JSON.parse(h.calls.find(c => c.url === '/api/save').init.body);
  assert.strictEqual(body.version, 7, 'the client must send the version it last saw');
  assert.ok(body.blob.includes('"lv"'), 'and the save itself');
  assert.strictEqual(h.sandbox.CLOUD.ver, 8);
  assert.strictEqual(h.sandbox.CLOUD.dirty, false);
});

await T('the debounce stops a 5-second autosave from becoming a request storm', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 2 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 1; h.sandbox.currentUser = 'X';
  h.sandbox.CLOUD.lastPush = Date.now(); h.sandbox.CLOUD.dirty = true;
  assert.strictEqual(await h.sandbox.cloudFlush(), 'idle', 'a debounced flush must not send anything');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save').length, 0);
  await h.sandbox.cloudFlushNow();
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save').length, 1, 'a forced flush (tab hidden) always sends');
});

await T('a 409 opens the two-saves chooser and touches neither copy yet', async () => {
  const h = harness({ routes: { '/save': { status: 409, body: { conflict: true, version: 4, blob: JSON.stringify({ lv: 30, cls: 'Knight', zeny: 9, kills: 3 }), savedAt: 111 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 3; h.sandbox.currentUser = 'X';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'conflict');
  assert.strictEqual(h.els.get('conflict').style.display, 'flex');
  assert.match(h.els.get('conflictCards').innerHTML, /This device/);
  assert.match(h.els.get('conflictCards').innerHTML, /Cloud save/);
  assert.match(h.els.get('conflictWhy').textContent, /will not guess/i);
  assert.strictEqual(h.state.saves, 0, 'nothing is written while the player decides');
});

await T('"keep this device" uploads against the server version, so it wins cleanly', async () => {
  const h = harness({ routes: { '/save': (n, init) => JSON.parse(init.body).version === 4 ? { status: 200, body: { version: 5 } } : { status: 409, body: { conflict: true, version: 4, blob: '{}', savedAt: 1 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 0; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudConflict({ version: 4, blob: JSON.stringify({ lv: 30 }), savedAt: 111 });
  await h.els.get('cfThis').onclick();
  const last = JSON.parse(h.calls.filter(c => c.url === '/api/save').pop().init.body);
  assert.strictEqual(last.version, 4, 'it must retry against the version the server reported');
  assert.strictEqual(h.sandbox.CLOUD.ver, 5);
});

await T('"keep the cloud save" adopts it and stashes this device\'s copy', async () => {
  const cloudBlob = JSON.stringify({ lv: 44, cls: 'Priest', zeny: 1234, kills: 9, st: { str: 1 }, q: [] });
  const h = harness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 12 }) }, loadReturn: { lv: 44, cls: 'Priest', q: [] } });
  h.sandbox.currentUser = 'X';
  h.sandbox.cloudAdopt({ version: 6, blob: cloudBlob, savedAt: 5 });
  assert.strictEqual(h.store.get('pg_save3_X'), cloudBlob, 'the cloud copy becomes the live save');
  const backups = [...h.store.keys()].filter(k => k.startsWith('pg_save3_X_local_'));
  assert.strictEqual(backups.length, 1, 'the replaced local copy is kept under a backup key');
  assert.strictEqual(h.state.uiCalls, 1);
});

await T('"decide later" pauses sync and says so, leaving both copies untouched', async () => {
  const h = harness({ storage: { 'pg_save3_X': '{"lv":12}' } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudConflict({ version: 4, blob: '{}', savedAt: 1 });
  h.els.get('cfLater').onclick();
  assert.strictEqual(h.els.get('conflict').style.display, 'none');
  assert.strictEqual(h.sandbox.CLOUD.paused, true);
  h.sandbox.cloudTouch();
  assert.strictEqual(h.sandbox.CLOUD.dirty, false, 'a paused session must not queue a push');
  assert.strictEqual(await h.sandbox.cloudPush(true), 'idle', 'and it must refuse to push even when forced');
  assert.strictEqual(h.store.get('pg_save3_X'), '{"lv":12}', 'the local save is untouched');
});

await T('GM gifts: zeny, levels and an item are applied, then claimed exactly once', async () => {
  const h = harness({ routes: { '/grants': { status: 200, body: { ok: true } } } });
  h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X';
  const S = h.sandbox.S;
  S.lv = 10; S.zeny = 1000; S.inv = []; S.st = { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 };
  h.sandbox.cloudApplyGrants([
    { id: 1, kind: 'zeny', payload: { amount: 500000 }, from: 'KzeR' },
    { id: 2, kind: 'level', payload: { amount: 3 } },
    { id: 3, kind: 'item', payload: { item: { id: 42, name: 'GM Blade', slot: 'weapon', val: 40 } } },
    { id: 4, kind: 'message', payload: { text: 'welcome back' } },
  ]);
  assert.strictEqual(S.zeny, 501000);
  assert.strictEqual(S.lv, 13);
  assert.strictEqual(S.inv.length, 1);
  assert.strictEqual(S.inv[0].name, 'GM Blade');
  assert.ok(h.state.logs.some(l => l.m.includes('GM Blade')));
  assert.strictEqual(h.state.saves, 1, 'the applied gift is written to the local save');
  const claim = h.calls.find(c => c.url === '/api/grants' && c.init.method === 'POST');
  assert.deepStrictEqual(JSON.parse(claim.init.body).ids, [1, 2, 3, 4], 'and claimed on the server');
});

await T('a broken gift is skipped without taking the rest of the batch down', async () => {
  const h = harness({ routes: { '/grants': { status: 200, body: {} } } });
  h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X';
  const S = h.sandbox.S; S.zeny = 10; S.inv = [];
  h.sandbox.cloudApplyGrants([{ id: 9, kind: 'item', payload: { item: null } }, { id: 10, kind: 'zeny', payload: { amount: 5 } }]);
  assert.strictEqual(S.zeny, 15, 'the good grant still lands');
  assert.ok(h.state.logs.some(l => /does not understand/i.test(l.m)), 'the skipped gift is reported, not swallowed');
  const claim = h.calls.find(c => c.url === '/api/grants' && c.init.method === 'POST');
  assert.deepStrictEqual(JSON.parse(claim.init.body).ids, [10], 'only the applied grant is claimed, so the GM can resend the other');
});

await T('the level gift recomputes points with the game\'s own stat ladder', async () => {
  const h = harness();
  h.sandbox.S.st = { str: 11, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 };
  const spent = h.sandbox.ptsSpent();
  // cost(1..10) at values 1..10 is 1 per point, so a stat of 11 has spent 10.
  assert.strictEqual(spent, 10);
  h.sandbox.S.st = { str: 21, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 };
  const spent2 = h.sandbox.ptsSpent();
  assert.strictEqual(spent2, 10 + 10 * 2, 'values 11-20 cost 2 each (1+floor((v-1)/10))');
});

await T('registration shows the recovery code once, and only through the real ask()', async () => {
  const h = harness({ routes: {
    '/register': { status: 201, body: { u: 'NEW', gm: 0, recovery: 'ABCD-EFGH-JKLM-NPQR' } },
    '/save': { status: 200, body: { version: 0, blob: null } },
    '/grants': { status: 200, body: { grants: [] } },
    '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.cloudAuth('NEW', 'a-good-password', true);
  assert.strictEqual(h.state.asks.length, 1, 'exactly one dialog');
  assert.match(h.state.asks[0], /ABCD-EFGH-JKLM-NPQR/, 'the code is in it');
  assert.match(h.state.asks[0], /WRITE THIS DOWN/);
  await h.state.askPromise;                       // the player taps OK, then the session starts
  assert.strictEqual(h.sandbox.CLOUD.on, true, 'and accepting it starts the session');
});

await T('a rejected login shows the server\'s own message and starts nothing', async () => {
  const h = harness({ routes: { '/sessions': { status: 401, body: { err: 'Incorrect username or password.' } } } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.cloudAuth('X', 'wrong-password-here', false);
  assert.strictEqual(h.state.err, 'Incorrect username or password.');
  assert.strictEqual(h.sandbox.CLOUD.on, false);
});

await T('the GM door is checked before the cloud, so the local GM login still works', async () => {
  assert.ok(/if\(isGM\)\{if\(!gmOk\(p\)\)/.test(src), 'the GM branch must come first');
  const gmAt = src.indexOf("if(isGM){if(!gmOk(p))");
  const cloudAt = src.indexOf('if(CLOUD.api)return cloudAuth(u,p,false);');
  assert.ok(gmAt > 0 && cloudAt > gmAt, 'the cloud branch must sit after the GM branch in submitAuth');
});

await T('the client never sends a plaintext password anywhere but the login endpoint', async () => {
  const sends = [...src.matchAll(/JSON\.stringify\(\{\s*u\s*,\s*p\s*\}\)/g)];
  assert.strictEqual(sends.length, 1, 'the password must be stringified in exactly one place');
  const line = src.slice(src.lastIndexOf('cloudFetch', sends[0].index), sends[0].index + 60);
  assert.ok(/isReg\?'\/register':'\/sessions'/.test(line), 'and that place must be the register/login endpoint, got: ' + line.slice(0, 80));
});

await T('a save is never pushed before there is a user and a state', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 1 } } } });
  h.sandbox.CLOUD.on = true;                      // on, but nobody is logged in
  assert.strictEqual(await h.sandbox.cloudPush(true), 'idle');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save').length, 0);
});

await T('the local GM password feature and the cloud layer coexist', async () => {
  assert.ok(src.includes("const gmOk=p=>{const h=gmHash(p);if(h===String(GM_PASS_HASH))return true;"),
    'gmOk must survive the cloud changes');
  assert.ok(src.includes("if(CLOUD.api)return cloudAuth(u,p,false);"), 'the cloud login branch must exist');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
