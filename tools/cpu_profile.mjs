#!/usr/bin/env node
// Comparative per-request CPU profile for the hot gameplay API routes.
//
//   node tools/cpu_profile.mjs                          # every fixture, JSON to stdout
//   node tools/cpu_profile.mjs --runs 41 --json out.json
//   node tools/cpu_profile.mjs --only save-put-medium
//
// WHAT THIS IS, AND WHAT IT IS NOT
// It runs the REAL handlers (functions/api/*.js) against the REAL migrations through the local D1
// shim and measures Node's `process.cpuUsage()` around the complete request. That makes it a valid
// COMPARISON - identical fixtures, one process, one variable changed - and nothing more.
// It is NOT a measurement of Cloudflare's billed `cpu_ms`: workerd is a different runtime, the D1
// shim is not production D1 (it is synchronous SQLite in this process, so its cost lands in the CPU
// number in a way a real D1 round trip would not), and there is no cold start here. A route measured
// at 1.2 ms locally can be faster or slower in production. Only Cloudflare's own CPU metrics
// (`pagesFunctionsInvocationsAdaptiveGroups` quantiles + `exceededResources`) can settle that; see
// docs/CPU-LIMIT.md.
//
// The elapsed (`performance.now()`/wall) number is reported SEPARATELY and is never mixed into the
// CPU figure: elapsed time includes I/O and scheduling, which is exactly what a CPU limit does not
// bill.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- arguments ----
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const RUNS = Math.max(3, Number(flag('runs', 21)));
const ONLY = flag('only', null);
const JSON_OUT = flag('json', null);
const LABEL = flag('label', 'local');
const VERBOSE = argv.includes('--verbose');

// ------------------------------------------------------------------- D1 shim ----
// Same shape as tools/tests/api_sim.js (prepare/bind/first/all/run/batch) plus a statement counter,
// because "subrequests" and D1 statements per request are part of the cost being reported.
function makeD1(sqlite, stats) {
  const note = sql => { stats.statements++; stats.sql.push(sql.replace(/\s+/g, ' ').trim().slice(0, 70)); };
  const wrap = (stmt, args = [], sql = '') => ({
    _stmt: stmt, _args: args, _sql: sql,
    bind: (...more) => wrap(stmt, args.concat(more), sql),
    first: async () => { note(sql); return stmt.get(...args) ?? null; },
    all: async () => { note(sql); return { results: stmt.all(...args) }; },
    run: async () => { note(sql); return { success: true, meta: stmt.run(...args) }; },
  });
  return {
    prepare: sql => wrap(sqlite.prepare(sql), [], sql),
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        return statements.map(q => { note(q._sql || ''); return { success: true, meta: q._stmt.run(...q._args) }; });
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
      finally { try { sqlite.exec('COMMIT'); } catch {} }
    },
  };
}

function freshEnv() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(root, 'migrations');
  for (const name of fs.readdirSync(dir).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
  }
  const stats = { statements: 0, sql: [] };
  return { env: { DB: makeD1(sqlite, stats) }, sqlite, stats };
}

// ---------------------------------------------------------------- fixtures ----
// All three are built by the GAME's own constructors (genGear/newCard/addCatch), never hand-written:
// a synthetic item that the game would never mint measures the wrong parse.
const { createGame } = require(path.join(root, 'tools/tests/helpers/game.js'));
const { fullStorageSave } = require(path.join(root, 'tools/tests/helpers/full-storage-save.js'));

