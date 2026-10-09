// The save-owner stamp (v88.6) in the REAL page: index.html booted in jsdom, logged in through its own
// login form, the way a player does it. Needs the same two packages as field_loop_smoke.js:
//
//     npm i --no-save jsdom three@0.128.0
//
// Without them the file prints a skip line and exits 0, so a clean checkout is never blocked by it.
//   node tools/tests/save_owner_boot_smoke.js
//
// What it proves, which the sim suites cannot: the login card refuses a save stamped for another
// account (nothing starts, nothing is written, the card says whose it is), a save stamped for this
// account and an older unstamped save both log in, and a live save cannot overwrite another account's
// slot once the game is running.
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('save owner boot: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (!threePath) { console.log('save owner boot: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0); }
const three = fs.readFileSync(threePath, 'utf8');

// A canvas that does nothing, as in field_loop_smoke.js: the page draws, the tests only read state.
function makeCtx() {
  const o = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {},
    setTransform() {}, resetTransform() {}, translate() {}, scale() {}, rotate() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}, measureText: () => ({ width: 8 }), fillText() {}, strokeText() {},
    createPattern: () => null, drawFocusIfNeeded() {},
  };
  return new Proxy(o, { get(t, k) { return k in t ? t[k] : () => {}; } });
}

function boot() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: false,
    beforeParse(window) {
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { value: function () { return makeCtx(); } });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', { value: () => 'data:image/png;base64,' });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return 1200; } });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return 800; } });
      window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }; };
      window.Element.prototype.setPointerCapture = function () {};
      window.requestAnimationFrame = cb => { window.__raf = cb; return 1; };
      window.cancelAnimationFrame = () => {};
      window.fetch = () => Promise.reject(new Error('offline'));   // no API: the page runs as a local-only browser
      window.URL.createObjectURL = () => 'blob:x';
      window.eval(three);
      window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
        this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
        this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
      for (const f of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js'])
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    },
  });
  return dom.window;
}

// The login form, submitted the way a click on Login submits it.
function login(window, user, pass) {
  const doc = window.document;
  doc.getElementById('username').value = user;
  doc.getElementById('password').value = pass;
  doc.getElementById('loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

const check = [];
const t = (name, fn) => { try { fn(); check.push(['ok', name]); } catch (e) { check.push(['FAIL', name + ' -> ' + (e && e.message)]); } };
console.log('save owner boot: the real login card and the live save, in jsdom\n');

const window = boot();
const ev = code => window.eval(code);
const ls = window.localStorage;
const alicePass = 'alice-password-1';
ls.setItem('pg_acc4', JSON.stringify({ Alice: window.hashPw(alicePass) }));   // the account this browser holds
const bobSave = JSON.stringify({ owner: 'Bob', lv: 77, cls: 'Knight', zeny: 5, kills: 9, st: { str: 1 }, q: [] });

// ---- 1. another account's save on this browser: the card refuses, nothing starts, nothing is written
t('a save stamped for another account blocks the login: the card says whose it is, nothing starts, nothing is written', () => {
  ls.setItem('pg_save3_Alice', bobSave);
  login(window, 'Alice', alicePass);
  assert.notStrictEqual(ev(`$('loginOverlay').style.display`), 'none', 'the game stays on the login card');
  assert.match(ev(`$('loginErr').textContent`), /belongs to “Bob”/, 'the card names the other account');
  assert.strictEqual(ev('S === null'), true, 'no live save was loaded');
  assert.strictEqual(ev('currentUser'), null, 'and no account is left in use');
  assert.strictEqual(ls.getItem('pg_save3_Alice'), bobSave, 'the stored save is exactly as it was');
});

// ---- 2. this account's own save, stamped in another case: loads
t('a save stamped for this account (in any case) logs in, and is still this account\'s after the start-up save', () => {
  ls.setItem('pg_save3_Alice', JSON.stringify({ owner: 'alice', lv: 77, cls: 'Knight', zeny: 5, kills: 9, st: { str: 1 }, q: [] }));
  ev('S=null;currentUser=null');
  login(window, 'Alice', alicePass);
  assert.strictEqual(ev(`$('loginOverlay').style.display`), 'none', 'the game starts');
  assert.strictEqual(ev('S.lv'), 77, 'with this account\'s own level');
  // The page saves once as it starts (stowUnfit / offline bookkeeping), and that write stamps the account's
  // own name as the browser holds it. Same account, so the save is still this account's.
  assert.strictEqual(ev('S.owner'), 'Alice', 'and it now names the account by its own name');
  assert.strictEqual(JSON.parse(ls.getItem('pg_save3_Alice')).owner, 'Alice', 'the stored copy agrees');
});

// ---- 3. an older save with no stamp at all: logs in, and the next save stamps it
t('an older save with no stamp logs in, and the next save writes it with this account\'s stamp', () => {
  ls.setItem('pg_save3_Alice', JSON.stringify({ lv: 33, cls: 'Novice', zeny: 1, kills: 2, st: { str: 1 }, q: [] }));
  ev('S=null;currentUser=null');
  login(window, 'Alice', alicePass);
  assert.strictEqual(ev('S.lv'), 33, 'the older save loads');
  ev('save()');
  assert.strictEqual(JSON.parse(ls.getItem('pg_save3_Alice')).owner, 'Alice', 'and is stamped on the write');
});

// ---- 4. while the game is running, another account's save appears in this slot: it is not written over
t('while playing, a slot that now holds another account\'s save is never written over', () => {
  ls.setItem('pg_save3_Alice', bobSave);                 // e.g. a restore in another tab, or an edit
  ev('save()');
  ev('save()');
  assert.strictEqual(ls.getItem('pg_save3_Alice'), bobSave, 'the other account\'s save survives every autosave');
  assert.ok(ev('logs.map(l=>l.m).join("\\n")').includes('nothing was written over it'), 'and the log says so');
  assert.strictEqual(ev('S.owner'), 'Alice', 'the live game is still this account\'s');
});

// ---- 5. the GM local login is covered by the same card: its slot is checked the same way
t('the saved-game check sits in the login path, not only in one helper', () => {
  assert.match(ev('initSession.toString()'), /saveRefusal\(/, 'initSession checks the stamp');
});

let pass = 0, fail = 0;
for (const [st, name] of check) {
  console.log('  ' + (st === 'ok' ? 'ok   ' : 'FAIL ') + name);
  st === 'ok' ? pass++ : fail++;
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
window.close();
process.exit(fail ? 1 : 0);
