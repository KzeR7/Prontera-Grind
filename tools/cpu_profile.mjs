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

// ------------------------------------------------------------------ invokers ----
// Two EXPLICIT invokers. There is no global flag that silently redirects the baseline: a case names the
// invoker it uses, and a handler-only case cannot accidentally run middleware because the middleware
// module is never imported on that path.
//
//   handlerOnly()  - the Function export directly, exactly what Pages' `next()` would call. Middleware
//                    is NOT run (asserted by tools/tests/cpu_profile_invoker_sim.mjs, which counts
//                    middleware entries: 0 for these requests, 1 for middleware requests).
//   withMiddleware() - the real `_middleware.onRequest` with a real `next()`, the way Pages runs it:
//                    production-preview refusal, network-ban hash + lookup, and (with
//                    WRITE_GATE=required) the Durable Object lease.
const MIDDLEWARE_IP = flag('client-ip', '203.0.113.7');
// In middleware mode the network-ban check has no fingerprint on a plain node request, so it would be
// skipped and the measurement would again flatter the code. Supply a real client address.
const withClientIp = request => {
  const added = new Map([['cf-connecting-ip', MIDDLEWARE_IP], ['host', 'pg.test']]);
  return {
    method: request.method, url: request.url,
    headers: {
      get: k => { const key = String(k).toLowerCase(); return added.has(key) ? added.get(key) : request.headers.get(key); },
    },
    text: request.text, body: null,
  };
};

// Outcome counters, per invoker, so the report can say what actually ran rather than what was intended.
const invokerStats = {
  'handler-only': { requests: 0, middlewareEntries: 0 },
  'middleware': { requests: 0, middlewareEntries: 0 },
};

// PREPARE. Resolving the module and building the request object happen OUTSIDE every timed window: a
// dynamic `import()` on the first call is module evaluation, and `JSON.stringify` of a 300 KB envelope
// is client work. Both would otherwise be charged to the server.
// The middleware entry is COUNTED, not assumed: the module is loaded once and its `onRequest` is wrapped,
// so `invokerStats[...].middlewareEntries` is a measurement the report can stand behind. A handler-only
// case never takes this branch, which is what makes the zero a fact rather than a convention.
const middlewareEntryCount = { n: 0 };
const loadMiddlewareCounting = async () => {
  const m = await load('api/_middleware.js');
  if (m.__counted) return m;
  const original = m.onRequest;
  const counted = { ...m, onRequest: (...args) => { middlewareEntryCount.n++; return original(...args); } };
  Object.defineProperty(counted, '__counted', { value: true });
  mods.set('api/_middleware.js', counted);
  return counted;
};
const prepare = async ({ invoker, fn, file, request, env }) => {
  const handler = await load(file);
  if (invoker === 'handler-only') return { invoker, handler, fn, request, env };
  const middleware = await loadMiddlewareCounting();
  return { invoker, handler, middleware, fn, request: withClientIp(request), env };
};

// EXECUTE. Only the request itself. The CPU sample starts here and STOPS before the response body is
// touched: draining and parsing a reply is the harness reading bytes the server already produced, and
// it used to be inside the sample (which is why a conflict case looked so expensive - its reply carries
// the whole live save).
const execute = async call => {
  invokerStats[call.invoker].requests++;
  const started = process.cpuUsage();
  // A component probe: no HTTP response, just the work itself (parse, unpack, a leaderboard hook).
  if (call.sync) {
    await call.sync();
    const cpu = process.cpuUsage(started);
    return { cpuMs: (cpu.user + cpu.system) / 1000, res: null };
  }
  let res;
  if (call.invoker === 'handler-only') {
    res = await call.handler[call.fn]({ request: call.request, env: call.env, params: {} });
  } else {
    const beforeEntries = middlewareEntryCount.n;
    res = await call.middleware.onRequest({
      request: call.request, env: call.env, params: {},
      next: async () => call.handler[call.fn]({ request: call.request, env: call.env, params: {} }),
      // Pages supplies this; the gate release is charged to the request when it is absent, so mirror it.
      waitUntil: () => {},
    });
    invokerStats[call.invoker].middlewareEntries += middlewareEntryCount.n - beforeEntries;
  }
  const cpu = process.cpuUsage(started);
  return { res, cpuMs: (cpu.user + cpu.system) / 1000 };
};

