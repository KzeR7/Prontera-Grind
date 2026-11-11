// v281: the real page, with the GPU taken away - the mobile whiteout, reproduced and fixed.
//   node tools/tests/render_lost_boot_smoke.js
//
// Needs the same packages as the other boot smokes:
//     npm i --no-save jsdom three@0.128.0
// Without them it prints a skip line and exits 0.
//
// This is the case the screenshot shows: a phone playing for a while, then a blank field. Two ways in,
// both covered here against the real index.html:
//
//   1. boot with a renderer that throws - before v281 that killed every statement after the
//      constructor, so the page never finished loading at all;
//   2. lose the context mid-session - before v281 the canvas simply went blank and stayed blank.
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('render lost boot: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (!threePath) { console.log('render lost boot: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0); }
const three = fs.readFileSync(threePath, 'utf8');

function makeCtx() {
  const o = { canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {},
    setTransform() {}, resetTransform() {}, translate() {}, scale() {}, rotate() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}, measureText: () => ({ width: 8 }), fillText() {}, strokeText() {},
    createPattern: () => null, drawFocusIfNeeded() {} };
  return new Proxy(o, { get(t, k) { return k in t ? t[k] : () => {}; } });
}

// `rendererMode`: 'ok'   - a renderer that builds and whose canvas can emit context events
//                 'fail' - a GPU that throws, the way a phone out of contexts does
function boot(rendererMode) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: false,
    beforeParse(window) {
      Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { value: function () { return makeCtx(); } });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', { value: () => 'data:image/png;base64,' });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return 1200; } });
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return 800; } });
      window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }; };
      window.Element.prototype.setPointerCapture = function () {};
      window.requestAnimationFrame = cb => { window.__raf = cb; return 1; };
      window.cancelAnimationFrame = () => {};
      window.fetch = () => Promise.reject(new Error('offline'));
      window.URL.createObjectURL = () => 'blob:x';
      window.eval(three);
      if (rendererMode === 'fail') {
        // every attempt throws, as when the device has no WebGL context to give
        window.eval(`THREE.WebGLRenderer=function(){throw new Error('Error creating WebGL context')}`);
      } else {
        window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
          this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
          this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
      }
      for (const f of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js'])
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    },
  });
  return dom.window;
}

const check = [];
const t = (name, fn) => { try { fn(); check.push(['ok', name]); } catch (e) { check.push(['FAIL', name + ' -> ' + (e && e.message)]); } };
console.log('render lost boot: the real page with its GPU taken away\n');

// ---------------------------------------------------------------- 1. no GPU at boot
const noGpu = boot('fail');
const ev1 = c => noGpu.eval(c);
const bootErrors = [];
noGpu.addEventListener('error', e => bootErrors.push(String(e.message)));

t('the page finishes loading when the renderer cannot be built at all', () => {
  // v281 regression: this used to throw straight out of the script, so none of these existed.
  assert.strictEqual(ev1('typeof S'), 'object', 'the game state exists');
  assert.strictEqual(ev1('typeof save'), 'function', 'saving works');
  assert.strictEqual(ev1('typeof load'), 'function', 'loading works');
  assert.strictEqual(ev1('typeof ui'), 'function', 'and the HUD can still be drawn');
  assert.strictEqual(ev1('R'), null, 'with no renderer, R is null and every caller can see it');
  assert.strictEqual(bootErrors.length, 0, 'and nothing escaped as a page error: ' + bootErrors.join(' | '));
});

t('the player is told, on the field, instead of being left looking at a blank screen', () => {
  const box = noGpu.document.getElementById('renderNotice');
  assert.ok(box, 'a notice is on the field');
  assert.match(box.textContent, /could not start the 3D view/i, 'it says what happened');
  assert.match(box.textContent, /[Rr]eload/, 'and what to do about it');
  assert.ok(noGpu.document.getElementById('view').contains(box), 'it sits inside the field box, which has a background');
});

t('the page can still be played through the parts that do not need the GPU', () => {
  // The login card is pure DOM: a phone with no GPU must still be able to sign in and save.
  assert.strictEqual(ev1('typeof initSession'), 'function');
  ev1(`currentUser='nogpu';initSession(false);S.mp=0;S.lvl=3;mapM=0;mapL=3;spawn();`);
  assert.ok(ev1('!!S'), 'a session boots');
  ev1('update(1/30);save();');
  assert.ok(ev1('S.kills>=0'), 'the sim runs and saves');
  const stored = noGpu.localStorage.getItem('pg_save3_nogpu');
  assert.ok(stored && JSON.parse(stored).owner === 'nogpu', 'and the save is written, stamped and readable');
});
noGpu.close();

// ---------------------------------------------------------------- 2. the context is lost mid-session
const live = boot('ok');
const ev2 = c => live.eval(c);
const liveErrors = [];
live.addEventListener('error', e => liveErrors.push(String(e.message)));

