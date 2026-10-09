// The update watcher and its /api/version endpoint (v88).
//   node tools/tests/update_watch_sim.js
//
// The owner asked: when a Cloudflare deploy lands, every player's browser should hard-refresh by
// itself, on PC and on mobile. The moving parts, pinned here:
//
//   * index.html polls /api/version once a minute with cache:'no-store' and compares the answer
//     with the BUILD it is running; a mismatch reloads the page, anything else (same build, a
//     missing endpoint, a dead network) leaves the game alone;
//   * functions/api/version.js answers with the BUILD string read out of the DEPLOYED index.html
//     through the Pages asset store, and the answer is no-store so it can never go stale;
//   * the endpoint never writes, never touches the database and never needs a session.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
const T = async (n, f) => { try { await f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + (e && e.message)); fail++; } };
console.log('update watcher: the page reloads itself when a deploy lands\n');

const BUILD = src.match(/const BUILD='([^']+)'/)[1];

// ---- the watcher, pulled out of the real page and driven with stubs --------
const watcherSrc = src.match(/function updateWatch\(\)\{[\s\S]*?\n\}/)[0];
const harness = (opts) => {
  const calls = { fetch: [], reloads: 0, timers: [] };
  const box = {
    BUILD,
    Date,
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      if (opts.networkDown) throw new Error('offline');
      const r = { ok: opts.status ? opts.status < 400 : true, text: async () => opts.answer };
      return opts.answer === undefined ? (opts.status ? r : Promise.reject(new Error('no endpoint'))) : r;
    },
    location: { reload: () => { calls.reloads++; } },
    setInterval: (fn, ms) => { calls.timers.push(ms); return 0; },
  };
  vm.createContext(box);
  vm.runInContext(watcherSrc + '\nsetInterval(updateWatch,60000);', box);
  return { box, calls };
};

t('the watcher polls /api/version with no-store and compares it with the running BUILD', () => {
  assert.ok(/fetch\('api\/version\?_='\+Date\.now\(\),\{cache:'no-store'\}\)/.test(watcherSrc), 'the poll is cache-busted and never served stale');
  assert.ok(/txt&&txt!==BUILD\)location\.reload\(\)/.test(watcherSrc), 'only a different build reloads');
  assert.ok(src.includes('setInterval(updateWatch,60000)'), 'and it runs once a minute');
});

t('a matching build changes nothing; a different build reloads the page', async () => {
  const same = harness({ answer: BUILD });
  await same.box.updateWatch();
  assert.strictEqual(same.calls.reloads, 0, 'the same build never reloads');
  assert.strictEqual(same.calls.fetch.length, 1, 'one poll per tick');
  assert.ok(same.calls.fetch[0].url.startsWith('api/version?_='), 'polled at the endpoint with a cache-buster');
  assert.strictEqual(same.calls.fetch[0].init.cache, 'no-store', 'the browser cache is bypassed');

  const next = harness({ answer: '2026-10-09 grind-v99 some future deploy' });
  await next.box.updateWatch();
  assert.strictEqual(next.calls.reloads, 1, 'a deployed build reloads the page (the hard refresh)');
});

t('a missing endpoint, a dead network or an empty answer never interrupts play', async () => {
  const noApi = harness({ answer: undefined });
  await noApi.box.updateWatch();
  assert.strictEqual(noApi.calls.reloads, 0, 'a static host (404/empty) never reloads');

  const down = harness({ networkDown: true });
  await down.box.updateWatch();
  assert.strictEqual(down.calls.reloads, 0, 'a dead network never reloads and never throws');

  const blank = harness({ answer: '   ' });
  await blank.box.updateWatch();
  assert.strictEqual(blank.calls.reloads, 0, 'an empty answer is not a build');
});

// ---- the endpoint itself ----------------------------------------------------
await T('functions/api/version.js answers with the deployed BUILD, no-store, no database', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'functions', 'api', 'version.js')).href);
  assert.strictEqual(typeof mod.onRequestGet, 'function', 'it exports the GET handler');
  const env = { ASSETS: { fetch: async u => new Response(src, { status: 200 }) }, DB: null };
  const res = await mod.onRequestGet({ request: new Request('https://game.example/api/version'), env });
  assert.strictEqual(res.status, 200, 'always a 200');
  assert.strictEqual(await res.text(), BUILD, 'the answer is exactly the BUILD in the served index.html');
  assert.ok((res.headers.get('cache-control') || '').includes('no-store'), 'the answer can never be cached');
  assert.ok((res.headers.get('content-type') || '').includes('text/plain'), 'it is plain text, not JSON');

  const broken = await mod.onRequestGet({ request: new Request('https://game.example/api/version'), env: {} });
  assert.strictEqual(broken.status, 200, 'without an asset store it still answers');
  assert.strictEqual(await broken.text(), '', 'with an empty body, so the watcher simply waits');
});

await T('the endpoint is routed on Cloudflare (_routes.json) and in the local dev server', async () => {
  const routes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '_routes.json'), 'utf8'));
  assert.ok(routes.include.includes('/api/*'), '/api/* goes through Functions');
  const dev = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'dev_server.js'), 'utf8');
  assert.ok(dev.includes("'GET /api/version': ['onRequestGet', 'api/version.js']"), 'the offline dev server serves it too');
  assert.ok(dev.includes('env.ASSETS'), 'with the asset store shimmed, so local dev behaves like Pages');
});

console.log('\nupdate watcher: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
