// Where does the head sit on EVERY view, according to the picker itself?
//
// The review page seats body + head + weapon into one cell. The head pivot lives in
// sprite_picker_defaults.js for the five DRAWN views (S/SW/W/NW/N); the mirrored views
// (NE/E/SE) carry their own pivots in `headDragMirror`, and weapon_bake.py never read them -
// so NE, E and SE were baked headless (found 2026-10-04, after the owner reported the heads).
//
// This dumps one absolute pivot per class/view/frame by RUNNING THE REAL PICKER PAGE under a
// DOM stub (the same one tools/tests/picker_sim.js uses) and asking its own headSpot():
//     node tools/head_seats.js            ->  tools/head_seats.json
// The picker's rule, for the record, is headSpot = baseSeat(pose, view) + the view's own drag,
// and for the drawn views that must reproduce the shipped absolute pivots exactly - the check
// below fails loudly if the harness ever drifts from the page.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- DOM/canvas stub
// (kept in step with tools/tests/picker_sim.js: the page must boot here the way it boots there)
function Ctx() {
  const noop = () => {};
  return { save: noop, restore: noop, scale: noop, translate: noop, setTransform: noop, clearRect: noop,
    drawImage: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, fill: noop,
    stroke: noop, closePath: noop, rect: noop, clip: noop, rotate: noop, fillText: noop, strokeText: noop,
    setLineDash: noop, measureText: () => ({ width: 10 }), imageSmoothingEnabled: false, globalAlpha: 1,
    fillRect: noop, strokeRect: noop,
    getImageData: () => { const data = new Uint8ClampedArray(64 * 64 * 4);
      for (let y = 25; y <= 43; y++) for (let x = 20; x <= 40; x++) data[(y * 64 + x) * 4 + 3] = 255;
      return { data }; } };
}
function El(tag) {
  const e = { tagName: tag, children: [], style: { setProperty: () => {} }, dataset: {}, value: '',
    checked: false, textContent: '', title: '', width: 0, height: 0, type: '', offsetWidth: 0, offsetHeight: 0,
    className: '' };
  Object.defineProperty(e, 'innerHTML', { get: () => e._h || '', set(v) { e._h = String(v); e.children.length = 0; } });
  e.appendChild = c => { c._parent = e; e.children.push(c); return c; };
  e.removeChild = () => {};
  e.setAttribute = (k, v) => { e[k] = v; };
  e.getAttribute = k => e[k];
  e.getContext = () => (e._ctx = e._ctx || Ctx());
  e.addEventListener = () => {};
  e.removeEventListener = () => {};
  e.select = () => {};
  e.setSelectionRange = () => {};
  e.getBoundingClientRect = () => ({ left: 0, top: 0, width: e.width || 0, height: e.height || 0 });
  e.insertBefore = () => {};
  e.focus = () => {};
  const walk = (el, out) => { for (const c of (el.children || [])) { out.push(c); walk(c, out); } return out; };
  e.querySelectorAll = sel => walk(e, []).filter(c => String(sel).split(',').some(s => {
    s = s.trim();
    if (s.startsWith('#')) return c.id === s.slice(1);
    const m = /^(\w*)\.([\w-]+)$/.exec(s);
    if (m) return (!m[1] || c.tagName === m[1]) && String(c.className || '').split(' ').includes(m[2]);
    return c.tagName === s; }));
  e.querySelector = sel => e.querySelectorAll(sel)[0] || null;
  Object.defineProperty(e, 'childNodes', { get: () => e.children });
  Object.defineProperty(e, 'firstChild', { get: () => e.children[0] || null });
  Object.defineProperty(e, 'parentNode', { get: () => e._parent || null });
  return e;
}
const byId = {};
const doc = {
  createElement: tag => El(tag),
  getElementById: id => { if (!byId[id]) { byId[id] = El('div'); byId[id].id = id; } return byId[id]; },
  querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, execCommand: () => true,
  createTextNode: t => ({ nodeValue: String(t), textContent: String(t) }),
  body: El('body'), documentElement: El('html') };
