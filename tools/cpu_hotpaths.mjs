#!/usr/bin/env node
// Function-level attribution for the whole-request CPU numbers in tools/cpu_profile.mjs.
//
//   node tools/cpu_hotpaths.mjs                  # accepted near-cap PUT, self time per function
//   node tools/cpu_hotpaths.mjs --case save-get --size medium --runs 40
//
// How: it re-executes itself under `node --cpu-prof` (the same V8 sampling profiler DevTools'
// Performance panel uses), runs the real handler N times against the real migrations through the D1
// shim, and folds the samples by function. That answers "which function" and "which module", which a
// wall-clock or a single elapsed number cannot - and it is still a Node/V8 measurement, not workerd's
// billed cpu_ms.
import { Session } from 'node:inspector/promises';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const selfPath = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

// ------------------------------------------------------------- profiled child ----
// v419: the parent used to read these from process.env ONLY, so `--case me` silently profiled the
// default 40 near-cap PUTs and the header line then LIED about what had run. Both sides now derive the
// workload from one place: the parent parses and validates the flags, and the child gets the resolved
// values through the environment (never re-reads argv, which it does not have).
const CHILD = process.env.PG_PROFILE_CHILD === '1';
const CASES = { 'save-put': 'PUT /api/save (accepted)', 'save-get': 'GET /api/save (X-Save-Format: 112)', me: 'GET /api/me' };
const SIZES = ['small', 'medium', 'nearCap'];
const DEFAULT_CASE = 'save-put', DEFAULT_SIZE = 'nearCap', DEFAULT_RUNS = 40;

// One resolver, used by the parent for its own settings and to build the child's environment.
function resolveWorkload() {
  const fail = message => { console.error('cpu_hotpaths: ' + message); process.exit(2); };
  const wantedCase = flag('case', DEFAULT_CASE);
  const wantedSize = flag('size', DEFAULT_SIZE);
  const rawRuns = flag('runs', String(DEFAULT_RUNS));
  if (!Object.hasOwn(CASES, wantedCase)) fail('--case must be one of ' + Object.keys(CASES).join(', ') + ' (got ' + JSON.stringify(wantedCase) + ')');
  if (!SIZES.includes(wantedSize)) fail('--size must be one of ' + SIZES.join(', ') + ' (got ' + JSON.stringify(wantedSize) + ')');
  if (!/^\d+$/.test(String(rawRuns)) || Number(rawRuns) < 1 || Number(rawRuns) > 100_000)
    fail('--runs must be a whole number between 1 and 100000 (got ' + JSON.stringify(rawRuns) + ')');
  const top = flag('top', '30');
  if (!/^\d+$/.test(String(top)) || Number(top) < 1) fail('--top must be a positive whole number (got ' + JSON.stringify(top) + ')');
  return { case: wantedCase, size: wantedSize, runs: Number(rawRuns), top: Number(top) };
}
const WORKLOAD = CHILD
  ? { case: process.env.PG_CASE || DEFAULT_CASE, size: process.env.PG_SIZE || DEFAULT_SIZE,
      runs: Number(process.env.PG_RUNS || DEFAULT_RUNS), top: Number(process.env.PG_TOP || 30) }
  : resolveWorkload();
const CASE = WORKLOAD.case;
const SIZE = WORKLOAD.size;
const RUNS = WORKLOAD.runs;

function makeD1(sqlite) {
  const wrap = (stmt, args = []) => ({
    bind: (...more) => wrap(stmt, args.concat(more)),
    first: async () => stmt.get(...args) ?? null,
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ success: true, meta: stmt.run(...args) }),
  });
  return { prepare: sql => wrap(sqlite.prepare(sql)), batch: async ss => {
    sqlite.exec('BEGIN IMMEDIATE');
    try { return ss.map(q => ({ success: true, meta: q._stmt ? q._stmt.run(...q._args) : null })); }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    finally { try { sqlite.exec('COMMIT'); } catch {} }
  } };
}

