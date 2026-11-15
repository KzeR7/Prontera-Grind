// The Cloudflare half of the game, running locally, with no Cloudflare account and no network.
//
//   node tools/dev_server.js            # http://localhost:8788 (or PORT=xxxx)
//   node tools/dev_server.js --port 0   # any free port; the chosen one is printed
//   node tools/dev_server.js --gm-all   # every account registered here is an owner (preview use)
//   node tools/dev_server.js --preview-auth   # header session bridge for embedded previews (players stay players)
//   node tools/dev_server.js --db tools/.devdb/preview.sqlite   # keep accounts across restarts
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
import { attachSocial } from './social/dev-sockets.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
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
    _runSync: () => ({ success: true, meta: stmt.run(...args) }),
  });
  return { prepare: sql => wrap(sqlite.prepare(sql)), batch: async statements => {
    // Complete a whole transaction without yielding: other requests must not interleave
    // individual statements on this shared SQLite connection.
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = statements.map(q => q._runSync()); sqlite.exec('COMMIT'); return out; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  } };
}

export function freshDb(file) {
  // `--db tools/.devdb/preview.sqlite` is the documented way to keep accounts across restarts, but
  // that directory is gitignored - so a fresh clone has no `.devdb/` and SQLite refuses to create a
  // file inside a missing directory ("unable to open database file"). Make it, then open it.
  if (file) fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new DatabaseSync(file || ':memory:');
  const migrations = path.join(root, 'migrations');
  sqlite.exec('CREATE TABLE IF NOT EXISTS dev_migrations(name TEXT PRIMARY KEY)');
  for (const name of fs.readdirSync(migrations).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
    if(sqlite.prepare('SELECT name FROM dev_migrations WHERE name=?').get(name))continue;
    sqlite.exec('BEGIN');
    try{sqlite.exec(fs.readFileSync(path.join(migrations,name),'utf8'));sqlite.prepare('INSERT INTO dev_migrations(name) VALUES(?)').run(name);sqlite.exec('COMMIT');}
    catch(e){sqlite.exec('ROLLBACK');throw e;}
  }
  return sqlite;
}

// ----------------------------------------------------------------- routing ----
// Every path the client can call, mapped to the file that serves it. A missing entry answers 404
// JSON rather than falling through to the static site, so the client's "is there an API here?"
// probe is answered honestly either way.
export const ROUTES = {
  'POST /api/register': ['onRequestPost', 'api/register.js'],
  'POST /api/recover': ['onRequestPost', 'api/recover.js'],
  'POST /api/sessions': ['onRequestPost', 'api/sessions.js'],
  'DELETE /api/sessions': ['onRequestDelete', 'api/sessions.js'],
  'GET /api/me': ['onRequestGet', 'api/me.js'],
  'GET /api/board': ['onRequestGet', 'api/board.js'],
  'GET /api/save': ['onRequestGet', 'api/save.js'],
  'PUT /api/save': ['onRequestPut', 'api/save.js'],
  'GET /api/messages': ['onRequestGet', 'api/messages.js'],
  'POST /api/messages': ['onRequestPost', 'api/messages.js'],
  'GET /api/grants': ['onRequestGet', 'api/grants.js'],
  'POST /api/grants': ['onRequestPost', 'api/grants.js'],
  'GET /api/gm/catalog': ['onRequestGet', 'api/gm/catalog.js'],
  'GET /api/gm/fishing': ['onRequestGet', 'api/gm/fishing.js'],
  'POST /api/gm/fishing': ['onRequestPost', 'api/gm/fishing.js'],
  'POST /api/gm/gifts': ['onRequestPost', 'api/gm/gifts.js'],
  'GET /api/gm/players': ['onRequestGet', 'api/gm/players.js'],
  'GET /api/gm/player': ['onRequestGet', 'api/gm/player.js'],
  'POST /api/gm/player': ['onRequestPost', 'api/gm/player.js'],
  'GET /api/gm/log': ['onRequestGet', 'api/gm/log.js'],
  'GET /api/gm/ipbans': ['onRequestGet', 'api/gm/ipbans.js'],
  'POST /api/gm/ipbans': ['onRequestPost', 'api/gm/ipbans.js'],
  'GET /api/gm/audit': ['onRequestGet', 'api/gm/audit.js'],
  'GET /api/gm/damage': ['onRequestGet', 'api/gm/damage.js'],
  'GET /api/gm/announcements': ['onRequestGet', 'api/gm/announcements.js'],
  'POST /api/gm/announcements': ['onRequestPost', 'api/gm/announcements.js'],
  'POST /api/gm/damage': ['onRequestPost', 'api/gm/damage.js'],
  'GET /api/gm/usage': ['onRequestGet', 'api/gm/usage.js'],
  'GET /api/shop/catalog': ['onRequestGet', 'api/shop/catalog.js'],
  'POST /api/shop/checkout': ['onRequestPost', 'api/shop/checkout.js'],
  'GET /api/shop/order': ['onRequestGet', 'api/shop/order.js'],
  'POST /api/shop/webhook': ['onRequestPost', 'api/shop/webhook.js'],
  'GET /api/shop/webhook': ['onRequestGet', 'api/shop/webhook.js'],
  'GET /api/gm/shop': ['onRequestGet', 'api/gm/shop.js'],
  'POST /api/gm/shop': ['onRequestPost', 'api/gm/shop.js'],
  'GET /api/friends': ['onRequestGet', 'api/friends.js'],
  'POST /api/friends': ['onRequestPost', 'api/friends.js'],
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
};