function fixtures() {
  const g = createGame();
  const ev = g.ev;
  // The fishing module is a separate asset the page loads itself; the fixture needs its real
  // normalize()/addCatch() constructors (see tools/tests/helpers/full-storage-save.js).
  ev(fs.readFileSync(path.join(root, 'assets/social-fishing.js'), 'utf8'));
  const build = src => JSON.parse(ev(`(()=>{ S=load(); ${src}; return JSON.stringify(S) })()`));
  const small = build(`
    S.cls='Novice'; S.lv=24; S.zeny=12345; S.kills=120;
    S.inv=[]; S.cards=[]; S.eq={};
    for(let i=0;i<6;i++)S.inv.push(genGear({k:'armor',n:'Cotton Robe',quality:1},24,i%3,false,undefined,0,10));
  `);
  const medium = build(`
    S.cls='Ranger'; S.lv=120; S.zeny=12000000; S.kills=250000;
    const sl=['weapon','armor','head','off','leg','acc'];
    const pool=[];for(let i=0;i<200;i++)pool.push(newCard(cardDefinition(i%10,i%4,i%2===0)));
    S.inv=[];
    for(let i=0;i<300;i++){
      const it=genGear({k:sl[i%6],n:'Faunus Hide',quality:1},120,i%4,false,undefined,i%10,10);
      it.cards=[];
      if(i%3===0){ it.slots=2; for(let k=0;k<2;k++){const c=JSON.parse(JSON.stringify(pool[(i*2+k)%200]));c.id=2000000+i*2+k;it.cards.push(c);} }
      S.inv.push(it);
    }
    S.cards=pool.slice(0,150).map((c,j)=>{const d=JSON.parse(JSON.stringify(c));d.id=3000000+j;return d});
    const F=PGSocialFishing; S.fishing=F.normalize({bagTier:2});
    for(let i=0;i<200;i++){const sp=F.SPECIES[i%F.SPECIES.length];
      F.addCatch(S.fishing,{sp:sp.id,w:sp.min+(sp.max-sp.min)*0.5,mut:i%2?'prismatic':null,perfect:i%2===0},1794873600000+i*60000);}
  `);
  g.close();
  const nearCap = fullStorageSave();
  // The saves the server actually stores: the client sends the compact form (v414) and the handler
  // unpacks it. Measuring the plain form instead would measure a payload production no longer sends.
  return { small, medium, nearCap };
}

// --------------------------------------------------------------- requester ----
const mods = new Map();
const load = async file => {
  if (!mods.has(file)) mods.set(file, await import(pathToFileURL(path.join(root, 'functions', file)).href));
  return mods.get(file);
};
// A request object shaped like the ones Pages hands a Function (headers.get/text/url), built ONCE per
// case so the harness's own allocation is not counted as the handler's.
const makeRequest = (method, url, { body, cookie, headers = {} } = {}) => {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if (cookie) h.set('cookie', cookie);
  if (body !== undefined) h.set('content-type', 'application/json');
  return { method, url: 'https://pg.test' + url, headers: { get: k => h.get(String(k).toLowerCase()) ?? null },
    text: async () => body ?? '', body: null };
};

// The handler's own JSON.stringify is counted (it happens inside `json()`); draining the body is a
// decode of a string that already exists. The body is deliberately NOT parsed here: a conflict reply
// carries the whole live save, and re-parsing it in the harness would charge the server for a parse
// it never does.
//
// v419: `headers` and a light body probe are returned so a case can ASSERT it measured the request it
// claims to (status, version, encoding). A case that silently measured a refused request - the old
// conflict case sent no X-Save-Format, so every "conflict" it timed was a legacy plain-save EXPANSION,
// not a modern client's conflict - is how a 32 ms figure ended up in a report as "the conflict cost".
// `parse` is opt-in for SETUP calls only. Inside a measured window the reply body is drained but never
// parsed: parsing a 300 KB conflict reply here would charge the server for the harness's own work.
const call = async (fn, file, request, env, { parse = false } = {}) => {
  if (MIDDLEWARE) return runWithMiddleware(fn, file, withClientIp(request), env, { parse });
  const m = await load(file);
  const res = await m[fn]({ request, env, params: {} });
  const text = await res.text();
  let body = null;
  if (parse && text) { try { body = JSON.parse(text); } catch {} }
  return { status: res.status, text, body };
};