if (CHILD) {
  process.env.PG_PROFILE_FILE = process.env.PG_PROFILE_FILE || path.join(os.tmpdir(), 'pg-cpu-' + process.pid + '.json');
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(root, 'migrations');
  for (const n of fs.readdirSync(dir).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) sqlite.exec(fs.readFileSync(path.join(dir, n), 'utf8'));
  // statement objects need _stmt/_args for batch above
  const env = { DB: (() => {
    const d = makeD1(sqlite);
    const wrap = (stmt, args = []) => ({ bind: (...m) => wrap(stmt, args.concat(m)), first: async () => stmt.get(...args) ?? null,
      all: async () => ({ results: stmt.all(...args) }), run: async () => ({ success: true, meta: stmt.run(...args) }),
      _stmt: stmt, _args: args });
    return { prepare: sql => wrap(sqlite.prepare(sql)), batch: async ss => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { return ss.map(q => ({ success: true, meta: q._stmt.run(...q._args) })); }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
      finally { try { sqlite.exec('COMMIT'); } catch {} }
    } };
  })() };
  const { createGame } = require(path.join(root, 'tools/tests/helpers/game.js'));
  const { fullStorageSave } = require(path.join(root, 'tools/tests/helpers/full-storage-save.js'));
  const codec = await import(pathToFileURL(path.join(root, 'functions/_lib/save-codec.js')).href);
  const reg = await import(pathToFileURL(path.join(root, 'functions/api/register.js')).href);
  const save = await import(pathToFileURL(path.join(root, 'functions/api/save.js')).href);
  const me = await import(pathToFileURL(path.join(root, 'functions/api/me.js')).href);

  const g = createGame();
  g.ev(fs.readFileSync(path.join(root, 'assets/social-fishing.js'), 'utf8'));
  const small = JSON.parse(g.ev(`(()=>{ S=load(); S.cls='Novice'; S.lv=24; S.zeny=12345; S.kills=120;
    S.inv=[];S.cards=[];S.eq={}; for(let i=0;i<6;i++)S.inv.push(genGear({k:'armor',n:'Cotton Robe',quality:1},24,i%3,false,undefined,0,10));
    return JSON.stringify(S) })()`));
  const medium = JSON.parse(g.ev(`(()=>{ S=load(); S.cls='Ranger'; S.lv=120; S.zeny=12000000; S.kills=250000;
    const sl=['weapon','armor','head','off','leg','acc']; const pool=[];
    for(let i=0;i<200;i++)pool.push(newCard(cardDefinition(i%10,i%4,i%2===0)));
    S.inv=[]; for(let i=0;i<300;i++){ const it=genGear({k:sl[i%6],n:'Faunus Hide',quality:1},120,i%4,false,undefined,i%10,10); it.cards=[];
      if(i%3===0){ it.slots=2; for(let k=0;k<2;k++){const c=JSON.parse(JSON.stringify(pool[(i*2+k)%200]));c.id=2000000+i*2+k;it.cards.push(c);} } S.inv.push(it); }
    S.cards=pool.slice(0,150).map((c,j)=>{const d=JSON.parse(JSON.stringify(c));d.id=3000000+j;return d});
    const F=PGSocialFishing; S.fishing=F.normalize({bagTier:2});
    for(let i=0;i<200;i++){const sp=F.SPECIES[i%F.SPECIES.length];
      F.addCatch(S.fishing,{sp:sp.id,w:sp.min+(sp.max-sp.min)*0.5,mut:i%2?'prismatic':null,perfect:i%2===0},1794873600000+i*60000);}
    return JSON.stringify(S) })()`));
  g.close();
  const fixture = { small, medium, nearCap: fullStorageSave() }[SIZE];
  const name = 'PROF' + SIZE.toUpperCase();
  fixture.owner = name;

  const mk = (method, url, { body, cookie, headers = {} } = {}) => {
    const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    if (cookie) h.set('cookie', cookie);
    if (body !== undefined) h.set('content-type', 'application/json');
    return { method, url: 'https://pg.test' + url, headers: { get: k => h.get(String(k).toLowerCase()) ?? null }, text: async () => body ?? '' };
  };
  const take = async res => { await res.text(); return res; };

  const rr = await reg.onRequestPost({ request: mk('POST', '/api/register',
    { body: JSON.stringify({ u: name, p: 'profile-password-1', email: name + '@x.test' }), headers: { 'content-type': 'application/json' } }), env });
  const cookie = (/pg_session=[^;]+/.exec(rr.headers.get('set-cookie') || '') || [''])[0];
  await take(rr);
  const packed = JSON.stringify(codec.packSave(fixture));
  await take(await save.onRequestPut({ request: mk('PUT', '/api/save', { cookie, body: JSON.stringify({ owner: name, version: 0, blob: packed }) }), env }));
  let version = sqlite.prepare('SELECT version FROM saves WHERE user_id=(SELECT id FROM users WHERE username=?)').get(name).version;
  const stored = sqlite.prepare('SELECT blob FROM saves WHERE user_id=(SELECT id FROM users WHERE username=?)').get(name).blob;

  // Profit only the measured loop: the game/fixture setup above costs seconds and would otherwise
  // dominate a self-time table (jsdom, module loading) and hide the handler.
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: 100 });
  await session.post('Profiler.start');
  let ran = 0; const statuses = [];
  for (let i = 0; i < RUNS; i++) {
    let res;
    if (CASE === 'save-put') {
      res = await save.onRequestPut({ request: mk('PUT', '/api/save', { cookie, body: JSON.stringify({ owner: name, version, blob: stored }) }), env });
      version++;
    } else if (CASE === 'save-get') {
      res = await save.onRequestGet({ request: mk('GET', '/api/save', { cookie, headers: { 'x-save-format': '112' } }), env });
    } else if (CASE === 'me') {
      res = await me.onRequestGet({ request: mk('GET', '/api/me', { cookie }), env });
    } else {
      throw new Error('unreachable case ' + CASE);   // resolveWorkload() already rejected it
    }
    await take(res);
    statuses.push(res.status);
    ran++;
    // A profiled loop that is answering errors is measuring the error path. Fail loudly instead of
    // publishing a table of somebody else's work.
    if (res.status !== 200) throw new Error(CASE + ' answered ' + res.status + ' on run ' + i);
  }
  const { profile } = await session.post('Profiler.stop');
  // Record what really ran, so the parent reports the workload it measured instead of assuming it.
  const executed = { case: CASE, size: SIZE, runs: RUNS, requests: ran,
    fixtureBytes: fixture.length, storedBytes: stored.length, statuses: [...new Set(statuses)] };
  fs.writeFileSync(process.env.PG_PROFILE_FILE, JSON.stringify({ profile, executed }));
  process.exit(0);
}

