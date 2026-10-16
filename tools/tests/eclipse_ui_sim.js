// Real game handlers and DOM: Eclipse changes presentation, not rewards or transactions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const root=path.resolve(__dirname,'../..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('</body>','<script>window.eclipseRealUI=ui;window.eclipseRealSave=save;window.eclipseRealBars=bars;window.eclipseInitialQuestOpen=qOpen;</script></body>');
const g=createGame(html),doc=g.window.document,ev=g.ev;let passed=0;
const test=(name,fn)=>{ev(`S=fresh();S.auto=false;S.lv=150;S.zeny=1e9;S.ore.ori=1000;S.ore.elu=1000;currentUser='eclipse-test';tabs.length=0;expandedPanels.clear();collectionGrade=-1;sideOpen=false;$('screenOptions').hidden=true;$('modal').style.display='none';sub.equip='equip0';sub.bag='bag';sub.market='supplies';eclipseInventoryState=null;eclipseSearch='';eclipseRarity=-1;eclipseInspectBag=false;qOpen=true;eqPick=null;selE='weapon';selB=null;ui=window.eclipseRealUI;save=window.eclipseRealSave;`);fn();console.log('ok '+name);passed++};
try{
test('focus expands one retained workspace and restore reveals the other open tabs',()=>{
 ev("tabs.push('equip','job','market');renderWin()");const panels=[...doc.querySelectorAll('#wins>[data-win]')];
 assert.equal(doc.querySelector('[data-ui-minimize]'),null);
 doc.querySelector('[data-ui-expand=job]').click();assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);assert.equal(panels[2].hidden,true);
 ev('S.zeny++;ui()');assert.deepEqual([...doc.querySelectorAll('#wins>[data-win]')],panels);
 doc.querySelector('[data-ui-expand=job]').click();assert.ok(panels.every(p=>!p.hidden));
 doc.querySelector('[data-ui-expand=job]').click();doc.querySelector('#dock [data-t=equip]').click();assert.equal(panels[0].hidden,false);assert.equal(panels[1].hidden,true);
 doc.querySelector('[data-x=equip]').click();assert.ok([...doc.querySelectorAll('#wins>[data-win]')].every(p=>!p.hidden));assert.equal(ev('tabs.length'),2);
});
test('Refine and Cards shortcuts reveal their destination from another focused panel',()=>{
 ev("tabs.push('equip','job','bag');sub.bag='cards';expandedPanels.add('job');renderWin()");
 doc.body.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'c',bubbles:true}));assert.equal(doc.querySelector('[data-win=bag]').hidden,false);assert.equal(ev('tabs.length'),3);
 doc.body.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'r',bubbles:true}));assert.equal(doc.querySelector('[data-win=equip]').hidden,false);assert.equal(ev('sub.equip'),'refine');
 assert.ok(doc.querySelector('[data-a=refine]').closest('.eclipse-workshop-action'));assert.equal(doc.querySelector('[data-a=refine]').closest('.slot'),null);
 ev("S.eq.armor={...S.eq.weapon,id:7000,slot:'armor',wt:null};renderWin()");const picker=doc.querySelector('[data-workslot]');picker.value='armor';picker.dispatchEvent(new g.window.Event('change',{bubbles:true}));assert.equal(doc.querySelector('[data-a=refine]').dataset.v,'armor');
});
test('window refresh measures the populated dock before reserving its screen space',()=>{
 const dock=doc.getElementById('dock');Object.defineProperty(dock,'offsetHeight',{configurable:true,value:90});dock.style.bottom='15px';
 ev("tabs.push('equip');renderWin()");assert.equal(doc.documentElement.style.getPropertyValue('--docktop'),'111px');
 delete dock.offsetHeight;dock.style.bottom='';
});
test('cards stack equivalent legacy rolls, keep different effects separate and sort stars first',()=>{
 ev(`S.cards=[{card:1,id:7001,n:'Chaos Imp Card',stat:'aspd',v:6,g:2,legacy:true},{card:1,id:7002,n:'Chaos Imp Card',stat:'aspd',v:6,g:2,legacy:true},{card:1,id:7003,n:'Chaos Imp Card',stat:'aspd',v:7,g:2,legacy:true},{...newCard(cardDefinition(0,0)),id:7004,stars:2}];tabs.push('bag');sub.bag='cards';renderWin()`);
 const before=ev('JSON.stringify(S.cards)');let tiles=[...doc.querySelectorAll('.eclipse-card-grid [data-a=selc]')];
 assert.equal(tiles.length,3);assert.match(tiles[0].querySelector('b').textContent,/★★/);assert.match(tiles.find(t=>t.dataset.tip==='7001').textContent,/x2/);
 assert.notEqual(tiles.find(t=>t.dataset.tip==='7001').dataset.v,tiles.find(t=>t.dataset.tip==='7003').dataset.v);
 doc.querySelector('[data-a=cardgrade][data-v="2"]').click();tiles=[...doc.querySelectorAll('.eclipse-card-grid [data-a=selc]')];assert.equal(tiles.length,2);assert.ok(tiles.every(t=>t.textContent.includes('Rare')));assert.equal(ev('JSON.stringify(S.cards)'),before);
 tiles.find(t=>t.dataset.tip==='7001').click();doc.querySelector('[data-a=sellcard]').click();assert.equal(ev('S.cards.length'),3);assert.ok(ev('S.cards.some(c=>c.id===7002)&&S.cards.some(c=>c.id===7003)'));
});
test('paid reforge comparisons and keep/replace buttons stay in the main workbench',()=>{
 ev("S.eq.weapon.aff=[{k:'str',v:10},{k:'agi',v:10}];tabs.push('equip');sub.equip='reforge';renderWin();reforge('weapon',true)");
 let offer=doc.querySelector('.reforge-offer');assert.ok(offer.closest('.eclipse-workshop-stage'));assert.equal(offer.closest('.eclipse-workshop-aside'),null);assert.equal(offer.querySelectorAll('.reforge-comparison-row').length,3);
 const paid=ev('S.zeny'),old=ev('JSON.stringify(S.eq.weapon.aff)'),proposed=ev('JSON.stringify(S.reforgePending.after)');
 offer.querySelector('[data-v=yes]').click();assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),proposed);assert.equal(ev('S.zeny'),paid);assert.equal(ev('S.reforgePending'),undefined);
 ev("reforge('weapon',true)");const current=ev('JSON.stringify(S.eq.weapon.aff)');doc.querySelector('.reforge-offer [data-v=no]').click();assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),current);assert.equal(ev('S.reforgePending'),undefined);
});
test('Activity owns preview filters and the floating feed has no options popup',()=>{
 ev("tabs.push('log');renderWin()");assert.equal(doc.getElementById('feedFil'),null);assert.equal(doc.getElementById('feedFilter'),null);
 const panel=doc.querySelector('[data-win=log]');assert.ok(panel.querySelector('[data-a=feed]'));assert.equal(panel.querySelector('[data-a=logf]').closest('details'),null);
 panel.querySelector('[data-a=logf][data-v=gear]').click();assert.equal(ev('S.logOff.gear'),1);
 panel.querySelector('[data-a=feed]').click();assert.equal(ev('S.feed'),false);assert.ok(doc.getElementById('feedWrap').classList.contains('hid'));
});
test('Escape closes all open windows first, then asks before logout and cancels safely',()=>{
 const escape=target=>target.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ev("tabs.push('equip','bag');renderWin();window.logoutCalls=0;logout=()=>{window.logoutCalls++}");
 const input=doc.querySelector('[data-eclipse-search]');input.focus();escape(input);assert.equal(ev('tabs.length'),0);assert.notEqual(doc.getElementById('modal').style.display,'flex');
 escape(doc.body);assert.equal(doc.getElementById('modal').style.display,'flex');assert.equal(g.window.logoutCalls,0);assert.match(doc.getElementById('mt').textContent,/Log out/);
 escape(doc.body);assert.equal(doc.getElementById('modal').style.display,'none');assert.equal(g.window.logoutCalls,0);
 escape(doc.body);doc.getElementById('my').click();assert.equal(g.window.logoutCalls,1);
});
test('three palettes default to Moonstone and never enter the game save',()=>{
 const before=ev('JSON.stringify(S)');ev("eclipseSetPalette('retired')");assert.equal(doc.documentElement.dataset.palette,'moonstone');
 for(const p of ['moonstone','aurora','ember']){ev(`eclipseSetPalette('${p}')`);assert.equal(doc.documentElement.dataset.palette,p);assert.equal(g.window.localStorage.getItem('pg_ui_palette'),p)}
 assert.equal(ev('JSON.stringify(S)'),before);
});
test('legacy scrolls merge once and craft into the same visible reserve',()=>{
 ev(`S.refineScrolls=3;S.dps=4;save();S=load()`);
 assert.equal(ev('S.refineScrolls'),7);assert.equal(ev('S.dps'),0);
 ev(`save();S=load()`);assert.equal(ev('S.refineScrolls'),7);
 ev(`S.nmMat=[4,4,4,4,4];craftDps();tabs.push('equip');sub.equip='refine';renderWin()`);
 assert.equal(ev('S.refineScrolls'),8);assert.equal(ev('S.nmMat.reduce((a,b)=>a+b,0)'),0);
 const text=doc.querySelector('[data-win=equip]').textContent;
 assert.match(text,/Refine Protection Scroll/);assert.doesNotMatch(text,/Drop Protection Scroll|automatic fallback/);
 assert.match(doc.querySelector('[data-a=craftdps]').textContent,/Craft Refine Protection Scroll/);
 ev(`tabs.splice(0,tabs.length,'bag');sub.bag='bag';renderWin()`);
 const bagText=doc.querySelector('[data-win=bag]').textContent;assert.match(bagText,/Refine Protection Scroll/);assert.doesNotMatch(bagText,/Drop Protection Scroll/);
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
test('a full bag mounts one equipment page and every item remains reachable',()=>{
 ev("S.inv=Array.from({length:1000},(_,i)=>({...S.eq.weapon,id:51000+i,name:'Knife '+String(i).padStart(4,'0'),locked:false,cards:[],aff:[]}));tabs.push('equip');renderWin()");
 const before=ev('JSON.stringify(S)'),seen=new Set();const capacity=doc.querySelector('[data-win=equip] .eclipse-bag-capacity');assert.match(capacity.textContent,/1000 \/ 1000.*FULL/);
 for(let page=0;page<17;page++){
  if(page)doc.querySelector('[data-a=gearpage][aria-label="Next equipment page"]').click();
  const tiles=[...doc.querySelectorAll('.eclipse-bag .grid [data-tip]')];assert.equal(tiles.length,page===16?40:60);
  assert.ok(doc.querySelectorAll('.eclipse-bag .grid .cell').length<=60);
  for(const tile of tiles){assert.ok(!seen.has(tile.dataset.tip));seen.add(tile.dataset.tip)}
 }
 assert.equal(seen.size,1000);assert.equal(doc.querySelector('[data-a=gearpage][aria-label="Next equipment page"]').disabled,true);assert.equal(ev('JSON.stringify(S)'),before);
 ev('ACT.gearpage(999)');assert.match(doc.querySelector('.eclipse-inventory-pages').textContent,/Page 17 \/ 17/);
 ev('S.inv=S.inv.slice(0,60);renderWin()');assert.equal(doc.querySelector('.eclipse-inventory-pages'),null);assert.equal(doc.querySelectorAll('.eclipse-bag .grid [data-tip]').length,60);assert.match(doc.querySelector('[data-win=equip] .eclipse-bag-capacity').textContent,/60 \/ 1000/);
});
test('paged search and filters cover the whole bag and later-page sales target the displayed item',()=>{
 ev("S.inv=Array.from({length:125},(_,i)=>({...S.eq.weapon,id:52000+i,name:'Knife '+String(i).padStart(4,'0'),locked:false,cards:[],aff:[]}));S.inv[124].name='Needle';S.inv[124].tier=2;tabs.push('equip');renderWin()");
 doc.querySelector('[data-a=gearpage][aria-label="Next equipment page"]').click();doc.querySelector('.eclipse-bag [data-tip="52060"]').click();doc.querySelector('[data-a=sell][data-v="52060"]').click();doc.querySelector('#my').click();assert.equal(ev('S.inv.length'),124);assert.equal(ev('S.inv.some(it=>it.id===52060)'),false);
 const input=doc.querySelector('[data-eclipse-search]');input.value='Needle';input.dispatchEvent(new g.window.Event('input',{bubbles:true}));assert.equal(doc.querySelector('.eclipse-bag .grid [data-tip]').dataset.tip,'52124');assert.equal(doc.querySelector('.eclipse-inventory-pages'),null);
 input.value='';input.dispatchEvent(new g.window.Event('input',{bubbles:true}));assert.match(doc.querySelector('.eclipse-inventory-pages').textContent,/Page 1 \/ 3/);
 doc.querySelector('[data-a=filtergear][data-v="2"]').click();assert.equal(doc.querySelectorAll('.eclipse-bag .grid [data-tip]').length,1);assert.equal(doc.querySelector('.eclipse-bag .grid [data-tip]').dataset.tip,'52124');assert.match(doc.querySelector('.bag-count').textContent,/124\/1000/);
 ev("ACT.filtergear('-1');ACT.gearpage(1);ACT.seleq('weapon')");assert.match(doc.querySelector('.eclipse-inventory-pages').textContent,/Page 1 \/ 3/);assert.ok(doc.querySelector('.eclipse-bag .fit[data-a=selb]'));
 ev("eqPick=null;tabs.push('bag');renderWin()");for(const node of doc.querySelectorAll('.eclipse-bag-capacity'))assert.match(node.textContent,/124 \/ 1000/);
});
test('search focus, caret and filter survive currency and quest updates',()=>{
 ev(`S.inv=Array.from({length:12},(_,i)=>({...S.eq.weapon,id:9000+i,cards:[],aff:[]}));tabs.push('equip');renderWin()`);
 const search=doc.querySelector('[data-eclipse-search]');search.focus();search.value='s';search.dispatchEvent(new g.window.Event('input',{bubbles:true}));search.setSelectionRange(1,1);
 const quest=doc.querySelector('#qp .quest-tabs button');
 ev('S.zeny+=1234;questEvent("kill",4);ui()');
 assert.equal(doc.querySelector('[data-eclipse-search]'),search);assert.equal(doc.activeElement,search);assert.equal(search.selectionStart,1);assert.equal(search.value,'s');assert.equal(doc.querySelector('#qp .quest-tabs button'),quest);
});
test('closing inventory resets view; auto-equip and auto-sale retain authoritative results',()=>{
 ev(`tabs.push('equip');renderWin();collect({...S.eq.weapon,id:20001,val:200,cards:[],aff:[]});tabs.length=0;renderWin();tabs.push('equip');renderWin()`);
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
 assert.equal(ev('tabs.join()'),'equip');assert.ok(doc.querySelector('.fit[data-a=selb]'));doc.querySelector('.fit[data-a=selb]').click();assert.notEqual(ev('S.eq.weapon.id'),21001);doc.querySelector('[data-a=equip][data-v="21001"]').click();assert.equal(ev('S.eq.weapon.id'),21001);assert.ok(doc.querySelector('#eclipseDoll'));
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
test('PR review: password visibility keeps a stable accessible name',()=>{
 const button=doc.getElementById('eclipseShowPassword'),name=button.getAttribute('aria-label');
 button.click();assert.equal(button.getAttribute('aria-label'),name);assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(doc.getElementById('password').type,'text');button.click();
});
test('PR review: returned equipment is visible immediately while new drops wait',()=>{
 ev(`tabs.push('equip');S.inv=[{...S.eq.weapon,id:41001}];renderWin();window.oldWeapon=S.eq.weapon.id;equipIn('weapon',41001)`);
 assert.ok(doc.querySelector('[data-tip="'+ev('window.oldWeapon')+'"]'));
 ev(`ACT.unequip('weapon')`);assert.ok(doc.querySelector('[data-tip="41001"]'));
 ev(`collect({...S.inv[0],id:41002});renderWin()`);assert.equal(doc.querySelector('[data-tip="41002"]'),null);
});
test('PR review: duplicate restored IDs use the same first item as sale handlers',()=>{
 ev(`S.inv=[{...S.eq.weapon,id:42001,name:'First item'},{...S.eq.weapon,id:42001,name:'Second item'}];tabs.push('equip');renderWin()`);
 assert.equal(ev('eclipseVisibleInventory().length'),1);assert.equal(ev('eclipseVisibleInventory()[0]===S.inv[0]'),true);
});
test('PR review: market navigation is visible and cannot exit a ranked run',()=>{
 ev(`tabs.push('market');renderWin()`);
 const market=doc.querySelector('[data-win=market]');assert.equal(market.querySelector('[data-v="market:echo"]').closest('details'),null);assert.equal(market.querySelector('[data-a=openreforge]').closest('details'),null);assert.doesNotMatch(market.textContent,/Wear equipment with affixes/);
 ev(`sub.market='echo';S.shards=10000;TRIAL.on=true;TRIAL.mode='ranked';renderWin()`);
 const trialBefore=ev('JSON.stringify(TRIAL)');assert.equal(market.querySelector('[data-trial]'),null);
 market.querySelector('[data-buy=ori]').click();assert.equal(ev('JSON.stringify(TRIAL)'),trialBefore);assert.equal(doc.getElementById('trialOverlay')?.classList.contains('on')||false,false);
 market.querySelector('[data-buy=nmgear]').click();assert.ok(market.querySelector('[data-nmmap]'));assert.equal(market.querySelector('[data-trial]'),null);
 market.querySelector('[data-nmmap="0"]').click();assert.ok(market.querySelector('[data-buy=ori]'));assert.equal(ev('JSON.stringify(TRIAL)'),trialBefore);ev('TRIAL.on=false');
});
test('PR review: paid offers stay visible across selection, reload and unequip',()=>{
 ev(`S.eq.armor={...S.eq.weapon,id:43001,slot:'armor',wt:null,aff:[{k:'str',v:10}]};S.eq.weapon.aff=[{k:'str',v:10}];tabs.push('equip');sub.equip='reforge';reforge('armor',true);selE='weapon';renderWin()`);
 let offer=doc.querySelector('.reforge-offer');assert.ok(offer);assert.equal(offer.closest('details'),null);
 ev(`S.inv.push(S.eq.armor);S.eq.armor=null;renderWin()`);offer=doc.querySelector('.reforge-offer');assert.ok(offer);assert.equal(offer.closest('details'),null);offer.querySelector('[data-v=no]').click();assert.equal(ev('!!S.reforgePending'),false);
});
test('PR review: scroll controls are unique and Nightmare has five stage markers',()=>{
 ev(`tabs.push('equip');sub.equip='refine';renderWin()`);assert.equal(doc.querySelectorAll('[data-a=refprotect]').length,2);
 ev(`S.lvl=13;renderQ();window.eclipseRealBars()`);assert.match(doc.getElementById('eclipseMapStage').textContent,/Nightmare.*Stage 3/);assert.equal(doc.querySelectorAll('#eclipseStagePips i').length,5);assert.equal(doc.querySelectorAll('#eclipseStagePips .done').length,2);assert.equal(doc.querySelectorAll('#eclipseStagePips .now').length,1);
 ev(`S.lvl=1;window.eclipseRealBars()`);assert.equal(doc.querySelectorAll('#eclipseStagePips i').length,10);
});
test('PR review: reordered keyed siblings retain distinct original nodes',()=>{
 const root=doc.createElement('div'),next=doc.createElement('div');root.innerHTML='<button data-a="a">A</button><button data-a="b">B</button>';const [a,b]=root.children;
 next.innerHTML='<button data-a="b">B2</button><button data-a="a">A2</button>';g.window.eclipseTestRoot=root;g.window.eclipseTestNext=next;ev('eclipsePatch(window.eclipseTestRoot,window.eclipseTestNext)');assert.equal(root.children[0],b);assert.equal(root.children[1],a);
});
test('Eclipse shell uses real currencies, experience, pets and compact journal navigation',()=>{
 ev(`S.shards=123;S.exp=42;S.pets=[{id:50001,sp:0,on:true,mut:2,eq:[0,0,0],skills:[]}];window.eclipseRealBars();renderWin()`);
 assert.equal(doc.getElementById('eclipseShards').textContent,'123');assert.match(doc.getElementById('eclipseBaseValue').textContent,/42 \/ /);assert.equal(doc.querySelectorAll('#eclipsePetStrip button').length,1);
 assert.equal(doc.querySelectorAll('#dock > [data-t]').length,11);assert.ok(doc.querySelector('#dock [data-t=wardrobe]'));assert.equal(doc.querySelector('#dock [data-t=index]'),null);doc.querySelector('#dock .eclipse-more').click();assert.ok(doc.getElementById('sideMenu').classList.contains('eclipse-more-open'));assert.ok(doc.querySelector('#sideLinks [data-t=index]'));
 ev('qOpen=true;eclipseQuestAll=false;renderQ()');assert.equal(doc.querySelectorAll('#qp .quest-entry').length,3);doc.querySelector('[data-q=viewall]').click();assert.ok(doc.querySelectorAll('#qp .quest-entry').length>3);
});
test('card collection tiles expose names and retain keyboard selection',()=>{
 ev(`S.cards=CARD_CATALOG.slice(0,2).map(c=>newCard(c));tabs.push('bag');sub.bag='cards';renderWin()`);
 const tile=[...doc.querySelectorAll('.eclipse-card-grid [data-a=selc]')].find(t=>t.textContent.includes('Poring'));assert.ok(tile);tile.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(doc.querySelector('[data-win=bag] .ui-inspector').textContent.includes('Poring'));
});
test('class paths focus one lineage and keep inspection separate from switching',()=>{
 ev("S=fresh();S.cls='Lord Knight';S.jobs['Lord Knight']={jl:50,jx:0};selK=null;tabs.push('job');renderWin()");
 const before=ev('JSON.stringify(S)');assert.equal(doc.querySelectorAll('.class-lineage-overview [data-a=selk]').length,25);doc.querySelector('[data-a=jobview][data-v=browse]').click();assert.equal(doc.querySelectorAll('.class-path-tabs button').length,6);doc.querySelector('.class-path-tabs [data-v=Swordman]').click();
 assert.equal(doc.querySelectorAll('.class-path-track [data-a=selk]').length,4);
 doc.querySelector('.class-path-tabs [data-v=Mage]').click();assert.equal(ev('selK'),'Mage');
 doc.querySelector('.class-path-track [data-v=Wizard]').click();assert.equal(ev('JSON.stringify(S)'),before);
 assert.ok(doc.querySelector('[data-a=job][data-v=Wizard]').disabled);
 doc.querySelector('.class-path-track [data-v=Warlock]').click();assert.match(doc.querySelector('.class-path-focus').textContent,/Enter advancement trial/);
 assert.match(doc.querySelector('.class-path-focus').textContent,/High Wizard Job Lv 50/);
 assert.ok(doc.querySelector('[data-a=job][data-v=Warlock]').disabled);assert.equal(ev('CLASSES.Warlock.tier'),4);
 doc.querySelector('.class-path-tabs [data-v=Swordman]').click();assert.equal(doc.querySelector('.class-path-track [data-v=Warlock]'),null);assert.equal(doc.querySelectorAll('.class-path-track .tn').length,4);doc.querySelector('.class-path-tabs [data-v=Swordman]').click();assert.equal(doc.querySelector('.class-path-track'),null);assert.equal(ev('JSON.stringify(S)'),before);
});
test('selected path shows current, played, available and locked states',()=>{
 ev("S=fresh();S.cls='Mage';S.jobs={Novice:{jl:10,jx:0},Mage:{jl:40,jx:0},Swordman:{jl:20,jx:0}};S.base={Swordman:{lv:40}};selK=null;tabs.push('job');renderWin()");
 ev("eclipseJobsBrowse=false;renderWin()");doc.querySelector('[data-a=jobview][data-v=browse]').click();doc.querySelector('.class-path-tabs [data-v=Mage]').click();
 const status=n=>doc.querySelector('.class-path-track [data-v="'+n+'"]');
 assert.equal(status('Mage').dataset.classStatus,'cur');assert.equal(status('Wizard').dataset.classStatus,'ok');assert.equal(status('High Wizard').dataset.classStatus,'lock');
 doc.querySelector('.class-path-tabs [data-v=Swordman]').click();assert.equal(status('Swordman').dataset.classStatus,'played');
 doc.querySelector('.class-path-tabs [data-v=Mage]').click();status('Wizard').click();doc.querySelector('[data-a=job][data-v=Wizard]').click();
 assert.equal(ev('S.cls'),'Wizard');assert.equal(status('Wizard').dataset.classStatus,'cur');assert.equal(status('Mage').dataset.classStatus,'played');
});
test('Novice restart is disclosed once and keeps confirmation',()=>{
 ev("S.cls='Mage';S.jobs.Mage={jl:40,jx:0};selK=null;tabs.push('job');renderWin()");
 const button=doc.querySelector('[data-a=job][data-v=Novice].full');assert.ok(button.closest('details'));assert.equal(button.disabled,false);
 button.closest('details').open=true;button.click();assert.equal(doc.getElementById('modal').style.display,'flex');doc.getElementById('mn').click();assert.equal(ev('S.cls'),'Mage');
 button.click();doc.getElementById('my').click();assert.equal(ev('S.cls'),'Novice');assert.equal(ev('S.lv'),25);assert.equal(doc.querySelectorAll('[data-a=job][data-v=Novice].full').length,1);
 assert.equal(doc.querySelector('[data-a=job][data-v=Novice].full').disabled,true);
});
test('pet cards preserve training, skills and deployment controls',()=>{
 ev(`S.pets=[{id:91001,sp:0,mut:0,eq:[0,1,2],skills:[],on:true},{id:91002,sp:1,mut:0,eq:[0,0,0],skills:[],on:false}];selP=null;sub.pet='party';tabs.push('pet');renderWin()`);
 assert.equal(doc.querySelectorAll('.eclipse-companion-card:not([hidden])').length,3);assert.match(doc.querySelector('.eclipse-companion-card').textContent,/3 \/ 15/);
 const before=ev('JSON.stringify(S)');doc.querySelector('[data-v="pet:collection"]').click();assert.equal(doc.querySelectorAll('.eclipse-companion-card:not([hidden])').length,2);
 doc.querySelector('[data-a=selp][data-v="91002"]').dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(ev('sub.pet'),'manage');assert.equal(ev('selP'),91002);assert.equal(ev('JSON.stringify(S)'),before);
 for(const a of ['peq','pskill','pon','prel','proll','pauto','psk'])assert.ok(doc.querySelector('.ui-inspector [data-a='+a+']'),a);
 doc.querySelector('.ui-inspector [data-a=pon]').click();assert.equal(ev('gp(91002).on'),true);doc.querySelector('[data-v="pet:party"]').click();assert.match(doc.querySelector('.eclipse-pet-tabs').textContent,/2 \/ 3/);
});
test('supplies cards buy entered quantities and expose the inline Echo store',()=>{
 ev(`tabs.push('market');renderWin()`);assert.equal(doc.querySelectorAll('.eclipse-product').length,4);
 const qty=doc.getElementById('oreQty-ori');qty.value='7';qty.dispatchEvent(new g.window.Event('input',{bubbles:true}));const before=ev('S.zeny');
 doc.querySelector('[data-a=bmore][data-v=ori]').click();assert.equal(ev('S.ore.ori'),1007);assert.equal(ev('S.zeny'),before-700000);
 doc.querySelector('.eclipse-product [data-v="market:echo"]').click();assert.equal(ev('sub.market'),'echo');assert.ok(doc.querySelector('[data-buy=ori]'));
});
test('atlas refreshes selected field without moving the character',()=>{
 ev(`mapM=0;mapL=1;tabs.push('map');renderWin()`);const before=ev('JSON.stringify(S)');
 doc.querySelector('[data-a=selm][data-v="3"]').click();assert.equal(ev('mapM'),3);assert.match(doc.querySelector('.eclipse-atlas-hero').textContent,/Morroc/);
 doc.querySelector('[data-a=sell_][data-v="12"]').click();assert.equal(ev('mapL'),12);assert.equal(doc.querySelector('[data-a=sell_][aria-pressed=true]').dataset.v,'12');assert.match(doc.querySelector('.ui-field-guide').textContent,/Nightmare.*Stage 2/);assert.equal(ev('JSON.stringify(S)'),before);
 assert.equal(doc.querySelectorAll('.eclipse-stages:not(.eclipse-nightmare) button').length,10);assert.equal(doc.querySelectorAll('.eclipse-nightmare button').length,5);assert.equal(doc.querySelector('.ui-route [data-trial=lobby]'),null);doc.querySelector('#map-tab-echo').click();assert.ok(doc.querySelector('#map-panel-echo [data-trial=lobby]'));ev("mapSeason='atlas'");
});
test('refine feedback follows success, safe failure, protection and rank loss',()=>{
 ev(`tabs.push('equip');sub.equip='refine';window.refineRandom=Math.random;window.refineRolls=0;Math.random=()=>{window.refineRolls++;return 0};S.eq.weapon.r=5;S.useRefineScroll=false;S.dps=0;renderWin()`);
 const ore=ev('S.ore.ori'),cost=ev('refCost(S.eq.weapon)'),need=ev('refOre(S.eq.weapon)'),zeny=ev('S.zeny');doc.querySelector('[data-a=refine]').click();
 assert.equal(ev('S.eq.weapon.r'),6);assert.equal(ev('S.ore.ori'),ore-need);assert.equal(ev('S.zeny'),zeny-cost);assert.equal(ev('window.refineRolls'),1);assert.ok(doc.getElementById('eclipseRefineResult').classList.contains('refine-success'));assert.match(doc.getElementById('eclipseRefineResult').textContent,/\+5 → \+6/);
 ev(`Math.random=()=>.999;refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),5);assert.ok(doc.getElementById('eclipseRefineResult').classList.contains('refine-failure'));assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank reduced/);
 ev(`S.useRefineScroll=true;S.refineScrollFrom=5;S.refineScrolls=1;S.dps=1;refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),5);assert.equal(ev('S.refineScrolls'),0);assert.equal(ev('S.dps'),1);assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank kept at \+5/);
 ev(`S.useRefineScroll=false;S.refineScrolls=1;refine('weapon')`);assert.equal(ev('S.refineScrolls'),1);assert.equal(ev('S.eq.weapon.r'),4);
 ev(`S.eq.weapon.r=3;refine('weapon')`);assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank kept at \+3/);
 ev(`clearTimeout(eclipseRefineTimer);$('eclipseRefineResult').hidden=true;S.zeny=0;refine('weapon');Math.random=window.refineRandom`);assert.equal(doc.getElementById('eclipseRefineResult').hidden,true);
});

test('screen companion shortcuts open pets and party cards deploy, swap and remove',()=>{
 ev(`S.pets=[0,1,2,3].map((sp,i)=>({id:92000+i,sp,mut:0,eq:[0,0,0],skills:[],on:i<3}));window.eclipseRealBars()`);
 doc.querySelector('#eclipseCompanions > [data-t=pet]').click();assert.ok(doc.querySelector('[data-win=pet]'));
 doc.querySelector('[data-v="pet:collection"]').click();
 const select=doc.querySelector('[data-pet-replace="92003"]');select.value='92001';
 doc.querySelector('[data-a=pswap][data-v="92003"]').click();assert.equal(ev('gp(92003).on'),true);assert.equal(ev('gp(92001).on'),false);assert.equal(ev('S.pets.filter(p=>p.on).length'),3);
 ev('ACT.pswap(99999)');assert.equal(ev('S.pets.filter(p=>p.on).length'),3);
 doc.querySelector('.eclipse-pet-deployment [data-a=pon][data-v="92003"]').click();assert.equal(ev('gp(92003).on'),false);
 doc.querySelector('.eclipse-pet-deployment [data-a=pon][data-v="92001"]').click();assert.equal(ev('gp(92001).on'),true);
 ev('tabs.length=0;renderWin();window.eclipseRealBars()');doc.querySelector('#eclipsePetStrip button').click();assert.ok(doc.querySelector('[data-win=pet]'));
});
test('gear groups by type then rarity within the same name without mutating inventory',()=>{
 ev(`S.inv=[{...S.eq.weapon,id:93001,sec:5,slot:'armor'},{...S.eq.weapon,id:93002,sec:0},{...S.eq.weapon,id:93003,sec:5},{...S.eq.weapon,id:93004,sec:4,locked:true}];tabs.push('equip');renderWin()`);
 assert.deepEqual([...doc.querySelectorAll('.eclipse-bag .grid [data-tip]')].map(n=>n.dataset.tip),['93003','93004','93002','93001']);
 assert.equal(ev('S.inv.map(it=>it.id).join()'),'93001,93002,93003,93004');
});
test('compact skills open the selected inspector with working auto-cast',()=>{
 ev(`tabs.push('skills');renderWin()`);
 const tile=doc.querySelector('.sk[data-v=aid]');
 assert.equal(tile.querySelector('[data-skill-detail]'),null,'tiles stay compact');
 tile.click();
 let inspector=doc.querySelector('[data-win=skills] .ui-selected-skill');
 assert.ok(inspector.querySelector('[data-skill-detail=aid]'));
 inspector.querySelector('[data-a=sktog]').click();assert.equal(ev('skOff("aid")'),true);
 inspector=doc.querySelector('[data-win=skills] .ui-selected-skill');
 inspector.querySelector('[data-a=sktog]').click();assert.equal(ev('skOff("aid")'),false);
});
test('refinement animates the shown equipment, cards have card icons and market has no guide',()=>{
 ev(`tabs.push('equip');sub.equip='refine';renderWin();eclipseRefineFeedback(S.eq.weapon,0,true)`);
 const result=doc.getElementById('eclipseRefineResult');assert.ok(result.closest('.eclipse-workshop-stage'));assert.equal(result.querySelectorAll('.eclipse-result-art').length,1);
 ev(`tabs.splice(0,tabs.length,'bag');sub.bag='cards';S.cards=[newCard(CARD_CATALOG[0])];renderWin()`);assert.ok(doc.querySelector('.eclipse-card-grid [data-ui-icon=cards]'));
 ev(`tabs.splice(0,tabs.length,'market');renderWin()`);assert.equal(doc.querySelector('[data-win=market] [data-t=guide]'),null);
});

test('journal starts collapsed and remains independently expandable',()=>{
 assert.equal(g.window.eclipseInitialQuestOpen,false);ev('qOpen=false;renderQ()');assert.equal(doc.querySelector('#qp .quest-entry'),null);doc.querySelector('[data-q=t]').click();assert.ok(doc.querySelector('#qp .quest-entry'));assert.equal(ev('qOpen'),true);
});
test('protection On/Off confirms below +5 and never spends on cancel or stale confirmation',()=>{
 ev(`tabs.push('equip');sub.equip='refine';S.eq.weapon.r=3;S.refineScrolls=4;renderWin();ACT.refprotect('1')`);
 assert.equal(doc.querySelectorAll('[data-a=refprotect]').length,2);assert.equal(ev('S.useRefineScroll'),true);
 let before=ev('JSON.stringify(S)');doc.querySelector('[data-a=refine]').click();assert.equal(doc.getElementById('modal').style.display,'flex');assert.match(doc.getElementById('mt').textContent,/below \+5/);assert.equal(ev('JSON.stringify(S)'),before);doc.getElementById('mn').click();assert.equal(ev('JSON.stringify(S)'),before);
 ev('refine("weapon")');const cost=ev('refCost(S.eq.weapon)'),zeny=ev('S.zeny');ev('window.oldRefRandom=Math.random;Math.random=()=>0');doc.getElementById('my').click();doc.getElementById('my').click();ev('Math.random=window.oldRefRandom');assert.equal(ev('S.refineScrolls'),3);assert.equal(ev('S.eq.weapon.r'),4);assert.equal(ev('S.zeny'),zeny-cost);
 ev('refine("weapon");S.eq.weapon={...S.eq.weapon,id:990001}');before=ev('JSON.stringify(S)');doc.getElementById('my').click();assert.equal(ev('JSON.stringify(S)'),before);
 ev('refine("weapon");S.ore.ori=0');before=ev('JSON.stringify(S)');doc.getElementById('my').click();assert.equal(ev('JSON.stringify(S)'),before);
 ev(`S.ore.ori=1000;ACT.refprotect('0');window.oldRefRandom=Math.random;Math.random=()=>0;refine('weapon');Math.random=window.oldRefRandom`);assert.equal(ev('S.eq.weapon.r'),5);assert.equal(ev('S.refineScrolls'),3);
});
test('large HUD numbers are compact while the exact rates remain accessible',()=>{
 for(const [value,label] of [[800000,'800K'],[1250000,'1.3M'],[8000000000,'8B']])assert.equal(ev('eclipseMetricNumber('+value+')'),label);
 ev(`window.oldHudRate=stepHudRate;stepHudRate=()=>({kills:1,seconds:1,exp:1250000,dps:8000000000,zeny:800000});window.eclipseRealBars();stepHudRate=window.oldHudRate`);
 assert.equal(doc.getElementById('dps').textContent,'8B');assert.equal(doc.getElementById('zenymin').textContent,'800K');assert.match(doc.getElementById('dps').getAttribute('aria-label'),/8,000,000,000/);
});
test('class emblems are distinct and supplies put both ores before the scroll',()=>{
 assert.notEqual(ev("eclipseClassEmblem('Swordman')"),ev("eclipseClassEmblem('Mage')"));assert.notEqual(ev("eclipseClassEmblem('Swordman')"),ev("eclipseClassEmblem('Lord Knight')"));
 ev("tabs.push('market');renderWin()");assert.deepEqual([...doc.querySelectorAll('.eclipse-product-copy>b')].map(e=>e.textContent),['Oridecon','Elunium','Refine Protection Scroll','Echo store']);assert.match(doc.querySelector('.eclipse-product').textContent,/Owned: 1,000/);
});
test('a confirmed below-five failure consumes one scroll and keeps the rank',()=>{
 ev(`tabs.push('equip');sub.equip='refine';renderWin();S.eq.weapon.r=2;S.useRefineScroll=true;S.refineScrolls=2;refine('weapon');window.oldRefRandom=Math.random;Math.random=()=>.999`);doc.getElementById('my').click();ev('Math.random=window.oldRefRandom');assert.equal(ev('S.eq.weapon.r'),2);assert.equal(ev('S.refineScrolls'),1);assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank kept at \+2/);
});
test('class path shows one collection summary while browsing',()=>{
 ev("S.cls='Lord Knight';S.lv=100;S.base={'High Wizard':{lv:100}};selK=null;eclipseJobsBrowse=false;tabs.push('job');renderWin()");
 assert.equal(ev('collDmg()'),2);assert.equal(doc.querySelectorAll('.eclipse-class-bonus').length,1);
 assert.match(doc.querySelector('.eclipse-class-bonus').textContent,/\+2% damage/);
 doc.querySelector('.class-lineage-overview [data-v=Mage]').click();ev("S.base['High Wizard'].lv=99;renderWin()");
 assert.match(doc.querySelector('.eclipse-class-bonus').textContent,/\+1% damage/);
});
test('Ascension Forge keeps crafting and transformation controls in Eclipse',()=>{
 ev("S=fresh();S.cls='Guillotine Cross';S.lv=150;S.zeny=1e12;S.ascensionMat=[1000,1000,1000];S.inv=[{id:777,slot:'weapon',wt:'dagger',sec:5,name:'N+ Dagger',r:10,aff:[],cards:[],val:100}];sub.equip='ascension';tabs.push('equip');renderWin()");
 assert.equal(doc.querySelectorAll('[data-a=ascset]').length,6);
 assert.equal(doc.querySelectorAll('[data-ascension-item]').length,1);
 const select=doc.querySelector('[data-ascension-item]');select.value='777';select.dispatchEvent(new g.window.Event('change',{bubbles:true}));doc.querySelector('[data-a=transformasc]').click();
 assert.equal(ev('S.inv.length'),1);assert.equal(ev('S.inv[0].id'),777);
 assert.equal(ev("S.inv.filter(it=>it.sec===6&&it.wt==='dagger').length"),1);
});
test('supplies owned quantities refresh on passive drops and retain the quantity input',()=>{
 ev("tabs.push('market');S.ore.ori=999;S.ore.elu=998;S.refineScrolls=3;S.shards=9;renderWin()");
 const body=doc.querySelector('[data-win=market] .wbody'),quantity=body.querySelector('.ore-quantity');quantity.value='5';quantity.dispatchEvent(new g.window.Event('input',{bubbles:true}));
 ev('S.ore.ori=1000;S.ore.elu=1001;S.refineScrolls=4;S.shards=10;ui()');
 assert.deepEqual([...body.querySelectorAll('.eclipse-owned-count')].map(e=>e.textContent),['Owned: 1,000','Owned: 1,001','Owned: 4','Owned: 10']);
 assert.equal(body.querySelector('.ore-quantity'),quantity);assert.equal(quantity.value,'5');
 body.querySelector('[data-a=bmore][data-v=ori]').click();assert.equal(ev('S.ore.ori'),1005);assert.match(body.querySelector('.eclipse-owned-count').textContent,/1,005/);
});
console.log(`${passed} passed`);
}finally{g.close()}
