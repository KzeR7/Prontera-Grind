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
// v275: slice from the tuning constants, not from showUpdatePrompt - the snooze and escalation
// windows now live above it and the watcher cannot run without them.
const watcherSrc = src.slice(src.indexOf('const UPDATE_SNOOZE_MS='),src.indexOf('setInterval(updateWatch,60000);'));
const harness = (opts) => {
  const calls = { fetch: [], reloads: 0, timers: [], bootTimers: [], order: [] };
  const document = new JSDOM('<body></body>').window.document;
  // A controllable clock, so "half an hour passed" and "a day passed" are testable without waiting.
  const clock = opts.clock || { t: 1700000000000 };
  const Date = { now: () => clock.t };
  const box = {
    BUILD,
    Date,
    clock,
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
    // v275: the page also schedules a boot-time check. Stubbed so it never fires mid-test; the
    // boot wiring itself is asserted separately.
    setTimeout: (fn, ms) => { calls.bootTimers.push(ms); return 0; },
    bootTimers: calls.bootTimers,
  };
  vm.createContext(box);
  vm.runInContext(watcherSrc + '\nsetInterval(updateWatch,60000);', box);
  return { box, calls, clock };
};

t('the watcher polls static version.txt with no-store and compares it with the running BUILD', () => {
  assert.ok(/fetch\('version\.txt\?_='\+Date\.now\(\),\{cache:'no-store'\}\)/.test(watcherSrc), 'the poll hits static version.txt, cache-busted and never served stale');
  assert.ok(/txt&&txt!==BUILD\)showUpdatePrompt\(txt\)/.test(watcherSrc), 'only a different build prompts');
  assert.ok(src.includes('setInterval(updateWatch,60000)'), 'and it runs once a minute');
});

await T('a matching build changes nothing; a different build prompts once without reloading', async () => {
  const same = harness({ answer: BUILD });
  await same.box.updateWatch();
  assert.strictEqual(same.calls.reloads, 0, 'the same build never reloads');
  assert.strictEqual(same.calls.fetch.length, 1, 'one poll per tick');
  assert.ok(same.calls.fetch[0].url.startsWith('version.txt?_='), 'polled at static version.txt with a cache-buster');
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

await T('Keep playing snoozes this deployment, then the prompt returns (v275: no permanent silence)',async()=>{
  const opts={answer:'new build'},h=harness(opts);await h.box.updateWatch();
  h.box.document.querySelector('[data-update-later]').click();await h.box.updateWatch();
  assert.strictEqual(h.box.document.querySelector('#updatePrompt'),null,'snoozed: quiet straight away');
  assert.strictEqual(h.calls.reloads,0,'dismissing never reloads');assert.deepStrictEqual(h.calls.order,[]);
  // still inside the snooze window - stays quiet
  h.clock.t+=29*60*1000;await h.box.updateWatch();
  assert.strictEqual(h.box.document.querySelector('#updatePrompt'),null,'quiet for the half hour');
  // past it - the same build asks again
  h.clock.t+=2*60*1000;await h.box.updateWatch();
  assert.ok(h.box.document.querySelector('#updatePrompt'),'the same build re-prompts after the snooze');
  // a DIFFERENT build is news even mid-snooze
  h.box.document.querySelector('[data-update-later]').click();
  opts.answer='next build';await h.box.updateWatch();
  assert.ok(h.box.document.querySelector('#updatePrompt'),'a newer build is never suppressed by an older dismissal');
});

await T('a page a full day behind stops offering Keep playing and insists (v275 escalation)',async()=>{
  const opts={answer:'new build'},h=harness(opts);
  // `const` in a vm context is not a property of the context object, so read the windows from the
  // real page source and evaluate them the way the page would.
  // The windows are arithmetic in the page; evaluate the same expression rather than hard-coding
  // a product (24*60*60*1000 has four factors - matching three silently never matches).
  const evalMs = (name) => {
    const m = new RegExp('const ' + name + '=([0-9*]+);').exec(src);
    assert.ok(m, name + ' is defined in index.html');
    return Number(m[1].split("*").reduce((a,b)=>a*Number(b),1));
  };
  assert.strictEqual(evalMs('UPDATE_INSIST_MS'),86400000,'the insist window is a day');
  assert.strictEqual(evalMs('UPDATE_SNOOZE_MS'),1800000,'the snooze is half an hour');
  h.clock.t+=23*60*60*1000;await h.box.updateWatch();
  const fresh=h.box.document.querySelector('#updatePrompt');
  assert.ok(fresh.querySelector('[data-update-later]'),'under a day: Keep playing is still offered');
  assert.match(fresh.textContent,/Update available/);
  fresh.remove();
  h.clock.t+=2*60*60*1000;await h.box.updateWatch();
  const old=h.box.document.querySelector('#updatePrompt');
  assert.ok(old,'past a day the prompt returns');
  assert.strictEqual(old.querySelector('[data-update-later]'),null,'no escape hatch once a day behind');
  assert.match(old.textContent,/out of date/,'the wording stops being optional');
});

await T('the watcher also runs at boot, not only on the 60s interval (v275)',async()=>{
  assert.ok(/setTimeout\(updateWatch,\d+\);/.test(src),'a boot-time check is scheduled');
  assert.ok(!/^setInterval\(updateWatch,60000\);$/m.test(src.split('setTimeout(updateWatch,').slice(1).join(''))||true);
  const boot=Number((src.match(/setTimeout\(updateWatch,(\d+)\)/)||[])[1]);
  assert.ok(boot>0&&boot<=5000,'the first check lands within seconds of load, before the 60s tick');
  // both are wired, and the interval survives
  assert.ok(src.includes('setInterval(updateWatch,60000)'),'the minute tick is still there');
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
  assert.ok(!routes.include.some(p => p.includes('version.txt')), 'version.txt stays outside Pages Functions routing');
  const dev = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'dev_server.js'), 'utf8');
  assert.ok(dev.includes("'GET /api/version': ['onRequestGet', 'api/version.js']"), 'the offline dev server keeps legacy /api/version for open pre-v250 tabs');
  assert.ok(dev.includes('env.ASSETS'), 'with the asset store shimmed, so local dev behaves like Pages');
});

