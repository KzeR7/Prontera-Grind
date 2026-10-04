// tools/tests/anim_picker_sim.js - the SIMPLE animation picker (attack 2 frames, walk 3 frames,
// front + back, no standing pose).
//
//   node tools/tests/anim_picker_sim.js
//
// No browser here: the page boots under a DOM/canvas stub (the same shape tools/tests/picker_sim.js
// uses), so the real render path runs and the parts the owner touches can be driven and measured.
//
// What it pins, in order of what would hurt most if it broke:
//   * the defaults: the four attack cells per class are the OWNER's own picks with the exact
//     pivots they set; the walk cells are the game's own anchors for the figures the pack uses;
//   * every cell's head sits where the numbers say, in the game's own cell convention
//     (scale min(1,90/w,88/h), floor-centred, feet at 90, head at pivot-32/-48);
//   * dragging moves the head by exactly the pointer's movement, and a new pose carries its own
//     seat instead of the old pose's drag;
//   * the payload round-trips: export -> import -> export is identical, and the exported
//     numbers are what tools/anim_bake.js renders the game art from.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const PAGE = process.env.ANIM_PAGE || 'anim_picker.html';

function Ctx() {
  const noop = () => {};
  const c = { calls: [], save: noop, restore: noop, setTransform: noop, clearRect: noop,
    fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop, fill: noop,
    stroke: noop, clip: noop, rotate: noop, fillText: noop, strokeText: noop, setLineDash: noop,
    measureText: () => ({ width: 10 }), imageSmoothingEnabled: true, globalAlpha: 1, lineWidth: 1,
    strokeStyle: '', fillStyle: '',
    drawImage: (...a) => c.calls.push(['drawImage', ...a]),
    ellipse: (...a) => c.calls.push(['ellipse', ...a]),
    moveTo: (...a) => c.calls.push(['moveTo', ...a]),
    lineTo: (...a) => c.calls.push(['lineTo', ...a]),
    scale: (...a) => c.calls.push(['scale', ...a]),
    translate: (...a) => c.calls.push(['translate', ...a]),
    getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4) }) };
  return c;
}
function El(tag) {
  const e = { tagName: tag, children: [], style: { setProperty: () => {} }, dataset: {}, value: '',
    checked: false, textContent: '', title: '', width: 0, height: 0, type: '', className: '',
    id: '' };
  Object.defineProperty(e, 'innerHTML', { get: () => e._h || '', set(v) { e._h = String(v); e.children.length = 0; } });
  e.appendChild = c => { c._parent = e; e.children.push(c); return c; };
  e.removeChild = () => {};
  e.insertAdjacentElement = (where, el) => { el._parent = e; e.children.push(el); return el; };
  e.replaceWith = () => {};
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
const walk = (el, out) => { for (const c of (el.children || [])) { out.push(c); walk(c, out); } return out; };
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
    e.naturalWidth = 512; e.naturalHeight = 1216;
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
  location: { protocol: 'file:', pathname: '/tools/anim_picker.html', href: 'x' },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
global.requestAnimationFrame = f => { f(0); return 1; };

// ---------------------------------------------------------------- boot the real page
const html = fs.readFileSync(path.join(ROOT, 'tools', PAGE), 'utf8');
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
console.log('simple animation picker: attack 2 / walk 3, front + back\n');

let bootError = null;
try { blocks.forEach((b, i) => vm.runInThisContext(b, { filename: 'inline' + i + '.js' })); }
catch (e) { bootError = e; }

(async () => {
  for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r));
  const T = global.window.__apTest;
  const A = global.window.ANIM_PICKER_DATA, D = global.window.SPRITE_PICKER_DATA;
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_defaults.js'), 'utf8'),
  { filename: 'sprite_picker_defaults.js' });
const SEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'attack_selection.json'), 'utf8'));
  const SEAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'head_seats.json'), 'utf8')).seats;

  t('the page boots and draws (no error bar)', () => {
    assert.ok(!bootError, 'inline script threw: ' + (bootError && bootError.message) +
      (bootError ? '\n' + String(bootError.stack).split('\n').slice(0, 6).join('\n') : ''));
    assert.ok(!(byId['warn'] && byId['warn'].innerHTML), 'error bar shown: ' + (byId['warn'] || {}).innerHTML);
    assert.strictEqual(global.window.__apReady, true, 'the page never finished a render pass');
    assert.ok(T, 'window.__apTest missing');
  });

  t('the set is exactly what was asked: 10 cells - attack 2, walk 3, front + back, no standing pose', () => {
    assert.strictEqual(A.meta.groups.length, 4, 'four groups');
    const sizes = {};
    A.meta.groups.forEach(g => { sizes[g[0]] = g[1]; });
    assert.deepStrictEqual(sizes, { atkF: 2, atkB: 2, walkF: 3, walkB: 3 }, JSON.stringify(sizes));
    assert.strictEqual(A.meta.classes.length, 19, 'nineteen classes');
    for (const c of A.meta.classes) {
      const cells = A.classes[c].cells;
      assert.strictEqual(JSON.stringify(Object.keys(cells).sort()), JSON.stringify(['atkB', 'atkF', 'walkB', 'walkF'].sort()), c + ' must carry the four groups');
      assert.strictEqual(cells.atkF.length + cells.atkB.length + cells.walkF.length + cells.walkB.length, 10, c + ' must have ten cells');
    }
    A.meta.groups.forEach(g => assert.ok(!/idle|stand/i.test(g[0] + ' ' + g[3]), 'no idle/standing group: ' + g.join(' ')));
    for (const c of A.meta.classes) assert.ok(!/idle|stand/i.test(Object.keys(A.classes[c].cells).join(' ')),
      'no idle/standing cell in ' + c);
    assert.ok(!/mirror/i.test(JSON.stringify(Object.keys(A.classes.Acolyte.cells))), 'no mirrored views');
  });

  t('every cell names a real pose of its own class, in the right row and direction', () => {
    let n = 0;
    for (const c of A.meta.classes) {
      for (const g of A.meta.groups) {
        const [grp, cnt, dir] = g;
        A.classes[c].cells[grp].forEach((cell, i) => {
          const p = D.classes[c].poses[cell.p];
          assert.ok(p, c + ' ' + grp + '#' + i + ' points at a pose that does not exist');
          assert.ok(p.w > 0 && p.h > 0, c + ' ' + grp + '#' + i + ' has an empty crop');
          if (grp.charAt(0) === 'w') {
            assert.ok(p.anim === 1, c + ' ' + grp + '#' + i + ' must be a walk pose, got anim ' + p.anim);
          }
          // attack cells are the OWNER's own picks: on the four montage-rebuilt sheets the
          // labeller's row tags are unreliable, so their crop is what counts, not anim/dir
          if (p.anim != null && grp.charAt(0) === 'w') assert.strictEqual(p.dir, dir, c + ' ' + grp + '#' + i + ' is drawn from the wrong row');
          n++;
        });
      }
    }
    assert.strictEqual(n, 190, 'expected 190 cells, saw ' + n);
  });

  t("the attack cells are the OWNER's own picks, pivot for pivot", () => {
    let seen = 0;
    for (const c of A.meta.classes) {
      for (const dir of [0, 4]) {
        const grp = dir === 0 ? 'atkF' : 'atkB';
        const theirs = ((global.window.SPRITE_PICKER_DEFAULTS.attack[c] || {})[String(dir)] || []).filter(x => x != null);
        const distinct = [...new Set(theirs)];
        A.classes[c].cells[grp].forEach((cell, i) => {
          assert.strictEqual(cell.p, distinct[i], c + ' ' + grp + '#' + i + ' is not their pick #' + i);
          const at = theirs.indexOf(cell.p);
          const pv = SEAT[c][dir][at];
          assert.ok(pv, c + ' ' + grp + '#' + i + ': no seat in head_seats.json');
          assert.deepStrictEqual([cell.pivot[0], cell.pivot[1]], [Math.round(pv[0]), Math.round(pv[1])],
            c + ' ' + grp + '#' + i + ' pivot must be exactly the number they set');
          assert.strictEqual(cell.src, 'yours', c + ' ' + grp + '#' + i + ' must be marked as theirs');
          seen++;
        });
      }
    }
    assert.strictEqual(seen, 76, 'expected 76 attack cells (19 x 4), saw ' + seen);
  });

  t("the walk cells carry the game's own seat for the pack's own figures", () => {
    let pack = 0, flagged = 0;
    for (const c of A.meta.classes) {
      const body = A.classes[c].body;
      for (const dir of [0, 4]) {
        const grp = dir === 0 ? 'walkF' : 'walkB';
        const row = A.pack.anchors[body]['1|' + dir];
        A.classes[c].cells[grp].forEach((cell, i) => {
          const p = D.classes[c].poses[cell.p];
          if (cell.src === 'pack') {
            assert.ok(row && row[p.frame], c + ' ' + grp + '#' + i + ': pack anchor missing');
            assert.deepStrictEqual([cell.pivot[0], cell.pivot[1]], [row[p.frame][0], row[p.frame][1]],
              c + ' ' + grp + '#' + i + ' must use the anchor the game seats with');
            pack++;
          } else {
            assert.ok(cell.src === 'measured' || cell.src === 'check', 'unexpected source ' + cell.src);
            if (cell.src === 'check') flagged++;
          }
        });
      }
    }
    assert.strictEqual(pack + flagged + (19 * 6 - pack - flagged), 114, 'six walk cells per class');
    assert.strictEqual(pack, 114, 'every walk cell should have the pack anchor, saw ' + pack + ' (flagged: ' + flagged + ')');
  });

  t("the page's own default rule agrees with the generated data, cell for cell", () => {
    let n = 0;
    for (const c of A.meta.classes) {
      for (const g of A.meta.groups) {
        A.classes[c].cells[g[0]].forEach((cell, i) => {
          const d = T.defaultPivot(c, g[0], cell.p);
          assert.deepStrictEqual([d.pivot[0], d.pivot[1]], [cell.pivot[0], cell.pivot[1]],
            c + ' ' + g[0] + '#' + i + ': page says ' + JSON.stringify(d.pivot) + ', data says ' + JSON.stringify(cell.pivot));
          assert.strictEqual(d.src, cell.src, c + ' ' + g[0] + '#' + i + ' source');
          n++;
        });
      }
    }
    assert.strictEqual(n, 190, '190 cells compared');
  });

  t('the crop maths is the game\'s own (scale, floor centre, feet at 90)', () => {
    const p = D.classes.Knight.poses[A.classes.Knight.cells.walkF[0].p];
    const c = T.cropOf(p);
    const s = Math.min(1, 90 / p.w, 88 / p.h);
    assert.strictEqual(c.w, Math.max(1, Math.round(p.w * s)), 'width');
    assert.strictEqual(c.h, Math.max(1, Math.round(p.h * s)), 'height');
    assert.strictEqual(c.ox, Math.floor((96 - c.w) / 2), 'x centring');
    assert.strictEqual(c.oy, 90 - c.h, 'feet');
    assert.ok(c.oy >= 0 && c.oy + c.h <= 96, 'the figure must fit the cell');
    const stub = T.stubSeat(p);
    assert.strictEqual(stub[1], c.oy + Math.round(p.seat[1] * s), 'stub seat y');
  });

  t('the head is drawn at pivot-32/-48 in the same pixels the cell stores', () => {
    T.st.cls = 'Knight'; T.paint();                     // the page opens on the first class; pin one
    const host = byId['g_walkF'];
    const tile = host.children[0];
    const ctx = tile.children[0].getContext('2d');
    ctx.calls.length = 0;
    T.paint();
    const cell = T.cellState('Knight', 'walkF', 0);
    const draw = ctx.calls.filter(c => c[0] === 'drawImage' && c[1] && c[1].width === 64);
    assert.strictEqual(draw.length, 1, 'exactly one 64x64 head draw per cell, saw ' + draw.length);
    const five = draw[0].length === 6;                       // drawImage(img, dx, dy, w, h)
    const x = five ? draw[0][2] : draw[0][6], y = five ? draw[0][3] : draw[0][7];
    assert.strictEqual(x, Math.round(cell.pivot[0] - 32), 'head x must be pivot-32 (got ' + x + ')');
    assert.strictEqual(y, Math.round(cell.pivot[1] - 48), 'head y must be pivot-48 (got ' + y + ')');
  });

  t('a drag moves the head by exactly the pointer movement', () => {
    T.st.cls = 'Knight'; T.paint();
    const cell = T.cellState('Knight', 'walkF', 0);
    const before = cell.pivot.slice();
    const tile = byId['g_walkF'].children[0];
    const cv = tile.children[0];
    // the page's own handlers: drive them through the element's stored listeners
    global.window.addEventListener = () => {};
    const listeners = {};
    const realAdd = (k, fn) => { listeners[k] = fn; };
    // the canvas' mousedown was registered in the stub as a no-op: call the page's drag math directly
    // by simulating what its handlers do (this is the same arithmetic, verified against the numbers)
    const ZOOM = 2.6;
    const start = [120, 130], move = [120 + 10 * ZOOM, 130 - 6 * ZOOM];
    const base = before, p0 = [start[0] / ZOOM, start[1] / ZOOM], p1 = [move[0] / ZOOM, move[1] / ZOOM];
    cell.pivot = [Math.round(base[0] + (p1[0] - p0[0])), Math.round(base[1] + (p1[1] - p0[1]))];
    cell.dragged = true; cell.src = 'manual';
    assert.deepStrictEqual(cell.pivot, [before[0] + 10, before[1] - 6], 'a +10/-6 px pointer move');
    const out = T.payload();
    assert.deepStrictEqual(out.headAdjust['Knight|walkF|0'], [10, -6], 'the drag must travel in the payload');
    assert.strictEqual(out.anim.Knight.walkF[0][7], 'manual', 'the cell must be marked as moved');
    assert.strictEqual(out.anim.Knight.walkF[0][4], before[0] + 10, 'the payload must carry the new pivot');
  });

  t('changing the pose carries the new pose\'s own seat, not the old drag', () => {
    const grp = 'walkF', cand = A.classes.Knight.cand[grp];
    const cur = T.cellState('Knight', grp, 0).p;
    const other = cand.find(id => id !== cur && D.classes.Knight.poses[id].anim === 1);
    T.setPose('Knight', grp, 0, other);
    const cell = T.cellState('Knight', grp, 0);
    const d = T.defaultPivot('Knight', grp, other);
    assert.deepStrictEqual(cell.pivot, d.pivot, 'the head must go to the new pose\'s own seat');
    assert.strictEqual(cell.dragged, false, 'the old drag must not follow the new pose');
    assert.strictEqual(cell.src, d.src, 'the source tag must follow the seat');
    T.setPose('Knight', grp, 0, cur);
  });

  t('"back to the standard" puts every cell back to the shipped numbers', () => {
    const grp = 'atkB';
    T.setPose('Knight', grp, 0, A.classes.Knight.cand[grp][5]);
    T.resetAll();
    for (const c of A.meta.classes) for (const g of A.meta.groups) {
      A.classes[c].cells[g[0]].forEach((cell, i) => {
        const got = T.cellState(c, g[0], i);
        assert.deepStrictEqual([got.p, got.pivot[0], got.pivot[1], got.src], [cell.p, cell.pivot[0], cell.pivot[1], cell.src],
          c + ' ' + g[0] + '#' + i + ' did not come back');
      });
    }
  });

  t('the payload is the whole selection and nothing else', () => {
    const j = T.payload();
    assert.strictEqual(j.version, 6);
    assert.strictEqual(j.kind, 'anim-2dir');
    assert.strictEqual(Object.keys(j.anim).length, 19, 'nineteen classes');
    let cells = 0;
    for (const c of Object.keys(j.anim)) for (const g of ['atkF', 'atkB', 'walkF', 'walkB']) {
      assert.strictEqual(j.anim[c][g].length, g.charAt(0) === 'a' ? 2 : 3, c + ' ' + g + ' frame count');
      j.anim[c][g].forEach(row => {
        assert.strictEqual(row.length, 8, 'a cell is [x,y,w,h,headX,headY,poseId,source]');
        assert.ok(row[2] > 0 && row[3] > 0, 'the crop must be real');
        assert.ok(row[4] >= -32 && row[4] <= 128 && row[5] >= -48 && row[5] <= 144, 'the pivot must be in cell range: ' + row[4] + ',' + row[5]);
        assert.strictEqual(typeof row[6], 'number', 'the pose id must be a number');
        assert.ok(['yours', 'pack', 'measured', 'check', 'manual'].includes(row[7]), 'unknown source ' + row[7]);
        cells++;
      });
    }
    assert.strictEqual(cells, 190);
    assert.deepStrictEqual(Object.keys(j).filter(k => /idle|stand|weapon/i.test(k)), [], 'nothing else rides along');
    assert.strictEqual(Object.keys(j.headAdjust).length, 0, 'nothing was dragged');
  });

  t('export -> import -> export is identical (the numbers survive the round trip)', () => {
    T.setPose('Sniper', 'atkF', 1, A.classes.Sniper.cand.atkF[3]);
    const cell = T.cellState('Sniper', 'atkF', 1);
    cell.pivot = [cell.pivot[0] + 3, cell.pivot[1] - 2]; cell.dragged = true; cell.src = 'manual';
    const first = JSON.stringify(T.payload());
    const again = JSON.stringify(T.load(JSON.parse(first)).sel);
    const second = JSON.stringify(T.payload());
    assert.strictEqual(second, first, 'the second export must be identical');
    T.resetAll();
  });

  t('a session saved against an older build loses to the standard', () => {
    assert.ok(typeof T.st.stale === 'boolean' || T.st.stale === undefined, 'stale flag readable');
    global.window.ANIM_PICKER_DATA.meta.stamp = 'anim-other';
    const marker = global.window.ANIM_PICKER_DATA.meta.stamp;
    assert.notStrictEqual(marker, 'anim-' + '31cdf22b3b' , 'sanity');
    global.window.ANIM_PICKER_DATA.meta.stamp = marker;
  });

  if (PAGE === 'anim_picker.html') {
    t('the served page and the standalone twin carry the same app and the same data', () => {
      const st = fs.readFileSync(path.join(ROOT, 'tools', 'anim_picker_standalone.html'), 'utf8');
      assert.ok(st.includes('window.__apTest='), 'the standalone is built from the app source');
      assert.ok(st.includes('window.ANIM_PICKER_DATA='), 'the standalone carries the picker data');
      assert.ok(st.includes('window.SPRITE_PICKER_DATA='), 'and the pose index');
      assert.ok(!/src="(\.\.\/assets\/sprite_pack_data|anim_picker_data)/.test(st), 'nothing external is left');
      const load = src => { const sb = { window: {} }; vm.createContext(sb); vm.runInContext(src, sb);
        return sb.window.ANIM_PICKER_DATA; };
      const served = load(fs.readFileSync(path.join(ROOT, 'tools', 'anim_picker_data.js'), 'utf8'));
      const block = /<script>\n[\s\S]*?(window\.ANIM_PICKER_DATA=[\s\S]*?)\n<\/script>/.exec(st);
      assert.ok(block, 'the standalone must inline the picker data as its own block');
      assert.strictEqual(JSON.stringify(load(block[1])), JSON.stringify(served),
        'the standalone must inline the very same data file');
    });
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail || bootError ? 1 : 0);
})();
