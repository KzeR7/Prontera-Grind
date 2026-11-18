// v416: the CPU-diet changes, pinned by behaviour rather than by timing.
//
// Local milliseconds are not evidence of anything on Cloudflare, so every saving in this change is
// also expressed as a contract that a test can hold:
//
//   1. GET /api/save reads the save row ONCE and parses its blob once (it used to read it twice, for a
//      field the response does not even carry).
//   2. An accepted sync that changed none of the denormalised leaderboard columns does not rewrite
//      them - but it still advances `version`, still writes the blob and still moves `last_seen`, so
//      the acknowledgement means exactly what it did before.
//   3. A sync that DID change them writes them (the projection is not merely skipped).
//   4. Echo settlement is skipped only while a COMPLETED pass already covers every period that could
//      be due. A due period is settled on the next save, on a board view, or by the owner's explicit
//      pass; a failure leaves it open and retryable; running it twice cannot grant a prize twice.
//
// Run: node tools/tests/cpu_hot_paths_sim.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

// ------------------------------------------------------------------ harness ----
// A D1 shim that records every statement, because "one read instead of two" is a SQL fact, not a
// timing one. Shape-compatible with tools/dev_server.js (prepare/bind/first/all/run/batch).
function makeD1(sqlite, log) {
  const note = sql => log.push(sql.replace(/\s+/g, ' ').trim());
  const wrap = (stmt, args = [], sql = '') => ({
    bind: (...more) => wrap(stmt, args.concat(more), sql),
    first: async () => { note(sql); return stmt.get(...args) ?? null; },
    all: async () => { note(sql); return { results: stmt.all(...args) }; },
    run: async () => { note(sql); return { success: true, meta: stmt.run(...args) }; },
    _stmt: stmt, _args: args, _sql: sql,
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
  const log = [];
  return { env: { DB: makeD1(sqlite, log) }, sqlite, log };
}

const req = (method, url, { body, cookie, headers = {} } = {}) => {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if (cookie) h.set('cookie', cookie);
  const text = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  if (text) h.set('content-type', 'application/json');
  return { method, url: 'https://pg.test' + url,
    headers: { get: k => h.get(String(k).toLowerCase()) ?? null }, text: async () => text };
};

const mods = new Map();
const load = async file => {
  if (!mods.has(file)) mods.set(file, await import(pathToFileURL(path.join(root, 'functions', file)).href));
  return mods.get(file);
};
const call = async (fn, file, request, env) => {
  const m = await load(file);
  const res = await m[fn]({ request, env, params: {} });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null,
    cookie: (/pg_session=[^;]+/.exec(res.headers.get('set-cookie') || '') || [''])[0] };
};

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); }
};

// A save big enough that a parse is measurable and the 8 KB instrumentation threshold sees it.
const bigSave = (name, lv = 20, kills = 7) => {
  const save = { owner: name, lv, cls: 'Novice', zeny: 1000, kills, pts: 4, sex: 'm', exp: 1, hp: 100,
    st: { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 }, eq: {}, cards: [], fishing: { bag: [] },
    inv: Array.from({ length: 120 }, (_, i) => ({ id: 'it' + i, name: 'Plate Armor ' + i, slot: 'armor',
      wt: 'sword', tier: 2, val: 10 + i, aff: [{ k: 'def', v: 3 }], cards: [], slots: 0, sec: 0, lvl: 1, quality: 1, mp: 0 })),
  };
  return JSON.stringify(save);
};

const signup = async (env, u) => {
  const r = await call('onRequestPost', 'api/register.js', req('POST', '/api/register',
    { body: { u, p: 'cpu-diet-password-1', email: u.toLowerCase() + '@example.test' } }), env);
  assert.equal(r.status, 201, 'register ' + u);
  return r.cookie;
};

