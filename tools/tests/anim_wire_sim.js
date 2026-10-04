// tools/tests/anim_wire_sim.js - the game wired to the SIMPLE set (attack 2 / walk 3, front + back).
//
//   node tools/tests/anim_wire_sim.js
//
// It runs the game's OWN code (the inline script out of index.html, the same slice
// tools/tests/pack_sim.js uses) against the real data files, with the new artifact loaded:
//
//   1. the artifact itself: ten cells per body, pivots for each, and a cell map whose front/back
//      sides, frame counts (1 idle / 3 walk / 2 attack) and ten cells agree with
//      tools/anim_picker_data.js - the very numbers the picker showed the owner;
//   2. the cell map the GAME runs, extracted from index.html, answers the same for all 8 drawn
//      directions x 3 kinds x every frame - so the body art on screen is the art that was picked;
//   3. packTex composes with the new cells and the owner's pivots: 240 tiles as before (a body and
//      a head per cell), the body source being the artifact's cell and the head landing exactly at
//      pivot-32/-48 in the game's own 126x134 cell layout - hair and sex still come from the pack;
//   4. heroPoseFrame's packed counts are the set's counts (1 / 3 / 2), so no frame index can run
//      off the end of a two-frame attack.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('index.html is missing ' + JSON.stringify(a));
  return src.slice(i, j);
};

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('the game on the simple set: 2-frame attack, 3-frame walk, front + back\n');

const load = (file, key) => { const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sb); return sb.window[key]; };
const AP = load('assets/anim_pack_data.js', 'ANIM_PACK');
const PICK = load('tools/anim_picker_data.js', 'ANIM_PICKER_DATA');

// ---- the game's own slice, run the way pack_sim runs it
const draws = [];
class FakeImage { constructor() { this.width = 0; this.height = 0; }
  set src(u) { this._src = u; this.complete = true; this.naturalWidth = 96; this.naturalHeight = 96;
    if (this.onload) this.onload(); } get src() { return this._src; } }
const ctx = { imageSmoothingEnabled: true, drawImage(...a) { draws.push(a); } };
const canvas = { width: 0, height: 0, getContext() { return ctx; } };
const THREE = { CanvasTexture: function (cv) { this.cv = cv; this.image = cv; this.repeat = { set() {} }; this.offset = { set() {} }; },
  NearestFilter: 1, Sprite: function (m) { this.material = m; this.center = { set() {} }; this.scale = { set() {} }; this.userData = {}; },
  SpriteMaterial: function (o) { this.map = o.map; } };
const sandbox = { window: {}, document: { createElement: () => canvas }, $: () => null, S: null,
  C: () => ({ n: 'Archer', tier: 1 }), THREE, Image: FakeImage };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'sprite_pack_data.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'anim_pack_data.js'), 'utf8'), sandbox);
const slice = grab('const PACK_BODY={Novice', 'function mkPackHero') + '\n' + grab('function animPackCell(', 'function weaponHandPoint(');
vm.runInContext(slice + '\nthis.__x={PACK_BODY,packTex,packCache,packBodyFor,animPackCell,heroPoseFrame};', sandbox);
const G = sandbox.__x, PK = sandbox.window.SPRITE_PACK;

const CELLS = ['atkF0', 'atkF1', 'atkB0', 'atkB1', 'walkF0', 'walkF1', 'walkF2', 'walkB0', 'walkB1', 'walkB2'];
const FRONT = [0, 1, 2, 6, 7], BACK = [3, 4, 5];

t('the artifact carries ten cells, the pivots, and the map - per body', () => {
  assert.strictEqual(JSON.stringify(AP.meta.order), JSON.stringify(CELLS), 'meta.order must be the ten cells');
  const bodies = Object.keys(AP.classes);
  assert.strictEqual(bodies.length, 19, 'nineteen bodies, got ' + bodies.length);
  for (const b of bodies) {
    const rec = AP.classes[b];
    assert.ok(PK.bodies[b], b + ' must be a pack body name');
    assert.strictEqual(rec.pivots.length, 10, b + ' must carry ten pivots');
    rec.pivots.forEach((pv, i) => assert.strictEqual(pv.length, 2, b + ' pivot ' + i));
    assert.ok(rec.atlas.startsWith('data:image/png;base64,'), b + ' atlas must be inline');
  }
  assert.strictEqual(JSON.stringify(AP.meta.counts), JSON.stringify({ idle: 1, walk: 3, attack: 2 }), 'the set is 1 / 3 / 2');
});

