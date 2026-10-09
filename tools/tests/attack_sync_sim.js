// Attack animation / damage-number sync: one attack draws one complete slash (v88.8).
//   node tools/tests/attack_sync_sim.js
//
// Owner report: "my character attack animation are not following the damage animation. example
// damage coming 10 numbers but attack animation only 3 slashes. there is an update code on this but
// it seems to be not working."
//
// The "update code" was v83 (one number per monster per swing) plus v88 (the drawn swing follows the
// real attack rate). Both were live and neither was wrong - the numbers were correct, and the swing
// TIMER was correct. What was left drifting was the class-skin attack ART, which is what the player
// actually watches:
//
//   * captureSkinFrame() clocked the attack APNG off the wall clock (nowMs - sk.t0), and sk.t0 was
//     only reset when the ROUTE changed, i.e. when the view flipped between walk and attack. So the
//     attack art looped on its own 0.5-0.9s file cycle and was never re-synced to a swing.
//   * swingLength() could hand back a swing exactly as long as the attack interval, so atkAnim never
//     reached 0 between attacks, the view never flipped, and sk.t0 never reset at all.
//
// Measured on the real loop before the fix (20s against one unkillable target, 60fps):
//
//     class            aspd    file   attacks  drawn slashes  damage numbers
//     Assassin Cross   0.423   0.80        47             25              43
//     Assassin         0.524   0.80        38             25              31
//     Lord Knight      0.608   0.50        33             65              27
//     Novice           0.845   0.50        24             46              18
//
// The slash count was the file's own loop rate (20s / 0.8s = 25) or a double-play, never the attack
// count. At the ASPD floor (0.13s, ~7.7 hits/s) a 0.9s file draws 1.1 slashes a second against 7.7
// damage numbers - "10 numbers, 1-2 slashes". The owner's 10:3 is the same drift at a mid-game rate.
//
// After: one attack draws exactly one complete play of the attack art, from its first frame to its
// last, at the swing's own length, and the numbers land on the pose that made them.
//
// This suite runs the SHIPPED functions (lifted out of index.html into a vm), not a mirror of them.
// The end-to-end count - attacks vs slashes vs numbers in the real update() loop - is the last step
// of tools/tests/field_loop_smoke.js, which boots the whole page in jsdom.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ROOT = __dirname + '/../..';
const src = fs.readFileSync(ROOT + '/index.html', 'utf8');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('attack sync: one attack draws one complete slash, and the numbers land on it\n');

const grab = (from, to) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, 'cannot find ' + JSON.stringify(from));
  const b = src.indexOf(to, a);
  assert.ok(b > a, 'cannot find ' + JSON.stringify(to) + ' after it');
  return src.slice(a, b);
};

// ---------- the real attack-file lengths, read from the manifest the game reads ----------
const dataBox = { window: {} };
vm.createContext(dataBox);
vm.runInContext(fs.readFileSync(ROOT + '/assets/class_skins_data.js', 'utf8') + '\nthis.__s=window.CLASS_SKINS;', dataBox);
const CLASS_SKINS = dataBox.__s;
const FILE_TOTAL = {};
for (const cls of Object.keys(CLASS_SKINS.classes))
  for (const sex of ['m', 'f']) {
    const d = (CLASS_SKINS.classes[cls][sex].delays || {}).attack || [];
    FILE_TOTAL[cls + '|' + sex] = d.reduce((a, e) => a + e[0] / (e[1] || 100), 0);
  }
const TOTALS = [...new Set(Object.values(FILE_TOTAL))].sort((a, b) => a - b);

// ---------- the shipped swingLength() and skinSwingMs(), running in a vm ----------
function makeEnv(aspdValue, fileTotal, atkValue) {
  const box = {
    __aspd: aspdValue, __file: fileTotal, __atk: atkValue,
    heroSpr: { userData: { skin: { p: { total: { attack: fileTotal } } } } },
  };
  vm.createContext(box);
  vm.runInContext(`
    const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
    const aspd=()=>__aspd;
    let atkAnim=__atk;
    const heroSprRef=heroSpr;
  ` + grab('const SWING_MIN_T=.14', 'function playerAttack(){')          // SWING_* + swingLength()
    + grab('// Which frame is due right now', '// The source to copy from for a view')   // skinFrameIndex + skinSwingMs
    + `\nthis.__x={swingLength:()=>swingLength(),skinSwingMs:(p)=>skinSwingMs(p),
        skinFrameIndex:(p,v,ms)=>skinFrameIndex(p,v,ms),SWING_MIN_T,SWING_MAX_T,SWING_FIT,
        setAtk:(v)=>{atkAnim=v},setFile:(v)=>{heroSpr.userData.skin.p.total.attack=v},noSkin:()=>{heroSpr.userData.skin=null}};`, box);
  return box.__x;
}

