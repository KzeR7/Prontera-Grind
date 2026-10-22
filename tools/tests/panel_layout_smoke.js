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
    Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
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
const t=(name,fn)=>{try{fn();console.log('  ok   '+name);pass++}catch(e){console.log('  FAIL '+name+' -> '+e.stack);fail++}};
ev(`S=fresh();S.lv=150;S.cls='Lord Knight';S.jobs[S.cls]={jl:50,jx:0};S.zeny=5000000;S.auto=false;
S.inv=[{id:9001,name:'Nightmare Blade',slot:'weapon',wt:'sword',tier:4,sec:5,val:300,r:7,aff:[{k:'str',v:3}],slots:2,cards:[],locked:true},{id:9002,name:'Nightmare Katar',slot:'weapon',wt:'katar',tier:4,sec:4,val:280,r:6,aff:[],slots:4,cards:[]}];
S.eq.weapon={...S.inv[0],id:9003};S.cards=[{id:8001,n:'Poring Card',stat:'str',v:3,g:1,card:true}];
S.pets=[{id:7001,sp:0,mut:2,eq:[0,0,0],skills:[],on:true}];S.gm=true;
selB=9001;selE='weapon';selC='Poring Card';selP=7001;selK='Lord Knight';selS='aid';
`);
const cases=[['map',''],['status',"sub.status='stats'"],['status',"sub.status='equip'"],['job',''],['skills',''],['bag',"sub.bag='bag'"],['bag',"sub.bag='cards'"],['pet',''],['index',"indexMode='mobs'"],['index',"indexMode='cards'"],['board',''],['market',''],['guide',''],['log',''],['set',''],['gm','']];
for(const [key,prepare] of cases)t(key+' '+prepare+': all original controls, state and action values survive composition',()=>{
  if(prepare)ev(prepare);
  const root=window.document.createElement('div');root.innerHTML=ev(`V.${key}()`);
  const old=[...root.querySelectorAll('[data-a],[data-trial],input,select,canvas')];
  const signatures=old.map(e=>[e.getAttribute('data-a'),e.getAttribute('data-v'),e.disabled,e.checked]);
  const state=ev('JSON.stringify(S)');
  ev('arrangePanel')(key,root);
  assert.ok(root.querySelectorAll('[data-a],[data-trial],input,select,canvas').length>=old.length,'all original controls plus optional navigation');
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
t('Echo has its own panel between Ascension and Social',()=>{
  ev("mapSeason='echo'");
  const root=window.document.createElement('div');root.innerHTML=ev('V.map()');ev('arrangePanel')('map',root);
  assert.ok(root.querySelector('#map-panel-echo [data-trial=lobby]'));
  assert.equal(root.querySelector('[data-a=go]'),null);
  ev("mapSeason='atlas'");
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
  assert.strictEqual(doc.querySelectorAll('#sideMenu [data-t]').length,ev('S.gm?8:7'));
  doc.querySelector('#qp [data-q="t"]').click();
  assert.strictEqual(ev('qOpen'),false);assert.strictEqual(ev('sideOpen'),true);
  assert.strictEqual(doc.querySelector('#sideLinks').hidden,false);
  doc.querySelector('#sideMenu [data-q="side"]').click();
  assert.strictEqual(doc.querySelector('#sideLinks').hidden,true);
  ev('renderQ()');assert.strictEqual(doc.querySelector('#sideLinks').hidden,true);
});
t('map focus restores other windows without changing the selected field',()=>{
 ev("tabs.splice(0,tabs.length,'map','bag');mapM=3;mapL=4;expandedPanels.clear();renderWin()");
 const doc=window.document,win=doc.querySelector('[data-win=map]'),bag=doc.querySelector('[data-win=bag]');
 assert.equal(doc.querySelector('[data-ui-minimize]'),null);doc.querySelector('[data-ui-expand=map]').click();
 assert.ok(win.classList.contains('ui-expanded'));assert.equal(bag.hidden,true);ev('renderWin()');assert.equal(bag.hidden,true);
 doc.querySelector('[data-ui-expand=map]').click();assert.equal(bag.hidden,false);assert.equal(ev('mapM'),3);assert.equal(ev('mapL'),4);
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
t('jobs offer the current five-class path and the full tree',()=>{
  ev('eclipseJobsBrowse=false');const root=window.document.createElement('div');root.innerHTML=ev('V.job()');ev('arrangePanel')('job',root);
  assert.strictEqual(root.querySelectorAll('.current-class-card').length,5);
  ev('eclipseJobsBrowse=true');root.innerHTML=ev('V.job()');ev('arrangePanel')('job',root);
  assert.strictEqual(root.querySelectorAll('.class-lineage-overview .tn').length,25);
  assert.ok(root.querySelector('.class-path-focus #classPreview'));
  ev('eclipseJobsBrowse=false');
});
t('bag details are outside the item grid, including all Nightmare sale actions',()=>{
  ev("sub.bag='bag'");const root=window.document.createElement('div');root.innerHTML=ev('V.equip()');ev('arrangePanel')('equip',root);
  assert.ok(!root.querySelector('.grid .grid-detail'));
  assert.ok(root.querySelector('.ui-inspector [data-a="equip"]'));
  assert.ok(root.querySelector('.eclipse-bag > .bag-tools [data-a="autosell"][data-v="5"]'));
  assert.ok(root.querySelector('.eclipse-bag > .bag-tools [data-a="autosell"][data-v="6"]'));
});
t('equipment inspector stays inside the chooser boundary',()=>{
  ev("sub.status='equip'");const root=window.document.createElement('div');root.innerHTML=ev('V.status()');ev('arrangePanel')('status',root);
  assert.ok(root.querySelector('.ui-inspector [data-a="refine"]').closest('.doll'));
  assert.ok(root.querySelector('.ui-loadout-slots [data-a="seleq"]'));
});
t('redraw preserves open AND closed disclosures, plus independent catalogue scroll positions',()=>{
  ev("tabs.splice(0,tabs.length,'skills');renderWin()");
  let d=window.document.querySelector('[data-ui-disclosure="skills-skill-notes"]');d.open=true;
  let c=window.document.querySelector('[data-panel-scroll="skills"]');c.scrollTop=90;
  ev('renderWin()');assert.strictEqual(window.document.querySelector('[data-ui-disclosure="skills-skill-notes"]').open,true);
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
  const root=window.document.createElement('div');root.innerHTML=ev('V.equip()');ev('arrangePanel')('equip',root);
  assert.ok(root.querySelector('.eclipse-bag').textContent.includes('BAG FULL'));assert.ok(root.querySelector('.eclipse-bag > .bag-tools').textContent.includes('Selecting equipment never sells it.'));
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
t('attributes precede combat stats and supporting destinations remain accessible in dock and hub',()=>{
  ev("tabs.splice(0,tabs.length,'status');sub.status='stats';renderWin();renderQ()");
  const root=window.document.querySelector('[data-win="status"] .ui-content');
  assert.ok(root.children[0].classList.contains('ui-attribute-section'));
  assert.ok(root.children[1].classList.contains('ui-metrics'));
  for(const key of ['index','board']){
    assert.ok(window.document.querySelector('#dock .eclipse-more'));assert.ok(window.document.querySelector('#sideMenu [data-t="'+key+'"]'));assert.equal(window.document.querySelector('#dock [data-t="'+key+'"]'),null);
    assert.ok(window.document.querySelector('#sideLinks [data-t="'+key+'"]'));
  }
  const guide=window.document.querySelector('#sideLinks [data-t="guide"]');
  assert.ok(guide.querySelector('[data-ui-icon="guide"]'));
  guide.click();
  assert.ok(window.document.querySelector('[data-win="guide"]'));
  window.document.querySelector('[data-win="guide"] [data-a="guidepage"][data-v="leveling"]').click();
  const source=window.document.querySelector('[data-win="guide"] [data-a="guidemap"]');
  const [map,stage]=source.dataset.v.split(':').map(Number);source.click();
  assert.ok(window.document.querySelector('[data-win="map"]'));
  assert.strictEqual(ev('mapM'),map);assert.strictEqual(ev('mapL'),stage);
});
t('dedicated guide uses current cards, filters and upgrade planner from the fork',()=>{
  ev("tabs.splice(0,tabs.length,'guide');guidePage='cards';guideMode='farm';guideTier='current';renderWin()");
  const doc=window.document;
  assert.ok(doc.querySelector('[data-win="guide"] .build-guide'));
  doc.querySelector('[data-win="guide"] [data-a="guidemode"][data-v="survive"]').click();
  doc.querySelector('[data-win="guide"] [data-a="guidetier"][data-v="nightmare"]').click();
  assert.strictEqual(ev('guideMode'),'survive');assert.strictEqual(ev('guideTier'),'nightmare');
  assert.ok(doc.querySelector('[data-win="guide"]').textContent.includes('Nightmare'));
  for(const panel of ['index']){
    ev(`tabs.splice(0,tabs.length,'${panel}');indexMode='mobs';renderWin()`);
    const button=doc.querySelector('[data-win="'+panel+'"] [data-t="guide"]');
    assert.ok(button);button.click();assert.ok(doc.querySelector('[data-win="guide"]'));
  }
});
t('bonding stars describe every current rank and its real passive bonus',()=>{
  for(const count of [0,1,3,6,10,15]){
    ev(`S.bond[0]=${count};tabs.splice(0,tabs.length,'pet');selP=7001;renderWin()`);
    const rank=ev('bondRank(0)'),root=window.document.querySelector('[data-win="pet"]');
    const stars=root.querySelector('.pet-bond-badge .bond-stars');
    assert.strictEqual((stars.textContent.match(/★/g)||[]).length,rank);
    assert.ok(stars.getAttribute('aria-label').includes('Bond '+rank+' of 5'));
    assert.ok(root.textContent.includes(count+' duplicates merged'));
    assert.ok(root.textContent.includes('Bonding information'));
    assert.ok(root.textContent.includes('★★★★★ = 15 merged duplicates · 10% passive'));
  }
});
t('auto-sell filter editor saves drafts, keeps text during redraws and previews before selling',()=>{
  ev("S=fresh();S.auto=false;S.eq={};S.autoSell=Array(7).fill(true);S.inv=[{id:9901,name:'Test Sword',tier:2,sec:1,slot:'weapon',wt:'sword',val:30,cards:[],aff:[{k:'crit',v:3}]}];tabs.splice(0,tabs.length,'equip');sub.equip='equip0';autoSellDraft=null;autoSellPreview=null;renderWin()");
  const doc=window.document,change=el=>el.dispatchEvent(new window.Event('change',{bubbles:true}));
  doc.querySelector('[data-a="sellpreset"][data-v="caster"]').click();
  assert.strictEqual(ev('S.autoSellRules'),undefined,'draft is not active');
  const crit=doc.querySelector('[data-sell-affix="crit"]');crit.checked=true;change(crit);
  const min=doc.querySelector('[data-sell-min="crit"]');assert.strictEqual(min.disabled,false);min.value='4';change(min);
  const names=doc.querySelector('[data-sell-field="names"]');names.focus();names.value='Test Sword';
  ev('S.zeny++;renderWin()');assert.strictEqual(doc.querySelector('[data-sell-field="names"]'),names);assert.strictEqual(names.value,'Test Sword');
  change(names);names.blur();doc.querySelector('[data-a="sellrulesapply"]').click();
  assert.strictEqual(ev('S.autoSellRules.affixes.find(a=>a.k==="crit").min'),4);
  assert.strictEqual(ev('S.autoSellRules.names[0]'),'Test Sword');
  doc.querySelector('[data-a="sellnow"]').click();assert.strictEqual(ev('S.inv.length'),1);
  assert.ok(doc.querySelector('.sell-preview').textContent.includes('Test Sword'));
  ev('S.inv[0].locked=true');doc.querySelector('[data-a="sellconfirm"]').click();
  assert.strictEqual(ev('S.inv.length'),1,'newly locked gear survives confirmation');
});
t('World Atlas and Ascension Map have separate destination grids and normal travel controls',()=>{
 const doc=window.document;ev("tabs.splice(0,tabs.length,'map');mapSeason='atlas';mapM=3;mapL=4;S.mp=3;S.lvl=4;renderWin()");
 const before=ev('JSON.stringify(S)');
 assert.ok(html.includes('map-season-tabs{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))'),'v174: the season strip is four columns so Social sits beside Ascension, not below');
 assert.deepStrictEqual([...doc.querySelectorAll('.map-season-tabs [role=tab]')].map(b=>b.id),['map-tab-atlas','map-tab-ascension','map-tab-echo','map-tab-social']);
 const social=doc.querySelector('#map-tab-social');assert.ok(!social.disabled);assert.match(social.textContent,/Social Hub/);
 social.click();assert.strictEqual(ev('mapSeason'),'social');assert.match(doc.querySelector('.social-destination').textContent,/farming keeps going/);assert.strictEqual(ev('JSON.stringify(S)'),before);ev("ACT.mapseason('atlas')");
 assert.strictEqual(doc.querySelectorAll('[data-a=selm]').length,10);
 doc.querySelector('#map-tab-atlas').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 assert.strictEqual(ev('mapSeason'),'ascension');assert.strictEqual(doc.activeElement.id,'map-tab-ascension');
 assert.deepStrictEqual([...doc.querySelectorAll('[data-a=selm]')].map(b=>b.dataset.v),['10','11']);
 assert.strictEqual(doc.querySelectorAll('.map-node').length,5);assert.strictEqual(doc.querySelectorAll('dialog iframe,[data-a=explore]').length,0);
 assert.strictEqual(doc.querySelector('[role=tabpanel]').id,'map-panel-ascension');
 assert.match(doc.querySelector('.ascension-preview').getAttribute('src'),/astral-citadel\.png\?v=156$/);assert.strictEqual(doc.querySelector('#eclipseAtlas'),null);
 doc.querySelector('[data-a=selm][data-v="11"]').click();assert.match(doc.querySelector('.ascension-preview').getAttribute('src'),/thor-volcano\.png\?v=162$/);
 doc.querySelector('[data-a=selm][data-v="10"]').click();
 assert.strictEqual(ev('JSON.stringify(S)'),before);
 doc.querySelector('#map-tab-ascension').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
 assert.strictEqual(doc.querySelectorAll('[data-a=selm]').length,10);
 ev("ACT.guidemap('11:5')");assert.strictEqual(ev('mapSeason'),'ascension');assert.strictEqual(ev('mapM'),11);
 assert.match(doc.querySelector('.ui-field-guide').textContent,/Primal Catalyst/);
});
t('Ascension gates, immediate MVP escorts, stage progression, material boundaries and save repair',()=>{
 ev("S=fresh();S.auto=false;S.adv=true;S.lv=139;S.mapClears[9]=true;mapM=10;mapL=1");
 assert.strictEqual(ev('canTravel(10,1)'),false);ev('ACT.go()');assert.strictEqual(ev('S.mp'),0);
 ev('S.lv=140;S.mapClears[9]=false');assert.strictEqual(ev('canTravel(10,1)'),false);
 ev("S.cls='Rune Knight';S.lv=150;S.mapClears[9]=false;ACT.go();spawn()");assert.strictEqual(ev('S.mp'),10);
 assert.match(window.document.querySelector('#eclipseMapStage').textContent,/Ascension Map/);
 assert.strictEqual(ev('mobs.every(m=>m.mapIndex===10&&m.spriteId>0&&Number.isFinite(m.hp)&&m.hp>0)'),true);
 assert.strictEqual(ev('canTravel(10,2)'),false);
 ev('S.kl=MPS-1;kill(mobs[0])');assert.strictEqual(ev('S.prog[10]'),2);assert.strictEqual(ev('S.lvl'),2);
 ev('S.prog[10]=5;gotoField(10,5);for(let i=0;i<1000&&astralJourney;i++)tickAstralJourney(.1);spawn()');assert.strictEqual(ev('mobs.length'),6);assert.strictEqual(ev('mobs.filter(m=>m.boss).length'),1);
 ev('kill(mobs.find(m=>m.boss))');assert.strictEqual(ev('S.mapClears[10]'),true);assert.strictEqual(ev('S.mp'),11);
 ev('S.lv=150;mapM=11;mapL=1;ACT.go();spawn()');assert.strictEqual(ev('S.mp'),11);assert.strictEqual(ev('nmMapOpen(11)'),false);assert.strictEqual(ev('canTravel(11,11)'),false);
 ev('gotoField(11,11)');assert.strictEqual(ev('S.lvl'),1);
 assert.strictEqual(ev('gearPool(11,5).length===0'),true);
 assert.strictEqual(ev('CARD_CATALOG.some(c=>c.map>=10&&c.nightmare)'),false);
 assert.strictEqual(ev('gearPool(10,1).length'),0);
 assert.strictEqual(ev('canTravel(10,6)'),false);
 assert.strictEqual(ev('MAPVAL[11]>MAPVAL[10]&&MAPVAL[10]>MAPVAL[9]'),true);
 ev('window.oldRandom=Math.random;Math.random=()=>0');
 assert.strictEqual(ev('ascensionDrops({mapIndex:9,boss:true}).length'),0);
 assert.strictEqual(ev('ascensionDrops({mapIndex:10,boss:false}).map(d=>d.n).join(",")'),"Astral Shard,Valkyrie's Sigil");
 ev('Math.random=()=>.001');assert.strictEqual(ev('ascensionDrops({mapIndex:11,boss:false}).map(d=>d.n).join(",")'),'Primal Catalyst');
 ev('Math.random=()=>.005');assert.strictEqual(ev('ascensionDrops({mapIndex:11,boss:true}).map(d=>d.n).join(",")'),"Valkyrie's Sigil");
 ev('Math.random=()=>.01');assert.strictEqual(ev('ascensionDrops({mapIndex:11,boss:true}).length'),0);
 ev('currentUser="ascension_test";Math.random=window.oldRandom;collect({ascMat:0,n:"Astral Shard"});save()');assert.strictEqual(ev('S.ascensionMat[0]'),1);
 assert.strictEqual(ev('load().ascensionMat[0]'),1);assert.strictEqual(ev('load().mapClears[10]'),true);
 ev('S.prog=S.prog.slice(0,10);delete S.ascensionMat;delete S.mapClears;S.mp=0;save();S=load()');
 assert.strictEqual(ev('S.prog.length'),12);assert.strictEqual(ev('S.ascensionMat.join(",")'),'0,0,0');assert.strictEqual(ev('S.mapClears.every(v=>v===false)'),true);
});
console.log(`\n${pass} passed, ${fail} failed`);window.close();process.exit(fail?1:0);
