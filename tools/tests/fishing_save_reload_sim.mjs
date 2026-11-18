// Regression suite for PR 1: fishing progress across cloud uploads, controlled updates,
// slow/lost/conflicting responses, quota failures, format negotiation, and GM restore fences.
//
// Exercises the REAL index.html save/cloud/update functions, REAL assets/social-fishing.js,
// and REAL functions/api/save.js against an in-memory D1 SQLite database, with a controllable
// transport wrapper around fetch (never stubbing cloudFlushNow to succeed).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freshDb, makeEnv } from '../../tools/dev_server.js';
import * as reg from '../../functions/api/register.js';
import * as me from '../../functions/api/me.js';
import * as saveApi from '../../functions/api/save.js';
import * as sessionsApi from '../../functions/api/sessions.js';
import * as C from '../../functions/_lib/save-codec.js';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const three = fs.readFileSync(require.resolve('three/build/three.min.js'), 'utf8');
const preScripts = [
  'assets/sprite_pack_data.js',
  'assets/class_skins_data.js',
  'assets/weapon_joints_data.js',
  'assets/digimon/roster.js',
  'assets/social-rules.js',
  'assets/social-fishing.js',
].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));

function makeCtx() {
  const o = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {},
    setTransform() {}, resetTransform() {}, translate() {}, scale() {}, rotate() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}, measureText: () => ({ width: 8 }), fillText() {}, strokeText() {},
    createPattern: () => null, drawFocusIfNeeded() {},
  };
  return new Proxy(o, { get(t, k) { return k in t ? t[k] : () => {}; } });
}

// Minimal realistic IndexedDB shim shared across page reloads in the same browser profile.
function createProfileStorage() {
  const ls = new Map();
  const idbStores = new Map(); // dbName -> Map(storeName -> Map(key -> structuredClone(val)))
  let quotaExceeded = false;
  let idbAbortWrites = false;
  let lsWrites = 0;

  function makeLocalStorage() {
    return {
      get length() { return ls.size; },
      key(i) { return Array.from(ls.keys())[i] ?? null; },
      getItem(k) { const s = String(k); return ls.has(s) ? ls.get(s) : null; },
      setItem(k, v) {
        if (quotaExceeded) {
          const err = new Error('QuotaExceededError: The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        }
        lsWrites++;
        ls.set(String(k), String(v));
      },
      removeItem(k) { ls.delete(String(k)); },
      clear() { ls.clear(); },
    };
  }

  function makeIndexedDB() {
    const reqWrap = executor => {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => executor(req));
      return req;
    };
    return {
      open(dbName, _version) {
        return reqWrap(req => {
          let dbMap = idbStores.get(dbName);
          const isNew = !dbMap;
          if (!dbMap) { dbMap = new Map(); idbStores.set(dbName, dbMap); }
          const db = {
            objectStoreNames: { contains: n => dbMap.has(n) },
            createObjectStore(n) { if (!dbMap.has(n)) dbMap.set(n, new Map()); return {}; },
            transaction(storeName, _mode) {
              const names = Array.isArray(storeName) ? storeName : [storeName];
              const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
              let pending = 0;
              const finish = () => {
                if (pending === 0) queueMicrotask(() => {
                  const handler = _mode === 'readwrite' && idbAbortWrites ? tx.onabort : tx.oncomplete;
                  if (typeof handler === 'function') handler({ target: tx });
                });
              };
              queueMicrotask(finish);
              return Object.assign(tx, {
                objectStore(n) {
                  if (!dbMap.has(n)) dbMap.set(n, new Map());
                  const st = dbMap.get(n);
                  const op = fn => {
                    pending++;
                    return reqWrap(r => {
                      try {
                        r.result = fn(st);
                        if (typeof r.onsuccess === 'function') r.onsuccess({ target: r });
                      } catch (e) {
                        r.error = e; tx.error = e;
                        if (typeof r.onerror === 'function') r.onerror({ target: r });
                        if (typeof tx.onerror === 'function') tx.onerror({ target: tx });
                      } finally {
                        pending--;
                        finish();
                      }
                    });
                  };
                  return {
                    get: k => op(s => { const v = s.get(String(k)); return v === undefined ? undefined : structuredClone(v); }),
                    put: (v, k) => op(s => { if (!idbAbortWrites) s.set(String(k), structuredClone(v)); return k; }),
                    delete: k => op(s => { s.delete(String(k)); return undefined; }),
                    getAllKeys: () => op(s => Array.from(s.keys())),
                  };
                },
              });
            },
            close() {},
          };
          req.result = db;
          if (isNew && typeof req.onupgradeneeded === 'function') req.onupgradeneeded({ target: req });
          if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
        });
      },
    };
  }

  return {
    ls,
    idbStores,
    get lsWrites() { return lsWrites; },
    setQuotaExceeded(v) { quotaExceeded = !!v; },
    setIdbAbortWrites(v) { idbAbortWrites = !!v; },
    makeLocalStorage,
    makeIndexedDB,
  };
}

function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const cookieFrom = r => {
  const c = (r.headers.getSetCookie ? r.headers.getSetCookie().join(';') : r.headers.get('set-cookie')) || '';
  const m = c.match(/pg_session=[^;]+/);
  return m ? m[0] : '';
};

async function createAccountServer(username = 'angler_' + Math.random().toString(36).slice(2, 7)) {
  const db = freshDb(':memory:');
  const env = makeEnv(db);
  const rr = await reg.onRequestPost({
    request: new Request('https://x/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ u: username, p: 'Sup3rSecret!pass', email: username + '@example.test' }),
    }),
    env,
  });
  assert.equal(rr.status, 201, 'account registration succeeds');
  const cookie = cookieFrom(rr);
  const meRes = await me.onRequestGet({ request: new Request('https://x/api/me', { headers: { cookie } }), env });
  const meBody = await meRes.json();
  return { db, env, username, accountId: meBody.id, cookie };
}