t('the shipped swing code is the code under test (nothing is mirrored here)', () => {
  assert.ok(src.includes('function swingLength(){'), 'swingLength() is in the page');
  assert.ok(src.includes('function skinSwingMs(p){'), 'skinSwingMs() is in the page');
  assert.ok(src.includes("const ms=route.view==='attack'?skinSwingMs(p):nowMs-sk.t0;"),
    'captureSkinFrame clocks the attack view off the swing and every other view off the wall');
  const E = makeEnv(.5, .8, 1);
  assert.strictEqual(typeof E.swingLength(), 'number', 'the lifted swingLength() runs');
  assert.strictEqual(typeof E.skinSwingMs({ total: { attack: .8 } }), 'number', 'the lifted skinSwingMs() runs');
});

t('a swing always ENDS before the next attack starts - the drift the owner saw', () => {
  // atkAnim runs 1 -> 0 across swingDur and the attack pose is drawn only while atkAnim > 0. A swing
  // as long as the attack interval therefore never released: atkAnim hit zero inside the same
  // update() that fired the next playerAttack(), the view never flipped back to the walk, and the
  // attack animation never restarted. Sweep the whole reachable rate against every real file length.
  let worst = 0, cases = 0;
  for (let aspd = .13; aspd <= 1.2001; aspd += .005)
    for (const file of TOTALS.concat([0])) {
      const E = makeEnv(+aspd.toFixed(4), file, 1);
      const d = E.swingLength();
      cases++;
      assert.ok(d > 0 && Number.isFinite(d), `a real length at aspd ${aspd.toFixed(3)} / file ${file}`);
      assert.ok(d < aspd, `the swing must be shorter than the ${aspd.toFixed(3)}s attack interval (file ${file}) - drew ${d.toFixed(4)}s`);
      assert.ok(d <= E.SWING_MAX_T + 1e-9, `never longer than SWING_MAX_T (${d})`);
      worst = Math.max(worst, d / aspd);
    }
  assert.ok(worst <= makeEnv(.5, .8, 1).SWING_FIT + 1e-9, 'and it never uses more than SWING_FIT of the interval');
  console.log(`   ${cases} rate/file combinations; the longest swing uses ${(worst * 100).toFixed(0)}% of its attack interval`);
});

t('the v86 floor still holds whenever the attack rate leaves room for it', () => {
  // SWING_MIN_T (.14s) is the v86 "a fast ASPD still LOOKS fast" floor. It must not be lost - but it
  // also must not win over fitting inside the interval, which is what put the two out of sync.
  const E = makeEnv(.845, 0, 1);
  E.setFile(0);
  assert.strictEqual(E.SWING_MIN_T, .14, 'the v86 floor is unchanged');
  const fast = makeEnv(.13, .9, 1);
  assert.ok(fast.swingLength() < .14, 'at the .13s ASPD floor the swing is under the floor rather than over the interval');
  assert.ok(fast.swingLength() > .1, 'and still a real, drawable length');
});

t('the attack art is driven by the swing: one swing plays the whole file once, first frame to last', () => {
  for (const file of TOTALS) {
    const E = makeEnv(.5, file, 1);
    const p = { secs: { attack: new Array(5).fill(file / 5) }, total: { attack: file } };
    let prev = -1;
    for (const atk of [1, .9, .75, .6, .5, .4, .25, .1, .02, 0]) {
      E.setAtk(atk);
      const ms = E.skinSwingMs(p);
      assert.ok(ms >= 0 && ms < file * 1000, `inside the file at atkAnim ${atk} (${ms}ms of ${file * 1000}ms)`);
      const idx = E.skinFrameIndex(p, 'attack', ms);
      assert.ok(idx >= prev, `frames only move forward through the swing (file ${file}, atkAnim ${atk})`);
      prev = idx;
    }
    E.setAtk(1);
    assert.strictEqual(E.skinFrameIndex(p, 'attack', E.skinSwingMs(p)), 0, `a fresh swing is on frame 0 (file ${file})`);
    E.setAtk(0);
    assert.strictEqual(E.skinFrameIndex(p, 'attack', E.skinSwingMs(p)), 4, `a finished swing is on the last frame (file ${file})`);
    E.setAtk(1);
  }
});