t('the map sends every drawn direction to the art the picker showed', () => {
  // the same rule the game runs, read from the data
  const cellFor = (dir, kind, frame) => {
    const m = AP.meta, side = (m.side[dir] || 'F') === 'B' ? 'back' : 'front';
    if (kind === 0) return m.idle[side];
    const list = kind === 1 ? m.walk[side] : m.attack[side];
    return list[Math.min(Math.max(frame | 0, 0), list.length - 1)];
  };
  for (let d = 0; d < 8; d++) {
    const want = FRONT.includes(d) ? 'F' : 'B';
    assert.strictEqual(AP.meta.side[d], want, 'direction ' + d + ' must use the ' + (want === 'F' ? 'front' : 'back') + ' art');
    assert.strictEqual(cellFor(d, 0, 0), want === 'F' ? 5 : 8, 'idle=walk frame 1, ' + (want === 'F' ? 'front' : 'back'));
    assert.strictEqual(JSON.stringify([0, 1, 2, 3].map(f => cellFor(d, 1, f))),
      JSON.stringify(want === 'F' ? [4, 5, 6, 6] : [7, 8, 9, 9]), 'walk frames, clamped at the last');
    assert.strictEqual(JSON.stringify([0, 1, 2, 5].map(f => cellFor(d, 2, f))),
      JSON.stringify(want === 'F' ? [0, 1, 1, 1] : [2, 3, 3, 3]), 'attack frames, clamped at the last');
  }
});

t('the pivots are the picker\'s own numbers, cell for cell', () => {
  let n = 0;
  for (const cls of PICK.meta.classes) {
    const body = PICK.classes[cls].body, rec = AP.classes[body];
    const keys = [['atkF', 0], ['atkF', 1], ['atkB', 0], ['atkB', 1], ['walkF', 0], ['walkF', 1], ['walkF', 2], ['walkB', 0], ['walkB', 1], ['walkB', 2]];
    keys.forEach(([grp, i], k) => {
      const cell = PICK.classes[cls].cells[grp][i];
      assert.strictEqual(JSON.stringify(rec.pivots[k]), JSON.stringify([cell.pivot[0], cell.pivot[1]]),
        cls + ' ' + CELLS[k] + ': the game must seat at the pivot the picker showed');
      n++;
    });
  }
  assert.strictEqual(n, 190, '190 cells compared');
});

t('the game\'s own cell map (out of index.html) agrees for every direction, kind and frame', () => {
  let n = 0;
  for (let d = 0; d < 8; d++) for (let kind = 0; kind < 3; kind++) for (let f = 0; f < 8; f++) {
    const got = G.animPackCell(AP, d, kind, f);
    const m = AP.meta, side = m.side[d] === 'B' ? 'back' : 'front';
    const want = kind === 0 ? m.idle[side]
      : (kind === 1 ? m.walk[side] : m.attack[side])[Math.min(f, (kind === 1 ? 3 : 2) - 1)];
    assert.strictEqual(got, want, 'dir ' + d + ' kind ' + kind + ' frame ' + f + ': ' + got + ' vs ' + want);
    n++;
  }
  assert.strictEqual(n, 192, '192 combinations checked');
});

t('heroPoseFrame hands out the set\'s frame counts (no frame can run off a 2-frame attack)', () => {
  const seen = { idle: new Set(), walk: new Set(), attack: new Set() };
  for (let c = 0; c < 40; c++) {
    const idle = G.heroPoseFrame(false, 0, c / 10, true), walk = G.heroPoseFrame(true, 0, c / 10, true);
    seen.idle.add(idle.kind + '/' + idle.frame); seen.walk.add(walk.kind + '/' + walk.frame);
    for (let a = 1; a >= 0; a -= 0.25) { const at = G.heroPoseFrame(false, a, c / 10, true); seen.attack.add(at.kind + '/' + at.frame); }
  }
  assert.strictEqual(JSON.stringify([...seen.idle]), JSON.stringify(['0/0']), 'standing must be one frame (the walk frame that stands)');
  const walkFrames = [...seen.walk].map(s => +s.split('/')[1]).sort((a, b) => a - b);
  assert.strictEqual(JSON.stringify(walkFrames), JSON.stringify([0, 1, 2]), 'walk must cycle three frames, saw ' + walkFrames);
  const attackFrames = [...seen.attack].filter(s => s.startsWith('2/')).map(s => +s.split('/')[1]).sort((a, b) => a - b);
  assert.strictEqual(JSON.stringify(attackFrames), JSON.stringify([0, 1]), 'attack must be two frames, saw ' + attackFrames);
  assert.strictEqual(JSON.stringify([G.heroPoseFrame(false, 0, 0, true).count, G.heroPoseFrame(true, 0, 0, true).count,
    G.heroPoseFrame(false, 1, 0, true).count]), JSON.stringify([1, 3, 2]), 'the counts the weapon code reads');
});