function makeServerTransport(srv) {
  let activeCookie = srv.cookie;
  let versionJsonBuild = null;
  const savePutHooks = []; // FIFO interceptors: fn({ reqInit, executeServer }) => Response-like | Promise
  const log = [];

  async function dispatch(urlStr, init = {}) {
    const u = new URL(urlStr, 'https://x');
    const method = (init.method || 'GET').toUpperCase();
    log.push({ method, path: u.pathname, keepalive: !!init.keepalive, bodyLen: init.body ? String(init.body).length : 0 });

    if (u.pathname === '/version.txt' || u.pathname === '/version.json') {
      const b = versionJsonBuild || 'same';
      return new Response(u.pathname === '/version.txt' ? String(b) : JSON.stringify({ build: b }), {
        status: 200,
        headers: { 'content-type': u.pathname === '/version.txt' ? 'text/plain' : 'application/json' },
      });
    }
    const headers = new Headers(init.headers || {});
    if (activeCookie && !headers.has('cookie')) headers.set('cookie', activeCookie);
    const makeReq = () => new Request('https://x' + u.pathname + u.search, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : init.body,
    });

    if (u.pathname === '/api/me' && method === 'GET') return me.onRequestGet({ request: makeReq(), env: srv.env });
    if (u.pathname === '/api/save' && method === 'GET') return saveApi.onRequestGet({ request: makeReq(), env: srv.env });
    if (u.pathname === '/api/save' && method === 'PUT') {
      const executeServer = () => saveApi.onRequestPut({ request: makeReq(), env: srv.env });
      if (savePutHooks.length) {
        const hook = savePutHooks.shift();
        return hook({ init, headers, executeServer, env: srv.env });
      }
      return executeServer();
    }
    if (u.pathname === '/api/sessions' && method === 'POST') {
      const r = await sessionsApi.onRequestPost({ request: makeReq(), env: srv.env });
      const c = cookieFrom(r);
      if (c) activeCookie = c;
      return r;
    }
    if (u.pathname === '/api/sessions' && method === 'DELETE') {
      const r = await sessionsApi.onRequestDelete({ request: makeReq(), env: srv.env });
      activeCookie = '';
      return r;
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return {
    dispatch,
    log,
    setBuild(b) { versionJsonBuild = b; },
    setCookie(c) { activeCookie = c; },
    interceptNextSavePut(fn) { savePutHooks.push(fn); },
    async readServerSave(formatHeader = '112') {
      const headers = { cookie: activeCookie || srv.cookie };
      if (formatHeader != null) headers['x-save-format'] = String(formatHeader);
      const r = await saveApi.onRequestGet({ request: new Request('https://x/api/save', { headers }), env: srv.env });
      return r.json();
    },
  };
}

function bootClient({ profile, transport, hidden = false }) {
  const reloads = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: false,
    beforeParse(window) {
      Object.defineProperty(window, 'localStorage', { value: profile.makeLocalStorage(), configurable: true });
      Object.defineProperty(window, 'indexedDB', { value: profile.makeIndexedDB(), configurable: true });
      Object.defineProperty(window.document, 'hidden', { value: hidden, configurable: true, writable: true });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { value: function () { return makeCtx(); } });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', { value: () => 'data:image/png;base64,' });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return 1200; } });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return 800; } });
      window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }; };
      window.Element.prototype.setPointerCapture = function () {};
      window.requestAnimationFrame = cb => { window.__raf = cb; return 1; };
      window.cancelAnimationFrame = () => {};
      window.URL.createObjectURL = () => 'blob:x';
      // Freeze background intervals (save every 5s, updateWatch every 60s, cloudRefresh) so tests control exact timing;
      // keep real setTimeout so promises/sleeps/debounce work deterministically.
      window.setInterval = () => 0;
      window.fetch = (u, init) => transport.dispatch(String(u), init || {});
      window.eval(three);
      window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
        this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
        this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
      for (const src of preScripts) window.eval(src);
    },
  });

  const w = dom.window;
  const ev = code => w.eval(code);
  // Intercept hardReload so we observe navigation without tearing down JSDOM mid-assertion.
  ev(`
    window.__reloads = [];
    cloudProbe = async () => { CLOUD.api = true; CLOUD.probing = false; return true; };
    hardReload = function() {
      window.__reloads.push({
        at: Date.now(),
        pushing: CLOUD.pushing,
        dirty: CLOUD.dirty,
        ver: CLOUD.ver
      });
    };
  `);
  transport.setBuild(ev('BUILD'));

  return {
    w,
    ev,
    reloads: () => ev('window.__reloads.slice()'),
    catchFish(spec = { sp: 'koi', rarity: 'rare', w: 6.4, mut: null, perfect: true, lock: false }) {
      const out = ev(`(()=>{
        const F = window.PGSocialFishing;
        S.fishing = F.normalize(S.fishing);
        const entry = F.addCatch(S.fishing, ${JSON.stringify(spec)}, Date.now());
        if (entry && ${Boolean(spec.lock)}) F.toggleLock(S.fishing, entry.id);
        save();
        if (entry && F.shouldAutoSell(S.fishing, entry)) {
          const sold = F.sellFish(S.fishing, entry.id);
          if (sold && sold.ok) save();
        }
        return { entry, coins: S.fishing.coins, catches: S.fishing.stats.catches, bagIds: S.fishing.bag.map(x => x.id) };
      })()`);
      assert.ok(out && out.entry, 'catchFish produced a valid entry for ' + spec.sp);
      return out;
    },
    async signInSession(srv) {
      ev(`CLOUD.api = true;`);
      await ev(`cloudAuth(${JSON.stringify(srv.username)}, 'Sup3rSecret!pass', false)`);
    },
    close() { dom.window.close(); },
  };
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    console.log('  ok   ' + name);
    results.push({ ok: true, name });
  } catch (e) {
    console.log('  FAIL ' + name + ' -> ' + (e && e.message ? e.message : String(e)));
    results.push({ ok: false, name, err: e });
  }
}

console.log('fishing save/reload regression suite\n');

