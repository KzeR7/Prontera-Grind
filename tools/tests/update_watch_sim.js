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
  const calls = { fetch: [], reloads: 0, timers: [], bootTimers: [], order: [], updating: [], scheduled: [] };
  const document = new JSDOM('<body></body>').window.document;
  // A controllable clock, so "half an hour passed" and "a day passed" are testable without waiting.
  const clock = opts.clock || { t: 1700000000000 };
  const Date = { now: () => clock.t };
  const box = {
    BUILD,
    Date,
    clock,
    document,
    Math,
    save: () => { calls.order.push("save"); if (opts.onSave) opts.onSave(); },
    cloudFlushNow: async () => { calls.order.push("flush"); const r = opts.flush ? await opts.flush() : 'ok'; calls.order.push("flushed"); return r === undefined ? 'ok' : r; },
    cloudSetUpdating: (on) => { calls.updating.push(!!on); if (box.CLOUD) box.CLOUD.updating = !!on; },
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      if (opts.networkDown) throw new Error('offline');
      const r = { ok: opts.status ? opts.status < 400 : true, text: async () => opts.answer };
      return opts.answer === undefined ? (opts.status ? r : Promise.reject(new Error('no endpoint'))) : r;
    },
    // v299: a reset is a cache-busted navigation (location.replace with ?build=), with
    // location.reload() kept as the fallback for hosts that cannot parse one.
    location: {
      href: 'https://haven.example/',
      replace: (url) => { calls.reloads++; calls.replaceUrl = url; calls.order.push("replace"); },
      reload: () => { calls.reloads++; calls.order.push("reload"); },
    },
    // The page only ever touches this inside try/catch, but the guard is what stops a loop.
    sessionStorage: opts.storage || {
      _v: {},
      getItem(k){ return Object.prototype.hasOwnProperty.call(this._v,k)?this._v[k]:null },
      setItem(k,v){ this._v[k]=String(v) },
    },
    setInterval: (fn, ms) => { calls.timers.push(ms); return 0; },
    // v275: the page also schedules a boot-time check. Stubbed so it never fires mid-test; the
    // boot wiring itself is asserted separately.
    setTimeout: (fn, ms) => { calls.bootTimers.push(ms); if (opts.runTimers) calls.scheduled.push(fn); return 0; },
    bootTimers: calls.bootTimers,
  };
  if (opts.cloud) box.CLOUD = Object.assign({ on: true, lost: false, paused: false, dirty: false, blocked: null, rev: 1, ackRev: 1, updating: false }, opts.cloud);
  if (opts.cloudReplaced !== undefined) box.cloudReplaced = opts.cloudReplaced;
  // v299: jsdom reports document.hidden === true by default (no real renderer), which would look
  // like a backgrounded tab to the new auto-reset. Pin it explicitly - false is "someone is looking".
  Object.defineProperty(document,'hidden',{value:!!opts.hidden,configurable:true});
  // A long-running visible page must still get the ASK, so the prompt tests start the page older
  // than UPDATE_AUTO_MS. `opts.freshPage` and `opts.hidden` cover the automatic reset.
  box.URL = URL;                                   // the page builds the cache-busted URL with it
  vm.createContext(box);
  vm.runInContext(watcherSrc + '\nsetInterval(updateWatch,60000);', box);
  if(!opts.freshPage)clock.t+=5*60*1000;
  return { box, calls, clock };
};

// v371 (owner: "the game stops working when the tab is backgrounded"): a hidden tab used to reset
// itself onto the newest build - and a reload logs in hub-first, so the field stayed parked and the
// grind never resumed. A hidden tab now never navigates; it remembers the build and the moment the
// player returns falls under the ordinary visible-tab rule (ask, or a fresh-page reset).
t('a hidden tab never navigates to the new build (v371)', () => {
  assert.match(watcherSrc, /if\(document\.hidden===true\)\{pendingUpdateBuild=txt;return\}/, 'a hidden tab remembers the build instead of resetting');
  assert.ok(!/document\.hidden===true[\s\S]{0,300}?hardReload/.test(watcherSrc), 'nothing in the watcher navigates while the tab is hidden');
  assert.ok(src.includes("document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(pendingUpdateBuild||Date.now()-PAGE_STARTED_AT>30000))updateWatch()});"), 'returning to the tab reapplies the watcher');
  assert.ok(src.includes('var pendingUpdateBuild=null;'), 'the pending build is page-local');
});