// ---------------------------------------------------------------- 1. GET ----
{
  const { env, sqlite, log } = freshEnv();
  const cookie = await signup(env, 'GETONCE');
  const id = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('GETONCE').id;
  await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie, body: { owner: 'GETONCE', version: 0, blob: bigSave('GETONCE') } }), env);

  const before = sqlite.prepare('SELECT version, blob, saved_at, updated_at, last_seen FROM saves WHERE user_id = ?').get(id);
  // Advance the stored baseline by five minutes so the touch is observable, and keep the away window
  // under the three-minute claim floor so this case is about the read count, not about a claim.
  sqlite.prepare('UPDATE saves SET last_seen = ? WHERE user_id = ?').run(Date.now() - 60_000, id);
  const ahead = sqlite.prepare('SELECT last_seen FROM saves WHERE user_id = ?').get(id).last_seen;

  const storedLen = before.blob.length;
  log.length = 0;
  const parses = [];
  const realParse = JSON.parse;
  JSON.parse = function (v, ...rest) {
    if (typeof v === 'string' && v.length > 8192) parses.push(v.length);
    return realParse.call(this, v, ...rest);
  };
  let got;
  try {
    got = await call('onRequestGet', 'api/save.js', req('GET', '/api/save',
      { cookie, headers: { 'x-save-format': '112' } }), env);
  } finally { JSON.parse = realParse; }

  const saveReads = log.filter(s => /SELECT \* FROM saves WHERE user_id = \?/.test(s)).length;
  ok('GET /api/save reads the save row exactly once', saveReads === 1, 'saw ' + saveReads);
  // The envelope is parsed too, so count only the parse of the stored save text itself.
  const storedParses = parses.filter(n => n === storedLen).length;
  ok('GET /api/save parses the stored blob exactly once', storedParses === 1,
    'parses: ' + parses.join(',') + ' (stored blob ' + storedLen + ' B)');
  ok('GET still answers the authoritative version and blob', got.status === 200 &&
    got.body.version === before.version && got.body.blob === before.blob, 'status ' + got.status);
  ok('GET still answers the untouched savedAt/updatedAt', got.body.savedAt === before.saved_at &&
    got.body.updatedAt === before.updated_at);
  const after = sqlite.prepare('SELECT last_seen FROM saves WHERE user_id = ?').get(id);
  ok('GET still moves the away baseline', after.last_seen > ahead, ahead + ' -> ' + after.last_seen);
  ok('GET writes no save row', !log.some(s => /^UPDATE saves SET version/.test(s)));
}

// ------------------------------------------- 2/3. the projection columns ----
{
  const { env, sqlite, log } = freshEnv();
  const cookie = await signup(env, 'PROJ');
  const id = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('PROJ').id;
  const blob = bigSave('PROJ', 20, 7);
  await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie, body: { owner: 'PROJ', version: 0, blob } }), env);
  // The server stamps its own identity into the stored text, so that text - not `blob` - is what a
  // re-sync sends back and what the row must still hold afterwards.
  const stamped = sqlite.prepare('SELECT blob FROM saves WHERE user_id = ?').get(id).blob;

  // An unchanged re-sync: same lv/cls/zeny/kills, so the row must not be rewritten column by column.
  log.length = 0;
  const same = await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie, body: { owner: 'PROJ', version: 1, blob: stamped } }), env);
  ok('a re-synced unchanged save is still acknowledged', same.status === 200 && same.body.version === 2,
    'status ' + same.status + ' version ' + (same.body && same.body.version));
  const updates = log.filter(s => /^UPDATE saves SET /.test(s));
  ok('an unchanged re-sync writes the save row once', updates.length === 1, updates.join(' | '));
  ok('  ...and does not rewrite the unchanged leaderboard columns',
    updates.length === 1 && !/level = \?/.test(updates[0]) && !/kills_total = \?/.test(updates[0]), updates[0]);
  ok('  ...while still writing version, blob, saved_at, updated_at and last_seen',
    updates.length === 1 && /SET version = \?, blob = \?, saved_at = \?, updated_at = \?, last_seen = \?/.test(updates[0]), updates[0]);
  const row = sqlite.prepare('SELECT version, blob, last_seen FROM saves WHERE user_id = ?').get(id);
  ok('  ...and the stored row really advanced', row.version === 2 && row.blob === stamped && row.last_seen > 0);

  // A save that DID gain a level and kills must rewrite the projection, or the leaderboard goes stale.
  const grown = JSON.parse(stamped); grown.lv = 21; grown.kills = 40;
  log.length = 0;
  const changed = await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie, body: { owner: 'PROJ', version: 2, blob: JSON.stringify(grown) } }), env);
  const grownUpdate = log.find(s => /^UPDATE saves SET /.test(s)) || '';
  ok('a save that changed the projection writes it', changed.status === 200 &&
    /level = \?/.test(grownUpdate) && /kills_total = \?/.test(grownUpdate), grownUpdate);
  const projection = sqlite.prepare('SELECT level, kills_total FROM saves WHERE user_id = ?').get(id);
  ok('  ...and the stored projection follows the save', projection.level === 21 && projection.kills_total === 40,
    JSON.stringify(projection));

  // A stale version must still be refused, whichever statement the handler would have chosen.
  const stale = await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie, body: { owner: 'PROJ', version: 1, blob: stamped } }), env);
  ok('a stale version is still a 409', stale.status === 409 && stale.body.conflict === true);
  ok('  ...and nothing was written', sqlite.prepare('SELECT version FROM saves WHERE user_id = ?').get(id).version === 3);
}

