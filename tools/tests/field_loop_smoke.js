// Field smoke test — the farming loop as a player meets it, end to end (v83).
//   node tools/tests/field_loop_smoke.js
//
// NOT part of the `*_sim.js` gate: those suites run on plain node, and this one boots the real
// index.html in jsdom against the real Three.js r128, so it needs the same two packages:
//
//     npm i --no-save jsdom three@0.128.0
//
// Without those packages the file prints a skip line and exits 0, so a clean checkout is never
// blocked by it.
//
// What it drives, and why: v83 replaced the three clumped packs with scattered camps (which refill
// themselves), moved the damage numbers above the monster's head, and made one swing print one
// number per monster. Static string tests cannot see any of that go wrong at runtime, so this suite
// spawns a real field, steps the real update() loop, kills real monsters and reads the real floats.
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('field smoke: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (!threePath) { console.log('field smoke: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0); }
const three = fs.readFileSync(threePath, 'utf8');

function makeCtx() {
  const o = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {},
    setTransform() {}, resetTransform() {}, translate() {}, scale() {}, rotate() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}, measureText: () => ({ width: 8 }), fillText() {}, strokeText() {},
    createPattern: () => null, drawFocusIfNeeded() {},
  };
  return new Proxy(o, { get(t, k) { return k in t ? t[k] : () => {}; } });
}

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: false,
  beforeParse(window) {
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { value: function () { return makeCtx(); } });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', { value: () => 'data:image/png;base64,' });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return 1200; } });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return 800; } });
    window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }; };
    window.Element.prototype.setPointerCapture = function () {};
    window.requestAnimationFrame = cb => { window.__raf = cb; return 1; };
    window.cancelAnimationFrame = () => {};
    window.fetch = () => Promise.reject(new Error('offline'));
    window.URL.createObjectURL = () => 'blob:x';
    window.eval(three);
    window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
      this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
      this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
    for (const f of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js'])
      window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  },
});
const { window } = dom;
window.addEventListener('error', e => errors.push(String(e.message)));
const ev = code => window.eval(code);
const check = [];
const t = (name, fn) => { try { fn(); check.push(['ok', name]); } catch (e) { check.push(['FAIL', name + ' -> ' + (e && e.message)]); } };
const T = async (name, fn) => { try { await fn(); check.push(['ok', name]); } catch (e) { check.push(['FAIL', name + ' -> ' + (e && e.message)]); } };