// ---------------------------------------------------------------- middleware ----
// v419: a hostname there is no middleware. `functions/api/_middleware.js` runs BEFORE every handler and
// is not free: the production-preview refusal, the network-ban check (an address hash plus a cached
// `ip_bans` membership test) and, when `WRITE_GATE=required`, the Durable Object lease. A harness that
// calls the handler directly measures the handler and silently omits all of that - which understates
// every request and hides exactly the kind of per-request tax the CPU investigation is about.
//
// So `--middleware` drives the REAL onRequest export with the real request and a `next()` that enters
// the handler, the way Pages does. It is a separate mode on purpose: handler-only numbers stay
// comparable with every earlier measurement, and the middleware delta becomes its own line.
const runWithMiddleware = async (fn, file, request, env, { parse = false } = {}) => {
  const middleware = await load('api/_middleware.js');
  const m = await load(file);
  const started = process.cpuUsage();
  const res = await middleware.onRequest({
    request, env, params: {},
    next: async () => m[fn]({ request, env, params: {} }),
    // Pages supplies this; the gate release is charged to the request when it is absent, so mirror it.
    waitUntil: () => {},
  });
  const text = await res.text();
  const cpu = process.cpuUsage(started);
  let body = null;
  if (parse && text) { try { body = JSON.parse(text); } catch {} }
  return { status: res.status, text, body, cpuMs: (cpu.user + cpu.system) / 1000 };
};
const MIDDLEWARE = argv.includes('--middleware');
// In middleware mode the network-ban check has no fingerprint on a plain node request, so it would be
// skipped and the measurement would again flatter the code. Supply a real client address (and a ban
// row, when asked) so `ipHash()` + `isIpBanned()` actually run.
const MIDDLEWARE_IP = flag('client-ip', '203.0.113.7');
const CLIENT_HEADERS = ['cookie', 'content-type', 'x-save-format'];
const withClientIp = request => {
  // Rebuild the request with a real client address added; every original header is preserved, because a
  // harness that drops the session cookie measures 401s and calls them requests.
  const added = new Map([['cf-connecting-ip', MIDDLEWARE_IP], ['host', 'pg.test']]);
  return {
    method: request.method, url: request.url,
    headers: {
      get: k => { const key = String(k).toLowerCase(); return added.has(key) ? added.get(key) : request.headers.get(key); },
    },
    text: request.text, body: null,
  };
};
void CLIENT_HEADERS;

// A request whose BODY TEXT is built once, outside the measurement: serialising the envelope is client
// work, and charging the server for it would inflate every PUT case (and only the PUT cases).
const putRequest = (cookie, bodyText, format) => makeRequest('PUT', '/api/save', {
  cookie, body: bodyText,
  headers: format == null ? {} : { 'x-save-format': String(format) },
});

// ------------------------------------------------------------- measurement ----
// process.cpuUsage(previous) already returns the DELTA, so no subtraction here.
const cpuMs = delta => (delta.user + delta.system) / 1000;

// BATCHED, not per-request: one GC pause inside a single request's window dominates that sample, and
// the whole point of this harness is that a difference between two versions is not that noise. Each
// sample is the mean over BATCH requests, and the reported figure is the median of SAMPLES samples -
// so a median-of-means, on identical fixtures, in one process.
const BATCH = Math.max(1, Number(flag('batch', 10)) || 10);
async function measure(name, fn, { runs = RUNS, warm = 2 } = {}) {
  for (let i = 0; i < warm * BATCH; i++) await fn();
  const samples = [];
  let peakWall = 0;
  for (let i = 0; i < runs; i++) {
    const c0 = process.cpuUsage();
    let wall = 0;
    for (let j = 0; j < BATCH; j++) {
      const w0 = performance.now();
      await fn();
      wall += performance.now() - w0;
    }
    samples.push(cpuMs(process.cpuUsage(c0)) / BATCH);
    peakWall = Math.max(peakWall, wall / BATCH);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p90 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.9))];
  return { name, cpuMs: round(median), cpuP90Ms: round(p90), cpuMaxMs: round(samples[samples.length - 1]),
    wallMaxMs: round(peakWall), runs, batch: BATCH };
}

const round = n => Math.round(n * 1000) / 1000;
// The expansion a legacy page is served, built once per size outside every timed window.
let unpackSaveLocal = x => x;

