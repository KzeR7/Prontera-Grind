// The weapon review page the owner gets: the weapon is already placed everywhere, dragging a
// tile moves that weapon the way the pointer moves (never inverted), one drag can carry the
// whole view, arrow keys nudge by 1 px, and the export hands back only the nudges.
//   node tools/tests/weapon_review_sim.js
//
// No browser here, so the page runs under a small DOM/canvas stub: it catches runtime errors in
// the real render path and lets the test drive the parts the owner touches.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');

function Ctx() {
  const noop = () => {};
  return { save: noop, restore: noop, scale: noop, translate: noop, setTransform: noop, clearRect: noop,
    fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop,
    fill: noop, stroke: noop, closePath: noop, rect: noop, clip: noop, rotate: noop, fillText: noop,
    strokeText: noop, setLineDash: noop, measureText: () => ({ width: 10 }), imageSmoothingEnabled: false,
    globalAlpha: 1, set lineWidth(v) {}, get lineWidth() { return 1 }, set strokeStyle(v) {}, get strokeStyle() { return '' },
    set fillStyle(v) {}, get fillStyle() { return '' },
    drawImage: (...a) => {
      const img = a[0];
      const rec = { src: img && img.src, iw: img && img.width, ih: img && img.height };
      if (a.length >= 8) Object.assign(rec, { sx: a[1], sy: a[2], sw: a[3], sh: a[4], dx: a[5], dy: a[6] });
      else Object.assign(rec, { dx: a[1], dy: a[2], dw: a[3], dh: a[4] });
      (global.__draw = global.__draw || []).push(rec);
    },
    getImageData: () => ({ data: new Uint8ClampedArray(4) }) };
}
function El(tag) {
  const e = { tagName: (tag || 'div').toUpperCase(), children: [], dataset: {}, style: { setProperty: () => {} },
    value: '', checked: false, textContent: '', title: '', width: 0, height: 0, type: '', tabIndex: 0,
    className: '', clientX: 0, clientY: 0 };
  Object.defineProperty(e, 'innerHTML', { get: () => e._h || '', set(v) { e._h = String(v); e.children.length = 0; } });
  e.appendChild = c => { c._parent = e; e.children.push(c); return c; };
  e.removeChild = () => {};
  e.setAttribute = (k, v) => { e[k] = v; };
  e.getAttribute = k => e[k];
  e.getContext = () => (e._ctx = e._ctx || Ctx());
  e.addEventListener = (n, f) => { (e._ev = e._ev || {})[n] = f; };
  e.removeEventListener = () => {};
  e.setPointerCapture = () => {};
  e.classList = { add: () => {}, remove: () => {} };
  e.focus = () => {};
  e.insertBefore = () => {};
  e.appendChild;
  const walk = (el, out) => { for (const c of (el.children || [])) { out.push(c); walk(c, out); } return out; };
  e.querySelectorAll = sel => {
    const all = walk(e, []);
    return all.filter(c => String(sel).split(',').some(s => {
      s = s.trim();
      if (s.startsWith('#')) return c.id === s.slice(1);
      if (s.startsWith('.')) return String(c.className || '').split(' ').includes(s.slice(1));
      return c.tagName === s.toUpperCase();
    })); };
  e.querySelector = sel => e.querySelectorAll(sel)[0] || null;
  Object.defineProperty(e, 'parentNode', { get: () => e._parent || null });
  return e;
}
const byId = {};
const handlers = {};
const doc = {
  createElement: El,
  createTextNode: t => ({ nodeValue: String(t), textContent: String(t) }),
  getElementById: id => { if (!byId[id]) { byId[id] = El('div'); byId[id].id = id; } return byId[id]; },
  querySelector: () => null,
  querySelectorAll: sel => (byId['views'] ? byId['views'].querySelectorAll(sel) : []),
  addEventListener: (n, f) => { (handlers[n] = handlers[n] || []).push(f); },
  body: El('body'), documentElement: El('html'),
};
function ImageStub() {
  const e = El('img'); let src = '';
  Object.defineProperty(e, 'src', { get: () => src, set(v) { src = v; e.complete = true; e.naturalWidth = 96; e.naturalHeight = 96; e.width = 96; e.height = 96; } });
  e.complete = false; e.naturalWidth = 0; e.naturalHeight = 0; e.width = 0; e.height = 0;
  return e;
}
global.document = doc;
global.Image = ImageStub;
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
global.setInterval = () => 1;
global.clearInterval = () => {};
global.setTimeout = f => { typeof f === 'function' && f(); return 1; };
global.confirm = () => true;
global.alert = () => {};
global.performance = { now: () => Date.now() };
global.window = { addEventListener: () => {}, removeEventListener: () => {}, location: { protocol: 'http:', href: 'x' } };
global.requestAnimationFrame = f => { f(0); return 1; };

