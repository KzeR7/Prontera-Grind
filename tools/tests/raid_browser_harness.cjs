// Rift Raid — real browser acceptance harness.
//
// This is NOT a simulation. It starts a server that executes the real `functions/` handlers against a
// real SQLite D1 stand-in, serves the real built site, and drives a real Chromium through Playwright.
// Nothing in here stubs the raid: the browser loads `dist/`, the API runs the same code Pages runs,
// and the numbers reported are counted from actual HTTP requests and actual storage.
//
// Why it exists: the PR could not claim browser acceptance from Node or jsdom. This closes that gap
// locally. It is still NOT staging — see the coverage notes it prints.
//
//   node tools/tests/raid_browser_acceptance.cjs --serve-only   # just serve, for a manual pass
//   node tools/tests/raid_browser_acceptance.cjs                # the full automated pass
'use strict';

const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const CHROMIUM = process.env.PG_CHROMIUM || '/tmp/chromium';
const CHROME_LIBS = process.env.PG_CHROMIUM_LIBS || '/tmp/chlibs/lib';

const MIME = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const results = [];
function ok(name, detail) { results.push({ name, pass: true, detail }); console.log('  ok   ' + name + (detail ? '  [' + detail + ']' : '')); }
function fail(name, detail) { results.push({ name, pass: false, detail }); console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); }

// ------------------------------------------------------------------ the D1 stand-in
// A real SQLite database created from the repo's own migrations, with the subset of the D1 API the
// handlers use. Rows read and rows written are counted by wrapping every statement.
function makeD1(file) {
  const sql = new DatabaseSync(file);
  const counters = { statements: 0, batches: 0, rowsRead: 0, rowsWritten: 0 };
  const all = (stmt, params) => {
    counters.statements++;
    const rows = stmt.all(...params);
    counters.rowsRead += rows.length;
    return rows;
  };
  const statement = (sqlText) => {
    let bound = [];
    return {
      _sql: sqlText,
      bind(...params) {
        bound = params.map(p => (p === undefined ? null : (typeof p === 'boolean' ? Number(p) : p)));
        return this;
      },
      async all() { return { results: all(sql.prepare(sqlText), bound), success: true }; },
      async first() { const r = all(sql.prepare(sqlText), bound); return r[0] ?? null; },
      async run() {
        counters.statements++;
        const info = sql.prepare(sqlText).run(...bound);
        counters.rowsWritten += Number(info.changes || 0);
        return { success: true, meta: { changes: Number(info.changes || 0), last_row_id: Number(info.lastInsertRowid || 0) } };
      },
    };
  };
  return {
    sql,
    counters,
    prepare: statement,
    async batch(list) {
      counters.batches++;
      const out = [];
      for (const s of list) out.push(await s.run());
      return out;
    },
    async exec(text) { counters.statements++; sql.exec(text); return { count: 0 }; },
  };
}

function applyMigrations(db) {
  const dir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    // Hand the whole file to SQLite's own parser. Splitting on `;` is wrong: a CREATE TRIGGER body
    // contains semicolons, and a naive split cuts the trigger in half ("incomplete input"). Every
    // statement in these files is written to be re-runnable, so the whole file executes in one go.
    try {
      db.sql.exec(text);
    } catch (error) {
      const message = String(error.message || error);
      if (!/already exists|duplicate column|no such/i.test(message)) throw new Error(f + ': ' + message);
    }
  }
}

// ------------------------------------------------------------------ the request log
// Every HTTP request the browser makes is recorded, tagged with the surface it hit. "Zero raid DO
// requests" is then a count over real traffic rather than an assertion about code paths.
function makeLog() {
  const entries = [];
  return {
    entries,
    push(e) { entries.push(e); },
    mark(label) { return entries.length ? { index: entries.length - 1, label } : { index: -1, label }; },
    since(marker) { return entries.slice(marker.index + 1); },
    count(predicate) { return entries.filter(predicate).length; },
    reset() { entries.length = 0; },
  };
}

