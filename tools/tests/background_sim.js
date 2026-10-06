// The background clock: the game has to keep grinding when the tab is not on screen.
//   node tools/tests/background_sim.js
//
// The rules being tested:
//   * an animation frame is one small step, exactly as before (a 16ms frame is not rounded up to
//     the 0.1s ceiling);
//   * when the browser stops delivering frames - a hidden tab - the hidden-tab timer drives the
//     sim on its own and the character keeps fighting;
//   * the same second is never simulated twice: coming back does not replay the hidden time on
//     top of what the timer already did, and neither does a later frame;
//   * nothing is drawn while the tab is hidden (that is what keeps a background tab cheap);
//   * a heavily throttled tab (one wake a minute) still gets the whole minute, and one wake never
//     replays more than the catch-up cap - the welcome-back line says when the cap was hit;
//   * the welcome-back line reports the real away time, the kills and Zeny the sim earned, and a
//     level-up;
//   * the "keep grinding in the background" setting, when off, pauses instead: the hidden time is
//     dropped rather than simulated, and the game continues from where it was;
//   * the speed multiplier (x1/x2/x4) still applies to every slice the background simulates.
//
// This drives the REAL clock block pulled out of index.html with a fake wall clock, a fake
// document and fake timers, so the assertions read the same code the browser runs. What it cannot
// prove is the browser's own throttling policy - it proves the game catches up whatever the
// browser hands it, which is the part the game controls.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const clock = grab('// ---------- the clock: one simulation', 'resize();respawn=.3;');

const harness = `
// ---- a fake page: a wall clock we control, a document we can hide, and timers we can fire ----
// update(dt) is called once per speed sub-step, so 'gameTime' is how much the character grinds and
// 'simWall' is how much real time the clock handed out (dt/speed per call, speed calls per slice).
const logs=[];
let S=null,speed=1,zenyEarned=0,saves=0,draws=0,steps=0,simWall=0,gameTime=0,maxDt=0,frames=0,ticks=0;
let nowMs=1000,hidden=false,frameCb=null;
const docHandlers={};
const performance={now:()=>nowMs};
const document={get hidden(){return hidden},
  addEventListener:(k,f)=>{(docHandlers[k]=docHandlers[k]||[]).push(f)}};
const timers=[];
const setInterval=f=>{timers.push(f);return timers.length};
const requestAnimationFrame=f=>{frameCb=f};
function update(dt){steps++;maxDt=Math.max(maxDt,dt);simWall+=dt/speed;gameTime+=dt;
  if(S){S.kills=Math.floor(gameTime);zenyEarned=Math.floor(gameTime*10)}}
function kitTick(dt){}
function draw(){draws++}
function log(m,cls,cat){logs.push({m,cls,cat})}
function save(){saves++}
${clock}
requestAnimationFrame(now=>loop(now));
this.__bg={SIM_STEP,SIM_CATCHUP,SIM_BG_MS,logs,
  get S(){return S},set S(v){S=v},
  set speed(v){speed=v},
  stat:()=>({simWall,gameTime,steps,frames,draws,saves,maxDt,ticks}),
  wall:()=>nowMs,clock:()=>simAt,zeny:()=>zenyEarned,
  pass:ms=>{nowMs+=ms},
  hide:()=>{hidden=true;(docHandlers.visibilitychange||[]).forEach(f=>f())},
  show:()=>{hidden=false;(docHandlers.visibilitychange||[]).forEach(f=>f())},
  frame:()=>{frames++;if(!frameCb)throw new Error('the loop stopped asking for frames');const f=frameCb;frameCb=null;f(nowMs)},
  wake:()=>{ticks++;for(const f of timers)f()},
  timerMs:()=>timers.length};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const bg = sb.__bg;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, wanted ${want} ± ${tol}`);
console.log('background: the game keeps grinding when the tab is hidden\n');

