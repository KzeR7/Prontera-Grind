// Background music: per-map tracks, the PC track player widget, and persisted preferences.
//   node tools/tests/bgm_sim.js
//
// The rules being tested:
//   * every map 0-11 plus the login screen carries the exact YouTube track that was configured
//     (Astral Citadel and Thor Volcano included);
//   * map BGM is the default: entering a map plays that map's track, and travel switches tracks;
//   * the PC player widget (parked under the HP box) starts minimized and only reveals the
//     song list when its ▾ button is pressed;
//   * the song list offers every added track, plus an Auto · map BGM row;
//   * picking a song marks it hand-picked and prev/next then circulate through the whole
//     library (wrapping at both ends) instead of just the map's tracks;
//   * Auto · map BGM really hands control back to per-map switching - the map's own track
//     resumes, not whatever was playing;
//   * picking a song while BGM is off turns BGM back on;
//   * YouTube playback only starts after the player's own onReady - an earlier request waits as
//     the pending video and plays when the player is ready (it is never dropped);
//   * volume, mute and on/off preferences persist with the save and load back - through the
//     global `S` binding (`let S` in index.html is never `window.S`, so a window.S guard would
//     silently disable persistence in the browser);
//   * phones never get the widget (hidden by CSS) and the page wires playLogin + travel syncs.
//
// This drives the REAL assets/bgm-tracks.js and assets/bgm.js in a vm with a fake document and
// a fake YouTube API, so the assertions read the same code the browser runs.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = __dirname + '/../../';
const tracksSrc = fs.readFileSync(path + 'assets/bgm-tracks.js', 'utf8');
const bgmSrc = fs.readFileSync(path + 'assets/bgm.js', 'utf8');
const indexSrc = fs.readFileSync(path + 'index.html', 'utf8');
const cssSrc = fs.readFileSync(path + 'assets/ui/eclipse.css', 'utf8');

// ---- fake DOM: one root for #bgmPlayer, memoized stubs for everything renderUI touches ----
function makeEl(tag) {
  const el = {
    tag, hidden: false, innerHTML: '', textContent: '', title: '', value: '', style: {},
    attrs: {}, listeners: {}, children: [], _q: {},
    classList: {
      _s: new Set(),
      toggle(c, on) { const s = el.classList._s; if (on === undefined) on = !s.has(c); on ? s.add(c) : s.delete(c); return on; },
      add(c) { el.classList._s.add(c); },
      remove(c) { el.classList._s.delete(c); },
      contains(c) { return el.classList._s.has(c); }
    },
    addEventListener(k, f) { (el.listeners[k] = el.listeners[k] || []).push(f); },
    dispatch(k, ev) { (el.listeners[k] || []).forEach(f => f(ev || { target: el })); },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    hasAttribute(k) { return k in el.attrs; },
    removeAttribute(k) { delete el.attrs[k]; },
    appendChild(c) { el.children.push(c); return c; },
    querySelector(sel) { return el._q[sel] || (el._q[sel] = makeEl(sel)); },
    querySelectorAll() { return []; },
    closest() { return null; }
  };
  return el;
}
const root = makeEl('bgmPlayer');
const document = {
  readyState: 'complete',
  hidden: false,
  body: makeEl('body'),
  head: makeEl('head'),
  getElementById(id) { return id === 'bgmPlayer' ? root : null; },
  createElement(t) { return makeEl(t); },
  addEventListener() {}
};
function FakeAudio() { this.listeners = {}; this.volume = 1; FakeAudio.last = this; }
FakeAudio.prototype.addEventListener = function (k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); };
FakeAudio.prototype.pause = function () {};
FakeAudio.prototype.removeAttribute = function () {};
FakeAudio.prototype.load = function () {};
FakeAudio.prototype.play = function () { return { catch() {} }; };