t('packTex composes the new cells with the owner\'s pivots, into the game\'s own layout', () => {
  packTexRun('Knight');
  packTexRun('Sniper');

  function packTexRun(cls) {
    const body = G.packBodyFor(cls, 0);
    const ap = AP.classes[body];
    assert.ok(ap, cls + ' must have an artifact record (' + body + ')');
    G.packCache.clear();
    draws.length = 0;
    const tex = G.packTex({ cls, sex: 'm', hair: 0, tier: 0 });
    assert.ok(tex, 'packTex must return a texture');
    assert.strictEqual(tex.cv.width, PK.cellW * 8, 'the canvas must cover 8 columns');
    assert.strictEqual(tex.cv.height, PK.cellH * 24, 'and 24 rows');
    const frames = PK.frames.reduce((a, b) => a + b, 0) * 8;      // 15 per direction
    assert.strictEqual(draws.length, frames * 2, cls + ': a body and a head per cell, saw ' + draws.length +
      ' for ' + (frames * 2));
    let seen = 0, at = 0;
    for (let a = 0; a < 3; a++) for (let d = 0; d < 8; d++) for (let f = 0; f < PK.frames[a]; f++) {
      const bodyDraw = draws[at++], headDraw = draws[at++];
      const cell = G.animPackCell(AP, d, a, f), pv = ap.pivots[cell];
      assert.strictEqual(bodyDraw[0].src, ap.atlas, cls + ' dir' + d + ' kind' + a + ' f' + f + ': body must come from the artifact');
      assert.strictEqual(bodyDraw[1], cell * 96, cls + ' dir' + d + ' kind' + a + ' f' + f + ': body source x must be the mapped cell');
      assert.strictEqual(bodyDraw[5], f * PK.cellW + PK.padL, 'body must sit at padL');
      assert.strictEqual(bodyDraw[6], (a * 8 + d) * PK.cellH + PK.padT, 'body must sit at padT');
      assert.strictEqual(headDraw[1], d * 64, 'the head art must be the drawn direction');
      assert.strictEqual(headDraw[2], 0, 'hair row 0');
      assert.strictEqual(headDraw[5], f * PK.cellW + PK.padL + pv[0] - 32, cls + ' head x must be pivot-32');
      assert.strictEqual(headDraw[6], (a * 8 + d) * PK.cellH + PK.padT + pv[1] - 48, cls + ' head y must be pivot-48');
      seen++;
    }
    assert.strictEqual(seen, 120, '15 cells per direction, 8 directions');
  }
});

t('without the artifact the old class pack still draws (the fallback stays)', () => {
  const other = { window: {}, document: { createElement: () => canvas }, $: () => null, S: null,
    C: () => ({ n: 'Archer', tier: 1 }), THREE, Image: FakeImage };
  vm.createContext(other);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'sprite_pack_data.js'), 'utf8'), other);
  vm.runInContext(slice + '\nthis.__x={packTex,packCache,packBodyFor,heroPoseFrame,animPackCell};', other);
  const g2 = other.__x, PK2 = other.window.SPRITE_PACK;
  draws.length = 0;
  g2.packCache.clear();
  g2.packTex({ cls: 'Knight', sex: 'm', hair: 0, tier: 0 });
  const frames = PK2.frames.reduce((a, b) => a + b, 0) * 8;
  assert.strictEqual(draws.length, frames * 2, 'the old pack must draw exactly as before');
  assert.strictEqual(draws[0][1], 0, 'first body tile from the old atlas');
  assert.deepStrictEqual([g2.heroPoseFrame(false, 0, 0, true).count, g2.heroPoseFrame(true, 0, 0, true).count,
    g2.heroPoseFrame(false, 1, 0, true).count], [1, 8, 6], 'the old counts when there is no artifact');
});

t('index.html loads the artifact next to the class pack', () => {
  assert.ok(/<script src="assets\/anim_pack_data\.js\?v=\d+"><\/script>/.test(src), 'the artifact must be loaded');
  assert.ok(/<script src="assets\/sprite_pack_data\.js\?v=\d+"><\/script>/.test(src), 'and the class pack must stay');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
