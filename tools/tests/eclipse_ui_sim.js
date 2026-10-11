// Real game handlers and DOM: Eclipse changes presentation, not rewards or transactions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const root=path.resolve(__dirname,'../..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('</body>','<script>window.eclipseRealUI=ui;window.eclipseRealSave=save;</script></body>');
const g=createGame(html),doc=g.window.document,ev=g.ev;let passed=0;
const test=(name,fn)=>{ev(`S=fresh();S.auto=false;S.lv=150;S.zeny=1e9;S.ore.ori=1000;S.ore.elu=1000;currentUser='eclipse-test';tabs.length=0;sub.equip='equip0';sub.bag='bag';sub.market='supplies';eclipseInventoryState=null;eclipseSearch='';eclipseRarity=-1;eclipseInspectBag=false;eqPick=null;selE='weapon';selB=null;ui=window.eclipseRealUI;save=window.eclipseRealSave;`);fn();console.log('ok '+name);passed++};
try{
test('three palettes default to Moonstone and never enter the game save',()=>{
 const before=ev('JSON.stringify(S)');ev("eclipseSetPalette('retired')");assert.equal(doc.documentElement.dataset.palette,'moonstone');
 for(const p of ['moonstone','aurora','ember']){ev(`eclipseSetPalette('${p}')`);assert.equal(doc.documentElement.dataset.palette,p);assert.equal(g.window.localStorage.getItem('pg_ui_palette'),p)}
 assert.equal(ev('JSON.stringify(S)'),before);
});
test('live collections are awarded immediately and saved before reveal without rebuilding inventory',()=>{
 ev(`S.inv=Array.from({length:24},(_,i)=>({...S.eq.weapon,id:9000+i,locked:false,cards:[],aff:[]}));tabs.push('equip');renderWin()`);
 const body=doc.querySelector('[data-win=equip] .wbody'),grid=body.querySelector('.grid'),first=grid.querySelector('[data-tip="9000"]'),search=body.querySelector('[data-eclipse-search]');
 const ids=[...grid.querySelectorAll('[data-tip]')].map(el=>el.dataset.tip);
 search.focus();search.setSelectionRange(0,0);body.scrollTop=75;grid.parentElement.scrollTop=60;
 const before=ev('S.inv.length');
 for(let i=0;i<20;i++)ev(`collect({...S.eq.weapon,id:${10000+i},locked:false,cards:[],aff:[]})`);
 assert.equal(ev('S.inv.length'),before+20);ev('save()');assert.equal(JSON.parse(g.window.localStorage.getItem('pg_save3_eclipse-test')).inv.length,before+20);
 assert.equal(doc.querySelector('[data-win=equip] .wbody'),body);assert.equal(body.querySelector('.grid'),grid);assert.equal(grid.querySelector('[data-tip="9000"]'),first);
 assert.deepEqual([...grid.querySelectorAll('[data-tip]')].map(el=>el.dataset.tip),ids);assert.equal(doc.activeElement,search);assert.equal(body.scrollTop,75);assert.equal(grid.parentElement.scrollTop,60);
 assert.match(body.querySelector('[data-a=newdrops]').textContent,/20/);
 const stateBefore=ev('JSON.stringify(S)');body.querySelector('[data-a=newdrops]').click();assert.equal(ev('JSON.stringify(S)'),stateBefore,'reveal cannot award or change saved loot');assert.equal(grid.querySelectorAll('[data-tip]').length,44);assert.equal(grid.querySelector('[data-tip="9000"]'),first);
});
test('search focus, caret and filter survive currency and quest updates',()=>{
 ev(`S.inv=Array.from({length:12},(_,i)=>({...S.eq.weapon,id:9000+i,cards:[],aff:[]}));tabs.push('bag');renderWin()`);
 const search=doc.querySelector('[data-eclipse-search]');search.focus();search.value='s';search.dispatchEvent(new g.window.Event('input',{bubbles:true}));search.setSelectionRange(1,1);
 const quest=doc.querySelector('#qp .quest-tabs button');
 ev('S.zeny+=1234;questEvent("kill",4);ui()');
 assert.equal(doc.querySelector('[data-eclipse-search]'),search);assert.equal(doc.activeElement,search);assert.equal(search.selectionStart,1);assert.equal(search.value,'s');assert.equal(doc.querySelector('#qp .quest-tabs button'),quest);
});
test('closing inventory resets view; auto-equip and auto-sale retain authoritative results',()=>{
 ev(`tabs.push('bag');renderWin();collect({...S.eq.weapon,id:20001,val:200,cards:[],aff:[]});tabs.length=0;renderWin();tabs.push('bag');renderWin()`);
 assert.ok(doc.querySelector('[data-tip="20001"]'));
 ev(`S.auto=true;collect({...S.eq.weapon,id:20002,val:99999,cards:[],aff:[]})`);assert.equal(ev('S.eq.weapon.id'),20002);
 ev(`S.auto=false;S.autoSell=Array(7).fill(true);S.autoSellRules=defaultAutoSellRules();const dropped={...S.eq.weapon,id:20003,val:1,locked:false,r:0,cards:[],aff:[]};window.beforeSale=S.zeny;collect(dropped)`);
 assert.ok(ev('!S.inv.some(it=>it.id===20003)&&S.zeny>window.beforeSale'));
});
test('minimized center HUD does not pause or mutate combat state',()=>{
 const before=ev('JSON.stringify(S)');const b=doc.getElementById('eclipseMinimize');b.click();assert.equal(b.getAttribute('aria-expanded'),'false');assert.ok(doc.getElementById('eclipseCombat').classList.contains('minimized'));assert.equal(ev('JSON.stringify(S)'),before);b.click();assert.equal(b.getAttribute('aria-expanded'),'true');
});
test('workshop routes preserve Reforge offers and do not duplicate the store in supplies',()=>{
 ev(`ACT.openreforge();S.eq.weapon.aff=[{k:'str',v:10},{k:'agi',v:10}];renderWin()`);
 assert.equal(ev('sub.equip'),'reforge');assert.ok(doc.querySelector('[data-a=bmref]'));assert.match(doc.querySelector('[data-win=equip]').textContent,/Reforge affixes/);
 ev(`reforge('weapon',true);renderWin()`);assert.ok(doc.querySelector('[data-a=refaccept]'));const before=ev('JSON.stringify(S.reforgePending)');ev(`sub.equip='refine';renderWin();sub.equip='reforge';renderWin()`);assert.equal(ev('JSON.stringify(S.reforgePending)'),before);
 ev(`tabs.splice(0,tabs.length,'market');renderWin()`);assert.equal(doc.querySelectorAll('[data-win=market] [data-buy]').length,0);doc.querySelector('[data-v="market:echo"]').click();assert.equal(doc.querySelectorAll('[data-win=market] [data-buy]').length,ev('TRIAL_STORE.length'));
});
test('slot selection stays inside the combined equipment workbench and retains native actions',()=>{
 ev(`S.inv=[{...S.eq.weapon,id:21001,val:999,cards:[],aff:[]}];tabs.push('equip');renderWin();ACT.seleq('weapon')`);
 assert.equal(ev('tabs.join()'),'equip');assert.ok(doc.querySelector('[data-a=eqpick]'));doc.querySelector('[data-a=eqpick]').click();assert.equal(ev('S.eq.weapon.id'),21001);assert.ok(doc.querySelector('#eclipseDoll'));
});
test('Moonstone login retains account registration, remember-ID and backup/restore controls',()=>{
 for(const id of ['tabLogin','tabReg','username','password','password2','rememberUser','saveDl','saveUp','saveFile','loginCloud','authBtn'])assert.ok(doc.getElementById(id),id);
 ev("setMode('reg')");assert.equal(doc.getElementById('password2').required,true);ev("setMode('login')");assert.equal(doc.getElementById('password2').required,false);
});
test('workshop selection refreshes presentation even when native source markup is unchanged',()=>{
 ev(`S.eq.armor={...S.eq.weapon,id:31000,slot:'armor',wt:null,aff:[{k:'str',v:10}]};S.eq.weapon.aff=[{k:'str',v:10}];tabs.push('equip')`);
 for(const mode of ['refine','reforge']){
  ev(`sub.equip='${mode}';selE='weapon';renderWin()`);const before=ev('JSON.stringify(S)');
  doc.querySelector('[data-a=workslot][data-v=armor]').click();
  assert.equal(doc.querySelector('[data-a=workslot][aria-pressed=true]').dataset.v,'armor');
  const action=doc.querySelector(mode==='refine'?'[data-a=refine]':'[data-a=bmref]');assert.equal(action.dataset.v.split(':')[0],'armor');assert.equal(ev('JSON.stringify(S)'),before);
 }
 ev(`sub.equip='equip0';selE='weapon';renderWin()`);doc.querySelector('[data-eclipse-refine]').click();assert.equal(ev('sub.equip'),'refine');
});
console.log(`${passed} passed`);
}finally{g.close()}
