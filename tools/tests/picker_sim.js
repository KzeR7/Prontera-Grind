// The attack-pose picker the owner uses: it boots, every view says which way the character
// faces (S = front, N = back), EVERY pose in the sheet is offered, the head can be seated by
// hand and travels in the export, and there is no weapon control anywhere on the page.
//   node tools/tests/picker_sim.js
//
// No browser here, so the page runs under a small DOM/canvas stub: it catches runtime errors
// in the real render path and lets the test drive the parts the owner touches.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');

// The stub's canvas has no real pixels, so getImageData returns a fixed head-shaped blob:
// opaque only in x 20..40, y 25..43 of the 64x64 head cell.  That is enough to prove the
// head marker hugs the head instead of drawing a 64x64 square.
const HEAD_PX = { x0: 20, y0: 25, x1: 40, y1: 43 };
function Ctx() {
  const noop = () => {};
  return { save: noop, restore: noop, scale: noop, translate: noop, setTransform: noop, clearRect: noop,
    fillRect: noop, strokeRect: noop, drawImage: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop, fill: noop, stroke: noop, closePath: noop, rect: noop, clip: noop,
    rotate: noop, fillText: noop, strokeText: noop, setLineDash: noop, measureText: () => ({ width: 10 }),
    imageSmoothingEnabled: true, globalAlpha: 1,
    getImageData: () => {
      const data = new Uint8ClampedArray(64 * 64 * 4);
      for (let y = HEAD_PX.y0; y <= HEAD_PX.y1; y++) for (let x = HEAD_PX.x0; x <= HEAD_PX.x1; x++)
        data[(y * 64 + x) * 4 + 3] = 255;
      return { data };
    } };
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
  const all = (el, out) => { out = out || []; if (!el) return out; for (const c of (el.children || [])) { out.push(c); all(c, out); } return out; };

  t('the page boots and draws (no error bar)', () => {
    assert.ok(!bootError, 'inline script threw: ' + (bootError && bootError.message));
    const bar = byId['pgFatal'] && byId['pgFatal'].textContent;
    assert.ok(!bar, 'error bar shown: ' + bar);
    assert.strictEqual(global.window.__pgReady, true, 'the page never finished a render pass');
  });

  t('the picker loads its own data, and there is NO weapon control anywhere', () => {
    assert.ok(T && typeof T.headSpot === 'function', 'window.__pgTest missing');
    assert.ok(global.window.SPRITE_PICKER_DATA && global.window.SPRITE_PACK,
      'the picker must load its pose index and the head atlas');
    assert.ok(!global.window.WEAPON_JOINTS, 'the joints file must not be loaded any more');
    const inputs = all(byId['views']).concat(all(byId['pinSlot']), all(byId['weapon']))
      .filter(c => c && (c.tagName === 'input' || c.tagName === 'select' || c.type === 'checkbox'));
    assert.strictEqual(inputs.length, 0, 'found ' + inputs.length + ' weapon-ish inputs');
    const sel = all(byId['cls']).filter(c => c.tagName === 'option');
    assert.ok(sel.length > 0, 'the class list must still be built');
    assert.ok(!/id="weapon"/.test(html) && !/pinWep|pinSlot/.test(html), 'the weapon select/switch is still in the page source');
  });

  t('all 8 views are drawn', () => {
    const views = all(byId['views']).filter(c => String(c.className || '').indexOf('view') === 0);
    assert.strictEqual(views.length, 8, 'expected 8 view cards, got ' + views.length);
  });

  t('every view says which way he faces: S = front (faces you), N = back (faces away)', () => {
    assert.ok(/faces you/.test(T.dirWord(0)), 'S must read as the front view: ' + T.dirWord(0));
    assert.ok(/faces away/.test(T.dirWord(4)), 'N must read as the back view: ' + T.dirWord(4));
    assert.ok(/faces away/.test(T.dirWord(3)) && /faces away/.test(T.dirWord(5)),
      'NW and NE are back views too');
    assert.ok(/faces you/.test(T.dirWord(1)) && /faces you/.test(T.dirWord(7)),
      'SW and SE show the front as well');
    assert.ok(/S = he faces you/.test(html) && /N = he faces away/.test(html),
      'the header must explain S and N in words');
  });

  t('EVERY pose in the sheet is offered, not only the attack sets', () => {
    const cls = T.st.cls;
    const poses = T.poses(cls);
    const tiles = all(byId['panelBody']).filter(c => String(c.className || '').split(' ').includes('cand'));
    assert.ok(poses.length > 60, 'the sheet offers ' + poses.length + ' poses');
    assert.strictEqual(tiles.length, poses.length,
      'tiles ' + tiles.length + ' vs poses ' + poses.length + ' - some poses are missing again');
    const heads = all(byId['panelBody']).filter(c => c.className === 'rowhead');
    assert.ok(heads.length >= 5, 'poses should be grouped by sheet row (got ' + heads.length + ' groups)');
  });

  t('the head marker hugs the head instead of drawing a 64x64 square', () => {
    const box = T.headBox(0, 0);
    assert.deepStrictEqual(box, [HEAD_PX.x0, HEAD_PX.y0, HEAD_PX.x1, HEAD_PX.y1],
      'the head box must be the head pixels, got ' + JSON.stringify(box));
    const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1;
    assert.ok(w < 64 && h < 64, 'the box is still the whole cell');
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
    const idx = T.st.atk[cls][0].findIndex(x => x != null);
    assert.ok(idx >= 0, 'view 0 has no pose to export');
    const cell = j.attack[cls][0][idx];
    assert.ok(cell && cell.length === 7, 'the pose cell must be [x,y,w,h,headX,headY,headSource]');
    const pose = T.poses(cls)[T.st.atk[cls][0][idx]];
    const s = Math.min(1, 90 / pose.w, 88 / pose.h);
    assert.strictEqual(cell[4], Math.round(pose.seat[0] * s + 3), 'headX');
    assert.strictEqual(cell[5], Math.round(pose.seat[1] * s - 2), 'headY');
    assert.strictEqual(cell[6], 'manual', 'a dragged head must be flagged manual');
    assert.strictEqual(j.version, 5, 'payload version');
    assert.deepStrictEqual(j.headAdjust[cls + '|0|0'], [3, -2], 'headAdjust must carry the raw drag');
    assert.deepStrictEqual([cell[0], cell[1], cell[2], cell[3]],
      [pose.x, pose.y, pose.w, pose.h], 'the pose itself must be untouched');
  });

  t('a frame may be empty, and the same pose can be repeated on all 6', () => {
    const cls = T.st.cls, sd = 0, arr = T.st.atk[cls][0];
    const first = arr[0];
    assert.ok(first != null, 'view 0 should start with the sheet suggestion');
    // repeat: the button uses the pose already on the current frame for every frame
    global.window.__pgTest.st.sel = { dir: 0, frame: 0 };
    const btn = all(byId['panelBody']).find(c => c.tagName === 'button' && /repeat frame \d+ on all 6/.test(c.textContent));
    assert.ok(btn, 'the "repeat frame N on all 6" button is missing');
    btn.onclick();
    assert.deepStrictEqual(T.st.atk[cls][0].slice(0, 6), [first, first, first, first, first, first],
      'the repeat button must fill all six frames with the same pose');
    // empty: a cleared frame exports null (= "keep the pose before it")
    const clr = all(byId['panelBody']).find(c => c.tagName === 'button' && c.textContent === 'clear this frame');
    assert.ok(clr, 'the "clear this frame" button is missing');
    clr.onclick();
    const j = T.payload();
    assert.strictEqual(j.attack[cls][0][0], null, 'a cleared frame must export as null');
    assert.ok(j.note && /keep the previous frame/.test(j.note), 'the export must explain the null rule');
  });

  t('the export walks away with poses and heads only - no weapon rows, no idle/walk', () => {
    const j = T.payload();
    assert.deepStrictEqual(Object.keys(j).filter(k => /idle|walk|weapon/i.test(k)), [],
      'the payload must not carry weapon or idle/walk keys: ' + Object.keys(j).join(','));
    assert.ok(j.attack[T.st.cls], 'the class must be in the payload');
  });

  t('the standalone build is the same app with nothing external', () => {
    const st = fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_standalone.html'), 'utf8');
    for (const f of ['../assets/sprite_pack_data.js', '../assets/weapon_joints_data.js', 'sprite_picker_data.js'])
      assert.ok(!st.includes('src="' + f + '"'), 'standalone still loads ' + f);
    assert.ok(!st.includes('window.WEAPON_JOINTS='), 'the standalone must not inline the joints any more');
    assert.ok(st.includes('window.__pgTest='), 'the standalone is built from the app source');
    assert.ok(st.includes('All poses in this sheet'), 'the standalone is stale - rebuild it');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail || bootError ? 1 : 0);
})();