// fake YouTube API: remembers every video the game asks for. Like the real player, it rejects
// loadVideoById/playVideo until the player's own onReady has fired - the sim calls _fireReady.
const yt = { loaded: null, played: 0, stopped: 0, vol: null };
function FakeYTPlayer(container, opts) {
  this.opts = opts || {};
  this.ready = false;
  FakeYTPlayer.last = this;
  this.loadVideoById = (v) => {
    if (!this.ready) throw new Error('loadVideoById called before onReady');
    yt.loaded = String(v);
  };
  this.playVideo = () => { if (!this.ready) throw new Error('playVideo called before onReady'); yt.played++; };
  this.stopVideo = () => { yt.stopped++; };
  this.setVolume = (v) => { yt.vol = v; };
  this.mute = () => {};
  this.unMute = () => {};
  this._fireReady = () => {
    this.ready = true;
    if (this.opts.events && this.opts.events.onReady) this.opts.events.onReady({ target: this });
  };
}
const ytReadyNow = () => FakeYTPlayer.last._fireReady();

const sandbox = {
  console, document, Audio: FakeAudio,
  save: () => { sandbox.saved = (sandbox.saved || 0) + 1; },
  YT: { Player: FakeYTPlayer, PlayerState: { ENDED: -1 } }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
// index.html declares the save object with `let` (a lexical binding, NOT window.S) - mirror that
// exactly so prefs code that wrongly checks window.S fails here the way it fails in the browser.
vm.runInContext('let S = {};', sandbox, { filename: 's-binding.js' });
const ev = (code) => vm.runInContext(code, sandbox);
vm.runInContext(tracksSrc, sandbox, { filename: 'bgm-tracks.js' });
vm.runInContext(bgmSrc, sandbox, { filename: 'bgm.js' });
const BGM = sandbox.window.BGM;

const vid = (key) => {
  const tr = sandbox.window.BGM_TRACKS[key][0];
  return tr.id.match(/(?:v=)([A-Za-z0-9_-]{6,})/)[1];
};
const EXPECTED = {
  0: '2DuvYC3zENI', 1: 'Jqv3No98j5M', 2: 'yWgf7p3_z8w', 3: '3-mLZN830y8',
  4: '_DWTntfXPlg', 5: 'eijPrEo-ZQI', 6: 'PlgohSf1o48', 7: 'aDkdyEWQY3U',
  8: '-vEVg6zp14k', 9: 'Xl0OTsaAeSw', 10: 'QUJCM1Rv31k', 11: 'qka7yFiJv3o',
  login: 'a9OdzOz-9-I'
};

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); passed++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); failed++; }
}
// click helper: feed the widget's real click handler with a fake button
const click = (attrs) => {
  const btn = { hasAttribute: k => k in attrs, getAttribute: k => k in attrs ? attrs[k] : null };
  root.dispatch('click', { target: { closest: () => btn } });
};

console.log('bgm: per-map tracks, the PC player widget and saved preferences\n');

test('every map plus the login screen carries its exact configured track', () => {
  for (const k of Object.keys(EXPECTED)) {
    assert.equal(vid(k), EXPECTED[k], 'map ' + k + ' track changed');
  }
  // the two bonus selections players can pick by hand
  assert.equal(vid('extras'), 'pcqhSMT0jZk', 'Theme of Gonryun');
  assert.equal(sandbox.window.BGM_TRACKS.extras[1].id.match(/v=([A-Za-z0-9_-]{6,})/)[1], 'D30M_vLMvWk', 'Theme of Prontera');
  // keys: maps 0-11 + login + extras (2 bonus selections) + the 'default' fallback playlist
  assert.equal(Object.keys(sandbox.window.BGM_TRACKS).length, 15);
  assert.ok(Array.isArray(sandbox.window.BGM_TRACKS.default), 'fallback playlist exists');
});

test('playback waits for the player onReady; pending requests are never lost', () => {
  BGM.setEnabled(true);
  BGM.playLogin();
  assert.equal(yt.loaded, null, 'no player calls before onReady');
  assert.equal(BGM.ytPendingVideo, EXPECTED.login, 'the first request waits for the player');
  click({ 'data-bgm-i': '1' }); // a hand-pick before ready just replaces the pending request
  assert.equal(yt.loaded, null, 'still no player calls before onReady');
  assert.equal(BGM.ytPendingVideo, EXPECTED[1], 'the latest request wins');
  BGM.setAutoMode();
  assert.equal(BGM.ytPendingVideo, EXPECTED.login, 'map BGM takes the pending slot back');
  ytReadyNow();
  assert.equal(yt.loaded, EXPECTED.login, 'onReady flushes the pending request and plays');
  assert.equal(BGM.ytPendingVideo, null);
});