t('the clock keeps one entry point and one dt ceiling', () => {
  assert.strictEqual(bg.timerMs(), 1, 'exactly one background interval is registered');
  assert.ok(bg.SIM_STEP === 0.1 && bg.SIM_BG_MS === 1000, 'the step and the wake cadence are the documented ones');
  assert.ok(src.includes('function loop(now){try{simAdvance(now);draw()}'), 'the frame loop still drives the same clock and draws');
  assert.ok(src.includes('for(let i=0;i<speed;i++){update(dt);kitTick(dt)}'), 'every slice still honours the speed setting');
  assert.ok(src.includes('setInterval(save,5000)'), 'the five-second autosave is untouched');
  assert.ok(src.includes("document.addEventListener('visibilitychange'"), 'the hide/show wiring is in the game');
  assert.ok(src.includes('setInterval(bgTick,SIM_BG_MS)'), 'the hidden-tab ticker is in the game');
});

t('a visible frame is one small step, not a 0.1s clamp', () => {
  bg.S = { lv: 1, exp: 0, hp: 100, zeny: 0, kills: 0 };
  bg.show();
  const a = bg.stat();
  for (let i = 0; i < 10; i++) { bg.pass(16); bg.frame(); }
  const b = bg.stat();
  near(b.simWall - a.simWall, 0.16, 1e-9, 'ten 16ms frames of sim');
  assert.strictEqual(b.steps - a.steps, 10, 'one step per frame');
  assert.strictEqual(b.draws - a.draws, 10, 'one draw per frame');
});

t('a hidden tab keeps grinding with no animation frames at all', () => {
  const k0 = bg.S.kills, z0 = bg.zeny();
  const a = bg.stat();
  bg.hide();                                   // the tab goes to the background and saves
  assert.strictEqual(bg.stat().draws, a.draws, 'hiding itself draws nothing');
  for (let s = 0; s < 30; s++) { bg.pass(1000); bg.wake(); }
  const b = bg.stat();
  near(b.simWall - a.simWall, 30, 0.002, 'thirty hidden seconds of sim');
  assert.strictEqual(b.frames - a.frames, 0, 'no animation frame ran');
  assert.strictEqual(b.draws - a.draws, 0, 'nothing was drawn while hidden');
  assert.ok(b.saves > a.saves, 'background progress was saved');
  assert.ok(bg.S.kills > k0 && bg.zeny() > z0, 'the character really fought: kills and Zeny grew');
  console.log(`       ${bg.S.kills - k0} kills, ${bg.zeny() - z0} Zeny in 30 hidden seconds`);
});

t('a throttled tab (one wake a minute) still gets the whole minute', () => {
  const a = bg.stat();
  for (let s = 0; s < 6; s++) { bg.pass(10000); bg.wake(); }   // six 10s wakes = 1 minute
  near(bg.stat().simWall - a.simWall, 60, 0.002, 'a minute of sim from six wakes');
});

t('coming back reports the away time and does not replay it twice', () => {
  bg.pass(1000); bg.show();                                // settle: the tab is on screen again
  const k0 = bg.S.kills, z0 = bg.zeny();                   // the counters as the game snapshots them
  bg.hide();
  for (let s = 0; s < 30; s++) { bg.pass(1000); bg.wake(); }
  const before = bg.logs.length;
  bg.pass(1000); bg.show();
  assert.strictEqual(bg.logs.length, before + 1, 'exactly one welcome-back line');
  const line = bg.logs[bg.logs.length - 1];
  assert.strictEqual(line.m, `Away 31s · +${bg.S.kills - k0} kills · +${(bg.zeny() - z0).toLocaleString()} Zeny`, 'the line reports the real deltas');
  assert.ok(line.cat.includes('zeny'), 'the line is in a log filter the player can find it under');
  const a = bg.stat();
  bg.pass(16); bg.frame();
  near(bg.stat().simWall - a.simWall, 0.016, 1e-9, 'the first frame after returning is a normal frame');
});