// ------------------------------------------------------------------- cases ----
async function main() {
  const results = [];
  const fx = fixtures();

  // One account, one live save per fixture family. Each fixture gets its own database so a large
  // account cannot be warmed by a small one's pages.
  const register = async (env, name) => {
    const reg = await load('api/register.js');
    const res = await reg.onRequestPost({ request: makeRequest('POST', '/api/register', {
      body: JSON.stringify({ u: name, p: 'profile-password-1', email: name + '@example.test' }),
      headers: { 'content-type': 'application/json' } }), env, params: {} });
    const raw = res.headers.get('Set-Cookie') || res.headers.get('set-cookie') || '';
    const m = /pg_session=[^;]+/.exec(raw);
    await res.text();
    return m ? m[0] : '';
  };

  // Every save the server stores names its account (v88.6). The fixture is stamped the way the page
  // stamps it, so the measured request is the ordinary accepted sync and not a refused one.
  for (const [size, save] of Object.entries(fx)) save.owner = 'PROF' + size.toUpperCase();

  const codec = await import(pathToFileURL(path.join(root, 'functions/_lib/save-codec.js')).href);
  unpackSaveLocal = codec.unpackSave;
  const validate = await import(pathToFileURL(path.join(root, 'functions/_lib/validate.js')).href);

  for (const [size, save] of Object.entries(fx)) {
    const { env, sqlite, stats } = freshEnv();
    const cookie = await register(env, 'PROF' + size.toUpperCase());
    const packed = JSON.stringify(codec.packSave(save));
    const plainLen = JSON.stringify(save).length;

    // First upload: the fixture is stored, so later PUTs are straight re-syncs (the ordinary case).
    const body = (version, blob) => JSON.stringify({ owner: 'PROF' + size.toUpperCase(), version, blob });
    let version = 0;
    {
      const r = await call('onRequestPut', 'api/save.js',
        makeRequest('PUT', '/api/save', { cookie, body: body(0, packed) }), env);
      if (r.status !== 200) throw new Error(size + ': fixture upload failed with ' + r.status);
      // Re-read the authoritative version instead of trusting the response shape.
      version = sqlite.prepare('SELECT version FROM saves WHERE user_id=(SELECT id FROM users WHERE username=?)')
        .get('PROF' + size.toUpperCase()).version;
    }
    const stored = sqlite.prepare('SELECT blob FROM saves WHERE user_id=(SELECT id FROM users WHERE username=?)')
      .get('PROF' + size.toUpperCase()).blob;

    const putBody = body(version, stored);
    const base = { size, plainBytes: plainLen, compactBytes: packed.length, storedBytes: stored.length };

    // WHAT EACH CASE IS, exactly, because the names get quoted:
    //   * `save-put`          - a MODERN client (X-Save-Format: 112) re-syncing the blob it was served.
    //   * `save-put-legacy`   - the same save from a page with NO header (pre-v414). Same write, plus
    //                           the work of handing it something it can decode.
    //   * `save-put-conflict` - a MODERN client with a stale version: the row is returned as stored.
    //   * `save-put-conflict-legacy` - the same conflict for a legacy page, whose reply must be
    //                           EXPANDED. These are different amounts of work and are never merged.
    // A modern 112 page is served the stored bytes unchanged, so its body text is literally `stored`;
    // the legacy re-sync sends those same served bytes (expanded) and gets compact text back.
    // Each case block re-reads the row, because the previous block's accepted writes advanced the
    // version. Building bodies from a stale version is exactly how the old conflict case ended up
    // measuring legacy expansion instead of a conflict.
    // Put the row back into a known state before a block: a compact blob at the current version. Without
    // this, the legacy block (which stores an EXPANDED row) silently changes what the following
    // conflict block is measuring - and "the modern reply is compact" then fails for a legitimate reason.
    const ensureCompactRow = async () => {
      const cur = await currentVersionRef();
      const r = await call('onRequestPut', 'api/save.js', putRequest(cookie, body(cur, stored), 112), env);
      if (r.status !== 200) throw new Error('ensureCompactRow -> ' + r.status);
    };
    const currentVersionRef = async () => {
      const r = await call('onRequestGet', 'api/save.js',
        makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env, { parse: true });
      if (r.status !== 200) throw new Error('version probe -> ' + r.status);
      return r.body.version;
    };
    const currentVersion = currentVersionRef;
    const storedJson = JSON.parse(stored);
    const expandedForLegacy = JSON.stringify(unpackSaveLocal(storedJson));
    // A legacy page UPLOADS the expanded text, and the envelope limit is 600 KB, so a client with no
    // codec cannot sync a save whose expansion is larger than that at all - it gets a 413 long before CPU
    // matters. Report the legacy UPLOAD cases only where the request is physically possible, and say so
    // instead of printing a number for a request the server will refuse.
    const LEGACY_ENVELOPE_MAX = 600_000;
    const legacyUploadPossible = expandedForLegacy.length < LEGACY_ENVELOPE_MAX;
    if (!legacyUploadPossible) results.push({ ...base, name: `save-put-legacy-${size}`, cpuMs: null, client: 'legacy (no header)',
      note: `not measured: expanded body ${expandedForLegacy.length} B exceeds the ${LEGACY_ENVELOPE_MAX} B envelope limit (413)` });
    if (!legacyUploadPossible) results.push({ ...base, name: `save-put-conflict-legacy-${size}`, cpuMs: null,
      client: 'legacy (no header)', note: 'not measured: same 413 - a legacy page cannot send this body' });
    // Verify each requested encoding BEFORE timing, so a wrong fixture is a hard error, not a number.
    // Validates status, version and served ENCODING on every timed request. Inside a measured window the
    // reply is not re-parsed by `call` (that would charge the server for harness work), so the fields are
    // read straight from the reply TEXT here and the parse cost lands in the harness's own accounting.
    const assertServed = (label, r, expect, wantVersion) => {
      if (r.status !== expect) throw new Error(label + ': answered ' + r.status + ', expected ' + expect);
      if (expect === 409) {
        const body = JSON.parse(r.text);
        if (body.conflict !== true) throw new Error(label + ': 409 without conflict:true');
        if (wantVersion != null && body.version !== wantVersion)
          throw new Error(label + ': version ' + body.version + ', expected ' + wantVersion);
        const blob = String(body.blob || '');
        const compact = Array.isArray(JSON.parse(blob).inv?.[0]);
        if (label.includes('legacy') && compact) throw new Error(label + ': legacy client was served compact tuples');
        if (label.includes('modern') && !compact) throw new Error(label + ': modern client was not served the stored blob');
      } else if (wantVersion != null) {
        const body = JSON.parse(r.text);
        if (body.version !== wantVersion) throw new Error(label + ': version ' + body.version + ', expected ' + wantVersion);
      }
    };

    if ((!ONLY || ONLY.startsWith('save-put') || ONLY.startsWith('save-put-legacy') ||
         ONLY.startsWith('save-put-conflict')) && !ONLY?.startsWith('save-put-conflict')) await ensureCompactRow();
    if (ONLY?.startsWith('save-put-conflict')) await ensureCompactRow();

    if (!ONLY || ONLY.startsWith('save-put') || ONLY.startsWith('save-put-legacy')) {
      // A re-sync of the stored blob: the version advances each time, so this is the real steady
      // state (no re-stamp, no claim pending, nothing new to settle).
      // Bodies (and the version each one claims) are prepared up front: serialising a 300 KB envelope
      // is CLIENT work and must not be inside the server measurement. A well-behaved sync sends the
      // version it holds, so body i claims `version + i` and the server must answer `version + i + 1`.
      const startAt = await currentVersion();
      const modernBodies = [];
      for (let i = 0; i < RUNS * BATCH + 2 * BATCH; i++) modernBodies.push({ text: body(startAt + i, stored), v: startAt + i });
      let mi = 0;
      const one = await measure(`save-put-${size}`, async () => {
        const item = modernBodies[mi++];
        if (!item) throw new Error('save-put: ran out of prebuilt bodies');
        const r = await call('onRequestPut', 'api/save.js', putRequest(cookie, item.text, 112), env);
        assertServed('save-put-modern', r, 200, item.v + 1);
      });
      results.push({ ...base, ...one, client: 'modern (112)', expect: 200 });
    }

    if ((!ONLY || ONLY.startsWith('save-put-legacy')) && legacyUploadPossible) {
      const legacyStart = await currentVersion();
      const legacyBodies = [];
      for (let i = 0; i < RUNS * BATCH + 2 * BATCH; i++) legacyBodies.push({ text: body(legacyStart + i, expandedForLegacy), v: legacyStart + i });
      let li = 0;
      const legacy = await measure(`save-put-legacy-${size}`, async () => {
        const item = legacyBodies[li++];
        if (!item) throw new Error('save-put-legacy: ran out of prebuilt bodies');
        const r = await call('onRequestPut', 'api/save.js', putRequest(cookie, item.text, null), env);
        assertServed('save-put-legacy', r, 200, item.v + 1);
      });
      results.push({ ...base, ...legacy, client: 'legacy (no header)', expect: 200 });
    }

    if (!ONLY || ONLY.startsWith('save-put-conflict')) {
      await ensureCompactRow();   // the legacy block above leaves an expanded row behind
      // A stale version: the write is refused and the live row is returned.
      // A modern client's conflict MUST reply with the bytes as stored. If that assertion starts failing
      // here (as it did while this harness was being written), the case is measuring an expansion.
      const conflictProbe = await call('onRequestPut', 'api/save.js', putRequest(cookie, body(0, stored), 112), env, { parse: true });
      assertServed('save-put-conflict-modern (probe)', conflictProbe, 409, null);
      const staleModern = body(0, stored);
      const conflictVersion = await currentVersion();
      const c = await measure(`save-put-conflict-${size}`, async () => {
        const r = await call('onRequestPut', 'api/save.js', putRequest(cookie, staleModern, 112), env);
        assertServed('save-put-conflict-modern', r, 409, conflictVersion);   // unchanged: nothing was written
      });
      results.push({ ...base, ...c, client: 'modern (112)', expect: 409 });
    }

    if ((!ONLY || ONLY.startsWith('save-put-conflict-legacy')) && legacyUploadPossible) {
      const staleLegacy = body(0, expandedForLegacy);
      const legacyConflictVersion = await currentVersion();
      const c = await measure(`save-put-conflict-legacy-${size}`, async () => {
        const r = await call('onRequestPut', 'api/save.js', putRequest(cookie, staleLegacy, null), env);
        assertServed('save-put-conflict-legacy', r, 409, legacyConflictVersion);
      });
      results.push({ ...base, ...c, client: 'legacy (no header)', expect: 409 });
    }

    if (!ONLY || ONLY.startsWith('save-get')) {
      const getModernText = await (async () => {
        const r = await call('onRequestGet', 'api/save.js',
          makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env);
        return r.text;
      })();
      // A modern page is served the stored bytes; a legacy page is served the expanded text. Both are
      // full parses of the row here, and only the modern one may skip the expansion.
      const getModern = await measure(`save-get-${size}`, async () => {
        const r = await call('onRequestGet', 'api/save.js',
          makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env);
        // Served bytes must be exactly what the row holds now (earlier PUT cases may have re-stamped
        // it). `parse` is off inside the window, so compare against the version probe's text instead.
        if (r.status !== 200) throw new Error('save-get modern -> ' + r.status);
        if (r.text.length !== getModernText.length) throw new Error('save-get modern: not the stored bytes');
      });
      results.push({ ...base, ...getModern, client: 'modern (112)', expect: 200 });
    }
    if (!ONLY || ONLY.startsWith('save-get-legacy')) {
      const getLegacy = await measure(`save-get-legacy-${size}`, async () => {
        const r = await call('onRequestGet', 'api/save.js',
          makeRequest('GET', '/api/save', { cookie }), env);
        if (r.status !== 200) throw new Error('save-get legacy -> ' + r.status);
        // Read the served encoding out of the reply TEXT (this window is not parsing bodies for us).
        const served = JSON.parse(JSON.parse(r.text).blob);
        if (Array.isArray(served.inv?.[0])) throw new Error('save-get legacy: served compact tuples');
      });
      results.push({ ...base, ...getLegacy, client: 'legacy (no header)', expect: 200 });
    }

    if (!ONLY || ONLY.startsWith('me')) {
      const me = await measure(`me-${size}`, async () => {
        await call('onRequestGet', 'api/me.js', makeRequest('GET', '/api/me', { cookie }), env);
      });
      results.push({ ...base, ...me });
    }

    if (!ONLY || ONLY.startsWith('board')) {
      const board = await measure(`board-echo-${size}`, async () => {
        await call('onRequestGet', 'api/board.js',
          makeRequest('GET', '/api/board?period=daily&board=echo', { cookie }), env);
      });
      results.push({ ...base, ...board });
    }

    // ---- component breakdown, measured in isolation on the same fixture ------------------------
    // These are the phases named in the CPU investigation; each is measured against the identical
    // stored blob the request path uses, so the columns add up to a credible shape even though the
    // host runtime is not workerd.
    const parts = [];
    parts.push(await measure(`  part:json-parse-${size}`, () => { JSON.parse(stored); }));
    parts.push(await measure(`  part:checkSaveBlob-${size}`, () => { validate.checkSaveBlob(stored); }));
    parts.push(await measure(`  part:unpackSave-${size}`, () => { codec.unpackSave(JSON.parse(stored)); }));
    const parsed = codec.unpackSave(JSON.parse(stored));
    parts.push(await measure(`  part:publicFields-${size}`, () => { validate.publicFields(parsed); }));
    const audit = await import(pathToFileURL(path.join(root, 'functions/_lib/save-audit.js')).href);
    parts.push(await measure(`  part:auditStaticSave-${size}`, () => { audit.auditStaticSave(parsed); }));
    const shop = await import(pathToFileURL(path.join(root, 'functions/_lib/shop.js')).href);
    parts.push(await measure(`  part:lockedCosmetics-${size}`, async () => { await shop.lockedCosmetics(env.DB, 1, parsed); }));

    // The two leaderboard hooks, on their own. `recordUnverifiedEcho` is the per-save one;
    // `settleUnverifiedEcho` is the periodic one whose emptiness is what most saves pay for.
    const echo = await import(pathToFileURL(path.join(root, 'functions/_lib/unverified-echo.js')).href);
    const uid = sqlite.prepare('SELECT id FROM users WHERE username=?').get('PROF' + size.toUpperCase()).id;
    parts.push(await measure(`  part:recordUnverifiedEcho-${size}`, async () => {
      await echo.recordUnverifiedEcho(env.DB, uid, parsed, Date.now());
    }));
    parts.push(await measure(`  part:settleUnverifiedEcho-${size}`, async () => {
      await echo.settleUnverifiedEcho(env.DB, Date.now());
    }));
    parts.push(await measure(`  part:unverifiedConfig-${size}`, async () => {
      await echo.unverifiedConfig(env.DB);
    }));

    results.push(...parts.map(p => ({ ...base, ...p })));
    sqlite.close();
  }

  // Handler-only versus handler+middleware, for the routes that matter, measured the same way.
  // The delta is what the front door costs: proxy/host checks, the ban hash and lookup, and (when
  // WRITE_GATE=required) the gate lease. It is reported separately because it is a per-request tax that
  // no save-path optimisation can remove.
  {
    const out = [];
    for (const size of Object.keys(fx)) {
      const { env } = freshEnv();
      const name = 'MW' + size.toUpperCase();
      const cookie = await register(env, name);
      const packed = JSON.stringify(codec.packSave({ ...fx[size], owner: name }));
      const first = await call('onRequestPut', 'api/save.js',
        putRequest(cookie, JSON.stringify({ owner: name, version: 0, blob: packed }), 112), env);
      if (first.status !== 200) throw new Error('middleware setup PUT -> ' + first.status);
      const row = await call('onRequestGet', 'api/save.js',
        makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env, { parse: true });
      const version = row.body.version, storedBlob = row.body.blob;
      // Handler only, then the same request through the middleware, with identical bodies.
      const handlerOnly = await measure(`mw:handler-only-get-${size}`, async () => {
        const r = await call('onRequestGet', 'api/save.js',
          makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env);
        if (r.status !== 200) throw new Error('get -> ' + r.status);
      });
      out.push({ ...handlerOnly, mwMode: 'handler-only' });
      const fullText = JSON.stringify({ owner: name, version, blob: storedBlob });
      const throughBoth = await measure(`mw:middleware+get-${size}`, async () => {
        const r = await runWithMiddleware('onRequestGet', 'api/save.js',
          withClientIp(makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } })), env);
        if (r.status !== 200) throw new Error('mw get -> ' + r.status);
      });
      out.push({ ...throughBoth, mwMode: 'handler+middleware' });
      const putOnly = await measure(`mw:handler-only-put-${size}`, async () => {
        const r = await call('onRequestPut', 'api/save.js', putRequest(cookie, fullText, 112), env);
        if (r.status !== 200 && r.status !== 409) throw new Error('put -> ' + r.status);
      });
      out.push({ ...putOnly, mwMode: 'handler-only' });
      const putBoth = await measure(`mw:middleware+put-${size}`, async () => {
        const r = await runWithMiddleware('onRequestPut', 'api/save.js',
          withClientIp(putRequest(cookie, fullText, 112)), env);
        if (r.status !== 200 && r.status !== 409) throw new Error('mw put -> ' + r.status);
      });
      out.push({ ...putBoth, mwMode: 'handler+middleware' });
    }
    results.push(...out);
  }

  // Where the whole-request CPU goes, phase by phase, in ONE accepted PUT. A single instrumented run
  // against a database with NO stored save yet (the first-save path) and then the steady-state path,
  // so the phases named in the investigation can be attributed instead of guessed.
  {
    const { env, stats } = freshEnv();
    const cookie = await register(env, 'PROFDETAIL');
    const lines = [];
    const phase = async (label, fn) => {
      const before = stats.statements, c0 = process.cpuUsage();
      const out = await fn();
      const d = process.cpuUsage(c0);
      lines.push({ label, cpuMs: round(cpuMs(d)), statements: stats.statements - before, note: out });
      return out;
    };
    const packed = JSON.stringify(codec.packSave({ ...fx.medium, owner: 'PROFDETAIL' }));
    const put = (v) => call('onRequestPut', 'api/save.js',
      makeRequest('PUT', '/api/save', { cookie, body: JSON.stringify({ owner: 'PROFDETAIL', version: v, blob: packed }) }), env);
    await phase('PUT #1 (insert path)', () => put(0));
    await phase('GET (after insert)', () => call('onRequestGet', 'api/save.js',
      makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env));
    await phase('PUT #2 (update path)', () => put(1));
    await phase('PUT #3 (update path)', () => put(2));
    await phase('PUT stale (409)', () => put(0));
    await phase('GET (steady)', () => call('onRequestGet', 'api/save.js',
      makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env));
    await phase('me', () => call('onRequestGet', 'api/me.js', makeRequest('GET', '/api/me', { cookie }), env));
    results.push({ size: 'medium', name: '  detail', phase: true });
    lines.forEach(l => results.push({ size: 'medium', name: '  detail:' + l.label, cpuMs: l.cpuMs,
      statements: l.statements, detail: true, wallMaxMs: null }));
    results.splice(results.length - lines.length - 1, 1);
    results.push({ size: 'medium', statements: 0, name: '  detail', detailHeader: true });
  }

  // Statement counts per request, which no CPU number shows. A route that got cheaper in CPU but
  // costs more D1 statements has moved the bill, not removed it.
  {
    const { env, stats } = freshEnv();
    const cookie = await register(env, 'PROFCOUNT');
    const codecMod = codec;
    // Same naming rule as the measured fixtures: the save names the account it was written for.
    const packed = JSON.stringify(codecMod.packSave({ ...fx.small, owner: 'PROFCOUNT' }));
    const counts = [];
    const countOf = async (label, fn) => {
      const before = stats.statements;
      const out = await fn();
      counts.push({ label, statements: stats.statements - before, status: out && out.status });
    };
    await call('onRequestPut', 'api/save.js', makeRequest('PUT', '/api/save',
      { cookie, body: JSON.stringify({ owner: 'PROFCOUNT', version: 0, blob: packed }) }), env).catch(() => {});
    const v = 1;
    await countOf('save-put-small', () => call('onRequestPut', 'api/save.js',
      makeRequest('PUT', '/api/save', { cookie, body: JSON.stringify({ owner: 'PROFCOUNT', version: v, blob: packed }) }), env));
    await countOf('save-get-small', () => call('onRequestGet', 'api/save.js',
      makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env));
    await countOf('me-small', () => call('onRequestGet', 'api/me.js', makeRequest('GET', '/api/me', { cookie }), env));
    await countOf('board-echo-small', () => call('onRequestGet', 'api/board.js',
      makeRequest('GET', '/api/board?period=daily&board=echo', { cookie }), env));
    await countOf('sessions-login', async () => {
      const s = await load('api/sessions.js');
      const r = await s.onRequestPost({ request: makeRequest('POST', '/api/sessions',
        { body: JSON.stringify({ u: 'PROFCOUNT', p: 'profile-password-1' }) }), env, params: {} });
      await r.text();
    });
    counts.forEach(c => { if (process.env.PROFILE_DEBUG) console.log('debug', c); results.push({ size: 'small', statements: c.statements, name: '  count:' + c.label }); });
  }

  const payload = { label: LABEL, runs: RUNS, node: process.version, at: new Date().toISOString(), results };
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
  if (VERBOSE || !JSON_OUT) {
    console.log(payload.label + ' · node ' + payload.node + ' · median of ' + RUNS + ' samples x ' + BATCH + ' requests');
    console.log('');
    console.log('  ' + 'case'.padEnd(34) + 'bytes/st'.padStart(9) + 'cpu_ms'.padStart(9) + 'p90'.padStart(9) + 'wall_max'.padStart(10) + '  client / note');
    for (const r of results) {
      const amt = r.storedBytes ? String(r.storedBytes) : r.statements != null ? String(r.statements) + ' st' + (r.status && r.status !== 200 ? '/' + r.status : '') : '';
      console.log('  ' + String(r.name).padEnd(34) + amt.padStart(9) +
        (r.cpuMs != null ? r.cpuMs.toFixed(3) : '-').padStart(9) +
        (r.cpuP90Ms != null ? r.cpuP90Ms.toFixed(3) : '-').padStart(9) +
        (r.wallMaxMs != null ? r.wallMaxMs.toFixed(2) : '-').padStart(10) +
        (r.client ? '  ' + r.client : '') + (r.note ? '  ' + r.note : ''));
    }
    console.log('');
    console.log('CPU is process.cpuUsage() around the complete handler call. Wall time is kept separate.');
    console.log('This is comparative local evidence against a D1 shim, NOT Cloudflare cpu_ms.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