// 1. Reproduced Race A1: clicking "Refresh now" (#updatePrompt button) while an upload is in flight
//    and newer fishing progress was saved locally must NOT reload early or leave the catch unuploaded.
await test('Race A1: clicking update during an in-flight upload waits for upload + newer fishing catch before reloading', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  const gate1 = createDeferred();
  let push1Promise = null;
  try {
    await c1.signInSession(srv);
    // Initial sync to establish v1 on the server.
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');

    // Start upload #1 for fish #1 and hold it in flight on the wire.
    const entered1 = createDeferred();
    transport.interceptNextSavePut(async ({ executeServer }) => {
      entered1.resolve();
      await gate1.promise;
      return executeServer();
    });

    const f1 = c1.catchFish({ sp: 'minnow', rarity: 'common', w: 0.45, perfect: false, lock: false });
    push1Promise = c1.ev('cloudPush(true)');
    await entered1.promise;

    // While upload #1 is in flight, catch a rare locked fish (#2) and show the update prompt.
    const f2 = c1.catchFish({ sp: 'leviathan', rarity: 'mythical', w: 48.25, mut: 'golden', perfect: true, lock: true });
    c1.ev(`showUpdatePrompt('2026-11-17 haven-v9999 test')`);
    const refreshBtn = c1.w.document.querySelector('#updatePrompt button');
    assert.ok(refreshBtn, 'Refresh now button is rendered');

    // Click Refresh now while upload #1 is STILL in flight.
    refreshBtn.click();
    await new Promise(r => setTimeout(r, 40));

    // Must NOT have reloaded while upload #1 is still in flight and f2 has never been uploaded!
    assert.equal(c1.reloads().length, 0, 'page must NOT reload while upload #1 is still in flight');

    // Now release upload #1; coordinator must finish upload #1 AND upload f2 before navigating.
    gate1.resolve();
    await push1Promise;
    await new Promise(r => setTimeout(r, 80));

    assert.equal(c1.reloads().length, 1, 'page reloads exactly once after the newest revision is confirmed saved');
    const serverState = await transport.readServerSave();
    const unpacked = C.unpackSave(JSON.parse(serverState.blob));
    assert.ok(unpacked.fishing.bag.some(e => e.id === f1.entry.id), 'first fish is on server');
    const savedF2 = unpacked.fishing.bag.find(e => e.id === f2.entry.id);
    assert.ok(savedF2, 'catch made during upload is persisted on server before reload');
    assert.equal(savedF2.lock, true, 'keep-lock survived');
    assert.equal(unpacked.fishing.stats.catches, 2, 'catch count is exact');
  } finally {
    gate1.resolve();
    if (push1Promise) await push1Promise.catch(() => {});
    c1.close();
  }
});

// 2. Reproduced Race A2: automatic updateWatch reload with a slow (>1.5s) upload must wait for
//    confirmed save instead of racing a 1,500 ms timer and cutting off the upload.
await test('Race A2: auto-update with slow (>1.5s) save waits for confirmation instead of reloading at 1500ms', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  // Boot visible within UPDATE_AUTO_MS so updateWatch() takes the automatic update reload branch.
  const c1 = bootClient({ profile, transport, hidden: false });
  const slowGate = createDeferred();
  let watchPromise = null;
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');

    const caught = c1.catchFish({ sp: 'voidfin', rarity: 'secret', w: 88.8, mut: 'shiny', perfect: true, lock: true });
    c1.ev('Math.random = () => 0');
    const slowStarted = createDeferred();
    transport.interceptNextSavePut(async ({ executeServer }) => {
      slowStarted.resolve();
      await slowGate.promise;
      return executeServer();
    });

    transport.setBuild('2026-11-17 haven-v9999 slow-test');
    watchPromise = c1.ev('updateWatch()');
    await slowStarted.promise;

    // Wait 1,650 ms (> old 1,500 ms Promise.race cap) while the upload is still in flight.
    await new Promise(r => setTimeout(r, 1650));
    assert.equal(c1.reloads().length, 0, 'must NOT reload at 1,500 ms while slow save is still in flight');

    slowGate.resolve();
    await watchPromise;
    await new Promise(r => setTimeout(r, 50));

    assert.equal(c1.reloads().length, 1, 'reloads only after the slow save actually commits');
    const serverState = await transport.readServerSave();
    const unpacked = C.unpackSave(JSON.parse(serverState.blob));
    assert.ok(unpacked.fishing.bag.some(e => e.id === caught.entry.id && e.lock === true), 'secret fish survived slow auto-update');
  } finally {
    slowGate.resolve();
    if (watchPromise) await watchPromise.catch(() => {});
    c1.close();
  }
});

// 3. Reproduced Race B: catch during upload -> prior upload acks with newer server timestamp ->
//    player reloads/rejoins before next debounce -> localAheadOfServer must STILL recognize
//    unacknowledged local catch instead of adopting stale server save and wiping the fish!
await test('Race B: catch during upload survives reload/rejoin after prior upload acknowledgement', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  let f1, f2;
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');

    const gate1 = createDeferred();
    const entered1 = createDeferred();
    transport.interceptNextSavePut(async ({ executeServer }) => {
      entered1.resolve();
      await gate1.promise;
      // Ensure server commit timestamp is strictly after local save() offlineAt!
      await new Promise(r => setTimeout(r, 30));
      return executeServer();
    });

    f1 = c1.catchFish({ sp: 'koi', rarity: 'rare', w: 5.2, perfect: false, lock: false });
    const push1 = c1.ev('cloudPush(true)');
    await entered1.promise;

    // Catch fish #2 + lock it WHILE upload #1 is in flight!
    f2 = c1.catchFish({ sp: 'starwhale', rarity: 'mythical', w: 650.5, mut: 'golden', perfect: true, lock: true });

    // Upload #1 finishes and stamps base version 2; page closes BEFORE the 1.2s debounce fires upload #2.
    gate1.resolve();
    await push1;
  } finally {
    c1.close();
  }

  // Reload into a brand-new client session on the same browser profile and sign into cloud.
  const c2 = bootClient({ profile, transport });
  try {
    await c2.signInSession(srv);
    const bagAfterReload = c2.ev('S.fishing.bag.map(e => ({ id: e.id, sp: e.sp, lock: e.lock, mut: e.mut }))');
    const catchesAfterReload = c2.ev('S.fishing.stats.catches');
    const dexStarwhale = c2.ev('S.fishing.dex.starwhale && S.fishing.dex.starwhale.n');

    assert.ok(bagAfterReload.some(e => e.id === f1.entry.id), 'fish #1 present after rejoin');
    assert.ok(bagAfterReload.some(e => e.id === f2.entry.id && e.lock === true && e.mut === 'golden'),
      'fish #2 caught during upload #1 MUST NOT be wiped by cloudJoin adopting stale v2');
    assert.equal(catchesAfterReload, 2, 'both catches preserved');
    assert.equal(dexStarwhale, 1, 'starwhale dex entry preserved');
  } finally {
    c2.close();
  }
});

