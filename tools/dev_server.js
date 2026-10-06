// The Cloudflare half of the game, running locally, with no Cloudflare account and no network.
//
//   node tools/dev_server.js            # http://localhost:8788 (or PORT=xxxx)
//   node tools/dev_server.js --port 0   # any free port; the chosen one is printed
//
// Why this exists: the real server is Pages Functions + D1, and `wrangler pages dev` is the official
// way to run that. This is the *offline* way — it serves the built site from dist/ and routes
// /api/* to the very same handler files in functions/api/**, with the same D1-shaped shim the test
// suite uses, over real HTTP with real cookies. So the owner can click through cloud accounts and
// cloud saves before a single Cloudflare resource exists.
//
// It is a development tool, not a host: no TLS, one process, in-memory database (delete the process
// and the data is gone), and it binds to localhost by default. Cloudflare's runtime still has the
// last word on the platform questions — CPU limits, the real D1 binding, cookie behaviour — and
// `wrangler pages dev` remains the check for those.
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ D1 shim ----
// Identical in shape to tools/tests/api_sim.js: what D1 offers (prepare/bind/first/all/run) and
// nothing more, so a handler that leans on a Node-only API fails here too.
export function makeD1(sqlite) {
  const wrap = (stmt, args = []) => ({
    bind: (...more) => wrap(stmt, args.concat(more)),
    first: async () => stmt.get(...args) ?? null,
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ success: true, meta: stmt.run(...args) }),
  });
  return { prepare: sql => wrap(sqlite.prepare(sql)) };
}

export function freshDb(file) {
  const sqlite = new DatabaseSync(file || ':memory:');
  sqlite.exec(fs.readFileSync(path.join(root, 'migrations', '0001_init.sql'), 'utf8'));
  return sqlite;
}

// ----------------------------------------------------------------- routing ----
// Every path the client can call, mapped to the file that serves it. A missing entry answers 404
// JSON rather than falling through to the static site, so the client's "is there an API here?"
// probe is answered honestly either way.
export const ROUTES = {
  'POST /api/register': ['onRequestPost', 'api/register.js'],
  'POST /api/sessions': ['onRequestPost', 'api/sessions.js'],
  'DELETE /api/sessions': ['onRequestDelete', 'api/sessions.js'],
  'GET /api/me': ['onRequestGet', 'api/me.js'],
  'GET /api/save': ['onRequestGet', 'api/save.js'],
  'PUT /api/save': ['onRequestPut', 'api/save.js'],
  'GET /api/messages': ['onRequestGet', 'api/messages.js'],
  'POST /api/messages': ['onRequestPost', 'api/messages.js'],
  'GET /api/grants': ['onRequestGet', 'api/grants.js'],
  'POST /api/grants': ['onRequestPost', 'api/grants.js'],
  'GET /api/gm/players': ['onRequestGet', 'api/gm/players.js'],
  'GET /api/gm/player': ['onRequestGet', 'api/gm/player.js'],
  'POST /api/gm/player': ['onRequestPost', 'api/gm/player.js'],
  'GET /api/gm/log': ['onRequestGet', 'api/gm/log.js'],
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
};

// The env a handler sees. DB is the shim; anything else a function might want is a deliberate
// omission, so it fails loudly here instead of behaving differently in production.
export function makeEnv(sqlite) { return { DB: makeD1(sqlite) }; }

export function createApp({ sqlite, site }) {
  const env = makeEnv(sqlite);
  const dir = site || path.join(root, 'dist');
  const handlerCache = new Map();

  const loadHandler = async file => {
    if (!handlerCache.has(file)) handlerCache.set(file, import(pathToFileURL(path.join(root, 'functions', file)).href));
    return handlerCache.get(file);
  };

  return async function app(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return serveStatic(url, dir);
    const route = ROUTES[request.method + ' ' + url.pathname];
    if (!route) {
      return new Response(JSON.stringify({ err: 'No such endpoint: ' + url.pathname }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    const [fn, file] = route;
    const mod = await loadHandler(file);
    if (typeof mod[fn] !== 'function') {
      return new Response(JSON.stringify({ err: 'Handler ' + fn + ' missing in ' + file }), {
        status: 501, headers: { 'Content-Type': 'application/json' },
      });
    }
    return mod[fn]({ request, env, params: {} });
  };
}

function serveStatic(url, dir) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(dir, rel);
  if (!file.startsWith(dir)) return new Response('No.', { status: 403 });          // path traversal
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // A static host answering with HTML is exactly what the client must not mistake for an API;
    // here that only happens for real missing pages.
    const notFound = path.join(dir, 'index.html');
    return fs.existsSync(notFound) && url.pathname !== '/index.html'
      ? new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
      : new Response('Not found', { status: 404 });
  }
  const body = fs.readFileSync(file);
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' },
  });
}

// ------------------------------------------------------------------- boot -----
export function start({ port = 8788, host = '127.0.0.1', site, dbFile } = {}) {
  const sqlite = freshDb(dbFile);
  const app = createApp({ sqlite, site });
  const server = createServer(async (req, res) => {
    try {
      // Node's IncomingMessage is close enough to a Request for the handlers: they read method,
      // url, headers.get and text().
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const request = {
        method: req.method,
        url: 'http://' + (req.headers.host || host + ':' + port) + req.url,
        headers: { get: k => req.headers[String(k).toLowerCase()] ?? null },
        text: async () => body.toString('utf8'),
        json: async () => JSON.parse(body.toString('utf8')),
      };
      const out = await app(request);
      const headers = {};
      for (const [k, v] of out.headers) {
        if (k.toLowerCase() === 'set-cookie') (headers['set-cookie'] = headers['set-cookie'] || []).push(v);
        else headers[k] = v;
      }
      const buf = Buffer.from(await out.arrayBuffer());
      res.writeHead(out.status, headers);
      res.end(buf);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ err: String(e && e.message || e) }));
    }
  });
  return new Promise(resolve => server.listen(port, host, () => resolve({
    server, sqlite, port: server.address().port, close: () => new Promise(r => server.close(r)),
  })));
}

// Only boot when run directly; a test or another tool can import the pieces above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argPort = (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : null);
  const port = Number(argPort ?? process.env.PORT ?? 8788);
  const host = process.env.HOST || '0.0.0.0';       // reachable from the preview/proxy, not just localhost
  const { port: got, close } = await start({ port, host });
  console.log('Prontera Grind — local server (Pages Functions + D1 shim, in memory)');
  console.log('  game    http://localhost:' + got + '/');
  console.log('  console http://localhost:' + got + '/gm.html');
  console.log('  api     ' + Object.keys(ROUTES).length + ' endpoints under /api/*');
  console.log('  data    in memory - restarting this process wipes accounts and saves');
  console.log('  the first account you register becomes the owner (gm=2)');
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await close(); process.exit(0); });
}
