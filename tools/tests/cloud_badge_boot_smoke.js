// v282: the cloud badge, in the real page, driven by a real push.
//   node tools/tests/cloud_badge_boot_smoke.js
//
// Needs the same packages as the other boot smokes:
//     npm i --no-save jsdom three@0.128.0
// Without them it prints a skip line and exits 0.
//
// The report was "☁ … always shows while playing, rarely ☁ ✓". This boots index.html, signs in against
// a stub API, pushes a save, and then KEEPS PLAYING - the case that used to wipe the tick after a
// single frame.
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('cloud badge boot: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (!threePath) { console.log('cloud badge boot: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0); }
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
    window.URL.createObjectURL = () => 'blob:x';
    window.eval(three);
    window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
      this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
      this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
    for (const f of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js'])
      window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  },
});
const w = dom.window, ev = c => w.eval(c);
const badge = () => {
  const el = w.document.getElementById('cloudBadge');
  return { text: el ? el.textContent : null, title: el ? el.title : null };
};
const check = [];
const t = (name, fn) => { try { fn(); check.push(['ok', name]); } catch (e) { check.push(['FAIL', name + ' -> ' + (e && e.message)]); } };
const T = async (name, fn) => { try { await fn(); check.push(['ok', name]); } catch (e) { check.push(['FAIL', name + ' -> ' + (e && e.message)]); } };
console.log('cloud badge boot: the real header badge, with a real push\n');

(async () => {
  // A stub API that always accepts a save, so cloudPush() takes its success path.
  ev(`
    window.__pushes=0;
    window.fetch=(u,init)=>{
      const url=String(u);
      if(/\\/save$/.test(url)&&(init&&init.method)==='PUT'){window.__pushes++;
        return Promise.resolve({status:200,ok:true,headers:{get:()=>'application/json'},
          json:()=>Promise.resolve({version:5,leaderboardPending:false})})}
      if(/\\/me$/.test(url))return Promise.resolve({status:200,ok:true,headers:{get:()=>'application/json'},
        json:()=>Promise.resolve({u:'badge',id:12,gm:0,recoverySet:false})});
      return Promise.resolve({status:200,ok:true,headers:{get:()=>'application/json'},json:()=>Promise.resolve({})});
    };
  `);
  ev(`currentUser='badge';CLOUD.on=true;CLOUD.api=true;CLOUD.user='badge';CLOUD.id=12;S===null;initSession(false);`);

  await T('after a push the badge shows the tick AND the time it landed', async () => {
    await ev('cloudPush(true)');
    const b = badge();
    assert.match(b.text, /^☁ ✓ \d{2}:\d{2}$/, 'the badge reads "☁ ✓ 14:32", got: ' + JSON.stringify(b.text));
    assert.match(b.title, /On your account since \d{2}:\d{2}/, 'the tooltip says when, in words: ' + b.title);
  });

  await T('playing on afterwards does NOT wipe it - this is the reported bug', async () => {
    const before = badge().text;
    // a burst of saves, the way the game writes them many times a second
    for (let i = 0; i < 300; i++) ev('save()');
    const after = badge().text;
    assert.strictEqual(after, before, 'the badge is unchanged by 300 saves: ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after));
    assert.match(after, /^☁ ✓ /, 'and it still reads as saved');
  });

  await T('a push that fails says the save is NOT up there yet', async () => {
    ev(`window.fetch=(u,init)=>(init&&init.method)==='PUT'
      ? Promise.reject(new Error('network down'))
      : Promise.resolve({status:200,ok:true,headers:{get:()=>'application/json'},json:()=>Promise.resolve({})});`);
    await ev('cloudPush(true)');
    const b = badge();
    assert.match(b.text, /☁ (✕|⚠)/, 'the badge stops claiming the save is on the server: ' + JSON.stringify(b.text));
  });

  await T('and a later successful push restores the tick with a fresh time', async () => {
    ev(`window.fetch=(u,init)=>(init&&init.method)==='PUT'
      ? Promise.resolve({status:200,ok:true,headers:{get:()=>'application/json'},json:()=>Promise.resolve({version:9,leaderboardPending:false})})
      : Promise.resolve({status:200,ok:true,headers:{get:()=>'application/json'},json:()=>Promise.resolve({})});`);
    ev('CLOUD.lost=false;CLOUD.offline=false;CLOUD.paused=false;');
    await ev('cloudPush(true)');
    assert.match(badge().text, /^☁ ✓ \d{2}:\d{2}$/, 'the tick and time are back: ' + JSON.stringify(badge().text));
  });

  let pass = 0, fail = 0;
  for (const [st, name] of check) { console.log('  ' + (st === 'ok' ? 'ok   ' : 'FAIL ') + name); st === 'ok' ? pass++ : fail++; }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  w.close();
  process.exit(fail ? 1 : 0);
})();
