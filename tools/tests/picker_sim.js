// The attack-pose picker the owner uses: it boots, every view says which way the character
// faces (S = front, N = back), the head can be seated by hand and travels in the export, and
// the weapon is parked in one position while the poses are being picked.
//   node tools/tests/picker_sim.js
//
// No browser here, so the page runs under a small DOM/canvas stub: it catches runtime errors
// in the real render path and lets the test drive the parts the owner touches.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------- DOM / canvas stub
function Ctx() {
  const noop = () => {};
  return { save: noop, restore: noop, scale: noop, translate: noop, setTransform: noop, clearRect: noop,
    fillRect: noop, strokeRect: noop, drawImage: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop, fill: noop, stroke: noop, closePath: noop, rect: noop, clip: noop,
    rotate: noop, fillText: noop, strokeText: noop, setLineDash: noop, measureText: () => ({ width: 10 }),
    imageSmoothingEnabled: true };
}
function El(tag) {
  const e = { tagName: tag, children: [], style: { setProperty: () => {} }, dataset: {}, value: '',
    checked: false, textContent: '', title: '', width: 0, height: 0, type: '', offsetWidth: 0, offsetHeight: 0 };
  e.className = '';
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
  e.querySelectorAll = sel => {
    const all = walk(e, []);
    return all.filter(c => String(sel).split(',').some(s => {
      s = s.trim();
      if (s.startsWith('#')) return c.id === s.slice(1);
      const m = /^(\w*)\.([\w-]+)$/.exec(s);
      if (m) return (!m[1] || c.tagName === m[1]) && String(c.className || '').split(' ').includes(m[2]);
      if (s.startsWith('.')) return String(c.className || '').split(' ').includes(s.slice(1));
      return c.tagName === s;
    }));
  };
  e.querySelector = sel => e.querySelectorAll(sel)[0] || null;
  Object.defineProperty(e, 'childNodes', { get: () => e.children });
  Object.defineProperty(e, 'firstChild', { get: () => e.children[0] || null });
  Object.defineProperty(e, 'parentNode', { get: () => e._parent || null });
  return e;
}
const byId = {};
const doc = {
  createElement: El,
  getElementById: id => { if (!byId[id]) { byId[id] = El('div'); byId[id].id = id; } return byId[id]; },
  querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, execCommand: () => true,
  createTextNode: t => ({ nodeValue: String(t), textContent: String(t) }),
  body: El('body'), documentElement: El('html'),
};
function ImageStub() {
  const e = El('img'); let src = '';
  Object.defineProperty(e, 'src', { get: () => src, set(v) { src = v; e.complete = true; e.naturalWidth = 64; e.naturalHeight = 64; if (e.onload) process.nextTick(() => { try { e.onload(); } catch (err) { console.error('IMG onload threw:', err.message); } }); } });
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
global.window = { addEventListener: () => {}, removeEventListener: () => {}, location: { protocol: 'file:', pathname: '/tools/sprite_picker.html', href: 'x' }, matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
global.requestAnimationFrame = f => { f(0); return 1; };

// ---------------------------------------------------------------- boot the real page
const html = fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker.html'), 'utf8');
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
console.log('attack picker: what the owner clicks\n');

let bootError = null;
try { blocks.forEach((b, i) => vm.runInThisContext(b, { filename: 'inline' + i + '.js' })); }
catch (e) { bootError = e; }

(async () => {
  for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r));
  const T = global.window.__pgTest;

  t('the page boots and draws (no error bar)', () => {
    assert.ok(!bootError, 'inline script threw: ' + (bootError && bootError.message));
    const bar = byId['pgFatal'] && byId['pgFatal'].textContent;
    assert.ok(!bar, 'error bar shown: ' + bar);
    assert.strictEqual(global.window.__pgReady, true, 'the page never finished a render pass');
  });

  t('the test hook and the data are both there', () => {
    assert.ok(T && typeof T.headSpot === 'function', 'window.__pgTest missing');
    assert.ok(global.window.SPRITE_PICKER_DATA && global.window.SPRITE_PACK && global.window.WEAPON_JOINTS,
      'the picker must load its pose index, the pack and the joints');
  });

  const all = (el, out) => { out = out || []; for (const c of (el.children || [])) { out.push(c); all(c, out); } return out; };

  t('all 8 views are drawn, and NW/N/NE start without a weapon', () => {
    const views = all(byId['views']).filter(c => String(c.className || '').indexOf('view') === 0);
    assert.strictEqual(views.length, 8, 'expected 8 view cards, got ' + views.length);
    const boxes = all(byId['views']).filter(c => c.type === 'checkbox');
    assert.strictEqual(boxes.length, 8, 'expected one weapon box per view');
    assert.deepStrictEqual(boxes.map(b => !!b.checked),
      [true, true, true, false, false, false, true, true], 'weapon defaults drifted');
  });

  t('every view says which way he faces: S = front (faces you), N = back (faces away)', () => {
    assert.ok(/faces you/.test(T.dirWord(0)), 'S must read as the front view: ' + T.dirWord(0));
    assert.ok(/faces away/.test(T.dirWord(4)), 'N must read as the back view: ' + T.dirWord(4));
    assert.ok(/faces away/.test(T.dirWord(3)) && /faces away/.test(T.dirWord(5)),
      'NW and NE are back views too');
    assert.ok(/faces you/.test(T.dirWord(1)) && /faces you/.test(T.dirWord(7)),
      'SW and SE show the front as well');
    const head = String(byId['pgFatal'] && byId['pgFatal'].textContent || '') +
      [...html.matchAll(/<span class="hint"[^>]*>([\s\S]*?)<\/span>/g)].map(m => m[1]).join(' ');
    assert.ok(/S = he faces you|S = the character faces you/.test(head) && /N = he faces away/.test(head),
      'the header must explain S and N in words');
  });

  t('the weapon is parked: one held position, and the switch says so', () => {
    const pin = all(byId['pinSlot']).find(c => c.type === 'checkbox');
    assert.ok(pin, 'the "hold the weapon in one position" switch is missing');
    assert.strictEqual(pin.checked, true, 'the weapon must start parked');
    const cls = T.st.cls, wt = 'sword';
    T.st.pinned = true;
    const held = [0, 1, 2, 3, 4, 5].map(f => T.weaponPixel(0, f, wt, 6, null).slice(0, 2));
    for (const p of held) assert.deepStrictEqual(p, held[0], 'the parked weapon moved between frames');
    T.st.pinned = false;
    const free = [0, 1, 2, 3, 4, 5].map(f => T.weaponPixel(0, f, wt, 6, null).slice(0, 2));
    assert.ok(free.some(p => p[0] !== free[0][0] || p[1] !== free[0][1]),
      'unparked, the weapon should follow the hand (otherwise this switch does nothing)');
    T.st.pinned = true;
  });

  t('the head sits where the sheet measures it, and a drag moves it exactly', () => {
    const cls = T.st.cls, id = (T.st.atk[cls][0] || []).find(x => x != null);
    assert.ok(id != null, 'no attack pose is filled for view 0');
    const pose = T.poses(cls)[id];
    const s = Math.min(1, 90 / pose.w, 88 / pose.h);
    const w = Math.max(1, Math.round(pose.w * s)), h = Math.max(1, Math.round(pose.h * s));
    const want = [Math.floor((96 - w) / 2) + pose.seat[0] * s, 90 - h + pose.seat[1] * s];
    const got = T.headSpot(pose, 0, 0);
    assert.ok(Math.abs(got[0] - want[0]) < 1e-6 && Math.abs(got[1] - want[1]) < 1e-6,
      'measured seat: got ' + got + ' want ' + want);
    T.setHead(0, 0, [3, -2]);
    const moved = T.headSpot(pose, 0, 0);
    assert.ok(Math.abs(moved[0] - (want[0] + 3)) < 1e-6 && Math.abs(moved[1] - (want[1] - 2)) < 1e-6,
      'drag: got ' + moved + ' want ' + [want[0] + 3, want[1] - 2]);
    assert.deepStrictEqual(T.headAdj(0, 0), [3, -2], 'the drag is not remembered');
  });

  t('the export carries the head in the game cell pixels, and the drags with it', () => {
    const cls = T.st.cls, j = T.payload();
    const cell = j.attack[cls][0][0];
    assert.ok(cell && cell.length === 7, 'the pose cell must be [x,y,w,h,headX,headY,headSource]');
    const pose = T.poses(cls)[T.st.atk[cls][0][0]];
    const s = Math.min(1, 90 / pose.w, 88 / pose.h);
    assert.strictEqual(cell[4], Math.round(pose.seat[0] * s + 3), 'headX');
    assert.strictEqual(cell[5], Math.round(pose.seat[1] * s - 2), 'headY');
    assert.strictEqual(cell[6], 'manual', 'a dragged head must be flagged manual');
    assert.strictEqual(j.version, 4, 'payload version');
    assert.deepStrictEqual(j.headAdjust[cls + '|0|0'], [3, -2], 'headAdjust must carry the raw drag');
    assert.strictEqual(j.weaponPinned, true, 'the export must say the weapon was parked');
    assert.deepStrictEqual([cell[0], cell[1], cell[2], cell[3]],
      [pose.x, pose.y, pose.w, pose.h], 'the pose itself must be untouched');
  });

  t('the export still walks away with no idle/walk rows at all', () => {
    const j = T.payload();
    assert.deepStrictEqual(Object.keys(j).filter(k => /idle|walk/i.test(k)), [],
      'idle and walk are filled in by the build, not chosen here');
    assert.ok(j.attack[T.st.cls], 'the class must be in the payload');
  });

  t('the standalone build is the same app with nothing external', () => {
    const st = fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_standalone.html'), 'utf8');
    for (const f of ['../assets/sprite_pack_data.js', '../assets/weapon_joints_data.js', 'sprite_picker_data.js'])
      assert.ok(!st.includes('src="' + f + '"'), 'standalone still loads ' + f);
    assert.ok(st.includes('window.WEAPON_JOINTS='), 'standalone must inline the joints');
    assert.ok(st.includes('window.__pgTest='), 'the standalone is built from the app source');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail || bootError ? 1 : 0);
})();
