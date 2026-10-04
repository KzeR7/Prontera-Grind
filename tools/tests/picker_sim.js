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
    drawImage: (...a) => {
      const img = a[0];
      const rec = { src: img && img.src, iw: img && img.width, ih: img && img.height, n: a.length === undefined ? 1 : a.length };
      if (a.length >= 8) Object.assign(rec, { sx: a[1], sy: a[2], sw: a[3], sh: a[4], dx: a[5], dy: a[6], dw: a[7], dh: a[8] });
      else Object.assign(rec, { dx: a[1], dy: a[2], dw: a[3], dh: a[4] });   // 3- or 5-arg form
      (global.__draw = global.__draw || []).push(rec);
    },
    translate: (x, y) => { (global.__calls = global.__calls || []).push(['translate', x, y]); },
    scale: (x, y) => { (global.__calls = global.__calls || []).push(['scale', x, y]); },
    rect: (x, y, w, h) => { (global.__calls = global.__calls || []).push(['rect', x, y, w, h]); },
    fillRect: (x, y, w, h) => { (global.__calls = global.__calls || []).push(['fillRect', x, y, w, h]); },
    strokeRect: (x, y, w, h) => { (global.__calls = global.__calls || []).push(['strokeRect', x, y, w, h]); },
    arc: (x, y, r) => { (global.__calls = global.__calls || []).push(['arc', x, y, r]); },
    moveTo: (x, y) => { (global.__calls = global.__calls || []).push(['moveTo', x, y]); },
    lineTo: (x, y) => { (global.__calls = global.__calls || []).push(['lineTo', x, y]); },
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
global.__draw = [];

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

  t('the head is painted from the VIEW\'s own atlas column, on the seat', () => {
    const cls = T.st.cls, atlas = global.window.SPRITE_PACK.heads[T.st.sex === 'f' ? 'female' : 'male'];
    // a hair row this boot has not built yet, so the tile is really built right now
    T.st.hair = (T.st.hair + 1) % 19;
    global.__draw.length = 0; global.__calls = [];
    T.headTile(6);                                   // E: the game reads head column 6 for this view
    const built = global.__draw.filter(c => c.src === atlas && c.sw === 64 && c.sh === 64);
    assert.strictEqual(built.length, 1, 'a head tile must be built from exactly one atlas cell');
    assert.strictEqual(built[0].sx, 6 * 64,
      'NE/E/SE must use THEIR OWN head column (the game draws d*64), not the source view\'s');
    assert.strictEqual(built[0].sy, T.st.hair * 64, 'the hair style row');
    assert.ok(!(global.__calls || []).some(c => c[0] === 'scale' && c[1] < 0),
      'the atlas already has the mirrored columns - flipping one is a different picture');
    T.headTile(0);
    const zero = global.__draw.filter(c => c.src === atlas && c.sw === 64 && c.sh === 64).pop();
    assert.strictEqual(zero.sx, 0, 'view 0 must use head column 0');
    // and the tile lands on the seat the preview and the game agree on
    const fr = T.st.atk[cls][2].findIndex(x => x != null);
    assert.ok(fr >= 0, 'view 2 has no pose to draw');
    const pose = T.poses(cls)[T.st.atk[cls][2][fr]];
    const hs = T.headSpot(pose, 6, fr);
    global.__draw.length = 0;
    T.packedCell(pose, 6, fr, false);
    const tile = global.__draw.find(c => c.iw === 64 && c.ih === 64 && c.sx === undefined &&
      c.dx === Math.round(hs[0] - 32) && c.dy === Math.round(hs[1] - 48));
    assert.ok(tile, 'the head tile must be drawn at the seat: want ' +
      [Math.round(hs[0] - 32), Math.round(hs[1] - 48)]);
  });

  t('the head marker hugs the head instead of drawing a 64x64 square', () => {
    const box = T.headBox(0, 0);
    assert.deepStrictEqual(box, [HEAD_PX.x0, HEAD_PX.y0, HEAD_PX.x1, HEAD_PX.y1],
      'the head box must be the head pixels, got ' + JSON.stringify(box));
    const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1;
    assert.ok(w < 64 && h < 64, 'the box is still the whole cell');
  });

  t('the head sits on the GAME\'s own anchor, and a drag moves it exactly', () => {
    const cls = T.st.cls;
    const frame = T.st.atk[cls][0].findIndex(x => x != null);
    assert.ok(frame >= 0, 'no attack pose is filled for view 0');
    const pose = T.poses(cls)[T.st.atk[cls][0][frame]];
    assert.ok(pose.anim != null, 'the pose must be labelled for this test to be meaningful');
    const body = T.packBodyName();
    const an = global.window.SPRITE_PACK.bodies[body].anchors[pose.anim][0][pose.frame];
    assert.deepStrictEqual(T.baseSeat(pose, 0), an,
      'the picker must seat the head with the pack anchor the game uses, got ' +
      JSON.stringify(T.baseSeat(pose, 0)) + ' want ' + JSON.stringify(an));
    T.setHead(0, frame, [3, -2]);
    assert.deepStrictEqual(T.headSpot(pose, 0, frame), [an[0] + 3, an[1] - 2],
      'the drag must move the seat by exactly what was dragged');
    assert.deepStrictEqual(T.headAdj(0, frame), [3, -2], 'the drag is not remembered');
  });

  t('a mirrored view takes the pack\'s own mirrored anchor, and can be moved on its own', () => {
    const cls = T.st.cls;
    const fr = T.st.atk[cls][2].findIndex(x => x != null);      // view 6 (E) mirrors W
    assert.ok(fr >= 0, 'view 2 has no pose');
    const pose = T.poses(cls)[T.st.atk[cls][2][fr]];
    const body = T.packBodyName();
    const an6 = global.window.SPRITE_PACK.bodies[body].anchors[pose.anim][6][pose.frame];
    assert.deepStrictEqual(T.baseSeat(pose, 6), an6,
      'E must sit on the anchor the game uses for E, got ' + JSON.stringify(T.baseSeat(pose, 6)) +
      ' want ' + JSON.stringify(an6));
    assert.notStrictEqual(T.headTile(6), T.headTile(2), 'E must not draw W\'s head tile');
    const a0 = T.baseSeat(pose, 6)[0], before = T.headAdj(2, fr);
    T.setHead(6, fr, [10, 3]);
    assert.deepStrictEqual(T.headAdj(6, fr), [10, 3], 'NE/E/SE must be seatable on their own');
    assert.strictEqual(T.headSpot(pose, 6, fr)[0], a0 + 10,
      'dragging +10 px right must move the head +10 px right, not left');
    assert.deepStrictEqual(T.headAdj(2, fr), before, 'and must not disturb the view they mirror');
    T.setHead(6, fr, [0, 0]);
  });

  t('dragging right moves the head right on every view, mirrored or not', () => {
    const cls = T.st.cls;
    [[0, 0], [1, 1], [3, 3], [5, 3], [6, 2], [7, 1]].forEach(([view, src]) => {
      const fr = T.st.atk[cls][src].findIndex(x => x != null);
      assert.ok(fr >= 0, 'view ' + src + ' has no pose');
      const pose = T.poses(cls)[T.st.atk[cls][src][fr]];
      T.setHead(view, fr, [0, 0]);
      const a = T.headSpot(pose, view, fr);
      T.setHead(view, fr, [10, -4]);
      const b = T.headSpot(pose, view, fr);
      assert.strictEqual(b[0] - a[0], 10, 'view ' + view + ': a +10 px drag must move the head right');
      assert.strictEqual(b[1] - a[1], -4, 'view ' + view + ': the vertical drag must follow too');
      T.setHead(view, fr, [0, 0]);
    });
  });

  t('the blue marker is drawn in the same pixels as the head', () => {
    const cls = T.st.cls;
    const fr = T.st.atk[cls][0].findIndex(x => x != null);
    const pose = T.poses(cls)[T.st.atk[cls][0][fr]];
    const hs = T.headSpot(pose, 0, fr), box = T.headBox(0, fr);
    assert.ok(box, 'the head box must be measurable');
    T.st.sel = { dir: 0, frame: fr };
    global.__draw.length = 0; global.__calls = [];
    T.paint();
    const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1;
    const shade = global.__calls.find(c => c[0] === 'fillRect' && c[3] === w && c[4] === h);
    assert.ok(shade, 'the marker must shade exactly the head pixels');
    assert.strictEqual(shade[1], Math.round(hs[0] - 32 + box[0]), 'the shade must sit on the drawn head (x)');
    assert.strictEqual(shade[2], Math.round(hs[1] - 48 + box[1]), 'the shade must sit on the drawn head (y)');
    const tile = global.__draw.find(c => c.iw === 64 && c.ih === 64 && c.sx === undefined &&
      c.dx === Math.round(hs[0] - 32) && c.dy === Math.round(hs[1] - 48));
    assert.ok(tile, 'the head tile must be drawn at the same seat');
    const tr = global.__calls.findIndex(c => c[0] === 'translate' && c[1] === 15 && c[2] === 38);
    assert.ok(tr >= 0 && global.__calls.indexOf(shade) > tr,
      'the marker must be drawn inside the cell offset, not in sheet pixels');
  });

  t('the export carries the head in the game cell pixels, and the drags with it', () => {
    const cls = T.st.cls;
    const idx = T.st.atk[cls][0].findIndex(x => x != null);
    assert.ok(idx >= 0, 'view 0 has no pose to export');
    const pose = T.poses(cls)[T.st.atk[cls][0][idx]];
    T.setHead(0, idx, [3, -2]);                       // a manual nudge, so the export must carry it
    const j = T.payload();
    const cell = j.attack[cls][0][idx];
    assert.ok(cell && cell.length === 7, 'the pose cell must be [x,y,w,h,headX,headY,headSource]');
    const hs = T.headSpot(pose, 0, idx);
    assert.strictEqual(cell[4], Math.round(hs[0]), 'headX must be the game cell pixel');
    assert.strictEqual(cell[5], Math.round(hs[1]), 'headY must be the game cell pixel');
    assert.notStrictEqual(cell[4], Math.round(pose.seat[0] * Math.min(1, 90 / pose.w, 88 / pose.h)),
      'the export must not drop the body offset (crop pixels) again');
    assert.strictEqual(cell[6], 'manual', 'a dragged head must be flagged manual');
    assert.strictEqual(j.version, 5, 'payload version');
    assert.deepStrictEqual(j.headAdjust[cls + '|0|' + idx], [3, -2], 'headAdjust must carry the raw drag');
    assert.deepStrictEqual([cell[0], cell[1], cell[2], cell[3]],
      [pose.x, pose.y, pose.w, pose.h], 'the pose itself must be untouched');
  });

  t('one view can take another view\'s poses in a single click', () => {
    const cls = T.st.cls;
    T.st.sel = { dir: 0, frame: 0 };
    T.paint();
    const btn = all(byId['panelBody']).find(c => c.tagName === 'button' && c.textContent === 'W');
    assert.ok(btn, 'the shortcut row must offer the other drawn views (S SW W NW N)');
    btn.onclick();
    assert.deepStrictEqual(T.st.atk[cls][0].slice(0, 6), T.st.atk[cls][2].slice(0, 6),
      'view S must now hold exactly W\'s six frames');
    T.paint();
    const cards = all(byId['views']).filter(c => String(c.className || '').indexOf('view') === 0);
    const says = cards.map(c => JSON.stringify(all(c).map(x => x.innerHTML || '').join(' ')));
    assert.ok(/same as W/.test(all(cards[0]).map(x => x.innerHTML || '').join(' ')),
      'the card must say the view is a copy of W');
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
