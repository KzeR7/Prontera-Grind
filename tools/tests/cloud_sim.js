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
    currentUser: null, logs: [], asks: [], askLabels: [], saves: 0, offlineCalls: 0, offlineClaims: [], downloads: [], lastBlob: null,
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
    AbortController, clearTimeout,   // cloudAuth gives up after AUTH_TIMEOUT_MS (v88.3); setTimeout is stubbed below
    fetch: fetchStub,
    localStorage: {
      get length() { return store.size; },
      key: i => [...store.keys()][i] ?? null,
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    document: {
      visibilityState: 'visible', getElementById: id => els.get(id) || null,
      body: { appendChild() {} },
      createElement: () => ({
        click() { this._clicked = true; state.downloads.push({ name: this.download, blob: state.lastBlob }); },
        remove() {},
      }),
    },
    URL: { createObjectURL(b) { state.lastBlob = b; return 'blob:test'; }, revokeObjectURL() {} },
    FileReader: class { readAsText(f) { this.result = f.text; this.onload && this.onload(); } },
    navigator: {},
    addEventListener: () => {},
    setInterval: () => 0,
    setTimeout: (fn) => { if (opts.runTimers) fn(); return 0; },
    log: (m, cls, cat) => state.logs.push({ m, cls, cat }),
    cloudMsg: null,
    $: id => els.get(id) || null,
    ui: () => { state.uiCalls = (state.uiCalls || 0) + 1; },
    qRefresh: () => {}, newQuest: q => ({ type: q }), fresh: () => ({ lv: 1, cls: 'Novice', zeny: 0, kills: 0, st: { str: 1 }, q: [] }),
    // The game's load() parses the saved blob for the logged-in name; mirror that here so a test
    // that restores or adopts a save is checked against what would really be played.
    load: () => {
      const base = { lv: 9, cls: 'Novice', zeny: 5, kills: 0, st: { str: 1 }, q: [] };
      let saved = null;
      try { saved = JSON.parse(store.get('pg_save3_' + (sandbox.currentUser || '')) || 'null'); } catch (e) { saved = null; }
      return Object.assign(base, saved || {}, opts.loadReturn || {});
    },
    lsPut: (k, v) => { store.set(k, String(v)); },
    lsGet: k => (store.has(k) ? store.get(k) : null),
    iname: it => it.name,
    totalPts: () => 100,
    ELITELV: 100,
    MAPS: [1, 2, 3], save: () => { state.saves++; }, safeCount: v => Math.max(0, Math.floor(Number(v) || 0)),
    applyOfflineProgress: (now, claim) => { state.offlineCalls++;state.offlineClaims.push(claim||null);if(claim&&sandbox.S)sandbox.S.offlineClaimId=claim.id; },
    initSession: () => { state.localSession = true; },
    showErr: m => state.err = m,
    rememberUserId: (u, force) => { state.remembered = u; state.rememberForced = !!force; },
    getAcc: () => ({}), setAcc: () => {}, hashPw: () => 'h', gmOk: () => false, GM_USER: 'GM',
    ask: (msg, yes, labels) => { state.asks.push(msg); state.askLabels.push(labels || {}); if (opts.answerAsk !== false) state.askPromise = yes(); },
    authMode: 'login', hudRate: null, zenyEarned: 0,
  };
  sandbox.$ = sandbox.$;
  sandbox.globalThis = sandbox;
  sandbox.S = state.S;                 // the game state the block mutates
  sandbox.currentUser = null;          // and the account name it works against
  sandbox.BUILD = '2026-10-06 grind-test';
  // A couple of the game's own element hooks the block writes to.
  for (const id of ['cloudBadge', 'loginCloud', 'userBadge', 'conflict', 'conflictWhy', 'conflictCards', 'cfThis', 'cfCloud', 'cfLater',
    'loginOverlay', 'logoutBtn', 'saveDl', 'saveUp', 'saveFile'])
    els.set(id, { id, textContent: '', title: '', style: {}, set onclick(fn) { this._onclick = fn; }, get onclick() { return this._onclick; }, innerHTML: '' });
  els.get('cfLater').onclick = null;
  // A top-level `const` inside vm.runInContext does NOT become a property of the sandbox, so the
  // block's bindings are copied onto globalThis explicitly: that is how a suite drives them.
  const EXPORTS = ['CLOUD','cloudProbe','cloudPush','cloudFlush','cloudFlushNow','cloudConflict',
    'cloudAdopt','cloudPull','cloudApplyGrants','ptsSpent','cloudAuth','cloudLogout','cloudTouch',
    'cloudSession','initSessionFromCloud','saveKeyFor','cloudBadge','cloudSay','cloudFetch',
    'cloudJoin','cloudRefresh','cloudStart','saveBackup','restoreBackup',
    // v82 usage diet: the cadence constants and the poll tick are asserted on directly.
    'CLOUD_DEBOUNCE','CLOUD_HIDDEN_DEBOUNCE','CLOUD_POLL_MS','CLOUD_HIDDEN_POLL_MS',
    'cloudPollTick','cloudHidden'];
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

