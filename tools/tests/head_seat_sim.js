// The heads in the weapon review page: every class, EVERY view (mirrored ones included), seated
// where the picker seats them. This is the pin for the 2026-10-04 bug: the bake read only the
// drawn-view pivots, so NE/E/SE shipped with no head at all and the owner saw "heads all wrong".
//   node tools/tests/head_seat_sim.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { execFileSync } = require('child_process');
const { decodePNG, un64 } = require(path.join(__dirname, '..', 'png_io.js'));
const ROOT = path.join(__dirname, '..', '..');
const BODY = 96;

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('head seats: every view has a head, at the picker\'s own pivot\n');

const seatsFile = path.join(ROOT, 'tools', 'head_seats.json');
const before = fs.readFileSync(seatsFile, 'utf8');
const seats = JSON.parse(before).seats;
const DEFAULTS = (() => { const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools', 'sprite_picker_defaults.js'), 'utf8'), sb);
  return sb.window.SPRITE_PICKER_DEFAULTS; })();
const dataRaw = fs.readFileSync(path.join(ROOT, 'tools', 'weapon_review_data.js'), 'utf8');
const R = JSON.parse(dataRaw.slice(dataRaw.indexOf('{')).replace(/;\s*$/, ''));
const ATLAS = (() => { const sb = { window: {} }; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'sprite_pack_data.js'), 'utf8'), sb);
  return decodePNG(un64(sb.window.SPRITE_PACK.heads.male)); })();

t('the seat file covers every class, all 8 views, 6 frames, with no gaps', () => {
  assert.strictEqual(Object.keys(seats).length, 19, 'classes');
  let n = 0;
  for (const cls of Object.keys(seats)) {
    assert.strictEqual(seats[cls].length, 8, cls + ': view rows');
    for (let v = 0; v < 8; v++) {
      assert.strictEqual(seats[cls][v].length, 6, cls + ' view ' + v + ': frames');
      for (let f = 0; f < 6; f++) {
        const s = seats[cls][v][f];
        assert.ok(Array.isArray(s) && s.length === 2 && Number.isFinite(s[0]) && Number.isFinite(s[1]),
          cls + ' ' + v + '/' + f + ' seat: ' + JSON.stringify(s));
        n++;
      }
    }
  }
  assert.strictEqual(n, 912, 'pivots');
});

t('the drawn views still carry the owner\'s own numbers, untouched', () => {
  let n = 0;
  for (const cls of Object.keys(seats)) for (let v = 0; v < 5; v++) for (let f = 0; f < 6; f++) {
    const want = DEFAULTS.head[cls + '|' + v + '|' + f];
    assert.ok(want, cls + '|' + v + '|' + f + ' missing from the picker defaults');
    // the defaults come out of a vm context, so compare values, not array identities
    assert.strictEqual(JSON.stringify(seats[cls][v][f]), JSON.stringify(want),
      cls + '|' + v + '|' + f + ' drifted: seat ' + JSON.stringify(seats[cls][v][f]) +
      ' vs picker ' + JSON.stringify(want));
    n++;
  }
  assert.strictEqual(n, 570, 'drawn pivots');
});

t('the mirrored views (NE/E/SE) have real seats, not blanks', () => {
  let n = 0;
  for (const cls of Object.keys(seats)) for (let v = 5; v < 8; v++) for (let f = 0; f < 6; f++) n++;
  assert.strictEqual(n, 342, 'mirrored pivots');
});

t('the seat file is in step with the picker (regenerating changes nothing)', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'head_seats.js')], { cwd: ROOT, stdio: 'pipe' });
  assert.strictEqual(fs.readFileSync(seatsFile, 'utf8'), before,
    'tools/head_seats.json is stale - run `node tools/head_seats.js` and commit it');
});

t('EVERY cell of the review data has its head, at exactly that pivot', () => {
  const problems = [];
  let checked = 0;
  for (const cls of R.meta.classes) {
    const grid = decodePNG(un64(R.cell[cls]));
    for (let v = 0; v < 8; v++) for (let f = 0; f < 6; f++) {
      const seat = seats[cls][v][f];
      const dx = Math.round(seat[0]) - 32, dy = Math.round(seat[1]) - 48;   // the bake's paste
      let hits = 0, n = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const ai = (y * ATLAS.w + v * 64 + x) * 4;
        if (ATLAS.px[ai + 3] !== 255) continue;                             // opaque pixels land exact
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= BODY || ty >= BODY) continue;
        n++;
        const ti = ((v * BODY + ty) * grid.w + (f * BODY + tx)) * 4;
        if (ATLAS.px[ai] === grid.px[ti] && ATLAS.px[ai + 1] === grid.px[ti + 1] &&
            ATLAS.px[ai + 2] === grid.px[ti + 2]) hits++;
      }
      const frac = n ? hits / n : 0;
      if (frac < 0.95) problems.push(cls + ' ' + v + '/' + f + ' ' + (frac * 100).toFixed(0) + '%');
      checked++;
    }
  }
  assert.deepStrictEqual(problems, [], 'headless or misplaced: ' + problems.slice(0, 8).join(', '));
  assert.strictEqual(checked, 912, 'cells checked');
});

t('the standalone twin carries that same, fixed data', () => {
  const standalone = fs.readFileSync(path.join(ROOT, 'tools', 'weapon_review_standalone.html'), 'utf8');
  for (const cls of ['Novice', 'Knight', 'Assassin Cross']) {
    const uri = '"' + cls + '":"data:image/png;base64,' + R.cell[cls].split(',')[1].slice(0, 80);
    assert.ok(standalone.includes(uri), cls + ': standalone is stale - re-run tools/patch_review_heads.js');
  }
  assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(standalone), 'standalone pulls a side file');
});

t('the bake reads the seat file (so a regeneration cannot drop the mirrored heads)', () => {
  const bake = fs.readFileSync(path.join(ROOT, 'tools', 'weapon_bake.py'), 'utf8');
  assert.ok(/head_seats\.json/.test(bake), 'weapon_bake.py never mentions head_seats.json');
  assert.ok(/def head_seat\(/.test(bake), 'weapon_bake.py has no head_seat() lookup');
  const uses = (bake.match(/seat = head_seat\(/g) || []).length;
  assert.ok(uses >= 2, 'only ' + uses + ' call site(s) use head_seat() - the proof sheet is one too');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
