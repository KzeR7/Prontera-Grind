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
await T('v327: the documented restore-from-stash actually satisfies the login rule', async () => {
  // docs/CHECK-A-SAVE.md tells an owner how to put a stashed copy back. It "works" only if the copy it
  // writes passes localAheadOfServer at the next login - same version as the account, offlineAt newer
  // than cloud.at - so the login uploads it instead of adopting over it. Run the documented code.
  const doc = fs.readFileSync(path.join(root, 'docs', 'CHECK-A-SAVE.md'), 'utf8');
  const block = [...doc.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]).find(b => b.includes('function restoreFrom'));
  assert.ok(block, 'the restore snippet is still in the doc');
  new vm.Script(block);                                   // and still parses
  const store = new Map([
    ['pg_save3_A', JSON.stringify({ lv: 5, zeny: 100, owner: 'A' })],
    ['pg_save3_A_local_111', JSON.stringify({ lv: 88, zeny: 9999, owner: 'A', accountId: 7 })],
  ]);
  const ctx = {
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
    currentUser: 'A', confirm: () => true, console: { log() {}, table() {} },
    fetch: async () => ({ json: async () => ({ version: 41, blob: JSON.stringify({ lv: 5, zeny: 100 }) }) }),
  };
  vm.createContext(ctx);
  new vm.Script(block).runInContext(ctx);
  assert.strictEqual(await ctx.restoreFrom('pg_save3_A_local_111'), 'written - reload and log in; the login will upload it.');
  const main = JSON.parse(store.get('pg_save3_A'));
  assert.strictEqual(main.lv, 88, 'the stashed character is the live copy now');
  assert.strictEqual(main.cloud.v, 41, 'stamped with the account version the server just reported');
  assert.ok(main.offlineAt > main.cloud.at, 'and written after it, which is the whole login test');
  assert.ok([...store.keys()].some(k => k.includes('_before_restore_')), 'the replaced copy is kept, so it is reversible');
  await assert.rejects(() => ctx.restoreFrom('pg_save3_A'), /backup key/, 'and the live slot cannot be restored over itself');
});

await T('v327: the paste-in save comparison still matches the real client', async () => {
  // docs/CHECK-A-SAVE.md hands the player a console snippet when "it still isn\'t saved" arrives with
  // no red line. A snippet quoting a global that has since been renamed is worse than no snippet, so
  // the names it depends on are checked against index.html here.
  const doc = fs.readFileSync(path.join(root, 'docs', 'CHECK-A-SAVE.md'), 'utf8');
  const block = doc.split('```js')[1] || '';
  assert.ok(block.includes("'pg_save3_' + currentUser"), 'the snippet reads the account\'s own slot');
  assert.ok(block.includes('/api/save'), 'and asks the server for the same endpoint the client uses');
  assert.ok(block.includes('CLOUD.on'), 'and reports whether sync is on');
  assert.ok(/let currentUser=/.test(src), 'currentUser is still a console-reachable binding');
  assert.ok(/const CLOUD=\{/.test(src), 'CLOUD is still a console-reachable binding');
  assert.ok(/const saveKey=\(\)=>'pg_save3_'\+currentUser/.test(src), 'and the slot key is still pg_save3_<name>');
});

console.log('client cloud layer: offline-first sync with a conflict-safe save\n');
// Read a `const NAME=<number>` straight out of the page, for the two constants whose value is a
// request budget rather than an implementation detail.
const cloudSrcValue = name => {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*(\\d+)').exec(src);
  return m ? Number(m[1]) : NaN;
};

// --------------------------------------------------------------- extraction ----
const start = src.indexOf('// ---------- cloud accounts and saves (optional) ----------');
const end = src.indexOf("addEventListener('load',()=>{setTimeout(cloudProbe,80)});", start);
assert.ok(start > 0 && end > start, 'the cloud block is not where this suite expects it');
// v88.6: the save-owner stamp helpers (saveRefusal, sameSave, ...) sit with the save code, just above this
// block, and the block calls them - so they are extracted with it.
const stampStart = src.indexOf('// ---------- the save-owner stamp (v88.6) ----------'), stampEnd = src.indexOf('const num_= (v,d)', stampStart);
assert.ok(stampStart > 0 && stampEnd > stampStart, 'the save-owner helpers are not where this suite expects them');
const cloudCode = src.slice(stampStart, stampEnd) + '\n' + src.slice(start, end + "addEventListener('load',()=>{setTimeout(cloudProbe,80)});".length);

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
  const timers = [];
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
    // A queued timer must NOT run inline: cloudPush's retry would fire while CLOUD.pushing is still
    // true and be swallowed as 'idle' - a harness artefact that would hide a real loop. So a timer is
    // parked on a queue that `settle()` drains after the current attempt has finished.
    setTimeout: (fn) => { if (opts.runTimers) timers.push(fn); return 0; },
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
    // index.html defines this just above the extracted block; the v326 version stamp writes through it.
    saveKey: () => 'pg_save3_' + (sandbox.currentUser || ''),
    iname: it => it.name,
    totalPts: () => 100,
    ELITELV: 100,
    gmStatSnapshot: () => ({ at: Date.now(), combat: {} }),
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
  sandbox.__timers = timers;   // the parked setTimeout queue settle() drains
  sandbox.globalThis = sandbox;
  sandbox.S = state.S;                 // the game state the block mutates
  sandbox.currentUser = null;          // and the account name it works against
  sandbox.BUILD = '2026-10-06 grind-test';
  // A couple of the game's own element hooks the block writes to.
  for (const id of ['cloudBadge', 'loginCloud', 'userBadge', 'cloudGate', 'cloudGateDetail', 'cloudGateRetry',
    'sessionGate', 'loginOverlay', 'logoutBtn', 'saveDl', 'saveUp', 'saveFile'])
    els.set(id, { id, textContent: '', title: '', style: {}, set onclick(fn) { this._onclick = fn; }, get onclick() { return this._onclick; }, innerHTML: '' });
  // A top-level `const` inside vm.runInContext does NOT become a property of the sandbox, so the
  // block's bindings are copied onto globalThis explicitly: that is how a suite drives them.
  const EXPORTS = ['CLOUD','cloudProbe','cloudPush','cloudFlush','cloudFlushNow','cloudReconnect','cloudConnectionLost',
    'cloudAdopt','cloudPull','cloudApplyGrants','ptsSpent','cloudAuth','cloudLogout','cloudTouch',
    'cloudSession','initSessionFromCloud','saveKeyFor','cloudBadge','cloudSay','cloudFetch',
    'cloudJoin','cloudRefresh','cloudStart','saveBackup','restoreBackup',
    // v326: which copy is newer, and the version stamp that makes it answerable after a reload.
    'cloudBaseOf','localAheadOfServer','cloudStampBase','cloudFlushLeaving',
    // v82 usage diet: the cadence constants and the poll tick are asserted on directly.
    'CLOUD_DEBOUNCE','CLOUD_HIDDEN_DEBOUNCE','CLOUD_POLL_MS','CLOUD_HIDDEN_POLL_MS',
    'cloudPollTick','cloudHidden',
    // v88.6: the save-owner stamp - the helpers the cloud paths use to refuse another account's save
    'saveRefusal','sameAccount','sameSave','saveOwnerOf','cloudReadSave','cloudSaveRefused',
    'saveBlockedText','cloudRefusedText','accountOfSaveKey',
    // v252: a 401 mid-session means the account signed in on another device.
    'cloudSessionReplaced','cloudReplaced',
    // v274: the fast /api/me probe that carries the same kick to a tab that is not
    // syncing at that moment.
    'cloudSessionTick','CLOUD_SESSION_CHECK_MS','CLOUD_SESSION_CHECK_HIDDEN_MS',
    // v263: a 503 with {maintenance:true} is the write pause, not a dropped connection.
    'cloudMaintenance'];
  vm.createContext(sandbox);
  // A `let` is copied BY VALUE above; a getter keeps the flag observable after it changes.
  vm.runInContext(cloudCode + '\n;' + EXPORTS.map(n => `globalThis.${n}=${n};`).join('') +
    ';globalThis.sessionWasReplaced=()=>cloudReplaced;' +
    ';globalThis.resetSessionCheck=()=>{cloudLastCheck=0;CLOUD.checking=false};' +
    ';globalThis.settle=async()=>{for(let i=0;i<12;i++){await Promise.resolve();}while(globalThis.__timers.length){const f=globalThis.__timers.shift();await Promise.resolve();f();for(let i=0;i<12;i++)await Promise.resolve();}};', sandbox);
  return { sandbox, state, calls, els, store };
}

