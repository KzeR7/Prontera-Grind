// Panel composition and redraw regression: real renderers and DOM, no WebGL required.
// Run with jsdom and three@0.128.0 available (same optional dependencies as field_loop_smoke).
//   node tools/tests/panel_layout_smoke.js
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('panel layout: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0);
}
const ROOT = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let threePath = null;
try { threePath = require.resolve('three/build/three.min.js'); } catch (e) { threePath = null; }
if (!threePath) { console.log('panel layout: skipped (npm i --no-save jsdom three@0.128.0)'); process.exit(0); }
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

let pass=0,fail=0;
const t=(name,fn)=>{try{fn();console.log('  ok   '+name);pass++}catch(e){console.log('  FAIL '+name+' -> '+e.message);fail++}};
ev(`S=fresh();S.lv=150;S.cls='Lord Knight';S.jobs[S.cls]={jl:50,jx:0};S.zeny=5000000;S.auto=false;
S.inv=[{id:9001,name:'Nightmare Blade',slot:'weapon',wt:'sword',tier:4,sec:5,val:300,r:7,aff:[{k:'str',v:3}],slots:2,cards:[],locked:true},{id:9002,name:'Nightmare Katar',slot:'weapon',wt:'katar',tier:4,sec:4,val:280,r:6,aff:[],slots:4,cards:[]}];
S.eq.weapon={...S.inv[0],id:9003};S.cards=[{id:8001,n:'Poring Card',stat:'str',v:3,g:1,card:true}];
S.pets=[{id:7001,sp:0,mut:2,eq:[0,0,0],skills:[],on:true}];S.gm=true;
selB=9001;selE='weapon';selC='Poring Card';selP=7001;selK='Lord Knight';selS='aid';
`);
const cases=[['map',''],['status',"sub.status='stats'"],['status',"sub.status='equip'"],['job',''],['skills',''],['bag',"sub.bag='bag'"],['bag',"sub.bag='cards'"],['pet',''],['index',"indexMode='mobs'"],['index',"indexMode='cards'"],['board',''],['market',''],['log',''],['set',''],['gm','']];
for(const [key,prepare] of cases)t(key+' '+prepare+': all original controls, state and action values survive composition',()=>{
  if(prepare)ev(prepare);
  const root=window.document.createElement('div');root.innerHTML=ev(`V.${key}()`);
  const old=[...root.querySelectorAll('[data-a],[data-trial],input,select,canvas')];
  const signatures=old.map(e=>[e.getAttribute('data-a'),e.getAttribute('data-v'),e.disabled,e.checked]);
  const state=ev('JSON.stringify(S)');
  ev('arrangePanel')(key,root);
  assert.strictEqual(root.querySelectorAll('[data-a],[data-trial],input,select,canvas').length,old.length);
  old.forEach((e,i)=>{assert.ok(root.contains(e),'lost '+e.outerHTML.slice(0,120));assert.deepStrictEqual([e.getAttribute('data-a'),e.getAttribute('data-v'),e.disabled,e.checked],signatures[i])});
  assert.strictEqual(ev('JSON.stringify(S)'),state,'composition cannot mutate the save');
  assert.ok(root.querySelector('.ui-hero')&&root.querySelector('.ui-content'));
});
t('map has destination, travel and field-guide sections; travel stays outside folded help',()=>{
  const root=window.document.createElement('div');root.innerHTML=ev('V.map()');ev('arrangePanel')('map',root);
  assert.strictEqual(root.querySelectorAll('.ui-destinations [data-a="selm"]').length,10);
  assert.strictEqual(root.querySelectorAll('.ui-route [data-a="sell_"]').length,15);
  assert.ok(root.querySelector('.ui-primary-action [data-a="go"]'));
  assert.ok(!root.querySelector('[data-a="go"]').closest('details'));
  assert.ok(root.querySelector('.ui-field-guide details'));
});
t('job paths preserve all 19 classes in six readable progression rows',()=>{
  const root=window.document.createElement('div');root.innerHTML=ev('V.job()');ev('arrangePanel')('job',root);
  assert.strictEqual(root.querySelectorAll('.ui-job-path').length,6);
  for(const row of root.querySelectorAll('.ui-job-path'))assert.strictEqual(row.querySelectorAll('.tn').length,3);
  assert.ok(root.querySelector('.ui-inspector #classPreview'));
});
t('bag details are outside the item grid, including all Nightmare sale actions',()=>{
  ev("sub.bag='bag'");const root=window.document.createElement('div');root.innerHTML=ev('V.bag()');ev('arrangePanel')('bag',root);
  assert.ok(!root.querySelector('.grid .grid-detail'));
  assert.ok(root.querySelector('.ui-inspector [data-a="equip"]'));
  assert.ok(root.querySelector('.ui-management [data-a="autosell"][data-v="5"]'));
  assert.ok(root.querySelector('.ui-management [data-a="autosell"][data-v="6"]'));
});
t('equipment inspector stays inside the chooser boundary',()=>{
  ev("sub.status='equip'");const root=window.document.createElement('div');root.innerHTML=ev('V.status()');ev('arrangePanel')('status',root);
  assert.ok(root.querySelector('.ui-inspector [data-a="refine"]').closest('.doll'));
  assert.ok(root.querySelector('.ui-loadout-slots [data-a="seleq"]'));
});
t('redraw preserves open AND closed disclosures, plus independent catalogue scroll positions',()=>{
  ev("tabs.splice(0,tabs.length,'skills');renderWin()");
  let d=window.document.querySelector('[data-ui-disclosure="skills-skill-line-0"]');assert.ok(d.open);d.open=false;
  let c=window.document.querySelector('[data-panel-scroll="skills"]');c.scrollTop=90;
  ev('renderWin()');assert.strictEqual(window.document.querySelector('[data-ui-disclosure="skills-skill-line-0"]').open,false);
  assert.strictEqual(window.document.querySelector('[data-panel-scroll="skills"]').scrollTop,90);
  d=window.document.querySelector('[data-ui-disclosure="skills-skill-notes"]');d.open=true;ev('renderWin()');
  assert.ok(window.document.querySelector('[data-ui-disclosure="skills-skill-notes"]').open);
});
t('a kill redraw keeps the horizontally scrolled navigation dock fixed',()=>{
  const dock=window.document.getElementById('dock'),buttons=[...dock.querySelectorAll(':scope > [data-t]')];
  dock.scrollLeft=173;ev('renderWin()');
  assert.strictEqual(dock.scrollLeft,173,'redraw must not snap the phone dock back to its first tab');
  assert.strictEqual(dock.querySelector(':scope > [data-t]'),buttons[0],'redraw must retain the live dock buttons');
  assert.strictEqual(dock.querySelectorAll(':scope > [data-t]').length,buttons.length);
});
t('expand and compact buttons keep the same live panel and action set',()=>{
  const host=window.document.getElementById('wins');const before=host.querySelectorAll('[data-a]').length;
  host.querySelector('[data-ui-expand]').click();assert.ok(host.querySelector('.ui-expanded'));assert.strictEqual(host.querySelectorAll('[data-a]').length,before);
  host.querySelector('[data-ui-expand]').click();assert.ok(!host.querySelector('.ui-expanded'));
});
t('expansion preserves an open equipment chooser after a pointer gesture',()=>{
  ev("tabs.splice(0,tabs.length,'status','bag');sub.status='equip';sub.bag='bag';eqPick='weapon';selE='weapon';renderWin()");
  const button=window.document.querySelector('[data-ui-expand="status"]');
  button.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
  button.dispatchEvent(new window.Event('pointerup',{bubbles:true}));button.click();
  assert.strictEqual(ev('eqPick'),'weapon');assert.ok(ev("tabs.includes('bag')"));
});
t('locked Market explains its level gate without offering purchases',()=>{
  ev('S.lv=1');const root=window.document.createElement('div');root.innerHTML=ev('V.market()');ev('arrangePanel')('market',root);
  assert.ok(root.textContent.includes('opens at Base Lv 100'));assert.ok(!root.querySelector('[data-a="bmore"]'));ev('S.lv=150');
});
t('full bag and active click-sell are visible above the catalogue',()=>{
  ev("sub.bag='bag';S.clickSell=true;window.savedInv=S.inv;S.inv=Array.from({length:BAGMAX},()=>window.savedInv[0])");
  const root=window.document.createElement('div');root.innerHTML=ev('V.bag()');ev('arrangePanel')('bag',root);
  assert.ok(root.querySelector('.ui-hero').textContent.includes('BAG FULL'));assert.ok(root.querySelector('.ui-hero').textContent.includes('CLICK-SELL ACTIVE'));
  ev('S.inv=window.savedInv;S.clickSell=false');
});
t('account reset is separated from appearance and still uses its original handler',()=>{
  const root=window.document.createElement('div');root.innerHTML=ev('V.set()');ev('arrangePanel')('set',root);
  assert.ok(root.querySelector('.ui-account details [data-a="reset"]'));
  assert.ok(root.querySelector('.ui-account > [data-a="logout"]'));
});
console.log(`\n${pass} passed, ${fail} failed`);window.close();process.exit(fail?1:0);