// --------------------------------------------------------------- aggregation ----
const profileFile = process.env.PG_PROFILE_FILE || path.join(os.tmpdir(), 'pg-cpu-' + process.pid + '.json');
const child = spawnSync(process.execPath, [selfPath], {
  env: { ...process.env, PG_PROFILE_CHILD: '1', PG_CASE: CASE, PG_SIZE: SIZE, PG_RUNS: String(RUNS),
    PG_TOP: String(WORKLOAD.top), PG_PROFILE_FILE: profileFile },
  stdio: 'inherit',
});
if (child.status !== 0) process.exit(child.status || 1);
const captured = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
const prof = captured.profile;
const executed = captured.executed || {};
const byId = new Map(prof.nodes.map(n => [n.id, n]));
// Samples -> leaf self time; the delta between consecutive timestamps is charged to the leaf.
const self = new Map();
const counts = new Map();
for (let i = 0; i < prof.samples.length; i++) {
  const id = prof.samples[i];
  const dt = (prof.timeDeltas && prof.timeDeltas[i]) || 0;
  self.set(id, (self.get(id) || 0) + dt);
  counts.set(id, (counts.get(id) || 0) + 1);
}
const rows = [...self.entries()].map(([id, us]) => {
  const n = byId.get(id) || {};
  const cf = n.callFrame || {};
  let url = String(cf.url || '');
  if (url.startsWith('file://')) { try { url = path.relative(root, fileURLToPath(url)); } catch { /* keep */ } }
  if (!url) url = '(native)';
  return { fn: cf.functionName || '(anonymous)', url, line: (cf.lineNumber || 0) + 1, us, hits: counts.get(id) || 0 };
});
const total = rows.reduce((s, x) => s + x.us, 0);
const group = new Map();
for (const row of rows) {
  const key = row.url + ' :: ' + row.fn;
  const cur = group.get(key) || { ...row, us: 0, hits: 0 };
  cur.us += row.us; cur.hits += row.hits;
  group.set(key, cur);
}
// Inclusive time: charge every ancestor of a sampled leaf, so "how much of the request is inside
// unpackSave" is answerable and not just "how much does unpackSave itself cost".
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
const inclusive = new Map();
for (const [id] of self) {
  let cur = id, guard = 0;
  while (cur != null && guard++ < 64) {
    inclusive.set(cur, (inclusive.get(cur) || 0) + (self.get(id) || 0));
    cur = parent.get(cur);
  }
}
const incl = new Map();
for (const [id, us] of inclusive) {
  const n = byId.get(id) || {};
  const cf = n.callFrame || {};
  let url = String(cf.url || '');
  if (url.startsWith('file://')) { try { url = path.relative(root, fileURLToPath(url)); } catch { /* keep */ } }
  if (!url) url = '(native)';
  const key = url + ' :: ' + (cf.functionName || '(anonymous)');
  const cur = incl.get(key) || { fn: cf.functionName || '(anonymous)', url, line: (cf.lineNumber || 0) + 1, us: 0 };
  cur.us += us; incl.set(key, cur);
}
// The settings the CHILD reported, not the ones the parent hoped for.
if (executed.case !== CASE || executed.size !== SIZE || executed.runs !== RUNS)
  console.error('cpu_hotpaths: the profiled child ran ' + JSON.stringify(executed) + ', which is not what was requested');
