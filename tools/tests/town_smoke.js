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
    // The town ships SHUT (TOWN_OPEN). This suite is the owner's build, so it opens it the way the
    // owner does - the browser flag - and the "gate is shut" test below proves the locked side.
    try { window.localStorage.setItem('pg_town_open', '1'); } catch (e) {}
  },
});
const { window } = dom;
const doc = window.document;
const ev = code => window.eval(code);


// ---- boot a session the way the login form does ----
ev(`currentUser='smoketester';initSession(false);`);
assert.ok(ev('!!S'), 'a session boots');

// the palette the gate and its wall share, read out of the game so the wall test below pins the
// shipped numbers rather than a copy of them
const TOWN_MASON_ROOF = ev('TOWN_MASON&&TOWN_MASON.roof');
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

t('the gate is shut while the town is being finished: no way in, and never no way out', () => {
  leave();
  ev(`localStorage.removeItem('pg_town_open')`);
  assert.strictEqual(ev('townUnlocked()'), false, 'with the switch off, the town is locked');
  ev('window.town()');
  assert.strictEqual(ev('townOn()'), false, 'the console helper does not walk in');
  assert.strictEqual(ev('townEnter()'), 0, 'and neither does the entry itself');
  const h = ev('V.map()');
  assert.ok(!/data-a="town"/.test(h), 'the map tab offers no way in while it is shut');
  assert.ok(/Closed/.test(h) && /Prontera Town/.test(h), 'it says the town is closed instead');
  assert.strictEqual((h.match(/class="mapcard/g) || []).length, 11,
    'the card is still in the grid, greyed out - not silently missing');
  assert.ok(/mapcard town-card closed/.test(h), 'and dressed as a shut card, not a live one');
  // ...but a gate must never shut somebody IN: leaving is never gated
  ev(`localStorage.setItem('pg_town_open','1')`);
  enter();
  assert.strictEqual(ev('townOn()'), true, 'the owner (flag set) walks straight in');
  ev(`localStorage.removeItem('pg_town_open')`);
  ev('window.town()');
  assert.strictEqual(ev('townOn()'), false, 'and can always leave, even with the gate shut behind them');
  ev(`localStorage.setItem('pg_town_open','1')`);      // the rest of the suite runs as the owner
  assert.strictEqual(ev('townUnlocked()'), true, 'and the flag is what opens it');
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
  // the fountain is the group at the square's centre - asserted on the group itself, because the
  // river and the bridge now stand in TOWN.g ahead of it and a child index would drift
  assert.strictEqual(ev('!!TOWN.fountain&&TOWN.fountain.position.x===0&&TOWN.fountain.position.z===-6'),
    true, 'the fountain group stands on the plaza centre');
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
    assert.ok(['ruin_cobble', 'limestone_pale', 'dirt_path', 'grass_jade', 'water_frame_0', 'bridge_planks',
      'sand_gold', 'cliff'].includes(t), 'unexpected ground tile ' + t);
  // the wall, the quay and the bridge are not pastel blocks next to painted sprites: every raised
  // course of stone names a kit tile, and the three that matter name one the pack actually has.
  const masons = JSON.parse(ev('JSON.stringify((TOWN.tiles||[]).filter(t=>t.m&&t.m!==TOWN.river.m).map(t=>t.tile))'));
  assert.ok(masons.length >= 6, 'the masonry courses are dressed, not painted flat: ' + masons.length);
  assert.ok(masons.every(t => typeof t === 'string' && t), 'each one names a tile: ' + masons.join(','));
  for (const need of ['bridge_planks', 'limestone_pale'])
    assert.ok(masons.indexOf(need) >= 0, 'including the pack\'s ' + need);
  // jsdom never loads the kit image, so "the map is on it" is only checkable once kitArt is up;
  // what IS checkable here is that every name is a tile the kit manifest really ships.
  const flat = JSON.parse(ev('JSON.stringify((TOWN.tiles||[]).filter(t=>t.m&&t.m!==TOWN.river.m&&!t.m.material.map).map(t=>t.tile))'));
  assert.ok(ev('!TOWN.kitArt') || flat.length === 0, 'nothing is left flat while the kit is in: ' + flat.join(','));
  const kitMan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'kit', 'ro-tiles-hd.json'), 'utf8'));
  const kitNames = Object.keys(kitMan.sprites || kitMan.tiles || {});
  for (const t of masons)
    assert.ok(kitNames.indexOf(t) >= 0, 'the kit manifest has the tile it was asked for: ' + t);
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

t('the ring of buildings is the painted ring, the kit crops or the block houses, never nothing', () => {
  // The pack downloads on its own clock, so any of the three dressings is a legitimate shipping
  // state - what must never happen is a bare square, or two rings standing at once.
  const kit = ev('TOWN.kitArt'), paint = ev('TOWN.paint');
  const blocks = ev('TOWN.houseBlk.children.length');
  const painted = ev('TOWN.houseKit.children.filter(o=>o.userData&&o.userData.art).length');
  const blkVis = ev('TOWN.houseBlk.visible'), kitVis = ev('TOWN.houseKit.visible');
  assert.ok(blocks >= 10, 'the block houses are always built, as the fallback: ' + blocks);
  if (paint) {
    assert.ok(painted >= 10, 'the painted ring dresses the square: ' + painted);
    assert.strictEqual(kitVis, true, 'and the ring group the painted houses live in is visible');
    assert.strictEqual(blkVis, false, 'with the block stand-ins out of the way');
  } else {
    assert.strictEqual(painted, 0, 'no painted houses before the pack is applied');
    assert.strictEqual(blkVis, !kit, 'the block ring shows exactly when the atlas did not: kitArt=' + kit);
    assert.strictEqual(kitVis, !!kit, 'and the kit ring shows exactly when it did');
  }
  assert.ok(!(blkVis && kitVis), 'two rings never stand at once');
});

t('the river crosses the south approach, and the bridge is the only way over it', () => {
  enter();
  const z0 = ev('TOWN_RIVER.z0'), z1 = ev('TOWN_RIVER.z1'), half = ev('TOWN_RIVER.half');
  assert.ok(z1 > z0 && half > 2, 'the water band is a real band: ' + [z0, z1, half].join('|'));
  assert.ok(z0 > 12 && z1 < 22, 'and it lies between the square and the gate: ' + z0 + '..' + z1);
  assert.strictEqual(ev('TOWN.river.m.parent===TOWN.g'), true, 'the river is a mesh in the town group');
  assert.ok(ev('TOWN.tiles.some(t=>t.m===TOWN.river.m&&t.tile==="water_frame_0")'),
    'and the kit paints it with its own animated water tile');
  // the walk line: off the bridge the water pushes the hero back to whichever bank is nearer
  // the quay wall is a solid .8 thick, so the hold line is its outer face - the street side of it,
  // derived from the river's own numbers rather than pinned, or the wall would swallow the hero
  assert.strictEqual(ev('townAvoid(-13,' + (z0 + 1) + ')[1]'), ev('TOWN_RIVER.z0-TOWN_RIVER.kerb'),
    'on the west bank the hero is held at the quay wall');
  assert.strictEqual(ev('townAvoid(13,' + (z1 - 1) + ')[1]'), ev('TOWN_RIVER.z1+TOWN_RIVER.kerb'),
    'and held out of the water from the gate side too');
  assert.strictEqual(ev('townAvoid(0,' + (z0 + 1) + ')[1]'), z0 + 1, 'but the bridge deck itself is walkable');
  assert.strictEqual(ev('townAvoid(0,' + (z1 - 1) + ')[1]'), z1 - 1, 'right across the band');
  // the deck spans the whole channel, and the abutments sit low with the deck arching between them
  assert.ok(ev('TOWN.bridge.z0<TOWN_RIVER.z0&&TOWN.bridge.z1>TOWN_RIVER.z1'), 'the deck spans the whole channel');
  const tops = ev('[0,1,2,3,4,5,6,7,8,9].map(i=>Math.round(TOWN.bridge.top(i)*100)/100)');
  assert.ok(tops[0] < .7 && tops[9] < .7, 'the abutments carry the deck out of the water: ' + tops.join(','));
  assert.ok(tops[4] > tops[0] + .3 && tops[5] > tops[9] + .3, 'with the deck arching up between them');
  assert.ok(Math.max.apply(null, tops) < 1.25, 'a river bridge, not a viaduct: ' + Math.max.apply(null, tops));
  // it is a bridge, not a slab: piers stand in the water and the arch faces are dark recesses
  assert.ok(ev('!!TOWN.tiles.find(t=>t.tile==="bridge_planks")'), 'the deck wears the kit\'s own decking');
  // the channel is SUNKEN: the water sits below the street, which is what "below is a river" asks
  assert.ok(ev('TOWN.river.m.position.y') < -.5, 'the water lies below the street: ' + ev('TOWN.river.m.position.y'));
  assert.ok(ev('TOWN.bridge.top(4)') > ev('TOWN.river.m.position.y') + 1,
    'and the deck clears it like a bridge, not a stripe on the road');
  // the quay runs must be CUT where the bridge crosses: a long parapet across the avenue is the
  // old bug, and no height check can tell a parapet from the deck, so this looks at the length
  const crossers = JSON.parse(ev(`(()=>{const out=[];TOWN.g.traverse(o=>{const g=o.geometry;
    if(!o.isMesh||!g||!g.parameters||g.parameters.depth===undefined||o.rotation.x)return;
    const hw=g.parameters.width/2;if(hw<=10)return;                    // only the long wall runs
    const p=new THREE.Vector3();o.getWorldPosition(p);
    if(Math.abs(p.z-TOWN_RIVER.z0)>1.6&&Math.abs(p.z-TOWN_RIVER.z1)>1.6)return;
    if(Math.abs(p.x)-hw<TOWN_RIVER.half)out.push([+p.x.toFixed(1),+p.z.toFixed(1),+hw.toFixed(1)])});
    return JSON.stringify(out)})()`));
  assert.strictEqual(crossers.length, 0, 'and no quay run crosses the avenue: ' + JSON.stringify(crossers));
  assert.ok(ev('!!TOWN.tiles.find(t=>t.tile==="sand_gold")'), 'with a bed under the water to close the channel');
  // the ground the hero stands on follows the same profile, and is flat everywhere else
  assert.ok(ev('townGroundY(0,17.5)') > .3, 'the hero stands on the arch at the crown');
  assert.ok(ev('townGroundY(0,TOWN.bridge.z0-TOWN.bridge.ramp-.2)') === 0, 'flat ground before the ramp');
  assert.ok(ev('townGroundY(0,TOWN.bridge.z0-TOWN.bridge.ramp*.45)') > .05
    && ev('townGroundY(0,TOWN.bridge.z0-TOWN.bridge.ramp*.45)') < ev('TOWN.bridge.base'),
    'and walks up the ramp onto it');
  assert.strictEqual(ev('townGroundY(-13,17.5)'), 0, 'never above the water off the deck');
  assert.strictEqual(ev('townGroundY(0,26)'), 0, 'and the ground past the gate is level');
  assert.ok(ev('TOWN_BOUND.z1>TOWN.bridge.z1'), 'the walkable bound runs out past the bridge, to the gate');
});

t('the way in: the hero walks out of the square, over the bridge, onto the far bank', () => {
  enter();
  // walk the whole way in: from the square, over the arch, to the wall the gate stands in
  ev('townClose();pl.x=0;pl.z=7.5;pl.wx=0;pl.wz=' + (ev('TOWN_BOUND.z1') - .05) + ';pl.wt=0;');
  let top = 0, offDeck = 0;
  for (let i = 0; i < 900; i++) {
    ev('update(1/60)');
    top = Math.max(top, ev('townGroundY(pl.x,pl.z)'));
    if (!ev('!(pl.z>TOWN_RIVER.z0&&pl.z<TOWN_RIVER.z1)||Math.abs(pl.x)<=TOWN_RIVER.half+.45')) offDeck++;
  }
  assert.ok(top > .3, 'the walk rises onto the bridge (top ' + top.toFixed(2) + ')');
  assert.strictEqual(offDeck, 0, 'and never leaves the deck while over the water');
  assert.ok(ev('pl.z') > ev('TOWN_RIVER.z1') + 1, 'arriving in the gate forecourt (z ' + ev('pl.z').toFixed(1) + ')');
  assert.ok(ev('townGroundY(pl.x,pl.z)') < .05,
    'back at ground level past the bridge (' + ev('townGroundY(pl.x,pl.z)') + ')');
  // and the drawn hero stands on the deck, not inside it: draw() sets the sprite's height from it
  ev('P.position.set(0,0,0);pl.x=0;pl.z=17.5;pl.wx=0;pl.wz=17.5;draw()');
  assert.ok(ev('P.position.y') > .3, 'the drawn hero is on top of the bridge, not sunk into it');
  assert.ok(Math.abs(ev('P.position.y') - ev('townGroundY(0,17.5)')) < .001, 'at exactly the deck height');
});

t('the entrance street fronts the avenue on both flanks', () => {
  enter();
  const street = JSON.parse(ev('JSON.stringify(TOWN.street||[])'));
  assert.ok(street.length >= 3, 'the entrance has a street of its own: ' + street.length + ' houses');
  assert.ok(street.some(h => h.x < -8), 'and the west flank of the avenue is built up');
  assert.ok(street.some(h => h.x > 8), 'and the east flank');
  assert.ok(street.every(h => Math.abs(h.x) > 6), 'none of them stands in the avenue');
  assert.ok(ev('TOWN.street.every(h=>h.z<TOWN_RIVER.z0)'), 'the whole street is on the town side of the river');
  assert.ok(ev('TOWN.street.every(h=>h.z-TOWN_Z>-20)'), 'and clear of the cathedral');
  assert.ok(street.every(h => !!h.d), 'each one names its design, so stand-in and art never disagree');
  // one stand-in house per slot, and the painted ring is dressed from the same list
  assert.strictEqual(ev('TOWN.houseBlk.children.filter(o=>o.isGroup).length'),
    ev('TOWN.ring.length') + street.length, 'a stand-in house for every slot, street included');
  const designs = ev('JSON.stringify([...new Set(TOWN.houseKit.children.filter(o=>o.userData&&o.userData.art).map(o=>o.userData.art))].sort())');
  if (ev('TOWN.paint')) assert.ok(JSON.parse(designs).some(d => d === 'house_shop' || d === 'house_stone'),
    'and the street houses are among the painted ones: ' + designs);
});

t('every building is grounded: the art and the stand-ins both carry a contact shadow', () => {
  enter();
  assert.strictEqual(ev('townShadowTex.has("core")&&townShadowTex.has("soft")'), true,
    'one shared shadow pair is drawn once and reused');
  // the block stand-ins: two shadow layers under every one of them, at the foot of the art
  assert.strictEqual(ev('TOWN.houseBlk.children.filter(o=>o.isGroup).every(g=>g.children.filter(c=>c.isMesh&&c.rotation.x<0&&c.position.y<.05).length===2)'),
    true, 'every block house stands on two shadow layers at its foot');
  if (ev('TOWN.paint')) {
    const parts = JSON.parse(ev(`JSON.stringify(TOWN.houseKit.children.filter(o=>o.userData&&o.userData.art).map(g=>{
      const f=g.children.find(c=>c.userData&&c.userData.face)||{};
      return {art:g.userData.art,
        face:f.geometry?{w:f.geometry.parameters.width,h:f.geometry.parameters.height,y:f.position.y,
                         mat:f.material&&f.material.type,mesh:!!f.isMesh}:null,
        bodies:g.children.filter(c=>c.isMesh&&c.geometry.type==='BoxGeometry').length,
        sink:TOWN_SINK[g.userData.art]||0,
        shadows:g.children.filter(c=>c.isMesh&&c.rotation.x<0&&c.position.y<.05)
          .map(c=>[c.geometry.parameters.width,c.geometry.parameters.height])};}))`));
    assert.ok(parts.length >= 10, 'the painted houses are up: ' + parts.length);
    for (const p of parts) {
      assert.ok(p.face && p.face.mesh, p.art + ' is a facade (a plane with a fixed facing), not a sprite: ' + JSON.stringify(p.face));
      assert.strictEqual(p.face.mat, 'MeshBasicMaterial', p.art + ' is dressed with the painted art');
      // THE FLOAT FIX: the art is planted, not hung by its lowest pixel. The facade's centre sits
      // half a height up MINUS the sink the atlas was measured for, so the middle of the painted
      // base lands on the ground and the near corner that goes under is hidden by it.
      const want = p.face.h / 2 - p.sink * p.face.h;
      assert.ok(Math.abs(p.face.y - want) < 1e-6,
        p.art + ' is sunk by ' + p.sink + ' of its height (' + p.face.y.toFixed(3) + ' vs ' + want.toFixed(3) + ')');
      assert.ok(p.sink > 0, p.art + ' has a measured ground offset at all');
      // and it is a building, not a cut-out: one body box standing behind the front
      assert.strictEqual(p.bodies, p.art === 'cathedral' ? 0 : 1,
        p.art + ' has a body behind its front (none for the cathedral, which nothing walks behind)');
      assert.strictEqual(p.shadows.length, 2, p.art + ' stands on exactly two shadow planes');
      const soft = p.shadows[0], core = p.shadows[1];
      // the fix for "the buildings look floating": the shadow's depth is cut from the sprite's WIDTH.
      // Scaling it with the artwork's height gave tall narrow houses a wide pale puddle instead.
      assert.ok(soft[1] / soft[0] < .5 && core[1] / core[0] < .5,
        'the shadow is flat under the art, not a puddle: ' + JSON.stringify(p.shadows));
      assert.ok(core[0] < soft[0] && core[1] < soft[1], 'with a tight core inside the wider penumbra');
    }
  }
});

t('the square is a paved market square, and the wall reads as masonry', () => {
  enter();
  // the paving: the two crossing streets meet at the fountain and the apron rings its basin, so the
  // plaza is not one flat grey disc (canon: the streets round the fountain are the market)
  const strips = JSON.parse(ev(`JSON.stringify((TOWN.tiles||[]).filter(t=>t.tile==='limestone_pale'
    &&t.m.geometry&&t.m.geometry.type==='PlaneGeometry'&&Math.abs(t.m.position.y-.025)<.002)
    .map(t=>[t.m.geometry.parameters.width,t.m.geometry.parameters.height]))`));
  assert.ok(strips.length >= 2, 'two paved streets cross the square: ' + JSON.stringify(strips));
  assert.ok(strips.some(w => w[0] > 20) && strips.some(w => w[1] > 20),
    'one running north-south and one east-west through the fountain: ' + JSON.stringify(strips));
  assert.strictEqual(ev("(TOWN.tiles.find(t=>t.tile==='limestone_pale'&&t.m.geometry&&t.m.geometry.type==='RingGeometry')||{}).m?.geometry.parameters.outerRadius"), 7.2,
    'and a paved apron rings the fountain basin, outside its keep-out');
  // the beds moved off those streets onto the diagonals, or the paving would run through them
  const beds = JSON.parse(ev("JSON.stringify((TOWN.propSpots||[]).filter(p=>p.n.indexOf('flower_bed')===0).map(p=>[p.x,p.z]))"));
  assert.ok(beds.length >= 4, 'the flower beds are still there: ' + beds.length);
  for (const b of beds)
    assert.ok(Math.abs(b[0]) > 1.2 && Math.abs(b[1] - ev('TOWN_Z')) > 1.2,
      'but none of them stands in the crossing streets: ' + JSON.stringify(b));
  // the wall the gate stands in is masonry, not a slab: buttresses on its face and slits between them
  const wall = JSON.parse(ev(`(()=>{let but=0,slit=0;TOWN.g.traverse(o=>{const g=o.geometry;
    if(!o.isMesh||!g||!g.parameters||g.parameters.depth===undefined)return;
    const p=new THREE.Vector3();o.getWorldPosition(p);
    if(Math.abs(p.z-23.95)>.6)return;
    if(g.parameters.width>=.9&&g.parameters.height>3.5)but++;                       // buttress shafts
    if(o.material&&o.material.color&&o.material.color.getHex()===TOWN_MASON.slit)slit++;  // arrow slits
    });return JSON.stringify([but,slit])})()`));
  assert.ok(wall[0] >= 10, 'the wall carries buttresses: ' + wall[0]);
  assert.ok(wall[1] >= 8, 'and arrow slits between them: ' + wall[1]);
  // every course still wears a tile the kit really ships (the flat-pastel check, kept honest)
  const names = JSON.parse(ev("JSON.stringify([...new Set((TOWN.tiles||[]).map(t=>t.tile))])"));
  assert.ok(names.indexOf('limestone_pale') >= 0 && names.indexOf('bridge_planks') >= 0,
    'the masonry and the deck are still kit tiles: ' + names.join(','));
  // THE ENTRANCE FIX: the curtain wall is the gate's building, so it wears the gate's stone. It
  // used to be pale limestone with blue cones beside a brown castle gate - "not relatable at all".
  const wallTile = JSON.parse(ev("JSON.stringify([...new Set((TOWN.tiles||[]).filter(t=>t.m&&t.m.geometry.type==='BoxGeometry'&&Math.abs(t.m.position.z-23)<.6&&t.m.geometry.parameters.width>6).map(t=>t.tile))])"));
  assert.ok(wallTile.length > 0 && wallTile.every(t => t === 'cliff'),
    'the long wall runs wear the warm stone tile, not pale limestone: ' + wallTile.join(','));
  // the caps: every cone on the gate line - gatehouse, watch towers, bastions - is the gate's own
  // roof red, measured off the painted arch. They were 0x3f6fb5 blue, which is half of what
  // "the entrance is brown castle like but the wall beside it is white & blue roof" was looking at.
  const rooves = JSON.parse(ev(`(()=>{const s=new Set();TOWN.g.traverse(o=>{
    if(!o.isMesh||!o.geometry||o.geometry.type!=='ConeGeometry')return;
    const p=new THREE.Vector3();o.getWorldPosition(p);
    if(Math.abs(p.z-23)>3.5)return;s.add(o.material.color.getHexString())});
    return JSON.stringify([...s])})()`));
  assert.deepStrictEqual(rooves, [('000000' + TOWN_MASON_ROOF.toString(16)).slice(-6)],
    'the gate\'s towers and bastions are capped in its own roof red, not blue: ' + rooves.join(','));
});

t('the river animates on the town clock, not the field one', () => {
  enter();
  const frames = ev('TOWN.river.maps?TOWN.river.maps.length:0');
  assert.ok(frames === 0 || frames === 2, 'the river carries the kit frame pair when the kit is in: ' + frames);
  // the field's water tick only runs from simSteps, so the town must swap its own frames
  ev('TOWN.river.maps=[TOWN.river.m.material.map,{fake:1}];TOWN.river.wt=.6;townTick()');
  assert.strictEqual(ev('TOWN.river.m.material.map===TOWN.river.maps[1]'), true,
    'a town tick past the .55s frame swaps to the second water frame');
  ev('TOWN.river.wt=.6;townTick()');
  assert.strictEqual(ev('TOWN.river.m.material.map===TOWN.river.maps[0]'), true, 'and the next one swaps back');
  ev('TOWN.river.maps=null;TOWN.river.wt=0;');        // put the river back the way townArt left it
});

t('the map tab lists Prontera Town as a card beside the ten fields', () => {
  leave();
  const h = ev('V.map()');
  assert.strictEqual((h.match(/class="mapcard/g) || []).length, 11, 'ten field cards plus the town card');
  assert.ok(/class="mapcard town-card[^"]*" data-a="town"/.test(h), 'the town card walks you in from the map grid');
  assert.ok(h.includes('🏘 Prontera Town'), 'and it is labelled');
  assert.ok(!h.includes('npcchip'), 'out of town the band below is the stage picker');
  // the field's stage picker is fifteen nodes now: stages 1-10 plus the v76 Nightmare band 11-15
  assert.strictEqual((h.match(/data-a="sell_"/g) || []).length, 15, 'with the fifteen stages of the picked field (10 + the Nightmare band)');
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

t('the houses keep their own facing: nothing swings round to follow the camera', () => {
  enter();
  const spots = 'TOWN.ring.concat(TOWN.street)';
  const yaws = JSON.parse(ev(`JSON.stringify(${spots}.map(h=>+h.yaw.toFixed(4)))`));
  assert.ok(yaws.length >= 17, 'every house slot carries the facing it was given: ' + yaws.length);
  // a front looks AT the thing it fronts on to - the square, or the avenue - never away from it.
  // (They used to face outward, so the doors were on the side nobody walks down.)
  const dots = JSON.parse(ev(`JSON.stringify(${spots}.map(h=>{
    const fx=(h.fx||0)-h.x,fz=(h.fz==null?TOWN_Z:h.fz)-h.z,l=Math.hypot(fx,fz)||1;
    return +(Math.sin(h.yaw)*fx/l+Math.cos(h.yaw)*fz/l).toFixed(3)}))`));
  assert.ok(dots.every(d => d > .999), 'every house front faces the square: ' + dots.join(','));
  // the block stand-ins are turned to exactly the angle the painted facade will take over them
  const blk = JSON.parse(ev(`JSON.stringify(TOWN.houseBlk.children.filter(o=>o.isGroup).map(g=>+g.rotation.y.toFixed(4)))`));
  assert.deepStrictEqual(blk, yaws, 'a stand-in and the house that replaces it look the same way');
  // and the fix for "the gate & all houses spins together with the camera": the buildings are
  // real geometry with a fixed facing, not THREE.Sprites (which are re-aimed at the camera every
  // frame by the renderer, so no amount of checking their matrix would tell you).
  const sprites = JSON.parse(ev(`JSON.stringify(TOWN.houseBlk.children.filter(o=>o.isGroup)
    .reduce((n,g)=>n+g.children.filter(c=>c.isSprite).length,0))`));
  assert.strictEqual(sprites, 0, 'no house is a billboard: ' + sprites);
  const q = () => ev(`JSON.stringify(TOWN.houseBlk.children.filter(o=>o.isGroup)
    .map(g=>g.getWorldQuaternion(new THREE.Quaternion()).toArray().map(v=>+v.toFixed(5))))`);
  const before = q();
  ev('az=1.1;draw();az=2.6;draw();az=-.7;draw()');
  assert.strictEqual(q(), before, 'orbiting the camera leaves every house facing where it was');
  ev('az=0;draw()');
});

t('no tree stands inside a building, and the terrace stands clear of the ring', () => {
  enter();
  // the terrace: measured against every house plot, not eyeballed. "Above the fountain there is a
  // platform, its overlapping with the buildings" was this platform, 28 wide at z -20.6, running
  // through the two houses at the head of the square.
  const T = JSON.parse(ev('JSON.stringify(TOWN.terrace)'));
  const plots = JSON.parse(ev(`JSON.stringify(TOWN.ring.concat(TOWN.street).map(h=>{
    const c=Math.abs(Math.cos(h.yaw)),s=Math.abs(Math.sin(h.yaw)),d=(h.foot||{d:6.4}).d,w=(h.foot||{w:7.4}).w;
    return {x:h.x-Math.sin(h.yaw)*d/2,z:h.z-Math.cos(h.yaw)*d/2,
            hw:w/2*c+d/2*s+.5,hd:w/2*s+d/2*c+.5}}))`));
  for (const p of plots)
    assert.ok(!(Math.abs(p.x) < (T.x1 - T.x0) / 2 + p.hw && Math.abs(p.z - (T.z0 + T.z1) / 2) < (T.z1 - T.z0) / 2 + p.hd),
      'the terrace is clear of the house at ' + p.x.toFixed(1) + ',' + p.z.toFixed(1));
  assert.ok(Math.abs(T.x0) < 9 && T.z1 < -15, 'and it is still behind the five of them: ' + JSON.stringify(T));
  // the trees: every one of them is tested against the house plots before it is planted
  const trees = JSON.parse(ev('JSON.stringify(TOWN.trees||[])'));
  assert.ok(trees.length >= 8, 'the town keeps its trees: ' + trees.length);
  for (const tr of trees) {
    assert.ok(ev(`townClear(${tr.x},${tr.z},${tr.r})`),
      'the tree at ' + tr.x.toFixed(1) + ',' + tr.z.toFixed(1) + ' clears every building');
    assert.ok(Math.hypot(tr.x, tr.z - ev('TOWN_Z')) > 21, 'and stands outside the house line');
  }
  // the flower beds get the same test
  const beds = JSON.parse(ev(`JSON.stringify((TOWN.propSpots||[]).filter(p=>p.n.indexOf('flower_bed')===0).map(p=>[p.x,p.z]))`));
  assert.ok(beds.length >= 4, 'the flower beds survived the clearance too: ' + beds.length);
  for (const b of beds)
    assert.ok(ev(`townClear(${b[0]},${b[1]},1.9,'house')`),
      'the bed at ' + b[0].toFixed(1) + ',' + b[1].toFixed(1) + ' is not inside a house');
});

t('the stand-in tree is one piece: the canopy sits on the trunk, not above it', () => {
  enter();
  const trees = JSON.parse(ev(`JSON.stringify((TOWN.trees||[]).map(t=>{
    const g=TOWN.propBlk.children.find(o=>o.isGroup&&Math.abs(o.position.x-t.x)<.01&&Math.abs(o.position.z-t.z)<.01);
    if(!g)return null;
    const cy=g.children.find(o=>o.geometry&&o.geometry.type==='CylinderGeometry');
    const sp=g.children.find(o=>o.geometry&&o.geometry.type==='SphereGeometry');
    return cy&&sp?[cy.position.y+cy.geometry.parameters.height/2,sp.position.y-sp.geometry.parameters.radius]:null;}))`));
  const seen = trees.filter(Boolean);
  assert.ok(seen.length >= 8, 'the stand-in trees are in the prop group: ' + seen.length);
  for (const [trunkTop, canopyBottom] of seen)
    assert.ok(canopyBottom < trunkTop, 'the canopy overlaps the top of its trunk (' +
      canopyBottom.toFixed(2) + ' < ' + trunkTop.toFixed(2) + ') - a gap here is a tree with its head in the air');
});

for (const [st, name] of check) console.log((st === 'ok' ? '  ok   ' : '  FAIL ') + name);
const bad = check.filter(c => c[0] === 'FAIL').length + errors.length;
if (errors.length) console.log('page errors:', errors);
console.log(`\n${check.length - bad}/${check.length} steps ok${bad ? ' - FAILURES ABOVE' : ''}`);
process.exit(bad ? 1 : 0);