// VALIDATE. Outside the sample. Every assertion the earlier harness made is preserved - status, the
// authoritative version, and the served encoding - and now none of them can inflate the number.
const validate = async (outcome, check) => {
  if (!outcome.res) return { cpuMs: outcome.cpuMs };   // component probe: nothing to assert
  const res = outcome.res;
  const text = await res.text();
  const result = { status: res.status, text, cpuMs: outcome.cpuMs };
  if (!check) return result;
  if (check.status != null && res.status !== check.status)
    throw new Error(`${check.label}: answered ${res.status}, expected ${check.status}`);
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  result.body = body;
  if (check.version != null && body && body.version !== check.version)
    throw new Error(`${check.label}: version ${body.version}, expected ${check.version}`);
  if (check.conflict && (!body || body.conflict !== true))
    throw new Error(`${check.label}: expected conflict:true in a 409`);
  if (check.encoding) {
    if (!body) throw new Error(`${check.label}: no JSON body to check the encoding of`);
    const blob = String(body.blob ?? '');
    const compact = Array.isArray(JSON.parse(blob).inv?.[0]);
    if (check.encoding === 'compact' && !compact)
      throw new Error(`${check.label}: expected the stored compact blob, got an expanded one`);
    if (check.encoding === 'expanded' && compact)
      throw new Error(`${check.label}: served raw codec tuples to a client that cannot decode them`);
    if (check.sameText != null && blob !== check.sameText)
      throw new Error(`${check.label}: served bytes differ from the stored row`);
  }
  return result;
};

// One measured pass: PREPARE (untimed) -> EXECUTE (samples CPU) -> VALIDATE (untimed).
const runOnce = async (call, check) => validate(await execute(call), check);

// A convenience for the many cases that just need "do it, prove it, throw if wrong".
const call = async (fn, file, request, env, { invoker = 'handler-only', check = null } = {}) => {
  const prepared = await prepare({ invoker, fn, file, request, env });
  return runOnce(prepared, check);
};

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
// sample is the mean over BATCH requests, and the reported figure is the median of samples.
//
// `plan(i)` returns the PREPARED call for request i (must be built before the sample opens), `check(i)`
// its expected outcome. Both are evaluated outside the CPU window.
const BATCH = Math.max(1, Number(flag('batch', 10)) || 10);
async function measure(name, { plan, check = null, runs = RUNS, warm = 2, invoker: invokerOverride = null, meta = {} } = {}) {
  // The invoker is whatever the PREPARED call actually carries - not a parameter the caller can get
  // wrong. (A meta.invoker once overwrote this and every middleware row claimed to be handler-only.)
  let observedInvoker = invokerOverride;
  // Warmup: real requests through the same path, so JIT and caches settle - and so a PUT loop can
  // advance its version counter through them.
  for (let i = 0; i < warm * BATCH; i++) {
    const prepared = await plan(i);
    observedInvoker = observedInvoker || prepared.invoker;
    await runOnce(prepared, check ? check(i) : null);
  }
  const samples = [];
  let peakWall = 0;
  let index = warm * BATCH;
  for (let i = 0; i < runs; i++) {
    // PREPARE everything this sample will run, BEFORE the clock starts.
    const preparedBatch = [];
    const checks = [];
    for (let j = 0; j < BATCH; j++) {
      const prepared = await plan(index);
      observedInvoker = observedInvoker || prepared.invoker;
      preparedBatch.push(prepared);
      checks.push(check ? check(index) : null);
      index++;
    }
    const c0 = process.cpuUsage();
    const w0 = performance.now();
    const outcomes = [];
    for (let j = 0; j < BATCH; j++) outcomes.push(await execute(preparedBatch[j]));
    const wall = performance.now() - w0;
    const delta = process.cpuUsage(c0);
    // VALIDATE only after the sample is closed.
    for (let j = 0; j < BATCH; j++) await validate(outcomes[j], checks[j]);
    samples.push(cpuMs(delta) / BATCH);
    peakWall = Math.max(peakWall, wall / BATCH);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p90 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.9))];
  // `invoker` goes LAST: the earlier spread let meta.invoker overwrite it, so every middleware PUT row
  // claimed to be handler-only.
  return { ...meta, name, cpuMs: round(median), cpuP90Ms: round(p90), cpuMaxMs: round(samples[samples.length - 1]),
    wallMaxMs: round(peakWall), runs, batch: BATCH, expect: meta.expect ?? null,
    invoker: observedInvoker || 'handler-only' };
}