const top = [...group.values()].sort((a, b) => b.us - a.us).slice(0, WORKLOAD.top);
console.log(`case ${executed.case || CASE} (${CASES[executed.case || CASE]}) / ${executed.size || SIZE} / ` +
  `${executed.runs || RUNS} runs, ${executed.requests || RUNS} requests answered 200` +
  (executed.storedBytes ? `, ${executed.storedBytes} B stored` : '') +
  ` - V8 self time (sampling), ${(total / 1000).toFixed(1)} ms sampled total\n`);
console.log('  self_ms   share  hits  location');
for (const x of top) {
  console.log('  ' + (x.us / 1000).toFixed(2).padStart(7) + ' ' + ((x.us / total) * 100).toFixed(1).padStart(6) + '%' +
    ' ' + String(x.hits).padStart(5) + '  ' + (x.url === '(native)' ? x.fn : x.url + ':' + x.line + ' ' + x.fn));
}
if (argv.includes('--inclusive')) {
  const rows2 = [...incl.values()].filter(x => x.url.startsWith('functions/') || x.url.startsWith('tools/cpu_hotpaths'))
    .sort((a, b) => b.us - a.us).slice(0, WORKLOAD.top);
  console.log('\n  INCLUSIVE (this function and everything it called)');
  console.log('  incl_ms   share  location');
  for (const x of rows2) {
    console.log('  ' + (x.us / 1000).toFixed(2).padStart(7) + ' ' + ((x.us / total) * 100).toFixed(1).padStart(6) + '%  ' +
      x.url + ':' + x.line + ' ' + x.fn);
  }
}
console.log('\nSampling, not billing: this attributes Node/V8 CPU. Only Cloudflare\'s cpuTimeP50/P99 (and');
console.log('exceededResources) say what workerd bills for the same request.');