// ---------------------------------------------------------------- boot the real page
const TARGET = process.argv[2] || 'weapon_review.html';
const html = fs.readFileSync(path.join(ROOT, 'tools', TARGET), 'utf8');
for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
  const t = path.resolve(path.join(ROOT, 'tools'), m[1]);
  vm.runInThisContext(fs.readFileSync(t, 'utf8'), { filename: m[1] });
}
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('weapon review: what the owner drags  [' + TARGET + ']\n');
global.__draw = [];

let bootError = null;
try { blocks.forEach((b, i) => vm.runInThisContext(b, { filename: 'inline' + i + '.js' })); }
catch (e) { bootError = e; }

const R = global.window.WEAPON_REVIEW;
const T = global.window.__pgTest;
const fire = (name, ev) => { for (const f of (handlers[name] || [])) f(Object.assign({ preventDefault() {}, stopPropagation() {} }, ev)); };
const canvasOf = (cls, v, f) => {
  const all = byId['views'].querySelectorAll('canvas');
  return all.find(c => c.dataset.cls === cls && +c.dataset.v === v && +c.dataset.f === f);
};

t('the page boots and draws (no error bar)', () => {
  assert.ok(!bootError, 'inline script threw: ' + (bootError && bootError.message));
  const bar = byId['pgFatal'] && byId['pgFatal'].textContent;
  assert.ok(!bar, 'error bar shown: ' + bar);
  assert.strictEqual(global.window.__pgReady, true, 'the page never finished a render pass');
  assert.ok(T, 'no __pgTest hook');
});

t('the data covers every class, every view, six frames', () => {
  assert.strictEqual(R.meta.classes.length, 19, 'classes: ' + R.meta.classes.length);
  for (const cls of R.meta.classes) {
    assert.ok(R.cell[cls] && R.cell[cls].startsWith('data:image/png;base64,'), cls + ' has no body grid');
    assert.ok(R.weapon[cls] && R.weapon[cls].startsWith('data:image/png;base64,'), cls + ' has no weapon grid');
    assert.strictEqual(R.hand[cls].length, 8, cls + ' hand rows');
    for (let v = 0; v < 8; v++) assert.strictEqual(R.hand[cls][v].length, 6, cls + ' v' + v + ' frame slots');
  }
});

t('weapons sit exactly on the armed views, and nowhere else', () => {
  const armed = R.meta.armed.slice().sort().join(',');
  assert.strictEqual(armed, '0,1,2,6,7', 'armed views changed: ' + armed);
  for (const cls of R.meta.classes) {
    for (let v = 0; v < 8; v++) {
      for (let f = 0; f < 6; f++) {
        const h = R.hand[cls][v][f];
        if (R.meta.armed.indexOf(v) < 0) assert.strictEqual(h, null, cls + ' v' + v + ' should carry no weapon');
        else assert.ok(h && h.length === 2, cls + ' v' + v + ' f' + f + ' has no measured grip');
      }
    }
  }
});

t('every grip is inside the cell and off the very edge', () => {
  let n = 0, worst = [];
  for (const cls of R.meta.classes) {
    for (let v = 0; v < 8; v++) for (let f = 0; f < 6; f++) {
      const h = R.hand[cls][v][f];
      if (!h) continue;
      n++;
      if (h[0] < 4 || h[0] > 92 || h[1] < 4 || h[1] > 92) worst.push(cls + ' ' + v + '/' + f + ' ' + h.join(','));
    }
  }
  assert.strictEqual(n, 570, 'armed cells: ' + n);
  assert.ok(worst.length <= 6, 'grips on the edge: ' + worst.slice(0, 6).join(' | '));
});

t('a drag moves the weapon exactly with the pointer (never inverted)', () => {
  const cls = 'Knight';
  T.state.cls = cls;
  T.paint();                                   // the dropdown does this on a real page
  const cv = canvasOf(cls, 0, 0);
  assert.ok(cv, 'no canvas for ' + cls + ' S f0');
  const before = T.adjOf(cls, 0, 0);
  fire('pointerdown', { target: cv, clientX: 100, clientY: 100, pointerId: 1 });
  fire('pointermove', { clientX: 100 + 3 * 3, clientY: 100 - 2 * 3, pointerId: 1 });   // ZOOM = 3
  fire('pointerup', { pointerId: 1 });
  const after = T.adjOf(cls, 0, 0);
  assert.deepStrictEqual([after[0] - before[0], after[1] - before[1]], [3, -2],
    'drag moved ' + JSON.stringify(after) + ' from ' + JSON.stringify(before));
  T.resetClass(cls);
});