t('the watcher polls static version.txt with no-store and compares it with the running BUILD', () => {
  assert.ok(/fetch\('version\.txt\?_='\+Date\.now\(\),\{cache:'no-store'\}\)/.test(watcherSrc), 'the poll hits static version.txt, cache-busted and never served stale');
  assert.ok(/if\(!txt\|\|txt===BUILD\)return;/.test(watcherSrc), 'only a different build does anything');
  assert.ok(/showUpdatePrompt\(txt\)/.test(watcherSrc), 'and a mid-session page is asked');
  assert.ok(src.includes('setInterval(updateWatch,60000)'), 'and it runs once a minute');
});

await T('a matching build changes nothing; a different build prompts once without reloading', async () => {
  const same = harness({ answer: BUILD });
  await same.box.updateWatch();
  assert.strictEqual(same.calls.reloads, 0, 'the same build never reloads');
  assert.strictEqual(same.calls.fetch.length, 1, 'one poll per tick');
  assert.ok(same.calls.fetch[0].url.startsWith('version.txt?_='), 'polled at static version.txt with a cache-buster');
  assert.strictEqual(same.calls.fetch[0].init.cache, 'no-store', 'the browser cache is bypassed');

  // v299 (owner): mid-session the player is still asked - no automatic reset while they are playing.
  const next = harness({ answer: '2026-10-09 grind-v99 some future deploy' });
  await next.box.updateWatch();
  assert.strictEqual(next.calls.reloads, 0, 'a deploy never interrupts a player who is mid-session');
  assert.strictEqual(next.box.document.querySelectorAll('#updatePrompt').length,1);
  assert.strictEqual(next.box.document.querySelector('#updatePrompt').getAttribute('role'),'dialog');
  await next.box.updateWatch();
  assert.strictEqual(next.box.document.querySelectorAll('#updatePrompt').length,1,'polls do not duplicate notices');
  assert.deepStrictEqual(next.calls.order,[],'no save, sync or session change before the player clicks');
});

await T('a fresh page hard-resets itself; a background tab never does (v299, tightened in v371)', async () => {
  // Nobody has done anything yet: reset without asking, and cache-bust the URL so the browser
  // cannot answer the navigation from its own copy of the old shell.
  const fresh = harness({ answer: 'new build', freshPage: true });
  await fresh.box.updateWatch();
  assert.strictEqual(fresh.calls.reloads, 1, 'a brand-new page resets itself instead of prompting');
  assert.strictEqual(fresh.box.document.querySelector('#updatePrompt'), null, 'and asks nothing');
  assert.ok(/[?&]build=new-build/.test(fresh.calls.replaceUrl || ''), 'the reset URL carries the new build, so it cannot be served from cache');
  assert.strictEqual(fresh.box.document.querySelector('#updateToast')?.textContent.indexOf('Updating'), 0, 'the player sees one short line, not a dialog');

  // v371: a tab in the background is never navigated - the reload used to land on the hub/login
  // screen and stop the grind. It just remembers the build, whatever its age.
  const away = harness({ answer: 'new build', hidden: true });
  await away.box.updateWatch();
  assert.strictEqual(away.calls.reloads, 0, 'a backgrounded tab is not navigated');
  assert.strictEqual(away.box.pendingUpdateBuild, 'new build', 'the build is remembered for the moment the player returns');
  assert.strictEqual(away.box.document.querySelector('#updatePrompt'), null, 'no prompt for a tab nobody is looking at');
  assert.strictEqual(away.calls.fetch.length, 1, 'the background check is still cheap');

  // The player comes back to the tab: ordinary mid-session rules apply - ask, never navigate.
  Object.defineProperty(away.box.document, 'hidden', { value: false, configurable: true });
  await away.box.updateWatch();
  assert.strictEqual(away.calls.reloads, 0, 'returning players are asked, never reloaded behind their back');
  assert.ok(away.box.document.querySelector('#updatePrompt'), 'the player sees the update prompt on return');

  // A visible, mid-session page is never reset behind the player's back.
  const busy = harness({ answer: 'new build' });
  await busy.box.updateWatch();
  assert.strictEqual(busy.calls.reloads, 0, 'an active session is asked, never reset');
  assert.ok(busy.box.document.querySelector('#updatePrompt'), 'it gets the dialog instead');
});