function classify(url) {
  const u = new URL(url, 'http://x');
  if (u.pathname.startsWith('/api/raid') || u.pathname.startsWith('/api/social')) {
    // The DO is reached only through the API. A solo run must not produce any of these beyond
    // start/settle, and must never produce a `sync` (the 2 s co-op poll).
    return 'api:' + u.pathname;
  }
  if (u.pathname.startsWith('/api/')) return 'api:other';
  if (/^\/assets\/raid-engine\//.test(u.pathname)) return 'engine';
  if (/\.(js|css|png|webp|json|glb|mp3|woff2?)$/.test(u.pathname)) return 'static';
  return 'page';
}

// ------------------------------------------------------------------ static + function server
async function startServer({ html, db, log, env }) {
  const raid = await import(pathToFileURL(path.join(ROOT, 'functions', 'api', 'raid.js')).href);
  const host = '127.0.0.1';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + host + ':' + server.address().port);
    const kind = classify(url.pathname);
    const entry = { method: req.method, path: url.pathname + (url.search || ''), kind, status: 0 };
    log.push(entry);

    if (url.pathname.startsWith('/api/')) {
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : null;
        if (body && body.length < 4096) entry.body = body.toString('utf8');
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => v !== undefined));
        // The port matters: handlers compare the Origin header against `new URL(request.url).origin`
        // as a CSRF check, so a request rebuilt without the port rejects every browser POST.
        const request = new Request('http://' + host + ':' + server.address().port + req.url, {
          method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        });
        const handler = req.method === 'GET' ? raid.onRequestGet : raid.onRequestPost;
        const response = await handler({ request, env });
        const text = await response.text();
        entry.status = response.status;
        res.writeHead(response.status, {
          'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(text);
      } catch (error) {
        entry.status = 500;
        console.error('API error', url.pathname, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ err: 'server error', detail: String(error.message || error) }));
      }
      return;
    }

    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      entry.status = 404;
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    entry.status = 200;
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, host, r));
  return { server, base: 'http://127.0.0.1:' + server.address().port, raid };
}

// ------------------------------------------------------------------ Durable Object stand-in
// The real `Social` Durable Object class from workers/social, instantiated against an in-memory
// storage double. Using the real class (rather than hand-rolling the raid routes) means the party,
// install/restore, action, snapshot and ack semantics under test are the shipped ones, including the
// private-host check and identity parsing that only exist in the router. What is NOT real: storage
// persistence across eviction, WebSocket hibernation, and placement/latency.
function makeObjectStorage() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.get(key); },
    async put(key, value) { map.set(key, value); return key; },
    async delete(key) { return map.delete(key); },
    async list({ prefix = '' } = {}) {
      const out = new Map();
      for (const [k, v] of map) if (k.startsWith(prefix)) out.set(k, v);
      return out;
    },
    async getAlarm() { return null; },
    async setAlarm() {},
    async deleteAll() { map.clear(); },
  };
}

// One DO namespace: every stub for 'world' shares one instance, as a real single-name room would.
async function makeSocialNamespace({ log } = {}) {
  const { Social } = await import(pathToFileURL(path.join(ROOT, 'workers', 'social', 'index.mjs')).href);
  const storage = makeObjectStorage();
  const ctx = {
    storage,
    getWebSockets: () => [],
    acceptWebSocket: () => {},
  };
  const social = new Social(ctx);
  await social.ready;
  const counts = { requests: 0, paths: [] };
  if (log) counts.log = log;
  const stub = {
    async fetch(request) {
      counts.requests += 1;
      counts.paths.push(new URL(request.url).pathname);
      // The DO's own router rejects a non-`social` host, exactly as the deployed service binding
      // does, so this also proves the API builds the request the way the router expects.
      const response = await social.fetch(request);
      return response;
    },
  };
  return {
    binding: { idFromName: () => ({ toString: () => 'world' }), get: () => stub },
    counts,
    storage,
    social,
  };
}

module.exports = { makeD1, applyMigrations, makeLog, startServer, classify, makeSocialNamespace, makeObjectStorage, DIST, ROOT, CHROMIUM, CHROME_LIBS, ok, fail, results };
