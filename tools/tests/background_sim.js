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
let simCatchingUp=false;const simVisualsOff=()=>hidden||simCatchingUp;
// v2: the frame loop parks the clock while the cloud says the character is away (a lost connection
// is away time, not progress) - so the harness needs the flag the real page has.
const CLOUD={lost:false};
// v281: and it parks it while the GPU is gone, for the same reason: a frame that cannot be drawn is
// not a frame the player saw. The harness must be able to raise it.
let gpuLost=false;
function ui(){} function feedDraw(){}
const jobs=new Map();let jobId=0;
const setTimeout=f=>{jobs.set(++jobId,f);return jobId};
const clearTimeout=id=>jobs.delete(id);
function drain(){let guard=10000;while(jobs.size&&guard--){const [id,f]=jobs.entries().next().value;jobs.delete(id);f()}if(!guard)throw new Error('catch-up did not finish')}
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
  hide:()=>{hidden=true;(docHandlers.visibilitychange||[]).forEach(f=>f());drain()},
  show:()=>{hidden=false;(docHandlers.visibilitychange||[]).forEach(f=>f());drain()},
  frame:()=>{frames++;if(!frameCb)throw new Error('the loop stopped asking for frames');const f=frameCb;frameCb=null;f(nowMs);drain()},
  wake:()=>{ticks++;for(const f of timers)f();drain()},
  advanceAt:at=>{simAdvance(at);drain()},rawWake:()=>{for(const f of timers)f()},rawShow:()=>{hidden=false;(docHandlers.visibilitychange||[]).forEach(f=>f())},rawFrame:()=>loop(nowMs),pending:()=>simPending,drain, timerMs:()=>timers.length,
  blur:()=>{simFocused=false},focus:()=>{simFocused=true},occluded:()=>simOccluded,setLost:v=>{CLOUD.lost=!!v},setGpuLost:v=>{gpuLost=!!v}};
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
  // v392: the park is no longer unconditional - the plaza keeps paying a rate measured before the drop.
  assert.ok(src.includes('function loop(now){try{if((CLOUD.lost&&!plazaEarningWhileAway())||gpuLost){simAt=now;simPending=0}else simAdvance(now);if(!gpuLost&&!document.hidden&&simPending===0)draw()}'),
    'the frame loop still drives the same clock and draws, and parks it while the session is away (except the plaza payroll, v392)');
  assert.ok(src.includes('const plazaEarningWhileAway=()=>{'),
    'and that exception is one named predicate, not an inline special case');
  assert.ok(src.includes('gpuLost'),
    'and parks it while the GPU is gone too (v281) - a frame that cannot be drawn is not progress');
  assert.ok(src.includes('for(let i=0;i<speed;i++){update(dt);if(!simVisualsOff())kitTick(dt)}'), 'every slice still honours the speed setting');
  assert.ok(src.includes('setInterval(save,5000)'), 'the five-second autosave is untouched');
  assert.ok(src.includes("document.addEventListener('visibilitychange'"), 'the hide/show wiring is in the game');
  assert.ok(src.includes('setInterval(bgTick,SIM_BG_MS)'), 'the hidden-tab ticker is in the game');
});