function ImageStub() {
  const e = El('img'); let src = '';
  Object.defineProperty(e, 'src', { get: () => src, set(v) { src = v; e.complete = true;
    e.naturalWidth = 64; e.naturalHeight = 64;
    if (e.onload) process.nextTick(() => { try { e.onload(); } catch (err) { /* the page reports it */ } }); } });
  e.complete = false; e.naturalWidth = 0; e.naturalHeight = 0;
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
global.window = { addEventListener: () => {}, removeEventListener: () => {},
  location: { protocol: 'file:', pathname: '/tools/sprite_picker.html', href: 'x' },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
global.requestAnimationFrame = f => { f(0); return 1; };

// ---------------------------------------------------------------- boot the real page
const html = fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker.html'), 'utf8');
for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
  vm.runInThisContext(fs.readFileSync(path.resolve(path.join(ROOT, 'tools'), m[1]), 'utf8'), { filename: m[1] });
}
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

(async () => {
  let bootError = null;
  try { blocks.forEach((b, i) => vm.runInThisContext(b, { filename: 'picker' + i + '.js' })); }
  catch (e) { bootError = e; }
  for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r));

  const T = global.window.__pgTest;
  if (bootError || !T || !global.window.SPRITE_PICKER_DEFAULTS) { console.error('the picker did not boot: ' + (bootError && bootError.message)); process.exit(1); }

  const D = global.window.SPRITE_PICKER_DEFAULTS || global.SPRITE_PICKER_DEFAULTS;
  const MIRROR = { 5: 3, 6: 2, 7: 1 };        // the picker's own MIRRORSRC, same as sprite_picker.html
  const seats = {}, meta = { views: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'], frames: 6,
    mirrorSrc: { 5: 3, 6: 2, 7: 1 }, source: 'tools/sprite_picker.html headSpot() + the owner\'s defaults' };
  let drawn = 0, mirrored = 0, drift = [];
  for (const cls of Object.keys(D.attack)) {
    seats[cls] = [];
    for (let v = 0; v < 8; v++) {
      const row = [];
      for (let f = 0; f < 6; f++) {
        const sd = MIRROR[v] !== undefined ? MIRROR[v] : v;   // mirrored views mirror their source
        const ids = (T.st.atk[cls] || {})[sd];
        const pose = ids ? T.poseOf(cls, ids[f]) : null;
        if (!pose) { row.push(null); continue; }
        const hs = T.headSpot(pose, v, f, cls);
        row.push([Math.round(hs[0]), Math.round(hs[1])]);
        if (v < 5) { drawn++;                             // must equal the shipped absolute pivots
          const want = D.head[cls + '|' + v + '|' + f];
          if (!want || want[0] !== Math.round(hs[0]) || want[1] !== Math.round(hs[1]))
            drift.push(cls + '|' + v + '|' + f + ' harness ' + JSON.stringify([Math.round(hs[0]), Math.round(hs[1])]) +
                       ' vs shipped ' + JSON.stringify(want));
        } else mirrored++;
      }
      seats[cls].push(row);
    }
  }
  const out = path.join(ROOT, 'tools', 'head_seats.json');
  fs.writeFileSync(out, JSON.stringify({ meta: meta, seats: seats }, null, 0) + '\n');
  console.log('wrote tools/head_seats.json  (' + Object.keys(seats).length + ' classes, ' +
              drawn + ' drawn + ' + mirrored + ' mirrored = ' + (drawn + mirrored) + ' pivots)');
  if (drift.length) {
    console.error('\nDRIFT: the harness no longer reproduces the shipped drawn-view pivots (' + drift.length + '):');
    drift.slice(0, 6).forEach(d => console.error('  ' + d));
    process.exit(1);
  }
  console.log('check: all ' + drawn + ' drawn-view pivots reproduce sprite_picker_defaults.js exactly');
  const sample = Object.keys(seats)[0];
  console.log('sample ' + sample + ': NE ' + JSON.stringify(seats[sample][5][0]) +
              '  E ' + JSON.stringify(seats[sample][6][0]) +
              '  SE ' + JSON.stringify(seats[sample][7][0]));
})();