// 4. Silent RAM-only fallback on localStorage quota failure: save() must NOT silently report
//    healthy local persistence without durable outbox + explicit storage warning.
await test('Quota failure: localStorage QuotaExceededError surfaces storage warning and preserves progress in durable outbox across reload', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  let caught;
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');

    // Exhaust localStorage quota before catching fish while offline.
    profile.setQuotaExceeded(true);
    transport.interceptNextSavePut(async () => { throw new Error('offline'); });

    const prevLocalSaveAt = c1.ev('CLOUD.localSaveAt');
    caught = c1.catchFish({ sp: 'tigershark', rarity: 'legendary', w: 190.4, perfect: true, lock: true });
    // Consume the offline interceptor on c1 so c1 cannot upload and c2 must recover from IndexedDB outbox.
    assert.equal(await c1.ev('cloudPush(true)'), 'offline');
    // Allow async IndexedDB outbox write to settle.
    await new Promise(r => setTimeout(r, 40));

    const storageFailureFlag = c1.ev('Boolean(CLOUD.storageFailed || CLOUD.localStorageFailed)');
    const nextLocalSaveAt = c1.ev('CLOUD.localSaveAt');
    assert.equal(storageFailureFlag, true, 'localStorage failure must be explicitly surfaced on CLOUD state');
    assert.equal(nextLocalSaveAt, prevLocalSaveAt, 'memory-only fallback must NOT advance CLOUD.localSaveAt as if localStorage succeeded');
  } finally {
    c1.close();
  }

  // Reload with quota restored and verify IndexedDB durable outbox recovers the legendary fish!
  profile.setQuotaExceeded(false);
  const c2 = bootClient({ profile, transport });
  try {
    await c2.signInSession(srv);
    const bag = c2.ev('S.fishing.bag');
    assert.ok(bag.some(e => e.id === caught.entry.id && e.lock === true),
      'durable IndexedDB outbox recovered the catch across reload after localStorage quota failure');
    const serverState = await transport.readServerSave();
    const unpacked = C.unpackSave(JSON.parse(serverState.blob));
    assert.ok(unpacked.fishing.bag.some(e => e.id === caught.entry.id),
      'recovered outbox catch was also uploaded to the server');
  } finally {
    c2.close();
  }
});

// 5. 428 away-claim handshake during update flush: server demands away settlement (428) before
//    accepting PUT /api/save; coordinator settles claim, completes follow-up PUT, and only THEN reloads.
await test('428 away-claim handshake during update flush completes both away claim and fishing catch before reload', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');

    // Catch a fish + set a server-side away claim by backdating last_seen past AWAY_THRESHOLD_MS with rate_kph > 0.
    const caught = c1.catchFish({ sp: 'angler', rarity: 'epic', w: 22.4, perfect: true, lock: true });
    srv.db.prepare('UPDATE saves SET last_seen = ?, rate_kph = 120 WHERE user_id = ?').run(Date.now() - 20 * 60 * 1000, srv.accountId);

    c1.ev(`showUpdatePrompt('2026-11-17 haven-v9999 claim428')`);
    c1.w.document.querySelector('#updatePrompt button').click();
    await new Promise(r => setTimeout(r, 120));

    assert.equal(c1.reloads().length, 1, 'reloaded once 428 handshake + follow-up PUT succeeded');
    const savePuts = transport.log.filter(c => c.method === 'PUT' && c.path === '/api/save');
    assert.ok(savePuts.length >= 3, 'initial v1 PUT + 428 PUT + settled retry PUT');

    const serverState = await transport.readServerSave();
    const unpacked = C.unpackSave(JSON.parse(serverState.blob));
    assert.ok(unpacked.fishing.bag.some(e => e.id === caught.entry.id && e.lock === true), 'epic fish survived 428 handshake');
  } finally {
    c1.close();
  }
});