test('map BGM is the default: entering maps plays their tracks, travel switches', () => {
  BGM.setEnabled(true);
  BGM.playLogin();
  assert.equal(yt.loaded, EXPECTED.login, 'login screen plays its track');
  BGM.sync(3);
  assert.equal(yt.loaded, EXPECTED[3], 'Morroc');
  assert.equal(BGM.currentTitle(), 'Morroc');
  BGM.sync(11);
  assert.equal(yt.loaded, EXPECTED[11], 'Thor Volcano');
  assert.equal(BGM.currentTitle(), 'Thor Volcano');
  BGM.sync(10);
  assert.equal(yt.loaded, EXPECTED[10], 'Astral Citadel');
  assert.equal(BGM.currentTitle(), 'Astral Citadel');
  assert.equal(BGM.mode, 'map');
});

test('the widget builds minimized, showing what plays, with the list hidden until pressed', () => {
  assert.equal(root.hidden, false, 'widget mounts');
  assert.equal(root.querySelector('#bgmPlayerBody').hidden, true, 'list starts collapsed');
  assert.equal(root.querySelector('[data-bgm=expand]').getAttribute('aria-expanded'), 'false');
  assert.match(root.querySelector('.bgm-now').textContent, /Astral Citadel/);
  assert.equal(root.querySelector('.bgm-mode').textContent, 'map');
  click({ 'data-bgm': 'expand' });
  assert.equal(root.querySelector('#bgmPlayerBody').hidden, false, 'pressing opens the list');
  assert.equal(root.querySelector('[data-bgm=expand]').getAttribute('aria-expanded'), 'true');
  click({ 'data-bgm': 'expand' });
  assert.equal(root.querySelector('#bgmPlayerBody').hidden, true, 'minimize option closes it again');
});

test('the song list offers every added track and the Auto row is on by default', () => {
  click({ 'data-bgm': 'expand' });
  const rows = (root.querySelector('.bgm-list').innerHTML.match(/data-bgm-i=/g) || []).length;
  assert.equal(rows, 15, 'all 15 tracks listed');
  assert.match(root.querySelector('.bgm-list').innerHTML, /data-bgm-i="0"/);
  assert.match(root.querySelector('.bgm-list').innerHTML, /data-bgm-i="14"/);
  assert.match(root.querySelector('.bgm-list').innerHTML, /♪ Login Screen/);
  assert.match(root.querySelector('.bgm-list').innerHTML, /♪ Thor Volcano/);
  assert.match(root.querySelector('.bgm-list').innerHTML, /♪ Theme of Gonryun/);
  assert.match(root.querySelector('.bgm-list').innerHTML, /♪ Theme of Prontera/);
  assert.equal(root.querySelector('.bgm-auto').classList.contains('on'), true);
});

test('picking a song marks it hand-picked and prev/next circulate the whole library', () => {
  click({ 'data-bgm-i': '5' });
  assert.equal(BGM.mode, 'manual');
  assert.equal(yt.loaded, EXPECTED[5]);
  assert.equal(root.querySelector('.bgm-auto').classList.contains('on'), false);
  assert.equal(root.querySelector('.bgm-mode').textContent, 'picked');
  click({ 'data-bgm': 'next' });
  assert.equal(yt.loaded, EXPECTED[6], 'next walks the whole list');
  click({ 'data-bgm': 'prev' });
  click({ 'data-bgm': 'prev' });
  assert.equal(yt.loaded, EXPECTED[4], 'prev walks back past the picked one');
  click({ 'data-bgm-i': '14' });
  click({ 'data-bgm': 'next' });
  assert.equal(yt.loaded, EXPECTED[0], 'wraps from the last track to the first');
  click({ 'data-bgm-i': '0' });
  click({ 'data-bgm': 'prev' });
  assert.equal(yt.loaded, 'D30M_vLMvWk', 'wraps from the first track to the last');
});