// The env a handler sees. DB is the shim; anything else a function might want is a deliberate
// omission, so it fails loudly here instead of behaving differently in production.
// GM promotion is implemented only in this local router, never in deployed registration.
// --gm-all is unsafe for real users, real accounts, and publicly accessible hosts.
// SHOP_FAKE_CHECKOUT (--fake-payments) makes the Cash Shop deliver an order the moment it is placed,
// with no Stripe account: the same code path a real payment ends in, minus the card. Production
// never sets it; there the shop is off until STRIPE_SECRET_KEY exists (docs/MONETIZATION-SETUP.md).
export function makeEnv(sqlite, { fakePayments = false } = {}) {
  const env = { DB: makeD1(sqlite) };
  if (fakePayments) env.SHOP_FAKE_CHECKOUT = '1';
  return env;
}

export function createApp({ sqlite, site, gmAll = false, fakePayments = false }) {
  const env = makeEnv(sqlite, { fakePayments });
  const dir = site || path.join(root, 'dist');
  // The Pages asset store, shimmed locally (kept for any handler that reads a static asset),
  // exactly like the real binding does on Cloudflare.
  env.ASSETS = { fetch: u => serveStatic(u instanceof URL ? u : new URL(u, 'http://local'), dir) };
  const handlerCache = new Map();

  const loadHandler = async file => {
    if (!handlerCache.has(file)) handlerCache.set(file, import(pathToFileURL(path.join(root, 'functions', file)).href));
    return handlerCache.get(file);
  };

  const app = async function app(request) {
    const url = new URL(request.url);
    // Dev-only: /phone puts the game in a phone-sized frame (tools/phone_preview.html) so the
    // small-screen layout can be reviewed in a desktop browser. It is repo material, never part
    // of dist/, so it is read from the checkout and no static host can serve it.
    if (url.pathname === '/phone' || url.pathname === '/phone/') {
      const page = path.join(root, 'tools', 'phone_preview.html');
      if (!fs.existsSync(page)) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      // The X-Phone-Preview marker is how the game tells a real preview server from a static host
      // that answers every unknown path with the game itself: only this header shows the link.
      return new Response(fs.readFileSync(page), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Phone-Preview': '1' },
      });
    }
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
    const response = await mod[fn]({ request, env, params: {} });
    if (gmAll && request.method === 'POST' && url.pathname === '/api/register' && response.status === 201) {
      // This code runs only in the disposable Node preview, not in Pages Functions.
      const data = await response.clone().json();
      sqlite.prepare('UPDATE users SET gm = 2 WHERE username = ? COLLATE NOCASE').run(data.u);
      data.gm = 2;
      return new Response(JSON.stringify(data), { status: response.status, headers: response.headers });
    }
    return response;
  };
  // The local Social namespace is attached after the HTTP server exists; expose the same mutable
  // environment to that bootstrap step, just as Pages injects its service binding in production.
  app.env = env;
  return app;
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
  const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' };
  if (rel === '/version.txt' || /\.(html|js|css)$/i.test(rel)) headers['Cache-Control'] = 'no-store';
  return new Response(body, { status: 200, headers });
}