// 6. 413 too-large, 503 maintenance, and 401 session-replaced during update flush NEVER reload
//    over unsaved fishing progress, always unfreeze CLOUD.updating, and preserve Retry + Keep playing.
await test('413 too-large, 503 maintenance, and 401 session-replaced block update reload and unfreeze gameplay', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');
    const caught = c1.catchFish({ sp: 'manta', rarity: 'legendary', w: 140.2, mut: 'prism', perfect: true, lock: true });

    c1.ev(`showUpdatePrompt.until = 0; showUpdatePrompt('2026-11-17 haven-v9999 err-matrix')`);

    // (a) 413 Payload Too Large (matches real functions/api/save.js { err, saveTooLarge: true })
    transport.interceptNextSavePut(async () => new Response(JSON.stringify({ err: 'Save exceeds limit', saveTooLarge: true }), {
      status: 413, headers: { 'content-type': 'application/json' },
    }));
    c1.w.document.querySelector('#updatePrompt button').click();
    await new Promise(r => setTimeout(r, 60));
    assert.equal(c1.reloads().length, 0, '413 must NOT reload');
    assert.equal(c1.ev('CLOUD.updating'), false, '413 unfreezes CLOUD.updating');
    assert.equal(c1.ev('CLOUD.blocked'), 'too-large', 'records too-large block');
    assert.ok(c1.w.document.querySelector('#updatePrompt [data-update-later]'), 'Keep playing button available');

    // Clear blocked state + test (b) 503 maintenance
    c1.ev('CLOUD.blocked = null; CLOUD.dirty = true;');
    transport.interceptNextSavePut(async () => new Response(JSON.stringify({ err: 'Maintenance', retry: true }), {
      status: 503, headers: { 'content-type': 'application/json' },
    }));
    c1.w.document.querySelector('#updatePrompt button').click();
    await new Promise(r => setTimeout(r, 60));
    assert.equal(c1.reloads().length, 0, '503 maintenance must NOT reload');
    assert.equal(c1.ev('CLOUD.updating'), false, '503 unfreezes CLOUD.updating');

    // Recover from maintenance gate, then test (c) 401 session replaced
    c1.ev('CLOUD.lost = false; CLOUD.offline = false; CLOUD.dirty = true;');
    transport.interceptNextSavePut(async () => new Response(JSON.stringify({ err: 'Session replaced' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    }));
    c1.w.document.querySelector('#updatePrompt button').click();
    await new Promise(r => setTimeout(r, 60));
    assert.equal(c1.reloads().length, 0, '401 session replaced must NOT reload');
    assert.equal(c1.ev('CLOUD.updating'), false, '401 unfreezes CLOUD.updating');
    assert.equal(c1.ev('S.fishing.bag.some(e => e.id === ' + JSON.stringify(caught.entry.id) + ')'), true, 'local catch intact');
  } finally {
    c1.close();
  }
});

// 7. 409 conflict matrix:
//    (a) same-cid lost-response retry (exact rev already committed) -> 'ok' with ZERO extra PUTs
//    (b) same-cid lost-response + newer local catch -> rebases baseVersion and uploads newer catch
//    (c) foreign-cid conflict -> adopts server copy, stashes _local_ backup, logs fishing adopt-behind
//    (d) GM restore_fence -> never rebases over GM restore even if local rev is higher
await test('409 conflict matrix: same-cid lost-response (zero extra PUT vs rebase), foreign-cid adopt+backup, and GM restore fence', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');

    // (a) Lost-response on upload: server commits v2 with our cid+rev, but network drops the response!
    c1.catchFish({ sp: 'salmon', rarity: 'uncommon', w: 4.1, perfect: true, lock: false });
    transport.interceptNextSavePut(async ({ executeServer }) => {
      await executeServer(); // commits v2 on real D1!
      throw new Error('socket hang up after server commit');
    });
    assert.equal(await c1.ev('cloudPush(true)'), 'offline');
    // Probe failure check ran /me (200), so CLOUD.lost stayed false and CLOUD.ver is still 1!
    assert.equal(c1.ev('CLOUD.ver'), 1);

    const putsBeforeRetry = transport.log.filter(c => c.method === 'PUT' && c.path === '/api/save').length;
    assert.equal(await c1.ev('cloudPush(true)'), 'ok', 'retry hits 409, recognizes exact cid+rev, returns ok');
    const putsAfterRetry = transport.log.filter(c => c.method === 'PUT' && c.path === '/api/save').length;
    assert.equal(putsAfterRetry - putsBeforeRetry, 1, 'ZERO extra follow-up PUT when exact uploadedRev already landed');
    assert.equal(c1.ev('CLOUD.ver'), 2);
    assert.equal(c1.ev('CLOUD.dirty'), false);

    // (b) Lost-response + newer local catch before retry: server committed f2 (v3), response dropped,
    //     player caught f3 locally, then retry hits 409 -> rebases onto v3 and uploads f3 as v4!
    c1.catchFish({ sp: 'pike', rarity: 'rare', w: 6.5, perfect: false, lock: false });
    transport.interceptNextSavePut(async ({ executeServer }) => {
      await executeServer(); // commits v3 on server
      throw new Error('dropped response');
    });
    assert.equal(await c1.ev('cloudPush(true)'), 'offline');
    const f3 = c1.catchFish({ sp: 'oarfish', rarity: 'mythical', w: 175.0, mut: 'albino', perfect: true, lock: true });
    assert.equal(await c1.ev('cloudCoordinateFlush(false)'), 'ok', 'same-cid with newer local rev rebases and uploads f3');
    assert.equal(c1.ev('CLOUD.ver'), 4);
    let serverUnpacked = C.unpackSave(JSON.parse((await transport.readServerSave()).blob));
    assert.ok(serverUnpacked.fishing.bag.some(e => e.id === f3.entry.id), 'rebased PUT landed f3 on server');

    // (c) Foreign device advances server to v5 with fewer fishing catches (same Zeny/kills), while
    //     c1 catches another fish locally -> c1's push hits 409 with foreign cid -> MUST adopt v5,
    //     stash c1's copy under _local_*, and log adopt-behind with fishing figures!
    const f4 = c1.catchFish({ sp: 'kraken', rarity: 'secret', w: 999.0, mut: 'cursed', perfect: true, lock: true });
    const foreignSave = JSON.parse(JSON.stringify(serverUnpacked));
    foreignSave.cloud = { v: 4, at: Date.now(), rev: 99, ackRev: 99, cid: 'foreign-device-cid' };
    foreignSave.fishing.bag = [];
    foreignSave.fishing.stats.catches = 1;
    const packedForeign = JSON.stringify(C.packSave(foreignSave));
    srv.db.prepare('UPDATE saves SET blob = ?, version = 5, updated_at = ? WHERE user_id = ?')
      .run(packedForeign, Date.now(), srv.accountId);

    assert.equal(await c1.ev('cloudPush(true)'), 'adopted', 'foreign cid 409 adopts server save instead of rebasing');
    const backupKeys = [...profile.ls.keys()].filter(k => k.includes('_local_'));
    assert.ok(backupKeys.length >= 1, 'stashed local save under _local_ backup key');
    const stashed = C.unpackSave(JSON.parse(profile.ls.get(backupKeys[backupKeys.length - 1])));
    assert.ok(stashed.fishing.bag.some(e => e.id === f4.entry.id), 'stashed backup contains unsynced kraken catch');
    const behindEntry = c1.ev('(() => { const orig = console.table; console.table = () => {}; try { return pgSyncLog().find(x => x.kind === "adopt-behind"); } finally { console.table = orig; } })()');
    assert.ok(behindEntry && behindEntry.wasFishCatches > behindEntry.nowFishCatches,
      'pgSyncLog records adopt-behind when fishing catches regressed even with identical Zeny/kills');

    // (d) GM restore_fence on server: even if server blob carried our own cid, restoreFenced:true MUST adopt!
    const f5 = c1.catchFish({ sp: 'carp', rarity: 'common', w: 1.5, perfect: false, lock: false });
    const gmBlobObj = JSON.parse((await transport.readServerSave()).blob);
    const gmUnpacked = C.unpackSave(gmBlobObj);
    gmUnpacked.gmRestore = { at: Date.now(), by: 'gm' };
    gmUnpacked.cloud = { v: 5, at: Date.now(), rev: 1, ackRev: 1, cid: c1.ev('CLOUD.cid') };
    srv.db.prepare('UPDATE saves SET blob = ?, version = 6, updated_at = ? WHERE user_id = ?')
      .run(JSON.stringify(C.packSave(gmUnpacked)), Date.now(), srv.accountId);

    assert.equal(await c1.ev('cloudPush(true)'), 'adopted', 'GM restore_fence forces adopt, never rebases');
    assert.equal(c1.ev('S.fishing.bag.some(e => e.id === ' + JSON.stringify(f5.entry.id) + ')'), false, 'GM restored save adopted');
  } finally {
    c1.close();
  }
});