test('travel keeps a hand-picked song playing (the player stays in control)', () => {
  click({ 'data-bgm-i': '8' });
  const before = yt.played;
  BGM.sync(1);
  BGM.sync(2);
  assert.equal(yt.loaded, EXPECTED[8], 'travel does not steal the player\'s pick');
  assert.equal(yt.played, before, 'no reload either');
});

test('Auto · map BGM hands control back and the map track really resumes', () => {
  click({ 'data-bgm': 'auto' });
  assert.equal(BGM.mode, 'map');
  assert.equal(BGM.currentTitle(), 'Geffen', 'the current map\'s own track');
  assert.equal(yt.loaded, EXPECTED[2]);
  assert.equal(root.querySelector('.bgm-auto').classList.contains('on'), true);
  BGM.sync(4);
  assert.equal(yt.loaded, EXPECTED[4], 'map switching works again');
});

test('picking a song while BGM is off turns BGM back on', () => {
  click({ 'data-bgm': 'power' });
  assert.equal(BGM.enabled, false);
  assert.match(root.querySelector('.bgm-now').textContent, /BGM off/);
  click({ 'data-bgm-i': '7' });
  assert.equal(BGM.enabled, true);
  assert.equal(yt.loaded, EXPECTED[7]);
  assert.equal(root.querySelector('[data-bgm=power]').getAttribute('aria-pressed'), 'true');
});

test('one power control resumes manual music and volume persists', () => {
  BGM.playAllIndex(3);
  click({ 'data-bgm': 'power' });
  assert.equal(BGM.enabled, false);
  click({ 'data-bgm': 'power' });
  assert.equal(BGM.enabled, true);
  assert.equal(yt.loaded, EXPECTED[3]);
  assert.equal(BGM.currentTrack, BGM.allTracks()[3].track);
  BGM.setVolume(.05);
  assert.equal(yt.vol, 5);
  assert.equal(ev('S.bgm.volume'), .05);
  BGM.volume=.9; BGM.loadPrefs(); assert.equal(BGM.volume,.05);
  assert.ok(!root.innerHTML.includes('data-bgm="mute"'));
});
test('legacy mute becomes off and can be turned back on', () => {
  ev('S.bgm={enabled:true,muted:true,volume:.2}');
  BGM.loadPrefs(); assert.equal(BGM.enabled,false);
  BGM.setEnabled(true); assert.equal(BGM.enabled,true);
  assert.equal(ev('S.bgm.muted'),false);
});
test('shuffle skips the current track and auto restores map mode', () => {
  const before=BGM.currentTrack;
  click({'data-bgm':'shuffle'});
  assert.equal(BGM.shuffle,true); assert.notEqual(BGM.currentTrack,before);
  const next=BGM.currentTrack; BGM.next(); assert.notEqual(BGM.currentTrack,next);
  click({'data-bgm':'auto'}); assert.equal(BGM.shuffle,false); assert.equal(BGM.mode,'map');
  assert.match(cssSrc,/\.bgm-player-body\[hidden\]\{display:none!important\}/);
});

test('phones keep plain autoplay: the widget is CSS-hidden and the page wires the hooks', () => {
  assert.match(cssSrc, /@media \(max-width:900px\),\(pointer:coarse\)\{#bgmPlayer\{display:none!important\}\}/);
  assert.match(cssSrc, /#bgmPlayer\{position:absolute;left:max\(8px,env\(safe-area-inset-left\)\);top:179px/, 'sits under the HP box');
  assert.match(cssSrc, /body\.clean-screen #bgmPlayer\{visibility:hidden\}/);
  assert.match(indexSrc, /<section id="bgmPlayer" hidden/);
  assert.match(indexSrc, /assets\/bgm-tracks\.js/);
  assert.match(indexSrc, /assets\/bgm\.js/);
  assert.match(indexSrc, /BGM\.playLogin\(\)/, 'login screen music starts');
  assert.ok((indexSrc.match(/BGM\.sync\(S\.mp\)/g) || []).length >= 2, 'travel and auto-advance resync');
  assert.match(indexSrc, /data-a="bgm"/, 'settings controls present');
  assert.ok(!/window\.S\b/.test(bgmSrc), 'prefs use the global S binding (S is `let`, never window.S)');
  assert.match(bgmSrc, /typeof S !== 'undefined'/);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