t('one wake never replays more than the catch-up cap, and the line says so', () => {
  bg.pass(1000); bg.show();
  bg.hide();
  const a = bg.stat();
  bg.pass(3 * 3600 * 1000);                    // three hours: the laptop slept with the tab open
  bg.wake();
  near(bg.stat().simWall - a.simWall, bg.SIM_CATCHUP, 1e-9, 'one wake replays exactly the cap');
  bg.pass(1); bg.show();
  const line = bg.logs[bg.logs.length - 1].m;
  assert.match(line, /^Away 3h \(10m of grinding\)/, 'the line admits the cap: ' + line);
});

t('a stall on a visible tab is replayed when the frames come back', () => {
  const a = bg.stat();
  bg.pass(3000);                               // three seconds with no frame: a stall, not a hide
  bg.wake(); bg.wake();
  assert.strictEqual(bg.stat().simWall, a.simWall, 'the ticker does not double-drive a visible tab');
  bg.frame();
  near(bg.stat().simWall - a.simWall, 3, 0.002, 'the stalled time was simulated when the frame returned');
  assert.strictEqual(bg.stat().draws - a.draws, 1, 'and it still drew once');
  assert.ok(bg.stat().maxDt <= bg.SIM_STEP + 1e-9, 'the catch-up ran in capped steps');
});

t('every slice stays inside the game\'s own dt ceiling', () => {
  assert.ok(bg.stat().maxDt <= bg.SIM_STEP + 1e-9, 'no step was bigger than SIM_STEP: ' + bg.stat().maxDt);
  assert.ok(bg.stat().maxDt > 0, 'the sim really ran');
});

t('the speed multiplier applies to background slices too', () => {
  bg.speed = 4;
  bg.hide();
  const a = bg.stat();
  for (let s = 0; s < 5; s++) { bg.pass(1000); bg.wake(); }
  const b = bg.stat();
  near(b.simWall - a.simWall, 5, 0.002, 'five hidden seconds of wall-clock sim');
  near(b.gameTime - a.gameTime, 20, 0.002, 'and the character ground four times as much');
  assert.strictEqual(b.steps - a.steps, 200, 'four sub-steps on each of the 50 0.1s slices');
  bg.speed = 1;
  bg.pass(1000); bg.show();
});

t('background grinding is permanent - no save field can pause a hidden tab', () => {
  // v57: the owner retired the tick ("this should be a permanent feature, not selectable").
  bg.S.bg = false;                             // even a legacy save that says "off" keeps grinding
  const before = bg.logs.length;
  bg.pass(1); bg.hide();
  const a = bg.stat();
  for (let s = 0; s < 120; s++) { bg.pass(1000); bg.wake(); }
  assert.ok(bg.stat().gameTime - a.gameTime > 100, 'two hidden minutes still simulated');
  bg.pass(1000); bg.show();
  assert.ok(bg.logs.length > before, 'and the away line is still printed even though the save said off');
  bg.pass(16); bg.frame();
  bg.S.bg = true;
});

t('the ticker does not double-drive a healthy visible tab', () => {
  const a = bg.stat();
  bg.pass(3000); bg.wake(); bg.wake();
  assert.strictEqual(bg.stat().gameTime, a.gameTime, 'wakes while visible simulate nothing');
  bg.pass(16); bg.frame();
  near(bg.stat().gameTime - a.gameTime, 3.016, 0.002, 'the frame picks the waiting time up, once');
});

t('background grinding has no switch left in the UI or in ACT', () => {
  assert.ok(src.includes('clickSell:false,bg:true,autoSell:'), 'a fresh save still carries bg:true');
  assert.ok(src.includes('f.bg=true;'), 'and every load normalises the field to on');
  assert.ok(!src.includes('if(f.bg!==true&&f.bg!==false)f.bg=true;'), 'the old toggle migration is gone');
  assert.ok(!src.includes('data-a="bg"'), 'Settings no longer renders a checkbox');
  assert.ok(!/bg:\(\)=>\{S\.bg=/.test(src), 'and no ACT action can flip it');
  assert.ok(src.includes('const bgOn=()=>true;'), 'bgOn() is permanently true');
  assert.ok(src.includes('Keeps grinding while this tab is in the background'), 'the tidied line stays as a statement of fact');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