// 8. cloudLogout() bounds hung uploads, resets CLOUD.updating, and preserves unsent catch in outbox.
await test('cloudLogout finishes within bounded timeout when network hangs and preserves unsent catch for next login', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  const never = createDeferred();
  let caught;
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');

    caught = c1.catchFish({ sp: 'coelacanth', rarity: 'mythical', w: 82.3, mut: 'ancient', perfect: true, lock: true });
    // Fast-forward long logout/abort timers (>= 15000ms -> 80ms) in this window so we exercise the real cap cleanly!
    c1.ev(`(() => {
      const origSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...rest) => origSetTimeout(fn, ms >= 15000 ? 80 : ms, ...rest);
    })()`);
    transport.interceptNextSavePut(() => never.promise);

    const t0 = Date.now();
    await Promise.race([
      c1.ev('cloudLogout()'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('cloudLogout hung')), 2000)),
    ]);
    assert.ok(Date.now() - t0 < 1500, 'cloudLogout completed within bounded timeout');
    assert.equal(c1.ev('CLOUD.updating'), false, 'CLOUD.updating reset after logout');
    assert.equal(c1.ev('CLOUD.on'), false, 'session closed locally');
  } finally {
    never.resolve(new Response('{}', { status: 503 }));
    c1.close();
  }

  // Log back in and verify the coelacanth survived and syncs to the server!
  const c2 = bootClient({ profile, transport });
  try {
    await c2.signInSession(srv);
    assert.equal(c2.ev('S.fishing.bag.some(e => e.id === ' + JSON.stringify(caught.entry.id) + ')'), true,
      'unsent catch survived bounded logout and loaded on next sign-in');
    const serverUnpacked = C.unpackSave(JSON.parse((await transport.readServerSave()).blob));
    assert.ok(serverUnpacked.fishing.bag.some(e => e.id === caught.entry.id), 'catch uploaded to server on rejoin');
  } finally {
    c2.close();
  }
});

// 9. Documented restoreFrom(backupKey) console workflow (docs/CHECK-A-SAVE.md) still uploads cleanly.
await test('restoreFrom console workflow from docs/CHECK-A-SAVE.md satisfies localAheadOfServer and uploads restored fishing save', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport });
  let backupKey, treasuredFish;
  try {
    await c1.signInSession(srv);
    assert.equal(await c1.ev('cloudPush(true)'), 'ok');
    treasuredFish = c1.catchFish({ sp: 'leviathan', rarity: 'secret', w: 512.0, mut: 'celestial', perfect: true, lock: true });
    // Stash a _local_ backup just like cloudAdopt does, then overwrite server with an empty-bag v2 save.
    const liveKey = c1.ev('saveKeyFor(currentUser)');
    backupKey = `${liveKey}_local_${Date.now()}`;
    profile.ls.set(backupKey, profile.ls.get(liveKey));

    const emptyServer = C.unpackSave(JSON.parse((await transport.readServerSave()).blob));
    emptyServer.fishing.bag = [];
    emptyServer.cloud = { v: 2, at: Date.now() - 5000, rev: 10, ackRev: 10, cid: 'other-cid' };
    srv.db.prepare('UPDATE saves SET blob = ?, version = 2, updated_at = ? WHERE user_id = ?')
      .run(JSON.stringify(C.packSave(emptyServer)), Date.now() - 5000, srv.accountId);

    // Run the exact restoreFrom(key) console flow documented in docs/CHECK-A-SAVE.md.
    await c1.ev(`(async (key) => {
      const main = 'pg_save3_' + currentUser;
      const copy = JSON.parse(localStorage.getItem(key) || 'null');
      const d = await (await fetch('/api/save', { credentials: 'same-origin', cache: 'no-store' })).json();
      copy.owner = currentUser;
      copy.cloud = { v: Number(d.version) || 0, at: Date.now() - 60000 };
      copy.offlineAt = Date.now();
      localStorage.setItem(main, JSON.stringify(copy));
    })(${JSON.stringify(backupKey)})`);
  } finally {
    c1.close();
  }

  const c2 = bootClient({ profile, transport });
  try {
    await c2.signInSession(srv);
    assert.equal(c2.ev('S.fishing.bag.some(e => e.id === ' + JSON.stringify(treasuredFish.entry.id) + ')'), true,
      'restoreFrom save beat server copy at login');
    const serverUnpacked = C.unpackSave(JSON.parse((await transport.readServerSave()).blob));
    assert.ok(serverUnpacked.fishing.bag.some(e => e.id === treasuredFish.entry.id),
      'restoreFrom save uploaded to server');
  } finally {
    c2.close();
  }
});