t('losing the context mid-session pauses the game, saves, and says so', () => {
  ev2(`currentUser='mobile';initSession(false);S.mp=0;S.lvl=3;mapM=0;mapL=3;spawn();`);
  ev2('update(1/30);save();');
  const killsBefore = ev2('S.kills');
  assert.strictEqual(ev2('gpuLost'), false, 'the game is drawing to begin with');
  // exactly what the browser does to an Android tab that went away
  const canvas = live.document.querySelector('#view canvas');
  assert.ok(canvas, 'the renderer canvas is on the field');
  const lostEvent = new live.Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lostEvent);
  assert.strictEqual(ev2('gpuLost'), true, 'the loss is noticed');
  assert.strictEqual(lostEvent.defaultPrevented, true, 'and defaulted, so the browser is allowed to restore it');
  const box = live.document.getElementById('renderNotice');
  assert.ok(box, 'the player is told');
  assert.match(box.textContent, /paused/i);
  const stored = live.localStorage.getItem('pg_save3_mobile');
  assert.ok(stored, 'and the session is saved at that moment, not left to a timer');
  assert.strictEqual(JSON.parse(stored).owner, 'mobile');
  // the loop must not keep simulating against a renderer that cannot draw
  ev2('loop(performance.now())');
  assert.ok(ev2('S.kills') >= killsBefore, 'no progress is lost while paused');
});

t('when the context comes back the notice goes and the game draws again', () => {
  const canvas = live.document.querySelector('#view canvas');
  canvas.dispatchEvent(new live.Event('webglcontextrestored'));
  assert.strictEqual(ev2('gpuLost'), false, 'the game is live again');
  assert.strictEqual(live.document.getElementById('renderNotice') === null, true, 'the notice is gone');
  assert.strictEqual(liveErrors.length, 0, 'nothing threw: ' + liveErrors.join(' | '));
});
live.close();

// ---------------------------------------------------------------- 3. v361/v363: hub-first login for every account
// v361 opened the plaza for brand-new accounts; v363 (owner: "I want all players to spawn in the
// social hub when they log in, not just new players") opens it for every login. The battle still
// starts on the first map pick, and the hub's Field button takes the same road.
const hubFirst = boot('ok');
const ev3 = c => hubFirst.eval(c);
const hubFirstErrors = [];
hubFirst.addEventListener('error', e => hubFirstErrors.push(String(e.message)));
t('a brand-new account enters the hub first and starts the battle from the first map pick', () => {
  // PGSocial is eval'd separately by the page in a real browser; a stub keeps this smoke
  // about the index.html wiring, not the hub itself.
  ev3(`window.PGSocial={enter(){window.__hubEnters=(window.__hubEnters||0)+1}};window.__guideRuns=0;
       const realGuide=typeof maybeGuide==='function'?maybeGuide:null;
       if(realGuide){window.maybeGuide=function(){window.__guideRuns++}}`);
  ev3(`currentUser='newbie';initSession(false,true);`);
  assert.strictEqual(ev3('hubFirstPending'), true, 'the hub-first flag is pending after login');
  assert.strictEqual(ev3('(window.__hubEnters||0)'), 1, 'the hub was entered');
  assert.strictEqual(ev3('respawn'), 1e9, 'v388: field combat stays off in the plaza');
  assert.strictEqual(hubFirst.document.body.classList.contains('social-open'), true, 'the plaza covers the field before the login card drops');
  assert.strictEqual(hubFirst.document.getElementById('loginOverlay').style.display, 'none', 'the login card is gone');
  // the first map pick releases the held-back battle and runs the beginner guide there
  ev3('gotoField(0,1)');
  assert.strictEqual(ev3('hubFirstPending'), false, 'the map pick clears the flag');
  assert.strictEqual(ev3('respawn') < 1e9, true, 'spawning is released');
  assert.strictEqual(ev3('(window.__guideRuns||0)'), 1, 'the guide runs on the first field render');
});
t('v363: a returning account logs into the hub too, then goes straight back to its field', () => {
  const enters = ev3('(window.__hubEnters||0)');
  ev3(`currentUser='veteran';window.__guideRuns=0;initSession(false);`);
  assert.strictEqual(ev3('(window.__hubEnters||0)'), enters + 1, 'the hub is entered for a returning account');
  assert.strictEqual(ev3('hubFirstPending'), true, 'hub-first is pending');
  assert.strictEqual(ev3('respawn'), 1e9, 'v388: field combat stays off in the plaza');
  assert.strictEqual(ev3('(window.__guideRuns||0)'), 0, 'the beginner guide still waits for the field');
  // the saved map and level are what the Field button (and the first map pick) resume
  ev3(`S.mp=3;S.lvl=4;gotoField(S.mp,S.lvl);`);
  assert.strictEqual(ev3('hubFirstPending'), false, 'leaving for the field clears the flag');
  assert.strictEqual(ev3('respawn') < 1e9, true, 'and releases spawning');
  assert.strictEqual(ev3('S.mp'), 3, 'on the account\'s own map, not a fresh one');
  assert.strictEqual(ev3('(window.__guideRuns||0)'), 1, 'the first field render runs the guide check');
  assert.strictEqual(hubFirstErrors.length, 0, 'nothing threw: ' + hubFirstErrors.join(' | '));
});
hubFirst.close();

let pass = 0, fail = 0;
for (const [st, name] of check) {
  console.log('  ' + (st === 'ok' ? 'ok   ' : 'FAIL ') + name);
  st === 'ok' ? pass++ : fail++;
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
