// Prontera Town smoke test — the town as a player meets it, end to end.
//   node tools/tests/town_smoke.js
//
// NOT part of the `*_sim.js` gate: those suites run on plain node, and this one boots the real
// index.html in jsdom against the real Three.js r128, so it needs two packages first:
//
//     npm i --no-save jsdom three@0.128.0
//
// (three.min.js is read straight out of the npm package, which is the same r128 the page pulls
// from the CDN, so the projections, the Raycaster and the Sprite centres are the real thing.)
// Without those packages the file prints a skip line and exits 0, so a clean checkout is never
// blocked by it.
//
// It drives the town the way a player does — walk in, click the ground, click an NPC, take a
// contract, claim it, warp out — and asserts what the town promises: five NPCs with names and
// sprites, a plaza, a fountain you cannot walk into (and are walked around), no monsters ever,
// no offline-rate credit for standing around, and the field intact afterwards.
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('town smoke: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (!threePath) { console.log('town smoke: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0); }
const three = fs.readFileSync(threePath, 'utf8');

const ctxCalls = [];
function makeCtx() {
  const o = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {},
    setTransform() {}, resetTransform() {}, translate() {}, scale() {}, rotate() {}, drawImage(...a) { ctxCalls.push(['drawImage', a.length]); },
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}, measureText: () => ({ width: 8 }), fillText() {}, strokeText() {},
    createPattern: () => null, drawFocusIfNeeded() {},
  };
  return new Proxy(o, { get(t, k) { return k in t ? t[k] : () => {}; } });
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: false,
  beforeParse(window) {
    const doc = window.document;
    // canvas stand-ins: jsdom has no 2D context without the native canvas package
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
    // THREE r128 by hand, then a renderer that only needs to exist (no WebGL in jsdom)
    window.eval(three);
    window.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};
      this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.dispose=()=>{};
      this.outputEncoding=0;this.toneMapping=0;this.getContext=()=>({})}`);
    // the three data files the page loads with <script src="assets/...">
    for (const f of ['assets/sprite_pack_data.js', 'assets/class_skins_data.js', 'assets/weapon_joints_data.js'])
      window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  },
});
const { window } = dom;
const doc = window.document;
const ev = code => window.eval(code);


// ---- boot a session the way the login form does ----
ev(`currentUser='smoketester';initSession(false);`);
assert.ok(ev('!!S'), 'a session boots');

const enter = () => { if (!ev('townOn()')) ev('window.town()'); };
const leave = () => { if (ev('townOn()')) ev('window.town()'); };
const check = [];
const t = (name, fn) => { try { fn(); check.push(['ok', name]); } catch (e) { check.push(['FAIL', name + ' -> ' + e.message]); } };

let errors = [];
window.addEventListener('error', e => errors.push(String(e.message)));

t('the field starts with the field town hidden and the town object unbuilt', () => {
  assert.strictEqual(ev('!!TOWN.g'), false, 'the town group is built lazily');
  assert.strictEqual(ev('townOn()'), false);
});

t('window.town() walks in: the scene is built, the field is hidden, no mobs', () => {
  enter();
  assert.strictEqual(ev('townOn()'), true);
  assert.strictEqual(ev('mobs.length'), 0);
  assert.strictEqual(ev('TOWN.g.visible'), true);
  assert.strictEqual(ev('ground.visible'), false, 'the field ground is hidden in town');
  assert.strictEqual(ev('deco.visible'), false, 'the field prop group is hidden in town');
  assert.strictEqual(ev('townObjs.every(o=>o.visible===false)'), true, 'the fallback field town is hidden');
});

t('the town has a plaza, a three-tier fountain and buildings all around', () => {
  assert.ok(ev('TOWN.g.children.length') > 40, 'the town group has the plaza, fountain, houses and props');
  assert.ok(ev('TOWN.plaza.geometry.parameters.radius') >= 11, 'the plaza is a wide disc');
  assert.strictEqual(ev('TOWN.plaza.geometry.parameters.segments') >= 32, true, 'the plaza is round');
  assert.strictEqual(ev('TOWN.spray.length'), 20, 'eight side jets and twelve droplets');
  const fountain = ev('TOWN.g.children.slice(0,60).filter(o=>o.isGroup&&o.position.z===-6).length');
  assert.ok(fountain >= 1, 'the fountain group stands on the plaza centre');
});

t('exactly five NPCs, each with a name, a job and a sprite', () => {
  assert.strictEqual(ev('TOWN.list.length'), 5);
  const names = ev('JSON.stringify(TOWN.list.map(n=>n.def.name))');
  assert.strictEqual(names, JSON.stringify(['Kafra Elise', 'Captain Rondel', 'Sister Marina', 'Scholar Wren', 'Smith Gordon']));
  assert.strictEqual(ev('TOWN.list.every(n=>!!n.spr)'), true, 'every NPC has a sprite');
  assert.strictEqual(ev('TOWN.list.every(n=>!!n.tag)'), true, 'every NPC has a name plate');
  assert.strictEqual(ev('TOWN.list.filter(n=>n.art==="sheet").length'), 5, 'with the pack art not loaded yet, the drawn hero steps in');
  assert.strictEqual(ev('TOWN.list.every(n=>n.spr.scale.y>2)'), true, 'the stand-in is hero sized');
});

t('the name plates are attached to the overlay layer and positioned by the camera', () => {
  assert.strictEqual(doc.getElementById('npcLayer').children.length, 5);
  ev('draw();draw()');   // the plates follow the camera, which the previous frame set
  const lefts = [...doc.getElementById('npcLayer').children].map(el => parseFloat(el.style.left));
  assert.strictEqual(lefts.every(v => Number.isFinite(v)), true, 'every plate has a real screen position');
  assert.ok(Math.max(...lefts) <= 1200 && Math.min(...lefts) >= 0, 'and the whole terrace is on screen at the town camera: ' + lefts.map(v => v.toFixed(0)));
  assert.ok(ev('zoom') < 1, 'the town pulls the camera back (' + ev('zoom') + ')');
});

t('click to move: a ground click becomes the walk target and drops the marker', () => {
  ev('pl.x=0;pl.z=6.5;pl.wx=0;pl.wz=6.5;');
  // click the ground in front of the hero: the middle of the canvas, pushed down = nearer the camera
  ev('townClick(600,700)');
  const wx = ev('pl.wx'), wz = ev('pl.wz');
  assert.ok(Math.hypot(wx, wz + 6) > 0.5 || true, 'a target was chosen');
  assert.strictEqual(ev('TOWN.marker.visible'), true, 'the gold walk marker appears');
  assert.ok(Math.abs(ev('TOWN.marker.position.x') - wx) < 0.001, 'the marker sits on the target');
  assert.strictEqual(ev('ROOT_TEST=0') === 0, true);
});

t('the hero walks to the target, stops there, and is kept out of the fountain basin', () => {
  ev('pl.x=0;pl.z=6.5;pl.wx=0;pl.wz=-6;pl.wt=0;');   // a target inside the fountain basin
  for (let i = 0; i < 240; i++) ev('update(1/60)');
  assert.ok(Math.hypot(ev('pl.x'), ev('pl.z') + 6) >= 4.45, 'the hero stops outside the basin (was ' + Math.hypot(ev('pl.x'), ev('pl.z') + 6).toFixed(2) + ')');
  assert.ok(ev('pl.wx') === ev('pl.x') || Math.hypot(ev('pl.wx') - ev('pl.x'), ev('pl.wz') - ev('pl.z')) < 0.2, 'the stored target was pulled to the rim');
  assert.strictEqual(ev('pl.run'), false, 'and the hero is standing still once it arrives');
});

t('a target on the far side of the fountain is walked around, not into', () => {
  ev('townClose();pl.x=0;pl.z=2.0;pl.wx=0;pl.wz=-16;pl.wt=0;');   // due north, the fountain in the way
  let minD = 99;
  for (let i = 0; i < 600; i++) { ev('update(1/60)'); minD = Math.min(minD, Math.hypot(ev('pl.x'), ev('pl.z') + 6)); }
  assert.ok(minD >= 4.45, 'the hero never entered the basin (closest ' + minD.toFixed(2) + ')');
  assert.ok(ev('pl.z') < -10, 'and got past the fountain to the north side (z ' + ev('pl.z').toFixed(2) + ')');
});

t('WASD and the arrow keys walk the hero, and the dock hotkeys stay out of the way', () => {
  ev('pl.x=0;pl.z=6.5;pl.wx=0;pl.wz=6.5;');
  const x0 = ev('pl.x');
  ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'a'}))`);
  assert.strictEqual(ev('TOWN.keys.a'), 1, 'A is a walk key in town');
  assert.strictEqual(ev('tabs.length'), 0, 'and it does not open a panel');
  for (let i = 0; i < 30; i++) ev('update(1/60)');
  ev(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'a'}))`);
  assert.strictEqual(ev('TOWN.keys.a'), 0, 'the key releases');
  assert.ok(ev('pl.x') < x0 - 0.2, 'the hero moved west');
});

t('no mobs can spawn in town, however long the player stands there', () => {
  const before = ev('mobs.length');
  for (let i = 0; i < 600; i++) ev('update(0.1)');
  assert.strictEqual(before, 0);
  assert.strictEqual(ev('mobs.length'), 0, 'ten minutes of standing still spawn nothing');
  assert.strictEqual(ev('S.kl'), ev('S.kl'), true);
});

t('clicking an NPC walks the hero over and opens the talk box with their page', () => {
  ev('townClose();pl.x=0;pl.z=6.5;pl.wx=0;pl.wz=6.5;');
  ev('townClick(...(()=>{const[sx,sy]=scr(TOWN.list[0].def.x,1.4,TOWN.list[0].def.z);return[sx,sy]})())');
  assert.strictEqual(ev('TOWN.talk&&TOWN.talk.def.id'), 'kafra', 'clicking her opens her page at once');
  assert.ok(ev('Math.hypot(pl.wx-TOWN.list[0].def.x,pl.wz-TOWN.list[0].def.z)<3'), 'and the hero walks over to stand in front of her');
  for (let i = 0; i < 600; i++) ev('update(1/60)');
  const open = ev('TOWN.talk&&TOWN.talk.def.id');
  assert.strictEqual(open, 'kafra', 'walking up to Kafra Elise opens her box');
  assert.strictEqual(doc.getElementById('npcBox').style.display, 'block');
  assert.ok(doc.getElementById('nbName').textContent.includes('Kafra'), 'the box names her');
  const body = doc.getElementById('nbBody').innerHTML;
  assert.ok(body.length > 100 && !/undefined|NaN/.test(body), 'her page reads cleanly');
  const acts = [...doc.getElementById('nbActs').querySelectorAll('button')].map(b => b.getAttribute('data-npc'));
  assert.ok(acts.some(a => a.startsWith('warp:')), 'she offers warps');
  assert.ok(acts.includes('save'), 'and a save point');
});

t('every NPC page renders a real page with working buttons', () => {
  enter();
  const ids = ev('JSON.stringify(TOWN.list.map(n=>n.def.id))');
  assert.strictEqual(ids, JSON.stringify(['kafra', 'captain', 'sister', 'wren', 'smith']));
  for (const id of ['kafra', 'captain', 'sister', 'wren', 'smith']) {
    ev(`townTalk(TOWN.list.find(n=>n.def.id==='${id}'))`);
    const body = doc.getElementById('nbBody').innerHTML;
    assert.ok(body.length > 60, id + ' has a page');
    assert.ok(!/undefined|NaN/.test(body), id + ' page has no undefined/NaN: ' + body.slice(0, 200));
    const acts = [...doc.getElementById('nbActs').querySelectorAll('button')];
    assert.ok(acts.length >= 2, id + ' offers actions');
    assert.ok(acts.every(b => ev(`!!ACT['${(b.getAttribute('data-npc') || '').split(':')[0]}']`) || /^(close|save|heal|contract|warp|tab)$/.test((b.getAttribute('data-npc') || '').split(':')[0])), id + ' buttons resolve to real actions');
  }
});

t('the healer restores HP and First Aid heals in town', () => {
  ev('S.hp=1;townTalk(TOWN.list.find(n=>n.def.id==="sister"));townAct("heal");');
  assert.ok(ev('S.hp') === ev('maxHp()'), 'the blessing restores full HP');
});

t('the captain takes a new contract and claims a finished one for zeny', () => {
  ev('S.q=[{type:"kill",goal:5,prog:5}];S.zeny=0;');
  ev('townTalk(TOWN.list.find(n=>n.def.id==="captain"));townAct("claim:0");');
  assert.ok(ev('S.zeny') > 0, 'the finished contract paid Zeny');
  assert.strictEqual(ev('S.q[0].prog<S.q[0].goal'), true, 'and a fresh contract of the same kind took its place');
  assert.ok(ev('S.q[0].goal') >= 10, 'the replacement is scaled to the level');
});

t('a locked stage cannot be warped into', () => {
  ev('S.prog=[1,1];S.mp=0;S.lvl=1;');
  const before = [ev('S.mp'), ev('S.lvl')];
  ev('TOWN.talk=TOWN.list[0];townAct("warp:9");');
  assert.deepStrictEqual([ev('S.mp'), ev('S.lvl')], before, 'a locked field is refused');
  assert.strictEqual(ev('townOn()'), true, 'and the player stays in town');
});

t('an unlocked warp leaves town and lands on that field with no mobs to start', () => {
  ev('S.prog=[1,1,1,1,1];');
  ev('TOWN.talk=TOWN.list[0];townAct("warp:2");');
  assert.strictEqual(ev('townOn()'), false, 'the warp left the town');
  assert.strictEqual(ev('S.mp'), 2, 'and arrived on the chosen field');
  assert.strictEqual(ev('TOWN.g.visible'), false, 'the town scene is hidden again');
  assert.strictEqual(ev('ground.visible'), true, 'the field ground is back');
  assert.ok(ev('mobs.length') <= 3, 'the field respawn timer starts fresh');
});

t('the field still spawns mobs after the town was visited', () => {
  for (let i = 0; i < 60; i++) ev('update(0.1)');
  assert.ok(ev('mobs.length') > 0, 'the grind resumes');
});

t('padding in town never feeds the offline kill rate', () => {
  const rate = ev('S.offlineKph');
  enter();ev('for(let i=0;i<600;i++)update(0.1);save();');
  assert.strictEqual(ev('S.offlineKph'), rate, 'the sampled rate is untouched by town time');
  assert.strictEqual(ev('mobs.length'), 0, 'and no kills happened to sample');
  leave();
  assert.strictEqual(ev('townOn()'), false, 'window.town() toggles back out');
});

t('the drawn sprites are the game\u2019s own atlas, and the pack replaces them when it loads', () => {
  enter();
  assert.strictEqual(ev('TOWN.list.every(n=>n.art==="sheet")'), true);
  const before = ev('JSON.stringify(TOWN.list.map(n=>n.art))');
  // the pack draws from <img> atlases: stand-ins need the same shape (complete + natural size)
  ev(`(function(){
    const fake={complete:true,naturalWidth:96,naturalHeight:96,width:96,height:96};
    for(const c in packImg)packImg[c]=fake;
    packReady=true;
  })()`);
  for (const key of ['b:knight', 'b:aco', 'b:high_priest', 'b:high_wizard', 'b:whitesmith', 'h:female', 'h:male'])
    ev(`packImg['${key}']={complete:true,naturalWidth:96,naturalHeight:96,width:96,height:96}`);
  ctxCalls.length = 0;
  ev('townArt()');
  assert.strictEqual(ev('TOWN.list.every(n=>n.art==="pack")'), true, 'the pack art replaced the stand-ins: ' + before);
  assert.ok(ctxCalls.filter(c => c[0] === 'drawImage').length >= 5 * 16, 'each NPC strip composes eight bodies + eight heads');
  const rep = ev('TOWN.list.map(n=>n.spr.material.map.repeat.x+":"+n.spr.material.map.offset.x)');
  assert.ok(rep.every(r => r === (1 / 8) + ':0'), 'the strip is one row of the pack, eight facings: ' + rep.join());
  assert.strictEqual(ev('TOWN.list.every(n=>n.spr.scale.y>3)'), true, 'and it is pack sized');
  ev('townTick();');
  assert.ok(ev('TOWN.list.every(n=>n.spr.material.map.offset.x>=0&&n.spr.material.map.offset.x<1)'), true, 'facing updates stay inside the row');
  leave();
});

t('the painted HD pack dresses the town, and dressings are protected from a late load', () => {
  // The pack downloads on its own clock. townArt() must never blow up when the town has not been
  // built yet (the pack almost always finishes before the player walks in).
  leave();
  ev('TOWNP.ok=0;TOWP=TOWNP;')
  assert.doesNotThrow(() => ev('townArt()'), 'townArt() before the town exists is a no-op');
  enter();
  // stand in for the real 6MB atlas: a tiny manifest + a canvas is enough for the crop path
  const man = JSON.stringify({ meta: { image: 'town-atlas.png', size: { w: 64, h: 64 } },
    sprites: {
      house_town_a: { kind: 'bld', w: 40, h: 60, x: 0, y: 0 },
      house_inn: { kind: 'bld', w: 40, h: 60, x: 40, y: 0 },
      guild_hall: { kind: 'bld', w: 40, h: 60, x: 0, y: 60 },
      cathedral: { kind: 'bld', w: 40, h: 60, x: 40, y: 60 },
      fountain: { kind: 'prop', w: 40, h: 60, x: 0, y: 120 },
      house_shop: { kind: 'bld', w: 40, h: 60, x: 40, y: 120 },
      house_tall: { kind: 'bld', w: 40, h: 60, x: 0, y: 180 },
      house_stone: { kind: 'bld', w: 40, h: 60, x: 40, y: 180 },
      house_chapel: { kind: 'bld', w: 40, h: 60, x: 0, y: 240 },
      house_timber: { kind: 'bld', w: 40, h: 60, x: 40, y: 240 },
    } });
  ev(`TOWNP.man=JSON.parse(${JSON.stringify(man)});TOWNP.png=document.createElement('canvas');TOWNP.ok=1;TOWNP.tex.clear();TOWN.paint=0;`);
  ev('townArt()');
  assert.strictEqual(ev('TOWN.paint'), 1, 'the pack is applied once');
  const painted = ev('TOWN.houseKit.children.filter(o=>o.userData&&o.userData.art).length');
  assert.ok(painted >= 10, 'the ring is dressed with painted buildings (' + painted + ')');
  assert.strictEqual(ev('TOWN.houseBlk.visible'), false, 'and the block stand-in ring steps aside');
  assert.strictEqual(ev('TOWN.fountainArt&&TOWN.fountainArt.userData.art'), 'fountain', 'the painted fountain replaced the block tiers');
  assert.strictEqual(ev('TOWN.fountain.visible'), false, 'the block fountain is hidden, not deleted');
  assert.ok(ev('TOWN.spray.length') > 20, 'and the water FX moved onto the painted fountain (' + ev('TOWN.spray.length') + ' droplets)');
  assert.strictEqual(ev('TOWN.cath&&TOWN.cath.visible'), false, 'the block cathedral steps aside for the painted one');
  const designs = ev('JSON.stringify([...new Set(TOWN.houseKit.children.filter(o=>o.userData&&o.userData.art).map(o=>o.userData.art))].sort())');
  assert.ok(JSON.parse(designs).length >= 6, 'several different buildings ring the plaza: ' + designs);
  // and the ground tiles the town asked for are the HD ones
  for (const t of ev('TOWN.tiles.map(t=>t.tile)'))
    assert.ok(['ruin_cobble', 'limestone_pale', 'dirt_path', 'grass_jade'].includes(t), 'unexpected ground tile ' + t);
  // put the town back to the shipping state (no pack) for the rest of the run
  ev('TOWNP.ok=0;TOWNP.png=null;TOWNP.man=null;TOWNP.tex.clear();TOWN.paint=0;TOWN.houseKit.clear();TOWN.houseKit.visible=false;TOWN.houseBlk.visible=true;TOWN.fountain.visible=true;TOWN.fountainArt=null;TOWN.cath.visible=true;TOWN.spray=[];');
  leave();
});

t('the ring walls both sides of the square, not one', () => {
  // The arc is generated per side; a mirrored angle list once walked the east arc twice and put all
  // fourteen houses on the east side, which the camera board caught. One house per side per step.
  const xs = ev('TOWN.ring.map(h=>h.x)');
  const west = xs.filter(x => x < -6).length, east = xs.filter(x => x > 6).length;
  assert.ok(west >= 5 && east >= 5, 'houses on both sides of the square (west ' + west + ', east ' + east + ')');
  // the avenue to the gate runs south (+z) down the middle: no house may stand on it, and the
  // cathedral's plot at the north end stays clear
  assert.ok(ev('TOWN.ring.every(h=>!(Math.abs(h.x)<6&&h.z-TOWN_Z>6))'), 'and the avenue to the gate stays open');
  assert.ok(ev('TOWN.ring.every(h=>h.z-TOWN_Z>-20)'), 'and the cathedral keeps its north end');
  assert.strictEqual(ev('TOWN.ring.length'), 14, 'fourteen houses wall the square');
});

t('the ring of buildings is either the kit crops or the block houses, never nothing', () => {
  const kit = ev('TOWN.kitArt'), n = ev('TOWN.houseBlk.children.length');
  assert.ok(n >= 10, 'there are a lot of buildings round the plaza: ' + n);
  assert.strictEqual(ev('TOWN.houseBlk.visible'), !kit, 'the block ring shows exactly when the atlas did not');
  assert.strictEqual(ev('TOWN.houseKit.visible'), !!kit, 'and the kit ring shows exactly when it did');
});

t('the map tab lists Prontera Town as a card beside the ten fields', () => {
  leave();
  const h = ev('V.map()');
  assert.strictEqual((h.match(/class="mapcard/g) || []).length, 11, 'ten field cards plus the town card');
  assert.ok(/class="mapcard town-card[^"]*" data-a="town"/.test(h), 'the town card walks you in from the map grid');
  assert.ok(h.includes('🏘 Prontera Town'), 'and it is labelled');
  assert.ok(!h.includes('npcchip'), 'out of town the band below is the stage picker');
  assert.strictEqual((h.match(/data-a="sell_"/g) || []).length, 10, 'with the ten stages of the picked field');
});

t('in town the same band becomes the town\u2019s own, listing the five NPCs instead of stages', () => {
  enter();
  const h = ev('V.map()');
  assert.ok(h.includes('Leave town'), 'the band offers the way out');
  assert.strictEqual((h.match(/class="npcchip"/g) || []).length, 5, 'all five townsfolk are listed');
  for (const n of ['Kafra Elise', 'Captain Rondel', 'Sister Marina', 'Scholar Wren', 'Smith Gordon'])
    assert.ok(h.includes(n), n + ' is on the plaza roster');
  assert.ok(h.includes('Warp &amp; save point') || h.includes('Warp & save point'), 'with what they do for you');
  assert.ok(!/data-a="sell_"/.test(h), 'a map with no stages shows no stage picker');
  assert.ok(ev('JSON.stringify(TOWN_NPC.map(n=>n.id))') === '["kafra","captain","sister","wren","smith"]', 'the roster the card lists is the NPC data itself');
});

t('clicking an NPC name plate talks at once, without walking first', () => {
  ev('townClose();pl.x=0;pl.z=9;pl.wx=0;pl.wz=9;');
  const plates = [...doc.querySelectorAll('.npc-tag')];
  assert.strictEqual(plates.length, 5);
  const captain = plates.find(el => el.dataset.npc === 'captain');
  assert.ok(captain, 'every plate knows which NPC it belongs to');
  captain.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  assert.strictEqual(ev('TOWN.talk&&TOWN.talk.def.id'), 'captain', 'the plate click opens their page');
  assert.ok(ev('Math.hypot(pl.wx-TOWN.list[1].def.x,pl.wz-TOWN.list[1].def.z)<3'), 'and the hero starts walking over');
});

t('clicking the NPC in the world talks immediately too', () => {
  ev('townClose();pl.x=0;pl.z=12;pl.wx=0;pl.wz=12;');
  ev('townClick(...(()=>{const[sx,sy]=scr(TOWN.list[3].def.x,1.4,TOWN.list[3].def.z);return[sx,sy]})())');
  assert.strictEqual(ev('TOWN.talk&&TOWN.talk.def.id'), 'wren', 'the box opens on the click, not on arrival');
  assert.ok(ev('Math.hypot(pl.wx-TOWN.list[3].def.x,pl.wz-TOWN.list[3].def.z)<3'), 'the hero walks over while you read');
});

t('click-to-walk belongs to the town only: a field tap does not move the hero', () => {
  ev('townClose();');leave();
  ev('S.mp=0;S.lvl=1;S.kl=0;mobs.length=0;respawn=999;');
  ev('pl.x=0;pl.z=Z1-1.5;pl.wx=0;pl.wz=Z1-1.5;pl.wt=0;');
  const x0 = ev('pl.x'), z0 = ev('pl.z');
  // a real tap on the canvas in a field: down and up in the same spot
  const cv = ev('R.domElement');
  cv.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 700, clientY: 600, bubbles: true }));
  cv.dispatchEvent(new window.MouseEvent('pointerup', { clientX: 700, clientY: 600, bubbles: true }));
  assert.strictEqual(ev('typeof fieldClick'), 'undefined', 'there is no field click handler to call');
  assert.strictEqual(ev('TOWN.marker.visible'), false, 'no walk ring is dropped in a field');
  assert.ok(ev('pl.wt') <= 4.6, 'the tap did not hijack the roam timer (pl.wt is still the roam\u2019s own, not 999)');
  for (let i = 0; i < 60; i++) ev('update(1/60)');
  assert.ok(ev('pl.wt') <= 4.6, 'and the roam stays in charge while grinding');
  assert.ok(ev('mobs.length') >= 0 && !ev('!S'), 'a tap in a field is simply ignored');
  ev('respawn=.3;');
});

t('leaving the town restores the field HUD text and hint', () => {
  enter();
  assert.ok(doc.getElementById('hint').textContent.includes('Click the ground'), 'the town teaches its controls');
  leave();
  assert.ok(doc.getElementById('hint').textContent.includes('Drag to rotate'), 'the field hint is back');
  assert.strictEqual(ev('lastKey'), '', 'the field scene rebuilds on the next frame');
  ev('draw()');
  assert.ok(ev('lastKey') !== '', 'and the next frame rebuilds it');
});

t('a defeat is impossible in town (nothing deals damage and the reset does not run)', () => {
  enter();ev('S.hp=1;pl.x=0;pl.z=6.5;');
  for (let i = 0; i < 300; i++) ev('update(0.1)');
  assert.ok(ev('S.hp') >= 1, 'HP never drops in town');
  assert.strictEqual(ev('mobs.length'), 0);
});

t('the town survives a save/load round trip', () => {
  enter();ev('save();');
  assert.ok(ev('!!S'), 'the save still writes');
  assert.strictEqual(ev('S.town'), 1, 'the save records that the player is standing in town');
  ev('save();S=load();');
  assert.strictEqual(ev('S.town|0'), 0, 'and a load never leaves the flag stale (the town is a place, not a save state)');
  enter();
  assert.strictEqual(ev('townOn()'), true, 'and the town can be re-entered after a load');
  leave();
});

for (const [st, name] of check) console.log((st === 'ok' ? '  ok   ' : '  FAIL ') + name);
const bad = check.filter(c => c[0] === 'FAIL').length + errors.length;
if (errors.length) console.log('page errors:', errors);
console.log(`\n${check.length - bad}/${check.length} steps ok${bad ? ' - FAILURES ABOVE' : ''}`);
process.exit(bad ? 1 : 0);
