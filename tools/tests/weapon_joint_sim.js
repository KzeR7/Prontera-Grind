// The weapon is held in the hand: every attack frame of every class body has a hand joint
// measured from the art (assets/weapon_joints_data.js), and the game's own placement code
// must put the weapon exactly there - on the frame being played, so it cannot slide.
//   node tools/tests/weapon_joint_sim.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const root = __dirname + '/../..';
const src = fs.readFileSync(root + '/index.html', 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('missing ' + a);
  return src.slice(i, j);
};
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('weapon joints: the weapon is pinned to the measured hand\n');

const dataSrc = fs.readFileSync(root + '/assets/weapon_joints_data.js', 'utf8');
const dataBox = { window: {} };
vm.createContext(dataBox);
vm.runInContext(dataSrc + '\nthis.__j={WEAPON_JOINTS:window.WEAPON_JOINTS,SRC:window.WEAPON_JOINTS_SRC};', dataBox);
const JOINTS = dataBox.__j.WEAPON_JOINTS, SRC = dataBox.__j.SRC;

const pack = { padL: 15, padT: 38 };
const poseBox = { window: { SPRITE_PACK: pack, WEAPON_JOINTS: JOINTS } };
vm.createContext(poseBox);
vm.runInContext(grab('const SPR_W=64', 'function drawWep(') +
  '\nthis.__pose={poseOf,weaponHandPoint,weaponSpritePixel,weaponJointPixel,PACK_WEAPON_ADJUST,SPR_W,SPR_H};', poseBox);
const P = poseBox.__pose;

const BODIES = Object.keys(JOINTS);
const DIRS = 8, FRAMES = 6;

t('the joints file covers every body, all 8 facings and all 6 attack frames', () => {
  assert.ok(BODIES.length >= 19, 'expected 19+ bodies, got ' + BODIES.length);
  for (const b of BODIES) {
    for (let d = 0; d < DIRS; d++) {
      const rows = JOINTS[b][d] || JOINTS[b][String(d)];
      assert.ok(rows, b + ' missing direction ' + d);
      assert.strictEqual(rows.length, FRAMES, b + ' dir ' + d + ' has ' + rows.length + ' frames');
    }
  }
});

t('every joint is a paint-ready pixel inside the 96x96 body cell', () => {
  for (const b of BODIES) for (let d = 0; d < DIRS; d++) for (let f = 0; f < FRAMES; f++) {
    const p = JOINTS[b][d][f];
    assert.ok(Array.isArray(p) && p.length === 2, b + ' ' + d + '/' + f + ' not a pair');
    for (const v of p) assert.ok(Number.isInteger(v) && v >= 0 && v <= 96,
      b + ' ' + d + '/' + f + ' out of cell: ' + v);
  }
});

t('the hand never jumps between attack frames (the sliding-weapon bug)', () => {
  let worst = 0, where = '';
  for (const b of BODIES) for (let d = 0; d < DIRS; d++) {
    const rows = JOINTS[b][d];
    for (let f = 1; f < FRAMES; f++) {
      const dx = rows[f][0] - rows[f - 1][0], dy = rows[f][1] - rows[f - 1][1];
      const dist = Math.hypot(dx, dy);
      if (dist > worst) { worst = dist; where = b + ' dir ' + d + ' frame ' + f; }
    }
  }
  assert.ok(worst <= 28, 'hand moved ' + worst.toFixed(1) + 'px between frames (' + where + ')');
});

t('every joint was found on the drawn body (a hand, or a gloved extremity)', () => {
  for (const b of BODIES) for (let d = 0; d < DIRS; d++) {
    const s = SRC[b][d] || SRC[b][String(d)];
    assert.ok(s && s.length === FRAMES, b + ' dir ' + d + ' has no source record');
    assert.ok(/^[HE]+$/.test(s), b + ' dir ' + d + ' source codes: ' + s);
  }
});

t('the game places the weapon exactly on the joint for the frame being played', () => {
  for (const b of BODIES) for (let d = 0; d < DIRS; d++) for (let f = 0; f < FRAMES; f++) {
    // packed:true -> the game must use the measured joint, mapped into the packed cell
    const got = P.weaponSpritePixel(d, 2, f, 'sword', true, FRAMES, b);
    const want = [pack.padL + JOINTS[b][d][f][0], pack.padT + JOINTS[b][d][f][1]];
    assert.deepStrictEqual([got[0], got[1]], want, b + ' ' + d + '/' + f + ' -> ' + JSON.stringify(got.slice(0, 2)));
  }
});

t('the weapon follows the hand through the swing instead of a fixed offset from it', () => {
  // the old model put the grip at the same arm-model anchor shifted by PACK_WEAPON_ADJUST;
  // measure how far that drifts from the measured hand, frame by frame.  A constant gap
  // would mean no improvement; the fix is worth it when the gap CHANGES across the swing.
  let drifting = 0, checked = 0, worstSpread = 0;
  for (const b of BODIES) for (let d = 0; d < DIRS; d++) {
    const gaps = [];
    for (let f = 0; f < FRAMES; f++) {
      const model = P.weaponSpritePixel(d, 2, f, 'sword', false, FRAMES, b);   // packed=false = old model
      const joint = JOINTS[b][d][f];
      gaps.push(Math.hypot(model[0] - (pack.padL + joint[0]), model[1] - (pack.padT + joint[1])));
    }
    const spread = Math.max(...gaps) - Math.min(...gaps);
    worstSpread = Math.max(worstSpread, spread);
    checked++;
    if (spread > 6) drifting++;
  }
  assert.ok(drifting >= 0.6 * checked,
    'only ' + drifting + ' of ' + checked + ' views show the old model sliding (worst spread ' + worstSpread.toFixed(1) + 'px)');
});

t('the game loads the joints file and consults it (source pins)', () => {
  assert.ok(src.includes('<script src="assets/weapon_joints_data.js?v=1"></script>'),
    'index.html must load assets/weapon_joints_data.js');
  assert.ok(src.includes('function weaponJointPixel(body,dir,fr){') &&
            src.includes('const J=window.WEAPON_JOINTS,PK=window.SPRITE_PACK;'),
    'the placement helper must read window.WEAPON_JOINTS');
  assert.ok(src.includes('const j=weaponJointPixel(body||\'thief\',dir,fr);'),
    'weaponSpritePixel must ask for the measured joint');
  assert.ok(src.includes('s.userData.body=packBodyFor(opt.cls,opt.tier)'),
    'the hero sprite must remember which body it wears');
  assert.ok(src.includes("const PACK_WEAPON_ADJUST={bow:[-5,-40]"),
    'the sine-model correction stays for the fallback path only');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