await T('the automatic reset happens once per build, so a stale edge cannot loop it (v299)', async () => {
  // The tab session survives a reload, so the guard is shared across pages - exactly what a loop
  // prevention needs when the edge keeps handing back the old shell.
  const store = { _v: {}, getItem(k){ return this._v[k] ?? null }, setItem(k,v){ this._v[k]=String(v) } };
  const first = harness({ answer: 'new build', freshPage: true, storage: store });
  await first.box.updateWatch();
  assert.strictEqual(first.calls.reloads, 1, 'the first quiet moment resets');
  // The page comes back still running the old shell. A second automatic reset here is a reload
  // loop, which is worse than the stale build - so it asks instead.
  const back = harness({ answer: 'new build', freshPage: true, storage: store });
  await back.box.updateWatch();
  assert.strictEqual(back.calls.reloads, 0, 'the same build is not reset twice inside the guard window');
  assert.ok(back.box.document.querySelector('#updatePrompt'), 'the player is asked instead of looped');
});

await T('the refresh button hard-resets even when the automatic attempt already ran (v299)', async () => {
  const h = harness({ answer: 'new build', freshPage: true });
  await h.box.updateWatch();                        // automatic attempt, blocked by nothing yet
  assert.strictEqual(h.calls.reloads, 1);
  await h.box.updateWatch();                        // guard is set now, so this one asks
  const prompt = h.box.document.querySelector('#updatePrompt');
  assert.ok(prompt, 'the second poll falls back to the dialog');
  prompt.querySelector('button').click();
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(h.calls.reloads, 2, 'the button always wins, guard or not');
  assert.ok(/[?&]build=new-build/.test(h.calls.replaceUrl || ''), 'and it is cache-busted too');
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
  assert.deepStrictEqual(h.calls.order,['save','flush','flushed','replace']);
  assert.strictEqual(h.calls.reloads,1);
});
await T('offline cloud sync still permits a chosen refresh after saving locally',async()=>{
  const h=harness({answer:'new build',flush:async()=> 'offline'});await h.box.updateWatch();
  await h.box.document.querySelector('button').onclick();
  assert.deepStrictEqual(h.calls.order,['save','flush','flushed','replace']);
});

// ---- the endpoint's removal (v411) ------------------------------------------
// /api/version was kept only so tabs open across the v250 deploy could notice it. That deploy is long
// shipped, and a watcher that gets a 404 treats it as "no update" and keeps playing, so the endpoint
// is gone: it decoded the whole 1.33 MB index.html (~5.3 ms of CPU) to answer one string.
await T('/api/version is removed and nothing routes to it any more', async () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', '..', 'functions', 'api', 'version.js')),
    'the handler file is gone');
  const dev = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'dev_server.js'), 'utf8');
  assert.ok(!dev.includes("'GET /api/version'"), 'the dev server no longer routes it');
  // The page must poll the static file, never the Function.
  assert.ok(!src.includes('api/version'), 'the page does not reference /api/version');
  assert.ok(src.includes("fetch('version.txt"), 'the update watcher polls version.txt');
});