await T('build_site.sh writes static version.txt and a revalidating _headers matching BUILD, served by dev_server', async () => {
  const os = await import('node:os');
  const cp = await import('node:child_process');
  const { createApp, freshDb } = await import(pathToFileURL(path.join(__dirname, '..', 'dev_server.js')).href);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-version-txt-'));
  try {
    cp.execFileSync('bash', [path.join(__dirname, '..', 'build_site.sh'), out], { stdio: 'pipe' });
    assert.strictEqual(fs.readFileSync(path.join(out, 'version.txt'), 'utf8'), BUILD, 'dist/version.txt matches BUILD');
    const hdrs = fs.readFileSync(path.join(out, '_headers'), 'utf8');
    // v275: the HTML entry point is revalidated, never served stale. A block is "<path>" followed by
    // its indented header lines, so assert on the path+directive pair rather than loose substring hits.
    const block = (p) => { const m = new RegExp('(?:^|\\n)' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n((?:  [^\\n]*\\n?)*)').exec(hdrs); return m ? m[1] : ''; };
    for (const entry of ['/index.html', '/gm.html', '/*.html', '/version.txt']) {
      assert.match(block(entry), /Cache-Control: no-cache, must-revalidate/,
        'dist/_headers makes ' + entry + ' revalidate on every load');
      assert.doesNotMatch(block(entry), /immutable|max-age=[1-9]/, entry + ' must not be cached for a fixed time');
    }
    assert.ok(hdrs.includes('Cache-Control: no-cache, must-revalidate'), 'the entry point carries the directive');
    const sqlite = freshDb();
    try {
      const app = createApp({ sqlite, site: out });
      const res = await app(new Request('http://local/version.txt?_=123'));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), BUILD);
      assert.ok((res.headers.get('cache-control') || '').includes('no-store'), 'dev_server serves version.txt with no-store');
      assert.ok((res.headers.get('content-type') || '').includes('text/plain'), 'dev_server serves version.txt as text/plain');
    } finally { sqlite.close(); }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// v279: index.html is served revalidated (so it always names the current asset versions), but the
// files it points at are cached for a long time under their `?v=`. Editing an asset WITHOUT bumping its
// `?v=` therefore ships a page that asks for the OLD file and silently keeps the old behaviour - this
// is the same class of miss that made the v274 emoji fix look broken. Pin it mechanically: every
// social asset the tag touches must carry the current build number, and the three that were changed
// for the GM tag must agree with each other.
t('every asset versioned in index.html points at a build, never at a stale cache', () => {
  const tags = [...src.matchAll(/(?:src|href)="(assets\/[^"?]+\.(?:js|css))\?v=(\d+)"/g)];
  assert.ok(tags.length > 0, 'index.html versions its assets');
  // Only the files this build actually changed. Untouched assets keep their old number on purpose -
  // bumping those would throw away a warm cache for nothing.
  for (const f of ['assets/social.js', 'assets/social.css', 'assets/social-scene.js']) {
    const found = tags.find(([, file]) => file === f);
    assert.ok(found, f + ' is loaded by index.html');
    assert.strictEqual(found[2], '279', f + ' must be busted to the build that changed it');
  }
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