t('v281: a lost GPU parks the clock, and nothing advances behind a blank screen', () => {
  bg.S = { lv: 1, exp: 0, hp: 100, zeny: 0, kills: 0 };
  bg.show();
  const a = bg.stat();
  for (let i = 0; i < 5; i++) { bg.pass(16); bg.frame(); }
  const drawn = bg.stat();
  assert.strictEqual(drawn.draws - a.draws, 5, 'frames draw while the GPU is fine');
  assert.ok(drawn.steps > a.steps, 'and the clock runs');
  bg.setGpuLost(true);
  const b = bg.stat();
  for (let i = 0; i < 10; i++) { bg.pass(16); bg.frame(); }
  const c = bg.stat();
  assert.strictEqual(c.draws - b.draws, 0, 'nothing is drawn to a dead canvas');
  assert.strictEqual(c.steps - b.steps, 0, 'and the clock is parked, so the player does not play a fight they cannot see');
  bg.setGpuLost(false);
  const d = bg.stat();
  for (let i = 0; i < 5; i++) { bg.pass(16); bg.frame(); }
  const e = bg.stat();
  assert.strictEqual(e.draws - d.draws, 5, 'and it all comes back when the context does');
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

t('long catch-up yields, retains debt, then credits it exactly once',()=>{
  bg.hide();const a=bg.stat();bg.pass(60000);bg.rawWake();
  assert.ok(bg.stat().steps-a.steps<=50,'at most 50 slices per task');
  assert.ok(bg.pending()>50,'unprocessed time stays queued');
  bg.drain();near(bg.stat().simWall-a.simWall,60,.00001,'all queued seconds credited');
  const b=bg.stat();bg.drain();near(bg.stat().simWall,b.simWall,1e-9,'no duplicate credit');bg.show();
});

t('returning with a backlog never renders accelerated intermediate combat',()=>{
  bg.hide();const a=bg.stat();bg.pass(60000);bg.rawShow();
  assert.ok(bg.pending()>50,'the first return batch yields without dropping progress');
  for(let i=0;i<4;i++){bg.pass(16);bg.rawFrame();}
  assert.ok(bg.pending()>0,'there is still work for later tasks');
  assert.equal(bg.stat().draws,a.draws,'the last displayed frame stays still during catch-up');
  bg.drain();near(bg.stat().simWall-a.simWall,60.064,.00001,'all away time was credited once');
  const settled=bg.stat();bg.pass(16);bg.rawFrame();
  assert.equal(bg.stat().draws,settled.draws+1,'drawing resumes after settlement');
  near(bg.stat().simWall-settled.simWall,.016,1e-9,'resumed combat runs at normal speed');
});

t('a stale animation timestamp cannot rewind a timer-advanced clock',()=>{
  bg.pass(16);bg.advanceAt(bg.wall());const a=bg.stat(),at=bg.clock();
  bg.advanceAt(bg.wall()-8);assert.equal(bg.clock(),at);bg.pass(8);bg.frame();
  near(bg.stat().simWall-a.simWall,.008,1e-9,'only new time is credited');
});

t('an unfocused / covered window whose animation frames stop keeps grinding via bgTick',()=>{
  bg.focus();bg.pass(16);bg.frame();
  const a=bg.stat(),k0=bg.S.kills,z0=bg.zeny(),before=bg.logs.length;
  bg.blur();                                       // Alt+Tab to another app; document.hidden stays false
  bg.pass(1500);bg.wake();                         // 1.5s with no rAF frame triggers occluded background mode
  assert.strictEqual(bg.occluded(),true,'frame-starved unfocused window enters occluded mode');
  for(let s=0;s<10;s++){bg.pass(1000);bg.wake();}
  const mid=bg.stat();
  near(mid.simWall-a.simWall,11.5,.002,'all 11.5 occluded seconds were simulated in real time');
  assert.strictEqual(mid.draws-a.draws,0,'nothing is drawn while occluded');
  assert.ok(mid.saves>a.saves,'5-second background autosave still runs while occluded');
  assert.ok(bg.S.kills>k0&&bg.zeny()>z0,'kills and Zeny keep growing while Alt+Tabbed');
  bg.focus();bg.pass(500);bg.frame();              // window uncovered: next animation frame settles away state
  assert.strictEqual(bg.occluded(),false,'next animation frame clears occluded mode');
  assert.strictEqual(bg.stat().draws-mid.draws,1,'drawing resumes immediately');
  assert.strictEqual(bg.logs.length,before+1,'returning from occluded grinding logs an Away summary');
  assert.match(bg.logs[bg.logs.length-1].m,/^Away 12s · \+/);
});

t('an unfocused window on a second monitor that still gets frames is not double-driven',()=>{
  bg.blur();
  const a=bg.stat();
  for(let s=0;s<3;s++){
    for(let f=0;f<10;f++){bg.pass(100);bg.frame();}
    bg.wake();
  }
  assert.strictEqual(bg.occluded(),false,'live frames prevent occluded fallback even while blurred');
  near(bg.stat().simWall-a.simWall,3,.002,'only frame time is simulated');
  assert.strictEqual(bg.stat().draws-a.draws,30,'every visible frame still draws');
  bg.focus();
});

// Outside the plaza: a lost connection grinds nothing. The plaza is the deliberate exception
// (it replays a rate measured before the drop, capped by that measurement) and is covered by
// plaza_stranded_still_paid_sim.js.
t('CLOUD.lost parks bgTick outside the plaza, so a lost connection never grinds in the background',()=>{
  bg.hide();
  const a=bg.stat();
  bg.setLost(true);
  for(let s=0;s<10;s++){bg.pass(1000);bg.wake();}
  assert.strictEqual(bg.stat().simWall,a.simWall,'no combat steps run while CLOUD.lost is true');
  bg.setLost(false);
  bg.pass(16);bg.show();bg.frame();
});

t('the inline Web Worker ticker drives hidden wakes and drains 60s debt when setTimeout is frozen',()=>{
  let nowMs=1000,hidden=false,saves=0,simWall=0,createdScript='',revokedUrl='';
  let workerInstance=null;
  class FakeBlob{constructor(parts){this.text=parts.join('')}}
  class FakeWorker{
    constructor(url){this.url=url;this.onmessage=null;this.onerror=null;workerInstance=this;}
    postMessage(msg){
      // Mirror the inline worker: `onmessage=()=>postMessage(1)` bounces drain requests immediately
      // without touching main-thread setTimeout/setInterval queues.
      if(msg===1&&this.onmessage)this.onmessage({data:1});
    }
  }
  const wBox={console};
  const wHarness=`
    let S={lv:1,exp:0,hp:100,zeny:0,kills:0},speed=1,zenyEarned=0;
    const docHandlers={};
    const performance={now:()=>nowMs};
    const document={get hidden(){return hidden},addEventListener:(k,f)=>{(docHandlers[k]=docHandlers[k]||[]).push(f)}};
    let simCatchingUp=false;const simVisualsOff=()=>hidden||simCatchingUp||simOccluded;
    const CLOUD={lost:false};
    function ui(){} function feedDraw(){} function kitTick(){} function draw(){} function log(){}
    function save(){saves++}
    // Intentionally freeze main-thread setTimeout and setInterval callbacks (simulating Chromium's
    // background timer freeze) so ONLY the Web Worker can drive and drain the simulation.
    const setTimeout=()=>1,clearTimeout=()=>{},setInterval=()=>1,requestAnimationFrame=()=>{};
    function update(dt){simWall+=dt/speed;S.kills=Math.floor(simWall)}
    ${clock}
    this.__w={
      hide:()=>{hidden=true;(docHandlers.visibilitychange||[]).forEach(f=>f())},
      pending:()=>simPending,
    };
  `;
  Object.assign(wBox,{
    Blob:FakeBlob,Worker:FakeWorker,
    URL:{createObjectURL:b=>{createdScript=b.text;return 'blob:sim-worker'},revokeObjectURL:u=>{revokedUrl=u}},
  });
  Object.defineProperties(wBox,{
    nowMs:{get:()=>nowMs,set:v=>{nowMs=v}},
    hidden:{get:()=>hidden,set:v=>{hidden=v}},
    saves:{get:()=>saves,set:v=>{saves=v}},
    simWall:{get:()=>simWall,set:v=>{simWall=v}},
  });
  vm.createContext(wBox);vm.runInContext(wHarness,wBox);
  assert.ok(workerInstance,'inline Web Worker was instantiated');
  assert.strictEqual(revokedUrl,'blob:sim-worker','Blob object URL is revoked immediately to avoid leaking');
  assert.match(createdScript,/setInterval\(\(\)=>postMessage\(0\),1000\)/,'worker runs the 1s heartbeat');
  wBox.__w.hide();
  const s0=saves,w0=simWall;
  nowMs+=60000;                                    // 60s elapsed while main-thread timers never fire
  workerInstance.onmessage({data:0});              // one worker heartbeat + immediate message-channel drain
  near(simWall-w0,60,.00001,'worker heartbeat + postMessage drain simulated all 60s with setTimeout frozen');
  assert.strictEqual(wBox.__w.pending(),0,'no pending combat debt left behind');
  assert.ok(saves>s0,'periodic background save still ran at settlement');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