t('the weapon layer is drawn at the same scale as the body, shifted by the nudge', () => {
  const cls = 'Knight';
  T.state.cls = cls; T.resetClass(cls);
  T.setAdj(cls, 0, 1, 2, -3);
  const cv = canvasOf(cls, 0, 1);
  assert.ok(cv, 'no tile on the page for ' + cls + ' S f1');
  global.__draw.length = 0;
  T.tile(cv, cls, 0, 1);                                    // this tile only: body, then weapon
  const draws = global.__draw.slice();
  const body = draws[0], wep = draws[1];
  assert.ok(body && wep, 'the tile did not draw both layers: ' + draws.length);
  assert.strictEqual(wep.dx, 2 * 3, 'weapon x offset not scaled to the canvas: ' + wep.dx);
  assert.strictEqual(wep.dy, -3 * 3, 'weapon y offset not scaled to the canvas: ' + wep.dy);
  T.resetClass(cls);
});

t('one drag can carry the whole view, and can be switched off', () => {
  const cls = 'Novice';
  T.state.cls = cls;
  T.setAdj(cls, 1, 0, 4, 4);
  T.state.together = true;
  T.nudge(cls, 1, 0, 1, 0);
  for (let f = 0; f < 6; f++) assert.deepStrictEqual(T.adjOf(cls, 1, f), [5, 4], 'frame ' + f + ' did not follow the view');
  T.state.together = false;
  T.nudge(cls, 1, 2, 0, 2);
  assert.deepStrictEqual(T.adjOf(cls, 1, 2), [5, 6], 'the nudged frame moved wrong');
  assert.deepStrictEqual(T.adjOf(cls, 1, 3), [5, 4], 'a frame moved that should not have');
  T.state.together = true;
  T.resetClass(cls);
  assert.strictEqual(T.adjustedCount(cls), 0, 'reset left adjustments behind');
});

t('the export carries the nudges, keyed by class, view and frame', () => {
  T.resetAll();
  T.setAdj('Archer', 2, 3, -2, 5);
  T.setAdj('Archer', 6, 0, 1, 1);
  const out = T.exportJSON();
  assert.strictEqual(out.version, 1, 'version');
  assert.strictEqual(out.adjust['Archer|2|3'][0], -2, 'dx');
  assert.strictEqual(out.adjust['Archer|2|3'][1], 5, 'dy');
  assert.strictEqual(Object.keys(out.adjust).length, 2, 'extra keys: ' + Object.keys(out.adjust).join(','));
  assert.strictEqual(out.adjusted, 2, 'adjusted count');
  T.resetAll();
  assert.strictEqual(Object.keys(T.exportJSON().adjust).length, 0, 'nothing to export after a reset');
});

t('a zero nudge is not an adjustment (the export stays honest)', () => {
  T.resetAll();
  T.nudge('Mage', 0, 0, 1, 0);
  T.nudge('Mage', 0, 0, -1, 0);
  assert.strictEqual(Object.keys(T.exportJSON().adjust).length, 0, 'a returned-to-zero frame still exported');
});

t('the marker follows the weapon the owner drags', () => {
  const cls = 'Priest';
  const h0 = T.handOf(cls, 0, 0);
  T.setAdj(cls, 0, 0, 3, -4);
  const h1 = T.handOf(cls, 0, 0);
  assert.deepStrictEqual([h1[0] - h0[0], h1[1] - h0[1]], [3, -4], 'marker did not follow');
  T.resetClass(cls);
});

t('the away-facing views are shown bare, with the rule spelled out', () => {
  for (const v of [3, 4, 5]) {
    assert.ok(!T.hasWeapon(v), 'view ' + v + ' claims to carry a weapon');
    assert.ok(!T.armed(v), 'view ' + v + ' marked armed');
  }
  for (const v of [0, 1, 2, 6, 7]) assert.ok(T.hasWeapon(v), 'view ' + v + ' should be armed');
});

t('every armed tile says where the grip came from', () => {
  let measured = 0, inferred = 0;
  for (const cls of R.meta.classes) {
    for (let v = 0; v < 8; v++) for (let f = 0; f < 6; f++) {
      if (R.meta.armed.indexOf(v) < 0) continue;
      const s = T.sourceOf(cls, v, f);
      assert.ok(s === 'hand' || s === 'extremity', cls + ' ' + v + '/' + f + ' source: ' + s);
      if (s === 'hand') measured++; else inferred++;
    }
  }
  assert.strictEqual(measured + inferred, 570, 'cells accounted for');
  assert.ok(measured > 250, 'only ' + measured + ' grips were measured from a bare hand');
});

t('the owner wants the game view, not the numbers: the page says how many are automatic', () => {
  const s = byId['status'] && byId['status'].textContent;
  assert.ok(/automatic|nudge/.test(String(s)), 'status pill says: ' + s);
});

setTimeout(() => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 10);