(async () => {
  // ---------------------------------------------------------------- 1. the door
  await T('a refresh stops at the login card, even when the browser carries a live session cookie', async () => {
    const loginCalls = [];
    ev(`
      window.__calls=[];
      const __real=initSessionFromCloud;
      initSessionFromCloud=function(u,gm,isNew){window.__logins=(window.__logins||0)+1;return __real(u,gm,isNew)};
      window.fetch=(u,init)=>{window.__calls.push([u,(init&&init.method)||'GET']);
        return Promise.resolve({status:200,ok:true,headers:{get:k=>k.toLowerCase()==='content-type'?'application/json':null},
          json:()=>Promise.resolve({u:'FRIEND',gm:0})})};
    `);
    const found = await ev('cloudProbe()');
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(found, false, 'the probe must never walk somebody in');
    assert.strictEqual(ev('CLOUD.api'), true, 'the API is still detected');
    assert.strictEqual(ev('CLOUD.on'), false, 'nobody is signed in without typing a password');
    assert.strictEqual(ev('currentUser'), null, 'and no account is adopted behind the card');
    assert.strictEqual(ev('window.__logins||0'), 0, 'no session was started');
    const calls = JSON.parse(ev('JSON.stringify(window.__calls)'));
    assert.ok(calls.some(c => /sessions/.test(c[0]) && c[1] === 'DELETE'), 'the leftover cookie session is dropped: ' + JSON.stringify(calls));
    assert.notStrictEqual(ev(`$('loginOverlay').style.display`), 'none', 'the game stays on the login card');
    loginCalls.push(0);
  });

  // ---- boot a session the way the login form does ----
  ev(`currentUser='fieldtester';initSession(false);`);
  assert.ok(ev('!!S'), 'a session boots');

  // ---------------------------------------------------------------- 2. the field
  t('a farming stage is built from scattered camps, not three clumps in the middle', () => {
    ev(`S.mp=0;S.lvl=3;mapM=0;mapL=3;spawn();`);
    const camps = JSON.parse(ev('JSON.stringify(camps.map(c=>({x:c.x,z:c.z,wait:c.wait})))'));
    const mobs = JSON.parse(ev('JSON.stringify(mobs.map(m=>({x:m.x,z:m.z,pack:m.pack,hp:m.hp})))'));
    assert.strictEqual(camps.length, 8, 'Prontera fields eight camps');
    assert.ok(mobs.length >= 8 && mobs.length <= 24, 'each camp holds one to three monsters');
    for (const c of camps) {
      const group = mobs.filter(m => m.pack === camps.indexOf(c));
      assert.ok(group.length >= 1 && group.length <= 3, 'camp ' + camps.indexOf(c) + ' holds ' + group.length);
      for (const m of group)
        assert.ok(Math.hypot(m.x - c.x, m.z - c.z) <= 3.35, 'a camp monster drifted off its camp ring');
      assert.ok(c.wait >= 4 && c.wait <= 8, 'refill timers stay in the 4-8s band');
    }
    for (let a = 0; a < camps.length; a++) for (let b = a + 1; b < camps.length; b++)
      assert.ok(Math.hypot(camps[a].x - camps[b].x, camps[a].z - camps[b].z) >= 2.6, 'two camps share a spot');
    const zs = camps.map(c => c.z);
    assert.ok(Math.max(...zs) - Math.min(...zs) > 12, 'the camps must cover the lane, not hug the middle');
  });

  // ---------------------------------------------------------------- 3. refill
  t('an emptied camp refills itself and nothing else is disturbed', () => {
    const before = JSON.parse(ev('JSON.stringify(mobs.map(m=>[m.pack,+(m.hp>0)]))'));
    const othersBefore = before.filter(p => p[0] !== 0).length;
    ev(`for(const m of mobs.slice())if(m.pack===0)kill(m);`);
    assert.strictEqual(ev('mobs.filter(m=>m.pack===0).length'), 0, 'camp 0 is empty after its monsters die');
    // the refill runs inside update(); a camp that is still counting down must stay empty,
    // and one that is done must be stocked again - step in 1s slices so both are seen.
    let waited = 0;
    while (ev('mobs.filter(m=>m.pack===0).length') === 0 && waited < 12) { ev('update(1)'); waited++; }
    const group = JSON.parse(ev('JSON.stringify(mobs.filter(m=>m.pack===0).map(m=>({x:m.x,z:m.z})))'));
    assert.ok(group.length >= 1 && group.length <= 3, 'the emptied camp came back with ' + group.length + ' monsters');
    assert.ok(waited >= 1, 'the camp does not respawn instantly');
    assert.ok(ev(`mobs.filter(m=>m.pack!==0).length`) >= Math.min(1, othersBefore), 'the other camps were not wiped by the refill');
    assert.ok(ev('S.kl') > 0, 'the kills went through the real kill() path');
    // and the field was never thrown away and rebuilt wholesale
    assert.ok(ev('camps.length') === 8, 'the camp list survives a cleared camp');
  });

  // ---------------------------------------------------------------- 3b. the whole-field wipe (v86, 8s target v87)
  t('a WHOLE-FIELD wipe restocks itself within 8s and the hero retargets (the v86 freeze)', () => {
    ev(`S.mp=0;S.lvl=4;mapM=0;mapL=4;spawn();`);
    // every camp dies inside the same couple of seconds - what a far-level character does on a low map
    ev(`for(const m of mobs.slice())kill(m);`);
    assert.strictEqual(ev('mobs.length'), 0, 'the field is fully wiped');
    assert.ok(ev('camps.length') === 8, 'the camp list is still there (that is exactly the frozen state)');
    let waited = 0;
    // v87 owner: 8 seconds, not "eventually" - the worst camp refill wait is now 7s (CAMP_REFILL_MAX)
    while (ev('mobs.length') === 0 && waited < 8) { ev('update(1)'); waited++; }
    assert.ok(ev('mobs.length') > 0, 'the field restocked itself after ' + waited + 's (target <=8s; the old code froze forever)');
    assert.ok(waited <= 8, 'the restock met the 8s budget (took ' + waited + 's)');
    assert.ok(ev('camps.length') === 8, 'the camp list survives the wipe');
    // one small step so the mobs branch runs: the hero must have a target again, from a LIVE pack
    ev('update(.05)');
    assert.ok(ev('!!mob'), 'the hero has a target again');
    assert.ok(ev('mobs.some(m=>m.pack===activePack)'), 'the active pack is a live one (the old stale id woke nobody)');
  });

  // ---------------------------------------------------------------- 4. the loop
  t('the field loop runs clean, prints head-height numbers, and loses no damage to the grouping', () => {
    // the floats themselves are the record: a damage number is a float whose txt is the printed
    // value, so what the player sees can be compared with what strike()/hurt() banked in S.dmg.
    ev(`
      window.__floats=new Map();
      floats.forEach(f=>f.el&&f.el.remove());floats.length=0;
      S.hp=maxHp();S.dmg=0;
      const m=mobs.reduce((a,b)=>Math.hypot(b.x-pl.x,b.z-pl.z)<Math.hypot(a.x-pl.x,a.z-pl.z)?b:a);
      pl.x=m.x+1.4;pl.z=m.z+.4;mob=m;pAtkT=0;
    `);
    const dmgBefore = ev('S.dmg||0');
    for (let i = 0; i < 420; i++) {
      ev('update(1/30)');
      ev(`floats.forEach(f=>{
        const k=f.kind;
        if(k==='dot')window.__floats.set(f,{k,v:f.val||0,y:f.y});
        else if(k==='damage'||k==='skill-damage'||k==='critical'||k==='skill-critical')
          window.__floats.set(f,{k,v:Number(String(f.txt).replace(/[^0-9.]/g,''))||0,y:f.y});})`);
    }
    const printed = JSON.parse(ev('JSON.stringify(Array.from(window.__floats.values()))'));
    const dealt = ev('S.dmg') - dmgBefore;
    const dmgKinds = printed.filter(p => ['damage', 'skill-damage', 'critical', 'skill-critical'].includes(p.k));
    const crits = printed.filter(p => p.k === 'critical' || p.k === 'skill-critical').length;
    assert.strictEqual(errors.length, 0, 'page errors: ' + errors.join(' | '));
    assert.ok(dealt > 0, 'the hero dealt damage through the real loop');
    assert.ok(dmgKinds.length > 0, 'damage numbers were printed');
    assert.ok(dmgKinds.every(p => p.y > 1.5), 'every damage number spawns above the head: ' + JSON.stringify(dmgKinds.slice(0, 4)));
    const printedSum = dmgKinds.reduce((s, p) => s + p.v, 0) + printed.filter(p => p.k === 'dot').reduce((s, p) => s + p.v, 0);
    assert.strictEqual(Math.round(printedSum), Math.round(dealt),
      'every point of damage is printed exactly once (grouped into one number per monster, never dropped): printed ' + printedSum + ' vs dealt ' + dealt);
    assert.ok(dmgKinds.length + printed.filter(p => p.k === 'dot').length <= dealt,
      'a swing can never print more numbers than it dealt damage' + (crits ? ' (' + crits + ' critical)' : ''));
    assert.ok(ev('floats.every(f=>f.life>0)'), 'expired floats are removed from the field');
  });

  // ---------------------------------------------------------------- 5. the range
  t('the stand-off follows the class band: bow 4, staff 4.5, melee 1.2 + 0.45*size', () => {
  // Controlled setup on purpose: ONE motionless monster in the middle of the lane, made the active
  // camp's own target, so the only thing that moves is the hero. That turns the distance the hero
  // settles at into a direct read of its stand-off, instead of a race between the hero walking out
  // and the monster walking in.
  const hold = cls => {
    ev(`S.cls='${cls}';S.mp=0;S.lvl=3;spawn();
      {const m=mobs[0];mobs=[m];mob=m;camps=[];activePack=m.pack;      // one unkillable, motionless target
        m.hp=m.max=1e9;m.x=0;m.z=0;m.hx=0;m.hz=0;m.fixed=true;m.a=0;m.at=1e9;
        pl.x=8;pl.z=0;pl.wt=99;pl.orb=0;pAtkT=.2;S.hp=maxHp();}`);
    const stand = ev('heroStandoff(mob)');
    for (let i = 0; i < 150; i++) ev('update(1/30)');
    assert.ok(ev('mob!==null'), 'the hero kept its target');
    return { stand, dist: ev('Math.hypot(mob.x-pl.x,mob.z-pl.z)') };
  };
  // The hero stops the moment the target is in range (reach + the 0.6 grace), so the settled
  // distance is its own stand-off, give or take the last step - not a ring it walks around.
  const settlesAt = (r, who) => {
    assert.ok(r.dist >= r.stand - .35, who + ' ended INSIDE its stand-off: ' + r.dist.toFixed(2));
    assert.ok(r.dist <= r.stand + .7, who + ' did not stop at its stand-off: ' + r.dist.toFixed(2));
  };
  const archer = hold('Hunter');
  assert.ok(archer.stand >= 4, 'a bow class wants four tiles (owner, v83.2): ' + archer.stand);
  assert.ok(archer.stand < 4.5, 'and not the five it used to want: ' + archer.stand);
  settlesAt(archer, 'the archer');
  const mage = hold('Mage');
  assert.ok(mage.stand >= 4.5, 'a staff class wants four and a half tiles: ' + mage.stand);
  settlesAt(mage, 'the staff class');
  // a melee class still walks all the way in - the fix must not turn everyone into an archer
  const melee = hold('Novice');
  assert.ok(melee.dist < 2.2, 'a melee class still closes in: ' + melee.dist.toFixed(2));
  assert.ok(melee.dist > .5, 'and does not stand inside the monster: ' + melee.dist.toFixed(2));
  // and a class that has learned a ranged skill keeps THAT skill's range, whatever its band says.
  // Soul Breaker belongs to the Assassin Cross line (a melee class), which is the case that matters.
  const assassin = ev(`S.cls='Assassin Cross';S.sk=Object.assign({},S.sk,{soulb:1});S.mp=0;S.lvl=3;spawn();
    {const m=mobs[0];mobs=[m];mob=m;camps=[];activePack=m.pack;m.hp=m.max=1e9;m.x=0;m.z=0;m.fixed=true;m.a=0;m.at=1e9;pl.x=9;pl.z=0;}
    heroStandoff(mob)`);
  assert.ok(assassin >= 5, 'a learned ranged skill keeps its five tiles even on a melee class: ' + assassin);
});

  t('a ranged hero holds its ground: the monster closes in and hits back (no kiting)', () => {
    // v83.1: the walk target used to be a ring around the monster, recomputed every frame, so a
    // ranged hero backed away for as long as the monster chased it and could cross the whole lane
    // without ever being hit. Now the hero walks in once, latches, and stands - which is only
    // correct if the monster then reaches its own stand-off and hits back.
    ev(`S.cls='Hunter';S.mp=0;S.lvl=6;S.lv=40;spawn();
      {const m=mobs[0];mobs=[m];mob=m;camps=[];activePack=m.pack;m.hp=m.max=1e9;
       m.x=0;m.z=0;m.hx=0;m.hz=0;m.a=0;m.at=.5;pl.x=8;pl.z=0;pl.wt=99;pl.orb=0;pAtkT=0;S.hp=1e7;}
      window.__seen=new WeakSet();window.__hits=0;`);
    assert.ok(ev('heroStandoff(mob)') >= 4, 'a bow class starts this fight wanting four tiles');
    let latePath = 0, prev = JSON.parse(ev('JSON.stringify([pl.x,pl.z])'));
    for (let i = 0; i < 600; i++) {
      ev('update(1/30)');
      ev(`floats.forEach(f=>{if(f.kind==='incoming'&&!window.__seen.has(f)){window.__seen.add(f);window.__hits++}})`);
      ev('S.hp=1e7');
      const p = JSON.parse(ev('JSON.stringify([pl.x,pl.z])'));
      if (i >= 300) latePath += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    const hits = ev('window.__hits'), dist = ev('Math.hypot(mob.x-pl.x,mob.z-pl.z)');
    assert.ok(hits > 0, 'the monster must reach the hero and land hits (it landed ' + hits + ')');
    assert.ok(latePath < .5, 'the hero must stand still once in range (drifted ' + latePath.toFixed(2) + ' units in 10s)');
    assert.ok(dist < 2.6, 'the monster must close to its own stand-off (settled at ' + dist.toFixed(2) + ')');
    assert.ok(html.includes('engageTgt'), 'the latch that ends the walk-in must stay in the source');
  });

  // ---------------------------------------------------------------- 6. the walk-in (v88.4)
  t('a latched hero closes in on a monster that will not walk into reach (no deadlock)', () => {
    // v88.4: a small monster's own approach ring can sit just outside the hero's attack window.
    // The hero had latched on and stood still, the monster stood still at 2.1 units, and both
    // waited while the monster kept hitting - until the hero died. Pinned with a monster that
    // will not move at all: the hero must wait a beat, then walk in and strike.
    ev(`S.cls='Novice';S.lv=10;S.mp=0;S.lvl=1;spawn();
      {const m=mobs[0];mobs=[m];mob=m;camps=[];activePack=m.pack;m.hp=m.max=1e9;m.size=.6;m.fixed=true;
       m.x=2.1;m.z=0;m.hx=2.1;m.hz=0;m.a=Math.PI;m.at=.5;pl.x=0;pl.z=0;pl.wt=99;pl.orb=0;pAtkT=0;S.hp=1e7;
       engageTgt=m;engageWait=0;standC={t:-9,r:0};}`);
    const reachNow = ev('heroStandoff(mob)');
    assert.ok(ev('Math.hypot(mob.x-pl.x,mob.z-pl.z)') > reachNow + .6, 'the set-up is out of reach while latched');
    const dmg0 = ev('S.dmg||0'), start = ev('JSON.stringify([pl.x,pl.z])');
    for (let i = 0; i < 5; i++) ev('update(0.1)');
    assert.strictEqual(ev('JSON.stringify([pl.x,pl.z])'), start, 'the hero still waits its beat before it moves');
    for (let i = 0; i < 55; i++) ev('update(0.1)');
    assert.ok(ev('S.dmg||0') > dmg0, 'the hero must close in and strike (dealt ' + (ev('S.dmg||0') - dmg0) + ')');
    const d = ev('Math.hypot(mob.x-pl.x,mob.z-pl.z)');
    assert.ok(d <= ev('heroStandoff(mob)') + .6, 'and end inside its own reach (settled at ' + d.toFixed(2) + ')');
  });

  // ---------------------------------------------------------------- 7. the animation follows the damage (v88.8)
  t('one attack draws one complete slash, and no swing prints more numbers than there are slashes', () => {
    // Owner: "damage coming 10 numbers but attack animation only 3 slashes." The numbers were right
    // (v83: one per monster per swing) and the swing TIMER was right (v88); what drifted was the
    // class-skin attack ART, which ran on the APNG's own wall clock and was never re-synced to a
    // swing. This counts what the render path really paints: skinRoute() picks the attack view while
    // atkAnim > 0, and captureSkinFrame() takes that view's frame from skinSwingMs().
    const fileTotal = cls => JSON.parse(ev(
      `(function(){const r=window.CLASS_SKINS.classes['${cls}'].m;return JSON.stringify((r.delays&&r.delays.attack)||[])})()`
    )).reduce((a, e) => a + e[0] / (e[1] || 100), 0);
    const rows = [];
    // ONE hook install: wrapping playerAttack again per class would stack the wrappers and count
    // every attack once per class already run.
    ev(`window.__sw=0;{const real=playerAttack;playerAttack=function(){window.__sw++;return real.apply(this,arguments)}}`);
    for (const [cls, lv, mp, lvl] of [['Novice', 10, 0, 1], ['Swordman', 35, 1, 3], ['Knight', 60, 3, 5],
                                      ['Assassin Cross', 99, 6, 7], ['Lord Knight', 150, 9, 9]]) {
      const file = +fileTotal(cls).toFixed(3);
      ev(`
        S.cls='${cls}';S.lv=${lv};S.mp=${mp};S.lvl=${lvl};mapM=${mp};mapL=${lvl};spawn();
        floats.length=0;S.hp=1e9;S.dmg=0;
        window.__sw=0;window.__slash=0;window.__prevIdx=-1;window.__prevView='';window.__nums=0;window.__miss=0;
        window.__now=0;window.__t0=0;window.__seenF=new WeakSet();
        {const m=mobs.reduce((a,x)=>Math.hypot(x.x-pl.x,x.z-pl.z)<Math.hypot(a.x-pl.x,a.z-pl.z)?x:a);
         mobs=[m];camps=[];mob=m;activePack=m.pack;m.hp=m.max=1e12;m.fixed=true;m.x=0;m.z=0;m.hx=0;m.hz=0;m.a=0;m.at=1e9;
         pl.x=heroStandoff(m);pl.z=0;pl.wt=99;pAtkT=0;engageTgt=m;engageWait=0;swing=null;atkAnim=0;
         // jsdom cannot decode the APNGs, so hand the render path this class's real measured art data -
         // otherwise the attack file's length silently reads as 0 and the case proves nothing.
         heroSpr=heroSpr||{};heroSpr.userData=heroSpr.userData||{};
         heroSpr.userData.skin={p:{total:{attack:${file}},secs:{attack:new Array(5).fill(${file / 5})}},
                                cv:null,tex:null,view:'',mirror:null,route:'',t0:0};}
      `);
      for (let i = 0; i < 20 * 60; i++) {
        ev('update(1/60)'); ev('S.hp=1e9');
        ev(`{const sk=heroSpr.userData.skin,p=sk.p,route=skinRoute(p,3,atkAnim);
            window.__now+=1000/60;
            if(window.__prevView!==route.view)window.__t0=window.__now;   // captureSkinFrame's own sk.t0
            if(route.view==='attack'){
              // the shipped clock if the page has one, otherwise the wall clock the fix replaced - so
              // this step still RUNS against the old code and reports the drift instead of a symbol error
              const ms=(typeof skinSwingMs==='function')?skinSwingMs(p):(window.__now-window.__t0);
              const idx=skinFrameIndex(p,'attack',ms);
              // the attack art restarts when its frame index goes BACK (it wrapped to a new play),
              // or when the attack view comes back on after the walk frames between two swings
              if(idx<window.__prevIdx||window.__prevView!=='attack')window.__slash++;
              window.__prevIdx=idx;
            }else window.__prevIdx=-1;
            window.__prevView=route.view;
            floats.forEach(f=>{if(window.__seenF.has(f))return;window.__seenF.add(f);
              const k=f.kind;
              if(k==='damage'||k==='skill-damage'||k==='critical'||k==='skill-critical')window.__nums++;
              else if(k==='miss')window.__miss++})}`);
      }
      const r = JSON.parse(ev('JSON.stringify({sw:window.__sw,slash:window.__slash,nums:window.__nums,miss:window.__miss})'));
      rows.push(Object.assign({ cls, aspd: +ev('aspd()').toFixed(3), file, swingDur: +ev('swingDur').toFixed(3) }, r));
    }
    assert.strictEqual(errors.length, 0, 'page errors: ' + errors.join(' | '));
    for (const r of rows) {
      assert.ok(r.sw > 5, r.cls + ' actually fought (' + r.sw + ' attacks)');
      assert.strictEqual(r.slash, r.sw,
        `${r.cls}: one drawn slash per attack - drew ${r.slash} for ${r.sw} attacks (aspd ${r.aspd}s, file ${r.file}s, swing ${r.swingDur}s)`);
      assert.ok(r.nums <= r.sw,
        `${r.cls}: never more damage numbers than slashes on one target (${r.nums} numbers, ${r.sw} slashes)`);
      assert.ok(r.nums + r.miss >= r.sw * .9,
        `${r.cls}: every swing showed something - ${r.nums} numbers + ${r.miss} misses for ${r.sw} attacks`);
    }
    console.log('   ' + rows.map(r => `${r.cls} aspd ${r.aspd}/file ${r.file}: ${r.sw} attacks, ${r.slash} slashes, ${r.nums} numbers`).join('\n   '));
  });

  for (const [st, name] of check) console.log((st === 'ok' ? '  ok   ' : '  FAIL ') + name);
  const bad = check.filter(c => c[0] === 'FAIL').length + errors.length;
  if (errors.length) console.log('page errors:', errors);
  console.log(`\n${check.length - bad}/${check.length} steps ok${bad ? ' - FAILURES ABOVE' : ''}`);
  process.exit(bad ? 1 : 0);
})();