// 10. Active fishing minigame & simulation ticks pause cleanly while CLOUD.updating is true.
await test('CLOUD.updating pauses fishing minigame input/timers and freezes combat/plaza mutations', async () => {
  const srv = await createAccountServer();
  const profile = createProfileStorage();
  const transport = makeServerTransport(srv);
  const c1 = bootClient({ profile, transport, hidden: false });
  try {
    await c1.signInSession(srv);
    const res = c1.ev(`(() => {
      if (!document.getElementById('socialHub')) {
        const hub = document.createElement('div');
        hub.id = 'socialHub';
        document.body.appendChild(hub);
      }
      const pond = window.PGSocialRules.PONDS[0];
      window.PGSocialFishing.bind({
        getSave: () => S,
        save: () => save(),
        self: () => ({ x: pond.x, z: pond.z }),
        isUpdating: () => !!(CLOUD && CLOUD.updating),
      });
      window.PGSocialFishing.toggle(); // enters 'ready' phase
      const phaseStart = window.PGSocialFishing.phase;
      CLOUD.updating = true;
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      const phaseWhileUpdating = window.PGSocialFishing.phase;
      const killsBefore = S.kills, zenyBefore = S.zeny;
      loop(performance.now() + 5000);
      bgTick(true);
      const frozen = (S.kills === killsBefore && S.zeny === zenyBefore && farmSamplingPaused() === true && plazaFarmIncome() === null);
      CLOUD.updating = false;
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      const phaseAfterResume = window.PGSocialFishing.phase;
      window.PGSocialFishing.stop();
      return { phaseStart, phaseWhileUpdating, frozen, phaseAfterResume };
    })()`);
    assert.equal(res.phaseStart, 'ready', 'fishing starts in ready phase');
    assert.equal(res.phaseWhileUpdating, 'ready', 'fishing cast blocked while CLOUD.updating is true');
    assert.equal(res.frozen, true, 'combat loop, bgTick, farmSamplingPaused, and plazaFarmIncome paused while CLOUD.updating is true');
    assert.equal(res.phaseAfterResume, 'charge', 'fishing cast resumes cleanly once CLOUD.updating is false');
  } finally {
    c1.close();
  }
});


// Follow-up regressions reproduced on PR #248 before the fixes.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await test('Independent browser writers cannot overwrite a newer foreign save', async () => {
 const srv=await createAccountServer();
 const pa=createProfileStorage(),pb=createProfileStorage(),ta=makeServerTransport(srv),tb=makeServerTransport(srv);
 const a=bootClient({profile:pa,transport:ta}),b=bootClient({profile:pb,transport:tb});
 try{
  await a.signInSession(srv);await a.ev('cloudPush(true)');
  for(let i=0;i<3;i++)a.catchFish({sp:'minnow',w:.4,perfect:false});
  await b.signInSession(srv);
  const f=b.catchFish({sp:'salmon',w:2,perfect:false});await b.ev('cloudPush(true)');
  assert.notEqual(a.ev('CLOUD.cid'),b.ev('CLOUD.cid'),'each page has its own writer');
  await a.signInSession(srv);
  const row=await ta.readServerSave();const s=C.unpackSave(JSON.parse(row.blob));
  assert.ok(s.fishing.bag.some(x=>x.id===f.entry.id),'the newer browser save is authoritative');
 }finally{a.close();b.close()}
});

await test('Tabs sharing localStorage still use independent writer identities', async () => {
 const srv=await createAccountServer();
 const pa=createProfileStorage(),pb=pa,ta=makeServerTransport(srv),tb=makeServerTransport(srv);
 const a=bootClient({profile:pa,transport:ta}),b=bootClient({profile:pb,transport:tb});
 try{
  await a.signInSession(srv);await a.ev('cloudPush(true)');
  for(let i=0;i<3;i++)a.catchFish({sp:'minnow',w:.4,perfect:false});
  await b.signInSession(srv);
  const f=b.catchFish({sp:'salmon',w:2,perfect:false});await b.ev('cloudPush(true)');
  assert.notEqual(a.ev('CLOUD.cid'),b.ev('CLOUD.cid'),'each page has its own writer');
  await a.signInSession(srv);
  const row=await ta.readServerSave();const s=C.unpackSave(JSON.parse(row.blob));
  assert.ok(s.fishing.bag.some(x=>x.id===f.entry.id),'the newer browser save is authoritative');
 }finally{a.close();b.close()}
});

await test('IndexedDB recovery survives reload while localStorage remains full', async () => {
 const srv=await createAccountServer(),profile=createProfileStorage(),transport=makeServerTransport(srv);
 let c=bootClient({profile,transport});let fish;
 try{
  await c.signInSession(srv);await c.ev('cloudPush(true)');
  profile.setQuotaExceeded(true);
  fish=c.catchFish({sp:'minnow',w:.4,perfect:false,lock:true});
  transport.interceptNextSavePut(async()=>{throw Error('offline')});
  await c.ev('cloudPush(true)');await sleep(60);
  assert.equal(c.ev('CLOUD.outboxDurable'),true,'IDB transaction committed before reload');
 }finally{c.close()}
 c=bootClient({profile,transport});
 try{
  await c.signInSession(srv);await sleep(50);
  const row=await transport.readServerSave();const server=C.unpackSave(JSON.parse(row.blob));
  assert.equal(c.ev('S.fishing.bag.length'),1);assert.ok(server.fishing.bag.some(f=>f.id===fish.entry.id),'the recovered payload, not the stale slot, was uploaded');
 }finally{c.close()}
});