// ------------------------------------------------------- 4. settlement ----
//
// Settlement is deliberately UNCHANGED by this change (the durable-checkpoint gate was prototyped and
// dropped on measurement: it saved ~7 us and cost two extra statements whenever a period was due).
// These cases pin what a future optimisation must not break: a save settles what is due, a refused
// settlement never fails the save and stays retryable, a retry cannot pay twice, a board view settles
// too, and the owner's forced pass remains owner-only.
{
  const { env, sqlite, log } = freshEnv();
  const owner = await signup(env, 'EchoOwner');
  const player = await signup(env, 'EchoPlayer');
  sqlite.prepare("UPDATE users SET gm = 2 WHERE username = 'EchoOwner'").run();
  const pid = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('EchoPlayer').id;

  // Periods are stored in whole seconds (a CHECK constraint says so), so every boundary is aligned.
  const aligned = ms => Math.floor(ms / 1000) * 1000;
  // A score can only be recorded inside its period's window (a trigger enforces it), so the score is
  // written while the window is open and the window is then moved into the past - which is exactly the
  // state a completed-but-unsettled period is in.
  const endedPeriod = (db, key, rows) => {
    const start = aligned(Date.now()) - 7_200_000;
    const end = aligned(Date.now()) + 3_600_000;
    db.prepare(`INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at)
      VALUES(?,'daily','unverified-save-v1',?,?)`).run(key, start, end);
    for (const [user, run, score] of rows) {
      db.prepare('INSERT INTO competition_scores(period_key,user_id,run_id,score,recorded_at) VALUES(?,?,?,?,?)')
        .run(key, user, run, score, start + 60_000);
    }
    db.prepare('UPDATE competition_periods SET ends_at = ? WHERE period_key = ?').run(aligned(Date.now()) - 3_600_000, key);
  };
  const state = (db, key) => db.prepare('SELECT state FROM competition_periods WHERE period_key = ?').get(key).state;

  const blob = bigSave('EchoPlayer');
  endedPeriod(sqlite, 'day:2026-01-02', [[pid, 'sim-run', 5_000]]);
  await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie: player, body: { owner: 'EchoPlayer', version: 0, blob } }), env);
  ok('an accepted save settles a period that ended', state(sqlite, 'day:2026-01-02') === 'closed');
  ok('  ...and the winner received their prizes',
    sqlite.prepare('SELECT COUNT(*) AS n FROM grants WHERE user_id = ?').get(pid).n > 0);
  const firstGrants = sqlite.prepare('SELECT COUNT(*) AS n FROM grants').get().n;

  // Every accepted save still tries: one indexed read. That is the cost this change does NOT remove,
  // and the test records it so nobody "optimises" a payout away later without saying so.
  log.length = 0;
  await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie: player, body: { owner: 'EchoPlayer', version: 1, blob } }), env);
  ok('every accepted save still runs the settlement query', 
    log.filter(s => /FROM competition_periods WHERE state='open'/.test(s)).length === 1);
  ok('  ...and re-running it pays nothing twice',
    sqlite.prepare('SELECT COUNT(*) AS n FROM grants').get().n === firstGrants);

  // A refused batch: the save still succeeds, the period stays open, the retry settles it.
  endedPeriod(sqlite, 'day:2026-01-05', [[pid, 'sim-run-4', 8_000]]);
  sqlite.exec("CREATE TRIGGER reject_echo_prize BEFORE INSERT ON grants WHEN NEW.created_by='Echo competition' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
  const warn = console.warn; console.warn = () => {};
  let refused;
  try {
    refused = await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
      { cookie: player, body: { owner: 'EchoPlayer', version: 2, blob } }), env);
  } finally { console.warn = warn; }
  ok('a refused settlement still accepts the save', refused.status === 200);
  ok('  ...leaves the period open for a retry', state(sqlite, 'day:2026-01-05') === 'open');
  sqlite.exec('DROP TRIGGER reject_echo_prize');
  await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie: player, body: { owner: 'EchoPlayer', version: 3, blob } }), env);
  ok('  ...and the next save settles it', state(sqlite, 'day:2026-01-05') === 'closed');

  // A week boundary is settled by exactly the same query (kind is not filtered), and a period with no
  // active players closes without paying anyone.
  const weekStart = aligned(Date.now()) - 7_200_000;
  sqlite.prepare(`INSERT INTO competition_periods(period_key,kind,ruleset,starts_at,ends_at)
    VALUES('week:2026-01-05','weekly','unverified-save-v1',?,?)`).run(weekStart, aligned(Date.now()) + 3_600_000);
  const board = await call('onRequestGet', 'api/board.js', req('GET', '/api/board?period=weekly&board=echo', { cookie: player }), env);
  ok('a board view settles too', board.status === 200);

  endedPeriod(sqlite, 'day:2026-01-06', []);
  const grantsBefore = sqlite.prepare('SELECT COUNT(*) AS n FROM grants').get().n;
  await call('onRequestPut', 'api/save.js', req('PUT', '/api/save',
    { cookie: player, body: { owner: 'EchoPlayer', version: 4, blob } }), env);
  ok('an empty due period closes without paying anyone',
    state(sqlite, 'day:2026-01-06') === 'closed' &&
    sqlite.prepare('SELECT COUNT(*) AS n FROM grants').get().n === grantsBefore);

  // The retry endpoint that a stuck period needs is the board itself; the owner's forced pass was part
  // of the dropped gate and is gone with it, so there is nothing GM-only to assert here.
  ok('no owner-only settlement endpoint is left behind',
    !fs.existsSync(path.join(root, 'functions/api/gm/echo/settle.js')));
  void owner;
}

