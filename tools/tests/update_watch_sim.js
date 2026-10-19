// The update watcher and its /api/version endpoint (v88).
//   node tools/tests/update_watch_sim.js
//
// A deployment prompts once and leaves the session running. Refresh is player initiated,
// saves locally, and waits for the cloud flush before reloading.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
const T = async (n, f) => { try { await f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + (e && e.message)); fail++; } };
console.log('update watcher: a player chooses when to refresh after a deploy\n');

const BUILD = src.match(/const BUILD='([^']+)'/)[1];

// ---- the watcher, pulled out of the real page and driven with stubs --------
const watcherSrc = src.slice(src.indexOf('function showUpdatePrompt(build=BUILD){'),src.indexOf('setInterval(updateWatch,60000);'));
const harness = (opts) => {
  const calls = { fetch: [], reloads: 0, timers: [], order: [] };
  const document = new JSDOM('<body></body>').window.document;
  const box = {
    BUILD,
    Date,
    document,
    save: () => calls.order.push("save"),
    cloudFlushNow: async () => { calls.order.push("flush"); if(opts.flush)await opts.flush(); calls.order.push("flushed"); },
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      if (opts.networkDown) throw new Error('offline');
      const r = { ok: opts.status ? opts.status < 400 : true, text: async () => opts.answer };
      return opts.answer === undefined ? (opts.status ? r : Promise.reject(new Error('no endpoint'))) : r;
    },
    location: { reload: () => { calls.reloads++; calls.order.push("reload"); } },
    setInterval: (fn, ms) => { calls.timers.push(ms); return 0; },
  };
  vm.createContext(box);
  vm.runInContext(watcherSrc + '\nsetInterval(updateWatch,60000);', box);
  return { box, calls };
};

t('the watcher polls /api/version with no-store and compares it with the running BUILD', () => {
  assert.ok(/fetch\('api\/version\?_='\+Date\.now\(\),\{cache:'no-store'\}\)/.test(watcherSrc), 'the poll is cache-busted and never served stale');
  assert.ok(/txt&&txt!==BUILD\)showUpdatePrompt\(txt\)/.test(watcherSrc), 'only a different build prompts');
  assert.ok(src.includes('setInterval(updateWatch,60000)'), 'and it runs once a minute');
});

await T('a matching build changes nothing; a different build prompts once without reloading', async () => {
  const same = harness({ answer: BUILD });
  await same.box.updateWatch();
  assert.strictEqual(same.calls.reloads, 0, 'the same build never reloads');
  assert.strictEqual(same.calls.fetch.length, 1, 'one poll per tick');
  assert.ok(same.calls.fetch[0].url.startsWith('api/version?_='), 'polled at the endpoint with a cache-buster');
  assert.strictEqual(same.calls.fetch[0].init.cache, 'no-store', 'the browser cache is bypassed');

  const next = harness({ answer: '2026-10-09 grind-v99 some future deploy' });
  await next.box.updateWatch();
  assert.strictEqual(next.calls.reloads, 0, 'a deploy never reloads automatically');
  assert.strictEqual(next.box.document.querySelectorAll('#updatePrompt').length,1);
  assert.strictEqual(next.box.document.querySelector('#updatePrompt').getAttribute('role'),'dialog');
  await next.box.updateWatch();
  assert.strictEqual(next.box.document.querySelectorAll('#updatePrompt').length,1,'polls do not duplicate notices');
  assert.deepStrictEqual(next.calls.order,[],'no save, sync or session change before the player clicks');
});

await T('a missing endpoint, a dead network or an empty answer never interrupts play', async () => {
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

await T('Keep playing dismisses this deployment without re-prompting, and a later deployment prompts again',async()=>{
  const opts={answer:'new build'},h=harness(opts);await h.box.updateWatch();
  h.box.document.querySelector('[data-update-later]').click();await h.box.updateWatch();
  assert.strictEqual(h.box.document.querySelector('#updatePrompt'),null);
  assert.strictEqual(h.calls.reloads,0);assert.deepStrictEqual(h.calls.order,[]);
  opts.answer='next build';await h.box.updateWatch();
  assert.ok(h.box.document.querySelector('#updatePrompt'));
});

await T('refresh saves locally and waits for cloud sync; double clicks only refresh once',async()=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve});
  const h=harness({answer:'new build',flush:()=>pending});await h.box.updateWatch();
  const button=h.box.document.querySelector('#updatePrompt button');
  const clicked=button.onclick();await button.onclick();
  assert.strictEqual(button.disabled,true);assert.strictEqual(h.calls.reloads,0);
  assert.deepStrictEqual(h.calls.order,['save','flush']);
  finish();await clicked;
  assert.deepStrictEqual(h.calls.order,['save','flush','flushed','reload']);
  assert.strictEqual(h.calls.reloads,1);
});
await T('offline cloud sync still permits a chosen refresh after saving locally',async()=>{
  const h=harness({answer:'new build',flush:async()=> 'offline'});await h.box.updateWatch();
  await h.box.document.querySelector('button').onclick();
  assert.deepStrictEqual(h.calls.order,['save','flush','flushed','reload']);
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

// The build tag is copied into a few documents so a reader can tell which build a sheet or a note is about.
// A bump that leaves one of those copies behind would show a stale build name to whoever reads it.
t('every build-tag mirror names the BUILD this page runs (a bump that misses one fails here)', () => {
  for (const m of ['Updates/cards-gear-audit/affix-ranges.html',
                   'Updates/cards-gear-audit/equipment-cards-tuning.html',
                   'tools/cloudflare-deploy-steps.md']) {
    const text = fs.readFileSync(path.join(__dirname, '..', '..', m), 'utf8');
    assert.ok(text.includes(BUILD), m + ' still names an older build');
  }
});

console.log('\nupdate watcher: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