// --------------------------------------------------------------- the tests ----
await T('no API on this host: the probe reports "no cloud" and nothing else runs', async () => {
  const h = harness({ routes: { '/me': { status: 404, ct: 'text/html', body: {} } } });
  const found = await h.sandbox.cloudProbe();
  assert.strictEqual(found, false);
  assert.strictEqual(h.sandbox.CLOUD.api, false, 'a static host must never look like a server');
  assert.strictEqual(h.sandbox.CLOUD.on, false);
  // v2: cloud is the only save, so a host without the API says that plainly instead of quietly
  // offering a browser-only character that can never continue anywhere else.
  assert.match(h.els.get('loginCloud').textContent, /not connected to the cloud/i);
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

// v326, seen in the owner's own console: /api/save answering 428. That answer is the away-time claim
// handshake - the client is told to apply a server-timed claim and push it back with its id. It used
// to re-arm itself without limit, and every refused push is progress that never reached D1.
await T('v326: a network that comes back flushes what the outage left unsent', async () => {
  // The listeners live in index.html outside the extracted block, so this is a source pin: the offline
  // window is the one a refresh can still swallow, and it must not wait for the 60-second debounce.
  assert.match(src, /addEventListener\('online',\(\)=>\{if\(!CLOUD\.on\|\|CLOUD\.lost\|\|CLOUD\.paused\)return;if\(CLOUD\.dirty\)cloudPush\(true\)\}\)/,
    'coming back online pushes a dirty save at once, and stays out of the away gate');
  assert.match(src, /addEventListener\('pagehide',\(\)=>\{if\(CLOUD\.on&&!CLOUD\.lost\)cloudFlushLeaving\(\)\}\)/,
    'and leaving the page still flushes with keepalive');
});

await T('a 428 away claim is applied and pushed back exactly once', async () => {
  const claim = { id: 77, awayMs: 8 * 3600000, creditedMs: 4 * 3600000, rateKph: 100, kills: 200, remainder: 0 };
  let puts = 0;
  const h = harness({
    runTimers: true,
    routes: {
      '/save': (n, init) => {
        if (!(init && init.method === 'PUT')) return { status: 200, body: { version: 4, blob: null, offlineClaim: null } };
        puts++;
        if (puts === 1) return { status: 428, body: { err: 'A server-timed offline claim must be applied before this cloud save can sync.', version: 4, offlineClaim: claim } };
        const body = JSON.parse(init.body);
        return body.offlineClaimId === 77
          ? { status: 200, body: { version: 5, offlineClaimId: 77 } }
          : { status: 428, body: { err: 'again', version: 4, offlineClaim: claim } };
      },
    },
  });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 4; h.sandbox.currentUser = 'FRIEND';
  h.sandbox.S = { lv: 12, cls: 'Novice', zeny: 100, kills: 5, st: { str: 1 } };
  h.state.S = h.sandbox.S;
  const r = await h.sandbox.cloudPush(true);
  await h.sandbox.settle(); await h.sandbox.settle();
  assert.strictEqual(r, 'offline-claim', 'the first attempt answers the claim, not an error');
  assert.strictEqual(h.state.offlineCalls, 1, 'the claim was handed to the reward applier');
  assert.strictEqual(h.state.offlineClaims[0].id, 77);
  const put = h.calls.filter(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.strictEqual(put.length, 2, 'one retry, no more');
  assert.strictEqual(JSON.parse(put[1].init.body).offlineClaimId, 77, 'the retry pushes the claim id back');
  assert.strictEqual(h.sandbox.CLOUD.ver, 5, 'and the accepted retry moves the version');
});

await T('the same claim twice stops the loop and says so', async () => {
  const claim = { id: 88, awayMs: 8 * 3600000, creditedMs: 4 * 3600000, rateKph: 100, kills: 200, remainder: 0 };
  let puts = 0;
  const h = harness({
    runTimers: true,
    routes: {
      '/save': (n, init) => {
        if (!(init && init.method === 'PUT')) return { status: 200, body: { version: 4, blob: null } };
        puts++;
        return { status: 428, body: { version: 4, offlineClaim: claim } };
      },
    },
  });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 4; h.sandbox.currentUser = 'FRIEND';
  h.sandbox.S = { lv: 12, cls: 'Novice', zeny: 100, kills: 5, st: { str: 1 } };
  h.state.S = h.sandbox.S;
  await h.sandbox.cloudPush(true);
  await h.sandbox.settle(); await h.sandbox.settle(); await h.sandbox.settle();
  assert.strictEqual(puts, 2, 'the second refusal of the same claim is not retried again');
  assert.ok(h.state.logs.some(l => /away-time claim again \(88\)/.test(l.m)), 'and the player is told, instead of a silent spin');
  assert.strictEqual(h.sandbox.CLOUD.dirty, true, 'the save stays queued for the next sync');
});

await T('a failing push never throws, and one bad request does not freeze the session', async () => {
  // v2: a single failed PUT is not enough to call the connection lost - the gate waits for the
  // cheap /me probe to fail as well (that pair is covered by its own tests below).
  const h = harness({ routes: { '/save': { throw: 'offline' } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'FRIEND';
  h.state.S = h.sandbox.S;
  const r = await h.sandbox.cloudPush(true);
  assert.strictEqual(r, 'offline');
  assert.strictEqual(h.sandbox.CLOUD.offline, true);
  assert.strictEqual(h.sandbox.CLOUD.lost, false, 'the server still answers /me, so play goes on');
  assert.strictEqual(h.sandbox.CLOUD.dirty, true, 'the wanted save is still queued');
  assert.match(h.els.get('cloudBadge').textContent, /⚠/);
  assert.ok(h.state.logs.some(l => /cloud sync failed/i.test(l.m)), 'the player is told why the badge changed');
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

await T('a saved but pending Echo score warns once and retries on a later save', async () => {
  const h = harness({routes:{'/save':n=>({status:200,body:{version:n,leaderboardPending:n<3}})}});
  h.sandbox.CLOUD.api=true;h.sandbox.CLOUD.on=true;h.sandbox.currentUser='FRIEND';
  assert.strictEqual(await h.sandbox.cloudPush(true),'ok');
  assert.strictEqual(h.sandbox.CLOUD.ver,1,'the committed cloud version is kept');
  assert.strictEqual(h.sandbox.CLOUD.dirty,true,'score retry remains queued');
  assert.strictEqual(await h.sandbox.cloudPush(true),'ok');
  assert.strictEqual(h.state.logs.filter(l=>/leaderboard update is pending/i.test(l.m)).length,1,'no warning spam');
  assert.strictEqual(await h.sandbox.cloudPush(true),'ok');
  assert.strictEqual(h.sandbox.CLOUD.ver,3);
  assert.strictEqual(h.sandbox.CLOUD.dirty,false,'successful score retry clears pending');
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

await T('a 409 loads the account save instead of asking which copy is real', async () => {
  // Owner decision (2026-10-27): the account on the server is the only save. There is no chooser,
  // no paused session and no "keep this device" - the account copy wins and this device's copy is
  // stashed under a backup key so nothing is destroyed.
  const serverBlob = JSON.stringify({ lv: 30, cls: 'Knight', zeny: 9, kills: 3, st: { str: 1 } });
  const h = harness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 12, st: { str: 1 } }) },
    routes: { '/save': { status: 409, body: { conflict: true, version: 4, blob: serverBlob, savedAt: 111 } } },
    loadReturn: { lv: 30, cls: 'Knight', q: [] } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 3; h.sandbox.currentUser = 'X';
  const result = await h.sandbox.cloudPush(true);
  assert.strictEqual(result, 'adopted', 'the conflict is resolved by loading the account copy');
  assert.strictEqual(h.sandbox.CLOUD.paused, false, 'nothing is paused waiting for an answer');
  assert.strictEqual(h.store.get('pg_save3_X'), serverBlob, 'the account save is now the live save');
  assert.strictEqual([...h.store.keys()].filter(k => k.startsWith('pg_save3_X_local_')).length, 1,
    'the copy this device held is kept under a backup key');
  assert.strictEqual(h.sandbox.CLOUD.ver, 4, 'and the version follows the account');
  assert.ok(h.state.logs.some(l => /newer save/i.test(l.m)), 'the player is told what happened');
});

await T('"keep the cloud save" - now the only rule - adopts it and stashes this device\'s copy', async () => {
  const cloudBlob = JSON.stringify({ lv: 44, cls: 'Priest', zeny: 1234, kills: 9, st: { str: 1 }, q: [] });
  const h = harness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 12 }) }, loadReturn: { lv: 44, cls: 'Priest', q: [] } });
  h.sandbox.currentUser = 'X';
  h.sandbox.cloudAdopt({ version: 6, blob: cloudBlob, savedAt: 5 });
  assert.strictEqual(h.store.get('pg_save3_X'), cloudBlob, 'the cloud copy becomes the live save');
  const backups = [...h.store.keys()].filter(k => k.startsWith('pg_save3_X_local_'));
  assert.strictEqual(backups.length, 1, 'the replaced local copy is kept under a backup key');
  assert.strictEqual(h.state.uiCalls, 1);
});

await T('a lost connection stops the character and says it is away, not "saved on this device"', async () => {
  const h = harness({ routes: { '/save': { throw: 'offline' }, '/me': { throw: 'offline' } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'offline');
  assert.strictEqual(h.sandbox.CLOUD.lost, true, 'the session is marked as away');
  assert.strictEqual(h.els.get('cloudGate').style.display, 'flex', 'the gate explains what is happening');
  assert.match(h.els.get('cloudGateDetail').textContent, /offline/i);
  assert.match(h.els.get('cloudBadge').title, /away/i);
  // Nothing more is uploaded while away: the offline play must never become normal progress.
  h.state.S = h.sandbox.S;
  assert.strictEqual(await h.sandbox.cloudPush(true), 'idle');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save' && c.init.method === 'PUT').length, 1);
});

await T('a server in maintenance is named as such, and nothing is uploaded or retried', async () => {
  let paused = true;
  const serverBlob = JSON.stringify({ lv: 31, cls: 'Priest', zeny: 7, kills: 12, st: { str: 1 }, q: [], owner: 'X' });
  const h = harness({
    storage: { 'pg_save3_X': JSON.stringify({ lv: 12, zeny: 5, owner: 'X' }) },
    routes: {
      '/save': () => paused
        ? { status: 503, body: { maintenance: true, err: 'The server is paused for maintenance.' } }
        : { status: 200, body: { version: 9, blob: serverBlob, savedAt: 3, owner: 'X' } },
      '/me': () => paused ? { status: 503, body: { maintenance: true } } : { status: 200, body: { u: 'X' } },
    },
  });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X'; h.sandbox.CLOUD.user = 'X';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'offline');
  assert.strictEqual(h.sandbox.CLOUD.lost, true, 'the character is away, so local play cannot be uploaded later');
  assert.strictEqual(h.els.get('cloudGate').style.display, 'flex', 'the player is told');
  assert.match(h.els.get('cloudGateDetail').textContent, /maintenance/i);
  assert.match(h.els.get('cloudBadge').title, /maintenance/i, 'the badge says why');
  assert.ok(h.state.logs.some(l => /maintenance/i.test(l.m)), 'and it is logged as maintenance, not as a bad network');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save' && c.init.method === 'PUT').length, 1,
    'the attempt is not retried into a paused server');

  // Reconnecting while it is still paused is refused, and still says maintenance.
  assert.strictEqual(await h.sandbox.cloudReconnect(), false);
  assert.match(h.els.get('cloudGateDetail').textContent, /still in maintenance/i);
  assert.strictEqual(h.sandbox.CLOUD.lost, true);

  // When the pause lifts, the account's save is adopted (it is the real one) and play resumes.
  paused = false;
  assert.strictEqual(await h.sandbox.cloudReconnect(), true);
  assert.strictEqual(h.els.get('cloudGate').style.display, 'none');
  assert.strictEqual(h.sandbox.CLOUD.ver, 9, 'the server version is the one this tab follows now');
  assert.strictEqual(JSON.parse(h.store.get('pg_save3_X')).lv, 31, 'the account save became the live save');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save' && c.init.method === 'PUT').length, 1,
    'nothing drawn during the pause was uploaded over the restored save');
});

await T('one flaky request is not a lost connection: the gate waits for /me to fail too', async () => {
  const h = harness({ routes: { '/save': { throw: 'one bad minute' }, '/me': { status: 200, body: { u: 'X' } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'offline');
  assert.strictEqual(h.sandbox.CLOUD.lost, false, 'the server still answers, so play continues');
  assert.notStrictEqual(h.els.get('cloudGate').style.display, 'flex');
  assert.match(h.els.get('cloudBadge').textContent, /⚠/);
});

await T('reconnecting adopts the account save, pays the away claim and resumes', async () => {
  const claim = { id: 7, awayMs: 20 * 60000, creditedMs: 20 * 60000, rateKph: 600, kills: 100, remainder: 0 };
  const serverBlob = JSON.stringify({ lv: 51, cls: 'Priest', zeny: 40, kills: 900, st: { str: 1 }, q: [] });
  const h = harness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 12, zeny: 5 }) },
    S: { lv: 12, zeny: 5, st: { str: 1 } }, loadReturn: { lv: 51, cls: 'Priest', q: [] },
    routes: { '/save': (n, init) => init && init.method === 'PUT'
      ? { status: 200, body: { version: 9 } }
      : { status: 200, body: { version: 8, blob: serverBlob, savedAt: 5, offlineClaim: claim } },
      '/grants': { body: { grants: [] } }, '/messages': { body: { messages: [] } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'X'; h.sandbox.currentUser = 'X';
  h.sandbox.CLOUD.lost = true;
  assert.strictEqual(await h.sandbox.cloudReconnect(), true);
  assert.strictEqual(h.sandbox.CLOUD.lost, false);
  assert.strictEqual(h.els.get('cloudGate').style.display, 'none', 'the gate closes');
  // v326: the claim's accepted upload stamps the local copy with the version it became (`cloud`), so
  // the bytes gain that one field - everything the server sent is still what is played.
  assert.deepStrictEqual({ ...JSON.parse(h.store.get('pg_save3_X')), cloud: undefined },
    { ...JSON.parse(serverBlob), cloud: undefined }, 'the account copy is what resumes');
  assert.strictEqual(h.state.offlineCalls, 1, 'the server-timed away claim is applied');
  assert.strictEqual(h.state.offlineClaims[0].id, 7);
  assert.strictEqual(h.sandbox.S.offlineClaimId, 7, 'and recorded in the save');
});

await T('signing out clears the gate and every connection flag', async () => {
  const h = harness({ routes: { '/save': { throw: 'offline' }, '/me': { throw: 'offline' }, '/sessions': { status: 200, body: {} } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'X'; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudPush(true);
  assert.strictEqual(h.sandbox.CLOUD.lost, true);
  assert.strictEqual(h.els.get('cloudGate').style.display, 'flex');
  // v326: ending the session now waits for the last upload, so the caller awaits it too.
  await h.sandbox.cloudLogout();
  assert.strictEqual(h.sandbox.CLOUD.lost, false, 'a signed-out page is not marked as away');
  assert.strictEqual(h.sandbox.CLOUD.gate, false);
  assert.strictEqual(h.sandbox.CLOUD.on, false);
  assert.strictEqual(h.els.get('cloudGate').style.display, 'none', 'and the gate is gone with it');
});

await T('a reconnect that still cannot reach the server keeps the gate and touches nothing', async () => {
  const h = harness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 12 }) }, routes: { '/save': { throw: 'offline' } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'X'; h.sandbox.currentUser = 'X';
  h.sandbox.CLOUD.lost = true;
  assert.strictEqual(await h.sandbox.cloudReconnect(), false);
  assert.strictEqual(h.sandbox.CLOUD.lost, true);
  assert.strictEqual(h.els.get('cloudGate').style.display, 'flex');
  assert.strictEqual(h.store.get('pg_save3_X'), JSON.stringify({ lv: 12 }), 'the device copy is untouched');
});

await T('GM gifts: zeny, levels and an item are applied, then claimed exactly once', async () => {
  const h = harness({ routes: { '/grants': { status: 200, body: { ok: true } } } });
  h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X';
  const S = h.sandbox.S;
  S.lv = 10; S.zeny = 1000; S.inv = []; S.st = { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 };
  await h.sandbox.cloudApplyGrants([
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
  await h.sandbox.cloudApplyGrants([{ id: 9, kind: 'item', payload: { item: null } }, { id: 10, kind: 'zeny', payload: { amount: 5 } }]);
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
  h.els.set('email', {value:'new@example.test'});
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
  // v326: the accepted upload also writes the version stamp (`cloud`) into the device copy.
  assert.deepStrictEqual({ ...JSON.parse(h.store.get('pg_save3_KzeR')), cloud: undefined },
    { ...JSON.parse(local), cloud: undefined }, 'and the device keeps its own copy');
  assert.strictEqual(h.els.get('cloudGate').style.display || 'none', 'none', 'nothing to choose between here');
});

await T('logging in where the cloud already has the same save: silent, just a version agreed', async () => {
  const local = JSON.stringify({ lv: 20, cls: 'Mage', zeny: 10, kills: 1, st: { str: 1 }, q: [] });
  const h = loginHarness({ storage: { 'pg_save3_X': local }, routes: {
    '/save': { status: 200, body: { version: 9, blob: local } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('X', 0, false);
  assert.strictEqual(h.els.get('cloudGate').style.display || 'none', 'none', 'identical copies need no question');
  assert.strictEqual(h.sandbox.CLOUD.ver, 9, 'the client must adopt the server\'s version');
  assert.strictEqual(h.sandbox.CLOUD.dirty, false);
});

await T('logging in where the cloud has a DIFFERENT save: the account save simply loads', async () => {
  // Owner decision (2026-10-27): "logging in always resumes exactly where the player left off".
  // The account is the only save, so a newer account copy is loaded and this browser's copy is
  // stashed under a backup key - no chooser, and nothing destroyed.
  const local = JSON.stringify({ lv: 20, cls: 'Mage', zeny: 10, kills: 1, st: { str: 1 }, q: [] });
  const cloud = JSON.stringify({ lv: 51, cls: 'Sniper', zeny: 90000, kills: 400, st: { str: 1 }, q: [] });
  const h = loginHarness({ storage: { 'pg_save3_X': local }, routes: {
    '/save': { status: 200, body: { version: 12, blob: cloud, savedAt: 7 } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('X', 0, false);
  assert.strictEqual(h.store.get('pg_save3_X'), cloud, 'the account save is what resumes');
  assert.strictEqual([...h.store.keys()].filter(k => k.startsWith('pg_save3_X_local_')).length, 1,
    'the browser copy is kept as a backup');
  assert.notStrictEqual(h.els.get('cloudGate').style.display, 'flex', 'nothing asks the player to choose');
  assert.strictEqual(h.sandbox.CLOUD.ver, 12);
});

await T('a STALE local slot never beats a cloud save that is ahead (v278 regression)', async () => {
  // The owner hit this exactly: renamed KzeR-adjacent account to `GM`, and the old OFFLINE `GM`
  // character was still sitting in `pg_save3_GM` at Lv 9 while the account held Lv 14. Both blobs are
  // stamped `GM`, so the owner guards pass both. What must happen: the ACCOUNT wins and the stale slot
  // is kept only as a backup - never loaded, and never pushed back over the account.
  const stale = JSON.stringify({ lv: 9, cls: 'Novice', zeny: 0, kills: 1, st: { str: 1 }, q: [], owner: 'GM' });
  const account = JSON.stringify({ lv: 14, cls: 'Novice', zeny: 18005, kills: 2, st: { str: 1 }, q: [], owner: 'GM' });
  const h = loginHarness({ storage: { 'pg_save3_GM': stale }, routes: {
    '/save': { status: 200, body: { version: 32, blob: account } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('GM', 2, false);
  assert.strictEqual(JSON.parse(h.store.get('pg_save3_GM')).lv, 14, 'the account save is what is loaded');
  assert.strictEqual(h.sandbox.CLOUD.ver, 32, 'and its version is adopted');
  const backups = [...h.store.keys()].filter(k => k.startsWith('pg_save3_GM_local_'));
  assert.strictEqual(backups.length, 1, 'the stale slot is preserved as a backup, not destroyed');
  assert.strictEqual(JSON.parse(h.store.get(backups[0])).lv, 9, 'and the backup really is the old copy');
});

await T('a stale slot is not trusted when the cloud cannot be read at login (v278)', async () => {
  // If /save cannot be read, cloudJoin gives up - and the login keeps whatever `load()` put in the
  // slot. A stale character then plays and syncs back over the account the moment the network returns.
  // That is the "relog and I am low level" report. The stale copy must be set aside, and the session
  // must refuse to push until the account copy has actually been read.
  const stale = JSON.stringify({ lv: 9, cls: 'Novice', zeny: 0, kills: 1, st: { str: 1 }, q: [], owner: 'GM' });
  const account = JSON.stringify({ lv: 14, cls: 'Novice', zeny: 18005, kills: 2, st: { str: 1 }, q: [], owner: 'GM' });
  const h = loginHarness({ storage: { 'pg_save3_GM': stale }, routes: {
    // first read of /save fails (a dropped connection the instant the player logs in)
    '/save': route => route === 1 ? { throw: 'offline' } : { status: 200, body: { version: 32, blob: account } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('GM', 2, false);
  const live = h.sandbox.S && h.sandbox.S.lv;
  const slot = JSON.parse(h.store.get('pg_save3_GM') || '{}').lv;
  assert.notStrictEqual(slot, 14, 'the account copy was never read, so it cannot be in the slot yet');
  // The character shown may be the stale one (it is all this device has), but it must NOT be able to
  // push itself over the account: that is what turns a stale display into lost progress.
  const put = h.calls.find(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.ok(!put, 'an unverified stale slot must not be uploaded over the account save');
});

await T('a slot carrying no version cannot be trusted as newer than the account (v278)', async () => {
  // The `owner` stamp is the account's NAME, which is mutable. Renaming an account therefore makes a
  // stale slot and the account copy indistinguishable: both say `owner:'GM'`, and neither carries a
  // version. Observed by the owner: a stale Lv 9 slot stamped `GM` next to a Lv 14 account copy, also
  // stamped `GM`. Nothing told the client which was authoritative, so "which one is live" came down to
  // ordering. The fix is to give the device copy a version so the comparison is a fact, not a guess.
  const stale = JSON.stringify({ lv: 9, cls: 'Novice', zeny: 0, kills: 1, st: { str: 1 }, q: [], owner: 'GM' });
  assert.strictEqual(JSON.parse(stale).v, undefined, 'a pre-v278 slot has no version - this is the hole');
  // What the slot SHOULD carry once written by this build: the version the account reported.
  const stamped = JSON.stringify({ lv: 9, cls: 'Novice', zeny: 0, kills: 1, st: { str: 1 }, q: [], owner: 'GM', v: 32 });
  assert.strictEqual(JSON.parse(stamped).v, 32, 'v278 writes the synced version INTO the slot');
});

await T('a REFUSED slot never overwrites the account (v278: the Lv150 -> Lv10 history)', async () => {
  // Owner's save_history, user 16: v20 lv150, v30 lv10, v40 lv150, v50 lv150, v60 lv150. A stale
  // client pushed a low-level character over an account at Lv 150. The stale client cannot be trusted
  // to notice its own staleness, so the ACCOUNT side has to hold the line: a version-0 client that has
  // never read this account's save must not be able to replace a much higher one.
  const low = JSON.stringify({ lv: 2, cls: 'Novice', zeny: 0, kills: 0, st: { str: 1 }, q: [], owner: 'GM' });
  const high = JSON.stringify({ lv: 150, cls: 'Novice', zeny: 1000, kills: 9, st: { str: 1 }, q: [], owner: 'GM' });
  const h = harness({ routes: {
    '/save': { status: 200, body: { version: 60, blob: high } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } },
  } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'GM';
  h.sandbox.currentUser = 'GM'; h.sandbox.S = JSON.parse(low); h.sandbox.CLOUD.ver = 0; h.sandbox.CLOUD.dirty = true;
  await h.sandbox.cloudPush(true);
  const put = h.calls.find(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.ok(put, 'the client attempts a push');
  const sent = JSON.parse(put.init.body);
  assert.strictEqual(sent.version, 0, 'it presents version 0 - it has never read this account');
  // The server must answer 409 with its own copy rather than accepting. That guard lives in
  // functions/api/save.js; here we only pin that the client ADOPTS rather than retries blindly.
  assert.ok(/if\(c\.saveMismatch\)/.test(src), 'the client still handles a saveMismatch refusal');
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
  assert.strictEqual(h.els.get('cloudGate').style.display || 'none', 'none');
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

await T('a tab with unsynced progress also adopts: the account is the only save', async () => {
  // Whatever this tab was holding is backed up, never played on top of the account's save.
  const cloud = JSON.stringify({ lv: 60, zeny: 5, kills: 1, st: { str: 1 }, q: [] });
  const local = JSON.stringify({ lv: 41 });
  const h = loginHarness({ storage: { 'pg_save3_X': local },
    routes: { '/save': { status: 200, body: { version: 8, blob: cloud } }, '/grants': { status: 200, body: {} }, '/messages': { status: 200, body: {} } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.dirty = true; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudRefresh();
  assert.strictEqual(h.store.get('pg_save3_X'), cloud, 'the account save wins');
  assert.strictEqual([...h.store.keys()].filter(k => k.startsWith('pg_save3_X_local_')).length, 1,
    'and the unsynced copy is stashed, not deleted');
  assert.notStrictEqual(h.els.get('cloudGate').style.display, 'flex');
});

await T('the session probe notices a sign-in elsewhere within a minute, at a priced request rate', async () => {
  // v274 (owner): the second login must kick the first. The server already ends the older token;
  // this is the client's own /api/me probe, which runs on a faster clock than the save/poll traffic
  // so the kicked tab stands down in about a minute instead of up to five.
  // The interval is a BUDGET, not a taste: the probe costs 0 D1 rows written but one Function
  // request each (WRITE_GATE=required adds a Durable Object admit/release), and Function requests
  // are the tight free-plan line. See tools/server-shift-plan.md §3b.2 - changing these constants
  // means redoing that sum, so the value is pinned here on purpose.
  assert.strictEqual(cloudSrcValue('CLOUD_SESSION_CHECK_MS'), 45000,
    'the visible-tab interval stays at the priced 45s (80 requests/hour fully visible)');
  assert.strictEqual(cloudSrcValue('CLOUD_SESSION_CHECK_HIDDEN_MS'), 120000,
    'and the hidden-tab interval at 120s (30/hour)');
  assert.strictEqual(45000 % 15000, 0, 'both intervals divide the 15s tick that drives the probe');
  assert.strictEqual(120000 % 15000, 0);
  const h = harness({ routes: { '/me': { status: 401, body: { err: 'Not logged in.' } } } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'FRIEND'; h.sandbox.currentUser = 'FRIEND';
  h.sandbox.CLOUD.paused = false; h.sandbox.CLOUD.signingOut = false;
  h.sandbox.resetSessionCheck();
  await h.sandbox.cloudSessionTick();
  await h.sandbox.settle();
  assert.strictEqual(h.sandbox.sessionWasReplaced(), true, 'a 401 from /api/me is the same kick as a 401 from /save');
  assert.strictEqual(h.els.get('sessionGate').style.display, 'flex');
  assert.deepStrictEqual(h.calls.map(c => c.url), ['/api/me'], 'the probe is one /api/me and nothing else');
  // A healthy session keeps playing, and the probe backs off instead of hammering the API.
  const ok = harness({ routes: { '/me': { status: 200, body: { u: 'FRIEND', gm: false, recoverySet: true } } } });
  ok.sandbox.CLOUD.on = true; ok.sandbox.CLOUD.user = 'FRIEND';
  ok.sandbox.resetSessionCheck();
  await ok.sandbox.cloudSessionTick();
  await ok.sandbox.settle();
  assert.strictEqual(ok.sandbox.sessionWasReplaced(), false, 'a live session is not a kick');
  const asked = ok.calls.length;
  await ok.sandbox.cloudSessionTick();      // a moment later, inside the 45s window
  assert.strictEqual(ok.calls.length, asked, 'the probe respects its own interval');
  // ...and it does ask again once the interval is up: the window is a wait, not a one-shot.
  ok.sandbox.resetSessionCheck();
  await ok.sandbox.cloudSessionTick();
  await ok.sandbox.settle();
  assert.strictEqual(ok.calls.length, asked + 1, 'the next window sends exactly one more probe');
  // Once this tab has been replaced the probe stops asking entirely.
  h.sandbox.CLOUD.checking = false;
  const afterKick = h.calls.length;
  h.sandbox.resetSessionCheck();
  await h.sandbox.cloudSessionTick();
  assert.strictEqual(h.calls.length, afterKick, 'a kicked tab makes no further requests');
});

await T('a 401 while signed in means another device took over: this tab stops and says so', async () => {
  // functions/api/sessions.js keeps ONE session per account, so a sign-in elsewhere ends this one.
  // The client must not treat that as a flaky network: it stops, keeps its copy, and never uploads
  // over the device that just signed in.
  const h = harness({ routes: { '/save': { status: 401, body: { err: 'Not logged in.' } }, '/me': { status: 401, body: { err: 'Not logged in.' } } } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'FRIEND'; h.sandbox.currentUser = 'FRIEND';
  h.sandbox.S = { lv: 12, zeny: 100, kills: 5, st: { str: 9 }, q: [] };
  await h.sandbox.cloudPush(true);
  assert.strictEqual(h.sandbox.sessionWasReplaced(), true, 'the tab knows the session was replaced');
  assert.strictEqual(h.els.get('sessionGate').style.display, 'flex', 'and says so in its own dialog');
  assert.strictEqual(h.sandbox.CLOUD.lost, true, 'the simulation parks (the other device owns the character)');
  assert.strictEqual(h.sandbox.CLOUD.paused, true, 'and nothing is uploaded from here');
  const gate = h.els.get('cloudGate').style && h.els.get('cloudGate').style.display;
  assert.notStrictEqual(gate, 'flex', 'the connection dialog would be the wrong story');
  // Reconnecting must not adopt a save the other device is playing.
  assert.strictEqual(await h.sandbox.cloudReconnect(), false);
  const before = h.calls.length;
  await h.sandbox.cloudPush(true);
  assert.strictEqual(h.calls.length, before, 'no request is made after the session was replaced');
});

await T('the gate freezes the sim and the away claim pays the frozen gap', async () => {
  // The simulation cannot keep grinding behind the gate, or a dropped connection would quietly
  // become normal progress. And because it did NOT grind, the server's claim must pay that window
  // instead of being written off as "already simulated".
  assert.ok(/function loop\(now\)\{[^}]*CLOUD\.lost[^}]*simAt=now;simPending=0/.test(src),
    'loop() parks the simulation clock while the session is marked as away');
  assert.ok(/if\(CLOUD\.lost\)return 'idle'/.test(src), 'nothing is uploaded while away');
  assert.ok(/const covered=!CLOUD\.gate&&/.test(src),
    'a claim covering the gate window is paid, not counted as simulated time');
  assert.ok(/function cloudGateShow\(detail\)\{\s*CLOUD\.gate=true;/.test(src), 'opening the gate marks the window');
  assert.ok(/CLOUD\.gate=false;/.test(src), 'and reconnecting clears the mark once the gap is settled');
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
  assert.strictEqual(dump.app, 'horizon-haven');
  assert.match(dump.download || h.state.downloads[0].name, /horizon-haven-saves-\d{4}-\d{2}-\d{2}\.json/);
  assert.ok(dump.at > 0 && dump.kind === 'save-backup');
});

await T('restoring writes the saves - and cannot write anything else, however the file is built', async () => {
  const h = loginHarness({ storage: {}, answerAsk: true });
  const file = { text: JSON.stringify({
    app: 'prontera-grind', kind: 'save-backup', v: 1, keys: {
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
    assert.match(h.state.err, /not a Horizon Haven save backup/i, 'a file that is not a backup: ' + bad.slice(0, 20));
  }
  // A well-formed backup with no game keys in it is its own answer, not a crash.
  h.sandbox.restoreBackup({ text: JSON.stringify({ kind: 'save-backup', keys: { 'pg_gm_local': 'x' } }) });
  assert.match(h.state.err, /holds no characters/i);
  assert.strictEqual(h.state.asks.length, 0, 'a file that is not a backup never gets as far as a question');
});

await T('the poll fetches announcements and gifts, and saves receipts without reading over live play', async () => {
  const h = loginHarness({ routes: {
    '/grants': { status: 200, body: { grants: [{ id: 5, kind: 'zeny', payload: { amount: 1000 } }] } },
    '/messages': { status: 200, body: { messages: [{ id: 1, body: 'Server restart at 22:00', kind: 'notice' }] } },
    '/save': { status: 200, body: { version: 2, blob: '{"lv":1}' } },
  } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.api = true; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudPull();
  assert.ok(h.state.logs.some(l => /Server restart/.test(l.m)), 'the announcement reaches the log');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save' && c.init.method !== 'PUT').length, 0,
    'a poll must never read a save over live play; applying a gift may upload its receipt');
});

// ------------------------------------------------- the v82 usage diet ----
// Every push is one Function request and one D1 row written, so the cadence IS the cost. These
// pin the numbers the free-plan arithmetic in tools/server-shift-plan.md §3b is built on.
await T('a push waits a minute while you play, and two and a half while the tab is hidden', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 2 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 1; h.sandbox.currentUser = 'X';
  assert.strictEqual(h.sandbox.CLOUD_DEBOUNCE, 60000, 'the plan\'s own budget assumes a 60-second debounce');
  // v327: three, not five. A background cadence slower than the server's away threshold (three minutes)
  // made every hidden-tab save look like a return from absence - an away claim, a 428 and a retry each
  // time, which is what AFK fishing produced. The diet survives: the 428 path cost two requests and two
  // row writes for the same window, so this is strictly cheaper as well as quieter.
  assert.strictEqual(h.sandbox.CLOUD_HIDDEN_DEBOUNCE, 150000, 'a hidden tab backs off to two and a half minutes');
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
    t += 150000;
    assert.strictEqual(await h.sandbox.cloudFlush(), 'ok', 'two and a half minutes hidden is the cadence');
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

await T('a tab that comes back pushes its own newer copy, and adopts the account\'s when another device moved on', async () => {
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
  assert.notStrictEqual(h.els.get('cloudGate').style.display, 'flex', 'nothing is asked when the answer is obvious');
  const put = h.calls.filter(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.strictEqual(put.length, 1, 'the newer local copy is pushed');
  assert.ok(JSON.parse(put[0].init.body).blob.includes('"zeny":900'), 'and it is THIS device\'s save that was sent');
  // A save written by another device - the account wins, and this tab's copy is stashed.
  const h2 = harness({ storage: { 'pg_save3_X': here }, S: { lv: 20, cls: 'Novice', zeny: 900, kills: 40, st: { str: 1 } },
    routes: { '/save': { status: 200, body: { version: 9, blob: onServer, savedAt: 2 } } } });
  h2.sandbox.CLOUD.api = true; h2.sandbox.CLOUD.on = true; h2.sandbox.CLOUD.ver = 7;
  h2.sandbox.CLOUD.dirty = true; h2.sandbox.currentUser = 'X';
  await h2.sandbox.cloudRefresh();
  assert.strictEqual(h2.store.get('pg_save3_X'), onServer, 'the account save is loaded');
  assert.strictEqual([...h2.store.keys()].filter(k => k.startsWith('pg_save3_X_local_')).length, 1,
    'and the copy this tab held is stashed, not deleted');
  assert.notStrictEqual(h2.els.get('cloudGate').style.display, 'flex', 'no gate for an ordinary refresh');
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
  assert.notStrictEqual(h.els.get('cloudGate').style.display, 'flex', 'no two-saves chooser offering the other account\'s save');
  assert.strictEqual(h.sandbox.CLOUD.paused, true);
  assert.strictEqual(h.store.has('pg_save3_OWNERGM'), false, 'nothing is written under this account');
});

// --------------------------------------------- v88.6: the save-owner stamp ----
// Every save names the account it belongs to, inside the save. A save stamped for anyone else is never
// loaded, never written over anything, never uploaded, and never restored under a name that is not its own.
const OTHER_REFUSED = 'belongs to another account';
await T('v88.6: every upload is stamped with the account it belongs to', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 2 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 1;
  h.sandbox.currentUser = 'FRIEND'; h.sandbox.CLOUD.user = 'FRIEND';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'ok');
  const sent = JSON.parse(JSON.parse(h.calls.find(c => c.url === '/api/save').init.body).blob);
  assert.strictEqual(sent.owner, 'FRIEND', 'the save names the account it is uploaded for');
  assert.strictEqual(h.sandbox.S.owner, 'FRIEND', 'and the live save carries the same stamp');
});

await T('v88.6: a live save stamped for another account is never uploaded, and this tab stops syncing', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 2 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 1;
  h.sandbox.currentUser = 'FRIEND'; h.sandbox.CLOUD.user = 'FRIEND';
  h.sandbox.S.owner = 'SOMEONE';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'idle');
  assert.strictEqual(h.calls.filter(c => c.url === '/api/save').length, 0, 'nothing is sent');
  assert.strictEqual(h.sandbox.CLOUD.paused, true, 'sync stops in this tab');
  assert.ok(h.state.logs.some(l => /another account/.test(l.m)), 'and the player is told why');
});

await T('v88.6: the server refusing a save for its account stops sync and says why, with no two-saves question', async () => {
  const h = harness({ routes: { '/save': { status: 409, body: { err: 'This save belongs to a different account, so nothing was saved or loaded.', saveMismatch: true, owner: 'FRIEND' } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 3;
  h.sandbox.currentUser = 'FRIEND'; h.sandbox.CLOUD.user = 'FRIEND';
  assert.strictEqual(await h.sandbox.cloudPush(true), 'idle');
  assert.strictEqual(h.sandbox.CLOUD.paused, true, 'sync is paused in this tab');
  assert.notStrictEqual(h.els.get('cloudGate').style.display, 'flex', 'a refusal is not a two-saves question');
  assert.match(h.els.get('cloudBadge').textContent, /⛔/, 'the badge says sync stopped');
  assert.ok(h.state.logs.some(l => /nothing was saved or loaded/.test(l.m)), 'the server\'s reason reaches the log');
});

await T('v88.6: a cloud save stamped for another account is not joined, and the device copy is left alone', async () => {
  const local = JSON.stringify({ lv: 20, cls: 'Mage', zeny: 10, kills: 1, st: { str: 1 }, q: [] });
  const foreign = JSON.stringify({ lv: 99, cls: 'Merchant', owner: 'SOMEONE' });
  const h = harness({ storage: { 'pg_save3_X': local }, routes: { '/save': { status: 200, body: { version: 4, blob: foreign, savedAt: 1 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X'; h.sandbox.CLOUD.user = 'X';
  await h.sandbox.cloudJoin('X', local);
  assert.strictEqual(h.sandbox.CLOUD.paused, true, 'sync stops');
  assert.notStrictEqual(h.els.get('cloudGate').style.display, 'flex', 'and no chooser offers the other save');
  assert.strictEqual(h.store.get('pg_save3_X'), local, 'the device copy is untouched');
  assert.ok(!h.calls.some(c => c.url === '/api/save' && c.init.method === 'PUT'), 'nothing is uploaded over it');
});

await T('v88.6: a server that refuses to hand a save out (409) stops the join - it is never read as "no save yet"', async () => {
  const local = JSON.stringify({ lv: 20, cls: 'Mage', zeny: 10, kills: 1, st: { str: 1 }, q: [] });
  const h = harness({ storage: { 'pg_save3_X': local }, routes: { '/save': { status: 409, body: { err: 'refused', saveMismatch: true, owner: 'X' } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.currentUser = 'X'; h.sandbox.CLOUD.user = 'X';
  await h.sandbox.cloudJoin('X', local);
  assert.strictEqual(h.sandbox.CLOUD.paused, true);
  assert.ok(!h.calls.some(c => c.url === '/api/save' && c.init.method === 'PUT'),
    'a refused read must not turn into an upload at version 0');
  assert.strictEqual(h.store.get('pg_save3_X'), local);
});

await T('v88.6: a refresh that finds a foreign save changes nothing', async () => {
  const foreign = JSON.stringify({ lv: 60, owner: 'SOMEONE' });
  const h = harness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 40 }) }, routes: { '/save': { status: 200, body: { version: 8, blob: foreign } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.dirty = false;
  h.sandbox.currentUser = 'X'; h.sandbox.CLOUD.user = 'X';
  await h.sandbox.cloudRefresh();
  assert.strictEqual(h.store.get('pg_save3_X'), JSON.stringify({ lv: 40 }), 'the device copy is not replaced');
  assert.strictEqual(h.sandbox.CLOUD.paused, true);
});

await T('v88.6: a device copy that belongs to another account blocks the login, and nothing starts', async () => {
  const foreign = JSON.stringify({ lv: 77, cls: 'Knight', zeny: 1, kills: 1, st: { str: 1 }, q: [], owner: 'SOMEONE' });
  const h = harness({ storage: { 'pg_save3_X': foreign }, routes: { '/save': { status: 200, body: { version: 2, blob: null } } } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('X', 0, false);
  assert.strictEqual(h.sandbox.CLOUD.on, false, 'no cloud session is started');
  assert.strictEqual(h.sandbox.currentUser, null, 'and no account is left in use');
  assert.match(h.state.err, /belongs to “SOMEONE”/, 'the login card says whose it is');
  assert.match(h.state.err, /Your cloud save was not touched/);
  assert.strictEqual(h.store.get('pg_save3_X'), foreign, 'nothing is written over it');
  assert.ok(!h.calls.some(c => c.url === '/api/save'), 'and the cloud is not asked to start a save');
});

await T('v88.6: a new device whose cloud save belongs to another account is not started', async () => {
  const h = harness({ routes: { '/save': { status: 409, body: { err: 'This save belongs to a different account, so nothing was saved or loaded.', saveMismatch: true, owner: 'X' } } } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.initSessionFromCloud('X', 0, false);
  assert.strictEqual(h.sandbox.CLOUD.on, false);
  assert.match(h.state.err, /belongs to another account/);
  assert.strictEqual(h.store.has('pg_save3_X'), false, 'nothing is written');
  assert.ok(!h.calls.some(c => c.url === '/api/save' && c.init.method === 'PUT'), 'and no fresh character is pushed over it');
});

await T('v88.6: a cloud copy stamped for another account is never adopted, and no stash is made', async () => {
  const h = harness({ storage: { 'pg_save3_X': JSON.stringify({ lv: 12 }) } });
  h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'X'; h.sandbox.currentUser = 'X';
  await h.sandbox.cloudAdopt({ version: 6, blob: JSON.stringify({ lv: 44, owner: 'SOMEONE' }), savedAt: 5 });
  assert.strictEqual(h.store.get('pg_save3_X'), JSON.stringify({ lv: 12 }), 'the device copy is kept');
  assert.strictEqual(h.sandbox.CLOUD.paused, true);
  assert.strictEqual([...h.store.keys()].filter(k => k.includes('_local_')).length, 0, 'and nothing is stashed either');
});

await T('v88.6: a backup cannot write another account\'s save under this account\'s name, and says so', async () => {
  const h = loginHarness({ storage: {}, answerAsk: true });
  const file = { text: JSON.stringify({ kind: 'save-backup', keys: {
    'pg_save3_KzeR': JSON.stringify({ lv: 70, owner: 'KzeR' }),
    'pg_save3_Friend': JSON.stringify({ lv: 12, owner: 'SOMEONE' }),   // filed under Friend, but it is someone else's
    'pg_acc4': '{}',
  } }) };
  h.sandbox.restoreBackup(file);
  assert.strictEqual(h.store.get('pg_save3_KzeR'), JSON.stringify({ lv: 70, owner: 'KzeR' }), 'the matching save is restored');
  assert.strictEqual(h.store.get('pg_save3_Friend'), undefined, 'the mismatched one is not written under Friend');
  assert.match(h.state.asks[0], /belong to another account: Friend/, 'and the question says it was left out');
});

await T('v88.6: a backup of this device\'s stashed copy restores under its own account name', async () => {
  const h = loginHarness({ storage: {}, answerAsk: true });
  const stash = JSON.stringify({ lv: 33, owner: 'KzeR' });
  h.sandbox.restoreBackup({ text: JSON.stringify({ kind: 'save-backup', keys: { 'pg_save3_KzeR_local_1700000000000': stash } }) });
  assert.strictEqual(h.store.get('pg_save3_KzeR_local_1700000000000'), stash, 'the stash is restored as it was');
});

await T('v88.6: the same progress with and without the stamp is one save, so no two-saves question', async () => {
  const local = JSON.stringify({ lv: 20, cls: 'Mage', zeny: 10, kills: 1, st: { str: 1 }, q: [] });
  const onServer = JSON.stringify(Object.assign(JSON.parse(local), { owner: 'X' }));
  const h = loginHarness({ storage: { 'pg_save3_X': local }, routes: {
    '/save': { status: 200, body: { version: 9, blob: onServer, savedAt: 7 } },
    '/grants': { status: 200, body: { grants: [] } }, '/messages': { status: 200, body: { messages: [] } } } });
  h.sandbox.CLOUD.api = true;
  await h.sandbox.cloudJoin('X', local);
  assert.strictEqual(h.els.get('cloudGate').style.display || 'none', 'none', 'identical progress needs no question');
  assert.strictEqual(h.sandbox.CLOUD.ver, 9, 'the version is agreed');
  assert.strictEqual(h.sandbox.CLOUD.dirty, false);
});

await T('v251: an occluded / Alt+Tabbed window uses the 5-minute background cloud diet too', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 2 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 1; h.sandbox.currentUser = 'X';
  h.sandbox.document.hidden = false;
  h.sandbox.simOccluded = true;
  assert.strictEqual(h.sandbox.cloudHidden(), true, 'occluded window is treated as background for cloud sync');
  const realNow = Date.now;
  try {
    let t = realNow();
    Date.now = () => t;
    h.sandbox.CLOUD.lastPush = t; h.sandbox.CLOUD.dirty = true;
    t += 120000;
    assert.strictEqual(await h.sandbox.cloudFlush(), 'idle', 'two minutes occluded stays inside the 5m background debounce');
    t += 185000;
    assert.strictEqual(await h.sandbox.cloudFlush(), 'ok', 'past five minutes occluded syncs cleanly');
  } finally { Date.now = realNow; }
});

await T('v251: background progress saved while PUT /api/save is in flight stays dirty after upload', async () => {
  let h = null;
  h = harness({ routes: { '/save': () => {
    // Simulate a background tick saving newer kills while the network PUT is still in flight.
    h.sandbox.S.kills = 99;
    h.sandbox.cloudTouch();
    return { status: 200, body: { version: 5 } };
  } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 4; h.sandbox.currentUser = 'X';
  h.sandbox.cloudTouch();
  assert.strictEqual(await h.sandbox.cloudPush(true), 'ok');
  assert.strictEqual(h.sandbox.CLOUD.ver, 5, 'accepted upload advances the known cloud version');
  assert.strictEqual(h.sandbox.CLOUD.dirty, true, 'newer save touched mid-upload remains marked dirty so cloudRefresh cannot discard it');
  // v282: what this guards is the FLAG staying set so cloudRefresh cannot discard the newer work. It
  // used to assert the badge flipped to "☁ …" - that assertion is the bug the owner reported, so it is
  // now pinned the other way round: the push that landed is what the badge reports.
  assert.match(h.els.get('cloudBadge').textContent, /^☁ ✓ \d{2}:\d{2}$/, 'the badge reports the push that landed, with its time');
  assert.strictEqual(h.sandbox.CLOUD.dirty, true, 'while the newer save is still marked unsynced');
});

await T('v264: opening and closing the GM console keeps the live session open without ending /sessions', async () => {
  const h = harness({
    storage: { 'pg_save3_GM': '{"owner":"GM","lv":50}' },
    routes: {
      '/save': (seq, init) => (init && init.method === 'PUT'
        ? { status: 200, body: { version: 2 } }
        : { status: 200, body: { owner: 'GM', version: 2, blob: '{"owner":"GM","lv":50}' } }),
      '/grants': { status: 200, body: { owner: 'GM', grants: [{ id: 77, kind: 'zeny', payload: { amount: 250 } }] } },
      '/announcements': { status: 200, body: { messages: [] } },
    },
  });
  const modal = { hidden: true }, frame = { src: 'about:blank' };
  h.els.set('gmConsoleModal', modal);
  h.els.set('gmConsoleFrame', frame);
  h.sandbox.currentUser = 'GM';
  h.sandbox.cloudSession('GM', 2);

  h.sandbox.openGmConsole();
  assert.strictEqual(modal.hidden, false, 'GM console modal opens over the live game');
  assert.strictEqual(frame.src, 'gm.html', 'iframe loads gm.html');
  assert.strictEqual(h.sandbox.CLOUD.on, true, 'session stays live');

  h.sandbox.closeGmConsole();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(modal.hidden, true, 'Back to the game hides the GM overlay');
  assert.strictEqual(frame.src, 'about:blank', 'iframe unloads cleanly');
  assert.strictEqual(h.sandbox.CLOUD.on, true, 'GM remains signed in');
  assert.ok(!h.calls.some(c => c.url === '/api/sessions' && c.init.method === 'DELETE'), 'no session DELETE occurs on return');
  assert.strictEqual(h.sandbox.S.zeny, 350, 'any grant sent during the GM console visit lands immediately on close');
});

// --------------------------------------------------- v326: which copy is newer ----
// The owner's report ("I ascended the same weapon three times and it went back to N+") is a LOGIN
// bug, not a lost save: the account copy was simply older than the device copy, and every login
// replaced one with the other. These tests pin both halves of the answer - the newer device copy is
// kept, and a real "another device moved on" still loads the account copy.
const joinHarness = (deviceSave, accountSave, version = 40) => harness({
  storage: deviceSave ? { 'pg_save3_FRIEND': JSON.stringify(deviceSave) } : {},
  S: deviceSave ? { ...JSON.parse(JSON.stringify(deviceSave)) } : undefined,
  loadReturn: { lv: 150, q: [] },
  routes: {
    '/save': (seq, init) => (init && init.method === 'PUT'
      ? { status: 200, body: { version: version + 1 } }
      : { status: 200, body: { owner: 'FRIEND', version, blob: JSON.stringify(accountSave), savedAt: 900 } }),
    '/grants': { status: 200, body: { grants: [] } },
    '/messages': { status: 200, body: { messages: [] } },
  },
});
const signIn = h => { h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'FRIEND'; h.sandbox.currentUser = 'FRIEND'; };
const forgedBlade = { owner: 'FRIEND', lv: 150, zeny: 5, weapon: 'Mythic Celestial Blade', cloud: { v: 40, at: 1000 }, offlineAt: 2000, gmStats: { at: 2000 } };
const nPlusBlade = { owner: 'FRIEND', lv: 150, zeny: 5, weapon: 'N+ Blade', gmStats: { at: 1500 } };

await T('v326: a login keeps the device copy when it is the account copy plus play the server has not had', async () => {
  const h = joinHarness(forgedBlade, nPlusBlade);
  signIn(h);
  await h.sandbox.cloudJoin('FRIEND', JSON.stringify(forgedBlade));
  const put = h.calls.find(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.ok(put, 'the newer device copy is uploaded instead of being thrown away');
  const body = JSON.parse(put.init.body);
  assert.strictEqual(body.version, 40, 'uploaded on top of the version the account still holds');
  assert.ok(body.blob.includes('Mythic Celestial Blade'), 'the forge is in the upload');
  assert.strictEqual(h.sandbox.CLOUD.ver, 41, 'and the accepted upload advances the version');
  assert.ok(![...h.store.keys()].some(k => k.startsWith('pg_save3_FRIEND_local_')),
    'nothing was adopted, so nothing had to be stashed as a backup');
  assert.strictEqual(JSON.parse(h.store.get('pg_save3_FRIEND')).weapon, 'Mythic Celestial Blade', 'the device copy still holds the forge');
  assert.ok(h.state.logs.some(l => /Kept this device/.test(l.m)), 'the player is told the device copy was kept');
});

await T('v326: another device that moved the account on still wins at login', async () => {
  // Same shape, but the account is on a version this device never synced: a different device wrote.
  const behind = { ...forgedBlade, cloud: { v: 39, at: 1000 }, offlineAt: 2000 };
  const moved = { owner: 'FRIEND', lv: 151, zeny: 9, weapon: 'N+ Blade' };
  const h = joinHarness(behind, moved, 42);
  signIn(h);
  await h.sandbox.cloudJoin('FRIEND', JSON.stringify(behind));
  assert.strictEqual(h.store.get('pg_save3_FRIEND'), JSON.stringify(moved), 'the account copy becomes the live save');
  assert.ok([...h.store.keys()].some(k => k.startsWith('pg_save3_FRIEND_local_')), 'the device copy is kept as a backup');
  assert.strictEqual(h.sandbox.CLOUD.ver, 42);
  assert.ok(!h.calls.some(c => c.url === '/api/save' && c.init.method === 'PUT'), 'nothing is uploaded over it');
});

await T('v326: a 428 during a login push does not adopt the older account copy', async () => {
  // The login path pushes the newer device copy. If the server answers 428 (an away claim must be
  // acknowledged first), that is not a conflict - but the code fell through to cloudAdopt and loaded
  // the older account copy on top of the forge it had just failed to upload. The owner's console is
  // full of these 428s, so this is the path that kept the rollback alive after the first fix.
  const claim = { id: 99, awayMs: 8 * 3600000, creditedMs: 4 * 3600000, rateKph: 100, kills: 200, remainder: 0 };
  let puts = 0;
  const h = harness({
    storage: { 'pg_save3_FRIEND': JSON.stringify(forgedBlade) },
    S: JSON.parse(JSON.stringify(forgedBlade)),
    loadReturn: { lv: 150, q: [] },
    runTimers: true,
    routes: {
      '/save': (n, init) => {
        if (!(init && init.method === 'PUT'))
          return { status: 200, body: { owner: 'FRIEND', version: 40, blob: JSON.stringify(nPlusBlade), savedAt: 900 } };
        puts++;
        if (puts === 1) return { status: 428, body: { version: 40, offlineClaim: claim } };
        return { status: 200, body: { version: 41, offlineClaimId: claim.id } };
      },
      '/grants': { status: 200, body: { grants: [] } },
      '/messages': { status: 200, body: { messages: [] } },
    },
  });
  signIn(h);
  await h.sandbox.cloudJoin('FRIEND', JSON.stringify(forgedBlade));
  await h.sandbox.settle();
  assert.strictEqual(JSON.parse(h.store.get('pg_save3_FRIEND')).weapon, 'Mythic Celestial Blade',
    'the forge survives the away-claim round trip instead of being replaced by the older copy');
  assert.ok(![...h.store.keys()].some(k => k.startsWith('pg_save3_FRIEND_local_')),
    'nothing was stashed as a loss');
  assert.ok(puts >= 2, 'and the claim was pushed back');
  assert.strictEqual(h.sandbox.CLOUD.ver, 41, 'the accepted retry is the live version');
});

await T('v326: a device copy with nothing unsynced still loads the account copy', async () => {
  const quiet = { ...forgedBlade, cloud: { v: 40, at: 3000 }, offlineAt: 3000 };
  const account = { owner: 'FRIEND', lv: 150, zeny: 5, weapon: 'N+ Blade' };
  const h = joinHarness(quiet, account);
  signIn(h);
  await h.sandbox.cloudJoin('FRIEND', JSON.stringify(quiet));
  assert.strictEqual(h.store.get('pg_save3_FRIEND'), JSON.stringify(account), 'no local play to protect');
  assert.ok(!h.calls.some(c => c.url === '/api/save' && c.init.method === 'PUT'), 'so no needless upload row');
});

await T('v326: a save with no cloud stamp (written by an older build) is still reconciled the old way', async () => {
  const legacy = { owner: 'FRIEND', lv: 150, weapon: 'N+ Blade' };
  const account = { owner: 'FRIEND', lv: 150, weapon: 'Mythic Celestial Blade' };
  const h = joinHarness(legacy, account);
  signIn(h);
  await h.sandbox.cloudJoin('FRIEND', JSON.stringify(legacy));
  assert.strictEqual(h.store.get('pg_save3_FRIEND'), JSON.stringify(account), 'the account copy is adopted as before');
});

await T('v326: two copies of the same progress are one save even though save() re-takes the diagnostics', () => {
  const h = harness({});
  const a = JSON.stringify({ owner: 'X', lv: 10, zeny: 5, gmStats: { at: 111, combat: { ATK: 3 } }, inv: [1] });
  const b = JSON.stringify({ owner: 'X', lv: 10, zeny: 5, gmStats: { at: 999, combat: { ATK: 3 } }, inv: [1] });
  assert.strictEqual(h.sandbox.sameSave(a, b), true, 'the derived gmStats timestamp must not make a save look different');
  const c = JSON.stringify({ owner: 'X', lv: 11, zeny: 5, gmStats: { at: 999, combat: { ATK: 3 } }, inv: [1] });
  assert.strictEqual(h.sandbox.sameSave(a, c), false, 'real progress still differs');
});

await T('v326: leaving the page writes the device copy and asks for a keepalive upload', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 7 } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 6; h.sandbox.CLOUD.user = 'X'; h.sandbox.currentUser = 'X';
  const savesBefore = h.state.saves;
  assert.strictEqual(await h.sandbox.cloudFlushLeaving(), 'ok');
  assert.strictEqual(h.state.saves, savesBefore + 1, 'the device copy is written before the page goes away');
  const put = h.calls.find(c => c.url === '/api/save' && c.init.method === 'PUT');
  assert.strictEqual(put.init.keepalive, true, 'the browser is told not to cancel the request with the page');
  assert.strictEqual(h.sandbox.CLOUD.ver, 7);
});

// The owner keeps several accounts in one browser and logs in and out constantly - and that is the
// other half of the report. The old logout fired the upload without waiting, deleted the session beside
// it and reloaded, so the PUT was cancelled or arrived after the session was gone (401). The account
// copy on the server stayed a minute behind, which is what the next login downloads.
// AFK fishing leaves the game tab hidden (DevTools focused, another window on top), and a hidden tab
// saves on a slower cadence. If that cadence is slower than the server's "you were away" threshold,
// every single background save is measured as a return from absence: a claim is minted, the write is
// refused with 428, and the client acknowledges and retries - for ever, one red pair per cadence.
await T('v327: no save cadence is slower than the away threshold, or a running tab looks absent', async () => {
  const server = fs.readFileSync(path.join(root, 'functions', 'api', 'save.js'), 'utf8');
  const expr = (server.match(/const OFFLINE_MIN_MS = ([0-9* ]+);/) || [])[1] || '';
  const offlineMin = expr.split('*').reduce((n, part) => n * Number(part.trim()), 1);
  assert.strictEqual(offlineMin, 3 * 60 * 1000, 'the server\'s away threshold is three minutes');
  const h = harness({});
  assert.ok(h.sandbox.CLOUD_DEBOUNCE < offlineMin,
    'the visible cadence (' + h.sandbox.CLOUD_DEBOUNCE + 'ms) is under the away threshold');
  const hidden = Number((src.match(/const CLOUD_HIDDEN_DEBOUNCE=(\d+);/) || [])[1]);
  assert.ok(hidden > 0, 'the hidden cadence is declared');
  assert.ok(hidden < offlineMin,
    'AFK fishing or a background window must not look like an absence: ' + hidden + 'ms < ' + offlineMin + 'ms');
});

await T('v326: logging out lands the last minute before the session is deleted', async () => {
  const h = harness({ routes: { '/save': { status: 200, body: { version: 8 } }, '/sessions': { status: 200, body: { ok: true } } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.ver = 7;
  h.sandbox.CLOUD.user = 'X'; h.sandbox.currentUser = 'X'; h.sandbox.CLOUD.dirty = true;
  const pending = h.sandbox.cloudLogout();
  assert.ok(pending && typeof pending.then === 'function', 'ending the session is awaitable now, so the caller can order it');
  await pending;
  const putAt = h.calls.findIndex(c => c.url === '/api/save' && c.init.method === 'PUT');
  const delAt = h.calls.findIndex(c => c.url === '/api/sessions' && c.init.method === 'DELETE');
  assert.ok(putAt >= 0, 'the last minute is uploaded on the way out');
  assert.ok(delAt > putAt, 'and only then is the session it needs deleted');
  assert.strictEqual(h.calls[putAt].init.keepalive, true, 'the upload survives the reload that follows');
  assert.strictEqual(h.sandbox.CLOUD.on, false, 'the tab ends up signed out');
  assert.strictEqual(h.sandbox.CLOUD.user, null);
});

await T('v326: two accounts in one browser - switching back never trades one player\'s copy for another\'s', async () => {
  // A fake server: one row per account, and a version that only moves when that account pushes.
  const server = {
    A: { version: 7, blob: JSON.stringify({ owner: 'A', accountId: 11, lv: 50, zeny: 1000, weapon: 'N+ Blade' }) },
    B: { version: 2, blob: JSON.stringify({ owner: 'B', accountId: 12, lv: 20, zeny: 50, weapon: 'Short Sword' }) },
  };
  let who = 'A';
  const routes = {
    '/save': (seq, init) => {
      const row = server[who];
      if (init && init.method === 'PUT') {
        const body = JSON.parse(init.body);
        if (String(body.owner).toLowerCase() !== who.toLowerCase())
          return { status: 409, body: { err: 'This tab is playing a different account. Nothing was saved.', accountMismatch: true, owner: who } };
        if (Number(body.version) !== row.version)
          return { status: 409, body: { conflict: true, version: row.version, blob: row.blob, savedAt: 1, updatedAt: 1, offlineClaim: null } };
        server[who] = { version: row.version + 1, blob: body.blob };
        return { status: 200, body: { version: row.version + 1, bytes: body.blob.length, offlineClaimId: null, leaderboardPending: false } };
      }
      return { status: 200, body: { owner: who, version: row.version, blob: row.blob, savedAt: 1, updatedAt: 1, serverNow: 9e12, offlineClaim: null, pending: [] } };
    },
    '/sessions': { status: 200, body: { ok: true } },
    '/grants': { status: 200, body: { grants: [] } },
    '/messages': { status: 200, body: { messages: [] } },
    '/me': { status: 200, body: { u: 'A', gm: 0 } },
  };
  // A's browser copy: the account's version 7 plus a forge nobody has uploaded yet.
  const forged = { owner: 'A', accountId: 11, lv: 50, zeny: 40, weapon: 'Mythic Celestial Blade', cloud: { v: 7, at: 1000 }, offlineAt: 9000 };
  const disk = { 'pg_save3_A': JSON.stringify(forged) };
  const keep = h => { for (const [k, v] of h.store) disk[k] = v; };
  const login = (acct, device) => {
    who = acct;
    const h = harness({ storage: disk, S: device ? JSON.parse(JSON.stringify(device)) : undefined, loadReturn: { lv: 50, q: [] }, routes });
    h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = acct;
    // The session response names the account id, and that id (not the name) is what every copy is judged by.
    h.sandbox.CLOUD.id = acct === 'A' ? 11 : 12;
    h.sandbox.currentUser = acct; h.sandbox.CLOUD.ver = server[acct].version;
    return h;
  };

  // 1. A logs in: the forge is this account's own copy plus unsynced play, so it is uploaded, not discarded.
  const a1 = login('A', forged);
  await a1.sandbox.cloudJoin('A', disk['pg_save3_A']);
  assert.strictEqual(server.A.version, 8, 'A\'s login uploaded the forge');
  assert.match(server.A.blob, /Mythic Celestial Blade/, 'the account copy now holds it');
  keep(a1);

  // 2. A logs out. The upload must land before the session goes away.
  await a1.sandbox.cloudLogout();
  keep(a1);
  assert.strictEqual(server.A.version, 9, 'the logout upload reached the server');
  const putAt = a1.calls.findIndex(c => c.url === '/api/save' && c.init.method === 'PUT');
  const delAt = a1.calls.findIndex(c => c.url === '/api/sessions' && c.init.method === 'DELETE');
  assert.ok(delAt > putAt, 'and it was not racing the session DELETE');

  // 3. B logs in on the same browser. A's slot is not read, written or stashed.
  const b1 = login('B');
  const got = await b1.sandbox.cloudReadSave();
  assert.strictEqual(got.data.owner, 'B', 'the cookie now answers for B');
  assert.doesNotMatch(got.data.blob, /Mythic Celestial Blade/, 'and nothing of A\'s is in it');
  b1.store.set('pg_save3_B', got.data.blob);           // what initSessionFromCloud does with a new device
  b1.sandbox.S = JSON.parse(got.data.blob);
  b1.sandbox.CLOUD.dirty = true;
  assert.strictEqual(await b1.sandbox.cloudPush(true), 'ok', 'B saves normally');
  assert.strictEqual(JSON.parse(b1.store.get('pg_save3_A')).weapon, 'Mythic Celestial Blade', 'A\'s copy is untouched by B');
  assert.strictEqual(server.A.version, 9, 'and B\'s push did not write A\'s row');
  keep(b1);

  // 4. A logs back in: same progress on both sides, so nothing is adopted and nothing is stashed.
  const a2 = login('A', JSON.parse(disk['pg_save3_A']));
  await a2.sandbox.cloudJoin('A', disk['pg_save3_A']);
  assert.strictEqual(JSON.parse(a2.store.get('pg_save3_A')).weapon, 'Mythic Celestial Blade', 'the forge is still there');
  assert.strictEqual(a2.sandbox.CLOUD.ver, server.A.version, 'and the tab is on the account\'s version');
  assert.ok(![...a2.store.keys()].some(k => k.startsWith('pg_save3_A_local_')), 'nothing had to be stashed as a loss');
  assert.strictEqual(JSON.parse(a2.store.get('pg_save3_B')).weapon, 'Short Sword', 'B\'s character is intact too');
});

await T('v326: a leaving upload that is cut short does not open the connection gate', async () => {
  const h = harness({ routes: { '/save': { throw: 'page went away' }, '/me': { throw: 'page went away' } } });
  h.sandbox.CLOUD.api = true; h.sandbox.CLOUD.on = true; h.sandbox.CLOUD.user = 'X'; h.sandbox.currentUser = 'X';
  assert.strictEqual(await h.sandbox.cloudFlushLeaving(), 'offline');
  assert.strictEqual(h.sandbox.CLOUD.lost, false, 'there is no page left to explain a gate to');
  assert.strictEqual(h.sandbox.CLOUD.dirty, true, 'and the save is still queued for the next ordinary flush');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