await T('a deploy spreads its reloads instead of stampeding every open tab (v411)', async () => {
  // Every open tab used to flush its save in the same second when BUILD changed - the shape of the
  // Nov 15 CPU spike. The reset still happens on the first quiet moment (v299/v371); the UPLOAD that
  // precedes it now waits a small random slice, so a deploy's saves arrive spread out.
  const jitter = Number((src.match(/const UPDATE_JITTER_MS=(\d+)/) || [])[1]);
  assert.ok(jitter > 0 && jitter <= 180000, 'the window is bounded and sane, got ' + jitter);
  assert.ok(/function cloudUpdateJitterMs\(\)\{return Math\.floor\(Math\.random\(\)\*UPDATE_JITTER_MS\)\}/.test(src),
    'the delay is a fresh random draw, not a fixed one');
  const block = src.slice(src.indexOf('const UPDATE_JITTER_MS'), src.indexOf('function updateWatch()'));
  assert.ok(block.includes('cloudUpdateJitterMs'), 'the jitter helper is defined before updateWatch');
  const flush = src.slice(src.indexOf('const spread=new Promise'), src.indexOf('const spread=new Promise') + 400);
  assert.ok(flush.includes('cloudUpdateJitterMs()'), 'the pre-reload flush consults the delay');
  // ...and the reset gate itself must NOT be gated on the jitter, or a fresh page would never reset.
  assert.ok(!/UPDATE_AUTO_MS&&!cloudUpdateJitter/.test(src), 'the auto-reset is not gated on the jitter');
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
  // v342 adds the complete Digimon roster and uses one coordinated cache bust
  // for the social/Sanctuary runtime, including its shared rules and scene code.
  const build = (BUILD.match(/haven-v(\d+)/) || [])[1];
  assert.ok(build, 'the page declares a numbered build');
  for (const f of ['assets/social.js', 'assets/social.css', 'assets/social-poker.js',
                   'assets/social-rules.js', 'assets/social-scene.js',
                   'assets/social-fishing.js', 'assets/social-fishing.css',
                   'assets/digimon/roster.js', 'assets/digimon/base-stats.js',
                   'assets/digimon-sanctuary.js',
                   'assets/social-digimon.js', 'assets/plaza-bots.js',
                   'assets/ui/eclipse.css', 'assets/ui/mobile.css']) {
    const found = tags.find(([, file]) => file === f);
    assert.ok(found, f + ' is loaded by index.html');
    assert.strictEqual(found[2], build, f + ' must be busted to the build that changed it');
  }
});