const round = n => Math.round(n * 1000) / 1000;
// The stored blob after a write, read straight from the row: the server re-stamps its identity, so the
// text the test SENT is not the text that is stored.
const storedBlobFor = async (env, cookie) => {
  const r = await call('onRequestGet', 'api/save.js',
    makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env,
    { check: { label: 'stored-row probe', status: 200 } });
  return r.body.blob;
};
const currentVersionFor = async (env, cookie) => {
  const r = await call('onRequestGet', 'api/save.js',
    makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env,
    { check: { label: 'version probe', status: 200 } });
  return r.body.version;
};
const ensureCompactRowFor = async (env, cookie, storedBlob, name) => {
  const cur = await currentVersionFor(env, cookie);
  await call('onRequestPut', 'api/save.js', putRequest(cookie, JSON.stringify({ owner: name, version: cur, blob: storedBlob }), 112), env,
    { check: { label: 'ensureCompactRow', status: 200 } });
};
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
    const currentVersion = async () => {
      const r = await call('onRequestGet', 'api/save.js',
        makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env,
        { check: { label: 'version probe', status: 200 } });
      return r.body.version;
    };
    const ensureCompactRow = async () => {
      const cur = await currentVersion();
      await call('onRequestPut', 'api/save.js', putRequest(cookie, body(cur, stored), 112), env,
        { check: { label: 'ensureCompactRow', status: 200 } });
    };
    const storedJson = JSON.parse(stored);
    const expandedForLegacy = JSON.stringify(unpackSaveLocal(storedJson));
    // A legacy page UPLOADS the expanded text, and the envelope limit is 600 KB, so a client with no
    // codec cannot sync a save whose expansion is larger than that at all - it gets a 413 long before CPU
    // matters. Report the legacy UPLOAD cases only where the request is physically possible, and say so
    // instead of printing a number for a request the server will refuse.
    const LEGACY_ENVELOPE_MAX = 600_000;
    const legacyUploadPossible = expandedForLegacy.length < LEGACY_ENVELOPE_MAX;
    if (!legacyUploadPossible) results.push({ ...base, name: `save-put-legacy-${size}`, cpuMs: null,
      client: 'legacy (no header)', notMeasured: true, expect: 200,
      note: `not measured: expanded body ${expandedForLegacy.length} B exceeds the ${LEGACY_ENVELOPE_MAX} B envelope limit (413)` });
    if (!legacyUploadPossible) results.push({ ...base, name: `save-put-conflict-legacy-${size}`, cpuMs: null,
      client: 'legacy (no header)', notMeasured: true, expect: 409,
      note: 'not measured: same 413 - a legacy page cannot send this body' });
    // Verify each requested encoding BEFORE timing, so a wrong fixture is a hard error, not a number.
    // Validates status, version and served ENCODING on every timed request. Inside a measured window the
    // reply is not re-parsed by `call` (that would charge the server for harness work), so the fields are
    // read straight from the reply TEXT here and the parse cost lands in the harness's own accounting.

    // ---- PUT: an accepted sync, modern client (X-Save-Format: 112) ----------------------------
    // The version advances through EVERY request, warmup included: body i claims the version the
    // server answered for i-1, so each sample is a real accepted sync and never a conflict. A sample
    // that does not answer 200 throws, which stops the run instead of reporting a refused request as
    // accepted-save CPU.
    if (!ONLY || ONLY.startsWith('save-put')) {
      await ensureCompactRow();
      let claimed = await currentVersion();
      const modernBodies = [];
      for (let i = 0; i < (RUNS + 2) * BATCH + 4; i++) modernBodies.push({ text: body(claimed + i, stored), v: claimed + i });
      const one = await measure(`save-put-${size}`, {
        meta: { client: 'modern (112)', expect: 200 },
        plan: async i => {
          const item = modernBodies[i];
          if (!item) throw new Error('save-put: ran out of prebuilt bodies');
          return prepare({ invoker: 'handler-only', fn: 'onRequestPut', file: 'api/save.js',
            request: putRequest(cookie, item.text, 112), env });
        },
        check: i => ({ label: 'save-put-modern', status: 200, version: modernBodies[i].v + 1 }),
      });
      results.push({ ...base, ...one });
    }

    // ---- PUT: the same save from a page with no codec (no header) ------------------------------
    // Only where the request is physically possible: the envelope limit is 600 KB and a near-cap save
    // expands to ~1.66 MB, so a legacy page cannot upload it at all (413). Reported, not faked.
    if ((!ONLY || ONLY.startsWith('save-put-legacy')) && legacyUploadPossible) {
      await ensureCompactRow();
      const startAt = await currentVersion();
      const bodies = [];
      for (let i = 0; i < (RUNS + 2) * BATCH + 4; i++) bodies.push({ text: body(startAt + i, expandedForLegacy), v: startAt + i });
      const legacy = await measure(`save-put-legacy-${size}`, {
        meta: { client: 'legacy (no header)', expect: 200 },
        plan: async i => {
          const item = bodies[i];
          if (!item) throw new Error('save-put-legacy: ran out of prebuilt bodies');
          return prepare({ invoker: 'handler-only', fn: 'onRequestPut', file: 'api/save.js',
            request: putRequest(cookie, item.text, null), env });
        },
        check: i => ({ label: 'save-put-legacy', status: 200, version: bodies[i].v + 1 }),
      });
      results.push({ ...base, ...legacy });
    }

    // ---- PUT: a 409 conflict, measured SEPARATELY from accepted saves --------------------------
    // A stale version is refused and the live row is returned; it is NOT accepted-save CPU and is
    // never reported as such. The reply must carry the bytes as stored for a modern client.
    if (!ONLY || ONLY.startsWith('save-put-conflict')) {
      await ensureCompactRow();
      const staleText = body(0, stored);
      const conflictVersion = await currentVersion();
      const c = await measure(`save-put-conflict-${size}`, {
        meta: { client: 'modern (112)', expect: 409 },
        plan: async () => prepare({ invoker: 'handler-only', fn: 'onRequestPut', file: 'api/save.js',
          request: putRequest(cookie, staleText, 112), env }),
        check: () => ({ label: 'save-put-conflict-modern', status: 409, version: conflictVersion,
          conflict: true, encoding: 'compact' }),
      });
      results.push({ ...base, ...c });
    }

    if ((!ONLY || ONLY.startsWith('save-put-conflict-legacy')) && legacyUploadPossible) {
      await ensureCompactRow();
      const staleLegacy = body(0, expandedForLegacy);
      const legacyConflictVersion = await currentVersion();
      const c = await measure(`save-put-conflict-legacy-${size}`, {
        meta: { client: 'legacy (no header)', expect: 409 },
        plan: async () => prepare({ invoker: 'handler-only', fn: 'onRequestPut', file: 'api/save.js',
          request: putRequest(cookie, staleLegacy, null), env }),
        check: () => ({ label: 'save-put-conflict-legacy', status: 409, version: legacyConflictVersion,
          conflict: true, encoding: 'expanded' }),
      });
      results.push({ ...base, ...c });
    }

    // ---- GET: a modern page is served the stored bytes; a legacy page is served the expansion --
    if (!ONLY || ONLY.startsWith('save-get')) {
      const current = await call('onRequestGet', 'api/save.js',
        makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env, { check: { label: 'save-get probe', status: 200 } });
      const storedText = current.body.blob;
      const getModern = await measure(`save-get-${size}`, {
        meta: { client: 'modern (112)', expect: 200 },
        plan: async () => prepare({ invoker: 'handler-only', fn: 'onRequestGet', file: 'api/save.js',
          request: makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env }),
        check: () => ({ label: 'save-get modern', status: 200, encoding: 'compact', sameText: storedText }),
      });
      results.push({ ...base, ...getModern });
    }
    if (!ONLY || ONLY.startsWith('save-get-legacy')) {
      const getLegacy = await measure(`save-get-legacy-${size}`, {
        meta: { client: 'legacy (no header)', expect: 200 },
        plan: async () => prepare({ invoker: 'handler-only', fn: 'onRequestGet', file: 'api/save.js',
          request: makeRequest('GET', '/api/save', { cookie }), env }),
        check: () => ({ label: 'save-get legacy', status: 200, encoding: 'expanded' }),
      });
      results.push({ ...base, ...getLegacy });
    }

    if (!ONLY || ONLY.startsWith('me')) {
      const me = await measure(`me-${size}`, {
        meta: { client: 'modern (112)', expect: 200 },
        plan: async () => prepare({ invoker: 'handler-only', fn: 'onRequestGet', file: 'api/me.js',
          request: makeRequest('GET', '/api/me', { cookie }), env }),
        check: () => ({ label: 'me', status: 200 }),
      });
      results.push({ ...base, ...me });
    }

    if (!ONLY || ONLY.startsWith('board-echo')) {
      const board = await measure(`board-echo-${size}`, {
        meta: { client: 'modern (112)', expect: 200 },
        plan: async () => prepare({ invoker: 'handler-only', fn: 'onRequestGet', file: 'api/board.js',
          request: makeRequest('GET', '/api/board?period=daily&board=echo', { cookie }), env }),
        check: () => ({ label: 'board-echo', status: 200 }),
      });
      results.push({ ...base, ...board });
    }

    // ---- component breakdown, measured in isolation on the same fixture ------------------------
    // These are the phases named in the CPU investigation; each is measured against the identical
    // stored blob the request path uses, so the columns add up to a credible shape even though the
    // host runtime is not workerd.
    const parts = [];
    // Synchronous component work has no HTTP request, so there is nothing to resolve in `prepare`; the
    // fixtures it works on are built once, above, and out of every window as before.
    const probe = async (name, fn) => measure(name, { plan: async () => ({ invoker: 'handler-only', sync: fn }) });
    parts.push(await probe(`  part:json-parse-${size}`, () => { JSON.parse(stored); }));
    parts.push(await probe(`  part:checkSaveBlob-${size}`, () => { validate.checkSaveBlob(stored); }));
    parts.push(await probe(`  part:unpackSave-${size}`, () => { codec.unpackSave(JSON.parse(stored)); }));
    const parsed = codec.unpackSave(JSON.parse(stored));
    parts.push(await probe(`  part:publicFields-${size}`, () => { validate.publicFields(parsed); }));
    const audit = await import(pathToFileURL(path.join(root, 'functions/_lib/save-audit.js')).href);
    parts.push(await probe(`  part:auditStaticSave-${size}`, () => { audit.auditStaticSave(parsed); }));
    const shop = await import(pathToFileURL(path.join(root, 'functions/_lib/shop.js')).href);
    parts.push(await probe(`  part:lockedCosmetics-${size}`, async () => { await shop.lockedCosmetics(env.DB, 1, parsed); }));

    // The two leaderboard hooks, on their own. `recordUnverifiedEcho` is the per-save one;
    // `settleUnverifiedEcho` is the periodic one whose emptiness is what most saves pay for.
    const echo = await import(pathToFileURL(path.join(root, 'functions/_lib/unverified-echo.js')).href);
    const uid = sqlite.prepare('SELECT id FROM users WHERE username=?').get('PROF' + size.toUpperCase()).id;
    parts.push(await probe(`  part:recordUnverifiedEcho-${size}`, async () => {
      await echo.recordUnverifiedEcho(env.DB, uid, parsed, Date.now());
    }));
    parts.push(await probe(`  part:settleUnverifiedEcho-${size}`, async () => {
      await echo.settleUnverifiedEcho(env.DB, Date.now());
    }));
    parts.push(await probe(`  part:unverifiedConfig-${size}`, async () => {
      await echo.unverifiedConfig(env.DB);
    }));

    results.push(...parts.map(p => ({ ...base, ...p })));
    sqlite.close();
  }

  // Handler-only versus handler+middleware, for the routes that matter.
  //
  // The two are separate INVOKERS, not a global flag: `handler-only` never imports the middleware
  // module, `middleware` enters the real onRequest. Both PUT loops advance their version through warmup
  // and measured requests, exactly like the ordinary PUT case - an earlier version reused one body, so
  // every request after the first was a 409 and the "accepted save" row was measuring refusals.
  // A 409 conflict has its own case above and is never mixed in here.
  {
    const out = [];
    for (const size of Object.keys(fx)) {
      const { env } = freshEnv();
      const name = 'MW' + size.toUpperCase();
      const cookie = await register(env, name);
      const packed = JSON.stringify(codec.packSave({ ...fx[size], owner: name }));
      await call('onRequestPut', 'api/save.js',
        putRequest(cookie, JSON.stringify({ owner: name, version: 0, blob: packed }), 112), env,
        { check: { label: 'middleware setup PUT', status: 200 } });
      const storedBlob = await storedBlobFor(env, cookie);

      // GET: identical request through each invoker.
      const getReq = () => makeRequest('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } });
      const baseVersion = await currentVersionFor(env, cookie);
      const handlerOnly = await measure(`mw:handler-only-get-${size}`, {
        meta: { mwMode: 'handler-only', expect: 200 },
        plan: async () => prepare({ invoker: 'handler-only', fn: 'onRequestGet', file: 'api/save.js', request: getReq(), env }),
        check: () => ({ label: 'mw handler-only get', status: 200, version: baseVersion, encoding: 'compact' }),
      });
      out.push({ ...handlerOnly });
      const throughBoth = await measure(`mw:middleware+get-${size}`, {
        meta: { mwMode: 'handler+middleware', expect: 200 },
        plan: async () => prepare({ invoker: 'middleware', fn: 'onRequestGet', file: 'api/save.js', request: getReq(), env }),
        check: () => ({ label: 'mw middleware get', status: 200, version: baseVersion, encoding: 'compact' }),
      });
      out.push({ ...throughBoth });

      // PUT: an ACCEPTED save for both invokers. Every request claims the version the previous one was
      // answered with, warmup included, so no sample is a conflict.
      for (const invoker of ['handler-only', 'middleware']) {
        await ensureCompactRowFor(env, cookie, storedBlob, name);
        let claimed = await currentVersionFor(env, cookie);
        const texts = [];
        for (let i = 0; i < (RUNS + 2) * BATCH + 4; i++) texts.push({ text: JSON.stringify({ owner: name, version: claimed + i, blob: storedBlob }), v: claimed + i });
        const put = await measure(`mw:${invoker === 'middleware' ? 'middleware' : 'handler-only'}-put-${size}`, {
          meta: { mwMode: invoker === 'middleware' ? 'handler+middleware' : 'handler-only', expect: 200 },
          plan: async i => {
            const item = texts[i];
            if (!item) throw new Error('mw put: ran out of prebuilt bodies');
            return prepare({ invoker, fn: 'onRequestPut', file: 'api/save.js', request: putRequest(cookie, item.text, 112), env });
          },
          check: i => ({ label: 'mw ' + invoker + ' put', status: 200, version: texts[i].v + 1 }),
        });
        out.push({ ...put });
      }
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

  // WHAT THIS RUN IS NOT. Production runs this code inside workerd, behind a real D1 binding, with a
  // Durable Object gate when WRITE_GATE=required, and with Tail Workers watching. None of that is here,
  // and a report that does not say so invites the numbers to be read as production CPU.
  const gateRequired = String(process.env.WRITE_GATE || '').trim().toLowerCase() === 'required';
  const components = {
    runtime: 'Node ' + process.version + ' (not workerd)',
    substituted: ['D1 database: in-process SQLite shim (prepare/bind/first/all/run/batch), not the real D1 binding',
                  'isolate lifecycle: one long-lived process, so no cold start and no isolate recycling'],
    absent: [
      'recovery gate (Durable Object `prontera-gate`): ' + (gateRequired
        ? 'WRITE_GATE=required is set but no GATE binding exists here, so a gate-required request fails closed and is NOT measured'
        : 'absent - WRITE_GATE is unset, so the gate lease and its two DO round trips do not run'),
      'Durable Object lease/release round trips for /api on the real gate',
      'Tail Workers, Cloudflare analytics, and any hosted CPU accounting',
      'the Social Worker (plaza Durable Object) - a different budget entirely',
    ],
    measured: 'request handler CPU (and, for the middleware rows, the Pages Functions front door: preview guard, ban hash + lookup)',
  };
  const invokers = Object.fromEntries(Object.entries(invokerStats).map(([k, v]) => [k, { ...v }]));
  const payload = { label: LABEL, runs: RUNS, node: process.version, at: new Date().toISOString(),
    components, invokers, results };
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
    console.log('CPU is process.cpuUsage() around the request only: request construction happens before the');
    console.log('sample and draining/validating the reply happens after it. Wall time is kept separate.');
    console.log('');
    console.log('Not production, and absent in this harness:');
    for (const c of components.absent) console.log('  - ' + c);
    console.log('Substituted for production:');
    for (const c of components.substituted) console.log('  - ' + c);
    console.log('Invoker counters (measured, not assumed):');
    for (const [k, v] of Object.entries(invokers)) console.log('  - ' + k.padEnd(14) + v.requests + ' requests, ' + v.middlewareEntries + ' middleware entries');
    console.log('');
    console.log('This is comparative local evidence, NOT Cloudflare cpu_ms. Do not quote it as hosted CPU.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