// ------------------------------------------------------------------- boot -----
// previewAuth: mirror the pg_session cookie through the X-Preview-Session header (and the
// socket's ?preview_session=) so an embedded preview still signs in when the browser blocks
// third-party cookies in iframes. It moves the SAME session token over the SAME channel the
// cookie would use - no extra privilege; --gm-all is what grants GM, and it implies this.
export function start({ port = 8788, host = '127.0.0.1', site, dbFile, gmAll = false, previewAuth = gmAll, fakePayments = false } = {}) {
  const bridge = !!(previewAuth || gmAll);
  const sqlite = freshDb(dbFile);
  // v381: on a --gm-all preview, accounts registered before the flag existed would stay plain
  // players forever (the db persists across restarts) - upgrade everyone at boot so the owner can
  // always reach the GM console with any local account. Preview-only: gmAll defaults off.
  if (gmAll && dbFile) {
    try { sqlite.prepare('UPDATE users SET gm=2 WHERE gm<2').run(); } catch {}
  }
  const app = createApp({ sqlite, site, gmAll, fakePayments });
  const server = createServer(async (req, res) => {
    try {
      // Node's IncomingMessage is close enough to a Request for the handlers: they read method,
      // url, headers.get and text().
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const isHttps = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || /^https:\/\//i.test(String(req.headers.origin || req.headers.referer || ''));
      const proto = isHttps ? 'https' : 'http';
      const psIn = bridge && req.headers['x-preview-session'] && !/\bpg_session=/.test(req.headers.cookie || '')
        ? (req.headers.cookie ? req.headers.cookie + '; ' : '') + 'pg_session=' + encodeURIComponent(String(req.headers['x-preview-session']))
        : req.headers.cookie;
      const request = {
        method: req.method,
        url: proto + '://' + (req.headers.host || host + ':' + port) + req.url,
        headers: { get: k => { const lk = String(k).toLowerCase(); return (lk === 'cookie' ? psIn : req.headers[lk]) ?? null; } },
        text: async () => body.toString('utf8'),
        json: async () => JSON.parse(body.toString('utf8')),
      };
      const out = await app(request);
      const headers = {};
      for (const [k, v] of out.headers) {
        if (k.toLowerCase() === 'set-cookie') {
          const cookieOut = isHttps ? v.replace(/;\s*SameSite=Lax/i, '; SameSite=None; Partitioned') : v.replace(/;\s*Secure/i, '');
          (headers['set-cookie'] = headers['set-cookie'] || []).push(cookieOut);
          const m = bridge && /\bpg_session=([^;]*)/.exec(v);
          if (m) headers['x-preview-session'] = decodeURIComponent(m[1]);
        } else headers[k] = v;
      }
      const buf = Buffer.from(await out.arrayBuffer());
      res.writeHead(out.status, headers);
      res.end(buf);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ err: String(e && e.message || e) }));
    }
  });
  app.env.SOCIAL = attachSocial(server, makeD1(sqlite), { previewAuth: bridge });
  return new Promise(resolve => server.listen(port, host, () => resolve({
    server, sqlite, port: server.address().port, close: () => new Promise(r => server.close(r)),
  })));
}