await test('Legacy local metadata recovers the newer outbox savedAt', async () => {
 const srv=await createAccountServer(),profile=createProfileStorage(),transport=makeServerTransport(srv);
 let c=bootClient({profile,transport});let fish;
 try{
  await c.signInSession(srv);await c.ev('cloudPush(true)');
  c.ev(`(()=>{const old=JSON.parse(localStorage.getItem(saveKey()));old.cloud={v:CLOUD.ver,at:Date.now()-1000};old.offlineAt=Date.now()-500;localStorage.setItem(saveKey(),JSON.stringify(old));})()`);
  profile.setQuotaExceeded(true);
  fish=c.catchFish({sp:'minnow',w:.4,perfect:false,lock:true});
  transport.interceptNextSavePut(async()=>{throw Error('offline')});await c.ev('cloudPush(true)');await sleep(50);
 }finally{c.close()}
 profile.setQuotaExceeded(false);c=bootClient({profile,transport});
 try{
  await c.signInSession(srv);
  assert.equal(c.ev('S.fishing.bag.length'),1);assert.ok(C.unpackSave(JSON.parse((await transport.readServerSave()).blob)).fishing.bag.some(f=>f.id===fish.entry.id));
 }finally{c.close()}
});

await test('Keep playing cancels navigation from an outstanding update save', async () => {
 const srv=await createAccountServer(),profile=createProfileStorage(),transport=makeServerTransport(srv);
 const c=bootClient({profile,transport}),gate=createDeferred(),entered=createDeferred();
 try{
  await c.signInSession(srv);await c.ev('cloudPush(true)');
  c.catchFish({sp:'minnow',w:.4,perfect:false});
  transport.interceptNextSavePut(async({executeServer})=>{entered.resolve();await gate.promise;return executeServer()});
  c.ev(`showUpdatePrompt('test-new-build')`);
  const first=c.w.document.querySelector('#updatePrompt button');const navigation=first.onclick();await entered.promise;
  c.w.document.querySelector('#updatePrompt [data-update-later]').click();
  assert.equal(c.w.document.getElementById('updatePrompt'),null);assert.equal(c.ev('CLOUD.updating'),false);
  gate.resolve();await navigation;
  assert.equal(c.reloads().length,0,'dismissed update cannot navigate later');
 }finally{gate.resolve();c.close()}
});

await test('Conflict adoption with a real offline claim finishes without self-await', async () => {
 const srv=await createAccountServer(),profile=createProfileStorage(),transport=makeServerTransport(srv);
 const c=bootClient({profile,transport});
 try{
  await c.signInSession(srv);await c.ev('cloudPush(true)');
  const row=await transport.readServerSave();const other=C.unpackSave(JSON.parse(row.blob));other.cloud.cid='foreign-lineage';
  c.catchFish({sp:'minnow',w:.4,perfect:false});
  srv.db.prepare('UPDATE saves SET version=version+1,blob=?,last_seen=? WHERE user_id=?').run(JSON.stringify(C.packSave(other)),Date.now()-240000,srv.accountId);
  const p=c.ev('cloudFlushNow()');
  const outcome=await Promise.race([p,sleep(2000).then(()=>'STILL PENDING')]);
  assert.equal(outcome,'ok');assert.equal(c.ev('CLOUD.pushing'),false);assert.ok(c.ev('S.offlineClaimId')>0);const saved=C.unpackSave(JSON.parse((await transport.readServerSave()).blob));assert.equal(saved.offlineClaimId,c.ev('S.offlineClaimId'),'claim acknowledgement reached durable storage');
 }finally{c.close()}
});

await test('An IndexedDB request success followed by transaction abort never claims durability', async () => {
  const srv = await createAccountServer(), profile = createProfileStorage(), transport = makeServerTransport(srv);
  const c = bootClient({ profile, transport });
  try {
    await c.signInSession(srv); await c.ev('cloudPush(true)');
    profile.setQuotaExceeded(true); profile.setIdbAbortWrites(true);
    c.catchFish({ sp: 'minnow', w: .4, perfect: false });
    await sleep(30);
    assert.equal(c.ev('CLOUD.outboxDurable'), false);
    assert.ok(c.ev('logs.some(e=>e.m.includes("only in this tab"))'));
    assert.equal(c.ev('logs.some(e=>e.m.includes("held in the durable outbox"))'), false);
    assert.equal(c.reloads().length, 0);
  } finally { c.close(); }
});

await test('A restore-fenced conflict with a real offline claim completes and preserves the GM restore', async () => {
  const srv = await createAccountServer(), profile = createProfileStorage(), transport = makeServerTransport(srv);
  const c = bootClient({ profile, transport });
  try {
    await c.signInSession(srv); await c.ev('cloudPush(true)');
    const restored = C.unpackSave(JSON.parse((await transport.readServerSave()).blob));
    restored.gmRestore = { at: Date.now(), by: 'gm' };
    const unsynced = c.catchFish({ sp: 'minnow', w: .4, perfect: false });
    srv.db.prepare('UPDATE saves SET version=version+1,blob=?,last_seen=? WHERE user_id=?')
      .run(JSON.stringify(C.packSave(restored)), Date.now()-240000, srv.accountId);
    const outcome = await Promise.race([c.ev('cloudFlushNow()'), sleep(2000).then(()=>'STILL PENDING')]);
    assert.equal(outcome, 'ok'); assert.equal(c.ev('CLOUD.pushing'), false);
    const saved = C.unpackSave(JSON.parse((await transport.readServerSave()).blob));
    assert.equal(saved.gmRestore.at, restored.gmRestore.at);
    assert.ok(saved.offlineClaimId > 0);
    assert.equal(saved.fishing.bag.some(f=>f.id===unsynced.entry.id), false, 'the stale device never undoes the restore');
  } finally { c.close(); }
});

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