// ------------------------------------------- 5. the profiler CLI is honest ----
//
// v419: `tools/cpu_hotpaths.mjs` read --case/--size/--runs but then profiled its own defaults, so
// `--case me --size small --runs 1` reported 40 near-cap PUTs under a header claiming otherwise. A
// benchmark that does not run the workload it names is worse than no benchmark: the numbers get quoted.
// These cases drive the real CLI as a child process and check both the validation and the workload.
{
  const { spawnSync } = await import('node:child_process');
  const profiler = path.join(root, 'tools', 'cpu_hotpaths.mjs');
  const run = (...args) => {
    const r = spawnSync(process.execPath, [profiler, ...args], { encoding: 'utf8', timeout: 300_000 });
    return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') };
  };

  // Refusals: an unusable setting must stop the run, not be silently replaced by a default.
  for (const [args, why] of [[['--case', 'nonsense'], 'an unknown --case'],
                             [['--size', 'huge'], 'an unknown --size'],
                             [['--runs', '0'], 'a zero --runs'],
                             [['--runs', 'many'], 'a non-numeric --runs'],
                             [['--case', 'save-put', '--runs', '1', '--top', 'x'], 'an unknown --top']]) {
    const r = run(...args);
    ok('the profiler refuses ' + why, r.code === 2 && /cpu_hotpaths:/.test(r.err), 'exit ' + r.code + ' ' + r.err.slice(0, 60));
  }

  // A real profile of the smallest possible workload: the header must name what actually ran.
  const r = run('--case', 'me', '--size', 'small', '--runs', '1', '--top', '3');
  ok('a one-request profile of --case me exits 0', r.code === 0, 'exit ' + r.code + ' ' + r.err.slice(0, 120));
  ok('  ...and its header names GET /api/me, not the default PUT', /case me \(GET \/api\/me\)/.test(r.out),
    r.out.split('\n')[0]);
  ok('  ...and reports the size, run count and the request it answered', /\/ small \/ 1 runs, 1 requests answered 200/.test(r.out),
    r.out.split('\n')[0]);
  ok('  ...and does not claim the near-cap PUT workload', !/save-put|nearCap/.test(r.out.split('\n')[0]),
    r.out.split('\n')[0]);

  const g = run('--case', 'save-get', '--size', 'small', '--runs', '2', '--top', '3');
  ok('--case save-get runs GET /api/save', g.code === 0 && /case save-get \(GET \/api\/save/.test(g.out),
    g.out.split('\n')[0] || g.err.slice(0, 80));
  ok('  ...for exactly the requested number of requests', /2 runs, 2 requests answered 200/.test(g.out), g.out.split('\n')[0]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
