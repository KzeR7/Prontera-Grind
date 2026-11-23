// Display → UI scale (100 / 115 / 130 / 90%, plus Auto): the chrome zoom must never move a
// centred panel. v467 shipped `html[data-ui-scale] #wins{left:...}` on top of the base rule
// `#wins{left:50%;transform:translateX(-50%)}`, so at 115% the Dungeons window was pulled
// half a window off the left edge. This suite pins the two halves of the contract:
//   * CSS: everything the scale block touches stays inside the scale scope, keeps its
//     centring, and divides any vw/vh ceiling back out of the zoom.
//   * JS:  the four steps clamp, Auto reads the display, and the save keeps the choice.
//   node tools/tests/ui_scale_sim.js
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/ui/eclipse.css'), 'utf8');

let pass = 0, fail = 0, pending = Promise.resolve();
const test = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message)); fail++; }
};
const testAsync = (name, fn) => {
  pending = pending.then(async () => {
    try { await fn(); console.log('  ok   ' + name); pass++; }
    catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message)); fail++; }
  });
};

/* ── a very small CSS reader: top-level rules with their at-rule context ── */
function closeOf(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (!depth) return i; }
  }
  return text.length;
}
function rules(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const walk = (body, at) => {
    let i = 0;
    while (i < body.length) {
      const open = body.indexOf('{', i);
      if (open < 0) break;
      const head = body.slice(i, open).trim();
      const close = closeOf(body, open);
      const inner = body.slice(open + 1, close);
      if (head.startsWith('@media') || head.startsWith('@container') || head.startsWith('@supports')) walk(inner, at.concat(head));
      else if (!head.startsWith('@')) {
        out.push({ at, sel: head, decl: inner, raw: head + '{' + inner + '}' });
      }
      i = close + 1;
    }
  };
  walk(clean, []);
  return out;
}
const ALL = rules(css);
const SCALED = r => /html\[data-ui-scale\]/.test(r.sel);
const bodies = ALL.filter(r => !SCALED(r) && !r.at.some(a => a.includes('data-ui-scale')));
const scaled = ALL.filter(SCALED);
const declOf = (r, prop) => {
  const m = new RegExp('(?:^|;)\\s*' + prop.replace(/[-]/g, '\\-') + '\\s*:([^;]*)').exec(r.decl);
  return m ? m[1].trim() : null;
};
const idsIn = sel => (sel.match(/#[A-Za-z][\w-]*/g) || []);

/* ── CSS contract ── */
test('the scale block exists and is scoped to html[data-ui-scale]', () => {
  assert.ok(scaled.length >= 4, 'expected the v467 scale rules, found ' + scaled.length);
  for (const r of scaled) assert.ok(/^html\[data-ui-scale\]\s/.test(r.sel), 'unscoped scale rule leaks at 100%: ' + r.sel);
  assert.ok(scaled.every(r => r.at.length === 0 || r.at.every(a => /data-ui-scale/.test(a) || a.startsWith('@media') || a.startsWith('@container'))),
    'scale rules must stay out of media queries that could re-open them');
});

test('the zoom rule covers the chrome roots and leaves the WebGL layers alone', () => {
  const zoom = scaled.find(r => declOf(r, 'zoom'));
  assert.ok(zoom, 'no zoom rule in the scale block');
  assert.match(declOf(zoom, 'zoom'), /var\(--ui-scale/);
  const covered = new Set((zoom.sel.match(/#[A-Za-z][\w-]*/g) || []));
  for (const id of ['#eclipseHeader', '#dock', '#sideRail', '#hud', '#feedWrap', '#wins', '#screenOptions',
    '#raidHud', '#raidLobby', '#modal', '#trial', '#mailDailyModal', '#gmStudioModal', '#adventureGuide'])
    assert.ok(covered.has(id), 'chrome root not zoomed: ' + id);
  // The field, the sprite layers and the floats are positioned in field pixels; zooming their
  // boxes slides that art off its anchor.
  for (const id of ['#stage', '#field', '#floats', '#fx', '#pgFloatLayer', '#actorLayer'])
    assert.ok(!covered.has(id), 'world-space layer must not be zoomed: ' + id);
});

test('a scaled rule never re-anchors a transform-centred panel', () => {
  // base rules that centre with left:50% + translateX(-50%) - the pattern #wins and #dock use
  const centred = new Set();
  for (const r of bodies) {
    const tx = declOf(r, 'transform') || '';
    if (!/translateX\(\s*-?50%/.test(tx)) continue;
    for (const id of idsIn(r.sel)) centred.add(id);
  }
  assert.ok(centred.has('#wins'), 'base #wins centring (translateX(-50%)) disappeared');
  assert.ok(centred.has('#dock'), 'base #dock centring (translateX(-50%)) disappeared');
  for (const r of scaled) {
    for (const prop of ['left', 'right', 'transform']) {
      if (!declOf(r, prop)) continue;
      for (const id of idsIn(r.sel)) {
        assert.ok(!centred.has(id),
          'html[data-ui-scale] ' + r.sel + ' sets ' + prop + ', but ' + id + ' is centred with translateX(-50%) '
          + 'in its base rule: under zoom the halved inset and the halved transform are both scaled, '
          + 'so the panel lands half a window off-centre. Change the base rule instead.');
      }
    }
  }
});

test('every vw/vh ceiling inside the zoom is divided back out', () => {
  for (const r of scaled) {
    for (const m of r.decl.matchAll(/(max-|min-)?(width|height)\s*:\s*([^;]+)/g)) {
      const val = m[3];
      if (!/\d(vw|vh|dvh|dvw)\b/.test(val)) continue;
      assert.match(val, /var\(--ui-scale/, r.sel + ' ' + m[2] + ':' + val + ' - a viewport length inside a zoomed box is measured in scaled px, divide it by var(--ui-scale)');
    }
  }
});

/* ── the live page ── */
const errors = [];
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('ui scale: CSS checks done, page checks skipped (npm i --no-save jsdom three@0.128.0)');
}
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (JSDOM && !threePath) { console.log('ui scale: page checks skipped (npm i --no-save jsdom three@0.128.0)'); JSDOM = null; }

if (JSDOM) {
  const three = fs.readFileSync(threePath, 'utf8');
  const makeCtx = () => new Proxy({
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)), width: w, height: h }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null, measureText: () => ({ width: 8 }),
  }, { get(t, k) { return k in t ? t[k] : () => {}; } });
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
      window.Element.prototype.scrollIntoView = function () {};
      window.requestAnimationFrame = cb => { window.__raf = cb; return 1; };
      window.cancelAnimationFrame = () => {};
      window.fetch = () => Promise.reject(new Error('offline'));
      window.URL.createObjectURL = () => 'blob:x';
      window.eval(three);
      window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
        this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
        this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
      for (const f of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js'])
        if (fs.existsSync(path.join(ROOT, f))) window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    },
  });
  const { window } = dom;
  window.addEventListener('error', e => errors.push(String(e.message)));
  const ev = code => window.eval(code);
  const doc = window.document;
  ev('S=fresh();S.lv=150;S.cls="Lord Knight";S.jobs[S.cls]={jl:50,jx:0};S.auto=false;ui();');

  const scaleOf = () => window.getComputedStyle(doc.documentElement).getPropertyValue('--ui-scale').trim();
  const setScreen = (w, dpr) => {
    Object.defineProperty(window.screen, 'width', { value: w, configurable: true });
    Object.defineProperty(window.screen, 'height', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
  };

  test('the four steps clamp and publish both signals', () => {
    assert.equal(ev('UI_SCALE_STEPS.join()'), '0.9,1,1.15,1.3');
    for (const z of [0.9, 1.15, 1.3]) {
      ev(`setUiScale(${z})`);
      assert.equal(doc.documentElement.getAttribute('data-ui-scale'), String(z), 'data-ui-scale for ' + z);
      assert.equal(scaleOf(), String(z), '--ui-scale for ' + z);
      assert.equal(ev('S.uiScale'), z);
      assert.equal(ev('S.uiScaleAuto'), false, 'picking a step must opt out of Auto');
    }
    // 100% drops the attribute so the scale CSS costs nothing at the default
    ev('setUiScale(1)');
    assert.equal(doc.documentElement.hasAttribute('data-ui-scale'), false);
    assert.equal(scaleOf(), '1');
    // a value that is not a step falls back to 100% instead of half-applying
    ev('setUiScale(1.7)');
    assert.equal(ev('S.uiScale'), 1);
    ev('setUiScale("nonsense")');
    assert.equal(ev('S.uiScale'), 1);
  });

  test('Auto picks the step from the physical display', () => {
    for (const [w, dpr, want] of [[1024, 1, 0.9], [1366, 1, 1], [1920, 1, 1.15], [2560, 1, 1.15], [3840, 1, 1.3], [1920, 2, 1.3], [1707, 1, 1.15], [1240, 1, 0.9]]) {
      setScreen(w, dpr);
      assert.equal(ev('autoUiScale()'), want, `${w}px @${dpr}x -> ${want}`);
    }
    // the phone shell is already laid out in px for a small screen
    setScreen(2560, 1);
    doc.documentElement.classList.add('pg-mobile');
    assert.equal(ev('autoUiScale()'), 1, 'phone keeps 100%');
    doc.documentElement.classList.remove('pg-mobile');
  });

  test('Auto is the default and drives the published scale', () => {
    setScreen(1920, 1);
    ev('S.uiScaleAuto=true;S.uiScale=0.9;applyUiScale();');
    assert.equal(scaleOf(), '1.15', 'Auto ignores a stale manual step');
    assert.equal(doc.documentElement.getAttribute('data-ui-scale'), '1.15');
    ev('setUiScaleAuto(false)');
    assert.equal(ev('S.uiScaleAuto'), false);
    assert.equal(scaleOf(), '0.9', 'Auto off falls back to the saved step');
    // the save normaliser: a value that is not a step loads as 100%, Auto defaults on,
    // and a deliberate step + Auto off survives the round-trip.
    const rt = ev(`(()=>{try{
      const base=Object.assign(fresh(),{lv:150,cls:'Lord Knight'});
      lsPut(saveKey(),JSON.stringify(Object.assign({},base,{uiScale:1.7,uiScaleAuto:'nonsense'})));
      const a=load();
      lsPut(saveKey(),JSON.stringify(Object.assign({},base,{uiScale:1.15,uiScaleAuto:false})));
      const b=load();
      return [a.uiScale,a.uiScaleAuto,b.uiScale,b.uiScaleAuto].join()
    }catch(e){return 'err:'+e.message}})()`);
    assert.equal(rt, '1,true,1.15,false', 'save round-trip keeps the scale (got ' + rt + ')');
  });

  test('Display renders Auto plus the four steps and marks the live one', () => {
    ev('S.uiScaleAuto=false;S.uiScale=1.15;applyUiScale();renderScreenOptions();');
    const btns = [...doc.querySelectorAll('#screenOptions [data-ui-scale-step]')];
    assert.deepEqual(btns.map(b => b.textContent.trim()), ['90%', '100%', '115%', '130%']);
    assert.equal(btns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()).join(), '115%');
    const auto = doc.querySelector('#screenOptions [data-ui-scale-auto]');
    assert.ok(auto, 'Auto button missing');
    assert.equal(auto.getAttribute('aria-pressed'), 'false');
    ev('S.uiScaleAuto=true;applyUiScale();renderScreenOptions();');
    const auto2 = doc.querySelector('#screenOptions [data-ui-scale-auto]');
    assert.equal(auto2.getAttribute('aria-pressed'), 'true');
    assert.match(auto2.textContent, /Auto · \d+%/, 'Auto shows the step it picked');
    assert.equal([...doc.querySelectorAll('#screenOptions [data-ui-scale-step]')].filter(b => b.getAttribute('aria-pressed') === 'true').length, 0);
    // and the buttons are wired to the setters, not to the checkbox handler
    ev('setUiScale(1.3)');
    assert.equal(doc.querySelector('#screenOptions [data-ui-scale-step="1.3"]').getAttribute('aria-pressed'), 'true');
    ev('setUiScale(1)');
  });
}

pending.then(() => {
  if (errors.length) { console.log('  FAIL page errors -> ' + errors.slice(0, 3).join(' | ')); fail++; }
  console.log(`\nui scale: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