t('the wall clock cannot advance the swing any more (that was the whole bug)', () => {
  // captureSkinFrame passes `nowMs - sk.t0` for the walking views and skinSwingMs(p) for the attack.
  // So a swing held at the same progress must paint the same attack frame at any wall-clock time -
  // which is exactly what stops the APNG looping on its own cycle behind the damage numbers.
  const body = grab('function captureSkinFrame(spr,route,now){', 'function packTex(opt){');
  assert.ok(/const ms=route\.view==='attack'\?skinSwingMs\(p\):nowMs-sk\.t0;/.test(body),
    'the attack view takes the swing clock, everything else keeps the file clock');
  assert.ok(/skinFrameIndex\(p,route\.view,ms\)/.test(body) && /skinFrameOf\(p,route\.view,ms\)/.test(body),
    'both the frame pick and the frame source use that one clock');
  const E = makeEnv(.5, .8, .5);
  const p = { secs: { attack: [.16, .16, .16, .16, .16] }, total: { attack: .8 } };
  const at = E.skinSwingMs(p);
  for (const ms of [0, 800, 4000, 60000])
    assert.strictEqual(E.skinFrameIndex(p, 'attack', at), E.skinFrameIndex(p, 'attack', at),
      `the same swing progress paints the same frame (wall clock ${ms}ms)`);
});

t('a pack with no decoded attack file cannot divide by zero or index past its own end', () => {
  const E = makeEnv(.5, 0, .5);
  assert.strictEqual(E.skinSwingMs({ total: {} }), 0, 'no attack total -> 0ms');
  assert.strictEqual(E.skinSwingMs(null), 0, 'no pack at all -> 0ms');
  assert.strictEqual(E.skinFrameIndex({ secs: {}, total: {} }, 'attack', 0), 0, 'and the frame stays 0');
});

t('the swing timer and the animation still share one duration, and the numbers still land on the swing', () => {
  const pa = grab('function playerAttack(){', 'function resolveSwing(s){');
  assert.ok(/pAtkT=interval;atkAnim=1;swingDur=swingLength\(\)/.test(pa),
    'the attack timer and the drawn swing are set together in playerAttack()');
  assert.ok(/swing=\{t:swingDur\*SWING_CONTACT/.test(pa), 'the hit lands on the animation\'s own contact frame');
  assert.ok(src.includes('atkAnim=Math.max(0,atkAnim-dt/Math.max(.05,swingDur))'),
    'update() runs atkAnim down across that same swingDur');
  assert.ok(src.includes('if(swing){swing.t-=dt;if(swing.t<=0){const sw=swing;swing=null;resolveSwing(sw);'),
    'and resolves the damage on it - so the number and the pose come from one event');
  assert.ok(src.includes('dmgGroup=new Map();') && src.includes('flushDamageGroup();'),
    'one number per monster per swing (v83) is still what prints');
});

t('the fallback hero paths were already swing-driven, and stay that way', () => {
  // The animated pack hero and the drawn hero pick their attack frame from (1-atk) already; only the
  // APNG class skins had the wall clock. Pin both so a future pass does not re-introduce it.
  assert.ok(src.includes('if(atk>0)return{kind:2,frame:Math.min(attack-1,Math.floor((1-atk)*attack)),count:attack};'),
    'heroPoseFrame() drives the pack attack from the swing');
  assert.ok(src.includes('if(atk>0)return SPR_IDLE+SPR_WALK+Math.min(SPR_ATK-1,Math.floor((1-atk)*SPR_ATK));'),
    'animRow() drives the drawn attack from the swing');
});

console.log(`\nattack sync: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