// Only boot when run directly; a test or another tool can import the pieces above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // dist/ is build output and is not kept in the repo, so a fresh checkout - or a workspace that was
  // snapshotted - will not have it. Build it rather than serving a blank page.
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    console.log('dist/ is missing - running tools/build_site.sh first');
    const b = spawnSync('bash', [path.join(root, 'tools', 'build_site.sh')], { stdio: 'inherit' });
    if (b.status !== 0) { console.error('build failed; nothing to serve'); process.exit(1); }
  }
  const arg = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
  const port = Number(arg('--port') ?? process.env.PORT ?? 8788);
  const host = process.env.HOST || '0.0.0.0';       // reachable from the preview/proxy, not just localhost
  // --gm-all: every account registered here is an owner, so a preview can never strand the owner with
  // an account that has no GM tools. --db <file>: keep accounts and saves across restarts instead of
  // losing them with the process. Both are for the preview; the default stays the production rule.
  const gmAll = process.argv.includes('--gm-all') || process.env.DEV_GM_ALL === 'all';
  const dbFile = arg('--db') || process.env.DEV_DB || undefined;
  // The X-Preview-Session bridge is ON by default (owner bug, v307). An embedded preview runs the
  // game in an iframe on another site, and browsers drop third-party cookies there - the session
  // cookie was silently lost, every authenticated call answered 401, and the client read that as
  // "signed in on another device", so a fresh sign-in (or a brand-new account) landed on that card
  // and could never get past it. The bridge carries the SAME session token in a header instead of
  // only in the cookie; it grants no extra privilege (--gm-all is what makes accounts owners), and
  // this is a local development server either way. --no-preview-auth (or DEV_PREVIEW_AUTH=0) turns
  // it off to rehearse the production cookie-only path.
  const previewAuth = !process.argv.includes('--no-preview-auth') && process.env.DEV_PREVIEW_AUTH !== '0';
  // --fake-payments: Cash Shop purchases complete instantly without Stripe (preview/rehearsal only).
  const fakePayments = process.argv.includes('--fake-payments') || process.env.SHOP_FAKE_CHECKOUT === '1';
  if (gmAll && !['127.0.0.1', 'localhost', '::1'].includes(host))
    console.warn('WARNING: GM preview is reachable beyond localhost; use only disposable data and a trusted network.');
  const { port: got, close } = await start({ port, host, gmAll, previewAuth, dbFile, fakePayments });
  console.log('Prontera Grind — local server (Pages Functions + D1 shim, in memory)');
  console.log('  game    http://localhost:' + got + '/');
  console.log('  console http://localhost:' + got + '/gm.html');
  console.log('  phone   http://localhost:' + got + '/phone   (the game in a phone-sized frame)');
  console.log('  api     ' + Object.keys(ROUTES).length + ' endpoints under /api/*');
  console.log('  data    ' + (dbFile ? 'kept in ' + dbFile + ' (accounts and saves survive a restart)' : 'in memory - restarting this process wipes accounts and saves'));
  console.log(gmAll
    ? '  gm      EVERY account registered here is an owner (gm=2) - this is a preview server'
    : '  gm      public registrations are players; --gm-all is for disposable local testing only');
  console.log(previewAuth
    ? '  auth    X-Preview-Session bridge on (embedded-preview sign-in without third-party cookies)'
    : '  auth    cookie-only sign-in (--no-preview-auth): an iframed preview may lose its session');
  console.log(fakePayments
    ? '  shop    FAKE payments: every Cash Shop order is delivered instantly, no card, no Stripe'
    : '  shop    Cash Shop in preview mode (no payments); add --fake-payments to rehearse purchases');
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await close(); process.exit(0); });
}