await T('a live session cookie is not a door: every load stops at the login card (v83 owner request)', async () => {
  for (const me of [{ status: 200, body: { u: 'FRIEND', gm: 0 } }, { status: 200, body: { u: 'GM', gm: 2 } }, { status: 401, body: {} }]) {
    const h = harness({ routes: { '/me': me } });
    assert.strictEqual(await h.sandbox.cloudProbe(), false, 'the probe must never start a session by itself');
    assert.strictEqual(h.sandbox.CLOUD.on, false, 'nobody is signed in until a password is typed');
    assert.strictEqual(h.sandbox.currentUser, null, 'no account is adopted behind the card');
  }
  const h = harness({ routes: { '/me': { status: 200, body: { u: 'FRIEND', gm: 0 } } } });
  await h.sandbox.cloudProbe();
  await new Promise(r => setImmediate(r));
  assert.strictEqual(h.sandbox.CLOUD.api, true, 'a real API is still detected - only the free pass is gone');
  assert.ok(h.calls.some(c => c.url === '/api/sessions' && c.init.method === 'DELETE'),
    'the leftover cookie session is deleted instead of being left to pile up on the server');
  assert.match(h.els.get('loginCloud').textContent, /sign in to continue|register or sign in/i);
  // the GM account has no shortcut around the card, and neither does a remembered name
  assert.ok(src.includes("addEventListener('load',()=>{setTimeout(cloudProbe,80)});"), 'every load still runs the probe, which now only reports the API');
  assert.ok(!/cloudProbe[\s\S]{0,600}initSessionFromCloud/.test(src), 'the probe must not be able to log anybody in');
  assert.ok(/function restoreRememberedUser\(\)\{[\s\S]*?field\.value=name/.test(src), 'Remember me only pre-fills the username');
});

await T('cloud login hands the server claim to the reward applier and syncs its claim ID', async () => {
  const blob=JSON.stringify({lv:12,cls:'Novice',zeny:100,kills:5,st:{str:1}});
  const offlineClaim={id:41,awayMs:8*3600000,creditedMs:4*3600000,rateKph:100,kills:200,remainder:0};
  const h=harness({storage:{'pg_save3_FRIEND':blob},routes:{'/save':(n,init)=>init&&init.method==='PUT'
    ?{status:200,body:{version:5,offlineClaimId:41}}
    :{status:200,body:{version:4,blob,offlineClaim}}}});
  h.sandbox.CLOUD.api=true;h.sandbox.CLOUD.on=true;h.sandbox.CLOUD.ver=4;h.sandbox.currentUser='FRIEND';
  h.sandbox.S={lv:12,cls:'Novice',zeny:100,kills:5,st:{str:1}};
  await h.sandbox.cloudJoin('FRIEND',blob);
  assert.strictEqual(h.state.offlineCalls,1);
  assert.strictEqual(h.state.offlineClaims[0].id,41);
  const body=JSON.parse(h.calls.find(c=>c.url==='/api/save'&&c.init.method==='PUT').init.body);
  assert.strictEqual(body.offlineClaimId,41,'the acknowledged save carries the server claim ID');
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
  assert.strictEqual(h.state.remembered, 'NEW', 'a successful cloud registration remembers its username');
  assert.strictEqual(h.state.rememberForced, true, 'cloud registration turns remember-user on automatically');
  assert.match(h.state.asks[0], /ABCD-EFGH-JKLM-NPQR/, 'the code is in it');
  assert.match(h.state.asks[0], /Save this recovery code somewhere safe/);
  assert.strictEqual(h.state.askLabels[0].yes, 'I saved it — enter the game', 'confirmation clearly leads into play');
  await h.state.askPromise;                       // the player saves the code and enters the game
  assert.strictEqual(h.sandbox.CLOUD.on, true, 'and accepting it starts the session');
  assert.strictEqual(h.state.offlineCalls, 0, 'cloud sessions do not trust local timestamps when the server issued no claim');
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

// -------------------------------------------- login: which copy wins, and how ----
const loginHarness = (opts = {}) => harness(Object.assign({
  routes: {
    '/save': { status: 200, body: { version: 3, blob: null, savedAt: 1 } },
    '/grants': { status: 200, body: { grants: [] } },
    '/messages': { status: 200, body: { messages: [] } },
  },
}, opts));

await T('registering with progress already in this browser: it is uploaded, never discarded', async () => {
  const local = JSON.stringify({ lv: 33, cls: 'Knight', zeny: 500, kills: 7, st: { str: 1 }, q: [] });
  const h = loginHarness({
    storage: { 'pg_save3_KzeR': local },
    routes: {
      '/save': (n, init) => (init.method === 'PUT'
        ? { status: 200, body: { version: 1 } }
        : { status: 200, body: { version: 0, blob: null } }),
      '/grants': { status: 200, body: { grants: [] } },
      '/messages': { status: 200, body: { messages: [] } },
    },
    loadReturn: { lv: 33, cls: 'Knight', q: [] },
  });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('KzeR', 2, true);
  const put = h.calls.find(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.ok(put, 'the device\'s progress must be uploaded to the brand-new account');
  // Pushed as the LIVE save, so it is re-serialised rather than byte-identical - what must survive is
  // the progress itself (level, class, Zeny, kills), not the exact text of the old blob.
  const pushed = JSON.parse(JSON.parse(put.init.body).blob);
  assert.strictEqual(pushed.lv, 33);
  assert.strictEqual(pushed.cls, 'Knight');
  assert.strictEqual(pushed.zeny, 500);
  assert.strictEqual(pushed.kills, 7);
  assert.strictEqual(h.store.get('pg_save3_KzeR'), local, 'and the device keeps its own copy');
  assert.strictEqual(h.els.get('conflict').style.display || 'none', 'none', 'nothing to choose between here');
});

await T('logging in where the cloud already has the same save: silent, just a version agreed', async () => {
  const local = JSON.stringify({ lv: 20, cls: 'Mage', zeny: 10, kills: 1, st: { str: 1 }, q: [] });
  const h = loginHarness({ storage: { 'pg_save3_X': local }, routes: {
    '/save': { status: 200, body: { version: 9, blob: local } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('X', 0, false);
  assert.strictEqual(h.els.get('conflict').style.display || 'none', 'none', 'identical copies need no question');
  assert.strictEqual(h.sandbox.CLOUD.ver, 9, 'the client must adopt the server\'s version');
  assert.strictEqual(h.sandbox.CLOUD.dirty, false);
});

await T('logging in where the cloud has a DIFFERENT save: the player is asked', async () => {
  const local = JSON.stringify({ lv: 20, cls: 'Mage', zeny: 10, kills: 1, st: { str: 1 }, q: [] });
  const cloud = JSON.stringify({ lv: 51, cls: 'Sniper', zeny: 90000, kills: 400, st: { str: 1 }, q: [] });
  const h = loginHarness({ storage: { 'pg_save3_X': local }, routes: {
    '/save': { status: 200, body: { version: 12, blob: cloud, savedAt: 7 } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('X', 0, false);
  assert.strictEqual(h.els.get('conflict').style.display, 'flex', 'two different saves must be the player\'s call');
  assert.strictEqual(h.store.get('pg_save3_X'), local, 'and nothing is written while they decide');
});

await T('a new device with no local save simply loads the cloud character', async () => {
  const cloud = JSON.stringify({ lv: 44, cls: 'Priest', zeny: 1, kills: 2, st: { str: 1 }, q: [] });
  const h = loginHarness({
    routes: { '/save': { status: 200, body: { version: 5, blob: cloud } },
      '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } } },
    loadReturn: { lv: 44, cls: 'Priest', q: [] },
  });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('X', 0, false);
  assert.strictEqual(h.store.get('pg_save3_X'), cloud, 'the cloud save becomes this device\'s save');
  assert.strictEqual(h.els.get('conflict').style.display || 'none', 'none');
});

await T('a long-hidden tab adopts another device\'s save when it has nothing of its own to lose', async () => {
  const cloud = JSON.stringify({ lv: 60, zeny: 5, kills: 1, st: { str: 1 }, q: [] });
  const h = loginHarness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 40 }) },
    routes: { '/save': { status: 200, body: { version: 8, blob: cloud } }, '/grants': { status: 200, body: {} }, '/messages': { status: 200, body: {} } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.dirty = false; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudRefresh();
  assert.strictEqual(h.store.get('pg_save3_X'), cloud, 'a clean tab can follow the account');
  assert.strictEqual(h.sandbox.CLOUD.ver, 8);
});

await T('but a tab with unsynced progress is asked instead of being overwritten', async () => {
  const cloud = JSON.stringify({ lv: 60, zeny: 5, kills: 1, st: { str: 1 }, q: [] });
  const h = loginHarness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 41 }) },
    routes: { '/save': { status: 200, body: { version: 8, blob: cloud } }, '/grants': { status: 200, body: {} }, '/messages': { status: 200, body: {} } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.dirty = true; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudRefresh();
  assert.strictEqual(h.els.get('conflict').style.display, 'flex');
  assert.strictEqual(h.store.get('pg_save3_X'), JSON.stringify({ lv: 41 }), 'the unsynced copy is left alone');
});

// --------------------------------------------------- carrying saves to a new address ----
await T('the backup file holds this device\'s characters and NOTHING else', async () => {
  const h = loginHarness({ storage: {
    'pg_save3_KzeR': '{"lv":70}', 'pg_save3_Friend': '{"lv":12}', 'pg_acc4': '{"KzeR":"hash"}',
    'pg_gm_local': 'deadbeef',                        // the browser-local GM marker
    'unrelated_key': 'x',
  } });
  h.sandbox.BUILD = 'test';
  h.sandbox.saveBackup();
  assert.strictEqual(h.state.downloads.length, 1);
  const dump = JSON.parse(await h.state.downloads[0].blob.text());
  assert.deepStrictEqual(Object.keys(dump.keys).sort(), ['pg_acc4', 'pg_save3_Friend', 'pg_save3_KzeR'],
    'exactly the saves and the browser account list');
  assert.ok(!('pg_gm_local' in dump.keys), 'the GM marker must never leave the browser in a backup file');
  assert.ok(!('unrelated_key' in dump.keys));
  assert.match(dump.download || h.state.downloads[0].name, /prontera-grind-saves-\d{4}-\d{2}-\d{2}\.json/);
  assert.ok(dump.at > 0 && dump.kind === 'save-backup');
});

await T('restoring writes the saves - and cannot write anything else, however the file is built', async () => {
  const h = loginHarness({ storage: {}, answerAsk: true });
  const file = { text: JSON.stringify({
    kind: 'save-backup', v: 1, keys: {
      'pg_save3_KzeR': '{"lv":70}', 'pg_acc4': '{}',
      'pg_gm_local': 'deadbeef',                      // a hostile "backup" trying to grant itself GM
      'pg_something_else': 'x',
    } }) };
  h.sandbox.restoreBackup(file);
  assert.strictEqual(h.store.get('pg_save3_KzeR'), '{"lv":70}', 'the character is restored');
  assert.strictEqual(h.store.get('pg_acc4'), '{}');
  assert.strictEqual(h.store.get('pg_gm_local'), undefined, 'a backup file must never be able to set the GM marker');
  assert.strictEqual(h.store.get('pg_something_else'), undefined, 'nor any other key');
  assert.strictEqual(h.state.asks.length, 1, 'and it asks before overwriting anything');
});

await T('restoring asks before it replaces a character already on this device', async () => {
  const h = loginHarness({ storage: { 'pg_save3_KzeR': '{"lv":70}' }, answerAsk: false });  // player says no
  h.sandbox.restoreBackup({ text: JSON.stringify({ kind: 'save-backup', keys: { 'pg_save3_KzeR': '{"lv":1}' } }) });
  assert.match(h.state.asks[0], /replaces the copy already on this device/i);
  assert.strictEqual(h.store.get('pg_save3_KzeR'), '{"lv":70}', 'declining leaves the device untouched');
});

await T('a file that is not a backup is refused, and nothing is written', async () => {
  const h = loginHarness({ storage: { 'pg_save3_X': '{"lv":70}' }, answerAsk: true });
  for (const bad of ['not json at all', JSON.stringify({ hello: 'world' }), JSON.stringify({ kind: 'save-backup' })]) {
    h.sandbox.restoreBackup({ text: bad });
    assert.strictEqual(h.store.get('pg_save3_X'), '{"lv":70}');
    assert.match(h.state.err, /not a Prontera Grind save backup/i, 'a file that is not a backup: ' + bad.slice(0, 20));
  }
  // A well-formed backup with no game keys in it is its own answer, not a crash.
  h.sandbox.restoreBackup({ text: JSON.stringify({ kind: 'save-backup', keys: { 'pg_gm_local': 'x' } }) });
  assert.match(h.state.err, /holds no characters/i);
  assert.strictEqual(h.state.asks.length, 0, 'a file that is not a backup never gets as far as a question');
});

await T('the poll fetches announcements and gifts, and never the save itself', async () => {
  const h = loginHarness({ routes: {
    '/grants': { status: 200, body: { grants: [{ id: 5, kind: 'zeny', payload: { amount: 1000 } }] } },
    '/messages': { status: 200, body: { messages: [{ id: 1, body: 'Server restart at 22:00', kind: 'notice' }] } },
    '/save': { status: 200, body: { version: 2, blob: '{"lv":1}' } },
  } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.api = true; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudPull();
  assert.ok(h.state.logs.some(l => /Server restart/.test(l.m)), 'the announcement reaches the log');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save').length, 0,
    'a poll must not touch the save: that is what keeps it from ever overwriting play');
});

// ------------------------------------------------- the v82 usage diet ----
// Every push is one Function request and one D1 row written, so the cadence IS the cost. These
// pin the numbers the free-plan arithmetic in tools/server-shift-plan.md §3b is built on.
await T('a push waits a minute while you play, and five while the tab is hidden', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 2 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 1; h.sandbox.currentUser = 'X';
  assert.strictEqual(h.sandbox.CLOUD_DEBOUNCE, 60000, 'the plan\'s own budget assumes a 60-second debounce');
  assert.strictEqual(h.sandbox.CLOUD_HIDDEN_DEBOUNCE, 300000, 'a hidden tab backs off to five minutes');
  const realNow = Date.now;
  try {
    let t = realNow();
    Date.now = () => t;
    h.sandbox.CLOUD.lastPush = t; h.sandbox.CLOUD.dirty = true;
    t += 45000;
    assert.strictEqual(await h.sandbox.cloudFlush(), 'idle', '45s is inside the visible debounce');
    t += 20000;
    assert.strictEqual(await h.sandbox.cloudFlush(), 'ok', 'just past a minute sends');
    h.sandbox.document.hidden = true;
    assert.strictEqual(h.sandbox.cloudHidden(), true, 'the block must notice a background tab');
    h.sandbox.CLOUD.dirty = true; t += 60000;
    assert.strictEqual(await h.sandbox.cloudFlush(), 'idle', 'a hidden tab does not push every minute');
    t += 300000;
    assert.strictEqual(await h.sandbox.cloudFlush(), 'ok', 'five minutes hidden is the cadence');
    // ...and a forced flush (tab closing, player chose a save) always sends, whatever the clock says.
    h.sandbox.CLOUD.dirty = true;
    assert.strictEqual(await h.sandbox.cloudFlushNow(), 'ok', 'a forced flush ignores the back-off');
  } finally { Date.now = realNow; }
});

await T('the announcement poll asks every 5 minutes visible, every 15 hidden', async () => {
  const h = harness({ routes: { '/grants': { body: { grants: [] } }, '/messages': { body: { messages: [] } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X';
  const realNow = Date.now;
  const asks = () => h.calls.filter(c => c.url === '/api/grants').length;
  try {
    let t = realNow();
    Date.now = () => t;
    h.sandbox.cloudPollTick();
    assert.strictEqual(asks(), 1, 'the first tick asks');
    t += 60000; h.sandbox.cloudPollTick();
    assert.strictEqual(asks(), 1, 'a minute later is still quiet');
    t += 300000; h.sandbox.cloudPollTick();
    assert.strictEqual(asks(), 2, 'five minutes of a visible tab asks');
    h.sandbox.document.hidden = true;
    t += 600000; h.sandbox.cloudPollTick();
    assert.strictEqual(asks(), 2, 'ten minutes hidden is still quiet');
    t += 600000; h.sandbox.cloudPollTick();
    assert.strictEqual(asks(), 3, 'fifteen minutes hidden asks');
  } finally { Date.now = realNow; }
});

await T('a tab that comes back holding unsynced progress pushes it instead of opening the chooser', async () => {
  // The normal cause: the browser suspended the tab (phone in a pocket) so no push happened, and it
  // wakes up with a newer save and an old version number. The server has not moved on, so there is
  // only one right answer - asking would be a dialog with one button.
  const onServer = JSON.stringify({ lv: 20, cls: 'Novice', zeny: 10, kills: 3, st: { str: 1 } });
  const here = JSON.stringify({ lv: 20, cls: 'Novice', zeny: 900, kills: 40, st: { str: 1 } });
  const h = harness({ storage: { 'pg_save3_X': here },
    S: { lv: 20, cls: 'Novice', zeny: 900, kills: 40, st: { str: 1 } },
    routes: { '/save': (n, init) => init && init.method === 'PUT'
      ? { status: 200, body: { version: 8 } } : { status: 200, body: { version: 7, blob: onServer, savedAt: 1 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 7;
  h.sandbox.CLOUD.dirty = true; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudRefresh();
  assert.notStrictEqual(h.els.get('conflict').style.display, 'flex', 'no chooser for a dialog with one answer');
  const put = h.calls.filter(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.strictEqual(put.length, 1, 'the newer local copy is pushed');
  assert.ok(JSON.parse(put[0].init.body).blob.includes('"zeny":900'), 'and it is THIS device\'s save that was sent');
  // A REAL conflict - another device wrote while this one was away - still asks.
  const h2 = harness({ storage: { 'pg_save3_X': here }, S: { lv: 20, cls: 'Novice', zeny: 900, kills: 40, st: { str: 1 } },
    routes: { '/save': { status: 200, body: { version: 9, blob: onServer, savedAt: 2 } } } });
  h2.sandbox.CLOUD.api = true; h2.sandbox.CLOUD.on = true; h2.sandbox.CLOUD.ver = 7;
  h2.sandbox.CLOUD.dirty = true; h2.sandbox.currentUser = 'X';
  await h2.sandbox.cloudRefresh();
  assert.strictEqual(h2.els.get('conflict').style.display, 'flex', 'a version we have never seen is the player\'s call');
});

await T('v88: the town is fully gone - no code, no card, no atlas, no console hooks', async () => {
  // The owner asked for the Prontera Town map removed outright: no space, no loading, nowhere.
  for (const gone of ['function townEnter(', 'function townLeave(', 'function townToggle(', 'function townWalk(',
                      'const TOWN_NPC=', 'const TOWN_OPEN=', 'townPackFetch', 'townUnlocked', 'townMarkerStep',
                      'window.town=', 'window.townUnlock=', 'window.TOWN_NPC=', "data-a=\"town\"",
                      'mapcard town-card', 'mapcard.closed', 'class=\"npcrow\"', 'class=\"npcchip\"',
                      'id=\"npcBox\"', 'id=\"npcLayer\"', '#npcBox{', '.npc-tag{', 'assets/town/', 'S.town']) {
    assert.ok(!src.includes(gone), 'index.html must not contain ' + gone);
  }
  assert.ok(!fs.existsSync(path.join(root, 'assets', 'town')), 'assets/town/ is deleted (the 9.2 MB atlas)');
  assert.ok(!fs.existsSync(path.join(root, 'Updates', 'town-hd')), 'Updates/town-hd/ is deleted (the HD source art)');
  assert.ok(!fs.existsSync(path.join(root, 'tools', 'tests', 'town_smoke.js')), 'the town smoke suite is deleted with the map');
  assert.ok(!fs.existsSync(path.join(root, 'tools', 'make_town_pack.py')), 'the town pack tool is deleted too');
});

// ------------------------------------------ one cookie, two tabs: whose save is it? ----
// The browser's session cookie is shared by every tab. A tab that is still playing account A must
// never upload to, adopt from, or take gifts from account B (the GM character reached a player's
// account this way). The server refuses the write; these pin the client's stop and its message.
await T('a save refused for another account stops this tab and uploads nothing', async () => {
  const h = harness({ routes: { '/save': { status: 409, body: { err: 'This tab is playing a different account.', accountMismatch: true, owner: 'SECOND' } } } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'OWNERGM'; h.sandbox.currentUser = 'OWNERGM';
  const res = await h.sandbox.cloudPush(true);
  assert.strictEqual(res, 'idle');
  assert.strictEqual(h.sandbox.CLOUD.paused, true, 'sync is stopped in this tab');
  assert.strictEqual(h.state.asks.length, 0, 'no two-saves dialog for a different account');
  assert.ok(h.state.logs.some(l => /Nothing from this tab was uploaded/.test(l.m) && /OWNERGM/.test(l.m) && /SECOND/.test(l.m)), 'the player is told why');
  const put = h.calls.find(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.strictEqual(JSON.parse(put.init.body).owner, 'OWNERGM', 'every write names the account it is playing');
});

await T('a gift list for another account is never applied or claimed', async () => {
  const h = harness({ routes: { '/grants': { status: 200, body: { grants: [{ id: 1, kind: 'zeny', payload: { amount: 999 } }], owner: 'SECOND' } } } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'OWNERGM';
  const before = h.sandbox.S.zeny;
  await h.sandbox.cloudPull();
  assert.strictEqual(h.sandbox.S.zeny, before, 'the other account\'s gift does not reach this character');
  assert.strictEqual(h.sandbox.CLOUD.paused, true);
  assert.ok(!h.calls.some(c => c.url === '/api/grants' && c.init.method === 'POST'), 'and is not claimed');
});

await T('gifts for the account this tab is playing are still applied', async () => {
  const h = harness({ routes: { '/grants': { status: 200, body: { grants: [{ id: 1, kind: 'zeny', payload: { amount: 999 } }], owner: 'OWNERGM' } } } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'OWNERGM';
  const before = h.sandbox.S.zeny;
  await h.sandbox.cloudPull();
  assert.strictEqual(h.sandbox.S.zeny, before + 999);
  assert.strictEqual(h.sandbox.CLOUD.paused, false);
});

await T('a login does not adopt another account\'s cloud save into this tab', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 4, blob: JSON.stringify({ lv: 99, cls: 'Merchant' }), owner: 'SECOND' } } } });
  h.sandbox.CLOUD.on = true;
  await h.sandbox.cloudJoin('OWNERGM', JSON.stringify(h.sandbox.S));
  assert.notStrictEqual(h.els.get('conflict').style.display, 'flex', 'no two-saves chooser offering the other account\'s save');
  assert.strictEqual(h.sandbox.CLOUD.paused, true);
  assert.strictEqual(h.store.has('pg_save3_OWNERGM'), false, 'nothing is written under this account');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
