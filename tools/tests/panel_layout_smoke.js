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
  assert.ok(root.querySelector('.ui-field-guide .mapcols'));
  assert.ok(!root.querySelector('.ui-field-guide details'), 'drops are visible without opening tabs');
});
t('Echo sits between destinations and stages',()=>{
  const root=window.document.createElement('div');root.innerHTML=ev('V.map()');ev('arrangePanel')('map',root);
  assert.deepStrictEqual([...root.querySelector('.ui-content').children].map(e=>e.className),['ui-section ui-destinations','ui-section ui-challenge','ui-section ui-route','ui-section ui-field-guide']);
});
t('kill updates retain live journal rows and focused controls',()=>{
  ev("tabs.splice(0,tabs.length,'index');indexMode='mobs';renderWin()");
  const body=window.document.querySelector('[data-win="index"] .wbody');
  const row=body.querySelector('.mastery-mob'),button=body.querySelector('button');button.focus();
  const text=row.textContent;
  ev("recordMonsterKill({mapIndex:0,n:'Poring'});renderWin()");
  assert.strictEqual(body.querySelector('.mastery-mob'),row);
  assert.notStrictEqual(row.textContent,text);
  assert.strictEqual(window.document.activeElement,button);
});
t('quest collapse and the independent navigation dropdown retain separate state',()=>{
  ev("tabs.length=0;qOpen=true;sideOpen=true;renderQ()");
  const doc=window.document;
  assert.ok(!doc.querySelector('#qp').contains(doc.querySelector('#sideMenu')));
  assert.strictEqual(doc.querySelectorAll('#sideMenu [data-t]').length,3);
  doc.querySelector('#qp [data-q="t"]').click();
  assert.strictEqual(ev('qOpen'),false);assert.strictEqual(ev('sideOpen'),true);
  assert.strictEqual(doc.querySelector('#sideLinks').hidden,false);
  doc.querySelector('#sideMenu [data-q="side"]').click();
  assert.strictEqual(doc.querySelector('#sideLinks').hidden,true);
  ev('renderQ()');assert.strictEqual(doc.querySelector('#sideLinks').hidden,true);
});
t('map minimize restores the selected field and maximize restores its content',()=>{
  ev("tabs.splice(0,tabs.length,'map');mapM=3;mapL=4;renderWin()");
  const doc=window.document,win=doc.querySelector('[data-win="map"]');
  doc.querySelector('[data-ui-minimize="map"]').click();
  assert.ok(win.classList.contains('ui-minimized'));
  ev('renderWin()');assert.ok(win.classList.contains('ui-minimized'));
  doc.querySelector('[data-ui-minimize="map"]').click();
  assert.ok(!win.classList.contains('ui-minimized'));assert.strictEqual(ev('mapM'),3);assert.strictEqual(ev('mapL'),4);
  doc.querySelector('[data-ui-minimize="map"]').click();doc.querySelector('[data-ui-expand="map"]').click();
  assert.ok(!win.classList.contains('ui-minimized'));
});
t('rarity labels distinguish every equipment tier and card grade',()=>{
  for(let tier=0;tier<7;tier++){
    const label=ev(`cell({id:'rarity',slot:'armor',tier:${Math.min(4,tier)},sec:${tier>4?tier-1:0},val:1},false)`);
    const root=window.document.createElement('div');root.innerHTML=label;
    assert.strictEqual(root.querySelector('.rarity-label').textContent,['Common','Fine','Rare','Epic','Legendary','N','N+'][tier]);
  }
});
t('every field previews the same local equipment sprite the generated bag item receives',()=>{
  const before=ev('JSON.stringify(S)');
  for(let m=0;m<10;m++)for(let l=1;l<=15;l++){
    const entries=ev(`gearPool(${m},${l})`);
    for(const entry of entries){
      const template=JSON.stringify(entry),generated=ev(`genGear(${template},${l},${entry.sec},false,${entry.tier})`);
      const id=ev(`gearItemIconId(${template})`);
      assert.ok(id>0,`missing sprite for map ${m} stage ${l} ${entry.k}`);
      assert.ok(ev(`itemIconMarkup(${template})`).includes('loading="eager"'),'map previews must request their sprites immediately');
      assert.strictEqual(ev(`gearItemIconId(${JSON.stringify(generated)})`),id,'map and bag art disagree for '+entry.n);
      assert.ok(fs.existsSync(path.join(ROOT,'assets/equipment-icons',id+'.png')));
    }
  }
  assert.strictEqual(ev('JSON.stringify(S)'),before,'sprite selection does not migrate saves');
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
t('a kill redraw keeps the dock and every open UI window fixed',()=>{
  ev("tabs.splice(0,tabs.length,'status','bag','index');sub.status='equip';sub.bag='bag';indexMode='mobs';renderWin()");
  const dock=window.document.getElementById('dock'),buttons=[...dock.querySelectorAll(':scope > [data-t]')];
  const wins=new Map([...window.document.querySelectorAll('#wins > [data-win]')].map(e=>[e.dataset.win,e]));
  const bodies=new Map([...wins].map(([k,e])=>[k,e.querySelector('.wbody')]));
  const bagControl=wins.get('bag').querySelector('[data-a]');
  dock.scrollLeft=173;ev("recordMonsterKill({mapIndex:0,n:'Poring'});renderWin()");
  assert.strictEqual(dock.scrollLeft,173,'redraw must not snap the phone dock back to its first tab');
  assert.strictEqual(dock.querySelector(':scope > [data-t]'),buttons[0],'redraw must retain the live dock buttons');
  for(const [k,win] of wins){
    assert.strictEqual(window.document.querySelector(`[data-win="${k}"]`),win,k+' window must not be recreated after a kill');
    assert.strictEqual(win.querySelector('.wbody'),bodies.get(k),k+' body frame must stay live after a kill');
  }
  assert.strictEqual(wins.get('bag').querySelector('[data-a]'),bagControl,'an unchanged Bag keeps its live controls and focus targets');
});
t('redraw keeps focus inside an unchanged panel while another panel refreshes',()=>{
  ev("tabs.splice(0,tabs.length,'status','bag','index');sub.status='equip';sub.bag='bag';indexMode='mobs';renderWin()");
  const host=window.document.getElementById('wins'),bag=host.querySelector('[data-win="bag"] .wbody');
  const control=bag.querySelector('button:not([disabled])'),source=bag._panelSource;
  const journal=host.querySelector('[data-win="index"] .wbody'),journalSource=journal._panelSource;
  control.focus();assert.strictEqual(window.document.activeElement,control,'the test control must start focused');
  const observer=new window.MutationObserver(()=>{});observer.observe(host,{childList:true});
  ev("recordMonsterKill({mapIndex:0,n:'Poring'});renderWin()");
  assert.strictEqual(bag._panelSource,source,'Bag content must remain unchanged');
  assert.notStrictEqual(journal._panelSource,journalSource,'the kill must refresh the journal');
  assert.strictEqual(window.document.activeElement,control,'redraw must retain focus in the unchanged panel');
  assert.deepStrictEqual(observer.takeRecords(),[],'unchanged windows must stay connected');observer.disconnect();
});
t('window reconciliation changes only added, removed or reordered windows',()=>{
  ev("tabs.splice(0,tabs.length,'bag','status');renderWin()");
  const host=window.document.getElementById('wins'),bag=host.children[0],status=host.children[1];
  const control=bag.querySelector('button:not([disabled])');control.focus();
  const observer=new window.MutationObserver(()=>{});observer.observe(host,{childList:true});
  ev('renderWin()');assert.deepStrictEqual(observer.takeRecords(),[],'an unchanged window list needs no DOM changes');
  ev("tabs.unshift('index');renderWin()");
  const journal=host.children[0],added=observer.takeRecords();
  assert.strictEqual(added.length,1);assert.deepStrictEqual([...added[0].addedNodes],[journal]);
  assert.strictEqual(added[0].removedNodes.length,0);
  assert.deepStrictEqual([...host.children],[journal,bag,status]);assert.strictEqual(window.document.activeElement,control);
  ev("tabs.pop();renderWin()");
  const removed=observer.takeRecords();assert.strictEqual(removed.length,1);
  assert.deepStrictEqual([...removed[0].removedNodes],[status]);assert.strictEqual(removed[0].addedNodes.length,0);
  assert.deepStrictEqual([...host.children],[journal,bag]);assert.strictEqual(window.document.activeElement,control);
  ev("tabs.reverse();renderWin()");assert.deepStrictEqual([...host.children],[bag,journal]);
  const reordered=observer.takeRecords();
  assert.ok(reordered.length>0);assert.ok(reordered.every(r=>[...r.addedNodes,...r.removedNodes].every(n=>n===bag)),'only the out-of-order window moves');
  ev('tabs.splice(0,tabs.length);renderWin()');assert.strictEqual(host.children.length,0);
  assert.ok(!bag.isConnected&&!journal.isConnected);observer.disconnect();
  ev("tabs.push('status','bag','index');renderWin()");
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
t('option A colors stay consistent across dock, window heading and quest shortcuts',()=>{
  const expected={map:'rgb(142, 214, 174)',status:'rgb(237, 198, 131)',job:'rgb(148, 195, 235)',skills:'rgb(200, 168, 239)',bag:'rgb(239, 177, 139)',pet:'rgb(156, 221, 209)',index:'rgb(230, 210, 152)',market:'rgb(231, 172, 159)',board:'rgb(239, 204, 124)',log:'rgb(157, 199, 228)',set:'rgb(180, 200, 208)',quest:'rgb(230, 210, 152)',crown:'rgb(239, 204, 124)'};
  for(const [name,color] of Object.entries(expected)){
    const host=window.document.createElement('div');host.innerHTML=ev('uiIcon')(name);window.document.body.append(host);
    assert.strictEqual(window.getComputedStyle(host.firstChild).color,color,name+' uses the selected soft color');host.remove();
  }
  ev("tabs.splice(0,tabs.length,'map','bag');renderWin();renderDock();renderQ()");
  for(const name of ['map','bag']){
    const dock=window.document.querySelector('#dock [data-t="'+name+'"] .ui-icon');
    const heading=window.document.querySelector('[data-win="'+name+'"] .title .ui-icon');
    assert.strictEqual(window.getComputedStyle(dock).color,expected[name]);
    assert.strictEqual(window.getComputedStyle(heading).color,expected[name]);
  }
  const quest=window.document.querySelector('#qp .ui-icon[data-ui-icon="quest"]');
  const index=window.document.querySelector('#sideMenu .ui-icon[data-ui-icon="index"]');
  assert.strictEqual(window.getComputedStyle(quest).color,expected.quest);
  assert.strictEqual(window.getComputedStyle(index).color,expected.index);
});
console.log(`\n${pass} passed, ${fail} failed`);window.close();process.exit(fail?1:0);