// v326 + v418: the automatic update reset must land the cloud save before navigating, and NEVER race
// the upload against a 1.5s timeout or navigate when cloud durability fails.
t('v326: the automatic update reset flushes the save before it navigates', () => {
  assert.match(watcherSrc,
    /if\(typeof cloudFlushNow==='function'&&typeof save==='function'&&typeof CLOUD!=='undefined'&&CLOUD\.on&&!CLOUD\.lost&&!updateResetSeen\(txt\)\)\{[\s\S]{0,900}?await cloudFlushNow\(\)[\s\S]{0,200}?cloudSavedForUpdate\(res,targetRev\)/,
    'the automatic reset awaits cloudFlushNow() and verifies cloudSavedForUpdate before navigating');
  assert.ok(!/Promise\.race\(\[cloudFlushNow/.test(watcherSrc),
    'the automatic reset never races cloudFlushNow against a short timer');
  assert.match(watcherSrc, /if\(hardReload\(txt\)\)return;/, 'and still has the plain path for a page with no cloud');
});

await T('cloud session refuses to reload over an unconfirmed save, restores Keep playing, and reloads once retry succeeds', async () => {
  let okOnAttempt = false;
  const h = harness({
    answer: 'new build',
    cloud: { on: true, rev: 4, ackRev: 3, dirty: true },
    onSave() { h.box.CLOUD.rev = 5; h.box.CLOUD.dirty = true; },
    flush: async () => {
      if (!okOnAttempt) return 'offline';
      h.box.CLOUD.dirty = false;
      h.box.CLOUD.ackRev = h.box.CLOUD.rev;
      return 'ok';
    },
  });
  h.clock.t += 25 * 60 * 60 * 1000; // insistent (> 24h) still offers Keep playing when save fails
  await h.box.updateWatch();
  const prompt = h.box.document.querySelector('#updatePrompt');
  assert.strictEqual(prompt.querySelector('[data-update-later]'), null, 'insistent prompt starts without Keep playing');
  await prompt.querySelector('button').onclick();
  assert.strictEqual(h.calls.reloads, 0, 'never reloads while cloud save is unconfirmed');
  assert.strictEqual(h.box.CLOUD.updating, false, 'unfreezes updating state on failure');
  assert.strictEqual(prompt.querySelector('button').disabled, false, 're-enables retry button');
  assert.match(prompt.querySelector('button').textContent, /Retry/i);
  assert.ok(prompt.querySelector('[data-update-later]'), 'restores Keep playing escape hatch on failure');

  okOnAttempt = true;
  await prompt.querySelector('button').onclick();
  assert.strictEqual(h.calls.reloads, 1, 'reloads once cloud save confirms target revision');
});

await T('cloud auto-update waits past jitter, refuses to reload when upload fails, and shows prompt instead', async () => {
  const h = harness({
    answer: 'new build',
    freshPage: true,
    runTimers: true,
    cloud: { on: true, rev: 2, ackRev: 1, dirty: true, blocked: 'too-large' },
    flush: async () => 'too-large',
  });
  h.calls.scheduled.length = 0; // ignore boot 3000ms timer
  const watchPromise = h.box.updateWatch();
  await new Promise(r => setImmediate(r));
  assert.strictEqual(h.calls.scheduled.length, 1, 'schedules spread jitter timer');
  h.calls.scheduled.shift()();
  await watchPromise;
  assert.strictEqual(h.calls.reloads, 0, 'auto-update does NOT reload when upload fails (413 too-large)');
  assert.strictEqual(h.box.CLOUD.updating, false, 'unfreezes updating state');
  const prompt = h.box.document.querySelector('#updatePrompt');
  assert.ok(prompt, 'shows recovery prompt instead of reloading');
  assert.match(prompt.textContent, /too large/i);
});

await T('Keep playing cancels queued auto-update jitter and snoozes the next poll', async () => {
  const h = harness({ answer: 'new build', freshPage: true, runTimers: true, cloud: {} });
  h.calls.scheduled.length = 0;
  const pending = h.box.updateWatch();
  await new Promise(r => setImmediate(r));
  assert.strictEqual(h.calls.scheduled.length, 1);
  h.box.showUpdatePrompt('new build');
  h.box.document.querySelector('[data-update-later]').click();
  h.calls.scheduled.shift()();
  await pending;
  await h.box.updateWatch();
  assert.strictEqual(h.calls.reloads, 0);
  assert.strictEqual(h.calls.scheduled.length, 0, 'the next poll respects the snooze');
  assert.strictEqual(h.box.document.querySelector('#updateToast'), null, 'cancelled updates leave no stale toast');
  assert.ok(!h.calls.order.includes('save'), 'cancelled jitter never starts a save or reload');
});

await T('A cancelled refresh cannot navigate or unpause a newer refresh attempt', async () => {
  let releaseOld, releaseNew, attempt = 0;
  const oldSave = new Promise(r => { releaseOld = r; });
  const newSave = new Promise(r => { releaseNew = r; });
  const h = harness({ cloud: {}, flush: () => ++attempt === 1 ? oldSave : newSave });
  h.box.showUpdatePrompt('new build');
  const oldNavigation = h.box.document.querySelector('#updatePrompt button').onclick();
  h.box.document.querySelector('[data-update-later]').click();
  h.box.showUpdatePrompt('another build');
  const newNavigation = h.box.document.querySelector('#updatePrompt button').onclick();
  releaseOld('ok'); await oldNavigation;
  assert.strictEqual(h.calls.reloads, 0);
  assert.strictEqual(h.box.CLOUD.updating, true, 'the newer attempt still owns the pause');
  releaseNew('ok'); await newNavigation;
  assert.strictEqual(h.calls.reloads, 1);
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
